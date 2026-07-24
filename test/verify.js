import assert from 'assert';
import { normalizeEvent, mergeEventStreams, scoreEventType } from '../packages/core/src/events.js';
import { isAuthorizedTarget, filterOperators, validateMissionTargets } from '../packages/core/src/scope.js';
import { verifyManifest, sealManifest, buildManifest } from '../packages/core/src/manifest.js';
import { verifyPolymorphRoundtrip } from '../packages/core/src/polymorph/verify.js';
import { polymorphBytes } from '../packages/core/src/polymorph/index.js';
import { enrichConfig, getPrimaryDomain } from '../packages/core/src/config.js';
import { BUNDLED_GHOST_LAN } from '../packages/core/src/paths.js';
import fs from 'fs';
import { cached, invalidatePrefix } from '../packages/hub-api/src/cache.js';
import { cellEndpoints, resolveCellRoot } from '../packages/hub-api/src/adapters/cell-wire.js';
import { listBuiltinProbes } from '../packages/hub-api/src/adapters/builtin-validator.js';
import { listScopeProbes } from '../packages/hub-api/src/adapters/scope-cell.js';
import { isDemoMode } from '../packages/hub-api/src/adapters/demo.js';

assert.strictEqual(scoreEventType('trap-trip'), 6);
assert.strictEqual(scoreEventType('honeypot-http'), 5);

const e = normalizeEvent({ type: 'honeypot-http', ip: '10.0.0.1', ts: 1 });
assert.strictEqual(e.plane, 'lan');

const merged = mergeEventStreams(
  [{ plane: 'hub', type: 'test', ts: 2 }],
  [{ plane: 'lan', type: 'honeypot-http', ts: 3, ip: '1.2.3.4' }],
);
assert.ok(merged.length >= 2);

assert.ok(isAuthorizedTarget('127.0.0.1', { allowedDomains: [] }).ok);
assert.ok(isAuthorizedTarget('192.168.1.1', { allowedDomains: [] }).ok);
assert.ok(!isAuthorizedTarget('8.8.8.8', { allowedDomains: [] }).ok);
assert.ok(isAuthorizedTarget('example.com', { allowedDomains: ['example.com'] }).ok);

const ops = filterOperators(['recon', 'exploiter', 'analyst'], {
  blockExploitOperators: true,
  defensiveOperators: ['recon', 'scanner', 'analyst'],
});
assert.deepStrictEqual(ops, ['recon', 'analyst']);

const scope = validateMissionTargets([{ host: 'evil.com' }], { allowedDomains: ['example.com'] });
assert.ok(!scope.ok);

const manifest = sealManifest(buildManifest([{ path: 'test', sha256: 'abc', size: 1 }]));
assert.ok(verifyManifest(manifest).ok);

const poly = verifyPolymorphRoundtrip();
assert.ok(poly.ok, `polymorph failed: ${JSON.stringify(poly)}`);

const demo = polymorphBytes('dm-test', 1, 'legal-scope');
assert.ok(demo.buildId);
assert.ok(demo.chain.length >= 1);

let cacheHits = 0;
const v1 = await cached('t', 5000, async () => { cacheHits++; return 42; });
const v2 = await cached('t', 5000, async () => { cacheHits++; return 42; });
assert.strictEqual(v1, 42);
assert.strictEqual(v2, 42);
assert.strictEqual(cacheHits, 1);
invalidatePrefix('t');

const ep = cellEndpoints(3333);
assert.ok(ep.ping.includes('/api/health'));
assert.strictEqual(resolveCellRoot({}), '');

const cfgLocal = enrichConfig({});
assert.strictEqual(cfgLocal.edgeMode, 'local');
assert.ok(fs.existsSync(cfgLocal.paths.ghostLan));
assert.ok(cfgLocal.paths.ghostLan.includes('ghost-lan'));

const cfg = enrichConfig({ primaryDomain: 'example.com', useLocalEdge: false });
assert.strictEqual(getPrimaryDomain(cfg), 'example.com');
assert.ok(cfg.edgeStatusUrl.includes('example.com'));
assert.ok(cfg.tripwireUrl.includes('example.com'));
assert.ok(fs.existsSync(BUNDLED_GHOST_LAN));

const probes = listBuiltinProbes(cfg);
assert.ok(probes.length >= 3);
assert.strictEqual(listScopeProbes(cfg).length, 3);
assert.ok(isDemoMode({ demoMode: true }));

const audit = normalizeEvent({ type: 'scope-probe-start', ts: 3 });
assert.strictEqual(audit.plane, 'audit');

console.log('ghost-continuum verify: OK', { polymorph: poly.passed, probes: probes.length });