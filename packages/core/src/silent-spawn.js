/**
 * Windows-safe process helpers. Do not use `cmd /c start` or `detached: true`
 * on win32: both allocate a visible console even with windowsHide.
 */
import { spawn } from 'child_process';

export function spawnHidden(command, args = [], options = {}) {
  return spawn(command, args, {
    ...options,
    stdio: options.stdio ?? 'ignore',
    windowsHide: true,
    detached: false,
  });
}

export function openLocalUrl(url) {
  const href = String(url || '');
  if (!href) return;
  if (process.platform === 'win32') {
    spawn('explorer.exe', [href], { stdio: 'ignore', windowsHide: true, detached: false });
    return;
  }
  if (process.platform === 'darwin') {
    spawn('open', [href], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  spawn('xdg-open', [href], { stdio: 'ignore', detached: true }).unref();
}
