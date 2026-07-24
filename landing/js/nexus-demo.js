/**
 * Enter the Nexus — client-side threat lifecycle demo.
 * detect → morph → contain → seal. No backend.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var MORPHS = {
    stealth: { accent: '#00b8d4', label: 'STEALTH' },
    research: { accent: '#00e5ff', label: 'RESEARCH' },
    aggressive: { accent: '#e040fb', label: 'AGGRESSIVE' },
    forensic: { accent: '#69f0ae', label: 'FORENSIC' },
  };

  var STEPS = ['detect', 'morph', 'contain', 'seal'];

  function ringGauge(svg, pct, color) {
    var r = 28;
    var c = 2 * Math.PI * r;
    var off = c * (1 - pct / 100);
    svg.innerHTML =
      '<circle cx="36" cy="36" r="' + r + '" fill="none" stroke="rgba(0,229,255,0.12)" stroke-width="6"/>' +
      '<circle cx="36" cy="36" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="6" ' +
      'stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" ' +
      'transform="rotate(-90 36 36)" style="transition:stroke-dashoffset 0.6s ease, stroke 0.3s"/>';
  }

  function init() {
    var canvas = document.getElementById('demo-canvas');
    var logEl = document.getElementById('demo-log');
    var stageEl = document.getElementById('demo-lifecycle');
    var containEl = document.getElementById('demo-contain-val');
    var deceiveEl = document.getElementById('demo-deceive-val');
    var containSvg = document.getElementById('demo-contain-svg');
    var deceiveSvg = document.getElementById('demo-deceive-svg');
    var morphBtns = document.querySelectorAll('[data-morph]');
    var replayBtn = document.getElementById('demo-replay');
    if (!canvas || !logEl) return;

    var ctx = canvas.getContext('2d');
    var morph = 'research';
    var stepIdx = 0;
    var t = 0;
    var logs = [];
    var running = true;
    var raf = 0;

    function resize() {
      var parent = canvas.parentElement;
      var w = Math.max(280, parent.clientWidth - 8);
      var h = 260;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function pushLog(msg, cls) {
      logs.unshift({ msg: msg, cls: cls || '', ts: new Date().toISOString().slice(11, 19) });
      if (logs.length > 8) logs.pop();
      logEl.innerHTML = logs
        .map(function (l) {
          return '<div class="' + l.cls + '">[' + l.ts + '] ' + l.msg + '</div>';
        })
        .join('');
    }

    function setMorph(id) {
      if (!MORPHS[id]) return;
      morph = id;
      morphBtns.forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-morph') === id ? 'true' : 'false');
      });
      pushLog('Sentinel Morph → ' + MORPHS[id].label, 'hot');
      document.getElementById('demo-stage') &&
        document.getElementById('demo-stage').style.setProperty('--demo-accent', MORPHS[id].accent);
    }

    function updateSteps() {
      if (!stageEl) return;
      var nodes = stageEl.querySelectorAll('.step');
      nodes.forEach(function (n, i) {
        n.classList.remove('active', 'done');
        if (i < stepIdx) n.classList.add('done');
        if (i === stepIdx) n.classList.add('active');
      });
    }

    function metricsForStep() {
      var contain = [42, 58, 86, 97][stepIdx] || 40;
      var deceive = [55, 72, 81, 93][stepIdx] || 50;
      if (morph === 'aggressive') deceive = Math.min(99, deceive + 6);
      if (morph === 'forensic') contain = Math.min(99, contain + 4);
      if (morph === 'stealth') deceive = Math.max(40, deceive - 8);
      if (containEl) containEl.textContent = contain + '%';
      if (deceiveEl) deceiveEl.textContent = deceive + '%';
      if (containSvg) ringGauge(containSvg, contain, MORPHS[morph].accent);
      if (deceiveSvg) ringGauge(deceiveSvg, deceive, '#69f0ae');
    }

    function draw(now) {
      var w = canvas.clientWidth;
      var h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      var accent = MORPHS[morph].accent;

      // grid
      ctx.strokeStyle = 'rgba(0,229,255,0.06)';
      for (var x = 0; x < w; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (var y = 0; y < h; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      var cx = w * 0.5;
      var cy = h * 0.52;
      // plane shell
      ctx.strokeStyle = accent + '55';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.32, h * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();

      // nexus
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // threat node
      var progress = (stepIdx + (reduced ? 0.5 : (t % 3000) / 3000)) / STEPS.length;
      var tx = w * 0.12 + progress * w * 0.55;
      var ty = h * 0.22 + Math.sin(progress * Math.PI) * h * 0.2;
      if (stepIdx >= 2) {
        // contained — pull toward nexus
        tx += (cx - tx) * 0.35;
        ty += (cy - ty) * 0.35;
      }
      var tcol = stepIdx >= 3 ? '#69f0ae' : stepIdx >= 2 ? '#ffab40' : '#ff1744';
      ctx.strokeStyle = tcol + '88';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = tcol;
      ctx.beginPath();
      ctx.arc(tx, ty, 5, 0, Math.PI * 2);
      ctx.fill();

      // seal ring
      if (stepIdx >= 3) {
        ctx.strokeStyle = 'rgba(105,240,174,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 36 + (reduced ? 0 : 4 * Math.sin(now * 0.004)), 0, Math.PI * 2);
        ctx.stroke();
      }

      // guardians in aggressive/research
      if (morph === 'aggressive' || morph === 'research') {
        for (var i = 0; i < 4; i++) {
          var a = (i / 4) * Math.PI * 2 + now * 0.0008;
          var gx = cx + Math.cos(a) * 48;
          var gy = cy + Math.sin(a) * 36;
          ctx.fillStyle = '#69f0ae';
          ctx.beginPath();
          ctx.arc(gx, gy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    var lastStepLog = -1;
    function tick(now) {
      t = now;
      var cycle = reduced ? 999999 : 2800;
      if (!reduced && running) {
        var next = Math.floor((now / cycle) % STEPS.length);
        if (next !== stepIdx) {
          stepIdx = next;
          updateSteps();
          metricsForStep();
          if (stepIdx !== lastStepLog) {
            lastStepLog = stepIdx;
            var msgs = [
              { m: 'Probe classified · scanner signature', c: 'warn' },
              { m: 'Genome morph fragments applied', c: 'hot' },
              { m: 'Containment policy engaged', c: 'ok' },
              { m: 'Incident sealed · Merkle root written', c: 'ok' },
            ];
            pushLog(msgs[stepIdx].m, msgs[stepIdx].c);
          }
        }
      }
      draw(now);
      if (!reduced) raf = requestAnimationFrame(tick);
    }

    morphBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        setMorph(b.getAttribute('data-morph'));
        metricsForStep();
      });
    });

    if (replayBtn) {
      replayBtn.addEventListener('click', function () {
        stepIdx = 0;
        lastStepLog = -1;
        logs = [];
        pushLog('Synthetic campaign restarted (demo data)', 'ok');
        updateSteps();
        metricsForStep();
        if (reduced) draw(0);
      });
    }

    resize();
    window.addEventListener('resize', resize);
    setMorph('research');
    updateSteps();
    metricsForStep();
    pushLog('Demo fabric online · authorized synthetic sequence', 'ok');
    if (reduced) {
      stepIdx = 2;
      updateSteps();
      metricsForStep();
      draw(0);
    } else {
      raf = requestAnimationFrame(tick);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
