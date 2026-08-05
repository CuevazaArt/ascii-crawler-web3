# Leak Runner — XRPL arcade demo

Boot a **Node** on the **Securithon Grid**: harvest Drops, seize Relics, slash Exploits — with an Xaman / XRPL economy. Built for educational XRPL consumer-app experiments — not an official Ripple, XRPL Foundation, or Xaman product. Demo Mode is simulated; **live mainnet deployments may charge real XRP**.

**Repository:** [github.com/CuevazaArt/ascii-crawler-web3](https://github.com/CuevazaArt/ascii-crawler-web3)

## Quick start

```bash
python -m http.server 8765
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## What is real vs. simulated

Honest status of the XRPL layer (important for judges and contributors). The game ships in **sim mode** by default; an operator flips it live via `xrpl-config.js` + the [`server/` operator API](server/README.md).

| Layer | Sim mode (default) | Live mode (`xrpl-config.js` filled in) |
| --- | --- | --- |
| Game engine, pixel art, audio, attract mode | **Real** — runs fully client-side | Same |
| Xaman connect | Local mock | **Real** — Xaman OAuth2 PKCE sign-in |
| Entry stake (0.5 XRP) | Simulated | **Real Payment** signed in Xaman, verified on-ledger by the operator API before the run starts |
| Run earn, payouts, ScoreCommit | Simulated | **Real** — server-authoritative accrual with caps; the operator hot wallet signs the settle Payment (ceiling 1.1× stake) with an on-ledger `leakrunner/scorecommit` memo |
| Prize bags, epochs, leaderboards | `localStorage` | **Server-side** (SQLite), epoch prizes queued for manual approval |
| Payment Channels, NFT mint/burn, skin charges | Simulated narrative | Still simulated (post-launch roadmap) |

### Going live

1. Deploy `server/` (see [server/README.md](server/README.md)) with a funded operator wallet.
2. Fill `xrpl-config.js`: `mode: 'live'`, `network`, `xamanApiKey`, `operatorAddress`, `apiBase`.
3. Verify on testnet first: `cd server && npm run e2e:testnet` exercises real faucet wallets, a real stake, capped accrual, a real payout and the ScoreCommit memo.

If the live config is incomplete or the SDK fails to load, the game degrades gracefully back to sim mode.

## Controls

- **Keyboard:** arrows / WASD · `S` starts a run
- **Gamepad:** d-pad or left stick
- **Touch:** swipe on the playfield to steer · tap to start

## Legal

© 2026 Leak Runner contributors. Before connecting a wallet you must **Accept** the in-game Terms. Full text:

- [Disclaimer, License & Terms of Service](docs/LEGAL.md)
- [In-game HTML copy](docs/legal.html)
- [MIT License](LICENSE)

Key points: AS IS; mainnet may charge **real XRP** (irreversible; no refund guaranteed); MIT rights of use; good use & fair play; **no** hate, discrimination, racism, or incitement to harmful conduct.

In-game penguins (**Bitwaddle**, **Hatglide**, **Slipkernel**, **Sourceflip**) are original characters with invented names — see [docs/LEGAL.md](docs/LEGAL.md) §1.6.

Issues & source: [CuevazaArt/ascii-crawler-web3](https://github.com/CuevazaArt/ascii-crawler-web3).

## Development

```bash
npm ci
npm test
```

CI runs on GitHub Actions (`.github/workflows/ci.yml`) on Node 24: legal docs presence, score ASCII limit, button contract / behavior checks, live-rails wiring, maze integrity, and the operator API + economy suites (in-memory SQLite, mocked ledger). The real-ledger path is covered by the manual `npm run e2e:testnet` in `server/`.

## Score display

Score strings in the UI are formatted as **ASCII digits only, maximum 12 characters** (`score-format.js`).
