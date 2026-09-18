/**
 * Standalone HTML forensic replay for a sealed incident bundle.
 * No CDN, no eval - open replay.html offline after extract.
 */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function embedJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function sanitizeSealedEvent(event = {}) {
  return {
    ts: Number(event.ts) || 0,
    type: String(event.type || 'unknown').slice(0, 80),
    ip: event.ip ? String(event.ip).slice(0, 64) : null,
    score: Number(event.score) || 0,
    plane: String(event.plane || '').slice(0, 32),
    persona: String(event.detail?.persona || event.persona || '').slice(0, 48) || null,
  };
}

function fmtTs(ts) {
  if (!ts) return ' - ';
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return String(ts);
  }
}

/**
 * Self-contained sealed replay page (print → PDF). Keyboard: j/k or arrows.
 */
export function renderSealedReplayHtml(input = {}) {
  const label = String(input.label || 'incident').slice(0, 64);
  const events = (input.events || []).slice(0, 1000).map(sanitizeSealedEvent);
  const manifest = input.manifest || { items: [], manifestHash: '' };
  const timeline = input.timeline || { branches: [], eventCount: events.length };
  const status = input.status || {};
  const ledgerRoot = input.ledgerRoot || status.ledger?.root || status.trust?.ledgerRoot || null;
  const generatedAt = input.generatedAt || Date.now();

  const rows = events
    .map(
      (e, i) =>
        `<tr data-idx="${i}"><td>${i + 1}</td><td>${esc(fmtTs(e.ts))}</td><td>${esc(e.plane || ' - ')}</td><td>${esc(e.type)}</td><td>${esc(e.ip || ' - ')}</td><td>${esc(e.score)}</td></tr>`,
    )
    .join('');

  const files = (manifest.items || [])
    .map(
      (item) =>
        `<tr><td>${esc(item.path)}</td><td>${esc(item.size)}</td><td><code>${esc(item.sha256)}</code></td></tr>`,
    )
    .join('');

  const branches = (timeline.branches || [])
    .map(
      (b, i) =>
        `<li>Branch ${i + 1} · ${esc(b.id)} · ${b.events?.length || 0} events${b.forkReason ? ` · fork ${esc(b.forkReason)}` : ''}</li>`,
    )
    .join('');

  const payload = {
    label,
    manifestHash: manifest.manifestHash || '',
    ledgerRoot,
    events,
    branches: (timeline.branches || []).map((b) => ({
      id: b.id,
      forkReason: b.forkReason || null,
      count: b.events?.length || 0,
    })),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="referrer" content="no-referrer"/>
  <title>Sealed replay - ${esc(label)}</title>
  <style>
    :root {
      --bg: #1c2428; --ink: #e6eef0; --muted: #8eb8c8; --teal: #5ec8c0;
      --panel: #243036; --line: #3a4a50;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 1.5rem 1.25rem 3rem;
      font-family: system-ui, Segoe UI, sans-serif;
      background: var(--bg); color: var(--ink); line-height: 1.5;
    }
    main { max-width: 52rem; margin: 0 auto; }
    h1 { font-size: 1.45rem; margin: 0 0 .35rem; }
    h2 { font-size: 1.05rem; color: var(--teal); margin: 1.6rem 0 .6rem; }
    .meta, footer { color: var(--muted); font-size: .85rem; }
    code { font-size: .82em; word-break: break-all; }
    .hash { display: block; margin: .35rem 0 1rem; color: var(--teal); }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { text-align: left; padding: .4rem .45rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    tr[data-idx].active { background: var(--panel); outline: 1px solid var(--teal); }
    .legal { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--line); }
    kbd { border: 1px solid var(--line); border-radius: 4px; padding: 0 .3rem; font-size: .8em; }
    @media print {
      body { background: #fff; color: #111; }
      .noprint { display: none; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="meta">Ghost Continuum · sealed forensic replay · defensive only</p>
      <h1>${esc(label)}</h1>
      <p class="meta">Sealed ${esc(fmtTs(generatedAt))} · ${events.length} events · ${timeline.branches?.length || 0} branches</p>
      <code class="hash" id="manifestHash">manifest ${esc(manifest.manifestHash || ' - ')}</code>
      ${ledgerRoot ? `<p class="meta">Ledger head at seal: <code>${esc(String(ledgerRoot).slice(0, 64))}</code></p>` : ''}
    </header>

    <section aria-labelledby="integrity-h">
      <h2 id="integrity-h">Integrity</h2>
      <p class="meta noprint">Verify this folder later with <code>ghost-continuum verify</code> (or pass this directory / the <code>.tgz</code>).</p>
      <table>
        <thead><tr><th>File</th><th>Bytes</th><th>SHA-256</th></tr></thead>
        <tbody>${files || '<tr><td colspan="3">No evidence files</td></tr>'}</tbody>
      </table>
    </section>

    <section aria-labelledby="branches-h">
      <h2 id="branches-h">Time-machine branches</h2>
      <ol>${branches || '<li>Single timeline</li>'}</ol>
    </section>

    <section aria-labelledby="events-h">
      <h2 id="events-h">Events</h2>
      <p class="meta noprint">Step with <kbd>j</kbd>/<kbd>k</kbd> or arrow keys. Print this page for a PDF brief.</p>
      <table>
        <thead><tr><th>#</th><th>When</th><th>Plane</th><th>Type</th><th>IP</th><th>Score</th></tr></thead>
        <tbody id="eventRows">${rows || '<tr><td colspan="6">No events in this seal</td></tr>'}</tbody>
      </table>
    </section>

    <footer class="legal">
      <p>Local-first evidence. Data stayed on the operator machine until this file was copied. No exploit payloads. Authorized networks only.</p>
    </footer>
  </main>
  <script type="application/json" id="sealed-payload">${embedJson(payload)}</script>
  <script>
    (function () {
      var rows = document.querySelectorAll('#eventRows tr[data-idx]');
      if (!rows.length) return;
      var i = 0;
      function paint() {
        for (var r = 0; r < rows.length; r++) rows[r].classList.toggle('active', r === i);
        rows[i].scrollIntoView({ block: 'nearest' });
      }
      paint();
      document.addEventListener('keydown', function (e) {
        if (e.key === 'j' || e.key === 'ArrowDown') { i = Math.min(rows.length - 1, i + 1); paint(); e.preventDefault(); }
        if (e.key === 'k' || e.key === 'ArrowUp') { i = Math.max(0, i - 1); paint(); e.preventDefault(); }
      });
    })();
  </script>
</body>
</html>
`;
}
