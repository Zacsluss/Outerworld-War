// TODO-M18 item 11: the dragoon wobble. A READY-TO-APPLY PATCH, deliberately NOT on the main line.
//
//   node tools/patch.js tools/wobble-fix.js
//
// It is measured and it works, and it is not committed because it turns the gate red -- on a line that has
// been red somewhere in this project for its whole history. That is the user's call, not the session's.
// TODO-M18.md item 11 has the whole table; this is the patch and the reasoning that has to travel with it.
//
// THE CAUSE, MEASURED (tools/wobble-probe.js, tools/wobble-render.js):
//   * ONE dragoon crossing open ground turns back and forth ZERO times. The steering is innocent alone.
//   * EIGHT ordered to one point snapped 37, 58 and 79 degrees in a SINGLE FRAME, against a declared turn
//     rate of 14.32, up to 7.9 times a second. Inside 20 px of the destination the old line snapped the
//     facing straight onto the bearing -- and at that range the bearing is whichever way the neighbour
//     you are arriving beside has just shoved you.
//   * Marines never showed it: 40 degrees a frame covers the shove, so they track instead of chasing.
//
// THE FIX: inside 20 px, hold the facing and strafe toward the goal. The `ang = want` is load-bearing --
// the direction of travel is normally taken FROM the facing, and without it a dragoon told to move six
// pixels walked off the way it happened to point and turned 143 degrees to come back (the pin below
// caught exactly that in the first version).
//
// WHAT IT DID, all measured:
//   worst single-frame turn in the crowd      79.6 deg  ->  14.32 deg (exactly TURN.dragoon)
//   eight dragoons to one point                529 frames ->  379 frames
//   test/eightplayer.js                        19/19 -> 19/19 (the bank line re-deals, as any movement change does)
//   test/aistyles.js --seed=5                  the known economy red -> clean
//   test/aistyles.js --seed=11                 clean -> the known economy red (58 vs 61)
//   test/aistyles.js --seed=1  (THE GATE'S)    clean -> the known economy red (58 vs 60)
// That last line is why this is not committed: the gate runs seed 1. The line is "expander mines with
// more workers than turtle at five minutes", which HANDOFF-M17 records as flapping between seeds through
// every re-deal of the project (57, 59, 58 against 60 or 61). This change re-deals it onto the gate seed.
//
// A SECOND EDIT WAS TRIED AND REJECTED, and the record matters: also exempting the last 20 px from the
// hard-turn slowdown ("a turning cost where nothing is turning"). It kept the gate seed green by luck and
// broke something real -- test/eightplayer.js went 18/19 with "the AI expanded with eight players on the
// map" red, seed 11 grew a red of a shape never seen before, and the crowd move got SLOWER (510 frames
// against 379). The slowdown damps the chase; it stays.
//
// WHAT IS LEFT EVEN WITH THIS: eight dragoons still reverse at their own turn rate while they jostle,
// up to about 7 times a second, because all eight steer at the same destination point. That wants
// per-unit steering memory or formation slots -- bigger than this, and not what was measured here.
module.exports = [
  {
    file: 'js/sim.js',
    search: `      if (Math.abs(diff) <= turn || dd < 20) this.facing = want; else this.facing += Math.sign(diff) * turn;
      this.facing = DMath.atan2(DMath.sin(this.facing), DMath.cos(this.facing)); ang = this.facing;`,
    replace: `      // THE LAST TWENTY PIXELS ARE NOT A BEARING (TODO-M18 item 11, "dragoons wobble very fast after they
      // move"). This used to SNAP the facing onto \`want\` inside 20 px of the destination, and at that range
      // the bearing is whichever way a neighbour has just shoved you. Measured: eight dragoons ordered to
      // one point turned 37, 58 and 79 degrees in a single frame against a turn rate of 14.32; a lone one
      // never did. Hold the facing and strafe the last few pixels instead.
      //
      // \`ang = want\` is load-bearing: the direction of travel is normally taken FROM the facing, so holding
      // the facing without it sends the unit off the way it happens to point (a dragoon told to move six
      // pixels walked out past twenty and turned 143 degrees to come back -- test/movement.js caught it).
      // The hard-turn slowdown below is deliberately left on everywhere: exempting these 20 px was tried
      // and it made crowd moves slower and stopped the AI expanding in test/eightplayer.js.
      if (dd < 20) { ang = want; }
      else {
        if (Math.abs(diff) <= turn) this.facing = want; else this.facing += Math.sign(diff) * turn;
        this.facing = DMath.atan2(DMath.sin(this.facing), DMath.cos(this.facing)); ang = this.facing;
      }`,
  },
  {
    file: 'test/movement.js',
    search: `ok('no JS errors', errors.length === 0, errors[0] || '');`,
    replace: `// ---- the last twenty pixels are not a bearing (TODO-M18 item 11) ----
// Eight dragoons ordered to one point used to turn 37, 58 and 79 degrees in a SINGLE FRAME against a
// declared turn rate of 14.32, because inside 20 px the facing was snapped onto the bearing. No frame may
// turn further than the unit's own TURN entry, and a unit ordered somewhere it is already standing must
// not spin at all.
run(\`(() => {
  const p = G.players[0];
  const norm = a => Math.atan2(Math.sin(a), Math.cos(a));
  const watch = (ids, frames) => {
    const last = ids.map(u => u.facing); let worst = 0, reversals = 0; const prevD = ids.map(() => 0);
    for (let f = 0; f < frames; f++) {
      this.tick(1);
      ids.forEach((u, i) => { const d = norm(u.facing - last[i]); worst = Math.max(worst, Math.abs(d));
        if (d * prevD[i] < -1e-9 && Math.abs(d) > 1e-6) reversals++; if (Math.abs(d) > 1e-6) prevD[i] = d; last[i] = u.facing; });
    }
    return { worstDeg: worst * 180 / Math.PI, reversals };
  };
  const gs = []; for (let i = 0; i < 8; i++) gs.push(this.spawn('dragoon', 0, p.startX + 200 + (i % 4) * 26, p.startY + 200 + Math.floor(i / 4) * 26));
  this.tick(60);
  for (const u of gs) this.order(u, { type: 'move', x: p.startX + 560, y: p.startY + 200 });
  const crowd = watch(gs, 600);
  this.crowdWorstDeg = crowd.worstDeg; this.turnRate = TURN.dragoon * 180 / Math.PI;
  for (const u of gs) G.kill(u, null, true);
  const solo = this.spawn('dragoon', 0, p.startX + 300, p.startY + 320);
  this.tick(60);
  const f0 = solo.facing;
  this.order(solo, { type: 'move', x: solo.x + 6, y: solo.y + 4 });
  const still = watch([solo], 120);
  this.soloWorstDeg = still.worstDeg; this.soloReversals = still.reversals;
  this.soloTurnedDeg = Math.abs(norm(solo.facing - f0)) * 180 / Math.PI;
  G.kill(solo, null, true);
})();\`);
ok('a crowd of dragoons never turns further in one frame than its own declared turn rate (it used to snap 37, 58 and 79 degrees, because inside 20 px it faced whichever way it had just been shoved)',
  ctx.crowdWorstDeg <= ctx.turnRate + 1e-6, 'worst ' + ctx.crowdWorstDeg.toFixed(3) + ' deg against TURN.dragoon ' + ctx.turnRate.toFixed(3));
ok('...and one ordered six pixels away does not spin at all: there is no bearing left to steer on',
  ctx.soloWorstDeg === 0 && ctx.soloReversals === 0 && ctx.soloTurnedDeg === 0, JSON.stringify({ worst: ctx.soloWorstDeg, reversals: ctx.soloReversals, turned: ctx.soloTurnedDeg }));

ok('no JS errors', errors.length === 0, errors[0] || '');`,
  },
];
