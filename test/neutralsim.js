// The neutral owner, wired into the simulation. M11 wave two, items 1 (hostile life) and 8 (derelicts).
//
// test/neutrals.js covers the DATA -- race 'N', the defs, the presets, and the fact that nothing in
// any build menu or tech tree can see them. This covers the four things the simulation had to learn,
// and three of those four fail SILENTLY, which is why each has a check of its own:
//
//   * G.checkVictory counts teams among the undefeated. A neutral player holding a derelict is never
//     defeated, so it contributes team -1 forever and the game NEVER ENDS. On a derelict map that
//     fires every single time.
//   * ...and left in the loop above it, the same function defeats the neutral player when its last
//     creature dies and tells every human "Neutral has been eliminated."
//   * AI.enemies() filters on "not allied and not defeated". The neutral owner passes both, so every
//     AI picks a warren as an enemy base and sends waves at it.
//   * Abilities.repairTick refuses a target you do not own. That refusal is right everywhere else,
//     and repairing what you do not own is exactly what taking a derelict IS.
//   node test/neutralsim.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, addEventListener() { }, setTimeout,
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

const r = vm.runInContext(`(() => {
  const out = {};
  const mk = (key, val) => { const L = JSON.parse(JSON.stringify(MAP_LAYOUTS.temple)); if (key) L[key] = val; MAP_LAYOUTS['__' + (key || 'plain')] = L; return '__' + (key || 'plain'); };
  const both = (() => { const L = JSON.parse(JSON.stringify(MAP_LAYOUTS.temple)); L.derelicts = 'standard'; L.wildlife = 'standard'; MAP_LAYOUTS.__both = L; return '__both'; })();
  const start = layout => G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 7, layout });

  // ---- the player exists only when the map has something for it to own ----
  start(mk(null));
  out.plain = { neutral: !!G.neutral, players: G.players.length, human: G.human };
  start(both);
  out.withNeutrals = { neutral: !!G.neutral, players: G.players.length, human: G.human,
    last: G.players[G.players.length - 1].neutral === true, team: G.neutral.team, race: G.neutral.race,
    p0: G.players[0].name, p1: G.players[1].name };

  // ---- victory: the neutral owner neither wins, blocks, nor is announced ----
  const msgs = [];
  G.players[0].msg = m => msgs.push(m);
  for (const u of G.units) if (u.alive && u.owner === 1) G.kill(u, null, true);
  for (let i = 0; i < 120; i++) G.tick();
  out.victory = { over: G.over, winner: G.winner, neutralDefeated: G.neutral.defeated,
    neutralStillHasThings: G.units.some(u => u.alive && u.owner === G.neutral.id) };

  // ...and the other half: kill everything the neutral owns and check nobody is told about it
  start(both);
  const msgs2 = []; for (const p of G.players) if (p.human) p.msg = m => msgs2.push(String(m));
  for (const u of G.units) if (u.alive && u.owner === G.neutral.id) G.kill(u, null, true);
  for (let i = 0; i < 60; i++) G.tick();
  out.notAnnounced = { said: msgs2.filter(m => /Neutral/i.test(m)), defeated: G.neutral.defeated };

  // ---- the AI does not treat it as an opponent ----
  start(both);
  const ai = G.players[1].ai;
  out.aiEnemies = { list: ai.enemies().map(q => q.name), includesNeutral: ai.enemies().some(q => q.neutral) };

  // ---- buried life ----
  start(both);
  const np = G.neutral;
  const grub = G.units.find(u => u.alive && u.owner === np.id && u.def.id === 'carrion_grub');
  const maw = G.units.find(u => u.alive && u.owner === np.id && u.def.id === 'carrion_maw');
  out.buried = { grub: !!grub.buried, maw: !!maw.buried, usesWakeNotBurrowed: !DATA.units.carrion_grub.burrowed && !!DATA.units.carrion_grub.wake.buried };

  // ...cannot be shot, and no detector answers that
  const marine = G.spawnUnit('marine', 0, grub.x + 40, grub.y);
  const vessel = G.spawnUnit('science_vessel', 0, grub.x + 40, grub.y);
  G.players[0].vis.fill(2);
  out.unshootable = { buried: G.targetable(marine, grub), det: vessel.def.det === true,
    afterSurfacing: null };

  // ...walking past wakes a grub (by includes 'walk'), and does NOT wake a maw (build and mine only)
  const before = { grub: grub.buried, maw: maw.buried };
  marine.x = grub.x + 30; marine.y = grub.y;
  const spy = G.spawnUnit('marine', 0, maw.x + 30, maw.y);
  for (let i = 0; i < 200; i++) { marine.x = grub.x + 30; marine.y = grub.y; spy.x = maw.x + 30; spy.y = maw.y; G.tick(); }
  out.wake = { grubWoke: before.grub && !grub.buried, mawStayed: before.maw && !!maw.buried,
    grubBy: DATA.units.carrion_grub.wake.by, mawBy: DATA.units.carrion_maw.wake.by };
  out.unshootable.afterSurfacing = G.targetable(marine, grub);

  // ...and it does not chase past its leash
  const leash = DATA.units.carrion_grub.wake.leash;
  const far = G.spawnUnit('marine', 0, grub.lair.x + (leash + 8) * TILE, grub.lair.y);
  for (let i = 0; i < 400; i++) G.tick();
  out.leash = { leash, dist: +(Math.hypot(grub.x - grub.lair.x, grub.y - grub.lair.y) / TILE).toFixed(1) };

  // ---- derelicts ----
  start(mk('derelicts', 'standard'));
  const np2 = G.neutral, p = G.players[0];
  const arch = G.units.find(u => u.alive && u.owner === np2.id && u.def.id === 'derelict_archive');
  out.ruined = { hp: arch.hp, max: arch.maxHp, frac: +(arch.hp / arch.maxHp).toFixed(2), spec: arch.def.derelict.ruin, owner: arch.owner === np2.id };

  // a worker takes it by repairing it; a non-worker cannot
  const marine2 = G.spawnUnit('marine', 0, arch.x + 60, arch.y + 60);
  marine2.applyOrder({ type: 'repair', target: arch });
  for (let i = 0; i < 200; i++) G.tick();
  out.workerOnly = { stillNeutral: arch.owner === np2.id, hp: arch.hp };

  p.minerals = 900; p.gas = 900; const m0 = p.minerals, g0 = p.gas;
  const upg0 = p.upgLevel('infA');
  const scv = G.spawnUnit('scv', 0, arch.x + 70, arch.y + 70);
  scv.applyOrder({ type: 'repair', target: arch });
  let f = 0; while (f < 5000 && arch.owner === np2.id) { G.tick(); f++; }
  out.capture = { frames: f, seconds: +(f / 24).toFixed(1), owner: arch.owner, captured: !!arch.captured,
    hp: arch.hp === arch.maxHp, upgBefore: upg0, upgAfter: p.upgLevel('infA'),
    gasSpent: g0 - p.gas, gasSpec: arch.def.derelict.gas };

  // the foundry grants a unit that exists nowhere else in the game
  const fo = G.units.find(u => u.alive && u.owner === np2.id && u.def.id === 'derelict_foundry');
  p.minerals = 1500; p.gas = 1500;
  const scv2 = G.spawnUnit('scv', 0, fo.x + 70, fo.y + 70);
  scv2.applyOrder({ type: 'repair', target: fo });
  f = 0; while (f < 6000 && fo.owner === np2.id) { G.tick(); f++; }
  out.foundry = { owner: fo.owner, canQueue: fo.owner === 0 ? G.queueUnit(fo, 'sentinel') : false,
    sentinelBuildableElsewhere: Object.values(DATA.buildings).some(d => d.id !== 'derelict_foundry' && (d.produces || []).includes('sentinel')) };

  // ---- a snapshot carries all of it ----
  const snap = Snapshot.take();
  const liveOwner = arch.owner, liveCaptured = !!arch.captured;
  const liveBuried = G.units.filter(u => u.alive && u.buried).length;
  Snapshot.restore(snap);
  const arch2 = G.byId.get(arch.id);
  out.snap = { owner: arch2.owner === liveOwner, captured: !!arch2.captured === liveCaptured,
    buried: G.units.filter(u => u.alive && u.buried).length === liveBuried,
    neutralStillThere: !!G.neutral };
  return out;
})()`, ctx);

ok(!r.plain.neutral && r.plain.players === 2, 'a map with neither derelicts nor wildlife gets no neutral player at all', JSON.stringify(r.plain));
ok(r.withNeutrals.neutral && r.withNeutrals.players === 3, '...and one that has them gets exactly one', JSON.stringify(r.withNeutrals));
ok(r.withNeutrals.last && r.withNeutrals.p0 === 'A' && r.withNeutrals.p1 === 'B', 'it is appended LAST, so players[i] still means what it meant', JSON.stringify(r.withNeutrals));
ok(r.withNeutrals.team === -1 && r.withNeutrals.race === 'N', 'on team -1, allied with exactly itself', JSON.stringify(r.withNeutrals));
ok(r.withNeutrals.human === 0, 'and it is never mistaken for the human player', JSON.stringify(r.withNeutrals));

ok(r.victory.over && r.victory.winner === 0, 'the game still ENDS with a neutral player on the map -- left in the count it never would', JSON.stringify(r.victory));
ok(r.victory.neutralStillHasThings && !r.victory.neutralDefeated, '...while the neutral owner is still standing and still not defeated', JSON.stringify(r.victory));
ok(r.notAnnounced.said.length === 0, 'and killing every creature does not tell the player "Neutral has been eliminated"', JSON.stringify(r.notAnnounced));

ok(!r.aiEnemies.includesNeutral, 'no AI counts it as an opponent -- otherwise every AI sends waves at a warren', JSON.stringify(r.aiEnemies));

ok(r.buried.grub && r.buried.maw, 'creatures start buried');
ok(r.buried.usesWakeNotBurrowed, '...via wake.buried and never def.burrowed, which would burrow a grub the warren spits out mid-fight');
ok(r.unshootable.buried === false, 'a buried creature cannot be shot', JSON.stringify(r.unshootable));
ok(r.unshootable.det && r.unshootable.afterSurfacing === true, '...and a detector does not answer it either -- the tell on the ground is the warning', JSON.stringify(r.unshootable));

ok(r.wake.grubWoke, 'walking past wakes a grub', JSON.stringify(r.wake));
ok(r.wake.mawStayed, '...and does not wake a maw, which only answers building and mining', JSON.stringify(r.wake));
ok(!r.wake.mawBy.includes('walk') && r.wake.grubBy.includes('walk'), '...which is what the defs say', JSON.stringify(r.wake));
ok(r.leash.dist <= r.leash.leash + 1, 'a woken creature does not chase past its leash -- it guards ground, it is not a third faction', JSON.stringify(r.leash));

ok(r.ruined.frac === r.ruined.spec && r.ruined.owner, 'a derelict starts at its ruin fraction, owned by nobody', JSON.stringify(r.ruined));
ok(r.workerOnly.stillNeutral, 'a marine cannot take one -- capture is by worker', JSON.stringify(r.workerOnly));
ok(r.capture.owner === 0 && r.capture.captured && r.capture.hp, 'a worker repairing one to full TAKES it', JSON.stringify(r.capture));
ok(r.capture.seconds > 20 && r.capture.seconds < 90, '...over a real span of time, not instantly', JSON.stringify(r.capture));
ok(Math.abs(r.capture.gasSpent - r.capture.gasSpec) <= 2, '...and it costs what the def says, charged pro rata', JSON.stringify(r.capture));
ok(r.capture.upgAfter === r.capture.upgBefore + 1, 'the archive grants a free armour level on capture', JSON.stringify(r.capture));
ok(r.foundry.owner === 0 && r.foundry.canQueue, 'the foundry lets its new owner build a Sentinel', JSON.stringify(r.foundry));
ok(!r.foundry.sentinelBuildableElsewhere, '...which nothing else in the game can build, so capturing it is the only way to have one', JSON.stringify(r.foundry));

ok(r.snap.owner && r.snap.captured, 'a snapshot carries who owns a derelict and that it was captured', JSON.stringify(r.snap));
ok(r.snap.buried && r.snap.neutralStillThere, '...and which creatures are still in the ground', JSON.stringify(r.snap));

console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
