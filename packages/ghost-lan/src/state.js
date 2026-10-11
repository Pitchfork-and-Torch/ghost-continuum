import fs from 'fs';
import path from 'path';
import { GHOST_DIR } from './config.js';
import { derivePorts, buildGenerationId } from './topology.js';
import { hiddenMarker } from './ops/masquerade.js';
import { ensurePool, getChampion } from '../../genome/src/pool.js';

export const STATE_PATH = path.join(GHOST_DIR, 'state.json');
export const LOG_PATH = path.join(GHOST_DIR, 'events.jsonl');
export const PID_PATH = path.join(GHOST_DIR, 'sentinel.pid');

export function freshState(config, generation) {
  const day = new Date().toISOString().slice(0, 10);
  const pool = ensurePool(config.personas);
  const champion = getChampion(pool);
  const persona = config.personas[generation % config.personas.length];
  return {
    generation,
    day,
    buildId: buildGenerationId(config.siteSeed, generation),
    persona,
    activeGenomeId: champion?.id || null,
    ports: [...config.obviousPorts, ...derivePorts(config.siteSeed, generation, config.rotatingPortCount)],
    totalHits: 0,
    rotatedAt: Date.now(),
    startedAt: Date.now(),
    morphPhase: 0,
    previousPersona: null,
    previousBuildId: null,
    hiddenPath: hiddenMarker(config.siteSeed, generation),
  };
}

export function loadState(config) {
  if (fs.existsSync(STATE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch {
      /* fresh */
    }
  }
  return freshState(config, 0);
}

export function saveState(state) {
  fs.mkdirSync(GHOST_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

export function appendEvent(event) {
  fs.mkdirSync(GHOST_DIR, { recursive: true });
  fs.appendFileSync(LOG_PATH, JSON.stringify({ ...event, ts: Date.now() }) + '\n');
}

export function readRecentEvents(limit = 50) {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l)).reverse();
}

export function writePid(pid) {
  fs.mkdirSync(GHOST_DIR, { recursive: true });
  fs.writeFileSync(PID_PATH, String(pid));
}

export function readPid() {
  if (!fs.existsSync(PID_PATH)) return null;
  return parseInt(fs.readFileSync(PID_PATH, 'utf8'), 10);
}

export function clearPid() {
  if (fs.existsSync(PID_PATH)) fs.unlinkSync(PID_PATH);
}

export function syncDay(state, config) {
  const day = new Date().toISOString().slice(0, 10);
  if (state.day === day) return state;
  return { ...freshState(config, state.generation), day };
}