import { toStixBundle } from './stix.js';

/**
 * TAXII 2.1 collection envelope for sanitized deception intelligence.
 */

export function toTaxiiCollection(events = [], options = {}) {
  const bundle = toStixBundle(events, options);
  const collectionId = options.collectionId || 'ghost-continuum-engagements';
  const server = options.taxiiServer || 'https://localhost/taxii2/';

  return {
    spec_version: '2.1',
    type: 'bundle',
    id: bundle.id,
    collection: {
      id: collectionId,
      title: 'DM-Sentinel Deception Engagements',
      description: 'Sanitized defensive deception indicators — no exploit payloads',
      can_read: true,
      can_write: false,
      media_types: ['application/stix+json;version=2.1'],
    },
    objects: bundle.objects,
    meta: {
      server,
      exportedAt: new Date().toISOString(),
      eventCount: events.length,
      sanitized: true,
    },
  };
}

export function taxiiDiscoveryResponse(baseUrl = 'http://127.0.0.1:30000/taxii2/') {
  return {
    title: 'DM-Sentinel TAXII Server',
    description: 'Local-first deception intelligence export',
    api_roots: [`${baseUrl}api/`],
    contact: 'defensive-only',
  };
}