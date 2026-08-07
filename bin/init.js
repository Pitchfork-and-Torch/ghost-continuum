#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import { enrichConfig, saveConfig, CONFIG_PATH, GC_DIR } from '../packages/core/src/config.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q, def = '') {
  const hint = def ? ` [${def}]` : '';
  return new Promise((resolve) => {
    rl.question(`${q}${hint}: `, (ans) => resolve(ans.trim() || def));
  });
}

async function main() {
  console.log('\n  Ghost Continuum — configuration\n');
  console.log('  Bundled stack works without answers (local edge + Ghost LAN).\n');

  const existing = fs.existsSync(CONFIG_PATH)
    ? enrichConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')))
    : enrichConfig({});

  const primaryDomain = await ask(
    'Production domain you own (blank = local edge only)',
    existing.primaryDomain,
  );
  const useLocal = primaryDomain
    ? (await ask('Keep local edge for dev? (y/n)', 'y')).toLowerCase().startsWith('y')
    : true;
  const cellRoot = await ask('Optional scope cell path', existing.cellRoot || '');

  const config = enrichConfig({
    ...existing,
    primaryDomain,
    useLocalEdge: useLocal,
    cellRoot,
    allowedDomains: [
      ...new Set(['localhost', '127.0.0.1', 'ghost-continuum-local', primaryDomain].filter(Boolean)),
    ],
  });

  fs.mkdirSync(GC_DIR, { recursive: true });
  saveConfig(config);

  console.log(`\n  Config saved → ${CONFIG_PATH}`);
  console.log(`  Edge mode     → ${config.edgeMode}`);
  console.log(`  Edge status   → ${config.edgeStatusUrl}`);
  console.log('\n  Run: npm start\n');

  rl.close();
}

main().catch((e) => {
  console.error(e);
  rl.close();
  process.exit(1);
});