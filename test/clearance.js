// FIXLIST-M14 C6 (item 18) -- a wide unit gets a path its BODY can walk.
//
// Reported as "the Thor gets stuck walking on buildings; check pathing for all units and ensure they
// path around". The item said to build the probe first and let the table decide the fix, and the table
// contradicted half the report:
//
//   NO GROUND UNIT EVER ENDS INSIDE A FOOTPRINT. Not by centre, not by body, in any of five scenarios,
//   across all 41 ground units. The self-heal pass in G.tick already covers that.
//
// What DOES happen is the fault the item hypothesised, wearing a different symptom. Through a one-tile
// gap in a wall, before the change:
//
//     thor       r 20   arrived: FALSE
//     ultralisk  r 20   arrived: FALSE
//     everything narrower: arrived
//
// A Thor is forty pixels across and the gap is thirty-two. The search found a route for a POINT, handed
// it a path its body could not take, and the player saw "my Thor will not go where I told it" -- which
// reads as stuck. So the fix is clearance, and the check below is the A/B that proved it.
//
//   node test/clearance.js
const fs = require('fs'), vm = require('vm'), path = require('path'), { makeCtx, makeOk, summary } = require('./_harness'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'], ext: false, errors, collect: 'join' });
const ok = makeOk({ extra: 'nonempty' });
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

// =============================================================================
// 1. the threshold, and who is over it
// =============================================================================
const wide = J(`(() => {
  const over = [], under = [];
  for (const k of Object.keys(DATA.units)) { const d = DATA.units[k];
    if (d.fly || d.isBuilding || !(d.speed > 0) || d.larva || d.egg || d.notUnit || d.mine) continue;
    ((d.r || 10) > WIDE_BODY ? over : under).push(k); }
  return { threshold: WIDE_BODY, tile: TILE, over: over.sort(), under: under.length };
})()`);
ok(wide.threshold === wide.tile / 2, 'the threshold is half a tile -- the radius at which a centred unit stops fitting inside its own tile', String(wide.threshold));
ok(wide.over.join(',') === 'carrion_maw,reaver,thor,ultralisk', 'four ground bodies are over it: the Reaver, the Thor, the Ultralisk and the native Carrion Maw', wide.over.join(','));
ok(wide.under >= 35, 'and the other ' + wide.under + ' path exactly as they always did -- the cost is theirs alone, and they do not pay it');

// =============================================================================
// 2. THE A/B: a one-tile gap ahead, a three-tile gap further along
// =============================================================================
// A narrow unit should take the near gap. A wide one cannot fit through it and must route to the wide
// one. Both halves are driven in the same game so the geometry cannot be the difference.
const ab = J(`(() => {
  const trial = (id, wideFlag) => {
    G.init({ players: [{ race: 'T', human: false, name: 'A', team: 1 }, { race: 'T', human: false, name: 'B', team: 2 }], seed: 7, layout: 'temple' });
    for (const p of G.players) p.ai = null;
    for (const u of [...G.units]) G.kill(u, null, true);
    G.units = G.units.filter(u => u.alive);
    G.checkVictory = () => { };
    const T = TILE, m = G.map, cy = Math.floor(m.h / 2), cx = Math.floor(m.w / 2) - 14;
    const depot = DATA.buildings.supply_depot;
    const put = (tx, ty) => { const b = G.placeBuilding(depot, tx, ty, 1); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
    const wallX = cx + 10;
    for (let k = -8; k <= 8; k++) { if (k === 0) continue; if (k >= 3 && k <= 4) continue; put(wallX, cy + k * depot.h); }
    put(wallX, cy - 1);
    G.updateVision(); G.rebuildGrid();
    const u = G.spawnUnit(id, 0, cx * T, (cy + 1) * T);
    // wideFlag null = whatever the shipped rule says; true/false = forced, for the A/B
    if (wideFlag !== null) { const orig = G.pf.find.bind(G.pf); G.pf.find = (a, b, c, d, e) => orig(a, b, c, d, e, wideFlag); }
    const goal = [(wallX + 8) * T, (cy + 1) * T];
    u.applyOrder({ type: 'move', x: goal[0], y: goal[1] });
    const bodyOn = () => { for (const [dx, dy] of [[0,0],[-0.7,0],[0.7,0],[0,-0.7],[0,0.7]]) {
        const tx = Math.floor((u.x + dx * u.r) / T), ty = Math.floor((u.y + dy * u.r) / T);
        if (m.inb(tx, ty) && m.blocked[m.idx(tx, ty)] >= 0) return true; } return false; };
    let bodyInside = 0, centreInside = 0;
    for (let f = 0; f < 24 * 40; f++) {
      G.tick(); if (!u.alive) break;
      if (bodyOn()) bodyInside++;
      if (m.blocked[m.idx(Math.floor(u.x / T), Math.floor(u.y / T))] >= 0) centreInside++;
      if (Math.hypot(u.x - goal[0], u.y - goal[1]) < 24) break;
    }
    return { arrived: u.alive && Math.hypot(u.x - goal[0], u.y - goal[1]) < 48, bodyInside, centreInside };
  };
  const out = {};
  for (const id of ['thor', 'ultralisk', 'reaver', 'siege_tank', 'marine']) {
    out[id] = { shipped: trial(id, null), point: trial(id, false) };
  }
  return out;
})()`);
ok(ab.thor.point.arrived === false, 'BEFORE (point pathing): the Thor never gets there at all', JSON.stringify(ab.thor.point));
ok(ab.thor.shipped.arrived === true, 'AFTER (clearance): it routes to the wide gap and arrives', JSON.stringify(ab.thor.shipped));
for (const id of ['thor', 'ultralisk', 'reaver']) {
  ok(ab[id].point.bodyInside > 0, id + ': with point pathing its body overlapped a footprint for ' + ab[id].point.bodyInside + ' frames');
  ok(ab[id].shipped.bodyInside === 0, '...and with clearance it never touches one', JSON.stringify(ab[id].shipped));
}
// The control that keeps it honest: a unit at or under the threshold must be UNAFFECTED, which means
// its two runs are identical. The Siege Tank at exactly r 16 is the interesting one.
for (const id of ['siege_tank', 'marine']) {
  ok(JSON.stringify(ab[id].shipped) === JSON.stringify(ab[id].point),
    'CONTROL: the ' + id + ' (r ' + (id === 'marine' ? 8 : 16) + ') is bit-identical either way -- the rule does not touch it', JSON.stringify(ab[id]));
}

// =============================================================================
// 3. what the probe found FIRST, kept as a standing check
// =============================================================================
// "No ground unit ever ends inside a footprint" was true before this change and must stay true after
// it. Swept over every ground unit that walks, not just the wide ones.
const sweep = J(`(() => {
  const ids = Object.keys(DATA.units).filter(k => { const d = DATA.units[k];
    return !d.fly && !d.isBuilding && (d.speed || 0) > 0 && !d.larva && !d.egg && !d.notUnit && !d.mine && d.race !== 'N'; });
  const bad = [];
  for (const id of ids) {
    G.init({ players: [{ race: 'T', human: false, name: 'A', team: 1 }, { race: 'T', human: false, name: 'B', team: 2 }], seed: 7, layout: 'temple' });
    for (const p of G.players) p.ai = null;
    for (const u of [...G.units]) G.kill(u, null, true);
    G.units = G.units.filter(u => u.alive);
    G.checkVictory = () => { };
    const T = TILE, m = G.map, cy = Math.floor(m.h / 2), cx = Math.floor(m.w / 2) - 14;
    const depot = DATA.buildings.supply_depot;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) {
      const bb = G.placeBuilding(depot, cx + 6 + a * (depot.w + 1), cy - 4 + b * (depot.h + 1), 1);
      if (bb) { bb.done = true; bb.hp = bb.maxHp; bb.progress = bb.def.time; }
    }
    G.updateVision(); G.rebuildGrid();
    const u = G.spawnUnit(id, 0, cx * T, cy * T);
    const goal = [(cx + 6 + 4 * (depot.w + 1) + 4) * T, cy * T];
    u.applyOrder({ type: 'move', x: goal[0], y: goal[1] });
    for (let f = 0; f < 24 * 30; f++) { G.tick(); if (!u.alive) break; if (Math.hypot(u.x - goal[0], u.y - goal[1]) < 24) break; }
    if (u.alive && m.blocked[m.idx(Math.floor(u.x / T), Math.floor(u.y / T))] >= 0) bad.push(id);
  }
  return { n: ids.length, bad };
})()`);
ok(sweep.bad.length === 0, 'NO GROUND UNIT ENDS INSIDE A FOOTPRINT, all ' + sweep.n + ' of them, walking through a packed base', sweep.bad.join(', '));

// =============================================================================
// 4. the start tile is exempt, which is what lets a wedged Thor get out
// =============================================================================
const out = J(`(() => {
  G.init({ players: [{ race: 'T', human: false, name: 'A', team: 1 }, { race: 'T', human: false, name: 'B', team: 2 }], seed: 7, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (const u of [...G.units]) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive);
  G.checkVictory = () => { };
  const T = TILE, m = G.map, cy = Math.floor(m.h / 2), cx = Math.floor(m.w / 2) - 14;
  const depot = DATA.buildings.supply_depot;
  const put = (tx, ty) => { const b = G.placeBuilding(depot, tx, ty, 1); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
  // a Thor in a pocket: buildings on three sides, one tile of daylight
  const u = G.spawnUnit('thor', 0, cx * T, cy * T);
  put(cx - 3, cy - 1); put(cx + 2, cy - 1); put(cx - 1, cy - 3);
  G.updateVision(); G.rebuildGrid();
  const startFits = (() => { const tx = Math.floor(u.x / T), ty = Math.floor(u.y / T);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!m.walkable(tx + a, ty + b)) return false; return true; })();
  const goal = [(cx) * T, (cy + 12) * T];
  u.applyOrder({ type: 'move', x: goal[0], y: goal[1] });
  const x0 = u.x, y0 = u.y;
  for (let f = 0; f < 24 * 20; f++) { G.tick(); if (Math.hypot(u.x - goal[0], u.y - goal[1]) < 32) break; }
  return { startFits, moved: Math.round(Math.hypot(u.x - x0, u.y - y0)), arrived: Math.hypot(u.x - goal[0], u.y - goal[1]) < 64 };
})()`);
ok(!out.startFits, 'the Thor really is standing somewhere its own rule would refuse', JSON.stringify(out));
// The claim is that it ESCAPES, not that it completes the trip: a wedged unit moves nothing at all,
// and 230 px of displacement out of a three-sided pocket is unambiguously out of it.
ok(out.moved > 100, 'AND IT STILL PATHS OUT -- the start tile is exempt, or a shoved unit would be wedged for good', JSON.stringify(out));

// =============================================================================
// 5. determinism
// =============================================================================
const det = J(`(() => {
  const play = () => { G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'normal', name: 'B', team: 2 }], seed: 13, layout: 'temple' }); for (let f = 0; f < 24 * 60 * 8; f++) G.tick(); return G.stateHash(); };
  return { a: play(), b: play() };
})()`);
ok(det.a === det.b, 'an eight-minute game re-runs bit-identically -- the clearance test reads only walk and blocked', det.a + ' vs ' + det.b);
{ const src = fs.readFileSync(path.join(root, 'js', 'map.js'), 'utf8');
  const fn = src.slice(src.indexOf('find(sx, sy, gx, gy'), src.indexOf('  los(x0, y0, x1, y1)'));
  ok(!/Math\.random|Date\.now|performance\./.test(fn), 'and the search uses no randomness and no clock');
  ok(/const fits = wide/.test(fn), 'the clearance test is a parameter of the search, not a unit-id branch inside it'); }

// =============================================================================
// A DEAD REFINERY GIVES THE GEYSER BACK, NOT THE GROUND (SCAN-M18 A1.5)
// =============================================================================
// blocked[] says who owns a tile: -2 a mineral patch, -3 a geyser, -4 a feature, -5 a wreck, -6 a lowered depot, else
// a unit id. GameMap.unblock returned a dead building's whole footprint to -1, and a Refinery stands ON a geyser, so
// killing one opened the geyser's own tiles for good. Measured before the fix: once the hulk had rotted the tiles
// were walkable and canPlace accepted a Supply Depot there -- while still accepting a Refinery, because that branch
// only asks geyserAt -- so two live buildings could share one footprint. On the small generated maps the main's
// geyser sits on the plateau's cliff row, which made this a second way into the main across ground drawn as rock.
const gy = J(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 1, layout: 'medium' });
  G.players[1].ai = null; const m = G.map, p = G.players[0]; p.minerals = 9000; p.gas = 9000;
  const g = m.resources.find(r => r.type === 'geyser');
  const read = () => ({ blocked: m.blocked[m.idx(g.x, g.y)], walk: m.walkable(g.x, g.y),
    depot: m.canPlace(DATA.buildings.supply_depot, g.x, g.y, null, [], null), refinery: m.canPlace(DATA.buildings.refinery, g.x, g.y, null, [], null) });
  const before = read();
  const b = G.placeBuilding(DATA.buildings.refinery, g.x, g.y, 0); G.completeBuilding(b);
  const onIt = read();
  G.kill(b, null);
  for (let i = 0; i < 4000; i++) G.tick();     // and let the hulk rot: it is the wreck's release that used to leak
  return { before, onIt, after: read(), mined: m.resources.filter(r => r.type === 'mineral').length };
})()`);
ok(gy.before.blocked === -3 && gy.before.walk === false && !!gy.before.depot && gy.before.refinery === null,
  'a bare geyser is the geyser\'s own ground: nothing walks on it, nothing but a Refinery is built on it', JSON.stringify(gy.before));
ok(gy.onIt.refinery !== null, 'with a Refinery standing on it, a second one is refused', JSON.stringify(gy.onIt));
ok(gy.after.blocked === -3 && gy.after.walk === false && !!gy.after.depot,
  'AND WHEN THAT REFINERY DIES THE GEYSER IS A GEYSER AGAIN -- not open, walkable ground anyone may build a depot on', JSON.stringify(gy.after));
ok(gy.after.refinery === null, '...and a new Refinery may be built there, which is the whole point of giving it back', JSON.stringify(gy.after));

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
summary({ nl: true });
