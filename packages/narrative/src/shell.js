import { converse } from './llm.js';
import { loadPhantom, savePhantom } from './phantom.js';
import { loadEchoWorld, echoContextForIp } from './echo.js';

const BUILTIN_COMMANDS = {
  help: () => 'Commands: status, users, backup, logs, config, whoami, exit',
  whoami: (ctx) => `${ctx.user}@${ctx.host} (uid=${ctx.uid})`,
  status: (ctx) => `uptime ${ctx.uptime}d | load ${ctx.load} | traps ${ctx.trapCount} active`,
  users: (ctx) => ctx.users.join('\n'),
  backup: () => 'Last backup: 2026-07-06 02:14 UTC [warnings: 3]',
  logs: (ctx) => ctx.recentLogs.slice(-5).join('\n') || '(empty)',
  config: (ctx) => `site=${ctx.loreSeed} epoch=${ctx.epoch} persona=${ctx.persona}`,
};

export function createShellSession(ip, config, persona = 'admin') {
  const phantom = loadPhantom(ip);
  const world = loadEchoWorld(config?.continuum?.narrative?.worldId || 'default');
  const echo = echoContextForIp(world, ip);

  return {
    id: `shell_${ip}_${Date.now()}`,
    ip,
    persona,
    cwd: '/var/www/admin',
    history: phantom?.shellHistory || [],
    context: {
      user: 'ops-admin',
      uid: 1001,
      host: `dm-${echo.loreSeed}.internal`,
      uptime: Math.floor((Date.now() - (phantom?.firstSeen || Date.now())) / 86400000) + 1,
      load: '0.42 0.38 0.31',
      trapCount: 3,
      users: world.users.map((u) => `${u.handle} (${u.role})`),
      recentLogs: world.artifacts.logs,
      loreSeed: echo.loreSeed,
      epoch: echo.epoch,
      persona,
    },
  };
}

export async function execShellLine(session, line, config) {
  const trimmed = (line || '').trim();
  if (!trimmed) return { output: '', prompt: true };

  session.history.push({ ts: Date.now(), in: trimmed });

  if (trimmed === 'exit') {
    return { output: 'logout\n', done: true };
  }

  const [cmd, ...args] = trimmed.split(/\s+/);
  const builtin = BUILTIN_COMMANDS[cmd.toLowerCase()];
  if (builtin) {
    const output = builtin(session.context, args) + '\n';
    persistHistory(session);
    return { output, prompt: true };
  }

  if (config?.continuum?.narrative?.enabled) {
    const reply = await converse(config, trimmed, {
      mode: 'admin_shell',
      persona: session.persona,
      loreSeed: session.context.loreSeed,
    });
    const output = (reply.text || '(no response)') + '\n';
    persistHistory(session);
    return { output, prompt: true, source: reply.source };
  }

  const output = `${cmd}: command not found\n`;
  persistHistory(session);
  return { output, prompt: true };
}

function persistHistory(session) {
  const phantom = loadPhantom(session.ip) || { v: 1, ip: session.ip, firstSeen: Date.now(), visits: 0, memory: [] };
  phantom.shellHistory = session.history.slice(-100);
  savePhantom(phantom);
}

export function shellBanner(session) {
  return `DM-Sentinel defensive shell [${session.persona}]\n${session.context.host} — epoch ${session.context.epoch}\nType 'help' for commands.\n`;
}