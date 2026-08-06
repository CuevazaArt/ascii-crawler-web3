# Changelog

All notable changes to **Leak Runner** are documented here.

## [v0.7.0] — 2026-08-06

### Live-only play (no free demo in UI)

- Removed the header **Demo / bypass** toggle and all client-side free-run fallbacks.
- **START**, **BOOT NODE**, and keyboard **`S`** require a connected wallet and a real (or sim) stake — no silent demo boots.
- Lobby copy, attract text, and banners updated for live stake-to-play.

### Stake UX — START WITH (n) XRP

- Arcade **START** button shows dynamic stake: `START WITH 0.5 XRP` (updates with ±0.5 controls).
- **±0.5** buttons in the lobby, action rail, and stake modal adjust the amount without extra coin-in on BOOT.
- Two-step confirm: first press opens the stake modal; confirm (or second START / **BOOT NODE · Pay XRP**) boots the run.
- **Run recap** between instances (stake, payout, net, time, actions) and game-over coach tips.

### Operator wallet gate (fixes “no button starts the game”)

- Detects when Xaman is linked to the **operator hot wallet** (vault) instead of a player account.
- Red **start-wallet-block** banner with **Disconnect · connect player wallet** action.
- **START** / **BOOT NODE** relabel to **SWITCH TO PLAYER WALLET** when blocked; one click starts disconnect + reconnect flow.
- Skips auto-restore of saved Xaman sessions that belong to the operator address.
- Network mismatch (e.g. Xaman on Mainnet, game on Testnet) surfaced with the same gate.

### Layout & arcade chrome

- Header space redistributed: LIVE badge + hint in center; wider wallet bar.
- Lobby grid **~24% / 76%** (more room for the playfield); canvas/prompt widened to **640px**.
- **Action rail** grouped as COIN-IN → VDB → CHANNEL with semantic styling.
- **Stake ticker**, fullscreen button, responsive **is-playing-view** for mobile.
- **API** link in the game terminal header → operator dashboard (`http://127.0.0.1:8787/` on localhost).

### Operator API

- **`GET /`** — HTML status dashboard (health, network, operator, economy snapshot).
- **`GET /api`** — JSON index of endpoints.
- CORS / `.env.example` aligned with local frontend origin.

### Client live rails

- `xrpl-client.js`: operator sync, `assertStakeAllowed`, network normalization, stake/resume safety.
- `xrpl-config.js`: localhost defaults to live + `apiBase` on `:8787`.
- Pending-stake recovery in `localStorage` if sign succeeds but `/api/run/start` hiccups.

### Tests

- Extended `tests/buttons.test.mjs` (START, ± stake, sim boot, VDB).
- Added `tests/network-coherence.test.mjs`.
- Legal/docs tests: no demo toggle in UI.

### Links (local QA)

| Service | URL |
| --- | --- |
| Game | http://localhost:8765/ |
| API panel | http://127.0.0.1:8787/ |
| Health | http://127.0.0.1:8787/api/health |

### How to play (live localhost)

1. Connect **Xaman** with a **player Testnet** wallet (not the operator vault).
2. Xaman → **Settings → Advanced → Node → Testnet**.
3. Fund ≥ **1.51 XRP** (0.5 stake + reserve) via [XRPL testnet faucet](https://xrpl.org/resources/dev-tools/xrp-faucets).
4. Adjust stake with **±0.5** → **START WITH n XRP** → confirm → sign in Xaman.

---

## [v0.6.0] and earlier

See git tags `v0.3.0` … `v0.6.0` and commit history on [GitHub](https://github.com/CuevazaArt/ascii-crawler-web3).
