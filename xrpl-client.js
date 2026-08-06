/**
 * Leak Runner — live XRPL client (xrpl-client.js)
 *
 * Thin browser layer for real rails:
 *   - Xaman sign-in via OAuth2 PKCE (xumm-oauth2-pkce CDN build)
 *   - Sign requests (payloads) surfaced in a QR / deep-link modal
 *   - Read-only ledger queries over public JSON-RPC (no xrpl.js bundle needed)
 *   - Fetch wrapper for the operator API (server/)
 *
 * Never holds keys: the player signs in their own Xaman app and the operator
 * signs payouts server-side. If anything here is missing (no config, CDN
 * blocked), the game silently stays in the local demo simulator.
 */
(function () {
    'use strict';

    const CFG = window.XRPL_LIVE_CONFIG || null;

    /** Collapse Xaman / env / config labels to MAINNET | TESTNET | DEVNET | null. */
    function normalizeNetwork(raw) {
        const s = String(raw || '').trim().toUpperCase();
        if (!s) return null;
        if (s.includes('TEST') || s === 'ALTNET') return 'TESTNET';
        if (s.includes('DEV')) return 'DEVNET';
        if (s.includes('MAIN') || s === 'LIVENET') return 'MAINNET';
        return s;
    }

    class XrplLiveClient {
        constructor(cfg) {
            this.cfg = cfg;
            this.pkce = null;
            this.sdk = null;
            this.account = null;
            this.xamanNetwork = null;
            this.operatorNetwork = null; // from /api/health
            this.railsOk = false;
            this.railsIssue = null;
            this._activePayloadUuid = null;
            this._modalCancel = null;
        }

        normalizeNetwork(raw) {
            return normalizeNetwork(raw);
        }

        net() {
            const nets = this.cfg?.networks || {};
            return nets[this.cfg?.network] || nets.testnet || null;
        }

        isConfigured() {
            return !!(this.cfg
                && this.cfg.mode === 'live'
                && this.cfg.xamanApiKey
                && this.cfg.operatorAddress
                && this.cfg.apiBase
                && this.net());
        }

        /** Live rails usable right now (config filled + PKCE lib loaded). */
        available() {
            return this.isConfigured() && typeof window.XummPkce !== 'undefined';
        }

        networkLabel() {
            return this.net()?.label || 'TESTNET';
        }

        expectedNetwork() {
            return normalizeNetwork(this.cfg?.network || this.networkLabel());
        }

        isMainnet() {
            return this.expectedNetwork() === 'MAINNET';
        }

        isOperatorAccount(account) {
            const op = String(this.cfg?.operatorAddress || '');
            return !!(account && op && account === op);
        }

        /**
         * Align client config with the operator API (source of truth for
         * network + hot-wallet address). Call once at live boot.
         */
        async syncWithOperator() {
            this.railsOk = false;
            this.railsIssue = null;
            if (!this.cfg?.apiBase) {
                this.railsIssue = 'no operator apiBase configured';
                return { ok: false, issue: this.railsIssue };
            }
            let health;
            try {
                health = await this.api('/api/health');
            } catch (e) {
                this.railsIssue = e?.message || 'operator API unreachable';
                return { ok: false, issue: this.railsIssue };
            }
            const serverNet = normalizeNetwork(health.network || health.networkLabel);
            const clientNet = this.expectedNetwork();
            this.operatorNetwork = serverNet;
            if (serverNet && clientNet && serverNet !== clientNet) {
                this.railsIssue =
                    `client network ${clientNet} ≠ operator ${serverNet} — set xrpl-config.js network and XRPL_NETWORK to the same value`;
                return { ok: false, issue: this.railsIssue, health };
            }
            if (health.operator && this.cfg.operatorAddress
                && health.operator !== this.cfg.operatorAddress) {
                // Server seed wins — wrong Destination would make every stake fail verify.
                this.cfg.operatorAddress = health.operator;
            } else if (health.operator && !this.cfg.operatorAddress) {
                this.cfg.operatorAddress = health.operator;
            }
            this.railsOk = true;
            return { ok: true, health, network: serverNet || clientNet };
        }

        /** Xaman app must sit on the same rail the game + operator use. */
        walletNetworkMatches() {
            const wallet = normalizeNetwork(this.xamanNetwork);
            const expect = this.expectedNetwork();
            if (!wallet || !expect) return true; // unknown → don't hard-block
            return wallet === expect;
        }

        /**
         * Gate live stake / resume. Throws Error with a player-facing message.
         */
        assertStakeAllowed(account) {
            if (!this.railsOk) {
                throw new Error(this.railsIssue || 'operator rails not aligned — check API + network config');
            }
            if (this.isOperatorAccount(account)) {
                throw new Error('cannot stake with the operator hot wallet — connect a separate player account');
            }
            const wallet = normalizeNetwork(this.xamanNetwork);
            const expect = this.expectedNetwork();
            if (wallet && expect && wallet !== expect) {
                throw new Error(
                    `Xaman is on ${wallet} but this game uses ${expect}. `
                    + `In Xaman: Settings → Advanced → Node → ${expect}, then Disconnect and Connect again.`
                );
            }
        }

        explorerTx(hash) {
            return `${this.net().explorer}/transactions/${hash}`;
        }

        explorerAccount(account) {
            return `${this.net().explorer}/accounts/${account}`;
        }

        // ——— Xaman sign-in (OAuth2 PKCE) ———

        ensurePkce() {
            if (this.pkce) return this.pkce;
            // Stable redirect (no query/hash) so it matches Origins registered
            // at apps.xaman.dev — prefer opening the game as http://localhost:8765
            // (also register http://127.0.0.1:8765 if you use that host).
            const redirectUrl = `${window.location.origin}${window.location.pathname || '/'}`;
            this.pkce = new window.XummPkce(this.cfg.xamanApiKey, {
                implicit: true,
                redirectUrl
            });
            return this.pkce;
        }

        async readState() {
            const state = await this.ensurePkce().state();
            const account = state?.me?.sub || state?.me?.account || null;
            if (account && state?.sdk) {
                this.sdk = state.sdk;
                this.account = account;
                this.xamanNetwork = String(
                    state?.me?.network_type || state?.me?.networkType || ''
                ).toUpperCase() || null;
            }
            return this.account;
        }

        /** Xaman app network label (MAINNET / TESTNET / …) when known. */
        walletNetwork() {
            return this.xamanNetwork || null;
        }

        /** Interactive sign-in (opens the Xaman popup / app hand-off). */
        async connect() {
            const pkce = this.ensurePkce();
            await pkce.authorize();
            const account = await this.readState();
            if (!account) throw new Error('Xaman returned no account');
            return { account };
        }

        /**
         * Silent session restore from a remembered JWT (no popup).
         * Resolves with the account or null — never rejects.
         */
        restore() {
            if (!this.available()) return Promise.resolve(null);
            return new Promise((resolve) => {
                let done = false;
                const finish = (value) => { if (!done) { done = true; resolve(value); } };
                try {
                    const pkce = this.ensurePkce();
                    pkce.on('retrieved', async () => finish(await this.readState().catch(() => null)));
                    pkce.on('success', async () => finish(await this.readState().catch(() => null)));
                    // No remembered session → nothing will fire; give it a beat.
                    setTimeout(async () => finish(await this.readState().catch(() => null)), 1800);
                } catch (_) {
                    finish(null);
                }
            });
        }

        async logout() {
            try { this.ensurePkce().logout(); } catch (_) { /* ignore */ }
            this.sdk = null;
            this.account = null;
            this.xamanNetwork = null;
        }

        // ——— Ledger reads ———

        async rpc(method, params) {
            const res = await fetch(this.net().rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method, params: [params] })
            });
            if (!res.ok) throw new Error(`XRPL rpc ${method} → HTTP ${res.status}`);
            const data = await res.json();
            return data?.result || {};
        }

        /**
         * { balanceXrp } or null when the account is not activated yet.
         * Prefer the operator API proxy — Ripple's public HTTP RPC blocks browser CORS
         * ("Failed to fetch"), which made a linked wallet look broken (balance "—").
         */
        async getAccountInfo(account) {
            if (this.cfg?.apiBase) {
                try {
                    const data = await this.api(
                        `/api/account?account=${encodeURIComponent(account)}`
                    );
                    if (data && data.activated === false && !(Number(data.balanceXrp) > 0)) {
                        return null;
                    }
                    return { balanceXrp: Number(data.balanceXrp) || 0 };
                } catch (_) {
                    /* fall through to direct RPC */
                }
            }
            const r = await this.rpc('account_info', {
                account,
                ledger_index: 'validated'
            });
            if (r.error === 'actNotFound') return null;
            if (r.status !== 'success' && !r.account_data) {
                throw new Error(r.error_message || r.error || 'account_info failed');
            }
            const drops = Number(r.account_data?.Balance || 0);
            return { balanceXrp: drops / 1e6, sequence: r.account_data?.Sequence };
        }

        // ——— Sign requests (payloads) ———

        toHex(text) {
            return Array.from(new TextEncoder().encode(String(text)))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('')
                .toUpperCase();
        }

        xrpToDrops(xrp) {
            return String(Math.round(Number(xrp) * 1e6));
        }

        /**
         * Ask the player to sign the entry stake in Xaman.
         * Resolves { txid } when signed; rejects on decline/cancel/timeout.
         */
        async signStakePayload({ amountXrp, intentId }) {
            if (!this.sdk) await this.readState();
            if (!this.sdk) throw new Error('sign in with Xaman first');

            const txjson = {
                TransactionType: 'Payment',
                Destination: this.cfg.operatorAddress,
                Amount: this.xrpToDrops(amountXrp),
                Memos: [{
                    Memo: {
                        MemoType: this.toHex('leakrunner/stake'),
                        MemoData: this.toHex(intentId)
                    }
                }]
            };

            const subscription = await this.sdk.payload.createAndSubscribe(
                {
                    txjson,
                    custom_meta: {
                        identifier: String(intentId).slice(0, 40),
                        instruction: `Leak Runner — stake ${amountXrp} XRP to boot a Node run`
                    }
                },
                (event) => {
                    if (typeof event?.data?.signed !== 'undefined') return event.data;
                }
            );

            const created = subscription.created;
            this._activePayloadUuid = created?.uuid || null;
            this.showSignModal({
                title: `Sign stake · ${amountXrp} XRP`,
                qrUrl: created?.refs?.qr_png || '',
                link: created?.next?.always || '',
                hint: `Review the amount in Xaman before signing · ${this.networkLabel()}`
            });

            try {
                const outcome = await Promise.race([
                    subscription.resolved,
                    this._modalCancelPromise()
                ]);
                if (!outcome || outcome.signed === false) {
                    throw new Error('sign request declined in Xaman');
                }
                const detail = await this.sdk.payload.get(created.uuid);
                const txid = detail?.response?.txid;
                if (!txid) throw new Error('signed, but no transaction id returned');
                return { txid };
            } finally {
                this.hideSignModal();
                this._activePayloadUuid = null;
                try { subscription.websocket?.close?.(); } catch (_) { /* ignore */ }
            }
        }

        _modalCancelPromise() {
            return new Promise((_, reject) => {
                this._modalCancel = () => {
                    const uuid = this._activePayloadUuid;
                    if (uuid && this.sdk) this.sdk.payload.cancel(uuid).catch(() => {});
                    reject(new Error('sign request cancelled'));
                };
            });
        }

        // ——— Sign-request modal (markup lives in index.html) ———

        showSignModal({ title, qrUrl, link, hint }) {
            const modal = document.getElementById('xaman-sign-modal');
            if (!modal) return;
            const titleEl = document.getElementById('xaman-sign-title');
            const qrEl = document.getElementById('xaman-sign-qr');
            const linkEl = document.getElementById('xaman-sign-open');
            const hintEl = document.getElementById('xaman-sign-hint');
            if (titleEl) titleEl.textContent = title || 'Sign in Xaman';
            if (qrEl) {
                qrEl.src = qrUrl || '';
                qrEl.style.display = qrUrl ? 'block' : 'none';
            }
            if (linkEl) {
                linkEl.href = link || '#';
                linkEl.style.display = link ? 'inline-flex' : 'none';
            }
            if (hintEl) hintEl.textContent = hint || '';
            const cancelBtn = document.getElementById('xaman-sign-cancel');
            if (cancelBtn) cancelBtn.onclick = () => { if (this._modalCancel) this._modalCancel(); };
            modal.style.display = 'flex';
        }

        hideSignModal() {
            const modal = document.getElementById('xaman-sign-modal');
            if (modal) modal.style.display = 'none';
            this._modalCancel = null;
        }

        // ——— Operator API (server/) ———

        async api(path, body) {
            const base = String(this.cfg.apiBase || '').replace(/\/+$/, '');
            let res;
            try {
                res = await fetch(base + path, {
                    method: body ? 'POST' : 'GET',
                    headers: body ? { 'Content-Type': 'application/json' } : undefined,
                    body: body ? JSON.stringify(body) : undefined
                });
            } catch (e) {
                throw new Error('operator API unreachable');
            }
            let data = null;
            try { data = await res.json(); } catch (_) { /* non-JSON error body */ }
            if (!res.ok) {
                throw new Error(data?.error || `operator API ${res.status}`);
            }
            return data;
        }
    }

    window.xrplLive = new XrplLiveClient(CFG);
})();
