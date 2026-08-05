/**
 * Leak Runner — full backend E2E against the real XRPL TESTNET.
 *
 * No Xaman required: a faucet-funded "player" wallet signs the stake Payment
 * directly, which exercises exactly what the browser + Xaman flow produces:
 *
 *   faucet operator + player → boot API in-process → intent → real stake tx
 *   → /run/start (on-ledger verification) → /run/events (caps) → /run/settle
 *   → real payout Payment + ScoreCommit memo → idempotent re-settle
 *   → zero-earn run settles as memo-only → leaderboard reflects both runs
 *
 * Run:  node scripts/e2e-testnet.mjs   (from server/, deps installed)
 */
import assert from 'node:assert/strict';
import xrpl from 'xrpl';
import { loadConfig } from '../src/config.mjs';
import { openDb } from '../src/db.mjs';
import { XrplService } from '../src/xrpl-service.mjs';
import { createApp } from '../src/app.mjs';
import { XRPL } from '../src/economy.mjs';

const TESTNET_WSS = 'wss://s.altnet.rippletest.net:51233';
const EXPLORER = 'https://testnet.xrpl.org';

function step(msg) {
    console.log(`\n▸ ${msg}`);
}

async function main() {
    step('Funding operator + player wallets from the testnet faucet…');
    const bootstrap = new xrpl.Client(TESTNET_WSS);
    await bootstrap.connect();
    const { wallet: operator } = await bootstrap.fundWallet();
    const { wallet: player } = await bootstrap.fundWallet();
    console.log(`  operator: ${operator.address}`);
    console.log(`  player  : ${player.address}`);

    const cfg = loadConfig({
        XRPL_NETWORK: 'testnet',
        XRPL_OPERATOR_SEED: operator.seed,
        DB_FILE: ':memory:',
        DAILY_PAYOUT_CAP_XRP: '100',
        ADMIN_TOKEN: 'e2e-admin'
    });
    const db = openDb(':memory:');
    const ledger = new XrplService({ wss: cfg.wss, seed: cfg.seed, network: cfg.network });
    const app = createApp({ cfg, db, ledger, log: console });

    // ——— Run 1: earning run with cashout payout ———

    step('Requesting run intent…');
    const intent = app.postIntent({ account: player.address });
    assert.equal(intent.operator, operator.address);
    console.log(`  intent: ${intent.intentId}`);

    step(`Player signs + submits the real ${XRPL.ENTRY_STAKE} XRP stake Payment…`);
    const stakeTx = await bootstrap.submitAndWait({
        TransactionType: 'Payment',
        Account: player.address,
        Destination: operator.address,
        Amount: xrpl.xrpToDrops(XRPL.ENTRY_STAKE),
        Memos: [{
            Memo: {
                MemoType: Buffer.from('leakrunner/stake', 'utf8').toString('hex').toUpperCase(),
                MemoData: Buffer.from(intent.intentId, 'utf8').toString('hex').toUpperCase()
            }
        }]
    }, { autofill: true, wallet: player });
    const stakeHash = stakeTx.result.hash;
    assert.equal(stakeTx.result.meta.TransactionResult, 'tesSUCCESS');
    console.log(`  stake tx: ${EXPLORER}/transactions/${stakeHash}`);

    step('POST /api/run/start — server verifies the stake on-ledger…');
    const start = await app.postStart({
        account: player.address,
        intentId: intent.intentId,
        txHash: stakeHash
    });
    assert.ok(start.runId && start.token);
    assert.equal(start.escrow, 0.35);
    console.log(`  runId: ${start.runId} · escrow ${start.escrow} XRP`);

    step('Replay guard: same stake tx must be rejected…');
    const replayIntent = app.postIntent({ account: player.address });
    await assert.rejects(
        app.postStart({ account: player.address, intentId: replayIntent.intentId, txHash: stakeHash }),
        /already consumed/
    );
    console.log('  replay rejected ✔');

    step('POST /api/run/events — 120 drops, 2 slashes, 1 relic (capped, server-side)…');
    // startedMs is "now" — backdate it so the drops/sec cap allows the batch
    db.prepare('UPDATE runs SET started_ms = ? WHERE id = ?')
        .run(Date.now() - 60_000, start.runId);
    const events = [];
    for (let i = 0; i < 120; i++) events.push({ t: 'drop' });
    events.push({ t: 'slash', name: 'Bitwaddle' }, { t: 'slash', name: 'Hatglide' });
    events.push({ t: 'relic', name: 'Mist Shard' });
    events.push({ t: 'relic', name: 'Fake Relic (must be ignored)' });
    const ev = app.postEvents({
        runId: start.runId,
        token: start.token,
        events,
        snapshot: { score: 1900, level: 2, drops: 120 }
    });
    assert.equal(ev.drops, 120);
    assert.equal(ev.slashes, 2);
    // 120*0.0005 + 2*0.01 + 0.002 = 0.082
    assert.equal(ev.pending, 0.082);
    console.log(`  pending ${ev.pending} XRP ✔ (fake relic ignored)`);

    step('POST /api/run/settle (cashout) — real payout Payment expected…');
    const playerBefore = Number(await bootstrap.getXrpBalance(player.address));
    const settle = await app.postSettle({
        runId: start.runId,
        token: start.token,
        reason: 'cashout',
        stats: { score: 1900 }
    });
    assert.equal(settle.payout, 0.082);
    assert.ok(settle.txHash, 'payout tx hash missing');
    assert.equal(settle.score, 1900);
    assert.ok(settle.milestones.some((m) => m.id === 'score_1k'), 'score_1k milestone expected');
    console.log(`  payout ${settle.payout} XRP → ${EXPLORER}/transactions/${settle.txHash}`);
    console.log(`  milestones: ${settle.milestones.map((m) => m.id).join(', ') || '—'}`);

    step('Verifying the payout Payment on-ledger…');
    const payoutTx = await bootstrap.request({ command: 'tx', transaction: settle.txHash });
    const meta = payoutTx.result.meta;
    const txj = payoutTx.result.tx_json || payoutTx.result;
    assert.equal(meta.TransactionResult, 'tesSUCCESS');
    assert.equal(txj.Destination, player.address);
    const milestoneTotal = settle.milestones.reduce((a, m) => a + m.prize, 0);
    assert.equal(Number(meta.delivered_amount) / 1e6, settle.payout);
    assert.ok(Math.abs(settle.payout - (0.082 + milestoneTotal)) < 1e-9);
    const playerAfter = Number(await bootstrap.getXrpBalance(player.address));
    assert.ok(Math.abs(playerAfter - (playerBefore + settle.payout)) < 1e-6);
    console.log(`  delivered ${settle.payout} XRP to player ✔ · balance ${playerBefore} → ${playerAfter}`);

    step('Idempotency: settling the same run again returns the cached result…');
    const settle2 = await app.postSettle({
        runId: start.runId,
        token: start.token,
        reason: 'cashout',
        stats: { score: 999999 }
    });
    assert.equal(settle2.txHash, settle.txHash);
    assert.equal(settle2.payout, settle.payout);
    console.log('  idempotent ✔ (no double payment, score tamper ignored)');

    step('Auth: settle with a bad token must be rejected…');
    await assert.rejects(
        app.postSettle({ runId: start.runId, token: 'ff'.repeat(32), reason: 'cashout', stats: {} }),
        /invalid run token/
    );
    console.log('  bad token rejected ✔');

    // ——— Run 2: instant slash (zero earn) → memo-only ScoreCommit ———

    step('Run 2: stake again, die instantly (zero earn) → memo-only ScoreCommit…');
    const intent2 = app.postIntent({ account: player.address });
    const stakeTx2 = await bootstrap.submitAndWait({
        TransactionType: 'Payment',
        Account: player.address,
        Destination: operator.address,
        Amount: xrpl.xrpToDrops(XRPL.ENTRY_STAKE),
        Memos: [{
            Memo: {
                MemoType: Buffer.from('leakrunner/stake', 'utf8').toString('hex').toUpperCase(),
                MemoData: Buffer.from(intent2.intentId, 'utf8').toString('hex').toUpperCase()
            }
        }]
    }, { autofill: true, wallet: player });
    const start2 = await app.postStart({
        account: player.address,
        intentId: intent2.intentId,
        txHash: stakeTx2.result.hash
    });
    const settleB = await app.postSettle({
        runId: start2.runId,
        token: start2.token,
        reason: 'slash',
        stats: { score: 40 }
    });
    assert.equal(settleB.payout, 0);
    assert.ok(settleB.txHash, 'zero-payout runs should still ink a ScoreCommit memo');
    console.log(`  memo tx: ${EXPLORER}/transactions/${settleB.txHash}`);

    step('GET /api/leaderboard — economy reflects both runs…');
    const lb = app.getLeaderboard();
    assert.equal(lb.totals.staked, 1);           // 2 × 0.5 stake
    assert.equal(lb.board[0].account, player.address);
    assert.equal(lb.board[0].score, 1900);
    assert.equal(lb.epoch.board[0].score, 1900);
    assert.ok(lb.bags.jackpot > 0.07);           // 2 × 0.04
    const health = await app.getHealth();
    assert.ok(health.operatorBalance > 0);
    console.log(`  staked ${lb.totals.staked} · paid ${lb.totals.paid} · jackpot ${lb.bags.jackpot}`);
    console.log(`  operator balance: ${health.operatorBalance} XRP`);

    await ledger.disconnect();
    await bootstrap.disconnect();

    console.log('\n══════════════════════════════════════════════');
    console.log('  E2E TESTNET: ALL CHECKS PASSED');
    console.log(`  operator : ${EXPLORER}/accounts/${operator.address}`);
    console.log(`  player   : ${EXPLORER}/accounts/${player.address}`);
    console.log('══════════════════════════════════════════════');
}

main().catch((e) => {
    console.error('\nE2E FAILED:', e);
    process.exit(1);
});
