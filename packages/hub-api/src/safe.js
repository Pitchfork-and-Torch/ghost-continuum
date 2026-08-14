import path from 'path';
import crypto from 'crypto';
import net from 'net';

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

export const HUB_TOKEN_COOKIE = 'gc-hub-token';

export function configuredHubToken(config = {}) {
  return config.hubToken || process.env.GC_HUB_TOKEN || process.env.DM_HUB_TOKEN || '';
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function readCookie(req, name) {
  const raw = String(req.headers?.cookie || '');
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return '';
}

export function hubTokenCookieHeader(token) {
  return `${HUB_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Strict; HttpOnly`;
}

export function hubTokenOk(req, config) {
  const token = configuredHubToken(config);
  if (!token) return true;
  const auth = req.headers.authorization || '';
  if (timingSafeStringEqual(auth, `Bearer ${token}`)) return true;
  const cookie = readCookie(req, HUB_TOKEN_COOKIE);
  return cookie.length > 0 && timingSafeStringEqual(cookie, token);
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Strip :port from a Host header. IPv6 must be bracketed (`[::1]:30000`). */
export function parseHostHeader(host) {
  const raw = String(host || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    if (end === -1) return '';
    return raw.slice(0, end + 1);
  }
  const colon = raw.lastIndexOf(':');
  if (colon > -1 && raw.indexOf(':') === colon) return raw.slice(0, colon);
  return raw;
}

export function allowedHubHosts(config = {}) {
  const extra = [
    ...(Array.isArray(config.hubAllowedHosts) ? config.hubAllowedHosts : []),
    ...String(process.env.GC_HUB_ALLOWED_HOSTS || '').split(','),
  ]
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean)
    .map((s) => parseHostHeader(s) || s);
  return new Set([...LOOPBACK_HOSTS, ...extra]);
}

export function extraHubHosts(config = {}) {
  return [...allowedHubHosts(config)].filter((h) => !LOOPBACK_HOSTS.has(h));
}

export function hubHostIsLoopback(req) {
  return LOOPBACK_HOSTS.has(parseHostHeader(req.headers?.host));
}

/**
 * Read-path lock for /api/*.
 * Loopback without a configured token stays open (local-first CLI).
 * Extra (tunneled) hosts always require a configured token, and any
 * configured token must be presented via Authorization or the HttpOnly cookie.
 */
export function hubApiAuthOk(req, config = {}) {
  if (!configuredHubToken(config) && !hubHostIsLoopback(req)) return false;
  return hubTokenOk(req, config);
}

/**
 * DNS-rebinding lock: reject Host headers that are not loopback
 * (or an operator-declared tunnel hostname in hubAllowedHosts).
 */
export function hubHostOk(req, config = {}) {
  const host = parseHostHeader(req.headers?.host);
  if (!host) return false;
  return allowedHubHosts(config).has(host);
}

/**
 * Localhost CSRF lock for mutating /api routes.
 * Missing Origin is allowed (CLI, curl, Node http). A present Origin must
 * resolve to an allowed hub host.
 */
export function hubOriginOk(req, config = {}) {
  const origin = req.headers?.origin;
  if (origin == null || origin === '') return true;
  try {
    const hostname = new URL(String(origin)).hostname.toLowerCase();
    const normalized = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
    return allowedHubHosts(config).has(normalized);
  } catch {
    return false;
  }
}

export function hubTrustProxy(config = {}) {
  if (config.hubTrustProxy === true) return true;
  const env = String(process.env.GC_HUB_TRUST_PROXY || '').trim().toLowerCase();
  return env === '1' || env === 'true' || env === 'yes';
}

export function clientIp(req, config = {}) {
  if (hubTrustProxy(config)) {
    const first = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    if (first && net.isIP(first)) return first;
  }
  return req.socket?.remoteAddress || 'unknown';
}

// Fixed-window, per-IP rate limiter for mutating control-plane routes. Keeps a
// flood of writes from monopolizing the (necessarily serialized) persistence path.
const rlBuckets = new Map();
const RL_MAX_BUCKETS = 10_000;

export function rateLimit(req, { windowMs = 10_000, max = 60, now = Date.now(), config } = {}) {
  if (max <= 0) return { ok: true, remaining: Infinity, retryAfterMs: 0 };
  const ip = clientIp(req, config);
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
