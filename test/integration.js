import assert from 'assert';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { startHub } from '../packages/hub-api/src/server.js';
import { enrichConfig } from '../packages/core/src/config.js';
import { invalidatePrefix } from '../packages/hub-api/src/cache.js';

const config = enrichConfig({
  primaryDomain: 'example.com',
  demoMode: true,
  useBuiltinValidator: true,
  hubPort: 30100,
  hubWatchIntervalMs: 0,
});

const { server, port } = await startHub(config);

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }));
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
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
  assert.strictEqual(home.status, 200);
  assert.ok(home.body.includes('Ghost Continuum'));
  assert.strictEqual(home.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(home.headers['x-frame-options'], 'DENY');
  assert.strictEqual(home.headers['content-security-policy'], "frame-ancestors 'none'");
  assert.strictEqual(home.headers['referrer-policy'], 'no-referrer');
  assert.strictEqual(home.headers['cross-origin-resource-policy'], 'same-origin');

  const status = await get('/api/status');
  assert.strictEqual(status.status, 200);
  assert.strictEqual(status.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(status.headers['x-frame-options'], 'DENY');
  assert.strictEqual(status.headers['content-security-policy'], "frame-ancestors 'none'");
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
  assert.ok(snapshot.body.replayUrl);

  const exported = await post('/api/incident/export', { label: 'test-export' });
  assert.strictEqual(exported.status, 200);
  assert.ok(/^[a-f0-9]{64}$/.test(exported.body.manifestHash));
  const verified = await get(exported.body.replayUrl.replace('/replay/', '/verify/'));
  assert.strictEqual(verified.body.ok, true);

  const rebound = await new Promise((resolve, reject) => {
    http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/status',
        headers: { Host: 'evil.example' },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      },
    ).on('error', reject);
  });
  assert.strictEqual(rebound.status, 421);
  assert.strictEqual(rebound.body.error, 'host not allowed');

  const csrf = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({ label: 'csrf' });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/incident/snapshot',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Origin: 'https://evil.example',
        },
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
  assert.strictEqual(csrf.status, 403);
  assert.strictEqual(csrf.body.error, 'origin not allowed');

  const watchCsrf = await new Promise((resolve, reject) => {
    http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/threat/watch',
        headers: { Origin: 'https://evil.example' },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      },
    ).on('error', reject);
  });
  assert.strictEqual(watchCsrf.status, 200);
  assert.ok(watchCsrf.body.ok);
  assert.ok(['CLEAR', 'ELEVATED', 'REAL_THREAT'].includes(watchCsrf.body.verdict));

  const fileMtime = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0);
  const cfgPath = path.join(os.homedir(), '.ghost-continuum', 'config.json');
  const notifyPath = path.join(os.homedir(), '.ghost-continuum', 'notifications.json');
  const cfgBefore = fileMtime(cfgPath);
  const notifyBefore = fileMtime(notifyPath);
  const watchGet = await get('/api/threat/watch');
  assert.strictEqual(watchGet.status, 200);
  assert.ok(watchGet.body.ok);
  assert.strictEqual(fileMtime(cfgPath), cfgBefore, 'GET /api/threat/watch must not write config');
  assert.strictEqual(fileMtime(notifyPath), notifyBefore, 'GET /api/threat/watch must not write notifications');

  const locked = enrichConfig({
    primaryDomain: 'example.com',
    demoMode: true,
    useBuiltinValidator: true,
    hubPort: 30101,
    hubToken: 'secret',
    hubAllowedHosts: ['ghost.jonbailey.xyz'],
    hubWatchIntervalMs: 0,
  });
  const lockedHub = await startHub(locked);
  try {
    const raw = (opts) =>
      new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: lockedHub.port,
            path: opts.path,
            method: opts.method || 'GET',
            headers: opts.headers || {},
          },
          (res) => {
            let data = '';
            res.on('data', (c) => {
              data += c;
            });
            res.on('end', () => {
              let body = data;
              try {
                body = JSON.parse(data);
              } catch {
                /* html */
              }
              resolve({ status: res.statusCode, body, headers: res.headers });
            });
          },
        );
        req.on('error', reject);
        if (opts.body) req.write(opts.body);
        req.end();
      });

    const openGet = await raw({ path: '/api/status', headers: { Host: '127.0.0.1:30101' } });
    assert.strictEqual(openGet.status, 401);

    const authedGet = await raw({
      path: '/api/status',
      headers: { Host: '127.0.0.1:30101', Authorization: 'Bearer secret' },
    });
    assert.strictEqual(authedGet.status, 200);
    assert.ok(authedGet.body.ok);

    const cookieGet = await raw({
      path: '/api/status',
      headers: { Host: '127.0.0.1:30101', Cookie: 'gc-hub-token=secret' },
    });
    assert.strictEqual(cookieGet.status, 200);

    const tunnelNoToken = await raw({
      path: '/api/status',
      headers: { Host: 'ghost.jonbailey.xyz' },
    });
    assert.strictEqual(tunnelNoToken.status, 401);

    const tunnelAuthed = await raw({
      path: '/api/status',
      headers: { Host: 'ghost.jonbailey.xyz', Authorization: 'Bearer secret' },
    });
    assert.strictEqual(tunnelAuthed.status, 200);

    const loopHtml = await raw({ path: '/', headers: { Host: '127.0.0.1:30101' } });
    assert.strictEqual(loopHtml.status, 200);
    assert.ok(String(loopHtml.body).includes('Ghost Continuum'));
    assert.ok(!String(loopHtml.body).includes('__GC_HUB_TOKEN'));
    assert.ok(String(loopHtml.headers['set-cookie'] || '').includes('gc-hub-token='));
    assert.ok(String(loopHtml.headers['set-cookie'] || '').includes('HttpOnly'));

    const tunnelHtml = await raw({ path: '/', headers: { Host: 'ghost.jonbailey.xyz' } });
    assert.strictEqual(tunnelHtml.status, 200);
    assert.ok(!String(tunnelHtml.body).includes('__GC_HUB_TOKEN'));
    assert.ok(!String(tunnelHtml.headers['set-cookie'] || '').includes('gc-hub-token='));
  } finally {
    lockedHub.server.close();
  }

  const tunnelOnly = await startHub(
    enrichConfig({
      primaryDomain: 'example.com',
      demoMode: true,
      useBuiltinValidator: true,
      hubPort: 30102,
      hubAllowedHosts: ['ghost.jonbailey.xyz'],
      hubWatchIntervalMs: 0,
    }),
  );
  try {
    const denied = await new Promise((resolve, reject) => {
      http.get(
        {
          hostname: '127.0.0.1',
          port: tunnelOnly.port,
          path: '/api/status',
          headers: { Host: 'ghost.jonbailey.xyz' },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => {
            data += c;
          });
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        },
      ).on('error', reject);
    });
    assert.strictEqual(denied.status, 401);
  } finally {
    tunnelOnly.server.close();
  }

  console.log('ghost-continuum integration: OK');
} finally {
  server.close();
}