import { loadEchoWorld, advanceEchoWorld, saveEchoWorld, echoContextForIp } from './echo.js';
import { touchPhantom, loadPhantom } from './phantom.js';
import { converse } from './llm.js';

export function narrativeWeave(config, ip, interaction = {}) {
  const worldId = config?.continuum?.narrative?.worldId || 'default';
  let world = loadEchoWorld(worldId);

  const phantom = loadPhantom(ip);
  if (phantom && Date.now() - phantom.lastSeen > 3600000) {
    const hoursAway = Math.floor((Date.now() - phantom.lastSeen) / 3600000);
    world = advanceEchoWorld(world, Math.min(hoursAway, 168));
    saveEchoWorld(world);
  }

  touchPhantom(ip, {
    type: interaction.type,
    detail: interaction.detail,
    persona: interaction.persona,
    trustDelta: interaction.returning ? 1 : 0,
  });

  return {
    echo: echoContextForIp(world, ip),
    phantom: loadPhantom(ip),
    enabled: config?.continuum?.narrative?.enabled === true,
  };
}

export async function narrativeReply(config, ip, prompt, context = {}) {
  const weave = narrativeWeave(config, ip, context);
  const reply = await converse(config, prompt, {
    ...context,
    loreSeed: weave.echo.loreSeed,
    returning: (weave.phantom?.visits || 0) > 1,
  });
  return { ...reply, weave };
}