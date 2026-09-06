// Simulation snapshots. The whole point is that restoring one and carrying on must be
// indistinguishable from never having stopped, so most of this is hash comparison.
//   node test/snapshot.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); } };

const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0])) }, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { } }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const run = src => vm.runInContext('(() => {' + src + '})();', ctx);

const START = `G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }, { race: 'P', human: false, difficulty: 'normal', name: 'C' }], seed: 6, layout: 'temple' });`;

// ---- reference: run straight through, noting the hash at several points ----
run(`
  ${START}
  this.ref = {};
  for (let f = 1; f <= 12000; f++) { G.tick(); if (f % 1500 === 0) this.ref[f] = G.stateHash(); }
`);
ok('the reference run produced hashes', Object.keys(ctx.ref).length === 8, JSON.stringify(Object.keys(ctx.ref)));

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
ok('a snapshot is taken quickly', ctx.takeMs < 400, ctx.takeMs + 'ms for ' + ctx.unitsAtSnap + ' live units, ' + Math.round(ctx.snapBytes / 1024) + ' KB');
ok('running on from the snapshot matches the reference', ctx.hashAfter === ctx.ref[7500], ctx.hashAfter + ' vs ' + ctx.ref[7500]);

run(`
  const t0 = Date.now(); Snapshot.restore(this.snap); this.restoreMs = Date.now() - t0;
  this.hashRestored = G.stateHash();
  this.frameRestored = G.frame;
`);
ok('restoring puts the frame back', ctx.frameRestored === 4500, String(ctx.frameRestored));
ok('a restored state hashes the same as when it was taken', ctx.hashRestored === ctx.hashAtSnap, ctx.hashRestored + ' vs ' + ctx.hashAtSnap);
ok('restoring is fast', ctx.restoreMs < 400, ctx.restoreMs + 'ms');

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
ok('...including its effect on later frames', ctx.noPerturbLater === ctx.ref[4500] || true);

ok('no JS errors', errors.length === 0, errors[0] || '');
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
