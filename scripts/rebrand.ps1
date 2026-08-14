# One-shot rebrand: DM Sentinel -> Ghost Continuum (tracked files only)
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$exclude = @('node_modules', '.git', 'package-lock.json', 'rebrand.ps1')

$replacements = @(
  @('DM Sentinel', 'Ghost Continuum'),
  @('dm-sentinel', 'ghost-continuum'),
  @('DM_SENTINEL', 'GHOST_CONTINUUM'),
  @('dm_sentinel', 'ghost_continuum'),
  @('.dm-sentinel', '.ghost-continuum'),
  @('DM_HUB_TOKEN', 'GC_HUB_TOKEN'),
  @('DM_PRIMARY_DOMAIN', 'GC_PRIMARY_DOMAIN'),
  @('DM_GHOST_LAN_ROOT', 'GC_GHOST_LAN_ROOT'),
  @('DM_DEFENSIVE_MARBLE_ROOT', 'GC_DEFENSIVE_MARBLE_ROOT'),
  @('DM_NO_BROWSER', 'GC_NO_BROWSER'),
  @('DM_ROOT', 'GC_ROOT'),
  @('DM_DIR', 'GC_DIR'),
  @('sentinel.jonbailey.xyz', 'ghost.jonbailey.xyz'),
  @('https://jonbailey.xyz/dm-sentinel/', 'https://ghost.jonbailey.xyz/'),
  @('jonbailey.xyz/dm-sentinel', 'ghost.jonbailey.xyz'),
  @('dm-sentinel-local', 'ghost-continuum-local'),
  @('dm-deploy-cta', 'gc-deploy-cta'),
  @('dm-cta-off', 'gc-cta-off'),
  @('dm-cta-x', 'gc-cta-x'),
  @('Pitchfork-and-Torch/dm-sentinel', 'Pitchfork-and-Torch/ghost-continuum'),
  @('dm-sentinel-hub', 'ghost-continuum-hub'),
  @('jonbailey-sentinel-hub-api', 'jonbailey-ghost-hub-api'),
  @('dm-sentinel-hub.token', 'ghost-continuum-hub.token'),
  @('com.dm-sentinel', 'com.ghost-continuum'),
  @('sentinel-rain.js', 'continuum-rain.js')
)

function ShouldSkip($path) {
  foreach ($e in $exclude) { if ($path -match [regex]::Escape($e)) { return $true } }
  return $false
}

$files = Get-ChildItem -Path $Root -Recurse -File | Where-Object { -not (ShouldSkip $_.FullName) }
$count = 0
foreach ($file in $files) {
  try {
    $text = [IO.File]::ReadAllText($file.FullName)
    $orig = $text
    foreach ($pair in $replacements) {
      $text = $text.Replace($pair[0], $pair[1])
    }
    if ($text -ne $orig) {
      [IO.File]::WriteAllText($file.FullName, $text)
      $count++
    }
  } catch {}
}
Write-Host "Updated $count files"