/**
 * Device inventory + safe neighbors (allowlist).
 * Home operators label known devices; unknown IPs probing traps get higher attention.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GC_DIR, readEvents } from '../../core/src/index.js';
import { filterLiveEvents } from './demo-campaign.js';

export const DEVICES_PATH = path.join(GC_DIR, 'devices.json');

function loadStore() {
  try {
    if (fs.existsSync(DEVICES_PATH)) {
      return JSON.parse(fs.readFileSync(DEVICES_PATH, 'utf8'));
    }
  } catch {
    /* */
  }
  return { v: 1, devices: [], updatedAt: null };
}

function saveStore(store) {
  fs.mkdirSync(GC_DIR, { recursive: true });
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(DEVICES_PATH, JSON.stringify(store, null, 2) + '\n');
  return store;
}

export function listDevices() {
  return loadStore();
}

export function upsertDevice(device = {}) {
  const store = loadStore();
  const ip = String(device.ip || '').trim();
  if (!ip) return { ok: false, error: 'ip required' };

  const id = device.id || `dev_${crypto.createHash('sha1').update(ip).digest('hex').slice(0, 10)}`;
  const existing = store.devices.findIndex((d) => d.id === id || d.ip === ip);
  const row = {
    id,
    ip,
    name: String(device.name || ip).slice(0, 64),
    kind: String(device.kind || 'device').slice(0, 32), // phone, tv, nas, camera, pc, other
    mac: device.mac ? String(device.mac).slice(0, 32) : null,
    trusted: device.trusted !== false,
    notes: String(device.notes || '').slice(0, 200),
    addedAt: existing >= 0 ? store.devices[existing].addedAt : Date.now(),
    updatedAt: Date.now(),
  };
  if (existing >= 0) store.devices[existing] = row;
  else store.devices.push(row);
  saveStore(store);
  return { ok: true, device: row, count: store.devices.length };
}

export function removeDevice(idOrIp) {
  const store = loadStore();
  const before = store.devices.length;
  store.devices = store.devices.filter((d) => d.id !== idOrIp && d.ip !== idOrIp);
  saveStore(store);
  return { ok: true, removed: before - store.devices.length, count: store.devices.length };
}

export function isTrustedIp(ip, store = loadStore()) {
  if (!ip) return false;
  return store.devices.some((d) => d.trusted && d.ip === ip);
}

/**
 * Suggest devices from recent live event IPs (not auto-trusted).
 */
export function suggestFromEvents(limit = 20) {
  const store = loadStore();
  const known = new Set(store.devices.map((d) => d.ip));
  const live = filterLiveEvents(readEvents(300));
  const byIp = {};
  for (const e of live) {
    if (!e.ip || known.has(e.ip)) continue;
    if (!byIp[e.ip]) byIp[e.ip] = { ip: e.ip, hits: 0, maxScore: 0, lastTs: 0 };
    byIp[e.ip].hits += 1;
    byIp[e.ip].maxScore = Math.max(byIp[e.ip].maxScore, e.score || 0);
    byIp[e.ip].lastTs = Math.max(byIp[e.ip].lastTs, e.ts || 0);
  }
  const suggestions = Object.values(byIp)
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, limit)
    .map((s) => ({
      ...s,
      hint: s.maxScore >= 5 ? 'Probed a trap — review before trusting' : 'Seen on network',
    }));
  return { ok: true, suggestions, trustedCount: store.devices.filter((d) => d.trusted).length };
}

/**
 * Annotate threat actors with trusted/unknown.
 */
export function annotateActors(actors = []) {
  const store = loadStore();
  return actors.map((a) => ({
    ...a,
    trusted: isTrustedIp(a.ip, store),
    deviceName: store.devices.find((d) => d.ip === a.ip)?.name || null,
  }));
}

export function inventorySummary() {
  const store = loadStore();
  const sug = suggestFromEvents(5);
  return {
    ok: true,
    trusted: store.devices.filter((d) => d.trusted).length,
    total: store.devices.length,
    devices: store.devices,
    unknownRecent: sug.suggestions.length,
    topUnknown: sug.suggestions.slice(0, 5),
  };
}
