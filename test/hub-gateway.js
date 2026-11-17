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
    xff: headers.get('X-Forwarded-For'),
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Upstream': 'yes' },
  });
};

function resetCalls() {
  calls.length = 0;
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
      new Request(`${ORIGIN}/api/status`, {
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
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].authorization, null);
    assert.strictEqual(calls[0].cookie, null);
    assert.strictEqual(calls[0].xff, '203.0.113.10');
    assert.strictEqual(calls[0].url, `${HUB}/api/status`);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store');
    assert.strictEqual(res.headers.get('X-Upstream'), 'yes');
    console.log('  GET forwards without a token, strips Cookie, sets X-Forwarded-For');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, {
        method: 'GET',
        headers: { Authorization: 'Bearer caller-supplied', Origin: ORIGIN },
      }),
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls[0].authorization, 'Bearer caller-supplied');
    console.log('  GET keeps the caller Authorization and does not replace it');
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
    assert.strictEqual(res.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
    assert.strictEqual(calls.length, 0);
    console.log('  OPTIONS keeps ALLOWED_ORIGIN CORS and is not forwarded');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/status`, {
        method: 'GET',
        headers: { Origin: 'https://evil.example' },
      }),
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), null);
    console.log('  a non-allowed Origin does not receive CORS headers');
  }

  {
    resetCalls();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/feed?limit=30`, { method: 'GET' }),
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, `${HUB}/api/feed?limit=30`);
    assert.strictEqual(calls[0].authorization, null);
    console.log('  GET /api/feed is forwarded without a bearer');
  }

  {
    resetCalls();
    const res = await worker.fetch(new Request(`${ORIGIN}/taxii2/`, { method: 'GET' }), env);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, `${HUB}/taxii2/`);
    console.log('  GET /taxii2/ is forwarded without a bearer');
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

  console.log('hub-gateway: OK');
} finally {
  globalThis.fetch = originalFetch;
}
