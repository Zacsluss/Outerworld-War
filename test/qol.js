// M12 wave one: the quality-of-life layer.
//
// Nine items, and the reason they are tested together is that they share one failure mode: every one
// of them is a convenience, so when one breaks the game still works and nobody notices. A selection
// cap that silently comes back, a worker that stops auto-mining, an autocast that fires when it should
// not -- none of those throw, none of them fail an existing test, and all of them are things a player
// feels rather than reports.
//   node test/qol.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const divs = {};
const div = id => (divs[id] = divs[id] || { id, style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] });
const calls = [];
const mkCtx = () => new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 1280, height: 720 };
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() { } });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (typeof k === 'symbol') return undefined;
    return (...a) => { calls.push({ op: k, a }); };
  },
  set(t, k, v) { calls.push({ op: '=' + String(k), a: [v] }); return true; },
});
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { },
  localStorage: { getItem() { return null; }, setItem() { } },
  document: { getElementById: div, createElement: () => ({ width: 0, height: 0, style: {}, addEventListener() { }, getContext: mkCtx }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' },
  __calls: calls, __mkCtx: mkCtx };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'sprites_units', 'sprites_buildings', 'sprites', 'atlas', 'fx', 'terrain', 'render', 'ui', 'hud']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

const r = vm.runInContext(`(() => {
  const out = {};
  const start = () => G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 5, layout: 'temple' });
  const P = () => G.players[G.human];

  // ---- 2. unlimited selection ----
  start(); UI.mode = 'play'; G.human = 0;
  const many = [];
  for (let i = 0; i < 40; i++) many.push(G.spawnUnit('marine', 0, P().startX + 60 + (i % 8) * 22, P().startY + 60 + Math.floor(i / 8) * 22));
  UI.select(many.slice());
  out.sel40 = UI.selection.length;
  const huge = many.slice(); for (let i = 0; i < 90; i++) huge.push(G.spawnUnit('marine', 0, P().startX + 200 + (i % 10) * 20, P().startY + 200 + Math.floor(i / 10) * 20));
  UI.select(huge.slice());
  out.sel130 = UI.selection.length;
  // control groups take the whole selection too
  UI.groups['1'] = UI.selection.slice();
  out.group = UI.groups['1'].length;
  // and the console can draw any of it without throwing
  Render.ctx = __mkCtx(); Render.W = 1280; Render.H = 720; Render.dpr = 1;
  let threw = null;
  try { __calls.length = 0; UI.drawSelGrid(Render.ctx, UI.selection, 300, 500, 700, 200); } catch (e) { threw = String(e && e.message || e); }
  out.gridDrew = { threw, calls: __calls.length, hotspots: UI.hotspots ? UI.hotspots.length : -1 };
  // REVIEW-M17 task 1: the strip through the console's OWN draw (hud.js replaces UI.drawConsole at load and
  // its branch never called drawSelGrid). Forty units, and every tile's hotspot has to lie on the console
  // band: the old branch capped itself at six columns of 58 px rows, so unit nineteen and everything
  // after it was drawn below the bottom of the screen -- measured in the browser, eighteen on the plate
  // and twenty-two off it, with nothing saying so.
  UI.select(many.slice()); UI.hotspots = []; __calls.length = 0; let threw40 = null;
  try { UI.drawConsole(); } catch (e) { threw40 = String(e && e.message || e); }
  const band = Render.H - UI.consoleH;
  out.strip40 = { threw: threw40, sel: UI.selection.length, hotspots: UI.hotspots.length, onPlate: UI.hotspots.filter(h => h.y >= band && h.y + h.h <= Render.H).length, offScreen: UI.hotspots.filter(h => h.y + h.h > Render.H).length };
  // ...and again in the NARROWEST window the doubled HUD has to work in. Measured in the page: at
  // 1024x768 the unit panel is only 155 console units wide, because the minimap and the card either side
  // of it doubled, and the shrink loop gave up at a 22-CONSOLE-unit tile -- a 36 px one on screen --
  // leaving ten of the forty in a "+10 more". The floor is 22 SCREEN pixels now, so all forty fit and
  // none of them is smaller than the smallest tile the game drew before the HUD was scaled at all.
  Render.W = 1024; Render.H = 768;
  UI.select(many.slice()); UI.hotspots = []; let threwN = null;
  try { UI.drawConsole(); } catch (e) { threwN = String(e && e.message || e); }
  const bandN = Render.H - UI.consoleH;
  out.strip40narrow = { threw: threwN, k: +UI.hudK.toFixed(3), hotspots: UI.hotspots.length,
    onPlate: UI.hotspots.filter(h => h.y >= bandN && h.y + h.h <= Render.H).length,
    offScreen: UI.hotspots.filter(h => h.y + h.h > Render.H).length,
    tileW: UI.hotspots.length ? Math.round(UI.hotspots[0].w) : 0 };
  Render.W = 1280; Render.H = 720;

  // ---- 2b. THE HUD'S SCALE (TODO-M18 item 5) ----
  // MEASURED FIRST, in the page (.claude/review/hud-measure.js): the band was clamp(Render.H * 0.26,
  // 140, 196) and above a 754 px window the CEILING decided it, so 1366x768 and 3840x2160 both got 196
  // px and the HUD read 25.5% of one screen and 9.1% of the other. HUD_SCALE doubles it; HUD_MAX_FRAC
  // stops it eating a short window. These are the numbers, not a shape -- a check that only asserted
  // "bigger than before" would pass on a scale of 1.01.
  out.hudScale = {};
  for (const wh of [[1280, 720], [1920, 1080], [2560, 1440], [800, 320]]) {   // 320: the only shape where HUD_MAX_FRAC bites below the 140 floor, so the band cannot grow at all
    Render.W = wh[0]; Render.H = wh[1];
    out.hudScale[wh[0] + 'x' + wh[1]] = { base: UI.consoleBase, ch: UI.consoleH, k: +UI.hudK.toFixed(3), frac: +(UI.consoleH / wh[1]).toFixed(3), mini: Math.round(UI.miniRect().s), btn: Math.round(UI.cardRect().bw) };
  }
  Render.W = 1280; Render.H = 720;

  // Every card button's click box is in SCREEN pixels while the card is DRAWN in console units, so a
  // missing conversion lands each click on a different button or on nothing at all. Pressing the centre
  // of every slot in turn has to press exactly those buttons, in that order.
  start(); G.human = 0; UI.mode = 'play';
  Render.ctx = __mkCtx(); Render.W = 1280; Render.H = 720; Render.dpr = 1;
  const cc3 = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  UI.select([cc3]); UI.hotspots = []; UI.drawConsole();
  const cr3 = UI.cardRect(), card3 = UI.currentCard(), pressed = [];
  const savedPress = UI.press; UI.press = b => { pressed.push(b.label); };
  for (const b of card3) {
    const bx = cr3.x + cr3.pad + (b.slot % UI.CARD_COLS) * (cr3.bw + cr3.gap);
    const by = cr3.y + cr3.pad + Math.floor(b.slot / UI.CARD_COLS) * (cr3.bh + cr3.gap);
    UI.consoleClick(bx + cr3.bw / 2, by + cr3.bh / 2, 0);
  }
  UI.press = savedPress;
  out.cardClicks = { n: card3.length, pressed: pressed.length, same: card3.length > 0 && pressed.join(',') === card3.map(b => b.label).join(','),
    onBand: cr3.y >= Render.H - UI.consoleH && cr3.y + cr3.h <= Render.H + 1, k: +UI.hudK.toFixed(3) };

  // The minimap hit test is in screen pixels too: its own rect's centre must be inside it, and a point
  // just above the band must not be.
  const mr3 = UI.miniRect();
  out.miniHit = { inside: UI.inMinimap(mr3.x + mr3.s / 2, mr3.y + mr3.s / 2), above: UI.inMinimap(mr3.x + mr3.s / 2, Render.H - UI.consoleH - 20),
    onBand: mr3.y >= Render.H - UI.consoleH && mr3.y + mr3.s <= Render.H };

  // Icons are rasterised at the size they are DRAWN at, not at the console-unit size: a 32 px icon
  // stretched to 52 is soft, and a doubled HUD exists to be legible. Sprites caches by size, so this is
  // one extra render per size and not per frame.
  const askedI = [], askedT = [];
  const realIcon = Sprites.icon.bind(Sprites), realTint = Sprites.tinted.bind(Sprites);
  Sprites.icon = (id, col, sz) => { askedI.push(sz); return realIcon(id, col, sz); };
  Sprites.tinted = (id, col, sz, t) => { askedT.push(sz); return realTint(id, col, sz, t); };
  UI.select([cc3]); UI.drawConsole();
  const crC = UI.cardRectC(), ikC = Math.round(32 * crC.k);
  UI.select(many.slice()); UI.drawConsole();
  Sprites.icon = realIcon; Sprites.tinted = realTint;
  out.iconRaster = { ikConsole: ikC, wantIcon: Math.max(8, Math.round(ikC * UI.hudK)), gotIcon: [...new Set(askedI)].sort((a, b) => a - b),
    gotTint: [...new Set(askedT)].sort((a, b) => a - b), k: +UI.hudK.toFixed(3) };
  // ...and HUD.sprite on its own, at one viewport that scales and one that cannot, which is the claim
  // stated without any of the strip's own fit arithmetic in the way.
  { const spyI = [], spyT = [];
    Sprites.icon = (id, col, sz) => { spyI.push(sz); return realIcon(id, col, sz); };
    Sprites.tinted = (id, col, sz, t) => { spyT.push(sz); return realTint(id, col, sz, t); };
    Render.W = 1280; Render.H = 720; const kBig = UI.hudK;
    HUD.sprite(Render.ctx, 'marine', '#f40404', 30, 0, 0); HUD.sprite(Render.ctx, 'marine', '#f40404', 30, 0, 0, 'rgba(60,230,60,0.8)');
    Render.W = 800; Render.H = 320; const kOne = UI.hudK;
    HUD.sprite(Render.ctx, 'marine', '#f40404', 30, 0, 0); HUD.sprite(Render.ctx, 'marine', '#f40404', 30, 0, 0, 'rgba(60,230,60,0.8)');
    Sprites.icon = realIcon; Sprites.tinted = realTint; Render.W = 1280; Render.H = 720;
    out.spriteRaster = { dest: 30, kBig: +kBig.toFixed(3), kOne, icon: spyI, tint: spyT }; }

  // ---- 3. multi-building production goes to the shortest queue ----
  start(); G.human = 0;
  const bars = [];
  for (let i = 0; i < 3; i++) { const b = G.placeBuilding(DATA.buildings.barracks, 30 + i * 5, 30, 0); G.completeBuilding(b); bars.push(b); }
  P().minerals = 2000; P().gas = 2000; P().supMax = 200;
  UI.select(bars.slice());
  const card = UI.buildCard();
  const marineBtn = card.find(b => b.label === 'Marine');
  out.multiCard = { gotCard: !!marineBtn, n: card.length };
  if (marineBtn) for (let k = 0; k < 6; k++) marineBtn.fn();
  out.spread = bars.map(b => b.prod.length);

  // ---- 4. a new worker mines by itself ----
  start(); G.human = 0;
  const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  P().minerals = 500;
  const w0 = G.units.filter(u => u.alive && u.owner === 0 && u.def.worker).length;
  G.queueUnit(cc, 'scv');
  for (let i = 0; i < 700; i++) G.tick();
  const ws = G.units.filter(u => u.alive && u.owner === 0 && u.def.worker);
  out.autoMine = { before: w0, after: ws.length, working: ws.filter(u => u.order.type === 'gather' || u.order.type === 'return').length };
  // ...but an explicit rally still wins
  start(); G.human = 0;
  const cc2 = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  P().minerals = 500;
  G.setRally(cc2, cc2.x + 400, cc2.y + 400, null);
  const w1 = G.units.filter(u => u.alive && u.owner === 0 && u.def.worker).length;
  G.queueUnit(cc2, 'scv');
  for (let i = 0; i < 620; i++) G.tick();
  const ws2 = G.units.filter(u => u.alive && u.owner === 0 && u.def.worker);
  out.rallyWins = { made: ws2.length > w1, newestOrder: ws2.length ? ws2[ws2.length - 1].order.type : 'none' };

  // ---- 5. smart casting: the RIGHT caster, not the first one ----
  // The naive reading of this feature is "one press, one cast", and that was already true: the ability
  // branch in execPending returns after the first unit for point and unit abilities alike. What was NOT
  // true is that it picked a sensible caster -- it took whatever happened to be first in the selection,
  // even with no energy and standing furthest away. So that is what this measures.
  start(); G.human = 0;
  const hts = [];
  for (let i = 0; i < 6; i++) { const h = G.spawnUnit('high_templar', 0, P().startX + 500 - i * 70, P().startY + 80); h.energy = 0; hts.push(h); }
  hts[4].energy = 200;                       // the only one that can pay, and it is not first in the list
  P().tech.add('psi_storm_tech');
  const foe = G.spawnUnit('marine', 1, P().startX + 120, P().startY + 80);
  G.players[0].vis.fill(2);
  UI.select(hts.slice());
  UI.pending = { kind: 'ability', abil: 'psi_storm' };
  UI.execPending(foe, foe.x, foe.y, false);
  const casters = hts.map((h, i) => (h.order && h.order.type === 'ability') ? i : -1).filter(i => i >= 0);
  out.smart = { casters, wanted: 4, energies: hts.map(h => h.energy) };

  // ---- 6. autocast ----
  start(); G.human = 0;
  const med = G.spawnUnit('medic', 0, P().startX + 100, P().startY + 100);
  out.armDefaultsOff = !(med.armed && med.armed.size);
  out.armed = G.setAutocast([med], 'heal');
  out.armedNow = !!(med.armed && med.armed.has('heal'));
  out.disarmed = G.setAutocast([med], 'heal');
  out.armedAfter = !!(med.armed && med.armed.has('heal'));
  // nothing that consumes a unit may ever be autocastable
  const forbidden = ['infest', 'nuke', 'consume', 'lurker_aspect', 'guardian_aspect', 'devourer_aspect', 'summon_archon', 'summon_dark_archon'];
  out.noUnitCostAutocast = forbidden.filter(id => DATA.abilities[id] && DATA.abilities[id].autocast);
  out.autocastSet = Object.keys(DATA.abilities).filter(k => DATA.abilities[k].autocast);
  // refuses to arm something not flagged
  out.refuses = G.setAutocast([med], 'psi_storm');

  // ---- 9. signals ----
  start(); G.human = 0;
  G.signals = [];
  G.signal(0, 'ping', 500, 600, null);
  G.signal(0, 'draw', 100, 100, [100, 100, 140, 130, 190, 150]);
  out.signals = G.signals.map(s => s.kind);
  const h0 = G.stateHash();
  G.signal(0, 'ping', 900, 900, null);
  out.hashUnchanged = G.stateHash() === h0;
  const before = G.signals.length;
  for (let i = 0; i < 200; i++) G.tick();
  out.expired = G.signals.length < before;
  // spam is bounded
  for (let i = 0; i < 400; i++) G.signal(0, 'ping', i, i, null);
  out.bounded = G.signals.length <= 80;
  return out;
})()`, ctx);

ok(r.sel40 === 40, 'a selection of 40 stays 40 -- the twelve-cap is gone', String(r.sel40));
ok(r.sel130 === 130, '...and so does one of 130', String(r.sel130));
ok(r.group === 130, 'a control group holds the whole selection too', String(r.group));
ok(!r.gridDrew.threw && r.gridDrew.calls > 0, 'the console draws 130 units without throwing', JSON.stringify(r.gridDrew));
ok(r.gridDrew.hotspots > 0, '...and every tile it draws is clickable', JSON.stringify(r.gridDrew));
ok(!r.strip40.threw && r.strip40.sel === 40 && r.strip40.hotspots === 40 && r.strip40.onPlate === 40, 'forty units through the console itself: forty tiles, every one on the console band (REVIEW-M17 task 1: the HUD drew eighteen and put the rest below the screen)', JSON.stringify(r.strip40));
ok(r.strip40.offScreen === 0, '...and none of them below the bottom of the screen', JSON.stringify(r.strip40));
ok(!r.strip40narrow.threw && r.strip40narrow.hotspots === 40 && r.strip40narrow.onPlate === 40 && r.strip40narrow.offScreen === 0 && r.strip40narrow.tileW >= 22,
  'forty of them still fit in the NARROWEST window the doubled HUD has to work in (1024x768), at a tile no smaller than the smallest the game drew before it was scaled at all -- the shrink floor is 22 SCREEN pixels, not 22 console units (TODO-M18 item 5; measured as ten lost to "+10 more")', JSON.stringify(r.strip40narrow));

ok(r.hudScale['1920x1080'].ch === 392 && r.hudScale['1920x1080'].k === 2 && r.hudScale['2560x1440'].ch === 392 && r.hudScale['2560x1440'].k === 2,
  'the console band is DOUBLED where there is room for it: 196 -> 392 px at 1080p and at 1440p (TODO-M18 item 5; it was a fixed 196 at every viewport from 1366x768 up)', JSON.stringify(r.hudScale));
ok(r.hudScale['1920x1080'].mini === 348 && r.hudScale['1920x1080'].btn === 106,
  '...and everything on it doubles with it, because it all derives from the band: the minimap 174 -> 348 and the card button 53 -> 106', JSON.stringify(r.hudScale['1920x1080']));
ok(r.hudScale['1280x720'].frac <= 0.42 && r.hudScale['1280x720'].k > 1.5 && r.hudScale['1280x720'].k < 2,
  'a short window gets as much of the doubling as fits and no more: 720p takes 42% of the height at k 1.61, not 52% at k 2', JSON.stringify(r.hudScale['1280x720']));
ok(r.hudScale['800x320'].k === 1 && r.hudScale['800x320'].ch === r.hudScale['800x320'].base && r.hudScale['800x320'].ch === 140,
  'a window too short even for the unscaled console behaves exactly as it did before -- hudK never goes below 1, so nothing is drawn off the plate', JSON.stringify(r.hudScale['800x320']));
ok(r.cardClicks.same && r.cardClicks.n > 0 && r.cardClicks.onBand && r.cardClicks.k !== 1,
  'the command card is drawn in console units and clicked in screen pixels: pressing the centre of every slot presses exactly those buttons, in order (' + r.cardClicks.n + ' of them, at scale ' + r.cardClicks.k + ')', JSON.stringify(r.cardClicks));
ok(r.miniHit.inside && !r.miniHit.above && r.miniHit.onBand,
  'the minimap hit test scales with the minimap: its own centre is inside it and a point above the band is not', JSON.stringify(r.miniHit));
ok(r.iconRaster.gotIcon.includes(r.iconRaster.wantIcon) && !r.iconRaster.gotIcon.includes(r.iconRaster.ikConsole),
  'a card icon is rasterised at the size it is DRAWN at (' + r.iconRaster.wantIcon + ' px, not the console-unit ' + r.iconRaster.ikConsole + '), so a doubled HUD is sharp rather than a stretched small one', JSON.stringify(r.iconRaster));
ok(r.spriteRaster.icon[0] === 48 && r.spriteRaster.tint[0] === 48 && r.spriteRaster.icon[1] === 30 && r.spriteRaster.tint[1] === 30,
  '...and the rule behind it, stated on its own: a 30 px destination asks the painter for 48 where the HUD is at 1.61 and for 30 where it is at 1 -- icons and selection-strip portraits alike', JSON.stringify(r.spriteRaster));


ok(r.multiCard.gotCard, 'three barracks selected together still get a production card', JSON.stringify(r.multiCard));
ok(r.spread.reduce((a, b) => a + b, 0) === 6, 'six presses queue six units', JSON.stringify(r.spread));
ok(Math.max(...r.spread) - Math.min(...r.spread) <= 1, '...spread across the three, not stacked on one', JSON.stringify(r.spread));

ok(r.autoMine.after === r.autoMine.before + 1 && r.autoMine.working === r.autoMine.after, 'a new worker goes to the minerals on its own', JSON.stringify(r.autoMine));
ok(r.rallyWins.made && r.rallyWins.newestOrder !== 'gather', 'but an explicit rally still wins -- an instruction beats a convenience', JSON.stringify(r.rallyWins));

// Asserted on ORDERS ISSUED, not on energy spent. Energy is the wrong probe: without smart casting all
// six templar are ordered to storm, but only the first one's storm actually lands -- the rest find the
// field already there and quietly do nothing, so "one unit paid" was true either way and the check
// passed with the feature removed. The negative control caught exactly that.
ok(r.smart.casters.length === 1, 'one storm press issues exactly one cast order', JSON.stringify(r.smart));
ok(r.smart.casters[0] === r.smart.wanted, '...from the templar that can actually pay for it, not whichever was first in the selection', JSON.stringify(r.smart));

ok(r.armDefaultsOff, 'autocast is off by default');
ok(r.armed === true && r.armedNow, 'arming an ability arms it', JSON.stringify([r.armed, r.armedNow]));
ok(r.disarmed === false && !r.armedAfter, '...and toggling again disarms it', JSON.stringify([r.disarmed, r.armedAfter]));
ok(r.refuses === false, 'an ability not flagged autocastable refuses to be armed');
ok(r.noUnitCostAutocast.length === 0, 'NOTHING that consumes a unit is autocastable', r.noUnitCostAutocast.join(', '));
ok(r.autocastSet.length >= 4, 'the autocast set is the Brood War one', r.autocastSet.join(', '));

ok(r.signals.join(',') === 'ping,draw', 'pings and drawings both land as signals', JSON.stringify(r.signals));
ok(r.hashUnchanged, 'a signal does NOT change the simulation hash -- a cosmetic broadcast must never desync');
ok(r.expired, 'signals expire');
ok(r.bounded, '...and spamming them is bounded');

console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
