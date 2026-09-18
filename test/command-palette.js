import assert from 'assert';
import { filterCommands } from '../packages/hub-ui/public/assets/command-palette.js';

const cmds = [
  { id: 'view:overview', label: 'Go to Overview', group: 'Views' },
  { id: 'ops:seal', label: 'Seal incident', group: 'Ops' },
];

assert.equal(filterCommands(cmds, '').length, 2);
assert.equal(filterCommands(cmds, 'seal')[0].id, 'ops:seal');
assert.equal(filterCommands(cmds, 'zzz').length, 0);
console.log('command-palette filter ok');
