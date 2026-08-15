import assert from 'assert';
import { buildContinuumStatus } from '../packages/continuum/src/nexus.js';
import { analyzeRequest } from '../packages/continuum/src/anti-analysis.js';
import { appendLedgerEntry, verifyLedger } from '../packages/trust/src/index.js';
import { enrichConfig } from '../packages/core/src/config.js';

const config = enrichConfig({ continuum: { morph: 'research' } });
const status = await buildContinuumStatus(config, { events: [] });
assert.ok(status.ok);
assert.ok(status.genome.poolSize >= 1);
assert.strictEqual(status.morph.id, 'research');

const analysis = analyzeRequest({ headers: { 'user-agent': 'curl/8.0' } }, '10.0.0.1');
assert.ok(analysis.score >= 1);

const starved = analyzeRequest({
  url: '/',
  headers: { 'user-agent': 'custom-lab/1.0' },
}, '10.0.0.2');
assert.ok(starved.signals.some((s) => s.kind === 'header-starved'));

const uuidUrl = '/dl?' + Array.from({ length: 4 }, (_, i) =>
  `id${i}=aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, '0')}`).join('&');
const blob = analyzeRequest({ url: uuidUrl, headers: { 'user-agent': 'Mozilla/5.0 Chrome' } }, '10.0.0.3');
assert.ok(blob.signals.some((s) => s.kind === 'uuid-blob'), 'uuid list should count as encoded blob');
assert.ok(blob.recommendBare);

const emu = analyzeRequest({ url: '/vmware/tools', headers: { 'user-agent': 'Mozilla/5.0' } }, '10.0.0.4');
assert.ok(emu.signals.some((s) => s.kind === 'anti-emu-path'));

appendLedgerEntry({ type: 'test-ledger', plane: 'hub', score: 1 });
const verify = verifyLedger();
assert.ok(verify.ok);

console.log('continuum verify: OK', { efficacy: status.metrics.deceptionEfficacyScore, ledger: verify.entries });