// Observer / replay controls: per-player vision switching, the production overlay and the
// timeline scrubber. Seeking is the interesting one - a replay is a command log, not a series of
// snapshots, so seeking backwards restarts and re-runs and must land on exactly the same state.
//   node test/observer.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); } };

const errors = [];
const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '' });
const ctx = {
  console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0])) }, Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
  localStorage: { getItem() { return null; }, setItem() { } },
  document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, alert() { },
};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'render', 'ui'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });

const run = src => vm.runInContext(src, ctx);
const wait = () => new Promise(r => setTimeout(r, 5));

(async () => {
  // Record a game with three players so switching has somewhere to go, then watch it back.
  run(`
    UI.ping = () => {}; UI.onUnitDied = () => {}; Render.reset = () => {}; Render.frame = () => {};
    Render.W = 1280; Render.H = 800; Render.viewW = 1280; Render.viewH = 690;
    UI.start({ players: [{ race: 'T', human: true, name: 'Zac', team: 1 }, { race: 'Z', human: false, difficulty: 'normal', name: 'Kerri', team: 2 }, { race: 'P', human: false, difficulty: 'normal', name: 'Tass', team: 3 }], seed: 4, layout: 'temple' });
    // a few real player commands so the log is not empty and seeking has to replay them
    for (let i = 0; i < 7200; i++) {
      G.tick();
      if (i % 600 === 300) { const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.produces.includes('scv') && u.prod.length < 3); if (cc) G.queueUnit(cc, 'scv'); }
    }
    this.rec = Replay.data();
    this.hashAt = {};
  `);
  ok('the recording has a command log', ctx.rec.cmds.length >= 5 && ctx.rec.frame === 7200, ctx.rec.cmds.length + ' commands at frame ' + ctx.rec.frame);

  // reference: play the log straight through and note the state at two frames
  run(`
    UI.startFromLog(this.rec, 'watch');
    while (G.frame < 2400) G.tick(); this.hashAt[2400] = G.stateHash();
    while (G.frame < 4800) G.tick(); this.hashAt[4800] = G.stateHash();
  `);
  ok('watching a replay puts the UI in replay mode', run('UI.mode') === 'replay');
  ok('an observer starts with full vision and the production overlay up', run('UI.viewAll') === true && run('UI.prodOverlay') === true);
  ok('the timeline knows how long the replay is', run('UI.replayLength()') === 7200, String(run('UI.replayLength()')));

  // ---- per-player vision ----
  run('UI.cycleObserved(1);');
  ok('] switches to the next player', run('G.human') === 1, 'G.human=' + run('G.human'));
  run('UI.cycleObserved(1); UI.cycleObserved(1);');
  ok('switching wraps around all three players', run('G.human') === 0, 'G.human=' + run('G.human'));
  run('UI.cycleObserved(-1);');
  ok('[ switches backwards and wraps', run('G.human') === 2, 'G.human=' + run('G.human'));
  ok('the observed player is the one whose vision is drawn', run('(() => { const p = G.players[G.human]; return p.vis === G.players[2].vis; })()') === true);

  // switching must not touch the simulation
  const before = run('G.stateHash()');
  run('UI.observePlayer(0); UI.observePlayer(1); UI.observePlayer(2);');
  ok('switching player does not change the simulation', run('G.stateHash()') === before);
  run('UI.mode = "play"; UI.observePlayer(0); UI.mode = "replay";');
  ok('switching is refused outside replay mode', run('G.human') === 2, 'G.human=' + run('G.human'));

  // ---- production overlay ----
  const rows = run('JSON.stringify(UI.prodRows().map(r => ({ name: r.p.name, workers: r.workers, army: r.army, making: r.making })))');
  const parsed = JSON.parse(rows);
  ok('the overlay has a row per player', parsed.length === 3, rows);
  ok('rows carry workers, army supply and what is in production', parsed.every(r => typeof r.workers === 'number' && typeof r.army === 'number' && typeof r.making === 'string') && parsed.some(r => r.workers > 0), rows);
  ok('clicking a row switches to that player', run('(() => { const q = UI.prodRowRect(1); UI.prodOverlay = true; return UI.prodClick(q.x + 5, q.y + 5) && G.human === 1; })()') === true);
  ok('clicks away from the rows are ignored', run('UI.prodClick(900, 600)') === false);
  ok('the overlay is replay-only', run('(() => { UI.mode = "play"; const r = UI.prodClick(UI.prodRowRect(0).x + 5, UI.prodRowRect(0).y + 5); UI.mode = "replay"; return r; })()') === false);

  // ---- scrubbing ----
  // forward: run on to a later frame
  run('UI.observePlayer(1); UI.seekTo(6000);');
  while (run('UI.seeking')) await wait();
  ok('seeking forward advances to the target frame', run('G.frame') === 6000, 'frame=' + run('G.frame'));
  ok('seeking keeps the player being watched', run('G.human') === 1, 'G.human=' + run('G.human'));

  // backward: restart and re-run, and land on exactly the reference state
  run('UI.seekTo(2400);');
  while (run('UI.seeking')) await wait();
  ok('seeking backwards rewinds to the target frame', run('G.frame') === 2400, 'frame=' + run('G.frame'));
  ok('a rewound replay is bit-identical to playing straight through', run('G.stateHash()') === ctx.hashAt[2400], run('G.stateHash()') + ' vs ' + ctx.hashAt[2400]);

  run('UI.seekTo(4800);');
  while (run('UI.seeking')) await wait();
  ok('seeking forward again is identical too', run('G.frame') === 4800 && run('G.stateHash()') === ctx.hashAt[4800], run('G.stateHash()') + ' vs ' + ctx.hashAt[4800]);

  run('UI.seekTo(0);');
  while (run('UI.seeking')) await wait();
  ok('Home restarts the replay', run('G.frame') === 0, 'frame=' + run('G.frame'));

  // clicking the bar maps position to time, and clicks off the bar fall through
  run('UI.seekTo(0); const r = UI.timelineRect(); this.hit = UI.timelineClick(r.x + r.w / 2, r.y + 4); this.miss = UI.timelineClick(r.x + r.w / 2, r.y + 300);');
  while (run('UI.seeking')) await wait();
  ok('clicking the middle of the bar seeks to the middle of the replay', ctx.hit === true && Math.abs(run('G.frame') - 3600) < 60, 'frame=' + run('G.frame'));
  ok('clicks below the bar are not seeks', ctx.miss === false);

  ok('no JS errors', errors.length === 0, errors[0] || '');
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
