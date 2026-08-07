/**
 * Home vs Expert language pack for Command Nexus UI.
 */

export const PACKS = {
  expert: {
    id: 'expert',
    efficacy: 'Threat efficacy',
    containment: 'Containment',
    morph: 'Sentinel morph mode',
    planes: 'Sensor planes',
    live: 'Live fabric · real events',
    demo: 'Demo fabric · not real threats',
    respond: 'Respond',
    assess: 'Assess',
    seal: 'Seal incident',
    evolve: 'Evolve pool',
    threatClear: 'Live fabric CLEAR — no non-demo high-score events.',
    threatReal: 'REAL THREAT detected on live fabric.',
    chad: 'Chad genome · hall of fame',
    trustBanner: 'Intelligence stays on this machine until you export. Loopback hub. Defensive only.',
    wizardTitle: 'Home Shield setup',
    report: 'Immune report',
  },
  home: {
    id: 'home',
    efficacy: 'How well your decoys are working',
    containment: 'Protected',
    morph: 'Defense style',
    planes: 'Protection layers',
    live: 'Real mode — actual network activity',
    demo: 'Practice mode — fake story, not real danger',
    respond: 'Handle it',
    assess: 'Check it out',
    seal: 'Save proof',
    evolve: 'Teach decoys',
    threatClear: 'All quiet — nothing serious poked your decoys lately.',
    threatReal: 'Something real poked your network defenses.',
    chad: 'Best decoy personalities',
    trustBanner: 'Your data stays on this PC. Nothing is uploaded unless you export it yourself.',
    wizardTitle: 'Protect your home network',
    report: 'Weekly family report',
  },
};

export function getLanguagePack(lang = 'home') {
  return PACKS[lang] === undefined ? PACKS.home : PACKS[lang];
}

/** Map expert map-node jargon to home-friendly phrases */
export function homeNodeLabel(label, state) {
  if (!label) return label;
  if (/COMPROMISED/i.test(label)) return 'Internet door got poked hard';
  if (/SCANNER/i.test(label)) return 'Scanner knocking';
  if (/C2-beacon|beacon/i.test(label)) return 'Suspicious beacon decoy';
  if (/SENTINEL|GUARDIAN/i.test(label)) return 'Your decoy standing guard';
  if (/PROXY/i.test(label)) return 'Edge decoy';
  if (/NEXUS-CORE/i.test(label)) return 'Home shield core';
  if (state === 'breach') return `${label} (serious)`;
  return label;
}

export function homeStateWord(state) {
  const map = {
    protected: 'safe',
    healthy: 'safe',
    threat: 'suspicious',
    breach: 'serious poke',
    compromised: 'serious poke',
    sentinel: 'decoy working',
    guardian: 'guarding',
  };
  return map[state] || state;
}
