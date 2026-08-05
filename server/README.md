# Leak Runner — Operator API (`server/`)

Minimal Node backend that turns the game's simulated economy into real XRPL rails:

- **Verifies stakes on-ledger**: a run only starts after a validated `Payment`
  of ≥ 0.5 XRP from the player to the operator wallet, carrying the run-intent memo.
- **Server-authoritative runs**: drop/slash/relic events are counted here with
  hard caps; the client can render whatever it wants — payouts come from these counters.
- **Signs real payouts**: at cashout/permadeath the operator wallet sends the
  settle `Payment` (escrow earn + milestones, ceiling 1.1× stake = 0.55 XRP) with a
  `leakrunner/scorecommit` JSON memo. Zero-earn runs still ink a memo-only ScoreCommit.
- **Epoch prizes**: 24 h epochs; jackpot 50/20/15% to top-3 (15% seeds the next epoch),
  top-5 pool split evenly. Queued for **manual approval** by default.
- **Safety rails**: CORS allowlist, per-IP rate limit, daily payout cap,
  low-balance alarm, stale-run auto-settle, replay/idempotency guards.

Runtime: **Node ≥ 23.4** (uses built-in `node:sqlite`). Only dependency: [`xrpl`](https://www.npmjs.com/package/xrpl).

## Quick start (testnet)

```bash
cd server
npm install
cp .env.example .env
# XRPL_NETWORK=testnet and XRPL_OPERATOR_SEED=<a faucet seed> — get one:
node -e "const x=require('xrpl');(async()=>{const c=new x.Client('wss://s.altnet.rippletest.net:51233');await c.connect();const {wallet}=await c.fundWallet();console.log(wallet.address, wallet.seed);await c.disconnect()})()"
npm run dev
```

Then point the frontend at it in `xrpl-config.js`:

```js
mode: 'live', network: 'testnet',
xamanApiKey: '<your key from apps.xaman.dev>',
operatorAddress: '<the r-address above>',
apiBase: 'http://localhost:8787'
```

## Full testnet E2E (no phone needed)

Exercises faucet wallets, a real stake Payment, on-ledger verification, capped
events, a real payout + ScoreCommit memo, idempotency and replay guards:

```bash
cd server
npm run e2e:testnet
```

## API

| Route | Body | Purpose |
|---|---|---|
| `POST /api/run/intent` | `{ account }` | Issue the intent id the stake memo must carry |
| `POST /api/run/start` | `{ account, intentId, txHash }` | Verify the stake tx on-ledger → `{ runId, token, escrow, economy }` |
| `POST /api/run/events` | `{ runId, token, events[], snapshot }` | Batched accrual (server caps) |
| `POST /api/run/settle` | `{ runId, token, reason, stats }` | Pay out + ScoreCommit; idempotent |
| `GET /api/leaderboard` | — | Bags, epoch board, all-time board, history |
| `GET /api/health` | — | Network, operator balance, 24 h paid vs cap |
| `POST /api/admin/pending` | `{ token }` | List queued (epoch/deferred) payouts |
| `POST /api/admin/approve` | `{ token }` | Execute queued payouts from the hot wallet |

## Deploy (Render / Railway / any Node host)

1. Create a **Web Service** from this repo, root directory `server/`.
   - Build: `npm install` · Start: `npm start` · Node: 24.
2. Set env vars from `.env.example`. Minimum: `XRPL_NETWORK`, `XRPL_OPERATOR_SEED`,
   `ALLOWED_ORIGINS=https://<your-frontend-host>`, `ADMIN_TOKEN`.
3. Attach a **persistent disk** mounted where `DB_FILE` points (e.g. `data/`),
   otherwise the leaderboard resets on redeploy.
4. Health check path: `/api/health`.

### Mainnet cutover

- `XRPL_NETWORK=mainnet` and the **mainnet** operator seed (fund 20–50 XRP; it is a hot wallet — keep it small and monitored).
- Frontend `xrpl-config.js`: `network: 'mainnet'`, `operatorAddress`, `apiBase` → your deployed URL.
- Register the frontend origin at [apps.xaman.dev](https://apps.xaman.dev) for the PKCE sign-in.
- Watch `/api/health` (`operatorBalance`, `paid24h`) and the boot-time low-balance alarm.

## Economy invariants (enforced here, not in the browser)

- Escrow reclaimable by skill: 70% of the stake (0.35 XRP).
- Absolute payout ceiling per run: `1.1 × stake` = 0.55 XRP (boost included).
- Milestones pay from the milestones bag only, first-to-hit, globally once.
- A perfect bot nets at most +0.05 XRP per run **before** fees; epoch bags are
  protected by score-plausibility clamps and manual prize approval.
