import fs from 'fs';
import crypto from 'crypto';
import { GC_DIR, EVENTS_PATH } from './config.js';
import { appendLedgerEntry } from '../../trust/src/merkle.js';

/** @typedef {'lan'|'edge'|'audit'|'hub'|'ops'} Plane */

/**
 * @param {object} raw
 * @returns {object}
 */
export function normalizeEvent(raw) {
  const plane = raw.plane || inferPlane(raw);
  // Prefer an explicit finite timestamp. Truthy non-finite values (Infinity)
  // and falsy zero must not leak into hub sort / merge keys.
  // JSON/hub callers often pass numeric timestamps as strings ("1700...");
  // Number.isFinite("1700...") is false, so coerce numeric strings before fallback.
  // Distinct from rejecting NaN/Infinity on already-numeric ts.
  let ts = raw.ts;
  if (typeof ts === 'string' && ts.trim() !== '') {
    ts = Number(ts);
  }
  ts = Number.isFinite(ts) ? ts : Date.now();
  // Same string-number trap as timestamps: Number.isFinite('5') is false, so
  // JSON/hub scores arrived as strings and silently fell back to type scores.
  let score = raw.score;
  if (typeof score === 'string' && score.trim() !== '') {
    score = Number(score);
  }
  return {
    v: 1,
    id: raw.id || crypto.randomUUID(),
    ts,
    plane,
    type: raw.type || 'unknown',
    ip: raw.ip || raw.detail?.ip || null,
    score: Number.isFinite(score) ? score : scoreEventType(raw.type),
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

export function appendEvent(event) {
  fs.mkdirSync(GC_DIR, { recursive: true });
  const normalized = normalizeEvent(event);
  fs.appendFileSync(EVENTS_PATH, JSON.stringify(normalized) + '\n');
  if (process.env.DM_NO_LEDGER !== '1') {
    try {
      appendLedgerEntry(normalized);
    } catch {
      /* ledger optional */
    }
  }
  return normalized;
}

export function readEvents(limit = 100) {
  if (!fs.existsSync(EVENTS_PATH)) return [];
  // Array#slice(-0) === slice(0) and returns the whole array. Callers that
  // pass limit=0 (or NaN / negative) must get an empty feed, not everything.
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return [];
  const lines = fs.readFileSync(EVENTS_PATH, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-Math.floor(n)).map((l) => JSON.parse(l)).reverse();
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