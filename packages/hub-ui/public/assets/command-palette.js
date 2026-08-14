/**
 * Command palette for Command Nexus (Ctrl/Cmd+K).
 * Local-only. No network. Keyboard first.
 */

const DEFAULT_COMMANDS = [
  { id: 'view:overview', label: 'Go to Overview', hint: '1', group: 'Views' },
  { id: 'view:ghost-lan', label: 'Go to Ghost LAN', hint: '2', group: 'Views' },
  { id: 'view:genome', label: 'Go to Genome', hint: '3', group: 'Views' },
  { id: 'view:forensics', label: 'Go to Forensics', hint: '4', group: 'Views' },
  { id: 'view:home', label: 'Go to Home Shield', hint: '5', group: 'Views' },
  { id: 'map:live', label: 'Switch map to LIVE', hint: '', group: 'Map' },
  { id: 'map:demo', label: 'Inject DEMO campaign', hint: '', group: 'Map' },
  { id: 'ops:respond', label: 'RESPOND to real threats', hint: '', group: 'Ops' },
  { id: 'ops:evolve', label: 'Evolve genome pool', hint: '', group: 'Ops' },
  { id: 'ops:seal', label: 'Seal incident (Merkle)', hint: '', group: 'Ops' },
  { id: 'query:focus', label: 'Focus natural-language query', hint: '/', group: 'Query' },
  { id: 'query:scanners', label: 'Query: last 24h scanners', hint: '', group: 'Query' },
  { id: 'query:auth', label: 'Query: failed auth chains', hint: '', group: 'Query' },
];

export function filterCommands(commands, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return commands.slice();
  return commands.filter((c) =>
    `${c.label} ${c.id} ${c.group}`.toLowerCase().includes(s),
  );
}

export function createCommandPalette({ commands = DEFAULT_COMMANDS, onRun } = {}) {
  const root = document.getElementById('commandPalette');
  const input = document.getElementById('commandPaletteInput');
  const list = document.getElementById('commandPaletteList');
  if (!root || !input || !list) {
    return { open() {}, close() {}, isOpen() { return false; } };
  }

  let index = 0;
  let visible = commands.slice();

  function render() {
    list.innerHTML = visible.map((c, i) => (
      `<li><button type="button" class="cmdk-item${i === index ? ' is-active' : ''}" data-id="${c.id}" data-i="${i}">` +
      `<span class="cmdk-label">${c.label}</span>` +
      `<span class="cmdk-meta">${c.group}${c.hint ? ' · ' + c.hint : ''}</span>` +
      `</button></li>`
    )).join('') || '<li class="cmdk-empty">No matching commands</li>';
  }

  function open() {
    root.hidden = false;
    root.setAttribute('data-open', 'true');
    input.value = '';
    visible = filterCommands(commands, '');
    index = 0;
    render();
    input.focus();
  }

  function close() {
    root.hidden = true;
    root.setAttribute('data-open', 'false');
  }

  function isOpen() {
    return !root.hidden;
  }

  function run(id) {
    close();
    if (id && typeof onRun === 'function') onRun(id);
  }

  input.addEventListener('input', () => {
    visible = filterCommands(commands, input.value);
    index = 0;
    render();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = visible.length ? (index + 1) % visible.length : 0;
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      index = visible.length ? (index - 1 + visible.length) % visible.length : 0;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible[index]) run(visible[index].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (btn) run(btn.getAttribute('data-id'));
  });

  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  return { open, close, isOpen, filterCommands };
}
