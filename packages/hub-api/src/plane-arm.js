/**
 * Enable/disable continuum planes with real arm actions (not just config flags).
 */

import { saveConfig, enrichConfig } from '../../core/src/index.js';
import { collectPlaneStatus } from '../../planes/src/registry.js';
import { publishStrategy } from '../../planes/src/phantom-mesh.js';
import { startVeilProbe, stopVeilProbe } from '../../planes/src/deep-veil.js';
import { spawnDecoy, listActiveDecoys, teardownAllDecoys } from '../../planes/src/mirage-core.js';
import { startTrenchCloak, stopTrenchCloak } from '../../planes/src/trench-cloak.js';
import { getChampion, loadPool } from '../../genome/src/index.js';
import { loadEchoWorld, advanceEchoWorld, saveEchoWorld, generateEcosystem } from '../../narrative/src/index.js';
import { startGhostLanProcess, stopGhostLanProcess } from './adapters/ghost-lan.js';
import { startManagedLocalEdge, stopManagedLocalEdge } from './edge-runtime.js';

const TOGGLEABLE = new Set([
  'ghost-lan',
  'edge',
  'audit',
  'narrative-weave',
  'phantom-mesh',
  'deep-veil',
  'mirage-core',
  'trench-cloak',
]);

function corePlaneKey(planeId) {
  if (planeId === 'ghost-lan') return 'ghostLan';
  return planeId;
}

function isCorePlane(planeId) {
  return planeId === 'ghost-lan' || planeId === 'edge' || planeId === 'audit';
}

function setEnabled(config, planeId, enabled) {
  config.continuum = config.continuum || {};
  if (isCorePlane(planeId)) {
    const key = corePlaneKey(planeId);
    config.continuum.corePlanes = { ...config.continuum.corePlanes, [key]: enabled };
    if (planeId === 'audit') config.useBuiltinValidator = enabled;
    return { ok: true };
  }

  switch (planeId) {
    case 'narrative-weave':
      config.continuum.narrative = { ...config.continuum.narrative, enabled, worldId: config.continuum.narrative?.worldId || 'default' };
      break;
    case 'phantom-mesh':
      config.continuum.planes = { ...config.continuum.planes, phantomMesh: enabled };
      break;
    case 'deep-veil':
      config.continuum.planes = { ...config.continuum.planes, deepVeil: enabled };
      break;
    case 'mirage-core':
      config.continuum.planes = { ...config.continuum.planes, mirageCore: enabled };
      break;
    case 'trench-cloak':
      config.continuum.planes = { ...config.continuum.planes, trenchCloak: enabled };
      break;
    default:
      return { ok: false, error: `Plane ${planeId} is not toggleable` };
  }
  return { ok: true };
}

async function armPlane(config, planeId) {
  const champion = getChampion(loadPool());
  const actions = [];

  switch (planeId) {
    case 'ghost-lan': {
      const lan = await startGhostLanProcess(config);
      actions.push({ action: 'ghost-lan-start', ...lan });
      break;
    }
    case 'edge': {
      if (config.edgeMode === 'local') {
        const edge = await startManagedLocalEdge(config);
        actions.push({ action: 'edge-start', ok: true, url: edge.url });
      } else {
        actions.push({ action: 'edge-enable', mode: config.edgeMode || 'remote' });
      }
      break;
    }
    case 'audit': {
      actions.push({ action: 'audit-enable', mode: config.useBuiltinValidator !== false ? 'builtin' : 'none' });
      break;
    }
    case 'narrative-weave': {
      const worldId = config.continuum.narrative?.worldId || 'default';
      let world = loadEchoWorld(worldId);
      world = advanceEchoWorld(world, 6);
      saveEchoWorld(world);
      generateEcosystem(world);
      actions.push({ action: 'echo-world', epoch: world.epoch });
      break;
    }
    case 'phantom-mesh': {
      const mesh = publishStrategy(config, {
        championArchetype: champion?.personality?.archetype || 'router-admin',
        avgFitness: champion?.fitness?.score || 0,
        topTraits: champion?.traits || {},
        engagements: champion?.fitness?.engagements || 0,
      });
      actions.push({ action: 'mesh-publish', ...mesh });
      break;
    }
    case 'deep-veil': {
      const veil = startVeilProbe(config);
      actions.push({ action: 'veil-probe', ...veil });
      break;
    }
    case 'mirage-core': {
      if (listActiveDecoys().length === 0) {
        const mirage = spawnDecoy(config, { reason: 'plane-arm' });
        actions.push({ action: 'mirage-spawn', ...mirage });
      } else {
        actions.push({ action: 'mirage-existing', count: listActiveDecoys().length });
      }
      break;
    }
    case 'trench-cloak': {
      const cloak = await startTrenchCloak(config);
      actions.push({ action: 'trench-cloak-start', ...cloak });
      if (cloak.actions?.length) actions.push(...cloak.actions);
      break;
    }
    default:
      break;
  }

  return actions;
}

async function disarmPlane(config, planeId) {
  const actions = [];
  if (planeId === 'ghost-lan') {
    const lan = await stopGhostLanProcess(config);
    actions.push({ action: 'ghost-lan-stop', ...lan });
  }
  if (planeId === 'edge' && config.edgeMode === 'local') {
    const edge = await stopManagedLocalEdge();
    actions.push({ action: 'edge-stop', ...edge });
  }
  if (planeId === 'audit') {
    actions.push({ action: 'audit-disable' });
  }
  if (planeId === 'deep-veil') {
    stopVeilProbe();
    actions.push({ action: 'veil-stop' });
  }
  if (planeId === 'mirage-core') {
    const teardown = teardownAllDecoys(config);
    actions.push({ action: 'mirage-teardown', ...teardown });
  }
  if (planeId === 'trench-cloak') {
    const stop = stopTrenchCloak({ killManaged: true });
    // ensure managed process is torn down
    const { stopManagedTrench } = await import('../../planes/src/trench-cloak.js');
    const managed = await stopManagedTrench();
    actions.push({ action: 'trench-cloak-stop', ...stop, managed });
  }
  return actions;
}

export async function toggleContinuumPlane(config, planeId, enabled) {
  if (!TOGGLEABLE.has(planeId)) {
    return { ok: false, error: `Plane ${planeId} cannot be toggled via hub` };
  }

  const set = setEnabled(config, planeId, enabled);
  if (!set.ok) return set;

  let actions = [];
  if (enabled) actions = await armPlane(config, planeId);
  else actions = await disarmPlane(config, planeId);

  const enriched = enrichConfig(config);
  saveConfig(enriched);
  Object.assign(config, enriched);

  const status = collectPlaneStatus(config).find((p) => p.id === planeId);

  return {
    ok: true,
    planeId,
    enabled: status?.enabled === true,
    armed: status?.armed === true,
    status,
    actions,
  };
}