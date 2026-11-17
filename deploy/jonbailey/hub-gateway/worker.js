/**
 * Ghost Continuum Hub API gateway - proxies /api and /taxii2 to the local hub via Cloudflare Tunnel.
 * Static UI is served by Cloudflare Pages on ghost.jonbailey.xyz.
 *
 * OPTIONS is answered here. Every other method needs the caller's own bearer,
 * compared to HUB_TOKEN. This worker never adds HUB_TOKEN itself.
 * GET /taxii2/ is the only read forwarded
 * without that bearer. Backup paths and any download path are never in that set.
 * GET /api/events/stream needs the same bearer. Its upstream body is returned
 * unread so the event stream is not buffered here.
 */

const ALLOWED_PREFIXES = ['/api/', '/taxii2/'];
const PUBLIC_GET_PATHS = new Set(['/taxii2/']);

function isPublicGet(method, pathname) {
  if (method !== 'GET') return false;
  const path = String(pathname || '');
  const folded = path.toLowerCase();
  if (folded.includes('/download/')) return false;
  if (folded.startsWith('/api/home/backup')) return false;
  return PUBLIC_GET_PATHS.has(path);
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

function jsonResponse(status, body, origin, env) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  applyHeaderMap(headers, corsHeaders(origin, env));
  return new Response(JSON.stringify(body), { status, headers });
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

function forwardHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('Cookie');
  headers.delete('X-Forwarded-For');
  const ip = (request.headers.get('CF-Connecting-IP') || '').trim();
  if (ip) headers.set('X-Forwarded-For', ip);
  return headers;
}

function isEventStream(pathname) {
  return pathname === '/api/events/stream';
}

function eventStreamResponse(upstream, origin, env) {
  const headers = new Headers(upstream.headers);
  applyHeaderMap(headers, corsHeaders(origin, env));
  const type = headers.get('Content-Type') || '';
  if (!type.toLowerCase().includes('text/event-stream')) {
    headers.set('Content-Type', 'text/event-stream');
  }
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('X-Accel-Buffering', 'no');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      const headers = new Headers();
      applyHeaderMap(headers, corsHeaders(origin, env));
      return new Response(null, { status: 204, headers });
    }

    if (!ALLOWED_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      return new Response('Not found', { status: 404 });
    }

    const hubOrigin = env.HUB_ORIGIN;
    if (!hubOrigin) {
      return new Response(JSON.stringify({ ok: false, error: 'HUB_ORIGIN not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!isPublicGet(request.method, url.pathname)) {
      if (!env.HUB_TOKEN) {
        return jsonResponse(503, { ok: false, error: 'HUB_TOKEN not configured' }, origin, env);
      }
      if (!constantTimeEqual(presentedBearer(request), env.HUB_TOKEN)) {
        return jsonResponse(401, { ok: false, error: 'unauthorized' }, origin, env);
      }
    }

    const target = new URL(url.pathname + url.search, hubOrigin.replace(/\/$/, ''));
    const headers = forwardHeaders(request);

    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });

    if (request.method === 'GET' && isEventStream(url.pathname) && upstream.ok && upstream.body) {
      return eventStreamResponse(upstream, origin, env);
    }

    const resHeaders = new Headers(upstream.headers);
    applyHeaderMap(resHeaders, corsHeaders(origin, env));
    resHeaders.set('Cache-Control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  },
};
