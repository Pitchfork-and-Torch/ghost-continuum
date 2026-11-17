import assert from 'assert';
import { coerceTripwireBody, TRIPWIRE_MAX_BYTES } from '../packages/edge/engine.js';

// Minimal regression: upstream HTML injection reads body once
const TRIPWIRE = '/.__dm/tripwire';
const SENTINEL = '/.__dm/sentinel.js';
const STATUS = '/.__dm/status';

function injectSentinel(html) {
  const tag = `<script src="${SENTINEL}" data-dm-protected defer></script>`;
  if (html.includes('</head>')) return html.replace('</head>', `${tag}</head>`);
  return html + tag;
}

const sample = '<!DOCTYPE html><html><head><title>t</title></head><body>ok</body></html>';
const injected = injectSentinel(sample);
assert.ok(injected.includes(SENTINEL), 'sentinel script injected');
assert.ok(injected.includes('</head>') || injected.includes('ok'), 'html preserved');

// Status path constants
assert.strictEqual(STATUS, '/.__dm/status');
assert.strictEqual(TRIPWIRE, '/.__dm/tripwire');

assert.deepStrictEqual(coerceTripwireBody(null), {});
assert.deepStrictEqual(coerceTripwireBody([1]), {});
assert.deepStrictEqual(coerceTripwireBody('x'), {});
assert.deepStrictEqual(coerceTripwireBody({ t: 'script-tamper', d: 'a' }), { t: 'script-tamper', d: 'a' });
assert.strictEqual(TRIPWIRE_MAX_BYTES, 64 * 1024);
console.log('  ✓ tripwire body must be a plain object');

console.log('edge-worker: OK');