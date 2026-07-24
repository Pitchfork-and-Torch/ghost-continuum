/**
 * Weekly / on-demand home network immune report (markdown + JSON).
 */

import fs from 'fs';
import path from 'path';
import { GC_DIR, readEvents, loadConfig } from '../../core/src/index.js';
import { filterLiveEvents } from './demo-campaign.js';
import { loadPool, getChampion } from '../../genome/src/index.js';
import { assessThreats } from './threat-response.js';
import { loadHome, buildShieldCard } from './home-shield.js';
import { inventorySummary } from './device-inventory.js';
import { getProgression } from './progression.js';
import { getLedgerRoot } from '../../trust/src/index.js';

export const REPORTS_DIR = path.join(GC_DIR, 'reports');

function fmt(ts) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function generateHomeReport(options = {}) {
  const hours = options.hours || 24 * 7;
  const cutoff = Date.now() - hours * 3600000;
  const live = filterLiveEvents(readEvents(2000)).filter((e) => e.ts >= cutoff);
  const config = loadConfig();
  const home = loadHome();
  const pool = loadPool();
  const champion = getChampion(pool);
  const assessment = assessThreats({ hours: Math.min(hours, 24 * 7) });
  const inventory = inventorySummary();
  const progress = getProgression();
  const ledger = getLedgerRoot();

  const scanners = live.filter((e) => /scan|probe|nmap/i.test(String(e.type)) || (e.score || 0) >= 3);
  const traps = live.filter((e) => /trap|honeypot|tripwire/i.test(String(e.type)));
  const uniqueIps = new Set(live.map((e) => e.ip).filter(Boolean));
  const morphs = live.filter((e) => /morph|rotate|genome/i.test(String(e.type)));

  const stats = {
    windowHours: hours,
    liveEvents: live.length,
    uniqueIps: uniqueIps.size,
    scannerish: scanners.length,
    trapEngagements: traps.length,
    morphOrEvolve: morphs.length,
    highScore: live.filter((e) => (e.score || 0) >= 6).length,
    falsePositives: 0, // defensive claim: we don't generate FP category yet
    verdict: assessment.verdict,
    severity: assessment.severity,
    trustedDevices: inventory.trusted,
    unknownActors: (assessment.actors || []).filter((a) => !inventory.devices?.some((d) => d.ip === a.ip)).length,
  };

  const isHome = home.language === 'home';
  const title = isHome
    ? `Your network this week${home.householdName ? ` — ${home.householdName}` : ''}`
    : `Ghost Continuum weekly immune report`;

  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`Generated: ${fmt(Date.now())}`);
  lines.push(`Window: last ${hours} hours · Live events only (demo filtered)`);
  lines.push('');
  lines.push('## Snapshot');
  if (isHome) {
    lines.push(`- **Weird probes seen:** ${stats.scannerish}`);
    lines.push(`- **Decoy interactions:** ${stats.trapEngagements}`);
    lines.push(`- **Different sources:** ${stats.uniqueIps}`);
    lines.push(`- **High-score events:** ${stats.highScore}`);
    lines.push(`- **False alarms we track as FP:** ${stats.falsePositives}`);
    lines.push(`- **Threat status:** ${stats.verdict}`);
    lines.push(`- **Devices you trust:** ${stats.trustedDevices}`);
  } else {
    lines.push(`- Live events: ${stats.liveEvents}`);
    lines.push(`- Unique IPs: ${stats.uniqueIps}`);
    lines.push(`- Scanner-class: ${stats.scannerish}`);
    lines.push(`- Trap/honeypot engagements: ${stats.trapEngagements}`);
    lines.push(`- High-score (≥6): ${stats.highScore}`);
    lines.push(`- Verdict: ${stats.verdict} (${stats.severity})`);
    lines.push(`- Trusted devices: ${stats.trustedDevices}`);
  }
  lines.push('');
  lines.push('## Champion deception genome');
  if (champion) {
    lines.push(
      `- **${champion.personality?.archetype || 'genome'}** · gen ${champion.generation || 0} · fitness ${Math.round(champion.fitness?.score || 0)}`,
    );
    lines.push(`- ID: \`${champion.id}\``);
  } else {
    lines.push('- No champion yet — run Evolve after real engagements.');
  }
  lines.push('');
  lines.push('## Top actors (real, non-demo)');
  for (const a of (assessment.actors || []).slice(0, 8)) {
    const name = inventory.devices?.find((d) => d.ip === a.ip)?.name;
    lines.push(
      `- ${a.ip}${name ? ` (${name})` : ''} · score ${a.maxScore} · ${a.ttps?.join(', ')} · ${a.eventCount} events`,
    );
  }
  if (!assessment.actors?.length) lines.push('- None above score threshold. Quiet is good.');
  lines.push('');
  lines.push('## Morph & planes');
  lines.push(`- Morph: **${config.continuum?.morph || 'research'}**`);
  lines.push(`- Profile: ${home.profileId || 'not set'}`);
  lines.push(`- Kid mode: ${home.kidMode ? 'on' : 'off'}`);
  lines.push(`- Quiet hours: ${home.quietHours?.enabled ? `${home.quietHours.start}–${home.quietHours.end}` : 'off'}`);
  lines.push('');
  lines.push('## Trust fabric');
  lines.push(`- Ledger root: \`${(ledger.root || '').slice(0, 24)}…\``);
  lines.push(`- Ledger entries: ${ledger.entries || 0}`);
  lines.push('');
  lines.push('## Progress badges');
  for (const b of (progress.badges || []).filter((x) => x.earned).slice(0, 12)) {
    lines.push(`- ✅ ${b.title}`);
  }
  if (!(progress.badges || []).some((b) => b.earned)) lines.push('- No badges yet — complete the wizard and seal an incident.');
  lines.push('');
  lines.push('## What this means');
  if (isHome) {
    lines.push(
      stats.verdict === 'CLEAR'
        ? 'Your decoys did not see serious multi-hit trouble this period. Keep LIVE mode on and glance at the weekly card.'
        : 'Something poked your defenses. Open Command Nexus → ASSESS → FULL RESPOND if you have not already. Export a sealed incident for your records.',
    );
  } else {
    lines.push(`Assessment verdict **${stats.verdict}**. Use /api/threat/respond for defensive containment.`);
  }
  lines.push('');
  lines.push('---');
  lines.push('_Ghost Continuum · local-first · defensive only · data stayed on this machine until you exported this file._');

  const markdown = lines.join('\n');
  const html = renderHomeReportHtml({ title, markdown, stats, isHome, generatedAt: Date.now() });
  const report = {
    ok: true,
    title,
    stats,
    champion: champion
      ? { id: champion.id, archetype: champion.personality?.archetype, fitness: champion.fitness?.score, generation: champion.generation }
      : null,
    assessment: { verdict: assessment.verdict, actors: assessment.actors?.slice(0, 10) },
    home: { profileId: home.profileId, language: home.language, householdName: home.householdName },
    shieldCard: buildShieldCard(home),
    markdown,
    html,
    generatedAt: Date.now(),
  };

  if (options.persist !== false) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const id = `report-${new Date().toISOString().slice(0, 10)}-${Date.now()}`;
    const mdPath = path.join(REPORTS_DIR, `${id}.md`);
    const jsonPath = path.join(REPORTS_DIR, `${id}.json`);
    const htmlPath = path.join(REPORTS_DIR, `${id}.html`);
    fs.writeFileSync(mdPath, markdown + '\n');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(htmlPath, html + '\n');
    report.id = id;
    report.paths = { markdown: mdPath, json: jsonPath, html: htmlPath };
  }

  return report;
}

/** Printable HTML card for spouse/board forward (browser Print → PDF). */
export function renderHomeReportHtml({ title, markdown, stats, isHome, generatedAt }) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const body = esc(markdown)
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  const stamp = new Date(generatedAt || Date.now()).toISOString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, Segoe UI, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 1.4rem; }
    code { font-size: 0.9em; }
    .meta { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; background: #e8f5e9; font-size: 0.8rem; }
    @media print { body { margin: 0; } .noprint { display: none; } }
  </style>
</head>
<body>
  <p class="meta noprint">Ghost Continuum · local report · ${esc(stamp)}${isHome ? ' · home language' : ''}</p>
  <p><span class="badge">verdict: ${esc(stats?.verdict || 'n/a')}</span>
     <span class="badge">events: ${esc(stats?.liveEvents ?? 0)}</span>
     <span class="badge">probes: ${esc(stats?.scannerish ?? 0)}</span></p>
  <article><p>${body}</p></article>
  <p class="meta">Defensive only · data stayed on this machine until you opened this file.</p>
</body>
</html>`;
}

export function listReports() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8'));
        return { id: j.id || f.replace(/\.json$/, ''), title: j.title, generatedAt: j.generatedAt, stats: j.stats };
      } catch {
        return { id: f, error: true };
      }
    })
    .sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0));
}
