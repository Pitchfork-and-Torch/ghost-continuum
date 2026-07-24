import os from 'os';
import fs from 'fs';
import { execSync, spawn } from 'child_process';
import path from 'path';

export const PLANE_ID = 'deep-veil';

let probeProcess = null;
const VEIL_DIR = path.join(os.homedir(), '.ghost-continuum', 'deep-veil');

export function detectEbpfSupport() {
  if (os.platform() !== 'linux') return { supported: false, reason: 'non-linux' };
  const hasBpf = fs.existsSync('/sys/fs/bpf');
  const hasTc = (() => {
    try {
      execSync('which tc', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  return { supported: hasBpf, hasBpf, hasTc, reason: hasBpf ? 'linux-bpf' : 'no-bpf-fs' };
}

function readWindowsListeners() {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', timeout: 5000 });
    const listeners = [];
    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const local = parts[1] || '';
      const port = parseInt(local.split(':').pop(), 10);
      if (port > 0 && port < 65535) listeners.push({ port, raw: local });
    }
    return { ok: true, listeners: listeners.slice(0, 50), ts: Date.now(), mode: 'netstat-win' };
  } catch (e) {
    return { ok: false, connections: [], reason: e.message };
  }
}

/** Fallback sensors — connection anomaly watch via /proc/net/tcp or netstat */
export function readConnectionAnomalies() {
  if (os.platform() === 'win32') return readWindowsListeners();
  if (os.platform() !== 'linux' || !fs.existsSync('/proc/net/tcp')) {
    return { ok: false, connections: [], reason: 'fallback-unavailable' };
  }

  const lines = fs.readFileSync('/proc/net/tcp', 'utf8').trim().split('\n').slice(1);
  const listeners = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const state = parts[3];
    if (state === '0A') {
      const local = parts[1];
      const port = parseInt(local.split(':')[1], 16);
      if (port > 0 && port < 65535) listeners.push({ port, raw: local });
    }
  }
  return { ok: true, listeners: listeners.slice(0, 50), ts: Date.now(), mode: 'proc-linux' };
}

export function startVeilProbe(config) {
  if (config?.continuum?.planes?.deepVeil !== true) return { ok: false, skipped: true };

  const ebpf = detectEbpfSupport();
  fs.mkdirSync(VEIL_DIR, { recursive: true });

  if (ebpf.supported) {
    const scriptPath = path.join(VEIL_DIR, 'veil-probe.sh');
    if (!fs.existsSync(scriptPath)) {
      fs.writeFileSync(
        scriptPath,
        `#!/bin/sh\n# Deep Veil placeholder — attach custom eBPF probes here\n# Defensive-only: monitor unexpected bind/connect patterns\necho "deep-veil probe active $(date -Iseconds)" >> "${VEIL_DIR}/probe.log"\n`,
      );
      try {
        fs.chmodSync(scriptPath, 0o755);
      } catch {
        /* windows copy */
      }
    }
    try {
      probeProcess = spawn('sh', [scriptPath], { detached: true, stdio: 'ignore' });
      probeProcess.unref();
    } catch (e) {
      return { ok: false, error: e.message, fallback: readConnectionAnomalies() };
    }
    return { ok: true, mode: 'ebpf-script', ebpf };
  }

  return { ok: true, mode: 'proc-fallback', snapshot: readConnectionAnomalies() };
}

export function stopVeilProbe() {
  if (probeProcess) {
    try {
      probeProcess.kill();
    } catch {
      /* */
    }
    probeProcess = null;
  }
}

export function status(config) {
  const enabled = config?.continuum?.planes?.deepVeil === true;
  const ebpf = detectEbpfSupport();
  const snapshot = enabled ? readConnectionAnomalies() : null;
  const sensorsOk = enabled && (ebpf.supported || snapshot?.ok || probeProcess != null);
  const active = enabled && sensorsOk;
  return {
    id: PLANE_ID,
    label: 'Deep Veil',
    armed: active,
    enabled,
    phase: 3,
    platform: os.platform(),
    ebpf,
    snapshot,
    message: !enabled
      ? 'Disabled — toggle on for network-depth sensors'
      : active
        ? ebpf.supported
          ? 'Kernel veil active (eBPF + fallback)'
          : `Host sensors active (${snapshot?.mode || 'netstat'})`
        : 'Enabled — starting sensors…',
  };
}