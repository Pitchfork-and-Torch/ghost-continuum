import fs from 'fs';
import path from 'path';
import os from 'os';

export const PHANTOM_DIR = path.join(os.homedir(), '.ghost-continuum', 'phantom');

export function loadPhantom(ip) {
  const safe = ip.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = path.join(PHANTOM_DIR, `${safe}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function savePhantom(phantom) {
  fs.mkdirSync(PHANTOM_DIR, { recursive: true });
  const safe = phantom.ip.replace(/[^a-zA-Z0-9._-]/g, '_');
  fs.writeFileSync(path.join(PHANTOM_DIR, `${safe}.json`), JSON.stringify(phantom, null, 2) + '\n');
  return phantom;
}

export function touchPhantom(ip, interaction = {}) {
  let p = loadPhantom(ip) || {
    v: 1,
    ip,
    firstSeen: Date.now(),
    visits: 0,
    memory: [],
    persona: 'unknown',
    trustLevel: 0,
  };

  p.visits += 1;
  p.lastSeen = Date.now();
  p.memory.push({
    ts: Date.now(),
    type: interaction.type || 'visit',
    detail: interaction.detail || {},
  });
  p.memory = p.memory.slice(-50);

  if (interaction.persona) p.persona = interaction.persona;
  if (interaction.trustDelta) p.trustLevel = Math.max(0, Math.min(10, p.trustLevel + interaction.trustDelta));

  return savePhantom(p);
}