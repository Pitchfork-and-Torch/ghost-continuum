import assert from 'assert';
import http from 'http';
import { startLocalEdgeServer } from '../packages/edge/local-server.js';
import {
  EDGE_MAP_CAP,
  RATE_MAX,
  TRIPWIRE_DETAIL_MAX,
  TRIPWIRE_MAX_BYTES,
  createEdgeState,
  drillHoneypotPath,
  localRateAllow,
  normalizeTripwire,
  noteObserved,
  readBodyLimited,
  recordTripwire,
  resetLocalRates,
} from '../packages/edge/engine.js';
import worker from '../packages/edge/worker.js';

function request(port, method, path, body) {
  const raw = body == null ? null : typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: raw == null ? {} : {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(raw),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch { /* text */ }
          resolve({ status: res.statusCode, body: data, json, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    if (raw != null) req.write(raw);
    req.end();
  });
}

const fields = normalizeTripwire({ t: 'not-a-type', d: 'z'.repeat(400) });
assert.strictEqual(fields.t, 'tripwire');
assert.strictEqual(fields.d.length, TRIPWIRE_DETAIL_MAX);
const kept = normalizeTripwire({ t: 'script-tamper', d: { path: '/tmp' } });
assert.strictEqual(kept.t, 'script-tamper');
assert.ok(kept.d.length <= TRIPWIRE_DETAIL_MAX);
console.log('  tripwire type and detail stay bounded');

const state = createEdgeState('bounds');
const t0 = 10_000_000;
for (let i = 0; i < RATE_MAX; i++) {
  assert.strictEqual(recordTripwire(state, '203.0.113.8', 'sentinel-alive', 'ok', { now: t0 }).allowed, true);
}
assert.strictEqual(recordTripwire(state, '203.0.113.8', 'sentinel-alive', 'ok', { now: t0 }).allowed, false);
assert.strictEqual(recordTripwire(state, '203.0.113.8', 'sentinel-alive', 'ok', { now: t0 + 60_000 }).allowed, true);
for (let i = 0; i < EDGE_MAP_CAP + 10; i++) {
  recordTripwire(state, `198.51.100.${i}`, 'sentinel-alive', 'ok', { now: t0 + 60_000 });
}
assert.ok(state.rates.size <= EDGE_MAP_CAP);
assert.ok(state.scores.size <= EDGE_MAP_CAP);
console.log('  edge rate window resets and the map stays capped');

const rotate = createEdgeState('rotate');
const now = 20_000_000;
recordTripwire(rotate, '203.0.113.9', 'script-tamper', 'x', { now });
recordTripwire(rotate, '203.0.113.9', 'script-tamper', 'x', { now });
assert.strictEqual(rotate.generation, 0, 'a post alone does not rotate paths');
noteObserved(rotate, '203.0.113.9', now);
recordTripwire(rotate, '203.0.113.9', 'script-tamper', 'x', { now });
recordTripwire(rotate, '203.0.113.9', 'script-tamper', 'x', { now });
assert.strictEqual(rotate.generation, 1);
noteObserved(rotate, '203.0.113.9', now);
recordTripwire(rotate, '203.0.113.9', 'script-tamper', 'x', { now });
recordTripwire(rotate, '203.0.113.9', 'script-tamper', 'x', { now });
assert.strictEqual(rotate.generation, 2);
noteObserved(rotate, '203.0.113.9', now);
recordTripwire(rotate, '203.0.113.9', 'script-tamper', 'x', { now });
recordTripwire(rotate, '203.0.113.9', 'script-tamper', 'x', { now });
assert.strictEqual(rotate.generation, 2, 'rotation stays inside the window cap');
console.log('  path rotation needs an observed signal and stays capped');

const edge = await startLocalEdgeServer({ port: 0, siteSeed: 'ghost-continuum-local' });
try {
  let limited = 0;
  for (let i = 0; i < RATE_MAX + 1; i++) {
    const res = await request(edge.port, 'POST', '/.__dm/tripwire', { t: 'sentinel-alive', d: 'ping' });
    if (res.status === 429) limited += 1;
    else assert.strictEqual(res.status, 204);
  }
  assert.strictEqual(limited, 1);
  const before = await request(edge.port, 'GET', '/.__dm/status');
  assert.strictEqual(before.json.generation, 0);

  const trap = drillHoneypotPath('ghost-continuum-local', 0);
  const hit = await request(edge.port, 'GET', trap);
  assert.strictEqual(hit.status, 404);
  assert.strictEqual(hit.headers['x-dm-trap'], '1');
  console.log('  local edge rate limit and trap observation use a real socket');
} finally {
  await new Promise((resolve) => edge.server.close(resolve));
}

const over = await readBodyLimited(new Request('https://edge.test/.__dm/tripwire', {
  method: 'POST',
  body: '😀'.repeat(20000),
}), TRIPWIRE_MAX_BYTES);
assert.strictEqual(over.ok, false);
assert.strictEqual(over.status, 413);
const under = await readBodyLimited(new Request('https://edge.test/.__dm/tripwire', {
  method: 'POST',
  body: '{"t":"sentinel-alive","d":"ok"}',
}), TRIPWIRE_MAX_BYTES);
assert.strictEqual(under.ok, true);
console.log('  tripwire body limit counts bytes');

resetLocalRates();
const env = { SITE_SEED: 'example.test', UPSTREAM: 'example.pages.dev' };
const missing = await worker.fetch(new Request('https://example.test/.__dm/tripwire', {
  method: 'POST',
  body: '{}',
}), env);
assert.strictEqual(missing.status, 429);

resetLocalRates();
const burst = await Promise.all(Array.from({ length: 80 }, () => worker.fetch(new Request('https://example.test/.__dm/tripwire', {
  method: 'POST',
  headers: { 'cf-connecting-ip': '203.0.113.40' },
  body: '{}',
}), env)));
const allowed = burst.filter((res) => res.status !== 429).length;
assert.ok(allowed <= RATE_MAX, `allowed ${allowed}`);
assert.strictEqual(localRateAllow(''), false);
console.log('  missing client address is not a shared bucket');

const observerPuts = [];
let observerRaw = null;
const observerKv = {
  async get(key) {
    return String(key).startsWith('dm:observer:') ? observerRaw : null;
  },
  async put(key, value) {
    observerPuts.push(String(key));
    if (String(key).startsWith('dm:observer:')) observerRaw = value;
  },
};
const trapEnv = { SITE_SEED: 'example.test', UPSTREAM: 'example.pages.dev', DM_KV: observerKv };
const trapPath = drillHoneypotPath('example.test', 0);
const trapHeaders = { 'cf-connecting-ip': '203.0.113.77' };
const firstTrap = await worker.fetch(new Request(`https://example.test${trapPath}`, { headers: trapHeaders }), trapEnv);
const secondTrap = await worker.fetch(new Request(`https://example.test${trapPath}`, { headers: trapHeaders }), trapEnv);
assert.strictEqual(firstTrap.status, 404);
assert.strictEqual(firstTrap.headers.get('X-DM-Trap'), '1');
assert.strictEqual(secondTrap.status, 404);
assert.strictEqual(observerPuts.length, 1, 'a recent address does not write the observer again');
console.log('  repeat trap hits skip another observer write');

const realFetch = globalThis.fetch;
try {
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    seen.push({ url: String(url), redirect: init.redirect });
    const target = String(url);
    if (target.endsWith('/jp')) {
      return new Response('<html><body>moved</body></html>', {
        status: 301,
        headers: {
          Location: '/?lang=ja',
          'Content-Type': 'text/html; charset=utf-8',
          'Strict-Transport-Security': 'max-age=31536000',
          'Content-Security-Policy': "default-src 'self'",
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'Permissions-Policy': 'camera=()',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      });
    }
    if (target.endsWith('/away')) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: 'https://example.pages.dev/next?x=1',
          'Strict-Transport-Security': 'max-age=9',
        },
      });
    }
    if (target.endsWith('/external')) {
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://other.example/out' },
      });
    }
    return new Response('<html><head></head><body>home</body></html>', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Strict-Transport-Security': 'max-age=31536000',
        'Content-Security-Policy': "default-src 'self'",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Permissions-Policy': 'camera=()',
      },
    });
  };
  const redirectEnv = { SITE_SEED: 'example.test', UPSTREAM: 'example.pages.dev' };
  const jp = await worker.fetch(new Request('https://example.test/jp'), redirectEnv);
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].redirect, 'manual');
  assert.strictEqual(jp.status, 301);
  assert.strictEqual(jp.headers.get('Location'), '/?lang=ja');
  assert.strictEqual(jp.headers.get('Strict-Transport-Security'), 'max-age=31536000');
  assert.strictEqual(jp.headers.get('Content-Security-Policy'), "default-src 'self'");
  assert.strictEqual(jp.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.strictEqual(jp.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.strictEqual(jp.headers.get('Permissions-Policy'), 'camera=()');
  const jpBody = await jp.text();
  assert.strictEqual(jpBody, '<html><body>moved</body></html>');
  assert.ok(!jpBody.includes('/.__dm/sentinel.js'));

  const home = await worker.fetch(new Request('https://example.test/'), redirectEnv);
  assert.strictEqual(home.status, 200);
  assert.strictEqual(home.headers.get('Strict-Transport-Security'), 'max-age=31536000');
  assert.strictEqual(home.headers.get('Content-Security-Policy'), "default-src 'self'");
  assert.strictEqual(home.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.strictEqual(home.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.strictEqual(home.headers.get('Permissions-Policy'), 'camera=()');
  const homeBody = await home.text();
  assert.ok(homeBody.includes('/.__dm/sentinel.js'));

  const away = await worker.fetch(new Request('https://example.test/away'), redirectEnv);
  assert.strictEqual(away.status, 302);
  assert.strictEqual(away.headers.get('Location'), '/next?x=1');
  assert.strictEqual(away.headers.get('Strict-Transport-Security'), 'max-age=9');

  const external = await worker.fetch(new Request('https://example.test/external'), redirectEnv);
  assert.strictEqual(external.status, 302);
  assert.strictEqual(external.headers.get('Location'), 'https://other.example/out');
  assert.strictEqual(seen.length, 4);
  console.log('  origin redirects pass through with security headers');
} finally {
  globalThis.fetch = realFetch;
}

console.log('\nEdge bound checks passed.\n');
