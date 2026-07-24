import { loadPrefs } from './settings.js';

const CHARS =
  'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$+-*/=<>';

/**
 * Slow Matrix rain scoped to the sentinel art panel.
 */
export function initSentinelRain(container) {
  const canvas = container.querySelector('.sentinel-art-rain');
  if (!canvas) return null;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowAnim = loadPrefs().animationLevel === 'low';
  if (reduced || lowAnim) return null;

  const ctx = canvas.getContext('2d', { alpha: true });
  let columns = 0;
  let drops = [];
  let speeds = [];
  let running = true;
  const fontSize = 11;

  function resize() {
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Math.max(4, Math.floor(rect.width / 14));
    drops = Array.from({ length: columns }, () => Math.random() * -60);
    speeds = Array.from({ length: columns }, () => 0.12 + Math.random() * 0.28);
  }

  function draw() {
    if (!running) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.fillStyle = 'rgba(5, 10, 8, 0.14)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

    for (let i = 0; i < columns; i++) {
      const x = i * (w / columns) + 1;
      const char = CHARS[Math.floor(Math.random() * CHARS.length)];
      const y = drops[i] * fontSize;
      const head = Math.random() > 0.992;
      ctx.fillStyle = head
        ? 'rgba(200, 255, 220, 0.9)'
        : `rgba(0, ${200 + Math.floor(Math.random() * 55)}, 65, ${0.35 + Math.random() * 0.35})`;
      ctx.fillText(char, x, y);

      if (y > h && Math.random() > 0.992) {
        drops[i] = Math.random() * -8;
        speeds[i] = 0.12 + Math.random() * 0.28;
      }
      drops[i] += speeds[i];
    }

    requestAnimationFrame(draw);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  requestAnimationFrame(draw);

  return {
    destroy() {
      running = false;
      ro.disconnect();
    },
  };
}