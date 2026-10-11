import fs from 'fs';
import path from 'path';
import os from 'os';

export const REPLAY_DIR = path.join(os.homedir(), '.ghost-continuum', 'replay');

export function buildSessionTimeline(events = [], ip = null) {
  const filtered = ip ? events.filter((e) => e.ip === ip) : events;
  const sorted = [...filtered].sort((a, b) => a.ts - b.ts);

  const branches = [];
  let current = { id: 'main', events: [], startTs: sorted[0]?.ts || Date.now() };

  for (const e of sorted) {
    if (e.type?.includes('rotate') || e.type?.includes('genome-evolution')) {
      if (current.events.length) branches.push({ ...current, endTs: e.ts });
      current = { id: `branch_${e.ts}`, events: [], startTs: e.ts, forkReason: e.type };
    }
    current.events.push(e);
  }
  if (current.events.length) branches.push({ ...current, endTs: sorted[sorted.length - 1]?.ts });

  return {
    ip,
    eventCount: sorted.length,
    branches,
    durationMs: sorted.length >= 2 ? sorted[sorted.length - 1].ts - sorted[0].ts : 0,
  };
}

export function saveReplaySession(label, timeline) {
  fs.mkdirSync(REPLAY_DIR, { recursive: true });
  const id = `${label}-${Date.now()}`;
  const file = path.join(REPLAY_DIR, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify({ id, savedAt: Date.now(), timeline }, null, 2) + '\n');
  return { id, path: file };
}

export function listReplaySessions() {
  if (!fs.existsSync(REPLAY_DIR)) return [];
  return fs
    .readdirSync(REPLAY_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(REPLAY_DIR, f), 'utf8'));
        return { id: data.id, savedAt: data.savedAt, branches: data.timeline?.branches?.length || 0 };
      } catch {
        return { id: f, error: true };
      }
    });
}

export function loadReplaySession(id) {
  const file = path.join(REPLAY_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Step-through replay state for UI */
export function replayAtStep(timeline, branchIndex = 0, step = 0) {
  const branch = timeline.branches[branchIndex];
  if (!branch) return { done: true };
  const event = branch.events[step];
  if (!event) return { done: true, branchComplete: true };
  return {
    done: false,
    branchIndex,
    step,
    event,
    totalSteps: branch.events.length,
    branchId: branch.id,
    simulatedState: {
      persona: event.detail?.persona || event.persona,
      generation: event.generation,
      type: event.type,
      ip: event.ip,
    },
  };
}