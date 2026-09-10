// Rebindable controls. M12 item 10, the half of the menu work that did not exist in any form.
//
// Everything here fails silently by nature: a binding that does not save, an action the Controls
// screen forgets to list, two actions quietly sharing one key, or a hardcoded `k === ','` left behind
// in onKey after the table was added. None of those throw, and all of them present as "the game
// ignored my keybind", which is not a bug report anyone can act on.
//   node test/controls.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const store = {};
const divs = {};
const div = id => (divs[id] = divs[id] || { id, style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', innerHTML: '', appendChild() { }, querySelectorAll: () => [] });
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { getElementById: div, createElement: () => ({ style: {}, className: '', textContent: '', addEventListener() { }, appendChild() { }, getContext: () => null }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'render', 'ui', 'hud']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

const r = vm.runInContext(`(() => {
  const out = {};
  const b = UI.bindings();
  out.actions = Object.keys(b);
  out.allHaveLabelAndGroup = out.actions.every(id => b[id].label && b[id].group);
  out.defaultsMatch = out.actions.every(id => b[id].key === UI.BIND_DEFAULTS[id].key);

  // hit() matches the default, and does not match something else
  const ev = (key, ctrl) => ({ ctrlKey: !!ctrl, preventDefault() { }, stopPropagation() { } });
  out.hitPlain = UI.hit('idleWorker', ev(','), ',');
  out.hitWrong = UI.hit('idleWorker', ev('x'), 'x');
  out.hitCtrl = UI.hit('selectArmy', ev('a', true), 'a');
  out.hitCtrlNeedsCtrl = UI.hit('selectArmy', ev('a'), 'a');
  out.hitCaseInsensitive = UI.hit('selectArmy', ev('A', true), 'A');

  // rebinding takes effect and persists
  UI.setBinding('idleWorker', 'q');
  out.rebound = { hitNew: UI.hit('idleWorker', ev('q'), 'q'), hitOld: UI.hit('idleWorker', ev(','), ',') };
  out.saved = localStorage.getItem('bw_binds');

  // ...and survives a reload of the table
  UI._binds = null;
  out.persisted = UI.bindings().idleWorker.key === 'q';

  // a key already in use is TAKEN from the other action rather than duplicated
  UI.setBinding('help', 'q');
  const b2 = UI.bindings();
  out.noDupes = Object.values(b2).filter(x => x.key === 'q').length;
  out.stolenFrom = b2.idleWorker.key;

  // unbinding is expressible and never matches
  UI.setBinding('help', '');
  out.unbound = { key: UI.bindings().help.key, hits: UI.hit('help', ev('F1'), 'F1') };

  // reset puts everything back and clears storage
  UI.resetBindings();
  const b3 = UI.bindings();
  out.reset = Object.keys(b3).every(id => b3[id].key === UI.BIND_DEFAULTS[id].key);
  out.cleared = localStorage.getItem('bw_binds') === null;
  return out;
})()`, ctx);

// Every action the table declares must actually be consulted in onKey, or it is a control the screen
// offers to rebind and the game then ignores.
const ui = fs.readFileSync(path.join(root, 'js', 'ui.js'), 'utf8');
const consulted = new Set([...ui.matchAll(/this\.hit\('([a-zA-Z]+)'/g)].map(m => m[1]));
const declared = r.actions;

ok(declared.length >= 10, 'the bindings table covers the global actions', declared.length + ': ' + declared.join(', '));
ok(r.allHaveLabelAndGroup, 'every binding has a label and a group, so the Controls screen can render it');
ok(r.defaultsMatch, 'a fresh profile gets the defaults');

ok(r.hitPlain && !r.hitWrong, 'hit() matches its own key and nothing else', JSON.stringify([r.hitPlain, r.hitWrong]));
ok(r.hitCtrl && !r.hitCtrlNeedsCtrl, 'a ctrl+ binding needs ctrl held', JSON.stringify([r.hitCtrl, r.hitCtrlNeedsCtrl]));
ok(r.hitCaseInsensitive, '...and is not case sensitive');

ok(r.rebound.hitNew && !r.rebound.hitOld, 'rebinding takes effect immediately', JSON.stringify(r.rebound));
ok(!!r.saved, '...and is written to storage', String(r.saved));
ok(r.persisted, '...and survives a reload of the table');

ok(r.noDupes === 1, 'binding a key already in use TAKES it, rather than leaving two actions on one key', 'copies: ' + r.noDupes);
ok(r.stolenFrom === '', '...leaving the other action unbound and visibly so', JSON.stringify(r.stolenFrom));
ok(r.unbound.key === '' && r.unbound.hits === false, 'an unbound action never fires', JSON.stringify(r.unbound));

ok(r.reset && r.cleared, 'reset restores every default and clears the saved overrides', JSON.stringify([r.reset, r.cleared]));

const unread = declared.filter(a => !consulted.has(a));
ok(unread.length === 0, 'every declared binding is actually consulted by onKey -- an unread one is a control the game ignores', unread.join(', '));

// the Controls screen must exist and reference only ids that are in the document
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const id of ['controlsPanel', 'bindList', 'bindReset', 'controlsBack', 'controlsBtn'])
  ok(html.includes('id="' + id + '"'), 'index.html has #' + id);

console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
