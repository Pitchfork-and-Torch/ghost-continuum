/**
 * Ghost LAN Sentinel - native Command Nexus panel (Membrane / Crystal Nexus).
 * Proxied via hub /api/ghost-lan so operators stay on :30000.
 */

function escapeHtml(s) {
 return String(s ?? '')
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;');
}

function fmtTime(ts) {
 try {
 return new Date(ts).toLocaleTimeString();
 } catch {
 return ' - ';
 }
}

function fmtDetail(ev) {
 const d = ev.detail || {};
 if (ev.ip) {
 return (
 escapeHtml(ev.ip) +
 (d.port ? ':' + escapeHtml(d.port) : '') +
 (d.url ? ' ' + escapeHtml(String(d.url).slice(0, 48)) : '') +
 (d.ua ? ' · ' + escapeHtml(String(d.ua).slice(0, 36)) : '')
 );
 }
 if (d.reason) {
 return escapeHtml(d.reason) + (d.toPersona ? ' -> ' + escapeHtml(d.toPersona) : '');
 }
 try {
 return escapeHtml(JSON.stringify(d).slice(0, 120));
 } catch {
 return '';
 }
}

/**
 * @param {object} opts
 * @param {(url:string, opts?:object)=>Promise<Response>} opts.apiFetch
 * @param {(msg:string)=>void} [opts.toast]
 */
export function createGhostLanPanel(opts = {}) {
 const apiFetch = opts.apiFetch || fetch;
 const toast = opts.toast || (() => {});
 let timer = null;
 let active = false;

 const $ = (id) => document.getElementById(id);

 function render(data) {
 const s = data?.status || {};
 const armed = Boolean(data?.armed);
 if ($('glPersonaIcon')) $('glPersonaIcon').textContent = s.personaIcon || '◌';
 if ($('glPersonaName')) $('glPersonaName').textContent = s.personaLabel || s.persona || 'Offline';
 if ($('glBuildId')) $('glBuildId').textContent = s.buildId || ' - ';
 if ($('glGen')) {
 $('glGen').textContent =
 (s.generation ?? ' - ') + ' / p' + (s.morphPhase ?? 0);
 }
 if ($('glHits')) $('glHits').textContent = s.totalHits ?? ' - ';
 if ($('glLanIp')) $('glLanIp').textContent = s.lanIp || ' - ';
 if ($('glTripwire')) {
 $('glTripwire').textContent = s.beaconEnabled ? 'armed' : 'local';
 }
 if ($('glArmState')) {
 $('glArmState').textContent = armed ? 'SENTINEL ONLINE' : 'STANDBY / OFFLINE';
 $('glArmState').dataset.state = armed ? 'on' : 'off';
 }
 if ($('glPorts')) {
 const ports = s.ports || [];
 $('glPorts').innerHTML = ports.length
 ? ports.map((p) => `<span class="gl-port">${escapeHtml(p)}</span>`).join('')
 : '<span class="meta-dim">No honeypot ports (start Ghost LAN plane)</span>';
 }
 if ($('glDossiers')) {
 const rows = data?.dossiers || [];
 $('glDossiers').innerHTML = rows.length
 ? rows
 .map(
 (d) =>
 `<div class="gl-row"><span class="gl-ip">${escapeHtml(d.ip)}</span>` +
 `<span class="gl-cls">${escapeHtml(d.probeClass || '?')}</span>` +
 `<span class="gl-hits">hits ${escapeHtml(d.hits || 0)}</span>` +
 (d.lastUrl
 ? `<span class="gl-url">${escapeHtml(String(d.lastUrl).slice(0, 40))}</span>`
 : '') +
 `</div>`,
 )
 .join('')
 : '<p class="meta-dim">No probes surveyed yet.</p>';
 }
 if ($('glEvents')) {
 const events = data?.events || [];
 $('glEvents').innerHTML = events.length
 ? events
 .map((ev) => {
 const cls = String(ev.type || '').replace(/[^a-z-]/gi, '');
 return (
 `<div class="gl-event"><span class="gl-time">${fmtTime(ev.ts)}</span>` +
 `<span class="gl-type ${escapeHtml(cls)}">${escapeHtml(ev.type || '?')}</span>` +
 `<span class="gl-detail">${fmtDetail(ev)}</span></div>`
 );
 })
 .join('')
 : '<p class="meta-dim">No events yet. Your LAN is quiet.</p>';
 }
 if ($('glDashLink') && data?.dashboardUrl) {
 $('glDashLink').href = data.dashboardUrl;
 }
 }

 async function refresh() {
 try {
 const res = await apiFetch('/api/ghost-lan');
 const j = await res.json();
 render(j);
 return j;
 } catch (e) {
 if ($('glArmState')) {
 $('glArmState').textContent = 'UNREACHABLE';
 $('glArmState').dataset.state = 'off';
 }
 if ($('glPersonaName')) $('glPersonaName').textContent = 'Ghost LAN offline';
 return null;
 }
 }

 async function rotate() {
 try {
 const res = await apiFetch('/api/ghost-lan/rotate', {
 method: 'POST',
 body: '{}',
 });
 const j = await res.json();
 if (j.ok === false) toast(j.error || 'Morph failed');
 else toast('Ghost LAN persona morphing...');
 render(j);
 } catch (e) {
 toast(e.message || 'Morph failed');
 }
 }

 function bind() {
 $('btnGlRotate')?.addEventListener('click', () => rotate());
 $('btnGlRefresh')?.addEventListener('click', () => refresh());
 }

 function start() {
 active = true;
 refresh();
 if (timer) clearInterval(timer);
 timer = setInterval(() => {
 if (active) refresh();
 }, 3000);
 }

 function stop() {
 active = false;
 if (timer) {
 clearInterval(timer);
 timer = null;
 }
 }

 function setActive(on) {
 if (on) start();
 else stop();
 }

 bind();

 return { refresh, rotate, start, stop, setActive, render };
}
