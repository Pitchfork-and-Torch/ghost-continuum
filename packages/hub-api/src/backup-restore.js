/**
 * Backup & restore immune state (config, home, devices, genomes, progression).
 * Does not include full ledger by default (can be large); optional includeEvents.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { GC_DIR, CONFIG_PATH, loadConfig, saveConfig } from '../../core/src/index.js';
import { HOME_PATH, loadHome, saveHome } from './home-shield.js';
import { DEVICES_PATH, listDevices } from './device-inventory.js';
import { PROGRESS_PATH } from './progression.js';
import { POOL_PATH, loadPool, savePool } from '../../genome/src/pool.js';

export const BACKUP_DIR = path.join(GC_DIR, 'backups');

function safeRead(p) {
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  } catch {
    /* */
  }
  return null;
}

export function createBackup(options = {}) {
  const bundle = {
    v: 1,
    kind: 'ghost-continuum-home-backup',
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: process.platform,
    files: {
      config: safeRead(CONFIG_PATH),
      home: safeRead(HOME_PATH),
      devices: safeRead(DEVICES_PATH),
      progression: safeRead(PROGRESS_PATH),
      genomePool: safeRead(POOL_PATH),
    },
    meta: {
      home: loadHome(),
      deviceCount: listDevices().devices?.length || 0,
      poolSize: loadPool().length,
    },
  };

  if (options.includeEvents) {
    const ev = path.join(GC_DIR, 'events.jsonl');
    const raw = safeRead(ev);
    if (raw) {
      // Cap size for safety
      const lines = raw.trim().split('\n');
      bundle.files.eventsTail = lines.slice(-2000).join('\n');
      bundle.meta.eventsIncluded = Math.min(2000, lines.length);
    }
  }

  const json = JSON.stringify(bundle, null, 2);
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  bundle.sha256 = hash;

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const id = `backup-${Date.now()}`;
  const filePath = path.join(BACKUP_DIR, `${id}.json`);
  const final = JSON.stringify(bundle, null, 2);
  fs.writeFileSync(filePath, final + '\n');

  return {
    ok: true,
    id,
    path: filePath,
    sha256: hash,
    size: final.length,
    meta: bundle.meta,
    downloadUrl: `/api/home/backup/download/${id}`,
  };
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const p = path.join(BACKUP_DIR, f);
      const st = fs.statSync(p);
      return { id: f.replace(/\.json$/, ''), path: p, bytes: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function getBackupPath(id) {
  const safe = String(id || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const p = path.join(BACKUP_DIR, `${safe}.json`);
  if (!p.startsWith(BACKUP_DIR) || !fs.existsSync(p)) return null;
  return p;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Access and bind settings stay with the running hub. Uploads cannot replace them. */
const PRESERVED_CONFIG_KEYS = [
  'hubToken',
  'hubAllowedHosts',
  'bind',
  'host',
  'port',
  'bindHost',
  'hubBind',
  'hubHost',
  'listenHost',
  'hubPort',
  'ghostLanPort',
  'edgeLocalPort',
  'cellPort',
];

const JSON_OBJECT_FILES = new Set(['config', 'home', 'devices', 'progression']);
const JSON_VALUE_FILES = new Set(['genomePool']);

function invalidBackup() {
  return { ok: false, error: 'Invalid backup' };
}

function parseJsonValue(text) {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function fileShapeOk(key, value) {
  if (value == null || value === '') return true;
  if (typeof value !== 'string') return false;
  if (key === 'eventsTail') return true;
  if (JSON_OBJECT_FILES.has(key)) return isPlainObject(parseJsonValue(value));
  if (JSON_VALUE_FILES.has(key)) {
    const parsed = parseJsonValue(value);
    return isPlainObject(parsed) || Array.isArray(parsed);
  }
  return false;
}

function bundleShapeOk(bundle) {
  if (!isPlainObject(bundle) || !isPlainObject(bundle.files)) return false;
  if (bundle.v != null && bundle.v !== 1) return false;
  if (bundle.kind != null && bundle.kind !== 'ghost-continuum-home-backup') return false;
  return Object.entries(bundle.files).every(([key, value]) => fileShapeOk(key, value));
}

function readRawConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function configTextPreservingAccess(uploadedText) {
  const uploaded = JSON.parse(uploadedText);
  const current = readRawConfig();
  const next = { ...uploaded };
  for (const key of PRESERVED_CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(current, key)) next[key] = current[key];
    else delete next[key];
  }
  if (JSON.stringify(next) === JSON.stringify(uploaded)) {
    return uploadedText.endsWith('\n') ? uploadedText : `${uploadedText}\n`;
  }
  return JSON.stringify(next, null, 2) + '\n';
}

/**
 * Restore from backup object or file id. Overwrites config/home/devices/genomes carefully.
 * hubToken, hubAllowedHosts, and bind/host/port settings are kept from the current config.
 */
export function restoreBackup(input = {}) {
  if (!isPlainObject(input)) return invalidBackup();

  let bundle = null;
  if (Object.prototype.hasOwnProperty.call(input, 'bundle')) {
    if (!isPlainObject(input.bundle)) return invalidBackup();
    bundle = input.bundle;
  } else if (input.id != null && input.id !== '') {
    if (typeof input.id !== 'string') return invalidBackup();
    const p = getBackupPath(input.id);
    if (!p) return { ok: false, error: 'Backup not found' };
    try {
      bundle = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return invalidBackup();
    }
  } else if (isPlainObject(input.files)) {
    bundle = input;
  } else {
    return invalidBackup();
  }

  if (!bundleShapeOk(bundle)) return invalidBackup();

  const restored = [];
  fs.mkdirSync(GC_DIR, { recursive: true });

  if (bundle.files.config) {
    fs.writeFileSync(CONFIG_PATH, configTextPreservingAccess(bundle.files.config));
    restored.push('config');
  }
  if (bundle.files.home) {
    fs.writeFileSync(HOME_PATH, bundle.files.home);
    restored.push('home');
  }
  if (bundle.files.devices) {
    fs.writeFileSync(DEVICES_PATH, bundle.files.devices);
    restored.push('devices');
  }
  if (bundle.files.progression) {
    fs.writeFileSync(PROGRESS_PATH, bundle.files.progression);
    restored.push('progression');
  }
  if (bundle.files.genomePool) {
    fs.mkdirSync(path.dirname(POOL_PATH), { recursive: true });
    fs.writeFileSync(POOL_PATH, bundle.files.genomePool);
    restored.push('genomes');
  }

  // Re-hydrate in-memory friendliness
  try {
    loadConfig();
    loadHome();
  } catch {
    /* */
  }

  return {
    ok: true,
    restored,
    createdAt: bundle.createdAt,
    sha256: bundle.sha256,
    message: `Restored: ${restored.join(', ')}. Restart hub recommended.`,
  };
}
