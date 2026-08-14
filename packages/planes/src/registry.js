import * as phantomMesh from './phantom-mesh.js';
import * as deepVeil from './deep-veil.js';
import * as mirageCore from './mirage-core.js';
import * as trenchCloak from './trench-cloak.js';

const EXTENDED_PLANES = [phantomMesh, deepVeil, mirageCore, trenchCloak];

function corePlaneEnabled(config, planeId) {
  const key = planeId === 'ghost-lan' ? 'ghostLan' : planeId;
  return config?.continuum?.corePlanes?.[key] !== false;
}

export function collectPlaneStatus(config) {
  const core = [
    (() => {
      const enabled = corePlaneEnabled(config, 'ghost-lan');
      return {
        id: 'ghost-lan',
        label: 'Ghost LAN',
        armed: enabled,
        enabled,
        phase: 1,
        message: enabled ? 'Ghost LAN enabled' : 'Disabled — toggle on to start honeypot',
      };
    })(),
    (() => {
      const enabled = corePlaneEnabled(config, 'edge');
      return {
        id: 'edge',
        label: 'Edge',
        armed: enabled,
        enabled,
        phase: 1,
        message: enabled ? `Edge enabled (${config.edgeMode || 'local'})` : 'Disabled — toggle on for perimeter tripwire',
      };
    })(),
    (() => {
      const enabled = corePlaneEnabled(config, 'audit');
      return {
        id: 'audit',
        label: 'Audit',
        armed: enabled,
        enabled,
        phase: 1,
        message: enabled ? 'Audit enabled' : 'Disabled — toggle on for scope validation',
      };
    })(),
    (() => {
      const enabled = config?.continuum?.narrative?.enabled === true;
      const worldId = config?.continuum?.narrative?.worldId || 'default';
      return {
        id: 'narrative-weave',
        label: 'Narrative Weave',
        armed: enabled,
        enabled,
        phase: 1,
        message: enabled
          ? `Echo world active — ${worldId}`
          : 'Disabled — toggle on for narrative deception layer',
      };
    })(),
  ];

  const extended = EXTENDED_PLANES.map((p) => p.status(config));
  return [...core, ...extended];
}

export function listPlaneModules() {
  return EXTENDED_PLANES.map((p) => p.PLANE_ID);
}