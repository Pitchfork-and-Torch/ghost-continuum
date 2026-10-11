/**
 * Sanitize maintainer-only SEO env URLs (not CI, not product runtime).
 * https + allowlisted host + no userinfo. Fail closed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const DEFAULT_BASE = 'https://ghost.jonbailey.xyz';
export const DEFAULT_ALIAS = 'https://ghost-continuum.pages.dev';
export const ALLOWED_HOSTS = Object.freeze([
  'ghost.jonbailey.xyz',
  'ghost-continuum.pages.dev',
]);

export const ASSET_PATHS = Object.freeze([
  '/',
  '/hub/',
  '/llms.txt',
  '/sitemap.xml',
  '/robots.txt',
  '/og-card.png',
  '/og-card.jpg',
  '/og-card-v3.png',
  '/og-card-v3.jpg',
  '/share-card.png',
  '/share-card.jpg',
  '/infographic.svg',
  '/hub/command-nexus.png',
]);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function parseHttpsAllowlisted(raw, label = 'url') {
  if (raw == null) throw new Error(`${label}: missing`);
  const s = String(raw).trim();
  if (!s) throw new Error(`${label}: empty`);
  if (/[\r\n\x00]/.test(s)) throw new Error(`${label}: control characters`);
  if (s.startsWith('-')) throw new Error(`${label}: looks like a flag`);
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`${label}: not a URL`);
  }
  if (u.protocol !== 'https:') throw new Error(`${label}: https required`);
  if (u.username !== '' || u.password !== '') throw new Error(`${label}: userinfo not allowed`);
  if (u.port !== '') throw new Error(`${label}: custom port not allowed`);
  const host = u.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.includes(host)) throw new Error(`${label}: host not allowlisted`);
  return u;
}

export function sanitizeOrigin(raw, label = 'SEO_BASE') {
  const fallback = label === 'SEO_CONTENT_ALIAS' ? DEFAULT_ALIAS : DEFAULT_BASE;
  const src = raw == null || String(raw).trim() === '' ? fallback : raw;
  const u = parseHttpsAllowlisted(src, label);
  if (u.pathname && u.pathname !== '/') {
    throw new Error(`${label}: origin must not include a path`);
  }
  if (u.search) throw new Error(`${label}: origin must not include a query`);
  if (u.hash) throw new Error(`${label}: origin must not include a hash`);
  return `https://${u.hostname}`;
}

export function sanitizeFetchUrl(raw, label = 'url') {
  const u = parseHttpsAllowlisted(raw, label);
  const pathName = u.pathname || '/';
  return `https://${u.hostname}${pathName}${u.search}`;
}

export function urlsForOrigin(origin) {
  const base = sanitizeOrigin(origin, 'SEO_BASE');
  return ASSET_PATHS.map((p) => `${base}${p}`);
}

export function cardUrl(raw, origin, version) {
  if (raw != null && String(raw).trim() !== '') {
    const u = parseHttpsAllowlisted(raw, 'SEO_CARD_URL');
    const pathName = u.pathname || '/';
    if (pathName === '/' && !u.search) {
      throw new Error('SEO_CARD_URL: must be a card asset path, not an origin');
    }
    return sanitizeFetchUrl(raw, 'SEO_CARD_URL');
  }
  const base = sanitizeOrigin(origin, 'SEO_BASE');
  const v = String(version || '').trim();
  const q = v ? `?v=${encodeURIComponent(v)}` : '';
  return sanitizeFetchUrl(`${base}/share-card.jpg${q}`, 'SEO_CARD_URL');
}

export function indexNowPayload(origin, key, urls) {
  const k = String(key || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(k)) throw new Error('IndexNow key: expected 32 hex chars');
  const base = sanitizeOrigin(origin, 'SEO_BASE');
  const host = new URL(base).hostname;
  const list = Array.isArray(urls) && urls.length > 0
    ? urls.map((u, i) => sanitizeFetchUrl(u, `urlList[${i}]`))
    : urlsForOrigin(base);
  return {
    host,
    key: k,
    keyLocation: `${base}/${k}.txt`,
    urlList: list,
  };
}

/** Cloudflare apex 403 is expected. 401 / 429 / 404 / 5xx / empty are hard fails. */
export function isHeadHardFail(code) {
  const n = parseInt(String(code ?? '').trim(), 10);
  if (!Number.isFinite(n) || n === 0) return true;
  if (n === 403) return false;
  if (n >= 200 && n < 300) return false;
  return true;
}

export function productMeta(root = ROOT) {
  const file = path.join(root, 'packages', 'core', 'src', 'version.js');
  const text = fs.readFileSync(file, 'utf8');
  const ver = text.match(/VERSION = '([^']+)'/);
  const code = text.match(/CODENAME = '([^']+)'/);
  if (!ver || !code) throw new Error('version.js: VERSION / CODENAME missing');
  return { version: ver[1], codename: code[1] };
}

function die(err) {
  process.stderr.write(String(err.message || err) + '\n');
  process.exit(1);
}

function cli() {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);
  try {
    switch (cmd) {
      case 'origin':
        process.stdout.write(sanitizeOrigin(args[0] || '', 'SEO_BASE'));
        break;
      case 'alias':
        process.stdout.write(sanitizeOrigin(args[0] || '', 'SEO_CONTENT_ALIAS'));
        break;
      case 'url':
        process.stdout.write(sanitizeFetchUrl(args[0], 'url'));
        break;
      case 'card':
        // Required args first so Windows/PowerShell dropping "" cannot shift
        // origin into the card-URL slot: card <origin> <version> [cardUrl]
        process.stdout.write(cardUrl(args[2] || '', args[0] || DEFAULT_BASE, args[1] || ''));
        break;
      case 'urls':
        process.stdout.write(urlsForOrigin(args[0] || DEFAULT_BASE).join('\n') + '\n');
        break;
      case 'indexnow': {
        const dash = args.indexOf('--');
        const origin = args[0];
        const key = args[1];
        const urls = dash >= 0 ? args.slice(dash + 1) : args.slice(2);
        process.stdout.write(JSON.stringify(indexNowPayload(origin, key, urls)));
        break;
      }
      case 'head-fail':
        process.stdout.write(isHeadHardFail(args[0]) ? '1' : '0');
        break;
      case 'version':
        process.stdout.write(productMeta().version);
        break;
      case 'codename':
        process.stdout.write(productMeta().codename);
        break;
      default:
        throw new Error('usage: origin|alias|url|card|urls|indexnow|head-fail|version|codename');
    }
  } catch (err) {
    die(err);
  }
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  cli();
}
