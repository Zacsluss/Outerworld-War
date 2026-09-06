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
              armyIdleWhileBaseHit: 0, attackIntoDefence: 0, unusedEnergy: 0, samples: 0 };
  for (let f = 0; f < ${FRAMES} && !G.over; f++) {
    G.tick();
    if (f % 24 !== 0) continue;                       // sample once a second
    S.samples++;
    for (const p of G.players) {
      if (p.defeated) continue;
      // production buildings standing empty while the money to fill them is in the bank
      let idle = 0, cheapest = 1e9;
      for (const u of G.units) {
        if (!u.alive || u.owner !== p.id || !u.isBuilding || !u.done || u.lifted) continue;
        if (!u.def.produces.length && !u.def.spawnsLarva) continue;
        if (u.def.spawnsLarva) { if (u.larvae && u.larvae.length && p.minerals >= 50) idle++; continue; }
        if (!u.prod.length) { for (const id of u.def.produces) { const d = DATA.units[id]; if (d && p.hasReq(d) && d.min < cheapest) cheapest = d.min; } if (p.minerals >= 50) idle++; }
      }
      if (p.minerals >= cheapest && idle) S.idleProd += idle;
      // workers doing nothing at all
      for (const u of G.units) if (u.alive && u.owner === p.id && u.def.worker && u.order.type === 'idle' && !u.inside) S.idleWorkers++;
      // money piling up unspent
      if (p.minerals > 700) S.floatMin++;
      if (p.gas > 700) S.floatGas++;
      if (p.supUsed >= p.supMax && p.supMax < 200) S.supplyBlocked++;
      // spellcasters sitting on a full energy bar
      for (const u of G.units) if (u.alive && u.owner === p.id && u.maxEnergy && u.energy >= u.maxEnergy - 1 && !u.isBuilding) S.unusedEnergy++;
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

const totals = {};
for (const mu of MATCHUPS) for (const seed of SEEDS) {
  const c = ctxFor();
  const layout = mu === 'TZ' ? 'temple' : mu === 'TP' ? 'valley' : 'bloodbath';
  vm.runInContext(`G.init({ players: [{ race: '${mu[0]}', human: false, difficulty: 'normal', name: 'A' }, { race: '${mu[1]}', human: false, difficulty: 'normal', name: 'B' }], seed: ${seed}, layout: '${layout}' });` + AUDIT, c);
  const S = c.stats;
  for (const k of Object.keys(S)) totals[k] = (totals[k] || 0) + S[k];
  if (c.errors.length) console.log('  errors in ' + mu + ' seed ' + seed + ': ' + c.errors[0]);
}

const mins = totals.minutes, samples = totals.samples;
const per = (n) => (n / mins).toFixed(1);
const pctOfTime = (n) => (100 * n / samples).toFixed(0) + '%';
console.log('AI audit over ' + (MATCHUPS.length * SEEDS.length) + ' games, ' + mins.toFixed(0) + ' game-minutes\n');
console.log('  idle production buildings (per minute, summed over both players) ' + per(totals.idleProd));
console.log('  idle workers (per minute)                                       ' + per(totals.idleWorkers));
console.log('  spellcasters at full energy (per minute)                        ' + per(totals.unusedEnergy));
console.log('  army idle while its own base is being hit (per minute)          ' + per(totals.armyIdleWhileBaseHit));
console.log('  share of time over 700 minerals unspent                         ' + pctOfTime(totals.floatMin));
console.log('  share of time over 700 gas unspent                              ' + pctOfTime(totals.floatGas));
console.log('  share of time supply blocked                                    ' + pctOfTime(totals.supplyBlocked));
console.log('  share of time attacking into 2+ static defences                 ' + pctOfTime(totals.attackIntoDefence));
