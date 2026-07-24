/**
 * Real-threat response — defensive-only incident playbook for Ghost Continuum.
 *
 * Phases: TRIAGE → CONTAIN → INVESTIGATE → ADAPT → SEAL
 * Never generates offensive payloads. Demo events are excluded from "real" assessment.
 */

import {
  loadConfig,
  saveConfig,
  appendEvent,
  readEvents,
  exportIncidentSnapshot,
  writeIncidentBundle,
  createIncidentArchive,
  sealManifest,
  buildManifest,
} from '../../core/src/index.js';
import { rotateGhostLan } from './adapters/ghost-lan.js';
import { runEvolutionCycle, loadPool, getChampion } from '../../genome/src/index.js';
import { SENTINEL_MORPHS } from '../../continuum/src/morphs.js';
import { predictThreatCones, simulateMorphWhatIf } from '../../continuum/src/predictive.js';
import { buildSessionTimeline, saveReplaySession } from '../../continuum/src/time-machine.js';
import { evaluateTriggers } from '../../continuum/src/triggers.js';
import { toStixBundle } from '../../trust/src/stix.js';
import { filterLiveEvents, isDemoEvent } from './demo-campaign.js';
import { runNlQuery } from './nl-query.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HIGH_SCORE = 6;
const CRITICAL_SCORE = 7;
const WINDOW_MS = 24 * 3600000;

function classifySeverity(score) {
  if (score >= CRITICAL_SCORE) return 'critical';
  if (score >= HIGH_SCORE) return 'high';
  if (score >= 4) return 'elevated';
  if (score >= 3) return 'low';
  return 'info';
}

function classifyTtp(e) {
  const blob = `${e.type || ''} ${JSON.stringify(e.detail || {})}`.toLowerCase();
  if (/lateral|smb|rdp|pivot|winrm|compromis/.test(blob)) return 'lateral';
  if (/credential|password|auth|login|dump/.test(blob)) return 'credential';
  if (/exfil|download|upload|transfer/.test(blob)) return 'exfil';
  if (/trap|tripwire|c2|beacon|honeypot/.test(blob)) return 'trap-engagement';
  if (/scan|nmap|masscan|probe|recon/.test(blob)) return 'scanning';
  if ((e.score || 0) >= 5) return 'engagement';
  return 'recon';
}

function suggestMorph(severity, ttps = []) {
  if (severity === 'critical' || ttps.includes('lateral') || ttps.includes('exfil')) return 'aggressive';
  if (ttps.includes('credential')) return 'aggressive';
  if (severity === 'high') return 'forensic';
  if (ttps.includes('scanning')) return 'research';
  return 'forensic';
}

/**
 * Assess live (non-demo) events for real threats.
 */
export function assessThreats(options = {}) {
  const hours = options.hours || 24;
  const cutoff = Date.now() - hours * 3600000;
  const all = readEvents(800);
  const live = filterLiveEvents(all).filter((e) => e.ts >= cutoff);
  const high = live.filter((e) => (e.score || 0) >= HIGH_SCORE);

  const byIp = {};
  for (const e of high) {
    const ip = e.ip || 'unknown';
    if (!byIp[ip]) {
      byIp[ip] = {
        ip,
        events: [],
        maxScore: 0,
        planes: new Set(),
        ttps: new Set(),
        firstTs: e.ts,
        lastTs: e.ts,
      };
    }
    const g = byIp[ip];
    g.events.push(e);
    g.maxScore = Math.max(g.maxScore, e.score || 0);
    g.planes.add(e.plane);
    g.ttps.add(classifyTtp(e));
    g.firstTs = Math.min(g.firstTs, e.ts);
    g.lastTs = Math.max(g.lastTs, e.ts);
  }

  const actors = Object.values(byIp)
    .map((g) => ({
      ip: g.ip,
      maxScore: g.maxScore,
      severity: classifySeverity(g.maxScore),
      eventCount: g.events.length,
      planes: [...g.planes],
      ttps: [...g.ttps],
      firstTs: g.firstTs,
      lastTs: g.lastTs,
      latestType: g.events.sort((a, b) => b.ts - a.ts)[0]?.type,
      sampleIds: g.events.slice(0, 5).map((e) => e.id),
    }))
    .sort((a, b) => b.maxScore - a.maxScore || b.eventCount - a.eventCount);

  const maxScore = actors[0]?.maxScore || 0;
  const severity = actors.length ? classifySeverity(maxScore) : 'none';
  const allTtps = [...new Set(actors.flatMap((a) => a.ttps))];
  const recommendedMorph = actors.length ? suggestMorph(severity, allTtps) : null;

  const verdict =
    severity === 'none'
      ? 'CLEAR'
      : severity === 'critical' || severity === 'high'
        ? 'REAL_THREAT'
        : 'ELEVATED';

  return {
    ok: true,
    verdict,
    severity,
    realThreat: verdict === 'REAL_THREAT',
    windowHours: hours,
    assessedAt: Date.now(),
    liveEventCount: live.length,
    highScoreCount: high.length,
    demoFiltered: all.length - live.length,
    actors,
    recommendedMorph,
    recommendedActions: buildRecommendedActions(verdict, severity, actors, recommendedMorph),
    ethics: 'Defensive only. No offensive payloads. Allowlisted scopes. Loopback hub.',
  };
}

function buildRecommendedActions(verdict, severity, actors, morph) {
  if (verdict === 'CLEAR') {
    return [
      { id: 'watch', label: 'Continue live monitoring', auto: false },
      { id: 'live-map', label: 'Keep map in LIVE mode (not DEMO)', auto: false },
    ];
  }
  const actions = [
    { id: 'morph', label: `Switch sentinel morph → ${String(morph || 'forensic').toUpperCase()}`, auto: true, morph },
    { id: 'rotate-lan', label: 'Rotate LAN persona (if engagement ongoing)', auto: true },
    { id: 'investigate', label: 'Correlate IPs, TTPs, predictive cones', auto: true },
    { id: 'evolve', label: 'Run NSGA-II evolution on deception genome', auto: severity === 'critical' || severity === 'high' },
    { id: 'seal', label: 'Seal incident bundle (Merkle + export)', auto: true },
    { id: 'external', label: 'External: WAF/rate-limit/block source IPs on edge you own', auto: false },
  ];
  if (actors.some((a) => a.ttps.includes('lateral') || a.ttps.includes('exfil'))) {
    actions.unshift({
      id: 'priority-contain',
      label: 'Priority: lateral/exfil signals — aggressive morph + seal immediately',
      auto: true,
    });
  }
  return actions;
}

/**
 * Execute defensive response playbook.
 * @param {object} options
 * @param {string} [options.mode] full | contain | investigate | seal
 * @param {string} [options.morph] force morph id
 * @param {boolean} [options.evolve]
 * @param {boolean} [options.seal]
 * @param {boolean} [options.rotateLan]
 * @param {string} [options.nodeId] optional focus node label/id from UI
 * @param {string} [options.ip] optional focus IP
 * @param {function} [options.publish] SSE publisher
 */
export async function executeThreatResponse(options = {}) {
  const config = loadConfig();
  const mode = options.mode || 'full';
  const publish = options.publish || (() => {});
  const log = [];
  const step = (phase, msg, data = {}) => {
    const entry = { phase, msg, ts: Date.now(), ...data };
    log.push(entry);
    return entry;
  };

  // ── PHASE 0: TRIAGE ──────────────────────────────────────
  const assessment = assessThreats({ hours: options.hours || 24 });
  step('triage', `Verdict ${assessment.verdict} · severity ${assessment.severity}`, {
    actors: assessment.actors.length,
    highScoreCount: assessment.highScoreCount,
  });

  if (assessment.verdict === 'CLEAR' && !options.force) {
    return {
      ok: true,
      aborted: true,
      reason: 'No real (non-demo) high-score threats in window. Use DEMO only for drills; force:true to run playbook anyway.',
      assessment,
      log,
      ethics: assessment.ethics,
    };
  }

  if (options.ip) {
    assessment.focusIp = options.ip;
  }
  if (options.nodeId) {
    assessment.focusNode = options.nodeId;
  }

  publish('threat-response', { phase: 'triage', verdict: assessment.verdict });

  const actionsTaken = [];
  let morphResult = null;
  let rotateResult = null;
  let evolveResult = null;
  let sealResult = null;
  let triggers = null;
  let prediction = null;
  let whatIf = null;
  let intel = null;
  let timeline = null;

  const doContain = mode === 'full' || mode === 'contain';
  const doInvestigate = mode === 'full' || mode === 'investigate';
  const doAdapt = mode === 'full' || mode === 'adapt';
  const doSeal = mode === 'full' || mode === 'seal' || options.seal === true;

  // ── PHASE 1: CONTAIN ─────────────────────────────────────
  if (doContain) {
    const morphId =
      options.morph ||
      assessment.recommendedMorph ||
      (assessment.severity === 'critical' ? 'aggressive' : 'forensic');

    if (!SENTINEL_MORPHS[morphId]) {
      step('contain', `Unknown morph ${morphId} — skipped`);
    } else {
      const prev = config.continuum?.morph;
      config.continuum = config.continuum || {};
      config.continuum.morph = morphId;
      saveConfig(config);
      morphResult = { ok: true, morph: SENTINEL_MORPHS[morphId], previous: prev };
      appendEvent({
        plane: 'ops',
        type: 'threat-response-morph',
        detail: { morph: morphId, previous: prev, severity: assessment.severity },
        source: 'threat-response',
      });
      actionsTaken.push(`morph→${morphId}`);
      step('contain', `Sentinel morph set to ${morphId}`, morphResult);
      publish('morph-switch', { morph: morphId, previous: prev, reason: 'threat-response' });
    }

    const shouldRotate = options.rotateLan !== false && (mode === 'full' || options.rotateLan === true);
    if (shouldRotate) {
      try {
        rotateResult = await rotateGhostLan(config);
        if (rotateResult?.ok) {
          appendEvent({ plane: 'ops', type: 'lan-rotate', detail: { reason: 'threat-response', ...rotateResult }, source: 'threat-response' });
          actionsTaken.push('lan-rotate');
          step('contain', 'LAN persona rotated', { ok: true });
        } else {
          step('contain', 'LAN rotate skipped or failed', { ok: false, error: rotateResult?.error });
        }
      } catch (e) {
        step('contain', `LAN rotate error: ${e.message}`);
      }
    }

    // Defensive triggers (mirage/evolve/mesh only if already configured)
    try {
      const pool = loadPool();
      const champion = getChampion(pool);
      const topActor = assessment.actors[0];
      triggers = evaluateTriggers(
        config,
        {
          score: assessment.actors[0]?.maxScore || HIGH_SCORE,
          type: 'threat-response',
          ip: topActor?.ip,
        },
        {
          championFitness: champion?.fitness?.score,
          championArchetype: champion?.personality?.archetype,
          championTraits: champion?.traits,
          totalEngagements: pool.reduce((s, g) => s + (g.fitness?.engagements || 0), 0),
        },
      );
      if (triggers?.length) {
        actionsTaken.push(...triggers.map((t) => t.kind));
        step('contain', `Triggers fired: ${triggers.map((t) => t.kind).join(', ')}`, { triggers });
      }
    } catch (e) {
      step('contain', `Triggers: ${e.message}`);
    }
  }

  // ── PHASE 2: INVESTIGATE ─────────────────────────────────
  if (doInvestigate) {
    const live = filterLiveEvents(readEvents(400));
    prediction = predictThreatCones(live);
    const currentMorph = config.continuum?.morph || 'research';
    whatIf = simulateMorphWhatIf(
      currentMorph,
      assessment.recommendedMorph || 'aggressive',
      live,
      { score: 70 },
    );

    const focusIp = options.ip || assessment.actors[0]?.ip;
    const q = focusIp && focusIp !== 'unknown'
      ? `events for ${focusIp}`
      : 'trap trips lateral scanners credential';
    intel = runNlQuery(q, live, []);

    timeline = buildSessionTimeline(
      live.filter((e) => !focusIp || focusIp === 'unknown' || e.ip === focusIp),
      focusIp && focusIp !== 'unknown' ? focusIp : null,
    );
    try {
      saveReplaySession(`threat-${Date.now()}`, timeline);
    } catch {
      /* non-fatal */
    }

    step('investigate', prediction.summary || 'Prediction complete', {
      cones: prediction.cones?.length,
      matchCount: intel?.matchCount,
      branches: timeline?.branches?.length,
    });
    actionsTaken.push('investigate');
    publish('threat-response', { phase: 'investigate', cones: prediction.cones?.length || 0 });
  }

  // ── PHASE 3: ADAPT ───────────────────────────────────────
  if (doAdapt && options.evolve !== false) {
    const shouldEvolve =
      options.evolve === true ||
      mode === 'full' ||
      assessment.severity === 'critical' ||
      assessment.severity === 'high';
    if (shouldEvolve) {
      try {
        evolveResult = runEvolutionCycle({
          algorithm: 'nsga2',
          populationSize: config?.continuum?.evolution?.populationSize || 10,
        });
        appendEvent({
          plane: 'ops',
          type: 'genome-evolution',
          detail: {
            reason: 'threat-response',
            champion: evolveResult.champion?.id,
            algorithm: evolveResult.algorithm,
          },
          source: 'threat-response',
        });
        actionsTaken.push('genome-evolve');
        step('adapt', `NSGA-II evolution · champion ${evolveResult.champion?.id || 'n/a'}`, {
          bred: evolveResult.bred?.length,
          algorithm: evolveResult.algorithm,
        });
        publish('genome-evolved', { championId: evolveResult.champion?.id, reason: 'threat-response' });
      } catch (e) {
        step('adapt', `Evolution failed: ${e.message}`);
      }
    } else {
      step('adapt', 'Evolution skipped (severity below auto-threshold; pass evolve:true to force)');
    }
  }

  // ── PHASE 4: SEAL ────────────────────────────────────────
  if (doSeal && options.seal !== false) {
    try {
      const label = sanitizeLabel(options.label || `threat-${assessment.severity}-${Date.now()}`);
      const dir = exportIncidentSnapshot(label);
      const events = filterLiveEvents(readEvents(1000));
      const statusSlice = {
        assessment,
        morph: morphResult,
        evolve: evolveResult ? { champion: evolveResult.champion?.id, algorithm: evolveResult.algorithm } : null,
        prediction: prediction?.summary,
        actionsTaken,
        generatedAt: new Date().toISOString(),
        defensiveOnly: true,
      };
      const legalPath = path.join(__dirname, '../../../LEGAL.md');
      writeIncidentBundle(dir, {
        'threat-assessment.json': assessment,
        'response-log.json': { log, actionsTaken },
        'status-slice.json': statusSlice,
        'events.jsonl': events.map((e) => JSON.stringify(e)).join('\n'),
        'stix-bundle.json': toStixBundle(events.slice(0, 200), { org: config.primaryDomain || 'ghost-continuum-local' }),
        'LEGAL.md': fs.existsSync(legalPath) ? fs.readFileSync(legalPath, 'utf8') : 'Defensive use only.',
      });
      const manifest = sealManifest(
        buildManifest([
          { path: path.join(dir, 'threat-assessment.json'), note: 'assessment' },
          { path: path.join(dir, 'events.jsonl'), note: 'events' },
        ]),
      );
      let archivePath = null;
      let downloadId = null;
      try {
        archivePath = await createIncidentArchive(dir);
        downloadId = path.basename(archivePath, '.tgz');
      } catch {
        /* archive optional if tar unavailable */
      }
      sealResult = {
        ok: true,
        dir,
        manifestHash: manifest.manifestHash,
        archivePath,
        downloadId,
        downloadUrl: downloadId ? `/api/incident/download/${downloadId}` : null,
      };
      // Register download if archive created — caller/server may re-register
      appendEvent({
        plane: 'ops',
        type: 'threat-response-seal',
        detail: { label, manifestHash: manifest.manifestHash, downloadId },
        source: 'threat-response',
      });
      actionsTaken.push('seal');
      step('seal', `Incident sealed · ${manifest.manifestHash?.slice(0, 16) || 'ok'}…`, sealResult);
      publish('threat-response', { phase: 'seal', downloadId });
    } catch (e) {
      step('seal', `Seal failed: ${e.message}`);
      sealResult = { ok: false, error: e.message };
    }
  }

  const brief = buildIncidentBrief({
    assessment,
    morphResult,
    evolveResult,
    sealResult,
    prediction,
    whatIf,
    intel,
    actionsTaken,
    log,
  });

  appendEvent({
    plane: 'ops',
    type: 'threat-response-complete',
    detail: {
      verdict: assessment.verdict,
      severity: assessment.severity,
      actionsTaken,
      mode,
    },
    source: 'threat-response',
  });
  publish('threat-response', { phase: 'complete', verdict: assessment.verdict });

  return {
    ok: true,
    aborted: false,
    mode,
    assessment,
    actionsTaken,
    morph: morphResult,
    rotate: rotateResult,
    evolve: evolveResult
      ? {
          championId: evolveResult.champion?.id,
          algorithm: evolveResult.algorithm,
          bred: evolveResult.bred?.length,
          paretoFront: evolveResult.paretoFront?.length,
        }
      : null,
    seal: sealResult,
    triggers,
    prediction,
    whatIf,
    intel: intel
      ? { intent: intel.intent, matchCount: intel.matchCount, summary: intel.summary, uniqueIps: intel.uniqueIps }
      : null,
    timeline: timeline
      ? { eventCount: timeline.eventCount, branches: timeline.branches?.length, durationMs: timeline.durationMs }
      : null,
    brief,
    log,
    externalChecklist: buildExternalChecklist(assessment),
    ethics: assessment.ethics,
  };
}

function sanitizeLabel(s) {
  return String(s || 'threat')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 64);
}

function buildIncidentBrief(ctx) {
  const a = ctx.assessment;
  const top = a.actors?.[0];
  const lines = [];
  lines.push(`# Threat response brief — ${a.verdict} (${a.severity})`);
  lines.push('');
  lines.push(`Assessed: ${new Date(a.assessedAt).toISOString()}`);
  lines.push(`Window: last ${a.windowHours}h · live events ${a.liveEventCount} · high-score ${a.highScoreCount}`);
  lines.push('');
  lines.push('## Executive summary');
  if (a.verdict === 'CLEAR') {
    lines.push('No real high-score threats in the live (non-demo) event stream.');
  } else {
    lines.push(
      `${a.actors.length} actor group(s) with score≥${HIGH_SCORE}. ` +
        `Top: ${top?.ip || 'n/a'} score ${top?.maxScore} TTPs [${(top?.ttps || []).join(', ')}] on planes [${(top?.planes || []).join(', ')}]. ` +
        `Defensive response executed; no offensive actions.`,
    );
  }
  lines.push('');
  lines.push('## Timeline (actors)');
  for (const act of (a.actors || []).slice(0, 8)) {
    lines.push(
      `- ${act.ip} · ${act.severity} · score ${act.maxScore} · ${act.eventCount} events · ${act.ttps.join(', ')} · ${new Date(act.lastTs).toISOString()}`,
    );
  }
  lines.push('');
  lines.push('## Actions taken');
  for (const x of ctx.actionsTaken || []) lines.push(`- ${x}`);
  if (ctx.morphResult?.morph) lines.push(`- morph: ${ctx.morphResult.morph.id}`);
  if (ctx.evolveResult?.champion?.id) lines.push(`- champion: ${ctx.evolveResult.champion.id}`);
  if (ctx.sealResult?.manifestHash) lines.push(`- seal: ${ctx.sealResult.manifestHash}`);
  lines.push('');
  lines.push('## Prediction');
  lines.push(ctx.prediction?.summary || 'n/a');
  lines.push('');
  lines.push('## Residual risk');
  lines.push('- Continue LIVE map monitoring for 24h');
  lines.push('- Confirm external edge blocks for listed IPs if you own the edge');
  lines.push('- DEMO mode remains available for drills only — do not confuse with real fabric');
  lines.push('');
  lines.push('_Defensive only. Ghost Continuum · OMEGA IMMUNE._');
  return lines.join('\n');
}

function buildExternalChecklist(assessment) {
  const ips = (assessment.actors || []).map((a) => a.ip).filter((ip) => ip && ip !== 'unknown');
  return {
    title: 'External defensive steps (you own these surfaces)',
    items: [
      ips.length ? `Review / rate-limit / block source IPs at edge: ${ips.slice(0, 10).join(', ')}` : 'No source IPs extracted — check raw events',
      'Rotate edge secrets / API tokens if tripwire or Worker compromise is suspected',
      'Confirm Cloudflare / reverse-proxy logs match hub event timestamps',
      'Do not “hack back” — unauthorized counter-access is illegal and out of scope',
      'Preserve sealed incident bundle for legal / insurance / SIEM',
    ],
  };
}

/**
 * Lightweight watch payload for UI badge polling.
 */
export function threatWatch() {
  const a = assessThreats({ hours: 24 });
  return {
    ok: true,
    verdict: a.verdict,
    severity: a.severity,
    realThreat: a.realThreat,
    actorCount: a.actors.length,
    highScoreCount: a.highScoreCount,
    topIp: a.actors[0]?.ip || null,
    topScore: a.actors[0]?.maxScore || 0,
    recommendedMorph: a.recommendedMorph,
    assessedAt: a.assessedAt,
  };
}
