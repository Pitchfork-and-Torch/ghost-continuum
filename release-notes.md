# Ghost Continuum v3.6.3 - Crystal Seal

No extra Windows console. Ghost LAN is a hidden child of the hub.

## Highlights

- **No cmd trampoline** - hub URL opens with `explorer.exe`. Ghost LAN is not started via `cmd /c start` or `detached` (that still allocated a console).
- **spawnHidden** - sentinel is a hidden child of the hub process.
- **3.6.2 / 3.6.1 included** - first silent-start pass, evasion-class probes, portable Windows zip.
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
