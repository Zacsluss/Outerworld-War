// AI audit: watch AI-vs-AI games and count the things a human player would never do.
//   node test/aiaudit.js [frames=24000] [seeds=1,2,3]
// This is the measurable half of a play-test. It does not pass or fail; it prints rates per game
// minute so a change can be judged against the previous run. Everything counted here is something
// you would notice immediately watching a replay.
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const FRAMES = parseInt(process.argv[2] || '24000');
const SEEDS = (process.argv[3] || '1,2,3').split(',').map(Number);
const MATCHUPS = ['TZ', 'TP', 'ZP'];

function ctxFor() {
  const errors = [];
  const c = { console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0])) }, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { } }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
  c.window = c; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  c.errors = errors; return c;
}

const AUDIT = `
  const S = { minutes: 0, idleProd: 0, idleWorkers: 0, floatMin: 0, floatGas: 0, supplyBlocked: 0,
              armyIdleWhileBaseHit: 0, attackIntoDefence: 0, idleAfford: 0, unusedEnergy: 0, casters: 0, samples: 0, by: {}, idleWhy: {} };
  for (let f = 0; f < ${FRAMES} && !G.over; f++) {
    G.tick();
    if (f % 24 !== 0) continue;                       // sample once a second
    S.samples++;
    for (const p of G.players) {
      if (p.defeated) continue;
      // production buildings standing empty while the money to fill them is in the bank
      let idle = 0, cheapest = 1e9; const idleB = [];
      for (const u of G.units) {
        if (!u.alive || u.owner !== p.id || !u.isBuilding || !u.done || u.lifted) continue;
        if (!u.def.produces.length && !u.def.spawnsLarva) continue;
        if (u.def.spawnsLarva) { if (u.larvae && u.larvae.length && p.minerals >= 50) { idle++; idleB.push(u); } continue; }
        if (!u.prod.length) { for (const id of u.def.produces) { const d = DATA.units[id]; if (d && p.hasReq(d) && d.min < cheapest) cheapest = d.min; } if (p.minerals >= 50) { idle++; idleB.push(u); } }
      }
      // ...and why, because the raw count has been "improving without being solved" for three
      // milestones and cannot say which part of it is a defect. A human does stop making units to
      // afford an expansion; a human does not leave a stargate idle because a gateway is saving for a
      // dragoon. The question has to be asked of each idle building on its own -- an idle starport with
      // 400 minerals and no gas is "cannot afford", even though a marine was affordable somewhere else.
      if (p.minerals >= cheapest && idle) {
        S.idleProd += idle;
        // The count above is idle capacity, not lost production: ten empty barracks and sixty minerals
        // is ten, though nine of them could not have been filled whatever the AI did. This is the part
        // the money was actually there for, and it is the number a change should be judged on.
        S.idleAfford += Math.min(idle, Math.floor(p.minerals / cheapest));
        const a = p.ai, held = a && a.topDef ? a.topDef.id : null;   // the composition hold became a committed budget claim in M13
        for (const u of idleB) {
          let why = 'no ai';
          if (a) {
            // what this building could put in its own queue, army units only: workers and supply are
            // economy()'s and supply()'s business, not production()'s
            const makes = (u.def.spawnsLarva ? DATA.larvaMorphs : u.def.produces).map(id => DATA.units[id]).filter(d => d && !d.worker && !d.supGive);
            const unlocked = makes.filter(d => p.hasReq(d));
            const room = unlocked.filter(d => !(d.sup && p.supUsed + d.sup * (d.pair ? 2 : 1) > p.supMax));
            const rich = room.filter(d => p.minerals >= d.min && p.gas >= d.gas);
            why = !makes.length ? 'only makes workers, and the AI has enough'   // a saturated town hall: economy()'s business, and not a defect
              : held && makes.some(d => d.id === held) ? 'composition hold'
              : !unlocked.length ? 'nothing this building makes is unlocked'
              : !room.length ? 'supply blocked'
              : !rich.length ? 'cannot afford anything this building makes'
              : !rich.some(d => a.afford(d.min, d.gas)) ? 'saving for a building'
              : 'unexplained';                            // money, supply and requirements were all there
          }
          S.idleWhy[why] = (S.idleWhy[why] || 0) + 1;
        }
      }
      // workers doing nothing at all
      for (const u of G.units) if (u.alive && u.owner === p.id && u.def.worker && u.order.type === 'idle' && !u.inside) S.idleWorkers++;
      // money piling up unspent
      if (p.minerals > 700) S.floatMin++;
      if (p.gas > 700) S.floatGas++;
      if (p.supUsed >= p.supMax && p.supMax < 200) S.supplyBlocked++;
      // spellcasters sitting on a full energy bar
      // count casters too, so "full energy" can be read as a share rather than a raw rate: more casters
      // alive is not the same thing as casters being wasted
      for (const u of G.units) { if (!u.alive || u.owner !== p.id || !u.maxEnergy) continue;
        // broken down by unit as well as totalled: "casters idle 23% of the time" is not actionable,
        // "medics are three quarters of it because heal never walks to anyone" is
        const b = S.by[u.def.id] = S.by[u.def.id] || { n: 0, full: 0, e: 0 };
        b.n++; b.e += u.energy; if (u.energy >= u.maxEnergy - 1) b.full++;
        if (u.isBuilding) continue; S.casters++; if (u.energy >= u.maxEnergy - 1) S.unusedEnergy++; }
      // our base is being hit and the army is standing somewhere else doing nothing
      const hit = G.units.find(u => u.alive && u.owner === p.id && u.isBuilding && G.frame - u.lastHit < 48);
      if (hit) {
        for (const u of G.units) {
          if (!u.alive || u.owner !== p.id || u.isBuilding || u.def.worker || !u.hasWeapon()) continue;
          if (u.order.type === 'idle' && distPt(u.x, u.y, hit.x, hit.y) > 20 * TILE) S.armyIdleWhileBaseHit++;
        }
      }
      // attacking a target ringed by static defence when something softer is in reach
      if (p.ai && p.ai.state === 'attack' && p.ai.target && p.ai.target.alive) {
        const t = p.ai.target;
        const guards = G.units.filter(d => d.alive && (d.def.gw || d.def.aw) && d.isBuilding && !G.allied(d.owner, p.id) && distPt(d.x, d.y, t.x, t.y) < 8 * TILE).length;
        if (guards >= 2) S.attackIntoDefence++;
      }
    }
  }
  S.minutes = G.frame / 24 / 60;
  this.stats = S; this.over = G.over; this.frames = G.frame;
`;

const totals = {}, byUnit = {}, idleWhy = {};
for (const mu of MATCHUPS) for (const seed of SEEDS) {
  const c = ctxFor();
  const layout = mu === 'TZ' ? 'temple' : mu === 'TP' ? 'valley' : 'bloodbath';
  vm.runInContext(`G.init({ players: [{ race: '${mu[0]}', human: false, difficulty: 'normal', name: 'A' }, { race: '${mu[1]}', human: false, difficulty: 'normal', name: 'B' }], seed: ${seed}, layout: '${layout}' });` + AUDIT, c);
  const S = c.stats;
  for (const k of Object.keys(S)) { if (k === 'by' || k === 'idleWhy') continue; totals[k] = (totals[k] || 0) + S[k]; }
  for (const [k, v] of Object.entries(S.idleWhy)) idleWhy[k] = (idleWhy[k] || 0) + v;
  for (const [k, v] of Object.entries(S.by)) { const b = byUnit[k] = byUnit[k] || { n: 0, full: 0, e: 0 }; b.n += v.n; b.full += v.full; b.e += v.e; }
  if (c.errors.length) console.log('  errors in ' + mu + ' seed ' + seed + ': ' + c.errors[0]);
}

const mins = totals.minutes, samples = totals.samples;
const per = (n) => (n / mins).toFixed(1);
const pctOfTime = (n) => (100 * n / samples).toFixed(0) + '%';
console.log('AI audit over ' + (MATCHUPS.length * SEEDS.length) + ' games, ' + mins.toFixed(0) + ' game-minutes\n');
console.log('  idle production buildings (per minute, summed over both players) ' + per(totals.idleProd));
for (const [k, v] of Object.entries(idleWhy).sort((a, b) => b[1] - a[1])) console.log('      ' + (100 * v / totals.idleProd).toFixed(0).padStart(3) + '% ' + k);
console.log('  ...of which the money was there to fill (per minute)             ' + per(totals.idleAfford));
console.log('  idle workers (per minute)                                       ' + per(totals.idleWorkers));
console.log('  spellcasters at full energy (per minute)                        ' + per(totals.unusedEnergy) + '   (' + (totals.casters ? (100 * totals.unusedEnergy / totals.casters).toFixed(0) : '0') + '% of caster-seconds, ' + per(totals.casters) + ' casters/min)');
console.log('  army idle while its own base is being hit (per minute)          ' + per(totals.armyIdleWhileBaseHit));
console.log('  share of time over 700 minerals unspent                         ' + pctOfTime(totals.floatMin));
console.log('  share of time over 700 gas unspent                              ' + pctOfTime(totals.floatGas));
console.log('  share of time supply blocked                                    ' + pctOfTime(totals.supplyBlocked));
console.log('  share of time attacking into 2+ static defences                 ' + pctOfTime(totals.attackIntoDefence));
const rows = Object.entries(byUnit).sort((a, b) => b[1].full - a[1].full).filter(r => r[1].n >= 30);
if (rows.length) {
  const waste = rows.reduce((s, r) => s + r[1].full, 0);
  console.log('\n  where the unspent energy is (caster-seconds, buildings included):');
  for (const [k, v] of rows) console.log('    ' + k.padEnd(18) + String(v.n).padStart(7) + 's' + (100 * v.full / v.n).toFixed(0).padStart(5) + '% full' + (waste ? (100 * v.full / waste).toFixed(0).padStart(6) + '% of the waste' : '') + '   avg ' + (v.e / v.n).toFixed(0) + ' energy');
}
