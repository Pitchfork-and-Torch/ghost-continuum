/**
 * Score attacker engagement depth for genetic selection.
 * Higher = more valuable deception (time wasted, intel gathered).
 */

const SIGNAL_WEIGHTS = {
  honeypot_http: 3,
  honeypot_tcp: 2,
  trap_trip: 8,
  breadcrumb: 4,
  staged_redirect: 2,
  returning_visitor: 5,
  command_like: 12,
  lateral_hint: 15,
  credential_probe: 10,
  scanner: 1,
};

export function engagementSignal(event = {}) {
  const type = String(event.type || '').toLowerCase();
  const detail = event.detail || {};

  let base = 1;
  if (type.includes('trap')) base = SIGNAL_WEIGHTS.trap_trip;
  else if (type.includes('honeypot')) base = SIGNAL_WEIGHTS.honeypot_http;
  else if (type.includes('breadcrumb')) base = SIGNAL_WEIGHTS.breadcrumb;
  else if (type.includes('scanner')) base = SIGNAL_WEIGHTS.scanner;

  if (detail.returning) base += SIGNAL_WEIGHTS.returning_visitor;
  if (detail.staged) base += SIGNAL_WEIGHTS.staged_redirect;
  if (detail.lateral) base += SIGNAL_WEIGHTS.lateral_hint;
  if (detail.credential) base += SIGNAL_WEIGHTS.credential_probe;

  const dwellMs = detail.dwellMs || detail.delayMs || 0;
  const depth = detail.depth || (detail.commands?.length ?? 0);

  return {
    base,
    dwellMs,
    depth,
    commands: detail.commands?.length || (detail.commandLike ? 1 : 0),
    lateral: detail.lateral ? 1 : 0,
  };
}

export function applyFitness(genome, signal) {
  const g = structuredClone(genome);
  const f = g.fitness;

  f.engagements += 1;
  f.dwellMs += signal.dwellMs || 0;
  f.commandsDetected += signal.commands || 0;
  f.lateralAttempts += signal.lateral || 0;
  f.depthScore += signal.depth || 0;
  f.lastEngagementAt = Date.now();

  const dwellBonus = Math.min(20, Math.log10(1 + f.dwellMs / 1000) * 4);
  f.score =
    f.engagements * 2 +
    f.commandsDetected * SIGNAL_WEIGHTS.command_like +
    f.lateralAttempts * SIGNAL_WEIGHTS.lateral_hint +
    f.depthScore * 3 +
    dwellBonus;

  return g;
}

export function rankGenomes(genomes) {
  return [...genomes].sort((a, b) => (b.fitness?.score || 0) - (a.fitness?.score || 0));
}