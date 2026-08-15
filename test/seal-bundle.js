/**
 * Sealed incident bundles - hash-after-write, verify, standalone HTML replay.
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { writeIncidentBundle } from '../packages/core/src/manifest.js';
import {
  sealBundleDirectory,
  verifyBundleDirectory,
  verifySealedTarget,
} from '../packages/core/src/seal-bundle.js';
import { renderSealedReplayHtml } from '../packages/continuum/src/sealed-replay.js';
import { createSealedIncident } from '../packages/hub-api/src/seal-incident.js';

function ok(name) {
  console.log(`  ✓ ${name}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-seal-test-'));

{
  const dir = path.join(tmp, 'hash-after-write');
  fs.mkdirSync(dir);
  writeIncidentBundle(dir, {
    'status.json': { ok: true, label: 'unit' },
    'events.jsonl': '{"type":"trap-trip","ip":"10.0.0.8","ts":1}\n',
  });
  const manifest = sealBundleDirectory(dir, ['status.json', 'events.jsonl']);
  assert.equal(manifest.v, 2);
  assert.ok(/^[a-f0-9]{64}$/.test(manifest.manifestHash), 'manifest hash is sha256');
  assert.ok(manifest.items.every((i) => i.path === path.basename(i.path)), 'portable basenames');
  assert.ok(manifest.items.every((i) => i.sha256 && i.sha256.length === 64), 'file hashes present');
  const verified = verifyBundleDirectory(dir);
  assert.equal(verified.ok, true);
  assert.equal(verified.mismatches.length, 0);
  ok('hash-after-write + verify');
}

{
  const dir = path.join(tmp, 'tamper');
  fs.mkdirSync(dir);
  writeIncidentBundle(dir, { 'events.jsonl': '{"type":"honeypot-http"}\n' });
  sealBundleDirectory(dir, ['events.jsonl']);
  fs.appendFileSync(path.join(dir, 'events.jsonl'), '{"type":"tamper"}\n');
  const verified = verifyBundleDirectory(dir);
  assert.equal(verified.ok, false);
  assert.ok(verified.mismatches.some((m) => m.path === 'events.jsonl'));
  ok('tamper fails verify');
}

{
  const html = renderSealedReplayHtml({
    label: 'xss-check',
    events: [{ type: '<script>alert(1)</script>', ip: '10.0.0.1', ts: 1_700_000_000_000, plane: 'lan', score: 5 }],
    manifest: { manifestHash: 'abc', items: [{ path: 'events.jsonl', size: 1, sha256: '00' }] },
    timeline: { branches: [{ id: 'main', events: [{}] }] },
  });
  assert.ok(html.includes('<!DOCTYPE html'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('\\u003cscript\\u003e') || html.includes('&lt;script&gt;'));
  assert.ok(html.includes('ghost-continuum verify'));
  ok('HTML replay escapes event types');
}

{
  const dir = path.join(tmp, 'full-seal');
  const events = [
    { type: 'honeypot-http', ip: '10.0.0.8', ts: Date.now() - 1000, score: 5, plane: 'lan' },
    { type: 'rotate', ip: null, ts: Date.now(), score: 3, plane: 'lan' },
  ];
  const sealed = await createSealedIncident({
    label: 'unit-seal',
    events,
    status: { demo: true },
    dir,
    archive: true,
  });
  assert.ok(sealed.ok);
  assert.ok(fs.existsSync(path.join(dir, 'MANIFEST.json')));
  assert.ok(fs.existsSync(sealed.htmlPath));
  const html = fs.readFileSync(sealed.htmlPath, 'utf8');
  assert.ok(/sealed forensic replay/i.test(html), 'replay.html names the product');
  const verified = await verifySealedTarget(dir);
  assert.equal(verified.ok, true, JSON.stringify(verified.mismatches));
  if (sealed.archivePath && fs.existsSync(sealed.archivePath)) {
    const arch = await verifySealedTarget(sealed.archivePath);
    assert.equal(arch.ok, true, arch.error || JSON.stringify(arch.mismatches));
    ok('createSealedIncident + directory/archive verify');
  } else {
    ok('createSealedIncident + directory verify (archive skipped)');
  }
}

{
  const cli = path.join(process.cwd(), 'bin/ghost-continuum.js');
  const help = spawnSync(process.execPath, [cli, 'help'], { encoding: 'utf8' });
  assert.ok(help.stdout.includes('seal') && help.stdout.includes('verify'));
  const dir = path.join(tmp, 'cli-verify');
  await createSealedIncident({
    label: 'cli',
    events: [{ type: 'trap-trip', ip: '127.0.0.1', ts: Date.now(), score: 6, plane: 'lan' }],
    dir,
    archive: false,
  });
  const verify = spawnSync(process.execPath, [cli, 'verify', dir], { encoding: 'utf8' });
  assert.equal(verify.status, 0, verify.stderr || verify.stdout);
  assert.ok(/OK/i.test(verify.stdout));
  ok('CLI verify on a sealed directory');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nSealed bundle checks passed.\n');
