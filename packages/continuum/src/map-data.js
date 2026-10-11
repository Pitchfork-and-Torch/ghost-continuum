/**
 * Transform event streams into queryable map nodes for the Holographic Intrusion Map.
 */

import { buildRichInsights } from './map-layouts.js';

const PLANE_COLORS = {
  lan: '#7fd962',
  'ghost-lan': '#7fd962',
  edge: '#39bae6',
  audit: '#c678dd',
  'narrative-weave': '#ffb454',
  'phantom-mesh': '#e06c9f',
  'deep-veil': '#a78bfa',
  'mirage-core': '#f07178',
  hub: '#8b9cb3',
  ops: '#8b9cb3',
};

const TTP_PATTERNS = [
  { id: 'scanning', re: /scan|nmap|curl|wget|probe|recon/i },
  { id: 'credential', re: /credential|password|auth|login|dump|lsass/i },
  { id: 'lateral', re: /lateral|smb|rdp|pivot|winrm/i },
  { id: 'exfil', re: /exfil|download|upload|transfer/i },
  { id: 'trap', re: /trap|tripwire|tamper/i },
];

export function planeColor(plane) {
  return PLANE_COLORS[plane] || PLANE_COLORS.hub;
}

export function classifyTtp(event) {
  const blob = `${event.type} ${JSON.stringify(event.detail || {})}`;
  for (const p of TTP_PATTERNS) {
    if (p.re.test(blob)) return p.id;
  }
  if ((event.score || 0) >= 5) return 'trap';
  if ((event.score || 0) >= 3) return 'engagement';
  return 'recon';
}

export function deceptionSuccess(event) {
  const score = event.score || 0;
  const trapped = /trap|tripwire|tamper/i.test(String(event.type));
  return score >= 4 || trapped || event.detail?.deceptionSuccess === true;
}

function engagementDepth(event) {
  const dwell = (event.detail?.dwellMs || event.detail?.delayMs || 0) / 1000;
  const complexity = String(event.type).length * 0.1 + (event.detail?.commands?.length || 0);
  return Math.min(1, (event.score || 0) / 10 + dwell / 30 + complexity / 10);
}

function timeSpan(events) {
  if (!events.length) return { min: Date.now() - 3600000, max: Date.now() };
  const ts = events.map((e) => e.ts);
  return { min: Math.min(...ts), max: Math.max(...ts) };
}

export function buildMapNodes(events = [], options = {}) {
  const filtered = events.filter((e) => e.plane !== 'ops' || (e.score || 0) > 0);
  const span = timeSpan(filtered.length ? filtered : events);
  const range = Math.max(span.max - span.min, 60000);

  const nodes = filtered.map((e, idx) => {
    const ttp = classifyTtp(e);
    const depth = engagementDepth(e);
    const success = deceptionSuccess(e);
    const xNorm = (e.ts - span.min) / range;
    const yNorm = 0.15 + depth * 0.7 + (idx % 5) * 0.02;

    const dwellMs = e.detail?.dwellMs || e.detail?.delayMs || (e.score || 0) * 45000;

    return {
      id: e.id || `evt-${e.ts}-${idx}`,
      eventId: e.id,
      ts: e.ts,
      plane: e.plane,
      type: e.type,
      ip: e.ip,
      score: e.score || 0,
      ttp,
      success,
      color: planeColor(e.plane),
      persona: e.detail?.persona || e.persona || null,
      genomeResponse: e.detail?.genomeId || e.detail?.mode || null,
      actions: summarizeActions(e),
      dwellMin: Math.max(1, Math.round(dwellMs / 60000)),
      x: xNorm,
      y: yNorm,
      size: Math.max(4, Math.min(18, 4 + (e.score || 0) * 1.5 + (e.detail?.hitCount || 0))),
      branchHint: e.detail?.branch || null,
    };
  });

  const clusters = buildClusters(nodes);
  const insights = buildRichInsights(nodes, clusters);

  return {
    ok: true,
    nodeCount: nodes.length,
    timeRange: span,
    nodes,
    clusters,
    insights,
    connections: buildConnections(nodes),
    legend: {
      planes: Object.entries(PLANE_COLORS).filter(([k]) => !['hub', 'ops', 'lan'].includes(k) || k === 'lan'),
      ttps: ['scanning', 'credential', 'lateral', 'exfil', 'trap', 'engagement', 'recon'],
    },
    simulated: options.simulated || false,
  };
}

function summarizeActions(event) {
  const parts = [event.type];
  if (event.detail?.probe) parts.push(`probe:${event.detail.probe}`);
  if (event.detail?.persona) parts.push(`persona:${event.detail.persona}`);
  if (event.detail?.ua) parts.push(`ua:${String(event.detail.ua).slice(0, 40)}`);
  return parts.slice(0, 4);
}

function buildClusters(nodes) {
  const byIp = {};
  for (const n of nodes) {
    if (!n.ip) continue;
    if (!byIp[n.ip]) byIp[n.ip] = { ip: n.ip, nodes: [], planes: new Set(), maxScore: 0, latestTs: 0 };
    byIp[n.ip].nodes.push(n.id);
    byIp[n.ip].planes.add(n.plane);
    byIp[n.ip].maxScore = Math.max(byIp[n.ip].maxScore, n.score);
    byIp[n.ip].latestTs = Math.max(byIp[n.ip].latestTs, n.ts);
  }
  return Object.values(byIp)
    .map((c) => ({
      id: `cluster-${c.ip}`,
      ip: c.ip,
      nodeIds: c.nodes,
      planes: [...c.planes],
      eventCount: c.nodes.length,
      maxScore: c.maxScore,
      highEngagement: c.maxScore >= 5 || c.nodes.length >= 3,
      latestTs: c.latestTs,
    }))
    .sort((a, b) => b.latestTs - a.latestTs);
}

function buildConnections(nodes) {
  const sorted = [...nodes].sort((a, b) => a.ts - b.ts);
  const links = [];
  const byIp = {};
  for (const n of sorted) {
    if (!n.ip) continue;
    const prev = byIp[n.ip];
    if (prev) links.push({ from: prev.id, to: n.id, ip: n.ip });
    byIp[n.ip] = n;
  }
  return links.slice(-200);
}

export function simulatedMapNodes() {
  const now = Date.now();
  const samples = [
    { plane: 'lan', type: 'honeypot-http', ip: '10.0.0.42', score: 4, ttp: 'scanning' },
    { plane: 'edge', type: 'dm-honeypot-click', ip: '203.0.113.7', score: 6, ttp: 'trap' },
    { plane: 'audit', type: 'scope-probe-complete', ip: '192.168.1.1', score: 2, ttp: 'recon' },
    { plane: 'narrative-weave', type: 'narrative-reply', ip: '10.0.0.55', score: 5, ttp: 'engagement' },
  ];
  const events = samples.map((s, i) => ({
    id: `sim-${i}`,
    ts: now - (samples.length - i) * 900000,
    plane: s.plane,
    type: s.type,
    ip: s.ip,
    score: s.score,
    detail: { persona: 'router-admin', simulated: true },
  }));
  return buildMapNodes(events, { simulated: true });
}