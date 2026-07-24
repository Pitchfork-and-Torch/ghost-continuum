const store = new Map();

export function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.value);

  return Promise.resolve(fn()).then((value) => {
    store.set(key, { ts: Date.now(), value });
    return value;
  });
}

export function invalidate(key) {
  store.delete(key);
}

export function invalidatePrefix(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}