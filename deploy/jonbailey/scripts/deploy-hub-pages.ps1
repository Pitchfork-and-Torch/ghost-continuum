# Deploy hub UI files only when Pages project ghost-continuum-hub already exists.
# The dashboard is served by the local hub behind the gateway, not by Pages.
# This script must not create a Pages project.
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$Ui = Join-Path $Root "packages\hub-ui\public"
$Project = "ghost-continuum-hub"
$Wrangler = Join-Path $Root "node_modules\.bin\wrangler.cmd"

if (-not (Test-Path -LiteralPath $Wrangler)) {
  Write-Error "wrangler not found at $Wrangler. Refusing to deploy."
}

Write-Host "Checking Pages project $Project ..."
$rawText = & $Wrangler pages project list --json | Out-String
if ($LASTEXITCODE -ne 0) {
  Write-Error "Could not list Cloudflare Pages projects (exit $LASTEXITCODE). Refusing to deploy."
}

$trimmed = $rawText.Trim()
$start = $trimmed.IndexOf("[")
$end = $trimmed.LastIndexOf("]")
if ($start -lt 0 -or $end -lt $start) {
  Write-Error "Pages project list was not JSON. Refusing to deploy."
}

$parsed = $trimmed.Substring($start, $end - $start + 1) | ConvertFrom-Json
$names = @()
if ($null -ne $parsed) {
  $names = @($parsed | ForEach-Object { [string]$_.'Project Name' } | Where-Object { $_ })
}
if ($names -notcontains $Project) {
  Write-Error "Pages project '$Project' does not exist. Refusing to create it. The dashboard is served by the local hub behind the gateway, not by a Pages project."
}

Write-Host "Deploying Hub UI from $Ui ..."
& $Wrangler pages deploy $Ui --project-name $Project --branch main
if ($LASTEXITCODE -ne 0) {
  Write-Error "Pages deploy failed (exit $LASTEXITCODE)."
}
Write-Host "Done."
