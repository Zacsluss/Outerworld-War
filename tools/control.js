// Negative control runner (REVIEW-M17), in the shape HANDOFF-M16 trap 2 asks for: apply a text edit to one file,
// run a command, and restore the file FROM MEMORY whatever happens.
//   node tools/control.js <file> <search> <replace> <command...>
'use strict';
const fs = require('fs'), { spawnSync } = require('child_process');
const [file, search, replace, ...cmd] = process.argv.slice(2);
const orig = fs.readFileSync(file, 'utf8');
if (!orig.includes(search)) { console.log('CONTROL NOT APPLIED: anchor not found in ' + file + ': ' + JSON.stringify(search)); process.exit(2); }
fs.writeFileSync(file, orig.replace(search, replace));
try {
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', shell: true });
  process.stdout.write((r.stdout || '') + (r.stderr || ''));
  console.log('[control exit ' + r.status + ']');
} finally {
  fs.writeFileSync(file, orig);
  console.log('[restored ' + file + ' ' + (fs.readFileSync(file, 'utf8') === orig ? 'byte-identical' : 'MISMATCH') + ']');
}
