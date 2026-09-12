// Movement edge cases that used to hang a unit forever with a live order.
//   node test/movement.js
// The pathfinder returns a best-effort partial path rather than failing, so an unreachable goal never
// reports an error - the unit just grinds into the obstacle. And a unit that ends up overlapping a
// building has to be able to get out again, including a large unit straddling a footprint edge.
const vm = require('vm'), { makeCtx, okMC: ok, summary } = require('./_harness');

const errors = [];
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'], el: 'bare', errors });
const run = src => vm.runInContext(src, ctx);

run(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 2, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  // orders are issued directly, the way replay/network delivery does, so the CMD wrappers stay out of it
  this.order = (u, o) => { G.applying = true; try { u.setOrder(o); } finally { G.applying = false; } };
  this.spawn = (id, owner, x, y) => { G.applying = true; try { return G.spawnUnit(id, owner, x, y); } finally { G.applying = false; } };
  this.tick = n => { for (let i = 0; i < n; i++) G.tick(); };
})();`);

// ---- 1. an unreachable goal is abandoned ----
run(`(() => {
  const p = G.players[0], m = G.map;
  const u = this.spawn('marine', 0, p.startX, p.startY);
  // the nearest unwalkable tile a good distance away: reachable by line of sight, not by foot
  let goal = null;
  for (let r = 6; r < 40 && !goal; r++) for (let a = 0; a < 32 && !goal; a++) {
    const tx = Math.floor(u.x / TILE + Math.cos(a / 32 * 6.283) * r), ty = Math.floor(u.y / TILE + Math.sin(a / 32 * 6.283) * r);
    if (m.inb(tx, ty) && !m.walkable(tx, ty)) goal = [tx, ty];
  }
  this.goal = goal;
  this.order(u, { type: 'move', x: (goal[0] + .5) * TILE, y: (goal[1] + .5) * TILE });
  let gaveUp = -1;
  for (let i = 0; i < 24 * 30; i++) { G.tick(); if (u.order.type === 'idle') { gaveUp = i; break; } }
  this.unreachable = { gaveUp, order: u.order.type, secs: gaveUp < 0 ? -1 : +(gaveUp / 24).toFixed(1) };
  this.marine = u;
})();`);
ok('a unit ordered onto an unreachable cliff gives up instead of grinding forever',
  ctx.unreachable.gaveUp >= 0 && ctx.unreachable.secs <= 12, JSON.stringify(ctx.unreachable));
// The pathfinder reports "no route" straight away for a walled-off goal, so this is fast; the ten-second
// watchdog is the backstop for goals it thinks are reachable but never gets closer to.
ok('...and it gives up promptly rather than after a long stall', ctx.unreachable.secs <= 3, String(ctx.unreachable.secs) + 's');

// ---- 2. no false positives: a long but reachable walk still completes ----
run(`(() => {
  const m = G.map, u = this.marine;
  const b = G.map.bases.map(b => b).sort((x, y) => distPt(y.cx, y.cy, u.x, u.y) - distPt(x.cx, x.cy, u.x, u.y))[0];
  const t = m.findFreeTile(Math.floor(b.cx / TILE), Math.floor(b.cy / TILE), 8);
  this.far = Math.round(distPt(u.x, u.y, (t[0] + .5) * TILE, (t[1] + .5) * TILE) / TILE);
  this.order(u, { type: 'move', x: (t[0] + .5) * TILE, y: (t[1] + .5) * TILE });
  let arrived = false;
  for (let i = 0; i < 24 * 180; i++) { G.tick(); if (u.order.type === 'idle') { arrived = distPt(u.x, u.y, (t[0] + .5) * TILE, (t[1] + .5) * TILE) < 2 * TILE; break; } }
  this.longWalk = { arrived, tiles: this.far };
})();`);
ok('a long but reachable walk still completes (the watchdog does not fire on detours)',
  ctx.longWalk.arrived === true, JSON.stringify(ctx.longWalk));

// ---- 3. building on a geyser: the goal tile is unwalkable and that is normal ----
run(`(() => {
  const p = G.players[0];
  const base = G.map.bases.find(b => distPt(b.cx, b.cy, p.startX, p.startY) < 12 * TILE);
  const g = base.geyser;
  const w = this.spawn('scv', 0, p.startX + 40, p.startY + 40);
  this.order(w, { type: 'build', def: DATA.buildings.refinery, tx: g.x, ty: g.y });
  let built = null;
  for (let i = 0; i < 24 * 90; i++) { G.tick(); const r = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'refinery'); if (r) { built = i; break; } }
  this.refinery = { built, secs: built === null ? -1 : +(built / 24).toFixed(1) };
})();`);
ok('an SCV still reaches a geyser to build a refinery (goal tile is unwalkable, walking in is correct)',
  ctx.refinery.built !== null, JSON.stringify(ctx.refinery));

// ---- 4. a large unit straddling a footprint edge is pushed out ----
run(`(() => {
  const p = G.players[0];
  const b = G.units.find(u => u.alive && u.owner === 0 && u.isBuilding && u.def.depot);
  const m = G.map;
  // drop an Ultralisk (r 20) so its centre tile is clear but its body overlaps the hall
  const x = b.tx * TILE - 6, y = (b.ty + 1) * TILE + 8;
  const ul = this.spawn('ultralisk', 0, x, y);
  const cx = Math.floor(ul.x / TILE), cy = Math.floor(ul.y / TILE);
  this.centreClear = m.blocked[m.idx(cx, cy)] < 0;
  this.overlapped = ul.x > b.tx * TILE - ul.r && ul.x < (b.tx + b.def.w) * TILE + ul.r && ul.y > b.ty * TILE - ul.r && ul.y < (b.ty + b.def.h) * TILE + ul.r;
  const x0 = ul.x, y0 = ul.y;
  this.tick(48);
  this.stillOverlapping = ul.x > b.tx * TILE - ul.r && ul.x < (b.tx + b.def.w) * TILE + ul.r && ul.y > b.ty * TILE - ul.r && ul.y < (b.ty + b.def.h) * TILE + ul.r;
  this.moved = Math.round(distPt(x0, y0, ul.x, ul.y));
})();`);
ok('the test really did wedge a large unit with a clear centre tile', ctx.centreClear === true && ctx.overlapped === true, 'centreClear=' + ctx.centreClear + ' overlapped=' + ctx.overlapped);
ok('a large unit straddling a building footprint is pushed clear', ctx.stillOverlapping === false, 'moved ' + ctx.moved + 'px');

// ---- 5. burrowed units ----
run(`(() => {
  const p = G.players[0];
  G.applying = true; p.tech.add('burrow_tech'); G.applying = false;
  const z = this.spawn('zergling', 0, p.startX + 120, p.startY + 120);
  G.applying = true; Abilities.instant(z, 'burrow'); G.applying = false;
  this.tick(30);
  this.burrowedFirst = z.burrowed;
  // hold must not surface it
  this.order(z, { type: 'hold' }); this.tick(30);
  this.holdKeepsBurrow = z.burrowed;
  // a move order must
  this.order(z, { type: 'move', x: p.startX, y: p.startY });
  this.tick(40);
  this.moveSurfaces = !z.burrowed;
  // and so must a load order, which used to be missing from the list
  G.applying = true; Abilities.instant(z, 'burrow'); G.applying = false; this.tick(30);
  const d = this.spawn('dropship', 0, p.startX + 130, p.startY + 130);
  this.reBurrowed = z.burrowed;
  this.order(z, { type: 'load', target: d });
  let loaded = false;
  for (let i = 0; i < 24 * 30; i++) { G.tick(); if (z.inside) { loaded = true; break; } }
  this.loadWorks = loaded;
})();`);
ok('a burrowed unit stays burrowed on hold', ctx.burrowedFirst === true && ctx.holdKeepsBurrow === true, 'burrowed=' + ctx.burrowedFirst + ' afterHold=' + ctx.holdKeepsBurrow);
ok('a move order surfaces a burrowed unit', ctx.moveSurfaces === true);
ok('a burrowed unit told to board a transport surfaces and boards', ctx.reBurrowed === true && ctx.loadWorks === true, 'reBurrowed=' + ctx.reBurrowed + ' loaded=' + ctx.loadWorks);

ok('no JS errors', errors.length === 0, errors[0] || '');
summary({ nl: true });
