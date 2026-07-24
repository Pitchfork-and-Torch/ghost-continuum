import assert from 'assert';
import http from 'http';
import { startHub } from '../packages/hub-api/src/server.js';
import { enrichConfig } from '../packages/core/src/config.js';
import { invalidatePrefix } from '../packages/hub-api/src/cache.js';

const config = enrichConfig({
  primaryDomain: 'example.com',
  demoMode: true,
  useBuiltinValidator: true,
  hubPort: 30100,
});

const { server, port } = await startHub(config);

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
  });
}

function post(path, body = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

try {
  const home = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
  assert.strictEqual(home.status, 200);
  assert.ok(home.body.includes('Ghost Continuum'));

  const status = await get('/api/status');
  assert.strictEqual(status.status, 200);
  assert.ok(status.body.ok);
  assert.ok(status.body.polymorph?.ok);
  assert.ok(Array.isArray(status.body.feed));
  assert.ok(status.body.demo === true);

  const legal = await get('/api/legal');
  assert.ok(legal.body.text.includes('Authorized Use'));

  invalidatePrefix('status');
  const probe = await post('/api/scope/probe', { probeId: 'lan-self-scan' });
  assert.ok(probe.body.ok === false || probe.body.mode === 'builtin');

  const snapshot = await post('/api/incident/snapshot', { label: 'test' });
  assert.strictEqual(snapshot.status, 200);
  assert.ok(snapshot.body.manifest?.manifestHash);

  console.log('ghost-continuum integration: OK');
} finally {
  server.close();
}