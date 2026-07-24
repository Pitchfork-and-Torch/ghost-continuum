import http from 'http';
import { readRecentEvents } from './state.js';
import { PERSONA_META } from './topology.js';
import { listDossiers } from './ops/dossier.js';

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ghost LAN</title>
<style>
  :root {
    --bg: #0a0e14;
    --panel: #111820;
    --border: #1e2a38;
    --text: #b8c5d6;
    --muted: #5c6b7f;
    --accent: #39bae6;
    --warn: #ff8f40;
    --danger: #f07178;
    --ok: #7fd962;
    --glow: rgba(57, 186, 230, 0.15);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -20%, var(--glow), transparent),
      linear-gradient(180deg, #0a0e14 0%, #0d1219 100%);
  }
  header {
    padding: 1.5rem 2rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }
  h1 {
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .tagline { font-size: 0.75rem; color: var(--muted); margin-top: 0.25rem; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
    padding: 1.5rem 2rem;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem;
  }
  .card h2 {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
    margin-bottom: 0.75rem;
  }
  .persona-display {
    font-size: 2rem;
    line-height: 1.2;
  }
  .persona-name { font-size: 1.1rem; color: #fff; }
  .build-id {
    font-family: "Cascadia Code", "Consolas", monospace;
    font-size: 0.8rem;
    color: var(--accent);
    word-break: break-all;
  }
  .stat-row { display: flex; justify-content: space-between; padding: 0.35rem 0; font-size: 0.9rem; }
  .stat-val { color: #fff; font-weight: 500; }
  .ports {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .port {
    font-family: monospace;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    background: #1a2332;
    border: 1px solid var(--border);
    color: var(--ok);
  }
  .events {
    grid-column: 1 / -1;
    max-height: 420px;
    overflow-y: auto;
  }
  .event {
    font-family: monospace;
    font-size: 0.78rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    display: grid;
    grid-template-columns: 90px 120px 1fr;
    gap: 0.75rem;
    align-items: start;
  }
  .event-time { color: var(--muted); }
  .event-type { color: var(--warn); }
  .event-type.honeypot-http, .event-type.honeypot-tcp { color: var(--danger); }
  .event-type.rotate { color: var(--accent); }
  .event-detail { color: var(--text); word-break: break-word; }
  button {
    background: transparent;
    border: 1px solid var(--accent);
    color: var(--accent);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    transition: background 0.15s, color 0.15s;
  }
  button:hover { background: var(--accent); color: var(--bg); }
  .pulse {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--ok);
    display: inline-block;
    margin-right: 0.5rem;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(127, 217, 98, 0.4); }
    50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(127, 217, 98, 0); }
  }
</style>
</head>
<body>
<header>
  <div>
    <h1><span class="pulse"></span>Ghost LAN Sentinel</h1>
    <p class="tagline">Polymorphic deception layer — local network only</p>
  </div>
  <button id="rotateBtn" type="button">Morph Persona</button>
</header>
<main class="grid">
  <section class="card">
    <h2>Active Persona</h2>
    <div class="persona-display" id="personaIcon">◌</div>
    <div class="persona-name" id="personaName">—</div>
    <p class="build-id" id="buildId">—</p>
  </section>
  <section class="card">
    <h2>Telemetry</h2>
    <div class="stat-row"><span>Generation</span><span class="stat-val" id="gen">—</span></div>
    <div class="stat-row"><span>Total hits</span><span class="stat-val" id="hits">—</span></div>
    <div class="stat-row"><span>LAN IP</span><span class="stat-val" id="lanIp">—</span></div>
    <div class="stat-row"><span>Tripwire</span><span class="stat-val" id="tripwire">—</span></div>
  </section>
  <section class="card">
    <h2>Honeypot Ports</h2>
    <div class="ports" id="ports"></div>
  </section>
  <section class="card">
    <h2>Probe Dossiers</h2>
    <div id="dossiers" style="font-family:monospace;font-size:0.75rem;max-height:200px;overflow-y:auto"></div>
  </section>
  <section class="card events">
    <h2>Event Stream</h2>
    <div id="events"></div>
  </section>
</main>
<script>
  const $ = (id) => document.getElementById(id);

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString();
  }

  function fmtDetail(ev) {
    const d = ev.detail || {};
    if (ev.ip) return ev.ip + (d.port ? ':' + d.port : '') + (d.url ? ' ' + d.url : '') + (d.ua ? ' · ' + d.ua.slice(0, 40) : '');
    if (d.reason) return d.reason + (d.toPersona ? ' → ' + d.toPersona : '');
    return JSON.stringify(d).slice(0, 120);
  }

  function renderStatus(s) {
    $('personaIcon').textContent = s.personaIcon || '◌';
    $('personaName').textContent = s.personaLabel || s.persona;
    $('buildId').textContent = s.buildId;
    $('gen').textContent = (s.generation ?? '-') + ' / p' + (s.morphPhase ?? 0);
    $('hits').textContent = s.totalHits;
    $('lanIp').textContent = s.lanIp;
    $('tripwire').textContent = s.beaconEnabled ? 'armed' : 'local';
    $('ports').innerHTML = (s.ports || []).map(p => '<span class="port">' + p + '</span>').join('');
  }

  function renderEvents(events) {
    $('events').innerHTML = events.map(ev => {
      const cls = (ev.type || '').replace(/[^a-z-]/g, '');
      return '<div class="event"><span class="event-time">' + fmtTime(ev.ts) + '</span><span class="event-type ' + cls + '">' + (ev.type || '?') + '</span><span class="event-detail">' + fmtDetail(ev) + '</span></div>';
    }).join('') || '<p style="color:var(--muted);padding:1rem 0">No events yet. Your LAN is quiet.</p>';
  }

  function renderDossiers(rows) {
    $('dossiers').innerHTML = rows.length ? rows.map(d =>
      '<div style="padding:0.35rem 0;border-bottom:1px solid var(--border)">' +
      d.ip + ' · ' + (d.probeClass || '?') + ' · hits ' + (d.hits || 0) +
      (d.lastUrl ? ' · ' + d.lastUrl.slice(0,40) : '') + '</div>'
    ).join('') : '<p style="color:var(--muted)">No probes surveyed yet.</p>';
  }

  async function refresh() {
    const [status, events, dossiers] = await Promise.all([
      fetch('/api/status').then(r => r.json()),
      fetch('/api/events').then(r => r.json()),
      fetch('/api/dossiers').then(r => r.json()),
    ]);
    renderStatus(status);
    renderEvents(events);
    renderDossiers(dossiers);
  }

  $('rotateBtn').addEventListener('click', async () => {
    await fetch('/api/rotate', { method: 'POST' });
    refresh();
  });

  refresh();
  setInterval(refresh, 3000);

  const es = new EventSource('/api/events/stream');
  es.onmessage = () => refresh();
</script>
</body>
</html>`;

export function startDashboard({ config, getState, rotatePersona, port = 29999 }) {
  let lastEventCount = 0;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (url.pathname === '/' || url.pathname === '/dashboard') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(DASHBOARD_HTML);
    }

    if (url.pathname === '/api/status') {
      const s = getState();
      const meta = PERSONA_META[s.persona] || {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          ok: true,
          ...s,
          personaLabel: meta.label,
          personaIcon: meta.icon,
          lanIp: config.lanIp,
          beaconEnabled: config.beaconEnabled,
          tripwireUrl: config.tripwireUrl,
          dashboardPort: port,
        }),
      );
    }

    if (url.pathname === '/api/events') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(readRecentEvents(limit)));
    }

    if (url.pathname === '/api/events/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('data: connected\n\n');
      const timer = setInterval(() => {
        const events = readRecentEvents(1);
        if (events.length !== lastEventCount) {
          lastEventCount = events.length;
          res.write('data: tick\n\n');
        }
      }, 1500);
      req.on('close', () => clearInterval(timer));
      return;
    }

    if (url.pathname === '/api/dossiers') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(listDossiers(25)));
    }

    if (url.pathname === '/api/rotate' && req.method === 'POST') {
      await rotatePersona('dashboard');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, state: getState() }));
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`  Dashboard port ${port} busy — honeypots still active`);
      } else {
        console.warn(`  Dashboard error: ${err.message}`);
      }
      resolve(null);
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}