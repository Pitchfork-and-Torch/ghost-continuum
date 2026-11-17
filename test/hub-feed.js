/**
 * The feed limit stays inside 1..150 and does not require the full status payload.
 */
import assert from 'assert';
import http from 'http';
import { clampFeedLimit, startHub } from '../packages/hub-api/src/server.js';

assert.strictEqual(clampFeedLimit('99999'), 150);
assert.strictEqual(clampFeedLimit('0'), 1);
assert.strictEqual(clampFeedLimit('-4'), 1);
assert.strictEqual(clampFeedLimit('nope'), 100);
assert.strictEqual(clampFeedLimit(null), 100);
assert.strictEqual(clampFeedLimit('12'), 12);

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET', headers: { Host: `127.0.0.1:${port}` } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const started = await startHub({
  hubPort: 0,
  hubWatchIntervalMs: 0,
  writeRateLimitMax: 0,
  demoMode: true,
  continuum: { corePlanes: { ghostLan: false, edge: false, audit: false } },
});

try {
  const wide = await get(started.port, '/api/feed?limit=99999');
  assert.strictEqual(wide.status, 200);
  assert.strictEqual(wide.body.ok, true);
  assert.ok(Array.isArray(wide.body.feed));
  assert.ok(wide.body.feed.length >= 1 && wide.body.feed.length <= 150);
  assert.ok(!Object.hasOwn(wide.body, 'planes'));
  assert.ok(!Object.hasOwn(wide.body, 'continuum'));

  const one = await get(started.port, '/api/feed?limit=1');
  assert.strictEqual(one.body.feed.length, 1);

  const fallback = await get(started.port, '/api/feed?limit=nope');
  assert.ok(fallback.body.feed.length >= 1 && fallback.body.feed.length <= 100);
  assert.ok(fallback.body.feed.length >= one.body.feed.length);
  console.log('hub feed: OK');
} finally {
  await new Promise((resolve) => started.server.close(resolve));
}
