// M12 wave four, the Protoss half: ten new units, the Warp Gate, Chrono Boost and Blink.
//   node test/protoss12.js
//
// WHAT THIS TEST IS FOR, which is not "the units exist". A def is the easy half and nothing about it
// fails quietly. What fails quietly is everything downstream of it, and M10 and M11 both shipped a
// whole feature nobody could reach: nine structures no AI could build (test/aiscripts.js exists
// because of that) and sixteen sprites with no model (test/baked.js exists because of that). So every
// check below asserts a JOIN rather than a value -- def to tech tree, def to AI table, def to art, and
// spell to the simulation state it is supposed to move.
//
// The four mechanics get real simulations rather than table reads, because each of them is a new kind
// of state and each has a specific way of being wrong:
//   * WARP-IN must land inside the psi grid and nowhere else. The failure is a warp that quietly
//     slides off the field onto ground the player does not hold.
//   * A FORCE FIELD is terrain with a timer, which is the one thing js/map.js says will desync a
//     replay seek if it remembers a countdown of its own. It is checked across a snapshot round trip.
//   * BLINK must not cross terrain a ground unit could not eventually walk to, which a plain
//     walkability test on the destination does not catch: the top of a cliff is walkable.
//   * CHRONO BOOST must actually shorten a build and must not stack, because "cast it twice" is the
//     first thing a player tries.
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ')) }, Math, performance, addEventListener() { }, setTimeout,
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'build'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const run = src => vm.runInContext(src, ctx);
const json = src => JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));
const DATA = run('DATA'), AI_SCRIPTS = run('AI_SCRIPTS'), AI_COMP = run('AI_COMP'), AI_RESEARCH = run('AI_RESEARCH');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

// The twelve, as the design document names them. `fold` says the item shipped as an upgrade to a unit
// that already existed rather than as a def of its own -- the judgement DESIGN-M12 asks for -- and the
// list is here so a later change that quietly turns a fold into a clone has to edit this line.
const NEW_UNITS = ['sentry', 'immortal', 'colossus', 'disruptor', 'warp_prism', 'phoenix', 'oracle', 'void_ray', 'tempest', 'mothership'];
const FOLDS = { stalker: 'blink' };
const NEW_BUILDINGS = ['warp_gate'];
const NEW_TECHS = ['blink', 'warp_gate_tech'];
const NEW_ABILITIES = ['blink', 'force_field', 'guardian_shield', 'graviton_beam', 'revelation', 'purification_nova',
  'time_warp', 'chrono_boost', 'summon_mothership', 'warp_zealot', 'warp_dragoon', 'warp_sentry', 'warp_high_templar', 'warp_dark_templar'];

// ============================================================================ 1. the defs
console.log('--- defs, costs and the tech tree ---');
{
  const missing = NEW_UNITS.filter(id => !DATA.units[id]).concat(NEW_BUILDINGS.filter(id => !DATA.buildings[id]));
  ok(!missing.length, 'all ten units and the Warp Gate are defined', missing.join(', '));
  ok(NEW_TECHS.every(id => DATA.techs[id]), 'Blink and Warp Gate are researchable techs');
  const noAb = NEW_ABILITIES.filter(id => !DATA.abilities[id]);
  ok(!noAb.length, 'every new ability has a def', noAb.join(', '));
  ok(NEW_UNITS.every(id => DATA.units[id].race === 'P') && DATA.buildings.warp_gate.race === 'P', 'and every one of them is Protoss');

  // `undefined * n` is NaN and this repository has lost an afternoon to it twice -- a spider mine with
  // no cost gave a repaired unit NaN hit points that spread through every comparison they touched.
  // Anything a cost calculation reads must be a number, spelled out, including on the Mothership,
  // which is merged rather than built and is therefore exactly the def somebody would leave blank.
  const badCost = NEW_UNITS.concat(NEW_BUILDINGS).filter(id => { const d = DATA.all[id]; return typeof d.min !== 'number' || typeof d.gas !== 'number'; });
  ok(!badCost.length, 'min and gas are spelled out as numbers on every new def, Mothership included', badCost.join(', '));

  // The reachability closure, the same shape test/techtree.js runs over the whole tree, asked only of
  // the new defs: start from a Nexus and nothing else, and see whether they turn up.
  const have = new Set(['nexus']), techs = new Set(), units = new Set();
  const reqMet = d => !d.req || d.req.every(r => DATA.techs[r] ? techs.has(r) : have.has(r));
  for (let i = 0; i < 40; i++) {
    let grew = false;
    for (const [id, u] of Object.entries(DATA.units)) { if (u.race !== 'P' || units.has(id)) continue; if (u.from && !have.has(u.from)) continue; if (!reqMet(u)) continue; units.add(id); grew = true; }
    for (const [id, d] of Object.entries(DATA.buildings)) {
      if (d.race !== 'P' || have.has(id) || !reqMet(d)) continue;
      if (d.tier === 'morph') { const from = Object.values(DATA.buildings).find(b => b.morphTo === id || (b.morphOptions || []).includes(id)); if (!from || !have.has(from.id)) continue; }
      have.add(id); grew = true;
    }
    for (const [id, t] of Object.entries(DATA.techs)) { if (t.race !== 'P' || techs.has(id) || !have.has(t.bld) || !reqMet(t)) continue; techs.add(id); grew = true; }
    if (!grew) break;
  }
  const unreachableU = NEW_UNITS.filter(id => !units.has(id));
  ok(!unreachableU.length, 'every new unit is reachable from a Nexus', unreachableU.join(', '));
  ok(have.has('warp_gate'), 'the Warp Gate is reachable -- a morph of the Gateway, gated on its research');
  ok(NEW_TECHS.every(id => techs.has(id)), 'both new techs are reachable');
  ok(units.has('mothership'), 'the Mothership is reachable although nothing produces it: it has no `from` and a Fleet Beacon req');

  // A fold is only a fold if the thing it replaced is genuinely absent. If somebody later adds a
  // Stalker def beside the Dragoon's blink, this is the line that says the decision was reversed.
  for (const [gone, into] of Object.entries(FOLDS)) {
    ok(!DATA.units[gone], 'the ' + gone + ' is folded, not added: no def of its own');
    ok(!!DATA.techs[into] || !!DATA.abilities[into], '...and what it folded into (' + into + ') exists');
  }
  ok((DATA.units.dragoon.abil || []).includes('blink'), 'the Dragoon is what carries Blink -- the fold is on the unit it would have duplicated');
  ok(DATA.units.mothership.abil.includes('time_warp') && !DATA.units.mothership.abil.includes('recall'),
    'the Mothership does not duplicate the Arbiter: no recall, no stasis, no cloak field');
  ok(DATA.units.arbiter.abil.includes('summon_mothership'), '...and it is made by merging two Arbiters, so you cannot have both');
  ok(DATA.buildings.warp_gate.produces.length === 0, 'a Warp Gate has no production queue at all -- that is the trade, and it is in the data');
  ok(DATA.buildings.warp_gate.w === DATA.buildings.gateway.w && DATA.buildings.warp_gate.h === DATA.buildings.gateway.h,
    'a Warp Gate has the Gateway footprint: G.morphBuilding never re-blocks the map');
  ok(DATA.buildings.warp_gate.sh === DATA.buildings.gateway.sh,
    '...and the Gateway shields, because morphBuilding updates maxHp and not maxSh');
  ok(DATA.units.colossus.fly === true, 'the Colossus flies, which is the only lever this engine has for walking over cliffs');
  ok(DATA.units.warp_prism.psi > 0, 'the Warp Prism carries `psi` -- it is a Pylon that flies, and that is what makes warp-in mobile');
  ok(DATA.buildings.nexus.abil && DATA.buildings.nexus.abil.includes('chrono_boost') && DATA.buildings.nexus.energy > 0,
    'the Nexus has an energy bar and Chrono Boost on it (item 11)');
}

// ============================================================================ 2. hotkeys and the card
console.log('\n--- command cards ---');
{
  // A duplicate hotkey on one card is a button the player cannot press, and it is invisible until
  // somebody tries. Every producer that gained units this milestone is checked whole, not just the
  // new entries -- a collision is a property of the card, not of the newcomer.
  for (const bid of ['gateway', 'robotics_facility', 'stargate', 'cybernetics_core', 'citadel_of_adun', 'warp_gate', 'nexus']) {
    const b = DATA.buildings[bid], keys = [];
    for (const u of b.produces || []) keys.push([DATA.units[u].hk, u]);
    for (const t of b.tech || []) keys.push([DATA.techs[t].hk, t]);
    for (const g of b.upg || []) keys.push([DATA.upgrades[g].hk, g]);
    for (const a of b.abil || []) keys.push([DATA.abilities[a].hk, a]);
    for (const mo of b.morphOptions || []) keys.push([DATA.buildings[mo].hk, mo]);
    const dupes = keys.filter(([k], i) => keys.findIndex(o => o[0] === k) !== i);
    ok(!dupes.length, bid + ' has no duplicate hotkey on its card (' + keys.length + ' entries)', JSON.stringify(dupes));
  }
  // Unit ability cards too: the Arbiter gained a third ability and the Dragoon its first.
  for (const uid of ['dragoon', 'arbiter', 'sentry', 'phoenix', 'oracle', 'disruptor', 'mothership']) {
    const keys = (DATA.units[uid].abil || []).map(a => DATA.abilities[a].hk);
    ok(new Set(keys).size === keys.length, uid + ' has no duplicate ability hotkey', keys.join(''));
  }
}

// ============================================================================ 3. art
console.log('\n--- art ---');
{
  // Not a substitute for test/baked.js, which owns the atlas. This is the layer BELOW it: js/sprites.js
  // falls through to `UNIT_PAINTERS[id] || UNIT_PAINTERS.marine`, so a def with no vector painter draws
  // as a marine wherever the baked sheet is missing -- including in every worktree before a bake.
  const { UNITS, BUILDINGS } = require(path.join(root, 'tools', 'models.js'));
  const noModel = NEW_UNITS.filter(id => !UNITS[id]).concat(NEW_BUILDINGS.filter(id => !BUILDINGS[id]));
  ok(!noModel.length, 'every new def has a 3D model in tools/models.js', noModel.join(', '));

  const sctx = { console: ctx.console, Math, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), TILE: 32 };
  vm.createContext(sctx);
  for (const f of ['sprites_units', 'sprites_buildings']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), sctx, { filename: f + '.js' });
  const UP = vm.runInContext('UNIT_PAINTERS', sctx), BPn = vm.runInContext('BUILDING_PAINTERS', sctx), PH = vm.runInContext('PaintHelpers', sctx);
  const noPaint = NEW_UNITS.filter(id => typeof UP[id] !== 'function').concat(NEW_BUILDINGS.filter(id => typeof BPn[id] !== 'function'));
  ok(!noPaint.length, 'and its own vector painter, so nothing falls through to the marine/depot fallback', noPaint.join(', '));

  // Exercise them. A painter that throws is a black sprite and a console full of errors, and the four
  // animation states are the ones js/sprites.js actually asks for.
  const stub = () => ({ beginPath() { }, ellipse() { }, fill() { }, stroke() { }, arc() { }, moveTo() { }, lineTo() { }, closePath() { }, roundRect() { }, quadraticCurveTo() { }, bezierCurveTo() { }, save() { }, restore() { }, fillRect() { }, strokeRect() { }, clearRect() { }, translate() { }, rotate() { }, scale() { }, clip() { }, setLineDash() { }, createRadialGradient: () => ({ addColorStop() { } }), createLinearGradient: () => ({ addColorStop() { } }) });
  const STATES = [{ walk: null, atk: null, idle: 0 }, { walk: 0.5, atk: null, idle: null }, { walk: null, atk: 0.4, idle: null }, { walk: null, atk: null, idle: null }];
  let threw = null;
  for (const id of NEW_UNITS) { const c = stub(), h = PH(c); try { for (const st of STATES) UP[id](h, DATA.units[id].r, '#f40404', '#900202', st); } catch (e) { threw = id + ': ' + e.message; break; } }
  for (const id of NEW_BUILDINGS) { const c = stub(), h = PH(c); try { BPn[id](h, c, DATA.buildings[id].w * 32, DATA.buildings[id].h * 32, '#f40404', '#900202'); } catch (e) { threw = id + ': ' + e.message; break; } }
  ok(!threw, 'every new painter runs clean in idle, walk, attack and rest', threw || '');
}

// ============================================================================ 4. the AI knows about them
console.log('\n--- the computer opponent ---');
{
  const aiSrc = fs.readFileSync(path.join(root, 'js', 'ai.js'), 'utf8');
  // A unit something PRODUCES has to be in the composition table or production() will never score it.
  const produced = NEW_UNITS.filter(id => DATA.units[id].from);
  for (const key of ['P', 'PvZ']) {
    const missing = produced.filter(id => !AI_COMP[key].some(([x]) => x === id));
    ok(!missing.length, 'AI_COMP.' + key + ' names every new Protoss unit that has a producer', missing.join(', '));
  }
  // ...and one that nothing produces has to be reached some other way, or it is a def no computer
  // opponent can ever field -- exactly the M11 failure, with a merge instead of a morph.
  ok(/summon_mothership/.test(aiSrc), 'the Mothership has no producer, so the AI merges it explicitly in js/ai.js');
  ok(AI_SCRIPTS.P.some(([, id]) => id === 'warp_gate'), 'the Warp Gate is in the Protoss build script');
  {
    const s = AI_SCRIPTS.P, bad = [];
    for (let i = 1; i < s.length; i++) if (s[i][0] < s[i - 1][0]) bad.push(s[i - 1][1] + '@' + s[i - 1][0] + ' then ' + s[i][1] + '@' + s[i][0]);
    ok(!bad.length, '...and the script is still in ascending supply order after the insertion', bad.join('; '));
  }
  const noRes = NEW_TECHS.filter(id => !AI_RESEARCH.P.includes(id));
  ok(!noRes.length, 'AI_RESEARCH.P researches Blink and Warp Gate', noRes.join(', '));
  // Every ability the AI could press has to appear somewhere in its source, or it is a spell with a
  // command-card button and nothing that ever pushes it -- which is 21 of the 28 spells M9 found.
  const castable = ['blink', 'force_field', 'guardian_shield', 'graviton_beam', 'revelation', 'purification_nova', 'time_warp', 'chrono_boost'];
  const unpressed = castable.filter(id => !new RegExp("'" + id + "'").test(aiSrc));
  ok(!unpressed.length, 'the AI has a line that presses every new spell', unpressed.join(', '));
  ok(/warp_' \+ best|'warp_'/.test(aiSrc), '...and warps units in, which is the only way a Warp Gate makes anything');
}

// ============================================================================ the rig
run(`(() => {
  this.setup = () => {
    G.init({ players: [{ race: 'P', human: true, name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 7, layout: 'temple' });
    for (const p of G.players) { p.ai = null; p.minerals = 5000; p.gas = 5000; }
    G.recording = false;
    // A patch of ground with nothing on it, found rather than assumed: the layouts differ and a
    // hard-coded corner is how a test starts failing on somebody else's map change.
    const m = G.map; let found = null;
    for (let ty = 4; ty < m.h - 16 && !found; ty++) for (let tx = 4; tx < m.w - 16; tx++) {
      let clear = true;
      for (let y = ty; y < ty + 12 && clear; y++) for (let x = tx; x < tx + 12; x++) if (!m.walkable(x, y) || m.height[m.idx(x, y)] !== 0) { clear = false; break; }
      if (clear) { found = [tx, ty]; break; }
    }
    this.field = found;
    return !!found;
  };
  this.mkB = (id, owner, tx, ty) => {
    const d = DATA.buildings[id];
    const b = G.placeBuilding(d, tx, ty, owner);
    b.progress = d.time; G.completeBuilding(b);
    b.hp = b.maxHp; b.sh = b.maxSh; if (b.maxEnergy) b.energy = b.maxEnergy;
    return b;
  };
  this.ticks = n => { for (let i = 0; i < n; i++) G.tick(); };
  this.setup();
})();`);
const F = json('this.field');
ok(!!F, 'the rig found twelve clear tiles of flat ground to work on', JSON.stringify(F));

// ============================================================================ 5. warp-in and the psi grid
console.log('\n--- warp-in (item 12) ---');
{
  const r = json(`(() => {
    this.setup();
    const [fx, fy] = this.field, p = G.players[0], m = G.map;
    const py = this.mkB('pylon', 0, fx + 2, fy + 2);
    const gate = this.mkB('warp_gate', 0, fx + 4, fy + 4);   // inside the pylon's 6.5x4.55 ellipse: a warp gate needsPsi like every Protoss structure
    this.ticks(2);
    const out = { unpowered: !!gate.unpowered };
    // A tile the pylon covers, and one it does not. hasPsi is the same query a Protoss building makes
    // every tick to decide whether it is powered, which is the point: there is no second grid.
    const inTile = [fx + 2, fy + 4], outTile = [fx + 11, fy + 11];
    out.inPsi = m.hasPsi(0, inTile[0], inTile[1]);
    out.outPsi = m.hasPsi(0, outTile[0], outTile[1]);

    // 1. a warp on to unpowered ground is refused, and costs nothing
    const before = { min: p.minerals, n: G.units.filter(u => u.alive && u.def.id === 'zealot').length, cd: gate.cooldown };
    Abilities.issue(gate, 'warp_zealot', null, (outTile[0] + .5) * TILE, (outTile[1] + .5) * TILE);
    out.refused = { min: p.minerals === before.min, n: G.units.filter(u => u.alive && u.def.id === 'zealot').length, cd: gate.cooldown };

    // 2. a warp inside the field lands, costs, forms, and puts the gate on a recharge
    Abilities.issue(gate, 'warp_zealot', null, (inTile[0] + .5) * TILE, (inTile[1] + .5) * TILE);
    const z = G.units.filter(u => u.alive && u.def.id === 'zealot');
    out.landed = z.length;
    if (z.length) { const u = z[0]; out.morphT = u.morphT; out.disabled = !!u.disabled; out.onPsi = m.hasPsi(0, Math.floor(u.x / TILE), Math.floor(u.y / TILE)); }
    out.spent = before.min - p.minerals;
    out.cd = gate.cooldown;
    out.expectCd = Math.round(DATA.units.zealot.time * 1.25);

    // 3. a second warp while it is recharging is refused
    const m2 = p.minerals;
    Abilities.issue(gate, 'warp_zealot', null, (inTile[0] + .5) * TILE, (inTile[1] + .5) * TILE);
    out.second = { n: G.units.filter(u => u.alive && u.def.id === 'zealot').length, free: p.minerals === m2 };

    // 4. and the warping unit wakes up on schedule
    this.ticks(70);
    const z2 = G.units.filter(u => u.alive && u.def.id === 'zealot')[0];
    out.woke = !!z2 && z2.morphT <= 0 && !z2.disabled;

    // 5. every tile a warp could pick is inside the grid. Sweep the whole clear field and cast at
    //    each tile; whatever lands must be standing on powered ground, which is the invariant.
    // Each landing is cleared away again before the next: without that the sweep runs the player out
    // of supply about a third of the way through and stops silently, which is exactly the shape of a
    // vacuous test -- it passed a deliberately broken build because the tiles it never reached were
    // the unpowered ones. The cast count is asserted separately for the same reason.
    gate.cooldown = 0; p.minerals = 99999; p.gas = 99999;
    let offGrid = 0, casts = 0, refusals = 0;
    for (let y = fy; y < fy + 12; y++) for (let x = fx; x < fx + 12; x++) {
      gate.cooldown = 0;
      const n0 = G.units.filter(u => u.alive && u.def.id === 'zealot').length;
      Abilities.issue(gate, 'warp_zealot', null, (x + .5) * TILE, (y + .5) * TILE);
      const list = G.units.filter(u => u.alive && u.def.id === 'zealot');
      if (list.length > n0) {
        casts++; const u = list[list.length - 1];
        if (!m.hasPsi(0, Math.floor(u.x / TILE), Math.floor(u.y / TILE))) offGrid++;
        G.kill(u, null, true); G.units = G.units.filter(z => z.alive); G.recomputeSupply();
      } else refusals++;
    }
    out.sweep = { casts, offGrid, refusals, tiles: 144 };
    return out;
  })()`);
  ok(r.unpowered === false, 'a Warp Gate inside a pylon field is powered');
  ok(r.inPsi === true && r.outPsi === false, 'the rig has one powered tile and one unpowered one to aim at', JSON.stringify([r.inPsi, r.outPsi]));
  ok(r.refused.n === 0 && r.refused.min && r.refused.cd === 0, 'a warp to UNPOWERED ground is refused: nothing spawns, nothing is spent, the gate does not recharge', JSON.stringify(r.refused));
  ok(r.landed === 1, 'a warp inside the psi field lands a unit', JSON.stringify(r.landed));
  ok(r.onPsi === true, '...on powered ground');
  ok(r.spent === DATA.units.zealot.min, '...for the unit\'s own price', String(r.spent));
  ok(r.morphT > 0 && r.disabled === true, '...helpless while it forms, which is the risk half of the mechanic', JSON.stringify([r.morphT, r.disabled]));
  ok(r.cd === r.expectCd, '...and the gate recharges for a quarter longer than training it would have taken', JSON.stringify([r.cd, r.expectCd]));
  ok(r.second.n === 1 && r.second.free, 'a second warp while recharging is refused and costs nothing', JSON.stringify(r.second));
  ok(r.woke === true, 'the warped-in unit wakes up when its form time runs out');
  ok(r.sweep.casts > 12 && r.sweep.refusals > 12, 'the sweep reached both kinds of ground: some warps landed and some were refused', JSON.stringify(r.sweep));
  ok(r.sweep.casts + r.sweep.refusals === r.sweep.tiles, '...and it did not stop early -- every one of the 144 tiles was tried', JSON.stringify(r.sweep));
  ok(r.sweep.offGrid === 0, 'EVERY warp over the 12x12 sweep landed inside the psi grid, including at its edge', JSON.stringify(r.sweep));
}

// ============================================================================ 6. force fields
console.log('\n--- force field: terrain with a timer ---');
{
  const r = json(`(() => {
    this.setup();
    const [fx, fy] = this.field, m = G.map;
    const s = G.spawnUnit('sentry', 0, (fx + 1.5) * TILE, (fy + 6.5) * TILE);
    s.energy = 200;
    const cx = (fx + 6.5) * TILE, cy = (fy + 6.5) * TILE;
    const out = { before: m.walkable(fx + 6, fy + 6) };
    // Path across the spot before the wall goes up, so the "it moved pathing" check is a comparison
    // and not an assertion about one map.
    const p0 = G.pf.find(fx + 1, fy + 6, fy === undefined ? 0 : fx + 11, fy + 6, 5000);
    out.pathBefore = p0.length;
    Abilities.cast(s, 'force_field', null, cx, cy);
    const f = G.fields.find(z => z.kind === 'force_field');
    out.raised = !!f; out.tiles = f ? f.tiles.length : 0; out.life = f ? f.t : 0;
    out.blocked = !m.walkable(fx + 6, fy + 6);
    out.sentinel = f ? f.tiles.every(i => m.walk[i] === 0) : false;
    const p1 = G.pf.find(fx + 1, fy + 6, fx + 11, fy + 6, 5000);
    out.pathThrough = f ? p1.some(([x, y]) => f.tiles.includes(m.idx(x, y))) : true;
    out.pathReaches = p1.length ? (p1[p1.length - 1][0] === fx + 11 && p1[p1.length - 1][1] === fy + 6) : false;

    // ---- the snapshot round trip, which is the whole reason this is not a plain timer ----
    this.ticks(100);
    const midT = G.fields.find(z => z.kind === 'force_field').t;
    const snap = Snapshot.take();
    this.ticks(60);
    const laterT = G.fields.find(z => z.kind === 'force_field').t;
    Snapshot.restore(snap);
    const back = G.fields.find(z => z.kind === 'force_field');
    out.round = { midT, laterT, restoredT: back ? back.t : null, stillBlocked: !m.walkable(fx + 6, fy + 6), tiles: back ? back.tiles.length : 0 };

    // ...and it expires on EXACTLY the frame the restored state says, counted from the restored state
    // so the snapshot and the schedule are one assertion rather than two. The loose version of this --
    // "tick past the end and check it is gone" -- passes a build whose countdown lives outside the
    // snapshot, because a field that expires SIXTY FRAMES EARLY than it should is still gone by then.
    // That is precisely the desync js/map.js's sandstorm comment is about, so it is pinned on both
    // sides: one frame short it must still be standing, one frame later it must not.
    const left = back.t;
    this.ticks(left - 1);
    out.stillUpOneShort = G.fields.some(z => z.kind === 'force_field') && !m.walkable(fx + 6, fy + 6);
    this.ticks(1);
    out.gone = !G.fields.some(z => z.kind === 'force_field');
    out.walkableAgain = m.walkable(fx + 6, fy + 6);
    out.blockedFree = m.blocked[m.idx(fx + 6, fy + 6)] === -1;
    return out;
  })()`);
  ok(r.before === true, 'the ground under the test starts walkable');
  ok(r.raised && r.tiles >= 5, 'a force field claims a plug of tiles', JSON.stringify([r.raised, r.tiles]));
  ok(r.blocked === true && r.sentinel === true, 'and every one of them stops being walkable', JSON.stringify([r.blocked, r.sentinel]));
  ok(r.pathThrough === false, 'PATHING moves: a path across the gap no longer crosses a single force-field tile');
  ok(r.pathReaches === true, '...and still gets there, so the barrier redirects rather than strands');
  ok(r.round.midT > r.round.laterT, 'the timer runs down while the game runs', JSON.stringify(r.round));
  ok(r.round.restoredT === r.round.midT, 'a snapshot restore brings back the EXACT remaining time, not a fresh one', JSON.stringify(r.round));
  ok(r.round.stillBlocked === true && r.round.tiles >= 5, '...with its tiles still impassable and its tile list intact', JSON.stringify(r.round));
  ok(r.stillUpOneShort === true, 'one frame short of the restored countdown the barrier is still standing');
  ok(r.gone === true, '...and one frame later it is gone: the expiry frame survives the restore exactly');
  ok(r.walkableAgain === true && r.blockedFree === true, '...and gives the ground back, walk and blocked both', JSON.stringify([r.walkableAgain, r.blockedFree]));

  // Determinism: the same cast on the same frame from two fresh games must claim the same tiles. A
  // force field that picked its ground from G.rand() would still pass everything above.
  const d = json(`(() => {
    const go = () => { this.setup(); const [fx, fy] = this.field; const s = G.spawnUnit('sentry', 0, (fx + 1.5) * TILE, (fy + 6.5) * TILE); s.energy = 200; this.ticks(37); Abilities.cast(s, 'force_field', null, (fx + 6.5) * TILE, (fy + 6.5) * TILE); const f = G.fields.find(z => z.kind === 'force_field'); return f ? f.tiles.slice().sort((a, b) => a - b) : []; };
    const a = go(), b = go();
    return { a: a.length, same: JSON.stringify(a) === JSON.stringify(b) };
  })()`);
  ok(d.a > 0 && d.same, 'two identical games raise an identical force field -- nothing about it is sampled', JSON.stringify(d));
}

// ============================================================================ 7. blink
console.log('\n--- blink: the folded Stalker ---');
{
  const r = json(`(() => {
    this.setup();
    const [fx, fy] = this.field, m = G.map, p = G.players[0];
    p.tech.add('blink');
    const d = G.spawnUnit('dragoon', 0, (fx + 1.5) * TILE, (fy + 6.5) * TILE);
    const out = {};

    // 1. a plain short hop over open ground
    Abilities.cast(d, 'blink', null, (fx + 5.5) * TILE, (fy + 6.5) * TILE);
    out.hop = { tx: Math.floor(d.x / TILE), ty: Math.floor(d.y / TILE), want: [fx + 5, fy + 6] };
    out.stamped = d.blinkAt === G.frame;

    // 2. the rate limit
    const at = [d.x, d.y];
    Abilities.cast(d, 'blink', null, (fx + 8.5) * TILE, (fy + 6.5) * TILE);
    out.recharging = d.x === at[0] && d.y === at[1];
    G.frame += 240;
    Abilities.cast(d, 'blink', null, (fx + 8.5) * TILE, (fy + 6.5) * TILE);
    out.afterCooldown = Math.floor(d.x / TILE) === fx + 8;

    // 3. THE ONE THAT MATTERS. Wall off a single walkable tile completely: it is legal ground, it is
    //    within range, and no ground unit could ever walk to it. A destination test that only asked
    //    "is this tile walkable" would teleport straight into the pocket.
    const pocket = [fx + 3, fy + 2];
    for (let y = pocket[1] - 1; y <= pocket[1] + 1; y++) for (let x = pocket[0] - 1; x <= pocket[0] + 1; x++) { if (x === pocket[0] && y === pocket[1]) continue; m.walk[m.idx(x, y)] = 0; }
    out.pocketWalkable = m.walkable(pocket[0], pocket[1]);
    G.frame += 240;
    const was = [Math.floor(d.x / TILE), Math.floor(d.y / TILE)];
    Abilities.cast(d, 'blink', null, (pocket[0] + .5) * TILE, (pocket[1] + .5) * TILE);
    out.sealed = { tx: Math.floor(d.x / TILE), ty: Math.floor(d.y / TILE), was };
    out.refusedPocket = !(Math.floor(d.x / TILE) === pocket[0] && Math.floor(d.y / TILE) === pocket[1]);
    out.notCharged = d.blinkAt !== G.frame;

    // 4. ...but a wall it could walk AROUND is still worth blinking over. Open one side of the pocket.
    m.walk[m.idx(pocket[0], pocket[1] + 1)] = 1;
    G.frame += 240;
    Abilities.cast(d, 'blink', null, (pocket[0] + .5) * TILE, (pocket[1] + .5) * TILE);
    out.openedPocket = Math.floor(d.x / TILE) === pocket[0] && Math.floor(d.y / TILE) === pocket[1];

    // 5. and never on to a tile that is not ground at all
    G.frame += 240;
    const solid = [pocket[0] - 1, pocket[1]];
    const before = [Math.floor(d.x / TILE), Math.floor(d.y / TILE)];
    Abilities.cast(d, 'blink', null, (solid[0] + .5) * TILE, (solid[1] + .5) * TILE);
    out.refusedSolid = Math.floor(d.x / TILE) === before[0] && Math.floor(d.y / TILE) === before[1];
    return out;
  })()`);
  ok(r.hop.tx === r.hop.want[0] && r.hop.ty === r.hop.want[1], 'blink puts the dragoon on the tile it was aimed at', JSON.stringify(r.hop));
  ok(r.stamped === true, '...and stamps the frame it happened, which is what rate-limits it');
  ok(r.recharging === true, 'a second blink inside the cooldown does nothing');
  ok(r.afterCooldown === true, '...and works again once it has run');
  ok(r.pocketWalkable === true, 'the sealed pocket is genuinely walkable ground -- otherwise the next check is vacuous');
  ok(r.refusedPocket === true, 'BLINK REFUSES a walkable tile no ground unit could ever walk to', JSON.stringify(r.sealed));
  ok(r.notCharged === true, '...and a refused blink does not spend the cooldown');
  ok(r.openedPocket === true, 'but the same tile becomes legal the moment there is a way round to it');
  ok(r.refusedSolid === true, 'and blink never lands on unwalkable ground');
}

// ============================================================================ 8. chrono boost
console.log('\n--- chrono boost (item 11) ---');
{
  const r = json(`(() => {
    const rig = boost => {
      this.setup();
      const [fx, fy] = this.field, p = G.players[0];
      this.mkB('pylon', 0, fx + 2, fy + 2);
      const g = this.mkB('gateway', 0, fx + 5, fy + 5);
      const nx = this.mkB('nexus', 0, fx + 8, fy + 1);
      nx.energy = 200;
      this.ticks(2);
      G.queueUnit(g, 'zealot');
      this.ticks(1);
      const e0 = nx.energy;   // BEFORE the cast: a Nexus at full energy regenerates while the ticks run, so measuring after hides the spend
      if (boost) Abilities.issue(nx, 'chrono_boost', null, g.x, g.y);
      const e1 = nx.energy;
      this.ticks(120);
      const it = g.prod[0];
      return { progress: it ? it.progress : 9999, energy: e0 - e1, chronos: G.fields.filter(f => f.kind === 'chrono').length };
    };
    const plain = rig(false), fast = rig(true);

    // ...and the stacking question, which is the first thing a player tries.
    this.setup();
    const [fx, fy] = this.field, p = G.players[0];
    this.mkB('pylon', 0, fx + 2, fy + 2);
    const g = this.mkB('gateway', 0, fx + 5, fy + 5);
    const a = this.mkB('nexus', 0, fx + 8, fy + 1), b = this.mkB('nexus', 0, fx + 8, fy + 6);
    a.energy = 200; b.energy = 200;
    this.ticks(2);
    G.queueUnit(g, 'zealot');
    this.ticks(1);
    Abilities.issue(a, 'chrono_boost', null, g.x, g.y);
    const eB = b.energy;
    Abilities.issue(b, 'chrono_boost', null, g.x, g.y);   // a SECOND Nexus, on the same building
    const stack = { fields: G.fields.filter(f => f.kind === 'chrono').length, refunded: b.energy === eB };
    const p0 = g.prod[0].progress; this.ticks(120); stack.rate = (g.prod[0].progress - p0) / 120;

    // the boost dies with its building rather than lingering as a field pointing at a corpse
    G.kill(g, null, true); this.ticks(2);
    stack.cleared = G.fields.filter(f => f.kind === 'chrono').length;
    return { plain, fast, stack };
  })()`);
  ok(r.plain.progress > 0, 'the control build makes progress at all', JSON.stringify(r.plain));
  ok(r.fast.progress > r.plain.progress, 'CHRONO BOOST SHORTENS A BUILD: the boosted queue is further along', JSON.stringify([r.plain.progress, r.fast.progress]));
  ok(Math.abs(r.fast.progress - r.plain.progress * 2) <= 4, '...by exactly doubling it, which is one extra unit of progress a frame', JSON.stringify([r.plain.progress, r.fast.progress]));
  ok(r.fast.energy === DATA.abilities.chrono_boost.energy, 'and it costs the Nexus its energy', JSON.stringify(r.fast.energy));
  ok(r.plain.chronos === 0 && r.fast.chronos === 1, 'one boost, one field', JSON.stringify([r.plain.chronos, r.fast.chronos]));
  ok(r.stack.fields === 1, 'CHRONO BOOST CANNOT STACK: a second cast on the same building makes no second field', JSON.stringify(r.stack));
  ok(r.stack.refunded === true, '...and the refused caster keeps its energy');
  ok(Math.abs(r.stack.rate - 2) < 0.05, '...so the boosted rate is 2 progress a frame and not 3', String(r.stack.rate));
  ok(r.stack.cleared === 0, 'a boost whose building dies clears itself instead of pointing at a corpse', String(r.stack.cleared));
}

// ============================================================================ 9. the rest of the spell book
console.log('\n--- the remaining new spells ---');
{
  const r = json(`(() => {
    this.setup();
    const [fx, fy] = this.field, out = {};
    const enemyAt = (id, x, y) => { const u = G.spawnUnit(id, 1, x, y); u.hp = u.maxHp; return u; };

    // guardian shield: a bubble of absorbed damage over the units nearby, not over the enemy
    const s = G.spawnUnit('sentry', 0, (fx + 4.5) * TILE, (fy + 4.5) * TILE); s.energy = 200;
    const friend = G.spawnUnit('zealot', 0, (fx + 5.5) * TILE, (fy + 4.5) * TILE);
    const foe = enemyAt('marine', (fx + 5.5) * TILE, (fy + 5.5) * TILE);
    G.rebuildGrid();
    Abilities.instant(s, 'guardian_shield');
    out.shield = { friend: !!friend.fx.matrix, foe: !!foe.fx.matrix, energy: 200 - s.energy };

    // graviton beam: a ground unit is held, an air unit is not a legal target
    const ph = G.spawnUnit('phoenix', 0, (fx + 6.5) * TILE, (fy + 6.5) * TILE); ph.energy = 200;
    const gnd = enemyAt('marine', (fx + 7.5) * TILE, (fy + 6.5) * TILE);
    const air = enemyAt('wraith', (fx + 7.5) * TILE, (fy + 7.5) * TILE);
    Abilities.cast(ph, 'graviton_beam', gnd, gnd.x, gnd.y);
    out.lifted = { held: gnd.fx.maelstrom > 0, disabled: !!gnd.disabled };
    const e0 = ph.energy;
    Abilities.cast(ph, 'graviton_beam', air, air.x, air.y);
    out.liftAir = { held: air.fx.maelstrom > 0, refunded: ph.energy >= e0 };

    // purification nova: a fuse, and it hits everything -- including the caster's own army
    const dz = G.spawnUnit('disruptor', 0, (fx + 2.5) * TILE, (fy + 9.5) * TILE); dz.energy = 200;
    const mine = G.spawnUnit('zealot', 0, (fx + 5.5) * TILE, (fy + 9.5) * TILE);
    const theirs = enemyAt('marine', (fx + 5.5) * TILE, (fy + 9.7) * TILE);
    G.rebuildGrid();
    const hp0 = { mine: mine.hp + mine.sh, theirs: theirs.hp };
    Abilities.cast(dz, 'purification_nova', null, (fx + 5.5) * TILE, (fy + 9.6) * TILE);
    out.fuse = { armed: G.fields.some(f => f.kind === 'nova'), instant: (mine.hp + mine.sh) === hp0.mine };
    this.ticks(65);
    out.nova = { hitTheirs: theirs.hp < hp0.theirs || !theirs.alive, hitMine: (mine.hp + mine.sh) < hp0.mine || !mine.alive, gone: !G.fields.some(f => f.kind === 'nova') };

    // time warp: enemies inside are slowed, allies are not, flyers are exempt
    this.setup();
    const [gx, gy] = this.field;
    const ms = G.spawnUnit('mothership', 0, (gx + 2.5) * TILE, (gy + 2.5) * TILE); ms.energy = 200;
    const slowMe = G.spawnUnit('marine', 1, (gx + 6.5) * TILE, (gy + 6.5) * TILE);
    const ally = G.spawnUnit('zealot', 0, (gx + 6.6) * TILE, (gy + 6.5) * TILE);
    const flyer = G.spawnUnit('wraith', 1, (gx + 6.7) * TILE, (gy + 6.5) * TILE);
    G.rebuildGrid();
    Abilities.cast(ms, 'time_warp', null, (gx + 6.5) * TILE, (gy + 6.5) * TILE);
    this.ticks(3);
    out.warp = { enemy: slowMe.fx.ensnare > 0, ally: !(ally.fx.ensnare > 0), flyer: !(flyer.fx.ensnare > 0) };

    // revelation: a scan field, which is the Comsat's own kind reused
    const orc = G.spawnUnit('oracle', 0, (gx + 3.5) * TILE, (gy + 3.5) * TILE); orc.energy = 200;
    Abilities.cast(orc, 'revelation', null, (gx + 9.5) * TILE, (gy + 9.5) * TILE);
    out.reveal = G.fields.some(f => f.kind === 'scan' && f.owner === 0);

    // and the mothership merge consumes both arbiters
    this.setup();
    const a1 = G.spawnUnit('arbiter', 0, (gx + 3.5) * TILE, (gy + 3.5) * TILE);
    const a2 = G.spawnUnit('arbiter', 0, (gx + 3.8) * TILE, (gy + 3.5) * TILE);
    G.players[0].supMax = 200;
    Abilities.merge([a1, a2], 'summon_mothership');
    this.ticks(20);
    out.merge = { gone: !a1.alive && !a2.alive, made: G.units.filter(u => u.alive && u.def.id === 'mothership').length };
    return out;
  })()`);
  ok(r.shield.friend && !r.shield.foe, 'Guardian Shield bubbles the caster\'s own units and not the enemy', JSON.stringify(r.shield));
  ok(r.shield.energy === DATA.abilities.guardian_shield.energy, '...for its stated energy', String(r.shield.energy));
  ok(r.lifted.held && r.lifted.disabled, 'Graviton Beam holds a ground unit and takes it out of the fight', JSON.stringify(r.lifted));
  ok(!r.liftAir.held && r.liftAir.refunded, '...and refuses an air target without eating the energy', JSON.stringify(r.liftAir));
  ok(r.fuse.armed && r.fuse.instant, 'Purification Nova arms a fuse and does nothing at all on the frame it is cast', JSON.stringify(r.fuse));
  ok(r.nova.hitTheirs && r.nova.gone, '...then detonates and clears itself', JSON.stringify(r.nova));
  ok(r.nova.hitMine, '...and it hits the caster\'s own army too, exactly as Psionic Storm does');
  ok(r.warp.enemy && r.warp.ally && r.warp.flyer, 'Time Warp slows enemy ground units only', JSON.stringify(r.warp));
  ok(r.reveal, 'Revelation puts a scan field down -- the Comsat\'s own field kind, reused');
  ok(r.merge.gone && r.merge.made === 1, 'two Arbiters merge into exactly one Mothership and are consumed', JSON.stringify(r.merge));
}

// ============================================================================ 10. the mobile pylon
console.log('\n--- the Warp Prism as a mobile pylon ---');
{
  const r = json(`(() => {
    this.setup();
    const [fx, fy] = this.field, m = G.map;
    const wp = G.spawnUnit('warp_prism', 0, (fx + 3.5) * TILE, (fy + 3.5) * TILE);
    const out = { start: m.hasPsi(0, fx + 3, fy + 3) };
    this.ticks(13);
    out.projects = m.hasPsi(0, fx + 3, fy + 3);
    out.far = m.hasPsi(0, fx + 10, fy + 10);
    // fly it across the field and the grid follows
    wp.x = (fx + 10.5) * TILE; wp.y = (fy + 10.5) * TILE;
    this.ticks(13);
    out.moved = { there: m.hasPsi(0, fx + 10, fy + 10), gone: !m.hasPsi(0, fx + 3, fy + 3) };
    // and it takes the field with it when it dies
    G.kill(wp, null, true);
    this.ticks(13);
    out.dead = !m.hasPsi(0, fx + 10, fy + 10);
    return out;
  })()`);
  ok(r.projects === true, 'a Warp Prism projects psi with no pylon anywhere near it');
  ok(r.far === false, '...over a radius, not the whole map');
  ok(r.moved.there && r.moved.gone, 'and the power grid follows it when it moves', JSON.stringify(r.moved));
  ok(r.dead === true, '...and goes out when it dies');
}

// ============================================================================ 11. determinism and the stamp
console.log('\n--- determinism ---');
{
  // Two runs of the same seed doing the same Protoss things must agree bit for bit. This is the check
  // that would fail if anything above had reached for Math.random() or a wall clock.
  const r = json(`(() => {
    const go = () => {
      this.setup();
      const [fx, fy] = this.field, p = G.players[0];
      p.tech.add('blink');
      this.mkB('pylon', 0, fx + 2, fy + 2);
      const g = this.mkB('warp_gate', 0, fx + 6, fy + 6);
      const s = G.spawnUnit('sentry', 0, (fx + 1.5) * TILE, (fy + 6.5) * TILE); s.energy = 200;
      const dz = G.spawnUnit('disruptor', 0, (fx + 2.5) * TILE, (fy + 8.5) * TILE); dz.energy = 200;
      this.ticks(4);
      Abilities.issue(g, 'warp_zealot', null, (fx + 2.5) * TILE, (fy + 4.5) * TILE);
      Abilities.cast(s, 'force_field', null, (fx + 6.5) * TILE, (fy + 3.5) * TILE);
      Abilities.cast(dz, 'purification_nova', null, (fx + 8.5) * TILE, (fy + 8.5) * TILE);
      this.ticks(200);
      return G.stateHash();
    };
    return { a: go(), b: go() };
  })()`);
  ok(r.a === r.b, 'two identical Protoss runs produce the same state hash', JSON.stringify(r));

  // THE BUILD STAMP HAS TO HAVE MOVED for this work. All four files it changed -- data.js, ai.js,
  // abilities.js, map.js -- are simulation, and a stamp that did not move means a save recorded before
  // this milestone loads into it and drifts quietly, which is the exact failure js/build.js exists to
  // prevent. There is no earlier build to compare against from inside a test, so the property that IS
  // checkable is the one that matters: perturb the thing each of those four files contributed and
  // watch the digest move. If any of the four came back unchanged, the stamp is blind to that file and
  // the change would ship without moving it.
  //
  // js/build.js hashes by OBJECT NAME, not by filename (DATA, AI_SCRIPTS, Abilities, GameMap.prototype
  // and so on), so the perturbations are on the objects rather than on the text.
  const stamp = json(`(() => {
    const bust = () => { BUILD._hash = null; return BUILD.hash(); };
    const base = bust(), out = { base };
    const h = DATA.units.sentry.hp; DATA.units.sentry.hp = h + 1; out.data = bust(); DATA.units.sentry.hp = h;
    AI_SCRIPTS.P.push([999, 'pylon']); out.ai = bust(); AI_SCRIPTS.P.pop();
    const bl = Abilities.blinkReach; delete Abilities.blinkReach; out.abil = bust(); Abilities.blinkReach = bl;
    const ff = GameMap.prototype.raiseForceField; delete GameMap.prototype.raiseForceField; out.map = bust(); GameMap.prototype.raiseForceField = ff;
    out.restored = bust();
    return out;
  })()`);
  for (const [k, what] of [['data', 'js/data.js (the defs)'], ['ai', 'js/ai.js (the build script)'], ['abil', 'js/abilities.js (blink)'], ['map', 'js/map.js (the force-field terrain)']])
    ok(stamp[k] !== stamp.base, 'the build stamp moves when ' + what + ' changes', stamp[k] + ' vs ' + stamp.base);
  ok(stamp.restored === stamp.base, '...and comes back to the same digest once the perturbations are undone', stamp.restored + ' vs ' + stamp.base);
}

ok(errors.length === 0, 'no JS errors anywhere in the run', errors[0] || '');
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
