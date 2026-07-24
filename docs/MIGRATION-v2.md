# Migration guide: Ghost Continuum v1.x → v2.0 OMEGA IMMUNE

## What stays the same

- **Loopback hub** on `127.0.0.1:30000` (token-protected mutating routes)
- **Zero npm runtime deps** for the core engine
- **Config path** `~/.ghost-continuum/config.json` and `~/.ghost-lan/`
- **Existing APIs** (`/api/status`, `/api/genome/*`, `/api/continuum/*`, STIX/TAXII, incident export)
- **Defensive-only** posture and allowlisted scopes

## What changes

| Area | v1.x | v2.0 |
|------|------|------|
| Command Nexus UI | Multi-panel canvas map | Full **holographic 3D cockpit** (Three.js CDN + canvas fallback) |
| Evolution | Single-objective GA | **NSGA-II multi-objective** default (`algorithm: 'nsga2'`) |
| Live push | Poll only | **SSE** at `/api/events/stream` + poll |
| Map API | `/api/continuum/map-data` | Still works; prefer **`/api/continuum/holo-map`** |
| Morphs | Label switch | Visual language + SSE morph events |
| Demo | Static sample feed | **`POST /api/demo/campaign`** full attack timeline |

## Upgrade steps

```bash
git pull   # or re-clone
cd ghost-continuum
# no npm install required for core
npm start
# open http://127.0.0.1:30000
```

1. **Config** — optional new keys under `continuum`:

```json
{
  "continuum": {
    "morph": "research",
    "evolution": {
      "algorithm": "nsga2",
      "populationSize": 10
    }
  }
}
```

If omitted, v2 defaults apply (NSGA-II on evolve, research morph).

2. **UI cache** — hard-refresh the hub (`Ctrl+Shift+R`) so `app.js` / `holo-map.js` / `ui.css` reload.

3. **Classic evolution** — still available:

```http
POST /api/genome/evolve
{ "classic": true }
```

or `{ "algorithm": "classic" }`.

4. **Three.js** — loaded from jsDelivr CDN for the 3D map. Air-gapped: map falls back to **canvas 2D** automatically. To vendor offline later, place `three.module.js` under `packages/hub-ui/public/vendor/` and adjust the importmap in `index.html`.

## New endpoints (v2)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/events/stream` | SSE live bus |
| GET | `/api/continuum/holo-map` | 3D holographic scene graph |
| GET | `/api/continuum/predict` | Threat cones / next-TTP |
| POST | `/api/continuum/what-if` | Morph what-if simulation |
| GET | `/api/continuum/timeline-markers` | Forensic scrubber markers |
| GET | `/api/continuum/genome/leaderboard` | Chad hall of fame + phylogeny + landscape |
| GET | `/api/omega/status` | Compact cockpit payload |
| POST/GET | `/api/demo/campaign` | Inject / read demo attack campaign |

## Breaking changes

- **None** for CLI, config schema, or sealed ledger format.
- Public hub preview HTML (Cloudflare Pages) may still show a static screenshot until re-deployed with the new `hub-ui`.

## Rollback

```bash
git checkout v1.0.2   # or previous tag
npm start
```

Genome pool files remain compatible. Pareto metadata on genomes is additive.

## First 5 minutes (v2 cockpit)

1. `npm start` → open Command Nexus  
2. Click **DEMO** to inject a full holographic campaign  
3. Orbit the map (drag), zoom (wheel), double-click a node  
4. Switch **AGGRESSIVE** morph — watch the fabric recolor  
5. Scrub the **Forensic Time Machine** — ghost past states  
6. Ask Ghost: *show me last 24h scanners* (type or voice)  
7. **EVOLVE POOL** — NSGA-II breeds the next Chad  
8. **SEAL INCIDENT** — Merkle-backed export  

Welcome to Omega Immune.
