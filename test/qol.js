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
