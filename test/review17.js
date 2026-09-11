// REVIEW-M17 -- the simulation faults the review measured, fixed, and pinned.
//   node test/review17.js
//
// Each section is the probe that found the fault, turned into a check. Every one was RED against the
// tree at pre-review-m17 (the numbers in the messages are what the probe printed there) and is the
// negative control for its own fix: put the old line back and the section goes red again, cleanly.
//
//  1. THE CARRIER'S LAUNCH COOLDOWN FROZE. launchCd ticked only while launched[] was non-empty; if the
//     only Interceptor out died within its eight frames the list emptied, the cooldown stuck at 7, and
//     the Carrier never launched again. Measured: 1 launch then none, with 3 Interceptors aboard.
//  2. A FIELD CURED A LONGER STATUS. Jam, Time Warp, Fungal and Disruption Web ASSIGNED their status
//     (blind = 3) every frame, so an Optical Flare (blind = 1e9) under a Jam ended with the Jam.
//  3. A SIEGED TANK WALKED. move/attackmove/patrol were refused at order time; follow, load, gather,
//     repair and construct reached moveTo and walked the tank, siege and all: 275 px on a follow.
//  4. A CLOAKED UNIT UNDER 25 ENERGY COULD NOT DECLOAK. The energy gate ran before the toggle-off branch.
//  5. A LARVA COULD BECOME AN SCV. larvaMorph checked requirements, money and supply, never `from`.
//  6. A WORKER WITH NO HALL SCANNED EVERY FRAME. tickReturn reset waitT to 24 and decremented it once
//     per frame, so it never expired and G.nearestDepot walked G.units 638 times in 240 frames.
//  7. AN EXCEPTION INSIDE A UNIT'S TICK WAS INVISIBLE. Caught, logged to a console most suites stub to
//     silence, and forgotten. G.tickErrors counts them now, and this file asserts zero.
//  8. CHARON BOOSTERS SHORTENED THE GOLIATH'S AIR RANGE. rangeTech is absolute; it read 3 against a base
//     of 5. Brood War's number is 8.
//  9. A REPAIRABLE BUILDING HAD NO PRICE (min undefined -> a NaN repair cost), and four ability
//     descriptions stated the wrong fact.
// 10. THE AI MARCHED ON THE WILDLIFE. pickTarget and seenEnemyArmy walked G.units without skipping the
//     neutral owner; with derelicts on, the wave target was a derelict on three of three seeds.
// 11. AN ALLIED AI STORMED ITS PARTNER. Twenty-six clauses in AI.micro tested an enemy by owner alone.
// 12-16. THE DECISIONS (REVIEW-M17 section 2): bunkered infantry fired at double rate; eleven energy techs
//     did nothing; the 12-frame micro cadence existed only for player 0 and the detector weight never
//     fired; a larva-starved Zerg could add a hatchery only every 45 s.
// 17. A ZERG PLAYER STARTS WITH A QUEEN (user decision, second session).
// 18. A WORKER RE-ORDERED INSIDE A GAS BUILDING NEVER LEFT IT. Unit.tick returns early for anything inside,
//     applyOrder never cleared `inside`, and the worker stayed the building's occupant: the geyser was dead
//     for the game. Found measuring the Zerg notes in the eight-player game (both extractors, minute five on).
// 19. THREE AI FAULTS (tasks 5, 7, 8): research() chose a tech's building by def id, so a Lair that had
//     become a Hive could never research its three techs; the Raven and the Disruptor were bought and never
//     moved (weaponless, and not on supportUnits()); morph() and addon() never released their claim, so
//     the money the bank had already paid stayed reserved for the rest of the think.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + extra : '')); } };

function makeCtx() {
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '' });
  const ctx = {
    console: { log() { }, warn() { }, error: (...a) => ctx.errors.push(String(a[0] && a[0].message || a[0])) }, errors: [], Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
    localStorage: { getItem() { return null; }, setItem() { } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
    requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, alert() { },
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  vm.runInContext(`
    UI.ping = () => {}; UI.onUnitDied = () => {}; UI.mode = 'play';
    // a two-player game with the computer switched off and both banks full, so nothing here is a war
    this.fresh = (r0, r1) => { G.init({ players: [{ race: r0, human: true }, { race: r1, human: false }], seed: 1 }); G.players[1].ai = null; for (const p of G.players) { p.minerals = 5000; p.gas = 5000; } return G.players[0]; };
    this.run = n => { for (let i = 0; i < n; i++) G.tick(); };
    this.sp = (id, o, x, y) => G.spawnUnit(id, o, x, y);
    this.freeNear = (x, y) => { const t = G.map.findFreeTile(Math.floor(x / TILE), Math.floor(y / TILE), 20, (tx, ty) => G.map.walkable(tx, ty) && G.map.walkable(tx + 1, ty) && G.map.walkable(tx, ty + 1)); return [(t[0] + .5) * TILE, (t[1] + .5) * TILE]; };
    this.wall = (o, x, y) => { const t = G.spawnUnit('zergling', o, x, y); t.hp = t.maxHp = 1e6; return t; };   // a target that never dies
  `, ctx);
  return ctx;
}
const R = (c, src) => vm.runInContext('(() => {' + src + '})();', c);
const ctx = makeCtx();

// ============================================================================
// 1. the Carrier keeps launching after its first Interceptor dies young
// ============================================================================
{
  const out = R(ctx, `
    const res = {};
    for (const killEarly of [true, false]) {
      const p = fresh('P', 'T'); const [cx, cy] = freeNear(p.startX + 200, p.startY + 200);
      const car = sp('carrier', 0, cx, cy); car.interceptors = 4;
      const t = wall(1, cx + 5 * TILE, cy);
      car.setOrder({ type: 'attack', target: t });
      let launches = 0, first = null;
      for (let i = 0; i < 400; i++) {
        G.tick();
        if (car.launched) for (const ic of car.launched) if (!ic.__seen) { ic.__seen = true; launches++; if (!first) first = ic; }
        if (killEarly && first && first.alive && launches === 1) G.kill(first, null, true);
      }
      res[killEarly ? 'killed' : 'control'] = { launches, left: car.interceptors, cd: car.launchCd };
    }
    return res;`);
  ok('a Carrier whose first Interceptor dies within eight frames still launches the rest (was 1 launch, cooldown stuck at 7)', out.killed.launches >= 4 && out.killed.left === 0, JSON.stringify(out.killed));
  ok('...and the control with nothing killed launches all four', out.control.launches === 4 && out.control.left === 0, JSON.stringify(out.control));
}

// ============================================================================
// 2. a field refreshing a status does not shorten a longer one
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('P', 'Z'); const [ux, uy] = freeNear(p.startX + 200, p.startY + 200);
    const u = sp('zealot', 0, ux, uy); u.fx.ensnare = 576; G.fields.push({ kind: 'time_warp', x: ux, y: uy, r: 3, t: 10, owner: 1 }); run(15);
    const v = sp('zealot', 0, ux + 30, uy); v.fx.blind = 1e9; G.fields.push({ kind: 'jam', x: ux, y: uy, r: 4, t: 10, owner: 1 }); run(15);
    const w = sp('zealot', 0, ux, uy + 30); w.fx.maelstrom = 144; G.fields.push({ kind: 'fungal', x: ux, y: uy, r: 2, t: 10, owner: 1, tickT: 0 }); run(15);
    return { ensnare: u.fx.ensnare, blind: v.fx.blind, maelstrom: w.fx.maelstrom };`);
  ok('an Ensnare (576) survives a ten-frame Time Warp (was 0 after 15 frames)', out.ensnare > 500, String(out.ensnare));
  ok('an Optical Flare (1e9) survives a ten-frame Jam (was 0)', out.blind > 1e8, String(out.blind));
  ok('a Maelstrom (144) survives a ten-frame Fungal (was 0)', out.maelstrom > 100, String(out.maelstrom));
}

// ============================================================================
// 3. a sieged tank stays put on a follow order, and the order is dropped rather than left live
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); p.tech.add('siege_tech');
    const [tx, ty] = freeNear(p.startX + 200, p.startY + 200); const tk = sp('siege_tank', 0, tx, ty);
    Abilities.issue(tk, 'siege_mode'); run(45);
    const [mx, my] = freeNear(tx + 10 * TILE, ty); const mar = sp('marine', 0, mx, my);
    const x0 = tk.x, y0 = tk.y; tk.setOrder({ type: 'follow', target: mar }); run(90);
    const moved = distPt(x0, y0, tk.x, tk.y), orderSieged = tk.order.type, stillSieged = tk.sieged;
    // unsieged, the same order walks it: the refusal is the siege, not the order
    Abilities.issue(tk, 'siege_mode'); run(45); const x1 = tk.x, y1 = tk.y; tk.setOrder({ type: 'follow', target: mar }); run(90);
    return { sieged: stillSieged, moved, order: orderSieged, movedUnsieged: distPt(x1, y1, tk.x, tk.y) };`);
  ok('a sieged tank given a follow order does not move (was 275 px)', out.moved < 1, out.moved.toFixed(1) + ' px, order now ' + out.order);
  ok('...and the order is dropped rather than left live on a unit that cannot move', out.order !== 'follow', out.order);
  ok('the same tank, unsieged, follows (negative control: it is the siege that refuses)', out.movedUnsieged > 50, out.movedUnsieged.toFixed(1) + ' px');
}

// ============================================================================
// 4. a cloaked unit below 25 energy can decloak
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); p.tech.add('personnel_cloaking');
    const [gx, gy] = freeNear(p.startX + 200, p.startY + 200); const g = sp('ghost', 0, gx, gy); g.energy = 100;
    const on = Abilities.issue(g, 'cloak_ghost'); const wasCloaked = g.cloaked; g.energy = 10;
    const off = Abilities.issue(g, 'cloak_ghost');
    const res = { on, wasCloaked, off, cloakedAfter: g.cloaked, energyAfter: g.energy };
    // cloaking ON at 10 energy is still refused: the gate is gone only for the way out
    const on2 = Abilities.issue(g, 'cloak_ghost'); res.onAt10 = on2; res.cloakedAt10 = g.cloaked;
    return res;`);
  ok('cloaking on at 100 energy works (scene check)', out.on === true && out.wasCloaked === true, JSON.stringify(out));
  ok('a cloaked Ghost at 10 energy can decloak (was refused with "Not enough energy")', out.off === true && out.cloakedAfter === false && out.energyAfter === 10, JSON.stringify(out));
  ok('...but cannot cloak again at 10 energy (negative control: the gate still guards the way in)', out.onAt10 === false && out.cloakedAt10 === false, JSON.stringify({ onAt10: out.onAt10, cloakedAt10: out.cloakedAt10 }));
}

// ============================================================================
// 5. a larva becomes only what a larva can become
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('Z', 'T'); const l = G.units.find(u => u.def.larva && u.owner === 0);
    const scv = G.larvaMorph(l, 'scv');
    const l2 = G.units.find(u => u.def.larva && u.owner === 0 && u.alive);
    const drone = G.larvaMorph(l2, 'drone');
    return { scv, drone, from: DATA.units.drone.from };`);
  ok('larvaMorph refuses an SCV (was accepted: a Zerg-owned SCV)', out.scv === false, String(out.scv));
  ok('...and still accepts a Drone (negative control)', out.drone === true && out.from === 'larva', JSON.stringify(out));
}

// ============================================================================
// 6. a worker with no hall looks again every 24 frames and keeps its load
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z');
    const cc = G.units.find(u => u.def.id === 'command_center' && u.owner === 0);
    const w = G.units.find(u => u.def.worker && u.owner === 0); w.carrying = { type: 'mineral', amt: 8 }; w.applyOrder({ type: 'return' });
    G.kill(cc, null, true);
    // counted for THIS worker only: the other player's workers ask once per return trip, legitimately
    let calls = 0; const orig = G.nearestDepot; G.nearestDepot = function (u) { if (u === w) calls++; return orig.call(this, u); };
    run(240); G.nearestDepot = orig;
    return { order: w.order.type, carrying: !!w.carrying, calls };`);
  ok('with the only hall dead, G.nearestDepot is asked about once a second, not every frame (was 638 calls in 240 frames)', out.calls <= 12 && out.calls >= 8, out.calls + ' calls');
  ok('...and the worker keeps its return order and its load, ready for a new hall', out.order === 'return' && out.carrying === true, JSON.stringify(out));
}

// ============================================================================
// 7. an exception inside a unit's tick is counted
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); const before = G.tickErrors;
    const w = G.units.find(u => u.def.worker && u.owner === 0);
    const frameBefore = G.frame;
    w.tick = () => { throw new Error('review probe'); };
    run(3); delete w.tick;
    const after = G.tickErrors; G.tickErrors = 0;   // the probe's own throws, cleared for the final zero check
    return { before, after, framesAdvanced: G.frame - frameBefore };`);
  ok('G.tickErrors starts at zero for a fresh game', out.before === 0, String(out.before));
  ok('a unit whose tick throws is counted once per frame and the game goes on', out.after === 3 && out.framesAdvanced === 3, JSON.stringify(out));
  ctx.errors.length = 0;   // the probe's own throws, cleared before the final no-errors check
}

// ============================================================================
// 8. Charon Boosters lengthen the Goliath's air range
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); const [gx, gy] = freeNear(p.startX + 200, p.startY + 200); const g = sp('goliath', 0, gx, gy);
    const before = g.wRange(g.def.aw); p.tech.add('charon'); const after = g.wRange(g.def.aw);
    return { before, after, ground: g.wRange(g.def.gw) };`);
  ok('a Goliath\'s air range grows with Charon Boosters (was 5 -> 3)', out.after > out.before, out.before + ' -> ' + out.after);
  ok('...to Brood War\'s 8, leaving the ground range alone', out.after === 8 && out.ground === 5, JSON.stringify(out));
}

// ============================================================================
// 9. data: a price on every def, and four descriptions that tell the truth
// ============================================================================
{
  // The invariant is narrower than "every def has a price": test/veterancy.js pins a MUNITION as a def with
  // no min key at all (the spider mine's missing price was the original NaN, fixed by refusing to repair
  // munitions). What must hold is that everything repairableDef() says CAN be repaired carries a number,
  // because the repair cost is def.min * 0.25 per tick. The Infested Command Center was the one that
  // did not, and it is a building.
  const out = R(ctx, `return {
    icc: [DATA.buildings.infested_command_center.min, DATA.buildings.infested_command_center.gas],
    mineStillMunition: !('min' in DATA.units.spider_mine),
    noPrice: Object.entries(DATA.units).concat(Object.entries(DATA.buildings)).filter(([id, d]) => repairableDef(d) && (typeof d.min !== 'number' || typeof d.gas !== 'number')).map(([id]) => id),
    stim: DATA.abilities.stim.desc, mule: DATA.abilities.mule.desc, blink: DATA.abilities.blink.desc, mothership: DATA.abilities.summon_mothership.desc,
    muleLife: DATA.units.mule.lifetime, blinkOn: Object.keys(DATA.units).filter(id => (DATA.units[id].abil || []).includes('blink')), mothershipFrom: DATA.units.mothership.from || DATA.abilities.summon_mothership.from,
    stimOn: Object.keys(DATA.units).filter(id => (DATA.units[id].abil || []).includes('stim')),
  };`);
  ok('the Infested Command Center, a repairable building, has a price of zero rather than none (repair cost was NaN)', out.icc.join() === '0,0', JSON.stringify(out.icc));
  ok('every def repairableDef() admits carries a numeric min and gas', out.noPrice.length === 0, out.noPrice.join(', '));
  ok('a spider mine is still a munition with no min key (the convention test/veterancy.js pins)', out.mineStillMunition === true);
  ok('Stim\'s description names every unit that carries it', out.stimOn.every(id => new RegExp(DATA_NAME(ctx, id), 'i').test(out.stim)), out.stimOn.join(', ') + ' -- ' + out.stim);
  ok('the MULE\'s description matches its lifetime', new RegExp(Math.round(out.muleLife / 24) + ' seconds').test(out.mule), out.muleLife + ' frames; ' + out.mule);
  ok('Blink\'s description names the unit that has it', out.blinkOn.length === 1 && new RegExp(DATA_NAME(ctx, out.blinkOn[0])).test(out.blink), out.blinkOn.join(',') + ' -- ' + out.blink);
  ok('the Mothership\'s description names what it is merged from', new RegExp(DATA_NAME(ctx, out.mothershipFrom)).test(out.mothership), out.mothershipFrom + ' -- ' + out.mothership);
}
function DATA_NAME(c, id) { return R(c, 'return DATA.units[' + JSON.stringify(id) + '].name;'); }

// ============================================================================
// 10. the AI does not march on the wildlife: a derelict is nobody's base
// ============================================================================
// AI.enemies() excluded the neutral owner; pickTarget, seenEnemyArmy and the fallback target loop walked
// G.units themselves and did not. With derelicts and wildlife on (a skirmish-screen option; no shipped
// layout sets either, which is why nothing saw it), the hard AI's attack wave chose a derelict on three
// of three seeds and counted the armed grubs as enemy army. Measured by the AI reviewer's probe.
{
  const out = R(ctx, `
    const L = JSON.parse(JSON.stringify(MAP_LAYOUTS.temple)); L.derelicts = 'standard'; L.wildlife = 'standard'; MAP_LAYOUTS.__review17 = L;
    const res = {};
    for (const seed of [3, 7, 11]) {
      G.init({ players: [{ race: 'T', human: false, difficulty: 'hard', name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed, layout: '__review17' });
      const p = G.players[0], ai = p.ai, n = G.neutral;
      const neutralB = G.units.filter(u => u.alive && u.isBuilding && u.owner === n.id).length;
      // everything visible: the enemy base and the derelicts both qualify, and the derelicts are nearer
      p.vis.fill(2); G._allVis = null;
      const t = ai.pickTarget({ x: p.startX, y: p.startY });
      // then only the neutrals in sight: what counts as enemy army?
      p.vis.fill(0); for (const u of G.units) if (u.alive && u.owner === n.id) { const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (G.map.inb(tx + dx, ty + dy)) p.vis[(ty + dy) * G.map.w + tx + dx] = 2; }
      G._allVis = null;
      ai.seenSup = 0; const seen = ai.seenEnemyArmy();
      res['seed' + seed] = { neutralB, pickedNeutral: !!(t && t.def && t.owner === n.id), picked: t && t.def ? t.def.id : (t ? 'probe' : null), seenArmy: Math.round(seen) };
    }
    delete MAP_LAYOUTS.__review17;
    return res;`);
  const seeds = Object.values(out);
  ok('the scene has neutral buildings on every seed (negative control for the scene)', seeds.every(s => s.neutralB > 0), JSON.stringify(out));
  ok('with everything in sight, the wave targets the enemy and never a derelict (was: a derelict on three of three seeds)', seeds.every(s => !s.pickedNeutral), JSON.stringify(out));
  ok('...and the wildlife counts as no enemy army (was 11-14 supply of grubs)', seeds.every(s => s.seenArmy === 0), JSON.stringify(out));
}

// ============================================================================
// 11. AI.micro tells enemy from ally with G.allied, never by owner
// ============================================================================
// Twenty-six clauses in micro() tested `o.owner !== p.id` and so an allied AI stormed, irradiated and
// locked down its partner's units in a team game. Static, because a team game with every caster at full
// energy is a long scene for a one-word predicate: no clause may say it the old way, and the count of the
// right way is the guard against a scrape that matches nothing.
{
  const src = fs.readFileSync(path.join(root, 'js', 'ai.js'), 'utf8');
  const micro = src.slice(src.indexOf('  micro()'), src.indexOf('\n  }', src.indexOf('  micro()')));
  ok('the slice found AI.micro (negative control for the anchor)', micro.length > 5000, micro.length + ' chars');
  ok('no clause in AI.micro tests an enemy by owner alone', !/o\.owner !== p\.id/.test(micro));
  ok('...and at least twenty-six test it with G.allied (was 26 by owner)', (micro.match(/!G\.allied\(o\.owner, p\.id\)/g) || []).length >= 26, String((micro.match(/!G\.allied\(o\.owner, p\.id\)/g) || []).length));
}

// ============================================================================
// 12. bunkered infantry fire at their own rate (REVIEW-M17 decision 7)
// ============================================================================
// Unit.tick decremented `cooldown` and the bunker loop decremented it again: 7.5-frame gaps inside a
// bunker against 15 for a Marine outside. One decrement now.
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); const hx = p.startX, hy = p.startY;
    const def = DATA.buildings.bunker; let bunker = null;
    for (let r = 3; r < 30 && !bunker; r++) for (let k = 0; k < 24 && !bunker; k++) { const a = k / 24 * Math.PI * 2; const tx = Math.round((hx - 200) / TILE + Math.cos(a) * r - def.w / 2), ty = Math.round((hy + 250) / TILE + Math.sin(a) * r - def.h / 2); if (!G.map.canPlace(def, tx, ty, p, G.units, null)) { bunker = G.placeBuilding(def, tx, ty, 0); if (bunker) { bunker.done = true; bunker.hp = bunker.maxHp; bunker.progress = def.time; G.completeBuilding(bunker); } } }
    if (!bunker) return { noBunker: true };
    const m1 = sp('marine', 0, bunker.x, bunker.y + 60); m1.setOrder({ type: 'load', target: bunker }); run(200);
    const [fx, fy] = freeNear(bunker.x + 8 * TILE, bunker.y); const m2 = sp('marine', 0, fx, fy);
    const t1 = wall(1, bunker.x + 3 * TILE, bunker.y), t2 = wall(1, fx + 3 * TILE, fy);
    m2.setOrder({ type: 'attack', target: t2 });
    const gaps = { inside: [], outside: [] }; let li = -1, lo = -1;
    for (let i = 0; i < 600; i++) { G.tick(); if (m1.lastFire === G.frame) { if (li >= 0) gaps.inside.push(G.frame - li); li = G.frame; } if (m2.lastFire === G.frame) { if (lo >= 0) gaps.outside.push(G.frame - lo); lo = G.frame; } }
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
    return { inside: m1.inside === bunker, cd: m1.wCd(m1.def.gw), inGap: avg(gaps.inside), outGap: avg(gaps.outside), nIn: gaps.inside.length, nOut: gaps.outside.length };`);
  ok('the Marine is inside the bunker and both Marines fired more than once (scene check)', !out.noBunker && out.inside && out.nIn >= 1 && out.nOut >= 1, JSON.stringify(out));
  ok('a bunkered Marine fires at the same interval as one outside (was 7.5 frames against 15)', out.inGap !== null && Math.abs(out.inGap - out.outGap) < 2 && out.inGap >= out.cd - 1, JSON.stringify(out));
}

// ============================================================================
// 13. the eleven energy techs give +50 max energy (REVIEW-M17 decision 9)
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'P'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const med = sp('medic', 0, x, y), ghost = sp('ghost', 0, x + 30, y), marine = sp('marine', 0, x + 60, y);
    const before = { med: med.maxEnergy, ghost: ghost.maxEnergy, marine: marine.maxEnergy };
    p.tech.add('caduceus');
    const after = { med: med.maxEnergy, ghost: ghost.maxEnergy, marine: marine.maxEnergy };
    med.energy = 240; run(1); const regen = med.energy;
    const fresh2 = sp('medic', 0, x + 90, y);
    return { before, after, regen, fresh2: fresh2.maxEnergy, techs: Object.keys(ENERGY_TECH).length };`);
  ok('a Medic has 200 max energy before Caduceus Reactor and 250 after; the Ghost and Marine are unchanged', out.before.med === 200 && out.after.med === 250 && out.after.ghost === out.before.ghost && out.after.marine === 0, JSON.stringify(out));
  ok('...energy regenerates up to the new maximum, and a Medic made after the research has it too', out.regen > 240 && out.fresh2 === 250, JSON.stringify({ regen: out.regen, fresh2: out.fresh2 }));
  ok('eleven techs name a unit (negative control for the table)', out.techs === 11, String(out.techs));
}

// ============================================================================
// 14. every AI runs micro on its own 12-frame cadence, not only player 0 (REVIEW-M17 decision 8)
// ============================================================================
{
  const out = R(ctx, `
    G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'normal', name: 'B', team: 2 }, { race: 'P', human: false, difficulty: 'normal', name: 'C', team: 3 }, { race: 'T', human: false, difficulty: 'normal', name: 'D', team: 4 }], seed: 5, layout: 'temple' });
    const counts = [0, 0, 0, 0]; const orig = AI.prototype.micro;
    AI.prototype.micro = function () { counts[this.p.id]++; return orig.call(this); };
    try { for (let i = 0; i < 1200; i++) G.tick(); } finally { AI.prototype.micro = orig; }
    return counts;`);
  const min = Math.min(...out), max = Math.max(...out);
  ok('over 1,200 frames every player\'s AI ran micro about as often as player 0 did (was 100 for player 0 and ~17 for the rest)', min >= 60 && max - min <= 40, out.join('/'));
}

// ============================================================================
// 15. the AI notices cloak: sawCloak reads abilities, and the detector weight reads `det`
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'T'); const ai = new AI(p); ai.intel = { bld: {}, unit: { ghost: 1 }, peak: {} };
    const ghostSeen = ai.sawCloak();
    ai.intel = { bld: {}, unit: { marine: 1 }, peak: {} }; const marineSeen = ai.sawCloak();
    ai.intel = { bld: { observatory: 1 }, unit: {}, peak: {} }; const obsSeen = ai.sawCloak();
    return { ghostSeen, marineSeen, obsSeen, detUnits: Object.values(DATA.units).filter(d => d.det).length, detectorKey: Object.values(DATA.units).filter(d => d.detector).length };`);
  ok('having seen a Ghost counts as having seen cloak (was false: `d.cloak` is no unit\'s flag)', out.ghostSeen === true, JSON.stringify(out));
  ok('having seen only Marines does not; an Observatory does', out.marineSeen === false && out.obsSeen === true, JSON.stringify(out));
  ok('the detector weight reads the key the data actually uses (`det` on ' + out.detUnits + ' units; `detector` on none)', out.detUnits > 0 && out.detectorKey === 0 && /needDet && ud\.det\)/.test(fs.readFileSync(path.join(root, 'js', 'ai.js'), 'utf8')), JSON.stringify(out));
}

// ============================================================================
// 16. a larva-starved Zerg adds a hatchery every fifteen seconds, not forty-five (REVIEW-M17 decision 2)
// ============================================================================
{
  const out = R(ctx, `
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'normal', name: 'Z', team: 1 }, { race: 'T', human: true, name: 'H', team: 2 }], seed: 2, layout: 'temple' });
    const p = G.players[0], ai = p.ai; p.minerals = 5000; p.gas = 0;
    // no larvae, and none coming: kill every larva and stop the hatcheries spawning more
    for (const l of G.units.filter(u => u.alive && u.owner === 0 && u.def.larva)) G.kill(l, null, true);
    const halls0 = ai.halls().length; ai.lastExpand = G.frame; ai.scriptIdx = 99;   // past the build order, so macro() is what decides
    let at = null; const spawnLarva = G.spawnLarva; G.spawnLarva = () => {};
    try { for (let i = 0; i < 24 * 60 && at === null; i++) { G.tick(); if (ai.mine(u => u.def.worker && u.order.type === 'build' && u.order.def && u.order.def.depot).length) at = G.frame; } } finally { G.spawnLarva = spawnLarva; }
    return { halls0, larvae: ai.mine(u => u.def.larva).length, minerals: Math.round(p.minerals), secondsToNewHall: at === null ? null : Math.round((at - 0) / 24) };`);
  ok('with no larvae and a full bank, a drone is sent to build a hatchery inside twenty seconds (was forty-five)', out.secondsToNewHall !== null && out.secondsToNewHall <= 20, JSON.stringify(out));
}

// ============================================================================
// 17. a Zerg player starts with a Queen, and the AI injects with her from the first minute
// ============================================================================
// User decision (REVIEW-M17 second session). Spawn Larva refills a hatchery to its three larvae after
// ten seconds (M12 item 11 keeps the ceiling); a starting Queen with 50 energy is two casts as soon as
// the first drones come off the larvae. The AI's Queen clause already casts whenever energy allows and a
// hatchery is short; it simply never had a Queen while its gas went on tech.
{
  const out = R(ctx, `
    G.init({ players: [{ race: 'Z', human: true, name: 'H' }, { race: 'T', human: false, difficulty: 'easy', name: 'C' }], seed: 6, layout: 'temple' });
    const q = G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'queen');
    const human = { queens: q.length, energy: q[0] && q[0].energy, supUsed: G.players[0].supUsed, supMax: G.players[0].supMax, terranQueens: G.units.filter(u => u.alive && u.owner === 1 && u.def.id === 'queen').length };
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'normal', name: 'Z' }, { race: 'T', human: true, name: 'H' }], seed: 6, layout: 'temple' }); G.players[1].ai = null;
    let injects = 0, seen = new Set();
    for (let i = 0; i < 24 * 60; i++) { G.tick(); for (const f of G.fields) if (f.kind === 'inject' && f.owner === 0 && !seen.has(f)) { seen.add(f); injects++; } }
    const ai = { queens: G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'queen').length, injectsInFirstMinute: injects };
    return { human, ai };`);
  ok('a Zerg player starts with one Queen at 50 energy, and a Terran does not', out.human.queens === 1 && out.human.energy === 50 && out.human.terranQueens === 0, JSON.stringify(out.human));
  ok('...within the starting supply (the Queen is 2 of ' + out.human.supMax + ')', out.human.supUsed <= out.human.supMax, JSON.stringify(out.human));
  ok('a Zerg AI casts Spawn Larva at least twice in its first minute (was never: it had no Queen until it could spare 100 gas)', out.ai.queens >= 1 && out.ai.injectsInFirstMinute >= 2, JSON.stringify(out.ai));
}

// ============================================================================
// 18. a worker re-ordered while inside a gas building leaves it, and the building takes the next one
// ============================================================================
// AI.economy's gas rebalancing does this routinely (pull a worker off gas, send one back a think later),
// so this is how a geyser went dead in test/eightplayer.js: the pulled drone was inside the extractor,
// applyOrder left `inside` set, Unit.tick's early return froze it there, and as the extractor's living
// `occupant` with a gather order it kept every other drone out. Measured: 4,200 gas untouched from
// minute five to the end with three drones assigned.
{
  const out = R(ctx, `
    const p = this.fresh('Z', 'T'); p.gas = 0;
    const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.spawnsLarva);
    const gz = G.map.resources.find(r => r.type === 'geyser' && distPt(r.cx, r.cy, hall.x, hall.y) < 14 * TILE);
    const ex = G.placeBuilding(DATA.buildings.extractor, gz.x, gz.y, 0); ex.done = true; ex.progress = ex.def.time; ex.hp = ex.maxHp;
    const min = G.map.resources.find(r => r.type === 'mineral' && r.amount > 0 && distPt(r.cx, r.cy, hall.x, hall.y) < 12 * TILE);
    const a = this.sp('drone', 0, ex.x, ex.y + 90), b = this.sp('drone', 0, ex.x + 40, ex.y + 90);
    a.applyOrder({ type: 'gather', target: ex, phase: 'goto' });
    let entered = null; for (let i = 0; i < 400 && entered === null; i++) { G.tick(); if (a.inside === ex) entered = G.frame; }
    const wasOccupant = ex.occupant === a, phase = a.order.phase;
    // ...and now the AI (or anyone) re-orders her while she is inside
    a.applyOrder({ type: 'gather', target: min, phase: 'goto' });
    const after = { inside: a.inside === null, occupant: ex.occupant === null, x: a.x, y: a.y };
    const x0 = a.x, y0 = a.y; this.run(48); const moved = distPt(a.x, a.y, x0, y0) > 8;
    // ...and a second drone can use the extractor
    b.applyOrder({ type: 'gather', target: ex, phase: 'goto' });
    let bIn = null; for (let i = 0; i < 400 && bIn === null; i++) { G.tick(); if (b.inside === ex) bIn = G.frame; }
    this.run(GAS_TIME + 200);
    return { entered: entered !== null, wasOccupant, phase, after, moved, bIn: bIn !== null, gas: p.gas, aOrder: a.order.type, aTarget: a.order.target && a.order.target.type };`);
  ok('a drone sent to an extractor goes inside it and becomes its occupant', out.entered && out.wasOccupant && out.phase === 'inside', JSON.stringify(out));
  ok('RE-ORDERED WHILE INSIDE, SHE COMES OUT: inside cleared, the occupant slot freed (both used to stay set for the rest of the game)', out.after.inside && out.after.occupant, JSON.stringify(out.after));
  ok('...and she actually moves on her new order (Unit.tick used to return early for her, forever)', out.moved && out.aOrder === 'gather' && out.aTarget === 'mineral', JSON.stringify(out));
  ok('...and the next drone gets in and the geyser pays again (it paid nothing for five minutes in the eight-player game)', out.bIn && out.gas > 0, JSON.stringify([out.bIn, out.gas]));
}

// ============================================================================
// 19. three AI faults: the Hive's techs, the Raven and the Disruptor, the morph and add-on claims
// ============================================================================
// Measured before the fix (.claude/review/ai578-probe.js): a Zerg AI with a Hive and no Lair, 5000/5000,
// six research() calls -- none of pneumatized, ventral_sacs, antennae queued (the Hive is not a 'lair');
// supportUnits() named twelve units and neither the Raven nor the Disruptor, both of which AI_COMP buys;
// after morph('lair') with the head claim armed, commitMin still held the Lair's 150/100 and
// afford(150, 100) read free = 0 against a bank of 250.
{
  const put = `this.put = (defId, owner, near, extra) => { const pl = G.players[owner], def = DATA.buildings[defId]; for (let r = 3; r < 30; r++) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const tx = Math.round(near.x / TILE + Math.cos(a) * r - def.w / 2), ty = Math.round(near.y / TILE + Math.sin(a) * r * .8 - def.h / 2); if (G.map.canPlace(def, tx, ty, pl, G.units, null)) continue; if (extra && !extra(tx, ty)) continue; const b = G.placeBuilding(def, tx, ty, owner); b.done = true; b.progress = def.time; b.hp = b.maxHp; b.creepR = def.creep || 0; if (def.creep) G.map.recomputeCreep(G.units); G.recomputeSupply(); return b; } return null; };`;
  // 5. the Hive researches what the Lair carried
  const t5 = R(ctx, put + `
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'normal', name: 'Z', team: 1 }, { race: 'T', human: true, name: 'H', team: 2 }], seed: 3, layout: 'temple' });
    G.recording = false; G.applying = true; const p = G.players[0], ai = p.ai; const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
    this.put('spawning_pool', 0, hall); this.put('queens_nest', 0, hall);
    hall.def = DATA.buildings.hive; hall.maxHp = hall.def.hp; hall.hp = hall.maxHp;   // the morph's end state: a Hive and no Lair anywhere
    p.minerals = 5000; p.gas = 5000; ai.researchDef = null; ai.commitMin = 0; ai.commitGas = 0; ai.claims = [];
    p.tech.add('burrow_tech');   // the Hive carries Burrow too (equally unreachable before); own it so the three Lair techs are what is left
    for (let i = 0; i < 6; i++) ai.research();
    const lairTechs = ['pneumatized', 'ventral_sacs', 'antennae'];
    return { lair: p.hasBuilding('lair'), hive: p.hasBuilding('hive'), noLairUnit: !G.units.some(u => u.alive && u.owner === 0 && u.def.id === 'lair'), got: lairTechs.filter(id => p.researching.has(id)), hiveQueue: hall.prod.map(it => it.id), researching: [...p.researching] };`);
  ok('the scene stands: a Zerg AI whose only hall is a Hive, with a full bank', t5.hive && t5.noLairUnit, JSON.stringify(t5));
  ok('THE HIVE RESEARCHES A LAIR TECH (before: research() selected the building by def id and queued none of the three -- nor Burrow -- in six calls)', t5.got.length >= 1 && t5.hiveQueue.some(id => t5.got.includes(id)), JSON.stringify(t5));
  // 7. the Raven and the Disruptor are support units and move to the rally with the rest
  const t7 = R(ctx, `
    G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'T', team: 1 }, { race: 'P', human: false, difficulty: 'normal', name: 'P', team: 2 }], seed: 3, layout: 'temple' });
    G.recording = false; G.applying = true; const out = {};
    for (const [pi, id] of [[0, 'raven'], [1, 'disruptor'], [1, 'observer'], [0, 'marine']]) {
      const p = G.players[pi], ai = p.ai; const rally = ai.rallyPoint(); ai.state = 'gather';
      const u = G.spawnUnit(id, pi, rally.x + 14 * TILE, rally.y); u.applyOrder({ type: 'idle' });
      const inSupport = ai.supportUnits().includes(u), inArmy = ai.armyUnits().includes(u);
      ai.army();
      out[id] = { inSupport, inArmy, order: u.order.type, toRally: u.order.type === 'move' && distPt(u.order.x, u.order.y, rally.x, rally.y) < 2 * TILE };
    }
    const ov = G.spawnUnit('overlord', 0, 0, 0); out.overlordSupport = G.players[0].ai.supportUnits().includes(ov);
    return out;`);
  ok('the Raven is a support unit and an idle one far from the rally is sent to it (before: not on the list, and it stood where it was born for the game)', t7.raven.inSupport && !t7.raven.inArmy && t7.raven.toRally, JSON.stringify(t7.raven));
  ok('...and so is the Disruptor', t7.disruptor.inSupport && !t7.disruptor.inArmy && t7.disruptor.toRally, JSON.stringify(t7.disruptor));
  ok('the Observer still is, the Marine is army and the Overlord stays home (the list is written, not derived: deriving it adds the Overlord and drops the Arbiter and the Dark Archon)', t7.observer.inSupport && t7.observer.toRally && t7.marine.inArmy && !t7.marine.inSupport && t7.overlordSupport === false, JSON.stringify(t7));
  // 8. morph() and addon() consume their claim
  const t8 = R(ctx, put + `
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'normal', name: 'Z', team: 1 }, { race: 'T', human: false, difficulty: 'normal', name: 'T', team: 2 }], seed: 3, layout: 'temple' });
    G.recording = false; G.applying = true; const out = {};
    { const p = G.players[0], ai = p.ai; const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.depot); this.put('spawning_pool', 0, hall);
      p.minerals = 400; p.gas = 300; ai.headDef = DATA.buildings.lair; ai.workerDef = null; ai.expandDef = null; ai.queenDef = null; ai.researchDef = null; ai.topDef = null; ai.budget();
      const before = { commitMin: ai.commitMin, commitGas: ai.commitGas, lairClaim: ai.claims.some(c => c.id === 'lair') };
      const ok8 = ai.morph('lair');
      out.morph = { ok: ok8, before, after: { commitMin: ai.commitMin, commitGas: ai.commitGas, lairClaim: ai.claims.some(c => c.id === 'lair') }, bank: [p.minerals, p.gas], afford: ai.afford(150, 100) }; }
    { const p = G.players[1], ai = p.ai; const hall = G.units.find(u => u.alive && u.owner === 1 && u.def.depot); this.put('academy', 1, hall);
      const ad = DATA.buildings.reactor; const bar = this.put('barracks', 1, hall, (tx, ty) => !G.map.canPlace(ad, tx + 4, ty + 1, p, G.units, null));   // room for the add-on on its right
      p.minerals = 300; p.gas = 200; ai.headDef = ad; ai.workerDef = null; ai.expandDef = null; ai.queenDef = null; ai.researchDef = null; ai.topDef = null; ai.budget();
      const before = { commitMin: ai.commitMin, commitGas: ai.commitGas, claim: ai.claims.some(c => c.id === 'reactor') };
      const okA = ai.addon('reactor');
      out.addon = { ok: okA, placed: !!bar, before, after: { commitMin: ai.commitMin, commitGas: ai.commitGas, claim: ai.claims.some(c => c.id === 'reactor') }, bank: [p.minerals, p.gas] }; }
    return out;`);
  ok('the morph scene stands: the Lair is the head claim (150/100 reserved) and the morph is bought', t8.morph.ok && t8.morph.before.lairClaim && t8.morph.before.commitMin >= 150, JSON.stringify(t8.morph));
  ok('MORPH RELEASES ITS CLAIM: the reserve falls by the Lair\'s price and afford(150, 100) is true again (before: 250 reserved of a 250 bank, afford false)', !t8.morph.after.lairClaim && t8.morph.after.commitMin === t8.morph.before.commitMin - 150 && t8.morph.after.commitGas === t8.morph.before.commitGas - 100 && t8.morph.afford === true, JSON.stringify(t8.morph));
  ok('the add-on scene stands: the Reactor is the head claim and the add-on is bought', t8.addon.placed && t8.addon.ok && t8.addon.before.claim, JSON.stringify(t8.addon));
  ok('ADD-ON RELEASES ITS CLAIM too', !t8.addon.after.claim && t8.addon.after.commitMin === t8.addon.before.commitMin - 50 && t8.addon.after.commitGas === t8.addon.before.commitGas - 50, JSON.stringify(t8.addon));
}

ok('no JS errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
ok('nothing threw inside a tick across every scene', R(ctx, 'return G.tickErrors;') === 0, String(R(ctx, 'return G.tickErrors;')));
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
