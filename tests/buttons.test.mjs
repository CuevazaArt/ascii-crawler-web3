import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sleep, readRoot } from './helpers.mjs';

test('index.html declares the expected control surface', () => {
    const html = readRoot('index.html');
    const ids = [
        'btn-connect',
        'btn-legal-docs',
        'btn-arcade-start',
        'btn-start-run',
        'btn-claim-exit',
        'btn-session-keys',
        'btn-palette-classic',
        'btn-palette-green',
        'btn-palette-pico',
        'btn-tos-accept',
        'btn-tos-decline',
        'btn-close-gameover',
        'chk-bypass-web3'
    ];
    for (const id of ids) {
        assert.match(html, new RegExp(`id="${id}"`), `missing button/control #${id}`);
    }
    assert.match(html, /arcade-s">\[S\]<\/span>TART/);
    assert.doesNotMatch(html, /arcade-start-key/);
    assert.doesNotMatch(html, /PRESS\s*<kbd>S<\/kbd><\/span>/);
});

test('Legal · ToS button links to docs/legal.html', () => {
    const { document } = loadApp();
    const btn = document.getElementById('btn-legal-docs');
    assert.ok(btn);
    assert.equal(btn.getAttribute('href'), 'docs/legal.html');
    assert.match(btn.textContent, /Legal/i);
});

test('Connect Xaman opens ToS; Decline cancels; Accept connects wallet', async () => {
    const { window, document } = loadApp();
    const sim = window.web3Simulator;
    assert.ok(sim);
    assert.equal(sim.isConnected, false);

    document.getElementById('btn-connect').click();
    const modal = document.getElementById('tos-modal');
    assert.equal(modal.style.display, 'flex');
    assert.equal(sim.isConnected, false);

    const accept = document.getElementById('btn-tos-accept');
    assert.equal(accept.disabled, true);

    document.getElementById('btn-tos-decline').click();
    assert.equal(modal.style.display, 'none');
    assert.equal(sim.isConnected, false);

    document.getElementById('btn-connect').click();
    document.getElementById('chk-tos-agree').checked = true;
    document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(accept.disabled, false);

    accept.click();
    assert.equal(modal.style.display, 'none');
    await sleep(1100);
    assert.equal(sim.isConnected, true);
    assert.match(document.getElementById('btn-connect').textContent, /Xaman Linked/i);
    assert.equal(document.getElementById('btn-start-run').disabled, false);
});

test('Demo Mode enables Demo Boot and starts a run', async () => {
    const { window, document } = loadApp();
    const sim = window.web3Simulator;
    const engine = window.gameEngine;

    const chk = document.getElementById('chk-bypass-web3');
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change', { bubbles: true }));

    const start = document.getElementById('btn-start-run');
    assert.equal(start.disabled, false);
    assert.match(start.textContent, /Demo Boot/i);

    start.click();
    await sleep(50);
    assert.equal(sim.gameActive, true);
    assert.equal(engine.isActive, true);
    assert.equal(document.getElementById('btn-claim-exit').disabled, false);
});

test('Arcade [S]TART boots via Demo Mode', async () => {
    const { window, document } = loadApp();
    const chk = document.getElementById('chk-bypass-web3');
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change', { bubbles: true }));

    document.getElementById('btn-arcade-start').click();
    await sleep(50);
    assert.equal(window.web3Simulator.gameActive, true);
    assert.equal(window.gameEngine.isActive, true);
});

test('Payment Channel toggles after wallet connect', async () => {
    const { window, document } = loadApp();
    const sim = window.web3Simulator;

    document.getElementById('btn-connect').click();
    document.getElementById('chk-tos-agree').checked = true;
    document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('btn-tos-accept').click();
    await sleep(1100);

    const channelBtn = document.getElementById('btn-session-keys');
    assert.equal(channelBtn.disabled, false);
    assert.equal(sim.hasSessionKeys, false);

    channelBtn.click();
    await sleep(1100);
    assert.equal(sim.hasSessionKeys, true);
    assert.match(channelBtn.textContent, /Close Channel/i);

    channelBtn.click();
    assert.equal(sim.hasSessionKeys, false);
    assert.match(channelBtn.textContent, /Payment Channel/i);
});

test('Claim XRP & Exit settles an active demo run', async () => {
    const { window, document } = loadApp();
    const sim = window.web3Simulator;

    const chk = document.getElementById('chk-bypass-web3');
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('btn-start-run').click();
    await sleep(50);
    assert.equal(sim.gameActive, true);

    document.getElementById('btn-claim-exit').click();
    await sleep(1300);
    assert.equal(sim.gameActive, false);
});

test('Node skin palette buttons select unlocked skins', () => {
    const { window, document } = loadApp();
    const sim = window.web3Simulator;
    const chk = document.getElementById('chk-bypass-web3');
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change', { bubbles: true }));

    document.getElementById('btn-palette-green').click();
    assert.equal(sim.currentPalette, 'green');
    document.getElementById('btn-palette-pico').click();
    assert.equal(sim.currentPalette, 'pico');
    document.getElementById('btn-palette-classic').click();
    assert.equal(sim.currentPalette, 'classic');
});

test('score HUD uses ≤10 ASCII digits', () => {
    const { window, document } = loadApp();
    const engine = window.gameEngine;
    engine.score = 1234567890123;
    engine.updateUI();
    const text = document.getElementById('val-score').textContent;
    assert.ok(text.length <= 10);
    assert.match(text, /^[0-9]+$/);
});
