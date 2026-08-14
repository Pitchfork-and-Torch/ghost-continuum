/**
 * Luminous Membrane / Crystal Membrane landing chrome:
 * scroll progress, section spy, mobile nav, reveals, magnetic CTAs,
 * sticky install bar, mobile dock, idle Twitter pixel,
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

  function closeNav(nav, toggle) {
    nav.classList.remove('nav-open');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
    }
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
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        if (open) {
          var first = nav.querySelector('.nav-links a');
          if (first) first.focus();
        }
      });
      nav.querySelectorAll('.nav-links a').forEach(function (a) {
        a.addEventListener('click', function () {
          closeNav(nav, toggle);
        });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          var wasOpen = nav.classList.contains('nav-open');
          closeNav(nav, toggle);
          if (wasOpen) toggle.focus();
        }
      });
      document.addEventListener('click', function (e) {
        if (!nav.classList.contains('nav-open')) return;
        if (nav.contains(e.target)) return;
        closeNav(nav, toggle);
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

  function initStickyCta() {
    var bar = document.getElementById('sticky-cta');
    var dock = document.querySelector('.mobile-dock');
    var hero = document.querySelector('.hero');
    if (!hero) return;

    function dismissed() {
      try {
        return sessionStorage.getItem('gc-sticky-dismiss') === '1';
      } catch (e) {
        return false;
      }
    }

    function hideAll() {
      try {
        sessionStorage.setItem('gc-sticky-dismiss', '1');
      } catch (e) { /* */ }
      if (bar) {
        bar.classList.remove('is-on');
        bar.hidden = true;
      }
      if (dock) {
        dock.classList.remove('is-on');
        dock.classList.add('is-dismissed');
      }
    }

    if (dismissed()) {
      hideAll();
      return;
    }

    function setShown(on) {
      if (dismissed()) return;
      if (bar) {
        bar.hidden = !on;
        bar.classList.toggle('is-on', on);
      }
      if (dock) {
        dock.classList.toggle('is-on', on);
        dock.classList.toggle('is-dismissed', !on);
      }
    }

    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
    } else {
      var io = new IntersectionObserver(
        function (ents) {
          ents.forEach(function (en) {
            setShown(!en.isIntersecting);
          });
        },
        { threshold: 0.12 }
      );
      io.observe(hero);
    }

    var dismiss = document.getElementById('sticky-cta-dismiss');
    var dockDismiss = document.getElementById('dock-dismiss');
    if (dismiss) dismiss.addEventListener('click', hideAll);
    if (dockDismiss) dockDismiss.addEventListener('click', hideAll);
  }

  function initTwitterPixel() {
    var loaded = false;
    function load() {
      if (loaded) return;
      loaded = true;
      var s = window.twq;
      if (!s) {
        s = window.twq = function () {
          s.exe ? s.exe.apply(s, arguments) : s.queue.push(arguments);
        };
        s.version = '1.1';
        s.queue = [];
      }
      var u = document.createElement('script');
      u.async = true;
      u.src = 'https://static.ads-twitter.com/uwt.js';
      u.onload = function () {
        try { window.twq('config', 'rdkqt'); } catch (e) { /* */ }
      };
      document.head.appendChild(u);
    }
    var kick = function () {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      load();
    };
    window.addEventListener('pointerdown', kick, { passive: true });
    window.addEventListener('keydown', kick);
    window.setTimeout(load, 6000);
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
    root.dataset.membrane = '3.6';
    root.dataset.version = '3.6.0';
    initYear();
    initScrollProgress();
    initNav();
    initReveals();
    initMagneticButtons();
    initStickyCta();
    initTwitterPixel();
    initAmbient();
    initKonami();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
