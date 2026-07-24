/**
 * Operator sentinel portrait — Matrix rain overlay that evolves with Nexus state.
 * Moods: clear | live | demo | elevated | threat | breach | morph | evolve
 */

const KATA = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF<>[]{}/*#@$%&';

const MOODS = {
  clear: {
    label: 'CLEAR',
    tag: 'LINK NOMINAL',
    rain: '#39ff14',
    rainDim: 'rgba(57,255,20,0.15)',
    tint: 'rgba(0,40,10,0.25)',
    speed: 0.85,
    density: 0.7,
    glitch: 0,
  },
  live: {
    label: 'LIVE',
    tag: 'FABRIC ONLINE',
    rain: '#00e5ff',
    rainDim: 'rgba(0,229,255,0.18)',
    tint: 'rgba(0,30,50,0.3)',
    speed: 1,
    density: 0.85,
    glitch: 0.05,
  },
  demo: {
    label: 'DEMO',
    tag: 'SIMULATION LAYER',
    rain: '#b388ff',
    rainDim: 'rgba(179,136,255,0.2)',
    tint: 'rgba(40,0,60,0.35)',
    speed: 1.35,
    density: 1.1,
    glitch: 0.2,
  },
  elevated: {
    label: 'ELEVATED',
    tag: 'PROBE PRESSURE',
    rain: '#ffab40',
    rainDim: 'rgba(255,171,64,0.22)',
    tint: 'rgba(50,30,0,0.35)',
    speed: 1.5,
    density: 1.15,
    glitch: 0.25,
  },
  threat: {
    label: 'THREAT',
    tag: 'REAL ATTACK VECTOR',
    rain: '#ff1744',
    rainDim: 'rgba(255,23,68,0.28)',
    tint: 'rgba(60,0,10,0.45)',
    speed: 2.1,
    density: 1.4,
    glitch: 0.45,
  },
  breach: {
    label: 'BREACH',
    tag: 'HIGH SCORE · CONTAIN',
    rain: '#ff003c',
    rainDim: 'rgba(255,0,60,0.35)',
    tint: 'rgba(80,0,0,0.55)',
    speed: 2.6,
    density: 1.7,
    glitch: 0.7,
  },
  morph: {
    label: 'MORPH',
    tag: 'SENTINEL RECONFIG',
    rain: '#e040fb',
    rainDim: 'rgba(224,64,251,0.25)',
    tint: 'rgba(50,0,60,0.4)',
    speed: 1.8,
    density: 1.2,
    glitch: 0.35,
  },
  evolve: {
    label: 'EVOLVE',
    tag: 'GENOME ASCENSION',
    rain: '#69f0ae',
    rainDim: 'rgba(105,240,174,0.28)',
    tint: 'rgba(0,50,30,0.4)',
    speed: 1.6,
    density: 1.3,
    glitch: 0.3,
  },
};

function resolveMood(state = {}) {
  // Priority: breach/threat > demo theatrical > morph flash > evolve flash > elevated > live > clear
  if (state.flash === 'evolve') return 'evolve';
  if (state.flash === 'morph') return 'morph';
  if (state.mapMode === 'demo') return 'demo';
  if (state.verdict === 'REAL_THREAT' || state.severity === 'critical') {
    return (state.topScore || 0) >= 7 || state.severity === 'critical' ? 'breach' : 'threat';
  }
  if (state.verdict === 'ELEVATED' || (state.topScore || 0) >= 5) return 'elevated';
  if (state.mapMode === 'live' && (state.liveEvents || state.armed)) return 'live';
  return 'clear';
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panel
 * @param {HTMLCanvasElement} opts.canvas
 * @param {HTMLImageElement} opts.img
 */
export function createOperatorSentinel(opts = {}) {
  const panel = opts.panel || document.getElementById('operatorPanel');
  const canvas = opts.canvas || document.getElementById('operatorRain');
  const img = opts.img || document.getElementById('operatorImg');
  const tagEl = opts.tagEl || document.getElementById('operatorTag');
  const moodEl = opts.moodEl || document.getElementById('operatorMood');

  if (!panel || !canvas) return null;

  const ctx = canvas.getContext('2d');
  const state = {
    mood: 'clear',
    flash: null,
    flashUntil: 0,
    mapMode: 'live',
    verdict: 'CLEAR',
    severity: 'none',
    topScore: 0,
    columns: [],
    fontSize: 11,
    animId: null,
    last: 0,
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.body.classList.contains('reduced-motion'),
  };

  function resize() {
    const frame = panel.querySelector('.operator-frame') || panel;
    const w = frame.clientWidth || 220;
    const h = frame.clientHeight || 200;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.fontSize = Math.max(10, Math.floor(w / 22));
    const cols = Math.floor(w / state.fontSize);
    state.columns = Array.from({ length: cols }, () => ({
      y: Math.random() * h,
      speed: 0.6 + Math.random() * 1.4,
      chars: Array.from({ length: 18 }, () => KATA[Math.floor(Math.random() * KATA.length)]),
    }));
  }

  function applyMood(moodKey) {
    const m = MOODS[moodKey] || MOODS.clear;
    state.mood = moodKey;
    panel.dataset.nexusMood = moodKey;
    panel.style.setProperty('--op-rain', m.rain);
    panel.style.setProperty('--op-tint', m.tint);
    if (tagEl) tagEl.textContent = m.tag;
    if (moodEl) moodEl.textContent = m.label;
    if (img) {
      img.style.filter = moodKey === 'breach' || moodKey === 'threat'
        ? 'contrast(1.15) saturate(0.85) hue-rotate(-8deg)'
        : moodKey === 'demo'
          ? 'contrast(1.05) saturate(1.2) hue-rotate(20deg)'
          : moodKey === 'evolve'
            ? 'contrast(1.1) saturate(1.15) brightness(1.05)'
            : 'contrast(1.05) saturate(1.05)';
    }
  }

  function tick(ts) {
    state.animId = requestAnimationFrame(tick);
    if (state.flash && ts > state.flashUntil) {
      state.flash = null;
      applyMood(resolveMood(state));
    }

    if (state.reduced) {
      // Static sparse glyphs only
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const m = MOODS[state.mood] || MOODS.clear;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = m.rain;
      ctx.font = `${state.fontSize}px "JetBrains Mono", monospace`;
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 12; i++) {
        ctx.fillText(KATA[i % KATA.length], (i * 37) % w, (i * 53) % h);
      }
      ctx.globalAlpha = 1;
      return;
    }

    const now = ts || 0;
    const dt = Math.min(32, now - (state.last || now));
    state.last = now;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const m = MOODS[state.mood] || MOODS.clear;

    // Fade trail
    ctx.fillStyle = 'rgba(3, 4, 10, 0.12)';
    ctx.fillRect(0, 0, w, h);

    // Color wash
    ctx.fillStyle = m.tint;
    ctx.fillRect(0, 0, w, h);

    ctx.font = `600 ${state.fontSize}px "JetBrains Mono", ui-monospace, monospace`;
    const speedMul = m.speed * (dt / 16);

    state.columns.forEach((col, i) => {
      const x = i * state.fontSize;
      col.y += col.speed * state.fontSize * 0.15 * speedMul * m.density;

      // Mutate head char occasionally
      if (Math.random() < 0.08 * m.density) {
        col.chars[0] = KATA[Math.floor(Math.random() * KATA.length)];
      }
      if (Math.random() < 0.02) {
        col.chars.push(KATA[Math.floor(Math.random() * KATA.length)]);
        if (col.chars.length > 22) col.chars.shift();
      }

      for (let j = 0; j < col.chars.length; j++) {
        const ch = col.chars[j];
        const y = col.y - j * state.fontSize;
        if (y < -state.fontSize || y > h + state.fontSize) continue;
        if (j === 0) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = m.rain;
          ctx.shadowBlur = 8;
          ctx.globalAlpha = 0.95;
        } else {
          ctx.shadowBlur = 0;
          ctx.fillStyle = m.rain;
          ctx.globalAlpha = Math.max(0.05, 0.75 - j * 0.045);
        }
        // Density skip
        if (j > 2 && Math.random() > m.density) continue;
        ctx.fillText(ch, x, y);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      if (col.y - col.chars.length * state.fontSize > h) {
        col.y = -Math.random() * h * 0.3;
        col.speed = 0.6 + Math.random() * 1.4;
      }
    });

    // Glitch bands on threat/demo
    if (m.glitch > 0 && Math.random() < m.glitch * 0.08) {
      const gy = Math.random() * h;
      const gh = 2 + Math.random() * 8;
      ctx.fillStyle = m.rainDim;
      ctx.fillRect(0, gy, w, gh);
      if (img && m.glitch > 0.4) {
        img.style.transform = `translateX(${(Math.random() - 0.5) * 4}px)`;
        setTimeout(() => { if (img) img.style.transform = ''; }, 60);
      }
    }
  }

  function setNexusState( partial = {} ) {
    Object.assign(state, partial);
    if (state.flash && !state.flashUntil) {
      state.flashUntil = performance.now() + (partial.flashMs || 2800);
    }
    const mood = resolveMood(state);
    applyMood(mood);
  }

  function pulse(kind = 'evolve', ms = 2800) {
    setNexusState({ flash: kind, flashMs: ms, flashUntil: performance.now() + ms });
  }

  // img error fallback
  if (img) {
    img.addEventListener('error', () => {
      img.src = '/logo.png';
      img.classList.add('operator-fallback');
    });
  }

  resize();
  applyMood('clear');
  const ro = new ResizeObserver(() => resize());
  ro.observe(panel);
  requestAnimationFrame(tick);

  return {
    setNexusState,
    pulse,
    resize,
    dispose() {
      cancelAnimationFrame(state.animId);
      ro.disconnect();
    },
  };
}
