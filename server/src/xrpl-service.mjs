import xrpl from 'xrpl';

const RIPPLE_EPOCH_MS = 946684800000; // 2000-01-01T00:00:00Z

export class XrplService {
    constructor({ wss, seed, network }) {
        this.wss = wss;
        this.network = network;
        this.wallet = xrpl.Wallet.fromSeed(seed);
        this.client = null;
        this._connecting = null;
        this._sendChain = Promise.resolve();
    }

    /**
     * All operator-signed transactions go through a single-flight queue:
     * concurrent submits from one account race on the Sequence number
     * (tefPAST_SEQ), and serializing also keeps the daily-cap check honest.
     */
    _enqueueSend(fn) {
        const run = this._sendChain.then(fn, fn);
        this._sendChain = run.then(() => {}, () => {});
        return run;
    }

    get address() {
        return this.wallet.address;
    }

    async getClient() {
        if (this.client?.isConnected()) return this.client;
        if (!this._connecting) {
            this._connecting = (async () => {
                const c = this.client ?? new xrpl.Client(this.wss);
                if (!c.isConnected()) await c.connect();
                this.client = c;
                return c;
            })().finally(() => { this._connecting = null; });
        }
        return this._connecting;
    }

    async disconnect() {
        if (this.client?.isConnected()) await this.client.disconnect();
    }

    async getBalanceXrp(account = this.address) {
        const c = await this.getClient();
        try {
            const drops = await c.getXrpBalance(account);
            return Number(drops);
        } catch (e) {
            if (String(e?.data?.error || e?.message).includes('actNotFound')) return 0;
            throw e;
        }
    }

    static decodeMemoHex(hex) {
        try {
            return Buffer.from(String(hex || ''), 'hex').toString('utf8');
        } catch {
            return '';
        }
    }

    static toMemo(type, data) {
        return {
            Memo: {
                MemoType: Buffer.from(type, 'utf8').toString('hex').toUpperCase(),
                MemoData: Buffer.from(data, 'utf8').toString('hex').toUpperCase()
            }
        };
    }

    /**
     * Verify a stake Payment: validated on-ledger, success, player → operator,
     * amount ≥ stake, memo carries the expected intent id, recent enough.
     * Polls briefly because the client calls right after Xaman reports "signed".
     */
    async verifyStakeTx({ txHash, account, intentId, minXrp, maxAgeMs = 30 * 60 * 1000 }) {
        const c = await this.getClient();
        let last = null;
        for (let attempt = 0; attempt < 10; attempt++) {
            try {
                const r = await c.request({ command: 'tx', transaction: txHash });
                last = r.result;
                if (last.validated) break;
            } catch (e) {
                const code = e?.data?.error || '';
                if (code !== 'txnNotFound') throw new Error(`tx lookup failed: ${code || e.message}`);
                last = null;
            }
            await new Promise((res) => setTimeout(res, 1500));
        }
        if (!last || !last.validated) throw new Error('stake tx not validated on-ledger yet — try again');

        const tx = last.tx_json || last; // api_version 2 vs 1
        const meta = last.meta || last.metaData;
        if (tx.TransactionType !== 'Payment') throw new Error('stake tx is not a Payment');
        if (meta?.TransactionResult !== 'tesSUCCESS') {
            throw new Error(`stake tx failed on-ledger (${meta?.TransactionResult})`);
        }
        if (tx.Account !== account) throw new Error('stake tx signed by a different account');
        if (tx.Destination !== this.address) throw new Error('stake tx destination is not the operator vault');

        const deliveredDrops = typeof meta?.delivered_amount === 'string'
            ? meta.delivered_amount
            : (typeof tx.DeliverMax === 'string' ? tx.DeliverMax : tx.Amount);
        if (typeof deliveredDrops !== 'string') throw new Error('stake tx did not deliver XRP');
        const deliveredXrp = Number(deliveredDrops) / 1e6;
        if (deliveredXrp + 1e-9 < minXrp) {
            throw new Error(`stake amount ${deliveredXrp} XRP is below the ${minXrp} XRP entry stake`);
        }

        const memoHex = tx.Memos?.[0]?.Memo?.MemoData;
        if (XrplService.decodeMemoHex(memoHex) !== intentId) {
            throw new Error('stake tx memo does not match the run intent');
        }

        const closeMs = typeof last.close_time_iso === 'string'
            ? Date.parse(last.close_time_iso)
            : (typeof tx.date === 'number' ? tx.date * 1000 + RIPPLE_EPOCH_MS : Date.now());
        if (Date.now() - closeMs > maxAgeMs) throw new Error('stake tx is too old for a new run');

        return {
            deliveredXrp,
            ledgerIndex: last.ledger_index || tx.ledger_index || 0
        };
    }

    /** Operator → player Payment carrying the ScoreCommit memo. */
    sendPayout({ account, amountXrp, memoType, memoData }) {
        return this._enqueueSend(async () => {
            const c = await this.getClient();
            const tx = {
                TransactionType: 'Payment',
                Account: this.address,
                Destination: account,
                Amount: xrpl.xrpToDrops(amountXrp.toFixed(6)),
                Memos: [XrplService.toMemo(memoType, memoData)]
            };
            const prepared = await c.autofill(tx);
            const signed = this.wallet.sign(prepared);
            const res = await c.submitAndWait(signed.tx_blob);
            const result = res.result?.meta?.TransactionResult;
            if (result !== 'tesSUCCESS') throw new Error(`payout failed on-ledger (${result})`);
            return { hash: res.result.hash, ledgerIndex: res.result.ledger_index };
        });
    }

    /** Zero-payout runs still ink their ScoreCommit: no-op AccountSet with memo. */
    sendScoreMemo({ memoType, memoData }) {
        return this._enqueueSend(async () => {
            const c = await this.getClient();
            const tx = {
                TransactionType: 'AccountSet',
                Account: this.address,
                Memos: [XrplService.toMemo(memoType, memoData)]
            };
            const prepared = await c.autofill(tx);
            const signed = this.wallet.sign(prepared);
            const res = await c.submitAndWait(signed.tx_blob);
            const result = res.result?.meta?.TransactionResult;
            if (result !== 'tesSUCCESS') throw new Error(`memo tx failed on-ledger (${result})`);
            return { hash: res.result.hash, ledgerIndex: res.result.ledger_index };
        });
    }
}
