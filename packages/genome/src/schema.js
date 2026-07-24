import crypto from 'crypto';

export const TRAIT_BOUNDS = {
  verbosity: [0, 1],
  delayBias: [0, 5000],
  breadcrumbDensity: [0, 1],
  masqueradeStrength: [0, 1],
  chaffMultiplier: [0.5, 3],
  rotationSensitivity: [1, 10],
};

export const ARCHETYPES = [
  'synology-nas',
  'router-admin',
  'ip-camera',
  'plex-server',
  'homeassistant',
  'legacy-scada',
  'dev-staging',
];

export const FRAGMENT_STYLES = [
  'scramble-comments',
  'shuffle-meta',
  'inject-decoy-paths',
  'rotate-css-vars',
  'split-hidden-markers',
];

export const PERSONALITY_TONES = ['corporate', 'casual', 'urgent', 'neglected', 'paranoid'];

/**
 * @param {object} partial
 * @returns {object}
 */
export function createGenome(partial = {}) {
  const id = partial.id || `genome_${crypto.randomBytes(6).toString('hex')}`;
  const archetype = partial.personality?.archetype || ARCHETYPES[0];

  return {
    v: 1,
    id,
    bornAt: partial.bornAt || Date.now(),
    generation: partial.generation ?? 0,
    lineage: partial.lineage || [],
    traits: {
      verbosity: 0.55,
      delayBias: 800,
      breadcrumbDensity: 0.35,
      masqueradeStrength: 0.75,
      chaffMultiplier: 1,
      rotationSensitivity: 3,
      ...partial.traits,
    },
    personality: {
      archetype,
      tone: 'corporate',
      loreSeed: `lore-${id.slice(-8)}`,
      ...partial.personality,
    },
    fragments: {
      headerStyle: 'nginx',
      htmlMutation: 'scramble-comments',
      responseTemplate: archetype,
      ...partial.fragments,
    },
    fitness: {
      score: 0,
      engagements: 0,
      dwellMs: 0,
      commandsDetected: 0,
      lateralAttempts: 0,
      depthScore: 0,
      lastEngagementAt: null,
      ...partial.fitness,
    },
    status: partial.status || 'active',
  };
}

export function validateGenome(genome) {
  if (!genome?.id || genome.v !== 1) return { ok: false, reason: 'invalid genome version' };
  for (const [key, [min, max]] of Object.entries(TRAIT_BOUNDS)) {
    const v = genome.traits?.[key];
    if (typeof v !== 'number' || v < min || v > max) {
      return { ok: false, reason: `trait ${key} out of bounds` };
    }
  }
  return { ok: true };
}