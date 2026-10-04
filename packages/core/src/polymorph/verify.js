import { createBuildProfile } from './diversity.js';
import { pickChain, encodeChain, decodeChain } from './chain.js';

export function verifyPolymorphRoundtrip() {
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < 12; i++) {
    const profile = createBuildProfile({ seed: `dm-verify-${i}` });
    const chain = pickChain(profile, i + 1, [], 3);
    const plain = new TextEncoder().encode(`roundtrip-${i}`);
    const encoded = encodeChain(plain, chain);
    const decoded = decodeChain(encoded, chain);
    if (new TextDecoder().decode(decoded) === `roundtrip-${i}`) passed++;
    else failed++;
  }

  return { ok: failed === 0, passed, failed, engine: 'polymorph-chains' };
}