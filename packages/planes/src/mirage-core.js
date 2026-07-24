import http from 'http';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const PLANE_ID = 'mirage-core';
const MIRAGE_DIR = path.join(os.homedir(), '.ghost-continuum', 'mirage');
const ACTIVE_PATH = path.join(MIRAGE_DIR, 'active.json');
const nativeServers = new Map();

export function detectContainerRuntime() {
  for (const rt of ['docker', 'podman']) {
    try {
      execSync(`${rt} info`, { stdio: 'ignore', timeout: 3000 });
      return rt;
    } catch {
      /* */
    }
  }
  return 'none';
}

export function listActiveDecoys() {
  if (!fs.existsSync(ACTIVE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(ACTIVE_PATH, 'utf8')).decoys || [];
  } catch {
    return [];
  }
}

function saveActive(decoys) {
  fs.mkdirSync(MIRAGE_DIR, { recursive: true });
  fs.writeFileSync(ACTIVE_PATH, JSON.stringify({ updatedAt: Date.now(), decoys }, null, 2) + '\n');
}

function spawnNativeDecoy(trigger = {}) {
  const port = trigger.port || 8787 + Math.floor(Math.random() * 50);
  const name = `dm-mirage-native-${Date.now().toString(36)}`;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html', Server: 'nginx/1.18.0' });
    res.end('<!DOCTYPE html><html><body><h1>Mirage decoy</h1><p>Defensive-only localhost decoy</p></body></html>');
  });
  server.listen(port, '127.0.0.1');
  nativeServers.set(name, server);
  const decoy = { id: name, port, runtime: 'node-native', spawnedAt: Date.now(), trigger };
  const active = listActiveDecoys();
  active.push(decoy);
  saveActive(active.slice(-20));
  return { ok: true, decoy, mode: 'node-native' };
}

function spawnContainerDecoy(config, trigger, runtime) {
  const port = trigger.port || 8888 + Math.floor(Math.random() * 100);
  const name = `dm-mirage-${Date.now().toString(36)}`;
  const image = config?.continuum?.planes?.mirageImage || 'alpine:3.19';
  const cmd = [
    'run', '-d', '--rm', '--name', name, '-p', `127.0.0.1:${port}:80`, image,
    'sh', '-c', 'echo Mirage decoy > /tmp/index.html || echo OK',
  ];
  try {
    const out = execSync(`${runtime} ${cmd.join(' ')}`, { encoding: 'utf8', timeout: 30000 }).trim();
    const decoy = { id: name, port, runtime, image, containerId: out.slice(0, 12), spawnedAt: Date.now(), trigger };
    const active = listActiveDecoys();
    active.push(decoy);
    saveActive(active.slice(-20));
    return { ok: true, decoy };
  } catch (e) {
    return { ok: false, error: e.message, runtime };
  }
}

export function spawnDecoy(config, trigger = {}) {
  if (config?.continuum?.planes?.mirageCore !== true) return { ok: false, skipped: true };
  const runtime = detectContainerRuntime();
  if (runtime === 'none') return spawnNativeDecoy(trigger);
  return spawnContainerDecoy(config, trigger, runtime);
}

export function teardownAllDecoys(config) {
  const decoys = listActiveDecoys();
  const results = [];
  for (const d of decoys) {
    results.push(teardownDecoy(config, d.id));
  }
  saveActive([]);
  return { ok: true, removed: decoys.length, results };
}

export function teardownDecoy(config, decoyId) {
  if (nativeServers.has(decoyId)) {
    try {
      nativeServers.get(decoyId).close();
      nativeServers.delete(decoyId);
    } catch {
      /* */
    }
    const active = listActiveDecoys().filter((d) => d.id !== decoyId);
    saveActive(active);
    return { ok: true };
  }
  const runtime = detectContainerRuntime();
  if (runtime === 'none') return { ok: false };
  try {
    execSync(`${runtime} rm -f ${decoyId}`, { stdio: 'ignore', timeout: 10000 });
    saveActive(listActiveDecoys().filter((d) => d.id !== decoyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function status(config) {
  const enabled = config?.continuum?.planes?.mirageCore === true;
  const decoys = listActiveDecoys();
  const runtime = detectContainerRuntime();
  const active = enabled && decoys.length > 0;
  return {
    id: PLANE_ID,
    label: 'Mirage Core',
    armed: active,
    enabled,
    phase: 3,
    runtime: runtime === 'none' && decoys.length ? 'node-native' : runtime,
    activeDecoys: decoys.length,
    decoys: decoys.slice(-5),
    message: !enabled
      ? 'Disabled — toggle on to spawn ephemeral decoys'
      : active
        ? `${decoys.length} mirage decoy(s) active`
        : 'Enabled — spawn decoy via toggle or high-fitness trigger',
  };
}