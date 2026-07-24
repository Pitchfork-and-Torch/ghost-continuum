/**
 * Home Shield UI — wizard, language, devices, report, badges, backup, notify, a11y.
 */

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hubAuthHeaders(extra = {}) {
  const token = localStorage.getItem('dm-hub-token') || window.__GC_HUB_TOKEN;
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiFetch(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const headers = hubAuthHeaders(opts.headers || {});
  if (method !== 'GET' && opts.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...opts, headers });
}

let homeState = null;
let langPack = null;

export function getLangPack() {
  return langPack || {};
}

export function getHomeState() {
  return homeState;
}

export async function refreshHome(toast) {
  try {
    const res = await apiFetch('/api/home/status');
    const j = await res.json();
    if (!j.ok) return null;
    homeState = j;
    langPack = j.languagePack || {};
    applyHomeChrome(j, toast);
    return j;
  } catch {
    return null;
  }
}

function applyHomeChrome(j) {
  const home = j.home || {};
  document.body.classList.toggle('lang-home', home.language === 'home');
  document.body.classList.toggle('lang-expert', home.language !== 'home');
  document.body.classList.toggle('high-contrast', !!home.highContrast);
  document.body.classList.toggle('reduced-motion', !!home.reducedMotion);
  document.body.classList.toggle('kid-mode', !!home.kidMode);

  const banner = $('trustBanner');
  if (banner) {
    banner.hidden = home.showTrustBanner === false;
    banner.textContent = langPack.trustBanner || banner.textContent;
  }

  // Language-sensitive labels
  const map = [
    ['lblEfficacy', 'efficacy'],
    ['lblPlanes', 'planes'],
    ['lblMorph', 'morph'],
    ['lblChad', 'chad'],
    ['btnRespond', 'respond'],
    ['btnThreatAssess', 'assess'],
    ['btnSnapshot', 'seal'],
    ['btnEvolve', 'evolve'],
  ];
  for (const [id, key] of map) {
    const el = $(id);
    if (el && langPack[key]) {
      if (el.tagName === 'BUTTON' || el.classList?.contains('nx-btn')) el.textContent = String(langPack[key]).toUpperCase();
      else el.textContent = langPack[key];
    }
  }

  // Settings form sync
  const langSel = $('setLanguage');
  if (langSel) langSel.value = home.language || 'home';
  const kid = $('setKidMode');
  if (kid) kid.checked = !!home.kidMode;
  const qh = $('setQuietHours');
  if (qh) qh.checked = !!home.quietHours?.enabled;
  const qhStart = $('setQuietStart');
  if (qhStart) qhStart.value = home.quietHours?.start || '22:00';
  const qhEnd = $('setQuietEnd');
  if (qhEnd) qhEnd.value = home.quietHours?.end || '07:00';
  const hc = $('setHighContrast');
  if (hc) hc.checked = !!home.highContrast;
  const rm = $('setReducedMotion');
  if (rm) rm.checked = !!home.reducedMotion;
  const tb = $('setTrustBanner');
  if (tb) tb.checked = home.showTrustBanner !== false;
  const hh = $('setHousehold');
  if (hh) hh.value = home.householdName || '';

  renderBadges(j.progression);
  renderDevices(j.inventory);
  renderNotify(j.notify);

  const badge = $('wizardBadge');
  if (badge) badge.hidden = !!home.wizardCompleted;
}

function renderBadges(prog) {
  const el = $('badgeBoard');
  if (!el || !prog?.badges) return;
  el.innerHTML = `
    <div class="badge-progress">${prog.earnedCount}/${prog.total} · ${prog.percent}%</div>
    <div class="badge-grid">
      ${prog.badges
        .map(
          (b) => `<div class="badge-chip ${b.earned ? 'earned' : ''}" title="${escapeHtml(b.desc)}">
            <span class="badge-icon">${b.earned ? '✅' : '○'}</span>
            <span>${escapeHtml(b.title)}</span>
          </div>`,
        )
        .join('')}
    </div>`;
}

function renderDevices(inv) {
  const el = $('deviceList');
  if (!el) return;
  const devices = inv?.devices || [];
  const unknown = inv?.topUnknown || [];
  el.innerHTML = `
    <div class="device-stats">${inv?.trusted || 0} trusted · ${unknown.length} recent unknown</div>
    ${devices
      .map(
        (d) => `<div class="device-row">
          <span class="dev-name">${escapeHtml(d.name)}</span>
          <span class="dev-ip">${escapeHtml(d.ip)}</span>
          <span class="dev-kind">${escapeHtml(d.kind)}</span>
          <button type="button" class="nx-btn sm" data-untrust="${escapeHtml(d.id)}">REMOVE</button>
        </div>`,
      )
      .join('') || '<div class="meta-dim">No trusted devices yet — add phones, TVs, NAS.</div>'}
    ${
      unknown.length
        ? `<div class="device-unknown-label">Seen but not trusted</div>
      ${unknown
        .map(
          (u) => `<div class="device-row unknown">
            <span class="dev-ip">${escapeHtml(u.ip)}</span>
            <span class="dev-kind">${escapeHtml(u.hint || '')}</span>
            <button type="button" class="nx-btn sm" data-trust-ip="${escapeHtml(u.ip)}">TRUST</button>
          </div>`,
        )
        .join('')}`
        : ''
    }`;

  el.querySelectorAll('[data-untrust]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await apiFetch('/api/home/devices', { method: 'POST', body: JSON.stringify({ remove: btn.dataset.untrust }) });
      refreshHome();
    });
  });
  el.querySelectorAll('[data-trust-ip]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ip = btn.dataset.trustIp;
      await apiFetch('/api/home/devices', {
        method: 'POST',
        body: JSON.stringify({ ip, name: ip, kind: 'device', trusted: true }),
      });
      refreshHome();
    });
  });
}

function renderNotify(n) {
  const el = $('notifyStatus');
  if (!el || !n) return;
  el.textContent = n.enabled
    ? `Alerts ON · Discord ${n.hasDiscord ? '✓' : '—'} · Telegram ${n.hasTelegram ? '✓' : '—'} · HA ${n.hasHomeAssistant ? '✓' : '—'} · Hook ${n.hasGeneric ? '✓' : '—'}`
    : 'Alerts OFF — configure webhooks below (optional, outbound only)';
  const en = $('setNotifyEnabled');
  if (en) en.checked = !!n.enabled;
}

export function openWizard(profiles = []) {
  const modal = $('modalWizard');
  const body = $('modalWizardBody');
  if (!modal || !body) return;
  const list = profiles.length ? profiles : homeState?.profiles || [];
  body.innerHTML = `
    <p class="meta-dim">Pick how you run your home network. We arm the right layers — you can change them anytime.</p>
    <label class="wiz-field">Household name (optional)
      <input id="wizHousehold" type="text" placeholder="Bailey home" maxlength="64" />
    </label>
    <label class="wiz-field">Language
      <select id="wizLanguage">
        <option value="home">Home (plain English)</option>
        <option value="expert">Expert (operator terms)</option>
      </select>
    </label>
    <div class="profile-grid" id="profileGrid">
      ${list
        .map(
          (p) => `<button type="button" class="profile-card" data-profile="${escapeHtml(p.id)}">
            <strong>${escapeHtml(p.label)}</strong>
            <span>${escapeHtml(p.description)}</span>
          </button>`,
        )
        .join('')}
    </div>
    <p class="legal-mini">Authorized networks only · Defensive · Data stays on this PC</p>
  `;
  modal.showModal?.() || modal.setAttribute('open', '');
  body.querySelectorAll('[data-profile]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const profileId = btn.dataset.profile;
      body.querySelectorAll('.profile-card').forEach((c) => c.classList.remove('selected'));
      btn.classList.add('selected');
      const answers = {
        householdName: $('wizHousehold')?.value || '',
        language: $('wizLanguage')?.value || 'home',
      };
      const res = await apiFetch('/api/home/wizard', {
        method: 'POST',
        body: JSON.stringify({ profileId, answers }),
      });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error || 'Wizard failed');
        return;
      }
      modal.close?.();
      await refreshHome();
      showShieldCard(j.card || j);
      // reload status planes
      window.dispatchEvent(new CustomEvent('gc-home-applied', { detail: j }));
    });
  });
}

function showShieldCard(card) {
  const c = card?.card || card;
  if (!c?.title) return;
  const modal = $('modalShield');
  const body = $('modalShieldBody');
  if (!modal || !body) return;
  body.innerHTML = `
    <h3 class="shield-title">${escapeHtml(c.title)}</h3>
    <p class="meta-dim">${escapeHtml(c.subtitle || '')}</p>
    <p><strong>${escapeHtml(c.profile)}</strong> · morph ${escapeHtml(c.morph)}</p>
    <ul class="shield-bullets">${(c.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
    ${(c.notes || []).length ? `<div class="meta-dim">${c.notes.map((n) => escapeHtml(n)).join('<br/>')}</div>` : ''}
  `;
  modal.showModal?.() || modal.setAttribute('open', '');
}

export function bindHomeUi(toast) {
  $('btnWizard')?.addEventListener('click', () => openWizard());
  $('btnHomeSettings')?.addEventListener('click', () => {
    $('panelHomeSettings')?.classList.toggle('open');
  });
  $('btnSaveHomeSettings')?.addEventListener('click', async () => {
    const body = {
      language: $('setLanguage')?.value,
      kidMode: $('setKidMode')?.checked,
      highContrast: $('setHighContrast')?.checked,
      reducedMotion: $('setReducedMotion')?.checked,
      showTrustBanner: $('setTrustBanner')?.checked,
      householdName: $('setHousehold')?.value,
      quietHours: {
        enabled: $('setQuietHours')?.checked,
        start: $('setQuietStart')?.value || '22:00',
        end: $('setQuietEnd')?.value || '07:00',
        morph: 'aggressive',
        dayMorph: 'research',
      },
    };
    const res = await apiFetch('/api/home/settings', { method: 'POST', body: JSON.stringify(body) });
    const j = await res.json();
    if (j.ok) {
      toast?.('Home settings saved');
      await refreshHome(toast);
    } else toast?.(j.error || 'Save failed');
  });

  $('btnAddDevice')?.addEventListener('click', async () => {
    const ip = $('devIp')?.value?.trim();
    const name = $('devName')?.value?.trim() || ip;
    const kind = $('devKind')?.value || 'device';
    if (!ip) return toast?.('Enter an IP');
    await apiFetch('/api/home/devices', { method: 'POST', body: JSON.stringify({ ip, name, kind, trusted: true }) });
    if ($('devIp')) $('devIp').value = '';
    await refreshHome(toast);
    toast?.(`Trusted ${name}`);
  });

  $('btnHomeReport')?.addEventListener('click', async () => {
    toast?.('Generating report…');
    const res = await apiFetch('/api/home/report', { method: 'POST', body: JSON.stringify({ hours: 168 }) });
    const j = await res.json();
    if (!j.ok) return toast?.(j.error || 'Report failed');
    const modal = $('modalReport');
    const body = $('modalReportBody');
    if (body) body.innerHTML = `<pre class="threat-brief">${escapeHtml(j.markdown)}</pre>`;
    modal?.showModal?.() || modal?.setAttribute('open', '');
    toast?.('Report ready');
    await refreshHome(toast);
  });

  $('btnHomeBackup')?.addEventListener('click', async () => {
    const res = await apiFetch('/api/home/backup', { method: 'POST', body: JSON.stringify({ includeEvents: false }) });
    const j = await res.json();
    if (j.ok && j.downloadUrl) {
      toast?.(`Backup ${j.id}`);
      window.open(j.downloadUrl, '_blank');
    } else toast?.(j.error || 'Backup failed');
  });

  $('btnNotifySave')?.addEventListener('click', async () => {
    const body = {
      enabled: $('setNotifyEnabled')?.checked,
      discordWebhookUrl: $('setDiscord')?.value || '',
      telegramBotToken: $('setTelegramToken')?.value || '',
      telegramChatId: $('setTelegramChat')?.value || '',
      genericWebhookUrl: $('setGenericHook')?.value || '',
      homeAssistantUrl: $('setHaUrl')?.value || '',
      homeAssistantToken: $('setHaToken')?.value || '',
    };
    const res = await apiFetch('/api/home/notify', { method: 'POST', body: JSON.stringify(body) });
    const j = await res.json();
    toast?.(j.ok ? 'Notification settings saved' : j.error || 'Save failed');
    await refreshHome(toast);
  });

  $('btnNotifyTest')?.addEventListener('click', async () => {
    const res = await apiFetch('/api/home/notify', { method: 'POST', body: JSON.stringify({ test: true }) });
    const j = await res.json();
    toast?.(j.ok ? (j.skipped ? 'Notify disabled or skipped' : `Sent · ${j.channels || 0} channel(s)`) : j.error || 'Test failed');
  });

  $('trustBannerClose')?.addEventListener('click', async () => {
    await apiFetch('/api/home/settings', { method: 'POST', body: JSON.stringify({ showTrustBanner: false }) });
    if ($('trustBanner')) $('trustBanner').hidden = true;
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog')?.close?.());
  });
}

export async function bootHome(toast) {
  bindHomeUi(toast);
  const j = await refreshHome(toast);
  if (j?.wizardNeeded) {
    openWizard(j.profiles);
  }
  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  return j;
}
