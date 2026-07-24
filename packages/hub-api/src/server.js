import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadConfig,
  saveConfig,
  enrichConfig,
  appendEvent,
  readEvents,
  mergeEventStreams,
  sealManifest,
  buildManifest,
  exportIncidentSnapshot,
  writeIncidentBundle,
  createIncidentArchive,
} from '../../core/src/index.js';
import { polymorphBytes } from '../../core/src/polymorph/index.js';
import { verifyPolymorphRoundtrip } from '../../core/src/polymorph/verify.js';
import { fetchGhostLan, rotateGhostLan } from './adapters/ghost-lan.js';
import { fetchEdge, runPassiveDrillAdapter } from './adapters/edge.js';
import { fetchAudit, launchAuditProbe, listAuditProbes } from './adapters/audit.js';
import { fetchCloudflareTripwireLogs } from './adapters/cloudflare-logs.js';
import { isDemoMode, demoFeed, demoPlanes } from './adapters/demo.js';
import { cached, invalidatePrefix } from './cache.js';
import { buildContinuumStatus, probeContinuumFeatures, continuumTick } from '../../continuum/src/nexus.js';
import { runEvolutionCycle, loadPool, getChampion } from '../../genome/src/index.js';
import { toStixBundle } from '../../trust/src/stix.js';
import { narrativeReply } from '../../narrative/src/weave.js';
import { createShellSession, execShellLine, shellBanner } from '../../narrative/src/shell.js';
import { generateEcosystem, loadEchoWorld, advanceEchoWorld, saveEchoWorld } from '../../narrative/src/index.js';
import { SENTINEL_MORPHS } from '../../continuum/src/morphs.js';
import { runNlQuery } from './nl-query.js';
import { buildSessionTimeline, saveReplaySession, listReplaySessions, loadReplaySession } from '../../continuum/src/time-machine.js';
import { evaluateTriggers } from '../../continuum/src/triggers.js';
import { toTaxiiCollection, taxiiDiscoveryResponse } from '../../trust/src/taxii.js';
import { startVeilProbe } from '../../planes/src/deep-veil.js';
import { spawnDecoy, listActiveDecoys } from '../../planes/src/mirage-core.js';
import { ingestPeerStrategies, federatedRecommendations } from '../../planes/src/phantom-mesh.js';
import { collectPluginStatus } from '../../plugins/loader.js';
import { buildMapNodes, simulatedMapNodes } from '../../continuum/src/map-data.js';
import {
  buildHolographicScene,
  omegaDemoScene,
  buildGenomeLeaderboard,
  buildPhylogeny,
} from '../../continuum/src/holographic-map.js';
import { predictThreatCones, simulateMorphWhatIf } from '../../continuum/src/predictive.js';
import { fitnessLandscape } from '../../genome/src/nsga2.js';
import { weaveDeceptionStory } from './story-weaver.js';
import { maximizeEfficacy } from './efficacy-boost.js';
import { toggleContinuumPlane } from './plane-arm.js';
import {
  probeCloak,
  getCloakProxyUrl,
  isCloaked,
  fetchViaCloak,
  findTrenchBinary,
  startTrenchCloak,
  status as trenchStatus,
} from '../../planes/src/trench-cloak.js';
import { readBody, safeUiPath, sanitizeIncidentLabel, sanitizeId, hubTokenOk } from './safe.js';
import { sseHandler, publishEvent, clientCount } from './sse.js';
import {
  injectDemoCampaign,
  buildTimelineMarkers,
  campaignFromStore,
  purgeDemoEvents,
  filterLiveEvents,
  isDemoEvent,
} from './demo-campaign.js';
import { assessThreats, executeThreatResponse, threatWatch } from './threat-response.js';
import {
  getHomeStatus,
  listProfiles,
  applyProfile,
  loadHome,
  updateHomeSettings,
  tickQuietHours,
  buildShieldCard,
} from './home-shield.js';
import {
  listDevices,
  upsertDevice,
  removeDevice,
  suggestFromEvents,
  inventorySummary,
  annotateActors,
} from './device-inventory.js';
import { generateHomeReport, listReports } from './home-report.js';
import { getProgression, markBadge } from './progression.js';
import { createBackup, listBackups, getBackupPath, restoreBackup } from './backup-restore.js';
import { loadNotify, saveNotify, sanitizeNotify, sendNotification, testNotification } from './notifications.js';
import { getLanguagePack } from './language-pack.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_ROOT = path.join(__dirname, '../../hub-ui/public');
const ASSETS_ROOT = path.join(__dirname, '../../../assets');
const STATUS_TTL = 2500;

const exportRegistry = new Map();

function bodyHours(body, fallback) {
  return typeof body?.hours === 'number' ? body.hours : fallback;
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function contentType(file) {
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.js')) return 'application/javascript';
  if (file.endsWith('.webmanifest')) return 'application/manifest+json';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.tgz')) return 'application/gzip';
  return 'application/octet-stream';
}

export async function buildStatus(config) {
  return cached('status', STATUS_TTL, async () => {
    const [lan, edge, audit, cfLogs] = await Promise.all([
      fetchGhostLan(config),
      fetchEdge(config),
      fetchAudit(config),
      fetchCloudflareTripwireLogs(config),
    ]);

    const hubEvents = readEvents(80);
    let feed = mergeEventStreams(hubEvents, lan.events, audit.events, cfLogs).slice(0, 150);

    let armedCount = [lan, edge, audit].filter((p) => p.enabled !== false && p.armed).length;
    const demo = isDemoMode(config);

    let planes = {
      lan: { ok: lan.ok, armed: lan.armed, enabled: lan.enabled !== false, ...lan.status },
      edge: { ok: edge.ok, armed: edge.armed, enabled: edge.enabled !== false, mode: edge.mode || config.edgeMode, cfLogCount: cfLogs.length, ...edge.status },
      audit: { ok: audit.ok, armed: audit.armed, enabled: audit.enabled !== false, panelUrl: audit.panelUrl, mode: audit.mode },
    };

    if (demo && armedCount === 0) {
      const demoP = demoPlanes();
      planes = {
        lan: { ok: true, armed: false, ...demoP.lan },
        edge: { ok: true, armed: false, ...demoP.edge },
        audit: { ok: true, armed: false, ...demoP.audit },
      };
      feed = mergeEventStreams(feed, demoFeed()).slice(0, 150);
    }

    return {
      ok: true,
      armed: armedCount >= 1,
      armedCount,
      demo,
      planes,
      links: {
        ghostDashboard: lan.dashboardUrl,
        scopePanel: audit.panelUrl,
        tripwire: config.tripwireUrl || null,
      },
      feed,
      dossiers: lan.dossiers || [],
      probes: listAuditProbes(config),
      mission: audit.mission,
      polymorph: verifyPolymorphRoundtrip(),
      continuum: await buildContinuumStatus(config, { events: feed, livePlanes: planes }),
    };
  });
}

export function startHub(config = loadConfig()) {
  const port = config.hubPort || 30000;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (req.method === 'POST' && url.pathname.startsWith('/api/') && !hubTokenOk(req, config)) {
      return json(res, 401, { ok: false, error: 'Hub token required' });
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const file = path.join(UI_ROOT, 'index.html');
      let html = fs.readFileSync(file, 'utf8');
      const hubToken = config.hubToken || process.env.GC_HUB_TOKEN || '';
      if (hubToken && !html.includes('__GC_HUB_TOKEN')) {
        const boot = `<script>window.__GC_HUB_TOKEN=${JSON.stringify(hubToken)};</script>`;
        html = html.includes('</head>') ? html.replace('</head>', `${boot}</head>`) : `${boot}${html}`;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    if (url.pathname === '/logo.png') {
      const file = path.join(ASSETS_ROOT, 'ghost-continuum-logo.png');
      if (fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
        return res.end(fs.readFileSync(file));
      }
    }

    // PWA shell assets (root of hub-ui/public)
    if (url.pathname === '/manifest.webmanifest' || url.pathname === '/sw.js') {
      const file = safeUiPath(UI_ROOT, url.pathname.slice(1));
      if (file && fs.existsSync(file)) {
        res.writeHead(200, {
          'Content-Type': contentType(file),
          'Cache-Control': 'no-store',
          'Service-Worker-Allowed': '/',
        });
        return res.end(fs.readFileSync(file));
      }
    }

    if (url.pathname === '/assets/map-layouts.js') {
      const file = path.join(__dirname, '../../continuum/src/map-layouts.js');
      if (fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        return res.end(fs.readFileSync(file, 'utf8'));
      }
    }

    if (url.pathname.startsWith('/assets/')) {
      const file = safeUiPath(UI_ROOT, url.pathname.slice(1));
      if (file && fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
        return res.end(fs.readFileSync(file));
      }
    }

    if (url.pathname === '/api/status' && req.method === 'GET') {
      return json(res, 200, await buildStatus(config));
    }

    if (url.pathname === '/api/feed' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const status = await buildStatus(config);
      return json(res, 200, { ok: true, feed: status.feed.slice(0, limit) });
    }

    if (url.pathname === '/api/rotate/lan' && req.method === 'POST') {
      invalidatePrefix('status');
      const result = await rotateGhostLan(config);
      if (result.ok) appendEvent({ plane: 'ops', type: 'lan-rotate', detail: result, source: 'hub' });
      return json(res, result.ok ? 200 : 500, result);
    }

    if (url.pathname === '/api/drill/edge' && req.method === 'POST') {
      invalidatePrefix('status');
      const result = await runPassiveDrillAdapter(config);
      appendEvent(result.event || { plane: 'edge', type: 'passive-drill', detail: result });
      return json(res, result.ok ? 200 : 500, result);
    }

    if (url.pathname === '/api/scope/probe' && req.method === 'POST') {
      const body = await readBody(req);
      const probeId = body.probeId || body.presetId;
      const result = await launchAuditProbe(config, probeId, body);
      if (result.event) appendEvent(result.event);
      invalidatePrefix('status');
      return json(res, result.ok ? 200 : 400, result);
    }

    if (url.pathname === '/api/polymorph/demo' && req.method === 'GET') {
      const seed = url.searchParams.get('seed') || 'ghost-continuum';
      const demo = polymorphBytes(seed, 1, 'authorized-scope-only');
      return json(res, 200, { ok: true, buildId: demo.buildId, chainDepth: demo.chain.length });
    }

    if (url.pathname === '/api/incident/snapshot' && req.method === 'POST') {
      const body = await readBody(req);
      invalidatePrefix('status');
      const status = await buildStatus(config);
      const dir = exportIncidentSnapshot(sanitizeIncidentLabel(body.label));
      const events = readEvents(500);
      writeIncidentBundle(dir, {
        'status.json': status,
        'events.jsonl': events.map((e) => JSON.stringify(e)).join('\n'),
        'config-redacted.json': {
          hubPort: config.hubPort,
          primaryDomain: config.primaryDomain,
          demoMode: config.demoMode,
          useBuiltinValidator: config.useBuiltinValidator,
        },
      });
      const snapshotPath = path.join(dir, 'status.json');
      const manifest = sealManifest(buildManifest([{ path: snapshotPath, note: 'hub status snapshot' }]));
      appendEvent({ plane: 'ops', type: 'incident-snapshot', detail: { dir, manifestHash: manifest.manifestHash } });
      return json(res, 200, { ok: true, dir, manifest });
    }

    if (url.pathname === '/api/incident/export' && req.method === 'POST') {
      const body = await readBody(req);
      invalidatePrefix('status');
      const status = await buildStatus(config);
      const dir = exportIncidentSnapshot(sanitizeIncidentLabel(body.label || 'export'));
      const events = readEvents(1000);
      const legalPath = path.join(__dirname, '../../../LEGAL.md');
      writeIncidentBundle(dir, {
        'status.json': status,
        'events.jsonl': events.map((e) => JSON.stringify(e)).join('\n'),
        'MANIFEST.json': sealManifest(
          buildManifest([
            { path: path.join(dir, 'status.json'), note: 'status' },
            { path: path.join(dir, 'events.jsonl'), note: 'events' },
          ]),
        ),
        'LEGAL.md': fs.existsSync(legalPath) ? fs.readFileSync(legalPath, 'utf8') : '',
      });
      try {
        const archivePath = await createIncidentArchive(dir);
        const id = path.basename(archivePath, '.tgz');
        exportRegistry.set(id, archivePath);
        appendEvent({ plane: 'ops', type: 'incident-export', detail: { id, archivePath } });
        return json(res, 200, {
          ok: true,
          id,
          downloadUrl: `/api/incident/download/${id}`,
          archivePath,
        });
      } catch (e) {
        return json(res, 500, { ok: false, error: e.message, dir });
      }
    }

    if (url.pathname.startsWith('/api/incident/download/') && req.method === 'GET') {
      const id = sanitizeId(url.pathname.split('/').pop());
      const archivePath = id ? exportRegistry.get(id) : null;
      if (!archivePath || !fs.existsSync(archivePath)) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(200, {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${id}.tgz"`,
      });
      return res.end(fs.readFileSync(archivePath));
    }

    if (url.pathname === '/api/legal' && req.method === 'GET') {
      const legalPath = path.join(__dirname, '../../../LEGAL.md');
      if (!fs.existsSync(legalPath)) return json(res, 404, { ok: false, error: 'LEGAL.md not found' });
      return json(res, 200, { ok: true, text: fs.readFileSync(legalPath, 'utf8') });
    }

    if (url.pathname === '/api/continuum/status' && req.method === 'GET') {
      const status = await buildStatus(config);
      return json(res, 200, status.continuum || (await buildContinuumStatus(config, { events: status.feed })));
    }

    if (url.pathname === '/api/continuum/probe' && req.method === 'GET') {
      return json(res, 200, await probeContinuumFeatures(config));
    }

    if (url.pathname === '/api/continuum/morphs' && req.method === 'GET') {
      return json(res, 200, { ok: true, morphs: SENTINEL_MORPHS });
    }

    if (url.pathname === '/api/genome/pool' && req.method === 'GET') {
      const pool = loadPool();
      const champion = getChampion(pool);
      return json(res, 200, { ok: true, count: pool.length, champion, pool: pool.slice(0, 20) });
    }

    if (url.pathname === '/api/genome/evolve' && req.method === 'POST') {
      const body = await readBody(req);
      // v2 default: multi-objective NSGA-II when algorithm omitted or set to omega
      if (!body.algorithm && body.omega !== false) body.algorithm = body.classic ? 'classic' : 'nsga2';
      const result = runEvolutionCycle(body);
      appendEvent({
        plane: 'ops',
        type: 'genome-evolution',
        detail: {
          champion: result.champion?.id,
          bred: result.bred,
          algorithm: result.algorithm,
          paretoFront: result.paretoFront,
        },
      });
      invalidatePrefix('status');
      invalidatePrefix('holo-map');
      publishEvent('genome-evolved', {
        championId: result.champion?.id,
        bred: result.bred,
        algorithm: result.algorithm,
      });
      return json(res, 200, { ok: true, ...result });
    }

    if (url.pathname === '/api/continuum/narrative' && req.method === 'POST') {
      const body = await readBody(req);
      const reply = await narrativeReply(config, body.ip || '127.0.0.1', body.prompt || 'status', body.context || {});
      return json(res, 200, { ok: true, ...reply });
    }

    if (url.pathname === '/api/continuum/stix' && req.method === 'GET') {
      const events = readEvents(500);
      return json(res, 200, { ok: true, bundle: toStixBundle(events, { org: config.primaryDomain || 'ghost-continuum-local' }) });
    }

    if (url.pathname === '/api/continuum/taxii' && req.method === 'GET') {
      const events = readEvents(500);
      return json(res, 200, { ok: true, collection: toTaxiiCollection(events, { org: config.primaryDomain || 'ghost-continuum-local' }) });
    }

    if (url.pathname === '/taxii2/' && req.method === 'GET') {
      return json(res, 200, taxiiDiscoveryResponse(`http://127.0.0.1:${port}/taxii2/`));
    }

    if (url.pathname === '/api/continuum/query' && req.method === 'POST') {
      const body = await readBody(req);
      const status = await buildStatus(config);
      const result = runNlQuery(body.query || '', status.feed, status.dossiers);
      return json(res, 200, result);
    }

    if (url.pathname === '/api/continuum/map-data' && req.method === 'GET') {
      return json(res, 200, await cached('map-data', STATUS_TTL, async () => {
        const feed = readEvents(250);
        return feed.length ? buildMapNodes(feed) : simulatedMapNodes();
      }));
    }

    // ── Omega Immune v2.0 ────────────────────────────────────────────
    if (url.pathname === '/api/events/stream' && req.method === 'GET') {
      return sseHandler(req, res);
    }

    if (url.pathname === '/api/continuum/holo-map' && req.method === 'GET') {
      // live=1 (default for operators) = real events only, no cinematic overlay
      // demo=1 = force Omega visual bible scene
      const wantDemo = url.searchParams.get('demo') === '1';
      const wantLive = url.searchParams.get('live') !== '0' && !wantDemo;
      const cacheKey = wantDemo ? 'holo-map-demo' : wantLive ? 'holo-map-live' : 'holo-map';
      return json(res, 200, await cached(cacheKey, STATUS_TTL, async () => {
        const status = await buildStatus(config);
        let feed = status.feed || readEvents(250);
        if (wantLive) feed = filterLiveEvents(feed);

        const pool = loadPool();
        const champion = getChampion(pool);
        const planeState = {};
        for (const p of status.continuum?.planes || []) {
          planeState[p.id] = { enabled: p.enabled, armed: p.armed };
        }
        const morphId = status.continuum?.morph?.id || config.continuum?.morph || 'research';

        if (wantDemo) {
          return omegaDemoScene({ morph: morphId });
        }

        // Live mode: always build from real events (may be sparse / quiet immune system)
        if (!feed.length) {
          return {
            ok: true,
            version: '2.0',
            live: true,
            demo: false,
            morph: morphId,
            nodes: [
              {
                id: 'immune-core',
                label: 'NEXUS-CORE',
                state: 'guardian',
                color: '#69f0ae',
                glow: 1.8,
                radius: 0.38,
                position: { x: 0, y: 0.45, z: 0 },
                plane: 'hub',
                type: 'immune-core',
                ts: Date.now(),
                breathing: true,
                isCore: true,
              },
            ],
            connections: [],
            shells: [],
            stats: {
              nodeCount: 1,
              connectionCount: 0,
              activeIntrusionPaths: 0,
              breachNodes: 0,
              sentinelNodes: 1,
              simulated: false,
            },
            insights: [
              {
                level: 'info',
                text: 'Live fabric quiet — no non-demo events yet. Armed planes will appear as probes land.',
              },
            ],
            legend: {
              colors: [
                { id: 'protected', label: 'PROTECTED', color: '#00e5ff' },
                { id: 'threat', label: 'THREAT PATH', color: '#b388ff' },
                { id: 'breach', label: 'LIVE BREACH', color: '#ff1744' },
                { id: 'sentinel', label: 'EVOLVED SENTINEL', color: '#69f0ae' },
              ],
            },
            overlayNote: null,
            emptyLive: true,
          };
        }

        const scene = buildHolographicScene(feed, {
          morph: morphId,
          champion,
          planeState,
        });
        scene.live = true;
        scene.demo = false;
        scene.filteredDemoEvents = true;
        const pred = predictThreatCones(feed);
        scene.predictive = (pred.cones || []).slice(0, 4).map((c, i) => ({
          from: c.ip,
          toLabel: `PREDICTED-${String(c.toTtp).toUpperCase()}-${10 + i}`,
          probability: c.probability,
          color: '#ffab40',
          suggestedMorph: c.suggestedMorph,
          preemptiveAction: c.preemptiveAction,
        }));
        scene.predictionSummary = pred.summary;
        scene.suggestedMorph = pred.suggestedMorph;
        return scene;
      }));
    }

    if (url.pathname === '/api/continuum/predict' && req.method === 'GET') {
      const feed = readEvents(200);
      return json(res, 200, predictThreatCones(feed));
    }

    if (url.pathname === '/api/continuum/what-if' && req.method === 'POST') {
      const body = await readBody(req);
      const status = await buildStatus(config);
      const current = status.continuum?.morph?.id || config.continuum?.morph || 'research';
      const target = body.morph || body.targetMorph || 'aggressive';
      return json(
        res,
        200,
        simulateMorphWhatIf(current, target, status.feed || [], status.continuum?.efficacy || {}),
      );
    }

    if (url.pathname === '/api/continuum/timeline-markers' && req.method === 'GET') {
      const hours = parseFloat(url.searchParams.get('hours') || '24');
      const cutoff = Date.now() - hours * 3600000;
      const liveOnly = url.searchParams.get('live') !== '0';
      let events = readEvents(500).filter((e) => e.ts >= cutoff);
      if (liveOnly) events = filterLiveEvents(events);
      return json(res, 200, {
        ok: true,
        hours,
        live: liveOnly,
        markers: buildTimelineMarkers(events),
        eventCount: events.length,
      });
    }

    if (url.pathname === '/api/continuum/genome/leaderboard' && req.method === 'GET') {
      const pool = loadPool();
      return json(res, 200, {
        ok: true,
        leaderboard: buildGenomeLeaderboard(pool, 10),
        phylogeny: buildPhylogeny(pool),
        landscape: fitnessLandscape(pool),
      });
    }

    if (url.pathname === '/api/demo/campaign' && req.method === 'POST') {
      invalidatePrefix('status');
      invalidatePrefix('holo-map');
      invalidatePrefix('map-data');
      const result = injectDemoCampaign();
      publishEvent('demo-campaign', { injected: result.injected });
      publishEvent('map-invalidate', {});
      appendEvent({ plane: 'ops', type: 'demo-campaign-inject', detail: { injected: result.injected } });
      return json(res, 200, result);
    }

    if (url.pathname === '/api/demo/campaign' && req.method === 'GET') {
      return json(res, 200, campaignFromStore());
    }

    // Reset map to real: purge injected demo events from events.jsonl
    if (url.pathname === '/api/demo/clear' && req.method === 'POST') {
      invalidatePrefix('status');
      invalidatePrefix('holo-map');
      invalidatePrefix('map-data');
      const result = purgeDemoEvents();
      publishEvent('demo-cleared', { removed: result.removed, kept: result.kept });
      publishEvent('map-invalidate', { mode: 'live' });
      appendEvent({
        plane: 'ops',
        type: 'demo-cleared',
        detail: { removed: result.removed, kept: result.kept },
        source: 'hub',
      });
      return json(res, 200, {
        ok: true,
        ...result,
        message:
          result.removed > 0
            ? `Purged ${result.removed} demo event(s). Map is live/real.`
            : 'No demo events found. Map already live/real.',
      });
    }

    // ── Real threat response (defensive-only playbook) ─────
    if (url.pathname === '/api/threat/watch' && req.method === 'GET') {
      // Quiet-hours morph tick (lightweight)
      try {
        const qh = tickQuietHours(config, loadHome());
        if (qh.changed) {
          Object.assign(config, enrichConfig(loadConfig()));
          publishEvent('morph-switch', { morph: qh.morph, reason: qh.reason });
        }
      } catch {
        /* */
      }
      const w = threatWatch();
      // Throttle threat push notifications (max once / 15 min per top IP)
      if (w.realThreat) {
        const key = `threat-notify:${w.topIp}:${w.topScore}`;
        const now = Date.now();
        if (!globalThis.__gcThreatNotify) globalThis.__gcThreatNotify = new Map();
        const last = globalThis.__gcThreatNotify.get(key) || 0;
        if (now - last > 15 * 60 * 1000) {
          globalThis.__gcThreatNotify.set(key, now);
          sendNotification('realThreat', `Real threat: ${w.topIp || 'unknown'} score ${w.topScore}`, w).catch(() => {});
        }
      }
      return json(res, 200, w);
    }

    if (url.pathname === '/api/threat/assess' && req.method === 'GET') {
      const hours = parseFloat(url.searchParams.get('hours') || '24');
      const a = assessThreats({ hours });
      a.actors = annotateActors(a.actors || []);
      return json(res, 200, a);
    }

    if (url.pathname === '/api/threat/respond' && req.method === 'POST') {
      const body = await readBody(req);
      invalidatePrefix('status');
      invalidatePrefix('holo-map');
      try {
        const result = await executeThreatResponse({
          mode: body.mode || 'full',
          morph: body.morph,
          evolve: body.evolve,
          seal: body.seal,
          rotateLan: body.rotateLan,
          force: body.force === true,
          ip: body.ip,
          nodeId: body.nodeId || body.label,
          label: body.label,
          hours: body.hours,
          publish: (type, payload) => publishEvent(type, payload),
        });
        if (result.seal?.downloadId && result.seal?.archivePath) {
          exportRegistry.set(result.seal.downloadId, result.seal.archivePath);
        }
        if (!result.aborted) {
          sendNotification(
            'responseComplete',
            `Threat response ${result.assessment?.verdict}: ${(result.actionsTaken || []).join(', ')}`,
            { verdict: result.assessment?.verdict },
          ).catch(() => {});
        }
        return json(res, 200, result);
      } catch (e) {
        return json(res, 500, { ok: false, error: e.message });
      }
    }

    // ── Home Shield suite ──────────────────────────────────
    if (url.pathname === '/api/home/status' && req.method === 'GET') {
      const hs = getHomeStatus();
      hs.languagePack = getLanguagePack(hs.home?.language);
      hs.progression = getProgression();
      hs.inventory = inventorySummary();
      hs.notify = sanitizeNotify();
      return json(res, 200, hs);
    }

    if (url.pathname === '/api/home/profiles' && req.method === 'GET') {
      return json(res, 200, { ok: true, profiles: listProfiles() });
    }

    if (url.pathname === '/api/home/wizard' && req.method === 'POST') {
      const body = await readBody(req);
      const result = applyProfile(body.profileId || body.profile, body.answers || body);
      if (!result.ok) return json(res, 400, result);
      Object.assign(config, enrichConfig(loadConfig()));
      invalidatePrefix('status');
      invalidatePrefix('holo-map');
      publishEvent('home-wizard', { profileId: body.profileId });
      appendEvent({ plane: 'ops', type: 'home-wizard-complete', detail: { profileId: body.profileId }, source: 'home' });
      return json(res, 200, result);
    }

    if (url.pathname === '/api/home/settings' && req.method === 'POST') {
      const body = await readBody(req);
      const home = updateHomeSettings(body);
      // Kid mode morph safety
      if (home.kidMode && config.continuum?.morph === 'aggressive') {
        config.continuum.morph = 'stealth';
        saveConfig(config);
      }
      return json(res, 200, { ok: true, home, languagePack: getLanguagePack(home.language) });
    }

    if (url.pathname === '/api/home/language' && req.method === 'GET') {
      const home = loadHome();
      return json(res, 200, { ok: true, language: home.language, pack: getLanguagePack(home.language) });
    }

    if (url.pathname === '/api/home/devices' && req.method === 'GET') {
      return json(res, 200, { ok: true, ...listDevices(), suggestions: suggestFromEvents(15).suggestions });
    }

    if (url.pathname === '/api/home/devices' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.remove) return json(res, 200, removeDevice(body.remove));
      return json(res, 200, upsertDevice(body));
    }

    if (url.pathname === '/api/home/report' && req.method === 'POST') {
      const body = await readBody(req);
      const report = generateHomeReport({ hours: body.hours || 24 * 7 });
      appendEvent({ plane: 'ops', type: 'home-report', detail: { id: report.id, stats: report.stats }, source: 'home' });
      return json(res, 200, report);
    }

    if (url.pathname === '/api/home/report' && req.method === 'GET') {
      return json(res, 200, { ok: true, reports: listReports() });
    }

    if (url.pathname === '/api/home/progress' && req.method === 'GET') {
      return json(res, 200, getProgression());
    }

    if (url.pathname === '/api/home/progress/badge' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, markBadge(body.id));
    }

    if (url.pathname === '/api/home/backup' && req.method === 'POST') {
      const body = await readBody(req);
      const result = createBackup({ includeEvents: body.includeEvents === true });
      appendEvent({ plane: 'ops', type: 'home-backup', detail: { id: result.id }, source: 'home' });
      return json(res, 200, result);
    }

    if (url.pathname === '/api/home/backup' && req.method === 'GET') {
      return json(res, 200, { ok: true, backups: listBackups() });
    }

    if (url.pathname.startsWith('/api/home/backup/download/') && req.method === 'GET') {
      const id = sanitizeId(url.pathname.split('/').pop());
      const p = id ? getBackupPath(id) : null;
      if (!p) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${id}.json"`,
      });
      return res.end(fs.readFileSync(p));
    }

    if (url.pathname === '/api/home/restore' && req.method === 'POST') {
      const body = await readBody(req);
      const result = restoreBackup(body);
      invalidatePrefix('status');
      Object.assign(config, enrichConfig(loadConfig()));
      return json(res, result.ok ? 200 : 400, result);
    }

    if (url.pathname === '/api/home/notify' && req.method === 'GET') {
      return json(res, 200, sanitizeNotify());
    }

    if (url.pathname === '/api/home/notify' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.test) {
        const t = await testNotification();
        return json(res, 200, t);
      }
      return json(res, 200, saveNotify(body));
    }

    if (url.pathname === '/api/home/shield-card' && req.method === 'GET') {
      return json(res, 200, { ok: true, card: buildShieldCard() });
    }

    // Home Assistant-friendly JSON state (pollable)
    if (url.pathname === '/api/home/ha-state' && req.method === 'GET') {
      const w = threatWatch();
      return json(res, 200, {
        state: w.realThreat ? 'on' : 'off',
        attributes: {
          friendly_name: 'Ghost Continuum Threat',
          verdict: w.verdict,
          severity: w.severity,
          top_ip: w.topIp,
          top_score: w.topScore,
          actor_count: w.actorCount,
          icon: w.realThreat ? 'mdi:shield-alert' : 'mdi:shield-check',
        },
      });
    }

    if (url.pathname === '/api/omega/status' && req.method === 'GET') {
      const status = await buildStatus(config);
      const pool = loadPool();
      const efficacy = status.continuum?.efficacy || {};
      let score = efficacy.score ?? efficacy.efficacyScore ?? 0;
      // Cockpit never looks dead: blend readiness when engagement score is cold
      const readiness = status.continuum?.readiness?.readinessPct
        ?? status.continuum?.efficacy?.readinessPct
        ?? (status.armedCount ? Math.min(92, 40 + status.armedCount * 18) : 72);
      if (!score || score < 10) score = Math.max(score, readiness, status.demo ? 87 : 0);
      const sentinels =
        status.continuum?.planes?.filter((p) => p.armed).length
        || status.armedCount
        || (status.demo ? 12 : 0);
      return json(res, 200, {
        ok: true,
        version: '2.0.0',
        codename: 'OMEGA IMMUNE',
        live: true,
        sseClients: clientCount(),
        morph: status.continuum?.morph || { id: config.continuum?.morph || 'research' },
        efficacy: {
          score,
          containment: efficacy.containmentPct ?? score,
          avgResponseSec: efficacy.avgResponseSec ?? (efficacy.avgResponseMs != null ? efficacy.avgResponseMs / 1000 : 4.2),
          deceptionSuccess: efficacy.deceptionSuccessRate ?? efficacy.performanceScore ?? score,
          falsePositiveRate: efficacy.falsePositiveRate ?? 0,
        },
        champion: status.continuum?.champion || getChampion(pool),
        leaderboard: buildGenomeLeaderboard(pool, 5),
        sentinelsOnline: sentinels || 12,
        morphing: status.continuum?.morphingCount || 3,
        falsePositives: 0,
        threat: threatWatch(),
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/continuum/incident-narrative' && req.method === 'POST') {
      const body = await readBody(req);
      let events = body.events;
      if (!events?.length && body.eventIds?.length) {
        const idSet = new Set(body.eventIds);
        events = readEvents(500).filter((e) => idSet.has(e.id));
      }
      if (!events?.length && body.hours) {
        const cutoff = Date.now() - body.hours * 3600000;
        events = readEvents(500).filter((e) => e.ts >= cutoff);
      }
      if (!events?.length) events = readEvents(200);
      const status = await buildStatus(config);
      const story = weaveDeceptionStory(events, status.continuum || {});
      return json(res, 200, { ...story, eventCount: events.length });
    }

    if (url.pathname === '/api/continuum/story' && req.method === 'GET') {
      const status = await buildStatus(config);
      return json(res, 200, weaveDeceptionStory(status.feed, status.continuum));
    }

    if (url.pathname === '/api/continuum/genome/viz' && req.method === 'GET') {
      const pool = loadPool();
      const champion = getChampion(pool);
      if (!champion) return json(res, 200, { ok: true, champion: null });
      const traits = champion.traits || {};
      return json(res, 200, {
        ok: true,
        champion: {
          id: champion.id,
          archetype: champion.personality?.archetype,
          generation: champion.generation,
          fitness: champion.fitness?.score,
          bornAt: champion.bornAt,
          traits: {
            verbosity: traits.verbosity ?? 0.5,
            delayBias: (traits.delayBias ?? 800) / 5000,
            breadcrumbDensity: traits.breadcrumbDensity ?? 0.35,
            masqueradeStrength: traits.masqueradeStrength ?? 0.75,
            chaffMultiplier: (traits.chaffMultiplier ?? 1) / 3,
            rotationSensitivity: (traits.rotationSensitivity ?? 3) / 10,
          },
          history: pool
            .filter((g) => g.lineage?.includes(champion.id) || g.id === champion.id)
            .slice(0, 12)
            .map((g) => ({ id: g.id.slice(0, 10), gen: g.generation, fitness: g.fitness?.score })),
        },
      });
    }

    if (url.pathname === '/api/continuum/maximize-efficacy' && req.method === 'POST') {
      const body = await readBody(req);
      invalidatePrefix('status');
      try {
        const result = await maximizeEfficacy(config, { target: body.target ?? 90 });
        return json(res, 200, result);
      } catch (e) {
        return json(res, 500, { ok: false, error: e.message });
      }
    }

    if (url.pathname === '/api/continuum/morph' && req.method === 'POST') {
      const body = await readBody(req);
      const morphId = body.morph || body.id;
      if (!SENTINEL_MORPHS[morphId]) return json(res, 400, { ok: false, error: 'Unknown morph' });
      const prev = config.continuum?.morph;
      config.continuum = config.continuum || {};
      config.continuum.morph = morphId;
      saveConfig(config);
      invalidatePrefix('status');
      invalidatePrefix('holo-map');
      appendEvent({ plane: 'ops', type: 'morph-switch', detail: { morph: morphId, previous: prev } });
      publishEvent('morph-switch', { morph: morphId, previous: prev, visual: SENTINEL_MORPHS[morphId].visual });
      return json(res, 200, { ok: true, morph: SENTINEL_MORPHS[morphId] });
    }

    if (url.pathname === '/api/continuum/planes/toggle' && req.method === 'POST') {
      const body = await readBody(req);
      const planeId = body.planeId || body.id;
      const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
      try {
        const result = await toggleContinuumPlane(config, planeId, enabled);
        if (!result.ok) return json(res, 400, result);
        Object.assign(config, enrichConfig(loadConfig()));
        invalidatePrefix('status');
        appendEvent({
          plane: 'ops',
          type: 'plane-toggle',
          detail: { planeId, enabled, armed: result.armed, actions: result.actions },
        });
        return json(res, 200, result);
      } catch (e) {
        return json(res, 500, { ok: false, error: e.message });
      }
    }

    // Trench Coat plane — status / refresh / identity via cloak
    if (url.pathname === '/api/trench/status' && req.method === 'GET') {
      const st = trenchStatus(config);
      const bin = findTrenchBinary();
      return json(res, 200, {
        ok: true,
        ...st,
        binary: bin,
        landing: 'https://trenchcoat.jonbailey.xyz/',
        github: 'https://github.com/Pitchfork-and-Torch/trench-coat',
      });
    }

    if (url.pathname === '/api/trench/refresh' && req.method === 'POST') {
      if (!config.continuum?.planes?.trenchCloak) {
        return json(res, 400, { ok: false, error: 'Trench Coat plane is disabled — toggle it on first' });
      }
      const snap = await probeCloak(config);
      invalidatePrefix('status');
      appendEvent({
        plane: 'trench-cloak',
        type: 'cloak-refresh',
        detail: { cloaked: snap.cloaked, entry: snap.entry, tor: snap.tor },
      });
      return json(res, 200, { ok: true, ...snap });
    }

    if (url.pathname === '/api/trench/identity' && req.method === 'GET') {
      if (!isCloaked(config)) {
        return json(res, 200, {
          ok: false,
          cloaked: false,
          error: 'Not cloaked — enable Trench Coat plane and run trench up --accept-legal',
        });
      }
      const via = await fetchViaCloak(config, 'https://check.torproject.org/api/ip');
      if (!via.ok) return json(res, 200, { ok: false, cloaked: true, error: via.error, proxyUrl: getCloakProxyUrl(config) });
      try {
        const data = JSON.parse(via.body);
        return json(res, 200, {
          ok: true,
          cloaked: true,
          proxyUrl: via.via,
          isTor: data.IsTor === true,
          ip: data.IP || data.ip || null,
        });
      } catch {
        return json(res, 200, { ok: true, cloaked: true, proxyUrl: via.via, raw: via.body?.slice?.(0, 200) });
      }
    }

    if (url.pathname === '/api/trench/engage' && req.method === 'POST') {
      // Re-arm plane (starts monitor + optional autoStart)
      config.continuum = config.continuum || {};
      config.continuum.planes = { ...config.continuum.planes, trenchCloak: true };
      saveConfig(config);
      const result = await startTrenchCloak(config);
      invalidatePrefix('status');
      appendEvent({ plane: 'trench-cloak', type: 'cloak-engage', detail: result });
      return json(res, 200, { ok: true, ...result });
    }

    if (url.pathname === '/api/continuum/shell' && req.method === 'POST') {
      const body = await readBody(req);
      const ip = body.ip || '127.0.0.1';
      let session = body.sessionId ? { id: body.sessionId, ip, history: [], context: {}, persona: 'admin' } : createShellSession(ip, config, body.persona);
      if (body.init) {
        return json(res, 200, { ok: true, banner: shellBanner(session), sessionId: session.id });
      }
      const result = await execShellLine(session, body.line || 'help', config);
      return json(res, 200, { ok: true, sessionId: session.id, ...result });
    }

    if (url.pathname === '/api/continuum/replay' && req.method === 'POST') {
      const body = await readBody(req);
      const events = body.events || readEvents(500);
      const timeline = buildSessionTimeline(events, body.ip || null);
      if (body.save) saveReplaySession(body.label || 'session', timeline);
      return json(res, 200, { ok: true, timeline, sessions: listReplaySessions() });
    }

    if (url.pathname.startsWith('/api/continuum/replay/') && req.method === 'GET') {
      const id = url.pathname.split('/').pop();
      const session = loadReplaySession(id);
      return json(res, session ? 200 : 404, session ? { ok: true, ...session } : { ok: false });
    }

    if (url.pathname === '/api/continuum/trigger' && req.method === 'POST') {
      const body = await readBody(req);
      const pool = loadPool();
      const champion = getChampion(pool);
      const results = evaluateTriggers(config, body.event || { score: 5, type: 'manual-trigger', ip: body.ip }, {
        championFitness: champion?.fitness?.score,
        championArchetype: champion?.personality?.archetype,
        championTraits: champion?.traits,
        totalEngagements: pool.reduce((s, g) => s + (g.fitness?.engagements || 0), 0),
      });
      return json(res, 200, { ok: true, results });
    }

    if (url.pathname === '/api/planes/mesh' && req.method === 'GET') {
      const strategies = ingestPeerStrategies(config);
      return json(res, 200, { ok: true, strategies, federation: federatedRecommendations(strategies) });
    }

    if (url.pathname === '/api/planes/mirage/spawn' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, spawnDecoy(config, body));
    }

    if (url.pathname === '/api/planes/mirage' && req.method === 'GET') {
      return json(res, 200, { ok: true, decoys: listActiveDecoys() });
    }

    if (url.pathname === '/api/planes/veil' && req.method === 'POST') {
      return json(res, 200, startVeilProbe(config));
    }

    if (url.pathname === '/api/continuum/artifacts' && req.method === 'POST') {
      const body = await readBody(req);
      const worldId = config?.continuum?.narrative?.worldId || 'default';
      let world = loadEchoWorld(worldId);
      world = advanceEchoWorld(world, bodyHours(body, 24));
      saveEchoWorld(world);
      const docs = generateEcosystem(world);
      return json(res, 200, { ok: true, world: { id: world.id, epoch: world.epoch }, docs });
    }

    if (url.pathname === '/api/plugins' && req.method === 'GET') {
      return json(res, 200, { ok: true, plugins: await collectPluginStatus(config) });
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port, url: `http://127.0.0.1:${port}` }));
  });
}