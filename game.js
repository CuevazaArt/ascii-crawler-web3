/**
 * ASCII Roguelike Game Engine (game.js)
 * Maneja la lógica de exploración de cuadrícula, combate por turnos, inteligencia artificial
 * básica de enemigos y sincronización con el simulador Web3 de blockchain.
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

        // Dimensiones del mapa
        this.rows = 11;
        this.cols = 35;
        this.map = [];
        this.monsters = [];
        
        // Elementos DOM
        this.screenEl = document.getElementById('terminal-screen');
        this.lblLevel = document.getElementById('lbl-level');
        this.valHp = document.getElementById('val-hp');
        this.hpBar = document.getElementById('hp-bar');
        this.valScore = document.getElementById('val-score');

        // Registrar instancia global
        window.gameEngine = this;
        this.setupKeyboardInput();
    }

    startGame(playerClass) {
        this.isActive = true;
        this.level = 1;
        this.score = 0;
        this.playerClass = playerClass;
        
        // Ajustar estadísticas según clase
        this.playerStats.maxHp = 100;
        if (playerClass === "Guerrero") {
            this.playerStats.hp = 120;
            this.playerStats.maxHp = 120;
            this.playerStats.attack = 18;
        } else if (playerClass === "Mago") {
            this.playerStats.hp = 80;
            this.playerStats.maxHp = 80;
            this.playerStats.attack = 22;
        } else { // Pícaro
            this.playerStats.hp = 100;
            this.playerStats.maxHp = 100;
            this.playerStats.attack = 15;
        }

        // Generar mapa del Nivel 1
        this.generateLevelMap();
        this.updateUI();
        window.web3Simulator.log("¡Partida activa! Explora la mazmorra usando W/A/S/D o Flechas.", "system");
    }

    stopGame() {
        this.isActive = false;
        this.screenEl.innerHTML = `
            <div class="start-screen-prompt" id="start-prompt">
                <p class="blink text-primary">RUN COMPLETADO O RETIRADO</p>
                <p class="subtext">Vuelve a iniciar un run para explorar una nueva mazmorra.</p>
                <div class="controls-guide">
                    <h3>CONTROLES</h3>
                    <p><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> o Flechas: Moverse</p>
                    <p><kbd>Espacio</kbd>: Interactuar</p>
                </div>
            </div>
        `;
    }

    // Generador de mapas
    generateLevelMap() {
        this.map = [];
        this.monsters = [];

        // Generación de un diseño clásico de mazmorra (2 habitaciones conectadas por un pasillo)
        for (let r = 0; r < this.rows; r++) {
            this.map[r] = [];
            for (let c = 0; c < this.cols; c++) {
                // Bordes externos como muros
                if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
                    this.map[r][c] = '#';
                } else {
                    this.map[r][c] = ' ';
                }
            }
        }

        // Diseñar Habitación 1 (Izquierda)
        const rm1 = { r1: 1, r2: 5, c1: 1, c2: 15 };
        this.drawRoom(rm1);

        // Diseñar Habitación 2 (Derecha)
        const rm2 = { r1: 5, r2: 9, c1: 18, c2: 33 };
        this.drawRoom(rm2);

        // Pasillo de conexión vertical/horizontal
        this.drawCorridor(3, 15, 3, 22);
        this.drawCorridor(3, 22, 6, 22);
        this.drawCorridor(6, 22, 6, 18);

        // Colocar Puertas
        this.map[3][15] = '+';
        this.map[6][18] = '+';

        // Posición inicial del jugador en Habitación 1
        this.playerStats.x = 4;
        this.playerStats.y = 3;

        // Escaleras al siguiente nivel en Habitación 2
        this.map[8][30] = '>';

        // Cofres
        this.map[2][12] = 'C';
        if (this.level > 1) {
            this.map[7][20] = 'C'; // Cofre extra en niveles avanzados
        }

        // Trampas ocultas (^)
        this.map[3][22] = '^'; 
        if (this.level > 1) {
            this.map[6][25] = '^';
        }

        // Enemigos
        if (this.level === 1) {
            // Un monstruo común en el pasillo y otro en la sala 2
            this.spawnMonster(3, 10, "M", 35, 10); // Tipo M, HP 35, daño 10
            this.spawnMonster(7, 26, "M", 35, 10);
        } else {
            // Nivel 2 o superior incluye un Troll (T) más fuerte
            this.spawnMonster(3, 10, "M", 35, 10);
            this.spawnMonster(7, 26, "T", 70, 18); // Tipo T (Troll), HP 70, daño 18
        }
    }

    drawRoom(rm) {
        for (let r = rm.r1; r <= rm.r2; r++) {
            for (let c = rm.c1; c <= rm.c2; c++) {
                this.map[r][c] = '.';
            }
        }
        // Colocar muros en los bordes de la habitación (si no hay bordes externos de mapa)
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

    // Renderizar a texto HTML coloreado
    renderMap() {
        let asciiHTML = '<div class="ascii-grid">';
        
        for (let r = 0; r < this.rows; r++) {
            let rowHTML = '';
            for (let c = 0; c < this.cols; c++) {
                // Verificar si hay jugador
                if (r === this.playerStats.y && c === this.playerStats.x) {
                    rowHTML += '<span class="tile-player">@</span>';
                    continue;
                }

                // Verificar si hay monstruos
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
                    case '^': spanClass = 'tile-floor'; break; // Trampas ocultas se ven como suelo
                    default: spanClass = 'tile-floor';
                }

                // Si la trampa fue activada, la mostramos
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
        // En este prototipo rápido, las trampas activadas se descubren permanentemente
        return this.map[r][c] === 'X'; // Marcamos trampa pisada con 'X'
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
                case ' ': // Espacio para saltar turno
                    this.processTurn();
                    return;
                default:
                    return; // Ignorar otras teclas
            }

            e.preventDefault();
            this.tryMove(dx, dy);
        });
    }

    tryMove(dx, dy) {
        const nextX = this.playerStats.x + dx;
        const nextY = this.playerStats.y + dy;

        // Comprobar colisión de mapa
        const char = this.map[nextY][nextX];
        if (char === '#') {
            return; // Bloqueado por muro
        }

        // Comprobar colisión con monstruos
        const monsterIndex = this.monsters.findIndex(m => m.r === nextY && m.c === nextX);
        if (monsterIndex !== -1) {
            this.fight(monsterIndex);
            this.processTurn();
            return;
        }

        // Mover jugador
        this.playerStats.x = nextX;
        this.playerStats.y = nextY;

        // Registrar movimiento en el log simulado de la blockchain
        window.web3Simulator.registerMoveTransaction(nextX, nextY);

        // Procesar interacciones con casillas
        if (char === 'C') {
            this.score += 50;
            this.map[nextY][nextX] = '.'; // Remover cofre del mapa
            this.renderMap();
            window.web3Simulator.log("¡Has abierto un cofre de oro!", "event");
            window.web3Simulator.openChestTransaction();
        } else if (char === '^') {
            // Activar trampa
            const trapDamage = 15;
            this.playerStats.hp = Math.max(0, this.playerStats.hp - trapDamage);
            this.map[nextY][nextX] = 'X'; // Revelar trampa pisada
            window.web3Simulator.log(`¡Alerta! Activaste una trampa de flechas. Perdiste ${trapDamage} HP.`, "alert");
            this.checkPlayerDeath();
        } else if (char === '>') {
            // Descender de nivel
            this.level++;
            this.score += 200;
            window.web3Simulator.descendLevelTransaction(this.level);
            window.web3Simulator.log(`Descendiendo al Nivel ${this.level} de la mazmorra...`, "system");
            this.generateLevelMap();
        }

        this.processTurn();
    }

    fight(monsterIndex) {
        const m = this.monsters[monsterIndex];
        
        // El jugador ataca
        m.hp -= this.playerStats.attack;
        window.web3Simulator.log(`Atacas al ${m.type === 'T' ? 'Troll' : 'Monstruo'} por ${this.playerStats.attack} de daño.`, "system");

        if (m.hp <= 0) {
            window.web3Simulator.log(`¡Has derrotado al ${m.type === 'T' ? 'Troll' : 'Monstruo'}!`, "event");
            this.score += m.type === 'T' ? 150 : 80;
            this.monsters.splice(monsterIndex, 1);
            window.web3Simulator.resolveCombatTransaction(m.type === 'T' ? 'Troll' : 'Monstruo', true, 0);
        } else {
            // Contraataque inmediato del monstruo
            const mDamage = m.attack;
            this.playerStats.hp = Math.max(0, this.playerStats.hp - mDamage);
            window.web3Simulator.log(`El ${m.type === 'T' ? 'Troll' : 'Monstruo'} contraataca y te inflige ${mDamage} de daño.`, "alert");
            window.web3Simulator.resolveCombatTransaction(m.type === 'T' ? 'Troll' : 'Monstruo', false, mDamage);
            this.checkPlayerDeath();
        }
    }

    processTurn() {
        if (!this.isActive) return;

        // IA Básica de monstruos (se mueven 1 paso hacia el jugador si están a una distancia menor de 6 casillas)
        this.monsters.forEach((m, idx) => {
            const dist = Math.abs(m.r - this.playerStats.y) + Math.abs(m.c - this.playerStats.x);
            if (dist < 6 && dist > 1) {
                // Determinar dirección de movimiento hacia el jugador
                let dr = 0;
                let dc = 0;

                if (m.r < this.playerStats.y) dr = 1;
                else if (m.r > this.playerStats.y) dr = -1;
                
                if (m.c < this.playerStats.x) dc = 1;
                else if (m.c > this.playerStats.x) dc = -1;

                // Intentar moverse preferentemente en diagonal o elegir la mejor arista libre
                const nextR = m.r + dr;
                const nextC = m.c + dc;

                if (this.map[nextR][nextC] !== '#' && this.map[nextR][nextC] !== '>' && this.map[nextR][nextC] !== '+' &&
                    !this.monsters.some(other => other !== m && other.r === nextR && other.c === nextC)) {
                    m.r = nextR;
                    m.c = nextC;
                }
            } else if (dist === 1) {
                // Si está adyacente, ataca al jugador en su propio turno
                const mDamage = m.attack;
                this.playerStats.hp = Math.max(0, this.playerStats.hp - mDamage);
                window.web3Simulator.log(`El ${m.type === 'T' ? 'Troll' : 'Monstruo'} te ataca por ${mDamage} de daño en su turno.`, "alert");
                window.web3Simulator.resolveCombatTransaction(m.type === 'T' ? 'Troll' : 'Monstruo', false, mDamage);
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
        this.valHp.textContent = `${this.playerStats.hp}/${this.playerStats.maxHp}`;
        
        const hpPercent = (this.playerStats.hp / this.playerStats.maxHp) * 100;
        this.hpBar.style.width = `${hpPercent}%`;

        this.renderMap();
    }
}

// Inicializar motor de juego
new GameEngine();
