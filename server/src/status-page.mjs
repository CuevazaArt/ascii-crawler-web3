/** Human-readable operator dashboard for GET / (browser-friendly). */

function fmtXrp(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return `${Number(n).toFixed(4)} XRP`;
}

function fmtMs(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString();
}

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderStatusPage(health, economy) {
    const bags = economy?.bags || {};
    const totals = economy?.totals || {};
    const epoch = economy?.epoch || {};
    const history = (economy?.history || []).slice(0, 8);
    const board = (epoch.board || []).slice(0, 5);

    const historyRows = history.length
        ? history.map((h) => {
            const { type, ts, ...rest } = h;
            const detail = Object.keys(rest).length ? JSON.stringify(rest) : '—';
            return `<tr><td>${esc(type)}</td><td>${esc(fmtMs(ts))}</td><td><code>${esc(detail)}</code></td></tr>`;
        }).join('')
        : '<tr><td colspan="3">No events yet</td></tr>';

    const boardRows = board.length
        ? board.map((r, i) => `<tr><td>#${i + 1}</td><td><code>${esc(r.account?.slice(0, 12))}…</code></td><td>${esc(r.score)}</td></tr>`).join('')
        : '<tr><td colspan="3">No scores this epoch</td></tr>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Leak Runner Operator API</title>
  <style>
    :root { color-scheme: dark; --bg:#0a1218; --panel:#111c24; --line:#1e3a4a; --text:#d8e8f0; --muted:#7a9aaa; --accent:#00e6b8; --warn:#ffe14d; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.45 system-ui, sans-serif; background: var(--bg); color: var(--text); }
    main { max-width: 920px; margin: 0 auto; padding: 20px 16px 32px; }
    h1 { font-size: 1.35rem; margin: 0 0 4px; }
    .lead { color: var(--muted); margin: 0 0 18px; }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-bottom: 16px; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
    .card h2 { margin: 0 0 8px; font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
    .stat { font-size: 1.05rem; font-weight: 700; }
    .ok { color: var(--accent); }
    code, .mono { font-family: ui-monospace, monospace; font-size: 0.82rem; word-break: break-all; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    .links a { color: var(--accent); margin-right: 14px; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #143028; color: var(--accent); font-size: 0.75rem; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>Leak Runner · Operator API</h1>
    <p class="lead">Live rails for stakes, runs, and payouts. JSON endpoints below for the game client.</p>
    <p><span class="pill">${health?.ok ? 'ONLINE' : 'DEGRADED'}</span>
       <span class="pill">${esc(health?.networkLabel || health?.network)}</span></p>

    <div class="grid">
      <div class="card"><h2>Operator</h2><div class="stat mono">${esc(health?.operator)}</div></div>
      <div class="card"><h2>Balance</h2><div class="stat ok">${esc(fmtXrp(health?.operatorBalance))}</div></div>
      <div class="card"><h2>Paid (24h)</h2><div class="stat">${esc(fmtXrp(health?.paid24h))}</div></div>
      <div class="card"><h2>Daily cap</h2><div class="stat">${esc(fmtXrp(health?.dailyCap))}</div></div>
      <div class="card"><h2>Entry stake</h2><div class="stat">${esc(fmtXrp(economy?.stake))}</div></div>
      <div class="card"><h2>Epoch</h2><div class="stat">#${esc(epoch?.id ?? health?.epoch)}</div><div class="mono">${esc(fmtMs(epoch?.endsMs))} end</div></div>
    </div>

    <div class="grid">
      <div class="card"><h2>Jackpot bag</h2><div class="stat">${esc(fmtXrp(bags.jackpot))}</div></div>
      <div class="card"><h2>Top-N bag</h2><div class="stat">${esc(fmtXrp(bags.topN))}</div></div>
      <div class="card"><h2>Milestones</h2><div class="stat">${esc(fmtXrp(bags.milestones))}</div></div>
      <div class="card"><h2>Total staked</h2><div class="stat">${esc(fmtXrp(totals.staked))}</div></div>
      <div class="card"><h2>Total paid</h2><div class="stat">${esc(fmtXrp(totals.paid))}</div></div>
      <div class="card"><h2>Reserve</h2><div class="stat">${esc(fmtXrp(bags.reserve))}</div></div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <h2>Epoch leaderboard (top 5)</h2>
      <table><thead><tr><th>Rank</th><th>Account</th><th>Score</th></tr></thead><tbody>${boardRows}</tbody></table>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h2>Recent activity</h2>
      <table><thead><tr><th>Kind</th><th>When</th><th>Payload</th></tr></thead><tbody>${historyRows}</tbody></table>
    </div>

    <div class="card links">
      <h2>JSON endpoints</h2>
      <p>
        <a href="/api/health">/api/health</a>
        <a href="/api/leaderboard">/api/leaderboard</a>
        <a href="/api">/api</a>
      </p>
      <p class="mono" style="color:var(--muted);margin:8px 0 0">
        POST /api/run/intent · /api/run/start · /api/run/events · /api/run/settle
      </p>
    </div>
  </main>
</body>
</html>`;
}

export function apiIndex() {
    return {
        name: 'Leak Runner Operator API',
        ok: true,
        endpoints: {
            'GET /': 'HTML status dashboard',
            'GET /api': 'This JSON index',
            'GET /api/health': 'Network, operator, balance, caps',
            'GET /api/leaderboard': 'Economy snapshot, epoch board, history',
            'GET /api/account?account=r…': 'Wallet balance (CORS-safe proxy)',
            'POST /api/run/intent': '{ account, stake? }',
            'POST /api/run/start': '{ account, intentId, txHash }',
            'POST /api/run/events': '{ runId, token, events[] }',
            'POST /api/run/settle': '{ runId, token, stats }',
            'POST /api/admin/pending': '{ token }',
            'POST /api/admin/approve': '{ token }'
        }
    };
}
