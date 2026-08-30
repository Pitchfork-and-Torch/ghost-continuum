# Ghost Continuum v3.6.4 - Air-Gap Map

Command Nexus holographic map runs without a CDN.

## Highlights

- **Vendored Three.js r160** at `/vendor/three.module.js`. Air-gapped cabins get WebGL.
- **Canvas 2D fallback** if WebGL is blocked.
- Crystal Seal silent Windows spawn is unchanged.
- Defensive-only - local-first - zero core npm deps - MIT.

## Install

```bash
git clone https://github.com/Pitchfork-and-Torch/ghost-continuum.git
cd ghost-continuum
npm run setup
npm start
# http://127.0.0.1:30000
```

## Live

- Site: https://ghost.jonbailey.xyz/
- Hub preview: https://ghost.jonbailey.xyz/hub/
- Source: https://github.com/Pitchfork-and-Torch/ghost-continuum
