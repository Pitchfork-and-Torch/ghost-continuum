# Deploy Hub API gateway Worker
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location (Join-Path $Root "deploy\jonbailey\hub-gateway")
& (Join-Path $Root "node_modules\.bin\wrangler.cmd") deploy
Write-Host "Set secrets: wrangler secret put HUB_ORIGIN && wrangler secret put HUB_TOKEN"