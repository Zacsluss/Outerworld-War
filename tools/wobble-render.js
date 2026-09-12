// TODO-M18 item 11, part two. The simulation half measured clean: after a move completes a dragoon's
// `facing` does not move at all (0 flips, 0 degrees a frame, 0 pixels moved -- tools/wobble-probe.js,
// one alone and eight together, with marines as the control). So whatever the player is seeing is on the
// DRAWN side, and this records that instead:
//   Sprites.dirOf(facing)   the sprite direction bucket -- a facing sitting exactly on a boundary would
//                           flip between two sprites every frame, which is as fast as a wobble gets
//   Render.animOf(u)        the animation frame -- a walk cycle that keeps running after the unit stops
//   Render.motion.p         the settle spring's offset -- a mass on a spring that never rings down
//   the drawn x/y           the interpolated position the draw pass actually uses
//
//   node tools/wobble-render.js [--unit=dragoon] [--n=8] [--after=180] [--verbose]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const UNIT = arg('unit', 'dragoon'), N = parseInt(arg('n', '8'), 10), AFTER = parseInt(arg('after', '180'), 10);
const VERBOSE = process.argv.includes('--verbose');

// the same canvas stub test/qol.js uses: every context method is a no-op recorder
const mkCtx = () => new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 1280, height: 720 };
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() { } });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (typeof k === 'symbol') return undefined;
    return () => { };
  },
  set() { return true; },
});
const div = () => ({ style: {}, addEventListener() { }, getContext: mkCtx, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] });
const ctx = {
  console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval: () => 0, addEventListener() { },
  localStorage: { getItem: () => null, setItem() { } },
  document: { getElementById: div, createElement: () => ({ width: 0, height: 0, style: {}, addEventListener() { }, getContext: mkCtx }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' },
};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'sprites_units', 'sprites_buildings', 'sprites', 'atlas', 'fx', 'terrain', 'render'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
ctx.__opt = { UNIT, N, AFTER };

const r = vm.runInContext(`(() => {
  const { UNIT, N, AFTER } = __opt;
  G.init({ players: [{ race: 'P', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 5, layout: 'temple' });
  for (const pl of G.players) if (!pl.neutral) pl.ai = null;
  const hall = G.units.find(u => u.owner === 0 && u.def.depot);
  const run = (label, id, n) => {
    const us = [];
    for (let i = 0; i < n; i++) us.push(G.spawnUnit(id, 0, hall.x + 300 + (i % 4) * 26, hall.y + 300 + Math.floor(i / 4) * 26));
    for (let f = 0; f < 200; f++) G.tick();
    us.forEach(u => u.applyOrder({ type: 'move', x: hall.x + 700, y: hall.y + 300 }));
    let doneAt = -1;
    const log = us.map(() => []);
    for (let f = 0; f < 1200; f++) {
      G.tick();
      Render.tickMotion(G.units);
      us.forEach((u, i) => {
        const m = Render.motion.get(u.id) || { p: 0, v: 0, spd: 0 };
        log[i].push({ f, dir: Sprites.dirOf(u.facing, u), anim: Render.animOf(u), p: m.p, v: m.v, spd: m.spd,
          moving: !!u.moving, order: u.order.type, facing: u.facing, x: u.x, y: u.y });
      });
      if (doneAt < 0 && us.every(u => u.order.type === 'idle')) doneAt = f;
      if (doneAt >= 0 && f > doneAt + AFTER) break;
    }
    const measure = tail => {
      if (!tail.length) return { samples: 0 };
      let dirFlips = 0, animFlips = 0, pFlips = 0, pMax = 0, pMin = 0, turnReversals = 0; const revDeltas = [];
      const dirs = new Set(), anims = new Set();
      const norm = a => Math.atan2(Math.sin(a), Math.cos(a));
      for (let i = 1; i < tail.length; i++) {
        // A REVERSAL of the direction of turn is what a wobble is: not "it turned", but "it turned back".
        if (i > 1) { const d = norm(tail[i].facing - tail[i - 1].facing), pr = norm(tail[i - 1].facing - tail[i - 2].facing); if (d * pr < -1e-9 && Math.abs(d) > 1e-6) { turnReversals++; revDeltas.push(Math.abs(d)); } }
        if (tail[i].dir !== tail[i - 1].dir) dirFlips++;
        if (tail[i].anim !== tail[i - 1].anim) animFlips++;
        if (i > 1) { const a = tail[i].p - tail[i - 1].p, b = tail[i - 1].p - tail[i - 2].p; if (a * b < -1e-12) pFlips++; }
        pMax = Math.max(pMax, tail[i].p); pMin = Math.min(pMin, tail[i].p);
        dirs.add(tail[i].dir); anims.add(tail[i].anim);
      }
      // how long the spring takes to fall under a tenth of a pixel after the stop
      let settleAt = -1; for (let i = 0; i < tail.length; i++) { if (Math.abs(tail[i].p) < 0.1) { settleAt = tail[i].f - tail[0].f; break; } }
      const sorted = revDeltas.slice().sort((a, b) => a - b);
      const pct = q => sorted.length ? +(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 180 / Math.PI).toFixed(3) : 0;
      return { samples: tail.length, dirFlips, turnReversals, reversalsPerSec: +(turnReversals / (tail.length / 24)).toFixed(2),
        revMedianDeg: pct(0.5), revP90Deg: pct(0.9), revMaxDeg: pct(0.999),
        tinyReversals: revDeltas.filter(d => d < 0.05).length, bigReversals: revDeltas.filter(d => d >= 0.05).length,
        dirs: [...dirs].join(','), animFlips, anims: [...anims].slice(0, 6).join(','),
        springFlips: pFlips, springRange: +(pMax - pMin).toFixed(3), settleFrames: settleAt,
        stillMoving: tail.filter(e => e.moving).length,
        head: tail.slice(0, 16).map(e => ({ f: e.f, dir: e.dir, anim: e.anim, p: +e.p.toFixed(3), mv: e.moving })) };
    };
    const stats = log.map(L => measure(L.filter(e => doneAt >= 0 && e.f > doneAt)));
    const during = log.map(L => measure(L.filter(e => doneAt < 0 || e.f <= doneAt)));
    return { label, doneAt, stats, during };
  };
  return { runs: [run('one ' + UNIT, UNIT, 1), run(N + ' ' + UNIT + 's', UNIT, N), run(N + ' marines (CONTROL)', 'marine', N)],
    dirs: Sprites.DIRS, walkFrames: Sprites.WALK_FRAMES };
})()`, ctx);

console.log('sprite directions: ' + r.dirs + ', walk frames: ' + r.walkFrames);
const table = (title, rows) => {
  console.log('  ' + title);
    console.log('    #  frames  reversals  per sec   median   p90     max     under 3deg / over');
  rows.forEach((s, i) => {
    if (!s.samples) { console.log('   ' + i + '  (no samples)'); return; }
    console.log('   ' + String(i).padStart(2) + String(s.samples).padStart(8) + String(s.turnReversals).padStart(11)
      + String(s.reversalsPerSec).padStart(9) + String(s.revMedianDeg).padStart(9) + String(s.revP90Deg).padStart(8)
      + String(s.revMaxDeg).padStart(8) + '     ' + s.tinyReversals + ' / ' + s.bigReversals);
  });
};
for (const run of r.runs) {
  console.log('\n' + run.label + '   (idle from frame ' + run.doneAt + ')');
  table('DURING the move:', run.during);
  table('AFTER it completed (' + AFTER + ' frames):', run.stats);
  if (VERBOSE) for (const s of run.during) if (s.head) console.log('      ' + JSON.stringify(s.head));
}
console.log('\ndirFlips = the sprite direction changing after the unit stopped. Anything above 0 is a unit');
console.log('visibly turning on the spot; a high number at a two-value `dirs` is a flicker between two sprites.');
