export function addPosition(bytes, key) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] + key + i) & 0xff;
  return out;
}

export function subPosition(bytes, key) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] - key - i + 256) & 0xff;
  return out;
}