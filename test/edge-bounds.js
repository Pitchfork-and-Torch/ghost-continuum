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

console.log('\nEdge bound checks passed.\n');
