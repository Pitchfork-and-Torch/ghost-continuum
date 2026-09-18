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

// In-memory entry counter. The ledger is append-only, so we count the file once
// (lazily, on first append in this process) and then track the total incrementally.
// This keeps appendLedgerEntry O(1) instead of re-reading the whole chain on every
// event - critical for the write-heavy campaign/threat paths where the chain grows
// without bound.
let cachedCount = null;

function ensureCount() {
  if (cachedCount === null) cachedCount = countEntries();
  return cachedCount;
}

/**
 * Reset the cached counter so the next append re-derives it from disk.
 * Exposed for tests and callers that mutate the ledger file out-of-band.
 */
export function resetLedgerCountCache() {
  cachedCount = null;
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

  const entries = ensureCount() + 1;
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n');
  cachedCount = entries;
  fs.writeFileSync(
    ROOT_PATH,
    JSON.stringify({ root, updatedAt: new Date().toISOString(), entries }, null, 2) + '\n',
  );

  return entry;
}

export function countEntries() {
  if (!fs.existsSync(LEDGER_PATH)) return 0;
  return fs.readFileSync(LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean).length;
}

export function readLedger(limit = 100) {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  // Array#slice(-0) === slice(0) and returns the whole chain. Callers that
  // pass limit=0 (or NaN / negative) must get an empty window, not everything.
  // Distinct from readEvents: same trap lived here on the ledger path.
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return [];
  const lines = fs.readFileSync(LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-Math.floor(n)).map((l) => JSON.parse(l));
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

  const allLines = fs.readFileSync(LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean);
  // Array#slice(-0) === slice(0) and returns the whole chain. Callers that
  // pass maxEntries=0 (or NaN / negative) must get an empty verify window,
  // not a full-chain verify. Distinct from readLedger/readEvents display limits.
  const n = Number(maxEntries);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: true, entries: 0, root: null, windowed: allLines.length > 0 };
  }
  const lines = allLines.slice(-Math.floor(n));
  const windowed = lines.length < allLines.length;
  let expectedRoot = null;

  for (let i = 0; i < lines.length; i++) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      // Corrupt / truncated chain.jsonl must not throw out of verify  -  sealed
      // forensics and hub health checks expect { ok:false }, not an exception.
      // Distinct from readLedger display skip: verify reports the break.
      return { ok: false, reason: 'corrupt json', index: i, entries: lines.length };
    }
    if (!entry || typeof entry !== 'object') {
      return { ok: false, reason: 'corrupt json', index: i, entries: lines.length };
    }
    const leaf = hashLeaf(entry.event);
    if (leaf !== entry.leaf) return { ok: false, reason: 'leaf mismatch', entry: entry.ts };
    // A windowed verify starts mid-chain, so we cannot recompute from GENESIS.
    // Trust the first entry's recorded prev as the window anchor; we still verify the
    // window is internally consistent and (below) that it terminates at the stored root.
    if (i === 0 && windowed && entry.prev !== 'GENESIS') {
      expectedRoot = entry.prev;
    }
    const root = expectedRoot ? hashPair(expectedRoot, leaf) : leaf;
    if (root !== entry.root) return { ok: false, reason: 'chain break', entry: entry.ts };
    if (entry.prev !== (expectedRoot || 'GENESIS')) return { ok: false, reason: 'prev mismatch', entry: entry.ts };
    expectedRoot = root;
  }

  const stored = getLedgerRoot();
  return {
    ok: !stored.root || stored.root === expectedRoot,
    entries: lines.length,
    windowed,
    root: expectedRoot,
    storedRoot: stored.root,
  };
}