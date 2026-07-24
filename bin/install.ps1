# Ghost Continuum — Windows install
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "Ghost Continuum install" -ForegroundColor Cyan
Set-Location $Root

node --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Node.js 18+ required" }

node bin/setup.js

node test/verify.js
node test/integration.js
node test/stack.js

Write-Host "`nInstalled. Run: node bin/ghost-continuum.js start" -ForegroundColor Green