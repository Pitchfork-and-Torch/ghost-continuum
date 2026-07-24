/**
 * View layouts and novice-friendly copy for the Holographic Intrusion Map.
 * Served to the hub UI at /assets/map-layouts.js
 */

export const VIEW_MODES = {
  timeline: {
    id: 'timeline',
    label: 'Timeline',
    axes: { x: 'Time →', y: 'Engagement depth ↑' },
    description: 'Events spread left-to-right by time; higher dots mean deeper attacker engagement.',
  },
  pattern: {
    id: 'pattern',
    label: 'Attack pattern',
    axes: { x: 'TTP category →', y: 'Severity ↑' },
    description: 'Groups events by tactic (scanning, credential, lateral…) so you can spot repeated behavior.',
  },
  planes: {
    id: 'planes',
    label: 'Plane correlation',
    axes: { x: 'Deception plane →', y: 'Activity volume ↑' },
    description: 'Shows which sentinel plane absorbed each interaction — useful when multiple layers are armed.',
  },
  genome: {
    id: 'genome',
    label: 'Genome fitness',
    axes: { x: 'Response fitness →', y: 'Engagement score ↑' },
    description: 'Highlights how genome-evolved responses correlate with trap success and dwell time.',
  },
  session: {
    id: 'session',
    label: 'Attacker session flow',
    axes: { x: 'Session progression →', y: 'Chain depth ↑' },
    description: 'Chains events from the same IP left-to-right to reveal multi-step attacker paths.',
  },
};

const TTP_ORDER = ['recon', 'scanning', 'engagement', 'credential', 'lateral', 'exfil', 'trap'];
const PLANE_ORDER = ['ghost-lan', 'lan', 'edge', 'audit', 'narrative-weave', 'phantom-mesh', 'deep-veil', 'mirage-core', 'hub', 'ops'];

function normPlane(p) {
  return p === 'lan' ? 'ghost-lan' : p;
}

function bucketIndex(value, buckets) {
  const i = buckets.indexOf(value);
  return i >= 0 ? i : buckets.length - 1;
}

export function applyViewLayout(nodes = [], mode = 'timeline', clusters = []) {
  const m = VIEW_MODES[mode] || VIEW_MODES.timeline;
  const n = nodes.length || 1;

  if (mode === 'pattern') {
    const groups = {};
    for (const node of nodes) {
      const k = node.ttp || 'recon';
      if (!groups[k]) groups[k] = [];
      groups[k].push(node);
    }
    return nodes.map((node) => {
      const col = bucketIndex(node.ttp, TTP_ORDER);
      const group = groups[node.ttp] || [node];
      const row = group.indexOf(node);
      const x = 0.08 + (col / Math.max(TTP_ORDER.length - 1, 1)) * 0.84;
      const y = 0.12 + (row / Math.max(group.length, 1)) * 0.76 + (node.score || 0) * 0.02;
      return { ...node, x, y, layoutMode: m.id };
    });
  }

  if (mode === 'planes') {
    const groups = {};
    for (const node of nodes) {
      const k = normPlane(node.plane);
      if (!groups[k]) groups[k] = [];
      groups[k].push(node);
    }
    return nodes.map((node) => {
      const col = bucketIndex(normPlane(node.plane), PLANE_ORDER);
      const group = groups[normPlane(node.plane)] || [node];
      const row = group.indexOf(node);
      const x = 0.06 + (col / Math.max(PLANE_ORDER.length - 1, 1)) * 0.88;
      const y = 0.1 + (row / Math.max(group.length, 1)) * 0.8;
      return { ...node, x, y, layoutMode: m.id };
    });
  }

  if (mode === 'genome') {
    return nodes.map((node, idx) => {
      const fitness = Math.min(1, ((node.score || 0) / 10) + (node.success ? 0.25 : 0));
      const x = 0.1 + fitness * 0.8;
      const y = 0.15 + ((node.score || 0) / 12) * 0.7 + (idx % 7) * 0.015;
      return { ...node, x, y, layoutMode: m.id };
    });
  }

  if (mode === 'session') {
    const byIp = {};
    for (const node of nodes) {
      const ip = node.ip || 'unknown';
      if (!byIp[ip]) byIp[ip] = [];
      byIp[ip].push(node);
    }
    for (const list of Object.values(byIp)) list.sort((a, b) => a.ts - b.ts);
    const ips = Object.keys(byIp).sort();
    return nodes.map((node) => {
      const ip = node.ip || 'unknown';
      const col = ips.indexOf(ip);
      const chain = byIp[ip] || [node];
      const step = chain.indexOf(node);
      const x = 0.06 + (col / Math.max(ips.length - 1, 1)) * 0.88;
      const y = 0.12 + (step / Math.max(chain.length - 1, 1)) * 0.76;
      return { ...node, x, y, layoutMode: m.id };
    });
  }

  // timeline (default) — preserve server positions
  return nodes.map((node) => ({ ...node, layoutMode: m.id }));
}

export function buildNodeTooltip(node, { novice = false } = {}) {
  const planeLabel = (node.plane || 'hub').replace(/-/g, ' ');
  const ttpLabel = {
    scanning: 'network scanning',
    credential: 'credential access attempt',
    lateral: 'lateral movement probe',
    exfil: 'data transfer pattern',
    trap: 'tripwire / trap interaction',
    engagement: 'sustained engagement',
    recon: 'reconnaissance',
  }[node.ttp] || node.ttp;

  const mins = node.dwellMin || Math.round(((node.score || 0) * 45) / 60) || 1;
  const noviceLead = novice
    ? `This ${node.color ? 'colored' : ''} marker is a <strong>real defensive event</strong> — not noise. `
    : '';

  const summary = novice
    ? `${noviceLead}A ${ttpLabel} against <strong>${planeLabel}</strong>${node.ip ? ` from ${node.ip}` : ''}. `
      + `Engagement score <strong>${node.score ?? 0}</strong>${node.success ? ' — the trap worked.' : '.'}`
    : `${node.type} · ${planeLabel} · ${ttpLabel}`;

  const detail = [];
  if (node.persona) detail.push(`Persona: ${node.persona}`);
  if (node.genomeResponse) detail.push(`Genome: ${node.genomeResponse}`);
  if (node.success) detail.push('Deception success');
  detail.push(`Time: ${new Date(node.ts).toLocaleString()}`);

  return { summary, detail, ttpLabel, planeLabel };
}

export function buildRichInsights(nodes = [], clusters = []) {
  const insights = [];
  const now = Date.now();
  const twoHours = nodes.filter((n) => now - n.ts < 7200000);
  const planeCounts = {};
  for (const n of twoHours) planeCounts[n.plane] = (planeCounts[n.plane] || 0) + 1;
  const hotPlane = Object.entries(planeCounts).sort((a, b) => b[1] - a[1])[0];
  if (hotPlane && hotPlane[1] >= 2) {
    insights.push({
      id: 'hot-plane',
      text: `Unusual concentration on ${hotPlane[0].replace(/-/g, ' ')} in the last 2 hours (${hotPlane[1]} events)`,
      filter: { plane: hotPlane[0] },
      nodeIds: twoHours.filter((n) => n.plane === hotPlane[0]).map((n) => n.id),
    });
  }

  const actors = clusters.filter((c) => c.eventCount >= 3 || c.maxScore >= 5);
  if (actors.length) {
    const top = actors[0];
    insights.push({
      id: 'actor-cluster',
      text: `${actors.length} high-engagement session${actors.length > 1 ? 's' : ''} — top actor ${top.ip} (${top.eventCount} events, ${top.planes?.length || 1} planes)`,
      filter: { ip: top.ip },
      nodeIds: top.nodeIds || [],
    });
  }

  const sophisticated = nodes.filter((n) => n.ttp === 'credential' || n.ttp === 'lateral');
  if (sophisticated.length) {
    insights.push({
      id: 'sophisticated-ttp',
      text: `${sophisticated.length} sophisticated TTP signal${sophisticated.length > 1 ? 's' : ''} (credential / lateral)`,
      filter: { ttp: 'credential' },
      nodeIds: sophisticated.map((n) => n.id),
    });
  }

  const rotations = nodes.filter((n) => /rotate|evolve|morph/i.test(n.type));
  if (rotations.length >= 2) {
    insights.push({
      id: 'genome-activity',
      text: `Genome / morph activity elevated (${rotations.length} evolution signals in window)`,
      filter: { types: ['rotate', 'genome-evolve', 'morph-switch'] },
      nodeIds: rotations.map((n) => n.id),
    });
  }

  if (!nodes.length) {
    insights.push({
      id: 'empty',
      text: 'Low activity — reference patterns shown. Probe honeypots or run a scope scan to populate the map.',
      filter: null,
      nodeIds: [],
    });
  }

  return insights.slice(0, 5);
}