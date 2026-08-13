/* Ghost Continuum PWA - cache shell only; never cache API/events */
const CACHE = 'gc-nexus-v3.5.0-shell';
const SHELL = [
  '/',
  '/index.html',
  '/assets/ui.css?v=3.5.0',
  '/assets/ui-nexus-3.3.css?v=3.5.0',
  '/assets/ui-nexus-3.5.css?v=3.5.0',
  '/assets/app.js?v=3.5.0',
  '/assets/simple-help.js',
  '/assets/ghost-lan-panel.js',
  '/assets/holo-map.js',
  '/assets/ghost-voice.js',
  '/assets/home.js',
  '/assets/node-meta.js',
  '/assets/command-palette.js',
  '/assets/operator-sentinel.js',
  '/assets/settings.js',
  '/assets/explainers.js',
  '/fonts/fontshare/fonts.css',
  '/logo.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname === '/' || url.pathname.endsWith('.webmanifest'))) {
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    })),
  );
});
