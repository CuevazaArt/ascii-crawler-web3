import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import {
    XRPL, roundXrp, splitStake, applyEvents, pendingEarn, settleRun, resolveEpoch
} from './economy.mjs';
import {
    getBags, setBags, currentEpoch, epochBoard, recordEpochScore,
    addHistory, listHistory, upsertWalletRun, alltimeBoard,
    paidInWindow, queuePayout, markPayoutPaid, pendingPayouts,
    setPayoutStatus, reviewPayouts, pruneIntents
} from './db.mjs';

const R_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const MEMO_TYPE_SCORE = 'leakrunner/scorecommit';
const MEMO_TYPE_PRIZE = 'leakrunner/epochprize';

export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * Pure-ish application layer: HTTP-agnostic handlers over { cfg, db, ledger }.
 * index.mjs adapts them to node:http; the e2e script drives them the same way.
 */
export function createApp({ cfg, db, ledger, log = console }) {
    const runToken = (runId, account) =>
        createHmac('sha256', cfg.runTokenSecret).update(`${runId}.${account}`).digest('hex');

    const checkRunAuth = (run, token) => {
        const expected = runToken(run.id, run.account);
        const a = Buffer.from(String(token || ''), 'utf8');
        const b = Buffer.from(expected, 'utf8');
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
            throw new ApiError(401, 'invalid run token');
        }
    };

    const milestonesClaimedSet = () => new Set(
        db.prepare('SELECT id FROM milestones_claimed').all().map((r) => r.id)
    );

    // ——— Epochs ———

    function ensureEpoch(now = Date.now()) {
        let epoch = currentEpoch(db);
        if (now < epoch.ends_ms) return epoch;

        // Roll over: resolve prizes from this epoch's board, then open the next one
        const board = epochBoard(db, epoch.id, 20);
        const bags = getBags(db);
        const { prizes, bags: nextBags } = resolveEpoch(board, bags);
        setBags(db, nextBags);

        for (const p of prizes) {
            queuePayout(db, {
                kind: `epoch-${p.kind}`,
                account: p.account,
                amount: p.amount,
                status: 'pending',
                note: `epoch #${epoch.id} rank #${p.rank}`
            });
        }
        db.prepare('UPDATE epochs SET resolved = 1 WHERE id = ?').run(epoch.id);
        addHistory(db, 'epoch', {
            epochId: epoch.id,
            winner: board[0]?.account || null,
            topScore: board[0]?.score || 0,
            paidJackpot: roundXrp(prizes.filter((p) => p.kind === 'jackpot').reduce((a, p) => a + p.amount, 0)),
            queued: prizes.length
        }, now);
        db.prepare('INSERT INTO epochs (started_ms, ends_ms) VALUES (?, ?)').run(now, now + cfg.epochMs);
        log.info?.(`[epoch] #${epoch.id} resolved — ${prizes.length} prize payout(s) queued${cfg.autoEpochPayout ? ' (auto-pay on)' : ' (awaiting admin approval)'}`);

        if (cfg.autoEpochPayout && prizes.length) {
            // Fire-and-forget: prize payment failures stay queued for the admin
            executePendingPayouts().catch((e) => log.error?.(`[epoch] auto payout error: ${e.message}`));
        }
        return currentEpoch(db);
    }

    async function executePendingPayouts() {
        const rows = pendingPayouts(db);
        const results = [];
        for (const row of rows) {
            try {
                const { hash } = await ledger.sendPayout({
                    account: row.account,
                    amountXrp: row.amount,
                    memoType: MEMO_TYPE_PRIZE,
                    memoData: JSON.stringify({ v: 1, kind: row.kind, note: row.note, amount: row.amount })
                });
                markPayoutPaid(db, row.id, hash);
                setBags(db, getBags(db), { paid: row.amount });
                results.push({ id: row.id, account: row.account, amount: row.amount, tx: hash, ok: true });
            } catch (e) {
                results.push({ id: row.id, account: row.account, amount: row.amount, ok: false, error: e.message });
            }
        }
        return results;
    }

    // ——— Shared snapshots ———

    function economySnapshot(now = Date.now()) {
        const epoch = ensureEpoch(now);
        const bags = getBags(db);
        return {
            network: cfg.network,
            operator: ledger.address,
            stake: XRPL.ENTRY_STAKE,
            bags: {
                jackpot: bags.jackpot,
                topN: bags.topN,
                milestones: bags.milestones,
                reserve: bags.reserve,
                dev: bags.dev
            },
            totals: { staked: bags.totalStaked, paid: bags.totalPaid },
            epoch: {
                id: epoch.id,
                startedMs: epoch.started_ms,
                endsMs: epoch.ends_ms,
                board: epochBoard(db, epoch.id, 20)
            },
            board: alltimeBoard(db, 10),
            history: listHistory(db, 12)
        };
    }

    // ——— Handlers ———

    function postIntent({ account }) {
        if (!R_ADDRESS.test(String(account || ''))) throw new ApiError(400, 'invalid r-address');
        const intentId = randomUUID();
        db.prepare('INSERT INTO intents (id, account, created_ms) VALUES (?, ?, ?)')
            .run(intentId, account, Date.now());
        return {
            intentId,
            operator: ledger.address,
            stake: XRPL.ENTRY_STAKE,
            network: cfg.network
        };
    }

    async function postStart({ account, intentId, txHash }) {
        if (!R_ADDRESS.test(String(account || ''))) throw new ApiError(400, 'invalid r-address');
        const intent = db.prepare('SELECT * FROM intents WHERE id = ?').get(String(intentId || ''));
        if (!intent || intent.account !== account) throw new ApiError(400, 'unknown run intent');
        if (intent.used) throw new ApiError(409, 'run intent already used');
        if (Date.now() - intent.created_ms > cfg.intentTtlMs) throw new ApiError(410, 'run intent expired — stake again');

        const hash = String(txHash || '').toUpperCase();
        if (!/^[A-F0-9]{64}$/.test(hash)) throw new ApiError(400, 'invalid tx hash');
        if (db.prepare('SELECT id FROM runs WHERE stake_tx = ?').get(hash)) {
            throw new ApiError(409, 'stake tx already consumed by another run');
        }

        const { deliveredXrp, ledgerIndex } = await ledger.verifyStakeTx({
            txHash: hash,
            account,
            intentId: intent.id,
            minXrp: XRPL.ENTRY_STAKE
        });

        const now = Date.now();
        const epoch = ensureEpoch(now);
        const stake = XRPL.ENTRY_STAKE;
        const parts = splitStake(stake);

        const bags = getBags(db);
        bags.jackpot = roundXrp(bags.jackpot + parts.jackpot);
        bags.topN = roundXrp(bags.topN + parts.topN);
        bags.milestones = roundXrp(bags.milestones + parts.milestones);
        bags.dev = roundXrp(bags.dev + parts.dev);
        bags.reserve = roundXrp(bags.reserve + parts.reserve);
        setBags(db, bags, { staked: stake });

        const runId = randomUUID();
        db.prepare(`
            INSERT INTO runs (id, account, intent_id, stake_tx, stake, escrow, started_ms, epoch_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(runId, account, intent.id, hash, stake, parts.earn, now, epoch.id);
        db.prepare('UPDATE intents SET used = 1 WHERE id = ?').run(intent.id);
        addHistory(db, 'stake', { account, stake, deliveredXrp, ledger: ledgerIndex }, now);

        return {
            runId,
            token: runToken(runId, account),
            escrow: parts.earn,
            stake,
            economy: economySnapshot(now)
        };
    }

    function getRunOr404(runId) {
        const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(String(runId || ''));
        if (!run) throw new ApiError(404, 'unknown run');
        return run;
    }

    function postEvents({ runId, token, events, snapshot }) {
        const run = getRunOr404(runId);
        checkRunAuth(run, token);
        if (run.state !== 'active') throw new ApiError(409, 'run is not active');

        const now = Date.now();
        if (now - run.last_event_ms < 300) throw new ApiError(429, 'event batches too frequent');
        if (Array.isArray(events) && events.length > 100) throw new ApiError(400, 'event batch too large');

        const counters = applyEvents({
            startedMs: run.started_ms,
            drops: run.drops,
            slashes: run.slashes,
            relics: JSON.parse(run.relics || '{}'),
            level: Math.max(run.level, Math.min(Number(snapshot?.level) || 1, 3))
        }, events, now);

        // Clamp before storing: plausibility bounds apply again at settle
        const snapScore = Math.min(
            Math.max(run.snapshot_score, Math.floor(Number(snapshot?.score) || 0)),
            1_000_000
        );
        db.prepare(`
            UPDATE runs SET drops = ?, slashes = ?, relics = ?, level = ?, snapshot_score = ?, last_event_ms = ?
            WHERE id = ?
        `).run(counters.drops, counters.slashes, JSON.stringify(counters.relics),
            counters.level, snapScore, now, run.id);

        return {
            ok: true,
            drops: counters.drops,
            slashes: counters.slashes,
            pending: pendingEarn(counters, run.escrow)
        };
    }

    /** Core settle used by the API handler and the stale-run reaper. */
    async function settleCore(run, reason, reportedScore) {
        // Synchronous claim of the run — prevents double settles across awaits
        const claimed = db.prepare(
            "UPDATE runs SET state = 'settling' WHERE id = ? AND state = 'active'"
        ).run(run.id);
        if (!claimed.changes) {
            const fresh = db.prepare('SELECT * FROM runs WHERE id = ?').get(run.id);
            if (fresh.state === 'settled' && fresh.settle_json) return JSON.parse(fresh.settle_json);
            if (fresh.state === 'needs-review') {
                throw new ApiError(409, 'run is under operator review — payout will be resolved manually');
            }
            throw new ApiError(409, 'settle already in progress');
        }

        try {
            const now = Date.now();
            const bags = getBags(db);
            const result = settleRun({
                stake: run.stake,
                escrow: run.escrow,
                counters: {
                    drops: run.drops,
                    slashes: run.slashes,
                    relics: JSON.parse(run.relics || '{}'),
                    level: run.level
                },
                reportedScore: Math.max(Number(reportedScore) || 0, run.snapshot_score),
                startedMs: run.started_ms,
                nowMs: now,
                bags,
                milestonesClaimed: milestonesClaimedSet()
            });

            // Daily payout ceiling (runs only; epoch prizes go through the admin queue)
            const paid24h = paidInWindow(db, now - 24 * 60 * 60 * 1000);
            const deferred = result.payout > 0 && (paid24h + result.payout) > cfg.dailyPayoutCapXrp;

            const memoData = JSON.stringify({
                v: 1,
                game: 'leakrunner',
                account: run.account,
                score: result.score,
                drops: result.drops,
                relics: result.relicCount,
                reason,
                run: run.id.slice(0, 8)
            });

            let txHash = null;
            let ledgerIndex = 0;
            if (result.payout > 0 && !deferred) {
                // Crash safety: record the intent-to-pay BEFORE submitting. If the
                // process dies mid-send, boot recovery parks this run for manual
                // review instead of ever re-paying it.
                const sendingId = queuePayout(db, {
                    kind: 'run', account: run.account, amount: result.payout,
                    status: 'sending', note: run.id
                });
                let sent;
                try {
                    sent = await ledger.sendPayout({
                        account: run.account,
                        amountXrp: result.payout,
                        memoType: MEMO_TYPE_SCORE,
                        memoData
                    });
                } catch (e) {
                    // Outcome unknown (ws drop, timeout…): park it, never retry blindly
                    setPayoutStatus(db, sendingId, 'review');
                    db.prepare("UPDATE runs SET state = 'needs-review' WHERE id = ?").run(run.id);
                    addHistory(db, 'alert', { label: `Run ${run.id.slice(0, 8)} payout needs review: ${e.message}` });
                    log.error?.(`[settle] payout uncertain for run ${run.id}: ${e.message}`);
                    throw new ApiError(503, 'payout submission uncertain — the operator will resolve this run manually');
                }
                txHash = sent.hash;
                ledgerIndex = sent.ledgerIndex;
                markPayoutPaid(db, sendingId, txHash);
                db.prepare('UPDATE payouts SET note = ? WHERE id = ?').run(reason, sendingId);
            } else if (result.payout > 0 && deferred) {
                queuePayout(db, {
                    kind: 'run-deferred', account: run.account, amount: result.payout,
                    status: 'pending', note: `daily payout cap ${cfg.dailyPayoutCapXrp} XRP reached`
                });
                log.warn?.(`[cap] deferring ${result.payout} XRP payout to ${run.account} (24h cap)`);
            } else if (cfg.memoOnZero) {
                try {
                    const sent = await ledger.sendScoreMemo({ memoType: MEMO_TYPE_SCORE, memoData });
                    txHash = sent.hash;
                    ledgerIndex = sent.ledgerIndex;
                } catch (e) {
                    log.warn?.(`[memo] zero-payout ScoreCommit failed: ${e.message}`);
                }
            }

            // Persist economy + boards
            const prevBest = db.prepare('SELECT high_score FROM wallets WHERE account = ?')
                .get(run.account)?.high_score || 0;
            const isRecord = result.score > prevBest;

            for (const m of result.milestones) {
                db.prepare('INSERT INTO milestones_claimed (id, account, prize, ts) VALUES (?, ?, ?, ?)')
                    .run(m.id, run.account, m.prize, now);
                addHistory(db, 'milestone', { id: m.id, label: m.label, account: run.account, prize: m.prize }, now);
            }
            setBags(db, result.bags, {
                paid: deferred ? 0 : result.payout,
                profit: result.unusedEscrow
            });
            const best = upsertWalletRun(db, run.account, {
                score: result.score,
                drops: result.drops,
                relics: result.relicCount,
                earned: deferred ? 0 : result.payout,
                ledger: ledgerIndex,
                ts: now
            });
            recordEpochScore(db, run.epoch_id, run.account, result.score, result.drops, now);
            addHistory(db, 'run', {
                account: run.account,
                score: result.score,
                drops: result.drops,
                payout: result.payout,
                reason,
                epochId: run.epoch_id
            }, now);

            const response = {
                ok: true,
                reason,
                payout: result.payout,
                deferred,
                txHash,
                score: result.score,
                drops: result.drops,
                relics: result.relicCount,
                best,
                isRecord,
                milestones: result.milestones,
                economy: economySnapshot(now)
            };
            db.prepare(`
                UPDATE runs SET state = 'settled', settled_ms = ?, reason = ?, payout = ?, payout_tx = ?, settle_json = ?
                WHERE id = ?
            `).run(now, reason, result.payout, txHash, JSON.stringify(response), run.id);

            // Hot-wallet health check (non-blocking)
            ledger.getBalanceXrp().then((bal) => {
                if (bal < cfg.lowBalanceAlertXrp) {
                    log.error?.(`[ALARM] operator balance ${bal} XRP below ${cfg.lowBalanceAlertXrp} XRP`);
                    addHistory(db, 'alert', { label: `Operator balance low: ${bal.toFixed(2)} XRP` });
                }
            }).catch(() => {});

            return response;
        } catch (e) {
            // Release the claim so the client (or the reaper) can retry
            db.prepare("UPDATE runs SET state = 'active' WHERE id = ? AND state = 'settling'").run(run.id);
            throw e;
        }
    }

    async function postSettle({ runId, token, reason, stats }) {
        const run = getRunOr404(runId);
        checkRunAuth(run, token);
        if (run.state === 'settled' && run.settle_json) return JSON.parse(run.settle_json);
        const why = reason === 'slash' ? 'slash' : 'cashout';
        return settleCore(run, why, stats?.score);
    }

    /** Auto-settle runs abandoned mid-game (browser closed, network lost). */
    async function reapStaleRuns(now = Date.now()) {
        const stale = db.prepare(
            "SELECT * FROM runs WHERE state = 'active' AND started_ms < ?"
        ).all(now - cfg.runTtlMs);
        for (const run of stale) {
            try {
                await settleCore(run, 'expired', run.snapshot_score);
                log.info?.(`[reaper] settled stale run ${run.id.slice(0, 8)} (${run.account})`);
            } catch (e) {
                log.warn?.(`[reaper] could not settle ${run.id.slice(0, 8)}: ${e.message}`);
            }
        }
        pruneIntents(db, now - cfg.intentTtlMs * 2);
    }

    /**
     * Boot recovery after a crash. Two cases:
     * - payouts stuck in 'sending': the Payment may or may not have reached the
     *   ledger → park run + payout for manual review (never auto re-pay).
     * - runs stuck in 'settling' with no 'sending' payout: nothing was submitted
     *   → safely reopen them so the reaper or the player can settle again.
     */
    function recoverInterrupted() {
        const stuckPays = db.prepare("SELECT * FROM payouts WHERE status = 'sending'").all();
        for (const p of stuckPays) {
            setPayoutStatus(db, p.id, 'review');
            if (p.kind === 'run' && p.note) {
                db.prepare("UPDATE runs SET state = 'needs-review' WHERE id = ? AND state != 'settled'").run(p.note);
            }
            addHistory(db, 'alert', { label: `Interrupted payout #${p.id} (${p.amount} XRP) parked for review` });
            log.error?.(`[recover] payout #${p.id} → review (${p.amount} XRP to ${p.account})`);
        }
        const reopened = db.prepare(
            "UPDATE runs SET state = 'active' WHERE state = 'settling'"
        ).run();
        if (reopened.changes) log.warn?.(`[recover] reopened ${reopened.changes} interrupted settle(s)`);
        return { parked: stuckPays.length, reopened: reopened.changes };
    }

    function getLeaderboard() {
        return economySnapshot();
    }

    async function getHealth() {
        let balance = null;
        try { balance = await ledger.getBalanceXrp(); } catch { /* node offline */ }
        return {
            ok: true,
            network: cfg.network,
            operator: ledger.address,
            operatorBalance: balance,
            paid24h: paidInWindow(db, Date.now() - 24 * 60 * 60 * 1000),
            dailyCap: cfg.dailyPayoutCapXrp,
            epoch: currentEpoch(db).id
        };
    }

    const checkAdmin = (token) => {
        if (String(token || '') !== cfg.adminToken) throw new ApiError(401, 'bad admin token');
    };

    function adminPending({ token }) {
        checkAdmin(token);
        return {
            pending: pendingPayouts(db),          // safe to approve (never submitted)
            review: reviewPayouts(db),            // outcome unknown — verify on-ledger first
            needsReview: db.prepare("SELECT id, account, payout, reason FROM runs WHERE state = 'needs-review'").all()
        };
    }

    async function adminApprove({ token }) {
        checkAdmin(token);
        const results = await executePendingPayouts();
        return { results };
    }

    return {
        postIntent,
        postStart,
        postEvents,
        postSettle,
        getLeaderboard,
        getHealth,
        adminPending,
        adminApprove,
        ensureEpoch,
        reapStaleRuns,
        recoverInterrupted,
        executePendingPayouts,
        runToken
    };
}
