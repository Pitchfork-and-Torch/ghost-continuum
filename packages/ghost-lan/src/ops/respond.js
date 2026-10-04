import { polymorphicResponse } from '../persona.js';
import { resolveRules, timePersona } from './rules.js';
import { classifyProbe, responseMode } from './classify.js';
import { masqueradeServerHeader } from './masquerade.js';
import { breadcrumbResponse } from './breadcrumbs.js';
import { getDossier } from './dossier.js';
import { scribbleToken } from '../topology.js';

const MINIMAL_HTML = '<!DOCTYPE html><html><head><title>404</title></head><body>Not Found</body></html>';
const BARE_HTML = 'OK';

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function buildHttpResponse(req, ip, state, config) {
  const dossier = getDossier(ip);
  const returning = Boolean(dossier);
  const seenGenerations = [...(dossier?.seenGenerations || []), state.generation].filter(
    (g, i, a) => a.indexOf(g) === i,
  );

  const rules = resolveRules(req, config);
  const timed = timePersona(config);
  const probe = classifyProbe(req);

  let persona = rules.persona || timed || state.persona;
  let mode = rules.mode || responseMode(probe.class);
  if (rules.persona && !rules.mode && (mode === 'bare' || mode === 'standard')) {
    mode = 'full';
  }
  let stale = false;

  const staleGen = dossier?.seenGenerations?.length && !dossier.seenGenerations.includes(state.generation);
  if (staleGen && config.stalePersonaOnMismatch !== false) {
    persona = state.previousPersona || persona;
    stale = true;
    mode = 'bare';
  }

  if (returning && dossier.hits === 1 && config.stagedRedirect !== false) {
    const path = (req.url || '/').split('?')[0];
    if (path === '/' || path === '') {
      return {
        status: 302,
        headers: { Location: '/login', Server: masqueradeServerHeader(`${ip}:${state.buildId}`) },
        body: '',
        meta: { persona, mode, rules, stale, staged: true },
      };
    }
  }

  const crumb = breadcrumbResponse(req.url, state, config);
  if (crumb) {
    return {
      status: crumb.status,
      headers: { Server: masqueradeServerHeader(`${ip}:${req.url}`), 'Content-Type': crumb.contentType },
      body: crumb.body,
      meta: { persona, mode: 'breadcrumb', rules, stale },
    };
  }

  if (mode === 'minimal') {
    return {
      status: rules.status || 404,
      headers: {
        Server: masqueradeServerHeader(`${ip}:min`),
        'Content-Type': 'text/html; charset=utf-8',
      },
      body: MINIMAL_HTML,
      meta: { persona, mode, rules, stale },
    };
  }

  if (mode === 'bare') {
    const token = scribbleToken(state.buildId, config.siteSeed);
    return {
      status: 200,
      headers: { Server: masqueradeServerHeader(`${ip}:bare`), 'Content-Type': 'text/plain' },
      body: stale ? `stale:${token.slice(0, 8)}` : BARE_HTML,
      meta: { persona, mode, rules, stale },
    };
  }

  const { html, headers } = polymorphicResponse(
    { ...state, persona },
    ip,
    config,
    { masquerade: true, hideGhostHeaders: config.hideGhostHeaders !== false },
  );

  return {
    status: rules.status || 200,
    headers: {
      ...headers,
      Server: masqueradeServerHeader(`${ip}:${persona}:${state.generation}`),
    },
    body: html,
    meta: { persona, mode, rules, stale, returning, seenGenerations },
    delayMs: rules.delayMs || (probe.class === 'scanner' ? config.scannerDelayMs || 1500 : 0),
  };
}

export { delay };