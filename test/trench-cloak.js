import assert from 'assert';
import {
  status,
  startTrenchCloak,
  stopTrenchCloak,
  probeCloak,
  getCloakProxyUrl,
  findTrenchBinary,
} from '../packages/planes/src/trench-cloak.js';

async function run() {
  const config = {
    continuum: {
      planes: {
        trenchCloak: false,
        trenchEntryHost: '127.0.0.1',
        trenchEntryPort: 1080,
        trenchApiPort: 8742,
        trenchAutoStart: false,
        trenchRouteTools: true,
      },
    },
  };

  const off = status(config);
  assert.strictEqual(off.enabled, false);
  assert.strictEqual(off.armed, false);
  assert.ok(off.message.toLowerCase().includes('disabled'));

  const skipped = await startTrenchCloak(config);
  assert.strictEqual(skipped.skipped, true);

  config.continuum.planes.trenchCloak = true;
  const on = await startTrenchCloak(config);
  assert.strictEqual(on.ok, true);
  assert.ok(on.mode === 'monitor');

  const st = status(config);
  assert.strictEqual(st.enabled, true);
  assert.strictEqual(st.armed, true);

  const snap = await probeCloak(config);
  assert.ok(snap.entry);
  assert.ok(typeof snap.cloaked === 'boolean');
  // proxy only when entry is up
  if (snap.entry.up) {
    assert.ok(getCloakProxyUrl(config));
  } else {
    assert.strictEqual(getCloakProxyUrl(config), null);
  }

  // binary lookup should not throw
  const bin = findTrenchBinary();
  assert.ok(bin === null || typeof bin === 'string');

  stopTrenchCloak();
  config.continuum.planes.trenchCloak = false;
  const after = status(config);
  assert.strictEqual(after.enabled, false);

  console.log('trench-cloak: OK');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
