import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { normalizeEvent } from '../../../core/src/events.js';

const GHOST_DIR = path.join(os.homedir(), '.ghost-lan');

export function isGhostLanEnabled(config) {
  return config?.continuum?.corePlanes?.ghostLan !== false;
}

function ghostLanCli(config) {
  const ghostRoot = config.paths?.ghostLan;
  return path.join(ghostRoot, 'bin', 'ghost-lan.js');
}

export function isGhostLanRunning() {
  const pidPath = path.join(GHOST_DIR, 'sentinel.pid');
  if (!fs.existsSync(pidPath)) return false;
  try {
    process.kill(parseInt(fs.readFileSync(pidPath, 'utf8'), 10), 0);
    return true;
  } catch {
    return false;
  }
}

export async function startGhostLanProcess(config) {
  if (isGhostLanRunning()) return { ok: true, alreadyRunning: true };
  const cli = ghostLanCli(config);
  const child = spawn(process.execPath, [cli, 'start'], {
    cwd: path.dirname(path.dirname(cli)),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (isGhostLanRunning()) return { ok: true, started: true };
  }
  return { ok: false, error: 'Ghost LAN did not start' };
}

export async function stopGhostLanProcess(config) {
  if (!isGhostLanRunning()) return { ok: true, wasRunning: false };
  const cli = ghostLanCli(config);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'stop'], {
      cwd: path.dirname(path.dirname(cli)),
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('exit', () => resolve({ ok: true, stopped: true }));
    child.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

export async function fetchGhostLan(config) {
  if (!isGhostLanEnabled(config)) {
    return {
      ok: false,
      armed: false,
      enabled: false,
      status: { persona: 'offline', totalHits: 0 },
      dossiers: [],
      events: [],
      dashboardUrl: `http://127.0.0.1:${config.ghostLanPort || 29999}`,
    };
  }
  const port = config.ghostLanPort || 29999;
  const base = `http://127.0.0.1:${port}`;

  async function get(pathname) {
    try {
      const res = await fetch(`${base}${pathname}`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  const [status, events, dossiers] = await Promise.all([
    get('/api/status'),
    get('/api/events?limit=80'),
    get('/api/dossiers'),
  ]);

  const pidAlive = isGhostLanRunning();

  const lanEvents = (events || []).map((e) =>
    normalizeEvent({
      plane: 'lan',
      type: e.type,
      ip: e.ip,
      ts: e.ts,
      buildId: e.buildId,
      generation: e.generation,
      detail: e.detail || {},
      source: 'ghost-lan',
    }),
  );

  return {
    ok: Boolean(status?.ok || pidAlive),
    armed: pidAlive,
    enabled: true,
    status: status || { persona: 'unknown', totalHits: 0 },
    dossiers: dossiers || [],
    events: lanEvents,
    dashboardUrl: base,
  };
}

export async function rotateGhostLan(config) {
  const port = config.ghostLanPort || 29999;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/rotate`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? res.json() : { ok: false };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}