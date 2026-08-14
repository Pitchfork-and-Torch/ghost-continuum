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
import {
  hubTokenOk,
  parseHostHeader,
  allowedHubHosts,
  extraHubHosts,
  hubHostOk,
  hubOriginOk,
  hubHostIsLoopback,
  hubApiAuthOk,
  readCookie,
  hubTokenCookieHeader,
  hubSecurityHeaders,
  HUB_TOKEN_COOKIE,
} from '../packages/hub-api/src/safe.js';
import { cellEndpoints, resolveCellRoot } from '../packages/hub-api/src/adapters/cell-wire.js';
import { listBuiltinProbes } from '../packages/hub-api/src/adapters/builtin-validator.js';
import { listScopeProbes } from '../packages/hub-api/src/adapters/scope-cell.js';
import { isDemoMode } from '../packages/hub-api/src/adapters/demo.js';
import { runHubWatchJobs, resetHubWatchJobs } from '../packages/hub-api/src/watch-jobs.js';

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

assert.strictEqual(hubTokenOk({ headers: {} }, {}), true);
assert.strictEqual(hubTokenOk({ headers: { authorization: 'Bearer secret' } }, { hubToken: 'secret' }), true);
assert.strictEqual(hubTokenOk({ headers: { authorization: 'Bearer wrong' } }, { hubToken: 'secret' }), false);
assert.strictEqual(hubTokenOk({ headers: {} }, { hubToken: 'secret' }), false);
assert.strictEqual(hubTokenOk({ headers: { cookie: `${HUB_TOKEN_COOKIE}=secret` } }, { hubToken: 'secret' }), true);
assert.strictEqual(hubTokenOk({ headers: { cookie: `${HUB_TOKEN_COOKIE}=wrong` } }, { hubToken: 'secret' }), false);
assert.strictEqual(readCookie({ headers: { cookie: 'a=1; gc-hub-token=secret' } }, HUB_TOKEN_COOKIE), 'secret');
assert.ok(hubTokenCookieHeader('secret').includes('HttpOnly'));
assert.ok(hubTokenCookieHeader('secret').includes('SameSite=Strict'));
assert.ok(!hubTokenCookieHeader('secret').includes('__GC_HUB_TOKEN'));

const sec = hubSecurityHeaders({ 'Content-Type': 'application/json' });
assert.strictEqual(sec['X-Content-Type-Options'], 'nosniff');
assert.strictEqual(sec['X-Frame-Options'], 'DENY');
assert.strictEqual(sec['Referrer-Policy'], 'no-referrer');
assert.strictEqual(sec['Cross-Origin-Resource-Policy'], 'same-origin');
assert.strictEqual(sec['Content-Type'], 'application/json');

assert.strictEqual(hubHostIsLoopback({ headers: { host: '127.0.0.1:30000' } }), true);
assert.strictEqual(hubHostIsLoopback({ headers: { host: 'ghost.jonbailey.xyz' } }), false);
assert.strictEqual(hubApiAuthOk({ headers: { host: '127.0.0.1:30000' } }, {}), true);
assert.strictEqual(hubApiAuthOk({ headers: { host: 'ghost.jonbailey.xyz' } }, { hubAllowedHosts: ['ghost.jonbailey.xyz'] }), false);
assert.strictEqual(hubApiAuthOk({ headers: { host: 'ghost.jonbailey.xyz', authorization: 'Bearer secret' } }, { hubToken: 'secret', hubAllowedHosts: ['ghost.jonbailey.xyz'] }), true);
assert.strictEqual(hubApiAuthOk({ headers: { host: '127.0.0.1:30000' } }, { hubToken: 'secret' }), false);

assert.strictEqual(parseHostHeader('127.0.0.1:30000'), '127.0.0.1');
assert.strictEqual(parseHostHeader('localhost'), 'localhost');
assert.strictEqual(parseHostHeader('[::1]:30000'), '[::1]');
assert.strictEqual(parseHostHeader(''), '');
assert.ok(allowedHubHosts({}).has('127.0.0.1'));
assert.ok(allowedHubHosts({ hubAllowedHosts: ['ghost.jonbailey.xyz'] }).has('ghost.jonbailey.xyz'));
assert.deepStrictEqual(extraHubHosts({}), []);
assert.deepStrictEqual(extraHubHosts({ hubAllowedHosts: ['ghost.jonbailey.xyz'] }), ['ghost.jonbailey.xyz']);
assert.ok(!allowedHubHosts({}).has('evil.example'));
assert.strictEqual(hubHostOk({ headers: { host: '127.0.0.1:30100' } }, {}), true);
assert.strictEqual(hubHostOk({ headers: { host: 'evil.example' } }, {}), false);
assert.strictEqual(hubHostOk({ headers: {} }, {}), false);
assert.strictEqual(hubHostOk({ headers: { host: 'ghost.jonbailey.xyz' } }, { hubAllowedHosts: ['ghost.jonbailey.xyz'] }), true);
assert.strictEqual(hubOriginOk({ headers: {} }, {}), true);
assert.strictEqual(hubOriginOk({ headers: { origin: 'http://127.0.0.1:30000' } }, {}), true);
assert.strictEqual(hubOriginOk({ headers: { origin: 'https://evil.example' } }, {}), false);
assert.strictEqual(hubOriginOk({ headers: { origin: 'null' } }, {}), false);

assert.strictEqual(typeof runHubWatchJobs, 'function');
assert.strictEqual(typeof resetHubWatchJobs, 'function');
const watchSrc = fs.readFileSync(new URL('../packages/hub-api/src/server.js', import.meta.url), 'utf8');
const watchSlice = watchSrc.split("url.pathname === '/api/threat/watch'")[1] || '';
const watchHandler = watchSlice.slice(0, 280);
assert.ok(watchHandler.includes('threatWatch()'), 'GET /api/threat/watch must return a read-only payload');
assert.ok(!watchHandler.includes('tickQuietHours'), 'GET /api/threat/watch must not tick quiet hours');
assert.ok(!watchHandler.includes('sendNotification'), 'GET /api/threat/watch must not send notifications');
assert.ok(!watchHandler.includes('runHubWatchJobs'), 'GET /api/threat/watch must not run hub watch jobs');

const landingHtml = fs.readFileSync(new URL('../landing/index.html', import.meta.url), 'utf8');
assert.ok(landingHtml.includes('<!DOCTYPE html>'), 'landing/index.html must be a real HTML document');
assert.ok(landingHtml.includes('</html>'), 'landing/index.html must be a complete HTML document');
assert.ok(!landingHtml.includes('PLACEHOLDER_WILL_FAIL'), 'landing/index.html must not be a stub');
assert.ok(landingHtml.length > 8000, 'landing/index.html looks truncated');

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
