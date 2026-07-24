import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { startLocalEdgeServer } from '../packages/edge/local-server.js';
import { runPassiveDrill } from '../packages/passive/drill.js';
import { enrichConfig } from '../packages/core/src/config.js';
import { BUNDLED_GHOST_LAN } from '../packages/core/src/paths.js';

assert.ok(fs.existsSync(BUNDLED_GHOST_LAN), 'bundled ghost-lan missing');
assert.ok(fs.existsSync(path.join(BUNDLED_GHOST_LAN, 'bin/ghost-lan.js')), 'ghost-lan CLI missing');

const { server, port } = await startLocalEdgeServer({ port: 30101, siteSeed: 'ghost-continuum-local' });

try {
  const base = `http://127.0.0.1:${port}`;
  const report = await runPassiveDrill(base, { siteSeed: 'ghost-continuum-local' });
  assert.ok(report.allOk, `passive drill failed: ${JSON.stringify(report.results)}`);

  const cfg = enrichConfig({});
  assert.ok(cfg.paths.ghostLan.replace(/\\/g, '/').includes('packages/ghost-lan'));
  assert.strictEqual(cfg.edgeMode, 'local');
  assert.ok(cfg.edgeStatusUrl.includes('30001'));

  console.log('ghost-continuum stack: OK', { drill: report.passed, ghostLan: true });
} finally {
  server.close();
}