# Build and deploy ghost.jonbailey.xyz — landing (v3 OMEGA ASCENDANT) + Command Nexus hub UI
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$Site = Join-Path $Root "deploy\jonbailey\site-public"
$LandingDir = Join-Path $Root "landing"
$Landing = Join-Path $LandingDir "index.html"
$HubPreview = Join-Path $Root "deploy\jonbailey\hub-preview"
$Screenshot = Join-Path $Root "docs\screenshots\command-nexus.png"
$Logo = Join-Path $Root "assets\ghost-continuum-logo.png"

if (-not (Test-Path $Landing)) {
  throw "Missing landing index: $Landing"
}

if (Test-Path $Site) { Remove-Item $Site -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $Site "hub") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Site "css") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Site "js") -Force | Out-Null

# Core landing HTML
Copy-Item $Landing (Join-Path $Site "index.html") -Force

# Modular CSS / JS (v3 cinematic site)
$landingCss = Join-Path $LandingDir "css"
$landingJs = Join-Path $LandingDir "js"
if (Test-Path $landingCss) {
  Copy-Item (Join-Path $landingCss "*") (Join-Path $Site "css") -Recurse -Force
}
if (Test-Path $landingJs) {
  Copy-Item (Join-Path $landingJs "*") (Join-Path $Site "js") -Recurse -Force
}

# SEO: prefer landing copies when present, else site-seo fallback
$seo = Join-Path $Root "deploy\jonbailey\site-seo"
function Copy-SeoFile([string]$Name) {
  $fromLanding = Join-Path $LandingDir $Name
  $fromSeo = Join-Path $seo $Name
  if (Test-Path $fromLanding) {
    Copy-Item $fromLanding (Join-Path $Site $Name) -Force
  } elseif (Test-Path $fromSeo) {
    Copy-Item $fromSeo (Join-Path $Site $Name) -Force
  }
}
Copy-SeoFile "llms.txt"
Copy-SeoFile "robots.txt"
Copy-SeoFile "sitemap.xml"

# Prefer freshest landing robots/sitemap/llms when both exist (landing is source of truth post-v3)
foreach ($seoName in @("llms.txt", "robots.txt", "sitemap.xml")) {
  $fromLanding = Join-Path $LandingDir $seoName
  if (Test-Path $fromLanding) {
    Copy-Item $fromLanding (Join-Path $Site $seoName) -Force
  }
}

# IndexNow /.well-known alternate (Bing/IndexNow)
$wellKnown = Join-Path $LandingDir ".well-known"
if (Test-Path $wellKnown) {
  $wkOut = Join-Path $Site ".well-known"
  New-Item -ItemType Directory -Path $wkOut -Force | Out-Null
  Copy-Item (Join-Path $wellKnown "*") $wkOut -Force -ErrorAction SilentlyContinue
}

# Headers always from site-seo (CSP / cache)
if (Test-Path (Join-Path $seo "_headers")) {
  Copy-Item (Join-Path $seo "_headers") (Join-Path $Site "_headers") -Force
}

$landingRedirects = Join-Path $LandingDir "_redirects"
if (Test-Path $landingRedirects) {
  Copy-Item $landingRedirects (Join-Path $Site "_redirects") -Force
} elseif (Test-Path (Join-Path $seo "_redirects")) {
  Copy-Item (Join-Path $seo "_redirects") (Join-Path $Site "_redirects") -Force
}

# IndexNow key files (if present)
Get-ChildItem -Path $LandingDir -Filter "*.txt" -File | ForEach-Object {
  if ($_.Name -eq "llms.txt" -or $_.Name -eq "robots.txt") { return }
  Copy-Item $_.FullName (Join-Path $Site $_.Name) -Force
}

Copy-Item $Logo (Join-Path $Site "logo.png") -Force
Copy-Item $Logo (Join-Path $Site "hub\logo.png") -Force
Copy-Item (Join-Path $HubPreview "index.html") (Join-Path $Site "hub\index.html") -Force
if (Test-Path $Screenshot) {
  Copy-Item $Screenshot (Join-Path $Site "hub\command-nexus.png") -Force
}
$infographic = Join-Path $LandingDir "infographic.svg"
if (Test-Path $infographic) {
  Copy-Item $infographic (Join-Path $Site "infographic.svg") -Force
}
# Open Graph / Twitter share cards (PNG preferred; X does not preview SVG reliably)
foreach ($og in @("og-card.png", "og-card.jpg", "og-card-v3.png", "og-card-v3.jpg", "share-card.png", "share-card.jpg")) {
  $ogPath = Join-Path $LandingDir $og
  if (Test-Path $ogPath) {
    Copy-Item $ogPath (Join-Path $Site $og) -Force
  }
}
$panel = Join-Path $LandingDir "projects-panel.js"
if (Test-Path $panel) {
  Copy-Item $panel (Join-Path $Site "projects-panel.js") -Force
  Copy-Item $panel (Join-Path $Site "hub\projects-panel.js") -Force
}

Write-Host "Site tree ready at $Site"
Get-ChildItem $Site -Recurse -File | Select-Object -ExpandProperty FullName | ForEach-Object {
  Write-Host "  $_"
}

Write-Host "Deploying ghost.jonbailey.xyz site from $Site ..."
cmd /c "npx --yes wrangler pages deploy `"$Site`" --project-name ghost-continuum --branch main --commit-dirty=true"
Write-Host "Done. Attach custom domain ghost.jonbailey.xyz in Pages if not already set."
