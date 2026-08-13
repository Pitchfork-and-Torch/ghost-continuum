#!/usr/bin/env node
import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GHOST_DIR, loadConfig } from '../src/config.js';
import { readRecentEvents, readPid, clearPid } from '../src/state.js';
import { PERSONA_META } from '../src/topology.js';
import {
  isRunning,
  requestStop,
  requestRotate,
  startSentinel,
} from '../src/sentinel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SENTINEL = path.join(ROOT, 'src', 'sentinel.js');

const HELP = `
  Polymorphic Ghost LAN — home network deception layer

  Usage:
    ghost-lan start [--foreground]   Start sentinel (background by default)
    ghost-lan stop                     Stop running sentinel
    ghost-lan status                   Show persona, ports, hits
    ghost-lan logs [--tail N]          Recent events (default 20)
    ghost-lan rotate                   Force persona morph
    ghost-lan dashboard                Open local dashboard in browser
    ghost-lan chaff                    Show DNS chaff hosts file
    ghost-lan doctor                   Health check (ports, dashboard, autostart)
    ghost-lan install                  Register boot task (Windows)
    ghost-lan uninstall                Remove boot task

  Dashboard: http://127.0.0.1:29999
  Data dir:  ~/.ghost-lan
`;

function banner() {
  console.log(`
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
   ░  GHOST LAN — polymorphic deception  ░
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░`);
}

async function cmdStart(args) {
  if (isRunning()) {
    console.log('Already running (pid ' + readPid() + ')');
    return;
  }

  if (args.includes('--foreground') || args.includes('-f')) {
    banner();
    await startSentinel();
    return;
  }

  fs.mkdirSync(GHOST_DIR, { recursive: true });
  const logPath = path.join(GHOST_DIR, 'sentinel.log');
  const launcher = path.join(GHOST_DIR, 'launch-sentinel.cmd');
  const launcherBody = [
    '@echo off',
    `cd /d "${ROOT}"`,
    `"${process.execPath}" "${SENTINEL}" >> "${logPath}" 2>&1`,
  ].join('\r\n') + '\r\n';
  fs.writeFileSync(launcher, launcherBody);

  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      execFile(
        'cmd.exe',
        ['/c', 'start', '""', '/MIN', launcher],
        { cwd: ROOT, windowsHide: true },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  } else {
    const child = spawn(process.execPath, [SENTINEL], {
      detached: true,
      stdio: 'ignore',
      cwd: ROOT,
    });
    child.unref();
  }

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (isRunning()) break;
  }

  const pid = readPid();
  if (!pid) {
    console.error('Failed to start Ghost LAN. Try: ghost-lan start --foreground');
    process.exit(1);
  }
  console.log('Ghost LAN started (pid ' + pid + ')');
  console.log('Dashboard: http://127.0.0.1:' + (loadConfig().dashboardPort || 29999));
}

async function cmdStop() {
  if (!isRunning()) {
    clearPid();
    console.log('Not running.');
    return;
  }
  requestStop();
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (!isRunning()) {
      console.log('Stopped.');
      return;
    }
  }
  const pid = readPid();
  try {
    process.kill(pid, 'SIGTERM');
    console.log('Force-stopped pid ' + pid);
  } catch {
    console.log('Could not stop pid ' + pid);
  }
}

async function cmdStatus() {
  banner();
  const config = loadConfig();
  if (!isRunning()) {
    console.log('\n  Status: OFFLINE\n');
    console.log('  Run: ghost-lan start\n');
    return;
  }

  try {
    const res = await fetch(`http://127.0.0.1:${config.dashboardPort}/api/status`);
    const s = await res.json();
    const meta = PERSONA_META[s.persona] || {};
    console.log('\n  Status:     ONLINE (pid ' + readPid() + ')');
    console.log('  Persona:    ' + (meta.icon || '◌') + ' ' + (meta.label || s.persona));
    console.log('  Generation: ' + s.generation);
    console.log('  Build ID:   ' + s.buildId);
    console.log('  Hits:       ' + s.totalHits);
    console.log('  LAN IP:     ' + s.lanIp);
    console.log('  Ports:      ' + (s.ports || []).join(', '));
    console.log('  Dashboard:  http://127.0.0.1:' + config.dashboardPort + '\n');
  } catch {
    console.log('\n  Status: RUNNING (pid ' + readPid() + ') but dashboard unreachable\n');
  }
}

function cmdLogs(args) {
  const tailIdx = args.indexOf('--tail');
  const limit = tailIdx >= 0 ? parseInt(args[tailIdx + 1] || '20', 10) : 20;
  const events = readRecentEvents(limit);
  if (!events.length) {
    console.log('No events logged yet.');
    return;
  }
  for (const ev of events) {
    const t = new Date(ev.ts).toISOString().slice(11, 19);
    const ip = ev.ip ? ` ${ev.ip}` : '';
    console.log(`${t}  ${ev.type}${ip}  ${JSON.stringify(ev.detail || {})}`);
  }
}

async function cmdRotate() {
  if (!isRunning()) {
    console.log('Not running. Start first: ghost-lan start');
    return;
  }
  requestRotate('cli');
  console.log('Rotate requested — persona will morph within a few seconds.');
}

async function cmdDashboard() {
  const config = loadConfig();
  const url = `http://127.0.0.1:${config.dashboardPort}`;
  console.log('Dashboard: ' + url);
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function cmdChaff() {
  const hostsPath = path.join(GHOST_DIR, 'hosts-chaff.txt');
  if (!fs.existsSync(hostsPath)) {
    console.log('No chaff file yet. Start sentinel first.');
    return;
  }
  console.log(fs.readFileSync(hostsPath, 'utf8'));
}

function cmdInstall() {
  const script = path.join(ROOT, 'install', 'install.ps1');
  const child = spawn(
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', script],
    { stdio: 'inherit', cwd: ROOT },
  );
  child.on('exit', (code) => process.exit(code ?? 0));
}

async function cmdDoctor() {
  banner();
  const config = loadConfig();
  const issues = [];
  const ok = [];

  const nodeOk = parseInt(process.version.slice(1), 10) >= 18;
  (nodeOk ? ok : issues).push('Node ' + process.version + (nodeOk ? '' : ' (need >=18)'));

  const configPath = path.join(GHOST_DIR, 'config.json');
  if (fs.existsSync(configPath)) {
    ok.push('Config: ' + configPath);
    if (config.beaconEnabled && !config.tripwireUrl) {
      issues.push('beaconEnabled=true but tripwireUrl is empty');
    }
    if (config.tripwireUrl && !config.beaconEnabled) {
      ok.push('Tripwire URL set (beacons disabled)');
    }
  } else {
    issues.push('No config — copy config.example.json to ' + configPath);
  }

  if (isRunning()) {
    ok.push('Sentinel running (pid ' + readPid() + ')');
    try {
      const res = await fetch(`http://127.0.0.1:${config.dashboardPort}/api/status`);
      if (res.ok) {
        ok.push('Dashboard HTTP ' + res.status);
        const s = await res.json();
        if (s.ops === 'v0.2' || s.generation !== undefined) ok.push('Ops layer active (gen ' + s.generation + ')');
      } else issues.push('Dashboard returned ' + res.status);
    } catch {
      issues.push('Dashboard unreachable on :' + config.dashboardPort);
    }
    const logPath = path.join(GHOST_DIR, 'sentinel.log');
    if (fs.existsSync(logPath)) ok.push('Background log: ' + logPath);
  } else {
    issues.push('Sentinel offline — run: ghost-lan start');
  }

  const startup = path.join(
    process.env.APPDATA || '',
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Ghost-LAN.lnk',
  );
  if (fs.existsSync(startup)) ok.push('Autostart: Startup shortcut');
  else ok.push('Autostart: not in Startup folder (run install)');

  console.log('');
  for (const line of ok) console.log('  [ok]  ' + line);
  for (const line of issues) console.log('  [!]   ' + line);
  console.log('');
  process.exit(issues.length ? 1 : 0);
}

function cmdUninstall() {
  const script = path.join(ROOT, 'install', 'uninstall.ps1');
  const child = spawn(
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', script],
    { stdio: 'inherit', cwd: ROOT },
  );
  child.on('exit', (code) => process.exit(code ?? 0));
}

const [,, command, ...args] = process.argv;

switch (command) {
  case 'start':
    cmdStart(args);
    break;
  case 'stop':
    cmdStop();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'logs':
    cmdLogs(args);
    break;
  case 'rotate':
    cmdRotate();
    break;
  case 'dashboard':
  case 'dash':
    cmdDashboard();
    break;
  case 'chaff':
    cmdChaff();
    break;
  case 'doctor':
    cmdDoctor();
    break;
  case 'install':
    cmdInstall();
    break;
  case 'uninstall':
    cmdUninstall();
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    console.log(HELP);
    break;
  default:
    console.error('Unknown command: ' + command);
    console.log(HELP);
    process.exit(1);
}