import assert from 'assert';
import { normalizeEvent } from '../packages/core/src/events.js';

assert.strictEqual(normalizeEvent({ type: 'x', ts: '1700000000000' }).ts, 1700000000000);
assert.strictEqual(normalizeEvent({ type: 'x', ts: ' 1700000000001 ' }).ts, 1700000000001);
assert.strictEqual(normalizeEvent({ type: 'x', ts: 1700000000002 }).ts, 1700000000002);
assert.strictEqual(normalizeEvent({ type: 'x', ts: 0 }).ts, 0);

const before = Date.now();
const blank = normalizeEvent({ type: 'x', ts: '   ' });
assert.ok(Number.isFinite(blank.ts));
assert.ok(blank.ts >= before);

const bad = normalizeEvent({ type: 'x', ts: 'not-a-number' });
assert.ok(Number.isFinite(bad.ts));
assert.ok(bad.ts >= before);

const stillInf = normalizeEvent({ type: 'x', ts: Infinity });
assert.ok(Number.isFinite(stillInf.ts));
assert.notStrictEqual(stillInf.ts, Infinity);

console.log('normalize-event-numeric-string-ts: ok');
