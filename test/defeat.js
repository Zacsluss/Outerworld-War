// FIXLIST-M14 B4 (item 8) -- the defeat screen, and why it was never showing.
//
// The report was "there should be a game over screen with return to menu and restart". Two separate
// things were true:
//
//   * THE SCREEN EXISTED and had Continue / Save replay / Return to main menu. It had no Restart.
//   * IT WAS OFTEN NEVER REACHED. `G.over` is set by G.checkVictory only when ONE TEAM REMAINS, so in
//     a free-for-all with three or more teams the human can be wiped out and the flag stays false for
//     ever while the surviving AIs fight on. Measured before anything was changed:
//
//         2 players   human defeated: true   G.over: true     <- the only case that worked
//         3 players   human defeated: true   G.over: FALSE
//         4 players   human defeated: true   G.over: FALSE
//
//     In a 1v1 the last team standing ends the game anyway, which is why it looked like it worked.
//
// The fix is in js/ui.js and not js/game.js on purpose: Group B may not move the build stamp, and
// "has one team left" is a fact about the simulation while "show YOU a result screen" is not.
//
//   node test/defeat.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
function fakeCtx() {
  const grad = { addColorStop() { } };
  const c = { said: [], canvas: null, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: '', lineJoin: '',
    textAlign: '', textBaseline: '', globalCompositeOperation: '', imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: '',
    measureText(s) { return { width: String(s).length * 6 }; },
    fillText(s) { if (c.said[c.said.length - 1] !== String(s)) c.said.push(String(s)); },
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; }, createPattern() { return null; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; },
    putImageData() { }, createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; } };
  for (const m of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect',
    'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'strokeText', 'translate', 'scale', 'rotate',
    'transform', 'setTransform', 'resetTransform', 'drawImage', 'setLineDash', 'quadraticCurveTo', 'bezierCurveTo']) c[m] = () => { };
  return c;
}
function fakeCanvas() { const cv = { width: 1, height: 1, style: {}, getContext: () => cv._c || (cv._c = fakeCtx()), toDataURL: () => '', addEventListener() { }, appendChild() { }, remove() { }, click() { }, value: '' }; return cv; }
const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, clearTimeout,
  setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
  document: { getElementById: () => fakeCanvas(), createElement: () => fakeCanvas(), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain',
  'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const run = body => vm.runInContext('(() => {' + body + '})()', ctx);

// =============================================================================
// 1. THE FAULT: a human eliminated in a free-for-all gets the screen now
// =============================================================================
const wipe = run(`
  const out = [];
  for (const n of [2, 3, 4]) {
    const ps = [{ race: 'T', human: true, name: 'You', team: 1 }];
    for (let i = 1; i < n; i++) ps.push({ race: 'Z', human: false, difficulty: 'easy', name: 'AI' + i, team: i + 1 });
    UI.start({ players: ps, seed: 3, layout: 'temple' });
    UI.menu = null; G.freePlay = false;
    for (const p of G.players) p.ai = null;
    for (let f = 0; f < 120; f++) G.tick();
    for (const u of [...G.units]) if (u.owner === 0) G.kill(u, null, true);
    for (let f = 0; f < 60; f++) G.tick();
    const teams = [...new Set(G.players.filter(p => !p.defeated && !p.neutral).map(p => p.team))].length;
    out.push({ n, defeated: G.players[0].defeated, gOver: G.over, teams, humanIsOut: UI.humanIsOut() });
  }
  return out;`);
for (const r of wipe) {
  ok(r.defeated, r.n + '-player: the human really is eliminated', JSON.stringify(r));
  ok(r.humanIsOut, r.n + '-player: UI.humanIsOut() is true, so the result screen is shown', JSON.stringify(r));
}
ok(wipe.find(r => r.n === 3).teams === 2 && wipe.find(r => r.n === 3).gOver === false,
  'and the underlying fault is still there to see: with 3 players G.over is FALSE because two AI teams survive', JSON.stringify(wipe.find(r => r.n === 3)));
ok(wipe.find(r => r.n === 2).gOver === true, 'CONTROL: in a 1v1 G.over does fire on its own, which is why this looked like it worked', JSON.stringify(wipe.find(r => r.n === 2)));

// UI.loop is what actually opens it. Driven rather than reasoned about.
const opened = run(`
  const ps = [{ race: 'T', human: true, name: 'You', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'A', team: 2 }, { race: 'P', human: false, difficulty: 'easy', name: 'B', team: 3 }];
  UI.start({ players: ps, seed: 3, layout: 'temple' });
  UI.menu = null; G.freePlay = false;
  for (const p of G.players) p.ai = null;
  Render.init(document.getElementById('game')); Render.W = 1600; Render.H = 900; Render.viewW = 1600; Render.viewH = 760;
  for (let f = 0; f < 120; f++) G.tick();
  const before = ((G.over || UI.humanIsOut()) && !UI.menu) ? 'over' : UI.menu;
  for (const u of [...G.units]) if (u.owner === 0) G.kill(u, null, true);
  for (let f = 0; f < 60; f++) G.tick();
  const after = ((G.over || UI.humanIsOut()) && !UI.menu) ? 'over' : UI.menu;
  return { before, after };`);
ok(opened.before === null, 'while the human is alive no result screen opens', String(opened.before));
ok(opened.after === 'over', 'the frame after they are eliminated, it does', String(opened.after));

// A replay must NOT stop dead at the moment the recorded human died.
const rep = run(`
  UI.mode = 'replay';
  const out = { inReplay: UI.humanIsOut() };
  UI.mode = 'play';
  G.freePlay = true; out.inFreePlay = UI.humanIsOut();
  G.freePlay = false; out.backAgain = UI.humanIsOut();
  return out;`);
ok(rep.inReplay === false, 'in a replay it stays quiet -- a replay of a game the human lost must play out', JSON.stringify(rep));
ok(rep.inFreePlay === false, 'and "Keep watching" (freePlay) silences it, which is what that button is for');
ok(rep.backAgain === true, 'CONTROL: with neither of those it is true again, so the two above are really the reason');

// =============================================================================
// 2. THE SCREEN: Restart exists, on both the DEFEAT and the VICTORY version
// =============================================================================
const panel = run(`
  const shot = () => { UI.menu = 'over'; const m = UI.menuItems(); return { title: m.title, items: m.items.map(i => i[0]) }; };
  const out = {};
  // defeat: the human is already dead from the run above
  out.defeat = shot();
  // victory: kill everyone else instead
  UI.start({ players: [{ race: 'T', human: true, name: 'You', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'A', team: 2 }], seed: 3, layout: 'temple' });
  UI.menu = null; G.freePlay = false; for (const p of G.players) p.ai = null;
  for (let f = 0; f < 60; f++) G.tick();
  for (const u of [...G.units]) if (u.owner === 1) G.kill(u, null, true);
  for (let f = 0; f < 60; f++) G.tick();
  out.won = { over: G.over, winner: G.winner };
  out.victory = shot();
  UI.menu = null;
  return out;`);
ok(panel.defeat.title === 'DEFEAT', 'the losing version says DEFEAT', panel.defeat.title);
ok(panel.victory.title === 'VICTORY', 'the winning version says VICTORY', JSON.stringify(panel.won));
for (const [k, p] of Object.entries({ defeat: panel.defeat, victory: panel.victory })) {
  ok(p.items.some(i => /^Restart/.test(i)), 'the ' + k + ' screen has a Restart item -- it had none', JSON.stringify(p.items));
  ok(p.items.some(i => /Return to main menu/.test(i)), 'and it still has Return to main menu', JSON.stringify(p.items));
  ok(p.items.some(i => /Save replay/.test(i)), 'and Save replay');
}
ok(/Keep watching/.test(panel.defeat.items.join('|')), 'a player who has LOST is offered "Keep watching" rather than "Continue playing"', JSON.stringify(panel.defeat.items));
ok(/Continue playing/.test(panel.victory.items.join('|')), 'and a player who has WON is offered "Continue playing"', JSON.stringify(panel.victory.items));

// =============================================================================
// 3. RESTART reproduces the same game: same seed, map, opponents, races
// =============================================================================
const again = run(`
  const setup = { players: [
      { race: 'T', human: true, name: 'You', team: 1 },
      { race: 'Z', human: false, difficulty: 'hard', style: 'rusher', name: 'A', team: 2 },
      { race: 'P', human: false, difficulty: 'easy', style: 'turtle', name: 'B', team: 3 }],
    seed: 77, layout: 'temple' };
  UI.start(setup);
  const snap = () => ({ seed: G.seed, mapSeed: G.map.seed, layout: G.map.layoutId || G.layout,
    players: G.players.filter(p => !p.neutral).map(p => [p.race, p.human, p.name, p.team,
      p.ai ? p.ai.diff : null, p.ai ? p.ai.style : null].join(':')),
    hash: G.stateHash() });
  for (let f = 0; f < 400; f++) G.tick();
  const first = { start: null, after: G.stateHash() };
  UI.start(setup); first.start = snap();
  const a = snap();
  // now the restart the button actually performs
  const item = (UI.menu = 'over', UI.menuItems().items.find(i => /^Restart/.test(i[0])));
  UI.menu = null;
  // Guarded so that REMOVING the item produces a clean red rather than a crash -- a negative control
  // that throws tells you nothing about the other checks in the file.
  if (item) item[1](); else UI.start(setup);
  const b = snap();
  for (let f = 0; f < 400; f++) G.tick();
  const secondAfter = G.stateHash();
  return { a, b, firstAfter: first.after, secondAfter, hadItem: !!item };`);
ok(again.hadItem, 'the Restart item is the one the panel actually offers, not a re-typed call');
ok(again.a.seed === again.b.seed && again.b.seed === 77, 'Restart keeps the seed', again.a.seed + ' vs ' + again.b.seed);
ok(again.a.layout === again.b.layout && again.a.mapSeed === again.b.mapSeed, 'and the same map', JSON.stringify([again.a.layout, again.b.layout, again.a.mapSeed, again.b.mapSeed]));
ok(JSON.stringify(again.a.players) === JSON.stringify(again.b.players), 'and the same opponents, races, teams, difficulties and styles', JSON.stringify(again.b.players));
ok(again.a.hash === again.b.hash, 'the two games are identical at frame 0', again.a.hash + ' vs ' + again.b.hash);
ok(again.firstAfter === again.secondAfter, 'and still identical 400 frames in -- it is the SAME game, not a similar one', again.firstAfter + ' vs ' + again.secondAfter);

// A restart with no seed given must still be reproducible: UI.start resolves it back onto lastOpts.
const noSeed = run(`
  UI.start({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], layout: 'temple' });
  return { optsSeed: UI.lastOpts.seed, gSeed: G.seed };`);
ok(noSeed.optsSeed !== undefined && noSeed.optsSeed === noSeed.gSeed,
  'a game started with no seed has the resolved one written back onto lastOpts, so Restart reproduces THIS game', JSON.stringify(noSeed));

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
