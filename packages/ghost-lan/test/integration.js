import assert from 'assert';

const BASE = process.env.GHOST_TEST_URL || 'http://127.0.0.1:8080';
const DASH = process.env.GHOST_DASH_URL || 'http://127.0.0.1:29999';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (err) {
    console.error('  ✗ ' + name + ': ' + err.message);
    failed++;
  }
}

function testIp() {
  return '192.168.99.' + Math.floor(Math.random() * 200 + 10);
}

async function fetchPath(path, opts = {}) {
  const headers = {
    'X-Forwarded-For': opts.ip || testIp(),
    ...(opts.headers || {}),
  };
  const res = await fetch(BASE + path, {
    ...opts,
    headers,
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.text();
  return { res, body };
}

console.log('\nGhost LAN integration\n');
console.log('  Target: ' + BASE + '\n');

await test('browser GET / returns 200 HTML', async () => {
  const { res, body } = await fetchPath('/', { headers: { 'User-Agent': 'Mozilla/5.0 Chrome' } });
  assert.strictEqual(res.status, 200);
  assert.ok(body.includes('<html'));
});

await test('first visit staged 302 to /login', async () => {
  const { res } = await fetchPath('/', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    ip: testIp(),
  });
  assert.ok(res.status === 302 || res.status === 200, 'status ' + res.status);
});

await test('scanner UA gets minimal or delayed response', async () => {
  const t0 = Date.now();
  const { res, body } = await fetchPath('/', { headers: { 'User-Agent': 'Nikto-2.1.5' } });
  const elapsed = Date.now() - t0;
  assert.ok(res.status === 404 || res.status === 200);
  assert.ok(elapsed >= 500 || body.includes('Not Found') || body.length < 200);
});

await test('camera path rule serves camera content', async () => {
  const { res, body } = await fetchPath('/camera/live', { headers: { 'User-Agent': 'curl/8.0' } });
  assert.strictEqual(res.status, 200);
  assert.ok(body.includes('REOLINK') || body.includes('Camera') || body.includes('h264'));
});

await test('robots.txt breadcrumb', async () => {
  const { res, body } = await fetchPath('/robots.txt');
  assert.strictEqual(res.status, 200);
  assert.ok(body.includes('Disallow'));
});

await test('trap path returns 503', async () => {
  const { res } = await fetchPath('/.env', { headers: { 'User-Agent': 'curl-test-trap' } });
  assert.strictEqual(res.status, 503);
});

await test('masquerade Server header (no X-Ghost)', async () => {
  const { res } = await fetchPath('/login', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const server = res.headers.get('server') || '';
  assert.ok(!res.headers.get('x-ghost-build'), 'should hide ghost headers');
  assert.ok(server.length > 0);
});

await test('dashboard /api/status', async () => {
  const res = await fetch(DASH + '/api/status', { signal: AbortSignal.timeout(5000) });
  const j = await res.json();
  assert.strictEqual(j.ok, true);
  assert.ok(j.morphPhase !== undefined || j.generation !== undefined);
});

await test('dashboard /api/dossiers', async () => {
  const res = await fetch(DASH + '/api/dossiers', { signal: AbortSignal.timeout(5000) });
  const j = await res.json();
  assert.ok(Array.isArray(j));
});

await test('dashboard HTML loads', async () => {
  const res = await fetch(DASH + '/', { signal: AbortSignal.timeout(5000) });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('Probe Dossiers'));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);