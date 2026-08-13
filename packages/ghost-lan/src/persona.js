import { pickChain, encodeChain } from './crypto/chain.js';
import { scribbleToken } from './topology.js';
import { masqueradeServerHeader } from './ops/masquerade.js';
import { applyMorphFragments } from '../../genome/src/morph.js';
import { getGenomeById, loadPool } from '../../genome/src/pool.js';

const TEMPLATES = {
  'synology-nas': (t, id, variant) => `<!DOCTYPE html><html><head><title>DiskStation</title><style>body{font-family:Arial;background:#1a1a2e;color:#eee;padding:2rem}</style></head><body><h1>◫ DiskStation Manager</h1><p>DS218+ — sign in</p><!-- ghost:${t} --><form><input placeholder="Username"><input type="password" placeholder="Password"></form><small>${id}${variant ? ' · ' + variant : ''}</small></body></html>`,
  'router-admin': (t, id, variant) => `<!DOCTYPE html><html><head><title>Router</title><style>body{font-family:Verdana;background:#0d1117;color:#c9d1d9;padding:2rem}</style></head><body><h1>◎ Router Login</h1><!-- ghost-scribble:${t} --><p>Firmware ${variant || '1.0.4.88'}</p><form><input type="password"></form><small>${id}</small></body></html>`,
  'ip-camera': (t, id) => `<!DOCTYPE html><html><head><title>Camera</title></head><body style="background:#000;color:#0f0;font-family:monospace"><h1>◉ REOLINK</h1><!-- ghost:${t} --><p>/h264Preview_01_main</p><small>${id}</small></body></html>`,
  'plex-server': (t, id) => `<!DOCTYPE html><html><head><title>Plex</title></head><body><h1>▶ Plex</h1><!-- ghost:${t} --><p>Claim server</p><small>${id}</small></body></html>`,
  homeassistant: (t, id) => `<!DOCTYPE html><html><head><title>Home Assistant</title></head><body><h1>⌂ Home Assistant</h1><!-- ghost:${t} --><p>Onboarding</p><small>${id}</small></body></html>`,
};

const VARIANTS = ['1.0.4.88', '1.0.4.92', '2.1.0-rc3', 'fw-2024.03'];

export function polymorphicResponse(state, remoteIp, config = {}, options = {}) {
  const siteSeed = config.siteSeed || 'ghost-lan';
  const chain = pickChain(siteSeed, hashSlot(remoteIp), [], 3);
  const token = scribbleToken(state.buildId, siteSeed);
  const variant = VARIANTS[state.generation % VARIANTS.length];

  const genome = state.activeGenomeId ? getGenomeById(loadPool(), state.activeGenomeId) : null;
  const personaKey = genome?.personality?.archetype || genome?.fragments?.responseTemplate || state.persona;
  const tpl = TEMPLATES[personaKey] || TEMPLATES[state.persona] || TEMPLATES['router-admin'];
  let html = tpl(token, state.buildId, variant);

  const marker = new TextEncoder().encode(`<!-- poly:${remoteIp}:g${state.generation} -->`);
  const scrambled = Buffer.from(encodeChain(marker, chain)).toString('base64');
  const hiddenPath = state.hiddenPath || '';
  html = html.replace(
    '</body>',
    `<span hidden data-ghost="${scrambled}"></span>${hiddenPath ? `<!-- path:${hiddenPath} -->` : ''}</body>`,
  );

  const headers = {
    Server: options.masquerade
      ? masqueradeServerHeader(`${remoteIp}:${state.persona}`)
      : chain.map((c) => c.algorithm).join('/'),
  };

  if (genome) {
    html = applyMorphFragments(html, genome, { generation: state.generation, ip: remoteIp });
  }

  if (!options.hideGhostHeaders) {
    headers['X-Ghost-Build'] = state.buildId;
    headers['X-Ghost-Persona'] = personaKey;
    headers['X-Ghost-Gen'] = String(state.generation);
    if (genome) headers['X-Ghost-Genome'] = genome.id.slice(0, 12);
  }

  return { html, headers, genomeId: genome?.id || null };
}



function hashSlot(ip) {
  let h = 0;
  for (const c of ip) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h;
}