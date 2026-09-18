# Restart Ghost LAN if the sentinel process is not running
$GhostDir = Join-Path $env:USERPROFILE ".ghost-lan"
$PidFile = Join-Path $GhostDir "sentinel.pid"
$Root = Split-Path $PSScriptRoot -Parent

function Test-SentinelAlive {
    if (-not (Test-Path $PidFile)) { return $false }
    $pid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if (-not $pid) { return $false }
    return $null -ne (Get-Process -Id $pid -ErrorAction SilentlyContinue)
}

if (Test-SentinelAlive) { exit 0 }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { exit 1 }

Start-Process -FilePath $node -ArgumentList (Join-Path $Root "src\sentinel.js") -WorkingDirectory $Root -WindowStyle Hidden
exit 0