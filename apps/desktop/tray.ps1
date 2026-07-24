# Ghost Continuum Windows tray — opens hub, starts watcher
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$hubUrl = "http://127.0.0.1:30000"
$logo = Join-Path $root "assets\ghost-continuum-logo.png"

$icon = [System.Drawing.SystemIcons]::Shield
if (Test-Path $logo) {
  try { $icon = [System.Drawing.Icon]::new($logo) } catch {}
}

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $icon
$tray.Text = "Ghost Continuum"
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
[void]$menu.Items.Add("Open Command Center", $null, { Start-Process $hubUrl })
[void]$menu.Items.Add("Arm All Planes", $null, {
  Start-Process -FilePath "node.exe" -ArgumentList (Join-Path $root "bin\ghost-continuum.js"), "start" -WindowStyle Hidden
  Start-Sleep 1
  Start-Process $hubUrl
})
[void]$menu.Items.Add("Start Watcher", $null, {
  Start-Process -FilePath "node.exe" -ArgumentList (Join-Path $root "apps\desktop\watch.js") -WindowStyle Minimized
})
[void]$menu.Items.Add("-")
[void]$menu.Items.Add("Exit", $null, { $tray.Visible = $false; [System.Windows.Forms.Application]::Exit() })
$tray.ContextMenuStrip = $menu

$tray.Add_DoubleClick({ Start-Process $hubUrl })
[void][System.Windows.Forms.Application]::Run()