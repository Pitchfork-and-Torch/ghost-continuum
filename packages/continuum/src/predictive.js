/**
 * Predictive defense layer — lightweight statistical next-move estimation.
 * No heavy ML deps; pure Node. Surfaces "threat cones" for the holographic map.
 */

const TRANSITIONS = {
  scanning: { credential: 0.35, lateral: 0.15, engagement: 0.25, trap: 0.2, recon: 0.05 },
  recon: { scanning: 0.3, credential: 0.25, engagement: 0.2, lateral: 0.15, trap: 0.1 },
  credential: { lateral: 0.4, exfil: 0.25, engagement: 0.2, trap: 0.15 },
  lateral: { exfil: 0.35, credential: 0.2, trap: 0.25, engagement: 0.2 },
  engagement: { trap: 0.35, lateral: 0.2, credential: 0.2, exfil: 0.15, scanning: 0.1 },
  trap: { engagement: 0.3, scanning: 0.2, lateral: 0.2, recon: 0.15, exfil: 0.15 },
  exfil: { lateral: 0.3, trap: 0.25, engagement: 0.25, credential: 0.2 },
};

const MORPH_SUGGESTIONS = {
  scanning: 'research',
  recon: 'research',
  credential: 'aggressive',
  lateral: 'aggressive',
  exfil: 'forensic',
  trap: 'forensic',
  engagement: 'aggressive',
};

function classifyFromEvent(e) {
  const blob = `${e.type || ''} ${JSON.stringify(e.detail || {})}`.toLowerCase();
  if (/scan|nmap|masscan|probe|recon/.test(blob)) return 'scanning';
  if (/credential|password|auth|login|dump/.test(blob)) return 'credential';
  if (/lateral|smb|rdp|pivot|winrm/.test(blob)) return 'lateral';
  if (/exfil|download|upload|transfer/.test(blob)) return 'exfil';
  if (/trap|tripwire|tamper|honeypot/.test(blob)) return 'trap';
  if ((e.score || 0) >= 4) return 'engagement';
  return 'recon';
}

/**
 * Estimate probable next TTPs from recent event stream.
 */
export function predictThreatCones(events = [], options = {}) {
  const limit = options.limit || 6;
  const recent = [...events]
    .filter((e) => e.plane !== 'ops' || (e.score || 0) > 0)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 80);

  if (!recent.length) {
    return {
      ok: true,
      cones: [],
      suggestedMorph: 'research',
      summary: 'Insufficient event density for prediction — immune system idle.',
    };
  }

  // Per-IP last TTP
  const byIp = {};
  for (const e of recent) {
    if (!e.ip) continue;
    if (!byIp[e.ip]) byIp[e.ip] = [];
    byIp[e.ip].push({ ttp: classifyFromEvent(e), ts: e.ts, score: e.score || 0, plane: e.plane });
  }

  const cones = [];
  for (const [ip, chain] of Object.entries(byIp)) {
    const last = chain[0];
    const table = TRANSITIONS[last.ttp] || TRANSITIONS.recon;
    const ranked = Object.entries(table)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    for (const [nextTtp, baseP] of ranked) {
      // Boost probability if this IP already showed progression
      const depthBoost = Math.min(0.2, chain.length * 0.03);
      const scoreBoost = Math.min(0.15, (last.score || 0) * 0.02);
      const probability = Math.min(0.95, baseP + depthBoost + scoreBoost);

      cones.push({
        ip,
        fromTtp: last.ttp,
        toTtp: nextTtp,
        probability: Math.round(probability * 100) / 100,
        plane: last.plane,
        lastTs: last.ts,
        suggestedMorph: MORPH_SUGGESTIONS[nextTtp] || 'research',
        preemptiveAction:
          nextTtp === 'lateral' || nextTtp === 'exfil'
            ? 'preemptive-morph-aggressive'
            : nextTtp === 'credential'
              ? 'increase-chaff-rotate'
              : 'heighten-telemetry',
      });
    }
  }

  cones.sort((a, b) => b.probability - a.probability);
  const top = cones.slice(0, limit);

  // Aggregate morph vote
  const morphVotes = {};
  for (const c of top) {
    morphVotes[c.suggestedMorph] = (morphVotes[c.suggestedMorph] || 0) + c.probability;
  }
  const suggestedMorph =
    Object.entries(morphVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'research';

  return {
    ok: true,
    cones: top,
    suggestedMorph,
    summary: top.length
      ? `Highest risk: ${top[0].ip} likely ${top[0].fromTtp} → ${top[0].toTtp} (${Math.round(top[0].probability * 100)}%). Suggest morph: ${suggestedMorph}.`
      : 'No active threat cones.',
  };
}

/**
 * What-if: estimate efficacy delta if morph switched now.
 */
export function simulateMorphWhatIf(currentMorph, targetMorph, events = [], efficacy = {}) {
  const current = efficacy.score || 70;
  const aggression = { stealth: 0.9, research: 1.0, aggressive: 1.12, forensic: 1.05 };
  const recentThreats = events.filter((e) => (e.score || 0) >= 4).length;
  const threatFactor = 1 + Math.min(0.15, recentThreats * 0.01);

  const projected = Math.min(
    99,
    Math.round(current * ((aggression[targetMorph] || 1) / (aggression[currentMorph] || 1)) * threatFactor),
  );

  return {
    ok: true,
    currentMorph,
    targetMorph,
    currentEfficacy: current,
    projectedEfficacy: projected,
    delta: projected - current,
    narrative:
      projected > current
        ? `Switching to ${targetMorph} is projected to improve containment by ~${projected - current} pts under current probe pressure.`
        : projected < current
          ? `Switching to ${targetMorph} may reduce raw containment (${projected - current} pts) but trades for ${targetMorph === 'forensic' ? 'stronger evidence sealing' : 'lower footprint'}.`
          : `Projected efficacy remains stable under ${targetMorph}.`,
    caution: 'Simulation only — defensive estimate, not a guarantee.',
  };
}
