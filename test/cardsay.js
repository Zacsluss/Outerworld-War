// Every greyed command-card button must say why it is greyed.
//   node test/cardsay.js [--verbose]
//
// A player reported "the terran barracks cant get its side building to enable firebats, medics,
// ghosts". The requirement was not broken -- the Academy is a standalone building in Brood War too.
// What was broken is that the game never said so: both dispatchers skipped a disabled button's
// handler, so pressing F on a Barracks with no Academy was indistinguishable from a dead key. The
// build menu even *looked* like it handled this, with a 'Requires ' + p.missingReq(d) branch inside
// its handler, unreachable for exactly the same reason. Player.missingReq already knew, and nothing
// ever asked it on the command card's behalf.
//
// So this walks the command card in a lot of states -- a worker with the basic and advanced build
// menus open, every building in the game both without and with its prerequisites, a larva, an egg, a
// building mid-construction, a unit -- and for every button it finds:
//
//   * enabled === false  -> pressing it through UI.press must produce a player message.
//   * enabled !== false  -> pressing it must do something observable. An enabled button that is a
//                           dead key is the same defect wearing the opposite colour.
//
// Each press is isolated: state is restored between presses, and the scenario is rebuilt from scratch
// whenever a press did something a cheap restore cannot undo (a larva that morphed into an egg).
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; if (VERBOSE) console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); } };

const errors = [];
const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { } });
const ctx = {
  console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ')) },
  Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
  localStorage: { getItem() { return null; }, setItem() { } },
  document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' },
};
ctx.window = ctx; vm.createContext(ctx);
// ui.js is the point of this test, so the whole render/input half has to load with it, in the order
// index.html uses -- UI.start calls Render.reset which reaches Terrain, Sprites and FX, and hud.js
// overrides UI's drawing methods so it has to come last. audio.js is left out on purpose: Sound lives
// in ui.js, and Voice/Music are both reached behind a `typeof ... !== 'undefined'` guard.
const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'atlas', 'fx', 'render', 'editor', 'ui', 'hud'];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const run = src => vm.runInContext(src, ctx);
const json = src => JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));

// ---------------------------------------------------------------- the rig
run(`(() => {
  this.begin = (race) => {
    UI.start({ players: [{ race, human: true, name: 'Zac', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'Computer', team: 2 }], seed: 5, layout: 'temple' });
    if (UI.menu) throw new Error('a menu is up after starting: ' + UI.menu);
    G.recording = false;
    // Supply is not what this test is about, and a refused unit would be a different message. The
    // food cheat is the games own switch for that, and it only applies to the human.
    G.cheats.food = true;
    this.p = G.players[0];
    this.base = { x: this.p.startX, y: this.p.startY };
  };

  // ---- build a scenario from scratch ----
  this.build = (scn) => {
    const p = this.p, B = this.base;
    for (const u of G.units.slice()) if (u.owner === 0) G.kill(u, null, true);
    G.units = G.units.filter(u => u.alive);
    p.tech = new Set(scn.techs || []); p.researching = new Set(scn.researching || []); p.upg = {};
    p.minerals = 20000; p.gas = 20000; p.nukes = 0; p.msgs = []; p.lastAlert = {};
    const mk = (id, done) => {
      const n = this.slot++;
      const u = G.spawnUnit(id, 0, B.x + ((n % 7) - 3) * 5 * TILE, B.y + (Math.floor(n / 7) - 2) * 5 * TILE);
      if (u.isBuilding && done !== false) { u.done = true; u.hp = u.maxHp; u.sh = u.maxSh; u.progress = u.def.time; }
      return u;
    };
    this.slot = 0;
    // A Pylon is not optional for Protoss: queueTech and queueUpgrade both refuse an unpowered
    // building, and that refusal is silent, which would look like the very defect under test.
    const have = (scn.have || []).slice();
    if (scn.race === 'P' && !have.includes('pylon')) have.push('pylon');
    const made = {};
    for (const id of have) made[id] = mk(id);
    if (scn.race === 'P') G.map.recomputePsi(0, G.units);
    if (scn.race === 'Z') G.map.recomputeCreep(G.units);

    let sel = null;
    if (scn.sel === 'worker') sel = G.spawnUnit(RACE_INFO[scn.race].worker, 0, B.x, B.y + 3 * TILE);
    else if (scn.sel === 'larva') { const h = made[RACE_INFO.Z.hall] || mk(RACE_INFO.Z.hall); G.spawnLarva(h); sel = h.larvae[h.larvae.length - 1]; }
    else if (scn.sel === 'egg') { const h = made[RACE_INFO.Z.hall] || mk(RACE_INFO.Z.hall); G.spawnLarva(h); const l = h.larvae[h.larvae.length - 1]; G.applying = true; try { G.larvaMorph(l, 'zergling'); } finally { G.applying = false; } sel = l; }
    else if (scn.unit) sel = G.spawnUnit(scn.unit, 0, B.x, B.y + 3 * TILE);
    else if (scn.units) { this.multi = scn.units.map((id, i) => G.spawnUnit(id, 0, B.x + i * 24, B.y + 3 * TILE)); sel = this.multi[0]; }
    else if (scn.unfinished) { sel = mk(scn.unfinished, false); sel.done = false; sel.progress = Math.floor(sel.def.time / 3); sel.hp = Math.max(1, sel.maxHp * 0.4); }
    else sel = made[scn.sel] || mk(scn.sel);
    // an add-on already attached to the selected building, which is its own branch of buildCard
    if (scn.addon) { const a = mk(scn.addon, true); a.parent = sel; sel.addon = a; if (scn.hasNuke) a.hasNuke = true; }
    // Give a mobile selection something to interrupt and something to carry. Otherwise Stop and Return
    // Cargo are genuine no-ops in the state under test -- an idle unit told to stop stays idle -- and
    // the "an enabled button must do something" check would flag correct behaviour.
    const picked = scn.units ? this.multi : [sel];
    for (const s of picked) if (s && !s.isBuilding && !s.def.larva && !s.def.egg) {
      G.applying = true; try { s.setOrder({ type: 'move', x: B.x + 8 * TILE, y: B.y }); } finally { G.applying = false; }
      if (s.def.worker) { s.carrying = { type: 'mineral', amt: 8 }; s.lastRes = null; }
    }
    G.recomputeSupply();
    UI.selection = picked.slice(); UI.pending = null; UI.placing = null; UI.cardMenu = scn.cardMenu || null;
    this.sel = sel; this.scn = scn;
    this.keep = new Set(G.units.filter(u => u.alive && u.owner === 0).map(u => u.id));
    this.selDef = sel.def.id;
    this.snapAddons = new Map(G.units.filter(u => u.alive && u.owner === 0).map(u => [u.id, u.addon || null]));
    this.snapNuke = new Set(G.units.filter(u => u.alive && u.owner === 0 && u.hasNuke).map(u => u.id));
    return this.card();
  };

  this.card = () => UI.currentCard().map(b => ({ slot: b.slot, label: b.label, hk: b.hk, enabled: b.enabled, why: b.why || null, dim: !!b.dim }));

  // A signature of everything a command-card button is capable of changing. If pressing a button
  // leaves this identical, the button was a dead key.
  this.sig = () => {
    const p = this.p, own = G.units.filter(u => u.alive && u.owner === 0);
    return JSON.stringify({
      pending: UI.pending ? UI.pending.kind + ':' + (UI.pending.abil || '') : null,
      placing: UI.placing ? UI.placing.def.id + (UI.placing.land ? ':land' : '') : null,
      // cardPage is here because of FIXLIST-M14 B5, and the story is worth the line. The page turn
      // used to be pushed onto a slot a flowed button already occupied, and pressSlot looks a button
      // up with find(x => x.slot === slot) -- which returned the FLOWED one. So this harness had
      // never once pressed a page button, for exactly the reason a player could not: it was underneath
      // something else. With the collision fixed the press lands, and without this field the only thing
      // it changes is invisible here and it reads as a dead key.
      cardPage: UI.cardPage,
      cardMenu: UI.cardMenu, msgs: p.msgs.length,
      min: Math.round(p.minerals), gas: Math.round(p.gas), res: [...p.researching].sort().join(','),
      units: own.map(u => u.def.id + '/' + u.prod.length + '/' + u.order.type + (u.lifted ? '/lift' : '') + (u.burrowed ? '/burr' : '') + (u.addon ? '/+' + u.addon.def.id : '')).sort().join(' '),
    });
  };

  // Cheap undo. Anything it cannot undo is reported, and the caller rebuilds the scenario instead.
  this.restore = () => {
    const p = this.p;
    UI.pending = null; UI.placing = null; UI.cardMenu = this.scn.cardMenu || null; UI.cardPage = 0;
    p.minerals = 20000; p.gas = 20000; p.msgs = []; p.lastAlert = {};
    p.tech = new Set(this.scn.techs || []); p.researching = new Set(this.scn.researching || []); p.upg = {};
    for (const u of G.units.slice()) if (u.alive && u.owner === 0 && !this.keep.has(u.id)) G.kill(u, null, true);
    G.units = G.units.filter(u => u.alive);
    for (const u of G.units) {
      if (!u.alive || u.owner !== 0) continue;
      u.prod.length = 0; u.lifted = false; u.burrowed = false; u.hasNuke = this.snapNuke.has(u.id);
      u.addon = this.snapAddons.has(u.id) ? this.snapAddons.get(u.id) : null;
      if (u.addon && !u.addon.alive) u.addon = null;
      if (!u.isBuilding) u.applyOrder({ type: 'idle' });
    }
    G.recomputeSupply();
    // did the press do something irreversible to the thing we had selected?
    return this.sel.alive && this.sel.def.id === this.selDef;
  };

  // Press one button by slot, with the card rebuilt first (UI.press is reached from a hotkey and from
  // a click, and both rebuild the card through UI.currentCard -- never a cached one).
  this.pressSlot = (slot) => {
    const p = this.p;
    p.msgs = []; p.lastAlert = {}; // msg() dedupes the same text for 72 frames and the frame never advances here
    const before = this.sig();
    const b = UI.currentCard().find(x => x.slot === slot);
    if (!b) return { gone: true };
    const rec = { slot: b.slot, label: b.label, hk: b.hk, enabled: b.enabled === false ? false : true, why: b.why || null, dim: !!b.dim };
    UI.press(b);
    rec.said = p.msgs.map(m => m.text);
    rec.changed = this.sig() !== before;
    rec.clean = this.restore();
    return rec;
  };
})();`);

// ---------------------------------------------------------------- the states to walk
const tables = json(`(() => {
  const out = { races: {} };
  for (const race of ['T', 'Z', 'P']) {
    out.races[race] = {
      hall: RACE_INFO[race].hall, worker: RACE_INFO[race].worker,
      buildings: Object.entries(DATA.buildings).filter(([, d]) => d.race === race).map(([id]) => id),
      all: Object.entries(DATA.buildings).filter(([, d]) => d.race === race && d.tier !== 'addon').map(([id]) => id),
      addons: Object.entries(DATA.buildings).filter(([, d]) => d.race === race && d.tier === 'addon').map(([id, d]) => ({ id, parent: d.parent, tech: d.tech || [], produces: d.produces || [] })),
      // buildings that research something themselves rather than through an add-on: these are the ones
      // whose "Already researching." branch works, and it needs positive coverage too
      researchers: Object.entries(DATA.buildings).filter(([, d]) => d.race === race && d.tier !== 'addon' && ((d.tech || []).length || (d.upg || []).length)).map(([id, d]) => ({ id, tech: (d.tech || [])[0] || null, upg: (d.upg || [])[0] || null })),
      units: Object.entries(DATA.units).filter(([, u]) => u.race === race && !u.larva && !u.egg && !u.notUnit).map(([id]) => id),
    };
  }
  return out;
})()`);

const scenarios = [];
for (const race of ['T', 'Z', 'P']) {
  const T = tables.races[race];
  const bare = [T.hall];
  const full = T.all.slice();           // one of every non-add-on building: every requirement satisfied
  // 1. the worker card, and the two build menus behind B and V
  scenarios.push({ race, name: race + ' worker, no menu', have: bare, sel: 'worker' });
  scenarios.push({ race, name: race + ' worker, basic build menu (nothing built yet)', have: bare, sel: 'worker', cardMenu: 'basic' });
  scenarios.push({ race, name: race + ' worker, advanced build menu (nothing built yet)', have: bare, sel: 'worker', cardMenu: 'adv' });
  scenarios.push({ race, name: race + ' worker, basic build menu (everything built)', have: full, sel: 'worker', cardMenu: 'basic' });
  scenarios.push({ race, name: race + ' worker, advanced build menu (everything built)', have: full, sel: 'worker', cardMenu: 'adv' });
  // 2. every building, with nothing else on the map and then with everything on the map
  for (const id of T.buildings) {
    scenarios.push({ race, name: race + ' ' + id + ' alone (no prerequisites)', have: [T.hall, id], sel: id });
    scenarios.push({ race, name: race + ' ' + id + ' with every building present', have: full.includes(id) ? full : full.concat([id]), sel: id });
  }
  // 3. every add-on, attached and finished, which is its own branch of buildCard
  for (const a of T.addons) {
    scenarios.push({ race, name: race + ' ' + a.parent + ' with a finished ' + a.id, have: [T.hall, a.parent], sel: a.parent, addon: a.id });
    scenarios.push({ race, name: race + ' ' + a.parent + ' with a finished ' + a.id + ', everything built', have: full, sel: a.parent, addon: a.id });
    // an add-on tech already being researched elsewhere: the case the non-add-on branch handles with
    // "Already researching." and this one does not
    for (const t of a.tech.slice(0, 1)) scenarios.push({ race, name: race + ' ' + a.parent + '/' + a.id + ' while ' + t + ' is already being researched', have: full, sel: a.parent, addon: a.id, researching: [t] });
    // an add-on that produces something it already holds (a Nuclear Silo with a nuke ready)
    if (a.produces.includes('nuke')) scenarios.push({ race, name: race + ' ' + a.parent + '/' + a.id + ' with a nuke already built', have: full, sel: a.parent, addon: a.id, hasNuke: true });
  }
  // 4. a tech or an upgrade already under way somewhere else: the greyed button should say so rather
  // than repeat a requirement it does have
  for (const b of T.researchers) {
    if (b.tech) scenarios.push({ race, name: race + ' ' + b.id + ' while its own ' + b.tech + ' is already being researched', have: full, sel: b.id, researching: [b.tech] });
    if (b.upg) scenarios.push({ race, name: race + ' ' + b.id + ' while its own upgrade ' + b.upg + ' is already being researched', have: full, sel: b.id, researching: [b.upg] });
  }
  // 5. a building mid-construction, whose only button is Cancel
  scenarios.push({ race, name: race + ' ' + T.hall + ' mid-construction', have: bare, unfinished: T.hall });
  // 6. one combat unit and one caster per race, so the mobile-unit half of buildCard is walked too
  const mob = { T: ['marine', 'medic', 'siege_tank'], Z: ['hydralisk', 'defiler', 'drone'], P: ['zealot', 'high_templar', 'reaver'] }[race];
  for (const u of mob) {
    scenarios.push({ race, name: race + ' ' + u + ', no tech', have: bare, unit: u });
    scenarios.push({ race, name: race + ' ' + u + ', everything built', have: full, unit: u });
  }
}
// 7. multi-unit selections, which take a different route through buildCard (the merge buttons are only
// offered when at least two templar of a kind are selected, and that is the only way to exercise them)
scenarios.push({ race: 'P', name: 'P two high templar selected', have: tables.races.P.all, units: ['high_templar', 'high_templar'] });
scenarios.push({ race: 'P', name: 'P two dark templar selected', have: tables.races.P.all, units: ['dark_templar', 'dark_templar'] });
scenarios.push({ race: 'T', name: 'T two marines selected', have: tables.races.T.all, units: ['marine', 'marine'] });
scenarios.push({ race: 'T', name: 'T a marine and a medic selected', have: tables.races.T.all, units: ['marine', 'medic'] });
// 8. Zerg only: a larva and an egg
scenarios.push({ race: 'Z', name: 'Z larva, only a hatchery', have: [tables.races.Z.hall], sel: 'larva' });
scenarios.push({ race: 'Z', name: 'Z larva, every building present', have: tables.races.Z.all, sel: 'larva' });
scenarios.push({ race: 'Z', name: 'Z egg mid-morph', have: [tables.races.Z.hall], sel: 'egg' });

// Brood War shows the Archon Warp button with a single High Templar selected and clicking it does
// nothing, because a merge needs two of them. That is faithful, and it is the one enabled button in
// the game that is a legitimate no-op in a state that offers it -- so it is exempted by name, and the
// two-templar scenarios above check that the same button really does merge when it can.
const NOOP_BY_DESIGN = [/^Summon (Dark )?Archon$/];

// ---------------------------------------------------------------- walk them
let started = null, buttons = 0, cards = 0, silent = [], deadKeys = [], noWhy = [], merged = 0, dimmed = 0, live = 0;
const reasons = new Map();
for (const scn of scenarios) {
  if (started !== scn.race) { run('this.begin(' + JSON.stringify(scn.race) + ')'); started = scn.race; }
  const card = json('this.build(' + JSON.stringify(scn) + ')');
  cards++;
  for (const b of card) {
    // every press starts from a freshly built scenario, so one press can never colour the next
    json('this.build(' + JSON.stringify(scn) + ')');
    const r = json('this.pressSlot(' + b.slot + ')');
    if (r.gone) continue;
    buttons++;
    const where = scn.name + ' -> "' + r.label + '" (' + (r.hk === 'Escape' ? 'Esc' : r.hk) + ')';
    if (r.enabled === false) {
      dimmed++;
      if (!r.why) noWhy.push(where);
      if (!r.said.length) silent.push(where);
      for (const s of r.said) reasons.set(s, (reasons.get(s) || 0) + 1);
    } else if (live++, NOOP_BY_DESIGN.some(re => re.test(r.label))) {
      if (r.changed) merged++;
    } else if (!r.changed) {
      deadKeys.push(where);
    }
  }
}

// ---------------------------------------------------------------- assertions
console.log('walked ' + cards + ' command-card states, pressed ' + buttons + ' buttons: ' + dimmed + ' greyed, ' + live + ' live');
console.log('the ' + reasons.size + ' distinct things a greyed button said:');
for (const [s, n] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('  ' + String(n).padStart(4) + '  ' + s);
console.log('');
// The whole test is worthless if it never actually found a greyed button, and it is nearly worthless if
// it found three. This is the anti-vacuity check: a refactor that quietly stops building disabled
// buttons -- or a scenario list that stops reaching them -- has to fail here rather than go green.
ok('the walk really did reach a large number of greyed buttons', dimmed >= 100, 'only ' + dimmed + ' were greyed');
ok('...and a large number of live ones', live >= 100, 'only ' + live + ' were live');
ok('every disabled button carries a `why` for UI.press to read out', noWhy.length === 0,
  noWhy.length + ' without one:\n    ' + noWhy.slice(0, 12).join('\n    '));
ok('every disabled button produces a player message when pressed', silent.length === 0,
  silent.length + ' silent:\n    ' + silent.slice(0, 12).join('\n    '));
ok('every enabled button does something observable when pressed (an enabled dead key is the same defect)',
  deadKeys.length === 0, deadKeys.length + ' did nothing:\n    ' + deadKeys.slice(0, 40).join('\n    '));
ok('the Archon/Dark Archon merge buttons do merge when two templar of a kind are selected', merged >= 2,
  merged + ' of the exempted no-op buttons actually did something');

if (noWhy.length || silent.length) {
  console.log('\n' + '-'.repeat(96));
  console.log('DIAGNOSIS -- these are a live defect in js/ui.js, not a gap in this test.\n');
  console.log('Every silent button above comes from the add-on branch of UI.buildCard, which holds the only');
  console.log('two B(...) calls in the whole card that pass `enabled` without a matching `why`:\n');
  console.log("    for (const id of (u.addon.def.tech || [])) { ... enabled: !p.researching.has(id) }");
  console.log("    for (const id of u.addon.def.produces)     { ... enabled: !u.addon.hasNuke }\n");
  console.log('The non-add-on tech loop three lines above already covers the identical case:\n');
  console.log("    why: !ok ? why(td) : p.researching.has(id) ? 'Already researching.' : null\n");
  console.log('So this is e30e506 again, applied to the two call sites it missed. It is reachable with one');
  console.log('Factory and one Machine Shop and no second building at all: queue Ion Thrusters, then press I');
  console.log('again on the same Factory. The button is greyed and the game says nothing -- which is exactly');
  console.log('the complaint that produced e30e506 in the first place.');
  console.log('-'.repeat(96));
}

// A couple of spot checks with the exact wording, so the message is not just "something happened".
const spot = (scn, hk, want) => {
  json('this.build(' + JSON.stringify(scn) + ')');
  const b = json('this.card()').find(x => x.hk === hk);
  if (!b) { ok(scn.name + ': there is a "' + hk + '" button at all', false); return; }
  const r = json('this.pressSlot(' + b.slot + ')');
  ok(scn.name + ': pressing ' + hk + ' says "' + want + '"', r.said.includes(want), 'said ' + JSON.stringify(r.said) + ' enabled=' + r.enabled);
};
run("this.begin('T')");
// the reported bug, verbatim: F on a Barracks with no Academy
spot({ race: 'T', name: 'T barracks with no academy', have: ['command_center', 'barracks'], sel: 'barracks' }, 'F', 'Requires Academy');
// the other reported one: a Battlecruiser needs a Control Tower AND a Physics Lab, on two buildings
spot({ race: 'T', name: 'T starport with no control tower', have: ['command_center', 'starport'], sel: 'starport' }, 'B', 'Requires Control Tower');

ok('no JS errors while walking the card', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
