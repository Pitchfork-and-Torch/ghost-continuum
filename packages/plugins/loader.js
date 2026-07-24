import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Community plugin loader — discovers plane modules from configured paths.
 */

export async function loadPlugins(config) {
  const pluginPaths = config?.continuum?.plugins || [];
  const loaded = [];

  for (const pluginPath of pluginPaths) {
    const resolved = path.resolve(pluginPath);
    const entry = path.join(resolved, 'index.js');
    if (!fs.existsSync(entry)) {
      loaded.push({ path: resolved, ok: false, error: 'missing index.js' });
      continue;
    }
    try {
      const mod = await import(pathToFileURL(entry).href);
      if (mod.plane) {
        loaded.push({ path: resolved, ok: true, plane: mod.plane });
      } else {
        loaded.push({ path: resolved, ok: false, error: 'must export plane' });
      }
    } catch (e) {
      loaded.push({ path: resolved, ok: false, error: e.message });
    }
  }

  return loaded;
}

export async function collectPluginStatus(config) {
  const plugins = await loadPlugins(config);
  const statuses = [];
  for (const p of plugins) {
    if (!p.ok) {
      statuses.push({ id: path.basename(p.path), ok: false, error: p.error });
      continue;
    }
    try {
      const st = p.plane.status ? await p.plane.status(config) : { armed: false };
      statuses.push({ id: p.plane.id || path.basename(p.path), ok: true, ...st });
    } catch (e) {
      statuses.push({ id: p.plane.id, ok: false, error: e.message });
    }
  }
  return statuses;
}