/**
 * Trench Coat plane — privacy cloak as a Ghost Continuum sensor plane.
 *
 * Enable/disable from Nexus plane toggles or config.
 * When armed: monitors local Trench Coat SOCKS entry + Tor + control API,
 * optionally auto-starts `trench` if installed, and exposes proxy helpers
 * so other Ghost Continuum tools can route through the cloak when healthy.
 *
 * Defensive / legal-first only. Never starts offensive tooling.
 */

import net from 'net';
import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn, execFileSync } from 'child_process';

export const PLANE_ID = 'trench-cloak';
export const PLANE_LABEL = 'Trench Coat';

const STATE_DIR = path.join(os.homedir(), '.ghost-continuum', 'trench-cloak');
const STATE_FILE = path.join(STATE_DIR, 'status.json');
const PID_FILE = path.join(STATE_DIR, 'managed-trench.pid');

let monitorTimer = null;
let lastConfig = null;
let lastSnapshot = null;

function flagEnabled(config) {
  return config?.continuum?.planes?.trenchCloak === true;
}

function planeOpts(config = {}) {
  const p = config?.continuum?.planes || {};
  return {
    entryHost: p.trenchEntryHost || '127.0.0.1',
    entryPort: Number(p.trenchEntryPort || 1080),
    apiPort: Number(p.trenchApiPort || 8742),
    autoStart: p.trenchAutoStart === true,
    routeTools: p.trenchRouteTools !== false, // default: allow other tools to use cloak
    pollMs: Math.max(5000, Number(p.trenchPollMs || 20000)),
  };
}

function probePort(host, port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        /* */
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

function httpGetJson(url, timeoutMs = 1500, proxyUrl = null) {
  return new Promise((resolve) => {
    try {
      // Proxy optional via env for httpx-style tools; Node http.get doesn't natively SOCKS.
      // Direct local API only (loopback) — never proxy the control plane itself.
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          try {
            resolve({ ok: res.statusCode === 200, data: JSON.parse(body) });
          } catch {
            resolve({ ok: false, data: null });
          }
        });
      });
      req.on('error', () => resolve({ ok: false, data: null }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, data: null });
      });
    } catch {
      resolve({ ok: false, data: null });
    }
  });
}

function writeState(snapshot) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(snapshot, null, 2));
  } catch {
    /* local-only best effort */
  }
  lastSnapshot = snapshot;
}

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    /* */
  }
  return lastSnapshot;
}

/** Resolve trench CLI on PATH or common install locations. */
export function findTrenchBinary() {
  const candidates = [];
  if (process.env.TRENCH_COAT_BIN) candidates.push(process.env.TRENCH_COAT_BIN);
  if (process.env.TRENCH_COAT_HOME) {
    candidates.push(path.join(process.env.TRENCH_COAT_HOME, '.venv', 'Scripts', 'trench.exe'));
    candidates.push(path.join(process.env.TRENCH_COAT_HOME, '.venv', 'bin', 'trench'));
    candidates.push(path.join(process.env.TRENCH_COAT_HOME, 'src'));
  }
  // Common Windows clone path
  const home = os.homedir();
  candidates.push(path.join(home, 'trench-coat', '.venv', 'Scripts', 'trench.exe'));
  candidates.push(path.join(home, 'trench-coat', '.venv', 'bin', 'trench'));

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }

  // PATH lookup
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where', ['trench'], { encoding: 'utf8', timeout: 3000 });
      const line = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (line && fs.existsSync(line)) return line;
    } else {
      const out = execFileSync('which', ['trench'], { encoding: 'utf8', timeout: 3000 });
      const line = out.trim();
      if (line && fs.existsSync(line)) return line;
    }
  } catch {
    /* not on PATH */
  }
  return null;
}

function readManagedPid() {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!pid) return null;
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      fs.unlinkSync(PID_FILE);
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Optionally spawn `trench up` when autoStart is on and entry is down.
 * Requires trench installed and --accept-legal already acknowledged in trench config.
 */
export async function tryAutoStartTrench(config) {
  const opts = planeOpts(config);
  if (!opts.autoStart) return { ok: false, skipped: true, reason: 'autoStart off' };

  const entryUp = await probePort(opts.entryHost, opts.entryPort);
  if (entryUp) return { ok: true, already: true };

  const existing = readManagedPid();
  if (existing) return { ok: true, already: true, pid: existing };

  const bin = findTrenchBinary();
  if (!bin) {
    return {
      ok: false,
      error: 'trench CLI not found — install Trench Coat or set TRENCH_COAT_HOME',
    };
  }

  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const logPath = path.join(STATE_DIR, 'managed-trench.log');
    const logFd = fs.openSync(logPath, 'a');
    const child = spawn(bin, ['up', '--accept-legal', '--wait-tor', '30'], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
      env: { ...process.env },
    });
    child.unref();
    fs.writeFileSync(PID_FILE, String(child.pid), 'utf8');
    // brief settle
    await new Promise((r) => setTimeout(r, 2500));
    const up = await probePort(opts.entryHost, opts.entryPort, 800);
    return {
      ok: up,
      started: true,
      pid: child.pid,
      binary: bin,
      message: up
        ? `Started trench (pid ${child.pid}) — entry :${opts.entryPort}`
        : `Spawned trench (pid ${child.pid}) but entry not up yet — check ${logPath}`,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function stopManagedTrench() {
  const pid = readManagedPid();
  if (!pid) return { ok: true, stopped: false };
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    /* */
  }
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch {
    /* */
  }
  return { ok: true, stopped: true, pid };
}

export async function probeCloak(config = {}) {
  const opts = planeOpts(config);
  const { entryHost, entryPort, apiPort } = opts;
  const torPorts = [9050, 9150];

  const entryUp = await probePort(entryHost, entryPort);
  let tor = null;
  for (const p of torPorts) {
    if (await probePort('127.0.0.1', p)) {
      tor = { host: '127.0.0.1', port: p };
      break;
    }
  }

  let api = null;
  if (await probePort(entryHost, apiPort)) {
    const health = await httpGetJson(`http://${entryHost}:${apiPort}/api/health`);
    const torApi = await httpGetJson(`http://${entryHost}:${apiPort}/api/tor`);
    const identity = await httpGetJson(`http://${entryHost}:${apiPort}/api/identity?via=auto`);
    const status = await httpGetJson(`http://${entryHost}:${apiPort}/api/status`);
    api = {
      up: health.ok,
      version: health.data?.version || null,
      tor: torApi.data || null,
      identity: identity.data || null,
      status: status.data || null,
    };
  }

  const cloaked = Boolean(entryUp && (tor || api?.identity?.is_tor === true));
  const socksUrl = `socks5://${entryHost}:${entryPort}`;

  const snapshot = {
    ts: Date.now(),
    enabled: flagEnabled(config),
    monitoring: Boolean(monitorTimer),
    entry: { host: entryHost, port: entryPort, up: entryUp },
    tor,
    api,
    cloaked,
    proxyUrl: entryUp ? socksUrl : null,
    routeTools: opts.routeTools,
    managedPid: readManagedPid(),
    binary: findTrenchBinary(),
    message: entryUp
      ? cloaked
        ? `CLOAKED — entry :${entryPort}${tor ? ` + Tor :${tor.port}` : ''}`
        : `Entry :${entryPort} up (Tor not detected — chain may be clearnet)`
      : opts.autoStart
        ? 'Trench entry down — auto-start will retry'
        : 'Trench Coat entry not listening — enable plane + run: trench up --accept-legal',
  };

  writeState(snapshot);
  return snapshot;
}

/** Proxy URL for other Ghost Continuum tools when cloak is healthy and routeTools allowed. */
export function getCloakProxyUrl(config) {
  if (!flagEnabled(config) && !config?.force) return null;
  const opts = planeOpts(config);
  if (!opts.routeTools && !config?.force) return null;
  const snap = readState();
  if (snap?.proxyUrl && snap?.entry?.up) return snap.proxyUrl;
  return null;
}

export function isCloaked(config) {
  if (!flagEnabled(config)) return false;
  const snap = readState();
  return Boolean(snap?.cloaked);
}

export function status(config) {
  const enabled = flagEnabled(config);
  const last = readState();
  // Armed = plane enabled and monitoring (or just enabled after arm). Cloaked is separate.
  const armed = enabled;
  const cloaked = Boolean(enabled && last?.cloaked);
  return {
    id: PLANE_ID,
    label: PLANE_LABEL,
    armed,
    enabled,
    cloaked,
    phase: 2,
    message: enabled
      ? last?.message || 'Trench Coat armed — monitoring privacy cloak…'
      : 'Disabled — toggle on to arm privacy cloak integration (legal-first)',
    details: last,
    proxyUrl: enabled ? last?.proxyUrl || null : null,
  };
}

function stopMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

function startMonitor(config) {
  stopMonitor();
  lastConfig = config;
  const opts = planeOpts(config);
  monitorTimer = setInterval(() => {
    if (!flagEnabled(lastConfig || config)) {
      stopMonitor();
      return;
    }
    probeCloak(lastConfig || config).catch(() => {});
  }, opts.pollMs);
  if (typeof monitorTimer.unref === 'function') monitorTimer.unref();
}

/**
 * Arm the plane: enable monitoring, optional auto-start, initial probe.
 */
export async function startTrenchCloak(config) {
  if (!flagEnabled(config)) return { ok: false, skipped: true };

  const actions = [];
  const auto = await tryAutoStartTrench(config);
  if (!auto.skipped) actions.push({ action: 'trench-autostart', ...auto });

  startMonitor(config);
  const snap = await probeCloak(config);

  return {
    ok: true,
    mode: 'monitor',
    cloaked: snap.cloaked,
    entry: snap.entry,
    tor: snap.tor,
    proxyUrl: snap.proxyUrl,
    api: snap.api ? { up: snap.api.up, version: snap.api.version } : null,
    message: snap.message,
    actions,
  };
}

/**
 * Disarm: stop monitor, clear state, stop process we started.
 */
export function stopTrenchCloak(opts = {}) {
  stopMonitor();
  const result = { ok: true, stopped: true };
  if (opts.killManaged !== false) {
    // fire-and-forget managed process stop
    stopManagedTrench().then((r) => {
      result.managed = r;
    });
  }
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  } catch {
    /* */
  }
  lastSnapshot = null;
  lastConfig = null;
  return result;
}

/**
 * Fetch a URL through the cloak using a tiny CONNECT-less approach for identity checks.
 * For local tools that need egress via socks — uses child `curl` when available.
 */
export async function fetchViaCloak(config, url, timeoutMs = 15000) {
  const proxy = getCloakProxyUrl(config);
  if (!proxy) return { ok: false, error: 'cloak not available' };

  // Prefer curl --socks5-hostname for SOCKS
  try {
    const args =
      process.platform === 'win32'
        ? ['--socks5-hostname', proxy.replace(/^socks5:\/\//, ''), '-sS', '-m', String(Math.ceil(timeoutMs / 1000)), url]
        : ['--socks5-hostname', proxy.replace(/^socks5:\/\//, ''), '-sS', '-m', String(Math.ceil(timeoutMs / 1000)), url];
    // curl on Windows may exist as curl.exe
    const out = execFileSync('curl', args, { encoding: 'utf8', timeout: timeoutMs + 2000 });
    return { ok: true, body: out, via: proxy };
  } catch (e) {
    return { ok: false, error: e.message, via: proxy };
  }
}
