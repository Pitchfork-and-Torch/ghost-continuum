#!/usr/bin/env bash
# Portable (Linux/macOS) build + deploy for ghost.jonbailey.xyz.
# Mirrors deploy/jonbailey/scripts/deploy-site.ps1 so the public site can be
# published from non-Windows hosts (Cloud agents, CI, macOS).
#
# Usage:
#   bash scripts/deploy-site.sh              # build the site tree, then deploy if creds are present
#   bash scripts/deploy-site.sh --build-only # only assemble deploy/jonbailey/site-public (no deploy)
#
# Deploy step requires Cloudflare credentials in the environment:
#   CLOUDFLARE_API_TOKEN   (Pages:Edit on the account that owns the project)
#   CLOUDFLARE_ACCOUNT_ID  (optional if the token maps to a single account)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="$ROOT/deploy/jonbailey/site-public"
L="$ROOT/landing"
SEO="$ROOT/deploy/jonbailey/site-seo"
HUBP="$ROOT/deploy/jonbailey/hub-preview"
PROJECT="ghost-continuum"

BUILD_ONLY=0
[ "${1:-}" = "--build-only" ] && BUILD_ONLY=1

if [ ! -f "$L/index.html" ]; then
  echo "Missing landing index: $L/index.html" >&2
  exit 1
fi

echo "Assembling site tree at $SITE ..."
rm -rf "$SITE"
mkdir -p "$SITE/hub" "$SITE/css" "$SITE/js"

cp "$L/index.html" "$SITE/index.html"
[ -d "$L/fonts" ] && { mkdir -p "$SITE/fonts"; cp -r "$L/fonts/." "$SITE/fonts/"; }
[ -d "$L/css" ] && cp -r "$L/css/." "$SITE/css/"
[ -d "$L/js" ] && cp -r "$L/js/." "$SITE/js/"

# SEO files: landing is source of truth, fall back to site-seo.
for f in llms.txt robots.txt sitemap.xml; do
  if [ -f "$L/$f" ]; then cp "$L/$f" "$SITE/$f";
  elif [ -f "$SEO/$f" ]; then cp "$SEO/$f" "$SITE/$f"; fi
done

[ -d "$L/.well-known" ] && { mkdir -p "$SITE/.well-known"; cp -r "$L/.well-known/." "$SITE/.well-known/"; }
[ -f "$SEO/_headers" ] && cp "$SEO/_headers" "$SITE/_headers"
if [ -f "$L/_redirects" ]; then cp "$L/_redirects" "$SITE/_redirects";
elif [ -f "$SEO/_redirects" ]; then cp "$SEO/_redirects" "$SITE/_redirects"; fi

# IndexNow key files (any landing *.txt that isn't llms/robots).
for t in "$L"/*.txt; do
  [ -e "$t" ] || continue
  b="$(basename "$t")"
  [ "$b" = "llms.txt" ] || [ "$b" = "robots.txt" ] || cp "$t" "$SITE/$b"
done

cp "$ROOT/assets/ghost-continuum-logo.png" "$SITE/logo.png"
cp "$ROOT/assets/ghost-continuum-logo.png" "$SITE/hub/logo.png"
cp "$HUBP/index.html" "$SITE/hub/index.html"
[ -f "$ROOT/docs/screenshots/command-nexus.png" ] && cp "$ROOT/docs/screenshots/command-nexus.png" "$SITE/hub/command-nexus.png"
[ -f "$L/infographic.svg" ] && cp "$L/infographic.svg" "$SITE/infographic.svg"

for og in og-card.png og-card.jpg og-card-v3.png og-card-v3.jpg share-card.png share-card.jpg; do
  [ -f "$L/$og" ] && cp "$L/$og" "$SITE/$og"
done

if [ -f "$L/projects-panel.js" ]; then
  cp "$L/projects-panel.js" "$SITE/projects-panel.js"
  cp "$L/projects-panel.js" "$SITE/hub/projects-panel.js"
fi

echo "Site tree ready ($(find "$SITE" -type f | wc -l | tr -d ' ') files)."

if [ "$BUILD_ONLY" = "1" ]; then
  echo "Build-only mode: skipping deploy."
  exit 0
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "CLOUDFLARE_API_TOKEN not set - built the tree but skipping deploy." >&2
  echo "Set CLOUDFLARE_API_TOKEN (and optionally CLOUDFLARE_ACCOUNT_ID), then re-run." >&2
  exit 0
fi

echo "Deploying $PROJECT from $SITE ..."
npx --yes wrangler pages deploy "$SITE" --project-name "$PROJECT" --branch main --commit-dirty=true
echo "Done. Ensure the custom domain ghost.jonbailey.xyz is attached in Cloudflare Pages."
