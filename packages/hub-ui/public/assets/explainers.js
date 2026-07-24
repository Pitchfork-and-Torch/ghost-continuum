import { loadPrefs } from './settings.js';

let panel = null;
let connector = null;
let activeTarget = null;
let hideTimer = null;

const EXPLAINERS = {
  'btn-rotate': {
    icon: '⟳',
    title: 'Rotate LAN Persona',
    does: 'Cycles the Ghost LAN deception genome to a new masquerade identity.',
    matters: 'Polymorphic rotation prevents attackers from fingerprinting your honeypot and keeps engagement fresh.',
    tip: 'Run after high-score engagements to reset attacker assumptions.',
    lore: 'The persona sheds its skin — what was a Synology NAS becomes a router admin panel mid-session.',
  },
  'btn-drill': {
    icon: '◎',
    title: 'Edge Passive Drill',
    does: 'Runs a safe, read-only probe against your configured edge tripwire.',
    matters: 'Validates that edge sensors respond without exposing real infrastructure.',
    tip: 'Use after deploys to confirm your edge worker tripwires are live.',
    lore: 'A ghost packet knocks on the perimeter — only the sentinel answers.',
  },
  'btn-snapshot': {
    icon: '⬡',
    title: 'Export Incident Bundle',
    does: 'Seals status, events, and manifest into a downloadable archive.',
    matters: 'Forensic exports preserve chain-of-custody for IR and red-team debriefs.',
    tip: 'Bundles include SHA-256 manifest hashes from the Merkle ledger.',
    lore: 'The continuum crystallizes a moment in time — immutable, sealed, shareable.',
  },
  'btn-evolve': {
    icon: '🧬',
    title: 'Evolve Genome Pool',
    does: 'Runs one evolution cycle — crossover, mutation, fitness ranking.',
    matters: 'Champion genomes adapt deception traits to what actually traps attackers.',
    tip: 'Evolve after 25+ engagements for meaningful fitness signals.',
    lore: 'Thousands of synthetic personas compete; only the most beguiling survive.',
  },
  'link-ghost': {
    icon: '👻',
    title: 'Ghost LAN Dashboard',
    does: 'Opens the live Ghost LAN honeypot control surface.',
    matters: 'Direct access to persona state, hit counters, and LAN-side traps.',
    lore: 'Step through the veil into the LAN where decoys breathe.',
  },
  'link-scope': {
    icon: '⊕',
    title: 'Scope Panel',
    does: 'Opens the authorized-scope audit and probe console.',
    matters: 'LAN-only recon runs from here — exploit roles blocked at hub.',
    lore: 'The cartographer\'s table — only your territory, only your rules.',
  },
  'efficacy-score': {
    icon: '◈',
    title: 'Live efficacy readout',
    wide: true,
    does: 'A 0–100 live score blending stack readiness (enabled/armed planes + morph) with engagement performance from those planes only. Click for the full breakdown.',
    matters: 'Turn a plane off and the score drops on the next refresh — it reflects your current setup, not a stale all-time high. Maximizer training events are excluded from the live number.',
    network: 'High efficacy means probes and scanners are engaging decoys—not production systems. Readiness shows how much of your stack is armed; performance shows real engagements, trap trips, rotations, and champion fitness.',
    maximize: 'Arm all sensor planes (especially Edge + Ghost LAN). Use Research or Aggressive morph for a small live multiplier. Rotate after deep engagements, evolve the genome pool, and keep extended planes enabled.',
    tip: 'Live line under the score shows readiness %, armed plane count, and raw performance. Toggle planes to watch it move in real time.',
    lore: 'The continuum\'s pulse — every flicker is an intruder choosing the mirage over your real kingdom.',
  },
  'btn-maximize-efficacy': {
    icon: '⬆',
    title: 'Maximize Efficacy',
    does: 'Runs the automated efficacy maximizer: aggressive morph, multi-plane training burst, persona rotations, genome evolution, and edge drill — all locally, in one click.',
    matters: 'Targets a score of 90+ by compounding every factor in the formula (unique engaging IPs, trap trips, rotations, dwell time, champion fitness). Training events are tagged efficacyMaximizer in the feed for audit transparency.',
    network: 'Use after initial setup to prove your deception stack is calibrated — confirms tripwires, personas, and genomes can absorb realistic probe patterns before real adversaries arrive.',
    maximize: 'Already at 90+? The button reports optimal. Otherwise it chains ~4 rotations, 4 evolution cycles, 16+ labeled training engagements across unique IPs, fitness acceleration on the champion, and an edge drill.',
    tip: 'Follow with Evolve periodically to hold gains; switch back to Research morph from the morph panel if you prefer verbose telemetry over trap aggression.',
    lore: 'The sentinel rehearses war so the fiction is battle-ready when the real ghosts come.',
  },
  'morph-label': {
    icon: '◇',
    title: 'Sentinel Morph',
    does: 'Click to cycle morphs: Stealth, Research, Aggressive, Forensic.',
    matters: 'Morphs change logging verbosity, rotation speed, and trap aggression.',
    lore: 'Four faces of the sentinel — whisper, study, ensnare, or preserve.',
  },
  'champion-genome': {
    icon: '★',
    title: 'Champion Genome',
    does: 'Click to open the Genome Visualizer.',
    matters: 'The highest-fitness deception genome currently directing persona responses.',
    lore: 'The apex predator of plausible fiction.',
  },
  'ledger-root': {
    icon: '⛓',
    title: 'Ledger Root',
    does: 'Merkle root of the tamper-evident event ledger.',
    matters: 'Any event mutation breaks the chain — forensic integrity guarantee.',
    lore: 'The unbroken thread binding every lie to truth.',
  },
  'heatmap': {
    icon: '▮',
    title: 'Engagement Heatmap',
    does: 'UTC hourly distribution of deception events.',
    matters: 'Reveals attacker activity rhythms and peak probe windows.',
    lore: 'Thermal ghosts of curiosity across the day.',
  },
  'nl-query': {
    icon: '⌕',
    title: 'NL Intelligence Query',
    does: 'Natural-language filter over your local event stream.',
    matters: 'Ask in plain English — no cloud, no data leaves your machine.',
    tip: 'Try: credential dumping, lateral movement, scanner activity, trap trips, honeypot engagement.',
    lore: 'Speak to the continuum; it answers only from memory.',
  },
  'btn-nl-query': {
    icon: '→',
    title: 'Run Query',
    does: 'Executes the NL query and highlights matches on map + feed.',
    matters: 'Cross-links intelligence across feed, dossiers, and holographic map.',
    lore: 'Intent becomes filter; filter becomes sight.',
  },
  'nexus-map': {
    icon: '◎',
    title: 'Holographic Intrusion Map',
    does: 'Interactive deception canvas — drag to pan, scroll to zoom, minimap for navigation. Every dot is a real event; clusters appear when zoomed out.',
    matters: 'View modes reshape the layout: Timeline (time vs depth), Attack pattern, Plane correlation, Genome fitness, Session flow. Color = plane, shape = TTP, size = engagement.',
    tip: 'Click ? Explain map for a guided tour. Use Map Insights to jump to suspicious clusters. Time Machine and map stay synced — selecting either updates both.',
    lore: 'A constellation of intrusions suspended in deception space.',
  },
  'replay-panel': {
    icon: '⏱',
    title: 'Forensic Time Machine',
    does: 'Branch-aware replay of attacker sessions across morph/rotation forks.',
    matters: 'Understand attacker progression and genome responses over time.',
    tip: 'Click step dots to jump directly; map dots sync here automatically.',
    lore: 'Rewind the lie to see when they first believed it.',
  },
  'rp-prev': {
    icon: '◀',
    title: 'Step Back',
    does: 'Moves one event earlier in the current branch. At the first step, jumps to the previous branch.',
    matters: 'Walk backward through the attacker\'s timeline to see what they did before a trap trip or rotation.',
    tip: 'Pair with the map: select a dot, then step back to see the sequence that led there.',
    lore: 'Turn the hourglass upside down — one grain at a time.',
  },
  'rp-next': {
    icon: '▶',
    title: 'Step Forward',
    does: 'Advances one event later in the current branch. At the last step, moves to the next branch from the start.',
    matters: 'Replay engagement chronologically to spot escalation — scan → credential probe → lateral movement.',
    tip: 'Use after Step Back to compare before/after a persona rotation or genome evolution event.',
    lore: 'Each step forward is another lie they swallowed.',
  },
  'rp-play': {
    icon: '⏵',
    title: 'Auto-Play',
    does: 'Automatically steps forward through the current branch every 700ms until the end.',
    matters: 'Hands-free replay for briefings — watch an entire attacker session unfold without clicking.',
    tip: 'Click again or switch branch to stop; play does not cross into the next branch automatically.',
    lore: 'The timeline unspools itself while you watch.',
  },
  'rp-branch': {
    icon: '⑂',
    title: 'Switch Branch',
    does: 'Jumps to the next timeline branch and resets to step 1. Branches fork at persona rotations and genome evolutions.',
    matters: 'Each branch is an alternate path after the sentinel changed its story — compare how attackers behaved across morphs.',
    tip: 'Cycles through all branches; use after a rotate or evolve event in the feed to inspect the fork point.',
    lore: 'Every rotation splits time — walk the parallel fiction.',
  },
  'feed': {
    icon: '⚡',
    title: 'Tripwire Feed',
    does: 'Live stream of deception events from all armed planes.',
    matters: 'Click any event to highlight its map node and sync replay.',
    lore: 'Every tripwire tremor, recorded.',
  },
  'probes': {
    icon: '⊙',
    title: 'Scope Probes',
    does: 'Authorized LAN/domain recon presets — safe, scoped, logged.',
    matters: 'Generates realistic traffic to validate sensor coverage.',
    lore: 'Controlled echoes to test your own mirrors.',
  },
  'dossiers': {
    icon: '📋',
    title: 'Probe Dossiers',
    does: 'Per-IP engagement summaries from Ghost LAN.',
    matters: 'Track repeat visitors and cumulative hit counts.',
    lore: 'Dossiers of those who could not look away.',
  },
  'story-weaver': {
    icon: '📜',
    title: 'Deception Story Weaver',
    does: 'Generates a narrative summary of the current campaign.',
    matters: 'Turns raw events into briefing-ready prose — locally, instantly.',
    lore: 'The continuum tells its own war story.',
  },
  'map-intel': {
    icon: '◉',
    title: 'Map Intelligence',
    does: 'Auto-detected clusters, plane dominance, and TTP signals.',
    matters: 'Surfaced insights without manual correlation.',
    lore: 'Patterns emerge before you name them.',
  },
  'plane-toggle': {
    icon: '◐',
    title: 'Plane Power',
    does: 'Turns the sensor plane on or off. OFF stops the plane (Ghost LAN process, local Edge server, audit validator, mirage decoys, veil probe, etc.). ON arms it — green = ARMED, amber = STANDBY, red = OFFLINE.',
    matters: 'Power and map visibility are separate. This switch controls whether the plane is actually running.',
    tip: 'STANDBY means enabled but still starting — wait for the next status refresh or toggle once.',
    lore: 'Each plane is a veil you draw across the network — lower it only when you mean to.',
  },
  'plane-map-visibility': {
    icon: '◎',
    title: 'Map Visibility',
    does: 'Shows or hides this plane on the holographic map and legend. Does not start or stop the plane.',
    matters: 'Hide noisy planes to declutter the map while keeping them armed. Legend chips use the same control.',
    tip: 'A hidden plane can still collect events and appear in feeds — only the map layer is toggled.',
  },
};

const PLANE_EXPLAINERS = {
  'ghost-lan': { title: 'Ghost LAN', does: 'LAN honeypot with polymorphic personas.', matters: 'Absorbs interior recon and credential probes.', color: '#7fd962' },
  edge: { title: 'Edge', does: 'Perimeter tripwire on your domain/worker.', matters: 'Catches external scanners and script tamper.', color: '#39bae6' },
  audit: { title: 'Audit', does: 'Authorized-scope validator and probe launcher.', matters: 'Safe recon with exploit blocking.', color: '#c678dd' },
  'narrative-weave': { title: 'Narrative Weave', does: 'LLM-backed conversational deception layer.', matters: 'Feeds convincing fake documents and dialogue.', color: '#ffb454' },
  'phantom-mesh': { title: 'Phantom Mesh', does: 'Federated strategy exchange with peer sentinels.', matters: 'Imports proven deception tactics from the mesh.', color: '#e06c9f' },
  'deep-veil': { title: 'Deep Veil', does: 'Network-level veil probes and sinkholes.', matters: 'Catches lateral movement attempts in depth.', color: '#a78bfa' },
  'mirage-core': { title: 'Mirage Core', does: 'Ephemeral decoy container spawner.', matters: 'High-fitness triggers spawn believable services.', color: '#f07178' },
  'trench-cloak': {
    title: 'Trench Coat',
    does: 'Legal-first multi-hop privacy cloak (Tor / SOCKS). Toggle arms monitor + optional auto-start.',
    matters: 'Other Ghost tools can use the cloak proxy when healthy. Identity: /api/trench/identity',
    color: '#00ff9f',
    tip: 'Site: https://trenchcoat.jonbailey.xyz/ · CLI: trench up --accept-legal · ghost-continuum planes on trench-cloak',
  },
};

function ensureDom() {
  if (panel) return;
  panel = document.createElement('div');
  panel.id = 'explainer-panel';
  panel.className = 'explainer-panel';
  panel.setAttribute('role', 'tooltip');
  panel.hidden = true;
  document.body.appendChild(panel);

  connector = document.createElement('div');
  connector.id = 'explainer-connector';
  connector.className = 'explainer-connector';
  connector.hidden = true;
  document.body.appendChild(connector);
}

function renderContent(key, extra = {}) {
  const base = EXPLAINERS[key] || extra;
  if (!base.title && extra.planeId) {
    const pe = PLANE_EXPLAINERS[extra.planeId] || { title: extra.planeId, does: 'Sensor plane', matters: 'Part of the deception continuum.' };
    Object.assign(base, pe);
  }
  const prefs = loadPrefs();
  const lore = prefs.loreMode && base.lore;

  return `
    <div class="explainer-head">
      <span class="explainer-icon">${base.icon || '◆'}</span>
      <span class="explainer-title">${base.title}</span>
    </div>
    <div class="explainer-section"><span class="explainer-label">What this does</span><p>${base.does || '—'}</p></div>
    <div class="explainer-section"><span class="explainer-label">Why it matters</span><p>${base.matters || '—'}</p></div>
    ${base.network ? `<div class="explainer-section network"><span class="explainer-label">What it means for your network</span><p>${base.network}</p></div>` : ''}
    ${base.maximize ? `<div class="explainer-section maximize"><span class="explainer-label">How to maximize it</span><p>${base.maximize}</p></div>` : ''}
    ${base.tip ? `<div class="explainer-section tip"><span class="explainer-label">Pro tip</span><p>${base.tip}</p></div>` : ''}
    ${lore ? `<div class="explainer-section lore"><span class="explainer-label">Lore</span><p>${base.lore}</p></div>` : ''}
  `;
}

function positionPanel(target) {
  const rect = target.getBoundingClientRect();
  const pw = panel.offsetWidth || 280;
  const ph = panel.offsetHeight || 160;
  let left = rect.right + 12;
  let top = rect.top;
  if (left + pw > window.innerWidth - 8) left = rect.left - pw - 12;
  if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
  if (top < 8) top = 8;
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const px = left < rect.left ? left + pw : left;
  const py = top + 20;
  const angle = Math.atan2(cy - py, cx - px);
  const dist = Math.hypot(cx - px, cy - py);
  connector.style.left = `${px}px`;
  connector.style.top = `${py}px`;
  connector.style.width = `${Math.min(dist, 80)}px`;
  connector.style.transform = `rotate(${angle}rad)`;
}

export function showExplainer(target, key, extra = {}) {
  if (!loadPrefs().explainMode) return;
  ensureDom();
  clearTimeout(hideTimer);
  activeTarget = target;
  target.classList.add('explainer-active');
  panel.innerHTML = renderContent(key, extra);
  panel.classList.toggle('explainer-panel-wide', !!(EXPLAINERS[key]?.wide || extra.wide));
  panel.hidden = false;
  connector.hidden = false;
  requestAnimationFrame(() => positionPanel(target));
}

export function hideExplainer() {
  hideTimer = setTimeout(() => {
    if (panel) panel.hidden = true;
    if (connector) connector.hidden = true;
    if (activeTarget) activeTarget.classList.remove('explainer-active');
    activeTarget = null;
  }, 120);
}

export function bindExplainer(el, key, extra = {}) {
  if (!el) return;
  el.dataset.explainer = key;
  const show = () => showExplainer(el, key, extra);
  el.addEventListener('mouseenter', show);
  el.addEventListener('focus', show);
  el.addEventListener('mouseleave', hideExplainer);
  el.addEventListener('blur', hideExplainer);
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    show();
  }, { passive: false });
}

export function registerExplainers(root = document) {
  Object.keys(EXPLAINERS).forEach((key) => {
    const el = root.getElementById(key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^btn/, 'btn').replace('link-ghost', 'linkGhost').replace('link-scope', 'linkScopePanel').replace('nl-query', 'nlQuery').replace('btn-nl-query', 'btnNlQuery').replace('nexus-map', 'nexusMapWrap').replace('replay-panel', 'replayPanel').replace('efficacy-score', 'efficacyScore').replace('morph-label', 'morphLabel').replace('champion-genome', 'championGenome').replace('ledger-root', 'ledgerRoot').replace('story-weaver', 'storyWeaver').replace('map-intel', 'mapIntel'));
  });
  const map = {
    btnRotate: 'btn-rotate', btnDrill: 'btn-drill', btnSnapshot: 'btn-snapshot', btnEvolve: 'btn-evolve',
    linkGhost: 'link-ghost', linkScopePanel: 'link-scope', efficacyScore: 'efficacy-score', morphLabel: 'morph-label',
    championGenome: 'champion-genome', ledgerRoot: 'ledger-root', heatmap: 'heatmap', nlQuery: 'nl-query',
    btnNlQuery: 'btn-nl-query', nexusMapWrap: 'nexus-map', replayPanel: 'replay-panel', feed: 'feed',
    probes: 'probes', dossiers: 'dossiers', storyWeaver: 'story-weaver', mapIntel: 'map-intel',
  };
  for (const [id, key] of Object.entries(map)) {
    bindExplainer(document.getElementById(id), key);
  }
}

export function planeExplainer(planeId) {
  return PLANE_EXPLAINERS[planeId] || { title: planeId, does: 'Sensor plane', matters: 'Deception surface.' };
}

export { EXPLAINERS, PLANE_EXPLAINERS };