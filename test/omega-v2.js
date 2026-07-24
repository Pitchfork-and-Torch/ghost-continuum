/**
 * Ghost Continuum v2.0 OMEGA IMMUNE — unit checks for new modules.
 */
import assert from 'assert';
import { evolveNsga2, objectiveVector, dominates, fitnessLandscape } from '../packages/genome/src/nsga2.js';
import { seedPool } from '../packages/genome/src/pool.js';
import {
  buildHolographicScene,
  omegaDemoScene,
  buildGenomeLeaderboard,
  buildPhylogeny,
} from '../packages/continuum/src/holographic-map.js';
import { predictThreatCones, simulateMorphWhatIf } from '../packages/continuum/src/predictive.js';
import { SENTINEL_MORPHS } from '../packages/continuum/src/morphs.js';
import { injectDemoCampaign, buildTimelineMarkers } from '../packages/hub-api/src/demo-campaign.js';

function ok(name) {
  console.log(`  ✓ ${name}`);
}

// NSGA-II
{
  const pool = seedPool(undefined, 8).map((g) => ({ ...g, status: 'active', fitness: { score: Math.random() * 50, engagements: 1 } }));
  const result = evolveNsga2(pool, { populationSize: 8, seed: 'test-omega' });
  assert.ok(result.champion, 'champion exists');
  assert.equal(result.algorithm, 'nsga2');
  assert.ok(Array.isArray(result.paretoFront));
  const o = objectiveVector(result.champion);
  assert.equal(o.length, 4);
  ok('NSGA-II evolution cycle');
}

{
  assert.equal(dominates([1, 1, 1, 1], [0, 0, 0, 0]), true);
  assert.equal(dominates([0, 1, 0, 0], [1, 0, 0, 0]), false);
  ok('Pareto dominates');
}

{
  const pool = seedPool(undefined, 4);
  const land = fitnessLandscape(pool);
  assert.ok(land.points.length >= 1);
  assert.ok(land.grid.length > 0);
  ok('Fitness landscape');
}

// Holographic map
{
  const demo = omegaDemoScene({ morph: 'research' });
  assert.ok(demo.nodes.length >= 10);
  assert.ok(demo.nodes.some((n) => n.label === 'SCANNER-47'));
  assert.ok(demo.nodes.some((n) => n.label === 'COMPROMISED-EDGE-04'));
  assert.ok(demo.connections.length >= 5);
  assert.ok(demo.stats.activeIntrusionPaths >= 1);
  ok('Omega demo scene (visual bible nodes)');
}

{
  const scene = buildHolographicScene([
    { id: 'e1', ts: Date.now(), plane: 'edge', type: 'scanner-peak', ip: '1.2.3.4', score: 4 },
    { id: 'e2', ts: Date.now() - 1000, plane: 'lan', type: 'trap-trip', ip: '1.2.3.4', score: 6 },
  ]);
  assert.ok(scene.nodes.find((n) => n.isCore));
  assert.ok(scene.legend.colors.length === 4);
  ok('buildHolographicScene from events');
}

{
  const board = buildGenomeLeaderboard(seedPool(undefined, 5), 3);
  assert.ok(board.length <= 3);
  assert.equal(board[0].rank, 1);
  const phy = buildPhylogeny(seedPool(undefined, 3));
  assert.ok(phy.nodes.length >= 1);
  ok('Chad leaderboard + phylogeny');
}

// Predictive
{
  const pred = predictThreatCones([
    { ts: Date.now(), plane: 'edge', type: 'scanner-peak', ip: '9.9.9.9', score: 4, detail: { ua: 'nmap' } },
    { ts: Date.now() - 1000, plane: 'edge', type: 'auth-fail', ip: '9.9.9.9', score: 5, detail: { credential: true } },
  ]);
  assert.ok(pred.ok);
  assert.ok(pred.cones.length >= 1);
  const what = simulateMorphWhatIf('research', 'aggressive', [], { score: 80 });
  assert.ok(typeof what.projectedEfficacy === 'number');
  ok('Predictive cones + what-if');
}

// Morph visuals
{
  for (const id of ['stealth', 'research', 'aggressive', 'forensic']) {
    assert.ok(SENTINEL_MORPHS[id].visual, `${id} has visual language`);
  }
  ok('Morph visual signatures');
}

// Demo campaign (no persist)
{
  const camp = injectDemoCampaign({ persist: false });
  assert.ok(camp.injected >= 8);
  assert.ok(camp.markers.length >= 3);
  const marks = buildTimelineMarkers(camp.events);
  assert.ok(marks.length >= 1);
  ok('Demo campaign + timeline markers');
}

console.log('\nOmega v2 checks passed.\n');
