# Build and deploy the public landing to Pages project ghost-continuum, including a static hub preview.
# The live dashboard is served by the local hub behind the gateway, not by this Pages project.
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


# Fontshare self-hosted kit (Luminous Membrane type)
$landingFonts = Join-Path $LandingDir "fonts"
if (Test-Path $landingFonts) {
  $fontsOut = Join-Path $Site "fonts"
  New-Item -ItemType Directory -Path $fontsOut -Force | Out-Null
  Copy-Item (Join-Path $landingFonts "*") $fontsOut -Recurse -Force
}
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

# IndexNow /.well-known from landing, then site-seo well-known (security.txt).
$wkOut = Join-Path $Site ".well-known"
$landingWellKnown = Join-Path $LandingDir ".well-known"
$seoWellKnown = Join-Path $seo ".well-known"
if ((Test-Path $landingWellKnown) -or (Test-Path $seoWellKnown)) {
  New-Item -ItemType Directory -Path $wkOut -Force | Out-Null
}
if (Test-Path $landingWellKnown) {
  Copy-Item (Join-Path $landingWellKnown "*") $wkOut -Force -ErrorAction SilentlyContinue
}
if (Test-Path $seoWellKnown) {
  Copy-Item (Join-Path $seoWellKnown "*") $wkOut -Force
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
# Apple touch + PWA icons live in landing/. Without this copy, the next Pages
# deploy drops /apple-touch-icon.png (and 192/512) that index.html links.
foreach ($icon in @("apple-touch-icon.png", "icon-192.png", "icon-512.png")) {
  $iconPath = Join-Path $LandingDir $icon
  if (Test-Path $iconPath) {
    Copy-Item $iconPath (Join-Path $Site $icon) -Force
  }
}
# Extensionless /VERSION must be a real file. Pages would otherwise SPA-fallback to HTML.
$versionFile = Join-Path $LandingDir "VERSION"
if (Test-Path $versionFile) {
  Copy-Item $versionFile (Join-Path $Site "VERSION") -Force
}
# A top-level 404.html turns off Pages SPA fallback (unknown paths were index.html / 200).
$notFound = Join-Path $LandingDir "404.html"
if (-not (Test-Path $notFound)) {
  throw "Missing landing/404.html. Without it, Pages serves index.html for unknown paths."
}
Copy-Item $notFound (Join-Path $Site "404.html") -Force
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
