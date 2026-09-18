import assert from 'assert';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ALLOWED_HOSTS,
  DEFAULT_ALIAS,
  DEFAULT_BASE,
  cardUrl,
  indexNowPayload,
  isHeadHardFail,
  parseHttpsAllowlisted,
  productMeta,
  sanitizeFetchUrl,
  sanitizeOrigin,
  urlsForOrigin,
} from '../scripts/lib/seo-safe-url.js';
import { VERSION, CODENAME } from '../packages/core/src/version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(root, 'scripts', 'lib', 'seo-safe-url.js');

function cli(args, env = {}) {
  return spawnSync(process.execPath, [helper, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

assert.deepStrictEqual([...ALLOWED_HOSTS], ['ghost.jonbailey.xyz', 'ghost-continuum.pages.dev']);
assert.strictEqual(sanitizeOrigin('', 'SEO_BASE'), DEFAULT_BASE);
assert.strictEqual(sanitizeOrigin('  https://ghost.jonbailey.xyz/  ', 'SEO_BASE'), DEFAULT_BASE);
assert.strictEqual(sanitizeOrigin('', 'SEO_CONTENT_ALIAS'), DEFAULT_ALIAS);
assert.strictEqual(
  sanitizeFetchUrl('https://ghost.jonbailey.xyz/share-card.jpg?v=3.6.4'),
  'https://ghost.jonbailey.xyz/share-card.jpg?v=3.6.4',
);
console.log('  ✓ defaults + allowlisted https origins');

const rejects = [
  ['http://ghost.jonbailey.xyz', 'https required'],
  ['https://user:secret@ghost.jonbailey.xyz', 'userinfo'],
  ['https://127.0.0.1/', 'allowlisted'],
  ['https://169.254.169.254/', 'allowlisted'],
  ['https://example.com/', 'allowlisted'],
  ['-o/tmp/pwn', 'flag'],
  ['https://ghost.jonbailey.xyz:8443/', 'port'],
  ['https://ghost.jonbailey.xyz/hub', 'path'],
];
for (const [raw, needle] of rejects) {
  let err;
  try {
    if (raw.startsWith('https://ghost.jonbailey.xyz/hub')) sanitizeOrigin(raw, 'SEO_BASE');
    else if (raw.startsWith('-') || raw.startsWith('http')) parseHttpsAllowlisted(raw, 'SEO_BASE');
    else parseHttpsAllowlisted(raw, 'SEO_BASE');
  } catch (e) {
    err = e;
  }
  assert.ok(err, `should reject ${raw}`);
  assert.ok(String(err.message).includes(needle) || /allowlisted|https|userinfo|flag|port|path/.test(err.message), `${raw} -> ${err.message}`);
}
assert.throws(() => sanitizeOrigin('https://user:secret@ghost.jonbailey.xyz', 'SEO_BASE'), /userinfo/);
assert.throws(() => sanitizeFetchUrl('https://ghost.jonbailey.xyz@evil.example/'), /allowlisted|not a URL|userinfo/);
console.log('  ✓ reject http, userinfo, loopback, flags, extra path');

const cred = 'https://user:secret@ghost.jonbailey.xyz';
assert.throws(() => indexNowPayload(cred, '7577922ed4d3ec3df303933b78cbd0ee'), /userinfo/);
const payload = indexNowPayload(DEFAULT_BASE, '7577922ed4d3ec3df303933b78cbd0ee');
assert.strictEqual(payload.host, 'ghost.jonbailey.xyz');
assert.strictEqual(payload.keyLocation, 'https://ghost.jonbailey.xyz/7577922ed4d3ec3df303933b78cbd0ee.txt');
assert.ok(!JSON.stringify(payload).includes('user:'));
assert.ok(!JSON.stringify(payload).includes('@ghost'));
assert.ok(payload.urlList.includes('https://ghost.jonbailey.xyz/'));
assert.ok(payload.urlList.includes('https://ghost.jonbailey.xyz/share-card.jpg'));
console.log('  ✓ IndexNow JSON has no userinfo and uses sanitized origin');

assert.strictEqual(cardUrl('', DEFAULT_BASE, '3.6.4'), 'https://ghost.jonbailey.xyz/share-card.jpg?v=3.6.4');
assert.throws(() => cardUrl('-Kevil', DEFAULT_BASE, '1'), /flag|not a URL/);
assert.throws(() => cardUrl('https://evil.example/x.jpg', DEFAULT_BASE, '1'), /allowlisted/);
assert.throws(() => cardUrl(DEFAULT_BASE, DEFAULT_BASE, '3.6.4'), /card asset path/);
console.log('  ✓ tweet-card URL allowlist');

assert.strictEqual(isHeadHardFail(200), false);
assert.strictEqual(isHeadHardFail('403'), false);
assert.strictEqual(isHeadHardFail(401), true);
assert.strictEqual(isHeadHardFail(429), true);
assert.strictEqual(isHeadHardFail(404), true);
assert.strictEqual(isHeadHardFail(500), true);
assert.strictEqual(isHeadHardFail('000'), true);
assert.strictEqual(isHeadHardFail(''), true);
console.log('  ✓ HEAD 403 is expected; 401/429/404/5xx fail');

const meta = productMeta();
assert.strictEqual(meta.version, VERSION);
assert.strictEqual(meta.codename, CODENAME);
console.log('  ✓ productMeta matches version.js');

const okOrigin = cli(['origin', 'https://ghost.jonbailey.xyz']);
assert.strictEqual(okOrigin.status, 0, okOrigin.stderr);
assert.strictEqual(okOrigin.stdout, DEFAULT_BASE);
const bad = cli(['origin', 'https://user:secret@ghost.jonbailey.xyz']);
assert.notStrictEqual(bad.status, 0);
assert.ok((bad.stderr || '').includes('userinfo'), bad.stderr);
const dash = cli(['url', '-o/tmp/x']);
assert.notStrictEqual(dash.status, 0);
const hf401 = cli(['head-fail', '401']);
assert.strictEqual(hf401.status, 0);
assert.strictEqual(hf401.stdout, '1');
const hf403 = cli(['head-fail', '403']);
assert.strictEqual(hf403.stdout, '0');
const defCard = cli(['card', DEFAULT_BASE, '3.6.4']);
assert.strictEqual(defCard.status, 0, defCard.stderr);
assert.strictEqual(defCard.stdout, 'https://ghost.jonbailey.xyz/share-card.jpg?v=3.6.4');
const explicitCard = cli(['card', DEFAULT_BASE, '3.6.4', 'https://ghost-continuum.pages.dev/share-card.jpg?v=3.6.4']);
assert.strictEqual(explicitCard.status, 0, explicitCard.stderr);
assert.strictEqual(explicitCard.stdout, 'https://ghost-continuum.pages.dev/share-card.jpg?v=3.6.4');
const originAsCard = cli(['card', DEFAULT_BASE, '3.6.4', DEFAULT_BASE]);
assert.notStrictEqual(originAsCard.status, 0);
const idx = cli(['indexnow', DEFAULT_BASE, '7577922ed4d3ec3df303933b78cbd0ee', '--', ...urlsForOrigin(DEFAULT_BASE)]);
assert.strictEqual(idx.status, 0, idx.stderr);
const parsed = JSON.parse(idx.stdout);
assert.strictEqual(parsed.host, 'ghost.jonbailey.xyz');
assert.ok(parsed.keyLocation.startsWith('https://ghost.jonbailey.xyz/'));
console.log('  ✓ CLI fail-closed + IndexNow argv after -- + origin-first card');

console.log('\nSEO URL sanitizer passed.\n');
