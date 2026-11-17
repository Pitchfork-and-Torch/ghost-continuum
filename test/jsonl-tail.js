import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { appendJsonlLine, readJsonlTail, resetJsonlTailStats, jsonlTailStats } from '../packages/core/src/jsonl-tail.js';
import { EVENTS_PATH } from '../packages/core/src/config.js';
import { appendEvent, parseEventJsonl, readEvents, readEventsFromFile } from '../packages/core/src/events.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-jsonl-'));

function naiveLines(file, limit) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).slice(-limit);
}

function writeLines(name, lines, { trailingNewline = true } = {}) {
  const file = path.join(dir, name);
  const text = lines.join('\n') + (trailingNewline ? '\n' : '');
  fs.writeFileSync(file, text);
  return file;
}

const mixed = [];
for (let i = 0; i < 400; i++) {
  if (i % 17 === 0) mixed.push('');
  else if (i % 29 === 0) mixed.push('{torn');
  else mixed.push(JSON.stringify({ id: i, note: i % 5 === 0 ? 'cafe\u0301' : 'ok' }));
}

const cases = [
  { name: 'empty', lines: [], limit: 10 },
  { name: 'one', lines: ['{"id":1}'], limit: 10 },
  { name: 'no-nl', lines: ['{"id":1}', '{"id":2}'], limit: 10, trailingNewline: false },
  { name: 'mixed', lines: mixed, limit: 25 },
  { name: 'limit-1', lines: mixed, limit: 1 },
  { name: 'over', lines: ['{"id":1}', '{"id":2}'], limit: 50 },
];

for (const chunkSize of [7, 64, 4096]) {
  for (const item of cases) {
    const file = writeLines(`${item.name}-${chunkSize}.jsonl`, item.lines, item);
    const got = readJsonlTail(file, item.limit, { chunkSize });
    const want = naiveLines(file, item.limit);
    assert.deepStrictEqual(got.lines, want, `${item.name} chunk ${chunkSize}`);
    if (item.lines.filter(Boolean).length > item.limit) {
      assert.ok(got.truncated, `${item.name} should be a tail`);
      assert.ok(got.bytesRead < got.fileSize, `${item.name} should not read the whole file`);
    }
  }
}

const big = [];
for (let i = 0; i < 8000; i++) big.push(JSON.stringify({ id: i, pad: 'x'.repeat(80) }));
const bigFile = writeLines('big.jsonl', big);
const t0 = process.hrtime.bigint();
const full = fs.readFileSync(bigFile);
const fullMs = Number(process.hrtime.bigint() - t0) / 1e6;
const t1 = process.hrtime.bigint();
const tail = readJsonlTail(bigFile, 100);
const tailMs = Number(process.hrtime.bigint() - t1) / 1e6;
assert.deepStrictEqual(tail.lines, naiveLines(bigFile, 100));
assert.ok(tail.bytesRead < tail.fileSize / 10, 'tail window stays well under the file');
console.log('  jsonl tail vs full read', {
  fileBytes: tail.fileSize,
  tailBytes: tail.bytesRead,
  fullMs: Number(fullMs.toFixed(2)),
  tailMs: Number(tailMs.toFixed(2)),
  ignored: full.length,
});

const giant = path.join(dir, 'giant.jsonl');
fs.writeFileSync(giant, `${'A'.repeat(5000)}\n${JSON.stringify({ id: 'keep' })}\n`);
const kept = readJsonlTail(giant, 1, { maxBytes: 200, chunkSize: 64 });
assert.deepStrictEqual(kept.lines, [JSON.stringify({ id: 'keep' })]);
assert.ok(kept.bytesRead <= 200);
assert.ok(kept.bytesRead < kept.fileSize);

const eventsFile = writeLines('events.jsonl', [
  JSON.stringify({ id: 'a', type: 'ok' }),
  '{torn',
  'null',
  JSON.stringify({ id: 'b', type: 'also' }),
  JSON.stringify({ id: 'c', type: 'new' }),
]);
const fromFile = readEventsFromFile(eventsFile, 10);
assert.deepStrictEqual(
  fromFile.map((e) => e.id),
  parseEventJsonl(fs.readFileSync(eventsFile, 'utf8'), 10).map((e) => e.id),
);
const narrow = readEventsFromFile(eventsFile, 2);
assert.deepStrictEqual(narrow.map((e) => e.id), ['c', 'b'], 'smaller limit must not backfill past torn lines');

const memoFile = writeLines('memo.jsonl', [
  JSON.stringify({ id: 'm1' }),
  JSON.stringify({ id: 'm2' }),
  JSON.stringify({ id: 'm3' }),
]);
resetJsonlTailStats();
assert.deepStrictEqual(readEventsFromFile(memoFile, 10).map((e) => e.id), ['m3', 'm2', 'm1']);
assert.strictEqual(jsonlTailStats().reads, 1, 'cold read tails the file once');
assert.deepStrictEqual(readEventsFromFile(memoFile, 2).map((e) => e.id), ['m3', 'm2']);
assert.strictEqual(jsonlTailStats().reads, 1, 'repeat read uses the memo, not another tail read');

const sameFirst = JSON.stringify({ id: 'old', pad: 'aaaa' });
const sameNext = JSON.stringify({ id: 'new', pad: 'bbbb' });
assert.strictEqual(Buffer.byteLength(sameFirst), Buffer.byteLength(sameNext));
const sameSize = writeLines('same-size.jsonl', [sameFirst]);
assert.deepStrictEqual(readEventsFromFile(sameSize, 5).map((e) => e.id), ['old']);
fs.writeFileSync(sameSize, `${sameNext}\n`);
assert.strictEqual(fs.statSync(sameSize).size, Buffer.byteLength(`${sameFirst}\n`));
const later = new Date(fs.statSync(sameSize).mtimeMs + 5000);
fs.utimesSync(sameSize, later, later);
assert.deepStrictEqual(readEventsFromFile(sameSize, 5).map((e) => e.id), ['new']);

const rot = path.join(dir, 'rot.jsonl');
const line1 = JSON.stringify({ id: 1, pad: 'a'.repeat(80) });
const line2 = JSON.stringify({ id: 2, pad: 'b'.repeat(80) });
appendJsonlLine(rot, line1, { maxBytes: 40 });
const second = appendJsonlLine(rot, line2, { maxBytes: 40 });
assert.strictEqual(second.rotated, true);
assert.ok(fs.existsSync(`${rot}.1`));
assert.deepStrictEqual(readJsonlTail(rot, 2).lines, [line1, line2]);
assert.deepStrictEqual(readJsonlTail(rot, 1).lines, [line2]);
console.log('  rotation boundary keeps the previous line');

process.env.DM_NO_LEDGER = '1';
process.env.GC_JSONL_ROTATE_BYTES = '120';
appendEvent({ type: 'note', detail: { id: 'one', pad: 'a'.repeat(80) } });
appendEvent({ type: 'note', detail: { id: 'two', pad: 'b'.repeat(80) } });
assert.ok(fs.existsSync(`${EVENTS_PATH}.1`));
assert.deepStrictEqual(readEvents(10).map((e) => e.detail.id), ['two', 'one']);
console.log('  event log rotation stays readable');

fs.rmSync(dir, { recursive: true, force: true });
console.log('jsonl tail: OK');
