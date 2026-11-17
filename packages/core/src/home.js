import os from 'os';
import path from 'path';

/**
 * Operator data root. GC_HOME points config, logs, and ledgers at another
 * directory so a test run does not write the real home folder.
 */
export function dataHome() {
  const override = process.env.GC_HOME;
  if (override && String(override).trim()) return path.resolve(String(override).trim());
  return os.homedir();
}
