// Branching replay: take control mid-replay and play the what-if. M11 wave three, item 24.
//
// This is cheap in this engine for one reason worth stating: a replay here is not a recording of what
// happened, it is the seed plus the human's commands, re-simulated. The AI is being re-derived live
// already. So "take control" is only two things -- stop feeding the recorded commands in, and lift the
// gate in CMD.apply that refuses player input while UI.mode === 'replay'.
//
// The property that makes it worth having rather than a toy is that the branch is a REAL GAME: G.log
// is seeded with the recorded commands up to the branch frame and recording resumes, so the file you
// save afterwards replays from frame 0 through the original opening into whatever you did instead.
// That is what these checks are mostly about.
//   node test/branch.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'build', 'render', 'ui', 'hud'], ext: false });

const r = vm.runInContext(`(() => {
  const out = {};
  if (CMD.install && !CMD.installed) { CMD.install(); CMD.installed = true; }
  const OPTS = { players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 12, layout: 'temple', human: 0 };

  // ---- record a short game with some real commands in it ----
  UI.mode = 'play'; G.init(OPTS); G.recording = true; G.log = []; G.pendingCmds = null;
  const scv = G.units.find(u => u.alive && u.owner === 0 && u.def.worker);
  for (let f = 1; f <= 600; f++) {
    G.tick();
    if (f === 100 || f === 300 || f === 500) scv.setOrder({ type: 'move', x: G.players[0].startX + f, y: G.players[0].startY });
  }
  const recorded = { cmds: G.log.slice(), frame: G.frame };
  out.recorded = { n: recorded.cmds.length, frames: recorded.cmds.map(e => e.f) };

  // ---- watch it back, and confirm player input is refused while watching ----
  UI.mode = 'replay'; UI.replayData = { seed: 12, layout: 'temple', players: OPTS.players, human: 0, cmds: recorded.cmds, frame: recorded.frame };
  G.init(OPTS); G.recording = false; G.log = []; G.pendingCmds = { list: recorded.cmds.slice(), i: 0 };
  for (let f = 1; f <= 200; f++) { G.tick(); Replay.applyPending(); }
  out.duringReplay = {
    applied: G.pendingCmds.i,
    inputRefused: G.units.find(u => u.alive && u.owner === 0 && u.def.worker).setOrder({ type: 'move', x: 100, y: 100 }) === false,
    logEmpty: G.log.length === 0,
  };

  // ---- take control at frame 200 ----
  const at = G.frame;
  UI.branchReplay();
  out.branch = {
    mode: UI.mode, at, pending: G.pendingCmds, recording: G.recording,
    logSeeded: G.log.length, expectSeeded: recorded.cmds.filter(e => e.f <= at).length,
    branchedFromAt: UI.branchedFrom && UI.branchedFrom.at,
    speedInRange: UI.speedIdx <= UI.maxSpeedIdx(),
  };
  // input is accepted now
  const mine = G.units.find(u => u.alive && u.owner === 0 && u.def.worker);
  out.inputAccepted = mine.setOrder({ type: 'move', x: G.players[0].startX + 200, y: G.players[0].startY + 200 }) !== false;
  for (let f = 0; f < 60; f++) G.tick();
  // ...and one more strictly after the branch frame, so "the log holds both halves" below is really
  // about the what-if and not about the command issued on the boundary itself.
  mine.setOrder({ type: 'move', x: G.players[0].startX + 260, y: G.players[0].startY + 260 });
  for (let f = 0; f < 30; f++) G.tick();
  out.newCmdRecorded = G.log.some(e => e.f > at);

  // ---- and the recorded future is genuinely gone: nothing after the branch is ever applied ----
  out.futureDropped = G.pendingCmds === null;

  // ---- what you save is a whole game, not a fragment ----
  const d = Replay.data();
  out.saved = {
    fromZero: d.cmds.length && Math.min(...d.cmds.map(e => e.f)) <= 100,
    hasBoth: d.cmds.some(e => e.f <= at) && d.cmds.some(e => e.f > at),
    seed: d.seed, layout: d.layout,
  };

  // ---- branching twice from a fresh replay does not accumulate state ----
  UI.mode = 'replay'; UI.replayData = { seed: 12, layout: 'temple', players: OPTS.players, human: 0, cmds: recorded.cmds, frame: recorded.frame };
  G.init(OPTS); G.recording = false; G.log = []; G.pendingCmds = { list: recorded.cmds.slice(), i: 0 };
  for (let f = 1; f <= 120; f++) { G.tick(); Replay.applyPending(); }
  UI.branchReplay();
  out.second = { at: UI.branchedFrom.at, logSeeded: G.log.length, expect: recorded.cmds.filter(e => e.f <= 120).length };

  // ---- branchReplay does nothing outside replay mode ----
  UI.mode = 'play'; UI.branchedFrom = null;
  UI.branchReplay();
  out.noopInPlay = UI.branchedFrom === null;
  return out;
})()`, ctx);

ok(r.recorded.n === 3, 'the recording captured the three commands that were issued', JSON.stringify(r.recorded));

ok(r.duringReplay.applied > 0, 'watching it back applies the recorded commands', JSON.stringify(r.duringReplay));
ok(r.duringReplay.inputRefused, '...and refuses live player input while it does -- that gate is what branching lifts', JSON.stringify(r.duringReplay));
ok(r.duringReplay.logEmpty, '...and records nothing of its own', JSON.stringify(r.duringReplay));

ok(r.branch.mode === 'play', 'taking control switches out of replay mode', JSON.stringify(r.branch));
ok(r.branch.pending === null && r.futureDropped, '...and stops feeding the recorded future in', JSON.stringify(r.branch));
ok(r.branch.recording, '...and starts recording again, because the branch is a real game', JSON.stringify(r.branch));
ok(r.branch.logSeeded === r.branch.expectSeeded && r.branch.logSeeded > 0, '...with the past that led here already in the log', JSON.stringify(r.branch));
ok(r.branch.branchedFromAt === r.branch.at, 'it remembers where it branched, so the original can be watched again', JSON.stringify(r.branch));
ok(r.branch.speedInRange, 'and the speed is clamped -- replay speeds go past anything play mode can set back', JSON.stringify(r.branch));

ok(r.inputAccepted, 'player commands are accepted after branching');
ok(r.newCmdRecorded, '...and go into the log alongside the recorded ones');

ok(r.saved.fromZero && r.saved.hasBoth, 'saving afterwards yields a WHOLE game: the original opening, then the what-if', JSON.stringify(r.saved));
ok(r.saved.seed === 12 && r.saved.layout === 'temple', '...on the same map and seed, so it re-simulates', JSON.stringify(r.saved));

ok(r.second.logSeeded === r.second.expect, 'branching a second time seeds from the new frame, not the old one', JSON.stringify(r.second));
ok(r.noopInPlay, 'and branchReplay does nothing at all outside a replay');

summary({ word: 'FAILURES' });
