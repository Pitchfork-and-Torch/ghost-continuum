/**
 * Background hub jobs that used to ride on GET /api/threat/watch.
 * GET must stay side-effect free: browsers omit Origin on img/navigation,
 * so #9's CSRF lock (missing Origin allowed for CLI) cannot protect a mutating GET.
 */

import { enrichConfig, loadConfig } from '../../core/src/index.js';
import { tickQuietHours, loadHome } from './home-shield.js';
import { threatWatch } from './threat-response.js';
import { sendNotification } from './notifications.js';
import { publishEvent } from './sse.js';

const threatNotifyAt = new Map();
const NOTIFY_GAP_MS = 15 * 60 * 1000;

/**
 * Quiet-hours morph tick + throttled threat notifications.
 * Call from a hub timer — never from a GET handler.
 */
export function runHubWatchJobs(config) {
  let quietHours = { changed: false };
  try {
    quietHours = tickQuietHours(config, loadHome());
    if (quietHours.changed) {
      Object.assign(config, enrichConfig(loadConfig()));
      publishEvent('morph-switch', { morph: quietHours.morph, reason: quietHours.reason });
    }
  } catch {
    /* */
  }

  const watch = threatWatch();
  if (watch.realThreat) {
    const key = `threat-notify:${watch.topIp}:${watch.topScore}`;
    const now = Date.now();
    const last = threatNotifyAt.get(key) || 0;
    if (now - last > NOTIFY_GAP_MS) {
      threatNotifyAt.set(key, now);
      sendNotification(
        'realThreat',
        `Real threat: ${watch.topIp || 'unknown'} score ${watch.topScore}`,
        watch,
      ).catch(() => {});
    }
  }
  return { watch, quietHours };
}

export function resetHubWatchJobs() {
  threatNotifyAt.clear();
}
