# Agent notes (Ghost Continuum)

Public MIT product. Defensive only. Local-first. Zero npm dependencies in the core engine.

## Before edits

Do not inject into a live TUI. Do not print secrets. ASCII preferred.

## Version

Single source: `packages/core/src/version.js` (`VERSION`, `CODENAME`).
Node surfaces import it. Static hub-ui / landing / deploy copy is checked by `test/version-lockstep.js`.
Bump procedure: `docs/RELEASING.md`.

## Test

```
npm test
```

## Next leftover

See `NEXT.md`. COOK ticks pick one low-risk item from there.

## Ship

**Always the same turn.** A version bump without a GitHub Release, or a Release without the live site, is not shipped.

1. Lockstep: `packages/core/src/version.js` + every surface in `docs/RELEASING.md`. `npm test` includes `test/version-lockstep.js`.
2. One-commit public `main`, Pitchfork-and-Torch author, secret-scan + em-dash check.
3. GitHub **latest Release only** (`vX.Y.Z` + portable zip). Delete older releases/tags.
4. Deploy the website: `npm run deploy:site` then `npm run deploy:seo`. Live `softwareVersion` on ghost.jonbailey.xyz must match `version.js`.
5. Update `LIVE-SITES.md` + `live-sites-registry.json` `version` / `last_known_update`.

Do not wait for approval on low-risk lockstep or test work.
