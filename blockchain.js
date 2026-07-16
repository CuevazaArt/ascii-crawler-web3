/**
 * XRPL Ledger Simulator for Leak Runner (blockchain.js)
 * Simulates Xaman wallet connect, XRP stake/consume/reward flows,
 * Payment Channels for drop micropayouts, and NFTokenBurn on slash.
 * Demo layer for XRPL Make Waves — not a live mainnet client yet.
 */

const XRPL = {
    ENTRY_STAKE: 0.5,        // XRP to boot a node run
    DROP_REWARD: 0.0005,     // accrued in-channel; settled at Claim/Exit
    EXPLOIT_SLASH: 0.01,
    SKIN_COST: 1,
    START_BALANCE: 12.5,
    SCORE_BOARD_MAX: 10,
    // Stake split — house edge via reserve (casa siempre gana un poco)
    STAKE_SPLIT: {
        earn: 0.70,       // reclaimable by skill this run
        jackpot: 0.08,    // epoch #1–#3 bag
        topN: 0.04,       // top-5 epoch bag
        milestones: 0.03, // first-to-hit hitos
        dev: 0.10,        // developer treasury
        reserve: 0.05     // house buffer / rare 1.1× boosts
    },
    // Skins & paid cosmetics → long-term prize fuel + ops
    SKIN_SPLIT: { jackpot: 0.40, milestones: 0.20, dev: 0.40 },
    EPOCH_MS: 24 * 60 * 60 * 1000,
    JACKPOT_SOFT_CAP: 40,
    MAX_RECLAIM_MULT: 1.1,   // rare ceiling vs stake (needs reserve)
    SCORE_HISTORY_MAX: 40
};

const SCORE_STORAGE_KEY = 'leakrunner_xrpl_scoreboard_v1';
const ECONOMY_STORAGE_KEY = 'leakrunner_xrpl_economy_v1';

class Web3Simulator {
    constructor() {
        this.isConnected = false;
        this.walletAddress = null;
        this.ethBalance = 0; // kept id name for DOM hook; stores XRP
        this.activeHeroId = null;
        this.activeHeroSkin = "Ledger Gold";
        this.hasSessionKeys = false; // Payment Channel open
        this.inventory = [];
        this.gameActive = false;
        this.ledgerIndex = 88421000;

        this.unlockedPalettes = {
            classic: true,
            green: false,
            pico: false
        };
        this.currentPalette = 'classic';
        this.isBypassMode = false;
        this._pendingMoves = 0;
        this.sessionXrpEarned = 0;
        this.sessionPendingEarn = 0; // channel accrual — settle at end
        this.sessionEarnEscrow = 0;  // 70% of this run's stake
        this.personalBest = 0;
        this.scoreboard = this.loadScoreboard();
        this.economy = this.loadEconomy();
        this._bannerTimer = null;
        this._bannerIndex = 0;
        this._attractTimer = null;
        this._attractVisible = false;
        this._attractIdleMs = 12000;
        this._attractShowMs = 7000;

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
        this.valBestScore = document.getElementById('val-best-score');
        this.leaderboardEl = document.getElementById('score-leaderboard');
        this.sessionKeyBadge = document.getElementById('session-key-badge');
        
        this.chkBypass = document.getElementById('chk-bypass-web3');
        this.btnPaletteClassic = document.getElementById('btn-palette-classic');
        this.btnPaletteGreen = document.getElementById('btn-palette-green');
        this.btnPalettePico = document.getElementById('btn-palette-pico');

        this.setupEventListeners();
        this.ensureEpoch();
        this.refreshScoreUI();
        this.refreshEconomyUI();
        this.startBannerCycle();
        this.startAttractCycle();
    }

    // ——— Persistent XRPL scoreboard (demo: localStorage = on-ledger memo cache) ———

    loadScoreboard() {
        try {
            const raw = localStorage.getItem(SCORE_STORAGE_KEY);
            if (!raw) return { wallets: {}, board: [] };
            const data = JSON.parse(raw);
            return {
                wallets: data.wallets || {},
                board: Array.isArray(data.board) ? data.board : []
            };
        } catch {
            return { wallets: {}, board: [] };
        }
    }

    saveScoreboard() {
        try {
            localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(this.scoreboard));
        } catch (e) {
            this.log('Scoreboard write failed (storage blocked).', 'alert');
        }
    }

    getScoreAccountKey() {
        if (this.isBypassMode) return 'rDemoLocal';
        return this.walletAddress || 'rGuest';
    }

    getWalletRecord(key = this.getScoreAccountKey()) {
        if (!this.scoreboard.wallets[key]) {
            this.scoreboard.wallets[key] = {
                highScore: 0,
                totalRuns: 0,
                totalDrops: 0,
                totalXrpEarned: 0,
                lastScore: 0,
                lastLedger: 0
            };
        }
        return this.scoreboard.wallets[key];
    }

    refreshScoreUI() {
        const rec = this.getWalletRecord();
        this.personalBest = rec.highScore || 0;
        if (this.valBestScore) this.valBestScore.textContent = this.formatScoreDisplay(this.personalBest);
        this.renderLeaderboard();
        this.renderScoreHistory();
        this.refreshBannerSlides();
    }

    // ——— Multi-bag economy (jackpot / topN / milestones / reserve / dev) ———

    defaultEconomy() {
        const now = Date.now();
        return {
            bags: { jackpot: 2.5, topN: 1.0, milestones: 0.8, reserve: 1.2, dev: 0 },
            epochId: 1,
            epochStarted: now,
            epochEnds: now + XRPL.EPOCH_MS,
            epochBoard: [],
            daily: {},
            milestonesClaimed: {},
            history: [],
            houseProfit: 0,
            totalStaked: 0,
            totalPaidPlayers: 0
        };
    }

    loadEconomy() {
        try {
            const raw = localStorage.getItem(ECONOMY_STORAGE_KEY);
            if (!raw) return this.defaultEconomy();
            const d = JSON.parse(raw);
            const base = this.defaultEconomy();
            return {
                ...base,
                ...d,
                bags: { ...base.bags, ...(d.bags || {}) },
                epochBoard: Array.isArray(d.epochBoard) ? d.epochBoard : [],
                daily: d.daily || {},
                milestonesClaimed: d.milestonesClaimed || {},
                history: Array.isArray(d.history) ? d.history : []
            };
        } catch {
            return this.defaultEconomy();
        }
    }

    saveEconomy() {
        try {
            localStorage.setItem(ECONOMY_STORAGE_KEY, JSON.stringify(this.economy));
        } catch (_) { /* ignore */ }
    }

    roundXrp(n) {
        return Math.round(n * 1e9) / 1e9;
    }

    ensureEpoch() {
        const now = Date.now();
        if (now < this.economy.epochEnds) return;
        this.resolveEpochPrizes();
        this.economy.epochId += 1;
        this.economy.epochStarted = now;
        this.economy.epochEnds = now + XRPL.EPOCH_MS;
        this.economy.epochBoard = [];
        this.saveEconomy();
        this.log(`Epoch #${this.economy.epochId} opened · prize tiers refreshed.`, 'event');
    }

    fundBagsFromStake(stake) {
        const s = XRPL.STAKE_SPLIT;
        const parts = {
            earn: this.roundXrp(stake * s.earn),
            jackpot: this.roundXrp(stake * s.jackpot),
            topN: this.roundXrp(stake * s.topN),
            milestones: this.roundXrp(stake * s.milestones),
            dev: this.roundXrp(stake * s.dev),
            reserve: this.roundXrp(stake * s.reserve)
        };
        this.economy.bags.jackpot = this.roundXrp(this.economy.bags.jackpot + parts.jackpot);
        this.economy.bags.topN = this.roundXrp(this.economy.bags.topN + parts.topN);
        this.economy.bags.milestones = this.roundXrp(this.economy.bags.milestones + parts.milestones);
        this.economy.bags.dev = this.roundXrp(this.economy.bags.dev + parts.dev);
        this.economy.bags.reserve = this.roundXrp(this.economy.bags.reserve + parts.reserve);
        this.economy.totalStaked = this.roundXrp(this.economy.totalStaked + stake);
        this.sessionEarnEscrow = parts.earn;
        this.sessionPendingEarn = 0;
        this.saveEconomy();
        this.maybeSoftCapJackpot();
        return parts;
    }

    fundBagsFromSkin(cost) {
        const s = XRPL.SKIN_SPLIT;
        const j = this.roundXrp(cost * s.jackpot);
        const m = this.roundXrp(cost * s.milestones);
        const d = this.roundXrp(cost * s.dev);
        this.economy.bags.jackpot = this.roundXrp(this.economy.bags.jackpot + j);
        this.economy.bags.milestones = this.roundXrp(this.economy.bags.milestones + m);
        this.economy.bags.dev = this.roundXrp(this.economy.bags.dev + d);
        this.saveEconomy();
        this.maybeSoftCapJackpot();
        this.log(`Skin revenue split · jackpot +${j} · milestones +${m} · dev +${d} XRP`, 'zk');
        this.refreshEconomyUI();
    }

    maybeSoftCapJackpot() {
        if (this.economy.bags.jackpot < XRPL.JACKPOT_SOFT_CAP) return;
        this.log(`Jackpot soft-cap ${XRPL.JACKPOT_SOFT_CAP} XRP hit — forcing epoch prize resolve.`, 'alert');
        this.resolveEpochPrizes();
        this.economy.epochId += 1;
        this.economy.epochStarted = Date.now();
        this.economy.epochEnds = Date.now() + XRPL.EPOCH_MS;
        this.economy.epochBoard = [];
        this.saveEconomy();
    }

    accrueChannelReward(amount, label) {
        if (!this.gameActive || amount <= 0) return;
        this.sessionPendingEarn = this.roundXrp(this.sessionPendingEarn + amount);
        const pendingEl = document.getElementById('val-pending-earn');
        if (pendingEl) pendingEl.textContent = this.sessionPendingEarn.toFixed(4);
        // Quiet channel: only occasional proof log (Make Waves friendly, not spam)
        this._pendingMoves = (this._pendingMoves || 0) + 1;
        if (this._pendingMoves >= 12 && this.hasSessionKeys) {
            this._pendingMoves = 0;
            const { block } = this.getNewTxHash();
            this.log(`ChannelClaim batch · pending ${this.sessionPendingEarn.toFixed(4)} XRP · ledger ${block}`, 'zk');
        } else if (!this.hasSessionKeys && this.isBypassMode === false && label) {
            // without channel, still avoid per-drop spam — every 5th
            if ((this._pendingMoves % 5) === 0) {
                this.log(`Accrued ${label} (settle on Claim) · pending ${this.sessionPendingEarn.toFixed(4)} XRP`, 'zk');
            }
        }
    }

    /**
     * Settle run: pay skill earn from escrow (cap), unused escrow → house reserve.
     * Optional rare boost from reserve toward MAX_RECLAIM_MULT.
     */
    settleRunPayout({ score, drops, level }) {
        const stake = XRPL.ENTRY_STAKE;
        const escrow = this.sessionEarnEscrow || this.roundXrp(stake * XRPL.STAKE_SPLIT.earn);
        let due = Math.min(this.sessionPendingEarn, escrow);

        // Rare skill boost: clear 3 sectors + high score → up to 1.1× stake from reserve
        const maxPayout = this.roundXrp(stake * XRPL.MAX_RECLAIM_MULT);
        if (level >= 3 && score >= 2000 && this.economy.bags.reserve > 0.05) {
            const boost = Math.min(maxPayout - due, this.economy.bags.reserve * 0.15, this.roundXrp(stake * 0.1));
            if (boost > 0) {
                due = this.roundXrp(due + boost);
                this.economy.bags.reserve = this.roundXrp(this.economy.bags.reserve - boost);
                this.log(`Reserve skill boost +${boost.toFixed(4)} XRP (clear+score).`, 'event');
            }
        }

        due = Math.min(due, maxPayout);
        const unusedEscrow = this.roundXrp(Math.max(0, escrow - Math.min(this.sessionPendingEarn, escrow)));
        if (unusedEscrow > 0) {
            this.economy.bags.reserve = this.roundXrp(this.economy.bags.reserve + unusedEscrow * 0.6);
            this.economy.bags.dev = this.roundXrp(this.economy.bags.dev + unusedEscrow * 0.4);
            this.economy.houseProfit = this.roundXrp(this.economy.houseProfit + unusedEscrow);
            this.log(`House edge · unused earn escrow ${unusedEscrow.toFixed(4)} XRP → reserve/dev.`, 'zk');
        }

        if (due > 0) {
            this.creditEth(due);
            this.sessionXrpEarned = this.roundXrp(this.sessionXrpEarned + due);
            this.economy.totalPaidPlayers = this.roundXrp(this.economy.totalPaidPlayers + due);
            const { hash, block } = this.getNewTxHash();
            this.log(`Settle Payment · +${due.toFixed(4)} XRP · ledger ${block} · ${hash.slice(0, 12)}...`, 'tx');
        } else {
            this.log('Settle · no channel earn to claim this run.', 'system');
        }

        this.sessionPendingEarn = 0;
        this.sessionEarnEscrow = 0;
        this.saveEconomy();
        this.refreshEconomyUI();
        return due;
    }

    resolveEpochPrizes() {
        const board = [...(this.economy.epochBoard || [])].sort((a, b) => b.score - a.score);
        if (!board.length) {
            this.log(`Epoch #${this.economy.epochId} closed — no scores; bags roll forward.`, 'system');
            return;
        }

        const jackpot = this.economy.bags.jackpot;
        const topN = this.economy.bags.topN;
        const tiers = [
            { pct: 0.50, bag: 'jackpot' },
            { pct: 0.20, bag: 'jackpot' },
            { pct: 0.15, bag: 'jackpot' }
        ];
        let paidJ = 0;
        tiers.forEach((t, i) => {
            if (!board[i] || jackpot <= 0) return;
            const amt = this.roundXrp(jackpot * t.pct);
            paidJ += amt;
            this.log(`Epoch prize #${i + 1} → ${board[i].account} · ${amt.toFixed(4)} XRP (jackpot)`, 'event');
            if (board[i].account === this.getScoreAccountKey()) this.creditEth(amt);
        });
        // 15% of jackpot stays as seed
        this.economy.bags.jackpot = this.roundXrp(jackpot - paidJ);

        const topCount = Math.min(5, board.length);
        if (topCount && topN > 0) {
            const each = this.roundXrp(topN / topCount);
            for (let i = 0; i < topCount; i++) {
                this.log(`Top-N share → ${board[i].account} · ${each.toFixed(4)} XRP`, 'event');
                if (board[i].account === this.getScoreAccountKey()) this.creditEth(each);
            }
            this.economy.bags.topN = 0;
        }

        this.economy.history.unshift({
            type: 'epoch',
            epochId: this.economy.epochId,
            winner: board[0]?.account,
            topScore: board[0]?.score || 0,
            paidJackpot: paidJ,
            ts: Date.now()
        });
        this.economy.history = this.economy.history.slice(0, XRPL.SCORE_HISTORY_MAX);
        this.saveEconomy();
        this.refreshEconomyUI();
    }

    recordEpochScore(account, score, drops) {
        this.ensureEpoch();
        const existing = this.economy.epochBoard.find(r => r.account === account);
        if (existing) {
            if (score > existing.score) {
                existing.score = score;
                existing.drops = drops;
                existing.ts = Date.now();
            }
        } else {
            this.economy.epochBoard.push({ account, score, drops, ts: Date.now() });
        }
        this.economy.epochBoard.sort((a, b) => b.score - a.score);
        this.economy.epochBoard = this.economy.epochBoard.slice(0, 20);

        const day = new Date().toISOString().slice(0, 10);
        if (!this.economy.daily[day]) this.economy.daily[day] = [];
        const dayBoard = this.economy.daily[day];
        const dExist = dayBoard.find(r => r.account === account);
        if (dExist) {
            if (score > dExist.score) dExist.score = score;
        } else {
            dayBoard.push({ account, score, ts: Date.now() });
        }
        dayBoard.sort((a, b) => b.score - a.score);
        this.economy.daily[day] = dayBoard.slice(0, 10);

        this.economy.history.unshift({
            type: 'run',
            account,
            score,
            drops,
            epochId: this.economy.epochId,
            ts: Date.now()
        });
        this.economy.history = this.economy.history.slice(0, XRPL.SCORE_HISTORY_MAX);
        this.saveEconomy();
    }

    checkMilestones({ score, drops, relics, level }) {
        const account = this.getScoreAccountKey();
        const checks = [
            { id: 'drops_50', ok: drops >= 50, label: '50 drops harvested', rewardPct: 0.08 },
            { id: 'drops_150', ok: drops >= 150, label: '150 drops harvested', rewardPct: 0.12 },
            { id: 'relics_3', ok: relics >= 3, label: '3 Ledger Relics', rewardPct: 0.15 },
            { id: 'score_1k', ok: score >= 1000, label: '1,000 pts', rewardPct: 0.10 },
            { id: 'score_3k', ok: score >= 3000, label: '3,000 pts', rewardPct: 0.18 },
            { id: 'sector_3', ok: level >= 3, label: 'Sector 3 clear', rewardPct: 0.20 }
        ];
        checks.forEach(m => {
            if (!m.ok || this.economy.milestonesClaimed[m.id]) return;
            const bag = this.economy.bags.milestones;
            if (bag < 0.01) return;
            const prize = this.roundXrp(bag * m.rewardPct);
            this.economy.milestonesClaimed[m.id] = { account, prize, ts: Date.now() };
            this.economy.bags.milestones = this.roundXrp(bag - prize);
            this.creditEth(prize);
            this.sessionXrpEarned = this.roundXrp(this.sessionXrpEarned + prize);
            this.log(`Milestone [${m.label}] · first claim ${account} · +${prize.toFixed(4)} XRP`, 'event');
            this.economy.history.unshift({
                type: 'milestone',
                id: m.id,
                label: m.label,
                account,
                prize,
                ts: Date.now()
            });
        });
        this.saveEconomy();
        this.refreshEconomyUI();
    }

    refreshEconomyUI() {
        this.ensureEpoch();
        const b = this.economy.bags;
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = (typeof v === 'number' ? v.toFixed(3) : v);
        };
        set('val-bag-jackpot', b.jackpot);
        set('val-bag-topn', b.topN);
        set('val-bag-milestones', b.milestones);
        set('val-bag-reserve', b.reserve);
        set('val-bag-dev', b.dev);
        set('val-bag-total', b.jackpot + b.topN + b.milestones);
        set('val-epoch-id', `#${this.economy.epochId}`);
        const ends = new Date(this.economy.epochEnds);
        set('val-epoch-ends', ends.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));

        const tierEl = document.getElementById('prize-tier-list');
        if (tierEl) {
            const j = b.jackpot;
            tierEl.innerHTML = `
                <li><span>#1 Epoch</span><strong>${(j * 0.50).toFixed(3)} XRP</strong></li>
                <li><span>#2 Epoch</span><strong>${(j * 0.20).toFixed(3)} XRP</strong></li>
                <li><span>#3 Epoch</span><strong>${(j * 0.15).toFixed(3)} XRP</strong></li>
                <li><span>Top-5 pool</span><strong>${b.topN.toFixed(3)} XRP</strong></li>
                <li><span>Milestones</span><strong>${b.milestones.toFixed(3)} XRP</strong></li>
            `;
        }

        const pendingEl = document.getElementById('val-pending-earn');
        if (pendingEl) pendingEl.textContent = (this.sessionPendingEarn || 0).toFixed(4);

        this.renderScoreHistory();
        this.refreshBannerSlides();
        if (window.gameEngine?.isActive) window.gameEngine.updateUI();
    }

    renderScoreHistory() {
        const el = document.getElementById('score-history-list');
        if (!el) return;
        const items = (this.economy.history || []).slice(0, 12);
        if (!items.length) {
            el.innerHTML = '<li class="lb-empty">No historic commits yet.</li>';
            return;
        }
        el.innerHTML = items.map(h => {
            if (h.type === 'milestone') {
                return `<li class="hist-row"><span class="hist-tag">HIT</span> ${h.label} · ${h.account} · +${(h.prize || 0).toFixed(3)}</li>`;
            }
            if (h.type === 'epoch') {
                return `<li class="hist-row"><span class="hist-tag">EPOCH</span> #${h.epochId} winner ${h.winner || '—'} · ${h.topScore} pts</li>`;
            }
            const d = new Date(h.ts).toLocaleDateString();
            return `<li class="hist-row"><span class="hist-tag">RUN</span> ${d} · ${h.account} · ${this.formatScoreDisplay(h.score)} pts</li>`;
        }).join('');
    }

    // ——— Start-screen cycling banner (scores + Make Waves / XRPL ads) ———

    buildBannerSlides() {
        const j = this.economy.bags.jackpot;
        const total = this.roundXrp(j + this.economy.bags.topN + this.economy.bags.milestones);
        const top = this.scoreboard.board[0];
        const epochTop = [...(this.economy.epochBoard || [])].sort((a, b) => b.score - a.score)[0];
        const day = new Date().toISOString().slice(0, 10);
        const dayTop = (this.economy.daily[day] || [])[0];

        const maxTier = (j * 0.5).toFixed(3);

        return [
            {
                kind: 'prize',
                kicker: 'PRIZE POOL LIVE',
                title: `${total.toFixed(2)} XRP`,
                body: `Jackpot ${maxTier} → Epoch #1 · ends ${new Date(this.economy.epochEnds).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            },
            {
                // Retro attract-mode SCORE TABLE (Juno First–style), Leak Runner lore
                kind: 'scoretable',
                kicker: 'LEAK RUNNER',
                title: 'SCORE TABLE',
                maxTier
            },
            {
                kind: 'score',
                kicker: 'ALL-TIME BEST',
                title: top ? `${this.formatScoreDisplay(top.score)} pts` : '—',
                body: top ? `${top.account} leads the XRPL scoreboard` : 'Be the first ScoreCommit on the ledger'
            },
            {
                kind: 'score',
                kicker: `EPOCH #${this.economy.epochId}`,
                title: epochTop ? `${this.formatScoreDisplay(epochTop.score)} pts` : 'Open field',
                body: epochTop ? `${epochTop.account} holds the epoch crown` : 'Play a run to claim epoch #1'
            },
            {
                kind: 'score',
                kicker: 'TODAY',
                title: dayTop ? `${this.formatScoreDisplay(dayTop.score)} pts` : 'No runs yet',
                body: dayTop ? `${dayTop.account} · daily high` : 'Daily board resets at UTC midnight'
            },
            {
                kind: 'ad',
                kicker: 'SPONSORED',
                title: 'Make Waves',
                body: 'Build on XRPL · ship consumer apps · Leak Runner is a Make Waves arcade prototype'
            },
            {
                kind: 'ad',
                kicker: 'POWERED BY',
                title: 'XRP Ledger',
                body: 'Payment Channels · micropayouts · Xaman wallet — settle skill, not spam'
            }
        ];
    }

    renderScoreTableSlide(active, maxTier) {
        return `
            <article class="banner-slide scoretable${active ? ' active' : ''}">
                <div class="scoretable-brand">LEAK<span>RUNNER</span></div>
                <h3 class="scoretable-heading">SCORE TABLE</h3>
                <div class="scoretable-grid">
                    <ul class="scoretable-col">
                        <li><i class="st-icon st-drop"></i><span class="st-dots"></span><span class="st-pts">10 PTS</span></li>
                        <li><i class="st-icon st-cert"></i><span class="st-dots"></span><span class="st-pts">50 PTS</span></li>
                        <li><i class="st-icon st-slash"></i><span class="st-dots"></span><span class="st-pts">200 PTS</span></li>
                        <li><i class="st-icon st-sector"></i><span class="st-dots"></span><span class="st-pts">500 PTS</span></li>
                    </ul>
                    <ul class="scoretable-col">
                        <li><i class="st-icon st-relic1"></i><span class="st-dots"></span><span class="st-pts">100 PTS</span></li>
                        <li><i class="st-icon st-relic2"></i><span class="st-dots"></span><span class="st-pts">300 PTS</span></li>
                        <li><i class="st-icon st-relic3"></i><span class="st-dots"></span><span class="st-pts">500 PTS</span></li>
                        <li><i class="st-icon st-mystery"></i><span class="st-dots"></span><span class="st-pts st-mystery-pts">MYSTERY</span></li>
                    </ul>
                </div>
                <p class="scoretable-foot">MAX TIER #1 · ${maxTier} XRP · © MAKE WAVES · XRPL</p>
            </article>
        `;
    }

    refreshBannerSlides() {
        const track = document.getElementById('start-banner-track');
        if (!track) return;
        const slides = this.buildBannerSlides();
        const banner = document.getElementById('start-banner');
        const active = slides[this._bannerIndex % slides.length];
        if (banner) banner.classList.toggle('tall', active?.kind === 'scoretable');

        track.innerHTML = slides.map((s, i) => {
            const on = i === this._bannerIndex % slides.length;
            if (s.kind === 'scoretable') return this.renderScoreTableSlide(on, s.maxTier);
            return `
            <article class="banner-slide ${s.kind}${on ? ' active' : ''}" data-i="${i}">
                <span class="banner-kicker">${s.kicker}</span>
                <h3 class="banner-title">${s.title}</h3>
                <p class="banner-body">${s.body}</p>
            </article>`;
        }).join('');
        const dots = document.getElementById('start-banner-dots');
        if (dots) {
            dots.innerHTML = slides.map((_, i) =>
                `<button type="button" class="banner-dot${i === this._bannerIndex % slides.length ? ' active' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"></button>`
            ).join('');
            dots.querySelectorAll('.banner-dot').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._bannerIndex = Number(btn.dataset.i) || 0;
                    this.refreshBannerSlides();
                });
            });
        }
    }

    startBannerCycle() {
        this.refreshBannerSlides();
        if (this._bannerTimer) clearInterval(this._bannerTimer);
        this._bannerTimer = setInterval(() => {
            const prompt = document.getElementById('start-prompt');
            if (prompt && prompt.style.display === 'none') return;
            if (this._attractVisible) return;
            const slides = this.buildBannerSlides();
            this._bannerIndex = (this._bannerIndex + 1) % slides.length;
            this.refreshBannerSlides();
        }, 4500);
    }

    // ——— Full-lobby attract: Gaplus-style TOP 5 while waiting for a player ———

    padScore(n) {
        const fmt = typeof formatScoreText === 'function' ? formatScoreText : null;
        if (fmt) return fmt(n, { pad: 6 });
        return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(6, '0').slice(0, 10);
    }

    attractName(account) {
        if (typeof formatScoreLabel === 'function') {
            const label = formatScoreLabel(String(account || 'NODE').replace(/^r/, ''));
            return label.slice(0, 6).padEnd(6, 'X');
        }
        const raw = String(account || 'NODE').replace(/^r/, '').toUpperCase();
        const alnum = raw.replace(/[^A-Z0-9]/g, '');
        return (alnum.slice(0, 6) || 'NODE').padEnd(6, 'X');
    }

    formatScoreDisplay(n) {
        if (typeof formatScoreText === 'function') return formatScoreText(n);
        return String(Math.max(0, Math.floor(Number(n) || 0))).slice(0, 10);
    }

    buildAttractRows() {
        const board = this.scoreboard.board.slice(0, 5);
        const placeholders = [
            { score: 50000, account: 'LEAKRU', drops: 240, epoch: 1 },
            { score: 42000, account: 'XAMAN', drops: 210, epoch: 1 },
            { score: 35000, account: 'MAKEWV', drops: 180, epoch: 1 },
            { score: 28000, account: 'XRPL', drops: 150, epoch: 1 },
            { score: 21000, account: 'NODE', drops: 120, epoch: 1 }
        ];
        const rows = [];
        for (let i = 0; i < 5; i++) {
            const src = board[i] || placeholders[i];
            rows.push({
                score: src.score,
                name: this.attractName(src.account),
                drops: src.drops ?? placeholders[i].drops,
                epoch: src.epoch ?? this.economy?.epochId ?? 1
            });
        }
        return rows;
    }

    refreshAttractScreen() {
        const body = document.getElementById('attract-table-body');
        const hiEl = document.getElementById('attract-hi');
        const upEl = document.getElementById('attract-1up');
        if (!body) return;

        const rows = this.buildAttractRows();
        const hi = rows[0]?.score || 0;
        if (hiEl) hiEl.textContent = this.padScore(hi);

        const you = this.scoreboard.wallets[this.getScoreAccountKey()];
        const oneUp = you?.highScore || you?.lastScore || 0;
        if (upEl) upEl.textContent = this.padScore(oneUp);

        body.innerHTML = rows.map((r, i) => `
            <tr>
                <td class="attract-rank">${i + 1}</td>
                <td>${this.padScore(r.score)}</td>
                <td>${r.name}</td>
                <td>${r.drops}</td>
                <td>#${r.epoch}</td>
            </tr>
        `).join('');
    }

    isLobbyIdle() {
        if (this.gameActive) return false;
        const modal = document.getElementById('gameover-modal');
        if (modal && modal.style.display === 'flex') return false;
        const prompt = document.getElementById('start-prompt');
        if (!prompt) return false;
        return prompt.style.display !== 'none';
    }

    showAttractScreen() {
        if (!this.isLobbyIdle()) {
            if (this._attractTimer) clearTimeout(this._attractTimer);
            this._attractTimer = setTimeout(() => this.showAttractScreen(), this._attractIdleMs);
            return;
        }
        const el = document.getElementById('attract-scores');
        const app = document.querySelector('.app-container');
        if (!el) return;
        this.refreshAttractScreen();
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
        if (app) app.classList.add('attract-on');
        this._attractVisible = true;
        if (this._attractTimer) clearTimeout(this._attractTimer);
        this._attractTimer = setTimeout(() => this.hideAttractScreen(true), this._attractShowMs);
    }

    hideAttractScreen(reschedule = true) {
        const el = document.getElementById('attract-scores');
        const app = document.querySelector('.app-container');
        if (el) {
            el.hidden = true;
            el.setAttribute('aria-hidden', 'true');
        }
        if (app) app.classList.remove('attract-on');
        this._attractVisible = false;
        if (this._attractTimer) {
            clearTimeout(this._attractTimer);
            this._attractTimer = null;
        }
        if (reschedule && this.isLobbyIdle()) {
            this._attractTimer = setTimeout(() => this.showAttractScreen(), this._attractIdleMs);
        }
    }

    startAttractCycle() {
        const el = document.getElementById('attract-scores');
        if (el && !el._attractBound) {
            el._attractBound = true;
            el.addEventListener('click', () => this.hideAttractScreen(true));
        }
        this.hideAttractScreen(true);
    }

    pauseAttractCycle() {
        this.hideAttractScreen(false);
    }

    renderLeaderboard() {
        if (!this.leaderboardEl) return;
        const board = this.scoreboard.board.slice(0, XRPL.SCORE_BOARD_MAX);
        if (!board.length) {
            this.leaderboardEl.innerHTML = '<li class="lb-empty">No ledger scores yet — finish a run to mint your first ScoreCommit.</li>';
            return;
        }
        this.leaderboardEl.innerHTML = board.map((row, i) => {
            const you = row.account === this.getScoreAccountKey() ? ' you' : '';
            return `<li class="lb-row${you}">
                <span class="lb-rank">#${i + 1}</span>
                <span class="lb-addr">${row.account}</span>
                <span class="lb-score">${this.formatScoreDisplay(row.score)}</span>
            </li>`;
        }).join('');
    }

    /**
     * Persist run score as an XRPL ScoreCommit (simulated AccountSet + Memo).
     * Survives reloads via localStorage keyed by Xaman account.
     */
    commitScoreToLedger({ score, drops, relics, reason }) {
        const account = this.getScoreAccountKey();
        const rec = this.getWalletRecord(account);
        const pts = Math.max(0, Math.floor(Number(score) || 0));
        const dropCount = Math.max(0, Math.floor(Number(drops) || 0));
        const relicCount = Math.max(0, Math.floor(Number(relics) || 0));
        const isRecord = pts > (rec.highScore || 0);

        rec.totalRuns += 1;
        rec.totalDrops += dropCount;
        rec.lastScore = pts;
        if (isRecord) rec.highScore = pts;

        this.recordEpochScore(account, pts, dropCount);
        this.checkMilestones({
            score: pts,
            drops: dropCount,
            relics: relicCount,
            level: window.gameEngine?.level || 1
        });

        const sessionEarn = this.sessionXrpEarned || 0;
        rec.totalXrpEarned = this.roundXrp(rec.totalXrpEarned + sessionEarn);

        const { hash, block } = this.getNewTxHash();
        rec.lastLedger = block;

        this.scoreboard.board = this.scoreboard.board.filter(r => r.account !== account);
        this.scoreboard.board.push({
            account,
            score: rec.highScore,
            drops: rec.totalDrops,
            relics: relicCount,
            ledger: block,
            ts: Date.now()
        });
        this.scoreboard.board.sort((a, b) => b.score - a.score || b.ts - a.ts);
        this.scoreboard.board = this.scoreboard.board.slice(0, XRPL.SCORE_BOARD_MAX);
        this.saveScoreboard();

        this.personalBest = rec.highScore;
        this.refreshScoreUI();
        this.refreshEconomyUI();

        const entry = {
            account,
            score: Math.max(pts, rec.highScore),
            drops: dropCount,
            relics: relicCount,
            ledger: block,
            ts: Date.now(),
            reason: reason || 'run'
        };

        const memo = `ScoreCommit:${pts}|drops:${dropCount}|relics:${relicCount}|best:${rec.highScore}`;
        this.log(`AccountSet + Memo · ${memo}`, 'zk');
        this.log(`ScoreCommit · ${pts} pts · ledger ${block} · ${hash.slice(0, 14)}...`, 'tx');
        if (isRecord) {
            this.log(`NEW PERSONAL BEST ${pts} for ${account} — persisted on XRPL scoreboard.`, 'event');
        } else {
            this.log(`Run scored ${pts} (best remains ${rec.highScore}).`, 'event');
        }

        return { isRecord, best: rec.highScore, ledger: block, hash, entry };
    }

    captureRunStats() {
        const g = window.gameEngine;
        return {
            score: g?.score ?? 0,
            drops: g?.dotsEaten ?? 0,
            relics: g?.relicsCollected?.length ?? 0,
            level: g?.level ?? 1
        };
    }

    setupEventListeners() {
        if (this.btnConnect) this.btnConnect.addEventListener('click', () => this.connectWallet());
        if (this.btnSessionKeys) this.btnSessionKeys.addEventListener('click', () => this.toggleSessionKeys());
        if (this.btnStartRun) this.btnStartRun.addEventListener('click', () => this.insertCoinTransaction());
        if (this.btnClaimExit) this.btnClaimExit.addEventListener('click', () => this.cashOutTransaction());
        
        if (this.chkBypass) this.chkBypass.addEventListener('change', (e) => this.toggleBypassMode(e.target.checked));
        if (this.btnPaletteClassic) this.btnPaletteClassic.addEventListener('click', () => this.selectPalette('classic'));
        if (this.btnPaletteGreen) this.btnPaletteGreen.addEventListener('click', () => this.selectPalette('green'));
        if (this.btnPalettePico) this.btnPalettePico.addEventListener('click', () => this.selectPalette('pico'));

        const chkTos = document.getElementById('chk-tos-agree');
        const btnAccept = document.getElementById('btn-tos-accept');
        const btnDecline = document.getElementById('btn-tos-decline');
        if (chkTos && btnAccept) {
            chkTos.addEventListener('change', () => {
                btnAccept.disabled = !chkTos.checked;
            });
        }
        if (btnAccept) btnAccept.addEventListener('click', () => this.acceptTermsAndConnect());
        if (btnDecline) btnDecline.addEventListener('click', () => this.declineTerms());
    }

    openTermsModal() {
        const modal = document.getElementById('tos-modal');
        const chk = document.getElementById('chk-tos-agree');
        const btnAccept = document.getElementById('btn-tos-accept');
        if (chk) chk.checked = false;
        if (btnAccept) btnAccept.disabled = true;
        if (modal) modal.style.display = 'flex';
        this.pauseAttractCycle();
    }

    closeTermsModal() {
        const modal = document.getElementById('tos-modal');
        if (modal) modal.style.display = 'none';
        if (this.isLobbyIdle()) this.hideAttractScreen(true);
    }

    declineTerms() {
        if (window.retroAudio) window.retroAudio.playClick();
        this.closeTermsModal();
        if (this.btnConnect) this.btnConnect.disabled = false;
        this.log('Xaman connect cancelled — Terms not accepted.', 'alert');
    }

    acceptTermsAndConnect() {
        const chk = document.getElementById('chk-tos-agree');
        if (!chk || !chk.checked) {
            this.log('Tick the Terms checkbox to continue.', 'alert');
            return;
        }
        try { localStorage.setItem('leakrunner_tos_v1', 'accepted'); } catch (_) {}
        if (window.retroAudio) window.retroAudio.playClick();
        this.closeTermsModal();
        this.log('Terms accepted — opening Xaman sign-in…', 'event');
        this.performXamanConnect();
    }

    log(message, type = 'system') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        
        let prefix = "";
        if (type === 'tx') prefix = "<i class='fa-solid fa-water'></i> [XRPL] ";
        else if (type === 'zk') prefix = "<i class='fa-solid fa-fingerprint'></i> [Proof] ";
        else if (type === 'event') prefix = "<i class='fa-solid fa-circle-check'></i> [Event] ";
        else if (type === 'alert') prefix = "<i class='fa-solid fa-triangle-exclamation'></i> [Alert] ";
        
        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `<span style="color: #666">[${timestamp}]</span> ${prefix}${message}`;
        this.logsContainer.appendChild(entry);
        this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    }

    getNewTxHash() {
        this.ledgerIndex++;
        const characters = 'ABCDEF0123456789';
        let hash = '';
        for (let i = 0; i < 64; i++) {
            hash += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return { hash, block: this.ledgerIndex };
    }

    creditEth(amount) {
        this.ethBalance = this.roundXrp(this.ethBalance + amount);
        if (this.valEthBalance) this.valEthBalance.textContent = this.ethBalance.toFixed(6);
    }

    debitXrp(amount) {
        this.ethBalance = Math.round((this.ethBalance - amount) * 1e9) / 1e9;
        if (this.valEthBalance) this.valEthBalance.textContent = this.ethBalance.toFixed(6);
    }

    connectWallet() {
        if (this.isConnected) return;
        if (window.retroAudio) window.retroAudio.playClick();
        this.openTermsModal();
    }

    performXamanConnect() {
        if (this.isConnected) return;

        this.log("Opening Xaman sign-in payload (XRPL mainnet)...");
        if (this.btnConnect) this.btnConnect.disabled = true;

        setTimeout(() => {
            this.isConnected = true;
            const suffix = Math.floor(Math.random() * 90 + 10);
            // Stable-ish demo address so scoreboard persists across reconnects in a session
            let stored = null;
            try { stored = localStorage.getItem('leakrunner_xaman_addr'); } catch (_) {}
            if (!stored) {
                stored = "rLeak" + Math.random().toString(36).slice(2, 6).toUpperCase() + "...x" + suffix;
                try { localStorage.setItem('leakrunner_xaman_addr', stored); } catch (_) {}
            }
            this.walletAddress = stored;
            this.ethBalance = XRPL.START_BALANCE;
            this.activeHeroId = "#" + (Math.floor(Math.random() * 900) + 100);
            this.refreshScoreUI();
            const best = this.getWalletRecord().highScore;
            if (best > 0) {
                this.log(`Xaman linked · on-ledger best score ${this.formatScoreDisplay(best)} pts loaded.`, 'event');
            }
            
            if (this.indicatorEl) this.indicatorEl.className = "status-indicator connected";
            if (this.walletAddressEl) this.walletAddressEl.textContent = this.walletAddress;
            if (this.btnConnect) {
                this.btnConnect.innerHTML = "<i class='fa-solid fa-check'></i> Xaman Linked";
                this.btnConnect.classList.replace('btn-primary', 'btn-danger');
                this.btnConnect.style.opacity = "0.75";
            }
            
            if (this.valEthBalance) this.valEthBalance.textContent = this.ethBalance.toFixed(6);
            if (this.valHeroNft) this.valHeroNft.textContent = this.activeHeroId;
            if (this.valHeroClass) this.valHeroClass.textContent = this.activeHeroSkin;
            
            this.btnStartRun.disabled = false;
            this.btnSessionKeys.disabled = false;

            this.log(`Xaman connected: ${this.walletAddress}`, 'system');
            this.log(`XRPL balance: ${this.ethBalance.toFixed(6)} XRP`, 'system');
            this.log(`Node NFT detected (XLS-20): ${this.activeHeroId}`, 'event');
            this.log("Tip: open a Payment Channel so drop rewards settle without signing every harvest.", 'zk');
            
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
                this.sessionKeyBadge.innerHTML = "<i class='fa-solid fa-link-slash'></i> Channel Off";
            }
            if (this.btnSessionKeys) this.btnSessionKeys.innerHTML = "<i class='fa-solid fa-link'></i> Payment Channel";
            this.log("Payment Channel closed. Each drop will require a Xaman claim signature.", 'alert');
        } else {
            this.log("Requesting Payment Channel open via Xaman (micropayout rail)...");
            if (this.btnSessionKeys) this.btnSessionKeys.disabled = true;

            setTimeout(() => {
                this.hasSessionKeys = true;
                if (this.sessionKeyBadge) {
                    this.sessionKeyBadge.className = "session-keys-status-compact active";
                    this.sessionKeyBadge.innerHTML = "<i class='fa-solid fa-link'></i> Channel Live";
                }
                if (this.btnSessionKeys) {
                    this.btnSessionKeys.innerHTML = "<i class='fa-solid fa-link-slash'></i> Close Channel";
                    this.btnSessionKeys.disabled = false;
                }

                const { hash, block } = this.getNewTxHash();
                this.log(`PaymentChannel funded · ledger ${block} · ${hash.slice(0, 12)}...`, 'tx');
                this.log("Drop harvests now stream as channel claims — consume XRP stake, earn XRP back.", 'zk');
            }, 1000);
        }
    }

    insertCoinTransaction() {
        const bootRun = (funded) => {
            this.ensureEpoch();
            this.sessionXrpEarned = 0;
            const parts = this.fundBagsFromStake(XRPL.ENTRY_STAKE);
            if (funded) {
                this.log(
                    `Stake split · earn ${parts.earn} · bags J/T/M ${parts.jackpot}/${parts.topN}/${parts.milestones} · dev ${parts.dev} · reserve ${parts.reserve}`,
                    'zk'
                );
            } else {
                this.log(`Demo stake split applied (virtual ${XRPL.ENTRY_STAKE} XRP) · earn escrow ${parts.earn}`, 'zk');
            }
            this.refreshEconomyUI();
            this.gameActive = true;
            this.pauseAttractCycle();
            if (this.btnClaimExit) this.btnClaimExit.disabled = false;
            if (this.btnStartRun) this.btnStartRun.disabled = true;
            if (window.gameEngine) window.gameEngine.startGame(this.activeHeroSkin);
        };

        if (this.isBypassMode) {
            bootRun(false);
            return;
        }

        if (!this.isConnected || this.gameActive) return;
        if (this.ethBalance < XRPL.ENTRY_STAKE) {
            this.log(`Insufficient XRP. Stake requires ${XRPL.ENTRY_STAKE} XRP from Xaman.`, 'alert');
            return;
        }
        if (window.retroAudio) window.retroAudio.playClick();

        this.log(`Staking ${XRPL.ENTRY_STAKE} XRP Payment to Leak Runner escrow (consume-to-play)...`, 'system');
        this.btnStartRun.disabled = true;

        const executeRun = () => {
            this.debitXrp(XRPL.ENTRY_STAKE);
            const { hash, block } = this.getNewTxHash();
            this.log(`Payment OK · stake ${XRPL.ENTRY_STAKE} XRP · ledger ${block} · ${hash.slice(0, 14)}...`, 'tx');
            this.log('Escrow locked · channel accrues in-run · settle on Claim/Exit.', 'event');
            bootRun(true);
        };

        if (this.hasSessionKeys) {
            executeRun();
        } else {
            this.log("Awaiting Xaman push approval for stake Payment...", 'system');
            setTimeout(executeRun, 1200);
        }
    }

    registerMoveAndEatTransaction(x, y, ateDot) {
        if (!this.gameActive) return;
        if (!ateDot) return;
        // Accrue in Payment Channel — no per-drop Payment spam
        this.accrueChannelReward(XRPL.DROP_REWARD, `drop@${x},${y}`);
    }

    eatGhostTransaction(ghostId) {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playEatGhost();
        const names = ["Reentrancy", "Frontrunner", "FlashLoan", "Sybil"];
        const name = names[ghostId] || `Exploit#${ghostId}`;
        this.accrueChannelReward(XRPL.EXPLOIT_SLASH, `slash:${name}`);
        this.log(`Audit slash ${name} · +${XRPL.EXPLOIT_SLASH} XRP accrued (settle later).`, 'event');
    }

    collectRelicTransaction(relic) {
        if (!relic) return;
        this.inventory.push(relic.id);
        this.updateInventoryUI();
        this.accrueChannelReward(relic.xrp, `relic:${relic.name}`);
        this.log(`Relic ${relic.name} · +${relic.xrp} XRP accrued · +${relic.score} pts`, 'event');
    }

    loseLifeTransaction(remainingLives) {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playDeath();
        if (this.isBypassMode) return;

        this.log(`Uptime hit. Restarts left: ${remainingLives}. Memo logged on XRPL...`, 'alert');
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.log(`AccountSet memo (uptime) · ledger ${block} · ${hash.slice(0, 12)}...`, 'tx');
        }, 800);
    }

    cashOutTransaction() {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playClick();
        
        this.log("Claiming escrow remainder + harvested XRP via Xaman...", 'system');
        this.btnClaimExit.disabled = true;

        const executeExit = () => {
            const { hash, block } = this.getNewTxHash();
            const stats = this.captureRunStats();
            
            if (stats.relics > 0) {
                this.log(`Escrow notes ${stats.relics} Ledger Relic(s) vaulted this run.`, 'event');
            }

            this.log(`Escrow release · ledger ${block} · ${hash.slice(0, 14)}...`, 'tx');
            this.settleRunPayout(stats);
            this.commitScoreToLedger({ ...stats, reason: 'cashout' });
            this.log('Run finalized. Channel settled · ScoreCommit · bags updated.', 'event');

            this.resetGameState();
        };

        if (this.hasSessionKeys) {
            executeExit();
        } else {
            this.log("Awaiting Xaman approval for claim Payment...", 'system');
            setTimeout(executeExit, 1200);
        }
    }

    triggerPermadeath() {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playGameOver();
        
        const stats = this.captureRunStats();
        // Death: settle what you earned; unused escrow → house (edge)
        this.settleRunPayout(stats);
        const commit = this.commitScoreToLedger({ ...stats, reason: 'slash' });

        if (this.isBypassMode) {
            this.showGameOverModal({
                heroLabel: 'Demo Node',
                score: stats.score,
                drops: stats.drops,
                best: commit.best,
                isRecord: commit.isRecord,
                demo: true
            });
            this.resetGameState();
            if (this.btnStartRun) {
                this.btnStartRun.disabled = false;
                this.btnStartRun.innerHTML = "<i class='fa-solid fa-play'></i> Demo Boot";
            }
            return;
        }
        
        this.log("UPTIME 0 — initiating NFTokenBurn (Node slash / liquidation)...", 'alert');
        this.gameActive = false;
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.log(`NFTokenBurn ${this.activeHeroId} · ledger ${block} · ${hash.slice(0, 14)}...`, 'tx');
            this.log(`Node NFT ${this.activeHeroId} permanently burned on XRPL.`, 'alert');
            
            this.showGameOverModal({
                heroLabel: `Node ${this.activeHeroId}`,
                score: stats.score,
                drops: stats.drops,
                best: commit.best,
                isRecord: commit.isRecord,
                demo: false
            });
            
            this.resetGameState();
            this.activeHeroId = "Slashed";
            this.activeHeroSkin = "-";
            this.valHeroNft.textContent = this.activeHeroId;
            this.valHeroNft.className = "stat-value text-danger";
            this.valHeroClass.textContent = this.activeHeroSkin;
            
            this.btnStartRun.disabled = true;
            this.btnStartRun.innerHTML = "<i class='fa-solid fa-skull'></i> Node Burned";
            this.btnStartRun.className = "btn btn-danger";

            document.getElementById('btn-close-gameover').onclick = () => {
                this.closeBurnedSession();
            };
        }, 1000);
    }

    showGameOverModal({ heroLabel, score, drops, best, isRecord, demo }) {
        const modal = document.getElementById('gameover-modal');
        if (!modal) return;
        const burned = document.getElementById('lbl-burned-hero');
        const finalScore = document.getElementById('lbl-final-score');
        const finalDrops = document.getElementById('lbl-final-level');
        const bestEl = document.getElementById('lbl-best-score');
        const recordEl = document.getElementById('lbl-record-flag');
        if (burned) burned.textContent = heroLabel;
        if (finalScore) finalScore.textContent = this.formatScoreDisplay(score);
        if (finalDrops) finalDrops.textContent = String(drops);
        if (bestEl) bestEl.textContent = this.formatScoreDisplay(best);
        if (recordEl) {
            recordEl.textContent = isRecord ? '★ NEW LEDGER RECORD' : '';
            recordEl.style.display = isRecord ? 'block' : 'none';
        }
        const sub = modal.querySelector('.subtext');
        if (sub && demo) {
            sub.textContent = 'Demo Mode — score persisted locally as XRPL ScoreCommit cache.';
        } else if (sub) {
            sub.textContent = 'Stake fresh XRP from Xaman to mint a new Node and rejoin the grid.';
        }
        modal.style.display = 'flex';
        this.pauseAttractCycle();
        if (demo) {
            document.getElementById('btn-close-gameover').onclick = () => {
                modal.style.display = 'none';
                this.hideAttractScreen(true);
            };
        }
    }

    closeBurnedSession() {
        const modal = document.getElementById('gameover-modal');
        if (modal) modal.style.display = 'none';
        this.hideAttractScreen(true);
        this.btnConnect.innerHTML = "<i class='fa-solid fa-qrcode'></i> Mint Node · Xaman";
        this.btnConnect.classList.replace('btn-danger', 'btn-primary');
        this.btnConnect.style.opacity = "1";
        this.btnConnect.disabled = false;
        this.isConnected = false;
        this.walletAddressEl.textContent = "Xaman Disconnected";
        document.querySelector('.status-indicator').className = "status-indicator disconnected";
        this.btnStartRun.innerHTML = `<i class="fa-solid fa-bolt"></i> Stake ${XRPL.ENTRY_STAKE} XRP · Boot Node`;
        this.btnStartRun.className = "btn btn-success";
        this.btnStartRun.disabled = true;
        this.btnSessionKeys.disabled = true;
        this.valEthBalance.textContent = "0.000000";
        this.refreshScoreUI();
    }

    resetGameState() {
        this.gameActive = false;
        this.btnClaimExit.disabled = true;
        this.btnStartRun.disabled = false;
        
        if (window.gameEngine) {
            window.gameEngine.stopGame();
        }
        this.hideAttractScreen(true);
    }

    updateInventoryUI() {
        const slotsEl = document.getElementById('inventory-slots');
        if (!slotsEl) return;
        slotsEl.innerHTML = '';
        
        const itemsInfo = {
            1: { name: "Ripple Shard", icon: "fa-gem", class: "equipped" },
            2: { name: "Hook Glyph", icon: "fa-bezier-curve", class: "equipped" },
            3: { name: "AMM Prism", icon: "fa-cubes", class: "equipped" },
            4: { name: "Validator Crest", icon: "fa-award", class: "equipped" },
            5: { name: "Consensus Orb", icon: "fa-circle-nodes", class: "equipped" }
        };
        const order = [1, 2, 3, 4, 5];
        const owned = new Set(this.inventory);

        order.forEach((itemId) => {
            const slot = document.createElement('div');
            const item = itemsInfo[itemId];
            if (owned.has(itemId)) {
                slot.className = `slot ${item.class}`;
                slot.title = item.name;
                slot.innerHTML = `<i class="fa-solid ${item.icon}"></i>`;
            } else {
                slot.className = "slot empty";
                slot.title = item.name;
                slot.innerHTML = `<i class="fa-solid ${item.icon}"></i>`;
            }
            slotsEl.appendChild(slot);
        });
    }

    toggleBypassMode(checked) {
        this.isBypassMode = checked;
        if (window.retroAudio) window.retroAudio.playClick();
        
        if (checked) {
            this.log("Demo Mode: XRPL/Xaman bypassed for local playtesting.", "alert");
            if (this.btnStartRun) {
                this.btnStartRun.disabled = false;
                this.btnStartRun.innerHTML = "<i class='fa-solid fa-play'></i> Demo Boot";
                this.btnStartRun.className = "btn btn-success";
            }
            
            this.unlockedPalettes.green = true;
            this.unlockedPalettes.pico = true;
            this.updatePaletteButtonsUI();
            this.refreshScoreUI();
        } else {
            this.log("XRPL Mode: connect Xaman and stake XRP to play.", "system");
            const label = `<i class="fa-solid fa-bolt"></i> Stake ${XRPL.ENTRY_STAKE} XRP · Boot Node`;
            if (this.btnStartRun) {
                this.btnStartRun.disabled = !this.isConnected || this.gameActive;
                this.btnStartRun.innerHTML = label;
                this.btnStartRun.className = "btn btn-success";
            }
            
            this.unlockedPalettes.green = false;
            this.unlockedPalettes.pico = false;
            if (this.currentPalette !== 'classic') {
                this.currentPalette = 'classic';
                if (window.gameEngine) window.gameEngine.setPalette('classic');
            }
            this.updatePaletteButtonsUI();
        }
    }

    selectPalette(name) {
        if (window.retroAudio) window.retroAudio.playClick();
        
        if (this.unlockedPalettes[name]) {
            this.currentPalette = name;
            this.updatePaletteButtonsUI();
            this.log(`Node skin: ${name.toUpperCase()}`, "system");
            if (window.gameEngine) window.gameEngine.setPalette(name);
        } else {
            if (!this.isConnected && !this.isBypassMode) {
                this.log("Connect Xaman first to buy skins with XRP.", "alert");
                return;
            }
            
            const cost = XRPL.SKIN_COST;
            if (this.ethBalance < cost) {
                this.log(`Need ${cost} XRP in Xaman for this skin.`, "alert");
                return;
            }
            
            this.log(`Buying skin ${name.toUpperCase()} for ${cost} XRP...`, 'system');
            
            setTimeout(() => {
                this.debitXrp(cost);
                this.unlockedPalettes[name] = true;
                this.currentPalette = name;
                this.updatePaletteButtonsUI();
                this.fundBagsFromSkin(cost);
                
                const { hash, block } = this.getNewTxHash();
                this.log(`NFTokenAcceptOffer (skin) · ledger ${block} · ${hash.slice(0, 14)}...`, 'tx');
                this.log(`Skin ${name.toUpperCase()} unlocked · revenue fuels jackpot/milestones/dev.`, 'event');
                
                if (window.gameEngine) window.gameEngine.setPalette(name);
            }, 1000);
        }
    }

    updatePaletteButtonsUI() {
        const updateBtn = (btn, name, label) => {
            if (!btn) return;
            btn.className = "btn-palette";
            if (this.currentPalette === name) btn.classList.add("active");
            
            if (this.unlockedPalettes[name]) {
                btn.classList.remove("locked");
                btn.innerHTML = `${label} <span class="badge-free">Owned</span>`;
            } else {
                btn.classList.add("locked");
                btn.innerHTML = `${label} <span class="badge-price">${XRPL.SKIN_COST} XRP</span>`;
            }
        };

        updateBtn(this.btnPaletteClassic, "classic", "Ledger");
        updateBtn(this.btnPaletteGreen, "green", "Mainnet");
        updateBtn(this.btnPalettePico, "pico", "Devnet");
    }
}

window.web3Simulator = new Web3Simulator();
