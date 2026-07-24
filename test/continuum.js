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

appendLedgerEntry({ type: 'test-ledger', plane: 'hub', score: 1 });
const verify = verifyLedger();
assert.ok(verify.ok);

console.log('continuum verify: OK', { efficacy: status.metrics.deceptionEfficacyScore, ledger: verify.entries });