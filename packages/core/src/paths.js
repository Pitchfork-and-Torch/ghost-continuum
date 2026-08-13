import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo root (ghost-continuum/) */
export const GC_ROOT = path.resolve(__dirname, '../../..');

export const BUNDLED_GHOST_LAN = path.join(GC_ROOT, 'packages', 'ghost-lan');
export const BUNDLED_EDGE = path.join(GC_ROOT, 'packages', 'edge');