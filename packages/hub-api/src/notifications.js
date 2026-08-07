/**
 * Outbound notification webhooks (Discord / Telegram / generic JSON).
 * Defensive alerts only — no telemetry phoning home by default.
 */

import fs from 'fs';
import path from 'path';
import { GC_DIR } from '../../core/src/index.js';

export const NOTIFY_PATH = path.join(GC_DIR, 'notifications.json');

const DEFAULTS = {
  enabled: false,
  discordWebhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
  genericWebhookUrl: '',
  homeAssistantUrl: '', // e.g. http://homeassistant.local:8123/api/states/binary_sensor.ghost_threat
  homeAssistantToken: '',
  notifyOn: {
    realThreat: true,
    responseComplete: true,
    seal: false,
    dailyQuiet: false,
  },
};

export function loadNotify() {
  try {
    if (fs.existsSync(NOTIFY_PATH)) {
      const raw = JSON.parse(fs.readFileSync(NOTIFY_PATH, 'utf8'));
      return { ...DEFAULTS, ...raw, notifyOn: { ...DEFAULTS.notifyOn, ...(raw.notifyOn || {}) } };
    }
  } catch {
    /* */
  }
  return { ...DEFAULTS, notifyOn: { ...DEFAULTS.notifyOn } };
}

export function saveNotify(patch = {}) {
  const cur = loadNotify();
  const next = {
    ...cur,
    ...patch,
    notifyOn: { ...cur.notifyOn, ...(patch.notifyOn || {}) },
  };
  // Never log secrets in responses — strip when saving empty strings ok
  fs.mkdirSync(GC_DIR, { recursive: true });
  fs.writeFileSync(NOTIFY_PATH, JSON.stringify(next, null, 2) + '\n');
  return sanitizeNotify(next);
}

export function sanitizeNotify(n = loadNotify()) {
  return {
    ok: true,
    enabled: !!n.enabled,
    hasDiscord: !!n.discordWebhookUrl,
    hasTelegram: !!(n.telegramBotToken && n.telegramChatId),
    hasGeneric: !!n.genericWebhookUrl,
    hasHomeAssistant: !!(n.homeAssistantUrl && n.homeAssistantToken),
    notifyOn: n.notifyOn || DEFAULTS.notifyOn,
  };
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}

/**
 * Send a defensive alert message to configured channels.
 */
export async function sendNotification(eventType, message, detail = {}) {
  const n = loadNotify();
  if (!n.enabled) return { ok: true, skipped: true, reason: 'disabled' };
  const on = n.notifyOn || {};
  if (eventType === 'realThreat' && !on.realThreat) return { ok: true, skipped: true };
  if (eventType === 'responseComplete' && !on.responseComplete) return { ok: true, skipped: true };
  if (eventType === 'seal' && !on.seal) return { ok: true, skipped: true };

  const text = String(message || 'Ghost Continuum alert').slice(0, 1800);
  const results = [];

  try {
    if (n.discordWebhookUrl) {
      results.push({
        channel: 'discord',
        ...(await postJson(n.discordWebhookUrl, {
          content: `🛡️ **Ghost Continuum**\n${text}`,
        })),
      });
    }
    if (n.telegramBotToken && n.telegramChatId) {
      const url = `https://api.telegram.org/bot${n.telegramBotToken}/sendMessage`;
      results.push({
        channel: 'telegram',
        ...(await postJson(url, { chat_id: n.telegramChatId, text: `Ghost Continuum\n${text}` })),
      });
    }
    if (n.genericWebhookUrl) {
      results.push({
        channel: 'generic',
        ...(await postJson(n.genericWebhookUrl, {
          source: 'ghost-continuum',
          eventType,
          message: text,
          detail,
          ts: Date.now(),
        })),
      });
    }
    if (n.homeAssistantUrl && n.homeAssistantToken) {
      // HA state update — threat binary sensor
      const threat = eventType === 'realThreat' || detail.realThreat ? 'on' : 'off';
      results.push({
        channel: 'home-assistant',
        ...(await postJson(
          n.homeAssistantUrl,
          {
            state: threat,
            attributes: {
              friendly_name: 'Ghost Continuum Threat',
              message: text,
              eventType,
              updated: new Date().toISOString(),
            },
          },
          { Authorization: `Bearer ${n.homeAssistantToken}` },
        )),
      });
    }
  } catch (e) {
    return { ok: false, error: e.message, results };
  }

  return { ok: true, results, channels: results.length };
}

export async function testNotification() {
  return sendNotification('test', 'Test alert from Ghost Continuum Command Nexus. Defensive only. Local hub.');
}
