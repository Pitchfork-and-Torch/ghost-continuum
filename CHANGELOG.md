# Changelog

## [Unreleased] - Hub rate-limit identity

### Control-plane hygiene
- Write-side rate limits ignore `X-Forwarded-For` by default so a loopback client cannot rotate that header to skip the 120/10s cap.
- Opt-in only: `hubTrustProxy` or `GC_HUB_TRUST_PROXY=1` when a reverse proxy you control is the only path to the hub.
- `ghost-continuum doctor` reports the default-safe path and tips when the proxy flag is on.

## [Unreleased] - Hub read-path lock

### Control-plane hygiene
- Every `/api/*` method (GET included) requires the hub bearer when `hubToken` / `GC_HUB_TOKEN` is set — header or `gc-hub-token` cookie (EventSource cannot send `Authorization`).
- Extra (tunneled) hosts always require a configured token; `/api/*` returns `401` without it.
- Loopback HTML may set an HttpOnly `SameSite=Strict` cookie. The bearer is never injected into JavaScript, so a tunneled `GET /` cannot leak write access.

## [Unreleased] - Hub Host / Origin lock

### Control-plane hygiene
- Command Nexus rejects non-loopback `Host` headers (`421`) so a DNS-rebinding tab cannot read `/api/status` or the HTML boot token.
- Mutating `/api/*` rejects a foreign `Origin` (`403`) so a random website cannot CSRF the local hub. CLI / curl (no `Origin`) still work.
- Extra tunnel hostnames are opt-in via `hubAllowedHosts` or `GC_HUB_ALLOWED_HOSTS` — hostnames only, never secrets.
- `ghost-continuum doctor` reports the lock and warns when extra hosts are declared without a hub token.

## [3.6.0] - 2026-08-14 - Crystal Seal

### Sealed forensic replay
- Incident export now hashes evidence **after** files are written (portable relative paths in `MANIFEST.json`).
- Each seal includes a standalone `replay.html` — open offline, print to PDF, step events with j/k.
- Local CLI: `ghost-continuum seal [label]` and `ghost-continuum verify [dir|.tgz]`.
- Hub returns `manifestHash` + `replayUrl`; Forensics strip offers OPEN REPLAY.
- Threat-response SEAL uses the same bundle path.

### Hub write-path hardening (first cut as v3.5.1)
- Merkle ledger tracks its entry count incrementally instead of re-reading the entire chain on every append — event persistence is O(1) per event again (was O(n)/append, O(n²) under campaign/threat bursts, stalling the hub under sustained load).
- `verifyLedger` anchors on the first entry of its verification window, so chains longer than the window (default 5000) verify correctly and terminate at the stored root instead of falsely reporting a chain break.
- Mutating `POST /api/*` routes are protected by a per-IP fixed-window rate limit (default 120/10s, `429` with `Retry-After`; tune with `writeRateLimitMax` / `writeRateLimitWindowMs`, `0` disables). A write flood can no longer monopolize the serialized persistence path; the read path stays responsive.

### Release + ops
- `.github/workflows/release.yml` auto-publishes a GitHub Release from the matching CHANGELOG section on every `vX.Y.Z` tag push.
- Portable `scripts/deploy-site.sh` (`npm run deploy:site:unix`) and `scripts/post-deploy-seo.sh` (`npm run deploy:seo:unix`) mirror the Windows-only deploy/SEO scripts so the site can be published from Linux/macOS/CI.
- Release checklist for contributors: `docs/RELEASING.md`.

### Tests
- `test/seal-bundle.js` (hash-after-write, tamper, HTML escape, CLI verify).
- `test/hardening.js` (write-side rate limiter + ledger counter/windowed verification).

### Philosophy (unchanged)
- Defensive-only · local-first · zero core npm dependencies · authorized networks only · MIT · no eval.

## [3.5.0] - 2026-08-13 - Crystal Membrane (engine)

### Command Nexus + engine
- Natural-language query now honors time windows (last hour / 24h / 7d) and AND-filters a typed IPv4.
- Extra query intents: containment, Merkle/forensics, Home Shield.
- Command palette (Ctrl/Cmd+K) for views, LIVE/DEMO, RESPOND, evolve, seal, canned queries.
- Keyboard cockpit: 1-5 switch views, / focuses query, Esc closes palette then dossier.
- Node dossier: plain-language "why it matters", focus restore on close.
- Version truth unified to 3.5.0 Crystal Membrane (hub API, CLI, PWA shell).

### Tests
- `test/nl-query.js` and `test/command-palette.js`.

### Philosophy (unchanged)
- Defensive-only · local-first · zero core npm dependencies · authorized networks only · MIT · no eval.

## [3.4.0] - 2026-08-13 - Crystal Membrane

### Public site (ghost.jonbailey.xyz)
- Grok 4.6 craft pass on Luminous Membrane: semantic tokens, fluid type roles, full motion token set, reduced-transparency path, view transitions.
- Fleet chrome: brand island + @suddenlyjon X follow pill, discreet hits.jonbailey.xyz counter, tweet card ?v=3.4.0.
- Marketing UX: one primary CTA + quiet secondary; sticky install bar and mobile dock appear after the hero and are dismissible.
- A11y: 44px targets, skip-link, designed focus, install-tab arrow keys, FAQ schema matches visible questions.
- Perf: critical Fontshare faces only, font preload, idle Twitter pixel, LCP logo preload.

### Philosophy (unchanged)
- Defensive-only · local-first · zero core npm dependencies · authorized networks only · MIT · no eval.

## [3.3.7] - 2026-08-01 - Crystal Nexus

### Command Nexus
- Tabbed cockpit: Overview · Ghost LAN · Genome · Forensics · Home Shield.
- Banner fabric map with hover-expand over the full center bento; pin with EXPAND.
- Uniform under-map deck: Protection Layers · OPS · Household Devices · Progress Hygiene (hover expands upward).
- Best Decoy Personalities in left column; Operator chip follows @suddenlyjon on X.
- Simple help glass tips (plain language) on by default; TIPS ON/OFF toggle.
- Ghost LAN native tab via hub `/api/ghost-lan` proxy (no second window required).
- Membrane 3D palette, soft dust field, morph-reactive lighting; canvas fallback retained.

### Public site
- Architecture infographic + OG share cards for Crystal Nexus v3.3.7.
- Hub preview + llms.txt / SEO suite refreshed.

### Philosophy (unchanged)
- Defensive-only · local-first · zero core npm dependencies · authorized networks only · MIT · no eval.


Living Digital Immune System - polymorphic deception, holographic Command Nexus, Merkle forensics.

## [3.2.0] - 2026-08-01 - Crystal Bento

### Command Nexus (packages/hub-ui)
- **Crystal Bento** modular membrane dashboard: hero fabric map, efficacy gauges, operator sentinel, NSGA-II genome, eight sensor planes, morph modes, Ghost Intelligence, threat/ops, Forensic Time Machine, Merkle integrity strip.
- Refined Luminous Membrane tokens with legacy aliases preserved.
- Membrane micro-interactions, crystalline edge highlights, gauge breath, skeleton shimmer; full prefers-reduced-motion path.
- Version chrome, PWA shell cache, and API status codename -> 3.2.0 Crystal Bento.

### Public site + /hub/
- Static hub preview rebuilt as Crystal Bento showcase with FAQ + SoftwareApplication JSON-LD.
- Architecture infographic + OG share cards cache-bust ?v=3.2.0.
- SEO/AEO: llms.txt, sitemap, IndexNow.

### Philosophy (unchanged)
- Defensive-only · local-first · zero core npm dependencies · authorized networks only · MIT · no eval.

## [3.1.0] - 2026-08-01 - Luminous Membrane

### Public site + design system
- Full premium rebrand: Luminous Membrane / Crystal Sentinel art direction.
- Design tokens: soft teal, pearl, warm charcoal (no pure void, neon HUD, or CRT scanlines).
- Self-hosted Fontshare Clash Display + Satoshi; membrane microinteractions; WCAG-minded focus rings.
- Regenerated 1200x630 OG / share cards; architecture infographic; hub static preview.
- Docs: `docs/DESIGN-SYSTEM-LUMINOUS-MEMBRANE.md`, `docs/VISUAL-CHANGELOG-3.1-LUMINOUS-MEMBRANE.md`.

### Command Nexus
- Same visual language as the public site; scanlines retired; softer operator chrome.
- Demo / holo / operator rain palettes remapped to membrane teal system.

### Philosophy (unchanged)
- Defensive-only · local-first · zero core npm dependencies · authorized networks only · MIT · no eval.

## [3.0.0] - 2026-07-23 - OMEGA ASCENDANT

### Public site
- Complete redesign of `landing/` into an immersive single-page Command interface (deep void aesthetic, glass panels, Orbitron + IBM Plex).
- Cinematic hero with live Canvas holographic map preview and synthetic campaign loop.
- Interactive eight-plane architecture explorer (Ghost LAN through Trench Coat) with keyboard support.
- Client-side “Enter the Nexus” lifecycle demo: detect → morph → contain → seal with morph switcher and gauges.
- Home Shield spotlight, efficacy gauges (illustrative demo data), copy-to-clipboard install, first-5-minutes walkthrough, FAQ accordion.
- Modular assets: `landing/css/ascend.css`, `landing/js/*`; deploy pipeline and CSP updated for static CSS/JS.
- SEO suite refreshed for v3.0 (meta, JSON-LD, `llms.txt`, sitemap, theme-color).

### Command Nexus
- Branding and version chrome → **v3.0.0 OMEGA ASCENDANT**.
- Deeper void palette alignment; Ghost Voice speaking/listening feedback; reduced-motion freezes idle map orbit.
- PWA service worker cache list expanded; cache name bumped to v3.

### Core / packaging
- Continuum nexus status version and CLI banners aligned to 3.0.0.
- Optional Docker + docker-compose convenience packaging (engine remains zero npm deps).
- Docs: README, OMEGA-v3, DEPLOY-JONBAILEY, SECURITY supported versions.

### Philosophy (unchanged)
- Defensive-only · local-first · zero core npm dependencies · authorized networks only · MIT · no eval.

## [2.0.0] - OMEGA IMMUNE

- Holographic Command Nexus (Three.js + canvas fallback), Forensic Time Machine, Ghost Voice.
- NSGA-II multi-objective genome evolution, Chad leaderboard, predictive cones.
- SSE live fabric, demo campaign, threat RESPOND pipeline, plane toggles including Trench Coat.
- Home Shield wizard, language packs, kid mode, quiet hours, alerts, PWA foundations.
- Merkle trust fabric, STIX/TAXII 2.1.

## [1.0.x]

- Initial Living Deception Continuum: Ghost LAN, edge tripwires, genome pool, hub API/UI, sealed incidents.
