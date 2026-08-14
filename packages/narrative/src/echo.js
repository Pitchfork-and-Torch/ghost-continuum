import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export const ECHO_DIR = path.join(os.homedir(), '.ghost-continuum', 'echo');

const FAKE_USERS = ['jchen', 'ops-bot', 'legacy-admin', 'contractor-m', 'backup-svc'];
const FAKE_EVENTS = [
  'patch Tuesday applied',
  'backup job completed with warnings',
  'failed login attempt (internal)',
  'certificate renewal scheduled',
  'inventory scan queued',
];

function rng(seed) {
  let h = crypto.createHash('sha256').update(seed).digest();
  return () => {
    h = crypto.createHash('sha256').update(h).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

export function loadEchoWorld(worldId = 'default') {
  const file = path.join(ECHO_DIR, `${worldId}.json`);
  if (!fs.existsSync(file)) return createEchoWorld(worldId);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return createEchoWorld(worldId);
  }
}

export function createEchoWorld(worldId = 'default', loreSeed = worldId) {
  const rand = rng(loreSeed);
  return {
    v: 1,
    id: worldId,
    loreSeed,
    epoch: 1,
    createdAt: Date.now(),
    lastAdvancedAt: Date.now(),
    users: FAKE_USERS.slice(0, 3 + Math.floor(rand() * 2)).map((u) => ({
      handle: u,
      role: rand() > 0.5 ? 'operator' : 'service',
      lastSeen: Date.now() - Math.floor(rand() * 86400000 * 7),
    })),
    timeline: [],
    artifacts: {
      logs: [],
      emails: [],
      configs: [],
    },
  };
}

export function saveEchoWorld(world) {
  fs.mkdirSync(ECHO_DIR, { recursive: true });
  const file = path.join(ECHO_DIR, `${world.id}.json`);
  fs.writeFileSync(file, JSON.stringify(world, null, 2) + '\n');
  return world;
}

/** Advance the fake world as if time passed while attacker was away. */
export function advanceEchoWorld(world, hoursElapsed = 24) {
  const rand = rng(`${world.loreSeed}:${world.epoch}:${hoursElapsed}`);
  const w = structuredClone(world);
  w.epoch += 1;
  w.lastAdvancedAt = Date.now();

  const eventCount = Math.max(1, Math.floor(hoursElapsed / 6));
  for (let i = 0; i < eventCount; i++) {
    const user = w.users[Math.floor(rand() * w.users.length)];
    const evt = FAKE_EVENTS[Math.floor(rand() * FAKE_EVENTS.length)];
    w.timeline.push({
      ts: Date.now() - Math.floor(rand() * hoursElapsed * 3600000),
      actor: user?.handle || 'system',
      event: evt,
    });
    w.artifacts.logs.push(`[${new Date().toISOString()}] ${user?.handle}: ${evt}`);
  }

  if (rand() > 0.6) {
    w.artifacts.emails.push({
      from: 'it-alerts@internal.local',
      subject: `Re: ${FAKE_EVENTS[Math.floor(rand() * FAKE_EVENTS.length)]}`,
      snippet: 'Please review before end of week. — automated notice',
    });
  }

  return w;
}

export function echoContextForIp(world, ip) {
  const recent = world.timeline.slice(-5);
  return {
    worldId: world.id,
    epoch: world.epoch,
    loreSeed: world.loreSeed,
    recentEvents: recent,
    userCount: world.users.length,
    returningNarrative: `The environment continued: epoch ${world.epoch}, ${recent.length} recent events.`,
    ip,
  };
}