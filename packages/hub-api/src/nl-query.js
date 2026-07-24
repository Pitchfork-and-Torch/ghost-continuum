/**
 * Natural language query over event stream — rule-based + optional LLM enhancement.
 */

const PATTERNS = [
  { re: /credential|dump|mimikatz|secretsdump|lsass|auth chain|failed auth/i, filter: (e) => credentialDumpSignal(e), label: 'credential dumping' },
  { re: /lateral|pivot|smb|rdp|winrm/i, filter: (e) => lateralSignal(e), label: 'lateral movement' },
  { re: /scanner|nmap|masscan|curl|wget|last\s*24h\s*scan|show me.*scan/i, filter: (e) => scannerSignal(e) || /scan/i.test(String(e.type)), label: 'scanning' },
  { re: /anomalous\s*port|port\s*scan/i, filter: (e) => scannerSignal(e) || /port|scan/i.test(JSON.stringify(e.detail || {})), label: 'anomalous ports' },
  { re: /trap|tripwire|c2|beacon/i, filter: (e) => /trap|c2|beacon|tripwire/i.test(String(e.type)), label: 'trap trips' },
  { re: /rotate|morph|genome|champion|chad/i, filter: (e) => /rotate|genome|morph|evol/i.test(String(e.type)), label: 'morph/rotation' },
  { re: /honeypot|interaction|engagement/i, filter: (e) => (e.score || 0) >= 3, label: 'honeypot engagement' },
  { re: /breach|compromis|isolat/i, filter: (e) => /breach|compromis|isolat|lateral/i.test(String(e.type)), label: 'breach / isolation' },
  { re: /best genome|performing best|which genome/i, filter: (e) => /genome|evol/i.test(String(e.type)), label: 'genome performance' },
  { re: /show all|list all|every/i, filter: () => true, label: 'all events' },
];

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

export function parseNlQuery(query = '') {
  const q = String(query).trim();
  for (const p of PATTERNS) {
    if (p.re.test(q)) return { intent: p.label, filter: p.filter };
  }
  return {
    intent: 'keyword search',
    filter: (e) => JSON.stringify(e).toLowerCase().includes(q.toLowerCase().slice(0, 40)),
  };
}

export function runNlQuery(query, events = [], dossiers = []) {
  const { intent, filter } = parseNlQuery(query);
  const matches = events.filter(filter);

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
    matchCount: matches.length,
    uniqueIps: Object.keys(byIp).length,
    events: matches.slice(0, 100),
    attackers: Object.values(byIp).slice(0, 20),
    dossiers: dossierHits.slice(0, 10),
    summary: summarize(intent, matches, byIp),
  };
}

function summarize(intent, matches, byIp) {
  if (!matches.length) return `No interactions matched "${intent}".`;
  const ips = Object.keys(byIp).length;
  const top = matches[0];
  return `Found ${matches.length} event(s) for ${intent} across ${ips} IP(s). Latest: ${top.type} from ${top.ip || 'unknown'} at ${new Date(top.ts).toISOString()}.`;
}