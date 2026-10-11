#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadConfig,
  CONFIG_PATH,
  VERSION, CODENAME,
  spawnHidden,
  openLocalUrl,
} from '../packages/core/src/index.js';
import { startHub } from '../packages/hub-api/src/server.js';
import { startManagedLocalEdge } from '../packages/hub-api/src/edge-runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BANNER = `
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   ▓  LIVING DECEPTION CONTINUUM v${VERSION}   ▓
   ▓  genome · morph · ledger · narrative ▓
   ▓  Ghost LAN · Edge · Audit · Nexus    ▓
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓`;

function startGhostLan(config) {
  const ghostRoot = config.paths?.ghostLan;
  const sentinel = path.join(ghostRoot, 'src', 'sentinel.js');
  return spawnHidden(process.execPath, [sentinel], { cwd: ghostRoot });
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const { spawnSync } = await import('child_process');
    spawnSync(process.execPath, [path.join(ROOT, 'bin/setup.js')], { stdio: 'inherit' });
  }

  const config = loadConfig();
  console.log(BANNER);

  if (config.edgeMode === 'local' && config.continuum?.corePlanes?.edge !== false) {
    const edge = await startManagedLocalEdge(config);
    console.log(`  Edge plane    ${edge.url}`);
  } else if (config.edgeStatusUrl) {
    console.log(`  Edge plane    ${config.edgeStatusUrl}`);
  }

  if (config.continuum?.corePlanes?.ghostLan !== false) {
    startGhostLan(config);
    console.log(`  Ghost LAN     http://127.0.0.1:${config.ghostLanPort || 29999}`);
  } else {
    console.log('  Ghost LAN     disabled');
  }

  await new Promise((r) => setTimeout(r, 1500));

  if (config.continuum?.planes?.deepVeil) {
    try {
      const { startVeilProbe } = await import('../packages/planes/src/deep-veil.js');
      const veil = startVeilProbe(config);
      console.log(`  Deep Veil     ${veil.ok ? veil.mode : 'skipped'}`);
    } catch { /* */ }
  }

  if (config.continuum?.planes?.trenchCloak) {
    try {
      const { startTrenchCloak } = await import('../packages/planes/src/trench-cloak.js');
      const trench = await startTrenchCloak(config);
      console.log(
        `  Trench Coat   ${trench.ok ? trench.message || (trench.cloaked ? 'CLOAKED' : 'armed') : trench.skipped ? 'skipped' : trench.error || 'standby'}`,
      );
    } catch { /* */ }
  }

  const { url } = await startHub(config);
  console.log(`  Command hub   ${url}`);
  console.log(`  Data dir      ${CONFIG_PATH.replace(/config\.json$/i, '')}`);
  console.log(`  Version       ${VERSION} ${CODENAME}`);
  if (process.env.GC_PORTABLE === '1') {
    console.log('  Mode          portable package (bundled Node)');
  }
  console.log('  Stop          Ctrl+C in this window');
  if (process.env.GC_NO_BROWSER !== '1') {
    openLocalUrl(url);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});