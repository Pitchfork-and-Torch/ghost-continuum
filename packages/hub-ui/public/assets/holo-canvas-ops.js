/**
 * Canvas 2D map camera, hit-test, and shell rings. No DOM.
 * Used by holo-map.js fallback and Node tests.
 */

/** Same spherical defaults as the WebGL map (theta, phi, radius). */
export const CANVAS_CAM_DEFAULT = Object.freeze({
  lookX: 0,
  lookY: 0.3,
  lookZ: 0,
  camZ: 14,
  theta: 0.55,
  phi: 0.85,
  radius: 14,
});

export const ORBIT_PHI_MIN = 0.25;
export const ORBIT_PHI_MAX = 1.35;
export const ORBIT_RADIUS_MIN = 6;
export const ORBIT_RADIUS_MAX = 28;
export const ORBIT_CLICK_PX = 5;

export function cloneCam(cam = CANVAS_CAM_DEFAULT) {
  return {
    lookX: cam.lookX,
    lookY: cam.lookY,
    lookZ: cam.lookZ,
    camZ: cam.camZ,
    theta: cam.theta,
    phi: cam.phi,
    radius: cam.radius,
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
  const z = camZ != null ? camZ : Math.min(next.radius ?? next.camZ ?? 14, 10);
  next.radius = Math.max(ORBIT_RADIUS_MIN, Math.min(ORBIT_RADIUS_MAX, z));
  next.camZ = next.radius;
  return next;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Pointer-down snapshot. Later camera edits must not move the drag origin. */
export function beginOrbitDrag(cam, x, y) {
  const snap = cloneCam(cam);
  return { x, y, theta: snap.theta, phi: snap.phi, cam: snap };
}

/** dx/dy use the WebGL map gains: 0.005 yaw, 0.004 pitch. Look target stays put. */
export function moveOrbitDrag(drag, x, y) {
  const dx = x - drag.x;
  const dy = y - drag.y;
  const cam = cloneCam(drag.cam);
  cam.theta = drag.theta + dx * 0.005;
  cam.phi = clamp(drag.phi + dy * 0.004, ORBIT_PHI_MIN, ORBIT_PHI_MAX);
  return { cam, moved: Math.hypot(dx, dy) };
}

export function endOrbitDrag(drag, x, y) {
  const moved = Math.hypot(x - drag.x, y - drag.y);
  return { click: moved <= ORBIT_CLICK_PX, moved };
}

export function zoomOrbit(cam, deltaY) {
  const next = cloneCam(cam);
  const r = (Number(next.radius) || Number(next.camZ) || 14) + deltaY * 0.01;
  next.radius = clamp(r, ORBIT_RADIUS_MIN, ORBIT_RADIUS_MAX);
  next.camZ = next.radius;
  return next;
}

/** Idle spin matches the WebGL map. Paused, reduced-motion, and an active drag do not spin. */
export function idleOrbit(cam, flags = {}) {
  const next = cloneCam(cam);
  if (flags.paused || flags.reduceMotion || flags.dragging) return next;
  next.theta = (Number(next.theta) || 0) + 0.0012;
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

function norm3(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Eye on the same sphere the WebGL camera uses. */
export function eyeFromCam(cam = CANVAS_CAM_DEFAULT) {
  const target = {
    x: cam.lookX || 0,
    y: cam.lookY || 0,
    z: cam.lookZ || 0,
  };
  const theta = cam.theta ?? CANVAS_CAM_DEFAULT.theta;
  const phi = cam.phi ?? CANVAS_CAM_DEFAULT.phi;
  const radius = cam.radius ?? cam.camZ ?? CANVAS_CAM_DEFAULT.radius;
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  return {
    target,
    eye: {
      x: target.x + radius * sp * Math.cos(theta),
      y: target.y + radius * cp,
      z: target.z + radius * sp * Math.sin(theta),
    },
  };
}

export function projectCanvas(pos = {}, w, h, cam = CANVAS_CAM_DEFAULT) {
  const { target, eye } = eyeFromCam(cam);
  const backward = norm3({
    x: eye.x - target.x,
    y: eye.y - target.y,
    z: eye.z - target.z,
  });
  const forward = { x: -backward.x, y: -backward.y, z: -backward.z };
  let upRef = { x: 0, y: 1, z: 0 };
  if (Math.abs(dot3(forward, upRef)) > 0.98) upRef = { x: 0, y: 0, z: 1 };
  const right = norm3(cross3(upRef, backward));
  const up = cross3(backward, right);
  const v = {
    x: (pos.x || 0) - eye.x,
    y: (pos.y || 0) - eye.y,
    z: (pos.z || 0) - eye.z,
  };
  const depth = Math.max(0.5, dot3(v, forward));
  const f = 280 / depth;
  return {
    x: w / 2 + dot3(v, right) * f,
    y: h * 0.62 - dot3(v, up) * f,
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
