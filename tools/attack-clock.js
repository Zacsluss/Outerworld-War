// At what MINE_TIME does the computer stop attacking? (user item 7, after the 190 arm broke the gate)
//
// Halving the income turned four gate suites red, and test/aistyles.js named the reason: every style
// reported its "never attacked" sentinel on all three seeds. This finds the frame of the FIRST WAVE at each
// candidate so the choice is made on the number that broke.
//
// THE MEASURE IS THE AI'S OWN WAVE COUNTER (`ai.waves`), which is exactly what aistyles reads (`a.waves > 0`
// -> `first`, `a.waveSup0` -> `firstSup`). A first attempt here counted army units near the enemy start
// instead and reported "never" for Zerg even at today's settings, which is how a probe measures the wrong
// thing and reads as a finding -- the instrument has to be the one the suite uses.
//
// Hard AI 1v1 on Lost Ruins, 20 minutes. Source is patched IN MEMORY, so nothing on disk changes and this
// is safe to run beside a gate.
//   node tools/attack-clock.js        (about 12 AI games of up to 20 minutes each: minutes of wall time)
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build'];
const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { } });
const FRAMES = 24 * 60 * 20;
// Today's constants, read from the file rather than written here: this probe's first version anchored on the literal
// "MINE_TIME = 75" and broke the day 7a moved it to 190.
const CONST_RE = /const MINE_TIME = (\d+), GAS_TIME = (\d+),/;
const TODAY = (() => { const m = CONST_RE.exec(fs.readFileSync(path.join(root, 'js', 'sim.js'), 'utf8')); if (!m) throw new Error('js/sim.js: no MINE_TIME/GAS_TIME line'); return [+m[1], +m[2]]; })();

function arm(mineTime, gasTime, seed, races) {
  const ctx = {
    console: { log() { }, warn() { }, error() { } }, Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
    localStorage: { _v: {}, getItem(k) { return this._v[k] || null; }, setItem(k, v) { this._v[k] = v; } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
    requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, alert() { },
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of FILES) {
    let src = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
    if (f === 'sim') {
      const n = (src.match(new RegExp(CONST_RE.source, 'g')) || []).length;
      if (n !== 1) throw new Error('MINE_TIME anchor matched ' + n + ' times');
      src = src.replace(CONST_RE, 'const MINE_TIME = ' + mineTime + ', GAS_TIME = ' + gasTime + ',');
    }
    vm.runInContext(src, ctx, { filename: f + '.js' });
  }
  const run = e => vm.runInContext(e, ctx);
  run(`G.init({ players: [{ race: '${races[0]}', human: false, difficulty: 'hard' }, { race: '${races[1]}', human: false, difficulty: 'hard' }], seed: ${seed}, layout: 'temple' });`);
  return run(`(() => {
    const first = [0, 0], firstSup = [0, 0], peakSup = [0, 0];
    for (let f = 0; f < ${FRAMES}; f++) {
      G.tick();
      for (let p = 0; p < 2; p++) {
        const a = G.players[p].ai; if (!a) continue;
        if (!first[p] && a.waves > 0) { first[p] = G.frame; firstSup[p] = a.waveSup0 || 0; }
        if (G.players[p].supUsed > peakSup[p]) peakSup[p] = G.players[p].supUsed;
      }
      if (G.over) break;
    }
    return { first, firstSup, peakSup, waves: G.players.map(p => p.ai ? p.ai.waves : -1), over: G.over };
  })()`);
}

const clock = f => !f ? '  never' : (Math.floor(f / 24 / 60) + ':' + String(Math.floor(f / 24) % 60).padStart(2, '0')).padStart(7);
console.log('First attack WAVE (the AI\'s own counter, the measure test/aistyles.js uses).');
console.log('Hard AI 1v1 on Lost Ruins, 20-minute cap. Ten minutes is the window aistyles judges.\n');
console.log('  MINE/GAS   seed  match   first wave A   first wave B   waves A/B   peak supply A/B');
const ARMS = [[75, 37], [90, 44], [105, 52], [120, 59], [150, 74], [190, 94]];
if (!ARMS.some(([m, g]) => m === TODAY[0] && g === TODAY[1])) ARMS.push(TODAY);
for (const [mt, gt] of ARMS) {
  for (const [seed, races] of [[1, ['T', 'Z']], [5, ['P', 'T']]]) {
    const r = arm(mt, gt, seed, races);
    console.log('  ' + String(mt + '/' + gt).padEnd(9) + String(seed).padStart(4) + '  ' + races.join('v') + '   ' +
      clock(r.first[0]) + '        ' + clock(r.first[1]) + '     ' + String(r.waves[0] + '/' + r.waves[1]).padStart(7) +
      '     ' + String(Math.round(r.peakSup[0]) + '/' + Math.round(r.peakSup[1])).padStart(9) + (mt === TODAY[0] && gt === TODAY[1] ? '   <- today' : ''));
  }
}
