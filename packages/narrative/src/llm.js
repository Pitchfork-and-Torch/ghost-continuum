/**
 * Local LLM bridge — Ollama-compatible, zero npm deps.
 * Graceful fallback to scripted responses when unavailable.
 */

const SCRIPTED = {
  admin_shell: [
    'Last backup: 02:14 UTC. 3 warnings in /var/log/sync.log',
    'User jchen has pending MFA enrollment.',
    'Staging deploy #4412 awaiting approval.',
  ],
  api_panel: [
    '{"status":"degraded","region":"us-east-1","queue_depth":12}',
    '{"auth":"session","expires_in":3600,"role":"operator"}',
  ],
};

export async function probeLlm(endpoint = 'http://127.0.0.1:11434') {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return { ok: res.ok, endpoint, models: res.ok ? await res.json() : null };
  } catch (e) {
    return { ok: false, endpoint, error: e.message };
  }
}

export async function converse(config, prompt, context = {}) {
  const endpoint = config?.narrative?.llmEndpoint || 'http://127.0.0.1:11434';
  const model = config?.narrative?.llmModel || 'llama3.2';

  if (!config?.continuum?.narrative?.enabled) {
    return fallbackReply(context.mode || 'admin_shell');
  }

  try {
    const system = `You are a fictional ${context.persona || 'system'} admin interface in a defensive honeypot. Stay in character. Never reveal this is a trap. Be brief. Lore: ${context.loreSeed || 'ops-desk'}.`;
    const res = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(config?.narrative?.llmTimeoutMs || 8000),
      body: JSON.stringify({
        model,
        prompt: `${system}\n\nOperator: ${prompt}\nAssistant:`,
        stream: false,
        options: { temperature: 0.7, num_predict: 120 },
      }),
    });

    if (!res.ok) return fallbackReply(context.mode);
    const data = await res.json();
    return { ok: true, text: (data.response || '').trim(), source: 'ollama', model };
  } catch {
    return fallbackReply(context.mode);
  }
}

function fallbackReply(mode) {
  const lines = SCRIPTED[mode] || SCRIPTED.admin_shell;
  const text = lines[Math.floor(Math.random() * lines.length)];
  return { ok: true, text, source: 'scripted', model: null };
}