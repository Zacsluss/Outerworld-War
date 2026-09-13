// ESCAPE OPENS THE GAME MENU (tenth session, item 6; the user: "settings in-game should be bound to ESC, not F10"). Researched:
// Age of Empires IV's Escape is cancel, then the game menu; Beyond All Reason tries Escape's actions in order and the first
// that applies wins; StarCraft II keeps the menu on F10 and Escape only cancels. So Escape cancels what is half-done first --
// a placement, a target being chosen, a build menu, the chat line -- and otherwise opens the menu. It never destroys anything:
// a queued unit, an egg or a building going up is cancelled with its card's Cancel button.
//   node test/escmenu.js
//
//   1. Escape opens the game menu in a game, closes it again, and steps back out of Settings
//   2. ...but first cancels a placement, a target being chosen, a build menu, and the chat line
//   3. it cancels no queued unit and no unfinished building; those Cancels have no key, and are clicked
//   4. F10 does nothing by default; the key is a binding like any other, and the words on screen follow it
//  4b. the menus' own Resume and Back name the bound key too
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const { ok, counts, mkDom, root } = require('./_harness');
const J = v => JSON.stringify(v);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'atlas', 'fx', 'render', 'editor', 'ui', 'hud'];
const store = { bw_net: J({ name: 'Zac', url: '', race: 'R' }), bw_intro: '1' };
const document = mkDom(html), loaded = [];
const c = { console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { }, requestAnimationFrame() { }, Image: function () { }, WebSocket: function () { }, navigator: {},
  addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  location: { protocol: 'http:', host: 'x', origin: 'http://x', pathname: '/', search: '' }, history: { replaceState() { } }, document };
c.window = c; c.globalThis = c; vm.createContext(c);
for (const f of FILES) { const p = path.join(root, 'js', f + '.js'); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), c, { filename: f + '.js' }); }
vm.runInContext('UI.init = () => {}; UI.makeTicker = () => 1; Render.reset = () => {};', c);
for (const fn of loaded) fn();
const R = src => vm.runInContext('(() => {' + src + '})()', c);
R(`this.key = (k, o) => { const e = Object.assign({ key: k, target: { tagName: 'CANVAS' }, preventDefault() { }, ctrlKey: false, shiftKey: false }, o || {}); UI.onKey(e); };
this.scene = () => {
  UI.resetBindings();
  UI.start({ players: [{ race: 'T', human: true, name: 'Zac' }, { race: 'T', human: false, difficulty: 'easy', name: 'Bot' }], seed: 5, layout: 'temple' });
  for (const pl of G.players) if (!pl.neutral) pl.ai = null;
  const p = G.players[0]; p.minerals = 100000; p.gas = 100000; p.supMax = 200; UI.menu = null; UI.chat = null;
  return p;
};
this.hallOf = () => G.units.find(u => u.owner === 0 && u.def.depot);
this.put = (id, dx, dy, done) => { const h = hallOf(); const b = G.placeBuilding(DATA.buildings[id], h.tx + dx, h.ty + dy, 0); if (b && done !== false) G.completeBuilding(b); return b; };`);

console.log('--- 1. the menu ---');
{
  const r = R(`scene(); const out = {};
    out.binding = UI.key('pause');
    key('Escape'); out.opens = UI.menu;
    UI.menu = 'settings'; key('Escape'); out.fromSettings = UI.menu;
    key('Escape'); out.closes = UI.menu;
    return out;`);
  ok(r.binding === 'Escape' && r.opens === 'pause', 'Escape opens the game menu in a game (the pause binding\'s default is Escape now)', J(r));
  ok(r.fromSettings === 'pause' && r.closes === null, '...steps back out of Settings to the menu, and closes the menu', J(r));
}

console.log('--- 2. but first it cancels what is half-done ---');
{
  const r = R(`scene(); const out = {}; const scv = G.units.find(u => u.owner === 0 && u.def.worker);
    UI.selection = [scv]; UI.placing = { def: DATA.buildings.supply_depot, worker: scv }; key('Escape'); out.placing = { placing: UI.placing, menu: UI.menu };
    UI.pending = { kind: 'attack' }; key('Escape'); out.pending = { pending: UI.pending, menu: UI.menu };
    UI.cardMenu = 'basic'; key('Escape'); out.cardMenu = { cardMenu: UI.cardMenu, menu: UI.menu };
    UI.chat = 'gl h'; key('Escape'); out.chat = { chat: UI.chat, menu: UI.menu };
    key('Escape'); out.then = UI.menu;
    return out;`);
  ok(r.placing.placing === null && r.placing.menu === null, 'with a building being placed, Escape cancels the placement and opens nothing', J(r.placing));
  ok(r.pending.pending === null && r.pending.menu === null, 'with a target being chosen (Attack pressed), Escape cancels the targeting', J(r.pending));
  ok(r.cardMenu.cardMenu === null && r.cardMenu.menu === null, 'with the build menu open, Escape closes it', J(r.cardMenu));
  ok(r.chat.chat === null && r.chat.menu === null, 'with a chat line being typed, Escape drops the line and opens nothing', J(r.chat));
  ok(r.then === 'pause', '...and with nothing left to cancel, the next Escape opens the menu', J(r.then));
}

console.log('--- 3. it destroys nothing ---');
{
  const r = R(`scene(); const out = {};
    const bx = put('barracks', 8, 0); G.queueUnit(bx, 'marine'); G.queueUnit(bx, 'marine'); UI.selection = [bx];
    const q0 = bx.prod.length; key('Escape'); out.queue = { before: q0, after: bx.prod.length, menu: UI.menu }; UI.menu = null;
    const cancel = UI.currentCard().find(b => b.label === 'Cancel'); out.queueCancel = cancel ? { hk: cancel.hk, noKey: !!cancel.noKey } : null;
    if (cancel) UI.press(cancel); out.clicked = bx.prod.length;
    const dep = put('supply_depot', 0, 8, false); UI.selection = [dep];
    key('Escape'); out.building = { alive: dep.alive, menu: UI.menu }; UI.menu = null;
    const bc = UI.currentCard().find(b => b.label === 'Cancel'); out.buildingCancel = bc ? { hk: bc.hk, noKey: !!bc.noKey } : null;
    UI.setGridKeys(true); const bcg = UI.currentCard().find(b => b.label === 'Cancel'); out.gridHk = bcg ? bcg.hk : null; UI.setGridKeys(false);
    return out;`);
  ok(r.queue.before === 2 && r.queue.after === 2 && r.queue.menu === 'pause', 'Escape with a Barracks training two Marines cancels neither -- it opens the menu', J(r.queue));
  ok(r.queueCancel && r.queueCancel.hk === '' && r.queueCancel.noKey && r.clicked === 1, '...its Cancel has no key and still works when clicked', J({ cancel: r.queueCancel, clicked: r.clicked }));
  ok(r.building.alive === true && r.building.menu === 'pause' && r.buildingCancel && r.buildingCancel.hk === '' && r.gridHk === '', 'an unfinished Supply Depot survives Escape, and its Cancel has no key in Standard or in Grid', J(r));
}

console.log('--- 4. a binding like any other ---');
{
  const r = R(`scene(); const out = {};
    key('F10'); out.f10Default = UI.menu; UI.menu = null;
    UI.setBinding('pause', 'F10'); key('Escape'); out.escAfter = UI.menu; key('F10'); out.f10After = UI.menu; UI.menu = null;
    const texts = []; const realText = HUD.text, realBevel = HUD.bevel; HUD.text = (ctx, s) => texts.push(String(s)); HUD.bevel = () => {};
    try { UI.drawHelp({}); } finally { HUD.text = realText; HUD.bevel = realBevel; }
    out.helpF10 = texts.some(t => /^F10: cancel a target or a placement, otherwise the game menu/.test(t));
    UI.resetBindings(); texts.length = 0; HUD.text = (ctx, s) => texts.push(String(s)); HUD.bevel = () => {};
    try { UI.drawHelp({}); } finally { HUD.text = realText; HUD.bevel = realBevel; }
    out.helpEsc = texts.some(t => /^Escape: cancel a target or a placement, otherwise the game menu/.test(t));
    out.noF10 = !texts.some(t => /F10/.test(t));
    return out;`);
  ok(r.f10Default === null, 'F10 opens nothing by default any more', J(r));
  ok(r.escAfter === null && r.f10After === 'pause', 'the menu key is a binding: put it on F10 and F10 opens the menu while Escape does not', J(r));
  ok(r.helpF10 && r.helpEsc && r.noF10, 'the help overlay names the key as it is bound -- Escape by default, F10 when set -- and no longer says F10 on its own', J(r));
}

console.log('--- 4b. the menus\' own words ---');
{
  // Found walking PLAYTEST 92 automatically (tenth session, item 7): with the key on F10, Resume and Back still said Esc.
  const r = R(`scene(); const words = () => { UI.menu = 'pause'; const p = UI.menuItems().items[0][0]; UI.menu = 'settings'; const s = UI.menuItems().items.slice(-1)[0][0]; UI.menu = null; return [p, s]; };
    const dflt = words(); UI.setBinding('pause', 'F10'); const f10 = words(); UI.setBinding('pause', ''); const none = words(); UI.resetBindings(); return { dflt, f10, none };`);
  ok(J(r.dflt) === J(['Resume (Escape)', 'Back (Escape)']) && J(r.f10) === J(['Resume (F10)', 'Back (F10)']) && J(r.none) === J(['Resume', 'Back']),
    '...and so do the menus\' own words: Resume and Back name Escape, F10 when the key is put there, and no key when it has none', J(r));
}

const { pass, fail } = counts();
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
