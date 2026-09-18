export function nibbleSwap(bytes) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out[i] = ((b & 0x0f) << 4) | ((b & 0xf0) >> 4);
  }
  return out;
}