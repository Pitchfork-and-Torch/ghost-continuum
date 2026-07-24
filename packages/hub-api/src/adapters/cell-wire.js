/**
 * Local audit-cell wire map — endpoint paths resolved at runtime.
 * Ghost Continuum speaks only to a loopback validation cell on your machine.
 */

const EP = {
  ping: Buffer.from('L2FwaS9oZWFsdGg=', 'base64').toString(),
  stream: Buffer.from('L2FwaS9ldmVudHM=', 'base64').toString(),
  context: Buffer.from('L2FwaS9taXNzaW9uLWNvbnRleHQvbGF0ZXN0', 'base64').toString(),
  launch: Buffer.from('L2FwaS9taXNzaW9uL3N0YXJ0', 'base64').toString(),
  panel: Buffer.from('L3VpLw==', 'base64').toString(),
};

export function cellBase(port) {
  return `http://127.0.0.1:${port}`;
}

export function cellEndpoints(port) {
  const base = cellBase(port);
  return {
    ping: `${base}${EP.ping}`,
    stream: `${base}${EP.stream}`,
    context: `${base}${EP.context}`,
    launch: `${base}${EP.launch}`,
    panel: `${base}${EP.panel}`,
  };
}

export function resolveCellRoot(config) {
  if (process.env.DM_CELL_ROOT?.trim()) return process.env.DM_CELL_ROOT.trim();
  if (config.cellRoot?.trim()) return config.cellRoot.trim();
  return '';
}