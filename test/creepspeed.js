// FIXLIST-M15 C3 (item 5, second half) -- the swarm moves faster over its own ground.
//
// "All zerg units on creep should have their speed increased just like it is in StarCraft 2 so look
// up the exact percentage."
//
// MEASURED ABSENT FIRST, and it was absent completely: 23 cases walked the same distance on creep and
// off it, and every one of them read an identical `u.speed` on both. There was no creep bonus
// anywhere in js/sim.js.
//
// The multipliers are StarCraft II's (Liquipedia, Creep and Speed) and live in DATA.creepSpeed:
//   most Zerg ground units  +30%      Locust  +40%      Sunken/Spore colony while uprooted  +150%
//   Drone, Broodling, Changeling, anything burrowed, anything flying: NOTHING.
//
// TWO THINGS HERE ARE DELIBERATELY NOT SC2 AND BOTH ARE ASSERTED SO THEY CANNOT DRIFT BACK:
//   the Queen  -- SC2's Queen is ground and gets +167%. This game's Queen FLIES (Brood War's) and
//                 already moves at 6.67, which is faster than SC2's on-creep Queen. She gets nothing,
//                 from the flier rule. DATA.creepSpeed still records 2.67 for her, inert.
//   Changeling -- has no def in this game at all. The entry exists so adding one cannot silently
//                 grant it the default.
//
// THIS FILE ASSERTS `u.speed` RATHER THAN DISTANCE TRAVELLED, and then proves separately that the
// getter reaches movement. Cumulative distance is a bad primary measure here and went red against
// correct code twice while writing this:
//   - it saturates. A boosted zergling crosses an eight-tile creep patch inside the window and stops.
//   - it is swamped by FACING. Unit's constructor sets a random facing and moveTo cuts a ground
//     unit's step to 45% while it turns more than 1.2 radians, so two zerglings spawned back to back
//     are not comparable over a short run. The first version measured 126.76px on creep against
//     128.42px off it while the speed getter was correctly reporting 7.137 against 5.49.
// Section 3 pins both headings east and compares the biggest single STEP, which is exact.
//
//   node test/creepspeed.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

// =============================================================================
// 1. the table: it exists, it is in DATA, and its numbers are SC2's
// =============================================================================
// `|| null` on every read, not decoration: JSON.stringify(undefined) is the string "undefined" and
// JSON.parse throws on it, so an unguarded read of a key a negative control just deleted would crash
// this file and hide every other result in it. HANDOFF-M15 trap 8.
const T = J('DATA.creepSpeed || null');
ok(T !== null, 'DATA.creepSpeed EXISTS -- before C3 there was no creep speed anywhere in the simulation', String(T));
if (T) {
  ok(T._ === 1.3, 'the default for a Zerg ground unit is +30%, which is SC2\'s number', String(T._));
  ok(T.locust === 1.4, 'the Locust gets +40%, not the default', String(T.locust));
  ok(T.drone === 1, 'THE DRONE GETS NOTHING -- the exception most likely to be missed, and the one that most changes the early game', String(T.drone));
  ok(T.broodling === 1, 'the Broodling gets nothing', String(T.broodling));
  ok(T.changeling === 1, 'and the Changeling gets nothing, which has no def in this game -- the entry is here so adding one cannot silently grant it the default', String(T.changeling));
  ok(T.sunken_colony === 2.5 && T.spore_colony === 2.5, 'both crawlers get +150% while uprooted', JSON.stringify([T.sunken_colony, T.spore_colony]));
  ok(T.queen === 2.67, 'the Queen\'s +167% is RECORDED, even though she flies here and so never collects it', String(T.queen));
}
// it has to be in DATA, because js/build.js hashes DATA and does not hash arbitrary globals. A bare
// const would let someone retune these numbers without moving the build stamp, which is the exact
// desync the stamp exists to refuse.
ok(J('typeof DATA.creepSpeed') === 'object' && J('typeof CREEP_SPEED === "undefined"') === true,
  'it lives in DATA and NOT in a bare global, so the build stamp covers the numbers and not just the code');

// =============================================================================
// 2. `u.speed` on creep against the same unit off it -- every case the entry names
// =============================================================================
// A dedicated flat map region is not needed: the same unit is teleported between one creep tile and
// one bare tile and asked its speed, so nothing but the ground under it differs. No ticking, no
// pathing, no arriving early.
const WANT = {
  // Zerg ground, the default
  zergling: 1.3, hydralisk: 1.3, ultralisk: 1.3, roach: 1.3, baneling: 1.3, lurker: 1.3,
  ravager: 1.3, defiler: 1.3, infestor: 1.3, swarm_host: 1.3, infested_terran: 1.3,
  // the named exceptions
  locust: 1.4, drone: 1, broodling: 1,
  // Zerg air gets nothing, and the Queen is here BECAUSE she flies
  queen: 1, overlord: 1, mutalisk: 1, scourge: 1, guardian: 1, devourer: 1, viper: 1, overseer: 1,
  // and no other race is touched at all
  marine: 1, scv: 1, siege_tank: 1, vulture: 1, zealot: 1, probe: 1, dragoon: 1, dark_templar: 1,
};
const sp = J(`(() => {
  G.init({ players: [{ race: 'Z', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (let f = 0; f < 300; f++) G.tick();
  const m = G.map;
  // one creep tile and one bare tile, both walkable, both flat, both free
  const find = (wantCreep) => {
    for (let ty = 3; ty < m.h - 3; ty++) for (let tx = 3; tx < m.w - 3; tx++) {
      const i = m.idx(tx, ty);
      if (m.walk[i] !== 1 || m.blocked[i] !== -1 || m.height[i] === 1) continue;   // blocked is an Int32Array: -1 means FREE
      if ((!!m.creep[i]) !== wantCreep) continue;
      if (!wantCreep && m.creep[m.idx(tx + 1, ty)]) continue;
      return [tx, ty];
    }
    return null;
  };
  const ON = find(true), OFF = find(false);
  const out = { _tiles: { ON, OFF }, _creepOn: !!m.creep[m.idx(ON[0], ON[1])], _creepOff: !!m.creep[m.idx(OFF[0], OFF[1])] };
  const read = (id, at, burrow) => {
    const u = G.spawnUnit(id, 0, (at[0] + 0.5) * TILE, (at[1] + 0.5) * TILE);
    if (burrow) u.burrowed = true;
    const s = u.speed;
    G.kill(u, null, true);
    return s;
  };
  for (const id of ${JSON.stringify(Object.keys(WANT))}) {
    const off = read(id, OFF, false), on = read(id, ON, false);
    out[id] = { off: Math.round(off * 10000) / 10000, on: Math.round(on * 10000) / 10000,
      ratio: off > 0 ? Math.round(on / off * 10000) / 10000 : null };
  }
  // burrowed, read WITHOUT a move order. A move order surfaces a burrowed unit (Unit.applyOrder,
  // BURROW_SURFACES), so ordering one to walk measures an UNBURROWED unit -- which is what the first
  // probe did, and it reported 7.137 for a "burrowed" zergling.
  for (const id of ['zergling', 'hydralisk', 'lurker']) {
    const off = read(id, OFF, true), on = read(id, ON, true);
    out[id + '(burrowed)'] = { off: Math.round(off * 10000) / 10000, on: Math.round(on * 10000) / 10000,
      ratio: off > 0 ? Math.round(on / off * 10000) / 10000 : null };
  }
  // the crawlers, which move only while uprooted and whose speed Unit.speed pins to a flat 1 first
  for (const id of ['sunken_colony', 'spore_colony']) {
    const mk = (at) => {
      const b = G.placeBuilding(DATA.buildings[id], at[0], at[1], 0);
      b.done = true; b.progress = 1; b.lifted = true;
      const s = b.speed; G.kill(b, null, true); return s;
    };
    const off = mk(OFF), on = mk(ON);
    out[id + '(uprooted)'] = { off: Math.round(off * 10000) / 10000, on: Math.round(on * 10000) / 10000,
      ratio: off > 0 ? Math.round(on / off * 10000) / 10000 : null };
    // ...and ROOTED it does not move at all, on creep or off it
    const rooted = (at) => { const b = G.placeBuilding(DATA.buildings[id], at[0], at[1], 0); b.done = true; const s = b.speed; G.kill(b, null, true); return s; };
    out[id + '(rooted)'] = { off: rooted(OFF), on: rooted(ON) };
  }
  return out;
})()`);
ok(sp._creepOn === true && sp._creepOff === false,
  'the two tiles really are one creep and one bare -- without this every ratio below is 1.0 for the wrong reason', JSON.stringify(sp._tiles));
for (const [id, want] of Object.entries(WANT)) {
  const r = sp[id];
  const why = want === 1.3 ? '+30%, the Zerg ground default'
    : want === 1.4 ? '+40%, its own entry'
    : id === 'queen' ? 'NOTHING -- she FLIES in this game, so the flier rule catches her before her 2.67 does'
    : id === 'drone' ? 'NOTHING, and this is the one that most changes the early game if it is wrong'
    : id === 'broodling' ? 'NOTHING'
    : J('!!DATA.all.' + id + '.fly') ? 'NOTHING -- it flies'
    : 'NOTHING -- it is not Zerg';
  ok(r && Math.abs(r.ratio - want) < 1e-9, id.padEnd(16) + ' ' + why, JSON.stringify(r));
}
for (const id of ['zergling', 'hydralisk', 'lurker'])
  ok(Math.abs(sp[id + '(burrowed)'].ratio - 1) < 1e-9,
    'BURROWED, ' + id + ' gets nothing -- creep does not help you dig', JSON.stringify(sp[id + '(burrowed)']));
for (const id of ['sunken_colony', 'spore_colony']) {
  ok(Math.abs(sp[id + '(uprooted)'].ratio - 2.5) < 1e-9,
    'UPROOTED, the ' + DATA_NAME(id) + ' walks at ' + sp[id + '(uprooted)'].on + ' on creep against ' + sp[id + '(uprooted)'].off + ' off it -- +150%', JSON.stringify(sp[id + '(uprooted)']));
  ok(sp[id + '(rooted)'].on === 0 && sp[id + '(rooted)'].off === 0,
    '...and ROOTED it does not move at all, on creep or off', JSON.stringify(sp[id + '(rooted)']));
}
function DATA_NAME(id) { return J('DATA.buildings.' + id + '.name'); }

// =============================================================================
// 3. it reaches MOVEMENT, not just the getter
// =============================================================================
// A getter that reports a number nothing uses would pass everything above. So: two zerglings, same
// frame count, same straight line, one on creep and one not.
//
// BOTH ARE POINTED EAST BEFORE THEY START, and that is not tidying the result -- it removes a
// confound that made the first version of this check go red against correct code. Unit's constructor
// sets `facing = G.rand() * 2PI`, and moveTo cuts a ground unit's step to 45% while it is turning
// more than 1.2 radians off its heading (HANDOFF-M15 trap 7: facing is not decoration). Two zerglings
// spawned back to back get DIFFERENT random facings, so over a short window the turn penalty swamps a
// 30% speed difference: the first run measured 126.76px on creep against 128.42px off it while the
// speed getter was correctly reporting 7.137 against 5.49. Same heading, and the per-frame step is
// 7.137 against 5.49 exactly.
const run = J(`(() => {
  G.init({ players: [{ race: 'Z', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (let f = 0; f < 300; f++) G.tick();
  const m = G.map;
  const LEN = 6;
  const runOf = (wantCreep) => {
    for (let ty = 3; ty < m.h - 3; ty++) for (let tx = 3; tx < m.w - LEN - 3; tx++) {
      let ok = true;
      for (let k = 0; k < LEN && ok; k++) for (let dy = -1; dy <= 1 && ok; dy++) {
        const i = m.idx(tx + k, ty + dy);
        if (m.walk[i] !== 1 || m.blocked[i] !== -1 || m.height[i] === 1 || (!!m.creep[i]) !== wantCreep) ok = false;
      }
      if (!ok) continue;
      if (G.units.some(o => o.alive && distPt(o.x / TILE, o.y / TILE, tx + LEN / 2, ty) < 5)) continue;
      return [tx, ty];
    }
    return null;
  };
  const ON = runOf(true), OFF = runOf(false);
  const FRAMES = 16;
  const go = (at) => {
    const u = G.spawnUnit('zergling', 0, (at[0] + 0.5) * TILE, (at[1] + 0.5) * TILE);
    u.facing = 0;                                                      // east, the way it is being sent
    u.applyOrder({ type: 'move', x: (at[0] + 40) * TILE, y: (at[1] + 0.5) * TILE });   // far, so it never arrives
    const x0 = u.x, y0 = u.y;
    let peak = 0;
    for (let f = 0; f < FRAMES; f++) { const px = u.x, py = u.y; G.tick(); peak = Math.max(peak, distPt(px, py, u.x, u.y)); }
    const d = distPt(x0, y0, u.x, u.y);
    const still = !!m.creep[m.idx(Math.floor(u.x / TILE), Math.floor(u.y / TILE))];
    G.kill(u, null, true);
    return { px: Math.round(d * 100) / 100, peakStep: Math.round(peak * 1000) / 1000, endedOnCreep: still };
  };
  const a = go(OFF), b = go(ON);
  return { off: a.px, on: b.px, ratio: Math.round(b.px / a.px * 1000) / 1000,
    peakOff: a.peakStep, peakOn: b.peakStep,
    offEndedOnCreep: a.endedOnCreep, onEndedOnCreep: b.endedOnCreep, frames: FRAMES };
})()`);
ok(run.onEndedOnCreep === true && run.offEndedOnCreep === false,
  'the two zerglings stayed on the ground they started on for the whole run', JSON.stringify(run));
ok(Math.abs(run.peakOn / run.peakOff - 1.3) < 0.01,
  'IT REACHES MOVEMENT: the biggest single step is ' + run.peakOn + 'px on creep against ' + run.peakOff + 'px off it -- exactly +30%', JSON.stringify(run));
// The CUMULATIVE distance is only asserted to be bigger, not bigger by 30%, and that is honest
// rather than lax: the two runs are on different terrain and so take different paths, and moveTo cuts
// a ground unit's step to 45% on a frame where it is turning hard toward the next waypoint. One extra
// waypoint turn on the creep side is worth more than the whole bonus over sixteen frames. The peak
// step above is the exact measurement; this one says the exactness is not cancelled out in practice.
ok(run.on > run.off,
  '...and over ' + run.frames + ' frames it covers more ground: ' + run.on + 'px against ' + run.off + 'px', JSON.stringify(run));

// =============================================================================
// 4. determinism -- this is squarely in the replay path
// =============================================================================
// Speed feeds movement and movement feeds everything, so the same seed must play out identically,
// and a game WITHOUT the bonus must play out differently. The second half is the one that matters:
// it is what separates "the number is in a table" from "the number changes the game".
//
// HAND-DRIVEN RATHER THAN AI-DRIVEN, because the first version was not sensitive and looked like a
// pass for it. Four minutes of a hard Zerg AI holds drones and overlords and little else -- the Drone
// has no bonus and the Overlord flies -- so all three arms hashed bit-identically and the check said
// nothing at all. Twenty zerglings walking over their own creep is guaranteed to be sensitive.
const det = J(`(() => {
  const play = (mult) => {
    G.init({ players: [{ race: 'Z', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 9, layout: 'temple' });
    for (const p of G.players) p.ai = null;
    G.checkVictory = () => { };
    for (let f = 0; f < 300; f++) G.tick();
    const save = DATA.creepSpeed._;
    DATA.creepSpeed._ = mult;
    const hall = G.units.find(u => u.owner === 0 && u.def.depot);
    const lings = [];
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2;
      const u = G.spawnUnit('zergling', 0, hall.x + Math.cos(a) * 3 * TILE, hall.y + Math.sin(a) * 3 * TILE);
      u.facing = a;
      u.applyOrder({ type: 'move', x: hall.x + Math.cos(a) * 30 * TILE, y: hall.y + Math.sin(a) * 30 * TILE });
      lings.push(u);
    }
    for (let f = 0; f < 240; f++) G.tick();
    let h = 0, walked = 0;
    for (const u of lings) { h = (Math.imul(h, 31) + Math.round(u.x * 16) * 3 + Math.round(u.y * 16)) | 0; walked += u.walkDist || 0; }
    DATA.creepSpeed._ = save;
    return { h, walked: Math.round(walked), mult: DATA.creepSpeed._ };
  };
  return { a: play(1.3), b: play(1.3), off: play(1) };
})()`);
ok(det.a.h === det.b.h, 'DETERMINISTIC: the same scenario played twice hashes identically', JSON.stringify([det.a.h, det.b.h]));
ok(det.a.h !== det.off.h,
  '...and NOT VACUOUS: the same scenario with the multiplier at 1.0 hashes differently', JSON.stringify([det.a.h, det.off.h]));
ok(det.a.walked > det.off.walked,
  '...and the twenty zerglings covered ' + det.a.walked + 'px with the bonus against ' + det.off.walked + 'px without it', JSON.stringify([det.a.walked, det.off.walked]));
ok(det.a.mult === 1.3, 'the probe put the table back afterwards, so nothing below it is measuring a patched table', String(det.a.mult));
ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
