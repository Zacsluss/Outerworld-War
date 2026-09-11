// FIXLIST-M14 D1 (item 6) -- what a wave walks at.
//
// Reported as "if they attack, they should push until they believe they will lose, then retreat".
// The retreat half already existed and carries measured numbers; the targeting half was the fault.
//
// MEASURED FIRST, forty waves over nine games (three seeds, three races, twenty minutes each), before
// any edit:
//
//     first target was THE ENEMY MAIN        0 of 40   (0%)
//     first target was a town hall          36 of 40   (90%)  -- always an EXPANSION hall
//     re-targeted mid-wave at least once     7 of 40   (18%)
//     ever reached within 8 tiles of the main 2 of 40  (5%)
//
// The report is right. The fixlist's guess at WHY was half right: it said the army never commits to a
// base, and 82% of waves never re-target at all -- so commitment was never the fault. The waves that
// DO re-target are the ones that are winning. Target selection was the whole of it, and it was one
// expression: `distance - (depot ? 8 tiles : 0) + defenders * 10 tiles`. An expansion sits BETWEEN the
// two armies, so it wins on distance by about thirty tiles, and the main is the better defended, so it
// loses another ten per defender on top. Nothing could make that up.
//
// This file pins the SCORING, because that is what changed and it is cheap to check exactly. The
// whole-game effect is a measurement rather than a check and lives in the commit message: waves
// reaching within eight tiles of the main went from 5% to 20%.
//
//   node test/wavetarget.js
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
// 1. the weights are named, and the retreat numbers are untouched
// =============================================================================
// Every lookup below is guarded. A negative control for this file deletes these constants outright,
// and an unguarded read would throw on the FIRST line and hide the other twenty results -- which is
// exactly what happened the first time this control was run.
const g = n => J('typeof ' + n + " === 'undefined' ? null : " + n);
const W = { HALL_PULL: g('HALL_PULL'), ANCHOR_PULL: g('ANCHOR_PULL'), ANCHOR_CAP: g('ANCHOR_CAP'),
  GUARD_COST: g('GUARD_COST'), BASE_PULL: g('BASE_PULL'), BASE_R: g('BASE_R') };
const ANCHOR_CAP_N = W.ANCHOR_CAP;
ok(W.HALL_PULL === 8, 'HALL_PULL is unchanged at 8 tiles -- the old depot bonus, kept', String(W.HALL_PULL));
ok(W.ANCHOR_PULL > 0 && W.ANCHOR_CAP > 0, 'a hall is pulled toward by the production standing around it', JSON.stringify([W.ANCHOR_PULL, W.ANCHOR_CAP]));
ok(W.GUARD_COST > 0 && W.GUARD_COST < 10, 'a guarded target COSTS something rather than being excluded, at ' + W.GUARD_COST + ' tiles per defender -- it was 10, which is a veto', String(W.GUARD_COST));
ok(W.BASE_PULL > 0 && W.BASE_R > 0, 'and finishing the base you are standing in is worth something', JSON.stringify([W.BASE_PULL, W.BASE_R]));
// The item says explicitly not to retune the retreat rule in the same change.
{ const src = fs.readFileSync(path.join(root, 'js', 'ai.js'), 'utf8');
  ok(/waveSup < this\.waveSup0 \* 0\.8/.test(src), 'THE RETREAT RULE IS UNTOUCHED: `gutted` still fires at 0.8, the measured number');
  ok(/waveSup < local \* 0\.7/.test(src), '...and `outgunned` still at 0.7'); }

// =============================================================================
// A hand-built scene, shared by everything below: an empty map, a wave position, and a helper that
// drops a finished enemy building on a named tile. Hand-built rather than played out so the geometry
// is exact and a failure names a distance rather than a game.
const SCENE = `
  G.init({ players: [{ race: 'T', human: false, difficulty: 'hard', name: 'A', team: 1 },
                     { race: 'T', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: 3, layout: 'temple' });
  for (const u of [...G.units]) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive);
  G.checkVictory = () => { };
  const T = TILE, m = G.map, ai = G.players[0].ai;
  const put = (id, tx, ty, owner) => { const b = G.placeBuilding(DATA.buildings[id], tx, ty, owner); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
  // the AI only scores what it has SEEN, so reveal the map for player 0
  const reveal = () => { G.players[0].vis.fill(2); G.updateVision(); G.rebuildGrid(); G.players[0].vis.fill(2); };
  const from = { x: 20 * T, y: 60 * T };
`;

// =============================================================================
// 2. THE SCORING: what a main is worth, and what it is NOT worth
// =============================================================================
// Built by hand so the geometry is exact. The pull a hall gets from the production around it is
// capped at ANCHOR_CAP * ANCHOR_PULL = 36 tiles, deliberately, so that one enormous base cannot drag
// the army across the whole map. So the claim under test is bounded and both halves are checked: a
// full main outweighs a bare expansion that is nearer BY LESS THAN THAT, and loses to one that is
// nearer by more. Before the change it lost both, at every distance.
const anchoredMain = gap => `(() => { ${SCENE}
  // near, bare: a hall on its own
  const expo = put('command_center', 40, 60, 1);
  // far, anchored: a hall with a full tech tree round it, saturating ANCHOR_CAP
  const main = put('command_center', ${gap}, 60, 1);
  const ring = [['barracks', 6, 0], ['factory', 6, 4], ['starport', -6, 0], ['armory', -6, 4], ['engineering_bay', 0, 5], ['academy', 0, -5]];
  const built = ring.map(([id, dx, dy]) => put(id, ${gap} + dx, 60 + dy, 1)).filter(Boolean);
  reveal();
  const pick = ai.pickTarget(from);
  return { picked: pick ? (pick === main ? 'MAIN' : pick === expo ? 'expansion' : pick.def.id) : null,
    ring: built.length, halls: !!(expo && main),
    expoDist: Math.round(Math.hypot(expo.x - from.x, expo.y - from.y) / T),
    mainDist: Math.round(Math.hypot(main.x - from.x, main.y - from.y) / T) };
})()`;

const score = J(anchoredMain(65));
// (the scenarios below call ai.pickTarget directly; it exists in every version, so they cannot throw
//  on a missing symbol the way the constant reads above could.)
// ANTI-VACUITY: if the scene did not actually build, every check below is meaningless.
ok(score.halls && score.ring >= ANCHOR_CAP_N, 'the scene built: two halls and a tech tree big enough to saturate the cap', JSON.stringify(score));
ok(score.mainDist - score.expoDist > 20, 'and the anchored main really is much further away than the bare expansion',
  score.mainDist + ' vs ' + score.expoDist + ' tiles');
ok(score.picked === 'MAIN',
  'AND IT IS PICKED ANYWAY -- production standing around a hall is what makes it worth crossing the map for', JSON.stringify(score));

// The ceiling, checked rather than described: push the same main past the 36-tile anchor budget and
// the near expansion wins again. This is the cap doing its job, not a regression.
const tooFar = J(anchoredMain(90));
ok(tooFar.picked === 'expansion',
  'THE PULL IS CAPPED: past ~36 tiles of extra walking the same main loses again, so no one base owns the army', JSON.stringify(tooFar));

// The control that keeps all of it honest: strip the production and the near hall wins at any range.
const bare = J(`(() => { ${SCENE}
  const expo = put('command_center', 40, 60, 1);
  const main = put('command_center', 65, 60, 1);
  reveal();
  const pick = ai.pickTarget(from);
  return { picked: pick === main ? 'MAIN' : pick === expo ? 'expansion' : (pick ? pick.def.id : null) };
})()`);
ok(bare.picked === 'expansion', 'CONTROL: two BARE halls at those same spots and the nearer one wins -- the tech tree is the whole reason', JSON.stringify(bare));

// 3. a guarded target costs something, and is not excluded
// =============================================================================
const guard = J(`(() => { ${SCENE}
  // two anchored halls, equidistant; one has three turrets round it
  const soft = put('command_center', 60, 40, 1);
  for (const [id, dx, dy] of [['barracks', 6, 0], ['factory', 6, 4]]) put(id, 60 + dx, 40 + dy, 1);
  const hard = put('command_center', 60, 80, 1);
  for (const [id, dx, dy] of [['barracks', 6, 0], ['factory', 6, 4]]) put(id, 60 + dx, 80 + dy, 1);
  for (let k = 0; k < 3; k++) put('missile_turret', 58 + k * 2, 84, 1);
  reveal();
  const near = { x: 60 * T, y: 60 * T };            // exactly between them
  const pick = ai.pickTarget(near);
  const out = { prefersSoft: pick === soft };
  // ...and with the guards removed the same call is a coin-flip on id order, so the guards ARE the reason
  for (const u of G.units.filter(u => u.alive && u.def.id === 'missile_turret')) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive); reveal();
  const pick2 = ai.pickTarget(near);
  out.withoutGuards = pick2 === soft ? 'soft' : pick2 === hard ? 'hard' : 'other';
  return out;
})()`);
ok(guard.prefersSoft, 'between two equal bases the AI takes the one WITHOUT static defence');
ok(guard.withoutGuards === 'soft' || guard.withoutGuards === 'hard', '...and with the turrets gone the choice is no longer about them', guard.withoutGuards);

// A guarded HALL still beats an unguarded outbuilding: costing is not excluding.
const notExcluded = J(`(() => { ${SCENE}
  const hall = put('command_center', 45, 60, 1);
  for (const [id, dx, dy] of [['barracks', 6, 0], ['factory', 6, 4], ['starport', -6, 0]]) put(id, 45 + dx, 60 + dy, 1);
  for (let k = 0; k < 3; k++) put('missile_turret', 43 + k * 2, 64, 1);
  const shed = put('supply_depot', 30, 60, 1);       // nearer, and completely undefended
  reveal();
  const pick = ai.pickTarget(from);
  return { picked: pick === hall ? 'guarded hall' : pick === shed ? 'undefended shed' : (pick ? pick.def.id : null) };
})()`);
ok(notExcluded.picked === 'guarded hall',
  'A GUARDED BASE IS STILL WORTH TAKING over a nearer undefended shed -- ten tiles a defender was a veto, four is a price', JSON.stringify(notExcluded));

// =============================================================================
// 4. finish the base you are standing in
// =============================================================================
// The first version of this check was wrong in a way worth recording: it put both candidates inside
// BASE_R of the anchor, so BOTH collected BASE_PULL and it cancelled. The pull is not "prefer this
// building", it is "prefer WHERE YOU JUST FOUGHT" -- so the honest test moves the anchor, not the
// buildings. Two bases, and the nearer one is deliberately the better pick on distance alone.
const twoBases = anchor => `(() => { ${SCENE}
  const far  = put('command_center', 30, 60, 1);
  for (const [id, dx, dy] of [['barracks', 4, 0], ['factory', 4, 4]]) put(id, 30 + dx, 60 + dy, 1);
  const near_ = put('command_center', 75, 60, 1);
  for (const [id, dx, dy] of [['barracks', 4, 0], ['factory', 4, 4]]) put(id, 75 + dx, 60 + dy, 1);
  reveal();
  const head = { x: 60 * T, y: 60 * T };          // the wave, between the two bases
  const pick = ai.pickTarget(head, ${anchor});
  return { picked: pick === far ? 'far' : pick === near_ ? 'near' : (pick ? pick.def.id : null),
    built: !!(far && near_),
    farD: Math.round(Math.hypot(far.x - head.x, far.y - head.y) / T),
    nearD: Math.round(Math.hypot(near_.x - head.x, near_.y - head.y) / T) };
})()`;

const noAnchor = J(twoBases('null'));
ok(noAnchor.built && noAnchor.farD - noAnchor.nearD >= 8, 'the scene built, and one base is a good deal nearer than the other', JSON.stringify(noAnchor));
ok(noAnchor.picked === 'near', 'CONTROL: with no anchor the wave takes the nearer base, as it always did', JSON.stringify(noAnchor));

// Now say the wave has just razed something at the FAR base. It should stay and finish it.
const anchored = J(twoBases('{ x: 32 * T, y: 60 * T }'));
ok(anchored.picked === 'far',
  'HAVING JUST FOUGHT AT THE FAR BASE, the wave finishes it instead of walking to the nearer one', JSON.stringify(anchored));

// ...and the pull follows the anchor rather than favouring one base: put it at the near base and the
// answer goes back. A pull that pointed at a fixed place would fail this.
const anchoredOther = J(twoBases('{ x: 77 * T, y: 60 * T }'));
ok(anchoredOther.picked === 'near', 'and moving the anchor to the other base moves the choice with it', JSON.stringify(anchoredOther));

// =============================================================================
// 5. determinism
// =============================================================================
const det = J(`(() => {
  const play = () => { G.init({ players: [{ race: 'T', human: false, difficulty: 'hard', name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: 5, layout: 'temple' }); G.checkVictory = () => { }; for (let f = 0; f < 24 * 60 * 12; f++) G.tick(); return G.stateHash(); };
  return { a: play(), b: play() };
})()`);
ok(det.a === det.b, 'a twelve-minute game re-runs bit-identically', det.a + ' vs ' + det.b);
{ const src = fs.readFileSync(path.join(root, 'js', 'ai.js'), 'utf8');
  const fn = src.slice(src.indexOf('pickTarget(from, near) {'), src.indexOf('  // micro() does not run every frame'));
  ok(!/Math\.random|Date\.now|performance\./.test(fn), 'and pickTarget uses no randomness and no clock'); }

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
