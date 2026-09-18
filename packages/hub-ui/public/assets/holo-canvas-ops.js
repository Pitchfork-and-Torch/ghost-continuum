/**
 * Canvas 2D map camera, hit-test, and shell rings. No DOM.
 * Used by holo-map.js fallback and Node tests.
 */

export const CANVAS_CAM_DEFAULT = Object.freeze({
  lookX: 0,
  lookY: 0.3,
  lookZ: 0,
  camZ: 14,
});

export function cloneCam(cam = CANVAS_CAM_DEFAULT) {
  return {
    lookX: cam.lookX,
    lookY: cam.lookY,
    lookZ: cam.lookZ,
    camZ: cam.camZ,
  };
}

export function resetCam() {
  return cloneCam(CANVAS_CAM_DEFAULT);
}

export function isThreatState(state) {
  return state === 'breach' || state === 'threat' || state === 'compromised';
}

export function findNodeById(nodes, id) {
  if (!id || !Array.isArray(nodes)) return null;
  return nodes.find((n) => n.id === id) || null;
}

export function findThreatNode(nodes = []) {
  if (!Array.isArray(nodes)) return null;
  return nodes.find((n) => isThreatState(n.state)) || null;
}

export function camLookAt(cam, pos, { camZ } = {}) {
  const next = cloneCam(cam);
  if (!pos) return next;
  next.lookX = Number(pos.x) || 0;
  next.lookY = Number(pos.y) || 0;
  next.lookZ = Number(pos.z) || 0;
  next.camZ = camZ != null ? camZ : Math.min(next.camZ, 10);
  next.camZ = Math.max(6, Math.min(28, next.camZ));
  return next;
}

export function focusNodeCam(cam, nodes, id) {
  const node = findNodeById(nodes, id);
  if (!node) return { cam: cloneCam(cam), node: null };
  return { cam: camLookAt(cam, node.position || { x: 0, y: 0.3, z: 0 }), node };
}

export function focusThreatCam(cam, nodes) {
  const node = findThreatNode(nodes);
  if (!node) return { cam: cloneCam(cam), node: null };
  return {
    cam: camLookAt(cam, node.position || { x: 0, y: 0.3, z: 0 }, { camZ: 9 }),
    node,
  };
}

export function projectCanvas(pos = {}, w, h, cam = CANVAS_CAM_DEFAULT) {
  const scale = 28;
  const camY = 8;
  const relX = (pos.x || 0) - (cam.lookX || 0);
  const relY = (pos.y || 0) - (cam.lookY || 0);
  const relZ = (pos.z || 0) - (cam.lookZ || 0);
  const pz = relZ + (cam.camZ || 14);
  const f = 280 / Math.max(4, pz);
  return {
    x: w / 2 + relX * f * (scale / 28),
    y: h * 0.62 - (relY * f + camY * 2),
    s: f * 0.12,
  };
}

export function hitCanvasNode(nodes, mx, my, w, h, cam, radius = 16) {
  if (!Array.isArray(nodes)) return null;
  for (const n of nodes) {
    const p = projectCanvas(n.position || { x: 0, y: 0.3, z: 0 }, w, h, cam);
    if (Math.hypot(mx - p.x, my - p.y) < radius) return n;
  }
  return null;
}

export function visibleShells(shells, showShells) {
  if (!showShells || !Array.isArray(shells)) return [];
  return shells.filter((s) => s && s.enabled !== false);
}

export function shellRingPoints(shell, w, h, cam, steps = 48) {
  const r = Number(shell?.radius) || 3;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    pts.push(projectCanvas({ x: Math.cos(t) * r, y: 0, z: Math.sin(t) * r }, w, h, cam));
  }
  return pts;
}

export function applyNodeAppearance(nodes, id, { displayLabel, shape } = {}) {
  const node = findNodeById(nodes, id);
  if (!node) return false;
  if (displayLabel != null) {
    node.displayLabel = displayLabel;
    node.label = displayLabel;
  }
  if (shape) node.shape = shape;
  return true;
}
