import fs from 'fs';
import crypto from 'crypto';
import { GC_DIR, EVENTS_PATH } from './config.js';
import { appendLedgerEntry } from '../../trust/src/merkle.js';
import { appendJsonlLine, parseJsonlObjects, readJsonlTail } from './jsonl-tail.js';

/** @typedef {'lan'|'edge'|'audit'|'hub'|'ops'} Plane */

/**
 * @param {object} raw
 * @returns {object}
 */
export function normalizeEvent(raw) {
  const plane = raw.plane || inferPlane(raw);
  return {
    v: 1,
    id: raw.id || crypto.randomUUID(),
    ts: raw.ts || Date.now(),
    plane,
    type: raw.type || 'unknown',
    ip: raw.ip || raw.detail?.ip || null,
    score: typeof raw.score === 'number' ? raw.score : scoreEventType(raw.type),
    buildId: raw.buildId || raw.detail?.buildId || null,
    generation: raw.generation ?? raw.detail?.generation ?? null,
    detail: raw.detail || {},
    source: raw.source || plane,
  };
}

function inferPlane(raw) {
  const t = String(raw.type || '');
  if (t.startsWith('dm-') || t.includes('honeypot-click') || t.includes('script-tamper')) return 'edge';
  if (t.includes('honeypot') || t.includes('trap') || t.includes('rotate')) return 'lan';
  if (t.includes('mission') || t.includes('finding') || t.includes('recon') || t.includes('scope-probe') || t.includes('cell-signal')) return 'audit';
  return 'hub';
}

export function scoreEventType(type = '') {
  const t = String(type);
  if (t.includes('trap-trip') || t === 'script-tamper') return 6;
  if (t.includes('honeypot') || t === 'dm-honeypot-hit') return 5;
  if (t.includes('rotate')) return 3;
  if (t.includes('sentinel-alive')) return 0;
  return 1;
}

let eventMemo = null;

export function appendEvent(event) {
  const normalized = normalizeEvent(event);
  const maxBytes = Number(process.env.GC_JSONL_ROTATE_BYTES);
  appendJsonlLine(EVENTS_PATH, JSON.stringify(normalized), {
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : undefined,
  });
  eventMemo = null;
  if (process.env.DM_NO_LEDGER !== '1') {
    try {
      appendLedgerEntry(normalized);
    } catch {
      /* ledger optional */
    }
  }
  return normalized;
}

/** Parse an events.jsonl blob. Torn or non-object lines are skipped so one bad write cannot blank the feed. */
export function parseEventJsonl(text, limit = 100) {
  return parseJsonlObjects(text, limit).reverse();
}

/**
 * Read the newest `limit` lines of a JSONL file. A same-process repeat with a
 * limit at or below the cached window reuses the tail instead of hitting disk.
 */
export function readEventsFromFile(filePath, limit = 100) {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  if (cap === 0) return [];
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const stamp = `${stat.mtimeMs}:${stat.size}`;
  if (
    eventMemo
    && eventMemo.filePath === filePath
    && eventMemo.stamp === stamp
    && eventMemo.limit >= cap
  ) {
    const window = cap === eventMemo.limit ? eventMemo.lines : eventMemo.lines.slice(-cap);
    return parseEventJsonl(window.join('\n'), cap);
  }
  const { lines } = readJsonlTail(filePath, cap);
  eventMemo = { filePath, stamp, limit: cap, lines };
  return parseEventJsonl(lines.join('\n'), cap);
}

export function readEvents(limit = 100) {
  return readEventsFromFile(EVENTS_PATH, limit);
}

export function mergeEventStreams(...streams) {
  const all = streams.flat().map(normalizeEvent);
  all.sort((a, b) => b.ts - a.ts);
  const seen = new Set();
  return all.filter((e) => {
    const key = `${e.plane}:${e.type}:${e.ts}:${e.ip}:${JSON.stringify(e.detail).slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}