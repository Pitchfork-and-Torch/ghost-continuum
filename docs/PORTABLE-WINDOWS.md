# Portable Windows package (x64)

## Goal

A user who has never installed Node.js can double-click **GhostContinuum.exe** and get the full local Command Nexus at `http://127.0.0.1:30000`.

## Packaging strategy (chosen)

**Portable folder + thin native launcher + bundled Node** (not pure single-file SEA / pkg).

| Layer | What |
|-------|------|
| `GhostContinuum.exe` | ~7 KB C# console stub (`apps/portable/GhostContinuumLauncher.cs`) |
| `runtime/node.exe` | Official Node win-x64 (default 20.19.4; engines require >=18) |
| `app/` | Pruned monorepo: `bin/`, `packages/`, `assets/`, license + config example |

### Why not Node SEA or `@yao-pkg/pkg` as the only artifact?

1. **Ghost LAN child process** - `start-stack.js` spawns `process.execPath` + `packages/ghost-lan/bin/ghost-lan.js`, and Ghost LAN itself writes a `launch-sentinel.cmd` that re-invokes Node with on-disk scripts. A frozen single binary breaks that chain unless Ghost LAN is rewritten to run fully in-process.
2. **Static UI** - Command Nexus serves real files under `packages/hub-ui/public`. SEA asset extraction is possible, but multi-process + ESM monorepo friction is high.
3. **Philosophy** - Zero core *runtime npm* deps and an **auditable** tree under `app/` matter more than a one-file mystery blob. The launcher does not add application dependencies.

Optional future: SEA single-file that only starts hub+edge in-process and treats Ghost LAN as optional, or a Tauri WebView shell (`apps/nexus-desktop/`) that still needs this stack.

## Build (reproducible)

Prerequisites on the build machine:

- Windows x64
- PowerShell 5.1+
- `csc.exe` (.NET Framework 4.x or Visual Studio / Roslyn)
- Network once (to download Node), or `-SkipNodeDownload` if `node` is on PATH

```powershell
cd C:\path\to\ghost-continuum
powershell -ExecutionPolicy Bypass -File scripts\package-portable-win.ps1
```

npm aliases:

```bash
npm run package:win
npm run package:win:local-node
```

Outputs:

- `dist/GhostContinuum-Portable-win-x64/` - run from here
- `dist/GhostContinuum-Portable-win-x64-vX.Y.Z.zip` - distribute this

## Run / stop / data

| Action | How |
|--------|-----|
| Start | Double-click `GhostContinuum.exe` (or `.cmd`) |
| UI | Browser to `http://127.0.0.1:30000` (auto-open unless `GC_NO_BROWSER=1`) |
| Stop | Ctrl+C in the console window |
| Hub data | `%USERPROFILE%\.ghost-continuum` |
| Ghost LAN data | `%USERPROFILE%\.ghost-lan` |

Ports are **loopback only** (hub binds `127.0.0.1`). No public exposure by default. Defensive only.

## Limitations

- Windows x64 package only (macOS/Linux can still use `npm start` with system Node).
- Package size is dominated by `node.exe` (~70 MB; zip ~30+ MB).
- Some AVs flag first-run Node tooling / unknown EXEs (document hashes if you publish).
- Optional planes (Trench Coat binary, Docker mirage, remote Cloudflare edge) need extra software.
- Keep the folder intact; do not ship the `.exe` without `runtime\` and `app\`.

## AV notes

Common with any bundled runtime:

1. Prefer distributing the **zip** and publishing a SHA-256.
2. Code-signing the launcher (and ideally the package) reduces SmartScreen friction (not done by default in OSS builds).
3. If Windows SmartScreen blocks the launcher, "More info" -> Run anyway on a package you built yourself.

## Verify after build

```powershell
$env:GC_NO_BROWSER = '1'
& .\dist\GhostContinuum-Portable-win-x64\GhostContinuum.exe
# other terminal:
Invoke-WebRequest http://127.0.0.1:30000/ -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:30000/api/status -UseBasicParsing
# confirm listen only on 127.0.0.1:30000
Get-NetTCPConnection -LocalPort 30000 -State Listen
```

Expected: HTTP 200 on `/`, status JSON with planes, data under `%USERPROFILE%\.ghost-continuum`.
