import path from 'path';
import crypto from 'crypto';

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
  const expected = `Bearer ${token}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Fixed-window, per-IP rate limiter for mutating control-plane routes. Keeps a
// flood of writes from monopolizing the (necessarily serialized) persistence path.
const rlBuckets = new Map();
const RL_MAX_BUCKETS = 10_000;

export function rateLimit(req, { windowMs = 10_000, max = 60, now = Date.now() } = {}) {
  if (max <= 0) return { ok: true, remaining: Infinity, retryAfterMs: 0 };
  const ip = clientIp(req);
  const bucket = rlBuckets.get(ip);

  if (!bucket || now - bucket.start >= windowMs) {
    if (rlBuckets.size > RL_MAX_BUCKETS) {
      for (const [key, b] of rlBuckets) {
        if (now - b.start >= windowMs) rlBuckets.delete(key);
      }
    }
    rlBuckets.set(ip, { start: now, count: 1 });
    return { ok: true, remaining: max - 1, retryAfterMs: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, remaining: 0, retryAfterMs: bucket.start + windowMs - now };
  }
  return { ok: true, remaining: max - bucket.count, retryAfterMs: 0 };
}

export function resetRateLimits() {
  rlBuckets.clear();
}
