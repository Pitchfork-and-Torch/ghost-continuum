/**
 * Honeypot connection counts use a time window and a capped map.
 */
import assert from 'assert';
import { allowIpHit } from '../packages/ghost-lan/src/ip-hits.js';

const map = new Map();
const t0 = 1_000_000;
for (let i = 0; i < 30; i++) {
  assert.strictEqual(allowIpHit(map, '10.0.0.8', { now: t0 + i, max: 30, windowMs: 60_000 }), true);
}
assert.strictEqual(allowIpHit(map, '10.0.0.8', { now: t0 + 31, max: 30, windowMs: 60_000 }), false);
assert.strictEqual(
  allowIpHit(map, '10.0.0.8', { now: t0 + 60_000, max: 30, windowMs: 60_000 }),
  true,
  'a new window starts the count over',
);

const capped = new Map();
for (let i = 0; i < 5; i++) {
  allowIpHit(capped, `ip-${i}`, { now: t0 + i, max: 30, cap: 3 });
}
assert.strictEqual(capped.size, 3);
assert.ok(capped.has('ip-4'));
assert.ok(!capped.has('ip-0'));
assert.ok(!capped.has('ip-1'));
console.log('ghost-lan hits: OK');
