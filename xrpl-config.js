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
 * QA happens on 'testnet' (Xaman app → Settings → Advanced → node → Testnet);
 * the mainnet cutover is this single flag plus the funded operator wallet.
 */
(function () {
    const host = (typeof location !== 'undefined' && location.hostname) || '';
    const local = host === 'localhost' || host === '127.0.0.1';
    // Local QA talks to the operator API on this machine; GitHub Pages stays sim.
    window.XRPL_LIVE_CONFIG = {
    mode: local ? 'live' : 'sim',
    network: 'testnet',
    // Publishable identifier of the "Leak Runner" Xaman app (safe to commit;
    // PKCE security comes from the origins registered at apps.xaman.dev)
    xamanApiKey: '9965ff73-7744-4f00-a05f-aa8b3d40397e',
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
            rpc: 'https://s.altnet.rippletest.net:51234',
            explorer: 'https://testnet.xrpl.org'
        }
    }
    };
})();
