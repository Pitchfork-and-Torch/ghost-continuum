#!/usr/bin/env node
/**
 * Arm continuum planes: Ghost LAN, Edge, Audit, Narrative Weave,
 * Phantom Mesh, Deep Veil, Mirage Core, Trench Coat (privacy cloak).
 */
import { loadConfig, saveConfig, enrichConfig } from '../packages/core/src/config.js';
import { publishStrategy } from '../packages/planes/src/phantom-mesh.js';
import { startVeilProbe } from '../packages/planes/src/deep-veil.js';
import { spawnDecoy } from '../packages/planes/src/mirage-core.js';
import { startTrenchCloak } from '../packages/planes/src/trench-cloak.js';
import { loadEchoWorld, advanceEchoWorld, saveEchoWorld } from '../packages/narrative/src/echo.js';
import { generateEcosystem } from '../packages/narrative/src/docgen.js';
import { getChampion, loadPool } from '../packages/genome/src/pool.js';
import { collectPlaneStatus } from '../packages/planes/src/registry.js';

function armConfig(raw) {
  const base = enrichConfig(raw);
  base.continuum = {
    ...base.continuum,
    narrative: { ...base.continuum.narrative, enabled: true, worldId: base.continuum.narrative?.worldId || 'default' },
    planes: {
      ...base.continuum.planes,
      phantomMesh: true,
      deepVeil: true,
      mirageCore: true,
      trenchCloak: true,
    },
  };
  return base;
}

async function main() {
  console.log('\n  ▓ Arming continuum planes (incl. Trench Coat) ▓\n');

  const config = armConfig(loadConfig());
  saveConfig(config);

  const champion = getChampion(loadPool());
  const mesh = publishStrategy(config, {
    championArchetype: champion?.personality?.archetype || 'router-admin',
    avgFitness: champion?.fitness?.score || 0,
    topTraits: champion?.traits || {},
    engagements: champion?.fitness?.engagements || 0,
  });
  console.log(`  Phantom Mesh   ${mesh.ok ? `node ${mesh.nodeId}` : mesh.skipped ? 'skipped' : 'failed'}`);

  const veil = startVeilProbe(config);
  console.log(`  Deep Veil      ${veil.ok ? veil.mode : veil.skipped ? 'skipped' : veil.error || 'failed'}`);

  const mirage = spawnDecoy(config, { reason: 'arm-all-planes' });
  console.log(`  Mirage Core    ${mirage.ok ? `${mirage.decoy?.runtime} :${mirage.decoy?.port}` : mirage.error || 'failed'}`);

  const trench = await startTrenchCloak(config);
  console.log(
    `  Trench Coat    ${trench.ok ? trench.message || 'probed' : trench.skipped ? 'skipped' : trench.error || 'failed'}`,
  );

  let world = loadEchoWorld(config.continuum.narrative.worldId);
  world = advanceEchoWorld(world, 12);
  saveEchoWorld(world);
  generateEcosystem(world);
  console.log(`  Narrative      Echo Reality epoch ${world.epoch}`);

  console.log(`  Ghost LAN      armed (stack must be running)`);
  console.log(`  Edge           ${config.edgeStatusUrl || 'local'}`);
  console.log(`  Audit          builtin validator`);

  const planes = collectPlaneStatus(config);
  const armed = planes.filter((p) => p.armed).length;
  console.log(`\n  Planes reported: ${armed}/${planes.length}\n`);
  for (const p of planes) {
    console.log(`  ${p.armed ? '✓' : '○'} ${p.label || p.id}`);
  }
  console.log('\n  Restart stack to apply config: node bin/start-stack.js\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
