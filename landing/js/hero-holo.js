/**
 * Hero holographic map preview — Canvas 2D primary, optional Three.js enhancement.
 * Synthetic auto-demo campaign loop. Defensive demo data only.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var DEMO_NODES = [
    { id: 'NEXUS', x: 0.5, y: 0.48, r: 8, c: '#00e5ff', role: 'hub' },
    { id: 'LAN', x: 0.22, y: 0.35, r: 5, c: '#69f0ae', role: 'plane' },
    { id: 'EDGE', x: 0.78, y: 0.32, r: 5, c: '#7c4dff', role: 'plane' },
    { id: 'AUDIT', x: 0.28, y: 0.68, r: 4.5, c: '#b388ff', role: 'plane' },
    { id: 'GENOME', x: 0.72, y: 0.7, r: 4.5, c: '#e040fb', role: 'plane' },
    { id: 'MESH', x: 0.5, y: 0.18, r: 4, c: '#00b8d4', role: 'plane' },
    { id: 'VEIL', x: 0.15, y: 0.52, r: 4, c: '#00e5ff', role: 'plane' },
    { id: 'MIRAGE', x: 0.85, y: 0.55, r: 4, c: '#e040fb', role: 'plane' },
  ];

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function createCanvasMap(container) {
    var canvas = document.createElement('canvas');
    canvas.className = 'holo-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0;
    var t0 = performance.now();
    var phase = 0; // 0 scan, 1 path, 2 breach, 3 morph, 4 seal
    var phaseT = 0;
    var threat = { x: 0.08, y: 0.2, active: true };
    var raf = 0;
    var mouse = { x: 0.5, y: 0.5, on: false };

    function resize() {
      var rect = container.getBoundingClientRect();
      w = Math.max(280, rect.width);
      h = Math.max(200, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawGrid() {
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.06)';
      ctx.lineWidth = 1;
      var step = 28;
      for (var x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (var y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // horizon glow
      var g = ctx.createRadialGradient(w * 0.5, h * 0.55, 10, w * 0.5, h * 0.55, w * 0.55);
      g.addColorStop(0, 'rgba(0, 229, 255, 0.07)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    function nodePos(n) {
      var ox = mouse.on ? (mouse.x - 0.5) * 12 : 0;
      var oy = mouse.on ? (mouse.y - 0.5) * 10 : 0;
      return { x: n.x * w + ox, y: n.y * h + oy };
    }

    function drawLinks(now) {
      var hub = nodePos(DEMO_NODES[0]);
      for (var i = 1; i < DEMO_NODES.length; i++) {
        var p = nodePos(DEMO_NODES[i]);
        var pulse = reduced ? 0.35 : 0.25 + 0.2 * Math.sin(now * 0.002 + i);
        ctx.strokeStyle = 'rgba(0, 229, 255,' + pulse + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hub.x, hub.y);
        ctx.quadraticCurveTo((hub.x + p.x) / 2, (hub.y + p.y) / 2 - 20, p.x, p.y);
        ctx.stroke();
      }
    }

    function drawNode(n, now) {
      var p = nodePos(n);
      var breathe = reduced ? 1 : 1 + 0.08 * Math.sin(now * 0.003 + n.x * 10);
      var r = n.r * breathe;
      var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
      glow.addColorStop(0, n.c + '55');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = n.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(232, 244, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (n.role === 'hub' || w > 420) {
        ctx.fillStyle = 'rgba(232, 244, 255, 0.7)';
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(n.id, p.x, p.y - r - 6);
      }
    }

    function drawThreat(now) {
      if (!threat.active) return;
      var tx = threat.x * w;
      var ty = threat.y * h;
      var hub = nodePos(DEMO_NODES[0]);
      // path to nexus during path/breach phases
      if (phase >= 1 && phase <= 3) {
        ctx.strokeStyle = phase >= 2 ? 'rgba(255, 23, 68, 0.55)' : 'rgba(224, 64, 251, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = reduced ? 0 : -now * 0.05;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hub.x, hub.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      var col = phase >= 4 ? '#69f0ae' : phase >= 2 ? '#ff1744' : '#e040fb';
      var gr = ctx.createRadialGradient(tx, ty, 0, tx, ty, 18);
      gr.addColorStop(0, col + 'aa');
      gr.addColorStop(1, 'transparent');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(tx, ty, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(232, 244, 255, 0.65)';
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(phase >= 4 ? 'CONTAINED' : 'SCANNER-47', tx + 10, ty - 6);
    }

    function advancePhase(dt) {
      if (reduced) {
        phase = 1;
        threat.x = 0.25;
        threat.y = 0.28;
        return;
      }
      phaseT += dt;
      var durations = [2.2, 2.4, 2.0, 2.2, 2.8];
      if (phaseT > durations[phase]) {
        phaseT = 0;
        phase = (phase + 1) % 5;
        if (phase === 0) {
          threat.x = 0.08;
          threat.y = 0.18 + Math.random() * 0.15;
          threat.active = true;
        }
      }
      if (phase === 0) {
        threat.x = clamp(threat.x + dt * 0.04, 0.08, 0.35);
      } else if (phase === 1 || phase === 2) {
        var hub = DEMO_NODES[0];
        threat.x += (hub.x * 0.85 - threat.x) * dt * 0.35;
        threat.y += (hub.y * 0.9 - threat.y) * dt * 0.35;
      } else if (phase === 4) {
        // seal — freeze near edge of hub
      }
    }

    function frame(now) {
      var dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      advancePhase(dt);
      ctx.clearRect(0, 0, w, h);
      drawGrid();
      drawLinks(now);
      for (var i = 0; i < DEMO_NODES.length; i++) drawNode(DEMO_NODES[i], now);
      drawThreat(now);
      // seal ring
      if (phase === 4) {
        var hub = nodePos(DEMO_NODES[0]);
        ctx.strokeStyle = 'rgba(105, 240, 174, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hub.x, hub.y, 28 + 6 * Math.sin(now * 0.004), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);
    container.addEventListener('pointermove', function (e) {
      var r = container.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width;
      mouse.y = (e.clientY - r.top) / r.height;
      mouse.on = true;
    });
    container.addEventListener('pointerleave', function () { mouse.on = false; });

    if (reduced) {
      t0 = performance.now();
      advancePhase(0);
      ctx.clearRect(0, 0, w, h);
      drawGrid();
      drawLinks(0);
      DEMO_NODES.forEach(function (n) { drawNode(n, 0); });
      drawThreat(0);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return {
      destroy: function () {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
      },
      getPhase: function () { return phase; },
    };
  }

  function init() {
    var el = document.getElementById('hero-holo');
    if (!el) return;
    createCanvasMap(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
