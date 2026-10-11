import { appendEvent } from './state.js';

export async function sendBeacon(config, event) {
  if (!config.beaconEnabled || !config.tripwireUrl) return;

  try {
    await fetch(config.tripwireUrl, {
      method: 'POST',
      body: JSON.stringify({
        t: event.type,
        d: { ...event.detail, source: 'ghost-lan', lan: true },
        b: event.buildId,
        ts: Date.now(),
      }),
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    appendEvent({ type: 'beacon-failed', detail: { message: err.message } });
  }
}