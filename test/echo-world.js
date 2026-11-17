/**
 * Narrative world ids are checked before they are used in a file path.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);

if (process.env.GC_ECHO_TEST !== '1') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-echo-'));
  let status = 1;
  try {
    const result = spawnSync(process.execPath, [here], {
      env: {
        ...process.env,
        GC_ECHO_TEST: '1',
        GC_HOME: home,
        HOME: home,
        USERPROFILE: home,
      },
      stdio: 'inherit',
    });
    status = result.status === null ? 1 : result.status;
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
  process.exit(status);
}

const assert = (await import('node:assert')).default;

const { isSafeWorldId, loadEchoWorld, saveEchoWorld, createEchoWorld, ECHO_DIR } = await import(
  '../packages/narrative/src/echo.js'
);

const home = process.env.GC_HOME;
assert.ok(path.resolve(ECHO_DIR).startsWith(path.resolve(home) + path.sep));

assert.strictEqual(isSafeWorldId('default'), true);
assert.strictEqual(isSafeWorldId('lab.alpha_1'), true);
assert.strictEqual(isSafeWorldId('A_b-1.ok'), true);
assert.strictEqual(isSafeWorldId('a'.repeat(64)), true);
assert.strictEqual(isSafeWorldId('.'), true);
assert.strictEqual(isSafeWorldId('..'), false);
assert.strictEqual(isSafeWorldId('...'), false);
assert.strictEqual(isSafeWorldId('foo..bar'), false);
assert.strictEqual(isSafeWorldId('../etc/passwd'), false);
assert.strictEqual(isSafeWorldId('a/b'), false);
assert.strictEqual(isSafeWorldId('a\\b'), false);
assert.strictEqual(isSafeWorldId('has space'), false);
assert.strictEqual(isSafeWorldId(''), false);
assert.strictEqual(isSafeWorldId('a'.repeat(65)), false);
assert.strictEqual(isSafeWorldId(12), false);

for (const worldId of ['..', '../etc/passwd', 'foo..bar', 'a/../../x']) {
  assert.throws(() => loadEchoWorld(worldId), /Invalid world id/);
  assert.throws(() => saveEchoWorld({ id: worldId }), /Invalid world id/);
}
assert.strictEqual(fs.existsSync(ECHO_DIR), false);
assert.strictEqual(fs.existsSync(path.join(path.dirname(home), 'etc', 'passwd.json')), false);

const id = 'lab.alpha_1';
const saved = saveEchoWorld(createEchoWorld(id));
assert.strictEqual(saved.id, id);
const file = path.join(ECHO_DIR, `${id}.json`);
assert.strictEqual(fs.existsSync(file), true);
const rel = path.relative(ECHO_DIR, file);
assert.strictEqual(rel.includes('..'), false);
assert.strictEqual(path.isAbsolute(rel), false);
assert.strictEqual(loadEchoWorld(id).id, id);
console.log('echo-world: OK');
