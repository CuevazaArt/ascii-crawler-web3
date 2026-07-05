/**
 * Pac-Man Game Engine (game.js)
 * Implements real-time 250ms game ticks, movement buffering for precise grid turning,
 * classic Ghost AI logic, Gamepad inputs, and real-time Web3 ledger syncing.
 */

class GameEngine {
    constructor() {
        this.isActive = false;
        this.score = 0;
        this.dotsEaten = 0;
        this.lives = 3;
        this.level = 1;
        
        // Pac-Man stats and coordinates
        this.player = {
            x: 10,
            y: 10,
            startX: 10,
            startY: 10,
            symbol: 'C'
        };

        this.rows = 14;
        this.cols = 29;
        this.map = [];
        this.ghosts = [];
        
        // Real-time directions and buffer
        this.dirX = -1; // Starts moving left
        this.dirY = 0;
        this.nextDirX = -1;
        this.nextDirY = 0;
        
        // Frightened mode
        this.frightenedTurns = 0;
        this.frightenedDuration = 40; 
        
        this.gameInterval = null;
        this.gameTickMs = 250; 
        
        // Palettes configuration
        this.palettes = {
            classic: {
                bg: "#000000",
                wall: "#1919a3",
                dot: "#ffb8ae",
                pellet: "#ffb8ae",
                player: "#ffff00",
                ghosts: ["#ff0000", "#ffb8ff", "#00ffff", "#ffb852"],
                frightened: "#0000ff"
            },
            green: {
                bg: "#0f380f",
                wall: "#306230",
                dot: "#8bac0f",
                pellet: "#8bac0f",
                player: "#9bbc0f",
                ghosts: ["#306230", "#306230", "#306230", "#306230"],
                frightened: "#8bac0f"
            },
            pico: {
                bg: "#1d2b53",
                wall: "#7e2553",
                dot: "#ffccaa",
                pellet: "#ff004d",
                player: "#ffec27",
                ghosts: ["#ff004d", "#ff77a8", "#29adff", "#ffa300"],
                frightened: "#29adff"
            }
        };
        this.activePalette = 'classic';
        
        // DOM Elements
        this.canvas = document.getElementById('game-canvas');
        if (this.canvas) this.ctx = this.canvas.getContext('2d');
        this.screenEl = document.getElementById('terminal-screen');
        this.lblLevel = document.getElementById('lbl-level');
        this.valScore = document.getElementById('val-score');
        this.valDots = document.getElementById('val-dots');
        this.valLives = document.getElementById('val-lives');
        this.effectRow = document.getElementById('effect-row');
        this.valEffectTimer = document.getElementById('val-effect-timer');

        // Global instance mapping
        window.gameEngine = this;
        this.setupKeyboardInput();
        this.setupGamepadInput();
    }

    getMapLayout() {
        return [
            "#############################",
            "#............###............#",
            "#.###.#####.#####.#####.###.#",
            "#O###.#####.#####.#####.###O#",
            "#...........................#",
            "#.###.###.#########.###.###.#",
            "#.....###....###....###.....#",
            "#####.###### ### ######.#####",
            "    #.###    . .    ###.#    ",
            "#####.### ######### ###.#####",
            "#.....###....###....###.....#",
            "#O###.#####.#####.#####.###O#",
            "#............###............#",
            "#############################"
        ];
    }

    startGame(playerSkin) {
        this.isActive = true;
        this.score = 0;
        this.dotsEaten = 0;
        this.lives = 3;
        this.level = 1;
        this.frightenedTurns = 0;
        
        // Set starting movement directions
        this.dirX = -1;
        this.dirY = 0;
        this.nextDirX = -1;
        this.nextDirY = 0;
        
        this.loadMap();
        this.spawnGhosts();
        
        // Show canvas and hide start prompt
        const prompt = document.getElementById('start-prompt');
        if (prompt) prompt.style.display = 'none';
        if (this.canvas) this.canvas.style.display = 'block';
        
        this.updateUI();
        
        if (window.retroAudio) {
            window.retroAudio.startMusic(false);
        }
        
        window.web3Simulator.log("Pac-Man started! Use WASD / Arrows to buffer directions.", "system");

        // Clear existing intervals
        if (this.gameInterval) clearInterval(this.gameInterval);
        
        // Launch real-time tick interval
        this.gameInterval = setInterval(() => this.gameTick(), this.gameTickMs);
    }

    stopGame() {
        this.isActive = false;
        if (this.gameInterval) {
            clearInterval(this.gameInterval);
            this.gameInterval = null;
        }
        if (window.retroAudio) {
            window.retroAudio.stopMusic();
        }
        if (this.effectRow) this.effectRow.style.display = 'none';
        
        // Hide canvas and show start prompt
        if (this.canvas) this.canvas.style.display = 'none';
        const prompt = document.getElementById('start-prompt');
        if (prompt) prompt.style.display = 'block';
    }

    loadMap() {
        this.map = [];
        const layout = this.getMapLayout();
        for (let r = 0; r < this.rows; r++) {
            this.map[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.map[r][c] = layout[r][c];
            }
        }
        this.player.x = this.player.startX;
        this.player.y = this.player.startY;
    }

    spawnGhosts() {
        this.ghosts = [
            { id: 0, name: "Blinky", class: "tile-blinky", r: 8, c: 13, startR: 8, startC: 13, ai: "chase" },
            { id: 1, name: "Pinky", class: "tile-pinky", r: 8, c: 15, startR: 8, startC: 15, ai: "ambush" },
            { id: 2, name: "Inky", class: "tile-inky", r: 8, c: 12, startR: 8, startC: 12, ai: "patrol" },
            { id: 3, name: "Clyde", class: "tile-clyde", r: 8, c: 16, startR: 8, startC: 16, ai: "wander" }
        ];
    }

    setPalette(name) {
        if (this.palettes[name]) {
            this.activePalette = name;
            this.renderMap();
        }
    }

    renderMap() {
        if (!this.ctx || !this.canvas) return;
        const tileSize = 20;
        const palette = this.palettes[this.activePalette];
        
        // 1. Draw Background
        this.ctx.fillStyle = palette.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Draw walls, dots, pellets
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const char = this.map[r][c];
                const x = c * tileSize;
                const y = r * tileSize;

                if (char === '#') {
                    // Draw solid wall block
                    this.ctx.fillStyle = palette.wall;
                    this.ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
                } else if (char === '.') {
                    // Draw normal dot
                    this.ctx.fillStyle = palette.dot;
                    this.ctx.fillRect(x + tileSize/2 - 2, y + tileSize/2 - 2, 4, 4);
                } else if (char === 'O') {
                    // Draw Power Pellet
                    this.ctx.fillStyle = palette.pellet;
                    this.ctx.beginPath();
                    this.ctx.arc(x + tileSize/2, y + tileSize/2, 6, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        }

        // 3. Draw Pac-Man
        const centerX = this.player.x * tileSize + tileSize / 2;
        const centerY = this.player.y * tileSize + tileSize / 2;
        const radius = tileSize / 2 - 2;
        
        this.ctx.fillStyle = palette.player;
        this.ctx.beginPath();
        
        // Animated open/close mouth
        const open = (Date.now() % 500 < 250); 
        let startAngle = 0;
        let endAngle = Math.PI * 2;
        
        if (open) {
            if (this.dirX === 1) { // Right
                startAngle = 0.2 * Math.PI;
                endAngle = 1.8 * Math.PI;
            } else if (this.dirX === -1) { // Left
                startAngle = 1.2 * Math.PI;
                endAngle = 0.8 * Math.PI;
            } else if (this.dirY === 1) { // Down
                startAngle = 0.7 * Math.PI;
                endAngle = 0.3 * Math.PI;
            } else if (this.dirY === -1) { // Up
                startAngle = 1.7 * Math.PI;
                endAngle = 1.3 * Math.PI;
            }
        }
        
        if (open && (this.dirX !== 0 || this.dirY !== 0)) {
            this.ctx.moveTo(centerX, centerY);
            this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            this.ctx.lineTo(centerX, centerY);
        } else {
            this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        }
        this.ctx.fill();

        // 4. Draw Ghosts
        this.ghosts.forEach(g => {
            const gx = g.c * tileSize + 2;
            const gy = g.r * tileSize + 2;
            const size = tileSize - 4;
            const isVulnerable = this.frightenedTurns > 0;
            
            // Ghost body
            this.ctx.fillStyle = isVulnerable 
                ? (this.frightenedTurns < 12 && Date.now() % 400 < 200 ? "#ffffff" : palette.frightened) 
                : palette.ghosts[g.id];
            
            this.ctx.beginPath();
            this.ctx.arc(gx + size / 2, gy + size / 3 + 2, size / 2, Math.PI, 0, false);
            this.ctx.lineTo(gx + size, gy + size);
            
            // Wavy bottom
            const waveWidth = size / 3;
            this.ctx.lineTo(gx + size - waveWidth * 0.5, gy + size - 3);
            this.ctx.lineTo(gx + size - waveWidth, gy + size);
            this.ctx.lineTo(gx + size - waveWidth * 1.5, gy + size - 3);
            this.ctx.lineTo(gx + size - waveWidth * 2, gy + size);
            this.ctx.lineTo(gx + size - waveWidth * 2.5, gy + size - 3);
            this.ctx.lineTo(gx, gy + size);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Eyes
            this.ctx.fillStyle = "#ffffff";
            const eyeRadius = 3;
            const eyeY = gy + size / 3 + 2;
            
            this.ctx.beginPath();
            this.ctx.arc(gx + size / 3, eyeY, eyeRadius, 0, Math.PI * 2);
            this.ctx.arc(gx + size * 2/3, eyeY, eyeRadius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Pupils
            this.ctx.fillStyle = isVulnerable ? "#ff0000" : "#0000ff";
            const pupilRadius = 1.5;
            this.ctx.beginPath();
            this.ctx.arc(gx + size / 3 + this.dirX, eyeY + this.dirY, pupilRadius, 0, Math.PI * 2);
            this.ctx.arc(gx + size * 2/3 + this.dirX, eyeY + this.dirY, pupilRadius, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    setupKeyboardInput() {
        document.addEventListener('keydown', (e) => {
            if (!this.isActive) return;

            let dx = 0;
            let dy = 0;

            switch (e.key.toUpperCase()) {
                case 'ARROWUP':
                case 'W': dy = -1; break;
                case 'ARROWDOWN':
                case 'S': dy = 1; break;
                case 'ARROWLEFT':
                case 'A': dx = -1; break;
                case 'ARROWRIGHT':
                case 'D': dx = 1; break;
                default:
                    return;
            }

            e.preventDefault();
            this.nextDirX = dx;
            this.nextDirY = dy;
        });
    }

    setupGamepadInput() {
        window.addEventListener("gamepadconnected", (e) => {
            window.web3Simulator.log(`Gamepad detected: ${e.gamepad.id}`, 'event');
            this.startGamepadPolling();
        });
    }

    startGamepadPolling() {
        const poll = () => {
            if (!this.isActive) {
                requestAnimationFrame(poll);
                return;
            }

            const gamepads = navigator.getGamepads();
            const gp = gamepads[0];

            if (gp) {
                let dx = 0;
                let dy = 0;

                if (gp.buttons[12]?.pressed) dy = -1;
                else if (gp.buttons[13]?.pressed) dy = 1;

                if (gp.buttons[14]?.pressed) dx = -1;
                else if (gp.buttons[15]?.pressed) dx = 1;

                if (dx === 0 && dy === 0) {
                    const deadzone = 0.4;
                    if (Math.abs(gp.axes[0]) > deadzone) dx = gp.axes[0] > 0 ? 1 : -1;
                    if (Math.abs(gp.axes[1]) > deadzone) dy = gp.axes[1] > 0 ? 1 : -1;
                }

                const now = performance.now();
                if (now - this.lastGamepadInputTime > this.gamepadCooldown) {
                    if (dx !== 0 || dy !== 0) {
                        this.nextDirX = dx;
                        this.nextDirY = dy;
                        this.lastGamepadInputTime = now;
                    }
                }
            }
            requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
    }

    canMove(dx, dy) {
        const nx = this.player.x + dx;
        const ny = this.player.y + dy;
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) return false;
        return this.map[ny][nx] !== '#';
    }

    gameTick() {
        if (!this.isActive) return;

        // 1. Try to turn in the buffered next direction
        if ((this.nextDirX !== 0 || this.nextDirY !== 0) && this.canMove(this.nextDirX, this.nextDirY)) {
            this.dirX = this.nextDirX;
            this.dirY = this.nextDirY;
            // Clear buffer
            this.nextDirX = 0;
            this.nextDirY = 0;
        }

        // 2. Perform the movement in current direction
        if (this.canMove(this.dirX, this.dirY)) {
            const nextX = this.player.x + this.dirX;
            const nextY = this.player.y + this.dirY;

            // Update direction symbol
            if (this.dirX === 1) this.player.symbol = 'C';
            else if (this.dirX === -1) this.player.symbol = 'O';
            else if (this.dirY === 1) this.player.symbol = 'V';
            else if (this.dirY === -1) this.player.symbol = 'A';

            this.player.x = nextX;
            this.player.y = nextY;

            let ateDot = false;
            const char = this.map[nextY][nextX];
            
            if (char === '.') {
                this.map[nextY][nextX] = ' ';
                this.score += 10;
                this.dotsEaten++;
                ateDot = true;
                if (window.retroAudio) window.retroAudio.playWaka();
            } else if (char === 'O') {
                this.map[nextY][nextX] = ' ';
                this.score += 50;
                this.frightenedTurns = this.frightenedDuration;
                if (window.retroAudio) {
                    window.retroAudio.playWaka();
                    window.retroAudio.startMusic(true);
                }
                window.web3Simulator.log("Power Pellet eaten! Ghosts are now vulnerable!", "event");
            }

            window.web3Simulator.registerMoveAndEatTransaction(nextX, nextY, ateDot);
        }

        // 3. Check collisions
        this.checkGhostCollisions();

        // 4. Move Ghosts
        this.moveGhosts();

        // 5. Check collisions again after ghosts move
        this.checkGhostCollisions();

        // 6. Check stage completion
        this.checkLevelCompletion();

        // 7. Frightened timer decrement
        if (this.frightenedTurns > 0) {
            this.frightenedTurns--;
            if (this.frightenedTurns === 0) {
                if (window.retroAudio) window.retroAudio.startMusic(false);
                window.web3Simulator.log("Ghosts returned to normal speed.", "system");
            }
        }

        this.updateUI();
    }

    checkGhostCollisions() {
        const collidingGhost = this.ghosts.find(g => g.r === this.player.y && g.c === this.player.x);
        if (collidingGhost) {
            if (this.frightenedTurns > 0) {
                this.score += 200;
                window.web3Simulator.log(`Pac-Man ate Ghost ${collidingGhost.name}!`, "event");
                window.web3Simulator.eatGhostTransaction(collidingGhost.id);
                collidingGhost.r = collidingGhost.startR;
                collidingGhost.c = collidingGhost.startC;
            } else {
                this.lives--;
                window.web3Simulator.log(`Pac-Man caught by ${collidingGhost.name}! Lives: ${this.lives}`, "alert");
                window.web3Simulator.loseLifeTransaction(this.lives);
                
                if (this.lives <= 0) {
                    this.stopGame();
                    window.web3Simulator.triggerPermadeath();
                } else {
                    this.player.x = this.player.startX;
                    this.player.y = this.player.startY;
                    this.dirX = -1;
                    this.dirY = 0;
                    this.spawnGhosts();
                }
            }
        }
    }

    moveGhosts() {
        const isVulnerable = this.frightenedTurns > 0;
        
        this.ghosts.forEach(g => {
            if (isVulnerable && this.frightenedTurns % 2 === 0) {
                // Frightened ghosts move at half speed
                return;
            }

            let nextR = g.r;
            let nextC = g.c;

            if (isVulnerable) {
                const dirs = this.getValidDirections(g.r, g.c);
                if (dirs.length > 0) {
                    const rDir = dirs[Math.floor(Math.random() * dirs.length)];
                    nextR = g.r + rDir.dr;
                    nextC = g.c + rDir.dc;
                }
            } else {
                let targetR = this.player.y;
                let targetC = this.player.x;

                if (g.ai === "wander") {
                    const dirs = this.getValidDirections(g.r, g.c);
                    if (dirs.length > 0) {
                        const rDir = dirs[Math.floor(Math.random() * dirs.length)];
                        nextR = g.r + rDir.dr;
                        nextC = g.c + rDir.dc;
                    }
                } else {
                    if (g.ai === "ambush") {
                        const dirVector = this.getPlayerDirectionVector();
                        targetR = Math.max(1, Math.min(this.rows - 2, this.player.y + dirVector.dy * 3));
                        targetC = Math.max(1, Math.min(this.cols - 2, this.player.x + dirVector.dx * 3));
                    }
                    const bestDir = this.findBestDirectionToTarget(g.r, g.c, targetR, targetC);
                    nextR = g.r + bestDir.dr;
                    nextC = g.c + bestDir.dc;
                }
            }

            g.r = nextR;
            g.c = nextC;
        });
    }

    getValidDirections(r, c) {
        const dirs = [
            { dr: -1, dc: 0 },
            { dr: 1, dc: 0 },
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 }
        ];
        return dirs.filter(d => {
            const nr = r + d.dr;
            const nc = c + d.dc;
            return nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && this.map[nr][nc] !== '#';
        });
    }

    findBestDirectionToTarget(startR, startC, targetR, targetC) {
        const validDirs = this.getValidDirections(startR, startC);
        if (validDirs.length === 0) return { dr: 0, dc: 0 };

        let bestDir = validDirs[0];
        let minDist = Infinity;

        validDirs.forEach(d => {
            const nr = startR + d.dr;
            const nc = startC + d.dc;
            const dist = Math.abs(nr - targetR) + Math.abs(nc - targetC);
            if (dist < minDist) {
                minDist = dist;
                bestDir = d;
            }
        });
        return bestDir;
    }

    getPlayerDirectionVector() {
        return { dx: this.dirX, dy: this.dirY };
    }

    checkLevelCompletion() {
        let dotsRemaining = false;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.map[r][c] === '.' || this.map[r][c] === 'O') {
                    dotsRemaining = true;
                    break;
                }
            }
            if (dotsRemaining) break;
        }

        if (!dotsRemaining) {
            this.level++;
            window.web3Simulator.log(`Stage completed! Advancing to Board ${this.level}.`, "system");
            if (window.retroAudio) window.retroAudio.playFruit();
            this.loadMap();
            this.spawnGhosts();
        }
    }

    updateUI() {
        if (this.lblLevel) this.lblLevel.textContent = this.level;
        if (this.valScore) this.valScore.textContent = this.score;
        if (this.valDots) this.valDots.textContent = this.dotsEaten;

        let livesHTML = '';
        for (let i = 0; i < this.lives; i++) {
            livesHTML += 'C ';
        }
        if (this.valLives) this.valLives.textContent = livesHTML || "None 💀";

        if (this.frightenedTurns > 0) {
            if (this.effectRow) this.effectRow.style.display = 'flex';
            if (this.valEffectTimer) this.valEffectTimer.textContent = `${Math.ceil(this.frightenedTurns / 4)}s`;
        } else {
            if (this.effectRow) this.effectRow.style.display = 'none';
        }
        this.renderMap();
    }
}

new GameEngine();
