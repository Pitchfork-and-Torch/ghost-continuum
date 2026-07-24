/**
 * Multi-objective genetic algorithm (NSGA-II inspired) for deception genomes.
 * Objectives (maximize unless noted):
 *   1. evasion — detection resistance / masquerade
 *   2. engagement — dwell + trap success proxy
 *   3. forensicValue — breadcrumb density + logging utility
 *   4. resourceCost — inverted (lower cost = better)
 *
 * Pure Node, zero deps. Falls back gracefully; classic evolveGeneration still available.
 */

import crypto from 'crypto';
import { TRAIT_BOUNDS, createGenome } from './schema.js';
import { mutate, crossover } from './evolution.js';

function rngFromSeed(seed) {
  let h = crypto.createHash('sha256').update(String(seed)).digest();
  return () => {
    h = crypto.createHash('sha256').update(h).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

/**
 * Extract multi-objective vector from a genome.
 * Returns [evasion, engagement, forensic, resourceEfficiency] all in ~[0,1] maximize.
 */
export function objectiveVector(genome) {
  const t = genome.traits || {};
  const f = genome.fitness || {};

  const masquerade = clamp01(t.masqueradeStrength ?? 0.75);
  const delayNorm = 1 - clamp01((t.delayBias ?? 800) / 5000); // faster can evade some scanners
  const chaff = clamp01((t.chaffMultiplier ?? 1) / 3);
  const evasion = clamp01(0.45 * masquerade + 0.25 * delayNorm + 0.3 * (1 - (t.verbosity ?? 0.5)));

  const scoreNorm = clamp01((f.score || 0) / 100);
  const dwellNorm = clamp01((f.dwellMs || 0) / 120000);
  const engNorm = clamp01((f.engagements || 0) / 20);
  const engagement = clamp01(0.4 * scoreNorm + 0.35 * dwellNorm + 0.25 * engNorm);

  const crumbs = clamp01(t.breadcrumbDensity ?? 0.35);
  const verbosity = clamp01(t.verbosity ?? 0.5);
  const forensic = clamp01(0.5 * crumbs + 0.3 * verbosity + 0.2 * scoreNorm);

  // Resource: high chaff + high verbosity costs more
  const cost = clamp01(0.4 * chaff + 0.3 * verbosity + 0.3 * (t.rotationSensitivity ?? 3) / 10);
  const resourceEfficiency = 1 - cost;

  return [evasion, engagement, forensic, resourceEfficiency];
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

/** Pareto dominance: a dominates b if a is >= in all and > in at least one. */
export function dominates(a, b) {
  let better = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i] - 1e-9) return false;
    if (a[i] > b[i] + 1e-9) better = true;
  }
  return better;
}

export function nonDominatedSort(population) {
  const S = population.map(() => []);
  const n = population.map(() => 0);
  const rank = population.map(() => 0);
  const fronts = [[]];

  for (let p = 0; p < population.length; p++) {
    for (let q = 0; q < population.length; q++) {
      if (p === q) continue;
      if (dominates(population[p].objectives, population[q].objectives)) {
        S[p].push(q);
      } else if (dominates(population[q].objectives, population[p].objectives)) {
        n[p] += 1;
      }
    }
    if (n[p] === 0) {
      rank[p] = 0;
      fronts[0].push(p);
    }
  }

  let i = 0;
  while (fronts[i]?.length) {
    const next = [];
    for (const p of fronts[i]) {
      for (const q of S[p]) {
        n[q] -= 1;
        if (n[q] === 0) {
          rank[q] = i + 1;
          next.push(q);
        }
      }
    }
    i += 1;
    fronts[i] = next;
  }

  return { fronts: fronts.filter((f) => f.length), rank };
}

/** Crowding distance on a front for diversity preservation (novelty-ish). */
export function crowdingDistance(population, frontIndices) {
  const dist = {};
  for (const i of frontIndices) dist[i] = 0;
  if (frontIndices.length <= 2) {
    for (const i of frontIndices) dist[i] = Infinity;
    return dist;
  }

  const m = population[0].objectives.length;
  for (let obj = 0; obj < m; obj++) {
    const sorted = [...frontIndices].sort(
      (a, b) => population[a].objectives[obj] - population[b].objectives[obj],
    );
    dist[sorted[0]] = Infinity;
    dist[sorted[sorted.length - 1]] = Infinity;
    const min = population[sorted[0]].objectives[obj];
    const max = population[sorted[sorted.length - 1]].objectives[obj];
    const range = max - min || 1e-9;
    for (let k = 1; k < sorted.length - 1; k++) {
      dist[sorted[k]] +=
        (population[sorted[k + 1]].objectives[obj] - population[sorted[k - 1]].objectives[obj]) / range;
    }
  }
  return dist;
}

/**
 * Novelty search bonus — average distance to k nearest neighbors in trait space.
 */
export function noveltyScores(population, k = 3) {
  const scores = population.map(() => 0);
  for (let i = 0; i < population.length; i++) {
    const dists = [];
    for (let j = 0; j < population.length; j++) {
      if (i === j) continue;
      dists.push(traitDistance(population[i].genome, population[j].genome));
    }
    dists.sort((a, b) => a - b);
    const nearest = dists.slice(0, k);
    scores[i] = nearest.length ? nearest.reduce((s, d) => s + d, 0) / nearest.length : 0;
  }
  return scores;
}

function traitDistance(a, b) {
  const keys = Object.keys(TRAIT_BOUNDS);
  let sum = 0;
  for (const key of keys) {
    const [lo, hi] = TRAIT_BOUNDS[key];
    const range = hi - lo || 1;
    const va = (a.traits?.[key] ?? lo) / range;
    const vb = (b.traits?.[key] ?? lo) / range;
    sum += (va - vb) ** 2;
  }
  return Math.sqrt(sum / keys.length);
}

/**
 * Run one NSGA-II style generation on an active genome pool.
 */
export function evolveNsga2(pool, options = {}) {
  const {
    populationSize = 10,
    mutationRate = 0.18,
    seed = `nsga2-${Date.now()}`,
    noveltyWeight = 0.15,
  } = options;

  const active = pool.filter((g) => g.status === 'active');
  if (active.length < 2) {
    return {
      pool,
      promoted: active.map((g) => g.id),
      bred: [],
      retired: [],
      champion: active[0] || null,
      paretoFront: active.map((g) => g.id),
      algorithm: 'nsga2',
    };
  }

  const rand = rngFromSeed(seed);
  let population = active.map((genome) => ({
    genome,
    objectives: objectiveVector(genome),
  }));

  // Inject novelty into a synthetic 5th component for selection diversity
  const nov = noveltyScores(population);
  population = population.map((p, i) => ({
    ...p,
    objectives: [
      p.objectives[0],
      p.objectives[1],
      p.objectives[2],
      p.objectives[3],
      clamp01(p.objectives[0] * (1 - noveltyWeight) + nov[i] * noveltyWeight),
    ],
  }));

  const { fronts, rank } = nonDominatedSort(population);
  const selected = [];
  const selectedIdx = [];

  for (const front of fronts) {
    if (selected.length >= populationSize) break;
    const crowd = crowdingDistance(population, front);
    const ordered = [...front].sort((a, b) => (crowd[b] || 0) - (crowd[a] || 0));
    for (const idx of ordered) {
      if (selected.length >= populationSize) break;
      selected.push(population[idx].genome);
      selectedIdx.push(idx);
    }
  }

  // Breed offspring from Pareto-preferred parents
  const offspring = [];
  const front0 = fronts[0] || [];
  while (selected.length + offspring.length < populationSize) {
    const ia = front0[Math.floor(rand() * front0.length)] ?? 0;
    const ib = front0[Math.floor(rand() * front0.length)] ?? 0;
    const a = population[ia]?.genome || selected[0];
    const b = population[ib]?.genome || selected[0];
    let child;
    if (a && b && a.id !== b.id && rand() < 0.65) {
      child = crossover(a, b, `${seed}:x:${offspring.length}`);
    } else {
      child = mutate(a, mutationRate, `${seed}:m:${offspring.length}`);
    }
    // Tag multi-objective scores on child metadata for UI
    child.objectives = objectiveVector(child);
    child.paretoMeta = { algorithm: 'nsga2', bornFrom: [a.id, b?.id].filter(Boolean) };
    offspring.push(child);
  }

  const retired = active
    .filter((g) => !selected.find((s) => s.id === g.id))
    .map((g) => ({ ...g, status: 'retired' }));

  const survivors = selected.map((g) => {
    const idx = population.findIndex((p) => p.genome.id === g.id);
    return {
      ...g,
      status: 'active',
      objectives: objectiveVector(g),
      paretoRank: idx >= 0 ? rank[idx] : 1,
    };
  });

  // Champion = best scalarized fitness on front 0, prefer engagement+evasion
  const frontGenomes = (fronts[0] || []).map((i) => population[i].genome);
  const champion =
    [...frontGenomes].sort((a, b) => {
      const sa = scalarFitness(a);
      const sb = scalarFitness(b);
      return sb - sa;
    })[0] || survivors[0] || null;

  const nextPool = [
    ...pool.filter((g) => g.status === 'retired'),
    ...survivors,
    ...offspring,
    ...retired,
  ];

  return {
    pool: nextPool.slice(-populationSize * 4),
    promoted: survivors.map((g) => g.id),
    bred: offspring.map((g) => g.id),
    retired: retired.map((g) => g.id),
    champion,
    paretoFront: frontGenomes.map((g) => g.id),
    algorithm: 'nsga2',
    objectives: ['evasion', 'engagement', 'forensicValue', 'resourceEfficiency', 'novelty'],
  };
}

function scalarFitness(genome) {
  const o = objectiveVector(genome);
  // Weighted scalarization for single champion banner
  return o[0] * 30 + o[1] * 40 + o[2] * 20 + o[3] * 10 + (genome.fitness?.score || 0) * 0.3;
}

/**
 * 3D fitness landscape samples for Nexus visualization.
 * X = evasion, Y = engagement, Z = forensic — color by resource efficiency.
 */
export function fitnessLandscape(pool = [], resolution = 8) {
  const points = pool
    .filter((g) => g.status === 'active' || (g.fitness?.score || 0) > 0)
    .map((g) => {
      const o = g.objectives || objectiveVector(g);
      return {
        id: g.id,
        x: o[0],
        y: o[1],
        z: o[2],
        efficiency: o[3],
        fitness: g.fitness?.score || 0,
        archetype: g.personality?.archetype,
        generation: g.generation || 0,
      };
    });

  // Grid surface average for mesh (optional viz)
  const grid = [];
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const gx = i / (resolution - 1);
      const gy = j / (resolution - 1);
      let zSum = 0;
      let w = 0;
      for (const p of points) {
        const d = (p.x - gx) ** 2 + (p.y - gy) ** 2 + 0.05;
        const inv = 1 / d;
        zSum += p.z * inv;
        w += inv;
      }
      grid.push({ x: gx, y: gy, z: w ? zSum / w : 0 });
    }
  }

  return { points, grid, resolution };
}
