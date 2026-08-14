import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, saveConfig, detectLanIp, GHOST_DIR } from './config.js';
import {
  loadState,
  saveState,
  freshState,
  appendEvent,
  writePid,
  clearPid,
  readPid,
  syncDay,
} from './state.js';
import { sendBeacon } from './beacon.js';
import { dnsChaffHosts, PERSONA_META } from './topology.js';
import { startDashboard } from './dashboard.js';
import { isTrapPath, silenceIp, isSilenced, isLoopback } from './ops/traps.js';
import { surveyProbe } from './ops/survey.js';
import { buildHttpResponse, delay } from './ops/respond.js';
import { applyGradualMorph } from './ops/morph.js';
import { masqueradeTcpBanner } from './ops/masquerade.js';
import { getDossier, recordDossier } from './ops/dossier.js';
import { recordEngagement, savePool, loadPool, getChampion } from '../../genome/src/pool.js';
import { morphDelayMs } from '../../genome/src/morph.js';
import { analyzeRequest } from '../../continuum/src/anti-analysis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTROL_PATH = path.join(GHOST_DIR, 'control.json');

const ipHits = new Map();
let listeners = [];
let dashboardServer = null;
let state = null;
let config = null;

function resolveClientIp(req) {
  const remote = req.socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
  if (!isLoopback(remote)) return remote;
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return remote;
}

function allowConnection(ip) {
  const count = (ipHits.get(ip) || 0) + 1;
  ipHits.set(ip, count);
  return count <= config.maxConnectionsPerIp;
}

function getState() {
  return state;
}

function setState(next) {
  state = next;
  saveState(state);
}

async function recordHit(ip, type, detail) {
  state.totalHits += 1;

  if (state.activeGenomeId) {
    const pool = loadPool();
    const { pool: nextPool, genome } = recordEngagement(pool, state.activeGenomeId, {
      type,
      ip,
      detail: {
        ...detail,
        returning: detail.returning,
        dwellMs: detail.delayMs,
        commandLike: /curl|wget|nmap|sqlmap|mimikatz|secretsdump/i.test(detail.ua || ''),
        credential: /password|login|auth|token/i.test(detail.url || ''),
      },
    });
    if (genome) savePool(nextPool);
  }

  const event = {
    type,
    ip,
    detail: { ...detail, genomeId: state.activeGenomeId },
    generation: state.generation,
    buildId: state.buildId,
    persona: state.persona,
  };
  appendEvent(event);
  await sendBeacon(config, { ...event, buildId: state.buildId });

  const hitThreshold = config.rotateOnHits || 3;
  const shouldRotate =
    type.includes('honeypot') &&
    state.totalHits > 0 &&
    state.totalHits % hitThreshold === 0;

  if (shouldRotate) {
    await rotatePersona('hit-threshold');
  }
}

function isHttpPort(port) {
  return [80, 443, 8080, 8443, 9200, 5984, 5000, 8123].includes(port) || port % 2 === 0;
}

async function handleHttpRequest(req, res, port) {
  const ip = resolveClientIp(req);

  if (isSilenced(ip)) {
    res.writeHead(444);
    return res.end();
  }

  if (!allowConnection(ip)) {
    res.writeHead(429);
    return res.end();
  }

  if (isTrapPath(req.url, config)) {
    appendEvent({ type: 'trap-trip', ip, detail: { url: req.url, port } });
    silenceIp(ip, config.trapSilenceMs || 90_000, config);
    await rotatePersona('trap');
    res.writeHead(503, { Server: 'nginx/1.18.0' });
    return res.end('Service Unavailable');
  }

  const dossier = getDossier(ip);
  const analysis = analyzeRequest(req, ip);
  const built = await buildHttpResponse(req, ip, state, config);

  if (analysis.recommendBare && built.meta) {
    built.meta.mode = 'bare';
  }

  const survey = surveyProbe(req, ip, {
    port,
    ruleId: built.meta.rules?.ruleId,
    persona: built.meta.persona,
    returning: built.meta.returning,
    seenGenerations: built.meta.seenGenerations,
    threatScore: built.meta.rules?.rotate ? 6 : 0,
  });

  let delayMs = built.delayMs || 0;
  if (state.activeGenomeId) {
    const genome = loadPool().find((g) => g.id === state.activeGenomeId);
    if (genome) delayMs = Math.max(delayMs, morphDelayMs(genome, delayMs));
  }
  if (delayMs) await delay(delayMs);

  const headers = { 'X-Robots-Tag': 'noindex', ...built.headers };
  if (built.status === 302) delete headers['Content-Type'];
  res.writeHead(built.status, headers);
  res.end(built.body);

  await recordHit(ip, 'honeypot-http', {
    port,
    method: req.method,
    url: req.url,
    ua: req.headers['user-agent'] || '',
    probeClass: survey.probeClass,
    persona: built.meta.persona,
    mode: built.meta.mode,
    ruleId: built.meta.rules?.ruleId,
    stale: built.meta.stale,
  });

  if (built.meta.rules?.rotate) {
    await rotatePersona(`rule:${built.meta.rules.ruleId}`);
  }
}

function startHttpHoneypot(port) {
  const server = http.createServer((req, res) => {
    handleHttpRequest(req, res, port).catch((err) => {
      appendEvent({ type: 'handler-error', detail: { message: err.message, port } });
      res.writeHead(500);
      res.end();
    });
  });

  server.on('error', (err) => {
    appendEvent({ type: 'listener-error', detail: { port, kind: 'http', message: err.message } });
  });

  server.listen(port, config.bindHost, () => {
    appendEvent({ type: 'listener-up', detail: { port, kind: 'http' } });
  });
  return server;
}

function startTcpBanner(port) {
  const server = net.createServer(async (socket) => {
    const ip = socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
    if (isSilenced(ip) || !allowConnection(ip)) return socket.destroy();

    const probe = { class: 'tcp' };
    await recordHit(ip, 'honeypot-tcp', { port, probeClass: probe.class });

    const banner = masqueradeTcpBanner(state.persona, `${ip}:${port}`, state.buildId);
    socket.write(banner);
    socket.end();
  });

  server.on('error', (err) => {
    appendEvent({ type: 'listener-error', detail: { port, kind: 'tcp', message: err.message } });
  });

  server.listen(port, config.bindHost, () => {
    appendEvent({ type: 'listener-up', detail: { port, kind: 'tcp' } });
  });
  return server;
}

function stopListeners() {
  for (const server of listeners) {
    try {
      server.close();
    } catch {
      /* ignore */
    }
  }
  listeners = [];
}

function startListeners() {
  stopListeners();
  for (const port of state.ports) {
    listeners.push(isHttpPort(port) ? startHttpHoneypot(port) : startTcpBanner(port));
  }
}

function writeChaffFile() {
  const chaff = dnsChaffHosts(config.siteSeed, config.lanIp);
  const hostsPath = path.join(GHOST_DIR, 'hosts-chaff.txt');
  const content = [
    '# Ghost LAN DNS chaff — merge into hosts or Pi-hole',
    `# Persona: ${state.persona} | gen ${state.generation} | phase ${state.morphPhase ?? 0}`,
    ...chaff.map((h) => `${h.ip}  ${h.name}`),
  ].join('\n') + '\n';
  fs.mkdirSync(GHOST_DIR, { recursive: true });
  fs.writeFileSync(hostsPath, content);
  return { chaff, hostsPath };
}

export async function rotatePersona(reason = 'manual') {
  const next = applyGradualMorph(config, state, reason);
  const champion = getChampion(loadPool());
  if (champion) next.activeGenomeId = champion.id;
  appendEvent({
    type: 'rotate',
    detail: {
      reason,
      from: state.generation,
      to: next.generation,
      fromPersona: state.persona,
      toPersona: next.persona,
      morphPhase: next.morphPhase,
    },
    generation: next.generation,
    buildId: next.buildId,
  });
  await sendBeacon(config, {
    type: 'ghost-rotate',
    detail: { reason, persona: next.persona, phase: next.morphPhase },
    buildId: next.buildId,
  });
  setState(next);
  startListeners();
  writeChaffFile();
  return next;
}

function checkControlFile() {
  if (!fs.existsSync(CONTROL_PATH)) return;
  try {
    const cmd = JSON.parse(fs.readFileSync(CONTROL_PATH, 'utf8'));
    fs.unlinkSync(CONTROL_PATH);
    if (cmd.action === 'rotate') rotatePersona(cmd.reason || 'remote');
    if (cmd.action === 'stop') shutdown('control');
  } catch {
    /* ignore */
  }
}

function startControlPoller() {
  return setInterval(checkControlFile, 2000);
}

function startDayWatcher() {
  return setInterval(() => {
    const synced = syncDay(state, config);
    if (synced.day !== state.day) {
      setState(synced);
      startListeners();
      writeChaffFile();
      appendEvent({ type: 'day-roll', detail: { day: synced.day, persona: synced.persona } });
    }
  }, 60_000);
}

function shutdown(reason = 'signal') {
  appendEvent({ type: 'sentinel-stop', detail: { reason } });
  stopListeners();
  if (dashboardServer) dashboardServer.close();
  clearPid();
  process.exit(0);
}

export async function startSentinel(options = {}) {
  config = { ...loadConfig(), ...options };
  if (!config.lanIp) config.lanIp = detectLanIp();
  saveConfig(config);

  state = loadState(config);
  if (state.hiddenPath == null) state.hiddenPath = freshState(config, state.generation).hiddenPath;
  if (state.morphPhase == null) state.morphPhase = 0;
  state = syncDay(state, config);
  saveState(state);

  const { hostsPath } = writeChaffFile();
  startListeners();

  writePid(process.pid);

  dashboardServer = await startDashboard({
    config,
    getState,
    rotatePersona,
    port: config.dashboardPort,
  });
  if (!dashboardServer) {
    appendEvent({ type: 'dashboard-error', detail: { port: config.dashboardPort, message: 'port busy' } });
  }

  appendEvent({
    type: 'sentinel-start',
    detail: {
      pid: process.pid,
      lanIp: config.lanIp,
      persona: state.persona,
      ports: state.ports,
      ops: 'v0.2',
    },
    generation: state.generation,
    buildId: state.buildId,
  });

  const meta = PERSONA_META[state.persona] || { label: state.persona, icon: '◌' };
  const lines = [
    '',
    '  ╔══════════════════════════════════════════╗',
    '  ║       POLYMORPHIC GHOST LAN v0.2         ║',
    '  ╚══════════════════════════════════════════╝',
    '',
    `  LAN IP      ${config.lanIp}`,
    `  Persona     ${meta.icon} ${meta.label} (gen ${state.generation}, phase ${state.morphPhase ?? 0})`,
    `  Build ID    ${state.buildId}`,
    `  Honeypots   ${state.ports.join(', ')}`,
    `  Dashboard   http://127.0.0.1:${config.dashboardPort}`,
    `  DNS chaff   ${hostsPath}`,
    `  Ops         rules · traps · survey · morph · masquerade`,
    `  Tripwire    ${config.beaconEnabled ? config.tripwireUrl : 'local only'}`,
    '',
  ];
  console.log(lines.join('\n'));

  const controlTimer = startControlPoller();
  const dayTimer = startDayWatcher();

  process.on('SIGINT', () => shutdown('sigint'));
  process.on('SIGTERM', () => shutdown('sigterm'));
  process.on('uncaughtException', (err) => {
    appendEvent({ type: 'sentinel-crash', detail: { message: err.message, stack: err.stack?.slice(0, 500) } });
    console.error('Uncaught exception (sentinel staying alive):', err.message);
  });
  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    appendEvent({ type: 'sentinel-rejection', detail: { message } });
    console.error('Unhandled rejection (sentinel staying alive):', message);
  });

  return { config, state, hostsPath, stop: () => { clearInterval(controlTimer); clearInterval(dayTimer); shutdown('api'); } };
}

export function isRunning() {
  const pid = readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    clearPid();
    return false;
  }
}

export function requestStop() {
  fs.mkdirSync(GHOST_DIR, { recursive: true });
  fs.writeFileSync(CONTROL_PATH, JSON.stringify({ action: 'stop' }) + '\n');
}

export function requestRotate(reason = 'cli') {
  fs.mkdirSync(GHOST_DIR, { recursive: true });
  fs.writeFileSync(CONTROL_PATH, JSON.stringify({ action: 'rotate', reason }) + '\n');
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('sentinel.js') ||
    process.argv[1].replace(/\\/g, '/').endsWith('ghost-lan/src/sentinel.js'));

if (isMain) {
  const existing = readPid();
  if (existing && existing !== process.pid) {
    try {
      process.kill(existing, 0);
      console.error(`Ghost LAN already running (pid ${existing}). Use: ghost-lan stop`);
      process.exit(1);
    } catch {
      clearPid();
    }
  }
  startSentinel().catch((err) => {
    console.error(err);
    clearPid();
    process.exit(1);
  });
}