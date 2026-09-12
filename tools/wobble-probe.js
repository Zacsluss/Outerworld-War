// TODO-M18 item 11: "dragoons wobble very fast after they move". MEASURE IT FIRST -- record facing, x, y
// and order state per frame after a move completes, and report the amplitude and period. Then fix the
// cause the probe names, and no other.
//
//   node tools/wobble-probe.js [--frames=240] [--unit=dragoon] [--n=8] [--verbose]
//
// Three candidate causes, from TODO-M18: oscillating between two facings, oscillating between "arrived"
// and "not arrived", or being pushed by collision and re-facing every frame. The probe does not choose
// between them -- it records what would distinguish them:
//   facing per frame          -> the amplitude and period of the wobble itself
//   order.type per frame      -> whether the ORDER is flapping (arrived / not arrived)
//   moved per frame           -> whether the unit is being shoved (separation) while it stands
//   moveTo calls per frame    -> whether anything is still asking it to move at all
'use strict';
const path = require('path'), vm = require('vm');
const { makeCtx } = require(path.join(__dirname, '..', 'test', '_harness'));
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const FRAMES = parseInt(arg('frames', '240'), 10);
const UNIT = arg('unit', 'dragoon');
const N = parseInt(arg('n', '8'), 10);
const VERBOSE = process.argv.includes('--verbose');

const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'] });
ctx.__opt = { FRAMES, UNIT, N };

const r = vm.runInContext(`(() => {
  const { FRAMES, UNIT, N } = __opt;
  G.init({ players: [{ race: 'P', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 5, layout: 'temple' });
  for (const pl of G.players) if (!pl.neutral) pl.ai = null;
  const p = G.players[0];
  const hall = G.units.find(u => u.owner === 0 && u.def.depot);
  const out = { unit: UNIT, turn: TURN[UNIT] === undefined ? null : TURN[UNIT], runs: [] };

  const record = (label, make, order) => {
    const us = make();
    for (let f = 0; f < 400; f++) { G.tick(); if (us.every(u => u.order.type === 'idle')) break; }   // let them settle first
    order(us);
    // run until the order is done, then keep watching
    let doneAt = -1;
    const log = us.map(() => []);
    for (let f = 0; f < FRAMES + 600; f++) {
      const before = us.map(u => ({ x: u.x, y: u.y }));
      G.tick();
      us.forEach((u, i) => log[i].push({ f, facing: u.facing, order: u.order.type,
        moved: Math.hypot(u.x - before[i].x, u.y - before[i].y), x: u.x, y: u.y }));
      if (doneAt < 0 && us.every(u => u.order.type === 'idle')) doneAt = f;
      if (doneAt >= 0 && f > doneAt + FRAMES) break;
    }
    // the window AFTER the move completed is what item 11 is about
    const stats = log.map(L => {
      const tail = L.filter(e => doneAt >= 0 && e.f > doneAt);
      if (!tail.length) return { samples: 0 };
      const norm = a => Math.atan2(Math.sin(a), Math.cos(a));
      let flips = 0, maxStep = 0, totalTurn = 0, moved = 0, orders = new Set();
      for (let i = 1; i < tail.length; i++) {
        const d = norm(tail[i].facing - tail[i - 1].facing);
        if (Math.abs(d) > 1e-6) { totalTurn += Math.abs(d); maxStep = Math.max(maxStep, Math.abs(d)); }
        if (i > 1) { const prev = norm(tail[i - 1].facing - tail[i - 2].facing); if (d * prev < -1e-9) flips++; }
        moved += tail[i].moved; orders.add(tail[i].order);
      }
      const fac = tail.map(e => e.facing);
      const lo = Math.min(...fac), hi = Math.max(...fac);
      return { samples: tail.length, flips, periodFrames: flips ? +(2 * tail.length / flips).toFixed(2) : null,
        amplitudeRad: +(maxStep).toFixed(4), amplitudeDeg: +(maxStep * 180 / Math.PI).toFixed(2),
        spreadDeg: +((hi - lo) * 180 / Math.PI).toFixed(2), turnPerFrameDeg: +(totalTurn / tail.length * 180 / Math.PI).toFixed(3),
        movedPx: +moved.toFixed(2), orders: [...orders].join(','),
        head: tail.slice(0, 12).map(e => ({ f: e.f, facing: +e.facing.toFixed(4), o: e.order, m: +e.moved.toFixed(2) })) };
    });
    out.runs.push({ label, doneAt, stats });
  };

  const spawnLine = (id, n, x, y) => { const a = []; for (let i = 0; i < n; i++) a.push(G.spawnUnit(id, 0, x + (i % 4) * 26, y + Math.floor(i / 4) * 26)); return a; };

  // 1. ONE unit, ordered to empty ground and left alone: no neighbours, nothing to push it.
  record('one ' + UNIT + ', alone, move to empty ground',
    () => spawnLine(UNIT, 1, hall.x + 300, hall.y + 300),
    us => us.forEach(u => u.applyOrder({ type: 'move', x: hall.x + 700, y: hall.y + 300 })));

  // 2. a GROUP of them to the same point, which is where separation starts shoving.
  record(N + ' ' + UNIT + 's, same destination',
    () => spawnLine(UNIT, N, hall.x + 300, hall.y + 400),
    us => us.forEach(u => u.applyOrder({ type: 'move', x: hall.x + 700, y: hall.y + 400 })));

  // 3. the control: a unit with NO entry in TURN, so its turn rate is the generic 0.7.
  record(N + ' marines, same destination (CONTROL: no TURN entry)',
    () => spawnLine('marine', N, hall.x + 300, hall.y + 500),
    us => us.forEach(u => u.applyOrder({ type: 'move', x: hall.x + 700, y: hall.y + 500 })));

  return out;
})()`, ctx);

console.log(r.unit + ': TURN entry ' + r.turn + ' rad/frame' + (r.turn ? '  (' + (r.turn * 180 / Math.PI).toFixed(1) + ' deg)' : ''));
for (const run of r.runs) {
  console.log('\n' + run.label + '   (move completed at frame ' + run.doneAt + ')');
  console.log('  #   flips  period  amplitude  spread   turn/frame   moved   orders');
  run.stats.forEach((s, i) => {
    if (!s.samples) { console.log('  ' + i + '   (never idle)'); return; }
    console.log('  ' + String(i).padStart(2) + String(s.flips).padStart(7) + String(s.periodFrames === null ? '-' : s.periodFrames).padStart(8)
      + (s.amplitudeDeg + ' deg').padStart(11) + (s.spreadDeg + ' deg').padStart(10) + (s.turnPerFrameDeg + ' deg').padStart(13)
      + (s.movedPx + ' px').padStart(11) + '   ' + s.orders);
  });
  if (VERBOSE) for (const s of run.stats) if (s.head) console.log('      ' + JSON.stringify(s.head));
}
console.log('\nflips = how many times the direction of turn REVERSED after the move finished.');
console.log('A unit that has stopped should show 0 flips, 0 turn per frame and 0 px moved.');
