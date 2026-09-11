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
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
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
      if (f % 240 === 0) peak = Math.max(peak, G.units.filter(u => u.alive && u.owner === 0 && u.def.tumour).length);
    }
    peak = Math.max(peak, G.units.filter(u => u.alive && u.owner === 0 && u.def.tumour).length);
    out.seeds.push({ seed, peak });
    out.queensSeen += G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'queen').length;
    out.overlordsSeen += G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'overlord').length;
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
ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
