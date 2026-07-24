# Nexus Desktop (Tauri shell)

Optional desktop wrapper for the Command Nexus. The core platform remains zero-dep Node; this app adds native tray + fullscreen WebView.

## Prerequisites

- [Rust](https://rustup.rs)
- [Tauri CLI](https://tauri.app): `cargo install tauri-cli`

## Build

```bash
cd apps/nexus-desktop
cargo tauri build
```

## Dev

```bash
# Terminal 1
cd ../..
node bin/start-stack.js

# Terminal 2
cd apps/nexus-desktop
cargo tauri dev
```

The WebView loads `http://127.0.0.1:30000` with `GC_NO_BROWSER=1` on the stack process.

## Config

`tauri.conf.json` points `devUrl` and `frontendDist` to the local hub. No bundled frontend — hub-ui is served by hub-api.