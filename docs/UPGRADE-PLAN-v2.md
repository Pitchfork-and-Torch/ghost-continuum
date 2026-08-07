# Ghost Continuum v2.0 — High-level upgrade plan & architecture diff

## Mission

Elevate Ghost Continuum from an exceptional v1 living-deception stack into **OMEGA IMMUNE**: the holographic Command Nexus as the undisputed visual/functional pinnacle of network defense UIs — local-first, defensive-only, zero-core-deps.

## Pillars delivered

1. **Command Nexus cockpit** — glassmorphic layout matching the visual bible (X infographic)
2. **Holographic 3D map** — Three.js + canvas fallback, threat paths, plane shells, predictive cones
3. **Real-time fabric** — SSE + poll, morph/genome/map invalidation
4. **NSGA-II genome** — multi-objective + novelty + Chad leaderboard + phylogeny/landscape APIs
5. **Forensic Time Machine** — scrubber, markers, branch sim, export hooks
6. **Ghost Voice + NL** — Web Speech + enhanced local query patterns
7. **Demo campaign** — instant glory without a real network
8. **Docs** — README, migration, architecture, vendor notes

## Diff summary

| Area | Before (v1) | After (v2) |
|------|-------------|------------|
| UI shell | Multi-card dashboard | Full-bleed cockpit (top bar · gauge · holo · morph · timeline · status) |
| Map | Canvas 2D nexus-map | WebGL holo-map + 2D fallback |
| Evolution | Tournament GA | NSGA-II default, classic retained |
| Live events | Poll only | SSE `/api/events/stream` |
| Prediction | — | Threat cones + what-if morph |
| Demo | Sparse sample feed | Full campaign + bible node labels |

## Module map (new)

```
packages/
  continuum/src/
    holographic-map.js   # 3D scene model, omega demo, leaderboard, phylogeny
    predictive.js        # next-TTP cones, morph what-if
  genome/src/
    nsga2.js             # multi-objective evolution
  hub-api/src/
    sse.js               # EventSource bus
    demo-campaign.js     # synthetic attack timeline
    server.js            # + omega routes
  hub-ui/public/
    index.html           # cockpit shell
    assets/ui.css        # visual bible
    assets/app.js        # orchestrator
    assets/holo-map.js   # Three.js map
    assets/ghost-voice.js
docs/
  OMEGA-v2.md
  MIGRATION-v2.md
  UPGRADE-PLAN-v2.md
test/
  omega-v2.js
```

## Constraints honored

- Local-first, loopback hub, token on mutating POSTs  
- Defensive-only copy and gates  
- Core engine still zero npm deps  
- UI CDN deps documented with fallbacks (`VENDOR.md`)  
- Extensible planes registry unchanged  

## Follow-ons (optional future spikes)

- Vendored Three.js offline package + optional Unreal Bloom postprocessing pass  
- Video export of timeline sessions  
- Hardware-backed seal signing (WebAuthn / TPM)  
- Tauri WebGL native window polish  
- Full HTML sealed replay bundles with embedded Three.js  
