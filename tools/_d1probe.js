// FIXLIST-M14 D1 probe. "Add a probe recording, per wave: what it targeted, what it killed, whether it
// retreated and why. Every AI fix in M13 that started from a measurement was right the first time;
// every one that started from a hypothesis had to be reverted."
//
// The item's reading of the code: pickTarget scores every seen enemy building by
//     distance - (depot ? 8 tiles : 0) + (nearby defenders * 10 tiles)
// and takes the minimum, so an expansion -- closer AND less defended -- wins essentially always; and
// the target is re-picked the moment it dies, so after razing one expansion the army takes the next
// nearest thing and never commits to a base.
//
// This asks whether that is what actually happens, and how often.
//
// THE FIRST LINE OF OUTPUT IS THE DIVERGENCE CHECK, on test/ledger.js's precedent: the same seed run
// twice, instrumented and clean, state hashes compared. If it ever says DIVERGED the probe is changing
// the thing it measures and every number under it describes a different game.
// Scratch; delete after reading.
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const MINUTES = Number(process.argv[2] || 20);
const SEEDS = (process.argv[3] || '1,5,11').split(',').map(Number);
const MODE = process.argv[4] || 'vs';

function mk() {
  const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
    localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
    document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] } };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
  return ctx;
}

// The instrumented run. Everything here READS -- the only writes are to the log array.
const RUN = (seed, race, instrument) => `(() => {
  G.init({ players: [{ race: '${race}', human: false, difficulty: 'hard', name: 'A', team: 1 },
                     { race: 'Z', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: ${seed}, layout: 'temple' });
  G.recording = false;
  G.checkVictory = () => { };            // the game may not end; wave behaviour is what is measured
  const log = [];
  ${instrument ? `
  const me = G.players[0];
  const ai = me.ai;
  const halls = () => G.units.filter(u => u.alive && u.owner === 1 && u.isBuilding && u.def.depot);
  // The enemy's MAIN is the hall that existed at frame 0, captured before anything expands. Taking
  // 'the last hall in G.units' was wrong -- G.units is spawn order, so that is the NEWEST expansion.
  const mainId = (() => { const h = halls(); return h.length ? h[0].id : -1; })();
  const mainOf = () => G.units.find(u => u.id === mainId && u.alive) || halls()[0] || null;
  let wave = -1, entry = null, lastState = ai.state;
  const kills0 = () => me.stats.buildingsKilled;
  const snapshotTargets = () => entry ? entry.targets.length : 0;
  // OBSERVE, DO NOT WRAP. The first version replaced ai.pickTarget with a logging wrapper and the
  // divergence check caught it: instrumented and clean hashed differently on seed 1. Whatever the
  // mechanism, a probe that has to be trusted cannot be the thing under suspicion -- so this reads
  // ai.target once a frame and records when it changes. Pure observation, no method replaced.
  let lastTarget = null;
  const noteTarget = () => {
    const t = ai.target;
    if (!entry || !t || !t.def || t === lastTarget) { lastTarget = t; return; }
    lastTarget = t;
    const h = mainOf();
    entry.targets.push({ f: G.frame, id: t.def.id, depot: !!t.def.depot, owner: t.owner, isMain: t.id === mainId,
      fromMain: h ? Math.round(Math.hypot(t.x - h.x, t.y - h.y) / TILE) : -1 });
  };
  const startMain = mainOf();
  ` : ''}
  for (let f = 0; f < ${MINUTES} * 60 * 24; f++) {
    G.tick();
    ${instrument ? `
    if (ai.waves !== wave) {
      if (entry) { entry.endF = G.frame; entry.killedEnd = kills0(); log.push(entry); }
      wave = ai.waves;
      lastTarget = null;
      entry = { wave, startF: G.frame, killed0: kills0(), targets: [], retreat: null,
        sup0: Math.round(ai.waveSup0 || 0) };
    }
    if (entry && lastState === 'attack' && ai.state !== 'attack') {
      // it left the attack: retreat, or ran out of targets
      entry.retreat = entry.retreat || { f: G.frame, after: G.frame - (ai.startedAttack || 0) };
    }
    lastState = ai.state;
    noteTarget();
    ` : ''}
  }
  ${instrument ? `
  if (entry) { entry.endF = G.frame; entry.killedEnd = kills0(); log.push(entry); }
  const enemyHalls = halls().length;
  return { hash: G.stateHash(), log, enemyHalls, myBuildings: G.units.filter(u => u.alive && u.owner === 0 && u.isBuilding).length,
    killedB: me.stats.buildingsKilled, lostB: me.stats.buildingsLost, waves: ai.waves };
  ` : 'return { hash: G.stateHash() };'}
})()`;

console.log('D1 WAVE PROBE -- ' + MINUTES + ' min, seeds ' + SEEDS.join(',') + ', ' + MODE);
{
  const a = JSON.parse(vm.runInContext('JSON.stringify(' + RUN(SEEDS[0], 'T', false) + ')', mk()));
  const b = JSON.parse(vm.runInContext('JSON.stringify(' + RUN(SEEDS[0], 'T', true) + ')', mk()));
  console.log('instrumented vs clean on seed ' + SEEDS[0] + ': ' + (a.hash === b.hash ? 'IDENTICAL' : 'DIVERGED  ' + a.hash + ' vs ' + b.hash));
  if (a.hash !== b.hash) { console.log('STOP: the probe is changing the game it measures.'); process.exit(1); }
}

let totalWaves = 0, depotFirst = 0, expoFirst = 0, retargeted = 0, finishedABase = 0, retreats = 0, mainFirst = 0;
for (const seed of SEEDS) for (const race of ['T', 'Z', 'P']) {
  const r = JSON.parse(vm.runInContext('JSON.stringify(' + RUN(seed, race, true) + ')', mk()));
  console.log('\n--- seed ' + seed + '  ' + race + '  ' + r.waves + ' waves, killed ' + r.killedB + ' buildings, lost ' + r.lostB + ', enemy halls still up: ' + r.enemyHalls);
  for (const w of r.log) {
    if (!w.targets.length) continue;
    totalWaves++;
    const first = w.targets[0];
    if (first.depot) depotFirst++; else expoFirst++;
    if (first.isMain) mainFirst++;
    const distinct = [];
    for (const t of w.targets) { const k = t.id + '@' + t.fromMain; if (!distinct.length || distinct[distinct.length - 1] !== k) distinct.push(k); }
    if (distinct.length > 1) retargeted++;
    if (w.retreat) retreats++;
    const killed = (w.killedEnd || 0) - (w.killed0 || 0);
    if (killed >= 3) finishedABase++;
    console.log('   wave ' + String(w.wave).padStart(2) + '  ' + (w.startF / 24 / 60).toFixed(1) + '-' + (w.endF / 24 / 60).toFixed(1) + ' min' +
      '  sup ' + String(w.sup0).padStart(3) +
      '  razed ' + String(killed).padStart(2) +
      '  retreat ' + (w.retreat ? 'yes' : ' no') +
      '  retargets ' + String(distinct.length - 1).padStart(2) +
      (first.isMain ? '  MAIN' : '  expo') +
      '   ' + distinct.slice(0, 6).join(' -> '));
  }
}
console.log('\n================ SUMMARY ================');
console.log('waves that picked a target:                 ' + totalWaves);
console.log('  first target was a TOWN HALL:             ' + depotFirst + '  (' + Math.round(100 * depotFirst / Math.max(1, totalWaves)) + '%)');
console.log('  first target was something else:          ' + expoFirst + '  (' + Math.round(100 * expoFirst / Math.max(1, totalWaves)) + '%)');
console.log('  first target was THE ENEMY MAIN:          ' + mainFirst + '  (' + Math.round(100 * mainFirst / Math.max(1, totalWaves)) + '%)');
console.log('  RE-TARGETED mid-wave at least once:       ' + retargeted + '  (' + Math.round(100 * retargeted / Math.max(1, totalWaves)) + '%)');
console.log('  razed three or more buildings:            ' + finishedABase + '  (' + Math.round(100 * finishedABase / Math.max(1, totalWaves)) + '%)');
console.log('  retreated:                                ' + retreats + '  (' + Math.round(100 * retreats / Math.max(1, totalWaves)) + '%)');
