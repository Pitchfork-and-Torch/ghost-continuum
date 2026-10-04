import crypto from 'crypto';
import { ARCHETYPES, FRAGMENT_STYLES, PERSONALITY_TONES, TRAIT_BOUNDS, createGenome } from './schema.js';

function rngFromSeed(seed) {
  let h = crypto.createHash('sha256').update(String(seed)).digest();
  return () => {
    h = crypto.createHash('sha256').update(h).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

function clampTrait(key, value) {
  const [min, max] = TRAIT_BOUNDS[key];
  return Math.max(min, Math.min(max, value));
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

export function mutate(genome, rate = 0.15, seed = genome.id) {
  const rand = rngFromSeed(`${seed}:mutate:${Date.now()}`);
  const child = createGenome({
    ...genome,
    id: `genome_${crypto.randomBytes(6).toString('hex')}`,
    generation: (genome.generation || 0) + 1,
    lineage: [...(genome.lineage || []), genome.id],
    fitness: { score: 0, engagements: 0, dwellMs: 0, commandsDetected: 0, lateralAttempts: 0, depthScore: 0 },
  });

  for (const key of Object.keys(TRAIT_BOUNDS)) {
    if (rand() < rate) {
      const delta = (rand() - 0.5) * 0.4 * (TRAIT_BOUNDS[key][1] - TRAIT_BOUNDS[key][0]);
      child.traits[key] = clampTrait(key, (child.traits[key] || 0) + delta);
    }
  }

  if (rand() < rate * 0.5) child.fragments.htmlMutation = pick(rand, FRAGMENT_STYLES);
  if (rand() < rate * 0.3) child.personality.tone = pick(rand, PERSONALITY_TONES);
  if (rand() < rate * 0.2) child.personality.archetype = pick(rand, ARCHETYPES);

  return child;
}

export function crossover(parentA, parentB, seed = `${parentA.id}+${parentB.id}`) {
  const rand = rngFromSeed(`${seed}:cross:${Date.now()}`);
  const traits = {};
  for (const key of Object.keys(TRAIT_BOUNDS)) {
    traits[key] = rand() < 0.5 ? parentA.traits[key] : parentB.traits[key];
    if (rand() < 0.1) {
      const mid = (parentA.traits[key] + parentB.traits[key]) / 2;
      traits[key] = clampTrait(key, mid + (rand() - 0.5) * 0.2);
    }
  }

  return createGenome({
    generation: Math.max(parentA.generation, parentB.generation) + 1,
    lineage: [...new Set([...(parentA.lineage || []), parentA.id, parentB.id])],
    traits,
    personality: rand() < 0.5 ? { ...parentA.personality } : { ...parentB.personality },
    fragments: rand() < 0.5 ? { ...parentA.fragments } : { ...parentB.fragments },
  });
}

export function tournamentSelect(ranked, k = 3, seed = 'tournament') {
  if (!ranked.length) return null;
  const rand = rngFromSeed(seed);
  let best = null;
  for (let i = 0; i < Math.min(k, ranked.length); i++) {
    const candidate = ranked[Math.floor(rand() * ranked.length)];
    if (!best || (candidate.fitness?.score || 0) > (best.fitness?.score || 0)) best = candidate;
  }
  return best;
}

/**
 * Run one evolution cycle: retire bottom performers, breed replacements.
 */
export function evolveGeneration(pool, options = {}) {
  const {
    populationSize = 8,
    retireBelow = 2,
    mutationRate = 0.15,
    seed = `evo-${Date.now()}`,
  } = options;

  const active = pool.filter((g) => g.status === 'active');
  const ranked = [...active].sort((a, b) => (b.fitness?.score || 0) - (a.fitness?.score || 0));

  const survivors = ranked.slice(0, Math.max(2, populationSize - retireBelow));
  const retired = ranked.slice(survivors.length).map((g) => ({ ...g, status: 'retired' }));

  const offspring = [];
  const rand = rngFromSeed(seed);

  while (survivors.length + offspring.length < populationSize) {
    const a = tournamentSelect(ranked, 3, `${seed}:a:${offspring.length}`);
    const b = tournamentSelect(ranked, 3, `${seed}:b:${offspring.length}`);
    if (!a) break;

    let child;
    if (b && b.id !== a.id && rand() < 0.6) {
      child = crossover(a, b, `${seed}:x:${offspring.length}`);
    } else {
      child = mutate(a, mutationRate, `${seed}:m:${offspring.length}`);
    }
    offspring.push(child);
  }

  const nextPool = [...pool.filter((g) => g.status === 'retired'), ...survivors, ...offspring, ...retired.filter((g) => !survivors.find((s) => s.id === g.id))];

  return {
    pool: nextPool.slice(-populationSize * 3),
    promoted: survivors.map((g) => g.id),
    bred: offspring.map((g) => g.id),
    retired: retired.map((g) => g.id),
    champion: survivors[0] || null,
  };
}