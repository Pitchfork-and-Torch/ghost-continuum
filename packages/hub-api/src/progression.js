/**
 * Hygiene-focused progression badges (celebrate learning, not fear).
 */

import fs from 'fs';
import path from 'path';
import { GC_DIR, readEvents } from '../../core/src/index.js';
import { filterLiveEvents } from './demo-campaign.js';
import { loadHome } from './home-shield.js';
import { loadPool, getChampion } from '../../genome/src/index.js';
import { listDevices } from './device-inventory.js';

export const PROGRESS_PATH = path.join(GC_DIR, 'progression.json');

const BADGE_DEFS = [
  { id: 'first-boot', title: 'Cockpit online', desc: 'Opened Command Nexus', check: (c) => c.eventsTotal >= 0 },
  { id: 'wizard', title: 'Home Shield complete', desc: 'Finished first-run wizard', check: (c) => c.wizardCompleted },
  { id: 'live-mode', title: 'Live for truth', desc: 'Used LIVE fabric (non-demo)', check: (c) => c.liveEvents >= 1 },
  { id: 'first-trap', title: 'Decoy worked', desc: 'First trap / honeypot engagement', check: (c) => c.trapEvents >= 1 },
  { id: 'first-seal', title: 'Courtroom memory', desc: 'Sealed an incident bundle', check: (c) => c.sealEvents >= 1 },
  { id: 'first-evolve', title: 'Darwin online', desc: 'Ran a genome evolution cycle', check: (c) => c.evolveEvents >= 1 },
  { id: 'threat-respond', title: 'Calm under fire', desc: 'Ran real-threat response playbook', check: (c) => c.respondEvents >= 1 },
  { id: 'trusted-three', title: 'Known household', desc: 'Trusted 3+ devices', check: (c) => c.trustedDevices >= 3 },
  { id: 'plane-master', title: 'Layered defense', desc: 'Toggled a sensor plane', check: (c) => c.planeToggleEvents >= 1 },
  { id: 'week-clean', title: 'Quiet week', desc: '7+ days of activity with CLEAR verdict window', check: (c) => c.liveEvents >= 10 && c.highScore === 0 },
  { id: 'champion-100', title: 'Chad unlocked', desc: 'Champion fitness ≥ 100', check: (c) => c.championFitness >= 100 },
  { id: 'report-card', title: 'Family briefing', desc: 'Generated a home report', check: (c) => c.reportEvents >= 1 },
];

function loadMeta() {
  try {
    if (fs.existsSync(PROGRESS_PATH)) return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  } catch {
    /* */
  }
  return { v: 1, earned: {}, manual: {} };
}

function saveMeta(meta) {
  fs.mkdirSync(GC_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(meta, null, 2) + '\n');
}

function collectContext() {
  const home = loadHome();
  const all = readEvents(2000);
  const live = filterLiveEvents(all);
  const types = (re) => all.filter((e) => re.test(String(e.type))).length;
  const champion = getChampion(loadPool());
  const devices = listDevices();

  return {
    wizardCompleted: !!home.wizardCompleted,
    eventsTotal: all.length,
    liveEvents: live.length,
    trapEvents: live.filter((e) => /trap|honeypot|tripwire/i.test(String(e.type))).length,
    sealEvents: types(/incident-export|threat-response-seal|incident-snapshot/),
    evolveEvents: types(/genome-evolution/),
    respondEvents: types(/threat-response/),
    planeToggleEvents: types(/plane-toggle/),
    reportEvents: types(/home-report/),
    highScore: live.filter((e) => (e.score || 0) >= 6).length,
    trustedDevices: (devices.devices || []).filter((d) => d.trusted).length,
    championFitness: champion?.fitness?.score || 0,
  };
}

export function getProgression() {
  const meta = loadMeta();
  const ctx = collectContext();
  const badges = BADGE_DEFS.map((b) => {
    const earned = !!(meta.earned[b.id] || meta.manual[b.id] || b.check(ctx));
    if (earned && !meta.earned[b.id]) {
      meta.earned[b.id] = Date.now();
    }
    return {
      id: b.id,
      title: b.title,
      desc: b.desc,
      earned,
      earnedAt: meta.earned[b.id] || null,
    };
  });
  saveMeta(meta);
  const earnedCount = badges.filter((b) => b.earned).length;
  return {
    ok: true,
    badges,
    earnedCount,
    total: badges.length,
    percent: Math.round((earnedCount / badges.length) * 100),
    context: ctx,
  };
}

export function markBadge(id) {
  const meta = loadMeta();
  if (!BADGE_DEFS.find((b) => b.id === id)) return { ok: false, error: 'Unknown badge' };
  meta.manual[id] = Date.now();
  meta.earned[id] = meta.earned[id] || Date.now();
  saveMeta(meta);
  return getProgression();
}
