/**
 * One-shot: play a funded run with a disposable player seed against the local API.
 *   PLAYER_SEED=sEd... node scripts/try-player-seed.mjs
 * Do not commit secrets. Testnet only.
 */
import assert from 'node:assert/strict';
import xrpl from 'xrpl';
import { XRPL } from '../src/economy.mjs';

const API = (process.env.API_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const SEED = (process.env.PLAYER_SEED || '').trim();
const WSS = 'wss://s.altnet.rippletest.net:51233';
const EXPLORER = 'https://testnet.xrpl.org';

async function api(path, body) {
    const res = await fetch(API + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${path} → ${res.status}`);
    return data;
}

async function main() {
    const health = await api('/api/health');
    console.log('API operator', health.operator, 'bal', health.operatorBalance);

    const client = new xrpl.Client(WSS);
    await client.connect();

    let player;
    if (SEED) {
        player = xrpl.Wallet.fromSeed(SEED);
        console.log('Player (from PLAYER_SEED)', player.address);
        let bal = 0;
        try { bal = Number(await client.getXrpBalance(player.address)); } catch { bal = 0; }
        console.log('Player balance', bal, 'XRP');
        if (bal < XRPL.ENTRY_STAKE + 1.01) {
            console.log('Funding from faucet…');
            await client.fundWallet(player);
            bal = Number(await client.getXrpBalance(player.address));
            console.log('Player balance after faucet', bal, 'XRP');
        }
    } else {
        console.log('No PLAYER_SEED — creating a fresh faucet wallet…');
        const funded = await client.fundWallet();
        player = funded.wallet;
        console.log('Player', player.address);
        console.log('Player balance', Number(await client.getXrpBalance(player.address)), 'XRP');
    }

    const intent = await api('/api/run/intent', { account: player.address });
    console.log('intent', intent.intentId);

    const stakeTx = await client.submitAndWait({
        TransactionType: 'Payment',
        Account: player.address,
        Destination: intent.operator,
        Amount: xrpl.xrpToDrops(XRPL.ENTRY_STAKE),
        Memos: [{
            Memo: {
                MemoType: Buffer.from('leakrunner/stake', 'utf8').toString('hex').toUpperCase(),
                MemoData: Buffer.from(intent.intentId, 'utf8').toString('hex').toUpperCase()
            }
        }]
    }, { autofill: true, wallet: player });
    assert.equal(stakeTx.result.meta.TransactionResult, 'tesSUCCESS');
    console.log('stake', `${EXPLORER}/transactions/${stakeTx.result.hash}`);

    const start = await api('/api/run/start', {
        account: player.address,
        intentId: intent.intentId,
        txHash: stakeTx.result.hash
    });
    console.log('run', start.runId, 'escrow', start.escrow);

    // Simulate a short earning run
    const events = Array.from({ length: 40 }, () => ({ t: 'drop' }));
    events.push({ t: 'slash', name: 'Bitwaddle' });
    await api('/api/run/events', {
        runId: start.runId,
        token: start.token,
        events,
        snapshot: { score: 600, level: 1, drops: 40 }
    });

    // Backdate min-run via settle still works if server started_ms is recent —
    // wait briefly then settle (server enforces 10s floor)
    console.log('waiting 11s for min-run guard…');
    await new Promise((r) => setTimeout(r, 11_000));

    const settle = await api('/api/run/settle', {
        runId: start.runId,
        token: start.token,
        reason: 'cashout',
        stats: { score: 600 }
    });
    console.log('settle payout', settle.payout, 'tx', settle.txHash
        ? `${EXPLORER}/transactions/${settle.txHash}`
        : '(none)');
    console.log('DONE');

    await client.disconnect();
}

main().catch((e) => {
    console.error('FAILED:', e.message || e);
    process.exit(1);
});
