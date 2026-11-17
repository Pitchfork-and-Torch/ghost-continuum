/**
 * Mirage container spawn uses an argument list and a strict image ref.
 */
import assert from 'assert';
import fs from 'fs';
import {
  acceptedMirageImage,
  containerRunArgs,
  spawnDecoy,
} from '../packages/planes/src/mirage-core.js';

const allowed = [
  'alpine:3.19',
  'alpine',
  'docker.io/library/alpine:3.19',
  'ghcr.io/org/name:1.2.3',
  'a',
];

const rejected = [
  '',
  'Alpine:3.19',
  '-alpine',
  'alpine;id',
  'alpine:3.19 && id',
  'alpine:$(id)',
  'alpine latest',
  'localhost:5000/alpine:3.19',
  '../alpine',
  'alpine:',
  ':latest',
  'alpine:3.19\n',
  'alpine:3.19;rm',
];

for (const image of allowed) {
  assert.strictEqual(acceptedMirageImage(image), true, image);
}
for (const image of rejected) {
  assert.strictEqual(acceptedMirageImage(image), false, JSON.stringify(image));
}

const args = containerRunArgs('alpine:3.19', 'dm-mirage-test', 8899);
assert.ok(Array.isArray(args));
assert.strictEqual(args.at(-4), 'alpine:3.19');
assert.strictEqual(args.at(0), 'run');
assert.ok(args.includes('-p'));
assert.strictEqual(args[args.indexOf('-p') + 1], '127.0.0.1:8899:80');
assert.strictEqual(containerRunArgs('alpine;id', 'dm-mirage-test', 8899), null);
assert.strictEqual(containerRunArgs('alpine:3.19', 'bad name', 8899), null);
assert.strictEqual(containerRunArgs('alpine:3.19', 'dm-mirage-test', 0), null);
assert.strictEqual(containerRunArgs('alpine:3.19', 'dm-mirage-test', 1.5), null);

const skipped = spawnDecoy(
  { continuum: { planes: { mirageCore: false, mirageImage: 'alpine;id' } } },
  {},
);
assert.strictEqual(skipped.ok, false);
assert.strictEqual(skipped.skipped, true);

const src = fs.readFileSync(new URL('../packages/planes/src/mirage-core.js', import.meta.url), 'utf8');
assert.ok(src.includes('execFileSync(runtime, args'));
assert.ok(src.includes("execFileSync(rt, ['info']"));
assert.ok(src.includes("execFileSync(runtime, ['rm', '-f', decoyId]"));
assert.ok(!/\bexecSync\s*\(/.test(src));

console.log('mirage-core: OK');
