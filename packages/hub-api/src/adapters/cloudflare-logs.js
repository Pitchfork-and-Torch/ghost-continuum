import { normalizeEvent } from '../../../core/src/events.js';

const CACHE_MS = 8000;
let cache = { ts: 0, events: [] };

function parseDmLogLine(message) {
  if (!message || typeof message !== 'string') return null;
  const trimmed = message.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (!obj.kind?.startsWith('dm-')) return null;
    return normalizeEvent({
      plane: 'edge',
      type: obj.kind,
      ip: obj.ip,
      ts: obj.ts || Date.now(),
      score: obj.score ?? undefined,
      detail: obj,
      source: 'cloudflare-logs',
    });
  } catch {
    return null;
  }
}

export async function fetchCloudflareTripwireLogs(config) {
  if (Date.now() - cache.ts < CACHE_MS) return cache.events;

  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  const service = config.cloudflareWorkerName;

  if (!token || !accountId || !service) {
    return [];
  }

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const to = now.toISOString();

  const body = {
    queryId: 'workers-logs-events',
    view: 'events',
    limit: 40,
    dry: false,
    parameters: {
      datasets: ['cloudflare-workers'],
      filters: [
        { key: '$metadata.service', operation: 'eq', type: 'string', value: service },
        { key: '$metadata.message', operation: 'includes', type: 'string', value: 'dm-' },
      ],
    },
    timeframe: { from, to },
  };

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      },
    );

    if (!res.ok) return [];

    const data = await res.json();
    const rows = data?.result?.events || data?.result?.rows || data?.result || [];
    const events = [];

    for (const row of rows) {
      const msg = row?.message || row?.$metadata?.message || row?.['$metadata.message'];
      const parsed = parseDmLogLine(msg);
      if (parsed) events.push(parsed);
      else if (typeof msg === 'string' && msg.includes('dm-')) {
        events.push(
          normalizeEvent({
            plane: 'edge',
            type: 'cf-log',
            detail: { message: msg.slice(0, 500) },
            source: 'cloudflare-logs',
          }),
        );
      }
    }

    cache = { ts: Date.now(), events };
    return events;
  } catch {
    return [];
  }
}