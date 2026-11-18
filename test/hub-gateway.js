/**
 * Hub gateway forwarding: caller bearer required on unsafe methods.
 * The worker must not add HUB_TOKEN on the caller's behalf.
 */
import assert from 'assert';
import worker from '../deploy/jonbailey/hub-gateway/worker.js';

const ORIGIN = 'https://ghost.jonbailey.xyz';
const HUB = 'https://hub.internal.example';
const TOKEN = 'hub-token-value';

const env = {
  HUB_ORIGIN: HUB,
  HUB_TOKEN: TOKEN,
  ALLOWED_ORIGIN: ORIGIN,
};

const calls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init = {}) => {
  const headers = new Headers(init.headers || {});
  calls.push({
    url: String(url),
    method: init.method,
    authorization: headers.get('Authorization'),
    cookie: headers.get('Cookie'),
    lastEventId: headers.get('Last-Event-ID'),
    xff: headers.get('X-Forwarded-For'),
    accessId: headers.get('CF-Access-Client-Id'),
    accessSecret: headers.get('CF-Access-Client-Secret'),
    accessJwt: headers.get('Cf-Access-Jwt-Assertion'),
    cfAccess: [...headers.keys()].filter((key) => key.toLowerCase().startsWith('cf-access-')).sort(),
  });
  const extra = upstreamExtra;
  upstreamExtra = [];
  if (String(url).includes('/api/events/stream')) {
    const encoder = new TextEncoder();
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(encoder.encode('event: connected\ndata: {"ok":true}\n\n'));
        }
      },
    });
    const responseHeaders = new Headers({
      'Content-Type': 'text/event-stream',
      'Content-Length': '128',
      'X-Upstream': 'yes',
    });
    for (const [key, value] of extra) responseHeaders.append(key, value);
    return new Response(stream, { status: 200, headers: responseHeaders });
  }
  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    'X-Upstream': 'yes',
  });
  for (const [key, value] of extra) responseHeaders.append(key, value);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: responseHeaders,
  });
};

let upstreamExtra = [];

const LEAK_HEADERS = [
  ['Set-Cookie', 'CF_Authorization=leak-one; Path=/; HttpOnly; Secure'],
  ['Set-Cookie', 'session=leak-two; Path=/; HttpOnly'],
  ['Set-Cookie2', 'legacy=leak-three'],
  ['CF-Access-Jwt-Assertion', 'leak-jwt'],
  ['Cf-Access-Authenticated-User-Email', 'leak@example.test'],
  ['Connection', 'close, X-Hop'],
  ['Keep-Alive', 'timeout=5'],
  ['X-Hop', 'secret-hop'],
  ['Transfer-Encoding', 'chunked'],
  ['Upgrade', 'websocket'],
  ['Proxy-Authenticate', 'Basic realm="upstream"'],
  ['Proxy-Authorization', 'Basic abc'],
  ['Te', 'trailers'],
  ['Trailer', 'X-Hop'],
];

function resetCalls() {
  calls.length = 0;
  upstreamExtra = [];
}

function assertNoLeak(res, label) {
  const names = [...res.headers.keys()].map((name) => name.toLowerCase());
  assert.ok(!names.includes('set-cookie'), `${label} Set-Cookie names=${names.join(',')}`);
  assert.ok(!names.includes('set-cookie2'), `${label} Set-Cookie2`);
  assert.ok(!names.some((name) => name.startsWith('cf-access-')), `${label} cf-access-* names=${names.join(',')}`);
  if (typeof res.headers.getSetCookie === 'function') {
    assert.deepStrictEqual(res.headers.getSetCookie(), [], label);
  }
  for (const [key, value] of res.headers.entries()) {
    const text = String(value);
    assert.ok(!text.includes('leak-one'), `${label} ${key}`);
    assert.ok(!text.includes('leak-two'), `${label} ${key}`);
    assert.ok(!text.includes('leak-jwt'), `${label} ${key}`);
    assert.ok(!text.toLowerCase().includes('cf-access-'), `${label} ${key}`);
  }
}

try {
  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/home/restore`, {
        method: 'POST',
        headers: {
          Origin: ORIGIN,
          'Content-Type': 'application/json',
          Cookie: 'gc-hub-token=hub-token-value',
          'X-Forwarded-For': '198.51.100.9',
          'CF-Connecting-IP': '203.0.113.10',
        },
        body: '{}',
      }),
      env,
    );
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(calls.length, 0, 'unauthenticated POST is not forwarded');
    assert.ok(!calls.some((c) => String(c.authorization || '').includes(TOKEN)));
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assertNoLeak(res, 'unauthenticated POST');
    console.log('  unauthenticated POST is 401 and is not forwarded');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/home/restore`, {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token', Origin: ORIGIN },
        body: '{}',
      }),
      env,
    );
    assert.strictEqual(res.status, 401);
    assert.strictEqual(calls.length, 0);
    assertNoLeak(res, 'mismatched bearer');
    console.log('  mismatched bearer is 401 and is not forwarded');
  }

  {
    resetCalls();
    for (const authorization of [`bearer ${TOKEN}`, `BEARER ${TOKEN}`, `Bearer  ${TOKEN}`]) {
      const res = await worker.fetch(
        new Request(`${ORIGIN}/api/home/restore`, {
          method: 'POST',
          headers: { Authorization: authorization, Origin: ORIGIN },
          body: '{}',
        }),
        env,
      );
      assert.strictEqual(res.status, 401, authorization);
      assert.strictEqual(calls.length, 0, authorization);
    }
    console.log('  bearer prefix must be exactly Bearer');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/home/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, Origin: ORIGIN },
        body: '{}',
      }),
      { HUB_ORIGIN: HUB, ALLOWED_ORIGIN: ORIGIN },
    );
    assert.strictEqual(res.status, 503);
    assert.strictEqual(calls.length, 0);
    console.log('  unset HUB_TOKEN on POST is 503 and is not forwarded');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/taxii2/`, {
        method: 'GET',
        headers: {
          Origin: ORIGIN,
          Cookie: `gc-hub-token=${TOKEN}`,
          'X-Forwarded-For': '198.51.100.9',
          'CF-Connecting-IP': '203.0.113.10',
        },
      }),
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 0, 'public discovery must not fetch');
    assert.strictEqual(res.headers.get('Content-Type'), 'application/taxii+json;version=2.1');
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store');
    assertNoLeak(res, 'public discovery');
    const body = await res.json();
    assert.deepStrictEqual(body, {
      title: 'Ghost Continuum TAXII',
      description: 'Public TAXII 2.1 discovery. Collection reads require authorization.',
      contact: 'defensive-only',
      api_roots: [],
    });
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes('hub.internal'));
    assert.ok(!raw.includes('127.0.0.1'));
    assert.ok(!raw.includes(TOKEN));
    console.log('  GET /taxii2/ is static discovery and does not fetch');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/taxii2/`, {
        method: 'GET',
        headers: { Authorization: 'Bearer caller-supplied', Origin: ORIGIN },
      }),
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 0);
    assertNoLeak(res, 'public discovery with caller authorization');
    console.log('  GET /taxii2/ ignores a caller Authorization and does not fetch');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/home/restore`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Origin: ORIGIN,
          Cookie: 'session=abc',
          'X-Forwarded-For': '198.51.100.9',
          'CF-Connecting-IP': '203.0.113.10',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, 'POST');
    assert.strictEqual(calls[0].authorization, `Bearer ${TOKEN}`);
    assert.strictEqual(calls[0].cookie, null);
    assert.strictEqual(calls[0].xff, '203.0.113.10');
    console.log('  authenticated POST forwards the caller bearer only');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN },
      }),
      env,
    );
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
    assert.strictEqual(res.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization, Last-Event-ID');
    assert.strictEqual(calls.length, 0);
    console.log('  OPTIONS keeps ALLOWED_ORIGIN CORS and is not forwarded');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/taxii2/`, {
        method: 'GET',
        headers: { Origin: 'https://evil.example' },
      }),
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), null);
    assert.strictEqual(calls.length, 0);
    assertNoLeak(res, 'discovery from other origin');
    console.log('  a non-allowed Origin does not receive CORS headers');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/feed?limit=30`, { method: 'GET' }),
      env,
    );
    assert.strictEqual(res.status, 401);
    assert.strictEqual(calls.length, 0);
    console.log('  GET /api/feed requires a bearer');
  }

  {
    resetCalls();
    const res = await worker.fetch(new Request(`${ORIGIN}/api/status`, { method: 'GET' }), env);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(calls.length, 0);
    console.log('  GET /api/status requires a bearer');
  }

  {
    resetCalls();
    const feed = await worker.fetch(
      new Request(`${ORIGIN}/api/feed?limit=30`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      env,
    );
    assert.strictEqual(feed.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, `${HUB}/api/feed?limit=30`);
    assert.strictEqual(calls[0].authorization, `Bearer ${TOKEN}`);
    resetCalls();
    const status = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      env,
    );
    assert.strictEqual(status.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, `${HUB}/api/status`);
    assert.strictEqual(calls[0].authorization, `Bearer ${TOKEN}`);
    console.log('  GET /api/status and GET /api/feed forward with a bearer');
  }

  {
    resetCalls();
    const res = await worker.fetch(new Request(`${ORIGIN}/taxii2/`, { method: 'GET' }), env);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 0);
    const body = await res.json();
    assert.strictEqual(body.title, 'Ghost Continuum TAXII');
    assert.deepStrictEqual(body.api_roots, []);
    assertNoLeak(res, 'public discovery again');
    console.log('  GET /taxii2/ returns static JSON and does not contact the hub');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, { method: 'HEAD' }),
      env,
    );
    assert.strictEqual(res.status, 401);
    assert.strictEqual(calls.length, 0);
    console.log('  HEAD still requires a bearer');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/genome/pool`, { method: 'GET' }),
      env,
    );
    assert.strictEqual(res.status, 401);
    assert.strictEqual(calls.length, 0);
    console.log('  GET outside the read list requires a bearer');
  }

  {
    resetCalls();
    const paths = [
      '/api/home/backup',
      '/api/home/backup?includeEvents=1',
      '/api/home/Backup',
      '/api/home/backup/download/backup-1',
      '/api/incident/download/seal-1',
      '/api/status/../home/backup',
    ];
    for (const path of paths) {
      resetCalls();
      const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { method: 'GET' }), env);
      assert.strictEqual(res.status, 401, path);
      assert.strictEqual(calls.length, 0, path);
    }
    console.log('  backup and download GETs require a bearer');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/home/backup/download/backup-1`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].authorization, `Bearer ${TOKEN}`);
    assert.strictEqual(calls[0].url, `${HUB}/api/home/backup/download/backup-1`);
    console.log('  an allowed bearer can read a backup download');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/taxii2/collections`, { method: 'GET' }),
      env,
    );
    assert.strictEqual(res.status, 401);
    assert.strictEqual(calls.length, 0);
    console.log('  GET under /taxii2/ still requires a bearer');
  }

  {
    resetCalls();
    const res = await worker.fetch(new Request(`${ORIGIN}/nope`), env);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(calls.length, 0);
    console.log('  unknown paths stay 404');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/events/stream`, {
        method: 'GET',
        headers: { Cookie: `gc-hub-token=${TOKEN}`, Origin: ORIGIN },
      }),
      env,
    );
    assert.strictEqual(res.status, 401);
    assert.strictEqual(calls.length, 0);
    console.log('  GET /api/events/stream without a bearer is 401 and is not forwarded');
  }

  {
    resetCalls();
    const pending = worker.fetch(
      new Request(`${ORIGIN}/api/events/stream`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Origin: ORIGIN,
          Cookie: `gc-hub-token=${TOKEN}`,
          'Last-Event-ID': '42',
        },
      }),
      env,
    );
    const res = await Promise.race([
      pending,
      new Promise((_, reject) => setTimeout(() => reject(new Error('gateway buffered the stream')), 1000)),
    ]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, 'GET');
    assert.strictEqual(calls[0].url, `${HUB}/api/events/stream`);
    assert.strictEqual(calls[0].authorization, `Bearer ${TOKEN}`);
    assert.strictEqual(calls[0].cookie, null);
    assert.strictEqual(calls[0].lastEventId, '42');
    assert.strictEqual(res.headers.get('Content-Length'), null);
    assert.ok(String(res.headers.get('Content-Type') || '').includes('text/event-stream'));
    assert.ok(String(res.headers.get('Cache-Control') || '').includes('no-cache'));
    assert.ok(String(res.headers.get('Cache-Control') || '').includes('no-transform'));
    assert.strictEqual(res.headers.get('X-Accel-Buffering'), 'no');
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    const reader = res.body.getReader();
    const first = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('stream did not yield')), 1000)),
    ]);
    assert.strictEqual(first.done, false);
    assert.strictEqual(new TextDecoder().decode(first.value), 'event: connected\ndata: {"ok":true}\n\n');
    await reader.cancel();
    console.log('  GET /api/events/stream forwards a bearer as an unbuffered stream');
  }

  const accessEnv = {
    ...env,
    CF_ACCESS_CLIENT_ID: 'gateway-access-id',
    CF_ACCESS_CLIENT_SECRET: 'gateway-access-secret',
  };

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, {
        method: 'GET',
        headers: {
          'CF-Access-Client-Id': 'gateway-access-id',
          'CF-Access-Client-Secret': 'gateway-access-secret',
          Cookie: `gc-hub-token=${TOKEN}`,
        },
      }),
      accessEnv,
    );
    assert.strictEqual(res.status, 401);
    assert.strictEqual(calls.length, 0);
    const body = await res.text();
    assert.ok(!body.includes('gateway-access-secret'));
    console.log('  an Access client pair without a bearer is 401 and is not forwarded');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'CF-Access-Client-Id': 'caller-access-id',
          'CF-Access-Client-Secret': 'caller-access-secret',
          'Cf-Access-Jwt-Assertion': 'caller-jwt',
        },
      }),
      accessEnv,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].authorization, `Bearer ${TOKEN}`);
    assert.strictEqual(calls[0].accessId, 'gateway-access-id');
    assert.strictEqual(calls[0].accessSecret, 'gateway-access-secret');
    assert.strictEqual(calls[0].accessJwt, null);
    const body = await res.text();
    assert.ok(!body.includes('gateway-access-secret'));
    console.log('  a valid bearer forwards the configured Access client, not the caller pair');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/taxii2/`, { method: 'GET' }),
      accessEnv,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 0);
    assertNoLeak(res, 'discovery with access env');
    const discovery = await res.json();
    assert.ok(!JSON.stringify(discovery).includes('gateway-access'));
    console.log('  GET /taxii2/ does not fetch and does not attach the Access client');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      { ...env, CF_ACCESS_CLIENT_ID: 'gateway-access-id' },
    );
    assert.strictEqual(res.status, 503);
    assert.strictEqual(calls.length, 0);
    const body = await res.json();
    assert.strictEqual(body.error, 'access client not configured');
    console.log('  a partial Access client is 503 and is not forwarded');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'CF-Access-Client-Id': 'caller-access-id',
          'CF-Access-Client-Secret': 'caller-access-secret',
          'Cf-Access-Jwt-Assertion': 'caller-jwt',
          'CF-Access-Extra': 'caller-extra',
        },
      }),
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].accessId, null);
    assert.strictEqual(calls[0].accessSecret, null);
    assert.strictEqual(calls[0].accessJwt, null);
    assert.deepStrictEqual(calls[0].cfAccess, []);
    console.log('  caller Access headers are dropped when no client is configured');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'CF-Access-Client-Id': 'caller-access-id',
          'CF-Access-Client-Secret': 'caller-access-secret',
          'Cf-Access-Jwt-Assertion': 'caller-jwt',
          Cookie: 'session=abc',
        },
      }),
      accessEnv,
    );
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(calls[0].cfAccess, ['cf-access-client-id', 'cf-access-client-secret']);
    assert.strictEqual(calls[0].cookie, null);
    assert.strictEqual(calls[0].accessJwt, null);
    console.log('  Access client headers are attached only after the bearer passes');
  }

  {
    resetCalls();
    const head = await worker.fetch(new Request(`${ORIGIN}/taxii2/`, { method: 'HEAD' }), env);
    assert.strictEqual(head.status, 200);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(head.headers.get('Content-Type'), 'application/taxii+json;version=2.1');
    assert.strictEqual(await head.text(), '');
    assertNoLeak(head, 'HEAD discovery');
    console.log('  HEAD /taxii2/ is static and does not fetch');
  }

  {
    resetCalls();
    upstreamExtra = LEAK_HEADERS.map((pair) => pair.slice());
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TOKEN}`, Origin: ORIGIN },
      }),
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(res.headers.get('Content-Type'), 'application/json');
    assert.strictEqual(res.headers.get('X-Upstream'), 'yes');
    assert.strictEqual(res.headers.get('X-Hop'), null);
    for (const name of [
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
    ]) {
      assert.strictEqual(res.headers.get(name), null, name);
    }
    assertNoLeak(res, 'authenticated JSON');
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    console.log('  authenticated JSON strips Set-Cookie, cf-access-*, and hop-by-hop headers');
  }

  {
    resetCalls();
    upstreamExtra = LEAK_HEADERS.map((pair) => pair.slice());
    const pending = worker.fetch(
      new Request(`${ORIGIN}/api/events/stream`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TOKEN}`, Origin: ORIGIN },
      }),
      env,
    );
    const res = await Promise.race([
      pending,
      new Promise((_, reject) => setTimeout(() => reject(new Error('gateway buffered the stream')), 1000)),
    ]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.ok(String(res.headers.get('Content-Type') || '').includes('text/event-stream'));
    assertNoLeak(res, 'authenticated stream');
    assert.strictEqual(res.headers.get('X-Hop'), null);
    assert.strictEqual(res.headers.get('Connection'), null);
    const reader = res.body.getReader();
    const first = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('stream did not yield')), 1000)),
    ]);
    assert.strictEqual(first.done, false);
    assert.strictEqual(new TextDecoder().decode(first.value), 'event: connected\ndata: {"ok":true}\n\n');
    await reader.cancel();
    console.log('  authenticated stream strips leak headers and passes the body through');
  }

  {
    resetCalls();
    for (const authorization of [undefined, 'Bearer wrong-token']) {
      const headers = authorization ? { Authorization: authorization } : {};
      const res = await worker.fetch(
        new Request(`${ORIGIN}/api/status`, { method: 'GET', headers }),
        env,
      );
      assert.strictEqual(res.status, 401);
      assert.strictEqual(calls.length, 0);
      assertNoLeak(res, 'missing or wrong bearer');
      const body = await res.json();
      assert.strictEqual(body.ok, false);
    }
    console.log('  missing or wrong bearer is 401 and makes no upstream call');
  }

  {
    resetCalls();
    const res = await worker.fetch(new Request(`${ORIGIN}/nope`), env);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(calls.length, 0);
    assertNoLeak(res, '404');
    console.log('  worker 404 has no Set-Cookie');
  }

  console.log('hub-gateway: OK');
} finally {
  globalThis.fetch = originalFetch;
}
