# Ghost Continuum v3.5.1 - Crystal Membrane (hardening)

Hub write-path hardening surfaced by defensive load testing - same defensive scope, zero core deps.

## Highlights

- **O(1) Merkle ledger appends** - the tamper-evident ledger no longer re-reads the whole chain on every event (was O(n)/event, O(n^2) under campaign/threat bursts). Event persistence is constant-time again.
- **Robust ledger verification** - `verifyLedger` anchors on its verification window, so chains longer than the window verify cleanly instead of falsely reporting a chain break.
- **Flood-resistant control plane** - per-IP rate limit on mutating `POST /api/*` (default 120/10s -> `429` with `Retry-After`; `writeRateLimitMax` / `writeRateLimitWindowMs`, `0` disables). A write flood can no longer monopolize the serialized persistence path; reads stay responsive.
- **Tests** - `test/hardening.js` covers the rate limiter and the ledger counter/verification (suite now 16/16).
- **Portable ops** - `npm run deploy:site:unix` and `npm run deploy:seo:unix` mirror the Windows-only deploy scripts so the public site can be published from Linux/macOS/CI.
- Defensive-only - local-first - zero core npm deps - MIT.

## Measured impact (loopback load tests)

- Write latency: ~245 ms min (old) -> ~5 ms min; O(n^2) growth eliminated.
- 400-request write flood: 120 served + fast `429`s, drained in ~0.8s, reads stayed <1 ms.
- Read path (`GET /api/status`): ~3,490 req/s, unaffected during floods.

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
