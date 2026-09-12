// Simulation snapshots. The whole point is that restoring one and carrying on must be
// indistinguishable from never having stopped, so most of this is hash comparison.
//   node test/snapshot.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); } };

const errors = [];
// A whole sim in its own context. Built by a function because the rejoin check at the bottom needs a
// second one that has never played the game -- which is the only way to see what a fresh process lacks.
function mkContext(errs) {
  const c = { console: { log() { }, warn() { }, error: (...a) => errs.push(String(a[0])) }, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { } }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
  c.window = c; c.__errors = errs; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  return c;
}
const ctx = mkContext(errors);
const run = src => vm.runInContext('(() => {' + src + '})();', ctx);

const START = `G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }, { race: 'P', human: false, difficulty: 'normal', name: 'C' }], seed: 6, layout: 'temple' });`;

// ---- reference: run straight through, noting the hash at several points ----
run(`
  ${START}
  this.ref = {};
  // 4800 as well as the 1500s: the no-perturb check below runs to 4800 (REVIEW-M17 made it a real comparison).
  for (let f = 1; f <= 12000; f++) { G.tick(); if (f % 1500 === 0 || f === 4800) this.ref[f] = G.stateHash(); }
`);
ok('the reference run produced hashes', Object.keys(ctx.ref).length === 9, JSON.stringify(Object.keys(ctx.ref)));

// ---- take a snapshot mid-game, run on, restore, run on again ----
run(`
  ${START}
  for (let f = 1; f <= 4500; f++) G.tick();
  this.hashAtSnap = G.stateHash();
  const t0 = Date.now(); this.snap = Snapshot.take(); this.takeMs = Date.now() - t0;
  this.snapBytes = JSON.stringify(this.snap).length;
  this.unitsAtSnap = G.units.filter(u => u.alive).length;
  for (let f = 4501; f <= 7500; f++) G.tick();
  this.hashAfter = G.stateHash();
`);
// REVIEW-M17: the two millisecond budgets that were here (take < 400, restore < 400) are printed now, not
// asserted -- test/all.js's header promises no wall-clock budgets in the gate, and a busy machine is not
// a regression. The numbers were 4 ms and 2 ms against 400 when they were removed.
console.log('   snapshot taken in ' + ctx.takeMs + 'ms for ' + ctx.unitsAtSnap + ' live units, ' + Math.round(ctx.snapBytes / 1024) + ' KB');
ok('running on from the snapshot matches the reference', ctx.hashAfter === ctx.ref[7500], ctx.hashAfter + ' vs ' + ctx.ref[7500]);

run(`
  const t0 = Date.now(); Snapshot.restore(this.snap); this.restoreMs = Date.now() - t0;
  this.hashRestored = G.stateHash();
  this.frameRestored = G.frame;
`);
ok('restoring puts the frame back', ctx.frameRestored === 4500, String(ctx.frameRestored));
ok('a restored state hashes the same as when it was taken', ctx.hashRestored === ctx.hashAtSnap, ctx.hashRestored + ' vs ' + ctx.hashAtSnap);
console.log('   restored in ' + ctx.restoreMs + 'ms');

// The real test: carry on simulating and land on exactly the reference states.
run(`
  this.after = {};
  for (let f = 4501; f <= 12000; f++) { G.tick(); if (f % 1500 === 0) this.after[f] = G.stateHash(); }
`);
for (const f of [6000, 7500, 9000, 10500, 12000]) {
  ok('re-simulating past the snapshot is bit-identical at frame ' + f, ctx.after[f] === ctx.ref[f], ctx.after[f] + ' vs ' + ctx.ref[f]);
}

// ---- object identity has to survive, not just values ----
run(`
  ${START}
  for (let f = 1; f <= 3000; f++) G.tick();
  const s = Snapshot.take();
  Snapshot.restore(s);
  let bad = 0, checkedT = 0, checkedC = 0, checkedR = 0, checkedP = 0;
  for (const u of G.units) {
    if (!u.alive) continue;
    if (u.def !== DATA.all[u.def.id]) { bad++; this.why = (this.why||[]).concat('def ' + u.def.id); }
    if (Object.getPrototypeOf(u) !== Unit.prototype) { bad++; this.why = (this.why||[]).concat('proto'); }
    if (u.player !== G.players[u.owner]) { bad++; this.why = (this.why||[]).concat('player'); }
    // a gather target is a map resource, not a unit, so it is checked against the resource list instead
    if (u.order && u.order.target) { const t = u.order.target; checkedT++; if (t.def ? G.byId.get(t.id) !== t : !G.map.resources.includes(t)) bad++; }
    for (const c of u.cargo) { checkedC++; if (G.byId.get(c.id) !== c) bad++; }
    if (u.geyser) { checkedR++; if (!G.map.resources.includes(u.geyser)) bad++; }
    if (u.order && u.order.type === 'build' && u.order.def) { checkedP++; if (u.order.def !== DATA.buildings[u.order.def.id]) bad++; }
  }
  this.identity = { bad, checkedT, checkedC, checkedR, checkedP, units: G.units.filter(u => u.alive).length };
`);
ok('restored units keep their prototype, def, player and cross-references',
  ctx.identity.bad === 0, JSON.stringify(ctx.identity));
ok('the identity check actually exercised references',
  ctx.identity.checkedT > 0 && ctx.identity.checkedR > 0, JSON.stringify(ctx.identity));

// ---- a snapshot must be independent of the live state ----
run(`
  ${START}
  for (let f = 1; f <= 2000; f++) G.tick();
  const s = Snapshot.take();
  const before = G.stateHash();
  for (let f = 2001; f <= 3000; f++) G.tick();   // mutate the live state hard
  Snapshot.restore(s);
  this.independent = G.stateHash() === before;
`);
ok('a snapshot is not aliased to the live state', ctx.independent === true);

// ---- taking a snapshot must not perturb the simulation ----
run(`
  ${START}
  for (let f = 1; f <= 2400; f++) G.tick();
  const h1 = G.stateHash();
  Snapshot.take(); Snapshot.take();
  this.noPerturb = G.stateHash() === h1;
  for (let f = 2401; f <= 4800; f++) G.tick();
  this.noPerturbLater = G.stateHash();
`);
ok('taking a snapshot does not perturb the simulation', ctx.noPerturb === true);
// REVIEW-M17: this line used to read `=== ctx.ref[4500] || true` -- always green, and comparing frame 4800
// against the frame-4500 reference. The reference run records 4800 now, so the comparison is real.
ok('...including its effect on later frames', ctx.noPerturbLater === ctx.ref[4800], ctx.noPerturbLater + ' vs ' + ctx.ref[4800]);

// ---- what a rejoin does: JSON over the wire, into a process that has not played the game ----
// The checks above all restore into a context that has already played, which hides a whole class of bug:
// G.units is reaped of the dead once a second while G.byId never forgets, so a played context still has
// the corpses the simulation points at (AI.think reads lastHitBy.owner without asking if the attacker is
// alive) and a fresh one does not. Restoring only G.units turned those references into null and the
// restored AI stopped defending a base the live one defended. It has to be late enough in the game for a
// corpse to be referenced at all, which is why 4500 frames never caught it.
{
  const other = mkContext([]);
  const LATE = 16800;
  run(`
    ${START}
    for (let f = 1; f <= ${LATE}; f++) G.tick();
    this.wireSnap = JSON.stringify(Snapshot.take());
    this.lateRef = {};
    for (let f = 1; f <= 240; f++) { G.tick(); if (f % 48 === 0) this.lateRef[f] = G.stateHash(); }
  `);
  vm.runInContext('this.wireSnap = ' + JSON.stringify(ctx.wireSnap) + ';', other);
  vm.runInContext(`(() => {
    ${START}
    Snapshot.restore(JSON.parse(this.wireSnap));
    this.got = {};
    for (let f = 1; f <= 240; f++) { G.tick(); if (f % 48 === 0) this.got[f] = G.stateHash(); }
  })();`, other);
  const frames = Object.keys(ctx.lateRef).map(Number).sort((a, b) => a - b);
  const bad = frames.filter(f => other.got[f] !== ctx.lateRef[f]);
  ok('a snapshot sent as JSON into a fresh process re-simulates bit-identically', bad.length === 0,
    bad.length ? 'diverged ' + bad.length + '/' + frames.length + ', first ' + (LATE + bad[0]) : frames.length + ' checkpoints from frame ' + LATE);
  ok('...and it carried the reaped units something still points at', JSON.parse(ctx.wireSnap).gone !== undefined,
    'gone=' + JSON.stringify((JSON.parse(ctx.wireSnap).gone || []).length));
  ok('no JS errors in the fresh process', (other.__errors || []).length === 0, (other.__errors || [])[0] || '');
}

// ---- the draw pass's scratch fields do not ride the snapshot (REVIEW-M17 task 17) ----
// render.js writes _x, _y and _alpha on every unit it draws and reads them back in the same frame; they
// are presentation, and they rode every checkpoint and every rejoin snapshot -- three floats per unit.
run(`
  ${START}
  for (let f = 1; f <= 600; f++) G.tick();
  const u = G.units.find(x => x.alive && !x.isBuilding); u._x = 123.5; u._y = 456.25; u._alpha = 0.45;   // what a drawn frame leaves behind
  const s = Snapshot.take(); const eu = s.units.find(x => x.id === u.id);
  this.renderKeys = { present: ['_x', '_y', '_alpha'].filter(k => k in eu), maxE: '_maxE' in eu, energyKept: eu._maxE === u._maxE, id: u.def.id };
  Snapshot.restore(s); const back = G.units.find(x => x.id === u.id);
  this.afterRestore = { hasX: '_x' in back, hasAlpha: '_alpha' in back, maxE: back._maxE };
`);
ok('a drawn unit\'s _x, _y and _alpha are not in its snapshot record (they were: three floats per unit per checkpoint and rejoin)', ctx.renderKeys.present.length === 0, JSON.stringify(ctx.renderKeys));
ok('...while _maxE, which is state, still rides it', ctx.renderKeys.maxE && ctx.renderKeys.energyKept, JSON.stringify(ctx.renderKeys));
ok('...and a restored unit carries none of the three until the next draw writes them', !ctx.afterRestore.hasX && !ctx.afterRestore.hasAlpha, JSON.stringify(ctx.afterRestore));

ok('no JS errors', errors.length === 0, errors[0] || '');
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');process.exit(fail ? 1 : 0);
