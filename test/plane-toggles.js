import assert from 'assert';
import { loadConfig, enrichConfig } from '../packages/core/src/config.js';
import { toggleContinuumPlane } from '../packages/hub-api/src/plane-arm.js';
import { collectPlaneStatus } from '../packages/planes/src/registry.js';
import { listActiveDecoys } from '../packages/planes/src/mirage-core.js';

const EXTENDED = ['narrative-weave', 'phantom-mesh', 'deep-veil', 'mirage-core', 'trench-cloak'];
const CORE = ['ghost-lan', 'edge', 'audit'];

async function run() {
  const config = enrichConfig(loadConfig());

  for (const id of [...EXTENDED, ...CORE]) {
    const off = await toggleContinuumPlane(config, id, false);
    assert.ok(off.ok, `disable ${id}`);
    assert.strictEqual(off.enabled, false, `${id} enabled false`);
    assert.strictEqual(off.armed, false, `${id} armed false when off`);
  }

  const offStatus = collectPlaneStatus(config).filter((p) => [...EXTENDED, ...CORE].includes(p.id));
  assert.ok(offStatus.every((p) => p.enabled === false && p.armed === false), 'all off in status');
  assert.strictEqual(config.continuum.corePlanes.ghostLan, false);
  assert.strictEqual(config.continuum.corePlanes.edge, false);
  assert.strictEqual(config.continuum.corePlanes.audit, false);
  assert.strictEqual(config.continuum.planes.trenchCloak, false);

  for (const id of EXTENDED) {
    const on = await toggleContinuumPlane(config, id, true);
    assert.ok(on.ok, `enable ${id}`);
    assert.strictEqual(on.enabled, true, `${id} enabled true`);
    assert.strictEqual(on.armed, true, `${id} armed true when on`);
  }

  const onStatus = collectPlaneStatus(config).filter((p) => EXTENDED.includes(p.id));
  assert.ok(onStatus.every((p) => p.enabled === true && p.armed === true), 'extended armed when on');
  assert.strictEqual(config.continuum.planes.trenchCloak, true);

  await toggleContinuumPlane(config, 'mirage-core', false);
  assert.strictEqual(listActiveDecoys().length, 0, 'mirage decoys torn down when off');

  await toggleContinuumPlane(config, 'trench-cloak', false);
  assert.strictEqual(config.continuum.planes.trenchCloak, false, 'trench cloak off');

  for (const id of CORE) {
    await toggleContinuumPlane(config, id, true);
  }

  console.log('plane-toggles: OK');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});