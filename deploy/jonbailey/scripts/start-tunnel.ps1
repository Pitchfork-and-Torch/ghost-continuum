# Run Ghost Continuum Cloudflare Tunnel (ghost-hub / sentinel -> local hub :30000)
$ErrorActionPreference = "Stop"
$TokenFile = Join-Path $env:USERPROFILE ".cloudflared\ghost-continuum-hub.token"
$CloudflaredCandidates = @(
  "C:\Program Files (x86)\cloudflared\cloudflared.exe",
  "C:\Program Files\cloudflared\cloudflared.exe",
  (Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
) | Where-Object { $_ -and (Test-Path $_) }

if (-not (Test-Path $TokenFile)) {
  Write-Error "Missing tunnel token at $TokenFile — create tunnel via Cloudflare dashboard or API"
}
if (-not $CloudflaredCandidates) {
  Write-Error "Install cloudflared: winget install Cloudflare.cloudflared"
}
$Cloudflared = $CloudflaredCandidates | Select-Object -First 1
$token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
if (-not $token) {
  Write-Error "Tunnel token file is empty: $TokenFile"
}

# Avoid duplicate connectors
$existing = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "cloudflared already running (PIDs: $($existing.Id -join ', '))"
  exit 0
}

Write-Host "Starting dm-sentinel-hub tunnel via $Cloudflared ..."
Start-Process -FilePath $Cloudflared -ArgumentList @("tunnel", "run", "--token", $token) -WindowStyle Hidden
Start-Sleep -Seconds 3
$running = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "cloudflared started (PIDs: $($running.Id -join ', '))"
} else {
  Write-Error "cloudflared failed to start — check token and network"
}
