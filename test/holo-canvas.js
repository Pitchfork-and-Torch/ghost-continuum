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
  CANVAS_CAM_DEFAULT,
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

console.log('\nCanvas fallback ops passed.\n');
