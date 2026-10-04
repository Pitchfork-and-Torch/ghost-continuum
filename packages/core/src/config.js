import fs from 'fs';
import os from 'os';
import path from 'path';
import { BUNDLED_GHOST_LAN, GC_ROOT } from './paths.js';

export const GC_DIR = path.join(os.homedir(), '.ghost-continuum');
export const CONFIG_PATH = path.join(GC_DIR, 'config.json');
export const EVENTS_PATH = path.join(GC_DIR, 'events.jsonl');
export const MANIFEST_PATH = path.join(GC_DIR, 'MANIFEST.json');

const DEFAULTS = {
  hubPort: 30000,
  ghostLanPort: 29999,
  edgeLocalPort: 30001,
  cellPort: 3333,
  cellRoot: '',
  primaryDomain: '',
  useLocalEdge: true,
  edgeStatusUrl: '',
  edgeStatusKey: '',
  tripwireUrl: '',
  cloudflareWorkerName: '',
  demoMode: false,
  useBuiltinValidator: true,
  paths: {
    ghostLan: BUNDLED_GHOST_LAN,
    defensiveMarble: '',
  },
  allowedDomains: ['localhost', '127.0.0.1', 'ghost-continuum-local'],
  allowedPrivateCidrs: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
  defensiveOperators: ['recon', 'scanner', 'analyst'],
  blockExploitOperators: true,
  continuum: {
    morph: 'research',
    evolution: { enabled: true, cycleEvery: 25, populationSize: 8 },
    trust: { ledger: true },
    narrative: { enabled: false, worldId: 'default' },
    corePlanes: { ghostLan: true, edge: true, audit: true },
    planes: { phantomMesh: false, deepVeil: false, mirageCore: false, phantomMeshPeers: [], mirageImage: 'alpine:3.19' },
    triggers: { mirageFitnessThreshold: 40 },
    plugins: [],
  },
  narrative: {
    llmEndpoint: 'http://127.0.0.1:11434',
    llmModel: 'llama3.2',
    llmTimeoutMs: 8000,
  },
};

export function getPrimaryDomain(config) {
  const env = (process.env.GC_PRIMARY_DOMAIN || process.env.DM_PRIMARY_DOMAIN)?.trim();
  if (env) return env;
  if (config.primaryDomain?.trim()) return config.primaryDomain.trim();
  return config.allowedDomains?.find((d) => d.includes('.') && !d.startsWith('127.'))?.trim() || '';
}

export function resolveEdgeUrls(config) {
  const domain = getPrimaryDomain(config);
  const localPort = config.edgeLocalPort || 30001;
  const useLocal = config.useLocalEdge !== false && !domain;

  if (useLocal) {
    const base = `http://127.0.0.1:${localPort}`;
    return {
      edgeStatusUrl: config.edgeStatusUrl?.trim() || `${base}/.__dm/status`,
      tripwireUrl: config.tripwireUrl?.trim() || `${base}/.__dm/tripwire`,
      domain: 'ghost-continuum-local',
      mode: 'local',
    };
  }

  const edgeStatusUrl =
    config.edgeStatusUrl?.trim() ||
    (domain ? `https://${domain}/.__dm/status` : '');
  const tripwireUrl =
    config.tripwireUrl?.trim() ||
    (domain ? `https://${domain}/.__dm/tripwire` : '');

  return { edgeStatusUrl, tripwireUrl, domain, mode: domain ? 'remote' : 'none' };
}

export function resolvePaths(config) {
  const ghostLan =
    process.env.GC_GHOST_LAN_ROOT?.trim() ||
    config.paths?.ghostLan?.trim() ||
    BUNDLED_GHOST_LAN;

  return {
    ghostLan: fs.existsSync(ghostLan) ? ghostLan : BUNDLED_GHOST_LAN,
    defensiveMarble:
      process.env.GC_DEFENSIVE_MARBLE_ROOT?.trim() ||
      config.paths?.defensiveMarble?.trim() ||
      '',
    dmRoot: GC_ROOT,
  };
}

export function enrichConfig(raw = {}) {
  const config = {
    ...DEFAULTS,
    ...raw,
    paths: { ...DEFAULTS.paths, ...raw.paths },
    continuum: {
      ...DEFAULTS.continuum,
      ...raw.continuum,
      evolution: { ...DEFAULTS.continuum.evolution, ...raw.continuum?.evolution },
      trust: { ...DEFAULTS.continuum.trust, ...raw.continuum?.trust },
      narrative: { ...DEFAULTS.continuum.narrative, ...raw.continuum?.narrative },
      corePlanes: { ...DEFAULTS.continuum.corePlanes, ...raw.continuum?.corePlanes },
      planes: { ...DEFAULTS.continuum.planes, ...raw.continuum?.planes },
      triggers: { ...DEFAULTS.continuum.triggers, ...raw.continuum?.triggers },
      plugins: raw.continuum?.plugins ?? DEFAULTS.continuum.plugins,
    },
    narrative: { ...DEFAULTS.narrative, ...raw.narrative },
  };
  const urls = resolveEdgeUrls(config);
  config.edgeStatusUrl = urls.edgeStatusUrl;
  config.tripwireUrl = urls.tripwireUrl;
  config.edgeMode = urls.mode;
  config.paths = resolvePaths(config);
  if (urls.domain && !config.allowedDomains.includes(urls.domain)) {
    config.allowedDomains = [...new Set([...config.allowedDomains, urls.domain])];
  }
  if (urls.domain && urls.domain !== 'ghost-continuum-local' && !config.cloudflareWorkerName) {
    config.cloudflareWorkerName = `${urls.domain.replace(/\./g, '-')}-sentinel`;
  }
  return config;
}

const LEGACY_DIR = path.join(os.homedir(), '.dm-sentinel');

function migrateLegacyDir() {
  if (fs.existsSync(CONFIG_PATH) || !fs.existsSync(LEGACY_DIR)) return;
  fs.mkdirSync(GC_DIR, { recursive: true });
  for (const name of fs.readdirSync(LEGACY_DIR)) {
    const src = path.join(LEGACY_DIR, name);
    const dest = path.join(GC_DIR, name);
    if (!fs.existsSync(dest)) {
      fs.cpSync(src, dest, { recursive: true });
    }
  }
}

export function loadConfig() {
  migrateLegacyDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    return enrichConfig({});
  }
  return enrichConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
}

export function saveConfig(config) {
  fs.mkdirSync(GC_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}