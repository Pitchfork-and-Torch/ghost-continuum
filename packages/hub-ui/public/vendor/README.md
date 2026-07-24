# Offline Three.js vendor (optional)

For air-gapped or offline Command Nexus holographic maps:

1. Download [three.module.js r160](https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js)
2. Save as `three.module.js` in **this directory**
3. Restart the hub — `holo-map.js` loads `/vendor/three.module.js` before the CDN importmap

If the vendor file is missing, the UI uses the CDN importmap, then canvas 2D fallback.

Do not commit large binary vendor blobs unless intentional for offline kits.
