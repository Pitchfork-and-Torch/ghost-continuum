/**
 * Backup download is served from the file on disk.
 */
import assert from 'assert';
import fs from 'fs';
import http from 'http';
import { startHub } from '../packages/hub-api/src/server.js';

function request(port, method, path, payload) {
  return new Promise((resolve, reject) => {
    const body = payload == null ? null : JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          Host: `127.0.0.1:${port}`,
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({ status: res.statusCode, raw: Buffer.concat(chunks) });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
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
  const created = await request(started.port, 'POST', '/api/home/backup', { includeEvents: false });
  assert.strictEqual(created.status, 200);
  const saved = JSON.parse(created.raw.toString('utf8'));
  assert.strictEqual(saved.ok, true);
  assert.match(saved.downloadUrl, /^\/api\/home\/backup\/download\/backup-/);

  const downloaded = await request(started.port, 'GET', saved.downloadUrl);
  assert.strictEqual(downloaded.status, 200);
  const onDisk = fs.readFileSync(saved.path);
  assert.deepStrictEqual(downloaded.raw, onDisk);
  assert.match(downloaded.raw.toString('utf8'), /ghost-continuum-home-backup/);
  console.log('hub download: OK');
} finally {
  await new Promise((resolve) => started.server.close(resolve));
}
