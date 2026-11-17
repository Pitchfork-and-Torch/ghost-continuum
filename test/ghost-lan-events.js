/**
 * A torn event line is skipped. The lines around it stay readable.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { LOG_PATH, readRecentEvents } from '../packages/ghost-lan/src/state.js';

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
fs.writeFileSync(
  LOG_PATH,
  '{"type":"ok","ts":1}\n{torn\n{"type":"next","ts":2}\n[]\n1\n',
);
assert.deepStrictEqual(
  readRecentEvents(10).map((e) => e.type),
  ['next', 'ok'],
);
console.log('ghost-lan events: OK');
