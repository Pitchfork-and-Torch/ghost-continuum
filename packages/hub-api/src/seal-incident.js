/**
 * Create a portable sealed incident: evidence files, MANIFEST (hashed after write),
 * standalone replay.html. Used by hub export, threat-response, and the CLI.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  readEvents,
  exportIncidentSnapshot,
  writeIncidentBundle,
  createIncidentArchive,
  sealBundleDirectory,
  BUNDLE_REPLAY_NAME,
} from '../../core/src/index.js';
import { getLedgerRoot } from '../../trust/src/index.js';
import { buildSessionTimeline } from '../../continuum/src/time-machine.js';
import { renderSealedReplayHtml } from '../../continuum/src/sealed-replay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function sanitizeIncidentLabel(label) {
  return String(label || 'incident')
    .trim()
    .slice(0, 64)
    .replace(/[^a-zA-Z0-9._-]/g, '') || 'incident';
}

function legalText() {
  const legalPath = path.join(__dirname, '../../../LEGAL.md');
  try {
    if (fs.existsSync(legalPath)) return fs.readFileSync(legalPath, 'utf8');
  } catch {
    /* */
  }
  return 'Ghost Continuum - defensive use only. Authorized networks you own or may defend.\n';
}

/**
 * @param {object} options
 * @param {string} [options.label]
 * @param {object[]} [options.events]
 * @param {object} [options.status]
 * @param {object} [options.extraFiles] additional basename → string|object
 * @param {string} [options.dir] override snapshot directory (tests)
 * @param {boolean} [options.archive] create .tgz (default true)
 */
export async function createSealedIncident(options = {}) {
  const label = sanitizeIncidentLabel(options.label);
  const events = Array.isArray(options.events) ? options.events : readEvents(options.eventLimit || 1000);
  const ledger = getLedgerRoot();
  const status = {
    generatedAt: new Date().toISOString(),
    label,
    defensiveOnly: true,
    eventCount: events.length,
    ledger,
    ...(options.status && typeof options.status === 'object' ? options.status : {}),
  };

  const dir = options.dir || exportIncidentSnapshot(label);
  fs.mkdirSync(dir, { recursive: true });

  const files = {
    'status.json': status,
    'events.jsonl': events.map((e) => JSON.stringify(e)).join('\n'),
    'LEGAL.md': legalText(),
  };
  if (options.extraFiles && typeof options.extraFiles === 'object') {
    for (const [name, data] of Object.entries(options.extraFiles)) {
      const base = path.basename(String(name));
      if (!base || base === 'MANIFEST.json' || base === BUNDLE_REPLAY_NAME) continue;
      files[base] = data;
    }
  }

  writeIncidentBundle(dir, files);

  const notes = { 'status.json': 'hub status snapshot', 'events.jsonl': 'event stream', 'LEGAL.md': 'authorized-use notice' };
  const manifest = sealBundleDirectory(dir, Object.keys(files), { notes });

  const timeline = buildSessionTimeline(events);
  const html = renderSealedReplayHtml({
    label,
    events,
    timeline,
    manifest,
    status,
    ledgerRoot: ledger.root,
    generatedAt: Date.now(),
  });
  const htmlPath = path.join(dir, BUNDLE_REPLAY_NAME);
  fs.writeFileSync(htmlPath, html);

  let archivePath = null;
  if (options.archive !== false) {
    try {
      archivePath = await createIncidentArchive(dir);
    } catch {
      archivePath = null;
    }
  }

  const id = path.basename(dir);
  return {
    ok: true,
    id,
    dir,
    label,
    manifest,
    manifestHash: manifest.manifestHash,
    merkleRoot: ledger.root || manifest.manifestHash,
    htmlPath,
    archivePath,
    eventCount: events.length,
    branches: timeline.branches?.length || 0,
    downloadUrl: archivePath ? `/api/incident/download/${path.basename(archivePath, '.tgz')}` : null,
    replayUrl: `/api/incident/replay/${id}`,
  };
}
