/**
 * Ghost Continuum v2.0 — Holographic intrusion map data model.
 * Builds 3D-ready nodes, color-coded paths, plane shells, predictive cones,
 * and Chad genome hall-of-fame payloads for the Command Nexus.
 *
 * Visual language (bible):
 *   cyan   = protected / healthy
 *   violet = threat path
 *   red    = live breach / compromised
 *   green  = high-fitness evolved sentinel
 */

import { buildMapNodes, simulatedMapNodes, classifyTtp, planeColor } from './map-data.js';

const ROLE_PREFIXES = {
  scanning: 'SCANNER',
  recon: 'PROBE',
  credential: 'AUTH-CHAIN',
  lateral: 'LATERAL',
  exfil: 'EXFIL',
  trap: 'TRAP',
  engagement: 'ENGAGE',
};

const STATE_COLORS = {
  protected: '#00e5ff',
  healthy: '#00e5ff',
  threat: '#b388ff',
  breach: '#ff1744',
  compromised: '#ff1744',
  sentinel: '#69f0ae',
  guardian: '#69f0ae',
  morphing: '#e040fb',
  predictive: '#ffab40',
};

const PLANE_SHELLS = [
  { id: 'ghost-lan', label: 'Ghost LAN', radius: 3.2, color: '#69f0ae' },
  { id: 'edge', label: 'Edge', radius: 4.0, color: '#00e5ff' },
  { id: 'audit', label: 'Audit', radius: 4.8, color: '#b388ff' },
  { id: 'narrative-weave', label: 'Narrative Weave', radius: 5.6, color: '#ffab40' },
  { id: 'phantom-mesh', label: 'Phantom Mesh', radius: 6.4, color: '#e040fb' },
  { id: 'deep-veil', label: 'Deep Veil', radius: 7.2, color: '#7c4dff' },
  { id: 'mirage-core', label: 'Mirage Core', radius: 8.0, color: '#ff5252' },
];

function hashStr(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function roleLabel(node, idx) {
  if (node.label) return node.label;
  const prefix = ROLE_PREFIXES[node.ttp] || 'NODE';
  const n = String(hashStr(node.id || idx) % 90 + 10).padStart(2, '0');
  if (node.ttp === 'trap' && /c2|beacon/i.test(String(node.type))) {
    return `C2-beacon-violet-ghost-${100 + (hashStr(node.id) % 50)}`;
  }
  if (node.score >= 7 || /compromis/i.test(String(node.type))) {
    return `COMPROMISED-EDGE-${n}`;
  }
  if (node.plane === 'edge' && node.success) return `PROXY-${n}`;
  if (node.plane === 'lan' || node.plane === 'ghost-lan') {
    if (node.success) return `SENTINEL-${n}`;
    return `${prefix}-${n}`;
  }
  return `${prefix}-${n}`;
}

function nodeState(node) {
  if (node.score >= 7 || /compromis|breach/i.test(String(node.type))) return 'breach';
  if (node.ttp === 'lateral' || node.ttp === 'credential' || node.score >= 5) return 'threat';
  if (node.success || (node.score || 0) >= 4) return 'sentinel';
  return 'protected';
}

/** Project 2D map norms into a 3D holographic grid plane with slight elevation by threat. */
function toHoloPosition(node, idx, total) {
  const x = ((node.x ?? 0.5) - 0.5) * 10;
  const z = ((node.y ?? 0.5) - 0.5) * 10;
  const threatLift = (node.score || 0) * 0.12;
  const breathe = (hashStr(node.id) % 100) / 1000;
  const y = 0.15 + threatLift + breathe;
  // Slight spiral bias for visual interest when many nodes share coords
  const angle = (idx / Math.max(1, total)) * Math.PI * 2;
  const jitter = 0.15;
  return {
    x: x + Math.cos(angle) * jitter,
    y,
    z: z + Math.sin(angle) * jitter,
  };
}

function connectionStyle(fromState, toState) {
  if (fromState === 'breach' || toState === 'breach') {
    return { kind: 'breach', color: STATE_COLORS.breach, pulse: 1.4, particles: true };
  }
  if (fromState === 'threat' || toState === 'threat') {
    return { kind: 'threat', color: STATE_COLORS.threat, pulse: 1.1, particles: true };
  }
  if (fromState === 'sentinel' || toState === 'sentinel') {
    return { kind: 'guardian', color: STATE_COLORS.sentinel, pulse: 0.8, particles: false };
  }
  return { kind: 'healthy', color: STATE_COLORS.protected, pulse: 0.6, particles: false };
}

/**
 * Enrich classic map-data payload into Omega holographic scene graph.
 */
export function buildHolographicScene(events = [], options = {}) {
  const base = events.length ? buildMapNodes(events, options) : simulatedMapNodes();
  const morph = options.morph || 'research';
  const champion = options.champion || null;
  const planeState = options.planeState || {};

  const nodes = base.nodes.map((n, idx) => {
    const state = nodeState(n);
    const pos = toHoloPosition(n, idx, base.nodes.length);
    const label = roleLabel(n, idx);
    return {
      ...n,
      label,
      state,
      color: STATE_COLORS[state] || n.color,
      glow: state === 'breach' ? 1.5 : state === 'threat' ? 1.1 : 0.7,
      radius: Math.max(0.12, Math.min(0.45, 0.12 + (n.score || 0) * 0.04)),
      position: pos,
      planeShell: n.plane === 'lan' ? 'ghost-lan' : n.plane,
      genomeId: n.genomeResponse || champion?.id || null,
      fitness: champion?.fitness?.score ?? null,
      morphState: morph,
      history: [],
      breathing: state === 'protected' || state === 'sentinel',
    };
  });

  // Hub / immune core at origin
  nodes.unshift({
    id: 'immune-core',
    label: 'NEXUS-CORE',
    state: 'guardian',
    color: STATE_COLORS.sentinel,
    glow: 1.8,
    radius: 0.35,
    position: { x: 0, y: 0.4, z: 0 },
    plane: 'hub',
    planeShell: 'hub',
    ttp: 'engagement',
    score: 10,
    type: 'immune-core',
    ts: Date.now(),
    breathing: true,
    isCore: true,
  });

  const idToNode = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const connections = (base.connections || []).map((c) => {
    const from = idToNode[c.from];
    const to = idToNode[c.to];
    const style = connectionStyle(from?.state, to?.state);
    return {
      ...c,
      ...style,
      fromPos: from?.position,
      toPos: to?.position,
    };
  });

  // Core spokes to high-value nodes
  for (const n of nodes.slice(1, 9)) {
    if (!n.position) continue;
    connections.push({
      from: 'immune-core',
      to: n.id,
      kind: n.state === 'breach' ? 'breach' : 'healthy',
      color: n.state === 'breach' ? STATE_COLORS.breach : STATE_COLORS.protected,
      pulse: 0.5,
      particles: n.state === 'breach',
      fromPos: { x: 0, y: 0.4, z: 0 },
      toPos: n.position,
      synthetic: true,
    });
  }

  const shells = PLANE_SHELLS.map((s) => ({
    ...s,
    enabled: planeState[s.id]?.enabled !== false,
    armed: planeState[s.id]?.armed === true,
    health: planeState[s.id]?.armed ? 1 : planeState[s.id]?.enabled ? 0.5 : 0.15,
  }));

  const activeIntrusionPaths = connections.filter((c) => c.kind === 'breach' || c.kind === 'threat').length;
  const breachNodes = nodes.filter((n) => n.state === 'breach').length;
  const sentinelNodes = nodes.filter((n) => n.state === 'sentinel' || n.state === 'guardian').length;

  return {
    ok: true,
    version: '2.0',
    generatedAt: Date.now(),
    morph,
    visual: {
      palette: STATE_COLORS,
      gridSize: 12,
      fogDensity: morph === 'stealth' ? 0.08 : morph === 'aggressive' ? 0.03 : 0.05,
      bloomStrength: morph === 'aggressive' ? 1.4 : morph === 'forensic' ? 0.9 : 1.1,
      connectionStyle: morph === 'forensic' ? 'dashed' : morph === 'stealth' ? 'dim' : 'neon',
    },
    stats: {
      nodeCount: nodes.length,
      connectionCount: connections.length,
      activeIntrusionPaths,
      breachNodes,
      sentinelNodes,
      simulated: base.simulated || false,
    },
    nodes,
    connections,
    shells,
    clusters: base.clusters || [],
    insights: base.insights || [],
    legend: {
      colors: [
        { id: 'protected', label: 'PROTECTED', color: STATE_COLORS.protected },
        { id: 'threat', label: 'THREAT PATH', color: STATE_COLORS.threat },
        { id: 'breach', label: 'LIVE BREACH', color: STATE_COLORS.breach },
        { id: 'sentinel', label: 'EVOLVED SENTINEL', color: STATE_COLORS.sentinel },
      ],
      planes: shells.map((s) => ({ id: s.id, label: s.label, color: s.color })),
    },
    timeRange: base.timeRange,
  };
}

/**
 * Rich demo scene matching the visual bible (SCANNER-47, PROXY-09, C2, COMPROMISED-EDGE-04…).
 */
export function omegaDemoScene(options = {}) {
  const now = Date.now();
  const morph = options.morph || 'research';

  const script = [
    { label: 'SCANNER-47', ttp: 'scanning', plane: 'edge', score: 3, state: 'protected', x: -3.5, z: -2.2, y: 0.4 },
    { label: 'PROXY-09', ttp: 'engagement', plane: 'edge', score: 4, state: 'protected', x: -1.8, z: -1.5, y: 0.5 },
    { label: 'C2-beacon-violet-ghost-103', ttp: 'trap', plane: 'lan', score: 6, state: 'threat', x: -2.2, z: 1.2, y: 0.7 },
    { label: 'Veil.Node', ttp: 'recon', plane: 'deep-veil', score: 2, state: 'protected', x: 1.5, z: -2.8, y: 0.35 },
    { label: 'COMPROMISED-EDGE-04', ttp: 'lateral', plane: 'edge', score: 8, state: 'breach', x: 3.8, z: 0.8, y: 1.1 },
    { label: 'SENTINEL-12', ttp: 'trap', plane: 'lan', score: 5, state: 'sentinel', x: -0.5, z: 2.5, y: 0.55 },
    { label: 'SENTINEL-03', ttp: 'engagement', plane: 'mirage-core', score: 5, state: 'sentinel', x: 2.0, z: 2.0, y: 0.5 },
    { label: 'AUTH-CHAIN-21', ttp: 'credential', plane: 'audit', score: 5, state: 'threat', x: 0.8, z: 0.2, y: 0.65 },
    { label: 'MESH-PEER-01', ttp: 'recon', plane: 'phantom-mesh', score: 2, state: 'protected', x: 3.2, z: -2.0, y: 0.3 },
    { label: 'NARRATIVE-ECHO', ttp: 'engagement', plane: 'narrative-weave', score: 3, state: 'protected', x: -3.0, z: 2.8, y: 0.4 },
    { label: 'GUARDIAN-07', ttp: 'trap', plane: 'lan', score: 6, state: 'sentinel', x: 1.0, z: -0.8, y: 0.6 },
    { label: 'PROBE-66', ttp: 'scanning', plane: 'audit', score: 3, state: 'protected', x: -4.0, z: 0.5, y: 0.35 },
  ];

  const nodes = [
    {
      id: 'immune-core',
      label: 'NEXUS-CORE',
      state: 'guardian',
      color: STATE_COLORS.sentinel,
      glow: 1.8,
      radius: 0.38,
      position: { x: 0, y: 0.45, z: 0 },
      plane: 'hub',
      planeShell: 'hub',
      ttp: 'engagement',
      score: 10,
      type: 'immune-core',
      ts: now,
      breathing: true,
      isCore: true,
    },
  ];

  script.forEach((s, i) => {
    nodes.push({
      id: `demo-${i}`,
      eventId: `demo-evt-${i}`,
      label: s.label,
      state: s.state,
      color: STATE_COLORS[s.state],
      glow: s.state === 'breach' ? 1.6 : s.state === 'threat' ? 1.2 : 0.8,
      radius: 0.14 + (s.score || 0) * 0.025,
      position: { x: s.x, y: s.y, z: s.z },
      plane: s.plane,
      planeShell: s.plane,
      ttp: s.ttp,
      score: s.score,
      type: s.ttp,
      ts: now - (script.length - i) * 420000,
      ip: `10.${i}.0.${40 + i}`,
      breathing: s.state !== 'breach',
      success: s.state === 'sentinel',
      genomeId: s.state === 'sentinel' ? 'genome_chad_alpha' : null,
      morphState: morph,
    });
  });

  const pathDefs = [
    ['demo-0', 'demo-1', 'threat'],
    ['demo-1', 'demo-2', 'threat'],
    ['demo-2', 'demo-7', 'threat'],
    ['demo-7', 'demo-4', 'breach'],
    ['demo-5', 'demo-6', 'guardian'],
    ['demo-10', 'demo-5', 'guardian'],
    ['demo-3', 'demo-8', 'healthy'],
    ['demo-11', 'demo-0', 'healthy'],
    ['immune-core', 'demo-5', 'guardian'],
    ['immune-core', 'demo-10', 'guardian'],
    ['immune-core', 'demo-4', 'breach'],
  ];

  const idMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const connections = pathDefs.map(([from, to, kind]) => {
    const a = idMap[from];
    const b = idMap[to];
    const color =
      kind === 'breach' ? STATE_COLORS.breach :
      kind === 'threat' ? STATE_COLORS.threat :
      kind === 'guardian' ? STATE_COLORS.sentinel :
      STATE_COLORS.protected;
    return {
      from,
      to,
      kind,
      color,
      pulse: kind === 'breach' ? 1.5 : 0.9,
      particles: kind === 'breach' || kind === 'threat',
      fromPos: a?.position,
      toPos: b?.position,
    };
  });

  // Predictive cones — probable next hops from COMPROMISED-EDGE
  const predictive = [
    {
      from: 'demo-4',
      toLabel: 'PREDICTED-LATERAL-88',
      probability: 0.72,
      color: STATE_COLORS.predictive,
      fromPos: idMap['demo-4']?.position,
      toPos: { x: 5.2, y: 1.3, z: 2.1 },
    },
    {
      from: 'demo-4',
      toLabel: 'PREDICTED-EXFIL-12',
      probability: 0.48,
      color: STATE_COLORS.predictive,
      fromPos: idMap['demo-4']?.position,
      toPos: { x: 4.8, y: 0.9, z: -1.4 },
    },
  ];

  return {
    ok: true,
    version: '2.0',
    generatedAt: now,
    morph,
    demo: true,
    visual: {
      palette: STATE_COLORS,
      gridSize: 12,
      fogDensity: 0.05,
      bloomStrength: 1.2,
      connectionStyle: 'neon',
    },
    stats: {
      nodeCount: nodes.length,
      connectionCount: connections.length,
      activeIntrusionPaths: connections.filter((c) => c.kind === 'breach' || c.kind === 'threat').length,
      breachNodes: nodes.filter((n) => n.state === 'breach').length,
      sentinelNodes: nodes.filter((n) => n.state === 'sentinel' || n.state === 'guardian').length,
      simulated: true,
    },
    nodes,
    connections,
    predictive,
    shells: PLANE_SHELLS.map((s) => ({ ...s, enabled: true, armed: true, health: 0.85 + Math.random() * 0.15 })),
    clusters: [],
    insights: [
      { level: 'high', text: 'Active breach path traced to COMPROMISED-EDGE-04 via C2 beacon chain.' },
      { level: 'info', text: 'Sentinel genomes containing lateral probes on Ghost LAN plane.' },
    ],
    legend: {
      colors: [
        { id: 'protected', label: 'PROTECTED', color: STATE_COLORS.protected },
        { id: 'threat', label: 'THREAT PATH', color: STATE_COLORS.threat },
        { id: 'breach', label: 'LIVE BREACH', color: STATE_COLORS.breach },
        { id: 'sentinel', label: 'EVOLVED SENTINEL', color: STATE_COLORS.sentinel },
      ],
      planes: PLANE_SHELLS.map((s) => ({ id: s.id, label: s.label, color: s.color })),
    },
    timeRange: { min: now - 24 * 3600000, max: now },
  };
}

/**
 * Chad Genome hall of fame — top evolved personas with battle stats.
 */
export function buildGenomeLeaderboard(pool = [], limit = 8) {
  return [...pool]
    .filter((g) => g.status !== 'retired' || (g.fitness?.score || 0) > 0)
    .sort((a, b) => (b.fitness?.score || 0) - (a.fitness?.score || 0))
    .slice(0, limit)
    .map((g, rank) => ({
      rank: rank + 1,
      id: g.id,
      shortId: String(g.id).replace(/^genome_/, '').slice(0, 10),
      archetype: g.personality?.archetype || 'unknown',
      tone: g.personality?.tone || 'neutral',
      generation: g.generation || 0,
      fitness: Math.round(g.fitness?.score || 0),
      engagements: g.fitness?.engagements || 0,
      dwellMs: g.fitness?.dwellMs || 0,
      lateralBlocked: g.fitness?.lateralAttempts || 0,
      title: rank === 0 ? 'CHAD ALPHA' : rank === 1 ? 'BETA WARDEN' : `GEN-${g.generation || 0}`,
      status: g.status || 'active',
    }));
}

/**
 * Phylogenetic tree edges for lineage visualization.
 */
export function buildPhylogeny(pool = []) {
  const nodes = pool.map((g) => ({
    id: g.id,
    generation: g.generation || 0,
    fitness: g.fitness?.score || 0,
    archetype: g.personality?.archetype,
    status: g.status,
  }));
  const edges = [];
  for (const g of pool) {
    const parents = (g.lineage || []).slice(-2);
    for (const p of parents) {
      if (pool.some((x) => x.id === p)) {
        edges.push({ from: p, to: g.id });
      }
    }
  }
  return { nodes, edges };
}

export { STATE_COLORS, PLANE_SHELLS };
