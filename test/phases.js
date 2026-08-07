import assert from 'assert';
import { runNlQuery } from '../packages/hub-api/src/nl-query.js';
import { createShellSession, execShellLine } from '../packages/narrative/src/shell.js';
import { generateEcosystem, createEchoWorld } from '../packages/narrative/src/index.js';
import { publishStrategy, federatedRecommendations } from '../packages/planes/src/phantom-mesh.js';
import { buildSessionTimeline } from '../packages/continuum/src/time-machine.js';
import { buildMapNodes, simulatedMapNodes } from '../packages/continuum/src/map-data.js';
import { applyViewLayout, buildRichInsights, VIEW_MODES } from '../packages/continuum/src/map-layouts.js';
import { weaveDeceptionStory } from '../packages/hub-api/src/story-weaver.js';
import { toTaxiiCollection } from '../packages/trust/src/taxii.js';
import { evaluateTriggers } from '../packages/continuum/src/triggers.js';
import { enrichConfig } from '../packages/core/src/config.js';

const events = [
  { ts: Date.now(), type: 'honeypot-http', ip: '10.0.0.5', score: 5, plane: 'lan', detail: { credential: true, ua: 'curl/8' } },
  { ts: Date.now() - 1000, type: 'trap-trip', ip: '10.0.0.5', score: 6, plane: 'lan' },
  { ts: Date.now() - 2000, type: 'rotate', ip: null, score: 3, plane: 'lan' },
];

const nl = runNlQuery('show credential dumping attempts', events, []);
assert.ok(nl.matchCount >= 1, 'NL query should match credential events');

const session = createShellSession('10.0.0.9', enrichConfig({}));
const help = await execShellLine(session, 'help', enrichConfig({}));
assert.ok(help.output.includes('status'));

const world = createEchoWorld('test-world');
const docs = generateEcosystem(world, { persist: false });
assert.ok(docs.emails.length >= 1);

const timeline = buildSessionTimeline(events);
assert.ok(timeline.branches.length >= 1);

const taxii = toTaxiiCollection(events);
assert.ok(taxii.objects.length >= 1);

const cfg = enrichConfig({ continuum: { planes: { phantomMesh: true } } });
const pub = publishStrategy(cfg, { championArchetype: 'router-admin', avgFitness: 12, engagements: 3 });
assert.ok(pub.ok);

const fed = federatedRecommendations([{ avgFitness: 10, championArchetype: 'nas', topTraits: { verbosity: 0.5 } }]);
assert.ok(fed.nodes === 1);

const triggers = evaluateTriggers(enrichConfig({}), { score: 5, type: 'honeypot-http', ip: '10.0.0.1' }, { championFitness: 5, totalEngagements: 25 });
assert.ok(Array.isArray(triggers));

const map = buildMapNodes(events);
assert.ok(map.nodes.length >= 2, 'map nodes from events');
assert.ok(map.connections.length >= 1, 'map connections by IP');
assert.ok(map.insights[0]?.text || map.insights[0], 'rich map insights');
const sessionLayout = applyViewLayout(map.nodes, 'session', map.clusters);
assert.ok(sessionLayout.every((n) => n.layoutMode === 'session'), 'session view layout');
assert.ok(Object.keys(VIEW_MODES).length >= 5, 'view modes defined');
assert.ok(buildRichInsights(map.nodes, map.clusters).length >= 1, 'client insights builder');
const sim = simulatedMapNodes();
assert.ok(sim.simulated && sim.nodes.length >= 4, 'simulated map for empty state');

const story = weaveDeceptionStory(events, { morph: { label: 'Research' }, genome: { champion: { archetype: 'router-admin', generation: 2, fitness: 42 } } });
assert.ok(story.narrative.includes('hour'), 'story weaver produces narrative');

const { maximizeEfficacy } = await import('../packages/hub-api/src/efficacy-boost.js');
const boost = await maximizeEfficacy({ personas: ['router-admin'], continuum: { morph: 'research', evolution: { populationSize: 6 } } }, { target: 90 });
assert.ok(boost.after >= 90, `efficacy boost should reach 90+ (got ${boost.after})`);

console.log('phases verify: OK', { nl: nl.intent, branches: timeline.branches.length, mapNodes: map.nodes.length });