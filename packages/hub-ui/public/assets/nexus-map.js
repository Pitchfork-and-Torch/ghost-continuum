import { isPlaneVisible, loadPrefs, savePrefs } from './settings.js';
import { showExplainer, hideExplainer } from './explainers.js';
import { applyViewLayout, buildNodeTooltip, VIEW_MODES } from './map-layouts.js';

const PLANE_ALIASES = { lan: 'ghost-lan' };

const TTP_SHAPES = {
  scanning: 'circle',
  credential: 'square',
  lateral: 'diamond',
  exfil: 'triangle',
  trap: 'triangle',
  engagement: 'circle',
  recon: 'circle',
};

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 8;
const PAD = 36;

const colorCache = new Map();

function hexToRgba(hex, a) {
  const key = `${hex}:${a}`;
  if (colorCache.has(key)) return colorCache.get(key);
  const h = hex.replace('#', '');
  const v = `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  colorCache.set(key, v);
  return v;
}

function animEnabled() {
  const lvl = loadPrefs().animationLevel;
  return lvl !== 'low' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function noviceMode() {
  return loadPrefs().noviceMode === true;
}

export function createNexusMap(container, callbacks = {}) {
  const state = {
    rawNodes: [],
    nodes: [],
    connections: [],
    clusters: [],
    insights: [],
    knownIds: new Set(),
    newIds: new Map(),
    selected: new Set(),
    hovered: null,
    hoveredId: null,
    hoveredCluster: null,
    filterIds: null,
    timeFocusId: null,
    viewMode: loadPrefs().mapViewMode || 'timeline',
    viewTransition: 1,
    scale: 1,
    panX: 0,
    panY: 0,
    panning: false,
    panStart: null,
    brushing: false,
    brushStart: null,
    brushRect: null,
    frame: 0,
    dirty: true,
    animId: null,
    legendPlanes: '',
    lastRefresh: 0,
    simulated: false,
    pins: loadPrefs().mapPins || {},
    particles: [],
  };

  const wrap = document.createElement('div');
  wrap.className = 'nexus-map-wrap';
  wrap.id = 'nexusMapWrap';

  const toolbar = document.createElement('div');
  toolbar.className = 'map-toolbar';
  toolbar.innerHTML = `
    <span class="map-live" id="mapLive" title="Auto-refresh every 2s"><span class="map-live-dot"></span> LIVE</span>
    <select id="mapViewMode" class="map-view-select" aria-label="Map view mode"></select>
    <button type="button" id="mapExplain" title="Guided map tour">? Explain map</button>
    <button type="button" id="mapLegendToggle" title="Map legend">☰ Legend</button>
    <button type="button" id="mapFocusLatest" title="Focus latest">◎ Latest</button>
    <button type="button" id="mapZoomIn" aria-label="Zoom in">+</button>
    <button type="button" id="mapZoomOut" aria-label="Zoom out">−</button>
    <button type="button" id="mapReset" title="Reset view">Reset</button>
    <button type="button" id="mapNarrative" title="Generate incident narrative">📜 Narrative</button>
    <span class="map-stat" id="mapNodeCount">0 events</span>
  `;

  const viewDesc = document.createElement('div');
  viewDesc.className = 'map-view-desc';
  viewDesc.id = 'mapViewDesc';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'map-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'nexus-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Holographic intrusion map');
  canvas.setAttribute('tabindex', '0');

  const minimap = document.createElement('canvas');
  minimap.className = 'map-minimap';
  minimap.width = 140;
  minimap.height = 88;
  minimap.setAttribute('aria-label', 'Map overview');

  const legendPanel = document.createElement('div');
  legendPanel.className = 'map-legend-panel';
  legendPanel.id = 'mapLegendPanel';
  legendPanel.hidden = true;

  const insightsPanel = document.createElement('div');
  insightsPanel.className = 'map-insights-panel';
  insightsPanel.id = 'mapInsightsPanel';

  const planeLegend = document.createElement('div');
  planeLegend.className = 'map-legend';
  planeLegend.id = 'mapLegend';

  const tooltip = document.createElement('div');
  tooltip.className = 'map-tooltip';
  tooltip.hidden = true;

  const emptyState = document.createElement('div');
  emptyState.className = 'map-empty-state';
  emptyState.id = 'mapEmptyState';
  emptyState.hidden = true;
  emptyState.innerHTML = `
    <div class="mes-icon">◎</div>
    <strong>Awaiting intrusion events</strong>
    <p>Your deception planes are listening. Run a scope probe, interact with Ghost LAN, or wait for edge tripwires — activity will appear here as colored markers.</p>
    <p class="mes-hint">Tip: enable <em>Explain map</em> for a guided tour.</p>`;

  canvasWrap.appendChild(canvas);
  canvasWrap.appendChild(minimap);
  canvasWrap.appendChild(emptyState);

  wrap.appendChild(toolbar);
  wrap.appendChild(viewDesc);
  wrap.appendChild(canvasWrap);
  wrap.appendChild(legendPanel);
  wrap.appendChild(insightsPanel);
  wrap.appendChild(planeLegend);
  wrap.appendChild(tooltip);
  container.innerHTML = '';
  container.appendChild(wrap);

  const ctx = canvas.getContext('2d', { alpha: true });
  const miniCtx = minimap.getContext('2d');
  let width = 0;
  let height = 360;

  function markDirty() { state.dirty = true; }

  function normalizePlane(p) { return PLANE_ALIASES[p] || p; }

  function dataBounds() {
    return { left: PAD, top: PAD, w: Math.max(40, width - PAD * 2), h: Math.max(40, height - PAD * 2) };
  }

  function worldToScreen(wx, wy) {
    const b = dataBounds();
    return {
      x: b.left + wx * b.w * state.scale + state.panX,
      y: b.top + (1 - wy) * b.h * state.scale + state.panY,
    };
  }

  function screenToWorld(sx, sy) {
    const b = dataBounds();
    return {
      x: (sx - b.left - state.panX) / (b.w * state.scale),
      y: 1 - (sy - b.top - state.panY) / (b.h * state.scale),
    };
  }

  function zoomAt(factor, cx, cy) {
    const before = screenToWorld(cx, cy);
    state.scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.scale * factor));
    const after = worldToScreen(before.x, before.y);
    state.panX += cx - after.x;
    state.panY += cy - after.y;
    markDirty();
  }

  function visibleNodes() {
    const prefs = loadPrefs();
    let list = state.nodes;
    if (state.filterIds) list = list.filter((n) => state.filterIds.has(n.id));
    if (state.timeFocusId) {
      const focus = state.nodes.find((n) => n.id === state.timeFocusId || n.eventId === state.timeFocusId);
      if (focus?.ip) {
        const chain = list.filter((n) => n.ip === focus.ip && n.ts <= focus.ts);
        if (chain.length) list = chain;
      }
    }
    return list.filter((n) => isPlaneVisible(normalizePlane(n.plane), prefs));
  }

  function toScreen(n) {
    const s = worldToScreen(n.x, n.y);
    const lodScale = state.scale < 0.9 ? 0.85 : 1;
    return { ...s, r: n.size * 0.42 * Math.sqrt(state.scale) * lodScale };
  }

  function buildDisplayClusters(nodes) {
    if (state.scale >= 1.1 || nodes.length < 30) return null;
    const cell = 42 / state.scale;
    const buckets = new Map();
    for (const n of nodes) {
      const s = toScreen(n);
      const key = `${Math.floor(s.x / cell)}:${Math.floor(s.y / cell)}`;
      if (!buckets.has(key)) buckets.set(key, { nodes: [], x: 0, y: 0, color: n.color });
      const b = buckets.get(key);
      b.nodes.push(n);
      b.x += s.x;
      b.y += s.y;
      b.color = n.color;
    }
    return [...buckets.values()].map((b) => ({
      count: b.nodes.length,
      x: b.x / b.nodes.length,
      y: b.y / b.nodes.length,
      color: b.color,
      nodeIds: b.nodes.map((n) => n.id),
      planes: [...new Set(b.nodes.map((n) => n.plane))],
    }));
  }

  function hitTest(mx, my) {
    const nodes = visibleNodes();
    const clusters = buildDisplayClusters(nodes);
    if (clusters) {
      for (let i = clusters.length - 1; i >= 0; i--) {
        const c = clusters[i];
        const r = 10 + Math.sqrt(c.count) * 4;
        if (Math.hypot(mx - c.x, my - c.y) <= r) return { cluster: c };
      }
    }
    for (let i = nodes.length - 1; i >= 0; i--) {
      const s = toScreen(nodes[i]);
      if (Math.hypot(mx - s.x, my - s.y) <= s.r + 6) return { node: nodes[i] };
    }
    return null;
  }

  function drawShape(cx, cy, r, shape, fill, stroke, lw) {
    ctx.beginPath();
    if (shape === 'square') ctx.rect(cx - r, cy - r, r * 2, r * 2);
    else if (shape === 'diamond') {
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
    } else if (shape === 'triangle') {
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8); ctx.closePath();
    } else ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  function drawAmbient() {
    if (!animEnabled() || state.particles.length < 3) {
      for (let i = 0; i < 12; i++) {
        state.particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          a: Math.random() * 0.15 + 0.03,
        });
      }
    }
    const activity = Math.min(1, visibleNodes().length / 40);
    ctx.strokeStyle = `rgba(57,186,230,${0.02 + activity * 0.04})`;
    ctx.lineWidth = 1;
    for (const p of state.particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(57,186,230,${p.a})`;
      ctx.fill();
    }
    const nodes = visibleNodes().slice(-8);
    if (nodes.length >= 2 && activity > 0.1) {
      for (let i = 1; i < nodes.length; i++) {
        const a = toScreen(nodes[i - 1]);
        const b = toScreen(nodes[i]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  function drawGrid() {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, 'rgba(57,186,230,.04)');
    grad.addColorStop(1, 'rgba(198,120,221,.03)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    drawAmbient();

    ctx.strokeStyle = 'rgba(57,186,230,.06)';
    ctx.lineWidth = 1;
    const step = 48 * Math.max(0.5, Math.min(1.5, state.scale));
    const offX = state.panX % step;
    const offY = state.panY % step;
    for (let x = -step + offX; x < width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = -step + offY; y < height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    const mode = VIEW_MODES[state.viewMode] || VIEW_MODES.timeline;
    ctx.fillStyle = 'rgba(139,156,179,.55)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(mode.axes.x, 10, height - 10);
    ctx.save();
    ctx.translate(14, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(mode.axes.y, 0, 0);
    ctx.restore();
  }

  function drawConnections(lookup, nodes) {
    const visible = new Set(nodes.map((n) => n.id));
    ctx.strokeStyle = 'rgba(57,186,230,.12)';
    ctx.lineWidth = 1;
    for (const link of state.connections) {
      if (!visible.has(link.from) || !visible.has(link.to)) continue;
      const a = lookup[link.from];
      const b = lookup[link.to];
      if (!a || !b) continue;
      const sa = toScreen(a);
      const sb = toScreen(b);
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      ctx.stroke();
    }
  }

  function drawMinimap() {
    const mw = minimap.width;
    const mh = minimap.height;
    miniCtx.clearRect(0, 0, mw, mh);
    miniCtx.fillStyle = 'rgba(8,12,18,.88)';
    miniCtx.fillRect(0, 0, mw, mh);
    miniCtx.strokeStyle = 'rgba(57,186,230,.35)';
    miniCtx.strokeRect(0.5, 0.5, mw - 1, mh - 1);

    const all = state.nodes;
    for (const n of all) {
      const mx = 4 + n.x * (mw - 8);
      const my = 4 + (1 - n.y) * (mh - 8);
      miniCtx.fillStyle = n.color || '#8b9cb3';
      miniCtx.beginPath();
      miniCtx.arc(mx, my, 1.5, 0, Math.PI * 2);
      miniCtx.fill();
    }

    const b = dataBounds();
    const tl = screenToWorld(b.left, b.top);
    const br = screenToWorld(b.left + b.w, b.top + b.h);
    const vx = 4 + Math.max(0, tl.x) * (mw - 8);
    const vy = 4 + Math.max(0, 1 - br.y) * (mh - 8);
    const vw = Math.min(mw - 8, (br.x - tl.x) * (mw - 8));
    const vh = Math.min(mh - 8, (br.y - tl.y) * (mh - 8));
    miniCtx.strokeStyle = 'rgba(255,180,84,.9)';
    miniCtx.lineWidth = 1.5;
    miniCtx.strokeRect(vx, vy, Math.max(12, vw), Math.max(10, vh));
  }

  function draw() {
    if (!width || !state.dirty) return;
    state.dirty = false;
    ctx.clearRect(0, 0, width, height);
    drawGrid();

    const nodes = visibleNodes();
    const lookup = Object.fromEntries(nodes.map((n) => [n.id, n]));
    drawConnections(lookup, nodes);

    const now = state.frame;
    for (const id of [...state.newIds.keys()]) {
      if (now - state.newIds.get(id) > 90) state.newIds.delete(id);
    }

    const clusters = buildDisplayClusters(nodes);
    if (clusters) {
      for (const c of clusters) {
        const r = 10 + Math.sqrt(c.count) * 4;
        const isHov = state.hoveredCluster === c;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(c.color, isHov ? 0.55 : 0.35);
        ctx.fill();
        ctx.strokeStyle = isHov ? '#ffb454' : hexToRgba(c.color, 0.7);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 10px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText(String(c.count), c.x, c.y + 3);
        ctx.textAlign = 'left';
      }
    } else {
      const margin = 40;
      for (const n of nodes) {
        const s = toScreen(n);
        if (s.x < -margin || s.x > width + margin || s.y < -margin || s.y > height + margin) continue;
        const shape = TTP_SHAPES[n.ttp] || 'circle';
        const isSel = state.selected.has(n.id);
        const isHov = state.hoveredId === n.id;
        const isNew = state.newIds.has(n.id);
        const isTime = state.timeFocusId && (n.id === state.timeFocusId || n.eventId === state.timeFocusId);
        const pulse = (isHov || isSel || isNew || isTime) && animEnabled()
          ? 1 + Math.sin(now * 0.1) * (isNew ? 0.35 : 0.15)
          : 1;
        const dimmed = state.filterIds && !state.filterIds.has(n.id);
        const alpha = dimmed ? 0.18 : 0.92;
        const fill = hexToRgba(n.color, alpha);
        const stroke = isSel ? '#39bae6' : isTime ? '#ffb454' : isHov ? '#ffb454' : isNew ? '#7fd962' : hexToRgba(n.color, 0.55);
        drawShape(s.x, s.y, s.r * pulse, shape, fill, stroke, n.success ? 2 : 1);

        if (state.pins[n.id]) {
          ctx.fillStyle = '#ffb454';
          ctx.beginPath();
          ctx.arc(s.x + s.r, s.y - s.r, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        if ((n.success || n.score >= 5) && animEnabled() && now % 90 < 45) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r + 5 + (isNew ? 3 : 0), 0, Math.PI * 2);
          ctx.strokeStyle = isNew ? 'rgba(127,217,98,.4)' : 'rgba(198,120,221,.2)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    if (state.brushRect) {
      const r = state.brushRect;
      ctx.fillStyle = 'rgba(57,186,230,.07)';
      ctx.strokeStyle = 'rgba(57,186,230,.55)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }

    drawMinimap();
    document.getElementById('mapEmptyState').hidden = nodes.length > 0 || state.simulated;
  }

  function showNodeTooltip(n, mx, my) {
    const tip = buildNodeTooltip(n, { novice: noviceMode() });
    if (tooltip.dataset.nodeId === n.id && !tooltip.hidden) return;
    tooltip.dataset.nodeId = n.id;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(mx + 14, width - 280)}px`;
    tooltip.style.top = `${Math.max(my - 8, 10)}px`;
    const pin = state.pins[n.id];
    tooltip.innerHTML = `
      <div class="mt-title">${n.type}</div>
      <div class="mt-summary">${tip.summary}</div>
      ${tip.detail.map((d) => `<div class="mt-row"><span>${d.split(':')[0]}</span><strong>${d.includes(':') ? d.split(':').slice(1).join(':').trim() : d}</strong></div>`).join('')}
      <div class="mt-encode meta">Color = ${tip.planeLabel} · Shape = ${tip.ttpLabel} · Size = engagement</div>
      ${pin ? `<div class="mt-pin">📌 ${pin}</div>` : ''}
      <div class="mt-actions">
        <button type="button" class="mt-btn" id="mtReplay">Time Machine</button>
        <button type="button" class="mt-btn" id="mtPin">${pin ? 'Edit note' : 'Pin note'}</button>
      </div>`;
    tooltip.querySelector('#mtReplay')?.addEventListener('click', () => callbacks.onNodeClick?.(n));
    tooltip.querySelector('#mtPin')?.addEventListener('click', () => {
      const note = prompt('Private note for this event:', pin || '');
      if (note === null) return;
      if (note.trim()) state.pins[n.id] = note.trim();
      else delete state.pins[n.id];
      savePrefs({ mapPins: state.pins });
      showNodeTooltip(n, mx, my);
      markDirty();
    });
  }

  function showClusterTooltip(c, mx, my) {
    tooltip.hidden = false;
    tooltip.dataset.nodeId = '';
    tooltip.style.left = `${Math.min(mx + 14, width - 260)}px`;
    tooltip.style.top = `${Math.max(my - 8, 10)}px`;
    tooltip.innerHTML = `
      <div class="mt-title">Event cluster</div>
      <div class="mt-summary"><strong>${c.count}</strong> events grouped at this zoom level — zoom in to see individuals, or click to focus.</div>
      <div class="mt-row"><span>Planes</span><strong>${c.planes.join(', ')}</strong></div>`;
  }

  function hideTooltip() {
    tooltip.hidden = true;
    delete tooltip.dataset.nodeId;
  }

  function renderLegendPanel() {
    const panel = document.getElementById('mapLegendPanel');
    panel.innerHTML = `
      <div class="mlp-head">
        <strong>Map legend</strong>
        <button type="button" id="mapLegendClose">×</button>
      </div>
      <div class="mlp-body">
        <section><h4>Position</h4><p id="mlpPosition">—</p></section>
        <section><h4>Color = Deception plane</h4>
          <ul class="mlp-list">
            <li><span class="ldot" style="background:#7fd962"></span> Ghost LAN — interior honeypot</li>
            <li><span class="ldot" style="background:#39bae6"></span> Edge — perimeter tripwire</li>
            <li><span class="ldot" style="background:#c678dd"></span> Audit — authorized scope</li>
            <li><span class="ldot" style="background:#ffb454"></span> Narrative Weave</li>
            <li><span class="ldot" style="background:#e06c9f"></span> Phantom Mesh</li>
            <li><span class="ldot" style="background:#a78bfa"></span> Deep Veil</li>
            <li><span class="ldot" style="background:#f07178"></span> Mirage Core</li>
          </ul>
        </section>
        <section><h4>Shape = Attack pattern (TTP)</h4>
          <ul class="mlp-list mlp-shapes">
            <li>○ Circle — scanning / recon</li>
            <li>□ Square — credential access</li>
            <li>◇ Diamond — lateral movement</li>
            <li>△ Triangle — trap / exfil</li>
          </ul>
        </section>
        <section><h4>Behavior</h4>
          <ul class="mlp-list">
            <li>Pulsing ring — high engagement or deception success</li>
            <li>Connected lines — same IP progression over time</li>
            <li>Clusters — auto-grouped when zoomed out</li>
          </ul>
        </section>
        <section><h4>Controls</h4>
          <ul class="mlp-list">
            <li>Drag — pan · Wheel — zoom · Shift+drag — select area</li>
            <li>Double-click — zoom in · Arrow keys — pan · +/- — zoom</li>
          </ul>
        </section>
      </div>`;
    const mode = VIEW_MODES[state.viewMode] || VIEW_MODES.timeline;
    panel.querySelector('#mlpPosition').textContent = mode.description;
    panel.querySelector('#mapLegendClose').onclick = () => { panel.hidden = true; };
  }

  function renderInsights() {
    const panel = document.getElementById('mapInsightsPanel');
    const items = state.insights;
    if (!items.length) { panel.innerHTML = ''; return; }
    panel.innerHTML = `
      <div class="mip-head">Map insights</div>
      <div class="mip-list">${items.map((ins, i) =>
        `<button type="button" class="mip-item" data-insight="${i}">${ins.text || ins}</button>`,
      ).join('')}</div>`;
    panel.querySelectorAll('[data-insight]').forEach((btn) => {
      btn.onclick = () => {
        const ins = items[parseInt(btn.dataset.insight, 10)];
        if (!ins || !ins.nodeIds?.length) {
          state.filterIds = null;
        } else {
          state.filterIds = new Set(ins.nodeIds);
          state.selected = new Set(ins.nodeIds.slice(0, 1));
        }
        markDirty();
        callbacks.onInsightClick?.(ins);
        callbacks.onInsights?.(items.map((x) => x.text || x));
      };
    });
  }

  function updateViewDesc() {
    const mode = VIEW_MODES[state.viewMode] || VIEW_MODES.timeline;
    document.getElementById('mapViewDesc').textContent = mode.description;
  }

  function applyLayout(animate = false) {
    const laid = applyViewLayout(state.rawNodes, state.viewMode, state.clusters);
    if (animate && animEnabled()) {
      state.viewTransition = 0;
      const from = state.nodes;
      const animateLayout = () => {
        state.viewTransition = Math.min(1, state.viewTransition + 0.08);
        state.nodes = laid.map((n, i) => {
          const prev = from.find((x) => x.id === n.id) || n;
          return {
            ...n,
            x: prev.x + (n.x - prev.x) * state.viewTransition,
            y: prev.y + (n.y - prev.y) * state.viewTransition,
          };
        });
        markDirty();
        if (state.viewTransition < 1) requestAnimationFrame(animateLayout);
      };
      animateLayout();
    } else {
      state.nodes = laid;
      markDirty();
    }
    updateViewDesc();
    renderLegendPanel();
  }

  function updateLegend() {
    const planes = [...new Set(state.nodes.map((n) => normalizePlane(n.plane)))].sort().join('|');
    if (planes === state.legendPlanes) return;
    state.legendPlanes = planes;
    const prefs = loadPrefs();
    document.getElementById('mapLegend').innerHTML = [...new Set(state.nodes.map((n) => normalizePlane(n.plane)))].map((p) => {
      const on = isPlaneVisible(p, prefs);
      const color = state.nodes.find((n) => normalizePlane(n.plane) === p)?.color || '#8b9cb3';
      return `<button type="button" class="legend-chip ${on ? 'on' : 'off'}" data-plane="${p}" style="--chip-color:${color}"><span class="chip-dot"></span>${p}</button>`;
    }).join('');
    document.getElementById('mapLegend').querySelectorAll('[data-plane]').forEach((btn) => {
      btn.onclick = () => callbacks.externalPlaneToggle?.(btn.dataset.plane);
    });
  }

  function setData(mapData) {
    let incoming = mapData?.nodes || [];
    if (incoming.length > 2000) incoming = incoming.slice(-2000);
    const fresh = [];
    for (const n of incoming) {
      if (!state.knownIds.has(n.id)) {
        state.newIds.set(n.id, state.frame);
        fresh.push(n.id);
      }
      state.knownIds.add(n.id);
    }
    state.rawNodes = incoming;
    state.connections = mapData?.connections || [];
    state.clusters = mapData?.clusters || [];
    state.insights = (mapData?.insights || []).map((x) => (typeof x === 'string' ? { text: x, nodeIds: [] } : x));
    state.simulated = mapData?.simulated || false;
    state.lastRefresh = Date.now();
    applyLayout(false);

    const countEl = document.getElementById('mapNodeCount');
    if (countEl) {
      const cap = incoming.length > 1000 ? ' · showing viewport' : '';
      countEl.textContent = `${incoming.length} events${fresh.length ? ` · +${fresh.length} new` : ''}${state.simulated ? ' · demo' : ''}${cap}`;
    }
    updateLegend();
    renderInsights();
    markDirty();
    const insightTexts = state.insights.map((x) => x.text || x);
    callbacks.onInsights?.(insightTexts);
    if (fresh.length && loadPrefs().mapAutoFocus) callbacks.onNewNodes?.(fresh);
  }

  function pulseLive() {
    document.querySelector('#mapLive .map-live-dot')?.classList.add('pulse');
    setTimeout(() => document.querySelector('#mapLive .map-live-dot')?.classList.remove('pulse'), 400);
  }

  function selectNode(n, additive = false) {
    if (!additive) state.selected.clear();
    if (n) state.selected.add(n.id);
    markDirty();
    callbacks.onSelectionChange?.([...state.selected], state.nodes.filter((x) => state.selected.has(x.id)));
  }

  function highlightIds(ids) {
    state.filterIds = ids?.length ? new Set(ids) : null;
    markDirty();
  }

  function setTimeFocus({ eventId, ts } = {}) {
    state.timeFocusId = eventId || null;
    markDirty();
  }

  function focusLatest() {
    const nodes = visibleNodes();
    if (!nodes.length) return;
    const latest = nodes.reduce((a, b) => (b.ts > a.ts ? b : a));
    selectNode(latest);
    const s = toScreen(latest);
    state.panX += width / 2 - s.x;
    state.panY += height / 2 - s.y;
    markDirty();
  }

  function focusNode(n) {
    if (!n) return;
    selectNode(n);
    const s = toScreen(n);
    state.panX += width / 2 - s.x;
    state.panY += height / 2 - s.y;
    markDirty();
  }

  function resetView() {
    state.scale = 1;
    state.panX = 0;
    state.panY = 0;
    state.selected.clear();
    state.filterIds = null;
    state.timeFocusId = null;
    markDirty();
  }

  function resize() {
    const rect = wrap.getBoundingClientRect();
    width = Math.max(320, Math.floor(rect.width - 2));
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    markDirty();
  }

  function openMapGuide() {
    const steps = [
      { title: 'Welcome to the intrusion map', body: 'Each dot is a real event from your deception planes — honeypots, tripwires, and scope probes. Nothing here is decorative.' },
      { title: 'Read position', body: 'Left → right is time. Up means deeper engagement (longer dwell, higher scores, more complex TTPs).' },
      { title: 'Read color & shape', body: 'Color tells you which plane absorbed the probe. Shape tells you the attack pattern: circle = scan, square = credential, diamond = lateral, triangle = trap.' },
      { title: 'Navigate', body: 'Drag to pan, scroll to zoom, double-click to zoom in. Use the minimap (bottom-right) to jump across the full timeline.' },
      { title: 'Investigate', body: 'Click a dot to sync the Forensic Time Machine and Tripwire Feed. Use Map Insights (below the canvas) to jump to suspicious clusters.' },
    ];
    let step = 0;
    const overlay = document.createElement('div');
    overlay.className = 'map-guide-overlay';
    const render = () => {
      const s = steps[step];
      overlay.innerHTML = `
        <div class="map-guide-card">
          <div class="mg-step">${step + 1} / ${steps.length}</div>
          <h3>${s.title}</h3>
          <p>${s.body}</p>
          <div class="mg-actions">
            <button type="button" id="mgPrev" ${step === 0 ? 'disabled' : ''}>Back</button>
            <button type="button" class="primary" id="mgNext">${step === steps.length - 1 ? 'Done' : 'Next'}</button>
          </div>
        </div>`;
      overlay.querySelector('#mgPrev')?.addEventListener('click', () => { step--; render(); });
      overlay.querySelector('#mgNext')?.addEventListener('click', () => {
        if (step >= steps.length - 1) {
          overlay.remove();
          savePrefs({ mapOnboardingDone: true });
        } else { step++; render(); }
      });
    };
    render();
    wrap.appendChild(overlay);
  }

  // Pointer interactions
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (e.shiftKey) {
      state.brushing = true;
      state.brushStart = { x: mx, y: my };
      state.brushRect = { x: mx, y: my, w: 0, h: 0 };
      return;
    }
    const hit = hitTest(mx, my);
    if (hit?.node) {
      selectNode(hit.node, e.ctrlKey || e.metaKey);
      callbacks.onNodeClick?.(hit.node);
    } else if (hit?.cluster) {
      state.filterIds = new Set(hit.cluster.nodeIds);
      zoomAt(1.8, hit.cluster.x, hit.cluster.y);
    } else {
      state.panning = true;
      state.panStart = { x: mx, y: my, panX: state.panX, panY: state.panY };
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (state.panning && state.panStart) {
      state.panX = state.panStart.panX + (mx - state.panStart.x);
      state.panY = state.panStart.panY + (my - state.panStart.y);
      markDirty();
      return;
    }
    if (state.brushing && state.brushStart) {
      state.brushRect = {
        x: Math.min(state.brushStart.x, mx),
        y: Math.min(state.brushStart.y, my),
        w: Math.abs(mx - state.brushStart.x),
        h: Math.abs(my - state.brushStart.y),
      };
      markDirty();
      return;
    }
    const hit = hitTest(mx, my);
    const hitId = hit?.node?.id || null;
    const hitCluster = hit?.cluster || null;
    if (hitId !== state.hoveredId || hitCluster !== state.hoveredCluster) {
      state.hovered = hit?.node || null;
      state.hoveredId = hitId;
      state.hoveredCluster = hitCluster;
      if (hit?.node) {
        showNodeTooltip(hit.node, mx, my);
        canvas.style.cursor = 'pointer';
      } else if (hit?.cluster) {
        showClusterTooltip(hit.cluster, mx, my);
        canvas.style.cursor = 'zoom-in';
      } else {
        hideTooltip();
        canvas.style.cursor = 'grab';
      }
      markDirty();
    } else if (hit?.node) showNodeTooltip(hit.node, mx, my);
    else if (hit?.cluster) showClusterTooltip(hit.cluster, mx, my);
  });

  canvas.addEventListener('mouseup', () => {
    if (state.panning) {
      state.panning = false;
      state.panStart = null;
      canvas.style.cursor = 'grab';
    }
    if (state.brushing && state.brushRect?.w > 4 && state.brushRect?.h > 4) {
      const r = state.brushRect;
      const picked = visibleNodes().filter((n) => {
        const s = toScreen(n);
        return s.x >= r.x && s.x <= r.x + r.w && s.y >= r.y && s.y <= r.y + r.h;
      });
      state.selected = new Set(picked.map((n) => n.id));
      callbacks.onSelectionChange?.([...state.selected], picked);
    }
    state.brushing = false;
    state.brushStart = null;
    state.brushRect = null;
    markDirty();
  });

  canvas.addEventListener('mouseleave', () => {
    state.panning = false;
    state.hovered = null;
    state.hoveredId = null;
    state.hoveredCluster = null;
    hideTooltip();
    canvas.style.cursor = 'grab';
    markDirty();
  });

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    zoomAt(1.65, e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit?.node) focusNode(hit.node);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  minimap.addEventListener('click', (e) => {
    const rect = minimap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mw = minimap.width;
    const mh = minimap.height;
    const wx = (mx - 4) / (mw - 8);
    const wy = 1 - (my - 4) / (mh - 8);
    const target = worldToScreen(wx, wy);
    state.panX += width / 2 - target.x;
    state.panY += height / 2 - target.y;
    markDirty();
  });

  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 48 : 24;
    if (e.key === 'ArrowLeft') { state.panX += step; markDirty(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { state.panX -= step; markDirty(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { state.panY += step; markDirty(); e.preventDefault(); }
    if (e.key === 'ArrowDown') { state.panY -= step; markDirty(); e.preventDefault(); }
    if (e.key === '+' || e.key === '=') { zoomAt(1.12, width / 2, height / 2); e.preventDefault(); }
    if (e.key === '-') { zoomAt(0.88, width / 2, height / 2); e.preventDefault(); }
    if (e.key === '0') { resetView(); e.preventDefault(); }
  });

  // Toolbar
  const viewSelect = document.getElementById('mapViewMode');
  viewSelect.innerHTML = Object.values(VIEW_MODES).map((m) =>
    `<option value="${m.id}" ${m.id === state.viewMode ? 'selected' : ''}>${m.label}</option>`,
  ).join('');
  viewSelect.onchange = () => {
    state.viewMode = viewSelect.value;
    savePrefs({ mapViewMode: state.viewMode });
    applyLayout(true);
  };

  document.getElementById('mapExplain')?.addEventListener('click', openMapGuide);
  document.getElementById('mapLegendToggle')?.addEventListener('click', () => {
    const panel = document.getElementById('mapLegendPanel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderLegendPanel();
  });
  document.getElementById('mapFocusLatest')?.addEventListener('click', focusLatest);
  document.getElementById('mapZoomIn')?.addEventListener('click', () => zoomAt(1.2, width / 2, height / 2));
  document.getElementById('mapZoomOut')?.addEventListener('click', () => zoomAt(0.83, width / 2, height / 2));
  document.getElementById('mapReset')?.addEventListener('click', resetView);
  document.getElementById('mapNarrative')?.addEventListener('click', () => {
    const ids = [...state.selected];
    callbacks.onGenerateNarrative?.(ids.length ? ids : visibleNodes().map((n) => n.id));
  });

  function loop() {
    state.frame++;
    const needsAnim = animEnabled() && (
      state.newIds.size > 0 ||
      state.hoveredId ||
      state.selected.size ||
      state.brushing ||
      state.panning ||
      state.viewTransition < 1
    );
    if (needsAnim) markDirty();
    draw();
    state.animId = requestAnimationFrame(loop);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();
  updateViewDesc();
  renderLegendPanel();
  state.animId = requestAnimationFrame(loop);

  canvas.addEventListener('mouseenter', () => showExplainer(wrap, 'nexus-map'));
  canvas.addEventListener('mouseleave', hideExplainer);

  if (!loadPrefs().mapOnboardingDone) {
    setTimeout(openMapGuide, 800);
  }

  return {
    setData,
    selectNode,
    highlightIds,
    setTimeFocus,
    focusLatest,
    focusNode,
    pulseLive,
    openMapGuide,
    getSelected: () => [...state.selected],
    destroy: () => { cancelAnimationFrame(state.animId); ro.disconnect(); },
  };
}