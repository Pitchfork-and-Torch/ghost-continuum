import crypto from 'crypto';

/**
 * Safe runtime morph — declarative fragment transforms only.
 * No eval, no dynamic code execution. Zero external dependencies.
 */

const CSS_VARS = ['--accent', '--bg', '--fg', '--muted', '--border'];

function rng(seed, salt) {
  let h = crypto.createHash('sha256').update(`${seed}:${salt}`).digest();
  return () => {
    h = crypto.createHash('sha256').update(h).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

function scrambleComments(html, seed) {
  const rand = rng(seed, 'comments');
  return html.replace(/<!--[\s\S]*?-->/g, (m) => {
    const noise = crypto.randomBytes(4).toString('hex').slice(0, Math.floor(rand() * 6) + 2);
    return m.replace(/-->/, `:${noise}-->`);
  });
}

function shuffleMeta(html, seed) {
  const rand = rng(seed, 'meta');
  const tags = html.match(/<meta[^>]*>/gi) || [];
  if (tags.length < 2) return html;
  const shuffled = [...tags].sort(() => rand() - 0.5);
  let i = 0;
  return html.replace(/<meta[^>]*>/gi, () => shuffled[i++]);
}

function injectDecoyPaths(html, seed, density = 0.35) {
  const rand = rng(seed, 'paths');
  const paths = ['/api/v1/users', '/admin/config.bak', '/.env.old', '/internal/metrics', '/debug/pprof'];
  const count = Math.max(1, Math.floor(paths.length * density));
  const chosen = paths.sort(() => rand() - 0.5).slice(0, count);
  const block = chosen.map((p) => `<!-- route:${p} -->`).join('');
  return html.replace('</body>', `${block}</body>`);
}

function rotateCssVars(html, seed) {
  const rand = rng(seed, 'css');
  const style = CSS_VARS.map((v) => `${v}: hsl(${Math.floor(rand() * 360)}, 20%, ${15 + Math.floor(rand() * 20)}%)`).join('; ');
  if (html.includes('<style>')) {
    return html.replace(/<style>[^<]*<\/style>/, `<style>:root{${style}}</style>`);
  }
  return html.replace('<head>', `<head><style>:root{${style}}</style>`);
}

function splitHiddenMarkers(html, seed) {
  const rand = rng(seed, 'hidden');
  const parts = crypto.createHash('sha256').update(seed).digest('hex').match(/.{1,8}/g) || [];
  const span = parts.slice(0, 3 + Math.floor(rand() * 3)).map((p) => `<span hidden data-g="${p}"></span>`).join('');
  return html.replace('</body>', `${span}</body>`);
}

const MUTATORS = {
  'scramble-comments': scrambleComments,
  'shuffle-meta': shuffleMeta,
  'inject-decoy-paths': (html, seed, traits) => injectDecoyPaths(html, seed, traits?.breadcrumbDensity ?? 0.35),
  'rotate-css-vars': rotateCssVars,
  'split-hidden-markers': splitHiddenMarkers,
};

export function applyMorphFragments(html, genome, context = {}) {
  const mutation = genome.fragments?.htmlMutation || 'scramble-comments';
  const mutator = MUTATORS[mutation] || scrambleComments;
  const seed = `${genome.id}:${context.generation ?? 0}:${context.ip ?? 'anon'}`;

  let out = mutator(html, seed, genome.traits);

  if (genome.traits.chaffMultiplier > 1.2) {
    out = injectDecoyPaths(out, `${seed}:chaff`, Math.min(1, genome.traits.breadcrumbDensity * genome.traits.chaffMultiplier));
  }

  const verbosity = genome.traits.verbosity ?? 0.5;
  if (verbosity > 0.7) {
    out = out.replace('</small>', ` · gen:${genome.generation} · ${genome.personality.loreSeed}</small>`);
  } else if (verbosity < 0.3) {
    out = out.replace(/<small>[\s\S]*?<\/small>/, '');
  }

  return out;
}

export function morphDelayMs(genome, baseDelay = 0) {
  const bias = genome.traits?.delayBias ?? 0;
  const jitter = (genome.traits?.masqueradeStrength ?? 0.5) * 400;
  return Math.floor(baseDelay + bias * 0.3 + jitter * Math.random());
}

export function listMutators() {
  return Object.keys(MUTATORS);
}