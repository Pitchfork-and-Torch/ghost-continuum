/**
 * Ghost Continuum edge worker — defensive tripwire layer in front of your site.
 * Set SITE_SEED and UPSTREAM in wrangler.toml [vars].
 * UPSTREAM must be the origin hostname (e.g. *.pages.dev), NOT the Worker route hostname.
 */

const TRIPWIRE = '/.__dm/tripwire';
const SENTINEL = '/.__dm/sentinel.js';
const STATUS = '/.__dm/status';
const SCORE_ROTATE = 8;
const SCORE_DECAY = 1;

const UPSTREAM_HEADERS = ['accept', 'accept-language', 'accept-encoding', 'user-agent', 'if-none-match', 'if-modified-since'];

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function dailySeed(siteSeed, date = new Date()) {
  return `${siteSeed}:${date.toISOString().slice(0, 10)}`;
}

function derivePaths(seed, count = 8, generation = 0) {
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

function buildId(siteSeed, generation = 0) {
  return fnv1a(`${dailySeed(siteSeed)}:g${generation}`).slice(0, 16);
}

function eventScore(type) {
  if (type === 'honeypot-hit' || type === 'honeypot-click') return 5;
  if (type === 'script-tamper') return 6;
  if (type === 'sentinel-alive') return 0;
  return 1;
}

function clientScript(paths, id) {
  return `(function(){"use strict";var B=${JSON.stringify(id)},E=${JSON.stringify(TRIPWIRE)},P=${JSON.stringify(paths)};
function r(t,d){try{var b=JSON.stringify({t:t,d:d,b:B,ts:Date.now()});navigator.sendBeacon?navigator.sendBeacon(E,b):fetch(E,{method:"POST",body:b,keepalive:!0,headers:{"Content-Type":"application/json"}})}catch(x){}}
function h(){if(!document.body)return;P.forEach(function(p){var a=document.createElement("a");a.href=p;a.setAttribute("aria-hidden","true");a.tabIndex=-1;a.style.cssText="position:absolute;left:-9999px;opacity:0;pointer-events:none";a.textContent="settings";a.addEventListener("click",function(e){e.preventDefault();r("honeypot-click",p)});document.body.appendChild(a)})}
function w(){document.querySelectorAll("script[data-dm-protected]").forEach(function(el){new MutationObserver(function(){r("script-tamper",el.src||"inline")}).observe(el,{attributes:true,attributeFilter:["src","integrity"]})})}
function f(){r("sentinel-alive",{path:location.pathname,ref:document.referrer||""})}
function boot(){window.__dmAlive=1;h();w();f()}
setTimeout(function(){if(!window.__dmAlive){r("sentinel-fallback","script-blocked")}},3000);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();`;
}

async function loadObserver(kv, siteSeed, generation) {
  const key = `dm:observer:${siteSeed}`;
  const raw = kv ? await kv.get(key) : null;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through */
    }
  }
  return {
    generation,
    paths: derivePaths(dailySeed(siteSeed), 8, generation),
    buildId: buildId(siteSeed, generation),
    rotatedAt: Date.now(),
    totalHits: 0,
  };
}

async function saveObserver(kv, siteSeed, state) {
  if (!kv) return;
  await kv.put(`dm:observer:${siteSeed}`, JSON.stringify(state), { expirationTtl: 172800 });
}

async function tripwireAllowed(kv, ip) {
  if (!kv || !ip) return true;
  const key = `dm:rate:${ip}`;
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= 60) return false;
  await kv.put(key, String(count + 1), { expirationTtl: 60 });
  return true;
}

async function recordEvent(kv, ip, type, detail) {
  if (!kv || !ip) return { score: 0 };

  const scoreKey = `dm:score:${ip}`;
  const raw = await kv.get(scoreKey);
  let record = { score: 0, hits: [] };
  if (raw) {
    try {
      record = JSON.parse(raw);
    } catch {
      record = { score: 0, hits: [] };
    }
  }

  record.score = Math.max(0, record.score - SCORE_DECAY) + eventScore(type);
  record.hits.push({ type, detail, ts: Date.now() });
  record.hits = record.hits.slice(-30);
  await kv.put(scoreKey, JSON.stringify(record), { expirationTtl: 86400 });

  return { score: record.score };
}

function upstreamHeaders(request) {
  const headers = new Headers();
  for (const name of UPSTREAM_HEADERS) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }
  return headers;
}

/** Demo song pages — keep them free of the Ghost Continuum mascot CTA. */
function isDemoSongPage(pathname) {
  return /^\/(crash-into-nowhere|hello-i-yell)(\/|$)/i.test(pathname || '');
}

function deployCtaInline(deployUrl) {
  const repoUrl = 'https://github.com/Pitchfork-and-Torch/ghost-continuum';
  const src = `
(function(){
  "use strict";
  var U = ${JSON.stringify(deployUrl)};
  var REPO = ${JSON.stringify(repoUrl)};
  if (!U || location.hostname === "ghost.jonbailey.xyz") return;
  // Grief Eater free demos: no promo ghost (music-first pages)
  if (/^\\/(crash-into-nowhere|hello-i-yell)(\\/|$)/i.test(location.pathname)) return;
  try { sessionStorage.removeItem("gc-cta-off"); } catch (e) {}

  var ghostSvg = '<svg viewBox="0 0 32 40" width="20" height="25" aria-hidden="true">'
    + '<path fill="#5EB8FF" opacity=".92" d="M16 3C9 3 4 9 4 16v15c0 2.2 1.2 4 3.4 4 1.6 0 2.8-.8 3.6-1.8.8 1 2 1.8 3.6 1.8 1.6 0 2.8-.8 3.6-1.8.8 1 2 1.8 3.6 1.8 2.2 0 3.4-1.8 3.4-4V16c0-7-5-13-11-13zm-4.5 15.5a2.2 2.2 0 110-4.4 2.2 2.2 0 010 4.4zm9 0a2.2 2.2 0 110-4.4 2.2 2.2 0 010 4.4z"/>'
    + '</svg>';

  function boot() {
    if (!document.body || document.getElementById("gc-ghost-wrap")) return;

    var isTheater = /^\\/theater(\\/|$)/.test(location.pathname);

    var wrap = document.createElement("div");
    wrap.id = "gc-ghost-wrap";
    wrap.style.cssText = isTheater
      ? "position:fixed;bottom:max(4.75rem,calc(env(safe-area-inset-bottom,0px) + 4.75rem));left:max(1.35rem,calc(env(safe-area-inset-left,0px) + 0.75rem));top:auto;right:auto;z-index:35;pointer-events:auto;font:12px/1.5 ui-monospace,monospace"
      : "position:fixed;top:max(18px,env(safe-area-inset-top,0px));left:max(78px,calc(env(safe-area-inset-left,0px) + 78px));z-index:10120;pointer-events:auto;font:12px/1.5 ui-monospace,monospace";

    var sprite = document.createElement("button");
    sprite.type = "button";
    sprite.id = "gc-ghost-sprite";
    sprite.setAttribute("aria-expanded", "false");
    sprite.setAttribute("aria-controls", "gc-deploy-cta");
    sprite.setAttribute("aria-label", "Ghost Continuum — hover or click for details");
    sprite.style.cssText = "display:flex;align-items:center;justify-content:center;width:28px;height:32px;padding:0;border:0;background:transparent;cursor:pointer;"
      + "filter:drop-shadow(0 0 3px rgba(94,184,255,.55));transition:transform .15s ease,filter .15s ease";
    sprite.innerHTML = ghostSvg;

    var panel = document.createElement("div");
    panel.id = "gc-deploy-cta";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Ghost Continuum");
    panel.hidden = true;
    panel.style.cssText = isTheater
      ? "position:absolute;bottom:0;left:34px;top:auto;right:auto;opacity:0;visibility:hidden;pointer-events:none;"
        + "transition:opacity .2s ease,visibility .2s ease,transform .2s ease;transform:translateY(6px);"
        + "width:min(300px,calc(100vw - 4.5rem));padding:12px 14px 10px;"
        + "background:linear-gradient(145deg,rgba(18,40,72,.62),rgba(8,18,36,.72));backdrop-filter:blur(14px) saturate(1.25);-webkit-backdrop-filter:blur(14px) saturate(1.25);"
        + "border:1px solid rgba(120,190,255,.38);border-radius:10px;color:#c5daf5;"
        + "box-shadow:0 12px 36px rgba(12,40,80,.42),inset 0 1px 0 rgba(180,220,255,.18)"
      : "position:absolute;top:-6px;left:30px;opacity:0;visibility:hidden;pointer-events:none;"
        + "transition:opacity .2s ease,visibility .2s ease,transform .2s ease;transform:translateY(4px);"
        + "width:min(300px,calc(100vw - 90px));padding:12px 14px 10px;"
        + "background:linear-gradient(145deg,rgba(18,40,72,.62),rgba(8,18,36,.72));backdrop-filter:blur(14px) saturate(1.25);-webkit-backdrop-filter:blur(14px) saturate(1.25);"
        + "border:1px solid rgba(120,190,255,.38);border-radius:10px;color:#c5daf5;"
        + "box-shadow:0 12px 36px rgba(12,40,80,.42),inset 0 1px 0 rgba(180,220,255,.18)";

    panel.innerHTML = '<button type="button" id="gc-cta-x" aria-label="Close" style="position:absolute;top:6px;right:8px;background:transparent;border:0;color:#7aa8d4;font-size:16px;cursor:pointer;padding:2px 4px;line-height:1">×</button>'
      + '<p style="margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6EC8FF">Ghost Continuum</p>'
      + '<p style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#9ec5ef">This site runs an open-source <strong style="color:#e0f0ff;font-weight:600">Living Deception Continuum</strong> — polymorphic honeypots, edge tripwires, and Merkle-sealed forensics. Defensive only.</p>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">'
      + '<a href="' + U + '" style="padding:5px 10px;border:1px solid rgba(120,190,255,.5);color:#6EC8FF;text-decoration:none;border-radius:4px;font-size:11px;background:rgba(40,100,180,.18)">Install guide</a>'
      + '<a href="' + REPO + '" target="_blank" rel="noopener" style="padding:5px 10px;border:1px solid rgba(120,190,255,.28);color:#8ec4f0;text-decoration:none;border-radius:4px;font-size:11px;background:rgba(20,50,90,.2)">GitHub repo</a>'
      + '<a href="' + U + 'hub/" style="padding:5px 10px;border:1px solid rgba(120,190,255,.28);color:#8ec4f0;text-decoration:none;border-radius:4px;font-size:11px;background:rgba(20,50,90,.2)">Command Nexus</a>'
      + '</div>'
      + '<p style="margin:0;font-size:10px;color:#6a90b8;letter-spacing:.02em">git clone → npm run setup → npm start</p>';

    var open = false;
    var hideTimer = null;

    function setOpen(next) {
      open = next;
      sprite.setAttribute("aria-expanded", next ? "true" : "false");
      panel.hidden = !next;
      panel.style.opacity = next ? "1" : "0";
      panel.style.visibility = next ? "visible" : "hidden";
      panel.style.pointerEvents = next ? "auto" : "none";
      panel.style.transform = next ? "none" : (isTheater ? "translateY(6px)" : "translateY(4px)");
      sprite.style.filter = next ? "drop-shadow(0 0 5px rgba(94,184,255,.7))" : "drop-shadow(0 0 3px rgba(94,184,255,.55))";
      sprite.style.transform = next ? "scale(1.05)" : "none";
    }

    function scheduleHide() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function() { setOpen(false); }, 120);
    }

    function cancelHide() { clearTimeout(hideTimer); }

    wrap.addEventListener("mouseenter", function() { cancelHide(); setOpen(true); });
    wrap.addEventListener("mouseleave", scheduleHide);
    wrap.addEventListener("focusin", function() { cancelHide(); setOpen(true); });
    wrap.addEventListener("focusout", function(e) {
      if (!wrap.contains(e.relatedTarget)) scheduleHide();
    });

    sprite.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!open);
    });

    wrap.appendChild(sprite);
    wrap.appendChild(panel);
    document.body.appendChild(wrap);

    panel.querySelector("#gc-cta-x").addEventListener("click", function(e) {
      e.stopPropagation();
      setOpen(false);
    });

    document.addEventListener("click", function(e) {
      if (open && !wrap.contains(e.target)) setOpen(false);
    });

    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && open) setOpen(false);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();`;
  return src.replace(/\n\s*/g, '');
}

function injectSentinel(html, deployUrl) {
  const headTag = `<script src="${SENTINEL}" data-dm-protected defer></script>`;
  const cta = deployUrl ? `<script>${deployCtaInline(deployUrl)}</script>` : '';
  if (html.includes('</body>')) {
    return html
      .replace('</head>', `${headTag}</head>`)
      .replace('</body>', `${cta}</body>`);
  }
  if (html.includes('</head>')) return html.replace('</head>', `${headTag}${cta}</head>`);
  return html + headTag + cta;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const kv = env.DM_KV;
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const siteSeed = env.SITE_SEED || 'example.com';
    const upstreamHost = env.UPSTREAM || 'example.pages.dev';
    const deployPath = env.DEPLOY_PAGE || 'https://ghost.jonbailey.xyz/';
    const deployUrl = deployPath.startsWith('http')
      ? deployPath
      : new URL(deployPath, url.origin).href;

    let state = await loadObserver(kv, siteSeed, 0);

    if (url.pathname === STATUS) {
      return new Response(
        JSON.stringify({
          ok: true,
          passive: true,
          buildId: state.buildId,
          generation: state.generation,
          siteSeed,
          totalHits: state.totalHits || 0,
        }),
        { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
      );
    }

    if (url.pathname === SENTINEL) {
      return new Response(clientScript(state.paths, state.buildId), {
        headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' },
      });
    }

    const trapPaths = new Set([
      ...state.paths,
      ...derivePaths(dailySeed(siteSeed), 8, state.generation || 0),
    ]);
    if (trapPaths.has(url.pathname)) {
      return new Response('trap', { status: 404, headers: { 'X-DM-Trap': '1', 'Cache-Control': 'no-store' } });
    }

    if (url.pathname === TRIPWIRE && request.method === 'POST') {
      if (!(await tripwireAllowed(kv, ip))) {
        return new Response('rate limited', { status: 429 });
      }
      let body = {};
      try {
        body = await request.json();
      } catch {
        /* empty */
      }
      const type = body.t || 'tripwire';
      const { score } = await recordEvent(kv, ip, type, body.d);
      console.log(JSON.stringify({ kind: `dm-${type}`, ip, score, ts: Date.now() }));
      state.totalHits = (state.totalHits || 0) + 1;
      if (score >= SCORE_ROTATE) {
        state.generation = (state.generation || 0) + 1;
        state.paths = derivePaths(dailySeed(siteSeed), 8, state.generation);
        state.buildId = buildId(siteSeed, state.generation);
        state.rotatedAt = Date.now();
      }
      await saveObserver(kv, siteSeed, state);
      return new Response(JSON.stringify({ ok: true, score }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const upstreamUrl = `https://${upstreamHost}${url.pathname}${url.search}`;
    const method = request.method === 'GET' || request.method === 'HEAD' ? request.method : request.method;
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders(request),
      body: method === 'GET' || method === 'HEAD' ? undefined : request.body,
      redirect: 'follow',
    });

    const ct = upstream.headers.get('content-type') || '';
    if (ct.includes('text/html') && request.method === 'GET') {
      const html = await upstream.text();
      // Inject tripwire always; hide Ghost Continuum CTA on demo song pages
      const ctaUrl = isDemoSongPage(url.pathname) ? '' : deployUrl;
      const injected = injectSentinel(html, ctaUrl);
      // Preserve origin security/cache headers (Pages _headers). Do not strip CSP/HSTS.
      const headers = passThroughResponseHeaders(upstream.headers);
      headers.set('Content-Type', ct.includes('charset') ? ct : 'text/html; charset=utf-8');
      // Ensure baseline security if origin omitted them
      if (!headers.has('X-Content-Type-Options')) headers.set('X-Content-Type-Options', 'nosniff');
      if (!headers.has('Referrer-Policy')) headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      if (!headers.has('X-Frame-Options')) headers.set('X-Frame-Options', 'SAMEORIGIN');
      // Never advertise open CORS on HTML pages
      headers.delete('Access-Control-Allow-Origin');
      return new Response(injected, { status: upstream.status, headers });
    }

    // Non-HTML: stream through, still drop accidental open CORS on assets if present
    const out = new Response(upstream.body, upstream);
    out.headers.delete('Access-Control-Allow-Origin');
    return out;
  },
};

/** Headers safe to copy from Pages/origin through the edge proxy. */
function passThroughResponseHeaders(src) {
  const headers = new Headers();
  const allow = [
    'cache-control',
    'cdn-cache-control',
    'content-security-policy',
    'content-security-policy-report-only',
    'content-type',
    'etag',
    'last-modified',
    'permissions-policy',
    'referrer-policy',
    'strict-transport-security',
    'vary',
    'x-content-type-options',
    'x-frame-options',
    'x-robots-tag',
    'content-language',
    'link',
  ];
  for (const name of allow) {
    const v = src.get(name);
    if (v) headers.set(name, v);
  }
  return headers;
}