/**
 * Per-node operator customizations (rename, shape) — localStorage only.
 */

const KEY = 'gc-node-meta-v1';

export const NODE_SHAPES = [
  { id: 'sphere', label: 'Sphere' },
  { id: 'icosahedron', label: 'Icosahedron' },
  { id: 'octahedron', label: 'Octahedron' },
  { id: 'box', label: 'Cube' },
  { id: 'tetrahedron', label: 'Tetrahedron' },
  { id: 'torus', label: 'Torus' },
  { id: 'dodecahedron', label: 'Dodecahedron' },
];

export function loadNodeMeta() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function saveNodeMeta(map) {
  localStorage.setItem(KEY, JSON.stringify(map || {}));
  return map;
}

export function getNodeMeta(id) {
  if (!id) return {};
  return loadNodeMeta()[id] || {};
}

export function setNodeMeta(id, patch = {}) {
  if (!id) return {};
  const all = loadNodeMeta();
  const next = {
    ...(all[id] || {}),
    ...patch,
    updatedAt: Date.now(),
  };
  // Drop empty customLabel
  if (next.customLabel != null && !String(next.customLabel).trim()) delete next.customLabel;
  if (!next.shape || next.shape === 'auto') delete next.shape;
  if (!next.customLabel && !next.shape && !next.notes) {
    delete all[id];
  } else {
    all[id] = next;
  }
  saveNodeMeta(all);
  return all[id] || {};
}

export function clearNodeMeta(id) {
  const all = loadNodeMeta();
  delete all[id];
  saveNodeMeta(all);
}

/** Apply stored meta onto a node object (display fields). */
export function decorateNode(node) {
  if (!node?.id) return node;
  const m = getNodeMeta(node.id);
  return {
    ...node,
    displayLabel: m.customLabel || node.label || node.id,
    shape: m.shape || (node.isCore ? 'icosahedron' : 'sphere'),
    operatorNotes: m.notes || '',
    meta: m,
  };
}

export function decorateScene(data) {
  if (!data?.nodes) return data;
  return {
    ...data,
    nodes: data.nodes.map(decorateNode),
  };
}
