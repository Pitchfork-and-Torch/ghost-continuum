import assert from 'assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gcHome = mkdtempSync(path.join(tmpdir(), 'gc-override-'));
const userHome = mkdtempSync(path.join(tmpdir(), 'gc-userprofile-'));

const child = `
import os from 'os';
import path from 'path';
import { dataHome } from './packages/core/src/home.js';
import { GC_DIR, CONFIG_PATH } from './packages/core/src/config.js';
import { GHOST_DIR } from './packages/ghost-lan/src/config.js';
import { LEDGER_DIR } from './packages/trust/src/merkle.js';

const home = dataHome();
if (home === os.homedir()) {
  console.error('GC_HOME did not override the OS home');
  process.exit(2);
}
if (GC_DIR !== path.join(home, '.ghost-continuum')) process.exit(3);
if (CONFIG_PATH !== path.join(GC_DIR, 'config.json')) process.exit(4);
if (GHOST_DIR !== path.join(home, '.ghost-lan')) process.exit(5);
if (!LEDGER_DIR.startsWith(home)) process.exit(6);
if (GC_DIR.startsWith(os.homedir())) process.exit(7);
console.log('home override ok');
`;

try {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
    cwd: root,
    env: {
      ...process.env,
      GC_HOME: gcHome,
      HOME: userHome,
      USERPROFILE: userHome,
    },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
  }
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /home override ok/);
  console.log('  ✓ GC_HOME overrides the OS home for data paths');
} finally {
  rmSync(gcHome, { recursive: true, force: true });
  rmSync(userHome, { recursive: true, force: true });
}

console.log('\nHome override checks passed.\n');
