# Ghost Continuum — start full stack + Cloudflare tunnel at user logon
$ErrorActionPreference = "SilentlyContinue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Test-HubPort {
  $conn = Get-NetTCPConnection -LocalPort 30000 -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -eq '127.0.0.1' }
  return $null -ne $conn
}

function Test-TunnelRunning {
  return $null -ne (Get-Process -Name cloudflared -ErrorAction SilentlyContinue)
}

if (-not (Test-HubPort)) {
  $env:GC_NO_BROWSER = "1"
  Start-Process -FilePath "node.exe" `
    -ArgumentList "bin/start-stack.js" `
    -WorkingDirectory $Root `
    -WindowStyle Hidden
  Start-Sleep -Seconds 6
}

if (-not (Test-TunnelRunning)) {
  $tunnelScript = Join-Path $Root "deploy\jonbailey\scripts\start-tunnel.ps1"
  if (Test-Path $tunnelScript) {
    Start-Process -FilePath "powershell.exe" `
      -ArgumentList "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$tunnelScript`"" `
      -WindowStyle Hidden
  }
}