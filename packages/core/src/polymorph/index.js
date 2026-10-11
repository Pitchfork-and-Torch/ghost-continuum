import { createBuildProfile } from './diversity.js';
import { pickChain, encodeChain } from './chain.js';

export { ALGORITHMS, getAlgorithm, listAlgorithmNames } from './algorithms/registry.js';
export { pickChain, encodeChain, decodeChain } from './chain.js';
export { deriveSeed, createBuildProfile, pickForSlot, pickAlgorithm, pickKey } from './diversity.js';
export { embedScribble, decodeScribbleFromHtml } from './scribble.js';
export { generateChaff, emitChaffModule } from './generator.js';

export function polymorphBytes(seed, slotId, plaintext, depth = 3) {
  const profile = createBuildProfile({ seed });
  const chain = pickChain(profile, slotId, [], depth);
  const bytes = new TextEncoder().encode(String(plaintext));
  return { chain, encoded: encodeChain(bytes, chain), buildId: profile.buildId };
}