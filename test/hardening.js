import assert from 'assert';
import { rateLimit, resetRateLimits, clientIp } from '../packages/hub-api/src/safe.js';
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
