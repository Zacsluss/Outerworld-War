// M12 wave four, the Terran half: fifteen new entries, the MULE (item 11), the Reactor and the Viking.
//   node test/terran12.js [--verbose]
//
// What this test is FOR. `test/techtree.js`, `test/aiscripts.js`, `test/rates.js`, `test/card.js` and
// `test/codex.js` are all strict about new defs already, and between them they cover reachability,
// script ordering, rate of fire, card overflow and the manual. What none of them can see is the class
// of failure this milestone is most likely to produce, which is a def that is PRESENT and INERT:
//
//   * a unit in the tech tree that no computer opponent has any route to (M11 shipped nine of those)
//   * a morph in a build script whose source the AI cannot resolve (M11 shipped three of those)
//   * an add-on that is built, drawn, and does nothing, because the thing it is supposed to do lives
//     in a file nobody wired it into
//   * a temporary unit that turns out not to be temporary
//   * a two-mode unit where one mode has no weapon that can reach anything
//
// Every one of those passes every other check in this repository. So the assertions here are about
// EFFECT: the Reactor is timed against a Barracks without one, the MULE is watched until it dies, the
// Viking is asked what it can shoot in each mode, and each new def is made to name the route by which
// a computer opponent gets it and then that route is verified against the actual tables.
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; if (VERBOSE || true) console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };

const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? String(x.stack).split('\n')[0] : String(x)).join(' ')) }, Math, performance, addEventListener() { }, setTimeout, setInterval() { return 0; },
  localStorage: { getItem() { return null; }, setItem() { } },
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' } };
ctx.window = ctx; vm.createContext(ctx);
// ui.js and hud.js are loaded because two checks are about the COMMAND CARD, which is where a Terran
// roster this size overflows first. They are not loaded by the sim-only harnesses.
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui', 'hud']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
const run = src => vm.runInContext(src, ctx);
const json = src => JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));

// ---------------------------------------------------------------------------------------------
// The roster, and the ROUTE each entry takes to a computer opponent's hands. Writing the route down
// per def and then verifying it is the point: "is it in an AI table" is not one question, because a
// morph, an add-on, a trained unit, a transform and an ability-spawned unit each reach the AI through
// a different mechanism, and four of the five would pass a naive "is it in AI_COMP" check by being
// absent from it for the right reason.
//
//   comp      trained: must be in AI_COMP.T or AI_COMP.TvP
//   script    a building in AI_SCRIPTS.T
//   addon     in AI_SCRIPTS.T, tier 'addon', and its parent must list it
//   morph     in AI_SCRIPTS.T, tier 'morph', and AI.prototype.morphSource must resolve it
//   transform reached by an ability the AI presses, not by being built
//   ability   spawned by an ability the AI casts
const ROSTER = {
  marauder: 'comp', reaper: 'comp', hellion: 'comp', thor: 'comp', widow_mine: 'comp', cyclone: 'comp',
  liberator: 'comp', raven: 'comp', banshee: 'comp', viking: 'comp', medivac: 'comp',
  viking_a: 'transform', mule: 'ability',
  planetary_fortress: 'morph', orbital_command: 'morph', sensor_tower: 'script', reactor: 'addon',
};
const NEW_UNITS = Object.keys(ROSTER).filter(k => !['planetary_fortress', 'orbital_command', 'sensor_tower', 'reactor'].includes(k));
const NEW_BUILDINGS = ['planetary_fortress', 'orbital_command', 'sensor_tower', 'reactor'];

const D = json('({ u: DATA.units, b: DATA.buildings, ab: DATA.abilities, menu: DATA.buildMenu })');
const T = json('({ SCR: AI_SCRIPTS.T, COMP: AI_COMP.T, COMPvP: AI_COMP.TvP, RES: AI_RESEARCH.T })');

console.log('--- 1. the roster exists, and nothing in it can produce a NaN ---');
for (const id of NEW_UNITS) {
  const d = D.u[id];
  if (!ok(!!d, id + ' is a unit def')) continue;
  ok(d.race === 'T', id + ' is Terran', d.race);
  // `undefined * n` is NaN, and NaN hit points spread through every comparison they touch. This
  // repository lost an afternoon to a spider mine with no cost; the guard is that the fields are
  // spelled out, so the check is that they are NUMBERS and not merely falsy-safe.
  ok(typeof d.min === 'number' && typeof d.gas === 'number' && typeof d.sup === 'number',
    id + ' spells out min, gas and sup as numbers', JSON.stringify([d.min, d.gas, d.sup]));
}
for (const id of NEW_BUILDINGS) {
  const d = D.b[id];
  if (!ok(!!d, id + ' is a building def')) continue;
  ok(d.race === 'T', id + ' is Terran', d.race);
  ok(typeof d.min === 'number' && typeof d.gas === 'number', id + ' spells out min and gas as numbers', JSON.stringify([d.min, d.gas]));
}
// The two hall morphs must keep the Command Center's footprint. G.morphBuilding swaps the def in place
// and never re-blocks the collision grid, so a morph with a different footprint leaves the map
// describing the building it used to be -- which is why every Zerg morph and all three Protoss
// attunements are the same size as their source, and this is the same rule for the same reason.
for (const id of ['orbital_command', 'planetary_fortress'])
  ok(D.b[id].w === D.b.command_center.w && D.b[id].h === D.b.command_center.h,
    id + ' keeps the Command Center footprint (morphBuilding never re-blocks the grid)', D.b[id].w + 'x' + D.b[id].h);

console.log('\n--- 2. everything is reachable from a Command Center ---');
// A closure, the same shape test/techtree.js takes, but seeded ONLY from the Terran hall and reported
// per new def -- so a failure names the def rather than the race.
const reach = json(`(() => {
  const have = new Set(['command_center']), units = new Set(), techs = new Set();
  const eq = (id) => have.has(id) || (EQUIV[id] || []).some(x => have.has(x));
  const reqMet = d => !d.req || d.req.every(r => DATA.techs[r] ? techs.has(r) : eq(r));
  for (let n = 0; n < 40; n++) {
    let grew = false;
    for (const [id, u] of Object.entries(DATA.units)) { if (u.race !== 'T' || units.has(id)) continue; if (u.from && !eq(u.from) && !units.has(u.from)) continue; if (!reqMet(u)) continue; units.add(id); grew = true; }
    for (const [id, d] of Object.entries(DATA.buildings)) { if (d.race !== 'T' || have.has(id) || !reqMet(d)) continue;
      if (d.tier === 'addon') { const p = DATA.buildings[d.parent]; if (!p || !have.has(d.parent) || !(p.addons || []).includes(id)) continue; }
      if (d.tier === 'morph') { const f = Object.values(DATA.buildings).find(b => b.morphTo === id || (b.morphOptions || []).includes(id)); if (!f || !have.has(f.id)) continue; }
      have.add(id); grew = true; }
    for (const [id, t] of Object.entries(DATA.techs)) { if (t.race !== 'T' || techs.has(id) || !have.has(t.bld) || !reqMet(t)) continue; techs.add(id); grew = true; }
    if (!grew) break;
  }
  return { units: [...units], have: [...have] };
})()`);
for (const id of NEW_UNITS) ok(reach.units.includes(id), id + ' is reachable from a Command Center', '(from ' + (D.u[id].from || '-') + ', req ' + JSON.stringify(D.u[id].req || []) + ')');
for (const id of NEW_BUILDINGS) ok(reach.have.includes(id), id + ' is reachable from a Command Center');

console.log('\n--- 3. a computer opponent has a route to every one of them ---');
const scriptIds = T.SCR.map(s => s[1]);
const compIds = T.COMP.map(c => c[0]).concat(T.COMPvP.map(c => c[0]));
// morphSource is resolved INSIDE the context, because it walks DATA.
const morphSrc = run('(ids => ids.map(id => AI.prototype.morphSource.call({}, id)))');
// The two ability-driven routes are verified against the SOURCE of AI.prototype.micro rather than
// against a table, because there is no table for them -- pressing a button is code. A source check is
// weak on its own, so each is paired with a live behaviour check further down (sections 6 and 8).
const microSrc = run('String(AI.prototype.micro)');
for (const [id, route] of Object.entries(ROSTER)) {
  if (route === 'comp') ok(compIds.includes(id), id + ': in AI_COMP.T or AI_COMP.TvP');
  else if (route === 'script') ok(scriptIds.includes(id), id + ': in AI_SCRIPTS.T');
  else if (route === 'addon') {
    ok(scriptIds.includes(id), id + ': in AI_SCRIPTS.T');
    ok(D.b[id].tier === 'addon' && (D.b[D.b[id].parent].addons || []).includes(id), id + ': its parent (' + D.b[id].parent + ') offers it');
  } else if (route === 'morph') {
    ok(scriptIds.includes(id), id + ': in AI_SCRIPTS.T');
    ok(D.b[id].tier === 'morph', id + ": tier is 'morph'", D.b[id].tier);
    const src = morphSrc([id])[0];
    ok(!!src && !!D.b[src], id + ': AI.prototype.morphSource resolves a real source', String(src));
  } else if (route === 'transform') ok(/viking_mode/.test(microSrc), id + ": AI.micro presses 'viking_mode', which is the only way to reach it");
  else if (route === 'ability') ok(/'mule'/.test(microSrc), id + ": AI.micro casts 'mule', which is the only way to reach it");
}
// ...and the two that must NOT be in AI_COMP. A weight on either is a permanent zero-count top pick
// that production() re-scores every think and can never satisfy, because nothing trains them.
for (const id of ['viking_a', 'mule']) ok(!compIds.includes(id), id + ' is deliberately absent from AI_COMP (nothing trains it)');
// The build script must still be in ascending supply order after four insertions -- test/aiscripts.js
// says this too, and it is repeated here because it is the invariant these insertions could break.
{ const bad = []; for (let i = 1; i < T.SCR.length; i++) if (T.SCR[i][0] < T.SCR[i - 1][0]) bad.push(T.SCR[i - 1] + ' then ' + T.SCR[i]);
  ok(!bad.length, 'AI_SCRIPTS.T is still in ascending supply order after the M12 insertions', bad.join('; ')); }
// The Comsat must be bolted on BEFORE the Orbital morph or it can never be: AI.addon finds a parent by
// `u.def.id === ad.parent`, and after the morph the def is no longer 'command_center'.
ok(scriptIds.indexOf('comsat_station') >= 0 && scriptIds.indexOf('comsat_station') < scriptIds.indexOf('orbital_command'),
  'the script bolts on the Comsat before it morphs the Orbital (AI.addon matches the parent by def id)',
  scriptIds.indexOf('comsat_station') + ' vs ' + scriptIds.indexOf('orbital_command'));

console.log('\n--- 4. the command card, which is what a roster this size breaks first ---');
const card = json(`(() => {
  Render.W = 1600; Render.H = 900; Render.viewW = 1600; Render.viewH = 760;
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 5 });
  for (const p of G.players) p.ai = null;
  UI.mode = 'play'; UI.menu = null; UI.cardMenu = null; UI.cardPage = 0;
  const p = G.players[0]; p.minerals = 9999; p.gas = 9999;
  // everything unlocked, so the fullest possible version of every card is the one under test
  for (const id of Object.keys(DATA.buildings)) if (DATA.buildings[id].race === 'T') { const b = G.spawnUnit(id, 0, p.startX + 400, p.startY + 400); b.done = true; b.hp = b.maxHp; G.kill(b, null, true); }
  for (const t of Object.keys(DATA.techs)) if (DATA.techs[t].race === 'T') p.tech.add(t);
  const out = { over: [], dupHk: [], pages: {} };
  const probe = (label, b) => {
    UI.selection = [b];
    for (const menu of [null, 'basic', 'adv']) {
      UI.cardMenu = menu;
      for (let pg = 0; pg < 5; pg++) {
        UI.cardPage = pg; const c = UI.currentCard(); if (!c.length) break;
        for (const btn of c) if (btn.slot >= UI.CARD_SLOTS || btn.slot < 0) out.over.push(label + '/' + menu + '/' + btn.label + '@' + btn.slot);
        const seen = {}; for (const btn of c) { const k = btn.hk; if (!k) continue; if (seen[k]) out.dupHk.push(label + '/' + (menu || 'unit') + ' p' + pg + ': ' + seen[k] + ' and ' + btn.label + ' are both "' + k + '"'); seen[k] = btn.label; }
        out.pages[label + '/' + (menu || 'unit')] = pg + 1;
        if (!c.some(x => /^More/.test(x.label))) break;
      }
    }
    UI.cardMenu = null; UI.cardPage = 0;
  };
  const born = [];
  for (const id of Object.keys(DATA.buildings)) {
    const d = DATA.buildings[id]; if (d.race !== 'T' || d.tier === 'none') continue;
    const b = G.spawnUnit(id, 0, p.startX + 300, p.startY + 300); if (!b) continue; b.done = true; b.hp = b.maxHp; b.progress = d.time; born.push(b);
    probe(id, b);
  }
  // ...and the new mobile units, whose cards carry the new abilities
  for (const id of ['marauder', 'reaper', 'widow_mine', 'viking', 'viking_a', 'medivac', 'raven', 'banshee', 'mule']) {
    const u = G.spawnUnit(id, 0, p.startX + 200, p.startY + 200); born.push(u); probe(id, u);
  }
  UI.selection = []; for (const b of born) if (b.alive) G.kill(b, null, true);
  return out;
})()`);
ok(card.over.length === 0, 'no Terran card draws outside the 4x3 grid, on any page', card.over.slice(0, 4).join(' | '));
ok(card.dupHk.length === 0, 'no two buttons on one Terran card page share a hotkey', card.dupHk.slice(0, 4).join(' | '));
ok((card.pages['starport/unit'] || 1) >= 2, 'the Starport card has grown past one page and paginates', 'pages=' + card.pages['starport/unit']);
ok((card.pages['scv/basic'] || 1) === 1 && (card.pages['scv/adv'] || 1) === 1, 'both build pages still fit on one page each', JSON.stringify([card.pages['scv/basic'], card.pages['scv/adv']]));
ok(D.menu.T.adv.includes('sensor_tower'), 'the Sensor Tower is on the Advanced build page');

console.log('\n--- 5. the Reactor actually doubles production ---');
// The measurement, and its own negative control. `withReactor` and `withoutReactor` differ by ONE
// thing -- whether the add-on standing beside the Barracks is finished -- so if the reactor code were
// deleted the two numbers would be equal and the assertion below would fail. That is what stops this
// being a test that passes because marines happen to come out of a Barracks.
const reactor = json(`(() => {
  const setup = (attach) => {
    G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 9, layout: 'temple' });
    for (const q of G.players) q.ai = null;
    const p = G.players[0]; p.minerals = 99999; p.gas = 99999;
    const b = G.spawnUnit('barracks', 0, p.startX + 260, p.startY + 260); b.done = true; b.hp = b.maxHp; b.progress = b.def.time;
    if (attach) { const a = G.spawnUnit('reactor', 0, b.x + 140, b.y + 40); a.done = true; a.hp = a.maxHp; a.progress = a.def.time; a.parent = b; b.addon = a; }
    G.recomputeSupply(); p.supMax = 200;
    return { p, b };
  };
  const timeTwo = (attach) => {
    const { p, b } = setup(attach);
    G.queueUnit(b, 'marine'); G.queueUnit(b, 'marine');
    let first = -1, second = -1, n0 = G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'marine').length;
    for (let f = 0; f < 2000 && second < 0; f++) {
      G.tick();
      const n = G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'marine').length - n0;
      if (n >= 1 && first < 0) first = f; if (n >= 2 && second < 0) second = f;
    }
    return { first, second, queue: b.prod.length };
  };
  const out = { with: timeTwo(true), without: timeTwo(false), one: DATA.units.marine.time };
  // ...and the rule that keeps the add-on one legible thing: it parallelises UNITS, never research.
  const { p, b } = setup(true);
  G.queueTech(b, 'suppress_inf'); G.queueUnit(b, 'marine');
  const before = b.prod[1].progress; for (let f = 0; f < 200; f++) G.tick();
  out.behindResearch = b.prod.length >= 2 ? b.prod[1].progress - before : -1;
  return out;
})()`);
ok(reactor.with.second > 0, 'a Barracks with a Reactor finishes two marines', JSON.stringify(reactor.with));
ok(reactor.without.second > 0, 'a Barracks without one finishes two marines as well', JSON.stringify(reactor.without));
ok(Math.abs(reactor.with.second - reactor.with.first) <= 4,
  'with a Reactor the second marine lands within four frames of the first -- they were built in parallel',
  JSON.stringify(reactor.with) + ' (one marine takes ' + reactor.one + 'f)');
ok(reactor.without.second - reactor.without.first > reactor.one * 0.8,
  'CONTROL: without one the second marine waits a full build time behind the first',
  JSON.stringify(reactor.without) + ' (one marine takes ' + reactor.one + 'f)');
ok(reactor.without.second > reactor.with.second * 1.5,
  'so the Reactor is worth close to double throughput, not a rounding difference',
  reactor.without.second + 'f vs ' + reactor.with.second + 'f');
ok(reactor.behindResearch === 0, 'a unit queued behind RESEARCH does not slip past it -- the Reactor doubles units only', String(reactor.behindResearch));

console.log('\n--- 6. the MULE: it mines faster, it takes it out of the patch, and it dies ---');
const mule = json(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });
  for (const q of G.players) q.ai = null;
  const p = G.players[0]; p.minerals = 0; p.gas = 0;
  const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  // An Orbital needs an Academy, which needs a Barracks. Put both up first, as a player would.
  for (const id of ['barracks', 'academy']) { const b = G.spawnUnit(id, 0, p.startX + 300, p.startY + 340); b.done = true; b.hp = b.maxHp; b.progress = b.def.time; }
  // Morph the hall to an Orbital exactly as a player would, then let it charge.
  p.minerals = 1000; const morphed = G.queueMorph(hall, 'orbital_command');
  for (let f = 0; f < DATA.buildings.orbital_command.time + 10; f++) G.tick();
  const out = { morphed, isOrbital: hall.def.id === 'orbital_command', energy0: Math.round(hall.energy) };
  hall.energy = 200;
  // The one thing EQUIV in js/sim.js was blind to until M12: an Orbital is still a Command Center.
  out.stillCC = p.hasBuilding('command_center');
  out.canStillBarracks = p.hasReq(DATA.buildings.barracks);
  // Park every SCV so nothing but the MULE is mining, then drop one on a fresh patch.
  for (const u of G.units) if (u.alive && u.owner === 0 && u.def.worker) u.applyOrder({ type: 'hold' });
  let patch = null, bd = 1e9;
  for (const r of G.map.resources) { if (r.type !== 'mineral' || r.amount <= 0) continue; const d = Math.hypot(r.cx - hall.x, r.cy - hall.y); if (d < bd) { bd = d; patch = r; } }
  const amt0 = patch.amount, min0 = p.minerals, e0 = hall.energy;
  Abilities.issue(hall, 'mule', null, patch.cx, patch.cy);
  const m = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'mule');
  out.spawned = !!m; out.energySpent = e0 - hall.energy;
  if (!m) return out;
  out.lifetime0 = m.lifetime; out.order = m.order.type; out.isWorker = !!m.def.worker; out.sup = m.def.sup;
  out.supBefore = p.supUsed;
  // one full trip
  let trips = 0, carrying = false;
  for (let f = 0; f < 900 && trips < 1; f++) { G.tick(); if (!m.alive) break; if (m.carrying) carrying = true; else if (carrying) { carrying = false; trips++; } }
  out.trips = trips; out.gained = p.minerals - min0; out.patchDrop = amt0 - patch.amount;
  // The clock runs down by one a frame, and a second drop does not renew the first. A MULE that could
  // be renewed would be an economy exploit rather than a macro mechanic.
  const l0 = m.lifetime; for (let f = 0; f < 100; f++) G.tick();
  out.ticked = l0 - m.lifetime;
  hall.energy = 200; const before2 = m.lifetime;
  Abilities.issue(hall, 'mule', null, patch.cx, patch.cy);
  out.renewed = m.lifetime - before2;
  out.second = G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'mule').length;
  // ...and now leave it alone until it expires. It must die, and it must die on its own.
  let alive = 0; for (let f = 0; f < 2400; f++) { G.tick(); if (!m.alive) break; alive++; }
  out.diedAfter = alive; out.dead = !m.alive;
  return out;
})()`);
ok(mule.morphed && mule.isOrbital, 'a Command Center morphs into an Orbital Command', JSON.stringify([mule.morphed, mule.isOrbital]));
ok(mule.stillCC && mule.canStillBarracks, 'and it still counts as a Command Center, so the tech tree survives the morph', JSON.stringify([mule.stillCC, mule.canStillBarracks]));
ok(mule.spawned, 'Call Down MULE puts a MULE on the ground');
ok(mule.energySpent === D.ab.mule.energy, 'and it costs the energy the table says', mule.energySpent + ' vs ' + D.ab.mule.energy);
ok(mule.order === 'gather', 'the MULE is sent to a patch on arrival rather than left standing', String(mule.order));
ok(mule.sup === 0, 'a MULE costs no supply', String(mule.sup));
ok(mule.trips === 1 && mule.gained > 0, 'it completes a mining trip', JSON.stringify([mule.trips, mule.gained]));
// The number that matters. A worker's trip is 8; a MULE's is 8 + MULE_HAUL, and the SAME amount comes
// out of the field -- so the mechanic obeys M11's attrition economy instead of minting minerals.
ok(mule.gained === 24, 'a MULE hauls 24 minerals a trip, three times a worker\'s eight', String(mule.gained));
ok(mule.patchDrop === mule.gained, 'and every one of them came OUT OF THE PATCH -- no minerals are created', mule.patchDrop + ' taken from the field vs ' + mule.gained + ' delivered');
ok(mule.lifetime0 > 0 && mule.lifetime0 === D.u.mule.lifetime, 'a MULE is born with the lifetime its def gives it', String(mule.lifetime0));
ok(mule.dead, 'and it expires without being killed by anything');
ok(mule.diedAfter <= D.u.mule.lifetime, 'on schedule: it cannot outlive its lifetime', mule.diedAfter + ' frames of ' + D.u.mule.lifetime);
// A MULE that could be made permanent would be an economy exploit rather than a macro mechanic. The
// clock is counted down by Unit.tick before anything else in the frame runs, and the M12 code never
// writes to it -- so the guarantee is structural. Both halves are pinned: the source, and the clock.
ok(mule.ticked === 100, 'its clock runs down one frame at a time and nothing tops it up', mule.ticked + ' of 100');
ok(mule.renewed <= 0 && mule.second === 2, 'a second Call Down makes a SECOND MULE; it does not renew the first', JSON.stringify([mule.renewed, mule.second]));
ok(!/lifetime/.test(run('String(Abilities.tickTerran) + String(Abilities.muleHaul) + String(Abilities.reactorTick)')),
  'the M12 per-frame pass never mentions `lifetime`, so it cannot extend one');
ok(D.u.mule.lifetime > 0 && !D.u.mule.notUnit, 'the lifetime is on the def, where Unit.tick reads it every frame');

console.log('\n--- 7. the Viking: two modes, and each can only shoot what it claims ---');
const vik = json(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 6, layout: 'temple' });
  for (const q of G.players) q.ai = null;
  const p = G.players[0]; p.minerals = 9999; p.gas = 9999;
  const x = p.startX + 200, y = p.startY + 200;
  const v = G.spawnUnit('viking', 0, x, y);
  const ground = G.spawnUnit('marine', 1, x + 64, y);
  const air = G.spawnUnit('wraith', 1, x - 64, y);
  const out = {};
  out.fighter = { fly: v.fly, def: v.def.id, vsAir: !!v.weaponFor(air), vsGround: !!v.weaponFor(ground) };
  out.transformed = Abilities.instant(v, 'viking_mode');
  out.assault = { fly: v.fly, def: v.def.id, vsAir: !!v.weaponFor(air), vsGround: !!v.weaponFor(ground) };
  out.lockout = Abilities.instant(v, 'viking_mode');          // transT is still running
  out.supStable = p.supUsed;
  for (let f = 0; f < 60; f++) G.tick();
  out.back = Abilities.instant(v, 'viking_mode') && v.def.id === 'viking' && v.fly === true;
  // Everything below is about the transform itself, so the two enemies go: a Viking being shot at
  // while the hit-point ratio is measured measures the marine, not the transform.
  G.kill(ground, null, true); G.kill(air, null, true); G.rebuildGrid();
  // hit points carry across as a FRACTION, so transforming is not a heal and not a wound
  for (let f = 0; f < 60; f++) G.tick();
  v.hp = v.maxHp * 0.5;
  Abilities.instant(v, 'viking_mode');
  out.hpRatio = +(v.hp / v.maxHp).toFixed(2); out.hpMode = v.def.id;
  // ...and it will not land on something it cannot stand on. Get it back in the air, wall off the
  // ground under it, and ask it to land there.
  for (let f = 0; f < 60; f++) G.tick();
  Abilities.instant(v, 'viking_mode');
  out.airborne = v.def.id === 'viking';
  for (let f = 0; f < 60; f++) G.tick();
  const tx = Math.floor(v.x / TILE), ty = Math.floor(v.y / TILE);
  const was = G.map.blocked[G.map.idx(tx, ty)]; G.map.blocked[G.map.idx(tx, ty)] = 999999;
  out.walkable = G.map.walkable(tx, ty);
  out.refusedLanding = Abilities.instant(v, 'viking_mode') === false && v.def.id === 'viking';
  G.map.blocked[G.map.idx(tx, ty)] = was;
  // CONTROL: with the same tile clear it lands, so the refusal above is the guard and not a stuck unit
  out.landsWhenClear = Abilities.instant(v, 'viking_mode') === true && v.def.id === 'viking_a';
  return out;
})()`);
ok(vik.fighter.fly === true && vik.fighter.vsAir && !vik.fighter.vsGround, 'Fighter mode flies, shoots air, and cannot touch the ground', JSON.stringify(vik.fighter));
ok(vik.transformed, 'it transforms');
ok(vik.assault.fly === false && vik.assault.vsGround && !vik.assault.vsAir, 'Assault mode walks, shoots ground, and cannot touch a flyer', JSON.stringify(vik.assault));
ok(vik.assault.def === 'viking_a', 'the def is swapped, which is what gives the two modes two sprite sets', String(vik.assault.def));
ok(vik.lockout === false, 'it cannot transform again inside its own transform lockout');
ok(vik.back, 'and it transforms back');
ok(vik.hpRatio === 0.5, 'hit points carry across as a fraction: transforming is neither a heal nor a wound', vik.hpRatio + ' in ' + vik.hpMode);
ok(vik.airborne && vik.walkable === false, 'setup: it is in the air over ground that has been walled off', JSON.stringify([vik.airborne, vik.walkable]));
ok(vik.refusedLanding, 'it refuses to land on ground it cannot stand on, rather than wedging itself in terrain');
ok(vik.landsWhenClear, 'CONTROL: the same transform succeeds the moment that tile is clear again, so the refusal is the guard');
ok(D.u.viking.sup === D.u.viking_a.sup, 'both modes cost the same supply, so a transform cannot supply-block a player', D.u.viking.sup + ' vs ' + D.u.viking_a.sup);
ok(D.u.viking_a.upgA === D.u.viking.upgA && D.u.viking_a.gw.upgKey === D.u.viking.aw.upgKey,
  'and both modes ride the same upgrade lines -- it is one airframe', JSON.stringify([D.u.viking_a.upgA, D.u.viking_a.gw.upgKey]));

console.log('\n--- 8. the Raven\'s Jamming Field ---');
const jam = json(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 8, layout: 'temple' });
  for (const q of G.players) q.ai = null;
  const p = G.players[0]; p.minerals = 9999; p.gas = 9999;
  const x = p.startX + 260, y = p.startY + 260;
  const r = G.spawnUnit('raven', 0, x, y); r.energy = 200;
  const foe = G.spawnUnit('missile_turret', 1, x + 60, y); foe.done = true; foe.hp = foe.maxHp; foe.progress = foe.def.time;
  const friend = G.spawnUnit('missile_turret', 0, x - 60, y); friend.done = true; friend.hp = friend.maxHp; friend.progress = friend.def.time;
  G.rebuildGrid();
  const out = { det0: foe.isDetector, sight0: +foe.sight.toFixed(2), friendDet0: friend.isDetector };
  Abilities.issue(r, 'jam_field', null, foe.x, foe.y);
  // Energy is read on the frame the cast lands, before regeneration puts any of it back: the caster
  // regains 0.03125 a frame, so measuring it forty frames later measures the regeneration too.
  for (let f = 0; f < 40 && out.energy === undefined; f++) { G.tick(); if (G.fields.some(x => x.kind === 'jam')) out.energy = Math.round(r.energy); }
  for (let f = 0; f < 40; f++) G.tick();
  out.field = G.fields.filter(f => f.kind === 'jam').length;
  out.det1 = foe.isDetector; out.sight1 = +foe.sight.toFixed(2); out.friendDet1 = friend.isDetector;
  // ...and it wears off, both when the unit leaves and when the field expires
  for (const f of G.fields) if (f.kind === 'jam') f.t = 1;
  for (let f = 0; f < 12; f++) G.tick();
  out.det2 = foe.isDetector; out.gone = G.fields.filter(f => f.kind === 'jam').length;
  return out;
})()`);
ok(jam.det0 === true && jam.field === 1, 'a Raven drops a Jamming Field', JSON.stringify([jam.det0, jam.field]));
ok(jam.det1 === false, 'an enemy detector inside it stops detecting');
ok(jam.sight1 < jam.sight0, 'and is short-sighted while it is in there', jam.sight0 + ' -> ' + jam.sight1);
ok(jam.friendDet1 === true, 'a friendly detector in the same field is untouched -- it is not a trap for its owner');
ok(jam.energy === 200 - D.ab.jam_field.energy, 'it costs the energy the table says', jam.energy + '');
ok(jam.gone === 0 && jam.det2 === true, 'and the effect ends with the field', JSON.stringify([jam.gone, jam.det2]));

console.log('\n--- 9. the roles that were most at risk of being near-clones ---');
// Each of these is the assertion that the def is DIFFERENT from the thing it was in danger of
// duplicating, in the one respect that was the whole reason it was allowed in.
ok(D.u.widow_mine.gw.burrowOnly === true && D.u.widow_mine.gw.targets === 'both' && !D.u.widow_mine.gw.suicide,
  'the Widow Mine is not a spider mine: it survives its shot and it hits air', JSON.stringify(D.u.widow_mine.gw));
ok(!D.u.widow_mine.mine, "...and it does not carry `mine: true`, which would route it into Abilities.mineTick and take all of that away");
ok(D.u.spider_mine.gw.suicide === true, 'CONTROL: the spider mine it is not a clone of does die on its shot');
ok((D.u.widow_mine.abil || []).includes('burrow'), 'it can be dug up and moved, which a spider mine cannot');
ok(D.u.banshee.gw && !D.u.banshee.aw && D.u.wraith.aw, 'the Banshee is the Wraith inverted: ground only, where the Wraith is the air fighter');
ok((D.u.banshee.abil || []).includes('cloak_wraith'), '...and it reuses the Wraith\'s own Cloaking Field rather than a second identical toggle');
ok(D.u.liberator.gw.minRange > 0 && !D.u.liberator.aw, 'the Liberator has a MINIMUM range and no air attack: it needs an escort by construction', JSON.stringify([D.u.liberator.gw.minRange, !!D.u.liberator.aw]));
ok(D.u.hellion.gw.line === true, 'the Hellion is the only Terran weapon that hits a line');
ok(D.u.thor.gw.splash && D.u.thor.aw && D.u.thor.speed > 0, 'the Thor splashes ground while MOBILE, which the siege tank cannot', JSON.stringify([!!D.u.thor.gw.splash, !!D.u.thor.aw]));
ok(D.u.cyclone.gw.targets === 'both' && D.u.cyclone.speed > D.u.goliath.speed, 'the Cyclone is one weapon for both targets on a faster chassis than the Goliath', D.u.cyclone.speed + ' vs ' + D.u.goliath.speed);
ok(D.u.marauder.gw.type === 'explosive' && D.u.marauder.bio === true, 'the Marauder is the bio line\'s anti-armour leg, and it is still bio so a medic heals it');
ok(D.u.reaper.speed > D.u.vulture.speed && D.u.reaper.bio === true, 'the Reaper is faster than a Vulture and is bio where the Vulture is mech', D.u.reaper.speed + ' vs ' + D.u.vulture.speed);
ok(D.u.medivac.cargo === D.u.dropship.cargo && (D.u.medivac.abil || []).includes('heal'), 'the Medivac is a dropship that heals, on both existing code paths', JSON.stringify([D.u.medivac.cargo, D.u.medivac.abil]));
ok(D.u.raven.det === true && (D.u.raven.abil || []).includes('jam_field') && !D.u.raven.abil.includes('irradiate'),
  'the Raven detects and jams, and does not take anything off the Science Vessel');
{ const maxOther = Math.max(...Object.values(D.b).filter(b => b.race === 'T' && b.id !== 'sensor_tower').map(b => b.sight || 0));
  ok(D.b.sensor_tower.sight > maxOther, 'the Sensor Tower sees further than anything else Terran builds', D.b.sensor_tower.sight + ' vs ' + maxOther);
  ok(!D.b.sensor_tower.det, '...and is deliberately not a detector, which would answer every cloak in the game from home'); }
ok(!!D.b.planetary_fortress.gw && !D.b.planetary_fortress.canLift,
  'the Planetary Fortress trades the Command Center\'s escape hatch for a gun', JSON.stringify([!!D.b.planetary_fortress.gw, !!D.b.planetary_fortress.canLift]));
ok(!(D.b.orbital_command.abil || []).includes('scanner_sweep') && (D.b.comsat_station.abil || []).includes('scanner_sweep'),
  'the Orbital does NOT take Scanner Sweep from the Comsat, so the Comsat is still worth building');
ok((D.b.orbital_command.addons || []).includes('comsat_station'), '...and it keeps the add-on slot, so a base can have both');

console.log('\n--- 10. the two hall morphs are mutually exclusive by construction ---');
const excl = json(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3 });
  for (const q of G.players) q.ai = null;
  Render.W = 1600; Render.H = 900; Render.viewW = 1600; Render.viewH = 760;
  UI.mode = 'play'; UI.menu = null; UI.cardMenu = null; UI.cardPage = 0;
  const p = G.players[0]; p.minerals = 9999; p.gas = 9999;
  for (const id of ['academy', 'engineering_bay', 'barracks']) { const b = G.spawnUnit(id, 0, p.startX + 300 + Math.random() * 0, p.startY + 300); b.done = true; b.hp = b.maxHp; }
  const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'command_center');
  const labels = b => { UI.selection = [b]; const out = []; for (let pg = 0; pg < 4; pg++) { UI.cardPage = pg; const c = UI.currentCard(); for (const x of c) out.push(x.label); if (!c.some(x => /^More/.test(x.label))) break; } UI.cardPage = 0; return out; };
  const before = labels(hall);
  G.queueMorph(hall, 'orbital_command');
  for (let f = 0; f < DATA.buildings.orbital_command.time + 10; f++) G.tick();
  const after = labels(hall);
  UI.selection = [];
  return { before, after, def: hall.def.id, optsAfter: DATA.buildings[hall.def.id].morphOptions || null };
})()`);
ok(excl.before.includes('Orbital Command') && excl.before.includes('Planetary Fortress'), 'a Command Center offers both morphs', excl.before.join(','));
ok(excl.def === 'orbital_command', 'taking one completes');
ok(!excl.after.includes('Planetary Fortress') && !excl.after.includes('Orbital Command'), 'and the other button no longer exists -- the exclusivity is the absence of a button, not a rule', excl.after.join(','));
ok(excl.optsAfter === null, '...because the morphed def carries no morphOptions of its own');

console.log('\n--- 11. determinism and the shared tables ---');
ok(!/Math\.random|Date\.now|performance\./.test(run('String(Abilities.tickTerran) + String(Abilities.muleHaul) + String(Abilities.reactorTick) + String(Abilities.cast) + String(Abilities.instant)')),
  'no Math.random, Date or performance in the new ability code');
ok(!/Math\.random|Date\.now/.test(run('String(AI.prototype.micro)')), 'nor in AI.micro');
ok(json('EQUIV.command_center').includes('orbital_command') && json('EQUIV.command_center').includes('planetary_fortress'),
  'EQUIV knows an Orbital and a Fortress are still Command Centers', JSON.stringify(json('EQUIV.command_center')));
{ // AI_RESEARCH.T is unchanged on purpose: M12's Terran roster adds no new research, and reordering an
  // existing one is a balance move that belongs with a measurement (M8 tried it for Zerg: nothing).
  ok(T.RES.every(id => json('({t:DATA.techs,u:DATA.upgrades})').t[id] || json('({t:DATA.techs,u:DATA.upgrades})').u[id]), 'AI_RESEARCH.T still names only real techs and upgrades'); }
ok(errors.length === 0, 'no JS errors were logged along the way', errors[0] || '');

console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
