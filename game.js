/**
 * Leak Runner Game Engine (game.js)
 * Securithon Node vs Exploits — XRPL arcade demo.
 * Drops, Audit Certs, Ledger Relics (IP fruit-replacements), exploit AI.
 */

/** Ledger Relics — original IP collectibles (not arcade fruit clones). */
const LEDGER_RELICS = [
    { id: 1, key: 'spray',    name: 'Spray Shard',      score: 100,  xrp: 0.002, dropsAt: 20,  color: '#5dade2', accent: '#85c1e9' },
    { id: 2, key: 'hook',     name: 'Hook Glyph',       score: 300,  xrp: 0.005, dropsAt: 50,  color: '#af7ac5', accent: '#d2b4de' },
    { id: 3, key: 'amm',      name: 'AMM Prism',        score: 500,  xrp: 0.010, dropsAt: 85,  color: '#58d68d', accent: '#abebc6' },
    { id: 4, key: 'validator',name: 'Validator Crest',  score: 700,  xrp: 0.015, dropsAt: 120, color: '#f4d03f', accent: '#f9e79f' },
    { id: 5, key: 'consensus',name: 'Consensus Orb',    score: 1000, xrp: 0.025, dropsAt: 160, color: '#e74c3c', accent: '#f5b7b1' }
];

/**
 * Original chubby penguin foes (invented names).
 * Shared with banners, lore panel, and slash logs.
 */
const GRID_PENGUINS = [
    { name: 'Bitwaddle', role: 'Friendly waddler', blurb: 'Warm smile, stubborn chase — locks onto your vault and never lets go.' },
    { name: 'Hatglide', role: 'Hat-tip hunter', blurb: 'Predicts four flaps ahead of The Node.' },
    { name: 'Slipkernel', role: 'Steady slide', blurb: 'Warps using Bitwaddle as a belly-slide fulcrum.' },
    { name: 'Sourceflip', role: 'DIY dash', blurb: 'Closes in from afar, scatters when you stare it down.' }
];
const EXPLOIT_LORE = GRID_PENGUINS;
if (typeof window !== 'undefined') {
    window.GRID_PENGUINS = GRID_PENGUINS;
}

class GameEngine {
    constructor() {
        this.isActive = false;
        this.score = 0;
        this.dotsEaten = 0;
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
        this.ghosts = [];

        this.dirX = -1;
        this.dirY = 0;
        this.nextDirX = -1;
        this.nextDirY = 0;

        this.frightenedTurns = 0;
        this.frightenedDuration = 40;

        this.gameInterval = null;
        this.animFrameId = null;
        this.gameTickMs = 250;
        this.lastGamepadInputTime = 0;
        this.gamepadCooldown = 120;
        this._fpsFrames = 0;
        this._fpsLastTs = performance.now();
        this.fpsEl = document.querySelector('.fps-counter');

        this.palettes = {
            classic: {
                bg: '#02040a',
                wall: '#1555c0',
                wallHi: '#4da3ff',
                wallLo: '#0a2870',
                dot: '#ffe14d',
                pellet: '#00ffb7',
                // Node = electric lemon (cool yellow); Sybil = vermillion (no amber overlap)
                player: '#fff200',
                playerHi: '#ffffa8',
                playerLo: '#e6c800',
                ghosts: ['#ff0000', '#ff00ff', '#00ffff', '#ff2f00'],
                frightened: '#8b6cff'
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
                ghosts: ['#ff0000', '#00ff66', '#00ffff', '#ff2f00'],
                frightened: '#33a0ff'
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
                ghosts: ['#ff0040', '#ff00aa', '#00e8ff', '#ff2f55'],
                frightened: '#b899ff'
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

        window.gameEngine = this;
        this.setupKeyboardInput();
        this.setupGamepadInput();
        this.renderLorePanel();
        this.renderHudRelicSlots();
        this.updateLivesDisplay(this.lives);
    }

    /** Open-mouth Node life icon with serrated teeth (original Leak Runner IP). */
    nodeLifeIconHtml() {
        return `<span class="hud-node-life" title="Node life" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path fill="#fff200" d="M12 12 L20.4 5.9 A10 10 0 1 0 20.4 18.1 Z"/>
                <!-- Upper serrated teeth -->
                <path fill="#fffef5" d="M13.4 11.35 L14.15 9.85 L14.9 11.3 L15.65 9.75 L16.4 11.25 L17.15 9.7 L17.9 11.2 L18.65 9.65 L19.3 11.1"/>
                <!-- Lower serrated teeth -->
                <path fill="#fffef5" d="M13.4 12.65 L14.15 14.15 L14.9 12.7 L15.65 14.25 L16.4 12.75 L17.15 14.3 L17.9 12.8 L18.65 14.35 L19.3 12.9"/>
                <circle cx="10.1" cy="8.3" r="1.3" fill="#1a1200"/>
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
        // 17×29 arcade loops — BFS-validated: 0 unreachable drops, 0 dead-ends
        return [
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
        ];
    }

    isWalkableTile(tile, forGhost = false) {
        if (tile === undefined || tile === '#') return false;
        if (tile === 'H') return forGhost;
        return true; // . O = space R (relic)
    }

    renderLorePanel() {
        const list = document.getElementById('exploit-lore-list');
        if (!list) return;
        list.innerHTML = EXPLOIT_LORE.map((e, i) => `
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
        this.lives = 3;
        this.level = 1;
        this.frightenedTurns = 0;
        this.invulnerableTurns = 14;
        this.tickCount = 0;
        this.relicsCollected = [];
        this.activeRelic = null;
        this.relicTimer = 0;
        this.nextRelicIndex = 0;
        this.floatingScores = [];
        this.modeIndex = 0;
        this.modeTimer = this.modeSchedule[0].ticks;
        this.globalMode = this.modeSchedule[0].mode;

        this.dirX = -1;
        this.dirY = 0;
        this.nextDirX = -1;
        this.nextDirY = 0;

        this.loadMap();
        this.spawnGhosts();
        this.updateRelicRosterUI();

        const prompt = document.getElementById('start-prompt');
        if (prompt) prompt.style.display = 'none';
        if (this.gameStage) this.gameStage.style.display = 'flex';
        if (this.canvas) this.canvas.style.display = 'block';

        this.updateUI();
        if (window.retroAudio) window.retroAudio.startMusic(false);

        window.web3Simulator.log(
            'Securithon Node online. Harvest drops, seize Ledger Relics — watch for Bitwaddle, Hatglide, Slipkernel & Sourceflip!',
            'system'
        );

        if (this.gameInterval) clearInterval(this.gameInterval);
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

        this.gameInterval = setInterval(() => this.gameTick(), this.gameTickMs);
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

    stopGame() {
        this.isActive = false;
        if (this.gameInterval) {
            clearInterval(this.gameInterval);
            this.gameInterval = null;
        }
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        if (window.retroAudio) window.retroAudio.stopMusic();
        if (this.effectRow) this.effectRow.style.display = 'none';
        if (this.gameStage) this.gameStage.style.display = 'none';
        if (this.canvas) this.canvas.style.display = 'none';
        const prompt = document.getElementById('start-prompt');
        if (prompt) prompt.style.display = 'block';
        this.activeRelic = null;
        if (this.valRelic) this.valRelic.textContent = '—';
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

    spawnGhosts() {
        const ais = [
            { ai: 'chase', r: 8, c: 14, dirR: -1, dirC: 0, releaseIn: 0, scatterR: 1, scatterC: 26 },
            { ai: 'ambush', r: 9, c: 14, dirR: -1, dirC: 0, releaseIn: 12, scatterR: 1, scatterC: 1 },
            { ai: 'vector', r: 7, c: 13, dirR: 0, dirC: -1, releaseIn: 24, scatterR: 15, scatterC: 26 },
            { ai: 'shy', r: 7, c: 15, dirR: 0, dirC: 1, releaseIn: 36, scatterR: 15, scatterC: 1 }
        ];
        this.ghosts = GRID_PENGUINS.map((d, id) => ({
            id,
            name: d.name,
            ...ais[id],
            startR: ais[id].r,
            startC: ais[id].c
        }));
    }

    /** Retro START — letter S / on-screen button */
    tryStartFromInput() {
        if (this.isActive) return;
        if (window.retroAudio) window.retroAudio.playStart();
        const btn = document.getElementById('btn-start-run');
        if (btn && !btn.disabled) {
            btn.click();
            return;
        }
        window.web3Simulator?.log(
            'START locked — Connect Xaman or enable Demo Mode, then press S / START.',
            'alert'
        );
    }

    setPalette(name) {
        if (this.palettes[name]) {
            this.activePalette = name;
            if (this.map && this.map.length) this.renderMap();
        }
    }

    // ——— Drawing helpers ———

    wallAt(r, c) {
        if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return true;
        return this.map[r][c] === '#';
    }

    drawWallCell(x, y, ts, palette) {
        const r = Math.round(y / ts);
        const c = Math.round(x / ts);
        // Arcade pipe walls: dark fill + neon edge only toward corridors.
        // Avoids solid bricks that make nearby drops look trapped inside walls.
        this.ctx.fillStyle = '#060a14';
        this.ctx.fillRect(x, y, ts, ts);

        const openN = !this.wallAt(r - 1, c);
        const openS = !this.wallAt(r + 1, c);
        const openW = !this.wallAt(r, c - 1);
        const openE = !this.wallAt(r, c + 1);
        if (!(openN || openS || openW || openE)) return;

        this.ctx.strokeStyle = palette.wallHi;
        this.ctx.lineWidth = 2.5;
        this.ctx.lineCap = 'round';
        this.ctx.shadowColor = palette.wall;
        this.ctx.shadowBlur = 6;
        const inset = 3.5;
        if (openN) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + (openW ? inset : 0), y + inset);
            this.ctx.lineTo(x + ts - (openE ? inset : 0), y + inset);
            this.ctx.stroke();
        }
        if (openS) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + (openW ? inset : 0), y + ts - inset);
            this.ctx.lineTo(x + ts - (openE ? inset : 0), y + ts - inset);
            this.ctx.stroke();
        }
        if (openW) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + inset, y + (openN ? inset : 0));
            this.ctx.lineTo(x + inset, y + ts - (openS ? inset : 0));
            this.ctx.stroke();
        }
        if (openE) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + ts - inset, y + (openN ? inset : 0));
            this.ctx.lineTo(x + ts - inset, y + ts - (openS ? inset : 0));
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;
    }

    drawNode(cx, cy, radius, palette) {
        const r = radius;
        const facing = Math.atan2(this.dirY || 0, this.dirX || -1);
        const chomp = (Math.sin(Date.now() / 65) + 1) * 0.5;
        const mouthHalf = 0.06 + chomp * 0.78;
        const upper = facing - mouthHalf;
        const lower = facing + mouthHalf;

        // Glow — cool lemon, not amber (keeps Node distinct from vermillion Sybil)
        const glow = this.ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r * 1.7);
        glow.addColorStop(0, 'rgba(255,255,120,0.8)');
        glow.addColorStop(0.5, 'rgba(255,242,0,0.22)');
        glow.addColorStop(1, 'rgba(255,242,0,0)');
        this.ctx.fillStyle = glow;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
        this.ctx.fill();

        const body = this.ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 1, cx, cy, r);
        body.addColorStop(0, palette.playerHi || '#ffffa8');
        body.addColorStop(0.55, palette.player);
        body.addColorStop(1, palette.playerLo || '#e6c800');

        // Classic chomp disc (open wedge), then overlay zigzag teeth
        this.ctx.fillStyle = body;
        this.ctx.shadowColor = palette.player;
        this.ctx.shadowBlur = 14;
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.arc(cx, cy, r, upper, lower, true);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        // Serrated teeth along both jaws (into the open mouth)
        if (mouthHalf > 0.15) {
            this.drawSerratedJaw(cx, cy, r, upper, 1, palette);
            this.drawSerratedJaw(cx, cy, r, lower, -1, palette);
        }

        // Eye
        const eyeA = facing + Math.PI * 0.62;
        const ex = cx + Math.cos(eyeA) * r * 0.42;
        const ey = cy + Math.sin(eyeA) * r * 0.42;
        this.ctx.fillStyle = '#111';
        this.ctx.beginPath();
        this.ctx.arc(ex, ey, Math.max(1.8, r * 0.15), 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(ex - r * 0.04, ey - r * 0.04, Math.max(0.8, r * 0.055), 0, Math.PI * 2);
        this.ctx.fill();
    }

    /** Zigzag serrated teeth along one jaw edge. */
    drawSerratedJaw(cx, cy, r, angle, inwardSign, palette) {
        const teeth = 5;
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const depth = r * 0.28;

        this.ctx.fillStyle = palette.playerHi || '#ffff88';
        for (let i = 1; i <= teeth; i += 2) {
            const t0 = 0.28 + (0.65 * (i - 1)) / teeth;
            const t1 = 0.28 + (0.65 * i) / teeth;
            const t2 = 0.28 + (0.65 * Math.min(teeth, i + 1)) / teeth;
            this.ctx.beginPath();
            this.ctx.moveTo(cx + Math.cos(angle) * t0 * r, cy + Math.sin(angle) * t0 * r);
            this.ctx.lineTo(
                cx + Math.cos(angle) * t1 * r + nx * depth * inwardSign,
                cy + Math.sin(angle) * t1 * r + ny * depth * inwardSign
            );
            this.ctx.lineTo(cx + Math.cos(angle) * t2 * r, cy + Math.sin(angle) * t2 * r);
            this.ctx.closePath();
            this.ctx.fill();
        }

        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.6;
        this.ctx.lineJoin = 'miter';
        this.ctx.beginPath();
        this.ctx.moveTo(cx + Math.cos(angle) * r * 0.25, cy + Math.sin(angle) * r * 0.25);
        for (let i = 1; i <= teeth; i++) {
            const t = 0.25 + (0.7 * i) / teeth;
            const tip = i % 2 === 1;
            this.ctx.lineTo(
                cx + Math.cos(angle) * t * r + (tip ? nx * depth * inwardSign : 0),
                cy + Math.sin(angle) * t * r + (tip ? ny * depth * inwardSign : 0)
            );
        }
        this.ctx.stroke();
    }

    drawExploit(g, gx, gy, size, color, vulnerable) {
        const cx = gx + size / 2;
        const cy = gy + size / 2;
        const t = Date.now() / 160;
        const phase = t + g.id * 1.7;
        const bob = Math.sin(phase) * 2.1;
        const sway = Math.sin(phase * 1.25) * 0.12;
        const flap = Math.sin(phase * 2.4) * 0.35;
        const hop = Math.abs(Math.sin(phase * 0.9)) * 0.8;

        this.ctx.fillStyle = 'rgba(0,0,0,0.28)';
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy + size * 0.46, size * 0.36, 2.8, 0, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.save();
        this.ctx.translate(cx, cy + bob - hop);
        this.ctx.rotate(sway);

        // Soft halo only — keep penguins readable, not neon blobs
        if (!vulnerable) {
            this.ctx.globalAlpha = 0.1;
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.ellipse(0, size * 0.04, size * 0.5, size * 0.54, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
            this.ctx.shadowColor = color;
            this.ctx.shadowBlur = 3.5;
        }

        const lookX = (Math.sign(this.player.x - g.c) || g.dirC) * 0.85;
        const lookY = (Math.sign(this.player.y - g.r) || g.dirR) * 0.85;
        this.drawChubbyPenguin(0, 0, size, color, vulnerable, g.id, lookX, lookY, flap, phase);
        this.ctx.shadowBlur = 0;
        this.ctx.restore();
    }

    /** Chubby colorful penguin foes — original Leak Runner sprites. */
    drawChubbyPenguin(cx, cy, size, color, vulnerable, variant, lookX, lookY, flap = 0, phase = 0) {
        const body = vulnerable ? this.shade(color, 0.25) : color;
        const belly = vulnerable ? '#dfefff' : '#fff8f0';
        const beak = vulnerable ? '#88aacc' : '#ff9a3c';
        const foot = vulnerable ? '#6a8aaa' : '#e67e22';
        const blink = Math.sin(phase * 0.55 + variant) > 0.92;

        // Flapping flippers
        this.ctx.fillStyle = this.shade(body, 0.12);
        this.ctx.beginPath();
        this.ctx.ellipse(
            cx - size * 0.42, cy + size * 0.08,
            size * 0.14, size * (0.26 + flap * 0.06),
            -0.45 - flap * 0.35, 0, Math.PI * 2
        );
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.ellipse(
            cx + size * 0.42, cy + size * 0.08,
            size * 0.14, size * (0.26 + flap * 0.06),
            0.45 + flap * 0.35, 0, Math.PI * 2
        );
        this.ctx.fill();

        // Fat body
        const grad = this.ctx.createRadialGradient(
            cx - size * 0.12, cy - size * 0.1, size * 0.08,
            cx, cy + size * 0.05, size * 0.55
        );
        grad.addColorStop(0, this.shade(body, -0.12));
        grad.addColorStop(0.7, body);
        grad.addColorStop(1, this.shade(body, 0.22));
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy + size * 0.06, size * 0.46, size * 0.52, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // White belly (slight breathe)
        const bellyPulse = 1 + Math.sin(phase * 1.1) * 0.03;
        this.ctx.fillStyle = belly;
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy + size * 0.12, size * 0.26 * bellyPulse, size * 0.34 * bellyPulse, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Head
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy - size * 0.16, size * 0.34, size * 0.3, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Eyes (blink for sympathy)
        const eyeSpread = size * 0.13;
        const eyeY = cy - size * 0.2;
        const eyeR = Math.max(2.1, size * 0.12);
        const pupilR = Math.max(1, size * 0.055);
        if (blink) {
            this.ctx.strokeStyle = '#222';
            this.ctx.lineWidth = 1.4;
            this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(cx - eyeSpread - eyeR * 0.6, eyeY);
            this.ctx.lineTo(cx - eyeSpread + eyeR * 0.6, eyeY);
            this.ctx.moveTo(cx + eyeSpread - eyeR * 0.6, eyeY);
            this.ctx.lineTo(cx + eyeSpread + eyeR * 0.6, eyeY);
            this.ctx.stroke();
        } else {
            this.ctx.fillStyle = '#fff';
            this.ctx.beginPath();
            this.ctx.arc(cx - eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
            this.ctx.arc(cx + eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
            this.ctx.fill();
            // shiny catchlight
            this.ctx.fillStyle = vulnerable ? '#c0392b' : '#111';
            this.ctx.beginPath();
            this.ctx.arc(cx - eyeSpread + lookX, eyeY + lookY, pupilR, 0, Math.PI * 2);
            this.ctx.arc(cx + eyeSpread + lookX, eyeY + lookY, pupilR, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = 'rgba(255,255,255,0.85)';
            this.ctx.beginPath();
            this.ctx.arc(cx - eyeSpread + lookX - 0.6, eyeY + lookY - 0.6, pupilR * 0.35, 0, Math.PI * 2);
            this.ctx.arc(cx + eyeSpread + lookX - 0.6, eyeY + lookY - 0.6, pupilR * 0.35, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Beak (tiny bob)
        const beakY = cy - size * 0.06 + Math.sin(phase * 2) * 0.4;
        this.ctx.fillStyle = beak;
        this.ctx.beginPath();
        this.ctx.moveTo(cx - size * 0.08, beakY);
        this.ctx.lineTo(cx + size * 0.08, beakY);
        this.ctx.lineTo(cx, beakY + size * 0.11);
        this.ctx.closePath();
        this.ctx.fill();

        // Feet waddle offset
        const footShift = Math.sin(phase * 1.6) * size * 0.04;
        this.ctx.fillStyle = foot;
        this.ctx.beginPath();
        this.ctx.ellipse(cx - size * 0.16 + footShift, cy + size * 0.52, size * 0.12, size * 0.07, -0.2, 0, Math.PI * 2);
        this.ctx.ellipse(cx + size * 0.16 - footShift, cy + size * 0.52, size * 0.12, size * 0.07, 0.2, 0, Math.PI * 2);
        this.ctx.fill();

        // Variant accent
        this.ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        this.ctx.lineWidth = 1.6;
        this.ctx.lineCap = 'round';
        if (variant === 0) {
            // Bitwaddle scarf
            this.ctx.beginPath();
            this.ctx.arc(cx, cy + size * 0.02, size * 0.22, 0.2, Math.PI - 0.2);
            this.ctx.stroke();
        } else if (variant === 1) {
            // Hatglide cheeks / brim hint
            this.ctx.fillStyle = 'rgba(255,255,255,0.35)';
            this.ctx.beginPath();
            this.ctx.arc(cx - size * 0.28, cy - size * 0.05, size * 0.06, 0, Math.PI * 2);
            this.ctx.arc(cx + size * 0.28, cy - size * 0.05, size * 0.06, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = this.shade(body, 0.35);
            this.ctx.beginPath();
            this.ctx.ellipse(cx, cy - size * 0.38, size * 0.28, size * 0.06, 0, 0, Math.PI * 2);
            this.ctx.stroke();
        } else if (variant === 2) {
            // Slipkernel crest
            this.ctx.fillStyle = this.shade(body, -0.2);
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy - size * 0.48);
            this.ctx.lineTo(cx - size * 0.08, cy - size * 0.32);
            this.ctx.lineTo(cx + size * 0.08, cy - size * 0.32);
            this.ctx.closePath();
            this.ctx.fill();
        } else {
            // Sourceflip bowtie
            this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy + size * 0.02);
            this.ctx.lineTo(cx - size * 0.12, cy - size * 0.02);
            this.ctx.lineTo(cx - size * 0.12, cy + size * 0.06);
            this.ctx.closePath();
            this.ctx.moveTo(cx, cy + size * 0.02);
            this.ctx.lineTo(cx + size * 0.12, cy - size * 0.02);
            this.ctx.lineTo(cx + size * 0.12, cy + size * 0.06);
            this.ctx.closePath();
            this.ctx.fill();
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

    drawRelic(cx, cy, relic) {
        const spin = Date.now() / 400;
        const bob = Math.sin(Date.now() / 160) * 2;
        this.ctx.save();
        this.ctx.translate(cx, cy + bob);
        this.ctx.rotate(Math.sin(spin) * 0.15);

        // Aura
        const aura = this.ctx.createRadialGradient(0, 0, 2, 0, 0, 14);
        aura.addColorStop(0, relic.color);
        aura.addColorStop(1, 'transparent');
        this.ctx.fillStyle = aura;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 14, 0, Math.PI * 2);
        this.ctx.fill();

        if (relic.key === 'spray') {
            this.ctx.fillStyle = relic.color;
            this.ctx.beginPath();
            this.ctx.moveTo(0, -7);
            this.ctx.lineTo(6, 0);
            this.ctx.lineTo(0, 7);
            this.ctx.lineTo(-6, 0);
            this.ctx.closePath();
            this.ctx.fill();
        } else if (relic.key === 'hook') {
            this.ctx.strokeStyle = relic.color;
            this.ctx.lineWidth = 2.5;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 6, 0.2, Math.PI * 1.7);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(4, -4);
            this.ctx.lineTo(7, -7);
            this.ctx.stroke();
        } else if (relic.key === 'amm') {
            this.ctx.fillStyle = relic.color;
            for (let i = 0; i < 3; i++) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, -8 + i);
                this.ctx.lineTo(7 - i, 0);
                this.ctx.lineTo(0, 8 - i);
                this.ctx.lineTo(-7 + i, 0);
                this.ctx.closePath();
                this.ctx.globalAlpha = 0.45 + i * 0.2;
                this.ctx.fill();
            }
            this.ctx.globalAlpha = 1;
        } else if (relic.key === 'validator') {
            this.ctx.fillStyle = relic.color;
            this.ctx.fillRect(-6, -6, 12, 12);
            this.ctx.strokeStyle = relic.accent;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(-6, -6, 12, 12);
            this.ctx.fillStyle = '#111';
            this.ctx.fillRect(-2, -2, 4, 4);
        } else {
            // Consensus Orb
            const g = this.ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
            g.addColorStop(0, relic.accent);
            g.addColorStop(1, relic.color);
            this.ctx.fillStyle = g;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 7, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
            this.ctx.stroke();
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
        const cx = x + ts / 2;
        const cy = y + ts / 2;
        const pulse = 5.5 + Math.sin(Date.now() / 140) * 1.8;
        this.ctx.fillStyle = color;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 8;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        this.ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(cx - 4, cy - 4, 8, 8);
        this.ctx.beginPath();
        this.ctx.moveTo(cx - 2, cy);
        this.ctx.lineTo(cx - 0.5, cy + 2);
        this.ctx.lineTo(cx + 3, cy - 2);
        this.ctx.stroke();
    }

    renderMap() {
        if (!this.ctx || !this.canvas) return;
        const ts = 20;
        const palette = this.palettes[this.activePalette];

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

        // Node
        if (!(this.invulnerableTurns > 0 && Math.floor(Date.now() / 100) % 2 === 0)) {
            this.drawNode(
                this.player.x * ts + ts / 2,
                this.player.y * ts + ts / 2,
                (ts / 2 - 1.5) * 1.1,
                palette
            );
        }

        // Exploits
        this.ghosts.forEach(g => {
            const vulnerable = this.frightenedTurns > 0;
            const color = vulnerable
                ? (this.frightenedTurns < 12 && Date.now() % 400 < 200 ? '#ffffff' : palette.frightened)
                : palette.ghosts[g.id];
            const eSize = (ts - 4) * 1.1;
            const ePad = (ts - eSize) / 2;
            this.drawExploit(g, g.c * ts + ePad, g.r * ts + ePad, eSize, color, vulnerable);
        });

        // Floating score pops
        this.floatingScores = this.floatingScores.filter(f => {
            f.life--;
            f.y -= 0.4;
            this.ctx.globalAlpha = Math.max(0, f.life / 30);
            this.ctx.fillStyle = f.color || '#fff';
            this.ctx.font = 'bold 10px Outfit, sans-serif';
            this.ctx.fillText(f.text, f.x, f.y);
            this.ctx.globalAlpha = 1;
            return f.life > 0;
        });
    }

    spawnFloating(text, c, r, color) {
        this.floatingScores.push({
            text,
            x: c * 20 + 4,
            y: r * 20 + 8,
            life: 28,
            color
        });
    }

    // ——— Relics ———

    maybeSpawnRelic() {
        if (this.activeRelic || this.nextRelicIndex >= LEDGER_RELICS.length) return;
        const next = LEDGER_RELICS[this.nextRelicIndex];
        if (this.dotsEaten < next.dropsAt) return;

        const { r, c } = this.relicPad;
        if (this.map[r][c] === '#' || this.map[r][c] === 'H') return;
        this.map[r][c] = 'R';
        this.activeRelic = next;
        this.relicTimer = 40; // ~10s
        window.web3Simulator.log(`Ledger Relic materializing: ${next.name} (+${next.xrp} XRP)`, 'event');
        if (this.valRelic) this.valRelic.textContent = next.name;
    }

    collectRelic() {
        if (!this.activeRelic) return;
        const relic = this.activeRelic;
        this.score += relic.score;
        this.relicsCollected.push(relic.id);
        this.spawnFloating(`+${relic.score}`, this.player.x, this.player.y, relic.color);
        this.map[this.relicPad.r][this.relicPad.c] = '=';
        this.activeRelic = null;
        this.relicTimer = 0;
        this.nextRelicIndex++;
        if (this.valRelic) this.valRelic.textContent = '—';
        this.updateRelicRosterUI();

        if (window.retroAudio) window.retroAudio.playFruit();
        window.web3Simulator.collectRelicTransaction(relic);
    }

    expireRelic() {
        if (!this.activeRelic) return;
        window.web3Simulator.log(`${this.activeRelic.name} desynced from the grid.`, 'alert');
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

    setupKeyboardInput() {
        document.addEventListener('keydown', (e) => {
            const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;

            // Retro arcade START (letter S) when not in a run
            if (!this.isActive && (key === 'S' || key === 'Enter' || key === ' ')) {
                e.preventDefault();
                this.tryStartFromInput();
                return;
            }

            if (!this.isActive) return;

            let dx = 0, dy = 0;
            switch (key) {
                case 'ArrowUp': case 'W': dy = -1; break;
                case 'ArrowDown': case 'S': dy = 1; break; // S = down only in-run
                case 'ArrowLeft': case 'A': dx = -1; break;
                case 'ArrowRight': case 'D': dx = 1; break;
                default: return;
            }
            e.preventDefault();
            this.nextDirX = dx;
            this.nextDirY = dy;
        });

        const startBtn = document.getElementById('btn-arcade-start');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.tryStartFromInput());
        }
    }

    setupGamepadInput() {
        window.addEventListener('gamepadconnected', (e) => {
            window.web3Simulator.log(`Gamepad detected: ${e.gamepad.id}`, 'event');
            this.startGamepadPolling();
        });
    }

    startGamepadPolling() {
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
            this.ghosts.forEach(g => {
                if (this.map[g.r][g.c] !== 'H') {
                    g.dirR = -g.dirR;
                    g.dirC = -g.dirC;
                }
            });
            window.web3Simulator.log(`Exploit swarm → ${this.globalMode.toUpperCase()}`, 'system');
        }
    }

    getChaseTarget(g) {
        const px = this.player.x, py = this.player.y;
        if (g.ai === 'chase') return { r: py, c: px };
        if (g.ai === 'ambush') {
            return {
                r: Math.max(0, Math.min(this.rows - 1, py + this.dirY * 4)),
                c: Math.max(0, Math.min(this.cols - 1, px + this.dirX * 4))
            };
        }
        if (g.ai === 'vector') {
            const lead = this.ghosts.find(x => x.ai === 'chase') || this.ghosts[0];
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
        this.tickCount++;
        if (this.invulnerableTurns > 0) this.invulnerableTurns--;
        this.updateGlobalMode();
        this.ghosts.forEach(g => { if (g.releaseIn > 0) g.releaseIn--; });

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
                this.dotsRemaining--;
                ateDot = true;
                if (window.retroAudio) window.retroAudio.playWaka();
                this.maybeSpawnRelic();
            } else if (char === 'O') {
                this.map[nextY][nextX] = '=';
                this.score += 50;
                this.dotsEaten++;
                this.dotsRemaining--;
                this.frightenedTurns = this.frightenedDuration;
                if (window.retroAudio) {
                    window.retroAudio.playWaka();
                    window.retroAudio.startMusic(true);
                }
                window.web3Simulator.log('Audit Cert online — Exploits are slashable!', 'event');
                this.spawnFloating('+50', nextX, nextY, '#00e6b8');
                this.maybeSpawnRelic();
            } else if (char === 'R') {
                this.collectRelic();
            }

            window.web3Simulator.registerMoveAndEatTransaction(nextX, nextY, ateDot);
        }

        if (this.invulnerableTurns <= 0) this.checkGhostCollisions();
        this.moveGhosts();
        if (this.invulnerableTurns <= 0) this.checkGhostCollisions();
        this.checkLevelCompletion();

        if (this.frightenedTurns > 0) {
            this.frightenedTurns--;
            if (this.frightenedTurns === 0) {
                if (window.retroAudio) window.retroAudio.startMusic(false);
                window.web3Simulator.log('Audit window closed. Exploits re-arm.', 'system');
            }
        }
        this.updateUI();
    }

    checkGhostCollisions() {
        const hit = this.ghosts.find(g => g.r === this.player.y && g.c === this.player.x);
        if (!hit) return;

        if (this.frightenedTurns > 0) {
            this.score += 200;
            this.spawnFloating('+200', hit.c, hit.r, '#fff');
            window.web3Simulator.log(`Slashed ${hit.name}!`, 'event');
            window.web3Simulator.eatGhostTransaction(hit.id);
            hit.r = hit.startR;
            hit.c = hit.startC;
            hit.releaseIn = 16;
            hit.dirR = -1;
            hit.dirC = 0;
        } else {
            this.lives--;
            window.web3Simulator.log(`${hit.name} compromised the Node! Uptime: ${this.lives}`, 'alert');
            window.web3Simulator.loseLifeTransaction(this.lives);
            if (this.lives <= 0) {
                this.stopGame();
                window.web3Simulator.triggerPermadeath();
            } else {
                this.player.x = this.player.startX;
                this.player.y = this.player.startY;
                this.dirX = -1; this.dirY = 0;
                this.nextDirX = -1; this.nextDirY = 0;
                this.invulnerableTurns = 14;
                this.frightenedTurns = 0;
                if (this.activeRelic) this.expireRelic();
                this.spawnGhosts();
            }
        }
    }

    moveGhosts() {
        const isVulnerable = this.frightenedTurns > 0;
        const elroy = this.dotsRemaining > 0 && this.dotsRemaining < 45;

        this.ghosts.forEach(g => {
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

            const target = this.getTargetForExploit(g);
            const bestDir = this.findBestDirectionToTarget(g.r, g.c, target.r, target.c, g);
            g.r += bestDir.dr;
            g.c = this.wrapCol(g.c + bestDir.dc);
            g.dirR = bestDir.dr;
            g.dirC = bestDir.dc;

            if (elroy && g.ai === 'chase' && !isVulnerable && this.tickCount % 2 === 0) {
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

    getValidDirections(r, c, forGhost = false, ghost = null) {
        const dirs = [
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
            { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
        ];
        return dirs.filter(d => {
            if (ghost && ghost.dirR === -d.dr && ghost.dirC === -d.dc) {
                const others = dirs.filter(o => !(o.dr === d.dr && o.dc === d.dc));
                const anyOther = others.some(o => {
                    const or2 = r + o.dr;
                    const oc2 = this.wrapCol(c + o.dc);
                    return or2 >= 0 && or2 < this.rows && this.isWalkableTile(this.map[or2]?.[oc2], forGhost);
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
            return this.isWalkableTile(this.map[nr][nc], forGhost);
        });
    }

    findBestDirectionToTarget(startR, startC, targetR, targetC, ghost = null) {
        const validDirs = this.getValidDirections(startR, startC, true, ghost);
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
        let left = false;
        for (let r = 0; r < this.rows && !left; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.map[r][c] === '.' || this.map[r][c] === 'O') { left = true; break; }
            }
        }
        if (!left) {
            this.level++;
            this.score += 500;
            this.invulnerableTurns = 14;
            this.nextRelicIndex = 0;
            this.activeRelic = null;
            window.web3Simulator.log(`Sector ${this.level - 1} sealed! +500 · deeper grid unlocked.`, 'event');
            if (window.retroAudio) window.retroAudio.playFruit();
            this.loadMap();
            this.spawnGhosts();
            this.player.x = this.player.startX;
            this.player.y = this.player.startY;
            this.dirX = -1; this.dirY = 0;
            this.modeIndex = 0;
            this.modeTimer = this.modeSchedule[0].ticks;
            this.globalMode = this.modeSchedule[0].mode;
        }
    }

    formatScoreDisplay(n) {
        if (typeof formatScoreText === 'function') return formatScoreText(n);
        return String(Math.max(0, Math.floor(Number(n) || 0))).slice(0, 12);
    }

    updateUI() {
        const scoreText = this.formatScoreDisplay(this.score);
        if (this.lblLevel) this.lblLevel.textContent = this.level;
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
        if (this.valMode) this.valMode.textContent = this.frightenedTurns > 0 ? 'AUDIT' : this.globalMode.toUpperCase();
        if (this.frightenedTurns > 0) {
            if (this.effectRow) this.effectRow.style.display = 'flex';
            if (this.valEffectTimer) this.valEffectTimer.textContent = `${Math.ceil(this.frightenedTurns / 4)}s`;
        } else if (this.effectRow) {
            this.effectRow.style.display = 'none';
        }
        if (!this.animFrameId) this.renderMap();
    }
}

new GameEngine();
