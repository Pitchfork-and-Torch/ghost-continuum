# Ghost LAN — install boot-at-logon sentinel (no-admin paths first)
param(
    [switch]$Firewall,
    [switch]$SkipTask,
    [switch]$StartNow,
    [switch]$ForceElevated
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $Node) {
    Write-Error "Node.js 18+ required. Install from https://nodejs.org"
    exit 1
}

$GhostDir = Join-Path $env:USERPROFILE ".ghost-lan"
New-Item -ItemType Directory -Force -Path $GhostDir | Out-Null

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -match '^192\.168\.' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1).IPAddress

if (-not $lanIp) {
    $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^127\.' } |
        Select-Object -First 1).IPAddress
}

$configPath = Join-Path $GhostDir "config.json"
if (-not (Test-Path $configPath)) {
    $config = @{
        siteSeed      = "ghost-lan"
        lanIp         = $lanIp
        tripwireUrl   = ""
        beaconEnabled = $false
        dashboardPort = 29999
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText($configPath, $config, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  Created default config (beacons disabled — set tripwireUrl locally to enable)"
} else {
    Write-Host "  Keeping existing config (not overwritten)"
}

Write-Host ""
Write-Host "  GHOST LAN INSTALLER" -ForegroundColor Cyan
Write-Host "  Config:  $GhostDir\config.json"
Write-Host "  LAN IP:  $lanIp"
Write-Host "  Root:    $Root"
Write-Host ""

function Install-StartupFallback {
    param([string]$Label)
    $launcher = Join-Path $GhostDir "launch-sentinel.cmd"
    $sentinel = Join-Path $Root "src\sentinel.js"
    $watchdog = Join-Path $Root "scripts\watchdog.ps1"

    $cmdContent = @"
@echo off
cd /d "$Root"
start "" /B "$Node" "$sentinel"
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$watchdog"
"@
    [System.IO.File]::WriteAllText($launcher, $cmdContent, [System.Text.UTF8Encoding]::new($false))

    $startup = [Environment]::GetFolderPath("Startup")
    $shortcutPath = Join-Path $startup "Ghost-LAN.lnk"
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut($shortcutPath)
    $sc.TargetPath = $launcher
    $sc.WorkingDirectory = $Root
    $sc.WindowStyle = 7
    $sc.Description = "Ghost LAN polymorphic sentinel"
    $sc.Save()

    $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    New-ItemProperty -Path $runKey -Name "Ghost-LAN" -Value "`"$launcher`"" -PropertyType String -Force | Out-Null

    Write-Host "  $Label Startup shortcut + Run key" -ForegroundColor Green
    Write-Host "    $shortcutPath"
    Write-Host "    $launcher"
}

function Install-SchTasks {
    $launcher = Join-Path $GhostDir "launch-sentinel.cmd"
    if (-not (Test-Path $launcher)) {
        Install-StartupFallback "Prepared"
    }
    $watchdog = Join-Path $Root "scripts\watchdog.ps1"
    $taskRun = 'cmd.exe /c "' + $launcher + '"'

    schtasks /Delete /TN "Ghost-LAN-Sentinel" /F 2>$null | Out-Null
    schtasks /Delete /TN "Ghost-LAN-Watchdog" /F 2>$null | Out-Null

    schtasks /Create /F /TN "Ghost-LAN-Sentinel" /SC ONLOGON /RL LIMITED /TR $taskRun | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "schtasks sentinel failed (exit $LASTEXITCODE)" }

    $watchRun = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $watchdog + '"'
    schtasks /Create /F /TN "Ghost-LAN-Watchdog" /SC MINUTE /MO 5 /RL LIMITED /TR $watchRun | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "schtasks watchdog failed (exit $LASTEXITCODE)" }

    Write-Host "  Scheduled tasks: Ghost-LAN-Sentinel + Ghost-LAN-Watchdog (schtasks)" -ForegroundColor Green
}

function Install-ScheduledTasksCmdlet {
    $sentinel = Join-Path $Root "src\sentinel.js"
    $watchdog = Join-Path $Root "scripts\watchdog.ps1"

    $startArg = "-NoProfile -Command Start-Process -FilePath '$Node' -ArgumentList '$sentinel' -WorkingDirectory '$Root' -WindowStyle Hidden"
    $startAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $startArg -WorkingDirectory $Root
    $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)

    Register-ScheduledTask `
        -TaskName "Ghost-LAN-Sentinel" `
        -Action $startAction `
        -Trigger $logonTrigger `
        -Settings $settings `
        -Description "Polymorphic Ghost LAN honeypot layer" `
        -Force | Out-Null

    $watchArg = "-NoProfile -ExecutionPolicy Bypass -File `"$watchdog`""
    $watchAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $watchArg -WorkingDirectory $Root
    $watchTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
    Register-ScheduledTask `
        -TaskName "Ghost-LAN-Watchdog" `
        -Action $watchAction `
        -Trigger $watchTrigger `
        -Settings $settings `
        -Description "Restart Ghost LAN if sentinel dies" `
        -Force | Out-Null

    Write-Host "  Scheduled tasks: Ghost-LAN-Sentinel + Ghost-LAN-Watchdog (Register-ScheduledTask)" -ForegroundColor Green
}

if (-not $SkipTask) {
    Install-StartupFallback "Autostart:"

    try { Install-SchTasks } catch { Write-Host "  ! schtasks: $($_.Exception.Message)" -ForegroundColor Yellow }
    try { Install-ScheduledTasksCmdlet } catch { Write-Host "  ! Register-ScheduledTask: $($_.Exception.Message)" -ForegroundColor Yellow }

    Write-Host "  Install complete (Startup folder always active)" -ForegroundColor Green
}

if ($Firewall) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "  ! Firewall rules need Administrator - re-run with -Firewall as admin" -ForegroundColor Yellow
    } else {
        Write-Host "  Adding firewall rules (private LAN only)..." -ForegroundColor Yellow
        $fixedPorts = @(8080, 8443, 5901, 29999)
        foreach ($p in $fixedPorts) {
            netsh advfirewall firewall delete rule name="Ghost-LAN-$p" 2>$null | Out-Null
            netsh advfirewall firewall add rule name="Ghost-LAN-$p" dir=in action=allow protocol=TCP localport=$p remoteip=localsubnet profile=private enable=yes | Out-Null
        }
        netsh advfirewall firewall delete rule name="Ghost-LAN-Rotating" 2>$null | Out-Null
        netsh advfirewall firewall add rule name="Ghost-LAN-Rotating" dir=in action=allow protocol=TCP localport=40000-60000 remoteip=localsubnet profile=private enable=yes | Out-Null
        Write-Host "  Firewall: ports 8080,8443,5901,29999 + 40000-60000 (subnet only)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host ('  node "' + (Join-Path $Root 'bin\ghost-lan.js') + '" status') -ForegroundColor Cyan
Write-Host "  http://127.0.0.1:29999"
Write-Host ""

if ($StartNow) {
    & $Node (Join-Path $Root "bin\ghost-lan.js") start
}