// WHEN DOES THE AI REACH EACH TIER? A measurement, not a check.
//
// The soak (test/soak.js) found that no tier-3 unit is fielded in any of eighteen AI-vs-AI games,
// and that fifteen of those games were decided between ten and twenty minutes. Two explanations fit
// that: the AI cannot reach tier 3, or the games end first. They call for opposite fixes, so this
// file separates them by recording the frame each tech building COMPLETES, in a game that is not
// allowed to end.
//
// Victory is suppressed by silencing G.checkVictory, NOT by putting both players on one team. That
// was the first attempt and it does the exact opposite of what it looks like: one team means
// `teams.size <= 1`, so checkVictory declares the game over on the very first call and G.tick returns
// early forever. It read as "the AI never builds anything in twenty minutes" -- four workers, zero
// minerals, script step 0 -- which is a far more alarming result than the one being investigated, and
// entirely an artefact of the harness.
//
// TWO MODES, because the contested numbers alone cannot be read. Contested, Protoss finished a
// twenty-minute game on four workers and six supply -- it had been destroyed, so its "build order"
// was measuring the outcome of a war. Solo gives the AI an opponent that does nothing, which answers
// the only question a build order can be blamed for: how fast CAN it tech, unmolested.
//
//   node test/techtime.js [minutes=20] [seeds=1,5,11] [solo|vs]
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const MIN = parseFloat(process.argv[2] || '20');
const FRAMES = Math.round(MIN * 60 * 24);
const SEEDS = (process.argv[3] || '1,5,11').split(',').map(Number);
const SOLO = (process.argv[4] || 'solo') === 'solo';

// The gate buildings, by the tier they unlock. Named here rather than derived from DATA.buildings'
// `tier` field because what matters is what a PLAYER would call tier 3 -- the thing that unlocks the
// heavy units -- not how the tech tree happens to be labelled.
const TIERS = {
  T: { 2: ['factory', 'academy', 'machine_shop'], 3: ['starport', 'control_tower', 'armory', 'science_facility'] },
  Z: { 2: ['lair', 'hydralisk_den', 'roach_warren'], 3: ['spire', 'queens_nest', 'hive', 'infestation_pit', 'defiler_mound'] },
  P: { 2: ['cybernetics_core', 'robotics_facility', 'citadel_of_adun'], 3: ['stargate', 'templar_archives', 'robotics_support_bay', 'fleet_beacon', 'arbiter_tribunal'] },
};

const mk = () => {
  const c = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { },
    document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false },
    requestAnimationFrame() { } };
  c.window = c; c.globalThis = c; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f });
  return c;
};

const mmss = f => f < 0 ? '  --  ' : (Math.floor(f / 24 / 60) + ':' + String(Math.floor(f / 24) % 60).padStart(2, '0')).padStart(6);

const runs = {};
for (const seed of SEEDS) {
  for (const race of ['T', 'Z', 'P']) {
    const c = mk();
    const r = JSON.parse(vm.runInContext('JSON.stringify(' + `(() => {
      G.init({ players: [{ race: '${race}', human: false, difficulty: 'hard', name: 'A', team: 1 },
                         { race: '${race}', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: ${seed}, layout: 'temple' });
      G.recording = false;
      G.checkVictory = () => { };   // the game may not end; the build order is what is being measured
      if (${SOLO}) G.players[1].ai = null;   // an opponent that does nothing: this measures the ceiling
      const done = {}, started = {};
      for (let i = 0; i < ${FRAMES}; i++) {
        G.tick();
        if (i % 12) continue;
        for (const u of G.units) {
          if (!u.alive || u.owner !== 0 || !u.isBuilding) continue;
          if (started[u.def.id] === undefined) started[u.def.id] = G.frame;
          if (u.done && done[u.def.id] === undefined) done[u.def.id] = G.frame;
        }
      }
      const p = G.players[0];
      return { done, started, sup: p.supUsed, supMax: p.supMax, idx: p.ai.scriptIdx,
               bank: [Math.round(p.minerals), Math.round(p.gas)],
               workers: G.units.filter(u => u.alive && u.owner === 0 && u.def.worker).length };
    })()` + ')', c));
    (runs[race] = runs[race] || []).push(Object.assign({ seed }, r));
  }
}

console.log('AI tech timings -- ' + MIN + ' min, hard, victory suppressed, ' + (SOLO ? 'UNMOLESTED (opponent does nothing)' : 'contested') + ', seeds ' + SEEDS.join(','));
console.log('='.repeat(94));
for (const race of ['T', 'Z', 'P']) {
  console.log('\n' + { T: 'TERRAN', Z: 'ZERG', P: 'PROTOSS' }[race]);
  for (const tier of ['2', '3']) {
    for (const id of TIERS[race][tier]) {
      const times = runs[race].map(r => r.done[id] === undefined ? -1 : r.done[id]);
      const got = times.filter(t => t >= 0);
      console.log('  t' + tier + '  ' + id.padEnd(24) +
        times.map(mmss).join(' ') +
        '   ' + (got.length ? 'median ' + mmss(got.sort((a, b) => a - b)[Math.floor(got.length / 2)]) : 'NEVER BUILT'));
    }
  }
  const r0 = runs[race][0];
  console.log('  at ' + MIN + ' min: ' + r0.workers + ' workers, ' + r0.sup + '/' + r0.supMax +
    ' supply, script step ' + r0.idx + ', banked ' + r0.bank[0] + 'm/' + r0.bank[1] + 'g');
}
console.log('\nTarget for reference: a human reaches tier 3 in well under 8:00.');
