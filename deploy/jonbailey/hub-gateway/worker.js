/**
 * Ghost Continuum Hub API gateway — proxies /api and /taxii2 to the local hub via Cloudflare Tunnel.
 * Static UI is served by Cloudflare Pages on ghost.jonbailey.xyz.
 */

const ALLOWED_PREFIXES = ['/api/', '/taxii2/'];

function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || 'https://ghost.jonbailey.xyz';
  if (origin !== allowed) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
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

    const target = new URL(url.pathname + url.search, hubOrigin.replace(/\/$/, ''));
    const headers = new Headers(request.headers);
    if (env.HUB_TOKEN) headers.set('Authorization', `Bearer ${env.HUB_TOKEN}`);

    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });

    const resHeaders = new Headers(upstream.headers);
    Object.assign(resHeaders, corsHeaders(origin, env));
    resHeaders.set('Cache-Control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  },
};