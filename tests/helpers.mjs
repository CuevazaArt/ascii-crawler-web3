import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function stubCanvas(window) {
    const proto = window.HTMLCanvasElement.prototype;
    proto.getContext = function () {
        const noop = () => {};
        return {
            canvas: this,
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: 'left',
            globalAlpha: 1,
            fillRect: noop,
            clearRect: noop,
            strokeRect: noop,
            beginPath: noop,
            moveTo: noop,
            lineTo: noop,
            arc: noop,
            ellipse: noop,
            quadraticCurveTo: noop,
            bezierCurveTo: noop,
            closePath: noop,
            fill: noop,
            stroke: noop,
            save: noop,
            restore: noop,
            translate: noop,
            rotate: noop,
            scale: noop,
            clip: noop,
            fillText: noop,
            strokeText: noop,
            measureText: () => ({ width: 0 }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            setLineDash: noop,
            drawImage: noop
        };
    };
}

function stubAudio(window) {
    class FakeOscillator {
        connect() { return this; }
        start() {}
        stop() {}
        frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    }
    class FakeGain {
        connect() { return this; }
        gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
    }
    class FakeFilter {
        connect() { return this; }
        type = 'lowpass';
        frequency = { value: 1000 };
        Q = { value: 1 };
    }
    class FakeBufferSource {
        connect() { return this; }
        start() {}
        stop() {}
        buffer = null;
    }
    class FakeAudioContext {
        currentTime = 0;
        state = 'running';
        destination = {};
        createOscillator() { return new FakeOscillator(); }
        createGain() { return new FakeGain(); }
        createBiquadFilter() { return new FakeFilter(); }
        createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
        createBufferSource() { return new FakeBufferSource(); }
        resume() { return Promise.resolve(); }
    }
    window.AudioContext = FakeAudioContext;
    window.webkitAudioContext = FakeAudioContext;
}

/**
 * Load index.html + local scripts in jsdom for behavior tests.
 */
export function loadApp() {
    let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<link[^>]*>/gi, '');

    // Non-local host keeps XRPL_LIVE_CONFIG.mode === 'sim' so tests never
    // open live rails / operator fetch / Xaman restore timers.
    const dom = new JSDOM(html, {
        url: 'https://ci.leakrunner.test/',
        pretendToBeVisual: true,
        runScripts: 'dangerously'
    });
    const { window } = dom;

    stubCanvas(window);
    stubAudio(window);
    window.fetch = async () => {
        throw new Error('fetch stubbed in tests');
    };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    window.navigator.getGamepads = () => [];

    for (const file of ['xrpl-config.js', 'xrpl-client.js', 'score-format.js', 'audio.js', 'blockchain.js', 'game.js']) {
        const code = readFileSync(join(ROOT, file), 'utf8');
        const script = window.document.createElement('script');
        script.textContent = code;
        window.document.body.appendChild(script);
    }

    // Avoid canvas/map crashes and dangling attract timers in CI
    if (window.gameEngine) {
        window.gameEngine.renderMap = () => {};
        window.gameEngine.map = window.gameEngine.map || [];
    }
    if (window.web3Simulator) {
        if (window.web3Simulator._attractTimer) {
            clearTimeout(window.web3Simulator._attractTimer);
            window.web3Simulator._attractTimer = null;
        }
        if (window.web3Simulator._bannerTimer) {
            clearInterval(window.web3Simulator._bannerTimer);
            window.web3Simulator._bannerTimer = null;
        }
        if (window.web3Simulator._liveEconomyTimer) {
            clearInterval(window.web3Simulator._liveEconomyTimer);
            window.web3Simulator._liveEconomyTimer = null;
        }
        window.web3Simulator.hideAttractScreen = () => {
            window.web3Simulator._attractVisible = false;
        };
        window.web3Simulator.startAttractCycle = () => {};
    }
    if (window.gameEngine?.stopGame) {
        try { window.gameEngine.stopGame(); } catch (_) { /* ignore */ }
    }

    const dispose = () => {
        try {
            if (window.web3Simulator?._attractTimer) clearTimeout(window.web3Simulator._attractTimer);
            if (window.web3Simulator?._bannerTimer) clearInterval(window.web3Simulator._bannerTimer);
            if (window.web3Simulator?._liveEconomyTimer) clearInterval(window.web3Simulator._liveEconomyTimer);
            if (window.gameEngine?.stopGame) window.gameEngine.stopGame();
            window.close();
        } catch (_) { /* already closed */ }
    };

    return { window, document: window.document, root: ROOT, dispose, dom };
}

export function readRoot(...parts) {
    return readFileSync(join(ROOT, ...parts), 'utf8');
}

export { ROOT };

export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
