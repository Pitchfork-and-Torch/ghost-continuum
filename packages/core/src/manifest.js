import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { GC_DIR, MANIFEST_PATH } from './config.js';

export function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function sha256String(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function buildManifest(entries) {
  return {
    v: 1,
    generatedAt: new Date().toISOString(),
    classification: 'DM-SENTINEL',
    items: entries.map((e) => ({
      path: e.path,
      size: e.size ?? (fs.existsSync(e.path) ? fs.statSync(e.path).size : 0),
      sha256: e.sha256 ?? sha256File(e.path),
      note: e.note || '',
    })),
    manifestHash: null,
  };
}

export function sealManifest(manifest) {
  const copy = { ...manifest, manifestHash: null };
  const body = JSON.stringify(copy.items);
  copy.manifestHash = sha256String(body);
  fs.mkdirSync(GC_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(copy, null, 2) + '\n');
  return copy;
}

export function verifyManifest(manifest) {
  if (!manifest?.items?.length) return { ok: false, reason: 'empty manifest' };
  const body = JSON.stringify(manifest.items);
  const expected = sha256String(body);
  return {
    ok: manifest.manifestHash === expected,
    expected,
    actual: manifest.manifestHash,
  };
}

export function exportIncidentSnapshot(label = 'incident') {
  const safe = String(label || 'incident').trim().slice(0, 64).replace(/[^a-zA-Z0-9._-]/g, '') || 'incident';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(GC_DIR, 'incident-snapshots', `${safe}-${ts}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeIncidentBundle(dir, payload) {
  const files = [];
  for (const [name, data] of Object.entries(payload)) {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) continue;
    const filePath = path.join(dir, path.basename(name));
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, text + (name.endsWith('.jsonl') ? '' : '\n'));
    files.push(filePath);
  }
  return files;
}