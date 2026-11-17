export const IP_HIT_WINDOW_MS = 60_000;
export const IP_HIT_CAP = 5000;

/** Per-address counter with a time window and a hard map cap. */
export function allowIpHit(map, ip, {
  now = Date.now(),
  windowMs = IP_HIT_WINDOW_MS,
  max = 30,
  cap = IP_HIT_CAP,
} = {}) {
  let bucket = map.get(ip);
  if (!bucket || typeof bucket !== 'object' || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
  }
  bucket.count += 1;
  if (map.has(ip)) map.delete(ip);
  map.set(ip, bucket);
  while (map.size > cap) {
    const oldest = map.keys().next().value;
    if (oldest == null) break;
    map.delete(oldest);
  }
  return bucket.count <= max;
}
