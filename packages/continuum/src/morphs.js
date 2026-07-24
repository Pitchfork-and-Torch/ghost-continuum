export const SENTINEL_MORPHS = {
  stealth: {
    id: 'stealth',
    label: 'Stealth',
    description: 'Minimal footprint, bare responses, quiet logging',
    logging: 'quiet',
    rotationMultiplier: 0.5,
    hideHeaders: true,
    trapAggression: 0.3,
    icon: 'wolf',
    visual: {
      accent: '#00e5ff',
      fogDensity: 0.09,
      bloom: 0.75,
      connectionStyle: 'dim',
      guardianNodes: false,
      mapTint: 'cyan-dim',
    },
  },
  research: {
    id: 'research',
    label: 'Research',
    description: 'Maximum telemetry for analysis and genome fitness',
    logging: 'verbose',
    rotationMultiplier: 1,
    hideHeaders: false,
    trapAggression: 0.5,
    icon: 'scope',
    visual: {
      accent: '#00e5ff',
      fogDensity: 0.05,
      bloom: 1.1,
      connectionStyle: 'neon',
      guardianNodes: true,
      mapTint: 'cyan',
    },
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    description: 'Fast rotation, trap-heavy, time-wasting focus',
    logging: 'normal',
    rotationMultiplier: 2,
    hideHeaders: false,
    trapAggression: 0.9,
    icon: 'cross',
    visual: {
      accent: '#e040fb',
      fogDensity: 0.03,
      bloom: 1.45,
      connectionStyle: 'neon',
      guardianNodes: true,
      mapTint: 'magenta',
    },
  },
  forensic: {
    id: 'forensic',
    label: 'Forensic',
    description: 'Immutable ledger mode, sealed exports, replay prep',
    logging: 'sealed',
    rotationMultiplier: 0.8,
    hideHeaders: false,
    trapAggression: 0.4,
    ledgerRequired: true,
    icon: 'search',
    visual: {
      accent: '#69f0ae',
      fogDensity: 0.04,
      bloom: 0.95,
      connectionStyle: 'dashed',
      guardianNodes: true,
      mapTint: 'green',
    },
  },
};

export function resolveMorph(config) {
  const id = config?.continuum?.morph || 'research';
  return SENTINEL_MORPHS[id] || SENTINEL_MORPHS.research;
}

export function morphRotationThreshold(base, config) {
  const morph = resolveMorph(config);
  return Math.max(1, Math.floor(base / (morph.rotationMultiplier || 1)));
}