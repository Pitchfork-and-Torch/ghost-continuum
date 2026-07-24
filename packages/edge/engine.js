/** Shared edge deception logic — local server + Cloudflare worker template */

export const TRIPWIRE = '/.__dm/tripwire';
export const SENTINEL = '/.__dm/sentinel.js';
export const STATUS = '/.__dm/status';

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
  };
}

export function recordTripwire(state, ip, type, detail) {
  const count = (state.rates.get(ip) || 0) + 1;
  if (count > 60) return { allowed: false, score: 0 };
  state.rates.set(ip, count);

  const record = state.scores.get(ip) || { score: 0, hits: [] };
  record.score = Math.max(0, record.score - SCORE_DECAY) + eventScore(type);
  record.hits.push({ type, detail, ts: Date.now() });
  record.hits = record.hits.slice(-30);
  state.scores.set(ip, record);

  state.totalHits += 1;
  if (record.score >= SCORE_ROTATE) {
    state.generation += 1;
    state.paths = derivePaths(dailySeed(state.siteSeed), 8, state.generation);
    state.buildId = buildId(state.siteSeed, state.generation);
    state.rotatedAt = Date.now();
  }

  return { allowed: true, score: record.score };
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