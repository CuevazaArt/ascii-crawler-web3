import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/src/config.mjs';
import { openDb } from '../server/src/db.mjs';
import { createApp, ApiError } from '../server/src/app.mjs';

const PLAYER = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
const OPERATOR = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const TX = 'C'.repeat(64);

function mockLedger() {
    const calls = { payouts: [], memos: [] };
    return {
        calls,
        address: OPERATOR,
        verifyStakeTx: async ({ txHash }) => ({ deliveredXrp: 0.5, ledgerIndex: 90_000_001 }),
        sendPayout: async ({ account, amountXrp, memoData }) => {
            calls.payouts.push({ account, amountXrp, memoData });
            return { hash: 'A'.repeat(64), ledgerIndex: 90_000_002 };
        },
        sendScoreMemo: async ({ memoData }) => {
            calls.memos.push({ memoData });
            return { hash: 'B'.repeat(64), ledgerIndex: 90_000_003 };
        },
        getBalanceXrp: async () => 42
    };
}

function boot(envOver = {}) {
    const cfg = loadConfig({
        XRPL_NETWORK: 'testnet',
        XRPL_OPERATOR_SEED: 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2', // format-valid seed, never funded
        DB_FILE: ':memory:',
        ADMIN_TOKEN: 'test-admin',
        ...envOver
    });
    const db = openDb(':memory:');
    const ledger = mockLedger();
    const app = createApp({ cfg, db, ledger, log: { info() {}, warn() {}, error() {} } });
    return { cfg, db, ledger, app };
}

async function startRun(app, db) {
    const intent = app.postIntent({ account: PLAYER });
    const start = await app.postStart({ account: PLAYER, intentId: intent.intentId, txHash: TX });
    // Backdate so rate caps & the 10 s payout floor don't interfere
    db.prepare('UPDATE runs SET started_ms = ? WHERE id = ?').run(Date.now() - 60_000, start.runId);
    return start;
}

test('intent → start returns run credentials and funds the bags', async () => {
    const { app, db } = boot();
    const start = await startRun(app, db);
    assert.ok(start.runId);
    assert.match(start.token, /^[a-f0-9]{64}$/);
    assert.equal(start.escrow, 0.35);
    assert.equal(start.economy.bags.jackpot, 0.04);
    assert.equal(start.economy.totals.staked, 0.5);
    assert.equal(start.economy.operator, OPERATOR);
});

test('start rejects bad addresses, unknown intents, reused intents and reused stake txs', async () => {
    const { app, db } = boot();
    assert.throws(() => app.postIntent({ account: 'not-an-address' }), ApiError);
    await assert.rejects(
        app.postStart({ account: PLAYER, intentId: 'nope', txHash: TX }),
        /unknown run intent/
    );
    const start = await startRun(app, db);
    // same intent again
    const runRow = db.prepare('SELECT intent_id FROM runs WHERE id = ?').get(start.runId);
    await assert.rejects(
        app.postStart({ account: PLAYER, intentId: runRow.intent_id, txHash: 'D'.repeat(64) }),
        /already used/
    );
    // same stake tx with a fresh intent
    const intent2 = app.postIntent({ account: PLAYER });
    await assert.rejects(
        app.postStart({ account: PLAYER, intentId: intent2.intentId, txHash: TX }),
        /already consumed/
    );
});

test('events require the HMAC token and apply server-side caps', async () => {
    const { app, db } = boot();
    const start = await startRun(app, db);

    assert.throws(
        () => app.postEvents({ runId: start.runId, token: 'f'.repeat(64), events: [] }),
        /invalid run token/
    );

    const events = [];
    for (let i = 0; i < 80; i++) events.push({ t: 'drop' });
    events.push({ t: 'slash', name: 'Bitwaddle' });
    events.push({ t: 'relic', name: 'Mist Shard' });
    events.push({ t: 'relic', name: 'Not A Relic' });
    const res = app.postEvents({
        runId: start.runId,
        token: start.token,
        events,
        snapshot: { score: 1000, level: 2, drops: 80 }
    });
    assert.equal(res.drops, 80);
    assert.equal(res.slashes, 1);
    assert.equal(res.pending, 0.052); // 0.04 + 0.01 + 0.002
});

test('settle pays the capped earn, inks the memo, and is idempotent', async () => {
    const { app, db, ledger } = boot();
    const start = await startRun(app, db);
    app.postEvents({
        runId: start.runId,
        token: start.token,
        events: Array.from({ length: 100 }, () => ({ t: 'drop' })),
        snapshot: { score: 700, level: 1, drops: 100 }
    });

    const settle = await app.postSettle({
        runId: start.runId, token: start.token, reason: 'cashout', stats: { score: 700 }
    });
    const expected = settle.milestones.reduce((a, m) => a + m.prize, 0.05);
    assert.ok(Math.abs(settle.payout - expected) < 1e-9, `payout ${settle.payout} ≠ ${expected}`);
    assert.equal(settle.txHash, 'A'.repeat(64));
    assert.equal(settle.best, 700);
    assert.equal(settle.isRecord, true);
    assert.equal(ledger.calls.payouts.length, 1);
    const memo = JSON.parse(ledger.calls.payouts[0].memoData);
    assert.equal(memo.game, 'leakrunner');
    assert.equal(memo.score, 700);

    // Second settle: cached result, no second Payment
    const again = await app.postSettle({
        runId: start.runId, token: start.token, reason: 'cashout', stats: { score: 999999 }
    });
    assert.equal(again.txHash, settle.txHash);
    assert.equal(ledger.calls.payouts.length, 1);

    // Leaderboard reflects the run
    const lb = app.getLeaderboard();
    assert.equal(lb.board[0].account, PLAYER);
    assert.equal(lb.board[0].score, 700);
    assert.equal(lb.epoch.board[0].score, 700);
});

test('zero-earn settles ink a memo-only ScoreCommit', async () => {
    const { app, db, ledger } = boot();
    const start = await startRun(app, db);
    const settle = await app.postSettle({
        runId: start.runId, token: start.token, reason: 'slash', stats: { score: 40 }
    });
    assert.equal(settle.payout, 0);
    assert.equal(settle.txHash, 'B'.repeat(64));
    assert.equal(ledger.calls.payouts.length, 0);
    assert.equal(ledger.calls.memos.length, 1);
});

test('daily payout cap defers the Payment and queues it for the admin', async () => {
    const { app, db, ledger } = boot({ DAILY_PAYOUT_CAP_XRP: '0.01' });
    const start = await startRun(app, db);
    app.postEvents({
        runId: start.runId,
        token: start.token,
        events: Array.from({ length: 100 }, () => ({ t: 'drop' })),
        snapshot: { score: 500, level: 1, drops: 100 }
    });
    const settle = await app.postSettle({
        runId: start.runId, token: start.token, reason: 'cashout', stats: { score: 500 }
    });
    assert.equal(settle.deferred, true);
    assert.equal(ledger.calls.payouts.length, 0);
    const pending = app.adminPending({ token: 'test-admin' });
    assert.equal(pending.pending.length, 1);
    assert.equal(pending.pending[0].kind, 'run-deferred');

    // Admin approval executes the queued payout
    const approved = await app.adminApprove({ token: 'test-admin' });
    assert.equal(approved.results.length, 1);
    assert.equal(approved.results[0].ok, true);
    assert.equal(ledger.calls.payouts.length, 1);
});

test('epoch rollover queues jackpot/top-5 prizes for manual approval', async () => {
    const { app, db } = boot();
    const start = await startRun(app, db);
    app.postEvents({
        runId: start.runId,
        token: start.token,
        events: Array.from({ length: 60 }, () => ({ t: 'drop' })),
        snapshot: { score: 900, level: 1, drops: 60 }
    });
    await app.postSettle({ runId: start.runId, token: start.token, reason: 'cashout', stats: { score: 900 } });

    // Force the epoch to expire and roll over
    db.prepare('UPDATE epochs SET ends_ms = ?').run(Date.now() - 1000);
    app.ensureEpoch();

    const pending = app.adminPending({ token: 'test-admin' });
    const kinds = pending.pending.map((p) => p.kind);
    assert.ok(kinds.includes('epoch-jackpot'));
    assert.ok(kinds.includes('epoch-topN'));
    const lb = app.getLeaderboard();
    assert.ok(lb.epoch.id >= 2);
    assert.equal(lb.epoch.board.length, 0); // fresh board
});

test('stale active runs are auto-settled by the reaper', async () => {
    const { app, db } = boot();
    const start = await startRun(app, db);
    app.postEvents({
        runId: start.runId,
        token: start.token,
        events: Array.from({ length: 30 }, () => ({ t: 'drop' })),
        snapshot: { score: 300, level: 1, drops: 30 }
    });
    // Make it stale (default TTL 30 min)
    db.prepare('UPDATE runs SET started_ms = ? WHERE id = ?')
        .run(Date.now() - 31 * 60 * 1000, start.runId);
    await app.reapStaleRuns();
    const run = db.prepare('SELECT state, reason, payout FROM runs WHERE id = ?').get(start.runId);
    assert.equal(run.state, 'settled');
    assert.equal(run.reason, 'expired');
    assert.equal(run.payout > 0, true); // earned drops still paid out
});

test('admin endpoints reject a bad token', async () => {
    const { app } = boot();
    assert.throws(() => app.adminPending({ token: 'wrong' }), /bad admin token/);
    await assert.rejects(app.adminApprove({ token: 'wrong' }), /bad admin token/);
});
