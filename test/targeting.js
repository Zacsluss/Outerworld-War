// Target selection (M11 wave three, idea 5). Scoring purely by distance makes a unit walk past the thing
// killing it to shoot whatever is a few pixels nearer. These checks pin the two things that were added:
// threat is preferred over proximity, and a weapon prefers a target it is actually good against.
//   node test/targeting.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, addEventListener() { }, setTimeout,
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };
const r = vm.runInContext(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 4 });
  // Near the player's own base and with vision refreshed: G.targetable refuses anything the owner
  // cannot see, so units spawned out in the fog are not valid targets and every check returns null.
  const p0 = G.players[0]; const out = {}, X = p0.startX + 160, Y = p0.startY + 160;
  const clear = () => { for (const u of G.units.slice()) if (u.owner === 1 || (u.owner === 0 && !u.isBuilding)) G.kill(u, null, true); };

  // 1. a shooter picks the enemy aiming at it over a slightly closer one that is not
  clear();
  const me = G.spawnUnit('marine', 0, X, Y);
  const near = G.spawnUnit('zergling', 1, X + 70, Y);        // closer
  const shooter = G.spawnUnit('zergling', 1, X + 110, Y);    // further, but attacking me
  // Set directly rather than through setOrder: applyOrder validates an attack order against what the
  // ATTACKER can see, and refuses it here, leaving the unit idle. This check is about how findTarget
  // scores, so the order is planted rather than issued.
  shooter.order = { type: 'attack', target: me };
  G.rebuildGrid(); G.updateVision();
  const pick1 = me.findTarget(9 * 32, false);
  out.threatOverProximity = { picked: pick1 === shooter ? 'the one attacking me' : pick1 === near ? 'the nearer one' : 'neither',
    nearDist: Math.round(near.x - me.x), shooterDist: Math.round(shooter.x - me.x) };

  // 2. and the one that has actually hit it, once the order has moved on
  clear();
  const me2 = G.spawnUnit('marine', 0, X, Y);
  const near2 = G.spawnUnit('zergling', 1, X + 70, Y);
  const hitter = G.spawnUnit('zergling', 1, X + 110, Y);
  me2.lastHitBy = hitter; me2.lastHit = G.frame;
  G.rebuildGrid(); G.updateVision();
  const pick2 = me2.findTarget(9 * 32, false);
  out.lastHitByWins = pick2 === hitter;

  // 3. a concussive weapon prefers the small target over the large one at equal distance
  clear();
  const vult = G.spawnUnit('vulture', 0, X, Y);              // concussive
  const small = G.spawnUnit('zergling', 1, X, Y - 90);
  const large = G.spawnUnit('ultralisk', 1, X, Y + 90);
  G.rebuildGrid(); G.updateVision();
  const pick3 = vult.findTarget(9 * 32, false);
  out.prefersEffective = { picked: pick3 ? pick3.def.id : null,
    smallD: Math.round(Math.hypot(small.x - vult.x, small.y - vult.y)),
    largeD: Math.round(Math.hypot(large.x - vult.x, large.y - vult.y)) };

  // 4. nothing here made it target its own side or a larva
  clear();
  const me4 = G.spawnUnit('marine', 0, X, Y);
  const friend = G.spawnUnit('marine', 0, X + 40, Y);
  G.rebuildGrid(); G.updateVision();
  out.noFriendlyFire = me4.findTarget(9 * 32, false) === null;
  return out;
})()`, ctx);
ok(r.threatOverProximity.picked === 'the one attacking me', 'a unit shoots what is shooting at it, not what is nearest', JSON.stringify(r.threatOverProximity));
ok(r.lastHitByWins, 'and what has hit it recently, even after that attacker retargets');
ok(r.prefersEffective.picked === 'zergling', 'a concussive weapon prefers the small target at equal range', JSON.stringify(r.prefersEffective));
ok(r.noFriendlyFire, 'and none of this makes it shoot its own side');
console.log(fail ? `FAIL  ${pass} passed, ${fail} failed` : `ALL PASS  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
