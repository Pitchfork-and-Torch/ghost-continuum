/**
 * Sanitized STIX 2.1 bundle export — defensive intelligence sharing.
 * Strips PII beyond what operators explicitly allow.
 */

export function toStixBundle(events = [], options = {}) {
  const org = options.org || 'ghost-continuum-local';
  const now = new Date().toISOString();

  const indicators = events
    .filter((e) => e.ip && e.score >= 3)
    .slice(0, 200)
    .map((e, i) => ({
      type: 'indicator',
      spec_version: '2.1',
      id: `indicator--${e.id || i}-${e.ts}`,
      created: now,
      modified: now,
      pattern: `[network-traffic:src_ref.type = 'ipv4-addr' AND network-traffic:src_ref.value = '${e.ip}']`,
      pattern_type: 'stix',
      valid_from: now,
      labels: ['deception-engagement', e.plane || 'unknown'],
      description: `DM-Sentinel ${e.type} (score ${e.score}) — sanitized export`,
    }));

  return {
    type: 'bundle',
    id: `bundle--ghost-continuum-${Date.now()}`,
    spec_version: '2.1',
    objects: [
      {
        type: 'identity',
        spec_version: '2.1',
        id: `identity--${org}`,
        name: org,
        identity_class: 'organization',
      },
      ...indicators,
    ],
  };
}