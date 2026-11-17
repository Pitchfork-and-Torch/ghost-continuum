/**
 * Restore keeps hub access settings and rejects a bad upload before writing.
 */
import assert from 'assert';
import fs from 'fs';
import http from 'http';
import { CONFIG_PATH, GC_DIR } from '../packages/core/src/config.js';
import { createBackup, restoreBackup } from '../packages/hub-api/src/backup-restore.js';
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
  demoMode: false,
  edgeStatusUrl: 'https://edge-status.example/status',
  edgeStatusKey: 'edge-key-sentinel',
  tripwireUrl: 'https://trip.example/hook',
  allowedPrivateCidrs: ['10.0.0.0/8'],
  cloudflareWorkerName: 'keep-worker',
  notify: {
    discordWebhookUrl: 'https://discord.example/api/webhooks/keep',
    telegramBotToken: 'tg-keep',
    genericWebhookUrl: 'https://hooks.example/keep',
    homeAssistantToken: 'ha-keep',
    homeAssistantUrl: 'https://ha.example/keep',
    notifyOn: { realThreat: true },
  },
  continuum: {
    morph: 'research',
    plugins: ['keep-plugin.js'],
    planes: { mirageCore: false, mirageImage: 'alpine:3.19', phantomMesh: false },
    narrative: { enabled: false, worldId: 'keep-world' },
  },
  narrative: {
    llmEndpoint: 'http://127.0.0.1:11434',
    llmModel: 'llama3.2',
    llmTimeoutMs: 8000,
  },
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
  edgeStatusUrl: 'https://uploaded.example/status',
  edgeStatusKey: 'edge-key-uploaded',
  tripwireUrl: 'https://uploaded.example/trip',
  allowedPrivateCidrs: ['0.0.0.0/0'],
  cloudflareWorkerName: 'uploaded-worker',
  callbackUrl: 'https://uploaded.example/callback',
  notify: {
    discordWebhookUrl: 'https://discord.example/api/webhooks/uploaded',
    telegramBotToken: 'tg-uploaded',
    genericWebhookUrl: 'https://hooks.example/uploaded',
    homeAssistantToken: 'ha-uploaded',
    homeAssistantUrl: 'https://ha.example/uploaded',
    notifyOn: { realThreat: false },
  },
  continuum: {
    morph: 'stealth',
    plugins: ['uploaded-plugin.js'],
    planes: {
      mirageCore: true,
      mirageImage: 'uploaded:latest',
      phantomMesh: true,
      trenchEntryHost: '10.1.2.3',
    },
    narrative: { enabled: true, worldId: 'uploaded-world', llmEndpoint: 'http://uploaded.example' },
  },
  narrative: {
    llmEndpoint: 'http://uploaded.example:11434',
    llmModel: 'uploaded-model',
    llmTimeoutMs: 1000,
  },
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
let backupPath = null;
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
  assert.strictEqual(saved.marker, 'current');
  assert.strictEqual(saved.demoMode, true);
  assert.strictEqual(saved.edgeStatusUrl, 'https://edge-status.example/status');
  assert.strictEqual(saved.edgeStatusKey, 'edge-key-sentinel');
  assert.strictEqual(saved.tripwireUrl, 'https://trip.example/hook');
  assert.deepStrictEqual(saved.allowedPrivateCidrs, ['10.0.0.0/8']);
  assert.strictEqual(saved.cloudflareWorkerName, 'uploaded-worker');
  assert.strictEqual(saved.continuum.morph, 'stealth');
  assert.deepStrictEqual(saved.continuum.plugins, ['keep-plugin.js']);
  assert.strictEqual(saved.continuum.planes.mirageImage, 'alpine:3.19');
  assert.strictEqual(saved.continuum.planes.mirageCore, true);
  assert.strictEqual(saved.continuum.planes.phantomMesh, true);
  assert.strictEqual(saved.continuum.planes.trenchEntryHost, undefined);
  assert.strictEqual(saved.continuum.narrative.worldId, 'uploaded-world');
  assert.strictEqual(saved.narrative.llmEndpoint, 'http://127.0.0.1:11434');
  assert.strictEqual(saved.narrative.llmModel, 'uploaded-model');
  assert.strictEqual(saved.narrative.llmTimeoutMs, 1000);
  assert.strictEqual(saved.notify.discordWebhookUrl, 'https://discord.example/api/webhooks/keep');
  assert.strictEqual(saved.notify.telegramBotToken, 'tg-keep');
  assert.strictEqual(saved.notify.notifyOn.realThreat, true);
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'callbackUrl'));
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'hubBind'));
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'hubHost'));
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'bindHost'));
  assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'listenHost'));
  console.log('  restore copies listed keys and keeps endpoints, plugins, and credentials');

  writeConfig(current);
  const made = createBackup({ includeEvents: false });
  backupPath = made.path;
  assert.strictEqual(made.ok, true);
  const stored = fs.readFileSync(made.path, 'utf8');
  const storedConfig = JSON.parse(JSON.parse(stored).files.config);
  assert.ok(!Object.prototype.hasOwnProperty.call(storedConfig, 'hubToken'));
  assert.ok(!Object.prototype.hasOwnProperty.call(storedConfig, 'edgeStatusKey'));
  assert.ok(!Object.prototype.hasOwnProperty.call(storedConfig.notify, 'discordWebhookUrl'));
  assert.ok(!Object.prototype.hasOwnProperty.call(storedConfig.notify, 'telegramBotToken'));
  assert.ok(!Object.prototype.hasOwnProperty.call(storedConfig.notify, 'genericWebhookUrl'));
  assert.ok(!Object.prototype.hasOwnProperty.call(storedConfig.notify, 'homeAssistantToken'));
  assert.strictEqual(storedConfig.notify.notifyOn.realThreat, true);
  assert.strictEqual(storedConfig.edgeStatusUrl, current.edgeStatusUrl);
  assert.ok(!stored.includes('edge-key-sentinel'));
  assert.ok(!stored.includes('tg-keep'));
  assert.ok(!stored.includes('ha-keep'));
  const roundTrip = restoreBackup({ id: made.id });
  assert.strictEqual(roundTrip.ok, true);
  assert.strictEqual(readConfig().hubToken, 'keep-token');
  assert.strictEqual(readConfig().edgeStatusKey, 'edge-key-sentinel');
  assert.strictEqual(readConfig().notify.discordWebhookUrl, current.notify.discordWebhookUrl);
  console.log('  backup file omits hub, edge, and notify credentials');

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
  assert.strictEqual(viaRoute.marker, 'current');
  assert.strictEqual(viaRoute.narrative.llmEndpoint, 'http://127.0.0.1:11434');
  assert.deepStrictEqual(viaRoute.continuum.plugins, ['keep-plugin.js']);
  assert.strictEqual(viaRoute.continuum.planes.mirageImage, 'alpine:3.19');
  console.log('  restore route returns 400 for invalid input and keeps access settings');

  console.log('backup-restore: OK');
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (backupPath && fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  if (hadConfig) fs.writeFileSync(CONFIG_PATH, originalConfig);
  else if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
}
