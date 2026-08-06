/**
 * XRPL ledger layer for Leak Runner (blockchain.js)
 *
 * Two modes, one interface:
 *   - sim  (default): local simulator — virtual balance, fake hashes,
 *     localStorage economy. Safe for demos and judges without a wallet.
 *   - live: real rails — Xaman sign-in (PKCE), real stake Payment to the
 *     operator, server-authoritative accrual, real settle Payment + on-ledger
 *     ScoreCommit memo. Enabled via xrpl-config.js + xrpl-client.js.
 */

const REPO_URL = 'https://github.com/CuevazaArt/ascii-crawler-web3';
const REPO_LABEL = 'github.com/CuevazaArt/ascii-crawler-web3';

const XRPL = {
    ENTRY_STAKE: 0.5,        // one arcade coin (minimum participation)
    COIN_XRP: 0.5,           // each Stake press adds one coin
    MAX_STAKE_COINS: 10,     // max stacked coin-ins before boot
    DROP_REWARD: 0.0005,     // accrued in-channel; settled at Claim/Exit
    EXPLOIT_SLASH: 0.01,
    SKIN_COST: 1,
    START_BALANCE: 12.5,
    SCORE_BOARD_MAX: 10,
    // Stake split — prize fuel + thin ops; unused earn recycles to player pools
    STAKE_SPLIT: {
        earn: 0.70,       // reclaimable by skill this run
        jackpot: 0.08,    // epoch #1–#3 bag
        topN: 0.04,       // top-5 epoch bag
        milestones: 0.03, // first-to-hit hitos
        dev: 0.10,        // ops / treasury (only operational cut)
        reserve: 0.05     // rare skill boosts (1.1×) for deep runs
    },
    // Unpaid earn-escrow on Claim/Exit → participatory prize pools (+ ops)
    RECYCLE_SPLIT: {
        jackpot: 0.50,
        topN: 0.25,
        milestones: 0.15,
        dev: 0.10
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
        this.xrpBalance = 0;
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
        this._pendingMoves = 0;
        this.sessionXrpEarned = 0;
        this.sessionPendingEarn = 0; // channel accrual — settle at end
        this.sessionEarnEscrow = 0;  // 70% of this run's stake
        this.sessionStake = 0;       // total coin-in for the active / pending run
        this.participationCoins = 0; // stacked arcade coins before boot
        this.runStartedAt = 0;       // ms timestamp when the active run booted
        this.runSlashCount = 0;      // audit slashes this run
        this.lastRunRecap = null;    // shown in lobby between instances
        this._coinInCooldown = 0;
        this.personalBest = 0;
        this.scoreboard = this.loadScoreboard();
        this.economy = this.loadEconomy();
        this._bannerTimer = null;
        this._bannerIndex = 0;
        this._attractTimer = null;
        this._attractVisible = false;
        this._attractIdleMs = 36000;  // lobby idle before scores takeover (3× prior 12s)
        this._attractShowMs = 21000;  // scores screen duration (3× prior 7s)

        // Live XRPL rails (real Xaman + operator API) — inert in sim mode
        this.liveRun = null;          // { runId, token } while a live run is active
        this._liveEvents = [];        // queued accrual events → /api/run/events
        this._liveFlushTimer = null;
        this._liveEconomyTimer = null;

        this.walletInfo = document.getElementById('wallet-info');
        this.walletAddressEl = document.querySelector('.wallet-address');
        this.indicatorEl = document.querySelector('.status-indicator');
        this.btnConnect = document.getElementById('btn-connect');
        this.btnDisconnect = document.getElementById('btn-disconnect');
        this.btnStartRun = document.getElementById('btn-start-run');
        this.btnClaimExit = document.getElementById('btn-claim-exit');
        this.btnSessionKeys = document.getElementById('btn-session-keys');
        this.logsContainer = document.getElementById('logs-container');

        this.valXrpBalance = document.getElementById('val-xrp-balance');
        this.valHeaderXrp = document.getElementById('val-header-xrp');
        this.walletBalanceChip = document.getElementById('wallet-balance-chip');
        this.balanceVisible = this.loadBalanceVisibility();
        this.valHeroNft = document.getElementById('val-hero-nft');
        this.valHeroClass = document.getElementById('val-hero-class');
        this.valBestScore = document.getElementById('val-best-score');
        this.leaderboardEl = document.getElementById('score-leaderboard');
        this.sessionKeyBadge = document.getElementById('session-key-badge');

        this.btnPaletteClassic = document.getElementById('btn-palette-classic');
        this.btnPaletteGreen = document.getElementById('btn-palette-green');
        this.btnPalettePico = document.getElementById('btn-palette-pico');

        this.setupEventListeners();
        this.ensureEpoch();
        this.refreshScoreUI();
        this.refreshEconomyUI();
        this.startBannerCycle();
        this.startAttractCycle();
        this.initLiveMode();
        this.syncApiPanelLink();
        this.refreshChannelButton();
        this.refreshVdbHint();
        this.refreshStakeButtonLabel();
        this.refreshCoinAdjustButtons();
        this.refreshPlayGateUI();
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
        if (this.isLiveMode()) return; // epochs & prize bags are server-authoritative in live mode
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
        if (this.isLiveMode()) return;
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
        window.gameEngine?.updateStakeTicker?.();
        this.refreshVdbHint();
        if (this.isLiveMode() && this.liveRun) this.queueLiveEvent(amount, label);
        // Quiet channel: only occasional proof log (demo-friendly, not spam)
        this._pendingMoves = (this._pendingMoves || 0) + 1;
        if (this._pendingMoves >= 12 && this.hasSessionKeys) {
            this._pendingMoves = 0;
            const { block } = this.getNewTxHash();
            this.log(`ChannelClaim batch · pending ${this.sessionPendingEarn.toFixed(4)} XRP · ledger ${block}`, 'zk');
        } else if (!this.hasSessionKeys && label) {
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
        const stake = this.sessionStake || XRPL.ENTRY_STAKE;
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
        // Unpaid earn-escrow → prize pools (legit players); thin ops cut only
        const earned = Math.min(this.sessionPendingEarn, escrow);
        const unusedEscrow = this.roundXrp(Math.max(0, escrow - earned));
        if (unusedEscrow > 0) {
            const s = XRPL.RECYCLE_SPLIT;
            this.economy.bags.jackpot = this.roundXrp(this.economy.bags.jackpot + unusedEscrow * s.jackpot);
            this.economy.bags.topN = this.roundXrp(this.economy.bags.topN + unusedEscrow * s.topN);
            this.economy.bags.milestones = this.roundXrp(this.economy.bags.milestones + unusedEscrow * s.milestones);
            this.economy.bags.dev = this.roundXrp(this.economy.bags.dev + unusedEscrow * s.dev);
            this.economy.houseProfit = this.roundXrp(this.economy.houseProfit + unusedEscrow * s.dev);
            this.log(
                `Recycle · unpaid escrow ${unusedEscrow.toFixed(4)} XRP → jackpot/topN/milestones`
                + ` (+${(s.dev * 100).toFixed(0)}% ops).`,
                'zk'
            );
        }

        if (due > 0) {
            this.creditXrp(due);
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
            if (board[i].account === this.getScoreAccountKey()) this.creditXrp(amt);
        });
        // 15% of jackpot stays as seed
        this.economy.bags.jackpot = this.roundXrp(jackpot - paidJ);

        const topCount = Math.min(5, board.length);
        if (topCount && topN > 0) {
            const each = this.roundXrp(topN / topCount);
            for (let i = 0; i < topCount; i++) {
                this.log(`Top-N share → ${board[i].account} · ${each.toFixed(4)} XRP`, 'event');
                if (board[i].account === this.getScoreAccountKey()) this.creditXrp(each);
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
        // Do not call refreshEconomyUI() here — ensureEpoch() is mid-rollover and
        // refreshEconomyUI → ensureEpoch would recurse until the stack blows.
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
            { id: 'drops_50', ok: drops >= 50, label: '50 Drops harvested', rewardPct: 0.08 },
            { id: 'drops_150', ok: drops >= 150, label: '150 Drops harvested', rewardPct: 0.12 },
            { id: 'relics_3', ok: relics >= 3, label: '3 Relics vaulted', rewardPct: 0.15 },
            { id: 'score_1k', ok: score >= 1000, label: '1,000 pts scored', rewardPct: 0.10 },
            { id: 'score_3k', ok: score >= 3000, label: '3,000 pts scored', rewardPct: 0.18 },
            { id: 'sector_3', ok: level >= 3, label: 'Hook Alley sealed', rewardPct: 0.20 }
        ];
        checks.forEach(m => {
            if (!m.ok || this.economy.milestonesClaimed[m.id]) return;
            const bag = this.economy.bags.milestones;
            if (bag < 0.01) return;
            const prize = this.roundXrp(bag * m.rewardPct);
            this.economy.milestonesClaimed[m.id] = { account, prize, ts: Date.now() };
            this.economy.bags.milestones = this.roundXrp(bag - prize);
            this.creditXrp(prize);
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
            const who = this.escapeHtml(this.shortAccount(h.account || h.winner || '—'));
            if (h.type === 'milestone') {
                return `<li class="hist-row"><span class="hist-tag">HIT</span> ${this.escapeHtml(h.label)} · ${who} · +${(h.prize || 0).toFixed(3)}</li>`;
            }
            if (h.type === 'epoch') {
                return `<li class="hist-row"><span class="hist-tag">EPOCH</span> #${h.epochId} winner ${who} · ${h.topScore || 0} pts</li>`;
            }
            if (h.type === 'stake') {
                return `<li class="hist-row"><span class="hist-tag">STAKE</span> ${who} · ${(h.stake || 0).toFixed(2)} XRP staked</li>`;
            }
            if (h.type === 'alert') {
                return `<li class="hist-row"><span class="hist-tag">OPS</span> ${this.escapeHtml(h.label || 'operator notice')}</li>`;
            }
            const d = new Date(h.ts).toLocaleDateString();
            return `<li class="hist-row"><span class="hist-tag">RUN</span> ${d} · ${who} · ${this.formatScoreDisplay(h.score || 0)} pts</li>`;
        }).join('');
    }

    // ——— Start-screen cycling banner (scores + purpose / ledger tips) ———

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
                kicker: 'PRIZE BAGS',
                title: `${total.toFixed(2)} XRP`,
                body: `Jackpot ${maxTier} → Epoch #${this.economy.epochId} · seals ${new Date(this.economy.epochEnds).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · demo bags unless live`
            },
            {
                kind: 'scoretable',
                kicker: 'SECURITHON',
                title: 'SCORE TABLE',
                maxTier
            },
            {
                kind: 'ad',
                kicker: 'EXPLOIT SWARM',
                title: 'The Four Leaks',
                body: 'Bitwaddle · Hatglide · Slipkernel · Sourceflip — Exploits that hunt Node uptime'
            },
            {
                kind: 'score',
                kicker: 'ALL-TIME BEST',
                title: top ? `${this.formatScoreDisplay(top.score)} pts` : '—',
                body: top ? `${top.account} holds the vault record` : 'Mint the first ScoreCommit on this ledger'
            },
            {
                kind: 'score',
                kicker: `EPOCH #${this.economy.epochId}`,
                title: epochTop ? `${this.formatScoreDisplay(epochTop.score)} pts` : 'Open field',
                body: epochTop ? `${epochTop.account} wears the epoch crown` : 'Boot a Node to claim this epoch'
            },
            {
                kind: 'score',
                kicker: 'TODAY',
                title: dayTop ? `${this.formatScoreDisplay(dayTop.score)} pts` : 'No runs yet',
                body: dayTop ? `${dayTop.account} · daily high` : 'Daily board resets at UTC midnight'
            },
            {
                kind: 'ad',
                kicker: 'THE GRID',
                title: 'Leak Runner',
                body: 'Boot a Node on the Securithon Grid · harvest Drops · seize Relics · slash Exploits before they slash you'
            },
            {
                kind: 'ad',
                kicker: 'SETTLE ON',
                title: 'XRP Ledger',
                body: 'Payment Channels · micropayouts · Xaman — every run stakes real XRP on Testnet; skill settles on-chain, spam does not'
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
                        <li><i class="st-icon st-drop" title="Drop"></i><span class="st-dots"></span><span class="st-pts">DROP 10</span></li>
                        <li><i class="st-icon st-cert" title="Audit Cert"></i><span class="st-dots"></span><span class="st-pts">CERT 50</span></li>
                        <li><i class="st-icon st-slash" title="Exploit slash"></i><span class="st-dots"></span><span class="st-pts">SLASH 200</span></li>
                        <li><i class="st-icon st-sector" title="Sector seal"></i><span class="st-dots"></span><span class="st-pts">SECTOR 500</span></li>
                    </ul>
                    <ul class="scoretable-col">
                        <li><i class="st-icon st-relic1" title="Mist Shard"></i><span class="st-dots"></span><span class="st-pts">MIST 100</span></li>
                        <li><i class="st-icon st-relic2" title="Hook Sigil"></i><span class="st-dots"></span><span class="st-pts">SIGIL 300</span></li>
                        <li><i class="st-icon st-relic3" title="Liquidity Prism"></i><span class="st-dots"></span><span class="st-pts">PRISM 500</span></li>
                        <li><i class="st-icon st-mystery" title="Beacon / Finality"></i><span class="st-dots"></span><span class="st-pts st-mystery-pts">DEEP RELIC</span></li>
                    </ul>
                </div>
                <p class="scoretable-foot">MAX TIER #1 · ${maxTier} XRP · © 2026 LEAK RUNNER</p>
                <p class="scoretable-disclaimer">EXPLOITS: BITWADDLE · HATGLIDE · SLIPKERNEL · SOURCEFLIP · <a href="docs/legal.html" target="_blank" rel="noopener noreferrer">Legal · ToS</a></p>
                <p class="scoretable-repo"><a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">${REPO_LABEL}</a></p>
            </article>
        `;
    }

    advanceBannerSlide(delta = 1) {
        const slides = this.buildBannerSlides();
        if (!slides.length) return;
        const n = slides.length;
        this._bannerIndex = ((this._bannerIndex + delta) % n + n) % n;
        this.refreshBannerSlides();
        this.resetBannerCycleTimer();
    }

    resetBannerCycleTimer() {
        if (this._bannerTimer) clearInterval(this._bannerTimer);
        this._bannerTimer = setInterval(() => {
            const prompt = document.getElementById('start-prompt');
            if (prompt && prompt.style.display === 'none') return;
            if (this._attractVisible) return;
            const slides = this.buildBannerSlides();
            if (!slides.length) return;
            this._bannerIndex = (this._bannerIndex + 1) % slides.length;
            this.refreshBannerSlides();
        }, 4500);
    }

    refreshBannerSlides() {
        const track = document.getElementById('start-banner-track');
        if (!track) return;
        const slides = this.buildBannerSlides();
        const banner = document.getElementById('start-banner');
        const active = slides[this._bannerIndex % slides.length];
        if (banner) {
            banner.classList.toggle('tall', active?.kind === 'scoretable');
            banner.title = 'Click to next slide';
            banner.setAttribute('role', 'button');
            banner.setAttribute('tabindex', '0');
            banner.setAttribute('aria-label', 'Banner carousel — click or press Enter for next slide');
            if (!banner._bannerClickBound) {
                banner._bannerClickBound = true;
                banner.addEventListener('click', (e) => {
                    if (e.target.closest('a, button, .banner-dot')) return;
                    e.preventDefault();
                    this.advanceBannerSlide(1);
                });
                banner.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.advanceBannerSlide(1);
                    }
                });
            }
        }

        track.innerHTML = slides.map((s, i) => {
            const on = i === this._bannerIndex % slides.length;
            if (s.kind === 'scoretable') return this.renderScoreTableSlide(on, s.maxTier);
            return `
            <article class="banner-slide ${s.kind}${on ? ' active' : ''}" data-i="${i}">
                <span class="banner-kicker">${this.escapeHtml(s.kicker)}</span>
                <h3 class="banner-title">${this.escapeHtml(s.title)}</h3>
                <p class="banner-body">${this.escapeHtml(s.body)}</p>
            </article>`;
        }).join('');
        const dots = document.getElementById('start-banner-dots');
        if (dots) {
            dots.innerHTML = slides.map((_, i) =>
                `<button type="button" class="banner-dot${i === this._bannerIndex % slides.length ? ' active' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"></button>`
            ).join('');
            dots.querySelectorAll('.banner-dot').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._bannerIndex = Number(btn.dataset.i) || 0;
                    this.refreshBannerSlides();
                    this.resetBannerCycleTimer();
                });
            });
        }
    }

    startBannerCycle() {
        this.refreshBannerSlides();
        this.resetBannerCycleTimer();
    }

    // ——— Full-lobby attract: arcade TOP 5 while waiting for a player ———

    padScore(n) {
        const fmt = typeof formatScoreText === 'function' ? formatScoreText : null;
        if (fmt) return fmt(n, { pad: 6 });
        return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(6, '0').slice(0, 12);
    }

    attractName(account) {
        if (typeof formatScoreLabel === 'function') {
            return formatScoreLabel(String(account || 'NODE').replace(/^r/, ''));
        }
        const raw = String(account || 'NODE').replace(/^r/, '').toUpperCase();
        const alnum = raw.replace(/[^A-Z0-9]/g, '');
        return (alnum || 'NODE').slice(0, 12);
    }

    formatScoreDisplay(n) {
        if (typeof formatScoreText === 'function') return formatScoreText(n);
        return String(Math.max(0, Math.floor(Number(n) || 0))).slice(0, 12);
    }

    buildAttractRows() {
        // Top 4 from ledger / fillers; last visible credit slot reserved for creator nick
        const board = this.scoreboard.board.slice(0, 4);
        const placeholders = [
            { score: 50000, account: 'NODEZERO', drops: 240, epoch: 1 },
            { score: 42000, account: 'VAULTKIN', drops: 210, epoch: 1 },
            { score: 35000, account: 'LEAKOPS', drops: 180, epoch: 1 },
            { score: 28000, account: 'GRIDFOX', drops: 150, epoch: 1 }
        ];
        const credit = {
            score: 13370,
            account: 'CUEVAZAART',
            drops: 77,
            epoch: this.economy?.epochId ?? 1
        };
        const rows = [];
        for (let i = 0; i < 4; i++) {
            const src = board[i] || placeholders[i];
            rows.push({
                score: src.score,
                name: this.attractName(src.account),
                drops: src.drops ?? placeholders[i].drops,
                epoch: src.epoch ?? this.economy?.epochId ?? 1
            });
        }
        rows.push({
            score: credit.score,
            name: this.attractName(credit.account),
            drops: credit.drops,
            epoch: credit.epoch
        });
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
                <td>${this.escapeHtml(r.name)}</td>
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
            el.addEventListener('click', (e) => {
                if (e.target.closest('a')) return; // keep GitHub / legal links usable
                this.hideAttractScreen(true);
            });
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
                <span class="lb-addr">${this.escapeHtml(row.account)}</span>
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
            level: g?.level ?? 1,
            slashes: this.runSlashCount || 0
        };
    }

    beginRunSession() {
        this.runStartedAt = Date.now();
        this.runSlashCount = 0;
    }

    formatRunDuration(ms) {
        const sec = Math.max(0, Math.floor(Number(ms) / 1000));
        const min = Math.floor(sec / 60);
        const rem = sec % 60;
        return min > 0 ? `${min}m ${rem}s` : `${rem}s`;
    }

    finishRunRecap({ exit, stats, payout, stake, demo }) {
        const paidIn = this.roundXrp(stake ?? this.sessionStake ?? XRPL.ENTRY_STAKE);
        const received = this.roundXrp(payout ?? this.sessionXrpEarned ?? 0);
        const net = this.roundXrp(received - paidIn);
        const durationMs = this.runStartedAt ? Date.now() - this.runStartedAt : 0;
        const recap = {
            exit: exit || 'vdb',
            demo: false,
            stake: paidIn,
            payout: received,
            net,
            durationMs,
            duration: this.formatRunDuration(durationMs),
            score: stats?.score ?? 0,
            drops: stats?.drops ?? 0,
            level: stats?.level ?? 1,
            relics: stats?.relics ?? 0,
            slashes: stats?.slashes ?? this.runSlashCount ?? 0,
            at: Date.now()
        };
        this.lastRunRecap = recap;
        this.runStartedAt = 0;
        if (window.gameEngine?.showRunRecap) window.gameEngine.showRunRecap(recap);
        return recap;
    }

    setupEventListeners() {
        if (this.btnConnect) this.btnConnect.addEventListener('click', () => this.connectWallet());
        if (this.btnDisconnect) this.btnDisconnect.addEventListener('click', () => this.disconnectWallet());
        const balToggles = [
            document.getElementById('btn-toggle-balance'),
            document.getElementById('btn-toggle-balance-side')
        ].filter(Boolean);
        balToggles.forEach((btn) => btn.addEventListener('click', () => this.toggleBalanceVisibility()));
        this.applyBalanceVisibility();
        if (this.btnSessionKeys) this.btnSessionKeys.addEventListener('click', () => this.toggleSessionKeys());
        if (this.btnStartRun) this.btnStartRun.addEventListener('click', () => this.insertCoinTransaction());
        if (this.btnClaimExit) this.btnClaimExit.addEventListener('click', () => this.cashOutTransaction());
        document.querySelectorAll('[data-stake-add]').forEach((btn) => {
            btn.addEventListener('click', () => this.onStakeAdjustClick(1));
        });
        document.querySelectorAll('[data-stake-remove]').forEach((btn) => {
            btn.addEventListener('click', () => this.onStakeAdjustClick(-1));
        });
        const btnStakeConfirm = document.getElementById('btn-stake-confirm');
        const btnStakeCancel = document.getElementById('btn-stake-cancel');
        if (btnStakeConfirm) btnStakeConfirm.addEventListener('click', () => this.acceptStakeConfirm());
        if (btnStakeCancel) btnStakeCancel.addEventListener('click', () => this.cancelStakeConfirm());
        const stakeModal = document.getElementById('stake-confirm-modal');
        if (stakeModal) {
            stakeModal.addEventListener('click', (e) => {
                if (e.target === stakeModal) this.cancelStakeConfirm();
            });
        }
        
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
        const btnFixWallet = document.getElementById('btn-fix-wallet');
        if (btnFixWallet) btnFixWallet.addEventListener('click', () => this.switchToPlayerWallet());
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
        try { localStorage.setItem('leakrunner_tos_v2', 'accepted'); } catch (_) {}
        if (window.retroAudio) window.retroAudio.playClick();
        this.closeTermsModal();
        this.log('Terms accepted — opening Xaman sign-in…', 'event');
        this.performXamanConnect();
    }

    /** Escape untrusted text before it hits innerHTML (accounts, labels, device ids). */
    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    log(message, type = 'system') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        
        let prefix = "";
        if (type === 'tx') prefix = "<i class='fa-solid fa-water'></i> [XRPL] ";
        else if (type === 'zk') prefix = "<i class='fa-solid fa-fingerprint'></i> [Memo] ";
        else if (type === 'event') prefix = "<i class='fa-solid fa-circle-check'></i> [Event] ";
        else if (type === 'alert') prefix = "<i class='fa-solid fa-triangle-exclamation'></i> [Alert] ";
        
        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `<span style="color: #666">[${timestamp}]</span> ${prefix}${this.escapeHtml(message)}`;
        this.logsContainer.appendChild(entry);
        this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    }

    /** Like log(), but appends a safe external explorer link. */
    logTx(message, url) {
        const entry = document.createElement('div');
        entry.className = 'log-entry tx';
        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `<span style="color: #666">[${timestamp}]</span> <i class='fa-solid fa-water'></i> [XRPL] ${this.escapeHtml(message)}`;
        if (url) {
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'tx-link';
            a.textContent = 'explorer ↗';
            entry.appendChild(a);
        }
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

    creditXrp(amount) {
        this.xrpBalance = this.roundXrp(this.xrpBalance + amount);
        this.renderBalance();
    }

    debitXrp(amount) {
        this.xrpBalance = Math.round((this.xrpBalance - amount) * 1e9) / 1e9;
        this.renderBalance();
    }

    loadBalanceVisibility() {
        try {
            return localStorage.getItem('lr-bal-visible') !== '0';
        } catch (_) {
            return true;
        }
    }

    saveBalanceVisibility() {
        try {
            localStorage.setItem('lr-bal-visible', this.balanceVisible ? '1' : '0');
        } catch (_) { /* ignore */ }
    }

    toggleBalanceVisibility() {
        this.balanceVisible = !this.balanceVisible;
        this.saveBalanceVisibility();
        this.applyBalanceVisibility();
        if (window.retroAudio) window.retroAudio.playClick();
    }

    applyBalanceVisibility() {
        const vis = this.balanceVisible ? '1' : '0';
        if (this.valXrpBalance) this.valXrpBalance.dataset.visible = vis;
        if (this.valHeaderXrp) this.valHeaderXrp.dataset.visible = vis;
        document.querySelectorAll('#btn-toggle-balance, #btn-toggle-balance-side').forEach((btn) => {
            const icon = btn.querySelector('i');
            if (icon) icon.className = this.balanceVisible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
            btn.setAttribute('aria-pressed', this.balanceVisible ? 'true' : 'false');
            btn.title = this.balanceVisible ? 'Hide balance' : 'Show balance';
        });
    }

    renderBalance() {
        const text = Number(this.xrpBalance || 0).toFixed(6);
        if (this.valXrpBalance) this.valXrpBalance.textContent = text;
        if (this.valHeaderXrp) this.valHeaderXrp.textContent = `${text} XRP`;
        this.applyBalanceVisibility();
    }

    setWalletChrome({ connected, addressLabel }) {
        if (this.indicatorEl) {
            this.indicatorEl.className = connected
                ? 'status-indicator connected'
                : 'status-indicator disconnected';
        }
        if (this.walletAddressEl) {
            this.walletAddressEl.textContent = connected
                ? (addressLabel || this.shortAccount(this.walletAddress))
                : 'Xaman Disconnected';
        }
        if (this.walletBalanceChip) this.walletBalanceChip.hidden = !connected;
        if (this.btnDisconnect) this.btnDisconnect.hidden = !connected;
        if (this.btnConnect) {
            if (connected) {
                this.btnConnect.innerHTML = "<i class='fa-solid fa-check'></i> Xaman Linked";
                this.btnConnect.classList.replace('btn-primary', 'btn-danger');
                this.btnConnect.style.opacity = '0.75';
                this.btnConnect.disabled = true;
                this.btnConnect.title = 'Disconnect first to link another wallet';
            } else {
                this.btnConnect.innerHTML = "<i class='fa-solid fa-qrcode'></i> Connect Xaman";
                this.btnConnect.classList.remove('btn-danger');
                this.btnConnect.classList.add('btn-primary');
                this.btnConnect.style.opacity = '1';
                this.btnConnect.disabled = false;
                this.btnConnect.title = '';
            }
        }
    }

    connectWallet() {
        if (this.isConnected) return;
        if (window.retroAudio) window.retroAudio.playClick();
        this.openTermsModal();
    }

    /**
     * Sign out of Xaman / clear the sim wallet so another account can be linked.
     * Blocked while a live run is in progress (stake already paid).
     */
    async disconnectWallet() {
        if (!this.isConnected) return;
        if (this.gameActive || this.liveRun) {
            this.log('Finish or settle the current run before disconnecting the wallet.', 'alert');
            try { window.alert('Finish or settle the current run before disconnecting.'); } catch (_) {}
            return;
        }
        if (window.retroAudio) window.retroAudio.playClick();

        if (this.isLiveMode() && window.xrplLive) {
            try { await window.xrplLive.logout(); } catch (_) { /* still clear local UI */ }
        } else {
            try { localStorage.removeItem('leakrunner_xaman_addr'); } catch (_) {}
        }

        this.isConnected = false;
        this.walletAddress = null;
        this.xrpBalance = 0;
        this.activeHeroId = null;
        this.hasSessionKeys = false;
        this.liveRun = null;
        this._liveEvents = [];

        this.setWalletChrome({ connected: false });
        this.renderBalance();
        if (this.valHeroNft) this.valHeroNft.textContent = 'None';
        if (this.btnStartRun) {
            this.refreshStakeButtonLabel();
        }
        if (this.btnSessionKeys) this.btnSessionKeys.disabled = true;
        if (this.btnClaimExit) this.btnClaimExit.disabled = true;
        this.refreshScoreUI();
        this.refreshPlayGateUI();
        this.log('Wallet disconnected. Connect Xaman again to link another account.', 'system');
    }

    performXamanConnect() {
        if (this.isConnected) return;
        if (this.isLiveMode()) {
            this.performLiveConnect();
            return;
        }

        this.log("Opening Xaman sign-in payload (wallet connect)...");
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
            this.xrpBalance = XRPL.START_BALANCE;
            this.activeHeroId = "#" + (Math.floor(Math.random() * 900) + 100);
            this.refreshScoreUI();
            const best = this.getWalletRecord().highScore;
            if (best > 0) {
                this.log(`Xaman linked · on-ledger best score ${this.formatScoreDisplay(best)} pts loaded.`, 'event');
            }
            
            this.setWalletChrome({ connected: true, addressLabel: this.walletAddress });
            this.renderBalance();
            if (this.valHeroNft) this.valHeroNft.textContent = this.activeHeroId;
            if (this.valHeroClass) this.valHeroClass.textContent = this.activeHeroSkin;

            this.btnStartRun.disabled = false;
            this.btnSessionKeys.disabled = false;
            this.refreshChannelButton();

            this.log(`Xaman connected: ${this.walletAddress}`, 'system');
            this.log(`XRPL balance: ${this.xrpBalance.toFixed(6)} XRP`, 'system');
            this.log(`Node NFT detected (XLS-20): ${this.activeHeroId}`, 'event');
            this.log("Tip: open a Payment Channel so drop rewards settle without signing every harvest.", 'zk');

            this.inventory = [];
        }, 1000);
    }

    // ═════════════ LIVE XRPL RAILS — real Xaman sign-in + operator API ═════════════

    /** Wire the game-panel API dashboard link from live config (localhost default). */
    syncApiPanelLink() {
        const btn = document.getElementById('btn-api-panel');
        if (!btn) return;
        const host = (typeof location !== 'undefined' && location.hostname) || '';
        const local = host === 'localhost' || host === '127.0.0.1';
        const configured = String(window.XRPL_LIVE_CONFIG?.apiBase || '').replace(/\/+$/, '');
        const base = configured || (local ? 'http://127.0.0.1:8787' : '');
        if (!base) {
            btn.hidden = true;
            return;
        }
        btn.href = `${base}/`;
        btn.title = `Operator API dashboard — ${base}/`;
        btn.hidden = false;
    }

    /** True when live rails are configured AND the PKCE lib loaded. */
    isLiveMode() {
        return !!(window.xrplLive && window.xrplLive.available());
    }

    initLiveMode() {
        if (window.XRPL_LIVE_CONFIG?.mode === 'live' && !this.isLiveMode()) {
            this.log('Live config detected but incomplete (API key / operator address / apiBase / Xaman CDN). Running the local simulator instead.', 'alert');
            return;
        }
        if (!this.isLiveMode()) return;

        const live = window.xrplLive;
        const label = live.networkLabel();
        const badge = document.querySelector('.web3-badge');
        if (badge) {
            badge.classList.add(live.isMainnet() ? 'live-mainnet' : 'live-testnet');
            badge.title = `Live XRPL rails — ${label}`;
            badge.innerHTML = `<span class="web3-badge-dot" aria-hidden="true"></span> XRPL ${this.escapeHtml(label)} · LIVE`;
        }
        this.log(
            `LIVE rails armed — XRPL ${label}. Stakes and payouts move ${live.isMainnet() ? 'REAL' : 'test'} XRP.`,
            live.isMainnet() ? 'alert' : 'system'
        );

        // Align client network + operator r-address with the API before any wallet work.
        live.syncWithOperator().then((rails) => {
            if (!rails.ok) {
                this.log(`Rails mismatch: ${rails.issue}`, 'alert');
                if (badge) {
                    badge.title = `Rails blocked — ${rails.issue}`;
                    badge.innerHTML = `<span class="web3-badge-dot" aria-hidden="true"></span> XRPL ${this.escapeHtml(label)} · BLOCKED`;
                }
                return;
            }
            const op = live.cfg?.operatorAddress || '';
            this.log(
                `Operator rails OK · ${rails.network || label} · vault ${this.shortAccount(op)}`,
                'system'
            );
            this.syncLiveEconomy();
            this._liveEconomyTimer = setInterval(() => {
                if (!this.gameActive) this.syncLiveEconomy({ quiet: true });
            }, 60000);

            // Silent session restore from a remembered Xaman JWT (no popup)
            live.restore().then((account) => {
                if (!account || this.isConnected) return;
                if (live.isOperatorAccount?.(account)) {
                    this.log(
                        'Saved Xaman session is the operator vault — skipped. Connect a player Testnet wallet to play.',
                        'alert'
                    );
                    live.logout?.().catch(() => {});
                    return;
                }
                this.log('Xaman session restored from previous visit.', 'event');
                this.completeLiveConnect(account);
            }).catch(() => { /* stay disconnected */ });
        });
    }

    async performLiveConnect() {
        if (this.isConnected) return;
        this.log('Opening Xaman sign-in (OAuth2 PKCE)…', 'system');
        if (this.btnConnect) this.btnConnect.disabled = true;
        try {
            const { account } = await window.xrplLive.connect();
            await this.completeLiveConnect(account);
        } catch (e) {
            this.log(`Xaman sign-in failed or cancelled: ${e?.message || e}`, 'alert');
            if (this.btnConnect) this.btnConnect.disabled = false;
        }
    }

    shortAccount(account) {
        const a = String(account || '');
        return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
    }

    async completeLiveConnect(account) {
        if (this.isConnected) return;
        this.isConnected = true;
        this.walletAddress = account;
        this.activeHeroId = '#' + account.slice(-3).toUpperCase();

        this.setWalletChrome({ connected: true, addressLabel: this.shortAccount(account) });
        if (this.valHeroNft) this.valHeroNft.textContent = this.activeHeroId;
        if (this.valHeroClass) this.valHeroClass.textContent = this.activeHeroSkin;
        if (this.btnStartRun) this.btnStartRun.disabled = false;
        if (this.btnSessionKeys) this.btnSessionKeys.disabled = false;

        this.log(`Xaman linked: ${account}`, 'system');
        const live = window.xrplLive;
        const xamanNet = live.normalizeNetwork?.(live.walletNetwork?.()) || live.walletNetwork?.();
        const expectNet = live.expectedNetwork?.() || live.networkLabel?.() || 'TESTNET';
        if (xamanNet && expectNet && xamanNet !== expectNet) {
            this.log(
                `Xaman is on ${xamanNet} but this game expects ${expectNet}. ` +
                `In Xaman: Settings → Advanced → Node → ${expectNet}. Then Disconnect and Connect again.`,
                'alert'
            );
            try {
                window.alert(
                    `Wrong network in Xaman.\n\nApp: ${xamanNet}\nGame: ${expectNet}\n\n`
                    + `Switch Xaman → Settings → Advanced → Node → ${expectNet}, then Disconnect and Connect.`
                );
            } catch (_) { /* headless */ }
        }
        if (live.isOperatorAccount?.(account)) {
            this.log(
                'Linked wallet is the operator hot wallet. Stakes are blocked — use a separate player account.',
                'alert'
            );
            try {
                window.alert(
                    'Operator hot wallet linked — you cannot play with this account.\n\n'
                    + 'Press Disconnect, then Connect Xaman with a player Testnet wallet (not the operator vault).'
                );
            } catch (_) { /* headless */ }
        }
        const best = this.getWalletRecord().highScore;
        if (best > 0) this.log(`Welcome back · personal best ${this.formatScoreDisplay(best)} pts.`, 'event');
        this.refreshScoreUI();
        await this.refreshLiveBalance({ announce: true });
        // Only auto-resume a pending stake when rails + wallet network + role align.
        try {
            live.assertStakeAllowed(account);
            await this.resumePendingStake();
        } catch (e) {
            this.log(`Live stake gated: ${e?.message || e}`, 'alert');
        }
        this.refreshPlayGateUI();
    }

    async refreshLiveBalance({ announce = false } = {}) {
        if (!this.isLiveMode() || !this.walletAddress) return;
        try {
            const info = await window.xrplLive.getAccountInfo(this.walletAddress);
            if (!info) {
                this.xrpBalance = 0;
                this.log('Account not activated on this network yet (needs the 1 XRP base reserve).', 'alert');
            } else {
                this.xrpBalance = info.balanceXrp;
                if (announce) {
                    this.log(`Ledger balance: ${this.xrpBalance.toFixed(6)} XRP · ${window.xrplLive.networkLabel()}`, 'system');
                }
            }
            this.renderBalance();
        } catch (e) {
            this.log(`Balance lookup failed: ${e?.message || e}`, 'alert');
        }
    }

    /** Map a server economy snapshot into the local render model. */
    applyLiveEconomy(data) {
        if (!data) return;
        if (data.bags) {
            this.economy.bags = {
                jackpot: Number(data.bags.jackpot) || 0,
                topN: Number(data.bags.topN) || 0,
                milestones: Number(data.bags.milestones) || 0,
                reserve: Number(data.bags.reserve) || 0,
                dev: Number(data.bags.dev) || 0
            };
        }
        if (data.epoch) {
            this.economy.epochId = data.epoch.id || this.economy.epochId;
            this.economy.epochStarted = data.epoch.startedMs || this.economy.epochStarted;
            this.economy.epochEnds = data.epoch.endsMs || this.economy.epochEnds;
            if (Array.isArray(data.epoch.board)) this.economy.epochBoard = data.epoch.board;
        }
        if (Array.isArray(data.history)) this.economy.history = data.history;
        if (Array.isArray(data.board)) {
            this.scoreboard.board = data.board.map((r) => ({
                account: r.account,
                score: r.score,
                drops: r.drops || 0,
                relics: r.relics || 0,
                ledger: r.ledger || 0,
                ts: r.ts || Date.now()
            }));
            const mine = this.walletAddress
                ? data.board.find((r) => r.account === this.walletAddress)
                : null;
            if (mine) {
                const rec = this.getWalletRecord(this.walletAddress);
                if ((mine.score || 0) > (rec.highScore || 0)) rec.highScore = mine.score;
            }
            this.saveScoreboard();
        }
        this.refreshEconomyUI();
        this.renderLeaderboard();
        this.refreshBannerSlides();
    }

    async syncLiveEconomy({ quiet = false } = {}) {
        if (!this.isLiveMode()) return;
        try {
            const data = await window.xrplLive.api('/api/leaderboard');
            this.applyLiveEconomy(data);
            if (!quiet) this.log(`Operator API synced · epoch #${this.economy.epochId} · prize bags live.`, 'system');
        } catch (e) {
            if (!quiet) this.log(`Operator API offline (${e?.message || e}) — prize data may be stale.`, 'alert');
        }
    }

    /** Live stake: intent → Xaman sign → on-ledger verify → boot run. */
    async liveInsertCoin(stakeIn) {
        if (!this.isConnected) {
            try { window.alert('Connect Xaman first.'); } catch (_) {}
            return;
        }
        if (this.gameActive) {
            try { window.alert('A run is already active — Claim & Exit or finish it first.'); } catch (_) {}
            return;
        }
        const stake = this.roundXrp(stakeIn || this.getParticipationStake());
        const live = window.xrplLive;
        try {
            if (!live.railsOk) await live.syncWithOperator();
            live.assertStakeAllowed(this.walletAddress);
        } catch (e) {
            this.blockLiveStake(e?.message || String(e));
            return;
        }
        // Refresh ledger balance before the gate (UI can be stale after reconnect)
        await this.refreshLiveBalance({ announce: false });
        // A Payment can never dip the sender below the 1 XRP base reserve
        const needed = stake + 1.01;
        if (this.xrpBalance < needed) {
            const net = live.networkLabel();
            const faucetHint = live.isMainnet()
                ? 'Fund this mainnet account, then Stake again.'
                : 'Faucet: https://xrpl.org/resources/dev-tools/xrp-faucets\nPaste YOUR linked Xaman r-address (Testnet).';
            const msg = `Need ≥ ${needed.toFixed(2)} XRP on this ${net} account (stake ${stake} + ~1 XRP base reserve).\n\nYour balance: ${this.xrpBalance.toFixed(4)} XRP.\n\nFund your wallet, then Stake again.\n\n${faucetHint}`;
            this.log(msg.replace(/\n+/g, ' '), 'alert');
            try { window.alert(msg); } catch (_) {}
            if (this.btnStartRun && !this.gameActive) this.btnStartRun.disabled = false;
            return;
        }
        if (window.retroAudio) window.retroAudio.playClick();
        this.btnStartRun.disabled = true;

        try {
            this.log(`Stake ${stake} XRP → operator vault · opening Xaman sign request…`, 'system');
            const intent = await live.api('/api/run/intent', {
                account: this.walletAddress,
                stake
            });
            const amount = Number(intent.stake) || stake;
            const { txid } = await live.signStakePayload({
                amountXrp: amount,
                intentId: intent.intentId
            });
            this.logTx(`Stake signed · ${txid.slice(0, 14)}…`, live.explorerTx(txid));

            // From here the player's XRP is on-ledger: remember the stake until
            // the backend confirms the run, so a hiccup can't strand it.
            this.savePendingStake({ intentId: intent.intentId, txHash: txid, stake: amount });

            this.log('Verifying stake on-ledger (validated Payment to operator)…', 'system');
            const start = await this.startRunWithRetry({
                account: this.walletAddress,
                intentId: intent.intentId,
                txHash: txid
            });
            this.clearPendingStake();
            this.bootLiveRun(start);
        } catch (e) {
            this.log(`Stake aborted: ${e?.message || e}`, 'alert');
            if (this.getPendingStake()) {
                this.log('Your signed stake is saved — reconnect or press Boot again to resume it.', 'system');
            }
            this.btnStartRun.disabled = false;
        }
    }

    /** Boot the game once the backend has verified the stake and issued a run. */
    bootLiveRun(start) {
        this.liveRun = { runId: start.runId, token: start.token };
        this._liveEvents = [];
        this.sessionXrpEarned = 0;
        this.sessionPendingEarn = 0;
        this.sessionStake = Number(start.stake) || this.getParticipationStake();
        this.sessionEarnEscrow = Number(start.escrow)
            || this.roundXrp(this.sessionStake * XRPL.STAKE_SPLIT.earn);
        this.participationCoins = 0;
        this.applyLiveEconomy(start.economy);
        this.log(
            `Run verified · stake ${this.sessionStake} XRP · escrow ${this.sessionEarnEscrow} XRP reclaimable by skill · settle on Claim/Exit.`,
            'event'
        );
        this.refreshLiveBalance();

        this.gameActive = true;
        this.beginRunSession();
        this.pauseAttractCycle();
        this.btnStartRun.disabled = true;
        if (this.btnClaimExit) this.btnClaimExit.disabled = false;
        this.flashPrizeBags();
        this.refreshVdbHint();
        if (window.gameEngine) window.gameEngine.startGame(this.activeHeroSkin);
    }

    /**
     * /api/run/start with retries: the stake Payment is already validated
     * on-ledger, so transient backend errors must not strand the player's XRP.
     * Definitive rejections (replayed hash, expired intent…) abort immediately.
     */
    async startRunWithRetry(payload, attempts = 3) {
        let lastErr;
        for (let i = 0; i < attempts; i++) {
            try {
                return await window.xrplLive.api('/api/run/start', payload);
            } catch (e) {
                lastErr = e;
                const msg = String(e?.message || e).toLowerCase();
                const definitive = ['already consumed', 'already used', 'expired', 'invalid', 'different account', 'not the operator']
                    .some((s) => msg.includes(s));
                if (definitive) throw e;
                if (i < attempts - 1) {
                    this.log(`Operator API hiccup (${e?.message || e}) — retrying stake verification…`, 'alert');
                    await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
                }
            }
        }
        throw lastErr;
    }

    // ——— Pending-stake safety net (signed Payment not yet turned into a run) ———

    savePendingStake(data) {
        try {
            localStorage.setItem('lr-pending-stake', JSON.stringify({
                ...data, account: this.walletAddress, ts: Date.now()
            }));
        } catch (_) { /* storage full/blocked — retry path still works in-session */ }
    }

    getPendingStake() {
        try {
            const raw = localStorage.getItem('lr-pending-stake');
            if (!raw) return null;
            const p = JSON.parse(raw);
            // Server intents expire after ~15 min; drop stale entries
            if (!p.txHash || Date.now() - (p.ts || 0) > 14 * 60 * 1000) {
                this.clearPendingStake();
                return null;
            }
            return p;
        } catch (_) {
            return null;
        }
    }

    clearPendingStake() {
        try { localStorage.removeItem('lr-pending-stake'); } catch (_) { /* noop */ }
    }

    /** On reconnect: turn a stranded signed stake into its run and boot it. */
    async resumePendingStake() {
        const p = this.getPendingStake();
        if (!p || p.account !== this.walletAddress || this.gameActive) return;
        this.logTx(`Signed stake found from a previous session · ${p.txHash.slice(0, 12)}… — resuming run.`, window.xrplLive.explorerTx(p.txHash));
        try {
            const start = await this.startRunWithRetry({
                account: p.account, intentId: p.intentId, txHash: p.txHash
            }, 2);
            this.clearPendingStake();
            this.bootLiveRun(start);
        } catch (e) {
            const msg = String(e?.message || e).toLowerCase();
            if (msg.includes('already consumed') || msg.includes('expired') || msg.includes('already used')) {
                this.clearPendingStake();
                this.log('Previous stake was already settled by the operator (auto-settle covers abandoned runs).', 'system');
            } else {
                this.log(`Could not resume the pending stake yet: ${e?.message || e}`, 'alert');
            }
        }
    }

    queueLiveEvent(amount, label) {
        if (!this.liveRun) return;
        const l = String(label || '');
        let ev;
        if (l.startsWith('drop@')) ev = { t: 'drop' };
        else if (l.startsWith('slash:')) ev = { t: 'slash', name: l.slice(6) };
        else if (l.startsWith('relic:')) ev = { t: 'relic', name: l.slice(6) };
        else ev = { t: 'other', label: l };
        ev.ts = Date.now();
        this._liveEvents.push(ev);

        if (this._liveEvents.length >= 25) {
            this.flushLiveEvents();
        } else if (!this._liveFlushTimer) {
            this._liveFlushTimer = setTimeout(() => this.flushLiveEvents(), 2000);
        }
    }

    async flushLiveEvents(final = false) {
        if (this._liveFlushTimer) {
            clearTimeout(this._liveFlushTimer);
            this._liveFlushTimer = null;
        }
        if (!this.liveRun || (!this._liveEvents.length && !final)) return;
        const g = window.gameEngine;
        // Server contract: ≤100 events per batch, ≥300 ms between batches per run
        do {
            const batch = this._liveEvents.splice(0, 100);
            try {
                await window.xrplLive.api('/api/run/events', {
                    runId: this.liveRun.runId,
                    token: this.liveRun.token,
                    events: batch,
                    snapshot: { score: g?.score ?? 0, level: g?.level ?? 1, drops: g?.dotsEaten ?? 0 }
                });
            } catch (e) {
                // Keep events for the next flush; settle carries the final snapshot anyway
                this._liveEvents = batch.concat(this._liveEvents);
                if (final) throw e;
                return;
            }
            if (this._liveEvents.length) await new Promise((r) => setTimeout(r, 350));
        } while (final && this.liveRun && this._liveEvents.length);

        if (this._liveEvents.length && !this._liveFlushTimer) {
            this._liveFlushTimer = setTimeout(() => this.flushLiveEvents(), 500);
        }
    }

    async liveSettleRequest(reason, stats) {
        try {
            await this.flushLiveEvents(true);
        } catch (_) { /* settle still carries the final stats */ }
        return window.xrplLive.api('/api/run/settle', {
            runId: this.liveRun.runId,
            token: this.liveRun.token,
            reason,
            stats
        });
    }

    handleLiveSettleResult(res, stats) {
        this.liveRun = null;
        this._liveEvents = [];
        this.sessionPendingEarn = 0;
        this.sessionEarnEscrow = 0;
        this.sessionXrpEarned = this.roundXrp(Number(res.payout) || 0);

        (res.milestones || []).forEach((m) => {
            this.log(`Milestone [${m.label}] · first claim · +${(m.prize || 0).toFixed(4)} XRP`, 'event');
        });
        if (res.deferred) {
            this.log(`Payout ${Number(res.payout).toFixed(4)} XRP queued — operator daily cap reached; it will be paid after review.`, 'alert');
        } else if (res.payout > 0 && res.txHash) {
            this.logTx(`Settle Payment · +${Number(res.payout).toFixed(4)} XRP · ${String(res.txHash).slice(0, 12)}…`, window.xrplLive.explorerTx(res.txHash));
        } else if (res.txHash) {
            this.logTx(`ScoreCommit memo inked on-ledger · ${String(res.txHash).slice(0, 12)}…`, window.xrplLive.explorerTx(res.txHash));
        } else {
            this.log('Run settled · no channel earn to claim this run.', 'system');
        }

        // Mirror the server outcome into the local wallet record
        const rec = this.getWalletRecord(this.walletAddress);
        rec.totalRuns += 1;
        rec.totalDrops += stats.drops;
        rec.lastScore = stats.score;
        if ((res.best || 0) > (rec.highScore || 0)) rec.highScore = res.best;
        rec.totalXrpEarned = this.roundXrp((rec.totalXrpEarned || 0) + this.sessionXrpEarned);
        this.saveScoreboard();
        this.personalBest = rec.highScore || 0;

        this.applyLiveEconomy(res.economy);
        this.refreshScoreUI();
        this.refreshLiveBalance();
        const pendingEl = document.getElementById('val-pending-earn');
        if (pendingEl) pendingEl.textContent = '0.0000';
    }

    async liveCashOut() {
        if (!this.gameActive || !this.liveRun) return;
        if (window.retroAudio) window.retroAudio.playClick();
        this.log('VDB — claiming settle Payment from the operator vault…', 'system');
        this.btnClaimExit.disabled = true;
        const stats = this.captureRunStats();
        try {
            const res = await this.liveSettleRequest('cashout', stats);
            const stance = this.resolveCashoutStance(stats);
            if (window.gameEngine?.lockStanceOutcome) window.gameEngine.lockStanceOutcome(stance);
            this.handleLiveSettleResult(res, stats);
            this.finishRunRecap({
                exit: stance,
                stats,
                payout: res.payout,
                stake: this.sessionStake,
                demo: false
            });
            this.log(
                `${stance === 'win' ? 'WIN via VDB' : 'VDB'} · ${res.isRecord ? 'NEW LEDGER RECORD · ' : ''}`
                + `score ${this.formatScoreDisplay(stats.score)} committed on-ledger.`,
                'event'
            );
            this.resetGameState();
        } catch (e) {
            this.log(`Settle failed: ${e?.message || e} — your run is safe, press VDB / Claim again.`, 'alert');
            this.btnClaimExit.disabled = false;
        }
    }

    async livePermadeath(stats) {
        this.gameActive = false; // freeze accrual before the async settle
        if (window.gameEngine?.lockStanceOutcome) window.gameEngine.lockStanceOutcome('lose');
        this.log('LOSE — UPTIME 0. Swarm sealed the Node. Settling scraps + ScoreCommit…', 'alert');
        let res = null;
        try {
            res = await this.liveSettleRequest('slash', stats);
            this.handleLiveSettleResult(res, stats);
            this.finishRunRecap({
                exit: 'lose',
                stats,
                payout: res?.payout ?? 0,
                stake: this.sessionStake,
                demo: false
            });
        } catch (e) {
            this.liveRun = null; // stale runs are auto-settled server-side
            this.log(`Settle failed: ${e?.message || e} — the operator will auto-settle this run.`, 'alert');
        }

        const rec = this.getWalletRecord(this.walletAddress);
        this.showGameOverModal({
            heroLabel: `Node ${this.activeHeroId}`,
            score: stats.score,
            drops: stats.drops,
            best: res?.best ?? rec.highScore ?? stats.score,
            isRecord: !!res?.isRecord,
            demo: false,
            recap: this.lastRunRecap
        });
        this.resetGameState();

        // Burned-node arcade flavor — wallet stays linked in live mode
        this.setCoinInButton({ title: 'NODE SLASHED', sub: 'Uptime 0 · NFT burned', icon: 'fa-skull', danger: true });
        this.btnStartRun.disabled = true;
        const closeBtn = document.getElementById('btn-close-gameover');
        if (closeBtn) {
            closeBtn.onclick = () => {
                const modal = document.getElementById('gameover-modal');
                if (modal) modal.style.display = 'none';
                this.hideAttractScreen(true);
                this.btnStartRun.disabled = false;
                this.refreshStakeButtonLabel();
            };
        }
    }

    // ════════════════════════ end LIVE XRPL RAILS ════════════════════════

    toggleSessionKeys() {
        if (!this.isConnected) return;
        if (window.retroAudio) window.retroAudio.playClick();
        if (this.isLiveMode()) {
            this.log('Payment Channels land post-launch. In live beta, drops batch to the operator API and settle in a single Payment at Claim/Exit.', 'system');
            return;
        }
        
        if (this.hasSessionKeys) {
            this.hasSessionKeys = false;
            if (this.sessionKeyBadge) {
                this.sessionKeyBadge.className = "session-keys-status-compact";
                this.sessionKeyBadge.innerHTML = "<i class='fa-solid fa-link-slash'></i> Channel Off";
            }
            this.refreshChannelButton();
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
                if (this.btnSessionKeys) this.btnSessionKeys.disabled = false;
                this.refreshChannelButton();

                const { hash, block } = this.getNewTxHash();
                this.log(`PaymentChannel funded · ledger ${block} · ${hash.slice(0, 12)}...`, 'tx');
                this.log("Drop harvests now stream as channel claims — consume XRP stake, earn XRP back.", 'zk');
            }, 1000);
        }
    }

    /** Live stake blocked — no free runs; player must fix wallet/rails. */
    blockLiveStake(reason) {
        const msg = `${reason}\n\nDisconnect and connect a separate player Testnet wallet with funds, then Stake again.`;
        this.log(`Stake blocked: ${reason}`, 'alert');
        try { window.alert(msg); } catch (_) {}
        this.hideStakeConfirmModal();
        if (this.btnStartRun && !this.gameActive) this.btnStartRun.disabled = false;
        this.refreshStakeButtonLabel();
    }

    getParticipationStake() {
        const coins = Math.max(1, this.participationCoins || 1);
        return this.roundXrp(coins * (XRPL.COIN_XRP || XRPL.ENTRY_STAKE));
    }

    formatActionBtn({ icon, title, sub }) {
        const subHtml = sub
            ? `<span class="btn-action-sub">${sub}</span>`
            : '';
        return `<span class="btn-action-stack"><i class="fa-solid ${icon}" aria-hidden="true"></i><span class="btn-action-copy"><span class="btn-action-title">${title}</span>${subHtml}</span></span>`;
    }

    setCoinInButton({ title = 'BOOT NODE', sub = '', icon = 'fa-coins', danger = false } = {}) {
        if (!this.btnStartRun) return;
        this.btnStartRun.className = `btn btn-action btn-coinin${danger ? ' btn-danger-state' : ''}`;
        this.btnStartRun.innerHTML = this.formatActionBtn({ icon, title, sub });
    }

    setVdbButton({ title = 'VDB · CLAIM', sub = '' } = {}) {
        if (!this.btnClaimExit) return;
        this.btnClaimExit.className = 'btn btn-action btn-vdb';
        this.btnClaimExit.innerHTML = this.formatActionBtn({ icon: 'fa-door-open', title, sub });
    }

    setChannelButton({ title = 'CHANNEL OFF', sub = 'Tap · sim accrual', icon = 'fa-link-slash', on = false } = {}) {
        if (!this.btnSessionKeys) return;
        this.btnSessionKeys.className = `btn btn-action btn-channel ${on ? 'is-on' : 'is-off'}`;
        this.btnSessionKeys.innerHTML = this.formatActionBtn({ icon, title, sub });
    }

    refreshVdbHint() {
        let sub = 'Tras boot · cobra harvest';
        if (this.gameActive) {
            const pending = Number(this.sessionPendingEarn || 0);
            sub = pending > 0
                ? `~${pending.toFixed(4)} XRP listos`
                : 'Cobra y sal vivo';
        }
        this.setVdbButton({ sub });
    }

    refreshChannelButton() {
        if (!this.btnSessionKeys) return;
        if (this.isLiveMode()) {
            this.setChannelButton({
                icon: 'fa-satellite-dish',
                title: 'LIVE RAIL',
                sub: 'Settle vía operator API',
                on: true
            });
            return;
        }
        if (this.hasSessionKeys) {
            this.setChannelButton({
                icon: 'fa-link',
                title: 'CHANNEL ON',
                sub: 'Drops batch · settle al VDB',
                on: true
            });
        } else {
            this.setChannelButton({
                icon: 'fa-link-slash',
                title: 'CHANNEL OFF',
                sub: 'Tap · abrir rail sim',
                on: false
            });
        }
    }

    /** Player-facing reason the run cannot boot (null = OK to proceed). */
    getPlayBlockReason() {
        if (this.gameActive) {
            return 'A run is already active — finish the sector or use VDB · CLAIM first.';
        }
        if (!this.isConnected) return null;
        if (this.isLiveMode() && window.xrplLive?.isOperatorAccount?.(this.walletAddress)) {
            return 'Operator hot wallet linked — Disconnect and connect a player Testnet wallet to play.';
        }
        if (this.isLiveMode() && window.xrplLive && window.xrplLive.walletNetworkMatches
            && !window.xrplLive.walletNetworkMatches()) {
            const wallet = window.xrplLive.walletNetwork?.() || '?';
            const expect = window.xrplLive.expectedNetwork?.() || 'TESTNET';
            return `Xaman is on ${wallet} but this game uses ${expect}. Switch node in Xaman, then Disconnect + Connect.`;
        }
        return null;
    }

    /** Operator / wrong-network gate — player wallet required on live rails. */
    isOperatorWalletLinked() {
        return !!(this.isLiveMode() && this.isConnected
            && window.xrplLive?.isOperatorAccount?.(this.walletAddress));
    }

    async switchToPlayerWallet() {
        this.hideStakeConfirmModal();
        this.log('Switching to a player wallet — disconnecting operator account…', 'system');
        if (this.isConnected) await this.disconnectWallet();
        this.connectWallet();
    }

    resolvePlayBlock() {
        const reason = this.getPlayBlockReason();
        if (!reason) return false;
        this.log(reason, 'alert');
        if (this.isOperatorWalletLinked()) {
            this.switchToPlayerWallet();
            return true;
        }
        try { window.alert(reason + '\n\nUse Disconnect in the header, fix Xaman network, then Connect again.'); } catch (_) {}
        return true;
    }

    refreshPlayGateUI() {
        const reason = this.getPlayBlockReason();
        const blockEl = document.getElementById('start-wallet-block');
        const msgEl = document.getElementById('start-wallet-block-msg');
        const fixBtn = document.getElementById('btn-fix-wallet');
        if (blockEl && msgEl) {
            if (reason && this.isConnected) {
                blockEl.hidden = false;
                msgEl.textContent = reason;
            } else {
                blockEl.hidden = true;
                msgEl.textContent = '';
            }
        }
        if (fixBtn) {
            fixBtn.hidden = !(reason && this.isConnected);
            fixBtn.textContent = this.isOperatorWalletLinked()
                ? 'Disconnect operator · connect player wallet'
                : 'Disconnect · fix Xaman network';
        }
        const startBtn = document.getElementById('btn-arcade-start');
        const startLabel = startBtn?.querySelector('.arcade-start-label');
        const startKey = startBtn?.querySelector('.arcade-start-key');
        if (startLabel && startKey && !this.gameActive) {
            if (reason && this.isConnected) {
                startLabel.innerHTML = this.isOperatorWalletLinked()
                    ? 'SWITCH TO PLAYER WALLET'
                    : 'FIX XAMAN NETWORK';
                startKey.textContent = 'Then START WITH XRP';
            } else {
                const stakeLabel = this.formatStakeLabel(
                    (this.participationCoins || 0) > 0 ? this.getParticipationStake() : XRPL.ENTRY_STAKE
                );
                startLabel.innerHTML = `START WITH <span id="arcade-start-stake">${stakeLabel}</span> XRP`;
                startKey.innerHTML = 'PRESS <kbd>S</kbd> · CONFIRM';
            }
        }
        if (this.btnStartRun) {
            this.btnStartRun.disabled = !!this.gameActive;
            this.btnStartRun.classList.toggle('is-play-blocked', !!(reason && this.isConnected));
            if (reason && this.isConnected && this.isOperatorWalletLinked()) {
                this.setCoinInButton({
                    title: 'SWITCH WALLET',
                    sub: 'Operator cannot play',
                    icon: 'fa-right-from-bracket'
                });
            }
        }
        if (startBtn) {
            startBtn.classList.toggle('is-play-blocked', !!(reason && this.isConnected));
        }
    }

    formatStakeLabel(stake) {
        const r = this.roundXrp(stake);
        return Number.isInteger(r) ? String(r) : r.toFixed(1);
    }

    refreshStakeButtonLabel() {
        const coins = this.participationCoins || 0;
        const stake = coins > 0 ? this.getParticipationStake() : XRPL.ENTRY_STAKE;
        const stakeLabel = this.formatStakeLabel(stake);
        const extra = coins > 1 ? ` · ${coins} coins` : '';
        if (this.btnStartRun) {
            this.setCoinInButton({
                title: 'BOOT NODE',
                sub: `Pay ${stakeLabel} XRP${extra}`,
                icon: 'fa-coins'
            });
        }
        const lobby = document.querySelector('#start-prompt .blink.text-primary');
        if (lobby && !this.gameActive) {
            lobby.textContent = coins > 0
                ? `Stake ${stakeLabel} XRP · ${coins} coin${coins > 1 ? 's' : ''} in · Boot the Node`
                : `Stake ${this.formatStakeLabel(XRPL.ENTRY_STAKE)} XRP · Boot the Node`;
        }
        const stakeEl = document.getElementById('arcade-start-stake');
        const startBtn = document.getElementById('btn-arcade-start');
        if (stakeEl) stakeEl.textContent = stakeLabel;
        if (startBtn && !this.gameActive) {
            startBtn.setAttribute('aria-label', `Start game with ${stakeLabel} XRP`);
        }
        const attractCredit = document.querySelector('.attract-credit');
        if (attractCredit && !this.gameActive) {
            attractCredit.innerHTML = `PRESS <kbd>S</kbd> · START WITH ${stakeLabel} XRP`;
        }
        this.refreshCoinAdjustButtons();
        this.refreshPlayGateUI();
    }

    /** ±0.5 from lobby, rail, or modal — updates START label and open modal preview. */
    onStakeAdjustClick(delta) {
        if (this.gameActive) return;
        const ok = delta > 0 ? this.addParticipationCoin() : this.removeParticipationCoin();
        if (!ok) return;
        const modal = document.getElementById('stake-confirm-modal');
        if (modal && modal.style.display === 'flex') {
            this.refreshStakeConfirmPreview();
        }
    }

    ensureParticipationCoins() {
        if (!this.participationCoins) this.participationCoins = 1;
    }

    /**
     * Arcade coin-in: +0.5 XRP per press (lobby / rail / modal ± buttons).
     */
    addParticipationCoin() {
        const max = XRPL.MAX_STAKE_COINS || 10;
        const now = performance.now();
        if (now - (this._coinInCooldown || 0) < 160) return false; // debounce accidental doubles
        this._coinInCooldown = now;

        if (this.participationCoins >= max) {
            this.log(`Max coin-in reached (${max} × ${XRPL.COIN_XRP} XRP). BOOT NODE, or cancel.`, 'alert');
            if (window.retroAudio) window.retroAudio.playClick();
            this.refreshCoinAdjustButtons();
            return false;
        }
        this.participationCoins = (this.participationCoins || 0) + 1;
        if (window.retroAudio) {
            if (window.retroAudio.playCoinIn) window.retroAudio.playCoinIn();
            else if (window.retroAudio.playReward) window.retroAudio.playReward();
            else window.retroAudio.playFruit();
        }
        const stake = this.getParticipationStake();
        this.log(
            `Coin-in · +${XRPL.COIN_XRP} XRP · participation now ${stake} XRP (${this.participationCoins} coin${this.participationCoins > 1 ? 's' : ''}).`,
            'event'
        );
        this.refreshStakeButtonLabel();
        this.refreshCoinAdjustButtons();
        this.flashPrizeBags();
        return true;
    }

    /** Remove one 0.5 XRP coin from the stack (floor = 0 coins · 0.5 XRP minimum entry). */
    removeParticipationCoin() {
        const now = performance.now();
        if (now - (this._coinInCooldown || 0) < 160) return false;
        this._coinInCooldown = now;

        const coins = this.participationCoins || 0;
        if (coins <= 0) {
            this.log(`Minimum stake is ${XRPL.COIN_XRP} XRP.`, 'alert');
            if (window.retroAudio) window.retroAudio.playClick();
            this.refreshCoinAdjustButtons();
            return false;
        }
        this.participationCoins = coins - 1;
        if (window.retroAudio) window.retroAudio.playClick();
        const stake = this.getParticipationStake();
        this.log(
            `Coin-out · −${XRPL.COIN_XRP} XRP · participation now ${stake} XRP (${this.participationCoins} coin${this.participationCoins > 1 ? 's' : ''}).`,
            'event'
        );
        this.refreshStakeButtonLabel();
        this.refreshCoinAdjustButtons();
        this.flashPrizeBags();
        return true;
    }

    /** Enable/disable all ±0.5 controls from the current stack size. */
    refreshCoinAdjustButtons() {
        const max = XRPL.MAX_STAKE_COINS || 10;
        const coins = this.participationCoins || 0;
        document.querySelectorAll('[data-stake-add]').forEach((btn) => {
            btn.disabled = coins >= max;
            btn.title = coins >= max
                ? `Max ${max} coins (${this.roundXrp(max * XRPL.COIN_XRP)} XRP)`
                : 'Add 0.5 XRP to stake';
        });
        document.querySelectorAll('[data-stake-remove]').forEach((btn) => {
            btn.disabled = coins <= 0;
            btn.title = coins <= 0
                ? `Minimum stake is ${XRPL.COIN_XRP} XRP`
                : 'Remove 0.5 XRP from stake';
        });
    }

    /** Refresh stake modal copy/split panel (modal may already be open). */
    refreshStakeConfirmPreview() {
        this.ensureParticipationCoins();
        const stake = this.getParticipationStake();
        const stakeLabel = this.formatStakeLabel(stake);
        const s = XRPL.STAKE_SPLIT;
        const amtEl = document.getElementById('stake-confirm-amount');
        if (amtEl) amtEl.textContent = stakeLabel;
        const panel = document.getElementById('stake-split-panel');
        if (panel) {
            const row = (label, pct, cls = '') => {
                const xrp = this.roundXrp(stake * pct);
                return `<div class="stake-split-row ${cls}">`
                    + `<span class="split-label">${label}</span>`
                    + `<span class="split-amt">${(pct * 100).toFixed(0)}% · ${xrp.toFixed(3)} XRP</span>`
                    + `</div>`;
            };
            panel.innerHTML = [
                row('Earn escrow (reclaim by skill)', s.earn, 'is-earn'),
                row('Jackpot pool (epoch #1–#3)', s.jackpot),
                row('Top-N pool (top 5)', s.topN),
                row('Milestones (first-to-hit)', s.milestones),
                row('Skill-boost reserve', s.reserve),
                row('Ops / treasury', s.dev, 'is-ops')
            ].join('');
        }
        const lead = document.getElementById('stake-confirm-lead');
        if (lead) {
            lead.textContent =
                `Arcade entry: ${stakeLabel} XRP (${this.participationCoins} coin${this.participationCoins > 1 ? 's' : ''}). `
                + `BOOT NODE starts the run. Adjust with −0.5 / +0.5.`;
        }
        const netNote = document.getElementById('stake-confirm-network-note');
        if (netNote) {
            netNote.innerHTML = this.isLiveMode()
                ? `<strong>Live rails</strong> — Xaman will ask for <strong>${stakeLabel} XRP</strong> total when you press BOOT NODE.`
                : `<strong>Simulator</strong> — virtual ${stakeLabel} XRP. BOOT NODE starts the run immediately.`;
        }
        const confirmBtn = document.getElementById('btn-stake-confirm');
        const operatorLinked = !!(this.isLiveMode()
            && window.xrplLive?.isOperatorAccount?.(this.walletAddress));
        if (confirmBtn && !operatorLinked) {
            confirmBtn.innerHTML =
                `<i class="fa-solid fa-play"></i> BOOT NODE · Pay ${stakeLabel} XRP`;
            confirmBtn.title = 'Pay the stake and start the run';
        }
        this.refreshCoinAdjustButtons();
        this.refreshStakeButtonLabel();
    }

    /** Fill + show the stake consequences modal (uses stacked participation). */
    openStakeConfirmModal() {
        const modal = document.getElementById('stake-confirm-modal');
        this.ensureParticipationCoins();
        if (!modal) {
            this.executeStakeAfterConfirm();
            return;
        }
        this.refreshStakeConfirmPreview();
        const stake = this.getParticipationStake();
        const s = XRPL.STAKE_SPLIT;
        const operatorLinked = !!(this.isLiveMode()
            && window.xrplLive?.isOperatorAccount?.(this.walletAddress));
        const lead = document.getElementById('stake-confirm-lead');
        const confirmBtn = document.getElementById('btn-stake-confirm');
        if (confirmBtn && operatorLinked) {
            confirmBtn.innerHTML =
                `<i class="fa-solid fa-right-from-bracket"></i> Disconnect operator wallet`;
            confirmBtn.title =
                'Operator hot wallet cannot play — disconnect and connect a player Testnet wallet';
        }
        if (operatorLinked && lead) {
            lead.textContent =
                `Operator wallet linked — live stake blocked. Disconnect and connect a player Testnet account with ≥ ${(stake + 1.01).toFixed(2)} XRP.`;
        }
        this.pauseAttractCycle();
        modal.style.display = 'flex';
        this.log(
            `Coin-in preview · ${this.formatStakeLabel(stake)} XRP (pay = play) → earn ${this.roundXrp(stake * s.earn)} · pools J/T/M `
            + `${this.roundXrp(stake * s.jackpot)}/${this.roundXrp(stake * s.topN)}/${this.roundXrp(stake * s.milestones)} `
            + `· unpaid harvest recycles to participants.`,
            'system'
        );
        try { document.getElementById('btn-stake-confirm')?.focus(); } catch (_) {}
    }

    hideStakeConfirmModal() {
        const modal = document.getElementById('stake-confirm-modal');
        if (modal) modal.style.display = 'none';
    }

    cancelStakeConfirm() {
        this.hideStakeConfirmModal();
        this.log(
            this.participationCoins
                ? `Modal closed — ${this.getParticipationStake()} XRP still stacked. Press Stake to add coins or reopen.`
                : 'Stake cancelled — no XRP consumed.',
            'system'
        );
        if (this.btnStartRun && !this.gameActive) this.btnStartRun.disabled = false;
        this.refreshStakeButtonLabel();
        this.hideAttractScreen(true);
    }

    acceptStakeConfirm() {
        if (!this.participationCoins) this.participationCoins = 1;
        const stake = this.getParticipationStake();
        if (this.isLiveMode() && window.xrplLive?.isOperatorAccount?.(this.walletAddress)) {
            this.hideStakeConfirmModal();
            this.switchToPlayerWallet();
            return;
        }
        this.hideStakeConfirmModal();
        this.flashPrizeBags();
        this.log(
            `Stake confirmed · ${stake} XRP · unpaid earn on Claim recycles `
            + `${((XRPL.RECYCLE_SPLIT.jackpot + XRPL.RECYCLE_SPLIT.topN + XRPL.RECYCLE_SPLIT.milestones) * 100).toFixed(0)}% `
            + `to player pools · ${(XRPL.RECYCLE_SPLIT.dev * 100).toFixed(0)}% ops.`,
            'event'
        );
        this.executeStakeAfterConfirm();
    }

    /** Brief UI pulse on prize bags so the stake consequence is visible. */
    flashPrizeBags() {
        const el = document.querySelector('.prize-bags-section')
            || document.getElementById('val-bag-jackpot')?.closest('.prize-bags-section, section, .panel');
        if (!el) return;
        el.classList.remove('flash-recycle');
        void el.offsetWidth;
        el.classList.add('flash-recycle');
        setTimeout(() => el.classList.remove('flash-recycle'), 1000);
    }

    insertCoinTransaction() {
        // Recover a stuck "gameActive" flag if the engine never actually started
        if (this.gameActive && window.gameEngine && !window.gameEngine.isActive) {
            this.gameActive = false;
            this.liveRun = null;
        }

        if (this.gameActive) {
            const tip = this.getPlayBlockReason() || 'A run is already active.';
            this.log(tip, 'alert');
            return;
        }

        if (!this.isConnected) {
            this.log('Connect Xaman first — opening wallet link…', 'system');
            this.connectWallet();
            return;
        }

        const block = this.getPlayBlockReason();
        if (block) {
            this.resolvePlayBlock();
            return;
        }

        // BOOT NODE / START open confirm — amount set via ±0.5 controls
        this.ensureParticipationCoins();
        this.openStakeConfirmModal();
    }

    /** Runs after the player accepts the stake consequences modal. */
    executeStakeAfterConfirm() {
        const stake = this.getParticipationStake();
        if (this.isLiveMode()) {
            this.liveInsertCoin(stake);
            return;
        }

        if (!this.isConnected || this.gameActive) return;
        if (this.xrpBalance < stake) {
            this.log(`Insufficient XRP. Participation requires ${stake} XRP (${this.participationCoins} coins).`, 'alert');
            return;
        }
        if (window.retroAudio) window.retroAudio.playClick();

        this.log(`Staking ${stake} XRP (consume-to-play · ${this.participationCoins} coins) · simulator…`, 'system');
        this.btnStartRun.disabled = true;

        const bootRun = () => {
            this.ensureEpoch();
            this.sessionXrpEarned = 0;
            this.sessionStake = stake;
            const parts = this.fundBagsFromStake(stake);
            this.log(
                `Stake split applied · earn ${parts.earn} · bags J/T/M ${parts.jackpot}/${parts.topN}/${parts.milestones} · ops ${parts.dev} · reserve ${parts.reserve}`,
                'zk'
            );
            this.refreshEconomyUI();
            this.flashPrizeBags();
            this.participationCoins = 0;
            this.gameActive = true;
            this.beginRunSession();
            this.pauseAttractCycle();
            if (this.btnClaimExit) this.btnClaimExit.disabled = false;
            if (this.btnStartRun) this.btnStartRun.disabled = true;
            this.refreshVdbHint();
            if (window.gameEngine) window.gameEngine.startGame(this.activeHeroSkin);
        };

        const executeRun = () => {
            this.debitXrp(stake);
            const { hash, block } = this.getNewTxHash();
            this.log(`Stake recorded · ${stake} XRP · demo ledger ${block} · ${hash.slice(0, 14)}...`, 'tx');
            this.log('Escrow locked · reclaim by skill · unpaid → prize pools on Claim/Exit.', 'event');
            bootRun();
        };

        if (this.hasSessionKeys) {
            executeRun();
        } else {
            this.log('Awaiting simulated Xaman approval for stake…', 'system');
            setTimeout(executeRun, 1200);
        }
    }

    registerMoveAndEatTransaction(x, y, ateDot) {
        if (!this.gameActive) return;
        if (!ateDot) return;
        // Accrue in Payment Channel — no per-drop Payment spam
        this.accrueChannelReward(XRPL.DROP_REWARD, `drop@${x},${y}`);
    }

    slashExploitTransaction(exploitId) {
        if (!this.gameActive) return;
        // Scream + onomatopoeia FX are played by GameEngine.slashPenguinFx
        const roster = (typeof GRID_PENGUINS !== 'undefined' && GRID_PENGUINS) || null;
        const names = roster
            ? roster.map(d => d.name)
            : ['Bitwaddle', 'Hatglide', 'Slipkernel', 'Sourceflip'];
        const name = names[exploitId] || `Penguin#${exploitId}`;
        const ono = roster?.[exploitId]?.ono ? ` ${roster[exploitId].ono}` : '';
        this.accrueChannelReward(XRPL.EXPLOIT_SLASH, `slash:${name}`);
        this.runSlashCount = (this.runSlashCount || 0) + 1;
        this.log(`Audit slash — ${name}${ono} · +${XRPL.EXPLOIT_SLASH} XRP accrued (settle on Claim).`, 'event');
    }

    collectRelicTransaction(relic) {
        if (!relic) return;
        this.inventory.push(relic.id);
        this.accrueChannelReward(relic.xrp, `relic:${relic.name}`);
        const ono = relic.ono ? ` ${relic.ono}` : '';
        this.log(`Relic seized — ${relic.name}${ono} · +${relic.xrp} XRP · +${relic.score} pts`, 'event');
    }

    loseLifeTransaction(remainingLives) {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playDeath();
        if (this.isLiveMode()) return; // live: score commits on-ledger only at settle

        this.log(`Uptime breached. Restarts left: ${remainingLives}. Memo inked on the ledger…`, 'alert');
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.log(`AccountSet memo (uptime) · ledger ${block} · ${hash.slice(0, 12)}...`, 'tx');
        }, 800);
    }

    /** WIN if you pushed deep before VDB; otherwise straight bail. */
    resolveCashoutStance(stats) {
        const pending = Number(this.sessionPendingEarn || 0);
        const escrow = Number(this.sessionEarnEscrow || XRPL.ENTRY_STAKE * XRPL.STAKE_SPLIT.earn);
        const deep = (stats?.level || 1) >= 3 || pending >= escrow * 0.7;
        return deep ? 'win' : 'vdb';
    }

    cashOutTransaction() {
        if (!this.gameActive) return;
        if (this.isLiveMode() && this.liveRun) {
            this.liveCashOut();
            return;
        }
        if (window.retroAudio) window.retroAudio.playClick();
        
        this.log('VDB — Voluntary Departure Bail · settling harvest…', 'system');
        this.btnClaimExit.disabled = true;

        const executeExit = () => {
            const { hash, block } = this.getNewTxHash();
            const stats = this.captureRunStats();
            const stance = this.resolveCashoutStance(stats);
            const stake = this.sessionStake || XRPL.ENTRY_STAKE;
            if (window.gameEngine?.lockStanceOutcome) window.gameEngine.lockStanceOutcome(stance);
            
            if (stats.relics > 0) {
                this.log(`Escrow notes ${stats.relics} Relic(s) vaulted this run.`, 'event');
            }

            this.log(`Escrow release · ledger ${block} · ${hash.slice(0, 14)}...`, 'tx');
            const payout = this.settleRunPayout(stats);
            this.commitScoreToLedger({ ...stats, reason: 'cashout' });
            this.finishRunRecap({ exit: stance, stats, payout, stake, demo: false });
            this.log(
                stance === 'win'
                    ? 'WIN via VDB — you pushed, then bailed with a fat harvest.'
                    : 'VDB locked — left alive with accrued harvest. Unpaid escrow → prize pools.',
                'event'
            );

            this.resetGameState();
        };

        if (this.hasSessionKeys) {
            executeExit();
        } else {
            this.log('Awaiting Xaman approval for claim Payment…', 'system');
            setTimeout(executeExit, 1200);
        }
    }

    triggerPermadeath() {
        if (!this.gameActive) return;
        if (window.retroAudio) window.retroAudio.playGameOver();
        
        const stats = this.captureRunStats();
        if (this.isLiveMode() && this.liveRun) {
            this.livePermadeath(stats);
            return;
        }
        if (window.gameEngine?.lockStanceOutcome) window.gameEngine.lockStanceOutcome('lose');
        const stake = this.sessionStake || XRPL.ENTRY_STAKE;
        const payout = this.settleRunPayout(stats);
        const commit = this.commitScoreToLedger({ ...stats, reason: 'slash' });
        const recap = this.finishRunRecap({ exit: 'lose', stats, payout, stake, demo: false });

        this.log('UPTIME 0 — Node slashed. Initiating NFTokenBurn…', 'alert');
        this.gameActive = false;
        
        setTimeout(() => {
            const { hash, block } = this.getNewTxHash();
            this.log(`NFTokenBurn ${this.activeHeroId} · ledger ${block} · ${hash.slice(0, 14)}...`, 'tx');
            this.log(`Node NFT ${this.activeHeroId} burned on the ledger. Session sealed.`, 'alert');
            
            this.showGameOverModal({
                heroLabel: `Node ${this.activeHeroId}`,
                score: stats.score,
                drops: stats.drops,
                best: commit.best,
                isRecord: commit.isRecord,
                demo: false,
                recap
            });
            
            this.resetGameState();
            this.activeHeroId = "Slashed";
            this.activeHeroSkin = "-";
            this.valHeroNft.textContent = this.activeHeroId;
            this.valHeroNft.className = "stat-value text-danger";
            this.valHeroClass.textContent = this.activeHeroSkin;
            
            this.setCoinInButton({ title: 'NODE BURNED', sub: 'Mint new Node · stake', icon: 'fa-skull', danger: true });
            this.btnStartRun.disabled = true;

            document.getElementById('btn-close-gameover').onclick = () => {
                this.closeBurnedSession();
            };
        }, 1000);
    }

    showGameOverModal({ heroLabel, score, drops, best, isRecord, demo, recap }) {
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
        this.fillRunRecapDom(recap || this.lastRunRecap, 'go-');
        const coachTip = document.getElementById('go-coach-tip');
        if (coachTip) {
            coachTip.textContent = this.buildRunCoachTip(recap || this.lastRunRecap);
        }
        const sub = modal.querySelector('.subtext');
        if (sub && demo) {
            sub.textContent = 'Stake fresh XRP from Xaman to mint a new Node and rejoin the Securithon Grid.';
        } else if (sub) {
            sub.textContent = 'STAKE XRP · MINT A NEW NODE · REJOIN THE SECURITHON GRID.';
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

    exitLabel(exit, demo) {
        if (demo) return 'DEMO';
        if (exit === 'win') return 'WIN';
        if (exit === 'lose') return 'LOSE';
        return 'VDB';
    }

    /**
     * Contextual coach copy for game-over — what went wrong + how to reclaim next time.
     */
    buildRunCoachTip(recap) {
        if (!recap) {
            return 'Cosecha drops, activa AUDIT (=) para slashes, sella sectores y usa VDB vivo antes de uptime 0.';
        }

        const tips = [];
        const drops = Number(recap.drops) || 0;
        const slashes = Number(recap.slashes) || 0;
        const level = Number(recap.level) || 1;
        const stake = Number(recap.stake) || XRPL.ENTRY_STAKE;
        const payout = Number(recap.payout) || 0;
        const sec = Math.max(0, Math.floor((recap.durationMs || 0) / 1000));
        const recoveryPct = stake > 0 ? (payout / stake) * 100 : 0;

        if (recap.demo) {
            tips.push('Live only — conecta Xaman y paga stake real para jugar.');
        }

        if (drops < 30) {
            tips.push('Cosechaste pocos drops — cada uno suma al harvest; sin suelo limpio casi no hay XRP que reclamar.');
        } else if (drops < 80) {
            tips.push('El harvest iba flojo — prioriza rutas que barren el suelo antes de perseguir a la swarm.');
        }

        if (level < 2) {
            tips.push('No sellaste el sector — limpiar el laberinto da +500 pts y abre el siguiente; empujar profundo mejora el payout al hacer VDB.');
        }

        if (slashes === 0) {
            tips.push('No usaste AUDIT (=): la swarm huye y cada slash suma mucho más XRP que un drop suelto.');
        } else if (slashes < 2) {
            tips.push('Pocos slashes en ventana AUDIT — ahí está el reclaim rápido; entra con la swarm expuesta.');
        }

        if (sec > 0 && sec < 50) {
            tips.push('Run muy corta — al arrancar toma distancia y aprende el mapa; uptime 0 borra el harvest.');
        }

        if (recoveryPct < 20 && drops >= 20) {
            tips.push(`Solo recuperaste ~${Math.round(recoveryPct)}% del stake — con harvest acumulado conviene VDB antes de la última vida.`);
        }

        if (level >= 2 && recap.exit === 'lose') {
            tips.push('Llegaste lejos pero moriste en HEAT — con pocos drops left la swarm aprieta; banca con VDB en vez de codiciar el clear.');
        }

        if (tips.length === 0) {
            tips.push('Para ganar de verdad: más drops + slashes, sellar sectores, y VDB vivo. Tope raro ~1.1× tu coin-in si empujas deep run.');
        }

        return tips.slice(0, 2).join(' ');
    }

    fillRunRecapDom(recap, prefix = 'run-recap-') {
        const panel = document.getElementById(prefix === 'go-' ? 'go-run-recap' : 'run-recap');
        if (!recap || !panel) {
            if (panel) panel.hidden = true;
            return;
        }
        panel.hidden = false;
        const set = (id, text) => {
            const el = document.getElementById(`${prefix}${id}`);
            if (el) el.textContent = text;
        };
        set('exit', this.exitLabel(recap.exit, recap.demo));
        set('stake', `${Number(recap.stake).toFixed(4)} XRP`);
        set('payout', `${Number(recap.payout).toFixed(4)} XRP`);
        const net = Number(recap.net);
        const netSign = net >= 0 ? '+' : '−';
        set('net', `${netSign}${Math.abs(net).toFixed(4)} XRP`);
        set('time', recap.duration || this.formatRunDuration(recap.durationMs || 0));
        set('actions', `${recap.drops} drops · ${recap.slashes} slashes · sector ${recap.level} · score ${this.formatScoreDisplay(recap.score)}`);
        const netEl = document.getElementById(`${prefix}net`);
        if (netEl) {
            netEl.classList.remove('is-up', 'is-down', 'is-flat');
            netEl.classList.add(net > 0.0001 ? 'is-up' : net < -0.0001 ? 'is-down' : 'is-flat');
        }
        panel.dataset.exit = recap.exit || 'vdb';
        panel.dataset.demo = recap.demo ? '1' : '0';
    }

    closeBurnedSession() {
        const modal = document.getElementById('gameover-modal');
        if (modal) modal.style.display = 'none';
        this.hideAttractScreen(true);
        this.isConnected = false;
        this.walletAddress = null;
        this.xrpBalance = 0;
        this.setWalletChrome({ connected: false });
        this.renderBalance();
        this.participationCoins = 0;
        this.refreshStakeButtonLabel();
        this.btnStartRun.disabled = true;
        this.btnSessionKeys.disabled = true;
        this.refreshScoreUI();
    }

    resetGameState() {
        this.gameActive = false;
        this.btnClaimExit.disabled = true;
        this.btnStartRun.disabled = false;
        this.refreshVdbHint();
        
        if (window.gameEngine) {
            window.gameEngine.stopGame();
        }
        this.hideAttractScreen(true);
    }

    selectPalette(name) {
        if (window.retroAudio) window.retroAudio.playClick();
        
        if (this.unlockedPalettes[name]) {
            this.currentPalette = name;
            this.updatePaletteButtonsUI();
            this.log(`Node skin: ${name.toUpperCase()}`, "system");
            if (window.gameEngine) window.gameEngine.setPalette(name);
        } else {
            if (!this.isConnected) {
                this.log("Connect Xaman first to buy skins with XRP.", "alert");
                return;
            }
            if (this.isLiveMode()) {
                this.log('Skin sales open post-launch — cosmetics are not charged in live beta.', 'alert');
                return;
            }
            
            const cost = XRPL.SKIN_COST;
            if (this.xrpBalance < cost) {
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
        updateBtn(this.btnPaletteGreen, "green", "Verdant");
        updateBtn(this.btnPalettePico, "pico", "Circuit");
    }
}

window.web3Simulator = new Web3Simulator();
