import crypto from 'crypto';

const DECOY_TEMPLATES = [
  'api_key_{hex}',
  'sk_live_{hex}',
  'postgres://admin:{hex}@10.0.{a}.{b}:5432/prod',
  'Bearer eyJhbGciOiJIUzI1NiJ9.{b64}',
  'AWS_SECRET_ACCESS_KEY={b64}',
  '/internal/v2/deploy/{hex}',
  'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC{b64}',
  'HONEYTOKEN_{hex}',
  'canary_{hex}@trap.local',
];

function randHex(rand, len) {
  let out = '';
  for (let i = 0; i < len; i++) out += Math.floor(rand() * 16).toString(16);
  return out;
}

function randB64(rand, len) {
  const buf = Buffer.alloc(len);
  for (let i = 0; i < len; i++) buf[i] = Math.floor(rand() * 256);
  return buf.toString('base64url').slice(0, len);
}

export function generateChaff(seedHex, count = 12) {
  const rand = (() => {
    let h = crypto.createHash('sha256').update(seedHex).digest();
    return () => {
      h = crypto.createHash('sha256').update(h).digest();
      return h.readUInt32BE(0) / 0xffffffff;
    };
  })();

  const items = [];
  for (let i = 0; i < count; i++) {
    const tpl = DECOY_TEMPLATES[Math.floor(rand() * DECOY_TEMPLATES.length)];
    const value = tpl
      .replace('{hex}', randHex(rand, 32))
      .replace('{b64}', randB64(rand, 24))
      .replace('{a}', String(Math.floor(rand() * 255)))
      .replace('{b}', String(Math.floor(rand() * 255)));

    items.push({
      id: `chaff_${i + 1}`,
      kind: 'honeypot-decoy',
      value,
      purpose: 'Static analysis tripwire — not a real secret',
    });
  }

  return {
    seed: seedHex,
    generatedAt: new Date().toISOString(),
    warning: 'Embed in builds to pollute string tables. Monitor if these appear in outbound traffic or logs.',
    items,
  };
}

export function emitChaffModule(chaff) {
  const lines = [
    '/* ghost-continuum chaff — decoy strings for tripwire detection */',
    'export const DM_CHAFF = ' + JSON.stringify(chaff.items.map((i) => i.value), null, 2) + ';',
    'export const DM_CHAFF_MANIFEST = ' + JSON.stringify({ seed: chaff.seed, count: chaff.items.length }, null, 2) + ';',
  ];
  return lines.join('\n') + '\n';
}