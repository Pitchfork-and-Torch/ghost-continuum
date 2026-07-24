# Ghost Continuum v3.0.0 — OMEGA ASCENDANT

**Release date:** 2026-07-23

## Headline

The public face of Ghost Continuum now feels like stepping into the Command Nexus. Version 3.0 OMEGA ASCENDANT ships an immersive [ghost.jonbailey.xyz](https://ghost.jonbailey.xyz/) experience alongside cockpit polish, Home Shield narrative clarity, and packaging/docs readiness — without adding core npm dependencies or relaxing defensive-only posture.

## Highlights

- **Cinematic landing** — holographic hero map, interactive eight-plane explorer, client-side threat lifecycle demo
- **Home Shield path** — wizard-first story for home labs and family networks
- **Install in ~5 minutes** — copy-to-clipboard, platform tabs, first-5-minutes walkthrough
- **Command Nexus polish** — v3 chrome, Ghost Voice speaking feedback, reduced-motion map orbit, deeper void palette
- **Optional Docker** — convenience packaging; engine remains zero runtime deps
- **Docs** — README, CHANGELOG, OMEGA-v3, SECURITY, deploy pipeline for modular static assets

## Philosophy (unchanged)

Defensive only · authorized networks only · local-first · zero core npm deps · MIT · auditable · no eval

## Upgrade

```bash
git pull
npm run setup
npm start
# → http://127.0.0.1:30000
```

Public site deploy (operator machine with Wrangler):

```powershell
npm run deploy:site
```

See [CHANGELOG.md](CHANGELOG.md) and [docs/OMEGA-v3.md](docs/OMEGA-v3.md).
