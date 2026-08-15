#!/usr/bin/env bash
# Portable (Linux/macOS) post-deploy SEO / AEO / IndexNow ping for ghost.jonbailey.xyz.
# Mirrors scripts/post-deploy-seo.ps1 so it can run from non-Windows hosts.
# Run after a public site deploy: npm run deploy:site:unix && npm run deploy:seo:unix
set -uo pipefail

BASE="${SEO_BASE:-https://ghost.jonbailey.xyz}"
KEY="7577922ed4d3ec3df303933b78cbd0ee"
UA="Mozilla/5.0 (compatible; ghost-continuum-seo/1.0)"
EXPECT_VERSION="${SEO_EXPECT_VERSION:-3.6.0}"

URLS=(
  "$BASE/"
  "$BASE/hub/"
  "$BASE/llms.txt"
  "$BASE/sitemap.xml"
  "$BASE/robots.txt"
  "$BASE/og-card.png"
  "$BASE/og-card.jpg"
  "$BASE/og-card-v3.png"
  "$BASE/og-card-v3.jpg"
  "$BASE/share-card.png"
  "$BASE/share-card.jpg"
  "$BASE/infographic.svg"
  "$BASE/hub/command-nexus.png"
)

fail=0

echo "=== Live endpoint verification ($BASE) ==="
for u in "${URLS[@]}"; do
  code=$(curl -s -m 30 -A "$UA" -o /dev/null -w "%{http_code}" "$u")
  printf "  %s  %s\n" "$code" "$u"
  # A Cloudflare managed-challenge (403 with cf-mitigated) on the apex is expected
  # for automated clients; treat only 5xx / 404 as hard failures.
  case "$code" in
    404|5??) fail=$((fail+1)) ;;
  esac
done

echo ""
echo "=== Share card Content-Type (tweet-card gate) ==="
# X / Facebook / browsers must see image/*, not a challenge HTML page. Gate first
# so a 3.4.0-style HTML-as-image regression cannot be reported as a successful ship.
CARD="${SEO_CARD_URL:-$BASE/share-card.jpg?v=$EXPECT_VERSION}"
for ua in "Mozilla/5.0" "Twitterbot/1.0" "facebookexternalhit/1.1"; do
  ct=$(curl -sI -m 30 -A "$ua" "$CARD" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print tolower($2); exit}')
  ct="${ct%%;*}"
  printf "  UA=%s  CT=%s\n" "$ua" "${ct:-?}"
  case "${ct:-}" in
    image/*) ;;
    *) echo "  FAIL: share-card.jpg must be image/* for $ua"; fail=$((fail+1)) ;;
  esac
done

echo ""
echo "=== HTML / version spot-check ==="
CONTENT_ALIAS="${SEO_CONTENT_ALIAS:-https://ghost-continuum.pages.dev}"
html=$(curl -s -m 30 -A "$UA" "$BASE/" || true)
# The apex serves a Cloudflare managed-challenge page to automated clients, so the
# real HTML is only reachable via a browser. For the content check, fall back to the
# Pages production alias (same deployment, not challenged) whenever the apex response
# is empty, is the challenge interstitial, or lacks the expected release marker.
if [ -z "$html" ] || printf '%s' "$html" | grep -qiE "just a moment|cf-mitigated|cf_chl|challenge-platform" || ! printf '%s' "$html" | grep -qF "Crystal Seal"; then
  html=$(curl -s -m 30 -A "$UA" "$CONTENT_ALIAS/" || true)
  echo "  (apex challenged to bots; verified content via $CONTENT_ALIAS)"
fi
ver_re="$(printf '%s' "$EXPECT_VERSION" | sed 's/\./\\./g')"
check() { # <label> <regex>
  if printf '%s' "$html" | grep -Eq "$2"; then echo "  OK  $1"; else echo "  MISS  $1"; fail=$((fail+1)); fi
}
check "og:image share-card.jpg" 'share-card\.jpg'
check "twitter:card large" 'twitter:card" content="summary_large_image"'
check "softwareVersion $EXPECT_VERSION" "\"softwareVersion\": *\"$ver_re\""
check "Crystal Seal" "Crystal Seal"
check "llms.txt link" "llms\.txt"
check "canonical" "rel=\"canonical\""

echo ""
echo "=== Live js/main.js dataset.version ==="
js=$(curl -s -m 30 -A "$UA" "$BASE/js/main.js" || true)
if ! printf '%s' "$js" | grep -qF "dataset.version"; then
  js=$(curl -s -m 30 -A "$UA" "$CONTENT_ALIAS/js/main.js" || true)
  echo "  (apex js missed; verified via $CONTENT_ALIAS/js/main.js)"
fi
if printf '%s' "$js" | grep -qF "dataset.version = '${EXPECT_VERSION}'"; then
  echo "  OK  dataset.version ${EXPECT_VERSION}"
else
  echo "  MISS  dataset.version ${EXPECT_VERSION}"
  fail=$((fail+1))
fi

echo ""
echo "=== IndexNow submit ==="
# Same URLS as the HEAD checks - do not keep a second path list here.
payload=$(KEY="$KEY" BASE="$BASE" node -e '
const key=process.env.KEY, base=process.env.BASE;
let host="ghost.jonbailey.xyz";
try { host = new URL(base).hostname; } catch { /* keep default */ }
const urls=process.argv.slice(1);
process.stdout.write(JSON.stringify({host,key,keyLocation:`${base}/${key}.txt`,urlList:urls}));
' -- "${URLS[@]}")
for ep in "https://api.indexnow.org/indexnow" "https://www.bing.com/indexnow"; do
  code=$(curl -s -m 45 -o /dev/null -w "%{http_code}" -X POST "$ep" \
    -H "Content-Type: application/json; charset=utf-8" --data "$payload")
  # IndexNow returns 200 or 202 on success.
  case "$code" in
    200|202) echo "  $ep  ->  $code (ok)" ;;
    *) echo "  $ep  ->  $code (warn)"; fail=$((fail+1)) ;;
  esac
done

echo ""
if [ "$fail" -gt 0 ]; then
  echo "Completed with $fail warning(s)."
  exit 1
fi
echo "SEO/AEO post-deploy checks passed."
exit 0
