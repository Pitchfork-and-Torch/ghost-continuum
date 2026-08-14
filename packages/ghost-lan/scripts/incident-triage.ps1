# Ghost LAN — LAN worm incident evidence bundle
# Usage: powershell -ExecutionPolicy Bypass -File scripts\incident-triage.ps1

$ErrorActionPreference = "Continue"
$Root = Split-Path $PSScriptRoot -Parent
$GhostDir = Join-Path $env:USERPROFILE ".ghost-lan"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$OutDir = Join-Path $GhostDir "incident-snapshots\$ts"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Write-Section($title) {
    "`n========== $title ==========`n" | Out-File -Append -Encoding utf8 $Report
}

$Report = Join-Path $OutDir "triage-report.txt"
"Ghost LAN incident triage - $ts" | Out-File -Encoding utf8 $Report
"Host: $env:COMPUTERNAME" | Out-File -Append -Encoding utf8 $Report
"User: $env:USERNAME" | Out-File -Append -Encoding utf8 $Report

# --- Ghost LAN status ---
Write-Section "GHOST LAN STATUS"
try {
    & node (Join-Path $Root "bin\ghost-lan.js") doctor 2>&1 | Out-File -Append -Encoding utf8 $Report
    & node (Join-Path $Root "bin\ghost-lan.js") status 2>&1 | Out-File -Append -Encoding utf8 $Report
    & node (Join-Path $Root "bin\ghost-lan.js") logs --tail 80 2>&1 | Out-File -Append -Encoding utf8 $Report
} catch {
    "Ghost LAN CLI error: $_" | Out-File -Append -Encoding utf8 $Report
}

# --- Copy Ghost LAN data files ---
$copyFiles = @("events.jsonl", "dossiers.json", "state.json", "config.json", "sentinel.log")
foreach ($f in $copyFiles) {
    $src = Join-Path $GhostDir $f
    if (Test-Path $src) { Copy-Item $src $OutDir -Force }
}

# --- Dashboard API (if sentinel up) ---
Write-Section "DASHBOARD API"
try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:29999/api/status" -TimeoutSec 5
    $status | ConvertTo-Json -Depth 5 | Out-File -Append -Encoding utf8 $Report
    $dossiers = Invoke-RestMethod -Uri "http://127.0.0.1:29999/api/dossiers" -TimeoutSec 5
    $dossiers | ConvertTo-Json -Depth 5 | Out-File -Append -Encoding utf8 $Report
} catch {
    "Dashboard unreachable: $_" | Out-File -Append -Encoding utf8 $Report
}

# --- Windows network (worm-relevant ports) ---
Write-Section "ESTABLISHED CONNECTIONS (445,135,139,3389,5985,5986)"
try {
    Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
        Where-Object { $_.RemotePort -in 445, 135, 139, 3389, 5985, 5986 } |
        Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, OwningProcess |
        Format-Table -AutoSize | Out-String | Out-File -Append -Encoding utf8 $Report
} catch {
    netstat -ano | Select-String "ESTABLISHED" | Out-File -Append -Encoding utf8 $Report
}

Write-Section "LISTENING PORTS (worm spread)"
try {
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -in 445, 135, 139, 3389, 5985, 5986, 22, 23 } |
        Select-Object LocalAddress, LocalPort, OwningProcess |
        Format-Table -AutoSize | Out-String | Out-File -Append -Encoding utf8 $Report
} catch { "Listen scan failed: $_" | Out-File -Append -Encoding utf8 $Report }

# --- Processes ---
Write-Section "PROCESSES (non-Windows paths)"
try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -and $_.ExecutablePath -notmatch 'Windows\\|Program Files\\WindowsApps' } |
        Select-Object ProcessId, Name, ExecutablePath |
        Sort-Object Name |
        Format-Table -AutoSize | Out-String | Out-File -Append -Encoding utf8 $Report
} catch { "Process scan failed: $_" | Out-File -Append -Encoding utf8 $Report }

# --- Persistence ---
Write-Section "STARTUP / RUN KEYS"
try {
    Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue |
        Select-Object Name, Command, Location |
        Format-Table -Wrap | Out-String | Out-File -Append -Encoding utf8 $Report
    Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue |
        Format-List | Out-String | Out-File -Append -Encoding utf8 $Report
    Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue |
        Format-List | Out-String | Out-File -Append -Encoding utf8 $Report
} catch { "Persistence scan failed: $_" | Out-File -Append -Encoding utf8 $Report }

# --- Services ---
Write-Section "SMB / RDP SERVICES"
try {
    Get-Service LanmanServer, TermService -ErrorAction SilentlyContinue |
        Select-Object Name, Status, StartType |
        Format-Table | Out-String | Out-File -Append -Encoding utf8 $Report
} catch { "Service scan failed: $_" | Out-File -Append -Encoding utf8 $Report }

# --- Recent patches ---
Write-Section "RECENT HOTFIXES"
try {
    Get-HotFix -ErrorAction SilentlyContinue |
        Sort-Object InstalledOn -Descending |
        Select-Object -First 12 HotFixID, InstalledOn, Description |
        Format-Table | Out-String | Out-File -Append -Encoding utf8 $Report
} catch { "Hotfix scan failed: $_" | Out-File -Append -Encoding utf8 $Report }

# --- LAN interfaces ---
Write-Section "LAN INTERFACES"
try {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^127\.' } |
        Select-Object InterfaceAlias, IPAddress, PrefixOrigin |
        Format-Table | Out-String | Out-File -Append -Encoding utf8 $Report
} catch { "Interface scan failed: $_" | Out-File -Append -Encoding utf8 $Report }

Write-Host ""
Write-Host "  Incident bundle saved:" -ForegroundColor Cyan
Write-Host "  $OutDir" -ForegroundColor Green
Write-Host "  Report: triage-report.txt" -ForegroundColor Green
Write-Host ""