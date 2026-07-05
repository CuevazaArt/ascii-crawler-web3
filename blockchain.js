/**
 * Web3 Ledger and Crypto Transaction Simulator (blockchain.js)
 * Realistically simulates smart contract events, Session Keys signatures,
 * L2 gas fee reductions, ZK-Proof generation, and NFT minting/burning on-chain.
 */

class Web3Simulator {
    constructor() {
        this.isConnected = false;
        this.walletAddress = null;
        this.rougeBalance = 0;
        this.activeHeroId = null;
        this.activeHeroClass = null;
        this.hasSessionKeys = false;
        this.inventory = []; // Contains ERC-1155 equipment IDs
        this.gameActive = false;
        this.blockNumber = 12053420;

        // DOM Elements
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

    // Register logs in the scrolling terminal list
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

    // Increment block and generate mock tx hash
    getNewTxHash() {
        this.blockNumber++;
        const characters = 'abcdef0123456789';
        let hash = '0x';
        for (let i = 0; i < 64; i++) {
            hash += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return { hash, block: this.blockNumber };
    }

    // Connect wallet simulation
    connectWallet() {
        if (this.isConnected) return;
        if (window.retroAudio) window.retroAudio.playClick();
        
        this.log("Connecting wallet (MetaMask/Rabby)...");
        this.btnConnect.disabled = true;

        setTimeout(() => {
            this.isConnected = true;
            this.walletAddress = "0x71C...39B" + Math.floor(Math.random()*90 + 10);
            this.rougeBalance = 50.00; // Initial demo funds
            this.activeHeroId = "#" + (Math.floor(Math.random()*8000) + 1000);
            const classes = ["Rogue", "Warrior", "Mage"];
            this.activeHeroClass = classes[Math.floor(Math.random() * classes.length)];
            
            // Update UI
            this.indicatorEl.className = "status-indicator connected";
            this.walletAddressEl.textContent = this.walletAddress;
            this.btnConnect.innerHTML = "<i class='fa-solid fa-plug'></i> Wallet Connected";
            this.btnConnect.classList.replace('btn-primary', 'btn-danger');
            this.btnConnect.style.opacity = "0.75";
            
            this.valRougeBalance.textContent = this.rougeBalance.toFixed(2);
            this.valHeroNft.textContent = this.activeHeroId;
            this.valHeroClass.textContent = this.activeHeroClass;
            
            this.btnStartRun.disabled = false;
            this.btnSessionKeys.disabled = false;

            this.log(`Wallet successfully connected: ${this.walletAddress}`, 'system');
            this.log(`Token balance: 50.00 $ROUGE`, 'system');
            this.log(`Hero ERC-721 detected: ${this.activeHeroClass} ${this.activeHeroId}`, 'event');
            
            // Query existing equipment items
            this.log("Querying player's ERC-1155 equipment...", 'system');
            setTimeout(() => {
                this.inventory = [1]; // Start with a rusty sword
                this.updateInventoryUI();
                this.log("Equipment loaded: [Rusty Sword ERC-1155]", 'event');
            }, 600);
        }, 1000);
    }

    // Toggle Session Keys (Account Abstraction ERC-4337)
    toggleSessionKeys() {
        if (!this.isConnected) return;
        if (window.retroAudio) window.retroAudio.playClick();
        
        if (this.hasSessionKeys) {
            this.hasSessionKeys = false;
            this.sessionKeyBadge.className = "session-keys-status";
            this.sessionKeyBadge.innerHTML = "<i class='fa-solid fa-shield-halved'></i> Session Keys Inactive";
            this.btnSessionKeys.innerHTML = "<i class='fa-solid fa-key'></i> Enable Session Keys";
            this.log("Temporal Session Keys destroyed from local storage.", 'alert');
        } else {
            this.log("Creating temporal Session Key in browser...");
            this.btnSessionKeys.disabled = true;

            setTimeout(() => {
                this.hasSessionKeys = true;
                this.sessionKeyBadge.className = "session-keys-status active";
                this.sessionKeyBadge.innerHTML = "<i class='fa-solid fa-shield'></i> Session Keys Active";
                this.btnSessionKeys.innerHTML = "<i class='fa-solid fa-key'></i> Disable Session Keys";
                this.btnSessionKeys.disabled = false;

                const { hash, block } = this.getNewTxHash();
                this.log(`Session key authorized in block #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
                this.log("Game will sign movement and combat transactions automatically without popups.", 'zk');
            }, 1000);
        }
    }

    // Start Run transaction
    startRunTransaction() {
        if (!this.isConnected || this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playClick();
        if (this.rougeBalance < 10) {
            this.log("Error: Insufficient balance. You need 10 $ROUGE.", 'alert');
            return;
        }

        this.log("Starting Run. Approving 10 $ROUGE fee in contract...", 'system');
        this.btnStartRun.disabled = true;

        const executeRun = () => {
            this.rougeBalance -= 10;
            this.valRougeBalance.textContent = this.rougeBalance.toFixed(2);
            
            const { hash, block } = this.getNewTxHash();
            this.log(`Smart contract call startRun(${this.activeHeroId}) successful in block #${block}. Tx: ${hash.slice(0, 16)}...`, 'tx');
            
            // Chainlink VRF Seed Simulation
            this.log("Requesting entropy from Chainlink VRF for procedural map...", 'system');
            setTimeout(() => {
                const seed = "0x" + Math.floor(Math.random() * 1000000).toString(16) + "e4c23f";
                this.log(`VRF Event: Seed successfully generated -> Seed: ${seed.slice(0, 14)}...`, 'event');
                
                // Activate Game state
                this.gameActive = true;
                this.btnClaimExit.disabled = false;
                this.btnStartRun.disabled = true;
                
                // Initialize game engine
                if (window.gameEngine) {
                    window.gameEngine.startGame(this.activeHeroClass);
                }
            }, 800);
        };

        if (this.hasSessionKeys) {
            executeRun();
        } else {
            this.log("Approving transaction in wallet (MetaMask Popup)...", 'system');
            setTimeout(() => {
                executeRun();
            }, 1500);
        }
    }

    // Move transaction simulation (ZK-Proof)
    registerMoveTransaction(x, y) {
        if (!this.gameActive) return;
        
        // ZK-Proof calculation locally
        this.log(`Generating ZK-Proof for movement to coordinates [${x}, ${y}]...`, 'zk');
        
        const executeMove = () => {
            const { hash, block } = this.getNewTxHash();
            const gasFeeSaved = (Math.random() * 0.05 + 0.02).toFixed(4);
            this.log(`ZK-Proof verified on-chain in block #${block}. Gas: 0.0001 ETH (L2 savings: ${gasFeeSaved} ETH) Tx: ${hash.slice(0,10)}...`, 'tx');
        };

        if (this.hasSessionKeys) {
            executeMove();
        } else {
            // Batch movements simulation to prevent UI popup fatigue
            if (Math.random() > 0.6) {
                this.log("Notice: Confirming batch of moves in wallet (Missing Session Keys)...", 'alert');
                setTimeout(() => {
                    executeMove();
                }, 800);
            }
        }
    }

    // Open Chest transaction
    openChestTransaction() {
        if (!this.gameActive) return;
        
        this.log("Chest found. Generating ZK-Proof for chest location...", 'zk');
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.rougeBalance += 5.00;
            this.valRougeBalance.textContent = this.rougeBalance.toFixed(2);
            
            this.log(`Contract called openChest() in block #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
            this.log(`LootAcquired Event: +5.00 $ROUGE transferred to your wallet.`, 'event');
        }, 600);
    }

    // Combat resolution
    resolveCombatTransaction(monsterType, isVictory, damageReceived) {
        if (!this.gameActive) return;
        
        this.log(`Combat against ${monsterType}. Calculating ZK-Proof for combat resolution...`, 'zk');
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            if (isVictory) {
                this.rougeBalance += 2.00;
                this.valRougeBalance.textContent = this.rougeBalance.toFixed(2);
                this.log(`Contract called resolveCombat(defeated=true) in block #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
                this.log(`MonsterDefeated Event: +2.00 $ROUGE awarded.`, 'event');
            } else {
                this.log(`Contract called resolveCombat(defeated=false, damage=${damageReceived}) in block #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
            }
        }, 500);
    }

    // Descend levels
    descendLevelTransaction(nextLevel) {
        if (!this.gameActive) return;

        this.log("Crossing stairs portal. Generating ZK-Proof for portal...", 'zk');

        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.log(`Contract called descendLevel(nextLevel=${nextLevel}) in block #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
            this.log(`LevelCompleted Event: Floor ${nextLevel - 1} completed.`, 'event');
        }, 700);
    }

    // Claim and exit transaction
    claimAndExitTransaction() {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playClick();
        
        this.log("Starting run claim and safe exit...", 'system');
        this.btnClaimExit.disabled = true;

        const executeExit = () => {
            const { hash, block } = this.getNewTxHash();
            
            // Reward equipment NFT
            const gotItem = Math.random() > 0.5;
            if (gotItem) {
                const itemIds = [2, 3]; // 2: Steel Shield, 3: Ring of Power
                const rolled = itemIds[Math.floor(Math.random() * itemIds.length)];
                this.inventory.push(rolled);
                this.updateInventoryUI();
                this.log(`Minted new Equipment NFT (ERC-1155) ID: ${rolled} to your wallet.`, 'event');
            }

            this.log(`Contract called claimRunAndExit() successful in block #${block}. Tx: ${hash.slice(0, 16)}...`, 'tx');
            this.log("GameOver Event: Hero successfully escaped the dungeon.", 'event');

            this.resetGameState();
        };

        if (this.hasSessionKeys) {
            executeExit();
        } else {
            this.log("Approving transaction in wallet...", 'system');
            setTimeout(() => {
                executeExit();
            }, 1200);
        }
    }

    // Permadeath triggers
    triggerPermadeath() {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playGameOver();
        
        this.log(`Alert! Your health reached 0. Initiating death protocol in contract...`, 'alert');
        this.gameActive = false;
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.log(`Contract executed handlePlayerDeath(). NFT burn ${this.activeHeroId}. Tx: ${hash.slice(0, 16)}...`, 'tx');
            this.log(`Hero NFT ${this.activeHeroId} has been burned from the blockchain!`, 'alert');
            
            // Trigger modal UI overlay
            const modal = document.getElementById('gameover-modal');
            document.getElementById('lbl-burned-hero').textContent = `${this.activeHeroClass} ${this.activeHeroId}`;
            document.getElementById('lbl-final-score').textContent = document.getElementById('val-score').textContent;
            document.getElementById('lbl-final-level').textContent = document.getElementById('lbl-level').textContent;
            
            modal.style.display = 'flex';
            
            this.resetGameState();
            this.activeHeroId = "Burned 💀";
            this.activeHeroClass = "-";
            this.valHeroNft.textContent = this.activeHeroId;
            this.valHeroNft.className = "stat-value text-danger";
            this.valHeroClass.textContent = this.activeHeroClass;
            
            this.btnStartRun.disabled = true;
            this.btnStartRun.innerHTML = "<i class='fa-solid fa-skull'></i> Hero Burned";
            this.btnStartRun.className = "btn btn-danger";

            // Click listener for closing modal and resetting wallet connection
            document.getElementById('btn-close-gameover').onclick = () => {
                modal.style.display = 'none';
                this.btnConnect.innerHTML = "<i class='fa-solid fa-wallet'></i> Buy New Hero";
                this.btnConnect.classList.replace('btn-danger', 'btn-primary');
                this.btnConnect.style.opacity = "1";
                this.btnConnect.disabled = false;
                this.isConnected = false;
                this.walletAddressEl.textContent = "Wallet Disconnected";
                document.querySelector('.status-indicator').className = "status-indicator disconnected";
                this.btnStartRun.innerHTML = "<i class='fa-solid fa-play'></i> Start Run (10 $ROUGE)";
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

    // Update equipment slots UI
    updateInventoryUI() {
        const slotsEl = document.getElementById('inventory-slots');
        slotsEl.innerHTML = '';
        
        const itemsInfo = {
            1: { name: "Rusty Sword", icon: "fa-sword", class: "equipped" },
            2: { name: "Steel Shield", icon: "fa-shield", class: "equipped" },
            3: { name: "Ring of Power", icon: "fa-ring", class: "equipped" }
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

// Initial simulator setup
window.web3Simulator = new Web3Simulator();
