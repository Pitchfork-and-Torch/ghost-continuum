# Releasing Ghost Continuum

A short, repeatable checklist so a version bump, the GitHub Release, and the public
site never drift apart. Born out of a real incident (see **Lessons** below).

## TL;DR

1. Land your code on `main` (via PR).
2. Bump the version everywhere + add a `CHANGELOG.md` entry.
3. Tag `vX.Y.Z` on `main` and push the tag - the Release workflow publishes the GitHub Release automatically.
4. Deploy the public site and ping SEO.

## 1. Version bump (keep these in lockstep)

Bump the version string in **all** of these, or the UI / API / site will disagree:

- `packages/core/src/version.js` (`VERSION`, `CODENAME`) - Node surfaces import this
- `package.json` (`version`, `description`)
- `packages/hub-api/src/server.js` (imports `VERSION` / `CODENAME` for `/api/omega/status` and the live map)
- `packages/continuum/src/nexus.js` (continuum status payload)
- `packages/hub-ui/public/assets/app.js` (`VERSION`)
- `packages/hub-ui/public/index.html` (the `nxVersion` badge + `?v=` cache-busting)
- `packages/hub-ui/public/sw.js` (cache name + cached asset `?v=` - this is what forces returning PWA clients to pick up the new shell)
- `bin/start-stack.js` and `bin/ghost-continuum.js` (banners interpolate `VERSION` / `CODENAME`)
- `landing/index.html`, `landing/js/main.js` (`dataset.version`), `landing/llms.txt`, `deploy/jonbailey/hub-preview/index.html`, `deploy/jonbailey/site-seo/llms.txt` (site copy + `?v=`)
- `landing/sitemap.xml` and `deploy/jonbailey/site-seo/sitemap.xml` (`lastmod` + image title)
- `deploy/jonbailey/PRODUCTION-MANIFEST.json` (`version`, `codename`)

Add a dated `## [X.Y.Z] - YYYY-MM-DD - <codename>` section to `CHANGELOG.md`.

## 2. Cut the GitHub Release (automated)

Releases are published by `.github/workflows/release.yml` on any `vX.Y.Z` tag push. It
extracts the matching `## [X.Y.Z]` section from `CHANGELOG.md` as the release body
(falling back to `release-notes.md`).

```bash
git tag -a vX.Y.Z -m "Ghost Continuum vX.Y.Z <codename>"
git push origin vX.Y.Z
# → workflow publishes https://github.com/Pitchfork-and-Torch/ghost-continuum/releases/tag/vX.Y.Z
```

Tag on `main` after your PR merges so the release reflects shipped code. `/releases/latest`
(used by the site "Release notes" button) then resolves to the new version.

## 3. Publish the public site

From Windows: `npm run deploy:site` then `npm run deploy:seo` (Crystal Seal, Pages fallback, live `dataset.version`).
From Linux / macOS / CI (no PowerShell needed):

```bash
npm run deploy:site:unix   # tweet-card JPEG gate, then build tree + wrangler pages deploy
npm run deploy:seo:unix    # tweet-card Content-Type + live dataset.version + IndexNow
```

`deploy:site:unix` refuses to assemble the tree unless `landing/share-card.jpg` is a JPEG.
`deploy:seo:unix` then fails if Twitterbot / Facebook / Mozilla get a non-`image/*`
Content-Type for `share-card.jpg`, or if live `js/main.js` is not the expected
`dataset.version`.

The custom domain `ghost.jonbailey.xyz` sits behind a Cloudflare managed bot challenge,
so `curl` gets `403` on HTML; verify content against `https://ghost-continuum.pages.dev/`
or in a real browser. Apex `js/main.js` is cached (`s-maxage=604800`). If the Pages
alias is current but the apex still serves an old `dataset.version`, purge that URL
(and `?v=` variants) on the zone — do not wipe `landing/index.html`.

## Lessons (2026-08-14)

What went wrong, and the guardrails now in place:

- **Version bumped, Release not cut.** The site advertised a version whose GitHub Release
  didn't exist, so the "Release notes" button (→ `/releases/latest`) showed the previous
  version. → **Fix:** `release.yml` auto-publishes the Release on tag push; releasing is
  no longer a manual step that can be forgotten.
- **Site published ahead of the release.** Deploying the site before the tag/Release meant
  the live site and GitHub disagreed. → **Fix:** follow the order above (land → bump → tag →
  deploy), and this checklist.
- **Parallel branches diverged and collided on the version number.** Two tracks bumped from
  the same base (one to 3.5.1, one to 3.6.0). → **Fix:** rebase/merge onto the latest `main`
  before versioning; pick the next version relative to `main`, not your branch.
- **Deploy tooling was Windows-only.** `deploy:site` / `deploy:seo` were PowerShell, so the
  site couldn't be published from Cloud/CI. → **Fix:** portable `deploy:site:unix` /
  `deploy:seo:unix` equivalents.
- **Tweet card or apex JS drifted.** A ship can look green while X gets HTML for
  `share-card.jpg`, or while apex `js/main.js` stays on an old `dataset.version` behind
  a week-long CDN cache. → **Fix:** local JPEG gate before assemble; Unix SEO script
  fails on non-`image/*` cards and on a live version miss; purge apex JS if Pages is
  current and the custom domain is not.
