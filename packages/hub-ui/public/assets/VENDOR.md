# Hub UI vendor notes (v2.0 OMEGA IMMUNE)

## Three.js (optional, high-value)

- **What:** `three@0.160.0` ESM build via jsDelivr CDN (importmap in `index.html`)
- **Why:** True 3D holographic wireframe intrusion map with emissive materials, orbit camera, particle trails
- **Fallback:** `holo-map.js` → `createCanvasFallback()` if CDN blocked or WebGL unavailable
- **Air-gap offline kit:**
  1. Download https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js
  2. Save as `packages/hub-ui/public/vendor/three.module.js`
  3. In `index.html` importmap, set `"three": "/vendor/three.module.js"`
  4. Optional: vendor fonts locally and remove Google Fonts `<link>`

## PWA

- `manifest.webmanifest` + `sw.js` — caches UI shell only, **never** caches `/api/*`
- Installable on phone/desktop for couch ops

## Fonts

- Orbitron, Rajdhani, JetBrains Mono via Google Fonts
- Fallback: system-ui / monospace

## No npm install required for core engine

These UI assets never enter the Node process dependency graph.
