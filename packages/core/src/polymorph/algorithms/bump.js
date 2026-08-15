export function bumpAdd(bytes, key) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] + key) & 0xff;
  return out;
}

export function bumpSub(bytes, key) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] - key + 256) & 0xff;
  return out;
}