import assert from 'assert';
import { computeEfficacy, computeReadiness, mergeLivePlaneState } from '../packages/continuum/src/metrics.js';
import { collectPlaneStatus } from '../packages/planes/src/registry.js';
import { enrichConfig } from '../packages/core/src/config.js';

const config = enrichConfig({
  continuum: {
    morph: 'research',
    corePlanes: { ghostLan: true, edge: true, audit: true },
    planes: { phantomMesh: true, deepVeil: true, mirageCore: true },
    narrative: { enabled: true },
  },
});

const planes = collectPlaneStatus(config);
const events = [
  { plane: 'lan', type: 'hit', score: 5, ip: '10.0.0.1', ts: Date.now() },
  { plane: 'edge', type: 'trap-trip', score: 4, ip: '10.0.0.2', ts: Date.now() },
  { plane: 'edge', type: 'hit', score: 6, ip: '10.0.0.2', ts: Date.now(), detail: { efficacyMaximizer: true } },
];

const full = computeEfficacy(events, [], { planes, morph: { id: 'research' } });
const partial = computeEfficacy(events, [], {
  planes: mergeLivePlaneState(planes, {
    lan: { enabled: true, armed: true },
    edge: { enabled: false, armed: false },
    audit: { enabled: false, armed: false },
  }),
  morph: { id: 'research' },
});
assert.ok(full.deceptionEfficacyScore > 0, 'score when stack armed');
assert.strictEqual(partial.engagements, 1, 'disabled planes drop out of engagement scope');
assert.ok(partial.setupReadiness < full.setupReadiness, 'readiness drops when planes disabled');
assert.ok(partial.deceptionEfficacyScore < full.deceptionEfficacyScore, 'live score drops with setup');

const allOff = mergeLivePlaneState(
  planes.map((p) => ({ ...p, enabled: false, armed: false })),
  null,
);
const off = computeEfficacy(events, [], { planes: allOff, morph: { id: 'research' } });
assert.strictEqual(off.deceptionEfficacyScore, 0, 'score zero when nothing enabled');

console.log('metrics verify: OK', { full: full.deceptionEfficacyScore, partial: partial.deceptionEfficacyScore });