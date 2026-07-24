import crypto from 'crypto';
import { ALGORITHMS } from './algorithms/registry.js';

export function deriveSeed(input) {
  if (input == null || input === '') {
    return crypto.randomBytes(16).toString('hex');
  }
  if (/^[0-9a-f]{8,64}$/i.test(input)) return input.toLowerCase();
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function seededRandom(seedHex) {
  let state = BigInt('0x' + seedHex.slice(0, 16));
  return () => {
    state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return Number(state >> 32n) / 0x100000000;
  };
}

export function pickAlgorithm(seedHex, slotId = 0, avoidFamilies = []) {
  const rand = seededRandom(seedHex + String(slotId));
  let pool = ALGORITHMS.filter((a) => a.cppSafe);
  if (avoidFamilies.length) {
    const filtered = pool.filter((a) => !avoidFamilies.includes(a.family));
    if (filtered.length) pool = filtered;
  }
  return pool[Math.floor(rand() * pool.length)];
}

export function pickKey(algorithm, seedHex, slotId = 0) {
  const rand = seededRandom(seedHex + ':key:' + String(slotId));
  const { min, max } = algorithm.keyRange;
  if (min === max) return min;
  return min + Math.floor(rand() * (max - min + 1));
}

export function createBuildProfile(options = {}) {
  const seed = deriveSeed(options.seed);
  const buildId = crypto.createHash('sha256').update(seed + Date.now().toString()).digest('hex').slice(0, 16);
  const chaffSeed = crypto.createHash('sha256').update(seed + ':chaff').digest('hex');

  const defaultAlg = pickAlgorithm(seed, 0);
  const defaultKey = pickKey(defaultAlg, seed, 0);

  return {
    version: '1.0.0',
    purpose: 'defensive-polymorphism',
    buildId,
    seed,
    createdAt: new Date().toISOString(),
    defaultAlgorithm: defaultAlg.name,
    defaultKey,
    chaffSeed,
    chainDepth: options.chainDepth || 3,
    algorithmPool: ALGORITHMS.map((a) => a.name),
    notes: [
      'Per-build diversity manifest — share with QA, never publish to attackers',
      'Each DM_PROTECT slot may use a different algorithm from the pool',
    ],
  };
}

export function pickForSlot(profile, slotId, recentFamilies = []) {
  const alg = pickAlgorithm(profile.seed, slotId, recentFamilies.slice(-2));
  const key = pickKey(alg, profile.seed, slotId);
  return { algorithm: alg.name, key, family: alg.family };
}