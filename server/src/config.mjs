import { createHash, randomBytes } from 'node:crypto';

const NETWORKS = {
    mainnet: {
        label: 'MAINNET',
        wss: 'wss://xrplcluster.com',
        explorer: 'https://livenet.xrpl.org'
    },
    testnet: {
        label: 'TESTNET',
        wss: 'wss://s.altnet.rippletest.net:51233',
        explorer: 'https://testnet.xrpl.org',
        faucet: true
    }
};

export function loadConfig(env = process.env) {
    const network = (env.XRPL_NETWORK || 'testnet').toLowerCase();
    if (!NETWORKS[network]) {
        throw new Error(`XRPL_NETWORK must be 'mainnet' or 'testnet' (got '${network}')`);
    }
    const seed = (env.XRPL_OPERATOR_SEED || '').trim();
    if (!seed) {
        throw new Error('XRPL_OPERATOR_SEED is required (operator hot wallet seed)');
    }

    const runTokenSecret = (env.RUN_TOKEN_SECRET || '').trim()
        || createHash('sha256').update(`leakrunner:${seed}`).digest('hex');

    const adminToken = (env.ADMIN_TOKEN || '').trim() || randomBytes(24).toString('hex');
    const adminTokenGenerated = !(env.ADMIN_TOKEN || '').trim();

    return {
        network,
        net: NETWORKS[network],
        wss: (env.XRPL_WSS || '').trim() || NETWORKS[network].wss,
        seed,
        port: Number(env.PORT) || 8787,
        allowedOrigins: (env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        dailyPayoutCapXrp: Number(env.DAILY_PAYOUT_CAP_XRP) || 100,
        lowBalanceAlertXrp: Number(env.LOW_BALANCE_ALERT_XRP) || 10,
        autoEpochPayout: env.AUTO_EPOCH_PAYOUT === '1' || env.AUTO_EPOCH_PAYOUT === 'true',
        adminToken,
        adminTokenGenerated,
        runTokenSecret,
        dbFile: (env.DB_FILE || 'data/leakrunner.db').trim(),
        epochMs: Number(env.EPOCH_MS) || 24 * 60 * 60 * 1000,
        runTtlMs: Number(env.RUN_TTL_MS) || 30 * 60 * 1000,
        intentTtlMs: Number(env.INTENT_TTL_MS) || 15 * 60 * 1000,
        memoOnZero: env.MEMO_ON_ZERO !== '0'
    };
}

export { NETWORKS };
