/**
 * Leak Runner Game Engine (game.js)
 * Securithon Grid — boot a Node, harvest Drops, seize Relics, slash Exploits.
 */

/** Ledger Relics — sealed XRPL artifacts that leak score + XRP when seized. */
const LEDGER_RELICS = [
    { id: 1, key: 'spray',     name: 'Mist Shard',       score: 100,  xrp: 0.002, dropsAt: 20,  color: '#5dade2', accent: '#85c1e9', ono: 'PSSSH!',  cry: 'MIST!' },
    { id: 2, key: 'hook',      name: 'Hook Sigil',       score: 300,  xrp: 0.005, dropsAt: 50,  color: '#af7ac5', accent: '#d2b4de', ono: 'CLANG!',  cry: 'SIGIL!' },
    { id: 3, key: 'amm',       name: 'Liquidity Prism',  score: 500,  xrp: 0.010, dropsAt: 85,  color: '#58d68d', accent: '#abebc6', ono: 'SHING!',  cry: 'PRISM!' },
    { id: 4, key: 'validator', name: 'Beacon Crest',     score: 700,  xrp: 0.015, dropsAt: 120, color: '#f4d03f', accent: '#f9e79f', ono: 'CHIME!',  cry: 'BEACON!' },
    { id: 5, key: 'consensus', name: 'Finality Orb',     score: 1000, xrp: 0.025, dropsAt: 160, color: '#e74c3c', accent: '#f5b7b1', ono: 'BOOM!',   cry: 'FINAL!' }
];

/**
 * Original Exploit penguins (invented names — see docs/LEGAL.md §1.6).
 * Shared with banners, dossier, and slash logs.
 */
const GRID_PENGUINS = [
    { name: 'Bitwaddle',  role: 'Vault Hound',   blurb: 'Locks onto your uptime and waddles until the vault cracks. Never blinks. Never bargains.', ono: 'WADDLE!', cryColor: '#ff2244', accent: '#ffe14d', pitch: 1.0 },
    { name: 'Hatglide',   role: 'Path Prophet',  blurb: 'Tips the brim, reads four corridors ahead — you move, the hat already knew.', ono: 'TIP-TAP!', cryColor: '#ff44ff', accent: '#ffe0ff', pitch: 1.18 },
    { name: 'Slipkernel', role: 'Warp Anchor',   blurb: 'Belly-slides through Bitwaddle’s wake to fold the grid short. Cold, quiet, inevitable.', ono: 'SLIP!', cryColor: '#22eeff', accent: '#aaf7ff', pitch: 0.88 },
    { name: 'Sourceflip', role: 'Far Flare',     blurb: 'Strikes from the rim of the sector. Audit light hits — he flips, scatters, waits.', ono: 'FLIP!', cryColor: '#ff5522', accent: '#ffcc88', pitch: 1.28 }
];
/** Named sectors of the Securithon Grid (cycles as depth increases). */
const GRID_SECTORS = [
    'Cold Start',
    'Packet Drift',
    'Hook Alley',
    'Mist Market',
    'Beacon Row',
    'Finality Gate',
    'Deep Leak',
    'Null Harbor'
];

function sectorTitle(level) {
    const n = Math.max(1, Math.floor(Number(level) || 1));
    const name = GRID_SECTORS[(n - 1) % GRID_SECTORS.length];
    return `${n} · ${name}`;
}

/**
 * Three 17×29 arcade mazes, rotating per sector.
 * Shared invariants (validated in tests/maze.test.mjs):
 * tunnel row 8, Exploit house rows 7–9 cols 12–16, relic pad r11c14,
 * every drop BFS-reachable, no dead-end corridors.
 */
const MAZE_LAYOUTS = [
    // Sector A — "loops": the original balanced grid
    [
        "#############################",
        "#O.........................O#",
        "#.#####.###.#.#.#.###.#####.#",
        "#.............#.............#",
        "#.#####.###.#.#.#.###.#####.#",
        "#...........................#",
        "#.###.###.##..=..##.###.###.#",
        "#..........#HHHHH#..........#",
        " ..........#HHHHH#.......... ",
        "#..........#HHHHH#..........#",
        "#.###.###.#########.###.###.#",
        "#.............=.............#",
        "#.#####.###.#.#.#.###.#####.#",
        "#.............#.............#",
        "#.#####.###.#.#.#.###.#####.#",
        "#O.........................O#",
        "#############################"
    ],
    // Sector B — "drift": long horizontal lanes, staggered combs
    [
        "#############################",
        "#O.........................O#",
        "#.###.#.#####.#.#####.#.###.#",
        "#.....#...............#.....#",
        "#.###.#.###.#####.###.#.###.#",
        "#...........................#",
        "#.###.###.##..=..##.###.###.#",
        "#..........#HHHHH#..........#",
        " ..........#HHHHH#.......... ",
        "#..........#HHHHH#..........#",
        "#.###.###.#########.###.###.#",
        "#.............=.............#",
        "#.###.#.###.#####.###.#.###.#",
        "#.....#...............#.....#",
        "#.###.#.#####.#.#####.#.###.#",
        "#O.........................O#",
        "#############################"
    ],
    // Sector C — "alleys": vertical shafts and a split spine
    [
        "#############################",
        "#O............#............O#",
        "#.####.#####..#..#####.####.#",
        "#......#......#......#......#",
        "#.####.#.####.#.####.#.####.#",
        "#...........................#",
        "#.###.###.##..=..##.###.###.#",
        "#..........#HHHHH#..........#",
        " ..........#HHHHH#.......... ",
        "#..........#HHHHH#..........#",
        "#.###.###.#########.###.###.#",
        "#.............=.............#",
        "#.####.#.####.#.####.#.####.#",
        "#......#......#......#......#",
        "#.####.#####..#..#####.####.#",
        "#O.........................O#",
        "#############################"
    ]
];

if (typeof window !== 'undefined') {
    window.GRID_PENGUINS = GRID_PENGUINS;
    window.LEDGER_RELICS = LEDGER_RELICS;
    window.GRID_SECTORS = GRID_SECTORS;
    window.MAZE_LAYOUTS = MAZE_LAYOUTS;
    window.sectorTitle = sectorTitle;
}

class GameEngine {
    constructor() {
        this.isActive = false;
        this.score = 0;
        this.dotsEaten = 0;
        this.levelDotsEaten = 0;
        this.slashChain = 0;
        this.lives = 3;
        this.level = 1;
        this.invulnerableTurns = 0;
        this.totalDots = 0;
        this.dotsRemaining = 0;
        this.tickCount = 0;
        this.relicsCollected = [];
        this.activeRelic = null;
        this.relicTimer = 0;
        this.nextRelicIndex = 0;
        this.floatingScores = [];

        this.modeIndex = 0;
        this.modeTimer = 0;
        this.modeSchedule = [
            { mode: 'scatter', ticks: 28 },
            { mode: 'chase', ticks: 80 },
            { mode: 'scatter', ticks: 20 },
            { mode: 'chase', ticks: 80 },
            { mode: 'scatter', ticks: 14 },
            { mode: 'chase', ticks: 9999 }
        ];
        this.globalMode = 'scatter';

        this.player = { x: 14, y: 15, startX: 14, startY: 15 };
        this.relicPad = { r: 11, c: 14 };
        this.tunnelRow = 8;

        this.rows = 17;
        this.cols = 29;
        this.map = [];
        this.exploits = [];

        this.dirX = -1;
        this.dirY = 0;
        this.nextDirX = -1;
        this.nextDirY = 0;

        this.frightenedTurns = 0;
        this.frightenedDuration = 40;
        this.introTicks = 0;
        this.wallFlashUntil = 0;

        this.gameInterval = null;
        this.animFrameId = null;
        this.gameTickMs = 250;
        this.lastGamepadInputTime = 0;
        this.gamepadCooldown = 120;
        this._fpsFrames = 0;
        this._fpsLastTs = performance.now();
        this.fpsEl = document.querySelector('.fps-counter');
        this.fxBursts = document.getElementById('fx-bursts');
        this._fxBurstTimers = new Set();
        this.deathAnim = null;

        // Each skin ships 3 sector themes (walls + bg shift per maze rotation)
        this.palettes = {
            classic: {
                bg: '#02040a',
                wall: '#1555c0',
                wallHi: '#4da3ff',
                wallLo: '#0a2870',
                dot: '#ffe14d',
                pellet: '#00ffb7',
                // Node = electric lemon (cool yellow)
                player: '#fff200',
                playerHi: '#ffffa8',
                playerLo: '#e6c800',
                // Four clearly-spaced hues: crimson / pink / cyan / orange
                exploits: ['#ff2a3c', '#ff5fd0', '#25e4ff', '#ff8b1f'],
                frightened: '#8b6cff',
                sectorWalls: [
                    {}, // Sector A — ledger blue
                    { bg: '#020a0c', wall: '#0d7f8f', wallHi: '#3fe8e0', wallLo: '#063d4a' },   // B — reef teal
                    { bg: '#050312', wall: '#5a2ea6', wallHi: '#9d7bff', wallLo: '#26124d' }    // C — deep violet
                ]
            },
            green: {
                bg: '#04140a',
                wall: '#0d7a3a',
                wallHi: '#22ff7a',
                wallLo: '#064020',
                dot: '#c8ff3d',
                pellet: '#00ff66',
                player: '#fff200',
                playerHi: '#ffffa8',
                playerLo: '#e6c800',
                exploits: ['#ff3b4d', '#e05fff', '#2ee6ff', '#ffa51e'],
                frightened: '#33a0ff',
                sectorWalls: [
                    {}, // A — verdant
                    { bg: '#0c1204', wall: '#5f7a0d', wallHi: '#b7ff22', wallLo: '#2f4006' },   // B — acid grove
                    { bg: '#04120e', wall: '#0d7a5f', wallHi: '#22ffc9', wallLo: '#06402f' }    // C — glacier moss
                ]
            },
            pico: {
                bg: '#1a1040',
                wall: '#c02070',
                wallHi: '#ff55aa',
                wallLo: '#701040',
                dot: '#ffd0a0',
                pellet: '#00ff55',
                player: '#fff45a',
                playerHi: '#ffffb0',
                playerLo: '#e6c800',
                exploits: ['#ff2a55', '#ff7ae0', '#33e0ff', '#ffb02e'],
                frightened: '#b899ff',
                sectorWalls: [
                    {}, // A — neon magenta
                    { bg: '#180d02', wall: '#c05510', wallHi: '#ff9440', wallLo: '#6a2a08' },   // B — ember bay
                    { bg: '#0b0a2a', wall: '#4030c0', wallHi: '#8f7bff', wallLo: '#201070' }    // C — indigo core
                ]
            }
        };
        this.activePalette = 'classic';

        this.canvas = document.getElementById('game-canvas');
        if (this.canvas) {
            this.canvas.width = this.cols * 20;
            this.canvas.height = this.rows * 20;
            this.ctx = this.canvas.getContext('2d');
        }
        this.lblLevel = document.getElementById('lbl-level');
        this.valScore = document.getElementById('val-score');
        this.valDots = document.getElementById('val-dots');
        this.valLives = document.getElementById('val-lives');
        this.effectRow = document.getElementById('effect-row');
        this.valEffectTimer = document.getElementById('val-effect-timer');
        this.valRelic = document.getElementById('val-active-relic');
        this.valMode = document.getElementById('val-swarm-mode');
        this.gameStage = document.getElementById('game-stage');
        this.hudScore = document.getElementById('hud-score');
        this.hudLives = document.getElementById('hud-lives');
        this.hudRelics = document.getElementById('hud-relics');
        this.hudTier = document.getElementById('hud-tier');
        this.phaseBanner = document.getElementById('phase-banner');
        this.phaseKicker = document.getElementById('phase-kicker');
        this.phaseTitle = document.getElementById('phase-title');
        this.phaseDetail = document.getElementById('phase-detail');
        this.phaseMeter = document.getElementById('phase-meter');
        this.phaseMeterFill = document.getElementById('phase-meter-fill');
        this._phaseKey = '';
        this.stanceTriad = document.getElementById('stance-triad');
        this.stancePending = document.getElementById('stance-pending');
        this._stanceKey = '';
        this._stanceOutcome = null; // 'win' | 'vdb' | 'lose' when run ends
        this._clearMilestone = 0; // 0/25/50/75/100 feedback ticks

        window.gameEngine = this;
        this.setupKeyboardInput();
        this.setupGamepadInput();
        this.setupTouchInput();
        this.setupStanceTriad();
        this.renderLorePanel();
        this.renderHudRelicSlots();
        this.updateLivesDisplay(this.lives);
        this.bindPlayfieldLayoutSync();
        this.setupViewportAndFullscreen();
    }

    /** Keep fx-bursts overlay aligned when the canvas scales to fit the terminal. */
    syncPlayfieldLayout() {
        const canvas = this.canvas;
        const layer = this.fxBursts;
        const stack = canvas?.parentElement;
        if (!canvas || !layer || !stack) return;
        const cRect = canvas.getBoundingClientRect();
        const sRect = stack.getBoundingClientRect();
        layer.style.position = 'absolute';
        layer.style.left = `${cRect.left - sRect.left}px`;
        layer.style.top = `${cRect.top - sRect.top}px`;
        layer.style.width = `${cRect.width}px`;
        layer.style.height = `${cRect.height}px`;
    }

    bindPlayfieldLayoutSync() {
        if (this._playfieldLayoutBound) return;
        this._playfieldLayoutBound = true;
        const stack = document.querySelector('.canvas-stack');
        const sync = () => this.syncPlayfieldLayout();
        if (typeof ResizeObserver !== 'undefined') {
            this._playfieldRo = new ResizeObserver(sync);
            if (stack) this._playfieldRo.observe(stack);
            if (this.canvas) this._playfieldRo.observe(this.canvas);
        }
        window.addEventListener('resize', sync);
        window.visualViewport?.addEventListener('resize', sync);
        window.visualViewport?.addEventListener('scroll', sync);
        sync();
    }

    setupViewportAndFullscreen() {
        const btn = document.getElementById('btn-fullscreen');
        const root = document.querySelector('.app-container');
        if (!root) return;

        const syncFs = () => {
            const fs = document.fullscreenElement === root;
            root.classList.toggle('is-fullscreen', fs);
            if (btn) {
                btn.setAttribute('aria-pressed', fs ? 'true' : 'false');
                const icon = btn.querySelector('i');
                if (icon) icon.className = fs ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
            }
            this.syncPlayfieldLayout();
        };

        btn?.addEventListener('click', () => {
            if (document.fullscreenElement === root) {
                document.exitFullscreen?.().catch(() => {});
                return;
            }
            root.requestFullscreen?.().catch(() => {
                window.web3Simulator?.log?.('Fullscreen not available in this browser.', 'system');
            });
        });

        document.addEventListener('fullscreenchange', syncFs);
        syncFs();
    }

    setupStanceTriad() {
        const vdb = document.getElementById('stance-vdb');
        if (!vdb || vdb._stanceBound) return;
        vdb._stanceBound = true;
        vdb.addEventListener('click', () => {
            if (!this.isActive || this._stanceOutcome) return;
            const btn = document.getElementById('btn-claim-exit');
            if (btn && !btn.disabled) btn.click();
        });
    }

    /** Chunky Node life icon — rounded vault square with wedge mouth + big eye. */
    nodeLifeIconHtml() {
        return `<span class="hud-node-life" title="Node life" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path fill="#fff200" d="M7 4 h10 a3 3 0 0 1 3 3 v3 l-8 2 8 2 v3 a3 3 0 0 1 -3 3 h-10 a3 3 0 0 1 -3 -3 v-10 a3 3 0 0 1 3 -3 Z"/>
                <rect x="10" y="1" width="3" height="3" fill="#8fd0ff"/>
                <circle cx="9" cy="8.4" r="2.3" fill="#fffef5"/>
                <circle cx="9.8" cy="9" r="1.1" fill="#1a1200"/>
            </svg>
        </span>`;
    }

    updateLivesDisplay(lives) {
        const n = Math.max(0, Math.floor(Number(lives) || 0));
        if (this._livesRendered === n) return;
        this._livesRendered = n;
        const html = n > 0
            ? Array.from({ length: n }, () => this.nodeLifeIconHtml()).join('')
            : '<span class="hud-lives-empty">0</span>';
        if (this.hudLives) {
            this.hudLives.innerHTML = html;
            this.hudLives.setAttribute('aria-label', `${n} lives`);
        }
        if (this.valLives) {
            this.valLives.innerHTML = html;
            this.valLives.setAttribute('aria-label', `${n} lives`);
        }
    }

    renderHudRelicSlots() {
        if (!this.hudRelics) return;
        this.hudRelics.innerHTML = LEDGER_RELICS.map(r => `
            <span class="hud-relic-gem" data-hud-relic="${r.key}" style="--gem:${r.color}"
                  title="${r.name} · +${r.score} pts · +${r.xrp} XRP"></span>
        `).join('');
    }

    getMapLayout() {
        return MAZE_LAYOUTS[(this.level - 1) % MAZE_LAYOUTS.length];
    }

    isWalkableTile(tile, forExploit = false) {
        if (tile === undefined || tile === '#') return false;
        if (tile === 'H') return forExploit;
        return true; // . O = space R (relic)
    }

    renderLorePanel() {
        const list = document.getElementById('exploit-lore-list');
        if (!list) return;
        list.innerHTML = GRID_PENGUINS.map((e, i) => `
            <div class="lore-chip lore-chip-${i}">
                <span class="lore-swatch"></span>
                <div>
                    <strong>${e.name}</strong>
                    <em>${e.role}</em>
                    <p>${e.blurb}</p>
                </div>
            </div>
        `).join('');

        // Relic vault lives in the main HUD only (no sidebar duplicate)
    }

    startGame() {
        this.isActive = true;
        this.score = 0;
        this.dotsEaten = 0;
        this.levelDotsEaten = 0;
        this.slashChain = 0;
        this.lives = 3;
        this.level = 1;
        this.applyLevelPacing();
        this.frightenedTurns = 0;
        this.invulnerableTurns = 14;
        this.tickCount = 0;
        this.relicsCollected = [];
        this.activeRelic = null;
        this.relicTimer = 0;
        this.nextRelicIndex = 0;
        this.floatingScores = [];
        this.deathAnim = null;
        this.introTicks = 8;
        this.wallFlashUntil = 0;
        this._stanceOutcome = null;
        this._stanceKey = '';
        this._clearMilestone = 0;
        const stack = document.querySelector('.canvas-stack');
        if (stack) {
            stack.classList.remove('node-death-shake', 'node-death-final');
            // Safety: clear any stray inline transform (e.g. from devtools/testing)
            // so a run can never start with the playfield zoomed or offset
            stack.style.transform = '';
            stack.style.transformOrigin = '';
        }
        this.modeIndex = 0;
        this.modeTimer = this.modeSchedule[0].ticks;
        this.globalMode = this.modeSchedule[0].mode;

        this.dirX = -1;
        this.dirY = 0;
        this.nextDirX = -1;
        this.nextDirY = 0;

        this.loadMap();
        this.spawnExploits();
        this.updateRelicRosterUI();

        const prompt = document.getElementById('start-prompt');
        if (prompt) prompt.style.display = 'none';
        const runRecap = document.getElementById('run-recap');
        if (runRecap) runRecap.hidden = true;
        if (this.gameStage) this.gameStage.style.display = 'flex';
        if (this.canvas) this.canvas.style.display = 'block';
        const terminalScreen = document.getElementById('terminal-screen');
        if (terminalScreen) terminalScreen.classList.add('is-playing');
        document.querySelector('.game-panel')?.classList.add('is-playing');
        document.body.classList.add('is-playing-view');
        const railKicker = document.querySelector('.action-rail-kicker');
        if (railKicker) railKicker.textContent = 'EN RUN · VDB COBRA EL HARVEST';

        this.updateUI();
        this.syncPlayfieldLayout();
        this.focusPlayfield();
        if (window.retroAudio) {
            window.retroAudio.threat = 0;
            if (window.retroAudio.playReady) window.retroAudio.playReady();
        }

        window.web3Simulator.log(
            `Node booted on ${sectorTitle(this.level)}. Harvest Drops, seize Relics — Exploit swarm inbound: Bitwaddle, Hatglide, Slipkernel & Sourceflip.`,
            'system'
        );

        if (this.gameInterval) clearInterval(this.gameInterval);
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

        this.restartTickLoop();
        const animate = () => {
            if (this.isActive) {
                this.renderMap();
                this._fpsFrames++;
                const now = performance.now();
                if (now - this._fpsLastTs >= 500) {
                    const fps = Math.round((this._fpsFrames * 1000) / (now - this._fpsLastTs));
                    if (this.fpsEl) this.fpsEl.textContent = `${fps} FPS`;
                    this._fpsFrames = 0;
                    this._fpsLastTs = now;
                }
            }
            this.animFrameId = requestAnimationFrame(animate);
        };
        this.animFrameId = requestAnimationFrame(animate);
    }

    /** Sector pacing: each depth speeds ticks and shortens the Audit window. */
    applyLevelPacing() {
        const depth = Math.max(0, this.level - 1);
        this.gameTickMs = Math.max(170, 250 - depth * 12);
        this.frightenedDuration = Math.max(20, 40 - depth * 3);
    }

    restartTickLoop() {
        if (this.gameInterval) clearInterval(this.gameInterval);
        this.gameInterval = setInterval(() => this.gameTick(), this.gameTickMs);
    }

    stopGame() {
        this.isActive = false;
        this.deathAnim = null;
        document.querySelector('.canvas-stack')?.classList.remove('node-death-shake', 'node-death-final');
        if (this.gameInterval) {
            clearInterval(this.gameInterval);
            this.gameInterval = null;
        }
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        if (window.retroAudio) window.retroAudio.stopMusic();
        this.clearArcadeBursts();
        if (this.effectRow) this.effectRow.style.display = 'none';
        if (this.gameStage) this.gameStage.style.display = 'none';
        if (this.canvas) this.canvas.style.display = 'none';
        const terminalScreen = document.getElementById('terminal-screen');
        if (terminalScreen) terminalScreen.classList.remove('is-playing');
        document.querySelector('.game-panel')?.classList.remove('is-playing');
        document.body.classList.remove('is-playing-view');
        const railKicker = document.querySelector('.action-rail-kicker');
        if (railKicker) railKicker.textContent = 'FLUJO · COIN-IN → JUGAR → VDB';
        const prompt = document.getElementById('start-prompt');
        if (prompt) prompt.style.display = 'block';
        this.activeRelic = null;
        if (this.valRelic) this.valRelic.textContent = '—';
        this._phaseKey = '';
        this._stanceKey = '';
        // Keep locked outcome visible briefly only if set; else reset triad
        if (!this._stanceOutcome && this.stanceTriad) this.stanceTriad.dataset.stance = 'vdb';
        this.updatePhaseBanner();
    }

    loadMap() {
        this.map = [];
        this.totalDots = 0;
        const layout = this.getMapLayout();
        this.rows = layout.length;
        for (let r = 0; r < this.rows; r++) {
            this.map[r] = [];
            const row = layout[r].padEnd(this.cols, '#').slice(0, this.cols);
            for (let c = 0; c < this.cols; c++) {
                const tile = row[c];
                this.map[r][c] = tile;
                if (tile === '.' || tile === 'O') this.totalDots++;
            }
        }
        this.dotsRemaining = this.totalDots;
        this.player.x = this.player.startX;
        this.player.y = this.player.startY;
        if (this.canvas) {
            this.canvas.height = this.rows * 20;
            this.canvas.width = this.cols * 20;
        }
    }

    spawnExploits() {
        const ais = [
            { ai: 'chase', r: 8, c: 14, dirR: -1, dirC: 0, releaseIn: 0, scatterR: 1, scatterC: 26 },
            { ai: 'ambush', r: 9, c: 14, dirR: -1, dirC: 0, releaseIn: 12, scatterR: 1, scatterC: 1 },
            { ai: 'vector', r: 7, c: 13, dirR: 0, dirC: -1, releaseIn: 24, scatterR: 15, scatterC: 26 },
            { ai: 'shy', r: 7, c: 15, dirR: 0, dirC: 1, releaseIn: 36, scatterR: 15, scatterC: 1 }
        ];
        this.exploits = GRID_PENGUINS.map((d, id) => ({
            id,
            name: d.name,
            ...ais[id],
            startR: ais[id].r,
            startC: ais[id].c
        }));
    }

    /** Retro START — letter S / on-screen button (same coin-in path as BOOT NODE). */
    tryStartFromInput() {
        if (this.isActive) return;
        if (window.retroAudio) window.retroAudio.playStart();
        const sim = window.web3Simulator;
        if (!sim) return;

        const stakeModal = document.getElementById('stake-confirm-modal');
        if (stakeModal && stakeModal.style.display === 'flex') {
            if (typeof sim.acceptStakeConfirm === 'function') {
                sim.acceptStakeConfirm();
            } else {
                try { document.getElementById('btn-stake-confirm')?.focus(); } catch (_) {}
            }
            return;
        }

        if (!sim.isConnected) {
            sim.log('Connect Xaman first — opening wallet link…', 'system');
            if (typeof sim.connectWallet === 'function') {
                sim.connectWallet();
            } else {
                const tip = 'Connect Xaman and stake XRP to play — no free runs.';
                sim.log(tip, 'alert');
                try { window.alert(tip); } catch (_) {}
            }
            return;
        }

        const block = typeof sim.getPlayBlockReason === 'function' ? sim.getPlayBlockReason() : null;
        if (block) {
            if (typeof sim.resolvePlayBlock === 'function') {
                sim.resolvePlayBlock();
            } else {
                sim.log(block, 'alert');
                try { window.alert(block); } catch (_) {}
            }
            return;
        }

        if (typeof sim.insertCoinTransaction === 'function') {
            sim.insertCoinTransaction();
            return;
        }

        if (typeof sim.openStakeConfirmModal === 'function') {
            if (!sim.participationCoins) sim.participationCoins = 1;
            sim.openStakeConfirmModal();
        }
    }

    setPalette(name) {
        if (this.palettes[name]) {
            this.activePalette = name;
            if (this.map && this.map.length) this.renderMap();
        }
    }

    /** Active skin merged with the wall theme of the current sector. */
    getRenderPalette() {
        const base = this.palettes[this.activePalette];
        const variants = base.sectorWalls;
        if (!variants || !variants.length) return base;
        return { ...base, ...variants[(this.level - 1) % variants.length] };
    }

    // ——— Drawing helpers ———

    wallAt(r, c) {
        if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return true;
        return this.map[r][c] === '#';
    }

    drawWallCell(x, y, ts, palette) {
        const r = Math.round(y / ts);
        const c = Math.round(x / ts);
        // 16-bit pipe walls: dark fill + crisp 2px neon edge toward corridors.
        this.ctx.fillStyle = '#060a14';
        this.ctx.fillRect(x, y, ts, ts);

        const openN = !this.wallAt(r - 1, c);
        const openS = !this.wallAt(r + 1, c);
        const openW = !this.wallAt(r, c - 1);
        const openE = !this.wallAt(r, c + 1);
        if (!(openN || openS || openW || openE)) return;

        const hi = palette.wallHi;
        const mid = palette.wall;
        const inset = 3;
        const thick = 2;
        if (openN) {
            this.ctx.fillStyle = mid;
            this.ctx.fillRect(x + (openW ? inset : 0), y + inset, ts - (openW ? inset : 0) - (openE ? inset : 0), thick + 1);
            this.ctx.fillStyle = hi;
            this.ctx.fillRect(x + (openW ? inset : 0), y + inset, ts - (openW ? inset : 0) - (openE ? inset : 0), thick);
        }
        if (openS) {
            this.ctx.fillStyle = mid;
            this.ctx.fillRect(x + (openW ? inset : 0), y + ts - inset - thick, ts - (openW ? inset : 0) - (openE ? inset : 0), thick + 1);
            this.ctx.fillStyle = hi;
            this.ctx.fillRect(x + (openW ? inset : 0), y + ts - inset - thick, ts - (openW ? inset : 0) - (openE ? inset : 0), thick);
        }
        if (openW) {
            this.ctx.fillStyle = mid;
            this.ctx.fillRect(x + inset, y + (openN ? inset : 0), thick + 1, ts - (openN ? inset : 0) - (openS ? inset : 0));
            this.ctx.fillStyle = hi;
            this.ctx.fillRect(x + inset, y + (openN ? inset : 0), thick, ts - (openN ? inset : 0) - (openS ? inset : 0));
        }
        if (openE) {
            this.ctx.fillStyle = mid;
            this.ctx.fillRect(x + ts - inset - thick, y + (openN ? inset : 0), thick + 1, ts - (openN ? inset : 0) - (openS ? inset : 0));
            this.ctx.fillStyle = hi;
            this.ctx.fillRect(x + ts - inset - thick, y + (openN ? inset : 0), thick, ts - (openN ? inset : 0) - (openS ? inset : 0));
        }
    }

    /**
     * Node — chunky 12×12 chomping VAULT CORE (rounded square, not a circle:
     * distinct silhouette + antenna + eye + fangs keeps us clear of the
     * classic yellow-disc arcade trade dress).
     * Style bible: 3 tones + outline, big 2×2 eye, mouth wedge carved
     * programmatically for all 4 facings (no fine detail below 2×2 px).
     */
    drawNode(cx, cy, radius, palette) {
        const hi = palette.playerHi || '#ffffa8';
        const mid = palette.player || '#fff200';
        const lo = palette.playerLo || '#c9a800';
        const outline = '#0a0a12';
        const dx = this.dirX || -1;
        const dy = this.dirY || 0;
        let face = 'L';
        if (Math.abs(dx) >= Math.abs(dy)) face = dx >= 0 ? 'R' : 'L';
        else face = dy >= 0 ? 'D' : 'U';

        const open = Math.sin(Date.now() / 130) > 0;
        const N = 12;
        const cell = Math.max(2, Math.round((radius * 2) / (N - 2)));
        const ox = -Math.floor((N * cell) / 2);
        const oy = -Math.floor((N * cell) / 2);

        // Rounded-square vault core: small top-left highlight, bottom rim shade
        const ball = [
            '..OOOOOOOO..',
            '.OMHHMMMMMO.',
            'OHHMMMMMMMMO',
            'OHMMMMMMMMMO',
            'OMMMMMMMMMMO',
            'OMMMMMMMMMMO',
            'OMMMMMMMMMMO',
            'OMMMMMMMMMMO',
            'OMMMMMMMMMMO',
            'OMMMMMMMMMLO',
            '.OMMMMMMLLO.',
            '..OOOOOOOO..'
        ];
        const tone = { O: outline, H: hi, M: mid, L: lo };

        // Mouth wedge: "along" axis points into the facing direction
        const axes = {
            L: (x, y) => [x, y],
            R: (x, y) => [N - 1 - x, y],
            U: (x, y) => [y, x],
            D: (x, y) => [N - 1 - y, x]
        };
        const carved = (x, y) => {
            if (!open) return false;
            const [along, perp] = axes[face](x, y);
            return along < 5.5 - Math.abs(perp - 5.5);
        };

        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const ch = ball[y][x];
                if (ch === '.') continue;
                if (carved(x, y)) continue;
                let col = tone[ch];
                // Mouth lip: dark edge with one white fang on each jaw
                if (open && ch !== 'O' &&
                    (carved(x - 1, y) || carved(x + 1, y) || carved(x, y - 1) || carved(x, y + 1))) {
                    const [, perp] = axes[face](x, y);
                    col = (perp === 3 || perp === 8) ? '#fffef5' : outline;
                }
                this.ctx.fillStyle = col;
                this.ctx.fillRect(cx + ox + x * cell, cy + oy + y * cell, cell, cell);
            }
        }

        // Big cute eye — 2×2 white + pupil, placed clear of the mouth per facing
        const eyePos = { L: [4, 2], R: [6, 2], U: [3, 6], D: [3, 3] };
        const [ex, ey] = eyePos[face];
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(cx + ox + ex * cell, cy + oy + ey * cell, 2 * cell, 2 * cell);
        this.ctx.fillStyle = outline;
        this.ctx.fillRect(cx + ox + (face === 'R' ? ex + 1 : ex) * cell, cy + oy + (ey + 1) * cell, cell, cell);

        // Chunky antenna: visible blue stem + glowing tip (bobs with the chomp)
        const tipBob = open ? 0 : 1;
        this.ctx.fillStyle = '#2a6db0';
        this.ctx.fillRect(cx + ox + 5 * cell, cy + oy - (2 - tipBob) * cell, 2 * cell, 2 * cell);
        this.ctx.fillStyle = '#8fd0ff';
        this.ctx.fillRect(cx + ox + 5 * cell, cy + oy - (4 - tipBob) * cell, 2 * cell, 2 * cell);

        // Flat pixel shadow
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.fillRect(cx - N * cell * 0.28, cy + N * cell * 0.42, N * cell * 0.55, Math.max(2, cell));
    }

    drawExploit(g, gx, gy, size, color, vulnerable) {
        const cx = gx + size / 2;
        const cy = gy + size / 2;
        const t = Date.now() / 1000;
        const phase = t * 7 + g.id * 1.7;
        const faceDir = (Math.sign(this.player.x - g.c) || g.dirC || -1) < 0 ? -1 : 1;

        // Stepped, pixel-aligned motion only (no rotation — keeps sprites crisp).
        // Each foe gets a signature move + accessory frame (accFrame).
        let bob = 0;
        let slideX = 0;
        let footFrame = Math.floor(phase * 2.2) % 2;
        let accFrame = 0;

        if (vulnerable) {
            // Panicked shiver
            bob = Math.sin(phase * 4) > 0 ? -1 : 1;
            slideX = Math.sin(phase * 6) > 0 ? 1 : -1;
        } else if (g.id === 0) {
            // Bitwaddle — heavy stomp; scarf tail flutters with each step
            const stomp = Math.sin(phase * 1.6) > 0;
            bob = stomp ? 0 : 2;
            footFrame = stomp ? 0 : 1;
            accFrame = footFrame;
        } else if (g.id === 1) {
            // Hatglide — clean hop; hat floats off the head at the apex
            const airborne = Math.sin(phase * 1.9) > 0.2;
            bob = airborne ? -3 : 0;
            accFrame = airborne ? 1 : 0;
        } else if (g.id === 2) {
            // Slipkernel — belly glide; crest sways against the drift
            slideX = Math.round(Math.sin(phase * 1.5) * 2);
            bob = 1;
            accFrame = Math.sin(phase * 1.5) > 0 ? 1 : 0;
        } else {
            // Sourceflip — bounces, then does a full head-over-heels flip
            const flipping = Math.floor(phase * 0.35) % 6 === 0;
            bob = flipping ? -3 : (Math.abs(Math.sin(phase * 2)) > 0.5 ? -2 : 0);
            accFrame = flipping ? 1 : 0;
        }

        // Flat pixel shadow
        const px = Math.max(2, Math.floor(size / 12));
        this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
        this.ctx.fillRect(
            Math.round(cx + slideX - size * 0.28),
            Math.round(cy + size * 0.42),
            Math.round(size * 0.56),
            Math.max(2, px)
        );

        this.drawPixelPenguin(
            Math.round(cx + slideX), Math.round(cy + bob),
            size, color, vulnerable, g.id, faceDir, footFrame, accFrame, phase
        );
    }

    /**
     * Chubby kawaii penguins — front-facing 14×13 grid, no sub-2×2 details.
     * One BOLD accessory each, animated by accFrame:
     * Bitwaddle scarf-tail flutter · Hatglide floating hat · Slipkernel crest
     * sway · Sourceflip full flip. Frightened mode swaps to a shared template.
     */
    drawPixelPenguin(cx, cy, size, color, vulnerable, variant, faceDir, footFrame, accFrame, phase) {
        const cols = 14;
        const cell = Math.max(2, Math.round(size / 12));
        const ox = -Math.floor((cols * cell) / 2);
        const oy = -Math.floor((13 * cell) / 2);

        const feetRow = footFrame === 0 ? '....FF..FF....' : '...FF....FF...';
        const blink = !vulnerable && Math.sin(phase * 0.8 + variant) > 0.94;
        const E = blink ? 'W' : 'E';

        let sprite;
        if (vulnerable) {
            // Shared scared face: wide white eyes + zigzag mouth, no accessories
            sprite = [
                '....OOOOOO....',
                '..OOBBBBBBOO..',
                '..OBBBBBBBBO..',
                '..OBBBBBBBBO..',
                '..OBWWBBWWBO..',
                '..OBWWBBWWBO..',
                '..OBBBBBBBBO..',
                '.OBWBWBBWBWBO.',
                '.OBBWBWWBWBBO.',
                '.OBBBBBBBBBBO.',
                '..OBBBBBBBBO..',
                '...OBBBBBBO...',
                feetRow
            ];
        } else if (variant === 0) {
            // Bitwaddle — chunky scarf band; tail flutters on each stomp
            const tail = accFrame ? '.OYYYWWWWBBBO.' : '.OBYYWWWWBBBO.';
            sprite = [
                '....OOOOOO....',
                '..OOBBBBBBOO..',
                '..OBBBBBBBBO..',
                '..OBWWWWWWBO..',
                `..OB${E}${E}WW${E}${E}BO..`,
                '..OBWWWWWWBO..',
                '..OBWWKKWWBO..',
                '.OBBWWKKWWBBO.',
                '.OYYYYYYYYYYO.',
                tail,
                '..OBBWWWWBBO..',
                '...OBBBBBBO...',
                feetRow
            ];
        } else if (variant === 1) {
            // Hatglide — flat hat with gold band; floats off the head mid-hop
            // (hat rows get a -1 cell lift in the paint loop below)
            const dome = accFrame ? '..OOBBBBBBOO..' : '..OBWWWWWWBO..';
            sprite = [
                '...AAAAAAAA...',
                '...AAYYYYAA...',
                '..AAAAAAAAAA..',
                dome,
                `..OB${E}${E}WW${E}${E}BO..`,
                '..OBWWWWWWBO..',
                '..OBWWKKWWBO..',
                '.OBBWWKKWWBBO.',
                '.OBBWWWWWWBBO.',
                '.OBBWWWWWWBBO.',
                '..OBBWWWWBBO..',
                '...OBBBBBBO...',
                feetRow
            ];
        } else if (variant === 2) {
            // Slipkernel — single chunky crest; sways against the glide
            const crest = accFrame ? '.....CC.......' : '.......CC.....';
            const crestBase = accFrame ? '..OOBCCBBBOO..' : '..OOBBBCCBOO..';
            sprite = [
                crest,
                crestBase,
                '..OBBBBBBBBO..',
                '..OBWWWWWWBO..',
                `..OB${E}${E}WW${E}${E}BO..`,
                '..OBWWWWWWBO..',
                '..OBWWKKWWBO..',
                '.OBBWWKKWWBBO.',
                '.OBBWWWWWWBBO.',
                '.OBBWWWWWWBBO.',
                '..OBBWWWWBBO..',
                '...OBBBBBBO...',
                feetRow
            ];
        } else {
            // Sourceflip — big gold goggle band; does a full head-over-heels flip
            sprite = [
                '....OOOOOO....',
                '..OOBBBBBBOO..',
                '..OBBBBBBBBO..',
                '..OGGGGGGGGO..',
                `..OG${E}${E}GG${E}${E}GO..`,
                '..OGGGGGGGGO..',
                '..OBWWKKWWBO..',
                '.OBBWWKKWWBBO.',
                '.OBBWWWWWWBBO.',
                '.OBBWWWWWWBBO.',
                '..OBBWWWWBBO..',
                '...OBBBBBBO...',
                feetRow
            ];
            if (accFrame) sprite = sprite.slice().reverse();
        }

        const paint = {
            O: '#0a0a12',
            B: vulnerable ? '#4a63c8' : color,
            C: vulnerable ? '#4a63c8' : this.shade(color, -0.3),
            W: vulnerable ? '#eef2ff' : '#f4f7ff',
            E: '#0a0a12',
            K: '#ffb020',
            F: '#ffb020',
            Y: '#ffe14d',
            A: '#7a2fe0',
            G: '#ffe14d'
        };

        // Hat lift: Hatglide's hat rows float one cell above the head mid-hop
        const hatLift = (!vulnerable && variant === 1 && accFrame) ? -1 : 0;

        for (let y = 0; y < sprite.length; y++) {
            const row = sprite[y];
            const dy = (hatLift && y <= 2) ? hatLift : 0;
            for (let gx = 0; gx < row.length; gx++) {
                const ch = row[gx];
                if (!ch || ch === '.') continue;
                const c = paint[ch];
                if (!c) continue;
                const x = faceDir > 0 ? cols - 1 - gx : gx;
                this.ctx.fillStyle = c;
                this.ctx.fillRect(cx + ox + x * cell, cy + oy + (y + dy) * cell, cell, cell);
            }
        }

        // Scared sweat drop — chunky 2×2
        if (vulnerable && Math.floor(phase * 2) % 2 === 0) {
            const sx = faceDir > 0 ? 1 : 11;
            this.ctx.fillStyle = '#bfe8ff';
            this.ctx.fillRect(cx + ox + sx * cell, cy + oy + 1 * cell, 2 * cell, 2 * cell);
        }
    }

    shade(hex, amount) {
        // amount > 0 darkens, amount < 0 lightens
        const n = parseInt(hex.slice(1), 16);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        if (amount >= 0) {
            r = Math.max(0, Math.floor(r * (1 - amount)));
            g = Math.max(0, Math.floor(g * (1 - amount)));
            b = Math.max(0, Math.floor(b * (1 - amount)));
        } else {
            const t = -amount;
            r = Math.min(255, Math.floor(r + (255 - r) * t));
            g = Math.min(255, Math.floor(g + (255 - g) * t));
            b = Math.min(255, Math.floor(b + (255 - b) * t));
        }
        return `rgb(${r},${g},${b})`;
    }

    /** Pixel sparkle for collectibles — single chunky 2×2, nothing finer. */
    drawItemSpark(ox, oy, on) {
        if (!on) return;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(ox, oy, 2, 2);
    }

    /** Paint a small centered pixel template (rows of equal width). */
    paintPixelIcon(cx, cy, sprite, paint, cell = 2) {
        const rows = sprite.length;
        const cols = sprite[0].length;
        const ox = -Math.floor((cols * cell) / 2);
        const oy = -Math.floor((rows * cell) / 2);
        for (let y = 0; y < rows; y++) {
            const row = sprite[y];
            for (let x = 0; x < row.length; x++) {
                const ch = row[x];
                if (!ch || ch === '.') continue;
                const c = paint[ch];
                if (!c) continue;
                this.ctx.fillStyle = c;
                this.ctx.fillRect(cx + ox + x * cell, cy + oy + y * cell, cell, cell);
            }
        }
    }

    drawRelic(cx, cy, relic) {
        const t = Date.now();
        const bob = Math.sin(t / 180) > 0 ? -1 : 1; // stepped bob
        const twinkle = Math.sin(t / 120) > 0;
        const mid = relic.color;
        const hi = relic.accent;
        const lo = this.shade(relic.color, 0.4);
        const out = '#0a0a12';
        this.ctx.save();
        this.ctx.translate(Math.round(cx), Math.round(cy + bob));

        if (relic.key === 'spray') {
            // Mist Shard — pixel diamond
            this.paintPixelIcon(0, 0, [
                '....H.....',
                '...HMH....',
                '..HMCMH...',
                '.HMCCCMH..',
                'HMCCCCCMH.',
                '.HMCCCMH..',
                '..HMCMH...',
                '...HMH....',
                '....H.....'
            ], { H: hi, M: mid, C: lo, O: out }, 2);
            this.drawItemSpark(4, -10, twinkle);
        } else if (relic.key === 'hook') {
            // Hook Sigil — pixel C-hook + barb
            this.paintPixelIcon(0, 0, [
                '..OOOOH...',
                '.OMMMHH...',
                'OMHH......',
                'OMH.......',
                'OMH.......',
                'OMHH......',
                '.OMMMHH...',
                '..OOOOH...',
                '.....HHAA.',
                '......AA..'
            ], { O: out, M: mid, H: hi, A: hi }, 2);
            this.drawItemSpark(-6, -8, twinkle);
        } else if (relic.key === 'amm') {
            // Liquidity Prism — stacked diamond
            this.paintPixelIcon(0, 0, [
                '....H.....',
                '...HMH....',
                '..HMCMH...',
                '.HMCCCMH..',
                'HMCCWCCMH.',
                '.HMCCCMH..',
                '..HMCMH...',
                '...HMH....',
                '....H.....',
                '...OOO....'
            ], { H: hi, M: mid, C: lo, W: '#ffffff', O: out }, 2);
            this.drawItemSpark(5, -9, twinkle);
        } else if (relic.key === 'validator') {
            // Beacon Crest — pixel shield + seal
            this.paintPixelIcon(0, 0, [
                '.OOOOOOOO.',
                'OHHHHHHHHO',
                'OHMMMMMMHO',
                'OHMCCCCMHO',
                'OHMCWWCMHO',
                'OHMCCCCMHO',
                'OHMMMMMMHO',
                '.OHMMMMHO.',
                '..OHMMHO..',
                '...OHHO...'
            ], { O: out, H: hi, M: mid, C: lo, W: '#1a1208' }, 2);
            this.drawItemSpark(6, -8, twinkle);
        } else {
            // Finality Orb — pixel sphere + orbit ticks
            this.paintPixelIcon(0, 0, [
                '...OOOO...',
                '..OHHHHO..',
                '.OHWWWWHO.',
                'OHWMMMWMHO',
                'OHMMMMMMHO',
                'OHMMMMMMHO',
                '.OHMMMHO..',
                '..OHHHO...',
                '...OOO....'
            ], { O: out, H: hi, W: '#ffffff', M: mid }, 2);
            // Orbit sparks (stepped)
            const ang = Math.floor(t / 100) % 8;
            const ring = [
                [8, 0], [6, 3], [0, 5], [-6, 3], [-8, 0], [-6, -3], [0, -5], [6, -3]
            ];
            const [rx, ry] = ring[ang];
            this.ctx.fillStyle = hi;
            this.ctx.fillRect(rx, ry, 2, 2);
            this.drawItemSpark(-5, -9, twinkle);
        }
        this.ctx.restore();
    }

    drawDrop(x, y, ts, color) {
        // Tiny binary shard
        this.ctx.fillStyle = color;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 4;
        this.ctx.fillRect(x + ts / 2 - 1.5, y + ts / 2 - 1.5, 3, 3);
        this.ctx.shadowBlur = 0;
    }

    drawAuditCert(x, y, ts, color) {
        // Chunky energy seal — big rounded gem with a pulsing white core
        const cx = Math.round(x + ts / 2);
        const cy = Math.round(y + ts / 2);
        const t = Date.now();
        const pulse = Math.sin(t / 220) > 0;
        const hi = this.shade(color, -0.3);
        const mid = color;
        const out = '#0a120e';

        this.ctx.save();
        this.ctx.translate(cx, cy + (pulse ? -1 : 0));
        this.paintPixelIcon(0, 0, [
            '..OOOO..',
            '.OHHHHO.',
            'OHMMMMHO',
            'OHMWWMHO',
            'OHMWWMHO',
            'OHMMMMHO',
            '.OHMMHO.',
            '..OOOO..'
        ], {
            O: out,
            H: hi,
            M: mid,
            W: pulse ? '#ffffff' : hi
        }, 2);
        this.ctx.restore();
    }

    renderMap() {
        if (!this.ctx || !this.canvas) return;
        const ts = 20;
        let palette = this.getRenderPalette();

        // Sector-seal celebration: walls strobe white for a beat
        if (this.wallFlashUntil && performance.now() < this.wallFlashUntil) {
            if (Math.floor(performance.now() / 130) % 2 === 0) {
                palette = { ...palette, wall: '#dff2ff', wallHi: '#ffffff', wallLo: '#9ad4ff' };
            }
        }

        // Ambient grid bg
        this.ctx.fillStyle = palette.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.strokeStyle = 'rgba(80,120,200,0.04)';
        this.ctx.lineWidth = 1;
        for (let x = 0; x < this.canvas.width; x += ts) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const char = this.map[r][c];
                const x = c * ts;
                const y = r * ts;

                if (char === '#') {
                    this.drawWallCell(x, y, ts, palette);
                } else if (char === 'H') {
                    this.ctx.fillStyle = '#1a0a24';
                    this.ctx.fillRect(x, y, ts, ts);
                    this.ctx.fillStyle = 'rgba(224,86,253,0.08)';
                    this.ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);
                } else if (char === '.') {
                    this.drawDrop(x, y, ts, palette.dot);
                } else if (char === 'O') {
                    this.drawAuditCert(x, y, ts, palette.pellet);
                } else if (char === 'R' && this.activeRelic) {
                    this.drawRelic(x + ts / 2, y + ts / 2, this.activeRelic);
                }
            }
        }

        // Node (hidden during death shatter — drawn by drawNodeDeathAnim)
        const dying = this.deathAnim?.active;
        if (!dying && !(this.invulnerableTurns > 0 && Math.floor(Date.now() / 100) % 2 === 0)) {
            this.drawNode(
                this.player.x * ts + ts / 2,
                this.player.y * ts + ts / 2,
                (ts / 2 - 1.5) * 1.1,
                palette
            );
        }

        // Exploits (dimmed while Node dies)
        this.exploits.forEach(g => {
            const vulnerable = this.frightenedTurns > 0;
            const color = vulnerable
                ? (this.frightenedTurns < 12 && Date.now() % 400 < 200 ? '#ffffff' : palette.frightened)
                : palette.exploits[g.id];
            const eSize = (ts - 4) * 1.1 * 1.125; // foe scale (+25% then -10%)
            const ePad = (ts - eSize) / 2;
            if (dying) this.ctx.globalAlpha = 0.35;
            this.drawExploit(g, g.c * ts + ePad, g.r * ts + ePad, eSize, color, vulnerable);
            if (dying) this.ctx.globalAlpha = 1;
        });

        // Floating score pops (canvas fallback / small points)
        this.floatingScores = this.floatingScores.filter(f => {
            f.life--;
            f.y -= f.drift || 0.45;
            const alpha = Math.max(0, f.life / (f.maxLife || 30));
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.font = f.font || 'bold 11px Outfit, sans-serif';
            this.ctx.lineWidth = 3;
            this.ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            this.ctx.fillStyle = f.color || '#fff';
            this.ctx.strokeText(f.text, f.x, f.y);
            this.ctx.fillText(f.text, f.x, f.y);
            this.ctx.restore();
            return f.life > 0;
        });

        if (this.introTicks > 0 && !dying) this.drawSectorIntro();

        if (dying) this.drawNodeDeathAnim();
    }

    /** Frozen READY! card announcing the sector name and depth. */
    drawSectorIntro() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const midY = Math.floor(h / 2);
        const pal = this.getRenderPalette();

        ctx.save();
        ctx.fillStyle = 'rgba(2,6,14,0.72)';
        ctx.fillRect(0, midY - 56, w, 112);
        ctx.strokeStyle = '#ffe14d';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, midY - 56, w - 8, 112);

        ctx.textAlign = 'center';
        ctx.font = 'bold 11px "Courier Prime", monospace';
        ctx.fillStyle = '#8fd0ff';
        ctx.fillText('MOMENT · HOLD · BREATHE', w / 2, midY - 34);

        ctx.font = 'bold 14px "Courier Prime", monospace';
        ctx.fillStyle = pal.wallHi;
        ctx.fillText(`SECTOR ${sectorTitle(this.level).toUpperCase()}`, w / 2, midY - 12);

        const blink = Math.floor(performance.now() / 220) % 2 === 0;
        if (blink) {
            ctx.font = 'bold 28px "Courier Prime", monospace';
            ctx.fillStyle = '#ffe14d';
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.lineWidth = 4;
            ctx.strokeText('READY!', w / 2, midY + 22);
            ctx.fillText('READY!', w / 2, midY + 22);
        }
        ctx.font = 'bold 10px "Courier Prime", monospace';
        ctx.fillStyle = '#ff8a55';
        ctx.fillText('SWARM INBOUND — TENSION ON', w / 2, midY + 44);
        ctx.restore();
    }

    /**
     * Punchy “where am I” moment for the phase banner.
     * Priority: death > ready > audit > reboot > heat > chase > scatter.
     */
    resolvePhaseMoment() {
        const sector = sectorTitle(this.level);
        const left = this.dotsRemaining | 0;
        const total = Math.max(1, this.totalDots | 0);
        const cleared = Math.round((1 - left / total) * 100);
        const heat = left > 0 && left < 45;

        if (!this.isActive) {
            return {
                key: 'idle',
                phase: 'idle',
                kicker: 'MOMENT',
                title: 'LOBBY',
                detail: 'Connect Xaman · stake XRP · the Grid owns your nerves',
                meter: 0,
                showMeter: false
            };
        }
        if (this.deathAnim?.active) {
            return {
                key: 'breach',
                phase: 'breach',
                kicker: this.deathAnim.final ? 'FINAL BREACH' : 'BREACH',
                title: this.deathAnim.final ? 'LIQUIDATED' : 'NODE HIT',
                detail: this.deathAnim.final
                    ? `${sector} · uptime 0 — session sealing`
                    : `${sector} · reboot window · uptime ${this.lives}`,
                meter: 1,
                showMeter: true
            };
        }
        if (this.introTicks > 0) {
            return {
                key: `ready-${this.level}`,
                phase: 'ready',
                kicker: 'MOMENT',
                title: 'READY!',
                detail: `${sector} · hold still — swarm about to move`,
                meter: Math.min(1, this.introTicks / 10),
                showMeter: true
            };
        }
        if (this.frightenedTurns > 0) {
            const secs = Math.ceil(this.frightenedTurns / 4);
            return {
                key: `audit-${secs}`,
                phase: 'audit',
                kicker: 'AUDIT WINDOW',
                title: 'SLASH NOW',
                detail: `${sector} · exploits exposed · ${secs}s left · greed is loud`,
                meter: Math.min(1, this.frightenedTurns / this.frightenedDuration),
                showMeter: true
            };
        }
        if (this.invulnerableTurns > 0) {
            return {
                key: `reboot-${this.invulnerableTurns}`,
                phase: 'reboot',
                kicker: 'REBOOT',
                title: 'GHOST FRAME',
                detail: `${sector} · brief invuln · get distance before chase`,
                meter: Math.min(1, this.invulnerableTurns / 14),
                showMeter: true
            };
        }
        if (heat) {
            return {
                key: `heat-${this.globalMode}`,
                phase: 'heat',
                kicker: 'HEAT',
                title: 'LAST DROPS',
                detail: `${sector} · ${left} left · Bitwaddle smells blood · ${cleared}% cleared`,
                meter: cleared / 100,
                showMeter: true
            };
        }
        if (this.globalMode === 'chase') {
            return {
                key: 'chase',
                phase: 'chase',
                kicker: 'SWARM',
                title: 'CHASE',
                detail: `${sector} · they hunt uptime · ${left} drops · ${cleared}% cleared`,
                meter: cleared / 100,
                showMeter: true
            };
        }
        return {
            key: 'scatter',
            phase: 'scatter',
            kicker: 'SWARM',
            title: 'SCATTER',
            detail: `${sector} · they peel off — harvest hard · ${left} drops · ${cleared}% cleared`,
            meter: cleared / 100,
            showMeter: true
        };
    }

    updatePhaseBanner() {
        const m = this.resolvePhaseMoment();
        if (!this.phaseBanner) return;
        if (m.key !== this._phaseKey) {
            this._phaseKey = m.key;
            this.phaseBanner.dataset.phase = m.phase;
            if (this.phaseKicker) this.phaseKicker.textContent = m.kicker;
            if (this.phaseTitle) this.phaseTitle.textContent = m.title;
            if (this.phaseDetail) this.phaseDetail.textContent = m.detail;
        } else if (this.phaseDetail && m.detail !== this.phaseDetail.textContent) {
            this.phaseDetail.textContent = m.detail;
        }
        if (this.phaseMeter && this.phaseMeterFill) {
            if (m.showMeter) {
                this.phaseMeter.hidden = false;
                this.phaseMeterFill.style.width = `${Math.round((m.meter || 0) * 100)}%`;
            } else {
                this.phaseMeter.hidden = true;
            }
        }
        this.updateStanceTriad(m);
        this.updateBetBoard(m);
    }

    /** Drop reward constant (mirrors XRPL.DROP_REWARD). */
    dropRewardXrp() {
        return Number(window.XRPL?.DROP_REWARD) || 0.0005;
    }

    /**
     * Live “you're betting you clear this level” board:
     * progress + IF CLEAR / IF VDB NOW / IF LOSE consequences.
     */
    updateBetBoard(moment) {
        const board = document.getElementById('bet-board');
        if (!board) return;

        const left = this.dotsRemaining | 0;
        const total = Math.max(1, this.totalDots | 0);
        const clearedPct = this.isActive
            ? Math.min(100, Math.round((1 - left / total) * 100))
            : 0;
        const onBoardXrp = this.round3(left * this.dropRewardXrp());
        const pending = Number(window.web3Simulator?.sessionPendingEarn || 0);
        const escrow = Number(window.web3Simulator?.sessionEarnEscrow || 0.35);
        const unpaid = Math.max(0, escrow - pending);
        const nextName = GRID_SECTORS[this.level % GRID_SECTORS.length] || 'NEXT';
        const sector = sectorTitle(this.level);
        const heat = this.isActive && left > 0 && left < 45;

        const fill = document.getElementById('bet-clear-fill');
        const label = document.getElementById('bet-clear-label');
        const odds = document.getElementById('bet-odds');
        const clearBody = document.getElementById('bet-if-clear-body');
        const vdbBody = document.getElementById('bet-if-vdb-body');
        const loseBody = document.getElementById('bet-if-lose-body');
        const pulse = document.getElementById('bet-pulse');

        if (fill) fill.style.width = `${clearedPct}%`;
        if (label) {
            label.textContent = this.isActive
                ? `${clearedPct}% · ${left} DROPS TO SEAL`
                : 'BOOT TO BET THE CLEAR';
        }

        // Rough “odds” flavor from uptime + heat + clear progress (not RNG — tension dial)
        let oddsLabel = '—';
        if (this.isActive) {
            if (this._stanceOutcome) {
                oddsLabel = `LOCKED · ${this._stanceOutcome.toUpperCase()}`;
            } else if (moment?.phase === 'breach') {
                oddsLabel = 'BREACH · BET FAILING';
            } else if (this.lives <= 1 && heat) {
                oddsLabel = 'THIN ICE · DON\'T GREED';
            } else if (clearedPct >= 75) {
                oddsLabel = 'ALMOST · CLOSE THE BET';
            } else if (clearedPct >= 50) {
                oddsLabel = 'HALFWAY · SWARM WATCHING';
            } else if (moment?.phase === 'audit') {
                oddsLabel = 'AUDIT · SLASH OR GREED';
            } else {
                oddsLabel = `LIVE BET · ${sector.toUpperCase()}`;
            }
        }
        if (odds) odds.textContent = oddsLabel;

        if (clearBody) {
            clearBody.textContent = this.isActive
                ? `+500 pts · ~${onBoardXrp} XRP still on floor · → ${nextName}`
                : '+500 pts · next sector · more reclaim';
        }
        if (vdbBody) {
            vdbBody.textContent = this.isActive
                ? `Take +${pending.toFixed(4)} XRP · leave ${unpaid.toFixed(4)} to pools`
                : 'Leave with harvest only';
        }
        if (loseBody) {
            loseBody.textContent = this.isActive
                ? (this.lives <= 1
                    ? `Final life · settle ~${pending.toFixed(4)} · rest → pools`
                    : `Hit → uptime ${Math.max(0, this.lives - 1)} · scraps ~${pending.toFixed(4)}`)
                : 'Uptime 0 · scraps only';
        }

        board.dataset.heat = heat ? '1' : '0';
        if (pulse) {
            pulse.classList.toggle('is-hot', heat || clearedPct >= 75);
            if (!this.isActive) {
                pulse.textContent = 'Arcade rule: you paid to participate — clearing sectors is how you play that payment out.';
            } else if (this._stanceOutcome) {
                pulse.textContent = `Run closed → ${this._stanceOutcome.toUpperCase()}. Payment already spent as play.`;
            } else if (heat) {
                pulse.textContent = `HEAT — ${left} drops left. You paid in; finish before Bitwaddle does.`;
            } else if (moment?.phase === 'chase') {
                pulse.textContent = `CHASE — still playing your coin-in. VDB banks +${pending.toFixed(4)} XRP right now.`;
            } else if (moment?.phase === 'audit') {
                pulse.textContent = `AUDIT — slash while it lasts. Clear still pays +500 + floor XRP.`;
            } else {
                pulse.textContent = `Playing your stake on ${sector}: ${left} drops left · VDB now = +${pending.toFixed(4)} XRP.`;
            }
        }

        this.maybeAnnounceClearMilestone(clearedPct);
        this.updateStakeTicker({ pending, escrow, clearedPct });
    }

    /**
     * In-run stake meter: coin-in vs harvest now vs net vs lose scraps.
     * Shown while playing (bet-board hidden for canvas space).
     */
    updateStakeTicker(ctx = {}) {
        const ticker = document.getElementById('stake-ticker');
        if (!ticker) return;

        const sim = window.web3Simulator;
        const stake = Number(sim?.sessionStake || window.XRPL?.ENTRY_STAKE || 0.5);
        const show = this.isActive && stake > 0;

        if (!show) {
            ticker.hidden = true;
            return;
        }
        ticker.hidden = false;

        const pending = ctx.pending ?? Number(sim?.sessionPendingEarn || 0);
        const escrow = ctx.escrow ?? Number(sim?.sessionEarnEscrow || stake * (window.XRPL?.STAKE_SPLIT?.earn ?? 0.7));
        const maxMult = Number(window.XRPL?.MAX_RECLAIM_MULT || 1.1);
        const maxPayout = this.roundXrp(stake * maxMult);
        const returnNow = Math.min(pending, escrow, maxPayout);
        const net = this.roundXrp(returnNow - stake);
        const recoveryPct = Math.min(100, Math.round((returnNow / stake) * 100));
        const barPct = Math.min(100, Math.round((returnNow / maxPayout) * 100));

        const paidEl = document.getElementById('stake-ticker-paid');
        const pctEl = document.getElementById('stake-ticker-pct');
        const fillEl = document.getElementById('stake-ticker-fill');
        const vdbEl = document.getElementById('stake-ticker-vdb');
        const netEl = document.getElementById('stake-ticker-net');
        const loseEl = document.getElementById('stake-ticker-lose');

        if (paidEl) paidEl.textContent = stake.toFixed(2);
        if (pctEl) {
            pctEl.textContent = this._stanceOutcome
                ? `LOCK · ${this._stanceOutcome.toUpperCase()}`
                : `${recoveryPct}% back`;
        }
        if (fillEl) fillEl.style.width = `${barPct}%`;
        if (vdbEl) vdbEl.textContent = returnNow.toFixed(4);
        if (loseEl) loseEl.textContent = returnNow.toFixed(4);
        if (netEl) {
            const sign = net >= 0 ? '+' : '−';
            netEl.textContent = `${sign}${Math.abs(net).toFixed(4)}`;
        }

        let state = 'down';
        if (this._stanceOutcome) state = 'locked';
        else if (returnNow >= stake) state = 'ahead';
        else if (returnNow >= stake * 0.35) state = 'recovering';
        ticker.dataset.state = state;
    }

    roundXrp(n) {
        return Math.round(Number(n) * 1e6) / 1e6;
    }

    round3(n) {
        return (Math.round(Number(n) * 1000) / 1000).toFixed(3);
    }

    maybeAnnounceClearMilestone(clearedPct) {
        if (!this.isActive || !window.web3Simulator?.log) return;
        const marks = [25, 50, 75];
        for (const m of marks) {
            if (clearedPct >= m && this._clearMilestone < m) {
                this._clearMilestone = m;
                const left = this.dotsRemaining | 0;
                const onBoard = this.round3(left * this.dropRewardXrp());
                window.web3Simulator.log(
                    `Clear bet ${m}% — ${left} drops left (~${onBoard} XRP on floor). Seal = +500 · still your call: PUSH / VDB / die.`,
                    m >= 75 ? 'alert' : 'event'
                );
            }
        }
    }

    /**
     * Three doors always: WIN (push), VDB (bail with harvest), LOSE (breach).
     * Highlights the pressure you're under — outcome locks on settle/death.
     */
    resolveStance(moment) {
        if (this._stanceOutcome) return this._stanceOutcome;
        if (!this.isActive) return 'vdb';
        if (moment?.phase === 'breach' || (this.deathAnim?.active && this.deathAnim.final)) return 'lose';
        if (this.deathAnim?.active) return 'lose';
        if (this.lives <= 1 && (moment?.phase === 'chase' || moment?.phase === 'heat')) return 'lose';
        const pending = Number(window.web3Simulator?.sessionPendingEarn || 0);
        const escrow = Number(window.web3Simulator?.sessionEarnEscrow || 0.35);
        const cleared = this.totalDots ? 1 - (this.dotsRemaining / this.totalDots) : 0;
        if (moment?.phase === 'audit' && pending > 0.02) return 'win';
        if (this.level >= 2 && this.lives >= 2) return 'win';
        if (cleared >= 0.55 && this.lives >= 2) return 'win';
        if (pending >= escrow * 0.45 && this.lives >= 2) return 'win';
        return 'vdb';
    }

    updateStanceTriad(moment) {
        if (!this.stanceTriad) return;
        const stance = this.resolveStance(moment || this.resolvePhaseMoment());
        if (stance !== this._stanceKey) {
            this._stanceKey = stance;
            this.stanceTriad.dataset.stance = stance;
        }
        const pending = Number(window.web3Simulator?.sessionPendingEarn || 0);
        const left = this.dotsRemaining | 0;
        const onBoard = this.round3(left * this.dropRewardXrp());
        if (this.stancePending) {
            this.stancePending.textContent = `+${pending.toFixed(4)} XRP`;
        }
        const winBlurb = document.getElementById('stance-win-blurb');
        const vdbBlurb = document.getElementById('stance-vdb-blurb');
        const loseBlurb = document.getElementById('stance-lose-blurb');
        if (winBlurb && this.isActive) {
            winBlurb.textContent = left > 0
                ? `Seal = +500 · ~${onBoard} XRP still on floor`
                : 'Sector sealed — push the next bet';
        }
        if (vdbBlurb && this.isActive) {
            vdbBlurb.textContent = `Bank +${pending.toFixed(4)} now · forfeit the clear`;
        }
        if (loseBlurb && this.isActive) {
            loseBlurb.textContent = this.lives <= 1
                ? `Last uptime — die = scraps +${pending.toFixed(4)}`
                : `Hit costs 1 uptime · harvest at risk`;
        }
        ['win', 'vdb', 'lose'].forEach((id) => {
            const el = document.getElementById(`stance-${id}`);
            if (!el) return;
            el.classList.toggle('is-locked', !!this._stanceOutcome && this._stanceOutcome === id);
        });
    }

    /** Lock the triad when the run resolves (WIN seal fantasy / VDB claim / LOSE). */
    lockStanceOutcome(outcome) {
        this._stanceOutcome = outcome === 'win' || outcome === 'lose' ? outcome : 'vdb';
        this._stanceKey = '';
        this.updateStanceTriad();
        if (window.web3Simulator?.log) {
            const labels = {
                win: 'WIN locked — you pushed the Grid.',
                vdb: 'VDB locked — Voluntary Departure Bail · harvest settled.',
                lose: 'LOSE locked — swarm took the Node.'
            };
            window.web3Simulator.log(labels[this._stanceOutcome], this._stanceOutcome === 'lose' ? 'alert' : 'event');
        }
    }

    /**
     * Dramatic Node death: freeze ticks, shatter vault-core, then respawn or liquidate.
     */
    beginNodeDeath(killer) {
        if (this.deathAnim?.active) return;
        const final = this.lives <= 0;
        this.deathAnim = {
            active: true,
            t0: performance.now(),
            duration: final ? 1900 : 1250,
            c: this.player.x,
            r: this.player.y,
            final,
            killer: (killer?.name || 'EXPLOIT').toUpperCase()
        };

        const stack = document.querySelector('.canvas-stack');
        if (stack) {
            stack.classList.remove('node-death-shake', 'node-death-final');
            void stack.offsetWidth;
            stack.classList.add('node-death-shake');
            if (final) stack.classList.add('node-death-final');
        }

        this.spawnArcadeBurst({
            title: this.deathAnim.killer,
            ono: final ? 'LIQUIDATED!' : 'BREACHED!',
            scoreText: final ? 'UPTIME 0' : `UPTIME ${this.lives}`,
            color: final ? '#ff1744' : '#ff6b35',
            accent: '#ffe14d',
            c: this.player.x,
            r: this.player.y,
            kind: 'death'
        });

        if (final && window.retroAudio?.playGameOver) {
            // Death sting already from loseLifeTransaction; layer game-over fall for finale
            setTimeout(() => window.retroAudio.playGameOver(), 280);
        }
    }

    finishNodeDeath() {
        const final = !!this.deathAnim?.final;
        this.deathAnim = null;
        const stack = document.querySelector('.canvas-stack');
        stack?.classList.remove('node-death-shake', 'node-death-final');

        if (final) {
            this.stopGame();
            window.web3Simulator.triggerPermadeath();
            return;
        }

        this.player.x = this.player.startX;
        this.player.y = this.player.startY;
        this.dirX = -1;
        this.dirY = 0;
        this.nextDirX = -1;
        this.nextDirY = 0;
        this.invulnerableTurns = 14;
        this.frightenedTurns = 0;
        this.slashChain = 0;
        this.introTicks = 6; // brief READY! beat before the respawned Node goes live
        if (this.activeRelic) this.expireRelic();
        this.spawnExploits();
    }

    drawNodeDeathAnim() {
        const a = this.deathAnim;
        if (!a || !this.ctx || !this.canvas) return;

        const ts = 20;
        const cx = a.c * ts + ts / 2;
        const cy = a.r * ts + ts / 2;
        const elapsed = performance.now() - a.t0;
        const t = Math.min(1, elapsed / a.duration);
        const ctx = this.ctx;
        const palette = this.getRenderPalette();

        ctx.save();

        // Red / void wash
        const wash = a.final ? 0.22 + t * 0.45 : 0.12 + t * 0.28;
        ctx.fillStyle = `rgba(${a.final ? 120 : 160}, 0, ${a.final ? 30 : 18}, ${wash})`;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // White impact flash
        if (t < 0.14) {
            ctx.globalAlpha = 1 - t / 0.14;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.globalAlpha = 1;
        }

        // Shockwave rings
        for (let i = 0; i < 4; i++) {
            const r = 6 + t * (70 + i * 18);
            ctx.strokeStyle = `rgba(255, ${90 - i * 15}, 40, ${Math.max(0, 0.95 - t - i * 0.12)})`;
            ctx.lineWidth = a.final ? 2.5 : 2;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Lightning cracks
        if (t < 0.55) {
            ctx.strokeStyle = `rgba(255, 240, 180, ${0.85 * (1 - t / 0.55)})`;
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 7; i++) {
                const ang = (i / 7) * Math.PI * 2 + t * 3;
                const len = 18 + t * 55 + (i % 3) * 8;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                let x = cx;
                let y = cy;
                for (let s = 0; s < 3; s++) {
                    x += Math.cos(ang + (s - 1) * 0.35) * (len / 3);
                    y += Math.sin(ang + (s - 1) * 0.35) * (len / 3);
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        }

        // Pixel shard spray
        const shards = a.final ? 28 : 18;
        for (let i = 0; i < shards; i++) {
            const ang = (i / shards) * Math.PI * 2 + t * 4 + i * 0.2;
            const dist = t * (36 + (i % 7) * 10) * (a.final ? 1.25 : 1);
            const sx = cx + Math.cos(ang) * dist;
            const sy = cy + Math.sin(ang) * dist - t * 12;
            const size = Math.max(1, Math.round((5 - t * 4) * (i % 2 ? 1 : 1.4)));
            const colors = [palette.playerHi, palette.player, '#ff2244', '#ffe14d', '#ffffff'];
            ctx.globalAlpha = Math.max(0, 1 - t * 1.05);
            ctx.fillStyle = colors[i % colors.length];
            ctx.fillRect(Math.round(sx), Math.round(sy), size, size);
        }
        ctx.globalAlpha = 1;

        // Vault core: swell → implode
        if (t < 0.5) {
            const swell = t < 0.18 ? 1 + t * 2.2 : Math.max(0.05, 1.4 - (t - 0.18) * 3.2);
            const alpha = t < 0.2 ? 1 : Math.max(0, 1 - (t - 0.2) / 0.3);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(t * (a.final ? 2.4 : 1.4));
            ctx.globalAlpha = alpha;
            this.drawNode(0, 0, (ts / 2 - 1.5) * 1.1 * swell, palette);
            ctx.restore();
        }

        // Center nova spark
        if (t > 0.12 && t < 0.4) {
            const n = (t - 0.12) / 0.28;
            ctx.globalAlpha = 1 - n;
            ctx.fillStyle = '#fff';
            const s = 3 + n * 14;
            ctx.fillRect(cx - s / 2, cy - 1, s, 2);
            ctx.fillRect(cx - 1, cy - s / 2, 2, s);
            ctx.globalAlpha = 1;
        }

        // Banner text on canvas
        ctx.font = 'bold 10px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = a.final ? 'UPTIME COLLAPSED' : 'NODE BREACHED';
        const ty = cy - 28 - t * 10;
        ctx.globalAlpha = t < 0.75 ? Math.min(1, t * 4) : Math.max(0, 1 - (t - 0.75) / 0.25);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.fillStyle = a.final ? '#ff1744' : '#ffe14d';
        ctx.strokeText(label, cx, ty);
        ctx.fillText(label, cx, ty);
        ctx.globalAlpha = 1;

        ctx.restore();

        if (elapsed >= a.duration) this.finishNodeDeath();
    }

    spawnFloating(text, c, r, color, opts = {}) {
        this.floatingScores.push({
            text,
            x: c * 20 + 4,
            y: r * 20 + 8,
            life: opts.life || 28,
            maxLife: opts.life || 28,
            color,
            font: opts.font,
            drift: opts.drift
        });
    }

    clearArcadeBursts() {
        if (this._fxBurstTimers) {
            this._fxBurstTimers.forEach((id) => clearTimeout(id));
            this._fxBurstTimers.clear();
        }
        const layer = this.fxBursts || document.getElementById('fx-bursts');
        if (layer) layer.replaceChildren();
    }

    dismissArcadeBurst(el) {
        if (!el || el.dataset.gone === '1') return;
        el.dataset.gone = '1';
        el.classList.add('fx-burst-done');
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        // Double-remove: immediate hide + DOM cleanup next frame
        requestAnimationFrame(() => {
            if (el.isConnected) el.remove();
        });
    }

    /**
     * Comic arcade burst: screamed name + colorful onomatopoeia over the grid.
     * @param {{ title: string, ono: string, scoreText?: string, color: string, accent?: string, c: number, r: number, kind?: 'slash'|'relic' }} cfg
     */
    spawnArcadeBurst(cfg) {
        const layer = this.fxBursts || document.getElementById('fx-bursts');
        if (!layer || !this.canvas) {
            this.spawnFloating(cfg.ono || cfg.title, cfg.c, cfg.r, cfg.color);
            if (cfg.scoreText) this.spawnFloating(cfg.scoreText, cfg.c, cfg.r - 0.4, cfg.accent || '#fff');
            return;
        }

        // Cap stacked bursts so leftovers never pile up
        while (layer.children.length >= 4) {
            this.dismissArcadeBurst(layer.firstElementChild);
        }

        const ts = 20;
        const scaleX = this.canvas.clientWidth / this.canvas.width || 1;
        const scaleY = this.canvas.clientHeight / this.canvas.height || 1;
        const x = (cfg.c + 0.5) * ts * scaleX;
        const y = (cfg.r + 0.35) * ts * scaleY;

        const el = document.createElement('div');
        el.className = `fx-burst fx-burst-${cfg.kind || 'slash'}`;
        el.style.setProperty('--fx-color', cfg.color || '#ff2a2a');
        el.style.setProperty('--fx-accent', cfg.accent || '#ffe14d');
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;

        const title = document.createElement('span');
        title.className = 'fx-burst-title';
        title.textContent = cfg.title;

        const ono = document.createElement('span');
        ono.className = 'fx-burst-ono';
        ono.textContent = cfg.ono;

        el.appendChild(title);
        el.appendChild(ono);

        if (cfg.scoreText) {
            const pts = document.createElement('span');
            pts.className = 'fx-burst-score';
            pts.textContent = cfg.scoreText;
            el.appendChild(pts);
        }

        let tid = null;
        const finish = () => {
            this.dismissArcadeBurst(el);
            if (tid != null) {
                clearTimeout(tid);
                this._fxBurstTimers.delete(tid);
                tid = null;
            }
        };

        el.addEventListener('animationend', (ev) => {
            if (ev.target === el && (ev.animationName === 'fx-burst-rise' || ev.animationName === 'fx-burst-death')) finish();
        });

        layer.appendChild(el);

        // Hard TTL — death bursts linger longer for drama
        const ttl = cfg.kind === 'death' ? 1600 : 900;
        tid = window.setTimeout(finish, ttl);
        this._fxBurstTimers.add(tid);
    }

    slashPenguinFx(exploit, points = 200, chain = 0) {
        const lore = GRID_PENGUINS[exploit.id] || {};
        const name = (exploit.name || lore.name || 'PENGUIN').toUpperCase();
        const ono = lore.ono || 'SQUAWK!';
        const color = lore.cryColor || '#ff2a2a';
        const accent = lore.accent || '#ffe14d';

        this.spawnArcadeBurst({
            title: chain > 0 ? `${name}! x${chain + 1}` : `${name}!`,
            ono,
            scoreText: `+${points}`,
            color,
            accent,
            c: exploit.c,
            r: exploit.r,
            kind: 'slash'
        });

        if (window.retroAudio) {
            // Chain slashes squeal higher and higher
            window.retroAudio.playPenguinScream((lore.pitch || 1) * (1 + chain * 0.14), exploit.id);
        }
    }

    seizeRelicFx(relic) {
        if (!relic) return;
        const title = (relic.cry || relic.name || 'RELIC').toUpperCase();
        this.spawnArcadeBurst({
            title: `${title}!`,
            ono: relic.ono || 'PINK!',
            scoreText: `+${relic.score}`,
            color: relic.color,
            accent: relic.accent || '#fff',
            c: this.relicPad.c,
            r: this.relicPad.r,
            kind: 'relic'
        });
        if (window.retroAudio) {
            window.retroAudio.playRelicSeize(relic.key);
        }
    }

    // ——— Relics ———

    maybeSpawnRelic() {
        if (this.activeRelic || this.nextRelicIndex >= LEDGER_RELICS.length) return;
        const next = LEDGER_RELICS[this.nextRelicIndex];
        if (this.levelDotsEaten < next.dropsAt) return;

        const { r, c } = this.relicPad;
        if (this.map[r][c] === '#' || this.map[r][c] === 'H') return;
        this.map[r][c] = 'R';
        this.activeRelic = next;
        this.relicTimer = 40; // ~10s
        window.web3Simulator.log(`Relic breach — ${next.name} materializing (+${next.xrp} XRP). Seize it before desync.`, 'event');
        if (this.valRelic) this.valRelic.textContent = next.name;
        if (window.retroAudio?.playRelicSpawn) window.retroAudio.playRelicSpawn();

        // Player already parked on the pad — seize instantly
        if (this.player.x === c && this.player.y === r) this.collectRelic();
    }

    collectRelic() {
        if (!this.activeRelic) return;
        const relic = this.activeRelic;
        this.score += relic.score;
        this.relicsCollected.push(relic.id);
        this.seizeRelicFx(relic);
        this.map[this.relicPad.r][this.relicPad.c] = '=';
        this.activeRelic = null;
        this.relicTimer = 0;
        this.nextRelicIndex++;
        if (this.valRelic) this.valRelic.textContent = '—';
        this.updateRelicRosterUI();

        window.web3Simulator.collectRelicTransaction(relic);
    }

    expireRelic() {
        if (!this.activeRelic) return;
        window.web3Simulator.log(`${this.activeRelic.name} slipped the seal — desynced from the grid.`, 'alert');
        this.map[this.relicPad.r][this.relicPad.c] = '=';
        this.activeRelic = null;
        this.relicTimer = 0;
        this.nextRelicIndex++; // missed — advance table
        if (this.valRelic) this.valRelic.textContent = '—';
    }

    syncHudRelics() {
        if (!this.hudRelics) return;
        LEDGER_RELICS.forEach(r => {
            const gem = this.hudRelics.querySelector(`[data-hud-relic="${r.key}"]`);
            if (!gem) return;
            const owned = this.relicsCollected.includes(r.id);
            const active = this.activeRelic?.id === r.id;
            gem.classList.toggle('owned', owned);
            gem.classList.toggle('active-spawn', active && !owned);
        });
    }

    updateRelicRosterUI() {
        this.syncHudRelics();
    }

    // ——— Input / movement (same core, updated collisions) ———

    isBlockingOverlayOpen() {
        const ids = ['tos-modal', 'xaman-sign-modal', 'gameover-modal', 'stake-confirm-modal'];
        return ids.some((id) => {
            const el = document.getElementById(id);
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
    }

    /** Keep key events on the maze — buttons/banner must not steal WASD/arrows mid-run. */
    focusPlayfield() {
        const stack = document.querySelector('.canvas-stack');
        if (!stack) return;
        if (!stack.hasAttribute('tabindex')) stack.setAttribute('tabindex', '-1');
        try {
            const ae = document.activeElement;
            if (ae && ae !== stack && typeof ae.blur === 'function') ae.blur();
            stack.focus({ preventScroll: true });
        } catch (_) { /* headless / older browsers */ }
    }

    /** Map key / code → grid direction. Prefers e.code (layout-independent). */
    dirFromKeyboardEvent(e) {
        const code = e.code || '';
        switch (code) {
            case 'ArrowUp': case 'KeyW': case 'Numpad8': return { dx: 0, dy: -1 };
            case 'ArrowDown': case 'KeyS': case 'Numpad2': return { dx: 0, dy: 1 };
            case 'ArrowLeft': case 'KeyA': case 'Numpad4': return { dx: -1, dy: 0 };
            case 'ArrowRight': case 'KeyD': case 'Numpad6': return { dx: 1, dy: 0 };
            default: break;
        }
        const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        switch (key) {
            case 'ArrowUp': case 'Up': case 'W': return { dx: 0, dy: -1 };
            case 'ArrowDown': case 'Down': case 'S': return { dx: 0, dy: 1 };
            case 'ArrowLeft': case 'Left': case 'A': return { dx: -1, dy: 0 };
            case 'ArrowRight': case 'Right': case 'D': return { dx: 1, dy: 0 };
            default: return null;
        }
    }

    setupKeyboardInput() {
        // Capture on window so focused buttons / banner never swallow movement keys.
        window.addEventListener('keydown', (e) => {
            // Ignore chords that belong to the browser (Ctrl+R, Ctrl+L, etc.)
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // Don't steal keys from legal / Xaman / game-over dialogs
            if (this.isBlockingOverlayOpen()) return;

            const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
            const code = e.code || '';

            // Retro arcade START when not in a run (S / Enter / Space)
            if (!this.isActive) {
                const startKey = key === 'S' || key === 'Enter' || key === ' '
                    || code === 'KeyS' || code === 'Enter' || code === 'Space';
                if (startKey) {
                    e.preventDefault();
                    this.tryStartFromInput();
                }
                return;
            }

            const dir = this.dirFromKeyboardEvent(e);
            if (!dir) return;

            e.preventDefault();
            this.nextDirX = dir.dx;
            this.nextDirY = dir.dy;
            // Instant reverse / open-path turn — don't wait for the next 250ms tick
            if (this.canMove(dir.dx, dir.dy)) {
                this.dirX = dir.dx;
                this.dirY = dir.dy;
            }
        }, true);

        const startBtn = document.getElementById('btn-arcade-start');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.tryStartFromInput());
        }

        const stack = document.querySelector('.canvas-stack');
        if (stack) {
            stack.setAttribute('tabindex', '-1');
            stack.setAttribute('aria-label', 'Securithon Grid — click then use arrows or WASD');
            stack.addEventListener('pointerdown', () => this.focusPlayfield());
        }
        const screen = document.getElementById('terminal-screen');
        if (screen) {
            screen.addEventListener('pointerdown', () => {
                if (this.isActive) this.focusPlayfield();
            });
        }
    }

    /** Mobile: swipe on the playfield steers the Node; tap starts a run. */
    setupTouchInput() {
        const surface = document.querySelector('.canvas-stack') || this.canvas;
        if (!surface) return;
        let startX = 0, startY = 0, startT = 0;

        surface.addEventListener('touchstart', (e) => {
            const t = e.changedTouches[0];
            startX = t.clientX;
            startY = t.clientY;
            startT = performance.now();
            if (this.isActive) e.preventDefault();
        }, { passive: false });

        surface.addEventListener('touchmove', (e) => {
            if (this.isActive) e.preventDefault();
        }, { passive: false });

        surface.addEventListener('touchend', (e) => {
            const t = e.changedTouches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            const dist = Math.hypot(dx, dy);

            if (!this.isActive) {
                if (dist < 12 && performance.now() - startT < 400) this.tryStartFromInput();
                return;
            }
            e.preventDefault();
            if (dist < 18) return; // too short to be a swipe
            if (Math.abs(dx) > Math.abs(dy)) {
                this.nextDirX = dx > 0 ? 1 : -1;
                this.nextDirY = 0;
            } else {
                this.nextDirX = 0;
                this.nextDirY = dy > 0 ? 1 : -1;
            }
        }, { passive: false });
    }

    setupGamepadInput() {
        window.addEventListener('gamepadconnected', (e) => {
            window.web3Simulator.log(`Gamepad detected: ${e.gamepad.id}`, 'event');
            this.startGamepadPolling();
        });
    }

    startGamepadPolling() {
        if (this._gamepadPolling) return; // one loop, even if pads reconnect
        this._gamepadPolling = true;
        const poll = () => {
            if (!this.isActive) { requestAnimationFrame(poll); return; }
            const gp = navigator.getGamepads()[0];
            if (gp) {
                let dx = 0, dy = 0;
                if (gp.buttons[12]?.pressed) dy = -1;
                else if (gp.buttons[13]?.pressed) dy = 1;
                if (gp.buttons[14]?.pressed) dx = -1;
                else if (gp.buttons[15]?.pressed) dx = 1;
                if (!dx && !dy) {
                    if (Math.abs(gp.axes[0]) > 0.4) dx = gp.axes[0] > 0 ? 1 : -1;
                    if (Math.abs(gp.axes[1]) > 0.4) dy = gp.axes[1] > 0 ? 1 : -1;
                }
                const now = performance.now();
                if (now - this.lastGamepadInputTime > this.gamepadCooldown && (dx || dy)) {
                    this.nextDirX = dx; this.nextDirY = dy;
                    this.lastGamepadInputTime = now;
                }
            }
            requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
    }

    wrapCol(c) {
        if (c < 0) return this.cols - 1;
        if (c >= this.cols) return 0;
        return c;
    }

    canMove(dx, dy) {
        const ny = this.player.y + dy;
        let nx = this.player.x + dx;
        if (dy === 0 && (nx < 0 || nx >= this.cols)) {
            if (this.player.y !== this.tunnelRow) return false;
            nx = this.wrapCol(nx);
        }
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) return false;
        return this.isWalkableTile(this.map[ny][nx], false);
    }

    updateGlobalMode() {
        if (this.frightenedTurns > 0) return;
        this.modeTimer--;
        if (this.modeTimer <= 0 && this.modeIndex < this.modeSchedule.length - 1) {
            this.modeIndex++;
            this.globalMode = this.modeSchedule[this.modeIndex].mode;
            this.modeTimer = this.modeSchedule[this.modeIndex].ticks;
            this.exploits.forEach(g => {
                if (this.map[g.r][g.c] !== 'H') {
                    g.dirR = -g.dirR;
                    g.dirC = -g.dirC;
                }
            });
            window.web3Simulator.log(
                this.globalMode === 'scatter'
                    ? 'Exploit swarm → SCATTER (they peel off the vault).'
                    : 'Exploit swarm → CHASE (they smell uptime).',
                'system'
            );
        }
    }

    getChaseTarget(g) {
        const px = this.player.x, py = this.player.y;
        if (g.ai === 'chase') return { r: py, c: px };
        if (g.ai === 'ambush') {
            // Hatglide cuts 4 tiles ahead — but pounces directly at point-blank range
            const close = Math.abs(g.r - py) + Math.abs(g.c - px) <= 2;
            if (close) return { r: py, c: px };
            return {
                r: Math.max(0, Math.min(this.rows - 1, py + this.dirY * 4)),
                c: Math.max(0, Math.min(this.cols - 1, px + this.dirX * 4))
            };
        }
        if (g.ai === 'vector') {
            const lead = this.exploits.find(x => x.ai === 'chase') || this.exploits[0];
            return {
                r: Math.max(0, Math.min(this.rows - 1, py * 2 - lead.r)),
                c: Math.max(0, Math.min(this.cols - 1, px * 2 - lead.c))
            };
        }
        const dist = Math.abs(g.r - py) + Math.abs(g.c - px);
        if (dist > 8) return { r: py, c: px };
        return { r: g.scatterR, c: g.scatterC };
    }

    getTargetForExploit(g) {
        if (this.map[g.r]?.[g.c] === 'H' || g.releaseIn > 0) return { r: 5, c: 14 };
        if (this.frightenedTurns > 0) {
            return {
                r: Math.max(0, Math.min(this.rows - 1, g.r * 2 - this.player.y)),
                c: Math.max(0, Math.min(this.cols - 1, g.c * 2 - this.player.x))
            };
        }
        if (this.globalMode === 'scatter') return { r: g.scatterR, c: g.scatterC };
        return this.getChaseTarget(g);
    }

    gameTick() {
        if (!this.isActive) return;
        if (this.deathAnim?.active) return; // freeze world during death FX
        if (this.introTicks > 0) {          // READY! beat before the sector goes live
            this.introTicks--;
            if (this.introTicks === 0 && window.retroAudio && !window.retroAudio.isMusicPlaying) {
                window.retroAudio.startMusic(false);
            }
            this.updateUI();
            return;
        }
        this.tickCount++;
        // Threat rises as the sector empties — audio siren tracks it
        if (window.retroAudio) {
            window.retroAudio.threat = this.totalDots ? 1 - this.dotsRemaining / this.totalDots : 0;
        }
        if (this.invulnerableTurns > 0) this.invulnerableTurns--;
        this.updateGlobalMode();
        this.exploits.forEach(g => { if (g.releaseIn > 0) g.releaseIn--; });

        if (this.activeRelic) {
            this.relicTimer--;
            if (this.relicTimer <= 0) this.expireRelic();
        }

        if ((this.nextDirX || this.nextDirY) && this.canMove(this.nextDirX, this.nextDirY)) {
            this.dirX = this.nextDirX;
            this.dirY = this.nextDirY;
        }

        if (this.canMove(this.dirX, this.dirY)) {
            let nextX = this.player.x + this.dirX;
            const nextY = this.player.y + this.dirY;
            if (this.dirY === 0) nextX = this.wrapCol(nextX);
            this.player.x = nextX;
            this.player.y = nextY;

            let ateDot = false;
            const char = this.map[nextY][nextX];

            if (char === '.') {
                this.map[nextY][nextX] = ' ';
                this.score += 10;
                this.dotsEaten++;
                this.levelDotsEaten++;
                this.dotsRemaining--;
                ateDot = true;
                if (window.retroAudio) window.retroAudio.playHarvest();
                this.maybeSpawnRelic();
            } else if (char === 'O') {
                this.map[nextY][nextX] = '=';
                this.score += 50;
                this.dotsEaten++;
                this.levelDotsEaten++;
                this.dotsRemaining--;
                this.frightenedTurns = this.frightenedDuration;
                this.slashChain = 0;
                // Classic fright turn-around: swarm reverses away from the audit
                this.exploits.forEach(g => {
                    if (this.map[g.r]?.[g.c] === 'H') return;
                    g.dirR = -g.dirR;
                    g.dirC = -g.dirC;
                });
                // Audit strobe on the playfield
                const stack = document.querySelector('.canvas-stack');
                if (stack) {
                    stack.classList.remove('cert-flash');
                    void stack.offsetWidth;
                    stack.classList.add('cert-flash');
                    setTimeout(() => stack.classList.remove('cert-flash'), 420);
                }
                if (window.retroAudio) {
                    window.retroAudio.playHarvest();
                    window.retroAudio.startMusic(true);
                }
                window.web3Simulator.log('Audit Cert sealed — Exploits exposed. Slash while the window holds!', 'event');
                this.spawnFloating('+50', nextX, nextY, '#00e6b8');
                this.maybeSpawnRelic();
            } else if (char === 'R') {
                this.collectRelic();
            }

            window.web3Simulator.registerMoveAndEatTransaction(nextX, nextY, ateDot);
        }

        if (this.invulnerableTurns <= 0) this.checkExploitCollisions();
        this.moveExploits();
        if (this.invulnerableTurns <= 0) this.checkExploitCollisions();
        this.checkLevelCompletion();

        if (this.frightenedTurns > 0) {
            this.frightenedTurns--;
            if (this.frightenedTurns === 0) {
                if (window.retroAudio) window.retroAudio.startMusic(false);
                window.web3Simulator.log('Audit window closed. Exploits re-arm — vault soft again.', 'system');
            }
        }
        this.updateUI();
    }

    checkExploitCollisions() {
        const hit = this.exploits.find(g => g.r === this.player.y && g.c === this.player.x);
        if (!hit) return;

        if (this.frightenedTurns > 0) {
            // Slash chain: 200 → 400 → 800 → 1600 within one Audit window
            const chain = this.slashChain;
            const points = Math.min(1600, 200 * Math.pow(2, chain));
            this.slashChain = Math.min(3, this.slashChain + 1);
            this.score += points;
            this.slashPenguinFx(hit, points, chain);
            window.web3Simulator.slashExploitTransaction(hit.id);
            hit.r = hit.startR;
            hit.c = hit.startC;
            hit.releaseIn = 16;
            hit.dirR = -1;
            hit.dirC = 0;
        } else {
            this.lives--;
            window.web3Simulator.log(`${hit.name} breached the Node! Uptime remaining: ${this.lives}`, 'alert');
            window.web3Simulator.loseLifeTransaction(this.lives);
            this.beginNodeDeath(hit);
        }
    }

    moveExploits() {
        const isVulnerable = this.frightenedTurns > 0;
        const elroy = this.dotsRemaining > 0 && this.dotsRemaining < 45;

        this.exploits.forEach(g => {
            if (g.releaseIn > 0 && this.map[g.r][g.c] === 'H') {
                const dirs = this.getValidDirections(g.r, g.c, true, g);
                if (dirs.length) {
                    const d = dirs[Math.floor(Math.random() * dirs.length)];
                    g.r += d.dr;
                    g.c = this.wrapCol(g.c + d.dc);
                    g.dirR = d.dr; g.dirC = d.dc;
                }
                return;
            }

            if (isVulnerable && this.frightenedTurns % 2 === 0 && !(elroy && g.ai === 'chase')) return;

            let bestDir;
            if (isVulnerable && this.map[g.r]?.[g.c] !== 'H') {
                // Classic panic: exposed Exploits jitter randomly at each junction
                const dirs = this.getValidDirections(g.r, g.c, true, g);
                bestDir = dirs.length
                    ? dirs[Math.floor(Math.random() * dirs.length)]
                    : { dr: -g.dirR, dc: -g.dirC };
            } else {
                const target = this.getTargetForExploit(g);
                bestDir = this.findBestDirectionToTarget(g.r, g.c, target.r, target.c, g);
            }
            g.r += bestDir.dr;
            g.c = this.wrapCol(g.c + bestDir.dc);
            g.dirR = bestDir.dr;
            g.dirC = bestDir.dc;

            // Elroy burst: never double-step past the player (collision would be skipped)
            if (elroy && g.ai === 'chase' && !isVulnerable && this.tickCount % 2 === 0 &&
                !(g.r === this.player.y && g.c === this.player.x)) {
                const t2 = this.getTargetForExploit(g);
                const d2 = this.findBestDirectionToTarget(g.r, g.c, t2.r, t2.c, g);
                if (d2.dr || d2.dc) {
                    g.r += d2.dr;
                    g.c = this.wrapCol(g.c + d2.dc);
                    g.dirR = d2.dr; g.dirC = d2.dc;
                }
            }
        });
    }

    getValidDirections(r, c, forExploit = false, exploit = null) {
        const dirs = [
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
            { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
        ];
        return dirs.filter(d => {
            if (exploit && exploit.dirR === -d.dr && exploit.dirC === -d.dc) {
                const others = dirs.filter(o => !(o.dr === d.dr && o.dc === d.dc));
                const anyOther = others.some(o => {
                    const or2 = r + o.dr;
                    const oc2 = this.wrapCol(c + o.dc);
                    return or2 >= 0 && or2 < this.rows && this.isWalkableTile(this.map[or2]?.[oc2], forExploit);
                });
                if (anyOther) return false;
            }
            const nr = r + d.dr;
            let nc = c + d.dc;
            if (d.dr === 0 && (nc < 0 || nc >= this.cols)) {
                if (r !== this.tunnelRow) return false;
                nc = this.wrapCol(nc);
            }
            if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) return false;
            return this.isWalkableTile(this.map[nr][nc], forExploit);
        });
    }

    findBestDirectionToTarget(startR, startC, targetR, targetC, exploit = null) {
        const validDirs = this.getValidDirections(startR, startC, true, exploit);
        if (!validDirs.length) return { dr: 0, dc: 0 };
        let bestDir = validDirs[0];
        let bestScore = Infinity;
        validDirs.forEach(d => {
            const nr = startR + d.dr;
            const nc = this.wrapCol(startC + d.dc);
            const dist = Math.hypot(nr - targetR, nc - targetC);
            if (dist < bestScore) { bestScore = dist; bestDir = d; }
        });
        return bestDir;
    }

    checkLevelCompletion() {
        if (this.dotsRemaining > 0) return;
        const sealed = sectorTitle(this.level);
        const next = sectorTitle(this.level + 1);
        const pending = Number(window.web3Simulator?.sessionPendingEarn || 0);
        this.level++;
        this.score += 500;
        this.invulnerableTurns = 14;
        this.nextRelicIndex = 0;
        this.activeRelic = null;
        this.levelDotsEaten = 0;
        this.slashChain = 0;
        this.introTicks = 10;
        this.wallFlashUntil = performance.now() + 900;
        this._clearMilestone = 0;
        this.applyLevelPacing();
        this.restartTickLoop();
        window.web3Simulator.log(
            `CLEAR BET WON — ${sealed} sealed · +500 pts · harvest now +${pending.toFixed(4)} XRP · next bet: ${next}.`,
            'event'
        );
        window.web3Simulator.log(
            'Consequence: you stayed for the clear. VDB would have banked earlier for less floor XRP. Swarm resets — greed continues.',
            'zk'
        );
        if (window.retroAudio) {
            if (window.retroAudio.playSectorClear) window.retroAudio.playSectorClear();
            else window.retroAudio.playFruit();
        }
        this.spawnArcadeBurst({
            title: 'CLEAR BET WON!',
            ono: '+500',
            scoreText: `NEXT BET: ${GRID_SECTORS[(this.level - 1) % GRID_SECTORS.length].toUpperCase()}`,
            color: '#00e6b8',
            accent: '#ffe14d',
            c: this.player.x,
            r: this.player.y,
            kind: 'relic'
        });
        const pulse = document.getElementById('bet-pulse');
        if (pulse) {
            pulse.classList.add('is-hot');
            pulse.textContent = `You cleared ${sealed}. New bet is live on ${next}.`;
        }
        this.loadMap();
        this.spawnExploits();
        this.player.x = this.player.startX;
        this.player.y = this.player.startY;
        this.dirX = -1; this.dirY = 0;
        this.modeIndex = 0;
        this.modeTimer = this.modeSchedule[0].ticks;
        this.globalMode = this.modeSchedule[0].mode;
        this.updateBetBoard(this.resolvePhaseMoment());
    }

    formatScoreDisplay(n) {
        if (typeof formatScoreText === 'function') return formatScoreText(n);
        return String(Math.max(0, Math.floor(Number(n) || 0))).slice(0, 12);
    }

    updateUI() {
        const scoreText = this.formatScoreDisplay(this.score);
        if (this.lblLevel) this.lblLevel.textContent = sectorTitle(this.level);
        if (this.valScore) this.valScore.textContent = scoreText;
        if (this.valDots) this.valDots.textContent = this.dotsEaten;
        this.updateLivesDisplay(this.lives);
        if (this.hudScore) this.hudScore.textContent = scoreText;
        if (this.hudTier) {
            const jackpot = window.web3Simulator?.economy?.bags?.jackpot ?? 0;
            const maxTier = Math.round(jackpot * 0.5 * 1000) / 1000;
            this.hudTier.textContent = `${maxTier.toFixed(3)} XRP`;
        }
        this.syncHudRelics();
        const moment = this.resolvePhaseMoment();
        if (this.valMode) {
            const tag = moment.phase === 'audit' ? 'AUDIT'
                : moment.phase === 'heat' ? `HEAT/${this.globalMode.toUpperCase()}`
                : moment.phase === 'breach' ? 'BREACH'
                : moment.phase === 'ready' ? 'READY'
                : moment.phase === 'reboot' ? 'REBOOT'
                : this.globalMode.toUpperCase();
            this.valMode.textContent = tag;
        }
        if (this.frightenedTurns > 0) {
            if (this.effectRow) this.effectRow.style.display = 'flex';
            if (this.valEffectTimer) this.valEffectTimer.textContent = `${Math.ceil(this.frightenedTurns / 4)}s`;
        } else if (this.effectRow) {
            this.effectRow.style.display = 'none';
        }
        this.updatePhaseBanner();
        if (!this.animFrameId) this.renderMap();
    }

    /** Lobby panel between runs — stake in / payout / net / time / actions. */
    showRunRecap(recap) {
        window.web3Simulator?.fillRunRecapDom?.(recap, 'run-recap-');
    }
}

new GameEngine();
