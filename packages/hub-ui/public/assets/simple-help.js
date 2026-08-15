/**
 * Simple Help - clean glass popups for buttons (plain language).
 * On by default. Toggle: localStorage gc-simple-help = "0" | "1"
 */

const STORAGE_KEY = 'gc-simple-help';

/** @type {Record<string, string>} */
const HELP_BY_ID = {
 btnLive: 'Switch the map to real events only. Clears demo/cinematic fabric.',
 btnDemo: 'Run a safe practice scenario on the map. Not real threats.',
 btnRespond: 'Run the defensive playbook for real high-score threats (contain and seal).',
 btnPauseOrbit: 'Pause or resume the map slowly rotating.',
 btnFocusThreat: 'Zoom the map camera toward the strongest threat path.',
 btnResetCam: 'Reset the map camera to the default overview angle.',
 btnToggleShells: 'Show or hide the protective sensor-plane rings around the map.',
 btnPhylo: 'Show a quick summary of genome family tree (phylogeny) stats.',
 btnMapExpand: 'Pin the map large (full center panel). Click again to compress. Hover also expands temporarily.',
 btnEvolve: 'Train the decoy pool with NSGA-II evolution. Picks stronger personalities.',
 btnEvolveGenomeView: 'Train the decoy pool with NSGA-II evolution. Picks stronger personalities.',
 btnNlQuery: 'Search your local event history with plain words. Nothing leaves this PC.',
 btnVoice: 'Talk instead of typing. Uses Ghost Voice on this machine only.',
 btnThreatAssess: 'Score recent events and decide if anything real needs attention.',
 btnThreatContain: 'Apply a lighter defensive response (contain) without a full playbook.',
 btnThreatFull: 'Run the full defensive response for confirmed real threats.',
 btnSnapshot: 'Seal a forensic incident bundle with integrity (Merkle) for later review.',
 btnSnapshotForensics: 'Seal a forensic incident bundle with integrity (Merkle) for later review.',
 btnRotate: 'Change the Ghost LAN persona so honeypots look like a different device.',
 btnMaximize: 'Push containment efficacy toward the target with safe maximizer steps.',
 btnWhatIf: 'Simulate "what if we responded more aggressively" without real offensive actions.',
 btnWhatIfForensics: 'Simulate a stronger defensive branch on the timeline (what-if).',
 btnWizard: 'Open the Home Shield setup wizard for household protection.',
 btnWizardHomeView: 'Open the Home Shield setup wizard for household protection.',
 btnHomeSettings: 'Open home settings (kid mode, quiet hours, alerts, accessibility).',
 btnHomeSettingsView: 'Open home settings (kid mode, quiet hours, alerts, accessibility).',
 btnHomeReport: 'Build a weekly household immune report you can read offline.',
 btnHomeReportView: 'Build a weekly household immune report you can read offline.',
 btnHomeBackup: 'Back up local Home Shield settings and data on this PC.',
 btnHomeBackupView: 'Back up local Home Shield settings and data on this PC.',
 btnAddDevice: 'Trust a household device by IP/name so the shield knows it is yours.',
 btnGlRotate: 'Morph the Ghost LAN honeypot persona (looks like a different LAN device).',
 btnGlRefresh: 'Refresh Ghost LAN status, ports, dossiers, and event stream now.',
 tmBranch: 'Save a branch simulation of the forensic timeline for comparison.',
 tmExport: 'Export a sealed forensic replay bundle of the current timeline window.',
 tmWhatIf: 'Run a what-if branch using a more aggressive defensive posture (still defensive only).',
 tmPlay: 'Play or pause scrubbing through forensic time.',
 tmBack: 'Step the forensic scrubber backward.',
 tmFwd: 'Step the forensic scrubber forward.',
 niSave: 'Save your custom name, shape, and notes for this map node (local only).',
 niReset: 'Clear custom node metadata and restore defaults.',
 niClose: 'Close the node details panel.',
 trustBannerClose: 'Hide this privacy reminder for now.',
 btnSimpleHelpToggle: 'Turn these simple help tips on or off.',
 operatorPanel: 'Open X and follow @suddenlyjon - the operator behind Ghost Continuum.',
};

/** @type {Record<string, string>} */
const HELP_BY_VIEW = {
 overview: 'Main cockpit: map, decoys, protection layers, and live ops.',
 'ghost-lan': 'Ghost LAN honeypots and probe events for your local network.',
 genome: 'Evolve and review the best decoy personalities.',
 forensics: 'Scrub time, seal incidents, and check integrity.',
 home: 'Household shield: devices, hygiene, wizard, and reports.',
};

function isEnabled() {
 const v = localStorage.getItem(STORAGE_KEY);
 if (v === null || v === undefined || v === '') return true;
 return v !== '0' && v !== 'false' && v !== 'off';
}

function setEnabled(on) {
 localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
 document.body.classList.toggle('simple-help-off', !on);
 const btn = document.getElementById('btnSimpleHelpToggle');
 if (btn) {
 btn.setAttribute('aria-pressed', on ? 'true' : 'false');
 btn.textContent = on ? 'TIPS ON' : 'TIPS OFF';
 btn.title = on
 ? 'Simple help tips are on. Click to turn off.'
 : 'Simple help tips are off. Click to turn on.';
 }
}

function resolveHelp(el) {
 if (!el || el.nodeType !== 1) return '';
 const explicit = el.getAttribute('data-help');
 if (explicit) return explicit.trim();
 if (el.id && HELP_BY_ID[el.id]) return HELP_BY_ID[el.id];
 if (el.dataset && el.dataset.view && HELP_BY_VIEW[el.dataset.view]) {
 return HELP_BY_VIEW[el.dataset.view];
 }
 if (el.dataset && el.dataset.morph) {
 const m = el.dataset.morph;
 const map = {
 stealth: 'Stealth mode: quieter fabric, softer responses, lower profile.',
 research: 'Research mode: balanced default for watching and learning.',
 aggressive: 'Aggressive defense posture (still defensive only - no offensive actions).',
 forensic: 'Forensic mode: preserve evidence and emphasize integrity seals.',
 };
 return map[m] || '';
 }
 if (el.classList && el.classList.contains('hint') && el.dataset.q) {
 return `Fill the query box with: "${el.dataset.q}" and search local events.`;
 }
 // Walk up a little for labeled controls
 let n = el.parentElement;
 for (let i = 0; i < 3 && n; i++) {
 if (n.id && HELP_BY_ID[n.id]) return HELP_BY_ID[n.id];
 const dh = n.getAttribute && n.getAttribute('data-help');
 if (dh) return dh.trim();
 n = n.parentElement;
 }
 return '';
}

function ensureTipEl() {
 let tip = document.getElementById('simpleHelpTip');
 if (tip) return tip;
 tip = document.createElement('div');
 tip.id = 'simpleHelpTip';
 tip.className = 'simple-help-tip';
 tip.setAttribute('role', 'tooltip');
 tip.hidden = true;
 document.body.appendChild(tip);
 return tip;
}

/**
 * @param {{ toast?: (s:string)=>void }} [opts]
 */
export function createSimpleHelp(opts = {}) {
 const tip = ensureTipEl();
 let active = null;
 let hideTimer = null;

 function hide() {
 tip.hidden = true;
 tip.classList.remove('visible');
 active = null;
 }

 function showFor(el, text) {
 if (!isEnabled() || !text) {
 hide();
 return;
 }
 active = el;
 tip.textContent = text;
 tip.hidden = false;
 tip.classList.add('visible');
 position(el);
 }

 function position(el) {
 const r = el.getBoundingClientRect();
 const pad = 10;
 const tw = tip.offsetWidth || 240;
 const th = tip.offsetHeight || 64;
 let left = r.left + r.width / 2 - tw / 2;
 let top = r.bottom + 8;
 // Prefer below; flip above if near bottom
 if (top + th > window.innerHeight - pad) {
 top = r.top - th - 8;
 }
 left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
 top = Math.max(pad, Math.min(top, window.innerHeight - th - pad));
 tip.style.left = `${Math.round(left)}px`;
 tip.style.top = `${Math.round(top)}px`;
 }

 function onOver(e) {
 if (!isEnabled()) return;
 const t = e.target;
 if (!(t instanceof Element)) return;
 const el = t.closest(
 'button, a.nx-btn, a.nx-linkish, .morph-btn, .hint, .nx-tab, [data-help], .operator-chip, .plane-switch',
 );
 if (!el || el.disabled) return;
 // skip pure chrome without help
 const text = resolveHelp(el);
 if (!text) return;
 if (hideTimer) {
 clearTimeout(hideTimer);
 hideTimer = null;
 }
 showFor(el, text);
 }

 function onOut(e) {
 const t = e.target;
 if (!(t instanceof Element)) return;
 const el = t.closest(
 'button, a.nx-btn, a.nx-linkish, .morph-btn, .hint, .nx-tab, [data-help], .operator-chip, .plane-switch',
 );
 if (!el || el !== active) return;
 hideTimer = setTimeout(() => hide(), 80);
 }

 function onMove() {
 if (active && !tip.hidden) position(active);
 }

 document.addEventListener('pointerover', onOver, true);
 document.addEventListener('pointerout', onOut, true);
 document.addEventListener('scroll', () => hide(), true);
 window.addEventListener('resize', () => hide());

 const toggle = document.getElementById('btnSimpleHelpToggle');
 toggle?.addEventListener('click', () => {
 const next = !isEnabled();
 setEnabled(next);
 opts.toast?.(next ? 'Simple help tips on' : 'Simple help tips off');
 if (!next) hide();
 });

 setEnabled(isEnabled());

 return {
 isEnabled,
 setEnabled,
 hide,
 resolveHelp,
 };
}
