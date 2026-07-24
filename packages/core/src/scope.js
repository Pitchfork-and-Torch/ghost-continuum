/**
 * Authorized-target validation — defensive missions only hit allowlisted scope.
 */

function parseIp(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return parts;
}

function ipInCidr(ip, cidr) {
  const [base, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const ipParts = parseIp(ip);
  const baseParts = parseIp(base);
  if (!ipParts || !baseParts) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const toInt = (p) => ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
  return (toInt(ipParts) & mask) === (toInt(baseParts) & mask);
}

function isPrivateIp(ip) {
  return (
    ipInCidr(ip, '10.0.0.0/8') ||
    ipInCidr(ip, '172.16.0.0/12') ||
    ipInCidr(ip, '192.168.0.0/16') ||
    ip === '127.0.0.1' ||
    ip === '::1'
  );
}

export function normalizeHost(target) {
  if (typeof target === 'string') return target.trim().toLowerCase();
  if (target?.host) return String(target.host).trim().toLowerCase();
  return '';
}

export function isAuthorizedTarget(target, config) {
  const host = normalizeHost(target);
  if (!host) return { ok: false, reason: 'empty target' };

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return { ok: true, reason: 'loopback' };
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIp(host)) return { ok: true, reason: 'private-ip' };
    return { ok: false, reason: 'public-ip-not-allowed-without-explicit-domain-allowlist' };
  }

  const bare = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  const allowed = config.allowedDomains || [];
  if (allowed.some((d) => bare === d || bare.endsWith(`.${d}`))) {
    return { ok: true, reason: 'allowed-domain' };
  }

  return { ok: false, reason: `target not in allowlist: ${bare}` };
}

export function validateMissionTargets(targets, config) {
  const errors = [];
  for (const t of targets) {
    const check = isAuthorizedTarget(t, config);
    if (!check.ok) errors.push({ target: normalizeHost(t), reason: check.reason });
  }
  return { ok: errors.length === 0, errors };
}

export function filterOperators(operators, config) {
  const allowed = new Set(config.defensiveOperators || ['recon', 'scanner', 'analyst']);
  const blocked = new Set(['exploiter', 'infiltrator', 'exfiltrator', 'ghost']);
  return operators.filter((op) => {
    if (config.blockExploitOperators && blocked.has(op)) return false;
    return allowed.has(op);
  });
}