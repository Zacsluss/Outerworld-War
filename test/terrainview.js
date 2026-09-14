// Detailed terrain far off and fast (the terrain queue's phase 4, item 4: "A matching zoomed-out view and minimap, plus a speed check
// on the biggest map"), with texture data handed to the renderer -- the headless suites have no images.
//   node test/terrainview.js
//
// The frame times themselves are measured in a browser and recorded in PLAYTEST-M18 113 (this repository promises no wall-clock
// budgets in the gate). What is asserted is what those numbers rest on, each with a negative control
// (.claude/review/terrain/controls-terrainview.js):
//  1. THE GROUND UNDER A HULK IS THE GROUND. A hulk raises its tiles to height 2 in the simulation; a chunk, the ramp levels, the
//     overview and the classic look's chunk all come out byte-identical with a hulk standing as without.
//  2. THE OVERVIEW IS THE CHUNKS SEEN FROM AFAR: tile by tile its brightness follows the chunks' closely where the palette's does
//     not; painted a few rows a step it is byte-identical to painting it at once.
//  3. THE MINIMAP IS THE TEXTURED OVERVIEW, A TILE A PIXEL.
//  4. THE BUDGET: an empty view bakes one chunk a draw when frames are slow and CHUNK_BUDGET when they are fast, nearest the middle
//     first, with the overview drawn under what is missing and not once the view is whole; then one chunk of the ring round the view
//     a draw, nothing beyond it, and nothing ahead when the view and its ring would not fit under CHUNK_CAP.
//  5. A FEATURE CHANGE drops only the chunks round it and repaints only that part of the overview; a new map drops nothing.
//  6. TEXTURES ARRIVING: the textured overview is painted a step a draw, never on a draw that bakes, and the minimap follows it.
//  7. THE MINIMAP'S UNIT DOTS each sit on a dark rim, every rim drawn before the first dot.
//  9. NO SEAM BETWEEN CHUNKS AT ANY ZOOM (the user's playtest: "dark tile lines in a grid"): in device pixels, every pixel on a
//     boundary between two chunks is covered whole by the chunk drawn first, the other drawn after it, and no chunk is stretched by
//     more than a pixel; at zoom 1 every chunk is exactly its size, on whole pixels.
//  8. DETAILED BY DEFAULT, CLASSIC ONE CLICK AWAY (phase 5): detailed before any setting is read; whole frames of every tileset bake
//     every chunk from the textures; switching to Classic mid-game bakes the palette's ground though the textures are loaded, and
//     the minimap and the far view follow; switching back steps the textured overview in rather than painting it in one frame.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const { ok, summary, root } = require('./_harness');

// A canvas that keeps the ImageData put on it and records what is drawn, with the source of every drawImage and the style of every fill.
function recorder() { return { ops: [], on: false, reset() { this.ops.length = 0; } }; }
function mkCtx(cv, rec) {
  const grad = () => ({ addColorStop() { } });
  const c = {
    canvas: cv, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over', font: '10px sans-serif',
    filter: 'none', imageSmoothingEnabled: true, imageSmoothingQuality: 'low', shadowBlur: 0, shadowColor: '#000', textAlign: 'start', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0,
    createLinearGradient: grad, createRadialGradient: grad, createConicGradient: grad, createPattern: () => ({ setTransform() { } }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    measureText: t => ({ width: String(t).length * 6 }), isPointInPath: () => false, getLineDash: () => [], setLineDash() { },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  for (const k of ['save', 'restore', 'setTransform', 'resetTransform', 'transform', 'translate', 'rotate', 'scale', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'rect', 'roundRect', 'quadraticCurveTo', 'bezierCurveTo', 'clip', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'fillText', 'strokeText']) {
    c[k] = function (...a) { if (rec.on) rec.ops.push({ op: k, a, fs: String(c.fillStyle), src: k === 'drawImage' ? a[0] : null, smooth: c.imageSmoothingEnabled }); };
  }
  c.putImageData = function (img, ...a) { cv.img = img; if (rec.on) rec.ops.push({ op: 'putImageData', a }); };
  return c;
}
function mkCanvas(rec) {
  const cv = { width: 300, height: 150, style: {}, _ctx: null, img: null };
  cv.getContext = () => cv._ctx || (cv._ctx = mkCtx(cv, rec));
  cv.addEventListener = () => { }; cv.appendChild = () => { }; cv.remove = () => { }; cv.click = () => { }; cv.value = ''; cv.toDataURL = () => '';
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: cv.width, height: cv.height });
  return cv;
}
const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud', 'codex'];
const errors = [], rec = recorder();
const ctx = {
  console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0] && a[0].message || a[0])) },
  Math, performance, setTimeout, clearTimeout, clearInterval, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  devicePixelRatio: 1, innerWidth: 800, innerHeight: 620, localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost', search: '' },
  document: { getElementById: () => mkCanvas(rec), createElement: () => mkCanvas(rec), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
ctx._rec = rec;
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const R = src => vm.runInContext('(() => {' + src + '})();', ctx);
const initialLook = vm.runInContext('Terrain.textured', ctx);   // before this suite or any setting touches it

// Texture data for every tileset: a colour per material with broad blobs and grain, periodic in the texture.
vm.runInContext(`
  var TT = {
    tex(base, amp, seed) {
      const S = Terrain.TEX_PX, d = new Uint8ClampedArray(S * S * 4), f = 2 * Math.PI / S;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const blob = Math.sin(x * f * 3 + seed) * Math.cos(y * f * 2 + seed * 1.7) + 0.5 * Math.sin((x + y) * f * 5 + seed * 0.3);
        const grain = ((Math.imul((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791), 2654435761) >>> 0) % 17) - 8, v = blob * amp + grain, p = (y * S + x) * 4;
        d[p] = base[0] + v; d[p + 1] = base[1] + v; d[p + 2] = base[2] + v; d[p + 3] = 255;
      }
      return d;
    },
    corr(a, b) { const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; } return sab / Math.sqrt(saa * sbb || 1); },
    draw() { Terrain.draw(Render.ctx, Render.camX, Render.camY, Render.viewWorldW(), Render.viewWorldH(), Render.zoom); },
    // the chunk keys in view and the view's chunk rectangle, as Terrain.draw works them out
    view() {
      const C = Terrain.CH * TILE, maxCx = Math.ceil(G.map.w / Terrain.CH), maxCy = Math.ceil(G.map.h / Terrain.CH), vw = Render.viewWorldW(), vh = Render.viewWorldH();
      const r = { x0: Math.max(0, Math.floor(Render.camX / C)), y0: Math.max(0, Math.floor(Render.camY / C)), x1: Math.min(maxCx - 1, Math.floor((Render.camX + vw) / C)), y1: Math.min(maxCy - 1, Math.floor((Render.camY + vh) / C)), maxCx, maxCy, keys: [] };
      for (let cy = r.y0; cy <= r.y1; cy++) for (let cx = r.x0; cx <= r.x1; cx++) r.keys.push(cx + ',' + cy);
      r.mx = (Render.camX + vw / 2) / C - 0.5; r.my = (Render.camY + vh / 2) / C - 0.5;
      return r;
    },
    start(layout, textured) {
      Terrain.textured = textured !== false;
      UI.start({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'Z', human: false, name: 'B', team: 2 }], seed: 4, layout });
      UI.menu = null; G.paused = true; UI.viewAll = true; for (const p of G.players) p.ai = null;
      Render.init(document.getElementById('game')); Render.W = 800; Render.H = 620; Render.viewW = 800; Render.viewH = 500; Render.dpr = 1; Render.setZoom(1);
      return G.map;
    },
    // the overview's brightness, averaged over each tile of chunk (cx, cy)
    ovTiles(img, cx, cy) { const m = G.map, K = Terrain.OVER_PX, W = m.w * K, CH = Terrain.CH, out = []; for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) { const tx = cx * CH + i, ty = cy * CH + j; let s = 0; for (let y = 0; y < K; y++) for (let x = 0; x < K; x++) { const p = ((ty * K + y) * W + tx * K + x) * 4; s += img[p] * 0.2126 + img[p + 1] * 0.7152 + img[p + 2] * 0.0722; } out.push(s / (K * K)); } return out; },
    chunkTiles(d) { const CH = Terrain.CH, P = CH * TILE, out = []; for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) { let s = 0; for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const p = ((j * TILE + y) * P + i * TILE + x) * 4; s += d[p] * 0.2126 + d[p + 1] * 0.7152 + d[p + 2] * 0.0722; } out.push(s / (TILE * TILE)); } return out; },
    // the largest difference in any channel between a minimap and its overview's K x K average
    miniWorst(mini, img) { const m = G.map, K = Terrain.OVER_PX, W = m.w * K, d = mini.img.data; let worst = 0; for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) for (let c = 0; c < 3; c++) { let s = 0; for (let y = 0; y < K; y++) for (let x = 0; x < K; x++) s += img[((ty * K + y) * W + tx * K + x) * 4 + c]; worst = Math.max(worst, Math.abs(d[(ty * m.w + tx) * 4 + c] - s / (K * K))); } return worst; },
  };
  TT.T = { low: TT.tex([96, 104, 90], 40, 1), high: TT.tex([200, 190, 170], 25, 2), ramp: TT.tex([150, 140, 120], 30, 3), rock: TT.tex([110, 90, 80], 30, 4) };
  // what Terrain.texSet gives once every texture of a set has loaded: the same pixels every call
  Terrain.texSet = function () { return this.textured && TERRAIN_TEX[this.setId] ? TT.T : null; };
`, ctx);

// ---------------------------------------------------------------------------------------------------------------------------
// 1. The ground under a hulk is the ground
// ---------------------------------------------------------------------------------------------------------------------------
const hulk = R(`
  const m = TT.start('temple'), s = m.starts[0]; let spot = null;
  for (let r = 10; r < 60 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
    const x0 = s.x + dx, y0 = s.y + dy; let fine = true;
    for (let y = y0 - 1; y < y0 + 4 && fine; y++) for (let x = x0 - 1; x < x0 + 5; x++) { if (!m.inb(x, y)) { fine = false; break; } const i = m.idx(x, y); if (m.height[i] !== 0 || m.cliff[i] || m.walk[i] !== 1 || m.blocked[i] !== -1) { fine = false; break; } }
    if (fine) spot = [x0, y0];
  }
  const cx = Math.floor((spot[0] + 2) / Terrain.CH), cy = Math.floor((spot[1] + 1) / Terrain.CH);
  const snap = () => {
    Terrain.chunks.clear(); Terrain._rampLv = null; Terrain._propMask = null; Terrain._ground = null; Terrain.clearOverview();
    const tex = Terrain.renderChunk(cx, cy).img.data.slice(), rl = Terrain.rampLevels().slice(); Terrain.overview(); const ov = Terrain._overImg.data.slice();
    Terrain.textured = false; const pal = Terrain.renderChunk(cx, cy).img.data.slice(); Terrain.textured = true;
    return { tex, rl, ov, pal };
  };
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  const A = snap(), wk = m.addWreck((spot[0] + 2) * TILE, (spot[1] + 1.5) * TILE, 4, 3, 5000, G.frame, true), B = snap();
  return { spot, tiles: wk ? wk.tiles.length : 0, raised: wk ? wk.tiles.filter(i => m.height[i] === 2).length : 0, tex: diff(A.tex, B.tex), rl: diff(A.rl, B.rl), ov: diff(A.ov, B.ov), pal: diff(A.pal, B.pal) };
`);
ok(hulk.tiles === 12 && hulk.raised === 12, 'hulk: a 4x3 hulk on Lost Ruins\' low ground at ' + hulk.spot + ' raises its 12 tiles to height 2 in the simulation', JSON.stringify(hulk));
ok(hulk.tex === 0, 'hulk: the detailed chunk under it is byte-identical to the ground without it', JSON.stringify(hulk));
ok(hulk.ov === 0 && hulk.pal === 0, 'hulk: so are the overview and the classic look\'s chunk', JSON.stringify(hulk));
// ...and at the foot of a ramp, where a hulk read as high ground would be the top of the ramp as far as its levels knew
const foot = R(`
  const m = TT.start('temple'), W = m.w; let run = null;
  for (let y = 1; y < m.h - 3 && !run; y++) for (let x = 1; x < W - 5 && !run; x++) {
    const rampFoot = (xx, yy) => m.height[yy * W + xx] === 1 && m.cliff[yy * W + xx] === 0 && m.height[(yy + 1) * W + xx] === 0 && m.cliff[(yy + 1) * W + xx] === 0 && m.walk[(yy + 1) * W + xx] === 1 && m.blocked[(yy + 1) * W + xx] === -1 && m.blocked[(yy + 2) * W + xx] === -1 && m.walk[(yy + 2) * W + xx] === 1;
    if (rampFoot(x, y) && rampFoot(x + 1, y) && rampFoot(x + 2, y)) run = [x, y];
  }
  if (!run) return { run };
  const [x0, y0] = run, cx = Math.floor(x0 / Terrain.CH), cy = Math.floor(y0 / Terrain.CH);
  const snap = () => { Terrain.chunks.clear(); Terrain._rampLv = null; Terrain._ground = null; return { rl: Terrain.rampLevels().slice(), tex: Terrain.renderChunk(cx, cy).img.data.slice() }; };
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  const A = snap(), wk = m.addWreck((x0 + 1.5) * TILE, (y0 + 2) * TILE, 3, 2, 5000, G.frame, true), B = snap();
  return { run, tiles: wk ? wk.tiles.length : 0, rl: diff(A.rl, B.rl), tex: diff(A.tex, B.tex) };
`);
ok(!!foot.run && foot.tiles === 6 && foot.rl === 0 && foot.tex === 0, 'hulk: a 3x2 hulk at the foot of a ramp (' + foot.run + ') moves no ramp level and no pixel of its chunk', JSON.stringify(foot));

// ---------------------------------------------------------------------------------------------------------------------------
// 2. The overview is the chunks seen from afar
// ---------------------------------------------------------------------------------------------------------------------------
const match = R(`
  const m = TT.start('temple'), CH = Terrain.CH, props = TERRAIN_PROPS.badlands; delete TERRAIN_PROPS.badlands;
  try {
    const s = m.starts[0], cx0 = Math.floor(s.x / CH) - 1, cy0 = Math.floor(s.y / CH) - 1, T = [], O = [], P = [];
    Terrain.clearOverview(); Terrain.overview(); const ov = Terrain._overImg.data.slice();
    Terrain.textured = false; Terrain.clearOverview(); Terrain.overview(); const pv = Terrain._overImg.data.slice(); Terrain.textured = true; Terrain.clearOverview();
    for (let cy = cy0; cy < cy0 + 3; cy++) for (let cx = cx0; cx < cx0 + 3; cx++) { T.push(...TT.chunkTiles(Terrain.renderChunkTex(cx, cy, TT.T).img.data)); O.push(...TT.ovTiles(ov, cx, cy)); P.push(...TT.ovTiles(pv, cx, cy)); }
    const mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
    let spread = 0; const mean = T.reduce((a, b) => a + b, 0) / T.length; for (const v of T) spread += Math.abs(v - mean); spread /= T.length;
    return { tiles: T.length, spread: +spread.toFixed(1), corrTex: +TT.corr(T, O).toFixed(3), madTex: +mad(T, O).toFixed(1), corrPal: +TT.corr(T, P).toFixed(3), madPal: +mad(T, P).toFixed(1) };
  } finally { TERRAIN_PROPS.badlands = props; }
`);
ok(match.tiles === 576 && match.spread > 15, 'overview: 576 tiles round Lost Ruins\' first main, their brightness in the chunks spread by ' + match.spread + ' -- plateau, cliff, ramp and floor', JSON.stringify(match));
ok(match.corrTex > 0.97 && match.madTex < 6, 'overview: tile by tile the textured overview follows the chunks (correlation ' + match.corrTex + ', off by ' + match.madTex + ' on average)', JSON.stringify(match));
ok(match.madPal > match.madTex * 3, 'overview: the palette\'s overview does not (off by ' + match.madPal + ') -- the probe can tell them apart', JSON.stringify(match));

const rows = R(`
  const m = TT.start('temple');
  Terrain.clearOverview(); Terrain.overview(); const whole = Terrain._overImg.data.slice();
  Terrain.textured = false; Terrain.clearOverview(); Terrain.overview(); Terrain.textured = true;
  const stepMs = Terrain.OVER_STEP_MS; Terrain.OVER_STEP_MS = 0; let steps = 1;
  try { while (!Terrain.overviewStep(Terrain.texSet()) && steps < 1000) steps++; } finally { Terrain.OVER_STEP_MS = stepMs; }
  const banded = Terrain._overImg.data; let diff = 0; for (let i = 0; i < whole.length; i++) if (whole[i] !== banded[i]) diff++;
  return { steps, rows: m.h, diff, textured: !!Terrain._overTex };
`);
ok(rows.textured && rows.steps === Math.ceil(rows.rows / 4), 'overview: painted four rows a step, ' + rows.rows + ' rows take ' + rows.steps + ' steps and then it is swapped in', JSON.stringify(rows));
ok(rows.diff === 0, 'overview: and it is byte-identical to the overview painted at once -- rows join without a seam', JSON.stringify(rows));

// ---------------------------------------------------------------------------------------------------------------------------
// 3. The minimap is the textured overview, a tile a pixel
// ---------------------------------------------------------------------------------------------------------------------------
const mini = R(`
  const m = TT.start('medium');
  Terrain.clearOverview(); Terrain.overview(); const img = Terrain._overImg.data, tex = TT.miniWorst(Terrain.buildMini(), img);
  Terrain.textured = false; const pal = TT.miniWorst(Terrain.buildMini(), img); Terrain.textured = true;
  return { tex: +tex.toFixed(2), pal: +pal.toFixed(2) };
`);
ok(mini.tex <= 1, 'minimap: every tile of Contested Ground\'s minimap is the average of its overview block (worst channel off by ' + mini.tex + ')', JSON.stringify(mini));
ok(mini.pal > 20, 'minimap: the palette\'s minimap is not (off by up to ' + mini.pal + ') -- the probe can tell', JSON.stringify(mini));

// ---------------------------------------------------------------------------------------------------------------------------
// 4. The budget
// ---------------------------------------------------------------------------------------------------------------------------
const budget = R(`
  TT.start('temple'); Render.camX = 40 * TILE; Render.camY = 40 * TILE; Render.clampCam();
  Terrain.clearOverview(); Terrain.overview();
  const v = TT.view(), dist = k => { const [x, y] = k.split(',').map(Number); return (x - v.mx) * (x - v.mx) + (y - v.my) * (y - v.my); };
  const nearest = v.keys.slice().sort((a, b) => dist(a) - dist(b))[0], bm = Terrain.BAKE_MS, out = { visible: v.keys.length, nearest, budget: Terrain.CHUNK_BUDGET };
  try {
    // a slow frame: one chunk, the one nearest the middle, and the overview under the rest
    Terrain.chunks.clear(); Terrain.BAKE_MS = 0; _rec.reset(); _rec.on = true; TT.draw(); _rec.on = false;
    out.first = [...Terrain.chunks.keys()]; out.overUnder = _rec.ops.some(o => o.op === 'drawImage' && o.src === Terrain._over);
    // a fast frame: CHUNK_BUDGET of them
    Terrain.chunks.clear(); Terrain.BAKE_MS = 1e9; TT.draw(); out.fast = Terrain.chunks.size;
    // from empty, one a draw until the view and its ring are baked, then nothing
    Terrain.chunks.clear(); Terrain.BAKE_MS = 0; const sizes = [];
    for (let i = 0; i < 100; i++) { TT.draw(); sizes.push(Terrain.chunks.size); if (i && sizes[i] === sizes[i - 1]) break; }
    out.sizes = sizes; out.stepsOfOne = sizes.every((n, i) => i === 0 ? n === 1 : n - sizes[i - 1] <= 1);
    let ringCells = 0; for (let cy = v.y0 - 1; cy <= v.y1 + 1; cy++) for (let cx = v.x0 - 1; cx <= v.x1 + 1; cx++) if (cx >= 0 && cy >= 0 && cx < v.maxCx && cy < v.maxCy && !(cx >= v.x0 && cx <= v.x1 && cy >= v.y0 && cy <= v.y1)) ringCells++;
    const extra = [...Terrain.chunks.keys()].filter(k => !v.keys.includes(k));
    out.ringCells = ringCells; out.extra = extra.length; out.visibleBaked = v.keys.every(k => Terrain.chunks.has(k));
    out.outsideRing = extra.filter(k => { const [x, y] = k.split(',').map(Number); return x < v.x0 - 1 || x > v.x1 + 1 || y < v.y0 - 1 || y > v.y1 + 1; }).length;
    // the visible chunks came first: no ring chunk before the last visible one
    out.visibleFirst = sizes.length >= v.keys.length;
    _rec.reset(); _rec.on = true; TT.draw(); _rec.on = false; out.overWhole = _rec.ops.some(o => o.op === 'drawImage' && o.src === Terrain._over);
    // a cap the view and its ring do not fit under: nothing baked ahead
    const cap = Terrain.CHUNK_CAP; Terrain.chunks.clear(); Terrain.CHUNK_CAP = v.keys.length + 2;
    try { for (let i = 0; i < v.keys.length + 8; i++) TT.draw(); out.capped = Terrain.chunks.size; } finally { Terrain.CHUNK_CAP = cap; }
  } finally { Terrain.BAKE_MS = bm; }
  return out;
`);
ok(budget.first.length === 1 && budget.first[0] === budget.nearest && budget.overUnder, 'budget: a slow draw on an empty view bakes one chunk, ' + budget.nearest + ', the nearest the middle, and draws the overview under the rest', JSON.stringify(budget));
ok(budget.fast === budget.budget, 'budget: a fast draw bakes CHUNK_BUDGET (' + budget.budget + ') and no more', JSON.stringify(budget));
ok(budget.stepsOfOne && budget.visibleBaked && budget.extra === budget.ringCells && budget.outsideRing === 0, 'budget: one a draw until the ' + budget.visible + ' chunks in view and the ' + budget.ringCells + ' of the ring round them are baked -- none beyond the ring', JSON.stringify(budget));
ok(!budget.overWhole, 'budget: once the view is whole the overview is not drawn under it', JSON.stringify(budget));
ok(budget.capped === budget.visible, 'budget: with CHUNK_CAP too small for the view and its ring, nothing is baked ahead (' + budget.capped + ' cached, all in view)', JSON.stringify(budget));

// ---------------------------------------------------------------------------------------------------------------------------
// 5. A feature change drops only the chunks round it; a new map drops nothing
// ---------------------------------------------------------------------------------------------------------------------------
const feat = R(`
  const m = TT.start('arch:chokepoint:1'), CH = Terrain.CH; Render.frame(1);
  const f = m.features.find(f => !f.broken); UI.centerOn(f.cx, f.cy); Render.clampCam();
  const bm = Terrain.BAKE_MS, cb = Terrain.CHUNK_BUDGET; Terrain.BAKE_MS = 1e9; Terrain.CHUNK_BUDGET = 1e9;
  try {
    TT.draw(); Render.syncFeatures();
    const fcx = Math.floor((f.x + f.w / 2) / CH), fcy = Math.floor((f.y + f.h / 2) / CH), far = [];
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4]]) { const cx = fcx + dx, cy = fcy + dy; if (cx < 0 || cy < 0 || cx >= Math.ceil(m.w / CH) || cy >= Math.ceil(m.h / CH)) continue; Terrain.chunks.set(cx + ',' + cy, Terrain.renderChunk(cx, cy)); far.push(cx + ',' + cy); }
    Terrain.overview(); const before = new Map(Terrain.chunks), canvas = Terrain._over, ov = Terrain._overImg.data.slice(), mini = Render.mini;
    m.breakFeature(f); Render.syncFeatures();
    const near = k => { const [x, y] = k.split(',').map(Number); return (x + 1) * CH > f.x - CH && x * CH < f.x + f.w + CH && (y + 1) * CH > f.y - CH && y * CH < f.y + f.h + CH; };
    const dropped = [...before.keys()].filter(k => !Terrain.chunks.has(k));
    const K = Terrain.OVER_PX, W = m.w * K, nw = Terrain._overImg.data; let inside = 0, outside = 0;
    for (let p = 0; p < nw.length; p += 4) { if (nw[p] === ov[p] && nw[p + 1] === ov[p + 1] && nw[p + 2] === ov[p + 2]) continue; const tx = (p / 4) % W / K, ty = Math.floor(p / 4 / W) / K; if (tx >= f.x - CH && tx < f.x + f.w + CH && ty >= f.y - CH && ty < f.y + f.h + CH) inside++; else outside++; }
    return { feature: f.kind + ' ' + f.x + ',' + f.y, cached: before.size, dropped: dropped.length, droppedFar: dropped.filter(k => !near(k)).length, farKept: far.length > 0 && far.every(k => Terrain.chunks.get(k) === before.get(k)), sameCanvas: Terrain._over === canvas, inside, outside, newMini: Render.mini !== mini };
  } finally { Terrain.BAKE_MS = bm; Terrain.CHUNK_BUDGET = cb; }
`);
ok(feat.dropped > 0 && feat.droppedFar === 0 && feat.farKept, 'feature: breaking the ' + feat.feature + ' on Chokepoint Valley drops ' + feat.dropped + ' of ' + feat.cached + ' cached chunks, all within a chunk of it, and keeps the far ones', JSON.stringify(feat));
ok(feat.sameCanvas && feat.inside > 0 && feat.outside === 0 && feat.newMini, 'feature: the same overview, repainted only round the feature (' + feat.inside + ' pixels changed, none elsewhere), and a new minimap', JSON.stringify(feat));
const fresh = R(`
  TT.start('arch:chokepoint:1'); Render.frame(1);
  const m = TT.start('arch:islands:1'), c = Terrain.renderChunk(0, 0); Terrain.chunks.set('0,0', c);
  Render.syncFeatures();
  return { features: m.features.length, kept: Terrain.chunks.get('0,0') === c };
`);
ok(fresh.features !== 5 && fresh.kept, 'feature: on a new map (Island Chain, ' + fresh.features + ' features, after Chokepoint Valley\'s 5) the first sync records the features and drops nothing', JSON.stringify(fresh));

// ---------------------------------------------------------------------------------------------------------------------------
// 6. Textures arriving mid-game
// ---------------------------------------------------------------------------------------------------------------------------
const arrive = R(`
  const m = TT.start('temple', false); Render.frame(1);
  const bm = Terrain.BAKE_MS, sm = Terrain.OVER_STEP_MS; Terrain.BAKE_MS = 0; Terrain.OVER_STEP_MS = 0;
  try {
    for (let i = 0; i < 100; i++) { const n = Terrain.chunks.size; TT.draw(); if (i && Terrain.chunks.size === n) break; }
    const palette = !Terrain._overTex && !!Terrain._over, rev0 = Terrain.overRev;
    Terrain.textured = true; Terrain.chunks.clear();   // what a texture's onload does
    let bakeDraws = 0, steppedWhileBaking = false;
    for (let i = 0; i < 100; i++) { const n = Terrain.chunks.size; TT.draw(); if (Terrain.chunks.size === n) break; bakeDraws++; if (Terrain._overNext) steppedWhileBaking = true; }
    let steps = bakeDraws < 100 ? 1 : 0; while (!Terrain._overTex && steps < 500) { TT.draw(); steps++; }
    Render.syncFeatures();
    return { palette, bakeDraws, steppedWhileBaking, steps, rows: m.h, swapped: !!Terrain._overTex, revMoved: Terrain.overRev !== rev0, miniWorst: Render.mini && Terrain._overImg ? +TT.miniWorst(Render.mini, Terrain._overImg.data).toFixed(2) : null };
  } finally { Terrain.BAKE_MS = bm; Terrain.OVER_STEP_MS = sm; }
`);
ok(arrive.palette && arrive.bakeDraws > 0 && !arrive.steppedWhileBaking, 'arrive: the textures come after the palette\'s overview; for the ' + arrive.bakeDraws + ' draws that bake chunks the textured overview is not touched', JSON.stringify(arrive));
ok(arrive.swapped && arrive.revMoved && arrive.steps === Math.ceil(arrive.rows / 4), 'arrive: then it is painted a step a draw, ' + arrive.steps + ' steps for ' + arrive.rows + ' rows, and swapped in', JSON.stringify(arrive));
ok(arrive.miniWorst !== null && arrive.miniWorst <= 1, 'arrive: and the minimap follows it at the next sync', JSON.stringify(arrive));

// ---------------------------------------------------------------------------------------------------------------------------
// 7. The minimap's unit dots each sit on a dark rim
// ---------------------------------------------------------------------------------------------------------------------------
const rim = R(`
  TT.start('temple'); Render.frame(1);
  _rec.reset(); _rec.on = true; UI.drawConsole(); _rec.on = false;
  const mr = UI.miniRectC(), inMini = o => o.a[0] >= mr.x - 2 && o.a[1] >= mr.y - 2 && o.a[0] < mr.x + mr.s + 2 && o.a[1] < mr.y + mr.s + 2;
  const fills = _rec.ops.map((o, i) => Object.assign({ i }, o)).filter(o => o.op === 'fillRect' && inMini(o));
  const colours = PLAYER_COLORS.concat(['#3fe83f']), rims = fills.filter(o => o.fs === 'rgba(0,0,0,0.7)'), dots = fills.filter(o => colours.includes(o.fs));
  const framed = dots.every(d => rims.some(r => Math.abs(r.a[0] - (d.a[0] - 1)) < 1e-9 && Math.abs(r.a[1] - (d.a[1] - 1)) < 1e-9 && Math.abs(r.a[2] - (d.a[2] + 2)) < 1e-9 && Math.abs(r.a[3] - (d.a[3] + 2)) < 1e-9));
  return { rims: rims.length, dots: dots.length, framed, ordered: rims.length > 0 && dots.length > 0 && Math.max(...rims.map(r => r.i)) < Math.min(...dots.map(d => d.i)) };
`);
ok(rim.dots > 0 && rim.rims === rim.dots && rim.framed && rim.ordered, 'rim: ' + rim.dots + ' unit dots on the minimap, each on a dark rim a pixel wider all round, every rim drawn before the first dot', JSON.stringify(rim));

// ---------------------------------------------------------------------------------------------------------------------------
// 8. Detailed by default, Classic one click away
// ---------------------------------------------------------------------------------------------------------------------------
ok(initialLook === true, 'default: before any setting is read, the terrain is detailed', JSON.stringify(initialLook));
const frames = R(`
  const out = {}, realTex = Terrain.renderChunkTex, realChunk = Terrain.renderChunk;
  for (const t of Object.keys(TILESETS)) {
    const id = '__tv_' + t; if (!MAP_LAYOUTS[id]) MAP_LAYOUTS[id] = MapModes.layout('medium', { tileset: t, name: 'terrainview ' + t });
    TT.start(id); UI.viewAll = false;
    let tex = 0, all = 0;
    Terrain.renderChunkTex = function (...a) { tex++; return realTex.apply(this, a); };
    Terrain.renderChunk = function (...a) { all++; return realChunk.apply(this, a); };
    try { for (let i = 0; i < 6; i++) Render.frame(1); } finally { Terrain.renderChunkTex = realTex; Terrain.renderChunk = realChunk; }
    out[t] = { tex, all, set: Terrain.setId };
  }
  return out;
`);
ok(Object.keys(frames).length === 5 && Object.values(frames).every(f => f.all > 0 && f.tex === f.all), 'default: whole frames of a game on every tileset -- fog, units and the interface over the ground -- bake every chunk from the textures', JSON.stringify(frames));
const look = R(`
  const m = TT.start('temple'); Render.frame(1);
  const bm = Terrain.BAKE_MS, cb = Terrain.CHUNK_BUDGET, sm = Terrain.OVER_STEP_MS; Terrain.BAKE_MS = 1e9; Terrain.CHUNK_BUDGET = 1e9; Terrain.OVER_STEP_MS = 0;
  // which way each chunk is baked, counted -- a baked chunk's pixels cannot be read back later: the bake reuses one ImageData
  const realTex = Terrain.renderChunkTex, realChunk = Terrain.renderChunk, count = { tex: 0, all: 0 };
  Terrain.renderChunkTex = function (...a) { count.tex++; return realTex.apply(this, a); };
  Terrain.renderChunk = function (...a) { count.all++; return realChunk.apply(this, a); };
  const bakes = fn => { count.tex = 0; count.all = 0; fn(); return { tex: count.tex, all: count.all }; };
  const same = (a, b) => { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  const settle = () => { for (let i = 0; i < 400; i++) { const n = Terrain.chunks.size, t = !!Terrain._overTex; TT.draw(); Render.syncFeatures(); if (i > 2 && Terrain.chunks.size === n && t === !!Terrain._overTex && !Terrain._overNext) break; } };
  try {
    Render.setZoom(0.3); for (let i = 0; i < 300 && !Terrain._overTex; i++) TT.draw(); Render.setZoom(1); settle();
    const was = { cached: Terrain.chunks.size, overTex: !!Terrain._overTex }, mini0 = Render.mini;
    const rev0 = Terrain.overRev; UI.setTerrainLook('classic');
    const drop = { chunks: Terrain.chunks.size, revMoved: Terrain.overRev !== rev0 };
    const classic = bakes(() => { TT.draw(); Render.syncFeatures(); });
    classic.miniNew = !!Render.mini && Render.mini !== mini0;
    classic.miniIsPalette = classic.miniNew && same(Render.mini.img.data.slice(), Terrain.buildMini().img.data);
    Render.setZoom(0.3); TT.draw(); classic.overviewPalette = !!Terrain._over && !Terrain._overTex; Render.setZoom(1);
    const rev1 = Terrain.overRev; UI.setTerrainLook('detailed');
    const back = { chunks: Terrain.chunks.size, revMoved: Terrain.overRev !== rev1 };
    Render.setZoom(0.3); TT.draw(); back.firstDrawTextured = !!Terrain._overTex; back.stepping = !!Terrain._overNext;
    let steps = 1; while (!Terrain._overTex && steps < 500) { TT.draw(); steps++; }
    Render.syncFeatures(); back.steps = steps; back.miniWorst = Terrain._overImg && Render.mini ? +TT.miniWorst(Render.mini, Terrain._overImg.data).toFixed(2) : null;
    Render.setZoom(1); Object.assign(back, bakes(settle));
    const kept = new Map(Terrain.chunks), rev2 = Terrain.overRev; UI.setTerrainLook('detailed');
    const again = { kept: kept.size > 0 && [...kept].every(([k, c]) => Terrain.chunks.get(k) === c), revSame: Terrain.overRev === rev2 };
    return { was, drop, classic, back, again, rows: m.h };
  } finally { Terrain.renderChunkTex = realTex; Terrain.renderChunk = realChunk; Terrain.BAKE_MS = bm; Terrain.CHUNK_BUDGET = cb; Terrain.OVER_STEP_MS = sm; Render.setZoom(1); }
`);
ok(look.was.cached > 0 && look.was.overTex && look.drop.chunks === 0 && look.drop.revMoved, 'classic: from settled detailed ground, choosing Classic drops every baked chunk and moves the overview\'s revision', JSON.stringify(look));
ok(look.classic.all > 0 && look.classic.tex === 0 && look.classic.miniIsPalette && look.classic.overviewPalette, 'classic: the next draw bakes all ' + look.classic.all + ' chunks from the palette though the textures are loaded, the next sync makes the palette\'s minimap, and the far view is the palette\'s', JSON.stringify(look));
ok(look.back.chunks === 0 && look.back.revMoved && !look.back.firstDrawTextured && look.back.stepping && look.back.steps === Math.ceil(look.rows / 4), 'classic: back to Detailed, the textured far view is stepped in, ' + look.back.steps + ' draws for ' + look.rows + ' rows, never painted in one frame (211 ms on The Long March)', JSON.stringify(look));
ok(look.back.miniWorst !== null && look.back.miniWorst <= 1 && look.back.all > 0 && look.back.tex === look.back.all && look.again.kept && look.again.revSame, 'classic: then the minimap and every chunk baked are the textures\' again; choosing the look already in use drops nothing', JSON.stringify(look));

// ---------------------------------------------------------------------------------------------------------------------------
// 9. No seam between chunks at any zoom
// ---------------------------------------------------------------------------------------------------------------------------
// The seam is the browser's compositing and cannot be seen here (PLAYTEST-M18 116 has the browser's numbers); what it rests on can.
// From the terrain's own draw calls, in device pixels -- the zoom and the display ratio applied, as Render.frame applies them.
const seams = R(`
  const bm = Terrain.BAKE_MS, cb = Terrain.CHUNK_BUDGET, out = [];
  TT.start('temple'); Terrain.BAKE_MS = 1e9; Terrain.CHUNK_BUDGET = 1e9;
  try {
    for (const [z, dpr] of [[1, 1], [0.797, 1], [0.6, 1], [1.5, 1], [2.6, 1], [0.797, 2], [1, 2]]) {
      Render.dpr = dpr; Render.setZoom(z); Render.zoom = z; UI.centerOn(40.3 * TILE, 41.7 * TILE);
      for (let i = 0; i < 80; i++) TT.draw();
      _rec.reset(); _rec.on = true; TT.draw(); _rec.on = false;
      const C = Terrain.CH * TILE, s = z * dpr, byCanvas = new Map([...Terrain.chunks].map(([k, c]) => [c, k])), at = new Map();
      _rec.ops.forEach((o, i) => { if (o.op === 'drawImage' && o.a.length === 5 && byCanvas.has(o.src)) at.set(byCanvas.get(o.src), { i, x: o.a[1], y: o.a[2], w: o.a[3], h: o.a[4] }); });
      let pairs = 0, gaps = [], order = 0, stretched = 0, exact = true;
      const eps = 1e-6, covered = (endA, startB) => { const p = startB * s; return Math.abs(p - Math.round(p)) < eps ? endA * s >= p - eps : endA * s >= Math.floor(p) + 1 - eps; };
      for (const [k, A] of at) {
        const [cx, cy] = k.split(',').map(Number);
        if ((A.w - C) * s > 1 + eps || (A.h - C) * s > 1 + eps) stretched++;
        if (z === 1 && (A.w !== C || A.h !== C || Math.abs(A.x * s - Math.round(A.x * s)) > eps || Math.abs(A.y * s - Math.round(A.y * s)) > eps)) exact = false;
        const R2 = at.get((cx + 1) + ',' + cy), D = at.get(cx + ',' + (cy + 1));
        if (R2) { pairs++; if (R2.i < A.i) order++; if (!covered(A.x + A.w, R2.x)) gaps.push(k + ' right'); }
        if (D) { pairs++; if (D.i < A.i) order++; if (!covered(A.y + A.h, D.y)) gaps.push(k + ' below'); }
      }
      out.push({ zoom: z, dpr, chunks: at.size, pairs, gaps: gaps.length, firstGaps: gaps.slice(0, 3), order, stretched, exact });
    }
  } finally { Terrain.BAKE_MS = bm; Terrain.CHUNK_BUDGET = cb; Render.dpr = 1; Render.setZoom(1); }
  return out;
`);
ok(seams.length === 7 && seams.every(c => c.chunks >= 2 && c.pairs >= 1), 'seams: the draw calls of ' + seams.map(c => c.chunks).join('/') + ' chunks at seven zooms and display ratios, their neighbours paired (' + seams.map(c => c.pairs).join('/') + ')', JSON.stringify(seams));
ok(seams.every(c => c.gaps === 0 && c.order === 0), 'seams: at every zoom every pixel on a boundary is covered whole by the chunk drawn first, and the chunk to its right or below is drawn after it -- no dark fill shows through', JSON.stringify(seams.filter(c => c.gaps || c.order)));
ok(seams.every(c => c.stretched === 0) && seams.filter(c => c.zoom === 1).every(c => c.exact), 'seams: no chunk is stretched by more than a device pixel, and at zoom 1 each is exactly its size on whole pixels', JSON.stringify(seams.map(c => ({ zoom: c.zoom, dpr: c.dpr, stretched: c.stretched, exact: c.exact }))));

ok(errors.length === 0, 'no console errors', JSON.stringify(errors.slice(0, 3)));
summary();
