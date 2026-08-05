/**
 * Frontend live-rails wiring — the game must ship with the live XRPL layer
 * loaded but inert (sim mode) until xrpl-config.js is filled in by an operator.
 * Server-side economy & API behavior live in server-economy/server-app tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, readRoot } from './helpers.mjs';

test('index.html wires the live XRPL layer (config, PKCE CDN, client, sign modal)', () => {
    const html = readRoot('index.html');
    assert.match(html, /src="xrpl-config\.js/);
    assert.match(html, /xumm\.app\/assets\/cdn\/xumm-oauth2-pkce\.min\.js/);
    assert.match(html, /src="xrpl-client\.js/);
    assert.match(html, /id="xaman-sign-modal"/);
    assert.match(html, /id="xaman-sign-qr"/);
    assert.match(html, /id="xaman-sign-open"/);
    assert.match(html, /id="xaman-sign-cancel"/);
});

test('script order: config → PKCE SDK → client → blockchain', () => {
    const html = readRoot('index.html');
    const order = [
        html.indexOf('xrpl-config.js'),
        html.indexOf('xumm-oauth2-pkce.min.js'),
        html.indexOf('xrpl-client.js'),
        html.indexOf('blockchain.js')
    ];
    assert.ok(order.every((i) => i >= 0), 'all live-layer scripts must be present');
    for (let i = 1; i < order.length; i++) {
        assert.ok(order[i - 1] < order[i], `script #${i} out of order`);
    }
});

test('xrpl-config.js ships in safe sim mode by default', () => {
    const cfg = readRoot('xrpl-config.js');
    assert.match(cfg, /mode:\s*'sim'/);
    assert.match(cfg, /livenet\.xrpl\.org/);
    assert.match(cfg, /testnet\.xrpl\.org/);
});

test('app boots in sim mode with the live layer loaded (no live rails without config)', () => {
    const { window } = loadApp();
    assert.ok(window.xrplLive, 'xrpl-client should expose window.xrplLive');
    assert.equal(window.xrplLive.available(), false);
    assert.equal(window.web3Simulator.isLiveMode(), false);
    assert.equal(typeof window.web3Simulator.liveInsertCoin, 'function');
    assert.equal(typeof window.web3Simulator.syncLiveEconomy, 'function');
});

test('legal docs carry the live-operator real-money terms', () => {
    const md = readRoot('docs/LEGAL.md');
    assert.match(md, /operator hot wallet/i);
    assert.match(md, /1\.1× the entry stake/);
    assert.match(md, /at least 18/i);
    const html = readRoot('docs/legal.html');
    assert.match(html, /operator hot wallet/i);
    assert.match(html, /1\.1× the entry stake/);
});
