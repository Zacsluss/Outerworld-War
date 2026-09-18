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
// 20. THE AI NEVER REBUILT A DESTROYED TECH BUILDING (task 30): script() only walked forward, so a Queen's
//     Nest lost in a raid was lost for the game -- the head went null (the Hive requires the nest) and no
//     Queen could be made again. Measured: a finished nest killed at 335 s, nothing sent to rebuild it in 240 s.
// 21. SEVEN HAND-COPIED SUPPLY CHECKS DISAGREED (task 6): only queueUnit honoured notUnit, so a nuke queued
//     at the cap was accepted, never started, and reported as "supply blocked". One G.supplyBlocked now.
// 22. THE ALLY TEST, LIVE (task 12): section 11 is a regex; this is a team game with an allied High Templar at
//     full energy standing inside the human's Marines. No storm lands on them; the enemy clump is stormed.
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

  // 5b. A DEAD HATCHERY TAKES ALL OF ITS LARVAE (SCAN-M18 A3.22). G.kill walked u.larvae and each larva's
  // own kill spliced itself out of THAT array, so the walk skipped every other one: [dead, ALIVE, dead,
  // ALIVE, dead], measured. The line directly below it in js/game.js takes a .slice() of `launched` and
  // carries a comment about this exact failure from REVIEW-M17 task 20 -- the larva line beside it never
  // got the same treatment. Nothing was visible from play because a survivor dies on its own next tick,
  // which is also why nothing caught it: this asserts the frame of the kill, not the frame after.
  const orphan = R(ctx, `
    const p = fresh('Z', 'T');
    const hall = G.units.find(u => u.alive && u.owner === 0 && u.isBuilding && u.def.spawnsLarva);
    if (!hall) return { noHall: true };
    run(600);                                                    // let it grow its natural larvae
    const natural = hall.larvae.length;
    while (hall.larvae.length < 5) { const l = G.spawnUnit('larva', 0, hall.x, hall.y); l.hatch = hall; hall.larvae.push(l); }
    const before = hall.larvae.slice();
    const setup = before.length === 5 && before.every(l => l.alive && l.hatch === hall);
    G.kill(hall, null, true);
    return { natural, setup, pattern: before.map(l => l.alive ? 'ALIVE' : 'dead'),
      survivors: before.filter(l => l.alive).length, arrayLeft: hall.larvae.length };`);
  ok('a hatchery with five living larvae, every one of them pointing at it (scene check)', orphan.setup === true, JSON.stringify(orphan));
  ok('KILLING A HATCHERY KILLS EVERY ONE OF ITS LARVAE, not every other one (was: [dead, ALIVE, dead, ALIVE, dead])',
    orphan.survivors === 0, JSON.stringify(orphan.pattern));
  ok('...and the dead hatchery is left holding none of them', orphan.arrayLeft === 0, String(orphan.arrayLeft));
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
// 18b. ...AND THE SAME WORKER WHEN THE GAS BUILDING IS DESTROYED UNDER HER (SCAN-M18 A1.1)
// ============================================================================
// Section 18 fixed the case where a worker inside an extractor is RE-ORDERED. The other way out of a gas building
// -- the building dying while she is in it -- went through a different line, tickGather's "my resource is gone,
// find another", which edited the order in place instead of calling applyOrder, so the `inside` teardown never
// ran. Measured before the fix: 600 frames after the Refinery died the SCV was alive, still `inside` the wreck,
// order gather/goto, motionless for the rest of the game -- out of G.rebuildGrid (so unclickable, unrenderable and
// untargetable) yet still counted by recomputeSupply. It needs a SECOND gas building to exist, because with none
// `n` is null and nextOrder() frees her, which is why every suite that kills a refinery missed it.
{
  const out = R(ctx, `
    const p = this.fresh('T', 'Z'); p.minerals = 5000; p.gas = 0;
    const hall = G.units.find(u => u.alive && u.owner === 0 && u.isBuilding);
    const gz = G.map.resources.filter(r => r.type === 'geyser').sort((a, b) => distPt(a.cx, a.cy, hall.x, hall.y) - distPt(b.cx, b.cy, hall.x, hall.y)).slice(0, 2);
    // through G.completeBuilding, not by hand: it is the line that gives a finished gas building its \`type = 'gas'\`,
    // and without that mark tickGather never takes the branch this section is about
    const ref = gz.map(g => { const b = G.placeBuilding(DATA.buildings.refinery, g.x, g.y, 0); G.completeBuilding(b); return b; });
    const scv = this.sp('scv', 0, ref[0].x, ref[0].y + 90);
    scv.applyOrder({ type: 'gather', target: ref[0], phase: 'goto' });
    let entered = null; for (let i = 0; i < 400 && entered === null; i++) { G.tick(); if (scv.inside === ref[0]) entered = G.frame; }
    G.kill(ref[0], null);
    const x0 = scv.x, y0 = scv.y; this.run(600);
    return { entered: entered !== null, alive: scv.alive, inside: scv.inside ? scv.inside.alive : null,
      moved: distPt(scv.x, scv.y, x0, y0) > 8, order: scv.order.type, target: scv.order.target === ref[1],
      atSecond: distPt(scv.x, scv.y, ref[1].x, ref[1].y) < 3 * TILE, deadOccupant: ref[0].occupant !== null, gas: p.gas };
  `);
  ok('a worker is inside a refinery when it is destroyed under her', out.entered, JSON.stringify(out));
  ok('SHE COMES OUT AND GOES TO THE OTHER ONE: not still sealed inside a wreck (she stayed there for the rest of the game, alive and frozen)',
    out.alive && out.inside !== false && out.moved, JSON.stringify(out));
  ok('...and the wreck keeps nothing of her: she is at the second refinery and the dead one holds no occupant', out.atSecond && !out.deadOccupant, JSON.stringify(out));
  ok('...and she mines the second refinery, so the gas is not lost with the worker', out.order === 'gather' && out.gas > 0, JSON.stringify(out));
}

// ============================================================================
// 18c. A UNIT QUEUED INTO THE LAST SLOT OF SUPPLY IS ACTUALLY BUILT (SCAN-M18 A1.2)
// ============================================================================
// recomputeSupply books a queued unit's supply the moment it is queued; tickProduction then asked supplyBlocked
// about the same item again, which added its supply on top of its own booking. Measured at 9/10: queueUnit
// accepted the Marine and charged 50 minerals, supply went to 10/10, and 400 frames later the item was still at
// progress 0 with started false -- the money gone and the unit never coming. Nothing caught it because the
// suites assert that REFUSED commands are refused, never that an ACCEPTED one completes.
{
  const out = R(ctx, `
    const p = this.fresh('T', 'Z'); p.minerals = 5000; p.gas = 5000;
    const hall = G.units.find(u => u.alive && u.owner === 0 && u.isBuilding);
    const br = G.placeBuilding(DATA.buildings.barracks, hall.tx + 8, hall.ty + 8, 0); br.done = true; br.progress = br.def.time; br.hp = br.maxHp;
    let guard = 0; while (p.supMax - p.supUsed > 1 && guard++ < 60) { this.sp('marine', 0, hall.x + 200, hall.y + 200); G.recomputeSupply(); }
    const free = p.supMax - p.supUsed, before = { used: p.supUsed, max: p.supMax, min: p.minerals, marines: G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'marine').length };
    const accepted = G.queueUnit(br, 'marine');
    const paid = before.min - p.minerals;
    this.run(400);
    return { free, before, accepted, paid, queued: br.prod.length,
      marines: G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'marine').length, used: p.supUsed, max: p.supMax };
  `);
  ok('the arena really is one supply short of the cap with the money to spend', out.free === 1 && out.accepted && out.paid === 50, JSON.stringify(out));
  ok('THE LAST UNIT UNDER THE CAP IS BUILT: it started, finished and walked out (it used to sit at progress 0 for ever, paid for)',
    out.queued === 0 && out.marines === out.before.marines + 1, JSON.stringify(out));
  ok('...and it is not double-booked: supply lands exactly on the cap, not over it', out.used === out.max, JSON.stringify(out));
}

// ============================================================================
// 18d. ...AND AN ITEM THAT COSTS NO SUPPLY IS NEVER HELD BY THE CAP (18c's own regression)
// ============================================================================
// 18c's fix made the production gate ask whether the PLAYER is over the cap -- and asked it of every item, so a player
// who went over it (a depot destroyed, a pylon unpowered) stopped getting Interceptors, Scarabs and Nukes, none of which
// costs a point of supply. Measured: all three at progress 0 for 400 frames, beside a booked Zealot and Marine that were
// right to wait (.claude/review/features/probe-oversupply.js). test/features.js failed on it the day it landed and the
// gate never said so, because that suite exited 0 on a failure. Both halves are asserted, and the held units are then
// given their supply back and must come out -- so the hold is the supply gate and nothing else.
{
  const J = JSON.stringify;
  const scene = race => R(ctx, `
    const p = this.fresh('${race}', 'Z'); p.minerals = 9000; p.gas = 9000; G.recording = false;
    const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
    const put = (id, dx, dy) => { const b = G.placeBuilding(DATA.buildings[id], hall.tx + dx, hall.ty + dy, 0); b.done = true; b.progress = b.def.time; b.hp = b.maxHp; b.sh = b.maxSh || 0; return b; };
    const at = (dx, dy) => [hall.x + dx * TILE, hall.y + dy * TILE];
    const free = [], held = [];
    if ('${race}' === 'P') {
      put('pylon', 8, 0); const gw = put('gateway', 12, 0); G.map.recomputePsi(0, G.units);
      free.push(['interceptor', this.sp('carrier', 0, ...at(0, -6))], ['scarab', this.sp('reaver', 0, ...at(4, -6))]);
      held.push(['zealot', gw]);
    } else {
      const rax = put('barracks', 8, 0);
      G.cheats.noreq = true; const siloQ = G.queueAddon(hall, 'nuclear_silo'), reQ = G.queueAddon(rax, 'reactor');
      for (let i = 0; i < 2000 && !(hall.addon && hall.addon.done && rax.addon && rax.addon.done); i++) G.tick(); G.cheats.noreq = false;
      if (!siloQ || !reQ || !hall.addon || !hall.addon.done || !rax.addon || !rax.addon.done) return { error: 'no nuclear silo or reactor' };
      free.push(['nuke', hall.addon]); held.push(['marine', rax], ['marine', rax]);   // two: the Reactor's second slot is gated in reactorTick
    }
    G.recomputeSupply();
    const E = free.concat(held).map(([id, b]) => { const q = G.queueUnit(b, id); return { id, b, q, it: q ? b.prod[b.prod.length - 1] : null }; });   // queued while there is room...
    const queued = E.map(e => e.q), F = E.slice(0, free.length), H = E.slice(free.length);
    let guard = 0; while (p.supUsed <= p.supMax + 3 && guard++ < 80) { this.sp('${race === 'P' ? 'probe' : 'scv'}', 0, ...at(-6, 6)); G.recomputeSupply(); }
    const over = { used: p.supUsed, max: p.supMax };                               // ...then over the cap, as a lost depot leaves a player
    this.run(400);
    const where = e => e.b.prod.includes(e.it) ? e.it.progress : 'done';
    const out = { over, queued, free: F.map(e => [e.id, where(e), e.id === 'interceptor' ? e.b.interceptors : e.id === 'scarab' ? e.b.scarabs : null]), held: H.map(e => [e.id, where(e)]) };
    // and the supply comes back: a depot or a pylon, done, and the booked unit must come out
    put('${race === 'P' ? 'pylon' : 'supply_depot'}', -10, -2); if ('${race}' === 'P') G.map.recomputePsi(0, G.units); G.recomputeSupply();
    out.back = { used: p.supUsed, max: p.supMax };
    this.run(Math.max(...held.map(([id]) => DATA.units[id].time)) + 30);
    out.released = H.map(e => [e.id, where(e)]);
    return out;`);
  const P = scene('P'), T = scene('T');
  ok('the scenes stand: each player went OVER the cap after its items were accepted, and the supply-costing ones were booked first',
    !P.error && !T.error && P.over.used > P.over.max && T.over.used > T.over.max && P.queued.every(Boolean) && T.queued.every(Boolean), JSON.stringify({ P, T }));
  ok('AN INTERCEPTOR, A SCARAB AND A NUKE ARE BUILT OVER THE CAP: none of them costs supply (all three sat at progress 0 for 400 frames)',
    J(P.free) === J([['interceptor', 'done', 1], ['scarab', 'done', 1]]) && T.free[0][0] === 'nuke' && T.free[0][1] >= 390, JSON.stringify([P.free, T.free]));
  ok('...while a Zealot and two Marines that DO cost supply wait at progress 0, exactly as 18c says they must -- the second in a Reactor\'s own slot', J(P.held) === J([['zealot', 0]]) && J(T.held) === J([['marine', 0], ['marine', 0]]), JSON.stringify([P.held, T.held]));
  ok('...and come out when the supply comes back, so what held them was the supply gate and nothing else',
    P.back.used <= P.back.max && T.back.used <= T.back.max && J(P.released) === J([['zealot', 'done']]) && J(T.released) === J([['marine', 'done'], ['marine', 'done']]), JSON.stringify([P.back, P.released, T.back, T.released]));
  // The gate is asked in three places -- a building's first slot, a Reactor's second, and the stall watcher's excuse -- and
  // every one must name the item, or that place is back to asking about the player alone.
  const calls = [];
  for (const f of ['game', 'sim', 'ui', 'abilities', 'ai', 'hud']) {
    const s = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
    for (const m of s.matchAll(/supplyOver\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) if (!/^\s*p\s*,\s*def\s*$/.test(m[1])) calls.push(f + ': ' + m[1].split(',').length + ' ' + m[0]);
  }
  ok('every call to the production gate names the item it is asking about (' + calls.length + ' calls)', calls.length >= 3 && calls.every(c => / 2 /.test(c)), J(calls));
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

// ============================================================================
// 20. the AI rebuilds a tech building it has lost, and leaves a step it gave up on alone
// ============================================================================
// The real opening (Zerg vs Terran, normal, seed 3) to the Queen's Nest, then the nest destroyed. Before:
// scriptIdx sat at 15 with a null head for the whole watch (.claude/review/rebuild-probe.js).
{
  const out = R(ctx, `
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'normal', name: 'Z', team: 1 }, { race: 'T', human: false, difficulty: 'normal', name: 'T', team: 2 }], seed: 3, layout: 'temple' });
    const p = G.players[0], ai = p.ai; const s = ai.styleScript('Z', ai.style); const nestStep = s.findIndex(x => x[1] === 'queens_nest');
    let nest = null, at = null;
    for (let i = 0; i < 24 * 60 * 14 && !G.over; i++) { G.tick(); const n = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'queens_nest' && u.done); if (n && ai.scriptIdx > nestStep) { nest = n; at = G.frame; break; } }
    if (!nest) return { noNest: true, over: G.over, idx: ai.scriptIdx };
    const idxBefore = ai.scriptIdx; G.kill(nest, null, true);
    let sent = null, rebuilt = null, rewound = null;
    for (let i = 0; i < 24 * 240 && !G.over; i++) {
      G.tick();
      if (rewound === null && ai.scriptIdx === nestStep) rewound = G.frame;
      if (sent === null && ai.mine(u => u.def.worker && u.order.type === 'build' && u.order.def && u.order.def.id === 'queens_nest').length) sent = G.frame;
      if (rebuilt === null && G.units.some(u => u.alive && u.owner === 0 && u.def.id === 'queens_nest')) { rebuilt = G.frame; break; }
    }
    // ...and a step the 200-second hatch gave up on is not rewound to: mark the nest's step skipped, kill
    // the new nest, and the head must NOT return to it
    let idle = null;
    if (rebuilt !== null) { const n2 = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'queens_nest'); ai.scriptSkipped[nestStep] = true; G.kill(n2, null, true); ai.scriptIdx = Math.max(ai.scriptIdx, nestStep + 1); for (let i = 0; i < 24 * 30 && !G.over; i++) { G.tick(); if (ai.scriptIdx === nestStep) { idle = G.frame; break; } } }
    return { nestStep, killedAt: Math.round(at / 24), idxBefore, rewound: rewound === null ? null : Math.round((rewound - at) / 24), sent: sent === null ? null : Math.round((sent - at) / 24), rebuilt: rebuilt === null ? null : Math.round((rebuilt - at) / 24), skippedRewound: idle !== null, over: G.over };`);
  ok('the scene stands: a Zerg AI finished its Queen\'s Nest and the order moved past it before the nest was destroyed', !out.noNest && out.idxBefore > out.nestStep, JSON.stringify(out));
  ok('THE ORDER GOES BACK TO THE LOST STEP and a drone is sent to rebuild the nest (before: never, in 240 s)', out.rewound !== null && out.sent !== null && out.sent <= 200, JSON.stringify(out));
  ok('...and a Queen\'s Nest stands again', out.rebuilt !== null, JSON.stringify(out));
  ok('...but a step the 200-second hatch gave up on is left alone', out.skippedRewound === false, JSON.stringify(out));
}

// ============================================================================
// 21. one supply test: the nuke at the cap starts, a Marine at the cap is still refused, the cheat still lifts it
// ============================================================================
// Measured before (.claude/review/nuke-probe.js): at 10/10 the nuke was accepted, sat at 0/1800 for thirty
// seconds, and the alert said "Additional supply depots required."
{
  const out = R(ctx, `
    const scene = (free = 0) => { const p = this.fresh('T', 'Z'); G.recording = false; G.applying = true; const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
      const ad = DATA.buildings.nuclear_silo; const silo = G.placeBuilding(ad, cc.tx + cc.def.w, cc.ty + cc.def.h - 2, 0); silo.done = true; silo.progress = ad.time; silo.hp = silo.maxHp; silo.parent = cc; cc.addon = silo;
      for (const t of ['science_facility', 'covert_ops']) { const b = G.placeBuilding(DATA.buildings[t], cc.tx - 8, cc.ty + (t === 'covert_ops' ? 4 : 0), 0); b.done = true; b.progress = b.def.time; b.hp = b.maxHp; }
      const bar = G.placeBuilding(DATA.buildings.barracks, cc.tx + 2, cc.ty + 6, 0); bar.done = true; bar.progress = bar.def.time; bar.hp = bar.maxHp;
      while (p.supUsed < p.supMax - free) { G.spawnUnit('marine', 0, cc.x + 120, cc.y + 120); G.recomputeSupply(); }
      p.msgs = []; p.alertAt = {}; p.alertT = {}; return { p, silo, bar }; };
    const said = p => p.msgs.map(m => m.text).filter(t => /supply/i.test(t));
    // the nuke, with two supply free: at the cap itself the alert is right to fire, for the cap
    const a = scene(2); const acceptedNuke = G.queueUnit(a.silo, 'nuke'); this.run(24 * 30); const it = a.silo.prod[0];
    const nuke = { free: a.p.supMax - a.p.supUsed, accepted: acceptedNuke, started: !!(it && it.started), progress: it ? it.progress : null, supplyAlert: !!(a.p.alertT && a.p.alertT.supply > 0), said: said(a.p) };
    // a Marine at the cap is still refused, out loud
    const b = scene(); const acceptedMarine = G.queueUnit(b.bar, 'marine'); const marine = { accepted: acceptedMarine, said: said(b.p) };
    // ...and the food cheat still lifts it for a human
    const c = scene(); G.cheats.food = true; const cheat = { accepted: G.queueUnit(c.bar, 'marine') }; this.run(24); cheat.started = !!(c.bar.prod[0] && c.bar.prod[0].started); G.cheats.food = false;
    // a unit morph pays only the difference: a Hydralisk at the cap cannot become a Lurker (one more supply), and can with one free
    const d = this.fresh('Z', 'T'); G.recording = false; G.applying = true; const hy = G.spawnUnit('hydralisk', 0, d.startX + 100, d.startY + 100); d.tech.add('lurker_aspect');
    while (d.supUsed < d.supMax) { G.spawnUnit('zergling', 0, d.startX + 100, d.startY + 100); G.recomputeSupply(); }
    const morphAtCap = Abilities.morph(hy, 'lurker'); d.supMax += 1; const morphWithOne = Abilities.morph(hy, 'lurker');
    return { nuke, marine, cheat, morph: { atCap: morphAtCap, withOne: morphWithOne, extra: DATA.units.lurker.sup - DATA.units.hydralisk.sup } };`);
  ok('a nuke (8 supply, notUnit) queued with two supply free is accepted and STARTS (before: accepted, 0/1800 after thirty seconds)', out.nuke.free === 2 && out.nuke.accepted && out.nuke.started && out.nuke.progress > 0, JSON.stringify(out.nuke));
  ok('...and no supply alert is raised for it (before: "Additional supply depots required.", with two supply free and nothing that needed them)', out.nuke.supplyAlert === false && out.nuke.said.length === 0, JSON.stringify(out.nuke));
  ok('a Marine at the cap is still refused, and says so', out.marine.accepted === false && out.marine.said.length === 1, JSON.stringify(out.marine));
  ok('the food cheat still lifts the block for a human', out.cheat.accepted === true && out.cheat.started === true, JSON.stringify(out.cheat));
  ok('a unit morph pays only the difference: refused at the cap, allowed with one supply free', out.morph.extra === 1 && out.morph.atCap === false && out.morph.withOne === true, JSON.stringify(out.morph));
  const srcOf = f => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'); const handCopies = f => (srcOf(f).match(/supUsed \+ /g) || []).length;
  ok('the hand-copied tests are gone: game.js keeps the one inside supplyBlocked, sim.js and abilities.js none', handCopies('game') === 1 && handCopies('sim') === 0 && handCopies('abilities') === 0, JSON.stringify([handCopies('game'), handCopies('sim'), handCopies('abilities')]));
  ok('...and ai.js keeps only the warp-in candidate estimate (`ud.sup || 1`, a heuristic, not a refusal)', handCopies('ai') === 1 && /const sup = ud\.sup \|\| 1; if \(p\.supUsed \+ sup > p\.supMax\) continue;/.test(srcOf('ai')), String(handCopies('ai')));
}

// ============================================================================
// 22. an allied caster inside your army casts on the enemy, never on you (the live half of section 11)
// ============================================================================
{
  const out = R(ctx, `
    G.init({ players: [{ race: 'T', human: true, name: 'H', team: 1 }, { race: 'P', human: false, difficulty: 'hard', name: 'Ally', team: 1 }, { race: 'Z', human: false, difficulty: 'normal', name: 'E1', team: 2 }, { race: 'Z', human: false, difficulty: 'normal', name: 'E2', team: 2 }], seed: 5, layout: 'temple' });
    G.recording = false; G.applying = true; G.human = 0;
    for (const p of G.players) if (p.id !== 1) p.ai = null;            // only the ally thinks
    const h = G.players[0], ally = G.players[1]; ally.tech.add('psi_storm_tech');
    const cx = h.startX + 6 * TILE, cy = h.startY + 6 * TILE;
    const marines = []; for (let i = 0; i < 12; i++) marines.push(G.spawnUnit('marine', 0, cx + (i % 4) * 20, cy + Math.floor(i / 4) * 20));
    const ht = G.spawnUnit('high_templar', 1, cx + 30, cy + 20); ht.energy = ht.maxEnergy;
    const casts = []; const issue = Abilities.issue; Abilities.issue = function (u, id, t, x, y) { if (u.def.id === 'high_templar') casts.push({ id, x, y, e: u.energy }); return issue.apply(this, arguments); };
    const R2 = DATA.abilities.psi_storm && DATA.abilities.psi_storm.r ? DATA.abilities.psi_storm.r * TILE : 2 * TILE;
    const near = (x, y, pts) => pts.some(p => distPt(p.x, p.y, x, y) <= R2 + 12);   // against where they STOOD: a storm kills what it lands on
    // alone with the allied Marines: no enemy in sight
    for (let i = 0; i < 120; i++) G.tick();
    const mPos = marines.map(u => ({ x: u.x, y: u.y }));
    const onMarines = casts.filter(c => near(c.x, c.y, mPos)).length, castsAlone = casts.length;
    // ...now an enemy clump within reach, away from the Marines
    const zl = []; for (let i = 0; i < 8; i++) zl.push(G.spawnUnit('zergling', 2, cx + 7 * TILE + (i % 4) * 16, cy - 2 * TILE + Math.floor(i / 4) * 16));
    for (const z of zl) z.applyOrder({ type: 'hold' }); const zPos = zl.map(u => ({ x: u.x, y: u.y }));
    casts.length = 0; ht.energy = ht.maxEnergy;
    for (let i = 0; i < 120; i++) G.tick();
    const onEnemy = casts.filter(c => near(c.x, c.y, zPos)).length, onMarines2 = casts.filter(c => near(c.x, c.y, mPos)).length, dead = zl.filter(u => !u.alive).length;
    Abilities.issue = issue;
    return { allied: G.allied(1, 0), stormTech: ally.hasTech('psi_storm_tech'), castsAlone, onMarines, onEnemy, onMarines2, dead, casts: casts.slice(0, 3).map(c => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y) })), clump: zPos[0] };`);
  ok('the scene stands: the caster is an ally of the human with Psionic Storm researched', out.allied && out.stormTech, JSON.stringify(out));
  ok('with only the human\'s Marines in reach, the allied templar casts nothing on them (the M12 clause tested owner alone and stormed its partner)', out.castsAlone === 0 && out.onMarines === 0, JSON.stringify(out));
  ok('...and with an enemy clump in reach it storms the enemy, not the Marines (positive control: the clause runs)', out.onEnemy >= 1 && out.onMarines2 === 0 && out.dead >= 1, JSON.stringify(out));
}

ok('no JS errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
ok('nothing threw inside a tick across every scene', R(ctx, 'return G.tickErrors;') === 0, String(R(ctx, 'return G.tickErrors;')));
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
