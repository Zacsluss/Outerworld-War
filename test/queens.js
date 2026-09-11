// REVIEW-M17, the user's three Zerg notes (open tasks 25, 26, 27; task 23 is closed by 26): Spawn Larva
// stacks a hall to twelve, a computer Zerg keeps one Queen at every hatchery, and larvae come off the
// fullest hall.
//   node test/queens.js [--verbose]
//
// Measured before any of it (.claude/review/larva-probe.js, a solo Zerg AI, normal and hard, ten
// minutes): Queens by minute = 1 throughout -- the starting one -- with 227-355 gas banked; injects per
// hall 8/10/0/0/0 and 9/7/0/0/0, the two halls within 26 tiles of where she stood. production() asked
// for a Queen on 215 thinks and afford() refused every one (176 for the reserve, 39 flat broke): a unit
// that is not the composition's top pick is not a claim, and her 100 gas is what the head step and the
// next upgrade hold. After: one Queen per hall by minute nine on four of four arms, every finished hall
// injected, and a homed Queen out of the army (the fault open task 23 named from the other side).
//
// The inject mechanic itself -- +3 per cast, up to twelve, refused at twelve, a hall alone still stops at
// three -- is pinned in test/zerg12.js section 4, which is M12 item 11's home and was rewritten with it.
//
//  1. the data and the constant: per 3, cap 12, LARVA_NATURAL 3, and the card text says so
//  2. a cancelled egg goes back to a hall holding more than three (it used to be refunded and killed)
//  3. the AI keeps a Queen per hall: a solo game, Queens equal to halls, every finished hall injected,
//     homes distinct, a homed Queen not in supportUnits()
//  4. injectHall() casts on her own hall before a nearer one, and falls back when hers is full
//  5. an idle homed Queen far from home flies back; an unhomed one stays put
//  6. AI.train() takes the larva from the fullest hall
//  7. the home survives a snapshot round trip
//  8. nothing threw
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const ok = (m, c, x) => { if (c) { pass++; if (VERBOSE) console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

const errors = [];
const ctx = {
  console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ')) },
  Math, performance, addEventListener() { }, setTimeout,
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false },
  requestAnimationFrame() { },
};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const run = src => vm.runInContext(src, ctx);
const json = src => JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));

// ---------------------------------------------------------------- the rig (test/zerg12.js's, less the creep half)
run(`(() => {
  this.fresh = (seed) => {
    G.init({ players: [{ race: 'Z', human: true, name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: seed || 7, layout: 'temple' });
    for (const p of G.players) { p.ai = null; p.minerals = 20000; p.gas = 20000; }
    G.recording = false;
    G.applying = true;   // straight at the simulation: CMD.install's wrappers would pack each call as a command (see test/zerg12.js)
    this.p = G.players[0];
    this.hall = G.units.find(u => u.alive && u.owner === 0 && u.def.spawnsLarva);
    this.ai = new AI(this.p, 'normal');   // the human's own AI object, for its methods only; nothing ticks it
    return this.p;
  };
  this.tick = n => { for (let i = 0; i < n; i++) G.tick(); };
  this.place = (defId, owner, nearX, nearY, done) => {
    const def = DATA.buildings[defId], p = G.players[owner];
    for (let r = 2; r < 34; r++) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      const tx = Math.round(nearX / TILE + Math.cos(a) * r - def.w / 2), ty = Math.round(nearY / TILE + Math.sin(a) * r * .8 - def.h / 2);
      if (G.map.canPlace(def, tx, ty, p, G.units, null)) continue;
      const b = G.placeBuilding(def, tx, ty, owner);
      if (done !== false) { b.done = true; b.progress = def.time; b.hp = b.maxHp; b.creepR = def.creep || 0; }
      if (def.creep) G.map.recomputeCreep(G.units);
      G.recomputeSupply(); return b;
    }
    return null;
  };
  // a finished hatchery about \`tiles\` tiles from the start hall, in the direction of the map centre
  this.farHall = (tiles) => { const h = this.hall, cx = G.map.w * TILE / 2, cy = G.map.h * TILE / 2; const d = distPt(h.x, h.y, cx, cy) || 1; return this.place('hatchery', 0, h.x + (cx - h.x) / d * tiles * TILE, h.y + (cy - h.y) / d * tiles * TILE); };
  this.fill = (h, n) => { while (h.larvae.length < n) G.spawnLarva(h); while (h.larvae.length > n) G.kill(h.larvae[h.larvae.length - 1], null, true); return h.larvae.length; };
})()`);

// ================================================================ 1. the data and the constant
{
  const d = json(`({ per: DATA.abilities.larva_inject.per, cap: DATA.abilities.larva_inject.cap, natural: LARVA_NATURAL, text: DATA.abilities.larva_inject.desc || '', start: (() => { this.fresh(3); return this.hall.larvae.length; })(), tuned: BUILD.TUNING.includes('LARVA_NATURAL') })`);
  ok('Spawn Larva adds three per cast and a hall holds twelve (was: cap 3, fill only)', d.per === 3 && d.cap === 12, JSON.stringify(d));
  ok('a hall on its own spawns up to LARVA_NATURAL, three, and a Zerg starts with exactly that many', d.natural === 3 && d.start === 3, JSON.stringify(d));
  ok('the constant is stamped (BUILD.TUNING), so changing it refuses an old save', d.tuned === true, String(d.tuned));
  ok('the card text says three and twelve, not "back up to three"', /three/.test(d.text) && /twelve/.test(d.text) && !/back up to/.test(d.text), d.text);
}

// ================================================================ 2. a cancelled egg goes back to a hall above three
{
  const r = json(`(() => {
    this.fresh(3); const h = this.hall; this.fill(h, 6);
    const l = h.larvae[0]; const morphed = G.larvaMorph(l, 'drone'); const asEgg = l.def.id;
    const during = h.larvae.length;
    G.cancelProd(l, 0);
    return { morphed, asEgg, during, after: h.larvae.length, alive: l.alive, isLarva: l.def.id === 'larva', listed: h.larvae.includes(l), hatch: l.hatch === h };
  })()`);
  ok('a larva at a hall holding six becomes an egg and leaves the list', r.morphed === true && r.asEgg === 'egg' && r.during === 5, JSON.stringify(r));
  ok('CANCELLING IT PUTS THE LARVA BACK (it was killed once the hall held three, refund and all)', r.after === 6 && r.alive && r.isLarva && r.listed && r.hatch, JSON.stringify(r));
}

// ================================================================ 3. the AI keeps a Queen per hall
{
  const g = json(`(() => {
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'normal', name: 'Z' }, { race: 'T', human: true, name: 'H' }], seed: 3, layout: 'temple' }); G.players[1].ai = null;
    const ai = G.players[0].ai, injects = {}, seen = new Set(), doneAt = {}, byMinute = [];
    let frozen = null;
    for (let i = 1; i <= 24 * 60 * 10; i++) {
      G.tick(); if (G.over && frozen === null) frozen = i;   // a solo AI kills the AI-less Terran; ticks no-op from then on
      for (const f of G.fields) if (f.kind === 'inject' && f.owner === 0 && !seen.has(f)) { seen.add(f); injects[f.hall.id] = (injects[f.hall.id] || 0) + 1; }
      if (i % 24 === 0) for (const h of G.units) if (h.alive && h.owner === 0 && h.def.spawnsLarva && h.done && doneAt[h.id] === undefined) doneAt[h.id] = i;
      if (i % 1440 === 0) byMinute.push(G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'queen').length + '/' + ai.mine(u => u.isBuilding && u.def.spawnsLarva).length);
    }
    const end = frozen || 24 * 60 * 10;
    const queens = ai.mine(u => u.def.id === 'queen'), halls = ai.mine(u => u.isBuilding && u.def.spawnsLarva);
    const settled = halls.filter(h => h.done && end - doneAt[h.id] >= 24 * 90);   // finished at least ninety seconds before the end
    return {
      byMinute, frozenAt: frozen && Math.round(frozen / 24), queens: queens.length, halls: halls.length, gas: Math.round(G.players[0].gas),
      homes: queens.map(q => q.home ? q.home.id : null), hallIds: halls.map(h => h.id),
      settled: settled.map(h => ({ id: h.id, injects: injects[h.id] || 0, queen: queens.some(q => q.home === h) })),
      homedInSupport: ai.supportUnits().filter(u => u.def.id === 'queen' && u.home).length,
      unhomedQueens: queens.filter(q => !q.home).length,
      tickErrors: G.tickErrors,
    };
  })()`);
  const distinct = new Set(g.homes.filter(h => h !== null)).size;
  ok('a computer Zerg ends with one Queen per hall at ten minutes (was one Queen all game; measured 1/5) -- ' + g.byMinute.join(' '), g.queens >= 4 && g.queens >= g.halls - 1, JSON.stringify(g));
  ok('...every hall that has been finished for ninety seconds has been injected at least once (was 8/10/0/0/0)', g.settled.length >= 3 && g.settled.every(s => s.injects > 0), JSON.stringify(g.settled));
  ok('...each Queen is homed to a different hall, and every settled hall has one', distinct === g.queens - g.unhomedQueens && g.settled.every(s => s.queen), JSON.stringify([g.homes, g.settled]));
  ok('...and a homed Queen is not a support unit, so the army leaves without her (open task 23)', g.homedInSupport === 0 && g.queens - g.unhomedQueens >= 4, JSON.stringify([g.homedInSupport, g.unhomedQueens]));
  ok('...with nothing thrown inside a tick', g.tickErrors === 0, String(g.tickErrors));
}

// ================================================================ 4. injectHall() casts on her own hall first
{
  const r = json(`(() => {
    this.fresh(3); const A = this.hall, B = this.farHall(14); if (!B) return { noB: true };
    this.fill(A, 1); this.fill(B, 1);
    const q = G.spawnUnit('queen', 0, A.x + 40, A.y + 40); q.energy = 200;
    const near = this.ai.injectHall(q); near.id;                    // no home: the nearest hall
    q.home = B; const home = this.ai.injectHall(q);                 // homed to the far one: hers first
    this.fill(B, DATA.abilities.larva_inject.cap); const full = this.ai.injectHall(q);   // hers full: back to the nearest with room
    this.fill(B, 1); G.fields.push({ kind: 'inject', x: B.x, y: B.y, r: 0, t: 100, owner: 0, hall: B }); const booked = this.ai.injectHall(q);
    return { dAB: Math.round(distPt(A.x, A.y, B.x, B.y) / TILE), near: near && near.id, home: home && home.id, full: full && full.id, booked: booked && booked.id, A: A.id, B: B.id };
  })()`);
  ok('a second hatchery stands about fourteen tiles away for the scene', !r.noB && r.dAB >= 10 && r.dAB <= 18, JSON.stringify(r));
  ok('an unhomed Queen injects the nearest hall', r.near === r.A, JSON.stringify(r));
  ok('A HOMED QUEEN INJECTS HER OWN HALL FIRST, though another is nearer', r.home === r.B, JSON.stringify(r));
  ok('...unless hers is at the cap, or already spawning: then the nearest with room', r.full === r.A && r.booked === r.A, JSON.stringify(r));
}

// ================================================================ 5. an idle homed Queen flies home
{
  const r = json(`(() => {
    this.fresh(3); const A = this.hall;
    const q = G.spawnUnit('queen', 0, A.x + 20 * TILE, A.y); q.energy = 0;   // no energy: none of her spell clauses can take the tick
    const u = G.spawnUnit('queen', 0, A.x + 20 * TILE, A.y + 64); u.energy = 0; // the control: same spot, no home
    q.home = A;
    const d0 = distPt(q.x, q.y, A.x, A.y) / TILE;
    this.ai.micro();
    const order = q.order.type, ctrl = u.order.type;
    this.tick(24 * 12); const d1 = distPt(q.x, q.y, A.x, A.y) / TILE, dc = distPt(u.x, u.y, A.x, A.y) / TILE;
    return { d0: Math.round(d0), order, ctrl, d1: Math.round(d1), dc: Math.round(dc) };
  })()`);
  ok('a homed Queen idle twenty tiles from her hall is given a move order by micro()', r.d0 === 20 && r.order === 'move', JSON.stringify(r));
  ok('...and is within five tiles of it twelve seconds later', r.d1 <= 5, JSON.stringify(r));
  ok('CONTROL: an unhomed Queen at the same spot is left alone', r.ctrl === 'idle' && r.dc >= 19, JSON.stringify(r));
}

// ================================================================ 6. the larva from the fullest hall
{
  const r = json(`(() => {
    this.fresh(3); const A = this.hall, B = this.farHall(14); if (!B) return { noB: true };
    this.fill(A, 2); this.fill(B, 9);
    const oldest = G.units.find(u => u.alive && u.owner === 0 && u.def.larva);   // what train() used to take: the first in G.units order
    const trained = this.ai.train('drone');                                        // through the AI's own purchase path, not pickLarva() directly
    const afterA = A.larvae.length, afterB = B.larvae.length;
    this.fill(B, 1);
    const second = this.ai.pickLarva();
    this.fill(A, 0); this.fill(B, 0);
    const none = this.ai.pickLarva();
    return { trained, afterA, afterB, oldest: oldest && oldest.hatch.id, second: second && second.hatch.id, none, A: A.id, B: B.id };
  })()`);
  ok('with two larvae at the start hall and nine at the far one, AI.train() morphs one from the far one', !r.noB && r.trained === true && r.afterB === 8 && r.afterA === 2, JSON.stringify(r));
  ok('...which is NOT the oldest larva in G.units order (the rule train() used to follow: the start hall would have gone to one)', r.oldest === r.A, JSON.stringify(r));
  ok('...and pickLarva() turns to the start hall once it holds more', r.second === r.A, JSON.stringify(r));
  ok('...and is null when there is none', r.none === null, JSON.stringify(r));
}

// ================================================================ 7. the home survives a snapshot
{
  const r = json(`(() => {
    this.fresh(3); const A = this.hall;
    const q = G.spawnUnit('queen', 0, A.x + 40, A.y + 40); q.home = A;
    const s = Snapshot.take(); const enc = s.units.find(u => u.id === q.id).home;
    q.home = null;
    Snapshot.restore(s);
    const q2 = G.byId.get(q.id), A2 = G.byId.get(A.id);
    return { enc, restored: q2 && q2.home === A2 && A2.def.spawnsLarva, sameObject: q2 && q2.home === G.units.find(u => u.id === A.id) };
  })()`);
  ok('the Queen\'s home is written as a unit reference, not a copy of the hall', r.enc && r.enc.__u !== undefined, JSON.stringify(r.enc));
  ok('...and comes back as the same hall object after a restore', r.restored === true && r.sameObject === true, JSON.stringify(r));
}

// ================================================================ 8. nothing threw
ok('no JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
