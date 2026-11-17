/**
 * Restore keeps hub access settings and rejects a bad upload before writing.
 */
import assert from 'assert';
import fs from 'fs';
import http from 'http';
import { CONFIG_PATH, GC_DIR } from '../packages/core/src/config.js';
import { restoreBackup } from '../packages/hub-api/src/backup-restore.js';
import { startHub } from '../packages/hub-api/src/server.js';

fs.mkdirSync(GC_DIR, { recursive: true });
const hadConfig = fs.existsSync(CONFIG_PATH);
const originalConfig = hadConfig ? fs.readFileSync(CONFIG_PATH) : null;

function writeConfig(obj) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(obj, null, 2) + '\n');
}

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

const current = {
  hubToken: 'keep-token',
  hubAllowedHosts: ['ghost.jonbailey.xyz'],
  bind: '127.0.0.1',
  host: '127.0.0.1',
  port: 30000,
  hubPort: 30000,
  ghostLanPort: 29999,
  edgeLocalPort: 30001,
  cellPort: 3333,
  marker: 'current',
};

const uploaded = {
  hubToken: 'uploaded-token',
  hubAllowedHosts: ['uploaded.example'],
  bind: '0.0.0.0',
  host: 'uploaded.example',
  port: 1,
  hubPort: 1,
  ghostLanPort: 1,
  edgeLocalPort: 1,
  cellPort: 1,
  hubBind: '0.0.0.0',
  hubHost: 'uploaded.example',
  bindHost: '0.0.0.0',
  listenHost: '0.0.0.0',
  marker: 'uploaded',
  demoMode: true,
};

function bundle(config) {
  return {
    v: 1,
    kind: 'ghost-continuum-home-backup',
    files: { config: JSON.stringify(config) },
  };
}

function post(port, path, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Host: `127.0.0.1:${port}`,
          ...extraHeaders,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, body: json, raw: data });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

let server;
try {
  writeConfig(current);
  const before = fs.readFileSync(CONFIG_PATH);

  const bad = restoreBackup({ bundle: { files: { config: 'not-json' } } });
  assert.strictEqual(bad.ok, false);
  assert.deepStrictEqual(fs.readFileSync(CONFIG_PATH), before);

  const badShape = restoreBackup({ bundle: { files: { config: '[]' } } });
  assert.strictEqual(badShape.ok, false);
  assert.deepStrictEqual(fs.readFileSync(CONFIG_PATH), before);

  const badObject = restoreBackup({ bundle: { files: { config: { hubToken: 'uploaded-token' } } } });
  assert.strictEqual(badObject.ok, false);
  assert.deepStrictEqual(fs.readFileSync(CONFIG_PATH), before);

  const badInput = restoreBackup(null);
  assert.strictEqual(badInput.ok, false);
  assert.deepStrictEqual(fs.readFileSync(CONFIG_PATH), before);
  console.log('  invalid restore input is rejected and does not write');

  const ok = restoreBackup({ bundle: bundle(uploaded) });
  assert.strictEqual(ok.ok, true);
  assert.ok(ok.restored.includes('config'));
  const saved = readConfig();
  assert.strictEqual(saved.hubToken, 'keep-token');
  assert.deepStrictEqual(saved.hubAllowedHosts, ['ghost.jonbailey.xyz']);
  assert.strictEqual(saved.bind, '127.0.0.1');
  assert.strictEqual(saved.host, '127.0.0.1');
  assert.strictEqual(saved.port, 30000);
  assert.strictEqual(saved.hubPort, 30000);
  assert.strictEqual(saved.ghostLanPort, 29999);
  assert.strictEqual(saved.edgeLocalPort, 30001);
  assert.strictEqual(saved.cellPort, 3333);
  assert.strictEqual(saved.marker, 'uploaded');
  assert.strictEqual(saved.demoMode, true);
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'hubBind'));
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'hubHost'));
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'bindHost'));
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'listenHost'));
  console.log('  restore keeps hubToken, hubAllowedHosts, and bind/host/port');

  writeConfig(current);
  const started = await startHub({
    hubPort: 0,
    hubWatchIntervalMs: 0,
    writeRateLimitMax: 0,
    demoMode: true,
  });
  server = started.server;

  const invalidJson = await post(started.port, '/api/home/restore', '{');
  assert.strictEqual(invalidJson.status, 400);
  assert.strictEqual(invalidJson.body?.ok, false);
  assert.deepStrictEqual(readConfig(), current);

  const invalidBody = await post(started.port, '/api/home/restore', { nope: true });
  assert.strictEqual(invalidBody.status, 400);
  assert.strictEqual(invalidBody.body?.ok, false);
  assert.deepStrictEqual(readConfig(), current);

  const applied = await post(started.port, '/api/home/restore', { bundle: bundle(uploaded) });
  assert.strictEqual(applied.status, 200);
  assert.strictEqual(applied.body?.ok, true);
  const viaRoute = readConfig();
  assert.strictEqual(viaRoute.hubToken, 'keep-token');
  assert.deepStrictEqual(viaRoute.hubAllowedHosts, ['ghost.jonbailey.xyz']);
  assert.strictEqual(viaRoute.bind, '127.0.0.1');
  assert.strictEqual(viaRoute.port, 30000);
  assert.strictEqual(viaRoute.marker, 'uploaded');
  console.log('  restore route returns 400 for invalid input and keeps access settings');

  console.log('backup-restore: OK');
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (hadConfig) fs.writeFileSync(CONFIG_PATH, originalConfig);
  else if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
}
