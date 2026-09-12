// The simulation's clock, and the held-key guards: the two faults of the first internet game (fifth session).
//
// A page timer in a hidden tab -- or a window another window covers, which Chromium counts as hidden --
// fires once or twice a second. Measured in the desktop app's browser pane on 2026-09-12, the same tab and
// the same five hidden seconds: 10 simStep calls from setInterval, 312 messages from a Worker's setInterval
// (312 calls in five visible seconds). In a network game simStep ticks at most eight frames a call, so a host
// who had Alt-Tabbed fed the other player a burst of eight frames a second, which they saw as a freeze every
// second. And a key the page never saw released (keydown, then Alt-Tab: no keyup) kept the camera panning
// until it was pressed again. Both are pinned here through UI.makeTicker, UI.stopSim, UI.armFocusGuards and
// UI.scrollCam, with fake Workers and recorded timers so nothing waits on a real clock.
//   node test/ticker.js
'use strict';
const { makeCtx, ok, summary, root } = require('./_harness');
const fs = require('fs'), path = require('path'), vm = require('vm');
const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'render', 'ui', 'hud'];
const timers = () => { const T = { intervals: [], timeouts: [], cleared: [] }; T.setInterval = (fn, ms) => { T.intervals.push({ fn, ms }); return T.intervals.length; }; T.setTimeout = (fn, ms) => { T.timeouts.push({ fn, ms }); return T.timeouts.length; }; T.clearInterval = id => T.cleared.push(id); return T; };
class FakeWorker { constructor(url) { this.url = url; this.dead = false; FakeWorker.made.push(this); } postMessage() { } terminate() { this.dead = true; } }
FakeWorker.made = [];
const Blob = function (parts) { this.src = parts.join(''); }; const URL = { createObjectURL: b => 'blob:' + b.src };
const uiSrc = fs.readFileSync(path.join(root, 'js', 'ui.js'), 'utf8');

console.log('--- 1. the clock is a Worker where there is one, and its message drives the tick');
{
  const T = timers();
  const ctx = makeCtx({ tier: 'ui', files: FILES, globals: { Worker: FakeWorker, Blob, URL, setInterval: T.setInterval, setTimeout: T.setTimeout, clearInterval: T.clearInterval } });
  const calls = { n: 0 }; ctx.__tick = () => calls.n++;
  const t = vm.runInContext('UI.makeTicker(() => __tick(), 16)', ctx);
  ok(t.worker instanceof FakeWorker && /setInterval\(function \(\) \{ postMessage\(0\); \}, 16\)/.test(t.worker.url) && T.intervals.length === 0, 'with a Worker available the clock is a blob worker posting every 16 ms, and no page interval is made', JSON.stringify({ url: t.worker && t.worker.url, intervals: T.intervals.length }));
  t.worker.onmessage({}); t.worker.onmessage({});
  ok(calls.n === 2 && t.alive === true, 'each worker message runs the tick once', JSON.stringify({ n: calls.n, alive: t.alive }));
  ok(T.timeouts.length === 1 && T.timeouts[0].ms === 1000, 'a one-second watchdog is armed for a worker that never speaks', JSON.stringify(T.timeouts.map(x => x.ms)));
  T.timeouts[0].fn();
  ok(T.intervals.length === 0 && !t.worker.dead && t.id === 0, 'the watchdog leaves a live worker alone', JSON.stringify({ intervals: T.intervals.length, dead: t.worker.dead, id: t.id }));
  const w = t.worker; ctx.__t = t; vm.runInContext('UI.simTimer = __t; UI.stopSim()', ctx);
  ok(t.worker === null && w.dead && vm.runInContext('UI.simTimer', ctx) === null, 'stopSim terminates the worker and forgets the clock', JSON.stringify({ dead: w.dead }));
}
console.log('--- 2. a worker that never speaks, or errors, falls back to a page interval');
{
  const T = timers();
  const ctx = makeCtx({ tier: 'ui', files: FILES, globals: { Worker: FakeWorker, Blob, URL, setInterval: T.setInterval, setTimeout: T.setTimeout, clearInterval: T.clearInterval } });
  ctx.__tick = () => { };
  const t = vm.runInContext('UI.makeTicker(() => __tick(), 16)', ctx);
  const w = t.worker; T.timeouts[0].fn();
  ok(T.intervals.length === 1 && T.intervals[0].ms === 16 && t.id === 1 && w.dead && t.worker === null, 'silent for a second: a 16 ms page interval takes over and the worker is terminated', JSON.stringify({ intervals: T.intervals.length, id: t.id, dead: w.dead }));
  const t2 = vm.runInContext('UI.makeTicker(() => __tick(), 16)', ctx); const w2 = t2.worker; t2.worker.onerror({});
  ok(T.intervals.length === 2 && t2.id === 2 && w2.dead, 'a worker error falls back at once', JSON.stringify({ intervals: T.intervals.length, id: t2.id }));
  ctx.__t = t2; vm.runInContext('UI.simTimer = __t; UI.stopSim()', ctx);
  ok(T.cleared.includes(2), 'stopSim clears the fallback interval', JSON.stringify(T.cleared));
}
console.log('--- 3. no Worker at all (file://, the harness): a page interval, as before');
{
  const T = timers();
  const ctx = makeCtx({ tier: 'ui', files: FILES, globals: { setInterval: T.setInterval, setTimeout: T.setTimeout, clearInterval: T.clearInterval } });
  ctx.__tick = () => { };
  const t = vm.runInContext('UI.makeTicker(() => __tick(), 16)', ctx);
  ok(t.worker === null && t.id === 1 && T.intervals.length === 1 && T.timeouts.length === 0, 'without Worker the clock is setInterval and no watchdog is armed', JSON.stringify({ id: t.id, intervals: T.intervals.length, timeouts: T.timeouts.length }));
  ok(/this\.simTimer = this\.makeTicker\(\(\) => this\.simStep\(\), 1000 \/ 60\)/.test(uiSrc) && !/setInterval\(\(\) => this\.simStep\(\)/.test(uiSrc), 'start() makes the clock through makeTicker, and simStep is on no bare setInterval (static)');
}
console.log('--- 4. a key the page never saw released is forgotten when focus leaves, and not polled without focus');
{
  const ctx = makeCtx({ tier: 'ui', files: FILES });
  const L = { win: {}, doc: {} };
  ctx.__win = { addEventListener(t, f) { L.win[t] = f; } }; ctx.__doc = { hidden: false, addEventListener(t, f) { L.doc[t] = f; } };
  vm.runInContext('UI.armFocusGuards(__win, __doc)', ctx);
  ok(typeof L.win.blur === 'function' && typeof L.doc.visibilitychange === 'function', 'the guards listen for the window losing focus and the tab hiding', JSON.stringify(Object.keys(L.win).concat(Object.keys(L.doc))));
  vm.runInContext('UI.keys.ArrowDown = true; UI.mouse.inside = true', ctx); L.win.blur();
  ok(vm.runInContext('!UI.keys.ArrowDown && UI.mouse.inside === false', ctx), 'blur forgets a held arrow key and puts the mouse outside');
  vm.runInContext('UI.keys.ArrowDown = true', ctx); ctx.__doc.hidden = true; L.doc.visibilitychange();
  ok(vm.runInContext('!UI.keys.ArrowDown', ctx), 'the tab hiding forgets it too');
  ctx.__doc.hidden = false; vm.runInContext('UI.keys.ArrowDown = true', ctx); L.doc.visibilitychange();
  ok(vm.runInContext('UI.keys.ArrowDown === true', ctx), '...but the tab showing again does not touch a key held now');
  const r = vm.runInContext(`(() => { const out = {}; UI.clampCam = () => { }; Render.zoom = 1; Render.W = 800; Render.H = 600; Render.camX = 1000; Render.camY = 1000; UI.menu = null; UI.mouse = { x: 400, y: 300, inside: true };
    UI.keys = { ArrowDown: true }; document.hasFocus = () => false; UI.scrollCam(0.1); out.blurred = Render.camY - 1000;
    document.hasFocus = () => true; UI.scrollCam(0.1); out.focused = Render.camY - 1000;
    UI.keys = {}; UI.mouse = { x: 400, y: Render.H - 1, inside: true }; Render.camY = 1000; UI.scrollCam(0.1); out.edge = Render.camY - 1000;
    UI.mouse.inside = false; Render.camY = 1000; UI.scrollCam(0.1); out.edgeOutside = Render.camY - 1000; return out; })()`, ctx);
  ok(r.blurred === 0 && r.focused === 90, 'a held ArrowDown pans nothing without focus and 90 px per 0.1 s with it', JSON.stringify(r));
  ok(r.edge === 90 && r.edgeOutside === 0, 'the bottom edge pans while the mouse is inside the canvas and not once it has left (unchanged)', JSON.stringify(r));
  ok(/this\.armFocusGuards\(window, document\)/.test(uiSrc), 'init() arms the guards (static)');
}
summary();
