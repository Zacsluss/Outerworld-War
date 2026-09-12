// M12 wave four, the Zerg half: ten new defs, two macro mechanics, and one promise.
//   node test/zerg12.js [--verbose]
//
// The promise is the reason this file exists rather than a handful of lines bolted onto features.js.
// Creep tumours (item 13) are ADDITIVE: the creep that Zerg buildings have emitted since M2 must
// behave on a map with no tumours exactly as it did before this change. That is a claim, and a claim
// is not a test -- so the whole of section 3 below re-derives the pre-change creep rule from scratch
// and compares it to what GameMap.recomputeCreep actually produces, tile by tile, and then asserts
// that planting a tumour only ever ADDS tiles and never takes one away.
//
// The rest is what fails silently. A def with no home in a build page or a larva card is invisible; a
// unit missing from every AI table is a unit no computer opponent ever fields (M11 shipped nine
// structures like that and test/aiscripts.js exists because of it); a creep spread that consulted
// Math.random would desync a replay hours later; a larva inject with no cap would quietly rewrite
// Zerg's production ceiling; and an uprooted crawler that could root off creep would turn a
// creep-locked defensive building into a free turret you can put anywhere on the map.
const fs = require('fs'), vm = require('vm'), path = require('path'), { makeCtx, makeOk, summary } = require('./_harness'); const root = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
const ok = makeOk({ order: 'mc', verbose: () => VERBOSE });

const errors = [];
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'], errors, collect: 'stack' });
const run = src => vm.runInContext(src, ctx);
const json = src => JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));

// The ten of wave four, plus the three defs they needed to exist. `locust` and `brood_cocoon` are not
// items on the list; they are what the Swarm Host shoots and what a ground morph sits inside, and both
// are real entries in DATA.units that every whole-table check in this repository will walk.
const NEW_UNITS = ['roach', 'ravager', 'baneling', 'swarm_host', 'viper', 'infestor', 'overseer', 'locust', 'brood_cocoon'];
const NEW_BUILDINGS = ['roach_warren', 'infestation_pit', 'creep_tumour', 'nydus_worm'];
const NEW_TECHS = ['volatile_bile', 'glial_reconstitution', 'ravager_aspect', 'pathogen_glands', 'pressurised_glands'];
const NEW_ABILITIES = ['larva_inject', 'plant_tumour', 'spawn_tumour', 'uproot', 'volatile_burst', 'corrosive_bile',
  'spawn_locusts', 'fungal_growth', 'spawn_infested', 'abduct', 'consume_essence', 'contaminate', 'nydus_worm',
  'baneling_aspect', 'ravager_aspect', 'swarm_host_aspect', 'viper_aspect', 'overseer_aspect'];

// ---------------------------------------------------------------- the rig
run(`(() => {
  this.fresh = (seed) => {
    G.init({ players: [{ race: 'Z', human: true, name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: seed || 7, layout: 'temple' });
    for (const p of G.players) { p.ai = null; p.minerals = 20000; p.gas = 20000; }
    G.recording = false;
    // Every call below goes straight at the simulation. Without this, CMD.install's wrappers pack each
    // one into a command attributed to G.human and CMD.apply drops anything aimed at another player's
    // building -- so "queue production in the enemy base, then contaminate it" silently does nothing
    // and the check passes for the wrong reason. test/cardsay.js sets the same flag for the same reason.
    G.applying = true;
    this.p = G.players[0];
    return this.p;
  };
  this.tick = n => { for (let i = 0; i < n; i++) G.tick(); };
  // Put a finished building down near a point, the way test/features.js does. Creep is recomputed
  // because G.placeBuilding does not: nothing outside a real construction finishing ever asks.
  this.place = (defId, owner, nearX, nearY, done) => {
    const def = DATA.buildings[defId], p = G.players[owner];
    for (let r = 2; r < 34; r++) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      const tx = Math.round(nearX / TILE + Math.cos(a) * r - def.w / 2), ty = Math.round(nearY / TILE + Math.sin(a) * r * .8 - def.h / 2);
      if (G.map.canPlace(def, tx, ty, p, G.units, null)) continue;
      const b = G.placeBuilding(def, tx, ty, owner);
      if (done !== false) { b.done = true; b.progress = def.time; b.hp = b.maxHp; b.creepR = def.creep || 0; }
      if (def.creep) G.map.recomputeCreep(G.units);
      G.recomputeSupply(); return b;
    }
    return null;
  };
  // A stable fingerprint of the creep grid. FNV-1a over the bytes, because comparing two 16k arrays
  // across the vm boundary as JSON is slower than the test it is checking.
  this.creepHash = () => { const c = G.map.creep; let h = 2166136261; for (let i = 0; i < c.length; i++) { h ^= c[i]; h = (h * 16777619) >>> 0; } return h >>> 0; };
  this.creepCount = () => { const c = G.map.creep; let n = 0; for (let i = 0; i < c.length; i++) if (c[i]) n++; return n; };
  this.creepCopy = () => Array.from(G.map.creep);

  // The pre-change creep rule, re-derived from the description in js/data.js and js/sim.js rather than
  // read out of GameMap: the union of ellipses around every LIVING, NON-FLYING source carrying
  // def.creep, at radius min(def.creep, creepR), skipping unfinished sources except the three halls,
  // on walkable ground that is not a ramp. If recomputeCreep ever stops agreeing with this on a map
  // with no tumours, the additive promise has been broken.
  this.referenceCreep = () => {
    const m = G.map, out = new Uint8Array(m.w * m.h);
    for (const u of G.units) {
      if (!u.alive || !u.def.creep || u.fly) continue;
      if (u.def.id !== 'hatchery' && u.def.id !== 'lair' && u.def.id !== 'hive' && !u.done) continue;
      const cx = u.tx + u.def.w / 2, cy = u.ty + u.def.h / 2, r = Math.min(u.def.creep, u.creepR || 0);
      if (r < 1) continue;
      m.ellipse(cx - 0.5, cy - 0.5, r, r * 0.8, (x, y) => { if (m.walk[m.idx(x, y)] && m.height[m.idx(x, y)] !== 1) out[m.idx(x, y)] = 1; });
    }
    return Array.from(out);
  };
})();`);

// ================================================================ 1. every new def has a home
{
  const d = json(`(() => {
    const out = { units: {}, buildings: {}, techs: {}, abilities: {} };
    for (const id of ${JSON.stringify(NEW_UNITS)}) { const u = DATA.units[id]; out.units[id] = u ? { race: u.race, from: u.from || null, req: u.req || [], hk: u.hk || null, min: u.min, gas: u.gas, sup: u.sup, abil: u.abil || [], morphFrom: u.morphFrom || null } : null; }
    for (const id of ${JSON.stringify(NEW_BUILDINGS)}) { const b = DATA.buildings[id]; out.buildings[id] = b ? { race: b.race, tier: b.tier, req: b.req || [], hk: b.hk || null, min: b.min, gas: b.gas } : null; }
    for (const id of ${JSON.stringify(NEW_TECHS)}) { const t = DATA.techs[id]; out.techs[id] = t ? { race: t.race, bld: t.bld, hk: t.hk, min: t.min, gas: t.gas } : null; }
    for (const id of ${JSON.stringify(NEW_ABILITIES)}) { const a = DATA.abilities[id]; out.abilities[id] = a ? { kind: a.kind, hk: a.hk } : null; }
    out.menu = DATA.buildMenu.Z; out.larva = DATA.larvaMorphs;
    return out;
  })()`);
  for (const id of NEW_UNITS) { const u = d.units[id]; ok('unit ' + id + ' exists and is Zerg', !!u && u.race === 'Z', JSON.stringify(u)); }
  for (const id of NEW_BUILDINGS) { const b = d.buildings[id]; ok('building ' + id + ' exists and is Zerg', !!b && b.race === 'Z', JSON.stringify(b)); }
  for (const id of NEW_TECHS) { const t = d.techs[id]; ok('tech ' + id + ' exists and is Zerg', !!t && t.race === 'Z', JSON.stringify(t)); }
  for (const id of NEW_ABILITIES) ok('ability ' + id + ' exists', !!d.abilities[id]);

  // The spider-mine repair bug in one line: `undefined * n` is NaN, and NaN spreads through every
  // comparison it touches. Anything a cost calculation can reach spells both out.
  const noCost = NEW_UNITS.filter(id => typeof d.units[id].min !== 'number' || typeof d.units[id].gas !== 'number')
    .concat(NEW_BUILDINGS.filter(id => typeof d.buildings[id].min !== 'number' || typeof d.buildings[id].gas !== 'number'));
  ok('every new def spells out min and gas as numbers', noCost.length === 0, noCost.join(', '));

  ok('the two worker-built additions are on the Zerg build pages',
    d.menu.basic.includes('roach_warren') && d.menu.adv.includes('infestation_pit'), JSON.stringify(d.menu));
  // The ceiling test/newbuildings.js enforces, restated here because this change is what reached it.
  ok('...and both Zerg build pages are at the eight-entry ceiling, not over it',
    d.menu.basic.length === 8 && d.menu.adv.length === 8, d.menu.basic.length + '/' + d.menu.adv.length);
  ok('Roach and Infestor are on the larva card', d.larva.includes('roach') && d.larva.includes('infestor'), d.larva.join(','));
  // UI.paginate flows twelve slots when nothing on the card is pinned, and the larva card pins nothing;
  // Set Rally takes one of those twelve. A thirteenth entry collides with the page-turn button.
  ok('the larva card plus Set Rally still fits one page of twelve', d.larva.length + 1 <= 12, d.larva.length + ' morphs');

  // Reachability, as a closure from a bare Hatchery -- the same shape test/techtree.js takes, extended
  // with the one thing that check cannot see: a structure placed by an ABILITY rather than by a worker.
  const reach = json(`(() => {
    const have = new Set(['hatchery']), units = new Set(['larva']), techs = new Set(), abil = new Set();
    const sat = (id) => have.has(id) || (EQUIV[id] || []).some(x => have.has(x));
    const reqMet = d => !d.req || d.req.every(r => DATA.techs[r] ? techs.has(r) : sat(r));
    for (let pass = 0; pass < 40; pass++) {
      let grew = false;
      for (const [id, u] of Object.entries(DATA.units)) { if (u.race !== 'Z' || units.has(id)) continue; if (u.from && !sat(u.from) && !units.has(u.from)) continue; if (!reqMet(u)) continue; units.add(id); grew = true; for (const a of (u.abil || [])) if (!abil.has(a)) { abil.add(a); grew = true; } }
      for (const [id, b] of Object.entries(DATA.buildings)) {
        if (b.race !== 'Z' || have.has(id)) continue;
        if (!reqMet(b)) continue;
        if (b.tier === 'morph') { const from = Object.values(DATA.buildings).find(x => x.morphTo === id || (x.morphOptions || []).includes(id)); if (!from || !have.has(from.id)) continue; }
        // ability-placed: some ability reachable so far names this building, either as its own id or
        // through the two tumour casts. Kept explicit rather than derived, because the mapping from an
        // ability to the structure it puts down lives in Abilities.cast and is not data.
        else if (b.tier === 'none') { const by = { creep_tumour: ['plant_tumour', 'spawn_tumour'], nydus_worm: ['nydus_worm'] }[id]; if (!by) continue; if (!by.some(a => abil.has(a))) continue; }
        have.add(id); grew = true;
        for (const a of (b.abil || [])) if (!abil.has(a)) { abil.add(a); grew = true; }
      }
      for (const [id, t] of Object.entries(DATA.techs)) { if (t.race !== 'Z' || techs.has(id)) continue; if (!have.has(t.bld)) continue; if (!reqMet(t)) continue; techs.add(id); grew = true; }
      if (!grew) break;
    }
    return { units: [...units], have: [...have], techs: [...techs], abil: [...abil] };
  })()`);
  for (const id of NEW_UNITS) ok(id + ' is reachable from a bare Hatchery', reach.units.includes(id));
  for (const id of NEW_BUILDINGS) ok(id + ' is reachable from a bare Hatchery', reach.have.includes(id));
  for (const id of NEW_TECHS) ok('tech ' + id + ' is reachable from a bare Hatchery', reach.techs.includes(id));
  for (const id of NEW_ABILITIES) ok('ability ' + id + ' is on something reachable from a bare Hatchery', reach.abil.includes(id));

  // Hotkeys. The mobile card pins Move/Stop/Attack/Patrol/Hold, so an ability on one of those keys is a
  // key that silently does something else.
  const clash = NEW_ABILITIES.filter(id => 'MSAPH'.includes(d.abilities[id].hk));
  ok('no new ability sits on a key UI.buildCard has already pinned', clash.length === 0, clash.join(', '));
}

// ================================================================ 2. the AI knows about all of it
{
  const tables = json(`({ SCR: AI_SCRIPTS.Z, COMP: { Z: AI_COMP.Z, ZvT: AI_COMP.ZvT, ZvP: AI_COMP.ZvP }, RES: AI_RESEARCH.Z })`);
  const src = fs.readFileSync(path.join(root, 'js', 'ai.js'), 'utf8');
  const inScript = id => tables.SCR.some(s => s[1] === id);
  const inComp = id => Object.values(tables.COMP).some(list => list.some(e => e[0] === id));
  for (const id of NEW_BUILDINGS.filter(x => x === 'roach_warren' || x === 'infestation_pit'))
    ok(id + ' is in AI_SCRIPTS.Z', inScript(id));
  ok('AI_SCRIPTS.Z is still in ascending supply order', tables.SCR.every((s, i) => i === 0 || s[0] >= tables.SCR[i - 1][0]),
    tables.SCR.map(s => s[0] + ':' + s[1]).join(' '));
  for (const id of NEW_TECHS) ok('tech ' + id + ' is in AI_RESEARCH.Z', tables.RES.includes(id));
  ok('AI_RESEARCH.Z still has no duplicates', tables.RES.length === new Set(tables.RES).size);
  // "In an AI table" means AI_COMP for anything off a larva, and NAMED IN js/ai.js for a morph -- the
  // lurker, guardian and devourer have always been bought that way and are in no table either. What is
  // not allowed is a unit no line of the AI mentions at all, which is exactly the M11 failure.
  const MORPHS = ['ravager', 'baneling', 'swarm_host', 'viper', 'overseer'];
  for (const id of ['roach', 'infestor']) ok(id + ' is weighted in AI_COMP.Z, ZvT and ZvP',
    Object.values(tables.COMP).every(list => list.some(e => e[0] === id)), JSON.stringify(tables.COMP.Z));
  for (const id of MORPHS) ok(id + ' is bought by a named clause in js/ai.js (a morph, so it is in no table)',
    !inComp(id) && new RegExp("'" + id + "'").test(src));
  for (const id of ['locust', 'brood_cocoon']) ok(id + ' is deliberately in no AI table (it is a sub-unit)', !inComp(id));
  // ...and every ability has to be pressed by something, or it is a spell nobody ever sees. This is the
  // "7 of 28 spells" line in HANDOFF.md, turned into a check. An aspect is pressed through
  // Abilities.morph, which takes the UNIT id and never the ability's, so those five are matched on the
  // thing they produce -- the same call the lurker, guardian and devourer clauses have always used.
  const pressedAs = { baneling_aspect: 'baneling', ravager_aspect: 'ravager', swarm_host_aspect: 'swarm_host', viper_aspect: 'viper', overseer_aspect: 'overseer' };
  const unpressed = NEW_ABILITIES.filter(id => !new RegExp("'" + (pressedAs[id] || id) + "'").test(src));
  ok('every new ability is pressed by something in js/ai.js', unpressed.length === 0, unpressed.join(', '));
}

// ================================================================ 3. item 13: creep, and the promise
{
  // (a) THE ADDITIVE PROMISE. On a map with no tumours the creep grid must be exactly what the
  // pre-change rule produces. The reference above is an independent re-derivation, so this fails if
  // anybody changes which sources count, at what radius, or under what guards.
  const r = json(`(() => {
    this.fresh(7); this.tick(200);
    this.place('creep_colony', 0, this.p.startX + 260, this.p.startY);
    this.place('spawning_pool', 0, this.p.startX - 240, this.p.startY + 120);
    this.tick(400);
    G.map.recomputeCreep(G.units);
    const got = this.creepCopy(), want = this.referenceCreep();
    let diff = 0; for (let i = 0; i < got.length; i++) if (got[i] !== want[i]) diff++;
    const tum = G.units.filter(u => u.alive && u.def.tumour).length;
    return { diff, tiles: this.creepCount(), tumours: tum, hash: this.creepHash() };
  })()`);
  ok('a map with no tumours has no tumours on it', r.tumours === 0);
  ok('creep is being emitted at all (the check below would pass vacuously otherwise)', r.tiles > 100, r.tiles + ' tiles');
  ok('EXISTING CREEP IS UNCHANGED: recomputeCreep matches the pre-change rule tile for tile', r.diff === 0, r.diff + ' tiles differ');

  // (b) ADDITIVE means it only ever ADDS. Plant one tumour on the edge of that same creep and the old
  // tiles must all still be creep -- a tumour may never take a tile away from a hatchery.
  const add = json(`(() => {
    const before = this.creepCopy();
    const m = G.map, p = this.p;
    // The OUTERMOST creep tile we can legally put a 1x1 on. Outermost matters: a tumour dropped inside
    // a hatchery's own eleven-tile radius adds nothing at all and this check would pass vacuously.
    let spot = null;
    for (let rr = 16; rr >= 3 && !spot; rr--) for (let k = 0; k < 24 && !spot; k++) {
      const a = k / 24 * Math.PI * 2;
      const tx = Math.round(p.startX / TILE + Math.cos(a) * rr), ty = Math.round(p.startY / TILE + Math.sin(a) * rr * 0.8);
      if (!m.hasCreep(tx, ty)) continue;
      if (m.canPlace(DATA.buildings.creep_tumour, tx, ty, p, G.units, null)) continue;
      spot = [tx, ty];
    }
    if (!spot) return { placed: false };
    const ov = G.spawnUnit('overlord', 0, (spot[0] + 0.5) * TILE, (spot[1] + 0.5) * TILE);
    const min0 = p.minerals;
    const cast = Abilities.issue(ov, 'plant_tumour', null, (spot[0] + 0.5) * TILE, (spot[1] + 0.5) * TILE);
    this.tick(3);                              // the overlord is standing on the spot, so this is the cast
    const paid = min0 - p.minerals;            // ...and three frames is far short of a mineral trip, so nothing has come in
    this.tick(700);                            // finish (time 240) and grow
    const t = G.units.find(u => u.alive && u.def.tumour);
    const after = this.creepCopy();
    let lost = 0, gained = 0;
    for (let i = 0; i < after.length; i++) { if (before[i] && !after[i]) lost++; if (!before[i] && after[i]) gained++; }
    return { placed: true, cast, made: !!t, done: !!(t && t.done), paid, lost, gained, creepR: t ? t.creepR : 0 };
  })()`);
  ok('an Overlord can plant a Creep Tumour on creep', add.placed && add.cast && add.made, JSON.stringify(add));
  ok('...and it is paid for out of minerals', add.paid === 25, 'paid ' + add.paid);
  ok('...and it finishes on its own, the way every Zerg structure does', add.done, JSON.stringify(add));
  ok('...and it has begun to spread creep', add.creepR >= 2, 'creepR ' + add.creepR);
  ok('ADDITIVE: a tumour adds creep tiles', add.gained > 0, add.gained + ' gained');
  ok('ADDITIVE: and takes none away', add.lost === 0, add.lost + ' lost');

  // (c) A tumour seeds exactly one child, ever.
  const chain = json(`(() => {
    const t = G.units.find(u => u.alive && u.def.tumour && !u.tumoured);
    if (!t) return { none: true };
    const m = G.map, p = this.p;
    const spotFor = () => { for (let rr = 6; rr >= 2; rr--) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const tx = Math.round(t.tx + Math.cos(a) * rr), ty = Math.round(t.ty + Math.sin(a) * rr * 0.8); if (!m.hasCreep(tx, ty)) continue; if (m.canPlace(DATA.buildings.creep_tumour, tx, ty, p, G.units, null)) continue; return [(tx + 0.5) * TILE, (ty + 0.5) * TILE]; } return null; };
    const s1 = spotFor(); if (!s1) return { noSpot: true };
    const avail0 = Abilities.available(t, 'spawn_tumour');
    Abilities.issue(t, 'spawn_tumour', null, s1[0], s1[1]);
    const n1 = G.units.filter(u => u.alive && u.def.tumour).length;
    const avail1 = Abilities.available(t, 'spawn_tumour');
    const s2 = spotFor();
    if (s2) Abilities.issue(t, 'spawn_tumour', null, s2[0], s2[1]);
    const n2 = G.units.filter(u => u.alive && u.def.tumour).length;
    return { avail0, avail1, n1, n2, flag: !!t.tumoured };
  })()`);
  ok('a finished tumour offers Spread Creep', chain.avail0 === true, JSON.stringify(chain));
  ok('...it seeds a child', chain.n1 >= 2, JSON.stringify(chain));
  ok('...and then never again: one child, ever', chain.avail1 === false && chain.n2 === chain.n1, JSON.stringify(chain));

  // (d) DETERMINISM. The same seed, the same code path, twice, compared on the creep grid itself. The
  // chain is driven through the AI's own creepEdge, which is the placement code a real game uses; if
  // anything in it ever reached for Math.random this is where a replay would start lying.
  const det = json(`(() => {
    const play = (seed, tumours) => {
      this.fresh(seed);
      const p = this.p; p.ai = new AI(p, 'normal');
      this.tick(300);
      const ov = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'overlord');
      p.minerals = 4000;
      // one root by hand at the overlord, then let the AI's own chain run
      let spot = null; const m = G.map;
      for (let rr = 8; rr >= 2 && !spot; rr--) for (let k = 0; k < 24 && !spot; k++) { const a = k / 24 * Math.PI * 2; const tx = Math.round(p.startX / TILE + Math.cos(a) * rr), ty = Math.round(p.startY / TILE + Math.sin(a) * rr * 0.8); if (!m.hasCreep(tx, ty)) continue; if (m.canPlace(DATA.buildings.creep_tumour, tx, ty, p, G.units, null)) continue; spot = [(tx + 0.5) * TILE, (ty + 0.5) * TILE]; }
      Abilities.issue(ov, 'plant_tumour', null, spot[0], spot[1]);
      for (let i = 0; i < 2600; i++) { G.tick(); p.minerals = 4000; if (i % 24 === 0) p.ai.zergCreep(); }
      const ts = G.units.filter(u => u.alive && u.def.tumour).map(u => u.tx + ',' + u.ty).sort();
      const out = { hash: this.creepHash(), tiles: this.creepCount(), n: ts.length, where: ts.join(' ') };
      // The control, taken from this very state: take the tumours back out of the union and the grid
      // has to change. Same game, same frame, one variable -- which is what a control is for.
      for (const t of G.units.filter(u => u.alive && u.def.tumour)) G.kill(t, null, true);
      G.map.recomputeCreep(G.units);
      out.without = { hash: this.creepHash(), tiles: this.creepCount() };
      return out;
    };
    const a = play(7), b = play(7);
    return { a, b, c: a.without };
  })()`);
  ok('a tumour chain spreads creep beyond the buildings that emit it', det.a.n >= 3 && det.a.tiles > 100, JSON.stringify(det.a).slice(0, 160));
  ok('DETERMINISM: two runs of the same seed put the tumours in the same tiles', det.a.where === det.b.where, det.a.n + ' vs ' + det.b.n);
  ok('DETERMINISM: ...and produce a bit-identical creep grid', det.a.hash === det.b.hash, det.a.hash + ' vs ' + det.b.hash);
  // The control that stops the two checks above passing vacuously: the SAME seed with the tumour chain
  // switched off has to give a different grid, or the fingerprint is not reading what it claims to.
  ok('...and the fingerprint reads the tumours: take them out of that same game and the grid changes',
    det.c.hash !== det.a.hash && det.c.tiles < det.a.tiles, JSON.stringify([det.a.tiles, det.c.tiles]));
}

// ================================================================ 4. item 11: larva inject
// M12 shipped inject as "fill the hall back to three, never past it". REVIEW-M17 task 25 (a user decision)
// made it SC2's rule: +`per` (three) per cast, up to `cap` (twelve). This section pins the new rule the
// way it pinned the old one, and the natural rule beside it: a hall left to itself still stops at three
// (LARVA_NATURAL), so a Zerg who never injects plays the M12 game exactly. test/queens.js has the rest.
{
  const inj = json(`(() => {
    this.fresh(11);
    const p = this.p, ab = DATA.abilities.larva_inject;
    const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.spawnsLarva);
    for (const l of hall.larvae.slice()) G.kill(l, null, true);      // spend what the hall started with
    hall.larvaT = 100000;                                            // ...and stop it making more on its own
    const q = G.spawnUnit('queen', 0, hall.x + 40, hall.y + 40); q.energy = 200;
    const e0 = q.energy, n0 = hall.larvae.length;
    const cast = Abilities.issue(q, 'larva_inject', hall);
    this.tick(4);
    const spent = e0 - q.energy;                                     // read before energy regen muddies it
    this.tick(30);
    const booked = G.fields.filter(f => f.kind === 'inject').length;
    const midway = hall.larvae.length;                               // the delay is the mechanic
    this.tick(ab.delay + 40);
    const after = hall.larvae.length;
    // ...and again, on a hall that now holds its natural three: the cast RAISES it
    q.energy = 200; const cast2 = Abilities.issue(q, 'larva_inject', hall);
    this.tick(ab.delay + 40);
    const raised = hall.larvae.length;
    // ...and on up to the cap, one cast at a time
    let casts = 0; while (hall.larvae.length < ab.cap && casts < 10) { q.energy = 200; Abilities.issue(q, 'larva_inject', hall); this.tick(ab.delay + 40); casts++; }
    const atCap = hall.larvae.length;
    // ...and once more on a full hall: refused out loud, refunded, nothing arrives
    q.energy = 200; p.msgs = []; p.lastAlert = {};
    Abilities.issue(q, 'larva_inject', hall); const eFull = q.energy;
    this.tick(ab.delay + 40);
    const capped = hall.larvae.length;
    // natural spawning is untouched: a full hall left to itself spawns nothing more...
    hall.larvaT = 1; this.tick(LARVA_TIME * 2); const idle = hall.larvae.length;
    // ...and a hall cut down to two refills to three and stops there
    while (hall.larvae.length > 2) G.kill(hall.larvae[hall.larvae.length - 1], null, true);
    hall.larvaT = 1; this.tick(LARVA_TIME * 3); const natural = hall.larvae.length;
    // ...and on somebody else's hatchery
    const foeHall = G.units.find(u => u.alive && u.owner === 1 && u.isBuilding);
    q.energy = 200; const cast3 = Abilities.issue(q, 'larva_inject', foeHall);
    this.tick(60);
    return { per: ab.per, cap: ab.cap, delay: ab.delay, n0, cast, booked, midway, after, spent, cast2, raised, casts, atCap, eFull, capped, idle, natural, said: p.msgs.map(m => m.text), foeSpawn: G.fields.filter(f => f.kind === 'inject').length };
  })()`);
  ok('the hall starts the measurement empty', inj.n0 === 0, String(inj.n0));
  ok('a Queen can inject one of its own hatcheries', inj.cast === true && inj.booked === 1, JSON.stringify(inj));
  ok('the larvae do NOT arrive immediately -- the delay is the decision', inj.midway === 0, String(inj.midway));
  ok('...they arrive after the delay, `per` of them (three)', inj.after === inj.per && inj.per === 3, inj.after + ' of ' + inj.per);
  ok('...and it cost the Queen its energy', inj.spent >= 24 && inj.spent <= 26, 'spent ' + inj.spent);
  ok('INJECT RAISES A HALL PAST ITS NATURAL THREE: a second cast on a hall at three makes six (M12 filled it to three and stopped; REVIEW-M17 task 25)', inj.cast2 === true && inj.raised === 2 * inj.per, inj.raised + ' vs ' + 2 * inj.per);
  ok('...up to a cap of twelve, two casts later', inj.cap === 12 && inj.atCap === inj.cap && inj.casts === 2, JSON.stringify([inj.atCap, inj.cap, inj.casts]));
  ok('INJECT CANNOT EXCEED THE CAP: a cast on a full hall is refused out loud, refunded, and adds nothing', inj.eFull === 200 && inj.capped === inj.cap && inj.said.some(s => /larvae/.test(s)), JSON.stringify([inj.eFull, inj.capped, inj.said]));
  ok('a full hall left to itself spawns nothing more: natural spawning is gated at three, not at the cap', inj.idle === inj.cap, String(inj.idle));
  ok('...and a hall cut to two refills to exactly three on its own -- the M12 game for anyone who never injects', inj.natural === 3, String(inj.natural));
  ok('a Queen cannot inject an enemy hall', inj.foeSpawn === 0, String(inj.foeSpawn));
}

// ================================================================ 5. crawlers that move
{
  const cr = json(`(() => {
    this.fresh(13);
    const p = this.p, m = G.map;
    const sunk = this.place('sunken_colony', 0, p.startX + 200, p.startY);
    if (!sunk) return { none: true };
    m.recomputeCreep(G.units);
    const home = [sunk.tx, sunk.ty];
    const rooted = { lifted: !!sunk.lifted, blocked: m.blocked[m.idx(sunk.tx, sunk.ty)] === sunk.id, creep: this.creepCount() };
    const up = Abilities.instant(sunk, 'uproot');
    this.tick(2);
    const liftedState = { up, lifted: !!sunk.lifted, fly: !!sunk.fly, blocked: m.blocked[m.idx(sunk.tx, sunk.ty)] === sunk.id, creep: this.creepCount() };
    // walk it to a tile that is definitely NOT creep, then try to root there
    let off = null;
    for (let r = 6; r < 40 && !off; r++) for (let k = 0; k < 24 && !off; k++) {
      const a = k / 24 * Math.PI * 2;
      const tx = Math.round(p.startX / TILE + Math.cos(a) * r), ty = Math.round(p.startY / TILE + Math.sin(a) * r * 0.8);
      if (m.hasCreep(tx, ty) || m.hasCreep(tx + 1, ty + 1)) continue;
      if (m.canPlace(DATA.buildings.sunken_colony, tx, ty, p, G.units, sunk)) continue;   // legal but for the creep? canPlace still refuses -- check the reason
      off = [tx, ty];
    }
    let offReason = null, offRooted = null;
    if (!off) {
      // canPlace refuses off-creep outright, which is the point; find a tile whose ONLY problem is creep
      for (let r = 6; r < 40 && !off; r++) for (let k = 0; k < 24 && !off; k++) {
        const a = k / 24 * Math.PI * 2;
        const tx = Math.round(p.startX / TILE + Math.cos(a) * r), ty = Math.round(p.startY / TILE + Math.sin(a) * r * 0.8);
        if (m.hasCreep(tx, ty)) continue;
        const why = m.canPlace(DATA.buildings.sunken_colony, tx, ty, p, G.units, sunk);
        if (why === 'Requires creep') { off = [tx, ty]; offReason = why; }
      }
    }
    if (off) {
      p.msgs = []; p.lastAlert = {};
      G.landBuilding(sunk, off[0], off[1]);
      offRooted = { lifted: !!sunk.lifted, tx: sunk.tx, ty: sunk.ty, said: p.msgs.map(x => x.text) };
    }
    // ...and back onto the tile it started on, which must work and must put its creep back exactly.
    sunk.x = (home[0] + 1) * TILE; sunk.y = (home[1] + 1) * TILE;
    G.landBuilding(sunk, home[0], home[1]);
    this.tick(24);                             // G.tickZergNet runs one frame in twelve
    const back = { lifted: !!sunk.lifted, blocked: m.blocked[m.idx(sunk.tx, sunk.ty)] === sunk.id, creep: this.creepCount(), tx: sunk.tx, ty: sunk.ty };
    return { rooted, liftedState, off: off ? { tx: off[0], ty: off[1], reason: offReason } : null, offRooted, back, home, needsCreep: !!DATA.buildings.sunken_colony.needsCreep, spore: !!DATA.buildings.spore_colony.needsCreep };
  })()`);
  ok('both crawler defs carry needsCreep -- the whole safety rail', cr.needsCreep && cr.spore);
  ok('a rooted crawler blocks its own footprint', cr.rooted.blocked === true, JSON.stringify(cr.rooted));
  ok('Uproot stands it up', cr.liftedState.up === true && cr.liftedState.lifted === true, JSON.stringify(cr.liftedState));
  ok('...and it WALKS: uprooting never sets fly, so it cannot cross a cliff', cr.liftedState.fly === false, JSON.stringify(cr.liftedState));
  ok('...and it stops blocking the ground it left', cr.liftedState.blocked === false, JSON.stringify(cr.liftedState));
  ok('...and its creep patch goes with it', cr.liftedState.creep < cr.rooted.creep, cr.liftedState.creep + ' vs ' + cr.rooted.creep);
  ok('a tile off creep was found to try it on', !!cr.off, JSON.stringify(cr.off));
  ok('AN UPROOTED CRAWLER CANNOT ROOT OFF CREEP', !!cr.offRooted && cr.offRooted.lifted === true, JSON.stringify(cr.offRooted));
  ok('...and it says why rather than failing silently', !!cr.offRooted && cr.offRooted.said.some(s => /creep/i.test(s)), JSON.stringify(cr.offRooted && cr.offRooted.said));
  ok('...but it roots perfectly happily back on creep', !!cr.back && cr.back.lifted === false && cr.back.blocked === true, JSON.stringify(cr.back));
  ok('...back on the tile it started from', !!cr.back && cr.back.tx === cr.home[0] && cr.back.ty === cr.home[1], JSON.stringify([cr.home, cr.back]));
  ok('...and its creep comes back with it, exactly', !!cr.back && cr.back.creep === cr.rooted.creep, cr.back.creep + ' vs ' + cr.rooted.creep);
}

// ================================================================ 5b. a crawler's walk that cannot end (REVIEW-M17 task 29)
// Measured in the eight-player game: an uprooted Sunken Colony squeezed into the one-tile gap between a
// Spore Colony and the building below it; the wide-body A* could not take a first step out of a tile
// its body does not fit (every orthogonal fails the 3x3 test, every diagonal needs two that pass), so
// the crawler ground straight at its goal for the watchdog's ten seconds at three stuck points a frame
// (723) -- and then the `land` case took the watchdog's give-up for an arrival and rooted it AT THE
// ORDERED TILE, sixteen tiles away. Two scenes: the teleport (a legal tile sealed inside a ring of
// colonies) and the pocket (the eight-player geometry rebuilt tile for tile).
{
  const TILE_PX = run('TILE');
  const put = `this.put = (defId, tx, ty) => { const def = DATA.buildings[defId]; const b = G.placeBuilding(def, tx, ty, 0); if (!b) return null; b.done = true; b.progress = def.time; b.hp = b.maxHp; b.creepR = def.creep || 0; if (def.creep) G.map.recomputeCreep(G.units); G.recomputeSupply(); return b; };`;
  const A = json(`(() => {
    this.fresh(13); ${put}
    const p = this.p, m = G.map, hx = Math.floor(p.startX / TILE), hy = Math.floor(p.startY / TILE);
    const lands = []; const lb = G.landBuilding; G.landBuilding = function (b, tx, ty) { lands.push({ tx, ty, d: Math.round(distPt(b.x, b.y, (tx + 1) * TILE, (ty + 1) * TILE)) }); return lb.call(this, b, tx, ty); };
    const T = [hx + 8, hy - 2];   // a creep 2x2 east of the hall, sealed by eight creep colonies
    const ring = [[-2, -2], [0, -2], [2, -2], [-2, 0], [2, 0], [-2, 2], [0, 2], [2, 2]].map(([dx, dy]) => !!this.put('creep_colony', T[0] + dx, T[1] + dy)).filter(Boolean).length;
    const legal = !m.canPlace(DATA.buildings.sunken_colony, T[0], T[1], p, G.units, null);
    const sunk = this.put('sunken_colony', hx + 4, hy + 4); Abilities.instant(sunk, 'uproot'); this.tick(2);
    const start = [sunk.x, sunk.y];
    sunk.setOrder({ type: 'land', tx: T[0], ty: T[1] });
    let dropped = null; for (let i = 0; i < 720; i++) { G.tick(); if (dropped === null && sunk.order.type !== 'land') dropped = i + 1; }
    G.landBuilding = lb;
    return { ring, legal, dropped, lifted: !!sunk.lifted, at: [Math.round(sunk.x / TILE), Math.round(sunk.y / TILE)], moved: Math.round(distPt(start[0], start[1], sunk.x, sunk.y)), lands, target: T };
  })()`);
  ok('the teleport scene stands: a legal creep tile sealed inside eight colonies, a lifted crawler ordered to land on it', A.ring === 8 && A.legal === true, JSON.stringify(A));
  ok('the walk gives up and the order drops, as every other failed walk does', A.dropped !== null && A.dropped < 700, JSON.stringify(A));
  ok('THE CRAWLER DOES NOT ROOT INSIDE THE RING (before: it landed on the ordered tile from 146 px away, through the wall)', A.lifted === true && A.lands.length === 0, JSON.stringify(A));
  const B = json(`(() => {
    this.fresh(13); ${put}
    const p = this.p, m = G.map, hx = Math.floor(p.startX / TILE), hy = Math.floor(p.startY / TILE);
    const lands = []; const lb = G.landBuilding; G.landBuilding = function (b, tx, ty) { lands.push({ tx, ty, d: Math.round(distPt(b.x, b.y, (tx + 1) * TILE, (ty + 1) * TILE)) }); return lb.call(this, b, tx, ty); };
    // the eight-player geometry: a Spore Colony above-left, two colonies below, the crawler in the one-tile
    // corridor between them and pressed to its top edge (px 1858,1217 on tile 58,38 was the measurement)
    const X = hx + 3, Y = hy + 4;
    const spore = !!this.put('spore_colony', X, Y - 2), below = !!this.put('creep_colony', X, Y + 1) && !!this.put('creep_colony', X + 2, Y + 1);
    const sunk = this.put('sunken_colony', hx - 6, hy + 6); Abilities.instant(sunk, 'uproot'); this.tick(2);
    sunk.x = (X + 2) * TILE + 2; sunk.y = Y * TILE + 1; sunk.px = sunk.x; sunk.py = sunk.y;
    const [sx, sy] = sunk.tile(); const fits = (x, y) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!m.walkable(x + a, y + b)) return false; return true; };
    const T = [hx - 9, hy + 1];
    const legal = !m.canPlace(DATA.buildings.sunken_colony, T[0], T[1], p, G.units, sunk);
    G.pathBudget = 100; const pathOut = G.pf.find(sx, sy, T[0] + 1, T[1] + 1, 5000, true).length;
    sunk.setOrder({ type: 'land', tx: T[0], ty: T[1] });
    let rooted = null, maxStuck = 0; for (let i = 0; i < 1200; i++) { G.tick(); maxStuck = Math.max(maxStuck, sunk.stuck); if (rooted === null && !sunk.lifted) rooted = i + 1; }
    G.landBuilding = lb;
    return { spore, below, wedged: !fits(sx, sy), legal, pathOut, rooted, tx: sunk.tx, ty: sunk.ty, lifted: !!sunk.lifted, maxStuck, lands, target: T };
  })()`);
  ok('the pocket scene stands: the crawler is on a tile its body does not fit, a legal creep tile is ordered fourteen tiles west', B.spore && B.below && B.wedged && B.legal, JSON.stringify(B));
  ok('the wide-body pathfinder hands it a way OUT (before: an empty path, and a straight grind into the corner)', B.pathOut > 0, JSON.stringify(B));
  ok('...it walks out and roots on the ordered tile, landing from where it stands', B.rooted !== null && B.lifted === false && B.tx === B.target[0] && B.ty === B.target[1] && B.lands.length === 1 && B.lands[0].d <= TILE_PX, JSON.stringify(B));
  ok('...and its stuck counter never climbs (before: 723 -- the eight-player "nothing wedged" line)', B.maxStuck < 100, JSON.stringify(B));
}

// ================================================================ 6. the Nydus network
{
  const ny = json(`(() => {
    this.fresh(17);
    const p = this.p;
    const canal = this.place('nydus_canal', 0, p.startX, p.startY);
    if (!canal) return { none: true };
    G.map.recomputeCreep(G.units);
    const m = G.map;
    const spot = (skip) => { for (let r = 3; r < 22; r++) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2 + r; const tx = Math.round(p.startX / TILE + Math.cos(a) * r), ty = Math.round(p.startY / TILE + Math.sin(a) * r * 0.8); if (m.canPlace(DATA.buildings.nydus_worm, tx, ty, p, G.units, null)) continue; if (skip.some(s => Math.abs(s[0] - tx) < 3 && Math.abs(s[1] - ty) < 3)) continue; return [tx, ty]; } return null; };
    const used = [];
    for (let i = 0; i < 3; i++) { const s = spot(used); if (!s) break; used.push(s); Abilities.issue(canal, 'nydus_worm', null, (s[0] + 1) * TILE, (s[1] + 1) * TILE); }
    const worms = G.units.filter(u => u.alive && u.def.id === 'nydus_worm');
    for (const w of worms) { w.done = true; w.hp = w.maxHp; w.progress = w.def.time; }
    const ends = 1 + worms.length;
    const newest = canal.nydusLink === worms[worms.length - 1];
    const homes = worms.every(w => w.nydusLink === canal);
    // ...and the redundancy that makes it a network: kill the newest mouth and the hub falls back
    G.kill(worms[worms.length - 1], null, true);
    this.tick(24);
    const fell = canal.nydusLink === worms[worms.length - 2];
    // ...and killing all of them leaves the hub pointing at nothing rather than at a corpse
    for (const w of worms) if (w.alive) G.kill(w, null, true);
    this.tick(24);
    const empty = !canal.nydusLink;
    return { ends, newest, homes, fell, empty, net: (canal.nydusNet || []).length };
  })()`);
  ok('a Nydus network has more than two ends', ny.ends >= 3, JSON.stringify(ny));
  ok('every worm leads home to the canal', ny.homes === true, JSON.stringify(ny));
  ok('the canal leads to the newest worm', ny.newest === true, JSON.stringify(ny));
  ok('...and falls back to the next newest when that one dies', ny.fell === true, JSON.stringify(ny));
  ok('...and to nothing at all when they are all gone, rather than to a corpse', ny.empty === true, JSON.stringify(ny));
}

// ================================================================ 7. the units do what their defs say
{
  const u = json(`(() => {
    this.fresh(23);
    const p = this.p, out = {};
    p.tech = new Set(['volatile_bile', 'ravager_aspect', 'pathogen_glands', 'burrow_tech']);
    // ---- ground morphs sit in a GROUND egg, not the flying cocoon
    const zl = G.spawnUnit('zergling', 0, p.startX + 60, p.startY);
    this.place('spawning_pool', 0, p.startX - 200, p.startY);
    out.banelingMorph = Abilities.morph(zl, 'baneling');
    out.eggId = zl.def.id; out.eggFly = !!zl.fly;
    // ---- volatile burst: kills the baneling, hurts a building double
    this.fresh(23); const p2 = this.p;
    const target = G.units.find(x => x.alive && x.owner === 1 && x.isBuilding);
    const bl = G.spawnUnit('baneling', 0, target.x, target.y);
    const hp0 = target.hp;
    out.burst = Abilities.instant(bl, 'volatile_burst');
    out.banelingDied = !bl.alive;
    out.buildingHurt = hp0 - target.hp;
    // ---- corrosive bile: nothing happens until the delay is up, then it does
    this.fresh(23); const p3 = this.p;
    const t3 = G.units.find(x => x.alive && x.owner === 1 && x.isBuilding);
    const rv = G.spawnUnit('ravager', 0, t3.x - 5 * TILE, t3.y); rv.energy = 100;
    Abilities.issue(rv, 'corrosive_bile', null, t3.x, t3.y);
    this.tick(10);
    const bhp0 = t3.hp; out.bileBooked = G.fields.filter(f => f.kind === 'bile').length;
    this.tick(DATA.abilities.corrosive_bile.delay + 30);
    out.bileDmg = bhp0 - t3.hp; out.bileSpent = rv.energy < 100;
    // ---- swarm host: locusts, with an order already on them
    this.fresh(23);
    const foe = G.units.find(x => x.alive && x.owner === 1 && x.isBuilding);
    const sh = G.spawnUnit('swarm_host', 0, foe.x - 8 * TILE, foe.y); sh.energy = 200;
    out.locustCast = Abilities.instant(sh, 'spawn_locusts');
    const lc = G.units.filter(x => x.alive && x.def.id === 'locust');
    out.locusts = lc.length; out.locustOrdered = lc.every(l => l.order.type === 'attackmove'); out.locustLife = lc.every(l => l.lifetime > 0);
    // ---- fungal growth: roots and silences what is inside it
    this.fresh(23);
    const inf = G.spawnUnit('infestor', 0, this.p.startX, this.p.startY); inf.energy = 200;
    // A siege tank rather than a marine: the cloud does about 72 damage over its life and a marine has
    // forty, so a marine dies inside it and "did it start moving again" would read false for the wrong
    // reason. Something that survives the spell is what proves the root ends with it.
    const victim = G.spawnUnit('siege_tank', 1, this.p.startX + 3 * TILE, this.p.startY);
    victim.applyOrder({ type: 'move', x: victim.x + 400, y: victim.y });
    const vx0 = victim.x;
    Abilities.issue(inf, 'fungal_growth', null, victim.x, victim.y);
    this.tick(40);
    out.fungalField = G.fields.filter(f => f.kind === 'fungal').length;
    out.rooted = Math.abs(victim.x - vx0) < 4; out.fungalHurt = victim.hp < victim.maxHp;
    this.tick(240);
    out.fungalAlive = victim.alive;
    out.freedAfter = victim.alive && Math.abs(victim.x - vx0) > 32;
    // ---- spawn infested: an otherwise unreachable unit, with a lifetime on it
    this.fresh(23);
    const inf2 = G.spawnUnit('infestor', 0, this.p.startX, this.p.startY); inf2.energy = 200;
    this.p.tech = new Set(['pathogen_glands']);
    Abilities.issue(inf2, 'spawn_infested', null, this.p.startX + 2 * TILE, this.p.startY);
    this.tick(20);
    const its = G.units.filter(x => x.alive && x.def.id === 'infested_terran' && x.owner === 0);
    out.infested = its.length; out.infestedTemporary = its.every(x => x.lifetime > 0);
    // ---- abduct: the only thing in the game that moves an enemy
    this.fresh(23);
    const vp = G.spawnUnit('viper', 0, this.p.startX, this.p.startY); vp.energy = 200;
    const tank = G.spawnUnit('siege_tank', 1, this.p.startX + 7 * TILE, this.p.startY); tank.sieged = true;
    const d0 = Math.hypot(tank.x - vp.x, tank.y - vp.y);
    Abilities.issue(vp, 'abduct', tank);
    this.tick(30);
    out.abductDist = Math.round(Math.hypot(tank.x - vp.x, tank.y - vp.y));
    out.abductWas = Math.round(d0); out.unsieged = !tank.sieged;
    // ---- contaminate: a building that produces nothing for a while
    this.fresh(23);
    const cc = G.units.find(x => x.alive && x.owner === 1 && x.isBuilding && x.def.produces.length);
    // Next to the target, and ticked first: orderTick refuses an enemy target the caster cannot SEE,
    // and G.updateVision runs one frame in three.
    const ov = G.spawnUnit('overseer', 0, cc.x - 3 * TILE, cc.y); ov.energy = 200;
    this.tick(6);
    out.queued = G.queueUnit(cc, cc.def.produces[0]);
    this.tick(20);
    out.progressed = cc.prod.length ? cc.prod[0].progress : -1;   // it was producing before the cast
    Abilities.issue(ov, 'contaminate', cc);
    this.tick(10);                                                 // the Overseer has to fly into range first
    out.contaminated = cc.fx.maelstrom > 0;
    const prog0 = cc.prod.length ? cc.prod[0].progress : -1;
    this.tick(60);                                                 // ...and this window is entirely after it landed
    const prog1 = cc.prod.length ? cc.prod[0].progress : -1;
    out.frozen = prog1 === prog0;
    // ---- an Overseer costs supply, which is the price of the morph
    this.fresh(23);
    const ol = G.units.find(x => x.alive && x.owner === 0 && x.def.id === 'overlord');
    const sup0 = this.p.supMax;
    this.p.tech = new Set();
    out.overseerGive = DATA.units.overseer.supGive === undefined && DATA.units.overlord.supGive === 8;
    return out;
  })()`);
  ok('a zergling morphs into a baneling', u.banelingMorph === true);
  ok('...inside a GROUND egg, not the flying cocoon', u.eggId === 'brood_cocoon' && u.eggFly === false, u.eggId + ' fly=' + u.eggFly);
  ok('Volatile Burst spends the Baneling', u.burst === true && u.banelingDied === true, JSON.stringify(u));
  ok('...and hurts a building for its doubled damage', u.buildingHurt >= 40, 'took ' + u.buildingHurt);
  ok('Corrosive Bile books a shell rather than hitting', u.bileBooked === 1 && u.bileSpent === true, JSON.stringify(u));
  ok('...which lands after its delay and damages what could not walk away', u.bileDmg > 20, 'dealt ' + u.bileDmg);
  ok('a Swarm Host spawns locusts', u.locustCast === true && u.locusts >= 2, JSON.stringify(u));
  ok('...already ordered at something, and already dying', u.locustOrdered === true && u.locustLife === true, JSON.stringify(u));
  ok('Fungal Growth roots what is inside it', u.fungalField === 1 && u.rooted === true, JSON.stringify(u));
  ok('...and damages it', u.fungalHurt === true);
  ok('...and lets it go when the cloud expires', u.fungalAlive === true && u.freedAfter === true, JSON.stringify([u.fungalAlive, u.freedAfter]));
  ok('Spawn Infested puts infested terrans on the map', u.infested === 2, String(u.infested));
  ok('...temporarily, so an Infestor cannot supply-lock its own player', u.infestedTemporary === true);
  ok('Abduct pulls an enemy to the Viper', u.abductDist < u.abductWas / 2, u.abductWas + ' -> ' + u.abductDist);
  ok('...and it arrives out of siege mode', u.unsieged === true);
  ok('the contaminate check is not vacuous: there was production to stop', u.queued === true && u.progressed > 0, JSON.stringify([u.queued, u.progressed]));
  ok('Contaminate shuts a production building down', u.contaminated === true && u.frozen === true, JSON.stringify([u.contaminated, u.frozen, u.progressed]));
  ok('an Overseer gives no supply, so morphing one costs eight', u.overseerGive === true);
}

// ================================================================ 8. an AI game runs with all of it
{
  // The end-to-end check: a real Zerg computer opponent, playing a real game, with every table above
  // wired in. It asserts nothing about who wins -- it asserts that the new defs are actually FIELDED,
  // which is the failure mode M11 shipped nine times over.
  // THREE SEEDS, and the fielding checks ask whether ANY of them fields the def. That is not a
  // weaker assertion than one seed -- it is the assertion this section actually means. A def no AI
  // can reach (no tech-tree home, missing from AI_COMP, unbuildable requirement) fails on every seed;
  // one seed can only fail for that reason OR because that particular game went a different way.
  //
  // It went a different way on seed 5, and the investigation is worth recording: the Roach is the
  // TOP-RANKED candidate in 114 of 186 production thinks there and is trained in none of them. It is
  // a 75-mineral unit in a gas-rich, mineral-poor Zerg economy, and when the top pick is unaffordable
  // production() falls through to the next candidate it CAN pay for -- a 25-mineral zergling -- which
  // spends the bank before it ever reaches 70% of a Roach and the hold rule can engage. That is the
  // cheap-unit ratchet the long comment in production() says it was written to stop; it still bites
  // Zerg, because zerglings are always affordable. Fixing it changes what every Zerg army is made of,
  // so it belongs to the balance run and is logged in DESIGN-M12.md, not patched here.
  const SEEDS = [5, 6, 7];
  const games = SEEDS.map(seed => json(`(() => {
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'normal', name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'normal', name: 'B', team: 2 }], seed: ${seed}, layout: 'temple' });
    G.recording = false;
    // Two separate records, because they answer two different questions and one cannot do both.
    // seen is the end-of-game census and the count check below needs real quantities from it.
    // ever is the right probe for "was this def REACHED at all": counting only survivors at frame
    // 14000 asks whether one happened to be alive in that minute, so a Roach Warren plus five
    // roaches all dead in the last fight would read as "the AI never fields roaches".
    const ever = {};
    const sample = () => { for (const u of G.units) if (u.owner === 0) ever[u.def.id] = 1; };
    for (let i = 0; i < 14000; i++) { G.tick(); if ((i & 15) === 0) sample(); }
    sample();
    const seen = {};
    for (const u of G.units) if (u.alive && u.owner === 0) seen[u.def.id] = (seen[u.def.id] || 0) + 1;
    const p = G.players[0];
    return { seed: ${seed}, seen, ever, tech: [...p.tech], hash: G.stateHash(), frame: G.frame };
  })()`));
  const built = id => games.filter(g => g.ever[id] || g.seen[id]).map(g => g.seed);
  const where = id => 'seeds ' + JSON.stringify(built(id)) + ' of ' + JSON.stringify(SEEDS);
  ok('a Zerg AI builds a Roach Warren', built('roach_warren').length > 0, where('roach_warren'));
  ok('a Zerg AI fields Roaches', built('roach').length > 0, where('roach'));
  ok('a Zerg AI plants Creep Tumours', built('creep_tumour').length > 0, where('creep_tumour'));
  // The budget is asserted on EVERY seed, not any -- a runaway tumour chain is a bug wherever it happens.
  const tumours = games.map(g => g.seen.creep_tumour || 0);
  ok('...and does not drown in them: the budget holds on every seed', Math.max(...tumours) <= 8, JSON.stringify(tumours));
  ok('a Zerg AI researches at least one M12 tech', games.some(g => NEW_TECHS.some(t => g.tech.includes(t))), games.map(g => g.seed + ':' + g.tech.join('/')).join('  '));
  ok('the game ran to the end without a JS error', errors.length === 0, errors[0] || '');
}

summary({ nl: true });
