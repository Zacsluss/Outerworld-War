// The AI build scripts have one invariant that is easy to break and expensive to notice: the steps must
// be in ascending supply order. AI.script() scans forward from the first thing it still owes and breaks
// on `p.supUsed < s[i][0]`, so one out-of-order entry hides every step behind it until supply catches up.
// That happened once, in M10: a shield battery at supply 29 slipped between a pylon at 27 and a robotics
// facility at 28, and Protoss stopped reaching its templar archives at all.
//   node test/aiscripts.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, addEventListener() { }, setTimeout,
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
const { D, SCR, COMP, RES } = vm.runInContext('({D:DATA,SCR:AI_SCRIPTS,COMP:AI_COMP,RES:AI_RESEARCH})', ctx);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };
for (const race of Object.keys(SCR)) {
  const s = SCR[race]; const bad = [];
  for (let i = 1; i < s.length; i++) if (s[i][0] < s[i - 1][0]) bad.push(`${s[i - 1][1]}@${s[i - 1][0]} then ${s[i][1]}@${s[i][0]}`);
  ok(!bad.length, race + ' build script is in ascending supply order (' + s.length + ' steps)', bad.join('; '));
  const unknown = s.filter(([, id]) => !D.buildings[id]).map(([, id]) => id);
  ok(!unknown.length, race + ' build script names only real buildings', unknown.join(' '));
}
for (const key of Object.keys(COMP)) {
  const unknown = COMP[key].filter(([id]) => !D.units[id]).map(([id]) => id);
  ok(!unknown.length, 'AI_COMP.' + key + ' names only real units', unknown.join(' '));
  const race = key[0]; const wrong = COMP[key].filter(([id]) => D.units[id] && D.units[id].race !== race).map(([id]) => id);
  ok(!wrong.length, 'AI_COMP.' + key + ' units all belong to ' + race, wrong.join(' '));
}
for (const race of Object.keys(RES)) {
  const unknown = RES[race].filter(id => !D.techs[id] && !D.upgrades[id]);
  ok(!unknown.length, 'AI_RESEARCH.' + race + ' names only real techs and upgrades', unknown.join(' '));
  const dupes = RES[race].filter((id, i) => RES[race].indexOf(id) !== i);
  ok(!dupes.length, 'AI_RESEARCH.' + race + ' has no duplicates', dupes.join(' '));
}
console.log(fail ? `FAIL  ${pass} passed, ${fail} failed` : `ALL PASS  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
