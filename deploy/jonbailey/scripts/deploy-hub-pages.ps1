# Deploy Hub UI to Cloudflare Pages
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$Ui = Join-Path $Root "packages\hub-ui\public"
Write-Host "Deploying Hub UI from $Ui ..."
& (Join-Path $Root "node_modules\.bin\wrangler.cmd") pages deploy $Ui --project-name ghost-continuum-hub --branch main
Write-Host "Done. Add custom domain ghost.jonbailey.xyz in Pages settings."