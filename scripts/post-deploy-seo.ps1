# Post-deploy SEO / AEO / IndexNow for Ghost Continuum (ghost.jonbailey.xyz)
# Run after every major public site deploy: npm run deploy:site; then this script.
$ErrorActionPreference = "Continue"
$Base = "https://ghost.jonbailey.xyz"
$Key = "7577922ed4d3ec3df303933b78cbd0ee"
$Urls = @(
  "$Base/",
  "$Base/hub/",
  "$Base/llms.txt",
  "$Base/sitemap.xml",
  "$Base/robots.txt",
  "$Base/og-card.png",
  "$Base/og-card.jpg",
  "$Base/og-card-v3.png",
  "$Base/og-card-v3.jpg",
  "$Base/share-card.png",
  "$Base/share-card.jpg",
  "$Base/infographic.svg",
  "$Base/hub/command-nexus.png"
)

Write-Host "=== Live endpoint verification ===" -ForegroundColor Cyan
$fail = 0
foreach ($u in $Urls) {
  try {
    $r = Invoke-WebRequest -Uri $u -Method Head -UseBasicParsing -TimeoutSec 30
    $ct = $r.Headers["Content-Type"]
    Write-Host ("  {0}  {1}  {2}" -f $r.StatusCode, $u, $ct)
    if ($r.StatusCode -ge 400) { $fail++ }
  } catch {
    Write-Host ("  FAIL  {0}  {1}" -f $u, $_.Exception.Message) -ForegroundColor Red
    $fail++
  }
}

Write-Host "`n=== HTML meta / AEO spot-check ===" -ForegroundColor Cyan
try {
  $html = (Invoke-WebRequest -Uri "$Base/" -UseBasicParsing -TimeoutSec 30).Content
  $checks = @(
    @{ n = "og:image share-card.jpg"; p = 'share-card.jpg' },
    @{ n = "twitter:card large"; p = 'twitter:card" content="summary_large_image"' },
    @{ n = "softwareVersion 3.0"; p = '3.0.0' },
    @{ n = "OMEGA ASCENDANT"; p = 'OMEGA ASCENDANT' },
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

Write-Host "`n=== Share card Content-Type (critical for X) ===" -ForegroundColor Cyan
foreach ($ua in @("Mozilla/5.0", "Twitterbot/1.0", "facebookexternalhit/1.1")) {
  try {
    $tmp = Join-Path $env:TEMP "share-card-check.jpg"
    $hdr = & curl.exe -sI "https://ghost.jonbailey.xyz/share-card.jpg" -A $ua 2>$null | Out-String
    $ct = if ($hdr -match '(?im)^Content-Type:\s*(.+)$') { $Matches[1].Trim() } else { '?' }
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

Write-Host "`n=== IndexNow submit ===" -ForegroundColor Cyan
$body = @{
  host        = "ghost.jonbailey.xyz"
  key         = $Key
  keyLocation = "$Base/$Key.txt"
  urlList     = $Urls
} | ConvertTo-Json -Depth 4

$endpoints = @(
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow"
)
foreach ($ep in $endpoints) {
  try {
    $resp = Invoke-WebRequest -Uri $ep -Method Post -Body $body -ContentType "application/json; charset=utf-8" -UseBasicParsing -TimeoutSec 45
    Write-Host ("  {0}  ->  {1}" -f $ep, $resp.StatusCode) -ForegroundColor Green
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    # IndexNow often returns 202 Accepted
    if ($code -eq 202 -or $code -eq 200) {
      Write-Host ("  {0}  ->  {1}" -f $ep, $code) -ForegroundColor Green
    } else {
      Write-Host ("  {0}  ->  {1} {2}" -f $ep, $code, $_.Exception.Message) -ForegroundColor Yellow
    }
  }
}

Write-Host "`n=== Google sitemap ping (legacy) ===" -ForegroundColor Cyan
try {
  $g = Invoke-WebRequest -Uri ("https://www.google.com/ping?sitemap={0}" -f [uri]::EscapeDataString("$Base/sitemap.xml")) -UseBasicParsing -TimeoutSec 20
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
