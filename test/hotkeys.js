// EVERY COMMAND-CARD KEY IS THE PLAYER'S (eighth session, the user's item 5: "All controls in Hotkeys should be
// customizable"). The model is StarCraft II's (RESEARCH-LOBBY.md section 5): a key belongs to a command, so a command
// on many cards is one key; Standard and Grid are two layouts with their own sets of choices; a clash is shown, not
// silently resolved.
//
//  1. THE CATALOGUE IS THE CARD. The Controls tab edits UI.cardCatalog(), a list built from DATA. A list that drifts from
//     buildCard would let a player rebind a button they never see, or miss one they do -- so every card in it, for all
//     three races, is built for real (the unit or building spawned, everything researched) and compared button by button:
//     command, Standard letter, slot and page.
//  2. RESOLUTION: no choices is exactly the old card in both layouts; a choice replaces the letter everywhere that command
//     is; Grid and Standard keep separate choices; no key is expressible; Cancel keeps Escape.
//  3. THE KEYBOARD OBEYS IT: a rebound Marine is trained by its new letter and no longer by M; a rebound Move arms a move.
//  4. STORAGE: remembered, read back through the same rule it is written by, and nothing but letters is accepted.
//  5. CLASHES: a letter twice on one page of a card, or a letter an Interface binding holds, is reported for that command.
//  6. THE CONSOLE SHOWS IT: a chosen letter that is not in the button's name is drawn in the corner, as Grid's are.
//   node test/hotkeys.js
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = v => JSON.stringify(v);

function fakeCtx() {
  const grad = { addColorStop() { } };
  const c = { said: [], canvas: null, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: '', lineJoin: '', textAlign: '', textBaseline: '', globalCompositeOperation: '', imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: '',
    measureText(s) { return { width: String(s).length * 6 }; }, fillText(s, x, y) { c.said.push([String(s), x, y]); },
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; }, createPattern() { return null; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }, putImageData() { }, createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; } };
  for (const m of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'strokeText', 'translate', 'scale', 'rotate', 'transform', 'setTransform', 'resetTransform', 'drawImage', 'setLineDash', 'quadraticCurveTo', 'bezierCurveTo']) c[m] = () => { };
  return c;
}
function fakeCanvas() { const cv = { width: 1, height: 1, style: {}, getContext: () => cv._c || (cv._c = fakeCtx()), toDataURL: () => '', addEventListener() { }, appendChild() { }, remove() { }, click() { }, value: '' }; return cv; }
function mkCtx(stored) {
  const store = Object.assign({}, stored || {});
  const c = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, clearTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, location: { protocol: 'http:', host: 'localhost' },
    document: { getElementById: () => fakeCanvas(), createElement: () => fakeCanvas(), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] } };
  c.window = c; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  c.__store = store;
  return c;
}
const ctx = mkCtx();
const run = (body, c) => vm.runInContext('(() => {' + body + '})()', c || ctx);

// ---- the rig: a game to build every card in ----
run(`
  Render.init(document.getElementById('game')); Render.W = 1600; Render.H = 900;
  UI.start({ players: [{ race: 'T', human: true, name: 'Zac', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'Computer', team: 2 }], seed: 5, layout: 'temple' });
  UI.menu = null; G.recording = false; G.cheats.food = true;
  this.p = G.players[0]; this.base = { x: this.p.startX, y: this.p.startY + 6 * TILE };
  this.clear = () => { for (const u of G.units.slice()) if (u.owner === 0) G.kill(u, null, true); G.units = G.units.filter(u => u.alive); UI.selection = []; UI.cardMenu = null; UI.cardPage = 0; UI.pending = null; UI.placing = null; };
  this.spawn = (id, dx) => { const u = G.spawnUnit(id, 0, this.base.x + (dx || 0) * TILE, this.base.y); if (u.isBuilding) { u.done = true; u.hp = u.maxHp; u.progress = u.def.time; } if (u.maxEnergy || u.energy != null) u.energy = 250; return u; };
  // Build the state a card describes and return what the player's card really is, page by page.
  this.real = (race, card) => {
    this.clear(); const p = this.p; p.race = race; p.nukes = 3; p.upg = {}; p.researching = new Set(); p.msgs = []; p.minerals = 5000; p.gas = 5000;
    // EVERYTHING UNLOCKED, which is the card the catalogue describes: every requirement met (the Zerg aspects and the
    // Warp Gate's units hide until theirs are), every unit's research done -- but a building's own research NOT done,
    // or its buttons would be hidden as finished -- and anything that carries, carrying (Unload shows only then).
    p.hasReq = () => true; p.hasBuilding = () => true;
    const [kind, id, flying] = card.key.split(':');
    let sel;
    try {
      if (kind === 'menu') { p.tech = new Set(); sel = this.spawn(RACE_INFO[race].worker); UI.selection = [sel]; UI.cardMenu = flying; }
      else if (kind === 'bld') { p.tech = new Set(); sel = this.spawn(id); if (flying) sel.lifted = true; UI.selection = [sel]; }
      else {
        p.tech = new Set(Object.keys(DATA.techs));
        if (DATA.units[id].larva || DATA.units[id].egg) { const h = this.spawn(RACE_INFO.Z.hall, -6); G.spawnLarva(h); sel = h.larvae[h.larvae.length - 1]; if (DATA.units[id].egg) { G.applying = true; try { G.larvaMorph(sel, 'drone'); } finally { G.applying = false; } } }
        else sel = this.spawn(id);
        UI.selection = [sel];
      }
      if (G.cargoCap(sel) > 0) { const pax = this.spawn(RACE_INFO[race].worker, 3); sel.cargo.push(pax); pax.inside = sel; }
      const out = []; UI.cardPage = 0;
      const first = UI.currentCard(), more = first.find(b => /^More \\d+\\/\\d+$/.test(b.label || ''));
      const pages = more ? +more.label.split('/')[1] : 1;
      for (let pg = 0; pg < pages; pg++) { UI.cardPage = pg; for (const b of UI.currentCard()) { if (!b.cmd) continue; const k = b.cmd + '=' + b.hk + '@' + b.slot + (b.pin ? '' : '/' + pg); if (!out.includes(k)) out.push(k); } }
      UI.cardPage = 0;
      return out;
    } finally { delete p.hasReq; delete p.hasBuilding; }
  };
`);

// ---- 1. THE CATALOGUE IS THE CARD ----
{
  const cat = run('return UI.cardCatalog();');
  const counts = Object.keys(cat).map(r => r + ' ' + cat[r].length);
  ok(['T', 'Z', 'P'].every(r => cat[r].length > 30) && cat.T.some(c => c.key === 'unit:scv') && cat.Z.some(c => c.key === 'unit:larva') && cat.P.some(c => c.key === 'menu:P:adv'),
    'the catalogue has every race\'s units, buildings and build menus', counts.join(', '));
  const bad = [];
  for (const race of ['T', 'Z', 'P']) for (const card of cat[race]) {
    const want = card.buttons.filter(b => b.cmd).map(b => b.cmd + '=' + b.hk + '@' + b.slot + (b.page === -1 ? '' : '/' + b.page));
    let got; try { got = run('return this.real(' + J(race) + ', ' + J(card) + ');'); } catch (e) { got = ['threw ' + e.message]; }
    const sort = a => a.slice().sort();
    if (J(sort(want)) !== J(sort(got))) bad.push(card.key + '  catalogue ' + J(sort(want).filter(x => !got.includes(x))) + '  card ' + J(sort(got).filter(x => !want.includes(x))));
  }
  ok(bad.length === 0, 'every card in the catalogue is the card buildCard draws: the same commands, letters, slots and pages (' + ['T', 'Z', 'P'].reduce((n, r) => n + cat[r].length, 0) + ' cards)', '\n    ' + bad.slice(0, 12).join('\n    ') + (bad.length > 12 ? '\n    ...and ' + (bad.length - 12) + ' more' : ''));
  const ids = []; for (const r of ['T', 'Z', 'P']) for (const c of cat[r]) for (const b of c.buttons) if (b.cmd) ids.push(b.cmd);
  ok(ids.every(id => run('return UI.CARD_CMD_RE.test(' + J(id) + ');')) && [...new Set(ids)].length > 200, 'every command id is one setCardKey accepts', [...new Set(ids)].length + ' commands');
  const dupe = []; for (const r of ['T', 'Z', 'P']) for (const c of cat[r]) { const seen = new Set(); for (const b of c.buttons) if (b.cmd) { if (seen.has(b.cmd)) dupe.push(c.key + ' ' + b.cmd); seen.add(b.cmd); } }
  ok(dupe.length === 0, 'no command appears twice on one card', dupe.join(', '));
}

// ---- 2. RESOLUTION ----
{
  const card = sel => run(`this.clear(); const p = this.p; p.race = 'T'; p.tech = new Set(); const u = this.spawn(${J(sel)}); UI.selection = [u]; return UI.currentCard().map(b => b.label.replace(/ L\\d$/, '') + '=' + b.hk);`);
  const std = card('barracks');
  const letters = run(`const c = UI.cardCatalog().T.find(x => x.key === 'bld:barracks'); return c.buttons.filter(b => b.cmd).map(b => b.label + '=' + b.hk);`);
  ok(std[0] === 'Marine=M' && J(std) === J(letters), 'with no choices made, a Barracks is its own letters, as the catalogue lists them', J({ std, letters }));
  run('UI.setGridKeys(true);'); const grid = card('barracks'); run('UI.setGridKeys(false);');
  ok(grid.every((x, i) => x.endsWith('=' + 'QWERASDFZXCV'[i])), '...and in Grid, the letters of its slots', J(grid));
  // K, not Q: Q is also the Grid letter of the Marine's slot, and a check that cannot tell the two apart checks nothing.
  ok(run('return UI.setCardKey("unit:marine", "k");') === true, 'a Marine can be put on K (a lower-case letter is taken as the key)');
  const moved = card('barracks');
  ok(moved[0] === 'Marine=K' && moved.slice(1).join() === std.slice(1).join(), '...and the Barracks card then trains Marines on K, nothing else moved', J(moved));
  run('UI.setGridKeys(true);'); const grid2 = card('barracks'); run('UI.setGridKeys(false);');
  ok(J(grid2) === J(grid), 'a choice made in Standard is not a choice in Grid: the layouts keep separate sets', J(grid2));
  const move = () => run(`this.clear(); this.p.race = 'T'; const m = this.spawn('marine'); UI.selection = [m]; const a = (UI.currentCard().find(b => b.cmd === 'cmd:move') || {}).hk; this.clear(); const s = this.spawn('scv'); UI.selection = [s]; const b = (UI.currentCard().find(b => b.cmd === 'cmd:move') || {}).hk; return [a, b];`);
  run('UI.setCardKey("cmd:move", "Z");');
  ok(J(move()) === J(['Z', 'Z']), 'a general command is one key: Move on Z is Z for a Marine and for an SCV', J(move()));
  run('UI.setCardKey("cmd:move", "");');
  ok(J(move()) === J(['', '']), 'no key is a choice too: Move with no key has none', J(move()));
  // In both layouts: Grid gives every other button its slot's letter, and Cancel sits on a slot (the last) like any button.
  const esc = run(`this.clear(); const w = this.spawn('scv'); UI.selection = [w]; UI.cardMenu = 'basic'; const r = []; for (const g of [false, true]) { UI.setGridKeys(g); const c = UI.currentCard().find(b => b.label === 'Cancel'); r.push(c && c.hk); } UI.setGridKeys(false); UI.cardMenu = null; return r;`);
  ok(J(esc) === J(['Escape', 'Escape']), 'Cancel keeps Escape, in Standard and in Grid', J(esc));
  run('UI.resetCardKeys();');
  ok(J(card('barracks')) === J(std) && J(move()) === J(['M', 'M']), 'reset puts every key back');
}

// ---- 3. THE KEYBOARD OBEYS IT ----
{
  const press = (k, setup) => run(`this.clear(); this.p.race = 'T'; this.p.minerals = 5000; this.p.gas = 5000; ${setup || ''} const b = this.spawn('barracks'); UI.selection = [b];
    UI.onKey({ key: ${J(k)}, ctrlKey: false, shiftKey: false, target: {}, preventDefault() { } }); return b.prod.map(x => x.id);`);
  ok(J(press('m')) === J(['marine']), 'M on a Barracks trains a Marine', J(press('m')));
  run('UI.setCardKey("unit:marine", "Q");');
  ok(J(press('q')) === J(['marine']) && J(press('m')) === J([]), 'on Q it is Q that trains one, and M does nothing', J([press('q'), press('m')]));
  run('UI.resetCardKeys(); UI.setCardKey("cmd:move", "J");');
  const armed = run(`this.clear(); const m = this.spawn('marine'); UI.selection = [m]; UI.pending = null; UI.onKey({ key: 'j', ctrlKey: false, shiftKey: false, target: {}, preventDefault() { } }); const a = UI.pending && UI.pending.kind; UI.pending = null; UI.onKey({ key: 'm', ctrlKey: false, shiftKey: false, target: {}, preventDefault() { } }); return [a, UI.pending && UI.pending.kind];`);
  ok(J(armed) === J(['move', null]), 'Move on J arms a move on J, and M no longer does', J(armed));
  run('UI.resetCardKeys();');
}

// ---- 4. STORAGE ----
{
  const refused = run(`return [UI.setCardKey('unit:marine', '1'), UI.setCardKey('unit:marine', 'F5'), UI.setCardKey('unit:marine', ' '), UI.setCardKey('marine', 'Q'), UI.setCardKey('unit:<b>', 'Q'), UI.setCardKey('unit:marine', 'QQ')];`);
  ok(J(refused) === J([false, false, false, false, false, false]) && ctx.__store.bw_cardkeys === undefined, 'only a letter (or nothing) is accepted, only for a real command id, and a refusal stores nothing', J({ refused, stored: ctx.__store.bw_cardkeys }));
  run('UI.setCardKey("unit:marine", "Q"); UI.setGridKeys(true); UI.setCardKey("cmd:move", "N"); UI.setGridKeys(false);');
  const saved = JSON.parse(ctx.__store.bw_cardkeys || '{}');
  ok(J(saved) === J({ standard: { 'unit:marine': 'Q' }, grid: { 'cmd:move': 'N' } }), 'choices are remembered per layout', ctx.__store.bw_cardkeys);
  const c2 = mkCtx({ bw_cardkeys: ctx.__store.bw_cardkeys, bw_hotkeys: 'grid' });
  ok(vm.runInContext('UI.loadPrefs(); [UI.cardKeyFor("cmd:move", 0, "M"), UI.cardKeyFor("unit:marine", 0, "M")].join()', c2) === 'N,Q', 'and come back in the next page, each in its own layout');
  const c3 = mkCtx({ bw_cardkeys: J({ standard: { 'unit:marine': 'q', 'unit:<img>': 'X', 'cmd:move': 'F9', 'cmd:stop': 7, 'abil:stim': 'T' }, grid: 'nonsense' }) });
  ok(vm.runInContext('JSON.stringify(UI.cardKeyStore())', c3) === J({ standard: { 'abil:stim': 'T' }, grid: {} }), 'a stored choice that is not a letter for a real command is dropped on the way in', vm.runInContext('JSON.stringify(UI.cardKeyStore())', c3));
  const c4 = mkCtx({ bw_cardkeys: '{broken' });
  ok(vm.runInContext('JSON.stringify(UI.cardKeyStore())', c4) === J({ standard: {}, grid: {} }), 'and a store that is not JSON is no choices at all');
  run('UI.resetCardKeys();');
  ok(ctx.__store.bw_cardkeys === undefined, 'with no choices left, nothing is stored');
}

// ---- 5. CLASHES ----
{
  const clash = setup => run(`UI.resetCardKeys(); UI.resetBindings(); ${setup} const c = UI.cardCatalog().T.find(x => x.key === 'bld:barracks'); const r = UI.cardClashes(c); UI.resetCardKeys(); UI.resetBindings(); return r;`);
  ok(J(clash('')) === '{}', 'a Barracks as it comes has no clash', J(clash('')));
  const twice = clash('UI.setCardKey("unit:firebat", "M");');
  ok(/M is also Marine on this card/.test(twice['unit:firebat'] || '') && /M is also Firebat on this card/.test(twice['unit:marine'] || ''), 'a letter used twice on a card is reported against both commands', J(twice));
  const held = clash('UI.setBinding("idleWorker", "m");');
  ok(/M is Select idle worker \(Interface\), which is read first/.test(held['unit:marine'] || ''), 'a letter an Interface key holds is reported, naming that key', J(held));
  const pages = run(`UI.resetCardKeys(); const c = { buttons: UI.cardSlots(Array.from({ length: 14 }, (_, i) => ({ cmd: 'unit:x' + i, label: 'X' + i, hk: String.fromCharCode(65 + (i % 13)) }))) }; return UI.cardClashes(c);`);
  ok(Object.keys(pages).length === 0, 'the same letter on two different pages of one card is not a clash (only one page is on screen)', J(pages));
  const uses = run('return UI.cardUses();');
  ok(uses['cmd:move'] > 40 && uses['unit:marine'] === 1, 'the tab can say how far a change reaches: Move is on ' + uses['cmd:move'] + ' cards, a Marine on one', J({ move: uses['cmd:move'], marine: uses['unit:marine'] }));
}

// ---- 6. THE CONSOLE SHOWS IT ----
{
  const drawn = setup => run(`UI.resetCardKeys(); ${setup} this.clear(); this.p.race = 'T'; const b = this.spawn('barracks'); UI.selection = [b]; const c = Render.ctx; c.said.length = 0; UI.drawConsole(); const r = c.said.map(s => s[0]); UI.resetCardKeys(); UI.setGridKeys(false); return r;`);
  const plain = drawn('');
  ok(plain.includes('Marine') || plain.some(s => /arine/.test(s)), 'the rig draws the Barracks card', J(plain.slice(0, 20)));
  const corner = drawn('UI.setCardKey("unit:marine", "Q");');
  ok(corner.includes('Q') && !plain.includes('Q'), 'a letter chosen for the Marine that is not in its name is drawn on the button', J({ plain: plain.filter(s => s.length === 1), corner: corner.filter(s => s.length === 1) }));
  const grid = drawn('UI.setGridKeys(true);');
  ok(['Q', 'W', 'E', 'R'].every(k => grid.includes(k)), 'Grid\'s letters are drawn as they always were', J(grid.filter(s => s.length === 1)));
  const help = run('UI.resetCardKeys(); UI.setCardKey("cmd:move", "J"); const c = Render.ctx; c.said.length = 0; UI.drawHelp(c); const r = c.said.map(s => s[0]).join(" | "); UI.resetCardKeys(); return r;');
  ok(/J move/.test(help) && !/M move/.test(help), 'the F1 help names the keys as they are set, not as they shipped', help.slice(0, 200));
}

console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
