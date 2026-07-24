import { ensurePool, getChampion, runEvolutionCycle, loadPool } from '../../genome/src/index.js';
import { appendLedgerEntry, getLedgerRoot, verifyLedger } from '../../trust/src/index.js';
import { probeLlm } from '../../narrative/src/index.js';
import { collectPlaneStatus } from '../../planes/src/registry.js';
import { collectPluginStatus } from '../../plugins/loader.js';
import { resolveMorph } from './morphs.js';
import { computeEfficacy, engagementHeatmap, mergeLivePlaneState } from './metrics.js';

export async function buildContinuumStatus(config, context = {}) {
  const pool = ensurePool(config.personas);
  const champion = getChampion(pool);
  const morph = resolveMorph(config);
  const ledger = getLedgerRoot();
  const ledgerVerify = verifyLedger();
  const planes = mergeLivePlaneState(collectPlaneStatus(config), context.livePlanes);
  let plugins = [];
  try {
    plugins = await collectPluginStatus(config);
  } catch {
    plugins = [];
  }
  const events = context.events || [];
  const metrics = computeEfficacy(events, pool, { planes, morph });
  const heatmap = engagementHeatmap(events);

  return {
    ok: true,
    version: '3.0.0',
    codename: 'Living Deception Continuum',
    morph,
    genome: {
      poolSize: pool.length,
      active: pool.filter((g) => g.status === 'active').length,
      champion: champion
        ? {
            id: champion.id,
            archetype: champion.personality?.archetype,
            fitness: champion.fitness?.score,
            generation: champion.generation,
          }
        : null,
    },
    trust: {
      ledgerRoot: ledger.root,
      ledgerEntries: ledger.entries || 0,
      ledgerOk: ledgerVerify.ok,
    },
    narrative: {
      enabled: config?.continuum?.narrative?.enabled === true,
      worldId: config?.continuum?.narrative?.worldId || 'default',
    },
    planes: [...planes, ...plugins.filter((p) => p.ok)],
    plugins,
    metrics,
    heatmap,
    features: {
      evolution: config?.continuum?.evolution?.enabled !== false,
      ledger: config?.continuum?.trust?.ledger !== false,
      phantomMesh: config?.continuum?.planes?.phantomMesh === true,
      deepVeil: config?.continuum?.planes?.deepVeil === true,
      mirageCore: config?.continuum?.planes?.mirageCore === true,
    },
  };
}

export async function continuumTick(config, event) {
  const morph = resolveMorph(config);

  if (config?.continuum?.trust?.ledger !== false || morph.ledgerRequired) {
    appendLedgerEntry(event);
  }

  let evolution = null;
  if (config?.continuum?.evolution?.enabled !== false && event?.score >= 3) {
    const pool = loadPool();
    const totalEngagements = pool.reduce((s, g) => s + (g.fitness?.engagements || 0), 0);
    const interval = config?.continuum?.evolution?.cycleEvery || 25;
    if (totalEngagements > 0 && totalEngagements % interval === 0) {
      evolution = runEvolutionCycle({
        populationSize: config?.continuum?.evolution?.populationSize || 8,
      });
    }
  }

  return { morph, evolution };
}

export async function probeContinuumFeatures(config) {
  const llm = config?.continuum?.narrative?.enabled
    ? await probeLlm(config?.narrative?.llmEndpoint)
    : { ok: false, skipped: true };

  return {
    llm,
    planes: collectPlaneStatus(config),
    ledger: verifyLedger(),
  };
}