// FIXLIST-M14 C4 (item 19) -- the Cyclone fires while moving.
//
// Every unit in this game plants itself the moment something walks into range: Unit.engage clears the
// path after the shot, which is the engine's default and is why a Goliath stands still to fight. The
// Cyclone is meant to be a chaser -- the thing that can shoot what outruns a Siege Tank -- and it could
// not, because it stopped as soon as it was in range.
//
// `onMove` is a flag ON THE WEAPON, not a Cyclone clause in the combat loop, so the next unit that
// needs it costs one field rather than another branch.
//
// DAMAGE, RANGE AND COOLDOWN ARE UNCHANGED -- the user's decision, recorded in the fixlist: firing on
// the move is a mobility change only, and pricing it belongs to the gated balance run. There is a check
// for that below, because "a mobility change" is easy to say and easy to drift out of.
//
// THE GOLIATH IS THE NEGATIVE CONTROL AND IT IS BUILT IN. Both units are put through the identical
// scenario in the same game; if the Cyclone moved because of something about the scenario rather than
// about the flag, the Goliath would move too.
//
//   node test/onmove.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

// =============================================================================
// 1. the flag, and the numbers it must not have touched
// =============================================================================
// Evaluated as a boolean INSIDE the vm rather than returned and compared out here: with the flag
// removed the field is undefined, JSON.stringify hands back the literal "undefined", and JSON.parse
// throws -- so the negative control would crash the file instead of turning this line red.
ok(J('DATA.units.cyclone.gw.onMove === true') === true, 'the Cyclone\'s ground weapon carries onMove');
ok(J("Object.keys(DATA.units).filter(k => (DATA.units[k].gw && DATA.units[k].gw.onMove) || (DATA.units[k].aw && DATA.units[k].aw.onMove))").join(',') === 'cyclone',
  'and it is the only weapon in the game with it -- one unit, one field, no combat-loop clause',
  J("Object.keys(DATA.units).filter(k => (DATA.units[k].gw && DATA.units[k].gw.onMove) || (DATA.units[k].aw && DATA.units[k].aw.onMove))").join(','));
{ const w = J('DATA.units.cyclone.gw');
  ok(w.dmg === 14 && w.range === 6 && w.cd === 22 && w.type === 'explosive' && w.targets === 'both',
    'DAMAGE, RANGE, COOLDOWN AND TYPE ARE UNTOUCHED -- this is a mobility change and nothing else', JSON.stringify([w.dmg, w.range, w.cd, w.type, w.targets]));
  ok(J('DATA.units.cyclone.speed') === 7 && J('DATA.units.cyclone.min') === 125 && J('DATA.units.cyclone.gas') === 50,
    '...and so are its speed and its price'); }
ok(J('DATA.units.goliath.gw.onMove === undefined') === true, 'the Goliath does not have it, which is what makes it a control');

// =============================================================================
// 2. played out: identical scenario, two units, one game
// =============================================================================
// Both are given the same attack-move across the map, both meet the same enemy standing in their path
// at the same distance. The measurement is how far each travelled while it had a target in range.
const run = J(`(() => {
  const trial = (id) => {
    G.init({ players: [{ race: 'T', human: false, name: 'A', team: 1 }, { race: 'T', human: false, name: 'B', team: 2 }], seed: 3, layout: 'temple' });
    for (const p of G.players) p.ai = null;
    for (const u of [...G.units]) G.kill(u, null, true);
    G.units = G.units.filter(u => u.alive);
    G.checkVictory = () => { };
    const m = G.map, T = TILE;
    // a long clear lane through the middle of the map
    const y = Math.floor(m.h / 2), x0 = Math.floor(m.w / 2) - 18;
    const me = G.spawnUnit(id, 0, x0 * T, y * T);
    // Something to shoot at, standing four tiles OFF the lane rather than on it. On the lane it is a
    // roadblock: the Cyclone tries to walk through it, collision shoves it back, and the run measures
    // the separation pass instead of the feature -- 277 moving frames and six pixels of net progress.
    // Four tiles to the side is inside both weapons' range (6 and 5) and in nobody's way.
    const foe = G.spawnUnit('marine', 1, (x0 + 14) * T, (y + 4) * T);
    foe.hp = 99999; foe.maxHp = 99999;   // it must survive, or the test measures a dead target
    G.updateVision();
    me.applyOrder({ type: 'attackmove', x: (x0 + 34) * T, y: y * T });   // applyOrder, not setOrder: see the note in the header
    const start = me.x;
    let firedWhileMoving = 0, framesInRange = 0, shots = 0, lastHp = foe.hp;
    let xAtFirstRange = null;
    for (let f = 0; f < 24 * 14; f++) {
      const wasIn = me.alive && foe.alive && me.inRange(foe);
      const px = me.x;
      G.tick();
      if (!me.alive) break;
      if (wasIn) {
        framesInRange++;
        if (xAtFirstRange === null) xAtFirstRange = px;
        if (Math.abs(me.x - px) > 0.01) firedWhileMoving++;
      }
      if (foe.hp < lastHp) { shots++; lastHp = foe.hp; }
    }
    return { id, start, end: me.x, travelled: Math.round(me.x - start),
      travelledInRange: xAtFirstRange === null ? 0 : Math.round(me.x - xAtFirstRange),
      framesInRange, movedFrames: firedWhileMoving, shots, alive: me.alive, damageDealt: 99999 - foe.hp };
  };
  return { cyclone: trial('cyclone'), goliath: trial('goliath') };
})()`);
const C = run.cyclone, Gl = run.goliath;
ok(C.framesInRange > 20 && Gl.framesInRange > 20, 'both units spent real time with the enemy in range', JSON.stringify([C.framesInRange, Gl.framesInRange]));
ok(C.shots > 0 && Gl.shots > 0, 'and both actually shot it', JSON.stringify([C.shots, Gl.shots]));
// The Goliath still closes a little after inRange() first says yes -- inRange carries a two-pixel
// tolerance that engage() does not -- so the control is not "zero" but "a fraction of what the Cyclone
// does". The ratio is the measurement; the absolute number is the engine's slack.
ok(Gl.travelledInRange < 80, 'THE GOLIATH STOPS: once the enemy is in range it closes a few pixels and then stands still', JSON.stringify(Gl));
ok(C.travelledInRange > 100, 'THE CYCLONE DOES NOT: it keeps advancing the whole time it is shooting', JSON.stringify(C));
ok(C.movedFrames > C.framesInRange * 0.8, '...and it is moving on almost every frame it is in range, not stuttering', C.movedFrames + ' of ' + C.framesInRange);
ok(Gl.movedFrames < Gl.framesInRange * 0.15, 'while the Goliath is standing still on almost every one of its', Gl.movedFrames + ' of ' + Gl.framesInRange);
ok(C.travelled > Gl.travelled * 3, 'so across the same fourteen seconds the Cyclone covers far more ground', JSON.stringify([C.travelled, Gl.travelled]));

// FIRING ON THE MOVE IS NOT FIRING FASTER, and the check has to be a RATE rather than a total: the
// Cyclone walks past the enemy and out of range, so it naturally gets fewer shots than something that
// stands still and fires forever. Fewer shots is the price of the mobility, not a bug. What must hold
// is that neither unit beat its own cooldown.
const rate = (r, cd) => r.shots <= Math.ceil(r.framesInRange / cd) + 1;
ok(rate(C, J('DATA.units.cyclone.gw.cd')), 'the Cyclone never beat its own 22-frame cooldown', JSON.stringify([C.shots, C.framesInRange]));
ok(rate(Gl, J('DATA.units.goliath.gw.cd')), 'and neither did the Goliath', JSON.stringify([Gl.shots, Gl.framesInRange]));
ok(C.shots < Gl.shots, '...and the Cyclone gets FEWER shots in, because it walked out of range -- that is the price of the mobility', JSON.stringify([C.shots, Gl.shots]));

// =============================================================================
// 3. the flag does not leak into the things that must still stand still
// =============================================================================
const still = J(`(() => {
  G.init({ players: [{ race: 'T', human: false, name: 'A', team: 1 }, { race: 'Z', human: false, name: 'B', team: 2 }], seed: 3, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (const u of [...G.units]) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive);
  const m = G.map, T = TILE, y = Math.floor(m.h / 2), x0 = Math.floor(m.w / 2) - 10;
  const out = {};
  const cy = G.spawnUnit('cyclone', 0, x0 * T, y * T);
  const foe = G.spawnUnit('marine', 1, (x0 + 4) * T, y * T); foe.hp = 99999; foe.maxHp = 99999;
  G.updateVision();
  // HOLD POSITION must still hold: it fires through a different path that never touched engage()
  cy.applyOrder({ type: 'hold' });
  const hx = cy.x, hy = cy.y;
  for (let f = 0; f < 24 * 6; f++) G.tick();
  out.heldStill = Math.abs(cy.x - hx) < 1 && Math.abs(cy.y - hy) < 1;
  out.hurtOnHold = foe.hp < 99999;
  // a unit inside a transport does not walk out of it
  out.firesOnMoveInsideTransport = (() => { const d = G.spawnUnit('dropship', 0, cy.x, cy.y); cy.inside = d; const r = cy.firesOnMove(foe); cy.inside = null; G.kill(d, null, true); return r; })();
  // and the helper says no when the weapon it would use has no flag: a Cyclone has one gun, so ask a
  // Goliath, whose AIR weapon is a different entry from its ground one
  const gl = G.spawnUnit('goliath', 0, x0 * T, (y + 2) * T);
  out.goliathNever = gl.firesOnMove(foe);
  return out;
})()`);
ok(still.heldStill && still.hurtOnHold, 'a Cyclone on HOLD POSITION still holds, and still shoots', JSON.stringify(still));
ok(still.firesOnMoveInsideTransport === false, 'a Cyclone inside a transport does not count as firing on the move');
ok(still.goliathNever === false, 'and the helper is false for a weapon without the flag');

// =============================================================================
// 4. determinism -- it is an order-loop change, so the replay has to agree
// =============================================================================
const det = J(`(() => {
  const play = () => {
    G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'normal', name: 'B', team: 2 }], seed: 11, layout: 'temple' });
    for (let f = 0; f < 24 * 60 * 8; f++) G.tick();
    return G.stateHash();
  };
  return { a: play(), b: play() };
})()`);
ok(det.a === det.b, 'an eight-minute game re-runs bit-identically', det.a + ' vs ' + det.b);
{ const src = fs.readFileSync(path.join(root, 'js', 'sim.js'), 'utf8');
  // Comments may name it -- one does, explaining the flag. What must not exist is a BRANCH on it: the
  // item asked for a flag on the weapon rather than a Cyclone special case in the combat loop.
  // REVIEW-M17: the third alternative had lost its backslashes (HANDOFF-M13 trap 6, landed in a test)
  // and matched almost nothing; `u.def.id === "cyclone"` slipped past it.
  ok(!/\.id\s*===?\s*['"]cyclone['"]/.test(src),
    'js/sim.js branches on no unit id for this -- the flag is the whole mechanism'); }

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
