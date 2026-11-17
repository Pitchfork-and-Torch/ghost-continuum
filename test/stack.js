import assert from 'assert';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { TRIPWIRE, TRIPWIRE_MAX_BYTES } from '../packages/edge/engine.js';
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

  function postEdge(rawPath, raw) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: rawPath,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(raw),
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        },
      );
      req.on('error', reject);
      req.write(raw);
      req.end();
    });
  }
  assert.strictEqual(await postEdge(TRIPWIRE, 'null'), 204);
  assert.strictEqual(await postEdge(TRIPWIRE, '{"t":"sentinel-alive"}'), 204);
  assert.strictEqual(await postEdge(TRIPWIRE, 'x'.repeat(TRIPWIRE_MAX_BYTES + 1)), 413);

  const cfg = enrichConfig({});
  assert.ok(cfg.paths.ghostLan.replace(/\\/g, '/').includes('packages/ghost-lan'));
  assert.strictEqual(cfg.edgeMode, 'local');
  assert.ok(cfg.edgeStatusUrl.includes('30001'));

  console.log('ghost-continuum stack: OK', { drill: report.passed, ghostLan: true });
} finally {
  server.close();
}