/**
 * ASCII Pac-Man Game Engine (game.js)
 * Implements retro 2D grid movement, waka-waka dot eating, power pellet frightened mode,
 * basic Ghost AI tracking (Blinky, Pinky, Inky, Clyde), modern Gamepad controller inputs,
 * and real-time synchronization with the Web3 blockchain ledger simulator.
 */

class GameEngine {
    constructor() {
        this.isActive = false;
        this.score = 0;
        this.dotsEaten = 0;
        this.lives = 3;
        this.level = 1;
        
        // Pac-Man stats
        this.player = {
            x: 14,
            y: 10,
            startX: 14,
            startY: 10,
            symbol: 'C' // Pac-Man shape
        };

        this.rows = 14;
        this.cols = 29;
        this.map = [];
        this.ghosts = [];
        
        // Frightened mode (Power Pellet effect)
        this.frightenedTurns = 0;
        this.frightenedDuration = 40; // Turn duration for vulnerable ghosts
        
        // Input settings
        this.lastGamepadInputTime = 0;
        this.gamepadCooldown = 180; // Fast response for arcade action
        
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

    // Classic map layout representation
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
        
        // Initialize map layout and parse starting coordinates
        this.loadMap();
        this.spawnGhosts();
        this.updateUI();
        
        if (window.retroAudio) {
            window.retroAudio.startMusic(false);
        }
        window.web3Simulator.log("Pac-Man started! Eat all dots (.) and avoid ghosts (G).", "system");
    }

    stopGame() {
        this.isActive = false;
        if (window.retroAudio) {
            window.retroAudio.stopMusic();
        }
        this.effectRow.style.display = 'none';
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
        
        // Reset player coordinates
        this.player.x = this.player.startX;
        this.player.y = this.player.startY;
    }

    spawnGhosts() {
        // Clear old ghosts and spawn Blinky, Pinky, Inky, Clyde at starting coordinates
        // Blinky: Red (Chase), Pinky: Pink (Ambush), Inky: Cyan (Patrol), Clyde: Orange (Random wander)
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
                // Check if player Pac-Man stands on coordinate
                if (r === this.player.y && c === this.player.x) {
                    rowHTML += `<span class="tile-player">${this.player.symbol}</span>`;
                    continue;
                }

                // Check if a ghost stands on coordinate
                const ghost = this.ghosts.find(g => g.r === r && g.c === c);
                if (ghost) {
                    const isVulnerable = this.frightenedTurns > 0;
                    const ghostClass = isVulnerable ? "tile-frightened" : ghost.class;
                    const ghostSymbol = isVulnerable ? "g" : "G"; // Lowercase 'g' indicates vulnerability
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
                    return; // Ignore other buttons
            }

            e.preventDefault();
            this.tryMove(dx, dy);
        });
    }

    setupGamepadInput() {
        window.addEventListener("gamepadconnected", (e) => {
            window.web3Simulator.log(`Gamepad detected: ${e.gamepad.id}`, 'event');
            this.startGamepadPolling();
        });
    }

    startGamepadPolling() {
        const poll = (time) => {
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
                        this.tryMove(dx, dy);
                        this.lastGamepadInputTime = now;
                    }
                }
            }

            requestAnimationFrame(poll);
        };

        requestAnimationFrame(poll);
    }

    tryMove(dx, dy) {
        const nextX = this.player.x + dx;
        const nextY = this.player.y + dy;

        // Wall collisions
        const char = this.map[nextY][nextX];
        if (char === '#') {
            return;
        }

        // Move Pac-Man orientation symbol representation
        if (dx === 1) this.player.symbol = 'C';
        else if (dx === -1) this.player.symbol = 'O'; // Flips mouth left
        else if (dy === 1) this.player.symbol = 'V';  // Mouth pointing down
        else if (dy === -1) this.player.symbol = 'A'; // Mouth pointing up

        this.player.x = nextX;
        this.player.y = nextY;

        let ateDot = false;
        
        // Handle dot consumption
        if (char === '.') {
            this.map[nextY][nextX] = ' '; // Eat dot
            this.score += 10;
            this.dotsEaten++;
            ateDot = true;
            if (window.retroAudio) window.retroAudio.playWaka();
        } else if (char === 'O') {
            this.map[nextY][nextX] = ' '; // Eat Power Pellet
            this.score += 50;
            this.frightenedTurns = this.frightenedDuration;
            if (window.retroAudio) {
                window.retroAudio.playWaka();
                window.retroAudio.startMusic(true); // Frightened alarm music
            }
            window.web3Simulator.log("Power Pellet eaten! Ghosts are now vulnerable!", "event");
        }

        // Register action to the simulated Web3 contract
        window.web3Simulator.registerMoveAndEatTransaction(nextX, nextY, ateDot);

        // Check if Pac-Man collides with any ghost at target space
        this.checkGhostCollisions();

        // Process game turn loops (Ghost AI moves)
        this.processTurn();
    }

    checkGhostCollisions() {
        const collidingGhost = this.ghosts.find(g => g.r === this.player.y && g.c === this.player.x);
        if (collidingGhost) {
            if (this.frightenedTurns > 0) {
                // Eat ghost
                this.score += 200;
                window.web3Simulator.log(`Pac-Man ate vulnerable Ghost ${collidingGhost.name}!`, "event");
                window.web3Simulator.eatGhostTransaction(collidingGhost.id);
                
                // Return eaten ghost back to house
                collidingGhost.r = collidingGhost.startR;
                collidingGhost.c = collidingGhost.startC;
            } else {
                // Lose life
                this.lives--;
                window.web3Simulator.log(`Pac-Man was caught by ${collidingGhost.name}! Lives remaining: ${this.lives}`, "alert");
                window.web3Simulator.loseLifeTransaction(this.lives);
                
                if (this.lives <= 0) {
                    this.isActive = false;
                    window.web3Simulator.triggerPermadeath();
                } else {
                    // Reset positions for this life retry
                    this.player.x = this.player.startX;
                    this.player.y = this.player.startY;
                    this.spawnGhosts();
                }
            }
        }
    }

    processTurn() {
        if (!this.isActive) return;

        // Frightened timer countdown updates
        if (this.frightenedTurns > 0) {
            this.frightenedTurns--;
            if (this.frightenedTurns === 0) {
                if (window.retroAudio) {
                    window.retroAudio.startMusic(false); // Return to standard siren
                }
                window.web3Simulator.log("Ghosts returned to normal speed and chase AI.", "system");
            }
        }

        // Ghosts Movement AI (Ghosts move every turn when normal, or every second turn if vulnerable/frightened)
        const isVulnerable = this.frightenedTurns > 0;
        
        this.ghosts.forEach(g => {
            if (isVulnerable && this.frightenedTurns % 2 === 0) {
                // Vulnerable ghosts move at half speed
                return;
            }

            let nextR = g.r;
            let nextC = g.c;

            if (isVulnerable) {
                // Flee / Wander AI (move randomly away or choose random direction)
                const dirs = this.getValidDirections(g.r, g.c);
                if (dirs.length > 0) {
                    const rDir = dirs[Math.floor(Math.random() * dirs.length)];
                    nextR = g.r + rDir.dr;
                    nextC = g.c + rDir.dc;
                }
            } else {
                // Chase AI strategies
                let targetR = this.player.y;
                let targetC = this.player.x;

                if (g.ai === "wander") {
                    // Clyde wanders randomly
                    const dirs = this.getValidDirections(g.r, g.c);
                    if (dirs.length > 0) {
                        const rDir = dirs[Math.floor(Math.random() * dirs.length)];
                        nextR = g.r + rDir.dr;
                        nextC = g.c + rDir.dc;
                    }
                } else {
                    if (g.ai === "ambush") {
                        // Pinky tries to target 3 steps ahead of player position
                        const dirVector = this.getPlayerDirectionVector();
                        targetR = Math.max(1, Math.min(this.rows - 2, this.player.y + dirVector.dy * 3));
                        targetC = Math.max(1, Math.min(this.cols - 2, this.player.x + dirVector.dx * 3));
                    }

                    // Blinky & Inky direct path calculation to target
                    const bestDir = this.findBestDirectionToTarget(g.r, g.c, targetR, targetC);
                    nextR = g.r + bestDir.dr;
                    nextC = g.c + bestDir.dc;
                }
            }

            // Perform ghost movement
            g.r = nextR;
            g.c = nextC;
        });

        // Double check collisions after ghost moves
        this.checkGhostCollisions();

        // Level completed check
        this.checkLevelCompletion();

        this.updateUI();
    }

    getValidDirections(r, c) {
        const dirs = [
            { dr: -1, dc: 0 }, // Up
            { dr: 1, dc: 0 },  // Down
            { dr: 0, dc: -1 }, // Left
            { dr: 0, dc: 1 }   // Right
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
            // Simple Manhattan distance formula
            const dist = Math.abs(nr - targetR) + Math.abs(nc - targetC);
            if (dist < minDist) {
                minDist = dist;
                bestDir = d;
            }
        });

        return bestDir;
    }

    getPlayerDirectionVector() {
        switch (this.player.symbol) {
            case 'C': return { dx: 1, dy: 0 };
            case 'O': return { dx: -1, dy: 0 };
            case 'V': return { dx: 0, dy: 1 };
            case 'A': return { dx: 0, dy: -1 };
            default: return { dx: 0, dy: 0 };
        }
    }

    checkLevelCompletion() {
        // Scans the 2D grid map for any remaining dots
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
        this.lblLevel.textContent = this.level;
        this.valScore.textContent = this.score;
        this.valDots.textContent = this.dotsEaten;

        // Format lives representation
        let livesHTML = '';
        for (let i = 0; i < this.lives; i++) {
            livesHTML += 'C ';
        }
        this.valLives.textContent = livesHTML || "None 💀";

        // Power mode timer updates
        if (this.frightenedTurns > 0) {
            this.effectRow.style.display = 'flex';
            this.valEffectTimer.textContent = `${Math.ceil(this.frightenedTurns / 4)}s`; // Turn scale to seconds mapping
        } else {
            this.effectRow.style.display = 'none';
        }

        this.renderMap();
    }
}

new GameEngine();
