import assert from 'assert';
import { createGenome, validateGenome, mutate, crossover, evolveGeneration } from '../packages/genome/src/index.js';
import { engagementSignal, applyFitness } from '../packages/genome/src/fitness.js';
import { applyMorphFragments } from '../packages/genome/src/morph.js';

const g = createGenome({ personality: { archetype: 'router-admin' } });
assert.ok(validateGenome(g).ok);

const signal = engagementSignal({ type: 'honeypot-http', detail: { returning: true, dwellMs: 5000 } });
const fit = applyFitness(g, signal);
assert.ok(fit.fitness.score > 0);

const child = mutate(g);
assert.notStrictEqual(child.id, g.id);
assert.ok(child.generation > g.generation);

const hybrid = crossover(g, child);
assert.ok(hybrid.lineage.length >= 1);

const html = '<!DOCTYPE html><html><head><title>t</title></head><body><p>test</p></body></html>';
const morphed = applyMorphFragments(html, g, { generation: 1, ip: '10.0.0.5' });
assert.ok(morphed.includes('body'));

const evo = evolveGeneration([g, child, hybrid], { populationSize: 4, retireBelow: 1 });
assert.ok(evo.pool.length >= 3);
assert.ok(evo.champion);

console.log('genome verify: OK', { champion: evo.champion.id.slice(0, 12), fitness: evo.champion.fitness?.score });