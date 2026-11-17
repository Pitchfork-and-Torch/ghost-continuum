# Ghost Continuum v3.7.2 - Air-Gap Map

3.7.2 refreshes the architecture card and version stamps. Map behavior is unchanged from 3.7.1.

## Access

The public hub gateway checks the caller's `Authorization` bearer and does not forward cookies. The Command Nexus live stream uses `fetch` and sends that bearer. The token is not placed in the URL.

Rotate the hub token by replacing the local value and the gateway value together, then update the browser copy and reload. Keep the value out of git, URLs, and tickets.

A restore copies listed operator settings from a well-formed backup. Credentials, plugins, endpoints, hosts, and ports stay on the current install. A malformed backup is rejected and does not write.

Command Nexus holographic map runs without a CDN. The canvas fallback can orbit.

## Highlights

- **Vendored Three.js r160** at `/vendor/three.module.js`. Air-gapped cabins get WebGL.
- **Canvas 2D fallback** if WebGL is blocked: focus/pan, orbit-drag, wheel zoom, plane shells, pause/resize.
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
