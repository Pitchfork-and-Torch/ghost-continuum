import { fetchScopeCell, launchScopeProbe as launchCellProbe, listScopeProbes } from './scope-cell.js';
import { fetchBuiltinValidator, runBuiltinProbe, listBuiltinProbes } from './builtin-validator.js';
import { resolveCellRoot } from './cell-wire.js';

export function isAuditEnabled(config) {
  return config?.continuum?.corePlanes?.audit !== false;
}

export async function fetchAudit(config) {
  if (!isAuditEnabled(config)) {
    return {
      ok: false,
      armed: false,
      enabled: false,
      mode: 'disabled',
      events: [],
      panelUrl: null,
      probes: [],
      mission: null,
    };
  }

  const cellRoot = resolveCellRoot(config);
  if (cellRoot) {
    const cell = await fetchScopeCell(config);
    if (cell.armed) return { ...cell, mode: 'cell' };
  }

  if (config.useBuiltinValidator !== false) {
    return fetchBuiltinValidator(config);
  }

  return {
    ok: false,
    armed: false,
    mode: 'none',
    events: [],
    panelUrl: null,
    probes: listBuiltinProbes(config),
    mission: null,
  };
}

export function listAuditProbes(config) {
  const cellRoot = resolveCellRoot(config);
  if (cellRoot) return listScopeProbes(config);
  return listBuiltinProbes(config);
}

export async function launchAuditProbe(config, probeId, overrides = {}) {
  const cellRoot = resolveCellRoot(config);
  if (cellRoot) {
    const cell = await fetchScopeCell(config);
    if (cell.armed) return launchCellProbe(config, probeId, overrides);
  }
  return runBuiltinProbe(config, probeId, overrides);
}