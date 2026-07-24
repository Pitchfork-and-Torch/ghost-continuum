#!/usr/bin/env node
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, GC_DIR } from '../packages/core/src/index.js';
import { startHub } from '../packages/hub-api/src/server.js';
import { fetchGhostLan } from '../packages/hub-api/src/adapters/ghost-lan.js';
import { fetchEdge } from '../packages/hub-api/src/adapters/edge.js';
import { fetchAudit } from '../packages/hub-api/src/adapters/audit.js';
import { resolveCellRoot } from '../packages/hub-api/src/adapters/cell-wire.js';
import { BUNDLED_GHOST_LAN } from '../packages/core/src/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BANNER = `
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   ▓  GHOST CONTINUUM v3.0.0 ASCENDANT    ▓
   ▓  Orchestration Nexus · Genome Engine ▓
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓`;

const GHOST_STORIES = [
  '  ◌ A trap rotated at 03:14. No one was watching. Something answered anyway.',
  '  ◌ The genome pool dreams in port numbers.',
  '  ◌ Echo Reality epoch 7: backup-svc filed a ticket that never existed.',
  '  ◌ Ledger root unchanged. The story continued beneath it.',
];

function openBrowser(url) {
  if (process.platform === 'win32') {
    execFile('cmd.exe', ['/c', 'start', '', url], () => {});
  } else if (process.platform === 'darwin') {
    execFile('open', [url], () => {});
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

async function cmdStart() {
  const config = loadConfig();
  console.log(BANNER);
  const { url } = await startHub(config);
  console.log(`  Hub UI      ${url}`);
  console.log(`  Data dir    ${GC_DIR}`);
  console.log(`  Tip: npm start — launches full bundled stack`);
  openBrowser(url);
}

function maybeGhostStories() {
  if (process.env.DM_GHOST_STORIES === '1') {
    const line = GHOST_STORIES[Math.floor(Math.random() * GHOST_STORIES.length)];
    console.log('\n  — ghost stories —');
    console.log(line);
    console.log('');
  }
}

async function cmdDoctor() {
  const config = loadConfig();
  console.log(BANNER);
  maybeGhostStories();
  console.log('\n  Doctor check:\n');

  const checks = [];
  const cellRoot = resolveCellRoot(config);

  checks.push(['bundled ghost-lan', fs.existsSync(BUNDLED_GHOST_LAN)]);
  checks.push(['ghost-lan path', fs.existsSync(config.paths?.ghostLan)]);
  if (cellRoot) checks.push(['scope cell install', fs.existsSync(cellRoot)]);

  checks.push(['edge mode', Boolean(config.edgeMode)]);
  checks.push(['builtin validator', config.useBuiltinValidator !== false]);

  const [lan, edge, audit] = await Promise.all([
    fetchGhostLan(config),
    fetchEdge(config),
    fetchAudit(config),
  ]);

  checks.push(['Ghost LAN sentinel', lan.armed]);
  checks.push(['Edge plane', edge.ok]);
  checks.push(['Audit plane', audit.armed]);

  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  }

  if (!lan.armed) {
    console.log('\n  Tip: npm start — starts Ghost LAN + local edge + hub');
  }
  if (!edge.ok && config.edgeMode === 'local') {
    console.log('  Tip: Local edge runs with npm start (port 30001)');
  }

  try {
    const { ensurePool, getChampion } = await import('../packages/genome/src/pool.js');
    const { verifyLedger } = await import('../packages/trust/src/merkle.js');
    const pool = ensurePool();
    const champion = getChampion(pool);
    const ledger = verifyLedger();
    console.log(`\n  Continuum: ${pool.filter((g) => g.status === 'active').length} active genomes`);
    if (champion) console.log(`  Champion:  ${champion.personality?.archetype} (fitness ${Math.round(champion.fitness?.score || 0)})`);
    console.log(`  Ledger:    ${ledger.ok ? 'verified' : 'pending'} (${ledger.entries || 0} entries)`);
  } catch {
    /* optional */
  }

  try {
    const { collectPlaneStatus } = await import('../packages/planes/src/registry.js');
    const { probeCloak, findTrenchBinary } = await import('../packages/planes/src/trench-cloak.js');
    const planes = collectPlaneStatus(config);
    const trench = planes.find((p) => p.id === 'trench-cloak');
    const bin = findTrenchBinary();
    console.log(`\n  Trench Coat: ${trench?.enabled ? 'enabled' : 'disabled'}`);
    console.log(`  trench CLI:  ${bin || 'not found (install Trench Coat or set TRENCH_COAT_HOME)'}`);
    if (trench?.enabled) {
      const snap = await probeCloak(config);
      console.log(`  cloak entry: ${snap.entry?.up ? `up :${snap.entry.port}` : 'down'}`);
      console.log(`  cloaked:     ${snap.cloaked ? 'yes' : 'no'}`);
      if (snap.proxyUrl) console.log(`  proxy:       ${snap.proxyUrl}`);
    }
  } catch {
    /* optional */
  }
}

async function cmdPlanes() {
  const { loadConfig, enrichConfig } = await import('../packages/core/src/index.js');
  const { toggleContinuumPlane } = await import('../packages/hub-api/src/plane-arm.js');
  const { collectPlaneStatus } = await import('../packages/planes/src/registry.js');

  const sub = process.argv[3] || 'list';
  const planeId = process.argv[4] || 'trench-cloak';
  const config = enrichConfig(loadConfig());

  if (sub === 'list') {
    const planes = collectPlaneStatus(config);
    console.log('\n  Sensor planes:\n');
    for (const p of planes) {
      const flag = !p.enabled ? '○' : p.cloaked ? '◆' : p.armed ? '●' : '○';
      console.log(`  ${flag} ${p.label || p.id}  ${p.enabled ? 'ON' : 'OFF'}${p.cloaked ? ' CLOAKED' : ''}  — ${p.message || ''}`);
    }
    console.log('\n  Toggle: ghost-continuum planes on|off [plane-id]\n');
    return;
  }

  if (sub === 'on' || sub === 'off') {
    const result = await toggleContinuumPlane(config, planeId, sub === 'on');
    if (!result.ok) {
      console.error(result.error || 'toggle failed');
      process.exit(1);
    }
    console.log(`  ${planeId} → ${result.enabled ? 'ON' : 'OFF'}${result.armed ? ' (armed)' : ''}`);
    if (result.status?.message) console.log(`  ${result.status.message}`);
    if (result.actions?.length) {
      for (const a of result.actions) {
        if (a.message) console.log(`  · ${a.action}: ${a.message}`);
      }
    }
    return;
  }

  console.log('Usage: ghost-continuum planes list|on|off [plane-id]');
  process.exit(1);
}

const cmd = process.argv[2] || 'start';

if (cmd === 'start') {
  cmdStart().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else if (cmd === 'doctor') {
  cmdDoctor().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else if (cmd === 'planes') {
  cmdPlanes().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  console.log('Usage: ghost-continuum start | doctor | planes');
  process.exit(1);
}