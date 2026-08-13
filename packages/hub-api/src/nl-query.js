/**
 * Natural language query over the event stream.
 * Rule-based, local-only. No cloud LLM required.
 * v3.5: real time windows, IP AND-filter, extra defensive intents.
 */

const PATTERNS = [
  { re: /credential|dump|mimikatz|secretsdump|lsass|auth chain|failed auth/i, filter: (e) => credentialDumpSignal(e), label: 'credential dumping' },
  { re: /lateral|pivot|smb|rdp|winrm/i, filter: (e) => lateralSignal(e), label: 'lateral movement' },
  { re: /scanner|nmap|masscan|curl|wget|scan/i, filter: (e) => scannerSignal(e) || /scan/i.test(String(e.type)), label: 'scanning' },
  { re: /anomalous\s*port|port\s*scan/i, filter: (e) => scannerSignal(e) || /port|scan/i.test(JSON.stringify(e.detail || {})), label: 'anomalous ports' },
  { re: /trap|tripwire|c2|beacon/i, filter: (e) => /trap|c2|beacon|tripwire/i.test(String(e.type)), label: 'trap trips' },
  { re: /rotate|morph|genome|champion|chad/i, filter: (e) => /rotate|genome|morph|evol/i.test(String(e.type)), label: 'morph/rotation' },
  { re: /honeypot|interaction|engagement/i, filter: (e) => (e.score || 0) >= 3, label: 'honeypot engagement' },
  { re: /breach|compromis|isolat/i, filter: (e) => /breach|compromis|isolat|lateral/i.test(String(e.type)), label: 'breach / isolation' },
  { re: /contain|respond|seal threat/i, filter: (e) => /contain|respond|threat|seal/i.test(String(e.type)), label: 'containment / response' },
  { re: /merkle|ledger|forensic|incident|export/i, filter: (e) => /merkle|ledger|incident|export|seal/i.test(String(e.type) + JSON.stringify(e.detail || {})), label: 'forensics / ledger' },
  { re: /quiet hours|kid mode|home shield|household/i, filter: (e) => /home|quiet|kid|shield|device/i.test(String(e.type) + JSON.stringify(e.detail || {})), label: 'home shield' },
  { re: /best genome|performing best|which genome/i, filter: (e) => /genome|evol/i.test(String(e.type)), label: 'genome performance' },
  { re: /show all|list all|every/i, filter: () => true, label: 'all events' },
];

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

function credentialDumpSignal(e) {
  const d = JSON.stringify(e.detail || {}).toLowerCase();
  const t = String(e.type).toLowerCase();
  return /credential|password|dump|auth|login/.test(d + t) || e.detail?.credential;
}

function lateralSignal(e) {
  const d = JSON.stringify(e.detail || {}).toLowerCase();
  return e.detail?.lateral || /smb|rdp|pivot|lateral/.test(d);
}

function scannerSignal(e) {
  const ua = String(e.detail?.ua || e.detail?.userAgent || '').toLowerCase();
  return /scanner|nmap|curl|wget|masscan/.test(ua) || e.detail?.probeClass === 'scanner';
}

export function eventTimestampMs(e, now = Date.now()) {
  const t = e?.ts ?? e?.timestamp ?? e?.at;
  if (typeof t === 'number' && Number.isFinite(t)) {
    return t < 1e12 ? t * 1000 : t;
  }
  if (typeof t === 'string' && t) {
    const n = Date.parse(t);
    if (Number.isFinite(n)) return n;
  }
  return now;
}

export function parseTimeWindow(query = '', now = Date.now()) {
  const q = String(query);
  if (/last\s*hour|past\s*hour|\b1h\b/i.test(q)) {
    return { ms: 60 * 60 * 1000, label: 'last hour', since: now - 60 * 60 * 1000 };
  }
  if (/last\s*7\s*d|last\s*week|\b7d\b/i.test(q)) {
    return { ms: 7 * 86400000, label: 'last 7 days', since: now - 7 * 86400000 };
  }
  if (/last\s*24\s*h|last\s*day|past\s*day|\b24h\b|today/i.test(q)) {
    return { ms: 86400000, label: 'last 24 hours', since: now - 86400000 };
  }
  return { ms: null, label: null, since: null };
}

export function parseIpHint(query = '') {
  const m = String(query).match(IPV4);
  return m ? m[0] : null;
}

export function parseNlQuery(query = '', now = Date.now()) {
  const q = String(query).trim();
  const window = parseTimeWindow(q, now);
  const ip = parseIpHint(q);
  for (const p of PATTERNS) {
    if (p.re.test(q)) {
      return { intent: p.label, filter: p.filter, window, ip };
    }
  }
  const needle = q.replace(IPV4, '').replace(/last\s*(24h|hour|day|week|7d)|today|past\s*day/gi, '').trim();
  return {
    intent: ip && !needle ? 'ip lookup' : 'keyword search',
    filter: needle
      ? (e) => JSON.stringify(e).toLowerCase().includes(needle.toLowerCase().slice(0, 40))
      : () => true,
    window,
    ip,
  };
}

export function runNlQuery(query, events = [], dossiers = [], now = Date.now()) {
  const { intent, filter, window, ip } = parseNlQuery(query, now);
  let matches = events.filter((e) => {
    if (!filter(e)) return false;
    if (ip && String(e.ip || e.detail?.ip || '') !== ip) return false;
    if (window.since != null && eventTimestampMs(e, now) < window.since) return false;
    return true;
  });

  const byIp = {};
  for (const e of matches) {
    if (!e.ip) continue;
    if (!byIp[e.ip]) byIp[e.ip] = { ip: e.ip, events: [], personaResponses: [] };
    byIp[e.ip].events.push(e);
    if (e.detail?.persona) {
      byIp[e.ip].personaResponses.push({
        persona: e.detail.persona,
        mode: e.detail.mode,
        ts: e.ts,
        type: e.type,
      });
    }
  }

  const dossierHits = dossiers.filter((d) => matches.some((m) => m.ip === d.ip));

  return {
    ok: true,
    query,
    intent,
    window: window.label,
    ip,
    matchCount: matches.length,
    uniqueIps: Object.keys(byIp).length,
    events: matches.slice(0, 100),
    attackers: Object.values(byIp).slice(0, 20),
    dossiers: dossierHits.slice(0, 10),
    summary: summarize(intent, matches, byIp, window, ip),
  };
}

function summarize(intent, matches, byIp, window, ip) {
  const scope = [intent, window?.label, ip].filter(Boolean).join(', ');
  if (!matches.length) return `No interactions matched ${scope}.`;
  const ips = Object.keys(byIp).length;
  const top = matches[0];
  return `Found ${matches.length} event(s) for ${scope} across ${ips} IP(s). Latest: ${top.type} from ${top.ip || 'unknown'} at ${new Date(eventTimestampMs(top)).toISOString()}.`;
}
