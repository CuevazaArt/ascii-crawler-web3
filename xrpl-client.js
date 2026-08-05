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

    class XrplLiveClient {
        constructor(cfg) {
            this.cfg = cfg;
            this.pkce = null;
            this.sdk = null;
            this.account = null;
            this._activePayloadUuid = null;
            this._modalCancel = null;
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

        isMainnet() {
            return this.cfg?.network === 'mainnet';
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
            this.pkce = new window.XummPkce(this.cfg.xamanApiKey, {
                implicit: true,
                redirectUrl: window.location.href
            });
            return this.pkce;
        }

        async readState() {
            const state = await this.ensurePkce().state();
            const account = state?.me?.sub || state?.me?.account || null;
            if (account && state?.sdk) {
                this.sdk = state.sdk;
                this.account = account;
            }
            return this.account;
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
        }

        // ——— Ledger reads (public JSON-RPC, no SDK) ———

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

        /** { balanceXrp } or null when the account is not activated yet. */
        async getAccountInfo(account) {
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
