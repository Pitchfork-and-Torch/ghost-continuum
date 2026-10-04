import { startLocalEdgeServer } from '../../edge/local-server.js';

let localEdge = null;

export function getLocalEdge() {
  return localEdge;
}

export async function startManagedLocalEdge(config) {
  if (localEdge?.server?.listening || localEdge?.adopted) return localEdge;
  const port = config.edgeLocalPort || 30001;
  const url = `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${url}/.__dm/status`, { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      localEdge = { server: null, port, url, adopted: true };
      return localEdge;
    }
  } catch {
    /* start fresh */
  }
  localEdge = await startLocalEdgeServer({ port, siteSeed: 'ghost-continuum-local' });
  return localEdge;
}

export async function stopManagedLocalEdge() {
  if (!localEdge) return { ok: true, wasRunning: false };
  if (!localEdge.server) {
    localEdge = null;
    return { ok: true, wasRunning: false, adopted: true };
  }
  const edge = localEdge;
  localEdge = null;
  return new Promise((resolve) => {
    edge.server.close(() => resolve({ ok: true, wasRunning: true }));
  });
}

export function isManagedLocalEdgeRunning() {
  return Boolean(localEdge?.server?.listening);
}