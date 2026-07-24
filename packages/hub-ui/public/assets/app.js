/**
 * Ghost Continuum v3.0 OMEGA ASCENDANT — Command Nexus orchestrator.
 * Data-driven, real-time: status poll + SSE push → holographic map, gauge, timeline.
 */

import { createHoloMap } from './holo-map.js';
import { createGhostVoice, narrateEvent } from './ghost-voice.js';
import { bootHome, refreshHome } from './home.js';
import { createOperatorSentinel } from './operator-sentinel.js';
import {
  decorateScene,
  decorateNode,
  setNodeMeta,
  clearNodeMeta,
  getNodeMeta,
  NODE_SHAPES,
} from './node-meta.js';

const $ = (id) => document.getElementById(id);
const VERSION = '3.0.0';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hubAuthHeaders(extra = {}) {
  const token = localStorage.getItem('dm-hub-token') || window.__GC_HUB_TOKEN;
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiFetch(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const headers = hubAuthHeaders(opts.headers || {});
  if (method !== 'GET' && opts.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...opts, headers });
}

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

// ── State ──────────────────────────────────────────────────
let holo = null;
let voice = null;
let lastStatus = null;
let lastHolo = null;
let lastOmega = null;
let markers = [];
let efficacyHistory = [];
let scrubPlaying = false;
let scrubTimer = null;
let sse = null;
/** 'live' = real events only; 'demo' = cinematic fabric */
let mapMode = localStorage.getItem('gc-map-mode') || 'live';
let lastThreatWatch = null;
let lastThreatAssess = null;
let responding = false;
let operatorSentinel = null;

function syncOperatorMood(extra = {}) {
  if (!operatorSentinel) return;
  operatorSentinel.setNexusState({
    mapMode,
    verdict: lastThreatWatch?.verdict || 'CLEAR',
    severity: lastThreatWatch?.severity || 'none',
    topScore: lastThreatWatch?.topScore || 0,
    armed: lastStatus?.armed,
    ...extra,
  });
}

// ── Clock ──────────────────────────────────────────────────
function tickClock() {
  const el = $('nxClock');
  if (el) {
    const d = new Date();
    el.textContent = d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }
}

// ── Gauge ──────────────────────────────────────────────────
const GAUGE_C = 2 * Math.PI * 78;

function setGauge(pct) {
  const score = Math.max(0, Math.min(100, Number(pct) || 0));
  const fill = $('gaugeFill');
  const label = $('gaugePct');
  if (fill) fill.style.strokeDashoffset = String(GAUGE_C * (1 - score / 100));
  if (label) label.textContent = `${Math.round(score)}%`;
  efficacyHistory.push(score);
  if (efficacyHistory.length > 48) efficacyHistory.shift();
  drawSparkline();
}

function drawSparkline() {
  const c = $('efficacySpark');
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  ctx.clearRect(0, 0, w, h);
  if (efficacyHistory.length < 2) return;
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  efficacyHistory.forEach((v, i) => {
    const x = (i / (efficacyHistory.length - 1)) * w;
    const y = h - (v / 100) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.strokeStyle = 'rgba(179,136,255,0.5)';
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,229,255,0.08)';
  ctx.fill();
}

// ── Morph UI ───────────────────────────────────────────────
function setMorphUi(morphId) {
  document.body.classList.remove('morph-stealth', 'morph-research', 'morph-aggressive', 'morph-forensic');
  document.body.classList.add(`morph-${morphId || 'research'}`);
  document.querySelectorAll('.morph-btn').forEach((btn) => {
    const on = btn.dataset.morph === morphId;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  const st = $('stMorph');
  if (st) st.textContent = String(morphId || 'research').toUpperCase();
  holo?.setMorph?.(morphId);
}

async function switchMorph(morphId) {
  try {
    const res = await apiFetch('/api/continuum/morph', {
      method: 'POST',
      body: JSON.stringify({ morph: morphId }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Morph failed');
    setMorphUi(morphId);
    toast(`Sentinel morph → ${morphId.toUpperCase()}`);
    narrateEvent(voice, 'morph-switch', { morph: morphId });
    operatorSentinel?.pulse?.('morph', 2200);
    await refreshHolo({ bust: true });
  } catch (e) {
    toast(e.message || 'Morph switch failed');
  }
}

// ── Chad leaderboard ───────────────────────────────────────
function renderChad(board = []) {
  const el = $('chadBoard');
  if (!el) return;
  if (!board.length) {
    el.innerHTML = '<div class="meta-dim">No genomes yet — evolve the pool.</div>';
    return;
  }
  el.innerHTML = board
    .map(
      (g) => `
    <div class="chad-row rank-${g.rank}">
      <span class="chad-rank">#${g.rank}</span>
      <div>
        <div class="chad-title">${escapeHtml(g.title)}</div>
        <div class="chad-meta">${escapeHtml(g.archetype)} · gen ${g.generation} · ${escapeHtml(g.shortId)}</div>
      </div>
      <span class="chad-fit">${g.fitness}</span>
    </div>`,
    )
    .join('');
}

// ── Planes (enable/disable toggles for all 7 sensor planes) ─
const PLANE_CATALOG = [
  {
    id: 'ghost-lan',
    label: 'Ghost LAN',
    blurb: 'LAN honeypots',
    core: true,
    explain:
      'Polymorphic honeypots on your local network that look like NAS boxes, routers, or cameras. They rotate personas and feed the deception genome when something probes them.',
  },
  {
    id: 'edge',
    label: 'Edge',
    blurb: 'Perimeter tripwires',
    core: true,
    explain:
      'Internet-facing tripwires (Cloudflare Worker or local edge). Catches scanners and bots at the perimeter before they reach your real services.',
  },
  {
    id: 'audit',
    label: 'Audit',
    blurb: 'Scope validation',
    core: true,
    explain:
      'Authorized scope checks and validation probes. Keeps operations inside allowlisted networks and records what was tested.',
  },
  {
    id: 'narrative-weave',
    label: 'Narrative Weave',
    blurb: 'Phantom personas',
    core: false,
    explain:
      'Optional story layer: phantom admin personas and fake world state so engaged attackers waste time in convincing decoys. Opt-in; may use a local LLM.',
  },
  {
    id: 'phantom-mesh',
    label: 'Phantom Mesh',
    blurb: 'Federated gossip',
    core: false,
    explain:
      'Optional peer gossip of anonymized deception strategies with other Ghost Continuum nodes you trust. You keep local control.',
  },
  {
    id: 'deep-veil',
    label: 'Deep Veil',
    blurb: 'Kernel probes',
    core: false,
    explain:
      'Optional low-level / kernel-adjacent sensors (e.g. eBPF on Linux). Advanced; leave off unless you know you need it.',
  },
  {
    id: 'mirage-core',
    label: 'Mirage Core',
    blurb: 'Container decoys',
    core: false,
    explain:
      'Optional containerized high-interaction decoys. Spins disposable mirages to absorb deeper engagement. Resource-heavy; opt-in.',
  },
  {
    id: 'trench-cloak',
    label: 'Trench Coat',
    blurb: 'Privacy cloak',
    core: false,
    explain:
      'Legal-first multi-hop privacy cloak (Tor / SOCKS). Toggle on to arm monitoring and optional auto-start. Other Ghost tools can use the cloak proxy when cloaked. Site: https://trenchcoat.jonbailey.xyz/ · API: /api/trench/status',
  },
];

let selectedNode = null;

const PLANE_COLORS = {
  'ghost-lan': '#69f0ae',
  edge: '#00e5ff',
  audit: '#b388ff',
  'narrative-weave': '#ffab40',
  'phantom-mesh': '#e040fb',
  'deep-veil': '#7c4dff',
  'mirage-core': '#ff5252',
  'trench-cloak': '#00ff9f',
};

const CORE_PLANE_STATUS_KEY = { 'ghost-lan': 'lan', edge: 'edge', audit: 'audit' };

function mergePlaneList(status) {
  const fromContinuum = status?.continuum?.planes || [];
  const byId = Object.fromEntries(fromContinuum.map((p) => [p.id, p]));
  return PLANE_CATALOG.map((cat) => {
    const live = byId[cat.id] || {};
    const coreKey = CORE_PLANE_STATUS_KEY[cat.id];
    const coreLive = coreKey && status?.planes?.[coreKey] ? status.planes[coreKey] : null;
    const enabled =
      live.enabled !== undefined
        ? live.enabled !== false
        : coreLive
          ? coreLive.enabled !== false
          : cat.core; // core default on, opt-in default off unless API says otherwise
    const armed =
      live.armed === true ||
      (coreLive?.armed === true && enabled);
    return {
      id: cat.id,
      label: live.label || cat.label,
      blurb: cat.blurb,
      core: cat.core,
      enabled,
      armed: armed && enabled,
      cloaked: live.cloaked === true || live.details?.cloaked === true,
      proxyUrl: live.proxyUrl || live.details?.proxyUrl || null,
      message: live.message || '',
      optIn: !cat.core,
    };
  });
}

function renderPlanes(status) {
  const el = $('planeShells');
  if (!el) return;
  const planes = mergePlaneList(status);
  el.innerHTML = planes
    .map((p) => {
      const color = PLANE_COLORS[p.id] || '#00e5ff';
      const en = p.enabled;
      const cloaked = p.cloaked === true;
      const stateClass = !en ? 'off' : cloaked ? 'on' : p.armed ? 'on' : 'standby';
      const stateLabel = !en ? 'OFF' : cloaked ? 'CLOAK' : p.armed ? 'ARMED' : 'STBY';
      const switchId = `plane-sw-${p.id}`;
      const blurbExtra =
        p.id === 'trench-cloak' && en && p.proxyUrl
          ? ` · ${escapeHtml(p.proxyUrl)}`
          : '';
      return `<div class="plane-row ${en ? 'plane-on' : 'plane-off'}${cloaked ? ' plane-cloaked' : ''}" data-plane-id="${escapeHtml(p.id)}">
        <span class="plane-dot" style="background:${color};color:${color}" aria-hidden="true"></span>
        <div class="plane-meta">
          <span class="name" data-plane-tip="${escapeHtml(p.id)}" tabindex="0">${escapeHtml(p.label)}</span>
          <span class="blurb">${escapeHtml(p.blurb)}${p.optIn ? ' · opt-in' : ''}${blurbExtra}</span>
        </div>
        <span class="state ${stateClass}" data-plane-state="${escapeHtml(p.id)}">${stateLabel}</span>
        <label class="plane-switch" title="${en ? 'Disable' : 'Enable'} ${escapeHtml(p.label)}">
          <input type="checkbox" id="${switchId}" data-plane-toggle="${escapeHtml(p.id)}"
            ${en ? 'checked' : ''} role="switch" aria-checked="${en ? 'true' : 'false'}"
            aria-label="${escapeHtml(p.label)} plane ${en ? 'enabled' : 'disabled'}" />
          <span class="plane-slider" style="--plane-accent:${color}"></span>
        </label>
      </div>`;
    })
    .join('');

  el.querySelectorAll('[data-plane-toggle]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const planeId = e.currentTarget.getAttribute('data-plane-toggle');
      const nextEnabled = e.currentTarget.checked;
      handlePlaneToggle(planeId, nextEnabled, e.currentTarget);
    });
  });

  // Glass explainers on plane name hover / focus
  el.querySelectorAll('[data-plane-tip]').forEach((nameEl) => {
    const show = (ev) => showPlaneTip(nameEl.getAttribute('data-plane-tip'), ev);
    const hide = () => hidePlaneTip();
    nameEl.addEventListener('mouseenter', show);
    nameEl.addEventListener('mousemove', show);
    nameEl.addEventListener('mouseleave', hide);
    nameEl.addEventListener('focus', show);
    nameEl.addEventListener('blur', hide);
  });
}

const PLANE_EXPLAIN = Object.fromEntries(PLANE_CATALOG.map((p) => [p.id, p]));

function showPlaneTip(planeId, ev) {
  const tip = $('planeTip');
  const cat = PLANE_EXPLAIN[planeId];
  if (!tip || !cat) return;
  tip.hidden = false;
  tip.innerHTML = `<strong>${escapeHtml(cat.label)}</strong><div class="tip-blurb">${escapeHtml(cat.explain || cat.blurb)}</div>`;
  const x = ev?.clientX ?? 0;
  const y = ev?.clientY ?? 0;
  const pad = 14;
  let left = x + pad;
  let top = y + pad;
  // Keep on-screen
  requestAnimationFrame(() => {
    const r = tip.getBoundingClientRect();
    if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  });
}

function hidePlaneTip() {
  const tip = $('planeTip');
  if (tip) tip.hidden = true;
}

async function handlePlaneToggle(planeId, nextEnabled, inputEl) {
  if (!planeId) return;
  if (inputEl) {
    inputEl.disabled = true;
    inputEl.closest('.plane-row')?.classList.add('pending');
  }
  const stateEl = document.querySelector(`[data-plane-state="${planeId}"]`);
  if (stateEl) {
    stateEl.textContent = '…';
    stateEl.className = 'state standby';
  }
  try {
    const res = await apiFetch('/api/continuum/planes/toggle', {
      method: 'POST',
      body: JSON.stringify({ planeId, enabled: nextEnabled }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Plane toggle failed');
    const label = PLANE_CATALOG.find((p) => p.id === planeId)?.label || planeId;
    if (!j.enabled) toast(`${label} offline`);
    else if (j.armed) toast(`${label} armed`);
    else toast(`${label} enabled · standing by`);
    voice?.speak?.(`${label} ${j.enabled ? (j.armed ? 'armed' : 'enabled') : 'disabled'}.`);
    await refreshStatus({ bust: true });
    await refreshHolo({ bust: true });
    await refreshOmega();
  } catch (e) {
    toast(e.message || 'Plane toggle failed');
    // Revert checkbox
    if (inputEl) inputEl.checked = !nextEnabled;
    if (lastStatus) renderPlanes(lastStatus);
  } finally {
    if (inputEl) {
      inputEl.disabled = false;
      inputEl.closest('.plane-row')?.classList.remove('pending');
    }
  }
}

// ── Timeline ───────────────────────────────────────────────
function renderMarkers(list = []) {
  markers = list;
  const wrap = $('tmMarkers');
  const labels = $('tmLabels');
  if (!wrap) return;
  const min = list[0]?.ts || Date.now() - 86400000;
  const max = list[list.length - 1]?.ts || Date.now();
  const span = Math.max(1, max - min);

  wrap.innerHTML = list
    .map((m) => {
      const pct = ((m.ts - min) / span) * 100;
      return `<div class="tm-marker" style="left:${pct}%;color:${m.color || '#e040fb'}">
        <span class="dot" style="background:currentColor"></span>
        <span class="lab">${escapeHtml(m.label)}</span>
      </div>`;
    })
    .join('');

  if (labels) {
    const fmt = (ts) => new Date(ts).toISOString().slice(11, 16);
    labels.innerHTML = list.length
      ? `<span>${fmt(min)}</span><span>${fmt(min + span / 2)}</span><span>${fmt(max)}</span>`
      : '<span>14:07</span><span>NOW</span>';
  }
}

function applyScrub(value) {
  const t = Number(value) / 1000;
  holo?.setScrub?.(t);
  const el = $('tmTs');
  if (el) {
    if (t >= 0.995) el.textContent = 'LIVE';
    else {
      const range = lastHolo?.timeRange;
      if (range) {
        const ts = range.min + t * (range.max - range.min);
        el.textContent = new Date(ts).toISOString().slice(11, 19) + 'Z';
      } else el.textContent = `${Math.round(t * 100)}%`;
    }
  }
}

// ── Node popover / modal ───────────────────────────────────
function fillShapeSelect(selected) {
  const sel = $('niShape');
  if (!sel) return;
  sel.innerHTML = NODE_SHAPES.map(
    (s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${escapeHtml(s.label)}</option>`,
  ).join('');
}

function openNodeInspector(rawNode) {
  if (!rawNode) return;
  const node = decorateNode(rawNode);
  selectedNode = node;
  const panel = $('nodeInspector');
  const title = $('niTitle');
  const body = $('niBody');
  if (!panel || !body) return;

  const display = node.displayLabel || node.label || node.id;
  if (title) title.textContent = display;

  const meta = getNodeMeta(node.id);
  const isBreach = node.state === 'breach' || node.state === 'threat' || (node.score || 0) >= 6;
  const planeCat = PLANE_EXPLAIN[node.planeShell || node.plane] || PLANE_EXPLAIN[node.plane === 'lan' ? 'ghost-lan' : node.plane];
  const ts = node.ts ? new Date(node.ts).toISOString() : '—';
  const pos = node.position || {};
  const detail = node.detail || {};

  body.innerHTML = `
    <div style="margin-bottom:10px">
      <span class="ni-badge ${escapeHtml(node.state || '')}">${escapeHtml(String(node.state || 'unknown').toUpperCase())}</span>
      ${isBreach ? '<span class="ni-badge breach" style="margin-left:6px">PRIORITY</span>' : ''}
    </div>
    <div class="ni-grid">
      <span class="k">ID</span><span class="v">${escapeHtml(node.id)}</span>
      <span class="k">Label</span><span class="v">${escapeHtml(display)}</span>
      <span class="k">State</span><span class="v">${escapeHtml(node.state || '—')}</span>
      <span class="k">Plane</span><span class="v">${escapeHtml(node.plane || node.planeShell || '—')}</span>
      <span class="k">TTP</span><span class="v">${escapeHtml(node.ttp || '—')}</span>
      <span class="k">Score</span><span class="v">${node.score ?? '—'}</span>
      <span class="k">IP</span><span class="v">${escapeHtml(node.ip || '—')}</span>
      <span class="k">Type</span><span class="v">${escapeHtml(node.type || '—')}</span>
      <span class="k">Genome</span><span class="v">${escapeHtml(node.genomeId || '—')}</span>
      <span class="k">Morph</span><span class="v">${escapeHtml(node.morphState || '—')}</span>
      <span class="k">Fitness</span><span class="v">${node.fitness ?? '—'}</span>
      <span class="k">Shape</span><span class="v">${escapeHtml(node.shape || 'sphere')}</span>
      <span class="k">Event</span><span class="v">${escapeHtml(node.eventId || '—')}</span>
      <span class="k">Time</span><span class="v">${escapeHtml(ts)}</span>
      <span class="k">Position</span><span class="v">${[pos.x, pos.y, pos.z].map((n) => (n != null ? Number(n).toFixed(2) : '—')).join(', ')}</span>
      <span class="k">Success</span><span class="v">${node.success === true ? 'yes' : node.success === false ? 'no' : '—'}</span>
      <span class="k">Core</span><span class="v">${node.isCore ? 'NEXUS immune core' : 'no'}</span>
    </div>
    ${
      planeCat
        ? `<div class="ni-section"><h4>PLANE CONTEXT</h4><p style="margin:0;color:var(--text-dim);font-size:0.75rem">${escapeHtml(planeCat.explain || planeCat.blurb)}</p></div>`
        : ''
    }
    ${
      meta.notes
        ? `<div class="ni-section"><h4>OPERATOR NOTES</h4><p style="margin:0;color:var(--text-dim)">${escapeHtml(meta.notes)}</p></div>`
        : ''
    }
    <div class="ni-section">
      <h4>RAW DETAIL</h4>
      <div class="ni-json">${escapeHtml(JSON.stringify(detail && Object.keys(detail).length ? detail : { note: 'No detail payload' }, null, 2))}</div>
    </div>
    <div class="ni-section" style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="nx-btn sm accent" id="btnEvolveNode">EVOLVE</button>
      ${isBreach ? '<button type="button" class="nx-btn sm primary" id="btnRespondNode">RESPOND</button>' : ''}
      <button type="button" class="nx-btn sm" id="btnFocusNode">FOCUS CAM</button>
    </div>
    <p class="legal-mini" style="margin-top:10px">Edits stay in this browser (localStorage). Ledger/export still use system event data.</p>
  `;

  fillShapeSelect(node.shape || 'sphere');
  if ($('niRename')) $('niRename').value = meta.customLabel || '';
  if ($('niNotes')) $('niNotes').value = meta.notes || '';

  panel.hidden = false;
  holo?.focusNode?.(node.id);

  body.querySelector('#btnEvolveNode')?.addEventListener('click', () => evolvePool());
  body.querySelector('#btnRespondNode')?.addEventListener('click', () => {
    runThreatRespond({ mode: 'full', ip: node.ip, nodeId: node.label || node.id });
  });
  body.querySelector('#btnFocusNode')?.addEventListener('click', () => holo?.focusNode?.(node.id));
}

function closeNodeInspector() {
  const panel = $('nodeInspector');
  if (panel) panel.hidden = true;
  selectedNode = null;
  holo?.clearSelection?.();
}

function saveNodeCustomization() {
  if (!selectedNode?.id) return;
  const customLabel = $('niRename')?.value?.trim() || '';
  const shape = $('niShape')?.value || 'sphere';
  const notes = $('niNotes')?.value?.trim() || '';
  setNodeMeta(selectedNode.id, { customLabel, shape, notes });
  const displayLabel = customLabel || selectedNode.label || selectedNode.id;
  holo?.updateNodeAppearance?.(selectedNode.id, { displayLabel, shape });
  // Keep inspector in sync
  selectedNode = { ...selectedNode, displayLabel, shape, operatorNotes: notes };
  if ($('niTitle')) $('niTitle').textContent = displayLabel;
  toast('Node customization saved (local)');
  // Refresh dossier fields
  openNodeInspector({ ...selectedNode, label: selectedNode.label });
}

function resetNodeCustomization() {
  if (!selectedNode?.id) return;
  clearNodeMeta(selectedNode.id);
  const base = selectedNode.label || selectedNode.id;
  const shape = selectedNode.isCore ? 'icosahedron' : 'sphere';
  holo?.updateNodeAppearance?.(selectedNode.id, { displayLabel: base, shape });
  if ($('niRename')) $('niRename').value = '';
  if ($('niNotes')) $('niNotes').value = '';
  fillShapeSelect(shape);
  toast('Node meta cleared');
  openNodeInspector({ ...selectedNode, displayLabel: base, shape, meta: {} });
}

/** @deprecated modal path — redirects to glass inspector */
function openNode(node) {
  openNodeInspector(node);
}

// ── Threat response ────────────────────────────────────────
function renderThreatWatch(w) {
  lastThreatWatch = w;
  const badge = $('threatBadge');
  const summary = $('threatSummary');
  const btn = $('btnRespond');
  if (!w) return;
  if (badge) {
    badge.textContent = w.verdict || 'CLEAR';
    badge.dataset.verdict = w.verdict || 'CLEAR';
  }
  if (btn) {
    btn.classList.toggle('armed', !!w.realThreat);
    btn.title = w.realThreat
      ? `REAL THREAT · ${w.actorCount || 0} actor(s) · top ${w.topIp || ''} score ${w.topScore || 0}`
      : 'Defensive response — only acts on real (non-demo) high-score events';
  }
  if (summary) {
    if (w.verdict === 'CLEAR') {
      summary.innerHTML = 'Live fabric <strong>CLEAR</strong> — no non-demo events with score ≥ 6 in the last 24h.';
    } else if (w.realThreat) {
      summary.innerHTML = `<strong style="color:var(--red)">${escapeHtml(w.verdict)}</strong> · ${w.actorCount || 0} actor group(s) · top <strong>${escapeHtml(w.topIp || '—')}</strong> score <strong>${w.topScore || 0}</strong> · suggest morph <strong>${escapeHtml(w.recommendedMorph || 'forensic')}</strong>`;
    } else {
      summary.innerHTML = `<strong style="color:var(--amber)">${escapeHtml(w.verdict)}</strong> · ${w.highScoreCount || 0} elevated events · monitor / ASSESS for detail`;
    }
  }
  syncOperatorMood();
}

async function refreshThreatWatch() {
  try {
    const res = await apiFetch('/api/threat/watch');
    const j = await res.json();
    if (j.ok) renderThreatWatch(j);
  } catch {
    /* */
  }
}

function showThreatModal(title, html, footHtml = '') {
  const modal = $('modalThreat');
  const t = $('modalThreatTitle');
  const body = $('modalThreatBody');
  const foot = $('modalThreatFoot');
  if (t) t.textContent = title;
  if (body) body.innerHTML = html;
  if (foot) foot.innerHTML = footHtml;
  modal?.showModal?.() || modal?.setAttribute('open', '');
  foot?.querySelectorAll('[data-close]')?.forEach((b) => {
    b.addEventListener('click', () => modal?.close?.());
  });
}

async function runThreatAssess() {
  toast('Assessing live (non-demo) threats…');
  // Ensure live map so operator isn't looking at DEMO fabric
  if (mapMode !== 'live') {
    mapMode = 'live';
    localStorage.setItem('gc-map-mode', 'live');
    syncMapModeButtons();
    await refreshHolo({ bust: true });
  }
  try {
    const res = await apiFetch('/api/threat/assess?hours=24');
    const j = await res.json();
    lastThreatAssess = j;
    renderThreatWatch({
      ok: true,
      verdict: j.verdict,
      severity: j.severity,
      realThreat: j.realThreat,
      actorCount: j.actors?.length || 0,
      highScoreCount: j.highScoreCount,
      topIp: j.actors?.[0]?.ip,
      topScore: j.actors?.[0]?.maxScore,
      recommendedMorph: j.recommendedMorph,
    });
    const actorsHtml = (j.actors || [])
      .slice(0, 10)
      .map(
        (a) => `<div class="actor-row">
          <span>${escapeHtml(a.ip)} · ${escapeHtml((a.ttps || []).join(', '))}</span>
          <span class="sev-${escapeHtml(a.severity)}">${escapeHtml(a.severity)} · ${a.maxScore}</span>
        </div>`,
      )
      .join('') || '<div class="meta-dim">No high-score actors.</div>';
    const actions = (j.recommendedActions || [])
      .map((a) => `<li>${escapeHtml(a.label)}${a.auto ? ' <em>(auto on FULL)</em>' : ''}</li>`)
      .join('');
    showThreatModal(
      `Assess · ${j.verdict}`,
      `<p><strong>${escapeHtml(j.verdict)}</strong> · severity ${escapeHtml(j.severity)} · live events ${j.liveEventCount} · demo filtered ${j.demoFiltered}</p>
       <p class="meta-dim">${escapeHtml(j.ethics || '')}</p>
       <h3 style="font-family:var(--font-display);font-size:0.7rem;color:var(--cyan);letter-spacing:0.1em">ACTORS</h3>
       ${actorsHtml}
       <h3 style="font-family:var(--font-display);font-size:0.7rem;color:var(--cyan);letter-spacing:0.1em;margin-top:10px">RECOMMENDED</h3>
       <ul style="margin:4px 0;padding-left:18px;font-size:0.78rem;color:var(--text-dim)">${actions}</ul>`,
      j.realThreat
        ? `<button type="button" class="nx-btn primary" id="btnModalFullRespond">FULL RESPOND</button>
           <button type="button" class="nx-btn sm" data-close>CLOSE</button>`
        : `<button type="button" class="nx-btn sm" data-close>CLOSE</button>
           <button type="button" class="nx-btn sm" id="btnModalForceRespond" title="Drill only">FORCE PLAYBOOK</button>`,
    );
    $('btnModalFullRespond')?.addEventListener('click', async () => {
      $('modalThreat')?.close?.();
      await runThreatRespond({ mode: 'full' });
    });
    $('btnModalForceRespond')?.addEventListener('click', async () => {
      $('modalThreat')?.close?.();
      await runThreatRespond({ mode: 'full', force: true });
    });
    toast(j.realThreat ? `REAL THREAT · ${j.actors?.length || 0} actor(s)` : `Assess: ${j.verdict}`);
  } catch (e) {
    toast(e.message || 'Assess failed');
  }
}

async function runThreatRespond(opts = {}) {
  if (responding) {
    toast('Response already in progress…');
    return;
  }
  if (mapMode !== 'live') {
    mapMode = 'live';
    localStorage.setItem('gc-map-mode', 'live');
    syncMapModeButtons();
  }
  responding = true;
  const mode = opts.mode || 'full';
  toast(`Threat response · ${mode.toUpperCase()} (defensive only)…`);
  voice?.speak?.(
    mode === 'contain'
      ? 'Containing. Switching sentinel morph.'
      : 'Executing defensive threat response playbook.',
  );
  try {
    const res = await apiFetch('/api/threat/respond', {
      method: 'POST',
      body: JSON.stringify({
        mode,
        force: opts.force === true,
        ip: opts.ip,
        nodeId: opts.nodeId,
        evolve: opts.evolve,
        seal: opts.seal,
        rotateLan: opts.rotateLan,
        morph: opts.morph,
      }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Respond failed');

    if (j.aborted) {
      toast(j.reason || 'No real threats — aborted');
      showThreatModal(
        'Response aborted',
        `<p>${escapeHtml(j.reason || 'No real threats')}</p>
         <p class="meta-dim">Click DEMO only for drills. LIVE fabric is clear of high-score non-demo events.</p>`,
        `<button type="button" class="nx-btn sm" data-close>CLOSE</button>
         <button type="button" class="nx-btn sm" id="btnForceAfterAbort">FORCE ANYWAY</button>`,
      );
      $('btnForceAfterAbort')?.addEventListener('click', async () => {
        $('modalThreat')?.close?.();
        await runThreatRespond({ ...opts, force: true });
      });
      return;
    }

    if (j.morph?.morph?.id) setMorphUi(j.morph.morph.id);
    renderThreatWatch({
      ok: true,
      verdict: j.assessment?.verdict,
      severity: j.assessment?.severity,
      realThreat: j.assessment?.realThreat,
      actorCount: j.assessment?.actors?.length || 0,
      highScoreCount: j.assessment?.highScoreCount,
      topIp: j.assessment?.actors?.[0]?.ip,
      topScore: j.assessment?.actors?.[0]?.maxScore,
      recommendedMorph: j.assessment?.recommendedMorph,
    });

    const sealLink = j.seal?.downloadUrl
      ? `<a class="nx-btn primary" href="${escapeHtml(j.seal.downloadUrl)}">DOWNLOAD SEALED BUNDLE</a>`
      : '';
    showThreatModal(
      `Response complete · ${j.assessment?.verdict || ''}`,
      `<p><strong>Actions:</strong> ${escapeHtml((j.actionsTaken || []).join(', ') || 'none')}</p>
       <p class="meta-dim">${escapeHtml(j.prediction?.summary || '')}</p>
       <div class="threat-brief">${escapeHtml(j.brief || '')}</div>
       <h3 style="font-family:var(--font-display);font-size:0.65rem;color:var(--amber);margin-top:10px">EXTERNAL CHECKLIST</h3>
       <ul style="font-size:0.75rem;color:var(--text-dim);padding-left:18px">
         ${(j.externalChecklist?.items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('')}
       </ul>`,
      `${sealLink}<button type="button" class="nx-btn sm" data-close>CLOSE</button>`,
    );

    toast(`Response OK · ${(j.actionsTaken || []).join(', ')}`);
    voice?.speak?.('Threat response complete. Incident sealed where configured.');
    await Promise.all([
      refreshHolo({ bust: true }),
      refreshOmega(),
      refreshStatus(),
      refreshLeaderboard(),
      refreshMarkers(),
      refreshThreatWatch(),
    ]);
  } catch (e) {
    toast(e.message || 'Threat response failed');
  } finally {
    responding = false;
  }
}

// ── Data refresh ───────────────────────────────────────────
async function refreshOmega() {
  try {
    const res = await apiFetch('/api/omega/status');
    const j = await res.json();
    if (!j.ok) return;
    lastOmega = j;
    const eff = j.efficacy || {};
    const score = eff.score || eff.containment || 0;
    setGauge(score);
    $('containmentPct') && ($('containmentPct').textContent = `${Math.round(eff.containment || score)}%`);
    $('avgResponse') && ($('avgResponse').textContent = `${Number(eff.avgResponseSec || 4.2).toFixed(1)}s`);
    $('deceptionRate') && ($('deceptionRate').textContent = `${Math.round(eff.deceptionSuccess || score)}%`);
    $('falsePos') && ($('falsePos').textContent = `${Math.round(eff.falsePositiveRate || 0)}%`);
    $('stSentinels') && ($('stSentinels').textContent = `${j.sentinelsOnline || 0} SENTINELS ONLINE`);
    $('stMorphing') && ($('stMorphing').textContent = `${j.morphing || 0} MORPHING`);
    $('stFp') && ($('stFp').textContent = (j.falsePositives || 0) === 0 ? 'ZERO FALSE POSITIVES' : `${j.falsePositives} FALSE POSITIVES`);
    if (j.morph?.id) setMorphUi(j.morph.id);
    renderChad(j.leaderboard || []);
  } catch {
    /* offline grace */
  }
}

async function refreshStatus(opts = {}) {
  try {
    const url = opts.bust ? `/api/status?t=${Date.now()}` : '/api/status';
    const res = await apiFetch(url);
    const j = await res.json();
    lastStatus = j;
    renderPlanes(j);
    const paths = lastHolo?.stats?.activeIntrusionPaths ?? 0;
    $('intrusionPaths') && ($('intrusionPaths').textContent = String(paths));
    const cont = j.continuum?.efficacy?.score ?? lastOmega?.efficacy?.score;
    if (cont != null) {
      $('containmentPct') && ($('containmentPct').textContent = `${Math.round(cont)}%`);
    }
  } catch {
    /* */
  }
}

function holoMapUrl(bust = false) {
  const modeQ = mapMode === 'demo' ? 'demo=1' : 'live=1';
  const t = bust ? `&t=${Date.now()}` : '';
  return `/api/continuum/holo-map?${modeQ}${t}`;
}

function syncMapModeButtons() {
  $('btnLive')?.classList.toggle('primary', mapMode === 'live');
  $('btnDemo')?.classList.toggle('primary', mapMode === 'demo');
  const tag = document.querySelector('.holo-tag');
  if (tag) {
    tag.innerHTML =
      mapMode === 'live'
        ? '<span class="pulse-dot"></span> LIVE FABRIC · REAL EVENTS'
        : '<span class="pulse-dot"></span> DEMO FABRIC · NOT REAL THREATS';
  }
  syncOperatorMood({ mapMode });
}

async function refreshHolo(opts = {}) {
  try {
    const res = await apiFetch(holoMapUrl(!!opts.bust));
    const j = await res.json();
    if (!j.ok && !j.nodes) return;
    lastHolo = j;
    const decorated = decorateScene(j);
    holo?.setData?.(decorated);
    $('intrusionPaths') && ($('intrusionPaths').textContent = String(j.stats?.activeIntrusionPaths || 0));
    if (j.emptyLive) {
      /* quiet map is OK in live mode */
    }
    syncMapModeButtons();
    // Re-open inspector on same id if still present
    if (selectedNode?.id && decorated.nodes?.some((n) => n.id === selectedNode.id)) {
      const fresh = decorated.nodes.find((n) => n.id === selectedNode.id);
      if (fresh && !$('nodeInspector')?.hidden) {
        // soft update title only to avoid focus thrash
        if ($('niTitle')) $('niTitle').textContent = fresh.displayLabel || fresh.label || fresh.id;
      }
    }
  } catch {
    /* */
  }
}

function syncPauseButton() {
  const btn = $('btnPauseOrbit');
  if (!btn || !holo) return;
  const paused = holo.isOrbitPaused?.();
  btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
  btn.textContent = paused ? '▶ RESUME' : '⏸ PAUSE';
  btn.title = paused ? 'Resume auto-rotation' : 'Pause auto-rotation';
}

async function refreshMarkers() {
  try {
    const liveQ = mapMode === 'live' ? 'live=1' : 'live=0';
    const res = await apiFetch(`/api/continuum/timeline-markers?hours=24&${liveQ}`);
    const j = await res.json();
    if (j.ok) renderMarkers(j.markers || []);
  } catch {
    /* */
  }
}

/** Exit demo fabric: purge demo events from disk + force live map */
async function resetToLive() {
  mapMode = 'live';
  localStorage.setItem('gc-map-mode', 'live');
  toast('Switching to LIVE map — purging demo events…');
  try {
    const res = await apiFetch('/api/demo/clear', { method: 'POST', body: '{}' });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Clear failed');
    toast(j.message || `Live · removed ${j.removed || 0} demo event(s)`);
    voice?.speak?.('Live fabric restored. Demo events purged.');
  } catch (e) {
    toast(e.message || 'Purge failed — still forcing live map view');
  }
  syncMapModeButtons();
  await refreshHolo({ bust: true });
  await refreshMarkers();
  await refreshStatus();
}

async function refreshLeaderboard() {
  try {
    const res = await apiFetch('/api/continuum/genome/leaderboard');
    const j = await res.json();
    if (j.ok) renderChad(j.leaderboard || []);
  } catch {
    /* */
  }
}

async function evolvePool() {
  toast('Running NSGA-II evolution cycle…');
  try {
    const res = await apiFetch('/api/genome/evolve', {
      method: 'POST',
      body: JSON.stringify({ algorithm: 'nsga2' }),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Evolve failed');
    toast(`Champion: ${(j.champion?.id || 'unknown').toString().slice(0, 16)} · bred ${j.bred?.length || 0}`);
    narrateEvent(voice, 'genome-evolved', {});
    holo?.celebrate?.(j.champion?.id);
    operatorSentinel?.pulse?.('evolve', 3200);
    await refreshLeaderboard();
    await refreshHolo({ bust: true });
  } catch (e) {
    toast(e.message || 'Evolution failed');
  }
}

async function runQuery(q) {
  const query = (q || $('nlQuery')?.value || '').trim();
  if (!query) return;
  const box = $('nlResult');
  if (box) box.textContent = 'Querying local event stream…';
  try {
    const res = await apiFetch('/api/continuum/query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
    const j = await res.json();
    const summary = j.summary || `Matched ${j.matchCount || 0} events.`;
    if (box) {
      box.innerHTML = `<strong>${escapeHtml(j.intent || 'query')}</strong><br/>${escapeHtml(summary)}
        <div class="meta" style="margin-top:6px">${j.matchCount || 0} events · ${j.uniqueIps || 0} IPs</div>`;
    }
    voice?.speak?.(summary);
  } catch (e) {
    if (box) box.textContent = e.message || 'Query failed';
  }
}

async function injectDemo() {
  mapMode = 'demo';
  localStorage.setItem('gc-map-mode', 'demo');
  syncMapModeButtons();
  try {
    const res = await apiFetch('/api/demo/campaign', { method: 'POST', body: '{}' });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Demo inject failed');
    toast(`DEMO fabric on — not real threats · ${j.injected} synthetic events`);
    narrateEvent(voice, 'demo-campaign', {});
    renderMarkers(j.markers || []);
    await refreshHolo({ bust: true });
    await refreshStatus();
    await refreshOmega();
  } catch (e) {
    // Still show cinematic scene even if inject fails
    await refreshHolo({ bust: true });
    toast(e.message || 'Demo failed');
  }
}

// ── SSE ────────────────────────────────────────────────────
function connectSse() {
  if (typeof EventSource === 'undefined') {
    $('stSse') && ($('stSse').textContent = 'SSE n/a');
    return;
  }
  try {
    sse?.close?.();
    sse = new EventSource('/api/events/stream');
    sse.addEventListener('connected', () => {
      $('stSse') && ($('stSse').textContent = 'SSE LIVE');
    });
    sse.addEventListener('morph-switch', (ev) => {
      try {
        const d = JSON.parse(ev.data);
        setMorphUi(d.payload?.morph);
        operatorSentinel?.pulse?.('morph', 2000);
        refreshHolo({ bust: true });
      } catch { /* */ }
    });
    sse.addEventListener('genome-evolved', () => {
      operatorSentinel?.pulse?.('evolve', 3000);
      refreshLeaderboard();
      refreshHolo({ bust: true });
    });
    sse.addEventListener('map-invalidate', () => refreshHolo({ bust: true }));
    sse.addEventListener('demo-campaign', () => {
      refreshMarkers();
      refreshHolo({ bust: true });
    });
    sse.addEventListener('threat-response', (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.payload?.phase === 'complete') refreshThreatWatch();
        if (d.payload?.phase === 'triage' && d.payload?.verdict === 'REAL_THREAT') {
          toast(`Threat bus: ${d.payload.verdict}`);
        }
      } catch { /* */ }
    });
    sse.onerror = () => {
      $('stSse') && ($('stSse').textContent = 'SSE …');
    };
  } catch {
    $('stSse') && ($('stSse').textContent = 'SSE off');
  }
}

// ── Bind UI ────────────────────────────────────────────────
function bindUi() {
  document.querySelectorAll('.morph-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchMorph(btn.dataset.morph));
  });

  $('btnEvolve')?.addEventListener('click', evolvePool);
  $('btnNlQuery')?.addEventListener('click', () => runQuery());
  $('nlQuery')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runQuery();
  });
  document.querySelectorAll('.hint').forEach((h) => {
    h.addEventListener('click', () => {
      if ($('nlQuery')) $('nlQuery').value = h.dataset.q || '';
      runQuery(h.dataset.q);
    });
  });

  $('btnVoice')?.addEventListener('click', () => {
    voice?.toggleListening();
  });

  $('btnLive')?.addEventListener('click', resetToLive);
  $('btnDemo')?.addEventListener('click', injectDemo);
  $('btnRespond')?.addEventListener('click', () => runThreatRespond({ mode: 'full' }));
  $('btnThreatAssess')?.addEventListener('click', runThreatAssess);
  $('btnThreatContain')?.addEventListener('click', () => runThreatRespond({ mode: 'contain' }));
  $('btnThreatFull')?.addEventListener('click', () => runThreatRespond({ mode: 'full' }));
  $('btnPauseOrbit')?.addEventListener('click', () => {
    holo?.toggleOrbitPaused?.();
    syncPauseButton();
    toast(holo?.isOrbitPaused?.() ? 'Map rotation paused' : 'Map rotation resumed');
  });
  $('btnFocusThreat')?.addEventListener('click', () => {
    holo?.focusThreat?.();
    refreshThreatWatch();
  });
  $('btnResetCam')?.addEventListener('click', () => holo?.resetCamera?.());
  $('btnToggleShells')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    holo?.toggleShells?.(on);
  });
  $('niClose')?.addEventListener('click', closeNodeInspector);
  $('niSave')?.addEventListener('click', saveNodeCustomization);
  $('niReset')?.addEventListener('click', resetNodeCustomization);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNodeInspector();
  });
  $('btnPhylo')?.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/continuum/genome/leaderboard');
      const j = await res.json();
      const n = j.phylogeny?.nodes?.length || 0;
      const e = j.phylogeny?.edges?.length || 0;
      toast(`Phylogeny: ${n} genomes · ${e} lineage edges · landscape ${j.landscape?.points?.length || 0} pts`);
    } catch {
      toast('Phylogeny unavailable');
    }
  });

  $('btnSnapshot')?.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/incident/export', {
        method: 'POST',
        body: JSON.stringify({ label: 'omega-seal' }),
      });
      const j = await res.json();
      toast(j.ok ? `Sealed: ${j.id || 'bundle'}` : j.error || 'Export failed');
    } catch (e) {
      toast(e.message || 'Export failed');
    }
  });

  $('btnRotate')?.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/rotate/lan', { method: 'POST', body: '{}' });
      const j = await res.json();
      toast(j.ok ? 'LAN persona rotated' : j.error || 'Rotate failed');
    } catch (e) {
      toast(e.message || 'Rotate failed');
    }
  });

  $('btnMaximize')?.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/continuum/maximize-efficacy', {
        method: 'POST',
        body: JSON.stringify({ target: 90 }),
      });
      const j = await res.json();
      toast(j.ok ? `Efficacy maximizer: ${j.message || 'done'}` : j.error || 'Failed');
      await refreshOmega();
    } catch (e) {
      toast(e.message || 'Failed');
    }
  });

  $('btnWhatIf')?.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/continuum/what-if', {
        method: 'POST',
        body: JSON.stringify({ morph: 'aggressive' }),
      });
      const j = await res.json();
      toast(j.narrative || `Δ efficacy ${j.delta}`);
      voice?.speak?.(j.narrative);
    } catch (e) {
      toast(e.message || 'What-if failed');
    }
  });

  $('tmWhatIf')?.addEventListener('click', () => $('btnWhatIf')?.click());
  $('tmBranch')?.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/continuum/replay', {
        method: 'POST',
        body: JSON.stringify({ save: true, label: 'branch-sim' }),
      });
      const j = await res.json();
      toast(j.ok ? `Branch sim saved · ${j.timeline?.branches?.length || 0} branches` : 'Branch failed');
    } catch (e) {
      toast(e.message || 'Branch failed');
    }
  });
  $('tmExport')?.addEventListener('click', () => $('btnSnapshot')?.click());

  const scrub = $('tmScrub');
  scrub?.addEventListener('input', (e) => applyScrub(e.target.value));
  $('tmPlay')?.addEventListener('click', () => {
    scrubPlaying = !scrubPlaying;
    $('tmPlay').textContent = scrubPlaying ? '⏸' : '▶';
    if (scrubPlaying) {
      scrubTimer = setInterval(() => {
        if (!scrub) return;
        let v = Number(scrub.value) + 8;
        if (v > 1000) v = 0;
        scrub.value = String(v);
        applyScrub(v);
      }, 100);
    } else {
      clearInterval(scrubTimer);
    }
  });
  $('tmBack')?.addEventListener('click', () => {
    if (!scrub) return;
    scrub.value = String(Math.max(0, Number(scrub.value) - 50));
    applyScrub(scrub.value);
  });
  $('tmFwd')?.addEventListener('click', () => {
    if (!scrub) return;
    scrub.value = String(Math.min(1000, Number(scrub.value) + 50));
    applyScrub(scrub.value);
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog')?.close?.());
  });
}

// ── Boot ───────────────────────────────────────────────────
async function boot() {
  $('nxVersion') && ($('nxVersion').textContent = `v${VERSION}`);
  tickClock();
  setInterval(tickClock, 1000);

  voice = createGhostVoice({
    onResult: (text) => {
      if ($('nlQuery')) $('nlQuery').value = text;
      runQuery(text);
    },
    onListening: (on) => {
      $('btnVoice')?.classList.toggle('listening', on);
      if (on) $('btnVoice')?.classList.remove('speaking');
      $('voiceTag') && ($('voiceTag').textContent = on ? 'GHOST VOICE LISTENING…' : 'GHOST VOICE ENABLED');
    },
    onSpeaking: (on) => {
      $('btnVoice')?.classList.toggle('speaking', on);
      if (on) {
        $('voiceTag') && ($('voiceTag').textContent = 'GHOST VOICE SPEAKING…');
      } else if (!voice?.listening) {
        $('voiceTag') && ($('voiceTag').textContent = 'GHOST VOICE ENABLED');
      }
    },
    onError: (m) => toast(m),
  });

  const mapEl = $('holoMap');
  holo = await createHoloMap(mapEl, {
    onSelect: (node) => openNodeInspector(node),
    onOpen: (node) => openNodeInspector(node),
  });
  syncPauseButton();

  operatorSentinel = createOperatorSentinel({
    panel: $('operatorPanel'),
    canvas: $('operatorRain'),
    img: $('operatorImg'),
    tagEl: $('operatorTag'),
    moodEl: $('operatorMood'),
  });
  syncOperatorMood({ mapMode });

  bindUi();
  connectSse();

  syncMapModeButtons();

  // Parallel first paint — default LIVE (real events), never auto-inject demo
  await Promise.all([
    refreshOmega(),
    refreshStatus(),
    refreshHolo(),
    refreshMarkers(),
    refreshLeaderboard(),
    refreshThreatWatch(),
  ]);

  // Home Shield suite (wizard, language, devices, badges, PWA)
  await bootHome(toast);
  window.addEventListener('gc-home-applied', async () => {
    await Promise.all([refreshStatus({ bust: true }), refreshHolo({ bust: true }), refreshOmega()]);
    toast('Home Shield applied — planes & morph updated');
  });

  // Live loops
  setInterval(() => refreshOmega(), 4000);
  setInterval(() => refreshStatus(), 5000);
  setInterval(() => refreshHolo(), 6000);
  setInterval(() => refreshMarkers(), 15000);
  setInterval(() => refreshThreatWatch(), 8000);
  setInterval(() => refreshHome(toast), 20000);

  voice?.speak?.('Command Nexus online. Live fabric mode.');
  toast(
    mapMode === 'live'
      ? 'COMMAND NEXUS · LIVE fabric. Open HOME SHIELD if you have not set up yet.'
      : 'COMMAND NEXUS · DEMO fabric — click LIVE to return to real.',
  );
}

boot().catch((e) => {
  console.error(e);
  toast('Nexus boot error — check console');
});
