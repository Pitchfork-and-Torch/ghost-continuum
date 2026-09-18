import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LEDGER_DIR, LEDGER_PATH, resetLedgerCountCache, appendLedgerEntry, readLedger } from '../packages/trust/src/merkle.js';

fs.mkdirSync(LEDGER_DIR, { recursive: true });
const hadLedger = fs.existsSync(LEDGER_PATH);
const backupLedger = hadLedger ? fs.readFileSync(LEDGER_PATH) : null;
const rootPath = path.join(LEDGER_DIR, 'root.json');
const hadRoot = fs.existsSync(rootPath);
const backupRoot = hadRoot ? fs.readFileSync(rootPath) : null;

try {
  resetLedgerCountCache();
  if (fs.existsSync(LEDGER_PATH)) fs.unlinkSync(LEDGER_PATH);
  if (fs.existsSync(rootPath)) fs.unlinkSync(rootPath);

  appendLedgerEntry({ id: '1', type: 'a', ts: 1 });
  appendLedgerEntry({ id: '2', type: 'b', ts: 2 });
  appendLedgerEntry({ id: '3', type: 'c', ts: 3 });

  assert.strictEqual(readLedger(100).length, 3, 'positive limit returns entries');
  assert.deepStrictEqual(readLedger(0), [], 'limit 0 must be empty (not all via slice(-0))');
  assert.deepStrictEqual(readLedger(-1), [], 'negative limit must be empty');
  assert.deepStrictEqual(readLedger(NaN), [], 'NaN limit must be empty');
  assert.strictEqual(readLedger(2).length, 2, 'positive limit still works');
} finally {
  resetLedgerCountCache();
  if (backupLedger !== null) fs.writeFileSync(LEDGER_PATH, backupLedger);
  else if (fs.existsSync(LEDGER_PATH)) fs.unlinkSync(LEDGER_PATH);
  if (backupRoot !== null) fs.writeFileSync(rootPath, backupRoot);
  else if (fs.existsSync(rootPath)) fs.unlinkSync(rootPath);
}

console.log('read-ledger-limit: ok');
