// Rate of fire: does every weapon actually fire at the interval the table says?
//   node test/rates.js [--verbose]
//
// This test exists because of one bug and one sentence. `case 'hold'` in js/sim.js called fireAt()
// without checking the weapon cooldown, so a unit holding position with a target in range fired once
// per TICK -- 24 shots a second where a siege tank is allowed one per 75 frames. It survived several
// milestones and was found by a person playing for an afternoon ("my one tank is holding a position
// and has 81 kills in seemingly seconds"), because **nothing in this repository measured a rate**.
// Every check here asserts an outcome; an outcome test cannot tell 1 shot from 75.
//
// So: for every weapon in the game, put the unit next to something it can shoot, leave it there, and
// time the gaps between shots. `fireAt` sets `cooldown = wCd(w) + Math.floor(G.rand()*3) - 1`, which
// is BW's -1..+1 frame jitter, and the cooldown is decremented once per tick -- so EVERY observed gap
// must be exactly wCd, wCd-1 or wCd+1. That is a much sharper assertion than a mean, and it is the
// one that fails loudly if anyone ever bypasses the cooldown again.
//
// Both order paths are walked, because they are different code: 'attack' goes through engage(), which
// is where `if (this.cooldown <= 0)` has always lived, and 'hold' calls fireAt from the order switch,
// which is where it did not. The two immobile-attacker special cases get their own section, because
// the second half of the same fix was in `case 'attack'`: a sieged tank whose ordered target walks out
// of range re-acquires with autoTarget and used to fire at that, every frame.
const vm = require('vm'), path = require('path'), { makeCtx, makeOk, summary } = require('./_harness');
const VERBOSE = process.argv.includes('--verbose');
const ok = makeOk({ order: 'mc', verbose: () => VERBOSE });

const errors = [];
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'], el: 'bare', errors, collect: 'stack' });
const run = src => vm.runInContext(src, ctx);
const json = src => JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));

// ---------------------------------------------------------------- the rig
run(`(() => {
  // An empty arena at player 0's start. Both players keep one depot parked in the far base, because
  // "no buildings and no units" is instant defeat in checkVictory, a defeated player stops updating
  // vision, and a unit that cannot see cannot target -- the measurement would quietly read zero.
  this.setup = () => {
    G.init({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 11, layout: 'temple' });
    for (const p of G.players) { p.ai = null; p.minerals = 0; p.gas = 0; }
    G.recording = false;
    for (const u of G.units.slice()) if (u.owner === 0 || u.owner === 1) G.kill(u, null, true);
    const b = G.players[1];
    for (const id of [0, 1]) { const d = G.spawnUnit('supply_depot', id, b.startX + (id ? 120 : -120), b.startY); d.done = true; d.hp = d.maxHp; d.progress = d.def.time; }
    this.arena = { x: G.players[0].startX, y: G.players[0].startY };
    G.rebuildGrid(); G.updateVision();
  };

  // A dummy that cannot shoot back, cannot move, and cannot die: the only thing left that can limit
  // the attacker's rate of fire is the attacker's own cooldown.
  //  - high_templar: ground, no weapon, no autocast (a medic would auto-heal and take orders)
  //  - overlord: air, no weapon, no autocast
  this.dummyId = air => air ? 'overlord' : 'high_templar';

  this.measure = (spec) => {
    const born = [];
    const mk = (id, owner, x, y) => {
      const u = G.spawnUnit(id, owner, x, y); born.push(u);
      if (u.isBuilding) { u.done = true; u.hp = u.maxHp; u.sh = u.maxSh; u.progress = u.def.time; }
      u.lifetime = 0; // broodlings expire; nothing under test should die of old age mid-measurement
      return u;
    };
    const A = this.arena, r = { id: spec.id, slot: spec.slot, path: spec.path, label: spec.label || '' };
    const a = mk(spec.id, 0, A.x, A.y);
    if (spec.sieged) a.sieged = true;
    if (spec.burrowed) a.burrowed = true;
    for (const t of (spec.tech || [])) G.players[0].tech.add(t);
    // A Protoss defensive building is dead weight without psi, and tickBuilding recomputes unpowered
    // every tick, so it has to be real psi from a real Pylon -- 3 tiles clear of the 6.5x4.55 ellipse edge.
    if (spec.psi) { mk('pylon', 0, A.x - 3 * TILE, A.y); G.map.recomputePsi(0, G.units); }
    a.maxHp = 1e9; a.hp = 1e9; if (a.maxSh) { a.maxSh = 1e9; a.sh = 1e9; }

    const air = spec.slot === 'aw';
    const d = mk(this.dummyId(air), 1, A.x + 24 * TILE, A.y);
    d.maxHp = 1e9; d.hp = 1e9; d.maxSh = 0; d.sh = 0;
    const w = a.weaponFor(d);
    if (!w) { this.finish(born); return Object.assign(r, { skip: 'weaponFor() picked no weapon for a ' + (air ? 'flying' : 'ground') + ' target' }); }

    // Sit inside weapon range AND inside sight range (targeting an enemy needs vision), outside any
    // minimum range, at 70% of whichever limit is tighter.
    const rangePx = a.wRange(w) * TILE, sightPx = Math.max(TILE, (a.sight - 1.5) * TILE);
    let gap = Math.min(rangePx, sightPx) * 0.7;
    if (w.minRange) gap = Math.max(gap, w.minRange * TILE + 24);
    gap = Math.max(gap, 4);
    if (gap > rangePx) { this.finish(born); return Object.assign(r, { skip: 'minimum range ' + w.minRange + ' exceeds sight' }); }
    d.x = A.x + a.r + d.r + gap; d.y = A.y; d.px = d.x; d.py = d.y;

    // A second, deliberately out-of-range target for the immobile-attacker path. It has to be a
    // building: "case attack" drops a unit target it cannot see, and nothing can see 20 tiles.
    let far = null;
    if (spec.far) { far = mk('supply_depot', 1, A.x + 22 * TILE, A.y); far.maxHp = 1e9; far.hp = 1e9; }

    if (spec.stim) a.stim = 200;
    if (!a.isBuilding) a.applyOrder(spec.path === 'hold' ? { type: 'hold' } : { type: 'attack', target: far || d });
    G.rebuildGrid(); G.updateVision();

    const expect = spec.expect !== undefined ? spec.expect : a.wCd(w);
    const frames = Math.min(4000, Math.round(expect * 11 + 80));
    const gaps = []; let last = -1, shots = 0;
    for (let f = 0; f < frames; f++) {
      // top up the things that would otherwise run out and stop the clock for reasons other than the
      // cooldown: hp on both sides, stim (it ticks down), a Reaver's scarabs, a Carrier's interceptors
      d.hp = d.maxHp; a.hp = a.maxHp; if (a.maxSh) a.sh = a.maxSh; if (far) far.hp = far.maxHp;
      if (spec.stim) a.stim = 200;
      if (a.def.gw && a.def.gw.scarab) a.scarabs = 5;
      if (a.def.gw && a.def.gw.interceptor) a.interceptors = 8;
      G.tick();
      if (a.lastFire === G.frame) { shots++; if (last >= 0) gaps.push(G.frame - last); last = G.frame; }
      if (G.over) break;
    }
    const mean = gaps.length ? gaps.reduce((x, y) => x + y, 0) / gaps.length : 0;
    Object.assign(r, {
      name: a.def.name, race: a.def.race, expect, tableCd: w.cd, frames, shots, n: gaps.length,
      mean: +mean.toFixed(2), min: gaps.length ? Math.min.apply(null, gaps) : 0, max: gaps.length ? Math.max.apply(null, gaps) : 0,
      outOfBand: gaps.filter(g => g < expect - 1 || g > expect + 1).length,
      order: a.isBuilding ? '(building)' : a.order.type, powered: !a.unpowered,
    });
    this.finish(born);
    return r;
  };

  this.finish = (born) => { for (const u of born) if (u.alive) G.kill(u, null, true); G.units = G.units.filter(u => u.alive); G.rebuildGrid(); };

  // The negative control. There is no way to reintroduce the bug from a test file without editing
  // js/, so instead do by hand exactly what the broken "case hold" did -- call fireAt() from the
  // tick without consulting the cooldown -- and check the measurement above would have screamed.
  this.control = () => {
    const born = []; const A = this.arena;
    const a = G.spawnUnit('siege_tank', 0, A.x, A.y); born.push(a); a.sieged = true; a.maxHp = 1e9; a.hp = 1e9; a.lifetime = 0;
    const d = G.spawnUnit('high_templar', 1, A.x + 6 * TILE, A.y); born.push(d); d.maxHp = 1e9; d.hp = 1e9;
    G.rebuildGrid(); G.updateVision();
    const gaps = []; let last = -1;
    for (let f = 0; f < 300; f++) {
      d.hp = d.maxHp; a.hp = a.maxHp;
      G.tick();
      a.fireAt(d); // <-- the bug, verbatim: no if (this.cooldown <= 0)
      if (a.lastFire === G.frame) { if (last >= 0) gaps.push(G.frame - last); last = G.frame; }
    }
    const mean = gaps.length ? gaps.reduce((x, y) => x + y, 0) / gaps.length : 0;
    this.finish(born);
    return { n: gaps.length, mean: +mean.toFixed(2), min: gaps.length ? Math.min.apply(null, gaps) : 0, expect: 75 };
  };
  this.setup();
})();`);

// ---------------------------------------------------------------- what to measure
// `const DATA` inside a vm context is not an own property of the context object, so the tables come
// back through the evaluator rather than off ctx.
const tables = json(`(() => {
  const out = { units: [], buildings: [] };
  for (const [id, u] of Object.entries(DATA.units)) for (const slot of ['gw', 'aw']) {
    const w = u[slot]; if (!w) continue;
    out.units.push({ id, slot, name: u.name, race: u.race, cd: w.cd, suicide: !!w.suicide, notUnit: !!u.notUnit, worker: !!u.worker, burrowOnly: !!w.burrowOnly, scarab: !!w.scarab, interceptor: !!w.interceptor });
  }
  for (const [id, b] of Object.entries(DATA.buildings)) for (const slot of ['gw', 'aw']) {
    const w = b[slot]; if (!w) continue;
    out.buildings.push({ id, slot, name: b.name, race: b.race, cd: w.cd, psi: !!b.needsPsi });
  }
  return out;
})()`);

// Weapons with no interval to measure, and why. Each is a design fact, not a gap in coverage.
const NO_RATE = {
  spider_mine: 'the weapon kills the attacker (suicide)',
  scourge: 'the weapon kills the attacker (suicide)',
  infested_terran: 'the weapon kills the attacker (suicide)',
};
// Observed rates that deliberately differ from the table, with the line of code that overrides it.
// These are documented deviations; the test still pins them, so a change has to be a deliberate one.
const OVERRIDE = {
  scv: { cd: 22, why: 'fireAt() pins any worker to 22 frames: `if (this.def.worker && !this.isBuilding) this.cooldown = 22`' },
  drone: { cd: 22, why: 'fireAt() pins any worker to 22 frames' },
  probe: { cd: 22, why: 'fireAt() pins any worker to 22 frames' },
  carrier: { cd: 6, why: 'Combat.fire overrides the Carrier to `a.cooldown = 6`: the table cd is the launch attempt, the wing fires at its own 45' },
};

const rows = [];
const measure = spec => { const r = json('this.measure(' + JSON.stringify(spec) + ')'); rows.push(r); return r; };

// ---- 1. every unit weapon, in both order paths ----
for (const u of tables.units) {
  if (NO_RATE[u.id]) continue;
  if (u.notUnit) continue; // interceptor and scarab do not take orders; the interceptor gets its own case below
  const spec = { id: u.id, slot: u.slot };
  if (u.burrowOnly) spec.burrowed = true;
  if (OVERRIDE[u.id]) spec.expect = OVERRIDE[u.id].cd;
  for (const p of ['hold', 'attack']) measure(Object.assign({ path: p }, spec));
}
// ---- 2. the immobile attackers, which is where both halves of the Hold Position fix lived ----
measure({ id: 'siege_tank', slot: 'gw', path: 'hold', sieged: true, expect: 75, label: 'sieged' });
measure({ id: 'siege_tank', slot: 'gw', path: 'attack', sieged: true, expect: 75, label: 'sieged' });
// ...and the re-acquire branch: an ordered target out of range, something else in range. This is the
// exact shape the player hit -- being shot at turns hold into an attack order, then the target dies.
measure({ id: 'siege_tank', slot: 'gw', path: 'attack', sieged: true, far: true, expect: 75, label: 'sieged, ordered target out of range' });
measure({ id: 'lurker', slot: 'gw', path: 'attack', burrowed: true, far: true, label: 'burrowed, ordered target out of range' });
// ---- 3. the cooldown modifiers, so wCd is proven to be consulted at fire time and not at spawn ----
measure({ id: 'marine', slot: 'gw', path: 'hold', stim: true, expect: 8, label: 'stimmed (15 -> ceil(15/2))' });
measure({ id: 'marine', slot: 'gw', path: 'attack', stim: true, expect: 8, label: 'stimmed' });
measure({ id: 'zergling', slot: 'gw', path: 'attack', tech: ['adrenal'], expect: 6, label: 'adrenal glands (8 -> 6)' });
// ---- 4. defensive buildings: same `if (cooldown <= 0)`, in tickCombatBuilding ----
for (const b of tables.buildings) measure({ id: b.id, slot: b.slot, path: 'building', psi: b.psi });
// ---- 5. an Interceptor fires on its own cooldown while swooping ----
const inter = measure({ id: 'interceptor', slot: 'gw', path: 'attack', label: 'flown by hand, not by a Carrier' });

// ---------------------------------------------------------------- assertions
const say = r => `${r.name || r.id}${r.label ? ' [' + r.label + ']' : ''} ${r.slot} on ${r.path}`;
const detail = r => `expect ${r.expect}f  observed mean ${r.mean}f  min ${r.min} max ${r.max}  ${r.shots} shots (${r.n} gaps)  order=${r.order}`;

console.log('unit                      slot  path                     cd   shots  mean    min  max');
for (const r of rows) {
  if (r.skip) { console.log(`${(r.name || r.id).padEnd(25)} ${r.slot.padEnd(5)} ${r.path.padEnd(24)} SKIP ${r.skip}`); continue; }
  console.log(`${((r.name || r.id) + (r.label ? '*' : '')).padEnd(25)} ${r.slot.padEnd(5)} ${(r.path + (r.label ? ' ' + r.label : '')).slice(0, 24).padEnd(24)} ${String(r.expect).padStart(3)} ${String(r.shots).padStart(6)} ${String(r.mean).padStart(7)} ${String(r.min).padStart(4)} ${String(r.max).padStart(4)}`);
}
console.log('');

// A worker never auto-attacks on Hold: hasWeapon() is false for workers, so autoTarget returns null.
// That is correct Brood War behaviour and the reason a worker's hold row is expected to be silent.
const workerIds = tables.units.filter(u => u.worker).map(u => u.id);
for (const r of rows) {
  if (r.skip) continue;
  const isWorkerHold = workerIds.includes(r.id) && r.path === 'hold';
  if (isWorkerHold) { ok('a ' + r.name + ' does not auto-attack on Hold Position (workers have no auto-acquire)', r.shots === 0, detail(r)); continue; }
  ok(say(r) + ': fires at all', r.shots >= 3, detail(r));
  if (r.shots < 3) continue;
  ok(say(r) + ': keeps its order for the whole measurement', r.order === r.path || r.order === '(building)', 'ended on order "' + r.order + '"');
  // The assertion that matters. cooldown = wCd + floor(rand()*3) - 1, decremented once per tick, so
  // every gap is wCd-1, wCd or wCd+1. Anything faster is a bypassed cooldown; anything slower is a
  // shot the unit was entitled to and did not take.
  // The floor is the invariant: a shot sooner than cd-1 is a bypassed cooldown, full stop. The ceiling
  // is a fidelity check -- a unit that fires slower than its table is quietly weaker than the readme
  // claims. The Interceptor is the one row where the ceiling could legitimately move (it flies a 130px
  // pass between shots; at its current speed that fits inside its 45f cooldown, and the measured band
  // is 44-46). If a change to interceptor movement ever pushes it out, widen the ceiling for that row
  // only -- never the floor, for anything.
  ok(say(r) + ': never fires faster than its cooldown allows (' + (r.expect - 1) + 'f)', r.min >= r.expect - 1, detail(r));
  ok(say(r) + ': every gap between shots is within the BW -1..+1 jitter of ' + r.expect + 'f', r.outOfBand === 0, detail(r) + '  ' + r.outOfBand + ' of ' + r.n + ' gaps outside [' + (r.expect - 1) + ',' + (r.expect + 1) + ']');
  ok(say(r) + ': mean gap matches the weapon table (' + r.expect + 'f)', Math.abs(r.mean - r.expect) <= 1, detail(r));
}
const cannon = rows.find(r => r.id === 'photon_cannon');
if (cannon) ok('the Photon Cannon under test is actually powered (an unpowered one measures as silent)', cannon.powered === true);

// ---- the negative control: prove the measurement above is not vacuous ----
const ctrl = json('this.control()');
ok('control: a sieged tank fired from the tick without a cooldown check measures ~1 frame apart, not 75',
  ctrl.n > 100 && ctrl.mean < 2, JSON.stringify(ctrl));
ok('control: ...and that is outside the band this test enforces, so the Hold Position bug cannot come back silently',
  Math.abs(ctrl.mean - ctrl.expect) > 1 && ctrl.min < ctrl.expect - 1, JSON.stringify(ctrl));

for (const [id, why] of Object.entries(NO_RATE)) console.log('no rate to measure: ' + id + ' -- ' + why);
for (const [id, o] of Object.entries(OVERRIDE)) console.log('table overridden in code: ' + id + ' fires every ' + o.cd + 'f -- ' + o.why);

ok('no JS errors', errors.length === 0, errors[0] || '');
summary({ nl: true });
