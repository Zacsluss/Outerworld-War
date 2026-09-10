// FIXLIST-M14 B5 (item 15) -- an add-on keeps its own card, and the page turn has a slot.
//
// Reported as two things: "the more 1/2 button does nothing", and "hovering shows Apollo Reactor if a
// Control Tower is built -- a Terran main building should not show tech belonging to its add-on".
// They are ONE CAUSE, and finding that out took a measurement rather than an argument.
//
//   1. buildCard copied an add-on's tech, abilities and production onto its PARENT. Measured across
//      all seven Terran parent/add-on pairs, SIX leaked:
//
//        starport + control_tower     leaked Cloaking Field, Apollo Reactor
//        factory + machine_shop       leaked Ion Thrusters, Spider Mines, Siege Tech, Charon Boosters
//        science_facility + physics_lab   leaked Yamato Gun, Colossus Reactor
//        science_facility + covert_ops    leaked Lockdown, Personnel Cloaking, Ocular, Moebius
//        command_center + comsat_station  leaked Scanner Sweep
//        command_center + nuclear_silo    leaked Nuclear Missile
//        barracks + reactor               (nothing to leak)
//
//   2. That pushed the Starport to fourteen buttons and the Factory to thirteen, on a twelve-slot
//      grid -- so both paginated. And UI.paginate gave the flowed buttons the FULL capacity and then
//      pushed "More 1/2" on top of the last one: slot 11 twice. UI.consoleClick returns on the first
//      button whose rect contains the click and the flowed one comes first, so pressing "More 1/2"
//      pressed Apollo Reactor. The page could never turn and the tooltip named the wrong thing.
//
// Both halves, one cause, and the second one had never been pressed even by test/cardsay.js -- its
// pressSlot looks a button up by slot and got the flowed one too.
//
//   node test/addons.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
function fc() { const g = { addColorStop() { } }; const c = { said: [], font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: '', lineJoin: '', textAlign: '', textBaseline: '', globalCompositeOperation: '', imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: '', measureText(s) { return { width: String(s).length * 6 }; }, fillText(s) { if (c.said[c.said.length - 1] !== String(s)) c.said.push(String(s)); }, createLinearGradient() { return g; }, createRadialGradient() { return g; }, createPattern() { return null; }, getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }, putImageData() { }, createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; } }; for (const m of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'strokeText', 'translate', 'scale', 'rotate', 'transform', 'setTransform', 'resetTransform', 'drawImage', 'setLineDash', 'quadraticCurveTo', 'bezierCurveTo']) c[m] = () => { }; return c; }
function cvv() { const o = { width: 1, height: 1, style: {}, getContext: () => o._c || (o._c = fc()), toDataURL: () => '', addEventListener() { }, appendChild() { }, remove() { }, click() { }, value: '' }; return o; }
const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, clearTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { }, localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' }, document: { getElementById: () => cvv(), createElement: () => cvv(), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

// =============================================================================
// 1. THE AUDIT the item asked for: all five add-ons and all four parents
// =============================================================================
const audit = J(`(() => {
  UI.start({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 4, layout: 'temple' });
  UI.menu = null; Render.init(document.getElementById('game'));
  Render.W = 1600; Render.H = 900; Render.viewW = 1600; Render.viewH = 760;
  const p = G.players[0]; p.minerals = 99999; p.gas = 99999; p.supMax = 400;
  const st = G.map.starts[0]; let col = 0;
  const put = id => { col += 6; const b = G.placeBuilding(DATA.buildings[id], Math.floor(st.cx / TILE) + col, Math.floor(st.cy / TILE) + 14, 0); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
  const out = [];
  const pairs = [['barracks','reactor'],['factory','machine_shop'],['starport','control_tower'],
                 ['science_facility','physics_lab'],['science_facility','covert_ops'],
                 ['command_center','comsat_station'],['command_center','nuclear_silo']];
  for (const pr of pairs) {
    const parent = pr[0], addon = pr[1];
    const b = put(parent);
    const a = G.placeBuilding(DATA.buildings[addon], b.tx + b.def.w, b.ty + b.def.h - 2, 0);
    if (a) { a.done = true; a.hp = a.maxHp; a.parent = b; b.addon = a; }
    const names = ids => (ids || []).map(function (i) { return (DATA.techs[i] || DATA.units[i] || DATA.abilities[i] || {}).name; });
    const theirs = names(DATA.buildings[addon].tech).concat(names(DATA.buildings[addon].produces), names(DATA.buildings[addon].abil));
    UI.selection = [b]; UI.cardPage = 0;
    const parentCard = UI.currentCard().map(x => x.label);
    // every page of it, because a leak could be hiding on page two
    let all = parentCard.slice();
    for (let pg = 1; pg < 4; pg++) { UI.cardPage = pg; all = all.concat(UI.currentCard().map(x => x.label)); }
    UI.cardPage = 0;
    UI.selection = a ? [a] : [];
    const addonCard = a ? UI.currentCard().map(x => x.label) : [];
    out.push({ parent, addon, theirs, leaked: all.filter(function (l) { return theirs.indexOf(l) >= 0; }),
      parentCard, addonCard, parentSlots: parentCard.length, placed: !!a });
  }
  UI.selection = [];
  return out;
})()`);
ok(audit.length === 7, 'all five add-ons and all four parents were swept (seven pairs)', String(audit.length));
for (const a of audit) {
  ok(a.placed, a.parent + ' + ' + a.addon + ': the pair was built');
  ok(a.leaked.length === 0, a.parent + ' shows NONE of the ' + a.addon + '\'s tech, abilities or production', a.leaked.join(', '));
  if (a.theirs.length) ok(a.theirs.every(t => a.addonCard.indexOf(t) >= 0),
    '...and every one of them is on the ' + a.addon + '\'s OWN card instead', JSON.stringify([a.theirs, a.addonCard]));
}
{ const leakiest = audit.filter(a => a.theirs.length);
  ok(leakiest.length === 6, 'six of the seven pairs have something that COULD leak, so the check above is not vacuous', String(leakiest.length)); }
// The specific thing the player named.
{ const sp = audit.find(a => a.parent === 'starport');
  ok(sp.parentCard.indexOf('Apollo Reactor') < 0, 'THE REPORTED CASE: a Starport with a Control Tower does not show Apollo Reactor', sp.parentCard.join(', '));
  ok(sp.addonCard.indexOf('Apollo Reactor') >= 0, 'the Control Tower does', sp.addonCard.join(', ')); }

// =============================================================================
// 2. Every Terran card now fits, and the page turn has a slot of its own
// =============================================================================
{ const over = audit.filter(a => a.parentSlots > 12);
  ok(over.length === 0, 'no Terran parent card exceeds the twelve-slot grid any more', over.map(a => a.parent + ':' + a.parentSlots).join(', ')); }

const page = J(`(() => {
  const mk = n => { const out = []; for (let i = 0; i < n; i++) out.push({ slot: i, label: 'B' + i, fn: function () { } }); return out; };
  const pin = a => a.concat([{ slot: UI.CARD_SLOTS - 1, label: 'Cancel', hk: 'Escape', pin: true, fn: function () { } }]);
  const look = btns => {
    UI.cardPage = 0;
    const p0 = UI.paginate(btns);
    const more = p0.find(function (b) { return /^More/.test(b.label); });
    const collide = p0.filter(function (b) { return more && b.slot === more.slot; }).length;
    let reach = new Set(), worst = -1;
    for (let pg = 0; pg < 6; pg++) { UI.cardPage = pg; for (const b of UI.paginate(btns)) { worst = Math.max(worst, b.slot); if (/^B/.test(b.label)) reach.add(b.label); } }
    UI.cardPage = 0;
    return { hasMore: !!more, moreSlot: more ? more.slot : null, atThatSlot: collide, worst, reach: reach.size, n: p0.length };
  };
  return {
    // exactly one page's worth, plus one -- the shape that broke
    thirteen: look(mk(13)),
    twelve: look(mk(12)),
    withCancel13: look(pin(mk(13))),
    big: look(pin(mk(30))),
  };
})()`);
ok(page.twelve.hasMore === false && page.twelve.n === 12, 'a card of exactly twelve fits with no page turn at all', JSON.stringify(page.twelve));
ok(page.thirteen.hasMore, 'a card of thirteen grows one');
ok(page.thirteen.atThatSlot === 1, 'AND NOTHING ELSE IS ON ITS SLOT -- this is the bug: it used to share slot 11 with a real button', JSON.stringify(page.thirteen));
ok(page.thirteen.reach === 13, 'so all thirteen are reachable by paging', String(page.thirteen.reach));
ok(page.withCancel13.atThatSlot === 1 && page.withCancel13.reach === 13, 'and the same with a pinned Cancel present', JSON.stringify(page.withCancel13));
ok(page.big.atThatSlot === 1 && page.big.reach === 30 && page.big.worst < 12, 'a thirty-entry card still pages cleanly and never leaves the grid', JSON.stringify(page.big));

// The press, through the real click path, at the pixel the button is drawn at.
const press = J(`(() => {
  const st = G.map.starts[0];
  const b = G.units.find(function (u) { return u.owner === 0 && u.def.id === 'barracks'; });
  // give the Barracks enough buttons to overflow: it has 9, so add its build menu
  UI.selection = [b]; UI.cardPage = 0;
  // use the paginate-level fixture instead, driven through consoleClick geometry
  const fake = [];
  for (let i = 0; i < 14; i++) fake.push({ slot: i, label: 'B' + i, fn: function () { } });
  const saved = UI.currentCard;
  UI.currentCard = function () { return UI.paginate(fake); };
  const cr = UI.cardRect(), gap = cr.gap === undefined ? 4 : cr.gap;
  const card = UI.currentCard();
  const more = card.find(function (x) { return /^More/.test(x.label); });
  const bx = cr.x + 4 + (more.slot % UI.CARD_COLS) * (cr.bw + gap);
  const by = cr.y + 4 + Math.floor(more.slot / UI.CARD_COLS) * (cr.bh + gap);
  const before = UI.cardPage;
  UI.consoleClick(bx + cr.bw / 2, by + cr.bh / 2, 0);
  const after = UI.cardPage;
  const labelsAfter = UI.currentCard().map(function (x) { return x.label; });
  UI.currentCard = saved; UI.cardPage = 0; UI.selection = [];
  return { moreSlot: more.slot, before, after, moved: before !== after, labelsAfter };
})()`);
ok(press.moved && press.after === 1, 'CLICKING the page button where it is DRAWN advances the page -- the reported "it does nothing"', JSON.stringify(press));
ok(press.labelsAfter.some(l => /^More 2\/2/.test(l)), 'and page two says so', JSON.stringify(press.labelsAfter));

// =============================================================================
// 3. The negative control, in the file: the leak block is gone
// =============================================================================
{ const src = fs.readFileSync(path.join(root, 'js', 'ui.js'), 'utf8');
  ok(!/u\.addon\.def\.tech/.test(src) && !/u\.addon\.def\.produces/.test(src),
    'buildCard no longer reads the add-on\'s tech or production at all -- the leak is deleted, not filtered'); }

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
