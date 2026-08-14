import { normalizeEvent } from '../../../core/src/events.js';
import { validateMissionTargets } from '../../../core/src/scope.js';
import { getPrimaryDomain } from '../../../core/src/config.js';

export function buildBuiltinProbes(config) {
  const domain = getPrimaryDomain(config);
  const probes = {
    'lan-self-scan': {
      label: 'LAN exposure check',
      targets: [{ host: '127.0.0.1' }],
      roles: ['recon', 'scanner'],
      note: 'Confirm honeypot banners on authorized localhost scope.',
    },
  };
  if (domain) {
    probes['edge-drill'] = {
      label: 'Edge passive check',
      targets: [{ host: domain }],
      roles: ['recon', 'analyst'],
      note: 'Confirm sentinel injection and tripwire on owned domain.',
    };
    probes['deception-validate'] = {
      label: 'Deception correlation',
      targets: [{ host: '127.0.0.1' }, { host: domain }],
      roles: ['recon', 'scanner', 'analyst'],
      note: 'Correlate LAN traps with edge tripwire — allowlisted assets only.',
    };
  }
  return probes;
}

export function listBuiltinProbes(config) {
  return Object.entries(buildBuiltinProbes(config)).map(([id, p]) => ({
    id,
    name: p.label,
    objective: p.note,
    targets: p.targets,
  }));
}

async function probeLocalhost(config) {
  const port = config.ghostLanPort || 29999;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, error: `ghost-lan HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, detail: { persona: data.persona, hits: data.totalHits } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function probeEdge(config) {
  if (!config.edgeStatusUrl) return { ok: false, error: 'edge status URL not configured' };
  try {
    const headers = {};
    if (config.edgeStatusKey) headers.Authorization = `Bearer ${config.edgeStatusKey}`;
    const res = await fetch(config.edgeStatusUrl, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, error: `edge HTTP ${res.status}` };
    const data = await res.json();
    return { ok: Boolean(data.ok ?? data.passive !== false), detail: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function probeTripwire(config) {
  if (!config.tripwireUrl) return { ok: false, skipped: true, error: 'tripwire URL not configured' };
  try {
    const body = JSON.stringify({ t: 'ghost-continuum-probe', d: { probe: true }, ts: Date.now() });
    const res = await fetch(config.tripwireUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function fetchBuiltinValidator(config) {
  const [local, edge, tripwire] = await Promise.all([
    probeLocalhost(config),
    probeEdge(config),
    probeTripwire(config),
  ]);

  const checks = [local, edge].filter((c) => !c.skipped);
  const passed = checks.filter((c) => c.ok).length;
  const events = [];

  if (local.ok) {
    events.push(
      normalizeEvent({
        plane: 'audit',
        type: 'builtin-lan-ok',
        detail: local.detail,
        source: 'builtin-validator',
      }),
    );
  }
  if (edge.ok) {
    events.push(
      normalizeEvent({
        plane: 'audit',
        type: 'builtin-edge-ok',
        detail: edge.detail,
        source: 'builtin-validator',
      }),
    );
  }

  return {
    ok: true,
    armed: config.useBuiltinValidator !== false,
    mode: 'builtin',
    health: { local, edge, tripwire, passed, total: checks.length },
    events,
    panelUrl: null,
    mission: { mode: 'builtin-validator', checks: { local, edge, tripwire } },
    probes: listBuiltinProbes(config),
  };
}

export async function runBuiltinProbe(config, probeId, overrides = {}) {
  const probes = buildBuiltinProbes(config);
  const probe = probes[probeId];
  if (!probe) return { ok: false, error: `unknown probe: ${probeId}` };

  const targets = overrides.targets || probe.targets;
  const scopeCheck = validateMissionTargets(targets, config);
  if (!scopeCheck.ok) {
    return { ok: false, error: 'scope violation', details: scopeCheck.errors };
  }

  const results = {};
  const hosts = targets.map((t) => t.host);

  if (hosts.includes('127.0.0.1')) results.local = await probeLocalhost(config);
  const domain = getPrimaryDomain(config);
  if (domain && hosts.includes(domain)) {
    results.edge = await probeEdge(config);
    results.tripwire = await probeTripwire(config);
  }

  const checks = Object.values(results).filter((r) => r && !r.skipped);
  const ok = checks.length > 0 && checks.every((r) => r.ok);

  return {
    ok,
    mode: 'builtin',
    results,
    event: normalizeEvent({
      plane: 'audit',
      type: ok ? 'scope-probe-complete' : 'scope-probe-failed',
      detail: { probeId, mode: 'builtin', results },
      source: 'builtin-validator',
    }),
  };
}