import test from 'node:test';
import assert from 'node:assert/strict';
import {
    XRPL, RELICS, MILESTONES, splitStake, normalizeStake, applyEvents, pendingEarn, plausibleScore,
    settleRun, resolveEpoch, roundXrp
} from '../server/src/economy.mjs';

test('normalizeStake snaps to coin multiples and clamps', () => {
    assert.equal(normalizeStake(0.5), 0.5);
    assert.equal(normalizeStake(1), 1);
    assert.equal(normalizeStake(1.4), 1.5);
    assert.equal(normalizeStake(0), 0.5);
    assert.equal(normalizeStake(99), roundXrp(XRPL.MAX_STAKE_COINS * XRPL.COIN_XRP));
});

const NOW = 1_800_000_000_000;
const STARTED = NOW - 120_000; // 2 minutes of play

function counters(over = {}) {
    return { drops: 0, slashes: 0, relics: {}, level: 1, ...over };
}

function bags(over = {}) {
    return { jackpot: 2, topN: 1, milestones: 1, reserve: 1, dev: 0, ...over };
}

test('splitStake mirrors the published STAKE_SPLIT and sums back to the stake', () => {
    const parts = splitStake(0.5);
    assert.equal(parts.earn, 0.35);
    assert.equal(parts.jackpot, 0.04);
    assert.equal(parts.topN, 0.02);
    assert.equal(parts.milestones, 0.015);
    assert.equal(parts.dev, 0.05);
    assert.equal(parts.reserve, 0.025);
    const total = roundXrp(Object.values(parts).reduce((a, b) => a + b, 0));
    assert.equal(total, 0.5);
});

test('applyEvents enforces drop rate, slash cap, and the relic whitelist', () => {
    const events = [];
    for (let i = 0; i < 2000; i++) events.push({ t: 'drop' });
    for (let i = 0; i < 99; i++) events.push({ t: 'slash', name: 'Bitwaddle' });
    events.push({ t: 'relic', name: 'Mist Shard' });
    events.push({ t: 'relic', name: 'Mist Shard' });
    events.push({ t: 'relic', name: 'Mist Shard' });
    events.push({ t: 'relic', name: 'Mist Shard' });      // over per-relic cap
    events.push({ t: 'relic', name: 'Totally Fake Orb' }); // not whitelisted

    const out = applyEvents({ startedMs: STARTED, drops: 0, slashes: 0, relics: {}, level: 1 }, events, NOW);
    // 120 s of play → ceiling = 120*10 + 30 = 1230, but MAX_DROPS=900 wins at scale
    assert.ok(out.drops <= 900);
    assert.equal(out.drops, 900);
    assert.equal(out.slashes, 60);
    assert.equal(out.relics['Mist Shard'], 3);
    assert.equal(out.relics['Totally Fake Orb'], undefined);
});

test('pendingEarn clamps to the escrow', () => {
    const c = counters({ drops: 900, slashes: 60, relics: { 'Finality Orb': 3 } });
    // raw: 0.45 + 0.6 + 0.075 = 1.125 → clamp to escrow 0.35
    assert.equal(pendingEarn(c, 0.35), 0.35);
    const small = counters({ drops: 10 });
    assert.equal(pendingEarn(small, 0.35), 0.005);
});

test('plausibleScore bounds what a client may claim', () => {
    const c = counters({ drops: 100, slashes: 2, relics: { 'Hook Sigil': 1 }, level: 2 });
    // 1000 + 400 + 300 + 1000 + 400 + 500 = 3600
    assert.equal(plausibleScore(c), 3600);
});

test('settleRun: skill earn is paid from escrow; unpaid recycles to prize pools', () => {
    const res = settleRun({
        stake: 0.5,
        escrow: 0.35,
        counters: counters({ drops: 100 }),           // earned 0.05
        reportedScore: 700,
        startedMs: STARTED,
        nowMs: NOW,
        bags: bags({ milestones: 0 }),
        milestonesClaimed: new Set(MILESTONES.map((m) => m.id)) // isolate recycle math
    });
    assert.equal(res.due, 0.05);
    assert.equal(res.payout, 0.05);
    assert.equal(res.unusedEscrow, 0.3);
    // unpaid → jackpot 50% / topN 25% / milestones 15% / ops(dev) 10%
    assert.equal(res.bags.jackpot, roundXrp(2 + 0.3 * 0.50));
    assert.equal(res.bags.topN, roundXrp(1 + 0.3 * 0.25));
    assert.equal(res.bags.milestones, roundXrp(0 + 0.3 * 0.15));
    assert.equal(res.bags.dev, roundXrp(0 + 0.3 * 0.10));
    assert.equal(res.bags.reserve, 1); // reserve untouched by recycle
});

test('settleRun: payout ceiling is 1.1× the stake, boost included, score clamped', () => {
    const maxed = { drops: 900, slashes: 60, relics: { 'Finality Orb': 3 }, level: 3 };
    const res = settleRun({
        stake: 0.5,
        escrow: 0.35,
        counters: counters(maxed),
        reportedScore: 99_999_999,                     // absurd claim
        startedMs: STARTED,
        nowMs: NOW,
        bags: bags({ reserve: 10, milestones: 0 }),
        milestonesClaimed: new Set()
    });
    assert.equal(res.score, plausibleScore(maxed));    // 99M claim clamped
    // escrow 0.35 + boost min(0.55-0.35, 10*0.15, 0.5*0.1) = 0.35 + 0.05
    assert.equal(res.due, 0.4);
    assert.equal(res.boost, 0.05);
    assert.ok(res.payout <= roundXrp(0.5 * XRPL.MAX_RECLAIM_MULT));
});

test('settleRun boost: +10% of stake max, only on sector 3 + 2000 pts', () => {
    const res = settleRun({
        stake: 0.5,
        escrow: 0.35,
        counters: counters({ drops: 800, slashes: 10, level: 3 }),
        reportedScore: 5000,
        startedMs: STARTED,
        nowMs: NOW,
        bags: bags({ reserve: 10, milestones: 0 }),
        milestonesClaimed: new Set()
    });
    // earned raw 0.4+0.1=0.5 → escrow clamp 0.35; boost min(0.2, 1.5, 0.05)=0.05
    assert.equal(res.due, 0.4);
    assert.equal(res.boost, 0.05);
    assert.equal(res.bags.reserve, roundXrp(10 - 0.05)); // no unused escrow (fully earned)
});

test('settleRun: milestones pay from the milestones bag, first-to-hit only', () => {
    const res = settleRun({
        stake: 0.5,
        escrow: 0.35,
        counters: counters({ drops: 60 }),
        reportedScore: 1200,
        startedMs: STARTED,
        nowMs: NOW,
        bags: bags({ milestones: 1 }),
        milestonesClaimed: new Set(['score_1k'])       // already claimed globally
    });
    const ids = res.milestones.map((m) => m.id);
    assert.ok(ids.includes('drops_50'));
    assert.ok(!ids.includes('score_1k'));
    const milestoneTotal = roundXrp(res.milestones.reduce((a, m) => a + m.prize, 0));
    assert.equal(res.payout, roundXrp(res.due + milestoneTotal));
    assert.ok(res.bags.milestones < 1);
});

test('settleRun: runs shorter than 10 s pay nothing (anti spam-stake)', () => {
    const res = settleRun({
        stake: 0.5,
        escrow: 0.35,
        counters: counters({ drops: 20 }),
        reportedScore: 200,
        startedMs: NOW - 3000,
        nowMs: NOW,
        bags: bags({ milestones: 0 }),
        milestonesClaimed: new Set()
    });
    assert.equal(res.payout, 0);
    // Early forfeit: entire escrow recycles to prize pools (player got due=0)
    assert.equal(res.unusedEscrow, 0.35);
    assert.equal(res.bags.jackpot, roundXrp(2 + 0.35 * 0.50));
    assert.equal(res.bags.dev, roundXrp(0 + 0.35 * 0.10));
});

test('resolveEpoch pays 50/20/15 of the jackpot and splits topN across top-5', () => {
    const board = [
        { account: 'rAAA', score: 900 },
        { account: 'rBBB', score: 800 },
        { account: 'rCCC', score: 700 },
        { account: 'rDDD', score: 600 },
        { account: 'rEEE', score: 500 },
        { account: 'rFFF', score: 400 }
    ];
    const { prizes, bags: after } = resolveEpoch(board, bags({ jackpot: 10, topN: 1 }));
    const jack = prizes.filter((p) => p.kind === 'jackpot');
    assert.deepEqual(jack.map((p) => p.amount), [5, 2, 1.5]);
    assert.equal(after.jackpot, 1.5);                  // 15% seed rolls forward
    const top = prizes.filter((p) => p.kind === 'topN');
    assert.equal(top.length, 5);
    assert.equal(top[0].amount, 0.2);
    assert.equal(after.topN, 0);
});

test('resolveEpoch with an empty board rolls everything forward', () => {
    const { prizes, bags: after } = resolveEpoch([], bags({ jackpot: 7 }));
    assert.equal(prizes.length, 0);
    assert.equal(after.jackpot, 7);
});

test('relic whitelist matches the in-game LEDGER_RELICS names', () => {
    assert.deepEqual(Object.keys(RELICS), [
        'Mist Shard', 'Hook Sigil', 'Liquidity Prism', 'Beacon Crest', 'Finality Orb'
    ]);
});
