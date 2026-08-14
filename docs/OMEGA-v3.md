# Ghost Continuum v3.0 — OMEGA ASCENDANT

## Positioning

**OMEGA ASCENDANT** elevates the public presence and operator polish of the Living Digital Immune System so the sophistication of the internal fabric is visible at `https://ghost.jonbailey.xyz/` — without compromising defensive-only, local-first, zero-core-deps principles.

```
v2.0 OMEGA IMMUNE (cockpit + genome + SSE)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  OMEGA ASCENDANT (v3.0)                                   │
│  · Immersive public Command interface (landing/)          │
│  · Interactive plane explorer + client Nexus demo         │
│  · Home Shield narrative path for home / lab operators    │
│  · Hub-ui visual/a11y polish + version truth              │
│  · Packaging: Docker optional, docs/CHANGELOG complete    │
└───────────────────────────────────────────────────────────┘
```

## What v3 is (and is not)

| Is | Is not |
|----|--------|
| Public cinematic shell over the same defensive stack | A cloud-hosted brain |
| Client-side demos with synthetic data | Live attacker tooling |
| Home Shield onboarding clarity | Forced telemetry or accounts |
| Deploy-ready modular static assets | New core npm dependencies |

## Public architecture

```
landing/index.html
  ├── css/ascend.css          design tokens + glass UI
  ├── js/hero-holo.js         Canvas holo preview + auto-demo
  ├── js/planes-explorer.js   8 sensor planes (keyboard a11y)
  ├── js/nexus-demo.js        detect → morph → contain → seal
  ├── js/metrics.js           illustrative efficacy gauges
  ├── js/install.js           copy + platform tabs
  └── js/main.js              nav / chrome
```

Deploy: `npm run deploy:site` → Cloudflare Pages project `ghost-continuum` (see [DEPLOY-JONBAILEY.md](DEPLOY-JONBAILEY.md)).

## Operator path (unchanged root)

```bash
npm run setup
npm start
# → http://127.0.0.1:30000
```

## Sacred constraints

- Defensive-only language and capabilities
- Local-first data under `~/.ghost-continuum`
- Zero npm dependencies for the defensive engine
- Loopback hub; allowlisted scopes; no eval morph fragments
- MIT · LEGAL.md · SECURITY.md

## Related

- [OMEGA-v2.md](OMEGA-v2.md) — cockpit pillars delivered in 2.0  
- [MIGRATION-v2.md](MIGRATION-v2.md) — v1 → v2 notes (still valid under v3)  
- [HOME-NETWORK-ROADMAP.md](HOME-NETWORK-ROADMAP.md) — Home Shield depth  
