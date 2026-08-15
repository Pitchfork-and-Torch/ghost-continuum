#!/usr/bin/env sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node bin/setup.js 2>/dev/null || true
node bin/start-stack.js