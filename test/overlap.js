// UNITS DO NOT STAND IN EACH OTHER'S MODELS (seventh session, user item 1).
//   node test/overlap.js
//
// "Units still seem to stack on top of each other too much to the point where their models overlap ... units should
// not overlap with each other." Measured first (.claude/review/overlap/probe.js): G.separate kept collision FOOTPRINTS
// apart, and only 0.85 of them, while tools/bake.js draws a model at up to 2.6 times its footprint. Twelve marines told
// to one point settled with 53% of their drawn model area lying on other marines, sixteen zerglings 59%, and some
// units were entirely covered. Units now keep BODIES apart -- def.body, the room the model takes up, measured from the
// baked silhouettes by tools/bodies.js -- and r keeps every rule it had.
//
// The metric here is the complaint itself, in pixels: each unit's silhouette, rendered through the bake pipeline, is
// stamped at its simulated position and facing, and HIDDEN is the share of all drawn model pixels that land on a pixel
// another model already covers.
//
//  1. THE TABLE. Every unit with a model has a body no smaller than its footprint, and the bodies in js/data.js are what
//     tools/bodies.js measures from the models today -- re-bake the art without re-measuring and this goes red.
//  2. NO OVERLAP. Clumps of marines, zerglings and zealots told to one point, settled and on the move.
//  3. WHAT BODIES MUST NOT BREAK. Each of these was broken by bodies alone, found by measuring or by reading every call
//     site that walks one unit up to another, and each has its own negative control:
//       mining workers keep the footprint rule (the income is tuned against it)
//       an SCV can still repair a Siege Tank, two Dark Templar can still merge, a follower does not shove its leader
//       an enemy zealot can still hit a zealot (MELEE_REACH)
//       zealots through a one-tile gap get through quickly (the unit in front goes first), and twenty-four of them all
//       get through (the watchdog waits in a crowd that is moving, FLOW_HOLD)
//       melee attackers on one target are not shoved out of reach by their own arrivals, and slide round each other
//  4. DETERMINISM across two identical runs of every new path.
'use strict';
const vm = require('vm'), path = require('path');
const { makeCtx, ok, summary, root } = require('./_harness');
const { Renderer } = require(path.join(root, 'tools', 'raster'));
const { UNITS } = require(path.join(root, 'tools', 'models'));
const bodies = require(path.join(root, 'tools', 'bodies'));

const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot'] });
const run = e => vm.runInContext(e, ctx);
const DATA = run('DATA');

// ---------------------------------------------------------------- silhouettes (the scale tools/bake.js draws at)
const ART_SCALE = { marine: 1.32, firebat: 1.32, medic: 1.32, ghost: 1.28, zergling: 1.35, zealot: 1.3, dark_templar: 1.3, high_templar: 1.24 };
const FINE = new Set(['siege_tank', 'vulture', 'reaver', 'ultralisk']);
const SIL = new Map();
function sil(id) {
  if (SIL.has(id)) return SIL.get(id);
  const def = DATA.units[id], r = def.r || 10;
  const k = r * (r <= 9 ? 1.75 : r <= 14 ? 1.4 : 1.15) * (ART_SCALE[id] || 1), S = Math.ceil(k * 5) + 14, n = FINE.has(id) ? 32 : 16;
  const rend = new Renderer({ elevation: 50, ss: 1, groundScale: 0.85, ambient: 0.3, aoH: 1.2, race: def.race });
  const dirs = [];
  for (let d = 0; d < n; d++) {
    const f = rend.render(UNITS[id](), { W: S, H: S, cx: S / 2, cy: S / 2, k, facing: d * Math.PI * 2 / n, st: { walk: null, atk: null, idle: 0 } });
    const px = []; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (f.rgba[(y * S + x) * 4 + 3] > 128) px.push(x - (S >> 1), y - (S >> 1));
    dirs.push(px);
  }
  const o = { n, dirs }; SIL.set(id, o); return o;
}
function hidden(units) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const u of units) { x0 = Math.min(x0, u.x); y0 = Math.min(y0, u.y); x1 = Math.max(x1, u.x); y1 = Math.max(y1, u.y); }
  const pad = 120, W = Math.ceil(x1 - x0) + pad * 2, H = Math.ceil(y1 - y0) + pad * 2, buf = new Uint8Array(W * H);
  let total = 0, distinct = 0;
  for (const u of units) {
    const s = sil(u.id), dir = ((Math.round(u.facing / (Math.PI * 2 / s.n)) % s.n) + s.n) % s.n, px = s.dirs[dir];
    const ox = Math.round(u.x - x0) + pad, oy = Math.round(u.y - y0) + pad;
    for (let i = 0; i < px.length; i += 2) { const j = (oy + px[i + 1]) * W + ox + px[i]; if (!buf[j]) distinct++; buf[j] = 1; total++; }
  }
  return (total - distinct) / total;
}

// ---------------------------------------------------------------- scene helpers, in the game's context
run(`var OV = {
  fresh(seed) {
    G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, name: 'B' }], seed: seed || 4, layout: 'temple' });
    for (const pl of G.players) pl.ai = null; G.human = 0;
    const m = G.map; const t = m.findFreeTile(m.w >> 1, m.h >> 1, 30, (x, y) => { for (let dy = -6; dy <= 6; dy++) for (let dx = -12; dx <= 12; dx++) if (!m.walkable(x + dx, y + dy)) return false; return true; });
    return { x: (t[0] + 0.5) * TILE, y: (t[1] + 0.5) * TILE };
  },
  tick(n) { for (let i = 0; i < n; i++) G.tick(); },
  pose(us) { return us.map(u => ({ id: u.def.id, x: u.x, y: u.y, facing: u.facing, r: u.r })); },
  clump(id, n) {
    const c = this.fresh(4), us = [];
    for (let i = 0; i < n; i++) us.push(G.spawnUnit(id, 0, c.x - 220 + (i % 4) * 44, c.y - 60 + Math.floor(i / 4) * 44));
    this.tick(2); for (const u of us) u.applyOrder({ type: 'move', x: c.x - 160, y: c.y }); this.tick(240);
    const settled = this.pose(us);
    for (const u of us) u.applyOrder({ type: 'move', x: c.x + 540, y: c.y });
    const walking = []; for (let f = 0; f < 150; f++) { G.tick(); if (f > 20 && f % 8 === 0) walking.push(this.pose(us)); }
    return { settled, walking };
  },
  wall(c) {
    const def = DATA.buildings.barracks, tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
    const put = y => { const b = G.placeBuilding(def, tx, y, 1); if (b) G.completeBuilding(b); return !!b; };
    const okWall = [put(ty - def.h), put(ty + 1), put(ty - 2 * def.h), put(ty + 1 + def.h), put(ty - 3 * def.h), put(ty + 1 + 2 * def.h)].every(Boolean);
    return { tx, ty, w: def.w, okWall, gapOpen: G.map.walkable(tx, ty) && !G.map.walkable(tx, ty - 1) && !G.map.walkable(tx, ty + 1) };
  },
};`);

// ============================================================================ 1. THE TABLE
{
  const withModel = Object.keys(UNITS).filter(id => !id.endsWith('_s') && DATA.units[id]);
  const bad = withModel.filter(id => !(DATA.units[id].body >= DATA.units[id].r));
  ok(withModel.length > 60 && !bad.length, 'every unit with a model has a body at least as big as its collision footprint (' + withModel.length + ' units)', bad.join(' '));
  const sample = ['marine', 'zergling', 'zealot', 'scv', 'dragoon', 'siege_tank', 'ultralisk', 'mutalisk', 'thor', 'mothership'];
  const measured = bodies.measure(sample);
  const stale = sample.filter(id => measured[id].body !== DATA.units[id].body).map(id => id + ' table ' + DATA.units[id].body + ' measured ' + measured[id].body);
  ok(!stale.length, 'the bodies in js/data.js are what tools/bodies.js measures from the models today (a re-bake without a re-measure is caught)', stale.join('; '));
  const r = run(`({ reach: MELEE_REACH, shortest: Math.min(...Object.values(DATA.units).filter(d => d.gw).map(d => d.gw.range)) })`);
  ok(r.reach === r.shortest * 32 && r.reach > 0, 'MELEE_REACH is the shortest ground weapon reach in DATA, in pixels, read rather than restated', JSON.stringify(r));
}

// ============================================================================ 2. NO OVERLAP
{
  ctx.__id = null;
  for (const [id, n, rest, walk] of [['marine', 12, 0.06, 0.08], ['zergling', 16, 0.06, 0.10], ['zealot', 8, 0.06, 0.08]]) {
    const r = run(`OV.clump('${id}', ${n})`);
    const h = hidden(r.settled);
    const touching = []; for (let i = 0; i < r.settled.length; i++) for (let j = i + 1; j < r.settled.length; j++) { const a = r.settled[i], b = r.settled[j]; if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) touching.push(i + '-' + j); }
    ok(h <= rest && !touching.length, n + ' ' + id + 's told to one point settle with at most ' + (rest * 100) + '% of their drawn models covered by one another, and no two collision circles overlapping (it was ' + { marine: 53, zergling: 59, zealot: 38 }[id] + '%)', 'hidden ' + (h * 100).toFixed(1) + '%, overlapping pairs ' + touching.length);
    const hw = r.walking.map(hidden), mean = hw.reduce((s, x) => s + x, 0) / hw.length;
    ok(mean <= walk, '...and walking together, at most ' + (walk * 100) + '% on average', 'mean hidden on the move ' + (mean * 100).toFixed(1) + '%');
  }
}

// ============================================================================ 3. WHAT BODIES MUST NOT BREAK
{
  // Mining workers keep the footprint rule. Two SCVs 20 px apart: on a mining trip nothing moves them (0.85 of 18 is
  // 15.3); idle, their bodies push them to 34.
  const r = run(`(() => {
    const c = OV.fresh(4), p = G.players[0], hall = G.units.find(u => u.owner === 0 && u.def.depot);
    const res = G.findNearestResource(hall, 'mineral');
    const pair = gather => { const a = G.spawnUnit('scv', 0, c.x, c.y), b = G.spawnUnit('scv', 0, c.x + 20, c.y);
      if (gather) for (const u of [a, b]) u.order = { type: 'gather', target: res, phase: 'goto' };
      G.rebuildGrid(); G.separate(); const d = Math.hypot(a.x - b.x, a.y - b.y); G.kill(a, null, true); G.kill(b, null, true); return +d.toFixed(2); };
    return { mining: pair(true), idle: pair(false), body: DATA.units.scv.body };
  })()`);
  ok(r.mining === 20 && r.idle >= 2 * r.body - 0.01, 'two SCVs on a mining trip are left where they stand (the mineral line keeps the spacing its income is tuned to); two idle ones are pushed out to their bodies', JSON.stringify(r));
}
{
  const r = run(`(() => {
    const c = OV.fresh(4);
    const tank = G.spawnUnit('siege_tank', 0, c.x, c.y), scv = G.spawnUnit('scv', 0, c.x - 120, c.y);
    tank.hp = tank.maxHp - 60; const hp0 = tank.hp; G.players[0].minerals = 1000; G.players[0].gas = 1000;
    G.applying = true; scv.setOrder({ type: 'repair', target: tank }); G.applying = false;
    OV.tick(24 * 10);
    return { hp0, hp: tank.hp, max: tank.maxHp, order: scv.order.type, gap: +Math.hypot(scv.x - tank.x, scv.y - tank.y).toFixed(1), bodies: DATA.units.scv.body + DATA.units.siege_tank.body };
  })()`);
  ok(r.hp > r.hp0 + 20, 'an SCV still repairs a Siege Tank -- it has to stand closer than their two bodies, and an ally the order is about keeps the footprint rule', JSON.stringify(r));
}
{
  const r = run(`(() => {
    const c = OV.fresh(4);
    const a = G.spawnUnit('dark_templar', 0, c.x - 60, c.y), b = G.spawnUnit('dark_templar', 0, c.x + 60, c.y);
    G.applying = true; Abilities.merge([a, b], 'summon_dark_archon'); G.applying = false;
    // Two seconds, and where they met. Without the exception they still merged eventually, measured: one shoved the other 400 px
    // across the map until it hit something that would not move, and they merged against the wall five seconds later.
    let at = -1; for (let f = 0; f < 24 * 12 && at < 0; f++) { G.tick(); if (!a.alive && !b.alive) at = f; }
    const da = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'dark_archon');
    return { mergedAtFrame: at, strayed: da ? Math.round(Math.hypot(da.x - c.x, da.y - c.y)) : null, bodies: 2 * DATA.units.dark_templar.body };
  })()`);
  ok(r.mergedAtFrame >= 0 && r.mergedAtFrame <= 48 && r.strayed <= 32, 'two Dark Templar still merge into a Dark Archon, inside two seconds and where they met -- they have to meet inside 28 px, and their bodies stand 30 apart', JSON.stringify(r));
}
{
  const r = run(`(() => {
    const c = OV.fresh(4);
    const lead = G.spawnUnit('zealot', 0, c.x, c.y), foll = G.spawnUnit('zealot', 0, c.x - 100, c.y);
    for (let f = 0; f < 4; f++) G.tick();
    const x0 = lead.x, y0 = lead.y;
    G.applying = true; foll.setOrder({ type: 'follow', target: lead }); G.applying = false;
    OV.tick(24 * 10);
    return { leaderMoved: +Math.hypot(lead.x - x0, lead.y - y0).toFixed(1), gap: +Math.hypot(lead.x - foll.x, lead.y - foll.y).toFixed(1), order: foll.order.type };
  })()`);
  ok(r.leaderMoved <= 4 && r.order === 'follow', 'a Zealot following an idle Zealot stands off and does not shove its leader across the map (it stops at r + r + 24, inside two bodies)', JSON.stringify(r));
}
{
  const r = run(`(() => {
    const c = OV.fresh(4);
    const foe = G.spawnUnit('zealot', 1, c.x, c.y), z = G.spawnUnit('zealot', 0, c.x - 90, c.y);
    foe.def = Object.assign({}, foe.def, { gw: null, aw: null });
    const hp0 = foe.hp + foe.sh;
    G.applying = true; z.setOrder({ type: 'attack', target: foe }); G.applying = false;
    OV.tick(24 * 6);
    return { dealt: hp0 - (foe.hp + foe.sh), gap: +Math.hypot(z.x - foe.x, z.y - foe.y).toFixed(1), bodies: 2 * DATA.units.zealot.body, reach: 2 * DATA.units.zealot.r + DATA.units.zealot.gw.range * 32 };
  })()`);
  ok(r.dealt > 0, 'a Zealot still hits an enemy Zealot: two bodies apart it would be out of reach, so enemies may close to their footprints plus MELEE_REACH', JSON.stringify(r));
}
// wide: how many abreast the group starts; back, up: how many tiles back from the wall and up from the gap it starts
const gap = (id, n, wide, back, up) => run(`(() => {
  const c = OV.fresh(4), w = OV.wall(c), us = [];
  for (let i = 0; i < ${n}; i++) us.push(G.spawnUnit('${id}', 0, (w.tx - ${back}) * 32 + (i % ${wide}) * 30, (w.ty - ${up}) * 32 + Math.floor(i / ${wide}) * 30));
  OV.tick(2); const gx = (w.tx + w.w + 6) * 32, gy = (w.ty + 0.5) * 32;
  for (const u of us) u.applyOrder({ type: 'move', x: gx, y: gy });
  const past = u => u.x > (w.tx + w.w) * 32 + 8;
  let done = -1, gaveUp = 0; const seen = new Set();
  for (let f = 0; f < 24 * 90; f++) { G.tick(); for (const u of us) if (!seen.has(u) && u.order.type !== 'move') { seen.add(u); if (!past(u)) gaveUp++; } if (done < 0 && us.every(past)) { done = f; break; } }
  return { wall: w.okWall && w.gapOpen, done, through: us.filter(past).length, gaveUp };
})()`);
{
  const r = gap('zealot', 12, 4, 7, 1);
  ok(r.wall && r.through === 12 && r.done > 0 && r.done <= 24 * 12, 'twelve Zealots through a one-tile gap in a wall get through inside twelve seconds, because the unit in front of the queue goes first (9.3 s; 15.7 s when everyone shoved evenly)', JSON.stringify(r));
  const big = gap('zealot', 24, 5, 9, 2);
  ok(big.wall && big.through === 24 && big.gaveUp === 0, 'twenty-four Zealots all get through -- none gives up waiting its turn in a jam that is still moving (FLOW_HOLD; without it one is left behind)', JSON.stringify(big));
}
{
  const r = run(`(() => {
    const c = OV.fresh(4);
    const T = G.spawnUnit('marine', 1, c.x, c.y); T.def = Object.assign({}, T.def, { gw: null, aw: null });
    const us = []; for (let i = 0; i < 16; i++) us.push(G.spawnUnit('zergling', 0, c.x - 200 + (i % 4) * 30, c.y - 45 + Math.floor(i / 4) * 30));
    OV.tick(2); G.applying = true; for (const u of us) u.setOrder({ type: 'attack', target: T }); G.applying = false;
    let sum = 0, k = 0, drops = 0; const prev = new Map();
    for (let f = 0; f < 360; f++) { T.hp = 1e6; G.tick(); if (f > 120) { let n = 0; for (const u of us) { const inR = u.alive && u.inRange(T); if (inR) n++; if (prev.get(u) && !inR) drops++; prev.set(u, inR); } sum += n; k++; } }
    return { meanInRange: +(sum / k).toFixed(2), shovedOut: drops };
  })()`);
  ok(r.shovedOut <= 5, 'sixteen Zerglings on one Marine: an attacker already in reach is not shoved out of it by the ones still arriving (with bodies and no hold, 93 times in ten seconds)', JSON.stringify(r));
  ok(r.meanInRange >= 4.5, '...and the arrivals slide round the ones fighting to find room, so about as many land blows as fit round a Marine (5; 4 when they only queue behind)', JSON.stringify(r));
}

// ============================================================================ 4. DETERMINISM
{
  const once = () => run(`(() => {
    const c = OV.fresh(9), w = OV.wall(c);
    const T = G.spawnUnit('ultralisk', 1, c.x - 300, c.y + 120);
    const lings = []; for (let i = 0; i < 12; i++) lings.push(G.spawnUnit('zergling', 0, c.x - 420 + (i % 4) * 20, c.y + 60 + Math.floor(i / 4) * 20));
    const zs = []; for (let i = 0; i < 10; i++) zs.push(G.spawnUnit('zealot', 0, (w.tx - 7) * 32 + (i % 4) * 30, (w.ty - 1) * 32 + Math.floor(i / 4) * 30));
    OV.tick(2); G.applying = true; for (const u of lings) u.setOrder({ type: 'attack', target: T }); for (const u of zs) u.setOrder({ type: 'move', x: (w.tx + w.w + 6) * 32, y: (w.ty + 0.5) * 32 }); G.applying = false;
    OV.tick(600);
    return G.stateHash();
  })()`);
  const a = once(), b = once();
  ok(a === b, 'a gap jam and a melee surround, run twice from the same seed, end in the same state (the slide breaks ties by id)', a + ' / ' + b);
}

summary({ nl: true });
