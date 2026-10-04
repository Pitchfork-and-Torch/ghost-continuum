# Visual changelog - Ghost Continuum 3.1 Luminous Membrane

**Date:** 2026-08-01  
**Scope:** Public site (`ghost.jonbailey.xyz`) + local Command Nexus (`packages/hub-ui`) + hub static preview

## Art direction

| Before (OMEGA ASCENDANT) | After (Luminous Membrane) |
|--------------------------|---------------------------|
| Neon cyan / magenta / void black | Soft teal, pearl, warm charcoal with indigo-teal undertone |
| Orbitron + Rajdhani / IBM Plex | Clash Display + Satoshi (self-hosted Fontshare) |
| CRT scanlines + hard neon HUD | No scanlines; soft membrane ambient + crystal edges |
| Dense war-room chrome | Museum whitespace, progressive disclosure |
| Aggressive threat reds | Restrained rose / amber semantics |

## Surfaces redesigned

1. **Public landing** - full CSS design system rewrite (`landing/css/ascend.css`)
2. **Hero** - calm gradient display type, membrane stage chrome, softer lifecycle labels
3. **Planes explorer** - crystalline card hover/lift, breathing nexus core
4. **Threat lifecycle demo** - palette remap; same client-side campaign
5. **Home Shield cards** - soft top membrane bar, lift microinteraction
6. **Efficacy gauges** - soft teal living arcs
7. **Quickstart / FAQ / footer** - new tokens, focus rings, motion language
8. **Hub preview** (`/hub/`) - rebranded static preview page
9. **Command Nexus UI** - tokens, fonts, scanlines removed, title/chrome softened, operator glitch toned down
10. **JS demos / holo / operator rain** - palette remap to membrane teal system

## Design system

Documented in `docs/DESIGN-SYSTEM-LUMINOUS-MEMBRANE.md`.

Tokens: primitive + semantic + legacy aliases so existing markup keeps working.

Motion: `--motion-dur-*` + spring-ish hover/press; full `prefers-reduced-motion`.

Type: `/fonts/fontshare/fonts.css` (deployed with site).

## Preserved 100%

- Defensive-only philosophy and messaging
- All features (Home Shield, planes, genome, lifecycle, Merkle, local Nexus)
- Zero core npm deps for engine
- Local-first loopback hub
- Client-side synthetic demos

## Deploy notes

- Cache bust: `ascend.css?v=3.1.0`, share-card `?v=share6`
- `deploy-site.ps1` copies `landing/fonts` into site-public
- Local hub: `npm start` -> `http://127.0.0.1:30000`
