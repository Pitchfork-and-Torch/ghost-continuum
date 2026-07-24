import { normalizeEvent } from '../../../core/src/events.js';

export function isDemoMode(config) {
  return config.demoMode === true || process.env.DM_DEMO === '1';
}

export function demoFeed() {
  const now = Date.now();
  return [
    normalizeEvent({
      plane: 'lan',
      type: 'honeypot-http',
      ip: '10.0.0.42',
      ts: now - 120000,
      detail: { demo: true, persona: 'nas-demo' },
      source: 'demo',
    }),
    normalizeEvent({
      plane: 'edge',
      type: 'dm-honeypot-click',
      ip: '203.0.113.7',
      ts: now - 90000,
      score: 5,
      detail: { demo: true },
      source: 'demo',
    }),
    normalizeEvent({
      plane: 'audit',
      type: 'scope-probe-complete',
      ts: now - 45000,
      detail: { demo: true, probe: 'lan-self-scan' },
      source: 'demo',
    }),
    normalizeEvent({
      plane: 'ops',
      type: 'demo-mode',
      ts: now - 30000,
      detail: { note: 'Sensors offline — showing sample feed. Run npm run init to configure.' },
      source: 'demo',
    }),
  ];
}

export function demoPlanes() {
  return {
    lan: { armed: false, persona: 'demo-nas', totalHits: 3, generation: 1, buildId: 'demo-lan-001' },
    edge: { armed: false, passive: true, buildId: 'demo-edge-001', generation: 2 },
    audit: { armed: false, mode: 'builtin-demo' },
  };
}