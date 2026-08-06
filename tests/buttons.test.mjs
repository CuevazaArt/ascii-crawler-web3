import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sleep, readRoot } from './helpers.mjs';

test('index.html declares the expected control surface', () => {
    const html = readRoot('index.html');
    const ids = [
        'btn-connect',
        'btn-legal-docs',
        'btn-github-repo',
        'btn-arcade-start',
        'btn-api-panel',
        'btn-start-run',
        'btn-claim-exit',
        'btn-session-keys',
        'btn-palette-classic',
        'btn-palette-green',
        'btn-palette-pico',
        'btn-tos-accept',
        'btn-tos-decline',
        'btn-stake-confirm',
        'btn-stake-add-coin',
        'btn-stake-remove-coin',
        'btn-lobby-stake-add',
        'btn-lobby-stake-remove',
        'btn-rail-stake-add',
        'btn-rail-stake-remove',
        'btn-stake-remove-coin',
        'btn-stake-cancel',
        'stake-confirm-modal',
        'stance-triad',
        'stance-win',
        'stance-vdb',
        'stance-lose',
        'btn-close-gameover'
    ];
    for (const id of ids) {
        assert.match(html, new RegExp(`id="${id}"`), `missing button/control #${id}`);
    }
    assert.match(html, /id="arcade-start-stake"/);
    assert.match(html, /START WITH.*arcade-start-stake.*XRP/s);
    assert.match(html, /data-stake-add/);
    assert.match(html, /data-stake-remove/);
    assert.match(html, /PRESS\s*<kbd>S<\/kbd>/);
});

test('API panel link targets operator dashboard on localhost', () => {
    const { document } = loadApp();
    const btn = document.getElementById('btn-api-panel');
    assert.ok(btn);
    assert.match(btn.getAttribute('href'), /^http:\/\/127\.0\.0\.1:8787\/?$/);
    assert.match(btn.textContent, /API/i);
});

test('Legal · ToS button links to docs/legal.html', () => {
    const { document } = loadApp();
    const btn = document.getElementById('btn-legal-docs');
    assert.ok(btn);
    assert.equal(btn.getAttribute('href'), 'docs/legal.html');
    assert.match(btn.textContent.trim(), /Legal/i);
});

test('GitHub button links to the project repository', () => {
    const { document } = loadApp();
    const btn = document.getElementById('btn-github-repo');
    assert.ok(btn);
    assert.equal(btn.getAttribute('href'), 'https://github.com/CuevazaArt/ascii-crawler-web3');
});

test('Demo toggle is not exposed in the header (live-only play)', () => {
    const { document } = loadApp();
    assert.equal(document.getElementById('chk-bypass-web3'), null);
    assert.equal(document.querySelector('.header-demo-toggle'), null);
    const tray = document.querySelector('.header-chip-tray');
    const legal = document.getElementById('btn-legal-docs');
    assert.ok(tray);
    assert.ok(tray.contains(legal));
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
    assert.equal(document.getElementById('btn-disconnect').hidden, false);
    assert.equal(document.getElementById('wallet-balance-chip').hidden, false);
});

test('Disconnect clears wallet; balance eye toggles visibility', async () => {
    const { window, document } = loadApp();
    const sim = window.web3Simulator;

    document.getElementById('btn-connect').click();
    document.getElementById('chk-tos-agree').checked = true;
    document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('btn-tos-accept').click();
    await sleep(1100);

    assert.equal(sim.isConnected, true);
    document.getElementById('btn-disconnect').click();
    await sleep(50);
    assert.equal(sim.isConnected, false);
    assert.equal(document.getElementById('btn-disconnect').hidden, true);
    assert.match(document.getElementById('btn-connect').textContent, /Connect Xaman/i);

    const bal = document.getElementById('val-xrp-balance');
    assert.equal(bal.dataset.visible, '1');
    document.getElementById('btn-toggle-balance-side').click();
    assert.equal(bal.dataset.visible, '0');
    document.getElementById('btn-toggle-balance-side').click();
    assert.equal(bal.dataset.visible, '1');
});

test('±0.5 buttons adjust stake shown on START', async () => {
    const { window, document, dispose } = loadApp();
    try {
        if (window.XRPL_LIVE_CONFIG) window.XRPL_LIVE_CONFIG.mode = 'sim';
        const sim = window.web3Simulator;

        document.getElementById('btn-connect').click();
        document.getElementById('chk-tos-agree').checked = true;
        document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
        document.getElementById('btn-tos-accept').click();
        await sleep(1100);

        assert.equal(document.getElementById('btn-lobby-stake-remove').disabled, true);

        await sleep(200);
        document.getElementById('btn-lobby-stake-add').click();
        await sleep(40);
        assert.equal(sim.participationCoins, 1);
        assert.equal(document.getElementById('arcade-start-stake').textContent, '0.5');
        assert.equal(document.getElementById('btn-lobby-stake-remove').disabled, false);

        await sleep(200);
        document.getElementById('btn-lobby-stake-add').click();
        await sleep(40);
        assert.equal(sim.participationCoins, 2);
        assert.equal(document.getElementById('arcade-start-stake').textContent, '1');

        await sleep(200);
        document.getElementById('btn-rail-stake-remove').click();
        await sleep(40);
        assert.equal(sim.participationCoins, 1);
        assert.equal(document.getElementById('arcade-start-stake').textContent, '0.5');
    } finally {
        dispose();
    }
});

test('Arcade START label shows stacked stake amount', async () => {
    const { window, document, dispose } = loadApp();
    try {
        if (window.XRPL_LIVE_CONFIG) window.XRPL_LIVE_CONFIG.mode = 'sim';
        assert.equal(document.getElementById('arcade-start-stake').textContent, '0.5');

        document.getElementById('btn-connect').click();
        document.getElementById('chk-tos-agree').checked = true;
        document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
        document.getElementById('btn-tos-accept').click();
        await sleep(1100);

        document.getElementById('btn-start-run').click();
        await sleep(40);
        assert.equal(document.getElementById('arcade-start-stake').textContent, '0.5');

        await sleep(200);
        document.getElementById('btn-stake-add-coin').click();
        await sleep(40);
        assert.equal(document.getElementById('arcade-start-stake').textContent, '1');
    } finally {
        dispose();
    }
});

test('Arcade START confirm boots sim run', async () => {
    const { window, document, dispose } = loadApp();
    try {
        const sim = window.web3Simulator;
        if (window.XRPL_LIVE_CONFIG) window.XRPL_LIVE_CONFIG.mode = 'sim';

        document.getElementById('btn-connect').click();
        document.getElementById('chk-tos-agree').checked = true;
        document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
        document.getElementById('btn-tos-accept').click();
        await sleep(1100);

        document.getElementById('btn-arcade-start').click();
        await sleep(40);
        assert.equal(document.getElementById('stake-confirm-modal').style.display, 'flex');

        document.getElementById('btn-arcade-start').click();
        await sleep(1400);
        assert.equal(sim.gameActive, true);
        assert.equal(window.gameEngine.isActive, true);
        sim.resetGameState();
    } finally {
        dispose();
    }
});

test('Arcade START opens stake modal when connected (sim)', async () => {
    const { window, document, dispose } = loadApp();
    try {
        const sim = window.web3Simulator;
        if (window.XRPL_LIVE_CONFIG) window.XRPL_LIVE_CONFIG.mode = 'sim';

        document.getElementById('btn-connect').click();
        document.getElementById('chk-tos-agree').checked = true;
        document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
        document.getElementById('btn-tos-accept').click();
        await sleep(1100);

        const modal = document.getElementById('stake-confirm-modal');
        document.getElementById('btn-arcade-start').click();
        await sleep(40);
        assert.equal(modal.style.display, 'flex');
        assert.equal(sim.participationCoins, 1);
    } finally {
        dispose();
    }
});

test('Arcade START opens ToS when wallet disconnected', async () => {
    const { window, document, dispose } = loadApp();
    try {
        document.getElementById('btn-arcade-start').click();
        await sleep(20);
        assert.equal(document.getElementById('tos-modal').style.display, 'flex');
        assert.equal(window.web3Simulator.isConnected, false);
    } finally {
        dispose();
    }
});

test('Stake button opens consequences modal; cancel does not start a run', async () => {
    const { window, document } = loadApp();
    const sim = window.web3Simulator;

    // Force sim rails so Stake does not open Xaman
    if (window.XRPL_CONFIG) window.XRPL_CONFIG.mode = 'sim';
    document.getElementById('btn-connect').click();
    document.getElementById('chk-tos-agree').checked = true;
    document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('btn-tos-accept').click();
    await sleep(1100);

    const modal = document.getElementById('stake-confirm-modal');
    assert.ok(modal);
    document.getElementById('btn-start-run').click();
    await sleep(40);
    assert.equal(modal.style.display, 'flex');
    assert.equal(sim.participationCoins, 1);
    assert.match(document.getElementById('stake-split-panel').textContent, /Earn escrow/i);
    assert.equal(sim.gameActive, false);

    document.getElementById('btn-stake-cancel').click();
    await sleep(20);
    assert.notEqual(modal.style.display, 'flex');
    assert.equal(sim.gameActive, false);
    assert.equal(sim.participationCoins, 1); // stack kept for next press
});

test('Each +0.5 press stacks participation coins', async () => {
    const { window, document, dispose } = loadApp();
    try {
        const sim = window.web3Simulator;
        if (window.XRPL_CONFIG) window.XRPL_CONFIG.mode = 'sim';

        document.getElementById('btn-connect').click();
        document.getElementById('chk-tos-agree').checked = true;
        document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
        document.getElementById('btn-tos-accept').click();
        await sleep(1100);

        document.getElementById('btn-start-run').click();
        await sleep(40);
        assert.equal(sim.participationCoins, 1);
        assert.equal(sim.getParticipationStake(), 0.5);
        assert.equal(document.getElementById('btn-stake-remove-coin').disabled, false);

        await sleep(200); // past coin-in debounce
        document.getElementById('btn-stake-add-coin').click();
        await sleep(40);
        assert.equal(sim.participationCoins, 2);
        assert.equal(sim.getParticipationStake(), 1);
        assert.match(document.getElementById('stake-confirm-amount').textContent, /1/);
        assert.equal(document.getElementById('btn-stake-remove-coin').disabled, false);

        await sleep(200);
        document.getElementById('btn-stake-remove-coin').click();
        await sleep(40);
        assert.equal(sim.participationCoins, 1);
        assert.equal(sim.getParticipationStake(), 0.5);
        assert.equal(document.getElementById('btn-stake-remove-coin').disabled, false);
    } finally {
        dispose();
    }
});

test('Stake confirm applies split feedback and boots the sim run', async () => {
    const { window, document } = loadApp();
    const sim = window.web3Simulator;
    if (window.XRPL_CONFIG) window.XRPL_CONFIG.mode = 'sim';

    document.getElementById('btn-connect').click();
    document.getElementById('chk-tos-agree').checked = true;
    document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('btn-tos-accept').click();
    await sleep(1100);

    document.getElementById('btn-start-run').click();
    await sleep(40);
    document.getElementById('btn-stake-confirm').click();
    await sleep(1400);
    assert.equal(sim.gameActive, true);
    assert.equal(window.gameEngine.isActive, true);
    assert.equal(sim.sessionStake, 0.5);
    assert.equal(sim.participationCoins, 0);
    sim.resetGameState();
});

test('VDB · Claim & Exit settles an active staked run', async () => {
    const { window, document } = loadApp();
    const sim = window.web3Simulator;
    if (window.XRPL_LIVE_CONFIG) window.XRPL_LIVE_CONFIG.mode = 'sim';

    document.getElementById('btn-connect').click();
    document.getElementById('chk-tos-agree').checked = true;
    document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('btn-tos-accept').click();
    await sleep(1100);

    document.getElementById('btn-start-run').click();
    await sleep(40);
    document.getElementById('btn-stake-confirm').click();
    await sleep(1400);
    assert.equal(sim.gameActive, true);
    assert.equal(document.getElementById('stance-triad').dataset.stance, 'vdb');

    document.getElementById('btn-claim-exit').click();
    await sleep(1300);
    assert.equal(sim.gameActive, false);
});

test('Node skin palette buttons select purchased skins', async () => {
    const { window, document } = loadApp();
    const sim = window.web3Simulator;

    document.getElementById('btn-connect').click();
    document.getElementById('chk-tos-agree').checked = true;
    document.getElementById('chk-tos-agree').dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('btn-tos-accept').click();
    await sleep(1100);

    document.getElementById('btn-palette-green').click();
    await sleep(1100);
    assert.equal(sim.currentPalette, 'green');
    document.getElementById('btn-palette-pico').click();
    await sleep(1100);
    assert.equal(sim.currentPalette, 'pico');
    document.getElementById('btn-palette-classic').click();
    assert.equal(sim.currentPalette, 'classic');
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
    assert.match(channelBtn.textContent, /CHANNEL ON/i);

    channelBtn.click();
    assert.equal(sim.hasSessionKeys, false);
    assert.match(channelBtn.textContent, /CHANNEL OFF/i);
});

test('score HUD uses ≤12 ASCII digits', () => {
    const { window, document } = loadApp();
    const engine = window.gameEngine;
    engine.score = 12345678901234;
    engine.updateUI();
    const text = document.getElementById('val-score').textContent;
    assert.ok(text.length <= 12);
    assert.match(text, /^[0-9]+$/);
});

test('attract credits reserve last row for CUEVAZAART', () => {
    const { window } = loadApp();
    const rows = window.web3Simulator.buildAttractRows();
    assert.equal(rows.length, 5);
    assert.equal(rows[4].name, 'CUEVAZAART');
});

test('HUD shows open-mouth Node lives beside relic vault gems', () => {
    const { window, document } = loadApp();
    const engine = window.gameEngine;
    engine.lives = 3;
    engine.updateLivesDisplay(3);
    const lives = document.getElementById('hud-lives');
    assert.equal(lives.querySelectorAll('.hud-node-life').length, 3);
    assert.ok(lives.querySelector('svg path'));
    const relics = document.getElementById('hud-relics');
    assert.ok(relics);
    assert.equal(relics.querySelectorAll('.hud-relic-gem').length, 5);
});
