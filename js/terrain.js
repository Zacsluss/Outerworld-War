'use strict';
// ============================================================================
// Terrain renderer: procedural "Badlands"-style tileset. Chunk-cached.
// ============================================================================
// ---------------------------------------------------------------------------
// Tilesets. Everything that makes a biome look like itself is a colour, so a
// set is just a palette: the two ground materials, the ramp, the rock faces
// and the doodads. Adding another means adding an entry here, nothing else.
// ---------------------------------------------------------------------------
const TILESETS = {
  badlands: {
    name: 'Badlands',
    low: (n, c) => { let r = 112 + n * 46, g = 90 + n * 38, b = 58 + n * 24; const crack = c > 0.9 ? (c - 0.9) * 6 : 0; return [r - crack * 45, g - crack * 38, b - crack * 26]; },
    high: (n, c) => { let r = 138 + n * 40, g = 122 + n * 34, b = 96 + n * 26; const plate = c > 0.93 ? (c - 0.93) * 8 : 0; return [r - plate * 40, g - plate * 36, b - plate * 30]; },
    ramp: n => [128 + n * 30, 114 + n * 26, 86 + n * 20],
    rock: k => [70 * k + 20, 66 * k + 18, 60 * k + 16],
    slope: k => [96 * k + 22, 80 * k + 18, 60 * k + 14],
    face: ['rgba(150,120,90,0.55)', 'rgba(90,66,48,0.35)', 'rgba(30,20,14,0.75)'],
    crack: 'rgba(20,12,8,0.5)', rim: 'rgba(255,240,210,0.28)',
    rubbleShade: 'rgba(40,28,20,0.6)', rubble: k => 'rgb(' + (110 + k * 12) + ',' + (92 + k * 10) + ',' + (70 + k * 8) + ')',
    boulder: ['#8a8478', '#3b352e'], pebble: '#9a8a72',
    flora: 'rgba(90,110,50,0.75)',
    crater: ['rgba(40,28,18,0.55)', 'rgba(60,44,30,0.35)', 'rgba(200,170,130,0.25)'],
  },
  jungle: {
    name: 'Jungle',
    // wet moss over dark loam, and a lighter grassy plateau above it
    // dark wet loam below, drier olive scrub on the plateau; the gap between the two is what reads as
    // height, so it is deliberately wider than the colours are saturated
    low: (n, c) => { let r = 46 + n * 24, g = 62 + n * 30, b = 38 + n * 16; const wet = c > 0.9 ? (c - 0.9) * 6 : 0; return [r - wet * 20, g - wet * 26, b - wet * 14]; },
    high: (n, c) => { let r = 112 + n * 36, g = 126 + n * 38, b = 74 + n * 22; const plate = c > 0.93 ? (c - 0.93) * 8 : 0; return [r - plate * 34, g - plate * 38, b - plate * 24]; },
    ramp: n => [86 + n * 26, 96 + n * 28, 58 + n * 18],
    rock: k => [46 * k + 16, 54 * k + 20, 40 * k + 14],
    slope: k => [70 * k + 18, 88 * k + 22, 52 * k + 12],
    face: ['rgba(96,124,74,0.55)', 'rgba(52,72,44,0.4)', 'rgba(14,24,14,0.78)'],
    crack: 'rgba(10,18,10,0.5)', rim: 'rgba(210,240,190,0.3)',
    rubbleShade: 'rgba(18,30,18,0.6)', rubble: k => 'rgb(' + (74 + k * 10) + ',' + (96 + k * 12) + ',' + (58 + k * 8) + ')',
    boulder: ['#6f7d5e', '#252e22'], pebble: '#7b8a68',
    flora: 'rgba(120,190,70,0.85)',
    crater: ['rgba(18,30,16,0.55)', 'rgba(34,52,30,0.4)', 'rgba(170,210,140,0.28)'],
  },
  ice: {
    name: 'Ice',
    // Shadowed blue ice below, wind-packed snow above. Snow is nearly white, so the low ground has to
    // carry all the colour: the gap between the two is in value, not saturation, or the whole map reads
    // as one flat sheet with the cliffs invisible.
    low: (n, c) => { let r = 84 + n * 34, g = 110 + n * 38, b = 140 + n * 40; const crev = c > 0.9 ? (c - 0.9) * 6 : 0; return [r - crev * 46, g - crev * 40, b - crev * 26]; },
    high: (n, c) => { let r = 188 + n * 42, g = 202 + n * 40, b = 218 + n * 34; const drift = c > 0.93 ? (c - 0.93) * 8 : 0; return [r - drift * 30, g - drift * 26, b - drift * 16]; },
    ramp: n => [156 + n * 34, 172 + n * 32, 194 + n * 30],
    rock: k => [52 * k + 30, 66 * k + 40, 86 * k + 56],
    slope: k => [110 * k + 40, 130 * k + 52, 156 * k + 70],
    face: ['rgba(206,228,246,0.6)', 'rgba(96,132,170,0.4)', 'rgba(14,26,44,0.78)'],
    crack: 'rgba(18,40,70,0.5)', rim: 'rgba(255,255,255,0.4)',
    rubbleShade: 'rgba(24,44,72,0.55)', rubble: k => 'rgb(' + (150 + k * 14) + ',' + (176 + k * 14) + ',' + (202 + k * 12) + ')',
    boulder: ['#cfe4f2', '#3a5170'], pebble: '#b6cadb',
    flora: 'rgba(70,110,90,0.7)',
    crater: ['rgba(28,50,78,0.5)', 'rgba(60,92,126,0.35)', 'rgba(240,250,255,0.3)'],
  },
  desert: {
    name: 'Desert',
    // The hard part is not looking like Badlands, which is already tan. Badlands is a brown lowland
    // with a slightly lighter plateau; Desert inverts the relationship -- a dark rusted canyon floor
    // under bleached sand mesas -- so the two read apart at a glance even though both are warm. The
    // value gap (146 -> 214 in red) is doing the work; the hue only says which desert it is.
    low: (n, c) => { let r = 146 + n * 40, g = 96 + n * 32, b = 58 + n * 22; const dry = c > 0.9 ? (c - 0.9) * 6 : 0; return [r - dry * 40, g - dry * 30, b - dry * 20]; },
    high: (n, c) => { let r = 214 + n * 34, g = 190 + n * 32, b = 142 + n * 26; const ripple = c > 0.93 ? (c - 0.93) * 8 : 0; return [r - ripple * 26, g - ripple * 28, b - ripple * 30]; },
    ramp: n => [186 + n * 32, 156 + n * 30, 110 + n * 24],
    rock: k => [92 * k + 30, 60 * k + 20, 38 * k + 14],
    slope: k => [128 * k + 32, 96 * k + 22, 62 * k + 16],
    face: ['rgba(226,190,140,0.55)', 'rgba(128,84,50,0.4)', 'rgba(38,20,10,0.76)'],
    crack: 'rgba(48,24,10,0.5)', rim: 'rgba(255,246,214,0.32)',
    rubbleShade: 'rgba(58,32,14,0.6)', rubble: k => 'rgb(' + (176 + k * 14) + ',' + (144 + k * 12) + ',' + (100 + k * 10) + ')',
    boulder: ['#b08a5e', '#4a3020'], pebble: '#c2a074',
    flora: 'rgba(126,140,64,0.7)',   // scrub, not grass: a desert with green in it stops reading as one
    crater: ['rgba(56,30,12,0.55)', 'rgba(92,58,28,0.35)', 'rgba(240,214,168,0.28)'],
  },
  space: {
    name: 'Space Platform',
    // Unlit deck in the platform's shadow below, hull plating catching a distant sun above, so the
    // value gap is the widest of the five on purpose: on a space platform the cliff edge is the edge
    // of the world and it has to be unmissable. The low ground is a dark slate rather than the black
    // it wants to be, because it is walkable -- units fight on it, and fog darkens it again on top of
    // whatever this returns. Cracks read as panel seams rather than fractures, which is why the crack
    // colour is darker than the low ground instead of a tint of it.
    low: (n, c) => { let r = 58 + n * 26, g = 66 + n * 30, b = 84 + n * 36; const seam = c > 0.9 ? (c - 0.9) * 6 : 0; return [r - seam * 22, g - seam * 26, b - seam * 32]; },
    high: (n, c) => { let r = 128 + n * 40, g = 136 + n * 42, b = 152 + n * 46; const panel = c > 0.93 ? (c - 0.93) * 8 : 0; return [r - panel * 44, g - panel * 46, b - panel * 48]; },
    ramp: n => [104 + n * 34, 112 + n * 36, 130 + n * 40],
    rock: k => [64 * k + 26, 72 * k + 30, 88 * k + 38],
    slope: k => [86 * k + 28, 96 * k + 32, 116 * k + 42],
    face: ['rgba(168,196,224,0.6)', 'rgba(64,84,112,0.42)', 'rgba(4,6,12,0.85)'],
    crack: 'rgba(6,10,18,0.6)', rim: 'rgba(226,244,255,0.45)',
    rubbleShade: 'rgba(8,12,22,0.6)', rubble: k => 'rgb(' + (108 + k * 16) + ',' + (118 + k * 16) + ',' + (138 + k * 16) + ')',
    boulder: ['#8fa2b8', '#232c3a'], pebble: '#7e8ea2',
    flora: 'rgba(70,150,150,0.6)',   // no plants in vacuum; this slot is the only place a hull light can live
    crater: ['rgba(6,10,18,0.6)', 'rgba(40,54,74,0.35)', 'rgba(200,230,255,0.3)'],
  },
};
// Where the creep border sits and how wide its dithered fringe is, in coverage units where 1.0 is a
// tile deep inside creep and 0.5 is the tile boundary. Coverage changes by about 1.0 per tile, so
// CREEP_BAND 0.26 is a fringe a little over eight pixels wide at 32 px to the tile -- wide enough for
// the 4x4 Bayer matrix to show its whole ramp of densities, which is what reads as a dither rather
// than as a jagged line. Narrower than about 0.12 and the stipple disappears into a hard step; wider
// than about 0.4 and the dots spread far enough apart to read as noise on the terrain.
// TEXTURED GROUND -- A TEST RUN, OFF BY DEFAULT (the user, 2026-09-13: "i do not need an editor. i just want great looking maps";
// RESEARCH-TERRAIN.md). A tileset may name photographic ground textures (Poly Haven, CC0: assets/terrain/SOURCES.md). With
// Terrain.textured on (?hd=1 in the address) and the set's textures loaded, a chunk is painted from them instead of from the
// palette: low ground, high ground, ramps, cliffs and rock, blended along the height steps and lit from the upper left like
// every sprite, with the high ground's shadow thrown down its cliff. The map, the pathing and the simulation are untouched --
// this is drawing only, so no replay or network game can tell the difference.
const TERRAIN_TEX = {
  badlands: { low: 'assets/terrain/aerial_ground_rock_diff_1k.jpg', high: 'assets/terrain/dirt_aerial_03_diff_1k.jpg', ramp: 'assets/terrain/dirt_aerial_02_diff_1k.jpg', rock: 'assets/terrain/cliff_side_diff_1k.jpg' },
};
// A colour grade per material, multiplied in: the high ground warmer and lighter than the low, so which is which reads at a
// glance the way the palette tilesets make it read.
const TERRAIN_GRADE = {
  badlands: { low: [0.74, 0.72, 0.7], high: [1.2, 1.11, 0.98], ramp: [1.04, 0.98, 0.9], rock: [0.92, 0.8, 0.7] },
};
const CREEP_LO = 0.37, CREEP_BAND = 0.26;
const Terrain = {
  CH: 8, chunks: new Map(), _bakedAt: 1, seed: 1, mini: null, setId: 'badlands',
  creepChunks: new Map(), creepSig: null, creepAny: null, creepBudget: 0,
  get pal() { return TILESETS[this.setId] || TILESETS.badlands; },
  hash(x, y) { let h = (x * 374761393 + y * 668265263 + this.seed * 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; },
  vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = this.hash(xi, yi), b = this.hash(xi + 1, yi), c = this.hash(xi, yi + 1), d = this.hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; },
  fbm(x, y, o = 3) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += this.vnoise(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.1; } return s / n; },
  ridge(x, y) { return 1 - Math.abs(this.vnoise(x, y) * 2 - 1); },
  reset(seed) { this.seed = seed; this.setId = (G.map && G.map.tileset) || 'badlands'; this.chunks.clear(); this.resetCreep(); this.clearStrips(); this.clearOverview(); this.mini = null; },
  // palette
  // ---- period look ------------------------------------------------------
  // The games this is imitating rendered to a small palette and covered the seams with an ordered
  // dither, and that crunch is most of what makes them look like themselves. A smooth gradient is a
  // 2010s look no matter what colours are in it. BAYER is the classic 4x4 threshold matrix; STEP is
  // how many values a channel is allowed (255/STEP of them), and the dither is what stops the bands
  // it creates from reading as bands.
  //
  // All of this happens while a chunk is being baked into its canvas, so it costs nothing per frame.
  // STEP was 13 and the ground still read as smooth. 20 is the landing after looking at 13, 20 and 26
  // side by side on badlands, ice and desert. Two things about this knob are worth knowing before
  // turning it again. The palette ramps are narrow -- badlands high ground moves 40 units of red across
  // the whole noise range -- so STEP is not really choosing a number of bands, it is choosing how few:
  // at 20 the open ground is two tones dithered into each other, which is what a 90s tileset was. And
  // because the dither amplitude is +/- STEP/2, raising it raises the visible speckle as fast as it
  // raises the banding; at 26 the flat plateau on desert and ice reads as sensor noise rather than as
  // art, which is the failure mode to watch for. 20 crunches the material seams and the cliff bands
  // clearly and stops short of that.
  //
  // Also tried and not kept: a 2 px dither cell at STEP 20, which is the most period-looking of the
  // four and was still wrong. Brood War ran 32 px tiles at 640x480 and dithered at one pixel, and this
  // renders 32 px tiles too, so 1 px *is* Brood War's own relative scale -- 2 px is coarser than the
  // thing being imitated, and over open ground it stops reading as a dissolve and starts reading as a
  // woven fabric.
  BAYER: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5],
  STEP: 20,
  bayerAt(x, y) { return this.BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5; },
  posterise(col, x, y) {
    const t = this.bayerAt(x, y) * this.STEP;
    for (let k = 0; k < 3; k++) { let v = Math.round((col[k] + t) / this.STEP) * this.STEP; col[k] = v < 0 ? 0 : v > 255 ? 255 : v; }
    return col;
  },
  lowCol(n, c) { return this.pal.low(n, c); },   // n noise 0..1, c crack 0..1
  highCol(n, c) { return this.pal.high(n, c); },
  rampCol(n) { return this.pal.ramp(n); },
  // ---- cliffs and ramps, in the same idiom -------------------------------
  // The ground got posterised and dithered and the two things standing on it did not: a cliff face was
  // a three-stop linear gradient with a hard black bar under it, and a ramp was four flat translucent
  // stripes. Both are the smooth 2010s look the rest of this file spent its effort getting rid of, and
  // a cliff edge is the highest-contrast thing on the map, so it is where the eye goes first.
  //
  // Both are now baked once per tileset into a strip and blitted per tile, which is what makes it
  // affordable to compute them a pixel at a time: a cliff face is identical on every cliff tile, so
  // there is no reason to pay for it more than once. Strip pixel (0,0) always lands on a tile corner
  // and tiles are 32 px, so the strip's Bayer phase is the world's Bayer phase and the dither lines up
  // with the ground's.
  rgba(s) { const p = String(s).replace(/[^0-9.,]/g, '').split(','); return [+p[0], +p[1], +p[2], p.length > 3 ? +p[3] : 1]; },
  clearStrips() { this._face = this._ramp = null; },
  // The rock face: the same three stops, but quantised to six values with an ordered dither across each
  // boundary, so it reads as a cut face with bedding planes instead of an airbrushed ramp. The shadow it
  // throws on the ground below is part of the same strip and dissolves downward rather than stopping,
  // which is the single most characteristic thing about a Brood War cliff.
  FACE_SH: 12,
  faceStrip() {
    if (this._face && this._faceSet === this.setId) return this._face;
    const SH = this.FACE_SH, W = TILE, H = TILE + SH, NB = 6;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const img = x.createImageData(W, H), d = img.data;
    const f0 = this.rgba(this.pal.face[0]), f1 = this.rgba(this.pal.face[1]), f2 = this.rgba(this.pal.face[2]);
    const at = t => { const a = t < 0.35 ? f0 : f1, b = t < 0.35 ? f1 : f2, k = t < 0.35 ? t / 0.35 : (t - 0.35) / 0.65; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k]; };
    for (let y = 0; y < H; y++) for (let px = 0; px < W; px++) {
      const o = (y * W + px) * 4;
      if (y < TILE) {
        const bf = (y / TILE) * NB, band = Math.floor(bf), frac = bf - band;
        const c = at(Math.min(NB, frac > this.bayerAt(px, y) + 0.5 ? band + 1 : band) / NB);
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3] * 255;
      } else {
        const sy = y - TILE, k = 1 - Math.max(0, sy - 3) / (SH - 3);
        if (k > this.bayerAt(px, y) + 0.5) { d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = 132; }
      }
    }
    x.putImageData(img, 0, 0);
    this._faceSet = this.setId; return this._face = cv;
  },
  // The ramp. Two things were wrong with it beyond the smoothness. It drew four treads in every tile,
  // so a five-tile ramp had twenty of them, and it drew a dark bar down both sides of every tile, so a
  // four-tile-wide ramp had eight walls. Between them those made every ramp in the game read as a
  // ladder. It is two treads a tile now, and a side wall is only drawn where the neighbouring tile is
  // not also ramp -- which is what makes it a cut through the cliff with two walls instead of a grid.
  // The tread boundaries dissolve into each other and each lip drops a stippled shadow on the step
  // below, which is what says "steps" rather than "stripes".
  RAMP_TREADS: 2,
  rampStrip(vertical, w0, w1) {
    if (!this._ramp || this._rampSet !== this.setId) { this._ramp = {}; this._rampSet = this.setId; }
    const key = (vertical ? 'v' : 'h') + (w0 ? 1 : 0) + (w1 ? 1 : 0);
    if (this._ramp[key]) return this._ramp[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = TILE; const x = cv.getContext('2d');
    const img = x.createImageData(TILE, TILE), d = img.data, SP = TILE / this.RAMP_TREADS;
    for (let y = 0; y < TILE; y++) for (let px = 0; px < TILE; px++) {
      const along = vertical ? y : px, across = vertical ? px : y;
      const s = along / SP, k = Math.floor(s), frac = s - k;
      const th = this.bayerAt(px, y) + 0.5;
      let tone = k & 1;
      if (frac < 0.25 && !(frac / 0.25 > th)) tone ^= 1;                       // dithered tread boundary
      let r = tone ? 0 : 255, a = tone ? 0.13 : 0.08;
      if (frac < 0.19 && 1 - frac / 0.19 > th) { r = 0; a = 0.34; }            // the lip's own shadow
      const edge = (w0 && across < 3) ? 1 - across / 3 : (w1 && across >= TILE - 3) ? 1 - (TILE - 1 - across) / 3 : 0;
      if (edge > 0 && edge > th * 0.6) { r = 0; a = 0.3; }                     // the ramp's cut sides
      const o = (y * TILE + px) * 4; d[o] = d[o + 1] = d[o + 2] = r; d[o + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
    return this._ramp[key] = cv;
  },
  checkDpr() { const k = this.bakeDpr(); if (k !== this._bakedAt) { this.chunks.clear(); this._bakedAt = k; } },   // a ratio change invalidates every cached chunk
  // The chunk cache had no bound, and did not need one while the camera never saw more than about
  // thirty chunks: a game would cache a few hundred over an hour of scrolling and that was that.
  // Zooming out to OVER_Z puts a hundred and forty in view AT ONCE, and panning a 256-tile map at
  // that zoom would have cached all 1024 of them -- 256 MB of canvas at dpr 1 and a gigabyte at
  // dpr 2. Bounded now at a little over one full strategic viewport. A Map iterates in insertion
  // order, so re-inserting a chunk the moment it is drawn turns the eviction order into least
  // recently SEEN, which is what stops the strategic view from evicting the ground it is standing on.
  CHUNK_CAP: 160,
  trim() { const c = this.chunks; while (c.size > this.CHUNK_CAP) { const k = c.keys().next().value; if (k === undefined) break; c.delete(k); } },
  // The ratio the chunk canvases are baked at. Terrain is most of the screen and it is the one cached
  // bitmap worth baking at the display's real resolution -- the sheets are not, because re-baking those
  // is a four-fold blow-up of the files and of the tinted-sheet ceiling with them.
  //
  // The dither survives this for free, which is the only reason it is worth doing. posterise() and
  // bayerAt() are called with WORLD coordinates, not pixel indices, and bayerAt truncates them with
  // `& 3` -- so sampling at 1/k of a world unit still lands every k*k block of device pixels in one
  // Bayer cell. The threshold pattern keeps exactly the apparent size it has at ratio 1; what gets
  // finer is the noise, the material blend and the vector pass on top.
  bakeDpr() { return (typeof Render !== 'undefined' && Render.dpr) || 1; },
  // ---- textured ground (see TERRAIN_TEX) --------------------------------
  textured: typeof location !== 'undefined' && /[?&]hd=1(&|$)/.test(String(location.search || '')),
  TEX_PX: 512,   // texels in one repeat of a ground texture: sixteen tiles, which puts a metre of a 20 m aerial scan at about 25 px, a Marine's width
  _tex: {},
  // The set's textures, each drawn once into a TEX_PX canvas and kept as pixels; null until every one has loaded (the palette
  // paints until then), and the chunk cache is dropped as each arrives so the ground bakes again with it.
  texSet() {
    const spec = this.textured && TERRAIN_TEX[this.setId];
    if (!spec || typeof Image === 'undefined' || typeof document === 'undefined') return null;
    const S = this.TEX_PX, out = {}; let ready = true;
    for (const part of Object.keys(spec)) {
      const url = spec[part]; let e = this._tex[url];
      if (!e) { e = this._tex[url] = { img: new Image(), ok: false, data: null }; e.img.onload = () => { e.ok = true; this.chunks.clear(); }; e.img.src = url; }
      if (!e.ok) { ready = false; continue; }
      if (!e.data) { const cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(e.img, 0, 0, S, S); e.data = x.getImageData(0, 0, S, S).data; }
      out[part] = e.data;
    }
    return ready ? out : null;
  },
  // A textured chunk. Baked at ratio 1 whatever the display: a photograph survives the upscale where the dither did not, and
  // this bake is several times the palette's per pixel.
  renderChunkTex(cx, cy, T) {
    const m = G.map, CH = this.CH, W = CH * TILE, S = this.TEX_PX, grade = TERRAIN_GRADE[this.setId] || {};
    const cv = document.createElement('canvas'); cv.width = W; cv.height = W; const x = cv.getContext('2d');
    const img = x.createImageData(W, W), d = img.data, ox = cx * CH * TILE, oy = cy * CH * TILE;
    // How HIGH each tile centre is -- low 0, a ramp or a cliff tile halfway, high 1 -- with where the rock zones and the ramps
    // are, softened by a 3x3 blur so a diagonal cliff is a slope and not a staircase of tile corners (the first pass traced
    // the grid exactly). It is read LINEARLY between centres and then pushed through a steep curve, so a cliff is one drop
    // about two thirds of a tile wide at the cliff tile -- the smoothstep of the second pass made two small steps with a
    // shelf between them, which read as a trench -- while a ramp keeps the linear value and climbs evenly from end to end.
    const M = 3, GW = CH + 2 * M + 1, raw = new Float32Array(GW * GW), rz = new Float32Array(GW * GW), rpz = new Float32Array(GW * GW), t0x = cx * CH - M, t0y = cy * CH - M;
    for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) {
      const tx = t0x + i, ty = t0y + j, o = j * GW + i;
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) { raw[o] = 1.25; rz[o] = 1; continue; }
      const q = ty * m.w + tx, cl = m.cliff[q], h = m.height[q];
      raw[o] = cl === 2 ? 1 : cl === 1 ? 0.5 : h === 2 ? 1 : h === 1 ? 0.5 : 0; rz[o] = cl === 2 ? 1 : 0; rpz[o] = !cl && h === 1 ? 1 : 0;
    }
    const blur = src => { const out = new Float32Array(GW * GW); for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) { let s = 0, wsum = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= GW || jj >= GW) continue; const w = (a ? 1 : 2) * (b ? 1 : 2); s += src[jj * GW + ii] * w; wsum += w; } out[j * GW + i] = s / wsum; } return out; };
    const gh = blur(raw), gr = blur(rz), gp = rpz;   // the ramp mask stays sharp: a ramp is a passage and has to read as one
    const sm = t => t * t * (3 - 2 * t), PAD = 24, PW = W + 2 * PAD;
    const hf = new Float32Array(PW * PW), rk = new Float32Array(PW * PW), rp = new Float32Array(PW * PW);
    for (let py = 0; py < PW; py++) for (let pxx = 0; pxx < PW; pxx++) {
      const wx = ox + pxx - PAD, wy = oy + py - PAD;
      // a gentle warp of where the grid is read, so an edge wanders by up to a third of a tile instead of running dead straight
      const qx = wx + (this.vnoise(wx / 37, wy / 37) - 0.5) * 22, qy = wy + (this.vnoise(wx / 37 + 17, wy / 37 + 29) - 0.5) * 22;
      const fx = qx / TILE - 0.5 - t0x, fy = qy / TILE - 0.5 - t0y;
      let i0 = Math.floor(fx), u = fx - i0, j0 = Math.floor(fy), v = fy - j0;
      if (i0 < 0) { i0 = 0; u = 0; } else if (i0 > GW - 2) { i0 = GW - 2; u = 1; } if (j0 < 0) { j0 = 0; v = 0; } else if (j0 > GW - 2) { j0 = GW - 2; v = 1; }
      const a = j0 * GW + i0, b = a + 1, c = a + GW, e = c + 1, o = py * PW + pxx;
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
      const rock = gr[a] * w00 + gr[b] * w10 + gr[c] * w01 + gr[e] * w11, lin = gh[a] * w00 + gh[b] * w10 + gh[c] * w01 + gh[e] * w11;
      rk[o] = rock;
      // the ramp mask without the warp or the smoothstep, so its sides are where the passage really is
      const gx2 = wx / TILE - 0.5 - t0x, gy2 = wy / TILE - 0.5 - t0y; let i1 = Math.floor(gx2), u1 = gx2 - i1, j1 = Math.floor(gy2), v1 = gy2 - j1;
      if (i1 < 0) { i1 = 0; u1 = 0; } else if (i1 > GW - 2) { i1 = GW - 2; u1 = 1; } if (j1 < 0) { j1 = 0; v1 = 0; } else if (j1 > GW - 2) { j1 = GW - 2; v1 = 1; }
      const a1 = j1 * GW + i1; rp[o] = gp[a1] * (1 - u1) * (1 - v1) + gp[a1 + 1] * u1 * (1 - v1) + gp[a1 + GW] * (1 - u1) * v1 + gp[a1 + GW + 1] * u1 * v1;
      const kRamp = sm(Math.min(1, rp[o] * 1.5)), cliffH = sm(Math.min(1, Math.max(0, (lin - 0.5) / 0.36 + 0.5)));
      // rock zones stand a little above the high ground and are lumpy, so the light finds boulders and hollows in them
      hf[o] = cliffH * (1 - kRamp) + lin * kRamp + (rock > 0.05 ? (0.22 + (this.fbm(wx / 26, wy / 26, 2) - 0.5) * 0.6) * rock : 0);
    }
    const Ln = Math.hypot(0.5, 0.6, 0.62), lx = -0.5 / Ln, ly = -0.6 / Ln, lz = 0.62 / Ln, RISE = 22, BUMP = 4;   // the sun: upper left and above; RISE world px of height per unit
    const A = [0, 0, 0], B = [0, 0, 0], col = [0, 0, 0], tmp = [0, 0, 0], one = [1, 1, 1];
    const tex = (t, u, v, o) => { const p = ((((v | 0) % S) + S) % S * S + ((((u | 0) % S) + S) % S)) * 4; o[0] = t[p]; o[1] = t[p + 1]; o[2] = t[p + 2]; };
    // A material is two samples of its texture -- the second transposed and rescaled -- mixed by broad noise, so the
    // sixteen-tile repeat does not line up into a visible grid across a map.
    const mat = (t, g, wx, wy, q, o) => { tex(t, wx, wy, A); tex(t, wy * 0.83 + 331, wx * 0.83 + 173, B); o[0] = (A[0] + (B[0] - A[0]) * q) * g[0]; o[1] = (A[1] + (B[1] - A[1]) * q) * g[1]; o[2] = (A[2] + (B[2] - A[2]) * q) * g[2]; };
    const gLow = grade.low || one, gHigh = grade.high || one, gRamp = grade.ramp || one, gRock = grade.rock || one;
    for (let py = 0; py < W; py++) for (let pxx = 0; pxx < W; pxx++) {
      const wx = ox + pxx, wy = oy + py, o = (py + PAD) * PW + pxx + PAD, h = hf[o];
      const q = sm(Math.min(1, Math.max(0, (this.vnoise(wx / 230, wy / 230) - 0.3) / 0.4)));
      const dxh = (hf[o + 1] - hf[o - 1]) / 2, dyh = (hf[o + PW] - hf[o - PW]) / 2, steep = Math.sqrt(dxh * dxh + dyh * dyh);
      // low ground under high, the seam pushed about by noise; the high ground carries some of the low ground's grit, so it is
      // the same country raised up rather than a different floor
      const tH = sm(Math.min(1, Math.max(0, (h + (this.vnoise(wx / 19, wy / 19) - 0.5) * 0.3 - 0.3) / 0.35)));
      mat(T.low, gLow, wx, wy, q, col);
      if (tH > 0) {
        mat(T.high, gHigh, wx, wy, q, tmp); const gl = 0.38;
        const hr = tmp[0] * (1 - gl) + col[0] * gl * 1.3, hg = tmp[1] * (1 - gl) + col[1] * gl * 1.3, hb = tmp[2] * (1 - gl) + col[2] * gl * 1.3;
        col[0] += (hr - col[0]) * tH; col[1] += (hg - col[1]) * tH; col[2] += (hb - col[2]) * tH;
      }
      const pr = rp[o]; if (pr > 0.02) { mat(T.ramp, gRamp, wx, wy, q, tmp); const kp = sm(Math.min(1, pr * 1.3)) * 0.5; col[0] += (tmp[0] - col[0]) * kp; col[1] += (tmp[1] - col[1]) * kp; col[2] += (tmp[2] - col[2]) * kp; }   // half strength: worn tracks on the ground, not a new floor
      // rock where the ground is steep -- the cliff's own face, not the whole tile around it -- and in the rock zones
      const kr = Math.max(sm(Math.min(1, Math.max(0, (steep - 0.016) / 0.02))) * (pr > 0.35 ? 0 : 1), sm(Math.min(1, rk[o] * 1.3)));
      let bx = 0, by = 0;
      if (kr > 0.02) {   // the canyon texture, its strata squeezed flat, and its own brightness read as relief
        const ry = wy * 1.35;
        tex(T.rock, wx, ry, tmp);
        tex(T.rock, wx + 1, ry, A); tex(T.rock, wx - 1, ry, B); bx = (A[0] + A[1] - B[0] - B[1]) / 510 * kr;
        tex(T.rock, wx, ry + 1, A); tex(T.rock, wx, ry - 1, B); by = (A[0] + A[1] - B[0] - B[1]) / 510 * kr;
        col[0] += (tmp[0] * gRock[0] - col[0]) * kr; col[1] += (tmp[1] * gRock[1] - col[1]) * kr; col[2] += (tmp[2] * gRock[2] - col[2]) * kr;
      }
      // the light: the height field's slope plus the rock's relief against the sun, so flat ground is exactly 1
      const sx = dxh * RISE + bx * BUMP, sy = dyh * RISE + by * BUMP;
      let shade = (-sx * lx - sy * ly + lz) / Math.sqrt(sx * sx + sy * sy + 1) / lz; shade = shade < 0.5 ? 0.5 : shade > 1.35 ? 1.35 : shade;
      const up = hf[o - 11 * PW - 9] - h; if (up > 0.08) shade *= 1 - Math.min(0.32, (up - 0.08) * 0.7);   // the shadow of higher ground towards the sun
      shade *= 0.94 + (this.vnoise(wx / 150 + 40, wy / 150 + 40) - 0.5) * 0.18;   // broad light and dark patches, as clouds or wear
      const oo = (py * W + pxx) * 4, r = col[0] * shade, g = col[1] * shade, b = col[2] * shade;
      d[oo] = r > 255 ? 255 : r; d[oo + 1] = g > 255 ? 255 : g; d[oo + 2] = b > 255 ? 255 : b; d[oo + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return cv;
  },
  renderChunk(cx, cy) {
    const T = this.texSet(); if (T) return this.renderChunkTex(cx, cy, T);   // textured ground, when it is on and loaded
    const m = G.map, CH = this.CH, px = CH * TILE, k = this.bakeDpr(), W = px * k;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = W; const x = cv.getContext('2d');
    const img = x.createImageData(W, W); const d = img.data; const ox = cx * CH * TILE, oy = cy * CH * TILE;
    const hAt = (tx, ty) => { if (!m.inb(tx, ty)) return 1; const i = m.idx(tx, ty); if (m.cliff[i] === 2) return -1; if (m.cliff[i] === 1) return 1; return m.height[i] === 2 ? 1 : m.height[i] === 1 ? 0.5 : 0; };
    for (let py = 0; py < W; py++) for (let pxx = 0; pxx < W; pxx++) {
      const wx = ox + pxx / k, wy = oy + py / k; const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
      const i = m.inb(tx, ty) ? m.idx(tx, ty) : -1; const cl = i >= 0 ? m.cliff[i] : 2;
      const n = this.fbm(wx / 40, wy / 40, 3) * 0.7 + this.vnoise(wx / 7, wy / 7) * 0.3, n2 = this.vnoise(wx / 9, wy / 9), cr = this.ridge(wx / 44, wy / 44);
      let col;
      if (cl === 2) { col = this.pal.rock(0.45 + n * 0.35); }
      else if (cl === 1) { const s = this.vnoise(wx / 6, wy / 20); col = this.pal.slope(0.5 + n * 0.3 + (s > 0.6 ? 0.15 : 0)); }
      else {
        // bilinear blend of neighbouring tile heights for smooth material transitions
        const fx = (wx - TILE / 2) / TILE, fy = (wy - TILE / 2) / TILE; const x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
        const h00 = hAt(x0, y0), h10 = hAt(x0 + 1, y0), h01 = hAt(x0, y0 + 1), h11 = hAt(x0 + 1, y0 + 1);
        const fix = h => h < 0 ? 0 : h; let w = fix(h00) * (1 - u) * (1 - v) + fix(h10) * u * (1 - v) + fix(h01) * (1 - u) * v + fix(h11) * u * v;
        w += (n2 - 0.5) * 0.35; w = w < 0 ? 0 : w > 1 ? 1 : w;
        const lo = this.lowCol(n, cr), hi = this.highCol(n, cr);
        // Dithered transition rather than a blend. Between the two materials the pixel picks one or
        // the other against the Bayer threshold instead of averaging them, which is how a 90s tileset
        // joined two ground types -- an interlocking speckle, not an airbrushed ramp. Outside that
        // band it is still a straight blend, so open ground stays smooth and only the seam speckles.
        const edge = w > 0.28 && w < 0.72;
        if (edge) { const pick = (w - 0.28) / 0.44 > this.bayerAt(wx, wy) + 0.5 ? hi : lo; col = [pick[0], pick[1], pick[2]]; }
        else col = [lo[0] + (hi[0] - lo[0]) * w, lo[1] + (hi[1] - lo[1]) * w, lo[2] + (hi[2] - lo[2]) * w];
        if (i >= 0 && m.height[i] === 1) { const rc = this.rampCol(n); col = [(col[0] + rc[0]) / 2, (col[1] + rc[1]) / 2, (col[2] + rc[2]) / 2]; }
        // grain
        const g = (this.hash(wx, wy) - 0.5) * 14; col[0] += g; col[1] += g; col[2] += g;
      }
      this.posterise(col, wx, wy);
      const o = (py * W + pxx) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.setTransform(k, 0, 0, k, 0, 0);   // the vector pass below is written in chunk pixels; let it draw at the bake ratio
    // ---- vector pass: cliff faces, rims, shadows, ramps, doodads ----
    const t0x = cx * CH, t0y = cy * CH;
    for (let ty = t0y - 1; ty < t0y + CH + 1; ty++) for (let tx = t0x - 1; tx < t0x + CH + 1; tx++) {
      if (!m.inb(tx, ty)) continue; const i = m.idx(tx, ty); const lx = tx * TILE - ox, ly = ty * TILE - oy;
      const cl = m.cliff[i], h = m.height[i];
      if (cl === 1) {
        const southLow = m.inb(tx, ty + 1) && m.cliff[m.idx(tx, ty + 1)] === 0 && m.height[m.idx(tx, ty + 1)] !== 2;
        const northHigh = m.inb(tx, ty - 1) && m.cliff[m.idx(tx, ty - 1)] === 0 && m.height[m.idx(tx, ty - 1)] === 2;
        if (southLow) { // visible rock face: the banded strip, plus this tile's own cracks over it
          x.drawImage(this.faceStrip(), lx, ly);
          x.strokeStyle = this.pal.crack; x.lineWidth = 1; for (let k = 0; k < 4; k++) { const sx = lx + 4 + this.hash(tx * 7 + k, ty) * 24; x.beginPath(); x.moveTo(sx, ly + 6); x.lineTo(sx + (this.hash(tx, ty * 3 + k) - .5) * 8, ly + TILE); x.stroke(); }
        } else { // rubble edge
          for (let k = 0; k < 3; k++) { const bx = lx + 6 + this.hash(tx * 3 + k, ty * 5) * 20, by = ly + 6 + this.hash(tx * 5, ty * 3 + k) * 20, br = 4 + this.hash(tx + k, ty - k) * 6; x.fillStyle = this.pal.rubbleShade; x.beginPath(); x.ellipse(bx + 1.5, by + 1.5, br, br * .7, 0, 0, 7); x.fill(); x.fillStyle = this.pal.rubble(k); x.beginPath(); x.ellipse(bx, by, br, br * .7, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(255,240,220,0.25)'; x.beginPath(); x.ellipse(bx - br * .3, by - br * .3, br * .4, br * .25, 0, 0, 7); x.fill(); }
        }
        if (northHigh) { x.fillStyle = this.pal.rim; x.fillRect(lx, ly, TILE, 3); }
      } else if (cl === 2) { // boulders
        const nb = 2 + Math.floor(this.hash(tx, ty) * 3);
        for (let k = 0; k < nb; k++) { const bx = lx + 4 + this.hash(tx * 11 + k, ty) * 24, by = ly + 4 + this.hash(tx, ty * 11 + k) * 24, br = 6 + this.hash(tx * 3 + k, ty * 7) * 9; x.fillStyle = 'rgba(0,0,0,0.45)'; x.beginPath(); x.ellipse(bx + 3, by + 3, br, br * .75, 0, 0, 7); x.fill(); const g = x.createRadialGradient(bx - br * .4, by - br * .4, 1, bx, by, br); g.addColorStop(0, this.pal.boulder[0]); g.addColorStop(1, this.pal.boulder[1]); x.fillStyle = g; x.beginPath(); x.ellipse(bx, by, br, br * .75, 0, 0, 7); x.fill(); }
      } else if (h === 1) { // ramp shading: steps
        const up = m.inb(tx, ty - 1) && m.height[m.idx(tx, ty - 1)] === 2, dn = m.inb(tx, ty + 1) && m.height[m.idx(tx, ty + 1)] === 2, lf = m.inb(tx - 1, ty) && m.height[m.idx(tx - 1, ty)] === 2 && !m.cliff[m.idx(tx - 1, ty)], rt = m.inb(tx + 1, ty) && m.height[m.idx(tx + 1, ty)] === 2 && !m.cliff[m.idx(tx + 1, ty)];
        const vertical = !(lf || rt) || up || dn;
        const ramp = (ax, ay) => m.inb(ax, ay) && m.height[m.idx(ax, ay)] === 1;
        const w0 = vertical ? !ramp(tx - 1, ty) : !ramp(tx, ty - 1), w1 = vertical ? !ramp(tx + 1, ty) : !ramp(tx, ty + 1);
        x.drawImage(this.rampStrip(vertical, w0, w1), lx, ly);
      } else if (h === 0 && m.walk[i]) { // low ground doodads
        const r = this.hash(tx * 13, ty * 17);
        if (r < 0.025) { const cxp = lx + 16, cyp = ly + 16, cr = 8 + r * 200; x.strokeStyle = this.pal.crater[0]; x.lineWidth = 3; x.beginPath(); x.ellipse(cxp, cyp, cr, cr * .7, 0, 0, 7); x.stroke(); x.fillStyle = this.pal.crater[1]; x.beginPath(); x.ellipse(cxp, cyp, cr - 2, cr * .7 - 2, 0, 0, 7); x.fill(); x.strokeStyle = this.pal.crater[2]; x.lineWidth = 1.5; x.beginPath(); x.ellipse(cxp, cyp - 1, cr, cr * .7, 0, Math.PI, Math.PI * 2); x.stroke(); }
        else if (r < 0.07) { x.strokeStyle = this.pal.flora; x.lineWidth = 1.5; const gx = lx + 8 + this.hash(tx, ty + 99) * 16, gy = ly + 10 + this.hash(tx + 99, ty) * 16; for (let k = 0; k < 6; k++) { x.beginPath(); x.moveTo(gx, gy + 6); x.lineTo(gx + (k - 2.5) * 2.4, gy - 4 - this.hash(k, tx + ty) * 6); x.stroke(); } }
        else if (r < 0.10) { for (let k = 0; k < 3; k++) { const bx = lx + 6 + this.hash(tx + k, ty * 2) * 20, by = ly + 6 + this.hash(tx * 2, ty + k) * 20, br = 2 + this.hash(tx * k + 1, ty) * 3; x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(bx + 1, by + 1, br, br * .7, 0, 0, 7); x.fill(); x.fillStyle = this.pal.pebble; x.beginPath(); x.ellipse(bx, by, br, br * .7, 0, 0, 7); x.fill(); } }
        // Four more low-ground doodads. Open ground was three kinds of thing spread over 7.5% of
        // tiles, so most of a map was bare noise; these take it to about 15% and, more to the point,
        // give the eye something with a straight edge on it. Every one of them is drawn from `hash`,
        // which is a pure function of the tile, so a chunk redrawn after a resize is identical.
        else if (r < 0.115) { // dry stream bed: a few linked scours
          x.strokeStyle = this.pal.crack; x.lineWidth = 2.5; x.lineCap = 'round'; x.beginPath();
          let sx = lx + 2, sy = ly + 6 + this.hash(tx, ty * 3) * 20; x.moveTo(sx, sy);
          for (let k = 1; k <= 3; k++) x.lineTo(lx + k * 10, sy + (this.hash(tx + k, ty) - 0.5) * 14);
          x.stroke(); x.strokeStyle = this.pal.rim; x.lineWidth = 1; x.stroke();
        }
        else if (r < 0.128) { // bleached bones / debris: three short pale strokes
          const bx = lx + 8 + this.hash(tx * 3, ty) * 14, by = ly + 10 + this.hash(tx, ty * 5) * 14;
          x.strokeStyle = 'rgba(226,220,198,0.5)'; x.lineWidth = 2; x.lineCap = 'round';
          for (let k = 0; k < 3; k++) { const a = this.hash(tx + k * 5, ty + k) * 3.14; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(a) * 9, by + Math.sin(a) * 6); x.stroke(); }
        }
        else if (r < 0.142) { // a single larger boulder with a lit cap, to break the pebble rhythm
          const bx = lx + 10 + this.hash(tx * 2, ty * 3) * 12, by = ly + 12 + this.hash(tx * 3, ty * 2) * 10, br = 5 + this.hash(tx, ty) * 4;
          x.fillStyle = this.pal.rubbleShade; x.beginPath(); x.ellipse(bx + 2, by + 2, br, br * .72, 0, 0, 7); x.fill();
          x.fillStyle = this.pal.boulder[1]; x.beginPath(); x.ellipse(bx, by, br, br * .72, 0, 0, 7); x.fill();
          x.fillStyle = this.pal.boulder[0]; x.beginPath(); x.ellipse(bx - br * .2, by - br * .3, br * .62, br * .42, 0, 0, 7); x.fill();
        }
        else if (r < 0.155) { // scorch/vent stain, a soft dark patch that is not a crater
          const bx = lx + 16, by = ly + 16, br = 8 + this.hash(tx * 5, ty * 5) * 7;
          const g = x.createRadialGradient(bx, by, 1, bx, by, br); g.addColorStop(0, this.pal.crack); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.beginPath(); x.ellipse(bx, by, br, br * .7, 0, 0, 7); x.fill();
        }
      } else if (h === 2 && !cl && m.walk[i]) { // plateau plate seams
        const r = this.hash(tx * 7, ty * 19); if (r < 0.06) { x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1; x.beginPath(); x.moveTo(lx + 2, ly + 30); x.lineTo(lx + 14, ly + 12); x.lineTo(lx + 30, ly + 6); x.stroke(); x.strokeStyle = 'rgba(255,255,255,0.08)'; x.beginPath(); x.moveTo(lx + 3, ly + 31); x.lineTo(lx + 15, ly + 13); x.lineTo(lx + 31, ly + 7); x.stroke(); }
      }
    }
    return cv;
  },
  // ---- zoom: why the chunks are blitted scaled rather than re-baked -------
  // Strategic zoom asks one question of this file: what happens to a cache that was baked at a fixed
  // world scale when the world stops being drawn at that scale. Both answers were priced and the blit
  // wins by a distance.
  //
  // RE-BAKING PER ZOOM LEVEL is what a first instinct reaches for, and it is unaffordable three
  // separate ways. renderChunk is a per-pixel loop with fbm, ridge and vnoise inside it over 256x256
  // pixels -- the creep work measured the same shape of loop at 27 ms a chunk -- and zooming out to
  // 0.25 puts about four hundred chunks in the viewport where zoom 1 puts thirty. That is ten seconds
  // of bake for one frame. It is 100 MB of canvas per zoom level at dpr 1, and continuous zoom is not
  // a level: a wheel produces a new scale every notch, so the cache would be thrashed rather than
  // filled. And it buys nothing anyway, because what re-baking would preserve is the 1 px ordered
  // dither, which at zoom 0.25 is a quarter-pixel feature the display cannot show at any bake scale.
  //
  // SO: BLIT SCALED, and below OVER_Z stop blitting chunks at all. At that point a chunk's whole 8x8
  // tiles land in under 100 screen pixels, every piece of detail in it is gone, and what the player is
  // reading is the SHAPE of the map -- where the cliffs are, where the high ground is. That is a
  // different picture, and it is one flat colour per tile: `overview()` bakes it once for the whole
  // map at OVER_PX pixels a tile, and the strategic view is one blit of it.
  //
  // Between OVER_Z and 1 the chunks are still right but the view holds several times as many of them,
  // so the bakes are budgeted and the overview is drawn UNDER them to fill whatever is not ready yet.
  // The alternative is a stall of exactly the length of however many chunks the camera jumped over.
  // At zoom 1 none of this runs: the branch is skipped, the rounding is unchanged, and the pass is
  // byte for byte what it was.
  OVER_Z: 0.45, OVER_PX: 4, CHUNK_BUDGET: 3,
  clearOverview() { this._over = null; },
  // The whole map at OVER_PX pixels a tile. Painted per TILE rather than per pixel -- one palette call
  // and one noise sample for a 4x4 block instead of sixteen of each -- which is what makes it a
  // one-off of a few milliseconds rather than the second and a half a per-pixel version would cost on
  // a 256x256 map. It still goes through posterise(), so the strategic view is made of the same
  // palette as the ground it is standing in for.
  overview() {
    const m = G.map, K = this.OVER_PX, W = m.w * K, H = m.h * K;
    if (this._over && this._overSet === this.setId && this._over.width === W && this._over.height === H) return this._over;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    if (!x) return this._over = cv;
    const img = x.createImageData(W, H), d = img.data, col = [0, 0, 0];
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) {
      const i = m.idx(tx, ty), cl = m.cliff[i], hh = m.height[i];
      const n = this.fbm(tx * TILE / 40, ty * TILE / 40, 2);
      const base = cl === 2 ? this.pal.rock(0.45 + n * 0.35)
        : cl === 1 ? this.pal.slope(0.5 + n * 0.3)
          : hh === 1 ? this.pal.ramp(n)
            : hh === 2 ? this.pal.high(n, 0) : this.pal.low(n, 0);
      for (let p = 0; p < K; p++) {
        const row = (ty * K + p) * W;
        for (let q = 0; q < K; q++) {
          col[0] = base[0]; col[1] = base[1]; col[2] = base[2];
          this.posterise(col, tx * K + q, ty * K + p);
          const o = (row + tx * K + q) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
        }
      }
    }
    x.putImageData(img, 0, 0);
    this._overSet = this.setId; return this._over = cv;
  },
  // Source and destination both clipped to the bitmap, because zooming out past the map fit leaves
  // void on one axis and drawImage with a source rectangle off the edge of its image draws nothing at
  // all on some engines rather than clamping.
  drawOverview(ctx, camX, camY, vw, vh) {
    const cv = this.overview(); if (!cv || !cv.width) return;
    const P = this.OVER_PX / TILE;                        // overview pixels per world pixel
    const sx0 = Math.max(0, camX * P), sy0 = Math.max(0, camY * P);
    const sx1 = Math.min(cv.width, (camX + vw) * P), sy1 = Math.min(cv.height, (camY + vh) * P);
    if (!(sx1 > sx0 && sy1 > sy0)) return;
    ctx.save(); ctx.imageSmoothingEnabled = false;        // nearest neighbour: chunky and crisp beats soft and vague
    ctx.drawImage(cv, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 / P - camX, sy0 / P - camY, (sx1 - sx0) / P, (sy1 - sy0) / P);
    ctx.restore();
  },
  draw(ctx, camX, camY, vw, vh, zoom = 1) {
    const CH = this.CH * TILE; const x0 = Math.floor(camX / CH), y0 = Math.floor(camY / CH), x1 = Math.floor((camX + vw) / CH), y1 = Math.floor((camY + vh) / CH);
    const maxCx = Math.ceil(G.map.w / this.CH), maxCy = Math.ceil(G.map.h / this.CH);   // both axes: a 64x128 editor map lost its lower chunk rows to a clamp on the width (REVIEW-M17)
    if (zoom < this.OVER_Z) { this.drawOverview(ctx, camX, camY, vw, vh); return; }
    this.checkDpr();
    // Blit on whole pixels. A chunk landed at a fractional offset goes through the bilinear filter, and
    // what that filter removes first is exactly the 1 px ordered dither the posterise pass above put in
    // -- half a pixel of camera offset undoes the period look on the whole screen. `centerOn` and a
    // minimap click both produce a fractional camera, so this is not a hypothetical. Every chunk shifts
    // by the same rounded amount, since their origins are all multiples of CH, so there are no seams.
    // Only at zoom 1: at any other zoom the blit is resampled regardless, and rounding the camera in
    // world units would make the ground jitter by up to a whole pixel per scroll step instead.
    const ox = zoom === 1 ? Math.round(camX) : camX, oy = zoom === 1 ? Math.round(camY) : camY;
    const cx0 = Math.max(0, x0), cx1 = Math.min(maxCx - 1, x1), cy0 = Math.max(0, y0), cy1 = Math.min(maxCy - 1, y1);
    let budget = Infinity;
    if (zoom < 1) {
      // Zoomed out: cap the bakes, and put the overview underneath if anything on screen is missing.
      // The Map lookups are a hundred-odd hash hits and are free next to one bake, so once the view is
      // fully cached the extra blit stops happening by itself.
      budget = this.CHUNK_BUDGET;
      let miss = false;
      for (let cy = cy0; cy <= cy1 && !miss; cy++) for (let cx = cx0; cx <= cx1; cx++) if (!this.chunks.has(cx + ',' + cy)) { miss = true; break; }
      if (miss) this.drawOverview(ctx, camX, camY, vw, vh);
    }
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = cx + ',' + cy; let c = this.chunks.get(key);
      if (!c) { if (budget <= 0) continue; budget--; c = this.renderChunk(cx, cy); }
      else this.chunks.delete(key);
      this.chunks.set(key, c);                                // to the back of the eviction order; see CHUNK_CAP
      ctx.drawImage(c, cx * CH - ox, cy * CH - oy, CH, CH);   // source is CH*dpr wide; destination stays in CSS pixels
    }
    this.trim();
  },
  // ---- creep -------------------------------------------------------------
  // Creep was the plainest thing on the screen and the reason was structural, not artistic. It was a
  // mask painted at 2 px per tile and blown up 16x with `imageSmoothingEnabled = true`, which is an
  // airbrush: Zerg ground faded out over half a tile instead of stopping. Brood War's creep has a hard
  // border with a lumpy outline and an ordered-dither fringe -- the same treatment the height
  // transitions in renderChunk get, and for the same reason.
  //
  // It could not have that treatment because creep was the one layer composited from scratch every
  // frame, and a dither applied *after* compositing is a full-screen pass. The draw pass has about
  // 1.6 ms of headroom in total, so it cannot spend one on the ground the Zerg walk on.
  //
  // So creep is chunk-cached now, exactly like the terrain under it: one canvas per 8x8 tiles, keyed
  // by the creep bits in and one tile around it, rebuilt only when those bits change. `m.creep` is a
  // union of ellipses that `GameMap.recomputeCreep` only recomputes when a creep source finishes or
  // dies, so "when those bits change" is a couple of dozen events in a game rather than a per-frame
  // cost. That moves everything expensive -- the dithered threshold, a posterised material, a darkened
  // rim, per-tile pustules and veins -- from per frame to per change.
  //
  // And it costs no more per frame than the airbrush it replaced: a few opaque chunk blits over the
  // creeped area instead of a viewport clear, a smoothed upscale of the whole mask and a full-viewport
  // `source-in` pattern fill. Measured on the packed 490-unit scene with creep laid across the whole
  // viewport, drawCreep alone is 0.069 ms before and 0.071 ms after, and either way creep is 0.1 ms of
  // a 5 ms frame. Note that test/perf_render cannot see any of this: its camera sits on the middle of
  // `temple` and the only Zerg base is in a corner, so drawCreep early-outs on every measured frame in
  // both versions. Anyone re-measuring this has to put creep on the screen on purpose.
  resetCreep() { this.creepChunks.clear(); this.creepSig = null; this.creepAny = null; this._creepMat = null; },
  creepNx() { return Math.ceil(G.map.w / this.CH); },
  // Which chunks have creep in reach, and which of those changed since the last look. The window is
  // the chunk grown by one tile on every side, because the coverage below reads a tile past the chunk
  // edge and the lumpy outline can push creep about a quarter of a tile further -- a chunk with no
  // creep of its own still shows its neighbour's border bleeding in, and has to be rebuilt when that
  // neighbour changes. 100 tiles per chunk over the whole map is about 0.05 ms and runs twice a second.
  syncCreep() {
    const m = G.map, CH = this.CH, nx = this.creepNx(), ny = Math.ceil(m.h / CH), n = nx * ny;
    if (!this.creepSig || this.creepSig.length !== n) { this.creepSig = new Int32Array(n); this.creepAny = new Uint8Array(n); this.creepChunks.clear(); }
    let any = false;
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
      let s = 0; const t0x = cx * CH - 1, t0y = cy * CH - 1, t1x = cx * CH + CH, t1y = cy * CH + CH;
      for (let ty = t0y; ty <= t1y; ty++) {
        if (ty < 0 || ty >= m.h) continue; const row = ty * m.w;
        for (let tx = t0x; tx <= t1x; tx++) if (tx >= 0 && tx < m.w && m.creep[row + tx]) s = (Math.imul(s, 31) + (tx - t0x) * 131 + (ty - t0y) + 1) | 0;
      }
      const i = cy * nx + cx; this.creepSig[i] = s; this.creepAny[i] = s ? 1 : 0; if (s) any = true;
    }
    return any;
  },
  // A chunk that is stale but already drawn is returned as it is rather than rebuilt, once the frame's
  // build budget is gone. A hatchery finishing invalidates a dozen chunks at once and rebuilding them
  // all in one frame is a visible hitch; showing creep that is a fifth of a second out of date is not.
  creepChunk(cx, cy) {
    const nx = this.creepNx(), i = cy * nx + cx;
    if (!this.creepAny || cx < 0 || cy < 0 || cx >= nx || i >= this.creepAny.length || !this.creepAny[i]) return null;
    const key = cx + ',' + cy, sig = this.creepSig[i]; let e = this.creepChunks.get(key);
    if (e && e.sig === sig) return e.cv;
    if (this.creepBudget <= 0) return e ? e.cv : null;
    this.creepBudget--;
    const cv = this.renderCreepChunk(cx, cy);
    if (e) { e.cv = cv; e.sig = sig; } else this.creepChunks.set(key, { cv, sig });
    return cv;
  },
  // Creep is baked at 232/255 rather than drawn at globalAlpha 0.9, so the draw pass is a plain blit
  // and the terrain still shows through exactly as much as it did before.
  CREEP_A: 232,
  // The creep material: the same fbm-and-ridge flesh the old per-frame pattern was made of, posterised
  // into the same palette as the terrain, tiled at 192 px. It stays a tile rather than becoming part of
  // the per-chunk loop because the noise is what a chunk bake spends its time on, and the first version
  // of this proved it: fbm and ridge evaluated per creep pixel cost 27 ms a chunk, which at two chunks a
  // frame is a second of stutter every time a hatchery finishes. Sampling a tile costs one array read.
  // 192 is not a divisor of the 256 px chunk, so the tile's phase moves from chunk to chunk, and the
  // per-tile pustules below are keyed off the tile coordinate rather than the tile, so they break the
  // repeat where it would otherwise be visible.
  creepMat() {
    if (this._creepMat) return this._creepMat;
    const S = 192, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d');
    const img = x.createImageData(S, S), d = img.data, col = [0, 0, 0];
    for (let py = 0; py < S; py++) for (let pxx = 0; pxx < S; pxx++) {
      const n = this.fbm(pxx / 22 + 500, py / 22 + 500, 3), v = this.ridge(pxx / 14 + 900, py / 14 + 900);
      col[0] = 70 + n * 60; col[1] = 30 + n * 28; col[2] = 84 + n * 60;
      if (v > 0.88) { col[0] -= 30; col[1] -= 12; col[2] -= 30; }   // the dark veins running through it
      this.posterise(col, pxx, py);
      const o = (py * S + pxx) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return this._creepMat = cv;
  },
  // One scratch canvas for every chunk bake rather than one each: the rim has to arrive through
  // drawImage, because putImageData does not composite and would wipe the material out.
  creepScratch(px) {
    let cv = this._creepScratch;
    if (!cv || cv.width !== px) { cv = this._creepScratch = document.createElement('canvas'); cv.width = cv.height = px; }
    return cv;
  },
  renderCreepChunk(cx, cy) {
    const m = G.map, CH = this.CH, px = CH * TILE, ox = cx * CH * TILE, oy = cy * CH * TILE;
    const cv = document.createElement('canvas'); cv.width = px; cv.height = px; const x = cv.getContext('2d');
    const shape = x.createImageData(px, px), sd = shape.data;
    const rimCv = this.creepScratch(px), rc = rimCv.getContext('2d');
    const rimImg = rc.createImageData(px, px), rd = rimImg.data;
    const cAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || !m.creep[ty * m.w + tx]) ? 0 : 1;
    let anyRim = false, A = this.CREEP_A;
    // Coverage is a bilinear blend of the creep bits at the four surrounding tile centres, so it is 1
    // deep inside, 0 well outside and crosses 0.5 exactly on the tile boundary the simulation drew. The
    // four bits are constant over a tile-sized cell offset half a tile from the grid, so the loop walks
    // cells and hoists them: a cell with all four set needs no arithmetic at all, one with none needs
    // nothing, and only the cells the border actually runs through pay for the noise. That is the whole
    // reason this is affordable -- a border is a line through an area, and lines are cheap.
    const g0x = Math.floor((ox - TILE / 2) / TILE), g0y = Math.floor((oy - TILE / 2) / TILE);
    for (let gy = g0y; gy <= g0y + CH; gy++) for (let gx = g0x; gx <= g0x + CH; gx++) {
      const c00 = cAt(gx, gy), c10 = cAt(gx + 1, gy), c01 = cAt(gx, gy + 1), c11 = cAt(gx + 1, gy + 1);
      const sum = c00 + c10 + c01 + c11; if (!sum) continue;
      const px0 = Math.max(0, gx * TILE + TILE / 2 - ox), px1 = Math.min(px, gx * TILE + TILE * 1.5 - ox);
      const py0 = Math.max(0, gy * TILE + TILE / 2 - oy), py1 = Math.min(px, gy * TILE + TILE * 1.5 - oy);
      if (sum === 4) { for (let p = py0; p < py1; p++) { let o = (p * px + px0) * 4 + 3; for (let q = px0; q < px1; q++, o += 4) sd[o] = A; } continue; }
      for (let p = py0; p < py1; p++) {
        const wy = oy + p, v = (wy - TILE / 2) / TILE - gy, iv = 1 - v;
        const t0 = c00 * iv + c01 * v, t1 = c10 * iv + c11 * v;   // the two edge interpolants, per row
        for (let q = px0; q < px1; q++) {
          const wx = ox + q, u = (wx - TILE / 2) / TILE - gx;
          const w = t0 * (1 - u) + t1 * u;
          if (w < 0.11) continue;   // no amount of lumpiness reaches the threshold from here
          // The outline. Two octaves on purpose: the coarse one gives creep its bulges and inlets, the
          // fine one gives the crenulated edge those bulges need to stop reading as circles.
          const lump = this.vnoise(wx / 12 + 71, wy / 12 + 71) * 0.62 + this.vnoise(wx / 4.5 + 313, wy / 4.5 + 313) * 0.38;
          const a = (w + (lump - 0.5) * 0.5 - CREEP_LO) / CREEP_BAND;
          // The dithered threshold, which is the whole point. A pixel in the band picks in or out against
          // the Bayer matrix instead of taking a fraction of the colour, so the border is a stipple of
          // whole pixels -- hard everywhere, thinning outward -- rather than a ramp of translucent ones.
          // Outside the band the comparison is already decided, so one expression covers all three cases.
          if (!(a > this.bayerAt(wx, wy) + 0.5)) continue;
          const o = (p * px + q) * 4; sd[o + 3] = A;
          // A darkened band just inside the border, so the edge reads as a membrane with a lip rather
          // than a place where the texture stops. Keyed off the same `a`, so it follows every inlet.
          if (a < 1.4) { rd[o + 3] = 112 * (1 - a / 1.4); anyRim = true; }
        }
      }
    }
    x.putImageData(shape, 0, 0);
    // The material, poured through the shape. World-aligned, so the tile does not slide when the camera
    // does and two neighbouring chunks agree along their seam.
    x.globalCompositeOperation = 'source-in';
    const mx = ((ox % 192) + 192) % 192, my = ((oy % 192) + 192) % 192;
    x.save(); x.translate(-mx, -my); x.fillStyle = x.createPattern(this.creepMat(), 'repeat'); x.fillRect(mx, my, px, px); x.restore();
    if (anyRim) { rc.putImageData(rimImg, 0, 0); x.globalCompositeOperation = 'source-atop'; x.drawImage(rimCv, 0, 0); }
    // Mottling, pustules and veins, all keyed off the tile coordinate and all clipped to whatever the
    // dither above decided is creep -- `source-atop` is doing that clipping for free.
    //
    // The mottle is here for a reason worth writing down: the material is a 192 px tile, and on a field
    // this size the eye finds that repeat in about a second. Broad soft patches placed per tile are not
    // periodic at all, so they break it, and they are also what stops a hundred tiles of creep reading
    // as one flat sheet. They are drawn from two tiles outside the chunk inwards, because a patch is
    // wider than a tile and a chunk that only drew its own would show its own edges.
    x.globalCompositeOperation = 'source-atop';
    const t0x = cx * CH, t0y = cy * CH, MG = 2;
    for (let ty = t0y - MG; ty < t0y + CH + MG; ty++) for (let tx = t0x - MG; tx < t0x + CH + MG; tx++) {
      if (!cAt(tx, ty)) continue;
      const r = this.hash(tx * 29 + 7, ty * 23 + 11), lx = tx * TILE - ox, ly = ty * TILE - oy;
      const mr = this.hash(tx * 17 + 3, ty * 41 + 5);
      if (mr < 0.20) {
        const mx2 = lx + 16, my2 = ly + 16, rad = 26 + this.hash(tx * 13, ty * 11) * 26;
        const g = x.createRadialGradient(mx2, my2, 0, mx2, my2, rad);
        g.addColorStop(0, mr < 0.10 ? 'rgba(226,196,232,0.13)' : 'rgba(22,4,30,0.17)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(mx2, my2, rad, 0, 7); x.fill();
      }
      if (r < 0.10) { // a blister cluster: lit on the upper left, to match every other light in the game
        for (let k = 0; k < 3; k++) {
          const bx = lx + 6 + this.hash(tx * 5 + k, ty) * 20, by = ly + 6 + this.hash(tx, ty * 5 + k) * 20, br = 2.5 + this.hash(tx + k, ty - k) * 3.5;
          x.fillStyle = 'rgba(38,14,44,0.55)'; x.beginPath(); x.ellipse(bx + 1, by + 1, br, br * .8, 0, 0, 7); x.fill();
          x.fillStyle = 'rgba(150,88,158,0.5)'; x.beginPath(); x.ellipse(bx, by, br, br * .8, 0, 0, 7); x.fill();
          x.fillStyle = 'rgba(214,168,220,0.45)'; x.beginPath(); x.ellipse(bx - br * .3, by - br * .35, br * .42, br * .3, 0, 0, 7); x.fill();
        }
      } else if (r < 0.20) { // veins: two short dark runs, the thing that makes it look grown
        x.strokeStyle = 'rgba(34,10,40,0.5)'; x.lineWidth = 2; x.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          const sx = lx + 5 + this.hash(tx * 3 + k, ty * 7) * 22, sy = ly + 5 + this.hash(tx * 7, ty * 3 + k) * 22, ang = this.hash(tx + k * 9, ty + k) * 6.28;
          x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(ang) * 9, sy + Math.sin(ang) * 7); x.stroke();
        }
      }
    }
    x.globalCompositeOperation = 'source-over';
    return cv;
  },
  buildMini() {
    const m = G.map; const cv = document.createElement('canvas'); cv.width = m.w; cv.height = m.h; const x = cv.getContext('2d'); const img = x.createImageData(m.w, m.h); const d = img.data;
    // The tileset's own palette, the way overview() derives it -- these were five badlands browns, so the
    // minimap of an ice or jungle map was a brown map of a white one. (REVIEW-M17)
    const P = this.pal, cols = { rock: P.rock(0.6), slope: P.slope(0.65), high: P.high(0.5, 0), ramp: P.ramp(0.5), low: P.low(0.5, 0) };
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) { const i = m.idx(tx, ty); let c; if (m.cliff[i] === 2) c = cols.rock; else if (m.cliff[i] === 1) c = cols.slope; else if (m.height[i] === 2) c = cols.high; else if (m.height[i] === 1) c = cols.ramp; else c = cols.low; const o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
    x.putImageData(img, 0, 0); this.mini = cv; return cv;
  },
};
