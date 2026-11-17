import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  fileCacheLimits,
  fileCacheStats,
  readCachedFile,
  resetFileCache,
} from '../packages/hub-api/src/file-cache.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-fcache-'));
const saved = { ...fileCacheLimits };

function restore() {
  Object.assign(fileCacheLimits, saved);
  resetFileCache();
}

try {
  const file = path.join(dir, 'note.txt');
  fs.writeFileSync(file, 'one');
  resetFileCache();
  const first = readCachedFile(file);
  const second = readCachedFile(file);
  assert.strictEqual(first, second, 'unchanged file returns the cached buffer');
  assert.strictEqual(fileCacheStats().hits, 1);
  assert.strictEqual(fileCacheStats().misses, 1);

  await new Promise((r) => setTimeout(r, 20));
  fs.writeFileSync(file, 'two!');
  const third = readCachedFile(file);
  assert.notStrictEqual(third, first);
  assert.strictEqual(third.toString('utf8'), 'two!');
  assert.strictEqual(fileCacheStats().misses, 2, 'mtime or size change must miss');

  fileCacheLimits.maxFiles = 2;
  resetFileCache();
  const a = path.join(dir, 'a.txt');
  const b = path.join(dir, 'b.txt');
  const c = path.join(dir, 'c.txt');
  fs.writeFileSync(a, 'a');
  fs.writeFileSync(b, 'b');
  fs.writeFileSync(c, 'c');
  readCachedFile(a);
  readCachedFile(b);
  readCachedFile(c);
  assert.strictEqual(fileCacheStats().files, 2, 'cache stays at the file cap');
  const missesBefore = fileCacheStats().misses;
  readCachedFile(a);
  assert.strictEqual(fileCacheStats().misses, missesBefore + 1, 'evicted file is read again');

  const big = path.join(dir, 'big.bin');
  fs.writeFileSync(big, Buffer.alloc(1024 * 1024, 7));
  fileCacheLimits.maxFiles = saved.maxFiles;
  resetFileCache();
  const bareStart = process.hrtime.bigint();
  for (let i = 0; i < 40; i++) fs.readFileSync(big);
  const bareMs = Number(process.hrtime.bigint() - bareStart) / 1e6;
  const cacheStart = process.hrtime.bigint();
  for (let i = 0; i < 40; i++) readCachedFile(big);
  const cacheMs = Number(process.hrtime.bigint() - cacheStart) / 1e6;
  assert.strictEqual(fileCacheStats().hits, 39);
  assert.strictEqual(fileCacheStats().bytesFromDisk, 1024 * 1024, 'only the first read loads the file');
  console.log('  file-cache 1MB x40', {
    bareMs: Number(bareMs.toFixed(2)),
    cacheMs: Number(cacheMs.toFixed(2)),
    bareBytes: 40 * 1024 * 1024,
    diskBytes: fileCacheStats().bytesFromDisk,
  });
  console.log('file-cache: OK');
} finally {
  restore();
  fs.rmSync(dir, { recursive: true, force: true });
}
