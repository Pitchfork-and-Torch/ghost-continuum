/**
 * Sealed incident bundles — write evidence first, hash after, verify later.
 * Manifest paths are portable basenames so a USB copy still verifies.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { sha256File, sha256String } from './manifest.js';
import { GC_DIR, MANIFEST_PATH } from './config.js';

export const BUNDLE_MANIFEST_NAME = 'MANIFEST.json';
export const BUNDLE_REPLAY_NAME = 'replay.html';

function resolveUnderDir(dir, name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/'));
  if (!base || base === '.' || base === '..') return null;
  const resolvedDir = path.resolve(dir);
  const filePath = path.resolve(resolvedDir, base);
  const prefix = resolvedDir.endsWith(path.sep) ? resolvedDir : resolvedDir + path.sep;
  if (filePath !== resolvedDir && !filePath.startsWith(prefix)) return null;
  return { base, filePath };
}

function hashItems(items) {
  return sha256String(JSON.stringify(items));
}

/**
 * Hash files that already exist in `dir` and write MANIFEST.json into the bundle.
 * Also refreshes the global latest manifest pointer.
 */
export function sealBundleDirectory(dir, fileNames = [], options = {}) {
  if (!dir || !fs.existsSync(dir)) {
    throw new Error('seal directory missing');
  }

  const names = fileNames.length
    ? fileNames
    : fs.readdirSync(dir).filter((f) => f !== BUNDLE_MANIFEST_NAME && f !== BUNDLE_REPLAY_NAME);

  const items = [];
  for (const name of names) {
    const resolved = resolveUnderDir(dir, name);
    if (!resolved || !fs.existsSync(resolved.filePath)) continue;
    const st = fs.statSync(resolved.filePath);
    if (!st.isFile()) continue;
    items.push({
      path: resolved.base,
      size: st.size,
      sha256: sha256File(resolved.filePath),
      note: options.notes?.[resolved.base] || resolved.base,
    });
  }

  if (!items.length) {
    throw new Error('no evidence files to seal');
  }

  const manifest = {
    v: 2,
    generatedAt: new Date().toISOString(),
    classification: 'DM-SENTINEL',
    kind: 'ghost-continuum-sealed-incident',
    items,
    manifestHash: null,
  };
  manifest.manifestHash = hashItems(manifest.items);

  const text = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(path.join(dir, BUNDLE_MANIFEST_NAME), text);
  try {
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, text);
  } catch {
    /* global pointer is optional */
  }

  return manifest;
}

export function readBundleManifest(dir) {
  const resolved = resolveUnderDir(dir, BUNDLE_MANIFEST_NAME);
  if (!resolved || !fs.existsSync(resolved.filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(resolved.filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Re-hash every evidence file and check the manifest hash.
 */
export function verifyBundleDirectory(dir) {
  const resolvedDir = path.resolve(dir);
  if (!fs.existsSync(resolvedDir)) {
    return { ok: false, error: 'bundle directory not found', dir: resolvedDir };
  }

  const manifest = readBundleManifest(resolvedDir);
  if (!manifest?.items?.length) {
    return { ok: false, error: 'MANIFEST.json missing or empty', dir: resolvedDir };
  }

  const mismatches = [];
  for (const item of manifest.items) {
    const resolved = resolveUnderDir(resolvedDir, item.path);
    if (!resolved) {
      mismatches.push({ path: item.path, reason: 'unsafe path' });
      continue;
    }
    if (!fs.existsSync(resolved.filePath)) {
      mismatches.push({ path: item.path, reason: 'missing', expected: item.sha256, actual: null });
      continue;
    }
    const actual = sha256File(resolved.filePath);
    if (actual !== item.sha256) {
      mismatches.push({ path: item.path, reason: 'hash mismatch', expected: item.sha256, actual });
    }
  }

  const expectedHash = hashItems(manifest.items);
  const hashOk = manifest.manifestHash === expectedHash;

  return {
    ok: mismatches.length === 0 && hashOk,
    dir: resolvedDir,
    entries: manifest.items.length,
    manifestHash: manifest.manifestHash,
    expectedHash,
    hashOk,
    mismatches,
    generatedAt: manifest.generatedAt,
    kind: manifest.kind,
  };
}

export function resolveBundleDir(targetPath) {
  if (!targetPath) return null;
  const p = path.resolve(String(targetPath));
  if (!fs.existsSync(p)) return null;
  const st = fs.statSync(p);
  if (st.isDirectory()) return p;
  if (path.basename(p) === BUNDLE_MANIFEST_NAME) return path.dirname(p);
  return null;
}

function runTar(args) {
  return new Promise((resolve, reject) => {
    execFile('tar', args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

/**
 * Verify a .tgz produced by createIncidentArchive. Extracts to a temp dir
 * after rejecting absolute / parent paths.
 */
export async function verifySealedArchive(archivePath) {
  const archive = path.resolve(archivePath);
  if (!fs.existsSync(archive)) {
    return { ok: false, error: 'archive not found' };
  }

  let listing;
  try {
    listing = await runTar(['-tzf', archive]);
  } catch (e) {
    return { ok: false, error: `cannot list archive: ${e.message}` };
  }

  const names = listing
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean);
  const unsafe = names.some((n) => n.includes('..') || path.isAbsolute(n) || n.startsWith('/'));
  if (unsafe) {
    return { ok: false, error: 'archive contains unsafe paths' };
  }

  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-seal-'));
  try {
    await runTar(['-xzf', archive, '-C', dest]);
    const manifestHits = [];
    const walk = (d) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name === BUNDLE_MANIFEST_NAME) manifestHits.push(path.dirname(p));
      }
    };
    walk(dest);
    if (!manifestHits.length) {
      return { ok: false, error: 'archive has no MANIFEST.json', archive };
    }
    const result = verifyBundleDirectory(manifestHits[0]);
    return { ...result, archive, extracted: true };
  } catch (e) {
    return { ok: false, error: e.message, archive };
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
}

export function latestIncidentSnapshotDir() {
  const root = path.join(GC_DIR, 'incident-snapshots');
  if (!fs.existsSync(root)) return null;
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const p = path.join(root, e.name);
      return { path: p, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return dirs[0]?.path || null;
}

export async function verifySealedTarget(targetPath) {
  if (!targetPath) {
    const latest = latestIncidentSnapshotDir();
    if (!latest) return { ok: false, error: 'no sealed snapshots found' };
    return verifyBundleDirectory(latest);
  }
  const p = path.resolve(String(targetPath));
  if (!fs.existsSync(p)) return { ok: false, error: 'path not found' };
  if (p.endsWith('.tgz') || p.endsWith('.tar.gz')) return verifySealedArchive(p);
  const dir = resolveBundleDir(p);
  if (!dir) return { ok: false, error: 'not a sealed bundle directory or MANIFEST.json' };
  return verifyBundleDirectory(dir);
}
