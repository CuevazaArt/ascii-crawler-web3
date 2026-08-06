/**
 * Leak Runner — live XRPL configuration (xrpl-config.js)
 *
 * mode:
 *   'sim'  → everything stays in the local demo simulator (safe default).
 *   'live' → real Xaman sign-in, real stakes/payouts through the operator API.
 *
 * To go live you must fill in:
 *   - xamanApiKey     → publishable API key from https://apps.xaman.dev
 *                       (register your site origin there too, or PKCE will fail)
 *   - operatorAddress → r-address of the operator hot wallet (receives stakes)
 *   - apiBase         → base URL of the Leak Runner operator API (server/)
 *
 * network picks which XRPL rails are used while mode === 'live'.
 * MUST match server XRPL_NETWORK. On boot the client syncs /api/health and
 * adopts the operator r-address from the seed-derived wallet (server wins).
 * QA: 'testnet' + Xaman Settings → Advanced → Node → Testnet.
 * Mainnet cutover: flip this flag, XRPL_NETWORK, and the funded operator seed.
 */
(function () {
    const host = (typeof location !== 'undefined' && location.hostname) || '';
    const local = host === 'localhost' || host === '127.0.0.1';
    // Local QA talks to the operator API on this machine; GitHub Pages stays sim.
    window.XRPL_LIVE_CONFIG = {
    mode: local ? 'live' : 'sim',
    network: 'testnet', // keep in lockstep with server/.env XRPL_NETWORK
    // Publishable identifier of the "Leak Runner" Xaman app (safe to commit;
    // PKCE security comes from the origins registered at apps.xaman.dev)
    xamanApiKey: '9965ff73-7744-4f00-a05f-aa8b3d40397e',
    // Hint only — overwritten from /api/health.operator when the API is up.
    operatorAddress: 'rPJfW7BGRTgkA7kHrdwenFTwrD3sNARnRt',
    apiBase: local ? 'http://127.0.0.1:8787' : '',
    networks: {
        mainnet: {
            label: 'MAINNET',
            rpc: 'https://xrplcluster.com',
            explorer: 'https://livenet.xrpl.org'
        },
        testnet: {
            label: 'TESTNET',
            // Browser-facing JSON-RPC must allow CORS. Ripple's :51234 endpoint
            // does not; XRPL Labs' public clio node does (fallback if API proxy down).
            rpc: 'https://testnet.xrpl-labs.com',
            explorer: 'https://testnet.xrpl.org'
        }
    }
    };
})();
