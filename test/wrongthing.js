// Do the wrong thing on purpose, and require that the game neither crashes nor hangs.
//   node test/wrongthing.js [T|Z|P|all] [--verbose]
//
// test/playtest.js drives the UI *correctly*. That is the gap the M8 close-out found: two of the three
// bugs a player hit in an afternoon were invisible to every automated check here, and both were things
// a person does by accident within a minute -- clicking a cliff, pressing a key that does nothing,
// asking for something they cannot afford. So this one is deliberately incompetent. It clicks the
// unreachable, holds position in silly places, buys things it has no money for, cancels a morph
// halfway through, tears down a building it just started, keeps giving orders to a unit that is
// already dead, and rallies its production on top of a mineral patch.
//
// The bar is not "the wrong thing is refused" -- often the right answer is that nothing happens. The
// bar is:
//   * no JS error anywhere (G.tick catches per-unit throws into console.error, so those are counted),
//   * no invariant violation (NaN or off-map positions, orphaned cargo, a larva its hatchery has
//     forgotten, negative resources, supply that does not add up),
//   * and no unit left with a live order it can never finish. That last one is the expensive kind of
//     bug: it does not throw, it does not look wrong in a screenshot, and it quietly costs the player
//     a unit for the rest of the game. M4 fixed three classes of it and M6 found another.
//
// The stuck detector is test/playtest_bot.js's own Check, loaded rather than re-written, so "stuck"
// means exactly what it means in the play-test.
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
const which = (process.argv.slice(2).find(a => !a.startsWith('--')) || 'all');
const races = which === 'all' ? ['T', 'Z', 'P'] : [which];
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; if (VERBOSE) console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); } };

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
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'atlas', 'fx', 'render', 'editor', 'ui', 'hud']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'playtest_bot.js'), 'utf8'), ctx, { filename: 'playtest_bot.js' });
const run = src => vm.runInContext(src, ctx);
const json = src => { const s = vm.runInContext('JSON.stringify(' + src + ')', ctx); return s === undefined ? null : JSON.parse(s); };

// ---------------------------------------------------------------- the rig
run(`(() => {
  this.begin = (race) => {
    UI.start({ players: [{ race, human: true, name: 'Zac', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'Computer', team: 2 }], seed: 4, layout: 'temple' });
    G.recording = false;
    for (const p of G.players) if (!p.human) p.ai = null; // nothing but the wrong things should move
    // Supply is not what any of this is about, and a supply-refused unit is a different message that
    // would swallow half the cases below. The food cheat is the game's own switch for that.
    G.cheats.food = true;
    this.p = G.players[0]; this.results = []; this.issues = []; this.notes = [];
    Check.last = new Map(); Check.stuckSeen = new Set(); Bot.errors = []; Bot.issues = [];
    this.base = { x: this.p.startX, y: this.p.startY };
    this.rich(); this.tick(1);
  };
  this.rich = () => { this.p.minerals = 5000; this.p.gas = 5000; };
  this.tick = n => { for (let i = 0; i < n; i++) { if (G.over) break; G.tick(); UI.selection = UI.selection.filter(u => u.alive); if (G.frame % 24 === 0) Check.run(this.issues); } };
  this.own = pred => G.units.filter(u => u.alive && u.owner === 0 && (!pred || pred(u)));
  this.hall = () => this.own(u => u.isBuilding && (u.def.depot || u.def.spawnsLarva))[0];
  this.spawn = (id, x, y) => { G.applying = true; try { const u = G.spawnUnit(id, 0, x, y); if (u.isBuilding) { u.done = true; u.hp = u.maxHp; u.sh = u.maxSh; u.progress = u.def.time; } return u; } finally { G.applying = false; } };
  this.tech = t => { G.applying = true; try { this.p.tech.add(t); } finally { G.applying = false; } };

  // ---- the input layer, used the way a person uses it ----
  this.select = us => UI.select(Array.isArray(us) ? us : [us]);
  this.rclick = (x, y, t) => UI.smartCommand(t !== undefined ? t : UI.unitAt(x, y), x, y, false);
  this.uiOrder = (kind, x, y, t) => { UI.pending = { kind }; UI.execPending(t || null, x, y, false); };
  this.hotkey = k => { UI.onKey({ key: k, preventDefault() { }, ctrlKey: false, shiftKey: false }); };
  // The card's Cancel, pressed as a click presses it. It was Escape until the tenth session (item 6): Escape opens the game
  // menu now and never cancels a queued unit, an egg or a building going up.
  this.cancel = () => { const b = UI.currentCard().find(x => x.label === 'Cancel'); if (b) UI.press(b); return !!b; };
  this.cardHas = label => UI.currentCard().some(b => b.label === label);
  this.msgs = () => this.p.msgs.map(m => m.text);
  this.clearMsgs = () => { this.p.msgs = []; this.p.lastAlert = {}; };

  // the nearest tile you cannot walk on, a good distance out: reachable by eye, not by foot
  this.cliff = (fx, fy) => {
    const m = G.map;
    for (let r = 6; r < 44; r++) for (let a = 0; a < 40; a++) {
      const tx = Math.floor(fx / TILE + Math.cos(a / 40 * 6.283) * r), ty = Math.floor(fy / TILE + Math.sin(a / 40 * 6.283) * r);
      if (m.inb(tx, ty) && !m.walkable(tx, ty) && !G.map.resourceAt(tx, ty)) return [(tx + .5) * TILE, (ty + .5) * TILE];
    }
    return null;
  };
  // the nearest tile a given building can legally go on: creep for Zerg, psi for Protoss, clear for all
  this.buildSpot = (d, w) => {
    const cx = Math.floor(this.base.x / TILE), cy = Math.floor(this.base.y / TILE);
    for (let r = 3; r < 22; r++) { const n = 8 * r; for (let a = 0; a < n; a++) {
      const tx = cx + Math.round(Math.cos(a / n * 6.283) * r), ty = cy + Math.round(Math.sin(a / n * 6.283) * r);
      if (!G.map.canPlace(d, tx, ty, this.p, G.units, w)) return [tx, ty];
    } }
    return null;
  };
  this.mineral = () => { let best = null, bd = 1e9; for (const r of G.map.resources) { if (r.type !== 'mineral') continue; const d = distPt(r.cx, r.cy, this.base.x, this.base.y); if (d < bd) { bd = d; best = r; } } return best; };

  // Every wrong thing runs inside this: a throw is a failure of the game, not of the test, so it is
  // recorded rather than allowed to end the run -- one crash should not hide the next twenty.
  this.wrong = (name, fn) => {
    this.clearMsgs();
    let r = null, threw = null;
    try { r = fn(); } catch (e) { threw = (e && e.stack || String(e)).split('\\n').slice(0, 3).join(' | '); }
    const rec = Object.assign({ name, threw }, r || {});
    rec.said = this.msgs();
    this.results.push(rec);
    return rec;
  };
  // is this unit making progress, or is it wedged on an order it can never finish?
  this.settled = u => !u.alive || u.order.type === 'idle' || u.order.type === 'gather' || u.order.type === 'return' || u.order.type === 'hold';
})();`);

const R = (race, name) => json(`this.results.find(r => r.name === ${JSON.stringify(name)})`);
const deadBuildingTook = [];

for (const race of races) {
  console.log('\n=== ' + race + ' does the wrong thing ===');
  run('this.begin(' + JSON.stringify(race) + ')');

  // ------------------------------------------------ orders to places you cannot go
  run(`(() => {
    const B = this.base, cliff = this.cliff(B.x, B.y);
    this.notes.push('cliff at ' + Math.round(cliff[0]) + ',' + Math.round(cliff[1]));

    // right-click a cliff, which is the single most common accidental order in the game
    this.wrong('right-click a cliff', () => {
      const u = this.spawn(RACE_INFO[this.p.race].worker === 'drone' ? 'zergling' : 'marine', B.x + 40, B.y + 60);
      this.select(u); this.rclick(cliff[0], cliff[1], null);
      const gave = this.order = u.order.type;
      for (let i = 0; i < 24 * 20; i++) { this.tick(1); if (u.order.type === 'idle') break; }
      return { took: u.order.type, ordered: gave, secs: +(G.frame / 24).toFixed(0), settled: this.settled(u), inBounds: u.x >= 0 && u.y >= 0 && u.x <= G.map.w * TILE && u.y <= G.map.h * TILE };
    });

    // attack-move and patrol take a different branch of tickOrder than move does
    for (const kind of ['attack', 'patrol']) this.wrong(kind + '-move onto a cliff', () => {
      const u = this.spawn('marine', B.x + 40, B.y + 60);
      this.select(u); this.uiOrder(kind, cliff[0], cliff[1]);
      const started = u.order.type;
      for (let i = 0; i < 24 * 25; i++) { this.tick(1); if (u.order.type === 'idle') break; }
      return { started, took: u.order.type, settled: this.settled(u) };
    });

    // Coordinates that are not on the map at all. This cannot happen from a click -- the viewport is
    // clamped -- but it can arrive from a replay or over the network, which is the same code path.
    // The unit walks toward the edge, so the ten-second no-progress watchdog cannot fire until it gets
    // there; the window is generous on purpose, and the point is that it does eventually stop.
    this.wrong('order a unit off the edge of the world', () => {
      const u = this.spawn('marine', B.x + 40, B.y + 60);
      this.select(u); this.rclick(-4000, -4000, null);
      let a = -1; for (let i = 0; i < 24 * 150; i++) { this.tick(1); if (u.order.type === 'idle') { a = i; break; } }
      this.rclick(G.map.w * TILE + 4000, G.map.h * TILE + 4000, null);
      let b = -1; for (let i = 0; i < 24 * 150; i++) { this.tick(1); if (u.order.type === 'idle') { b = i; break; } }
      return { took: u.order.type, settled: this.settled(u), gaveUpNW: a >= 0 ? Math.round(a / 24) + 's' : 'never', gaveUpSE: b >= 0 ? Math.round(b / 24) + 's' : 'never', x: Math.round(u.x), y: Math.round(u.y), inBounds: u.x >= 0 && u.y >= 0 && u.x <= G.map.w * TILE && u.y <= G.map.h * TILE };
    });

    // build where a building cannot go
    this.wrong('build on a cliff', () => {
      const w = this.spawn(RACE_INFO[this.p.race].worker, B.x + 40, B.y + 80);
      const d = DATA.buildings[RACE_INFO[this.p.race].hall === 'hatchery' ? 'spawning_pool' : this.p.race === 'T' ? 'barracks' : 'gateway'];
      this.select(w); UI.placing = { def: d, builder: w, tx: Math.floor(cliff[0] / TILE), ty: Math.floor(cliff[1] / TILE) };
      UI.confirmPlacement(false);
      this.tick(4);
      return { refused: !!UI.placing, order: w.order.type };
    });

    // build on top of something already there
    this.wrong('build on top of the town hall', () => {
      const w = this.spawn(RACE_INFO[this.p.race].worker, B.x + 40, B.y + 80);
      const h = this.hall();
      const d = DATA.buildings[this.p.race === 'T' ? 'barracks' : this.p.race === 'Z' ? 'spawning_pool' : 'gateway'];
      this.select(w); UI.placing = { def: d, builder: w, tx: h.tx, ty: h.ty };
      UI.confirmPlacement(false);
      this.tick(4);
      return { refused: !!UI.placing, order: w.order.type };
    });

    // a build order whose requirement is missing, delivered straight to the unit the way a replay
    // would: the command card greys this out, so tickBuild's own refusal is otherwise never reached
    this.wrong('build something whose requirement is missing', () => {
      const w = this.spawn(RACE_INFO[this.p.race].worker, B.x + 40, B.y + 80);
      const late = this.p.race === 'T' ? 'science_facility' : this.p.race === 'Z' ? 'hydralisk_den' : 'templar_archives';
      const d = DATA.buildings[late];
      const t = G.map.findFreeTile(Math.floor(B.x / TILE) + 6, Math.floor(B.y / TILE) + 6, 10);
      G.applying = true; try { w.setOrder({ type: 'build', def: d, tx: t[0], ty: t[1] }); } finally { G.applying = false; }
      for (let i = 0; i < 24 * 30; i++) { this.tick(1); if (w.order.type === 'idle') break; }
      return { req: late, took: w.order.type, settled: this.settled(w) };
    });
  })();`);

  const cliffy = ['right-click a cliff', 'attack-move onto a cliff', 'patrol-move onto a cliff', 'order a unit off the edge of the world'];
  for (const n of cliffy) {
    const r = R(race, n);
    ok(race + ': ' + n + ' -> the unit gives up instead of grinding forever', r && !r.threw && r.settled === true, JSON.stringify(r));
  }
  const oob = R(race, 'order a unit off the edge of the world');
  ok(race + ': an off-map order never puts the unit off the map', oob && oob.inBounds === true, JSON.stringify(oob));
  for (const n of ['build on a cliff', 'build on top of the town hall']) {
    const r = R(race, n);
    ok(race + ': ' + n + ' -> refused, with a reason', r && !r.threw && r.refused === true && r.said.length > 0, JSON.stringify(r));
  }
  const badReq = R(race, 'build something whose requirement is missing');
  ok(race + ': a build order for something unresearched is dropped and explained', badReq && !badReq.threw && badReq.took === 'idle' && badReq.said.some(s => /^Requires /.test(s)), JSON.stringify(badReq));

  // ------------------------------------------------ hold position in silly places
  run(`(() => {
    const B = this.base;
    // H with a worker selected: there is no Hold button on the worker card, so this is a dead key by
    // design. It must not disturb what the worker was doing.
    this.wrong('press H with a worker selected while it is mining', () => {
      const w = this.own(u => u.def.worker)[0];
      this.tick(48);
      const before = w.order.type;
      this.select(w); const had = this.cardHas('Hold Position'); this.hotkey('h');
      this.tick(24);
      return { had, before, after: w.order.type, mining: w.order.type === 'gather' || w.order.type === 'return' };
    });
    // H on a building, a larva and an egg: none of them offers the button either
    this.wrong('press H with the town hall selected', () => {
      const h = this.hall(); this.select(h); const had = this.cardHas('Hold Position'); this.hotkey('h'); this.tick(12);
      return { had, order: h.order.type, alive: h.alive };
    });
    // hold on top of a mineral patch, on a ramp, and pressed against a cliff: odd ground, and the
    // unit must still hold rather than wander or wedge
    this.wrong('hold on top of a mineral patch', () => {
      const m = this.mineral(); const u = this.spawn('marine', m.cx, m.cy);
      this.select(u); this.hotkey('h'); this.tick(24 * 5);
      return { order: u.order.type, held: u.order.type === 'hold', moved: Math.round(distPt(u.x, u.y, m.cx, m.cy)) };
    });
    this.wrong('hold a flyer, then tell it to hold again', () => {
      const u = this.spawn(this.p.race === 'T' ? 'wraith' : this.p.race === 'Z' ? 'mutalisk' : 'scout', B.x + 100, B.y - 100);
      this.select(u); this.hotkey('h'); this.tick(24 * 3); this.hotkey('h'); this.tick(24 * 3);
      return { order: u.order.type, held: u.order.type === 'hold' };
    });
    // hold a unit that is inside a transport: it is not on the field, and the order has nowhere to go
    this.wrong('hold a unit that is inside a transport', () => {
      const tr = this.spawn(this.p.race === 'T' ? 'dropship' : this.p.race === 'Z' ? 'overlord' : 'shuttle', B.x + 120, B.y - 60);
      if (this.p.race === 'Z') this.tech('ventral_sacs');
      const u = this.spawn('marine', B.x + 120, B.y - 40);
      G.applying = true; try { G.loadUnit(tr, u); } finally { G.applying = false; }
      const loaded = !!u.inside;
      this.select([u]); this.hotkey('h'); this.tick(24 * 4);
      return { loaded, inside: !!u.inside, order: u.order.type, cargoOk: !loaded || tr.cargo.includes(u) };
    });
    // a sieged tank told to move: it cannot, and the order has to be dropped rather than kept forever
    if (this.p.race === 'T') this.wrong('order a sieged tank to move', () => {
      this.tech('siege_tech');
      const u = this.spawn('siege_tank', B.x + 160, B.y + 40);
      G.applying = true; try { Abilities.instant(u, 'siege_mode'); } finally { G.applying = false; }
      this.tick(60);
      const sieged = u.sieged, orderWhenSieged = u.order.type;
      this.select(u); this.rclick(B.x + 300, B.y + 300, null);
      this.tick(24 * 4);
      return { sieged, orderWhenSieged, after: u.order.type, stillSieged: u.sieged, settled: this.settled(u) };
    });
  })();`);

  for (const [n, test, why] of [
    ['press H with a worker selected while it is mining', r => r.had === false && r.mining === true, 'the worker card has no Hold button and the order must not be invented'],
    ['press H with the town hall selected', r => r.had === false && r.alive === true, 'a building cannot hold position'],
    ['hold on top of a mineral patch', r => r.held === true, 'it holds, on odd ground'],
    ['hold a flyer, then tell it to hold again', r => r.held === true, 'holding twice is not a state machine trap'],
    ['hold a unit that is inside a transport', r => r.inside === true && r.cargoOk === true, 'the passenger stays a passenger'],
    ['order a sieged tank to move', r => r.sieged === true && r.settled === true && r.stillSieged === true, 'the impossible move order is dropped, the tank stays sieged'],
  ]) {
    const r = R(race, n); if (!r) continue;
    ok(race + ': ' + n + ' -> ' + why, !r.threw && test(r), JSON.stringify(r));
  }

  // ------------------------------------------------ buy what you cannot afford
  run(`(() => {
    const B = this.base;
    this.wrong('queue a unit with no money', () => {
      const b = this.p.race === 'Z' ? this.hall() : this.spawn(this.p.race === 'T' ? 'barracks' : 'gateway', B.x + 5 * TILE, B.y + 5 * TILE);
      this.p.minerals = 0; this.p.gas = 0;
      const before = this.p.race === 'Z' ? (this.hall().larvae[0] ? 1 : 0) : b.prod.length;
      this.select(b);
      // press whatever the first production button is, the way a player mashes it
      const card = UI.currentCard(); const btn = card.find(x => x.cost && x.cost.min !== undefined && x.enabled !== false);
      if (btn) for (let i = 0; i < 5; i++) UI.press(btn);
      this.tick(4);
      const queued = this.p.race === 'Z' ? this.own(u => u.def.egg).length : b.prod.length;
      return { label: btn ? btn.label : null, queued, minerals: Math.round(this.p.minerals), gas: Math.round(this.p.gas) };
    });
    this.wrong('mash a production button past the queue cap', () => {
      this.rich();
      const b = this.spawn(this.p.race === 'T' ? 'barracks' : this.p.race === 'Z' ? 'hatchery' : 'gateway', B.x + 8 * TILE, B.y + 5 * TILE);
      this.select(b);
      const card = UI.currentCard(); const btn = card.find(x => x.cost && x.cost.min !== undefined && x.enabled !== false);
      if (btn) for (let i = 0; i < 40; i++) UI.press(btn);
      this.tick(4);
      return { label: btn ? btn.label : null, queue: b.prod.length, cap: MAX_QUEUE, capped: b.prod.length <= MAX_QUEUE };
    });
    this.wrong('queue a unit at a building that is still under construction', () => {
      this.rich();
      const d = DATA.buildings[this.p.race === 'T' ? 'barracks' : this.p.race === 'Z' ? 'spawning_pool' : 'gateway'];
      const t = G.map.findFreeTile(Math.floor(B.x / TILE) + 8, Math.floor(B.y / TILE) - 6, 12);
      G.applying = true; const b = G.placeBuilding(d, t[0], t[1], 0); G.applying = false;
      const uid = (d.produces || [])[0] || 'marine';
      const took = G.queueUnit(b, uid);
      const r = { done: b.done, took: !!took, queue: b.prod.length };
      // clean up: a building with no builder never finishes, and leaving one behind would confuse the
      // "cancel a building mid-construction" case below into picking the wrong site
      G.applying = true; try { G.kill(b, null, true); } finally { G.applying = false; }
      return r;
    });
    this.wrong('queue a unit at a building that does not make it', () => {
      this.rich();
      const h = this.hall();
      const took = G.queueUnit(h, 'battlecruiser');
      return { took: !!took, queue: h.prod.length };
    });
  })();`);

  for (const [n, test, why] of [
    ['queue a unit with no money', r => r.queued === 0 && r.said.some(s => /Not enough/.test(s)) && r.minerals >= 0, 'refused, said so, and no negative bank'],
    ['mash a production button past the queue cap', r => r.queue > 0 && r.capped === true, 'the queue fills and then stops at the cap'],
    ['queue a unit at a building that is still under construction', r => r.took === false && r.queue === 0, 'an unfinished building trains nothing'],
    ['queue a unit at a building that does not make it', r => r.took === false && r.queue === 0, 'refused'],
  ]) {
    const r = R(race, n); if (!r) continue;
    ok(race + ': ' + n + ' -> ' + why, !r.threw && test(r), JSON.stringify(r));
  }

  // ------------------------------------------------ cancel things halfway through
  run(`(() => {
    const B = this.base;
    this.wrong('cancel a building mid-construction', () => {
      this.rich();
      const before = this.p.minerals;
      const w = this.spawn(RACE_INFO[this.p.race].worker, B.x + 60, B.y + 100);
      // a Zerg building needs creep and a Protoss one needs psi, so the site comes from canPlace rather
      // than from findFreeTile -- otherwise this measures "Requires creep" instead of a cancel
      const d = DATA.buildings[this.p.race === 'T' ? 'barracks' : this.p.race === 'Z' ? 'spawning_pool' : 'pylon'];
      const t = this.buildSpot(d, w);
      if (!t) return { placed: false, noSpot: true };
      const mark = G.units.reduce((m, u) => Math.max(m, u.id), 0);
      this.select(w); UI.placing = { def: d, builder: w, tx: t[0], ty: t[1] }; UI.confirmPlacement(false);
      let b = null;
      for (let i = 0; i < 24 * 90 && !b; i++) { this.tick(1); b = this.own(u => u.isBuilding && u.def.id === d.id && !u.done && u.id > mark)[0] || null; }
      if (!b) return { placed: false };
      // counted here, not before the order: a Zerg builder IS the building, so it is already gone
      const dronesMid = this.own(u => u.def.id === 'drone').length;
      // Wait for it to be genuinely half-built rather than just placed. A Terran building only advances
      // while its SCV is standing on it, and nudgeOut can throw the SCV a dozen tiles clear first.
      for (let i = 0; i < 24 * 90 && b.progress < d.time * 0.1; i++) this.tick(1);
      const prog = b.progress, hp = b.hp;
      this.select(b); this.cancel();  // the unfinished building's Cancel
      this.tick(4);
      const drones = this.own(u => u.def.id === 'drone').length;
      // give the builder time to get itself into trouble if it is going to
      for (let i = 0; i < 24 * 25; i++) this.tick(1);
      return {
        placed: true, progressed: prog > 0, part: +(prog / d.time).toFixed(2), hp: Math.round(hp), gone: !b.alive,
        refunded: this.p.minerals > before - d.min, builderOrder: w.alive ? w.order.type : 'consumed',
        builderOk: !w.alive || this.settled(w),
        // a cancelled Zerg building gives the drone back, because the drone became the building
        droneBack: this.p.race !== 'Z' || drones > dronesMid,
      };
    });
    this.wrong('cancel a building that is already finished, twice', () => {
      const b = this.spawn(this.p.race === 'T' ? 'barracks' : this.p.race === 'Z' ? 'spawning_pool' : 'gateway', B.x + 11 * TILE, B.y + 5 * TILE);
      G.cancelBuilding(b); G.cancelBuilding(b);
      this.tick(8);
      return { alive: b.alive, done: b.done };
    });
    this.wrong('cancel a production slot that is not there', () => {
      const h = this.hall();
      G.cancelProd(h, 0); G.cancelProd(h, 7); G.cancelProd(h, -1);
      this.tick(8);
      return { alive: h.alive, queue: h.prod.length };
    });
    this.wrong('cancel a research halfway through', () => {
      this.rich();
      const b = this.spawn(this.p.race === 'T' ? 'academy' : this.p.race === 'Z' ? 'spawning_pool' : 'forge', B.x + 5 * TILE, B.y - 6 * TILE);
      const tid = (b.def.tech || [])[0];
      if (!tid) return { skipped: true };
      const took = G.queueTech(b, tid);
      this.tick(24 * 3);
      const mid = this.p.researching.has(tid);
      G.cancelProd(b, 0);
      this.tick(8);
      return { took: !!took, mid, after: this.p.researching.has(tid), queue: b.prod.length, hasTech: this.p.tech.has(tid) };
    });
  })();`);

  // race-specific morph cancels
  run(`(() => {
    const B = this.base;
    if (this.p.race !== 'Z') return;
    this.wrong('cancel a larva morph mid-morph', () => {
      this.rich();
      const h = this.hall();
      for (let i = 0; i < 24 * 30 && !h.larvae.length; i++) this.tick(1);
      const l = h.larvae[0]; if (!l) return { skipped: 'no larva' };
      this.select(l); const btn = UI.currentCard().find(b => b.label === 'Drone'); if (!btn) return { skipped: 'no drone button' };
      UI.press(btn);
      this.tick(24 * 2);
      const wasEgg = l.def.id === 'egg';
      this.select(l); this.cancel();
      this.tick(24);
      return { wasEgg, backToLarva: l.alive && l.def.id === 'larva', listed: !l.alive || !l.hatch || l.hatch.larvae.includes(l), order: l.order.type };
    });
    this.wrong('cancel a hatchery morph to lair mid-morph', () => {
      this.rich();
      this.spawn('spawning_pool', B.x + 6 * TILE, B.y - 5 * TILE);
      const h = this.hall();
      const took = G.queueMorph(h, 'lair');
      this.tick(24 * 4);
      const mid = h.prod.length === 1;
      G.cancelProd(h, 0);
      this.tick(24);
      return { took: !!took, mid, stillHatchery: h.alive && h.def.id === 'hatchery', queue: h.prod.length };
    });
    this.wrong('cancel a lurker morph mid-morph', () => {
      this.rich(); this.tech('lurker_aspect');
      const u = this.spawn('hydralisk', B.x + 60, B.y + 120);
      G.applying = true; try { Abilities.issue(u, 'lurker_aspect'); } finally { G.applying = false; }
      this.tick(24 * 2);
      const wasEgg = !!u.def.egg;
      this.select(u); this.cancel();
      this.tick(24);
      return { wasEgg, back: u.alive ? u.def.id : 'dead', settled: this.settled(u) };
    });
  })();`);

  for (const [n, test, why] of [
    ['cancel a building mid-construction', r => r.placed === true && r.progressed === true && r.gone === true && r.refunded === true && r.builderOk === true && r.droneBack === true, 'it goes away, the money comes back, the builder is not left wedged, and a Zerg drone comes back out'],
    ['cancel a building that is already finished, twice', r => r.alive === true, 'a finished building cannot be cancelled and two attempts do not break it'],
    ['cancel a production slot that is not there', r => r.alive === true && r.queue === 0, 'out-of-range indices are ignored'],
    ['cancel a research halfway through', r => r.skipped || (r.took === true && r.mid === true && r.after === false && r.queue === 0 && r.hasTech === false), 'the reservation is released, the tech is not granted'],
    ['cancel a larva morph mid-morph', r => r.skipped || (r.wasEgg === true && r.backToLarva === true && r.listed === true), 'the egg becomes a larva again and its hatchery knows about it'],
    ['cancel a hatchery morph to lair mid-morph', r => r.skipped || (r.took === true && r.mid === true && r.stillHatchery === true && r.queue === 0), 'still a hatchery'],
    ['cancel a lurker morph mid-morph', r => r.skipped || (r.wasEgg === true && r.back === 'hydralisk' && r.settled === true), 'the egg becomes a hydralisk again'],
  ]) {
    const r = R(race, n); if (!r) continue;
    ok(race + ': ' + n + ' -> ' + why, !r.threw && test(r), JSON.stringify(r));
  }

  // ------------------------------------------------ keep ordering a unit that is dead
  run(`(() => {
    const B = this.base;
    // Locally this cannot happen: UI.ownSel filters on u.alive, so no card is ever built for a corpse.
    // Over the network and in a replay it can, because a command is packed on one frame and applied on
    // a later one -- CMD.apply looks up the unit by id and checks who owns it, and a corpse still has an
    // owner. So this is the multiplayer shape of "issue orders to dead units".
    this.wrong('give orders to a unit that is already dead', () => {
      this.rich();
      const u = this.spawn('marine', B.x + 60, B.y + 140);
      const b = this.spawn(this.p.race === 'T' ? 'barracks' : this.p.race === 'Z' ? 'hatchery' : 'gateway', B.x + 14 * TILE, B.y + 5 * TILE);
      const upgId = Object.keys(DATA.upgrades).find(k => DATA.upgrades[k].race === this.p.race && !DATA.upgrades[k].req[0]);
      const before = { min: Math.round(this.p.minerals), gas: Math.round(this.p.gas), res: this.p.researching.size };
      this.select([u, b]);
      G.applying = true; try { G.kill(u, null, true); G.kill(b, null, true); } finally { G.applying = false; }
      // every player-facing mutation, aimed at two corpses, through the same wrappers the network uses
      u.setOrder({ type: 'move', x: B.x, y: B.y }); u.stop();
      const took = {
        train: !!G.queueUnit(b, (b.def.produces || [])[0] || 'marine'),
        upg: upgId ? !!G.queueUpgrade(b, upgId) : false,
        morph: !!G.queueMorph(b, this.p.race === 'Z' ? 'lair' : 'x'),
        addon: !!G.queueAddon(b, 'comsat_station'),
      };
      // measured before any ticking, because the workers are still mining and income would hide it
      const spent = before.min - Math.round(this.p.minerals) + before.gas - Math.round(this.p.gas);
      const queued = b.prod.length, resLeak = this.p.researching.size - before.res;
      G.cancelProd(b, 0); G.cancelBuilding(b); G.setRally(b, B.x, B.y, null); G.liftBuilding(b);
      Abilities.issue(u, 'stim'); Abilities.merge([u], 'summon_archon');
      this.rclick(B.x + 200, B.y + 200, null);
      this.tick(24 * 3);
      return {
        deadStayedDead: !u.alive && !b.alive, resurrected: G.units.some(x => x.alive && x.id === u.id),
        took, accepted: Object.keys(took).filter(k => took[k]), queue: queued, lifted: !!b.lifted,
        charged: spent, resLeak, upgId,
      };
    });
    this.wrong('shoot at your own units', () => {
      const a = this.spawn('marine', B.x + 200, B.y + 200), b = this.spawn('marine', B.x + 220, B.y + 200);
      this.select(a); this.uiOrder('attack', b.x, b.y, b);
      this.tick(24 * 5);
      return { bothAlive: a.alive && b.alive, hp: Math.round(b.hp), order: a.order.type };
    });
    this.wrong('merge two units that cannot merge', () => {
      const a = this.spawn('marine', B.x + 240, B.y + 200), b = this.spawn('marine', B.x + 260, B.y + 200);
      Abilities.merge([a, b], 'summon_archon');
      this.tick(24 * 2);
      return { bothAlive: a.alive && b.alive, defs: a.def.id + ',' + b.def.id };
    });
    this.wrong('cast a spell with no energy and no research', () => {
      const u = this.spawn(this.p.race === 'P' ? 'high_templar' : this.p.race === 'T' ? 'ghost' : 'queen', B.x + 280, B.y + 200);
      u.energy = 0;
      for (const id of (u.def.abil || [])) { G.applying = false; Abilities.issue(u, id, null, B.x + 300, B.y + 220); }
      this.tick(24 * 3);
      return { alive: u.alive, energy: Math.round(u.energy), settled: this.settled(u) || u.order.type === 'ability' };
    });
    this.wrong('walk into a Nydus Canal that has no other end', () => {
      if (this.p.race !== 'Z') return { skipped: true };
      const c = this.spawn('nydus_canal', B.x + 6 * TILE, B.y + 8 * TILE);
      const u = this.spawn('zergling', B.x + 5 * TILE, B.y + 8 * TILE);
      G.applying = true; try { u.setOrder({ type: 'nydus', target: c }); } finally { G.applying = false; }
      this.tick(24 * 6);
      return { took: u.order.type, settled: this.settled(u) };
    });
  })();`);

  for (const [n, test, why] of [
    ['give orders to a unit that is already dead', r => r.deadStayedDead === true && r.resurrected === false && r.accepted.length === 0 && r.queue === 0 && r.lifted === false && r.charged === 0 && r.resLeak === 0, 'every command aimed at a corpse is a no-op: nothing queued, nothing charged, no research reservation left behind'],
    ['shoot at your own units', r => r.bothAlive === false, 'the ATTACK command fires on your own unit, as StarCraft does (the tenth session reversed this on the user\'s word: "that should bypass and allow our units to attack our own buildings/units")'],
    ['merge two units that cannot merge', r => r.bothAlive === true && r.defs === 'marine,marine', 'nothing happens'],
    ['cast a spell with no energy and no research', r => r.alive === true && r.settled === true, 'refused, and the caster is not left mid-cast forever'],
    ['walk into a Nydus Canal that has no other end', r => r.skipped || r.settled === true, 'the order is dropped'],
  ]) {
    const r = R(race, n); if (!r) continue;
    if (n === 'give orders to a unit that is already dead' && r.accepted) deadBuildingTook.push(...r.accepted.map(k => race + ' ' + k));
    ok(race + ': ' + n + ' -> ' + why, !r.threw && test(r), JSON.stringify(r));
  }

  // ------------------------------------------------ rally somewhere silly
  run(`(() => {
    const B = this.base, cliff = this.cliff(B.x, B.y), m = this.mineral();
    // rally onto a mineral patch: the tile is not walkable, and setRally stores it as a resource
    this.wrong('rally production onto a mineral patch', () => {
      this.rich();
      const b = this.p.race === 'Z' ? this.hall() : this.spawn(this.p.race === 'T' ? 'barracks' : 'gateway', B.x + 17 * TILE, B.y + 5 * TILE);
      this.select(b);
      const btn = UI.currentCard().find(x => x.label === 'Set Rally');
      if (!btn) return { skipped: 'no rally button' };
      UI.press(btn); UI.execPending(null, m.cx, m.cy, false);
      const rallied = !!b.rally, onRes = !!(b.rally && b.rally.res);
      const uid = this.p.race === 'Z' ? null : (b.def.produces || [])[0];
      let made = null;
      if (uid) { G.queueUnit(b, uid); for (let i = 0; i < 24 * 60 && !made; i++) { this.tick(1); made = this.own(u => u.def.id === uid && u.spawnT > G.frame - 30)[0] || null; } }
      if (made) for (let i = 0; i < 24 * 25; i++) this.tick(1);
      return { rallied, onRes, made: !!made, order: made ? made.order.type : null, settled: made ? this.settled(made) : true };
    });
    this.wrong('rally production onto a cliff', () => {
      this.rich();
      const b = this.p.race === 'Z' ? this.hall() : this.spawn(this.p.race === 'T' ? 'barracks' : 'gateway', B.x + 17 * TILE, B.y + 9 * TILE);
      G.setRally(b, cliff[0], cliff[1], null);
      const uid = (b.def.produces || [])[0];
      let made = null;
      if (uid) { G.queueUnit(b, uid); for (let i = 0; i < 24 * 60 && !made; i++) { this.tick(1); made = this.own(u => u.def.id === uid && u.spawnT > G.frame - 30)[0] || null; } }
      if (made) for (let i = 0; i < 24 * 25; i++) this.tick(1);
      return { made: !!made, order: made ? made.order.type : null, settled: made ? this.settled(made) : true };
    });
    // and the resource itself vanishing out from under a worker on its way to it
    this.wrong('send a worker to a mineral patch and then mine it out', () => {
      const w = this.spawn(RACE_INFO[this.p.race].worker, B.x - 200, B.y - 200);
      const res = this.mineral();
      G.applying = true; try { w.setOrder({ type: 'gather', target: res, phase: 'goto' }); } finally { G.applying = false; }
      this.tick(12);
      G.applying = true; try { G.removeResource(res); } finally { G.applying = false; }
      for (let i = 0; i < 24 * 25; i++) { this.tick(1); if (w.order.type === 'idle') break; }
      return { took: w.order.type, settled: this.settled(w) };
    });
  })();`);

  for (const [n, test, why] of [
    ['rally production onto a mineral patch', r => r.skipped || (r.settled === true), 'the unit that pops out does not spend the game walking into rock'],
    ['rally production onto a cliff', r => r.settled === true, 'same, for a rally point nothing can reach'],
    ['send a worker to a mineral patch and then mine it out', r => r.settled === true, 'the worker finds something else to do'],
  ]) {
    const r = R(race, n); if (!r) continue;
    ok(race + ': ' + n + ' -> ' + why, !r.threw && test(r), JSON.stringify(r));
  }

  // ------------------------------------------------ transports and lift-off
  run(`(() => {
    const B = this.base;
    this.wrong('overfill a transport, then unload it', () => {
      this.rich();
      const tr = this.spawn(this.p.race === 'P' ? 'shuttle' : 'dropship', B.x + 200, B.y - 200);
      const made = [];
      for (let i = 0; i < 10; i++) made.push(this.spawn('marine', B.x + 190 + i * 6, B.y - 190));
      let loaded = 0;
      G.applying = true; try { for (const u of made) if (G.loadUnit(tr, u)) loaded++; } finally { G.applying = false; }
      const cap = tr.def.cargo;
      // and a flyer, which can never board
      const fl = this.spawn(this.p.race === 'P' ? 'scout' : 'wraith', B.x + 210, B.y - 210);
      let flyerBoarded = false;
      G.applying = true; try { flyerBoarded = G.loadUnit(tr, fl); } finally { G.applying = false; }
      this.select(tr); G.unloadAll(tr);
      for (let i = 0; i < 24 * 20 && tr.cargo.length; i++) this.tick(1);
      return { cap, loaded, overfilled: loaded > cap, flyerBoarded: !!flyerBoarded, emptied: tr.cargo.length === 0, orphans: made.filter(u => u.alive && u.inside && !u.inside.cargo.includes(u)).length, settled: this.settled(tr) };
    });
    if (this.p.race !== 'T') return;
    this.wrong('lift off a building with something in the queue, then land on top of another', () => {
      this.rich();
      const b = this.spawn('barracks', B.x + 20 * TILE, B.y + 5 * TILE);
      G.applying = true; try { G.map.block(b.tx, b.ty, b.def.w, b.def.h, b.id); } finally { G.applying = false; }
      G.queueUnit(b, 'marine');
      G.liftBuilding(b);
      const refused = !b.lifted;
      G.cancelProd(b, 0);
      G.liftBuilding(b);
      const lifted = !!b.lifted;
      const h = this.hall();
      G.applying = true; try { b.setOrder({ type: 'land', tx: h.tx, ty: h.ty }); } finally { G.applying = false; }
      for (let i = 0; i < 24 * 40; i++) { this.tick(1); if (b.order.type === 'idle') break; }
      return { refusedWhileQueued: refused, lifted, stillFlying: !!b.lifted, order: b.order.type, hallAlive: h.alive, settled: this.settled(b) };
    });
  })();`);

  for (const [n, test, why] of [
    ['overfill a transport, then unload it', r => r.overfilled === false && r.flyerBoarded === false && r.emptied === true && r.orphans === 0, 'the cap holds, a flyer cannot board, and everyone gets out again'],
    ['lift off a building with something in the queue, then land on top of another', r => r.refusedWhileQueued === true && r.lifted === true && r.settled === true && r.hallAlive === true, 'lift-off waits for the queue, and landing on an occupied spot is refused rather than eating the building'],
  ]) {
    const r = R(race, n); if (!r) continue;
    ok(race + ': ' + n + ' -> ' + why, !r.threw && test(r), JSON.stringify(r));
  }

  // ------------------------------------------------ let it all settle, then look for wreckage
  run('this.tick(24 * 60);');
  const out = json('({ results: this.results, issues: this.issues, botErrors: Bot.errors, notes: this.notes, frame: G.frame, over: G.over, ' +
    'liveOrders: this.own(u => !u.isBuilding && !this.settled(u)).map(u => u.def.id + "#" + u.id + ":" + u.order.type), ' +
    'minerals: Math.round(this.p.minerals), gas: Math.round(this.p.gas) })');

  const threw = out.results.filter(r => r.threw);
  ok(race + ': nothing thrown by any of the ' + out.results.length + ' wrong things', threw.length === 0,
    threw.map(r => r.name + ': ' + r.threw).join('\n      '));
  const uniq = [...new Set(out.issues.concat(out.botErrors))];
  const stuck = uniq.filter(s => s.startsWith('STUCK'));
  const invariant = uniq.filter(s => !s.startsWith('STUCK'));
  ok(race + ': no unit is left permanently stuck', stuck.length === 0, stuck.slice(0, 8).join('\n      '));
  ok(race + ': no simulation invariant broken (NaN, off-map, orphaned cargo, supply, resources)', invariant.length === 0, invariant.slice(0, 8).join('\n      '));
  ok(race + ': resources never went negative', out.minerals >= 0 && out.gas >= 0, out.minerals + 'm ' + out.gas + 'g');
  console.log('  ' + out.results.length + ' wrong things over ' + out.frame + ' frames (' + Math.round(out.frame / 24) + 's); ' +
    out.liveOrders.length + ' unit' + (out.liveOrders.length === 1 ? '' : 's') + ' still on an order after a minute of quiet' +
    (out.liveOrders.length ? ': ' + out.liveOrders.slice(0, 6).join(', ') : ''));
  if (VERBOSE) for (const r of out.results) console.log('    ' + r.name + ' -> ' + JSON.stringify(r));
}

ok('no JS errors anywhere', errors.length === 0, [...new Set(errors)].slice(0, 5).join('\n      '));

if (deadBuildingTook.length) {
  console.log('\n' + '-'.repeat(96));
  console.log('DIAGNOSIS -- a live defect, not a gap in this test: a dead building still takes orders.\n');
  console.log('Accepted by a building that had already been killed: ' + [...new Set(deadBuildingTook)].join(', ') + '.\n');
  console.log('CMD.apply (js/commands.js) resolves the target by id and checks only who owns it:\n');
  console.log("    case 'train': { const b = G.byId.get(c.b); return b && b.owner === own ? O.queueUnit.call(G, b, c.id) : false; }\n");
  console.log('and G.byId never forgets a unit, by design (invariant 8). The validators it forwards to test');
  console.log('b.done, b.lifted and b.unpowered but never b.alive, and a corpse is still `done`. So the');
  console.log('player is charged, the item lands in a production queue that will never tick, and for an');
  console.log('upgrade or a tech the reservation goes into p.researching -- which G.kill only clears for');
  console.log('items that were queued BEFORE the building died. That slot is then blocked for the rest of');
  console.log('the game, because nothing else will ever finish it.\n');
  console.log('Not reachable in single player: UI.ownSel filters on u.alive, so no card is ever built for a');
  console.log('corpse and G.exec applies immediately. It IS reachable in LAN, where Net.queue defers a');
  console.log('command to a later frame, and the building can die in between. Both clients apply it the');
  console.log('same way, so there is no desync -- just a quietly poisoned research slot and lost money.\n');
  console.log('The fix is a liveness test, either `b && b.alive && b.owner === own` in each building case of');
  console.log('CMD.apply, or `!b.alive` alongside the existing `!b.done` guard in each G.queue* validator.');
  console.log('-'.repeat(96));
}
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
