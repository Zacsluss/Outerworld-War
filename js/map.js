'use strict';
// ============================================================================
// Map: terrain grid, cliffs/ramps, resources, creep, psi power, placement.
// height: 0 low ground, 1 ramp, 2 high ground. walk: 1 walkable.
// ============================================================================
// Map layouts. Coordinates are quadrant-0 tiles, mirrored 4-fold -- or, on a layout with `sym: 'rot2'`, tiles anywhere on the map, each
// painted where it is and turned half round the centre (a two-player map, as StarCraft II's are: GameMap.sym). Mains listed first.
// high and rocks are shapes (GameMap.shape): ['rect', x, y, w, h], ['ellipse', cx, cy, rx, ry], ['poly', x0, y0, x1, y1, ...] or
// ['line', x0, y0, x1, y1, ..., width]. A base either lists its minerals and geyser or gives `face` ('nw' 'ne' 'sw' 'se', the side
// its mineral line is on) and `patches`, and is laid out by MapModes.base.
const MAP_LAYOUTS = {
  // THE LOOKS QUEUE, item 4, in the user's words: "All of the maps are very uninspired. Look at images of actual StarCraft II maps and
  // redesign the layout of all maps in the game according to the generalized structure that StarCraft II maps have." Every layout here
  // and in MAP_SIZES now follows that structure (.claude/review/maps/research-brief.md, RESEARCH-TERRAIN.md 8.14): a main on high ground
  // with one ramp down to a natural, the natural behind one choke, a choice of thirds, later bases further out and more exposed, a middle
  // broken into lanes by rock, and destructible rocks on the back doors. Two-player maps are turned half round the centre (sym 'rot2'), as
  // StarCraft II's are; four-player maps are mirrored four ways. Before, every map was a corner plateau and a few ellipses mirrored four
  // ways -- two-player maps too, whose two empty corners held nobody (.claude/review/maps/shots/valley.png and the rest).
  //
  // LOST RUINS, after StarCraft II's Lost Temple: the main's ramp runs east, along the top of the map, to a natural beside the main; a
  // linear third below the main, and a narrow path to it from the natural under the main's cliff that rocks close; a ruined temple on high ground in the middle with a rich base
  // (5000 a patch) on each of its corners, climbed by a wide ramp in the middle of each side; broken pillars through the middle ground.
  temple: { name: 'Lost Ruins', players: 4, startOrder: [0, 3, 1, 2],
    high: [['poly', 2, 2, 28, 2, 28, 18, 22, 25, 2, 25], ['poly', 46, 51, 51, 46, 58, 44, 64, 44, 64, 64, 44, 64, 44, 58]],
    ramps: [[26, 11, 6, 4], [40, 60, 6, 4], [60, 40, 4, 6]],
    rocks: [['poly', 23, 26, 29, 19, 34, 18, 37, 24, 33, 31, 26, 32], ['poly', 52, 2, 58, 2, 60, 10, 55, 16, 50, 12],
      ['poly', 2, 52, 10, 50, 18, 53, 20, 57, 12, 60, 2, 58], ['poly', 26, 40, 32, 36, 38, 38, 38, 45, 31, 47],
      ['ellipse', 44, 30, 2.5, 3], ['ellipse', 52, 36, 2, 2.5], ['ellipse', 30, 54, 3, 2]],
    features: [{ kind: 'rocks', x: 24, y: 22, w: 2, h: 2 }],
    bases: [
      { hall: [10, 9], face: 'nw', main: true },
      { hall: [40, 8], face: 'ne', patches: 7, natural: true },
      { hall: [8, 41], face: 'sw', patches: 7 },
      { hall: [54, 53], face: 'sw', patches: 6, rich: true },
    ] },
  // BLOOD PIT: close corners and a pit in the middle -- a ring of rock round the centre, open at its west and east gates and shut by rocks
  // at its north and south ones, and inside it four rich bases on the open floor for whoever can hold them. Each corner: a main up a ramp,
  // a natural below it behind a choke, a third along the top or bottom edge.
  bloodbath: { name: 'Blood Pit', players: 4, startOrder: [0, 3, 1, 2],
    high: [['poly', 2, 2, 26, 2, 26, 16, 20, 23, 2, 23]],
    ramps: [[13, 21, 4, 6]],
    rocks: [['line', 36, 58, 37, 50, 41, 43, 47, 38, 55, 35, 58, 35, 4],
      ['poly', 20, 24, 26, 17, 31, 16, 34, 22, 30, 29, 24, 30], ['poly', 38, 16, 46, 14, 54, 15, 58, 20, 50, 24, 41, 23],
      ['poly', 2, 42, 12, 40, 20, 44, 18, 50, 8, 52, 2, 51], ['ellipse', 30, 40, 2.5, 2], ['ellipse', 24, 58, 2, 3]],
    features: [{ kind: 'rocks', x: 59, y: 33, w: 5, h: 4 }],
    bases: [
      { hall: [9, 9], face: 'nw', main: true },
      { hall: [8, 31], face: 'sw', patches: 7, natural: true },
      { hall: [38, 7], face: 'ne', patches: 6 },
      { hall: [48, 48], face: 'nw', patches: 6, rich: true },
    ] },
  // TWILIGHT VALLEY, the standard one-against-one map: mains in opposite corners; the natural under the main's ramp, walled to the east;
  // a triangle third walled off along the north edge and a linear third down the west edge behind a back door that rocks close; a fourth in
  // the far corner, a fifth along the north edge, a rich base past the western lane; a watch hill in the middle, climbed from north and south,
  // and rock masses turning round it into three lanes.
  valley: { name: 'Twilight Valley', players: 2, sym: 'rot2', startOrder: [0, 1],
    high: [['poly', 2, 2, 41, 2, 41, 11, 36, 18, 31, 26, 2, 26], ['poly', 55, 58, 63, 54, 72, 56, 73, 66, 64, 72, 55, 69]],
    ramps: [[19, 24, 4, 6], [61, 52, 4, 5]],
    rocks: [['poly', 7, 51, 12, 49, 24, 52, 33, 49, 39, 55, 34, 60, 22, 62, 10, 60, 7, 62],
      ['poly', 32, 27, 38, 19, 43, 12, 49, 9, 53, 14, 54, 23, 49, 31, 45, 37, 38, 40, 34, 35],
      ['poly', 57, 22, 67, 19, 76, 17, 84, 20, 88, 27, 80, 31, 68, 31, 60, 32],
      ['poly', 49, 45, 55, 40, 61, 41, 66, 46, 62, 51, 54, 53],
      ['poly', 18, 76, 25, 71, 32, 73, 36, 81, 31, 86, 23, 85], ['poly', 41, 65, 47, 61, 52, 64, 55, 72, 50, 79, 44, 78],
      ['poly', 59, 86, 67, 82, 76, 83, 79, 89, 72, 94, 63, 93], ['poly', 88, 39, 95, 34, 101, 38, 102, 46, 95, 50, 89, 47],
      ['ellipse', 24, 96, 2.5, 2], ['ellipse', 50, 100, 2, 2.5], ['ellipse', 72, 44, 2, 1.5], ['ellipse', 84, 58, 2, 2]],
    features: [{ kind: 'rocks', x: 2, y: 55, w: 5, h: 3 }],
    bases: [
      { hall: [12, 10], face: 'nw', main: true },
      { hall: [10, 38], face: 'sw', natural: true },
      { hall: [10, 72], face: 'nw', patches: 7 },
      { hall: [64, 8], face: 'ne', patches: 7 },
      { hall: [10, 106], face: 'sw', patches: 7 },
      { hall: [100, 8], face: 'ne', patches: 6 },
      { hall: [34, 102], face: 'sw', patches: 6, rich: true },
    ] },
};
// Run-length codec for the editor's tile grids: "2x40,0x88,..." keeps a 128x128 map a few hundred bytes.
const MapCodec = {
  encode(arr) { let out = '', v = arr[0], n = 0; for (let i = 0; i < arr.length; i++) { if (arr[i] === v) { n++; continue; } out += v + 'x' + n + ','; v = arr[i]; n = 1; } return out + v + 'x' + n; },
  decode(s, len) { const out = new Uint8Array(len); if (!s) return out; let i = 0; for (const part of String(s).split(',')) { const [v, n] = part.split('x'); const val = +v, cnt = +n; for (let k = 0; k < cnt && i < len; k++) out[i++] = val; } return out; },
};

// Tilesets a map can declare. The palettes themselves live in js/terrain.js, but the list belongs here
// so the editor and the headless harnesses can offer them without loading the renderer.
const TILESET_IDS = ['badlands', 'jungle', 'ice', 'desert', 'space'];
const TILESET_NAMES = { badlands: 'Badlands', jungle: 'Jungle', ice: 'Ice', desert: 'Desert', space: 'Space Platform' };

// ============================================================================
// Map sizes as MODES. Four sizes that are different rules, not four tile counts.
// ============================================================================
// A bigger map that is only bigger changes nothing: the same two bases, the same timings, more empty
// ground between them. What actually decides how a match plays is how much you can mine without
// leaving home and how long it takes to reach anyone -- so each size moves five things at once, and
// they move together:
//
//   size    tiles      players  bases/player  patch  gas   spawns apart  terrain
//   small    96x96        2         3         2000  6000    103 tiles    a main up a ramp, a watch hill; turned half round
//   medium  128x128       4         4         1500  5000    149 tiles    a main up a ramp, a central plateau of four bases
//   large   192x192       4         7         1500  5000    236 tiles    ...a high pod each, and a central plateau of four
//   huge    256x256       4         8         1300  4000    323 tiles    ...a high pod each, and a great central plateau
//
// "spawns apart" is the first two spawn points, straight: the start order puts them on the diagonal on every size.
//
// Read down the columns rather than across. Every size has StarCraft II's skeleton (see MAP_LAYOUTS): a main on high ground with one
// ramp down to a natural behind a choke, thirds beyond it, the middle broken into lanes by rock, back doors shut by destructible rocks.
//
//   * SMALL is a short duel: two mains turned half round the centre, each with a natural and one third along the north or south edge, a
//     watch hill between them. It used to have no high ground at all and a main-to-main walk a third of medium's; the skeleton gives it a
//     ramp to hold, and the walk is still the shortest of the four. The mains are fat -- nine patches at 2000, 18,000 minerals, half again
//     what a medium main holds -- so a game on three bases lasts long enough to be a game.
//   * MEDIUM is the historical rules -- four players, 1500 a patch, the numbers the balance runs in this repository were measured
//     against -- on a new map: main, natural and a third along the edge, and a fourth on a central plateau that every player can climb to.
//   * LARGE gives each player seven bases: two thirds to choose between, a fourth on a high pod in the broken middle ground, a sixth out by
//     the neighbour, and the fifth ON the central plateau. That fifth was once at 66,66 on the low ground below, so the plateau was high
//     ground that held nothing, cost nothing to give up and was worth taking only for the view; a base up there makes taking high ground an
//     economic decision and holding it an army commitment -- the difference between terrain that is a tactical asset and scenery.
//   * HUGE gives eight, at 1300 a patch rather than 1500: a player's whole territory is worth about what large's is (66,300 minerals
//     against 67,500), spread over more bases that run dry sooner, so standing still is losing even when nobody is shooting at you. That,
//     and the longest walks of the four, is what makes travel time a decision rather than a loading screen.
//
// The one thing that is NOT a rule difference: unit stats. Nothing here touches js/data.js.
const MAP_SIZES = {
  small: {
    name: 'Close Quarters', w: 96, h: 96, players: 2, tileset: 'badlands', startOrder: [0, 1], sym: 'rot2',
    patch: 2000, gas: 6000, patches: { main: 9, natural: 7, expo: 7 },
    bases: [{ x: 11, y: 9, role: 'main', face: 'nw' }, { x: 9, y: 33, role: 'natural', face: 'sw' }, { x: 52, y: 8, role: 'expo', face: 'ne' }],
    high: [['poly', 2, 2, 32, 2, 32, 12, 26, 22, 2, 22], ['ellipse', 47.5, 47.5, 7, 5]],
    ramps: [[14, 20, 4, 6], [46, 41, 4, 4]],
    rocks: [['poly', 26, 23, 34, 12, 40, 12, 42, 24, 34, 32], ['poly', 6, 44, 18, 42, 26, 46, 20, 52, 6, 52],
      ['poly', 44, 18, 60, 16, 62, 24, 48, 28], ['poly', 30, 56, 40, 52, 44, 62, 34, 68], ['poly', 10, 66, 18, 64, 22, 72, 14, 76, 8, 72]],
    features: [{ kind: 'rocks', x: 2, y: 46, w: 4, h: 3 }],
  },
  medium: {
    name: 'Contested Ground', w: 128, h: 128, players: 4, tileset: 'jungle', startOrder: [0, 3, 1, 2],
    patch: 1500, gas: 5000, patches: { main: 8, natural: 7, expo: 6 },
    bases: [{ x: 10, y: 9, role: 'main', face: 'nw' }, { x: 9, y: 33, role: 'natural', face: 'sw' },
      { x: 44, y: 8, role: 'expo', face: 'ne' }, { x: 52, y: 52, role: 'expo', face: 'nw' }],
    high: [['poly', 2, 2, 30, 2, 30, 14, 24, 22, 2, 22], ['poly', 46, 46, 64, 46, 64, 64, 46, 64]],
    ramps: [[12, 20, 4, 6], [40, 61, 7, 3], [61, 40, 3, 7]],
    rocks: [['poly', 24, 23, 32, 12, 38, 12, 40, 26, 30, 32], ['poly', 6, 44, 16, 42, 24, 46, 18, 52, 6, 52],
      ['poly', 40, 16, 58, 14, 60, 22, 44, 26], ['poly', 28, 38, 38, 34, 42, 42, 32, 46]],
    features: [{ kind: 'rocks', x: 2, y: 46, w: 4, h: 3 }],
  },
  large: {
    name: 'Broken Expanse', w: 192, h: 192, players: 4, tileset: 'badlands', startOrder: [0, 3, 1, 2],
    patch: 1500, gas: 5000, patches: { main: 8, natural: 7, expo: 6 },
    bases: [{ x: 12, y: 10, role: 'main', face: 'nw' }, { x: 10, y: 44, role: 'natural', face: 'sw' },
      { x: 10, y: 78, role: 'expo', face: 'nw' }, { x: 56, y: 8, role: 'expo', face: 'ne' }, { x: 52, y: 48, role: 'expo', face: 'nw' },
      { x: 86, y: 8, role: 'expo', face: 'ne' }, { x: 82, y: 84, role: 'expo', face: 'nw' }],
    high: [['poly', 2, 2, 36, 2, 36, 18, 29, 29, 2, 29], ['poly', 70, 80, 78, 72, 96, 72, 96, 96, 72, 96, 70, 90],
      ['poly', 46, 42, 60, 40, 66, 44, 66, 56, 60, 60, 48, 60, 44, 54]],
    ramps: [[18, 27, 4, 6], [64, 84, 8, 4], [51, 56, 4, 6]],
    rocks: [['poly', 30, 30, 37, 20, 44, 18, 48, 26, 44, 38, 36, 44, 30, 40], ['poly', 7, 58, 14, 56, 26, 60, 28, 66, 16, 68, 7, 67],
      ['poly', 50, 18, 62, 15, 76, 16, 82, 22, 70, 27, 56, 26], ['poly', 26, 82, 36, 78, 44, 82, 44, 92, 34, 95, 27, 90],
      ['poly', 70, 40, 78, 34, 88, 38, 90, 48, 80, 52, 72, 50], ['poly', 34, 60, 40, 56, 46, 62, 42, 70, 36, 70],
      ['poly', 80, 56, 88, 54, 94, 60, 90, 66, 82, 64],
      ['ellipse', 60, 30, 2.5, 2], ['ellipse', 22, 74, 2, 2.5], ['ellipse', 56, 78, 3, 2], ['ellipse', 86, 30, 2, 2]],
    features: [{ kind: 'rocks', x: 2, y: 61, w: 5, h: 3 }],
  },
  huge: {
    name: 'The Long March', w: 256, h: 256, players: 4, tileset: 'ice', startOrder: [0, 3, 1, 2],
    patch: 1300, gas: 4000, patches: { main: 8, natural: 7, expo: 6 },
    bases: [{ x: 13, y: 11, role: 'main', face: 'nw' }, { x: 10, y: 48, role: 'natural', face: 'sw' },
      { x: 10, y: 84, role: 'expo', face: 'nw' }, { x: 62, y: 8, role: 'expo', face: 'ne' }, { x: 10, y: 116, role: 'expo', face: 'sw' },
      { x: 106, y: 8, role: 'expo', face: 'ne' }, { x: 66, y: 64, role: 'expo', face: 'nw' }, { x: 110, y: 110, role: 'expo', face: 'nw' }],
    high: [['poly', 2, 2, 40, 2, 40, 20, 32, 32, 2, 32], ['poly', 96, 106, 106, 96, 128, 96, 128, 128, 96, 128, 94, 118],
      ['poly', 60, 58, 76, 56, 82, 62, 82, 74, 76, 78, 62, 78, 58, 70]],
    ramps: [[20, 30, 4, 6], [88, 110, 8, 4], [66, 74, 4, 6]],
    rocks: [['poly', 33, 33, 41, 22, 48, 20, 52, 30, 48, 42, 40, 48, 33, 44], ['poly', 7, 62, 16, 60, 30, 64, 32, 70, 18, 72, 7, 71],
      ['poly', 54, 20, 68, 16, 84, 18, 90, 24, 78, 30, 60, 29], ['line', 30, 100, 44, 94, 56, 96, 64, 104, 5],
      ['line', 100, 30, 94, 44, 96, 56, 104, 64, 5], ['poly', 40, 116, 50, 112, 58, 118, 54, 126, 44, 126],
      ['poly', 84, 44, 94, 40, 104, 44, 104, 52, 92, 54], ['poly', 30, 78, 38, 74, 46, 80, 42, 88, 32, 86],
      ['ellipse', 64, 36, 3, 2], ['ellipse', 22, 88, 2, 3], ['ellipse', 80, 86, 3, 3], ['ellipse', 112, 76, 2.5, 2], ['ellipse', 76, 112, 2, 2.5]],
    features: [{ kind: 'rocks', x: 2, y: 65, w: 5, h: 3 }],
  },
};

// ============================================================================
// Hazards. Periodic environmental danger, as a property of the LAYOUT.
// ============================================================================
// It is deliberately not a global rule. Every existing layout, every mission and every balance log in
// this repository predates hazards, and a hazard that turned itself on everywhere would silently
// change all of them; a layout without a `hazard` key has none and behaves exactly as it always did.
//
// The sandstorm is a front `band` tiles deep that crosses the map along one axis, and it is a PURE
// FUNCTION OF THE FRAME NUMBER. That is not a stylistic choice -- it is what makes it survive
// js/snapshot.js without snapshot.js knowing it exists. Snapshots capture creep, blocked, walk, psi
// and the resources, and nothing else about the map; anything the hazard remembered between ticks
// would be dropped on a replay seek or a rejoin and the two sides would storm at different times.
// Derive it from G.frame, which the snapshot does restore, and there is nothing to lose.
//
// One cycle is: `warn` frames of nothing but a warning, `sweep` frames of the front crossing, then
// `calm` frames of quiet. The direction alternates every cycle, so it does not always arrive from the
// same side. Speed is a constant 0.1333 tiles a frame on every size -- what scales with the map is how
// DEEP the front is, so a bigger map means longer spent inside it.
//
// THE STORM DOES NO DAMAGE. FIXLIST-M14 A2, and the player's words were "the dust storm shouldn't hurt
// units, just be a visual thing". It used to deal 3 damage a second straight to hit points, ignoring
// shields and armour, twice a second, to everything in the front that was not burrowed, loaded, a
// building, or within `safe` tiles of a start. All of that is gone -- the field, the pulse constant,
// the loop and the two queries that existed to answer "am I in it": there is now no code path from the
// weather to a hit point, which is a stronger guarantee than a zero in a table.
//
// Everything else is unchanged and deliberately so. The warning still goes out at the top of every
// cycle, the front still crosses at the same speed, on the same period, alternating direction, and the
// renderer still draws it -- so the map still LOOKS like the Dust Bowl, it simply no longer taxes you
// for standing in the field. `safe` survives because js/render.js reads it: the dust is erased over
// the settled ground around a start so the storm does not visually bury a mineral line nobody can move.
//
// The consequence worth knowing about: a hazard map is now simulation-identical to the same map
// without one. `test/mapmodes.js` asserts exactly that, and it is the negative control -- put `dps`
// back and the two state hashes separate.
// The refusal a player sees when they try to build in the black. Verbatim from FIXLIST-M14 C1, and a
// named constant because two branches of GameMap.canPlace return it and test/fogbuild.js reads it --
// three copies of a sentence is how one of them ends up saying something slightly different.
const UNEXPLORED_MSG = 'You can\'t build here until it is explored';
const HAZARD_SAYS = { sandstorm: 'A sandstorm is closing in.' };
const HAZARDS = {
  // span is the map's extent along the sweep axis, in tiles.
  sandstorm(span) {
    const band = Math.max(12, Math.round(span / 8));
    const sweep = (span + 2 * band) * 15 / 2;   // 0.1333 tiles a frame, whatever the size
    // `safe` is a RENDER radius now, not a damage exemption -- see the note above.
    return { kind: 'sandstorm', axis: 'x', band, warn: 240, sweep, calm: sweep, safe: 16 };
  },
};

// Turns a MAP_SIZES entry into a MAP_LAYOUTS entry. Registration happens at load, below, so the layouts
// exist before js/build.js first hashes MAP_LAYOUTS -- BUILD.hash() memoises, so a layout registered
// later would be invisible to the stamp and two clients could disagree about a map while agreeing about
// the build. New size/hazard combinations belong here, not in a runtime call.
const MapModes = {
  sizes: MAP_SIZES,
  keys: ['small', 'medium', 'large', 'huge'],
  // One base, arranged the way every hand-written layout in this file already arranges one: a column of
  // patches west of the hall, a row north of it, and the geyser off the north-east corner. Fed the
  // temple main's numbers (hall 12,12 and eight patches) this reproduces that base exactly, which is
  // the point -- a size changes how many patches a base has and what is in them, never its shape.
  // `face` turns it about the hall (4 x 3) so the mineral line is on that side: 'nw' is the arrangement above and the default, 'ne'
  // mirrors it left to right, 'sw' top to bottom, 'se' both. Mirrored whole, every patch and the geyser keep their three tiles from the hall.
  base(x, y, patches, amount, gas, role, face) {
    const min = [], col = Math.min(patches, 5), row = patches - col, mx = !!face && face[1] === 'e', my = !!face && face[0] === 's';
    const at = (rx, ry, w, h) => [x + (mx ? 4 - rx - w : rx), y + (my ? 3 - ry - h : ry)];   // hall-relative, mirrored about the hall
    for (let i = 0; i < col; i++) min.push(at(-5, -3 + i * 2, 2, 1));
    for (let i = 0; i < row; i++) min.push(at(-2 + i * 2, -4, 2, 1));
    const b = { hall: [x, y], minerals: min, geyser: at(5, -5, 4, 2), amount, gas };
    if (role === 'main') b.main = true; else if (role === 'natural') b.natural = true;
    return b;
  },
  layout(key, opts = {}) {
    const S = MAP_SIZES[key]; if (!S) throw new Error('unknown map size ' + key);
    const L = {
      name: opts.name || S.name, size: key, players: S.players, w: S.w, h: S.h,
      tileset: opts.tileset || S.tileset, startOrder: S.startOrder,
      high: S.high.map(a => a.slice()), ramps: S.ramps.map(a => a.slice()), rocks: S.rocks.map(a => a.slice()),
      bases: S.bases.map(b => {
        const o = this.base(b.x, b.y, S.patches[b.role], S.patch, S.gas, b.role, b.face);
        if (b.q) o.quadrants = b.q.slice();
        return o;
      }),
    };
    if (S.sym) L.sym = S.sym;
    if (S.features) L.features = S.features.map(f => Object.assign({}, f));
    if (opts.hazard) L.hazard = HAZARDS[opts.hazard === true ? 'sandstorm' : opts.hazard](S.w);
    // Weather of the other kind. Carried through explicitly, like `hazard`, because this composer
    // builds a layout from named fields rather than spreading opts -- an unknown key is silently
    // dropped, which is exactly what happened to the first night map: it read as permanent daylight.
    if (opts.dayNight) L.dayNight = true;
    return L;
  },
};
for (const k of MapModes.keys) MAP_LAYOUTS[k] = MapModes.layout(k);
// The one shipping hazard map, so the feature is reachable without composing anything: large's ground,
// desert paint, and a sandstorm across it every 160 seconds.
MAP_LAYOUTS.dustbowl = MapModes.layout('large', { name: 'Dust Bowl', tileset: 'desert', hazard: 'sandstorm' });
// A night map. `dayNight` is read by G.daylight and is opt-in for the same reason `hazard` is: the
// cycle shortens sight for a third of every game, which is a change to how every fight on that map
// goes, and that belongs to the map rather than to the game.
MAP_LAYOUTS.nightfall = MapModes.layout('large', { name: 'Nightfall', tileset: 'ice', dayNight: true });

// ============================================================================
// Destructible and dynamic map features. Ground that changes during the match.
// ============================================================================
// A feature is one rectangle of tiles whose PASSABILITY is a function of its own state, plus hit
// points. That is the whole model, and everything else is a table entry:
//
//   kind        intact          broken            what destroying it does
//   ---------------------------------------------------------------------------------------------
//   rocks       impassable      open ground       OPENS a lane -- Brood War's destructible rocks
//   bridge      open ground     a chasm           CLOSES a lane, and drops whoever was on it
//   spire       impassable      open ground       OPENS a lane AND a sightline (see below)
//   floodgate   a tidal lane    flooded for good  CLOSES a lane permanently, and drowns the lane
//
// Three things about this are load-bearing and none of them is decoration.
//
// **It changes pathing, because it changes `walk`.** `GameMap.walkable` is what the A* and
// `G.passable` both read, so the moment a feature's tiles flip the next path found goes somewhere
// else. Nothing caches a path across the change: `Pathfinder` keeps no state between searches (see
// the `closed` comment below) and a unit re-paths when its current one runs out.
//
// **The spire changes vision, because it changes `height`.** `G.updateVision` marks a tile seen only
// when `m.height[i] <= uh` -- the height of the unit doing the looking. A spire is a cliff-ringed
// pillar of height 2 standing on low ground, so while it stands it is a hole in every ground army's
// vision that only an air unit or a unit on other high ground can see into. Collapse it and it is
// height 0: the ground it stood on becomes visible, and therefore targetable, from below. That is the
// only lever terrain has on vision in this engine -- vision is a circle plus a height test, not a
// raycast -- so a feature that wants to move vision has to move `height`.
//
// **The state is stored where a snapshot already looks.** This is the same problem the sandstorm
// solved by deriving itself from the frame, and features cannot do that, because a rock formation
// remembers who shot it. What they do instead is live in `G.map.resById` -- the by-id registry
// js/snapshot.js already walks, tags references through, and restores IN PLACE. A feature is an
// object with an `id` in that map, so `Snapshot.take` writes its hit points and its broken flag into
// `s.resGone` for free, `Snapshot.restore` applies them back onto the very same object, and
// `Snapshot._tag` will resolve a reference to a feature the way it resolves a reference to a mineral
// patch. Nothing in js/snapshot.js had to learn what a feature is.
//
// Two consequences of that choice, written down because they are not obvious:
//   * `walk` and `blocked` are captured by the snapshot as well, so after a restore they are already
//     right and the feature's own state agrees with them.
//   * `cliff` is NOT captured (`height` is, since the crater rule gave the snapshot a height grid), so
//     `cliff` has to be re-derived. `broken` is therefore an
//     ACCESSOR: writing it -- which is exactly what `Snapshot.restore`'s `_apply` does -- repaints
//     that feature's tiles. `syncFeature` is idempotent and reads no clock, so doing it during a
//     restore is safe, and a backward replay seek onto a map whose bridge was dropped comes back with
//     the chasm still there.
//
// The static geometry -- `tiles`, `t0`, `baseH` (the ground that was under it before it was placed)
// and the back-reference to the map -- is defined non-enumerable, so it is neither serialised into
// every checkpoint nor deleted by `_apply`'s "remove what is not in the snapshot" pass. All of it is
// regenerated identically by `new GameMap(seed, layout)` on any client, which is what a rejoining one
// does before it restores anything.
const FEATURE_ID0 = 100000;   // feature ids sit above every resource id, in the same id space as them
const FEAT_BLOCKED = -4;      // blocked[]: -1 free, -2 mineral, -3 geyser, -4 a map feature is standing here
const WRECK_BLOCKED = -5;     // ...and -5 a wreck. See the CRATERS block for why it is not a feature.
// ...and -6 a LOWERED Supply Depot (seventh session, item 8). The one value in blocked[] that is walkable but not
// buildable: GameMap.walkable -- which movement, G.passable and the Pathfinder all go through -- lets a ground
// unit onto it, and canPlace still reads "not -1" and refuses to build there. Written into the grid rather than
// kept beside it because blocked[] is exactly what Snapshot already saves, so a save, a replay seek and a
// rejoin all carry a lowered depot without a new field to remember.
const LOWERED_BLOCKED = -6;
// How much fully churned ground costs a ground unit, and how much one worker trip strips the ground
// around a patch. MINE_STRIP saturates a tile at 255 after about 128 trips out of the ~187 a 1500
// patch holds, so a patch that has been worked hard is bare rock well before it runs dry -- you can
// read how long a base has been running off the ground, which is the point of the attrition economy.
const CHURN_SLOW = 0.25, MINE_STRIP = 2;
// A ramp is at most RAMP_LEN tiles long, counted from the cliff row down, and shorter wherever the RAMP_CLEAR tiles straight
// past its foot are not open ground. The whole rule is GameMap.wallRamps.
const RAMP_LEN = 3, RAMP_CLEAR = 3;
const MAP_FEATURES = {
  // hp is what it takes to remove one; they are deliberately in the range of a few units for a few
  // seconds rather than a siege operation, because the decision is WHETHER to open the lane and when,
  // not whether you can be bothered.
  //   intactOpen  is the lane passable while the feature stands?
  //   shutCliff   what cliff[] says while the lane is shut: 2 boulders/chasm, 1 a cliff face
  //   shutHeight  height[] while shut, and openHeight while open. NULL means "whatever the ground
  //               under it was when the map was generated", which is what lets a rock formation sit
  //               in a ramp without flattening it. Only the spire moves height, and moving height is
  //               the only way anything can move vision -- see above.
  rocks: { name: 'Rock Formation', hp: 1200, intactOpen: false, shutCliff: 2, shutHeight: null, openHeight: null },
  bridge: { name: 'Bridge', hp: 700, intactOpen: true, shutCliff: 2, shutHeight: null, openHeight: null },
  spire: { name: 'Spire', hp: 1800, intactOpen: false, shutCliff: 1, shutHeight: 2, openHeight: 0 },
  // The dynamic one. While it stands the lane drains and floods on a fixed cycle derived from the
  // frame -- the sandstorm's discipline, and for the sandstorm's reason: a tide that remembered a
  // countdown would drift between two clients and desync a minute later. Break the gate and the lane
  // floods for good: the other three take a lane away or give one back once, and this is the only one
  // whose destruction takes away something that was going to keep coming back.
  floodgate: {
    name: 'Floodgate', hp: 1400, intactOpen: true, shutCliff: 2, shutHeight: null, openHeight: null,
    tide: { period: 24 * 100, wet: 24 * 28, warn: 24 * 8 },
  },
};
const FEATURE_SAYS = { bridge: 'A bridge has collapsed.', rocks: 'A rock formation has been cleared.', spire: 'A spire has collapsed.', floodgate: 'The floodgate has broken. The channel is flooding.' };

// ============================================================================
// Procedural map archetypes. Named shapes, infinite maps inside each one.
// ============================================================================
// A generator that produces "some terrain" produces maps nobody wants to play twice. What makes a
// map worth replaying is that you know what KIND of map it is before you see it -- that a chokepoint
// map will be decided at two gaps and an open basin will be decided by who can hold four expansions
// at once. So there are four generators, each of which always produces its own shape, and the seed
// decides everything inside that shape: where the plateaus are, how wide the gaps are, how many
// expansions, which tileset, and where the destructibles sit.
//
//   chokepoint   corner plateau per player, a rock wall across the middle with two ways through, one
//                of them a rock formation you can open. A floodgate crosses the centre.
//   basin        an open middle: past each main's ramp there are no walls, only one big contested
//                plateau in the middle with a base a player on it, and a spire on each approach.
//                Whoever wants the middle has to take ground.
//   islands      two channels cut each quadrant into pieces. Every piece has one permanent causeway
//                and one bridge, so dropping a bridge costs the attacker the short way, never the
//                defender's ability to walk home.
//   cliffs       three terraces. The main and its natural are both on high ground, the middle is not,
//                and a rock formation half-fills the natural's ramp.
//
// All four have StarCraft II's home (the looks queue, item 4; RESEARCH-TERRAIN.md 8.14): a main on high ground
// with one ramp, the natural past its foot, and a third down each edge. Until then the basin's mains stood on
// the floor. And on a two-player size every corner holds bases -- see `layout`.
//
// EVERY GENERATOR IS SEEDED AND PURE. Same key, same seed, same size -> byte-identical layout, on any
// machine and in any call order; test/mapfeatures.js compares two generations tile for tile. The RNG
// is the same xorshift GameMap uses on its own seed, never Math.random.
//
// Reachability is not left to luck. `GameMap.repairConnectivity` runs after generation on archetype
// maps only, floods the map with EVERY FEATURE FORCED SHUT, and carves a mirrored corridor to any
// base it cannot reach. Because every feature's other state only ever adds walkable ground, a map
// that is connected in that worst case is connected in all 2^n of them -- which is what makes
// "destroying everything never strands a player" a property rather than a hope.
//
// A NOTE ON THE BUILD STAMP. js/build.js hashes MAP_LAYOUTS and the source of GameMap's methods, and
// since REVIEW-M17 this object, MapModes and HAZARDS too (BUILD.TABLES). Before that it did not know
// any of the three existed, which is why the digest below was built, and it stays: the source hash
// says the generators' text is unchanged, the digest says what they PRODUCE is unchanged. The four
// registered sample layouts below carry a digest of eight seeds of every generator, so changing a
// generator moves the stamp and two clients cannot disagree about what `arch:islands:97` means while
// agreeing about the build.
const ARCH_CACHE = new Map();   // layout id -> layout; generation is pure, so a cache cannot change an answer
const Archetypes = {
  keys: ['chokepoint', 'basin', 'islands', 'cliffs'],
  names: { chokepoint: 'Chokepoint Valley', basin: 'Open Basin', islands: 'Island Chain', cliffs: 'Vertical Cliffs' },
  // the size mode each archetype is built for by default; any of the four sizes can be asked for
  sizes: { chokepoint: 'medium', basin: 'large', islands: 'medium', cliffs: 'medium' },
  salt: { chokepoint: 0x9e3779b1, basin: 0x85ebca6b, islands: 0xc2b2ae35, cliffs: 0x27d4eb2f },
  rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; },
  ri(R, a, b) { return a + Math.floor(R() * (b - a + 1)); },      // inclusive integer in [a,b]
  rf(R, a, b) { return a + R() * (b - a); },
  pick(R, arr) { return arr[Math.floor(R() * arr.length) % arr.length]; },

  // "arch:<key>:<seed>[:<size>]" is the whole identity of a generated map. It is the layout id the
  // engine is given, so two clients handed the same id build the same ground without shipping it.
  id(key, seed, size) { return 'arch:' + key + ':' + ((seed >>> 0) || 0) + (size ? ':' + size : ''); },
  parse(id) {
    const p = String(id).split(':');
    if (p[0] !== 'arch' || !this.keys.includes(p[1])) return null;
    return { key: p[1], seed: (+p[2] >>> 0) || 0, size: MAP_SIZES[p[3]] ? p[3] : null };
  },
  resolve(id) {
    const a = this.parse(id); if (!a) return null;
    let L = ARCH_CACHE.get(id);
    if (!L) { L = this.layout(a.key, a.seed, a.size); ARCH_CACHE.set(id, L); if (ARCH_CACHE.size > 64) ARCH_CACHE.delete(ARCH_CACHE.keys().next().value); }
    return L;
  },

  layout(key, seed, size) {
    if (!this.keys.includes(key)) throw new Error('unknown map archetype ' + key);
    const sk = MAP_SIZES[size] ? size : this.sizes[key], S = MAP_SIZES[sk];
    const R = this.rng((Math.imul(seed >>> 0, 2654435761) ^ this.salt[key]) >>> 0);
    for (let i = 0; i < 8; i++) R();                     // let the xorshift leave its first, low-entropy words behind
    const L = {
      name: this.names[key] + ' ' + ((seed >>> 0) % 10000), archetype: key, seed: seed >>> 0, size: sk,
      players: S.players, w: S.w, h: S.h, tileset: this.pick(R, TILESET_IDS), startOrder: S.startOrder,
      high: [], ramps: [], rocks: [], features: [], bases: [],
    };
    this[key](L, S, R);
    // A two-player size puts both mains on the diagonal, quadrants 0 and 3. The ground is mirrored four ways all the same, so
    // until the looks queue (item 4) the other two corners were a main's plateau and a natural's ground with no base on
    // either, and every base and feature stood in quadrants 0 and 3 only -- the flaw the fixed two-player maps had as well.
    // Now every base and feature stands in all four, and in quadrants 1 and 2 the main's and the natural's spots are plain
    // expansions, nobody's main and nobody's natural. A corner's bases are the half turn of the opposite corner's, so neither
    // player is nearer more of them, and a two-player map has StarCraft II's seven or eight bases a side.
    if (S.players === 2) {
      const own = L.bases.filter(b => b.main || b.natural);
      for (const b of own) b.quadrants = [0, 3];
      for (const b of own) L.bases.push(Object.assign(MapModes.base(b.hall[0], b.hall[1], S.patches.expo, S.patch, S.gas, 'expo'), { quadrants: [1, 2] }));
    }
    return L;
  },
  // One base in the shape every layout in this file already uses, with this size's patch counts.
  //
  // The guard is the difference between a generator and a map. A base is a hall plus a mineral ring
  // plus a geyser spread over sixteen tiles by ten, and the engine refuses a town hall within three
  // tiles of ANY resource -- so two bases the seed happened to put nine tiles apart produce a map
  // where a player cannot build in their own expansion, and `canPlace` says "Too close to resources"
  // about a patch belonging to the base next door. It has to be checked before the map exists, which
  // is here. A base that will not fit is nudged along the map's diagonal a few times and then
  // dropped: fewer expansions is variety, an unbuildable one is a bug.
  //
  // Everything is also kept strictly inside quadrant 0, because the four-fold mirror would otherwise
  // put a base and its own reflection on top of each other down the centre line.
  base(L, S, x, y, role) {
    const box = (bx, by) => [bx - 6, by - 6, 16, 10];
    const hits = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
    for (let t = 0; t < 5; t++) {
      const bx = x + t * 3, by = y + t * 3, r = box(bx, by);
      if (r[0] >= 2 && r[1] >= 2 && r[0] + r[2] <= S.w / 2 && r[1] + r[3] <= S.h / 2
        && !L.bases.some(o => hits(r, box(o.hall[0], o.hall[1])))) {
        L.bases.push(MapModes.base(bx, by, S.patches[role] || S.patches.expo, S.patch, S.gas, role));
        return true;
      }
    }
    return false;
  },
  feat(L, kind, x, y, w, h, quadrants) { const f = { kind, x, y, w, h }; if (quadrants) f.quadrants = quadrants.slice(); L.features.push(f); },
  // Is a random rock ellipse clear of every ramp rectangle, with a tile to spare? A blob dropped by seed onto a ramp turns a
  // way up into a slot through boulders that GameMap.wallRamps cannot shape into a ramp -- measured on arch:basin:5:small, the
  // one map of 525 still side-open with every other fix in (terrain queue item 2). A blob that fails is drawn from the stream
  // all the same and simply not placed, so nothing drawn after it moves.
  rockClear(L, cx, cy, rx, ry) {
    const x0 = Math.floor(cx - rx) - 1, x1 = Math.ceil(cx + rx) + 1, y0 = Math.floor(cy - ry) - 1, y1 = Math.ceil(cy + ry) + 1;
    return !L.ramps.some(r => x0 <= r[0] + r[2] - 1 && x1 >= r[0] && y0 <= r[1] + r[3] - 1 && y1 >= r[1]);
  },

  // An expansion ON the central plateau, with the plateau guaranteed to be underneath it.
  //
  // A generator can put a base anywhere; what it cannot do is promise that the ground there is flat,
  // high, and three tiles clear of the cliff ring on every one of the four map sizes. A base whose
  // mineral line is half on the rim is a base whose patches sit on a sealed ramp lip, and a base one
  // tile too far out is a base on low ground pretending to be on a plateau. So the shelf is drawn to
  // fit the base rather than the base fitted to the shelf: a rectangle from three tiles outside the
  // footprint to the map's own centre line, so that its four mirrored copies MEET there and become one
  // block. Where the archetype's own plateau is already bigger -- basin at 192 tiles and up -- the
  // rectangle disappears inside it and costs nothing; where it is smaller, this is the plateau.
  //
  // The base sits ten tiles in from the centre line and eight up, which is as close as the mirror
  // allows: a base's true footprint runs x-5..x+8 and y-5..y+5 (the geyser is the wide part, and it is
  // north-east of the hall), so any closer and the quadrant-1 copy's geyser would be touching this
  // one's. `Archetypes.base`'s own 16x10 box under-describes that footprint by two rows, which is why
  // this does its own placement rather than going through it.
  centreBase(L, S) {
    const bx = Math.floor(S.w / 2) - 10, by = Math.floor(S.h / 2) - 8;
    L.high.push(['rect', bx - 8, by - 8, Math.floor(S.w / 2) - (bx - 8), Math.floor(S.h / 2) - (by - 8)]);
    L.bases.push(MapModes.base(bx, by, S.patches.expo, S.patch, S.gas, 'expo'));
    return [bx, by];
  },

  // ---- chokepoint valley -------------------------------------------------
  // A river across the middle of the map with two fords near the edges and a tidal crossing in the
  // centre, and, at home, a rock wall in front of the natural with one gap that a rock formation is
  // sitting in. So there are two scales of chokepoint on it: the one you fight the game at, and the
  // one you decide whether to open.
  chokepoint(L, S, R) {
    const W = S.w, H = S.h, fx = f => Math.round(f * W), fy = f => Math.round(f * H);
    const pw = fx(this.rf(R, 0.22, 0.27)), ph = fy(this.rf(R, 0.19, 0.23));
    L.high.push(['rect', 3, 3, pw, ph], ['ellipse', pw * 0.55, ph * 0.55, pw * 0.5, ph * 0.5]);
    // The ramp is two tiles in from the plateau's corner, as on cliffs and islands: an outer column on the corner of the cliff
    // ring puts that side's wall in the gap beside the corner (GameMap.wallRamps; terrain queue item 2).
    const rw = Math.max(4, fx(0.035)), rx = 3 + pw - rw - 2, ry = 3 + ph - 2;
    L.ramps.push([rx, ry, rw, Math.max(6, fy(0.06))]);                              // down from the plateau's inner corner
    this.base(L, S, Math.max(8, fx(0.08)), Math.max(8, fy(0.08)), 'main');
    // The natural's mineral row lies four rows above its hall. Where that row would cross the walled ramp -- the 96-tile map,
    // where fy(0.075) is 7 -- the natural stands east of the ramp instead, clear of its wall; elsewhere it is where it was. Moving
    // it down instead was tried and pushed it into its own expansion on the small map, which then refused a town hall.
    const ny = ry + fy(0.075);
    this.base(L, S, ny - 4 <= ry + RAMP_LEN ? rx + rw + 6 : rx + fx(0.025), ny, 'natural');
    this.base(L, S, Math.max(8, fx(0.06)), fy(this.rf(R, 0.32, 0.36)), 'expo');
    this.base(L, S, fx(this.rf(R, 0.32, 0.36)), Math.max(8, fy(0.06)), 'expo');
    // the river: one band across the whole map, so its 4-fold mirror is itself
    L.rocks.push(['rect', 0, Math.round(H / 2) - 2, W, 4]);
    const ford = fx(this.rf(R, 0.13, 0.20));
    L.causeways = [[ford, Math.round(H / 2) - 2, Math.max(6, fx(0.055)), 4]];
    this.feat(L, 'floodgate', Math.round(W / 2) - 6, Math.round(H / 2) - 2, 12, 4);  // the crossing that comes and goes
    // the home wall: a band in front of the natural with a rock formation in its one gap
    const wy = ry + fy(this.rf(R, 0.16, 0.20)), gap = Math.max(4, fx(0.045));
    L.rocks.push(['rect', 3, wy, rx + fx(0.02), 3], ['rect', rx + fx(0.02) + gap, wy, fx(0.12), 3]);
    this.feat(L, 'rocks', rx + fx(0.02), wy, gap, 3);
  },

  // ---- open basin --------------------------------------------------------
  // An open middle. Past each main's ramp there are no walls at all, and the only other high ground on
  // the map is one big plateau in the middle, which is worth taking. FIVE bases a player, and the fifth is
  // on top of that plateau, so "whoever wants the middle has to take ground" is a sentence about the
  // economy and not only about sight lines: it is a base, and it is equidistant from everybody. A spire on
  // each approach means there is somewhere an army can be that you cannot see.
  //
  // Until the looks queue the mains stood on the floor too ("no defender's terrain at home at all"). The
  // main's plateau is drawn to hold its base -- the footprint runs from the hall's x-5 to x+8 and y-5 to
  // y+5, and the plateau's inside from 3 to x+8 and y+8 -- with the ramp down its south edge two tiles in
  // from the corner, as on islands. The natural stands further out than it did (0.25-0.29 of the map, not
  // 0.20-0.24) so its mineral line clears that cliff on the smallest size, and the spires moved out with it
  // (0.33-0.37, not 0.29-0.33) so a spire never lands in the natural's clearing and vanishes.
  basin(L, S, R) {
    const W = S.w, H = S.h, fx = f => Math.round(f * W), fy = f => Math.round(f * H);
    L.high.push(['ellipse', W / 2 - 0.5, H / 2 - 0.5, fx(this.rf(R, 0.13, 0.17)), fy(this.rf(R, 0.13, 0.17))]);
    L.ramps.push([fx(0.5) - fx(0.02), fy(this.rf(R, 0.32, 0.36)), Math.max(5, fx(0.045)), Math.max(6, fy(0.06))]);
    const mx = Math.max(8, fx(0.08)), my = Math.max(8, fy(0.08)), pw = mx + 8, ph = my + 8;
    const rw = Math.max(4, fx(0.03)), rh = Math.max(5, fy(0.05));
    L.high.push(['rect', 2, 2, pw, ph]);
    L.ramps.push([2 + pw - rw - 2, 2 + ph - 2, rw, rh]);
    this.base(L, S, mx, my, 'main');
    this.base(L, S, fx(this.rf(R, 0.25, 0.29)), fy(this.rf(R, 0.25, 0.29)), 'natural');
    this.base(L, S, Math.max(8, fx(0.07)), fy(this.rf(R, 0.33, 0.39)), 'expo');
    this.base(L, S, fx(this.rf(R, 0.33, 0.39)), Math.max(8, fy(0.07)), 'expo');
    this.centreBase(L, S);
    for (let i = 0; i < 3; i++) { const e = ['ellipse', fx(this.rf(R, 0.26, 0.44)), fy(this.rf(R, 0.26, 0.44)), this.ri(R, 3, 5), this.ri(R, 3, 5)]; if (this.rockClear(L, e[1], e[2], e[3], e[4])) L.rocks.push(e); }
    this.feat(L, 'spire', fx(this.rf(R, 0.33, 0.37)), fy(this.rf(R, 0.16, 0.20)), 4, 4);
    this.feat(L, 'spire', fx(this.rf(R, 0.16, 0.20)), fy(this.rf(R, 0.33, 0.37)), 4, 4);
    this.feat(L, 'rocks', fx(0.5) - 2, fy(this.rf(R, 0.38, 0.41)), 4, 3);            // in front of the plateau ramp
  },

  // ---- island chain ------------------------------------------------------
  // Two channels cut every quadrant into quarters. Each channel has one causeway that is part of the
  // ground and one bridge that is not, so dropping a bridge takes away the short road and never the
  // road -- which is the rule that keeps "destroy everything" from stranding anyone.
  islands(L, S, R) {
    const W = S.w, H = S.h, fx = f => Math.round(f * W), fy = f => Math.round(f * H);
    const pw = fx(this.rf(R, 0.16, 0.20)), ph = fy(this.rf(R, 0.14, 0.18));
    L.high.push(['rect', 3, 3, pw, ph]);
    // Two tiles in from the plateau's corner, not on it: a ramp whose outer column is the corner of the cliff ring has its wall
    // standing in the gap beside the corner, and on arch:islands:13:medium that gap was the only way a 3x3 body left the main.
    L.ramps.push([3 + pw - fx(0.03) - 2, 3 + ph - 2, Math.max(4, fx(0.03)), Math.max(5, fy(0.05))]);
    this.base(L, S, Math.max(8, fx(0.07)), Math.max(8, fy(0.07)), 'main');
    this.base(L, S, fx(this.rf(R, 0.23, 0.26)), fy(this.rf(R, 0.23, 0.26)), 'natural');
    this.base(L, S, Math.max(8, fx(0.06)), fy(this.rf(R, 0.38, 0.43)), 'expo');
    this.base(L, S, fx(this.rf(R, 0.38, 0.43)), Math.max(8, fy(0.06)), 'expo');
    // horizontal channel, then vertical, each a rock band with a causeway gap and a bridge over it
    const cy = fy(this.rf(R, 0.32, 0.36)), cx = fx(this.rf(R, 0.32, 0.36)), bw = 3;
    const causeH = fx(this.rf(R, 0.05, 0.09)), bridgeH = fx(this.rf(R, 0.26, 0.32));
    const causeV = fy(this.rf(R, 0.05, 0.09)), bridgeV = fy(this.rf(R, 0.26, 0.32));
    L.rocks.push(['rect', 3, cy, fx(0.45), bw], ['rect', cx, 3, bw, fy(0.45)]);
    // The causeway is a gap punched back out of the band after the rocks are painted; the bridge is a
    // second crossing that can be taken away. Two crossings per channel is the whole invariant here.
    L.causeways = [[causeH, cy, 4, bw], [cx, causeV, bw, 4]];
    this.feat(L, 'bridge', bridgeH, cy, 4, bw);
    this.feat(L, 'bridge', cx, bridgeV, bw, 4);
  },

  // ---- vertical cliffs ---------------------------------------------------
  // Three terraces: the main, the natural above it, and a plateau in the middle that belongs to
  // nobody. The ramp onto the natural has a rock formation sitting in it, so the natural's way in
  // is three tiles wide until somebody clears it -- and then it is wide for the attacker too.
  //
  // WHY THE RAMP IS WIDER THAN THE ROCKS (terrain queue item 2). The rocks used to fill the ramp's last two rows edge to edge,
  // and the natural was reachable only because the ramp's sides were open: units walked round the rocks. Once ramps have walls
  // (GameMap.wallRamps) a ramp-wide rock formation seals the only way onto terrace 2 with every feature shut. So the ramp is
  // three tiles wider than the rocks, and the rocks lie across its first two walled rows at the west side: a unit, and a
  // Thor, get past them; clearing them opens the rest.
  //
  // Two more changes, for the same reason, measured over 32 seeds a size. The main's ramp is two tiles in from the plateau's
  // corner rather than on it -- on a 96-tile map the terraces are two tiles apart there, and a wall at the corner closed the
  // only way a 3x3 body left the main. And the rock ellipse this used to drop is still drawn from the stream but not placed:
  // its centre range, 0.30-0.36 of the map, lies inside terrace 2 on every seed, and on the small size it left the natural a
  // winding path through boulders that no ramp rule can wall.
  cliffs(L, S, R) {
    const W = S.w, H = S.h, fx = f => Math.round(f * W), fy = f => Math.round(f * H);
    const rw = Math.max(4, fx(0.03)), rh = Math.max(7, fy(0.065));
    const pw = fx(this.rf(R, 0.23, 0.27)), ph = fy(this.rf(R, 0.20, 0.24));
    L.high.push(['rect', 3, 3, pw, ph]);                                             // terrace 1: the main
    const t2w = fx(this.rf(R, 0.11, 0.13)), t2h = fy(this.rf(R, 0.11, 0.13));
    const t2x = 3 + pw + fx(0.02), t2y = 3 + ph + fy(0.02);
    L.high.push(['rect', t2x, t2y, t2w, t2h]);                                       // terrace 2: the natural, also up
    L.high.push(['ellipse', W / 2 - 0.5, H / 2 - 0.5, fx(this.rf(R, 0.10, 0.12)), fy(this.rf(R, 0.10, 0.12))]);
    const r1 = [3 + pw - rw - 2, 3 + ph - 2, rw, rh];                                // main -> low ground
    const r2 = [t2x + Math.round(t2w / 2) - Math.round((rw + 3) / 2), t2y + t2h - 2, rw + 3, rh];   // low ground -> terrace 2
    const r3 = [Math.round(W / 2) - Math.round(rw / 2), Math.round(H / 2) - fy(0.13) - 2, rw + 2, rh + 4];   // onto the middle
    L.ramps.push(r1, r2, r3);
    this.base(L, S, Math.max(8, fx(0.08)), Math.max(8, fy(0.08)), 'main');
    this.base(L, S, t2x + Math.round(t2w / 2) - 2, t2y + Math.round(t2h / 2) - 2, 'natural');
    this.base(L, S, Math.max(8, fx(0.06)), fy(this.rf(R, 0.36, 0.42)), 'expo');
    this.base(L, S, fx(this.rf(R, 0.36, 0.42)), Math.max(8, fy(0.06)), 'expo');
    this.rf(R, 0.30, 0.36); this.rf(R, 0.30, 0.36); this.ri(R, 4, 6); this.ri(R, 4, 6);   // the rock ellipse: drawn, not placed (above)
    this.feat(L, 'rocks', r2[0], r2[1] + 1, rw, 2);                                   // across the ramp's first two walled rows
    // The spire stands west of the natural's ramp rectangle: the ramp is three tiles wider than it was, and a spire landing on
    // its ramp tiles is refused by placeFeatures and vanishes from all four quadrants (arch:cliffs:2 lost both).
    const sx = fx(this.rf(R, 0.24, 0.29)), sy = fy(this.rf(R, 0.40, 0.45));
    this.feat(L, 'spire', sx + 4 >= r2[0] && sx <= r2[0] + r2[2] && sy + 4 >= r2[1] && sy <= r2[1] + r2[3] ? r2[0] - 5 : sx, sy, 4, 4);
  },

  // A digest of eight seeds of every generator, folded into the sample layouts below so that
  // js/build.js's hash of MAP_LAYOUTS covers what these functions DO and not merely that they exist.
  digest() {
    let a = 0x811c9dc5 | 0;
    const eat = s => { for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 16777619); };
    for (const k of this.keys) for (let seed = 1; seed <= 8; seed++) {
      const L = this.layout(k, seed);
      eat(k + '|' + L.w + 'x' + L.h + '|' + L.tileset + '|');
      for (const arr of [L.high, L.ramps, L.rocks]) eat(JSON.stringify(arr));
      eat(JSON.stringify(L.features));
      eat(L.bases.map(b => b.hall.join(',') + ';' + b.minerals.length + ';' + b.amount + ';' + b.gas).join('|'));
      eat(JSON.stringify(L.causeways || null));
    }
    return (a >>> 0).toString(16).padStart(8, '0');
  },
};
// One fixed-seed sample of every archetype, registered at load like the size modes are, so each shape
// is reachable from a menu without composing anything and so the stamp covers the generators.
{
  const stamp = Archetypes.digest();
  for (const k of Archetypes.keys) {
    const L = Archetypes.layout(k, 1);
    L.name = Archetypes.names[k]; L.archStamp = stamp;
    MAP_LAYOUTS['arch_' + k] = L;
  }
}

// Built on first use by GameMap.heightBonusTable(), which is where the numbers are written and where
// the build stamp can see them. Nothing else may assign it.
let HEIGHT_BONUS = null;

class GameMap {
  constructor(seed = 1, layout = 'temple') {
    this.layout = layout;
    // Size comes from the layout, for editor maps and for the four size modes alike; a layout with no
    // w/h stays at the historical 128x128, which is every layout hand-written above. Clamped because the
    // codec and the spatial hash both scale with area.
    const LZ = this.layoutDef();
    const lim = v => Math.max(64, Math.min(256, v | 0));
    this.w = lim(LZ.w || 128); this.h = lim(LZ.h || 128);
    const n = this.w * this.h;
    this.height = new Uint8Array(n);
    this.walk = new Uint8Array(n).fill(1);
    this.cliff = new Uint8Array(n);     // 1 = drawn as cliff edge
    this.blocked = new Int32Array(n).fill(-1); // building/resource occupancy (unit id, -2 mineral, -3 geyser)
    this.creep = new Uint8Array(n);
    this.scar = new Uint8Array(n);   // churned ground: craters and stripped mineral lines. See CRATERS.
    this.wrecks = [];                // standing hulks. See CRATERS.
    this.psi = {};                       // playerId -> Uint8Array
    this.noise = new Uint8Array(n);
    this.resources = [];
    this.bases = [];
    this.starts = [];
    this.seed = seed;
    let s = seed >>> 0 || 1;
    this.rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
    for (let i = 0; i < n; i++) this.noise[i] = Math.floor(this.rand() * 255);
    this.generate();
  }
  // WHO STARTS WHERE (ninth session, queue item A: a start position chosen in the lobby). `players` is G.init's players
  // array and `count` the map's number of starts; the answer is one index into this.starts per player. A player's
  // `start` is the start they chose (the number the lobby draws, less one); without one the player is AUTOMATIC.
  //   * A chosen start in range is honoured. A second claim on the same start is automatic -- only a hand-made options
  //     object can make one, because the relay and the skirmish lobby both refuse it.
  //   * An automatic player takes the start its SEAT always took, i % count, when nobody has it, and otherwise the first
  //     free start in the map's start order. So a game where nobody chose starts exactly as every game started before
  //     this existed -- every AI figure measured on it and every suite's map position still hold -- and choosing only
  //     ever moves the players it has to.
  //   * More players than starts wraps onto a start already taken, as it always did (test/net_many.js plays five on
  //     four-start maps on purpose; the lobby refuses it).
  // DELIBERATELY NOT RANDOM, where StarCraft II and OpenRA deal automatic players a random free start: nothing here reads
  // the seed, so the lobby's preview calls this same function and shows where every automatic seat will stand before
  // anyone presses START (the relay picks the seed at START), and a game with no choices is unchanged. It is static and
  // pure for that reason: the preview has no map built, only the layout's count.
  static assignStarts(players, count) {
    const n = Math.max(0, count | 0), list = Array.isArray(players) ? players : [];
    const out = list.map(() => -1), taken = new Array(n).fill(false);
    list.forEach((po, i) => { const s = po ? po.start : null; if (Number.isInteger(s) && s >= 0 && s < n && !taken[s]) { out[i] = s; taken[s] = true; } });
    list.forEach((po, i) => {
      if (out[i] >= 0 || !n) return;
      let s = i % n;
      if (taken[s]) { const free = taken.indexOf(false); if (free >= 0) s = free; }
      out[i] = s; taken[s] = true;
    });
    return out;
  }
  // The layout this map is built from. A plain id is a MAP_LAYOUTS key; an "arch:<key>:<seed>[:<size>]"
  // id is generated on the spot instead of being registered, because there are four billion of them
  // per archetype and MAP_LAYOUTS is hashed into the build stamp. Both clients hold the generator, so
  // the id is enough for both to build the same ground -- which is the point of putting the seed in it.
  layoutDef() { return Archetypes.resolve(this.layout) || MAP_LAYOUTS[this.layout] || MAP_LAYOUTS.temple; }
  idx(x, y) { return y * this.w + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  H(x, y) { return this.inb(x, y) ? this.height[this.idx(x, y)] : 0; }
  // Apply painter fn(x,y) over the layout's symmetry: 4-fold mirror, or on a 'rot2' layout the tile and its half turn about the centre.
  sym(x, y, fn) {
    if (this.symmetry === 'rot2') { fn(x, y); fn(this.w - 1 - x, this.h - 1 - y); return; }
    fn(x, y); fn(this.w - 1 - x, y); fn(x, this.h - 1 - y); fn(this.w - 1 - x, this.h - 1 - y);
  }
  // The quadrant transforms (mirrorPt) a layout's bases and features are copied through: all four, or on a 'rot2' layout the tile as it
  // is and its half turn (3). A base or feature's own `quadrants` narrows these further.
  static quadrantsOf(L) { return L && L.sym === 'rot2' ? [0, 3] : [0, 1, 2, 3]; }
  // One shape of a layout (see MAP_LAYOUTS), painted with fn(x, y) once per tile. poly paints the tiles whose centres fall inside the
  // polygon, even-odd; line the tiles whose centres lie within width/2 of the path. Arithmetic only, so every client paints the same.
  shape(sh, fn) {
    const kind = sh[0], a = sh.slice(1);
    if (kind === 'rect') return this.rect(a[0], a[1], a[2], a[3], fn);
    if (kind === 'poly') {
      const n = a.length >> 1; let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
      for (let k = 0; k < n; k++) { x0 = Math.min(x0, a[2 * k]); x1 = Math.max(x1, a[2 * k]); y0 = Math.min(y0, a[2 * k + 1]); y1 = Math.max(y1, a[2 * k + 1]); }
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.w - 1, Math.ceil(x1)); x++) {
        const px = x + 0.5, py = y + 0.5; let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) { const xi = a[2 * i], yi = a[2 * i + 1], xj = a[2 * j], yj = a[2 * j + 1]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside; }
        if (inside) fn(x, y);
      }
      return;
    }
    if (kind === 'line') {
      const r = a[a.length - 1] / 2, pts = a.slice(0, -1), done = new Uint8Array(this.w * this.h);
      for (let k = 0; k + 3 < pts.length; k += 2) {
        const ax = pts[k], ay = pts[k + 1], bx = pts[k + 2], by = pts[k + 3], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r)); y <= Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + r)); y++) for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r)); x <= Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + r)); x++) {
          const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)), ex = ax + t * dx - px, ey = ay + t * dy - py;
          if (ex * ex + ey * ey <= r * r && !done[y * this.w + x]) { done[y * this.w + x] = 1; fn(x, y); }
        }
      }
      return;
    }
    return this.ellipse(a[0], a[1], a[2], a[3], fn);   // 'ellipse', and whatever else an old layout wrote, as it always was
  }
  mirrorPt(x, y, q) { // quadrant 0..3 transform of a point
    const mx = this.w - 1 - x, my = this.h - 1 - y;
    return q === 0 ? [x, y] : q === 1 ? [mx, y] : q === 2 ? [x, my] : [mx, my];
  }
  rect(x0, y0, w, h, fn) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (this.inb(x, y)) fn(x, y); }
  ellipse(cx, cy, rx, ry, fn) { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { if (this.inb(x, y) && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) fn(x, y); } }

  generate() {
    const W = this.w, Hh = this.h;
    const setH = v => (x, y) => { this.height[this.idx(x, y)] = v; };
    const rock = (x, y) => { this.walk[this.idx(x, y)] = 0; this.cliff[this.idx(x, y)] = 2; };
    const ramp = (x, y) => { const i = this.idx(x, y); this.walk[i] = 1; this.cliff[i] = 0; this.height[i] = 1; };
    const L = this.layoutDef();
    this.symmetry = L.sym === 'rot2' ? 'rot2' : 'mirror4';
    this.name = L.name; this.players = L.players; this.tileset = TILESET_IDS.includes(L.tileset) ? L.tileset : 'badlands';
    this.size = L.size || null;
    this.archetype = L.archetype || null;
    this.features = []; this.featTile = null;
    // Static config, never mutated by the tick -- see the hazard block above for why that matters.
    this.hazard = L.hazard ? Object.assign({}, L.hazard) : null;
    if (L.custom) return this.generateCustom(L);
    // --- high ground ---
    for (const sh of L.high) this.shape(sh, (x, y) => this.sym(x, y, setH(2)));
    // --- cliffs: high tiles adjacent to low become unwalkable cliff ring ---
    const cliffs = [];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (this.height[this.idx(x, y)] !== 2) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { if (!this.inb(x + dx, y + dy) || this.height[this.idx(x + dx, y + dy)] === 0) { edge = true; break; } }
      if (edge) cliffs.push(this.idx(x, y));
    }
    for (const i of cliffs) { this.walk[i] = 0; this.cliff[i] = 1; }
    for (const r of L.ramps) this.rect(r[0], r[1], r[2], r[3], (x, y) => this.sym(x, y, ramp));
    // --- map border ---
    this.rect(0, 0, W, 2, (x, y) => rock(x, y)); this.rect(0, Hh - 2, W, 2, (x, y) => rock(x, y));
    this.rect(0, 0, 2, Hh, (x, y) => rock(x, y)); this.rect(W - 2, 0, 2, Hh, (x, y) => rock(x, y));
    // --- rocks / chokes ---
    for (const sh of L.rocks) this.shape(sh, (x, y) => this.sym(x, y, rock));
    // --- causeways: gaps punched back out of a rock band, after it is painted ---
    // A generator that wants a wall with a hole in it can only describe the wall, because `rocks` is
    // additive. This is the hole. It runs before the bases so a base can still clear over it.
    for (const c of (L.causeways || [])) this.rect(c[0], c[1], c[2], c[3], (x, y) => this.sym(x, y, (px, py) => { const i = this.idx(px, py); this.walk[i] = 1; this.cliff[i] = 0; if (this.height[i] === 2) this.height[i] = 0; }));
    // --- bases (defined in quadrant 0, mirrored; or where they stand and turned, on a 'rot2' layout) ---
    for (const q of GameMap.quadrantsOf(L)) for (const bd0 of L.bases) {
      if (bd0.quadrants && !bd0.quadrants.includes(q)) continue;
      // a base that lists no minerals is laid out by the size modes' template, its mineral line on the side `face` names
      const lay = bd0.minerals ? null : MapModes.base(bd0.hall[0], bd0.hall[1], bd0.patches || 8, bd0.amount, bd0.gas, null, bd0.face);
      const bd = lay ? Object.assign({}, bd0, { minerals: lay.minerals, geyser: lay.geyser }) : bd0;
      const base = { minerals: [], geyser: null, main: !!bd.main, natural: !!bd.natural, quadrant: q };
      const tr = (x, y, w, h) => { let [tx, ty] = this.mirrorPt(x, y, q); if (q === 1 || q === 3) tx -= w - 1; if (q === 2 || q === 3) ty -= h - 1; return [tx, ty]; };
      const [hx, hy] = tr(bd.hall[0], bd.hall[1], 4, 3);
      base.x = hx; base.y = hy; base.cx = (hx + 2) * TILE; base.cy = (hy + 1.5) * TILE;
      for (const m of bd.minerals) {
        const [mx, my] = tr(m[0], m[1], 2, 1);
        const amt0 = bd.amount || (bd.rich ? 5000 : 1500);
        const res = { type: 'mineral', x: mx, y: my, w: 2, h: 1, amount: amt0, start: amt0, cx: (mx + 1) * TILE, cy: (my + 0.5) * TILE, miner: null, id: this.resources.length };
        this.resources.push(res); base.minerals.push(res);
        this.rect(mx, my, 2, 1, (x, y) => { this.blocked[this.idx(x, y)] = -2; this.walk[this.idx(x, y)] = 1; this.cliff[this.idx(x, y)] = 0; });
      }
      if (bd.geyser) {
        const [gx, gy] = tr(bd.geyser[0], bd.geyser[1], 4, 2);
        const g = { type: 'geyser', x: gx, y: gy, w: 4, h: 2, amount: bd.gas || 5000, cx: (gx + 2) * TILE, cy: (gy + 1) * TILE, building: null, id: this.resources.length };
        this.resources.push(g); base.geyser = g;
        this.rect(gx, gy, 4, 2, (x, y) => { this.blocked[this.idx(x, y)] = -3; this.walk[this.idx(x, y)] = 1; this.cliff[this.idx(x, y)] = 0; });
      }
      this.rect(hx - 1, hy - 1, 6, 5, (x, y) => { if (this.height[this.idx(x, y)] !== 2 || !this.cliff[this.idx(x, y)]) { this.walk[this.idx(x, y)] = 1; this.cliff[this.idx(x, y)] = 0; } });
      this.bases.push(base);
      if (bd.main) this.starts.push(base);
    }
    // start order: spread players across the map (diagonal first)
    const order = L.startOrder || [0, 3, 1, 2]; const mains = this.starts; this.starts = order.map(i => mains[i]).filter(Boolean); for (const b of mains) if (!this.starts.includes(b)) this.starts.push(b);
    for (const r of this.resources) this.rect(r.x, r.y, r.w, r.h, (x, y) => { this.cliff[this.idx(x, y)] = 0; });
    // Features go in after the bases so that a base's clearing pass cannot half-erase one, and before
    // the connectivity repair so that the repair sees them.
    this.placeFeatures(L);
    if (this.archetype) { this.flattenBases(); this.repairConnectivity(); }
    // Last, because it is the only pass that has to see what all the others did. See the block above
    // `_elevOpenH`: five earlier passes each open a tile for a good reason and any of them can leave a
    // hole in a cliff, so this cannot run until they have all had their turn. The seal comes first of
    // the two: "a plateau no ramp touches is an island" is only true once the holes are shut.
    this.sealElevations(); this.flattenStrandedHeight();
    this.wallRamps();        // after the seal, on heights that are final: see "ramps" below
    this.wallMinedGround();  // after the walls: the ground a mined-out patch leaves must obey them too
    this.placeNeutrals(L);   // after the seal: a site must sit on ground whose height is final
    this.resById = new Map(this.resources.map(r => [r.id, r]));
    for (const f of this.features) this.resById.set(f.id, f);   // see the MAP_FEATURES comment: this is what snapshots them
  }

  // ==========================================================================
  // NEUTRALS: where the wildlife is buried and where the derelicts stand.
  // ==========================================================================
  // A PLAN, not units. This runs inside the constructor, which every client re-runs identically from
  // the seed, so the plan is regenerated rather than transmitted -- exactly like `features`, and for
  // the same reason. G.spawnNeutrals turns it into units once, at G.init.
  //
  // Both toggles are opt-in per layout, resolved through DATA.derelictPresets / DATA.wildlifePresets
  // the way `hazard` resolves through HAZARDS. A layout with neither key gets the map it got before
  // any of this existed, which is what keeps every mission and every balance log in the repository
  // valid. No shipped layout sets either; the skirmish screen is what sets them.
  //
  // Determinism: one seeded stream, drawn in a fixed order, never Math.random. It is salted off the
  // map seed so two maps of one archetype do not bury their grubs in the same places.
  placeNeutrals(L) {
    this.neutrals = { wildlife: [], derelicts: [] };
    if (typeof DATA === 'undefined') return;
    const resolve = (key, table) => {
      const v = L && L[key]; if (!v || !table) return null;
      if (typeof v === 'object') return v;                                  // an inline preset
      return table[v === true ? 'standard' : v] || null;                    // ...or one by name
    };
    const dcfg = resolve('derelicts', DATA.derelictPresets), wcfg = resolve('wildlife', DATA.wildlifePresets);
    if (!dcfg && !wcfg) return;
    const R = Archetypes.rng((Math.imul(((L && L.seed) || this.seed || 1) >>> 0, 40503) ^ 0x9e37) >>> 0);
    for (let i = 0; i < 8; i++) R();

    const halls = this.bases.map(b => (b.hall ? b.hall : [b.x, b.y]));
    const resPts = this.resources.map(r => [r.x, r.y]);
    const D = (ax, ay, bx, by) => DMath.hypot(ax - bx, ay - by);
    const taken = [];
    // A site must be somewhere a unit could stand, clear of everything that already owns ground, and
    // clear of what the preset says to keep away from. Those clearances are the whole difference
    // between "wildlife on the ground you want to expand onto" and "a grub inside your main".
    const ok = (tx, ty, w, h, cfg, minEach) => {
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
        if (!this.inb(x, y) || x < 3 || y < 3 || x >= this.w - 3 || y >= this.h - 3) return false;
        const i = this.idx(x, y);
        if (this.walk[i] !== 1 || this.blocked[i] !== -1 || this.cliff[i] !== 0) return false;
        if (this.height[i] === 1) return false;                             // never on a ramp
        if (this.featTile && this.featTile[i] >= 0) return false;
      }
      for (const hh of halls) if (D(tx, ty, hh[0], hh[1]) < (cfg.minBase || 12)) return false;
      for (const rp of resPts) if (D(tx, ty, rp[0], rp[1]) < (cfg.minRes || 0)) return false;
      for (const t of taken) if (D(tx, ty, t[0], t[1]) < minEach) return false;
      return true;
    };
    // Candidates in a fixed scan order, then shuffled by the seeded stream. Scanning rather than
    // sampling means a cramped map degrades to "as many as fit" instead of looping forever.
    const cands = [];
    for (let y = 4; y < this.h - 4; y += 2) for (let x = 4; x < this.w - 4; x += 2) if (this.walk[this.idx(x, y)] === 1) cands.push([x, y]);
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = cands[i]; cands[i] = cands[j]; cands[j] = t; }

    if (dcfg) {
      const kinds = dcfg.kinds || [];
      for (let n = 0; n < (dcfg.count || 0) && kinds.length; n++) {
        const id = kinds[n % kinds.length], def = DATA.buildings[id]; if (!def) continue;
        const spot = cands.find(c => ok(c[0], c[1], def.w, def.h, dcfg, dcfg.minEach || 12));
        if (!spot) break;
        taken.push(spot); this.neutrals.derelicts.push({ id, tx: spot[0], ty: spot[1] });
      }
    }
    if (wcfg) {
      // `nearRes` is the point of the feature: sites sit on the ground you want to expand onto, so
      // candidates near a patch come first and everything else is the fallback, not the rule.
      const near = cands.filter(c => resPts.some(rp => D(c[0], c[1], rp[0], rp[1]) <= (wcfg.nearRes || 8) + 6));
      const order = near.concat(cands);
      const kinds = wcfg.kinds || [];
      const total = kinds.reduce((a, k) => a + k[1], 0) || 1;
      for (let n = 0; n < (wcfg.sites || 0) && kinds.length; n++) {
        // Weighted, but CYCLED rather than sampled. A weighted draw of five sites can legitimately
        // roll five grubs and no warren, and a wildlife setting that did nothing visible is a setting
        // the player will report as broken.
        let acc = (n * total / (wcfg.sites || 1)) % total + 0.0001, pickId = kinds[0][0];
        for (const kw of kinds) { acc -= kw[1]; if (acc <= 0) { pickId = kw[0]; break; } }
        const def = DATA.all[pickId]; if (!def) continue;
        const w = def.w || 1, h = def.h || 1;
        const spot = order.find(c => ok(c[0], c[1], w, h, wcfg, 10));
        if (!spot) break;
        taken.push(spot);
        const lo = (wcfg.pack && wcfg.pack[0]) || 1, hi = (wcfg.pack && wcfg.pack[1]) || lo;
        const isB = !!DATA.buildings[pickId];
        this.neutrals.wildlife.push({ id: pickId, tx: spot[0], ty: spot[1], pack: isB ? 1 : lo + Math.floor(R() * (hi - lo + 1)) });
      }
    }
  }

  // ---------------- features ----------------
  //
  // READ-ONLY QUERY CONTRACT. This is everything js/render.js, js/hud.js, js/ui.js and js/ai.js are
  // meant to use, and none of it mutates anything. Nothing outside js/map.js should read `features`,
  // `featTile` or the grids directly to decide what a feature is doing -- ask here instead, because
  // these five are the only things guaranteed to stay true across a snapshot restore.
  //
  //   map.featureView(frame)    an array of plain values, one per feature, safe to call every frame:
  //                             { id, kind, name, x, y, w, h, cx, cy, hp, maxHp, broken, open,
  //                               height, wet, warning, until }
  //                             `open` is the live passability of its tiles; `broken` is whether it
  //                             has been destroyed; the two differ for a tidal channel, which is shut
  //                             while it is `wet` and intact. `warning` is the eight seconds before a
  //                             flood, which is when to run water up the channel, and `until` is the
  //                             frames left in the current half of the cycle. `frame` may be omitted,
  //                             in which case G.frame is used.
  //   map.featureRev()          a small integer that changes when, and only when, some feature's
  //                             terrain changed. INVALIDATE THE TERRAIN CHUNK CACHE ON IT: Terrain
  //                             bakes `cliff`, `walk` and `height` into chunk canvases and will
  //                             happily draw a bridge that is no longer there for the rest of the
  //                             game. `Terrain.chunks.clear()` when the number moves is enough. It is
  //                             derived from the grids, not counted, so it is right after a seek too.
  //   map.featureAt(tx,ty)      the feature occupying a tile, or null. Cheap: one array lookup.
  //   map.featureAtPx(px,py)    the same in world pixels -- what a click, or a shot, should ask.
  //   map.featureOpen(f)        can ground units cross it right now.
  //
  // WHAT IS NOT WIRED, and where it goes. A feature has hit points and `map.damageFeature(f, amount)`
  // takes them off. Wired since M13 -- Combat.splash and the storm in js/abilities.js call
  // damageFeatureAt -- so a siege tank, a reaver or a nuke opens a lane. Written when every file that
  // fires a weapon belonged to another change; the three call sites it named are kept for the record:
  //   * js/combat.js Combat.splash(), after the unit loop:
  //       G.map.damageFeatureAt(x, y, dmg);
  //     That alone makes siege tanks, reavers and nukes able to open a lane, which is most of it.
  //   * js/sim.js / js/ui.js: an attack order whose target is a feature. `map.featureAtPx` under the
  //     cursor gives you one, and it is safe to hold across a snapshot -- features are in
  //     G.map.resById, so Snapshot tags a reference to one the way it tags a mineral patch, and
  //     js/commands.js `deref` already resolves the "r<id>" form.
  //   * js/ai.js: an AI that never clears the rocks in front of its third base is playing a different
  //     map from the human. `map.featureAt` on the path to an expansion is the question to ask.
  // Until those land the dynamic half still runs -- tidal channels flood on their own -- and the
  // destructible half is reachable only from a test. That is deliberate: half a feature that is
  // correct is worth more than a whole one spread over five files nobody owns.
  //
  // Quadrant-0 definitions, mirrored exactly as the bases are. A feature that would land on a
  // resource, inside a base's cleared footprint, on the map border or on top of another feature is
  // dropped whole rather than half-placed, which keeps every quadrant's copy identical or absent.
  // ==========================================================================
  // CRATERS, WRECKAGE AND STRIPPED GROUND -- M11 wave one, ideas 9 and 1.
  // ==========================================================================
  // "The map remembers what happened on it." Two mechanisms, one grid and one list, because the two
  // halves of that sentence want opposite lifetimes.
  //
  //   this.scar   Uint8Array, one byte a tile, 0..255 of churn. PERMANENT. Written by explosions, by
  //               anything large dying, and -- this is the attrition economy -- by mining, so a base
  //               that has been worked for twenty minutes is visibly stripped down to bare rock and
  //               stays that way. It is the map's memory and it never heals. It costs movement (see
  //               Unit.speed) and it is what the renderer darkens.
  //
  //   this.wrecks A list of hulks, each blocking its own footprint. TEMPORARY. A wreck raises height,
  //               which is the only lever this engine has that moves vision -- see the MAP_FEATURES
  //               comment -- so a hulk occludes its own tiles from anything standing lower, exactly
  //               the way a cliff does. It does NOT cast a shadow behind itself, because G.updateVision
  //               stamps a height-tested radius rather than casting rays, and turning that into a
  //               raycast is a much larger change with a real per-frame cost. Blocking pathing is the
  //               whole effect; occluding the hulk itself is a bonus the height grid gave for free.
  //
  // Why wreckage decays and craters do not. Permanent wreckage was the first version and it is a trap:
  // at a 500 supply cap a long game razes hundreds of buildings, every one of them becomes terrain, and
  // the map slowly bricks itself shut -- you can never rebuild on a base you lost, and by minute forty
  // the pathfinder is threading an army through a scrapyard. So a hulk is a tactical obstacle that
  // changes one fight and then clears, and the crater it leaves behind is the part that lasts.
  //
  // Determinism. Nothing here reads a clock except through the frame passed in, and nothing calls
  // Math.random. `scar` is captured by js/snapshot.js as a SPARSE pair list rather than a dense 16k
  // array like creep/walk/blocked: craters are sparse by nature and a fourth dense grid in every
  // checkpoint is real bytes for no reason. `wrecks` is captured whole; `syncWrecks` puts height, cliff
  // and blocked back afterwards: the snapshot restores `height` but not `cliff`, and Snapshot.restore
// repaints the hulk's tiles on top of the restored grid so the two agree.
  crater(px, py, rTiles, amount) {
    const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE), r = Math.max(0, rTiles);
    const r2 = r * r, ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
      const d2 = dx * dx + dy * dy; if (d2 > r2) continue;
      const x = cx + dx, y = cy + dy; if (!this.inb(x, y)) continue;
      const i = this.idx(x, y);
      // Falls off from the centre, so a blast leaves a bowl rather than a disc, and clamps rather than
      // wrapping -- a Uint8Array wraps silently at 256 and a heavily shelled tile would come back clean.
      const fall = 1 - Math.sqrt(d2) / (r || 1);
      const v = this.scar[i] + amount * fall;
      this.scar[i] = v > 255 ? 255 : v < 0 ? 0 : v | 0;
    }
  }
  scarAt(px, py) { const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE); return this.inb(tx, ty) ? this.scar[this.idx(tx, ty)] / 255 : 0; }
  // Sparse (index, value) pairs for the snapshot, and the inverse. Order is index order, so two clients
  // that scarred the same tiles in a different order still produce byte-identical checkpoints.
  scarPairs() { const out = []; for (let i = 0; i < this.scar.length; i++) if (this.scar[i]) out.push(i, this.scar[i]); return out; }
  loadScar(pairs) { this.scar.fill(0); for (let k = 0; k < (pairs || []).length; k += 2) this.scar[pairs[k]] = pairs[k + 1]; }

  // A hulk. `life` is in frames; `born` is the frame it died on, so the decay is a pure function of the
  // current frame and a restored wreck is exactly as rotten as the live one.
  addWreck(px, py, w, h, life, frame, big) {
    // px,py is the CENTRE, which is where a building's x,y already is, so the top-left is the centre
    // less half the footprint. Doing this with floor() and a shift instead was off by one on even
    // widths -- a 4x3 factory left its hulk a tile north-west of where it stood.
    const tx = Math.round(px / TILE - w / 2), ty = Math.round(py / TILE - h / 2);
    const tiles = [];
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
      if (!this.inb(x, y)) continue; const i = this.idx(x, y);
      // Only free walkable ground becomes a hulk. Dropping one on a mineral line, a cliff or another
      // building's footprint would unblock those tiles again when it decayed -- the wreck would hand
      // back terrain it never owned. Same reason placeFeatures refuses an occupied tile.
      if (this.blocked[i] !== -1 || this.walk[i] !== 1 || this.cliff[i] !== 0) continue;
      tiles.push(i);
    }
    if (!tiles.length) return null;
    const wk = { tiles, baseH: Array.from(tiles, i => this.height[i]), born: frame, life, big: !!big };
    this.wrecks.push(wk); this.paintWreck(wk, true); return wk;
  }
  // A hulk only ever touches tiles it OWNS, in both directions, and that is not defensive tidiness --
  // it is a bug that a snapshot found. A building can win the race for a tile a hulk is standing on:
  // the AI checks canPlace when it PICKS a spot and calls placeBuilding some frames later, so a hulk
  // that appeared in between is not seen. The first version overwrote blocked[] regardless, which meant
  // the hulk believed it owned a live building's footprint -- and when it decayed it set those tiles
  // walkable and unblocked, handing a standing factory back to the pathfinder as open ground. It also
  // broke the snapshot round trip, which is how it surfaced: syncWrecks clobbered the building id the
  // checkpoint had faithfully restored, and a fresh process diverged 144 frames later.
  paintWreck(wk, on) {
    for (let k = 0; k < wk.tiles.length; k++) {
      const i = wk.tiles[k];
      if (on) {
        if (this.blocked[i] !== -1 && this.blocked[i] !== WRECK_BLOCKED) continue;   // someone else owns it
        this.walk[i] = 0; this.blocked[i] = WRECK_BLOCKED;
        // Height 2, not baseH + 1. Two reasons. A hulk dropped on ground that was ALREADY height 1 -- a
        // ramp -- lifted nothing at all and occluded nothing, which is where a wreck matters most. And
        // height 1 is not a free value: it means "ramp" to the terrain painter, to canPlace and to
        // recomputeCreep. 2 means high ground, which is what a hulk is, and G.updateVision's
        // `height[i] <= uh` then hides it from anything on the ground while leaving it visible from the
        // air. That asymmetry is right: you cannot see into a burning hulk from beside it, and you can
        // from above it.
        this.height[i] = 2;
      } else {
        if (this.blocked[i] !== WRECK_BLOCKED) continue;   // not ours any more: touch no grid at all
        this.walk[i] = 1; this.height[i] = wk.baseH[k]; this.blocked[i] = -1;
      }
    }
  }
  // Idempotent and clock-free, exactly like syncFeature and called for the same reason: a snapshot
  // restores `wrecks`, `walk`, `blocked` and (since the crater rule) `height`, but not `cliff`, so
  // something has to repaint the hulk's tiles so cliff and blocked agree with the height underneath, and
  // this is safe to run halfway through a restore.
  syncWrecks() { for (const wk of this.wrecks) this.paintWreck(wk, true); return this.wrecks.length; }

  // ---- the force field, which is TERRAIN --------------------------------------------------------
  // M12 item 12's sibling mechanic. It lived on GameMap.prototype at the top of js/abilities.js while
  // three race branches were editing in parallel and none of them owned this file; the note there said
  // to move it here verbatim at the next merge, and this is that. Moving it also drops the
  // `typeof GameMap !== 'undefined' && !GameMap.prototype.raiseForceField` guard it needed, which was
  // load-order-sensitive in exactly the direction that fails quietly -- abilities.js before map.js and
  // a Sentry raises nothing at all.
  //
  // WHY THE TILE LIST LIVES IN G.fields AND NOTHING COUNTS DOWN HERE. The sandstorm comment above is
  // the rule: anything with a timer a replay seek must reproduce has to be state the snapshot carries
  // or a pure function of the frame. `walk` is in the snapshot and so is G.fields, so a restored
  // checkpoint comes back with the same wall standing and the same number of frames left on it. A
  // countdown remembered inside the map -- the obvious first shape -- would restore to a fresh one and
  // the wall would expire dozens of frames late, a desync nothing would notice for minutes.
  //
  // A tile is only CLAIMED if it is plain open ground, exactly the rule addWreck uses and for the same
  // reason: whatever we set back to walkable on expiry, we must have taken. Cliffs, buildings, mineral
  // lines, hulks and destructible features are all skipped, so a Force Field can never hand back
  // terrain it never owned.
  raiseForceField(px, py, r) {
    const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE), tiles = [];
    if (!this.inb(cx, cy)) return tiles;
    this.ellipse(cx, cy, r, r, (x, y) => {
      const i = this.idx(x, y);
      if (this.walk[i] !== 1 || this.blocked[i] !== -1 || this.cliff[i] !== 0) return;
      if (this.featTile && this.featTile[i] >= 0) return;   // a destructible's own tiles open and shut on their own schedule
      tiles.push(i);
    });
    for (const i of tiles) this.walk[i] = 0;
    return tiles;
  }
  clearForceField(tiles) {
    for (const i of tiles) if (this.walk[i] === 0) this.walk[i] = 1;
  }
  // Decay. Called once a frame by G.tick; returns how many cleared, which is what tells the renderer
  // its chunk cache is stale.
  tickWrecks(frame) {
    let n = 0;
    for (let k = this.wrecks.length - 1; k >= 0; k--) {
      const wk = this.wrecks[k];
      if (frame - wk.born < wk.life) continue;
      this.paintWreck(wk, false); this.wrecks.splice(k, 1); n++;
    }
    return n;
  }

  placeFeatures(L) {
    const defs = L.features || []; if (!defs.length) return;
    const baseRects = this.bases.map(b => [b.x - 2, b.y - 2, 8, 7]);
    const free = (x, y, K) => {
      if (!this.inb(x, y) || x < 2 || y < 2 || x >= this.w - 2 || y >= this.h - 2) return false;
      const i = this.idx(x, y);
      if (this.blocked[i] !== -1) return false;                                      // resources, buildings
      // A feature that decides its own height may only stand on ground already at that height. For the
      // spire -- the only one -- that reads "a pillar stands on the floor": not in a ramp, which was
      // the original rule here, and now not on a plateau either. A spire on high ground would collapse
      // into a walkable height-0 pit inside a plateau, which is a hole in the cliff that arrives in the
      // middle of a game and cannot be sealed at generation. See the elevation block below.
      if (K.openHeight !== null && this.height[i] !== K.openHeight) return false;
      if (this.featTile && this.featTile[i] >= 0) return false;
      for (const r of baseRects) if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) return false;
      return true;
    };
    for (const q of GameMap.quadrantsOf(L)) for (const fd of defs) {
      if (fd.quadrants && !fd.quadrants.includes(q)) continue;
      const K = MAP_FEATURES[fd.kind]; if (!K) continue;
      const w = Math.max(1, fd.w | 0), h = Math.max(1, fd.h | 0);
      let [tx, ty] = this.mirrorPt(fd.x, fd.y, q); if (q === 1 || q === 3) tx -= w - 1; if (q === 2 || q === 3) ty -= h - 1;
      const tiles = [];
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) { if (!free(x, y, K)) { tiles.length = 0; break; } tiles.push(this.idx(x, y)); }
      if (tiles.length !== w * h) continue;
      if (!this.featTile) { this.featTile = new Int32Array(this.w * this.h).fill(-1); }
      const fi = this.features.length;
      const f = { id: FEATURE_ID0 + fi, kind: fd.kind, fi, x: tx, y: ty, w, h, cx: (tx + w / 2) * TILE, cy: (ty + h / 2) * TILE, hp: K.hp, maxHp: K.hp };
      // Static geometry, hidden from Object.keys so Snapshot neither serialises it into every
      // checkpoint nor deletes it when it applies one. Regenerated identically by the constructor.
      Object.defineProperty(f, 'tiles', { value: tiles, enumerable: false });
      Object.defineProperty(f, 't0', { value: tiles[0], enumerable: false });
      Object.defineProperty(f, 'baseH', { value: Uint8Array.from(tiles, i => this.height[i]), enumerable: false });
      Object.defineProperty(f, '_m', { value: this, enumerable: false });
      // `broken` is an accessor on purpose: Snapshot.restore assigns straight through it, and that
      // assignment is the only chance the map gets to put `cliff` back and repaint `height` on top of
      // the restored grid -- `cliff` is the one the snapshot does not carry. See the MAP_FEATURES comment.
      let brk = false;
      Object.defineProperty(f, 'broken', { enumerable: true, configurable: true, get() { return brk; }, set(v) { brk = !!v; f._m.syncFeature(f); } });
      for (const i of tiles) this.featTile[i] = fi;
      this.features.push(f);
      // The opening state, painted from frame 0 rather than from syncFeature -- a tidal channel is cut
      // out of the river band it crosses, so its tiles start unwalkable and syncFeature, which reads
      // the grid on purpose, would take that for the tide being in.
      this.paintFeature(f, K.tide ? !this.tideState(f, 0).wet : K.intactOpen);
    }
  }
  // Write a feature's tiles for one state. The only function that touches terrain on their behalf.
  paintFeature(f, open) {
    const K = MAP_FEATURES[f.kind], hv = open ? K.openHeight : K.shutHeight;
    for (let k = 0; k < f.tiles.length; k++) {
      const i = f.tiles[k];
      this.height[i] = hv === null ? f.baseH[k] : hv;
      if (open) { this.walk[i] = 1; this.cliff[i] = 0; if (this.blocked[i] === FEAT_BLOCKED) this.blocked[i] = -1; }
      else { this.walk[i] = 0; this.cliff[i] = K.shutCliff; if (this.blocked[i] === -1) this.blocked[i] = FEAT_BLOCKED; }
    }
  }
  // Put the derived grids back in step with one feature's state, reading no clock. A standing tidal
  // lane is left exactly as it is, because whether it is wet right now is the frame's business and
  // the snapshot already restored `walk` for it -- so this is safe to call at any moment, including
  // halfway through a restore, which is precisely when it is called.
  syncFeature(f) {
    const K = MAP_FEATURES[f.kind];
    if (K.tide && !f.broken) this.paintFeature(f, this.walk[f.t0] === 1);
    else this.paintFeature(f, f.broken ? !K.intactOpen : K.intactOpen);
  }
  syncFeatures() { for (const f of this.features) this.syncFeature(f); return this.features.length; }
  featureAt(tx, ty) { if (!this.featTile || !this.inb(tx, ty)) return null; const fi = this.featTile[this.idx(tx, ty)]; return fi >= 0 ? this.features[fi] : null; }
  featureAtPx(px, py) { return this.featureAt(Math.floor(px / TILE), Math.floor(py / TILE)); }
  featureOpen(f) { return this.walk[f.t0] === 1; }
  // Where a tidal lane is in its cycle at a frame. Pure function of the frame, like the sandstorm and
  // for the same reason: nothing here may remember a countdown across a snapshot.
  tideState(f, frame) {
    const t = MAP_FEATURES[f.kind].tide; if (!t) return null;
    const ph = ((frame % t.period) + t.period) % t.period;
    // The flood sits in the middle of the cycle rather than at its end, so a cycle is dry, warning,
    // wet, dry -- one rise and one fall inside every period, which is what the HUD wants to count.
    const start = Math.round((t.period - t.wet) / 2), end = start + t.wet, wet = ph >= start && ph < end;
    return { phase: ph, period: t.period, wet, warning: !wet && ph >= start - t.warn && ph < start,
      until: wet ? end - ph : ph < start ? start - ph : t.period - ph + start };
  }
  // A number that changes whenever any feature's terrain changed, and never otherwise. Derived from
  // the grids rather than counted, so it is still right after a snapshot restore -- the renderer keys
  // its cached terrain chunks on it (see the contract above tickHazard).
  featureRev() { let h = 0; for (const f of this.features) h = (Math.imul(h, 31) + (f.broken ? 2 : 0) + (this.walk[f.t0] === 1 ? 1 : 0)) | 0; return h; }
  // Everything the renderer, the HUD and the AI are allowed to know, as plain values.
  featureView(frame) {
    return this.features.map(f => {
      const K = MAP_FEATURES[f.kind], td = K.tide ? this.tideState(f, frame == null ? (typeof G !== 'undefined' ? G.frame : 0) : frame) : null;
      return { id: f.id, kind: f.kind, name: K.name, x: f.x, y: f.y, w: f.w, h: f.h, cx: f.cx, cy: f.cy,
        hp: f.hp, maxHp: f.maxHp, broken: f.broken, open: this.walk[f.t0] === 1, height: this.height[f.t0],
        wet: !!td && td.wet, warning: !!td && td.warning, until: td ? td.until : 0 };
    });
  }

  // Damage and destruction. `amount` is raw hit points: features have no armour, no shields and no
  // facing, because none of those are decisions anyone makes about a rock.
  damageFeature(f, amount) {
    if (!f || f.broken || !(amount > 0)) return f ? f.hp : 0;
    f.hp -= amount;
    if (f.hp <= 0) this.breakFeature(f);
    return Math.max(0, f.hp);
  }
  damageFeatureAt(px, py, amount) { const f = this.featureAtPx(px, py); return f ? this.damageFeature(f, amount) : 0; }
  breakFeature(f) {
    if (!f || f.broken) return false;
    f.hp = 0;
    const wasOpen = this.walk[f.t0] === 1;
    f.broken = true;                       // the setter repaints the tiles; see placeFeatures
    if (wasOpen && this.walk[f.t0] !== 1) this.crush(f);
    this.sayAt(f, FEATURE_SAYS[f.kind] || 'The ground has changed.');
    return true;
  }
  // Tell the players who can SEE it. A map-wide announcement would be a free sensor: drop a bridge in
  // a corner nobody has scouted and everyone learns that someone is in that corner.
  sayAt(f, text) {
    if (typeof G === 'undefined' || G.map !== this || !G.players) return;
    for (const p of G.players) if (G.visibleAt(p.id, f.cx, f.cy)) p.msg(text, 'attack');
  }
  // Ground that stops being ground takes what was standing on it. Air is fine, cargo is fine, and a
  // building cannot be there in the first place -- canPlace refuses a feature's tiles.
  //
  // The `G.map === this` test in here and in sayAt is not paranoia: the editor's validation pass, the
  // map preview and every test in the repository build a GameMap that is not the one being played,
  // and a feature broken on one of those must not reach into the live game and kill things in it.
  crush(f, units) {
    const list = units || (typeof G !== 'undefined' && G.map === this ? G.units : null);
    if (!list) return 0;
    let n = 0;
    for (const u of [...list]) {
      if (!u.alive || u.fly || u.inside || u.isBuilding) continue;
      const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE);
      if (this.featureAt(tx, ty) !== f) continue;
      n++; G.kill(u, null);
    }
    return n;
  }
  // One frame of every dynamic feature. Called from tickHazard, which is the map's single per-frame
  // entry point from G.tick; see the contract there. Writes only when the state actually changed, so
  // the usual frame costs two comparisons a feature and does not churn the renderer's chunk cache.
  tickFeatures(frame, units) {
    let changed = 0;
    for (const f of this.features) {
      const K = MAP_FEATURES[f.kind]; if (!K.tide || f.broken) continue;
      const want = !this.tideState(f, frame).wet, have = this.walk[f.t0] === 1;
      if (want === have) continue;
      this.paintFeature(f, want); changed++;
      if (!want) { this.crush(f, units); this.sayAt(f, 'The channel is flooding.'); }
    }
    return changed;
  }

  // ---------------- connectivity, with every feature against you ----------------
  // The walkability grid as it would be if every feature on the map were in its MOST BLOCKING state at
  // once: rocks and spires standing, bridges dropped, channels flooded. Every feature's other state
  // only ever adds walkable ground, so a map that is connected here is connected in all 2^n
  // combinations -- which is how "destroying everything never strands a player" is a property of the
  // map and not a property of the game that happened to be played on it.
  worstWalk() { const w = this.walk.slice(); for (const f of this.features) for (const i of f.tiles) w[i] = 0; return w; }
  // 4-way flood over a walkability grid. 4-way rather than 8-way on purpose: the pathfinder refuses to
  // cut a corner between two blocked tiles, so a diagonal-only join is not a route.
  floodWalk(w, sx, sy) {
    const seen = new Uint8Array(w.length); if (!this.inb(sx, sy)) return seen;
    const q = [this.idx(sx, sy)]; seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % this.w, y = (i / this.w) | 0;
      if (x > 0 && !seen[i - 1] && w[i - 1] === 1) { seen[i - 1] = 1; q.push(i - 1); }
      if (x < this.w - 1 && !seen[i + 1] && w[i + 1] === 1) { seen[i + 1] = 1; q.push(i + 1); }
      if (y > 0 && !seen[i - this.w] && w[i - this.w] === 1) { seen[i - this.w] = 1; q.push(i - this.w); }
      if (y < this.h - 1 && !seen[i + this.w] && w[i + this.w] === 1) { seen[i + this.w] = 1; q.push(i + this.w); }
    }
    return seen;
  }
  // A tile inside a base that a worker could stand on. Not the hall's own corner, which is under the
  // town hall the moment the game starts.
  baseAnchor(b) { const t = this.findFreeTile(b.x + 2, b.y + 4, 8) || this.findFreeTile(b.x + 2, b.y + 1, 10); return t ? this.idx(t[0], t[1]) : this.idx(b.x + 2, b.y + 1); }
  // What is wrong with this map, in the words a generator or the editor would want. Empty is good.
  connectivityProblems(hallDef) {
    const out = [], w = this.worstWalk();
    if (!this.starts.length) return ['no start locations'];
    const seen = this.floodWalk(w, this.starts[0].x + 2, this.starts[0].y + 4);
    for (const b of this.bases) if (!seen[this.baseAnchor(b)]) out.push('base ' + b.x + ',' + b.y + ' unreachable with every feature shut');
    if (hallDef) for (const b of this.bases) { const e = this.canPlace(hallDef, b.x, b.y, { id: 0 }, [], null); if (e) out.push('base ' + b.x + ',' + b.y + ': ' + e); }
    return out;
  }
  // Make the hall's footprint buildable by force: one height over the whole clearing, no cliff, no
  // rock. Archetype maps only, because it moves ground and every hand-written layout was drawn with
  // its bases already legal. It flattens to the height of the hall's own centre, so a main on a
  // plateau stays on the plateau instead of having a hole cut in it.
  flattenBases() {
    for (const b of this.bases) {
      const h = this.height[this.idx(b.x + 1, b.y + 1)] === 1 ? 0 : this.height[this.idx(b.x + 1, b.y + 1)];
      this.rect(b.x - 1, b.y - 1, 6, 5, (x, y) => { const i = this.idx(x, y); if (this.blocked[i] !== -1) return; this.height[i] = h; this.cliff[i] = 0; this.walk[i] = 1; });
    }
  }
  // The safety net that makes a random generator legal. Floods with every feature shut and, for any
  // base it cannot reach, carves the cheapest corridor to reachable ground -- cost 0 through ground
  // that is already walkable and 1 through anything else, so the carve is as short as the map allows.
  // The carve is mirrored, because a repair that fixed one player's quadrant and not the other three
  // would be worse than the fault it fixed. Returns the number of tiles it had to open.
  repairConnectivity() {
    if (!this.starts.length) return 0;
    let w = this.worstWalk(), carved = 0;
    let seen = this.floodWalk(w, this.starts[0].x + 2, this.starts[0].y + 4);
    const border = i => { const x = i % this.w, y = (i / this.w) | 0; return x < 3 || y < 3 || x >= this.w - 3 || y >= this.h - 3; };
    for (const b of this.bases) {
      const a = this.baseAnchor(b);
      if (seen[a]) continue;
      // 0-1 BFS, one bucket per cost: a free step stays in the bucket being drained, a paid step goes
      // into the next one. Linear, where a heap or a spliced deque would not be on a 256x256 grid.
      const dist = new Int32Array(w.length).fill(0x7fffffff), from = new Int32Array(w.length).fill(-1);
      let cur = [a], next = [], d = 0, goal = -1; dist[a] = 0;
      while (cur.length && goal < 0) {
        for (let h = 0; h < cur.length && goal < 0; h++) {
          const i = cur[h]; if (dist[i] !== d) continue;
          if (seen[i]) { goal = i; break; }
          const x = i % this.w, y = (i / this.w) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy; if (nx < 2 || ny < 2 || nx >= this.w - 2 || ny >= this.h - 2) continue;
            const j = ny * this.w + nx;
            if (this.featTile && this.featTile[j] >= 0) continue;            // never carve through a feature: it is shut by assumption
            if (this.blocked[j] !== -1 && this.blocked[j] !== FEAT_BLOCKED) continue;   // nor through a mineral line
            const nd = d + (w[j] === 1 ? 0 : 1);
            if (nd >= dist[j]) continue;
            dist[j] = nd; from[j] = i;
            if (nd === d) cur.push(j); else next.push(j);
          }
        }
        if (goal < 0) { cur = next; next = []; d++; }
      }
      if (goal < 0) continue;                                                // nothing to join to; connectivityProblems will say so
      for (let i = goal; i !== -1 && i !== a; i = from[i]) {
        if (w[i] === 1) continue;
        const x = i % this.w, y = (i / this.w) | 0;
        this.sym(x, y, (px, py) => {
          const k = this.idx(px, py); if (border(k) || (this.featTile && this.featTile[k] >= 0) || this.blocked[k] !== -1) return;
          if (this.walk[k] !== 1) carved++;
          this.walk[k] = 1; this.cliff[k] = 0; if (this.height[k] === 2) this.height[k] = 1;   // a cut through a plateau is a ramp
        });
      }
      w = this.worstWalk(); seen = this.floodWalk(w, this.starts[0].x + 2, this.starts[0].y + 4);
    }
    return carved;
  }

  // ---------------- elevations: a ramp is the only way up ----------------
  //
  // The engine's one rule about elevation is `G.updateVision`'s `m.height[i] <= uh`: a unit sees a
  // tile only if the tile is not above it. Everything high ground is worth -- the vision it denies,
  // and now the range and damage `heightAdvantage` prices -- rests on that one comparison, and the one
  // comparison rests on a promise nothing in this file used to keep: **that the only walkable join
  // between low ground and high ground is a ramp.**
  //
  // Generation never set out to break it. A plateau is painted at height 2 and every height-2 tile
  // with a low 8-neighbour is turned into an unwalkable cliff, so the cliff ring seals the plateau and
  // the ramp rectangles are the doors punched through it. What breaks it is the five passes that run
  // AFTERWARDS and each have a good reason to make a tile walkable:
  //
  //   * a mineral patch or a geyser is forced walkable and un-cliffed wherever it lands, so a resource
  //     that straddles a cliff edge is a staircase;
  //   * a base's clearing pass opens its own footprint;
  //   * `flattenBases` levels a 6x5 to the hall's own height, which RAISES ground when the hall centre
  //     is up and the rest of the clearing is down;
  //   * a causeway lowers plateau tiles to 0 and opens them;
  //   * `repairConnectivity` carves.
  //
  // **And one of them had already done it, in a layout that shipped from M1 to the looks queue.** The old
  // Twilight Valley's rich expansion had its geyser at 98,34, four tiles wide, on the southern lip of the
  // map's biggest plateau -- so tiles 98..101,35 were height 2, walkable, and directly north of open low
  // ground at y 36. That was a four-tile-wide undrawn ramp onto the high ground of the map's most
  // valuable base, in two quadrants, and it was invisible: the terrain painter drew a cliff face there
  // because `cliff[]` said cliff, while `walk[]` said walk. Nothing had ever looked, because nothing
  // had ever had a reason to: while height only gated vision, a hole in a cliff cost a few tiles of
  // fog. The moment it also gates range and damage it is a free flank.
  //
  // `sealElevations` runs at the end of every generation, including the editor's, and closes them. The
  // repair is deliberately the WEAKEST one that works: a tile you can step onto from below is not high
  // ground, it is a slope, so it is demoted to height 1 and left walkable. That can never disconnect
  // anything -- `walk[]` is not touched, so every flood fill in the repository sees exactly the map it
  // saw before -- and it cannot make a plateau unreachable, because it only ever turns a way up into
  // an honest way up. What it does change is that standing in that spot no longer hides you and no
  // longer pays you, which is the point.
  //
  // Two tiles it will not demote, and what it does instead:
  //   * anything inside a base's 6x5 hall clearing. `canPlace` refuses a ramp outright and refuses
  //     uneven ground, so one demoted tile in a footprint takes the base away. The low side of the
  //     pair is demoted instead, which reads as a slope up to a shelf and leaves the hall level.
  //   * a feature tile whose kind decides its own height -- the spire, which is 2 while it stands and
  //     0 once it falls. Those are skipped and the other side of the pair is taken.
  // A feature whose height is `null` (rocks, bridge, floodgate: "whatever the ground was") is demoted
  // through its `baseH` as well as its `height`, so clearing a rock formation that was sitting on a
  // sealed lip leaves the lip sealed rather than reopening the hole.
  //
  // The scan asks about the ground in its MOST WALKABLE state, the mirror image of `worstWalk`'s most
  // blocking one: a feature tile counts as walkable at the height it presents when it is open, whether
  // or not it is open now. So a rock formation standing on a cliff lip is sealed at generation, and
  // the seal is still there in the 2^n combination where someone has cleared it.
  _elevOpenH(i) {
    const fi = this.featTile ? this.featTile[i] : -1;
    if (fi < 0) return this.walk[i] === 1 ? this.height[i] : -1;
    const f = this.features[fi], K = MAP_FEATURES[f.kind], k = f.tiles.indexOf(i);
    return K.openHeight === null ? (k >= 0 ? f.baseH[k] : this.height[i]) : K.openHeight;
  }
  // Every 4-adjacent (high, low) pair of ever-walkable tiles, in row-major order. cb(iHigh, iLow).
  _elevEdges(cb) {
    const W = this.w, H = this.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (this._elevOpenH(i) !== 2) continue;
      if (x < W - 1 && this._elevOpenH(i + 1) === 0 && cb(i, i + 1) === false) continue;
      if (x > 0 && this._elevOpenH(i - 1) === 0 && cb(i, i - 1) === false) continue;
      if (y < H - 1 && this._elevOpenH(i + W) === 0 && cb(i, i + W) === false) continue;
      if (y > 0 && this._elevOpenH(i - W) === 0 && cb(i, i - W) === false) continue;
    }
  }
  // Demote one tile to a ramp, taking a feature's remembered ground with it. Refuses the tiles whose
  // height belongs to a feature kind rather than to the map. Returns 1 if it changed anything.
  _demoteToRamp(i) {
    const fi = this.featTile ? this.featTile[i] : -1;
    if (fi >= 0) {
      const f = this.features[fi], K = MAP_FEATURES[f.kind], k = f.tiles.indexOf(i);
      if (K.openHeight !== null || k < 0 || f.baseH[k] === 1) return 0;
      // Through `syncFeature`, never by hand: a shut rock formation's tiles have to keep `walk` 0 and
      // `cliff` 2 or they draw as open ground you cannot walk on. paintFeature is the only thing that
      // knows that, and it now reads the demoted `baseH`.
      f.baseH[k] = 1; this.syncFeature(f);
      return 1;
    }
    if (this.height[i] === 1) return 0;
    this.height[i] = 1; this.cliff[i] = 0;
    return 1;
  }
  sealElevations() {
    const keep = new Uint8Array(this.w * this.h);
    for (const b of this.bases) this.rect(b.x - 1, b.y - 1, 6, 5, (x, y) => { keep[this.idx(x, y)] = 1; });
    let n = 0;
    this._elevEdges((hi, lo) => {
      if (!keep[hi] && this._demoteToRamp(hi)) { n++; return false; }   // false: this tile is settled
      if (!keep[lo]) n += this._demoteToRamp(lo);
      return true;
    });
    return n;
  }
  // Every connected region of walkable high ground, with the ramp tiles that touch it and the bases
  // that stand on it. 4-way, like `floodWalk` and for the same reason: a diagonal join is not a route.
  plateaus() {
    const W = this.w, H = this.h, comp = new Int32Array(W * H).fill(-1), out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i0 = y * W + x;
      if (comp[i0] >= 0 || this.walk[i0] !== 1 || this.height[i0] !== 2) continue;
      const id = out.length, q = [i0], ramps = new Set(); comp[i0] = id;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], cx = i % W, cy = (i / W) | 0;
        if (cx > 0) this._platStep(i - 1, id, comp, q, ramps);
        if (cx < W - 1) this._platStep(i + 1, id, comp, q, ramps);
        if (cy > 0) this._platStep(i - W, id, comp, q, ramps);
        if (cy < H - 1) this._platStep(i + W, id, comp, q, ramps);
      }
      out.push({ id, x, y, tiles: q.length, at: q, ramps: [...ramps].sort((a, b) => a - b),
        bases: this.bases.filter(b => comp[this.idx(b.x + 2, b.y + 1)] === id).length });
    }
    return out;
  }
  _platStep(j, id, comp, q, ramps) {
    if (this.walk[j] !== 1) return;
    if (this.height[j] === 2) { if (comp[j] < 0) { comp[j] = id; q.push(j); } }
    else if (this.height[j] === 1) ramps.add(j);
  }
  // High ground nobody can walk onto is not high ground, and this puts it back on the floor.
  //
  // Once `sealElevations` has run, a plateau's only walkable neighbours are its own tiles, unwalkable
  // rock and cliff, and ramps -- so a plateau that no ramp touches is a walkable ISLAND that a ground
  // unit can never enter or leave. That is not a hypothetical. The generators drop rock formations by
  // seed, and a rock blob landing across a terrace cuts it in two: `arch:cliffs:11` leaves fifteen
  // tiles of terrace stranded behind the rocks, and 23 of 384 archetype maps at the four sizes had at
  // least one. Nobody had noticed because it costs nothing to walk past -- but it is a permanent hole
  // in every ground army's vision on a map where neither player can ever stand in it, which is the
  // worst of both halves of what high ground is for.
  //
  // The repair is a demotion again, and for the same reason the seal is one: `walk[]` is not touched,
  // so no flood fill anywhere in this repository sees a different map, and nothing can be stranded by
  // a pass that only ever makes ground lower. Carving a ramp out to it was the other candidate and is
  // worse -- on `cliffs` the stranded piece is behind the rock wall in front of the natural, so the
  // "repair" would be a second entrance to somebody's expansion, which is a map design decision and
  // not a bug fix. A plateau that holds a base is left alone whatever its ramps: a drop-only island
  // expansion is a legitimate map, and `elevationProblems` reports it rather than quietly levelling it.
  flattenStrandedHeight() {
    let n = 0;
    for (const p of this.plateaus()) {
      if (p.ramps.length || p.bases) continue;
      for (const i of p.at) { this.height[i] = 0; n++; }
    }
    return n;
  }
  // What is wrong with this map's elevations, in the words the editor and the generators would want.
  // Empty is good, and it is empty on every layout this build ships. `connectivityProblems` above is
  // the same idea for walkability; between them they are what "a legal map" means here.
  elevationProblems() {
    const out = [];
    this._elevEdges((hi, lo) => {
      out.push('high ground at ' + (hi % this.w) + ',' + ((hi / this.w) | 0) + ' is walkable from low ground at '
        + (lo % this.w) + ',' + ((lo / this.w) | 0) + ' without a ramp');
      return false;
    });
    for (const p of this.plateaus()) if (!p.ramps.length) out.push('plateau of ' + p.tiles + ' tiles at ' + p.x + ',' + p.y + ' has no ramp onto it');
    return out.slice(0, 24);
  }

  // ---------------- ramps: a way up is entered at its two ends, never from a side ----------------
  //
  // THE TERRAIN QUEUE, item 2 (the user, 2026-09-13): "Better-shaped ramps - can only go up them from base, NOT from sides of
  // ramp". Measured before anything was designed (.claude/review/terrain/ramp-probe.js): 132 of 158 ramps over every layout,
  // size and archetype could be walked onto from a side. Generation paints a plateau, rings it with a ONE-tile cliff and
  // stamps each ramp RECTANGLE through the ring -- and the rectangles run past the ring into open low ground and back into
  // the plateau, so the part outside has low ground on both sides and the part inside has high ground on both sides.
  //
  // Walls are TILES, not blocked edges: every RTS researched walls a ramp's sides with unwalkable cells (RESEARCH-TERRAIN.md
  // 8.2), and everything here that reads walkability per tile -- the flood fills, findFreeTile, the unit-radius probes, the
  // wide-body pathing -- sees a wall tile with no new concept. The Pathfinder already refuses a diagonal step past a blocked
  // tile, so a 4-connected wall is tight. A wall is walk 0, cliff 1, and keeps the height it had.
  //
  // THE RULE, run once after the seal on the grid every generator and the editor produce:
  //   1. A ramp is a 4-connected group of tiles walkable at height 1 in their most walkable state (a feature counts at the
  //      height it presents when open; a resource never counts). Its UP direction is the axis from the centroid of the low
  //      ground it touches to the centroid of the high ground it touches. A group with no high ground, no low ground, no
  //      axis, or no tile with high ground straight above it and low ground straight below it is not a way up and is left.
  //   2. SHAPE, to a fixpoint: every walkable tile beside a ramp tile, low ground above its top and high ground below its
  //      foot become walls -- except that a ramp tile with high ground beside or below it and no low ground anywhere around
  //      it is inside the plateau, and is promoted to high ground. Walls and promotions are decided on one state and applied
  //      together, round after round, so a corner tile whose low side has just been walled is promoted next round, and no
  //      scan order can make one mirror copy of a map differ from another. (Promotions first, walls after, was tried and
  //      walled plateau tiles at the corners instead.)
  //   3. LENGTH: depth is counted from the top along the axis, the cliff row being 1. A ramp keeps RAMP_LEN tiles, fewer
  //      while the RAMP_CLEAR tiles straight past its foot are not open ground -- a Thor stepping off it has to be able to
  //      turn -- and the rest becomes low ground, or a wall where it touches high ground or the kept ramp at a side. Walls
  //      this pass made that nothing needs any more come down again. The rectangles were drawn for side-open ramps: kept at
  //      their full five to thirteen tiles they would be walled piers into the low ground, corridors an army cannot turn in,
  //      and on the fixed layouts a natural's mineral line under the foot trapped every 3x3 body in its main.
  //   4. MEASURED, NOT HOPED: before anything moves, a flood from the first start records which bases and resources a unit
  //      reaches with every feature shut and which bases a 3x3 body reaches with features shut and open. If the pass loses
  //      any of them it is undone and redone ramp group by ramp group -- a ramp and its mirror images -- each at the longest
  //      length that loses nothing, down to the cliff row alone. A group that loses something at every length is left as it
  //      was and counted in rampReport.fallback, which test/ramps.js requires to be zero on every map it builds.
  //
  // Measured over every shipped layout and the four archetypes at four sizes on 64 seeds each (1,037 maps): 5,052 side-open
  // ramps before, none after; no base, resource, hall or 3x3 route lost; the slow road taken on 14 small maps, the fallback
  // never. That needed four generator fixes, each with its reason at the generator: cliffs, islands, chokepoint, basin.
  wallRamps() {
    const W = this.w, H = this.h, N = W * H, DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0], OPP = [1, 0, 3, 2];   // N S W E
    const report = this.rampReport = { groups: 0, slow: false, fallback: 0, lens: [], walls: 0 };
    const keep = new Uint8Array(N);   // base clearings: a wall or a height change there takes the town hall away
    for (const b of this.bases) this.rect(b.x - 1, b.y - 1, 6, 5, (x, y) => { keep[this.idx(x, y)] = 1; });
    // A feature tile's height when open, kept beside the grids because the pass can move a feature's remembered ground.
    const openH = new Int8Array(N).fill(-1);
    for (const f of this.features) { const K = MAP_FEATURES[f.kind]; f.tiles.forEach((t, k) => { openH[t] = K.openHeight === null ? f.baseH[k] : K.openHeight; }); }
    const at = (i, d) => { if (i < 0) return -1; const x = i % W + DX[d], y = ((i / W) | 0) + DY[d]; return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x; };
    // -1 never walkable (cliff, rock, a resource, off the map), else the height the tile has in its most walkable state
    const cls = i => i < 0 ? -1 : this.featTile && this.featTile[i] >= 0 ? openH[i] : this.walk[i] === 1 && this.blocked[i] === -1 ? this.height[i] : -1;
    const side = d => d < 2 ? [2, 3] : [0, 1];
    // ---- the ramps, their axes and their mirror groups, from the map as it arrived ----
    const up0 = new Int8Array(N).fill(-1), lab = new Int32Array(N).fill(-1), comps = [];
    for (let s = 0; s < N; s++) {
      if (lab[s] >= 0 || cls(s) !== 1) continue;
      const q = [s], box = [W, H, -1, -1]; let hx = 0, hy = 0, hn = 0, lx = 0, ly = 0, ln = 0; lab[s] = comps.length;
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % W, y = (i / W) | 0;
        if (x < box[0]) box[0] = x; if (y < box[1]) box[1] = y; if (x > box[2]) box[2] = x; if (y > box[3]) box[3] = y;
        for (let d = 0; d < 4; d++) {
          const j = at(i, d), c = cls(j);
          if (c === 1) { if (lab[j] < 0) { lab[j] = comps.length; q.push(j); } }
          else if (c === 2) { hx += 2 * x + DX[d]; hy += 2 * y + DY[d]; hn++; }
          else if (c === 0) { lx += 2 * x + DX[d]; ly += 2 * y + DY[d]; ln++; }
        }
      }
      // integer centroids (doubled coordinates, cross-multiplied counts): no rounding for a mirror image to disagree about
      let U = -1;
      if (hn && ln) { const vx = hx * ln - lx * hn, vy = hy * ln - ly * hn; if (Math.abs(vx) > Math.abs(vy)) U = vx < 0 ? 2 : 3; else if (vy !== 0) U = vy < 0 ? 0 : 1; }
      let top = 0, foot = 0;
      if (U >= 0) for (const t of q) { if (cls(at(t, U)) === 2) top++; if (cls(at(t, OPP[U])) === 0) foot++; }
      const live = top > 0 && foot > 0;
      if (live) for (const t of q) up0[t] = U;
      comps.push({ tiles: q, box, live, group: -1 });
    }
    // A group is a ramp with its mirror images (bounding boxes that map onto each other), so the slow road below never
    // walls one quadrant's copy and not another's. Ordered by lowest tile, which no mirror can reorder.
    const groups = [];
    for (let a = 0; a < comps.length; a++) {
      const A = comps[a]; if (!A.live || A.group >= 0) continue;
      const b = A.box, imgs = [b, [W - 1 - b[2], b[1], W - 1 - b[0], b[3]], [b[0], H - 1 - b[3], b[2], H - 1 - b[1]], [W - 1 - b[2], H - 1 - b[3], W - 1 - b[0], H - 1 - b[1]]];
      const g = { comps: [], min: N };
      for (let c = a; c < comps.length; c++) {
        const C = comps[c]; if (!C.live || C.group >= 0) continue;
        if (!imgs.some(m => m[0] === C.box[0] && m[1] === C.box[1] && m[2] === C.box[2] && m[3] === C.box[3])) continue;
        C.group = groups.length; g.comps.push(c); for (const t of C.tiles) if (t < g.min) g.min = t;
      }
      groups.push(g);
    }
    groups.sort((p, r) => p.min - r.min);
    report.groups = groups.length;
    if (!groups.length) return report;
    // ---- one application of the rule to some ramps, at a length ----
    const apply = (ids, cap) => {
      const up = new Int8Array(N).fill(-1), made = new Uint8Array(N), own = [];
      for (const k of ids) for (const t of comps[k].tiles) { up[t] = up0[t]; own.push(t); }
      const setH = (i, h) => {
        if (keep[i]) return 0;
        const fi = this.featTile ? this.featTile[i] : -1;
        if (fi >= 0) {   // through the feature, as _demoteToRamp does: its tiles must keep drawing and walking as the feature
          const f = this.features[fi]; if (MAP_FEATURES[f.kind].openHeight !== null) return 0;
          const k = f.tiles.indexOf(i); if (f.baseH[k] === h) return 0;
          f.baseH[k] = h; openH[i] = h; this.syncFeature(f); return 1;
        }
        if (this.height[i] === h) return 0; this.height[i] = h; return 1;
      };
      const wall = i => {
        if (keep[i] || (this.featTile && this.featTile[i] >= 0) || this.blocked[i] !== -1 || this.walk[i] !== 1) return 0;
        this.walk[i] = 0; this.cliff[i] = 1; made[i] = 1; return 1;
      };
      const shape = () => {
        for (let round = 0; round < 256; round++) {
          const walls = new Set(), prom = [];
          for (const i of own) {
            if (cls(i) !== 1) continue;
            const U = up[i], D = OPP[U]; let low = false, inside = false;
            for (let d = 0; d < 4; d++) if (cls(at(i, d)) === 0) low = true;
            for (const p of side(U)) { const n = at(i, p), c = cls(n); if (c === 0) walls.add(n); else if (c === 2) { if (low) walls.add(n); else inside = true; } }
            const nu = at(i, U); if (cls(nu) === 0) walls.add(nu);
            const nd = at(i, D); if (cls(nd) === 2) { if (low) walls.add(nd); else inside = true; }
            if (inside) prom.push(i);
          }
          let changed = 0;
          for (const w of walls) changed += wall(w);
          for (const p of prom) changed += setH(p, 2);
          if (!changed) return;
        }
      };
      shape();
      // depth from the top along the axis; a tile whose way up is rock is as deep as its shallowest neighbour across
      const depth = new Int32Array(N);
      for (let pass = 0; pass < 512; pass++) {
        let moved = 0;
        for (const i of own) {
          if (cls(i) !== 1) continue;
          const U = up[i], u = at(i, U), cu = cls(u); let dd = 0;
          if (cu === 2) dd = 1;
          else if (cu === 1 && up[u] === U && depth[u] > 0) dd = depth[u] + 1;
          else if (cu < 0) for (const p of side(U)) { const n = at(i, p); if (n >= 0 && cls(n) === 1 && up[n] === U && depth[n] > 0 && (!dd || depth[n] < dd)) dd = depth[n]; }
          if (dd !== depth[i]) { depth[i] = dd; moved++; }
        }
        if (!moved) break;
      }
      const lenOf = new Map();
      for (const k of ids) {
        let len = cap;
        for (; len > 1; len--) {
          let ok = true;
          for (const t of comps[k].tiles) {
            if (!ok) break;
            if (cls(t) !== 1 || depth[t] < 1 || depth[t] > len) continue;
            const D = OPP[up[t]], nd = at(t, D);
            if (nd >= 0 && cls(nd) === 1 && depth[nd] >= 1 && depth[nd] <= len) continue;   // not at the foot
            for (let step = 0, p = t; step < RAMP_CLEAR; step++) {
              p = at(p, D);
              if (p < 0 || (this.featTile && this.featTile[p] >= 0)) { ok = false; break; }   // a feature: shut, in the worst case
              if (made[p]) continue;                                                        // one of ours: it comes down if nothing needs it
              const c = cls(p);
              if (c === 1 && depth[p] > len) continue;                                      // the part being cut off becomes open ground
              if (c < 0) { ok = false; break; }
            }
          }
          if (ok) break;
        }
        lenOf.set(k, len); report.lens.push(len);
      }
      const kept = i => i >= 0 && up[i] >= 0 && cls(i) === 1 && depth[i] >= 1 && depth[i] <= lenOf.get(lab[i]);
      const cutWall = [], cutLow = [];
      for (const i of own) {
        if (cls(i) !== 1 || kept(i)) continue;
        let high = false, beside = false;
        for (let d = 0; d < 4; d++) if (cls(at(i, d)) === 2) high = true;
        for (const p of side(up[i])) if (kept(at(i, p))) beside = true;
        (high || beside ? cutWall : cutLow).push(i);
      }
      for (const i of cutWall) wall(i);
      for (const i of cutLow) setH(i, 0);
      // Walls this pass made that no kept ramp tile touches, and that part no high ground from low, come down again --
      // decided on one state, and a pair that would only be safe one at a time both stay, so scan order cannot matter.
      const cut = new Set(cutWall), down = new Set();
      for (let i = 0; i < N; i++) {
        if (!made[i] || this.walk[i] === 1 || cut.has(i)) continue;
        let need = false;
        for (let d = 0; d < 4; d++) { const n = at(i, d), c = cls(n); if (kept(n) || (c === 2 && this.height[i] === 0) || (c === 0 && this.height[i] === 2)) need = true; }
        if (!need) down.add(i);
      }
      for (let again = true; again;) {
        again = false;
        for (const i of down) for (let d = 0; d < 4; d++) { const n = at(i, d); if (down.has(n) && this.height[n] !== this.height[i] && this.height[n] + this.height[i] === 2) { down.delete(i); down.delete(n); again = true; break; } }
      }
      for (const i of down) { this.walk[i] = 1; this.cliff[i] = 0; }
      shape();
    };
    const snap = () => ({ h: this.height.slice(), w: this.walk.slice(), c: this.cliff.slice(), f: this.features.map(f => f.baseH.slice()), o: openH.slice() });
    const restore = S => { this.height.set(S.h); this.walk.set(S.w); this.cliff.set(S.c); openH.set(S.o); this.features.forEach((f, k) => { f.baseH.set(S.f[k]); this.syncFeature(f); }); };
    const worse = (a, b) => { if (!a) return false; for (let i = 0; i < a.length; i++) if (a[i] && !b[i]) return true; return false; };
    const before = this._rampReach(openH), S0 = snap(), all = [];
    for (const g of groups) for (const c of g.comps) all.push(c);
    apply(all, RAMP_LEN);
    if (worse(before, this._rampReach(openH))) {
      // the slow road: undo, then group by group, each at the longest length that loses nothing
      restore(S0); report.slow = true; report.lens = [];
      for (const g of groups) {
        let done = false;
        for (let len = RAMP_LEN; len >= 1 && !done; len--) {
          const S1 = snap();
          apply(g.comps, len);
          if (!worse(before, this._rampReach(openH))) done = true; else restore(S1);
        }
        if (!done) report.fallback++;
      }
    }
    for (let i = 0; i < N; i++) if (S0.w[i] === 1 && this.walk[i] === 0) report.walls++;
    return report;
  }
  // What wallRamps must never make worse, as one flat array of 0/1: per base, a unit reaches its anchor with every feature
  // shut, a 3x3 body reaches its surroundings with features shut, and with them open; per resource, a unit reaches a tile
  // beside it. Flooded from the first start, which on a connected map reaches everything any start does. A 3x3 body is
  // Pathfinder.find's wide test (all eight neighbours walkable), taken as a row pass and a column pass.
  _rampReach(openH) {
    const W = this.w, H = this.h, N = W * H, s = this.starts[0]; if (!s) return null;
    const shut = new Uint8Array(N), open = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const fi = this.featTile ? this.featTile[i] : -1;
      shut[i] = fi < 0 && this.walk[i] === 1 && this.blocked[i] === -1 ? 1 : 0;
      open[i] = fi >= 0 ? (openH[i] >= 0 ? 1 : 0) : shut[i];
    }
    const fits = g => {
      const h = new Uint8Array(N), f = new Uint8Array(N);
      for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; h[i] = g[i - 1] & g[i] & g[i + 1]; }
      for (let i = W; i < N - W; i++) f[i] = h[i - W] & h[i] & h[i + W];
      return f;
    };
    const flood = (g, seeds) => {
      const seen = new Uint8Array(N), q = [];
      for (const a of seeds) if (g[a] && !seen[a]) { seen[a] = 1; q.push(a); }
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % W;
        if (x > 0 && g[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; q.push(i - 1); }
        if (x < W - 1 && g[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; q.push(i + 1); }
        if (i >= W && g[i - W] && !seen[i - W]) { seen[i - W] = 1; q.push(i - W); }
        if (i < N - W && g[i + W] && !seen[i + W]) { seen[i + W] = 1; q.push(i + W); }
      }
      return seen;
    };
    const home = []; this.rect(s.x - 3, s.y - 3, 11, 10, (x, y) => { home.push(y * W + x); });
    const narrow = flood(shut, home), wideShut = flood(fits(shut), home), wideOpen = flood(fits(open), home);
    const near = (seen, b) => { let hit = 0; this.rect(b.x - 3, b.y - 3, 10, 9, (x, y) => { if (seen[y * W + x]) hit = 1; }); return hit; };
    const sig = [];
    for (const b of this.bases) sig.push(narrow[this.baseAnchor(b)], near(wideShut, b), near(wideOpen, b));
    for (const r of this.resources) { let hit = 0; this.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, (x, y) => { if ((x < r.x || x >= r.x + r.w) !== (y < r.y || y >= r.y + r.h) && narrow[y * W + x]) hit = 1; }); sig.push(hit); }
    return sig;
  }
  // Every way onto a ramp other than its two ends, in the words a test or the editor would want. Empty is good, and it is empty
  // on every layout this build ships. The axis is judged with features open, as wallRamps judges it -- a rock formation filling
  // half a ramp must not turn its foot into a side -- and the ground around is judged as it stands: a feature standing there,
  // or a resource, is not a way on.
  rampProblems() {
    const W = this.w, H = this.h, N = W * H, DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0], OPP = [1, 0, 3, 2], out = [];
    const openH = i => { const fi = this.featTile ? this.featTile[i] : -1; if (fi < 0) return this.walk[i] === 1 && this.blocked[i] === -1 ? this.height[i] : -1; const f = this.features[fi], K = MAP_FEATURES[f.kind]; return K.openHeight === null ? f.baseH[f.tiles.indexOf(i)] : K.openHeight; };
    const live = i => this.walk[i] === 1 && this.blocked[i] === -1 ? this.height[i] : -1;
    const at = (i, d) => { const x = i % W + DX[d], y = ((i / W) | 0) + DY[d]; return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x; };
    const axis = new Int8Array(N).fill(-1), seen = new Uint8Array(N);
    for (let s = 0; s < N; s++) {
      if (seen[s] || openH(s) !== 1) continue;
      const q = [s]; let hx = 0, hy = 0, hn = 0, lx = 0, ly = 0, ln = 0; seen[s] = 1;
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % W, y = (i / W) | 0;
        for (let d = 0; d < 4; d++) {
          const j = at(i, d); if (j < 0) continue; const c = openH(j);
          if (c === 1) { if (!seen[j]) { seen[j] = 1; q.push(j); } }
          else if (c === 2) { hx += 2 * x + DX[d]; hy += 2 * y + DY[d]; hn++; }
          else if (c === 0) { lx += 2 * x + DX[d]; ly += 2 * y + DY[d]; ln++; }
        }
      }
      if (!hn || !ln) continue;
      const vx = hx * ln - lx * hn, vy = hy * ln - ly * hn, U = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 2 : 3) : vy !== 0 ? (vy < 0 ? 0 : 1) : -1;
      for (const t of q) axis[t] = U;
    }
    for (let i = 0; i < N && out.length < 24; i++) {
      const U = axis[i]; if (U < 0 || live(i) !== 1) continue;
      for (const d of [0, 1, 2, 3]) {
        const j = at(i, d); if (j < 0) continue;
        const c = live(j), bad = d === U ? c === 0 : d === OPP[U] ? c === 2 : (c === 0 || c === 2);
        if (bad) out.push('ramp tile ' + (i % W) + ',' + ((i / W) | 0) + ' is entered from ' + (c === 0 ? 'low' : 'high') + ' ground at ' + (j % W) + ',' + ((j / W) | 0) + (d === U ? ', above its top' : d === OPP[U] ? ', below its foot' : ', at its side'));
      }
    }
    return out.slice(0, 24);
  }
  // THE GROUND A MINED-OUT PATCH LEAVES (the terrain queue's leftovers, after phase 4). Placing a mineral patch forces its tiles
  // walkable and un-cliffed -- "a resource that straddles a cliff edge is a staircase" (the seal's comment above) -- and every rule
  // after that, the seal's scan aside, reads a resource as never walkable. So what a patch leaves behind when G.removeResource
  // unblocks it was ground no rule had looked at. Measured over every shipped layout and the four archetypes at four sizes on 64 seeds
  // (1,037 maps; .claude/review/terrain/mineout-before.log, mineral-slope-probe.log, mined-classes.log): 5,524 patch tiles on 338
  // maps stand on a slope, of two kinds. 3,140 of them, on 210 maps (Vertical Cliffs small and medium, Chokepoint Valley small and
  // medium, Island Chain small), are a cliff edge the seal made a slope of -- each a way through a main's or a natural's cliff once
  // mined out. The other 2,384, on 147 maps (Chokepoint Valley medium and large and its shipped sample, a few Island Chain), are a
  // slab in open low ground: a ramp rectangle that ran under a natural's mineral row, cut back to low ground by wallRamps everywhere
  // but under the patches, because a resource is never part of a ramp. And 8 patch tiles beside a ramp's side reopened the side a
  // wall closes (rampProblems found 22 side entries on 7 maps with every patch removed).
  //
  // So the slope tiles under patches are taken a group at a time -- 8-connected, so no two groups touch and no order can matter --
  // and judged by the most walkable height of the ground round the group. Touching high ground and low ground, the group is a cliff
  // edge and becomes a wall (walk 0, cliff 1, its height kept; the patch still blocks it). Touching one level only, it is levelled to
  // that level, and is plain ground once mined out: the first version of this walled those too, and every one was a block of wall
  // left standing in the open (2,376 tiles on 147 maps joined to no cliff; .claude/review/terrain/mined-compare.log and
  // shots/mined-choke7m-natural.jpg). Touching neither, a wall; none does. Then every other patch tile beside a ramp tile that is not
  // itself under a patch becomes a wall. Nothing a unit can reach changes while a patch stands, since the patch blocks the tile
  // either way, and levelling never puts high ground beside low, since a group only takes the one level round it; the map is
  // regenerated identically on a load, so a snapshot's walk grid and these grids agree. A rule for high ground beside low under a
  // patch was measured and dropped: after the seal it walls nothing on any of the 1,037. Geysers are left alone: a geyser is never
  // removed. Returns the number of tiles walled.
  wallMinedGround() {
    const W = this.w, mine = new Set(), slope = new Set();
    for (const r of this.resources) {
      if (r.type !== 'mineral') continue;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        if (!this.inb(x, y)) continue;
        const i = this.idx(x, y); if (this.walk[i] !== 1) continue;
        mine.add(i); if (this.height[i] === 1) slope.add(i);
      }
    }
    const walls = [], level = [], seen = new Set();   // decided on the grids as they arrived, applied after
    for (const s of slope) {
      if (seen.has(s)) continue;
      const group = [s]; let low = false, high = false; seen.add(s);
      for (let k = 0; k < group.length; k++) {
        const i = group[k], x = i % W, y = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || !this.inb(x + dx, y + dy)) continue;
          const j = this.idx(x + dx, y + dy);
          if (slope.has(j)) { if (!seen.has(j)) { seen.add(j); group.push(j); } continue; }
          const h = this._elevOpenH(j); if (h === 0) low = true; else if (h === 2) high = true;
        }
      }
      if (low !== high) for (const i of group) level.push([i, low ? 0 : 2]);   // a slab in open ground: the ground round it
      else for (const i of group) walls.push(i);                              // a cliff edge: a wall
    }
    for (const [i, h] of level) this.height[i] = h;
    const walled = new Set(walls);
    for (const i of mine) {
      if (walled.has(i)) continue;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!this.inb(x + dx, y + dy)) continue;
        const j = this.idx(x + dx, y + dy);
        if (!mine.has(j) && this.blocked[j] !== -3 && this._elevOpenH(j) === 1) { walls.push(i); break; }   // beside a ramp tile
      }
    }
    for (const i of walls) { this.walk[i] = 0; this.cliff[i] = 1; }
    return walls.length;
  }

  // ---------------- custom (editor-made) maps ----------------
  // A custom layout stores the painted height grid and rock grid run-length encoded, plus explicit
  // bases. Cliff edges are derived here exactly as for the built-in layouts, so the editor only has
  // to paint heights and the engine keeps one rule for what is walkable.
  generateCustom(L) {
    const W = this.w, Hh = this.h, n = W * Hh;
    const hgt = MapCodec.decode(L.height, n), rk = MapCodec.decode(L.rocks, n);
    for (let i = 0; i < n; i++) { this.height[i] = hgt[i] > 2 ? 0 : hgt[i]; this.walk[i] = 1; this.cliff[i] = 0; }
    const cliffs = [];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (this.height[this.idx(x, y)] !== 2) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { if (!this.inb(x + dx, y + dy) || this.height[this.idx(x + dx, y + dy)] === 0) { edge = true; break; } }
      if (edge) cliffs.push(this.idx(x, y));
    }
    for (const i of cliffs) { this.walk[i] = 0; this.cliff[i] = 1; }
    for (let i = 0; i < n; i++) if (this.height[i] === 1) { this.walk[i] = 1; this.cliff[i] = 0; }   // ramps stay walkable
    for (let i = 0; i < n; i++) if (rk[i]) { this.walk[i] = 0; this.cliff[i] = 2; }                  // painted rocks
    this.rect(0, 0, W, 2, (x, y) => { const i = this.idx(x, y); this.walk[i] = 0; this.cliff[i] = 2; });
    this.rect(0, Hh - 2, W, 2, (x, y) => { const i = this.idx(x, y); this.walk[i] = 0; this.cliff[i] = 2; });
    this.rect(0, 0, 2, Hh, (x, y) => { const i = this.idx(x, y); this.walk[i] = 0; this.cliff[i] = 2; });
    this.rect(W - 2, 0, 2, Hh, (x, y) => { const i = this.idx(x, y); this.walk[i] = 0; this.cliff[i] = 2; });
    for (const bd of (L.bases || [])) {
      const base = { minerals: [], geyser: null, main: !!bd.main, natural: !!bd.natural, quadrant: 0, x: bd.x, y: bd.y, cx: (bd.x + 2) * TILE, cy: (bd.y + 1.5) * TILE };
      for (const m of (bd.minerals || [])) {
        const res = { type: 'mineral', x: m[0], y: m[1], w: 2, h: 1, amount: bd.amount || (bd.rich ? 5000 : 1500), cx: (m[0] + 1) * TILE, cy: (m[1] + 0.5) * TILE, miner: null, id: this.resources.length };
        this.resources.push(res); base.minerals.push(res);
        this.rect(m[0], m[1], 2, 1, (x, y) => { this.blocked[this.idx(x, y)] = -2; this.walk[this.idx(x, y)] = 1; this.cliff[this.idx(x, y)] = 0; });
      }
      if (bd.geyser) {
        const g = { type: 'geyser', x: bd.geyser[0], y: bd.geyser[1], w: 4, h: 2, amount: bd.gas || 5000, cx: (bd.geyser[0] + 2) * TILE, cy: (bd.geyser[1] + 1) * TILE, building: null, id: this.resources.length };
        this.resources.push(g); base.geyser = g;
        this.rect(g.x, g.y, 4, 2, (x, y) => { this.blocked[this.idx(x, y)] = -3; this.walk[this.idx(x, y)] = 1; this.cliff[this.idx(x, y)] = 0; });
      }
      this.rect(bd.x - 1, bd.y - 1, 6, 5, (x, y) => { const i = this.idx(x, y); if (!rk[i]) { this.walk[i] = 1; this.cliff[i] = 0; } });
      this.bases.push(base); if (bd.main) this.starts.push(base);
    }
    for (const r of this.resources) this.rect(r.x, r.y, r.w, r.h, (x, y) => { this.cliff[this.idx(x, y)] = 0; });
    // An editor map gets the same seal as a generated one, and needs it more: the brush paints heights
    // freely and the base clearing above opens a 6x5 wherever the author put a hall, so a town hall
    // painted on the lip of a plateau is exactly the Twilight Valley hole with a person behind it.
    this.sealElevations(); this.flattenStrandedHeight();
    this.wallRamps();        // an editor map's ramps get the same walls as a generated map's
    this.wallMinedGround();  // and the same ground under its mineral patches
    this.placeNeutrals(L);   // after the seal: a site must sit on ground whose height is final
    this.resById = new Map(this.resources.map(r => [r.id, r]));
  }

  // ---------------- queries ----------------
  walkable(tx, ty) { if (!this.inb(tx, ty)) return false; const i = this.idx(tx, ty); const b = this.blocked[i]; return this.walk[i] === 1 && (b === -1 || b === LOWERED_BLOCKED); }
  // Lower or raise a depot's footprint: its own id <-> LOWERED_BLOCKED, and only on tiles that are its own, so a
  // footprint a map feature or a wreck has since claimed a tile of is never overwritten.
  setLowered(tx, ty, w, h, id, lowered) { this.rect(tx, ty, w, h, (x, y) => { const i = this.idx(x, y); if (lowered && this.blocked[i] === id) this.blocked[i] = LOWERED_BLOCKED; else if (!lowered && this.blocked[i] === LOWERED_BLOCKED) this.blocked[i] = id; }); }
  heightAtPx(px, py) { return this.H(Math.floor(px / TILE), Math.floor(py / TILE)); }

  // ============================================================================
  // Verticality. What the simulation is allowed to ask the map about elevation.
  // ============================================================================
  // READ-ONLY QUERY CONTRACT, in the shape of `featureView` and `hazardState` above: nothing here
  // mutates anything, nothing here reads a clock or the RNG, and NOTHING HERE APPLIES A BONUS. The
  // multipliers are a recommendation with a reason attached; whether a shot is longer or weaker for
  // standing uphill is js/sim.js's decision and js/sim.js's code.
  //
  //   map.heightAt(px, py)      TIER at a world pixel. 0 low, 1 high. Off the map is 0.
  //   map.tierAt(tx, ty)        the same, by tile.
  //   map.onRamp(px, py)        is this pixel standing on a ramp.
  //   map.heightAdvantage(fromPx, fromPy, toPx, toPy)
  //                             tierAt(from) - tierAt(to): -1 shooting up, 0 level, +1 shooting down.
  //   map.heightBonus(fromPx, fromPy, toPx, toPy)
  //                             the recommended multipliers for that advantage, as a SHARED FROZEN
  //                             object -- read it, never keep it, never write to it.
  //
  // **A TIER IS NOT A `height[]` VALUE, and the difference is the whole point.** `height[]` has three
  // values because it is three kinds of *drawing*: 0 flat, 1 the sloped face of a ramp, 2 the top of a
  // plateau. A tier has two because there are two places a unit can be standing: down here, or up
  // there. A ramp is a slope, not a landing, so `tierAt` reports 0 for it -- which is Brood War's rule
  // as well, and it is what makes a ramp a fight rather than a free upgrade. Walk halfway up and you
  // have given up nothing and gained nothing; the tier changes on the tile where the climb ends.
  //
  // **So `heightAt` is NOT `heightAtPx`, three lines above, which stays exactly as it was.**
  // `heightAtPx` hands back the raw grid value 0/1/2 and is what `Unit.heightLevel()` feeds to vision,
  // where a ramp genuinely does sit between the two -- you can see up a ramp from the bottom of it.
  // Vision wants three values, combat wants two, they disagree about the ramp on purpose, and neither
  // should be reimplemented in terms of the other. Do not swap one for the other to save a call.
  //
  // **It is antisymmetric, and that is asserted rather than assumed.** `heightAdvantage(a, b)` is
  // exactly `-heightAdvantage(b, a)` for every pair of points on or off the map, and it is 0 whenever
  // the two are on the same tier. So one call answers both halves of a duel and a caller cannot get a
  // different answer by asking in the other order. It is also pure: same map, same arguments, same
  // number, for ever -- there is no state behind it, so it is safe to call inside a tick, inside a
  // replay seek, or from a headless test with no G at all.
  //
  // **Air units are not this function's business.** `Unit.heightLevel()` in js/sim.js already answers
  // `fly ? 2` for vision, and a flyer has no ground under it in any meaningful sense. Skip the query
  // for a flying attacker or a flying target rather than asking it about the ground they happen to be
  // over; the map cannot tell the difference and will cheerfully report the terrain.
  //
  // **Why multipliers rather than Brood War's dice.** Brood War gives a shot fired from low ground at a
  // target on high ground a 53% chance to hit. A roll is perfectly implementable here -- it just has to
  // go through `G.rand()` like every other roll in the simulation -- but a multiplier is easier to
  // measure, cannot desync, and does not add variance to a balance harness that is already fighting
  // for significance. Both are offered below; take one, not both, or a shot uphill is punished twice.
  HEIGHT_TIERS() { return 2; }
  // The table. Written as literals INSIDE a method on purpose: js/build.js hashes the source text of
  // GameMap's methods, and when this was written it did not walk this file's module-level constants,
  // so numbers that lived out there could be retuned without moving the build stamp -- and a save made
  // before the retune would then be accepted and quietly re-simulate into a different game. (Since
  // REVIEW-M17 the module-level constants are named in BUILD.TUNING and stamped too; the table stays
  // here because inside a hashed method is still the simplest place to be sure of it.) In here,
  // changing a 1.15 refuses the old save, which is the entire job of the stamp. Built once and frozen,
  // so the per-shot path allocates nothing.
  heightBonusTable() {
    return HEIGHT_BONUS || (HEIGHT_BONUS = Object.freeze([
      // index 0: advantage -1, the attacker is shooting UP at a target on high ground
      Object.freeze({ adv: -1, range: 1.00, sight: 1.00, damage: 0.70, hit: 0.53 }),
      // index 1: advantage 0, level ground, and nothing changes
      Object.freeze({ adv: 0, range: 1.00, sight: 1.00, damage: 1.00, hit: 1.00 }),
      // index 2: advantage +1, the attacker is on high ground shooting DOWN
      Object.freeze({ adv: 1, range: 1.15, sight: 1.15, damage: 1.00, hit: 1.00 }),
    ]));
  }
  tierAt(tx, ty) { return this.H(tx, ty) === 2 ? 1 : 0; }
  heightAt(px, py) { return this.tierAt(Math.floor(px / TILE), Math.floor(py / TILE)); }
  onRamp(px, py) { return this.H(Math.floor(px / TILE), Math.floor(py / TILE)) === 1; }
  heightAdvantage(fromPx, fromPy, toPx, toPy) { return this.heightAt(fromPx, fromPy) - this.heightAt(toPx, toPy); }
  heightBonus(fromPx, fromPy, toPx, toPy) { return this.heightBonusTable()[this.heightAdvantage(fromPx, fromPy, toPx, toPy) + 1]; }
  hasCreep(tx, ty) { return this.inb(tx, ty) && this.creep[this.idx(tx, ty)] > 0; }
  hasPsi(pid, tx, ty) { const p = this.psi[pid]; return !!p && this.inb(tx, ty) && p[this.idx(tx, ty)] > 0; }
  resourceAt(tx, ty) { if (!this.inb(tx, ty)) return null; const b = this.blocked[this.idx(tx, ty)]; if (b !== -2 && b !== -3) return null; return this.resources.find(r => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) || null; }
  geyserAt(tx, ty) { return this.resources.find(r => r.type === 'geyser' && r.x === tx && r.y === ty) || null; }

  block(tx, ty, w, h, id) { this.rect(tx, ty, w, h, (x, y) => { this.blocked[this.idx(x, y)] = id; }); }
  unblock(tx, ty, w, h, id) { this.rect(tx, ty, w, h, (x, y) => { if (this.blocked[this.idx(x, y)] === id) this.blocked[this.idx(x, y)] = -1; }); }

  // Building placement validation. Returns null if ok, else reason string.
  canPlace(def, tx, ty, player, units, ignoreUnit) {
    if (def.onGeyser) {
      const g = this.geyserAt(tx, ty);
      if (!g) return 'Must be placed on a Vespene Geyser';
      if (g.building && g.building.alive) return 'Geyser already has a building';
      // A geyser on ground nobody has explored is a geyser nobody knows about. Same rule as the loop
      // below, stated separately because this branch returns before reaching it.
      if (player && player.vis && player.vis[this.idx(g.x, g.y)] === 0) return UNEXPLORED_MSG;
      return null;
    }
    let h0 = null;
    for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) {
      if (!this.inb(x, y)) return 'Out of bounds';
      const i = this.idx(x, y);
      // A bridge deck and a dry channel are walkable, so without this a supply depot could be built on
      // one and then find itself standing in a river. Nothing else in the engine has ground that stops
      // being ground, so nothing else needed to say this.
      if (this.featTile && this.featTile[i] >= 0) return 'Cannot build on a map feature';
      if (this.walk[i] !== 1) return 'Cannot build there';
      if (this.blocked[i] !== -1) return 'Location is blocked';
      const hh = this.height[i]; if (hh === 1) return 'Cannot build on ramps';
      if (h0 === null) h0 = hh; else if (h0 !== hh) return 'Uneven terrain';
      if (def.race !== 'Z' && this.creep[i]) return 'Cannot build on creep';
      if (def.needsCreep && !this.creep[i]) return 'Requires creep';
      // FIXLIST-M14 C1 -- you may not build on ground you have never seen.
      //
      // There was no explored test here at all: terrain, occupancy, creep and psi, and nothing about
      // whether the player had ever looked at the tile. So a Command Center could be dropped in the
      // middle of the black, on ground that might be a cliff, a lake or the enemy's natural, and the
      // first you knew of it was the building appearing.
      //
      // A FOOTPRINT THAT STRADDLES THE BOUNDARY IS REFUSED, deliberately, and it is worth saying why:
      // this loop is per tile, so refusing on ANY unexplored tile is what falls out naturally, and it
      // is also the right rule. A hall half on ground you have scouted and half on ground you have not
      // is a hall you have not scouted -- the unexplored half is where the surprise would be.
      //
      // EXPLORED-BUT-FOGGED IS STILL ALLOWED. `vis` is 0 never seen, 1 seen before, 2 visible now, and
      // this tests > 0 through G.explored. Those are different states and only the first is blocked:
      // rebuilding on ground you scouted ten minutes ago is the normal way this game is played.
      // Read straight off the player's own vision array rather than through G.explored, which indexes
      // it identically -- canPlace is called from the map editor and from harnesses where G may not be
      // the game this map belongs to, and `player` is already the argument that says whose question
      // this is. A player without a `vis` (the editor's stand-in) is unrestricted, as it must be.
      if (player && player.vis && player.vis[i] === 0) return UNEXPLORED_MSG;
    }
    if (def.needsPsi) { const cx = tx + Math.floor(def.w / 2), cy = ty + Math.floor(def.h / 2); if (!this.hasPsi(player.id, cx, cy) && !this.hasPsi(player.id, cx - 1, cy)) return 'Requires psi power'; }
    // units in the way (ground, non-builder)
    const x0 = tx * TILE, y0 = ty * TILE, x1 = (tx + def.w) * TILE, y1 = (ty + def.h) * TILE;
    for (const u of units) {
      if (!u.alive || u.fly || u === ignoreUnit || u.isBuilding || u.def.larva || (u.burrowed && u.def.mine)) continue;
      if (u.x + u.r > x0 && u.x - u.r < x1 && u.y + u.r > y0 && u.y - u.r < y1) { if (u.owner === player.id && u.def.worker) continue; return 'Unit in the way'; }
    }
    // resource proximity rule for town halls (no hall within 3 tiles of minerals)
    if (def.depot) {
      for (const r of this.resources) {
        if (r.type === 'geyser' && r.building && r.building.alive) continue;
        if (tx < r.x + r.w + 3 && tx + def.w > r.x - 3 && ty < r.y + r.h + 3 && ty + def.h > r.y - 3) return 'Too close to resources';
      }
    }
    return null;
  }

  // Creep: union of circles around living Zerg creep sources
  recomputeCreep(units) {
    this.creep.fill(0);
    for (const u of units) {
      // `u.lifted` is M12's uprooted Spine/Spore crawler and nothing else: no creep source in the game
      // could be lifted before this, because no Zerg building carries `canLift`. Without it a crawler
      // that has walked away keeps painting creep at the tx/ty it left behind -- those do not move
      // while a lifted building walks, only x/y do -- so its old patch would hang there for good.
      if (!u.alive || !u.def.creep || u.fly || u.lifted) continue;
      if (u.def.id !== 'hatchery' && u.def.id !== 'lair' && u.def.id !== 'hive' && !u.done) continue;
      // the source's CURRENT radius, not its final one -- see CREEP_GROW in sim.js
      const cx = u.tx + u.def.w / 2, cy = u.ty + u.def.h / 2, r = Math.min(u.def.creep, u.creepR || 0);
      if (r < 1) continue;
      this.ellipse(cx - 0.5, cy - 0.5, r, r * 0.8, (x, y) => { if (this.walk[this.idx(x, y)] && this.height[this.idx(x, y)] !== 1) this.creep[this.idx(x, y)] = 1; });
    }
  }
  // A PSI SOURCE IS NOT ALWAYS A BUILDING. This used to read the centre out of `u.tx`, which only a
  // building has, so a Warp Prism -- a Pylon that flies, and the whole of M12 item 12's mobile half --
  // painted its ellipse from `undefined + 0.5` and projected nothing at all through this path.
  //
  // Abilities.tickProtoss worked around that by painting the mobile sources on top afterwards, and
  // that hid a worse bug than the one it fixed: the overlay is keyed on prism positions, so it is
  // skipped when nothing has moved, while EVERY OTHER caller of this method -- a pylon completing,
  // a pylon dying, G.init -- wiped the grid back to buildings only. A stationary prism therefore lost
  // its field permanently the first time any pylon appeared or died anywhere on the map, which is
  // exactly the prism you are parked on to warp onto.
  //
  // So the fix belongs here: this method alone is now the complete answer, and every caller gets a
  // correct grid without having to know that mobile sources exist. The building branch is unchanged
  // -- `tx + 0.5` is what every Pylon has painted from since M3 and is not this fix's business.
  recomputePsi(pid, units) {
    const p = this.psi[pid] || (this.psi[pid] = new Uint8Array(this.w * this.h));
    p.fill(0);
    for (const u of units) {
      if (!u.alive || u.owner !== pid || !u.def.psi || !u.done) continue;
      const cx = u.isBuilding ? u.tx + 0.5 : Math.floor(u.x / TILE), cy = u.isBuilding ? u.ty + 0.5 : Math.floor(u.y / TILE);
      this.ellipse(cx, cy, u.def.psi, u.def.psi * 0.7, (x, y) => { p[this.idx(x, y)] = 1; });
    }
  }
  // find a free nearby walkable tile (spiral)
  findFreeTile(tx, ty, maxR = 12, pred) {
    for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const x = tx + dx, y = ty + dy;
      if (this.walkable(x, y) && (!pred || pred(x, y))) return [x, y];
    }
    return null;
  }

  // ---------------- hazard ----------------
  // WIRING CONTRACT. The hazard needs one call a frame, and G.tick() makes it (js/game.js, next to the
  // other per-frame sim passes, after Abilities.tickFields() and before the AI loop). Written when
  // js/game.js belonged to another change; the line is:
  //
  //     this.map.tickHazard(this.frame, this.units);
  //
  // It is a no-op on every layout without a `hazard` key -- which is all of them except `dustbowl` --
  // and since A2 removed the damage it does nothing on a hazard map either except say the warning once
  // a cycle, so it costs nothing to call unconditionally. Nothing else needs changing: the state is
  // derived from the frame number, so snapshots, replay seeks and rejoins all reproduce it without
  // knowing it exists.
  //
  // The renderer wants hazardState(G.frame) once a frame: `.active` says whether to draw anything,
  // `.t0`/`.t1` are the front's near and far edges in TILES along `.axis`, and `.warning` is the ten
  // seconds before a sweep, which is when to build the dust up at the edge it is about to come from
  // (`.dir` is +1 for west-to-east, -1 for east-to-west; it alternates each cycle).

  // Everything about the hazard at a frame, derived and never stored. Null on a map without one.
  hazardState(frame) {
    const h = this.hazard; if (!h) return null;
    const period = h.warn + h.sweep + h.calm;
    const cycle = Math.floor(frame / period), ph = frame - cycle * period;
    const span = h.axis === 'y' ? this.h : this.w;
    const dir = (cycle & 1) ? -1 : 1;
    const active = ph >= h.warn && ph < h.warn + h.sweep;
    const t = ph < h.warn ? 0 : active ? (ph - h.warn) / h.sweep : 1;
    // The leading edge runs from one band-width off the near side to one band-width past the far side,
    // so the whole front enters and the whole front leaves.
    let t1 = -h.band + t * (span + 2 * h.band), t0 = t1 - h.band;
    if (dir < 0) { const a = span - t1; t1 = span - t0; t0 = a; }
    return { kind: h.kind, axis: h.axis, span, band: h.band, active, warning: ph < h.warn, phase: ph, period, cycle, dir, t, t0, t1 };
  }
  // One frame of the hazard. Returns 0 always -- see below.
  tickHazard(frame, units) {
    // The map's one per-frame entry point from G.tick, so the dynamic features ride on it rather than
    // asking js/game.js for a second line. That is now the larger half of what this does.
    if (this.features.length) this.tickFeatures(frame, units);
    const h = this.hazard; if (!h || typeof G === 'undefined') return 0;
    const period = h.warn + h.sweep + h.calm;
    if (frame % period === 0) for (const p of G.players) p.msg(HAZARD_SAYS[h.kind] || 'An environmental hazard is closing in.', 'attack');
    // The damage pass used to live here: a pulse every twelfth frame, every unit in the front losing
    // hit points straight off, plus hazardAt/hazardSafe to answer "is this point in it". FIXLIST-M14 A2
    // deleted all of it rather than setting a rate to zero, so there is no path at all from the weather
    // to a hit point. The return value stays a number because test/mapmodes.js asserts a hazard-free
    // layout ticks to 0, and that check is what proves this whole function is inert without one.
    return 0;
  }
}

// ============================================================================
// A* pathfinding on the tile grid (8-dir, no corner cutting). Binary heap.
// ============================================================================
class Pathfinder {
  // closed is stamped with the search generation, like stamp and for the same reason, so it must be able
  // to hold one. It was a Uint8Array: closed[ci] = gen stored gen & 255, so from the 256th search of a
  // game onward closed[ci] === gen was never true and the closed set silently stopped working -- every
  // search from a few seconds in re-expanded nodes it had already expanded, spending the node budget on
  // repeats and returning a worse path. It also made the pathfinder carry state between searches, which
  // is what desynced a rejoining client: it starts at gen 0 with a working closed set while everyone
  // else is past 256 with a broken one, so it walks its units somewhere different. With the right width
  // a search depends on nothing but its own generation, and the scratch is scratch again.
  constructor(map) { this.map = map; this.g = new Float32Array(map.w * map.h); this.closed = new Int32Array(map.w * map.h); this.parent = new Int32Array(map.w * map.h); this.stamp = new Int32Array(map.w * map.h); this.gen = 0; }
  // returns array of [tx,ty] from start (exclusive) to goal, or best-effort partial path
  // `wide` asks for a path a BODY can walk rather than one a POINT can -- FIXLIST-M14 C6 (item 18).
  //
  // Measured before the change: every ground unit walks a two-tile gap cleanly and NONE of the 41 ever
  // ends inside a footprint, so the reported "the Thor walks onto buildings" does not happen -- the
  // self-heal pass in G.tick already covers it. What does happen is the fault the item hypothesised,
  // wearing a different symptom. Through a ONE-tile gap in a wall:
  //
  //     thor       r 20   arrived: FALSE
  //     ultralisk  r 20   arrived: FALSE
  //     reaver     r 18   arrived: true    <- and only because 18 is under the threshold below
  //     everything narrower: arrived
  //
  // A Thor is forty pixels across and the gap is thirty-two. The search handed it a route its body
  // could not take, it ground against the corner, and the player saw "my Thor will not go where I told
  // it" -- which reads as stuck.
  //
  // A TILE MUST HAVE ALL EIGHT NEIGHBOURS WALKABLE to carry a wide body. That is the whole rule, and it
  // is deliberately the cheapest correct one: a unit standing dead centre in a tile pokes (r - 16) px
  // into the neighbouring tile, so anything with r > 16 needs those neighbours and anything at or under
  // it does not. Three defs qualify -- Thor, Ultralisk and Reaver -- so the nine-fold neighbour test
  // costs nothing for the other thirty-eight, and nothing at all for the AI's workers and infantry.
  //
  // NO CLEARANCE MAP AND NO CACHE, on purpose: a precomputed one is faster and has to be invalidated
  // by every writer of `walk` and `blocked` -- the two block calls, the feature ticks, the hulks -- and
  // then again on a snapshot restore, which is four places to forget and a desync when one is missed.
  // Tested on demand, it cannot go stale.
  //
  // THE START TILE IS EXEMPT. It is pushed before the loop and never tested, which matters: a Thor that
  // has been shoved into a tight spot must still be able to path OUT of it.
  find(sx, sy, gx, gy, maxNodes = 6000, wide = false) {
    const m = this.map, W = m.w, Hh = m.h;
    if (!m.inb(sx, sy)) return [];
    const goalWalk = m.walkable(gx, gy);
    const fits3 = (x, y) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!m.walkable(x + a, y + b)) return false; return true; };
    // A wide body standing where it does not fit -- a crawler that G.passable let squeeze into the
    // one-tile gap between two colonies (REVIEW-M17 task 29, measured in the eight-player game) -- could
    // never take a first step: every neighbour failed the 3x3 test and every diagonal needs two that
    // pass, so the search returned an empty path and the unit ground straight at its goal for the
    // watchdog's ten seconds, three stuck points a frame. Within two tiles of such a start the narrow
    // test applies, which is the test it walked in on; past that it must fit again.
    const escape = wide && !fits3(sx, sy);
    const fits = wide
      ? (escape ? (x, y) => fits3(x, y) || (Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2 && m.walkable(x, y)) : fits3)
      : (x, y) => m.walkable(x, y);
    if (this.gen >= 0x7ffffffe) { this.gen = 0; this.stamp.fill(0); this.closed.fill(0); } // 2^31 searches is not reachable in a game, but a wrap would fail the same silent way
    this.gen++;
    const gen = this.gen, g = this.g, stamp = this.stamp, parent = this.parent, closed = this.closed;
    const heap = []; // [f, idx]
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break;[heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, s = k; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === k) break;[heap[s], heap[k]] = [heap[k], heap[s]]; k = s; } } return top; };
    const hfn = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); };
    const si = sy * W + sx;
    stamp[si] = gen; g[si] = 0; parent[si] = -1; closed[si] = 0;
    push(hfn(sx, sy), si);
    let best = si, bestH = hfn(sx, sy), n = 0;
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [-1, 1, 1.4142], [1, -1, 1.4142], [-1, -1, 1.4142]];
    while (heap.length && n < maxNodes) {
      const [, ci] = pop();
      if (closed[ci] === gen) continue;
      closed[ci] = gen; n++;
      const cx = ci % W, cy = (ci / W) | 0;
      const hh = hfn(cx, cy);
      if (hh < bestH) { bestH = hh; best = ci; }
      if (cx === gx && cy === gy) { best = ci; break; }
      if (!goalWalk && hh <= 1.5) { best = ci; break; }
      for (const [dx, dy, cost] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
        const ni = ny * W + nx;
        if (!fits(nx, ny)) continue;
        // No cutting a corner diagonally past two blocked tiles. For a wide body the same rule applies
        // to the wider test, or a Thor would slip diagonally through a gap it cannot walk through.
        if (dx && dy && (!fits(cx + dx, cy) || !fits(cx, cy + dy))) continue;
        if (closed[ni] === gen) continue;
        const ng = g[ci] + cost;
        if (stamp[ni] !== gen || ng < g[ni]) { stamp[ni] = gen; g[ni] = ng; parent[ni] = ci; push(ng + hfn(nx, ny), ni); }
      }
    }
    const path = [];
    for (let i = best; i !== -1 && i !== si; i = parent[i]) path.push([i % W, (i / W) | 0]);
    path.reverse();
    // string-pulling: remove intermediate nodes with line of sight
    return this.smooth(path, sx, sy);
  }
  los(x0, y0, x1, y1) {
    const m = this.map; let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), x = x0, y = y0, sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    for (;;) {
      if (!m.walkable(x, y)) return false;
      if (x === x1 && y === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { if (!m.walkable(x, y + sy) && dx && dy) return false; err -= dy; x += sx; }
      if (e2 < dx) { if (!m.walkable(x + sx, y) && dx && dy) return false; err += dx; y += sy; }
    }
  }
  smooth(path, sx, sy) {
    if (path.length < 3) return path;
    const out = []; let cx = sx, cy = sy, i = 0;
    while (i < path.length) {
      let j = Math.min(path.length - 1, i + 12);
      while (j > i && !this.los(cx, cy, path[j][0], path[j][1])) j--;
      out.push(path[j]); cx = path[j][0]; cy = path[j][1]; i = j + 1;
    }
    return out;
  }
}
