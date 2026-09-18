import assert from 'assert';
import { derivePorts, buildGenerationId, dnsChaffHosts, fnv1a } from '../src/topology.js';
import { pickChain, encodeChain, decodeChain } from '../src/crypto/chain.js';
import { freshState, syncDay } from '../src/state.js';
import { polymorphicResponse } from '../src/persona.js';
import { DEFAULT_CONFIG } from '../src/config.js';

let passed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (err) {
    console.error('  ✗ ' + name);
    console.error('    ' + err.message);
    process.exitCode = 1;
  }
}

console.log('\nGhost LAN verify\n');

test('fnv1a is deterministic', () => {
  assert.strictEqual(fnv1a('ghost'), fnv1a('ghost'));
  assert.notStrictEqual(fnv1a('a'), fnv1a('b'));
});

test('derivePorts returns unique ports in range', () => {
  const ports = derivePorts('test-seed', 0, 5);
  assert.strictEqual(ports.length, 5);
  assert.strictEqual(new Set(ports).size, 5);
  for (const p of ports) {
    assert.ok(p >= 40000 && p < 60000);
  }
});

test('generation id stable per day+gen', () => {
  const a = buildGenerationId('ghost-lan', 3);
  const b = buildGenerationId('ghost-lan', 3);
  assert.strictEqual(a, b);
  assert.strictEqual(a.length, 16);
});

test('crypto chain round-trips', () => {
  const chain = pickChain('ghost-lan', 42, [], 4);
  const input = new TextEncoder().encode('probe-marker');
  const encoded = encodeChain(input, chain);
  const decoded = decodeChain(encoded, chain);
  assert.strictEqual(new TextDecoder().decode(decoded), 'probe-marker');
});

test('freshState rotates personas', () => {
  const s0 = freshState(DEFAULT_CONFIG, 0);
  const s1 = freshState(DEFAULT_CONFIG, 1);
  assert.notStrictEqual(s0.persona, s1.persona);
  assert.ok(s0.ports.length >= DEFAULT_CONFIG.obviousPorts.length);
});

test('polymorphic response includes ghost headers', () => {
  const state = freshState(DEFAULT_CONFIG, 2);
  const { html, headers } = polymorphicResponse(state, '192.168.1.50', { ...DEFAULT_CONFIG, hideGhostHeaders: false });
  assert.ok(html.includes('</body>'));
  assert.ok(headers['X-Ghost-Build']);
  assert.ok(headers['X-Ghost-Persona']);
});

test('dns chaff generates hostnames', () => {
  const hosts = dnsChaffHosts('ghost-lan', '192.168.1.100', 4);
  assert.strictEqual(hosts.length, 4);
  assert.ok(hosts[0].name.endsWith('.lan'));
});

test('syncDay preserves generation on same day', () => {
  const state = freshState(DEFAULT_CONFIG, 5);
  const synced = syncDay(state, DEFAULT_CONFIG);
  assert.strictEqual(synced.generation, 5);
});

console.log(`\n${passed} tests passed\n`);