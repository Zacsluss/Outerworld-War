'use strict';
// ============================================================================
// Map: terrain grid, cliffs/ramps, resources, creep, psi power, placement.
// height: 0 low ground, 1 ramp, 2 high ground. walk: 1 walkable.
// ============================================================================
// Map layouts. Coordinates are quadrant-0 tiles, mirrored 4-fold. Mains listed first.
const MAP_LAYOUTS = {
  temple: { name: 'Lost Ruins', players: 4, startOrder: [0, 3, 1, 2],
    high: [['rect', 4, 4, 32, 26], ['ellipse', 20, 17, 18, 15], ['rect', 50, 50, 14, 14], ['ellipse', 63.5, 63.5, 17, 17]],
    ramps: [[31, 28, 4, 5], [61, 45, 3, 5], [45, 61, 5, 3]],
    rocks: [['rect', 4, 30, 18, 4], ['ellipse', 42, 33, 4, 3], ['ellipse', 30, 58, 3, 2.5], ['ellipse', 58, 28, 2.5, 3], ['ellipse', 40, 50, 3, 3]],
    bases: [
      { hall: [12, 12], minerals: [[7, 9], [7, 11], [7, 13], [7, 15], [7, 17], [10, 8], [12, 8], [14, 8]], geyser: [17, 7], main: true },
      { hall: [29, 38], minerals: [[24, 36], [24, 38], [24, 40], [24, 42], [27, 45], [29, 45], [31, 45]], geyser: [34, 44], natural: true },
      { hall: [10, 52], minerals: [[5, 49], [5, 51], [5, 53], [5, 55], [5, 57], [5, 59]], geyser: [10, 58] },
      { hall: [52, 10], minerals: [[49, 5], [51, 5], [53, 5], [55, 5], [57, 5], [59, 5]], geyser: [59, 10] },
    ] },
  bloodbath: { name: 'Blood Pit', players: 4, startOrder: [0, 3, 1, 2],
    high: [['ellipse', 63.5, 63.5, 12, 10]],
    ramps: [[62, 52, 3, 3], [52, 62, 3, 3]],
    rocks: [['ellipse', 30, 30, 5, 4], ['rect', 4, 40, 10, 3], ['rect', 40, 4, 3, 10], ['ellipse', 46, 22, 3, 3], ['ellipse', 22, 46, 3, 3]],
    bases: [
      { hall: [12, 12], minerals: [[7, 9], [7, 11], [7, 13], [7, 15], [10, 7], [12, 7], [14, 7], [16, 7]], geyser: [19, 11], main: true },
      { hall: [30, 12], minerals: [[27, 5], [29, 5], [31, 5], [33, 5], [35, 5], [37, 8]], geyser: [37, 12] },
      { hall: [12, 30], minerals: [[5, 27], [5, 29], [5, 31], [5, 33], [5, 35], [8, 37]], geyser: [12, 36] },
    ] },
  valley: { name: 'Twilight Valley', players: 2, startOrder: [0, 1],
    high: [['rect', 4, 4, 40, 30], ['ellipse', 24, 19, 22, 17], ['rect', 4, 60, 22, 8]],
    ramps: [[38, 32, 5, 5], [24, 60, 4, 4]],
    rocks: [['rect', 44, 4, 4, 22], ['ellipse', 56, 40, 6, 5], ['ellipse', 64, 63, 10, 4], ['rect', 30, 50, 10, 3], ['ellipse', 80, 20, 4, 4]],
    bases: [
      { hall: [14, 14], minerals: [[9, 11], [9, 13], [9, 15], [9, 17], [9, 19], [12, 10], [14, 10], [16, 10], [18, 10]], geyser: [20, 9], main: true, quadrants: [0, 3] },
      { hall: [36, 40], minerals: [[31, 38], [31, 40], [31, 42], [31, 44], [34, 47], [36, 47], [38, 47]], geyser: [41, 46], natural: true, quadrants: [0, 3] },
      { hall: [12, 72], minerals: [[7, 69], [7, 71], [7, 73], [7, 75], [7, 77], [10, 79]], geyser: [15, 78], quadrants: [0, 3] },
      { hall: [60, 14], minerals: [[57, 9], [59, 9], [61, 9], [63, 9], [65, 9], [67, 12]], geyser: [67, 16], quadrants: [0, 3] },
      { hall: [94, 40], minerals: [[89, 37], [89, 39], [89, 41], [89, 43], [92, 35], [94, 35]], geyser: [98, 34], quadrants: [0, 3], rich: true },
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
//   small    96x96        2         2         2000  6000     64 tiles    no high ground at all
//   medium  128x128       4         3         1500  5000    142 tiles    main plateau, one ramp
//   large   192x192       4         5         1500  5000    233 tiles    plateau + a central one
//   huge    256x256       4         7         1100  4000    323 tiles    plateau + a big central one
//
// "spawns apart" is the first two spawn points, which the start order puts on the diagonal on every
// size but small -- where they are deliberately mirrored left-to-right instead.
//
// Read down the columns rather than across:
//
//   * SMALL is a duel over one bank. Two mains, mirrored left-to-right rather than diagonally, so the
//     walk between them is a third of medium's; two contested bases on the centre line that belong to
//     nobody. There is no high ground anywhere, so there is no defender's terrain and no ramp to hold
//     -- the only way to be safe is for the other player to be dead. To make a one-base game last long
//     enough to be a game, the mains are fat: nine patches at 2000 is 18,000 minerals, half again what
//     a medium main holds.
//   * MEDIUM is the historical feel. 128x128, four players, main + natural + one expansion, 1500 a
//     patch -- the numbers every balance run in this repository was measured against.
//   * LARGE gives each player five bases and a central plateau worth taking, so there is more than one
//     front and holding all of your ground costs army. The fifth base is ON that plateau, which is what
//     makes "worth taking" a claim about the economy rather than about the view -- see the base list.
//   * HUGE gives seven, but each patch holds 1100 rather than 1500. A player's whole territory is worth
//     about what large's is (49,500 minerals either way) -- it is just spread over seven bases that run
//     dry 27% faster, so standing still is losing even when nobody is shooting at you. That, plus a
//     323-tile diagonal -- 2.3 times medium's -- is what makes travel time a decision rather than a
//     loading screen.
//
// The one thing that is NOT a rule difference: unit stats. Nothing here touches js/data.js.
const MAP_SIZES = {
  small: {
    name: 'Close Quarters', w: 96, h: 96, players: 2, tileset: 'badlands', startOrder: [0, 1],
    patch: 2000, gas: 6000, patches: { main: 9, natural: 7, expo: 7 },
    // Mains mirrored left-to-right (quadrants 0 and 1) so they are 64 tiles apart, not 90 on the
    // diagonal. The two expansions sit on the centre line with one copy each, which is the whole
    // point of them: they are equidistant from both mains and cannot be held quietly.
    bases: [{ x: 14, y: 40, role: 'main', q: [0, 1] }, { x: 46, y: 12, role: 'expo', q: [0, 2] }],
    high: [], ramps: [], rocks: [['ellipse', 32, 28, 5, 4]],
  },
  medium: {
    name: 'Contested Ground', w: 128, h: 128, players: 4, tileset: 'jungle', startOrder: [0, 3, 1, 2],
    patch: 1500, gas: 5000, patches: { main: 8, natural: 7, expo: 6 },
    bases: [{ x: 12, y: 12, role: 'main' }, { x: 30, y: 38, role: 'natural' }, { x: 12, y: 50, role: 'expo' }],
    high: [['rect', 4, 4, 32, 26], ['ellipse', 20, 17, 18, 15]],
    ramps: [[31, 28, 4, 5]],
    rocks: [['rect', 4, 32, 14, 3], ['ellipse', 46, 46, 5, 4]],
  },
  large: {
    name: 'Broken Expanse', w: 192, h: 192, players: 4, tileset: 'badlands', startOrder: [0, 3, 1, 2],
    patch: 1500, gas: 5000, patches: { main: 8, natural: 7, expo: 6 },
    // The fifth base is ON the central plateau, not beside it. It used to sit at 66,66 on the low
    // ground below -- so the plateau was 1,168 tiles of high ground that held nothing, cost nothing to
    // give up, and was worth taking only for the view. A player's fifth base being up there means
    // taking high ground is an economic decision and holding it is an army commitment, which is the
    // difference between terrain that is a tactical asset and terrain that is scenery.
    bases: [{ x: 12, y: 12, role: 'main' }, { x: 34, y: 40, role: 'natural' },
      { x: 12, y: 58, role: 'expo' }, { x: 58, y: 12, role: 'expo' }, { x: 85, y: 88, role: 'expo' }],
    high: [['rect', 4, 4, 34, 28], ['ellipse', 21, 18, 19, 16], ['ellipse', 95.5, 95.5, 22, 20]],
    ramps: [[33, 30, 5, 6], [92, 70, 4, 10]],
    rocks: [['rect', 4, 40, 20, 3], ['ellipse', 50, 50, 6, 5]],
  },
  huge: {
    name: 'The Long March', w: 256, h: 256, players: 4, tileset: 'ice', startOrder: [0, 3, 1, 2],
    patch: 1100, gas: 4000, patches: { main: 8, natural: 7, expo: 6 },
    // ...and the same on huge: the fifth of seven is on the central plateau rather than at 70,70 below it.
    bases: [{ x: 12, y: 12, role: 'main' }, { x: 36, y: 44, role: 'natural' },
      { x: 12, y: 58, role: 'expo' }, { x: 58, y: 12, role: 'expo' }, { x: 112, y: 112, role: 'expo' },
      { x: 12, y: 102, role: 'expo' }, { x: 102, y: 12, role: 'expo' }],
    high: [['rect', 4, 4, 36, 30], ['ellipse', 22, 19, 20, 17], ['rect', 100, 100, 28, 28], ['ellipse', 127.5, 127.5, 34, 34]],
    ramps: [[35, 32, 6, 8], [122, 88, 4, 12], [88, 122, 12, 4]],
    rocks: [['rect', 4, 46, 24, 3], ['ellipse', 56, 56, 7, 6]],
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
  base(x, y, patches, amount, gas, role) {
    const min = [], col = Math.min(patches, 5), row = patches - col;
    for (let i = 0; i < col; i++) min.push([x - 5, y - 3 + i * 2]);
    for (let i = 0; i < row; i++) min.push([x - 2 + i * 2, y - 4]);
    const b = { hall: [x, y], minerals: min, geyser: [x + 5, y - 5], amount, gas };
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
        const o = this.base(b.x, b.y, S.patches[b.role], S.patch, S.gas, b.role);
        if (b.q) o.quadrants = b.q.slice();
        return o;
      }),
    };
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
//   * `height` and `cliff` are NOT captured, so they have to be re-derived. `broken` is therefore an
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
// How much fully churned ground costs a ground unit, and how much one worker trip strips the ground
// around a patch. MINE_STRIP saturates a tile at 255 after about 128 trips out of the ~187 a 1500
// patch holds, so a patch that has been worked hard is bare rock well before it runs dry -- you can
// read how long a base has been running off the ground, which is the point of the attrition economy.
const CHURN_SLOW = 0.25, MINE_STRIP = 2;
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
//   basin        no plateau at the mains, one big contested one in the middle, four bases a player
//                and a spire on each approach. Whoever wants to be safe has to take ground.
//   islands      two channels cut each quadrant into pieces. Every piece has one permanent causeway
//                and one bridge, so dropping a bridge costs the attacker the short way, never the
//                defender's ability to walk home.
//   cliffs       three terraces. The main and its natural are both on high ground, the middle is not,
//                and rock formations sit in two of the ramps.
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
// A NOTE ON THE BUILD STAMP. js/build.js hashes MAP_LAYOUTS and the source of GameMap's methods; it
// does not know this object exists, exactly as it does not know MapModes or HAZARDS exist. The four
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
    // A two-player size puts both mains on the diagonal and gives every base the same pair of
    // quadrants, so the map stays a mirror of itself rather than half a four-player map.
    L.quads = S.players === 2 ? [0, 3] : null;
    this[key](L, S, R);
    for (const b of L.bases) if (L.quads) b.quadrants = L.quads.slice();
    for (const f of L.features) if (L.quads && !f.quadrants) f.quadrants = L.quads.slice();
    delete L.quads;
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
    const rw = Math.max(4, fx(0.035)), rx = 3 + pw - rw, ry = 3 + ph - 2;
    L.ramps.push([rx, ry, rw, Math.max(6, fy(0.06))]);                              // down from the plateau's inner corner
    this.base(L, S, Math.max(8, fx(0.08)), Math.max(8, fy(0.08)), 'main');
    this.base(L, S, rx + fx(0.025), ry + fy(0.075), 'natural');
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
  // No defender's terrain at home at all -- the only high ground on the map is one big plateau in the
  // middle, and it is worth taking. FIVE bases a player, and the fifth is on top of that plateau, so
  // "whoever wants to be safe has to take ground" is a sentence about the economy and not only about
  // sight lines: on this map the only high ground there is, is also a base, and it is equidistant from
  // everybody. A spire on each approach means there is somewhere an army can be that you cannot see.
  basin(L, S, R) {
    const W = S.w, H = S.h, fx = f => Math.round(f * W), fy = f => Math.round(f * H);
    L.high.push(['ellipse', W / 2 - 0.5, H / 2 - 0.5, fx(this.rf(R, 0.13, 0.17)), fy(this.rf(R, 0.13, 0.17))]);
    L.ramps.push([fx(0.5) - fx(0.02), fy(this.rf(R, 0.32, 0.36)), Math.max(5, fx(0.045)), Math.max(6, fy(0.06))]);
    this.base(L, S, Math.max(8, fx(0.08)), Math.max(8, fy(0.08)), 'main');
    this.base(L, S, fx(this.rf(R, 0.20, 0.24)), fy(this.rf(R, 0.20, 0.24)), 'natural');
    this.base(L, S, Math.max(8, fx(0.07)), fy(this.rf(R, 0.33, 0.39)), 'expo');
    this.base(L, S, fx(this.rf(R, 0.33, 0.39)), Math.max(8, fy(0.07)), 'expo');
    this.centreBase(L, S);
    for (let i = 0; i < 3; i++) L.rocks.push(['ellipse', fx(this.rf(R, 0.26, 0.44)), fy(this.rf(R, 0.26, 0.44)), this.ri(R, 3, 5), this.ri(R, 3, 5)]);
    this.feat(L, 'spire', fx(this.rf(R, 0.29, 0.33)), fy(this.rf(R, 0.16, 0.20)), 4, 4);
    this.feat(L, 'spire', fx(this.rf(R, 0.16, 0.20)), fy(this.rf(R, 0.29, 0.33)), 4, 4);
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
    L.ramps.push([3 + pw - fx(0.03), 3 + ph - 2, Math.max(4, fx(0.03)), Math.max(5, fy(0.05))]);
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
  // nobody. The ramp onto the natural has a rock formation sitting in it, so a player who wants a
  // second way into their own expansion has to make one, and the attacker gets it too.
  cliffs(L, S, R) {
    const W = S.w, H = S.h, fx = f => Math.round(f * W), fy = f => Math.round(f * H);
    const rw = Math.max(4, fx(0.03)), rh = Math.max(7, fy(0.065));
    const pw = fx(this.rf(R, 0.23, 0.27)), ph = fy(this.rf(R, 0.20, 0.24));
    L.high.push(['rect', 3, 3, pw, ph]);                                             // terrace 1: the main
    const t2w = fx(this.rf(R, 0.11, 0.13)), t2h = fy(this.rf(R, 0.11, 0.13));
    const t2x = 3 + pw + fx(0.02), t2y = 3 + ph + fy(0.02);
    L.high.push(['rect', t2x, t2y, t2w, t2h]);                                       // terrace 2: the natural, also up
    L.high.push(['ellipse', W / 2 - 0.5, H / 2 - 0.5, fx(this.rf(R, 0.10, 0.12)), fy(this.rf(R, 0.10, 0.12))]);
    const r1 = [3 + pw - rw, 3 + ph - 2, rw, rh];                                    // main -> low ground
    const r2 = [t2x + Math.round(t2w / 2), t2y + t2h - 2, rw, rh];                   // low ground -> terrace 2
    const r3 = [Math.round(W / 2) - Math.round(rw / 2), Math.round(H / 2) - fy(0.13) - 2, rw + 2, rh + 4];   // onto the middle
    L.ramps.push(r1, r2, r3);
    this.base(L, S, Math.max(8, fx(0.08)), Math.max(8, fy(0.08)), 'main');
    this.base(L, S, t2x + Math.round(t2w / 2) - 2, t2y + Math.round(t2h / 2) - 2, 'natural');
    this.base(L, S, Math.max(8, fx(0.06)), fy(this.rf(R, 0.36, 0.42)), 'expo');
    this.base(L, S, fx(this.rf(R, 0.36, 0.42)), Math.max(8, fy(0.06)), 'expo');
    L.rocks.push(['ellipse', fx(this.rf(R, 0.30, 0.36)), fy(this.rf(R, 0.30, 0.36)), this.ri(R, 4, 6), this.ri(R, 4, 6)]);
    this.feat(L, 'rocks', r2[0], r2[1] + r2[3] - 2, rw, 2);                           // rocks in the ramp onto terrace 2
    this.feat(L, 'spire', fx(this.rf(R, 0.24, 0.29)), fy(this.rf(R, 0.40, 0.45)), 4, 4);
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
  // The layout this map is built from. A plain id is a MAP_LAYOUTS key; an "arch:<key>:<seed>[:<size>]"
  // id is generated on the spot instead of being registered, because there are four billion of them
  // per archetype and MAP_LAYOUTS is hashed into the build stamp. Both clients hold the generator, so
  // the id is enough for both to build the same ground -- which is the point of putting the seed in it.
  layoutDef() { return Archetypes.resolve(this.layout) || MAP_LAYOUTS[this.layout] || MAP_LAYOUTS.temple; }
  idx(x, y) { return y * this.w + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  H(x, y) { return this.inb(x, y) ? this.height[this.idx(x, y)] : 0; }
  // Apply painter fn(x,y) over 4-fold mirror symmetry
  sym(x, y, fn) {
    fn(x, y); fn(this.w - 1 - x, y); fn(x, this.h - 1 - y); fn(this.w - 1 - x, this.h - 1 - y);
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
    this.name = L.name; this.players = L.players; this.tileset = TILESET_IDS.includes(L.tileset) ? L.tileset : 'badlands';
    this.size = L.size || null;
    this.archetype = L.archetype || null;
    this.features = []; this.featTile = null;
    // Static config, never mutated by the tick -- see the hazard block above for why that matters.
    this.hazard = L.hazard ? Object.assign({}, L.hazard) : null;
    if (L.custom) return this.generateCustom(L);
    // --- high ground ---
    for (const [kind, ...a] of L.high) { if (kind === 'rect') this.rect(a[0], a[1], a[2], a[3], (x, y) => this.sym(x, y, setH(2))); else this.ellipse(a[0], a[1], a[2], a[3], (x, y) => this.sym(x, y, setH(2))); }
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
    for (const [kind, ...a] of L.rocks) { if (kind === 'rect') this.rect(a[0], a[1], a[2], a[3], (x, y) => this.sym(x, y, rock)); else this.ellipse(a[0], a[1], a[2], a[3], (x, y) => this.sym(x, y, rock)); }
    // --- causeways: gaps punched back out of a rock band, after it is painted ---
    // A generator that wants a wall with a hole in it can only describe the wall, because `rocks` is
    // additive. This is the hole. It runs before the bases so a base can still clear over it.
    for (const c of (L.causeways || [])) this.rect(c[0], c[1], c[2], c[3], (x, y) => this.sym(x, y, (px, py) => { const i = this.idx(px, py); this.walk[i] = 1; this.cliff[i] = 0; if (this.height[i] === 2) this.height[i] = 0; }));
    // --- bases (defined in quadrant 0, mirrored) ---
    for (let q = 0; q < 4; q++) for (const bd of L.bases) {
      if (bd.quadrants && !bd.quadrants.includes(q)) continue;
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
    const D = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
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
  // takes them off, but nothing in this build calls it, because every file that fires a weapon belongs
  // to another change. Three call sites finish it:
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
  // and blocked back afterwards, because -- as with features -- the snapshot does not carry height.
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
  // restores `wrecks`, `walk` and `blocked` but not `height`, so something has to put height back, and
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
    for (let q = 0; q < 4; q++) for (const fd of defs) {
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
      // assignment is the only chance the map gets to put `height` and `cliff` back -- neither of
      // which the snapshot carries. See the MAP_FEATURES comment.
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
  // **And one of them had already done it, in a layout that has shipped since M1.** Twilight Valley's
  // rich expansion has its geyser at 98,34, four tiles wide, sitting on the southern lip of the map's
  // biggest plateau -- so tiles 98..101,35 are height 2, walkable, and directly north of open low
  // ground at y 36. That is a four-tile-wide undrawn ramp onto the high ground of the map's most
  // valuable base, in two quadrants, and it is invisible: the terrain painter draws a cliff face there
  // because `cliff[]` says cliff, while `walk[]` says walk. Nothing had ever looked, because nothing
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
    this.placeNeutrals(L);   // after the seal: a site must sit on ground whose height is final
    this.resById = new Map(this.resources.map(r => [r.id, r]));
  }

  // ---------------- queries ----------------
  walkable(tx, ty) { if (!this.inb(tx, ty)) return false; const i = this.idx(tx, ty); return this.walk[i] === 1 && this.blocked[i] === -1; }
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
  // GameMap's methods and does not walk this file's module-level constants, so numbers that live out
  // there can be retuned without moving the build stamp -- and a save made before the retune would
  // then be accepted and quietly re-simulate into a different game. In here, changing a 1.15 refuses
  // the old save, which is the entire job of the stamp. Built once and frozen, so the per-shot path
  // allocates nothing.
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
    if (def.race === 'Z' && def.id === 'hatchery' && def.needsCreep) { /* hatcheries can go anywhere */ }
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
  // WIRING CONTRACT. The hazard needs one call a frame and it is not made yet, because js/game.js
  // belongs to another change. To turn hazard maps on, add exactly this line to G.tick(), next to the
  // other per-frame sim passes (after Abilities.tickFields(), before the AI loop):
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
    const fits = wide
      ? (x, y) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!m.walkable(x + a, y + b)) return false; return true; }
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
