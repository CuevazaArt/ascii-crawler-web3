# Leak Runner — XRPL arcade demo

Arcade grid game (Securithon lore) with an Xaman / XRPL economy. Built for educational XRPL consumer-app experiments — not an official Ripple, XRPL Foundation, or Xaman product. Demo Mode is simulated; **live mainnet deployments may charge real XRP**.

**Repository:** [github.com/CuevazaArt/ascii-crawler-web3](https://github.com/CuevazaArt/ascii-crawler-web3)

## Quick start

```bash
python -m http.server 8765
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

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
