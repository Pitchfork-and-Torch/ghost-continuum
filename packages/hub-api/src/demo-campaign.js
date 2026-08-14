/**
 * Built-in simulation campaign — synthetic attack timeline for demo glory.
 * Defensive-only sample data. No real network traffic generated.
 */

import fs from 'fs';
import { appendEvent, readEvents, EVENTS_PATH } from '../../core/src/index.js';
import { normalizeEvent } from '../../core/src/events.js';

export function isDemoEvent(e) {
  if (!e) return false;
  if (e.source === 'demo' || e.source === 'demo-campaign') return true;
  if (e.detail?.demoCampaign === true || e.detail?.demo === true || e.detail?.simulated === true) return true;
  if (String(e.type || '').startsWith('demo-')) return true;
  if (e.type === 'demo-campaign-inject' || e.type === 'demo-mode') return true;
  return false;
}

/** Events for live / real map — strips synthetic demo campaign noise. */
export function filterLiveEvents(events = []) {
  return events.filter((e) => !isDemoEvent(e));
}

/**
 * Remove demo-campaign lines from events.jsonl (real events kept).
 * Ledger is append-only and left intact; demo purge is operational cleanup only.
 */
export function purgeDemoEvents() {
  if (!fs.existsSync(EVENTS_PATH)) {
    return { ok: true, removed: 0, kept: 0, path: EVENTS_PATH };
  }
  const lines = fs.readFileSync(EVENTS_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (isDemoEvent(e)) {
        removed += 1;
        continue;
      }
      kept.push(line);
    } catch {
      kept.push(line);
    }
  }
  const bak = `${EVENTS_PATH}.bak-pre-demo-purge`;
  try {
    fs.copyFileSync(EVENTS_PATH, bak);
  } catch {
    /* best effort */
  }
  fs.writeFileSync(EVENTS_PATH, kept.length ? `${kept.join('\n')}\n` : '');
  return { ok: true, removed, kept: kept.length, path: EVENTS_PATH, backup: bak };
}

const CAMPAIGN = [
  { offsetMs: 0, plane: 'edge', type: 'scanner-peak', ip: '203.0.113.47', score: 3, detail: { ua: 'nmap', label: 'SCANNER-47' } },
  { offsetMs: 30000, plane: 'edge', type: 'proxy-probe', ip: '203.0.113.47', score: 3, detail: { label: 'PROXY-09' } },
  { offsetMs: 90000, plane: 'lan', type: 'honeypot-http', ip: '10.0.0.42', score: 4, detail: { persona: 'nas-demo', label: 'SENTINEL-12' } },
  { offsetMs: 150000, plane: 'lan', type: 'trap-trip', ip: '10.0.0.42', score: 6, detail: { label: 'C2-beacon-violet-ghost-103', trap: true } },
  { offsetMs: 180000, plane: 'ops', type: 'morph-trigger', score: 0, detail: { morph: 'aggressive', reason: 'trap density' } },
  { offsetMs: 240000, plane: 'audit', type: 'auth-chain-fail', ip: '198.51.100.21', score: 5, detail: { label: 'AUTH-CHAIN-21' } },
  { offsetMs: 300000, plane: 'edge', type: 'lateral-suspect', ip: '203.0.113.4', score: 7, detail: { label: 'COMPROMISED-EDGE-04', lateral: true } },
  { offsetMs: 330000, plane: 'ops', type: 'node-isolated', score: 0, detail: { node: 'COMPROMISED-EDGE-04', action: 'contain' } },
  { offsetMs: 360000, plane: 'ops', type: 'genome-evolution', score: 0, detail: { champion: 'genome_chad_alpha', bred: 3 } },
  { offsetMs: 400000, plane: 'lan', type: 'sentinel-contain', ip: '10.0.0.42', score: 5, detail: { label: 'GUARDIAN-07', success: true } },
];

/**
 * Inject campaign events into the hub event stream (accelerated timeline).
 */
export function injectDemoCampaign(options = {}) {
  const base = options.baseTs || Date.now() - 450000;
  const events = CAMPAIGN.map((step, i) =>
    normalizeEvent({
      plane: step.plane,
      type: step.type,
      ip: step.ip,
      ts: base + step.offsetMs,
      score: step.score,
      detail: { ...step.detail, demoCampaign: true, step: i },
      source: 'demo-campaign',
    }),
  );

  if (options.persist !== false) {
    for (const e of events) appendEvent(e);
  }

  return {
    ok: true,
    injected: events.length,
    markers: [
      { ts: base + 0, label: 'SCANNER PEAK', type: 'scanner-peak' },
      { ts: base + 180000, label: 'MORPH TRIGGER', type: 'morph-trigger' },
      { ts: base + 150000, label: 'C2 BEACON', type: 'trap-trip' },
      { ts: base + 330000, label: 'NODE ISOLATED', type: 'node-isolated' },
      { ts: base + 360000, label: 'GENOME EVOLVED', type: 'genome-evolution' },
    ],
    events,
  };
}

/**
 * Timeline markers for Forensic Time Machine scrubber.
 */
export function buildTimelineMarkers(events = []) {
  const markers = [];
  for (const e of events) {
    const t = String(e.type || '');
    if (/scan/i.test(t)) markers.push({ ts: e.ts, label: 'SCANNER PEAK', type: e.type, color: '#00e5ff' });
    else if (/morph/i.test(t)) markers.push({ ts: e.ts, label: 'MORPH TRIGGER', type: e.type, color: '#e040fb' });
    else if (/c2|beacon|trap/i.test(t)) markers.push({ ts: e.ts, label: 'C2 BEACON', type: e.type, color: '#ff1744' });
    else if (/isolat|contain/i.test(t)) markers.push({ ts: e.ts, label: 'NODE ISOLATED', type: e.type, color: '#69f0ae' });
    else if (/genome|evol/i.test(t)) markers.push({ ts: e.ts, label: 'EVOLUTION', type: e.type, color: '#b388ff' });
    else if ((e.score || 0) >= 6) markers.push({ ts: e.ts, label: String(t).toUpperCase().slice(0, 16), type: e.type, color: '#ffab40' });
  }
  // Dedupe nearby markers
  markers.sort((a, b) => a.ts - b.ts);
  const out = [];
  for (const m of markers) {
    if (!out.length || m.ts - out[out.length - 1].ts > 15000) out.push(m);
  }
  return out.slice(0, 24);
}

export function campaignFromStore() {
  const events = readEvents(200).filter((e) => e.detail?.demoCampaign || e.source === 'demo-campaign');
  return { ok: true, events, markers: buildTimelineMarkers(events) };
}
