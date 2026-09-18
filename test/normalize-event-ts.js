import assert from 'assert';
import { normalizeEvent } from '../packages/core/src/events.js';

const before = Date.now();
const fromMissing = normalizeEvent({ type: 'x' });
assert.ok(Number.isFinite(fromMissing.ts));
assert.ok(fromMissing.ts >= before);

assert.strictEqual(normalizeEvent({ type: 'x', ts: 0 }).ts, 0);
assert.strictEqual(normalizeEvent({ type: 'x', ts: 1700000000000 }).ts, 1700000000000);

const fromNaN = normalizeEvent({ type: 'x', ts: NaN });
assert.ok(Number.isFinite(fromNaN.ts));
assert.ok(fromNaN.ts >= before);

const fromInf = normalizeEvent({ type: 'x', ts: Infinity });
assert.ok(Number.isFinite(fromInf.ts));
assert.notStrictEqual(fromInf.ts, Infinity);

const fromNegInf = normalizeEvent({ type: 'x', ts: -Infinity });
assert.ok(Number.isFinite(fromNegInf.ts));
assert.notStrictEqual(fromNegInf.ts, -Infinity);

console.log('normalize-event-ts: ok');
