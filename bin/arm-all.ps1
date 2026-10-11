# Start full Ghost Continuum deception stack (bundled)
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot

Set-Location $Root
node bin/setup.js 2>$null
node bin/start-stack.js