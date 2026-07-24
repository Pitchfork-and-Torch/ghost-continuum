import { normalizeEvent } from '../../../core/src/events.js';
import { validateMissionTargets, filterOperators } from '../../../core/src/scope.js';
import { getPrimaryDomain } from '../../../core/src/config.js';
import { cellEndpoints } from './cell-wire.js';

export function buildScopeProbes(config) {
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

export function listScopeProbes(config = {}) {
  return Object.entries(buildScopeProbes(config)).map(([id, p]) => ({
    id,
    name: p.label,
    objective: p.note,
    targets: p.targets,
  }));
}

async function cellGet(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchScopeCell(config) {
  const port = config.cellPort || 3333;
  const ep = cellEndpoints(port);

  const [ping, stream, context] = await Promise.all([
    cellGet(ep.ping),
    cellGet(ep.stream),
    cellGet(ep.context),
  ]);

  const cellEvents = [];
  if (Array.isArray(stream)) {
    for (const row of stream.slice(-40)) {
      cellEvents.push(
        normalizeEvent({
          plane: 'audit',
          type: row.type || row.kind || 'cell-signal',
          ts: row.ts || row.timestamp || Date.now(),
          detail: { signal: row.type || row.kind, ts: row.ts },
          source: 'scope-cell',
        }),
      );
    }
  }

  return {
    ok: Boolean(ping?.ok ?? ping?.status === 'ok'),
    armed: Boolean(ping),
    health: ping,
    mission: context,
    events: cellEvents,
    panelUrl: ep.panel,
    probes: listScopeProbes(config),
  };
}

export async function launchScopeProbe(config, probeId, overrides = {}) {
  const probes = buildScopeProbes(config);
  const probe = probes[probeId];
  if (!probe) return { ok: false, error: `unknown probe: ${probeId}` };

  const targets = overrides.targets || probe.targets;
  const scopeCheck = validateMissionTargets(targets, config);
  if (!scopeCheck.ok) {
    return { ok: false, error: 'scope violation', details: scopeCheck.errors };
  }

  const roles = filterOperators(overrides.roles || overrides.operators || probe.roles, config);
  if (!roles.length) {
    return { ok: false, error: 'no authorized roles after filter' };
  }

  const port = config.cellPort || 3333;
  const ep = cellEndpoints(port);
  const body = {
    name: overrides.name || `DM · ${probe.label}`,
    targets,
    operators: roles,
    objective: probe.note,
    defensive: true,
    dmScope: true,
  };

  try {
    const res = await fetch(ep.launch, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      status: res.status,
      data,
      event: normalizeEvent({
        plane: 'audit',
        type: 'scope-probe-start',
        detail: { probeId, roles, targets },
        source: 'ghost-continuum',
      }),
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      hint: 'Start validation cell: npm run cell (set DM_CELL_ROOT in config)',
    };
  }
}