import fs from 'fs';
import path from 'path';
import os from 'os';
import { createGenome, ARCHETYPES, validateGenome } from './schema.js';
import { applyFitness, engagementSignal, rankGenomes } from './fitness.js';
import { evolveGeneration } from './evolution.js';
import { evolveNsga2 } from './nsga2.js';

export const GENOME_DIR = path.join(os.homedir(), '.ghost-continuum', 'genomes');
export const POOL_PATH = path.join(GENOME_DIR, 'pool.json');

export function seedPool(personas = ARCHETYPES, count = 6) {
  const pool = [];
  for (let i = 0; i < count; i++) {
    pool.push(
      createGenome({
        generation: 0,
        personality: { archetype: personas[i % personas.length] },
        fragments: { responseTemplate: personas[i % personas.length] },
      }),
    );
  }
  return pool;
}

export function loadPool() {
  if (!fs.existsSync(POOL_PATH)) return seedPool();
  try {
    const data = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
    return Array.isArray(data.pool) ? data.pool : seedPool();
  } catch {
    return seedPool();
  }
}

export function savePool(pool, meta = {}) {
  fs.mkdirSync(GENOME_DIR, { recursive: true });
  const payload = {
    v: 1,
    updatedAt: new Date().toISOString(),
    count: pool.length,
    championId: rankGenomes(pool.filter((g) => g.status === 'active'))[0]?.id || null,
    ...meta,
    pool,
  };
  fs.writeFileSync(POOL_PATH, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

export function getChampion(pool) {
  const active = pool.filter((g) => g.status === 'active');
  return rankGenomes(active)[0] || active[0] || null;
}

export function getGenomeById(pool, id) {
  return pool.find((g) => g.id === id) || null;
}

export function recordEngagement(pool, genomeId, event) {
  const idx = pool.findIndex((g) => g.id === genomeId);
  if (idx < 0) return { pool, genome: null };
  const signal = engagementSignal(event);
  const updated = applyFitness(pool[idx], signal);
  const next = [...pool];
  next[idx] = updated;
  return { pool: next, genome: updated, signal };
}

export function runEvolutionCycle(options = {}) {
  const pool = loadPool();
  const algorithm = options.algorithm || options.algo || 'classic';
  let result;
  if (algorithm === 'nsga2' || algorithm === 'omega') {
    result = evolveNsga2(pool, options);
  } else {
    result = evolveGeneration(pool, options);
    result.algorithm = result.algorithm || 'classic';
  }
  const saved = savePool(result.pool, {
    lastEvolution: new Date().toISOString(),
    algorithm: result.algorithm || algorithm,
    promoted: result.promoted,
    bred: result.bred,
    retired: result.retired,
    paretoFront: result.paretoFront || null,
  });
  return { ...result, meta: saved };
}

export function ensurePool(personas) {
  let pool = loadPool();
  if (!pool.length) {
    pool = seedPool(personas);
    savePool(pool, { seeded: true });
  }
  const valid = pool.every((g) => validateGenome(g).ok);
  if (!valid) {
    pool = seedPool(personas);
    savePool(pool, { reseeded: true });
  }
  return pool;
}