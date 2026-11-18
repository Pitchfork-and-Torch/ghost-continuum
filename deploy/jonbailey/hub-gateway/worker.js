/**
 * Ghost Continuum Hub API gateway - proxies /api and /taxii2 to the local hub via Cloudflare Tunnel.
 * The dashboard is served by that hub behind this gateway. This worker does not serve the hub UI.
 *
 * OPTIONS is answered here. GET and HEAD /taxii2/ return a static TAXII discovery
 * document and never contact the hub. Every other path needs the caller's own bearer,
 * compared to HUB_TOKEN, before any upstream fetch. This worker never adds HUB_TOKEN itself.
 * Backup paths and any download path are not exempt.
 * GET /api/events/stream needs the same bearer. Its upstream body is returned
 * unread so the event stream is not buffered here.
 *
 * When both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are set, the
 * forward adds those Access headers only after the bearer passes.
 * Caller-supplied cf-access-* headers, Cf-Access-Jwt-Assertion, and Cookie are removed.
 * One secret without the other is refused before the hub is contacted.
 *
 * Proxied responses drop every Set-Cookie, every cf-access-* header, and hop-by-hop headers.
 * Responses built in this worker never set a cookie.
 * Every response sets HSTS without preload, nosniff, DENY, a locked CSP,
 * no-referrer, and Cache-Control no-store. The event stream adds no-transform
 * and returns the upstream body unread.
 */

const ALLOWED_PREFIXES = ['/api/', '/taxii2/'];

const TAXII_DISCOVERY = {
  title: 'Ghost Continuum TAXII',
  description: 'Public TAXII 2.1 discovery. Collection reads require authorization.',
  contact: 'defensive-only',
  api_roots: [],
};

const TAXII_DISCOVERY_JSON = JSON.stringify(TAXII_DISCOVERY);

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function isStaticDiscovery(method, pathname) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return String(pathname || '') === '/taxii2/';
}

function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || 'https://ghost.jonbailey.xyz';
  if (origin !== allowed) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Last-Event-ID',
  };
}

function applyHeaderMap(headers, map) {
  for (const [key, value] of Object.entries(map)) {
    if (value != null && value !== '') headers.set(key, value);
  }
}

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};

function applySecurityHeaders(headers, cacheControl = 'no-store') {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  headers.set('Cache-Control', cacheControl);
  return headers;
}

function jsonResponse(status, body, origin, env) {
  const headers = new Headers({
    'Content-Type': 'application/json',
  });
  applyHeaderMap(headers, corsHeaders(origin, env));
  applySecurityHeaders(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function staticDiscoveryResponse(request, origin, env) {
  const headers = new Headers({
    'Content-Type': 'application/taxii+json;version=2.1',
  });
  applyHeaderMap(headers, corsHeaders(origin, env));
  applySecurityHeaders(headers);
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  return new Response(TAXII_DISCOVERY_JSON, { status: 200, headers });
}

function presentedBearer(request) {
  const raw = request.headers.get('Authorization') || '';
  const prefix = 'Bearer ';
  if (!raw.startsWith(prefix)) return '';
  const token = raw.slice(prefix.length);
  if (!token || /\s/.test(token)) return '';
  return token;
}

/** Byte-wise compare. Runtime tracks the longer input, not the shared prefix. */
function constantTimeEqual(a, b) {
  const enc = new TextEncoder();
  const left = enc.encode(String(a));
  const right = enc.encode(String(b));
  const len = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < len; i++) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

function accessClient(env) {
  const id = String((env && env.CF_ACCESS_CLIENT_ID) || '').trim();
  const secret = String((env && env.CF_ACCESS_CLIENT_SECRET) || '').trim();
  if (!id && !secret) return { ready: true, id: '', secret: '' };
  if (!id || !secret) return { ready: false, id: '', secret: '' };
  return { ready: true, id, secret };
}

function forwardHeaders(request, access) {
  const headers = new Headers(request.headers);
  headers.delete('Cookie');
  headers.delete('X-Forwarded-For');
  for (const key of [...headers.keys()]) {
    if (String(key).toLowerCase().startsWith('cf-access-')) headers.delete(key);
  }
  if (access && access.id && access.secret) {
    headers.set('CF-Access-Client-Id', access.id);
    headers.set('CF-Access-Client-Secret', access.secret);
  }
  const ip = (request.headers.get('CF-Connecting-IP') || '').trim();
  if (ip) headers.set('X-Forwarded-For', ip);
  return headers;
}

function connectionHeaderNames(headers) {
  const names = new Set();
  const raw = headers.get('connection');
  if (!raw) return names;
  for (const part of String(raw).split(',')) {
    const name = part.trim().toLowerCase();
    if (name) names.add(name);
  }
  return names;
}

function isBlockedResponseHeader(name, extraHop) {
  const lower = String(name || '').toLowerCase();
  if (!lower) return true;
  if (lower === 'set-cookie' || lower === 'set-cookie2') return true;
  if (lower.startsWith('cf-access-')) return true;
  if (HOP_BY_HOP.has(lower)) return true;
  if (extraHop && extraHop.has(lower)) return true;
  return false;
}

function filteredResponseHeaders(source) {
  const extraHop = connectionHeaderNames(source);
  const out = new Headers();
  for (const [key, value] of source.entries()) {
    if (isBlockedResponseHeader(key, extraHop)) continue;
    out.append(key, value);
  }
  out.delete('set-cookie');
  out.delete('set-cookie2');
  return out;
}

function isEventStream(pathname) {
  return pathname === '/api/events/stream';
}

function eventStreamResponse(upstream, origin, env) {
  const headers = filteredResponseHeaders(upstream.headers);
  applyHeaderMap(headers, corsHeaders(origin, env));
  const type = headers.get('Content-Type') || '';
  if (!type.toLowerCase().includes('text/event-stream')) {
    headers.set('Content-Type', 'text/event-stream');
  }
  headers.set('X-Accel-Buffering', 'no');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  applySecurityHeaders(headers, 'no-store, no-transform');
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      const headers = new Headers();
      applyHeaderMap(headers, corsHeaders(origin, env));
      applySecurityHeaders(headers);
      return new Response(null, { status: 204, headers });
    }

    if (!ALLOWED_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      const headers = new Headers({ 'Content-Type': 'text/plain; charset=utf-8' });
      applySecurityHeaders(headers);
      return new Response('Not found', { status: 404, headers });
    }

    if (isStaticDiscovery(request.method, url.pathname)) {
      return staticDiscoveryResponse(request, origin, env);
    }

    if (!env.HUB_TOKEN) {
      return jsonResponse(503, { ok: false, error: 'HUB_TOKEN not configured' }, origin, env);
    }
    if (!constantTimeEqual(presentedBearer(request), env.HUB_TOKEN)) {
      return jsonResponse(401, { ok: false, error: 'unauthorized' }, origin, env);
    }

    const hubOrigin = env.HUB_ORIGIN;
    if (!hubOrigin) {
      return jsonResponse(503, { ok: false, error: 'HUB_ORIGIN not configured' }, origin, env);
    }

    const access = accessClient(env);
    if (!access.ready) {
      return jsonResponse(503, { ok: false, error: 'access client not configured' }, origin, env);
    }

    const target = new URL(url.pathname + url.search, hubOrigin.replace(/\/$/, ''));
    const headers = forwardHeaders(request, access);

    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });

    if (request.method === 'GET' && isEventStream(url.pathname) && upstream.ok && upstream.body) {
      return eventStreamResponse(upstream, origin, env);
    }

    const resHeaders = filteredResponseHeaders(upstream.headers);
    applyHeaderMap(resHeaders, corsHeaders(origin, env));
    applySecurityHeaders(resHeaders);
    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  },
};
