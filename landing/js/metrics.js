/**
 * Efficacy gauges - illustrative demo data only.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var METRICS = [
    { id: 'm-contain', label: 'Containment', value: 94, color: '#5ec8c0' },
    { id: 'm-response', label: 'Response', value: 88, color: '#6a9aab' },
    { id: 'm-deception', label: 'Deception rate', value: 91, color: '#9eb8c4' },
    { id: 'm-fp', label: 'Low false positives', value: 96, color: '#6bc4a0' },
  ];

  function ring(svg, pct, color, animate) {
    var r = 40;
    var c = 2 * Math.PI * r;
    var target = c * (1 - pct / 100);
    svg.innerHTML =
      '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="rgba(94,200,192,0.1)" stroke-width="8"/>' +
      '<circle class="arc" cx="50" cy="50" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" ' +
      'stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (animate ? c : target) + '" ' +
      'transform="rotate(-90 50 50)"/>';
    if (animate) {
      requestAnimationFrame(function () {
        var arc = svg.querySelector('.arc');
        if (arc) {
          arc.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)';
          arc.setAttribute('stroke-dashoffset', String(target));
        }
      });
    }
  }

  function sparkline(svg, seed, color) {
    var pts = [];
    var v = 40 + (seed % 20);
    for (var i = 0; i < 16; i++) {
      v = Math.max(20, Math.min(95, v + Math.sin(i * 0.7 + seed) * 8 + ((seed * i) % 7) - 3));
      pts.push((i / 15) * 100 + ',' + (100 - v));
    }
    svg.innerHTML =
      '<polyline fill="none" stroke="' + color + '" stroke-width="2" points="' + pts.join(' ') + '" opacity="0.85"/>';
  }

  function init() {
    var root = document.getElementById('metrics-grid');
    if (!root) return;

    var io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (en) {
              if (!en.isIntersecting) return;
              paint(true);
              io.disconnect();
            });
          },
          { threshold: 0.25 }
        )
      : null;

    function countUp(el, target, doAnimate) {
      if (!el) return;
      if (!doAnimate || reduced) {
        el.textContent = target + '%';
        return;
      }
      var start = performance.now();
      var dur = 900;
      function frame(now) {
        var t = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * eased) + '%';
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    function paint(animate) {
      METRICS.forEach(function (m, i) {
        var card = document.getElementById(m.id);
        if (!card) return;
        var svg = card.querySelector('.gauge');
        var val = card.querySelector('.m-val');
        var spark = card.querySelector('.spark');
        var doAnim = animate && !reduced;
        if (svg) ring(svg, m.value, m.color, doAnim);
        countUp(val, m.value, doAnim);
        if (spark) sparkline(spark, i * 13 + 3, m.color);
      });
    }

    if (io) io.observe(root);
    else paint(!reduced);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
