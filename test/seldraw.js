// WHAT A SELECTION DRAWS, AND WHAT A DEATH STOPS DRAWING.
//   node test/seldraw.js
//
// Two presentation items, tested together because they are the same pass -- the overlay the draw loop
// puts over the world once the units are down -- and they fail the same silent way: the feature still
// runs, nothing throws, and the player simply does not see the thing it exists to show.
//
//  1-5. QUEUED ORDERS DRAW (item 8). Shift-queuing has worked since M11 and drew NOTHING: you queued
//       five stops and had to hold the route in your head. Render.drawOrderQueue draws the route for
//       the current selection -- a line from the unit through every stored stop with a mark at each --
//       in Brood War's three colours: green go, red fight, yellow patrol. Section 4 is the COST rule
//       (REVIEW-M17 entry 28): the whole screen is at most three strokes and three fills however many
//       units are selected, not one path per line. Section 5 is the trap the code carries a comment
//       about: a queued gather carries a map RESOURCE, whose x/y are tile coordinates, so the line has
//       to read cx/cy or every gather line points at the top-left of the map.
//
//  6.   A DEAD UNIT DRAWS NO HEALTH BAR (item 9), and its corpse still does. This was reported as a
//       bug -- "when units die their health bar stays for a moment" -- and MEASURED before anything was
//       changed (.claude/review/agent-draw/death-probe.js): across 1,500 drawn frames of a 40-unit
//       battle with 29 deaths, health bars drawn for a dead unit = 0. It already stops on the frame the
//       unit dies. The interesting part is WHY that is not obvious: G.units is reaped only on
//       `frame % 24 === 0` (js/game.js), so the dead unit sits in the array for up to 24 frames, and
//       nothing but the `!u.alive` guard in frame()'s collect loop keeps it off the screen. So this
//       section is a PIN, not a fix: the unit must still be in G.units, must draw no bar, and its
//       corpse decal must still blit -- because "stop the bar" must not be satisfied by stopping the
//       death animation with it.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (m, c, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined ? '  ' + x : '')); } };

// ============================================================================
// 0. A canvas that remembers the PATHS it was told to draw
// ============================================================================
// Every op carries the stroke and fill style in force when it ran, and the ops between one beginPath
// and its stroke/fill are collected into one path -- which is what sections 1-4 read, because the
// claim being tested is about how many paths there are as much as about where they go.
function recorder() { return { ops: [], on: false, reset() { this.ops.length = 0; } }; }
function mkCtx(cv, rec) {
  const grad = { addColorStop() { } };
  const c = {
    canvas: cv, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    globalAlpha: 1, globalCompositeOperation: 'source-over', font: '10px sans-serif', filter: 'none',
    imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: '#000', textAlign: 'start', textBaseline: 'alphabetic', miterLimit: 10, lineDashOffset: 0,
    createLinearGradient: () => grad, createRadialGradient: () => grad, createConicGradient: () => grad,
    createPattern: () => ({ setTransform() { } }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    measureText: t => ({ width: String(t).length * 6 }),
    isPointInPath: () => false, getLineDash: () => [], setLineDash() { },
  };
  for (const k of ['save', 'restore', 'setTransform', 'resetTransform', 'transform', 'translate', 'rotate', 'scale',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'quadraticCurveTo', 'bezierCurveTo',
    'clip', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'fillText', 'strokeText', 'putImageData']) {
    c[k] = function (...a) { if (rec.on) rec.ops.push({ op: k, a, lw: c.lineWidth, ss: String(c.strokeStyle), fs: typeof c.fillStyle === 'string' ? c.fillStyle : 'grad', ga: c.globalAlpha }); };
  }
  return c;
}
function mkCanvas(rec) {
  const cv = { width: 300, height: 150, style: {}, _ctx: null, isCanvas: true };
  cv.getContext = () => cv._ctx || (cv._ctx = mkCtx(cv, rec));
  cv.addEventListener = () => { }; cv.removeEventListener = () => { };
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: cv.width, height: cv.height });
  return cv;
}
// beginPath ... stroke|fill  ->  { kind, style, pts: [x, y, ...], closes }
function paths(ops) {
  const out = []; let cur = null;
  for (const o of ops) {
    if (o.op === 'beginPath') { cur = { pts: [], closes: 0 }; continue; }
    if (!cur) continue;
    if (o.op === 'moveTo' || o.op === 'lineTo') { cur.pts.push(o.a[0], o.a[1]); continue; }
    if (o.op === 'closePath') { cur.closes++; continue; }
    if (o.op === 'stroke') { out.push({ kind: 'stroke', style: o.ss, lw: o.lw, pts: cur.pts, closes: cur.closes }); cur = null; continue; }
    if (o.op === 'fill') { out.push({ kind: 'fill', style: o.fs, lw: o.lw, pts: cur.pts, closes: cur.closes }); cur = null; continue; }
  }
  return out;
}

const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot',
  'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'atlas', 'fx', 'render', 'editor', 'ui', 'hud', 'build'];
const VIEW_W = 1280, VIEW_H = 700;

function build() {
  const rec = recorder(); const errors = [];
  const el = () => { const e = mkCanvas(rec); e.click = () => { }; e.value = ''; e.appendChild = () => { }; e.textContent = ''; e.remove = () => { }; e.focus = () => { }; e.blur = () => { }; e.querySelectorAll = () => []; return e; };
  const c = {
    console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0] && a[0].stack || a[0])) },
    Math, performance, setTimeout, clearTimeout, setInterval() { return 0; }, clearInterval() { },
    Image: function () { }, addEventListener() { }, requestAnimationFrame() { }, devicePixelRatio: 1,
    innerWidth: VIEW_W, innerHeight: VIEW_H + 120, alert() { },
    localStorage: { getItem() { return null; }, setItem() { }, removeItem() { } },
    location: { protocol: 'http:', host: 'localhost' },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [], querySelector: () => null },
  };
  c.window = c; c.self = c; c.globalThis = c;
  vm.createContext(c); c._rec = rec; c._errors = errors;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  vm.runInContext(`
    Sound.init = () => {}; Sound.click = () => {}; Sound.setMuted = () => {}; Sound.alert = () => {}; Sound.attack = () => {}; Sound.death = () => {}; Sound.ack = () => {};
    var Voice = { announce() {}, speak() {} };
    var Codex = { open: false, isOpen() { return false; }, wheel() { return false; }, key() { return false; }, toggle() {} };
  `, c);
  return c;
}
const R = (c, src) => vm.runInContext('(() => {' + src + '})();', c);
const ctx = build();
const rec = ctx._rec;
if (ctx._errors.length) { console.log('LOAD ERRORS: ' + ctx._errors.join(' | ')); ctx._errors.length = 0; }

// A game with a camera on the human's hall and a renderer pinned to a fixed viewport, so nothing here
// depends on the machine's screen.
const START = extra => R(ctx, `
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, name: 'B' }], seed: 4, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  G.human = 0; UI.running = true; UI.mode = 'play'; UI.menu = null; UI.chat = null; UI.loading = null; UI.net = false;
  UI.selection = []; UI.hover = null; UI.placing = null; UI.pending = null; UI.viewAll = true; UI.markers = [];
  FX.reset();
  Render.init(document.getElementById('game'));
  Render.W = ${VIEW_W}; Render.H = ${VIEW_H + 120}; Render.viewW = ${VIEW_W}; Render.viewH = ${VIEW_H}; Render.dpr = 1; Render.zoom = 1;
  Render.reset(); Render.built = false;
  const hall = G.units.find(u => u.owner === 0 && u.isBuilding && u.def.depot);
  Render.camX = hall.x - ${VIEW_W} / 2; Render.camY = hall.y - ${VIEW_H} / 2;
  G._hall = hall;
  ${extra}
  G.updateVision();
  return 1;
`);
// One drawn frame at alpha 1, with the recorder on. alpha 1 and no tick in between means the drawn
// position IS the simulation position, so the coordinates below can be asserted exactly.
const frame = () => { rec.reset(); rec.on = true; R(ctx, 'Render.frame(1); return 1;'); rec.on = false; if (ctx._errors.length) { console.log('  DRAW ERROR: ' + ctx._errors[0]); ctx._errors.length = 0; } return paths(rec.ops); };
const COLS = R(ctx, 'return Render.Q_COLS.slice();');          // read the constant, never the literal
const qPaths = (ps, k) => ps.filter(p => p.style === COLS[k]);
const near = (a, b) => Math.abs(a - b) < 0.51;

START('');
frame();   // warm: terrain chunks and sprite canvases bake on the first frame

// ============================================================================
// 1. the polyline: unit -> current stop -> every stored stop, in order
// ============================================================================
{
  const P = R(ctx, `
    const h = G._hall; const u = G.spawnUnit('marine', 0, h.x + 40, h.y + 120);
    G._u = u; UI.selection = [u];
    u.setOrder({ type: 'move', x: h.x + 200, y: h.y + 120 });
    u.setOrder({ type: 'move', x: h.x + 200, y: h.y + 300 }, true);
    u.setOrder({ type: 'move', x: h.x - 100, y: h.y + 300 }, true);
    return { x: u.x, y: u.y, q: u.queue.length, order: u.order.type,
             pts: [h.x + 200, h.y + 120, h.x + 200, h.y + 300, h.x - 100, h.y + 300] };
  `);
  ok('the scene is real: three stops queued behind the order the unit is on', P.q === 2 && P.order === 'move', JSON.stringify({ q: P.q, order: P.order }));
  const ps = frame();
  const green = qPaths(ps, 0).filter(p => p.kind === 'stroke');
  ok('the queued route is stroked, once, in the green of Render.Q_COLS[0]', green.length === 1, JSON.stringify({ found: green.length, cols: COLS }));
  const pts = green.length ? green[0].pts : [];
  // three segments, emitted as moveTo/lineTo pairs: unit->A, A->B, B->C
  const want = [P.x, P.y, P.pts[0], P.pts[1], P.pts[0], P.pts[1], P.pts[2], P.pts[3], P.pts[2], P.pts[3], P.pts[4], P.pts[5]];
  ok('...and it runs from the unit through all three stops in the order nextOrder() will take them',
    pts.length === want.length && want.every((v, i) => near(v, pts[i])), JSON.stringify({ got: pts.map(Math.round), want: want.map(Math.round) }));
  const dots = qPaths(ps, 0).filter(p => p.kind === 'fill');
  ok('a marker is filled at each of the three stops, in ONE path', dots.length === 1 && dots[0].closes === 3, JSON.stringify({ fills: dots.length, closes: dots.map(d => d.closes) }));
  // The markers are AT the stops. A diamond is emitted as (x, y-r) (x+r, y) (x, y+r) (x-r, y), so its
  // centre is (first point's x, second point's y) -- taken off the shape itself rather than against a
  // hardcoded radius, which would go stale the day the marker changes size.
  const dp = dots.length ? dots[0].pts : [], centres = [];
  for (let i = 0; i + 7 < dp.length; i += 8) centres.push([dp[i], dp[i + 3]]);
  const atStops = centres.length === 3 && centres.every(([cx, cy], i) => near(cx, P.pts[i * 2]) && near(cy, P.pts[i * 2 + 1]));
  ok('...each one centred on its stop rather than somewhere near it', atStops, JSON.stringify(centres.map(p => p.map(Math.round))));
}

// ============================================================================
// 2. colour says what the stop is: green go, red fight, yellow patrol
// ============================================================================
{
  R(ctx, `
    const h = G._hall, u = G._u;
    u.stop(); UI.selection = [u];
    u.setOrder({ type: 'move', x: h.x + 200, y: h.y + 120 });
    u.setOrder({ type: 'attackmove', x: h.x + 300, y: h.y + 200 }, true);
    u.setOrder({ type: 'patrol', x: h.x + 300, y: h.y + 400 }, true);
    return 1;
  `);
  const ps = frame();
  const n = k => qPaths(ps, k).filter(p => p.kind === 'stroke').reduce((a, p) => a + p.pts.length / 4, 0);
  ok('a move leg is green, an attack-move leg is red and a patrol leg is yellow -- one segment each',
    n(0) === 1 && n(1) === 1 && n(2) === 1, JSON.stringify({ green: n(0), red: n(1), yellow: n(2) }));
  // ANTI-VACUITY: three colours is only information if they are actually different strings
  ok('...and the three colours are three different colours', new Set(COLS).size === 3, JSON.stringify(COLS));
}

// ============================================================================
// 3. only your own units, only the selection, only when something is queued
// ============================================================================
{
  const noQueue = R(ctx, `const u = G._u; u.stop(); u.setOrder({ type: 'move', x: u.x + 300, y: u.y }); UI.selection = [u]; return u.queue.length;`);
  ok('a selected unit with an order but NOTHING queued draws no route (fifty gathering workers would be noise)',
    noQueue === 0 && qPaths(frame(), 0).length === 0, 'queue ' + noQueue);
  const unsel = R(ctx, `
    const h = G._hall, u = G._u;
    u.stop(); u.setOrder({ type: 'move', x: h.x + 200, y: h.y + 120 }); u.setOrder({ type: 'move', x: h.x + 200, y: h.y + 300 }, true);
    UI.selection = []; return u.queue.length;`);
  ok('the same unit with two stops queued draws nothing while it is NOT selected', unsel === 1 && qPaths(frame(), 0).length === 0, 'queue ' + unsel);
  ok('...and draws it again the moment it is selected (negative control for the two above)',
    R(ctx, 'UI.selection = [G._u]; return 1;') && qPaths(frame(), 0).length === 2, JSON.stringify(qPaths(frame(), 0).map(p => p.kind)));
  // applyOrder and a push, not setOrder: js/commands.js WRAPS Unit.prototype.setOrder so every order
  // becomes a logged command stamped `c.p = G.human`, and an order aimed at a unit the human does not
  // own is dropped on the way through. Which is the relay's rule doing its job, and is also why the
  // enemy's queue has to be built underneath it here.
  const enemy = R(ctx, `
    const h = G._hall; const e = G.spawnUnit('zergling', 1, h.x + 300, h.y + 300);
    e.applyOrder({ type: 'move', x: h.x + 400, y: h.y + 300 }); e.queue.push({ type: 'move', x: h.x + 500, y: h.y + 300 });
    UI.selection = [e]; G._e = e; return e.queue.length;`);
  ok('an ENEMY unit you have selected never shows its queue: that is knowledge you do not have',
    enemy === 1 && qPaths(frame(), 0).length === 0 && qPaths(frame(), 1).length === 0, 'queue ' + enemy);
}

// ============================================================================
// 4. the cost rule: three strokes and three fills for the whole screen
// ============================================================================
// REVIEW-M17 entry 28 measured a per-frame ctx.filter set as most of a battle's cost. The shape that
// cost is avoided in is this one: one pass into reused arrays, then one draw call per colour -- so
// sixty selected units with four stops each must still be ONE stroke, not two hundred and forty.
{
  const made = R(ctx, `
    const h = G._hall; const sel = [];
    for (let i = 0; i < 60; i++) {
      const u = G.spawnUnit('marine', 0, h.x - 200 + (i % 10) * 20, h.y + 200 + Math.floor(i / 10) * 20);
      u.setOrder({ type: 'move', x: h.x + 100, y: h.y + 100 });
      u.setOrder({ type: 'move', x: h.x + 200, y: h.y + 200 }, true);
      u.setOrder({ type: 'move', x: h.x + 300, y: h.y + 100 }, true);
      u.setOrder({ type: 'move', x: h.x + 400, y: h.y + 200 }, true);
      sel.push(u);
    }
    UI.selection = sel; return { n: sel.length, q: sel[0].queue.length };`);
  const ps = frame();
  const strokes = qPaths(ps, 0).filter(p => p.kind === 'stroke'), fills = qPaths(ps, 0).filter(p => p.kind === 'fill');
  const segs = strokes.reduce((a, p) => a + p.pts.length / 4, 0);
  ok('sixty selected units with four stops each: 240 segments in ONE stroke and ONE fill',
    made.n === 60 && made.q === 3 && strokes.length === 1 && fills.length === 1 && segs === 240,
    JSON.stringify({ units: made.n, queued: made.q, strokes: strokes.length, fills: fills.length, segs }));
  // ANTI-VACUITY: one stroke is trivially satisfiable by drawing nothing
  ok('...and the one stroke really carries all 240 of them', segs === made.n * (made.q + 1), String(segs));
  // and the line width is in SCREEN pixels, so zooming out does not make it invisible
  const z = R(ctx, 'Render.setZoom ? 1 : 1; Render.zoom = 0.5; return Render.zoom;');
  const lw2 = qPaths(frame(), 0).filter(p => p.kind === 'stroke').map(p => p.lw)[0];
  const lw1 = (R(ctx, 'Render.zoom = 1; return 1;'), qPaths(frame(), 0).filter(p => p.kind === 'stroke').map(p => p.lw)[0]);
  ok('the line is a constant width on SCREEN: half the zoom, twice the world width', z === 0.5 && near(lw2, lw1 * 2), JSON.stringify({ lw1, lw2 }));
}

// ============================================================================
// 5. a queued gather points at the patch, not at the top-left of the map
// ============================================================================
// The trap the code carries a comment about: a mineral order's target is a map RESOURCE, whose x/y are
// TILE coordinates and whose pixel centre is cx/cy. Reading .x off it draws every gather line into the
// corner of the world, and it would look like a pathing bug rather than a drawing one.
{
  const g = R(ctx, `
    const h = G._hall; const scv = G.spawnUnit('scv', 0, h.x + 40, h.y + 40);
    const res = G.map.resources.find(r => r.type === 'mineral');
    scv.setOrder({ type: 'move', x: h.x + 90, y: h.y + 40 });
    scv.setOrder({ type: 'gather', target: res, phase: 'goto' }, true);
    UI.selection = [scv]; G._scv = scv;
    return { cx: res.cx, cy: res.cy, tilex: res.x, tiley: res.y, q: scv.queue.length };`);
  const ps = frame();
  const pts = qPaths(ps, 0).filter(p => p.kind === 'stroke').reduce((a, p) => a.concat(p.pts), []);
  const last = pts.slice(-2);
  ok('a queued gather ends on the patch\'s pixel centre (cx/cy), not on its tile coordinates',
    g.q === 1 && last.length === 2 && near(last[0], g.cx) && near(last[1], g.cy),
    JSON.stringify({ end: last.map(Math.round), cx: Math.round(g.cx), cy: Math.round(g.cy), tile: [g.tilex, g.tiley] }));
  // ANTI-VACUITY: the two answers have to be far enough apart that the check can tell them apart
  ok('...and the two readings are genuinely different places', Math.hypot(g.cx - g.tilex, g.cy - g.tiley) > 100,
    JSON.stringify({ px: [Math.round(g.cx), Math.round(g.cy)], tile: [g.tilex, g.tiley] }));
}

// ============================================================================
// 6. a dead unit draws no health bar -- and its corpse still draws
// ============================================================================
// Item 9, and a PIN rather than a fix: measured first (.claude/review/agent-draw/death-probe.js) and
// the bar already stops on the frame the unit dies -- 0 bars for a dead unit across 1,500 drawn frames
// of a 40-unit battle. What makes that non-trivial is that the unit is STILL IN G.units: the reap runs
// only on `frame % 24 === 0`, so for up to 24 frames the only thing keeping a corpse's bar off the
// screen is the `!u.alive` guard in frame()'s collect loop. Take that guard away and this section goes
// red, which is exactly what it is for.
{
  // A Zerg unit of the human's, so what it leaves behind is FX's 'corpse' decal with its twelve-frame
  // fall (js/fx.js) -- the death animation this section has to prove is still running once the bar has
  // stopped. A Terran unit leaves a 'wreck', which is the same code path with a different filter.
  START(`
    const u = G.spawnUnit('zergling', 0, G._hall.x + 60, G._hall.y + 60);
    u.hp = u.maxHp * 0.5; u.lastHit = G.frame; UI.selection = [u]; G._v = u;
  `);
  R(ctx, `
    Render._bars = 0; Render._deadBars = 0;
    if (!Render._wrapped) { const ob = Render.drawBars; Render._wrapped = true;
      Render.drawBars = function (c2, u) { Render._bars++; if (!u.alive) Render._deadBars++; return ob.call(this, c2, u); }; }
    return 1;`);
  frame();  // warm
  const alive = R(ctx, 'Render._bars = 0; Render._deadBars = 0; return 1;') && (frame(), R(ctx, 'return { bars: Render._bars, dead: Render._deadBars };'));
  ok('ANTI-VACUITY: a LIVE wounded unit does draw a health bar, so this section can fail', alive.bars > 0 && alive.dead === 0, JSON.stringify(alive));

  const after = R(ctx, `
    G.kill(G._v, null, false);
    return { alive: G._v.alive, inUnits: G.units.indexOf(G._v) >= 0, frame: G.frame };`);
  ok('the unit is dead and STILL IN G.units (the reap is frame % 24 === 0, js/game.js)', after.alive === false && after.inUnits === true, JSON.stringify(after));

  R(ctx, 'Render._bars = 0; Render._deadBars = 0; return 1;');
  let stillIn = 0;
  for (let i = 0; i < 24; i++) {
    frame();
    if (R(ctx, 'return G.units.indexOf(G._v) >= 0;')) stillIn++;
    R(ctx, 'G.tick(); return 1;');
  }
  const dead = R(ctx, 'return { bars: Render._bars, dead: Render._deadBars, decals: FX.decals.filter(d => d.kind === "corpse" || d.kind === "wreck").length };');
  ok('NO health bar is drawn for it on the frame it dies, nor on any of the 24 after',
    dead.dead === 0, JSON.stringify(dead));
  ok('...and it really was in G.units for most of those frames, so the check is not vacuous',
    stillIn >= 20, String(stillIn) + ' of 24');
  // The corpse is the half that must NOT stop, and "there is a decal in the array" does not prove it
  // reaches the canvas. So it is an A/B on the same frame: the blits with the corpse in the decal
  // list, and the blits with the list emptied. The difference is the corpse.
  const withIt = (frame(), rec.ops.filter(o => o.op === 'drawImage').length);
  R(ctx, 'FX._stash = FX.decals.slice(); FX.decals.length = 0; return 1;');
  const without = (frame(), rec.ops.filter(o => o.op === 'drawImage').length);
  R(ctx, 'for (const d of FX._stash) FX.decals.push(d); FX._stash = null; return 1;');
  ok('the CORPSE is still there and still blitting -- stopping the bar must not stop the death animation',
    dead.decals >= 1 && withIt > without, JSON.stringify({ corpseDecals: dead.decals, blitsWithCorpse: withIt, blitsWithout: without }));
}

// ============================================================================
// 7. planned buildings draw a faint ghost, and nothing may be placed on top of one (seventh session, item 9)
// ============================================================================
// "When you use one builder unit to build several buildings in a row in queued commands, a faint transparency
// of the building should be shown where it's placed. That way you don't accidentally try to place over the
// same area twice." A ghost is a building sprite blitted at the planned tile at low alpha; the refusal is
// UI.confirmPlacement turning the click down with UI.PLANNED_MSG.
{
  START(`
    const p = G.players[0]; p.minerals = 5000; p.vis.fill(2);
    const def = DATA.buildings.supply_depot;   // hall is START's own
    const free = (x0, y0, not) => G.map.findFreeTile(x0, y0, 16, (x, y) => !G.map.canPlace(def, x, y, p, G.units, null) && !not.some(s => Math.abs(s[0] - x) < def.w + 1 && Math.abs(s[1] - y) < def.h + 1));
    const A = free(hall.tx + 6, hall.ty + 5, []), B = free(A[0] + 3, A[1], [A]), C = free(B[0] + 3, B[1], [A, B]);
    const scv = G.spawnUnit('scv', 0, hall.x + 40, hall.y + 90);
    scv.setOrder({ type: 'build', def, tx: A[0], ty: A[1] });
    scv.setOrder({ type: 'build', def, tx: B[0], ty: B[1] }, true);
    scv.setOrder({ type: 'build', def, tx: C[0], ty: C[1] }, true);
    const other = G.spawnUnit('scv', 0, hall.x - 40, hall.y + 90);
    // an ENEMY drone on its way to build: its plan must not draw
    const E = free(hall.tx + 14, hall.ty + 12, [A, B, C]);
    const drone = G.spawnUnit('drone', 1, (E[0] - 2) * TILE, (E[1] - 2) * TILE);   // beside its own site, and off the depots' (it stood on site A once, and canPlace said so)
    // G.applying: an order to a unit that is not the local player's goes through the command-log wrapper otherwise, and never lands
    G.applying = true; try { drone.setOrder({ type: 'build', def: DATA.buildings.spawning_pool, tx: E[0], ty: E[1] }); } finally { G.applying = false; }
    G._plan = { A, B, C, E, scv, other, def, drone };
  `);
  const plan = R(ctx, 'const q = G._plan; const sp = Sprites.building({ def: q.def, owner: 0 }), pool = Sprites.building({ def: DATA.buildings.spawning_pool, owner: 1 }); return { A: q.A, B: q.B, C: q.C, E: q.E, M: sp.M, T: sp.T, PM: pool.M, PT: pool.T, TILE };');
  frame();
  const ghosts = rec.ops.filter(o => o.op === 'drawImage' && o.ga > 0.2 && o.ga < 0.35);
  const at = s => ghosts.some(o => near(o.a[1], s[0] * plan.TILE - plan.M) && near(o.a[2], s[1] * plan.TILE - plan.T));
  ok('A GHOST DRAWS AT EVERY PLANNED SITE: the one the SCV is walking to and both shift-queued after it (nothing drew until each went down)',
    at(plan.A) && at(plan.B) && at(plan.C), JSON.stringify({ ghosts: ghosts.length, A: at(plan.A), B: at(plan.B), C: at(plan.C) }));
  const droneOrder = R(ctx, 'return G._plan.drone.order.type;');   // THIS drone -- the Zerg player's starting drones are mining, and a find() on owner 1 returned one of those
  const enemyGhost = ghosts.some(o => near(o.a[1], plan.E[0] * plan.TILE - plan.PM) && near(o.a[2], plan.E[1] * plan.TILE - plan.PT));
  ok('...and not for another player\'s plans, which would be a scouting leak', droneOrder === 'build' && !enemyGhost, JSON.stringify({ droneOrder, enemyGhost, ghosts: ghosts.length }));   // the enemy really has a plan (setup), and it draws nothing
  // placing a depot with ANOTHER worker on top of a planned site is refused, with the words the preview shows
  const refused = R(ctx, `
    const q = G._plan, p = G.players[0]; p.msgs.length = 0;
    UI.placing = { def: q.def, tx: q.B[0], ty: q.B[1], builder: q.other }; UI.confirmPlacement(true);
    const said = p.msgs.map(m => m.text).join(' | ');
    const queued = q.other.order.type === 'build' || q.other.queue.some(o => o.type === 'build');
    UI.placing = null;
    return { said, queued, msg: UI.PLANNED_MSG };`);
  ok('PLACING ON TOP OF A PLANNED SITE IS REFUSED and says why -- the accident the user described cannot happen',
    !refused.queued && refused.said.includes(refused.msg), JSON.stringify(refused));
  // ...and the preview is red there, not green, so the click is never a surprise
  const preview = (() => { R(ctx, 'const q = G._plan; UI.placing = { def: q.def, tx: q.C[0], ty: q.C[1], builder: q.other }; return 1;'); frame(); R(ctx, 'UI.placing = null; return 1;');
    return { red: rec.ops.filter(o => o.op === 'fillRect' && /255,60,60/.test(o.fs)).length, green: rec.ops.filter(o => o.op === 'fillRect' && /60,255,60/.test(o.fs)).length }; })();
  ok('...and the placement preview over a planned site is RED, never green', preview.red > 0 && preview.green === 0, JSON.stringify(preview));
  // the SAME worker re-placing WITHOUT shift replaces its whole queue, so its own old sites must not block it
  const replace = R(ctx, `
    const q = G._plan; UI.placing = { def: q.def, tx: q.A[0], ty: q.A[1], builder: q.scv }; UI.confirmPlacement(false);
    return { order: q.scv.order.type, tx: q.scv.order.tx, ty: q.scv.order.ty, queue: q.scv.queue.length, A: q.A };`);
  ok('...but the SAME worker placing WITHOUT shift may reuse its own old site: that order replaces its whole queue',
    replace.order === 'build' && replace.tx === replace.A[0] && replace.ty === replace.A[1] && replace.queue === 0, JSON.stringify(replace));
}

console.log('\n' + (fail ? 'FAIL  ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
