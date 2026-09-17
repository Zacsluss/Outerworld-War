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
const fs = require('fs'), vm = require('vm'), path = require('path'), { makeCtx, makeOk, summary } = require('./_harness'); const root = path.join(__dirname, '..');
const ok = makeOk({ order: 'mc', extra: 'defined' });

const SIM = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot'];
// The one line js/game.js still needs, and where it goes.
// The hazard needs one call in G.tick(). It was written here as an INJECTION while the wiring was still
// outstanding -- js/game.js belonged to another agent -- and the test asserted the feature was inert
// without it. The call has since landed, so this now works the other way round: `bare` STRIPS it to
// prove the hazard is what causes the difference, and the shipped file is asserted to contain it.
const WIRE_CALL = 'this.map.tickHazard(this.frame, this.units);';

const errors = [];
function mkCtx(wire) {
  const c = makeCtx({ files: null, el: 'bare', errors });
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
    const territory = m.resources.reduce((a, r) => a + (r.type === 'mineral' ? r.amount : 0), 0) / m.players;
    const highMains = m.starts.filter(s => m.height[m.idx(s.x + 2, s.y + 1)] === 2).length;
    out[k] = { w: m.w, h: m.h, players: m.players, bases: m.bases.length, starts: m.starts.length, walk, high,
      spawnGap: m.starts.length > 1 ? Math.hypot(m.starts[0].cx - m.starts[1].cx, m.starts[0].cy - m.starts[1].cy) / TILE : 0,
      unreachable, centreOk: m.walk[cy * m.w + cx] === 1 && !!f.seen[cy * m.w + cx], unplaceable,
      patch: m.starts[0].minerals[0].amount, patches: m.starts[0].minerals.length, gas: m.starts[0].geyser.amount,
      mainBank, territory, highMains, size: m.size || null, hazard: !!m.hazard, name: m.name };
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
ok('a whole territory is worth about the same on large and huge, spread over more bases: ' + facts.large.territory + ' against ' + facts.huge.territory + ' minerals a player',
  Math.abs(facts.large.territory - facts.huge.territory) <= facts.large.territory * 0.05 && facts.huge.bases / facts.huge.players > facts.large.bases / facts.large.players);
ok('small is a two-player map and the rest are four', facts.small.players === 2 && [facts.medium, facts.large, facts.huge].every(f => f.players === 4));
// Small had no high ground at all until the looks queue gave every map StarCraft II's skeleton: a main up a ramp.
ok('every size puts every main on high ground, small included', SIZES.every(k => facts[k].high > 0 && facts[k].highMains === facts[k].players), SIZES.map(k => k + ' ' + facts[k].highMains + '/' + facts[k].players).join(', '));
ok('large and huge have a central plateau bigger than their four mains', facts.large.high > facts.medium.high && facts.huge.high > facts.large.high);

// The rules every existing test, mission and balance log was measured on must not have moved -- the ground did, in the looks queue.
ok('temple keeps its rules: 128x128, 16 bases, 1500 a patch, 5000 gas, no size mode, no hazard',
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
// 4. The hazard removes NO hit points, from anything -- FIXLIST-M14 A2
// ============================================================================
// The player's report was "the dust storm shouldn't hurt units, just be a visual thing". It used to
// deal 3 damage a second straight to hit points, and this section used to assert exactly that: a
// marine in the open lost 22.5 over one sweep, the wound scarred, and a wounded one died of the
// weather. Every one of those assertions is now inverted.
//
// THE TRAP IN A TEST LIKE THIS IS VACUITY. "Nothing lost hit points" also passes if the storm never
// went anywhere near the unit, or if the units were never spawned, or if tickHazard threw. So the
// first thing measured is `wouldHave`: how many damage pulses the OLD rule would have landed on the
// marine in the open, computed here from hazardState rather than from the deleted code. It was 15
// before, and it must still be 15 -- the storm passes over the unit exactly as it always did. Only
// then does "and it lost nothing" mean anything.
//
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
  // The old rule, restated here and applied to nothing: a pulse every twelfth frame, on every twelfth
  // frame the front covered the unit's centre. This is the measurement that keeps the section honest.
  let wouldHave = 0, ticked = 0;
  for (let f = 0; f <= m.hazard.warn + m.hazard.sweep; f++) {
    ticked += (m.tickHazard(f, G.units) === 0) ? 1 : 0;
    if (f % 12) continue;
    const s = m.hazardState(f); if (!s.active) continue;
    const a = (s.axis === 'y' ? open.y : open.x) / T;
    if (a >= s.t0 && a < s.t1) wouldHave++;
  }
  const lost = u => hp0.get(u.id) - u.hp;
  return { openLost: lost(open), burrowedLost: lost(burrowed), riderLost: lost(rider), ferryLost: lost(ferry),
    homeLost: lost(home), depotLost: lost(depot), doomedAlive: doomed.alive, lostStat: G.players[0].stats.unitsLost,
    wouldHave, ticked, frames: m.hazard.warn + m.hazard.sweep + 1, alive: G.units.filter(u => u.alive).length,
    dps: m.hazard.dps, safe: m.hazard.safe, openScarred: open.maxHp < open.def.hp };
`);
ok('the storm really does sweep over the unit in the open -- ' + dmg.wouldHave + ' pulses would have landed under the old rule', dmg.wouldHave === 15, String(dmg.wouldHave));
ok('a unit standing in the open through a whole sweep loses NOTHING', dmg.openLost === 0, String(dmg.openLost));
ok('and it is not scarred either -- there was no wound to remember', !dmg.openScarred);
ok('nothing else loses hit points either: burrowed, passenger, transport, home, building', dmg.burrowedLost === 0 && dmg.riderLost === 0 && dmg.ferryLost === 0 && dmg.homeLost === 0 && dmg.depotLost === 0,
  [dmg.burrowedLost, dmg.riderLost, dmg.ferryLost, dmg.homeLost, dmg.depotLost].join(' / '));
ok('the storm cannot kill: a marine on 4 hit points walks out of it', dmg.doomedAlive && dmg.lostStat === 0, 'alive ' + dmg.doomedAlive + ', lost ' + dmg.lostStat);
ok('every one of the six units that went in came out, and so did the depot', dmg.alive === 7, String(dmg.alive));
ok('tickHazard is inert on every frame of a sweep, not merely on most of them', dmg.ticked === dmg.frames, dmg.ticked + ' of ' + dmg.frames);
ok('the `dps` field is GONE rather than set to zero', dmg.dps === undefined, String(dmg.dps));
ok('`safe` survives, because js/render.js reads it to clear dust over a start', dmg.safe === 16, String(dmg.safe));
// The negative control in file form. Restoring the damage means reading a rate off the hazard and
// asking whether a point is inside it, and there are exactly three ways to spell those. `dps` appears
// once in js/map.js, inside the comment that explains this item, and never with a dot in front of it.
{ const src = fs.readFileSync(path.join(root, 'js', 'map.js'), 'utf8');
  ok('js/map.js reads no damage rate off the hazard -- there is no path from the weather to a hit point', !/\.dps\b/.test(src) && !/this\.hazard(Safe|At)\(/.test(src)); }

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
// THIS ASSERTION USED TO SAY THE OPPOSITE, and the inversion is the whole of FIXLIST-M14 A2. It read
// "the hazard changes the game it is in", and it passed because the storm was quietly taking hit
// points off both armies for twenty minutes. Now the storm is weather: it is announced, it crosses,
// it is drawn, and the simulation underneath it is the same simulation it would have been on a map
// with no weather at all. Twelve thousand frames of a real two-AI game, hashed.
//
// It is also the negative control for the whole item, and the cheapest one in the file: put `dps: 3`
// and the damage loop back into js/map.js and these two hashes separate immediately.
ok('THE STORM IS WEATHER, NOT A WEAPON: a hazard map plays bit-identically to the same map without one', wiredStorm.hash === wiredCalm.hash, 'storm ' + wiredStorm.hash + ' calm ' + wiredCalm.hash);
ok('and removing the tickHazard call cannot change that, because there is nothing left in it to remove', bareStorm.hash === wiredStorm.hash, bareStorm.hash + ' vs ' + wiredStorm.hash);
// The shipped file really does make the call, which is the part that would rot silently: the warning
// message and every dynamic map feature ride on it, and both would go quiet with every other check
// here still passing.
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

summary();
