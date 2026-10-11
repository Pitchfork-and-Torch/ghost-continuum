#!/usr/bin/env bash
# Portable (Linux/macOS) post-deploy SEO / AEO / IndexNow ping for ghost.jonbailey.xyz.
# Mirrors scripts/post-deploy-seo.ps1 so it can run from non-Windows hosts.
# Run after a public site deploy: npm run deploy:site:unix && npm run deploy:seo:unix
#
# SEO_BASE / SEO_CONTENT_ALIAS / SEO_CARD_URL must be https on the allowlist
# (ghost.jonbailey.xyz or ghost-continuum.pages.dev). Userinfo is rejected.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$ROOT/scripts/lib/seo-safe-url.js"
if [ ! -f "$HELPER" ]; then
  echo "FAIL: missing scripts/lib/seo-safe-url.js" >&2
  exit 1
fi
KEY="7577922ed4d3ec3df303933b78cbd0ee"
UA="Mozilla/5.0 (compatible; ghost-continuum-seo/1.0)"
CURL_SAFE=(--proto "=https" --proto-redir "=https" --max-redirs 2)

seo() { node "$HELPER" "$@"; }

BASE="$(seo origin "${SEO_BASE:-}")" || exit 1
CONTENT_ALIAS="$(seo alias "${SEO_CONTENT_ALIAS:-}")" || exit 1
if [ -n "${SEO_EXPECT_VERSION:-}" ]; then EXPECT_VERSION="$SEO_EXPECT_VERSION"
else EXPECT_VERSION="$(seo version)" || exit 1
fi
if [ -n "${SEO_EXPECT_CODENAME:-}" ]; then CODENAME="$SEO_EXPECT_CODENAME"
else CODENAME="$(seo codename)" || exit 1
fi
CARD="$(seo card "$BASE" "$EXPECT_VERSION" "${SEO_CARD_URL:-}")" || exit 1
ALIAS_CARD="$(seo card "$CONTENT_ALIAS" "$EXPECT_VERSION")" || exit 1

urls_txt="$(seo urls "$BASE")" || exit 1
URLS=()
while IFS= read -r line; do
  [ -n "$line" ] && URLS+=("$line")
done <<EOF
$urls_txt
EOF
if [ "${#URLS[@]}" -lt 8 ]; then
  echo "FAIL: seo-safe-url urls produced too few entries" >&2
  exit 1
fi

fail=0

curl_code() {
  local url="$1"
  local ua="${2:-$UA}"
  curl -s -m 30 -A "$ua" -o /dev/null -w "%{http_code}" "${CURL_SAFE[@]}" -- "$url" || echo "000"
}

echo "=== Live endpoint verification ($BASE) ==="
for u in "${URLS[@]}"; do
  code=$(curl_code "$u")
  printf "  %s  %s\n" "$code" "$u"
  # Cloudflare managed-challenge (403) on the apex is expected for automated
  # clients. 401 / 429 / 404 / 5xx are hard failures (no false green).
  hf="$(seo head-fail "$code")" || exit 1
  if [ "$hf" = "1" ]; then
    fail=$((fail + 1))
  fi
done

echo ""
echo "=== Share card Content-Type (tweet-card gate) ==="
# X / Facebook / browsers must see image/*, not a challenge HTML page.
card_ct() {
  curl -sI -m 30 -A "$1" "${CURL_SAFE[@]}" -- "$2" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print tolower($2); exit}'
}
for ua in "Mozilla/5.0" "Twitterbot/1.0" "facebookexternalhit/1.1"; do
  ct=$(card_ct "$ua" "$CARD")
  ct="${ct%%;*}"
  if [ -z "${SEO_CARD_URL:-}" ]; then
    case "${ct:-}" in
      image/*) ;;
      *)
        ct2=$(card_ct "$ua" "$ALIAS_CARD")
        ct2="${ct2%%;*}"
        case "${ct2:-}" in
          image/*)
            ct="$ct2"
            echo "  (apex card missed; verified via $CONTENT_ALIAS)"
            ;;
        esac
        ;;
    esac
  fi
  printf "  UA=%s  CT=%s\n" "$ua" "${ct:-?}"
  case "${ct:-}" in
    image/*) ;;
    *) echo "  FAIL: share-card.jpg must be image/* for $ua"; fail=$((fail + 1)) ;;
  esac
done

echo ""
echo "=== HTML / version spot-check ==="
html=$(curl -s -m 30 -A "$UA" "${CURL_SAFE[@]}" -- "$BASE/" || true)
# Apex often serves a Cloudflare managed-challenge to automated clients.
# Fall back to the Pages production alias (same deployment) for content.
# This is a warning, not a content miss: custom-domain interstitial can remain.
if [ -z "$html" ] || printf '%s' "$html" | grep -qiE "just a moment|cf-mitigated|cf_chl|challenge-platform" || ! printf '%s' "$html" | grep -qF "$CODENAME"; then
  html=$(curl -s -m 30 -A "$UA" "${CURL_SAFE[@]}" -- "$CONTENT_ALIAS/" || true)
  echo "  WARN: apex HTML was empty/challenge; verified content via $CONTENT_ALIAS (custom domain may still be challenged)"
fi
ver_re="$(printf '%s' "$EXPECT_VERSION" | sed 's/\./\\./g')"
check() { # <label> <regex>
  if printf '%s' "$html" | grep -Eq "$2"; then echo "  OK  $1"; else echo "  MISS  $1"; fail=$((fail + 1)); fi
}
check "og:image share-card.jpg" 'share-card\.jpg'
check "twitter:card large" 'twitter:card" content="summary_large_image"'
check "softwareVersion $EXPECT_VERSION" "\"softwareVersion\": *\"$ver_re\""
check "$CODENAME" "$(printf '%s' "$CODENAME" | sed 's/[][(){}.^$*+?|\\]/\\&/g')"
check "llms.txt link" "llms\.txt"
check "canonical" "rel=\"canonical\""

echo ""
echo "=== Live js/main.js dataset.version ==="
js=$(curl -s -m 30 -A "$UA" "${CURL_SAFE[@]}" -- "$BASE/js/main.js" || true)
if ! printf '%s' "$js" | grep -qF "dataset.version"; then
  js=$(curl -s -m 30 -A "$UA" "${CURL_SAFE[@]}" -- "$CONTENT_ALIAS/js/main.js" || true)
  echo "  (apex js missed; verified via $CONTENT_ALIAS/js/main.js)"
fi
if printf '%s' "$js" | grep -qF "dataset.version = '${EXPECT_VERSION}'"; then
  echo "  OK  dataset.version ${EXPECT_VERSION}"
else
  echo "  MISS  dataset.version ${EXPECT_VERSION}"
  fail=$((fail + 1))
fi

echo ""
echo "=== GitHub latest release lockstep ==="
if command -v gh >/dev/null 2>&1; then
  latestTag="$(gh api repos/Pitchfork-and-Torch/ghost-continuum/releases/latest --jq .tag_name || true)"
  echo "  GitHub latest = ${latestTag:-?}  (want v${EXPECT_VERSION})"
  if [ "$latestTag" != "v${EXPECT_VERSION}" ]; then
    echo "  FAIL: GitHub /releases/latest must be v${EXPECT_VERSION}"
    fail=$((fail + 1))
  else
    echo "  OK  GitHub latest matches version.js"
  fi
else
  echo "  skip (gh not on PATH)"
fi

echo ""
echo "=== IndexNow submit ==="
payload="$(seo indexnow "$BASE" "$KEY" -- "${URLS[@]}")" || exit 1
for ep in "https://api.indexnow.org/indexnow" "https://www.bing.com/indexnow"; do
  code=$(curl -s -m 45 -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json; charset=utf-8" --data "$payload" \
    "${CURL_SAFE[@]}" -- "$ep" || echo "000")
  # IndexNow returns 200 or 202 on success.
  case "$code" in
    200|202) echo "  $ep  ->  $code (ok)" ;;
    *) echo "  $ep  ->  $code (warn)"; fail=$((fail + 1)) ;;
  esac
done

echo ""
if [ "$fail" -gt 0 ]; then
  echo "Completed with $fail warning(s)."
  exit 1
fi
echo "SEO/AEO post-deploy checks passed."
exit 0
