import { spawnDecoy } from '../../planes/src/mirage-core.js';
import { runEvolutionCycle } from '../../genome/src/pool.js';
import { publishStrategy } from '../../planes/src/phantom-mesh.js';

/**
 * Fitness spike and engagement triggers — auto-spawn mirage, evolve, mesh publish.
 */

export function evaluateTriggers(config, event, context = {}) {
  const results = [];
  const score = event?.score || 0;
  const fitness = context.championFitness || 0;

  const mirageThreshold = config?.continuum?.triggers?.mirageFitnessThreshold || 40;
  if (config?.continuum?.planes?.mirageCore && fitness >= mirageThreshold && score >= 5) {
    const spawn = spawnDecoy(config, {
      reason: 'fitness-spike',
      ip: event.ip,
      fitness,
      type: event.type,
    });
    results.push({ kind: 'mirage-spawn', ...spawn });
  }

  const evolveEvery = config?.continuum?.evolution?.cycleEvery || 25;
  const engagements = context.totalEngagements || 0;
  if (config?.continuum?.evolution?.enabled !== false && engagements > 0 && engagements % evolveEvery === 0) {
    const evo = runEvolutionCycle({ populationSize: config?.continuum?.evolution?.populationSize || 8 });
    results.push({ kind: 'genome-evolution', champion: evo.champion?.id });
  }

  if (config?.continuum?.planes?.phantomMesh && score >= 4) {
    const pub = publishStrategy(config, {
      championArchetype: context.championArchetype,
      avgFitness: fitness,
      topTraits: context.championTraits || {},
      engagements,
    });
    results.push({ kind: 'mesh-publish', ...pub });
  }

  return results;
}