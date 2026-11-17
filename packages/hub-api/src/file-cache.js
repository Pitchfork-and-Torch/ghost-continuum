import fs from 'fs';

// Hub UI files are read on the request path. three.module.js alone is about
// 1.2 MB. Keep a small mtime cache so a refresh does not hit the disk again
// until the file actually changes.
export const fileCacheLimits = {
  maxFiles: 48,
  maxFileBytes: 3 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
};

const cache = new Map();
let hits = 0;
let misses = 0;
let bytesFromDisk = 0;

export function fileCacheStats() {
  return { hits, misses, files: cache.size, bytesFromDisk };
}

export function resetFileCache() {
  cache.clear();
  hits = 0;
  misses = 0;
  bytesFromDisk = 0;
}

export function readCachedFile(filePath) {
  const stat = fs.statSync(filePath);
  const hit = cache.get(filePath);
  if (hit && hit.mtimeNs === stat.mtimeNs && hit.size === stat.size) {
    cache.delete(filePath);
    cache.set(filePath, hit);
    hits += 1;
    return hit.buf;
  }

  misses += 1;
  const buf = fs.readFileSync(filePath);
  bytesFromDisk += buf.length;
  if (buf.length <= fileCacheLimits.maxFileBytes) {
    cache.set(filePath, { mtimeNs: stat.mtimeNs, size: stat.size, buf });
    evict();
  }
  return buf;
}

function evict() {
  let total = 0;
  for (const entry of cache.values()) total += entry.buf.length;
  while (cache.size > fileCacheLimits.maxFiles || total > fileCacheLimits.maxTotalBytes) {
    const oldest = cache.keys().next().value;
    if (oldest == null) return;
    total -= cache.get(oldest).buf.length;
    cache.delete(oldest);
    if (cache.size === 0) return;
  }
}
