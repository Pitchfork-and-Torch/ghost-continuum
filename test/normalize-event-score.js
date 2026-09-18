import assert from 'assert';
import { normalizeEvent, scoreEventType } from '../packages/core/src/events.js';

const fromType = scoreEventType('trap-trip');
assert.strictEqual(normalizeEvent({ type: 'trap-trip', score: NaN }).score, fromType);
assert.strictEqual(normalizeEvent({ type: 'trap-trip', score: Infinity }).score, fromType);
assert.strictEqual(normalizeEvent({ type: 'trap-trip', score: -Infinity }).score, fromType);
assert.strictEqual(normalizeEvent({ type: 'x', score: 4 }).score, 4);
assert.strictEqual(normalizeEvent({ type: 'x', score: 0 }).score, 0);
assert.strictEqual(normalizeEvent({ type: 'x', score: '5' }).score, 5);
console.log('normalize-event-score: ok');
