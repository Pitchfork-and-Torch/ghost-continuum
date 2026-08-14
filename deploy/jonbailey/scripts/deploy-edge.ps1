# Deploy Ghost Continuum Edge Worker for jonbailey.xyz
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location (Join-Path $Root "deploy\jonbailey\edge")
Write-Host "Deploying Edge Worker from $(Get-Location)..."
& (Join-Path $Root "node_modules\.bin\wrangler.cmd") deploy
Write-Host "Done. Attach routes jonbailey.xyz/* and www.jonbailey.xyz/* in Cloudflare dashboard."