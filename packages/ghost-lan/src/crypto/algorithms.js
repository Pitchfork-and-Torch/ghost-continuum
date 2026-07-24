export const ALGORITHMS = {
  BUMP_ADD: {
    encode: (b, k) => { const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = (b[i] + k) & 255; return o; },
    decode: (b, k) => { const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = (b[i] - k + 256) & 255; return o; },
    family: 'bump', keyRange: [1, 254],
  },
  BUMP_SUB: {
    encode: (b, k) => { const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = (b[i] - k + 256) & 255; return o; },
    decode: (b, k) => { const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = (b[i] + k) & 255; return o; },
    family: 'bump', keyRange: [1, 254],
  },
  XOR_FWD: {
    encode: (bytes, key) => {
      const o = new Uint8Array(bytes.length);
      let k = key;
      for (let i = 0; i < bytes.length; i++) { o[i] = bytes[i] ^ k; k = (k + 17 + i) & 255 || 1; }
      return o;
    },
    decode(bytes, key) { return this.encode(bytes, key); },
    family: 'xor', keyRange: [1, 255],
  },
  XOR_BWD: {
    encode: (bytes, key) => {
      const o = new Uint8Array(bytes.length);
      let k = key;
      for (let i = bytes.length - 1; i >= 0; i--) { o[i] = bytes[i] ^ k; k = (k + 31 + i) & 255 || 1; }
      return o;
    },
    decode(bytes, key) { return this.encode(bytes, key); },
    family: 'xor', keyRange: [1, 255],
  },
  ROT_L: {
    encode: (bytes, key) => {
      const n = key & 7; const o = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) { const b = bytes[i]; o[i] = ((b << n) | (b >> (8 - n))) & 255; }
      return o;
    },
    family: 'rotate', keyRange: [1, 7],
  },
  ROT_R: {
    encode: (bytes, key) => {
      const n = key & 7; const o = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) { const b = bytes[i]; o[i] = ((b >> n) | (b << (8 - n))) & 255; }
      return o;
    },
    family: 'rotate', keyRange: [1, 7],
  },
  NIBBLE_SWAP: {
    encode: (bytes) => {
      const o = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) o[i] = ((bytes[i] & 15) << 4) | ((bytes[i] & 240) >> 4);
      return o;
    },
    decode(bytes) { return this.encode(bytes); },
    family: 'nibble', keyRange: [0, 0],
  },
  POS_ADD: {
    encode: (bytes, key) => {
      const o = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) o[i] = (bytes[i] + key + i) & 255;
      return o;
    },
    decode: (bytes, key) => {
      const o = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) o[i] = (bytes[i] - key - i + 256) & 255;
      return o;
    },
    family: 'position', keyRange: [1, 64],
  },
};

ALGORITHMS.ROT_L.decode = (bytes, key) => ALGORITHMS.ROT_R.encode(bytes, key);
ALGORITHMS.ROT_R.decode = (bytes, key) => ALGORITHMS.ROT_L.encode(bytes, key);

export const ALGO_NAMES = Object.keys(ALGORITHMS);