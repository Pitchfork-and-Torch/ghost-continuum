import { classifyProbe } from './classify.js';

const DEFAULT_RULES = [
  { id: 'camera-path', match: { url: /\/camera|\/stream|\/mjpg|h264/i }, persona: 'ip-camera' },
  { id: 'admin-path', match: { url: /\/admin|\/login|\/setup/i }, persona: 'router-admin' },
  { id: 'nas-path', match: { url: /\/webman|\/diskstation|\/syno/i }, persona: 'synology-nas' },
  { id: 'plex-path', match: { url: /\/plex|\/library/i }, persona: 'plex-server' },
  { id: 'ha-path', match: { url: /\/lovelace|homeassistant/i }, persona: 'homeassistant' },
  {
    id: 'scanner-ua',
    match: { ua: /nikto|masscan|zgrab|nmap|httpx|feroxbuster/i },
    persona: 'router-admin',
    mode: 'minimal',
    rotate: true,
  },
  { id: 'shodan', match: { ua: /shodan|censys/i }, persona: 'ip-camera', mode: 'minimal', rotate: true },
];

function matchField(value, pattern) {
  if (!pattern) return true;
  if (pattern instanceof RegExp) return pattern.test(value);
  if (typeof pattern === 'string') return new RegExp(pattern, 'i').test(value);
  return false;
}

export function resolveRules(req, config) {
  const rules = config.rules?.length ? config.rules : DEFAULT_RULES;
  const ua = req.headers['user-agent'] || '';
  const url = req.url || '/';
  const probe = classifyProbe(req);

  for (const rule of rules) {
    const m = rule.match || {};
    if (matchField(url, m.url) && matchField(ua, m.ua) && matchField(probe.class, m.probeClass)) {
      return {
        ruleId: rule.id || 'custom',
        persona: rule.persona || null,
        mode: rule.mode || null,
        rotate: Boolean(rule.rotate),
        status: rule.status || null,
        delayMs: rule.delayMs || 0,
      };
    }
  }
  return { ruleId: null, persona: null, mode: null, rotate: false, status: null, delayMs: 0 };
}

export function timePersona(config) {
  if (!config.timePersonas?.length) return null;
  const hour = new Date().getHours();
  for (const t of config.timePersonas) {
    const inRange =
      t.from <= t.to ? hour >= t.from && hour < t.to : hour >= t.from || hour < t.to;
    if (inRange) return t.persona;
  }
  return null;
}