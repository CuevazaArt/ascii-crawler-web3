/**
 * Network / wallet coherence — client + operator must agree on rails,
 * and the player wallet must not be the operator hot wallet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, readRoot } from './helpers.mjs';

test('xrpl-config documents lockstep with XRPL_NETWORK', () => {
    const cfg = readRoot('xrpl-config.js');
    assert.match(cfg, /XRPL_NETWORK/);
    assert.match(cfg, /network:\s*'testnet'/);
    assert.match(cfg, /testnet\.xrpl-labs\.com/);
});

test('normalizeNetwork collapses Xaman / env aliases', () => {
    const { window, dispose } = loadApp();
    try {
        const n = (v) => window.xrplLive.normalizeNetwork(v);
        assert.equal(n('testnet'), 'TESTNET');
        assert.equal(n('TESTNET'), 'TESTNET');
        assert.equal(n('AltNet'), 'TESTNET');
        assert.equal(n('mainnet'), 'MAINNET');
        assert.equal(n('Livenet'), 'MAINNET');
        assert.equal(n('devnet'), 'DEVNET');
        assert.equal(n(''), null);
    } finally {
        dispose();
    }
});

test('assertStakeAllowed blocks operator wallet and network mismatch', () => {
    const { window, dispose } = loadApp();
    try {
        const live = window.xrplLive;
        // Force a configured-looking client without needing PKCE CDN
        live.cfg = {
            mode: 'live',
            network: 'testnet',
            xamanApiKey: 'test-key',
            operatorAddress: 'rOperatorHotWalletAddressXXXXXXXXXX',
            apiBase: 'http://127.0.0.1:8787',
            networks: {
                testnet: { label: 'TESTNET', rpc: 'https://example.test', explorer: 'https://testnet.xrpl.org' }
            }
        };
        live.railsOk = true;
        live.xamanNetwork = 'TESTNET';

        assert.throws(
            () => live.assertStakeAllowed('rOperatorHotWalletAddressXXXXXXXXXX'),
            /operator hot wallet/i
        );

        live.xamanNetwork = 'MAINNET';
        assert.throws(
            () => live.assertStakeAllowed('rPlayerAccountAddressYYYYYYYYYYYYYY'),
            /Xaman is on MAINNET/i
        );

        live.xamanNetwork = 'TESTNET';
        assert.doesNotThrow(() => live.assertStakeAllowed('rPlayerAccountAddressYYYYYYYYYYYYYY'));
    } finally {
        dispose();
    }
});

test('assertStakeAllowed refuses when operator rails are not aligned', () => {
    const { window, dispose } = loadApp();
    try {
        const live = window.xrplLive;
        live.cfg = {
            mode: 'live',
            network: 'testnet',
            xamanApiKey: 'k',
            operatorAddress: 'rOp',
            apiBase: 'http://127.0.0.1:8787',
            networks: { testnet: { label: 'TESTNET', rpc: 'x', explorer: 'y' } }
        };
        live.railsOk = false;
        live.railsIssue = 'client network TESTNET ≠ operator MAINNET';
        live.xamanNetwork = 'TESTNET';
        assert.throws(() => live.assertStakeAllowed('rPlayer'), /not aligned|≠ operator/i);
    } finally {
        dispose();
    }
});

test('.env.example CORS origins match the local game port', () => {
    const env = readRoot('server/.env.example');
    assert.match(env, /localhost:8765/);
    assert.match(env, /127\.0\.0\.1:8765/);
    assert.doesNotMatch(env, /ALLOWED_ORIGINS=.*:8000/);
});
