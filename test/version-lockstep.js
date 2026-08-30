/**
 * Fail if live product surfaces drift off package.json / version.js.
 * Historical CHANGELOG entries may mention older versions; they are not scanned.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { VERSION, CODENAME } from '../packages/core/src/version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const pkg = JSON.parse(read('package.json'));
assert.strictEqual(VERSION, pkg.version, 'packages/core/src/version.js must match package.json version');
assert.ok(CODENAME && CODENAME.length > 2, 'CODENAME must be set');
assert.ok(pkg.description.includes(VERSION), 'package.json description must mention the version');
assert.ok(pkg.description.includes(CODENAME), 'package.json description must mention the codename');
console.log('  ✓ version.js matches package.json', { VERSION, CODENAME });

const mustContainVersion = [
  'packages/hub-ui/public/assets/app.js',
  'packages/hub-ui/public/index.html',
  'packages/hub-ui/public/sw.js',
  'landing/index.html',
  'landing/js/main.js',
  'landing/llms.txt',
  'landing/sitemap.xml',
  'deploy/jonbailey/hub-preview/index.html',
  'deploy/jonbailey/site-seo/llms.txt',
  'deploy/jonbailey/site-seo/sitemap.xml',
  'deploy/jonbailey/PRODUCTION-MANIFEST.json',
  'README.md',
];

for (const rel of mustContainVersion) {
  const text = read(rel);
  assert.ok(text.includes(VERSION), `${rel} must contain ${VERSION}`);
}
console.log('  ✓ live copy files mention', VERSION);

assert.ok(read('packages/hub-api/src/server.js').includes('version: VERSION'), 'hub omega payloads must use imported VERSION');
assert.ok(read('packages/hub-api/src/server.js').includes('codename: CODENAME'), 'hub omega payloads must use imported CODENAME');
assert.ok(read('packages/continuum/src/nexus.js').includes('version: VERSION'), 'continuum status must use imported VERSION');
assert.ok(!/version:\s*'3\.\d+\.\d+'/.test(read('packages/hub-api/src/server.js')), 'server.js must not hardcode a version string');
assert.ok(!/version:\s*'3\.\d+\.\d+'/.test(read('packages/continuum/src/nexus.js')), 'nexus.js must not hardcode a version string');

const startStack = read('bin/start-stack.js');
const ghostCli = read('bin/ghost-continuum.js');
assert.ok(startStack.includes('VERSION, CODENAME') || startStack.includes('{ loadConfig, CONFIG_PATH, VERSION, CODENAME }'), 'start-stack.js must import VERSION');
assert.ok(startStack.includes('v${VERSION}'), 'start-stack banner must interpolate VERSION');
assert.ok(!/CONTINUUM v3\.\d+\.\d+/.test(startStack), 'start-stack banner must not hardcode vX.Y.Z');
assert.ok(ghostCli.includes('VERSION, CODENAME'), 'ghost-continuum.js must import VERSION and CODENAME');
assert.ok(ghostCli.includes('v${VERSION}'), 'ghost-continuum banner must interpolate VERSION');
assert.ok(!/CONTINUUM v3\.\d+\.\d+/.test(ghostCli), 'ghost-continuum banner must not hardcode vX.Y.Z');
assert.ok(ghostCli.includes("cmd === 'version'"), 'ghost-continuum must expose a version command');
console.log('  ✓ Node surfaces import VERSION / CODENAME');

const verOut = spawnSync(process.execPath, [path.join(root, 'bin/ghost-continuum.js'), 'version'], {
  encoding: 'utf8',
});
assert.strictEqual(verOut.status, 0, 'ghost-continuum version must exit 0');
assert.ok((verOut.stdout || '').includes(VERSION), 'ghost-continuum version must print VERSION');
assert.ok((verOut.stdout || '').includes(CODENAME), 'ghost-continuum version must print CODENAME');
console.log('  ✓ ghost-continuum version prints', `${VERSION} ${CODENAME}`);

assert.ok(read('README.md').includes(CODENAME), 'README must mention CODENAME');

const appJs = read('packages/hub-ui/public/assets/app.js');
const appVer = appJs.match(/const VERSION = '(\d+\.\d+\.\d+)'/);
assert.ok(appVer, 'hub-ui app.js must declare const VERSION');
assert.strictEqual(appVer[1], VERSION, 'hub-ui app.js VERSION must match package.json');
const appCode = appJs.match(/const CODENAME = '([^']+)'/);
assert.ok(appCode, 'hub-ui app.js must declare const CODENAME');
assert.strictEqual(appCode[1], CODENAME, 'hub-ui app.js CODENAME must match version.js');

const landingMain = read('landing/js/main.js');
const ds = landingMain.match(/root\.dataset\.version = '(\d+\.\d+\.\d+)'/);
assert.ok(ds, 'landing main.js must set dataset.version');
assert.strictEqual(ds[1], VERSION, 'landing dataset.version must match package.json');

const cardPath = path.join(root, 'landing/share-card.jpg');
assert.ok(fs.existsSync(cardPath), 'landing/share-card.jpg must exist');
const cardHead = fs.readFileSync(cardPath).subarray(0, 3);
assert.ok(cardHead[0] === 0xff && cardHead[1] === 0xd8 && cardHead[2] === 0xff, 'share-card.jpg must be a JPEG');

const seoUnix = read('scripts/post-deploy-seo.sh');
const seoWin = read('scripts/post-deploy-seo.ps1');
const seoHelper = read('scripts/lib/seo-safe-url.js');
assert.ok(seoHelper.includes('ghost.jonbailey.xyz'), 'seo-safe-url must allowlist the apex host');
assert.ok(seoHelper.includes('userinfo not allowed'), 'seo-safe-url must reject URL userinfo');
assert.ok(seoUnix.includes('seo-safe-url.js'), 'unix SEO must sanitize via seo-safe-url');
assert.ok(seoWin.includes('seo-safe-url.js'), 'PowerShell SEO must sanitize via seo-safe-url');
assert.ok(seoUnix.includes('Twitterbot/1.0'), 'unix SEO script must gate Twitterbot Content-Type');
assert.ok(seoUnix.includes('facebookexternalhit/1.1'), 'unix SEO script must gate Facebook Content-Type');
assert.ok(seoUnix.includes("dataset.version = '${EXPECT_VERSION}'"), 'unix SEO script must check live dataset.version');
assert.ok(seoUnix.includes('og:image share-card.jpg'), 'unix SEO script must spot-check og:image share-card.jpg');
assert.ok(seoUnix.includes('twitter:card large'), 'unix SEO script must spot-check twitter:card large');
assert.ok(seoUnix.includes('summary_large_image'), 'unix SEO script must require summary_large_image');
assert.ok(seoWin.includes('og:image share-card.jpg'), 'PowerShell SEO script must spot-check og:image share-card.jpg');
assert.ok(seoWin.includes('twitter:card large'), 'PowerShell SEO script must spot-check twitter:card large');
assert.ok(seoWin.includes('summary_large_image'), 'PowerShell SEO script must require summary_large_image');
assert.ok(!seoWin.includes("p = 'Crystal Membrane'"), 'PowerShell SEO script must not require Crystal Membrane');
assert.ok(!seoWin.includes('/* keep default */'), 'PowerShell catch must not use JavaScript comments');
assert.ok(seoWin.includes('ghost-continuum.pages.dev') || seoWin.includes('alias'), 'PowerShell SEO must fall back to Pages alias');
assert.ok(seoWin.includes('cf-mitigated') || seoWin.includes('challenge-platform'), 'PowerShell SEO must detect apex challenge HTML');
assert.ok(seoUnix.includes('WARN: apex HTML'), 'unix SEO must warn when content is verified only via Pages');
assert.ok(seoWin.includes('WARN: apex HTML'), 'PowerShell SEO must warn when content is verified only via Pages');
assert.ok(seoWin.includes('dataset.version'), 'PowerShell SEO must check live dataset.version');
assert.ok(seoUnix.includes('-- '), 'unix curl must pass -- before URLs');
assert.ok(seoWin.includes('curl.exe') && seoWin.includes('@CurlSafe --'), 'PowerShell curl must pass -- before URLs');
assert.ok(seoUnix.includes('card "$BASE"'), 'unix card CLI must pass origin before optional card URL');
assert.ok(seoWin.includes('Invoke-SeoSafe card $Base'), 'PowerShell card CLI must pass origin before optional card URL');
assert.ok(seoUnix.includes('apex card missed'), 'unix tweet-card must fall back to Pages alias');
assert.ok(seoWin.includes('apex card missed'), 'PowerShell tweet-card must fall back to Pages alias');
assert.ok(seoUnix.includes('head-fail'), 'unix HEAD policy must use the shared helper');
assert.ok(seoWin.includes('head-fail'), 'PowerShell HEAD policy must use the shared helper');
assert.ok(seoWin.includes('ghost-continuum-seo/1.0'), 'PowerShell SEO must send the Unix SEO user-agent');
assert.ok(seoUnix.includes('ghost-continuum-seo/1.0'), 'unix SEO must send the shared user-agent');
assert.ok(!/EXPECT_VERSION:-3\.\d+\.\d+/.test(seoUnix), 'unix must not hardcode a default version');
assert.ok(seoWin.includes('Invoke-SeoSafe origin') || seoWin.includes('origin'), 'PowerShell SEO must honor SEO_BASE via the helper');
assert.ok(seoUnix.includes('indexnow') && seoUnix.includes('"$KEY"'), 'unix IndexNow payload must come from the helper');
assert.ok(seoWin.includes('indexnow') && seoWin.includes('$Key'), 'PowerShell IndexNow payload must come from the helper');
assert.ok(seoWin.includes('$fail++'), 'PowerShell IndexNow errors must increment $fail');
assert.ok(!seoUnix.includes('keyLocation:`${base}/${key}.txt`'), 'unix IndexNow must not interpolate unsanitized BASE');
const deployUnix = read('scripts/deploy-site.sh');
assert.ok(deployUnix.includes('ffd8ff'), 'deploy-site.sh must JPEG-gate share-card.jpg');
console.log('  ✓ tweet-card JPEG + SEO sanitizer / lockstep gates');

const cacheBustFiles = [
  'packages/hub-ui/public/index.html',
  'packages/hub-ui/public/sw.js',
  'landing/index.html',
  'deploy/jonbailey/hub-preview/index.html',
];
const qv = /\?v=(\d+\.\d+\.\d+)/g;
for (const rel of cacheBustFiles) {
  const text = read(rel);
  const found = [...text.matchAll(qv)].map((m) => m[1]);
  assert.ok(found.length > 0, `${rel} should cache-bust with ?v=`);
  for (const ver of found) {
    assert.strictEqual(ver, VERSION, `${rel} cache-bust ?v=${ver} must be ${VERSION}`);
  }
}

const sw = read('packages/hub-ui/public/sw.js');
assert.ok(sw.includes(`gc-nexus-v${VERSION}-shell`), 'service worker cache name must include VERSION');
console.log('  ✓ PWA / landing cache-busts match', VERSION);

const changelog = read('CHANGELOG.md');
assert.ok(changelog.includes(`## [${VERSION}]`), `CHANGELOG.md must have ## [${VERSION}] as the current section`);
assert.ok(read('release-notes.md').includes(VERSION), 'release-notes.md must mention VERSION');
assert.ok(read('docs/RELEASING.md').includes('Always'), 'RELEASING.md must keep the always-lockstep rule');
console.log('  ✓ changelog + release notes mention', VERSION);

const manifest = JSON.parse(read('deploy/jonbailey/PRODUCTION-MANIFEST.json'));
assert.strictEqual(manifest.version, VERSION, 'PRODUCTION-MANIFEST.json version');
assert.strictEqual(manifest.codename, CODENAME, 'PRODUCTION-MANIFEST.json codename');
console.log('  ✓ production manifest lockstep');

const gitignore = read('.gitignore');
assert.ok(gitignore.includes('.orbit/'), '.gitignore must ignore Orbit COOK receipts');
console.log('  ✓ .orbit/ receipts stay uncommitted');

console.log('\nVersion lockstep passed.\n');
