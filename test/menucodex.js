// The CODEX button on the main menu, which did nothing at all until 2026-09-09.
//
// Three separate things were in the way and none of them was visible from the button. UI.loop returns
// early unless `running`; `running` only becomes true when a match starts, so before the first game
// there was no render loop and nothing ever called Codex.draw. And #menu is `position:absolute;
// inset:0`, so even once the canvas was shown the menu painted a full-screen gradient over it.
//
// It is a state machine over two div display values and one flag, which is exactly the kind of thing
// that breaks silently and that nothing else here covers -- so it is tested as a state machine, with
// requestAnimationFrame stubbed. The one thing this cannot check is that a real browser paints; what
// it can check is that every path leaves the two divs consistent, which is what was actually wrong.
//   node test/menucodex.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');

// Divs that remember what was done to them, unlike the throwaway stubs the other UI tests use.
const divs = {};
const div = id => (divs[id] = divs[id] || { id, style: { display: id === 'menu' ? 'flex' : 'none' }, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] });
const rafQueue = [];
// A 2D context that records the calls made to it, so "did it paint" is answerable with no GPU. Shared
// by the main canvas and by every offscreen one HUD.panel bakes, because HUD.panel is on the codex's
// draw path and a null context there throws before anything can be asserted.
const calls = [];
const mkCtx = () => new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 800, height: 600 };
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() { } });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (typeof k === 'symbol') return undefined;
    return (...a) => { calls.push(k + ':' + a.slice(0, 4).join(',')); };
  },
  set(t, k, v) { calls.push('=' + String(k) + ':' + v); return true; },
});
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { },
  localStorage: { getItem() { return null; }, setItem() { } },
  document: { getElementById: div, createElement: () => ({ width: 0, height: 0, style: {}, addEventListener() { }, getContext: mkCtx }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' },
  __calls: calls, __mkCtx: mkCtx };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui', 'hud', 'codex']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

const r = vm.runInContext(`(() => {
  const out = {};
  const calls = __calls;
  Render.ctx = __mkCtx(); Render.W = 1280; Render.H = 720; Render.dpr = 1;
  Render.resize = () => { };                       // no real canvas to size

  const menu = document.getElementById('menu'), game = document.getElementById('game');
  out.atRest = { menu: menu.style.display, game: game.style.display, flag: !!UI.menuCodex, running: !!UI.running };

  UI.openCodexFromMenu();
  out.opened = { menu: menu.style.display, game: game.style.display, flag: !!UI.menuCodex, codex: Codex.isOpen() };

  // The loop must reach the codex BEFORE its \`running\` gate, or the whole thing is dead again.
  calls.length = 0;
  UI.loop(0);
  out.drewWhileNotRunning = { calls: calls.length, filled: calls.some(c => /fillRect/.test(c)), stillOpen: Codex.isOpen() };

  // ...and it must not call Render.frame, which reads a G that has not been created yet.
  let frameCalled = false; const realFrame = Render.frame; Render.frame = () => { frameCalled = true; };
  UI.loop(16); Render.frame = realFrame;
  out.neverDrawsTheWorld = !frameCalled;

  // Closing the codex -- by Escape, by F3, or by its own close button -- is what puts the menu back.
  Codex.close();
  UI.loop(32);
  out.closed = { menu: menu.style.display, game: game.style.display, flag: !!UI.menuCodex };

  // ...and one more frame after that must be a no-op, not a second restore or a throw.
  calls.length = 0; UI.loop(48);
  out.idleAfterClose = { calls: calls.length, menu: menu.style.display };

  // Starting a real game from the menu codex state must clear the flag, or the match would render
  // the manual over itself forever.
  UI.openCodexFromMenu(); UI.menuCodexWasSet = UI.menuCodex;
  UI.running = true; UI.menuCodex = false;   // what start() does
  out.startClears = { was: UI.menuCodexWasSet, now: !!UI.menuCodex };
  UI.running = false; Codex.close();
  UI.toMenu();
  out.toMenuClears = { flag: !!UI.menuCodex, menu: menu.style.display, game: game.style.display };
  return out;
})()`, ctx);

ok(r.atRest.menu === 'flex' && r.atRest.game === 'none', 'at rest the menu is shown and the canvas is not', JSON.stringify(r.atRest));
ok(!r.atRest.running, 'and no game is running, which is the whole reason this needed its own path');

ok(r.opened.menu === 'none', 'opening the codex HIDES the menu -- it is absolute inset:0 and would paint over the canvas', JSON.stringify(r.opened));
ok(r.opened.game === 'block', '...and shows the canvas', JSON.stringify(r.opened));
ok(r.opened.flag && r.opened.codex, '...and sets the flag the loop branches on', JSON.stringify(r.opened));

ok(r.drewWhileNotRunning.calls > 0, 'the loop draws the codex even though no game is running -- the bug was that it returned first', JSON.stringify(r.drewWhileNotRunning));
ok(r.drewWhileNotRunning.filled, '...including the background fill, so the canvas is not left transparent', JSON.stringify(r.drewWhileNotRunning));
ok(r.neverDrawsTheWorld, 'and it never calls Render.frame, which reads a G that does not exist yet');

ok(r.closed.menu === 'flex' && r.closed.game === 'none', 'closing the codex puts the menu back', JSON.stringify(r.closed));
ok(!r.closed.flag, '...and clears the flag');
ok(r.idleAfterClose.calls === 0 && r.idleAfterClose.menu === 'flex', 'a frame after that is a no-op, not a second restore', JSON.stringify(r.idleAfterClose));

ok(r.startClears.was && !r.startClears.now, 'starting a game clears the flag, or the match renders the manual over itself', JSON.stringify(r.startClears));
ok(!r.toMenuClears.flag && r.toMenuClears.menu === 'flex' && r.toMenuClears.game === 'none', 'and toMenu leaves both divs consistent whatever was open', JSON.stringify(r.toMenuClears));

console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
