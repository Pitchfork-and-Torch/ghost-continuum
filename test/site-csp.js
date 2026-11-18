/**
 * Public site CSP and the Pages 404 page.
 * Headers ship from deploy/jonbailey/site-seo/_headers.
 * A top-level 404.html is what turns off Cloudflare Pages SPA fallback.
 */
import assert from 'assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

const headers = read('deploy/jonbailey/site-seo/_headers');
const cspLine = headers
  .split(/\r?\n/)
  .find((line) => line.includes('Content-Security-Policy:'));
assert.ok(cspLine, 'site-seo _headers must set Content-Security-Policy');
const csp = cspLine.split('Content-Security-Policy:')[1].trim();

const directives = Object.fromEntries(
  csp.split(';').map((part) => {
    const bits = part.trim().split(/\s+/);
    return [bits[0], bits.slice(1)];
  }),
);

function has(name, token) {
  return (directives[name] || []).includes(token);
}

assert.deepStrictEqual(directives['default-src'], ["'self'"]);
assert.ok(has('script-src', "'self'"));
assert.ok(has('script-src', 'https://hits.jonbailey.xyz'));
assert.ok(!has('script-src', "'unsafe-inline'"), 'script-src must not allow unsafe-inline');
assert.ok(!has('script-src', "'unsafe-eval'"));
assert.deepStrictEqual(directives['script-src-attr'], ["'none'"]);
assert.ok(has('style-src', "'self'"));
assert.ok(has('style-src', "'unsafe-inline'"), 'style-src unsafe-inline stays for style attributes and style blocks');
assert.deepStrictEqual(directives['font-src'], ["'self'"]);
assert.deepStrictEqual(directives['img-src'], ["'self'", 'data:']);
assert.ok(has('connect-src', "'self'"));
assert.ok(has('connect-src', 'https://hits.jonbailey.xyz'));
assert.deepStrictEqual(directives['object-src'], ["'none'"]);
assert.deepStrictEqual(directives['base-uri'], ["'self'"]);
assert.deepStrictEqual(directives['frame-ancestors'], ["'none'"]);
assert.deepStrictEqual(directives['form-action'], ["'none'"]);
assert.deepStrictEqual(directives['worker-src'], ["'none'"]);
assert.deepStrictEqual(directives['frame-src'], ["'none'"]);

const bannedHosts = [
  'cdn.jsdelivr.net',
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'twitter.com',
  'ads-twitter.com',
  't.co',
  'x.com',
  'cloudflareinsights.com',
];
for (const host of bannedHosts) {
  assert.ok(!csp.includes(host), `CSP must not allow ${host}`);
}

assert.ok(
  headers.includes('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'),
  'site HSTS preload line stays as-is',
);
assert.ok(headers.includes('X-Frame-Options: SAMEORIGIN'));
assert.ok(headers.includes('X-Content-Type-Options: nosniff'));
assert.ok(headers.includes('Referrer-Policy: strict-origin-when-cross-origin'));
assert.ok(headers.includes('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()'));
assert.ok(headers.includes('Cross-Origin-Opener-Policy: same-origin-allow-popups'));

const notFound = read('landing/404.html');
assert.ok(/<title>Not found \| Ghost Continuum<\/title>/.test(notFound));
assert.ok(!/<script/i.test(notFound), '404 page must not include a script');
assert.ok(!/javascript:/i.test(notFound));
assert.ok(!/\son[a-z]+\s*=/i.test(notFound));
assert.ok(/<style[\s>]/i.test(notFound), '404 page keeps its own styles');
assert.ok(notFound.includes('href="/"'));
assert.ok(notFound.includes('href="/hub/"'));

for (const rel of [
  'deploy/jonbailey/scripts/deploy-site.ps1',
  'scripts/deploy-site.sh',
]) {
  const text = read(rel);
  assert.ok(text.includes('404.html'), `${rel} must copy 404.html into the Pages output`);
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(html|js|css)$/i.test(name)) out.push(full);
  }
  return out;
}

const served = [
  ...walk(path.join(root, 'landing'), []),
  path.join(root, 'deploy/jonbailey/hub-preview/index.html'),
];

const handler = /\son[a-z]+\s*=/i;
const jsUrl = /javascript:/i;
const executableScript = /<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json["'])[^>]*>/i;

for (const full of served) {
  const rel = path.relative(root, full);
  const text = readFileSync(full, 'utf8');
  if (full.endsWith('.html')) {
    assert.ok(!handler.test(text), `${rel} has an inline event handler`);
    assert.ok(!executableScript.test(text), `${rel} has an inline executable script`);
  }
  assert.ok(!jsUrl.test(text), `${rel} has a javascript: URL`);
  assert.ok(!/\beval\s*\(/.test(text), `${rel} uses eval`);
  assert.ok(!/new\s+Function\s*\(/.test(text), `${rel} uses new Function`);
  assert.ok(!/ads-twitter\.com|cdn\.jsdelivr\.net|cdn\.tailwindcss\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cloudflareinsights\.com|analytics\.twitter\.com/.test(text), `${rel} still loads a removed host`);
  assert.ok(!/<script[^>]+src=["']https?:\/\/(?:www\.)?(?:x\.com|twitter\.com|t\.co)\b/i.test(text), `${rel} loads a script from x or twitter`);
}

console.log('site-csp: OK');
