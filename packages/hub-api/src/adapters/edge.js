import { normalizeEvent } from '../../../core/src/events.js';
import { getPrimaryDomain } from '../../../core/src/config.js';
import { runPassiveDrill } from '../../../passive/drill.js';

export function isEdgeEnabled(config) {
  return config?.continuum?.corePlanes?.edge !== false;
}

export async function fetchEdge(config) {
  if (!isEdgeEnabled(config)) {
    return {
      ok: false,
      armed: false,
      enabled: false,
      status: null,
      events: [],
      mode: config.edgeMode || 'local',
      error: 'edge disabled',
    };
  }

  const url = config.edgeStatusUrl;
  if (!url) {
    return { ok: false, armed: false, enabled: true, status: null, error: 'edge not configured' };
  }

  const headers = {};
  if (config.edgeStatusKey) {
    headers.Authorization = `Bearer ${config.edgeStatusKey}`;
  }

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return { ok: false, armed: false, status: null, error: `HTTP ${res.status}` };
    }
    const status = await res.json();
    return {
      ok: true,
      armed: status.passive !== false && status.ok,
      enabled: true,
      status,
      events: [],
      statusUrl: url,
      mode: config.edgeMode || 'remote',
    };
  } catch (e) {
    return { ok: false, armed: false, enabled: true, status: null, error: e.message };
  }
}

export async function runPassiveDrillAdapter(config) {
  const domain = getPrimaryDomain(config);
  const base =
    config.edgeMode === 'local'
      ? `http://127.0.0.1:${config.edgeLocalPort || 30001}`
      : domain
        ? `https://${domain}`
        : config.edgeStatusUrl?.replace(/\/\.__dm\/status$/, '');

  if (!base) {
    return { ok: false, error: 'no edge URL configured' };
  }

  const report = await runPassiveDrill(base, {
    siteSeed: domain || 'ghost-continuum-local',
  });

  return {
    ok: report.allOk,
    report,
    event: normalizeEvent({
      plane: 'edge',
      type: 'passive-drill',
      detail: { allOk: report.allOk, passed: report.passed, total: report.total, base },
      source: 'ghost-continuum',
    }),
  };
}