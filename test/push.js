// Unit collision push. M12 wave three, item 14.
//
// G.separate has always pushed overlapping units apart SYMMETRICALLY: both yield half. That is right
// between enemies and wrong within an army, because a unit walking into its own standing crowd stops
// dead against it and the two shove each other in place instead of one flowing past the other.
//
// So a moving unit now gets right of way over a stationary one OF THE SAME OWNER: the mover yields a
// quarter, the stander yields the rest. The weights still sum to 2, so total separation strength is
// unchanged and the settling distances the long comment in G.separate measures still hold.
//
// SAME OWNER ONLY is the safety property and is most of what this file checks. Cross-owner push is how
// a blocked ramp stops blocking and how a wall of units stops being a wall; enemies keep the old
// symmetric rule exactly.
//   node test/push.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const mk = () => {
  const c = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot'], ext: false });
  return c;
};
const ctx = mk();

const r = vm.runInContext(`(() => {
  const out = {};
  const start = () => G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 9, layout: 'temple' });

  // ---- a mover displaces a stationary ally more than itself ----
  start();
  const p = G.players[0];
  const ax = p.startX + 300, ay = p.startY + 300;
  const stand = G.spawnUnit('marine', 0, ax, ay);
  stand.applyOrder({ type: 'hold' });
  const move = G.spawnUnit('marine', 0, ax + 8, ay);
  move.moving = true; stand.moving = false;
  const s0 = { x: stand.x, y: stand.y }, m0 = { x: move.x, y: move.y };
  G.rebuildGrid(); G.separate();
  out.asym = {
    stander: +Math.hypot(stand.x - s0.x, stand.y - s0.y).toFixed(3),
    mover: +Math.hypot(move.x - m0.x, move.y - m0.y).toFixed(3),
  };

  // ---- an ENEMY pair is still symmetric ----
  start();
  const p2 = G.players[0];
  const bx = p2.startX + 300, by = p2.startY + 300;
  const mine = G.spawnUnit('marine', 0, bx, by); mine.applyOrder({ type: 'hold' }); mine.moving = false;
  const foe = G.spawnUnit('marine', 1, bx + 8, by); foe.moving = true;
  const q0 = { x: mine.x, y: mine.y }, f0 = { x: foe.x, y: foe.y };
  G.rebuildGrid(); G.separate();
  out.sym = {
    mine: +Math.hypot(mine.x - q0.x, mine.y - q0.y).toFixed(3),
    foe: +Math.hypot(foe.x - f0.x, foe.y - f0.y).toFixed(3),
  };

  // ---- exempt: buildings, larvae, burrowed ----
  start();
  const p3 = G.players[0];
  const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  const bump = G.spawnUnit('marine', 0, cc.x, cc.y); bump.moving = true;
  const c0 = { x: cc.x, y: cc.y };
  G.rebuildGrid(); G.separate();
  out.buildingStill = cc.x === c0.x && cc.y === c0.y;

  const lurk = G.spawnUnit('lurker', 0, p3.startX + 400, p3.startY + 400);
  lurk.burrowed = true; lurk.moving = false;
  const l0 = { x: lurk.x, y: lurk.y };
  const shove = G.spawnUnit('marine', 0, lurk.x + 4, lurk.y); shove.moving = true;
  G.rebuildGrid(); G.separate();
  out.burrowedStill = lurk.x === l0.x && lurk.y === l0.y;

  // ---- and it actually helps a column cross its own army ----
  start();
  const p4 = G.players[0];
  const blob = []; for (let i = 0; i < 24; i++) blob.push(G.spawnUnit('marine', 0, p4.startX + 240 + (i % 6) * 13, p4.startY + 200 + Math.floor(i / 6) * 13));
  for (const m of blob) m.applyOrder({ type: 'hold' });
  const col = []; for (let i = 0; i < 12; i++) col.push(G.spawnUnit('marine', 0, p4.startX + 120 + (i % 3) * 13, p4.startY + 215 + Math.floor(i / 3) * 13));
  const gx = p4.startX + 420, gy = p4.startY + 230;
  for (const m of col) m.applyOrder({ type: 'move', x: gx, y: gy });
  let at = -1;
  for (let i = 0; i < 900; i++) { G.tick(); if (at < 0 && col.filter(m => m.x > p4.startX + 330).length >= 10) at = i; }
  out.column = { tenThroughAt: at, allThrough: col.filter(m => m.x > p4.startX + 330).length };

  // ---- determinism: two identical runs agree ----
  const runHash = () => {
    G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 21, layout: 'temple' });
    for (let i = 0; i < 2400; i++) G.tick();
    return G.stateHash();
  };
  out.det = runHash() === runHash();
  return out;
})()`, ctx);

ok(r.asym.stander > r.asym.mover * 3, 'a moving unit displaces its stationary ally far more than itself', JSON.stringify(r.asym));
ok(r.asym.mover > 0, '...but the mover still yields something, so two movers never interpenetrate', JSON.stringify(r.asym));
ok(Math.abs(r.sym.mine - r.sym.foe) < 0.01 && r.sym.mine > 0, 'an ENEMY pair is still pushed symmetrically -- a wall of units stays a wall', JSON.stringify(r.sym));

ok(r.buildingStill, 'a building is never pushed');
ok(r.burrowedStill, 'nor is a burrowed unit');

ok(r.column.tenThroughAt > 0 && r.column.allThrough === 12, 'a column of twelve gets through a dense friendly blob', JSON.stringify(r.column));
ok(r.det, 'and the simulation is still deterministic across two identical runs');

summary({ word: 'FAILURES' });
