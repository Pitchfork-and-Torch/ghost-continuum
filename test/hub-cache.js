import assert from 'assert';
import { cached, invalidate } from '../packages/hub-api/src/cache.js';

let calls = 0;
const started = process.hrtime.bigint();
const first = cached('status', 5_000, async () => {
  calls += 1;
  await new Promise((r) => setTimeout(r, 40));
  return 7;
});
const second = cached('status', 5_000, async () => {
  calls += 1;
  return 9;
});
const [a, b] = await Promise.all([first, second]);
const coldMs = Number(process.hrtime.bigint() - started) / 1e6;
assert.strictEqual(a, 7);
assert.strictEqual(b, 7);
assert.strictEqual(calls, 1, 'parallel misses share one in-flight call');

const warmStart = process.hrtime.bigint();
const c = await cached('status', 5_000, async () => {
  calls += 1;
  return 3;
});
const warmMs = Number(process.hrtime.bigint() - warmStart) / 1e6;
assert.strictEqual(c, 7);
assert.strictEqual(calls, 1, 'a warm key does not call fn again');
assert.ok(warmMs < coldMs, `warm ${warmMs.toFixed(2)} ms should beat cold ${coldMs.toFixed(2)} ms`);

invalidate('status');
const d = await cached('status', 5_000, async () => {
  calls += 1;
  return 4;
});
assert.strictEqual(d, 4);
assert.strictEqual(calls, 2, 'invalidate drops the cached value');

let failed = 0;
await assert.rejects(
  cached('boom', 5_000, async () => {
    failed += 1;
    throw new Error('nope');
  }),
);
const recovered = await cached('boom', 5_000, async () => {
  failed += 1;
  return 'ok';
});
assert.strictEqual(recovered, 'ok');
assert.strictEqual(failed, 2, 'a rejected call must not stick in the cache');

console.log('  hub-cache coalesce', {
  coldMs: Number(coldMs.toFixed(2)),
  warmMs: Number(warmMs.toFixed(2)),
});
console.log('hub-cache: OK');
