import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export const PLANE_ID = 'phantom-mesh';
export const MESH_DIR = path.join(os.homedir(), '.ghost-continuum', 'mesh');

/**
 * Privacy-preserving file-based gossip — shares sanitized genome fitness summaries only.
 * No raw IPs or payloads cross nodes.
 */

export function meshNodeId(config) {
  const seed = config?.continuum?.planes?.phantomMeshNodeId || os.hostname();
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

export function publishStrategy(config, summary) {
  if (config?.continuum?.planes?.phantomMesh !== true) return { ok: false, skipped: true };

  fs.mkdirSync(MESH_DIR, { recursive: true });
  const nodeId = meshNodeId(config);
  const payload = {
    v: 1,
    nodeId,
    ts: Date.now(),
    sanitized: true,
    championArchetype: summary.championArchetype || 'unknown',
    avgFitness: summary.avgFitness || 0,
    topTraits: summary.topTraits || {},
    engagements: summary.engagements || 0,
    hash: null,
  };
  const body = JSON.stringify({ ...payload, hash: null });
  payload.hash = crypto.createHash('sha256').update(body).digest('hex');

  const file = path.join(MESH_DIR, `${nodeId}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return { ok: true, nodeId, path: file };
}

export function ingestPeerStrategies(config) {
  if (config?.continuum?.planes?.phantomMesh !== true) return [];

  const peers = config?.continuum?.planes?.phantomMeshPeers || [];
  const local = [];

  if (fs.existsSync(MESH_DIR)) {
    for (const f of fs.readdirSync(MESH_DIR).filter((x) => x.endsWith('.json'))) {
      try {
        local.push(JSON.parse(fs.readFileSync(path.join(MESH_DIR, f), 'utf8')));
      } catch {
        /* skip */
      }
    }
  }

  for (const peerDir of peers) {
    if (!fs.existsSync(peerDir)) continue;
    for (const f of fs.readdirSync(peerDir).filter((x) => x.endsWith('.json'))) {
      try {
        local.push(JSON.parse(fs.readFileSync(path.join(peerDir, f), 'utf8')));
      } catch {
        /* skip */
      }
    }
  }

  return local.sort((a, b) => (b.avgFitness || 0) - (a.avgFitness || 0));
}

export function federatedRecommendations(strategies = []) {
  if (!strategies.length) return null;
  const traitVotes = {};
  for (const s of strategies) {
    for (const [k, v] of Object.entries(s.topTraits || {})) {
      if (!traitVotes[k]) traitVotes[k] = [];
      traitVotes[k].push(v);
    }
  }
  const recommended = {};
  for (const [k, vals] of Object.entries(traitVotes)) {
    recommended[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return {
    nodes: strategies.length,
    topArchetype: strategies[0]?.championArchetype,
    recommendedTraits: recommended,
    avgFitness: strategies.reduce((s, x) => s + (x.avgFitness || 0), 0) / strategies.length,
  };
}

export function status(config) {
  const enabled = config?.continuum?.planes?.phantomMesh === true;
  const strategies = enabled ? ingestPeerStrategies(config) : [];
  const fed = federatedRecommendations(strategies);
  const nodeId = enabled ? meshNodeId(config) : null;
  const hasLocalNode = enabled && nodeId && fs.existsSync(path.join(MESH_DIR, `${nodeId}.json`));
  const active = enabled && (strategies.length > 0 || hasLocalNode);
  return {
    id: PLANE_ID,
    label: 'Phantom Mesh',
    armed: active,
    enabled,
    phase: 2,
    nodeId,
    peerCount: strategies.length,
    federation: fed,
    message: !enabled
      ? 'Disabled — toggle on to federate deception strategies'
      : active
        ? `Mesh active — ${strategies.length} strategy node(s)`
        : 'Enabled — publishing mesh node…',
  };
}