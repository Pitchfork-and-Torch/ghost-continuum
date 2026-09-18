import crypto from 'crypto';

const ZW = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];

/** Invisible per-build watermark for build tracing */
export function scribbleToken(buildId, siteSeed = 'site') {
  const raw = crypto.createHash('sha256').update(`${siteSeed}:${buildId}:scribble`).digest('hex').slice(0, 24);
  return raw;
}

export function scribbleToZeroWidth(token) {
  let out = ZW[0];
  for (const ch of token) {
    const n = parseInt(ch, 16);
    out += ZW[1 + (n % 4)];
    out += ZW[1 + ((n >> 2) % 4)];
  }
  out += ZW[0];
  return out;
}

export function embedScribble(html, buildId, siteSeed = 'site') {
  if (!html.includes('</body>') || html.includes('dm-scribble')) return html;

  const token = scribbleToken(buildId, siteSeed);
  const zw = scribbleToZeroWidth(token);
  const comment = `<!-- dm-scribble:${token} -->`;
  const hidden = `<span data-dm-scribble="${token}" style="position:absolute;left:-9999px;opacity:0;pointer-events:none" aria-hidden="true">${zw}</span>`;

  return html.replace('</body>', `${comment}\n${hidden}\n</body>`);
}

export function decodeScribbleFromHtml(html) {
  const m = html.match(/<!-- dm-scribble:([a-f0-9]+) -->/);
  return m ? m[1] : null;
}