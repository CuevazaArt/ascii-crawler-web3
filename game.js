/**
 * ASCII Roguelike Game Engine (game.js)
 * Handles grid exploration, turn-based inputs, simple monster AIs,
 * combat collisions, HTML5 Gamepad (Xbox/PlayStation) integrations,
 * and syncs with the Web3 blockchain simulator.
 */

class GameEngine {
    constructor() {
        this.isActive = false;
        this.level = 1;
        this.score = 0;
        this.playerClass = "";
        this.playerStats = {
            hp: 100,
            maxHp: 100,
            x: 0,
            y: 0,
            attack: 15
        };

        // Map dimensions
        this.rows = 11;
        this.cols = 35;
        this.map = [];
        this.monsters = [];
        
        // Gamepad throttle controls
        this.lastGamepadInputTime = 0;
        this.gamepadCooldown = 220; // Milliseconds between moves to prevent spamming
        
        // DOM Elements
        this.screenEl = document.getElementById('terminal-screen');
        this.lblLevel = document.getElementById('lbl-level');
        this.valHp = document.getElementById('val-hp');
        this.hpBar = document.getElementById('hp-bar');
        this.valScore = document.getElementById('val-score');

        // Global instance registration
        window.gameEngine = this;
        this.setupKeyboardInput();
        this.setupGamepadInput();
    }

    startGame(playerClass) {
        this.isActive = true;
        this.level = 1;
        this.score = 0;
        this.playerClass = playerClass;
        
        // Adjust starting stats based on Hero class
        this.playerStats.maxHp = 100;
        if (playerClass === "Warrior") {
            this.playerStats.hp = 120;
            this.playerStats.maxHp = 120;
            this.playerStats.attack = 18;
        } else if (playerClass === "Mage") {
            this.playerStats.hp = 80;
            this.playerStats.maxHp = 80;
            this.playerStats.attack = 22;
        } else { // Rogue
            this.playerStats.hp = 100;
            this.playerStats.maxHp = 100;
            this.playerStats.attack = 15;
        }

        // Generate starting level map
        this.generateLevelMap();
        this.updateUI();
        window.web3Simulator.log("Active run! Explore the dungeon using W/A/S/D or Arrow keys. Gamepad support active.", "system");
    }

    stopGame() {
        this.isActive = false;
        this.screenEl.innerHTML = `
            <div class="start-screen-prompt" id="start-prompt">
                <p class="blink text-primary">RUN COMPLETED OR RETREATED</p>
                <p class="subtext">Start a new run to explore a fresh dungeon layout.</p>
                <div class="controls-guide">
                    <h3>CONTROLS</h3>
                    <p><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or Arrows: Move</p>
                    <p><kbd>Space</kbd>: Skip turn / Wait</p>
                    <p><i class="fa-solid fa-gamepad"></i> Gamepad: D-pad/Stick to Move, [A] to Wait</p>
                </div>
            </div>
        `;
    }

    // Map generator
    generateLevelMap() {
        this.map = [];
        this.monsters = [];

        // Simple dungeon layout (2 rooms connected by a corridor)
        for (let r = 0; r < this.rows; r++) {
            this.map[r] = [];
            for (let c = 0; c < this.cols; c++) {
                // Outermost boundaries are walls
                if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
                    this.map[r][c] = '#';
                } else {
                    this.map[r][c] = ' ';
                }
            }
        }

        // Design Room 1 (Left Room)
        const rm1 = { r1: 1, r2: 5, c1: 1, c2: 15 };
        this.drawRoom(rm1);

        // Design Room 2 (Right Room)
        const rm2 = { r1: 5, r2: 9, c1: 18, c2: 33 };
        this.drawRoom(rm2);

        // Connection corridors (vertical & horizontal)
        this.drawCorridor(3, 15, 3, 22);
        this.drawCorridor(3, 22, 6, 22);
        this.drawCorridor(6, 22, 6, 18);

        // Draw doors
        this.map[3][15] = '+';
        this.map[6][18] = '+';

        // Set starting player coordinates in Room 1
        this.playerStats.x = 4;
        this.playerStats.y = 3;

        // Exit stairs in Room 2
        this.map[8][30] = '>';

        // Chests placement
        this.map[2][12] = 'C';
        if (this.level > 1) {
            this.map[7][20] = 'C'; // Extra loot on higher floors
        }

        // Traps placement (^)
        this.map[3][22] = '^'; 
        if (this.level > 1) {
            this.map[6][25] = '^';
        }

        // Spawn monsters
        if (this.level === 1) {
            this.spawnMonster(3, 10, "M", 35, 10); // Common Monster: 35 HP, 10 Attack
            this.spawnMonster(7, 26, "M", 35, 10);
        } else {
            // Level 2+ introduces a stronger Troll (T)
            this.spawnMonster(3, 10, "M", 35, 10);
            this.spawnMonster(7, 26, "T", 70, 18); // Troll: 70 HP, 18 Attack
        }
    }

    drawRoom(rm) {
        for (let r = rm.r1; r <= rm.r2; r++) {
            for (let c = rm.c1; c <= rm.c2; c++) {
                this.map[r][c] = '.';
            }
        }
        // Place walls around room edges (if not overlapping boundary walls)
        for (let r = rm.r1 - 1; r <= rm.r2 + 1; r++) {
            for (let c = rm.c1 - 1; c <= rm.c2 + 1; c++) {
                if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
                    if (this.map[r][c] === ' ') {
                        this.map[r][c] = '#';
                    }
                }
            }
        }
    }

    drawCorridor(r1, c1, r2, c2) {
        const startR = Math.min(r1, r2);
        const endR = Math.max(r1, r2);
        const startC = Math.min(c1, c2);
        const endC = Math.max(c1, c2);

        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                this.map[r][c] = '.';
            }
        }
    }

    spawnMonster(r, c, type, hp, attack) {
        this.monsters.push({
            r: r,
            c: c,
            type: type,
            hp: hp,
            attack: attack
        });
    }

    // Render 2D grid to colored HTML template strings
    renderMap() {
        let asciiHTML = '<div class="ascii-grid">';
        
        for (let r = 0; r < this.rows; r++) {
            let rowHTML = '';
            for (let c = 0; c < this.cols; c++) {
                // Render player '@'
                if (r === this.playerStats.y && c === this.playerStats.x) {
                    rowHTML += '<span class="tile-player">@</span>';
                    continue;
                }

                // Render active monsters
                const monster = this.monsters.find(m => m.r === r && m.c === c);
                if (monster) {
                    const mClass = monster.type === 'T' ? 'tile-troll' : 'tile-monster';
                    rowHTML += `<span class="${mClass}">${monster.type}</span>`;
                    continue;
                }

                const char = this.map[r][c];
                let spanClass = '';

                switch (char) {
                    case '#': spanClass = 'tile-wall'; break;
                    case '.': spanClass = 'tile-floor'; break;
                    case '+': spanClass = 'tile-door'; break;
                    case '>': spanClass = 'tile-stairs'; break;
                    case 'C': spanClass = 'tile-chest'; break;
                    case '^': spanClass = 'tile-floor'; break; // Hidden traps render as floor tiles
                    default: spanClass = 'tile-floor';
                }

                // If trap is triggered, we show it
                if (char === '^' && this.map[r][c] === '^' && this.isTrapDiscovered(r, c)) {
                    rowHTML += '<span class="tile-trap">^</span>';
                } else {
                    rowHTML += `<span class="${spanClass}">${char}</span>`;
                }
            }
            asciiHTML += rowHTML + '\n';
        }
        
        asciiHTML += '</div>';
        this.screenEl.innerHTML = asciiHTML;
    }

    isTrapDiscovered(r, c) {
        return this.map[r][c] === 'X'; // Marked as triggered/stepped 'X'
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
                case ' ': // Space key skips turn (wait)
                    this.processTurn();
                    return;
                default:
                    return; // Ignore other inputs
            }

            e.preventDefault();
            this.tryMove(dx, dy);
        });
    }

    // Connect and map modern gamepads (e.g. Xbox controllers) via HTML5 Gamepad API
    setupGamepadInput() {
        window.addEventListener("gamepadconnected", (e) => {
            window.web3Simulator.log(`Gamepad detected: ${e.gamepad.id}`, 'event');
            this.startGamepadPolling();
        });

        window.addEventListener("gamepaddisconnected", (e) => {
            window.web3Simulator.log("Gamepad disconnected.", 'alert');
        });
    }

    startGamepadPolling() {
        const poll = (time) => {
            if (!this.isActive) {
                requestAnimationFrame(poll);
                return;
            }

            const gamepads = navigator.getGamepads();
            const gp = gamepads[0]; // Use first controller detected

            if (gp) {
                let dx = 0;
                let dy = 0;

                // 1. Read Standard D-Pad mapping: D-pad Up (12), Down (13), Left (14), Right (15)
                if (gp.buttons[12]?.pressed) dy = -1;
                else if (gp.buttons[13]?.pressed) dy = 1;

                if (gp.buttons[14]?.pressed) dx = -1;
                else if (gp.buttons[15]?.pressed) dx = 1;

                // 2. Fallback to Left Analog Stick axis mapping (with 0.4 deadzone filter)
                if (dx === 0 && dy === 0) {
                    const deadzone = 0.4;
                    const axisX = gp.axes[0];
                    const axisY = gp.axes[1];

                    if (Math.abs(axisX) > deadzone) {
                        dx = axisX > 0 ? 1 : -1;
                    }
                    if (Math.abs(axisY) > deadzone) {
                        dy = axisY > 0 ? 1 : -1;
                    }
                }

                // 3. Trigger action buttons
                // Button 0 corresponds to A Button (Xbox) or Cross (PlayStation)
                const aButtonPressed = gp.buttons[0]?.pressed;

                // Process input throttled by directional cooldown to avoid high-frequency loop triggers
                const now = performance.now();
                if (now - this.lastGamepadInputTime > this.gamepadCooldown) {
                    if (dx !== 0 || dy !== 0) {
                        this.tryMove(dx, dy);
                        this.lastGamepadInputTime = now;
                    } else if (aButtonPressed) {
                        this.processTurn(); // A Button skips turn/wait
                        this.lastGamepadInputTime = now;
                    }
                }
            }

            requestAnimationFrame(poll);
        };

        requestAnimationFrame(poll);
    }

    tryMove(dx, dy) {
        const nextX = this.playerStats.x + dx;
        const nextY = this.playerStats.y + dy;

        // Wall collisions
        const char = this.map[nextY][nextX];
        if (char === '#') {
            return;
        }

        // Combat triggers on monster tile overlap
        const monsterIndex = this.monsters.findIndex(m => m.r === nextY && m.c === nextX);
        if (monsterIndex !== -1) {
            this.fight(monsterIndex);
            this.processTurn();
            return;
        }

        // Perform move coordinates change
        this.playerStats.x = nextX;
        this.playerStats.y = nextY;

        // Register move transaction to ledger simulation log
        window.web3Simulator.registerMoveTransaction(nextX, nextY);

        // Process special tile landing events
        if (char === 'C') {
            this.score += 50;
            this.map[nextY][nextX] = '.'; // Remove chest from map grid
            this.renderMap();
            window.web3Simulator.log("You opened a golden chest!", "event");
            window.web3Simulator.openChestTransaction();
        } else if (char === '^') {
            const trapDamage = 15;
            this.playerStats.hp = Math.max(0, this.playerStats.hp - trapDamage);
            this.map[nextY][nextX] = 'X'; // Reveal triggered trap
            window.web3Simulator.log(`Alert! You triggered an arrow trap. Lost ${trapDamage} HP.`, "alert");
            this.checkPlayerDeath();
        } else if (char === '>') {
            // Descend floor stairs
            this.level++;
            this.score += 200;
            window.web3Simulator.descendLevelTransaction(this.level);
            window.web3Simulator.log(`Descending to Floor ${this.level} of the dungeon...`, "system");
            this.generateLevelMap();
        }

        this.processTurn();
    }

    fight(monsterIndex) {
        const m = this.monsters[monsterIndex];
        const mName = m.type === 'T' ? 'Troll' : 'Monster';
        
        // Player attacks
        m.hp -= this.playerStats.attack;
        window.web3Simulator.log("You attack the " + mName + " for " + this.playerStats.attack + " damage.", "system");

        if (m.hp <= 0) {
            window.web3Simulator.log("You defeated the " + mName + "!", "event");
            this.score += m.type === 'T' ? 150 : 80;
            this.monsters.splice(monsterIndex, 1);
            window.web3Simulator.resolveCombatTransaction(mName, true, 0);
        } else {
            // Immediate counterattack
            const mDamage = m.attack;
            this.playerStats.hp = Math.max(0, this.playerStats.hp - mDamage);
            window.web3Simulator.log("The " + mName + " counterattacks and deals you " + mDamage + " damage.", "alert");
            window.web3Simulator.resolveCombatTransaction(mName, false, mDamage);
            this.checkPlayerDeath();
        }
    }

    processTurn() {
        if (!this.isActive) return;

        // Basic Monster AI: moves 1 tile closer if within 6 grid spaces
        this.monsters.forEach((m, idx) => {
            const dist = Math.abs(m.r - this.playerStats.y) + Math.abs(m.c - this.playerStats.x);
            const mName = m.type === 'T' ? 'Troll' : 'Monster';

            if (dist < 6 && dist > 1) {
                let dr = 0;
                let dc = 0;

                if (m.r < this.playerStats.y) dr = 1;
                else if (m.r > this.playerStats.y) dr = -1;
                
                if (m.c < this.playerStats.x) dc = 1;
                else if (m.c > this.playerStats.x) dc = -1;

                const nextR = m.r + dr;
                const nextC = m.c + dc;

                if (this.map[nextR][nextC] !== '#' && this.map[nextR][nextC] !== '>' && this.map[nextR][nextC] !== '+' &&
                    !this.monsters.some(other => other !== m && other.r === nextR && other.c === nextC)) {
                    m.r = nextR;
                    m.c = nextC;
                }
            } else if (dist === 1) {
                // Perform attack on player if standing adjacent on their turn
                const mDamage = m.attack;
                this.playerStats.hp = Math.max(0, this.playerStats.hp - mDamage);
                window.web3Simulator.log("The " + mName + " attacks you for " + mDamage + " damage on its turn.", "alert");
                window.web3Simulator.resolveCombatTransaction(mName, false, mDamage);
                this.checkPlayerDeath();
            }
        });

        this.updateUI();
    }

    checkPlayerDeath() {
        if (this.playerStats.hp <= 0) {
            this.isActive = false;
            window.web3Simulator.triggerPermadeath();
        }
    }

    updateUI() {
        this.lblLevel.textContent = this.level;
        this.valScore.textContent = this.score;
        this.valHp.textContent = this.playerStats.hp + "/" + this.playerStats.maxHp;
        
        const hpPercent = (this.playerStats.hp / this.playerStats.maxHp) * 100;
        this.hpBar.style.width = hpPercent + "%";

        this.renderMap();
    }
}

// Instantiate the game engine globally
new GameEngine();
