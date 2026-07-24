const DEFAULT_TRAPS = [
  /^\/\.env$/i,
  /^\/\.git\/config$/i,
  /^\/wp-admin/i,
  /^\/admin\/config\.bak$/i,
  /^\/api\/v1\/users/i,
  /^\/\.aws\/credentials/i,
  /^\/config\.php\.bak/i,
  /^\/phpmyadmin/i,
];

const silenced = new Map();

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

export function isLoopback(ip) {
  return LOOPBACK.has(ip);
}

export function isTrapPath(url, config) {
  const traps = config.trapPaths?.length ? config.trapPaths : DEFAULT_TRAPS;
  const path = (url || '/').split('?')[0];
  return traps.some((t) => (t instanceof RegExp ? t.test(path) : new RegExp(t, 'i').test(path)));
}

export function silenceIp(ip, ms = 60_000, config = {}) {
  if (config.trapSilenceLocalhost === true || !isLoopback(ip)) {
    silenced.set(ip, Date.now() + ms);
  }
}

export function isSilenced(ip) {
  const until = silenced.get(ip);
  if (!until) return false;
  if (Date.now() > until) {
    silenced.delete(ip);
    return false;
  }
  return true;
}

export function clearSilence(ip) {
  silenced.delete(ip);
}