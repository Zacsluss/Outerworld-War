// Building auras (M11 wave two, item 11). The data contract is documented at length in js/data.js above
// the Terran block; this is the reader tested against it clause by clause, because the two were written
// separately and a contract nobody checks is a comment.
//   node test/auras.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'], ext: false });
const r = vm.runInContext(`(() => {
  const out = {};
  out.auraDefs = Object.keys(DATA.buildings).filter(id => DATA.buildings[id].aura);
  const mend = out.auraDefs.filter(id => DATA.buildings[id].aura.kind === 'mend');
  const blind = out.auraDefs.filter(id => DATA.buildings[id].aura.kind === 'blind');
  out.counts = { mend: mend.length, blind: blind.length };
  const run = n => { for (let i = 0; i < n; i++) G.tick(); };
  // Terran on both sides on purpose. A Zerg unit regenerates on its own (0.025 hp a frame), so an
  // enemy zergling standing in a friendly field heals whether or not the aura touched it, and the
  // check would pass for the wrong reason -- or fail for one.
  const setup = () => { G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 6 }); return G.players[0]; };

  // MEND: a hurt friendly unit inside the radius heals; one outside does not; a building never does
  let p = setup();
  const h = G.spawnUnit('aid_station', 0, p.startX + 200, p.startY + 200); h.done = true;
  const inside = G.spawnUnit('marine', 0, h.x + 40, h.y);
  const outside = G.spawnUnit('marine', 0, h.x + 700, h.y);
  // done AND progress complete: an unfinished building heals itself toward maxHp as it builds, which
  // is not the aura and would be mistaken for it.
  const bld = G.spawnUnit('supply_depot', 0, h.x + 60, h.y + 60); bld.done = true; bld.progress = bld.def.time;
  // 400 of 500, not 100: a Terran building below a third health BURNS, and a burning building loses
  // hp on its own -- which reads as 'the aura did not heal it' for entirely the wrong reason.
  inside.hp = 10; outside.hp = 10; bld.hp = 400;
  run(48);
  out.mend = { inside: inside.hp > 10, outside: outside.hp === 10, building: bld.hp === 400 };
  // ...and never past the ceiling, nor onto the dead
  inside.hp = inside.maxHp; run(48); out.noOverheal = inside.hp === inside.maxHp;

  // MEND is friendly-only. In a FRESH game with nothing else alive on our side: an enemy planted next
  // to a hospital surrounded by our own marines simply gets shot, and a dead unit is not evidence.
  p = setup();
  const h3 = G.spawnUnit('aid_station', 0, p.startX + 200, p.startY + 200); h3.done = true;
  for (const u of G.units.slice()) if (u.owner === 0 && !u.isBuilding) G.kill(u, null, true);
  const foe = G.spawnUnit('marine', 1, h3.x + 40, h3.y + 20); foe.hp = 10; run(48);
  out.enemyNotMended = foe.alive && foe.hp === 10;

  // BLIND: an enemy inside a jammer has its sight cut, and its detection suppressed
  p = setup();
  const j = G.spawnUnit('scrambler_mast', 0, p.startX + 200, p.startY + 200); j.done = true;
  const vic = G.spawnUnit('science_vessel', 1, j.x + 40, j.y);   // a detector, to test the detect clause
  const far = G.spawnUnit('science_vessel', 1, j.x + 900, j.y);
  const baseSight = far.sight, baseDet = far.isDetector;
  run(16);
  out.blind = { inside: vic.sight, outside: far.sight, base: baseSight,
                detWas: baseDet, detNow: vic.isDetector, farDet: far.isDetector };
  // walking out of the field restores it -- the pass must clear, not accumulate
  vic.x = j.x + 900; run(16);
  out.blindClears = vic.sight === baseSight;
  // a friendly unit is never blinded by its own tower
  const mine = G.spawnUnit('marine', 0, j.x + 40, j.y + 20); run(16);
  // NOT shortened, rather than exactly the def value. Written as an equality it also failed the day
  // high ground began granting +15% sight (M11 vertical layers) and this marine happened to stand on
  // a plateau -- a legitimate bonus reported as a jammer blinding its own side.
  out.ownSideNotBlinded = mine.sight >= DATA.units.marine.sight;
  out.ownSide = { sight: mine.sight, def: DATA.units.marine.sight, aura: mine.auraSight || 0 };

  // an unfinished, lifted or unpowered building projects nothing
  p = setup();
  const h2 = G.spawnUnit('aid_station', 0, p.startX + 200, p.startY + 200); h2.done = false;
  const pat = G.spawnUnit('marine', 0, h2.x + 40, h2.y); pat.hp = 10; run(48);
  out.unfinishedProjectsNothing = pat.hp === 10;
  // walls carry no aura and are flagged instead
  out.walls = Object.keys(DATA.buildings).filter(id => DATA.buildings[id].wall);
  out.wallsHaveNoAura = out.walls.every(id => !DATA.buildings[id].aura);
  return out;
})()`, ctx);
ok(r.auraDefs.length === 6 && r.counts.mend === 3 && r.counts.blind === 3, 'six aura buildings: three mend, three blind', JSON.stringify(r.counts));
ok(r.mend.inside, 'a hurt friendly unit inside a field hospital heals');
ok(r.mend.outside, '...and one outside the radius does not');
ok(r.mend.building, 'mend never repairs buildings, per the contract');
ok(r.noOverheal, 'mend never exceeds maxHp');
ok(r.enemyNotMended, 'an enemy standing in a friendly field gets nothing');
ok(r.blind.inside < r.blind.base && r.blind.inside >= 1, 'a jammer shortens enemy sight, clamped at one tile', JSON.stringify(r.blind));
ok(r.blind.outside === r.blind.base, '...and leaves anyone outside alone');
ok(r.blind.detWas === true && r.blind.detNow === false && r.blind.farDet === true, 'a detector inside a jammer stops detecting', JSON.stringify(r.blind));
ok(r.blindClears, 'walking out of the field restores sight -- the pass clears rather than accumulates');
ok(r.ownSideNotBlinded && !(r.ownSide.aura > 0 && r.ownSide.aura < 1), 'a jammer never blinds its own side', JSON.stringify(r.ownSide));
ok(r.unfinishedProjectsNothing, 'an unfinished building projects nothing');
ok(r.walls.length === 3 && r.wallsHaveNoAura, 'the three walls carry no aura and are flagged wall: true', r.walls.join(' '));
summary();
