import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export const DOCS_DIR = path.join(os.homedir(), '.ghost-continuum', 'echo', 'artifacts');

function rng(seed) {
  let h = crypto.createHash('sha256').update(seed).digest();
  return () => {
    h = crypto.createHash('sha256').update(h).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

export function generateEcosystem(world, options = {}) {
  const rand = rng(`${world.loreSeed}:${world.epoch}`);
  const ts = new Date().toISOString();

  const emails = [
    {
      id: `mail_${world.epoch}_1`,
      from: 'it-ops@internal.local',
      to: 'team-ops@internal.local',
      subject: `Re: maintenance window — epoch ${world.epoch}`,
      body: 'Reminder: staging certs expire Friday. Rollback playbook attached.',
      ts,
    },
    {
      id: `mail_${world.epoch}_2`,
      from: 'security@internal.local',
      to: 'ops-admin@internal.local',
      subject: 'Anomalous login review (internal)',
      body: 'Three failed auth attempts from 10.0.0.0/8 — likely scanner. No action required.',
      ts,
    },
  ];

  const configs = [
    {
      path: '/etc/app/staging.env',
      content: `APP_ENV=staging\nDB_HOST=10.0.${Math.floor(rand() * 255)}.12\nLOG_LEVEL=warn\n# epoch ${world.epoch}`,
    },
    {
      path: '/opt/backup/schedule.json',
      content: JSON.stringify({ cron: '0 2 * * *', target: 'nas-01', retain_days: 14 }, null, 2),
    },
  ];

  const logs = world.users.map((u, i) => ({
    ts: new Date(Date.now() - i * 3600000).toISOString(),
    level: rand() > 0.8 ? 'WARN' : 'INFO',
    user: u.handle,
    msg: ['session open', 'config reload', 'backup started', 'health check ok'][Math.floor(rand() * 4)],
  }));

  const docs = { emails, configs, logs, generatedAt: ts, worldId: world.id, epoch: world.epoch };

  if (options.persist !== false) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    const file = path.join(DOCS_DIR, `${world.id}-epoch-${world.epoch}.json`);
    fs.writeFileSync(file, JSON.stringify(docs, null, 2) + '\n');
  }

  return docs;
}

export function loadLatestArtifacts(worldId = 'default') {
  if (!fs.existsSync(DOCS_DIR)) return null;
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.startsWith(worldId));
  if (!files.length) return null;
  files.sort();
  return JSON.parse(fs.readFileSync(path.join(DOCS_DIR, files[files.length - 1]), 'utf8'));
}