// The nine buildings M11 wave two adds -- a field hospital, a jamming tower and a wall for each race --
// and the two things about them that are easy to get wrong and invisible until someone plays.
//
//   node test/newbuildings.js
//
// The first is REACHABILITY, which test/techtree.js already guards for the whole tree; this file checks
// the same thing from the other end, over buildings only, so the two would have to fail together to let
// an unbuildable structure through.
//
// The second is the COMMAND CARD, which no other check has ever looked at as a budget. UI.buildCard
// hands build-menu entry `i` the card slot `i` and then puts Cancel in slot 8, and both UI.cardRect and
// HUD's override of it lay the card out as a fixed three-by-three. So a page holds EIGHT buildings: a
// ninth entry is drawn underneath Cancel and a tenth lands off the bottom of the console, and neither
// throws, logs, or fails any existing test. Protoss was already at sixteen of sixteen before this
// milestone, which is the whole reason its three are morphs of the Shield Battery rather than menu
// entries, and it is exactly the kind of fact that gets forgotten and then rediscovered by a player.
// Asserting the ceiling here means the next person to add a building finds out from a test.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');

const ctx = { console: { log() { }, warn() { }, error() { } }, Math };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'sprites_units', 'sprites_buildings']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
// `const` in a vm context is not an own property of the context object, so these come back through the
// evaluator rather than off ctx -- the same trick test/techtree.js uses.
const D = vm.runInContext('DATA', ctx);
const PAINTERS = vm.runInContext('BUILDING_PAINTERS', ctx);
const ANIMS = vm.runInContext('BUILDING_ANIM', ctx);
const HELPERS = vm.runInContext('PaintHelpers', ctx);
const TILE = vm.runInContext('TILE', ctx);

let pass = 0, fail = 0;
// Returns the condition, so `if (!ok(...)) continue;` skips the checks that would only cascade off one
// that already failed -- and, more to the point, does NOT skip them when it passed.
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } return !!c; };

// ---------------------------------------------------------------- what was added
// Spelled out rather than derived, so a rename or a dropped building is a failure and not a silently
// smaller test. The kind column is what the rest of the file groups by.
const NEW = [
  { id: 'aid_station', race: 'T', kind: 'mend', name: 'Aid Station', menu: 'adv' },
  { id: 'scrambler_mast', race: 'T', kind: 'blind', name: 'Scrambler Mast', menu: 'adv' },
  { id: 'blast_barricade', race: 'T', kind: 'wall', name: 'Blast Barricade', menu: 'adv' },
  { id: 'mending_pool', race: 'Z', kind: 'mend', name: 'Mending Pool', menu: 'adv' },
  { id: 'miasma_gland', race: 'Z', kind: 'blind', name: 'Miasma Gland', menu: 'adv' },
  { id: 'carapace_ridge', race: 'Z', kind: 'wall', name: 'Carapace Ridge', menu: 'basic' },
  { id: 'rejuvenation_shrine', race: 'P', kind: 'mend', name: 'Rejuvenation Shrine', morphOf: 'shield_battery' },
  { id: 'null_obelisk', race: 'P', kind: 'blind', name: 'Null Obelisk', morphOf: 'shield_battery' },
  { id: 'warded_bastion', race: 'P', kind: 'wall', name: 'Warded Bastion', morphOf: 'shield_battery' },
];

// ---------------------------------------------------------------- 1. they exist, with sane numbers
for (const n of NEW) {
  const d = D.buildings[n.id];
  if (!ok(!!d, n.id + ' exists in DATA.buildings')) continue;
  ok(d.name === n.name, n.id + ' is named "' + n.name + '"', 'got "' + d.name + '"');
  ok(d.race === n.race, n.id + ' belongs to ' + n.race, 'race ' + d.race);
  ok(d.isBuilding === true && d.kind === 'building', n.id + ' is flagged as a building');
  ok(d.min > 0 && d.min <= 200 && d.gas >= 0 && d.gas <= 150, n.id + ' costs something and is not a tech building', d.min + '/' + d.gas);
  ok(d.hp >= 300 && d.hp <= 1200, n.id + ' has building-scale hit points', 'hp ' + d.hp);
  ok(d.time >= 200 && d.time <= 1200, n.id + ' builds in a sane number of frames', 'time ' + d.time);
  ok(d.w >= 2 && d.w <= 4 && d.h >= 2 && d.h <= 3, n.id + ' has a legal footprint', d.w + 'x' + d.h);
  ok(d.sight >= 1, n.id + ' can see at least one tile', 'sight ' + d.sight);
  ok(typeof d.hk === 'string' && /^[A-Z]$/.test(d.hk), n.id + ' has a single-letter hotkey', 'hk ' + d.hk);
  ok(!d.produces.length && !d.upg.length && !d.tech.length && !d.addons.length,
    n.id + ' produces and researches nothing -- it is support, not a production line');
  ok(!d.depot && !d.spawnsLarva && !d.onGeyser && !d.sup, n.id + ' is not a town hall, a gas building or supply');
  ok(!d.gw && !d.aw, n.id + ' carries no weapon');
}

// exactly one of each kind per race, counted over the WHOLE table, so a second field hospital added
// somewhere else in data.js is a failure here rather than a surprise in a game
for (const race of ['T', 'Z', 'P']) for (const kind of ['mend', 'blind', 'wall']) {
  const found = Object.values(D.buildings).filter(d => d.race === race && (kind === 'wall' ? !!d.wall : (d.aura || {}).kind === kind));
  ok(found.length === 1, race + ' has exactly one ' + (kind === 'wall' ? 'wall' : kind === 'mend' ? 'field hospital' : 'jamming tower'),
    found.length + ': ' + found.map(d => d.id).join(', '));
}

// ---------------------------------------------------------------- 2. the aura data
// The contract is documented above the Terran building block in js/data.js. Nothing reads it yet, which
// is exactly why it needs a shape check: a typo in a field nobody consumes is silent until the sim
// change lands, and then it looks like a bug in the sim change.
const AURA_KEYS = new Set(['kind', 'r', 'affects', 'stacks', 'hp', 'sh', 'sight', 'detect']);
for (const n of NEW.filter(x => x.kind !== 'wall')) {
  const d = D.buildings[n.id]; if (!d) continue;
  const a = d.aura;
  if (!ok(!!a && typeof a === 'object', n.id + ' carries an aura')) continue;
  ok(Object.keys(a).every(k => AURA_KEYS.has(k)), n.id + ' aura has no unknown fields', Object.keys(a).filter(k => !AURA_KEYS.has(k)).join(', '));
  ok(a.kind === n.kind, n.id + ' aura kind is "' + n.kind + '"', 'got ' + a.kind);
  ok(typeof a.r === 'number' && a.r >= 4 && a.r <= 12, n.id + ' aura radius is a sane number of tiles', 'r ' + a.r);
  ok(a.affects === (n.kind === 'mend' ? 'ally' : 'enemy'), n.id + ' aura affects the right side', 'affects ' + a.affects);
  ok(a.stacks === false, n.id + ' aura declares whether it stacks, and says no', 'stacks ' + a.stacks);
  if (n.kind === 'mend') {
    ok((a.hp || 0) > 0 || (a.sh || 0) > 0, n.id + ' mends hit points or shields');
    ok((a.hp || 0) >= 0 && (a.hp || 0) <= 5 && (a.sh || 0) >= 0 && (a.sh || 0) <= 6, n.id + ' mends at a per-second rate, not a per-frame one', 'hp ' + a.hp + ' sh ' + a.sh);
    ok(a.sight === undefined && a.detect === undefined, n.id + ' carries no blind-only fields');
    // shields only mean anything to a race that has them
    ok(!a.sh || D.buildings[n.id].race === 'P', n.id + ' only restores shields if its race has any');
  } else {
    ok(typeof a.sight === 'number' && a.sight > 0 && a.sight < 1, n.id + ' cuts sight by a fraction, never to zero and never upward', 'sight ' + a.sight);
    ok(a.detect === undefined || a.detect === true, n.id + ' detect flag is true or absent', 'detect ' + a.detect);
    ok(a.hp === undefined && a.sh === undefined, n.id + ' carries no mend-only fields');
  }
}
for (const n of NEW.filter(x => x.kind === 'wall')) {
  const d = D.buildings[n.id]; if (!d) continue;
  ok(d.wall === true, n.id + ' is flagged `wall: true`, which is how a wall is selected for');
  ok(!d.aura, n.id + ' has no aura -- a wall is a wall');
  ok(d.hp >= 600, n.id + ' is high-hp, which is the whole point of it', 'hp ' + d.hp);
  ok(d.min <= 100 && !d.gas, n.id + ' is cheap and costs no gas', d.min + '/' + d.gas);
  ok(d.armor >= 2, n.id + ' is armoured', 'armor ' + d.armor);
}
// nothing else in the table grew an aura or a wall flag by accident
const auraIds = Object.values(D.buildings).filter(d => d.aura).map(d => d.id).sort();
const wantAura = NEW.filter(n => n.kind !== 'wall').map(n => n.id).sort();
ok(auraIds.join(',') === wantAura.join(','), 'the aura buildings are exactly the six intended', auraIds.join(','));

// ---------------------------------------------------------------- 3. reachability
// A forward closure over buildings alone, from the race's town hall. Deliberately not a call into
// test/techtree.js: two independent closures that agree are worth more than one shared one.
const EQUIV = {};
for (const d of Object.values(D.buildings)) { if (d.morphTo) (EQUIV[d.morphTo] = EQUIV[d.morphTo] || []).push(d.id); }
// a Lair satisfies a Hatchery requirement, so walk the morph chain the other way too
const satisfies = {}; for (const d of Object.values(D.buildings)) { let cur = d; const seen = new Set(); while (cur && cur.morphTo && !seen.has(cur.id)) { seen.add(cur.id); (satisfies[cur.id] = satisfies[cur.id] || []).push(cur.morphTo); cur = D.buildings[cur.morphTo]; } }
const RACE_HALL = { T: 'command_center', Z: 'hatchery', P: 'nexus' };
const reach = {};
for (const race of ['T', 'Z', 'P']) {
  const have = new Set([RACE_HALL[race]]);
  const hasB = id => have.has(id) || Object.values(D.buildings).some(b => have.has(b.id) && (satisfies[b.id] || []).includes(id));
  for (let i = 0; i < 40; i++) {
    let grew = false;
    for (const d of Object.values(D.buildings)) {
      if (d.race !== race || have.has(d.id) || d.tier === 'none') continue;
      if ((d.req || []).some(r => !D.buildings[r] || !hasB(r))) continue;
      if (d.tier === 'addon') { const p = D.buildings[d.parent]; if (!p || !have.has(d.parent) || !(p.addons || []).includes(d.id)) continue; }
      if (d.tier === 'morph') { const from = Object.values(D.buildings).find(b => b.morphTo === d.id || (b.morphOptions || []).includes(d.id)); if (!from || !have.has(from.id)) continue; }
      have.add(d.id); grew = true;
    }
    if (!grew) break;
  }
  reach[race] = have;
}
for (const n of NEW) {
  const d = D.buildings[n.id]; if (!d) continue;
  const badReq = (d.req || []).filter(r => !D.buildings[r] && !D.techs[r]);
  ok(!badReq.length, n.id + ' names only real prerequisites', badReq.join(', '));
  const wrongRace = (d.req || []).filter(r => D.buildings[r] && D.buildings[r].race !== d.race);
  ok(!wrongRace.length, n.id + ' only requires its own race\'s buildings', wrongRace.join(', '));
  ok(reach[n.race].has(n.id), n.id + ' is reachable from a bare ' + RACE_HALL[n.race], 'req ' + (d.req || []).join(','));
}

// ---------------------------------------------------------------- 4. how a human reaches them
// Every buildable structure must be on a build page or be a morph somebody offers, or it exists only in
// the data. That is a whole-table invariant and it is checked as one: the new buildings are the reason
// it is here but a regression anywhere is worth the same failure.
for (const race of ['T', 'Z', 'P']) {
  const menu = D.buildMenu[race];
  const listed = new Set([].concat(menu.basic, menu.adv));
  for (const page of ['basic', 'adv']) {
    const ids = menu[page];
    // THE CEILING. See the header: slot 8 is Cancel and the card is three by three.
    ok(ids.length <= 8, race + ' ' + page + ' build page fits the nine-slot command card (' + ids.length + ' of 8)');
    const unknown = ids.filter(id => !D.buildings[id]);
    ok(!unknown.length, race + ' ' + page + ' build page names only real buildings', unknown.join(', '));
    // `tier` decides which page test/playtest_bot.js presses, so it has to agree with the page
    const misfiled = ids.filter(id => D.buildings[id] && D.buildings[id].tier !== page);
    ok(!misfiled.length, race + ' ' + page + ' build page entries all have tier "' + page + '"', misfiled.map(id => id + ' is ' + D.buildings[id].tier).join(', '));
    const hk = {}; const clash = [];
    for (const id of ids) { const k = D.buildings[id].hk; if (hk[k]) clash.push(hk[k] + ' and ' + id + ' both on ' + k); hk[k] = id; }
    ok(!clash.length, race + ' ' + page + ' build page has no hotkey collision', clash.join('; '));
  }
  // anything with tier basic/adv is on a page; anything on a page has tier basic/adv (checked above)
  const orphan = Object.values(D.buildings).filter(d => d.race === race && (d.tier === 'basic' || d.tier === 'adv') && !listed.has(d.id)).map(d => d.id);
  ok(!orphan.length, race + ': every basic/advanced building is on a build page', orphan.join(', '));
  // and every morph is offered by something
  const unoffered = Object.values(D.buildings).filter(d => d.race === race && d.tier === 'morph'
    && !Object.values(D.buildings).some(b => b.morphTo === d.id || (b.morphOptions || []).includes(d.id))).map(d => d.id);
  ok(!unoffered.length, race + ': every morph building is offered by some building', unoffered.join(', '));
}

// The Protoss three hang off the Shield Battery's card, which had no buttons at all before this. Build
// the card the way UI.buildCard would for a single finished building and check nothing shares a key.
for (const host of [...new Set(NEW.filter(n => n.morphOf).map(n => n.morphOf))]) {
  const d = D.buildings[host];
  if (!ok(!!d, 'the morph host ' + host + ' exists')) continue;
  const offered = d.morphOptions || [];
  for (const n of NEW.filter(x => x.morphOf === host)) ok(offered.includes(n.id), host + ' offers ' + n.id + ' as a morph');
  const card = [];
  for (const id of d.produces) card.push([D.units[id].hk, id]);
  for (const id of d.upg) card.push([D.upgrades[id].hk, 'upgrade ' + id]);
  for (const id of d.tech) card.push([D.techs[id].hk, 'tech ' + id]);
  for (const id of d.addons) card.push([D.buildings[id].hk, id]);
  if (d.morphTo) card.push([D.buildings[d.morphTo].hk, d.morphTo]);
  for (const id of offered) card.push([D.buildings[id].hk, id]);
  for (const id of (d.abil || [])) card.push([D.abilities[id].hk, 'ability ' + id]);
  if (d.produces.length || d.spawnsLarva) card.push(['R', 'Set Rally']);
  if (d.spawnsLarva) card.push(['S', 'Select Larvae']);
  if (d.canLift) card.push(['L', 'Lift Off']);
  const seen = {}, clash = [];
  for (const [k, what] of card) { if (seen[k]) clash.push(seen[k] + ' and ' + what + ' both on ' + k); seen[k] = what; }
  ok(!clash.length, host + "'s command card has no hotkey collision", clash.join('; '));
  ok(card.length <= 8, host + "'s command card fits the nine-slot card (" + card.length + ' of 8)');
  // a morph must not change the footprint: G.morphBuilding swaps the def and never re-blocks the map
  const wrong = offered.filter(id => D.buildings[id].w !== d.w || D.buildings[id].h !== d.h);
  ok(!wrong.length, host + "'s morphs all keep its " + d.w + 'x' + d.h + ' footprint', wrong.join(', '));
  // and it must not claim shields the morph cannot give it: morphBuilding updates maxHp, not maxSh
  const shWrong = offered.filter(id => (D.buildings[id].sh || 0) !== (d.sh || 0));
  ok(!shWrong.length, host + "'s morphs all declare its " + (d.sh || 0) + ' shields, which is what they will actually have', shWrong.join(', '));
}

// ---------------------------------------------------------------- 5. art
// A missing painter is not an error anywhere in the engine: Sprites.building falls back to
// BUILDING_PAINTERS.supply_depot, so a new Protoss structure would quietly render as a Terran depot in
// every colour, on the map and on the command card both. Presence is checked, and then the painter is
// actually run at the building's real footprint against a recording context, because a painter that
// throws is caught by nothing either -- the draw pass would just lose the frame.
const recorder = () => {
  const calls = { n: 0 };
  const bump = () => { calls.n++; };
  const c = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '', lineCap: '', font: '', globalAlpha: 1, globalCompositeOperation: '',
    beginPath: bump, closePath: bump, moveTo: bump, lineTo: bump, arc: bump, ellipse: bump, rect: bump, roundRect: bump,
    quadraticCurveTo: bump, bezierCurveTo: bump, fill: bump, stroke: bump, fillRect: bump, strokeRect: bump, clearRect: bump,
    fillText: bump, save: bump, restore: bump, translate: bump, scale: bump, rotate: bump, setTransform: bump, setLineDash: bump,
    createRadialGradient: () => ({ addColorStop() { } }), createLinearGradient: () => ({ addColorStop() { } }),
  };
  return { c, calls };
};
for (const n of NEW) {
  const d = D.buildings[n.id]; if (!d) continue;
  ok(typeof PAINTERS[n.id] === 'function', n.id + ' has its own painter in BUILDING_PAINTERS (or it renders as a supply depot)');
  if (typeof PAINTERS[n.id] !== 'function') continue;
  const { c, calls } = recorder();
  let err = null;
  try { PAINTERS[n.id](HELPERS(c), c, d.w * TILE, d.h * TILE, '#f40404', '#900202'); } catch (e) { err = e; }
  ok(!err, n.id + ' painter runs at ' + (d.w * TILE) + 'x' + (d.h * TILE) + ' without throwing', err && String(err.message || err));
  ok(calls.n > 20, n.id + ' painter actually draws something', calls.n + ' canvas calls');
}
// the animated overlays are optional, but one that throws breaks the draw pass for everything behind it
for (const n of NEW) {
  const an = ANIMS[n.id]; if (!an) continue;
  const d = D.buildings[n.id];
  const { c } = recorder();
  const fake = { id: 7, done: true, unpowered: false, cooldown: 0, facing: 0, _alpha: 1 };
  let err = null;
  try { for (const f of [0, 17, 60, 199]) an(c, fake, 100, 100, d.w * TILE, d.h * TILE, f); } catch (e) { err = e; }
  ok(!err, n.id + ' animated overlay runs at four different frames without throwing', err && String(err.message || err));
}

console.log(fail ? `FAIL  ${pass} passed, ${fail} failed` : `ALL PASS  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
