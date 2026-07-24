#!/usr/bin/env node
import { spawn } from 'child_process';
import { resolveCellRoot } from '../packages/hub-api/src/adapters/cell-wire.js';
import { loadConfig } from '../packages/core/src/index.js';

const root = resolveCellRoot(loadConfig());
if (!root) {
  console.error('DM_CELL_ROOT or cellRoot in ~/.ghost-continuum/config.json is required');
  process.exit(1);
}

const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const shell = process.platform === 'win32';
const child = spawn(cmd, ['run', 'server'], {
  cwd: root,
  stdio: 'inherit',
  shell,
});
child.on('exit', (code) => process.exit(code ?? 0));