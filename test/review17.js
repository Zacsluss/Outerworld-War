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
//  9. THREE DEFS HAD NO PRICE AT ALL (min undefined -> NaN the moment anything did arithmetic on it), and
//     four ability descriptions stated the wrong fact.
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

ok('no JS errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
ok('nothing threw inside a tick across every scene', R(ctx, 'return G.tickErrors;') === 0, String(R(ctx, 'return G.tickErrors;')));
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
