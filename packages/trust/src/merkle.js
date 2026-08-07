import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export const LEDGER_DIR = path.join(os.homedir(), '.ghost-continuum', 'ledger');
export const LEDGER_PATH = path.join(LEDGER_DIR, 'chain.jsonl');
export const ROOT_PATH = path.join(LEDGER_DIR, 'root.json');

function hashPair(left, right) {
  return crypto.createHash('sha256').update(`${left}${right}`).digest('hex');
}

function hashLeaf(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function appendLedgerEntry(event, prevRoot = null) {
  fs.mkdirSync(LEDGER_DIR, { recursive: true });

  let prev = prevRoot;
  if (!prev && fs.existsSync(ROOT_PATH)) {
    try {
      prev = JSON.parse(fs.readFileSync(ROOT_PATH, 'utf8')).root;
    } catch {
      prev = null;
    }
  }

  const leaf = hashLeaf(event);
  const root = prev ? hashPair(prev, leaf) : leaf;
  const entry = {
    v: 1,
    ts: Date.now(),
    leaf,
    prev: prev || 'GENESIS',
    root,
    event,
  };

  fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n');
  fs.writeFileSync(
    ROOT_PATH,
    JSON.stringify({ root, updatedAt: new Date().toISOString(), entries: countEntries() }, null, 2) + '\n',
  );

  return entry;
}

export function countEntries() {
  if (!fs.existsSync(LEDGER_PATH)) return 0;
  return fs.readFileSync(LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean).length;
}

export function readLedger(limit = 100) {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  const lines = fs.readFileSync(LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l));
}

export function getLedgerRoot() {
  if (!fs.existsSync(ROOT_PATH)) return { root: null, entries: 0 };
  try {
    return JSON.parse(fs.readFileSync(ROOT_PATH, 'utf8'));
  } catch {
    return { root: null, entries: 0 };
  }
}

export function verifyLedger(maxEntries = 5000) {
  if (!fs.existsSync(LEDGER_PATH)) return { ok: true, entries: 0, root: null };

  const lines = fs.readFileSync(LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean).slice(-maxEntries);
  let expectedRoot = null;

  for (const line of lines) {
    const entry = JSON.parse(line);
    const leaf = hashLeaf(entry.event);
    if (leaf !== entry.leaf) return { ok: false, reason: 'leaf mismatch', entry: entry.ts };
    const root = expectedRoot ? hashPair(expectedRoot, leaf) : leaf;
    if (root !== entry.root) return { ok: false, reason: 'chain break', entry: entry.ts };
    if (entry.prev !== (expectedRoot || 'GENESIS')) return { ok: false, reason: 'prev mismatch', entry: entry.ts };
    expectedRoot = root;
  }

  const stored = getLedgerRoot();
  return {
    ok: !stored.root || stored.root === expectedRoot,
    entries: lines.length,
    root: expectedRoot,
    storedRoot: stored.root,
  };
}