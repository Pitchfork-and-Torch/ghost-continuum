/**
 * Server-Sent Events bus for Command Nexus live push.
 * Zero deps — native Node http. Clients: EventSource('/api/events/stream').
 */

import { EventEmitter } from 'events';

const bus = new EventEmitter();
bus.setMaxListeners(100);

const clients = new Set();

export function publishEvent(type, payload = {}) {
  const envelope = {
    type,
    ts: Date.now(),
    payload,
  };
  bus.emit('event', envelope);
  const data = `event: ${type}\ndata: ${JSON.stringify(envelope)}\n\n`;
  for (const res of clients) {
    try {
      res.write(data);
    } catch {
      clients.delete(res);
    }
  }
  return envelope;
}

export function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now(), version: '2.0' })}\n\n`);

  clients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

export function clientCount() {
  return clients.size;
}

export function subscribe(fn) {
  bus.on('event', fn);
  return () => bus.off('event', fn);
}
