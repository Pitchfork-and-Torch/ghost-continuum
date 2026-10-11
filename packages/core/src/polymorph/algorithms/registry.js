import { bumpAdd, bumpSub } from './bump.js';
import { xorForward, xorBackward } from './xor.js';
import { rotateLeft, rotateRight } from './rotate.js';
import { nibbleSwap } from './nibble.js';
import { addPosition, subPosition } from './position.js';

/** @typedef {{ name: string, family: string, encode: (bytes: Uint8Array, key: number) => Uint8Array, decode: (bytes: Uint8Array, key: number) => Uint8Array, keyRange: { min: number, max: number }, cppSafe: boolean }} Algorithm */

/** @type {Algorithm[]} */
export const ALGORITHMS = [
  {
    name: 'BUMP_ADD',
    family: 'bump',
    encode: bumpAdd,
    decode: bumpSub,
    keyRange: { min: 1, max: 254 },
    cppSafe: true,
  },
  {
    name: 'BUMP_SUB',
    family: 'bump',
    encode: bumpSub,
    decode: bumpAdd,
    keyRange: { min: 1, max: 254 },
    cppSafe: true,
  },
  {
    name: 'XOR_FWD',
    family: 'xor',
    encode: xorForward,
    decode: xorForward,
    keyRange: { min: 1, max: 255 },
    cppSafe: true,
  },
  {
    name: 'XOR_BWD',
    family: 'xor',
    encode: xorBackward,
    decode: xorBackward,
    keyRange: { min: 1, max: 255 },
    cppSafe: true,
  },
  {
    name: 'ROT_L',
    family: 'rotate',
    encode: rotateLeft,
    decode: rotateRight,
    keyRange: { min: 1, max: 7 },
    cppSafe: true,
  },
  {
    name: 'ROT_R',
    family: 'rotate',
    encode: rotateRight,
    decode: rotateLeft,
    keyRange: { min: 1, max: 7 },
    cppSafe: true,
  },
  {
    name: 'NIBBLE_SWAP',
    family: 'nibble',
    encode: nibbleSwap,
    decode: nibbleSwap,
    keyRange: { min: 0, max: 0 },
    cppSafe: true,
  },
  {
    name: 'POS_ADD',
    family: 'position',
    encode: addPosition,
    decode: subPosition,
    keyRange: { min: 1, max: 64 },
    cppSafe: true,
  },
];

export function getAlgorithm(name) {
  const alg = ALGORITHMS.find((a) => a.name === name);
  if (!alg) throw new Error(`Unknown algorithm: ${name}`);
  return alg;
}

export function listAlgorithmNames() {
  return ALGORITHMS.map((a) => a.name);
}