// Detailed terrain -- the textured ground in js/terrain.js (TERRAIN_TEX, renderChunkTex) -- with texture data handed to it,
// because the headless suites have no images to load. Started in the terrain queue's phase 2 (the four other tilesets).
//   node test/terraintex.js
//
// What a look cannot be asserted into, the numbers around it can, and each of these has a negative control
// (.claude/review/terrain/controls-terraintex.js) that turns it RED:
//  1. EVERY TILESET HAS A COMPLETE SET: four textures that exist in assets/terrain and are recorded in SOURCES.md (where they
//     came from and their licence), a grade for each, and a look whose lists name only real materials.
//  2. HEALING LIFTS FLECKS AND NOTHING ELSE: Terrain.healFlecks raises the dark flecks of a light texture to the colour round them
//     (Ice's snow_02: each twig a tile-long black squiggle across a plateau) and leaves every other texel byte-identical.
//  3. CELLS LEAVE NO REPEAT: two stretches of flat low ground sixteen tiles apart -- one texture repeat -- come out alike when
//     the texture is laid plainly, and unalike laid in cells (look.cells).
//  4. A PLATFORM FOLLOWS ITS TILES: Space Platform reads its height field straight from the tiles (look.blur 0), so along a
//     stepped plateau edge every plateau pixel is drawn high and every low pixel low; the 3x3 blur rounds the steps off.
//  5. THE BAKE IS A PURE FUNCTION OF THE MAP, ITS SEED AND THE TILE, and writes nothing to the map.
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
      const id = '__tt_' + tileset; if (!MAP_LAYOUTS[id]) MAP_LAYOUTS[id] = MapModes.layout('medium', { tileset, name: 'terraintex ' + tileset });
      G.map = new GameMap(seed || 7, id); Terrain.reset(seed || 7); return G.map;
    },
    bake(cx, cy, T) { const cv = Terrain.renderChunkTex(cx, cy, T); return cv.img.data; },
    lum(d) { const out = new Float64Array(d.length / 4); for (let i = 0; i < out.length; i++) out[i] = d[i * 4] * 0.2126 + d[i * 4 + 1] * 0.7152 + d[i * 4 + 2] * 0.0722; return out; },
    corr(a, b) { const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; } return sab / Math.sqrt(saa * sbb || 1); },
    // chunks whose own tiles and the three round them are all flat low ground, in pairs sixteen tiles (two chunks) apart
    flatPairs(m, want) {
      const CH = Terrain.CH, flat = (cx, cy) => { for (let y = cy * CH - 3; y < (cy + 1) * CH + 3; y++) for (let x = cx * CH - 3; x < (cx + 1) * CH + 3; x++) { if (!m.inb(x, y)) return false; const i = m.idx(x, y); if (m.height[i] !== 0 || m.cliff[i] !== 0 || m.walk[i] !== 1) return false; } return true; };
      const out = []; for (let cy = 1; cy < m.h / CH - 1 && out.length < want; cy++) for (let cx = 1; cx + 2 < m.w / CH - 1 && out.length < want; cx++) if (flat(cx, cy) && flat(cx + 2, cy)) out.push([cx, cy]);
      return out;
    },
  };
`, ctx);

// ---------------------------------------------------------------------------------------------------------------------------
// 3. Cells leave no repeat
// ---------------------------------------------------------------------------------------------------------------------------
const cells = R(`
  const m = TT.map('ice'), T = TT.set([90, 110, 150], [215, 220, 225], [150, 160, 180], [60, 60, 70]), pairs = TT.flatPairs(m, 4);
  // the transposed second sample off for both: on these chunks it mixes near half and half, which hides a repeat by itself
  const look = TERRAIN_LOOK.ice, real = { cells: look.cells, mix: look.mix }, corr = cellsOn => {
    look.mix = 0; if (!cellsOn) look.cells = [];
    try { return pairs.map(([cx, cy]) => TT.corr(TT.lum(TT.bake(cx, cy, T)), TT.lum(TT.bake(cx + 2, cy, T)))); }
    finally { look.cells = real.cells; look.mix = real.mix; }
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
  const cx = Math.floor((s.x - 6) / CH), cy0 = Math.floor(s.y / CH), look = TERRAIN_LOOK.space, real = look.blur;
  const wrong = blur => {
    if (blur) delete look.blur;
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
    } finally { look.blur = real; }
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
    const a = TT.bake(cx, cy, T).slice(); Terrain.chunks.clear(); Terrain._rampLv = null; const b = TT.bake(cx, cy, T);
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
ok(errors.length === 0, 'no console errors', JSON.stringify(errors.slice(0, 3)));
summary();
