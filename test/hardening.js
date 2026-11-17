import assert from 'assert';
import { EventEmitter } from 'events';
import http from 'http';
import { rateLimit, resetRateLimits, clientIp, readBody } from '../packages/hub-api/src/safe.js';
import { startHub } from '../packages/hub-api/src/server.js';
import { enrichConfig } from '../packages/core/src/config.js';
import { appendLedgerEntry, verifyLedger, getLedgerRoot, countEntries } from '../packages/trust/src/index.js';

// --- Write-side rate limiter -------------------------------------------------
resetRateLimits();
const req = (ip) => ({ headers: {}, socket: { remoteAddress: ip } });
const t0 = 1_000_000;

for (let i = 0; i < 5; i++) {
  const r = rateLimit(req('9.9.9.9'), { windowMs: 1000, max: 5, now: t0 });
  assert.ok(r.ok, `request ${i + 1} should be within limit`);
}
const blocked = rateLimit(req('9.9.9.9'), { windowMs: 1000, max: 5, now: t0 });
assert.ok(!blocked.ok, 'request over the limit should be blocked');
assert.ok(blocked.retryAfterMs > 0, 'blocked response should advise retry delay');
console.log('  ✓ rate limit blocks a flood past max');

assert.ok(rateLimit(req('8.8.8.8'), { windowMs: 1000, max: 5, now: t0 }).ok, 'other IPs unaffected');
console.log('  ✓ rate limit is per-IP');

assert.ok(rateLimit(req('9.9.9.9'), { windowMs: 1000, max: 5, now: t0 + 1001 }).ok, 'window resets');
console.log('  ✓ rate limit window resets over time');

resetRateLimits();
const capNow = 7_000_000;
for (let i = 0; i < 5; i++) {
  assert.ok(rateLimit(req('1.2.3.4'), { windowMs: 60_000, max: 5, now: capNow }).ok);
}
assert.ok(!rateLimit(req('1.2.3.4'), { windowMs: 60_000, max: 5, now: capNow }).ok, 'first ip is limited');
for (let i = 0; i < 10000; i++) {
  rateLimit(req('cap-' + i), { windowMs: 60_000, max: 5, now: capNow });
}
assert.ok(
  rateLimit(req('1.2.3.4'), { windowMs: 60_000, max: 5, now: capNow }).ok,
  'full map evicts the oldest bucket instead of growing without a cap',
);
resetRateLimits();
console.log('  ✓ rate limit bucket map stays capped');

assert.strictEqual(
  clientIp({
    headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    socket: { remoteAddress: '198.51.100.8' },
  }),
  '198.51.100.8',
  'clientIp ignores x-forwarded-for from a non-loopback peer',
);
assert.strictEqual(
  clientIp({
    headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  }),
  '203.0.113.5',
  'clientIp honours x-forwarded-for only from loopback',
);
assert.ok(rateLimit(req('9.9.9.9'), { max: 0 }).ok, 'max<=0 disables limiting');
console.log('  ✓ clientIp + disable path');

function bodyReq(chunks, { destroyError = false } = {}) {
  const fake = new EventEmitter();
  fake.destroy = () => {
    fake.destroyed = true;
    if (destroyError) fake.emit('error', new Error('socket hang up'));
  };
  queueMicrotask(() => {
    for (const chunk of chunks) fake.emit('data', chunk);
    if (!fake.destroyed) fake.emit('end');
  });
  return fake;
}

assert.deepStrictEqual(await readBody(bodyReq([])), {}, 'empty body is {}');
assert.deepStrictEqual(await readBody(bodyReq([Buffer.from('{"ok":true}')])), { ok: true });
await assert.rejects(readBody(bodyReq([Buffer.from('{')])), /invalid JSON/);
await assert.rejects(readBody(bodyReq([Buffer.from('null')])), /invalid JSON/);
await assert.rejects(readBody(bodyReq([Buffer.from('[1]')])), /invalid JSON/);
await assert.rejects(
  readBody(bodyReq([Buffer.alloc(1024 * 1024 + 1)], { destroyError: true })),
  /payload too large/,
);
console.log('  ✓ readBody rejects bad JSON once and keeps objects');

function postRaw(port, raw) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/scope/probe',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(raw),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let body = data;
          try { body = JSON.parse(data); } catch { /* keep text */ }
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('hub request timed out'));
    });
    req.write(raw);
    req.end();
  });
}

const hub = await startHub(enrichConfig({
  primaryDomain: 'example.com',
  demoMode: true,
  useBuiltinValidator: true,
  hubPort: 0,
  hubWatchIntervalMs: 0,
}));
try {
  assert.ok(hub.port > 0 && hub.port !== 30119, 'hub test binds an ephemeral port');
  const bad = await postRaw(hub.port, '{');
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.error, 'invalid JSON');
  const nil = await postRaw(hub.port, 'null');
  assert.strictEqual(nil.status, 400);
  assert.strictEqual(nil.body.error, 'invalid JSON');
  const ok = await postRaw(hub.port, '{"probeId":"lan-self-scan"}');
  assert.notStrictEqual(ok.status, 500, 'valid JSON should not become an internal error');
  assert.notStrictEqual(ok.body && ok.body.error, 'invalid JSON');
  assert.ok(ok.body && typeof ok.body === 'object');
  console.log('  ✓ hub answers 400 for a bad JSON body');
} finally {
  await new Promise((resolve) => hub.server.close(resolve));
}

// --- Merkle ledger: incremental counter + windowed verify --------------------
const n0 = countEntries();
appendLedgerEntry({ type: 'hardening-test', plane: 'hub', score: 1 });
assert.strictEqual(countEntries(), n0 + 1, 'ledger file grows by exactly one entry');
assert.strictEqual(getLedgerRoot().entries, n0 + 1, 'persisted entry count tracks the file O(1)');
console.log('  ✓ ledger entry counter is incremental and accurate');

const v = verifyLedger();
assert.ok(v.ok, 'ledger verifies (including windowed long chains)');
console.log('  ✓ ledger verification passes', { entries: v.entries, windowed: !!v.windowed });

console.log('\nHardening checks passed.\n');
