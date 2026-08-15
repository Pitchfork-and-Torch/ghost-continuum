import { getAlgorithm } from './algorithms/registry.js';
import { pickForSlot } from './diversity.js';

/** Multi-pass encoding: each slot gets a unique algorithm chain */
export function pickChain(profile, slotId, familyHistory = [], depth = 3) {
  const chain = [];
  const usedFamilies = [...familyHistory];

  for (let i = 0; i < depth; i++) {
    const pick = pickForSlot(profile, slotId * 100 + i, usedFamilies);
    chain.push(pick);
    usedFamilies.push(pick.family);
  }

  return chain;
}

export function encodeChain(plaintextBytes, chain) {
  let bytes = new Uint8Array(plaintextBytes);
  for (const step of chain) {
    const alg = getAlgorithm(step.algorithm);
    bytes = alg.encode(bytes, step.key);
  }
  return bytes;
}

export function decodeChain(encodedBytes, chain) {
  let bytes = new Uint8Array(encodedBytes);
  for (const step of [...chain].reverse()) {
    const alg = getAlgorithm(step.algorithm);
    bytes = alg.decode(bytes, step.key);
  }
  return bytes;
}