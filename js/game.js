'use strict';
// ============================================================================
// Game state container G: units, players, spatial hash, vision, production,
// spawning/killing, supply, victory.
// ============================================================================
// How long a condition has to hold before the player is told, and how long the alert then stays quiet.
// hold is in alert passes (one a second), cool in frames. These are the numbers that decide whether an
// alert is useful or noise, so they live where they can be found rather than inline.
// Eight unit vectors, for pushing apart two units sitting on precisely the same pixel -- see separate().
// The diagonal is written out rather than computed from a square root, so every client holds the exact
// same constant and the nudge cannot become a source of drift.
const D = 0.7071067811865476;
const SEP_DIRS = [[1, 0], [D, D], [0, 1], [-D, D], [-1, 0], [-D, -D], [0, -1], [D, -D]];
// How close two ENEMY bodies may come, beyond their footprints: the shortest reach of any ground weapon, read off
// DATA rather than restated, so a new melee weapon shorter than today's shortest (the Infested Terran's) still lands.
// See separate().
const MELEE_REACH = Math.min(...Object.values(DATA.units).filter(d => d.gw).map(d => d.gw.range)) * TILE;
// The spatial grid is built before the frame's moves, so a neighbour can sit up to one frame's travel outside the
// cell its grid entry is in. separate() looks this much further than two bodies to be sure of seeing it.
const SEP_SLACK = 16;
// The supply ceiling. 200 is StarCraft's number and it exists to stop a match becoming unreadable; at
// 500 an army is allowed to become unwieldy instead of impossible, which is the point of the attrition
// direction -- a long game should end on a stripped map with two ruined armies, not two capped ones.
// Referenced rather than inlined because the supply-block alert and the refusal message both have to
// agree with it, and they did not used to.
const SUPPLY_CAP = 500;
// Full pathfinder searches allowed per tick; a unit past the budget keeps its old path and asks again
// next frame (Unit.moveTo). This was a literal 40 in two places -- G's initial value, which tick()
// overwrote every frame, and tick() itself -- so the declared value was dead. One number, stamped.
const PATH_BUDGET = 40;
// Day and night. Derived from the frame and stored nowhere, exactly like the sandstorm in js/map.js and
// for the same reason: anything remembered would be dropped by a replay seek or a rejoin and the two
// sides would then have different weather. 1 is full day, 0 is deep night.
//
// Twelve minutes a cycle, of which roughly a third is properly dark, with long dusks either side --
// night is a window you plan a raid inside, not a light switch. The render half reads G.daylight; the
// simulation half is the sight penalty in Unit.sight.
//
// NIGHT_SIGHT is what deep night multiplies sight by; NIGHT_DET is the FRACTION of that penalty a
// detector pays. Both were retuned after playtesting a night map: at 0.6 with detectors fully exempt,
// a drone saw 4.2 tiles while the overlord next to it still saw 9, so the only thing on the map that
// could see anything was the detector. That reads as a broken renderer rather than as weather. The
// reason detectors were exempt at all is that cloak must stay answerable, and that is a claim about
// detection RANGE -- so they now pay half the penalty instead of none, which keeps them the best eye
// on a dark map without making them the only one.
//
// NIGHT_AIR is the other half of idea 19, which the design says is "sight AND AIR MOVEMENT under real
// pressure" and which shipped with only the sight half built. Flying in the dark is slower: 15% at the
// bottom of the night, easing with the light like everything else here. It is deliberately small --
// the point is that a night harass arrives late rather than that air becomes unusable -- and it is on
// movement rather than on damage so that it changes WHEN a drop lands, not what it does when it gets
// there. Ground units are unaffected: the dark does not make walking harder.
const DAY_CYCLE = 24 * 60 * 12, NIGHT_SIGHT = 0.75, NIGHT_DET = 0.5, NIGHT_AIR = 0.85;
// How long a hulk stands, in frames. A razed building is an obstacle for a minute and a half -- long
// enough to matter to the fight that razed it and to the counter-attack, not long enough to wall the
// map off -- and a dead tank or ultralisk for twenty-five seconds. See the CRATERS block in js/map.js.
const WRECK_LIFE_BUILDING = 24 * 90, WRECK_LIFE_UNIT = 24 * 25;
// A ferry route picks up idle units within FERRY_PICKUP tiles of its near end, and leaves once it has
// anything and has waited FERRY_WAIT frames -- so a lone unit is not left behind waiting for a full
// load, and a queue of them still fills the transport before it goes. See the 'ferry' order in js/sim.js.
const FERRY_PICKUP = 5, FERRY_WAIT = 24 * 2;
function daylightAt(frame) {
  const t = ((frame % DAY_CYCLE) + DAY_CYCLE) % DAY_CYCLE / DAY_CYCLE;   // 0..1 through the cycle
  // A raised cosine: flat-ish day, flat-ish night, and a real dusk between them rather than a ramp.
  const c = (DMath.cos(t * Math.PI * 2) + 1) / 2;
  return c * c * (3 - 2 * c);                                            // smoothstep, so dusk eases
}
// Directional armour. A hit that lands behind or beside a unit hurts more than one it is facing, so
// where a unit is pointing becomes part of what it is worth -- flanking is a mechanic rather than a
// figure of speech, and a tank line has a front that can be turned.
//
// Multipliers are on the damage AFTER armour and the size table, so a flank does not turn a bad matchup
// into a good one; it makes a good position better. Front is exactly 1: facing your attacker is the
// baseline, and flanking is the reward. Discounting the front instead would have quietly made every
// number in the damage tables 10% weaker head-on, which is a balance change wearing a mechanic's coat --
// test/features.js caught that immediately by asserting an exact damage formula.
//
// Buildings, larvae, eggs and anything burrowed have no meaningful facing and are exempt. Splash and
// spells are exempt too -- an explosion does not come from a direction the way a bullet does.
const FACE_MULT = { front: 1, flank: 1.15, rear: 1.35 };
const FACE_FLANK = Math.PI * 0.5, FACE_REAR = Math.PI * 0.75;   // half-angles from the unit's facing
function hitFacing(t, src) {
  if (!src || t.isBuilding || t.def.larva || t.def.egg || t.burrowed) return 'front';
  const a = DMath.atan2(src.y - t.y, src.x - t.x) - t.facing;
  const off = Math.abs(DMath.atan2(DMath.sin(a), DMath.cos(a)));   // wrapped to [0, PI]
  return off <= FACE_FLANK ? 'front' : off <= FACE_REAR ? 'flank' : 'rear';
}
const ALERTS = {
  supply:   { hold: 4, cool: 24 * 40 },  // long enough to survive the moment between finishing a unit and starting a depot
  idleProd: { hold: 8, cool: 24 * 45 },  // a queue empties for a second all the time; eight is a player not looking
  carrier:  { hold: 3, cool: 24 * 45 },
  expo:     { hold: 1, cool: 24 * 30 },  // this one is urgent: fire on the first pass that sees it
};

const G = {
  map: null, pf: null, players: [], units: [], byId: new Map(), effects: [], projectiles: [], fields: [], frame: 0,
  pathBudget: PATH_BUDGET, over: false, winner: -1, speed: 1, paused: false, human: 0, cell: 64, grid: null, gw: 0, gh: 0,
  tickErrors: 0,   // units and AIs whose tick() threw this game (the try/catch in tick() counts them); alliances and nukeAlerts used to sit here and nothing read them

  init(opts) {
    UNIT_ID = 1; this.seed = opts.seed || 1; this.layout = opts.layout || 'temple'; this.setup = opts; this.cheats = {}; this.tickErrors = 0; this.log = []; this.pendingCmds = null; RNG.seed((this.seed * 7919 + 17) >>> 0); this._allVis = null; this.freePlay = false; this.mission = null;
    this.map = new GameMap(opts.seed || 1, opts.layout || 'temple'); this.pf = new Pathfinder(this.map);
    this.units = []; this.byId = new Map(); this.effects = []; this.projectiles = []; this.fields = []; this.frame = 0; this.over = false; this.winner = -1;
    this.gw = Math.ceil(this.map.w * TILE / this.cell); this.gh = Math.ceil(this.map.h * TILE / this.cell);
    this.grid = new Array(this.gw * this.gh).fill(null).map(() => []);
    this.players = [];
    const races = ['T', 'Z', 'P'];
    const pick = r => r === 'R' ? races[Math.floor(this.rand() * 3)] : r;
    // A start chosen in the lobby, or the seat's own (GameMap.assignStarts). Read from opts.players, which a replay and a
    // rejoin reproduce verbatim, and seed-free, so it draws nothing from G.rand() and every game without a choice is the
    // game it always was.
    const startOf = GameMap.assignStarts(opts.players, this.map.starts.length);
    const colorOf = Player.assignColors(opts.players, PLAYER_COLORS.length);   // a colour chosen in the lobby (tenth session, item 2), read from opts.players like the start
    opts.players.forEach((po, i) => {
      const p = new Player(i, pick(po.race), po.human, po.name || (po.human ? 'Player' : 'Computer ' + i)); p.team = po.team == null ? i : po.team;
      p.color = PLAYER_COLORS[colorOf[i]];
      p.vis = new Uint8Array(this.map.w * this.map.h); p.ai = po.human ? null : new AI(p, po.difficulty || 'normal');
      this.players.push(p);
      // Starting bank, if the setup screen asked for one. Here rather than applied by the caller
      // afterwards, because opts.players is what a replay and a network join reproduce verbatim --
      // anything applied outside G.init is invisible to a headless harness and to a rejoining client.
      if (po.minerals != null) p.minerals = po.minerals;
      if (po.gas != null) p.gas = po.gas;
      const base = this.map.starts[startOf[i]];
      p.startBase = base; p.startX = base.cx; p.startY = base.cy;
      this.setupStart(p, base);
    });
    // ------------------------------------------------------------------------
    // The third owner. See the RACE_INFO.N block in js/data.js for the contract.
    // ------------------------------------------------------------------------
    // Wildlife and derelicts need an owner that is nobody: a creature must be shootable and must
    // shoot back, and a derelict must be repairable, and both need a Player for that. It is appended
    // AFTER every real player so that `players[i]` still means what it meant -- opts.players.length
    // is unchanged, start bases are unchanged, and anything that walked `players` by index before
    // still lands on the same player.
    //
    // team -1 is allied with exactly itself. `neutral` is what the four places below test, rather
    // than the race letter, because a test should say what it means.
    //
    // Only created when the map actually has something for it to own. A layout with neither key gets
    // exactly the game it got before this landed, which is the same argument HAZARDS makes.
    this.neutral = null;
    if (this.map.neutrals && (this.map.neutrals.wildlife.length || this.map.neutrals.derelicts.length)) {
      const np = new Player(this.players.length, 'N', false, 'Neutral');
      np.team = -1; np.neutral = true; np.ai = null;
      np.vis = new Uint8Array(this.map.w * this.map.h);   // G.updateVision walks p.vis unguarded
      np.startBase = this.map.starts[0]; np.startX = np.startBase.cx; np.startY = np.startBase.cy;
      this.players.push(np); this.neutral = np;
      this.spawnNeutrals(np);
    }
    this.human = opts.human != null ? opts.human : this.players.findIndex(p => p.human && !p.neutral);
    // the hall you are given at frame 0 already sits on its full creep, as it does in Brood War;
    // only creep built during the game has to spread
    for (const u of this.units) if (u.def.creep && u.done) u.creepR = u.def.creep;
    this.map.recomputeCreep(this.units);
    for (const p of this.players) if (p.race === 'P') this.map.recomputePsi(p.id, this.units);
    this.recomputeSupply();
    this.rebuildGrid();
    this.updateVision();
  },
  setupStart(p, base) {
    const hallDef = DATA.buildings[RACE_INFO[p.race].hall];
    const hall = this.placeBuilding(hallDef, base.x, base.y, p.id); hall.done = true; hall.hp = hall.maxHp; hall.sh = hall.maxSh; hall.progress = hallDef.time;
    if (hallDef.spawnsLarva) for (let i = 0; i < LARVA_NATURAL; i++) this.spawnLarva(hall);
    const wd = RACE_INFO[p.race].worker;
    for (let i = 0; i < 4; i++) { const u = this.spawnUnit(wd, p.id, hall.x - 40 + i * 28, hall.y + hall.def.h / 2 * TILE + 24); const m = this.findNearestResource(u, 'mineral'); if (m) u.applyOrder({ type: 'gather', target: m, phase: 'goto' }); }
    // A Zerg player starts with a Queen as well as an Overlord (user decision, REVIEW-M17 second session).
    // Her 50 starting energy is two Spawn Larva casts the moment a hatchery is short of larvae, which is
    // the constraint a Zerg economy runs into first: test/eightplayer.js measured three Zerg AIs banking
    // 2,000+ minerals with zero larvae and no gas to buy a Queen with. Free, so the AI (which trains
    // Queens only from gas it rarely has) injects from the first minute too.
    if (p.race === 'Z') { this.spawnUnit('overlord', p.id, hall.x, hall.y - 60); this.spawnUnit('queen', p.id, hall.x + 48, hall.y + 40); }
  },

  // ---------------- spatial ----------------
  rebuildGrid() { for (const c of this.grid) c.length = 0; for (const u of this.units) { if (!u.alive || u.inside) continue; const cx = clamp((u.x / this.cell) | 0, 0, this.gw - 1), cy = clamp((u.y / this.cell) | 0, 0, this.gh - 1); this.grid[cy * this.gw + cx].push(u); } },
  near(x, y, r) { const out = []; this.nearEach(x, y, r, u => out.push(u)); return out; },
  // same visit order as near() but without building an array; the hot paths (separation, target search) use this
  nearEach(x, y, r, fn) {
    const x0 = clamp(((x - r) / this.cell) | 0, 0, this.gw - 1), x1 = clamp(((x + r) / this.cell) | 0, 0, this.gw - 1), y0 = clamp(((y - r) / this.cell) | 0, 0, this.gh - 1), y1 = clamp(((y + r) / this.cell) | 0, 0, this.gh - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const cell = this.grid[cy * this.gw + cx]; for (let i = 0; i < cell.length; i++) { const u = cell[i]; if (u.alive && distPt(u.x, u.y, x, y) <= r + u.r) fn(u); } }
  },
  allied(a, b) { if (a === b) return true; const pa = this.players[a], pb = this.players[b]; return !!(pa && pb && pa.team === pb.team); },
  allVis() { if (!this._allVis) { this._allVis = new Uint8Array(this.map.w * this.map.h).fill(2); } return this._allVis; },
  passable(x, y, u) {
    const m = this.map; const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!m.walkable(tx, ty)) return false;
    // check corners for units wider than a few px
    const r = Math.min(u.r, 14) * 0.6;
    if (!m.walkable(Math.floor((x - r) / TILE), ty) || !m.walkable(Math.floor((x + r) / TILE), ty) || !m.walkable(tx, Math.floor((y - r) / TILE)) || !m.walkable(tx, Math.floor((y + r) / TILE))) return false;
    return true;
  },
  separate() {
    // Every unit gets a turn as `a`, not only those sharing a cell with someone. The old
    // `if (cell.length < 2) continue` meant a unit alone in its 64 px cell was never the one doing the
    // looking, so a pair that straddled a cell boundary was invisible to the pass from both sides and
    // simply stayed overlapped -- two overlords 5.8 px apart, one in cell 12 and one in cell 11, sat
    // there forever. The neighbourhood below reaches into the neighbouring cells for exactly that reason.
    //
    // BODIES, NOT FOOTPRINTS (seventh session, user item 1: "units still seem to stack on top of each other too
    // much to the point where their models overlap"). This used to keep collision footprints apart, and only 0.85
    // of them. The art is drawn at up to 2.6 times the footprint, so a settled clump of twelve marines had 53% of
    // its drawn model area lying on other marines and some marines were entirely hidden; sixteen zerglings stood
    // 59% hidden (.claude/review/overlap/probe.js). Units now keep def.body apart -- the room the MODEL takes up,
    // measured from the baked silhouettes (DATA, BODY) -- while r keeps every rule it had: pathing, weapon range,
    // splash, clicks, placement. What changes is where units stand, not how anything is decided.
    //
    // Three kinds of pair keep the old footprint rule, 0.85 of the collision radii, and the old push weights with it:
    //  - A WORKER ON A MINING TRIP (gather or return), against anything. Brood War and StarCraft II both let a
    //    mining worker slide through a crowd, a mineral line is the one place units are meant to stack, and the
    //    income is tuned against this spacing; with bodies the line mines at a different rate.
    //  - AN ATTACHED MUNITION (an interceptor, a scarab), for the reason the collision push below gives.
    //  - AN ALLY THE ORDER IS ABOUT: a unit repairing, following, merging with or casting on another keeps the
    //    old rule with that one, because those orders measure their reach from the footprints.
    // And ENEMIES may close to melee reach. Body to body, a zealot is 26 px short of hitting a zealot, so an enemy
    // pair separates only to the nearer of body contact and footprint contact plus MELEE_REACH -- the reach of the
    // shortest ground weapon there is -- and every melee attacker can still land its blow.
    const grid = this.grid, gw = this.gw, gh = this.gh, cs = this.cell;
    // The biggest body on the field is how far a unit has to look for anything that could be touching it -- per layer,
    // because ground never separates from air and a Mothership would otherwise widen every marine's search.
    let bigG = 0, bigA = 0;
    for (const u of this.units) {
      if (!u.alive || u.inside || u.isBuilding) continue;
      const b = u.def.body || u.r;
      if (u.fly) { if (b > bigA) bigA = b; } else if (b > bigG) bigG = b;
    }
    for (const cell of grid) {
      for (let i = 0; i < cell.length; i++) {
        const a = cell[i]; if (!a.alive || a.isBuilding || a.def.larva || a.burrowed) continue;
        const ab = a.def.body || a.r, aOld = !!a.parent || (a.def.worker && (a.order.type === 'gather' || a.order.type === 'return'));
        const reach = ab + (a.fly ? bigA : bigG) + SEP_SLACK;
        const x0 = clamp(((a.x - reach) / cs) | 0, 0, gw - 1), x1 = clamp(((a.x + reach) / cs) | 0, 0, gw - 1);
        const y0 = clamp(((a.y - reach) / cs) | 0, 0, gh - 1), y1 = clamp(((a.y + reach) / cs) | 0, 0, gh - 1);
        for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
          const near = grid[cy * gw + cx];
          for (let j = 0; j < near.length; j++) {
            const b = near[j];
            if (b.id <= a.id || !b.alive || b.isBuilding || b.def.larva || b.burrowed) continue;
            // Air separates from air and ground from ground, but the two layers pass through each other:
            // a wraith flying over a marine is not a collision. Flyers used to be skipped entirely, so any
            // number of overlords could sit on one pixel. Note this is a deliberate departure from Brood
            // War, where air units do not collide at all and stacking mutalisks is a real technique.
            if (!!a.fly !== !!b.fly) continue;
            const old = aOld || !!b.parent || (b.def.worker && (b.order.type === 'gather' || b.order.type === 'return'));
            let min;
            if (old) min = (a.r + b.r) * 0.85;
            else if (this.allied(a.owner, b.owner)) {
              // A unit whose order is ABOUT the other one -- repairing it, following it, casting on it, merging
              // with it -- keeps the footprint rule with it. Those orders measure their reach from the collision
              // radii (an SCV repairs within r + r + 8, two High Templar merge inside 28 px), and bodies would
              // hold them out of it: an SCV could never repair a Siege Tank.
              min = a.order.target === b || b.order.target === a || a.order.partner === b || b.order.partner === a ? (a.r + b.r) * 0.85 : ab + (b.def.body || b.r);
            } else {
              min = ab + (b.def.body || b.r);
              if (a.r + b.r + MELEE_REACH < min) min = a.r + b.r + MELEE_REACH;
            }
            const dx = b.x - a.x, dy = b.y - a.y;
            if (dx * dx + dy * dy >= min * min) continue;
            let d = DMath.hypot(dx, dy);
            let ux, uy;
            if (d < 0.01) {
              // Exactly coincident. dx and dy are both zero, so the unit vector is (0,0) and the push
              // below moves nothing -- two units on one pixel could never come apart. Pick a direction
              // from the pair's ids instead: same answer on every client, and no trig, whose last bit is
              // not guaranteed to agree between engines.
              const h = ((a.id * 73856093) ^ (b.id * 19349663)) >>> 0;
              const v = SEP_DIRS[h & 7]; ux = v[0]; uy = v[1]; d = 0.01;
            } else { ux = dx / d; uy = dy / d; }
            // Each pair is pushed exactly to contact, half each (or the weights below): the strongest one pass
            // can be. It was damped once (0.6, then 0.9) because full strength broke test/wrongthing.js -- a unit
            // rallied somewhere unreachable was jostled enough that its stuck detector read the jostling as
            // progress. Unit.moveTo's watchdog now wants real progress toward the goal, so that reason is gone.
            //
            // Running the pass twice per frame is still not the answer to a crowd that settles slowly: a second
            // traversal of every unit, and it once broke test/snapshot.js's cross-process check, which is the
            // multiplayer rejoin path. That break is unexplained and is a real lead -- JSON round-trips a
            // snapshot exactly and there are no negative zeros, so extra position churn is exposing
            // something the snapshot does not capture. Chase it before adding a second pass for any reason.
            const push = (min - d) * 0.5;
            // A crowd that is getting somewhere tells everyone pressed into it (Unit.moveTo's watchdog, FLOW_HOLD).
            // Newest news wins, and nobody makes news by touching: a crowd stuck together stays stuck.
            if (a.owner === b.owner && a.moving && b.moving) {
              const fa = a.progF > a.flowF ? a.progF : a.flowF, fb = b.progF > b.flowF ? b.progF : b.flowF;
              if (fa > fb) b.flowF = fa; else if (fb > fa) a.flowF = fb;
            }
            let am = a.sieged ? 0 : 1, bm = b.sieged ? 0 : 1;
            // COLLISION PUSH (M12 item 14). The separation above is symmetric: both units yield half, so
            // a unit walking into a standing crowd of its own army stops dead against it and the two
            // shove each other in place. Give the MOVER right of way instead -- the one that is going
            // somewhere yields a quarter, the one that is standing still yields the rest -- and a column
            // flows through its own army instead of jamming behind it.
            //
            // SAME OWNER ONLY, which is the whole safety argument. Cross-owner push is how a blocked ramp
            // stops blocking and how a wall of units stops being a wall, so enemies keep the symmetric
            // rule and shove each other exactly as before. The weights sum to 2 either way, so the total
            // separation strength is unchanged.
            // Attached munitions are exempt. An interceptor or a scarab is not an army unit crossing a
            // crowd, it is a projectile on a leash whose orbit is tuned to a firing cadence -- giving it
            // right of way over its own carrier changed the return path enough to put two of a Carrier's
            // twenty-two shot gaps outside the Brood War jitter band, which test/rates.js measures.
            //
            // THE ONE IN FRONT GOES FIRST (seventh session, item 1). Between two units of one owner that are BOTH
            // moving, the one nearer its own goal (goalD, left by Unit.moveTo this frame) has the same right of way.
            // Shoving evenly is what turned the mouth of a choke into a scrum once bodies were kept apart -- the unit
            // about to enter the gap was shoved back by the one behind as hard as it shoved forward -- and what left
            // arrivals half inside each other. Measured with .claude/review/overlap/probe.js: twelve zealots through a
            // one-tile gap 15.7 s to 9.3 s, sixteen marines 10.9 s to 8.8 s, a settled clump of twelve marines from 6%
            // of its drawn area hidden to 3%.
            //
            // A UNIT IN RANGE AND FIGHTING HOLDS ITS GROUND against an ally on the move (plantF, left by Unit.engage this
            // frame), and the ally SLIDES ROUND IT toward where it is going rather than being pushed straight back.
            // Without the hold, the attackers already swinging at a target were shoved out of reach by the ones walking
            // up behind them, walked back in, and shoved someone else out: sixteen zerglings on one pinned marine were
            // shoved out of reach 93 times in ten seconds and averaged 4.3 in range. Holding alone stopped the shoving
            // but packed badly (the late arrivals queued behind the early ones); holding and sliding, 0 times and 5.0 in
            // range, against about six that fit round a marine at all (probe.js, SURROUND).
            let slide = null;
            if (am && bm && !a.parent && !b.parent && a.owner === b.owner) {
              if (a.moving !== b.moving) {
                const still = a.moving ? b : a;
                if (!old && still.plantF === this.frame) { slide = still; if (a.moving) { am = 2; bm = 0; } else { am = 0; bm = 2; } }
                else if (a.moving) { am = 0.25; bm = 1.75; } else { am = 1.75; bm = 0.25; }
              }
              // (a pair on the old footprint rule keeps the old weights as well: see the top of this function)
              else if (!old && a.moving && a.goalD !== b.goalD) { if (a.goalD < b.goalD) { am = 0.25; bm = 1.75; } else { am = 1.75; bm = 0.25; } }
            }
            let ax = a.x - ux * push * am, ay = a.y - uy * push * am, bx = b.x + ux * push * bm, by = b.y + uy * push * bm;
            if (slide) {
              // The slide: sideways across the line between the two, toward whichever side the mover's goal lies on,
              // by as much as the overlap it just walked into. The goal is the unit it is after if it is after one,
              // else the point it was sent to; an order with neither (a gather, a build) does not slide. Dead ahead
              // is broken by id, not by a coin, so every client slides the same way.
              const mv = slide === a ? b : a;
              const g = mv.order.target && mv.order.target.alive ? mv.order.target : mv.target && mv.target.alive ? mv.target : null;
              const gx = g ? g.x : mv.order.x, gy = g ? g.y : mv.order.y;
              if (gx !== undefined && gy !== undefined) {
                const nx = mv === a ? ux : -ux, ny = mv === a ? uy : -uy;
                const cr = nx * (gy - mv.y) - ny * (gx - mv.x);
                const s = cr > 0 || (cr === 0 && (mv.id & 1)) ? 1 : -1, k = push * 2;
                if (mv === a) { ax += -ny * s * k; ay += nx * s * k; } else { bx += -ny * s * k; by += nx * s * k; }
              }
            }
            // passable() reads the walk grid, which says nothing useful about a flyer -- gating on it
            // would pin overlords over cliffs and water, the places they most want to be.
            if (am && (a.fly || this.passable(ax, ay, a))) { a.x = ax; a.y = ay; }
            if (bm && (b.fly || this.passable(bx, by, b))) { b.x = bx; b.y = by; }
          }
        }
      }
    }
  },
  nudgeOut(u, b) { const x0 = b.tx * TILE, y0 = b.ty * TILE, x1 = x0 + b.def.w * TILE, y1 = y0 + b.def.h * TILE; if (u.x > x0 - u.r && u.x < x1 + u.r && u.y > y0 - u.r && u.y < y1 + u.r) { const cx = Math.floor(u.x / TILE), cy = Math.floor(u.y / TILE);
    // the candidate must actually be clear of this building, or findFreeTile happily returns the tile we are
    // already standing on (its centre is walkable) and the unit shuffles a few pixels and stays wedged
    const clearOf = (x, y) => { const px = (x + .5) * TILE, py = (y + .5) * TILE; return !(px > x0 - u.r && px < x1 + u.r && py > y0 - u.r && py < y1 + u.r); };
    let t = this.map.findFreeTile(cx, cy, 14, (x, y) => clearOf(x, y) && this.passable((x + .5) * TILE, (y + .5) * TILE, u));
    if (!t) t = this.map.findFreeTile(cx, cy, 20, clearOf); // wedged with nowhere roomy to go: anywhere out is better than in
    if (t) { u.x = (t[0] + .5) * TILE; u.y = (t[1] + .5) * TILE; u.px = u.x; u.py = u.y; u.path = null; if (u.def.larva) { u.wx = u.x; u.wy = u.y; } } } },

  // ---------------- visibility ----------------
  visible(pid, tx, ty) { const p = this.players[pid]; return p && p.vis[ty * this.map.w + tx] === 2; },
  visibleAt(pid, x, y) { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return this.map.inb(tx, ty) && this.visible(pid, tx, ty); },
  explored(pid, tx, ty) { return this.players[pid].vis[ty * this.map.w + tx] > 0; },
  // 1 in full day, 0 at the bottom of the night. A getter rather than a field so it cannot be captured,
  // restored stale, or drift between two clients.
  //
  // OPT-IN PER LAYOUT, like hazards and for the same reason. The first version ran the cycle on every
  // map, and eight combat checks in test/features.js began failing -- not because the code was wrong but
  // because long fights now happened after dark and units could no longer see far enough to have them.
  // That is the feature working, and it is also a global change to every existing map and every balance
  // number in the repository, arriving silently. A map declares `dayNight: true` to have weather of this
  // kind, exactly as it declares a hazard.
  get daylight() {
    const L = MAP_LAYOUTS[this.layout];
    return (L && L.dayNight) ? daylightAt(this.frame) : 1;
  },
  // What a player REMEMBERS of the enemy, as opposed to what they can currently see. Explored ground
  // shows its last known state: an enemy building you scouted an hour ago is still drawn there, whether
  // or not it still exists. Intelligence decays, and the map lies to you until you go and look again.
  //
  // The memory is only corrected by SIGHT. Seeing the tile and finding nothing there forgets it; a
  // building destroyed while you were not watching stays on your map. That asymmetry is the feature.
  rememberSeen(p) {
    if (!p.seen) p.seen = new Map();
    for (const u of this.units) {
      if (!u.alive || !u.isBuilding || u.inside) continue;
      if (this.allied(u.owner, p.id)) continue;
      if (this.visibleAt(p.id, u.x, u.y)) p.seen.set(u.id, { d: u.def.id, x: u.x, y: u.y, tx: u.tx, ty: u.ty, o: u.owner, f: this.frame, hp: u.hp, done: u.done });   // hp and done: the STATE seen, which is what the fog draws (REVIEW-M17 decision 10)
    }
    // ...and the correction. Walks the Map in insertion order, which is stable across a snapshot because
    // restore rebuilds it from an ordered array.
    for (const [id, mem] of p.seen) {
      if (!this.visibleAt(p.id, mem.x, mem.y)) continue;
      const u = this.byId.get(id);
      if (!u || !u.alive || u.inside) p.seen.delete(id);
    }
  },
  detected(u, pid) { return (u.detBy[pid] || -99) >= this.frame - 8; },
  canSee(pid, u) { if (u.owner === pid || this.allied(pid, u.owner)) return true; if (u.fx.parasite === pid) return true; if (!this.visibleAt(pid, u.x, u.y)) return false; if (u.isCloaked && !this.detected(u, pid) && !(u.fx.ensnare > 0 || u.fx.plague > 0)) return false; return true; },
  targetable(att, t) { if (!t.alive || t.inside) return false; if (t.buried && t.owner !== att.owner) return false; if (t.fx.stasis > 0) return false; if (t.owner === att.owner || this.allied(att.owner, t.owner)) return true; return this.canSee(att.owner, t); },
  circles: {},
  // Tile offsets within a radius, cached per radius.
  //
  // THE RADIUS IS ROUNDED, and that one call is a bug fix, not a tidy-up. The loop starts at -r and
  // steps by 1, so a FRACTIONAL radius makes every offset fractional too; `tx + dx` is then a
  // non-integer tile coordinate, `y * w + x` a non-integer index, and reading a typed array at a
  // non-integer index gives undefined rather than throwing. The height test `m.height[i] <= uh`
  // compares undefined and is false, so not one tile gets marked: a unit whose sight was not a whole
  // number contributed NO VISION AT ALL, silently.
  //
  // Nothing had fractional sight when this was written. Three things do now -- the night penalty, the
  // jammer aura, and the high-ground bonus -- and the first of them is what made it visible: on a night
  // map every ground unit went blind while detectors, whose sight stayed a round number, could still
  // see. It looked like a renderer bug and was reported as one.
  circle(r) { r = Math.max(0, Math.round(r)); if (this.circles[r]) return this.circles[r]; const o = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) o.push([dx, dy]); return this.circles[r] = o; },
  updateVision() {
    const m = this.map;
    for (const p of this.players) {
      if (p.defeated && !p.human) continue; // a defeated computer player has nothing to see
      const v = p.vis; for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1;
      const mark = (ux, uy, r, uh) => { const tx = Math.floor(ux / TILE), ty = Math.floor(uy / TILE); for (const [dx, dy] of this.circle(r)) { const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue; const i = y * m.w + x; if (m.height[i] <= uh || (m.height[i] === 2 && uh === 1 && false)) v[i] = 2; } };
      for (const u of this.units) { if (!u.alive || u.inside) continue; if (this.allied(u.owner, p.id) || u.fx.parasite === p.id) mark(u.x, u.y, u.sight, u.heightLevel()); }
      for (const f of this.fields) if (f.kind === 'scan' && this.allied(f.owner, p.id)) mark(f.x, f.y, 10, 2);
      if (p.human && (this.cheats.reveal || this.cheats.nofog)) v.fill(2);
      this.rememberSeen(p);
    }
    // detection
    for (const u of this.units) { if (!u.alive || !u.isDetector) continue; const r = u.sight * TILE; for (const t of this.near(u.x, u.y, r)) if (t.owner !== u.owner && t.isCloaked) for (const q of this.players) if (this.allied(q.id, u.owner)) t.detBy[q.id] = this.frame; }
    for (const f of this.fields) if (f.kind === 'scan') for (const t of this.near(f.x, f.y, 10 * TILE)) if (t.isCloaked) t.detBy[f.owner] = this.frame;
  },

  // ==========================================================================
  // CONTACTS -- what a Sensor Tower reports. FIXLIST-M14 C2 (item 12).
  // ==========================================================================
  // The player asked for enemy MOVEMENT as dots, without the tower illuminating its whole sight range.
  // Until now `sensor_tower` was a plain `sight: 16`, which is the opposite: it revealed sixteen tiles
  // of map and told you nothing you would not have learned by walking there.
  //
  // A CONTACT IS A POSITION AND NOTHING ELSE. No identity, no owner, no health, no targetability -- the
  // returned objects are plain {x, y} and deliberately do not carry the unit, so nothing downstream can
  // reach through a blip to the thing that made it. That restraint is the feature: the AI reads these
  // too (the user's decision), and an AI that could read a def id off a contact would be scouting for
  // free from inside its own base.
  //
  // DERIVED, NEVER STORED, for exactly the reason GameMap.hazardState is: js/snapshot.js captures unit
  // positions, so a function of unit positions survives a snapshot, a replay seek and a rejoin without
  // snapshot.js knowing this exists. A remembered list of past blips would be dropped on a seek and the
  // two sides would disagree about what the tower had seen. No G.rand, no clock, iteration order is
  // G.units -- so two clients compute the same contacts on the same frame.
  //
  // WHAT DOES NOT PRODUCE ONE, and each is a decision:
  //   * anything standing still     -- it is a MOVEMENT detector, so sitting still is a real answer
  //   * burrowed                    -- ground is cover from it, the same way it is cover from a storm
  //   * buildings                   -- they do not move, so they could only ever be revealed, not detected
  //   * things inside a transport   -- the transport makes the blip, its passengers do not
  //   * your own and your allies'   -- you know where your army is
  //   * larvae, eggs and munitions  -- a scarab in flight is not an army moving
  //
  // Movement is `u.x !== u.px`, the interpolation source the renderer already keeps, rather than the
  // `moving` flag: `moving` is set by the movement pass and is false on a unit being shoved along by
  // collision, which is still something arriving.
  contacts(pid) {
    const out = [];
    let any = null;
    for (const u of this.units) if (u.alive && u.done && u.def.sensor && this.allied(u.owner, pid)) (any || (any = [])).push(u);
    if (!any) return out;
    for (const t of this.units) {
      if (!t.alive || t.isBuilding || t.inside || t.burrowed) continue;
      const d = t.def; if (!d || d.larva || d.egg || d.notUnit) continue;
      if (this.allied(t.owner, pid)) continue;
      if (this.players[t.owner] && this.players[t.owner].neutral) continue;
      if (t.x === t.px && t.y === t.py) continue;
      for (const w of any) {
        const dx = w.x - t.x, dy = w.y - t.y, r = w.def.sensor * TILE;
        if (dx * dx + dy * dy <= r * r) { out.push({ x: t.x, y: t.y }); break; }
      }
    }
    return out;
  },
  // ---------------- spawning ----------------
  spawnUnit(defId, owner, x, y) { const u = new Unit(defId, owner, x, y); this.units.push(u); this.byId.set(u.id, u); return u; },
  placeBuilding(def, tx, ty, owner) {
    const b = new Unit(def.id, owner, (tx + def.w / 2) * TILE, (ty + def.h / 2) * TILE); b.tx = tx; b.ty = ty; b.hp = Math.max(1, def.hp * 0.1); b.sh = 0; b.done = false; b.progress = 0;
    this.units.push(b); this.byId.set(b.id, b); this.map.block(tx, ty, def.w, def.h, b.id);
    if (def.onGeyser) { const g = this.map.geyserAt(tx, ty); b.geyser = g; g.building = b; }
    // an add-on's parent is set by the caller
    for (const u of this.units) if (u.alive && !u.isBuilding && !u.fly && u !== b) this.nudgeOut(u, b);
    return b;
  },
  completeBuilding(b) {
    b.done = true; b.progress = b.def.time; b.hp = Math.max(b.hp, b.maxHp);
    // Nothing may be left standing inside a finished building. canPlace refuses a spot with a unit on
    // it, but it deliberately lets larvae and the owner's own workers through -- the builder has to
    // stand there, and larvae drift around a hatchery. A larva enclosed this way then morphs in place,
    // so what you find later is a zergling sitting inside a building, permanently idle because it
    // cannot path out of a footprint it should never have been in. Push anything caught out to the
    // nearest free spot, which is the same thing production does for a unit that has just been built.
    { const x0 = b.tx * TILE, y0 = b.ty * TILE, x1 = (b.tx + b.def.w) * TILE, y1 = (b.ty + b.def.h) * TILE;
      for (const u of this.units) {
        if (!u.alive || u.fly || u.isBuilding || u.inside) continue;
        if (u.x + u.r <= x0 || u.x - u.r >= x1 || u.y + u.r <= y0 || u.y - u.r >= y1) continue;
        const [sx, sy] = this.freeSpotAround(b, false); u.x = u.px = sx; u.y = u.py = sy; u.path = null;
      } }
    // a finished source starts with a small pad and grows out from it
    if (b.def.creep) { if (!b.creepR) b.creepR = Math.min(b.def.creep, CREEP_SEED); this.map.recomputeCreep(this.units); }
    if (b.def.psi) this.map.recomputePsi(b.owner, this.units);
    
    // A BUILDER THAT FINISHES STAYS WHERE IT IS (seventh session: "when all builder units finish building a
    // building, they seem to return back to the mineral line when not instructed. This is a bug."). It used
    // to be sent back to `lastRes`, the patch it last mined, whenever it came off the construction idle --
    // and `lastRes` survives everything, so an SCV that had been standing idle for minutes before it was
    // told to build still walked back to the minerals afterwards, and one that built a Refinery walked away
    // from the gas it had just made. Measured (.claude/review/builder-after.js): three of three Terran cases
    // walked about ten tiles back to a mineral patch; Protoss never did, because a Probe is released in
    // Unit.tickBuild and never passed through here. This behaviour came in with the very first commit and
    // nothing asked for it. What the builder does now is what it was TOLD: its shift-queued orders, if it
    // has any, and otherwise nothing.
    if (b.builder && b.builder.alive && b.builder.order.type === 'construct' && b.builder.order.target === b) { b.builder.nextOrder(); }
    b.builder = null;
    if (b.def.tier === 'addon' && b.parent) { b.parent.addon = b; }
    if (b.def.onGeyser) { b.alive = true; b.type = 'gas'; }
    this.recomputeSupply();
  },
  spawnLarva(h) { const l = this.spawnUnit('larva', h.owner, h.x - 30 + this.rand() * 60, h.y + h.def.h / 2 * TILE + 14); l.hatch = h; h.larvae.push(l); },
  freeSpotAround(b, fly) {
    if (fly) return [b.x, b.y + b.r + 10];
    const t = this.map.findFreeTile(b.tx + Math.floor(b.def.w / 2), b.ty + b.def.h, 10, (x, y) => this.map.walkable(x, y));
    if (t) return [(t[0] + .5) * TILE, (t[1] + .5) * TILE]; return [b.x, b.y + b.r + 16];
  },
  // How many scarabs a Reaver, or interceptors a Carrier, may hold right now: the def's base cap, or its researched
  // one once the capacity tech has landed (scarabCap / scarabTech, interceptorCap / interceptorTech in js/data.js).
  // One reader for what used to be the same ternary written out with its own literals in finishProduction, the
  // autocast pass, queueUnit and the AI's production loop -- where the Reaver half read a bare 5, so Reaver Capacity
  // was bought and never used (REVIEW-M17 task 22). Abilities.dockTick's 8 is a different number: what a hangar can
  // physically take back, which is above the unresearched cap because launched Interceptors are not counted against it.
  hangarCap(b, uid) {
    const d = b.def, p = b.player;
    return uid === 'scarab' ? (p.hasTech(d.scarabTech[0]) ? d.scarabTech[1] : d.scarabCap) : (p.hasTech(d.interceptorTech[0]) ? d.interceptorTech[1] : d.interceptorCap);
  },
  finishProduction(b, it) {
    const p = this.players[b.owner];
    if (it.kind === 'unit') {
      const ud = DATA.units[it.id];
      if (it.id === 'nuke') { p.nukes++; b.hasNuke = true; p.msg('Nuclear missile ready.'); return; }
      if (it.id === 'scarab') { b.scarabs = Math.min(b.scarabs + 1, this.hangarCap(b, 'scarab')); return; }
      if (it.id === 'interceptor') { b.interceptors = Math.min(b.interceptors + 1, this.hangarCap(b, 'interceptor')); return; }
      const count = ud.pair ? 2 : 1;
      for (let i = 0; i < count; i++) {
        let u;
        if (b.def.egg) { u = this.spawnUnit(it.id, b.owner, b.x + (i ? 12 : -12), b.y); }
        else { const [sx, sy] = this.freeSpotAround(b, ud.fly); u = this.spawnUnit(it.id, b.owner, sx + (i ? 14 : 0), sy); }
        const rr = this.rallyFor(b, u) || (b.def.egg && b.rallyFrom ? this.rallyFor(b.rallyFrom, u) : null);
        if (rr) this.applyRally(u, rr);
        // A NEW WORKER MINES (M12 item 4). Only when there is no rally to obey -- an explicit rally is
        // an instruction and must win -- and only from a hall, so a worker built at some forward
        // building does not immediately walk home across the map. This is the single most-clicked
        // piece of busywork the game had: every worker ever produced needed a manual right-click.
        else if (ud.worker && b.def.depot) {
          const m = this.findNearestResource(u, 'mineral');
          if (m) u.applyOrder({ type: 'gather', target: m, phase: 'goto' });
        }
      }
      if (b.def.egg) { this.kill(b, null, true); }
    } else if (it.kind === 'upg') { p.upg[it.id] = it.level; p.researching.delete(it.id); p.msg(DATA.upgrades[it.id].name + ' Level ' + it.level + ' complete.'); }
    else if (it.kind === 'tech') { p.tech.add(it.id); p.researching.delete(it.id); p.msg(DATA.techs[it.id].name + ' research complete.'); }
    else if (it.kind === 'morph') { this.morphBuilding(b, it.id); }
    this.recomputeSupply();
  },
  applyRally(u, r) {
    if (r.target && r.target.alive) { const t = r.target; if (t.def && (t.def.depot) && u.def.worker) { const m = this.findNearestResource(u, 'mineral'); if (m) u.applyOrder({ type: 'gather', target: m, phase: 'goto' }); return; } u.applyOrder({ type: 'follow', target: t }); return; }
    // Gas: a rally onto a geyser only means anything once something is standing on it, and the thing a
    // worker is actually sent to is that building, not the geyser. Falls through to a plain move while
    // the geyser is bare, which is what a player would see happen anyway.
    if (r.gas && r.gas.alive && r.gas.done && u.def.worker) { u.applyOrder({ type: 'gather', target: r.gas, phase: 'goto' }); return; }
    if (r.res && u.def.worker) {
      if (r.res.type === 'geyser') { for (const g of this.units) if (g.alive && g.done && g.def.onGeyser && g.geyser === r.res && this.allied(g.owner, u.owner)) { u.applyOrder({ type: 'gather', target: g, phase: 'goto' }); return; } }
      else { u.applyOrder({ type: 'gather', target: r.res, phase: 'goto' }); return; }
    }
    u.applyOrder({ type: 'move', x: r.x, y: r.y });
  },
  morphBuilding(b, toId) {
    const nd = DATA.buildings[toId]; const ratio = b.hp / b.maxHp;
    b.def = nd; b.maxHp = nd.hp; b.hp = Math.max(1, nd.hp * ratio); b.done = true; b.progress = nd.time;
    if (nd.energy) { b.maxEnergy = nd.energy; if (!b.energy) b.energy = 50; }
    this.map.recomputeCreep(this.units); this.recomputeSupply();
  },
  morphUnit(u, toId) { // egg-style morph of a mobile unit (hydra->lurker, muta->guardian)
    const ud = DATA.units[toId]; const eggId = toId === 'lurker' ? 'lurker_egg' : 'cocoon';
    const ed = DATA.units[eggId]; u.def = ed; u.maxHp = ed.hp; u.hp = ed.hp; u.burrowed = false; u.cloaked = false; u.order = { type: 'idle' }; u.queue = []; u.path = null; u.r = ed.r; u.fly = !!ed.fly;
    u.prod = [{ kind: 'unit', id: toId, progress: 0, total: ud.time, reserved: true }];
  },
  mergeUnits(a, b, toId) { const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2; this.kill(a, null, true); this.kill(b, null, true); const u = this.spawnUnit(toId, a.owner, x, y); u.morphT = 300; u.hp = u.maxHp; u.sh = u.maxSh; this.recomputeSupply(); },
  landBuilding(b, tx, ty) { const err = this.map.canPlace(b.def, tx, ty, b.player, this.units, b); if (err) { b.player.msg(err, 'error'); b.order = { type: 'idle' }; return; } b.lifted = false; b.fly = false; b.tx = tx; b.ty = ty; b.x = (tx + b.def.w / 2) * TILE; b.y = (ty + b.def.h / 2) * TILE; this.map.block(tx, ty, b.def.w, b.def.h, b.id); b.order = { type: 'idle' }; for (const u of this.units) if (u.alive && !u.isBuilding && !u.fly) this.nudgeOut(u, b);
    // landing next to an orphaned add-on of the right type re-attaches it
    const a = this.units.find(u => u.alive && u.isBuilding && u.owner === b.owner && u.def.tier === 'addon' && u.def.parent === b.def.id && !u.parent && u.done && u.tx === tx + b.def.w && u.ty === ty + b.def.h - 2); if (a) { a.parent = b; b.addon = a; }
    this.recomputeSupply(); },
  liftBuilding(b) { if (!b.def.canLift || b.prod.length || (b.addon && !b.addon.done)) return; b.lifted = true; b.fly = true; this.map.unblock(b.tx, b.ty, b.def.w, b.def.h, b.id); b.order = { type: 'idle' }; if (b.addon) { b.addon.parent = null; b.addon = null; } this.recomputeSupply(); },

  // ---------------- transports ----------------
  // How much a transport, or a Bunker, can hold: the def's `cargo`, or -- for the Overlord, which has none until
  // Ventral Sacs -- cargoTech's [tech, slots] once the tech is in, else nothing. The one reader; the ferry order in
  // js/sim.js, loadUnit, the AI's drop and the three UI gates each spelled it out before (REVIEW-M17 task 22).
  cargoCap(t) { const d = t.def; return d.cargo || (d.cargoTech && t.player.hasTech(d.cargoTech[0]) ? d.cargoTech[1] : 0); },
  cargoUsed(t) { return t.cargo.reduce((s, c) => s + (c.def.cargoSize || 1), 0); },
  loadUnit(t, u) {
    if (!t.alive || !u.alive || u.inside || u.isBuilding || u.fly) return false;
    const cap = this.cargoCap(t); if (!cap) return false;
    if (t.def.bunker && !['marine', 'firebat', 'ghost', 'medic', 'scv'].includes(u.def.id)) return false;
    if (this.cargoUsed(t) + (u.def.cargoSize || 1) > cap) { t.player.msg('Transport is full.', 'error'); return false; }
    if (u.order.type === 'gather' && u.order.target && u.order.target.miner === u) u.order.target.miner = null;
    u.inside = t; t.cargo.push(u); u.order = { type: 'idle' }; u.queue = []; u.path = null; u.target = null; u.sieged = false; u.burrowed = false; return true;
  },
  unloadOne(t) {
    const u = t.cargo.shift(); if (!u) return false;
    let x = t.x, y = t.y;
    if (t.isBuilding) { const s = this.freeSpotAround(t, false); x = s[0]; y = s[1]; }
    else { const tl = this.map.findFreeTile(Math.floor(t.x / TILE), Math.floor(t.y / TILE), 6); if (!tl) { t.cargo.unshift(u); return false; } x = (tl[0] + .5) * TILE; y = (tl[1] + .5) * TILE; }
    u.inside = null; u.x = x; u.y = y; u.px = x; u.py = y; u.order = { type: 'idle' }; u.path = null; return true;
  },
  unloadAll(t) { if (t.isBuilding) { while (t.cargo.length) this.unloadOne(t); } else t.applyOrder({ type: 'unload', x: t.x, y: t.y }); },

  // ---------------- resources ----------------
  findNearestResource(u, type) {
    let best = null, bd = 1e9;
    if (type === 'gas') { for (const b of this.units) { if (b.alive && b.done && b.owner === u.owner && b.def.onGeyser && b.geyser.amount > 0) { const d = dist(u, b); if (d < bd) { bd = d; best = b; } } } return best; }
    for (const r of this.map.resources) { if (r.type !== 'mineral' || r.amount <= 0) continue; const d = distPt(u.x, u.y, r.cx, r.cy) + (r.miner && r.miner.alive ? 200 : 0); if (d < bd) { bd = d; best = r; } }
    return best;
  },
  // WHICH MINERAL LINE A PATCH BELONGS TO (TODO-M18 item 6). The map already answers this -- every base
  // carries the list of patches that were placed around it (GameMap.generate) -- so "the same area" needs
  // no new idea and no new field: it is the base whose `minerals` holds this patch. Scanned rather than
  // cached onto the resource because it is asked only when a patch runs out, which is a handful of times
  // in a game, and a cached index would have to survive the snapshot and the editor's own resource lists.
  baseOfResource(res) { if (!res) return null; for (const b of this.map.bases) if (b.minerals.includes(res)) return b; return null; },
  // The nearest live patch in the SAME mineral line, or null when that line is finished.
  //
  // MEASURED before it was written (.claude/review/worker-walk.js, Lost Ruins): with the main drained,
  // ALL TWELVE workers walked to the natural 31 tiles away and each covered about 280 tiles in ninety
  // seconds, shuttling their minerals back past a hall they no longer had a reason to stand at. None of
  // them went idle, so nothing on screen said the base was finished. That is the behaviour the user
  // asked to have replaced with StarCraft II's: the line runs out, the workers stop, and moving them is
  // an instruction rather than a guess.
  //
  // The same-patch preference (+200 for a patch that already has a miner) is kept from
  // findNearestResource so a line with a free patch still fills evenly.
  nextPatchInBase(u, res) {
    const b = this.baseOfResource(res); if (!b) return null;
    let best = null, bd = 1e9;
    for (const r of b.minerals) { if (r.type !== 'mineral' || r.amount <= 0) continue; const d = distPt(u.x, u.y, r.cx, r.cy) + (r.miner && r.miner.alive ? 200 : 0); if (d < bd) { bd = d; best = r; } }
    return best;
  },
  nearestDepot(u) { let best = null, bd = 1e9; for (const b of this.units) { if (b.alive && b.done && !b.lifted && b.owner === u.owner && b.def.depot) { const d = dist(u, b); if (d < bd) { bd = d; best = b; } } } return best; },
  // How many workers are actually mining this patch right now. Counted by looking rather than by
  // keeping a tally: a tally has to be decremented on every exit path -- death, new order, patch mined
  // out, transferred by Mind Control -- and one missed decrement blocks a patch for the rest of the
  // game. This is called when a worker arrives, not per frame, and miners are by definition adjacent.
  minersOn(res, except) {
    let n = 0;
    for (const u of this.near(res.cx, res.cy, 3 * TILE)) {
      if (u === except || !u.alive || !u.def.worker) continue;
      const o = u.order;
      if (o.type === 'gather' && o.target === res && o.phase === 'mine') n++;
    }
    return n;
  },
  removeResource(r) { r.amount = 0; this.map.unblock(r.x, r.y, r.w, r.h, -2); this.map.rect(r.x, r.y, r.w, r.h, (x, y) => { if (this.map.blocked[this.map.idx(x, y)] === -2) this.map.blocked[this.map.idx(x, y)] = -1; }); const i = this.map.resources.indexOf(r); if (i >= 0) this.map.resources.splice(i, 1); this.repointRallies(r); },
  // A rally set onto a mineral patch keeps a reference to the patch, and this is the one place a patch
  // stops existing. Every rally aimed at it moves to the nearest remaining patch of the same kind --
  // what a player would do by hand -- and if there is none left the rally clears, which puts new units
  // back at the building that made them. Applies to every owner and to larva and egg rallies too, since
  // it walks units rather than buildings.
  repointRallies(gone) {
    let best = null, bd = 1e9;
    for (const o of this.map.resources) { if (o === gone || o.type !== gone.type || o.amount <= 0) continue; const d = distPt(gone.cx, gone.cy, o.cx, o.cy); if (d < bd) { bd = d; best = o; } }
    for (const u of this.units) {
      if (!u.alive) continue;
      const moved = best ? { x: best.cx, y: best.cy, target: null, res: best, gas: null } : null;
      if (u.rally && u.rally.res === gone) u.rally = moved;
      if (u.rallyW && u.rallyW.res === gone) u.rallyW = moved;
    }
  },

  // ---------------- supply ----------------
  recomputeSupply() {
    for (const p of this.players) { p.supUsed = 0; p.supMax = 0; }
    for (const u of this.units) {
      if (!u.alive) continue; const p = this.players[u.owner];
      if (u.def.notUnit) continue;
      if (!u.isBuilding) p.supUsed += u.def.sup || 0;
      for (const it of u.prod) if (it.kind === 'unit' && !it.reserved) { const ud = DATA.units[it.id]; if (!ud.notUnit) p.supUsed += (ud.sup || 0) * (ud.pair ? 2 : 1); }
      if (u.def.egg && u.prod[0]) { const ud = DATA.units[u.prod[0].id]; p.supUsed += (ud.sup || 0) * (ud.pair ? 2 : 1); }
      if (u.done && !u.lifted && !u.unpowered && u.def.sup && u.isBuilding) p.supMax += u.def.sup;
      if (u.def.supGive && !u.isBuilding) p.supMax += u.def.supGive;
    }
    for (const p of this.players) p.supMax = Math.min(SUPPLY_CAP, p.supMax);
  },

  // ---------------- damage & death ----------------
  damageRaw(t, amt, src) {
    if (!t.alive || t.fx.stasis > 0) return; if (this.cheats.god && this.players[t.owner].human) return;
    if (t.sh > 0) { const s = Math.min(t.sh, amt); t.sh -= s; amt -= s; }
    t.hp -= amt; if (src) { t.lastHit = this.frame; t.lastHitBy = src; }
    // Scarring. A tenth of every wound is permanent: maxHp comes down and never goes back up, so a unit
    // that has been through something is worth less than the one that rolled out of the factory beside
    // it, and healing, repair and Zerg regeneration all cap at the lower number without knowing about
    // this at all -- they already clamp to maxHp. Floored at 40% of the original so a veteran is
    // weathered rather than made of paper. Buildings are exempt: repair is supposed to make them whole.
    this.scar(t, amt);
    if (t.hp <= 0) this.kill(t, src);
  },
  // Scarring, shared by both damage paths. It lived inside damageRaw and damage() does not call
  // damageRaw -- it subtracts hp itself -- so scarring only ever fired from spells, and a thirty-thousand
  // frame bug scan across six matchups found not one scarred unit in any of them. The test passed the
  // whole time, because it called damageRaw directly.
  scar(t, amt) {
    if (!(amt > 0) || t.hp <= 0 || t.isBuilding || t.def.larva || t.def.egg) return;
    const floor = t.def.hp * 0.4;
    if (t.maxHp > floor) { t.maxHp = Math.max(floor, t.maxHp - amt * 0.1); if (t.hp > t.maxHp) t.hp = t.maxHp; }
  },
  damage(t, dmg, type, src, opts = {}) {
    if (!t.alive || t.fx.stasis > 0) return 0; if (this.cheats.god && this.players[t.owner].human) return 0;
    if (t.halluc) dmg *= 2;
    if (t.fx.matrix) { const ab = Math.min(t.fx.matrix.hp, dmg); t.fx.matrix.hp -= ab; dmg -= ab; if (t.fx.matrix.hp <= 0) t.fx.matrix = null; if (dmg <= 0) return 0; }
    let d = dmg; const p = this.players[t.owner];
    if (t.sh > 0) { d -= p.upgLevel('shields'); if (d < 0.5) d = 0.5; if (d <= t.sh) { t.sh -= d; this.onHit(t, src); return d; } d -= t.sh; t.sh = 0; }
    d = (d - t.armor) * (DMG_MULT[type] || DMG_MULT.normal)[t.def.size || 'medium'];
    // ...then where it landed. opts.splash covers explosions and spells, which have no direction.
    if (!opts.splash && !opts.noFacing) d *= FACE_MULT[hitFacing(t, src)];
    // ...and from what height. Shooting UP costs you 30%; shooting down costs nothing, because the
    // reward for taking the high ground is already the range and the sight. Of the two levers the
    // table offers -- `damage` and `hit` -- this takes damage and never both, so an uphill shot is
    // not punished twice, and so combat gains no new random roll. Splash is exempt for the same
    // reason it is exempt from facing: a blast does not come from a direction. Flyers on either end
    // are exempt because the map answers about the ground under them.
    if (!opts.splash && src && !src.fly && !t.fly) d *= this.map.heightBonus(src.x, src.y, t.x, t.y).damage;
    // Suppressing fire pins what it hits, and only while the fire keeps landing: a second of slow,
    // refreshed by every hit. Ranged attackers only, and never against buildings, larvae or eggs --
    // nothing that was going anywhere in the first place.
    if (src && src.suppresses && !t.isBuilding && !t.def.larva && !t.def.egg) t.fx.suppress = 24;
    if (d < 0.5) d = 0.5;
    t.hp -= d; this.scar(t, d); this.onHit(t, src);
    // The ground remembers the shot as well as the unit does. Blasts and explosive rounds only -- a
    // rifle does not crater -- and never under something flying. Gated on a real hit so the hot path
    // stays hot: chip damage from massed light fire would otherwise churn a whole battlefield for free.
    if (d >= 8 && !t.fly && (opts.splash || type === 'explosive')) this.map.crater(t.x, t.y, 1.2, Math.min(40, d * 0.4));
    if (t.hp <= 0) this.kill(t, src);
    return d;
  },
  onHit(t, src) {
    t.lastHit = this.frame; if (src) t.lastHitBy = src;
    const p = this.players[t.owner];
    // A building out at an expansion is left to tickAlerts, which can see whether anything is defending
    // it and say so; saying "your base is under attack" about a lone undefended nexus is the alert that
    // taught players to ignore alerts.
    const far = t.isBuilding && distPt(t.x, t.y, p.startX, p.startY) >= 16 * TILE;
    if (p.human && src && src.owner !== t.owner && !far) { if (this.frame - (p.lastAttackAlert || -9999) > 24 * 20) { p.lastAttackAlert = this.frame; p.msg(t.isBuilding || t.def.worker ? 'Your base is under attack.' : 'Your forces are under attack.', 'attack'); if (typeof UI !== 'undefined' && t.owner === this.human) UI.ping(t.x, t.y); } }
    // auto-retaliate: idle units that get hit attack back -- but never at their own side. A unit your own force-attack hits
    // (UI.execPending, tenth session item 1) stands and takes it, as in StarCraft; answering it would turn one order into a
    // brawl inside your own army.
    if (src && t.idle && !t.isBuilding && t.hasWeapon() && !t.def.worker && src.owner !== t.owner && !this.allied(t.owner, src.owner) && t.weaponFor(src) && this.targetable(t, src)) t.applyOrder({ type: 'attack', target: src, auto: true });
    // workers flee when attacked (mining)
    if (src && t.def.worker && t.owner !== src.owner && t.order.type === 'gather' && t.hp < t.maxHp * 0.5 && !p.human) { /* AI workers ignore */ }
  },
  kill(u, killer, silent) {
    if (!u.alive) return; u.alive = false; const p = this.players[u.owner];
    // A depot killed while LOWERED holds LOWERED_BLOCKED, not its id, and unblock clears only its id -- so it is raised on
    // the grid first, or its ground would stay unbuildable for the rest of the game.
    if (u.isBuilding) { if (!u.lifted) { if (u.lowered) this.map.setLowered(u.tx, u.ty, u.def.w, u.def.h, u.id, false); this.map.unblock(u.tx, u.ty, u.def.w, u.def.h, u.id); } if (u.def.creep) this.map.recomputeCreep(this.units); if (u.geyser) u.geyser.building = null; for (const l of u.larvae) this.kill(l, null, true); if (u.def.bunker) { while (u.cargo.length) this.unloadOne(u); } if (u.addon) { u.addon.parent = null; } if (u.parent) u.parent.addon = null; if (u.builder && u.builder.order.target === u) u.builder.nextOrder(); for (const it of u.prod) if (it.kind === 'upg' || it.kind === 'tech') p.researching.delete(it.id); }
    // Outside the isBuilding branch above, because a Warp Prism is a psi source that is not a building.
    // It used to sit inside it, so a dead prism left its field painted on the map until it happened to
    // be recomputed for some unrelated reason.
    if (u.def.psi) this.map.recomputePsi(u.owner, this.units);
    for (const c of u.cargo) { c.inside = null; if (!u.def.bunker) this.kill(c, killer, true); }
    if (u.launched) for (const ic of u.launched.slice())   /* a copy: each Interceptor's own kill splices it out of the array being walked, which skipped every other one (REVIEW-M17 task 20) */ if (ic.alive) this.kill(ic, null, true);
    if (u.parent && u.parent.launched) { const i = u.parent.launched.indexOf(u); if (i >= 0) u.parent.launched.splice(i, 1); }
    if (u.inside && u.inside.cargo) { const i = u.inside.cargo.indexOf(u); if (i >= 0) u.inside.cargo.splice(i, 1); }
    if (u.order.type === 'gather' && u.order.target && u.order.target.miner === u) u.order.target.miner = null;
    if (u.order.type === 'gather' && u.order.phase === 'inside' && u.order.target) u.order.target.occupant = null;
    if (u.hatch) { const i = u.hatch.larvae.indexOf(u); if (i >= 0) u.hatch.larvae.splice(i, 1); }
    if (killer && killer.owner !== u.owner && !silent) { killer.kills++; const kp = this.players[killer.owner]; if (u.isBuilding) kp.stats.buildingsKilled++; else kp.stats.unitsKilled++; }
    if (!silent) { if (u.isBuilding) p.stats.buildingsLost++; else p.stats.unitsLost++; }
    if (!silent && !u.halluc) { this.effects.push({ kind: u.isBuilding ? 'bigboom' : (u.def.race === 'Z' ? 'blood' : 'boom'), x: u.x, y: u.y, t: u.isBuilding ? 40 : 18, r: u.r, def: u.isBuilding ? null : u.def.id, owner: u.owner, facing: u.facing, fly: u.fly }); if (typeof Sound !== 'undefined' && this.visibleAt(this.human, u.x, u.y)) Sound.death(u); }
    // What it leaves behind. See the CRATERS block in js/map.js for why the crater is permanent and the
    // hulk is not. Hallucinations leave nothing -- there was never anything there -- and neither does
    // anything that was flying, inside a transport, or too small to be worth a scorch mark.
    if (!silent && !u.halluc && !u.fly && !u.inside) {
      if (u.isBuilding) {
        const w = u.def.w, h = u.def.h;
        this.map.crater(u.x, u.y, Math.max(w, h) * 0.8 + 0.5, 130);
        this.map.addWreck(u.x, u.y, w, h, WRECK_LIFE_BUILDING, this.frame, true);
      } else if ((u.def.size || 'medium') === 'large') {
        this.map.crater(u.x, u.y, 1.6, 70);
        this.map.addWreck(u.x, u.y, 1, 1, WRECK_LIFE_UNIT, this.frame, false);
      }
    }
    if (typeof UI !== 'undefined') UI.onUnitDied(u);
    this.recomputeSupply();
  },

  // ==========================================================================
  // NEUTRALS: buried life, and derelicts nobody built. M11 wave two, items 1 and 8.
  // ==========================================================================
  // The map's own owner. GameMap.placeNeutrals decided WHERE from the seed; this turns that plan into
  // units, and tickNeutrals is the whole of their behaviour -- they have no AI object, because an AI
  // in this codebase is a thing that builds an economy and sends waves, and a grub does neither.
  //
  // BURIED IS A SPAWN STATE, NOT A DEF FLAG. `def.burrowed` is read by the Unit constructor, so putting
  // it on the def would burrow every instance -- including a grub a warren has just spat out in the
  // middle of a fight, which would arrive unable to shoot. So the defs say `wake.buried` and the flag
  // is set here, once, on the creatures that start in the ground.
  //
  // A buried creature cannot be shot and NO DETECTOR REVEALS IT (see G.targetable). That is the
  // feature rather than an oversight: what warns you is the tell on the ground, which everyone can see
  // from frame 0 and which the renderer draws from DATA.buriedTells.
  spawnNeutrals(np) {
    const plan = this.map.neutrals; if (!plan) return;
    for (const d of plan.derelicts) {
      const def = DATA.buildings[d.id]; if (!def) continue;
      const b = this.placeBuilding(def, d.tx, d.ty, np.id);
      this.completeBuilding(b);
      // Ruined. `derelict.ruin` is the fraction of maxHp it stands at, and repairing it the rest of the
      // way is the capture -- see Abilities.repairTick.
      b.hp = Math.max(1, Math.round(b.maxHp * ((def.derelict && def.derelict.ruin) || 0.2)));
    }
    for (const w of plan.wildlife) {
      const def = DATA.all[w.id]; if (!def) continue;
      if (DATA.buildings[w.id]) {
        const b = this.placeBuilding(def, w.tx, w.ty, np.id); this.completeBuilding(b);
        b.buried = !!(def.wake && def.wake.buried); b.lair = { x: b.x, y: b.y };
      } else {
        for (let k = 0; k < (w.pack || 1); k++) {
          // Fanned out around the site by index rather than at random: a pack has to look like a pack,
          // and two grubs on one pixel is what SEP_DIRS spends every frame afterwards unpicking.
          const a = (k / Math.max(1, w.pack)) * Math.PI * 2;
          const u = this.spawnUnit(w.id, np.id, (w.tx + 0.5) * TILE + DMath.cos(a) * 18, (w.ty + 0.5) * TILE + DMath.sin(a) * 18);
          u.buried = !!(def.wake && def.wake.buried); u.lair = { x: (w.tx + 0.5) * TILE, y: (w.ty + 0.5) * TILE };
        }
      }
    }
  },
  // Everything buried life does. Staggered like every other per-unit scan in this file -- see AI.turn --
  // because a hundred creatures asking "is anyone near me" every frame is a hundred radius queries a
  // frame for something that only has to feel immediate.
  tickNeutrals() {
    const np = this.neutral; if (!np) return;
    for (const u of this.units) {
      if (!u.alive || u.owner !== np.id) continue;
      const wk = u.def.wake;
      if (u.buried) {
        if (!wk) { u.buried = false; continue; }
        if (u.waking) { if (this.frame >= u.waking) { u.buried = false; u.waking = 0; u.woke = this.frame; } continue; }
        if (((this.frame + u.id) & 7) !== 0) continue;
        if (this.wakeTrigger(u, wk)) u.waking = this.frame + (wk.delay || 24);
        continue;
      }
      if (!wk) continue;
      if (((this.frame + u.id) & 7) !== 0) continue;
      const lair = u.lair || { x: u.x, y: u.y };
      // Aggro, then leash. A creature defends a piece of ground; it does not pursue an army across the
      // map, because then it is a third faction rather than a hazard.
      let tgt = null, td = 1e9;
      for (const t of this.near(u.x, u.y, (wk.aggro || 8) * TILE)) {
        if (!t.alive || t.owner === np.id || t.inside || t.def.notUnit) continue;
        if (DMath.hypot(t.x - lair.x, t.y - lair.y) > (wk.leash || 12) * TILE) continue;
        const d = distPt(u.x, u.y, t.x, t.y); if (d < td) { td = d; tgt = t; }
      }
      if (tgt) {
        u.lastSaw = this.frame;
        if (u.hasWeapon() && (u.order.type !== 'attack' || u.order.target !== tgt)) u.applyOrder({ type: 'attack', target: tgt, auto: true });
      } else {
        // Nothing in reach: walk home, and once home and quiet for `rebury` frames, go back under.
        const home = DMath.hypot(u.x - lair.x, u.y - lair.y);
        if (home > 2 * TILE && u.canMove && u.order.type === 'idle') u.moveTo(lair.x, lair.y);
        if (wk.rebury && this.frame - (u.lastSaw || u.woke || 0) > wk.rebury && home <= 2 * TILE) { u.buried = true; u.waking = 0; }
      }
      // A warren that is awake starts producing. `dormant` means it does nothing until something wakes
      // it, which is what makes clearing a site early cheaper than clearing it late.
      const nest = u.def.nest;
      if (nest && u.isBuilding && u.done && !u.buried) {
        if (u.nestAt == null) u.nestAt = this.frame + nest.every;
        if (this.frame >= u.nestAt) {
          u.nestAt = this.frame + nest.every;
          const have = this.units.filter(q => q.alive && q.owner === np.id && q.def.id === nest.spawns && q.lair && q.lair.x === lair.x && q.lair.y === lair.y).length;
          for (let k = 0; k < nest.pack && have + k < nest.cap; k++) {
            const sp = this.freeSpotAround(u, false);
            const g = this.spawnUnit(nest.spawns, np.id, sp[0], sp[1]);
            g.buried = false; g.lair = { x: lair.x, y: lair.y };   // spat out mid-fight: awake, not buried
          }
        }
      }
    }
  },
  wakeTrigger(u, wk) {
    const by = wk.by || ['walk'], r = (wk.r || 6) * TILE;
    for (const t of this.near(u.x, u.y, r)) {
      if (!t.alive || t.owner === this.neutral.id || t.inside || t.def.notUnit) continue;
      if (by.includes('walk')) return true;
      if (by.includes('build') && (t.isBuilding || (t.order && t.order.type === 'construct'))) return true;
      if (by.includes('mine') && t.def.worker && t.order && t.order.type === 'gather') return true;
    }
    return false;
  },
  // Taking a derelict. Called by Abilities.repairTick the moment a repair of something you do not own
  // tops it out.
  captureDerelict(b, owner) {
    const g = b.def.derelict && b.def.derelict.grants; const p = this.players[owner];
    b.owner = owner; b.captured = true;             // `captured` is the only thing the draw pass can read
    b.hp = b.maxHp;
    if (b.def.psi) this.map.recomputePsi(owner, this.units);
    if (b.def.creep) this.map.recomputeCreep(this.units);
    if (g && g.upg) {
      // A free level of the race's own armour line, capped, and it stays if the archive is later lost:
      // `permanent` is the difference between this and the watchtower's vision, which is yours only
      // while you hold it.
      const key = g.upg[p.race];
      if (key) p.upg[key] = Math.min(g.cap || 3, p.upgLevel(key) + (g.levels || 1));   // p.upg, not p.upgrades: the latter is not a field and assigning it fails silently
    }
    this.recomputeSupply();
    if (p.human) p.msg(b.def.name + ' captured.', 'info');
  },

  // ==========================================================================
  // AUTOCAST -- M12 item 6.
  // ==========================================================================
  // An armed ability fires on its own. `u.armed` is a Set of ability ids on the UNIT, not on the def,
  // because arming is a decision the player makes about these medics and not about medics in general;
  // js/snapshot.js encodes a Set natively (`__set`), so it round-trips a save with no extra work.
  //
  // Each ability brings its own rule for when firing would be WASTED, and that is the whole design.
  // A generic "has enough energy" gate is not sufficient: a heal cast on a full-health unit spends
  // energy for nothing just as surely as casting with none does, and an ammo builder that ignores its
  // cap burns minerals into a queue that will be thrown away. So the rules live here, one per ability,
  // next to each other where they can be compared.
  //
  // Staggered by unit id like every other per-unit scan in this file: a hundred armed medics asking
  // "is anyone hurt near me" every frame is a hundred radius queries a frame for something that only
  // has to feel responsive.
  tickAutocast() {
    if ((this.frame & 7) !== 0) return;
    for (const u of this.units) {
      if (!u.alive || !u.armed || !u.armed.size || u.inside || u.disabled) continue;
      if (((this.frame >> 3) + u.id) % 3 !== 0) continue;
      for (const id of u.armed) {
        const ab = DATA.abilities[id]; if (!ab || !ab.autocast) continue;
        if (ab.energy && (u.energy || 0) < ab.energy) continue;
        if (id === 'build_scarab' || id === 'build_interceptor') {
          // ammo: only up to the cap, and only if nothing is already in the queue for it
          const p = this.players[u.owner];
          const isScarab = id === 'build_scarab';
          const cap = this.hangarCap(u, ab.unit);
          const have = (isScarab ? u.scarabs : u.interceptors) + u.prod.length;
          if (have >= cap) continue;
          const ud = DATA.units[ab.unit];
          if (!p.canAfford(ud.min, ud.gas)) continue;
          this.queueUnit(u, ab.unit);
          continue;
        }
        // the two support casts: find the nearest ally that the cast would actually help
        const r = (u.sight || 7) * TILE;
        let best = null, bd = 1e9;
        for (const t of this.near(u.x, u.y, r)) {
          if (t === u || !t.alive || t.inside || t.isBuilding || !this.allied(u.owner, t.owner)) continue;
          if (id === 'heal') { if (t.def.race !== 'T' || t.def.mech || t.hp >= t.maxHp) continue; }
          else if (id === 'restoration') { const f = t.fx; if (!f) continue; if (!(f.plague > 0 || f.blind > 0 || f.ensnare > 0 || f.lockdown > 0 || f.irradiate > 0 || f.maelstrom > 0 || t.acidSpores > 0)) continue; }
          const d = distPt(u.x, u.y, t.x, t.y); if (d < bd) { bd = d; best = t; }
        }
        if (best) { Abilities.issue(u, id, best, best.x, best.y, false); break; }   // one cast a pass
      }
    }
  },
  // Arm or disarm an ability on a set of units. Returns the state it settled on, so the caller can say
  // so; a mixed selection is armed rather than toggled per unit, because a toggle that leaves half the
  // group armed is a toggle nobody can reason about.
  setAutocast(units, id, on) {
    const ab = DATA.abilities[id]; if (!ab || !ab.autocast) return false;
    const want = on === undefined ? !units.every(u => u.armed && u.armed.has(id)) : !!on;
    for (const u of units) {
      if (!u.armed) u.armed = new Set();
      if (want) u.armed.add(id); else u.armed.delete(id);
    }
    return want;
  },
  // PINGS AND DRAWINGS -- M12 item 9.
  //
  // These go through the COMMAND SYSTEM rather than straight into a render list, which is the whole
  // point: a ping only your own client can see is a note to yourself. Routed through CMD it reaches
  // allies over the relay and it lands in the replay, so watching a game back shows you what people
  // were pointing at, which is most of what makes a replay readable.
  //
  // It writes to G.signals and to NOTHING ELSE. G.stateHash does not include signals and must not:
  // a cosmetic broadcast that could change the simulation would be a desync waiting to happen, and a
  // player spamming pings would be able to cause one. Signals are also not snapshotted -- a rejoining
  // client has no business seeing a ping from before it arrived.
  signals: [],
  signal(owner, kind, x, y, pts) {
    if (!this.signals) this.signals = [];
    if (this.signals.length > 64) this.signals.splice(0, this.signals.length - 64);   // a spam bound, not a design
    this.signals.push({ kind, x, y, pts: pts || null, owner, t: kind === 'draw' ? 150 : 96 });
    if (kind === 'ping' && this.allied(owner, this.human)) { this.lastAlertPos = { x, y, f: this.frame }; }   // read by UI's lastAlert key against its own record (REVIEW-M17)
    return true;
  },
  // ---------------- commands (validated) ----------------
  //
  // GATED BY DATA, NOT BY CONVENTION -- FIXLIST-M14 A4.
  //
  // The reported fault was "the Reactor gives no prerequisite error". It was true and the cause was
  // wider than the Reactor: an audit of every def and every command below found three separate holes,
  // and the third was the interesting one.
  //
  //   1. FIVE of the seven add-ons carried no `req` at all -- reactor, machine_shop, control_tower,
  //      physics_lab, covert_ops. `p.hasReq` passes trivially against an empty list, so nothing could
  //      ever be refused and nothing was ever said. The Reactor now requires the Academy (see its def).
  //      The other four are gated completely by their parent, which is now enforced below rather than
  //      assumed, so they need nothing else -- that is the audit's finding, not an omission.
  //
  //   2. FOUR refusal states said NOTHING AT ALL. Click Reactor on a Barracks that is still building,
  //      or already has an add-on, or is training a marine, or has lifted off, and the command was
  //      dropped in silence. That, far more than the missing `req`, is what a player experiences as
  //      "it gives no error". Every one of them now says which it is.
  //
  //   3. AND THE COMMANDS TRUSTED THE COMMAND CARD. Nothing here checked that the building being asked
  //      actually offers the thing being asked for -- only the UI knew, because the UI builds its
  //      buttons from `produces` / `addons` / `tech` / `upg` / `morphOptions`. Measured, before this
  //      change: a Barracks would accept a Physics Lab, a Machine Shop, Siege Tech and Vehicle
  //      Weapons, and a Factory would accept being turned into an Orbital Command -- all silently, all
  //      paid for, all real. A command log is not the UI; it is the sim's public interface, and every
  //      one of those was reachable from a replay, a rejoin or a modified client.
  //
  // The membership test reads the BUILDING'S OWN list rather than comparing against the tech table's
  // `bld` field, and that is deliberate and was measured: a Lair legitimately lists `burrow_tech`
  // whose own `bld` is `hatchery`, a Hive lists three more of the Lair's, and a Greater Spire lists
  // both of the Spire's upgrades. Comparing `td.bld === b.def.id` would have refused all seven and
  // broken Zerg tier inheritance.
  //
  // The AI was checked and needs no change: AI.research already selects its building by `td.bld` /
  // `ud.bld`, and AI.addon by `ad.parent`, so it never asked for any of this.
  // "a Machine Shop" but "an Orbital Command". One line, because the refusals above name a def and
  // every def name is player-facing text.
  anA(name) { return (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name; },
  queueUnit(b, uid) {
    const p = this.players[b.owner], ud = DATA.units[uid];
    if (!ud || !b.done || b.lifted) return false;
    if (!((b.def.produces || []).includes(uid) || (b.def.id === 'reaver' && uid === 'scarab') || (b.def.id === 'carrier' && uid === 'interceptor'))) { p.msg(b.def.name + ' does not train ' + ud.name + '.', 'error'); return false; }
    if (uid === 'scarab' || uid === 'interceptor') { const max = this.hangarCap(b, uid); const have = (uid === 'scarab' ? b.scarabs : b.interceptors) + b.prod.length; if (have >= max) return false; }
    if (b.prod.length >= MAX_QUEUE) return false;
    if (!p.hasReq(ud)) { p.msg('Requires ' + p.missingReq(ud), 'error'); return false; }
    if (uid === 'nuke' && b.hasNuke) return false;
    if (!p.canAfford(ud.min, ud.gas)) return false;
    if (this.supplyBlocked(p, ud)) { this.supplyRefused(p); return false; }
    p.minerals -= ud.min; p.gas -= ud.gas;
    b.prod.push({ kind: 'unit', id: uid, progress: 0, total: ud.time }); this.recomputeSupply(); return true;
  },
  larvaMorph(l, uid) {
    const p = this.players[l.owner], ud = DATA.units[uid];
    if (!l.alive || !l.def.larva) return false;
    // Only what a larva can become. Nothing here asked, so a hand-edited log or a modified client could
    // morph a larva into an SCV (measured: accepted, one Zerg-owned SCV). The FIXLIST-M14 A4 class:
    // gated by the data, not by the card. (REVIEW-M17)
    if (!ud || ud.from !== 'larva') return false;
    if (!p.hasReq(ud)) { p.msg('Requires ' + p.missingReq(ud), 'error'); return false; }
    if (!p.canAfford(ud.min, ud.gas)) return false;
    if (this.supplyBlocked(p, ud)) { this.supplyRefused(p); return false; }
    p.minerals -= ud.min; p.gas -= ud.gas;
    const h = l.hatch; if (h) { const i = h.larvae.indexOf(l); if (i >= 0) h.larvae.splice(i, 1); }
    l.hatch = null; l.rallyFrom = h; const ed = DATA.units.egg; l.def = ed; l.maxHp = ed.hp; l.hp = ed.hp; l.r = ed.r; l.prod = [{ kind: 'unit', id: uid, progress: 0, total: ud.time, reserved: true }];
    this.recomputeSupply(); return true;
  },
  queueUpgrade(b, uid) {
    const p = this.players[b.owner], ud = DATA.upgrades[uid]; if (!ud || !b.done || b.lifted || b.unpowered) return false;
    if (!(b.def.upg || []).includes(uid)) { p.msg(b.def.name + ' does not research ' + ud.name + '.', 'error'); return false; }
    const lvl = p.upgLevel(uid); if (lvl >= 3 || p.researching.has(uid)) return false;
    const rq = ud.req[lvl]; if (rq && !p.hasBuilding(rq)) { p.msg('Requires ' + DATA.buildings[rq].name, 'error'); return false; }
    if (b.prod.length >= MAX_QUEUE) return false; if (!p.canAfford(ud.min[lvl], ud.gas[lvl])) return false;
    p.minerals -= ud.min[lvl]; p.gas -= ud.gas[lvl]; p.researching.add(uid);
    b.prod.push({ kind: 'upg', id: uid, level: lvl + 1, progress: 0, total: ud.time[lvl] }); return true;
  },
  queueTech(b, tid) {
    const p = this.players[b.owner], td = DATA.techs[tid]; if (!td || !b.done || b.lifted || b.unpowered) return false;
    if (!(b.def.tech || []).includes(tid)) { p.msg(b.def.name + ' does not research ' + td.name + '.', 'error'); return false; }
    if (p.tech.has(tid) || p.researching.has(tid)) return false;
    if (td.req && !p.hasReq(td)) { p.msg('Requires ' + p.missingReq(td), 'error'); return false; }
    if (b.prod.length >= MAX_QUEUE) return false; if (!p.canAfford(td.min, td.gas)) return false;
    p.minerals -= td.min; p.gas -= td.gas; p.researching.add(tid);
    b.prod.push({ kind: 'tech', id: tid, progress: 0, total: td.time }); return true;
  },
  queueAddon(b, aid) {
    const p = this.players[b.owner], ad = DATA.buildings[aid]; if (!ad) return false;
    if (!(b.def.addons || []).includes(aid)) { p.msg(b.def.name + ' cannot build ' + this.anA(ad.name) + '.', 'error'); return false; }
    // The four that used to be dropped in silence. Order matters only in that each says the one true
    // thing about the state it is in, so a player never has to guess which of them stopped them.
    if (!b.done) { p.msg(b.def.name + ' is not finished.', 'error'); return false; }
    if (b.lifted) { p.msg('Land the ' + b.def.name + ' first.', 'error'); return false; }
    if (b.addon) { p.msg(b.def.name + ' already has an add-on.', 'error'); return false; }
    if (b.prod.length) { p.msg(b.def.name + ' is busy.', 'error'); return false; }
    if (!p.hasReq(ad)) { p.msg('Requires ' + p.missingReq(ad), 'error'); return false; }
    const tx = b.tx + b.def.w, ty = b.ty + b.def.h - 2;
    const err = this.map.canPlace(ad, tx, ty, p, this.units, null); if (err) { p.msg(err, 'error'); return false; }
    if (!p.canAfford(ad.min, ad.gas)) return false;
    p.minerals -= ad.min; p.gas -= ad.gas;
    const a = this.placeBuilding(ad, tx, ty, b.owner); a.parent = b; b.addon = a; return true;
  },
  queueMorph(b, toId) {
    const p = this.players[b.owner], nd = DATA.buildings[toId]; if (!nd) return false;
    if (!(b.def.morphTo === toId || (b.def.morphOptions || []).includes(toId))) { p.msg(this.anA(b.def.name).replace(/^a/, 'A').replace(/^an/, 'An') + ' cannot become ' + this.anA(nd.name) + '.', 'error'); return false; }
    if (!b.done || b.prod.length) return false;
    if (!p.hasReq(nd)) { p.msg('Requires ' + p.missingReq(nd), 'error'); return false; }
    if (!p.canAfford(nd.min, nd.gas)) return false;
    p.minerals -= nd.min; p.gas -= nd.gas;
    b.prod.push({ kind: 'morph', id: toId, progress: 0, total: nd.time }); return true;
  },
  cancelProd(b, i) {
    const it = b.prod[i]; if (!it) return; const p = this.players[b.owner];
    if (it.kind === 'unit') { const ud = DATA.units[it.id]; p.minerals += ud.min; p.gas += ud.gas; }
    else if (it.kind === 'upg') { const ud = DATA.upgrades[it.id]; p.minerals += ud.min[it.level - 1]; p.gas += ud.gas[it.level - 1]; p.researching.delete(it.id); }
    else if (it.kind === 'tech') { const td = DATA.techs[it.id]; p.minerals += td.min; p.gas += td.gas; p.researching.delete(it.id); }
    else if (it.kind === 'morph') { const nd = DATA.buildings[it.id]; p.minerals += Math.floor(nd.min * 0.75); p.gas += Math.floor(nd.gas * 0.75); }
    b.prod.splice(i, 1);
    if (b.def.egg) { // cancel egg -> larva back
      // ...if its hall can hold it. The bound is the hall's CEILING (larva_inject.cap, twelve), not the three
      // it spawns on its own: the two were the same number until REVIEW-M17 task 25, and with the old
      // literal an egg cancelled at an injected hall was refunded and then killed as soon as the hall held three.
      if (b.def.id === 'egg') { const ed = DATA.units.larva; b.def = ed; b.maxHp = ed.hp; b.hp = ed.hp; b.r = ed.r; b.hatch = b.rallyFrom; if (b.hatch && b.hatch.alive && b.hatch.larvae.length < DATA.abilities.larva_inject.cap) b.hatch.larvae.push(b); else this.kill(b, null, true); }
      else { const back = b.def.id === 'lurker_egg' ? 'hydralisk' : 'mutalisk'; const ud = DATA.units[back]; b.def = ud; b.maxHp = ud.hp; b.hp = ud.hp; b.r = ud.r; b.fly = !!ud.fly; }
    }
    this.recomputeSupply();
  },
  cancelBuilding(b) {
    // No refund. Committing four hundred minerals to a tech path should be a decision, not a menu
    // click you can take back -- every one of SC2, Beyond All Reason and Supreme Commander lets you
    // cancel almost anything and get most of it back, and it makes the build order weightless.
    //
    // Buildings only, deliberately. A cancelled UNIT still refunds (see cancelProd): a production queue
    // is a scheduling tool and punishing a misclick there is just tax. A building is a commitment of
    // ground as well as money, and that is the thing worth making irreversible.
    //
    // The Zerg drone still comes back, because the drone IS the building -- taking that would delete a
    // unit rather than decline a refund.
    if (b.done) return; const p = this.players[b.owner];
    if (b.def.race === 'Z' && !b.def.onGeyser && b.def.tier !== 'addon') this.spawnUnit('drone', b.owner, b.x, b.y + b.r);
    this.kill(b, null, true);
  },
  // A larva or an egg may carry its own rally, which overrides the hall's. The resolution half of this
  // already existed -- the producer's own rally wins and an egg falls back to b.rallyFrom.rally -- but
  // there was no way to SET one, because this guard only admitted buildings. A larva keeps the rally
  // through its morph for free: larvaMorph swaps the def on the same object, so the egg is the larva.
  // Two rallies per building, as StarCraft II has them: a worker rally and a unit rally, held at the
  // same time. A click on minerals, on a geyser, or on a refinery standing over one is a WORKER rally
  // (drawn yellow); anything else is the unit rally (green). That is the whole reason for two -- a
  // hatchery wants its drones mining and its zerglings at the ramp, and one rally cannot say both.
  // Larvae and eggs keep a single rally: each produces exactly one unit, so there is nothing to split.
  // Right-clicking the building itself clears both, which is the gesture SC2 uses and we had none for.
  setRally(b, x, y, target) {
    if (!(b.isBuilding && (b.def.produces.length || b.def.spawnsLarva)) && !b.def.larva && !b.def.egg) return;
    if (target === b) { b.rally = null; b.rallyW = null; return; }
    const res = target ? null : this.map.resourceAt(Math.floor(x / TILE), Math.floor(y / TILE));
    const gas = target && target.isBuilding && target.def.onGeyser && target.done ? target : null;
    const r = { x, y, target: gas ? null : (target && target.alive && target !== b ? target : null), res: res || null, gas: gas || null };
    if ((res || gas) && !b.def.larva && !b.def.egg) b.rallyW = r; else b.rally = r;
  },
  // Which of the two a freshly produced unit should follow. A worker prefers the worker rally and falls
  // back to the unit one, and everything else the other way round, so a building carrying only one
  // rally behaves exactly as it did before there were two.
  rallyFor(b, u) { return u.def.worker ? (b.rallyW || b.rally) : (b.rally || b.rallyW); },

  // Building auras -- the reader for the `aura` contract documented in js/data.js. Field hospitals mend
  // and jamming towers blind; walls have no aura at all.
  //
  // Three things the contract asks for that are easy to get wrong, so they are done explicitly here:
  // fields do NOT stack (the strongest covering field wins, rather than the sum), 'mend' never touches
  // buildings or revives anything, and the whole pass walks G.units in order so nothing depends on Set
  // or Map iteration -- the determinism tests would find it and the replay would not survive.
  //
  // Run every AURA_EVERY frames rather than every frame: it is O(buildings x units nearby) and a
  // per-second rate divided across a coarser tick is the same healing with a fraction of the work.
  tickAuras() {
    const every = 8;
    // The blind half has to be cleared every pass even when there are no towers, or a unit that walks
    // out of a field keeps its shortened sight for ever.
    if (this.frame % every) return;
    const sources = [];
    for (const b of this.units) {
      if (!b.alive || !b.isBuilding || !b.def.aura) continue;
      if (!b.done || b.lifted || b.unpowered) continue;      // the three gates a photon cannon fires under
      sources.push(b);
    }
    for (const u of this.units) { u.auraSight = 1; u.auraNoDet = false; }
    if (!sources.length) return;
    const dt = every / TPS;
    for (const u of this.units) {
      if (!u.alive || u.inside) continue;
      let mendHp = 0, mendSh = 0, sight = 1, noDet = false;
      for (const b of sources) {
        const a = b.def.aura;
        const cx = (b.tx + b.def.w / 2) * TILE, cy = (b.ty + b.def.h / 2) * TILE;
        if (distPt(u.x, u.y, cx, cy) > a.r * TILE) continue;
        const friendly = this.allied(b.owner, u.owner);
        if (a.affects === 'ally' ? !friendly : friendly) continue;
        if (a.kind === 'mend') {                              // strongest wins; they do not add
          if ((a.hp || 0) > mendHp) mendHp = a.hp || 0;
          if ((a.sh || 0) > mendSh) mendSh = a.sh || 0;
        } else if (a.kind === 'blind') {
          if (a.sight !== undefined && a.sight < sight) sight = a.sight;
          if (a.detect) noDet = true;
        }
      }
      if (sight < 1) u.auraSight = sight;
      if (noDet) u.auraNoDet = true;
      if (u.isBuilding) continue;                             // mend never repairs buildings
      if (mendHp && u.hp > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + mendHp * dt);
      if (mendSh && u.maxSh && u.sh < u.maxSh) u.sh = Math.min(u.maxSh, u.sh + mendSh * dt);
    }
  },
  // ================= the Terran per-frame pass (M12 wave four) =================
  // Three things in ONE walk of the units: the MULE's haul, the Medivac's heal autocast, the Reactor's second slot.
  // They were written in js/abilities.js and run from Abilities.tickFields because M12's three race branches edited
  // in parallel and the Terran one owned neither js/sim.js nor this file; the branches merged at M13, and the bodies
  // now live where that comment said they belonged -- Unit.muleHaul beside Unit.tickGather and Unit.reactorTick
  // beside Unit.tickProduction (js/sim.js) -- with the walk here, called from tick() at the same point of the frame
  // it always ran from: after every unit has ticked and the projectiles have landed, before the fields (REVIEW-M17
  // task 22, identity-checked: the eight-player banks did not move). THE POINT IN THE FRAME IS THE CONTRACT. Folding
  // the MULE into tickGather would debit the patch before the other workers on it have mined this frame; folding the
  // Medivac into Unit.tick's medic line would heal before this frame's projectiles land. Both change results, so
  // neither is done.
  //
  // COST. One property read and one branch per living unit per frame. The tick is dominated by unit separation at
  // ~0.9 ms of ~3 ms at 500 units; this is a flag test in the same order of magnitude as the reap filter that already
  // runs once a second. Nothing here allocates.
  //
  // DETERMINISM. The units in order, no G.rand, no wall clock, no Set or Map iteration.
  tickTerran() {
    for (const u of this.units) {
      if (!u.alive) continue;
      const d = u.def;
      if (d.mule) { u.muleHaul(); continue; }
      // The Medivac's heal autocast. js/sim.js runs this for `d.id === 'medic'` on the same (frame + id) % 8 stagger,
      // and the stagger matters for more than cost: M9 found that every `(G.frame + id) % N` gate in micro() was only
      // ever true for a fraction of the ids, so the residues are kept identical to the medic's rather than invented here.
      if (d.id === 'medivac' && u.done && !u.disabled && u.order.type !== 'ability' && (this.frame + u.id) % 8 === 0) Abilities.medicAuto(u);
      if (d.reactor && u.done && u.parent) u.parent.reactorTick();
    }
  },
  // Per-frame bookkeeping for the two M12 Zerg structures whose state js/sim.js has no way to notice. It ran from
  // Abilities.tickFields because that was the only per-frame hook the M12 Zerg branch owned, and a second one meant
  // a line in tick() below, which that branch could not touch; merged at M13, the line is there and the pass is here,
  // called right where tickFields used to reach it (REVIEW-M17 task 22). Staggered to one frame in twelve and it
  // reads two properties per unit, so it costs about forty property reads a frame amortised at 500 units.
  //
  // Two jobs:
  //   NYDUS -- the hub's `nydusLink` is the newest living mouth. js/sim.js's 'nydus' order reads one link per
  //   building, so a network of N worms is expressed as "every worm points home, the canal points at the newest".
  //   When that worm dies the canal has to fall back to the next newest, or the whole network silently stops
  //   working and nothing tells the player why.
  //   CRAWLERS -- an uprooted crawler still carries `def.creep`. GameMap.recomputeCreep skips it while it is
  //   `lifted`, but nothing calls recomputeCreep when it stands back up: landBuilding does not, and creepR has
  //   already reached def.creep so Unit.tickBuilding's growth step never fires again. Keyed on the tile it is
  //   standing on so the recompute happens once per move, not once per frame.
  tickZergNet() {
    if (this.frame % 12) return;
    let recreep = false;
    for (const u of this.units) {
      if (!u.alive || !u.isBuilding) continue;
      if (u.nydusNet) {
        if (u.nydusNet.some(w => !w.alive)) u.nydusNet = u.nydusNet.filter(w => w.alive);
        if (!u.nydusLink || !u.nydusLink.alive) u.nydusLink = u.nydusNet.length ? u.nydusNet[u.nydusNet.length - 1] : null;
      }
      if (u.def.crawler) { const key = u.lifted ? -1 : u.tx * 4096 + u.ty; if (u.creepKey !== key) { u.creepKey = key; recreep = true; } }
    }
    if (recreep) this.map.recomputeCreep(this.units);   // one recompute per pass however many crawlers moved
  },
  // ---------------- main tick ----------------
  tick() {
    if (this.over || this.paused) return;
    if (typeof Replay !== 'undefined') Replay.applyPending();
    this.inTick = true;
    this.frame++; this.pathBudget = PATH_BUDGET;
    if (this.map.wrecks.length) this.map.tickWrecks(this.frame);   // before rebuildGrid, so a cleared hulk is walkable this frame
    this.rebuildGrid();
    if (this.frame % 3 === 0) this.updateVision();
    if (this.neutral) this.tickNeutrals();
    this.tickAutocast();
    if (this.signals && this.signals.length) { for (let i = this.signals.length - 1; i >= 0; i--) if (--this.signals[i].t <= 0) this.signals.splice(i, 1); }
    for (const u of this.units) { if (u.alive) { u.px = u.x; u.py = u.y; } }
    // A unit that throws is skipped for the frame rather than taking the game down, and COUNTED: most
    // headless suites stub console.error to silence, which made an exception here invisible to the gate.
    // (REVIEW-M17)
    for (const u of this.units) { if (u.alive) { try { u.tick(); } catch (e) { this.tickErrors++; console.error(e, u.def.id); } } }
    this.separate();
    // self-heal: a ground unit whose centre tile ended up inside a building footprint is pushed out
    if (this.frame % 16 === 0) for (const u of this.units) {
      if (!u.alive || u.isBuilding || u.fly || u.inside || u.burrowed || u.def.larva) continue;
      // Check the unit's own extent, not just its centre tile: an Ultralisk (r 20) straddles a footprint
      // edge with its centre outside, so the centre-tile test never fired and it stayed wedged for good.
      const m = this.map, x0 = clamp(Math.floor((u.x - u.r * 0.7) / TILE), 0, m.w - 1), x1 = clamp(Math.floor((u.x + u.r * 0.7) / TILE), 0, m.w - 1);
      const y0 = clamp(Math.floor((u.y - u.r * 0.7) / TILE), 0, m.h - 1), y1 = clamp(Math.floor((u.y + u.r * 0.7) / TILE), 0, m.h - 1);
      let hit = null;
      for (let ty = y0; ty <= y1 && !hit; ty++) for (let tx = x0; tx <= x1; tx++) { const b = m.blocked[m.idx(tx, ty)]; if (b < 0) continue; const bb = this.byId.get(b); if (bb && bb.alive && bb.isBuilding && !bb.lifted) { hit = bb; break; } }
      if (hit) this.nudgeOut(u, hit);
    }
    Combat.tickProjectiles();
    // The M12 per-frame passes, in the order Abilities.tickFields ran them until REVIEW-M17 task 22 moved them here.
    this.tickTerran(); this.tickZergNet();
    Abilities.tickFields();
    this.map.tickHazard(this.frame, this.units);   // weather; inert unless the layout declares a hazard. Contract is documented above GameMap.hazardState.
    this.tickAuras();
    for (const p of this.players) if (p.ai && this.frame % 4 === p.id % 4) p.ai.tick();
    if (this.frame % 8 === 0) this.recomputeSupply();
    if (this.frame % 24 === 0) { this.units = this.units.filter(u => u.alive); this.checkVictory(); }
    if (this.frame % 24 === 12) this.tickAlerts();
    for (let i = this.effects.length - 1; i >= 0; i--) { if (--this.effects[i].t <= 0) this.effects.splice(i, 1); }
    if (this.mission && this.frame % 24 === 0) this.mission.tick();
    this.inTick = false;
  },
  // ---------------- alerts ----------------
  // The simulation knew all of these and told the player none of them. Every alert has to hold for a
  // few seconds before it fires and then goes quiet for a while, because an alert that cries wolf is
  // worse than no alert at all -- which is the whole of the acceptance test for this.
  // hold is in passes (one a second); cool is in frames.
  alert(p, key, on, text, kind, x, y) {
    const T = p.alertT || (p.alertT = {}), A = p.alertAt || (p.alertAt = {}), cfg = ALERTS[key];
    if (!on) { T[key] = 0; return false; }
    if ((T[key] = (T[key] || 0) + 1) < cfg.hold) return false;
    if (this.frame - (A[key] || -9999) < cfg.cool) return false;
    A[key] = this.frame; T[key] = 0;
    p.msg(text, kind || 'info');
    if (x !== undefined && typeof UI !== 'undefined' && p.id === this.human) UI.ping(x, y);
    return true;
  },
  // A click refused for supply has to say why -- otherwise the button just does nothing -- but it says
  // the same sentence the supply alert says, and it used to say it on Player.msg's own 72-frame de-dupe.
  // A player leaning on the hotkey while blocked therefore got it every three seconds: in an eight-minute
  // game, 41 of the 48 console lines, which buried the research line, both attack lines and all three
  // idle-production alerts in a console that holds six. One condition gets one voice, so the refusal
  // speaks through the alert's cooldown -- at once when the alert has not just spoken, and silently
  // otherwise. tickAlerts drives the AI in test/alerts.js and the AI never makes a refused click, which
  // is why this survived task 3.
  // At the 200 cap there is no depot, overlord or pylon that would help, and tickAlerts knows it -- its
  // `blocked` test is gated on supMax < SUPPLY_CAP. The refusal has to know it too, or a player at maximum
  // supply is told to build something that cannot exist, which is the one thing an alert must never do.
  // ONE SUPPLY TEST. Seven hand-copied ones disagreed (REVIEW-M17 task 6): only queueUnit honoured
  // notUnit, warpIn omitted pair, and the alert had neither -- so a nuke (sup 8, notUnit) queued at
  // the cap was accepted, never started, and reported as "supply blocked": measured thirty seconds at
  // 0/1800 under "Additional supply depots required." `need` overrides the def's cost for a unit morph,
  // which pays only the difference. The food cheat is a human's exemption, as at every site before.
  supplyBlocked(p, def, need) {
    if (need === undefined) need = def.notUnit ? 0 : (def.sup || 0) * (def.pair ? 2 : 1);
    if (need <= 0) return false;
    if (this.cheats.food && p.human) return false;
    return p.supUsed + need > p.supMax;
  },
  supplyRefused(p) {
    const A = p.alertAt || (p.alertAt = {});
    if (this.frame - (A.supply || -9999) < ALERTS.supply.cool) return false;
    A.supply = this.frame; (p.alertT || (p.alertT = {})).supply = 0;
    p.msg(p.supMax >= SUPPLY_CAP ? 'Maximum supply reached.' : RACE_INFO[p.race].supplyMsg, 'error');
    return true;
  },
  tickAlerts() {
    for (const p of this.players) {
      if (!p.human || p.defeated) continue;
      // "blocked" is not only sitting on the cap: a queued unit that needs two supply with one free is
      // stalled just as hard, and that is the case the production tick used to announce over and over.
      let stalled = false;
      if (p.supMax < SUPPLY_CAP && p.supUsed < p.supMax) for (const u of this.units) {
        if (!u.alive || u.owner !== p.id || !u.prod.length) continue;
        const it = u.prod[0]; if (it.kind !== 'unit' || it.started || it.reserved) continue;
        const ud = DATA.units[it.id]; if (ud && this.supplyBlocked(p, ud)) { stalled = true; break; }
      }
      const blocked = p.supMax < SUPPLY_CAP && (p.supUsed >= p.supMax || stalled);
      // 1. supply blocked. Checked first because it also explains away idle production: a barracks with
      //    the money but no supply room is not the player forgetting to click it.
      this.alert(p, 'supply', blocked, RACE_INFO[p.race].supplyMsg, 'error');
      // 2. production standing empty with the money to fill it
      let idle = null;
      if (!blocked) for (const u of this.units) {
        if (!u.alive || u.owner !== p.id || !u.isBuilding || !u.done || u.lifted) continue;
        if (u.def.spawnsLarva) { if (u.larvae.length && p.minerals >= 50) { idle = u; break; } continue; }
        if (!u.def.produces.length || u.prod.length) continue;
        for (const id of u.def.produces) {
          const d = DATA.units[id]; if (!d || !p.hasReq(d)) continue;
          if (p.minerals < d.min || p.gas < d.gas) continue;
          if (this.supplyBlocked(p, d)) continue;
          idle = u; break;
        }
        if (idle) break;
      }
      this.alert(p, 'idleProd', !!idle, 'Production facilities are idle.', 'info', idle && idle.x, idle && idle.y);
      // 3. a Carrier trying to fight with an empty hangar. Brood War leaves it inert and says nothing;
      //    the answer is still to build interceptors, but a human should at least be told.
      let empty = null;
      for (const u of this.units) {
        if (!u.alive || u.owner !== p.id || u.def.id !== 'carrier' || !u.done || u.prod.length) continue;
        if (u.interceptors > 0 || (u.launched && u.launched.some(i => i.alive))) continue;
        const fighting = u.order.type === 'attack' || (u.order.type === 'attackmove' && u.order.target) || (u.order.type === 'hold' && u.target);
        if (fighting) { empty = u; break; }
      }
      this.alert(p, 'carrier', !!empty, 'Carrier has no interceptors.', 'error', empty && empty.x, empty && empty.y);
      // 4. an outlying base being hit with nothing defending it
      let bare = null, held = null;
      for (const u of this.units) {
        if (!u.alive || u.owner !== p.id || !u.isBuilding || this.frame - u.lastHit > 48) continue;
        if (distPt(u.x, u.y, p.startX, p.startY) < 16 * TILE) continue;
        let guarded = false;
        for (const o of this.near(u.x, u.y, 10 * TILE)) {
          if (!o.alive || o.owner !== p.id) continue;
          if (o.isBuilding ? (o.done && (o.def.gw || o.def.aw)) : (!o.def.worker && o.hasWeapon())) { guarded = true; break; }
        }
        if (guarded) { if (!held) held = u; } else { bare = u; break; }
      }
      if (this.alert(p, 'expo', !!bare, 'Your expansion is undefended and under attack.', 'attack', bare && bare.x, bare && bare.y)) p.lastAttackAlert = this.frame;
      else if (held && this.frame - (p.lastAttackAlert || -9999) > 24 * 20) { p.lastAttackAlert = this.frame; p.msg('Your base is under attack.', 'attack'); if (typeof UI !== 'undefined' && p.id === this.human) UI.ping(held.x, held.y); }
    }
  },
  checkVictory() {
    for (const p of this.players) {
      if (p.defeated || p.neutral) continue;   // nobody wins by killing the wildlife, and nobody is told it died
      const hasB = this.units.some(u => u.alive && u.owner === p.id && u.isBuilding && !u.def.notUnit && u.def.tier !== 'addon');
      const hasU = this.units.some(u => u.alive && u.owner === p.id && !u.isBuilding && !u.def.notUnit && !u.def.larva);
      if (!hasB && (!hasU || this.frame > 24 * 60 * 3) && !(this.cheats.alive && p.human)) { p.defeated = true; p.alive = false; for (const u of this.units) if (u.alive && u.owner === p.id) this.kill(u, null, true); for (const q of this.players) if (q.human) q.msg(p.name + ' has been eliminated.'); }
    }
    if (this.freePlay) return; // player chose "continue playing" after the result screen
    // The neutral owner is excluded rather than merely never defeated. Left in, it is never defeated
    // -- it holds a derelict or a warren -- so it contributes team -1 forever and `teams.size <= 1` is
    // never reached: on a map with derelicts the game would simply never end, every single time.
    const alive = this.players.filter(p => !p.defeated && !p.neutral); const teams = new Set(alive.map(p => p.team));
    if (teams.size <= 1 && !(this.mission && !this.mission.done)) { this.over = true; this.winner = alive.length ? alive[0].id : -1; this.winTeam = alive.length ? alive[0].team : -1; }
  },
};
