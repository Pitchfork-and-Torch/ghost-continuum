# Ghost Continuum Audit v1.0.2

## Fixed in this release

| Priority | Issue | Fix |
|----------|-------|-----|
| P0 | Edge Worker consumed upstream body twice — HTML injection broken | Single read + inject in `packages/edge/worker.js` |
| P0 | Wrong Content-Length on injected HTML | New Response with fresh headers |
| P1 | Static asset path traversal | `safeUiPath()` in hub-api |
| P1 | Incident export path traversal | Label sanitization + bundle key guard |
| P1 | Unbounded POST bodies | 1 MB cap in `readBody()` |
| P1 | Upstream credential forwarding | Allowlisted headers only on Edge |
| P1 | `/api/legal` crash when missing | existsSync guard |
| P2 | Efficacy maximizer stuck morph on aggressive | Restore `prevMorph` after run |
| P2 | Replay play timer leak | `clearInterval` in `drawReplay()` |
| P2 | Map poll triggered full `buildStatus` | Lightweight `/api/continuum/map-data` cache |
| P3 | Feed XSS via innerHTML | `escapeHtml()` on event fields |
| P5 | CI skipped tests | Full `npm test` in workflow |
| P5 | `.gitignore` gaps | wrangler, coverage, artifacts |

## Deployment added

- `deploy/jonbailey/` — Edge + Hub gateway Wrangler configs
- `docs/DEPLOY-JONBAILEY.md` — step-by-step jonbailey.xyz guide
- Optional `hubToken` / `GC_HUB_TOKEN` for mutating API auth via Tunnel

## Remaining (manual / future)

- Cloudflare Access policy on `ghost.jonbailey.xyz`
- KV namespace ID in production `wrangler.toml`
- Durable Object rate limiting on Edge (optional)
- ~~Full `apiFetch()` token wrapper in UI settings panel~~ → `apiFetch()` + Settings hub token field (v1.0.2 final)
- `plane-toggles` test isolation via `GHOST_CONTINUUM_HOME` env
- Narrative/phantom disarm on plane toggle off