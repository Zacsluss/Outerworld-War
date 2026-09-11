// Player alerts: idle production, supply block, an empty Carrier, an undefended expansion under attack.
//   node test/alerts.js
// Two halves, because an alert has two ways to be wrong. The first half builds the situation and checks
// the alert arrives. The second half plays a full game competently and checks that every alert that
// fired was true at the moment it fired, and that none of them fired more often than its cooldown
// allows -- an alert that cries wolf is the reason players stop reading alerts.
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); } };

const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0])) }, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { } }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const run = src => vm.runInContext(src, ctx);

run(`(() => {
  this.spawn = (id, owner, x, y) => { G.applying = true; try { return G.spawnUnit(id, owner, x, y); } finally { G.applying = false; } };
  this.order = (u, o) => { G.applying = true; try { u.setOrder(o); } finally { G.applying = false; } };
  // a bare sandbox: one human, one computer that is switched off, so nothing but the scenario moves
  this.sandbox = (race, seed) => {
    G.init({ players: [{ race, human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: seed || 2, layout: 'temple' });
    for (const p of G.players) p.ai = null;
    return G.players[0];
  };
  // run until the message shows up, or give up; returns the frame it arrived on
  this.waitFor = (p, text, frames) => { for (let i = 0; i < frames; i++) { G.tick(); if (p.msgs.some(m => m.text === text)) return i; } return -1; };
})();`);

// ---------------- 1. each alert fires when it should ----------------

// supply block: sit at the cap and wait
run(`(() => {
  const p = this.sandbox('T');
  for (const u of G.units) if (u.alive && u.owner === 0 && u.def.id === 'supply_depot') G.kill(u, null, true);
  p.minerals = 500;
  for (let i = 0; i < 400 && p.supUsed < p.supMax; i++) { this.spawn('marine', 0, p.startX + 40, p.startY + 40); G.recomputeSupply(); }
  this.supply = { blocked: p.supUsed >= p.supMax, at: this.waitFor(p, RACE_INFO.T.supplyMsg, 24 * 20) };
})();`);
const supply = ctx.supply;
ok('a supply block is announced', supply.at >= 0, JSON.stringify(supply));
ok('...and it waits a few seconds first, rather than on the frame the cap is hit', supply.at >= 24 * 3, 'fired at frame ' + supply.at);

// idle production: a finished barracks, money in the bank, supply room, and nobody clicking it
run(`(() => {
  const p = this.sandbox('T');
  const b = this.spawn('barracks', 0, p.startX + 120, p.startY);
  b.done = true; b.hp = b.maxHp; p.minerals = 800; p.gas = 400;
  G.recomputeSupply();
  this.idle = { room: p.supMax - p.supUsed, at: this.waitFor(p, 'Production facilities are idle.', 24 * 30) };
})();`);
const idle = ctx.idle;
ok('an idle production building with the money to fill it is announced', idle.at >= 0, JSON.stringify(idle));
ok('...after eight seconds, not the instant a queue empties', idle.at >= 24 * 7, 'fired at frame ' + idle.at);

// ...and it stays quiet when the reason the barracks is empty is supply, not the player
run(`(() => {
  const p = this.sandbox('T');
  for (const u of G.units) if (u.alive && u.owner === 0 && u.def.id === 'supply_depot') G.kill(u, null, true);
  const b = this.spawn('barracks', 0, p.startX + 120, p.startY);
  b.done = true; b.hp = b.maxHp; p.minerals = 800;
  for (let i = 0; i < 400 && p.supUsed < p.supMax; i++) { this.spawn('marine', 0, p.startX + 40, p.startY + 40); G.recomputeSupply(); }
  this.idleBlocked = { at: this.waitFor(p, 'Production facilities are idle.', 24 * 40) };
})();`);
ok('a supply-blocked player is not also told its production is idle', ctx.idleBlocked.at < 0, 'fired at frame ' + ctx.idleBlocked.at);

// carrier with an empty hangar, ordered to attack something
run(`(() => {
  const p = this.sandbox('P');
  const c = this.spawn('carrier', 0, p.startX + 100, p.startY);
  c.done = true; c.hp = c.maxHp; c.interceptors = 0; c.launched = [];
  const foe = this.spawn('zergling', 1, c.x + 40, c.y);
  this.order(c, { type: 'attack', target: foe });
  this.carrier = { at: this.waitFor(p, 'Carrier has no interceptors.', 24 * 20) };
})();`);
ok('a Carrier fighting with an empty hangar is announced', ctx.carrier.at >= 0, JSON.stringify(ctx.carrier));

// ...but not a Carrier that has just been built and is filling its hangar
run(`(() => {
  const p = this.sandbox('P');
  const c = this.spawn('carrier', 0, p.startX + 100, p.startY);
  c.done = true; c.hp = c.maxHp; c.interceptors = 0; c.launched = [];
  p.minerals = 500; G.applying = true; try { G.queueUnit(c, 'interceptor'); } finally { G.applying = false; }
  const foe = this.spawn('zergling', 1, c.x + 40, c.y);
  this.order(c, { type: 'attack', target: foe });
  this.carrierBuilding = { queued: c.prod.length, at: this.waitFor(p, 'Carrier has no interceptors.', 24 * 20) };
})();`);
ok('a Carrier already building interceptors is left alone', ctx.carrierBuilding.queued > 0 && ctx.carrierBuilding.at < 0, JSON.stringify(ctx.carrierBuilding));

// an expansion under attack with nothing defending it
run(`(() => {
  const p = this.sandbox('T');
  const base = G.map.bases.filter(b => distPt(b.cx, b.cy, p.startX, p.startY) > 20 * TILE)[0];
  const cc = this.spawn('command_center', 0, base.cx, base.cy);
  cc.done = true; cc.hp = cc.maxHp;
  const foe = this.spawn('hydralisk', 1, cc.x + 60, cc.y);
  this.order(foe, { type: 'attack', target: cc });
  this.expo = { dist: Math.round(distPt(cc.x, cc.y, p.startX, p.startY) / TILE), at: this.waitFor(p, 'Your expansion is undefended and under attack.', 24 * 30) };
})();`);
ok('an undefended expansion under attack is announced as such', ctx.expo.at >= 0, JSON.stringify(ctx.expo));

// ...and a defended one gets the ordinary line instead, not the undefended one
run(`(() => {
  const p = this.sandbox('T');
  const base = G.map.bases.filter(b => distPt(b.cx, b.cy, p.startX, p.startY) > 20 * TILE)[0];
  const cc = this.spawn('command_center', 0, base.cx, base.cy);
  cc.done = true; cc.hp = cc.maxHp;
  const guard = this.spawn('siege_tank', 0, cc.x - 60, cc.y); guard.done = true;
  const foe = this.spawn('hydralisk', 1, cc.x + 60, cc.y);
  this.order(foe, { type: 'attack', target: cc });
  let generic = -1, bare = -1;
  for (let i = 0; i < 24 * 20; i++) { G.tick(); if (bare < 0 && p.msgs.some(m => m.text === 'Your expansion is undefended and under attack.')) bare = i; if (generic < 0 && p.msgs.some(m => m.text === 'Your base is under attack.')) generic = i; }
  this.expoHeld = { generic, bare };
})();`);
ok('a defended expansion gets the ordinary attack line, not the undefended one', ctx.expoHeld.generic >= 0 && ctx.expoHeld.bare < 0, JSON.stringify(ctx.expoHeld));

// A player who keeps pressing the button while blocked. This is the case section 2 cannot reach: it
// plays the human seat with the AI, and the AI checks its supply before it queues, so it never makes a
// refused click. A human does -- and the refusal says the same sentence the alert says, so without a
// shared cooldown the console fills with it. Found in play-test round five: 41 of 48 console lines in
// one eight-minute game, which buried the research line, both attack lines and every idle-production
// alert in a console that holds six.
run(`(() => {
  const p = this.sandbox('T');
  for (const u of G.units) if (u.alive && u.owner === 0 && u.def.id === 'supply_depot') G.kill(u, null, true);
  p.minerals = 9000;
  for (let i = 0; i < 400 && p.supUsed < p.supMax; i++) { this.spawn('marine', 0, p.startX + 40, p.startY + 40); G.recomputeSupply(); }
  const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'command_center');
  const text = RACE_INFO.T.supplyMsg;
  let lines = 0, refusals = 0, seen = -1;
  for (let i = 0; i < 24 * 120; i++) {
    G.applying = true; try { if (G.queueUnit(cc, 'scv') === false) refusals++; } finally { G.applying = false; }  // leaning on the hotkey
    G.tick();
    const m = p.msgs.filter(m => m.text === text).sort((a, b) => b.t - a.t)[0];
    if (m && m.t !== seen) { seen = m.t; lines++; }
  }
  this.mash = { refusals, lines, blocked: p.supUsed >= p.supMax, frames: 24 * 120, cool: ALERTS.supply.cool };
})();`);
const mash = ctx.mash;
const allowed = Math.ceil(mash.frames / mash.cool) + 1;
ok('a player leaning on a button while supply blocked still gets told once', mash.blocked && mash.refusals > 100 && mash.lines >= 1, JSON.stringify(mash));
ok('...and the refused clicks speak on the alert cooldown, not their own', mash.lines <= allowed, mash.refusals + ' refused clicks produced ' + mash.lines + ' console lines in ' + mash.frames + ' frames (at most ' + allowed + ' on a ' + mash.cool + '-frame cooldown)');

// ...and at the supply cap it must not tell the player to build a depot that cannot help. The cap is
// read from the simulation rather than written here: it moved from 200 to 500 in M11, and a test that
// hardcodes it asserts the number instead of the behaviour.
run(`(() => {
  const p = this.sandbox('T'); p.minerals = 9000; p.gas = 9000;
  for (let i = 0; i < 900 && p.supMax < SUPPLY_CAP; i++) { const d = this.spawn('supply_depot', 0, p.startX + 200 + (i % 10) * 80, p.startY + 200 + Math.floor(i / 10) * 80); d.done = true; G.recomputeSupply(); }
  for (let i = 0; i < 1200 && p.supUsed < p.supMax; i++) { this.spawn('marine', 0, p.startX + 40, p.startY + 40); G.recomputeSupply(); }
  const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'command_center');
  p.msgs.length = 0; p.lastAlert = {};
  G.applying = true; const accepted = G.queueUnit(cc, 'scv'); G.applying = false;
  G.tick();
  this.capped = { cap: SUPPLY_CAP, sup: p.supUsed + '/' + p.supMax, accepted, msgs: p.msgs.map(m => m.text), depotLine: RACE_INFO.T.supplyMsg };
})();`);
const capped = ctx.capped;
ok('at the supply cap (' + capped.cap + ') the refusal does not ask for more depots', capped.sup === capped.cap + '/' + capped.cap && capped.accepted === false && !capped.msgs.includes(capped.depotLine), JSON.stringify(capped));
ok('...it says the cap is the reason instead', capped.msgs.length === 1 && capped.msgs[0] === 'Maximum supply reached.', JSON.stringify(capped.msgs));

// ---------------- 2. nothing fires spuriously in a real game ----------------
// The human seat is played by the ordinary AI, so this is a competently played game rather than a
// player standing still. Every alert it raises is checked against the state of the world on the frame
// it was raised.
run(`(() => {
  const TEXTS = { supply: null, idleProd: 'Production facilities are idle.', carrier: 'Carrier has no interceptors.', expo: 'Your expansion is undefended and under attack.' };
  const fired = { supply: [], idleProd: [], carrier: [], expo: [] }, claims = [], tooSoon = [];
  let mins = 0;
  // three games rather than one: the point of this half is the absence of a false alert, and one game
  // is not much evidence of an absence.
  for (const g of [['P', 'T', 5, 'valley'], ['T', 'Z', 9, 'temple'], ['Z', 'P', 4, 'bloodbath']]) {
    G.init({ players: [{ race: g[0], human: true, name: 'A' }, { race: g[1], human: false, difficulty: 'normal', name: 'B' }], seed: g[2], layout: g[3] });
    const p = G.players[0];
    p.ai = new AI(p, 'normal');                     // a human seat that plays: alerts should be rare and always earned
    TEXTS.supply = RACE_INFO[g[0]].supplyMsg;
    const last = {};
    // THE SUPPLY MESSAGE HAS TWO VOICES. G.tickAlerts raises it as the alert this half is about; G.supplyRefused
    // speaks the same text when an order is refused for supply, on purpose (js/abilities.js: one voice for
    // being supply blocked). A refusal is true by construction -- it IS the supply check -- but truth() below
    // only knows the alert's definition (at the cap, or a queued unit stalled), so a refusal from a unit
    // morph at 84.5/85 read as a lie when a re-dealt game happened to sample one (REVIEW-M17 follow-up).
    // Note the frames the refusal spoke on and judge those messages by the refusal's own truth.
    let refusedAt = -1; const origRefused = G.supplyRefused;
    G.supplyRefused = function (q) { const r = origRefused.call(G, q); if (r && q === p) refusedAt = G.frame; return r; };
    // the ground truth for each alert, recomputed here independently of the code under test
    const truth = () => {
      let stalled = false;
      if (p.supMax < SUPPLY_CAP && p.supUsed < p.supMax) for (const u of G.units) {
        if (!u.alive || u.owner !== p.id || !u.prod.length) continue;
        const it = u.prod[0]; if (it.kind !== 'unit' || it.started || it.reserved) continue;
        const ud = DATA.units[it.id]; if (ud && ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) { stalled = true; break; }
      }
      const blocked = p.supMax < SUPPLY_CAP && (p.supUsed >= p.supMax || stalled);
      let idleB = false;
      if (!blocked) for (const u of G.units) {
        if (!u.alive || u.owner !== p.id || !u.isBuilding || !u.done || u.lifted) continue;
        if (u.def.spawnsLarva) { if (u.larvae.length && p.minerals >= 50) { idleB = true; break; } continue; }
        if (!u.def.produces.length || u.prod.length) continue;
        for (const id of u.def.produces) { const d = DATA.units[id]; if (!d || !p.hasReq(d)) continue; if (p.minerals < d.min || p.gas < d.gas) continue; if (d.sup && p.supUsed + d.sup * (d.pair ? 2 : 1) > p.supMax) continue; idleB = true; break; }
        if (idleB) break;
      }
      let emptyCarrier = false;
      for (const u of G.units) { if (!u.alive || u.owner !== p.id || u.def.id !== 'carrier' || !u.done || u.prod.length) continue; if (u.interceptors > 0 || (u.launched && u.launched.some(i => i.alive))) continue; emptyCarrier = true; break; }
      let bareHit = false;
      for (const u of G.units) {
        if (!u.alive || u.owner !== p.id || !u.isBuilding || G.frame - u.lastHit > 48) continue;
        if (distPt(u.x, u.y, p.startX, p.startY) < 16 * TILE) continue;
        let guarded = false;
        for (const o of G.near(u.x, u.y, 10 * TILE)) { if (!o.alive || o.owner !== p.id) continue; if (o.isBuilding ? (o.done && (o.def.gw || o.def.aw)) : (!o.def.worker && o.hasWeapon())) { guarded = true; break; } }
        if (!guarded) { bareHit = true; break; }
      }
      return { supply: blocked, idleProd: idleB, carrier: emptyCarrier, expo: bareHit };
    };
    for (let f = 0; f < 28800 && !G.over; f++) {
      G.tick();
      const m = p.msgs[p.msgs.length - 1];
      if (!m || m.t !== G.frame) continue;
      for (const [key, text] of Object.entries(TEXTS)) if (m.text === text) {
        const refused = key === 'supply' && refusedAt === G.frame;
        fired[key].push(G.frame); claims.push({ key, frame: G.frame, mu: g[0] + g[1], refused, true_: refused ? true : truth()[key] });   // a refusal is the supply check itself; section 1 above tests that voice on its own
        if (last[key] !== undefined && G.frame - last[key] < ALERTS[key].cool) tooSoon.push({ key, mu: g[0] + g[1], gap: G.frame - last[key] });
        last[key] = G.frame;
      }
    }
    mins += G.frame / 24 / 60;
    G.supplyRefused = origRefused;
  }
  this.live = { fired, claims, tooSoon, lies: claims.filter(c => !c.true_), total: claims.length, mins: +mins.toFixed(1) };
})();`);
const live = ctx.live;
const counts = Object.entries(live.fired).map(([k, f]) => k + ' ' + f.length).join(', ');
console.log('\n  three competently played games, ' + live.mins + ' minutes in all, raised ' + live.total + ' alerts: ' + counts + ' (of the supply ones, ' + live.claims.filter(c => c.refused).length + ' were refused orders speaking with the alert\'s voice)');
ok('every alert raised in a real game was true when it was raised', live.lies.length === 0, JSON.stringify(live.lies.slice(0, 4)));
ok('no alert repeats inside its own cooldown', live.tooSoon.length === 0, JSON.stringify(live.tooSoon.slice(0, 4)));
ok('the games are not drowned in alerts', live.total / Math.max(1, live.mins) < 6, live.total + ' in ' + live.mins + ' minutes');
ok('an unprompted game raises the two the AI is genuinely bad at', live.fired.idleProd.length > 0 && live.fired.supply.length > 0, counts);

ok('no JS errors', errors.length === 0, errors[0]);
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
