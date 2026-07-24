/**
 * Interactive sensor planes explorer — keyboard + pointer accessible.
 */
(function () {
  'use strict';

  var PLANES = [
    {
      id: 'ghost-lan',
      num: '01',
      label: 'Ghost LAN',
      blurb: 'Polymorphic honeypots on your LAN that shift under observation.',
      body: 'Authorized-network decoys that look like NAS boxes, routers, cameras, and home automation gear. Personas and lure surfaces morph at runtime so probes never fingerprint a static trap.',
      caps: ['Hot persona swap', 'Engagement dossiers', 'Fitness feedback to genome', 'RFC1918 / allowlist scoped'],
      tag: 'DEFENSIVE HONEYPOT PLANE',
    },
    {
      id: 'edge',
      num: '02',
      label: 'Edge Tripwire',
      blurb: 'Cloudflare-side sensors before traffic hits metal.',
      body: 'Worker tripwires and sentinel inject at the edge. Score-triggered morph keeps perimeter deception alive without shipping your core brain to the cloud.',
      caps: ['KV honeypot rotation', 'Tripwire scoring', 'Optional Worker deploy', 'Local edge server for labs'],
      tag: 'PERIMETER SENSOR',
    },
    {
      id: 'audit',
      num: '03',
      label: 'Audit Plane',
      blurb: 'Integrity watch and sealed event flow into the Time Machine.',
      body: 'Validates configuration and engagement integrity. Feeds the Forensic Time Machine so you can scrub what happened and export Merkle-backed evidence.',
      caps: ['Config validation', 'Event integrity', 'Time Machine feed', 'Replay-ready markers'],
      tag: 'FORENSIC INTEGRITY',
    },
    {
      id: 'narrative',
      num: '04',
      label: 'Narrative Weave',
      blurb: 'Persona fabric that keeps deception credible under scrutiny.',
      body: 'Echo realities and storylines for decoy surfaces. Optional local LLM bridge (Ollama) — never required, never phone-home.',
      caps: ['Echo realities', 'Persona shells', 'Optional Ollama bridge', 'Local-only narrative'],
      tag: 'DECEPTION STORYTELLING',
    },
    {
      id: 'phantom',
      num: '05',
      label: 'Phantom Mesh',
      blurb: 'Decoy fabric so probes never see a fixed surface.',
      body: 'Spreads polymorphic presence across the continuum. Mesh nodes appear, rotate, and vanish according to morph policy.',
      caps: ['Rotating decoy mesh', 'Morph-aware density', 'Correlation with LAN/edge', 'Low false-positive posture'],
      tag: 'DECOY FABRIC',
    },
    {
      id: 'veil',
      num: '06',
      label: 'Deep Veil',
      blurb: 'Signal cloak layer for deeper continuum obfuscation.',
      body: 'Obscures defensive telemetry surfaces and softens attacker reconnaissance. Complements Mirage without becoming an offensive tool.',
      caps: ['Signal cloak concepts', 'Plane arm/disarm', 'Works with morph modes', 'Authorized networks only'],
      tag: 'CLOAK LAYER',
    },
    {
      id: 'mirage',
      num: '07',
      label: 'Mirage Core',
      blurb: 'NSGA-II genome evolution so traps breed with the threat.',
      body: 'Multi-objective evolution balances evasion, engagement, forensic value, and resource cost. Champions become Chad genomes on the leaderboard.',
      caps: ['NSGA-II multi-objective', 'Novelty pressure', 'Runtime morph fragments', 'No eval — declarative only'],
      tag: 'GENOME ENGINE',
    },
    {
      id: 'trench',
      num: '08',
      label: 'Trench Coat',
      blurb: 'Optional privacy cloak plane — arm and disarm anytime.',
      body: 'Opt-in privacy cloak monitor with optional auto-start. Other tools can route through the cloak when healthy. Defensive privacy, not attack infrastructure.',
      caps: ['Opt-in arm/disarm', 'Health-aware proxy use', 'Plane toggle in Nexus', 'Sibling project integration'],
      tag: 'PRIVACY CLOAK PLANE',
    },
  ];

  function renderDetail(plane, detailEl) {
    if (!plane || !detailEl) return;
    var caps = plane.caps.map(function (c) { return '<li>' + c + '</li>'; }).join('');
    detailEl.innerHTML =
      '<p class="num" style="font-family:var(--mono);font-size:0.68rem;color:var(--magenta);letter-spacing:0.12em;margin-bottom:0.35rem">' +
      plane.num +
      '</p>' +
      '<h3 id="plane-detail-title">' + plane.label + '</h3>' +
      '<p>' + plane.body + '</p>' +
      '<ul>' + caps + '</ul>' +
      '<span class="cap-tag">' + plane.tag + '</span>';
  }

  function init() {
    var list = document.getElementById('plane-nodes');
    var detail = document.getElementById('plane-detail');
    if (!list || !detail) return;

    list.innerHTML = PLANES.map(function (p, i) {
      return (
        '<li>' +
        '<button type="button" class="plane-node" role="option" id="plane-btn-' + p.id + '" data-id="' + p.id + '" aria-pressed="' + (i === 0 ? 'true' : 'false') + '">' +
        '<div class="num">' + p.num + '</div>' +
        '<div class="lbl">' + p.label + '</div>' +
        '</button></li>'
      );
    }).join('');

    var buttons = Array.prototype.slice.call(list.querySelectorAll('.plane-node'));

    function select(id, focusBtn) {
      var plane = PLANES.find(function (p) { return p.id === id; }) || PLANES[0];
      buttons.forEach(function (b) {
        var on = b.getAttribute('data-id') === plane.id;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on && focusBtn) b.focus();
      });
      renderDetail(plane, detail);
      detail.setAttribute('aria-labelledby', 'plane-detail-title');
    }

    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.plane-node');
      if (!btn) return;
      select(btn.getAttribute('data-id'), false);
    });

    list.addEventListener('keydown', function (e) {
      var btn = e.target.closest('.plane-node');
      if (!btn) return;
      var idx = buttons.indexOf(btn);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        var n = buttons[(idx + 1) % buttons.length];
        select(n.getAttribute('data-id'), true);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        var p = buttons[(idx - 1 + buttons.length) % buttons.length];
        select(p.getAttribute('data-id'), true);
      } else if (e.key === 'Home') {
        e.preventDefault();
        select(buttons[0].getAttribute('data-id'), true);
      } else if (e.key === 'End') {
        e.preventDefault();
        select(buttons[buttons.length - 1].getAttribute('data-id'), true);
      }
    });

    select(PLANES[0].id, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
