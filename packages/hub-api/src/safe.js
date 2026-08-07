import path from 'path';

const MAX_BODY_BYTES = 1024 * 1024;
const SAFE_LABEL = /^[a-zA-Z0-9._-]{1,64}$/;
const SAFE_ID = /^[a-zA-Z0-9._-]{1,128}$/;
const SAFE_BUNDLE_KEY = /^[a-zA-Z0-9._-]+(\.(json|jsonl|txt|md))?$/;

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      data += c;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function safeUiPath(root, urlPath) {
  const rel = urlPath.replace(/^\/+/, '');
  const resolved = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) return null;
  return resolved;
}

export function sanitizeIncidentLabel(label) {
  const raw = String(label || 'incident').trim().slice(0, 64);
  return SAFE_LABEL.test(raw) ? raw : 'incident';
}

export function sanitizeBundleKey(name) {
  const key = String(name || '').trim();
  if (!SAFE_BUNDLE_KEY.test(key) || key.includes('..')) return null;
  return key;
}

export function sanitizeId(id) {
  const raw = String(id || '').trim();
  return SAFE_ID.test(raw) ? raw : null;
}

export function hubTokenOk(req, config) {
  const token = config.hubToken || process.env.GC_HUB_TOKEN || process.env.DM_HUB_TOKEN || '';
  if (!token) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${token}`;
}