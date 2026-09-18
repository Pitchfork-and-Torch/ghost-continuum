import assert from 'assert';
import fs from 'fs';
import { EVENTS_PATH, GC_DIR } from '../packages/core/src/config.js';
import { readEvents } from '../packages/core/src/events.js';

fs.mkdirSync(GC_DIR, { recursive: true });
const had = fs.existsSync(EVENTS_PATH);
const backup = had ? fs.readFileSync(EVENTS_PATH) : null;

try {
  fs.writeFileSync(
    EVENTS_PATH,
    [
      JSON.stringify({ id: '1', type: 'a', ts: 1 }),
      JSON.stringify({ id: '2', type: 'b', ts: 2 }),
      JSON.stringify({ id: '3', type: 'c', ts: 3 }),
    ].join('\n') + '\n',
  );

  assert.strictEqual(readEvents(100).length, 3, 'positive limit returns events');
  assert.deepStrictEqual(readEvents(0), [], 'limit 0 must be empty (not all via slice(-0))');
  assert.deepStrictEqual(readEvents(-1), [], 'negative limit must be empty');
  assert.deepStrictEqual(readEvents(NaN), [], 'NaN limit must be empty');
  assert.strictEqual(readEvents(2).length, 2, 'positive limit still works');
  assert.strictEqual(readEvents(2)[0].id, '3');
} finally {
  if (backup !== null) fs.writeFileSync(EVENTS_PATH, backup);
  else if (fs.existsSync(EVENTS_PATH)) fs.unlinkSync(EVENTS_PATH);
}

console.log('read-events-limit: ok');
