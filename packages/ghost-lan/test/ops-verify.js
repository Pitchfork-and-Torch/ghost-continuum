import assert from 'assert';
import { classifyProbe, responseMode } from '../src/ops/classify.js';
import { resolveRules, timePersona } from '../src/ops/rules.js';
import { isTrapPath } from '../src/ops/traps.js';
import { applyGradualMorph } from '../src/ops/morph.js';
import { breadcrumbResponse } from '../src/ops/breadcrumbs.js';
import { buildHttpResponse } from '../src/ops/respond.js';
import { isLoopback } from '../src/ops/traps.js';
import { DEFAULT_CONFIG } from '../src/config.js';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (err) {
    console.error('  ✗ ' + name + ': ' + err.message);
    process.exitCode = 1;
  }
}

const cfg = { ...DEFAULT_CONFIG, siteSeed: 'test' };

console.log('\nGhost LAN ops verify\n');

await test('classify scanner UA', () => {
  const r = classifyProbe({ method: 'GET', url: '/', headers: { 'user-agent': 'Nikto' } });
  assert.strictEqual(r.class, 'scanner');
});

await test('classify browser UA', () => {
  const r = classifyProbe({ method: 'GET', url: '/', headers: { 'user-agent': 'Mozilla/5.0 Chrome' } });
  assert.strictEqual(r.class, 'browser');
});

await test('rule camera path', () => {
  const r = resolveRules({ method: 'GET', url: '/camera/live', headers: {} }, cfg);
  assert.strictEqual(r.persona, 'ip-camera');
});

await test('trap path detects .env', () => {
  assert.strictEqual(isTrapPath('/.env', cfg), true);
});

await test('gradual morph phases', () => {
  const s0 = { ...applyGradualMorph(cfg, { ...cfg, generation: 0, persona: 'router-admin', ports: [8080], morphPhase: 0, totalHits: 0 }, 'hit'), generation: 0 };
  const s1 = applyGradualMorph(cfg, { ...s0, generation: 0, persona: 'router-admin', ports: [8080], morphPhase: 0, totalHits: 1, buildId: 'abc', day: '2026-01-01' }, 'hit');
  assert.strictEqual(s1.morphPhase, 1);
  assert.strictEqual(s1.persona, 'router-admin');
});

await test('trap morph skips gradual', () => {
  const s = applyGradualMorph(cfg, { generation: 2, persona: 'router-admin', ports: [8080], morphPhase: 1, totalHits: 0 }, 'trap');
  assert.strictEqual(s.morphPhase, 0);
  assert.notStrictEqual(s.persona, undefined);
});

await test('breadcrumb robots.txt', () => {
  const b = breadcrumbResponse('/robots.txt', { buildId: 'abc123456789' }, cfg);
  assert.ok(b.body.includes('Disallow'));
});

await test('time persona wraps midnight', () => {
  const p = timePersona({
    timePersonas: [{ from: 18, to: 8, persona: 'ip-camera' }],
  });
  assert.ok(p === 'ip-camera' || p === null);
});

await test('loopback is not silenced by default', () => {
  assert.strictEqual(isLoopback('127.0.0.1'), true);
  assert.strictEqual(isLoopback('10.0.0.5'), false);
});

await test('camera path upgrades curl bare to full html', async () => {
  const state = {
    generation: 1,
    persona: 'plex-server',
    buildId: 'abc123456789',
    hiddenPath: '/.ghost-test',
  };
  const req = { method: 'GET', url: '/camera/live', headers: { 'user-agent': 'curl/8.0' } };
  const built = await buildHttpResponse(req, '10.0.0.5', state, cfg);
  assert.ok(built.body.includes('REOLINK'));
  assert.ok(built.headers.Server?.length > 0);
});

console.log(`\n${passed} ops tests passed\n`);