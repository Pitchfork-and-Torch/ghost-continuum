# Offline Three.js vendor (Air-Gap Map)

Command Nexus ships Three.js r160 here so the holographic map works without a CDN.

- File: `three.module.js` (ESM build, three@0.160.0)
- Loaded by `holo-map.js` and the hub import map
- If WebGL is blocked, the map falls back to canvas 2D
