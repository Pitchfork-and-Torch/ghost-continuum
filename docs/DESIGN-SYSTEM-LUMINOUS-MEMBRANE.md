# Ghost Continuum Design System - Luminous Membrane / Crystal Sentinel

**Version:** 3.4 visual language (Crystal Membrane public craft on Crystal Nexus)  
**Codename:** Luminous Membrane / Crystal Membrane  
**Personality:** Calm, precise, quietly confident, scientific elegance  
**Metaphor:** Living digital immune system as soft adaptive membranes meeting crystalline precision

## Non-negotiables

- Defensive-only · authorized networks · local-first · zero core npm deps for the engine
- Museum-like clarity, purposeful whitespace, restrained color
- Never pure void black, never aggressive neon / glitch / OMEGA war-room HUD
- Distinct from jonbailey.xyz hub, Trench Coat noir, folk/music site, gamey tool UIs
- WCAG 2.2 AA, reduced-motion excellence, 60fps chrome motion

## Color tokens (semantic)

| Token | Role | Dark canvas value (approx) |
|-------|------|----------------------------|
| `--bg-canvas` | Page / app ground | warm deep charcoal with indigo-teal undertone `#0b1018` |
| `--bg-surface` | Cards, panels | elevated frosted `#121a24` / translucent |
| `--bg-elevated` | Modals, popovers | `#182230` |
| `--fg-default` | Primary text | soft pearl `#e8eef4` |
| `--fg-muted` | Secondary | cool slate `#8b9aab` |
| `--accent` | Interactive primary | luminous soft teal `#5ec8c0` |
| `--accent-soft` | Subtle fills | teal at low alpha |
| `--pearl` | Soft highlights | `#d4e4e8` |
| `--success` | Calm living teal-green | `#6bc4a0` |
| `--warning` | Precise amber | `#d4a574` |
| `--danger` | Restrained rose | `#c97884` |
| `--focus-ring` | Keyboard focus | soft teal ring |

Legacy aliases (`--cyan`, `--ok`, `--magenta`, etc.) map into this system so existing markup keeps working.

## Typography

| Role | Face | Notes |
|------|------|-------|
| Display / hero | **Clash Display** | Self-hosted Fontshare |
| UI / body | **Satoshi** | Self-hosted Fontshare |
| Product chrome (optional) | General Sans | Same kit |
| Mono / telemetry | ui-monospace stack | Cascadia / Segoe UI Mono |

Load: `/fonts/fontshare/fonts.css` + type tokens in design CSS.

## Surfaces

- **Membrane glass:** translucent elevated layers, soft blur, hairline borders (not hard neon edges)
- **Crystalline accent:** thin geometric edge highlight on active cards / plane selection
- **Ambient:** soft volumetric radial glows (teal / pearl), no CRT scanlines by default
- **Grain:** optional ultra-subtle noise at very low opacity for material depth

## Motion language

| Token | Value |
|-------|-------|
| `--motion-dur-fast` | 120ms |
| `--motion-dur-base` | 200ms |
| `--motion-dur-slow` | 320ms |
| `--motion-ease-out` | cubic-bezier(0.22, 1, 0.36, 1) |
| `--motion-ease-spring` | cubic-bezier(0.34, 1.45, 0.64, 1) |

Patterns:

- Buttons / cards: soft membrane expand (scale 1.01 - 1.02) + luminous glow; press scale 0.98
- Plane cards: gentle lift + crystalline edge
- Lifecycle stages: sequential soft pulse (cellular, not game HUD)
- Gauges: living arc with subtle breath when active
- Status: quiet breathing pulse
- Loading: membrane shimmer skeleton (not generic spinner)
- Full `prefers-reduced-motion` snap / static beauty

## Components (shared patterns)

- `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-ghost`
- `.glass` membrane panel
- `.chip` capability pills
- `.section` / `.section-label` / `.section-title` / `.section-lead`
- Focus: soft ring using `--focus-ring`
- Empty / error / success: soft color morph + confirmation pulse

## File map

| Surface | Tokens + chrome |
|---------|-----------------|
| Public site | `landing/css/ascend.css`, `landing/fonts/fontshare/` |
| Command Nexus | `packages/hub-ui/public/assets/ui.css`, `packages/hub-ui/public/fonts/fontshare/` |
| Deploy | `deploy/jonbailey/scripts/deploy-site.ps1` copies fonts into site-public |

## Migration from OMEGA ASCENDANT visual language

| Before | After |
|--------|-------|
| Orbitron + Rajdhani + IBM Plex | Clash Display + Satoshi |
| Neon cyan `#00e5ff` / magenta `#e040fb` | Soft teal `#5ec8c0` / pearl / restrained aurora |
| Pure void `#02060f` + scanlines | Warm charcoal canvas, no CRT overlay |
| "OMEGA ASCENDANT" codename chrome | "Luminous Membrane" / product version plain |
| Aggressive red threat glows | Restrained rose / amber semantics |
| Dense HUD clutter | Museum whitespace, progressive disclosure |

## Voice

Measured, protective, clear. Prefer "immune system", "membrane", "guardian", "contain", "seal" over war-room slang. Avoid hype and aggression.


## Crystal Membrane (v3.4)

Public landing craft on the same Luminous Membrane tokens:

- Brand island: X follow pill left of wordmark, divider, nav owns its own zone.
- One primary CTA in the hero; quiet text links for preview / source.
- Motion tokens match `premium-ui-motion` (dur / ease / distance / blur / scale).
- 44px hit targets, skip-link, reduced-motion + reduced-transparency.
- Fleet visitor counter via hits.jonbailey.xyz (`data-site="ghost"`).

## Crystal Bento (v3.2)

Command Nexus layout language on top of Luminous Membrane tokens:

- Primary system: asymmetric CSS Grid bento (hero map center, efficacy/genome/planes left, morph/intel/ops right, full-width Forensic Time Machine + Merkle strip).
- Tiles: .glass-panel / .bento-tile with membrane glass, crystalline edge highlight, soft volumetric teal/pearl glow on hover (scale 1.01-1.02), press 0.98.
- Hierarchy: size and span encode priority.
- Mobile: single-column restack (map first).
- Reduced motion: static crystalline beauty.
