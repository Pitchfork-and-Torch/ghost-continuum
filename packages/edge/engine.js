/** Shared edge deception logic - local server + Cloudflare worker template */

export const TRIPWIRE = '/.__dm/tripwire';
export const SENTINEL = '/.__dm/sentinel.js';
export const STATUS = '/.__dm/status';
export const TRIPWIRE_MAX_BYTES = 64 * 1024;
export const TRIPWIRE_DETAIL_MAX = 256;
export const TRIPWIRE_TYPES = new Set([
  'honeypot-click',
  'honeypot-hit',
  'script-tamper',
  'sentinel-alive',
  'sentinel-fallback',
]);
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX = 60;
export const EDGE_MAP_CAP = 2000;
export const ROTATE_WINDOW_MS = 60_000;
export const ROTATE_MAX = 2;

/** Tripwire JSON must be a plain object. null, arrays, and scalars become {}. */
export function coerceTripwireBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

/** Keep a known type and a short detail string. */
export function normalizeTripwire(body) {
  const raw = coerceTripwireBody(body);
  const t = TRIPWIRE_TYPES.has(raw.t) ? raw.t : 'tripwire';
  let detail = raw.d;
  if (detail && typeof detail === 'object') {
    try {
      detail = JSON.stringify(detail);
    } catch {
      detail = '';
    }
  }
  return { t, d: String(detail ?? '').slice(0, TRIPWIRE_DETAIL_MAX) };
}

export function canRotate({
  observedAt = 0,
  rotations = [],
  score = 0,
  now = Date.now(),
  observedWindowMs = RATE_WINDOW_MS,
  rotateWindowMs = ROTATE_WINDOW_MS,
  rotateMax = ROTATE_MAX,
  scoreRotate = SCORE_ROTATE,
} = {}) {
  const recent = (Array.isArray(rotations) ? rotations : []).filter((ts) => now - Number(ts) < rotateWindowMs);
  const observed = Number(observedAt) > 0 && now - Number(observedAt) <= observedWindowMs;
  return {
    rotate: Boolean(observed && score >= scoreRotate && recent.length < rotateMax),
    rotations: recent,
  };
}

const localRates = new Map();

function touchMap(map, key, value, cap) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > cap) {
    const oldest = map.keys().next().value;
    if (oldest == null) break;
    map.delete(oldest);
  }
}

/** Same-process counter. A missing address is not a shared bucket. */
export function localRateAllow(ip, now = Date.now(), { windowMs = RATE_WINDOW_MS, max = RATE_MAX, cap = EDGE_MAP_CAP } = {}) {
  if (!ip) return false;
  let bucket = localRates.get(ip);
  if (!bucket || now - bucket.start >= windowMs) bucket = { start: now, count: 0 };
  bucket.count += 1;
  touchMap(localRates, ip, bucket, cap);
  return bucket.count <= max;
}

export function resetLocalRates() {
  localRates.clear();
}

export async function readBodyLimited(request, maxBytes = TRIPWIRE_MAX_BYTES) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      try { await reader.cancel(); } catch { /* already closed */ }
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

const SCORE_ROTATE = 8;
const SCORE_DECAY = 1;

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function dailySeed(siteSeed, date = new Date()) {
  return `${siteSeed}:${date.toISOString().slice(0, 10)}`;
}

export function derivePaths(seed, count = 8, generation = 0) {
  const paths = new Set();
  let i = 0;
  while (paths.size < count) {
    const h = fnv1a(`${seed}:gen${generation}:${i}`);
    paths.add(`/.__dm/${h.slice(0, 10)}/gate`);
    paths.add(`/.__dm/${h.slice(2, 12)}`);
    i++;
  }
  return [...paths].slice(0, count);
}

export function buildId(siteSeed, generation = 0) {
  return fnv1a(`${dailySeed(siteSeed)}:g${generation}`).slice(0, 16);
}

export function drillHoneypotPath(siteSeed, generation = 0) {
  const seed = dailySeed(siteSeed);
  const h = fnv1a(`${seed}:gen${generation}:0`);
  return `/.__dm/${h.slice(0, 10)}/gate`;
}

function eventScore(type) {
  if (type === 'honeypot-hit' || type === 'honeypot-click') return 5;
  if (type === 'script-tamper') return 6;
  if (type === 'sentinel-alive') return 0;
  return 1;
}

export function clientScript(paths, id) {
  return `(function(){"use strict";var B=${JSON.stringify(id)},E=${JSON.stringify(TRIPWIRE)},P=${JSON.stringify(paths)};
function r(t,d){try{var b=JSON.stringify({t:t,d:d,b:B,ts:Date.now()});navigator.sendBeacon?navigator.sendBeacon(E,b):fetch(E,{method:"POST",body:b,keepalive:!0,headers:{"Content-Type":"application/json"}})}catch(x){}}
function h(){if(!document.body)return;P.forEach(function(p){var a=document.createElement("a");a.href=p;a.setAttribute("aria-hidden","true");a.tabIndex=-1;a.style.cssText="position:absolute;left:-9999px;opacity:0;pointer-events:none";a.textContent="settings";a.addEventListener("click",function(e){e.preventDefault();r("honeypot-click",p)});document.body.appendChild(a)})}
function w(){document.querySelectorAll("script[data-dm-protected]").forEach(function(el){new MutationObserver(function(){r("script-tamper",el.src||"inline")}).observe(el,{attributes:true,attributeFilter:["src","integrity"]})})}
function f(){r("sentinel-alive",{path:location.pathname,ref:document.referrer||""})}
function boot(){window.__dmAlive=1;h();w();f()}
setTimeout(function(){if(!window.__dmAlive){r("sentinel-fallback","script-blocked")}},3000);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();`;
}

export function createEdgeState(siteSeed = 'ghost-continuum-local') {
  return {
    siteSeed,
    generation: 0,
    paths: derivePaths(dailySeed(siteSeed), 8, 0),
    buildId: buildId(siteSeed, 0),
    rotatedAt: Date.now(),
    totalHits: 0,
    scores: new Map(),
    rates: new Map(),
    observed: new Map(),
    rotationTs: [],
  };
}

export function noteObserved(state, ip, now = Date.now()) {
  if (!ip) return;
  if (!state.observed) state.observed = new Map();
  touchMap(state.observed, ip, now, EDGE_MAP_CAP);
}

export function recordTripwire(state, ip, type, detail, options = {}) {
  const now = options.now ?? Date.now();
  const fields = normalizeTripwire({ t: type, d: detail });
  if (!state.rates) state.rates = new Map();
  if (!state.scores) state.scores = new Map();
  if (!state.observed) state.observed = new Map();
  if (!Array.isArray(state.rotationTs)) state.rotationTs = [];

  let bucket = state.rates.get(ip);
  if (!bucket || typeof bucket !== 'object' || now - bucket.start >= RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
  }
  bucket.count += 1;
  touchMap(state.rates, ip, bucket, EDGE_MAP_CAP);
  if (bucket.count > RATE_MAX) return { allowed: false, score: 0, type: fields.t, detail: fields.d };

  const record = state.scores.get(ip) || { score: 0, hits: [] };
  record.score = Math.max(0, record.score - SCORE_DECAY) + eventScore(fields.t);
  record.hits.push({ type: fields.t, detail: fields.d, ts: now });
  record.hits = record.hits.slice(-30);
  touchMap(state.scores, ip, record, EDGE_MAP_CAP);

  state.totalHits += 1;
  const decision = canRotate({
    observedAt: state.observed.get(ip) || 0,
    rotations: state.rotationTs,
    score: record.score,
    now,
  });
  state.rotationTs = decision.rotations;
  if (decision.rotate) {
    state.generation += 1;
    state.paths = derivePaths(dailySeed(state.siteSeed), 8, state.generation);
    state.buildId = buildId(state.siteSeed, state.generation);
    state.rotatedAt = now;
    state.rotationTs.push(now);
    state.observed.delete(ip);
  }

  return { allowed: true, score: record.score, type: fields.t, detail: fields.d };
}

export function publicStatus(state) {
  return {
    ok: true,
    passive: true,
    buildId: state.buildId,
    generation: state.generation,
    siteSeed: state.siteSeed,
  };
}