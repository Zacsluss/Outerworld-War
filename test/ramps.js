// Ramps are entered at their two ends and never from a side (the terrain queue, item 2: "can only go up them from base, NOT
// from sides of ramp"). The rule is GameMap.wallRamps in js/map.js; this suite holds it to what it promises.
//   node test/ramps.js
//
// Every check here is made twice where it can be: on the map as shipped, and on the same map generated with the walls
// switched off (GameMap.prototype.wallRamps replaced by a no-op for the one construction). The second map is the control that
// shows each check can fail -- 132 of 158 ramps were side-open before this rule existed -- and the yardstick for "nothing got
// worse": a base, a resource, a town hall or a 3x3 route the walls took away would show as a difference between the two.
'use strict';
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const errors = [];
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'], errors });
const R = src => vm.runInContext('(() => {' + src + '})();', ctx);

// Every shipped layout, the four archetypes at every size on two seeds, and the seeds that found each generator fix or take
// the slow road (a pass undone and redone ramp by ramp): islands 13 medium, islands 7 and cliffs 24 small (slow road),
// cliffs 2 small (the natural's terrace), basin 5 small (rocks on a ramp), chokepoint 8, 10 and 38 small (the natural).
const IDS = R(`return Object.keys(MAP_LAYOUTS).filter(id => !MAP_LAYOUTS[id].custom);`)
  .concat(...['chokepoint', 'basin', 'islands', 'cliffs'].map(k => ['small', 'medium', 'large', 'huge'].map(z => [1, 2].map(s => 'arch:' + k + ':' + s + ':' + z))).flat())
  .concat(['arch:islands:13:medium', 'arch:islands:7:small', 'arch:cliffs:24:small', 'arch:cliffs:2:small', 'arch:basin:5:small', 'arch:chokepoint:8:small', 'arch:chokepoint:10:small', 'arch:chokepoint:38:small']);

vm.runInContext(`
  var RT = {
    bare(id, seed) { const real = GameMap.prototype.wallRamps; GameMap.prototype.wallRamps = function () { return null; };
      try { return new GameMap(seed, id); } finally { GameMap.prototype.wallRamps = real; } },
    // bases a unit reaches from every start and resources from the first, every feature shut; halls refused; bases a 3x3
    // body reaches from the first start with features shut and open. One number each, so "not worse" is a comparison.
    reach(m) {
      const W = m.w, N = W * m.h, worst = m.worstWalk(), cc = DATA.buildings.command_center, out = { bases: 0, res: 0, halls: 0, wideShut: 0, wideOpen: 0, lostBase: [], lostWide: [] };
      for (const s of m.starts) { const seen = m.floodWalk(worst, s.x + 2, s.y + 4); for (const b of m.bases) if (seen[m.baseAnchor(b)]) out.bases++; }
      const s0 = m.starts[0], seen0 = m.floodWalk(worst, s0.x + 2, s0.y + 4);
      for (const r of m.resources) { let hit = false; m.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, (x, y) => { if ((x < r.x || x >= r.x + r.w) !== (y < r.y || y >= r.y + r.h) && seen0[m.idx(x, y)]) hit = true; }); if (hit) out.res++; }
      for (const b of m.bases) if (!m.canPlace(cc, b.x, b.y, { id: 0, race: 'T' }, [], null)) out.halls++;
      for (const open of [false, true]) {
        const free = i => (open ? (m.walk[i] === 1 || (m.featTile && m.featTile[i] >= 0)) : worst[i] === 1) && (m.blocked[i] === -1 || (open && m.blocked[i] === FEAT_BLOCKED));
        const fits = new Uint8Array(N); for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < W - 1; x++) { let f = 1; for (let b = -1; b <= 1 && f; b++) for (let a = -1; a <= 1; a++) if (!free((y + b) * W + x + a)) { f = 0; break; } fits[y * W + x] = f; }
        const seen = new Uint8Array(N), q = []; m.rect(s0.x - 3, s0.y - 3, 11, 10, (x, y) => { const i = y * W + x; if (fits[i] && !seen[i]) { seen[i] = 1; q.push(i); } });
        for (let k = 0; k < q.length; k++) { const i = q[k], x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && fits[j] && !seen[j]) { seen[j] = 1; q.push(j); } }
        for (const b of m.bases) { let hit = false; m.rect(b.x - 3, b.y - 3, 10, 9, (x, y) => { if (seen[m.idx(x, y)]) hit = true; }); if (hit) out[open ? 'wideOpen' : 'wideShut']++; }
      }
      return out;
    },
    // the longest ramp, in tiles along its own axis, as rampProblems judges the axis (features open)
    longest(m) {
      const W = m.w, N = W * m.h, oh = i => { const fi = m.featTile ? m.featTile[i] : -1; if (fi < 0) return m.walk[i] === 1 && m.blocked[i] === -1 ? m.height[i] : -1; const f = m.features[fi], K = MAP_FEATURES[f.kind]; return K.openHeight === null ? f.baseH[f.tiles.indexOf(i)] : K.openHeight; };
      const D = [[0, -1], [0, 1], [-1, 0], [1, 0]], seen = new Uint8Array(N); let best = 0;
      for (let s = 0; s < N; s++) {
        if (seen[s] || oh(s) !== 1) continue;
        const q = [s]; seen[s] = 1; let hx = 0, hy = 0, hn = 0, lx = 0, ly = 0, ln = 0;
        for (let k = 0; k < q.length; k++) { const i = q[k], x = i % W, y = (i / W) | 0;
          for (const [dx, dy] of D) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= m.h) continue; const j = ny * W + nx, c = oh(j);
            if (c === 1) { if (!seen[j]) { seen[j] = 1; q.push(j); } } else if (c === 2) { hx += 2 * x + dx; hy += 2 * y + dy; hn++; } else if (c === 0) { lx += 2 * x + dx; ly += 2 * y + dy; ln++; } } }
        if (!hn || !ln) continue;
        const vx = hx * ln - lx * hn, vy = hy * ln - ly * hn, horiz = Math.abs(vx) > Math.abs(vy);
        const lines = new Map(); for (const i of q) { const key = horiz ? (i / W) | 0 : i % W; lines.set(key, (lines.get(key) || 0) + 1); }
        for (const n of lines.values()) best = Math.max(best, n);
      }
      return best;
    },
    sym(m) { const W = m.w, H = m.h, r = { x: 0, y: 0, t: 0 };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x;
        for (const [k, j] of [['x', y * W + (W - 1 - x)], ['y', (H - 1 - y) * W + x], ['t', (H - 1 - y) * W + (W - 1 - x)]]) if (m.height[i] !== m.height[j] || m.walk[i] !== m.walk[j] || m.cliff[i] !== m.cliff[j] || (m.blocked[i] === -1) !== (m.blocked[j] === -1)) r[k]++; }
      return r; },
    grids(m) { return Array.from(m.height).join('') + '|' + Array.from(m.walk).join('') + '|' + Array.from(m.cliff).join(''); },
  };
`, ctx);

// ============================================================================
// 1. No ramp anywhere can be walked onto from a side, and the rule never gave up
// ============================================================================
const maps = IDS.map(id => R(`
  const id = ${JSON.stringify(id)}, m = new GameMap(7, id), bare = RT.bare(id, 7), report = m.rampReport;   // before the rerun replaces it
  const g0 = RT.grids(m); m.wallRamps(); const idem = RT.grids(m) === g0, changed = g0 !== RT.grids(bare);
  return { id, players: m.players, problems: m.rampProblems(), bareProblems: bare.rampProblems().length, report,
    longest: RT.longest(m), bareLongest: RT.longest(bare), walls: report ? report.walls : -1,
    reach: RT.reach(m), bareReach: RT.reach(bare), sym: RT.sym(m), bareSym: RT.sym(bare), idem, changed,
    elev: m.elevationProblems().length, reseal: m.sealElevations(), reflat: m.flattenStrandedHeight() };
`));
const withRamps = maps.filter(r => r.bareProblems > 0);
ok(maps.every(r => r.problems.length === 0), 'no ramp on any of ' + maps.length + ' maps can be entered from a side, from low ground above its top or from high ground below its foot',
  maps.filter(r => r.problems.length).slice(0, 2).map(r => r.id + ': ' + r.problems[0]).join(' | '));
// The exceptions are maps with no way up to wall: a basin whose ramp rectangle lies wholly inside its plateau has a dip, not a
// ramp. (Close Quarters was one until the looks queue gave it a main up a ramp.)
ok(withRamps.length >= maps.length - 4, '...and without the walls ' + withRamps.length + ' of them could be: the check has something to find (not: ' + maps.filter(r => !r.bareProblems).map(r => r.id).join(', ') + ')');
ok(maps.every(r => !r.report || r.report.fallback === 0), 'the rule never had to leave a ramp as it was (rampReport.fallback is zero everywhere)',
  maps.filter(r => r.report && r.report.fallback).map(r => r.id + ':' + r.report.fallback).join(' '));
// Exactly these two take the slow road. More would mean the foot clearance stopped catching what it catches (without it the
// fixed layouts Broken Expanse, Dust Bowl and Nightfall join them); none would mean the verification is no longer exercised.
const slow = maps.filter(r => r.report && r.report.slow).map(r => r.id);
ok(slow.join(' ') === 'arch:islands:7:small arch:cliffs:24:small' && maps.filter(r => r.report && r.report.slow).every(r => r.problems.length === 0),
  'the slow road -- undone and redone ramp by ramp -- is taken on exactly the two small maps that need it, and still walls every ramp', slow.join(', '));
ok(maps.every(r => r.longest <= R('return RAMP_LEN;')), 'no ramp is longer than RAMP_LEN (' + R('return RAMP_LEN;') + ') tiles along its axis', maps.filter(r => r.longest > R('return RAMP_LEN;')).map(r => r.id + ':' + r.longest).slice(0, 4).join(' '));
ok(maps.some(r => r.bareLongest > R('return RAMP_LEN;')), '...where the rectangles the layouts draw run to ' + Math.max(...maps.map(r => r.bareLongest)) + ' without it');
// A ramp can come out clean with no new wall at all -- cut back to its cliff row, whose sides are the cliff -- so what every
// such map must show is a change, and most of them walls.
ok(withRamps.every(r => r.changed), 'every map that had a side-open ramp was changed by the rule', withRamps.filter(r => !r.changed).map(r => r.id).join(' '));
ok(withRamps.filter(r => r.walls > 0).length >= withRamps.length * 0.8, withRamps.filter(r => r.walls > 0).length + ' of them got new walls, ' + withRamps.reduce((s, r) => s + Math.max(0, r.walls), 0) + ' tiles in all');

// ============================================================================
// 2. Nothing anyone could reach before is out of reach now
// ============================================================================
const worse = (a, b) => a.bases < b.bases || a.res < b.res || a.halls > b.halls || a.wideShut < b.wideShut || a.wideOpen < b.wideOpen;
ok(maps.every(r => r.reach.bases === r.bareReach.bases), 'every base reached from every start with every feature shut is still reached, on all ' + maps.length,
  maps.filter(r => r.reach.bases !== r.bareReach.bases).map(r => r.id + ' ' + r.bareReach.bases + '->' + r.reach.bases).join(' '));
ok(maps.every(r => r.reach.res >= r.bareReach.res), 'every resource a worker could reach it still can', maps.filter(r => r.reach.res < r.bareReach.res).map(r => r.id).join(' '));
ok(maps.every(r => r.reach.halls <= r.bareReach.halls), 'no base refuses a town hall it would have taken', maps.filter(r => r.reach.halls > r.bareReach.halls).map(r => r.id).join(' '));
ok(maps.every(r => r.reach.wideShut >= r.bareReach.wideShut && r.reach.wideOpen >= r.bareReach.wideOpen),
  'a 3x3 body -- a Thor, an Ultralisk, a Reaver -- still reaches every base it reached, features shut and open',
  maps.filter(r => r.reach.wideShut < r.bareReach.wideShut || r.reach.wideOpen < r.bareReach.wideOpen).map(r => r.id + ' ' + r.bareReach.wideShut + '/' + r.bareReach.wideOpen + '->' + r.reach.wideShut + '/' + r.reach.wideOpen).join(' '));
ok(!maps.some(r => worse(r.reach, r.bareReach)), 'so no map is worse for walls in any of the five ways');

// ============================================================================
// 2b. Mining a patch out opens nothing (GameMap.wallMinedGround)
// ============================================================================
// Every mineral patch removed the way G.removeResource removes one -- blocked back to free, walk left as it is. Then no ramp may be
// entered from a side and no former patch tile may be a walkable slope: a patch on a cliff edge used to leave a way through the cliff
// (3,140 tiles on 210 of 1,037 maps), a patch on a leftover ramp slab a slope in open ground (2,384 on 147), and one beside a ramp
// reopened its side. The same maps built with the pass as a no-op do all three -- the control is inside the check -- and while the
// patches stand nothing reached changes. Every wall the pass makes must be part of a cliff: joined, through walls, to a wall or cliff
// that is not under a patch. Walling the slabs too left 2,376 tiles of wall standing alone in the open once mined out; they are
// levelled to the ground round them instead, and that must put no high ground beside low. An editor-made map goes through the pass
// too: a 64x64 with a main whose mineral column stands on its plateau's west edge.
vm.runInContext(`
  RT.mineOut = m => { const was = []; for (const r of m.resources) if (r.type === 'mineral') m.rect(r.x, r.y, r.w, r.h, (x, y) => { const i = m.idx(x, y); if (m.blocked[i] === -2) { m.blocked[i] = -1; was.push(i); } }); return { problems: m.rampProblems().length, slopes: was.filter(i => m.walk[i] === 1 && m.height[i] === 1).length, patches: was.length }; };
  RT.withoutPass = (id, seed) => { const real = GameMap.prototype.wallMinedGround; GameMap.prototype.wallMinedGround = function () { return 0; }; try { return new GameMap(seed, id); } finally { GameMap.prototype.wallMinedGround = real; } };
  // Against the same map without the pass: the walls it made under patches that no chain of walls (8 neighbours) joins to a wall or
  // cliff outside a patch, the patch tiles it levelled, and the elevation problems it added.
  RT.shape = (m, off) => {
    const W = m.w, N = W * m.h, under = new Uint8Array(N), made = []; let levelled = 0, loose = 0;
    for (const r of m.resources) if (r.type === 'mineral') m.rect(r.x, r.y, r.w, r.h, (x, y) => { under[m.idx(x, y)] = 1; });
    for (let i = 0; i < N; i++) if (under[i]) { if (m.height[i] !== off.height[i]) levelled++; if (off.walk[i] === 1 && m.walk[i] === 0) made.push(i); }
    for (const t of made) {
      const seen = new Set([t]), q = [t]; let joined = false;
      for (let k = 0; k < q.length && !joined; k++) {
        const x = q[k] % W, y = (q[k] / W) | 0;
        for (let dy = -1; dy <= 1 && !joined; dy++) for (let dx = -1; dx <= 1 && !joined; dx++) {
          if ((!dx && !dy) || !m.inb(x + dx, y + dy)) continue;
          const j = m.idx(x + dx, y + dy); if (seen.has(j) || m.walk[j] !== 0) continue;
          if (!under[j]) joined = true; else { seen.add(j); q.push(j); }
        }
      }
      if (!joined) loose++;
    }
    return { walls: made.length, loose, levelled, elev: m.elevationProblems().length - off.elevationProblems().length };
  };
  (() => {
    const W = 64, H = 64, height = new Uint8Array(W * H), rocks = new Uint8Array(W * H);
    for (let y = 10; y <= 33; y++) for (let x = 10; x <= 33; x++) height[y * W + x] = 2;
    for (let y = 34; y <= 36; y++) for (let x = 20; x <= 23; x++) height[y * W + x] = 1;
    MAP_LAYOUTS['custom:RampsMinedEdge'] = { name: 'Mined edge', players: 2, custom: true, tileset: 'badlands', w: W, h: H, height: MapCodec.encode(height), rocks: MapCodec.encode(rocks),
      bases: [{ x: 14, y: 16, main: true, minerals: [[10, 13], [10, 15], [10, 17], [10, 19], [10, 21]], geyser: [20, 11] }, { x: 46, y: 48, main: true, minerals: [[41, 45], [41, 47], [41, 49], [41, 51], [41, 53]], geyser: [51, 43] }] };
  })();
`, ctx);
const MINED = IDS.concat(['arch:islands:12:small', 'arch:islands:13:small', 'arch:chokepoint:1:medium', 'custom:RampsMinedEdge']);
const mined = MINED.map(id => R(`
  const id = ${JSON.stringify(id)}, m = new GameMap(7, id), off = RT.withoutPass(id, 7), a = RT.reach(m), b = RT.reach(off);
  const same = [a.bases, a.res, a.halls, a.wideShut, a.wideOpen].join() === [b.bases, b.res, b.halls, b.wideShut, b.wideOpen].join();
  const shape = RT.shape(m, off);
  return { id, shape, on: RT.mineOut(m), off: RT.mineOut(off), same };
`));
const custom = mined.find(r => r.id === 'custom:RampsMinedEdge');
ok(mined.every(r => r.on.problems === 0 && r.on.slopes === 0), 'with every mineral patch mined out, no ramp on any of ' + mined.length + ' maps -- an editor-made one among them -- can be entered from a side, and no patch leaves a slope behind',
  mined.filter(r => r.on.problems || r.on.slopes).map(r => r.id + ' ' + JSON.stringify(r.on)).slice(0, 3).join(' | '));
ok(mined.filter(r => r.off.problems).length >= 1 && mined.filter(r => r.off.slopes).length >= 3 && custom.off.slopes > 0,
  '...where without GameMap.wallMinedGround ' + mined.filter(r => r.off.problems).length + ' of them open a ramp side and ' + mined.filter(r => r.off.slopes).length + ' leave a slope behind (the editor-made map ' + custom.off.slopes + ')',
  mined.filter(r => r.off.problems || r.off.slopes).map(r => r.id + ' ' + JSON.stringify(r.off)).slice(0, 4).join(' | '));
ok(mined.every(r => r.same), 'and while the patches stand nothing a unit or a 3x3 body reaches changes, nor any hall', mined.filter(r => !r.same).map(r => r.id).join(' '));
ok(mined.every(r => r.shape.loose === 0) && mined.filter(r => r.shape.walls).length >= 3 && custom.shape.walls > 0,
  'every wall a patch leaves is part of a cliff -- ' + mined.reduce((s, r) => s + r.shape.walls, 0) + ' on ' + mined.filter(r => r.shape.walls).length + ' maps, none standing alone in the open once mined out',
  mined.filter(r => r.shape.loose).map(r => r.id + ' ' + JSON.stringify(r.shape)).slice(0, 3).join(' | '));
ok(mined.filter(r => r.shape.levelled).length >= 1 && mined.every(r => r.shape.elev <= 0),
  '...and a patch on a slab in open ground is levelled to the ground round it instead (' + mined.reduce((s, r) => s + r.shape.levelled, 0) + ' tiles on ' + mined.filter(r => r.shape.levelled).length + ' maps), putting no high ground beside low',
  mined.filter(r => r.shape.elev > 0).map(r => r.id + ' ' + JSON.stringify(r.shape)).slice(0, 3).join(' | '));

// ============================================================================
// 3. The map is still the map: symmetric, sealed, and the rule is a fixpoint
// ============================================================================
ok(maps.every(r => (r.bareSym.x || !r.sym.x) && (r.bareSym.y || !r.sym.y) && (r.bareSym.t || !r.sym.t)),
  'every mirror symmetry the map had without walls it still has with them', maps.filter(r => (!r.bareSym.x && r.sym.x) || (!r.bareSym.y && r.sym.y) || (!r.bareSym.t && r.sym.t)).map(r => r.id + ' ' + JSON.stringify(r.sym)).join(' '));
ok(maps.filter(r => r.players === 4).every(r => !r.sym.x && !r.sym.y && !r.sym.t), 'a four-player map is exactly symmetric under both mirrors and the half turn');
ok(maps.every(r => r.idem), 'running the rule again on a finished map changes no tile', maps.filter(r => !r.idem).map(r => r.id).join(' '));
ok(maps.every(r => r.elev === 0 && r.reseal === 0 && r.reflat === 0), 'no elevation problem, and the seal and the stranded-height pass find nothing left to do',
  maps.filter(r => r.elev || r.reseal || r.reflat).map(r => r.id + ' ' + [r.elev, r.reseal, r.reflat]).join(' '));

// ============================================================================
// 4. The two ramps the approved screenshots show, exactly
// ============================================================================
// Lost Ruins' main ramp and The Long March's plateau ramp, both running east-west since the looks queue redesigned the maps (the
// approved Badlands base shot was taken on the old Lost Ruins, whose main ramp ran south). '/' ramp, 'H' high, '.' low, '#' cliff or
// wall. Four wide, three long; the column it used to have inside the plateau is plateau.
const draw = (id, x0, y0, x1, y1) => R(`const m = new GameMap(7, ${JSON.stringify(id)}), rows = [];
  for (let y = ${y0}; y <= ${y1}; y++) { let s = ''; for (let x = ${x0}; x <= ${x1}; x++) { const i = m.idx(x, y); s += m.walk[i] !== 1 ? '#' : m.height[i] === 1 ? '/' : m.height[i] === 2 ? 'H' : '.'; } rows.push(s); }
  return rows.join('\\n');`);
const lost = draw('temple', 24, 9, 33, 16);
ok(lost === ['HHH#......', 'HHH###....', 'HHH///....', 'HHH///....', 'HHH///....', 'HHH///....', 'HHH###....', 'HHH#......'].join('\n'),
  "Lost Ruins' main ramp: the plateau column it poked into is plateau, three columns of ramp, walls along both sides, an open foot", '\n' + lost);
// Read by columns: the ramp runs east-west, so its sides are the tiles above and below it.
const march = draw('huge', 87, 107, 98, 116), cols = [...Array(12)].map((_, x) => march.split('\n').map(s => s[x]).join(''));
ok(/^(\S{12}\n){9}\S{12}$/.test(march) && cols.filter(s => s.includes('////')).length === 3 && cols.every(s => !/\/\./.test(s) && !/\.\//.test(s)),
  "The Long March's plateau ramp is three columns of ramp and nothing beside a ramp tile is open ground", '\n' + march);

// ============================================================================
// 5. A unit told to climb from beside a ramp walks round to its foot
// ============================================================================
// The property the user asked for, driven through the simulation: a marine standing against the south wall of Lost Ruins' main
// ramp, which runs east from the main since the looks queue, is ordered onto the plateau. Record the tile it stands on every
// frame; the first ramp tile it enters must be entered from past the foot (east of it) or from another ramp tile. On the same
// map without walls it steps on from the side, straight up from the south -- the control is inside the check.
const climb = walls => R(`
  const real = GameMap.prototype.wallRamps; if (!${walls}) GameMap.prototype.wallRamps = function () { return null; };
  try { G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, name: 'B' }], seed: 7, layout: 'temple' }); }
  finally { GameMap.prototype.wallRamps = real; }
  for (const p of G.players) p.ai = null;
  for (const u of [...G.units]) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive); G.checkVictory = () => {};
  const m = G.map, T = TILE;
  const u = G.spawnUnit('marine', 0, 28.5 * T, 16.5 * T);
  u.applyOrder({ type: 'move', x: 22.5 * T, y: 12.5 * T });
  let prev = m.idx(28, 16), entered = null, onHigh = false;
  for (let f = 0; f < 24 * 30 && u.alive; f++) {
    G.tick();
    const i = m.idx(Math.floor(u.x / T), Math.floor(u.y / T));
    if (i !== prev) { if (entered === null && m.height[i] === 1) entered = { from: [prev % m.w, (prev / m.w) | 0], to: [i % m.w, (i / m.w) | 0], fromH: m.height[prev] }; prev = i; }
    if (m.height[i] === 2) { onHigh = true; break; }
  }
  return { entered, onHigh, at: [Math.floor(u.x / T), Math.floor(u.y / T)] };
`);
const walled = climb(true), open = climb(false);
ok(walled.onHigh && walled.entered && (walled.entered.fromH === 1 || walled.entered.from[0] === walled.entered.to[0] + 1),
  'with walls: the marine reaches the plateau, and its first step onto the ramp is from past the foot', JSON.stringify(walled));
ok(open.entered && open.entered.from[0] === open.entered.to[0], 'without them the same order steps onto the ramp from its side -- so the check can tell', JSON.stringify(open));

// A wide body on the map where full-length walls trapped it (Broken Expanse: the natural's mineral line under the main ramp).
const thor = R(`
  const m = new GameMap(7, 'large'), pf = new Pathfinder(m), s = m.starts[0], nat = m.bases.find(b => b.natural && b.quadrant === s.quadrant);
  const path = pf.find(s.x + 2, s.y + 4, nat.x + 2, nat.y + 5, 60000, true), end = path[path.length - 1];
  return { steps: path.length, end, goal: [nat.x + 2, nat.y + 5], near: end ? Math.hypot(end[0] - nat.x - 2, end[1] - nat.y - 5) : 999 };
`);
ok(thor.near <= 2, 'a Thor-sized path leaves the main on Broken Expanse and reaches its natural, the case full-length walls broke', JSON.stringify(thor));

// ============================================================================
// 6. The generators keep random rocks off ramps (Archetypes.rockClear)
// ============================================================================
const rocks = R(`
  const hits = [];
  for (const z of ['small', 'medium', 'large', 'huge']) for (let s = 1; s <= 64; s++) {
    const L = Archetypes.layout('basin', s, z);
    for (const e of L.rocks) { if (e[0] !== 'ellipse') continue;
      const x0 = Math.floor(e[1] - e[3]) - 1, x1 = Math.ceil(e[1] + e[3]) + 1, y0 = Math.floor(e[2] - e[4]) - 1, y1 = Math.ceil(e[2] + e[4]) + 1;
      if (L.ramps.some(r => x0 <= r[0] + r[2] - 1 && x1 >= r[0] && y0 <= r[1] + r[3] - 1 && y1 >= r[1])) hits.push(z + ':' + s); }
  }
  let kept = 0; for (let s = 1; s <= 64; s++) kept += Archetypes.layout('basin', s, 'large').rocks.length;
  return { hits, kept };
`);
ok(rocks.hits.length === 0, "no random rock ellipse on Open Basin lands within a tile of a ramp, on 256 layouts", rocks.hits.slice(0, 5).join(' '));
ok(rocks.kept > 150, '...and the guard drops only those: ' + rocks.kept + ' of 192 rock ellipses stand on the large size');

// ============================================================================
// 7. Deterministic, like every other pass of generation
// ============================================================================
const det = R(`
  const ids = ['temple', 'huge', 'arch:islands:7:small', 'arch:cliffs:24:small', 'arch:basin:5:small'], out = [];
  for (const id of ids) { const a = RT.grids(new GameMap(3, id)); new GameMap(9, 'arch:chokepoint:38:small'); if (RT.grids(new GameMap(3, id)) !== a) out.push(id); }
  return out;
`);
ok(det.length === 0, 'the walls come out identical on a second generation, with other maps built in between, slow road included', det.join(' '));
ok(errors.length === 0, 'no errors were logged', errors.slice(0, 3).join(' | '));
summary();
