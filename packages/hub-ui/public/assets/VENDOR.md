# Hub UI vendor notes (v3.7.0 Air-Gap Map)

## Three.js (local only)

- **What:** `three@0.160.0` ESM build at `packages/hub-ui/public/vendor/three.module.js` (REVISION 160)
- **Load:** hub import map and `holo-map.js` import only `/vendor/three.module.js`
- **Fallback:** canvas 2D if the vendor file is missing or WebGL is blocked. Never a CDN.
- **Hub must serve** `/vendor/` and `/fonts/` (see `isPublicUiAssetPath` in hub-api)

## PWA

- `manifest.webmanifest` + `sw.js` - caches UI shell only, **never** caches `/api/*`
- Installable on phone/desktop for couch ops

## Fonts

- Clash Display + Satoshi (self-hosted Fontshare)
- Fallback: system-ui / monospace

## No npm install required for core engine

These UI assets never enter the Node process dependency graph.
