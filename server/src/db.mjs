import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { roundXrp, XRPL } from './economy.mjs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bags (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    jackpot REAL NOT NULL DEFAULT 0,
    topn REAL NOT NULL DEFAULT 0,
    milestones REAL NOT NULL DEFAULT 0,
    reserve REAL NOT NULL DEFAULT 0,
    dev REAL NOT NULL DEFAULT 0,
    house_profit REAL NOT NULL DEFAULT 0,
    total_staked REAL NOT NULL DEFAULT 0,
    total_paid REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS epochs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_ms INTEGER NOT NULL,
    ends_ms INTEGER NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS epoch_scores (
    epoch_id INTEGER NOT NULL,
    account TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    drops INTEGER NOT NULL DEFAULT 0,
    ts INTEGER NOT NULL,
    PRIMARY KEY (epoch_id, account)
);
CREATE TABLE IF NOT EXISTS wallets (
    account TEXT PRIMARY KEY,
    high_score INTEGER NOT NULL DEFAULT 0,
    total_runs INTEGER NOT NULL DEFAULT 0,
    total_drops INTEGER NOT NULL DEFAULT 0,
    total_relics INTEGER NOT NULL DEFAULT 0,
    total_earned REAL NOT NULL DEFAULT 0,
    last_score INTEGER NOT NULL DEFAULT 0,
    last_ledger INTEGER NOT NULL DEFAULT 0,
    last_ts INTEGER
);
CREATE TABLE IF NOT EXISTS intents (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    created_ms INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    stake REAL NOT NULL DEFAULT 0.5
);
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    intent_id TEXT NOT NULL,
    stake_tx TEXT NOT NULL UNIQUE,
    stake REAL NOT NULL,
    escrow REAL NOT NULL,
    drops INTEGER NOT NULL DEFAULT 0,
    slashes INTEGER NOT NULL DEFAULT 0,
    relics TEXT NOT NULL DEFAULT '{}',
    level INTEGER NOT NULL DEFAULT 1,
    snapshot_score INTEGER NOT NULL DEFAULT 0,
    last_event_ms INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'active',
    started_ms INTEGER NOT NULL,
    settled_ms INTEGER,
    reason TEXT,
    payout REAL NOT NULL DEFAULT 0,
    payout_tx TEXT,
    settle_json TEXT,
    epoch_id INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_state ON runs (state, started_ms);
CREATE TABLE IF NOT EXISTS milestones_claimed (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    prize REAL NOT NULL,
    ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    account TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tx TEXT,
    note TEXT,
    created_ms INTEGER NOT NULL,
    executed_ms INTEGER
);
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    ts INTEGER NOT NULL
);
`;

export function openDb(file, { epochMs = XRPL.EPOCH_MS, now = Date.now() } = {}) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(SCHEMA);
    // Migrate older DBs that lack intents.stake
    try {
        db.exec('ALTER TABLE intents ADD COLUMN stake REAL NOT NULL DEFAULT 0.5');
    } catch (_) { /* column already exists */ }

    // Seed singletons
    const bags = db.prepare('SELECT * FROM bags WHERE id = 1').get();
    if (!bags) {
        db.prepare(
            'INSERT INTO bags (id, jackpot, topn, milestones, reserve, dev) VALUES (1, 0, 0, 0, 0, 0)'
        ).run();
    }
    const epoch = db.prepare('SELECT * FROM epochs ORDER BY id DESC LIMIT 1').get();
    if (!epoch) {
        db.prepare('INSERT INTO epochs (started_ms, ends_ms) VALUES (?, ?)').run(now, now + epochMs);
    }
    return db;
}

// ——— Bags ———

export function getBags(db) {
    const r = db.prepare('SELECT * FROM bags WHERE id = 1').get();
    return {
        jackpot: r.jackpot,
        topN: r.topn,
        milestones: r.milestones,
        reserve: r.reserve,
        dev: r.dev,
        houseProfit: r.house_profit,
        totalStaked: r.total_staked,
        totalPaid: r.total_paid
    };
}

export function setBags(db, bags, { staked = 0, paid = 0, profit = 0 } = {}) {
    db.prepare(`
        UPDATE bags SET
            jackpot = ?, topn = ?, milestones = ?, reserve = ?, dev = ?,
            house_profit = ROUND(house_profit + ?, 9),
            total_staked = ROUND(total_staked + ?, 9),
            total_paid = ROUND(total_paid + ?, 9)
        WHERE id = 1
    `).run(
        roundXrp(bags.jackpot), roundXrp(bags.topN), roundXrp(bags.milestones),
        roundXrp(bags.reserve), roundXrp(bags.dev),
        roundXrp(profit), roundXrp(staked), roundXrp(paid)
    );
}

// ——— Epochs ———

export function currentEpoch(db) {
    return db.prepare('SELECT * FROM epochs ORDER BY id DESC LIMIT 1').get();
}

export function epochBoard(db, epochId, limit = 20) {
    return db.prepare(
        'SELECT account, score, drops, ts FROM epoch_scores WHERE epoch_id = ? ORDER BY score DESC LIMIT ?'
    ).all(epochId, limit);
}

export function recordEpochScore(db, epochId, account, score, drops, ts = Date.now()) {
    db.prepare(`
        INSERT INTO epoch_scores (epoch_id, account, score, drops, ts)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (epoch_id, account) DO UPDATE SET
            score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            drops = CASE WHEN excluded.score > score THEN excluded.drops ELSE drops END,
            ts = CASE WHEN excluded.score > score THEN excluded.ts ELSE ts END
    `).run(epochId, account, score, drops, ts);
}

// ——— History (rendered in the client sidebar) ———

export function addHistory(db, type, payload, ts = Date.now()) {
    db.prepare('INSERT INTO history (type, payload, ts) VALUES (?, ?, ?)').run(
        type, JSON.stringify(payload), ts
    );
    db.prepare(`
        DELETE FROM history WHERE id NOT IN (
            SELECT id FROM history ORDER BY id DESC LIMIT ?
        )
    `).run(XRPL.SCORE_HISTORY_MAX);
}

export function listHistory(db, limit = 12) {
    return db.prepare('SELECT type, payload, ts FROM history ORDER BY id DESC LIMIT ?')
        .all(limit)
        .map((r) => ({ type: r.type, ts: r.ts, ...JSON.parse(r.payload) }));
}

// ——— Wallets / all-time board ———

export function upsertWalletRun(db, account, { score, drops, relics, earned, ledger, ts = Date.now() }) {
    db.prepare(`
        INSERT INTO wallets (account, high_score, total_runs, total_drops, total_relics, total_earned, last_score, last_ledger, last_ts)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (account) DO UPDATE SET
            high_score = CASE WHEN excluded.high_score > high_score THEN excluded.high_score ELSE high_score END,
            total_runs = total_runs + 1,
            total_drops = total_drops + excluded.total_drops,
            total_relics = total_relics + excluded.total_relics,
            total_earned = ROUND(total_earned + excluded.total_earned, 9),
            last_score = excluded.last_score,
            last_ledger = excluded.last_ledger,
            last_ts = excluded.last_ts
    `).run(account, score, drops, relics, earned, score, ledger, ts);
    return db.prepare('SELECT high_score FROM wallets WHERE account = ?').get(account).high_score;
}

export function alltimeBoard(db, limit = 10) {
    return db.prepare(`
        SELECT account, high_score AS score, total_drops AS drops, total_relics AS relics, last_ledger AS ledger, last_ts AS ts
        FROM wallets ORDER BY high_score DESC LIMIT ?
    `).all(limit);
}

// ——— Payout ledger (daily cap + epoch queue) ———

export function paidInWindow(db, sinceMs) {
    const r = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM payouts WHERE status = 'paid' AND executed_ms >= ?"
    ).get(sinceMs);
    return r.total || 0;
}

export function queuePayout(db, { kind, account, amount, status = 'pending', tx = null, note = null, ts = Date.now() }) {
    const res = db.prepare(`
        INSERT INTO payouts (kind, account, amount, status, tx, note, created_ms, executed_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(kind, account, roundXrp(amount), status, tx, note, ts, status === 'paid' ? ts : null);
    return res.lastInsertRowid;
}

export function markPayoutPaid(db, id, tx, ts = Date.now()) {
    db.prepare("UPDATE payouts SET status = 'paid', tx = ?, executed_ms = ? WHERE id = ?").run(tx, ts, id);
}

export function setPayoutStatus(db, id, status) {
    db.prepare('UPDATE payouts SET status = ? WHERE id = ?').run(status, id);
}

export function pendingPayouts(db) {
    return db.prepare("SELECT * FROM payouts WHERE status = 'pending' ORDER BY id").all();
}

/** Payouts whose on-ledger outcome is unknown (crash mid-send) — human eyes only. */
export function reviewPayouts(db) {
    return db.prepare("SELECT * FROM payouts WHERE status = 'review' ORDER BY id").all();
}

export function pruneIntents(db, olderThanMs) {
    db.prepare('DELETE FROM intents WHERE used = 1 OR created_ms < ?').run(olderThanMs);
}
