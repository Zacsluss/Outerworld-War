// The fourth race, which is not a race: neutral hostile life (M11 wave two, item 1) and capturable
// derelicts (item 8).
//   node test/neutrals.js
//
// Both features need a third owner that is neither a player nor an ally, and in the data both are one
// mechanism: `race: 'N'`. That choice is the reason this file exists, because it is a choice with two
// failure modes that no other check in the repository can see.
//
// THE FIRST is that `race: 'N'` works by being invisible. test/techtree.js walks ['T','Z','P'] and
// demands that everything it finds is reachable; test/newbuildings.js walks the same three and demands
// that every basic/advanced building is on a build page. A neutral def is skipped by both, silently and
// correctly -- and a def that was MEANT to be neutral and lost its race letter in an edit would also be
// skipped by nothing, would fail those two loudly, and would be fixed. The dangerous direction is the
// other one: a def that is supposed to be in a tech tree and quietly is not, because somebody typed 'N'.
// So this file asserts the exclusion POSITIVELY -- these exact ids, this exact flag, absent from these
// exact tables -- rather than trusting an absence of failures elsewhere.
//
// THE SECOND is that nothing reads any of this yet. The simulation half is another change in files this
// one does not own, so every field below is written against a reader that does not exist. A contract
// nobody checks is a comment, and a typo in a field nobody consumes is invisible until the sim lands and
// then looks like a bug in the sim. That is the same argument test/newbuildings.js makes about the aura
// block, and it was right about that one.
//
// It also pins the two whole-table counts that the aura work depends on (exactly six aura buildings,
// exactly three walls), because the cheapest way to break test/auras.js from here would be to give a
// derelict an aura.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');

const ctx = {
  console: { log() { }, warn() { }, error() { } }, Math, performance, addEventListener() { }, setTimeout,
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { },
};
ctx.window = ctx; vm.createContext(ctx);
// sim.js comes along because js/sprites_units.js reaches for `clamp`, and map.js because the per-map
// toggle is only meaningful next to the layouts that may or may not set it.
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'sprites_units', 'sprites_buildings'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
// `const` in a vm context is not an own property of the context object, so everything comes back
// through the evaluator -- the same trick test/techtree.js and test/newbuildings.js use.
const g = n => vm.runInContext(n, ctx);
const D = g('DATA'), RACE_INFO = g('RACE_INFO'), TILE = g('TILE');
const LAYOUTS = g('MAP_LAYOUTS'), SCR = g('AI_SCRIPTS'), COMP = g('AI_COMP'), RES = g('AI_RESEARCH');
const UNIT_PAINTERS = g('UNIT_PAINTERS'), BUILDING_PAINTERS = g('BUILDING_PAINTERS'), BUILDING_ANIM = g('BUILDING_ANIM');
const PaintHelpers = g('PaintHelpers'), repairableDef = g('repairableDef');
const DATA_SRC = fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } return !!c; };

// ---------------------------------------------------------------- what was added
// Spelled out rather than derived from `race === 'N'`, so a renamed or dropped def is a failure here
// and not a silently smaller test. `kind` is what the rest of the file groups by.
const CREATURES = ['carrion_grub', 'carrion_maw'];
const NEST = 'carrion_warren';
const DERELICTS = ['derelict_foundry', 'derelict_archive', 'derelict_watchtower'];
const GRANTED = ['sentinel'];                                   // player-owned, but in no tech tree
const NEUTRAL_UNITS = CREATURES;                                // owned by nobody
const NEUTRAL_BUILDINGS = [NEST].concat(DERELICTS);
const ALL_N_UNITS = NEUTRAL_UNITS.concat(GRANTED);
const ALL_N = ALL_N_UNITS.concat(NEUTRAL_BUILDINGS);
const NAMES = {
  carrion_grub: 'Carrion Grub', carrion_maw: 'Carrion Maw', carrion_warren: 'Carrion Warren',
  derelict_foundry: 'Derelict Foundry', derelict_archive: 'Derelict Archive', derelict_watchtower: 'Derelict Watchtower',
  sentinel: 'Sentinel',
};
const defOf = id => D.units[id] || D.buildings[id];

// ================================================================ 1. they exist, with sane numbers
for (const id of ALL_N) {
  const d = defOf(id);
  if (!ok(!!d, id + ' exists in DATA')) continue;
  ok(d.name === NAMES[id], id + ' is named "' + NAMES[id] + '"', 'got "' + d.name + '"');
  ok(d.race === 'N', id + " declares race 'N'", 'race ' + d.race);
  ok(d.hp > 0 && d.hp <= 1000, id + ' has hit points in a sane band', 'hp ' + d.hp);
  ok(d.armor >= 0 && d.armor <= 5, id + ' has sane armour', 'armor ' + d.armor);
  ok(d.sight >= 1 && d.sight <= 20, id + ' can see, and not across the map', 'sight ' + d.sight);
  ok(!d.sh, id + ' has no plasma shields -- shields are a Protoss fact', 'sh ' + d.sh);
  ok(!d.aura, id + ' carries no aura (test/auras.js counts them over the whole table)');
  ok(!d.wall, id + ' carries no wall flag (counted over the whole table too)');
  ok(!d.det, id + ' is not a detector', 'det ' + d.det);
}
for (const id of NEUTRAL_UNITS) {
  const d = D.units[id]; if (!d) continue;
  ok(d.speed > 0 && d.speed < 10, id + ' moves at a unit speed', 'speed ' + d.speed);
  ok(d.r >= 6 && d.r <= 24, id + ' has a unit-scale collision radius', 'r ' + d.r);
  ok(!!d.gw && !d.aw, id + ' has a ground weapon and cannot shoot air');
  ok(d.gw.upgKey === null, id + ' weapon takes no upgrade key -- nobody owns it, so nobody upgrades it', String(d.gw.upgKey));
  ok(!d.upgA, id + ' has no armour upgrade key either', String(d.upgA));
  ok(!d.min && !d.gas && !d.sup, id + ' costs nothing and takes no supply -- it is not trained', [d.min, d.gas, d.sup].join('/'));
  ok(!d.hk, id + ' has no hotkey: it is never on anybody\'s card', String(d.hk));
  ok(!d.fly, id + ' is a ground creature');
  ok(!d.worker && !d.det && !d.energy, id + ' cannot gather, detect or cast');
  ok(!d.burrowed, id + ' does NOT carry the def-level `burrowed` flag -- buried is a spawn state, not a def property, or every warren-spawned grub would arrive underground', 'burrowed ' + d.burrowed);
  ok(repairableDef(d) === false, id + ' is not repairable: it is an animal');
}
for (const id of NEUTRAL_BUILDINGS) {
  const d = D.buildings[id]; if (!d) continue;
  ok(d.isBuilding === true && d.kind === 'building', id + ' is flagged as a building');
  ok(d.tier === 'none', id + " carries tier 'none' as well as race 'N'", 'tier ' + d.tier);
  ok(d.w >= 2 && d.w <= 4 && d.h >= 2 && d.h <= 3, id + ' has a legal footprint', d.w + 'x' + d.h);
  ok(typeof d.min === 'number' && typeof d.gas === 'number', id + ' spells out min and gas as numbers, so repairTick cannot compute NaN', d.min + '/' + d.gas);
  ok(!d.upg.length && !d.tech.length && !d.addons.length, id + ' researches nothing and has no add-ons');
  ok(!d.depot && !d.spawnsLarva && !d.onGeyser && !d.sup && !d.creep && !d.psi, id + ' is not a hall, gas building, supply, creep or psi source');
  ok(!d.gw && !d.aw, id + ' carries no weapon');
  ok(!d.needsCreep && !d.needsPsi, id + ' needs neither creep nor psi -- it stands where the map put it');
  ok(!d.morphTo && !d.morphOptions && !d.parent, id + ' is not a morph and is not an add-on');
  ok(!d.hk, id + ' has no hotkey', String(d.hk));
}

// ================================================================ 2. the flags
// Three flags, each saying one thing. `neutral` means no player owns it; `unlocked` means a player does
// own it but the only way to get one is to capture the named derelict. Everything with race 'N' must
// carry exactly one of the two, or it is a def whose exclusion from the tech tree has no stated reason.
const raceN = Object.keys(D.units).filter(k => D.units[k].race === 'N').concat(Object.keys(D.buildings).filter(k => D.buildings[k].race === 'N'));
ok(raceN.slice().sort().join(',') === ALL_N.slice().sort().join(','), "race 'N' is exactly the seven defs this test knows about", raceN.join(','));
for (const id of NEUTRAL_UNITS.concat(NEUTRAL_BUILDINGS)) {
  const d = defOf(id); if (!d) continue;
  ok(d.neutral === true, id + ' is flagged `neutral: true`');
  ok(!d.unlocked, id + ' is not also flagged `unlocked` -- a def is one or the other');
}
for (const id of GRANTED) {
  const d = defOf(id); if (!d) continue;
  ok(!d.neutral, id + ' is NOT flagged neutral: a player owns it once it is built');
  const u = d.unlocked;
  ok(!!u && DERELICTS.includes(u), id + ' names the derelict that unlocks it', 'unlocked ' + u);
  if (u && D.buildings[u]) ok((D.buildings[u].produces || []).includes(id), u + ' actually offers ' + id + ' on its `produces` list', (D.buildings[u].produces || []).join(','));
}
// and nothing outside race 'N' picked either flag up by accident
{ const leaked = [];
  for (const table of [D.units, D.buildings]) for (const k in table) {
    const d = table[k]; if (d.race === 'N') continue;
    if (d.neutral || d.unlocked) leaked.push(k + ' (' + d.race + ', neutral=' + d.neutral + ' unlocked=' + d.unlocked + ')');
  }
  ok(leaked.length === 0, 'no T/Z/P def carries `neutral` or `unlocked`', leaked.join(', ')); }

// RACE_INFO.N: the neutral player's own contract. It exists because Unit.speed, Unit.sight and
// Unit.armor all dereference this.player unconditionally, so a neutral unit needs a real Player.
const N = RACE_INFO.N;
if (ok(!!N, 'RACE_INFO.N exists, so a neutral Player can be constructed and js/codex.js can name it')) {
  ok(N.name === 'Neutral', 'RACE_INFO.N is called Neutral', N.name);
  ok(N.neutral === true, 'RACE_INFO.N says so');
  ok(N.team === -1, 'the neutral player is on team -1, which is allied with nothing (every real team id is a non-negative index)', String(N.team));
  ok(!N.hall && !N.worker && !N.supply && !N.gasB, 'it has no hall, worker, supply or gas building -- nothing may try to start it');
  ok(typeof N.color === 'string' && /^#[0-9a-f]{6}$/i.test(N.color), 'it has a colour, and it is the colour of dirt rather than a fourth army', N.color);
  ok(N.color !== RACE_INFO.T.color && N.color !== RACE_INFO.Z.color && N.color !== RACE_INFO.P.color, '...and not one of the three races\' colours');
}
ok(['T', 'Z', 'P', 'N'].every(k => RACE_INFO[k]) && Object.keys(RACE_INFO).length === 4, 'RACE_INFO has exactly the three races plus Neutral', Object.keys(RACE_INFO).join(','));

// ================================================================ 3. nothing treats them as a player's
// The whole point of race 'N'. Every one of these tables is walked by something that assumes what it
// finds belongs to somebody.
const menuIds = new Set();
ok(Object.keys(D.buildMenu).sort().join(',') === 'P,T,Z', 'DATA.buildMenu still has exactly three races', Object.keys(D.buildMenu).join(','));
for (const race of Object.keys(D.buildMenu)) for (const page of ['basic', 'adv']) for (const id of D.buildMenu[race][page]) menuIds.add(id);
const onMenu = ALL_N.filter(id => menuIds.has(id));
ok(!onMenu.length, 'no neutral def is on any build page', onMenu.join(', '));
const inLarva = ALL_N.filter(id => D.larvaMorphs.includes(id));
ok(!inLarva.length, 'no neutral def is a larva morph', inLarva.join(', '));

const inScript = [];
for (const race of Object.keys(SCR)) for (const [sup, id] of SCR[race]) if (ALL_N.includes(id)) inScript.push(race + '@' + sup + ':' + id);
ok(!inScript.length, 'no neutral def appears in any AI build script', inScript.join(', '));
const inComp = [];
for (const key of Object.keys(COMP)) for (const [id] of COMP[key]) if (ALL_N.includes(id)) inComp.push(key + ':' + id);
ok(!inComp.length, 'no neutral def appears in any AI_COMP', inComp.join(', '));
const inRes = [];
for (const race of Object.keys(RES)) for (const id of RES[race]) if (ALL_N.includes(id)) inRes.push(race + ':' + id);
ok(!inRes.length, 'no neutral def appears in any AI_RESEARCH', inRes.join(', '));

// No T/Z/P def may reach a neutral one, in either direction. This is what actually keeps them out of
// test/techtree.js's closure: it walks `from`, `req`, `produces`, add-ons and morphs.
const leak = [];
for (const table of [D.units, D.buildings]) for (const k in table) {
  const d = table[k]; if (d.race === 'N') continue;
  for (const field of ['from', 'morphFrom', 'morphTo', 'parent']) if (ALL_N.includes(d[field])) leak.push(k + '.' + field + ' -> ' + d[field]);
  for (const field of ['req', 'produces', 'addons', 'morphOptions']) for (const r of (d[field] || [])) if (ALL_N.includes(r)) leak.push(k + '.' + field + ' -> ' + r);
}
for (const k in D.techs) if (ALL_N.includes(D.techs[k].bld)) leak.push('tech ' + k + '.bld -> ' + D.techs[k].bld);
for (const k in D.upgrades) if (ALL_N.includes(D.upgrades[k].bld)) leak.push('upgrade ' + k + '.bld -> ' + D.upgrades[k].bld);
ok(!leak.length, 'no T/Z/P def names a neutral def as a producer, requirement, add-on or morph', leak.join(', '));
// ...and the neutral defs do not reach back into a tech tree either, so capturing one cannot be a
// requirement for anything a race builds.
const backLeak = [];
for (const id of ALL_N) { const d = defOf(id); for (const r of (d.req || [])) backLeak.push(id + ' requires ' + r); }
ok(!backLeak.length, 'no neutral def has a `req` at all -- nothing about them is gated on a tech tree', backLeak.join(', '));
// The one legal cross-reference, asserted so it stays the only one.
ok((D.buildings.derelict_foundry.produces || []).join(',') === 'sentinel', 'the only producer/product pair inside race N is the foundry and the Sentinel', (D.buildings.derelict_foundry.produces || []).join(','));

// The two whole-table counts other suites depend on, pinned from here as well.
ok(Object.values(D.buildings).filter(d => d.aura).length === 6, 'the table still holds exactly six aura buildings');
ok(Object.values(D.buildings).filter(d => d.wall).length === 3, 'the table still holds exactly three walls');

// ================================================================ 4. the wake contract
const WAKE_KEYS = new Set(['buried', 'tell', 'r', 'by', 'delay', 'aggro', 'leash', 'rebury', 'respawn']);
const TRIGGERS = new Set(['build', 'mine', 'walk']);
for (const id of CREATURES.concat([NEST])) {
  const d = defOf(id); if (!d) continue;
  const w = d.wake;
  if (!ok(!!w && typeof w === 'object', id + ' carries a `wake` block')) continue;
  const unknown = Object.keys(w).filter(k => !WAKE_KEYS.has(k));
  ok(!unknown.length, id + ' wake has no unknown fields', unknown.join(', '));
  ok(w.buried === true, id + ' spawns buried', 'buried ' + w.buried);
  ok(typeof w.tell === 'string' && !!D.buriedTells[w.tell], id + ' names a real tell', 'tell ' + w.tell);
  ok(typeof w.r === 'number' && w.r >= 3 && w.r <= 14, id + ' wake radius is a sane number of tiles', 'r ' + w.r);
  ok(Array.isArray(w.by) && w.by.length > 0 && w.by.every(t => TRIGGERS.has(t)), id + ' wakes on a non-empty list of known triggers', JSON.stringify(w.by));
  ok(typeof w.delay === 'number' && w.delay > 0 && w.delay <= 120, id + ' takes time to surface -- the last chance to pull the worker out', 'delay ' + w.delay);
  ok(typeof w.aggro === 'number' && w.aggro >= w.r - 2, id + ' aggression radius is not far short of its wake radius, or it would wake and stand still', 'r ' + w.r + ' aggro ' + w.aggro);
  ok(w.aggro <= 16, id + ' aggression radius is not map-wide', 'aggro ' + w.aggro);
  ok(typeof w.leash === 'number' && w.leash >= w.aggro - 4 && w.leash <= 24, id + ' leashes near its lair rather than chasing home with you', 'aggro ' + w.aggro + ' leash ' + w.leash);
  ok(typeof w.rebury === 'number' && w.rebury >= 0, id + ' declares whether it reburies', 'rebury ' + w.rebury);
  ok(w.respawn === 0, id + ' does not respawn where it stands: only the nest replaces anything, through `nest`', 'respawn ' + w.respawn);
}
// The one that does replace things.
const nest = D.buildings[NEST];
if (nest) {
  const n = nest.nest;
  const NEST_KEYS = new Set(['spawns', 'pack', 'every', 'cap', 'dormant']);
  if (ok(!!n && typeof n === 'object', NEST + ' carries a `nest` block')) {
    ok(Object.keys(n).every(k => NEST_KEYS.has(k)), NEST + ' nest has no unknown fields', Object.keys(n).filter(k => !NEST_KEYS.has(k)).join(', '));
    ok(!!D.units[n.spawns] && D.units[n.spawns].neutral === true, NEST + ' spawns a real neutral creature', 'spawns ' + n.spawns);
    ok(typeof n.pack === 'number' && n.pack >= 1 && n.pack <= 8, NEST + ' keeps a sane number alive at once', 'pack ' + n.pack);
    ok(typeof n.every === 'number' && n.every >= 240, NEST + ' replaces them no faster than once every ten seconds', 'every ' + n.every);
    ok(typeof n.cap === 'number' && n.cap > 0 && n.cap >= n.pack, NEST + ' has a lifetime cap, and it is at least one pack -- an uncapped spawner is a free army and a memory leak', 'cap ' + n.cap + ' pack ' + n.pack);
    ok(n.dormant === true, NEST + ' produces nothing until it is woken: a nest you never disturb stays scenery');
  }
}
// nothing else grew a wake or a nest block
const wakeIds = Object.keys(D.units).filter(k => D.units[k].wake).concat(Object.keys(D.buildings).filter(k => D.buildings[k].wake)).sort();
ok(wakeIds.join(',') === CREATURES.concat([NEST]).sort().join(','), 'exactly the two creatures and the nest carry `wake`', wakeIds.join(','));
const nestIds = Object.keys(D.buildings).filter(k => D.buildings[k].nest);
ok(nestIds.join(',') === NEST, 'exactly one def carries `nest`', nestIds.join(','));

// ================================================================ 5. the buried tell
// The feature is the tell. A creature that surfaces out of nowhere is a dice roll; one that was sitting
// under a patch you walked past is a mistake you made.
const tells = D.buriedTells;
if (ok(!!tells && typeof tells === 'object', 'DATA.buriedTells exists')) {
  ok(Object.keys(tells).length >= 3, 'there is a tell per kind of thing that buries itself, not one generic patch', Object.keys(tells).join(','));
  for (const [k, t] of Object.entries(tells)) {
    ok(Object.keys(t).sort().join(',') === 'period,r,sprite', 'tell "' + k + '" has exactly sprite, r and period', Object.keys(t).join(','));
    ok(typeof t.sprite === 'string' && typeof UNIT_PAINTERS[t.sprite] === 'function', 'tell "' + k + '" names a painter that exists in UNIT_PAINTERS', 'sprite ' + t.sprite);
    ok(typeof t.r === 'number' && t.r >= 0.5 && t.r <= 5, 'tell "' + k + '" is a patch of ground, not a crater', 'r ' + t.r);
    ok(typeof t.period === 'number' && t.period > 0, 'tell "' + k + '" declares a loop length', 'period ' + t.period);
  }
  // every tell is used, and every buried thing has one -- an orphan tell is art nobody sees and a
  // creature with a missing one is the whole feature quietly gone
  const used = new Set(CREATURES.concat([NEST]).map(id => (defOf(id).wake || {}).tell));
  const orphan = Object.keys(tells).filter(k => !used.has(k));
  ok(!orphan.length, 'every tell is used by something', orphan.join(', '));
  // and the bigger the thing, the bigger the patch: a tell that did not distinguish a grub from a maw
  // would be a warning rather than information
  const grubR = tells[D.units.carrion_grub.wake.tell].r, mawR = tells[D.units.carrion_maw.wake.tell].r;
  ok(mawR > grubR, 'the Carrion Maw leaves a bigger mark than the Carrion Grub, so the ground says which is down there', grubR + ' vs ' + mawR);
}

// ================================================================ 6. the capture contract
const GRANT_KEYS = new Set(['unit', 'upg', 'levels', 'cap', 'permanent', 'vision']);
const DER_KEYS = new Set(['ruin', 'rate', 'min', 'gas', 'by', 'hold', 'grants']);
for (const id of DERELICTS) {
  const d = D.buildings[id]; if (!d) continue;
  const c = d.derelict;
  if (!ok(!!c && typeof c === 'object', id + ' carries a `derelict` block')) continue;
  const unknown = Object.keys(c).filter(k => !DER_KEYS.has(k));
  ok(!unknown.length, id + ' derelict block has no unknown fields', unknown.join(', '));
  ok(typeof c.ruin === 'number' && c.ruin > 0 && c.ruin < 0.5, id + ' stands at a fraction of its hit points and it reads as a wreck', 'ruin ' + c.ruin);
  ok(typeof c.rate === 'number' && c.rate > 0 && c.rate <= 40, id + ' repairs at a per-second rate, not a per-frame one', 'rate ' + c.rate);
  ok(typeof c.min === 'number' && c.min >= 0 && typeof c.gas === 'number' && c.gas >= 0, id + ' costs real resources to take', c.min + '/' + c.gas);
  ok(c.min > 0, id + ' costs at least some minerals -- a free capture is not a decision', 'min ' + c.min);
  ok(c.by === 'worker', id + ' is repaired by a worker of ANY race: a derelict only a Terran can take is a Terran bonus, not a map feature', 'by ' + c.by);
  ok(c.hold === true, id + ' declares that ownership follows the building');
  // the derived numbers, which is where a plausible-looking table turns into an unplayable one
  const need = d.hp * (1 - c.ruin);
  ok(need > 20, id + ' needs a real amount of repair', 'hp ' + d.hp + ' ruin ' + c.ruin + ' -> ' + Math.round(need) + ' hp');
  const solo = need / c.rate;
  ok(solo >= 20 && solo <= 180, id + ' takes between 20 and 180 seconds for a single worker (' + Math.round(solo) + ' s)', 'need ' + Math.round(need) + ' at ' + c.rate + ' hp/s');
  // repairTick charges pro rata, so the per-hit-point cost has to be finite and the def's own min/gas
  // (which is what Abilities.repairTick reads) must not be undefined -- the spider-mine NaN again
  ok(typeof d.min === 'number' && typeof d.gas === 'number', id + ' also carries def-level min/gas, so the existing repairTick maths cannot produce NaN', d.min + '/' + d.gas);
  ok(repairableDef(d) === true, id + ' passes repairableDef -- repairing it IS the capture');
  // the grant
  const gr = c.grants;
  if (!ok(!!gr && typeof gr === 'object' && Object.keys(gr).length, id + ' grants something')) continue;
  ok(Object.keys(gr).every(k => GRANT_KEYS.has(k)), id + ' grant has no unknown fields', Object.keys(gr).filter(k => !GRANT_KEYS.has(k)).join(', '));
}
// each grant is a different KIND of grant: the design is three things a tech tree cannot give, not
// three sizes of the same thing
const kinds = DERELICTS.map(id => { const gr = D.buildings[id].derelict.grants; return gr.unit ? 'unit' : gr.upg ? 'upg' : gr.vision ? 'vision' : '?'; });
ok(new Set(kinds).size === DERELICTS.length && !kinds.includes('?'), 'the three derelicts grant three different kinds of thing', kinds.join(', '));

// 1. the unit
const foundry = D.buildings.derelict_foundry;
if (foundry) {
  const u = foundry.derelict.grants.unit;
  ok(!!D.units[u], 'the foundry grants a unit that exists', 'unit ' + u);
  if (D.units[u]) {
    ok(D.units[u].from === 'derelict_foundry', '...and that unit names the foundry as its producer', 'from ' + D.units[u].from);
    ok(D.units[u].min > 0 && D.units[u].sup > 0, '...and still costs minerals and supply to build: the derelict is the permit, not the unit', D.units[u].min + '/' + D.units[u].gas + ' sup ' + D.units[u].sup);
    ok(D.units[u].gw && D.units[u].gw.upgKey === null && !D.units[u].upgA, '...and takes no upgrades, so it is strong at minute six and ordinary at minute twenty', 'upgKey ' + (D.units[u].gw || {}).upgKey + ' upgA ' + D.units[u].upgA);
    ok(typeof D.units[u].hk === 'string' && /^[A-Z]$/.test(D.units[u].hk), '...and has a hotkey for the foundry\'s command card', 'hk ' + D.units[u].hk);
  }
}
// 2. the upgrade
const archive = D.buildings.derelict_archive;
if (archive) {
  const gr = archive.derelict.grants;
  ok(!!gr.upg && typeof gr.upg === 'object', 'the archive grants an upgrade per race');
  ok(Object.keys(gr.upg || {}).sort().join(',') === 'P,T,Z', '...one for each of the three races', Object.keys(gr.upg || {}).join(','));
  for (const [race, key] of Object.entries(gr.upg || {})) {
    ok(!!D.upgrades[key], 'the ' + race + ' grant names a real upgrade', key);
    if (D.upgrades[key]) ok(D.upgrades[key].race === race, '...and it belongs to ' + race, key + ' is ' + D.upgrades[key].race);
  }
  ok(gr.levels >= 1 && gr.levels <= 2, '...one or two levels of it, not a whole line', 'levels ' + gr.levels);
  ok(gr.cap === 3, '...capped at the same 3 the researched line is capped at', 'cap ' + gr.cap);
  ok(gr.permanent === true, '...and it survives losing the building, because an upgrade already on an army cannot be taken back off it');
}
// 3. the vision
const tower = D.buildings.derelict_watchtower;
if (tower) {
  const v = tower.derelict.grants.vision;
  ok(typeof v === 'number' && v >= 12, 'the watchtower grants real vision', 'vision ' + v);
  ok(tower.sight === v, "...and the def's own sight already IS that number, which is why this grant needs no code: G.updateVision marks from units allied with the looker, and the neutral player is allied with nobody", 'sight ' + tower.sight + ' vs grant ' + v);
  ok(!tower.det, '...and it is deliberately not a detector, or item 8 would answer item 1 and cost both their point');
}
// nothing else grew a derelict block
const derIds = Object.keys(D.buildings).filter(k => D.buildings[k].derelict).sort();
ok(derIds.join(',') === DERELICTS.slice().sort().join(','), 'exactly the three derelicts carry a `derelict` block', derIds.join(','));

// ================================================================ 7. the per-map toggle
// Both features are OFF unless a layout asks, and they are asked for the way the sandstorm is. That is
// not a style choice: every layout, mission and balance log here predates them, and a feature that
// turned itself on everywhere would silently change all of them.
for (const [name, table, presets] of [['derelicts', D.derelictPresets, ['sparse', 'standard', 'rich']], ['wildlife', D.wildlifePresets, ['sparse', 'standard', 'infested']]]) {
  if (!ok(!!table && typeof table === 'object', 'DATA.' + name + 'Presets exists')) continue;
  ok(presets.every(k => table[k]), 'DATA.' + name + 'Presets offers ' + presets.join(', '), Object.keys(table).join(','));
  ok(!!table.standard, "DATA." + name + "Presets has a 'standard', because `" + name + ": true` resolves to it");
  for (const [k, p] of Object.entries(table)) {
    const n = p.count !== undefined ? p.count : p.sites;
    ok(typeof n === 'number' && n > 0 && n <= 12, name + '.' + k + ' places a sane number of things', String(n));
    ok(typeof p.minBase === 'number' && p.minBase >= 8, name + '.' + k + ' keeps clear of start locations', 'minBase ' + p.minBase);
    ok(p.mirror === true, name + '.' + k + ' places symmetrically, so no start is nearer to one than another');
    const ids = (p.kinds || []).map(x => Array.isArray(x) ? x[0] : x);
    ok(ids.length > 0 && ids.every(id => !!defOf(id) && defOf(id).race === 'N'), name + '.' + k + ' names only real race-N defs', ids.join(','));
    if (name === 'derelicts') ok(ids.every(id => DERELICTS.includes(id)), 'derelicts.' + k + ' names only derelicts', ids.join(','));
    if (name === 'wildlife') ok(ids.every(id => defOf(id).neutral === true), 'wildlife.' + k + ' names only things nobody owns', ids.join(','));
  }
}
// the resolution rule the map generator will use, exercised here so the shape is pinned before the
// reader exists
const resolve = (v, table) => !v ? null : (table[v === true ? 'standard' : v] || (typeof v === 'object' ? v : null));
ok(resolve(undefined, D.derelictPresets) === null, 'a layout with no `derelicts` key gets no derelicts');
ok(resolve(false, D.derelictPresets) === null, '`derelicts: false` gets none either');
ok(resolve(true, D.derelictPresets) === D.derelictPresets.standard, '`derelicts: true` means the standard preset');
ok(resolve('rich', D.derelictPresets) === D.derelictPresets.rich, "`derelicts: 'rich'` means that preset");
ok(resolve({ count: 1, kinds: ['derelict_archive'] }, D.derelictPresets).count === 1, 'an inline object is taken as the preset itself');
ok(resolve('nonesuch', D.derelictPresets) === null, 'a preset name nobody defined resolves to nothing rather than to a default');

// It is a LAYOUT property, and it is written down as one.
for (const [key, table] of [['derelicts', 'derelictPresets'], ['wildlife', 'wildlifePresets']]) {
  ok(new RegExp('L\\.' + key + '\\s*=').test(DATA_SRC), 'js/data.js documents `L.' + key + '` as the layout property');
  ok(new RegExp('\\b' + table + '\\b').test(DATA_SRC), 'js/data.js names DATA.' + table + ' in the same place');
}
// ...and no layout in the repository turns either on today, which is what "nothing changes silently"
// actually means. When the first derelict map lands, this loop's message says how to update it.
const onNow = [];
for (const [id, L] of Object.entries(LAYOUTS)) { if (L.derelicts) onNow.push(id + ':derelicts'); if (L.wildlife) onNow.push(id + ':wildlife'); }
ok(!onNow.length, 'no existing layout turns either feature on, so every existing map, mission and balance log is unchanged', onNow.join(', '));

// ================================================================ 8. the art
// A missing painter is not an error anywhere in the engine: Sprites.unit falls back to
// UNIT_PAINTERS.marine and Sprites.building to BUILDING_PAINTERS.supply_depot, so a Carrion Maw would
// quietly render as a marine in every colour, on the map and on the command card both. Presence is
// checked, and then each painter is actually RUN at its real size against a recording context, because
// a painter that throws is caught by nothing either -- the draw pass would just lose the frame.
const recorder = () => {
  const calls = { n: 0 }; const bump = () => { calls.n++; };
  const c = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '', lineCap: '', font: '', globalAlpha: 1, globalCompositeOperation: '',
    beginPath: bump, closePath: bump, moveTo: bump, lineTo: bump, arc: bump, ellipse: bump, rect: bump, roundRect: bump,
    quadraticCurveTo: bump, bezierCurveTo: bump, fill: bump, stroke: bump, fillRect: bump, strokeRect: bump, clearRect: bump,
    fillText: bump, save: bump, restore: bump, translate: bump, scale: bump, rotate: bump, setTransform: bump, setLineDash: bump,
    createRadialGradient: () => ({ addColorStop() { } }), createLinearGradient: () => ({ addColorStop() { } }),
  };
  return { c, calls };
};
// the three animation states a unit painter is asked for: idle, mid-stride, mid-swing
const STATES = [{ walk: null, atk: null, idle: 0.5 }, { walk: 0.33, atk: null }, { walk: null, atk: 0.5 }];
for (const id of ALL_N_UNITS) {
  const d = D.units[id]; if (!d) continue;
  if (!ok(typeof UNIT_PAINTERS[id] === 'function', id + ' has its own painter in UNIT_PAINTERS (or it renders as a marine)')) continue;
  const { c, calls } = recorder(); let err = null;
  try { for (const st of STATES) UNIT_PAINTERS[id](PaintHelpers(c), d.r, '#f40404', '#900202', st); } catch (e) { err = e; }
  ok(!err, id + ' painter runs at r=' + d.r + ' in three animation states without throwing', err && String(err.message || err));
  ok(calls.n > 20, id + ' painter actually draws something', calls.n + ' canvas calls');
}
for (const [k, t] of Object.entries(D.buriedTells || {})) {
  const p = UNIT_PAINTERS[t.sprite]; if (!ok(typeof p === 'function', 'tell "' + k + '" painter ' + t.sprite + ' exists')) continue;
  const { c, calls } = recorder(); let err = null;
  // a tell is called with the patch radius in pixels, and with the same null animation a still object gets
  try { p(PaintHelpers(c), t.r * TILE, '#f40404', '#900202', { walk: null, atk: null }); } catch (e) { err = e; }
  ok(!err, 'tell "' + k + '" painter runs at ' + Math.round(t.r * TILE) + 'px without throwing', err && String(err.message || err));
  ok(calls.n > 8, 'tell "' + k + '" painter draws something', calls.n + ' canvas calls');
}
for (const id of NEUTRAL_BUILDINGS) {
  const d = D.buildings[id]; if (!d) continue;
  if (!ok(typeof BUILDING_PAINTERS[id] === 'function', id + ' has its own painter in BUILDING_PAINTERS (or it renders as a supply depot)')) continue;
  const { c, calls } = recorder(); let err = null;
  try { BUILDING_PAINTERS[id](PaintHelpers(c), c, d.w * TILE, d.h * TILE, '#f40404', '#900202'); } catch (e) { err = e; }
  ok(!err, id + ' painter runs at ' + (d.w * TILE) + 'x' + (d.h * TILE) + ' without throwing', err && String(err.message || err));
  ok(calls.n > 20, id + ' painter actually draws something', calls.n + ' canvas calls');
}
// The animated overlays. A derelict's is the ONLY thing in the draw pass that can know it was captured
// -- Sprites.building caches per (id, colour) and hands the painter no unit -- so it is run in all three
// states the field can be in, including the undefined a command-card icon or a test passes.
for (const id of NEUTRAL_BUILDINGS) {
  const an = BUILDING_ANIM[id]; if (!ok(typeof an === 'function', id + ' has an animated overlay')) continue;
  const d = D.buildings[id]; let err = null; const { c } = recorder();
  try {
    for (const captured of [true, false, undefined])
      for (const f of [0, 17, 60, 199]) an(c, { id: 7, done: true, unpowered: false, cooldown: 0, facing: 0, captured, _alpha: 1 }, 100, 100, d.w * TILE, d.h * TILE, f);
  } catch (e) { err = e; }
  ok(!err, id + ' overlay runs captured, uncaptured and with the field absent, at four frames, without throwing', err && String(err.message || err));
}
// and the derelict overlays must actually be a state change: nothing while it is a wreck, something
// once it is taken. A ruin that lights up before you capture it is a lie about the map.
for (const id of DERELICTS) {
  const an = BUILDING_ANIM[id]; if (typeof an !== 'function') continue;
  const d = D.buildings[id];
  const draw = captured => { const { c, calls } = recorder(); for (const f of [0, 17, 60, 199]) an(c, { id: 7, done: true, unpowered: false, cooldown: 0, facing: 0, captured }, 100, 100, d.w * TILE, d.h * TILE, f); return calls.n; };
  ok(draw(undefined) === 0, id + ' draws no overlay while it is still a wreck', draw(undefined) + ' canvas calls');
  ok(draw(true) > 0, id + ' lights up once `u.captured` is set', draw(true) + ' canvas calls');
}

console.log('\n' + (fail ? `FAIL  ${pass} passed, ${fail} failed` : `ALL PASS  ${pass} passed, 0 failed`));
process.exit(fail ? 1 : 0);
