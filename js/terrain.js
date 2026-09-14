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
// TEXTURED GROUND -- DETAILED TERRAIN, ON BY DEFAULT since the terrain queue's phase 5 (the user, 2026-09-13: "i do not need an
// editor. i just want great looking maps"; of the Badlands test run, "Switch it on by default and commit."; RESEARCH-TERRAIN.md).
// A tileset may name photographic ground textures (Poly Haven, CC0: assets/terrain/SOURCES.md). With Terrain.textured on -- it is,
// unless the player chose Classic in Settings -- and the set's textures loaded, a chunk is painted from them instead of from the
// palette: low ground, high ground, ramps, cliffs and rock, blended along the height steps and lit from the upper left like
// every sprite, with the high ground's shadow thrown down its cliff. The map, the pathing and the simulation are untouched --
// this is drawing only, so no replay or network game can tell the difference.
//
// Every tileset has a set since the terrain queue's phase 2. The four new ones were chosen from Poly Haven's catalogue (read through
// its API, 859 textures, 16 of them true aerial scans and none of ice) by their previews and then by the files themselves; a ramp
// slot may name its set's high ground, because a ramp's own texture shows at only RAMP_TRACKS.
const TERRAIN_TEX = {
  badlands: { low: 'assets/terrain/aerial_ground_rock_diff_1k.jpg', high: 'assets/terrain/dirt_aerial_03_diff_1k.jpg', ramp: 'assets/terrain/dirt_aerial_02_diff_1k.jpg', rock: 'assets/terrain/cliff_side_diff_1k.jpg' },
  // wet mossy ground under a drier olive plateau, mossy rock on the faces
  jungle: { low: 'assets/terrain/rocky_terrain_02_diff_1k.jpg', high: 'assets/terrain/aerial_grass_rock_diff_1k.jpg', ramp: 'assets/terrain/aerial_grass_rock_diff_1k.jpg', rock: 'assets/terrain/aerial_rocks_04_diff_1k.jpg' },
  // a trodden snowfield graded to shadowed blue below, smooth wind-packed snow above (its twigs healed away), veined slate on the faces
  ice: { low: 'assets/terrain/snow_field_aerial_col_1k.jpg', high: 'assets/terrain/snow_02_diff_1k.jpg', ramp: 'assets/terrain/snow_02_diff_1k.jpg', rock: 'assets/terrain/dark_rock_diff_1k.jpg' },
  // a cracked orange canyon floor under bleached rippled sand, bedded sandstone on the faces
  desert: { low: 'assets/terrain/dry_ground_rocks_diff_1k.jpg', high: 'assets/terrain/aerial_beach_01_diff_1k.jpg', ramp: 'assets/terrain/aerial_beach_01_diff_1k.jpg', rock: 'assets/terrain/marble_cliff_03_diff_1k.jpg' },
  // a dark rust-stained deck below, light riveted plates above, tread plate on the ramps, corrugated steel on the faces. The other
  // way round first (plates below, the stained sheet above): the sheet's rust blotches lined up in a grid across the high ground.
  space: { low: 'assets/terrain/rusty_metal_sheet_diff_1k.jpg', high: 'assets/terrain/metal_plate_02_diff_1k.jpg', ramp: 'assets/terrain/metal_plate_diff_1k.jpg', rock: 'assets/terrain/corrugated_iron_02_diff_1k.jpg' },
};
// A colour grade per material, multiplied in: the high ground lighter than the low, so which is which reads at a glance the way
// the palette tilesets make it read. The new sets were graded toward their palettes' hues (the TILESETS entries above) with the
// high ground at least as much brighter than the low as Badlands', and their cliff rock not much darker against the high ground
// than Badlands' -- the approved look. Measured as each graded texture's mean luminance in linear light: high ground over low
// Badlands 2.2, Jungle 3.5, Ice 3.5, Desert 3.9, Space Platform 5.7; cliff rock over high ground Badlands 0.45, Jungle 0.43,
// Ice 0.45, Desert 0.29, Space Platform 1.0. Ice's rock was 0.06 at first, and its cliffs a black stroke round every plateau --
// dark_rock is near-black basalt, hence a grade of five; Space Platform's lip was black at 0.2 and its bulkheads glared at 2.
const TERRAIN_GRADE = {
  badlands: { low: [0.74, 0.72, 0.7], high: [1.2, 1.11, 0.98], ramp: [1.04, 0.98, 0.9], rock: [0.92, 0.8, 0.7] },
  jungle: { low: [0.75, 0.88, 1.2], high: [1.1, 1.25, 1.35], ramp: [1.0, 1.1, 1.15], rock: [0.9, 0.95, 1.0] },
  ice: { low: [0.74, 0.93, 1.08], high: [1.3, 1.36, 1.43], ramp: [1.15, 1.2, 1.28], rock: [4.4, 5.5, 7.2] },
  desert: { low: [1.0, 0.85, 0.77], high: [1.57, 1.53, 1.3], ramp: [1.4, 1.32, 1.12], rock: [1.0, 0.83, 0.71] },
  space: { low: [0.5, 0.58, 0.8], high: [1.6, 2.0, 2.75], ramp: [1.4, 1.6, 2.3], rock: [1.5, 1.7, 2.2] },
};
// How a set is laid down, where it is not Badlands' way. mix: how much of the second, transposed sample is blended in to hide the
// repeat, where a material is not laid in cells. grit: how much of the low ground's texture the high ground carries. warp: how far, in world px, cliff and height edges wander. squeeze: how flat the rock
// texture's strata are drawn. tracks: the ramp texture's strength (RAMP_TRACKS when absent). blur: 0 reads the height field
// straight from the tiles, without the 3x3 blur. heal: the materials whose dark flecks are lifted at load (Terrain.healFlecks).
// cells: the materials laid in squares, each from its own place in the texture, instead of mixed (renderChunkTex, CELL_TILES).
//   Metal plating is a grid, and squares or a transposed second sample would break its seams, so only the seamless deck is laid
//   in squares; a platform's edges are straight and follow the tiles -- blurred and warped, every plateau was a melted blob with
//   plating on it (.claude/review/terrain/shots/p2v-space-2). Snow and bleached sand carry less of the floor's grit so they stay
//   clean, and snow_02 is a two-metre scan whose twigs would each be a tile-long black squiggle across a plateau.
const TERRAIN_LOOK = {
  badlands: { mix: 1, grit: 0.38, warp: 22, squeeze: 1.35, cells: ['low', 'high'] },
  jungle: { mix: 1, grit: 0.38, warp: 22, squeeze: 1.35, cells: ['low', 'high'] },
  ice: { mix: 1, grit: 0.2, warp: 22, squeeze: 1.35, heal: ['high', 'ramp'], cells: ['low', 'high'] },
  desert: { mix: 1, grit: 0.25, warp: 22, squeeze: 1.35, cells: ['low', 'high'] },
  space: { mix: 0, grit: 0, warp: 0, squeeze: 1, tracks: 0.6, blur: 0, cells: ['low'] },
};
// PROPS ON OPEN GROUND (the terrain queue's phase 3; the user: "Scattered rocks, debris and dry plants on open ground, lit like the
// units"). Textured ground only, and drawing only: each prop is baked into its chunk as a small height field of its own, lit by the
// terrain's sun from the upper left as every sprite is, over a shadow that darkens the ground below and to its right. Small, and
// never where it could read as a blocker or as cover (RESEARCH-TERRAIN.md 8.1): one candidate a tile on open walkable ground, kept
// by a hash of the tile under a density that broad noise gathers into clusters and clearings, and none on a resource or within
// PROP_RES tiles of one, in a base's hall clearing, on or beside a ramp or its walls, or beside a cliff (Terrain.propMask). So a
// prop is a pure function of the map, its seed and the tile: every redraw, every chunk it crosses and every client agree.
//   density: the share of allowed tiles with a prop, on average. kinds: [kind, weight]. stone: a stone's colour, which the cliff
// texture's own light and dark modulate. The rest are what a kind reads: plant and tip (a leaf's base and its tip, a blade's root
// and its end), wood, ice, metal, dark and rust; snow and moss put snow on a rock's upper faces and moss on its sides.
const TERRAIN_PROPS = {
  badlands: { density: 0.2, stone: [132, 118, 102], kinds: [['boulder', 2], ['stones', 5], ['grass', 5], ['branch', 1]], plant: [120, 104, 72], tip: [204, 186, 138], wood: [168, 150, 124] },
  jungle: { density: 0.22, stone: [118, 120, 108], moss: [74, 96, 44], kinds: [['boulder', 2], ['stones', 3], ['bush', 4], ['fern', 3], ['roots', 1]], plant: [40, 66, 26], tip: [88, 118, 48], wood: [84, 62, 44] },
  ice: { density: 0.16, stone: [92, 100, 114], snow: [236, 243, 250], kinds: [['ice', 4], ['stones', 3], ['twigs', 3]], ice: [178, 208, 228], wood: [84, 72, 62] },
  desert: { density: 0.18, stone: [196, 160, 124], kinds: [['boulder', 2], ['stones', 5], ['deadbush', 3]], wood: [172, 150, 120] },
  space: { density: 0.09, kinds: [['hatch', 3], ['vent', 2], ['cable', 2], ['scrap', 2]], metal: [128, 138, 152], cable: [66, 72, 82], dark: [34, 38, 46], rust: [122, 86, 58] },
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
  reset(seed) { this.seed = seed; this.setId = (G.map && G.map.tileset) || 'badlands'; this.clearChunks(); this.resetCreep(); this.clearStrips(); this.clearOverview(); this.mini = null; },
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
  checkDpr() { const k = this.bakeDpr(); if (k !== this._bakedAt) { this.clearChunks(); this._bakedAt = k; } },   // a ratio change invalidates every cached chunk
  // A chunk canvas leaving the cache gives its backing store back now rather than whenever the collector gets to it: scrolling The
  // Long March with the ring baked ahead retires a chunk a frame, and waiting for the collector cost 84-128 ms frames (and, baking
  // faster, the game canvas's own context). Set to 0 x 0 only once nothing can draw it again.
  releaseChunk(c) { if (c && c.width) { c.width = 0; c.height = 0; } },
  clearChunks() { for (const c of this.chunks.values()) this.releaseChunk(c); this.chunks.clear(); },
  // Scratch memory a bake reuses: a textured chunk used to allocate about 2.1 MB it threw away (five float grids and an ImageData).
  scratch(name, n) { const s = this._scratch || (this._scratch = {}); if (!s[name] || s[name].length !== n) s[name] = new Float32Array(n); return s[name]; },
  imageFor(x, W, ns = '') { const s = this._imgs || (this._imgs = {}), key = ns + W; if (!s[key]) s[key] = x.createImageData(W, W); return s[key]; },
  // The chunk cache had no bound, and did not need one while the camera never saw more than about
  // thirty chunks: a game would cache a few hundred over an hour of scrolling and that was that.
  // Zooming out to OVER_Z puts a hundred and forty in view AT ONCE, and panning a 256-tile map at
  // that zoom would have cached all 1024 of them -- 256 MB of canvas at dpr 1 and a gigabyte at
  // dpr 2. Bounded now at a little over one full strategic viewport. A Map iterates in insertion
  // order, so re-inserting a chunk the moment it is drawn turns the eviction order into least
  // recently SEEN, which is what stops the strategic view from evicting the ground it is standing on.
  CHUNK_CAP: 160,
  trim() { const c = this.chunks; while (c.size > this.CHUNK_CAP) { const k = c.keys().next().value; if (k === undefined) break; this.releaseChunk(c.get(k)); c.delete(k); } },
  // The ratio the chunk canvases are baked at. Terrain is most of the screen and it is the one cached
  // bitmap worth baking at the display's real resolution -- the sheets are not, because re-baking those
  // is a four-fold blow-up of the files and of the tinted-sheet ceiling with them.
  //
  // The dither survives this for free, which is the only reason it is worth doing. posterise() and
  // bayerAt() are called with WORLD coordinates, not pixel indices, and bayerAt truncates them with
  // `& 3` -- so sampling at 1/k of a world unit still lands every k*k block of device pixels in one
  // Bayer cell. The threshold pattern keeps exactly the apparent size it has at ratio 1; what gets
  // finer is the noise, the material blend and the vector pass on top.
  //
  // Whole numbers only, then: detailed terrain draws at the display's real ratio (Render.resize), 1.5 on many displays, and at 1.5 a
  // Bayer cell would be a pixel and a half. The palette bakes at the whole part of it; a textured chunk is refined to its own ratio.
  bakeDpr() { return Math.max(1, Math.floor((typeof Render !== 'undefined' && Render.dpr) || 1)); },
  // ---- textured ground (see TERRAIN_TEX) --------------------------------
  // Detailed unless the player chose Classic (UI.loadPrefs reads it at boot, UI.setTerrainLook changes it) or the address says
  // ?hd=0. Classic stays for a slow machine. It is also all the headless suites ever paint, whatever this says: they have no
  // images, so no texture loads there, and a test of the textured path hands renderChunkTex its texture data.
  textured: true,
  // ?hd=1 or ?hd=0 in the address: detailed or classic for this page whatever the setting (screenshots, a side-by-side); null if neither.
  addressLook() { const m = typeof location !== 'undefined' && /[?&]hd=([01])(&|$)/.exec(String(location.search || '')); return m ? m[1] === '1' : null; },
  // Detailed or classic, in the middle of a game too. Every chunk is dropped and baked again under the usual budget, and overRev
  // moves so the minimap follows; the overview puts itself right -- a textured one gives way to the palette's the next time it is
  // drawn, and a palette one is stepped over to the textures a few rows a frame, as when they arrive. Dropping the overview as well
  // made the switch to detailed a 211 ms frame on The Long March (a whole textured overview at once); this way the worst frame
  // measured was 47 ms (.claude/review/terrain/p5-toggle-probe.js).
  setTextured(on) { on = !!on; if (on !== this.textured) { this.textured = on; this.clearChunks(); this.overRev = (this.overRev || 0) + 1; } return on; },
  TEX_PX: 512,   // texels in one repeat of a ground texture: sixteen tiles, which puts a metre of a 20 m aerial scan at about 25 px, a Marine's width
  _tex: {},
  // One load per texture file, whoever asks first: the boot (preloadTextures), a game's loading screen (prepSteps) or a bake (texSet). ok
  // once the file is in; failed if it cannot be (logged once, and the ground stays classic rather than a game waiting for ever). A texture
  // arriving drops the chunks only when it is one the current map's set uses -- the boot preloads every set, and a Jungle texture landing
  // must not throw away an Ice map's ground.
  texEntry(url) {
    let e = this._tex[url]; if (e) return e;
    e = this._tex[url] = { img: new Image(), ok: false, failed: false, decoded: null, data: {} };
    const mine = () => Object.values(TERRAIN_TEX[this.setId] || {}).includes(url);
    e.img.onload = () => { if (e.ok) return; e.ok = true; if (mine()) this.clearChunks(); };
    e.img.onerror = () => { if (e.ok || e.failed) return; e.failed = true; if (typeof console !== 'undefined' && console.warn) console.warn('terrain texture failed to load: ' + url); };
    e.img.src = url;
    return e;
  },
  // Every set's files, fetched while the player is still in the menus: every server here sends them with no-store, so a game that
  // waited for its first frame to ask for them waited for the download too. Only fetched -- decoded and read back once a game needs
  // that set (prepSteps), so the menus hold the files, not seventeen decoded 1024 x 1024 pictures. 0 where no image can load.
  preloadTextures() {
    if (!this.canPrepare()) return 0;
    let n = 0; for (const set of Object.values(TERRAIN_TEX)) for (const url of Object.values(set)) { this.texEntry(url); n++; }
    return n;
  },
  // The set's textures, each drawn once into a size x size canvas (TEX_PX unless asked) and kept as pixels; null until every one has
  // loaded (the palette paints until then), and the chunk cache is dropped as each arrives so the ground bakes again with it. A set at
  // another size -- a sharp chunk's, TEX_PX times its ratio, up to the files' own 1024 -- is made one texture a call (_texMade says a
  // call made one), so no frame draws, reads back and heals four textures of four times the size at once; oneAtATime asks the same of
  // a TEX_PX set (a game's loading screen, which must not stop for four at once either).
  look() { return TERRAIN_LOOK[this.setId] || TERRAIN_LOOK.badlands; },
  texSet(size, oneAtATime) {
    this._texMade = false;
    const spec = this.textured && TERRAIN_TEX[this.setId];
    if (!spec || typeof Image === 'undefined' || typeof document === 'undefined') return null;
    const look = this.look(), S = size || this.TEX_PX, stepped = oneAtATime === undefined ? S !== this.TEX_PX : !!oneAtATime, out = {}; let ready = true;
    for (const part of Object.keys(spec)) {
      const url = spec[part], e = this.texEntry(url);
      if (!e.ok) { ready = false; continue; }
      // kept per treatment and size: two sets may lay one texture down plain and healed
      const heal = (look.heal || []).includes(part), key = (heal ? 'healed' : 'plain') + (S === this.TEX_PX ? '' : S);
      if (!e.data[key]) {
        if (!stepped) { const cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(e.img, 0, 0, S, S); const px = x.getImageData(0, 0, S, S).data; e.data[key] = heal ? this.healFlecks(px, S) : px; }
        else {
          // drawn and read back in one call, healed a step a call after that: Ice's snow healed at 768 in one piece was a 56 ms frame
          if (this._texMade) { ready = false; continue; }
          this._texMade = true;
          const mk = e.making || (e.making = {});
          if (!mk[key]) {
            const cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(e.img, 0, 0, S, S); const px = x.getImageData(0, 0, S, S).data;
            if (!heal) e.data[key] = px; else { mk[key] = this.healSteps(px, S); ready = false; continue; }
          } else { const r = mk[key].next(); if (!r.done) { ready = false; continue; } e.data[key] = r.value; delete mk[key]; }
        }
      }
      out[part] = e.data[key];
    }
    return ready ? out : null;
  },
  // Lifts a texture's dark flecks to the colour round them, in place: a texel darker than HEAL_K of the mean of the box HEAL_R
  // texels each way round it (at 512; wrapped, because the texture tiles) is blended toward that mean, all the way by HEAL_SOFT
  // darker. For snow: a two-metre scan laid over sixteen tiles makes each twig in it a black squiggle a tile long, and what is
  // left once they go is the snow's own soft drifts. Judged at radius 12, 16 and 24 (.claude/review/terrain/shots/p2v-ice-heal):
  // at 12 and 16 each twig left a grey ghost of its shape.
  HEAL_R: 24, HEAL_K: 0.97, HEAL_SOFT: 0.1,
  CELL_TILES: 6, CELL_BAND: 0.2,   // look.cells: a square's side in tiles, and how far either side of its border, in squares, two are blended
  healFlecks(d, S) { const it = this.healSteps(d, S); for (;;) { const r = it.next(); if (r.done) return r.value; } },
  // The same, in steps: each channel's box means one, then the flecks a sixth of the texture at a time (see texSet).
  *healSteps(d, S) {
    const R = Math.max(1, Math.round(S * this.HEAL_R / 512)), n = (2 * R + 1) * (2 * R + 1), N = S * S, W = S + 1;
    const mean = function* (ch) {
      const sat = new Float64Array(W * W);
      for (let j = 0; j < S; j++) { let row = 0; for (let i = 0; i < S; i++) { row += d[(j * S + i) * 4 + ch]; sat[(j + 1) * W + i + 1] = sat[j * W + i + 1] + row; } }
      yield;
      // the sum over columns [0, i) and rows [0, j) of the texture tiled without end, so a box may run off any edge
      const at = (i, j) => { const qi = Math.floor(i / S), qj = Math.floor(j / S), ri = i - qi * S, rj = j - qj * S; return sat[S * W + S] * qi * qj + sat[rj * W + S] * qi + sat[S * W + ri] * qj + sat[rj * W + ri]; };
      const out = new Float32Array(N);
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) out[j * S + i] = (at(i + R + 1, j + R + 1) - at(i - R, j + R + 1) - at(i + R + 1, j - R) + at(i - R, j - R)) / n;
      return out;
    };
    const mr = yield* mean(0); yield; const mg = yield* mean(1); yield; const mb = yield* mean(2); yield;
    const K = this.HEAL_K, soft = this.HEAL_SOFT, band = Math.ceil(N / 6);
    for (let p = 0; p < N; p++) {
      const o = p * 4, L = d[o] + d[o + 1] + d[o + 2], M = mr[p] + mg[p] + mb[p], w = M > 0 ? Math.min(1, Math.max(0, (K * M - L) / (M * soft))) : 0;
      if (w > 0) { d[o] += (mr[p] - d[o]) * w; d[o + 1] += (mg[p] - d[o + 1]) * w; d[o + 2] += (mb[p] - d[o + 2]) * w; }
      if (p % band === band - 1) yield;
    }
    return d;
  },
  // A textured chunk, at ratio K -- K chunk pixels to a world pixel, 1 unless asked -- from textures of any size (S texels to the
  // sixteen tiles of a repeat). At ratio 1 it costs about what the palette's does -- a median 18.5 ms against 21.7, measured in plain
  // V8 over 256 chunks of Lost Ruins (RESEARCH-TERRAIN.md 8.4; inside a vm harness both run ten times slower); at ratio K it costs K
  // squared times as much, which is why a sharp chunk is never baked in one frame (refine, below).
  renderChunkTex(cx, cy, T, K = 1) { const it = this.texBakeSteps(cx, cy, T, K, ''); for (;;) { const r = it.next(); if (r.done) return r.value; } },
  // The bake, in steps: it yields after every row of each of its two pixel passes, so refine can spread a sharp chunk over frames. ns
  // names the scratch memory it uses, since a bake spread over frames must not share its grids with the bakes that run in between.
  // Every length is written in world pixels and turned into chunk pixels by K, and at K 1 each expression reduces exactly to what it
  // was before sharp chunks: the chunks the look was approved on are byte for byte what they were (.claude/review/terrain/bake-golden.js).
  *texBakeSteps(cx, cy, T, K, ns) {
    const m = G.map, CH = this.CH, W = Math.round(CH * TILE * K), look = this.look(), S = Math.round(Math.sqrt(T.low.length / 4)), sc = S / (16 * TILE), grade = TERRAIN_GRADE[this.setId] || {};
    K = W / (CH * TILE);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = W; cv.k = K; cv.tex = true; const x = cv.getContext('2d');
    const img = this.imageFor(x, W, ns), d = img.data, ox = cx * CH * TILE, oy = cy * CH * TILE;   // reused: every pixel is written below
    // How HIGH each tile centre is -- low 0, a ramp or a cliff tile halfway, high 1 -- with where the rock zones and the ramps
    // are, softened by a 3x3 blur so a diagonal cliff is a slope and not a staircase of tile corners (the first pass traced
    // the grid exactly). It is read LINEARLY between centres and then pushed through a steep curve, so a cliff is one drop
    // about two thirds of a tile wide at the cliff tile -- the smoothstep of the second pass made two small steps with a
    // shelf between them, which read as a trench -- while a ramp keeps the linear value and climbs evenly from end to end.
    //
    // A ramp tile is not "halfway" any more: it sits at its own place on the climb (rampLevels), so a three-tile ramp reads as a
    // slope from the plateau down to the floor instead of a flat slab with a drop at each end -- which is what every ramp looked
    // like while they were all 0.5. And a wall beside a ramp (GameMap.wallRamps) stands above the ramp at that point, drawn as
    // the cliff it is -- the plateau's edge folding down both sides of the ramp -- rather than as a slab wider than where you can
    // walk. (Drawn as a lumpy rock zone first, RAMP_WALL_ROCK 0.6, the walls read as two boulders.)
    const M = 3, GW = CH + 2 * M + 1, raw = new Float32Array(GW * GW), rz = new Float32Array(GW * GW), rpz = new Float32Array(GW * GW), t0x = cx * CH - M, t0y = cy * CH - M;
    const RL = this.rampLevels(), wal = new Uint8Array(GW * GW), GH = this.groundGrids().height;
    for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) {
      const tx = t0x + i, ty = t0y + j, o = j * GW + i;
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) { raw[o] = 1.25; rz[o] = 1; continue; }
      const q = ty * m.w + tx, cl = m.cliff[q], h = GH[q];
      raw[o] = cl === 2 ? 1 : cl === 1 ? 0.5 : h === 2 ? 1 : h === 1 ? 0.5 : 0; rz[o] = cl === 2 ? 1 : 0; rpz[o] = !cl && h === 1 ? 1 : 0;
      if (RL[q] >= 0) { if (rpz[o]) raw[o] = RL[q]; else if (cl === 1) { raw[o] = RL[q]; rz[o] = this.RAMP_WALL_ROCK; wal[o] = 1; } }
      if (cl === 1) wal[o] |= 2;
    }
    const blur = src => { const out = new Float32Array(GW * GW); for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) { let s = 0, wsum = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= GW || jj >= GW) continue; const w = (a ? 1 : 2) * (b ? 1 : 2); s += src[jj * GW + ii] * w; wsum += w; } out[j * GW + i] = s / wsum; } return out; };
    const gh = look.blur === 0 ? raw.slice() : blur(raw), gr = blur(rz), gp = rpz;   // the ramp mask stays sharp: a ramp is a passage and has to read as one
    // ...and so does a ramp wall: blurred with the floor on one side and the ramp on the other, a one-tile parapet averages down
    // to a soft bump no one reads as a wall (tried first). Its own cell keeps its height and its rock; its neighbours still blur.
    for (let o = 0; o < GW * GW; o++) if (wal[o] & 1) { gh[o] = raw[o]; gr[o] = rz[o]; }
    // Where the climb is read linearly rather than through the cliff curve: the ramp and one tile round it, blurred, but never on
    // a cliff or a wall tile. With the sharp mask alone the curve took over half a tile before each end of the ramp and put a
    // dark kink across its top and its foot; walls and cliffs keep their one crisp drop.
    const gk = blur(rpz); for (let o = 0; o < GW * GW; o++) if (wal[o]) gk[o] = 0;
    const sm = t => t * t * (3 - 2 * t), PAD = Math.round(24 * K), PW = W + 2 * PAD;
    const hf = this.scratch(ns + 'hf' + PW, PW * PW), rk = this.scratch(ns + 'rk' + PW, PW * PW), rp = this.scratch(ns + 'rp' + PW, PW * PW);   // reused: every cell is written below
    const celled = look.cells || [], cLow = celled.includes('low'), cHigh = celled.includes('high'), cRamp = celled.includes('ramp');
    const wn1 = celled.length ? this.scratch(ns + 'wn1' + PW, PW * PW) : null, wn2 = celled.length ? this.scratch(ns + 'wn2' + PW, PW * PW) : null;
    for (let py = 0; py < PW; py++) { for (let pxx = 0; pxx < PW; pxx++) {
      const wx = ox + (pxx - PAD) / K, wy = oy + (py - PAD) / K;
      // a gentle warp of where the grid is read, so an edge wanders by up to a third of a tile instead of running dead straight
      const n1 = this.vnoise(wx / 37, wy / 37) - 0.5, n2 = this.vnoise(wx / 37 + 17, wy / 37 + 29) - 0.5, qx = wx + n1 * look.warp, qy = wy + n2 * look.warp;
      if (wn1) { wn1[py * PW + pxx] = n1; wn2[py * PW + pxx] = n2; }
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
      const kk = gk[a1] * (1 - u1) * (1 - v1) + gk[a1 + 1] * u1 * (1 - v1) + gk[a1 + GW] * (1 - u1) * v1 + gk[a1 + GW + 1] * u1 * v1;
      const kRamp = sm(Math.min(1, Math.max(rp[o], kk) * 1.5)), cliffH = sm(Math.min(1, Math.max(0, (lin - 0.5) / 0.36 + 0.5)));
      // rock zones stand a little above the high ground and are lumpy, so the light finds boulders and hollows in them
      hf[o] = cliffH * (1 - kRamp) + lin * kRamp + (rock > 0.05 ? (0.22 + (this.fbm(wx / 26, wy / 26, 2) - 0.5) * 0.6) * rock : 0);
    } yield; }
    const Ln = Math.hypot(0.5, 0.6, 0.62), lx = -0.5 / Ln, ly = -0.6 / Ln, lz = 0.62 / Ln, RISE = 22, BUMP = 4;   // the sun: upper left and above; RISE world px of height per unit
    const A = [0, 0, 0], B = [0, 0, 0], col = [0, 0, 0], tmp = [0, 0, 0], one = [1, 1, 1];
    const tex = (t, u, v, o) => { u *= sc; v *= sc; const p = ((((v | 0) % S) + S) % S * S + ((((u | 0) % S) + S) % S)) * 4; o[0] = t[p]; o[1] = t[p + 1]; o[2] = t[p + 2]; };   // u, v in world px
    // A material is two samples of its texture -- the second transposed and rescaled -- mixed by broad noise, so the
    // sixteen-tile repeat does not line up into a visible grid across a map.
    const mix = look.mix || 0;
    // ...or laid in cells (look.cells, the materials so laid): the ground cut into squares CELL_TILES across, their borders wandering
    // by a quarter of a square, each square showing the texture from its own hashed offset and blended with its neighbour over
    // CELL_BAND of a square either side of a border (four squares at a corner, one in most of a square). The two samples still
    // repeat, and a scan with features a player can pick out -- a snow patch, a rust bloom, a cluster of stones -- showed them in a
    // sixteen-tile grid across open ground (.claude/review/terrain/shots/p2-ice-centre); squares leave no grid to line up along.
    // Judged at 4, 6 and 9 tiles (p2v-ice-cells). The square is found once a pixel, for every material laid in them.
    const CW = this.CELL_TILES * TILE, CB = this.CELL_BAND, C = [0, 0, 0], cellU = [0, 0, 0, 0], cellV = [0, 0, 0, 0], cellW = [0, 0, 0, 0];
    let cn = 0;
    const cellPut = (jx, jy, w) => { cellU[cn] = this.hash(jx * 7 + 3, jy * 13 + 5) * (16 * TILE); cellV[cn] = this.hash(jy * 11 + 1, jx * 5 + 9) * (16 * TILE); cellW[cn++] = w; };   // offsets in world px
    const cellAt = (wx, wy, o) => {
      const gx = wx / CW + wn1[o] * 0.5, gy = wy / CW + wn2[o] * 0.5, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
      const nx = fx < CB ? -1 : fx > 1 - CB ? 1 : 0, ny = fy < CB ? -1 : fy > 1 - CB ? 1 : 0;
      const wX = nx ? 0.5 * sm(1 - (nx < 0 ? fx : 1 - fx) / CB) : 0, wY = ny ? 0.5 * sm(1 - (ny < 0 ? fy : 1 - fy) / CB) : 0;
      cn = 0; cellPut(ix, iy, (1 - wX) * (1 - wY)); if (nx) cellPut(ix + nx, iy, wX * (1 - wY)); if (ny) cellPut(ix, iy + ny, (1 - wX) * wY); if (nx && ny) cellPut(ix + nx, iy + ny, wX * wY);
    };
    const mat = (t, g, mix, inCells, wx, wy, q, o) => {
      if (inCells) { let r = 0, gg = 0, b = 0; for (let k = 0; k < cn; k++) { tex(t, wx + cellU[k], wy + cellV[k], C); r += C[0] * cellW[k]; gg += C[1] * cellW[k]; b += C[2] * cellW[k]; } o[0] = r * g[0]; o[1] = gg * g[1]; o[2] = b * g[2]; return; }
      tex(t, wx, wy, A); if (!mix) { o[0] = A[0] * g[0]; o[1] = A[1] * g[1]; o[2] = A[2] * g[2]; return; } q *= mix; tex(t, wy * 0.83 + 331, wx * 0.83 + 173, B); o[0] = (A[0] + (B[0] - A[0]) * q) * g[0]; o[1] = (A[1] + (B[1] - A[1]) * q) * g[1]; o[2] = (A[2] + (B[2] - A[2]) * q) * g[2];
    };
    const gLow = grade.low || one, gHigh = grade.high || one, gRamp = grade.ramp || one, gRock = grade.rock || one;
    const PL = this.propLayer(cx, cy, T, K, ns), PSH = this.PROP_SHADOW;   // props on open ground: null where none reaches this chunk
    const SHY = Math.round(11 * K), SHX = Math.round(9 * K);   // where the shadow of higher ground is read from: 11 and 9 world px towards the sun
    for (let py = 0; py < W; py++) { for (let pxx = 0; pxx < W; pxx++) {
      const wx = ox + pxx / K, wy = oy + py / K, o = (py + PAD) * PW + pxx + PAD, h = hf[o];
      const q = sm(Math.min(1, Math.max(0, (this.vnoise(wx / 230, wy / 230) - 0.3) / 0.4)));
      const dxh = (hf[o + 1] - hf[o - 1]) / 2 * K, dyh = (hf[o + PW] - hf[o - PW]) / 2 * K, steep = Math.sqrt(dxh * dxh + dyh * dyh);   // per world px
      // low ground under high, the seam pushed about by noise; the high ground carries some of the low ground's grit, so it is
      // the same country raised up rather than a different floor
      const tH = sm(Math.min(1, Math.max(0, (h + (this.vnoise(wx / 19, wy / 19) - 0.5) * 0.3 - 0.3) / 0.35)));
      if (wn1) cellAt(wx, wy, o);
      mat(T.low, gLow, mix, cLow, wx, wy, q, col);
      if (tH > 0) {
        mat(T.high, gHigh, mix, cHigh, wx, wy, q, tmp); const gl = look.grit;
        const hr = tmp[0] * (1 - gl) + col[0] * gl * 1.3, hg = tmp[1] * (1 - gl) + col[1] * gl * 1.3, hb = tmp[2] * (1 - gl) + col[2] * gl * 1.3;
        col[0] += (hr - col[0]) * tH; col[1] += (hg - col[1]) * tH; col[2] += (hb - col[2]) * tH;
      }
      const pr = rp[o]; if (pr > 0.02) { mat(T.ramp, gRamp, mix, cRamp, wx, wy, q, tmp); const kp = sm(Math.min(1, pr * 1.3)) * (look.tracks === undefined ? this.RAMP_TRACKS : look.tracks); col[0] += (tmp[0] - col[0]) * kp; col[1] += (tmp[1] - col[1]) * kp; col[2] += (tmp[2] - col[2]) * kp; }   // worn tracks on the ground, not a new floor
      // rock where the ground is steep -- the cliff's own face, not the whole tile around it -- and in the rock zones
      const kr = Math.max(sm(Math.min(1, Math.max(0, (steep - 0.016) / 0.02))) * (pr > 0.35 ? 0 : 1), sm(Math.min(1, rk[o] * 1.3)));
      let bx = 0, by = 0;
      if (kr > 0.02) {   // the canyon texture, its strata squeezed flat, and its own brightness read as relief
        const ry = wy * look.squeeze;
        tex(T.rock, wx, ry, tmp);
        tex(T.rock, wx + 1, ry, A); tex(T.rock, wx - 1, ry, B); bx = (A[0] + A[1] - B[0] - B[1]) / 510 * kr;
        tex(T.rock, wx, ry + 1, A); tex(T.rock, wx, ry - 1, B); by = (A[0] + A[1] - B[0] - B[1]) / 510 * kr;
        col[0] += (tmp[0] * gRock[0] - col[0]) * kr; col[1] += (tmp[1] * gRock[1] - col[1]) * kr; col[2] += (tmp[2] * gRock[2] - col[2]) * kr;
      }
      // the light: the height field's slope plus the rock's relief against the sun, so flat ground is exactly 1
      const sx = dxh * RISE + bx * BUMP, sy = dyh * RISE + by * BUMP;
      let shade = (-sx * lx - sy * ly + lz) / Math.sqrt(sx * sx + sy * sy + 1) / lz; shade = shade < 0.5 ? 0.5 : shade > 1.35 ? 1.35 : shade;
      let env = 1; const up = hf[o - SHY * PW - SHX] - h; if (up > 0.08) env = 1 - Math.min(0.32, (up - 0.08) * 0.7);   // the shadow of higher ground towards the sun
      env *= 0.94 + (this.vnoise(wx / 150 + 40, wy / 150 + 40) - 0.5) * 0.18;   // broad light and dark patches, as clouds or wear
      shade *= env;
      const oo = (py * W + pxx) * 4; let r = col[0] * shade, g = col[1] * shade, b = col[2] * shade;
      if (PL) {
        // a prop's shadow darkens the ground; the prop itself is lit by the slope of its own height field, as the ground is, and
        // lies in the same cliff shadow and cloud
        const LW = PL.W, li = (py + 1) * LW + pxx + 1, ps = PL.s[li], pa = PL.a[li];
        if (ps > 0) { const k = 1 - ps * PSH; r *= k; g *= k; b *= k; }
        if (pa > 0) {
          const qx = (PL.h[li + 1] - PL.h[li - 1]) / 2, qy = (PL.h[li + LW] - PL.h[li - LW]) / 2;
          let ls = (-qx * lx - qy * ly + lz) / Math.sqrt(qx * qx + qy * qy + 1) / lz; ls = (ls < 0.42 ? 0.42 : ls > 1.4 ? 1.4 : ls) * env;
          r += (PL.c[li * 3] * ls - r) * pa; g += (PL.c[li * 3 + 1] * ls - g) * pa; b += (PL.c[li * 3 + 2] * ls - b) * pa;
        }
      }
      d[oo] = r > 255 ? 255 : r; d[oo + 1] = g > 255 ? 255 : g; d[oo + 2] = b > 255 ? 255 : b; d[oo + 3] = 255;
    } yield; }
    x.putImageData(img, 0, 0);
    return cv;
  },
  // Per tile, for the textured bake: a ramp tile's height along its climb, and the height of a wall standing beside a ramp; -1
  // everywhere else. A ramp tile's level is d_low / (d_low + d_high), its 4-connected steps through the ramp to the nearest low
  // ground and to the nearest high ground, so a three-tile ramp climbs 0.25, 0.5, 0.75 from its foot. A wall (a cliff tile
  // touching a ramp tile) stands RAMP_WALL_RISE above the highest ramp tile it touches, capped at the plateau, and is rock zone
  // only by RAMP_WALL_ROCK (none: its faces are steep, and the steep ground takes the rock texture by itself). Recomputed when
  // the map or its features change (a feature can move a ramp tile's height); a few milliseconds on the largest map.
  RAMP_WALL_RISE: 0.35, RAMP_WALL_ROCK: 0,
  // How much of the ramp texture shows on a ramp. The test run used half ("worn tracks, not a new floor"); with walls folding the
  // cliff down both sides the passage no longer needs it to read, and at half its streaks drew a pale striped rectangle.
  // Judged on screen at 0.5, 0.3 and 0.15 (.claude/review/terrain/shots/p1-tracks-*).
  RAMP_TRACKS: 0.15,
  rampLevels() {
    const m = G.map, GG = this.groundGrids(), MH = GG.height, MW = GG.walk, key = (m.featureRev ? m.featureRev() : 0) + '/' + GG.key;
    if (this._rampLv && this._rampLvMap === m && this._rampLvKey === key) return this._rampLv;
    const W = m.w, N = W * m.h, lv = new Float32Array(N).fill(-1), isRamp = i => MH[i] === 1 && m.cliff[i] === 0;
    const dist = high => {
      const d = new Int32Array(N).fill(-1), q = [];
      for (let i = 0; i < N; i++) if (m.cliff[i] === 0 && (high ? MH[i] === 2 : MH[i] === 0 && MW[i] === 1)) { d[i] = 0; }
      for (let i = 0; i < N; i++) if (d[i] === 0) { const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && isRamp(j) && d[j] < 0) { d[j] = 1; q.push(j); } }
      for (let k = 0; k < q.length; k++) { const i = q[k], x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && isRamp(j) && d[j] < 0) { d[j] = d[i] + 1; q.push(j); } }
      return d;
    };
    const dh = dist(true), dl = dist(false);
    for (let i = 0; i < N; i++) if (isRamp(i)) lv[i] = dh[i] < 0 ? 0 : dl[i] < 0 ? 1 : dl[i] / (dl[i] + dh[i]);
    for (let i = 0; i < N; i++) {
      if (m.cliff[i] !== 1) continue;
      const x = i % W; let top = -1;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && isRamp(j) && lv[j] > top) top = lv[j];
      if (top >= 0) lv[i] = Math.min(1, top + this.RAMP_WALL_RISE);
    }
    this._rampLvMap = m; this._rampLvKey = key; return this._rampLv = lv;
  },
  // The ground as the map made it, for drawing. A hulk (GameMap.addWreck) sets its tiles to height 2 and unwalkable so that it
  // blocks and hides what stands behind it, and a chunk baked while one stood drew those tiles as a little plateau with cliff faces
  // all round (.claude/review/terrain/shots/p4-hulk-check) -- then went on drawing it after the hulk had rotted away, because
  // nothing tells the chunk cache a hulk came or went. FX draws the wreck; the ground under it is the ground it fell on. Height
  // and walk with every hulk's tiles put back, cached until the hulks change; the map's own grids when there are none.
  groundGrids() {
    const m = G.map, wr = m.wrecks || [];
    if (!wr.length) return { height: m.height, walk: m.walk, key: '' };
    let key = ''; for (const wk of wr) key += wk.born + ':' + wk.tiles[0] + ',';
    if (this._ground && this._groundMap === m && this._ground.key === key) return this._ground;
    const height = m.height.slice(), walk = m.walk.slice();
    for (const wk of wr) wk.tiles.forEach((i, k) => { if (m.blocked[i] === WRECK_BLOCKED) { height[i] = wk.baseH[k]; walk[i] = 1; } });
    this._groundMap = m; return this._ground = { height, walk, key };
  },
  // ---- props (see TERRAIN_PROPS) ----------------------------------------
  // PROP_R: no prop, shadow included, reaches further than this from its centre (world px), so a chunk reads the props of the tiles
  // this far past its edge. PROP_RES and PROP_HALL: the clearing round every mineral patch and geyser, and round every base's town
  // hall footprint, in tiles. PROP_SHADOW: how dark a prop's shadow is at its darkest.
  PROP_R: 24, PROP_RES: 2, PROP_HALL: 3, PROP_SHADOW: 0.5,
  // Where a prop may stand, per tile (1 or 0), once per map, from the map as generated: walkable open ground with no cliff, wall,
  // ramp or map feature on it or next to it, clear of the resources and the halls. It reads nothing that play changes -- a
  // mined-out patch and a base's minerals stay cleared, a broken rock formation's tiles and their neighbours stay excluded, a
  // hulk's tiles read as the ground under it, buildings are ignored -- so props never pop in or out, and a client that joins
  // late or loads a save computes the same mask as one that played from the start.
  propMask() {
    const m = G.map; if (this._propMask && this._propMap === m) return this._propMask;
    const W = m.w, H = m.h, ok = new Uint8Array(W * H), hulk = new Map();
    for (const wk of m.wrecks || []) wk.tiles.forEach((i, k) => hulk.set(i, wk.baseH[k]));
    const feat = i => !!(m.featTile && m.featTile[i] >= 0);
    const open = i => hulk.has(i) || (m.walk[i] === 1 && m.cliff[i] === 0);
    const ramp = i => (hulk.has(i) ? hulk.get(i) : m.height[i]) === 1;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!open(i) || ramp(i) || feat(i)) continue;
      let clear = true;
      for (let b = -1; b <= 1 && clear; b++) for (let a = -1; a <= 1; a++) { const j = i + b * W + a; if (!(hulk.has(j) || m.cliff[j] === 0) || ramp(j) || feat(j)) { clear = false; break; } }
      if (clear) ok[i] = 1;
    }
    const cut = (x0, y0, w, h) => { for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) ok[y * W + x] = 0; };
    const R = this.PROP_RES, HC = this.PROP_HALL, patch = r => cut(r.x - R, r.y - R, r.w + 2 * R, r.h + 2 * R);
    for (const b of m.bases || []) { cut(b.x - HC, b.y - HC, 4 + 2 * HC, 3 + 2 * HC); for (const r of b.minerals || []) patch(r); if (b.geyser) patch(b.geyser); }
    for (const r of m.resources || []) patch(r);
    this._propMap = m; return this._propMask = ok;
  },
  // The prop on a tile, or null: kept when a hash of the tile falls under the set's density times a cluster weight from broad noise
  // (mean one), and placed within the middle three fifths of the tile, sized, turned and chosen by more hashes of the same tile.
  propAt(tx, ty) {
    const m = G.map, P = TERRAIN_PROPS[this.setId]; if (!P || tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || !this.propMask()[ty * m.w + tx]) return null;
    const c = this.vnoise(tx / 6.3 + 211, ty / 6.3 + 97); if (this.hash(tx * 17 + 5, ty * 23 + 11) >= P.density * (0.15 + 2.4 * c * c)) return null;
    let sum = 0; for (const k of P.kinds) sum += k[1];
    let pick = this.hash(tx * 29 + 3, ty * 31 + 7) * sum, kind = P.kinds[P.kinds.length - 1][0];
    for (const k of P.kinds) { if (pick < k[1]) { kind = k[0]; break; } pick -= k[1]; }
    return { kind, tx, ty, x: (tx + 0.2 + 0.6 * this.hash(tx * 37 + 1, ty * 41 + 2)) * TILE, y: (ty + 0.2 + 0.6 * this.hash(tx * 43 + 4, ty * 47 + 6)) * TILE,
      s: this.hash(tx * 53 + 8, ty * 59 + 9), a: this.hash(tx * 61 + 10, ty * 67 + 12) * Math.PI * 2 };
  },
  // The props over a chunk as layers of its pixels at ratio K, one pixel of margin all round so a prop's slope can be read at the
  // chunk's edge: h height (layer px: world px times K, so a slope across a layer pixel is the slope across a world pixel), a cover
  // (0-1), c colour, s shadow (0-1). Null when no prop reaches the chunk. One set of layers is kept for each ratio and namespace and
  // cleared for each chunk.
  propLayer(cx, cy, T, K = 1, ns = '') {
    const W = Math.round(this.CH * TILE * K), LW = W + 2, ox = cx * this.CH * TILE - 1 / K, oy = cy * this.CH * TILE - 1 / K, R = this.PROP_R, reach = Math.ceil(R / TILE) + 1, span = LW / K;
    let L = null;
    for (let ty = cy * this.CH - reach; ty < (cy + 1) * this.CH + reach; ty++) for (let tx = cx * this.CH - reach; tx < (cx + 1) * this.CH + reach; tx++) {
      const p = this.propAt(tx, ty); if (!p || p.x + R < ox || p.x - R >= ox + span || p.y + R < oy || p.y - R >= oy + span) continue;
      if (!L) {
        const slot = '_propL' + ns;
        if (!this[slot] || this[slot].W !== LW) this[slot] = { W: LW, h: new Float32Array(LW * LW), a: new Float32Array(LW * LW), c: new Float32Array(LW * LW * 3), s: new Float32Array(LW * LW) };
        L = this[slot]; L.h.fill(0); L.a.fill(0); L.c.fill(0); L.s.fill(0); L.ox = ox; L.oy = oy; L.K = K;
      }
      this.drawProp(L, p, T);
    }
    return L;
  },
  // A texture's mean colour, once per texture.
  texMean(t) {
    const c = this._means || (this._means = new WeakMap()); let v = c.get(t);
    if (!v) { let r = 0, g = 0, b = 0, n = 0; for (let q = 0; q < t.length; q += 28) { r += t[q]; g += t[q + 1]; b += t[q + 2]; n++; } v = [r / n, g / n, b / n]; c.set(t, v); }
    return v;
  },
  // One prop into a layer, from four primitives -- a faceted rock, a blade, a leaf and a box -- each laying its shadow first (its
  // footprint swept down and right by its height, darkest at the base) and then its surface, the taller surface kept where two
  // overlap. The bake lights the surface by its slopes, so every part is lit from the upper left like the sprites.
  drawProp(L, p, T) {
    const P = TERRAIN_PROPS[this.setId], grade = TERRAIN_GRADE[this.setId] || {}, S = Math.round(Math.sqrt(T.low.length / 4)), sc = S / (16 * TILE), K = L.K || 1, LW = L.W, one = [1, 1, 1], C = [0, 0, 0];
    // Every shape below is written in world px from the layer's corner; only the pixel loops count in layer pixels, K to a world px.
    const X = p.x - L.ox, Y = p.y - L.oy, h = (k, a, b) => this.hash(p.tx * a + k, p.ty * b + k * 7), TAU = Math.PI * 2;
    const put = (x, y, hh, a, col) => {
      if (x < 0 || y < 0 || x >= LW || y >= LW || a <= 0) return; const i = y * LW + x; hh *= K;
      if (L.a[i] >= 0.5 && hh < L.h[i]) { if (a > L.a[i]) L.a[i] = a; return; }
      L.h[i] = hh; if (a > L.a[i]) L.a[i] = a; L.c[i * 3] = col[0]; L.c[i * 3 + 1] = col[1]; L.c[i * 3 + 2] = col[2];
    };
    const dark = (x, y, k) => { if (x < 0 || y < 0 || x >= LW || y >= LW) return; const i = y * LW + x; if (k > L.s[i]) L.s[i] = k; };
    const tint = (base, f) => { C[0] = base[0] * f; C[1] = base[1] * f; C[2] = base[2] * f; return C; };
    const mix3 = (u, v, t, f) => { C[0] = (u[0] + (v[0] - u[0]) * t) * f; C[1] = (u[1] + (v[1] - u[1]) * t) * f; C[2] = (u[2] + (v[2] - u[2]) * t) * f; return C; };
    const texAt = (t, u, v) => { u *= sc; v *= sc; return ((((v | 0) % S) + S) % S * S + ((((u | 0) % S) + S) % S)) * 4; };   // u, v in world px
    const sweep = (hh, fn) => { const sx = hh * 0.6, sy = hh * 0.72; for (const t of [0, 0.5, 1]) fn(sx * t, sy * t, 1 - 0.35 * t); };
    // A stone's colour: the set's stone colour, lightened and darkened by the cliff texture's own detail, with snow on the upper
    // faces or moss on the sides where the set has them. rel is the height over the rock's top; k picks the facet.
    const rMean = this.texMean(T.rock), rm = (rMean[0] + rMean[1] + rMean[2]) || 1;
    const stoneCol = (f, snowy) => (wx, wy, rel, k) => {
      const q = texAt(T.rock, wx, wy * 1.35), det = Math.min(1.45, Math.max(0.55, (T.rock[q] + T.rock[q + 1] + T.rock[q + 2]) / rm)), b = f * (0.4 + 0.6 * det) * (0.93 + 0.14 * h(1500 + k, 3, 5));
      tint(P.stone || [150, 140, 128], b);
      if (P.snow && snowy) { const w = Math.min(1, Math.max(0, (rel - 0.5) / 0.2)) * (0.6 + 0.4 * this.vnoise(wx / 2.2, wy / 2.2)); C[0] += (P.snow[0] - C[0]) * w; C[1] += (P.snow[1] - C[1]) * w; C[2] += (P.snow[2] - C[2]) * w; }
      if (P.moss) { const w = Math.max(0, this.vnoise(wx / 3.1 + 50, wy / 3.1) - 0.45) * 1.6 * (rel < 0.85 ? 1 : 0.4); C[0] += (P.moss[0] - C[0]) * w; C[1] += (P.moss[1] - C[1]) * w; C[2] += (P.moss[2] - C[2]) * w; }
      return C;
    };
    // A rock: the part above the ground of a cone of m flat facets through an apex near (cx, cy), each tilted its own way -- so its
    // faces are flat, its ridges sharp and its outline the irregular polygon where the facets meet the ground. flat cuts its top.
    const rock = (cx, cy, r, hMax, m, flat, seed, colour) => {
      const ax = cx + (h(seed, 3, 5) - 0.5) * r * 0.5, ay = cy + (h(seed + 1, 5, 3) - 0.5) * r * 0.5, dx = [], dy = [], sl = [], top = hMax * (1 - flat);
      for (let k = 0; k < m; k++) { const ang = p.a + seed + k * TAU / m + (h(seed + 2 + k, 7, 11) - 0.5) * (TAU / m) * 0.7; dx.push(Math.cos(ang)); dy.push(Math.sin(ang)); sl.push(hMax / (r * (0.7 + 0.55 * h(seed + 20 + k, 11, 7)))); }
      const at = (px, py, out) => { let v = top, kk = -1, s = 1; for (let k = 0; k < m; k++) { const hk = hMax - ((px - ax) * dx[k] + (py - ay) * dy[k]) * sl[k]; if (hk < v) { v = hk; kk = k; s = sl[k]; } } out[0] = v; out[1] = kk; out[2] = s; return v; };
      const Q = [0, 0, 0], R = r * 1.3 + 1, x0 = Math.floor((cx - R) * K), x1 = Math.ceil((cx + R + hMax * 0.6) * K), y0 = Math.floor((cy - R) * K), y1 = Math.ceil((cy + R + hMax * 0.72) * K);
      sweep(hMax, (sx, sy, w) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = at((x + 0.5) / K - sx, (y + 0.5) / K - sy, Q) / Q[2] + 0.6; if (v > 0) dark(x, y, Math.min(1, v) * w); } });
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const v = at((x + 0.5) / K, (y + 0.5) / K, Q); if (v <= 0) continue;
        const wx = L.ox + x / K, wy = L.oy + y / K, rough = (this.vnoise(wx / 1.6 + seed, wy / 1.6) - 0.5) * 0.5 * Math.min(1, v);
        put(x, y, v + rough, Math.min(1, v / Q[2] * 1.3), colour(wx, wy, v / hMax, Q[1]));
      }
    };
    // a blade, stem or twig from a to b, wa wide at a and wb at b, round in section, ha high at a and hb at b; square: cut off flat
    // at both ends instead of rounded
    const blade = (xa, ya, xb, yb, wa, wb, ha, hb, colour, square) => {
      const dx = xb - xa, dy = yb - ya, ll = dx * dx + dy * dy || 1, hm = Math.max(ha, hb);
      const box = (ox2, oy2, fn) => { for (let y = Math.floor((Math.min(ya, yb) - 2 + oy2) * K); y <= Math.ceil((Math.max(ya, yb) + 2 + oy2) * K); y++) for (let x = Math.floor((Math.min(xa, xb) - 2 + ox2) * K); x <= Math.ceil((Math.max(xa, xb) + 2 + ox2) * K); x++) {
        const px = (x + 0.5) / K - ox2, py = (y + 0.5) / K - oy2, t0 = ((px - xa) * dx + (py - ya) * dy) / ll; if (square && (t0 < 0 || t0 > 1)) continue;
        const t = Math.min(1, Math.max(0, t0)), qx = xa + dx * t - px, qy = ya + dy * t - py, dd = Math.sqrt(qx * qx + qy * qy), w = (wa + (wb - wa) * t) / 2 + 0.45;
        if (dd < w) fn(x, y, t, dd / w, w - dd); } };
      sweep(hm, (sx, sy, k) => box(sx, sy, (x, y, t, e, m) => dark(x, y, Math.min(1, m) * 0.7 * k)));
      box(0, 0, (x, y, t, e, m) => put(x, y, (ha + (hb - ha) * t) * Math.sqrt(1 - e * e), Math.min(1, m), colour(t, e)));
    };
    // a curved blade: two blades meeting at a midpoint pushed sideways by bend
    const curve = (xa, ya, xb, yb, bend, wa, wm, wb, ha, hm, hb, colour) => {
      const mx = (xa + xb) / 2 - (yb - ya) * bend, my = (ya + yb) / 2 + (xb - xa) * bend;
      blade(xa, ya, mx, my, wa, wm, ha, hm, (t, e) => colour(t * 0.5, e)); blade(mx, my, xb, yb, wm, wb, hm, hb, (t, e) => colour(0.5 + t * 0.5, e));
    };
    // a leaf from (xa, ya) along angle ang: pointed at both ends, widest a third of the way out, its midrib a little higher and darker
    const leaf = (xa, ya, ang, len, wid, hMax, colour) => {
      const ux = Math.cos(ang), uy = Math.sin(ang), x0 = Math.floor(Math.min(xa, xa + ux * len) - wid - 1), x1 = Math.ceil(Math.max(xa, xa + ux * len) + wid + 1 + hMax), y0 = Math.floor(Math.min(ya, ya + uy * len) - wid - 1), y1 = Math.ceil(Math.max(ya, ya + uy * len) + wid + 1 + hMax);
      const at = (px, py, fn) => { const qx = px - xa, qy = py - ya, t = (qx * ux + qy * uy) / len, s = -qx * uy + qy * ux; if (t <= 0 || t >= 1) return; const w = wid * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.8) + 0.35; if (Math.abs(s) < w) fn(t, Math.abs(s) / w, w - Math.abs(s)); };
      const X0 = Math.floor(x0 * K), X1 = Math.ceil(x1 * K), Y0 = Math.floor(y0 * K), Y1 = Math.ceil(y1 * K);
      sweep(hMax, (sx, sy, k) => { for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) at((x + 0.5) / K - sx, (y + 0.5) / K - sy, (t, e, m) => dark(x, y, Math.min(1, m * 1.5) * 0.7 * k)); });
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) at((x + 0.5) / K, (y + 0.5) / K, (t, e, m) => put(x, y, hMax * (0.55 + 0.45 * (1 - e * e)) * (0.75 + 0.25 * Math.sin(Math.PI * t)), Math.min(1, m * 1.5), colour(t, e)));
    };
    // an axis-aligned box w x hh with bevelled edges, top height top; colour(wx, wy, edgeDistance)
    const box = (x0, y0, w, hh, top, bevel, colour) => {
      sweep(top, (sx, sy, k) => { for (let y = Math.floor((y0 + sy) * K); y < Math.ceil((y0 + hh + sy) * K); y++) for (let x = Math.floor((x0 + sx) * K); x < Math.ceil((x0 + w + sx) * K); x++) dark(x, y, 0.85 * k); });
      for (let y = Math.floor(y0 * K); y < Math.ceil((y0 + hh) * K); y++) for (let x = Math.floor(x0 * K); x < Math.ceil((x0 + w) * K); x++) {
        const ed = Math.min(x / K + 0.5 / K - x0, x0 + w - x / K - 0.5 / K, y / K + 0.5 / K - y0, y0 + hh - y / K - 0.5 / K); if (ed <= 0) continue;
        put(x, y, top * Math.min(1, 0.45 + ed / bevel * 0.55), Math.min(1, ed + 0.5), colour(L.ox + x / K, L.oy + y / K, ed));
      }
    };
    // a tangle of twigs from a knot at (cx, cy): n branches of uneven length and angle, each with a side twig or two
    const twigs = (cx, cy, n, len, w, hh, col, seed) => {
      rock(cx, cy, 1.4 + w * 0.4, hh * 1.1, 6, 0.3, seed / 100, () => tint(col, 0.7));
      for (let k = 0; k < n; k++) {
        const a = p.a + k * TAU / n + (h(seed + k, 3, 5) - 0.5) * 1.1, l = len * (0.55 + 0.45 * h(seed + 10 + k, 5, 3)), ex = cx + Math.cos(a) * l, ey = cy + Math.sin(a) * l, f = 0.8 + 0.35 * h(seed + 20 + k, 7, 7);
        curve(cx, cy, ex, ey, (h(seed + 70 + k, 3, 7) - 0.5) * 0.3, w, w * 0.7, w * 0.35, hh, hh * 0.8, hh * 0.5, () => tint(col, f));
        for (let j = 0; j < 1 + (h(seed + 30 + k, 3, 3) < 0.5 ? 1 : 0); j++) {
          const t = 0.4 + 0.3 * h(seed + 40 + k + j, 5, 7), sa = a + (j ? -1 : 1) * (0.5 + 0.4 * h(seed + 50 + k, 3, 5)), sl = l * (0.3 + 0.25 * h(seed + 60 + k + j, 7, 3)), bx = cx + (ex - cx) * t, by = cy + (ey - cy) * t;
          blade(bx, by, bx + Math.cos(sa) * sl, by + Math.sin(sa) * sl, w * 0.6, w * 0.3, hh * 0.75, hh * 0.5, () => tint(col, f * 0.95));
        }
      }
    };
    const s = p.s, a = p.a;
    switch (p.kind) {
      case 'boulder': {
        const r = 6 + 5 * s, st = stoneCol(0.9 + 0.2 * h(1, 3, 5), true);
        rock(X, Y, r, r * 0.95, 6 + Math.floor(3 * h(2, 5, 3)), h(3, 7, 7) < 0.4 ? 0.3 : 0, 0.5, st);
        for (let k = 0; k < 3; k++) if (h(4 + k, 7, 11) < 0.6) { const aa = a + 2 + k * 1.5, d = r + 1.5 + 3 * h(5 + k, 3, 3), rr = 1.8 + 2 * h(8 + k, 5, 7); rock(X + Math.cos(aa) * d, Y + Math.sin(aa) * d, rr, rr * 0.85, 5, 0.2, 2.5 + k, stoneCol(0.9, false)); }
        break;
      }
      case 'stones': {
        // one larger stone and a scatter of small ones at uneven distances: stones of one size in a ring read as a paw print
        const n = 2 + Math.floor(5 * s);
        rock(X, Y, 2.4 + 1.8 * h(9, 5, 3), 3 + 1.2 * h(8, 3, 3), 5 + Math.floor(2 * h(7, 5, 5)), h(6, 3, 7) < 0.5 ? 0.3 : 0, 3.1, stoneCol(0.85 + 0.25 * h(5, 7, 3), true));
        for (let k = 0; k < n; k++) {
          const aa = TAU * h(10 + k, 3, 7), d = 3.5 + 7 * h(20 + k, 7, 3) * h(25 + k, 3, 5), r = 0.9 + 1.4 * h(30 + k, 5, 5);
          rock(X + Math.cos(aa) * d, Y + Math.sin(aa) * d * 0.85, r, r * 0.8, 5, h(40 + k, 3, 3) < 0.5 ? 0.35 : 0, 3.7 + k, stoneCol(0.82 + 0.3 * h(50 + k, 3, 3), false));
        }
        break;
      }
      case 'grass': {
        const n = 14 + Math.floor(10 * s), f0 = 0.9 + 0.2 * h(1, 3, 3);
        for (let k = 0; k < n; k++) {
          const aa = a + TAU * h(10 + k, 3, 5), len = 4 + 6.5 * h(20 + k, 5, 3), f = f0 * (0.75 + 0.35 * h(30 + k, 7, 7)), o = 1.5 * h(40 + k, 3, 3), bx = X + Math.cos(aa + 1.9) * o, by = Y + Math.sin(aa + 1.9) * o;
          curve(bx, by, bx + Math.cos(aa) * len, by + Math.sin(aa) * len * 0.9, (h(50 + k, 5, 5) - 0.5) * 0.5, 1, 0.65, 0.2, 1.3, 1.7, 0.6, t => mix3(P.plant, P.tip, t, f));
        }
        break;
      }
      case 'branch': {
        const len = 11 + 7 * s, ex = Math.cos(a) * len / 2, ey = Math.sin(a) * len / 2;
        curve(X - ex, Y - ey, X + ex, Y + ey, (h(3, 7, 3) - 0.5) * 0.35, 2.2, 1.8, 1.1, 1.9, 1.8, 1.4, t => tint(P.wood, 0.85 + 0.15 * t));
        for (let k = 0; k < 2; k++) { const t = 0.3 + 0.4 * h(10 + k, 3, 5), sa = a + (k ? -0.8 : 0.9), sl = 3 + 3.5 * h(20 + k, 5, 3), bx = X - ex + ex * 2 * t, by = Y - ey + ey * 2 * t; blade(bx, by, bx + Math.cos(sa) * sl, by + Math.sin(sa) * sl, 1.1, 0.4, 1.6, 1.1, () => tint(P.wood, 0.9)); }
        break;
      }
      case 'bush': {
        const n = 4 + Math.floor(3 * s);
        for (let k = 0; k < n; k++) { const aa = a + TAU * (k + 0.6 * h(10 + k, 3, 5)) / n, f = 0.8 + 0.3 * h(20 + k, 5, 3), len = 6.5 + 4 * h(30 + k, 7, 7); leaf(X + Math.cos(aa) * 0.8, Y + Math.sin(aa) * 0.8, aa, len, 3.6 + 1.6 * h(40 + k, 3, 3), 2.6, (t, e) => mix3(P.plant, P.tip, t * 0.85, f * (e < 0.18 ? 0.78 : 1 - 0.15 * e))); }
        for (let k = 0; k < 3; k++) { const aa = a + 1 + TAU * (k + 0.5 * h(50 + k, 5, 5)) / 3, f = 0.9 + 0.2 * h(60 + k, 3, 7); leaf(X, Y, aa, 4 + 1.5 * h(70 + k, 7, 3), 2.8, 3.6, (t, e) => mix3(P.plant, P.tip, 0.3 + t * 0.6, f * (e < 0.2 ? 0.8 : 1 - 0.12 * e))); }
        break;
      }
      case 'fern': {
        const n = 6 + Math.floor(3 * s);
        for (let k = 0; k < n; k++) {
          const aa = a + TAU * (k + 0.5 * h(10 + k, 3, 5)) / n, len = 7 + 5 * h(20 + k, 5, 3), f = 0.8 + 0.3 * h(30 + k, 7, 7), bend = (h(35 + k, 5, 3) - 0.5) * 0.02;
          const ux = Math.cos(aa), uy = Math.sin(aa);
          blade(X, Y, X + ux * len, Y + uy * len, 0.8, 0.3, 1.8, 1.1, t => mix3(P.plant, P.tip, t * 0.4, f * 0.75));
          for (let j = 1; j * 1.5 < len - 0.8; j++) { const t = j * 1.5 / len, bx = X + ux * j * 1.5 - uy * bend * j * j, by = Y + uy * j * 1.5 + ux * bend * j * j, ll = 3.2 * (1 - t) + 0.9;
            for (const side of [-1, 1]) leaf(bx, by, aa + side * 1.1, ll, 1.3, 1.9 - t * 0.6, (u, e) => mix3(P.plant, P.tip, 0.25 + t * 0.6, f * (1 - 0.2 * e))); }
        }
        break;
      }
      case 'roots': {
        for (let k = 0; k < 2 + Math.floor(2 * s); k++) {
          let aa = a + k * 2.2, px2 = X + (h(10 + k, 3, 5) - 0.5) * 6, py2 = Y + (h(20 + k, 5, 3) - 0.5) * 6;
          for (let j = 0; j < 3; j++) { const len = 3 + 2.5 * h(30 + k * 3 + j, 7, 5), nx = px2 + Math.cos(aa) * len, ny = py2 + Math.sin(aa) * len; blade(px2, py2, nx, ny, 2.4 - j * 0.45, 1.95 - j * 0.45, 1.6, 1.4, () => tint(P.wood, 0.85 + 0.3 * h(40 + k, 3, 3))); px2 = nx; py2 = ny; aa += (h(50 + k * 3 + j, 5, 7) - 0.5) * 1.4; }
        }
        break;
      }
      case 'ice': {
        const r = 4 + 5 * s, ice = (wx, wy, rel, k) => mix3(P.ice, P.snow, Math.min(1, rel * 0.7 + 0.25 * h(1600 + k, 3, 3)), 0.9 + 0.2 * h(1700 + k, 5, 5));
        rock(X, Y, r, r * 1.15, 5 + Math.floor(2 * h(1, 3, 3)), 0, 6.1, ice);
        for (let k = 0; k < 2; k++) if (h(3 + k, 7, 7) < 0.6) { const aa = a + 2 + k * 2, d = r + 1.5 + 2 * h(9 + k, 3, 5), rr = r * (0.3 + 0.25 * h(5 + k, 3, 3)); rock(X + Math.cos(aa) * d, Y + Math.sin(aa) * d, rr, rr * 1.2, 5, 0, 7.3 + k, ice); }
        break;
      }
      case 'twigs': {
        rock(X, Y, 3.2 + 1.5 * s, 1.5, 7, 0.4, 8.9, (wx, wy) => tint(P.snow, 0.97));
        twigs(X, Y, 7 + Math.floor(4 * s), 6 + 4 * s, 0.95, 2.6, P.wood, 900);
        break;
      }
      case 'deadbush': {
        twigs(X, Y, 8 + Math.floor(4 * s), 6 + 4 * s, 0.85, 2.3, P.wood, 1000);
        break;
      }
      case 'hatch': {
        // cut from the plating it lies in (the plateau's or the deck's), a shade lighter, a dark seam round it and a bolt at two corners
        const m = G.map, hi = m.height[p.ty * m.w + p.tx] === 2, tx2 = hi ? T.high : T.low, gT = (hi ? grade.high : grade.low) || one;
        const pw = 14 + 2 * Math.floor(4 * s), ph = 12 + 2 * Math.floor(3 * h(1, 3, 5)), x0 = Math.round(X - pw / 2), y0 = Math.round(Y - ph / 2), f = 1.12 + 0.1 * h(2, 5, 3);
        box(x0, y0, pw, ph, 0.7, 1.2, (wx, wy, ed) => { const q = texAt(tx2, wx, wy), k = ed < 1 ? 0.45 : f; C[0] = tx2[q] * gT[0] * k; C[1] = tx2[q + 1] * gT[1] * k; C[2] = tx2[q + 2] * gT[2] * k; return C; });
        for (const [bx, by] of [[x0 + 2.5, y0 + 2.5], [x0 + pw - 2.5, y0 + ph - 2.5]]) rock(bx, by, 1.1, 1.6, 6, 0.3, 11, () => tint(P.metal, 1));
        break;
      }
      case 'vent': {
        const vw = 14 + 2 * Math.floor(3 * s), vh = 10 + 2 * Math.floor(2 * h(1, 3, 3)), x0 = Math.round(X - vw / 2), y0 = Math.round(Y - vh / 2);
        box(x0, y0, vw, vh, 1, 1, (wx, wy, ed) => ed < 1.2 ? tint(P.metal, 0.7) : ((wy - L.oy - y0) % 2 < 1 ? tint(P.metal, 0.55) : tint(P.dark, 1)));
        break;
      }
      case 'cable': {
        // a long run along the plating, square-ended, clamped every ten pixels
        const len = 26 + 16 * s, dir = Math.floor(4 * h(1, 3, 3)) * Math.PI / 4, ux = Math.cos(dir), uy = Math.sin(dir);
        blade(X - ux * len / 2, Y - uy * len / 2, X + ux * len / 2, Y + uy * len / 2, 2.6, 2.6, 1.8, 1.8, () => tint(P.cable, 1), true);
        for (let d = -len / 2 + 4; d <= len / 2 - 3; d += 10) blade(X + ux * (d - 1), Y + uy * (d - 1), X + ux * (d + 1), Y + uy * (d + 1), 4, 4, 2.2, 2.2, () => tint(P.metal, 0.8), true);
        break;
      }
      case 'scrap': {
        const n = 2 + Math.floor(3 * s);
        for (let k = 0; k < n; k++) { const aa = a + k * 2.3, d = 1.5 + 6 * h(10 + k, 3, 5), r = 2.2 + 2.3 * h(20 + k, 5, 3), rust = h(30 + k, 7, 3) < 0.4, f = 0.75 + 0.4 * h(40 + k, 3, 3);
          rock(X + Math.cos(aa) * d, Y + Math.sin(aa) * d, r, 1.3, 4 + Math.floor(2 * h(50 + k, 5, 5)), 0.55, 12.5 + k, (wx, wy, rel, kk) => tint(rust ? P.rust : P.metal, f * (0.9 + 0.2 * h(1800 + kk, 3, 3)))); }
        break;
      }
    }
  },
  renderChunk(cx, cy) {
    const T = this.texSet(); if (T) return this.renderChunkTex(cx, cy, T);   // textured ground, when it is on and loaded
    const m = G.map, CH = this.CH, px = CH * TILE, k = this.bakeDpr(), W = px * k, GG = this.groundGrids(), MH = GG.height, MW = GG.walk;   // the ground under any hulk; see groundGrids
    const cv = document.createElement('canvas'); cv.width = W; cv.height = W; const x = cv.getContext('2d');
    const img = this.imageFor(x, W); const d = img.data; const ox = cx * CH * TILE, oy = cy * CH * TILE;   // reused: every pixel is written below
    const hAt = (tx, ty) => { if (!m.inb(tx, ty)) return 1; const i = m.idx(tx, ty); if (m.cliff[i] === 2) return -1; if (m.cliff[i] === 1) return 1; return MH[i] === 2 ? 1 : MH[i] === 1 ? 0.5 : 0; };
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
        if (i >= 0 && MH[i] === 1) { const rc = this.rampCol(n); col = [(col[0] + rc[0]) / 2, (col[1] + rc[1]) / 2, (col[2] + rc[2]) / 2]; }
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
      const cl = m.cliff[i], h = MH[i];
      if (cl === 1) {
        const southLow = m.inb(tx, ty + 1) && m.cliff[m.idx(tx, ty + 1)] === 0 && MH[m.idx(tx, ty + 1)] !== 2;
        const northHigh = m.inb(tx, ty - 1) && m.cliff[m.idx(tx, ty - 1)] === 0 && MH[m.idx(tx, ty - 1)] === 2;
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
        const up = m.inb(tx, ty - 1) && MH[m.idx(tx, ty - 1)] === 2, dn = m.inb(tx, ty + 1) && MH[m.idx(tx, ty + 1)] === 2, lf = m.inb(tx - 1, ty) && MH[m.idx(tx - 1, ty)] === 2 && !m.cliff[m.idx(tx - 1, ty)], rt = m.inb(tx + 1, ty) && MH[m.idx(tx + 1, ty)] === 2 && !m.cliff[m.idx(tx + 1, ty)];
        const vertical = !(lf || rt) || up || dn;
        const ramp = (ax, ay) => m.inb(ax, ay) && MH[m.idx(ax, ay)] === 1;
        const w0 = vertical ? !ramp(tx - 1, ty) : !ramp(tx, ty - 1), w1 = vertical ? !ramp(tx + 1, ty) : !ramp(tx, ty + 1);
        x.drawImage(this.rampStrip(vertical, w0, w1), lx, ly);
      } else if (h === 0 && MW[i]) { // low ground doodads
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
      } else if (h === 2 && !cl && MW[i]) { // plateau plate seams
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
  // DETAILED TERRAIN, FAR AND FAST (the terrain queue's phase 4). The overview above was the palette's, so the strategic view of a
  // textured map was a different picture from the ground; it is now painted from the textures (paintOverviewTex) whenever they
  // are loaded, and the minimap is that overview a tile a pixel. And the bake had no budget at zoom 1: a camera jump to unbaked
  // ground on The Long March was a 694 ms frame, a diagonal scroll a 179 ms one, breaking a rock formation 512 ms (measured,
  // PLAYTEST-M18 113). Now every zoom bakes the missing chunks nearest the middle of the view first, one a frame and more only while
  // the frame is under BAKE_MS, with the overview drawn under whatever is not there yet; when nothing on screen is missing, one
  // chunk of the ring round the view is baked ahead, so a scroll finds the next column ready; and a feature that changes drops
  // only the chunks round it (invalidateTiles). A web worker baking chunks off the main thread was the next step (RESEARCH-TERRAIN
  // 8.4) and was not needed: with the budget no frame measured over 50 ms.
  OVER_Z: 0.45, OVER_PX: 4, CHUNK_BUDGET: 3, BAKE_MS: 8, OVER_STEP_MS: 6,
  clearOverview() { this._over = null; this._overImg = null; this._overTex = null; this._overNext = null; },
  // The whole map at OVER_PX pixels a tile, kept as its pixels too (the minimap and a partial repaint read them). Painted from the
  // textures when they are loaded and from the palette until then. Made at once when there is none (a game's first frame); when
  // the textures arrive after the palette's was made, the textured one is painted a few rows a frame (overviewStep) and the
  // palette's serves until it is whole -- all at once, that was a 202 ms frame on The Long March.
  overview() {
    const m = G.map, K = this.OVER_PX, W = m.w * K, H = m.h * K, T = this.texSet();
    const fits = this._over && this._over.width === W && this._over.height === H && this._overSet === this.setId && this._overMap === m;
    if (fits && this.sameTex(this._overTex, T)) return this._over;
    if (fits && T && this._overImg) return this._over;   // the textured one is on its way (overviewStep, from draw)
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    this._over = cv; this._overImg = null; this._overTex = T; this._overSet = this.setId; this._overMap = m; this._overNext = null;
    if (!x) return cv;
    this._overImg = x.createImageData(W, H);
    this.paintOverview(0, 0, m.w, m.h);
    this.overRev = (this.overRev || 0) + 1;
    return cv;
  },
  // One frame's worth of the textured overview, OVER_STEP_MS of rows (at least four); swapped in, and overRev moved so the minimap
  // follows, when the last row is painted. Rows join without a seam: every row reads the map's own grids round it.
  overviewStep(T) {
    const m = G.map, K = this.OVER_PX, W = m.w * K, H = m.h * K;
    let nx = this._overNext;
    if (!nx || !this.sameTex(nx.T, T)) { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'); if (!x) return false; nx = this._overNext = { cv, x, img: x.createImageData(W, H), T, row: 0 }; }
    const t0 = performance.now();
    do { const r1 = Math.min(m.h, nx.row + 4); this.paintOverviewTex(T, nx.img, 0, nx.row, m.w, r1); nx.row = r1; } while (nx.row < m.h && performance.now() - t0 < this.OVER_STEP_MS);
    if (nx.row < m.h) return false;
    nx.x.putImageData(nx.img, 0, 0);
    this._over = nx.cv; this._overImg = nx.img; this._overTex = T; this._overNext = null; this.overRev = (this.overRev || 0) + 1;
    return true;
  },
  // Two texture sets are the same when they are made of the same pixels (texSet builds a new object each call); none equals none.
  sameTex(a, b) { return !a || !b ? !a === !b : a.low === b.low && a.high === b.high && a.ramp === b.ramp && a.rock === b.rock; },
  // Repaints tiles [tx0, tx1) x [ty0, ty1) of the overview, if there is one, and puts that rectangle back on its canvas.
  paintOverview(tx0, ty0, tx1, ty1) {
    const m = G.map, K = this.OVER_PX, cv = this._over, img = this._overImg; if (!cv || !img) return;
    tx0 = Math.max(0, tx0); ty0 = Math.max(0, ty0); tx1 = Math.min(m.w, tx1); ty1 = Math.min(m.h, ty1); if (tx1 <= tx0 || ty1 <= ty0) return;
    if (this._overTex) this.paintOverviewTex(this._overTex, img, tx0, ty0, tx1, ty1); else this.paintOverviewPal(img, tx0, ty0, tx1, ty1);
    cv.getContext('2d').putImageData(img, 0, 0, tx0 * K, ty0 * K, (tx1 - tx0) * K, (ty1 - ty0) * K);
    if (this._overNext) this._overNext.row = Math.min(this._overNext.row, ty0);   // a textured overview on its way repaints from here
  },
  // The palette's overview. Painted per TILE rather than per pixel -- one palette call
  // and one noise sample for a 4x4 block instead of sixteen of each -- which is what makes it a
  // one-off of a few milliseconds rather than the second and a half a per-pixel version would cost on
  // a 256x256 map. It still goes through posterise(), so the strategic view is made of the same
  // palette as the ground it is standing in for.
  paintOverviewPal(img, tx0, ty0, tx1, ty1) {
    const m = G.map, K = this.OVER_PX, W = m.w * K, d = img.data, col = [0, 0, 0], MH = this.groundGrids().height;
    for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
      const i = m.idx(tx, ty), cl = m.cliff[i], hh = MH[i];
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
  },
  // A texture box-filtered to one texel for every D of it, once per texture: what a chunk's pixels average to at the overview's
  // scale. Averaged in the display's own (sRGB) values, not in linear light: what the overview has to match is the chunks as the
  // browser shrinks them just above OVER_Z, and a browser filters in sRGB.
  texSmall(t, D) {
    const c = this._small || (this._small = new WeakMap()); let v = c.get(t); if (v && v.D === D) return v;
    const S = this.TEX_PX, s = S / D, px = new Float32Array(s * s * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const p = (y * S + x) * 4, o = (((y / D) | 0) * s + ((x / D) | 0)) * 3; px[o] += t[p]; px[o + 1] += t[p + 1]; px[o + 2] += t[p + 2]; }
    for (let i = 0; i < px.length; i++) px[i] /= D * D;
    v = { D, s, px }; c.set(t, v); return v;
  },
  // The strategic view from the textures: tiles [tx0, tx1) x [ty0, ty1) at OVER_PX pixels a tile, from renderChunkTex's own grids,
  // height curve, edge wander, cells, grades and sun, with each texture box-filtered to the overview's scale first -- the far view
  // is the near view seen from further off (RESEARCH-TERRAIN.md 8.3: the average of the art, in the light the art is drawn in).
  // Left out as finer than four pixels a tile: the rock zones' lumps, the seam's wobble, the rock's relief and the props (Supreme
  // Commander drops props with distance, 8.3).
  paintOverviewTex(T, img, tx0, ty0, tx1, ty1) {
    const m = G.map, K = this.OVER_PX, D = TILE / K, W = m.w * K, d = img.data, look = this.look(), grade = TERRAIN_GRADE[this.setId] || {}, one = [1, 1, 1];
    const SL = this.texSmall(T.low, D), SH = this.texSmall(T.high, D), SR = this.texSmall(T.ramp, D), SK = this.texSmall(T.rock, D), s = SL.s, S = this.TEX_PX;
    // the tile grids over the rectangle and M tiles round it, exactly as a chunk builds them
    const M = 3, gx0 = tx0 - M, gy0 = ty0 - M, GW = tx1 - tx0 + 2 * M, GHt = ty1 - ty0 + 2 * M, N = GW * GHt;
    const raw = new Float32Array(N), rz = new Float32Array(N), rpz = new Float32Array(N), wal = new Uint8Array(N), RL = this.rampLevels(), GH = this.groundGrids().height;
    for (let j = 0; j < GHt; j++) for (let i = 0; i < GW; i++) {
      const tx = gx0 + i, ty = gy0 + j, o = j * GW + i;
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) { raw[o] = 1.25; rz[o] = 1; continue; }
      const q = ty * m.w + tx, cl = m.cliff[q], h = GH[q];
      raw[o] = cl === 2 ? 1 : cl === 1 ? 0.5 : h === 2 ? 1 : h === 1 ? 0.5 : 0; rz[o] = cl === 2 ? 1 : 0; rpz[o] = !cl && h === 1 ? 1 : 0;
      if (RL[q] >= 0) { if (rpz[o]) raw[o] = RL[q]; else if (cl === 1) { raw[o] = RL[q]; rz[o] = this.RAMP_WALL_ROCK; wal[o] = 1; } }
      if (cl === 1) wal[o] |= 2;
    }
    const blur = g => { const out = new Float32Array(N); for (let j = 0; j < GHt; j++) for (let i = 0; i < GW; i++) { let sum = 0, ws = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= GW || jj >= GHt) continue; const w = (a ? 1 : 2) * (b ? 1 : 2); sum += g[jj * GW + ii] * w; ws += w; } out[j * GW + i] = sum / ws; } return out; };
    const gh = look.blur === 0 ? raw.slice() : blur(raw), gr = blur(rz);
    for (let o = 0; o < N; o++) if (wal[o] & 1) { gh[o] = raw[o]; gr[o] = rz[o]; }
    const gk = blur(rpz); for (let o = 0; o < N; o++) if (wal[o]) gk[o] = 0;
    const bil = (g, fx, fy) => { let i0 = Math.floor(fx), j0 = Math.floor(fy), u = fx - i0, v = fy - j0; if (i0 < 0) { i0 = 0; u = 0; } else if (i0 > GW - 2) { i0 = GW - 2; u = 1; } if (j0 < 0) { j0 = 0; v = 0; } else if (j0 > GHt - 2) { j0 = GHt - 2; v = 1; } const a = j0 * GW + i0; return g[a] * (1 - u) * (1 - v) + g[a + 1] * u * (1 - v) + g[a + GW] * (1 - u) * v + g[a + GW + 1] * u * v; };
    const sm = t => t * t * (3 - 2 * t);
    // the height field, per overview pixel, over the rectangle and P pixels round it
    const P = 2, px0 = tx0 * K - P, py0 = ty0 * K - P, PW = (tx1 - tx0) * K + 2 * P, PHt = (ty1 - ty0) * K + 2 * P, NP = PW * PHt;
    const hf = new Float32Array(NP), rk = new Float32Array(NP), rp = new Float32Array(NP), wn1 = new Float32Array(NP), wn2 = new Float32Array(NP);
    for (let py = 0; py < PHt; py++) for (let px = 0; px < PW; px++) {
      const o = py * PW + px, wx = (px0 + px + 0.5) * D, wy = (py0 + py + 0.5) * D;
      const n1 = this.vnoise(wx / 37, wy / 37) - 0.5, n2 = this.vnoise(wx / 37 + 17, wy / 37 + 29) - 0.5; wn1[o] = n1; wn2[o] = n2;
      const fx = (wx + n1 * look.warp) / TILE - 0.5 - gx0, fy = (wy + n2 * look.warp) / TILE - 0.5 - gy0, ex = wx / TILE - 0.5 - gx0, ey = wy / TILE - 0.5 - gy0;
      const lin = bil(gh, fx, fy), rock = bil(gr, fx, fy), pr = bil(rpz, ex, ey), kk = bil(gk, ex, ey);
      const kRamp = sm(Math.min(1, Math.max(pr, kk) * 1.5)), cliffH = sm(Math.min(1, Math.max(0, (lin - 0.5) / 0.36 + 0.5)));
      hf[o] = cliffH * (1 - kRamp) + lin * kRamp + (rock > 0.05 ? 0.22 * rock : 0); rk[o] = rock; rp[o] = pr;
    }
    const Ln = Math.hypot(0.5, 0.6, 0.62), lx = -0.5 / Ln, ly = -0.6 / Ln, lz = 0.62 / Ln, RISE = 22;
    const gLow = grade.low || one, gHigh = grade.high || one, gRamp = grade.ramp || one, gRock = grade.rock || one, mix = look.mix || 0;
    const celled = look.cells || [], cLow = celled.includes('low'), cHigh = celled.includes('high'), cRamp = celled.includes('ramp');
    const CW = this.CELL_TILES * TILE, CB = this.CELL_BAND, cellU = [0, 0, 0, 0], cellV = [0, 0, 0, 0], cellW = [0, 0, 0, 0];
    let cn = 0;
    const cellPut = (jx, jy, w) => { cellU[cn] = this.hash(jx * 7 + 3, jy * 13 + 5) * S; cellV[cn] = this.hash(jy * 11 + 1, jx * 5 + 9) * S; cellW[cn++] = w; };
    const at = (sm2, u, v) => ((((v / D) | 0) % s + s) % s * s + ((((u / D) | 0) % s + s) % s)) * 3;
    const A = [0, 0, 0], col = [0, 0, 0], tmp = [0, 0, 0];
    const mat = (sm2, g, inCells, wx, wy, q, o) => {
      const t = sm2.px;
      if (inCells) { let r = 0, gg = 0, b = 0; for (let k = 0; k < cn; k++) { const p = at(sm2, wx + cellU[k], wy + cellV[k]); r += t[p] * cellW[k]; gg += t[p + 1] * cellW[k]; b += t[p + 2] * cellW[k]; } o[0] = r * g[0]; o[1] = gg * g[1]; o[2] = b * g[2]; return; }
      let p = at(sm2, wx, wy); A[0] = t[p]; A[1] = t[p + 1]; A[2] = t[p + 2];
      if (mix) { const qq = q * mix; p = at(sm2, wy * 0.83 + 331, wx * 0.83 + 173); A[0] += (t[p] - A[0]) * qq; A[1] += (t[p + 1] - A[1]) * qq; A[2] += (t[p + 2] - A[2]) * qq; }
      o[0] = A[0] * g[0]; o[1] = A[1] * g[1]; o[2] = A[2] * g[2];
    };
    for (let py = P; py < PHt - P; py++) for (let px = P; px < PW - P; px++) {
      const o = py * PW + px, wx = (px0 + px + 0.5) * D, wy = (py0 + py + 0.5) * D, h = hf[o];
      const q = mix ? sm(Math.min(1, Math.max(0, (this.vnoise(wx / 230, wy / 230) - 0.3) / 0.4))) : 0;
      const dxh = (hf[o + 1] - hf[o - 1]) / (2 * D), dyh = (hf[o + PW] - hf[o - PW]) / (2 * D), steep = Math.sqrt(dxh * dxh + dyh * dyh);
      if (celled.length) {
        const gx = wx / CW + wn1[o] * 0.5, gy = wy / CW + wn2[o] * 0.5, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
        const nx = fx < CB ? -1 : fx > 1 - CB ? 1 : 0, ny = fy < CB ? -1 : fy > 1 - CB ? 1 : 0;
        const wX = nx ? 0.5 * sm(1 - (nx < 0 ? fx : 1 - fx) / CB) : 0, wY = ny ? 0.5 * sm(1 - (ny < 0 ? fy : 1 - fy) / CB) : 0;
        cn = 0; cellPut(ix, iy, (1 - wX) * (1 - wY)); if (nx) cellPut(ix + nx, iy, wX * (1 - wY)); if (ny) cellPut(ix, iy + ny, (1 - wX) * wY); if (nx && ny) cellPut(ix + nx, iy + ny, wX * wY);
      }
      const tH = sm(Math.min(1, Math.max(0, (h - 0.3) / 0.35)));
      mat(SL, gLow, cLow, wx, wy, q, col);
      if (tH > 0) { mat(SH, gHigh, cHigh, wx, wy, q, tmp); const gl = look.grit; for (let k = 0; k < 3; k++) col[k] += (tmp[k] * (1 - gl) + col[k] * gl * 1.3 - col[k]) * tH; }
      const pr = rp[o]; if (pr > 0.02) { mat(SR, gRamp, cRamp, wx, wy, q, tmp); const kp = sm(Math.min(1, pr * 1.3)) * (look.tracks === undefined ? this.RAMP_TRACKS : look.tracks); for (let k = 0; k < 3; k++) col[k] += (tmp[k] - col[k]) * kp; }
      const kr = Math.max(sm(Math.min(1, Math.max(0, (steep - 0.016) / 0.02))) * (pr > 0.35 ? 0 : 1), sm(Math.min(1, rk[o] * 1.3)));
      if (kr > 0.02) { const p = at(SK, wx, wy * look.squeeze); for (let k = 0; k < 3; k++) col[k] += (SK.px[p + k] * gRock[k] - col[k]) * kr; }
      const sx = dxh * RISE, sy = dyh * RISE;
      let shade = (-sx * lx - sy * ly + lz) / Math.sqrt(sx * sx + sy * sy + 1) / lz; shade = shade < 0.5 ? 0.5 : shade > 1.35 ? 1.35 : shade;
      // the cast shadow reads the height 9 px left and 11 px up of the pixel, as a chunk does
      const sxp = px - 9 / D, syp = py - 11 / D, i0 = Math.floor(sxp), j0 = Math.floor(syp), u = sxp - i0, v = syp - j0, a0 = j0 * PW + i0;
      const upH = hf[a0] * (1 - u) * (1 - v) + hf[a0 + 1] * u * (1 - v) + hf[a0 + PW] * (1 - u) * v + hf[a0 + PW + 1] * u * v, up = upH - h;
      if (up > 0.08) shade *= 1 - Math.min(0.32, (up - 0.08) * 0.7);
      shade *= 0.94 + (this.vnoise(wx / 150 + 40, wy / 150 + 40) - 0.5) * 0.18;
      const oo = ((py0 + py) * W + px0 + px) * 4, r = col[0] * shade, g = col[1] * shade, b = col[2] * shade;
      d[oo] = r > 255 ? 255 : r; d[oo + 1] = g > 255 ? 255 : g; d[oo + 2] = b > 255 ? 255 : b; d[oo + 3] = 255;
    }
  },
  // A feature changed the ground under tiles (tx, ty, w, h). Drop the chunks that read them: a chunk reads three tiles past its
  // own edge, and a ramp's levels (rampLevels) can move along the whole ramp, so a chunk's width of margin. Repaint that part of
  // the overview. Everything else stays baked: clearing the whole cache here made breaking one rock formation on The Long March a
  // 512 ms frame.
  invalidateTiles(tx, ty, w, h) {
    const CH = this.CH, R = CH, cx0 = Math.floor((tx - R) / CH), cx1 = Math.floor((tx + w - 1 + R) / CH), cy0 = Math.floor((ty - R) / CH), cy1 = Math.floor((ty + h - 1 + R) / CH);
    let n = 0; for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const k = cx + ',' + cy, c = this.chunks.get(k); if (c) { this.releaseChunk(c); this.chunks.delete(k); n++; } }
    this.paintOverview(tx - R, ty - R, tx + w + R, ty + h + R);
    return n;
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
    // The palette's overview nearest neighbour: chunky and crisp beats soft and vague, and its dither is made of whole pixels. The
    // textures' filtered: a photograph blown up in blocks read as a mosaic (judged at zoom 0.4 and under chunks still baking).
    ctx.save(); ctx.imageSmoothingEnabled = this._overTex ? true : false;
    ctx.drawImage(cv, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 / P - camX, sy0 / P - camY, (sx1 - sx0) / P, (sy1 - sy0) / P);
    ctx.restore();
  },
  // SHARP GROUND (the user's playtest, 2026-09-13: "The resolution of the land and doodads is a bit low, can we increase its resolution
  // without ruining performance?"). Measured on their display, devicePixelRatio 1.5: the page drew everything at 1x and the browser
  // stretched it, so a ground sample covered 2.25 screen pixels, and the textures were read at 512 of their files' 1024 texels. The
  // canvas now takes the display's real ratio for detailed terrain (Render.resize), and a textured chunk can be baked at any ratio
  // (texBakeSteps) -- but at ratio 2 a bake costs four times as much, a median 39 ms against 10 for the same loops at ratio 1 in the
  // browser (.claude/review/terrain/sharp-baseline.log), and baking chunks that way as they came into view would stutter every scroll.
  // So a missing chunk is still baked at ratio 1, as fast as ever; and once nothing in view is missing, the chunk in view nearest the
  // middle that is coarser than the display can show -- sharpK: the least of SHARP_KS covering the device pixels a world pixel spans at
  // this zoom -- is baked again at that ratio for REFINE_MS of a frame at a time (the bake yields every row) and swapped in whole when
  // it is done. Coarse at once and the detail a moment later is the trade Unity's mipmap streaming makes. On a 1x display at zoom 1
  // there is nothing to refine, and nothing about the ground changes; zoomed in, a 1x display gets sharper ground too.
  REFINE_MS: 8, SHARP_KS: [1, 1.5, 2],
  sharpK(zoom) { const need = zoom * ((typeof Render !== 'undefined' && Render.dpr) || 1), ks = this.SHARP_KS; for (const k of ks) if (k >= need - 1e-6) return k; return ks[ks.length - 1]; },
  // One frame's step of sharpening, or false when there is nothing to do (and draw goes on to bake the ring ahead). A job belongs to a
  // chunk as it stood: when the chunk is dropped or baked again, the map, the ratio or the textures change, the job is dropped too.
  refine(zoom, cx0, cx1, cy0, cy1, mx, my) {
    const K = this.sharpK(zoom); if (K <= 1) { this._job = null; return false; }
    const T = this.texSet(Math.round(this.TEX_PX * K)); if (!T) return !!this._texMade;
    const j0 = this._job;
    if (j0 && (j0.map !== G.map || j0.K !== K || this.chunks.get(j0.key) !== j0.base || !this.sameTex(j0.T, T))) this._job = null;
    if (!this._job) {
      let best = null, bd = 0;
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks.get(cx + ',' + cy); if (!c || !c.tex || (c.k || 1) >= K) continue;
        const dd = (cx - mx) * (cx - mx) + (cy - my) * (cy - my); if (!best || dd < bd) { best = [cx, cy, c]; bd = dd; }
      }
      if (!best) return false;
      this._job = { key: best[0] + ',' + best[1], base: best[2], K, T, map: G.map, it: this.texBakeSteps(best[0], best[1], T, K, 'job') };
    }
    const j = this._job, t0 = performance.now();
    do { const r = j.it.next(); if (r.done) { this.releaseChunk(j.base); this.chunks.set(j.key, r.value); this._job = null; this.sharpened = (this.sharpened || 0) + 1; break; } } while (performance.now() - t0 < this.REFINE_MS);
    return true;
  },
  // THE FIRST FRAME A PLAYER SEES IS THE FINISHED GROUND (the user's playtest, 2026-09-14: "when the game first loads I see the old
  // textures and then the new textures load in after a second and a half delay. This looks super unprofessional, I can't ship like
  // this."). Measured on a cold start of Blood Pit (.claude/review/terrain/shots/cold-start-strip.jpg): the classic ground on screen from
  // 130 ms, detailed chunks replacing it piece by piece from 458 ms, all of it detailed at about 930 ms -- the textures were only asked
  // for by the game's first frame, and the minimap and the far view followed later still. The playtest server reads every file out of
  // git as it is asked for, which made the user's second and a half.
  //
  // A game now starts behind a loading screen (UI.start, UI.loop, UI.drawPrep) while this job runs, and the simulation waits for it --
  // in a network game the lockstep holds everyone at the first frames until each has loaded, which is how loading screens work in the
  // games this follows. Its steps, each a slice of a frame so the loading screen keeps moving: the set's textures loaded and decoded off
  // the main thread (MDN: decode() "returns a Promise that resolves once the image is decoded"), their pixels made, the textured far view
  // painted, the minimap built from it, the sharp texture set made (see refine), every chunk of the start view baked at the display's own
  // ratio, and its creep. The first frame after it draws nothing new: no classic ground, no piece of ground arriving, no sharpening. The
  // files themselves are fetched while the player is still in the menus (preloadTextures). A texture that fails, or takes PREP_WAIT_MS,
  // gives up the wait: the ground is the classic look, and the game starts rather than hanging on a loading screen.
  PREP_MS: 20, PREP_WAIT_MS: 20000,
  // Where textures can load and a loading screen means something: a browser, or the desktop app's. The headless suites have an Image
  // that never loads, and there a game starts at once, as it always did.
  canPrepare() { return typeof Image === 'function' && !!Image.prototype && typeof Image.prototype.decode === 'function' && typeof document !== 'undefined'; },
  prepare() { const job = { progress: 0, label: 'Loading', done: false, failed: false, t0: performance.now() }; job.it = this.prepSteps(job); return job; },
  // Runs the job for at most ms of this frame, or until it asks to wait for a download; true once it is done.
  prepRun(job, ms) {
    const t0 = performance.now();
    while (!job.done) {
      const r = job.it.next();
      if (r.done) { job.done = true; job.progress = 1; break; }
      if (r.value === 'wait' || performance.now() - t0 >= ms) break;
    }
    return job.done;
  },
  // The chunks in the start view, nearest its middle first, exactly as draw would find them.
  viewChunkList() {
    const C = this.CH * TILE, z = (typeof Render !== 'undefined' && Render.zoom) || 1, vw = Render.viewW / z, vh = Render.viewH / z, camX = Render.camX, camY = Render.camY;
    const maxCx = Math.ceil(G.map.w / this.CH), maxCy = Math.ceil(G.map.h / this.CH);
    const cx0 = Math.max(0, Math.floor(camX / C)), cx1 = Math.min(maxCx - 1, Math.floor((camX + vw) / C)), cy0 = Math.max(0, Math.floor(camY / C)), cy1 = Math.min(maxCy - 1, Math.floor((camY + vh) / C));
    const mx = (camX + vw / 2) / C - 0.5, my = (camY + vh / 2) / C - 0.5, out = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) out.push([cx, cy]);
    return out.sort((a, b) => (a[0] - mx) * (a[0] - mx) + (a[1] - my) * (a[1] - my) - (b[0] - mx) * (b[0] - mx) - (b[1] - my) * (b[1] - my));
  },
  *prepSteps(job) {
    const m = G.map, spec = this.textured && TERRAIN_TEX[this.setId];
    let T = null;
    if (spec && this.canPrepare()) {
      const urls = Object.values(spec), t0 = performance.now();
      job.label = 'Loading terrain';
      for (const u of urls) this.texEntry(u);
      // loaded, then decoded off the main thread; a texture already drawn once is decoded already
      for (;;) {
        for (const u of urls) { const e = this._tex[u]; if (e.ok && !e.decoded) { e.decoded = 'pending'; const d = e.img.decode ? e.img.decode() : null; if (d && d.then) d.then(() => { e.decoded = 'yes'; }, () => { e.decoded = 'yes'; }); else e.decoded = 'yes'; } }
        const ready = urls.filter(u => this._tex[u].decoded === 'yes').length;
        job.progress = 0.35 * ready / urls.length;
        if (ready === urls.length) break;
        if (urls.some(u => this._tex[u].failed) || performance.now() - t0 > this.PREP_WAIT_MS) { job.failed = true; break; }
        yield 'wait';
      }
      if (!job.failed) { job.label = 'Preparing terrain'; let n = 0; while (!(T = this.texSet(this.TEX_PX, true))) { job.progress = 0.35 + Math.min(0.1, 0.02 * n++); yield; } }
    }
    // the far view, painted a slice at a time from the textures (or the palette's, at once: it is quick)
    job.label = 'Painting the map'; job.progress = T ? 0.45 : 0.1; this.clearOverview();
    if (T) {
      while (!this.overviewStep(T)) { job.progress = 0.45 + 0.15 * ((this._overNext ? this._overNext.row : m.h) / m.h); yield; }
      this._overSet = this.setId; this._overMap = m;
    } else { this.overview(); yield; }
    // the fog canvas and the minimap, from that picture
    if (typeof Render !== 'undefined' && Render.buildStatic) { Render.buildStatic(); Render._overRev = this.overRev; }
    job.progress = T ? 0.62 : 0.3; yield;
    // the sharp texture set, for the start view at the display's ratio
    const K = T ? this.sharpK((typeof Render !== 'undefined' && Render.zoom) || 1) : 1; let TK = T;
    if (T && K > 1) { job.label = 'Sharpening terrain'; let n = 0; while (!(TK = this.texSet(Math.round(this.TEX_PX * K)))) { job.progress = 0.62 + Math.min(0.08, 0.004 * n++); yield; } }
    // every chunk in the start view, sharp, before the first frame
    this.checkDpr();
    const list = this.viewChunkList(); let n = 0;
    job.label = 'Placing the ground';
    for (const [cx, cy] of list) {
      const key = cx + ',' + cy;
      if (TK) { const it = this.texBakeSteps(cx, cy, TK, K, 'prep'); let r; while (!(r = it.next()).done) yield; this.releaseChunk(this.chunks.get(key)); this.chunks.set(key, r.value); }
      else { this.releaseChunk(this.chunks.get(key)); this.chunks.set(key, this.renderChunk(cx, cy)); yield; }
      job.progress = (T ? 0.7 : 0.3) + (T ? 0.27 : 0.65) * (++n / list.length);
    }
    // and the creep on it
    if (this.syncCreep()) { const b = this.creepBudget; this.creepBudget = 1e9; for (const [cx, cy] of list) { this.creepChunk(cx, cy); yield; } this.creepBudget = b; }
    job.label = 'Ready'; job.progress = 1;
  },
  draw(ctx, camX, camY, vw, vh, zoom = 1) {
    const CH = this.CH * TILE; const x0 = Math.floor(camX / CH), y0 = Math.floor(camY / CH), x1 = Math.floor((camX + vw) / CH), y1 = Math.floor((camY + vh) / CH);
    const maxCx = Math.ceil(G.map.w / this.CH), maxCy = Math.ceil(G.map.h / this.CH);   // both axes: a 64x128 editor map lost its lower chunk rows to a clamp on the width (REVIEW-M17)
    // the overview is a palette one and the textures are here: its textured successor is painted a step at a time
    const T = this.texSet(), upgrade = !!(T && this._over && this._overImg && !this._overTex && this._overMap === G.map);
    if (zoom < this.OVER_Z) { this.drawOverview(ctx, camX, camY, vw, vh); if (upgrade) this.overviewStep(T); return; }
    this.checkDpr();
    // Blit on whole pixels. A chunk landed at a fractional offset goes through the bilinear filter, and
    // what that filter removes first is exactly the 1 px ordered dither the posterise pass above put in
    // -- half a pixel of camera offset undoes the period look on the whole screen. `centerOn` and a
    // minimap click both produce a fractional camera, so this is not a hypothetical. Every chunk shifts
    // by the same rounded amount, since their origins are all multiples of CH, so there are no seams.
    // Only at zoom 1: at any other zoom the blit is resampled regardless, and rounding the camera in
    // world units would make the ground jitter by up to a whole pixel per scroll step instead.
    // Rounded to a DEVICE pixel: detailed terrain draws at the display's real ratio, 1.5 on many displays (Render.resize), and a chunk
    // is then CH x 1.5 device pixels -- a whole number -- so every chunk still lands exact. At a whole ratio this is what it was.
    const dq = zoom === 1 ? ((typeof Render !== 'undefined' && Render.dpr) || 1) : 0;
    const ox = dq ? Math.round(camX * dq) / dq : camX, oy = dq ? Math.round(camY * dq) / dq : camY;
    // AT ANY OTHER ZOOM EACH CHUNK IS DRAWN ONE DEVICE PIXEL WIDER AND TALLER THAN IT IS (the user's playtest, 2026-09-13: "why do I
    // see dark tile lines in a grid?"). Resampled, a chunk's edges land between device pixels, so the pixel on a boundary is only
    // partly covered by each of the two chunks either side of it, and the frame's dark fill shows through: a dark line every eight
    // tiles. Measured in the browser on Blood Pit at the user's zoom, 0.80 (.claude/review/terrain/seam-probe.js): all 12 boundaries
    // in view, up to 16 levels darker than the ground beside them (the classic look 24); at 0.6 and 1.5 the same; at zoom 1 none.
    // One device pixel over, a chunk covers its boundary pixels whole and the next chunk -- to its right, then below it, the order the
    // loop below draws them in -- is laid over its share: no boundary more than a level darker than the ground beside it at 0.45, 0.6,
    // 0.8, 1.5 or 2.6. The stretch is a pixel in two hundred and cannot be seen. Not at zoom 1, where the blit is already exact and a
    // stretch would blur the palette's dither. Creep is blitted the same way and showed no seam that could be measured.
    const over = zoom === 1 ? 0 : 1 / (zoom * ((typeof Render !== 'undefined' && Render.dpr) || 1));
    const cx0 = Math.max(0, x0), cx1 = Math.min(maxCx - 1, x1), cy0 = Math.max(0, y0), cy1 = Math.min(maxCy - 1, y1);
    // The budget (see OVER_Z above). Missing chunks nearest the middle of the view first; at least one a frame, at most CHUNK_BUDGET,
    // and a second or third only while the frame has spent under BAKE_MS. The Map lookups are a hundred-odd hash hits and free next
    // to one bake.
    const t0 = performance.now(), mx = (camX + vw / 2) / CH - 0.5, my = (camY + vh / 2) / CH - 0.5, near = (a, b) => (a[0] - mx) * (a[0] - mx) + (a[1] - my) * (a[1] - my) - (b[0] - mx) * (b[0] - mx) - (b[1] - my) * (b[1] - my);
    const missing = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (!this.chunks.has(cx + ',' + cy)) missing.push([cx, cy]);
    let baked = 0;
    if (missing.length) {
      missing.sort(near);
      for (const [cx, cy] of missing) { if (baked >= this.CHUNK_BUDGET || (baked && performance.now() - t0 >= this.BAKE_MS)) break; this.chunks.set(cx + ',' + cy, this.renderChunk(cx, cy)); baked++; }
      if (baked < missing.length) this.drawOverview(ctx, camX, camY, vw, vh);   // under whatever is still missing
    } else if (upgrade) {
      this.overviewStep(T);   // nothing on screen missing: a step of the textured overview before any chunk ahead
    } else if (this.refine(zoom, cx0, cx1, cy0, cy1, mx, my)) {
      // nothing missing and the overview whole: a step of a sharper chunk in view (see refine), before any chunk ahead
    } else if ((cx1 - cx0 + 3) * (cy1 - cy0 + 3) <= this.CHUNK_CAP) {
      // Everything on screen is baked: bake one chunk of the ring round the view, nearest first. Only while the view and its whole
      // ring fit under CHUNK_CAP -- zoomed out on a big display they do not, and a ring chunk baked only to be evicted by trim()
      // would be a bake every frame for ever.
      let best = null;
      for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
        if (cx < 0 || cy < 0 || cx >= maxCx || cy >= maxCy || (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) || this.chunks.has(cx + ',' + cy)) continue;
        if (!best || near([cx, cy], best) < 0) best = [cx, cy];
      }
      if (best) { this.chunks.set(best[0] + ',' + best[1], this.renderChunk(best[0], best[1])); this.ahead = (this.ahead || 0) + 1; }
    }
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = cx + ',' + cy, c = this.chunks.get(key); if (!c) continue;
      this.chunks.delete(key); this.chunks.set(key, c);        // to the back of the eviction order; see CHUNK_CAP
      ctx.drawImage(c, cx * CH - ox, cy * CH - oy, CH + over, CH + over);   // source is CH*dpr wide; destination stays in CSS pixels
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
    // Detailed terrain: the textured overview, OVER_PX x OVER_PX pixels averaged to one a tile, so the minimap is the ground.
    const ov = this.texSet() && this.overview() && this._overTex && this._overImg;
    if (ov) {
      const K = this.OVER_PX, W = m.w * K, s = ov.data, n = K * K;
      for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) {
        let r = 0, g = 0, b = 0; for (let p = 0; p < K; p++) for (let q = 0; q < K; q++) { const o = ((ty * K + p) * W + tx * K + q) * 4; r += s[o]; g += s[o + 1]; b += s[o + 2]; }
        const o = (ty * m.w + tx) * 4; d[o] = r / n; d[o + 1] = g / n; d[o + 2] = b / n; d[o + 3] = 255;
      }
      x.putImageData(img, 0, 0); this.mini = cv; return cv;
    }
    // The tileset's own palette, the way overview() derives it -- these were five badlands browns, so the
    // minimap of an ice or jungle map was a brown map of a white one. (REVIEW-M17)
    const P = this.pal, cols = { rock: P.rock(0.6), slope: P.slope(0.65), high: P.high(0.5, 0), ramp: P.ramp(0.5), low: P.low(0.5, 0) }, MH = this.groundGrids().height;
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) { const i = m.idx(tx, ty); let c; if (m.cliff[i] === 2) c = cols.rock; else if (m.cliff[i] === 1) c = cols.slope; else if (MH[i] === 2) c = cols.high; else if (MH[i] === 1) c = cols.ramp; else c = cols.low; const o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
    x.putImageData(img, 0, 0); this.mini = cv; return cv;
  },
};
