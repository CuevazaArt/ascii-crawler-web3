/**
 * ASCII Pac-Man Game Engine (game.js)
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
        this.gameTickMs = 250; // 4 ticks per second for authentic speed
        
        // DOM Elements
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
        this.screenEl.innerHTML = `
            <div class="start-screen-prompt" id="start-prompt">
                <p class="blink text-primary">RUN COMPLETED OR RETREATED</p>
                <p class="subtext">Insert another coin to start a new arcade run.</p>
                <div class="controls-guide">
                    <h3>CONTROLS</h3>
                    <p><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or Arrows: Move Pac-Man</p>
                    <p><i class="fa-solid fa-gamepad"></i> Gamepad: D-pad / Analog Stick support active</p>
                </div>
            </div>
        `;
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

    renderMap() {
        let asciiHTML = '<div class="ascii-grid">';
        for (let r = 0; r < this.rows; r++) {
            let rowHTML = '';
            for (let c = 0; c < this.cols; c++) {
                if (r === this.player.y && c === this.player.x) {
                    rowHTML += `<span class="tile-player">${this.player.symbol}</span>`;
                    continue;
                }

                const ghost = this.ghosts.find(g => g.r === r && g.c === c);
                if (ghost) {
                    const isVulnerable = this.frightenedTurns > 0;
                    const ghostClass = isVulnerable ? "tile-frightened" : ghost.class;
                    const ghostSymbol = isVulnerable ? "g" : "G";
                    rowHTML += `<span class="${ghostClass}">${ghostSymbol}</span>`;
                    continue;
                }

                const char = this.map[r][c];
                let spanClass = 'tile-floor';

                if (char === '#') spanClass = 'tile-wall';
                else if (char === '.') spanClass = 'tile-dot';
                else if (char === 'O') spanClass = 'tile-pellet';

                rowHTML += `<span class="${spanClass}">${char}</span>`;
            }
            asciiHTML += rowHTML + '\n';
        }
        asciiHTML += '</div>';
        this.screenEl.innerHTML = asciiHTML;
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
