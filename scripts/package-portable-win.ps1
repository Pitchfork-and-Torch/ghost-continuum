#Requires -Version 5.1
<#
.SYNOPSIS
  Build a portable Windows x64 Ghost Continuum package (double-clickable .exe).

.DESCRIPTION
  Strategy: thin native GhostContinuum.exe launcher + bundled Node runtime + full app tree.
  Matches zero-core-runtime-deps philosophy: no npm install for end users; Ghost LAN child
  processes keep working because real files + real node.exe are on disk.

  Output:
    dist/GhostContinuum-Portable-win-x64/
      GhostContinuum.exe
      GhostContinuum.cmd
      README-PORTABLE.txt
      LICENSE
      runtime/node.exe
      app/   (bin, packages, assets, package.json, ...)

.PARAMETER SkipNodeDownload
  Use the machine's node.exe (copy) instead of downloading an official portable binary.

.PARAMETER NodeVersion
  Official Node win-x64 version to embed when downloading. Default 20.19.4 (LTS-class, engines >=18).

.PARAMETER OutDir
  Override output directory (default: <repo>/dist/GhostContinuum-Portable-win-x64).
#>
[CmdletBinding()]
param(
  [switch]$SkipNodeDownload,
  [string]$NodeVersion = '20.19.4',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OutDir) {
  $OutDir = Join-Path $RepoRoot 'dist\GhostContinuum-Portable-win-x64'
}

$CscCandidates = @(
  "${env:ProgramFiles}\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\Roslyn\csc.exe",
  "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\Roslyn\csc.exe",
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
)
$Csc = $CscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Csc) { throw 'csc.exe not found. Install .NET Framework 4.x or Visual Studio Build Tools.' }

function Write-Step([string]$msg) { Write-Host "[portable] $msg" -ForegroundColor Cyan }

Write-Step "Repo: $RepoRoot"
Write-Step "Out:  $OutDir"

if (Test-Path $OutDir) {
  Write-Step 'Cleaning previous package...'
  Remove-Item -LiteralPath $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$RuntimeDir = Join-Path $OutDir 'runtime'
$AppDir = Join-Path $OutDir 'app'
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
New-Item -ItemType Directory -Path $AppDir -Force | Out-Null

# --- Node runtime ---
if ($SkipNodeDownload) {
  $sysNode = (Get-Command node -ErrorAction Stop).Source
  Write-Step "Copying system node: $sysNode"
  Copy-Item -LiteralPath $sysNode -Destination (Join-Path $RuntimeDir 'node.exe') -Force
} else {
  $cacheRoot = Join-Path $env:TEMP 'ghost-continuum-portable-cache'
  New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
  $zipName = "node-v$NodeVersion-win-x64.zip"
  $zipPath = Join-Path $cacheRoot $zipName
  $url = "https://nodejs.org/dist/v$NodeVersion/$zipName"
  if (-not (Test-Path $zipPath)) {
    Write-Step "Downloading Node $NodeVersion win-x64..."
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
  } else {
    Write-Step "Using cached Node zip: $zipPath"
  }
  $extractDir = Join-Path $cacheRoot "node-v$NodeVersion-win-x64"
  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $cacheRoot -Force
  $nodeSrc = Join-Path $extractDir 'node.exe'
  if (-not (Test-Path $nodeSrc)) { throw "node.exe not found after extract: $extractDir" }
  Copy-Item -LiteralPath $nodeSrc -Destination (Join-Path $RuntimeDir 'node.exe') -Force
  # LICENSE for Node
  $nodeLic = Join-Path $extractDir 'LICENSE'
  if (Test-Path $nodeLic) {
    Copy-Item -LiteralPath $nodeLic -Destination (Join-Path $RuntimeDir 'NODE-LICENSE') -Force
  }
}

$nodeVer = & (Join-Path $RuntimeDir 'node.exe') -v
Write-Step "Bundled Node: $nodeVer"

# --- App tree (pruned monorepo; keep import.meta.url layout intact) ---
Write-Step 'Copying application sources...'
$copyMap = @(
  @{ Src = 'bin'; Dst = 'bin' },
  @{ Src = 'packages'; Dst = 'packages' },
  @{ Src = 'assets'; Dst = 'assets' },
  @{ Src = 'package.json'; Dst = 'package.json' },
  @{ Src = 'LICENSE'; Dst = 'LICENSE' },
  @{ Src = 'LEGAL.md'; Dst = 'LEGAL.md' },
  @{ Src = 'SECURITY.md'; Dst = 'SECURITY.md' },
  @{ Src = 'config.example.json'; Dst = 'config.example.json' },
  @{ Src = 'README.md'; Dst = 'README.md' }
)

foreach ($item in $copyMap) {
  $src = Join-Path $RepoRoot $item.Src
  $dst = Join-Path $AppDir $item.Dst
  if (-not (Test-Path $src)) {
    Write-Warning "Missing optional path: $($item.Src)"
    continue
  }
  if (Test-Path $src -PathType Container) {
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
  } else {
    $parent = Split-Path $dst -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
}

# Strip heavy / non-runtime subtrees from packages if any slipped in
$stripGlobs = @(
  (Join-Path $AppDir 'packages\**\node_modules'),
  (Join-Path $AppDir 'packages\**\.git')
)
# Explicit known non-runtime under repo root that may have been nested
$extraStrip = @(
  (Join-Path $AppDir 'packages\ghost-lan\node_modules')
)
foreach ($p in $extraStrip) {
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

# --- Compile launcher ---
$launcherSrc = Join-Path $RepoRoot 'apps\portable\GhostContinuumLauncher.cs'
$exeOut = Join-Path $OutDir 'GhostContinuum.exe'
Write-Step "Compiling launcher with: $Csc"
& $Csc /nologo /optimize+ /target:exe /platform:x64 /out:"$exeOut" "$launcherSrc"
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit $LASTEXITCODE" }
if (-not (Test-Path $exeOut)) { throw 'GhostContinuum.exe was not produced' }

# --- Fallback .cmd (no compile needed) ---
$cmdPath = Join-Path $OutDir 'GhostContinuum.cmd'
@"
@echo off
setlocal
cd /d "%~dp0"
set GC_PORTABLE=1
title Ghost Continuum - Command Nexus
echo.
echo   Ghost Continuum portable launcher
echo   Data: %USERPROFILE%\.ghost-continuum
echo   Stop: Ctrl+C
echo.
"%~dp0runtime\node.exe" "%~dp0app\bin\start-stack.js" %*
set EXITCODE=%ERRORLEVEL%
if %EXITCODE% neq 0 (
  echo.
  echo   [ERROR] Exit code %EXITCODE%
  pause
)
exit /b %EXITCODE%
"@ | Set-Content -LiteralPath $cmdPath -Encoding ASCII

# --- Root license + portable README ---
Copy-Item -LiteralPath (Join-Path $RepoRoot 'LICENSE') -Destination (Join-Path $OutDir 'LICENSE') -Force

$pkgVersion = '0.0.0'
try {
  $pkgJson = Get-Content (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json
  $pkgVersion = $pkgJson.version
} catch { }

$readme = @"
Ghost Continuum - Portable Windows x64 package
==============================================
Version: $pkgVersion
Node runtime: $nodeVer (bundled under runtime\)
License: MIT (see LICENSE) - Node.js has its own license in runtime\NODE-LICENSE if present

WHAT THIS IS
  Double-click GhostContinuum.exe to start the full local Command Nexus.
  No Node.js install, no npm, no git clone required.

HOW TO RUN
  1. Keep this whole folder together (do not move only the .exe).
  2. Double-click GhostContinuum.exe  (or GhostContinuum.cmd).
  3. Your browser should open http://127.0.0.1:30000
  4. Leave the console window open while you use the Nexus.
  5. Stop with Ctrl+C in the console window.

PORTS (loopback only)
  Command Nexus / hub:  http://127.0.0.1:30000
  Ghost LAN dashboard:  http://127.0.0.1:29999  (when that plane starts)
  Local edge plane:     http://127.0.0.1:30001  (when edge mode is local)

DATA (private, on your machine)
  %USERPROFILE%\.ghost-continuum   - hub config, events, manifests, genomes
  %USERPROFILE%\.ghost-lan         - Ghost LAN state / dashboard config

  Nothing is sent to the cloud by the core stack. Defensive only.

FIRST RUN
  Setup runs automatically if config is missing (creates data dirs + defaults).
  Click DEMO in the UI for a synthetic campaign if live planes are quiet.

LIMITATIONS
  - Windows x64 only for this package.
  - Antivirus may flag packed/bundled Node tools on first run (false positive class).
    Prefer running from an unpacked folder you trust; hash-check the zip if you publish one.
  - Optional planes (Trench Coat binary, Docker mirage, remote CF edge) need extra software.
  - Size is larger than a hypothetical single-file SEA because Ghost LAN is a real
    child process and needs on-disk scripts + a real node.exe (auditable layout).

REBUILD FROM SOURCE
  From a clone of https://github.com/Pitchfork-and-Torch/ghost-continuum :

    powershell -ExecutionPolicy Bypass -File scripts\package-portable-win.ps1

  Use -SkipNodeDownload to copy the machine's node.exe instead of downloading Node.

  Or: npm run package:win

PHILOSOPHY
  Zero core runtime npm dependencies. Pure Node. Local-first. Loopback by default.
  This portable package embeds Node for convenience; the application code stays readable
  under app\ for audit.

Site / demo: https://ghost.jonbailey.xyz/
"@
Set-Content -LiteralPath (Join-Path $OutDir 'README-PORTABLE.txt') -Value $readme -Encoding UTF8

# --- Zip archive ---
$zipOut = Join-Path $RepoRoot "dist\GhostContinuum-Portable-win-x64-v$pkgVersion.zip"
if (Test-Path $zipOut) { Remove-Item $zipOut -Force }
Write-Step "Zipping to $zipOut"
Compress-Archive -Path (Join-Path $OutDir '*') -DestinationPath $zipOut -CompressionLevel Optimal

# --- Summary ---
$exeSize = [math]::Round((Get-Item $exeOut).Length / 1KB, 1)
$nodeSize = [math]::Round((Get-Item (Join-Path $RuntimeDir 'node.exe')).Length / 1MB, 1)
$folderSize = [math]::Round(((Get-ChildItem $OutDir -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
$zipSize = [math]::Round((Get-Item $zipOut).Length / 1MB, 1)

Write-Host ''
Write-Host '[portable] BUILD OK' -ForegroundColor Green
Write-Host "  Folder: $OutDir  ($folderSize MB)"
Write-Host "  Exe:    $exeOut  ($exeSize KB launcher)"
Write-Host "  Node:   $nodeSize MB"
Write-Host "  Zip:    $zipOut  ($zipSize MB)"
Write-Host ''
Write-Host "  Test:   & `"$exeOut`""
Write-Host ''
