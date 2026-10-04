#Requires -RunAsAdministrator
param(
  [string]$InstallRoot = "$env:USERPROFILE\ghost-continuum",
  [string]$ServiceName = "DMSentinel"
)

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Error "Node.js not found"; exit 1 }

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $nssm) {
  Write-Host "Install NSSM (https://nssm.cc) or use bin/install-autostart.ps1 for logon startup."
  & "$InstallRoot\bin\install-autostart.ps1"
  exit 0
}

& nssm install $ServiceName $node "$InstallRoot\bin\start-stack.js"
& nssm set $ServiceName AppDirectory $InstallRoot
& nssm set $ServiceName AppEnvironmentExtra GC_NO_BROWSER=1
& nssm start $ServiceName
Write-Host "Service $ServiceName installed and started."