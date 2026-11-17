const store = new Map();

// Parallel hub polls (/api/status, /api/feed, holo-map) used to each run
// buildStatus. Share one in-flight call, and keep the value until ttlMs.
export function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && Object.hasOwn(hit, 'value') && now - hit.ts < ttlMs) {
    return Promise.resolve(hit.value);
  }
  if (hit && hit.pending) return hit.pending;

  const gen = (hit?.gen || 0) + 1;
  const pending = Promise.resolve()
    .then(fn)
    .then(
      (value) => {
        const current = store.get(key);
        if (current && current.gen === gen) {
          store.set(key, { ts: Date.now(), value, gen });
        }
        return value;
      },
      (err) => {
        const current = store.get(key);
        if (current && current.gen === gen) store.delete(key);
        throw err;
      },
    );
  store.set(key, { ts: 0, pending, gen });
  return pending;
}

export function invalidate(key) {
  store.delete(key);
}

export function invalidatePrefix(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}