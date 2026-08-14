# Agent notes (Ghost Continuum)

Public MIT product. Defensive only. Local-first. Zero npm dependencies in the core engine.

## Before edits

1. Desk-check then claim this tree. Stop if occupied.
2. Do not inject into a live TUI. Do not print secrets. ASCII preferred.

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

Public `main` is one product-summary commit. Secret-scan before push.
Latest GitHub Release only. Do not wait for approval on low-risk lockstep or test work.
