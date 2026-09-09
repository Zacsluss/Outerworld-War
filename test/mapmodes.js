// Map sizes as modes, and the sandstorm.
//   node test/mapmodes.js
//
// Two claims are under test and they fail in different ways, so they are checked differently.
//
// "The four sizes are different RULES" is a claim about a ladder: bases per player, spawn distance,
// playable area and the bank in a single base all have to move together and in the right direction.
// Any one of them alone is just a number, so the assertions below are on the ORDER of the four values,
// not on the values -- retuning small from 2000 to 1800 a patch should not break this file, but making
// huge's bases as fat as small's should.
//
// "The sandstorm is deterministic and does something" fails silently rather than loudly: a hazard that
// drifts by one frame between two clients desyncs a network game half a minute later and looks like a
// pathing bug. So it is checked as a pure function first (same frame in, same state out, in any call
// order), then in a real game against a byte-comparison of the state hash, and only then for whether it
// actually removes hit points.
//
// The one thing this file cannot check is the wiring, because js/game.js does not call tickHazard yet
// and this change does not own that file. The exact line is patched into game.js's source below, so the
// day the real wiring lands in a different shape, this test says so.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (m, c, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined ? '  ' + x : '')); } };

const SIM = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot'];
// The one line js/game.js still needs, and where it goes.
// The hazard needs one call in G.tick(). It was written here as an INJECTION while the wiring was still
// outstanding -- js/game.js belonged to another agent -- and the test asserted the feature was inert
// without it. The call has since landed, so this now works the other way round: `bare` STRIPS it to
// prove the hazard is what causes the difference, and the shipped file is asserted to contain it.
const WIRE_CALL = 'this.map.tickHazard(this.frame, this.units);';

const errors = [];
function mkCtx(wire) {
  const c = {
    console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0])) }, Math, performance, addEventListener() { }, setTimeout,
    document: { getElementById: () => ({ style: {}, addEventListener() { } }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { },
  };
  c.window = c; vm.createContext(c);
  for (const f of SIM) {
    let src = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
    if (!wire && f === 'game') src = src.split(WIRE_CALL).join('');   // bare: the hazard call removed
    vm.runInContext(src, c, { filename: f + '.js' });
  }
  return c;
}
const bare = mkCtx(false);           // game.js with the hazard call removed
const wired = mkCtx(true);           // game.js exactly as it ships
const R = (c, src) => vm.runInContext('(() => {' + src + '})();', c);

// ============================================================================
// 1. Four sizes, and the ladder they make
// ============================================================================
const SIZES = ['small', 'medium', 'large', 'huge'];
const facts = R(bare, `
  const out = {};
  const flood = (m, sx, sy) => {                     // 4-way flood over walkable ground
    const seen = new Uint8Array(m.w * m.h), q = [sy * m.w + sx]; seen[q[0]] = 1; let n = 0;
    while (q.length) { const i = q.pop(); n++; const x = i % m.w, y = (i / m.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const j = ny * m.w + nx; if (seen[j] || m.walk[j] !== 1) continue; seen[j] = 1; q.push(j); } }
    return { seen, n };
  };
  for (const k of ['small', 'medium', 'large', 'huge', 'temple', 'dustbowl']) {
    const m = new GameMap(7, k);
    let walk = 0, high = 0; for (let i = 0; i < m.w * m.h; i++) { if (m.walk[i] === 1) walk++; if (m.height[i] === 2) high++; }
    const f = flood(m, m.starts[0].x + 2, m.starts[0].y + 1);
    const unreachable = [];
    for (const b of m.bases) if (!f.seen[(b.y + 1) * m.w + b.x + 2]) unreachable.push('base ' + b.x + ',' + b.y);
    for (const s of m.starts) if (!f.seen[(s.y + 1) * m.w + s.x + 2]) unreachable.push('start ' + s.x + ',' + s.y);
    const cx = (m.w / 2) | 0, cy = (m.h / 2) | 0;
    const cc = DATA.buildings.command_center, pl = { id: 0, race: 'T' };
    const unplaceable = m.bases.map(b => m.canPlace(cc, b.x, b.y, pl, [], null) && (b.x + ',' + b.y + ': ' + m.canPlace(cc, b.x, b.y, pl, [], null))).filter(Boolean);
    const mainBank = m.starts[0].minerals.reduce((a, r) => a + r.amount, 0);
    out[k] = { w: m.w, h: m.h, players: m.players, bases: m.bases.length, starts: m.starts.length, walk, high,
      spawnGap: m.starts.length > 1 ? Math.hypot(m.starts[0].cx - m.starts[1].cx, m.starts[0].cy - m.starts[1].cy) / TILE : 0,
      unreachable, centreOk: m.walk[cy * m.w + cx] === 1 && !!f.seen[cy * m.w + cx], unplaceable,
      patch: m.starts[0].minerals[0].amount, patches: m.starts[0].minerals.length, gas: m.starts[0].geyser.amount,
      mainBank, size: m.size || null, hazard: !!m.hazard, name: m.name };
  }
  return out;
`);

for (const k of SIZES) {
  const f = facts[k];
  ok(k + ' is inside the engine\'s 64-256 tiles an axis (' + f.w + 'x' + f.h + ')', f.w >= 64 && f.w <= 256 && f.h >= 64 && f.h <= 256);
  ok(k + ' spawns as many players as it advertises (' + f.players + ')', f.starts === f.players, f.starts + ' spawn points');
  ok(k + ' every base is reachable on foot from spawn 0', f.unreachable.length === 0, f.unreachable.join(' | '));
  ok(k + ' the middle of the map is walkable and reachable', f.centreOk);
  ok(k + ' every base can actually take a town hall', f.unplaceable.length === 0, f.unplaceable.join(' ; '));
  ok(k + ' declares its size mode', f.size === k, String(f.size));
}
const asc = (name, vals) => ok(name + ' rises with size: ' + SIZES.map((k, i) => k + ' ' + vals[i]).join(', '),
  vals.every((v, i) => i === 0 || v > vals[i - 1]));
const per = SIZES.map(k => facts[k].bases / facts[k].players);
asc('bases per player', per);
asc('distance between the first two spawns', SIZES.map(k => Math.round(facts[k].spawnGap)));
asc('playable ground', SIZES.map(k => facts[k].walk));
// The bank in one base runs the other way, and that is the point: a small map cannot be won by
// out-expanding, so its mains have to hold enough to fight out of; a huge one must not let you sit.
ok('a main base holds less as the map grows: ' + SIZES.map(k => k + ' ' + facts[k].mainBank).join(', '),
  facts.small.mainBank > facts.medium.mainBank && facts.medium.mainBank >= facts.large.mainBank && facts.large.mainBank > facts.huge.mainBank);
ok('a whole territory is worth about the same on large and huge, spread over more bases',
  Math.abs((facts.large.mainBank / facts.large.patches * 33) - (facts.huge.mainBank / facts.huge.patches * 45)) < 1,
  (facts.large.patch * 33) + ' vs ' + (facts.huge.patch * 45));
ok('small is a two-player map and the rest are four', facts.small.players === 2 && [facts.medium, facts.large, facts.huge].every(f => f.players === 4));
ok('small has no high ground at all, so there is no ramp to hold', facts.small.high === 0);
ok('every other size has high ground', [facts.medium, facts.large, facts.huge].every(f => f.high > 0));
ok('large and huge have a central plateau bigger than their four mains', facts.large.high > facts.medium.high && facts.huge.high > facts.large.high);

// The layouts that every existing test, mission and balance log was measured on must not have moved.
ok('temple is untouched: 128x128, 16 bases, 1500 a patch, 5000 gas, no size mode, no hazard',
  facts.temple.w === 128 && facts.temple.h === 128 && facts.temple.bases === 16 && facts.temple.patch === 1500
  && facts.temple.gas === 5000 && facts.temple.size === null && facts.temple.hazard === false,
  JSON.stringify({ w: facts.temple.w, bases: facts.temple.bases, patch: facts.temple.patch, gas: facts.temple.gas, hazard: facts.temple.hazard }));

// ============================================================================
// 2. Generation is seeded, and the seed is the only thing that varies
// ============================================================================
const det = R(bare, `
  const grab = m => ({
    terrain: [m.height, m.walk, m.cliff, m.blocked].map(a => Array.from(a).join(',')).join('|'),
    noise: Array.from(m.noise).join(','),
    res: m.resources.map(r => [r.id, r.type, r.x, r.y, r.amount].join(':')).join(','),
    starts: m.starts.map(s => s.x + ',' + s.y).join(' '),
  });
  const out = {};
  for (const k of ['small', 'medium', 'large', 'huge', 'dustbowl']) {
    const a = grab(new GameMap(1234, k)), b = grab(new GameMap(1234, k)), c = grab(new GameMap(4321, k));
    out[k] = { same: JSON.stringify(a) === JSON.stringify(b), terrainSame: a.terrain === c.terrain, noiseDiffers: a.noise !== c.noise };
  }
  return out;
`);
for (const k of Object.keys(det)) {
  ok(k + ' generates identically twice from one seed', det[k].same);
  ok(k + ' is a fixed layout: the terrain does not move with the seed', det[k].terrainSame);
  ok(k + ' does use its seed (the noise field differs)', det[k].noiseDiffers);
}

// ============================================================================
// 3. The hazard as a pure function of the frame
// ============================================================================
const hz = R(bare, `
  const m = new GameMap(1, 'dustbowl'), plain = new GameMap(1, 'large');
  const h = m.hazard, period = h.warn + h.sweep + h.calm;
  const st = f => JSON.stringify(m.hazardState(f));
  // forwards, then the same frames backwards and shuffled: order must not matter
  const fwd = {}; for (let f = 0; f < period * 2; f += 7) fwd[f] = st(f);
  let stable = true;
  for (const f of Object.keys(fwd).map(Number).reverse()) if (st(f) !== fwd[f]) stable = false;
  for (const f of [999, 3, period * 2 - 7, 40, period + 11]) if (fwd[f] !== undefined && st(f) !== fwd[f]) stable = false;
  // exactly one active window per cycle, exactly sweep frames long, and the direction alternates
  let active = 0, edges = 0, prev = false;
  for (let f = 0; f < period; f++) { const a = m.hazardState(f).active; if (a) active++; if (a !== prev) edges++; prev = a; }
  const dirs = [0, 1, 2, 3].map(c => m.hazardState(c * period + h.warn + 10).dir);
  // the front enters entirely off one edge and leaves entirely off the other
  const s0 = m.hazardState(h.warn), s1 = m.hazardState(h.warn + h.sweep - 1);
  return { period, sweep: h.sweep, band: h.band, stable, active, edges, dirs,
    entersOff: s0.t1 <= 0, leavesOff: s1.t0 >= m.w - 1, plainNull: plain.hazardState(0) === null && plain.hazard === null,
    plainTick: plain.tickHazard(500, G.units || []) };
`);
ok('hazardState is a pure function of the frame, in any call order', hz.stable);
ok('one cycle has exactly one storm, exactly ' + hz.sweep + ' frames of it', hz.active === hz.sweep && hz.edges === 2, 'active ' + hz.active + ', edges ' + hz.edges);
ok('the storm alternates direction every cycle', JSON.stringify(hz.dirs) === JSON.stringify([1, -1, 1, -1]), JSON.stringify(hz.dirs));
ok('the whole front crosses: off one edge at the start, off the other at the end', hz.entersOff && hz.leavesOff);
ok('a layout with no hazard has none, and ticking it does nothing', hz.plainNull && hz.plainTick === 0);

// ============================================================================
// 4. The hazard removes hit points, from the right things and no others
// ============================================================================
// Driven a frame at a time with nothing else running, so every number below is the storm's alone.
const dmg = R(bare, `
  G.init({ players: [{ race: 'T', human: false, name: 'A' }, { race: 'T', human: false, name: 'B' }], seed: 3, layout: 'dustbowl' });
  for (const p of G.players) p.ai = null;
  for (const u of [...G.units]) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive);
  const m = G.map, T = TILE;
  const at = (id, tx, ty) => G.spawnUnit(id, 0, tx * T, ty * T);
  const open = at('marine', 96, 96);                       // middle of the map, nowhere near a start
  const burrowed = at('zergling', 96, 98); burrowed.burrowed = true;
  const ferry = at('dropship', 96, 100), rider = at('marine', 96, 100); rider.inside = ferry; ferry.cargo.push(rider);
  const home = at('marine', m.starts[0].cx / T, m.starts[0].cy / T + 2);   // inside the settled ground
  const doomed = at('marine', 96, 94); doomed.hp = 4;
  const depot = G.placeBuilding(DATA.buildings.supply_depot, 94, 104, 0); depot.done = true; depot.hp = depot.maxHp;
  const hp0 = new Map(G.units.map(u => [u.id, u.hp]));
  let touched = 0, pulses = 0;
  for (let f = 0; f <= m.hazard.warn + m.hazard.sweep; f++) { const n = m.tickHazard(f, G.units); if (n) { touched += n; pulses++; } }
  const lost = u => hp0.get(u.id) - u.hp;
  return { openLost: lost(open), burrowedLost: lost(burrowed), riderLost: lost(rider), ferryLost: lost(ferry),
    homeLost: lost(home), depotLost: lost(depot), doomedAlive: doomed.alive, lostStat: G.players[0].stats.unitsLost,
    pulses, touched, dps: m.hazard.dps, openScarred: open.maxHp < open.def.hp };
`);
// 15 pulses of 1.5 across a 24-tile front at 0.1333 tiles a frame: 22.5, and the arithmetic is exact.
ok('a unit standing in the open loses hit points to the storm (' + dmg.openLost + ')', dmg.openLost === 22.5, String(dmg.openLost));
ok('and the damage is exactly dps x time in the front', dmg.openLost === dmg.pulses * dmg.dps * 12 / 24, dmg.pulses + ' pulses');
ok('the wound scars, like every other wound', dmg.openScarred);
ok('a burrowed unit is sheltered', dmg.burrowedLost === 0, String(dmg.burrowedLost));
ok('a passenger is sheltered and its transport is not', dmg.riderLost === 0 && dmg.ferryLost > 0, dmg.riderLost + ' / ' + dmg.ferryLost);
ok('a unit in the settled ground around a start is sheltered', dmg.homeLost === 0, String(dmg.homeLost));
ok('buildings are never touched', dmg.depotLost === 0, String(dmg.depotLost));
ok('the storm can kill, and the loss is recorded', !dmg.doomedAlive && dmg.lostStat === 1, 'alive ' + dmg.doomedAlive + ', lost ' + dmg.lostStat);

// ============================================================================
// 5. The hazard inside a real game: deterministic, and it changes the game
// ============================================================================
const GAME = `G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 11, layout: 'LAYOUT' });
  for (let f = 0; f < FRAMES; f++) G.tick();
  return { hash: G.stateHash(), frame: G.frame, units: G.units.filter(u => u.alive).length };`;
const play = (c, layout, frames) => R(c, GAME.replace('LAYOUT', layout).replace('FRAMES', frames));
const FR = 7200;
const wiredStorm = play(wired, 'dustbowl', FR), wiredStorm2 = play(wired, 'dustbowl', FR);
const wiredCalm = play(wired, 'large', FR);
const bareStorm = play(bare, 'dustbowl', FR);
ok('a game on a hazard map re-runs bit-identically', wiredStorm.hash === wiredStorm2.hash, wiredStorm.hash + ' vs ' + wiredStorm2.hash);
ok('the hazard changes the game it is in', wiredStorm.hash !== wiredCalm.hash, 'storm ' + wiredStorm.hash + ' calm ' + wiredCalm.hash);
// Two halves of the same fact. Strip the call and a hazard map is indistinguishable from the same map
// without one -- which proves the hazard, and not some incidental layout difference, is what changes the
// game. And the shipped file really does make the call, which is the part that would rot silently: the
// feature would go quiet and every other check here would still pass.
ok('with the hazard call removed, a hazard map plays exactly as the same map without one', bareStorm.hash === wiredCalm.hash, bareStorm.hash + ' vs ' + wiredCalm.hash);
ok('and js/game.js actually makes that call', fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8').split(WIRE_CALL).length - 1 === 1, 'expected exactly one ' + WIRE_CALL);

// A snapshot knows nothing about the hazard and does not need to: restoring one and carrying on has to
// storm at the same frames, because the state is derived from the frame.
const snap = R(wired, `
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 11, layout: 'dustbowl' });
  for (let f = 0; f < 2000; f++) G.tick();
  const s = Snapshot.take();                       // mid-sweep: warn is 240, sweep runs to 2040
  const mid = G.map.hazardState(G.frame).active;
  for (let f = 0; f < 1500; f++) G.tick();
  const straight = G.stateHash();
  Snapshot.restore(s);
  for (let f = 0; f < 1500; f++) G.tick();
  return { mid, straight, restored: G.stateHash() };
`);
ok('the snapshot was taken inside a sweep', snap.mid);
ok('a restored snapshot storms at the same frames it did the first time', snap.straight === snap.restored, snap.straight + ' vs ' + snap.restored);

// ============================================================================
// 6. All four sizes actually play
// ============================================================================
// The sizes are useless if the AI cannot function on them, and the huge one is the first 256x256 map
// in the repository -- twice temple's axis and four times its area, so the pathfinder, the spatial hash
// and the AI's base search all see numbers they have never seen.
for (const k of SIZES) {
  const n = k === 'huge' ? 3600 : 4800;
  const r = R(bare, `
    G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 5, layout: '${k}' });
    for (let f = 0; f < ${n}; f++) G.tick();
    return { frame: G.frame,
      built: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding).length),
      army: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && !u.isBuilding).length), over: G.over };
  `);
  ok(k + ' plays ' + n + ' frames of AI vs AI', r.frame === n, JSON.stringify(r));
  ok(k + ' both players are building and producing on it', r.built.every(b => b >= 2) && r.army.every(a => a >= 4), JSON.stringify({ built: r.built, army: r.army }));
}
ok('no simulation errors were logged', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(fail ? `FAIL  ${pass} passed, ${fail} failed` : `ALL PASS  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
