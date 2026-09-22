/**
 * Air-Gap Map: vendored Three.js r160 must load locally. Never a CDN.
 */
import assert from 'assert';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { startHub } from '../packages/hub-api/src/server.js';
import { enrichConfig } from '../packages/core/src/config.js';
import { isPublicUiAssetPath, PUBLIC_UI_PREFIXES } from '../packages/hub-api/src/safe.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function ok(name) {
  console.log(`  ✓ ${name}`);
}

const REMOTE_SCRIPT = /https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh)/i;
const BARE_THREE_IMPORT = /import\s*\(\s*['"]three['"]\s*\)/;

{
  assert.deepStrictEqual(PUBLIC_UI_PREFIXES, ['/assets/', '/vendor/', '/fonts/']);
  assert.equal(isPublicUiAssetPath('/vendor/three.module.js'), true);
  assert.equal(isPublicUiAssetPath('/fonts/fontshare/fonts.css'), true);
  assert.equal(isPublicUiAssetPath('/assets/holo-map.js'), true);
  assert.equal(isPublicUiAssetPath('/vendor/'), false);
  assert.equal(isPublicUiAssetPath('/vendor/../package.json'), false);
  assert.equal(isPublicUiAssetPath('/api/status'), false);
  assert.equal(isPublicUiAssetPath('/index.html'), false);
  ok('public UI path allowlist covers vendor + fonts, rejects traversal');
}

{
  const vendorPath = path.join(root, 'packages/hub-ui/public/vendor/three.module.js');
  assert.ok(fs.existsSync(vendorPath), 'vendored three.module.js must exist');
  const vendorSrc = fs.readFileSync(vendorPath, 'utf8');
  assert.ok(/const REVISION = '160'/.test(vendorSrc.slice(0, 200)), 'vendor REVISION must be 160');
  assert.ok(vendorSrc.includes('export {') && vendorSrc.includes('WebGLRenderer'), 'vendor build must be ESM');
  ok('vendored Three.js is r160 ESM');
}

{
  const html = read('packages/hub-ui/public/index.html');
  assert.ok(html.includes('"three": "/vendor/three.module.js"'), 'import map must point at local vendor');
  assert.ok(!REMOTE_SCRIPT.test(html), 'hub index must not mention a script CDN');
  ok('hub import map is local');
}

{
  const holo = read('packages/hub-ui/public/assets/holo-map.js');
  assert.ok(holo.includes("import('/vendor/three.module.js')"), 'holo-map must import the vendor path');
  assert.ok(!BARE_THREE_IMPORT.test(holo), 'holo-map must not fall back to import(three)');
  assert.ok(!REMOTE_SCRIPT.test(holo), 'holo-map must not load a remote Three.js URL');
  assert.ok(holo.includes('createCanvasFallback'), 'canvas fallback must remain');
  assert.ok(holo.includes('webglUsable'), 'WebGL probe must exist');
  assert.ok(holo.includes("from './holo-canvas-ops.js'"), 'canvas fallback must share camera ops');
  assert.ok(holo.includes('focusThreatCam'), 'canvas fallback must honor focusThreat');
  assert.ok(holo.includes('focusNodeCam'), 'canvas fallback must honor focusNode');
  assert.ok(holo.includes('visibleShells'), 'canvas fallback must draw plane shells');
  assert.ok(holo.includes('beginOrbitDrag'), 'canvas fallback must orbit on pointer drag');
  assert.ok(holo.includes('zoomOrbit'), 'canvas fallback must wheel-zoom');
  assert.ok(holo.includes('idleOrbit'), 'canvas fallback must idle-spin through the shared orbit helper');
  assert.ok(!/focusThreat\(\) \{\s*\}/.test(holo), 'focusThreat must not be a no-op stub');
  ok('holo-map is vendor-only with canvas fallback');
}

{
  const dead = path.join(root, 'packages/hub-ui/public/assets/nexus-3d.js');
  assert.ok(!fs.existsSync(dead), 'dead nexus-3d.js must stay deleted');
  ok('nexus-3d.js is gone');
}

{
  const docs = [
    'docs/OMEGA-v2.md',
    'docs/MIGRATION-v2.md',
    'docs/ROADMAP.md',
    'docs/UPGRADE-PLAN-v2.md',
    'docs/VISUAL-CHANGELOG-3.3-CRYSTAL-NEXUS.md',
  ];
  for (const rel of docs) {
    const text = read(rel);
    assert.ok(!/jsdelivr/i.test(text), `${rel} must not tell operators to use jsdelivr`);
    assert.ok(!/Three\.js CDN \+ canvas fallback/i.test(text), `${rel} must not advertise Three.js CDN as current`);
  }
  assert.ok(read('docs/OMEGA-v2.md').includes('vendored'), 'OMEGA-v2 must call Three.js vendored');
  assert.ok(read('docs/MIGRATION-v2.md').includes('/vendor/three.module.js'), 'MIGRATION-v2 must cite the vendor path');
  ok('docs no longer prescribe a Three.js CDN');
}

{
  const surfaces = [
    'packages/hub-ui/public/index.html',
    'packages/hub-ui/public/assets/holo-map.js',
    'packages/hub-ui/public/assets/app.js',
    'packages/hub-ui/public/sw.js',
    'packages/hub-ui/public/assets/VENDOR.md',
    'packages/hub-ui/public/assets/holo-canvas-ops.js',
    'landing/index.html',
    'apps/nexus-desktop/tauri.conf.json',
    'packages/hub-api/src/server.js',
  ];
  for (const rel of surfaces) {
    const text = read(rel);
    assert.ok(!REMOTE_SCRIPT.test(text), `${rel} must not reference a JS CDN`);
  }
  const landing = read('landing/index.html');
  assert.ok(!/load Three\.js from CDN/i.test(landing), 'landing must not advertise a Three.js CDN');
  const tauri = read('apps/nexus-desktop/tauri.conf.json');
  assert.ok(!/jsdelivr/i.test(tauri), 'Tauri CSP must not allow jsdelivr');
  ok('runtime surfaces stay off jsdelivr/unpkg/cdnjs/esm.sh');
}

function getRaw(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${pathname}`, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          type: String(res.headers['content-type'] || ''),
          body: Buffer.concat(chunks),
        }),
      );
    }).on('error', reject);
  });
}

const hub = await startHub(
  enrichConfig({
    primaryDomain: 'example.com',
    demoMode: true,
    useBuiltinValidator: true,
    hubPort: 30103,
    hubWatchIntervalMs: 0,
  }),
);

try {
  const vendor = await getRaw(hub.port, '/vendor/three.module.js');
  assert.strictEqual(vendor.status, 200, 'hub must serve /vendor/three.module.js');
  assert.ok(vendor.type.includes('javascript'), `vendor Content-Type should be JS, got ${vendor.type}`);
  assert.ok(vendor.body.includes("const REVISION = '160'"), 'served vendor must be r160');

  const fonts = await getRaw(hub.port, '/fonts/fontshare/fonts.css');
  assert.strictEqual(fonts.status, 200, 'hub must serve Fontshare CSS');
  assert.ok(fonts.type.includes('css'), `fonts Content-Type should be CSS, got ${fonts.type}`);

  const woff = await getRaw(hub.port, '/fonts/fontshare/satoshi/woff2/Satoshi-Regular.woff2');
  assert.strictEqual(woff.status, 200, 'hub must serve Fontshare woff2');
  assert.ok(woff.type.includes('woff2') || woff.type.includes('font'), `woff2 type, got ${woff.type}`);

  const assets = await getRaw(hub.port, '/assets/holo-map.js');
  assert.strictEqual(assets.status, 200, '/assets/ must keep working');

  const ops = await getRaw(hub.port, '/assets/holo-canvas-ops.js');
  assert.strictEqual(ops.status, 200, 'hub must serve canvas camera ops');

  const traversal = await getRaw(hub.port, '/vendor/../package.json');
  assert.notStrictEqual(traversal.status, 200, 'vendor path must not traverse');

  const missing = await getRaw(hub.port, '/vendor/nope.js');
  assert.strictEqual(missing.status, 404, 'missing vendor file is 404');

  ok('hub serves vendor Three.js + fonts; traversal stays closed');
} finally {
  hub.server.close();
}

console.log('\nAir-Gap Map checks passed.\n');
