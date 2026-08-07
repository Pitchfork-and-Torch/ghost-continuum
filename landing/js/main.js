/**
 * Luminous Membrane 2.0 landing chrome:
 * scroll progress, section spy, mobile nav, reveals, magnetic CTAs,
 * ambient hum (off by default), Konami terminal mode.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  function initYear() {
    var el = document.getElementById('year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function initScrollProgress() {
    var bar = document.querySelector('.scroll-progress');
    if (!bar) return;
    var onScroll = function () {
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      var pct = Math.min(100, Math.max(0, (window.scrollY / max) * 100));
      root.style.setProperty('--nav-progress', pct.toFixed(2) + '%');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function initNav() {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll('.nav-links a[href^="#"]'));
    var sections = links
      .map(function (a) {
        var id = a.getAttribute('href').slice(1);
        var el = document.getElementById(id);
        return el ? { a: a, el: el } : null;
      })
      .filter(Boolean);

    var onScroll = function () {
      nav.classList.toggle('is-scrolled', window.scrollY > 12);
      var y = window.scrollY + 120;
      var active = null;
      sections.forEach(function (s) {
        if (s.el.offsetTop <= y) active = s;
      });
      links.forEach(function (a) {
        a.classList.toggle('is-active', active && a === active.a);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var toggle = document.getElementById('nav-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      links.forEach(function (a) {
        a.addEventListener('click', function () {
          nav.classList.remove('nav-open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          nav.classList.remove('nav-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  function initReveals() {
    var nodes = document.querySelectorAll('[data-reveal]');
    if (!nodes.length) return;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      nodes.forEach(function (n) {
        n.classList.add('is-revealed');
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add('is-revealed');
          io.unobserve(en.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    nodes.forEach(function (n, i) {
      n.style.transitionDelay = Math.min(i * 40, 200) + 'ms';
      io.observe(n);
    });
  }

  function initMagneticButtons() {
    if (reduced || window.matchMedia('(pointer: coarse)').matches) return;
    var buttons = document.querySelectorAll('.btn-primary');
    buttons.forEach(function (btn) {
      btn.classList.add('is-magnetic');
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var x = ((e.clientX - r.left) / r.width) * 100;
        var y = ((e.clientY - r.top) / r.height) * 100;
        btn.style.setProperty('--mx', x + '%');
        btn.style.setProperty('--my', y + '%');
        var dx = (e.clientX - (r.left + r.width / 2)) * 0.12;
        var dy = (e.clientY - (r.top + r.height / 2)) * 0.12;
        btn.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) translateY(-2px) scale(1.01)';
      });
      btn.addEventListener('pointerleave', function () {
        btn.style.transform = '';
      });
    });
  }

  function initAmbient() {
    var btn = document.getElementById('ambient-toggle');
    if (!btn || reduced) {
      if (btn) btn.hidden = true;
      return;
    }
    var ctx = null;
    var nodes = null;
    var on = false;

    function stop() {
      if (!nodes) return;
      try {
        nodes.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        setTimeout(function () {
          try {
            nodes.osc.stop();
            nodes.lfo.stop();
          } catch (e) { /* */ }
          nodes = null;
        }, 450);
      } catch (e) {
        nodes = null;
      }
    }

    function start() {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = ctx || new AC();
      var osc = ctx.createOscillator();
      var lfo = ctx.createOscillator();
      var gain = ctx.createGain();
      var lfoGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 92;
      lfo.type = 'sine';
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 12;
      gain.gain.value = 0.0001;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      lfo.start();
      gain.gain.exponentialRampToValueAtTime(0.012, ctx.currentTime + 0.8);
      nodes = { osc: osc, lfo: lfo, gain: gain };
    }

    btn.addEventListener('click', function () {
      on = !on;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? 'Ambient on' : 'Ambient off';
      if (on) {
        if (ctx && ctx.state === 'suspended') ctx.resume();
        start();
      } else {
        stop();
      }
    });
  }

  function initKonami() {
    var seq = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
    var i = 0;
    window.addEventListener('keydown', function (e) {
      if (e.keyCode === seq[i]) {
        i++;
        if (i === seq.length) {
          document.body.classList.toggle('terminal-mode');
          i = 0;
        }
      } else {
        i = 0;
      }
    });
  }

  function init() {
    root.dataset.membrane = '2.0';
    root.dataset.version = '3.1.2';
    initYear();
    initScrollProgress();
    initNav();
    initReveals();
    initMagneticButtons();
    initAmbient();
    initKonami();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
