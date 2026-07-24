import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

export async function createIncidentArchive(sourceDir) {
  const parent = path.dirname(sourceDir);
  const base = path.basename(sourceDir);
  const archivePath = path.join(parent, `${base}.tgz`);

  if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);

  if (process.platform === 'win32') {
    await run('tar', ['-czf', archivePath, '-C', parent, base]);
  } else {
    await run('tar', ['-czf', archivePath, '-C', parent, base]);
  }

  return archivePath;
}