/**
 * Web3 Ledger and Pacman Game Transaction Simulator (blockchain.js)
 * Simulates on-chain coin insertions, ZK-proof dot-eating rewards in ETH,
 * ERC-1155 collectible mints, and character NFT burn on permadeath.
 */

class Web3Simulator {
    constructor() {
        this.isConnected = false;
        this.walletAddress = null;
        this.ethBalance = 0.0000;
        this.activeHeroId = null;
        this.activeHeroSkin = "Classic Yellow";
        this.hasSessionKeys = false;
        this.inventory = []; // Contains ERC-1155 collectible IDs
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
        
        this.valEthBalance = document.getElementById('val-rouge-balance');
        this.valHeroNft = document.getElementById('val-hero-nft');
        this.valHeroClass = document.getElementById('val-hero-class');
        this.sessionKeyBadge = document.getElementById('session-key-badge');

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.btnConnect.addEventListener('click', () => this.connectWallet());
        this.btnSessionKeys.addEventListener('click', () => this.toggleSessionKeys());
        this.btnStartRun.addEventListener('click', () => this.insertCoinTransaction());
        this.btnClaimExit.addEventListener('click', () => this.cashOutTransaction());
    }

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

    getNewTxHash() {
        this.blockNumber++;
        const characters = 'abcdef0123456789';
        let hash = '0x';
        for (let i = 0; i < 64; i++) {
            hash += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return { hash, block: this.blockNumber };
    }

    connectWallet() {
        if (this.isConnected) return;
        if (window.retroAudio) window.retroAudio.playClick();
        
        this.log("Connecting wallet via WalletConnect...");
        this.btnConnect.disabled = true;

        setTimeout(() => {
            this.isConnected = true;
            this.walletAddress = "0x89A...c1" + Math.floor(Math.random()*90 + 10);
            this.ethBalance = 0.0524; // Initial native balance
            this.activeHeroId = "#" + (Math.floor(Math.random()*900) + 100);
            
            // Update UI
            if (this.indicatorEl) this.indicatorEl.className = "status-indicator connected";
            if (this.walletAddressEl) this.walletAddressEl.textContent = this.walletAddress;
            if (this.btnConnect) {
                this.btnConnect.innerHTML = "<i class='fa-solid fa-plug'></i> Wallet Connected";
                this.btnConnect.classList.replace('btn-primary', 'btn-danger');
                this.btnConnect.style.opacity = "0.75";
            }
            
            if (this.valEthBalance) this.valEthBalance.textContent = this.ethBalance.toFixed(6);
            if (this.valHeroNft) this.valHeroNft.textContent = this.activeHeroId;
            if (this.valHeroClass) this.valHeroClass.textContent = this.activeHeroSkin;
            
            this.btnStartRun.disabled = false;
            this.btnSessionKeys.disabled = false;

            this.log(`Wallet connected: ${this.walletAddress}`, 'system');
            this.log(`Balance: ${this.ethBalance.toFixed(6)} ETH`, 'system');
            this.log(`Pacman NFT detected: Token ID ${this.activeHeroId}`, 'event');
            
            this.log("Querying player collectibles inventory (ERC-1155)...", 'system');
            setTimeout(() => {
                this.inventory = [];
                this.updateInventoryUI();
            }, 600);
        }, 1000);
    }

    toggleSessionKeys() {
        if (!this.isConnected) return;
        if (window.retroAudio) window.retroAudio.playClick();
        
        if (this.hasSessionKeys) {
            this.hasSessionKeys = false;
            if (this.sessionKeyBadge) {
                this.sessionKeyBadge.className = "session-keys-status-compact";
                this.sessionKeyBadge.innerHTML = "<i class='fa-solid fa-shield-halved'></i> Keys Inactive";
            }
            if (this.btnSessionKeys) this.btnSessionKeys.innerHTML = "<i class='fa-solid fa-key'></i> Enable Session Keys";
            this.log("Session Keys cleared from local keystore.", 'alert');
        } else {
            this.log("Authorizing transient Session Key for grid actions...");
            if (this.btnSessionKeys) this.btnSessionKeys.disabled = true;

            setTimeout(() => {
                this.hasSessionKeys = true;
                if (this.sessionKeyBadge) {
                    this.sessionKeyBadge.className = "session-keys-status-compact active";
                    this.sessionKeyBadge.innerHTML = "<i class='fa-solid fa-shield'></i> Keys Active";
                }
                if (this.btnSessionKeys) {
                    this.btnSessionKeys.innerHTML = "<i class='fa-solid fa-key'></i> Disable Session Keys";
                    this.btnSessionKeys.disabled = false;
                }

                const { hash, block } = this.getNewTxHash();
                this.log(`Session key registered on-chain in block #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
                this.log("Optimistic local movements will verify in background without confirmation prompts.", 'zk');
            }, 1000);
        }
    }

    insertCoinTransaction() {
        if (!this.isConnected || this.gameActive) return;
        if (this.ethBalance < 0.00015) {
            this.log("Error: Insufficient balance. Needs exactly 0.00015 ETH to start.", 'alert');
            return;
        }
        if (window.retroAudio) window.retroAudio.playClick();

        this.log("Inserting coin. Sending 0.00015 ETH to PacmanGame.sol...", 'system');
        this.btnStartRun.disabled = true;

        const executeRun = () => {
            this.ethBalance -= 0.00015;
            this.valEthBalance.textContent = this.ethBalance.toFixed(6);
            
            const { hash, block } = this.getNewTxHash();
            this.log(`Tx Successful. Method: insertCoin(heroTokenId=${this.activeHeroId}) in block #${block}. Tx: ${hash.slice(0, 16)}...`, 'tx');
            
            this.log("Requesting seed from Chainlink VRF for ghost seed...", 'system');
            setTimeout(() => {
                const seed = "0x" + Math.floor(Math.random() * 1000000).toString(16) + "fa290e";
                this.log(`VRF Seed received: ${seed.slice(0, 14)}...`, 'event');
                
                this.gameActive = true;
                this.btnClaimExit.disabled = false;
                this.btnStartRun.disabled = true;
                
                if (window.gameEngine) {
                    window.gameEngine.startGame(this.activeHeroSkin);
                }
            }, 800);
        };

        if (this.hasSessionKeys) {
            executeRun();
        } else {
            this.log("Awaiting wallet confirmation popup...", 'system');
            setTimeout(() => {
                executeRun();
            }, 1200);
        }
    }

    registerMoveAndEatTransaction(x, y, ateDot) {
        if (!this.gameActive) return;
        
        // ZK-Proof proving coordinates valid on grid
        this.log(`Generating ZK-Proof for location [${x}, ${y}]${ateDot ? ' & dot eaten' : ''}...`, 'zk');
        
        const executeMove = () => {
            const { hash, block } = this.getNewTxHash();
            if (ateDot) {
                this.ethBalance += 0.000001; // Reward transfer
                this.valEthBalance.textContent = this.ethBalance.toFixed(6);
                this.log(`DotEaten Tx confirmed in block #${block}. Pacman reward: +0.000001 ETH. Tx: ${hash.slice(0, 12)}...`, 'tx');
            } else {
                const gasSaved = (Math.random() * 0.00005 + 0.00001).toFixed(6);
                this.log(`Path verified in block #${block}. Gas: 0.000002 ETH (Sponsor saved: ${gasSaved} ETH)`, 'tx');
            }
        };

        if (this.hasSessionKeys) {
            executeMove();
        } else {
            // Batch movements locally if no session keys enabled
            if (Math.random() > 0.7) {
                this.log("Notice: Processing cached ZK-movement validations batch...", 'alert');
                setTimeout(() => {
                    executeMove();
                }, 600);
            }
        }
    }

    eatGhostTransaction(ghostId) {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playEatGhost();
        
        this.log(`Ghost ${ghostId} eaten. Generating ZK-Proof of ghost defeat state...`, 'zk');
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.ethBalance += 0.00002;
            this.valEthBalance.textContent = this.ethBalance.toFixed(6);
            this.log(`EatGhost Tx confirmed in block #${block}. Ghost bonus: +0.00002 ETH. Tx: ${hash.slice(0, 14)}...`, 'tx');
            this.log(`Event GhostEaten: Player claimed reward for defeating Ghost #${ghostId}`, 'event');
        }, 500);
    }

    loseLifeTransaction(remainingLives) {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playDeath();

        this.log(`Pacman lost a life. Remaining: ${remainingLives}. Submitting state update...`, 'alert');
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.log(`State update loseLife() verified in block #${block}. Tx: ${hash.slice(0, 14)}...`, 'tx');
        }, 800);
    }

    cashOutTransaction() {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playClick();
        
        this.log("Cashing out and leaving stage safely...", 'system');
        this.btnClaimExit.disabled = true;

        const executeExit = () => {
            const { hash, block } = this.getNewTxHash();
            
            // Mint cherry collectible NFT if score high enough
            const score = window.gameEngine ? window.gameEngine.score : 0;
            if (score >= 1000) {
                this.inventory.push(1); // ID 1: Cherry
                this.updateInventoryUI();
                this.log(`Acuñado nuevo Coleccionable Fruta NFT (ERC-1155) ID: 1 en tu billetera.`, 'event');
            }

            this.log(`Contract called cashOutAndExit() successful in block #${block}. Tx: ${hash.slice(0, 16)}...`, 'tx');
            this.log("GameOver Event: Run finalized safely, earnings locked in wallet.", 'event');

            this.resetGameState();
        };

        if (this.hasSessionKeys) {
            executeExit();
        } else {
            this.log("Awaiting wallet approval...", 'system');
            setTimeout(() => {
                executeExit();
            }, 1200);
        }
    }

    triggerPermadeath() {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playGameOver();
        
        this.log(`GAME OVER: Lives 0. Commencing Permadeath sequence in smart contract...`, 'alert');
        this.gameActive = false;
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.log(`Contract executed handlePermadeath(). Burn of Pacman NFT ${this.activeHeroId}. Tx: ${hash.slice(0, 16)}...`, 'tx');
            this.log(`Hero NFT ${this.activeHeroId} has been permanently BURNED (deleted) on-chain!`, 'alert');
            
            // Show Game Over modal
            const modal = document.getElementById('gameover-modal');
            document.getElementById('lbl-burned-hero').textContent = `Pacman ${this.activeHeroId}`;
            document.getElementById('lbl-final-score').textContent = document.getElementById('val-score').textContent;
            document.getElementById('lbl-final-level').textContent = document.getElementById('val-dots').textContent;
            
            modal.style.display = 'flex';
            
            this.resetGameState();
            this.activeHeroId = "Burned 💀";
            this.activeHeroSkin = "-";
            this.valHeroNft.textContent = this.activeHeroId;
            this.valHeroNft.className = "stat-value text-danger";
            this.valHeroClass.textContent = this.activeHeroSkin;
            
            this.btnStartRun.disabled = true;
            this.btnStartRun.innerHTML = "<i class='fa-solid fa-skull'></i> Pacman Burned";
            this.btnStartRun.className = "btn btn-danger";

            // Click listener for closing modal and resetting wallet connection
            document.getElementById('btn-close-gameover').onclick = () => {
                modal.style.display = 'none';
                this.btnConnect.innerHTML = "<i class='fa-solid fa-wallet'></i> Buy New Pacman";
                this.btnConnect.classList.replace('btn-danger', 'btn-primary');
                this.btnConnect.style.opacity = "1";
                this.btnConnect.disabled = false;
                this.isConnected = false;
                this.walletAddressEl.textContent = "Wallet Disconnected";
                document.querySelector('.status-indicator').className = "status-indicator disconnected";
                this.btnStartRun.innerHTML = "<i class='fa-solid fa-circle-dollar-to-slot'></i> Insert Coin (0.00015 ETH)";
                this.btnStartRun.className = "btn btn-success";
                this.btnStartRun.disabled = true;
                this.btnSessionKeys.disabled = true;
                this.valEthBalance.textContent = "0.0000";
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

    updateInventoryUI() {
        const slotsEl = document.getElementById('inventory-slots');
        slotsEl.innerHTML = '';
        
        const itemsInfo = {
            1: { name: "Cherry Collectible", icon: "fa-apple-whole", class: "equipped" },
            2: { name: "Strawberry Collectible", icon: "fa-lemon", class: "equipped" },
            3: { name: "Melon Collectible", icon: "fa-carrot", class: "equipped" }
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
                const icons = ["fa-apple-whole", "fa-lemon", "fa-carrot"];
                slot.innerHTML = `<i class="fa-solid ${icons[i]}"></i>`;
            }
            slotsEl.appendChild(slot);
        }
    }
}

window.web3Simulator = new Web3Simulator();
