export function xorForward(bytes, key) {
  const out = new Uint8Array(bytes.length);
  let k = key;
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ k;
    k = (k + 17 + i) & 0xff || 1;
  }
  return out;
}

export function xorBackward(bytes, key) {
  const out = new Uint8Array(bytes.length);
  let k = key;
  for (let i = bytes.length - 1; i >= 0; i--) {
    out[i] = bytes[i] ^ k;
    k = (k + 31 + i) & 0xff || 1;
  }
  return out;
}