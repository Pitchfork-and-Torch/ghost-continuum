import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-vl-max-'));
process.env.HOME = tmp;

const { appendLedgerEntry, verifyLedger, resetLedgerCountCache, LEDGER_PATH, LEDGER_DIR } =
  await import('../packages/trust/src/merkle.js');

resetLedgerCountCache();
fs.mkdirSync(LEDGER_DIR, { recursive: true });
if (fs.existsSync(LEDGER_PATH)) fs.unlinkSync(LEDGER_PATH);

appendLedgerEntry({ type: 'a', ts: 1 });
appendLedgerEntry({ type: 'b', ts: 2 });
appendLedgerEntry({ type: 'c', ts: 3 });

const full = verifyLedger(100);
assert.strictEqual(full.ok, true, 'positive window verifies');
assert.strictEqual(full.entries, 3);

const zero = verifyLedger(0);
assert.strictEqual(zero.entries, 0, 'maxEntries 0 must be empty window (not all via slice(-0))');
assert.strictEqual(zero.ok, true);

const neg = verifyLedger(-1);
assert.strictEqual(neg.entries, 0, 'negative maxEntries must be empty');

const nan = verifyLedger(NaN);
assert.strictEqual(nan.entries, 0, 'NaN maxEntries must be empty');

const two = verifyLedger(2);
assert.strictEqual(two.entries, 2, 'positive maxEntries still windows');
assert.strictEqual(two.windowed, true);

console.log('ok: verifyLedger honors non-positive maxEntries');
