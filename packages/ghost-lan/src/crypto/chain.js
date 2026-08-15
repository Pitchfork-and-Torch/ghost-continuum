import crypto from 'crypto';
import { ALGORITHMS, ALGO_NAMES } from './algorithms.js';

function seededRandom(seedHex, slot) {
  let state = BigInt('0x' + crypto.createHash('sha256').update(`${seedHex}:${slot}`).digest('hex').slice(0, 16));
  return () => {
    state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return Number(state >> 32n) / 0x100000000;
  };
}

export function pickChain(seed, slotId, usedFamilies = [], depth = 3) {
  const chain = [];
  const avoid = [...usedFamilies];
  const rand = seededRandom(seed, slotId);

  for (let i = 0; i < depth; i++) {
    let pool = ALGO_NAMES.filter((n) => !avoid.includes(ALGORITHMS[n].family));
    if (!pool.length) pool = ALGO_NAMES;
    const name = pool[Math.floor(rand() * pool.length)];
    const alg = ALGORITHMS[name];
    const [min, max] = alg.keyRange;
    const key = min === max ? min : min + Math.floor(rand() * (max - min + 1));
    chain.push({ algorithm: name, key, family: alg.family });
    avoid.push(alg.family);
  }
  return chain;
}

export function encodeChain(bytes, chain) {
  let b = new Uint8Array(bytes);
  for (const step of chain) b = ALGORITHMS[step.algorithm].encode(b, step.key);
  return b;
}

export function decodeChain(bytes, chain) {
  let b = new Uint8Array(bytes);
  for (const step of [...chain].reverse()) b = ALGORITHMS[step.algorithm].decode(b, step.key);
  return b;
}