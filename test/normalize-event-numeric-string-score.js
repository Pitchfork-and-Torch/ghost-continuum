import assert from 'assert';
import { normalizeEvent, scoreEventType } from '../packages/core/src/events.js';

assert.strictEqual(normalizeEvent({ type: 'x', score: '5' }).score, 5);
assert.strictEqual(normalizeEvent({ type: 'x', score: ' 7 ' }).score, 7);
assert.strictEqual(normalizeEvent({ type: 'x', score: 4 }).score, 4);
assert.strictEqual(normalizeEvent({ type: 'x', score: 0 }).score, 0);
assert.strictEqual(normalizeEvent({ type: 'x', score: '0' }).score, 0);

const blank = normalizeEvent({ type: 'trap-trip', score: '   ' });
assert.strictEqual(blank.score, scoreEventType('trap-trip'));

const bad = normalizeEvent({ type: 'trap-trip', score: 'not-a-number' });
assert.strictEqual(bad.score, scoreEventType('trap-trip'));

const stillInf = normalizeEvent({ type: 'trap-trip', score: Infinity });
assert.strictEqual(stillInf.score, scoreEventType('trap-trip'));

const stillNan = normalizeEvent({ type: 'trap-trip', score: NaN });
assert.strictEqual(stillNan.score, scoreEventType('trap-trip'));

console.log('normalize-event-numeric-string-score: ok');
