import fs from 'fs';
import path from 'path';
import { GHOST_DIR } from '../config.js';

const DOSSIER_PATH = path.join(GHOST_DIR, 'dossiers.json');

export function loadDossiers() {
  if (!fs.existsSync(DOSSIER_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DOSSIER_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function saveDossiers(data) {
  fs.mkdirSync(GHOST_DIR, { recursive: true });
  fs.writeFileSync(DOSSIER_PATH, JSON.stringify(data, null, 2) + '\n');
}

export function recordDossier(ip, entry) {
  const all = loadDossiers();
  const prev = all[ip] || { firstSeen: Date.now(), hits: 0 };
  const seenGenerations = [
    ...new Set([...(prev.seenGenerations || []), ...(entry.seenGenerations || [])]),
  ];
  all[ip] = {
    ...prev,
    ...entry,
    seenGenerations: entry.seenGenerations ? seenGenerations : prev.seenGenerations,
    hits: (prev.hits || 0) + 1,
    lastSeen: Date.now(),
  };
  saveDossiers(all);
  return all[ip];
}

export function getDossier(ip) {
  return loadDossiers()[ip] || null;
}

export function listDossiers(limit = 30) {
  const all = loadDossiers();
  return Object.entries(all)
    .map(([ip, d]) => ({ ip, ...d }))
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    .slice(0, limit);
}

export function noteGeneration(ip, generation) {
  const d = getDossier(ip);
  if (!d) return false;
  const seen = d.seenGenerations || [];
  return seen.length > 0 && !seen.includes(generation);
}