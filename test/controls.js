// Rebindable controls. M12 item 10, the half of the menu work that did not exist in any form.
//
// Everything here fails silently by nature: a binding that does not save, an action the Controls
// screen forgets to list, two actions quietly sharing one key, or a hardcoded `k === ','` left behind
// in onKey after the table was added -- or, the other way round, a key onKey reads by literal (F8, a
// control group) that the Controls screen let a player rebind onto (REVIEW-M17 task 15). None of those
// throw, and all of them present as "the game
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

// ---- REVIEW-M17 task 15: the reverse direction ------------------------------------------------------
// The check above proves every DECLARED action is consulted. It says nothing about the keys onKey reads
// by literal and never declared -- the control groups, the camera slots, F8, F9, Ctrl+M -- so a rebind
// onto one of those put two handlers on one key, and whichever line of onKey came first won in silence.
// UI.RESERVED lists them and setBinding refuses them. Here: scrape onKey (and scrollCam, which polls the
// arrows outside onKey) for every literal key read, and check the list BOTH ways -- every scraped key is
// reserved, and every reserved key was scraped, so a read refactored into a shape these patterns miss
// is red rather than quietly unlisted. Scraped out: the chat buffer's line (Enter sends, Backspace
// deletes, Escape cancels -- a text field's own keys, and every key returns from that line, so no binding
// can fire while it is open). Not matched: the preventDefault list (arrows, F1, F10), which is not a
// dispatch -- it suppresses the browser's own behaviour for the physical key whatever the binding.
{
  const method = header => { const s = ui.indexOf(header); const e = s < 0 ? -1 : ui.indexOf('\n  },', s); return s >= 0 && e > s ? ui.slice(s, e) : ''; };
  const onKey = method('  onKey(e) {'), scroll = method('  scrollCam(dt) {');
  const lines = onKey.split('\n'), chatLines = lines.filter(l => l.includes('if (this.chat !== null)'));
  const rest = lines.filter(l => !chatLines.includes(l)).join('\n');
  const expand = cls => { const out = []; for (let i = 0; i < cls.length; i++) { if (cls[i + 1] === '-' && cls[i + 2]) { for (let c = cls.charCodeAt(i); c <= cls.charCodeAt(i + 2); c++) out.push(String.fromCharCode(c)); i += 2; } else out.push(cls[i]); } return out; };
  const found = new Map(); let reads = 0;
  const add = (key, how) => { if (!found.has(key)) found.set(key, how); };
  const norm = k => k.length === 1 ? k.toLowerCase() : k;   // 'o' and 'O' are one key, as hit() sees them
  // (k === 'm' || k === 'M') && e.ctrlKey  is one read of ctrl+m, not two reads of a bare letter
  const bare = rest.replace(/\(k === '(\w)' \|\| k === '\w'\) && e\.ctrlKey/g, (m, c) => { add('ctrl+' + c.toLowerCase(), 'a ctrl chord'); reads++; return '<chord>'; });
  for (const m of bare.matchAll(/\bk [!=]== '([^']+)'/g)) { add(norm(m[1]), 'a literal'); reads++; }
  for (const m of bare.matchAll(/\/\^(F?)\[([^\]]+)\]\$\/\.test\(k\)/g)) { for (const c of expand(m[2])) add(m[1] + c, 'a character class'); reads++; }
  for (const m of scroll.matchAll(/this\.keys\.(\w+)/g)) { add(m[1], 'polled by scrollCam'); reads++; }
  // count guard: 22 reads and 29 distinct keys measured at REVIEW-M17 task 15. Fewer means a pattern
  // stopped matching -- or onKey lost a read, in which case lower these on purpose, with the RESERVED line.
  ok(onKey.length > 0 && scroll.length > 0 && chatLines.length === 1, 'the scrape found onKey, scrollCam and the chat buffer line', JSON.stringify([onKey.length, scroll.length, chatLines.length]));
  ok(reads >= 22 && found.size >= 29, 'the scrape found the hard-coded reads (count guard: at least 22 reads, 29 keys)', reads + ' reads, ' + found.size + ' keys: ' + [...found.keys()].join(' '));

  const r2 = vm.runInContext(`(() => {
    const out = { reserved: [...UI.RESERVED] };
    out.defaultsReserved = Object.keys(UI.BIND_DEFAULTS).filter(id => UI.reserved(UI.BIND_DEFAULTS[id].key));
    UI.resetBindings(); UI.setBinding('help', 'x');   // one non-default binding, so storage holds something a refusal could disturb
    const snap = () => JSON.stringify(Object.keys(UI.bindings()).map(id => UI.bindings()[id].key)) + '|' + localStorage.getItem('bw_binds');
    const before = snap();
    out.refused = {};
    for (const key of ['F8', 'ctrl+m', '5', 'F2', 'Escape', 'O', 'ctrl+f8', 'ArrowUp']) out.refused[key] = UI.setBinding('idleWorker', key);
    out.unchanged = snap() === before && UI.bindings().idleWorker.key === ',';
    out.plain = UI.setBinding('idleWorker', 'q') === true && UI.bindings().idleWorker.key === 'q';
    out.aDefault = UI.setBinding('idleWorker', ',') === true && UI.bindings().idleWorker.key === ',';
    // the menus close on the PAUSE BINDING, not on F10 by name
    UI.setBinding('pause', 'F11');
    const ev = key => ({ key, target: { tagName: 'CANVAS' }, preventDefault() { } });
    const wasRunning = UI.running; UI.running = true;
    UI.menu = 'pause'; UI.onKey(ev('F10')); out.f10Closes = UI.menu === null;
    UI.menu = 'pause'; UI.onKey(ev('F11')); out.f11Closes = UI.menu === null;
    UI.menu = null; UI.running = wasRunning;
    UI.resetBindings();
    return out;
  })()`, ctx);
  const reserved = new Set(r2.reserved);
  const unlisted = [...found].filter(([k]) => !reserved.has(k)).map(([k, how]) => k + ' (' + how + ')');
  ok(unlisted.length === 0, 'every key onKey or scrollCam reads by literal is in UI.RESERVED -- an unlisted one is a rebind that would share it', unlisted.join(', '));
  const stale = r2.reserved.filter(k => !found.has(k));
  ok(stale.length === 0, '...and every reserved key was found by the scrape (a stale entry, or a read the patterns no longer see)', stale.join(', '));
  ok(r2.defaultsReserved.length === 0, 'no default key is reserved, so a fresh profile is a legal one', r2.defaultsReserved.join(', '));
  const accepted = Object.keys(r2.refused).filter(k => r2.refused[k] !== false);
  ok(accepted.length === 0 && r2.unchanged, 'setBinding refuses a reserved key (F8, Ctrl+M, a digit, a camera slot, Escape, O for o, Ctrl+F8, an arrow) with false and changes nothing', JSON.stringify({ accepted, unchanged: r2.unchanged }));
  ok(r2.plain && r2.aDefault, '...and still binds a free key, and a default', JSON.stringify([r2.plain, r2.aDefault]));
  ok(r2.f11Closes && !r2.f10Closes, 'the menus close on the pause BINDING: with pause on F11, F11 closes the pause menu and F10 no longer does', JSON.stringify({ f11: r2.f11Closes, f10: r2.f10Closes }));

  // The Controls screen, live. bindRow is a const inside the DOMContentLoaded closure, so its source is
  // lifted out and run against a document that records listeners. A reserved key pressed on a rebind
  // button says so and leaves the binding alone; a free key binds; the capture listener is gone either way.
  const rowSrc = ui.slice(ui.indexOf('  const bindRow = (id, b, redraw) => {'), ui.indexOf('  UI.drawBindings = () => {'));
  ok(rowSrc.length > 100 && rowSrc.includes('press a key'), 'the scrape found bindRow', rowSrc.length);
  const r3 = vm.runInContext(`(() => {
    const out = {}; let grab = null, redraws = 0;
    const mk = document.createElement, add = window.addEventListener, rem = window.removeEventListener;
    window.addEventListener = (t, fn) => { if (t === 'keydown') grab = fn; };
    window.removeEventListener = (t, fn) => { if (fn === grab) grab = null; };
    document.createElement = tag => ({ tag, style: {}, className: '', textContent: '', kids: [], on: {}, addEventListener(t, fn) { this.on[t] = fn; }, appendChild(c) { this.kids.push(c); } });
    try {
      UI.resetBindings();
      ${rowSrc}
      const press = k => { const g = grab; g({ key: k, ctrlKey: false, preventDefault() { }, stopPropagation() { } }); };
      const row = bindRow('idleWorker', UI.bindings().idleWorker, () => { redraws++; });
      const btn = row.kids[1]; out.shows = btn.textContent;
      btn.on.click(); out.prompt = btn.textContent;
      press('F8'); out.afterF8 = { text: btn.textContent, key: UI.bindings().idleWorker.key, redraws, listenerGone: grab === null };
      btn.on.click(); press('q'); out.afterQ = { text: btn.textContent, key: UI.bindings().idleWorker.key, redraws, listenerGone: grab === null };
    } finally { document.createElement = mk; window.addEventListener = add; window.removeEventListener = rem; UI.resetBindings(); }
    return out;
  })()`, ctx);
  ok(r3.shows === ',' && r3.prompt === 'press a key...', 'a rebind button shows its key and asks for one when clicked', JSON.stringify([r3.shows, r3.prompt]));
  ok(r3.afterF8.text === 'F8 is reserved' && r3.afterF8.key === ',' && r3.afterF8.redraws === 0 && r3.afterF8.listenerGone, "pressing F8 on it says 'F8 is reserved', binds nothing, and the one-shot listener is gone", JSON.stringify(r3.afterF8));
  ok(r3.afterQ.key === 'q' && r3.afterQ.redraws === 1 && r3.afterQ.listenerGone, '...and pressing q binds q and redraws', JSON.stringify(r3.afterQ));
}

// The controls are the Controls TAB of Settings now (eighth session, the user's item 5: the hotkeys belong in Controls,
// and there is no separate Controls screen behind a button). The list and its reset live inside that tab's body.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const keysTab = (html.match(/<div class="tabBody" data-body="keys"[\s\S]*?\n    <\/div>/) || [''])[0];
for (const id of ['bindList', 'bindReset', 'keyStd', 'keyGrid'])
  ok(keysTab.includes('id="' + id + '"'), 'the Controls tab has #' + id);
ok(!/id="controlsPanel"|id="controlsBtn"|id="controlsBack"/.test(html), 'and there is no separate Controls screen any more');

console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
