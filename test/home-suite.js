/**
 * Home Shield suite checks
 */
import assert from 'assert';
import { listProfiles, applyProfile, loadHome, updateHomeSettings, isQuietHoursActive, getHomeStatus } from '../packages/hub-api/src/home-shield.js';
import { upsertDevice, listDevices, suggestFromEvents, removeDevice } from '../packages/hub-api/src/device-inventory.js';
import { generateHomeReport } from '../packages/hub-api/src/home-report.js';
import { getProgression } from '../packages/hub-api/src/progression.js';
import { createBackup, restoreBackup, listBackups } from '../packages/hub-api/src/backup-restore.js';
import { sanitizeNotify, saveNotify } from '../packages/hub-api/src/notifications.js';
import { getLanguagePack } from '../packages/hub-api/src/language-pack.js';

function ok(n) {
  console.log(`  ✓ ${n}`);
}

{
  const profiles = listProfiles();
  assert.ok(profiles.length >= 6);
  assert.ok(profiles.find((p) => p.id === 'apartment'));
  ok(`profiles ${profiles.length}`);
}

{
  const r = applyProfile('family', { householdName: 'Test Home', language: 'home' });
  assert.ok(r.ok);
  assert.equal(loadHome().profileId, 'family');
  assert.equal(loadHome().language, 'home');
  assert.ok(r.card?.title);
  ok('apply family profile + shield card');
}

{
  const h = updateHomeSettings({ quietHours: { enabled: true, start: '22:00', end: '07:00' } });
  assert.ok(h.quietHours.enabled);
  // 23:00 should be quiet if enabled
  const night = new Date();
  night.setHours(23, 0, 0, 0);
  assert.equal(isQuietHoursActive(h, night), true);
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  assert.equal(isQuietHoursActive(h, noon), false);
  ok('quiet hours window');
}

{
  const d = upsertDevice({ ip: '192.168.1.50', name: 'Test Phone', kind: 'phone' });
  assert.ok(d.ok);
  assert.ok(listDevices().devices.some((x) => x.ip === '192.168.1.50'));
  removeDevice(d.device.id);
  ok('device trust upsert/remove');
}

{
  const rep = generateHomeReport({ hours: 24, persist: false });
  assert.ok(rep.markdown.includes('Ghost Continuum') || rep.markdown.length > 50);
  assert.ok(rep.stats);
  ok('home report markdown');
  if (rep.html) {
    assert.ok(rep.html.includes('<!DOCTYPE html'), 'home report html');
  }
}

{
  const p = getProgression();
  assert.ok(p.badges.length >= 8);
  assert.ok(typeof p.percent === 'number');
  ok(`progression ${p.earnedCount}/${p.total}`);
}

{
  const b = createBackup({ includeEvents: false });
  assert.ok(b.ok && b.id);
  assert.ok(listBackups().length >= 1);
  const rest = restoreBackup({ id: b.id });
  assert.ok(rest.ok);
  ok('backup + restore');
}

{
  const n = saveNotify({ enabled: false });
  assert.equal(n.enabled, false);
  assert.ok(sanitizeNotify().ok);
  ok('notify settings sanitize');
}

{
  const pack = getLanguagePack('home');
  assert.ok(pack.respond);
  assert.ok(getLanguagePack('expert').efficacy);
  ok('language packs');
}

{
  const st = getHomeStatus();
  assert.ok(st.ok);
  ok('home status aggregate');
}

console.log('\nHome suite checks passed.\n');
