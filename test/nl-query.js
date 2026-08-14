/**
 * NL query 3.5 - time windows, IP AND, extra intents
 */
import assert from 'assert';
import {
  parseTimeWindow,
  parseIpHint,
  parseNlQuery,
  runNlQuery,
  eventTimestampMs,
} from '../packages/hub-api/src/nl-query.js';

const now = 1_700_000_000_000;

{
  const w = parseTimeWindow('show me last 24h scanners', now);
  assert.equal(w.label, 'last 24 hours');
  assert.equal(w.since, now - 86400000);
  assert.equal(parseTimeWindow('last hour', now).label, 'last hour');
  assert.equal(parseTimeWindow('last 7d', now).label, 'last 7 days');
  assert.equal(parseTimeWindow('just scanners', now).ms, null);
  console.log('  ok time windows');
}

{
  assert.equal(parseIpHint('what did 10.0.0.8 do'), '10.0.0.8');
  assert.equal(parseIpHint('no ip here'), null);
  console.log('  ok ip hint');
}

{
  const q = parseNlQuery('show me last 24h scanners');
  assert.equal(q.intent, 'scanning');
  assert.equal(q.window.label, 'last 24 hours');
  console.log('  ok intent + window together');
}

{
  const events = [
    { type: 'honeypot-http', ip: '10.0.0.8', ts: now - 1000, detail: { probeClass: 'scanner', ua: 'nmap' } },
    { type: 'honeypot-http', ip: '10.0.0.9', ts: now - 2 * 86400000, detail: { probeClass: 'scanner', ua: 'nmap' } },
    { type: 'trap-trip', ip: '10.0.0.8', ts: now - 2000, detail: {} },
  ];
  const r = runNlQuery('show me last 24h scanners', events, [], now);
  assert.equal(r.matchCount, 1);
  assert.equal(r.events[0].ip, '10.0.0.8');
  assert.ok(r.summary.includes('last 24 hours'));
  console.log('  ok 24h actually filters old events');
}

{
  const events = [
    { type: 'honeypot-http', ip: '10.0.0.8', ts: now - 10, detail: { ua: 'nmap' } },
    { type: 'honeypot-http', ip: '10.0.0.9', ts: now - 10, detail: { ua: 'nmap' } },
  ];
  const r = runNlQuery('scanners on 10.0.0.8', events, [], now);
  assert.equal(r.ip, '10.0.0.8');
  assert.equal(r.matchCount, 1);
  console.log('  ok IP AND-filter');
}

{
  assert.equal(eventTimestampMs({ ts: 1700000000 }, now), 1700000000000);
  assert.equal(parseNlQuery('seal the merkle ledger').intent, 'forensics / ledger');
  console.log('  ok extra intents + epoch seconds');
}

console.log('nl-query 3.5 ok');
