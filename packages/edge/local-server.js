import http from 'http';
import {
  TRIPWIRE,
  SENTINEL,
  STATUS,
  TRIPWIRE_MAX_BYTES,
  clientScript,
  coerceTripwireBody,
  createEdgeState,
  noteObserved,
  publicStatus,
  recordTripwire,
} from './engine.js';

const DEMO_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Ghost Continuum Edge Demo</title></head>
<body><h1>Ghost Continuum</h1><p>Local edge deception plane - dm-passive-v2</p>
<script src="${SENTINEL}" data-dm-protected defer></script></body></html>`;

const VAULT_HTML = `<!DOCTYPE html><html><body><h1>vault</h1><p>Ghost Continuum vault demo</p></body></html>`;

export function startLocalEdgeServer(options = {}) {
  const port = options.port == null || options.port === '' ? 30001 : Number(options.port);
  const siteSeed = options.siteSeed || 'ghost-continuum-local';
  const state = createEdgeState(siteSeed);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const ip = req.socket.remoteAddress?.replace('::ffff:', '') || '127.0.0.1';

    if (url.pathname === STATUS) {
      const body = JSON.stringify(publicStatus(state));
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-DM-Build': state.buildId });
      return res.end(body);
    }

    if (url.pathname === SENTINEL) {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store',
        'X-DM-Gen': String(state.generation),
      });
      return res.end(clientScript(state.paths, state.buildId));
    }

    if (url.pathname === TRIPWIRE && req.method === 'POST') {
      const chunks = [];
      let size = 0;
      let tooLarge = false;
      try {
        for await (const c of req) {
          const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
          size += buf.length;
          if (size > TRIPWIRE_MAX_BYTES) {
            tooLarge = true;
            break;
          }
          chunks.push(buf);
        }
      } catch {
        /* aborted body */
      }
      if (tooLarge) {
        res.writeHead(413, { 'Cache-Control': 'no-store' });
        res.end('payload too large');
        req.destroy();
        return;
      }
      let body = {};
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        body = coerceTripwireBody(raw ? JSON.parse(raw) : {});
      } catch {
        body = {};
      }
      const type = body.t || 'tripwire';
      const result = recordTripwire(state, ip, type, body.d);
      if (!result.allowed) {
        res.writeHead(429);
        return res.end('rate limited');
      }
      res.writeHead(204);
      return res.end();
    }

    if (state.paths.includes(url.pathname)) {
      noteObserved(state, ip);
      res.writeHead(404, { 'X-DM-Trap': '1' });
      return res.end('trap');
    }

    if (url.pathname === '/vault/' || url.pathname === '/vault') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(VAULT_HTML);
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'X-DM-Build': state.buildId,
      });
      return res.end(DEMO_HTML.replace('dm-passive-v2', 'dm-passive-injected dm-passive-v2'));
    }

    res.writeHead(404);
    res.end('not found');
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const bound = server.address();
      const actualPort = bound && typeof bound === 'object' ? bound.port : port;
      resolve({ server, port: actualPort, url: `http://127.0.0.1:${actualPort}`, state });
    });
  });
}