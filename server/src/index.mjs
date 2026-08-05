import http from 'node:http';
import { loadConfig } from './config.mjs';
import { openDb } from './db.mjs';
import { XrplService } from './xrpl-service.mjs';
import { createApp, ApiError } from './app.mjs';

const cfg = loadConfig();
const db = openDb(cfg.dbFile, { epochMs: cfg.epochMs });
const ledger = new XrplService({ wss: cfg.wss, seed: cfg.seed, network: cfg.network });
const app = createApp({ cfg, db, ledger, log: console });

// ——— tiny helpers (no framework: node:http is enough for 7 routes) ———

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 180;
const rateBuckets = new Map();

function rateLimited(ip) {
    const now = Date.now();
    const bucket = rateBuckets.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
    if (now > bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + RATE_WINDOW_MS;
    }
    bucket.count += 1;
    rateBuckets.set(ip, bucket);
    if (rateBuckets.size > 10_000) rateBuckets.clear(); // crude memory guard
    return bucket.count > RATE_MAX;
}

function corsHeaders(origin) {
    const allowed = !cfg.allowedOrigins.length || cfg.allowedOrigins.includes(origin);
    return {
        'Access-Control-Allow-Origin': allowed ? (origin || '*') : 'null',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > 64 * 1024) {
                reject(new ApiError(413, 'body too large'));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => {
            if (!chunks.length) return resolve({});
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(new ApiError(400, 'invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

const routes = {
    'POST /api/run/intent': (body) => app.postIntent(body),
    'POST /api/run/start': (body) => app.postStart(body),
    'POST /api/run/events': (body) => app.postEvents(body),
    'POST /api/run/settle': (body) => app.postSettle(body),
    'GET /api/leaderboard': () => app.getLeaderboard(),
    'GET /api/health': () => app.getHealth(),
    'POST /api/admin/pending': (body) => app.adminPending(body),
    'POST /api/admin/approve': (body) => app.adminApprove(body)
};

const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };
    const url = new URL(req.url, 'http://local');
    const key = `${req.method} ${url.pathname}`;

    if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        res.end();
        return;
    }

    const ip = req.socket.remoteAddress || 'unknown';
    if (rateLimited(ip)) {
        res.writeHead(429, headers);
        res.end(JSON.stringify({ error: 'rate limited' }));
        return;
    }

    const handler = routes[key];
    if (!handler) {
        res.writeHead(404, headers);
        res.end(JSON.stringify({ error: 'not found' }));
        return;
    }

    try {
        const body = req.method === 'POST' ? await readBody(req) : undefined;
        const data = await handler(body);
        res.writeHead(200, headers);
        res.end(JSON.stringify(data));
    } catch (e) {
        const status = e instanceof ApiError ? e.status : 500;
        if (status >= 500) console.error(`[500] ${key}:`, e);
        res.writeHead(status, headers);
        res.end(JSON.stringify({ error: e.message || 'internal error' }));
    }
});

// Background jobs: epoch rollover + stale-run reaper
const tick = setInterval(() => {
    try { app.ensureEpoch(); } catch (e) { console.error('[epoch tick]', e.message); }
    app.reapStaleRuns().catch((e) => console.error('[reaper tick]', e.message));
}, 60_000);
tick.unref();

server.listen(cfg.port, async () => {
    console.log(`Leak Runner operator API`);
    console.log(`  network   : ${cfg.network} (${cfg.wss})`);
    console.log(`  operator  : ${ledger.address}`);
    console.log(`  port      : ${cfg.port}`);
    console.log(`  daily cap : ${cfg.dailyPayoutCapXrp} XRP · low-balance alarm < ${cfg.lowBalanceAlertXrp} XRP`);
    console.log(`  epoch pay : ${cfg.autoEpochPayout ? 'AUTO' : 'manual approval (/api/admin/approve)'}`);
    if (cfg.adminTokenGenerated) {
        console.log(`  admin tok : ${cfg.adminToken}  (set ADMIN_TOKEN to pin it)`);
    }
    try {
        const bal = await ledger.getBalanceXrp();
        console.log(`  balance   : ${bal} XRP`);
        if (bal < cfg.lowBalanceAlertXrp) {
            console.error(`  [ALARM] operator balance below ${cfg.lowBalanceAlertXrp} XRP — payouts may fail`);
        }
    } catch (e) {
        console.error(`  [warn] could not reach XRPL node yet: ${e.message}`);
    }
});

process.on('SIGINT', async () => {
    clearInterval(tick);
    server.close();
    await ledger.disconnect().catch(() => {});
    process.exit(0);
});
