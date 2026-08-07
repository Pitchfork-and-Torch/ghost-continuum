#!/usr/bin/env node
/**
 * Ghost CLI — rich terminal animations and lore (Phase 4 easter egg).
 */

const FRAMES = ['◌', '◍', '◎', '●', '◎', '◍'];
const STORIES = [
  'The genome pool whispered a new port into existence.',
  'Echo Reality advanced one epoch while you blinked.',
  'A Merkle leaf sealed a story that never happened — except it did.',
  'Phantom Mesh shared a fitness score. No IPs crossed the wire.',
  'Deep Veil saw a bind. Mirage Core dreamed a container.',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function animateSpinner(label, cycles = 12) {
  for (let i = 0; i < cycles; i++) {
    process.stdout.write(`\r  ${FRAMES[i % FRAMES.length]} ${label}`);
    await sleep(80);
  }
  process.stdout.write('\r');
}

async function main() {
  const cmd = process.argv[2] || 'wake';

  console.log('\n  ▓▓▓ GHOST CLI — Living Deception Continuum ▓▓▓\n');

  if (cmd === 'wake') {
    await animateSpinner('Awakening sentinel morphs');
    console.log('  ✓ Stealth · Research · Aggressive · Forensic');
    await animateSpinner('Syncing deception genome');
    console.log('  ✓ Champion genome online');
    console.log(`\n  ${STORIES[Math.floor(Math.random() * STORIES.length)]}\n`);
    return;
  }

  if (cmd === 'stories') {
    for (const s of STORIES) {
      await animateSpinner('channel open', 6);
      console.log(`  ◌ ${s}`);
      await sleep(400);
    }
    console.log('');
    return;
  }

  console.log('  Usage: node bin/ghost-cli.js wake | stories\n');
}

main().catch(console.error);