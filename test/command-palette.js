import assert from 'assert';
import { escHtml, filterCommands } from '../packages/hub-ui/public/assets/command-palette.js';

const cmds = [
  { id: 'view:overview', label: 'Go to Overview', group: 'Views' },
  { id: 'ops:seal', label: 'Seal incident', group: 'Ops' },
];

assert.equal(filterCommands(cmds, '').length, 2);
assert.equal(filterCommands(cmds, 'seal')[0].id, 'ops:seal');
assert.equal(filterCommands(cmds, 'zzz').length, 0);
assert.equal(filterCommands([{ id: 'a<b', label: 'Go <home>', group: 'Views' }], '<home>')[0].id, 'a<b');
assert.equal(escHtml('Go <home> & "now"'), 'Go &lt;home&gt; &amp; &quot;now&quot;');
console.log('command-palette filter ok');
