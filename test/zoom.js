// Strategic zoom, and the render half of day/night.
//   node test/zoom.js
//
// Same discipline as test/renderfeel.js, and for the same reason: "that reads well at a distance" is
// not assertable, so this asserts the things around the drawing that CAN fail silently. Six of them,
// and every one has an analogue that has failed silently in this repository before:
//
//  1. THE API IS THERE AND IT CLAMPS. A zoom that accepts NaN gives a NaN transform, and a canvas with
//     a NaN transform draws NOTHING at all -- a black screen with no error anywhere. Every hostile
//     input a wheel handler can produce is fed to it here.
//  2. IT RUNS AT EVERY ZOOM, including fully out with four hundred units, which is the state the
//     feature exists for and the one nothing else in the suite visits.
//  3. THE WORLD POINT UNDER THE CURSOR STAYS PUT. That is the whole contract of zoomAt and it is one
//     line of arithmetic that is easy to get backwards; backwards looks like "the map drifts while you
//     zoom", which is a feel bug nobody files.
//  4. ICON MODE ENGAGES, AND COSTS DRAW CALLS RATHER THAN BLITS. The point of icons is legibility, but
//     the reason they are geometry and not sprites is the budget: four hundred icon blits would cost
//     what four hundred sprite blits cost. Counted.
//  5. THE CHUNK CACHE IS NOT RE-BAKED PER ZOOM LEVEL. Terrain chunks are the most expensive cache in
//     the renderer and a zoom-keyed one would be thrashed by every wheel notch. Asserted directly:
//     zooming out bakes no chunks at all.
//  6. NIGHT RUNS AT 0, 0.5, 1 AND UNDEFINED, draws only when it is dark, and never writes to G.
//
// Plus the two invariants every render change has to hold: the simulation is untouched by drawing, and
// the build stamp does not move.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (m, c, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined ? '  ' + x : '')); } };
const num = v => Math.round(v * 1000) / 1000;

// ============================================================================
// 0. A canvas that remembers what it was told to draw
// ============================================================================
// Lifted from test/renderfeel.js on purpose. Arguments are recorded in USER space with no transform
// tracking, which is all this file needs: everything it reads back is emitted while the context
// carries the world transform, so those arguments are world coordinates.
const DRAWS = new Set(['drawImage', 'fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'putImageData', 'clearRect']);
function recorder() {
  return { ops: [], tag: null, on: false, calls: 0, reset() { this.ops.length = 0; this.calls = 0; } };
}
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
    c[k] = function (...a) { if (rec.on) { if (DRAWS.has(k)) rec.calls++; rec.ops.push({ op: k, a, tag: rec.tag }); } };
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
    vm.runInContext('var UI = { consoleH: 120, menu: null, mode: "play", placing: null, selection: [], hover: null, markers: [], drag: null, dragging: false, viewAll: true, currentCard: () => [], onUnitDied() {}, ping() {} };', c);
    for (const f of REN) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  }
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'build.js'), 'utf8'), c, { filename: 'build.js' });
  return c;
}
const R = (c, src) => vm.runInContext('(() => {' + src + '})();', c);
const ctx = mkCtx2(true);
// G.daylight is a GETTER on G, and the night section below deletes it to test what the renderer does
// when the simulation half is absent. That deletion is permanent in this context, which matters now
// that BUILD hashes accessors by source: the stamp check at the end would otherwise compare a context
// whose G still has the getter against one where the test removed it, and report a difference that the
// render files had nothing to do with. Stash it here, put it back before the stamp is taken.
R(ctx, "G.__dayDesc = Object.getOwnPropertyDescriptor(G, 'daylight');");

const START = (layout, extra = '') => R(ctx, `
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, name: 'B' }], seed: 4, layout: '${layout}' });
  for (const p of G.players) p.ai = null;
  G.human = 0;
  Render.init(document.getElementById('game'));
  Render.W = ${VIEW_W}; Render.H = ${VIEW_H + 120}; Render.viewW = ${VIEW_W}; Render.viewH = ${VIEW_H}; Render.dpr = 1;
  Render.reset(); Render.built = false;
  Render.camX = G.map.w * TILE / 2 - ${VIEW_W} / 2; Render.camY = G.map.h * TILE / 2 - ${VIEW_H} / 2;
  ${extra}
  return { layout: G.map.layout, w: G.map.w, h: G.map.h, zoom: Render.zoom };
`);

// ============================================================================
// 1. The API exists, and a fresh renderer is at zoom 1
// ============================================================================
const begin = START('temple');
const present = R(ctx, `
  const t = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v]));
  return { fn: t({ setZoom: Render.setZoom, zoomAt: Render.zoomAt, clampZoom: Render.clampZoom, clampCam: Render.clampCam,
                   fitZoom: Render.fitZoom, zoomLimits: Render.zoomLimits, viewWorldW: Render.viewWorldW, viewWorldH: Render.viewWorldH,
                   screenToWorld: Render.screenToWorld, worldToScreen: Render.worldToScreen, iconMode: Render.iconMode,
                   drawIcons: Render.drawIcons, iconH: Render.iconH, roleOf: Render.roleOf,
                   drawNight: Render.drawNight, daylight: Render.daylight, night: Render.night }),
           num: typeof Render.zoom, terrain: t({ overview: Terrain.overview, drawOverview: Terrain.drawOverview, clearOverview: Terrain.clearOverview }) };
`);
ok('the zoom and night entry points exist on Render', Object.values(present.fn).every(v => v === 'function') && present.num === 'number', JSON.stringify(present.fn));
ok('and the overview entry points exist on Terrain', Object.values(present.terrain).every(v => v === 'function'), JSON.stringify(present.terrain));

const fresh = R(ctx, `return { z: Render.zoom, wW: Render.viewWorldW(), wH: Render.viewWorldH(), icons: Render.iconMode(),
                               lim: Render.zoomLimits(), s2w: Render.screenToWorld(0, 0), w2s: Render.worldToScreen(Render.camX + 100, Render.camY + 50) };`);
ok('a fresh renderer sits at zoom 1', fresh.z === 1 && !fresh.icons, JSON.stringify(fresh));
ok('and at zoom 1 the world view is exactly the pixel view, so the feature is free when it is off',
  fresh.wW === VIEW_W && fresh.wH === VIEW_H && Math.abs(fresh.w2s[0] - 100) < 1e-9 && Math.abs(fresh.w2s[1] - 50) < 1e-9, JSON.stringify(fresh));
ok('the map-fit floor is below the icon threshold on a ' + begin.w + '-tile map (' + num(fresh.lim.lo) + ' < ' + fresh.lim.icon + ')',
  fresh.lim.lo < fresh.lim.icon && fresh.lim.lo > 0, JSON.stringify(fresh.lim));

// ============================================================================
// 2. Clamping, including every hostile input a wheel handler can produce
// ============================================================================
// The failure this is about is not "the number is wrong". It is that setTransform with a NaN in it
// silently makes the whole canvas draw nothing, with no error and no clue -- so a single unguarded
// `Render.zoom *= e.deltaY` on a trackpad that reports a NaN delta is a black screen.
const clampCases = R(ctx, `
  const out = {}, at = Render.zoom;
  const try1 = (label, v) => { Render.setZoom(1); const r = Render.setZoom(v); out[label] = { got: r, live: Render.zoom, finite: isFinite(Render.zoom) }; };
  try1('huge', 1000); try1('tiny', 0.0000001); try1('zero', 0); try1('negative', -2);
  try1('nan', NaN); try1('infinity', Infinity); try1('string', '0.5'); try1('undefined', undefined); try1('null', null);
  try1('legal', 0.4);
  Render.setZoom(1);
  return { out, lim: Render.zoomLimits() };
`);
const CC = clampCases.out, LIM = clampCases.lim;
ok('zooming in past the cap stops at ' + LIM.hi, CC.huge.live === LIM.hi, JSON.stringify(CC.huge));
ok('zooming out past the map fit stops at ' + num(LIM.lo), Math.abs(CC.tiny.live - LIM.lo) < 1e-12, JSON.stringify(CC.tiny));
ok('a legal zoom is taken as given', Math.abs(CC.legal.live - 0.4) < 1e-12, JSON.stringify(CC.legal));
ok('and NaN, Infinity, 0, a negative, a string, null and undefined all leave the zoom exactly where it was',
  ['nan', 'infinity', 'zero', 'negative', 'string', 'undefined', 'null'].every(k => CC[k].live === 1), JSON.stringify(CC));
ok('the zoom is finite after every one of them, which is what stops a canvas drawing nothing at all',
  Object.values(CC).every(v => v.finite), JSON.stringify(CC));

// The camera clamp has to follow the zoom, or zooming out at a map edge shows void where the map is.
const camClamp = R(ctx, `
  Render.setZoom(1); Render.camX = 0; Render.camY = 0;
  const wide = [];
  for (const z of [1, 0.8, 0.5, 0.3, Render.zoomLimits().lo]) {
    Render.setZoom(z); Render.camX = -10000; Render.camY = 99999; Render.clampCam();
    const wW = Render.viewWorldW(), wH = Render.viewWorldH(), mw = G.map.w * TILE, mh = G.map.h * TILE;
    wide.push({ z: Render.zoom, camX: Render.camX, camY: Render.camY,
                okX: wW >= mw ? true : (Render.camX >= -1e-9 && Render.camX <= mw - wW + 1e-9),
                okY: wH >= mh ? true : (Render.camY >= -1e-9 && Render.camY <= mh - wH + 1e-9) });
  }
  Render.setZoom(1);
  return wide;
`);
ok('the camera clamp follows the zoom, so no zoom level can show off the edge of the map',
  camClamp.every(r => r.okX && r.okY), JSON.stringify(camClamp));

// ============================================================================
// 3. zoomAt keeps the world point under the cursor fixed
// ============================================================================
// Away from the edges, because at an edge the clamp wins and there is no camera position that would
// have held the point -- which is correct, and is why the camera is put in the middle of the map here.
const anchor = R(ctx, `
  const rows = [];
  const mid = () => { Render.camX = G.map.w * TILE / 2 - Render.viewWorldW() / 2; Render.camY = G.map.h * TILE / 2 - Render.viewWorldH() / 2; };
  for (const [from, to] of [[1, 0.7], [1, 0.5], [0.7, 1], [1, 2], [2, 0.6], [0.5, 0.5]]) {
    Render.setZoom(from); mid();
    for (const [sx, sy] of [[0, 0], [${VIEW_W} / 2, ${VIEW_H} / 2], [${VIEW_W} - 1, ${VIEW_H} - 1], [317, 88]]) {
      Render.setZoom(from); mid();
      const before = Render.screenToWorld(sx, sy);
      Render.zoomAt(to, sx, sy);
      const after = Render.screenToWorld(sx, sy);
      rows.push({ from, to: Render.zoom, sx, sy, dx: after[0] - before[0], dy: after[1] - before[1] });
    }
  }
  Render.setZoom(1);
  return rows;
`);
const worstDrift = Math.max(...anchor.map(r => Math.max(Math.abs(r.dx), Math.abs(r.dy))));
ok('zoomAt holds the world point under the cursor to within ' + num(worstDrift) + ' px over ' + anchor.length + ' cases',
  worstDrift < 1e-6, JSON.stringify(anchor.filter(r => Math.abs(r.dx) > 1e-6 || Math.abs(r.dy) > 1e-6).slice(0, 3)));
// setZoom is zoomAt about the middle, which is the other half of the same contract.
const centred = R(ctx, `
  Render.setZoom(1);
  Render.camX = G.map.w * TILE / 2 - Render.viewWorldW() / 2; Render.camY = G.map.h * TILE / 2 - Render.viewWorldH() / 2;
  const before = Render.screenToWorld(${VIEW_W} / 2, ${VIEW_H} / 2);
  Render.setZoom(0.45);
  const after = Render.screenToWorld(${VIEW_W} / 2, ${VIEW_H} / 2);
  Render.setZoom(1);
  return { dx: after[0] - before[0], dy: after[1] - before[1] };
`);
ok('and setZoom holds the centre of the viewport', Math.abs(centred.dx) < 1e-6 && Math.abs(centred.dy) < 1e-6, JSON.stringify(centred));

// ============================================================================
// 4. It draws at every zoom, with four hundred units on screen
// ============================================================================
// Four hundred spawned into a ball and settled by the simulation's own separation, the same population
// test/renderfeel.js builds -- and then drawn at every zoom from fully in to fully out. Zoomed out is
// the state nothing else in this suite ever visits, and it is the state where a cull written against
// viewW rather than the world width silently stops drawing half the map.
const PACK = `
  const ARMY = ['marine', 'firebat', 'medic', 'siege_tank', 'vulture', 'goliath', 'wraith', 'zergling', 'hydralisk', 'ultralisk', 'scv', 'dropship', 'science_vessel', 'zealot', 'dragoon'];
  const cx = G.map.w * TILE / 2, cy = G.map.h * TILE / 2;
  for (let i = 0; i < 420; i++) {
    const a = i * 2.39996, rr = Math.sqrt(i / 420) * 11 * TILE;
    const t = G.map.findFreeTile(Math.floor((cx + Math.cos(a) * rr) / TILE), Math.floor((cy + Math.sin(a) * rr) / TILE), 16);
    if (!t) continue;
    const u = G.spawnUnit(ARMY[i % ARMY.length], i % 2, (t[0] + .5) * TILE, (t[1] + .5) * TILE);
    u.px = u.x; u.py = u.y; u.facing = (i % 16) / 16 * Math.PI * 2;
    if (i % 5 === 0) u.hp = u.maxHp * 0.2;
    if (i % 3 === 0) u.lastFire = G.frame;
  }
  for (let f = 0; f < 24; f++) G.tick();
  G.rebuildGrid(); G.updateVision();
`;
START('temple', PACK);
const levels = R(ctx, `
  const lo = Render.zoomLimits().lo, rows = [];
  Render.setZoom(1); Render.frame(0);                      // warm the caches once
  for (const z of [2.6, 1.6, 1, 0.8, 0.6, 0.5, 0.49, 0.3, lo]) {
    Render.setZoom(z);
    Render.camX = G.map.w * TILE / 2 - Render.viewWorldW() / 2; Render.camY = G.map.h * TILE / 2 - Render.viewWorldH() / 2; Render.clampCam();
    _rec.reset(); _rec.on = true;
    let threw = null;
    try { for (let i = 0; i < 3; i++) { G.tick(); Render.frame(i / 3); } } catch (e) { threw = String(e && e.stack || e); }
    _rec.on = false;
    rows.push({ z: Render.zoom, icons: Render.iconMode(), calls: _rec.calls, threw });
  }
  Render.setZoom(1);
  return { rows, units: G.units.filter(u => u.alive).length };
`);
ok(levels.units + ' units draw at nine zoom levels without throwing',
  levels.rows.every(r => r.threw === null), JSON.stringify((levels.rows.find(r => r.threw) || {}).threw || '').slice(0, 300));
ok('and every one of them puts something on the screen', levels.rows.every(r => r.calls > 20), JSON.stringify(levels.rows.map(r => [num(r.z), r.calls])));

// The cull, directly. Every `inView` and every layer transform in the draw pass had `viewW` in it, and
// the one that stays behind when the rest are converted stops drawing exactly the units that are
// on screen only because the camera pulled back -- which is invisible at zoom 1 and is the whole point
// of the feature at 0.3. So: a unit parked outside the zoom-1 viewport and inside the zoomed-out one,
// with the simulation frozen, and `u._x` (which only the draw pass sets) as the probe.
const cull = R(ctx, `
  Render.setZoom(1);
  Render.camX = G.map.w * TILE / 2 - Render.viewWorldW() / 2; Render.camY = G.map.h * TILE / 2 - Render.viewWorldH() / 2; Render.clampCam();
  const far = G.spawnUnit('marine', 0, Render.camX + ${VIEW_W} * 1.4, Render.camY + ${VIEW_H} / 2);
  far.px = far.x; far.py = far.y;
  G.rebuildGrid(); G.updateVision();
  const probe = z => { Render.setZoom(z); Render.camX = G.map.w * TILE / 2 - Render.viewWorldW() / 2; Render.camY = G.map.h * TILE / 2 - Render.viewWorldH() / 2; Render.clampCam();
                       far._x = undefined; Render.frame(0); return far._x !== undefined; };
  const near = probe(1), out = probe(0.3);
  Render.setZoom(1); G.kill(far, null, true); G.units = G.units.filter(u => u.alive); G.rebuildGrid(); G.updateVision();
  return { near, out };
`);
ok('a unit off the edge of the zoom-1 view is culled there and drawn once the camera pulls back',
  cull.near === false && cull.out === true, JSON.stringify(cull));

// ============================================================================
// 5. Icon mode: where it engages, and what it costs
// ============================================================================
const gate = R(ctx, `
  const icon = Render.zoomLimits().icon, out = {};
  for (const [k, z] of [['above', icon + 0.01], ['at', icon], ['below', icon - 0.01], ['far', Render.zoomLimits().lo]]) {
    Render.setZoom(z); out[k] = { z: Render.zoom, icons: Render.iconMode() };
  }
  Render.setZoom(1);
  return { out, icon };
`);
ok('icon mode is off at and above the ' + gate.icon + ' threshold and on below it',
  !gate.out.above.icons && !gate.out.at.icons && gate.out.below.icons && gate.out.far.icons, JSON.stringify(gate.out));

const icons = R(ctx, `
  Render.setZoom(Render.zoomLimits().lo);
  Render.camX = G.map.w * TILE / 2 - Render.viewWorldW() / 2; Render.camY = G.map.h * TILE / 2 - Render.viewWorldH() / 2; Render.clampCam();
  Render.frame(0);
  const list = G.units.filter(u => u.alive && !u.inside && u._x !== undefined);
  const drawable = list.filter(u => { const d = u.def; return !(d.larva || d.egg || d.mine || d.notUnit || u.burrowed || u._alpha < 0.3); });
  _rec.reset(); _rec.on = true; Render.drawIcons(Render.ctx, list); _rec.on = false;
  // the outline path is emitted first and holds exactly one moveTo per icon
  const upto = _rec.ops.findIndex(o => o.op === 'stroke');
  const outline = _rec.ops.slice(0, upto).filter(o => o.op === 'moveTo').length;
  const roles = {}; for (const u of drawable) { const r = Render.roleOf(u.def); roles[r] = (roles[r] || 0) + 1; }
  // the same units drawn the other way, for the comparison that is the point of the whole design
  _rec.reset(); _rec.on = true; Render.drawSprites(Render.ctx, list); _rec.on = false;
  const spriteCalls = _rec.calls, spriteBlits = _rec.ops.filter(o => o.op === 'drawImage').length;
  Render.setZoom(1);
  return { list: list.length, drawable: drawable.length, outline, roles,
           iconCalls: (() => { Render.setZoom(Render.zoomLimits().lo); _rec.reset(); _rec.on = true; Render.drawIcons(Render.ctx, list); _rec.on = false; const n = _rec.calls; const blits = _rec.ops.filter(o => o.op === 'drawImage').length; Render.setZoom(1); return [n, blits]; })(),
           spriteCalls, spriteBlits, players: G.players.length };
`);
ok('every drawable unit gets an icon (' + icons.outline + ' of ' + icons.drawable + ')', icons.outline === icons.drawable, JSON.stringify({ o: icons.outline, d: icons.drawable, l: icons.list }));
ok('and they carry more than one role: ' + Object.entries(icons.roles).map(([k, v]) => k + ' ' + v).join(', '),
  Object.keys(icons.roles).length >= 4, JSON.stringify(icons.roles));
ok('the whole icon pass is ' + icons.iconCalls[0] + ' draw calls for ' + icons.drawable + ' units -- about two per player, not one per unit',
  icons.iconCalls[0] <= icons.players * 2 + 4, JSON.stringify(icons));
ok('and none of them is a blit, which is the entire reason it is geometry (' + icons.spriteBlits + ' blits on the sprite path)',
  icons.iconCalls[1] === 0 && icons.spriteBlits > icons.drawable, JSON.stringify(icons));
ok('so drawing the same army as icons is cheaper than drawing it as sprites (' + icons.iconCalls[0] + ' vs ' + icons.spriteCalls + ' calls)',
  icons.iconCalls[0] < icons.spriteCalls / 4, JSON.stringify(icons));

// The property that makes zooming out useful rather than merely possible: an icon stops shrinking.
const size = R(ctx, `
  const u = G.units.find(x => x.alive && !x.isBuilding && x.def.id === 'marine');
  const b = G.units.find(x => x.alive && x.isBuilding);
  const rows = [];
  for (const z of [0.5, 0.3, 0.2, Render.zoomLimits().lo]) { Render.setZoom(z); rows.push({ z: Render.zoom, screen: Render.iconH(u) * Render.zoom, world: Render.iconH(u), b: b ? Render.iconH(b) * Render.zoom : 0 }); }
  Render.setZoom(1);
  return rows;
`);
const screens = size.map(r => r.screen);
ok('an icon holds a constant screen size as the camera pulls back (' + screens.map(v => num(v)).join(', ') + ' px)',
  Math.max(...screens) - Math.min(...screens) < 1e-9 && screens[0] > 3, JSON.stringify(size));
ok('and it grows in WORLD units as it does, which is what stops the army vanishing',
  size[size.length - 1].world > size[0].world * 1.5, JSON.stringify(size.map(r => [num(r.z), num(r.world)])));

// ============================================================================
// 6. The terrain chunks are blitted scaled, not re-baked per zoom level
// ============================================================================
// The decision this file documents, asserted rather than described. A zoom-keyed chunk cache is the
// obvious first implementation and it is unaffordable: renderChunk is a per-pixel noise loop, the
// viewport holds twenty times as many chunks fully zoomed out, and a wheel produces a new scale every
// notch, so the cache would be thrashed rather than filled.
const chunks = R(ctx, `
  Render.setZoom(1); Render.camX = G.map.w * TILE / 2 - Render.viewWorldW() / 2; Render.camY = G.map.h * TILE / 2 - Render.viewWorldH() / 2;
  Terrain.chunks.clear(); Terrain.clearOverview();
  Render.frame(0); Render.frame(0);
  const atOne = Terrain.chunks.size;
  // pull out past OVER_Z: the strategic view must bake nothing at all. Drawn twice and the SECOND one
  // measured, because the first bakes the overview bitmap and that putImageData is a draw call too.
  Render.setZoom(Render.zoomLimits().lo); Render.clampCam();
  Terrain.draw(Render.ctx, Render.camX, Render.camY, Render.viewWorldW(), Render.viewWorldH(), Render.zoom);
  _rec.reset(); _rec.on = true; Terrain.draw(Render.ctx, Render.camX, Render.camY, Render.viewWorldW(), Render.viewWorldH(), Render.zoom); _rec.on = false;
  const outCalls = _rec.calls, outBaked = Terrain.chunks.size;
  const ov = Terrain.overview();
  // and coming back in must find the chunks it left there, not a cache keyed on a zoom that has moved
  Render.setZoom(1); Render.clampCam();
  _rec.reset(); _rec.on = true; Terrain.draw(Render.ctx, Render.camX, Render.camY, Render.viewWorldW(), Render.viewWorldH(), 1); _rec.on = false;
  const backCalls = _rec.calls, backBaked = Terrain.chunks.size;
  // an in-between zoom draws the overview underneath while it is still filling in, then stops
  Render.setZoom(0.7); Render.clampCam();
  Terrain.draw(Render.ctx, Render.camX, Render.camY, Render.viewWorldW(), Render.viewWorldH(), 0.7);
  const partial = Terrain.chunks.size;
  Render.setZoom(1);
  return { atOne, outCalls, outBaked, backCalls, backBaked, partial, ovW: ov.width, ovH: ov.height, mapW: G.map.w, over: Terrain.OVER_Z, px: Terrain.OVER_PX, budget: Terrain.CHUNK_BUDGET };
`);
ok('the strategic view is ONE blit and bakes no chunks at all (' + chunks.outCalls + ' call, ' + chunks.atOne + ' chunks before and after)',
  chunks.outCalls === 1 && chunks.outBaked === chunks.atOne, JSON.stringify(chunks));
ok('the overview is the whole map at ' + chunks.px + ' px a tile (' + chunks.ovW + 'x' + chunks.ovH + ')',
  chunks.ovW === chunks.mapW * chunks.px, JSON.stringify(chunks));
ok('and zooming back in re-uses the chunks rather than re-baking them',
  chunks.backBaked === chunks.atOne && chunks.backCalls === chunks.atOne, JSON.stringify(chunks));
ok('an intermediate zoom bakes at most ' + chunks.budget + ' new chunks a frame, so a camera jump cannot stall the pass',
  chunks.partial - chunks.backBaked <= chunks.budget, JSON.stringify(chunks));

// ============================================================================
// 7. Day and night
// ============================================================================
// G.daylight belongs to the simulation and may not exist. Everything not a finite number in 0..1 has
// to read as broad daylight, because a renderer that turned an absent field into a black screen would
// be a renderer that broke every save taken before the clock landed.
const dayRead = R(ctx, `
  const out = {};
  const at = v => { if (v === '__del') delete G.daylight; else G.daylight = v; return { day: Render.daylight(), night: Render.night() }; };
  out.undef = at('__del'); out.one = at(1); out.half = at(0.5); out.zero = at(0);
  out.nul = at(null); out.nan = at(NaN); out.str = at('0.5'); out.inf = at(Infinity);
  out.neg = at(-3); out.over = at(5); out.bool = at(true);
  delete G.daylight;
  return out;
`);
ok('G.daylight undefined is broad daylight, which is the state the sim half has not landed in yet',
  dayRead.undef.day === 1 && dayRead.undef.night === 0, JSON.stringify(dayRead.undef));
ok('1 is day, 0.5 is dusk and 0 is deep night',
  dayRead.one.day === 1 && dayRead.half.day === 0.5 && dayRead.zero.day === 0 && dayRead.zero.night === 1 && dayRead.half.night > 0 && dayRead.half.night < 1,
  JSON.stringify([dayRead.one, dayRead.half, dayRead.zero]));
ok('null, NaN, a string, Infinity and a boolean are all read as daylight rather than as darkness',
  [dayRead.nul, dayRead.nan, dayRead.str, dayRead.inf, dayRead.bool].every(v => v.day === 1 && v.night === 0), JSON.stringify(dayRead));
ok('and a number outside 0..1 is clamped rather than trusted',
  dayRead.neg.day === 0 && dayRead.over.day === 1, JSON.stringify([dayRead.neg, dayRead.over]));

const nightDraw = R(ctx, `
  Render.setZoom(1); Render.camX = G.map.w * TILE / 2 - Render.viewWorldW() / 2; Render.camY = G.map.h * TILE / 2 - Render.viewWorldH() / 2;
  Render.frame(0);
  const list = G.units.filter(u => u.alive && !u.inside && u._x !== undefined);
  const out = {};
  for (const [k, v] of [['day', 1], ['dusk', 0.5], ['deep', 0], ['absent', '__del']]) {
    if (v === '__del') delete G.daylight; else G.daylight = v;
    _rec.reset(); _rec.on = true;
    let threw = null; try { Render.drawNight(Render.ctx, list); } catch (e) { threw = String(e && e.message || e); }
    _rec.on = false;
    const lit = Render.nightLights(list);
    out[k] = { calls: _rec.calls, threw, hot: lit[0].length / 3, dim: lit[1].length / 3 };
  }
  // a whole frame at each, which is the path that actually ships
  let frameThrew = null;
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    G.daylight = v;
    try { for (let i = 0; i < 2; i++) { G.tick(); Render.frame(0.5); } } catch (e) { if (!frameThrew) frameThrew = 'daylight ' + v + ': ' + (e && e.stack || e); }
  }
  // and zoomed out at night, which is both new paths at once
  G.daylight = 0; Render.setZoom(Render.zoomLimits().lo); Render.clampCam();
  try { for (let i = 0; i < 2; i++) { G.tick(); Render.frame(0.5); } } catch (e) { if (!frameThrew) frameThrew = 'night+icons: ' + (e && e.stack || e); }
  Render.setZoom(1); Render.clampCam();
  const held = G.daylight;
  delete G.daylight;
  return { out, frameThrew, held };
`);
const ND = nightDraw.out;
ok('nothing throws with G.daylight at 0, 0.5, 1 or absent', Object.values(ND).every(v => v.threw === null) && nightDraw.frameThrew === null, String(nightDraw.frameThrew).slice(0, 300));
ok('the night pass draws nothing in broad daylight and nothing when the field is absent',
  ND.day.calls === 0 && ND.absent.calls === 0, JSON.stringify(ND));
ok('it draws at dusk and at midnight -- the same pass at a stronger alpha (' + ND.dusk.calls + ' and ' + ND.deep.calls + ' calls)',
  ND.dusk.calls > 0 && ND.deep.calls > 0, JSON.stringify(ND));
ok('and it finds light sources to pool around: ' + ND.deep.hot + ' hot, ' + ND.deep.dim + ' dim',
  ND.deep.hot > 0 && ND.deep.dim > 0, JSON.stringify(ND.deep));
ok('drawing at night does not write G.daylight', nightDraw.held === 0, String(nightDraw.held));

// The static half of the same claim, in the shape test/renderfeel.js uses for the hazard.
for (const f of ['render', 'fx', 'terrain']) {
  const src = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
  const bad = src.match(/daylight\s*=[^=]|G\.daylight\s*[-+*/]?=[^=]/g);
  ok('js/' + f + '.js contains no assignment to G.daylight', !bad, bad && bad.join(' | '));
}

// ============================================================================
// 8. Zooming and nightfall do not touch the simulation
// ============================================================================
// The same instrument test/renderfeel.js points at the hazard, pointed at the two new paths: run the
// sim, draw thirty frames while sweeping the zoom and the clock through every branch, and require
// both the state hash across those frames and the state the run ends in to be exactly what they would
// have been if nothing had ever been drawn.
const purity = R(ctx, `
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 11, layout: 'temple' });
  G.human = 0;
  Render.W = ${VIEW_W}; Render.H = ${VIEW_H + 120}; Render.viewW = ${VIEW_W}; Render.viewH = ${VIEW_H}; Render.dpr = 1;
  Render.reset(); Render.built = false; Render.camX = 0; Render.camY = 0;
  for (let f = 0; f < 600; f++) G.tick();
  const before = G.stateHash();
  let threw = null;
  try {
    for (let i = 0; i < 30; i++) {
      Render.setZoom(Render.zoomLimits().lo + (i / 29) * (1.6 - Render.zoomLimits().lo));
      Render.zoomAt(Render.zoom * 0.97, (i * 37) % ${VIEW_W}, (i * 53) % ${VIEW_H});
      G.daylight = i / 29;
      Render.frame(i / 30);
    }
  } catch (e) { threw = String(e && e.stack || e); }
  const after = G.stateHash();
  delete G.daylight; Render.setZoom(1);
  for (let f = 0; f < 200; f++) G.tick();
  return { before, after, threw, drawnRun: G.stateHash(), frame: G.frame };
`);
const control = R(ctx, `
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 11, layout: 'temple' });
  for (let f = 0; f < 800; f++) G.tick();
  return { hash: G.stateHash(), frame: G.frame };
`);
ok('thirty frames of sweeping the zoom and the clock do not throw', purity.threw === null, String(purity.threw).slice(0, 300));
ok('and leave the simulation state untouched', purity.before === purity.after, purity.before + ' vs ' + purity.after);
ok('a game that was drawn zoomed and at night re-simulates to the same state as one that was not',
  purity.drawnRun === control.hash && purity.frame === control.frame, purity.drawnRun + ' vs ' + control.hash);

// ============================================================================
// 10. Zoomed out past the map fit, the void stays void
// ============================================================================
// Two bugs, one symptom, reported from playtest as "when I zoom out all the way, the left side of the
// screen is replicated infinitely -- there are several left edges".
//
// Neither was reachable before the strategic zoom, because both depend on the viewport being LARGER
// THAN THE WORLD, which could not happen when the camera was clamped inside the map at zoom 1.
//
//  a) NOTHING CLEARED THE CANVAS. Render.base only resets the transform. At zoom 1 the terrain covers
//     every pixel of the viewport every frame, so a clear was pure waste and its absence was invisible
//     for the entire life of the renderer. Zoomed out past the map fit the terrain no longer reaches
//     the edges, and those pixels are simply never written again -- they keep whatever the last frame
//     that DID reach them left there. Panning smears copies of the map edge across the void and they
//     accumulate, because nothing ever erases them.
//
//  b) drawFog BUILT A SOURCE RECTANGLE FROM THE CAMERA WITHOUT CLAMPING IT. The fog bitmap is one
//     pixel per tile, 128 wide on a standard map; at minimum zoom the rect asked for was x -90.2,
//     width 307. What a browser does with a source rect mostly outside its image is not something to
//     rely on -- with smoothing on, edge texels clamp and column 0 smears across the whole void.
//     Terrain.drawOverview already clips both rectangles together and says why in a comment; drawFog
//     was written before there was any way to see it and never learned.
//
// Both are asserted structurally rather than by reading pixels, because this harness has no real
// canvas: (a) as "the first drawing op of a frame covers the whole viewport", and (b) by capturing the
// arguments drawFog actually passes.
{
  const clear = R(ctx, `
    G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, name: 'B' }], seed: 4, layout: 'temple' });
    for (const p of G.players) p.ai = null;
    G.human = 0; Render.reset(); Render.resize();
    for (let i = 0; i < 4; i++) G.tick();
    const out = {};
    Render.setZoom(Render.zoomLimits().lo); Render.clampCam();
    out.zoom = Render.zoom;
    out.viewWiderThanMap = Render.viewWorldW() > G.map.w * TILE;
    out.camNegative = Render.camX < 0;
    _rec.reset(); _rec.on = true; Render.frame(0); _rec.on = false;
    // (a) the first thing drawn must cover the whole viewport
    const first = _rec.ops.find(o => o.op === 'fillRect' || o.op === 'clearRect' || o.op === 'drawImage');
    out.firstOp = first ? first.op : null;
    out.firstArgs = first ? first.a.slice(0, 4).map(v => (v && typeof v === 'object') ? 'IMG' : (typeof v === 'number' ? Math.round(v) : String(v))) : null;
    out.coversViewport = !!(first && (first.op === 'fillRect' || first.op === 'clearRect')
      && first.a[0] <= 0 && first.a[1] <= 0 && first.a[2] >= Render.W && first.a[3] >= Render.H);
    return out;
  `);

  ok('zoomed fully out the viewport really is wider than the world', clear.viewWiderThanMap && clear.camNegative,
    JSON.stringify({ zoom: num(clear.zoom), wider: clear.viewWiderThanMap, camNeg: clear.camNegative }));
  ok('a frame begins by clearing the whole viewport -- without it the void keeps the last frame that reached it',
    clear.coversViewport, clear.firstOp + ' ' + JSON.stringify(clear.firstArgs));

  // (b) every source rectangle drawFog asks for has to lie inside the fog bitmap
  const fog = R(ctx, `
    const out = { rects: [], bitmap: [G.map.w, G.map.h] };
    const real = Render.ctx.drawImage;
    const seen = [];
    Render.ctx.drawImage = function (img, ...a) { if (img === Render.fogCanvas && a.length >= 8) seen.push(a.slice(0, 4)); return real.call(this, img, ...a); };
    for (const z of [1, 0.6, 0.45, 0.3, Render.zoomLimits().lo]) {
      Render.setZoom(z); Render.clampCam();
      Render.drawFog(Render.ctx, G.players[0].vis, Render.camX, Render.camY);
    }
    Render.ctx.drawImage = real;
    out.rects = seen;
    return out;
  `);
  const [bw, bh] = fog.bitmap;
  const bad = fog.rects.filter(([sx, sy, sw, sh]) =>
    sx < 0 || sy < 0 || sw <= 0 || sh <= 0 || sx + sw > bw + 0.001 || sy + sh > bh + 0.001);
  ok('drawFog samples inside its own bitmap at every zoom -- a source rect off the edge is where the smear came from',
    fog.rects.length > 0 && bad.length === 0,
    'bitmap ' + bw + 'x' + bh + ', bad ' + JSON.stringify(bad.slice(0, 3)) + ' of ' + fog.rects.length);
}

// ============================================================================
// 9. The build stamp does not move
// ============================================================================
// Invariant 6, asserted as the invariant rather than against a hardcoded hash: three agents are
// editing simulation files this milestone and a literal would go stale the first time one of them
// landed. What this proves is the thing that matters -- that render.js, terrain.js and fx.js are not
// in the digest, so a zoom cannot refuse a save.
R(ctx, "if (G.__dayDesc) { delete G.daylight; Object.defineProperty(G, 'daylight', G.__dayDesc); delete G.__dayDesc; }");
const bare = mkCtx2(false);
// ============================================================================
// 7. A map taller than it is wide draws its lower chunk rows (the live half of review17ui section 11)
// ============================================================================
// The chunk clamp read the map WIDTH for both axes (REVIEW-M17), so a 64x128 editor map lost every chunk
// row below the 64th tile: the camera at the bottom of the map baked nothing there. An editor-made
// 64x128 layout, the camera at its foot, and the chunk rows that get baked.
{
  const ed = (() => { const c = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, clearTimeout, setInterval() { return 0; }, addEventListener() { }, localStorage: { getItem() { return null; }, setItem() { } }, document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, value: '', appendChild() { }, options: [] }), createElement: () => ({ style: {}, addEventListener() { }, getContext: () => null }), addEventListener() { }, body: { appendChild() { } }, querySelectorAll: () => [] }, requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, prompt: () => 'x' }; c.window = c; vm.createContext(c); for (const f of SIM.concat(['editor'])) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' }); return c; })();
  const layout = R(ed, `Editor.canvas = { width: 1280, height: 720 }; Editor.W = 64; Editor.H = 128; Editor.blank(); Editor.name = 'Tall'; Editor.tileset = 'desert'; Editor.mirror = 'off'; Editor.mark(); Editor.addBase(32, 16, true); Editor.addBase(32, 112, true); return JSON.stringify(Editor.toLayout());`);
  R(ctx, 'MAP_LAYOUTS["custom:Tall"] = ' + layout + ';');
  const tall = START('custom:Tall');
  const rows = R(ctx, `
    Render.setZoom(1); Render.camX = 0; Render.camY = G.map.h * TILE - Render.viewWorldH(); Render.clampCam();
    Terrain.chunks.clear(); Terrain.clearOverview();
    for (let i = 0; i < 12; i++) Terrain.draw(Render.ctx, Render.camX, Render.camY, Render.viewWorldW(), Render.viewWorldH(), 1);   // the bake is budgeted per draw; several draws fill the view
    const cys = [...Terrain.chunks.keys()].map(k => parseInt(k.split(',')[1], 10));
    return { w: G.map.w, h: G.map.h, CH: Terrain.CH, camY: Render.camY, baked: Terrain.chunks.size, maxCy: cys.length ? Math.max(...cys) : -1, lastRow: Math.ceil(G.map.h / Terrain.CH) - 1, widthRows: Math.ceil(G.map.w / Terrain.CH) };`);
  ok('the editor made a 64x128 map and the renderer opened it', tall.w === 64 && tall.h === 128 && rows.w === 64 && rows.h === 128, JSON.stringify([tall, rows]));
  ok('with the camera at the foot of the map, the LAST chunk row is baked -- rows past the width\'s worth (was: nothing below the 64th tile)', rows.maxCy === rows.lastRow && rows.maxCy >= rows.widthRows, JSON.stringify(rows));
  R(ctx, 'delete MAP_LAYOUTS["custom:Tall"];');
  START('temple');
}

const hBare = R(bare, 'return BUILD.hash();');
const hFull = R(ctx, 'return BUILD.hash();');
ok('the build stamp is the same with the render files loaded and without: ' + hBare, hBare === hFull, hBare + ' vs ' + hFull);
ok('and it is a 16-character hash', /^[0-9a-f]{16}$/.test(hBare), hBare);
ok('no simulation errors were logged while drawing', ctx._errors.length === 0, ctx._errors.slice(0, 3).join(' | '));

console.log(fail ? `FAIL  ${pass} passed, ${fail} failed   build ${hBare}` : `ALL PASS  ${pass} passed, 0 failed   build ${hBare}`);
process.exit(fail ? 1 : 0);
