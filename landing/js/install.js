/**
 * Install section — platform tabs + copy-to-clipboard.
 */
(function () {
  'use strict';

  var SNIPPETS = {
    unix: `git clone https://github.com/Pitchfork-and-Torch/ghost-continuum.git
cd ghost-continuum
npm run setup
npm start
# → http://127.0.0.1:30000  COMMAND NEXUS`,
    windows: `git clone https://github.com/Pitchfork-and-Torch/ghost-continuum.git
cd ghost-continuum
npm run setup
npm start
# → http://127.0.0.1:30000  COMMAND NEXUS

# Optional Windows helpers:
# npm run install:win
# npm run arm`,
  };

  function init() {
    var pre = document.getElementById('install-pre');
    var tabs = document.querySelectorAll('[data-install-tab]');
    var copyBtn = document.getElementById('install-copy');
    if (!pre) return;

    var current = 'unix';

    function show(id) {
      current = SNIPPETS[id] ? id : 'unix';
      pre.textContent = SNIPPETS[current];
      tabs.forEach(function (t) {
        t.setAttribute('aria-selected', t.getAttribute('data-install-tab') === current ? 'true' : 'false');
      });
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        show(t.getAttribute('data-install-tab'));
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
          copyBtn.setAttribute('aria-live', 'polite');
          setTimeout(function () {
            copyBtn.textContent = prev;
          }, 1600);
        } catch (e) {
          copyBtn.textContent = 'Select & copy';
        }
      });
    }

    // Prefer Windows tab on Windows UA
    if (/Windows/i.test(navigator.userAgent || '')) show('windows');
    else show('unix');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
