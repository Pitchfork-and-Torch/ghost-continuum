# Portable Windows package

Produces a double-clickable **Ghost Continuum** folder for Windows x64:

| Path | Role |
|------|------|
| `GhostContinuum.exe` | Thin native launcher (no Node required on the host) |
| `GhostContinuum.cmd` | Same entry without the compiled stub |
| `runtime/node.exe` | Bundled Node.js (>=18) |
| `app/` | Readable monorepo subset (`bin/`, `packages/`, `assets/`) |

## Why not a pure single-file SEA?

The hub is pure Node ESM with **zero core npm deps**, which is a good SEA fit. Ghost LAN, however, is started as a **real child process** (`node ghost-lan.js start`) that writes its own launcher under `%USERPROFILE%\.ghost-lan`. A frozen single binary breaks that model or forces invasive rewrites.

This layout stays **auditable** (app source on disk), keeps child processes working, and still needs **no** system Node / npm / git for end users.

## Build

From repo root (requires `csc.exe` from .NET Framework or VS, and network for Node download once):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-portable-win.ps1
```

Or:

```bash
npm run package:win
```

Use the machine Node binary instead of downloading:

```powershell
npm run package:win:local-node
```

Output: `dist/GhostContinuum-Portable-win-x64/` and a versioned zip beside it.

## End-user run

1. Unzip the package (keep the folder together).
2. Double-click `GhostContinuum.exe`.
3. Browser opens `http://127.0.0.1:30000`.
4. Data: `%USERPROFILE%\.ghost-continuum` (and `\.ghost-lan` for the LAN plane).
5. Stop with Ctrl+C in the console.

## Tauri alternative

`apps/nexus-desktop/` is an optional WebView shell. It still needs the Node stack running separately. Prefer this portable package for "download and run."
