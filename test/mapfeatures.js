// Destructible and dynamic map features, and the procedural archetypes that place them.
//   node test/mapfeatures.js
//
// Two features are under test and they fail in opposite ways.
//
// A DESTRUCTIBLE fails loudly the first time and quietly for ever after. Dropping a bridge changes
// `walk`, `blocked`, `cliff` and -- for a spire -- `height`, and only the first two of those are in a
// snapshot. So the interesting question is never "does breaking it change the grid", which is one
// line; it is "does the change survive a replay seek, a rejoin and a re-simulation". Section 4 takes a
// checkpoint, breaks things past it, restores, and compares the terrain tile for tile as well as the
// state hash -- because HANDOFF.md's hardest-won lesson is that a matching hash proves only that the
// hashed subset matches, and the terrain grids are not in it.
//
// An ARCHETYPE fails by producing one map in five hundred that cannot be played, which no amount of
// looking at the first one will find. So every assertion about generation runs over a spread of seeds
// and asserts a property rather than a value: inside 64-256, every base reachable WITH EVERY FEATURE
// IN ITS MOST BLOCKING STATE, every base able to take a town hall, and the same seed twice giving the
// same tiles. The worst-case flood is what makes "destroying everything cannot strand a player" a
// property of the map rather than a fact about the game that happened to be played on it.
'use strict';
const vm = require('vm'), path = require('path'), { makeCtx, makeOk, summary } = require('./_harness');
const ok = makeOk({ order: 'mc', extra: 'defined' });

const SIM = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot'];
const errors = [];
const ctx = (() => {
  const c = makeCtx({ files: SIM, el: 'bare', errors });
  return c;
})();
const R = src => vm.runInContext('(() => {' + src + '})();', ctx);

const KEYS = R('return Archetypes.keys;');
const SEEDS = [1, 2, 3, 11, 47, 1234, 65535, 987654];

// ============================================================================
// 1. The archetypes generate legal maps, on every seed and every size
// ============================================================================
const gen = R(`
  const out = {}, cc = DATA.buildings.command_center;
  for (const k of Archetypes.keys) {
    const rows = [];
    for (const seed of ${JSON.stringify(SEEDS)}) {
      const m = new GameMap(seed, Archetypes.id(k, seed));
      const kinds = {}; for (const f of m.features) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
      // reachability with every feature shut at once, from every start, not only the first
      const worst = m.worstWalk(); const un = [];
      for (const s of m.starts) {
        const seen = m.floodWalk(worst, s.x + 2, s.y + 4);
        for (const b of m.bases) if (!seen[m.baseAnchor(b)]) un.push(b.x + ',' + b.y + ' from ' + s.x + ',' + s.y);
      }
      // ...and with every feature actually destroyed, which is a different grid
      const m2 = new GameMap(seed, Archetypes.id(k, seed));
      for (const f of m2.features) m2.breakFeature(f);
      const un2 = [];
      const seen2 = m2.floodWalk(m2.walk, m2.starts[0].x + 2, m2.starts[0].y + 4);
      for (const b of m2.bases) if (!seen2[m2.baseAnchor(b)]) un2.push(b.x + ',' + b.y);
      const noHall = m.bases.map(b => m.canPlace(cc, b.x, b.y, { id: 0, race: 'T' }, [], null) && (b.x + ',' + b.y + ': ' + m.canPlace(cc, b.x, b.y, { id: 0, race: 'T' }, [], null))).filter(Boolean);
      const noHall2 = m2.bases.map(b => m2.canPlace(cc, b.x, b.y, { id: 0, race: 'T' }, [], null)).filter(Boolean);
      let walk = 0, high = 0; for (let i = 0; i < m.w * m.h; i++) { if (m.walk[i] === 1) walk++; if (m.height[i] === 2) high++; }
      rows.push({ seed, w: m.w, h: m.h, players: m.players, starts: m.starts.length, bases: m.bases.length,
        feats: m.features.length, kinds, un, un2, noHall, noHall2, walk, high, archetype: m.archetype,
        tileset: m.tileset, carved: new GameMap(seed, Archetypes.id(k, seed)).repairConnectivity() });
    }
    out[k] = rows;
  }
  return out;
`);

for (const k of KEYS) {
  const rows = gen[k];
  ok(k + ' generates on every seed inside the engine\'s 64-256 tiles an axis',
    rows.every(r => r.w >= 64 && r.w <= 256 && r.h >= 64 && r.h <= 256), JSON.stringify(rows.map(r => r.w + 'x' + r.h)));
  ok(k + ' spawns as many players as it advertises on every seed',
    rows.every(r => r.starts === r.players && r.players >= 2), rows.map(r => r.starts + '/' + r.players).join(' '));
  ok(k + ' every base is reachable from every start WITH EVERY FEATURE SHUT',
    rows.every(r => r.un.length === 0), rows.flatMap(r => r.un).slice(0, 3).join(' | '));
  ok(k + ' every base is still reachable once every feature has been destroyed',
    rows.every(r => r.un2.length === 0), rows.flatMap(r => r.un2).slice(0, 3).join(' | '));
  ok(k + ' every base can take a town hall, before and after the map is wrecked',
    rows.every(r => r.noHall.length === 0 && r.noHall2.length === 0), rows.flatMap(r => r.noHall).slice(0, 3).join(' ; '));
  ok(k + ' says which archetype it is', rows.every(r => r.archetype === k));
  ok(k + ' places features on every seed (' + rows.map(r => r.feats).join(',') + ')', rows.every(r => r.feats > 0));
  ok(k + ' gives every player at least three bases', rows.every(r => r.bases >= r.players * 3), rows.map(r => r.bases).join(','));
}
// The generators are meant to be legal by construction; the carve is the net under them, not the floor.
ok('the connectivity repair never had to fire on any of the ' + (KEYS.length * SEEDS.length) + ' maps above',
  KEYS.every(k => gen[k].every(r => r.carved === 0)), KEYS.map(k => k + ':' + gen[k].map(r => r.carved).join('/')).join(' '));

// Each shape has to be recognisable, or "archetype" means nothing.
ok('chokepoint valley is a river with one tidal crossing', gen.chokepoint.every(r => r.kinds.floodgate === 1 && r.kinds.rocks >= 2), JSON.stringify(gen.chokepoint[0].kinds));
ok('island chain is made of bridges and nothing else', gen.islands.every(r => r.kinds.bridge >= 4 && Object.keys(r.kinds).length === 1), JSON.stringify(gen.islands[0].kinds));
ok('open basin has spires to fight over and less high ground than vertical cliffs',
  gen.basin.every(r => r.kinds.spire >= 4) && gen.basin[0].high < gen.cliffs[0].high * (gen.basin[0].w * gen.basin[0].h) / (gen.cliffs[0].w * gen.cliffs[0].h),
  'basin high ' + gen.basin[0].high + ' of ' + (gen.basin[0].w * gen.basin[0].h) + ', cliffs ' + gen.cliffs[0].high + ' of ' + (gen.cliffs[0].w * gen.cliffs[0].h));
ok('vertical cliffs puts rock formations in its ramps and spires on its floor', gen.cliffs.every(r => r.kinds.rocks >= 2 && r.kinds.spire >= 2), JSON.stringify(gen.cliffs[0].kinds));
ok('between them the four archetypes use all four kinds of feature',
  ['rocks', 'bridge', 'spire', 'floodgate'].every(kind => KEYS.some(k => gen[k].every(r => r.kinds[kind] > 0))));

// ============================================================================
// 2. Generation is seeded: same seed, same map, every time
// ============================================================================
const det = R(`
  const sig = m => [
    Array.from(m.height).join(''), Array.from(m.walk).join(''), Array.from(m.cliff).join(''), Array.from(m.blocked).join(','),
    m.features.map(f => [f.id, f.kind, f.x, f.y, f.w, f.h, f.hp, f.maxHp, f.broken].join(':')).join('|'),
    m.bases.map(b => [b.x, b.y, b.main, b.natural, b.minerals.map(r => r.x + '.' + r.y + '.' + r.amount).join('~'), b.geyser && b.geyser.amount].join(':')).join('|'),
    m.starts.map(s => s.x + ',' + s.y).join(' '), m.name, m.tileset, m.players,
  ].join('#');
  const out = {};
  for (const k of Archetypes.keys) {
    const same = [], differ = new Set(), order = [];
    for (const seed of ${JSON.stringify(SEEDS)}) {
      const a = sig(new GameMap(1, Archetypes.id(k, seed)));
      const b = sig(new GameMap(1, Archetypes.id(k, seed)));
      same.push(a === b); differ.add(a);
    }
    // ...and in a different call order, and with other archetypes generated in between, because the
    // generator's RNG must not carry a word of state from one call into the next
    for (const seed of [...${JSON.stringify(SEEDS)}].reverse()) { for (const o of Archetypes.keys) new GameMap(1, Archetypes.id(o, seed + 5)); order.push(sig(new GameMap(1, Archetypes.id(k, seed)))); }
    out[k] = { same: same.every(Boolean), uniq: differ.size, orderFree: order.reverse().every((s, i) => differ.has(s)) && new Set(order).size === differ.size,
      seedIndependent: sig(new GameMap(1, Archetypes.id(k, 7))) === sig(new GameMap(999, Archetypes.id(k, 7))) };
  }
  // and the layout DESCRIPTION itself, which is what a network game would agree on
  out.__ids = Archetypes.keys.map(k => JSON.stringify(Archetypes.layout(k, 42)) === JSON.stringify(Archetypes.layout(k, 42))).every(Boolean);
  out.__parse = Archetypes.keys.every(k => { const p = Archetypes.parse(Archetypes.id(k, 12345, 'huge')); return p && p.key === k && p.seed === 12345 && p.size === 'huge'; });
  out.__bad = Archetypes.parse('temple') === null && Archetypes.parse('arch:nope:1') === null;
  out.__digest = Archetypes.digest() === Archetypes.digest() && MAP_LAYOUTS.arch_islands.archStamp === Archetypes.digest();
  return out;
`);
for (const k of KEYS) {
  ok(k + ' generates identically twice from one seed', det[k].same);
  ok(k + ' generates a different map for each of ' + SEEDS.length + ' seeds', det[k].uniq === SEEDS.length, det[k].uniq + ' distinct');
  ok(k + ' does not carry RNG state between calls (same maps in any call order)', det[k].orderFree);
  ok(k + ' takes its terrain from the map id, not from the GameMap seed', det[k].seedIndependent);
}
ok('the layout an archetype id names is itself stable', det.__ids);
ok('an archetype id round-trips through parse: key, seed and size', det.__parse);
ok('a non-archetype id is not mistaken for one', det.__bad);
ok('the sample layouts carry a digest of eight seeds of every generator, so the build stamp covers them', det.__digest);

// ============================================================================
// 3. Every size mode, because a generator that only works at 128x128 is a map
// ============================================================================
const sizes = R(`
  const out = [], cc = DATA.buildings.command_center;
  for (const k of Archetypes.keys) for (const sz of ['small', 'medium', 'large', 'huge']) {
    const m = new GameMap(1, Archetypes.id(k, 8, sz));
    const worst = m.worstWalk(), seen = m.floodWalk(worst, m.starts[0].x + 2, m.starts[0].y + 4);
    const un = m.bases.filter(b => !seen[m.baseAnchor(b)]).length;
    const bad = m.bases.filter(b => m.canPlace(cc, b.x, b.y, { id: 0, race: 'T' }, [], null)).length;
    out.push({ k, sz, w: m.w, h: m.h, players: m.players, starts: m.starts.length, un, bad, feats: m.features.length });
  }
  return out;
`);
ok('every archetype builds at all four map sizes, 64 to 256, with every base reachable and buildable',
  sizes.every(r => r.w >= 64 && r.w <= 256 && r.h >= 64 && r.h <= 256 && r.starts === r.players && r.un === 0 && r.bad === 0),
  JSON.stringify(sizes.filter(r => r.un || r.bad || r.starts !== r.players)));
ok('a two-player size really does produce two starts and a four-player size four',
  sizes.filter(r => r.sz === 'small').every(r => r.starts === 2) && sizes.filter(r => r.sz !== 'small').every(r => r.starts === 4),
  sizes.map(r => r.sz + ':' + r.starts).join(' '));

// ============================================================================
// 4. Destroying a feature changes the ground, and the change is real
// ============================================================================
const brk = R(`
  const out = {};
  const m = new GameMap(3, 'arch_islands'), pf = new Pathfinder(m);
  const br = m.features.find(f => f.kind === 'bridge');
  // A route that crosses this bridge. A bridge lies ALONG the channel it spans, so it is crossed
  // across its long axis: a 4x3 deck in a 3-tile band is walked north to south.
  const crossY = br.w >= br.h;
  const a = crossY ? [br.x + (br.w >> 1), br.y - 2] : [br.x - 2, br.y + (br.h >> 1)];
  const b = crossY ? [br.x + (br.w >> 1), br.y + br.h + 1] : [br.x + br.w + 1, br.y + (br.h >> 1)];
  const len = p => p.reduce((s, t, i) => s + (i ? Math.hypot(t[0] - p[i-1][0], t[1] - p[i-1][1]) : 0), 0);
  const before = pf.find(a[0], a[1], b[0], b[1], 20000);
  const crossedBefore = before.some(t => m.featureAt(t[0], t[1]) === br) || len(before) < 6;
  out.intact = { walk: m.walk[br.t0], blocked: m.blocked[br.t0], walkable: m.walkable(br.x, br.y), open: m.featureOpen(br), hp: br.hp, rev: m.featureRev() };
  out.partial = (m.damageFeature(br, br.maxHp - 1), { hp: br.hp, broken: br.broken, walk: m.walk[br.t0] });
  out.broke = m.damageFeature(br, 5) === 0 && br.broken;
  out.after = { walk: m.walk[br.t0], blocked: m.blocked[br.t0], walkable: m.walkable(br.x, br.y), open: m.featureOpen(br), hp: br.hp, rev: m.featureRev() };
  const afterP = pf.find(a[0], a[1], b[0], b[1], 20000);
  out.path = { crossedBefore, crossesAfter: afterP.some(t => m.featureAt(t[0], t[1]) === br), lenBefore: Math.round(len(before)), lenAfter: Math.round(len(afterP)) };
  out.reBreak = m.breakFeature(br) === false && m.damageFeature(br, 999) === 0;

  // a spire is the one that moves height, which is the one thing that moves vision
  const m2 = new GameMap(5, 'arch_basin'); const sp = m2.features.find(f => f.kind === 'spire');
  out.spire = { h: m2.height[sp.t0], cliff: m2.cliff[sp.t0], walk: m2.walk[sp.t0] };
  m2.breakFeature(sp);
  out.spireGone = { h: m2.height[sp.t0], cliff: m2.cliff[sp.t0], walk: m2.walk[sp.t0], blocked: m2.blocked[sp.t0] };

  // a rock formation sitting in a ramp must not flatten the ramp when it goes
  const m3 = new GameMap(4, 'arch_cliffs'); const rk = m3.features.filter(f => f.kind === 'rocks').find(f => m3.height[f.t0] === 1);
  out.rampRocks = rk ? { before: m3.height[rk.t0], walk0: m3.walk[rk.t0] } : null;
  if (rk) { m3.breakFeature(rk); out.rampRocks.after = m3.height[rk.t0]; out.rampRocks.walk1 = m3.walk[rk.t0]; }

  // building on ground that can stop being ground
  const m4 = new GameMap(3, 'arch_islands'); const br4 = m4.features.find(f => f.kind === 'bridge');
  out.build = m4.canPlace(DATA.buildings.supply_depot, br4.x, br4.y, { id: 0, race: 'T' }, [], null);
  return out;
`);
ok('a bridge is walkable ground while it stands', brk.intact.walk === 1 && brk.intact.blocked === -1 && brk.intact.walkable && brk.intact.open);
ok('damage short of its hit points does not drop it', brk.partial.hp === 1 && brk.partial.broken === false && brk.partial.walk === 1, JSON.stringify(brk.partial));
ok('the last point of damage does', brk.broke);
ok('a dropped bridge changes BOTH walk and blocked, and walkable() with them',
  brk.after.walk === 0 && brk.after.blocked === -4 && !brk.after.walkable && !brk.after.open, JSON.stringify(brk.after));
ok('and the terrain revision moves with it, which is what tells the renderer to redraw', brk.intact.rev !== brk.after.rev, brk.intact.rev + ' -> ' + brk.after.rev);
ok('the pathfinder crossed the bridge before and does not after (' + brk.path.lenBefore + ' -> ' + brk.path.lenAfter + ' tiles)',
  brk.path.crossedBefore && !brk.path.crossesAfter && brk.path.lenAfter > brk.path.lenBefore, JSON.stringify(brk.path));
ok('a feature can only be destroyed once', brk.reBreak);
ok('a spire is high ground with a cliff face while it stands, so ground units cannot see onto it',
  brk.spire.h === 2 && brk.spire.cliff === 1 && brk.spire.walk === 0, JSON.stringify(brk.spire));
ok('and collapsing it drops it to low ground, open and in plain sight',
  brk.spireGone.h === 0 && brk.spireGone.cliff === 0 && brk.spireGone.walk === 1 && brk.spireGone.blocked === -1, JSON.stringify(brk.spireGone));
ok('rocks sitting in a ramp leave the ramp behind when they are cleared',
  brk.rampRocks && brk.rampRocks.before === 1 && brk.rampRocks.after === 1 && brk.rampRocks.walk0 === 0 && brk.rampRocks.walk1 === 1, JSON.stringify(brk.rampRocks));
ok('nothing can be built on a bridge deck', brk.build === 'Cannot build on a map feature', String(brk.build));

// ============================================================================
// 5. The tidal channel: a pure function of the frame, like the sandstorm
// ============================================================================
const tide = R(`
  const m = new GameMap(2, 'arch_chokepoint'); const fg = m.features.find(f => f.kind === 'floodgate');
  const st = fr => JSON.stringify(m.tideState(fg, fr));
  const period = m.tideState(fg, 0).period;
  const fwd = {}; for (let f = 0; f < period * 2; f += 13) fwd[f] = st(f);
  let stable = true;
  for (const f of Object.keys(fwd).map(Number).reverse()) if (st(f) !== fwd[f]) stable = false;
  for (const f of [7, period + 3, period * 2 - 13, 91]) if (fwd[f] !== undefined && st(f) !== fwd[f]) stable = false;
  let wet = 0, edges = 0, prev = false;
  for (let f = 0; f < period; f++) { const a = m.tideState(fg, f).wet; if (a) wet++; if (a !== prev) edges++; prev = a; }
  // drive it a frame at a time and watch the ground follow
  const seq = []; for (let f = 0; f < period * 2; f++) { m.tickFeatures(f, []); if (f % 97 === 0) seq.push(m.walk[fg.t0]); }
  const both = seq.includes(0) && seq.includes(1);
  // ...and once the gate is broken it never opens again, whatever the clock says
  m.breakFeature(fg);
  let reopened = false; for (let f = 0; f < period * 2; f++) { m.tickFeatures(f, []); if (m.walk[fg.t0] === 1) reopened = true; }
  // a warning window before each flood
  const warnBeforeWet = m.tideState(fg, period - 1) && (() => { let w = 0; for (let f = 0; f < period; f++) { const s = m.tideState(fg, f); if (s.warning) { w++; if (s.wet) return -1; } } return w; })();
  return { stable, period, wet, edges, both, reopened, warnBeforeWet, plain: new GameMap(1, 'temple').tickFeatures(0, []) };
`);
ok('tideState is a pure function of the frame, in any call order', tide.stable);
ok('one cycle floods exactly once, for ' + tide.wet + ' of its ' + tide.period + ' frames', tide.edges === 2 && tide.wet > 0 && tide.wet < tide.period, 'edges ' + tide.edges);
ok('the channel really opens and closes as the frames go by', tide.both);
ok('there is a warning window before the flood, and it is over before the water arrives', tide.warnBeforeWet > 0, String(tide.warnBeforeWet));
ok('a broken floodgate stays flooded for the rest of the game', !tide.reopened);
ok('a map with no features ticks to nothing', tide.plain === 0);

// ============================================================================
// 6. Ground that stops being ground takes what was standing on it
// ============================================================================
const crush = R(`
  G.init({ players: [{ race: 'T', human: false, name: 'A' }, { race: 'T', human: false, name: 'B' }], seed: 3, layout: 'arch:islands:3' });
  for (const p of G.players) p.ai = null;
  for (const u of [...G.units]) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive);
  const m = G.map, br = m.features.find(f => f.kind === 'bridge');
  const T = TILE, cx = (br.x + br.w / 2) * T, cy = (br.y + br.h / 2) * T;
  const onIt = G.spawnUnit('marine', 0, cx, cy);
  const flyer = G.spawnUnit('wraith', 0, cx, cy);
  const rider = G.spawnUnit('marine', 0, cx, cy); const ferry = G.spawnUnit('dropship', 0, cx, cy); rider.inside = ferry; ferry.cargo.push(rider);
  const away = G.spawnUnit('marine', 0, m.starts[0].cx, m.starts[0].cy + 64);
  const n = m.breakFeature(br);
  return { broke: n, onIt: onIt.alive, flyer: flyer.alive, rider: rider.alive, away: away.alive, lost: G.players[0].stats.unitsLost };
`);
ok('a ground unit standing on a bridge goes down with it', !crush.onIt);
ok('an air unit above it does not', crush.flyer);
ok('nor does a passenger inside a transport', crush.rider);
ok('nor does anything that was somewhere else', crush.away);
ok('and the loss is recorded', crush.lost === 1, String(crush.lost));

// ============================================================================
// 7. Vision: the one thing terrain can do to it
// ============================================================================
// G.updateVision marks a tile seen only when height[i] <= the looker's own height, so a spire is a
// hole in a ground army's vision until it comes down. This is the assertion that says a destructible
// is not decoration.
const vis = R(`
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, name: 'B' }], seed: 5, layout: 'arch:basin:5' });
  for (const p of G.players) p.ai = null;
  for (const u of [...G.units]) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive);
  G.cheats = {};
  const m = G.map, sp = m.features.find(f => f.kind === 'spire');
  const T = TILE, tx = sp.x + (sp.w >> 1), ty = sp.y + (sp.h >> 1);
  const scout = G.spawnUnit('marine', 0, (sp.x - 2) * T, (ty + 0.5) * T);
  G.rebuildGrid(); G.updateVision();
  const beforeSpire = G.players[0].vis[ty * m.w + tx], beforeNear = G.players[0].vis[(ty) * m.w + (sp.x - 2)];
  m.breakFeature(sp);
  G.updateVision();
  const afterSpire = G.players[0].vis[ty * m.w + tx];
  return { beforeSpire, beforeNear, afterSpire, sight: scout.sight, dist: 2 + (sp.w >> 1) };
`);
ok('a marine beside an intact spire can see its own ground', vis.beforeNear === 2, String(vis.beforeNear));
ok('and cannot see the spire itself, which is standing over it', vis.beforeSpire !== 2, 'vis ' + vis.beforeSpire + ' at ' + vis.dist + ' tiles, sight ' + vis.sight);
ok('collapsing the spire puts that ground in view without the marine moving', vis.afterSpire === 2, String(vis.afterSpire));

// ============================================================================
// 8. It survives a snapshot -- forwards, and backwards
// ============================================================================
// The half of this that a state hash cannot check is the terrain, because the terrain is not in the
// hash. So the grids are compared tile for tile as well.
const snap = R(`
  const grid = () => [Array.from(G.map.walk).join(''), Array.from(G.map.height).join(''), Array.from(G.map.cliff).join(''), Array.from(G.map.blocked).join(','),
                      G.map.features.map(f => f.kind + ':' + f.hp + ':' + f.broken).join('|'), String(G.map.featureRev())].join('#');
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 9, layout: 'arch:islands:9' });
  for (let f = 0; f < 400; f++) G.tick();
  const A = Snapshot.take(), gridA = grid(), hashA = G.stateHash();
  // what the next 400 frames look like with the map left alone
  for (let f = 0; f < 400; f++) G.tick();
  const cleanFirst = G.stateHash(), gridCleanFirst = grid();
  // ...and now wreck the map past the checkpoint: every feature on it, in order
  Snapshot.restore(A);
  for (const f of [...G.map.features]) G.map.breakFeature(f);
  const gridBroken = grid();
  for (let f = 0; f < 400; f++) G.tick();
  const straightBroken = G.stateHash(), gridStraight = grid();
  const B = Snapshot.take();
  // ...and seek backwards to before any of it happened
  Snapshot.restore(A);
  const gridBack = grid(), hashBack = G.stateHash();
  for (let f = 0; f < 400; f++) G.tick();
  const cleanRun = G.stateHash(), gridClean = grid();
  // now forwards again from the wrecked checkpoint
  Snapshot.restore(B);
  const gridB = grid();
  for (let f = 0; f < 300; f++) G.tick();
  const fromB = G.stateHash();
  Snapshot.restore(B);
  for (let f = 0; f < 300; f++) G.tick();
  return { intactDiffersFromBroken: gridA !== gridBroken, gridBack, gridA, hashBack, hashA,
    gridB, gridStraight, fromB, fromB2: G.stateHash(), cleanRun, cleanFirst, gridCleanFirst, straightBroken, gridClean };
`);
ok('breaking every feature on the map changes the terrain', snap.intactDiffersFromBroken);
ok('a backward seek puts every grid back, including height and cliff, which no snapshot carries', snap.gridBack === snap.gridA);
ok('and puts the simulation back with them', snap.hashBack === snap.hashA, snap.hashBack + ' vs ' + snap.hashA);
// The whole point of a backward seek: the four hundred frames after the restore have to be the four
// hundred frames that happened the first time, not the four hundred that happened on the wrecked map.
ok('and replays the frames after it exactly as they ran before anything was broken',
  snap.cleanRun === snap.cleanFirst && snap.gridClean === snap.gridCleanFirst, snap.cleanRun + ' vs ' + snap.cleanFirst);
ok('while the wrecked map really was a different map to play on', snap.gridStraight !== snap.gridCleanFirst);
ok('a checkpoint taken on a wrecked map restores wrecked', snap.gridB === snap.gridStraight);
ok('and re-simulates bit-identically from it, twice', snap.fromB === snap.fromB2, snap.fromB + ' vs ' + snap.fromB2);

// A rejoining client builds its own map from the layout id and then takes a snapshot on top, which is
// the case that would silently disagree if the archetype were not a pure function of its id.
const rejoin = R(`
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 4, layout: 'arch:cliffs:4' });
  for (let f = 0; f < 300; f++) G.tick();
  for (const f of G.map.features.slice(0, 3)) G.map.breakFeature(f);
  for (let f = 0; f < 100; f++) G.tick();
  const donor = Snapshot.take(), donorHash = G.stateHash();
  const donorGrid = [Array.from(G.map.walk).join(''), Array.from(G.map.height).join(''), Array.from(G.map.cliff).join('')].join('#');
  // a fresh client: same id, same map, nothing that has happened since
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 4, layout: 'arch:cliffs:4' });
  Snapshot.restore(donor);
  const joinGrid = [Array.from(G.map.walk).join(''), Array.from(G.map.height).join(''), Array.from(G.map.cliff).join('')].join('#');
  const joinHash = G.stateHash();
  for (let f = 0; f < 200; f++) G.tick();
  return { donorGrid, joinGrid, donorHash, joinHash, on: G.stateHash() };
`);
ok('a client that rebuilt the map from its id and then restored a snapshot has the same ground', rejoin.donorGrid === rejoin.joinGrid);
ok('and the same simulation state', rejoin.donorHash === rejoin.joinHash, rejoin.donorHash + ' vs ' + rejoin.joinHash);

// ============================================================================
// 9. The renderer's read-only contract
// ============================================================================
const view = R(`
  const m = new GameMap(2, 'arch_chokepoint');
  const v0 = m.featureView(0), rev0 = m.featureRev();
  const keys = Object.keys(v0[0]).sort().join(',');
  const fg = m.features.find(f => f.kind === 'floodgate');
  const wetFrame = (() => { const p = m.tideState(fg, 0).period; for (let f = 0; f < p; f++) if (m.tideState(fg, f).wet) return f; return -1; })();
  m.tickFeatures(wetFrame, []);
  const revWet = m.featureRev();
  const vWet = m.featureView(wetFrame).find(x => x.kind === 'floodgate');
  const rk = m.features.find(f => f.kind === 'rocks');
  m.damageFeature(rk, 100);
  const dmg = m.featureView(0).find(x => x.id === rk.id);
  const mutated = (() => { const v = m.featureView(0); v[0].hp = -12345; v[0].broken = 'nonsense'; return m.features[0].hp !== -12345 && m.features[0].broken !== 'nonsense'; })();
  return { keys, n: v0.length, rev0, revWet, wetOpen: vWet.open, wetFlag: vWet.wet, broken: vWet.broken,
    hp: dmg.hp, maxHp: dmg.maxHp, name: dmg.name, at: m.featureAt(rk.x, rk.y) === rk, atPx: m.featureAtPx(rk.cx, rk.cy) === rk,
    off: m.featureAt(rk.x - 40, rk.y) === null, plain: (() => { MAP_LAYOUTS.__plain = Object.assign({}, MAP_LAYOUTS.temple, { features: [] }); try { return new GameMap(1, '__plain').featureView(0).length; } finally { delete MAP_LAYOUTS.__plain; } })(), mutated };   // every shipped map has rocks since the looks queue
`);
// The exact field list is the contract js/map.js documents to js/render.js, so it is spelled out here
// rather than sampled: a field quietly renamed is a renderer quietly drawing nothing.
const VIEW_KEYS = ['id', 'kind', 'name', 'x', 'y', 'w', 'h', 'cx', 'cy', 'hp', 'maxHp', 'broken', 'open', 'height', 'wet', 'warning', 'until'].sort().join(',');
ok('featureView reports exactly the fields the renderer is promised', view.keys === VIEW_KEYS, view.keys);
ok('featureRev moves when a channel floods and the terrain under it changes', view.rev0 !== view.revWet, view.rev0 + ' -> ' + view.revWet);
ok('a flooded channel reads as shut but not as broken', view.wetOpen === false && view.wetFlag === true && view.broken === false);
ok('damage shows up in the view', view.hp === view.maxHp - 100, view.hp + '/' + view.maxHp);
ok('featureAt and featureAtPx find a feature, and nothing where there is none', view.at && view.atPx && view.off);
ok('the view is a copy: writing to it cannot reach the simulation', view.mutated);
ok('a map with no features has an empty view', view.plain === 0);

// ============================================================================
// 10. The repair really does repair, when it is given something to repair
// ============================================================================
// It never fired on any generated map above, which is the point of it -- so it is tested here against
// a layout built to defeat it: a base sealed inside a ring of rock with the only way out blocked by a
// feature, which the repair may not carve through.
const repair = R(`
  MAP_LAYOUTS.__sealed = {
    name: 'Sealed', players: 2, w: 128, h: 128, archetype: 'chokepoint', startOrder: [0, 3],
    high: [], ramps: [],
    rocks: [['rect', 30, 30, 24, 3], ['rect', 30, 30, 3, 24], ['rect', 30, 51, 24, 3], ['rect', 51, 30, 3, 24]],
    features: [{ kind: 'rocks', x: 40, y: 30, w: 4, h: 3, quadrants: [0] }],
    bases: [MapModes.base(12, 12, 8, 1500, 5000, 'main'), MapModes.base(42, 42, 6, 1500, 5000, 'expo')],
  };
  const before = (() => {                       // what it looks like with the repair switched off
    const saved = GameMap.prototype.repairConnectivity; GameMap.prototype.repairConnectivity = function () { return 0; };
    const m = new GameMap(1, '__sealed'); const p = m.connectivityProblems(DATA.buildings.command_center);
    GameMap.prototype.repairConnectivity = saved; return p;
  })();
  const m = new GameMap(1, '__sealed');
  const after = m.connectivityProblems(DATA.buildings.command_center);
  // the carve is mirrored, so the other player's quadrant got the same road
  const worst = m.worstWalk(), seen = m.floodWalk(worst, m.starts[0].x + 2, m.starts[0].y + 4);
  const reach = m.bases.filter(b => seen[m.baseAnchor(b)]).length;
  const throughFeature = m.features.some(f => f.tiles.some(i => m.walk[i] === 1));
  const twice = JSON.stringify(Array.from(new GameMap(1, '__sealed').walk)) === JSON.stringify(Array.from(m.walk));
  delete MAP_LAYOUTS.__sealed;
  return { before: before.length, after: after.length, reach, bases: m.bases.length, throughFeature, twice };
`);
ok('a base sealed behind rock is unreachable without the repair', repair.before > 0, String(repair.before));
ok('and reachable with it, on the worst-case grid', repair.after === 0 && repair.reach === repair.bases, repair.after + ' problems, ' + repair.reach + '/' + repair.bases + ' reachable');
ok('the repair does not cheat by carving through the feature it is routing around', !repair.throughFeature);
ok('and it is deterministic: the same map twice, tile for tile', repair.twice);

// ============================================================================
// 11. Nothing that existed before has moved
// ============================================================================
const old = R(`
  const out = {};
  for (const k of ['temple', 'bloodbath', 'valley', 'small', 'medium', 'large', 'huge', 'dustbowl']) {
    const m = new GameMap(7, k);
    const L = MAP_LAYOUTS[k];
    out[k] = { feats: m.features.length, listed: GameMap.quadrantsOf(L).length * (L.features || []).length, kinds: [...new Set(m.features.map(f => f.kind))].join(), grid: !!m.featTile, arch: m.archetype, tick: m.tickFeatures(1000, []),
      place: m.canPlace(DATA.buildings.command_center, m.starts[0].x, m.starts[0].y, { id: 0, race: 'T' }, [], null) };
  }
  out.__hash = (() => {
    G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 11, layout: 'temple' });
    for (let f = 0; f < 1200; f++) G.tick();
    return G.stateHash();
  })();
  out.__hash2 = (() => {
    G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 11, layout: 'temple' });
    for (let f = 0; f < 1200; f++) G.tick();
    return G.stateHash();
  })();
  return out;
`);
// They had none until the looks queue (item 4) gave every map StarCraft II's back doors: rock formations, in every copy of the
// quadrant they are written for, and nothing that moves on its own.
ok('the fixed layouts carry exactly the rock formations they list, and nothing on them ticks',
  ['temple', 'bloodbath', 'valley', 'small', 'medium', 'large', 'huge', 'dustbowl'].every(k => old[k].feats > 0 && old[k].feats === old[k].listed && old[k].kinds === 'rocks' && old[k].grid && old[k].arch === null && old[k].tick === 0),
  JSON.stringify(Object.fromEntries(['temple', 'bloodbath', 'valley', 'small', 'medium', 'large', 'huge', 'dustbowl'].map(k => [k, old[k].feats + '/' + old[k].listed + ' ' + old[k].kinds]))));
ok('and still places a town hall on its own start location', ['temple', 'bloodbath', 'valley', 'small', 'medium', 'large', 'huge', 'dustbowl'].every(k => old[k].place === null),
  JSON.stringify(Object.fromEntries(Object.entries(old).filter(([k, v]) => v && v.place))));
ok('a game on temple still re-runs bit-identically', old.__hash === old.__hash2, old.__hash + ' vs ' + old.__hash2);

// ============================================================================
// 12. The archetypes are playable, and playing them is deterministic
// ============================================================================
for (const k of KEYS) {
  const r = R(`
    const run = () => {
      G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 6, layout: 'arch:${k}:6' });
      for (let f = 0; f < 3000; f++) G.tick();
      return { hash: G.stateHash(), frame: G.frame, over: G.over,
        built: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding).length),
        army: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && !u.isBuilding).length),
        feats: G.map.features.length, rev: G.map.featureRev() };
    };
    const a = run(), b = run();
    return { a, same: a.hash === b.hash };
  `);
  ok(k + ' plays 3000 frames of AI vs AI with both sides building and producing',
    r.a.frame === 3000 && r.a.built.every(b => b >= 2) && r.a.army.every(a => a >= 4), JSON.stringify(r.a));
  ok(k + ' plays the same game twice from the same seed', r.same, r.a.hash);
}
ok('no simulation errors were logged', errors.length === 0, errors.slice(0, 3).join(' | '));

summary();
