#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { enrichConfig, saveConfig, CONFIG_PATH, GC_DIR } from '../packages/core/src/config.js';
import { BUNDLED_GHOST_LAN } from '../packages/core/src/paths.js';

const GHOST_DIR = path.join(os.homedir(), '.ghost-lan');
const GHOST_CONFIG = path.join(GHOST_DIR, 'config.json');
const GHOST_EXAMPLE = path.join(BUNDLED_GHOST_LAN, 'config.example.json');

function ensureGhostLanConfig() {
  if (fs.existsSync(GHOST_CONFIG)) return;
  fs.mkdirSync(GHOST_DIR, { recursive: true });
  let base = {
    siteSeed: 'ghost-continuum',
    tripwireUrl: '',
    beaconEnabled: false,
    dashboardPort: 29999,
  };
  if (fs.existsSync(GHOST_EXAMPLE)) {
    base = { ...JSON.parse(fs.readFileSync(GHOST_EXAMPLE, 'utf8')), siteSeed: 'ghost-continuum' };
  }
  fs.writeFileSync(GHOST_CONFIG, JSON.stringify(base, null, 2) + '\n');
  console.log(`  Ghost LAN config → ${GHOST_CONFIG}`);
}

function normalizeStackConfig(raw = {}) {
  const merged = { ...raw };

  if (!process.env.GC_GHOST_LAN_ROOT) {
    merged.paths = { ...merged.paths, ghostLan: BUNDLED_GHOST_LAN };
  }

  if (!process.env.GC_PRIMARY_DOMAIN && !merged.primaryDomain) {
    merged.useLocalEdge = true;
    merged.primaryDomain = '';
  }

  return enrichConfig(merged);
}

function main() {
  console.log('\n  Ghost Continuum — stack setup\n');
  fs.mkdirSync(GC_DIR, { recursive: true });

  const existing = fs.existsSync(CONFIG_PATH)
    ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    : {};

  const config = normalizeStackConfig(existing);
  saveConfig(config);
  ensureGhostLanConfig();

  console.log(`  Hub config     → ${CONFIG_PATH}`);
  console.log(`  Ghost LAN      → ${config.paths.ghostLan}`);
  console.log(`  Edge mode      → ${config.edgeMode}`);
  console.log(`  Edge status    → ${config.edgeStatusUrl}`);
  console.log(`  Hub UI         → http://127.0.0.1:${config.hubPort}`);
  console.log('\n  Run: npm start\n');
}

main();