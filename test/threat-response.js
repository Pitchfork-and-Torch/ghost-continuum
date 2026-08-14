/**
 * Threat response playbook unit checks (defensive-only).
 */
import assert from 'assert';
import { assessThreats, threatWatch, executeThreatResponse } from '../packages/hub-api/src/threat-response.js';
import { isDemoEvent } from '../packages/hub-api/src/demo-campaign.js';

function ok(name) {
  console.log(`  ✓ ${name}`);
}

{
  const w = threatWatch();
  assert.ok(w.ok);
  assert.ok(['CLEAR', 'ELEVATED', 'REAL_THREAT'].includes(w.verdict));
  ok(`threatWatch verdict=${w.verdict}`);
}

{
  const a = assessThreats({ hours: 24 });
  assert.ok(a.ok);
  assert.ok(Array.isArray(a.actors));
  assert.ok(Array.isArray(a.recommendedActions));
  assert.ok(a.ethics.includes('Defensive'));
  // Demo events must not count as real actors from synthetic sources alone
  for (const act of a.actors) {
    assert.ok(act.ip);
    assert.ok(act.maxScore >= 6);
  }
  ok(`assessThreats actors=${a.actors.length} live=${a.liveEventCount}`);
}

{
  // CLEAR or real — abort when clear without force
  const r = await executeThreatResponse({
    mode: 'investigate',
    seal: false,
    evolve: false,
    rotateLan: false,
    force: false,
  });
  assert.ok(r.ok);
  if (r.aborted) {
    assert.ok(r.reason);
    ok('executeThreatResponse aborts on CLEAR');
  } else {
    assert.ok(r.assessment);
    assert.ok(r.log?.length);
    ok(`executeThreatResponse ran mode=investigate actions=${(r.actionsTaken || []).join(',')}`);
  }
}

{
  const r = await executeThreatResponse({
    mode: 'contain',
    force: true,
    seal: false,
    evolve: false,
    rotateLan: false,
    morph: 'forensic',
  });
  assert.ok(r.ok);
  assert.equal(r.aborted, false);
  assert.ok(r.actionsTaken?.includes('morph→forensic') || r.morph?.morph?.id === 'forensic');
  assert.ok(r.brief);
  assert.ok(r.externalChecklist?.items?.length);
  ok('forced contain playbook + brief');
}

{
  assert.equal(isDemoEvent({ source: 'demo-campaign' }), true);
  assert.equal(isDemoEvent({ source: 'hub', score: 8 }), false);
  ok('demo filter for threat triage');
}

console.log('\nThreat response checks passed.\n');
