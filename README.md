# Leak Runner — XRPL Make Waves Prototype

Arcade grid game (Securithon lore) with a simulated Xaman / XRPL economy for Make Waves demos.

## Quick start

```bash
python -m http.server 8765
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## Legal

Before connecting a wallet you must **Accept** the in-game Terms. Full text:

- [Disclaimer, License & Terms of Service](docs/LEGAL.md)
- [In-game HTML copy](docs/legal.html)
- [MIT License](LICENSE)

Key points: prototype / AS IS; MIT rights of use; good use & fair play; **no** hate, discrimination, racism, or incitement to harmful conduct.

## Development

```bash
npm ci
npm test
```

CI runs on GitHub Actions (`.github/workflows/ci.yml`): legal docs presence, score ASCII limit, and button contract / behavior checks.

## Score display

Score strings in the UI are formatted as **ASCII digits only, maximum 10 characters** (`score-format.js`).
