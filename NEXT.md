# Next (Ghost Continuum)

## Cook 2026-09-17 (shipped 3.7.0, no bump)
- Hub serves `/vendor/` and `/fonts/` so Air-Gap Map loads Three.js r160 locally. No CDN.
- Canvas 2D fallback now pans on focusThreat / focusNode, draws plane shells, honors pause/resize.
- Deleted unused `packages/hub-ui/public/assets/nexus-3d.js`.
- Docs (OMEGA-v2, MIGRATION-v2, ROADMAP, UPGRADE-PLAN, VISUAL-CHANGELOG-3.3) no longer prescribe a Three.js CDN.

## Leftover
- Canvas fallback still has no orbit-drag (click/focus/shells/pause/resize only).
- Do not bump past 3.7.0 until the next real plane.

## Done 2026-09-01
- Advertised-version honesty: 3.6.4 Air-Gap Map stays current. Hub preview badge, release title template, landing hero/FAQ, llms, LIVE-SITES registry aligned. No new plane.

## Done 2026-08-30
- Post-deploy SEO env hardening: allowlisted `SEO_BASE` / alias / card URL, IndexNow without userinfo, HEAD 401/429 fail, shared `scripts/lib/seo-safe-url.js`.

## Done 2026-08-28
- **3.6.4 Air-Gap Map:** Three.js r160 vendored at `packages/hub-ui/public/vendor/three.module.js`. Hub import map is local. Canvas 2D fallback remains.

Hold (not a COOK leftover): hardened eBPF probes, K8s operator, hosted plugin registry, production Tauri builds.
