# Luminous Membrane 2.0 polish changelog

**Date:** 2026-08-01  
**Surface:** Public landing only (`landing/`)  
**Constraint:** No product claim changes; presentation + interaction only

## Visual

- Richer multi-layer void atmosphere (teal / aurora / success orbs)
- Multi-layer glass with rim light + holographic sheen (`polish-2.css`)
- Sticky nav evolves on scroll (deeper blur, shadow, border)
- Top scroll progress bar (membrane gradient)
- Version codename living pulse on hero
- Hero stage deeper volumetric vignette

## Interaction

- Section scroll-spy active nav links
- Mobile hamburger drawer + bottom dock CTAs
- Magnetic primary button pointer tracking
- IntersectionObserver staggered section reveals
- Plane detail soft crossfade on selection
- Lifecycle step scale pulse when active
- Efficacy gauges: ring fill + count-up numbers
- Install copy: success state + toast
- FAQ open state elevation
- Optional ambient membrane hum (off by default)
- Konami code toggles elegant terminal mode

## A11y / motion

- Full `prefers-reduced-motion` paths (reveals static, ambient hidden, no magnetic)
- High-contrast glass strengthening
- Focus rings unchanged (theme-matched from design system)
- Keyboard close for mobile nav (Escape)

## Files

| File | Role |
|------|------|
| `landing/css/polish-2.css` | New polish layer |
| `landing/css/ascend.css` | Base tokens (unchanged core) |
| `landing/js/main.js` | Chrome + motion orchestration |
| `landing/js/install.js` | Copy delight |
| `landing/js/planes-explorer.js` | Detail transition |
| `landing/js/metrics.js` | Count-up |
| `landing/js/nexus-demo.js` | Membrane field particles |
| `landing/index.html` | Hooks, mobile dock, ambient, CSS/JS cache-bust 3.1.2 |

## Deploy

```bash
npm run deploy:site
```
