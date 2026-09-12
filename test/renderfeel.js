// The three render changes of this commit, checked as far as render code can be checked.
//   node test/renderfeel.js
//
// Drawing is not unit-testable in the usual sense -- there is no assertion that says "that reads as
// dangerous". So this file asserts the four things around the drawing that CAN fail silently, and each
// of them has failed silently in this repository before:
//
//  1. IT RUNS AT ALL, in every state. A draw path that throws once a cycle is invisible in a smoke test
//     and fatal in a game, and the sandstorm has three states (warning, active, calm) that each visit a
//     different branch. Every one is driven here against a recording canvas.
//  2. IT DRAWS SOMETHING, and only when it should. `drawHazard` on a map with no hazard must emit
//     nothing; on a hazard map it must emit ops in the warning and in the sweep. A feature that quietly
//     stops drawing looks exactly like a feature nobody noticed, which is what the sandstorm already
//     was for a milestone -- fully tested, fully wired, and completely invisible.
//  3. IT NEVER WRITES TO THE SIMULATION. G.stateHash() before and after thirty drawn frames, the
//     hazard's config compared byte for byte, and hazardState's own return value handed back FROZEN, so
//     any write from the renderer throws in strict mode rather than desyncing a network game later.
//  4. THE BUILD STAMP DOES NOT MOVE. Computed in a context with the render files loaded and in one
//     without, and required to be identical -- which is the invariant, rather than a hardcoded hash
//     that would go stale the next time anybody legitimately edits a sim file.
//
// And one measurement, because "legibility at scale" is a claim and claims get measured. See section 5.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (m, c, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined ? '  ' + x : '')); } };
const num = v => Math.round(v * 100) / 100;

// ============================================================================
// 0. A canvas that remembers what it was told to draw
// ============================================================================
// Everything the renderer touches, recording the ops that put pixels somewhere. It records arguments in
// USER space and does not track the transform, which is all sections 2 and 5 need; section 5 reads only
// the ellipses drawn by drawRims, and at that point the context carries the world translation, so those
// arguments are world coordinates.
const DRAWS = new Set(['drawImage', 'fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'putImageData', 'clearRect']);
function recorder() {
  // `grads` and the per-op state fields are FIXLIST-M14 B6. Softening an edge is a claim about
  // gradient stops and stroke widths, so the harness has to be able to see them: every recorded op now
  // carries the alpha, line width and style that were in force when it ran, and every gradient handed
  // out keeps its own stops. Both are purely additive -- `calls` and the op names are untouched, so
  // sections 2 and 5 read exactly what they always did.
  return { ops: [], grads: [], tag: null, on: false, calls: 0, reset() { this.ops.length = 0; this.grads.length = 0; this.calls = 0; } };
}
function mkCtx(cv, rec) {
  const grad = { addColorStop() { } };
  const c = {
    canvas: cv, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    globalAlpha: 1, globalCompositeOperation: 'source-over', font: '10px sans-serif', filter: 'none',
    imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: '#000', textAlign: 'start', textBaseline: 'alphabetic', miterLimit: 10, lineDashOffset: 0,
    createLinearGradient: () => { const g = { stops: [], addColorStop(o, col) { this.stops.push([o, col]); } }; if (rec.on) rec.grads.push(g); return g; },
    createRadialGradient: () => grad, createConicGradient: () => grad,
    createPattern: () => ({ setTransform() { } }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    measureText: t => ({ width: String(t).length * 6 }),
    isPointInPath: () => false, getLineDash: () => [], setLineDash() { },
  };
  for (const k of ['save', 'restore', 'setTransform', 'resetTransform', 'transform', 'translate', 'rotate', 'scale',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'quadraticCurveTo', 'bezierCurveTo',
    'clip', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'fillText', 'strokeText', 'putImageData']) {
    c[k] = function (...a) { if (rec.on) { if (DRAWS.has(k)) rec.calls++; rec.ops.push({ op: k, a, tag: rec.tag, ga: c.globalAlpha, lw: c.lineWidth, ss: String(c.strokeStyle), fs: typeof c.fillStyle === 'string' ? c.fillStyle : 'grad' }); } };
  }
  return c;
}
function mkCanvas(rec) {
  const cv = { width: 300, height: 150, style: {}, _ctx: null, isCanvas: true };
  cv.getContext = () => cv._ctx || (cv._ctx = mkCtx(cv, rec));
  cv.addEventListener = () => { }; cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: cv.width, height: cv.height });
  return cv;
}

const SIM = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot'];
const REN = ['terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'atlas', 'fx', 'render'];
const VIEW_W = 1280, VIEW_H = 700;

function mkCtx2(withRender) {
  const rec = recorder();
  const errors = [];
  const c = {
    console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0] && a[0].message || a[0])) },
    Math, performance, setTimeout, clearTimeout, setInterval, clearInterval, Image: function () { },
    addEventListener() { }, requestAnimationFrame() { }, devicePixelRatio: 1, innerWidth: VIEW_W, innerHeight: VIEW_H + 120,
    document: {
      getElementById: () => mkCanvas(rec), createElement: () => mkCanvas(rec),
      addEventListener() { }, hasFocus: () => false, body: { appendChild() { } },
    },
  };
  c.window = c; c.self = c; c.globalThis = c;
  vm.createContext(c);
  c._rec = rec; c._errors = errors;
  for (const f of SIM) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  if (withRender) {
    // A UI the renderer can read. js/ui.js owns the real one and drags in menus, input and a DOM; the
    // draw pass only ever reads these nine fields.
    vm.runInContext('var UI = { consoleH: 120, menu: null, mode: "play", placing: null, selection: [], hover: null, markers: [], drag: null, dragging: false, viewAll: true, currentCard: () => [], onUnitDied() {}, ping() {} };', c);
    for (const f of REN) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  }
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'build.js'), 'utf8'), c, { filename: 'build.js' });
  return c;
}
const R = (c, src) => vm.runInContext('(() => {' + src + '})();', c);
const ctx = mkCtx2(true);
const rec = ctx._rec;

// A game, a camera on the middle of it, and a renderer pinned to a fixed viewport so nothing here
// depends on the machine's screen.
const START = (layout, extra = '') => R(ctx, `
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, name: 'B' }], seed: 4, layout: '${layout}' });
  for (const p of G.players) p.ai = null;
  G.human = 0;
  Render.init(document.getElementById('game'));
  Render.W = ${VIEW_W}; Render.H = ${VIEW_H + 120}; Render.viewW = ${VIEW_W}; Render.viewH = ${VIEW_H}; Render.dpr = 1;
  Render.reset(); Render.built = false;
  Render.camX = G.map.w * TILE / 2 - ${VIEW_W} / 2; Render.camY = G.map.h * TILE / 2 - ${VIEW_H} / 2;
  ${extra}
  return { layout: G.map.layout, hazard: !!G.map.hazard, w: G.map.w };
`);

// ============================================================================
// 1. The new entry points exist
// ============================================================================
const present = R(ctx, `
  const t = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v]));
  return { r: t({ drawHazard: Render.drawHazard, drawStorm: Render.drawStorm, drawStormWarn: Render.drawStormWarn,
                  hazeLayer: Render.hazeLayer, dustTile: Render.dustTile, tickMotion: Render.tickMotion,
                  massOf: Render.massOf, drawRims: Render.drawRims, rimCol: Render.rimCol }),
           f: t({ track: FX.track, drawTracks: FX.drawTracks, dust: FX.dust, wind: FX.wind }) };
`);
ok('the new draw entry points exist on Render', Object.values(present.r).every(v => v === 'function'), JSON.stringify(present.r));
ok('the new effect entry points exist on FX', Object.values(present.f).every(v => v === 'function'), JSON.stringify(present.f));

// ============================================================================
// 2. The sandstorm: every phase draws, and only when it should
// ============================================================================
// The phases are taken from the hazard's own numbers rather than from constants copied into this file,
// so retuning `warn` or `sweep` in js/map.js cannot make this test lie.
START('dustbowl');
// The camera is put ON the front for the sweep frames. That is not a convenience: the front is a band a
// few tiles deep crossing a 192-tile map, so for most of a sweep it is nowhere near any given camera,
// and a test that left the camera at the map's centre would be measuring the early-out and calling it
// the storm.
const phases = R(ctx, `
  const h = G.map.hazard, period = h.warn + h.sweep + h.calm, home = G.map.w * TILE / 2 - ${VIEW_W} / 2;
  const at = { warnEarly: 10, warnLate: h.warn - 10, enter: h.warn + 60,
               mid: h.warn + Math.floor(h.sweep / 2), leave: h.warn + h.sweep - 60, calm: h.warn + h.sweep + 100 };
  const out = {};
  for (const [k, f] of Object.entries(at)) {
    G.frame = f;
    const s = G.map.hazardState(f);
    // centre the view on the band when there is one, else leave it in the middle of the map
    Render.camX = s.active ? (s.t0 + s.t1) / 2 * TILE - ${VIEW_W} / 2 : home;
    _rec.reset(); _rec.on = true; _rec.tag = 'haz';
    let threw = null; try { Render.drawHazard(Render.ctx); } catch (e) { threw = String(e && e.message || e); }
    _rec.on = false;
    out[k] = { calls: _rec.calls, threw, active: s.active, warning: s.warning, t0: +s.t0.toFixed(1), t1: +s.t1.toFixed(1), dir: s.dir };
  }
  // The whole cycle, one frame in twenty, with the camera following the front: no branch anywhere in it
  // may throw, and the pass must draw in exactly the frames the hazard says are its own.
  let threw = null, drewWhenItShould = 0, drewWhenItShouldNot = 0, shouldHave = 0;
  for (let f = 0; f < period; f += 20) {
    G.frame = f;
    const s = G.map.hazardState(f);
    Render.camX = s.active ? (s.t0 + s.t1) / 2 * TILE - ${VIEW_W} / 2 : home;
    _rec.reset(); _rec.on = true;
    try { Render.drawHazard(Render.ctx); } catch (e) { if (!threw) threw = 'frame ' + f + ': ' + (e && e.message || e); }
    _rec.on = false;
    const want = s.active || s.warning; if (want) shouldHave++;
    if (_rec.calls && want) drewWhenItShould++; else if (_rec.calls && !want) drewWhenItShouldNot++;
  }
  Render.camX = home;
  return { out, sweep: { threw, drewWhenItShould, drewWhenItShouldNot, shouldHave, of: Math.ceil(period / 20) }, period };
`);
const P = phases.out, SW = phases.sweep;
ok('the storm draws in every phase without throwing', Object.values(P).every(v => v.threw === null), JSON.stringify(Object.entries(P).filter(([, v]) => v.threw).slice(0, 2)));
ok('the warning draws a tell, early and late', P.warnEarly.calls > 0 && P.warnLate.calls > 0 && P.warnEarly.warning && P.warnLate.warning,
  JSON.stringify({ early: P.warnEarly.calls, late: P.warnLate.calls }));
ok('the front draws as it enters, crosses and leaves', P.enter.calls > 0 && P.mid.calls > 0 && P.leave.calls > 0 && P.mid.active,
  JSON.stringify({ enter: P.enter.calls, mid: P.mid.calls, leave: P.leave.calls }));
ok('the calm draws nothing at all', P.calm.calls === 0 && !P.calm.active && !P.calm.warning, JSON.stringify(P.calm));
ok('nothing throws anywhere in a full cycle', SW.threw === null, String(SW.threw));
ok('it draws in every frame the hazard calls its own (' + SW.drewWhenItShould + '/' + SW.shouldHave + ')', SW.drewWhenItShould === SW.shouldHave, JSON.stringify(SW));
ok('and in none of the frames it does not', SW.drewWhenItShouldNot === 0, JSON.stringify(SW));

// The early-out is what keeps a sweep on the far side of a 192-tile map free, and it is the difference
// between this pass costing nothing for four fifths of a cycle and costing something all the way through.
const offCam = R(ctx, `
  const h = G.map.hazard;
  G.frame = h.warn + Math.floor(h.sweep / 2);
  const s = G.map.hazardState(G.frame), mid = (s.t0 + s.t1) / 2 * TILE;
  Render.camX = mid + 80 * TILE;                       // eighty tiles behind the front
  _rec.reset(); _rec.on = true; Render.drawHazard(Render.ctx); _rec.on = false; const away = _rec.calls;
  Render.camX = mid - ${VIEW_W} / 2;
  _rec.reset(); _rec.on = true; Render.drawHazard(Render.ctx); _rec.on = false; const onIt = _rec.calls;
  Render.camX = G.map.w * TILE / 2 - ${VIEW_W} / 2;
  return { away, onIt, active: s.active };
`);
ok('a sweep the camera is not looking at costs nothing', offCam.away === 0 && offCam.onIt > 0, JSON.stringify(offCam));

// ============================================================================
// 2b. The edges are SOFT -- FIXLIST-M14 B6
// ============================================================================
// Reported as "the dust storm has hard edges -- dither or blend them so it looks like a real storm
// starting and tapering off". Two separate hardnesses, and both are measured here rather than looked at:
//
//   * the LEADING edge went from nothing to 86% opacity across zero distance, because the gradient's
//     first stop sat exactly on the clip boundary. It now starts a feather AHEAD of the wall at zero.
//     (The trailing edge was already soft: its gradient reaches zero at the boundary.)
//   * the whole pass ran at FULL STRENGTH from the first frame of the sweep to the last, so a player at
//     the far edge saw a wall switch on. Render.stormAmp now ramps it in and out.
//
// The curve first, on its own, because it is arithmetic and cheap to pin.
const amp = R(ctx, `
  const f = t => Render.stormAmp(t);
  const at = {};
  for (const t of [0, 0.02, 0.07, 0.14, 0.3, 0.5, 0.7, 0.86, 0.93, 0.98, 1]) at[t] = f(t);
  // monotone up over the first ramp, monotone down over the last, and symmetric
  let upOk = true, downOk = true, sym = true;
  for (let i = 1; i <= 50; i++) { const a = f((i - 1) / 100), b = f(i / 100); if (b < a) upOk = false; }
  for (let i = 51; i <= 100; i++) { const a = f((i - 1) / 100), b = f(i / 100); if (b > a) downOk = false; }
  for (let i = 0; i <= 50; i++) { if (Math.abs(f(i / 100) - f(1 - i / 100)) > 1e-9) sym = false; }
  // and it is a pure function: no state, called in any order
  const fwd = [], back = [];
  for (let i = 0; i <= 20; i++) fwd.push(f(i / 20));
  for (let i = 20; i >= 0; i--) back.unshift(f(i / 20));
  return { at, upOk, downOk, sym, pure: JSON.stringify(fwd) === JSON.stringify(back), ramp: Render.HAZE_RAMP, feather: Render.HAZE_FEATHER };
`);
ok('the storm ramps from nothing at the start of a sweep to nothing at the end', amp.at[0] === 0 && amp.at[1] === 0, JSON.stringify([amp.at[0], amp.at[1]]));
ok('and reaches full strength in the middle', amp.at[0.5] === 1, String(amp.at[0.5]));
ok('rising over the first ' + Math.round(amp.ramp * 100) + '% and falling over the last, monotonically', amp.upOk && amp.downOk, JSON.stringify([amp.upOk, amp.downOk]));
ok('symmetrically, and with no corner at either end (smoothstep, not a straight line)',
  amp.sym && amp.at[0.07] > 0 && amp.at[0.07] < 1 && Math.abs(amp.at[0.07] - 0.5) < 0.2, JSON.stringify([amp.sym, amp.at[0.07]]));
ok('stormAmp is a pure function of t, in any call order', amp.pure);
ok('the feather is a real distance, not zero', amp.feather >= 24, String(amp.feather));

// Then the front as actually drawn: the gradient stops, the rim strokes, and the composite alpha.
const soft = R(ctx, `
  const h = G.map.hazard;
  const shot = t => {
    G.frame = h.warn + Math.round(t * (h.sweep - 1));
    const s = G.map.hazardState(G.frame), mid = (s.t0 + s.t1) / 2 * TILE;
    Render.camX = mid - ${VIEW_W} / 2; Render.camY = G.map.h * TILE / 2 - ${VIEW_H} / 2;
    _rec.reset(); _rec.on = true; Render.drawHazard(Render.ctx); _rec.on = false;
    // the front's body gradient is the one with the most stops
    let body = null;
    for (const g of _rec.grads) if (!body || g.stops.length > body.stops.length) body = g;
    // the rim: the strokes drawn AFTER the clip is released, widest first
    const strokes = _rec.ops.filter(o => o.op === 'stroke').map(o => ({ lw: o.lw, ga: o.ga, ss: o.ss }));
    // the composite: the last drawImage of the haze buffer onto the scene
    const imgs = _rec.ops.filter(o => o.op === 'drawImage');
    const composite = imgs.length ? imgs[imgs.length - 1].ga : null;
    return { t, stops: body ? body.stops.slice() : null, strokes, composite, active: s.active, calls: _rec.calls };
  };
  const out = { mid: shot(0.5), early: shot(0.02), late: shot(0.98) };
  // and the same frame twice, to prove nothing accumulated
  const a = shot(0.5), b = shot(0.5);
  out.same = JSON.stringify(a) === JSON.stringify(b);
  Render.camX = G.map.w * TILE / 2 - ${VIEW_W} / 2;
  return out;
`);
// The last number in an rgba(...) string. Written by hand rather than with a regex because the storm's
// colours are built by Render.dustRGB and the exact spacing is its business, not this file's.
const alphaOf = col => { const s = String(col); const i = s.lastIndexOf(','); if (i < 0) return null; const v = parseFloat(s.slice(i + 1)); return isNaN(v) ? null : v; };
ok('the front has a multi-stop gradient across its depth', soft.mid.stops && soft.mid.stops.length >= 6, JSON.stringify(soft.mid.stops && soft.mid.stops.length));
{ const st = soft.mid.stops;
  ok('THE LEADING EDGE STARTS AT ZERO OPACITY -- it used to start at 0.86, which is the reported hard edge',
    st[0][0] === 0 && alphaOf(st[0][1]) === 0, JSON.stringify(st[0]));
  ok('...and climbs through the feather before it reaches the wall',
    alphaOf(st[1][1]) > 0 && alphaOf(st[1][1]) < 0.5 && st[1][0] > 0 && st[1][0] < st[2][0], JSON.stringify(st.slice(0, 3)));
  ok('the trailing edge still reaches zero, as it always did', alphaOf(st[st.length - 1][1]) === 0, JSON.stringify(st[st.length - 1]));
  ok('and the stops are in order, which a remap can easily break', st.every((s, i) => i === 0 || s[0] >= st[i - 1][0]), JSON.stringify(st.map(s => s[0]))); }
{ const rims = soft.mid.strokes.filter(s => s.lw >= 4);
  ok('the lit rim is drawn as three strokes rather than one 8 px line', rims.length >= 3, JSON.stringify(soft.mid.strokes));
  // Guarded, so that reverting the rim to one stroke gives a clean red here rather than a crash that
  // takes the rest of the file with it -- a negative control that throws tells you nothing.
  const wide = rims.slice(-3), got = wide.length === 3;
  ok('widest first, narrowing inward', got && wide[0].lw > wide[1].lw && wide[1].lw > wide[2].lw, JSON.stringify(wide.map(s => s.lw)));
  ok('and faintest first, so the outer edge of the glow is the one nobody can point at',
    got && alphaOf(wide[0].ss) < alphaOf(wide[1].ss) && alphaOf(wide[1].ss) < alphaOf(wide[2].ss), JSON.stringify(wide.map(s => s.ss))); }
ok('the haze layer is composited in all three phases',
  soft.early.composite !== null && soft.late.composite !== null && soft.mid.composite !== null,
  JSON.stringify([soft.early.composite, soft.mid.composite, soft.late.composite]));
ok('THE STORM GATHERS AND THINS: the composite alpha is lower at both ends of the sweep than in the middle',
  soft.early.composite < soft.mid.composite && soft.late.composite < soft.mid.composite,
  JSON.stringify({ early: soft.early.composite, mid: soft.mid.composite, late: soft.late.composite }));
ok('drawing the same frame twice produces the identical ops -- nothing accumulates, so a seek reproduces it', soft.same);

// A map with no hazard must be untouched by any of this.
START('temple');
const plain = R(ctx, `
  _rec.reset(); _rec.on = true;
  let threw = null; try { for (let i = 0; i < 3; i++) Render.drawHazard(Render.ctx); } catch (e) { threw = String(e); }
  _rec.on = false;
  return { calls: _rec.calls, threw, hazard: G.map.hazard, wind: FX.wind() };
`);
ok('a map with no hazard draws no weather and asks for no wind', plain.calls === 0 && plain.threw === null && plain.hazard === null && plain.wind === null, JSON.stringify(plain));

// ============================================================================
// 3. Weight: the spring moves, and it comes back to rest
// ============================================================================
// Not "does it look heavy" -- what is checkable is that the settle is real (a stopping tank is displaced
// from where the simulation says it is), that it is bounded, that it decays to nothing, and that a
// heavy unit is displaced more than a light one, which is the entire point of having a mass at all.
START('temple');
const weight = R(ctx, `
  const cx = G.map.w * TILE / 2, cy = G.map.h * TILE / 2;
  const spawn = (id, dx) => { const u = G.spawnUnit(id, 0, cx + dx, cy); u.px = u.x; u.py = u.y; return u; };
  const tank = spawn('siege_tank', -60), marine = spawn('marine', 60);
  const pitchOf = u => { const s = Render.motion.get(u.id); return s ? s.p : 0; };
  const goal = { x: cx, y: cy + 400 };
  for (const u of [tank, marine]) u.applyOrder({ type: 'move', x: goal.x, y: goal.y });
  const trail = { tank: [], marine: [] };
  let maxTrack = 0;
  for (let f = 0; f < 60; f++) {
    G.tick();
    Render.frame(0);
    trail.tank.push(pitchOf(tank)); trail.marine.push(pitchOf(marine));
    maxTrack = Math.max(maxTrack, FX.tracks.length);
    if (f === 24) for (const u of [tank, marine]) u.stop();     // brakes on, mid-run
  }
  const start = { tank: trail.tank.slice(0, 20), marine: trail.marine.slice(0, 20) };
  const stopT = trail.tank.slice(25, 45), stopM = trail.marine.slice(25, 45);
  const rest = trail.tank.slice(-6);
  return {
    startLagTank: Math.min(...start.tank), startLagMarine: Math.min(...start.marine),
    stopKickTank: Math.max(...stopT), stopKickMarine: Math.max(...stopM),
    settled: Math.max(...rest.map(Math.abs)),
    bound: Math.max(...trail.tank.map(Math.abs)),
    cap: Render.massOf(tank.def) * 3.4,
    tracks: maxTrack, entries: Render.motion.size, moved: Math.round(tank.y - cy),
  };
`);
ok('a heavy unit lags behind itself when it starts (' + num(weight.startLagTank) + ' px)', weight.startLagTank < -0.5, JSON.stringify(weight));
ok('and lurches forward when it stops (' + num(weight.stopKickTank) + ' px)', weight.stopKickTank > 0.5, JSON.stringify(weight));
ok('a marine, which weighs nothing, barely does either', Math.abs(weight.startLagMarine) < Math.abs(weight.startLagTank) * 0.6 && Math.abs(weight.stopKickMarine) < Math.abs(weight.stopKickTank) * 0.6,
  JSON.stringify({ tank: [num(weight.startLagTank), num(weight.stopKickTank)], marine: [num(weight.startLagMarine), num(weight.stopKickMarine)] }));
ok('the settle rings down to rest rather than oscillating for ever (' + num(weight.settled) + ' px)', weight.settled < 0.35, String(weight.settled));
ok('and it is bounded by the mass clamp, so nothing ever separates from its own shadow', weight.bound <= weight.cap + 1e-9, weight.bound + ' vs ' + weight.cap);
ok('a tracked vehicle leaves ground marks while it moves', weight.tracks > 0, String(weight.tracks));

// The track buffer is a ring and must never grow past its cap however long the battle runs.
const trackCap = R(ctx, `
  for (let i = 0; i < 4000; i++) FX.track(i, i, 0.3, 6, 8);
  const n = FX.tracks.length;
  _rec.reset(); _rec.on = true; FX.drawTracks(Render.ctx, () => true); _rec.on = false;
  return { n, cap: FX.TRACK_MAX, calls: _rec.calls };
`);
ok('four thousand tracks fit in a fixed ring buffer of ' + trackCap.cap, trackCap.n === trackCap.cap, String(trackCap.n));
ok('and cost three draw calls to draw, not one per mark', trackCap.calls <= 3, String(trackCap.calls));

// ============================================================================
// 4. Four hundred units on screen: it runs, and it stays inside its call budget
// ============================================================================
// Four hundred units at the density the SIMULATION puts them at, not on a grid: spawned into a ball and
// then left to G.separate() for a second, which is what a converging 200-supply fight looks like. The
// arrangement matters for section 5 -- units on a lattice do not occlude each other and would make the
// legibility question answer itself.
const PACK = `
  const ARMY = ['marine', 'firebat', 'medic', 'siege_tank', 'vulture', 'goliath', 'wraith', 'zergling', 'hydralisk', 'ultralisk'];
  const cx = Render.camX + ${VIEW_W} / 2, cy = Render.camY + ${VIEW_H} / 2;
  for (let i = 0; i < 400; i++) {
    const a = i * 2.39996, rr = Math.sqrt(i / 400) * 9 * TILE;      // a sunflower disc, so the ball is even
    const t = G.map.findFreeTile(Math.floor((cx + Math.cos(a) * rr) / TILE), Math.floor((cy + Math.sin(a) * rr) / TILE), 14);
    if (!t) continue;
    const u = G.spawnUnit(ARMY[i % ARMY.length], i % 2, (t[0] + .5) * TILE, (t[1] + .5) * TILE);
    u.px = u.x; u.py = u.y; u.facing = (i % 16) / 16 * Math.PI * 2;
    if (i % 5 === 0) u.hp = u.maxHp * 0.2;                 // a fifth of the field is nearly dead
    if (i % 3 === 0) u.lastFire = G.frame;                 // and a third of it is shooting
  }
  for (let f = 0; f < 24; f++) G.tick();                   // let separation settle them into a real ball
  G.rebuildGrid(); G.updateVision();
`;
START('temple', PACK);
const scale = R(ctx, `
  Render.frame(0);                       // warm: terrain chunks and sprite canvases bake on the first frame
  const countFrame = () => { _rec.reset(); _rec.on = true; Render.frame(0); _rec.on = false; return _rec.calls; };
  const frameA = countFrame(), frameB = countFrame();   // two identical frames: the noise floor of this count
  // The rim pass on its own, against the same list the draw pass would hand it. Measured directly
  // rather than as a difference of two whole frames, because a whole frame carries live particles and
  // a difference of two of those measures the weather as much as the pass under test.
  const list = G.units.filter(u => u.alive && !u.inside && u._x !== undefined);
  _rec.reset(); _rec.on = true; Render.drawRims(Render.ctx, list); _rec.on = false;
  const rimCalls = _rec.calls, rimOps = _rec.ops.length;
  let threw = null;
  try { for (let i = 0; i < 5; i++) { G.tick(); Render.frame(0.5); } } catch (e) { threw = String(e && e.stack || e); }
  return { frameA, frameB, rimCalls, rimOps, list: list.length, players: G.players.length, drawn: G.units.filter(u => u.alive).length, threw };
`);
ok('four hundred units draw without throwing', scale.threw === null, String(scale.threw).slice(0, 300));
ok('a whole frame at ' + scale.list + ' units is ' + scale.frameA + ' draw calls', scale.frameA > 500, JSON.stringify(scale));
ok('and the rim pass is ' + scale.rimCalls + ' of them -- one per player plus one, not one per unit',
  scale.rimCalls <= scale.players + 2 && scale.rimOps > scale.list, JSON.stringify(scale));

// ============================================================================
// 5. The measurement: how much of a 400-unit battle can you actually read
// ============================================================================
// The claim under test is "a battle stays readable at scale", and the failure it is about is that a
// unit in the middle of a crowd is painted over by everything in front of it. So: paint the field in
// the renderer's own z-order onto a one-pixel grid and count how many units still own enough of the
// final image to be identified.
//
// The one number this needs and cannot read off the code is HOW BIG A UNIT IS DRAWN. Its collision
// radius is exact -- separation packed the ball to it until units kept their bodies apart instead (G.separate,
// DATA's BODY table, which is that overhang measured) -- but drawn art overhangs the footprint
// (that overhang is the whole reason ART_SCALE exists), and units packed to touching footprints occlude
// each other exactly as much as their art overhangs and not one pixel more. Picking a single overhang
// factor would be picking the answer, so the table below sweeps it from 1.0 (art exactly the footprint,
// where by construction nothing can occlude anything) to 2.0, and the claim has to hold across all of
// it. The rims are not modelled at all: they are the ellipses drawRims really emitted this frame, read
// back off the recording canvas, so the delta at every row is the rim pass and nothing else.
const legible = R(ctx, `
  // the units the draw pass actually drew, in the order it drew them
  const list = [];
  for (const u of G.units) {
    if (!u.alive || u.inside || u.isBuilding) continue;
    if (u._x === undefined) continue;
    list.push(u);
  }
  list.sort((a, b) => (a.fly - b.fly) || (a._y - b._y));
  // record just the rim pass
  _rec.reset(); _rec.on = true; _rec.tag = 'rim';
  Render.drawRims(Render.ctx, list);
  _rec.on = false;
  const rims = _rec.ops.filter(o => o.op === 'ellipse').map(o => ({ x: o.a[0], y: o.a[1], rx: o.a[2], ry: o.a[3] }));
  return { list: list.map((u, i) => ({ i, x: u._x, y: u._y, r: u.r, owner: u.owner, fly: !!u.fly })), rims, camX: Render.camX, camY: Render.camY };
`);
{
  const W = VIEW_W, H = VIEW_H, buf = new Int16Array(W * H), N = legible.list.length;
  const paintDisc = (cx, cy, r, tag) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= r * r) buf[y * W + x] = tag; }
  };
  const paintRing = (cx, cy, rx, ry, tag) => {
    const n = Math.max(24, Math.ceil((rx + ry) * 4));
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry); if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = tag; }
  };
  // Match each recorded rim back to the unit it was drawn around, by its centre. Done once: the same
  // matching serves every row of the table.
  const owned = [], hasRim = new Set();
  for (const e of legible.rims) {
    let best = -1, bd = 4;
    for (const u of legible.list) { const d = Math.abs(u.x - e.x) + Math.abs(u.y + (u.fly ? 0 : u.r * 0.4) - e.y); if (d < bd) { bd = d; best = u.i; } }
    if (best >= 0) { owned.push({ e, i: best }); hasRim.add(best); }
  }
  const score = () => {
    const seen = new Map();
    for (let i = 0; i < buf.length; i++) { const t = buf[i]; if (t) seen.set(t, (seen.get(t) || 0) + 1); }
    const MIN = 12;   // px of surviving image: below about this a patch of colour is not read as a unit
    let id = 0, area = 0;
    for (const u of legible.list) { const n = seen.get(u.i + 1) || 0; area += n; if (n >= MIN) id++; }
    return { id, pct: Math.round(id / N * 1000) / 10, meanArea: Math.round(area / N) };
  };
  const run = (art, rims) => {
    buf.fill(0);
    for (const u of legible.list) paintDisc(u.x - legible.camX, u.y - legible.camY, u.r * art, u.i + 1);
    if (rims) for (const o of owned) paintRing(o.e.x - legible.camX, o.e.y - legible.camY, o.e.rx, o.e.ry, o.i + 1);
    const s = score();
    let cov = 0; for (let i = 0; i < buf.length; i++) if (buf[i]) cov++;
    s.cov = Math.round(cov / buf.length * 100);
    let want = 0; for (const u of legible.list) want += Math.PI * (u.r * art) ** 2;
    s.painted = Math.round(cov / want * 100);   // how much of what was painted survived being painted over
    return s;
  };
  console.log('  legibility: ' + N + ' units in a ball settled by the simulation\'s own separation, ' + W + 'x' + H + ', painted in the renderer\'s own z-order');
  console.log('  art/foot  screen covered  survived painting  identifiable before        after       mean px');
  const rows = [];
  for (const art of [1, 1.25, 1.5, 1.75, 2]) {
    const b = run(art, false), a = run(art, true);
    rows.push({ art, b, a });
    console.log('    x' + art.toFixed(2) + '        ' + String(b.cov + '%').padStart(6) + '          ' + String(b.painted + '%').padStart(6) + '      ' +
      String(b.id + '/' + N).padStart(8) + ' (' + String(b.pct).padStart(5) + '%) ' + String(a.id + '/' + N).padStart(8) + ' (' + String(a.pct).padStart(5) + '%)  ' +
      String(b.meanArea).padStart(4) + ' -> ' + a.meanArea);
  }
  const worst = rows[rows.length - 1];
  ok('every unit on screen got a rim (' + hasRim.size + ' of ' + N + ', from ' + legible.rims.length + ' ellipses -- the extra ones are the wounded halo)',
    hasRim.size >= N * 0.95, hasRim.size + ' / ' + N);
  // The rim's job is to give back what occlusion took, so that is what this measures. It used to demand a ten-point gain,
  // which was the same claim while the ball was packed to collision footprints (88% -> 100% at x2.00). Units keep their
  // BODIES apart now (G.separate, seventh session item 1) and the same ball is 93.5% identifiable before any rim, so a
  // fixed gain would be measuring the ball: nine in ten of the units occlusion made unreadable must be readable again.
  const lost = 100 - worst.b.pct, back = worst.a.pct - worst.b.pct;
  ok('at the densest reading of the art the rim recovers ' + worst.b.pct + '% -> ' + worst.a.pct + '% identifiable (' + back.toFixed(1) + ' of the ' + lost.toFixed(1) + ' points occlusion took)',
    lost > 0 && back >= lost * 0.9, JSON.stringify(worst));
  ok('and at no overhang factor does it take anything away', rows.every(r => r.a.id >= r.b.id && r.a.meanArea >= r.b.meanArea),
    JSON.stringify(rows.map(r => [r.art, r.b.id, r.a.id])));
  ok('the rim is visible even where the sprite is entirely buried', rows.every(r => r.a.pct >= 99), JSON.stringify(rows.map(r => [r.art, r.a.pct])));
}

// The rim is density-gated, so a small skirmish has to look exactly as it did before.
const gate = R(ctx, `
  const keep = G.units.filter(u => u.alive && !u.isBuilding).slice(0, 20);
  for (const u of G.units) if (!u.isBuilding && !keep.includes(u)) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive); G.rebuildGrid(); G.updateVision();
  Render.frame(0);
  const list = G.units.filter(u => u.alive && !u.isBuilding && u._x !== undefined);
  _rec.reset(); _rec.on = true; Render.drawRims(Render.ctx, list); _rec.on = false;
  return { n: list.length, calls: _rec.calls, on: 80 };
`);
ok('with ' + gate.n + ' units on screen the rim does not draw at all', gate.calls === 0, JSON.stringify(gate));

// ============================================================================
// 6. The renderer never writes to the simulation
// ============================================================================
// The strongest form of this available here: run the sim, draw thirty frames in the middle of it, and
// require the state hash to be untouched -- then keep simulating and require the same hash the run
// would have had if nothing had ever been drawn.
const purity = R(ctx, `
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 11, layout: 'dustbowl' });
  G.human = 0;
  Render.W = ${VIEW_W}; Render.H = ${VIEW_H + 120}; Render.viewW = ${VIEW_W}; Render.viewH = ${VIEW_H}; Render.dpr = 1;
  Render.reset(); Render.built = false;
  Render.camX = 0; Render.camY = 0;
  for (let f = 0; f < 600; f++) G.tick();
  const before = G.stateHash(), hazBefore = JSON.stringify(G.map.hazard);
  // hazardState handed back frozen: a renderer that wrote to it throws, because every render file is
  // in strict mode. Also counts the asks, so "the renderer never looks" cannot pass as "never writes".
  const real = G.map.hazardState.bind(G.map); let asked = 0;
  G.map.hazardState = f => { asked++; return Object.freeze(real(f)); };
  let threw = null;
  try { for (let i = 0; i < 30; i++) { Render.frame(i / 30); G.frame; } } catch (e) { threw = String(e && e.message || e); }
  const after = G.stateHash(), hazAfter = JSON.stringify(G.map.hazard);
  G.map.hazardState = real;
  for (let f = 0; f < 200; f++) G.tick();
  const drawnRun = G.stateHash();
  return { before, after, hazBefore, hazAfter, asked, threw, drawnRun, frame: G.frame };
`);
const control = R(ctx, `
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 11, layout: 'dustbowl' });
  for (let f = 0; f < 800; f++) G.tick();
  return { hash: G.stateHash(), frame: G.frame };
`);
ok('drawing thirty frames does not throw', purity.threw === null, String(purity.threw));
ok('the renderer does ask the hazard what it is doing (' + purity.asked + ' asks in 30 frames)', purity.asked >= 30, String(purity.asked));
ok('and it never writes to the frozen answer it gets back', purity.threw === null && purity.before === purity.after, purity.before + ' vs ' + purity.after);
ok('the hazard config is untouched by drawing it', purity.hazBefore === purity.hazAfter);
ok('and a game that was drawn re-simulates to the same state as one that was not', purity.drawnRun === control.hash, purity.drawnRun + ' vs ' + control.hash);

// The static half of the same claim: nothing in the render files assigns to the hazard or its state.
for (const f of ['render', 'fx', 'terrain']) {
  const src = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
  const bad = src.match(/hazard\w*\s*=[^=]|\.hazard\s*\[/g);
  ok('js/' + f + '.js contains no assignment to anything named hazard', !bad, bad && bad.join(' | '));
}

// ============================================================================
// 7. The build stamp does not move for render code
// ============================================================================
// Invariant 6. Asserted as the invariant rather than against a hardcoded hash, because a hardcoded one
// goes stale the moment somebody legitimately edits a sim file -- and three agents are editing sim
// files this milestone.
const bare = mkCtx2(false);
const hBare = R(bare, 'return BUILD.hash();');
const hFull = R(ctx, 'return BUILD.hash();');
ok('the build stamp is the same with the render files loaded and without: ' + hBare, hBare === hFull, hBare + ' vs ' + hFull);
ok('and it is a 16-character hash', /^[0-9a-f]{16}$/.test(hBare), hBare);
ok('no simulation errors were logged while drawing', ctx._errors.length === 0, ctx._errors.slice(0, 3).join(' | '));

console.log(fail ? `FAIL  ${pass} passed, ${fail} failed   build ${hBare}` : `ALL PASS  ${pass} passed, 0 failed   build ${hBare}`);
process.exit(fail ? 1 : 0);
