#!/usr/bin/env node
/**
 * Ghost Continuum desktop watcher — tray notifications for high-score tripwire events.
 * Binds localhost only. Authorized defensive monitoring.
 */
import { execFile } from 'child_process';

const HUB = process.env.DM_HUB_URL || 'http://127.0.0.1:30000';
const POLL_MS = 4000;
const SCORE_ALERT = 5;

let seen = new Set();

function notify(title, message) {
  if (process.platform !== 'win32') {
    console.log(`[ALERT] ${title}: ${message}`);
    return;
  }
  const ps = `
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Shield
    $n.BalloonTipTitle = '${title.replace(/'/g, "''")}'
    $n.BalloonTipText = '${message.replace(/'/g, "''")}'
    $n.Visible = $true
    $n.ShowBalloonTip(8000)
    Start-Sleep -Seconds 9
    $n.Dispose()
  `;
  execFile('powershell.exe', ['-NoProfile', '-Command', ps], () => {});
}

async function poll() {
  try {
    const res = await fetch(`${HUB}/api/feed?limit=30`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    for (const e of data.feed || []) {
      const key = e.id || `${e.plane}:${e.type}:${e.ts}:${e.ip}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if ((e.score || 0) >= SCORE_ALERT) {
        notify('Ghost Continuum', `${e.plane} · ${e.type}${e.ip ? ` · ${e.ip}` : ''}`);
      }
    }
    if (seen.size > 500) seen = new Set([...seen].slice(-200));
  } catch {
    /* hub offline */
  }
}

console.log(`Ghost Continuum watcher → ${HUB}`);
setInterval(poll, POLL_MS);
poll();