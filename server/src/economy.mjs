/**
 * Leak Runner — server-authoritative economy math.
 * Mirrors the constants and settle logic the client shows (blockchain.js),
 * but the server is the source of truth: caps, plausibility and payouts
 * are computed here from server-tracked run counters, never from the client.
 *
 * Pure module: no I/O, no globals — unit-testable from tests/.
 */

export const XRPL = {
    ENTRY_STAKE: 0.5,
    DROP_REWARD: 0.0005,
    EXPLOIT_SLASH: 0.01,
    STAKE_SPLIT: {
        earn: 0.70,
        jackpot: 0.08,
        topN: 0.04,
        milestones: 0.03,
        dev: 0.10,
        reserve: 0.05
    },
    MAX_RECLAIM_MULT: 1.1,
    EPOCH_MS: 24 * 60 * 60 * 1000,
    JACKPOT_SOFT_CAP: 40,
    SCORE_HISTORY_MAX: 40
};

/** Relic whitelist — name → in-channel XRP reward + score points (game.js LEDGER_RELICS). */
export const RELICS = {
    'Mist Shard': { xrp: 0.002, score: 100 },
    'Hook Sigil': { xrp: 0.005, score: 300 },
    'Liquidity Prism': { xrp: 0.010, score: 500 },
    'Beacon Crest': { xrp: 0.015, score: 700 },
    'Finality Orb': { xrp: 0.025, score: 1000 }
};

/** First-to-hit milestone table (identical to the client's checkMilestones). */
export const MILESTONES = [
    { id: 'drops_50', label: '50 Drops harvested', rewardPct: 0.08, test: (s) => s.drops >= 50 },
    { id: 'drops_150', label: '150 Drops harvested', rewardPct: 0.12, test: (s) => s.drops >= 150 },
    { id: 'relics_3', label: '3 Relics vaulted', rewardPct: 0.15, test: (s) => s.relics >= 3 },
    { id: 'score_1k', label: '1,000 pts scored', rewardPct: 0.10, test: (s) => s.score >= 1000 },
    { id: 'score_3k', label: '3,000 pts scored', rewardPct: 0.18, test: (s) => s.score >= 3000 },
    { id: 'sector_3', label: 'Hook Alley sealed', rewardPct: 0.20, test: (s) => s.level >= 3 }
];

/** Anti-abuse caps on server-tracked counters. */
export const CAPS = {
    MAX_DROPS: 900,             // 3 sectors of dots, generous
    MAX_SLASHES: 60,
    MAX_RELIC_EACH: 3,          // one of each relic per sector, 3 sectors
    DROPS_PER_SEC: 10,          // sustained harvest rate bound
    MIN_RUN_MS_FOR_PAYOUT: 10_000,
    MAX_LEVEL: 3
};

export function roundXrp(n) {
    return Math.round(Number(n) * 1e9) / 1e9;
}

/** Split one stake into prize-bag deltas (bookkeeping; funds sit in the operator account). */
export function splitStake(stake = XRPL.ENTRY_STAKE) {
    const s = XRPL.STAKE_SPLIT;
    return {
        earn: roundXrp(stake * s.earn),
        jackpot: roundXrp(stake * s.jackpot),
        topN: roundXrp(stake * s.topN),
        milestones: roundXrp(stake * s.milestones),
        dev: roundXrp(stake * s.dev),
        reserve: roundXrp(stake * s.reserve)
    };
}

/**
 * Fold a batch of client events into server-tracked run counters, honouring caps.
 * `run`: { startedMs, drops, slashes, relics (name→count map), level }
 * Returns the updated counters (new object) — caller persists.
 */
export function applyEvents(run, events, nowMs = Date.now()) {
    const out = {
        drops: run.drops | 0,
        slashes: run.slashes | 0,
        relics: { ...(run.relics || {}) },
        level: Math.min(Math.max(run.level | 0 || 1, 1), CAPS.MAX_LEVEL)
    };
    const elapsedSec = Math.max(1, (nowMs - run.startedMs) / 1000);
    const dropCeiling = Math.min(CAPS.MAX_DROPS, Math.floor(elapsedSec * CAPS.DROPS_PER_SEC) + 30);

    for (const ev of Array.isArray(events) ? events : []) {
        if (!ev || typeof ev !== 'object') continue;
        if (ev.t === 'drop') {
            if (out.drops < dropCeiling) out.drops += 1;
        } else if (ev.t === 'slash') {
            if (out.slashes < CAPS.MAX_SLASHES) out.slashes += 1;
        } else if (ev.t === 'relic') {
            const name = String(ev.name || '');
            if (RELICS[name]) {
                const c = out.relics[name] | 0;
                if (c < CAPS.MAX_RELIC_EACH) out.relics[name] = c + 1;
            }
        }
    }
    return out;
}

/** In-channel earn accrued by the server counters, clamped to the escrow. */
export function pendingEarn(counters, escrow) {
    let sum = counters.drops * XRPL.DROP_REWARD + counters.slashes * XRPL.EXPLOIT_SLASH;
    for (const [name, count] of Object.entries(counters.relics || {})) {
        if (RELICS[name]) sum += RELICS[name].xrp * count;
    }
    return roundXrp(Math.min(sum, escrow));
}

/** Max believable score for the tracked counters (clamps client-reported score). */
export function plausibleScore(counters) {
    let relicPts = 0;
    let relicCount = 0;
    for (const [name, count] of Object.entries(counters.relics || {})) {
        if (RELICS[name]) {
            relicPts += RELICS[name].score * count;
            relicCount += count;
        }
    }
    return counters.drops * 10          // drop = 10 pts
        + counters.slashes * 200        // slash = 200 pts
        + relicPts
        + counters.level * 500          // sector seals
        + 8 * 50                        // audit certs
        + 500;                          // buffer (combos, rounding)
}

/**
 * Settle one run. Mirrors the client's settleRunPayout + checkMilestones,
 * with the server counters as ground truth.
 *
 * @param {object} p
 *   stake, escrow, counters {drops, slashes, relics, level},
 *   reportedScore, startedMs, nowMs,
 *   bags {jackpot, topN, milestones, reserve, dev},
 *   milestonesClaimed (Set of ids already claimed globally)
 * @returns {object} { payout, due, boost, unusedEscrow, score, drops, relicCount,
 *                     milestones: [{id,label,prize}], bagDeltas {reserve, dev, milestones} }
 */
export function settleRun(p) {
    const stake = p.stake ?? XRPL.ENTRY_STAKE;
    const escrow = roundXrp(p.escrow ?? stake * XRPL.STAKE_SPLIT.earn);
    const counters = p.counters;
    const nowMs = p.nowMs ?? Date.now();

    const relicCount = Object.entries(counters.relics || {})
        .reduce((acc, [name, c]) => acc + (RELICS[name] ? c : 0), 0);

    const score = Math.max(0, Math.min(
        Math.floor(Number(p.reportedScore) || 0),
        plausibleScore(counters)
    ));

    const earned = pendingEarn(counters, escrow);
    const ranLongEnough = (nowMs - p.startedMs) >= CAPS.MIN_RUN_MS_FOR_PAYOUT;
    let due = ranLongEnough ? earned : 0;

    const bags = { ...p.bags };
    const maxPayout = roundXrp(stake * XRPL.MAX_RECLAIM_MULT);
    let boost = 0;
    if (counters.level >= 3 && score >= 2000 && bags.reserve > 0.05) {
        boost = roundXrp(Math.min(maxPayout - due, bags.reserve * 0.15, stake * 0.1));
        if (boost > 0) {
            due = roundXrp(due + boost);
            bags.reserve = roundXrp(bags.reserve - boost);
        } else {
            boost = 0;
        }
    }
    due = roundXrp(Math.min(due, maxPayout));

    // House edge: whatever skill did not reclaim from escrow
    const unusedEscrow = roundXrp(Math.max(0, escrow - earned));
    if (unusedEscrow > 0) {
        bags.reserve = roundXrp(bags.reserve + unusedEscrow * 0.6);
        bags.dev = roundXrp(bags.dev + unusedEscrow * 0.4);
    }

    // First-to-hit milestones from the milestones bag
    const milestones = [];
    const stats = { score, drops: counters.drops, relics: relicCount, level: counters.level };
    for (const m of MILESTONES) {
        if (!m.test(stats)) continue;
        if (p.milestonesClaimed.has(m.id)) continue;
        if (bags.milestones < 0.01) continue;
        const prize = roundXrp(bags.milestones * m.rewardPct);
        bags.milestones = roundXrp(bags.milestones - prize);
        milestones.push({ id: m.id, label: m.label, prize });
    }
    const milestoneTotal = roundXrp(milestones.reduce((a, m) => a + m.prize, 0));

    return {
        payout: roundXrp(due + milestoneTotal),
        due,
        boost,
        unusedEscrow,
        score,
        drops: counters.drops,
        relicCount,
        milestones,
        bags
    };
}

/**
 * Resolve epoch prizes from the epoch board (top scores).
 * Returns { prizes: [{account, amount, kind, rank}], bags } — caller queues payouts.
 * Jackpot pays 50/20/15 (%), 15% stays as seed; topN bag splits evenly across top-5.
 */
export function resolveEpoch(board, bagsIn) {
    const bags = { ...bagsIn };
    const sorted = [...board].sort((a, b) => b.score - a.score);
    const prizes = [];
    if (!sorted.length) return { prizes, bags };

    const jackpot = bags.jackpot;
    [0.50, 0.20, 0.15].forEach((pct, i) => {
        if (!sorted[i] || jackpot <= 0) return;
        const amount = roundXrp(jackpot * pct);
        if (amount <= 0) return;
        prizes.push({ account: sorted[i].account, amount, kind: 'jackpot', rank: i + 1 });
    });
    const paidJackpot = roundXrp(prizes.reduce((a, x) => a + x.amount, 0));
    bags.jackpot = roundXrp(jackpot - paidJackpot);

    const topCount = Math.min(5, sorted.length);
    if (topCount && bags.topN > 0) {
        const each = roundXrp(bags.topN / topCount);
        for (let i = 0; i < topCount; i++) {
            if (each <= 0) break;
            prizes.push({ account: sorted[i].account, amount: each, kind: 'topN', rank: i + 1 });
        }
        bags.topN = 0;
    }
    return { prizes, bags };
}
