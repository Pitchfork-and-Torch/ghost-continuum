# Ghost Continuum v3.6.0 - Crystal Seal

Sealed forensic replay plus hub write-path hardening - same defensive scope, zero core deps.

## Highlights

- **Sealed HTML forensic replay** - incident exports hash evidence after write (portable relative paths in `MANIFEST.json`) and ship a standalone `replay.html` you can open offline, print to PDF, and step with j/k. New CLI: `ghost-continuum seal [label]` / `ghost-continuum verify [dir|.tgz]`.
- **O(1) Merkle ledger appends** - the tamper-evident ledger no longer re-reads the whole chain on every event (was O(n)/event, O(n^2) under bursts).
- **Robust ledger verification** - `verifyLedger` anchors on its window, so long chains verify cleanly instead of falsely reporting a chain break.
- **Flood-resistant control plane** - per-IP rate limit on mutating `POST /api/*` (default 120/10s -> `429`, `writeRateLimitMax` / `writeRateLimitWindowMs`, `0` disables). Plus a timing-safe hub bearer check.
- **Hub Host / Origin lock** (unreleased follow-up) - loopback `Host` allowlist blocks DNS rebinding; mutating `/api/*` rejects a foreign `Origin` (CLI without Origin still works). Tunnel hostnames go in `hubAllowedHosts` / `GC_HUB_ALLOWED_HOSTS` — never secrets.
- **Hub read-path lock** (unreleased follow-up) - GET `/api/*` requires the same bearer as writes when a token is set; extra hosts always require a token; the bearer is never injected into HTML.
- **Hub safe GET watch** (unreleased follow-up) - `GET /api/threat/watch` no longer switches morph or fires webhooks; those jobs run on a hub timer so a no-`Origin` GET cannot CSRF them.
- **Release + ops automation** - `.github/workflows/release.yml` auto-publishes this Release from the CHANGELOG on tag push; `npm run deploy:site:unix` / `deploy:seo:unix` publish the public site from Linux/macOS/CI. See `docs/RELEASING.md`.
- Defensive-only - local-first - zero core npm deps - MIT.

> The hub write-path hardening was first cut on a parallel branch as v3.5.1 and is folded into 3.6.0 here.

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
