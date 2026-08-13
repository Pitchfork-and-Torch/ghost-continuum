# Ghost Continuum — boot full stack at Windows logon (no admin required)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Launcher = Join-Path $Root "bin\launch-at-logon.ps1"
$TaskName = "Ghost-Continuum-Stack"
$LegacyTaskName = "DM-Sentinel-Stack"

Write-Host "Ghost Continuum autostart" -ForegroundColor Cyan

if (-not (Test-Path $Launcher)) {
  throw "Missing launcher: $Launcher"
}

node --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Node.js 18+ required" }

Set-Location $Root
node bin/setup.js | Out-Null

$startup = [Environment]::GetFolderPath("Startup")
Remove-Item (Join-Path $startup "DM-Sentinel.lnk") -Force -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $LegacyTaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

$taskOk = $false
try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Launcher`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $principal = New-ScheduledTaskPrincipal -GroupId "Users" -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
  $taskOk = $true
  Write-Host "  Scheduled task: $TaskName (At logon)" -ForegroundColor Green
} catch {
  Write-Host "  Scheduled task skipped ($($_.Exception.Message))" -ForegroundColor Yellow
}

$shortcutPath = Join-Path $startup "Ghost-Continuum.lnk"
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Launcher`""
$shortcut.WorkingDirectory = $Root
$shortcut.WindowStyle = 7
$shortcut.Description = "Ghost Continuum full deception stack + tunnel"
$shortcut.Save()
Write-Host "  Startup shortcut: $shortcutPath" -ForegroundColor Green

Write-Host "`nAutostart enabled. Stack + tunnel launch at logon (no browser popup)." -ForegroundColor Green
if ($taskOk) {
  Write-Host "Disable task: Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false" -ForegroundColor DarkGray
}
Write-Host "Disable shortcut: Remove-Item `"$shortcutPath`" -Force" -ForegroundColor DarkGray