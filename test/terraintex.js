// Detailed terrain -- the textured ground in js/terrain.js (TERRAIN_TEX, renderChunkTex) -- with texture data handed to it,
// because the headless suites have no images to load. Started in the terrain queue's phase 2 (the four other tilesets).
//   node test/terraintex.js
//
// What a look cannot be asserted into, the numbers around it can, and each of these has a negative control
// (.claude/review/terrain/controls-terraintex.js) that turns it RED:
//  1. EVERY TILESET HAS A COMPLETE SET: four textures that exist in assets/terrain and are recorded in SOURCES.md (where they
//     came from and their licence), a grade for each, and a look whose lists name only real materials.
//  1b. HIGH GROUND CLEARLY LIGHTER THAN LOW, CLIFFS NEITHER BLACK NOR GLARING: from each texture's levels (test/terrain-levels.json,
//     measured in a browser by tools/terrain-levels.js and checked against the file's hash), every set's graded high ground is at
//     least as much lighter than its low ground as the approved Badlands', and its cliff rock neither a black stroke nor a glare.
//  2. HEALING LIFTS FLECKS AND NOTHING ELSE: Terrain.healFlecks raises the dark flecks of a light texture to the colour round them
//     (Ice's snow_02: each twig a tile-long black squiggle across a plateau) and leaves every other texel byte-identical.
//  3. CELLS LEAVE NO REPEAT: two stretches of flat low ground sixteen tiles apart -- one texture repeat -- come out alike when
//     the texture is laid plainly, and unalike laid in cells (look.cells).
//  4. A PLATFORM FOLLOWS ITS TILES: Space Platform reads its height field straight from the tiles (look.blur 0), so along a
//     stepped plateau edge every plateau pixel is drawn high and every low pixel low; the 3x3 blur rounds the steps off.
//  5. THE BAKE IS A PURE FUNCTION OF THE MAP, ITS SEED AND THE TILE, and writes nothing to the map.
//  7. SHARP CHUNKS (the user's playtest: "The resolution of the land and doodads is a bit low"): at ratio 1 the bake is byte for byte
//     the approved one (fingerprints in test/terrain-golden.json; node test/terraintex.js --save-golden writes new ones when the look
//     is changed on purpose); at 1.5 and 2, from textures of the same pattern at 768 and 1024 texels, a chunk averaged down is the
//     ratio-1 chunk and its props cover K squared times the pixels; a bake in steps yields a row at a time and gives the pixels of a
//     bake at once though other bakes run between its steps.
//  6. PROPS (phase 3): every kind a set names draws something; on every map, no prop stands on or beside a cliff, a wall, a ramp or a
//     map feature, near a resource or in a hall clearing, and none covers or shades a pixel outside its own tile's 3x3 block; about
//     the set's density of the allowed ground has one; a prop crossing a chunk edge is drawn the same on both sides; what play
//     changes -- a broken feature, a hulk, a mined-out patch -- moves no prop; a prop is lit from the upper left with its shadow down
//     and right; and the bake changes only the pixels the props cover or shade.
//  8. CREEP AS ONE CONTINUOUS MASS (the looks queue, item 2: "Zerg creep has a tiled look to it with defined edges ... no lines or
//     tiles"): the material tiles with no seam and is not posterised; the bake draws no ordered dither; the edge thins over a band and
//     is half there near the tile boundary the simulation drew; the coverage never steps (noise switched on at a threshold drew a line
//     along that contour); a chunk's apron is the very pixels of its neighbour's edge; a material repeat apart the creep does not
//     repeat; a creep bit CREEP_REACH tiles away is in a chunk's signature; and when creep grows, the changed chunks keep their old
//     pictures until every one has its new one, then all change together.
//  9. CLIFFS THAT LOOK TWICE AS TALL (the looks queue, item 3: "Can we make them look about twice as tall"): on a plateau with a straight
//     east-facing and a straight south-facing edge, the drop is half as wide again as before, the shadow past an east-facing cliff reaches
//     twice as far and past a south-facing one half as far again, and a ramp is lit as it was.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const { makeCtx, ok, summary, root } = require('./_harness');

// A canvas whose 2D context keeps the one ImageData the bake writes, so its pixels can be read back.
const canvas = () => { const cv = { width: 300, height: 150, img: null }; cv.getContext = () => ({ canvas: cv, createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData(img) { cv.img = img; } }); return cv; };
const errors = [];
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'terrain'], errors,
  globals: { document: { getElementById: () => canvas(), createElement: () => canvas(), addEventListener() { }, hasFocus: () => false } } });
const R = src => vm.runInContext('(() => {' + src + '})();', ctx);

// ---------------------------------------------------------------------------------------------------------------------------
// 1. Every tileset has a complete set
// ---------------------------------------------------------------------------------------------------------------------------
const sets = R(`return Object.keys(TILESETS).map(id => ({ id, tex: TERRAIN_TEX[id] || null, grade: TERRAIN_GRADE[id] || null, look: TERRAIN_LOOK[id] || null }));`);
const sources = fs.readFileSync(path.join(root, 'assets', 'terrain', 'SOURCES.md'), 'utf8');
const PARTS = ['low', 'high', 'ramp', 'rock'];
ok(sets.length === 5, 'five tilesets to texture', JSON.stringify(sets.map(s => s.id)));
for (const s of sets) {
  const files = s.tex ? PARTS.map(p => s.tex[p]) : [];
  ok(files.length === 4 && files.every(f => typeof f === 'string' && fs.existsSync(path.join(root, f))), s.id + ': four textures, every file in the repository', JSON.stringify(files));
  const unrecorded = files.filter(f => !sources.includes('`' + path.basename(String(f)) + '`'));
  ok(files.length === 4 && !unrecorded.length, s.id + ': every texture recorded in assets/terrain/SOURCES.md', JSON.stringify(unrecorded));
  ok(!!s.grade && PARTS.every(p => Array.isArray(s.grade[p]) && s.grade[p].length === 3 && s.grade[p].every(v => Number.isFinite(v) && v > 0)), s.id + ': a grade of three positive numbers for each material', JSON.stringify(s.grade));
  const lists = s.look ? [].concat(s.look.heal || [], s.look.cells || []) : null;
  ok(!!s.look && lists.every(p => PARTS.includes(p)), s.id + ': a look, whose heal and cells lists name only materials', JSON.stringify(s.look));
}

// ---------------------------------------------------------------------------------------------------------------------------
// 1b. High ground clearly lighter than low, and cliffs neither black nor glaring -- the approved look, in numbers
// ---------------------------------------------------------------------------------------------------------------------------
// node has no JPEG decoder, so each texture's levels -- a histogram of each channel as the game samples it -- are measured in a
// browser (tools/terrain-levels.js, in the page tools/terrain-shot.js serves) and kept in test/terrain-levels.json with the file's
// length and FNV-1a hash: a texture replaced without being measured again fails the first check. From them and TERRAIN_GRADE, each
// graded material's mean luminance in linear light, as phase 2 measured it in the browser: high ground over low ground Badlands 2.2,
// Jungle 3.5, Ice 3.5, Desert 3.9, Space Platform 5.7, the floor being the approved Badlands' 2.2 less a margin for the decoder;
// cliff rock over high ground 0.45, 0.43, 0.44, 0.29, 1.04, where Ice's first grade gave 0.06 (a black stroke round every plateau)
// and Space Platform's first about 2 (its bulkheads glared).
const levels = JSON.parse(fs.readFileSync(path.join(root, 'test', 'terrain-levels.json'), 'utf8'));
const fnv = b => { let h = 0x811c9dc5; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
const lin = c => { c = Math.min(255, c) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const graded = (lv, g) => { const mean = (h, k) => { let s = 0, n = 0; for (let v = 0; v < 256; v++) { s += h[v] * lin(v * k); n += h[v]; } return s / n; }; return 0.2126 * mean(lv.r, g[0]) + 0.7152 * mean(lv.g, g[1]) + 0.0722 * mean(lv.b, g[2]); };
const APPROVED_HIGH_OVER_LOW = 2.15, stale = new Set(), light = {};
for (const s of sets) {
  if (!s.tex || !s.grade) continue;
  const L = {};
  for (const p of PARTS) {
    const f = path.join(root, String(s.tex[p])), lv = levels[path.basename(f)], buf = fs.existsSync(f) ? fs.readFileSync(f) : null;
    if (!lv || !buf || lv.bytes !== buf.length || lv.fnv !== fnv(buf)) { stale.add(path.basename(f)); continue; }
    L[p] = graded(lv, s.grade[p]);
  }
  if (PARTS.every(p => L[p] > 0)) light[s.id] = { highOverLow: +(L.high / L.low).toFixed(2), rockOverHigh: +(L.rock / L.high).toFixed(2) };
}
const measured = Object.keys(light).length === sets.length, listed = k => Object.entries(light).map(([id, r]) => id + ' ' + r[k]).join(', ');
ok(!stale.size && measured, 'levels: every texture\'s levels were measured from the file in the repository (test/terrain-levels.json; tools/terrain-levels.js measures them again)', JSON.stringify([...stale]));
ok(measured && Object.values(light).every(r => r.highOverLow >= APPROVED_HIGH_OVER_LOW), 'levels: on every tileset the graded high ground is at least as much lighter than its low ground as the approved Badlands\' (' + listed('highOverLow') + ')', JSON.stringify(light));
ok(measured && Object.values(light).every(r => r.rockOverHigh >= 0.2 && r.rockOverHigh <= 1.25), 'levels: and its cliff rock is neither a black stroke nor a glare against its high ground, between 0.2 and 1.25 (' + listed('rockOverHigh') + ')', JSON.stringify(light));

// ---------------------------------------------------------------------------------------------------------------------------
// 2. Healing lifts the flecks and nothing else
// ---------------------------------------------------------------------------------------------------------------------------
// A light 128-texel texture (radius 6 at that size) with sixteen dark single texels and one dark line, well apart.
const heal = R(`
  const S = 128, d = new Uint8ClampedArray(S * S * 4), fleck = new Set();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const p = (y * S + x) * 4, g = ((x * 7 + y * 13) % 5) - 2; d[p] = 200 + g; d[p + 1] = 205 + g; d[p + 2] = 210 + g; d[p + 3] = 255; }
  for (let k = 0; k < 16; k++) { const x = 10 + (k % 4) * 30, y = 10 + ((k / 4) | 0) * 30; fleck.add(y * S + x); }
  for (let x = 40; x < 50; x++) fleck.add(118 * S + x);
  for (const i of fleck) { d[i * 4] = 25; d[i * 4 + 1] = 28; d[i * 4 + 2] = 30; }
  const before = d.slice(), out = Terrain.healFlecks(d, S);
  let lifted = 0, lowest = 255, touched = 0;
  for (let i = 0; i < S * S; i++) {
    const L = (out[i * 4] + out[i * 4 + 1] + out[i * 4 + 2]) / 3;
    if (fleck.has(i)) { lowest = Math.min(lowest, L); if (L >= 0.9 * 205) lifted++; }
    else if (out[i * 4] !== before[i * 4] || out[i * 4 + 1] !== before[i * 4 + 1] || out[i * 4 + 2] !== before[i * 4 + 2]) touched++;
  }
  return { same: out === d, flecks: fleck.size, lifted, lowest: Math.round(lowest), touched, R: Math.round(S * Terrain.HEAL_R / 512) };
`);
ok(heal.same && heal.flecks === 26 && heal.R >= 2, 'heal: the probe has 26 flecks and a radius of at least two texels, healed in place', JSON.stringify(heal));
ok(heal.lifted === heal.flecks, 'heal: every dark fleck lifted to the light colour round it (' + heal.lifted + '/' + heal.flecks + ', darkest now ' + heal.lowest + ' of 205)', JSON.stringify(heal));
ok(heal.touched === 0, 'heal: every texel that was not a fleck is byte-identical', JSON.stringify(heal));

// ---------------------------------------------------------------------------------------------------------------------------
// Textures for the bakes: a colour per material with broad blobs (periodic in the texture, so a repeat is a real repeat) and grain
// ---------------------------------------------------------------------------------------------------------------------------
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
    set(low, high, ramp, rock) { return { low: this.tex(low, 50, 1), high: this.tex(high, 20, 2), ramp: this.tex(ramp, 30, 3), rock: this.tex(rock, 20, 4) }; },
    map(tileset, seed) {
      // Contested Ground as it was when the look was approved, before the looks queue (item 4) redesigned every map: the
      // fingerprints below pin the BAKE, and a new layout would move every one of them without the bake changing at all.
      const G0 = { players: 4, w: 128, h: 128, startOrder: [0, 3, 1, 2], patch: 1500, gas: 5000, patches: { main: 8, natural: 7, expo: 6 },
        bases: [{ x: 12, y: 12, role: 'main' }, { x: 30, y: 38, role: 'natural' }, { x: 12, y: 50, role: 'expo' }],
        high: [['rect', 4, 4, 32, 26], ['ellipse', 20, 17, 18, 15]], ramps: [[31, 28, 4, 5]], rocks: [['rect', 4, 32, 14, 3], ['ellipse', 46, 46, 5, 4]] };
      const id = '__tt_' + tileset;
      if (!MAP_LAYOUTS[id]) MAP_LAYOUTS[id] = { name: 'terraintex ' + tileset, size: 'medium', players: G0.players, w: G0.w, h: G0.h, tileset, startOrder: G0.startOrder,
        high: G0.high, ramps: G0.ramps, rocks: G0.rocks, bases: G0.bases.map(b => MapModes.base(b.x, b.y, G0.patches[b.role], G0.patch, G0.gas, b.role)) };
      G.map = new GameMap(seed || 7, id); Terrain.reset(seed || 7); return G.map;
    },
    bake(cx, cy, T) { const cv = Terrain.renderChunkTex(cx, cy, T); return cv.img.data; },
    lum(d) { const out = new Float64Array(d.length / 4); for (let i = 0; i < out.length; i++) out[i] = d[i * 4] * 0.2126 + d[i * 4 + 1] * 0.7152 + d[i * 4 + 2] * 0.0722; return out; },
    corr(a, b) { const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; } return sab / Math.sqrt(saa * sbb || 1); },
    // chunks whose own tiles and the three round them are all flat low ground, in pairs sixteen tiles (two chunks) apart
    // the n chunks with the most cliff, ramp and rock, then the o chunks with the most ground a prop may stand on, as [cx, cy]
    pick(m, n, o) {
      const CH = Terrain.CH, nx = Math.ceil(m.w / CH), ny = Math.ceil(m.h / CH), mask = Terrain.propMask(), rough = [], open = [];
      for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
        let r = 0, p = 0; for (let y = cy * CH; y < Math.min(m.h, (cy + 1) * CH); y++) for (let x = cx * CH; x < Math.min(m.w, (cx + 1) * CH); x++) { const i = y * m.w + x; if (m.cliff[i]) r += 2; if (m.height[i] === 1 && !m.cliff[i]) r += 3; p += mask[i]; }
        rough.push([r, cy * nx + cx]); open.push([p, cy * nx + cx]);
      }
      const top = (list, k, skip) => list.sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(e => e[1]).filter(i => !skip.includes(i)).slice(0, k);
      const ids = top(rough, n, []); ids.push(...top(open, o, ids));
      return ids.map(i => [i % nx, (i / nx) | 0]);
    },
    flatPairs(m, want) {
      const CH = Terrain.CH, flat = (cx, cy) => { for (let y = cy * CH - 3; y < (cy + 1) * CH + 3; y++) for (let x = cx * CH - 3; x < (cx + 1) * CH + 3; x++) { if (!m.inb(x, y)) return false; const i = m.idx(x, y); if (m.height[i] !== 0 || m.cliff[i] !== 0 || m.walk[i] !== 1) return false; } return true; };
      const out = []; for (let cy = 1; cy < m.h / CH - 1 && out.length < want; cy++) for (let cx = 1; cx + 2 < m.w / CH - 1 && out.length < want; cx++) if (flat(cx, cy) && flat(cx + 2, cy)) out.push([cx, cy]);
      return out;
    },
  };
`, ctx);

// ---------------------------------------------------------------------------------------------------------------------------
// 7a. The approved bake, pinned
// ---------------------------------------------------------------------------------------------------------------------------
// Fingerprints of chunks on every tileset at ratio 1, props on -- on each, the two with the most cliff, ramp and rock and the two with
// the most ground for props (open ground alone let a change to the cliffs' shadow through): the bake the look was approved on. Sharp chunks rewrote the whole bake
// in world pixels over a ratio and moved none of them; a change meant to change the look writes new ones with --save-golden.
const golden = R(`
  const T = TT.set([90, 80, 70], [200, 190, 170], [150, 140, 120], [110, 90, 80]), out = {};
  const fnv = d => { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
  for (const t of Object.keys(TILESETS)) {
    const m = TT.map(t, 7), hs = [];
    for (const [cx, cy] of TT.pick(m, 2, 2)) hs.push(cx + ',' + cy + ':' + fnv(TT.bake(cx, cy, T)) + ':' + (Terrain.propLayer(cx, cy, T) ? 'p' : '-'));
    out[t] = hs;
  }
  return out;
`);
const goldenFile = path.join(root, 'test', 'terrain-golden.json');
if (process.argv.includes('--save-golden')) { fs.writeFileSync(goldenFile, JSON.stringify(golden, null, 1) + '\n'); console.log('wrote ' + goldenFile); process.exit(0); }
const pinned = fs.existsSync(goldenFile) ? JSON.parse(fs.readFileSync(goldenFile, 'utf8')) : {};
const moved = Object.keys(pinned).flatMap(t => pinned[t].filter((h, i) => !golden[t] || golden[t][i] !== h).map(h => t + ' ' + h + ' -> ' + (golden[t] ? golden[t][pinned[t].indexOf(h)] : '?')));
const propped = Object.values(golden).flat().filter(h => h.endsWith(':p')).length;
ok(Object.keys(pinned).length === 5 && Object.values(pinned).flat().length === 20 && propped >= 10 && !moved.length, 'golden: at ratio 1 the bake is byte for byte the approved one -- 20 chunks on five tilesets, ' + propped + ' with props (test/terrain-golden.json)', JSON.stringify(moved.slice(0, 3)));

// ---------------------------------------------------------------------------------------------------------------------------
// 3. Cells leave no repeat
// ---------------------------------------------------------------------------------------------------------------------------
const cells = R(`
  const m = TT.map('ice'), T = TT.set([90, 110, 150], [215, 220, 225], [150, 160, 180], [60, 60, 70]), pairs = TT.flatPairs(m, 4);
  // the transposed second sample off for both: on these chunks it mixes near half and half, which hides a repeat by itself
  // props off too: they differ between the two chunks by design
  const look = TERRAIN_LOOK.ice, real = { cells: look.cells, mix: look.mix }, props = TERRAIN_PROPS.ice, corr = cellsOn => {
    look.mix = 0; if (!cellsOn) look.cells = []; delete TERRAIN_PROPS.ice;
    try { return pairs.map(([cx, cy]) => TT.corr(TT.lum(TT.bake(cx, cy, T)), TT.lum(TT.bake(cx + 2, cy, T)))); }
    finally { look.cells = real.cells; look.mix = real.mix; TERRAIN_PROPS.ice = props; }
  };
  const plain = corr(false), laid = corr(true);
  return { pairs, cellsListed: (look.cells || []).includes('low'), plain: plain.map(v => +v.toFixed(3)), laid: laid.map(v => +v.toFixed(3)) };
`);
ok(cells.pairs.length === 4 && cells.cellsListed, 'cells: four pairs of flat low-ground chunks sixteen tiles apart on Ice, whose low ground is laid in cells', JSON.stringify(cells));
ok(cells.plain.length === 4 && cells.plain.every(v => v > 0.9), 'cells: laid plainly, each pair is the same ground again -- the repeat the probe must be able to see (' + cells.plain.join(', ') + ')', JSON.stringify(cells));
ok(cells.laid.length === 4 && cells.laid.every(v => Math.abs(v) < 0.5), 'cells: laid in cells, no pair repeats (' + cells.laid.join(', ') + ')', JSON.stringify(cells));

// ---------------------------------------------------------------------------------------------------------------------------
// 4. A platform's corners are square
// ---------------------------------------------------------------------------------------------------------------------------
// The high texture bright and everything else dark, so a pixel brighter than 150 is drawn as high ground. The first main's west
// edge, which steps in and out a tile at a time: the three chunks from the start's row down, in the chunk column of its cliff.
const edge = R(`
  const m = TT.map('space'), T = TT.set([40, 40, 40], [200, 200, 200], [40, 40, 40], [30, 30, 30]), CH = Terrain.CH, P = CH * TILE, s = m.starts[0];
  const cx = Math.floor((s.x - 6) / CH), cy0 = Math.floor(s.y / CH), look = TERRAIN_LOOK.space, real = look.blur, props = TERRAIN_PROPS.space;
  const wrong = blur => {
    if (blur) delete look.blur; delete TERRAIN_PROPS.space;   // the edge of the ground itself: a hatch's dark seam is not the edge
    try {
      let off = 0, n = 0;
      for (let cy = cy0; cy < cy0 + 3; cy++) {
        const d = TT.bake(cx, cy, T);
        for (let py = 0; py < P; py++) for (let px = 0; px < P; px++) {
          const i = m.idx(cx * CH + (px / TILE | 0), cy * CH + (py / TILE | 0)); if (m.cliff[i] !== 0 || m.height[i] === 1) continue;
          const p = (py * P + px) * 4, bright = d[p] * 0.2126 + d[p + 1] * 0.7152 + d[p + 2] * 0.0722 > 150; n++;
          if (m.height[i] === 2 ? !bright : bright) off++;
        }
      }
      return { off, n };
    } finally { look.blur = real; TERRAIN_PROPS.space = props; }
  };
  return { chunks: [cx, cy0], blurSetting: real, square: wrong(false), blurred: wrong(true) };
`);
ok(edge.blurSetting === 0 && edge.blurred.n > 50000 && edge.blurred.off >= 100, 'edge: Space Platform reads its tiles unblurred, and on its main\'s west edge the blur would draw ' + edge.blurred.off + ' plateau or low pixels on the wrong side -- enough for the probe to see', JSON.stringify(edge));
ok(edge.square.off <= edge.blurred.off * 0.05, 'edge: unblurred, the edge follows the tiles (' + edge.square.off + ' pixels on the wrong side of ' + edge.square.n + ')', JSON.stringify(edge));

// ---------------------------------------------------------------------------------------------------------------------------
// 5. A pure function of the map, its seed and the tile, and nothing written to the map
// ---------------------------------------------------------------------------------------------------------------------------
const pure = R(`
  const out = {};
  for (const id of Object.keys(TILESETS)) {
    const m = TT.map(id), T = TT.set([90, 80, 70], [200, 190, 170], [150, 140, 120], [110, 90, 80]);
    const h = () => { let s = 0; for (const a of [m.height, m.cliff, m.walk, m.blocked]) for (let i = 0; i < a.length; i++) s = (Math.imul(s, 31) + a[i]) | 0; return s; };
    const before = h(), cx = Math.floor(m.starts[0].x / Terrain.CH), cy = Math.floor(m.starts[0].y / Terrain.CH);
    const a = TT.bake(cx, cy, T).slice(); Terrain.chunks.clear(); Terrain._rampLv = null; Terrain._propMask = null; const b = TT.bake(cx, cy, T);
    let diff = 0, opaque = true; for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) diff++; if (i % 4 === 3 && a[i] !== 255) opaque = false; }
    // the texture handed in is what is drawn: black textures bake a different chunk
    const zero = new Uint8ClampedArray(T.low.length), c = TT.bake(cx, cy, { low: zero, high: zero, ramp: zero, rock: zero }); let same = 0; for (let i = 0; i < a.length; i += 4) if (a[i] === c[i]) same++;
    out[id] = { diff, opaque, mapUnchanged: before === h(), usesTextures: same < a.length / 8 };
  }
  return out;
`);
for (const id of Object.keys(pure)) {
  const r = pure[id];
  ok(r.diff === 0 && r.opaque, id + ': the same chunk bakes to the same pixels twice, every one opaque', JSON.stringify(r));
  ok(r.mapUnchanged && r.usesTextures, id + ': the bake writes nothing to the map and draws the textures it is handed', JSON.stringify(r));
}
// ---------------------------------------------------------------------------------------------------------------------------
// 6. Props on open ground
// ---------------------------------------------------------------------------------------------------------------------------
// The rules are derived here again from the map, not read from Terrain.propMask, so a mask that lets something through is caught.
vm.runInContext(`
  TT.propMaps = [['temple', 'badlands'], ['medium', 'jungle'], ['huge', 'ice'], ['dustbowl', 'desert'], ['arch:basin:1', 'space'], ['arch:chokepoint:1', 'jungle'], ['arch:cliffs:1', 'desert']];
  TT.open = id => { G.map = new GameMap(7, id); Terrain.reset(7); return G.map; };
  // every broken rule for the prop on (tx, ty), as words
  TT.propFaults = (m, p) => {
    const f = [], W = m.w;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const x = p.tx + a, y = p.ty + b, i = y * W + x; if (!m.inb(x, y)) { f.push('off the map'); continue; }
      if (m.cliff[i] !== 0) f.push('cliff or wall at ' + x + ',' + y); if (m.height[i] === 1) f.push('ramp at ' + x + ',' + y); if (m.featTile && m.featTile[i] >= 0) f.push('feature at ' + x + ',' + y); if (!a && !b && m.walk[i] !== 1) f.push('unwalkable'); }
    const R = Terrain.PROP_RES, H = Terrain.PROP_HALL, near = (r, g) => p.tx >= r.x - g && p.tx < r.x + r.w + g && p.ty >= r.y - g && p.ty < r.y + r.h + g;
    for (const r of m.resources) if (near(r, R)) f.push('near the ' + r.type + ' at ' + r.x + ',' + r.y);
    for (const b of m.bases) if (near({ x: b.x, y: b.y, w: 4, h: 3 }, H)) f.push('in the hall clearing at ' + b.x + ',' + b.y);
    return f;
  };
  TT.layer = (W, ox, oy) => ({ W, ox, oy, h: new Float32Array(W * W), a: new Float32Array(W * W), c: new Float32Array(W * W * 3), s: new Float32Array(W * W) });
`, ctx);
const rules = R(`
  const out = [];
  for (const [id, set] of TT.propMaps) {
    const m = TT.open(id), T = TT.set([90, 80, 70], [200, 190, 170], [150, 140, 120], [110, 90, 80]);
    let n = 0, allowed = 0, faults = [], outside = [], drawn = 0, kinds = new Set();
    for (const v of Terrain.propMask()) allowed += v;
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) {
      const p = Terrain.propAt(tx, ty); if (!p) continue; n++;
      const f = TT.propFaults(m, p); if (f.length && faults.length < 3) faults.push(p.kind + ' ' + tx + ',' + ty + ': ' + f.join('; '));
      // every tenth prop, and the first of each kind, drawn alone: nothing it covers or shades leaves its tile's 3x3 block
      if (n % 10 && kinds.has(p.kind)) continue; kinds.add(p.kind); drawn++;
      const L = TT.layer(160, (tx - 2) * TILE, (ty - 2) * TILE); Terrain.drawProp(L, p, T);
      for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) { const i = y * 160 + x; if ((L.a[i] > 0 || L.s[i] > 0) && (x < 32 || x >= 128 || y < 32 || y >= 128) && outside.length < 3) outside.push(p.kind + ' ' + tx + ',' + ty + ' reaches layer pixel ' + x + ',' + y); }
    }
    out.push({ id, set, tileset: m.tileset, n, allowed, share: +(n / allowed).toFixed(3), density: TERRAIN_PROPS[set].density, faults, outside, drawn, kinds: [...kinds] });
  }
  return out;
`);
for (const r of rules) {
  ok(r.tileset === r.set && r.n > 0 && r.faults.length === 0, r.id + ' (' + r.set + '): ' + r.n + ' props, none on or beside a cliff, wall, ramp or feature, near a resource or in a hall clearing', JSON.stringify(r.faults));
  ok(r.share >= r.density * 0.6 && r.share <= r.density * 1.4, r.id + ': props on ' + (r.share * 100).toFixed(1) + '% of the ground they may stand on, for a density of ' + r.density, JSON.stringify(r));
  ok(r.drawn > 20 && r.outside.length === 0, r.id + ': ' + r.drawn + ' props drawn alone, none covering or shading a pixel outside its own 3x3 tiles', JSON.stringify(r.outside));
}

// Every kind a set names draws a body and a shadow; lit from the upper left, with the shadow down and to the right.
const kinds = R(`
  const out = [];
  for (const [id, set] of [['temple', 'badlands'], ['medium', 'jungle'], ['huge', 'ice'], ['dustbowl', 'desert'], ['arch:basin:1', 'space']]) {
    const m = TT.open(id), T = TT.set([90, 80, 70], [200, 190, 170], [150, 140, 120], [110, 90, 80]);
    for (const [kind] of TERRAIN_PROPS[set].kinds) {
      const tx = 20, ty = 20, p = { kind, tx, ty, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, s: 0.6, a: 0.9 }, L = TT.layer(160, (tx - 2) * TILE, (ty - 2) * TILE);
      Terrain.drawProp(L, p, T);
      let cover = 0, shade = 0, sx = 0, sy = 0, cxs = 0, cys = 0, lit = [0, 0, 0, 0];
      for (let y = 1; y < 159; y++) for (let x = 1; x < 159; x++) {
        const i = y * 160 + x; if (L.a[i] >= 0.5) { cover++; cxs += x; cys += y;
          // the bake's own light on the prop's slopes
          const qx = (L.h[i + 1] - L.h[i - 1]) / 2, qy = (L.h[i + 160] - L.h[i - 160]) / 2; if (qx || qy) { const toSun = 0.5 * qx + 0.6 * qy; lit[toSun > 0 ? 0 : 1] += 1; } }
        else if (L.s[i] > 0.2) shade++;
      }
      // the shadow's weight beyond the prop's centre of cover, away from the sun, and short of it, toward the sun
      let far = 0, near = 0; const ccx = cover ? cxs / cover : 80, ccy = cover ? cys / cover : 80;
      for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) { const i = y * 160 + x; if (L.a[i] >= 0.5 || !L.s[i]) continue; if ((x + 0.5 - ccx) * 0.64 + (y + 0.5 - ccy) * 0.77 > 0) far += L.s[i]; else near += L.s[i]; }
      out.push({ set, kind, cover, shade, far: +far.toFixed(1), near: +near.toFixed(1), faces: lit.slice(0, 2) });
    }
  }
  return out;
`);
const noBody = kinds.filter(k => k.cover < 12 || k.shade < 4), wrongShadow = kinds.filter(k => !(k.far > k.near * 1.15));
const kindCount = R(`let n = 0; for (const s of Object.keys(TERRAIN_PROPS)) n += TERRAIN_PROPS[s].kinds.length; return n;`);
ok(kinds.length === kindCount && kindCount >= 15 && noBody.length === 0, 'kinds: all ' + kindCount + ' draw a body and a shadow', JSON.stringify(noBody));
ok(wrongShadow.length === 0, 'kinds: every shadow falls down and to the right of its prop, away from the sun', JSON.stringify(wrongShadow));
ok(kinds.every(k => k.faces[0] > 0 && k.faces[1] > 0), 'kinds: every prop has faces toward the sun and away from it, for the bake to light', JSON.stringify(kinds.map(k => k.kind + ':' + k.faces)));

// In the bake: a boulder's faces toward the sun are brighter than those away from it, and props change only what they cover or shade.
const lit = R(`
  const m = TT.open('temple'), T = TT.set([90, 80, 70], [200, 190, 170], [150, 140, 120], [110, 90, 80]), CH = Terrain.CH, P = CH * TILE;
  let found = null; for (let ty = 0; ty < m.h && !found; ty++) for (let tx = 0; tx < m.w && !found; tx++) { const p = Terrain.propAt(tx, ty); if (p && p.kind === 'boulder' && p.s > 0.5) { const cx = Math.floor(p.x / P), cy = Math.floor(p.y / P); if (p.x - cx * P > 24 && (cx + 1) * P - p.x > 24 && p.y - cy * P > 24 && (cy + 1) * P - p.y > 24) found = { p, cx, cy }; } }
  if (!found) return { found };
  const { p, cx, cy } = found, withProps = TT.bake(cx, cy, T).slice(), L = Terrain.propLayer(cx, cy, T), keep = TERRAIN_PROPS.badlands;
  const a = L.a.slice(), s = L.s.slice(), h = L.h.slice(), LW = L.W; delete TERRAIN_PROPS.badlands; let bare; try { bare = TT.bake(cx, cy, T); } finally { TERRAIN_PROPS.badlands = keep; }
  let changed = 0, stray = 0, sunB = 0, sunN = 0, awayB = 0, awayN = 0;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const o = (y * P + x) * 4, li = (y + 1) * LW + x + 1, d = withProps[o] !== bare[o] || withProps[o + 1] !== bare[o + 1] || withProps[o + 2] !== bare[o + 2];
    if (d) { changed++; if (!(a[li] > 0 || s[li] > 0)) stray++; }
    // a face rising toward the lower right faces the sun in the upper left: the bake's light is brightest where 0.5 dh/dx + 0.6 dh/dy > 0
    if (a[li] >= 0.9 && Math.hypot(x + cx * P - p.x, y + cy * P - p.y) < 9) { const qx = (h[li + 1] - h[li - 1]) / 2, qy = (h[li + LW] - h[li - LW]) / 2, toSun = 0.5 * qx + 0.6 * qy, L2 = withProps[o] + withProps[o + 1] + withProps[o + 2];
      if (toSun > 0.3) { sunB += L2; sunN++; } else if (toSun < -0.3) { awayB += L2; awayN++; } }
  }
  return { at: [p.tx, p.ty], changed, stray, sun: sunN ? Math.round(sunB / sunN) : 0, away: awayN ? Math.round(awayB / awayN) : 0, sunN, awayN };
`);
ok(!!lit.at && lit.changed > 200 && lit.stray === 0, 'bake: props change ' + lit.changed + ' pixels of a chunk on Lost Ruins, every one covered or shaded by a prop', JSON.stringify(lit));
ok(!!lit.at && lit.sunN > 10 && lit.awayN > 10 && lit.sun > lit.away * 1.3, 'bake: a boulder\'s faces toward the sun come out brighter (' + lit.sun + ') than those away from it (' + lit.away + ')', JSON.stringify(lit));

// A prop crossing a chunk edge is drawn the same by both chunks: their layers agree over the two pixel columns (or rows) they share.
const seams = R(`
  const m = TT.open('medium'), T = TT.set([90, 80, 70], [200, 190, 170], [150, 140, 120], [110, 90, 80]), CH = Terrain.CH, P = CH * TILE;
  let pairs = 0, crossing = 0, bad = [];
  const copy = L => L && { W: L.W, h: L.h.slice(), a: L.a.slice(), c: L.c.slice(), s: L.s.slice() };
  for (let cy = 2; cy < 10 && pairs < 60; cy++) for (let cx = 2; cx < 10 && pairs < 60; cx++) {
    const A = copy(Terrain.propLayer(cx, cy, T)), B = copy(Terrain.propLayer(cx + 1, cy, T)), D = copy(Terrain.propLayer(cx, cy + 1, T)); pairs++;
    const LW = P + 2, cmp = (X, Y, ia, ib) => { const va = X ? [X.h[ia], X.a[ia], X.s[ia], X.c[ia * 3], X.c[ia * 3 + 1], X.c[ia * 3 + 2]] : [0, 0, 0, 0, 0, 0], vb = Y ? [Y.h[ib], Y.a[ib], Y.s[ib], Y.c[ib * 3], Y.c[ib * 3 + 1], Y.c[ib * 3 + 2]] : [0, 0, 0, 0, 0, 0];
      if (va[1] > 0 || va[2] > 0 || vb[1] > 0 || vb[2] > 0) crossing++; if (va.some((v, k) => Math.abs(v - vb[k]) > 1e-4) && bad.length < 3) bad.push(cx + ',' + cy + ' ' + JSON.stringify([va, vb])); };
    // A's last two columns are world x = (cx+1)*P - 1 and (cx+1)*P, B's first two the same; likewise rows with D
    for (let y = 0; y < LW; y++) for (let k = 0; k < 2; k++) cmp(A, B, y * LW + LW - 2 + k, y * LW + k);
    for (let x = 0; x < LW; x++) for (let k = 0; k < 2; k++) cmp(A, D, (LW - 2 + k) * LW + x, k * LW + x);
  }
  return { pairs, crossing, bad };
`);
ok(seams.pairs === 60 && seams.crossing > 50, 'seams: ' + seams.pairs + ' chunk edges on Contested Ground, ' + seams.crossing + ' shared pixels a prop covers or shades', JSON.stringify(seams));
ok(seams.bad.length === 0, 'seams: every shared pixel is drawn the same by both chunks', JSON.stringify(seams.bad));

// What play changes moves no prop: every feature broken, a hulk dropped, a mineral patch mined out.
const stable = R(`
  const m = TT.open('arch:chokepoint:1'), before = Terrain.propMask().slice();
  for (const f of m.features) m.breakFeature(f);
  // a hulk on open ground where props stand: the first 3x3 of prop-bearing tiles from the map's centre outward
  let hulk = null; for (let r = 0; r < 40 && !hulk; r++) for (let dy = -r; dy <= r && !hulk; dy++) for (let dx = -r; dx <= r && !hulk; dx++) {
    const x = (m.w >> 1) + dx, y = (m.h >> 1) + dy; let free = true; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (!before[(y + b) * m.w + x + a]) free = false;
    if (free) hulk = m.addWreck((x + 0.5) * TILE, (y + 0.5) * TILE, 3, 3, 2000, 10, true); }
  const patch = m.resources.find(r => r.type === 'mineral'), at = m.resources.indexOf(patch); m.resources.splice(at, 1);
  Terrain._propMask = null; const after = Terrain.propMask();
  let diff = 0; for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diff++;
  return { features: m.features.length, broken: m.features.filter(f => f.broken).length, hulk: !!hulk, hulkTiles: hulk ? hulk.tiles.length : 0, diff };
`);
ok(stable.features > 0 && stable.broken === stable.features && stable.hulk && stable.hulkTiles > 0, 'stable: on Chokepoint Valley ' + stable.broken + ' features broken, a ' + stable.hulkTiles + '-tile hulk dropped and a mineral patch mined out', JSON.stringify(stable));
ok(stable.diff === 0, 'stable: not one prop tile changed', JSON.stringify(stable));

// ---------------------------------------------------------------------------------------------------------------------------
// 7b. Sharp chunks: the same picture, finer
// ---------------------------------------------------------------------------------------------------------------------------
vm.runInContext(`
  // the same pattern as TT.tex at S texels to a repeat: blobs in the texture's own period, grain in cells of 512ths of it
  TT.texS = (S, base, amp, seed) => { const d = new Uint8ClampedArray(S * S * 4), f = 2 * Math.PI / S, g = S / 512; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const blob = Math.sin(x * f * 3 + seed) * Math.cos(y * f * 2 + seed * 1.7) + 0.5 * Math.sin((x + y) * f * 5 + seed * 0.3); const gx = Math.floor(x / g), gy = Math.floor(y / g), grain = ((Math.imul((gx * 73856093) ^ (gy * 19349663) ^ (seed * 83492791), 2654435761) >>> 0) % 17) - 8, v = blob * amp + grain, p = (y * S + x) * 4; d[p] = base[0] + v; d[p + 1] = base[1] + v; d[p + 2] = base[2] + v; d[p + 3] = 255; } return d; };
  TT.setS = (S, cols) => ({ low: TT.texS(S, cols[0], 50, 1), high: TT.texS(S, cols[1], 20, 2), ramp: TT.texS(S, cols[2], 30, 3), rock: TT.texS(S, cols[3], 20, 4) });
  // a chunk's luminance averaged over n x n squares, each source pixel weighed by how much of it the square covers
  TT.down = (d, W, n) => {
    const s = W / n, o = new Float64Array(n * n), spans = [];
    for (let a = 0; a < n; a++) { const lo = a * s, hi = (a + 1) * s, sp = []; for (let p = Math.floor(lo); p < Math.ceil(hi); p++) { const w = Math.min(hi, p + 1) - Math.max(lo, p); if (w > 1e-9) sp.push([p, w]); } spans.push(sp); }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let acc = 0, wt = 0; for (const [py, wy] of spans[y]) for (const [px, wx] of spans[x]) { const p = (py * W + px) * 4, w = wy * wx; acc += (d[p] * 0.2126 + d[p + 1] * 0.7152 + d[p + 2] * 0.0722) * w; wt += w; } o[y * n + x] = acc / wt; }
    return o;
  };
  TT.mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
`, ctx);
const sharp = R(`
  const cols = [[90, 80, 70], [200, 190, 170], [150, 140, 120], [110, 90, 80]], T1 = TT.setS(512, cols), T15 = TT.setS(768, cols), T2 = TT.setS(1024, cols), out = [];
  const cover = L => L ? Array.from(L.a).filter(v => v > 0.5).length : 0;
  for (const t of ['badlands', 'ice', 'space']) {
    const m = TT.map(t, 7);
    for (const [cx, cy] of TT.pick(m, 1, 1)) {
      // compared as squares of four world px: the textures' own grain (a synthetic texture at 768 is not a 1.5x enlargement of the one
      // at 512, texel for texel) averages out, and the ground's shape, light and props are what is left to compare
      const c1 = Terrain.renderChunkTex(cx, cy, T1, 1), a = TT.down(c1.img.data, c1.width, 64);
      const c2 = Terrain.renderChunkTex(cx, cy, T2, 2), b2 = TT.down(c2.img.data, c2.width, 64), w2 = c2.width, k2 = c2.k;
      const c15 = Terrain.renderChunkTex(cx, cy, T15, 1.5), b15 = TT.down(c15.img.data, c15.width, 64), w15 = c15.width;
      const cn = Terrain.renderChunkTex(cx + 1, cy + 1, T1, 1), other = TT.down(cn.img.data, cn.width, 64);
      out.push({ t, chunk: cx + ',' + cy, w2, k2, w15, mad2: +TT.mad(a, b2).toFixed(2), mad15: +TT.mad(a, b15).toFixed(2), control: +TT.mad(a, other).toFixed(2),
        p1: cover(Terrain.propLayer(cx, cy, T1, 1)), p15: cover(Terrain.propLayer(cx, cy, T15, 1.5)), p2: cover(Terrain.propLayer(cx, cy, T2, 2)) });
    }
  }
  return out;
`);
ok(sharp.length === 6 && sharp.every(r => r.w2 === 512 && r.k2 === 2 && r.w15 === 384), 'sharp: six chunks on Badlands, Ice and Space Platform baked at ratio 2 (512 px) and 1.5 (384 px) from textures of 1024 and 768 texels', JSON.stringify(sharp.map(r => [r.w2, r.k2, r.w15])));
ok(sharp.every(r => r.mad2 <= 3 && r.mad15 <= 3 && r.control > 5 * Math.max(r.mad2, r.mad15)), 'sharp: averaged over squares of four world pixels, each is the ratio-1 chunk (off by at most ' + Math.max(...sharp.map(r => r.mad2)) + ' levels at 2, ' + Math.max(...sharp.map(r => r.mad15)) + ' at 1.5) where a neighbouring chunk is off by ' + Math.min(...sharp.map(r => r.control)) + ' or more', JSON.stringify(sharp));
const propped2 = sharp.filter(r => r.p1 > 100);
ok(propped2.length >= 3 && propped2.every(r => r.p2 / r.p1 > 3.6 && r.p2 / r.p1 < 4.4 && r.p15 / r.p1 > 2 && r.p15 / r.p1 < 2.5), 'sharp: the props cover four times the pixels at ratio 2 and two and a quarter at 1.5 -- the same props, finer (' + propped2.map(r => r.p1 + '/' + r.p15 + '/' + r.p2).join(' ') + ')', JSON.stringify(sharp));
const steps = R(`
  const cols = [[90, 80, 70], [200, 190, 170], [150, 140, 120], [110, 90, 80]], T15 = TT.setS(768, cols), T1 = TT.setS(512, cols);
  TT.map('jungle', 7);
  const whole = Terrain.renderChunkTex(3, 3, T15, 1.5).img.data.slice();
  const it = Terrain.texBakeSteps(3, 3, T15, 1.5, 'job'); let n = 0, r;
  // other bakes between its steps, as refine's job is interleaved with each frame's bakes: the same ratio, and ratio 1
  while (!(r = it.next()).done) { n++; if (n === 200) { Terrain.renderChunkTex(5, 2, T15, 1.5); Terrain.renderChunkTex(5, 2, T1, 1); } if (n === 600) Terrain.renderChunkTex(1, 4, T15, 1.5); }
  const sliced = r.value.img.data; let diff = 0; for (let i = 0; i < whole.length; i++) if (whole[i] !== sliced[i]) diff++;
  return { n, rows: 384 + 384 + 2 * Math.round(24 * 1.5), diff };
`);
ok(steps.n === steps.rows && steps.diff === 0, 'sharp: a ratio-1.5 bake in steps yields once a row (' + steps.n + ' rows) and, with three other bakes run between its steps, gives the very pixels of a bake at once', JSON.stringify(steps));

// ---------------------------------------------------------------------------------------------------------------------------
// 8. Creep as one continuous mass
// ---------------------------------------------------------------------------------------------------------------------------
vm.runInContext(`
  TT.creep = {
    mat: null,
    material() { if (!this.mat) { const it = Terrain.creepMatSteps(128); let r; do r = it.next(); while (!r.done); this.mat = r.value; } return this.mat; },
    bake(cx, cy, K) { const it = Terrain.creepBakeSteps(cx, cy, this.material(), K, 'tt'); let r; do r = it.next(); while (!r.done); return r.value; },
    fill(m, x0, y0, x1, y1, v) { for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) if (m.inb(tx, ty)) m.creep[m.idx(tx, ty)] = v; },
    // a flat chunk with flat ground three chunks to its right, and the tiles round them
    spot(m) { const CH = Terrain.CH, flat = (cx, cy) => { for (let y = cy * CH - 4; y < (cy + 1) * CH + 4; y++) for (let x = cx * CH - 4; x < (cx + 1) * CH + 4; x++) { if (!m.inb(x, y)) return false; const i = m.idx(x, y); if (m.height[i] !== 0 || m.cliff[i] !== 0 || m.walk[i] !== 1) return false; } return true; };
      for (let cy = 1; cy < m.h / CH - 1; cy++) for (let cx = 1; cx + 3 < m.w / CH - 1; cx++) if (flat(cx, cy) && flat(cx + 1, cy) && flat(cx + 2, cy)) return [cx, cy];
      return null; },
  };
`, ctx);
const creepMat = R(`
  const M = TT.creep.material(), N = M.N, L = M.levels[0], lum = (i, j) => { const o = (((j + N) % N) * N + (i + N) % N) * 4; return L[o] * 0.3 + L[o + 1] * 0.59 + L[o + 2] * 0.11; };
  let wrapX = 0, inX = 0, wrapY = 0, inY = 0;
  for (let j = 0; j < N; j++) { wrapX += Math.abs(lum(0, j) - lum(N - 1, j)); for (let i = 1; i < N; i++) inX += Math.abs(lum(i, j) - lum(i - 1, j)); }
  for (let i = 0; i < N; i++) { wrapY += Math.abs(lum(i, 0) - lum(i, N - 1)); for (let j = 1; j < N; j++) inY += Math.abs(lum(i, j) - lum(i, j - 1)); }
  wrapX /= N; wrapY /= N; inX /= N * (N - 1); inY /= N * (N - 1);
  const tones = new Set(); for (let o = 0; o < 48 * 48; o++) tones.add(Math.round(L[o * 4] * 0.3 + L[o * 4 + 1] * 0.59 + L[o * 4 + 2] * 0.11));
  return { N, levels: M.levels.map(l => Math.round(Math.sqrt(l.length / 4))), wrapX: +wrapX.toFixed(2), inX: +inX.toFixed(2), wrapY: +wrapY.toFixed(2), inY: +inY.toFixed(2), tones: tones.size };
`);
ok(creepMat.levels.join() === '128,64,32,16' && creepMat.inX > 1 && creepMat.wrapX <= 1.5 * creepMat.inX && creepMat.wrapY <= 1.5 * creepMat.inY && creepMat.tones >= 40,
  'creep: the material tiles with no seam -- across its wrap a column changes by ' + creepMat.wrapX + ' and a row by ' + creepMat.wrapY + ', as between any two inside it (' + creepMat.inX + ', ' + creepMat.inY + ') -- in ' + creepMat.tones + ' tones, not a posterised handful, with levels of detail at a half, a quarter and an eighth', JSON.stringify(creepMat));
// the edge across a flat chunk: creep on every tile left of its middle
const creepEdge = R(`
  const m = TT.map('badlands', 7), spot = TT.creep.spot(m); if (!spot) return { spot: null };
  const [cx, cy] = spot, CH = Terrain.CH, bx = cx * CH + 4, E = Terrain.CREEP_EDGE, A = Terrain.CREEP_APRON;
  m.creep.fill(0); TT.creep.fill(m, bx - 12, cy * CH - 6, bx, (cy + 1) * CH + 6, 1);
  let calls = 0; const po = Terrain.posterise, ba = Terrain.bayerAt; Terrain.posterise = function (...a) { calls++; return po.apply(this, a); }; Terrain.bayerAt = function (...a) { calls++; return ba.apply(this, a); };
  let cv; try { cv = TT.creep.bake(cx, cy, 1); } finally { Terrain.posterise = po; Terrain.bayerAt = ba; }
  const OW = cv.width, d = cv.img.data, W = OW - 2 * A, ox = cx * CH * TILE;
  // the mean opacity of each column of the chunk, against world x
  const prof = []; for (let p = A; p < A + W; p++) { let s = 0; for (let q = A; q < A + W; q++) s += d[(q * OW + p) * 4 + 3]; prof.push({ x: ox + (p - A + 0.5), a: s / W }); }
  const top = E.amax * 255, x90 = prof.filter(c => c.a >= 0.9 * top).map(c => c.x).pop(), x10 = prof.find(c => c.x > x90 && c.a <= 0.1 * top), x50 = prof.find(c => c.x > x90 && c.a <= 0.5 * top);
  let step = 0; for (let q = A; q < A + W - 1; q++) for (let p = A; p < A + W - 1; p++) { const o = (q * OW + p) * 4 + 3; step = Math.max(step, Math.abs(d[o] - d[o + 4]), Math.abs(d[o] - d[o + OW * 4])); }
  const tones = new Set(); for (let q = A; q < A + 48; q++) for (let p = A; p < A + 48; p++) { const o = (q * OW + p) * 4; tones.add(d[o] * 65536 + d[o + 1] * 256 + d[o + 2]); }
  // the coverage the bake worked from, as it left it: no step between neighbouring pixels anywhere
  const CW = W + 2 * (A + 1), C = Terrain._scratch['ttcreep' + CW]; let dc = 0; for (let q = 1; q < CW; q++) for (let p = 1; p < CW; p++) { const o = q * CW + p; dc = Math.max(dc, Math.abs(C[o] - C[o - 1]), Math.abs(C[o] - C[o - CW])); }
  return { spot, width: x10 && x90 !== undefined ? +(x10.x - x90).toFixed(1) : null, cross: x50 ? +(x50.x - bx * TILE).toFixed(1) : null, step, dc: +dc.toFixed(3), calls, tones: tones.size, OW, k: cv.k, apron: cv.apron };
`);
ok(!!creepEdge.spot && creepEdge.OW === 256 + 2 * 2 && creepEdge.apron === 2 && creepEdge.calls === 0 && creepEdge.tones >= 200, 'creep: a chunk at ratio 1 is its 256 pixels and an apron of two round them, drawn with no ordered dither and no posterising (' + creepEdge.tones + ' colours in a corner of it)', JSON.stringify(creepEdge));
ok(creepEdge.width >= 12 && Math.abs(creepEdge.cross) <= 16 && creepEdge.step <= 60, 'creep: the edge thins over ' + creepEdge.width + ' world px, is half there ' + creepEdge.cross + ' px from the tile boundary the simulation drew, and no pixel\'s opacity is more than ' + creepEdge.step + ' from its neighbour\'s', JSON.stringify(creepEdge));
ok(creepEdge.dc > 0 && creepEdge.dc <= 0.1, 'creep: the coverage the edge is cut from never steps -- ' + creepEdge.dc + ' at most between neighbouring pixels -- so no line is drawn along a contour', JSON.stringify(creepEdge));
// two chunks meeting at a creep edge, and a field a material repeat long
const creepSeam = R(`
  const m = TT.map('badlands', 7), spot = TT.creep.spot(m); if (!spot) return { spot: null };
  const [cx, cy] = spot, CH = Terrain.CH, A = Terrain.CREEP_APRON, out = {};
  m.creep.fill(0); TT.creep.fill(m, cx * CH - 6, cy * CH + 2, (cx + 1) * CH + 3, cy * CH + 6, 1);
  for (const K of [1, 1.5]) {
    const a = TT.creep.bake(cx, cy, K), ad = a.img.data.slice(), b = TT.creep.bake(cx + 1, cy, K), bd = b.img.data, OW = a.width, W = OW - 2 * A;
    let worst = 0, lit = 0; for (let q = 0; q < OW; q++) for (let s = 0; s < 2 * A; s++) { const oa = (q * OW + W + s) * 4, ob = (q * OW + s) * 4; for (let k = 0; k < 4; k++) worst = Math.max(worst, Math.abs(ad[oa + k] - bd[ob + k])); if (ad[oa + 3] > 0) lit++; }
    out['k' + String(K).replace('.', '')] = { worst, lit };
  }
  // all creep over three chunks: the chunk and the one a material repeat (sixteen tiles) to its right
  m.creep.fill(0); TT.creep.fill(m, cx * CH - 6, cy * CH - 6, (cx + 3) * CH + 6, (cy + 1) * CH + 6, 1);
  const lumOf = cv => { const d = cv.img.data, OW = cv.width, W = OW - 2 * A, o = new Float64Array(W * W); for (let q = 0; q < W; q++) for (let p = 0; p < W; p++) { const i = ((q + A) * OW + p + A) * 4; o[q * W + p] = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; } return o; };
  out.repeat = +TT.corr(lumOf(TT.creep.bake(cx, cy, 1)), lumOf(TT.creep.bake(cx + 2, cy, 1))).toFixed(3);
  return out;
`);
ok(!!creepSeam.k1 && creepSeam.k1.lit > 20 && creepSeam.k1.worst <= 1 && creepSeam.k15.worst <= 1, 'creep: where two chunks meet across a creep edge, the apron of one is the very pixels of the other\'s edge, at ratio 1 and 1.5 (off by ' + creepSeam.k1.worst + ' and ' + creepSeam.k15.worst + ')', JSON.stringify(creepSeam));
ok(Math.abs(creepSeam.repeat) < 0.5, 'creep: a field of creep a material repeat (sixteen tiles) apart does not repeat -- the two chunks correlate ' + creepSeam.repeat, JSON.stringify(creepSeam));
// the reach, and the swap
const creepSwap = R(`
  const m = TT.map('badlands', 7), spot = TT.creep.spot(m), CH = Terrain.CH, out = {}; if (!spot) return out;
  const [cx, cy] = spot, nx = () => Terrain.creepNx(), sigOf = (x, y) => Terrain.creepSig[y * nx() + x];
  m.creep.fill(0); Terrain.syncCreep(); const bare = sigOf(cx, cy);
  const t = [cx * CH - Terrain.CREEP_REACH, cy * CH + 3]; m.creep[m.idx(t[0], t[1])] = 1; Terrain.syncCreep(); out.reach = sigOf(cx, cy) !== bare;
  m.creep[m.idx(t[0], t[1])] = 0;
  const realTex = Terrain.texSet, ms = Terrain.CREEP_MS;
  Terrain.textured = true; Terrain.texSet = () => ({}); Terrain._creepTex = TT.creep.material();
  try {
    TT.creep.fill(m, cx * CH + 2, cy * CH + 2, cx * CH + 22, cy * CH + 12, 1); Terrain.syncCreep();
    const view = [cx - 1, cx + 3, cy - 1, cy + 1], keys = [];
    for (let y = view[2]; y <= view[3]; y++) for (let x = view[0]; x <= view[1]; x++) if (Terrain.creepAny[y * nx() + x]) keys.push(x + ',' + y);
    Terrain.CREEP_MS = 0; Terrain.creepWork(...view); out.firstCall = Terrain.creepChunks.size;
    for (let i = 0; i < 60; i++) Terrain.creepWork(...view);
    out.keys = keys.length; out.allBaked = keys.every(k => { const e = Terrain.creepChunks.get(k); return e && e.tex && e.cv.apron === Terrain.CREEP_APRON; });
    const before = new Map(keys.map(k => [k, Terrain.creepChunks.get(k).cv]));
    TT.creep.fill(m, cx * CH + 1, cy * CH + 1, cx * CH + 23, cy * CH + 13, 1); Terrain.syncCreep();
    const changed = keys.filter(k => { const [x, y] = k.split(',').map(Number); return sigOf(x, y) !== Terrain.creepChunks.get(k).sig; });
    out.changed = changed.length;
    let calls = 0, mixed = 0, swapped = false;
    for (; calls < 50000 && !swapped; calls++) {
      Terrain.creepWork(...view);
      const n = changed.filter(k => { const [x, y] = k.split(',').map(Number); return Terrain.creepChunk(x, y) !== before.get(k); }).length;
      if (n > 0 && n < changed.length) mixed++;
      if (n === changed.length) swapped = true;
    }
    out.calls = calls; out.mixed = mixed; out.swapped = swapped;
    out.oldFreed = changed.every(k => before.get(k).width === 0);
    out.current = keys.every(k => { const [x, y] = k.split(',').map(Number), e = Terrain.creepChunks.get(k); return e.sig === sigOf(x, y) && !e.next; });
  } finally { Terrain.CREEP_MS = ms; Terrain.texSet = realTex; Terrain.textured = false; Terrain._creepTex = null; Terrain.dropCreepChunks(); }
  return out;
`);
ok(creepSwap.reach, 'creep: a creep bit CREEP_REACH tiles outside a chunk is in the chunk\'s signature, so the chunk is baked again when it changes', JSON.stringify(creepSwap));
ok(creepSwap.firstCall >= 1 && creepSwap.keys >= 2 && creepSwap.allBaked, 'creep: chunks in view with no picture are baked at once -- one at least on a call with no time at all -- until all ' + creepSwap.keys + ' have one', JSON.stringify(creepSwap));
ok(creepSwap.changed >= 2 && creepSwap.swapped && creepSwap.mixed === 0 && creepSwap.calls > creepSwap.changed && creepSwap.oldFreed && creepSwap.current, 'creep: when it grows, the ' + creepSwap.changed + ' changed chunks keep their old pictures while the new ones are baked a step a call (' + creepSwap.calls + ' calls), and all change on the same call -- never half old and half new; the old pictures freed', JSON.stringify(creepSwap));

// ---------------------------------------------------------------------------------------------------------------------------
// 9. Cliffs that look twice as tall
// ---------------------------------------------------------------------------------------------------------------------------
// The scene of .claude/review/cliffs/probe-cliff.js: every tile left of x 24 and above y 40 high, a ramp down its south side at x 8-11, the
// rest open floor, baked at ratio 1 from flat textures. Measured with the code before the change (CLIFF_W 0.36, RISE 22, the shadow read
// 9 and 11 px towards the sun, at most 0.32 dark, the shade's floor 0.5): the drop 22.2 px wide on Badlands and 17 on Space Platform (whose
// height is not blurred); the darkening past an east-facing cliff's tile 6.6 and 4.3 px, past a south-facing one 18.9 and 14.9; a ramp's
// foot against the floor 1.594 and 3.496.
const CLIFF_BEFORE = { badlands: { drop: 22.2, east: 6.6, south: 18.9, ramp: 1.594 }, space: { drop: 17, east: 4.3, south: 14.9, ramp: 3.496 } };
const cliffs = R(`
  const S = Terrain.TEX_PX, tex = (base, amp, seed) => { const d = new Uint8ClampedArray(S * S * 4), f = 2 * Math.PI / S; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const blob = Math.sin(x * f * 3 + seed) * Math.cos(y * f * 2 + seed * 1.7), v = blob * amp, p = (y * S + x) * 4; d[p] = base[0] + v; d[p + 1] = base[1] + v; d[p + 2] = base[2] + v; d[p + 3] = 255; } return d; };
  const T = { low: tex([110, 100, 90], 6, 1), high: tex([200, 190, 170], 6, 2), ramp: tex([150, 140, 120], 6, 3), rock: tex([120, 100, 90], 6, 4) }, res = {};
  for (const set of ['badlands', 'space']) {
    const m = TT.map(set, 7), W = m.w;
    m.height.fill(0); m.cliff.fill(0); m.walk.fill(1); m.blocked.fill(-1); m.resources = []; m.features = []; m.wrecks = [];
    for (let y = 0; y < 40; y++) for (let x = 0; x < 24; x++) m.height[y * W + x] = 2;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (m.height[i] !== 2) continue; let edge = false; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const xx = x + a, yy = y + b; if (xx >= 0 && yy >= 0 && xx < W && yy < m.h && m.height[yy * W + xx] === 0) edge = true; } if (edge) { m.cliff[i] = 1; m.walk[i] = 0; } }
    for (let y = 39; y < 43; y++) for (let x = 8; x < 12; x++) { const i = y * W + x; m.height[i] = 1; m.cliff[i] = 0; m.walk[i] = 1; }
    Terrain.reset(7);
    const bake = (cx, cy) => { const it = Terrain.texBakeSteps(cx, cy, T, 1, 'cliff'); let r; do r = it.next(); while (!r.done); return r.value; };
    const lum = (d, x, y) => { const o = (y * 256 + x) * 4; return d[o] * 0.3 + d[o + 1] * 0.59 + d[o + 2] * 0.11; };
    const PW = 256 + 2 * 24; bake(2, 2); const hf = Terrain._scratch['cliffhf' + PW].slice(), bd = bake(3, 2).img.data;
    let drop = 0, rows = 0; for (let py = 40; py < 216; py += 8) { for (let px = 0; px < 256; px++) { const h = hf[(py + 24) * PW + px + 24]; if (h > 0.05 && h < 0.95) drop++; } rows++; }
    let floor = 0, fn = 0; for (let py = 40; py < 216; py++) for (let px = 160; px < 256; px++) { floor += lum(bd, px, py); fn++; } floor /= fn;
    let east = 0; for (let py = 40; py < 216; py += 8) { let r = 0; for (let px = 0; px < 256; px++) { if (lum(bd, px, py) < 0.93 * floor) r = px + 1; else if (px > r + 3) break; } east += r; }
    const cd = bake(2, 5).img.data; let south = 0, cols = 0; for (let px = 8; px < 180; px += 8) { let r = 0; for (let py = 0; py < 256; py++) { if (lum(cd, px, py) < 0.93 * floor) r = py + 1; else if (py > r + 3) break; } south += r; cols++; }
    const rd = bake(1, 5).img.data; let ramp = 0, rn = 0; for (let py = 0; py < 16; py++) for (let px = 8; px < 88; px++) { ramp += lum(rd, px, py); rn++; }
    res[set] = { drop: +(drop / rows).toFixed(1), east: +(east / rows).toFixed(1), south: +(south / cols).toFixed(1), ramp: +(ramp / rn / floor).toFixed(3) };
  }
  return res;
`);
// ...and the far view draws them from the same constants: its match with the chunks, tile by tile, cannot see a shadow or a drop left as
// it was (it moved by a level or two, inside the far view's own coarser grain), so the two functions are read for them.
const cliffSrc = R(`
  const names = ['CLIFF_W', 'CLIFF_EVEN', 'CLIFF_RISE', 'CLIFF_SHADOW', 'CLIFF_SHADE', 'CLIFF_FLOOR'], old = ['/ 0.36 + 0.5', 'RISE = 22', '9 / D', '11 * K', 'Math.min(0.32'];
  const read = f => { const s = String(f); return { uses: names.filter(n => s.includes('this.' + n)), old: old.filter(o => s.includes(o)) }; };
  return { bake: read(Terrain.texBakeSteps), far: read(Terrain.paintOverviewTex) };
`);
ok(cliffSrc.bake.uses.length === 6 && !cliffSrc.bake.old.length && cliffSrc.far.uses.length === 6 && !cliffSrc.far.old.length, 'cliffs: the chunks and the far view both draw cliffs from all six CLIFF_ constants, and neither keeps an old literal', JSON.stringify(cliffSrc));
for (const set of ['badlands', 'space']) {
  const a = cliffs[set], b = CLIFF_BEFORE[set];
  ok(!!a && a.drop >= 1.4 * b.drop, 'cliffs: on ' + set + ' a cliff\'s drop is ' + (a && a.drop) + ' world px wide, half as wide again as the ' + b.drop + ' before', JSON.stringify(a));
  ok(!!a && a.east >= 2 * b.east && a.south >= 1.5 * b.south, 'cliffs: on ' + set + ' its shadow darkens the floor ' + (a && a.east) + ' px past an east-facing cliff (' + b.east + ' before) and ' + (a && a.south) + ' past a south-facing one (' + b.south + ')', JSON.stringify(a));
  ok(!!a && Math.abs(a.ramp - b.ramp) <= 0.02, 'cliffs: on ' + set + ' a ramp is lit as it was -- ' + (a && a.ramp) + ' of the floor\'s light at its foot, ' + b.ramp + ' before -- where twice the rise and twice the shadow put every ramp facing away from the sun in the dark', JSON.stringify(a));
}
ok(errors.length === 0, 'no console errors', JSON.stringify(errors.slice(0, 3)));
summary();
