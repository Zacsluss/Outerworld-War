// FIXLIST-M14 C3 (item 5) -- the Queen plants creep tumours, and the Overlord still does.
//
// The report was "how are creep tumours made? from our queen unit? this is how it should be." It is
// right that it should be -- in StarCraft II the Queen's kit is Spawn Larva, Transfuse and Creep
// Tumour -- but it was wrong about where they came from. They came from the OVERLORD, which has had
// `plant_tumour` since M12. The Queen's list was larva_inject, parasite, ensnare, spawn_broodling,
// infest: no tumour at all.
//
// The user's decision was TWO SOURCES ON PURPOSE, so the Overlord keeps it and nothing is taken away.
// That makes the bound the regression risk, and it is the reason this file exists: test/zerg12.js
// asserts tumours stay at eight or fewer per game, and a second source with a budget of its own is
// exactly how that gets broken.
//
//   node test/tumour.js
const fs = require('fs'), vm = require('vm'), path = require('path'), { makeCtx, makeOk, summary } = require('./_harness'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud'], ext: false, errors, collect: 'join' });
const ok = makeOk({ extra: 'nonempty' });
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

// =============================================================================
// 1. the tables: two sources, and the ordering the def comment insists on
// =============================================================================
const Q = J('DATA.units.queen.abil'), O = J('DATA.units.overlord.abil');
ok(Q.includes('plant_tumour'), 'THE QUEEN HAS IT -- the reported item', Q.join(','));
ok(O.includes('plant_tumour'), 'AND THE OVERLORD STILL DOES -- two sources on purpose, nothing taken away', O.join(','));
ok(Q[0] === 'larva_inject', 'larva_inject is still FIRST, which the def comment says is the whole of that decision', Q.join(','));
ok(Q[1] === 'plant_tumour', 'and the tumour is second, beside the other macro ability', Q.join(','));
ok(Q[Q.length - 1] === 'infest', 'infest is still last', Q.join(','));
ok(J("DATA.abilities.plant_tumour.hk") === 'C', 'it is on key C, as StarCraft II puts it', J("DATA.abilities.plant_tumour.hk"));
// EVERY LOOKUP IN THIS BLOCK IS GUARDED WITH `|| 0`, and that is load-bearing rather than tidy:
// JSON.stringify(undefined) returns the STRING "undefined", which JSON.parse throws on, so reading a
// key the negative control has just deleted crashes this file and hides every other result in it.
// HANDOFF-M15 trap 8, hit again while writing this very block.
// FIXLIST-M15 C1 (item 2) REVERSED THE LINE THAT USED TO STAND HERE. It asserted `energy === undefined`
// and its reason was 'the Overlord that shares it has none'. C1 gave the Overlord a pool, so the reason
// is gone and SC2's own 25 applies to both casters. Measured before the change: ONE Overlord with money
// in the bank planted THIRTY tumours back to back, thirty of thirty attempts. After: two, then refused.
ok(J('DATA.abilities.plant_tumour.energy || 0') === 25,
  'IT COSTS 25 ENERGY -- SC2\'s price, charged to the caster', String(J('DATA.abilities.plant_tumour.energy || 0')));
ok(J('DATA.abilities.spawn_tumour.energy === undefined') === true,
  '...and spawn_tumour still costs NONE, because the thing that casts it is a tumour and a tumour has no pool');
ok(J('DATA.units.overlord.energy || 0') === 200,
  'THE OVERLORD IS AN ENERGY UNIT NOW: a 200 pool, which it did not have at all', String(J('DATA.units.overlord.energy || 0')));
ok(J('DATA.units.overlord.energy || 0') === J('DATA.units.queen.energy || 0'),
  '...the same size as the Queen\'s, which is what the request asked for');
ok(J('DATA.buildings.creep_tumour.min') === 25, '...and the tumour itself costs 25 minerals, which is the price', String(J('DATA.buildings.creep_tumour.min')));
ok(J('DATA.units.queen.abil').length === 6, 'the Queen now offers six abilities', String(Q.length));

// The card has to actually SHOW all six. Four was the 3x3 card's ceiling and the Queen is what found it.
const card = J(`(() => {
  UI.start({ players: [{ race: 'Z', human: true, name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 4, layout: 'temple' });
  UI.menu = null; Render.init(document.getElementById('game'));
  Render.W = 1600; Render.H = 900; Render.viewW = 1600; Render.viewH = 760;
  const p = G.players[0];
  for (const t of ['ensnare_tech', 'spawn_broodling_tech']) p.tech.add(t);
  const st = G.map.starts[0];
  const q = G.spawnUnit('queen', 0, st.cx + 120, st.cy + 120);
  q.energy = 200;
  UI.selection = [q]; UI.cardPage = 0;
  const labels = UI.currentCard().map(b => b.label);
  const slots = UI.currentCard().map(b => b.slot);
  return { labels, slots, maxSlot: Math.max(...slots), overflowed: labels.some(l => /^More/.test(l)) };
})()`);
ok(card.labels.includes('Creep Tumour'), 'a fully-researched Queen SHOWS Creep Tumour on her card', card.labels.join(', '));
for (const want of ['Spawn Larva', 'Parasite', 'Ensnare', 'Spawn Broodlings', 'Infest Command Center'])
  ok(card.labels.includes(want), '...and still shows ' + want + ' -- nothing was pushed off the end', card.labels.join(', '));
ok(card.maxSlot < 12 && !card.overflowed, 'all six fit on one page of the 4x3 card', JSON.stringify([card.maxSlot, card.overflowed]));

// =============================================================================
// 2. it works, from both, and the chain is unchanged
// =============================================================================
const plant = J(`(() => {
  G.init({ players: [{ race: 'Z', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (let f = 0; f < 200; f++) G.tick();
  const p = G.players[0], hall = G.units.find(u => u.owner === 0 && u.def.depot);
  p.minerals = 5000; p.gas = 5000;
  const out = {};
  // somewhere on our own creep, a couple of tiles from the hall
  const spot = () => {
    const m = G.map;
    for (let r = 3; r < 9; r++) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      const tx = Math.floor(hall.x / TILE + Math.cos(a) * r), ty = Math.floor(hall.y / TILE + Math.sin(a) * r);
      if (!m.canPlace(DATA.buildings.creep_tumour, tx, ty, p, G.units, null)) return [(tx + .5) * TILE, (ty + .5) * TILE];
    }
    return null;
  };
  const byQueen = () => {
    const s = spot(); if (!s) return 'no spot';
    const q = G.spawnUnit('queen', 0, s[0], s[1]); q.energy = 200;
    const before = G.units.filter(u => u.alive && u.def.tumour).length;
    Abilities.issue(q, 'plant_tumour', null, s[0], s[1]);
    for (let f = 0; f < 40; f++) G.tick();
    return G.units.filter(u => u.alive && u.def.tumour).length - before;
  };
  const byOverlord = () => {
    const s = spot(); if (!s) return 'no spot';
    const o = G.spawnUnit('overlord', 0, s[0], s[1]);
    const before = G.units.filter(u => u.alive && u.def.tumour).length;
    Abilities.issue(o, 'plant_tumour', null, s[0], s[1]);
    for (let f = 0; f < 40; f++) G.tick();
    return G.units.filter(u => u.alive && u.def.tumour).length - before;
  };
  out.queen = byQueen();
  out.overlord = byOverlord();
  // the chain: a finished tumour seeds exactly ONE child, which is unchanged
  for (let f = 0; f < DATA.buildings.creep_tumour.time + 60; f++) G.tick();
  const t = G.units.find(u => u.alive && u.def.tumour && u.done);
  if (t) {
    const s2 = spot();
    const n0 = G.units.filter(u => u.alive && u.def.tumour).length;
    if (s2) Abilities.issue(t, 'spawn_tumour', null, s2[0], s2[1]);
    for (let f = 0; f < 20; f++) G.tick();
    out.childOnce = G.units.filter(u => u.alive && u.def.tumour).length - n0;
    out.tumouredFlag = !!t.tumoured;
    const s3 = spot();
    if (s3) Abilities.issue(t, 'spawn_tumour', null, s3[0], s3[1]);
    for (let f = 0; f < 20; f++) G.tick();
    out.childTwice = G.units.filter(u => u.alive && u.def.tumour).length - n0;
  }
  return out;
})()`);
ok(plant.queen === 1, 'A QUEEN PLANTS ONE', JSON.stringify(plant.queen));
ok(plant.overlord === 1, 'AN OVERLORD STILL PLANTS ONE', JSON.stringify(plant.overlord));
ok(plant.childOnce === 1 && plant.tumouredFlag, 'a finished tumour still seeds exactly one child', JSON.stringify(plant));
ok(plant.childTwice === 1, '...and cannot be asked for a second -- the chain rule is untouched', JSON.stringify(plant.childTwice));

// =============================================================================
// 3. THE BOUND, with two sources -- the stated regression risk
// =============================================================================
// test/zerg12.js asserts <= 8 tumours per game on its seeds. The risk a second source creates is a
// second BUDGET, so the check that matters is that both sources answer to one. Played out for real,
// with the AI driving, on seeds the zerg12 bound does not use.
const bound = J(`(() => {
  const out = { seeds: [], queensSeen: 0, overlordsSeen: 0 };
  for (const seed of [2, 6, 13]) {
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'hard', name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed, layout: 'temple' });
    G.checkVictory = () => { };
    let peak = 0;
    for (let f = 0; f < 24 * 60 * 18; f++) {
      G.tick();
      if (f % 240 === 0) {
        peak = Math.max(peak, G.units.filter(u => u.alive && u.owner === 0 && u.def.tumour).length);
        // COUNTED WHILE THE GAME RUNS, not at the end (SCAN-M18). These two are non-vacuity checks -- "the AI really
        // was playing Zerg" -- and they used to read the final frame only. Measured: on these three seeds the hard
        // Terran wipes the hard Zerg out on two of them even before any of this milestone's fixes, so the check hung
        // entirely on seed 6 leaving seventeen units alive, and any change anywhere in the simulation that shifted
        // that one game by a hair flipped the whole suite red. What the sentence means is that Overlords and Queens
        // existed during the game, which is what this now measures.
        out.overlordsSeen += G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'overlord').length;
        out.queensSeen += G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'queen').length;
      }
    }
    peak = Math.max(peak, G.units.filter(u => u.alive && u.owner === 0 && u.def.tumour).length);
    out.seeds.push({ seed, peak });
  }
  out.cap = 8;
  return out;
})()`);
ok(bound.seeds.every(s => s.peak <= bound.cap), 'THE BOUND HOLDS WITH TWO SOURCES: never more than ' + bound.cap + ' tumours, on three fresh seeds', JSON.stringify(bound.seeds));
ok(bound.seeds.some(s => s.peak > 0), '...and the check is not vacuous -- the AI really does plant them', JSON.stringify(bound.seeds));
ok(bound.overlordsSeen > 0, 'the AI has Overlords in those games', String(bound.overlordsSeen));
{ const src = fs.readFileSync(path.join(root, 'js', 'ai.js'), 'utf8');
  ok(/\(d === 'overlord' \|\| d === 'queen'\)/.test(src),
    'the AI plants from BOTH, in one branch, so there is one budget and not two');
  ok((src.match(/tumourBudget\(\)/g) || []).length >= 2 && !/queenTumourBudget|tumourBudget2/.test(src),
    'and there is exactly one budget function -- a second one is how the bound gets broken'); }

// =============================================================================
// 2b. FIXLIST-M15 C1 -- the pool is real, it is SPENT, and it refills off the ONE regen
// =============================================================================
// The negative control for the whole entry is `zeroEnergy`: an Overlord holding nothing must plant
// NOTHING. Delete `energy: 25` from the ability, or `energy: 200` from the Overlord, and that number
// becomes 1 and this file goes red without throwing. Everything else here would still pass with the
// cost removed, which is exactly why it is not the control.
const pool = J(`(() => {
  G.init({ players: [{ race: 'Z', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (let f = 0; f < 200; f++) G.tick();
  const p = G.players[0], hall = G.units.find(u => u.owner === 0 && u.def.depot);
  p.minerals = 100000; p.gas = 100000;
  const m = G.map;
  const spot = () => {
    for (let r = 2; r < 10; r++) for (let k = 0; k < 40; k++) {
      const a = k / 40 * Math.PI * 2;
      const tx = Math.floor(hall.x / TILE + Math.cos(a) * r), ty = Math.floor(hall.y / TILE + Math.sin(a) * r);
      if (!m.canPlace(DATA.buildings.creep_tumour, tx, ty, p, G.units, null)) return [(tx + .5) * TILE, (ty + .5) * TILE];
    }
    return null;
  };
  // plant from one caster as many times as it will let us, and count
  const run = (mk, setE) => {
    const s0 = spot(); if (!s0) return 'no spot';
    const u = mk(s0); if (setE !== null) u.energy = setE;
    let planted = 0;
    for (let i = 0; i < 12; i++) {
      const s = spot(); if (!s) break;
      u.x = s[0]; u.y = s[1]; u.order = { type: 'idle' }; u.queue = [];
      const before = G.units.filter(o => o.alive && o.def.tumour).length;
      Abilities.issue(u, 'plant_tumour', null, s[0], s[1]);
      for (let f = 0; f < 6; f++) G.tick();
      if (G.units.filter(o => o.alive && o.def.tumour).length > before) planted++;
    }
    return planted;
  };
  const out = {};
  const fresh = G.spawnUnit('overlord', 0, hall.x, hall.y);
  out.freshMax = fresh.maxEnergy; out.freshStart = fresh.energy;
  G.kill(fresh, null, true);
  out.zeroEnergy = run(s => G.spawnUnit('overlord', 0, s[0], s[1]), 0);
  out.fullOverlord = run(s => G.spawnUnit('overlord', 0, s[0], s[1]), 200);
  out.fullQueen = run(s => G.spawnUnit('queen', 0, s[0], s[1]), 200);
  // the regen: one line, shared. Measure the Overlord's against the Queen's over the same frames.
  const a = G.spawnUnit('overlord', 0, hall.x + 200, hall.y), b = G.spawnUnit('queen', 0, hall.x + 240, hall.y);
  a.energy = 0; b.energy = 0;
  for (let f = 0; f < 320; f++) G.tick();
  out.olRegen = a.energy; out.qRegen = b.energy;
  // and it does not overfill
  a.energy = a.maxEnergy - 0.01;
  for (let f = 0; f < 60; f++) G.tick();
  out.capped = a.energy <= a.maxEnergy;
  return out;
})()`);
ok(pool.freshMax === 200 && pool.freshStart === 50,
  'a NEW Overlord arrives with 50 of 200, the same start every caster in the game gets', JSON.stringify([pool.freshMax, pool.freshStart]));
ok(pool.zeroEnergy === 0,
  'NEGATIVE CONTROL: an Overlord with NO energy plants NOTHING in twelve tries -- before C1 it planted all twelve', String(pool.zeroEnergy));
ok(pool.fullOverlord === 8,
  '...and a FULL one plants exactly eight, which is 200 energy at 25 a tumour', String(pool.fullOverlord));
ok(pool.fullQueen === 8,
  '...and so does a full Queen -- one price, both casters', String(pool.fullQueen));
ok(pool.olRegen > 9 && Math.abs(pool.olRegen - pool.qRegen) < 1e-9,
  'THE OVERLORD REFILLS OFF THE QUEEN\'S REGEN, not a second one: identical energy after 320 frames', JSON.stringify([pool.olRegen, pool.qRegen]));
ok(pool.capped === true, '...and stops at the cap', String(pool.capped));
{ const src = fs.readFileSync(path.join(root, 'js', 'sim.js'), 'utf8');
  ok((src.match(/this\.maxEnergy && this\.energy < this\.maxEnergy/g) || []).length === 1,
    'there is exactly ONE energy-regen line in js/sim.js -- C1 was told to find it, not to write a second'); }
// =============================================================================
// 4. FIXLIST-M15 C2 -- tumour range is a LIMIT now, on BOTH paths, and only for these two
// =============================================================================
// The report was "creep tumors currently have unlimited range and they need to have their range
// limited or best where they can spawn additional tumors". Both halves were true and they were TWO
// SEPARATE FAULTS in two different functions, which is why the range printed in the data table was
// never the range you got:
//
//   Abilities.orderTick -- for a caster that can MOVE, `range` is a walk-to distance, not a limit.
//     Measured: an Overlord ordered to plant 17 tiles away, declared range 3, flew 13 tiles and
//     planted. A Queen, 16 tiles away, flew 12 and planted.
//   Abilities.issue    -- a point ability cast by a BUILDING resolves immediately in issue() and
//     never reaches orderTick or its range check at all. A creep tumour IS a building. Measured: a
//     finished tumour seeded a child 21.4 TILES away against a declared range of 9.
//
// FIXLIST-M15 C2 predicted the first and said the second already worked, reasoning that an immobile
// caster takes orderTick's refuse branch. It does not take that branch, because it never arrives at
// it. The half the player actually asked about was the unmeasured one.
const reach = J(`(() => {
  G.init({ players: [{ race: 'Z', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (let f = 0; f < 400; f++) G.tick();
  const p = G.players[0], m = G.map;
  const hall = G.units.find(u => u.owner === 0 && u.def.depot);
  p.minerals = 100000; p.gas = 100000;
  const tumours = () => G.units.filter(u => u.alive && u.def.tumour).length;
  const legalTiles = () => { const a = []; for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) if (!m.canPlace(DATA.buildings.creep_tumour, tx, ty, p, G.units, null)) a.push([tx, ty]); return a; };
  const said = () => { const l = p.msgs.slice(-1)[0]; return l ? l.text : ''; };
  const res = {};


  // -- a MOBILE caster and the walk budget (TODO-M18 item 3) ------------------------------------
  // FIXLIST-M15 C2 made an out-of-range tumour order a flat refusal, because an Overlord asked to plant
  // one 17 tiles away flew 13 and planted it against a declared range of 3. The user asked for the walk
  // back. So it walks -- bounded by CAST_APPROACH, READ FROM THE CONSTANT and never written as a literal
  // here -- and past the bound it still refuses, but says the WALK ran out rather than the range.
  {
    // A FRESH legal tile per run. The first run plants ON its spot, which makes that tile illegal for the
    // next one -- so re-deriving the list is all it takes, and without it the second caster is refused
    // for a reason that has nothing to do with the walk (measured: the Queen walked into range, found a
    // tumour already standing there and planted nothing).
    const pick = () => {
      const near = legalTiles().sort((a, b) => distPt(a[0], a[1], hall.x / TILE, hall.y / TILE) - distPt(b[0], b[1], hall.x / TILE, hall.y / TILE));
      const s = near[Math.floor(near.length / 2)];
      return [(s[0] + 0.5) * TILE, (s[1] + 0.5) * TILE];
    };
    const run = (kind, awayTiles, frames, fix) => {
      const sp = pick(), sx = sp[0], sy = sp[1];
      // To the RIGHT, into the middle of the map: the spot sits near the hall in the top-left corner, so
      // putting the caster to its left clamps against the map edge and the walk under test barely happens.
      const u = G.spawnUnit(kind, 0, Math.min((m.w - 4) * TILE, sx + awayTiles * TILE), sy); u.energy = 200;
      // The field, not canMove = false: canMove is a GETTER (js/sim.js, !isBuilding || lifted), so
      // assigning to it does nothing at all and the "immobile" caster walked and planted. This is the
      // same field the branch under test reads, alongside sieged. The case that matters in play is a
      // tumour seeding its own child, and that one is checked below through issue().
      if (fix) u.burrowed = true;
      const d0 = distPt(u.x, u.y, sx, sy) / TILE;
      const atSpot = () => G.units.filter(t => t.alive && t.def.tumour && distPt(t.x, t.y, sx, sy) < TILE * 1.5).length;
      const n0 = atSpot();
      p.msgs.length = 0; p.lastAlert = {};
      Abilities.issue(u, 'plant_tumour', null, sx, sy);
      let moved = 0, energyAtPlant = null;
      for (let f = 0; f < frames; f++) {
        const px = u.x, py = u.y; G.tick(); moved += distPt(px, py, u.x, u.y);
        // SAMPLED AT THE PLANT, because energy regenerates: read 2400 frames later it is back at the cap
        // and says nothing about whether the 25 was ever spent.
        if (energyAtPlant === null && atSpot() > n0) energyAtPlant = Math.round(u.energy);
      }
      // AT THE SPOT, not "how many tumours are on the map": over 2400 frames the tumours already standing
      // seed children of their own, and counting those would make this check pass for the wrong reason.
      const r = { orderedFromTiles: Math.round(d0), planted: atSpot() - n0, travelledTiles: Math.round(moved / TILE),
        energyAtPlant, energyLeft: Math.round(u.energy), endedTilesAway: Math.round(distPt(u.x, u.y, sx, sy) / TILE),
        // EVERY message of this run, not the last one: p.msgs was cleared above, and 600 frames of a live
        // game bury a refusal under ordinary alerts ("Production facilities are idle").
        said: p.msgs.map(msg => msg.text).join(' | ') };
      G.kill(u, null, true);
      return r;
    };
    const inside = Math.round(CAST_APPROACH * 0.55), outside = CAST_APPROACH + 20;
    res.overlord = run('overlord', inside, 2400);
    res.queen = run('queen', inside, 2400);
    res.overlordFar = run('overlord', outside, 600);
    res.queenFar = run('queen', outside, 600);
    res.immobile = run('queen', inside, 300, true);
    res.budget = CAST_APPROACH; res.range = DATA.abilities.plant_tumour.range;
  }

  // -- ...and IN range it still plants, which is the thing the limit must not break --------------
  {
    const near = legalTiles().sort((a, b) => distPt(a[0], a[1], hall.x / TILE, hall.y / TILE) - distPt(b[0], b[1], hall.x / TILE, hall.y / TILE));
    const spot = near[Math.floor(near.length / 2)];
    const sx = (spot[0] + 0.5) * TILE, sy = (spot[1] + 0.5) * TILE;
    const u = G.spawnUnit('overlord', 0, sx, sy); u.energy = 200;
    const n0 = tumours();
    Abilities.issue(u, 'plant_tumour', null, sx, sy);
    for (let f = 0; f < 30; f++) G.tick();
    res.inRange = tumours() - n0;
  }

  // -- a TUMOUR seeding its child, the reported half. It is a BUILDING and casts in issue(). -----
  {
    // grow the carpet: a tumour at the far edge of the hall's creep pushes creep outward, so there
    // is legal ground well past spawn_tumour's nine tiles to aim at.
    const far0 = legalTiles().sort((a, b) => distPt(b[0], b[1], hall.x / TILE, hall.y / TILE) - distPt(a[0], a[1], hall.x / TILE, hall.y / TILE))[0];
    const seed = G.placeBuilding(DATA.buildings.creep_tumour, far0[0], far0[1], 0);
    for (let f = 0; f < DATA.buildings.creep_tumour.time + 600; f++) G.tick();
    const best = legalTiles().sort((a, b) => distPt(b[0], b[1], seed.x / TILE, seed.y / TILE) - distPt(a[0], a[1], seed.x / TILE, seed.y / TILE))[0];
    const d = distPt(best[0] + 0.5, best[1] + 0.5, seed.x / TILE, seed.y / TILE);
    const n0 = tumours();
    p.msgs.length = 0; p.lastAlert = {};
    const ret = Abilities.issue(seed, 'spawn_tumour', null, (best[0] + 0.5) * TILE, (best[1] + 0.5) * TILE);
    for (let f = 0; f < 60; f++) G.tick();
    res.tumourFar = { done: !!seed.done, isBuilding: !!seed.isBuilding, tilesAway: Math.round(d * 10) / 10,
      issueReturned: ret, planted: tumours() - n0, spentItsOneChild: !!seed.tumoured, said: said() };
  }
  return res;
})()`);
ok(reach.overlord.planted === 1 && reach.overlord.travelledTiles > 5,
  'AN OVERLORD ORDERED OUT OF RANGE NOW WALKS INTO RANGE AND PLANTS (TODO-M18 item 3): ordered from ' + reach.overlord.orderedFromTiles + ' tiles, travelled ' + reach.overlord.travelledTiles + ' -- it used to refuse outright', JSON.stringify(reach.overlord));
ok(reach.queen.planted === 1 && reach.queen.travelledTiles > 5,
  '...and so does a Queen, who has the same ability', JSON.stringify(reach.queen));
ok(reach.overlord.endedTilesAway <= reach.range + 2 && reach.queen.endedTilesAway <= reach.range + 2,
  '...and it plants from INSIDE the declared range rather than walking onto the spot, so the range still means something', JSON.stringify([reach.overlord.endedTilesAway, reach.queen.endedTilesAway]));
ok(reach.overlord.energyAtPlant === 175 && reach.queen.energyAtPlant === 175,
  '...and it pays the 25 energy exactly once, read at the frame the tumour appears (energy regenerates, so reading it later reads the cap)', JSON.stringify([reach.overlord.energyAtPlant, reach.queen.energyAtPlant]));
ok(reach.overlordFar.planted === 0 && reach.overlordFar.travelledTiles === 0 && reach.queenFar.planted === 0 && reach.queenFar.travelledTiles === 0,
  'THE WALK IS BOUNDED: ordered ' + reach.overlordFar.orderedFromTiles + ' tiles away, past the ' + reach.budget + '-tile budget, it refuses and does not take a step -- a misclick cannot send a Queen into an enemy main (start to start is 100 to 142 tiles on the shipped maps)', JSON.stringify(reach.overlordFar));
ok(reach.overlordFar.energyLeft === 200 && reach.queenFar.energyLeft === 200,
  '...and a refusal is still FREE: the 25 energy is in the pool', JSON.stringify([reach.overlordFar.energyLeft, reach.queenFar.energyLeft]));
ok(/too far to walk/i.test(reach.overlordFar.said) && new RegExp(reach.budget + ' tiles').test(reach.overlordFar.said),
  '...and the player is told that the WALK ran out, with the number -- not "only reaches 3 tiles", which would be a lie about a caster that walks ' + reach.budget, JSON.stringify(reach.overlordFar.said));
ok(reach.immobile.planted === 0 && reach.immobile.travelledTiles === 0 && reach.immobile.energyLeft === 200 && /only reaches 3 tiles/.test(reach.immobile.said),
  'A CASTER THAT CANNOT MOVE is still refused at its RANGE and told so -- burrowed or sieged, it will never be closer than it is now, and the same branch is what refuses a tumour seeding past its nine tiles (FIXLIST-M15 C2, the half that was right)', JSON.stringify(reach.immobile));
ok(reach.inRange === 1, 'IN range it still plants, which is what the limit must not break', String(reach.inRange));
ok(reach.tumourFar.isBuilding === true && reach.tumourFar.tilesAway > 9,
  'the reported half: a finished tumour, a legal creep tile ' + reach.tumourFar.tilesAway + ' tiles away against a range of 9', JSON.stringify(reach.tumourFar));
ok(reach.tumourFar.planted === 0 && reach.tumourFar.issueReturned === false,
  'A TUMOUR CANNOT SEED PAST ITS RANGE -- before C2 it planted at 21.4 tiles, because a building casts in issue() and never reaches orderTick', JSON.stringify(reach.tumourFar));
ok(reach.tumourFar.spentItsOneChild === false,
  '...and a refused seeding does not burn the one child it gets', String(reach.tumourFar.spentItsOneChild));
ok(/only reaches 9 tiles/.test(reach.tumourFar.said),
  '...and it says so, where before it refused in silence', JSON.stringify(reach.tumourFar.said));

// THE NEGATIVE CONTROL FOR C2, and it points the other way from the rest of this file. Everything
// above would ALSO pass if someone made range a hard limit for every point ability in the game,
// which is the change C2 explicitly says not to make -- twenty-six other abilities rely on walk-to.
// So the control is an ability WITHOUT the flag: a Defiler asked to Dark Swarm thirty tiles away
// must still walk there and cast. Delete `noApproach` and the assertions above go red; move the
// check out of the flag and into the shared path and THIS one does.
const walk = J(`(() => {
  G.init({ players: [{ race: 'Z', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (let f = 0; f < 200; f++) G.tick();
  const p = G.players[0];
  const hall = G.units.find(u => u.owner === 0 && u.def.depot);
  const d = G.spawnUnit('defiler', 0, hall.x, hall.y); d.energy = 200;
  const tx = hall.x + 30 * TILE, ty = hall.y;
  const d0 = distPt(d.x, d.y, tx, ty) / TILE;
  Abilities.issue(d, 'dark_swarm', null, tx, ty);
  let cast = false, moved = 0;
  for (let f = 0; f < 4000; f++) { const px = d.x, py = d.y; G.tick(); moved += distPt(px, py, d.x, d.y); if (G.fields.some(fl => fl.kind === 'swarm')) { cast = true; break; } }
  return { orderedFromTiles: Math.round(d0), range: DATA.abilities.dark_swarm.range, cast, travelledTiles: Math.round(moved / TILE), flagged: !!DATA.abilities.dark_swarm.noApproach };
})()`);
ok(walk.flagged === false, 'CONTROL: Dark Swarm does NOT carry noApproach', String(walk.flagged));
ok(walk.cast === true && walk.travelledTiles > 20,
  'CONTROL: a Defiler ordered to Dark Swarm ' + walk.orderedFromTiles + ' tiles away still WALKS ' + walk.travelledTiles + ' tiles and casts -- walk-to is untouched for everything unflagged', JSON.stringify(walk));
{ const flagged = J('Object.entries(DATA.abilities).filter(([,a]) => a.noApproach).map(([k]) => k).sort().join(",")');
  ok(flagged === 'plant_tumour,spawn_tumour',
    'EXACTLY TWO abilities carry the flag, which is the whole scope of the behaviour change', flagged); }
ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
summary({ nl: true });
