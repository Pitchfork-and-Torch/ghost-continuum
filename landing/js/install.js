/**
 * Install section - platform tabs + one-click copy with premium success feedback.
 */
(function () {
  'use strict';

  var SNIPPETS = {
    unix: `git clone https://github.com/Pitchfork-and-Torch/ghost-continuum.git
cd ghost-continuum
npm run setup
npm start
# -> http://127.0.0.1:30000  COMMAND NEXUS`,
    windows: `git clone https://github.com/Pitchfork-and-Torch/ghost-continuum.git
cd ghost-continuum
npm run setup
npm start
# -> http://127.0.0.1:30000  COMMAND NEXUS

# Optional Windows helpers:
# npm run install:win
# npm run arm`,
  };

  function ensureToast() {
    var t = document.getElementById('copy-toast');
    if (t) return t;
    t = document.createElement('div');
    t.id = 'copy-toast';
    t.className = 'copy-toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    t.textContent = 'Copied to clipboard';
    document.body.appendChild(t);
    return t;
  }

  function flashToast(msg) {
    var t = ensureToast();
    t.textContent = msg || 'Copied to clipboard';
    t.classList.add('is-on');
    clearTimeout(flashToast._timer);
    flashToast._timer = setTimeout(function () {
      t.classList.remove('is-on');
    }, 1800);
  }

  function init() {
    var pre = document.getElementById('install-pre');
    var tabs = document.querySelectorAll('[data-install-tab]');
    var copyBtn = document.getElementById('install-copy');
    if (!pre) return;

    var current = 'unix';

    function show(id) {
      current = SNIPPETS[id] ? id : 'unix';
      pre.textContent = SNIPPETS[current];
      var selectedId = current === 'windows' ? 'tab-windows' : 'tab-unix';
      pre.setAttribute('aria-labelledby', selectedId);
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-install-tab') === current;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
    }

    var tabArr = Array.prototype.slice.call(tabs);
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        show(t.getAttribute('data-install-tab'));
      });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          show(t.getAttribute('data-install-tab'));
          return;
        }
        var idx = tabArr.indexOf(t);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          var n = tabArr[(idx + 1) % tabArr.length];
          show(n.getAttribute('data-install-tab'));
          n.focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          var p = tabArr[(idx - 1 + tabArr.length) % tabArr.length];
          show(p.getAttribute('data-install-tab'));
          p.focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          show(tabArr[0].getAttribute('data-install-tab'));
          tabArr[0].focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          var last = tabArr[tabArr.length - 1];
          show(last.getAttribute('data-install-tab'));
          last.focus();
        }
      });
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', async function () {
        var text = SNIPPETS[current] || SNIPPETS.unix;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          var prev = copyBtn.textContent;
          copyBtn.textContent = 'Copied';
          copyBtn.classList.add('is-success');
          copyBtn.setAttribute('aria-live', 'polite');
          flashToast('Install commands copied');
          setTimeout(function () {
            copyBtn.textContent = prev;
            copyBtn.classList.remove('is-success');
          }, 1600);
        } catch (e) {
          copyBtn.textContent = 'Select & copy';
          flashToast('Copy failed - select the block manually');
        }
      });
    }

    if (/Windows/i.test(navigator.userAgent || '')) show('windows');
    else show('unix');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
