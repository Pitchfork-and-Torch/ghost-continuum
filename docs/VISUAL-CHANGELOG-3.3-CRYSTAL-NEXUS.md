# Visual Changelog - 3.3 Crystal Nexus

**Codename:** Crystal Nexus 
**Family:** Luminous Membrane / Crystal Bento 
**Date:** 2026-08-01
**Ship:** v3.3.7

## Intent

Make Command Nexus calmer and more hierarchical: primary view tabs, proportionally smaller fabric map with expand, native Ghost LAN Sentinel (no second window), membrane 3D palette.

## Changes

| Area | Change |
|------|--------|
| Layout | Tab shell: Overview · Ghost LAN · Genome · Forensics · Home Shield |
| Map size | Default ~40-50% viewport height; EXPAND for full focus |
| 3D map | Membrane teal/pearl state colors, soft dust field, morph-reactive lighting |
| Ghost LAN | Native panel via hub `/api/ghost-lan` proxy; Morph Persona + live telemetry |
| Forensics | Time machine + Merkle + seal ops on dedicated tab |
| Home | Wizard / settings / devices / hygiene entry surface |

## Preserve

- All prior IDs and API bindings on Overview
- Zero core npm deps; Three.js CDN + canvas fallback
- Defensive-only · local-first
