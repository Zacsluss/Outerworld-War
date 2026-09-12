// Craters, wreckage and stripped ground -- M11 wave one, idea 9 (terrain destruction) and idea 1
// (the attrition economy). Both are the same system: see the CRATERS block in js/map.js.
//
// The properties worth testing are not "a crater appears". They are the ones that would desync a
// replay or brick a map, and each of these is a bug that was possible before it was written down:
//   * scar is a Uint8Array, so an unclamped add WRAPS -- a heavily shelled tile comes back pristine.
//   * a hulk that forms on ground it does not own hands that ground back when it decays.
//   * height is the one grid no snapshot carries, so a restored hulk must repaint it or vision differs.
//   * wreckage that never decays walls the map off by minute forty at a 500 supply cap.
//   node test/craters.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot'], ext: false });

const SRC = `(() => {
  const out = {};
  const init = () => G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 11, layout: 'temple' });
  init();
  const m = G.map, TL = TILE;

  // ---- the grid itself ----
  out.startsClean = m.scar.every(v => v === 0);
  const cx = (G.players[0].startX + 20 * TL), cy = (G.players[0].startY + 20 * TL);
  m.crater(cx, cy, 2, 100);
  const ti = m.idx(Math.floor(cx / TL), Math.floor(cy / TL));
  out.centreDeepest = m.scar[ti];
  out.edgeShallower = m.scar[m.idx(Math.floor(cx / TL) + 1, Math.floor(cy / TL))];
  out.outsideUntouched = m.scar[m.idx(Math.floor(cx / TL) + 4, Math.floor(cy / TL))];
  for (let i = 0; i < 8; i++) m.crater(cx, cy, 2, 200);
  out.clamped = m.scar[ti];
  out.scarAtNorm = m.scarAt(cx, cy);
  out.scarAtOffMap = m.scarAt(-500, -500);

  // ---- churned ground costs a ground unit speed, and costs a flyer nothing ----
  init();
  const gx = G.players[0].startX + 12 * TL, gy = G.players[0].startY + 12 * TL;
  const marine = G.spawnUnit('marine', 0, gx, gy), wraith = G.spawnUnit('wraith', 0, gx, gy);
  const cleanGround = marine.speed, cleanAir = wraith.speed;
  G.map.crater(marine.x, marine.y, 3, 255);
  out.speed = { groundBefore: cleanGround, groundAfter: marine.speed, airBefore: cleanAir, airAfter: wraith.speed };

  // ---- a razed building leaves a hulk that blocks pathing and lifts height ----
  init();
  const b = G.placeBuilding(DATA.buildings.factory, 30, 30, 0); G.completeBuilding(b);
  const bi = G.map.idx(31, 31);
  const beforeH = G.map.height[bi];
  G.kill(b, null);
  out.hulk = {
    n: G.map.wrecks.length,
    walk: G.map.walk[bi], blocked: G.map.blocked[bi], height: G.map.height[bi], beforeH,
    covers: G.map.wrecks[0] ? G.map.wrecks[0].tiles.length : 0,
    cratered: G.map.scar[bi] > 0,
  };
  const snapWalk = Array.from(G.map.walk);
  G.frame += WRECK_LIFE_BUILDING; G.map.tickWrecks(G.frame);
  out.decay = {
    left: G.map.wrecks.length,
    walkBack: G.map.walk[bi] === 1, heightBack: G.map.height[bi] === beforeH, blockedBack: G.map.blocked[bi] === -1,
    changedTiles: G.map.walk.reduce((n, v, i) => n + (v !== snapWalk[i] ? 1 : 0), 0),
    craterStayed: G.map.scar[bi] > 0,
  };

  // ---- a hulk never forms on ground it does not own ----
  init();
  const patch = G.map.resources.find(r => r.type === 'mineral');
  const pi = G.map.idx(patch.x, patch.y), wasBlocked = G.map.blocked[pi];
  const w1 = G.map.addWreck(patch.cx, patch.cy, 1, 1, 100, 0, false);
  out.refusesResource = { made: !!w1, blockedUnchanged: G.map.blocked[pi] === wasBlocked };

  // ---- what leaves nothing behind ----
  init();
  const before = G.map.wrecks.length;
  const wr = G.spawnUnit('wraith', 0, G.players[0].startX + 8 * TL, G.players[0].startY + 8 * TL);
  G.kill(wr, null);
  const afterFly = G.map.wrecks.length;
  const mar = G.spawnUnit('marine', 0, G.players[0].startX + 9 * TL, G.players[0].startY + 9 * TL);
  G.kill(mar, null);
  const afterSmall = G.map.wrecks.length;
  const tank = G.spawnUnit('siege_tank', 0, G.players[0].startX + 10 * TL, G.players[0].startY + 10 * TL);
  tank.halluc = true; G.kill(tank, null);
  const afterHalluc = G.map.wrecks.length;
  const tank2 = G.spawnUnit('siege_tank', 0, G.players[0].startX + 11 * TL, G.players[0].startY + 11 * TL);
  G.kill(tank2, null);
  out.leaves = { before, afterFly, afterSmall, afterHalluc, afterLarge: G.map.wrecks.length };

  // ---- the attrition economy: working a patch strips the ground around it ----
  init();
  const p0 = G.players[0];
  const res = G.map.resources.filter(r => r.type === 'mineral')
    .sort((a, b2) => Math.hypot(a.cx - p0.startX, a.cy - p0.startY) - Math.hypot(b2.cx - p0.startX, b2.cy - p0.startY))[0];
  const ri = G.map.idx(Math.floor(res.cx / TL), Math.floor(res.cy / TL));
  out.mining = { startRecorded: res.start === res.amount, groundCleanAtStart: G.map.scar[ri] === 0 };
  for (const u of G.units) if (u.alive && u.owner === 0 && u.def.worker) u.applyOrder({ type: 'gather', target: res, phase: 'goto' });
  for (let i = 0; i < 3000; i++) G.tick();
  out.mining.mined = res.start - res.amount;
  out.mining.groundStripped = G.map.scar[ri];

  // ---- a snapshot carries both, and puts height back ----
  init();
  const b2 = G.placeBuilding(DATA.buildings.barracks, 34, 34, 0); G.completeBuilding(b2);
  G.kill(b2, null);
  G.map.crater(G.players[0].startX, G.players[0].startY, 3, 90);
  const si = G.map.idx(35, 35);
  const live = { scar: Array.from(G.map.scar), walk: Array.from(G.map.walk), wrecks: G.map.wrecks.length, hAtHulk: G.map.height[si] };
  const snap = Snapshot.take();
  G.map.scar.fill(0); G.map.height.fill(0); G.map.wrecks = []; G.map.walk.fill(1);
  Snapshot.restore(snap);
  out.snap = {
    scarSame: G.map.scar.every((v, i) => v === live.scar[i]),
    wrecksSame: G.map.wrecks.length === live.wrecks,
    heightRepainted: G.map.height[si] === live.hAtHulk && live.hAtHulk > 0,
    walkSame: G.map.walk.every((v, i) => v === live.walk[i]),
    sparse: (snap.scar.length / 2) < G.map.scar.length,
    pairsEven: snap.scar.length % 2 === 0,
  };
  return out;
})()`;
const r = vm.runInContext(SRC, ctx);

ok(r.startsClean, 'a fresh map has no scarring on it');
ok(r.centreDeepest > r.edgeShallower && r.edgeShallower > 0, 'a crater is a bowl: deepest at the centre, falling off to the rim', JSON.stringify([r.centreDeepest, r.edgeShallower]));
ok(r.outsideUntouched === 0, 'and it stops at its radius');
ok(r.clamped === 255, 'repeated blasts SATURATE rather than wrapping a Uint8Array back to nothing', 'got ' + r.clamped);
ok(r.scarAtNorm === 1, 'scarAt normalises to 0..1', String(r.scarAtNorm));
ok(r.scarAtOffMap === 0, 'and reads 0 off the map rather than throwing');

ok(r.speed.groundAfter < r.speed.groundBefore, 'churned ground slows a ground unit', JSON.stringify(r.speed));
ok(Math.abs(r.speed.groundAfter - r.speed.groundBefore * 0.75) < 1e-9, '...by exactly CHURN_SLOW at full churn', JSON.stringify(r.speed));
ok(r.speed.airAfter === r.speed.airBefore, 'and does not slow anything flying over it', JSON.stringify(r.speed));

ok(r.hulk.n === 1 && r.hulk.covers === 12, 'a razed 4x3 factory leaves one hulk covering its whole footprint', JSON.stringify(r.hulk));
ok(r.hulk.walk === 0 && r.hulk.blocked === -5, 'the hulk blocks pathing', JSON.stringify(r.hulk));
ok(r.hulk.height === 2, 'and stands at height 2, the only lever this engine has that moves vision', JSON.stringify(r.hulk));
ok(r.hulk.cratered, 'and the building left a crater under itself');

ok(r.decay.left === 0, 'a hulk decays after WRECK_LIFE_BUILDING -- permanent wreckage bricks the map shut');
ok(r.decay.walkBack && r.decay.heightBack && r.decay.blockedBack, 'and gives its tiles back exactly as it found them', JSON.stringify(r.decay));
ok(r.decay.changedTiles === 12, 'exactly the twelve tiles it stood on, and no others', String(r.decay.changedTiles));
ok(r.decay.craterStayed, 'but the crater stays: the hulk is the tactical half, the crater is the memory');

ok(!r.refusesResource.made && r.refusesResource.blockedUnchanged, 'a hulk refuses to form on a mineral line -- it must never hand back ground it did not own', JSON.stringify(r.refusesResource));

ok(r.leaves.afterFly === r.leaves.before, 'a dead flyer leaves nothing on the ground', JSON.stringify(r.leaves));
ok(r.leaves.afterSmall === r.leaves.before, 'nor does a marine', JSON.stringify(r.leaves));
ok(r.leaves.afterHalluc === r.leaves.before, 'nor a hallucination -- there was never anything there', JSON.stringify(r.leaves));
ok(r.leaves.afterLarge === r.leaves.before + 1, 'a dead siege tank does', JSON.stringify(r.leaves));

ok(r.mining.startRecorded, 'a patch records what it started with, so the renderer can drain it');
ok(r.mining.groundCleanAtStart, 'and the ground under it starts clean');
ok(r.mining.mined > 0, 'workers mine it', JSON.stringify(r.mining));
ok(r.mining.groundStripped > 0, '...and strip the ground around it as they go -- the attrition economy', JSON.stringify(r.mining));

ok(r.snap.scarSame, 'a snapshot carries the scarring');
ok(r.snap.wrecksSame, '...and the hulks');
ok(r.snap.heightRepainted, '...and repaints height, which no snapshot carries -- without this a restored hulk is invisible to vision', JSON.stringify(r.snap));
ok(r.snap.walkSame, '...and walk agrees with it afterwards');
ok(r.snap.sparse && r.snap.pairsEven, 'scarring travels as sparse pairs, not a fourth dense 16k grid per checkpoint', JSON.stringify(r.snap));

summary({ word: 'FAILURES' });
