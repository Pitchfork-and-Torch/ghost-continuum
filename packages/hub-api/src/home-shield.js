/**
 * Home Shield — wizard profiles, quiet hours, kid mode, renter/apartment packs.
 * Defensive-only home network operator experience.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, saveConfig, GC_DIR } from '../../core/src/index.js';

export const HOME_PATH = path.join(GC_DIR, 'home.json');

export const PROFILES = {
  'one-pc': {
    id: 'one-pc',
    label: 'One PC / laptop hub',
    description: 'Arm Edge + Audit. Ghost LAN optional. Simple start.',
    morph: 'research',
    planes: {
      ghostLan: true,
      edge: true,
      audit: true,
      narrative: false,
      phantomMesh: false,
      deepVeil: false,
      mirageCore: false,
    },
    language: 'home',
  },
  unifi: {
    id: 'unifi',
    label: 'UniFi / serious home lab',
    description: 'Full LAN honeypots + edge + audit. Advanced planes opt-in later.',
    morph: 'research',
    planes: {
      ghostLan: true,
      edge: true,
      audit: true,
      narrative: false,
      phantomMesh: false,
      deepVeil: false,
      mirageCore: false,
    },
    language: 'expert',
    notes: [
      'Create a VLAN or unused /24 for decoy neighbors if possible',
      'Point tripwire at your public site if you use Cloudflare',
    ],
  },
  pfsense: {
    id: 'pfsense',
    label: 'pfSense / OPNsense',
    description: 'Hub on LAN; mirror honeypot subnet rules in firewall.',
    morph: 'aggressive',
    planes: {
      ghostLan: true,
      edge: true,
      audit: true,
      narrative: false,
      phantomMesh: false,
      deepVeil: false,
      mirageCore: false,
    },
    language: 'expert',
    notes: [
      'Allow hub → honeypot ports only from untrusted VLANs if segmented',
      'Export sealed incidents to your SIEM folder weekly',
    ],
  },
  cloudflare: {
    id: 'cloudflare',
    label: 'Cloudflare-protected site',
    description: 'Edge tripwires primary; LAN secondary.',
    morph: 'research',
    planes: {
      ghostLan: true,
      edge: true,
      audit: true,
      narrative: false,
      phantomMesh: false,
      deepVeil: false,
      mirageCore: false,
    },
    language: 'expert',
    notes: ['Deploy Worker tripwire on apex/www', 'Hub stays on your machine as the brain'],
  },
  family: {
    id: 'family',
    label: 'Family / kids at home',
    description: 'Home language, quiet hours, kid-safe morphs.',
    morph: 'stealth',
    planes: {
      ghostLan: true,
      edge: true,
      audit: true,
      narrative: false,
      phantomMesh: false,
      deepVeil: false,
      mirageCore: false,
    },
    language: 'home',
    kidMode: true,
    quietHours: { enabled: true, start: '22:00', end: '07:00', morph: 'aggressive' },
  },
  iot: {
    id: 'iot',
    label: 'Cameras / NAS / IoT heavy',
    description: 'Ghost LAN personas that look like home gear.',
    morph: 'research',
    planes: {
      ghostLan: true,
      edge: true,
      audit: true,
      narrative: true,
      phantomMesh: false,
      deepVeil: false,
      mirageCore: false,
    },
    language: 'home',
    iotPersonas: true,
  },
  apartment: {
    id: 'apartment',
    label: 'Apartment / renter (no router control)',
    description: 'Honest limits: Edge + Audit + Narrative. No fake LAN empire.',
    morph: 'research',
    planes: {
      ghostLan: false,
      edge: true,
      audit: true,
      narrative: true,
      phantomMesh: false,
      deepVeil: false,
      mirageCore: false,
    },
    language: 'home',
    notes: [
      'You may not control the ISP gateway — that is OK',
      'Edge + Audit still watch what this machine can see',
      'Do not attempt to scan neighbors’ networks',
    ],
  },
  full: {
    id: 'full',
    label: 'Everything (lab / power user)',
    description: 'All core planes on; extended planes remain opt-in for safety.',
    morph: 'research',
    planes: {
      ghostLan: true,
      edge: true,
      audit: true,
      narrative: true,
      phantomMesh: false,
      deepVeil: false,
      mirageCore: false,
    },
    language: 'expert',
  },
};

const DEFAULT_HOME = {
  v: 1,
  wizardCompleted: false,
  profileId: null,
  language: 'home', // home | expert
  kidMode: false,
  quietHours: { enabled: false, start: '22:00', end: '07:00', morph: 'aggressive', dayMorph: 'research' },
  highContrast: false,
  reducedMotion: false,
  showTrustBanner: true,
  householdName: '',
  completedAt: null,
  answers: {},
};

export function loadHome() {
  try {
    if (fs.existsSync(HOME_PATH)) {
      return { ...DEFAULT_HOME, ...JSON.parse(fs.readFileSync(HOME_PATH, 'utf8')) };
    }
  } catch {
    /* */
  }
  return { ...DEFAULT_HOME };
}

export function saveHome(home) {
  fs.mkdirSync(GC_DIR, { recursive: true });
  const next = { ...DEFAULT_HOME, ...home, updatedAt: new Date().toISOString() };
  fs.writeFileSync(HOME_PATH, JSON.stringify(next, null, 2) + '\n');
  return next;
}

export function listProfiles() {
  return Object.values(PROFILES).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    morph: p.morph,
    language: p.language,
    kidMode: !!p.kidMode,
    notes: p.notes || [],
  }));
}

/**
 * Apply a Home Shield profile to continuum config + home.json
 */
export function applyProfile(profileId, answers = {}) {
  const profile = PROFILES[profileId];
  if (!profile) return { ok: false, error: `Unknown profile: ${profileId}` };

  const config = loadConfig();
  config.continuum = config.continuum || {};
  config.continuum.morph = profile.morph;
  config.continuum.corePlanes = {
    ghostLan: !!profile.planes.ghostLan,
    edge: !!profile.planes.edge,
    audit: !!profile.planes.audit,
  };
  config.useBuiltinValidator = !!profile.planes.audit;
  config.continuum.narrative = {
    ...config.continuum.narrative,
    enabled: !!profile.planes.narrative,
    worldId: config.continuum.narrative?.worldId || 'default',
  };
  config.continuum.planes = {
    ...config.continuum.planes,
    phantomMesh: !!profile.planes.phantomMesh,
    deepVeil: !!profile.planes.deepVeil,
    mirageCore: !!profile.planes.mirageCore,
  };

  // IoT-friendly persona bias via config flag (ghost-lan may read later)
  if (profile.iotPersonas) {
    config.continuum.homePersonas = ['ip-camera', 'synology-nas', 'router-admin', 'printer', 'smart-tv'];
  }

  saveConfig(config);

  const home = saveHome({
    ...loadHome(),
    wizardCompleted: true,
    profileId,
    language: answers.language || profile.language || 'home',
    kidMode: answers.kidMode != null ? !!answers.kidMode : !!profile.kidMode,
    quietHours: profile.quietHours || loadHome().quietHours,
    householdName: answers.householdName || loadHome().householdName || '',
    answers: { ...answers, profileId },
    completedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    profile: listProfiles().find((p) => p.id === profileId),
    home,
    config: {
      morph: config.continuum.morph,
      corePlanes: config.continuum.corePlanes,
      narrative: config.continuum.narrative?.enabled,
      planes: config.continuum.planes,
    },
    card: buildShieldCard(home, profile),
  };
}

export function buildShieldCard(home = loadHome(), profile = PROFILES[home.profileId]) {
  const p = profile || PROFILES['one-pc'];
  return {
    title: home.householdName ? `${home.householdName} is protected` : 'Your house is protected',
    subtitle: 'Ghost Continuum · local-first digital immune system',
    profile: p?.label || 'Custom',
    morph: p?.morph || 'research',
    language: home.language,
    kidMode: home.kidMode,
    bullets: [
      'Decoys that learn — not a camera feed you never watch',
      'Your data stays on this PC until you export',
      'Demo for fun · Live for truth',
      'Courtroom-grade memory when something weird happens',
    ],
    notes: p?.notes || [],
    generatedAt: new Date().toISOString(),
  };
}

/** Parse HH:MM to minutes */
function toMinutes(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

/**
 * Whether quiet hours are active now (local time).
 * Handles overnight windows (22:00–07:00).
 */
export function isQuietHoursActive(home = loadHome(), now = new Date()) {
  const qh = home.quietHours;
  if (!qh?.enabled) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(qh.start || '22:00');
  const end = toMinutes(qh.end || '07:00');
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

/**
 * Resolve effective morph under quiet hours + kid mode constraints.
 */
export function resolveHomeMorph(config, home = loadHome()) {
  let morph = config?.continuum?.morph || 'research';
  if (isQuietHoursActive(home)) {
    morph = home.quietHours?.morph || 'aggressive';
  } else if (home.quietHours?.enabled && home.quietHours?.dayMorph) {
    // optional day morph only if we previously switched for quiet hours — leave config morph
  }
  // Kid mode: never allow aggressive via automatic resolution display (manual still possible with expert)
  if (home.kidMode && morph === 'aggressive' && home.language === 'home') {
    morph = 'stealth';
  }
  return {
    morph,
    quietHoursActive: isQuietHoursActive(home),
    kidMode: !!home.kidMode,
    language: home.language || 'home',
  };
}

/**
 * Apply quiet-hours morph switch if schedule says so (idempotent).
 */
export function tickQuietHours(config = loadConfig(), home = loadHome()) {
  if (!home.quietHours?.enabled) {
    return { ok: true, changed: false, reason: 'quiet-hours-disabled' };
  }
  const active = isQuietHoursActive(home);
  const target = active
    ? home.quietHours.morph || 'aggressive'
    : home.quietHours.dayMorph || config.continuum?.morph || 'research';
  const current = config.continuum?.morph;
  if (current === target) return { ok: true, changed: false, morph: current, quietHoursActive: active };

  config.continuum = config.continuum || {};
  config.continuum.morph = target;
  saveConfig(config);
  return {
    ok: true,
    changed: true,
    morph: target,
    previous: current,
    quietHoursActive: active,
    reason: active ? 'entered-quiet-hours' : 'left-quiet-hours',
  };
}

export function updateHomeSettings(patch = {}) {
  const home = loadHome();
  const next = { ...home };
  if (patch.language === 'home' || patch.language === 'expert') next.language = patch.language;
  if (typeof patch.kidMode === 'boolean') next.kidMode = patch.kidMode;
  if (typeof patch.highContrast === 'boolean') next.highContrast = patch.highContrast;
  if (typeof patch.reducedMotion === 'boolean') next.reducedMotion = patch.reducedMotion;
  if (typeof patch.showTrustBanner === 'boolean') next.showTrustBanner = patch.showTrustBanner;
  if (typeof patch.householdName === 'string') next.householdName = patch.householdName.slice(0, 64);
  if (patch.quietHours && typeof patch.quietHours === 'object') {
    next.quietHours = { ...next.quietHours, ...patch.quietHours };
  }
  if (patch.wizardCompleted === false) next.wizardCompleted = false;
  return saveHome(next);
}

export function getHomeStatus() {
  const home = loadHome();
  const config = loadConfig();
  const morphState = resolveHomeMorph(config, home);
  return {
    ok: true,
    home,
    profiles: listProfiles(),
    morphState,
    wizardNeeded: !home.wizardCompleted,
    shieldCard: home.wizardCompleted ? buildShieldCard(home) : null,
    host: os.hostname(),
  };
}
