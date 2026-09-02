# Post-deploy SEO / AEO / IndexNow for Ghost Continuum (ghost.jonbailey.xyz)
# Run after every major public site deploy: npm run deploy:site; then this script.
# Always: live softwareVersion + GitHub /releases/latest must match version.js.
#
# SEO_BASE / SEO_CONTENT_ALIAS / SEO_CARD_URL must be https on the allowlist
# (ghost.jonbailey.xyz or ghost-continuum.pages.dev). Userinfo is rejected.
$ErrorActionPreference = "Continue"
$Helper = Join-Path $PSScriptRoot "lib\seo-safe-url.js"
$Key = "7577922ed4d3ec3df303933b78cbd0ee"
$Ua = "Mozilla/5.0 (compatible; ghost-continuum-seo/1.0)"
$CurlSafe = @("--proto", "=https", "--proto-redir", "=https", "--max-redirs", "2")

function Invoke-SeoSafe {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)
  $out = & node $Helper @CliArgs 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host ("FAIL: seo-safe-url {0}: {1}" -f ($CliArgs -join ' '), $out) -ForegroundColor Red
    exit 1
  }
  if ($null -eq $out) { return "" }
  if ($out -is [array]) { return (($out | ForEach-Object { "$_" }) -join "`n") }
  return [string]$out
}

if (-not (Test-Path $Helper)) {
  Write-Host "FAIL: missing scripts/lib/seo-safe-url.js" -ForegroundColor Red
  exit 1
}

$Base = (Invoke-SeoSafe origin $(if ($env:SEO_BASE) { $env:SEO_BASE } else { "" })).Trim()
$ContentAlias = (Invoke-SeoSafe alias $(if ($env:SEO_CONTENT_ALIAS) { $env:SEO_CONTENT_ALIAS } else { "" })).Trim()
$Version = if ($env:SEO_EXPECT_VERSION) { $env:SEO_EXPECT_VERSION.Trim() } else { (Invoke-SeoSafe version).Trim() }
$Codename = if ($env:SEO_EXPECT_CODENAME) { $env:SEO_EXPECT_CODENAME.Trim() } else { (Invoke-SeoSafe codename).Trim() }
if (-not $Version) {
  Write-Host "FAIL: could not read VERSION" -ForegroundColor Red
  exit 1
}
$CardUrl = (Invoke-SeoSafe card $Base $Version $(if ($env:SEO_CARD_URL) { $env:SEO_CARD_URL } else { "" })).Trim()
$AliasCard = (Invoke-SeoSafe card $ContentAlias $Version).Trim()
$Urls = @((Invoke-SeoSafe urls $Base) -split "[\r\n]+" | Where-Object { $_ })
if ($Urls.Count -lt 8) {
  Write-Host "FAIL: seo-safe-url urls produced too few entries" -ForegroundColor Red
  exit 1
}

function Get-CurlCode {
  param([string]$Url, [string]$Agent = $Ua)
  $code = & curl.exe -s -m 30 -A $Agent -o NUL -w "%{http_code}" @CurlSafe -- $Url 2>$null
  if (-not $code) { return "000" }
  return [string]$code
}

Write-Host "=== Live endpoint verification ($Base) ===" -ForegroundColor Cyan
$fail = 0
foreach ($u in $Urls) {
  $code = Get-CurlCode $u
  Write-Host ("  {0}  {1}" -f $code, $u)
  # Cloudflare managed-challenge (403) on the apex is expected for automated
  # clients. 401 / 429 / 404 / 5xx are hard failures (no false green).
  $hf = (Invoke-SeoSafe head-fail $code).Trim()
  if ($hf -eq "1") { $fail++ }
}

Write-Host "`n=== Share card Content-Type (critical for X) ===" -ForegroundColor Cyan
function Get-CardContentType {
  param([string]$Agent, [string]$Url)
  $hdr = & curl.exe -sI -m 30 -A $Agent @CurlSafe -- $Url 2>$null | Out-String
  if ($hdr -match '(?im)^Content-Type:\s*(.+)$') { return $Matches[1].Trim() }
  return '?'
}
foreach ($ua in @("Mozilla/5.0", "Twitterbot/1.0", "facebookexternalhit/1.1")) {
  try {
    $ct = Get-CardContentType $ua $CardUrl
    if ($ct -notmatch 'image/' -and -not $env:SEO_CARD_URL) {
      $ct2 = Get-CardContentType $ua $AliasCard
      if ($ct2 -match 'image/') {
        $ct = $ct2
        Write-Host ("  (apex card missed; verified via {0})" -f $ContentAlias)
      }
    }
    Write-Host ("  UA={0}  CT={1}" -f $ua, $ct)
    if ($ct -notmatch 'image/') {
      Write-Host "  FAIL: share-card.jpg must be image/* for $ua" -ForegroundColor Red
      $fail++
    }
  } catch {
    Write-Host "  FAIL $ua : $($_.Exception.Message)" -ForegroundColor Red
    $fail++
  }
}

Write-Host "`n=== HTML meta / AEO spot-check ===" -ForegroundColor Cyan
try {
  $html = & curl.exe -s -m 30 -A $Ua @CurlSafe -- "$Base/" 2>$null | Out-String
  $challenged = [string]::IsNullOrWhiteSpace($html) -or
    $html -match '(?i)just a moment|cf-mitigated|cf_chl|challenge-platform' -or
    $html -notmatch [regex]::Escape($Codename)
  if ($challenged) {
    $html = & curl.exe -s -m 30 -A $Ua @CurlSafe -- "$ContentAlias/" 2>$null | Out-String
    Write-Host ("  WARN: apex HTML was empty/challenge; verified content via {0} (custom domain may still be challenged)" -f $ContentAlias)
  }
  $checks = @(
    @{ n = "og:image share-card.jpg"; p = 'share-card.jpg' },
    @{ n = "twitter:card large"; p = 'twitter:card" content="summary_large_image"' },
    @{ n = "softwareVersion $Version"; p = $Version },
    @{ n = $Codename; p = $Codename },
    @{ n = "llms.txt link"; p = 'llms.txt' },
    @{ n = "canonical"; p = 'rel="canonical"' }
  )
  foreach ($c in $checks) {
    if ($html -match [regex]::Escape($c.p) -or $html.Contains($c.p)) {
      Write-Host ("  OK  {0}" -f $c.n) -ForegroundColor Green
    } else {
      Write-Host ("  MISS  {0}" -f $c.n) -ForegroundColor Yellow
      $fail++
    }
  }
} catch {
  Write-Host "  FAIL html fetch: $($_.Exception.Message)" -ForegroundColor Red
  $fail++
}

Write-Host "`n=== Live js/main.js dataset.version ===" -ForegroundColor Cyan
try {
  $js = & curl.exe -s -m 30 -A $Ua @CurlSafe -- "$Base/js/main.js" 2>$null | Out-String
  if ($js -notmatch 'dataset\.version') {
    $js = & curl.exe -s -m 30 -A $Ua @CurlSafe -- "$ContentAlias/js/main.js" 2>$null | Out-String
    Write-Host ("  (apex js missed; verified via {0}/js/main.js)" -f $ContentAlias)
  }
  $expect = "dataset.version = '$Version'"
  if ($js.Contains($expect)) {
    Write-Host ("  OK  dataset.version {0}" -f $Version) -ForegroundColor Green
  } else {
    Write-Host ("  MISS  dataset.version {0}" -f $Version) -ForegroundColor Yellow
    $fail++
  }
} catch {
  Write-Host "  FAIL js fetch: $($_.Exception.Message)" -ForegroundColor Red
  $fail++
}

Write-Host "`n=== GitHub latest release lockstep (always) ===" -ForegroundColor Cyan
try {
  $latestTag = gh api repos/Pitchfork-and-Torch/ghost-continuum/releases/latest --jq .tag_name
  Write-Host ("  GitHub latest = {0}  (want v{1})" -f $latestTag, $Version)
  if ($latestTag -ne "v$Version") {
    Write-Host "  FAIL: GitHub /releases/latest must be v$Version" -ForegroundColor Red
    $fail++
  } else {
    Write-Host "  OK  GitHub latest matches version.js" -ForegroundColor Green
  }
} catch {
  Write-Host ("  FAIL GitHub latest: {0}" -f $_.Exception.Message) -ForegroundColor Red
  $fail++
}

Write-Host "`n=== IndexNow submit ===" -ForegroundColor Cyan
$payload = Invoke-SeoSafe indexnow $Base $Key -- @Urls
$payloadFile = Join-Path $env:TEMP "ghost-continuum-indexnow.json"
[System.IO.File]::WriteAllText($payloadFile, $payload, [System.Text.UTF8Encoding]::new($false))
$endpoints = @(
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow"
)
foreach ($ep in $endpoints) {
  $code = & curl.exe -s -m 45 -o NUL -w "%{http_code}" -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary "@$payloadFile" @CurlSafe -- $ep 2>$null
  if (-not $code) { $code = "000" }
  if ($code -eq "200" -or $code -eq "202") {
    Write-Host ("  {0}  ->  {1}" -f $ep, $code) -ForegroundColor Green
  } else {
    Write-Host ("  {0}  ->  {1} (warn)" -f $ep, $code) -ForegroundColor Yellow
    $fail++
  }
}

Write-Host "`n=== Google sitemap ping (legacy) ===" -ForegroundColor Cyan
try {
  $g = Invoke-WebRequest -Uri ("https://www.google.com/ping?sitemap={0}" -f [uri]::EscapeDataString("$Base/sitemap.xml")) -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0
  Write-Host ("  Google ping  {0}" -f $g.StatusCode)
} catch {
  Write-Host ("  Google ping  (optional) {0}" -f $_.Exception.Message) -ForegroundColor DarkGray
}

if ($fail -gt 0) {
  Write-Host "`nCompleted with $fail warning(s)/misses." -ForegroundColor Yellow
  exit 1
}
Write-Host "`nSEO/AEO post-deploy checks passed." -ForegroundColor Green
exit 0
