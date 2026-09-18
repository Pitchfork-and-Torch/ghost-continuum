export function rotateLeft(bytes, key) {
  const out = new Uint8Array(bytes.length);
  const n = key & 7;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out[i] = ((b << n) | (b >> (8 - n))) & 0xff;
  }
  return out;
}

export function rotateRight(bytes, key) {
  const out = new Uint8Array(bytes.length);
  const n = key & 7;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out[i] = ((b >> n) | (b << (8 - n))) & 0xff;
  }
  return out;
}