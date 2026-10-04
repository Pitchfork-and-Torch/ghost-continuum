# Start local Ghost Continuum hub + Cloudflare Tunnel for jonbailey.xyz production
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$Token = (Get-Content "$env:USERPROFILE\.ghost-continuum\config.json" -Raw | ConvertFrom-Json).hubToken
if (-not $Token) { Write-Error "Set hubToken in ~/.ghost-continuum/config.json" }

$env:GC_HUB_TOKEN = $Token
$env:GC_NO_BROWSER = "1"

Write-Host "Starting hub from $Root ..."
Start-Process -FilePath "node" -ArgumentList "bin/start-stack.js" -WorkingDirectory $Root -WindowStyle Minimized

Start-Sleep -Seconds 4
Write-Host "Starting Cloudflare tunnel..."
Start-Process -FilePath "powershell" -ArgumentList "-ExecutionPolicy Bypass -File `"$PSScriptRoot\start-tunnel.ps1`"" -WindowStyle Minimized

Write-Host "Production stack starting."
Write-Host "  Edge:     https://jonbailey.xyz/.__dm/status"
Write-Host "  Hub:      https://ghost.jonbailey.xyz"