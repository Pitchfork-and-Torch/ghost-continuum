/**
 * End-to-end Ghost Continuum functionality test — edge + local hub + ghost LAN.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const gcConfig = path.join(os.homedir(), '.ghost-continuum', 'config.json');
const legacyConfig = path.join(os.homedir(), '.dm-sentinel', 'config.json');
const configPath = fs.existsSync(gcConfig) ? gcConfig : legacyConfig;
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const HUB = `http://127.0.0.1:${config.hubPort || 30000}`;
const GHOST = `http://127.0.0.1:${config.ghostLanPort || 29999}`;
const TOKEN = config.hubToken || process.env.GC_HUB_TOKEN || process.env.DM_HUB_TOKEN || '';
const auth = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function hub(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...auth, ...(opts.headers || {}) };
  const res = await fetch(`${HUB}${path}`, { ...opts, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { res, json, text };
}

async function ghost(path) {
  const res = await fetch(`${GHOST}${path}`);
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

// --- Edge (production) ---
try {
  const status = await fetch(config.edgeStatusUrl).then((r) => r.json());
  record('edge /.__dm/status', status.ok === true, `gen ${status.generation}, hits ${status.totalHits}`);
} catch (e) {
  record('edge /.__dm/status', false, e.message);
}

try {
  const tw = await fetch(config.tripwireUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: 'functionality-probe', d: { probe: true } }),
  }).then((r) => r.json());
  record('edge /.__dm/tripwire POST', tw.ok === true, `score ${tw.score ?? '—'}`);
} catch (e) {
  record('edge /.__dm/tripwire POST', false, e.message);
}

try {
  const html = await fetch('https://jonbailey.xyz/').then((r) => r.text());
  const deployUrl = html.match(/var U="([^"]+)"/)?.[1];
  record(
    'edge deploy CTA (absolute URL)',
    deployUrl === 'https://ghost.jonbailey.xyz/',
    deployUrl || 'missing',
  );
  record('edge sentinel script inject', html.includes('/.__dm/sentinel.js'), '');
} catch (e) {
  record('edge deploy CTA', false, e.message);
  record('edge sentinel script inject', false, e.message);
}

try {
  const deployPage = await fetch('https://ghost.jonbailey.xyz/');
  record('ghost.jonbailey.xyz site', deployPage.ok, `HTTP ${deployPage.status}`);
} catch (e) {
  record('ghost.jonbailey.xyz site', false, e.message);
}

// --- Local hub reachability ---
let hubUp = false;
try {
  const { res, json } = await hub('/api/status');
  hubUp = res.ok && json.ok;
  record('hub /api/status', hubUp, hubUp ? `${json.armedCount} planes armed` : json._raw || res.status);
} catch (e) {
  record('hub /api/status', false, e.message);
}

if (!hubUp) {
  console.log('\nHub offline — skipping local API tests. Start with: npm start');
} else {
  const { json: cont } = await hub('/api/continuum/status');
  record('hub /api/continuum/status', cont?.ok !== false, `efficacy ${cont?.efficacy?.score ?? cont?.metrics?.deceptionEfficacyScore ?? '—'}`);

  const { json: genome } = await hub('/api/genome/pool');
  record('hub /api/genome/pool', Array.isArray(genome?.pool) || genome?.champion, `pool ${genome?.pool?.length ?? '—'}`);

  const { res: evRes, json: ev } = await hub('/api/genome/evolve', { method: 'POST', body: '{}' });
  record('hub POST /api/genome/evolve', evRes.ok && ev?.ok !== false, ev?.champion?.id || ev?.error || evRes.status);

  const { json: map } = await hub('/api/continuum/map-data');
  record('hub /api/continuum/map-data', Array.isArray(map?.nodes), `nodes ${map?.nodes?.length ?? 0}`);

  const { json: replay } = await hub('/api/continuum/replay', { method: 'POST', body: JSON.stringify({ hours: 24 }) });
  record('hub POST /api/continuum/replay', replay?.branches !== undefined || replay?.timeline, `branches ${replay?.branches?.length ?? replay?.timeline?.branches?.length ?? 0}`);

  const { json: nl } = await hub('/api/continuum/query', { method: 'POST', body: JSON.stringify({ query: 'recent honeypot hits' }) });
  record('hub POST /api/continuum/query', nl?.intent || nl?.summary, nl?.intent || '—');

  const { res: drillRes, json: drill } = await hub('/api/drill/edge', { method: 'POST', body: '{}' });
  record('hub POST /api/drill/edge', drillRes.ok && drill?.ok !== false, drill?.detail || drill?.mode || drillRes.status);

  const { json: plugins } = await hub('/api/plugins');
  record('hub /api/plugins', Array.isArray(plugins?.plugins) || plugins?.ok !== false, `${plugins?.plugins?.length ?? 0} plugins`);

  const { json: stix } = await hub('/api/continuum/stix');
  const stixBundle = stix?.bundle || stix;
  record('hub /api/continuum/stix', stixBundle?.type === 'bundle' || stix?.ok, `${stixBundle?.objects?.length ?? 0} STIX objects`);

  const ledgerRoot = cont?.trust?.ledgerRoot || cont?.ledger?.root;
  record('hub continuum ledger (via status)', !!ledgerRoot && cont?.trust?.ledgerOk !== false, (ledgerRoot || '').slice(0, 16));

  const { res: probeRes, json: probe } = await hub('/api/scope/probe', { method: 'POST', body: JSON.stringify({ probeId: 'lan-self-scan' }) });
  record('hub scope lan-self-scan', probeRes.ok && probe?.ok !== false, probe?.detail?.status || probe?.message || probeRes.status);

  const { res: decRes, json: dec } = await hub('/api/scope/probe', { method: 'POST', body: JSON.stringify({ probeId: 'deception-validate' }) });
  record('hub scope deception-validate', decRes.ok && dec?.ok !== false, dec?.detail?.status || dec?.message || decRes.status);

  const { res: snapRes, json: snap } = await hub('/api/incident/snapshot', { method: 'POST', body: JSON.stringify({ label: 'func-test' }) });
  record('hub POST /api/incident/snapshot', snapRes.ok && snap?.ok !== false, snap?.manifest?.hash?.slice(0, 12) || snapRes.status);

  const { json: features } = await hub('/api/continuum/probe');
  record('hub /api/continuum/probe', features?.features || features?.planes, Object.keys(features?.features || {}).length + ' features');

  // Auth gate: mutating route without token should 401 when hubToken set
  if (TOKEN) {
    const bare = await fetch(`${HUB}/api/genome/evolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    record('hub auth rejects missing token', bare.status === 401, `HTTP ${bare.status}`);
  }
}

// --- Ghost LAN ---
try {
  const { res, json } = await ghost('/api/status');
  record('ghost-lan /api/status', res.ok && json.persona, json.persona || res.status);
} catch (e) {
  record('ghost-lan /api/status', false, e.message);
}

// --- Doctor CLI ---
import { spawn } from 'child_process';
const doctorOk = await new Promise((resolve) => {
  const proc = spawn(process.execPath, ['bin/ghost-continuum.js', 'doctor'], {
    cwd: REPO_ROOT,
    env: { ...process.env, GC_HUB_TOKEN: TOKEN, DM_HUB_TOKEN: TOKEN },
  });
  let out = '';
  proc.stdout?.on('data', (d) => { out += d; });
  proc.stderr?.on('data', (d) => { out += d; });
  proc.on('close', (code) => resolve({ code, out }));
});
record('npm run doctor', doctorOk.code === 0, doctorOk.code === 0 ? 'all checks' : doctorOk.out.split('\n').slice(-3).join(' '));

// --- Unit tests ---
const unitOk = await new Promise((resolve) => {
  const proc = spawn(process.execPath, ['test/verify.js'], { cwd: REPO_ROOT });
  proc.on('close', (code) => resolve(code === 0));
});
record('unit test/verify.js', unitOk, '');

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${passed}/${results.length} passed ===`);
if (failed.length) {
  console.log('Failed:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}