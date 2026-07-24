/**
 * Deception efficacy metrics — live readout from current stack setup + scoped engagements.
 */

const PLANE_WEIGHTS = {
  'ghost-lan': 22,
  edge: 22,
  audit: 12,
  'narrative-weave': 12,
  'phantom-mesh': 11,
  'deep-veil': 11,
  'mirage-core': 10,
};

const MORPH_MULT = {
  stealth: 0.95,
  research: 1,
  aggressive: 1.08,
  forensic: 1.02,
};

export function normalizePlaneId(plane) {
  if (!plane) return 'ops';
  if (plane === 'lan') return 'ghost-lan';
  return plane;
}

export function computeReadiness(planeRows = []) {
  const byId = Object.fromEntries(planeRows.map((p) => [p.id, p]));
  let armedWeight = 0;
  let enabled = 0;
  let armedCount = 0;
  const totalPossible = Object.values(PLANE_WEIGHTS).reduce((s, w) => s + w, 0);

  for (const [id, w] of Object.entries(PLANE_WEIGHTS)) {
    const p = byId[id];
    if (!p || p.enabled === false) continue;
    enabled += 1;
    if (p.armed === true) {
      armedWeight += w;
      armedCount += 1;
    }
  }

  return {
    readinessPct: totalPossible ? Math.round((armedWeight / totalPossible) * 100) : 0,
    armedPlanes: armedCount,
    enabledPlanes: enabled,
  };
}

function computeEngagementPerformance(events = [], genomes = []) {
  const engagements = events.filter((e) => (e.score || 0) >= 3);
  const uniqueIps = new Set(engagements.map((e) => e.ip).filter(Boolean));
  const trapTrips = events.filter((e) => String(e.type).includes('trap')).length;
  const rotations = events.filter((e) => String(e.type).includes('rotate')).length;

  const champion = genomes.length
    ? [...genomes].sort((a, b) => (b.fitness?.score || 0) - (a.fitness?.score || 0))[0]
    : null;

  const timeWastedEstimateSec = engagements.reduce((s, e) => {
    const dwell = e.detail?.dwellMs || e.detail?.delayMs || 0;
    return s + dwell / 1000 + (e.score || 0) * 2;
  }, 0);

  const performanceScore = Math.min(
    100,
    Math.round(
      uniqueIps.size * 8 +
        trapTrips * 5 +
        rotations * 2 +
        Math.log10(1 + timeWastedEstimateSec) * 10 +
        (champion?.fitness?.score || 0) * 0.5,
    ),
  );

  return {
    performanceScore,
    engagements: engagements.length,
    uniqueAttackers: uniqueIps.size,
    trapTrips,
    rotations,
    timeWastedEstimateSec: Math.round(timeWastedEstimateSec),
    championGenomeId: champion?.id || null,
    championFitness: champion?.fitness?.score || 0,
  };
}

export function mergeLivePlaneState(configPlanes = [], live = null) {
  if (!live) return configPlanes;
  return configPlanes.map((p) => {
    if (p.id === 'ghost-lan' && live.lan) {
      const enabled = live.lan.enabled !== false;
      return { ...p, enabled, armed: enabled && live.lan.armed === true };
    }
    if (p.id === 'edge' && live.edge) {
      const enabled = live.edge.enabled !== false;
      return { ...p, enabled, armed: enabled && live.edge.armed === true };
    }
    if (p.id === 'audit' && live.audit) {
      const enabled = live.audit.enabled !== false;
      return { ...p, enabled, armed: enabled && live.audit.armed === true };
    }
    return p;
  });
}

export function computeEfficacy(events = [], genomes = [], context = {}) {
  const planeRows = context.planes || [];
  const { readinessPct, armedPlanes, enabledPlanes } = computeReadiness(planeRows);
  const morphMult = MORPH_MULT[context.morph?.id] ?? 1;

  const enabledIds = new Set(planeRows.filter((p) => p.enabled !== false).map((p) => p.id));
  enabledIds.add('hub');
  enabledIds.add('ops');

  const scoped = events.filter((e) => {
    if (!context.includeTrainingEvents && e.detail?.efficacyMaximizer) return false;
    return enabledIds.has(normalizePlaneId(e.plane));
  });

  const perf = computeEngagementPerformance(scoped, genomes);

  let deceptionEfficacyScore;
  if (context.includeTrainingEvents) {
    deceptionEfficacyScore = Math.min(100, Math.round(perf.performanceScore * morphMult));
  } else if (readinessPct === 0) {
    deceptionEfficacyScore = 0;
  } else {
    deceptionEfficacyScore = Math.min(
      100,
      Math.round((perf.performanceScore * 0.7 + readinessPct * 0.3) * (readinessPct / 100) * morphMult),
    );
  }

  return {
    deceptionEfficacyScore,
    setupReadiness: readinessPct,
    engagementPerformance: perf.performanceScore,
    morphMultiplier: morphMult,
    armedPlanes,
    enabledPlanes,
    engagements: perf.engagements,
    uniqueAttackers: perf.uniqueAttackers,
    trapTrips: perf.trapTrips,
    rotations: perf.rotations,
    timeWastedEstimateSec: perf.timeWastedEstimateSec,
    genomePoolSize: genomes.length,
    championGenomeId: perf.championGenomeId,
    championFitness: perf.championFitness,
    computedAt: Date.now(),
  };
}

export function engagementHeatmap(events = []) {
  const buckets = {};
  for (const e of events) {
    const hour = new Date(e.ts || Date.now()).getUTCHours();
    buckets[hour] = (buckets[hour] || 0) + 1;
  }
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: buckets[h] || 0 }));
}