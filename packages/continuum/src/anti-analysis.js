/**
 * Detect likely analysis / sandbox / packer-lab patterns in request metadata.
 * Defensive morph trigger. Increases misdirection. Never attacks back.
 *
 * Encoded-blob heuristics invert a public class of packer encodings
 * (UUID / MAC / IPv4 lists used as opaque carriers). Thresholds stay high
 * so a single id in a normal URL does not fire.
 */

const SANDBOX_UA = [
  /headless/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /go-http-client/i,
  /\bwine\b/i,
  /cuckoo/i,
  /any\.run/i,
  /tria\.ge/i,
];
const DEBUG_HEADERS = ['x-debug', 'x-forwarded-debug', 'x-sandbox', 'x-automated-test'];
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const MAC_RE = /(?:[0-9a-f]{2}[-:]){5}[0-9a-f]{2}/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const ANTI_EMU_PATH = /\/(?:vmware|vbox|virtualbox|qemu|sandboxie|cuckoo|any\.run|tria\.ge|sysmon|procmon|wireshark)\b/i;
const SIDELOAD_PATH = /\.cpl(?:$|\?)|rundll32|control\.exe/i;

export function encodedBlobHint(url = '') {
  const u = String(url || '');
  const uuids = u.match(UUID_RE) || [];
  if (uuids.length >= 4) return { kind: 'uuid-blob', count: uuids.length };
  const macs = u.match(MAC_RE) || [];
  if (macs.length >= 4) return { kind: 'mac-blob', count: macs.length };
  const ips = u.match(IPV4_RE) || [];
  if (ips.length >= 8) return { kind: 'ipv4-blob', count: ips.length };
  return null;
}

export function isAntiEmuReconPath(url = '') {
  return ANTI_EMU_PATH.test(String(url || '').split('?')[0]);
}

export function isSideloadPath(url = '') {
  return SIDELOAD_PATH.test(String(url || ''));
}

export function analyzeRequest(req = {}, ip = '') {
  const headers = req.headers || {};
  const ua = String(headers['user-agent'] || '');
  const url = String(req.url || '');
  const signals = [];

  for (const pat of SANDBOX_UA) {
    if (pat.test(ua)) signals.push({ kind: 'sandbox-ua', match: pat.source });
  }

  for (const h of DEBUG_HEADERS) {
    if (headers[h]) signals.push({ kind: 'debug-header', header: h });
  }

  if (!ua || ua.length < 10) signals.push({ kind: 'minimal-ua' });
  if (ip === '127.0.0.1' && headers['x-forwarded-for']) {
    signals.push({ kind: 'proxy-tunnel' });
  }

  const accept = headers.accept;
  const lang = headers['accept-language'];
  if (ua && !accept && !lang) {
    signals.push({ kind: 'header-starved' });
  }

  const blob = encodedBlobHint(url);
  if (blob) signals.push(blob);
  if (isAntiEmuReconPath(url)) signals.push({ kind: 'anti-emu-path' });
  if (isSideloadPath(url)) signals.push({ kind: 'sideload-path' });

  const score = signals.length;
  return {
    score,
    signals,
    morphHint: score >= 2 ? 'stealth' : score >= 1 ? 'bare' : 'normal',
    recommendBare: score >= 2,
  };
}