/**
 * Hub UI event-stream parser and reconnect reader.
 */
import assert from 'assert';
import {
  createSseParser,
  pushSseChunk,
  nextStreamDelay,
  openHubEventStream,
  SSE_DEFAULT_RETRY_MS,
  SSE_MAX_RETRY_MS,
} from '../packages/hub-ui/public/assets/sse-client.js';

assert.strictEqual(nextStreamDelay(250, 0), 250);
assert.strictEqual(nextStreamDelay(250, 1), 500);
assert.strictEqual(nextStreamDelay(0, 0), SSE_DEFAULT_RETRY_MS);
assert.strictEqual(nextStreamDelay(20000, 2), SSE_MAX_RETRY_MS);

{
  const parser = createSseParser();
  const first = pushSseChunk(parser, 'event: morph-switch\ndata: {"a":');
  assert.strictEqual(first.length, 0);
  const second = pushSseChunk(parser, '1}\n\n');
  assert.strictEqual(second.length, 1);
  assert.strictEqual(second[0].type, 'morph-switch');
  assert.strictEqual(second[0].data, '{"a":1}');
}

{
  const parser = createSseParser();
  const frames = pushSseChunk(
    parser,
    ': heartbeat 1\r\nevent: connected\r\ndata: {"ok":true}\r\nid: 9\r\nretry: 250\r\n\r\n',
  );
  assert.strictEqual(frames.length, 1);
  assert.strictEqual(frames[0].type, 'connected');
  assert.strictEqual(frames[0].data, '{"ok":true}');
  assert.strictEqual(frames[0].lastEventId, '9');
  assert.strictEqual(parser.retry, 250);
}

{
  const parser = createSseParser();
  assert.strictEqual(pushSseChunk(parser, 'data: hi\r').length, 0);
  const frames = pushSseChunk(parser, '\n\n');
  assert.strictEqual(frames.length, 1);
  assert.strictEqual(frames[0].data, 'hi');
  assert.strictEqual(frames[0].type, 'message');
}

{
  const parser = createSseParser();
  const frames = pushSseChunk(parser, 'data: a\ndata: b\n\n');
  assert.strictEqual(frames[0].data, 'a\nb');
}

{
  const parser = createSseParser();
  const frames = pushSseChunk(parser, 'id: 1\nid: 2\u0000x\ndata: z\nretry: abc\n\n');
  assert.strictEqual(frames.length, 1);
  assert.strictEqual(frames[0].lastEventId, '1');
  assert.strictEqual(parser.retry, null);
}

{
  const parser = createSseParser();
  const frames = pushSseChunk(parser, '\uFEFFevent: connected\ndata: {}\n\n');
  assert.strictEqual(frames[0].type, 'connected');
  assert.strictEqual(frames[0].data, '{}');
}

{
  const encoder = new TextEncoder();
  const seen = [];
  const pending = [];
  let fetches = 0;
  const fetchImpl = async (url, init) => {
    fetches += 1;
    seen.push({ url: String(url), headers: { ...init.headers } });
    if (fetches === 1) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('id: 7\nevent: connected\ndata: {"ts":1}\nretry: 250\n\n'));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return new Response('no', { status: 401 });
  };

  let frame;
  const opened = openHubEventStream({
    url: '/api/events/stream',
    headers: () => ({ Authorization: 'Bearer test-token' }),
    fetchImpl,
    schedule: (fn, ms) => {
      pending.push({ fn, ms });
      return pending.length;
    },
    clearSchedule: () => {},
    onEvent(ev) { frame = ev; },
  });

  for (let i = 0; i < 20 && !frame; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(frame, 'expected a connected frame');
  assert.strictEqual(frame.type, 'connected');
  assert.strictEqual(frame.data, '{"ts":1}');
  assert.strictEqual(frame.lastEventId, '7');
  assert.ok(!seen[0].url.includes('token'));
  assert.ok(!seen[0].url.includes('?'));
  assert.strictEqual(seen[0].headers.Authorization, 'Bearer test-token');
  assert.strictEqual(seen[0].headers['Last-Event-ID'], undefined);

  for (let i = 0; i < 20 && pending.length < 1; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].ms, 250);
  pending[0].fn();
  for (let i = 0; i < 20 && fetches < 2; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.strictEqual(fetches, 2);
  assert.strictEqual(seen[1].headers['Last-Event-ID'], '7');
  assert.strictEqual(seen[1].headers.Authorization, 'Bearer test-token');
  assert.ok(!seen[1].url.includes('token'));

  for (let i = 0; i < 20 && pending.length < 2; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.strictEqual(pending[1].ms, 500);
  opened.close();
  const before = fetches;
  pending[1].fn();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(fetches, before);
}

console.log('sse-client: OK');
