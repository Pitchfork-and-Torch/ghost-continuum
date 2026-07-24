/**
 * OMEGA ASCENDANT landing — nav, sticky state, FAQ a11y polish.
 */
(function () {
  'use strict';

  function initNav() {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var onScroll = function () {
      nav.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function initYear() {
    var el = document.getElementById('year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function init() {
    initNav();
    initYear();
    document.documentElement.dataset.ascendant = '3.0.0';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
