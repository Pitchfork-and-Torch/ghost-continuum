import crypto from 'crypto';

const SERVER_POOL = [
  'nginx/1.18.0',
  'nginx/1.24.0',
  'Apache/2.4.41 (Unix)',
  'Apache/2.4.52 (Ubuntu)',
  'lighttpd/1.4.55',
  'thttpd/2.29',
  'Microsoft-IIS/10.0',
  'openresty/1.21.4.1',
];

const TCP_POOL = {
  'synology-nas': ['220 DiskStation FTP ready.\r\n', '220 Synology FTP Server ready.\r\n'],
  'router-admin': ['NETGEAR ReadyNAS\r\n', '220 NETGEAR FTP server ready.\r\n'],
  'ip-camera': ['RTSP/1.0 200 OK\r\n', '500 Internal Server Error\r\n'],
  'plex-server': ['Plex/1.0 DLNA\r\n', 'HTTP/1.0 200 OK\r\n'],
  homeassistant: ['Home Assistant OS 11.4\r\n', 'SSH-2.0-OpenSSH_8.4\r\n'],
};

function pick(seed, pool) {
  const h = crypto.createHash('sha256').update(seed).digest();
  return pool[h[0] % pool.length];
}

export function masqueradeServerHeader(seed) {
  return pick(seed, SERVER_POOL);
}

export function masqueradeTcpBanner(persona, seed, buildId) {
  const pool = TCP_POOL[persona] || [`SSH-2.0-OpenSSH_7.4\r\n`, `SSH-2.0-ghost_${buildId}\r\n`];
  return pick(`${seed}:${persona}`, pool);
}

export function hiddenMarker(siteSeed, generation) {
  const h = crypto.createHash('sha256').update(`${siteSeed}:marker:gen${generation}`).digest('hex');
  return `/.ghost-${h.slice(0, 12)}`;
}