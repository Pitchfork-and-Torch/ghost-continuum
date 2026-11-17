/**
 * Fetch-based Server-Sent Events reader for the Command Nexus.
 * The caller supplies headers (Authorization). The token is never put in the URL.
 * Event ids are remembered and sent as Last-Event-ID on the next connect.
 */

export const SSE_DEFAULT_RETRY_MS = 1000;
export const SSE_MAX_RETRY_MS = 30000;
const MAX_BUFFER = 1024 * 1024;

export function nextStreamDelay(retryMs, attempt) {
  const base = Number.isFinite(retryMs) && retryMs > 0 ? retryMs : SSE_DEFAULT_RETRY_MS;
  const pow = 2 ** Math.min(Math.max(0, attempt), 16);
  return Math.min(SSE_MAX_RETRY_MS, base * pow);
}

export function createSseParser() {
  return {
    buffer: '',
    event: '',
    data: [],
    id: '',
    retry: null,
    started: false,
  };
}

function takeLines(buffer) {
  const lines = [];
  let i = 0;
  let start = 0;
  while (i < buffer.length) {
    const c = buffer[i];
    if (c === '\n') {
      lines.push(buffer.slice(start, i));
      i += 1;
      start = i;
      continue;
    }
    if (c === '\r') {
      if (i + 1 >= buffer.length) break;
      lines.push(buffer.slice(start, i));
      i += buffer[i + 1] === '\n' ? 2 : 1;
      start = i;
      continue;
    }
    i += 1;
  }
  return { lines, rest: buffer.slice(start) };
}

function dispatch(parser) {
  if (parser.data.length === 0) {
    parser.event = '';
    return null;
  }
  const frame = {
    type: parser.event || 'message',
    data: parser.data.join('\n'),
    lastEventId: parser.id,
  };
  parser.data = [];
  parser.event = '';
  return frame;
}

function applyLine(parser, line) {
  if (line === '') return dispatch(parser);
  if (line.startsWith(':')) return null;
  const colon = line.indexOf(':');
  let field;
  let value;
  if (colon === -1) {
    field = line;
    value = '';
  } else {
    field = line.slice(0, colon);
    value = line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
  }
  if (field === 'event') parser.event = value;
  else if (field === 'data') parser.data.push(value);
  else if (field === 'id') {
    if (!value.includes('\0')) parser.id = value;
  } else if (field === 'retry' && /^\d+$/.test(value)) {
    parser.retry = Number(value);
  }
  return null;
}

export function pushSseChunk(parser, chunk) {
  let text = String(chunk ?? '');
  if (!parser.started) {
    parser.started = true;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  }
  parser.buffer += text;
  if (parser.buffer.length > MAX_BUFFER) {
    parser.buffer = '';
    parser.data = [];
    parser.event = '';
    const err = new Error('sse buffer exceeded');
    err.code = 'SSE_BUFFER';
    throw err;
  }
  const { lines, rest } = takeLines(parser.buffer);
  parser.buffer = rest;
  const frames = [];
  for (const line of lines) {
    const frame = applyLine(parser, line);
    if (frame) frames.push(frame);
  }
  return frames;
}

function headerBag(headers) {
  const provided = typeof headers === 'function' ? (headers() || {}) : (headers || {});
  return { ...provided };
}

/**
 * Open a reconnecting event stream.
 * headers may be an object or a function (called on every attempt).
 * schedule / clearSchedule are injectable for tests.
 */
export function openHubEventStream({
  url,
  headers = {},
  fetchImpl = globalThis.fetch,
  onEvent,
  onError,
  onStatus,
  schedule = (fn, ms) => setTimeout(fn, ms),
  clearSchedule = (id) => clearTimeout(id),
} = {}) {
  let closed = false;
  let attempt = 0;
  let retryMs = SSE_DEFAULT_RETRY_MS;
  let lastEventId = '';
  let timer = null;
  let controller = null;
  let generation = 0;

  function requestHeaders() {
    const out = {
      Accept: 'text/event-stream',
      ...headerBag(headers),
    };
    if (lastEventId) out['Last-Event-ID'] = lastEventId;
    else delete out['Last-Event-ID'];
    return out;
  }

  function arm() {
    if (closed) return;
    const delay = nextStreamDelay(retryMs, attempt);
    attempt += 1;
    timer = schedule(() => {
      timer = null;
      connect();
    }, delay);
  }

  async function connect() {
    if (closed || typeof fetchImpl !== 'function') return;
    const gen = ++generation;
    controller = new AbortController();
    const parser = createSseParser();
    parser.id = lastEventId;
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: requestHeaders(),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'same-origin',
      });
    } catch (err) {
      if (closed || gen !== generation || err?.name === 'AbortError') return;
      onStatus?.('error');
      onError?.(err);
      arm();
      return;
    }
    if (closed || gen !== generation) return;
    if (!res.ok || !res.body) {
      try { await res.body?.cancel?.(); } catch { /* ignore */ }
      onStatus?.('error');
      onError?.(new Error(`stream ${res.status || 0}`));
      arm();
      return;
    }
    attempt = 0;
    onStatus?.('open');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (!closed && gen === generation) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const frames = pushSseChunk(parser, text);
        if (Number.isFinite(parser.retry) && parser.retry > 0) retryMs = parser.retry;
        lastEventId = parser.id;
        for (const frame of frames) onEvent?.(frame);
      }
      const tail = decoder.decode();
      if (tail) {
        const frames = pushSseChunk(parser, tail);
        if (Number.isFinite(parser.retry) && parser.retry > 0) retryMs = parser.retry;
        lastEventId = parser.id;
        for (const frame of frames) onEvent?.(frame);
      }
    } catch (err) {
      if (closed || gen !== generation || err?.name === 'AbortError') return;
      onStatus?.('error');
      onError?.(err);
      arm();
      return;
    }
    if (closed || gen !== generation) return;
    onStatus?.('error');
    onError?.(new Error('stream closed'));
    arm();
  }

  connect();

  return {
    close() {
      closed = true;
      generation += 1;
      if (timer != null) clearSchedule(timer);
      timer = null;
      try { controller?.abort(); } catch { /* ignore */ }
    },
  };
}
