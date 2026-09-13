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
//  6. PROPS (phase 3): every kind a set names draws something; on every map, no prop stands on or beside a cliff, a wall, a ramp or a
//     map feature, near a resource or in a hall clearing, and none covers or shades a pixel outside its own tile's 3x3 block; about
//     the set's density of the allowed ground has one; a prop crossing a chunk edge is drawn the same on both sides; what play
//     changes -- a broken feature, a hulk, a mined-out patch -- moves no prop; a prop is lit from the upper left with its shadow down
//     and right; and the bake changes only the pixels the props cover or shade.
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

ok(errors.length === 0, 'no console errors', JSON.stringify(errors.slice(0, 3)));
summary();
