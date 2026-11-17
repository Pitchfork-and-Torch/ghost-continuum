/**
 * Run the suite with GC_HOME (and the OS home vars) pointed at a temp directory.
 * Each file is a child process so module-level data paths pick up the override.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_FILES = [
  'test/home-override.js',
  'test/verify.js',
  'packages/ghost-lan/test/ops-verify.js',
  'test/nl-query.js',
  'test/command-palette.js',
  'test/genome.js',
  'test/continuum.js',
  'test/jsonl-tail.js',
  'test/file-cache.js',
  'test/hub-cache.js',
  'test/metrics.js',
  'test/phases.js',
  'test/integration.js',
  'test/stack.js',
  'test/edge-worker.js',
  'test/edge-bounds.js',
  'test/plane-toggles.js',
  'test/trench-cloak.js',
  'test/omega-v2.js',
  'test/threat-response.js',
  'test/home-suite.js',
  'test/seal-bundle.js',
  'test/hardening.js',
  'test/hub-gateway.js',
  'test/backup-restore.js',
  'test/mirage-core.js',
  'test/ghost-lan-hits.js',
  'test/ghost-lan-bind.js',
  'test/ghost-lan-events.js',
  'test/hub-download.js',
  'test/hub-feed.js',
  'test/seo-safe-url.js',
  'test/holo-canvas.js',
  'test/air-gap-map.js',
  'test/version-lockstep.js',
];

const files = process.argv.slice(2);
const list = files.length ? files : DEFAULT_FILES;
const home = mkdtempSync(path.join(tmpdir(), 'gc-test-home-'));
const env = {
  ...process.env,
  GC_HOME: home,
  HOME: home,
  USERPROFILE: home,
};

let code = 0;
try {
  for (const rel of list) {
    const result = spawnSync(process.execPath, [path.join(root, rel)], {
      cwd: root,
      env,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      code = result.status || 1;
      break;
    }
  }
} finally {
  rmSync(home, { recursive: true, force: true });
}

process.exit(code);
