import crypto from 'crypto';

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function dailySeed(siteSeed, date = new Date()) {
  return `${siteSeed}:${date.toISOString().slice(0, 10)}`;
}

export function derivePorts(siteSeed, generation, count = 5) {
  const seed = dailySeed(siteSeed);
  const ports = new Set();
  let i = 0;
  while (ports.size < count) {
    const h = fnv1a(`${seed}:gen${generation}:port:${i}`);
    ports.add(40000 + (parseInt(h.slice(0, 4), 16) % 20000));
    i++;
  }
  return [...ports];
}

export function buildGenerationId(siteSeed, generation) {
  return crypto
    .createHash('sha256')
    .update(`${dailySeed(siteSeed)}:g${generation}`)
    .digest('hex')
    .slice(0, 16);
}

export function scribbleToken(buildId, siteSeed = 'ghost') {
  return crypto.createHash('sha256').update(`${siteSeed}:${buildId}:scribble`).digest('hex').slice(0, 24);
}

export function dnsChaffHosts(siteSeed, lanIp, count = 8) {
  const templates = ['nas-backup', 'router-admin', 'printer-hp', 'camera-garage', 'plex-local', 'homeassistant', 'synology-disk', 'unifi-controller'];
  return templates.slice(0, count).map((t, i) => ({
    name: `${t}-${fnv1a(`${siteSeed}:dns:${i}`).slice(0, 4)}.lan`,
    ip: lanIp,
  }));
}

export const PERSONA_META = {
  'synology-nas': { label: 'Synology NAS', icon: '◫', tagline: 'DiskStation Manager' },
  'router-admin': { label: 'Router Admin', icon: '◎', tagline: 'NETGEAR Gateway' },
  'ip-camera': { label: 'IP Camera', icon: '◉', tagline: 'Reolink Stream' },
  'plex-server': { label: 'Plex Server', icon: '▶', tagline: 'Media Server' },
  homeassistant: { label: 'Home Assistant', icon: '⌂', tagline: 'Smart Home Hub' },
};