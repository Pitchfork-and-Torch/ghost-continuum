import fs from 'fs';
import os from 'os';
import path from 'path';

export const GHOST_DIR = path.join(os.homedir(), '.ghost-lan');
const LEGACY_DIR = path.join(os.homedir(), '.dm-home');

export const DEFAULT_CONFIG = {
  siteSeed: 'ghost-lan',
  tripwireUrl: '',
  beaconEnabled: false,
  bindHost: '0.0.0.0',
  dashboardPort: 29999,
  obviousPorts: [8080, 8443, 5901],
  rotatingPortCount: 5,
  scoreRotate: 6,
  maxConnectionsPerIp: 30,
  rotateOnHits: 3,
  personas: ['synology-nas', 'router-admin', 'ip-camera', 'plex-server', 'homeassistant'],
  gradualMorph: true,
  stalePersonaOnMismatch: true,
  stagedRedirect: true,
  hideGhostHeaders: true,
  scannerDelayMs: 1500,
  trapSilenceMs: 90_000,
  timePersonas: [
    { from: 8, to: 18, persona: 'router-admin' },
    { from: 18, to: 8, persona: 'ip-camera' },
  ],
  rules: [],
  trapPaths: [],
};

export function loadConfig() {
  const configPath = path.join(GHOST_DIR, 'config.json');
  const legacyPath = path.join(LEGACY_DIR, 'config.json');

  if (!fs.existsSync(configPath) && fs.existsSync(legacyPath)) {
    fs.mkdirSync(GHOST_DIR, { recursive: true });
    fs.copyFileSync(legacyPath, configPath);
  }

  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  const raw = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
  return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
}

export function saveConfig(config) {
  fs.mkdirSync(GHOST_DIR, { recursive: true });
  fs.writeFileSync(path.join(GHOST_DIR, 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

export function detectLanIp() {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal && net.address.startsWith('192.168.')) {
        return net.address;
      }
    }
  }
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}