# Ghost Continuum — Legal & Authorized Use

Ghost Continuum is a **defensive deception stack**: bundled Ghost LAN (LAN honeypots), edge tripwires (local dev server or Cloudflare Worker), built-in audit validation, and a loopback-only command hub.

## You may use this tool to

- Protect networks and websites **you own or operate**
- Run recon and drills against **localhost**, **your LAN**, and **domains you control**
- Collect evidence from your own honeypots and tripwires
- Validate that your deception layers are working (passive drill, self-scan)

## You may NOT use this tool to

- Attack systems you do not own or lack **written permission** to test
- Port-forward honeypots to the public internet
- Run exploit, infiltration, or exfiltration roles against third parties
- Deceive networks you do not operate

## Built-in guardrails

- Scope probes launched from Ghost Continuum are **defensive presets only**
- Targets are validated against an allowlist (RFC1918, localhost, configured domains)
- Exploit roles are blocked at the hub boundary
- Hub API and local edge server bind to `127.0.0.1` only

## Optional scope validation cell

An external validation cell is **not required**. If you use one, point `DM_CELL_ROOT` or `cellRoot` in `~/.ghost-continuum/config.json`. Ghost Continuum talks to it over loopback only. That backend may be AGPL-licensed — the hub does not embed it.

## Evidence & manifests

Events append to `~/.ghost-continuum/events.jsonl` with SHA-256 manifest sealing for incident exports.

MIT License.