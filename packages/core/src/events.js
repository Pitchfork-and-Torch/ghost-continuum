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
  const lines = fs.readFileSync(EVENTS_PATH, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l)).reverse();
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