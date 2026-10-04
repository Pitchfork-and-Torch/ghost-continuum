/**
 * Canvas 2D fallback camera, focus, and shells. No WebGL.
 */
import assert from 'assert';
import {
  resetCam,
  cloneCam,
  projectCanvas,
  hitCanvasNode,
  findNodeById,
  findThreatNode,
  focusNodeCam,
  focusThreatCam,
  visibleShells,
  shellRingPoints,
  applyNodeAppearance,
  beginOrbitDrag,
  moveOrbitDrag,
  endOrbitDrag,
  zoomOrbit,
  idleOrbit,
  eyeFromCam,
  CANVAS_CAM_DEFAULT,
  ORBIT_PHI_MIN,
  ORBIT_PHI_MAX,
  ORBIT_RADIUS_MIN,
  ORBIT_RADIUS_MAX,
} from '../packages/hub-ui/public/assets/holo-canvas-ops.js';

function ok(name) {
  console.log(`  ✓ ${name}`);
}

const nodes = [
  { id: 'core', state: 'protected', position: { x: 0, y: 0.4, z: 0 }, label: 'NEXUS' },
  { id: 'edge-04', state: 'breach', position: { x: 4, y: 0.5, z: -2 }, label: 'COMPROMISED-EDGE-04' },
  { id: 'lan', state: 'healthy', position: { x: -3, y: 0.3, z: 1 }, label: 'LAN' },
];

{
  assert.equal(findThreatNode(nodes)?.id, 'edge-04');
  assert.equal(findNodeById(nodes, 'lan')?.label, 'LAN');
  assert.equal(findNodeById(nodes, 'nope'), null);
  ok('find threat + node by id');
}

{
  const cam0 = resetCam();
  assert.equal(cam0.lookX, CANVAS_CAM_DEFAULT.lookX);
  assert.equal(cam0.camZ, 14);
  const focused = focusNodeCam(cam0, nodes, 'edge-04');
  assert.equal(focused.node.id, 'edge-04');
  assert.equal(focused.cam.lookX, 4);
  assert.equal(focused.cam.lookZ, -2);
  assert.ok(focused.cam.camZ <= 10, 'focusNode zooms in');
  const threat = focusThreatCam(cam0, nodes);
  assert.equal(threat.node.id, 'edge-04');
  assert.equal(threat.cam.camZ, 9);
  const missing = focusNodeCam(cam0, nodes, 'ghost');
  assert.equal(missing.node, null);
  assert.deepStrictEqual(missing.cam, cloneCam(cam0));
  ok('focusNode / focusThreat pan the camera');
}

{
  const wide = projectCanvas({ x: 4, y: 0.5, z: -2 }, 640, 400, resetCam());
  const tight = projectCanvas({ x: 4, y: 0.5, z: -2 }, 640, 400, focusNodeCam(resetCam(), nodes, 'edge-04').cam);
  assert.ok(Math.abs(tight.x - 320) < Math.abs(wide.x - 320), 'focused node moves toward canvas center');
  const hit = hitCanvasNode(nodes, tight.x, tight.y, 640, 400, focusNodeCam(resetCam(), nodes, 'edge-04').cam);
  assert.equal(hit?.id, 'edge-04');
  ok('project + hit-test honor camera');
}

{
  const shells = [
    { id: 'edge', radius: 4, color: '#00e5ff', enabled: true, health: 1 },
    { id: 'off', radius: 8, enabled: false },
  ];
  assert.equal(visibleShells(shells, true).length, 1);
  assert.equal(visibleShells(shells, false).length, 0);
  const ring = shellRingPoints(shells[0], 640, 400, resetCam());
  assert.ok(ring.length > 8);
  assert.ok(Number.isFinite(ring[0].x) && Number.isFinite(ring[0].y));
  ok('shell rings draw when enabled');
}

{
  const copy = nodes.map((n) => ({ ...n }));
  assert.equal(applyNodeAppearance(copy, 'lan', { displayLabel: 'HOME-LAN', shape: 'box' }), true);
  assert.equal(findNodeById(copy, 'lan').displayLabel, 'HOME-LAN');
  assert.equal(findNodeById(copy, 'lan').shape, 'box');
  assert.equal(applyNodeAppearance(copy, 'nope', { displayLabel: 'x' }), false);
  ok('updateNodeAppearance mutates the scene node');
}

{
  const cam = resetCam();
  assert.equal(cam.theta, 0.55);
  assert.equal(cam.phi, 0.85);
  assert.equal(cam.radius, 14);
  const look = projectCanvas({ x: cam.lookX, y: cam.lookY, z: cam.lookZ }, 640, 400, cam);
  assert.ok(Math.abs(look.x - 320) < 0.01, 'look target stays on center x');
  assert.ok(Math.abs(look.y - 400 * 0.62) < 0.01, 'look target stays on the horizon line');
  const eye = eyeFromCam(cam);
  const dist = Math.hypot(eye.eye.x - eye.target.x, eye.eye.y - eye.target.y, eye.eye.z - eye.target.z);
  assert.ok(Math.abs(dist - 14) < 1e-6, 'default eye sits on the radius sphere');
  ok('default orbit matches the WebGL sphere');
}

{
  const start = resetCam();
  const node = { x: 4, y: 0.5, z: -2 };
  const before = projectCanvas(node, 640, 400, start);
  const drag = beginOrbitDrag(start, 10, 20);
  const yaw = moveOrbitDrag(drag, 250, 20);
  assert.ok(Math.abs(yaw.cam.theta - (start.theta + 1.2)) < 1e-9);
  assert.equal(yaw.cam.lookX, start.lookX);
  assert.equal(yaw.cam.lookY, start.lookY);
  assert.equal(yaw.cam.lookZ, start.lookZ);
  const after = projectCanvas(node, 640, 400, yaw.cam);
  const shift = Math.hypot(after.x - before.x, after.y - before.y);
  assert.ok(shift > 32, `yaw must clear a hit radius, moved ${shift.toFixed(1)}px`);
  assert.equal(hitCanvasNode(nodes, after.x, after.y, 640, 400, yaw.cam)?.id, 'edge-04');
  assert.notEqual(hitCanvasNode(nodes, before.x, before.y, 640, 400, yaw.cam)?.id, 'edge-04');
  const lookAfter = projectCanvas({ x: start.lookX, y: start.lookY, z: start.lookZ }, 640, 400, yaw.cam);
  assert.ok(Math.abs(lookAfter.x - 320) < 0.01, 'orbit keeps the look target centered');
  const pitched = moveOrbitDrag(beginOrbitDrag(start, 0, 0), 0, 5000);
  assert.equal(pitched.cam.phi, ORBIT_PHI_MAX);
  const lifted = moveOrbitDrag(beginOrbitDrag(start, 0, 0), 0, -5000);
  assert.equal(lifted.cam.phi, ORBIT_PHI_MIN);
  assert.equal(endOrbitDrag(drag, 250, 20).click, false);
  assert.equal(endOrbitDrag(drag, 12, 21).click, true);
  ok('pointer drag orbits and a short press still clicks');
}

{
  const start = resetCam();
  const near = zoomOrbit(start, -100000);
  const far = zoomOrbit(start, 100000);
  assert.equal(near.radius, ORBIT_RADIUS_MIN);
  assert.equal(near.camZ, ORBIT_RADIUS_MIN);
  assert.equal(far.radius, ORBIT_RADIUS_MAX);
  assert.equal(far.lookX, start.lookX);
  const look = projectCanvas({ x: far.lookX, y: far.lookY, z: far.lookZ }, 640, 400, far);
  assert.ok(Math.abs(look.x - 320) < 0.01, 'zoom does not pan');
  const spun = idleOrbit(start, {});
  assert.ok(Math.abs(spun.theta - start.theta - 0.0012) < 1e-12);
  assert.equal(idleOrbit(start, { paused: true }).theta, start.theta);
  assert.equal(idleOrbit(start, { reduceMotion: true }).theta, start.theta);
  assert.equal(idleOrbit(start, { dragging: true }).theta, start.theta);
  ok('wheel zoom clamps, idle spin yields to pause and reduced motion');
}

console.log('\nCanvas fallback ops passed.\n');
