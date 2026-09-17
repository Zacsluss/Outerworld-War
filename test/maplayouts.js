// Every map is laid out the way StarCraft II lays its maps out (the looks queue, item 4, the user: "All of the maps are very
// uninspired. Look at images of actual StarCraft II maps and redesign the layout of all maps in the game according to the
// generalized structure that StarCraft II maps have."), and the layout language that draws them does what js/map.js says.
//   node test/maplayouts.js
//
//  1. THE LANGUAGE. 'rot2' paints a tile and its half turn and nothing else, and copies bases and features the same way; 'poly'
//     fills a polygon, 'line' a band round a path, and 'rect' and 'ellipse' are what they were; a base given a `face` is the
//     template turned about its hall, and without one it is the template exactly.
//  2. THE STRUCTURE, on every fixed map (.claude/review/maps/research-brief.md; RESEARCH-TERRAIN.md 8.14):
//       every main is on high ground whose only way down is one ramp
//       every natural is on low ground, and is the base nearest its main on foot
//       every player has thirds: three bases a player at the least
//       every base's minerals and geyser stand on the level of its hall -- none on its cliff, none below it
//       every base lies inside the playable ground, clear of the border rock
//       every rock formation stands in a real gap: shut, the ground either side of it is ten tiles or more apart on foot
//       a two-player map is turned half round, not mirrored, and has bases in all four corners
//       no mineral line lies in siege range of high ground that is neither its own base's nor its own main's
//     ...and the computer player expands to the natural the map names first, from every start (js/ai.js pickExpansion)
//  3. THE GENERATORS. A two-player size has bases in all four corners, its mains in two, and the corners' bases are fair.
//  4. THE ROCK. What the terrain paints as rock is closed ground: no tile of it can be walked on, built on, or carpeted in creep.
'use strict';
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const errors = [];
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'], errors });
const R = src => vm.runInContext('(() => {' + src + '})();', ctx);
const J = JSON.stringify;

// ============================================================================
// 1. The language
// ============================================================================
const lang = R(`
  const out = {}, J = JSON.stringify;
  const faced = (x, y, extra) => Object.assign({ hall: [x, y], face: 'nw', patches: 6 }, extra || {});
  // A 64x64 two-player layout: a plateau with a ramp and a main on it, one more base, a rock rectangle and a rock formation, all in
  // the top half -- the half turn must put each of them in the bottom half and nowhere else.
  MAP_LAYOUTS.__ml_rot = { name: 'rot2', players: 2, sym: 'rot2', w: 64, h: 64, startOrder: [0, 1],
    high: [['rect', 2, 2, 17, 15]], ramps: [[10, 15, 4, 4]], rocks: [['rect', 40, 8, 3, 3]],
    features: [{ kind: 'rocks', x: 24, y: 40, w: 3, h: 2 }], bases: [faced(8, 8, { main: true, patches: 8 }), faced(40, 40)] };
  // ...and the same ground drawn with no sym, the four-way mirror every layout had before
  MAP_LAYOUTS.__ml_mir = { name: 'mirror', players: 4, w: 64, h: 64, high: [['rect', 2, 2, 17, 15]], ramps: [[10, 15, 4, 4]], rocks: [['rect', 40, 8, 3, 3]],
    bases: [faced(8, 8, { main: true, patches: 8 })] };
  try {
    const m = new GameMap(1, '__ml_rot'), n = new GameMap(1, '__ml_mir'), W = 64;
    const hi = (g, x, y) => g.height[g.idx(x, y)] === 2, rk = (g, x, y) => g.cliff[g.idx(x, y)] === 2;
    out.rot = { symmetry: m.symmetry, high: hi(m, 10, 10), turned: hi(m, W - 1 - 10, W - 1 - 10), mirX: hi(m, W - 1 - 10, 10), mirY: hi(m, 10, W - 1 - 10),
      rock: rk(m, 41, 9), rockTurned: rk(m, W - 1 - 41, W - 1 - 9), rockMirX: rk(m, W - 1 - 41, 9), rockMirY: rk(m, 41, W - 1 - 9),
      bases: m.bases.map(b => b.x + ',' + b.y + ':' + b.quadrant).join(' '), starts: m.starts.length,
      feats: m.features.map(f => f.x + ',' + f.y + ',' + f.w + 'x' + f.h).join(' ') };
    out.mir = { symmetry: n.symmetry, high: hi(n, 10, 10), turned: hi(n, W - 1 - 10, W - 1 - 10), mirX: hi(n, W - 1 - 10, 10), mirY: hi(n, 10, W - 1 - 10), starts: n.starts.length };
    out.quads = { rot: GameMap.quadrantsOf(MAP_LAYOUTS.__ml_rot).join(), mir: GameMap.quadrantsOf(MAP_LAYOUTS.__ml_mir).join(), none: GameMap.quadrantsOf(null).join() };
    // the whole map is its own half turn, and not its own mirror
    let turn = 0, flip = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = m.idx(x, y), t = m.idx(W - 1 - x, W - 1 - y), f = m.idx(W - 1 - x, y);
      if (m.height[i] !== m.height[t] || m.walk[i] !== m.walk[t] || m.cliff[i] !== m.cliff[t]) turn++;
      if (m.height[i] !== m.height[f] || m.walk[i] !== m.walk[f] || m.cliff[i] !== m.cliff[f]) flip++; }
    out.rot.turnOff = turn; out.rot.flipOff = flip;

    // shapes, on the map's own painter
    const paint = sh => { const seen = new Map(); m.shape(sh, (x, y) => { const k = x + ',' + y; seen.set(k, (seen.get(k) || 0) + 1); }); return seen; };
    const tri = paint(['poly', 10, 10, 30, 10, 10, 30]);
    let triOut = 0, triMiss = 0, triTwice = 0;
    for (const [k, c] of tri) { const [x, y] = k.split(',').map(Number); if (c > 1) triTwice++; if (x < 10 || y < 10 || (x + 0.5 - 10) + (y + 0.5 - 10) > 20) triOut++; }
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) if ((x + 0.5 - 10) + (y + 0.5 - 10) < 19.5 && !tri.has(x + ',' + y)) triMiss++;
    out.poly = { n: tri.size, out: triOut, miss: triMiss, twice: triTwice };
    const pts = [[10, 40], [40, 40], [40, 55]], dist = (px, py) => { let d = 1e9; for (let k = 0; k + 1 < pts.length; k++) { const [ax, ay] = pts[k], [bx, by] = pts[k + 1], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); d = Math.min(d, Math.hypot(ax + t * dx - px, ay + t * dy - py)); } return d; };
    const band = paint(['line', 10, 40, 40, 40, 40, 55, 4]);
    let lineOut = 0, lineMiss = 0, lineTwice = 0;
    for (const [k, c] of band) { const [x, y] = k.split(',').map(Number); if (c > 1) lineTwice++; if (dist(x + 0.5, y + 0.5) > 2 + 1e-9) lineOut++; }
    for (let y = 30; y < 60; y++) for (let x = 5; x < 50; x++) if (dist(x + 0.5, y + 0.5) < 1.9 && !band.has(x + ',' + y)) lineMiss++;
    out.line = { n: band.size, out: lineOut, miss: lineMiss, twice: lineTwice };
    const same = (a, b) => a.size === b.size && [...a.keys()].every(k => b.has(k));
    const rectOld = new Map(), ellOld = new Map();
    m.rect(5, 5, 3, 2, (x, y) => rectOld.set(x + ',' + y, 1)); m.ellipse(30, 30, 3, 2, (x, y) => ellOld.set(x + ',' + y, 1));
    out.old = { rect: same(paint(['rect', 5, 5, 3, 2]), rectOld), ellipse: same(paint(['ellipse', 30, 30, 3, 2]), ellOld), unknown: same(paint(['blob', 30, 30, 3, 2]), ellOld) };

    // faces
    const tpl = MapModes.base(12, 12, 8, 1500, 5000, 'main');
    out.template = J(tpl.minerals) === J([[7, 9], [7, 11], [7, 13], [7, 15], [7, 17], [10, 8], [12, 8], [14, 8]]) && J(tpl.geyser) === J([17, 7]);
    const X = 20, Y = 20, nw = MapModes.base(X, Y, 8, 1500, 5000, null, 'nw'), none = MapModes.base(X, Y, 8, 1500, 5000, null);
    out.faceDefault = J(nw.minerals) === J(none.minerals) && J(nw.geyser) === J(none.geyser);
    const turnX = (p, w) => [2 * X + 4 - p[0] - w, p[1]], turnY = (p, h) => [p[0], 2 * Y + 3 - p[1] - h];
    const want = { ne: p => turnX(p, 2), sw: p => turnY(p, 1), se: p => turnY(turnX(p, 2), 1) };
    const wantG = { ne: g => turnX(g, 4), sw: g => turnY(g, 2), se: g => turnY(turnX(g, 4), 2) };
    const cx = X + 2, cy = Y + 1.5, far = b => b.minerals.map(p => Math.hypot(p[0] + 1 - cx, p[1] + 0.5 - cy)).concat([Math.hypot(b.geyser[0] + 2 - cx, b.geyser[1] + 1 - cy)]).sort().join();
    // the column is the five patches that share an x, the row the rest: which side of the hall each lies on, column then row
    const sides = b => { const xs = {}; for (const p of b.minerals) xs[p[0]] = (xs[p[0]] || 0) + 1; const c0 = +Object.keys(xs).sort((a, c) => xs[c] - xs[a])[0];
      const col = b.minerals.filter(p => p[0] === c0), row = b.minerals.filter(p => p[0] !== c0);
      return (col.every(p => p[0] + 2 <= X) ? 'w' : col.every(p => p[0] >= X + 4) ? 'e' : '?') + (row.every(p => p[1] + 1 <= Y) ? 'n' : row.every(p => p[1] >= Y + 3) ? 's' : '?') + col.length; };
    out.faces = { nw: { sides: sides(nw) } };
    for (const f of ['ne', 'sw', 'se']) {
      const b = MapModes.base(X, Y, 8, 1500, 5000, null, f);
      out.faces[f] = { turned: J(b.minerals) === J(nw.minerals.map(want[f])) && J(b.geyser) === J(wantG[f](nw.geyser)), sameReach: far(b) === far(nw), sides: sides(b) };
    }
  } finally { delete MAP_LAYOUTS.__ml_rot; delete MAP_LAYOUTS.__ml_mir; }
  return out;
`);
ok(lang.rot.symmetry === 'rot2' && lang.rot.high && lang.rot.turned && !lang.rot.mirX && !lang.rot.mirY,
  'rot2: a plateau is painted where it is and turned half round the centre, and in neither mirror', J(lang.rot));
ok(lang.rot.rock && lang.rot.rockTurned && !lang.rot.rockMirX && !lang.rot.rockMirY, '...and so is a rock shape', J(lang.rot));
ok(lang.rot.bases === '8,8:0 40,40:0 52,53:3 20,21:3' && lang.rot.starts === 2,
  '...and a base, twice: where it is (quadrant 0) and its half turn (3), whichever half of the map it is written in', lang.rot.bases);
ok(lang.rot.feats === '24,40,3x2 37,22,3x2', '...and a rock formation', lang.rot.feats);
ok(lang.rot.turnOff === 0 && lang.rot.flipOff > 0, 'a rot2 map is its own half turn tile for tile, and is not its own mirror (' + lang.rot.flipOff + ' tiles differ)', J(lang.rot));
ok(lang.mir.symmetry === 'mirror4' && lang.mir.high && lang.mir.turned && lang.mir.mirX && lang.mir.mirY && lang.mir.starts === 4,
  'the same ground with no sym is mirrored four ways, as every layout was before', J(lang.mir));
ok(lang.quads.rot === '0,3' && lang.quads.mir === '0,1,2,3' && lang.quads.none === '0,1,2,3', 'GameMap.quadrantsOf: the tile and its half turn for rot2, all four otherwise', J(lang.quads));
ok(lang.poly.n >= 180 && lang.poly.out === 0 && lang.poly.miss === 0 && lang.poly.twice === 0,
  'poly fills the tiles whose centres are inside the polygon, each once (' + lang.poly.n + ' of a 200-tile triangle)', J(lang.poly));
ok(lang.line.n > 100 && lang.line.out === 0 && lang.line.miss === 0 && lang.line.twice === 0,
  'line paints the tiles within half its width of the path, each once, the corner included (' + lang.line.n + ' tiles)', J(lang.line));
ok(lang.old.rect && lang.old.ellipse && lang.old.unknown, 'rect and ellipse paint what they always did, and a shape it does not know is an ellipse, as it always was', J(lang.old));
ok(lang.template && lang.faceDefault, 'a base with no face is the template exactly -- Lost Ruins\' old main from its numbers -- and nw is no face');
ok(['ne', 'sw', 'se'].every(f => lang.faces[f].turned && lang.faces[f].sameReach),
  'ne, sw and se are the template turned about the hall, every patch and the geyser as far from it as before', J(lang.faces));
ok(['nw', 'ne', 'sw', 'se'].every(f => lang.faces[f].sides === f[1] + f[0] + '5'),
  '...and the mineral line is on the side the face names', J(lang.faces));

// ============================================================================
// 2. The structure, on every fixed map
// ============================================================================
const FIXED = ['temple', 'bloodbath', 'valley', 'small', 'medium', 'large', 'huge', 'dustbowl', 'nightfall'];
const maps = FIXED.map(id => R(`
  const id = ${J(id)}, m = new GameMap(7, id), W = m.w, H = m.h, N = W * H, L = MAP_LAYOUTS[id];
  const worst = m.worstWalk();
  const bfs = (walk, from) => { const d = new Int32Array(N).fill(-1), q = [from]; d[from] = 0;
    for (let k = 0; k < q.length; k++) { const i = q[k], x = i % W, y = (i / W) | 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { if (!a && !b) continue; const xx = x + a, yy = y + b; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx; if (d[j] >= 0 || walk[j] !== 1) continue; if (a && b && (walk[y * W + xx] !== 1 || walk[yy * W + x] !== 1)) continue; d[j] = d[i] + 1; q.push(j); } }
    return d; };
  const plats = m.plateaus(), platOf = new Int32Array(N).fill(-1);
  for (const p of plats) for (const i of p.at) platOf[i] = p.id;
  const hallAt = b => m.idx(b.x + 2, b.y + 1);
  const out = { id, players: m.players, bases: m.bases.length, mains: [], naturals: [], levels: [], rocks: [], siege: [] };
  for (const s of m.starts) {
    const p = plats[platOf[hallAt(s)]];
    // the plateau's ramp tiles, in groups of touching tiles: one group is one way down
    let groups = 0; const left = new Set(p ? p.ramps : []);
    while (left.size) { groups++; const q = [left.values().next().value]; left.delete(q[0]);
      for (let k = 0; k < q.length; k++) { const i = q[k]; for (const j of [i - 1, i + 1, i - W, i + W]) if (left.has(j)) { left.delete(j); q.push(j); } } }
    const d = bfs(worst, m.baseAnchor(s));
    const others = m.bases.filter(b => b !== s).map(b => ({ b, d: d[m.baseAnchor(b)] })).filter(o => o.d >= 0).sort((a, c) => a.d - c.d);
    const nat = m.bases.find(b => b.natural && b.quadrant === s.quadrant);
    out.mains.push({ at: s.x + ',' + s.y, high: m.height[hallAt(s)] === 2, ramps: groups, bases: p ? p.bases : -1 });
    out.naturals.push({ at: nat ? nat.x + ',' + nat.y : null, low: !!nat && m.height[hallAt(nat)] === 0,
      nearest: others.length ? others[0].b.x + ',' + others[0].b.y : null, d: nat ? d[m.baseAnchor(nat)] : -1 });
  }
  // a base's resources on its own level
  for (const b of m.bases) { const h = m.height[hallAt(b)];
    for (const r of b.minerals.concat(b.geyser ? [b.geyser] : [])) { let off = 0; m.rect(r.x, r.y, r.w, r.h, (x, y) => { if (m.height[m.idx(x, y)] !== h) off++; }); if (off) out.levels.push(b.x + ',' + b.y + ' ' + r.type + '@' + r.x + ',' + r.y); } }
  // every base inside the playable ground: its hall's clearing and every resource at least two tiles in from each edge
  out.edge = [];
  for (const b of m.bases) for (const r of [{ x: b.x - 1, y: b.y - 1, w: 6, h: 5 }].concat(b.minerals, b.geyser ? [b.geyser] : []))
    if (r.x < 2 || r.y < 2 || r.x + r.w > W - 2 || r.y + r.h > H - 2) out.edge.push(b.x + ',' + b.y + ' ' + (r.type || 'hall') + '@' + r.x + ',' + r.y);
  // every rock formation in a real gap: the walkable tiles round it, and how much further apart the worst pair of them is on foot
  // with every formation shut than straight through (a formation in open ground saves only the walk round its own corners)
  for (const f of m.features) {
    const x0 = f.x - 1, y0 = f.y - 1, x1 = f.x + f.w, y1 = f.y + f.h, ring = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x === x0 || x === x1 || y === y0 || y === y1) && m.inb(x, y) && worst[m.idx(x, y)] === 1) ring.push([x, y]);
    let saves = 0;
    for (const [ax, ay] of ring) { const d = bfs(worst, m.idx(ax, ay));
      for (const [bx, by] of ring) { const dd = d[m.idx(bx, by)], straight = Math.max(Math.abs(ax - bx), Math.abs(ay - by)); saves = Math.max(saves, dd < 0 ? 1e9 : dd - straight); } }
    out.rocks.push({ kind: f.kind, at: f.x + ',' + f.y, saves });
  }
  // siege range: walkable high ground that is neither the base's own plateau nor its own main's
  const RANGE = SIEGE_W.range;
  for (const b of m.bases) {
    const main = m.starts.find(s => s.quadrant === b.quadrant), mine = new Set([platOf[hallAt(b)], main ? platOf[hallAt(main)] : -1]);
    let worstD = 1e9, at = null;
    for (const r of b.minerals) for (let y = Math.max(0, r.y - RANGE - 1); y <= Math.min(H - 1, r.y + RANGE + 1); y++) for (let x = Math.max(0, r.x - RANGE - 1); x <= Math.min(W - 1, r.x + RANGE + 2); x++) {
      const i = y * W + x; if (platOf[i] < 0 || mine.has(platOf[i])) continue;
      const dd = Math.hypot(Math.max(r.x - x, 0, x - (r.x + 1)), Math.max(r.y - y, 0, y - r.y));
      if (dd < worstD) { worstD = dd; at = x + ',' + y; }
    }
    if (worstD <= RANGE) out.siege.push(b.x + ',' + b.y + ' from ' + at + ' at ' + worstD.toFixed(1));
  }
  if (m.players === 2) {
    let turn = 0, flip = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, t = (H - 1 - y) * W + (W - 1 - x), f = y * W + (W - 1 - x);
      if (m.height[i] !== m.height[t] || m.walk[i] !== m.walk[t] || m.cliff[i] !== m.cliff[t]) turn++;
      if (m.height[i] !== m.height[f] || m.walk[i] !== m.walk[f] || m.cliff[i] !== m.cliff[f]) flip++; }
    const corner = b => (b.x + 2 < W / 2 ? 0 : 1) + (b.y + 1 < H / 2 ? 0 : 2);
    out.two = { sym: L.sym || null, turn, flip, corners: [0, 1, 2, 3].map(c => m.bases.filter(b => corner(b) === c).length) };
  }
  return out;
`));
const each = (name, fn, detail) => ok(maps.every(fn), name, maps.filter(m => !fn(m)).map(m => m.id + ' ' + J(detail(m))).slice(0, 3).join(' | '));
each('every main on all ' + maps.length + ' fixed maps is on high ground whose only way down is one ramp, and holds no other base',
  m => m.mains.every(x => x.high && x.ramps === 1 && x.bases === 1), m => m.mains);
each('every natural is on low ground and is the nearest base to its main on foot, every rock formation shut',
  m => m.naturals.every(n => n.low && n.nearest === n.at), m => m.naturals);
each('every player has a main, a natural and thirds: three bases a player at the least', m => m.bases / m.players >= 3, m => m.bases + '/' + m.players);
each('every base\'s minerals and geyser stand on the level of its hall -- none on its cliff, none below it', m => m.levels.length === 0, m => m.levels);
each('every base lies inside the playable ground: no hall, patch or geyser within two tiles of the edge', m => m.edge.length === 0, m => m.edge);
each('every map has rock formations on its back doors, and each stands in a real gap: shut, the ground either side of it is ten tiles or more apart on foot',
  m => m.rocks.length > 0 && m.rocks.every(r => r.kind === 'rocks' && r.saves >= 10), m => m.rocks);
each('no mineral line lies in siege range (' + R('return SIEGE_W.range;') + ' tiles) of high ground that is neither its own base\'s nor its own main\'s',
  m => m.siege.length === 0, m => m.siege);
// The computer player picks its next base by straight line (js/ai.js pickExpansion), so a map has to put its natural nearest that
// way too, not only on foot: with Lost Ruins' linear third at 8,36 -- 27 tiles from the main against the natural's 30, and twice as
// far on foot -- every race and style took the third first (.claude/review/maps/probes/first-expansion.js). Its pick at the first frame.
const picks = R(`
  const out = {};
  for (const id of ${J(FIXED)}) {
    const m = new GameMap(7, id), n = m.starts.length;
    G.init({ players: m.starts.map((s, i) => ({ race: 'TZP'[i % 3], human: false, difficulty: 'normal' })), seed: 7, layout: id });
    out[id] = G.players.map(p => { const b = p.ai.pickExpansion(), nat = G.map.bases.find(x => x.natural && x.quadrant === p.startBase.quadrant);
      return { start: p.startBase.x + ',' + p.startBase.y, pick: b ? b.x + ',' + b.y : null, natural: nat ? nat.x + ',' + nat.y : null }; });
    out[id].n = n;
  }
  return out;
`);
ok(FIXED.every(id => picks[id].length === picks[id].n && picks[id].every(x => x.natural && x.pick === x.natural)),
  'the computer player expands to the natural the map names first, from every start of every fixed map', J(FIXED.map(id => [id, picks[id].filter(x => x.pick !== x.natural)]).filter(x => x[1].length)));

const two = maps.filter(m => m.players === 2);
ok(two.map(m => m.id).join() === 'valley,small' && two.every(m => m.two.sym === 'rot2' && m.two.turn === 0 && m.two.flip > 0),
  'the two-player maps (Twilight Valley, Close Quarters) are turned half round, as StarCraft II\'s are, and not mirrored', J(two.map(m => [m.id, m.two])));
ok(two.every(m => m.two.corners.every(n => n > 0)), '...and every corner of them holds bases -- none is an empty copy of a main', J(two.map(m => [m.id, m.two.corners])));

// ============================================================================
// 3. The generators, two-player
// ============================================================================
const gen = R(`
  const out = [];
  for (const k of Archetypes.keys) for (const seed of [1, 2, 3, 4]) {
    const m = new GameMap(1, Archetypes.id(k, seed, 'small')), W = m.w, H = m.h, q = [0, 1, 2, 3].map(c => m.bases.filter(b => b.quadrant === c));
    const turned = b => (W - 4 - b.x) + ',' + (H - 3 - b.y), q2 = new Set(q[2].map(b => b.x + ',' + b.y));
    const main0 = m.bases.find(b => b.main && b.quadrant === 0), nat0 = m.bases.find(b => b.natural && b.quadrant === 0);
    out.push({ id: Archetypes.id(k, seed, 'small'), starts: m.starts.map(s => s.quadrant).join(), counts: q.map(a => a.length).join(),
      corners: q[1].concat(q[2]).filter(b => b.main || b.natural).length,
      pockets: [main0, nat0].every(b => !!b && q[1].some(o => o.x === W - 4 - b.x && o.y === b.y && !o.main && !o.natural)), fair: q[1].length === q[2].length && q[1].every(b => q2.has(turned(b))),
      mains: m.bases.filter(b => b.main).length, naturals: m.bases.filter(b => b.natural).map(b => b.quadrant).join() });
  }
  return out;
`);
ok(gen.every(g => g.starts === '0,3' && g.mains === 2 && g.naturals === '0,3'), 'a two-player generated map has its mains and naturals in quadrants 0 and 3, as before', J(gen.filter(g => g.starts !== '0,3' || g.mains !== 2)));
ok(gen.every(g => g.counts.split(',').every(n => +n > 0) && g.corners === 0 && g.pockets),
  'and bases in all four corners: the other two hold expansions where the main and the natural would be (' + gen.length + ' maps)', J(gen.filter(g => !g.counts.split(',').every(n => +n > 0) || g.corners || !g.pockets)));
ok(gen.every(g => g.fair), '...a pair that is each other\'s half turn, so neither player is nearer more of them', J(gen.filter(g => !g.fair)));

// ============================================================================
// 4. The rock is closed ground
// ============================================================================
// The user, looking at a screenshot of the creep: "no units or buildings should be able to go on the big rock - i see a creep
// colony in the screenshot, so i know this must be fixed". That screenshot was staged -- its buildings were put down with
// G.placeBuilding, the editor's door, which does not ask GameMap.canPlace -- so it showed something no game can. This section
// pins the rule it made the user doubt. The big orange mass IS the rock: Terrain.texBakeSteps reads `cliff === 2` into its rock
// zone (rz) and paints the tileset's rock material there, and on badlands that mass measures rgb 74,45,25 against high ground's
// 94,70,60 and low ground's 61,50,42 (.claude/review/rock). So cliff 2 is the tile class to hold closed, on every map at once.
const rock = R(`
  const out = [];
  const ids = Object.keys(MAP_LAYOUTS).concat(Archetypes.keys.map(k => Archetypes.id(k, 3, 'medium')));
  const T2 = DATA.buildings.barracks, Z2 = DATA.buildings.creep_colony, HALL = DATA.buildings.hatchery;
  for (const id of ids) {
    const m = new GameMap(7, id), N = m.w * m.h, reasons = {};
    let rocks = 0, walk = 0, built = 0, near = null;
    for (let i = 0; i < N; i++) {
      if (m.cliff[i] !== 2) continue;
      rocks++;
      const x = i % m.w, y = (i / m.w) | 0;
      if (m.walkable(x, y)) walk++;
      const a = m.canPlace(T2, x, y, null, [], null), b = m.canPlace(Z2, x, y, null, [], null);
      if (!a || !b) built++; else { reasons[a] = 1; reasons[b] = 1; }
      // a hall standing beside the rock, for the creep below
      if (!near) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tx = x + dx, ty = y + dy;
        if (m.inb(tx, ty) && m.walkable(tx, ty) && !m.canPlace(HALL, tx, ty, null, [], null)) { near = [tx, ty]; break; }
      }
    }
    // the creep of that hall at its full radius: the carpet has to stop at the rock's edge
    m.recomputeCreep([{ alive: true, def: HALL, tx: near[0], ty: near[1], done: true, creepR: HALL.creep }]);
    let creep = 0, onRock = 0;
    for (let i = 0; i < N; i++) if (m.creep[i]) { creep++; if (m.cliff[i] === 2) onRock++; }
    out.push({ id, rocks, walk, built, creep, onRock, hall: near.join(','), reasons: Object.keys(reasons).sort() });
  }
  return out;
`);
ok(rock.length === 17 && rock.every(r => r.rocks >= 500), 'every map has rock to test -- the border and the formations inside it (' + rock.map(r => r.rocks).join(', ') + ' tiles)', J(rock.filter(r => r.rocks < 500).map(r => [r.id, r.rocks])));
ok(rock.every(r => r.walk === 0), 'no unit walks onto the rock: not one of its tiles is walkable, on any map', J(rock.filter(r => r.walk).map(r => [r.id, r.walk])));
ok(rock.every(r => r.built === 0 && r.reasons.every(s => s === 'Cannot build there' || s === 'Cannot build on a map feature')),
  'and nothing is built on it: every rock tile refuses a Barracks and a Creep Colony, and refuses them FOR the rock', J(rock.filter(r => r.built).map(r => [r.id, r.built, r.reasons])));
ok(rock.every(r => r.creep > 100 && r.onRock === 0), 'and the creep stops at it: a Hatchery beside the rock carpets its own ground and not one rock tile', J(rock.map(r => [r.id, r.creep, r.onRock])));

ok(errors.length === 0, 'no errors were logged', errors.slice(0, 3).join(' | '));
summary();
