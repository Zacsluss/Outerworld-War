// A sixty-minute game, which nothing in this repo has ever run.
//
// Three things have never been exercised past the fifteen-minute games the balance harness plays:
//   1. the simulation itself at 86400 frames -- does it finish, does it stay the same speed, does
//      anything grow without bound (G.byId never forgets a unit, by design);
//   2. a replay of a game that long -- the whole log re-simulated, checked against hashes the live
//      game recorded, which is test/determinism.js at four times the distance;
//   3. UI.keepSnapshot's thinning rule. Past 80 checkpoints (40 minutes) it drops every second one.
//      Nothing has ever crossed that line, so nothing has ever seeked into a thinned region.
//
// The game is kept alive by giving the one human player god mode through the command stream (the
// same trick test/net.js uses): the three computer players fight each other, at least one of them
// always survives because it cannot be killed by a player that never attacks, so two teams are
// always alive and checkVictory never fires. The cheat is a recorded command, so the replay
// reproduces it -- G.freePlay would not, because it is runtime state and not in the log.
//
//   node test/longgame.js [minutes=60] [seed=11]
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');

// Re-exec with a gc hook and a bigger heap: the replay holds ~120 live checkpoints at once and the
// whole point of this file is to measure that, so it must not be at the mercy of the default heap.
if (typeof global.gc !== 'function') {
  const r = spawnSync(process.execPath, ['--expose-gc', '--max-old-space-size=8192', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}

const MINUTES = parseFloat(process.argv[2] || '60'), SEED = parseInt(process.argv[3] || '11');
const TPS = 24, TOTAL = Math.round(MINUTES * 60 * TPS), SEG = 2400;   // one segment = 100 s of game time
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); } };
const mb = b => Math.round(b / 1048576);
const heap = () => { global.gc(); global.gc(); return process.memoryUsage().heapUsed; };
const clock = f => Math.floor(f / TPS / 60) + ':' + String(Math.floor(f / TPS) % 60).padStart(2, '0');

const errors = [];
const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '', querySelectorAll: () => [] });
const ctx = {
  console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 2).join(' | ') : String(x)).join(' ')) },
  Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
  localStorage: { getItem() { return null; }, setItem() { } },
  document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, alert(m) { errors.push('alert: ' + m); },
};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'render', 'ui'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const run = src => vm.runInContext(src, ctx);
const wait = () => new Promise(r => setTimeout(r, 4));

// ---------------------------------------------------------------- phase 1: play an hour
run(`
  UI.ping = () => {}; UI.onUnitDied = () => {}; Render.reset = () => {}; Render.frame = () => {};
  Render.W = 1280; Render.H = 800; Render.viewW = 1280; Render.viewH = 690;
  UI.start({ players: [
    { race: 'T', human: true,  name: 'Zac',   team: 1 },
    { race: 'Z', human: false, difficulty: 'normal', name: 'Kerri', team: 2 },
    { race: 'T', human: false, difficulty: 'normal', name: 'Duke',  team: 3 },
    { race: 'P', human: false, difficulty: 'normal', name: 'Tass',  team: 4 }], seed: ${SEED}, layout: 'temple' });
  UI.running = false;                       // the harness drives the sim, not the interval
  G.cheat('power overwhelming');             // recorded, so the replay reproduces it
  G.cheat('show me the money');
  this.hashes = {}; this.peakUnits = 0; this.peakLive = 0;
  // A trickle of real player commands so the log is not just two cheats: a save/replay of this game
  // has to carry, schedule and re-apply hundreds of commands over an hour.
  this.drive = () => {
    const cc = G.units.find(u => u.alive && u.owner === 0 && u.isBuilding && u.done && u.def.produces.includes('scv'));
    if (cc && !cc.prod.length) G.queueUnit(cc, 'scv');
    const scv = G.units.filter(u => u.alive && u.owner === 0 && u.def.worker);
    if (scv.length) { const k = (G.frame / 120) | 0; const u = scv[k % scv.length]; u.setOrder({ type: 'move', x: G.players[0].startX + ((k % 5) - 2) * 48, y: G.players[0].startY + ((k % 3) - 1) * 48 }); }
  };
  // The hash is taken before the commands for this frame are issued, because that is where a replay
  // sees it: Replay.applyPending runs at the top of the *next* tick.
  this.runFrames = n => {
    for (let i = 0; i < n; i++) {
      G.tick();
      if (G.frame % 4800 === 0) this.hashes[G.frame] = G.stateHash();
      if (G.frame % 120 === 0) this.drive();
      if (G.units.length > this.peakUnits) this.peakUnits = G.units.length;
    }
    const live = G.units.filter(u => u.alive).length; if (live > this.peakLive) this.peakLive = live;
    return { frame: G.frame, over: G.over, live, arr: G.units.length, byId: G.byId.size, fields: G.fields.length,
             proj: G.projectiles.length, fx: G.effects.length, log: G.log.length,
             alive: G.players.filter(p => !p.defeated).length,
             sup: G.players.map(p => p.supUsed).join('/'), paths: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id).length).join('/') };
  };
`);

console.log('--- an hour of game time, ' + TOTAL + ' frames, seed ' + SEED + ' -----------------------------');
const segs = [];
const h0 = heap();
for (let done = 0; done < TOTAL; done += SEG) {
  const n = Math.min(SEG, TOTAL - done);
  const t0 = Date.now();
  const s = run(`this.runFrames(${n})`);
  const ms = Date.now() - t0;
  const sample = (s.frame % (SEG * 6) === 0) || done + n >= TOTAL;
  const hp = sample ? heap() : null;
  segs.push({ f: s.frame, ms, perFrame: ms / n, live: s.live, arr: s.arr, byId: s.byId, heap: hp, alive: s.alive, log: s.log });
  if (sample) console.log('  ' + clock(s.frame).padStart(5) + '  ' + String(Math.round(ms / n * 1000) / 1000).padStart(6) + ' ms/frame  live ' + String(s.live).padStart(4) +
    '  units[] ' + String(s.arr).padStart(4) + '  byId ' + String(s.byId).padStart(6) + '  heap ' + String(mb(hp)).padStart(5) + ' MB  players left ' + s.alive + '  cmds ' + s.log + '  sup ' + s.sup);
  if (s.over) { console.log('  game ended early at frame ' + s.frame + ' (winner ' + run('G.winner') + ')'); break; }
}
const last = segs[segs.length - 1];
const liveFrame = run('G.frame'), liveOver = run('G.over');
ok('an hour of game time completes', liveFrame === TOTAL && liveOver === false, 'frame ' + liveFrame + '/' + TOTAL + ' over=' + liveOver);
ok('no JS errors over the hour', errors.length === 0, errors.slice(0, 3).join(' || '));

// Speed: the last fifth of the hour against the second quarter of it, by which time unit counts have
// levelled off. A leak that costs time -- a growing array walked every tick -- shows up here even when
// the heap number looks calm. Medians, not means: this is wall-clock on a machine that may be running a
// balance sweep beside it, and one contended segment should not decide the verdict. A real runaway is an
// order of magnitude, not 3x.
const mid = segs.filter(s => s.f > TOTAL * 0.25 && s.f <= TOTAL * 0.5), tail = segs.filter(s => s.f > TOTAL * 0.8);
const med = a => { const v = a.map(s => s.perFrame).sort((x, y) => x - y); return v[v.length >> 1]; };
const midMs = med(mid), tailMs = med(tail);
console.log('  tick cost (median of ' + mid.length + '/' + tail.length + ' segments): ' + midMs.toFixed(3) + ' ms/frame at 15-30 min, ' + tailMs.toFixed(3) + ' ms/frame at 48-60 min');
console.log('  all segments, ms/frame: ' + segs.map(s => s.perFrame.toFixed(2)).join(' '));
ok('the simulation does not get slower and slower', tailMs < midMs * 3, tailMs.toFixed(3) + ' vs ' + midMs.toFixed(3) + ' ms/frame');

const heaps = segs.filter(s => s.heap != null);
const early = heaps.find(s => s.f >= TOTAL * 0.25), endH = heaps[heaps.length - 1];
console.log('  heap: ' + mb(h0) + ' MB at start, ' + mb(early.heap) + ' MB at ' + clock(early.f) + ', ' + mb(endH.heap) + ' MB at ' + clock(endH.f));
ok('memory does not run away over an hour', endH.heap < early.heap * 2.5 && endH.heap < 1200 * 1048576,
  mb(early.heap) + ' MB at ' + clock(early.f) + ' -> ' + mb(endH.heap) + ' MB at ' + clock(endH.f));
ok('the live unit array stays bounded', last.arr < 3000 && run('this.peakLive') < 3000, 'peak live ' + run('this.peakLive') + ', array ' + last.arr);
console.log('  G.byId holds ' + last.byId + ' units after an hour (it never forgets one, by design)');

// ---------------------------------------------------------------- phase 2: replay the hour
run('this.rec = Replay.data();');
const recLen = run('this.rec.cmds.length'), recFrame = run('this.rec.frame');
ok('the hour recorded a command log', recLen > 100 && recFrame === TOTAL, recLen + ' commands, frame ' + recFrame);
const refHashes = run('JSON.stringify(this.hashes)');
const refCount = Object.keys(JSON.parse(refHashes)).length;

run('UI.startFromLog(this.rec, "watch"); this.replayHashes = {};');
ok('a sixty-minute replay loads', run('UI.mode') === 'replay' && run('UI.replayLength()') === TOTAL, 'len ' + run('UI.replayLength()'));

console.log('--- replaying it, with checkpoints ------------------------------------------');
const rt0 = Date.now();
// Drive the replay exactly as UI.fastForward does (tick, then offer a checkpoint), synchronously.
for (let done = 0; done < TOTAL; done += SEG) {
  const n = Math.min(SEG, TOTAL - done);
  const s = run(`(() => { for (let i = 0; i < ${n}; i++) { G.tick(); UI.keepSnapshot(); if (G.frame % 4800 === 0) this.replayHashes[G.frame] = G.stateHash(); } return { f: G.frame, snaps: UI.snaps.length }; })()`);
  if (s.f % (SEG * 9) === 0 || done + n >= TOTAL) console.log('  ' + clock(s.f).padStart(5) + '  ' + s.snaps + ' checkpoints held  heap ' + mb(heap()) + ' MB');
  if (run('G.over')) break;
}
console.log('  replayed ' + run('G.frame') + ' frames in ' + Math.round((Date.now() - rt0) / 1000) + ' s');
ok('the replay reaches the end of the hour', run('G.frame') === TOTAL, String(run('G.frame')));
const rep = JSON.parse(run('JSON.stringify(this.replayHashes)')), ref = JSON.parse(refHashes);
const badFrames = Object.keys(ref).filter(f => rep[f] !== ref[f]);
ok('the replay is bit-identical to the hour it recorded', refCount >= 10 && badFrames.length === 0,
  badFrames.length ? 'first divergence at frame ' + badFrames[0] + ' (' + rep[badFrames[0]] + ' vs ' + ref[badFrames[0]] + ') of ' + refCount + ' checkpoints' : refCount + ' hashes over the hour');

// ---- the thinning rule, which only a game this long reaches ----
const snapInfo = run(`(() => { const s = UI.snaps.map(x => x.f); const gaps = []; for (let i = 1; i < s.length; i++) gaps.push(s[i] - s[i-1]);
  return { n: s.length, first: s[0], lastF: s[s.length-1], sorted: s.every((v,i) => i === 0 || v > s[i-1]), gaps,
           bytes: JSON.stringify(UI.snaps[UI.snaps.length-1].s).length }; })()`);
console.log('  checkpoints: ' + snapInfo.n + ' held, ' + clock(snapInfo.first) + ' to ' + clock(snapInfo.lastF) +
  ', gaps ' + [...new Set(snapInfo.gaps)].sort((a, b) => a - b).map(g => (g / TPS) + 's').join('/') + ', newest is ' + Math.round(snapInfo.bytes / 1024) + ' KB as JSON');
const marks = Math.floor(TOTAL / (TPS * 30));
ok('checkpoint thinning kicked in past forty minutes', marks > 80 && snapInfo.n < marks - 20 && snapInfo.n >= 40,
  snapInfo.n + ' checkpoints held for ' + marks + ' thirty-second marks');
ok('the checkpoint list is still in frame order after thinning', snapInfo.sorted === true, JSON.stringify(snapInfo.gaps.slice(0, 8)));
ok('the recent past keeps full resolution and the distant past is halved',
  snapInfo.gaps.slice(-19).every(g => g === TPS * 30) && snapInfo.gaps.slice(0, 8).some(g => g > TPS * 30),
  'tail gaps ' + [...new Set(snapInfo.gaps.slice(-19))].join(',') + ' head gaps ' + [...new Set(snapInfo.gaps.slice(0, 8))].join(','));

// ---- seeking, on both sides of the boundary ----
async function seek(frame, label, budgetMs) {
  const t0 = Date.now();
  try { run('UI.seekTo(' + frame + ');'); while (run('UI.seeking')) await wait(); }
  catch (e) {
    // A throw here is a finding, not a reason to abandon the run: report it and carry on so the
    // remaining seeks still get measured.
    const frames = String((e && e.stack) || '').split('\n').filter(l => /^\s+at /.test(l)).slice(0, 4).map(l => l.trim());
    ok('seeking back to ' + clock(frame) + ' (' + label + ') lands exactly right', false,
      'UI.seekTo threw: ' + (e && e.message) + '\n      ' + frames.join('\n      '));
    run('UI.seeking = false;');
    return false;
  }
  const ms = Date.now() - t0, got = run('G.frame'), h = run('G.stateHash()');
  const want = ref[frame];
  console.log('  seek to ' + clock(frame) + ' (' + label + '): ' + ms + ' ms, landed on frame ' + got);
  ok('seeking back to ' + clock(frame) + ' (' + label + ') lands exactly right', got === frame && want !== undefined && h === want, 'frame ' + got + ', hash ' + h + ' vs ' + want);
  if (budgetMs) ok('...and does it in under ' + budgetMs + ' ms', ms < budgetMs, ms + ' ms');
  return true;
}

(async () => {
  const at = m => { const f = TPS * 60 * m; return f - (f % 4800); };
  // A failed seek leaves the simulation half-restored, so there is nothing to learn from the ones after
  // it; say so rather than reporting three copies of one fault.
  if (await seek(at(55), 'inside the dense tail', 20000)) {
    await seek(at(24), 'inside the thinned region', 90000);
    await seek(at(48), 'forward again, past the boundary', 90000);
  } else console.log('  (skipping the remaining seeks: the failed one left the simulation half-restored)');
  ok('no JS errors in the replay either', errors.length === 0, errors.slice(0, 3).join(' || '));
  console.log('  final heap ' + mb(heap()) + ' MB');
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
