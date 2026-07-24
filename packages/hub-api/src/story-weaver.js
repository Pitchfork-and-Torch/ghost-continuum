/**
 * Local deception campaign narrative — no external LLM required.
 */

import { classifyTtp } from '../../continuum/src/map-data.js';

export function weaveDeceptionStory(events = [], continuum = {}) {
  const sorted = [...events].filter((e) => e.plane !== 'ops').sort((a, b) => a.ts - b.ts);
  if (!sorted.length) {
    return {
      ok: true,
      title: 'Quiet watch',
      narrative:
        'The continuum is armed and listening. No attacker sessions in the current window — your deception surfaces are ready to absorb the next probe.',
      hours: 0,
      highlights: [],
    };
  }

  const windowMs = sorted[sorted.length - 1].ts - sorted[0].ts;
  const hours = Math.max(1, Math.round(windowMs / 3600000));
  const ips = [...new Set(sorted.map((e) => e.ip).filter(Boolean))];
  const champion = continuum?.genome?.champion;
  const morph = continuum?.morph?.label || 'Research';
  const topPlane = topPlaneByVolume(sorted);
  const topTtp = topTtpLabel(sorted);

  const persona = champion?.archetype || sorted.find((e) => e.detail?.persona)?.detail?.persona || 'decoy persona';
  const ipPhrase = ips.length === 1 ? `a single host (${ips[0]})` : `${ips.length} distinct sources`;

  let narrative = `Over the last ${hours} hour${hours > 1 ? 's' : ''}, ${ipPhrase} `;
  if (topTtp === 'scanning') {
    narrative += `has been methodically mapping what they believe is a vulnerable ${persona.replace(/-/g, ' ')}. `;
  } else if (topTtp === 'credential') {
    narrative += `has escalated toward credential harvesting against the ${persona.replace(/-/g, ' ')} masquerade. `;
  } else if (topTtp === 'lateral') {
    narrative += `is probing lateral movement paths while the sentinel maintains plausible interior topology. `;
  } else {
    narrative += `has engaged your deception stack across multiple interaction types. `;
  }

  narrative += `The ${topPlane} plane is carrying the heaviest load`;
  if (champion) {
    narrative += ` while champion genome **${champion.archetype}** (gen ${champion.generation ?? 0}, fitness ${Math.round(champion.fitness || 0)}) shapes responses`;
  }
  narrative += `. Sentinel morph **${morph}** governs logging and rotation aggressiveness.`;

  const highlights = sorted
    .filter((e) => (e.score || 0) >= 4)
    .slice(-3)
    .map((e) => `${new Date(e.ts).toLocaleTimeString()} · ${e.plane} · ${e.type}${e.ip ? ` (${e.ip})` : ''}`);

  return {
    ok: true,
    title: ips.length > 1 ? 'Multi-source campaign' : 'Active engagement',
    narrative,
    hours,
    uniqueIps: ips.length,
    champion: champion?.archetype || null,
    topPlane,
    highlights,
  };
}

function topPlaneByVolume(events) {
  const counts = {};
  for (const e of events) counts[e.plane] = (counts[e.plane] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0].replace(/-/g, ' ') : 'edge';
}

function topTtpLabel(events) {
  const counts = {};
  for (const e of events) {
    const t = classifyTtp(e);
    counts[t] = (counts[t] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : 'recon';
}