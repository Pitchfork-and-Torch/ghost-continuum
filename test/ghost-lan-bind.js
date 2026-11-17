/**
 * Setup tells the operator that decoy ports listen on the LAN.
 */
import assert from 'assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = fs.readFileSync(path.join(root, 'packages/ghost-lan/README.md'), 'utf8');
assert.match(readme, /other machines on the LAN can reach them/);
assert.match(readme, /dashboard stays on `127\.0\.0\.1`/);

const child = spawnSync(process.execPath, ['bin/setup.js'], {
  cwd: root,
  env: process.env,
  encoding: 'utf8',
});
assert.strictEqual(child.status, 0, child.stderr || child.stdout);
assert.match(child.stdout, /reachable from the LAN/);
assert.match(child.stdout, /dashboard stays on 127\.0\.0\.1/);
console.log('ghost-lan bind: OK');
