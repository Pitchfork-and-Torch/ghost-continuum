/**
 * Detect likely analysis / sandbox patterns in request metadata.
 * Defensive morph trigger — increases misdirection, never attacks back.
 */

const SANDBOX_UA = [/headless/i, /phantomjs/i, /selenium/i, /puppeteer/i, /playwright/i, /curl\//i, /wget\//i, /python-requests/i, /go-http-client/i];
const DEBUG_HEADERS = ['x-debug', 'x-forwarded-debug', 'x-sandbox', 'x-automated-test'];

export function analyzeRequest(req = {}, ip = '') {
  const ua = String(req.headers?.['user-agent'] || '');
  const signals = [];

  for (const pat of SANDBOX_UA) {
    if (pat.test(ua)) signals.push({ kind: 'sandbox-ua', match: pat.source });
  }

  for (const h of DEBUG_HEADERS) {
    if (req.headers?.[h]) signals.push({ kind: 'debug-header', header: h });
  }

  if (!ua || ua.length < 10) signals.push({ kind: 'minimal-ua' });
  if (ip === '127.0.0.1' && req.headers?.['x-forwarded-for']) {
    signals.push({ kind: 'proxy-tunnel' });
  }

  const score = signals.length;
  return {
    score,
    signals,
    morphHint: score >= 2 ? 'stealth' : score >= 1 ? 'bare' : 'normal',
    recommendBare: score >= 2,
  };
}