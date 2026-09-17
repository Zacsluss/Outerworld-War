// Transport ferry routes that run themselves. M11 wave three, item 4.
//
// The design decisions worth pinning, because each is a thing that would be wrong in an obvious way:
//   * ONE point, not two. The near end is where the transport stands when you set the route, so it
//     goes through the existing one-click pending system rather than a two-stage mode nothing else in
//     the UI has.
//   * It never calls nextOrder. A route that ended after one lap is not a route.
//   * It picks up IDLE units only. Loading anything standing nearby would hijack a worker on its way
//     to a patch, and a shuttle that eats your economy is worse than no shuttle.
//   node test/ferry.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot'], ext: false });

const r = vm.runInContext(`(() => {
  const out = {};
  const start = () => G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });
  start();
  const p = G.players[0];
  const ax = p.startX + 6 * TILE, ay = p.startY + 6 * TILE, bx = p.startX + 26 * TILE, by = p.startY + 6 * TILE;
  const ship = G.spawnUnit('dropship', 0, ax, ay);
  const riders = []; for (let k = 0; k < 4; k++) riders.push(G.spawnUnit('marine', 0, ax + ((k % 2) * 30 - 15), ay + (Math.floor(k / 2) * 30 - 15)));
  // one marine with a job of its own, standing in the pickup radius the whole time
  const busy = G.spawnUnit('marine', 0, ax + 20, ay + 20); busy.applyOrder({ type: 'move', x: p.startX, y: p.startY });
  ship.applyOrder({ type: 'ferry', ax, ay, bx, by, leg: 'a', since: null });
  out.cap = ship.def.cargo;

  let maxLoaded = 0, laps = 0, lastLeg = 'a';
  for (let i = 0; i < 3000; i++) {
    G.tick();
    if (ship.order.type === 'ferry' && ship.order.leg !== lastLeg) { lastLeg = ship.order.leg; if (lastLeg === 'a') laps++; }
    maxLoaded = Math.max(maxLoaded, ship.cargo.length);
  }
  out.run = {
    maxLoaded, laps, stillFerrying: ship.order.type === 'ferry',
    deliveredNearB: riders.filter(m => m.alive && !m.inside && Math.hypot(m.x - bx, m.y - by) < 10 * TILE).length,
    leftAtA: riders.filter(m => m.alive && !m.inside && Math.hypot(m.x - ax, m.y - ay) < 6 * TILE).length,
  };
  out.busyNotHijacked = busy.alive && !busy.inside;

  // it keeps going: put four more idle marines at the near end and they get moved too
  const wave2 = []; for (let k = 0; k < 4; k++) wave2.push(G.spawnUnit('marine', 0, ax + ((k % 2) * 30 - 15), ay + (Math.floor(k / 2) * 30 - 15)));
  for (let i = 0; i < 3000; i++) G.tick();
  out.secondWave = wave2.filter(m => m.alive && !m.inside && Math.hypot(m.x - bx, m.y - by) < 10 * TILE).length;

  // ---- a thing that cannot carry anything refuses the order rather than looping forever ----
  start();
  const marine = G.spawnUnit('marine', 0, G.players[0].startX + 4 * TILE, G.players[0].startY + 4 * TILE);
  marine.applyOrder({ type: 'ferry', ax: marine.x, ay: marine.y, bx: marine.x + 300, by: marine.y, leg: 'a', since: null });
  for (let i = 0; i < 40; i++) G.tick();
  out.notATransport = marine.order.type;

  // ---- an enemy unit standing at the near end is not picked up ----
  start();
  const p2 = G.players[0];
  const cx = p2.startX + 8 * TILE, cy = p2.startY + 8 * TILE;
  const ship2 = G.spawnUnit('dropship', 0, cx, cy);
  const foe = G.spawnUnit('marine', 1, cx + 20, cy);
  ship2.applyOrder({ type: 'ferry', ax: cx, ay: cy, bx: cx + 400, by: cy, leg: 'a', since: null });
  for (let i = 0; i < 300; i++) G.tick();
  out.enemyNotLoaded = !foe.inside && ship2.cargo.every(u => u.owner === 0);

  // ---- the route survives a snapshot, which is what makes it legal at all ----
  start();
  const p3 = G.players[0];
  const s3 = G.spawnUnit('dropship', 0, p3.startX + 5 * TILE, p3.startY + 5 * TILE);
  s3.applyOrder({ type: 'ferry', ax: s3.x, ay: s3.y, bx: s3.x + 500, by: s3.y, leg: 'b', since: 12 });
  const snap = Snapshot.take();
  s3.order = { type: 'idle' };
  Snapshot.restore(snap);
  const s4 = G.byId.get(s3.id);
  out.snap = { type: s4.order.type, leg: s4.order.leg, bx: s4.order.bx, since: s4.order.since };
  return out;
})()`, ctx);

ok(r.run.maxLoaded === 4, 'a ferry loads the idle units waiting at its near end', JSON.stringify(r.run));
ok(r.run.deliveredNearB === 4, '...carries them to the far end and puts them down', JSON.stringify(r.run));
ok(r.run.leftAtA === 0, '...leaving none of them behind', JSON.stringify(r.run));
ok(r.run.laps >= 1, '...and comes back for more', JSON.stringify(r.run));
ok(r.run.stillFerrying, 'the route never ends on its own -- it runs until you give the transport something else to do', JSON.stringify(r.run));
ok(r.secondWave === 4, '...so a second group turning up later is moved too, with no new order', String(r.secondWave));

ok(r.busyNotHijacked, 'a unit with a job of its own is NOT picked up -- a shuttle that eats your economy is worse than no shuttle');
ok(r.enemyNotLoaded, 'and neither is an enemy standing on the pad');
ok(r.notATransport === 'idle', 'something that cannot carry anything drops the order instead of looping forever', String(r.notATransport));

ok(r.snap.type === 'ferry' && r.snap.leg === 'b' && r.snap.since === 12, 'a snapshot carries the whole route, including which leg it is on', JSON.stringify(r.snap));
ok(r.snap.bx > 0, '...and the far end');

// ONE PORTRAIT IS ONE PASSENGER. The HUD draws a hotspot per cargo unit and sends the click to G.unloadCargo, which
// sent everything that was not a BUILDING to unloadAll: clicking the second marine's portrait in a full Dropship put
// all four on the ground, wherever the ship happened to be. Measured before the fix: bunker 4 -> 3 (right), dropship
// 4 -> 1 (wrong). test/abilities20.js drives the same call on an Overlord carrying exactly ONE zergling, where
// unload-all and unload-one cannot be told apart.
const one = vm.runInContext(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });
  G.players[1].ai = null;
  const p = G.players[0], x = p.startX + 8 * TILE, y = p.startY + 8 * TILE;
  const ship = G.spawnUnit('dropship', 0, x, y);
  const ms = []; for (let k = 0; k < 4; k++) ms.push(G.spawnUnit('marine', 0, x + k * 24, y + 24));
  for (const m of ms) G.loadUnit(ship, m);
  const loaded = ship.cargo.length, picked = ship.cargo[1];
  G.unloadCargo(ship, picked);
  for (let i = 0; i < 30; i++) G.tick();
  const bunk = G.placeBuilding(DATA.buildings.bunker, Math.floor(x / TILE) + 6, Math.floor(y / TILE) + 6, 0);
  bunk.done = true; bunk.progress = bunk.def.time; bunk.hp = bunk.maxHp;
  const bs = []; for (let k = 0; k < 4; k++) bs.push(G.spawnUnit('marine', 0, bunk.x + k * 20, bunk.y + 30));
  for (const m of bs) G.loadUnit(bunk, m);
  const bLoaded = bunk.cargo.length;
  G.unloadCargo(bunk, bunk.cargo[1]);
  for (let i = 0; i < 30; i++) G.tick();
  return JSON.stringify({ loaded, left: ship.cargo.length, out: !picked.inside && picked.alive, stillIn: ship.cargo.includes(picked), bLoaded, bLeft: bunk.cargo.length });
})()`, ctx);
{ const u = JSON.parse(one);
  ok(u.loaded === 4 && u.bLoaded === 4, 'a dropship and a bunker each hold four marines', one);
  ok(u.left === 3 && !u.stillIn && u.out, 'CLICKING ONE PASSENGER UNLOADS THAT ONE -- the other three stay aboard (all four used to be dumped)', one);
  ok(u.bLeft === 3, '...and a bunker is unchanged: it always unloaded one, and still does', one); }

summary({ word: 'FAILURES' });
