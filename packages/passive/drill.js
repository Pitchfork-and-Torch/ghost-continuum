import { drillHoneypotPath } from '../edge/engine.js';

/** Portable passive drill — works against local edge or deployed worker */
export async function runPassiveDrill(baseUrl, options = {}) {
  const base = baseUrl.replace(/\/$/, '');
  const siteSeed = options.siteSeed || 'ghost-continuum-local';
  const results = [];

  async function step(name, fn) {
    try {
      const r = await fn();
      results.push({ name, ok: true, status: r.status, detail: r.detail });
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
    }
  }

  await step('status-public-safe', async () => {
    const res = await fetch(`${base}/.__dm/status`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const safe = !('paths' in json);
    return { status: res.status, detail: { safe, generation: json.generation, passive: json.passive } };
  });

  await step('home-injection', async () => {
    const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(8000) });
    const html = await res.text();
    const injected =
      html.includes('/.__dm/sentinel.js')
      || html.includes('data-dm-protected')
      || html.includes('gc-deploy-cta')
      || html.includes('gc-ghost-sprite')
      || html.includes('dm-passive-v2')
      || html.includes('dm-passive-injected');
    return {
      status: res.status,
      detail: { injected, siteIntact: res.status === 200, build: res.headers.get('x-dm-build') },
    };
  });

  await step('vault-intact', async () => {
    const res = await fetch(`${base}/vault/`, { signal: AbortSignal.timeout(8000) });
    const html = await res.text();
    return { status: res.status, detail: { ok: res.status === 200, hasVault: /vault/i.test(html) } };
  });

  await step('sentinel', async () => {
    const res = await fetch(`${base}/.__dm/sentinel.js`, { signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    return { status: res.status, detail: { bytes: text.length, gen: res.headers.get('x-dm-gen') } };
  });

  await step('tripwire', async () => {
    const res = await fetch(`${base}/.__dm/tripwire`, {
      method: 'POST',
      body: JSON.stringify({ t: 'drill', ts: Date.now() }),
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const accepted = res.status === 204 || res.status === 200;
    return { status: res.status, detail: accepted ? 'beacon-accepted' : 'unexpected' };
  });

  await step('honeypot-hit', async () => {
    const statusRes = await fetch(`${base}/.__dm/status`, { signal: AbortSignal.timeout(8000) });
    const status = await statusRes.json();
    const seed = status.siteSeed || siteSeed;
    const path = drillHoneypotPath(seed, status.generation || 0);
    const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(8000) });
    return {
      status: res.status,
      detail: { trapped: res.headers.get('x-dm-trap') === '1', path },
    };
  });

  const allOk = results.every((r) => {
    if (!r.ok) return false;
    if (r.name === 'status-public-safe') return r.detail?.safe === true;
    if (r.name === 'home-injection') return r.detail?.injected && r.detail?.siteIntact;
    if (r.name === 'honeypot-hit') return r.detail?.trapped === true;
    if (r.name === 'tripwire') return r.detail === 'beacon-accepted';
    return true;
  });

  return {
    base,
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    allOk,
    results,
  };
}