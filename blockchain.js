/**
 * Web3 Ledger and Crypto Transaction Simulator (blockchain.js)
 * Simula de forma realista los eventos de contratos inteligentes, firmas con Session Keys,
 * costos de gas reducidos por L2, generación de ZK-Proofs y acuñado/quema de NFTs en la blockchain.
 */

class Web3Simulator {
    constructor() {
        this.isConnected = false;
        this.walletAddress = null;
        this.rougeBalance = 0;
        this.activeHeroId = null;
        this.activeHeroClass = null;
        this.hasSessionKeys = false;
        this.inventory = []; // Contiene los IDs de equipamiento ERC-1155
        this.gameActive = false;
        this.blockNumber = 12053420;

        // Elementos DOM
        this.walletInfo = document.getElementById('wallet-info');
        this.walletAddressEl = document.querySelector('.wallet-address');
        this.indicatorEl = document.querySelector('.status-indicator');
        this.btnConnect = document.getElementById('btn-connect');
        this.btnStartRun = document.getElementById('btn-start-run');
        this.btnClaimExit = document.getElementById('btn-claim-exit');
        this.btnSessionKeys = document.getElementById('btn-session-keys');
        this.logsContainer = document.getElementById('logs-container');
        
        this.valRougeBalance = document.getElementById('val-rouge-balance');
        this.valHeroNft = document.getElementById('val-hero-nft');
        this.valHeroClass = document.getElementById('val-hero-class');
        this.sessionKeyBadge = document.getElementById('session-key-badge');

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.btnConnect.addEventListener('click', () => this.connectWallet());
        this.btnSessionKeys.addEventListener('click', () => this.toggleSessionKeys());
        this.btnStartRun.addEventListener('click', () => this.startRunTransaction());
        this.btnClaimExit.addEventListener('click', () => this.claimAndExitTransaction());
    }

    // Registrar logs en la interfaz tipo terminal
    log(message, type = 'system') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        
        let prefix = "";
        if (type === 'tx') prefix = "<i class='fa-solid fa-cube'></i> [Tx] ";
        else if (type === 'zk') prefix = "<i class='fa-solid fa-fingerprint'></i> [ZK] ";
        else if (type === 'event') prefix = "<i class='fa-solid fa-circle-check'></i> [Event] ";
        else if (type === 'alert') prefix = "<i class='fa-solid fa-triangle-exclamation'></i> [Alert] ";
        
        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `<span style="color: #666">[${timestamp}]</span> ${prefix}${message}`;
        this.logsContainer.appendChild(entry);
        this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    }

    // Incrementar bloque y generar hash ficticio
    getNewTxHash() {
        this.blockNumber++;
        const characters = 'abcdef0123456789';
        let hash = '0x';
        for (let i = 0; i < 64; i++) {
            hash += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return { hash, block: this.blockNumber };
    }

    // Conectar billetera
    connectWallet() {
        if (this.isConnected) return;
        
        this.log("Conectando billetera (MetaMask/Rabby)...");
        this.btnConnect.disabled = true;

        setTimeout(() => {
            this.isConnected = true;
            this.walletAddress = "0x71C...39B" + Math.floor(Math.random()*90 + 10);
            this.rougeBalance = 50.00; // Fondos iniciales demo
            this.activeHeroId = "#" + (Math.floor(Math.random()*8000) + 1000);
            const classes = ["Pícaro", "Guerrero", "Mago"];
            this.activeHeroClass = classes[Math.floor(Math.random() * classes.length)];
            
            // Actualizar interfaz
            this.indicatorEl.className = "status-indicator connected";
            this.walletAddressEl.textContent = this.walletAddress;
            this.btnConnect.innerHTML = "<i class='fa-solid fa-plug'></i> Wallet Conectada";
            this.btnConnect.classList.replace('btn-primary', 'btn-danger');
            this.btnConnect.style.opacity = "0.75";
            
            this.valRougeBalance.textContent = this.rougeBalance.toFixed(2);
            this.valHeroNft.textContent = this.activeHeroId;
            this.valHeroClass.textContent = this.activeHeroClass;
            
            this.btnStartRun.disabled = false;
            this.btnSessionKeys.disabled = false;

            this.log(`Wallet conectada con éxito: ${this.walletAddress}`, 'system');
            this.log(`Balance de tokens: 50.00 $ROUGE`, 'system');
            this.log(`Héroe ERC-721 detectado: ${this.activeHeroClass} ${this.activeHeroId}`, 'event');
            
            // Simular carga de equipamiento existente
            this.log("Consultando equipamiento ERC-1155 del jugador...", 'system');
            setTimeout(() => {
                this.inventory = [1]; // Inicia con una espada oxidada
                this.updateInventoryUI();
                this.log("Equipamiento cargado: [Espada Oxidada ERC-1155]", 'event');
            }, 600);
        }, 1000);
    }

    // Activar Session Keys (Account Abstraction ERC-4337)
    toggleSessionKeys() {
        if (!this.isConnected) return;
        
        if (this.hasSessionKeys) {
            this.hasSessionKeys = false;
            this.sessionKeyBadge.className = "session-keys-status";
            this.sessionKeyBadge.innerHTML = "<i class='fa-solid fa-shield-halved'></i> Session Keys Inactivas";
            this.btnSessionKeys.innerHTML = "<i class='fa-solid fa-key'></i> Activar Session Keys";
            this.log("Claves de sesión temporales destruidas del almacenamiento local.", 'alert');
        } else {
            this.log("Creando Clave de Sesión temporal en navegador...");
            this.btnSessionKeys.disabled = true;

            setTimeout(() => {
                this.hasSessionKeys = true;
                this.sessionKeyBadge.className = "session-keys-status active";
                this.sessionKeyBadge.innerHTML = "<i class='fa-solid fa-shield'></i> Session Keys Activas";
                this.btnSessionKeys.innerHTML = "<i class='fa-solid fa-key'></i> Desactivar Session Keys";
                this.btnSessionKeys.disabled = false;

                const { hash, block } = this.getNewTxHash();
                this.log(`Clave de sesión autorizada en bloque #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
                this.log("El juego firmará transacciones de movimiento y combate automáticamente sin confirmaciones emergentes.", 'zk');
            }, 1000);
        }
    }

    // Iniciar Run
    startRunTransaction() {
        if (!this.isConnected || this.gameActive) return;
        if (this.rougeBalance < 10) {
            this.log("Error: Balance insuficiente. Necesitas 10 $ROUGE.", 'alert');
            return;
        }

        this.log("Iniciando Run. Aprobando tarifa de 10 $ROUGE en contrato...", 'system');
        this.btnStartRun.disabled = true;

        const executeRun = () => {
            this.rougeBalance -= 10;
            this.valRougeBalance.textContent = this.rougeBalance.toFixed(2);
            
            const { hash, block } = this.getNewTxHash();
            this.log(`Llamada smart contract startRun(${this.activeHeroId}) exitosa en bloque #${block}. Tx: ${hash.slice(0, 16)}...`, 'tx');
            
            // Simular Chainlink VRF Seed
            this.log("Solicitando entropía a Chainlink VRF para mapa procedural...", 'system');
            setTimeout(() => {
                const seed = "0x" + Math.floor(Math.random() * 1000000).toString(16) + "e4c23f";
                this.log(`Evento VRF: Semilla generada con éxito -> Seed: ${seed.slice(0, 14)}...`, 'event');
                
                // Activar Juego
                this.gameActive = true;
                this.btnClaimExit.disabled = false;
                this.btnStartRun.disabled = true;
                
                // Iniciar juego en game.js
                if (window.gameEngine) {
                    window.gameEngine.startGame(this.activeHeroClass);
                }
            }, 800);
        };

        if (this.hasSessionKeys) {
            // Sin Popup, inmediato
            executeRun();
        } else {
            // Simular popup de confirmación de MetaMask
            this.log("Aprobando transacción en billetera (MetaMask Popup)...", 'system');
            setTimeout(() => {
                executeRun();
            }, 1500);
        }
    }

    // Transacción al moverse (Genera prueba ZK)
    registerMoveTransaction(x, y) {
        if (!this.gameActive) return;
        
        // Simular cálculo de ZK-Proof localmente en la máquina del cliente
        // Esto valida que la ruta recorrida respeta la regla de que no hay muros
        this.log(`Generando ZK-Proof de movimiento hacia coordenadas [${x}, ${y}]...`, 'zk');
        
        const executeMove = () => {
            const { hash, block } = this.getNewTxHash();
            // Ahorro en L2
            const gasFeeSaved = (Math.random() * 0.05 + 0.02).toFixed(4);
            this.log(`ZK-Proof verificada on-chain en bloque #${block}. Gas: 0.0001 ETH (Ahorro L2: ${gasFeeSaved} ETH) Tx: ${hash.slice(0,10)}...`, 'tx');
        };

        if (this.hasSessionKeys) {
            executeMove();
        } else {
            // Si no tiene Session Keys, simulamos que el contrato se acumula en un estado local y se firma cada 3 turnos
            // para no saturar al usuario, demostrando por qué Session Keys es indispensable.
            if (Math.random() > 0.6) {
                this.log("Aviso: Confirmando lote de movimientos en billetera (Falta Session Keys)...", 'alert');
                setTimeout(() => {
                    executeMove();
                }, 800);
            }
        }
    }

    // Transacción al abrir cofre
    openChestTransaction() {
        if (!this.gameActive) return;
        
        this.log("Cofre descubierto. Generando ZK-Proof de ubicación de cofre...", 'zk');
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.rougeBalance += 5.00;
            this.valRougeBalance.textContent = this.rougeBalance.toFixed(2);
            
            this.log(`Contrato llamado openChest() en bloque #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
            this.log(`Evento LootAcquired: +5.00 $ROUGE transferidos a tu wallet.`, 'event');
        }, 600);
    }

    // Combate
    resolveCombatTransaction(monsterType, isVictory, damageReceived) {
        if (!this.gameActive) return;
        
        this.log(`Combate contra ${monsterType}. Calculando ZK-Proof de resolución de combate...`, 'zk');
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            if (isVictory) {
                this.rougeBalance += 2.00;
                this.valRougeBalance.textContent = this.rougeBalance.toFixed(2);
                this.log(`Contrato llamado resolveCombat(defeated=true) en bloque #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
                this.log(`Evento MonsterDefeated: +2.00 $ROUGE ganados.`, 'event');
            } else {
                this.log(`Contrato llamado resolveCombat(defeated=false, damage=${damageReceived}) en bloque #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
            }
        }, 500);
    }

    // Bajar nivel
    descendLevelTransaction(nextLevel) {
        if (!this.gameActive) return;

        this.log("Cruzas el portal de escaleras. Generando ZK-Proof del portal...", 'zk');

        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.log(`Contrato llamado descendLevel(nextLevel=${nextLevel}) en bloque #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
            this.log(`Evento LevelCompleted: Nivel ${nextLevel - 1} completado.`, 'event');
        }, 700);
    }

    // Retirarse y salvar héroe
    claimAndExitTransaction() {
        if (!this.gameActive) return;
        
        this.log("Iniciando reclamo de partida y retirada segura...", 'system');
        this.btnClaimExit.disabled = true;

        const executeExit = () => {
            const { hash, block } = this.getNewTxHash();
            
            // Simular acuñado de equipamiento NFT por llegar lejos
            const gotItem = Math.random() > 0.5;
            if (gotItem) {
                const itemIds = [2, 3]; // 2: Escudo de Acero, 3: Anillo de Poder
                const rolled = itemIds[Math.floor(Math.random() * itemIds.length)];
                this.inventory.push(rolled);
                this.updateInventoryUI();
                this.log(`Acuñado nuevo Equipamiento NFT (ERC-1155) ID: ${rolled} en tu billetera.`, 'event');
            }

            this.log(`Contrato llamado claimRunAndExit() exitoso en bloque #${block}. Tx: ${hash.slice(0, 16)}...`, 'tx');
            this.log("Evento GameOver: El héroe ha salido a salvo de la mazmorra.", 'event');

            this.resetGameState();
        };

        if (this.hasSessionKeys) {
            executeExit();
        } else {
            this.log("Aprobando transacción en billetera...", 'system');
            setTimeout(() => {
                executeExit();
            }, 1200);
        }
    }

    // Muerte permanente (Permadeath)
    triggerPermadeath() {
        if (!this.gameActive) return;
        
        this.log(`¡Alerta! Tu salud ha llegado a 0. Iniciando protocolo de muerte en contrato...`, 'alert');
        this.gameActive = false;
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.log(`Contrato ejecutó handlePlayerDeath(). Burn de NFT ${this.activeHeroId}. Tx: ${hash.slice(0, 16)}...`, 'tx');
            this.log(`¡Heroe NFT ${this.activeHeroId} ha sido quemado de la blockchain!`, 'alert');
            
            // Mostrar modal de Game Over
            const modal = document.getElementById('gameover-modal');
            document.getElementById('lbl-burned-hero').textContent = `${this.activeHeroClass} ${this.activeHeroId}`;
            document.getElementById('lbl-final-score').textContent = document.getElementById('val-score').textContent;
            document.getElementById('lbl-final-level').textContent = document.getElementById('lbl-level').textContent;
            
            modal.style.display = 'flex';
            
            // Reiniciar UI
            this.resetGameState();
            this.activeHeroId = "Quemado 💀";
            this.activeHeroClass = "-";
            this.valHeroNft.textContent = this.activeHeroId;
            this.valHeroNft.className = "stat-value text-danger";
            this.valHeroClass.textContent = this.activeHeroClass;
            
            // Desconectar / Deshabilitar run hasta adquirir nuevo héroe
            this.btnStartRun.disabled = true;
            this.btnStartRun.innerHTML = "<i class='fa-solid fa-skull'></i> Héroe Quemado";
            this.btnStartRun.className = "btn btn-danger";

            // Botón para cerrar modal
            document.getElementById('btn-close-gameover').onclick = () => {
                modal.style.display = 'none';
                this.btnConnect.innerHTML = "<i class='fa-solid fa-wallet'></i> Comprar Héroe Nuevo";
                this.btnConnect.classList.replace('btn-danger', 'btn-primary');
                this.btnConnect.style.opacity = "1";
                this.btnConnect.disabled = false;
                this.isConnected = false;
                this.walletAddressEl.textContent = "Wallet Desconectada";
                document.querySelector('.status-indicator').className = "status-indicator disconnected";
                this.btnStartRun.innerHTML = "<i class='fa-solid fa-play'></i> Iniciar Run (10 $ROUGE)";
                this.btnStartRun.className = "btn btn-success";
                this.btnStartRun.disabled = true;
                this.btnSessionKeys.disabled = true;
                this.valRougeBalance.textContent = "0.00";
            };
        }, 1000);
    }

    resetGameState() {
        this.gameActive = false;
        this.btnClaimExit.disabled = true;
        this.btnStartRun.disabled = false;
        
        if (window.gameEngine) {
            window.gameEngine.stopGame();
        }
    }

    // Actualizar ranuras de equipamiento en UI
    updateInventoryUI() {
        const slotsEl = document.getElementById('inventory-slots');
        slotsEl.innerHTML = '';
        
        const itemsInfo = {
            1: { name: "Espada Oxidada", icon: "fa-sword", class: "equipped" },
            2: { name: "Escudo de Acero", icon: "fa-shield", class: "equipped" },
            3: { name: "Anillo de Poder", icon: "fa-ring", class: "equipped" }
        };

        for (let i = 0; i < 3; i++) {
            const slot = document.createElement('div');
            const itemId = this.inventory[i];
            
            if (itemId && itemsInfo[itemId]) {
                const item = itemsInfo[itemId];
                slot.className = `slot ${item.class}`;
                slot.title = item.name;
                slot.innerHTML = `<i class="fa-solid ${item.icon}"></i>`;
            } else {
                slot.className = "slot empty";
                const icons = ["fa-sword", "fa-shield", "fa-ring"];
                slot.innerHTML = `<i class="fa-solid ${icons[i]}"></i>`;
            }
            slotsEl.appendChild(slot);
        }
    }
}

// Inicializar simulador
window.web3Simulator = new Web3Simulator();
