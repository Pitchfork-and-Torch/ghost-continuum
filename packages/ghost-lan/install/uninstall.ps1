# Ghost LAN — remove autostart hooks
$ErrorActionPreference = "SilentlyContinue"

Write-Host "Removing Ghost LAN autostart..."

schtasks /Delete /TN "Ghost-LAN-Sentinel" /F 2>$null | Out-Null
schtasks /Delete /TN "Ghost-LAN-Watchdog" /F 2>$null | Out-Null
Unregister-ScheduledTask -TaskName "Ghost-LAN-Sentinel" -Confirm:$false
Unregister-ScheduledTask -TaskName "Ghost-LAN-Watchdog" -Confirm:$false
Unregister-ScheduledTask -TaskName "DM-Home-Shield" -Confirm:$false

$startup = [Environment]::GetFolderPath("Startup")
Remove-Item (Join-Path $startup "Ghost-LAN.lnk") -Force -ErrorAction SilentlyContinue
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "Ghost-LAN" -Force -ErrorAction SilentlyContinue

$ports = @(8080, 8443, 5901, 29999)
foreach ($p in $ports) {
    netsh advfirewall firewall delete rule name="Ghost-LAN-$p" 2>$null | Out-Null
}
netsh advfirewall firewall delete rule name="Ghost-LAN-Rotating" 2>$null | Out-Null

Write-Host "Done. Config/logs remain in $env:USERPROFILE\.ghost-lan"
Write-Host "Stop sentinel: node bin\ghost-lan.js stop"