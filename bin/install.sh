#!/usr/bin/env sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Ghost Continuum install"
node --version >/dev/null

node bin/setup.js

node test/verify.js
node test/integration.js
node test/stack.js

echo ""
echo "Installed. Run: node bin/ghost-continuum.js start"