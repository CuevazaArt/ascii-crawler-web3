# Leak Runner — XRPL arcade demo

Boot a **Node** on the **Securithon Grid**: harvest Drops, seize Relics, slash Exploits — with an Xaman / XRPL economy. Built for educational XRPL consumer-app experiments — not an official Ripple, XRPL Foundation, or Xaman product. Demo Mode is simulated; **live mainnet deployments may charge real XRP**.

**Repository:** [github.com/CuevazaArt/ascii-crawler-web3](https://github.com/CuevazaArt/ascii-crawler-web3)

## Quick start

```bash
python -m http.server 8765
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## What is real vs. simulated

Honest status of the XRPL layer (important for judges and contributors):

| Layer | Status |
| --- | --- |
| Game engine, pixel art, audio, attract mode | **Real** — runs fully client-side |
| Xaman connect, stake, Payment Channels, NFTokenBurn, ScoreCommit | **Simulated** — local mock, no network calls |
| Balances, prize bags, epochs, leaderboards | **Simulated** — persisted in `localStorage` only |

No real XRP moves in this repository today. The XRPL concepts are modeled 1:1 with their real counterparts (Payment Channels for micropayouts, NFTs via XLS-20, memos for score commits) so the swap to live rails is mechanical, not conceptual.

### Roadmap to live XRPL

1. Wallet: real Xaman (Xumm) SDK sign-in flow replacing the mock connect.
2. Testnet: `xrpl.js` client — real stake payment, channel open/claim/close, `NFTokenMint`/`NFTokenBurn`.
3. Score commits: transaction memos on-ledger, leaderboard read from ledger history.
4. Mainnet hardening: amounts review, fee handling, error/retry UX.

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

CI runs on GitHub Actions (`.github/workflows/ci.yml`): legal docs presence, score ASCII limit, and button contract / behavior checks.

## Score display

Score strings in the UI are formatted as **ASCII digits only, maximum 12 characters** (`score-format.js`).
