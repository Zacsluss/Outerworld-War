'use strict';
// ============================================================================
// Simulation core: Game state, Player, Unit, orders, movement, combat,
// economy, production. Deterministic fixed-step at TPS.
// ============================================================================
const SIEGE_W = { dmg: 70, type: 'explosive', range: 12, minRange: 2, cd: 75, hits: 1, upgDmg: 5, upgKey: 'vehW', targets: 'ground', splash: [0.3, 0.8, 1.25], ff: true };
// "A Lair still counts as a Hatchery." Player.hasBuilding reads this, Player.hasReq through that, js/missions.js for
// objectives and test/techtree.js for the tree. `command_center` was an empty array until M12 gave it two morphs, and
// without them morphing your only Command Center makes hasBuilding('command_center') false, so a Barracks or an
// Engineering Bay can no longer be built -- a player who pressed the Orbital button silently lost half a tech tree.
// From M12 to M17 the two ids were pushed into this array at load from js/abilities.js, because that wave's three
// race branches edited in parallel and the Terran one did not own this file; the branches merged at M13, so the
// entry lives where the table is (REVIEW-M17 task 22). test/terran12.js section 11 pins it.
// ...and creep_colony, which AI.scriptHave had in its own copy of this table and this table did not (SCAN-M18
// B10). A Sunken and a Spore are what a Creep Colony grew into, exactly as a Hive is what a Hatchery grew
// into, so the row belongs here; measured before adding it, nothing in DATA or in any mission requires a
// creep_colony, so the only reader whose answer changes is the one that already believed it.
const EQUIV = { hatchery: ['lair', 'hive'], lair: ['hive'], spire: ['greater_spire'], creep_colony: ['sunken_colony', 'spore_colony'], command_center: ['orbital_command', 'planetary_fortress'], nexus: [] };
// A body wider than this needs a path with CLEARANCE rather than one found for a point -- see the
// comment on Pathfinder.find (FIXLIST-M14 C6). Half a tile: a unit standing dead centre in a tile
// pokes (r - 16) px into its neighbour, so 16 is exactly the radius at which that stops being zero.
// Three defs are over it today: Thor and Ultralisk at 20, Reaver at 18.
const WIDE_BODY = TILE / 2;
// How long a unit pressed into a crowd keeps treating the crowd as MOVING after anyone in it last got closer to where
// they were going, in frames. While it does, the no-progress watchdog in Unit.moveTo does not count: the unit is
// waiting its turn, not grinding into something it can never pass. See G.separate, which passes the news along.
const FLOW_HOLD = 48;
// MINE_TIME and GAS_TIME are the frames a worker spends INSIDE a patch or a geyser; the walk each way is
// the rest of the cycle and comes from the map. Measured on a saturated line (see .claude/review/mine-rate.js
// and mine-sweep.js): at 75 a worker banked 100 minerals a minute -- x2.4 StarCraft II and x1.15 Brood War.
// At 190 it banks 50, which is x1.21 SC2 and x0.57 BW: the user's call, an economy at SC2's pace rather than
// Brood War's. Gas moved by the same 2.53x so the gas-to-mineral RATIO is untouched; scaling only minerals
// would have doubled every player's gas per mineral and made the whole tech tree cheap.
// Every build timing, every AI script step and every balance number in HANDOFF.md is downstream of these two.
const MINE_TIME = 190, GAS_TIME = 94, LARVA_TIME = 342, MAX_QUEUE = 5;
// LARVA_NATURAL: how many larvae a hatchery, lair or hive spawns up to ON ITS OWN, one per LARVA_TIME.
// Spawn Larva stacks past it to DATA.abilities.larva_inject.cap (twelve; REVIEW-M17 task 25), so the two
// numbers are different things now and every reader names the one it means. Stamped (BUILD.TUNING).
const LARVA_NATURAL = 3;
const WORKER_HAUL = 8, GAS_DEPLETED = 2;   // a trip's minerals or gas, and a depleted geyser's; MULE_HAUL below sits on top of the eight (REVIEW-M17: four literals before)
// How much a MULE takes out of a patch ON TOP of the eight a worker takes, on the same trip, and
// carries home with it. Three times a worker's haul on a round trip that is also faster, which is
// roughly four SCVs for seventy-five seconds.
//
// IT COMES OUT OF THE PATCH. That is the whole design of the thing under M11's attrition economy: a
// MULE is not free minerals, it is minerals borrowed from the end of the game, and a base that has had
// MULEs dropped on it all match runs dry visibly sooner. The alternative -- crediting the player
// without debiting the field -- would have been three characters shorter and would have quietly made
// the one economy mechanic in the game the one thing that does not obey it.
const MULE_HAUL = 16;   // read by Unit.muleHaul; declared in js/abilities.js until REVIEW-M17 task 22
const MODE_TRANS = 40;
// unit id -> the tech that gives it +50 max energy (each such tech carries `energy: '<unit>'` in js/data.js)
const ENERGY_TECH = (() => { const m = {}; for (const [id, t] of Object.entries(DATA.techs)) if (t.energy) m[t.energy] = id; return m; })();                     // frames a mode change locks a unit: siege and unsiege, the Viking transform, an abducted tank's forced unsiege (three literals before)
const MINERS_PER_PATCH = 2;   // Brood War saturates a mineral patch at two workers, not one
// Creep does not appear, it spreads. A source starts with a small pad and reaches its full radius
// over about a minute, which is roughly the Brood War rate. Growth is only ever read through
// Math.floor, so the map is recomputed nine times over a building's life rather than every frame.
const CREEP_SEED = 2, CREEP_GROW = 9 / (24 * 60);
// turn rate (rad/frame) for ground units that must rotate before moving; acceleration (px/frame^2) for flyers
// Orders that require actually relocating: a burrowed unit given one of these digs itself out first.
// Deliberately excludes hold, attack and ability, so a burrowed Lurker keeps firing from where it is.
const BURROW_SURFACES = new Set(['move', 'attackmove', 'patrol', 'follow', 'load', 'pickup', 'gather', 'return', 'build', 'construct', 'repair', 'land', 'nydus', 'merge']);
const TURN = { vulture: 0.22, siege_tank: 0.12, goliath: 0.28, dragoon: 0.25, reaver: 0.15, ultralisk: 0.2, archon: 0.3, dark_archon: 0.3, lurker: 0.3, hydralisk: 0.4, defiler: 0.35 };
const ACCEL = { wraith: 0.35, scout: 0.35, corsair: 0.5, mutalisk: 0.6, scourge: 0.9, queen: 0.5, guardian: 0.15, devourer: 0.3, overlord: 0.05, battlecruiser: 0.06, carrier: 0.1, arbiter: 0.2, valkyrie: 0.35, dropship: 0.3, shuttle: 0.3, observer: 0.3, science_vessel: 0.25, interceptor: 1.5, cocoon: 0.1 };
const dist = (a, b) => DMath.hypot(a.x - b.x, a.y - b.y);
const distPt = (x1, y1, x2, y2) => DMath.hypot(x1 - x2, y1 - y2);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

class Player {
  constructor(id, race, human, name) {
    this.id = id; this.race = race; this.human = human; this.name = name;
    this.minerals = 50; this.gas = 0; this.supUsed = 0; this.supMax = 0;
    this.upg = {}; this.tech = new Set(); this.researching = new Set();
    this.color = PLAYER_COLORS[id]; this.alive = true; this.defeated = false;
    this.vis = null; this.msgs = []; this.lastAlert = {}; this.nukes = 0;
    this.stats = { unitsKilled: 0, unitsLost: 0, buildingsKilled: 0, buildingsLost: 0, mined: 0, gassed: 0 };
  }
  // A COLOUR CHOSEN IN THE LOBBY (tenth session, item 2). The rule is GameMap.assignStarts' own, for the same reasons: a
  // chosen colour in range that nobody else chose is kept; an Auto seat keeps the colour its seat always had, i % count, while
  // that is free, and otherwise takes the first free one. Pure and seed-free, so the lobby draws with it exactly what G.init
  // paints, and a game where nobody chooses is painted as every game was. No two players share one, as in StarCraft II's
  // melee lobby (Age of Empires II's shared colour means shared control, which this game does not have).
  static assignColors(players, count) {
    const n = Math.max(0, count | 0), list = Array.isArray(players) ? players : [];
    const out = list.map(() => -1), taken = new Array(n).fill(false);
    list.forEach((po, i) => { const c = po ? po.color : null; if (Number.isInteger(c) && c >= 0 && c < n && !taken[c]) { out[i] = c; taken[c] = true; } });
    list.forEach((po, i) => { if (out[i] >= 0 || !n) return; let c = i % n; if (taken[c]) { const free = taken.indexOf(false); if (free >= 0) c = free; } out[i] = c; taken[c] = true; });
    return out;
  }
  upgLevel(k) { return k ? (this.upg[k] || 0) : 0; }
  hasTech(t) { return this.tech.has(t); }
  msg(text, kind = 'info') { if (!this.human) return; const last = this.lastAlert[text] || -9999; if (G.frame - last < 72) return; this.lastAlert[text] = G.frame; this.msgs.push({ text, t: G.frame, kind }); if (this.msgs.length > 6) this.msgs.shift();
    // THE SPEAKER IS LOCAL, THE RECORD IS NOT. `human` means "a human player", which in a network game is
    // every human -- and the simulation is identical on every client, so each client used to play and speak
    // the OTHER player's supply alerts too (the user heard their opponent's "spawn more overlords", and the
    // opponent heard theirs). The text is still recorded on the player it is about: the console draws from
    // G.players[G.human].msgs, a rejoiner needs its own history, and thirteen suites read it. G.alert's
    // minimap ping was already gated this way; these two calls were the ones that were not.
    if (this.id !== G.human) return;
    if (typeof Sound !== 'undefined') Sound.alert(kind); if (typeof Voice !== 'undefined' && (kind === 'attack' || kind === 'nuke' || text.endsWith('complete.') || text === RACE_INFO[this.race].supplyMsg || text.startsWith('Mission') || text.startsWith('Nuclear'))) Voice.announce(text); }
  canAfford(min, gas, quiet) { if (this.minerals < min) { if (!quiet) this.msg('Not enough minerals.', 'error'); return false; } if (this.gas < gas) { if (!quiet) this.msg('Not enough vespene gas.', 'error'); return false; } return true; }
  hasBuilding(id) {
    for (const u of G.units) { if (u.alive && u.owner === this.id && u.isBuilding && u.done && (u.def.id === id || (EQUIV[id] || []).includes(u.def.id))) return true; }
    return false;
  }
  hasReq(def) { if (!def.req || (G.cheats.noreq && this.human)) return true; for (const r of def.req) { if (DATA.techs[r]) { if (!this.tech.has(r)) return false; } else if (!this.hasBuilding(r)) return false; } return true; }
  missingReq(def) { if (!def.req) return null; for (const r of def.req) { if (DATA.techs[r]) { if (!this.tech.has(r)) return DATA.techs[r].name; } else if (!this.hasBuilding(r)) return DATA.buildings[r].name; } return null; }
}

let UNIT_ID = 1;
const setUnitId = n => { UNIT_ID = n; }; // snapshots restore the id counter so ids stay stable across a seek
class Unit {
  constructor(defId, owner, x, y) {
    const def = DATA.all[defId];
    this.id = UNIT_ID++; this.def = def; this.owner = owner; this.x = x; this.y = y; this.px = x; this.py = y;
    this.r = def.r || 12; this.isBuilding = !!def.isBuilding; this.alive = true;
    this.maxHp = def.hp; this.hp = def.hp; this.maxSh = def.sh || 0; this.sh = this.maxSh;
    this._maxE = def.energy || 0; this.energy = def.energy ? 50 : 0;   // maxEnergy is an accessor over _maxE; see it below
    this.facing = G.rand() * Math.PI * 2; this.fly = !!def.fly; this.done = !this.isBuilding;
    this.order = { type: 'idle' }; this.queue = []; this.path = null; this.pathI = 0; this.stuck = 0; this.repathT = 0;
    this.progF = -FLOW_HOLD; this.flowF = -FLOW_HOLD;   // the last frame this unit, and the crowd it is pressed into, got closer to a goal (FLOW_HOLD)
    this.cooldown = 0; this.cargo = []; this.inside = null; this.carrying = null; this.lastRes = null; this.heldOrder = false;
    this.prod = []; this.rally = null; this.addon = null; this.parent = null; this.sieged = false; this.transT = 0;
    // Frames until a dug-in weapon is live. Only a def with `dig` ever sets it (the Widow Mine); it is
    // zero for everything else, so `digT > 0` is false and weaponFor is unaffected. A mine that spawns
    // already burrowed starts unarmed, which is the same rule as one that burrows by hand.
    this.digT = (def.dig && def.burrowed) ? def.dig.burrow + def.dig.arm : 0;
    this.cloaked = !!def.cloaked; this.burrowed = !!def.burrowed; this.stim = 0; this.fx = {}; this.kills = 0; this.detBy = {};
    this.lifetime = def.lifetime || 0; this.mines = def.mines || 0; this.scarabs = def.scarabs || 0; this.interceptors = def.interceptors || 0;
    this.creepR = 0;
    // `home`: the hall a computer player's Queen is kept at (AI.homeQueens, REVIEW-M17 task 26); null for
    // every other unit. A Unit reference, which the snapshot tags by id exactly as it does `hatch`.
    this.larvae = []; this.larvaT = LARVA_TIME; this.hatch = null; this.home = null; this.morphT = 0; this.progress = 0; this.builder = null; this.lifted = false;
    this.lastHit = -9999; this.lastHitBy = null; this.arbCloak = -9999; this.halluc = false; this.idleT = 0; this.acidSpores = 0;
    this.auraSight = 1; this.auraNoDet = false;   // recomputed each pass by G.tickAuras; see the aura contract in js/data.js
    this.waitT = 0; this.moving = false; this.vx = 0; this.vy = 0; this.spawnT = G.frame; this.cloakT = 0; this.unpowered = false;
    if (this.isBuilding) { this.tx = Math.round(x / TILE - def.w / 2); this.ty = Math.round(y / TILE - def.h / 2); this.x = (this.tx + def.w / 2) * TILE; this.y = (this.ty + def.h / 2) * TILE; this.px = this.x; this.py = this.y; this.r = Math.max(def.w, def.h) * TILE / 2; }
  }
  get player() { return G.players[this.owner]; }
  get name() { return this.def.name; }
  // MAX ENERGY: the def's pool, +50 once the player owns the tech that names this unit -- Caduceus
  // Reactor, Khaydarin Amulet, Gamete Meiosis and eight more, see ENERGY_TECH. Those eleven techs were
  // bought by the AI and by players and did nothing at all: `maxEnergy = def.energy` was the only writer
  // and nothing read a tech's `energy` key. Stored as _maxE with a setter, so a building morph (G.morph
  // assigns maxEnergy) and a snapshot written before this accessor existed still land. (REVIEW-M17, q9)
  get maxEnergy() { const b = this._maxE; if (!b) return 0; const t = ENERGY_TECH[this.def.id]; return t && this.player.hasTech(t) ? b + 50 : b; }
  set maxEnergy(v) { this._maxE = v; }
  get speed() {
    let s = this.def.speed || 0; const p = this.player, d = this.def;
    if (this.def.speedTech && p.hasTech(this.def.speedTech[0])) s = this.def.speedTech[1];
    if (this.stim > 0) s *= 1.5; if (this.fx.ensnare > 0) s *= 0.5;
    if (this.fx.suppress > 0) s *= 0.45;   // pinned by sustained fire; see DATA.techs suppress_*
    if (this.lifted) s = 1;
    // Flying is slower in the dark -- the air half of M11 idea 19. Ground units are exempt: night makes
    // seeing harder, not walking. See NIGHT_AIR in js/game.js.
    if (this.fly && !this.isBuilding) { const dl = G.daylight; if (dl < 1) s *= NIGHT_AIR + (1 - NIGHT_AIR) * dl; }
    // Churned ground is slower to cross -- craters, rubble and a stripped mineral line all read as the
    // same broken footing. Ground only: a wraith does not care what the floor looks like. See the
    // CRATERS block in js/map.js.
    if (!this.fly && !this.isBuilding && G.map.scar) { const c = G.map.scarAt(this.x, this.y); if (c > 0) s *= 1 - CHURN_SLOW * c; }
    // CREEP. FIXLIST-M15 C3 (item 5, second half) -- the swarm moves faster over its own ground, and
    // before this there was no creep bonus anywhere in the simulation: 23 cases measured, every one
    // of them 1.00 on creep and off it.
    //
    // LAST, so it multiplies whatever the lines above settled on -- including `if (this.lifted) s = 1`,
    // which is a hard override and is the only way an uprooted crawler can get its 150%. Ordering
    // against the churn penalty is arithmetically irrelevant (both are factors) but reads correctly:
    // broken footing and friendly ground are two independent things about the tile you are on.
    //
    // FOUR GATES, and each one is an exception the entry names. Zerg only; not flying, so the
    // Overlord, Mutalisk, Queen and the rest of the air get nothing; not burrowed; and the tile under
    // you has to actually be creep. `s > 0` keeps an egg at zero rather than multiplying nothing.
    //
    // THE CREEP TEST IS THE ONE THE GAME ALREADY HAS. GameMap.hasCreep is what building placement and
    // the Nydus worm ask, it reads the same `creep` grid js/snapshot.js captures and G.tick rebuilds,
    // and it is two array reads. A second creep test would be a second answer to drift from.
    if (s > 0 && d.race === 'Z' && !this.fly && !this.burrowed) {
      const cs = DATA.creepSpeed, k = cs[d.id];
      const mult = k !== undefined ? k : cs._;
      if (mult !== 1 && G.map.hasCreep(Math.floor(this.x / TILE), Math.floor(this.y / TILE))) s *= mult;
    }
    return s;
  }
  get sight() { let s = this.def.sight || 7; const p = this.player; if (this.def.sightTech && p.hasTech(this.def.sightTech[0])) s = this.def.sightTech[1]; if (this.fx.blind > 0) s = 2; if (this.isBuilding && !this.done) s = 4;
    // A jamming field shortens sight while the unit stands in it. Clamped at one tile, per the aura
    // contract in js/data.js: short-sighted, never blind.
    if (this.auraSight > 0 && this.auraSight < 1) s = Math.max(1, s * this.auraSight);
    // ...and so does the dark. A detector pays NIGHT_DET of the penalty rather than all of it: a detector
    // is a sensor more than an eye, but exempting it outright made it the only thing that could see.
    const d = G.daylight;
    if (d < 1) { const k = NIGHT_SIGHT + (1 - NIGHT_SIGHT) * d; s = Math.max(2, s * (this.def.det ? 1 - (1 - k) * NIGHT_DET : k)); }
    // High ground sees further. Unlike range and damage this needs no target -- it is a property of
    // where you are standing, so it reads the downhill row directly. Flyers are exempt: they are
    // already at height 2 for vision and the map would answer about the ground beneath them.
    if (!this.fly && G.map.tierAt && G.map.heightAt(this.x, this.y) === 1) s *= G.map.heightBonusTable()[2].sight;
    return s; }
  get armor() { let a = this.def.armor || 0; const p = this.player; if (this.def.upgA) a += p.upgLevel(this.def.upgA); if (this.def.armorTech && p.hasTech(this.def.armorTech[0])) a += this.def.armorTech[1]; a -= this.acidSpores; if (this.vet >= 2) a += 1; return Math.max(0, a); }
  get isCloaked() { return this.cloaked || this.burrowed || (G.frame - this.arbCloak < 12); }
  get isDetector() { return this.def.det && this.done && !this.lifted && !(this.fx.blind > 0) && !this.auraNoDet; }
  get canMove() { return !this.isBuilding || this.lifted; }
  get disabled() { return this.fx.lockdown > 0 || this.fx.stasis > 0 || this.fx.maelstrom > 0 || this.morphT > 0 || this.unpowered; }
  get idle() { return this.order.type === 'idle'; }
  tile() { return [Math.floor(this.x / TILE), Math.floor(this.y / TILE)]; }
  heightLevel() { return this.fly ? 2 : G.map.heightAtPx(this.x, this.y); }

  // ---------------- weapons ----------------
  weaponFor(t) {
    const d = this.def;
    // THE TRANSITION IS CHECKED FIRST, and that order is the whole point. Siege Mode sets `sieged` and
    // `transT = MODE_TRANS` in the same statement, so with the sieged line first it shadowed the lockout
    // going IN: the tank fired on frame 3 of its own 40-frame deployment (SCAN-M18 A2.13, measured -- 37
    // frames still on the clock, 143 damage already done). Going out was always right, because standing
    // up clears `sieged` and only the lockout is left to match -- which is why half a bug this size can
    // sit in two adjacent lines and look symmetrical. Both halves now cost the same 40 frames.
    if (d.id === 'siege_tank' && this.transT > 0) return null;
    if (d.id === 'siege_tank' && this.sieged) return t.fly ? null : SIEGE_W;
    if (d.gw && d.gw.burrowOnly && !this.burrowed) return null;
    // Still digging in, or dug in and not yet armed. One chokepoint for the whole game: everything that
    // fires goes through weaponFor, so a mine mid-arm is invisible to the targeting pass, to Combat and
    // to the AI's "does this thing have a gun" question alike. See the `dig` block in js/data.js.
    if (d.dig && this.digT > 0) return null;
    if (t.fly) { if (d.aw) return d.aw; if (d.gw && d.gw.targets === 'both') return d.gw; return null; }
    if (d.gw && d.gw.targets !== 'air') return d.gw;
    return null;
  }
  hasWeapon() { return !!(this.def.gw || this.def.aw) && !this.def.worker; }
  wRange(w) { let r = w.range; const p = this.player; if (w.rangeTech && p.hasTech(w.rangeTech[0])) r = w.rangeTech[1]; if (this.inside && this.inside.def.bunker) r += 1; return r; }
  // Veterancy. Derived from kills rather than stored, which is the whole reason it costs nothing: kills
  // is already a field, already snapshotted and already deterministic, so ranks survive a save, a rejoin
  // and a replay seek without another line of code anywhere.
  //   rank 1 at 2 kills, 2 at 5, 3 at 10.
  // Does this unit's own production line have suppressing fire? Read off the tech table rather than a
  // list of unit ids, so a new tech with { suppress: true } on a new building needs no code here.
  // NOT CACHED PER PLAYER, on purpose (REVIEW-M17 task 22): the walk over p.tech cost 4.6 ms across the 5,270
  // damage() calls of the eight-player game, nothing against its 66 s of ticks -- and a cache would have to be
  // invalidated by every path that changes p.tech, which includes tests that clear() and delete() from it and the
  // snapshot decoder that replaces the Set. A cache that misses one of those is a desync, not a slowdown.
  get suppresses() {
    if (!this.def.gw && !this.def.aw) return false;
    const p = this.player; if (!p || !p.tech.size) return false;
    for (const id of p.tech) { const t = DATA.techs[id]; if (t && t.suppress && t.suppress.includes(this.def.id)) return true; }
    return false;
  }
  get vet() { const k = this.kills || 0; return k >= 10 ? 3 : k >= 5 ? 2 : k >= 2 ? 1 : 0; }
  // ...and scarring is the other half. A unit that has been hurt never gets its full health back, so
  // maxHp drifts down over a unit's life and def.hp stays the original. No new field for that either:
  // the gap between them IS the scar. Floored at 40% so a veteran does not become paper.
  get scarred() { return this.def.hp - this.maxHp; }
  wDmg(w) { let d = w.dmg + this.player.upgLevel(w.upgKey) * (w.upgDmg || 1); if (w.dmgTech && this.player.hasTech(w.dmgTech[0])) d += w.dmgTech[1]; return Math.round(d * (1 + 0.08 * this.vet)); }
  wCd(w) { let c = w.cd; if (w.cdTech && this.player.hasTech(w.cdTech[0])) c = w.cdTech[1]; if (this.stim > 0) c = Math.ceil(c / 2); c += this.acidSpores * 3; return c; }
  // wRange against a SPECIFIC target, which is the only way the height bonus can be applied: it is a
  // property of the pair, not of the weapon. wRange itself stays target-free because js/hud.js and
  // js/ui.js both print it, and a tooltip whose range changed with whatever you were hovering over
  // would be worse than no number at all. Flyers are skipped on both ends -- the map will cheerfully
  // report the ground under a wraith. See the vertical-layers block in js/map.js.
  wRangeAt(w, t) {
    let r = this.wRange(w);
    if (!this.fly && t && !t.fly) r *= G.map.heightBonus(this.x, this.y, t.x, t.y).range;
    return r;
  }
  maxRange() { let m = 0; for (const w of [this.def.gw, this.def.aw]) if (w) m = Math.max(m, this.wRange(w)); if (this.def.id === 'siege_tank' && this.sieged) m = SIEGE_W.range; return m; }

  // ---------------- orders ----------------
  setOrder(o, shift) {
    if (this.isBuilding && !this.lifted && o.type !== 'idle' && o.type !== 'rally' && o.type !== 'land') return;
    // A worker that was TOLD to do something other than gather stays told. Without this it walks back to
    // the hall the instant it arrives, because tickIdle returns any idle worker that happens to be
    // carrying -- so "move this drone off the minerals" became "move this drone off the minerals and
    // then put it back". Brood War does not do that. setOrder is the player-and-AI path; applyOrder,
    // which the gather cycle itself uses, clears the flag again below.
    if (this.def.worker) this.heldOrder = true;
    if (shift && this.order.type !== 'idle') { if (this.queue.length < 8) this.queue.push(o); return; }
    this.queue = []; this.applyOrder(o);
  }
  applyOrder(o) {
    // Back on the gather cycle -- by the player's hand or by the cycle's own bookkeeping -- so the hold
    // above is spent and an interrupted worker may carry its load home again.
    if (this.def.worker && (o.type === 'gather' || o.type === 'return')) this.heldOrder = false;
    if (this.order.type === 'gather' && this.order.target && this.order.target.miner === this) this.order.target.miner = null;
    if (this.order.type === 'construct' && this.order.target && this.order.target.builder === this) this.order.target.builder = null;
    // A UNIT ORDERED OUT OF A GAS BUILDING LEAVES IT. tick() returns early for anything `inside` that is not
    // mid-gather, and nothing here cleared `inside`, so a worker re-ordered while inside an extractor never
    // ticked again and stayed the building's `occupant` -- alive, order 'gather' -- so no other worker
    // could enter: the geyser was dead for the rest of the game. Measured in test/eightplayer.js's game:
    // AI.economy's gas rebalancing pulled a drone at 291 s and sent it straight back at 292 s, and both of
    // that Zerg's extractors sat at 4,200 and 4,520 gas from minute five to the end with three drones each.
    // It comes out where the gather cycle puts a worker that has finished, empty-handed; the exit path
    // below in tickGather clears `inside` before it calls applyOrder, so that path is untouched. Bunkers and
    // transports are not gas buildings and are not touched either: their cargo is unloaded, not ordered.
    if (this.inside && this.inside.def.onGeyser && !(o.type === 'gather' && o.phase === 'inside')) { const g = this.inside; if (g.occupant === this) g.occupant = null; this.inside = null; this.x = g.x; this.y = g.y + g.r + this.r; this.px = this.x; this.py = this.y; }
    this.order = o; this.path = null; this.pathI = 0; this.stuck = 0; this.waitT = 0;
    if (o.type === 'patrol') { o.ox = this.x; o.oy = this.y; }
    if (o.type === 'attackmove' || o.type === 'move' || o.type === 'patrol') o.hx = o.x, o.hy = o.y;
  }
  nextOrder() { if (this.queue.length) this.applyOrder(this.queue.shift()); else this.applyOrder({ type: 'idle' }); }
  stop() { this.queue = []; this.applyOrder({ type: 'idle' }); }

  // ---------------- per-tick ----------------
  tick() {
    const d = this.def, p = this.player;
    if (this.lifetime) { if (--this.lifetime <= 0) { G.kill(this, null, true); return; } }
    // regen
    if (this.maxSh && this.sh < this.maxSh) this.sh = Math.min(this.maxSh, this.sh + 0.045);
    if (this.maxEnergy && this.energy < this.maxEnergy && !(this.fx.stasis > 0)) this.energy = Math.min(this.maxEnergy, this.energy + 0.03125);
    if (G.cheats.energy && p.human && this.maxEnergy) this.energy = this.maxEnergy;
    if (d.race === 'Z' && this.hp < this.maxHp && !(this.isBuilding && !this.done)) this.hp = Math.min(this.maxHp, this.hp + 0.025);
    if (this.stim > 0) this.stim--;
    if (this.cooldown > 0) this.cooldown--;
    if (this.transT > 0) this.transT--;
    if (this.digT > 0) this.digT--;   // a Widow Mine digging in and arming; see Abilities.digTimes
    if (this.morphT > 0) { this.morphT--; return; }
    // status effects
    const fx = this.fx;
    for (const k of ['lockdown', 'stasis', 'ensnare', 'maelstrom', 'blind', 'irradiate', 'plague', 'dweb', 'suppress']) if (fx[k] > 0) fx[k]--;
    if (fx.matrix && --fx.matrix.t <= 0) fx.matrix = null;
    if (fx.irradiate > 0 && d.bio && !this.isBuilding) { G.damageRaw(this, 250 / 720, null); for (const o of G.near(this.x, this.y, 48)) if (o !== this && o.def.bio && !o.isBuilding && !o.fly === !this.fly) G.damageRaw(o, 250 / 720, null); }
    if (fx.plague > 0) { if (this.hp > 1) this.hp = Math.max(1, this.hp - 300 / 600); }
    if (fx.stasis > 0) return;
    if (fx.lockdown > 0 || fx.maelstrom > 0) return;
    if (this.cloaked && !d.permaCloak && this.maxEnergy) { this.energy -= 0.15; if (this.energy <= 0) { this.energy = 0; this.cloaked = false; } }
    if (d.cloakField && this.done) { if ((G.frame & 7) === 0) for (const o of G.near(this.x, this.y, d.cloakField * TILE)) if (o.owner === this.owner && !o.isBuilding && !o.def.cloakField && o.alive) o.arbCloak = G.frame; }
    if (this.isBuilding) { this.tickBuilding(); return; }
    if (this.inside && !(this.order.type === 'gather' && this.order.phase === 'inside')) return;
    if (d.larva) { this.tickLarva(); return; }
    if (d.egg) { this.tickProduction(); return; }
    if (this.prod.length) this.tickProduction();
    this.tickOrder();
    if (d.id === 'medic' && this.order.type !== 'ability' && (G.frame + this.id) % 8 === 0) Abilities.medicAuto(this);
    // The launch cooldown ticks whether or not anything is out. It used to tick only inside the
    // launched.length guard below, so if the only Interceptor out died within its eight frames the list
    // emptied, the cooldown froze at 7, and the Carrier never launched again -- bricked for the game
    // with ammo aboard. Measured: one launch, then none in 400 frames of attack orders. (REVIEW-M17)
    if (d.id === 'carrier' && this.launchCd > 0) this.launchCd--;
    if (d.id === 'carrier' && this.launched && this.launched.length) { const fighting = this.order.type === 'attack' || (this.order.type === 'attackmove' && this.order.target) || this.order.type === 'hold' && this.target; if (!fighting && (G.frame + this.id) % 24 === 0) for (const ic of this.launched) if (ic.alive && ic.order.type === 'intercept') ic.applyOrder({ type: 'dock' }); this.launched = this.launched.filter(ic => ic.alive); }
  }

  // ---------------- buildings ----------------
  tickBuilding() {
    const d = this.def, p = this.player;
    if (!this.done) {
      // construction
      let adv = false;
      if (d.race === 'T' && !d.tier.startsWith('addon')) { const b = this.builder; adv = !!(b && b.alive && b.order.type === 'construct' && b.order.target === this && distPt(b.x, b.y, clamp(b.x, this.tx * TILE, (this.tx + d.w) * TILE), clamp(b.y, this.ty * TILE, (this.ty + d.h) * TILE)) <= b.r + 16); }
      else adv = true;
      if (adv) {
        this.progress += (G.cheats.cwal && p.human) ? 10 : 1;
        const tot = d.time; this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.9 / tot);
        if (this.maxSh) this.sh = Math.min(this.maxSh, this.sh + this.maxSh / tot);
        if (this.progress >= tot) G.completeBuilding(this);
      }
      return;
    }
    if (d.race === 'T' && this.hp < this.maxHp / 3) { this.hp -= 0.03; if ((G.frame + this.id) % 10 === 0) G.effects.push({ kind: 'fire', x: this.x + (G.rand() - .5) * d.w * TILE * 0.6, y: this.y + (G.rand() - .5) * d.h * TILE * 0.5, t: 14 }); if (this.hp <= 0) { G.kill(this, null); return; } }
    if (this.lifted) { this.tickOrder(); return; }
    if (d.race === 'P' && d.needsPsi) { const cx = this.tx + Math.floor(d.w / 2), cy = this.ty + Math.floor(d.h / 2); this.unpowered = !(G.map.hasPsi(this.owner, cx, cy) || G.map.hasPsi(this.owner, cx - 1, cy)); if (this.unpowered) return; }
    // spread creep outward until this source reaches its full radius
    if (d.creep && this.done && this.creepR < d.creep) {
      const was = Math.floor(this.creepR);
      this.creepR = Math.min(d.creep, this.creepR + CREEP_GROW);
      if (Math.floor(this.creepR) !== was) G.map.recomputeCreep(G.units);
    }
    if (d.spawnsLarva) { if (this.larvae.length < LARVA_NATURAL) { if (--this.larvaT <= 0) { this.larvaT = LARVA_TIME; G.spawnLarva(this); } } else this.larvaT = LARVA_TIME; }
    if (this.addon && !this.addon.alive) this.addon = null;
    if (this.addon && !this.addon.done) return; // building addon
    this.tickProduction();
    if (this.order.type === 'land') this.tickOrder();
    // defensive weapons
    if ((d.gw || d.aw) && !(this.fx.dweb > 0)) this.tickCombatBuilding();
    // The cooldown is NOT decremented here. Unit.tick already decremented it before its `inside` return,
    // so bunkered infantry fired at double rate: a Marine's shots came 7.5 frames apart inside a bunker
    // against 15 outside (measured). Halving that is a balance consequence, decided in REVIEW-M17 (q7).
    if (d.bunker) { for (const c of this.cargo) { c.x = this.x; c.y = this.y; this.acquireFor(c); } }
    if (d.battery && this.energy >= 1) Abilities.batteryAuto(this);
  }
  tickCombatBuilding() {
    if (!this.target || !this.target.alive || !G.targetable(this, this.target) || !this.inRange(this.target)) this.target = this.findTarget(this.maxRange() * TILE, true);
    if (this.target && this.cooldown <= 0) this.fireAt(this.target);
  }
  acquireFor(c) { // bunker cargo unit attack
    if (!c.target || !c.target.alive || !G.targetable(c, c.target) || !c.inRange(c.target)) c.target = c.findTarget((c.maxRange() + 1) * TILE, true);
    if (c.target && c.cooldown <= 0) c.fireAt(c.target);
  }
  tickProduction() {
    if (!this.prod.length) return;
    const it = this.prod[0]; const d = this.def;
    if (it.kind === 'unit' && !d.egg && !it.started) { if (!it.reserved && G.supplyOver(this.player)) return; /* G.tickAlerts says this once on its own cooldown, rather than every 72 frames until a depot goes up */ it.started = true; }
    it.progress += (G.cheats.cwal && this.player.human) ? 10 : 1;
    if (it.progress >= it.total) { this.prod.shift(); G.finishProduction(this, it); }
  }

  // ---------------- larva ----------------
  // The Reactor: a second unit built in parallel with the first. tickProduction above only ever advances `prod[0]`;
  // this advances `prod[1]` under exactly the same rules -- the same supply gate, the same `it.started` latch, the
  // same cwal cheat multiplier, the same finishProduction on completion. It was written in js/abilities.js and run from
  // Abilities.tickFields because M12's Terran branch did not own this file; merged at M13, it sits beside the function
  // it mirrors (REVIEW-M17 task 22) and is still called from the same point of the frame, G.tickTerran -- after every
  // unit has ticked -- not from tickProduction itself, which would advance the second slot before the first.
  // BOTH SLOTS MUST BE UNITS. A Barracks can research Suppressing Fire, and a reactor that let a marine slide out
  // from behind a research would make the add-on a research-cancel button as well as a throughput bonus.
  reactorTick() {
    if (!this.alive || !this.done || this.lifted || this.prod.length < 2) return;
    if (this.prod[0].kind !== 'unit' || this.prod[1].kind !== 'unit') return;
    const it = this.prod[1], p = this.player, ud = DATA.units[it.id];
    if (!it.started) {
      if (!it.reserved && G.supplyOver(p)) return;   // the reactor's second item, gated exactly as the first (G.supplyOver)
      it.started = true;
    }
    it.progress += (G.cheats.cwal && p.human) ? 10 : 1;
    if (it.progress >= it.total) { this.prod.splice(1, 1); G.finishProduction(this, it); }
  }
  tickLarva() {
    if (!this.hatch || !this.hatch.alive) { G.kill(this, null, true); return; }
    if ((G.frame + this.id) % 60 === 0) { const a = G.rand() * Math.PI * 2; this.wx = this.hatch.x + DMath.cos(a) * 60; this.wy = this.hatch.y + (this.hatch.def.h / 2) * TILE + 14 + G.rand() * 18; }
    if (this.wx !== undefined) { const dx = this.wx - this.x, dy = this.wy - this.y, dd = DMath.hypot(dx, dy); if (dd > 2) { this.x += dx / dd * 0.3; this.y += dy / dd * 0.3; } }
  }

  // Come up, out of turn. Three orders force it -- one that means "go somewhere", a hold with nothing
  // in range, and an attack whose target walked out -- and all three used to write `transT = 20` by
  // hand. A def with its own dig timings (the Widow Mine, FIXLIST-M14 A3) spends its unburrow duration
  // instead, so that number is stated once in js/data.js rather than three times here. Callers keep
  // their own `path = null`, because one of the three deliberately does not clear it.
  surface() { const t = Abilities.digTimes(this); this.burrowed = false; this.transT = t ? t.unburrow : 20; }
  // ---------------- unit order state machine ----------------
  tickOrder() {
    const o = this.order, d = this.def;
    this.moving = false;
    // Surface for anything that means "go somewhere". moveTo refuses to move a burrowed unit, so an order
    // missing from this list can never complete and the unit sits on it forever (load was the one that bit).
    if (this.burrowed && !d.mine && BURROW_SURFACES.has(o.type)) { this.surface(); this.path = null; }
    if (this.sieged && (o.type === 'move' || o.type === 'attackmove' || o.type === 'patrol')) { /* sieged tanks can't move; ignore */ this.nextOrder(); return; }
    if (d.mine) { Abilities.mineTick(this); return; }
    switch (o.type) {
      case 'idle': this.tickIdle(); break;
      // Hold Position never checked its weapon cooldown, so a unit holding with a target in range fired
      // every frame -- 24 shots a second where a siege tank is allowed one every 75 frames. It reads as
      // a siege bug because siege mode is the only thing that puts a unit on hold and leaves it there
      // (Abilities.instant sets order = hold when it sieges), and a tank's shot is 70 with splash. It
      // was never siege-specific: every race's units did it on H.
      case 'hold': { const t = this.autoTarget(true); if (t && this.cooldown <= 0) this.fireAt(t); break; }
      case 'move': if (this.moveTo(o.x, o.y, o.target)) this.nextOrder(); break;
      case 'follow': if (!o.target.alive) { this.nextOrder(); break; } if (dist(this, o.target) > this.r + o.target.r + 24) { this.moveTo(o.target.x, o.target.y, o.target); if (this.moveFailed) this.nextOrder(); } break;
      case 'attackmove': {
        if (!o.target || !o.target.alive || !G.targetable(this, o.target)) o.target = this.autoTarget(false);
        // FIRING ON THE MOVE (FIXLIST-M14 C4) is its own branch rather than engage plus a nudge, and
        // that is not tidiness -- the first version called engage() AND moveTo() in the same frame, so
        // one repath aimed at the target and the other at the destination and the unit jittered on the
        // spot: 277 moving frames out of 330 and six pixels of net progress.
        //
        // One path, and it goes where the player pointed. A weapon that does not halt never walks
        // TOWARDS what it is shooting during an attack-move; it walks where it was sent and shoots
        // whatever comes into range on the way, which is what "fires while moving" means for the only
        // order that has somewhere to be. Everything else still resolves into stand-here-and-fight.
        //
        // AND IT MUST NOT TURN TO FACE WHAT IT SHOOTS, which is the second thing that went wrong and
        // the more interesting one. `facing` is not decoration in this engine: moveTo turns it toward
        // the next waypoint at a limited rate and then MOVES ALONG IT. Pointing it at the target each
        // frame therefore steers the unit at the target -- the Cyclone crept BACKWARDS down the lane,
        // 13.4 tiles of advance undone to 6.8, and then its movement watchdog gave up and dropped the
        // order. A unit that shoots without stopping keeps facing where it is going; the gun turns, the
        // chassis does not, and nothing in fireAt asks which way it was pointed.
        if (o.target && this.firesOnMove(o.target)) {
          if (this.inRange(o.target) && this.cooldown <= 0) this.fireAt(o.target);
          if (this.moveTo(o.x, o.y)) this.nextOrder();
        }
        else if (o.target) { this.engage(o.target); }
        else if (this.moveTo(o.x, o.y)) this.nextOrder();
        break;
      }
      case 'patrol': {
        if (!o.target || !o.target.alive || !G.targetable(this, o.target)) o.target = this.autoTarget(false);
        if (o.target) this.engage(o.target); else if (this.moveTo(o.x, o.y)) { if (this.moveFailed) { this.nextOrder(); break; } const t = o.x, u = o.y; o.x = o.ox; o.y = o.oy; o.ox = t; o.oy = u; this.path = null; }
        break;
      }
      case 'attack': {
        if (!o.target || !o.target.alive || (o.target.inside) || (!G.targetable(this, o.target) && !o.target.isBuilding)) { this.nextOrder(); break; }
        if (!this.weaponFor(o.target)) { if (this.hasWeapon() || d.worker) { if (dist(this, o.target) > 48) this.moveTo(o.target.x, o.target.y, o.target); else this.nextOrder(); } else this.nextOrder(); break; }
        // an immobile attacker (sieged tank, burrowed lurker) whose target is out of range keeps shooting whatever is in range
        if ((this.sieged || (this.burrowed && !d.mine)) && !this.inRange(o.target)) {
          // ...on its weapon's cooldown, like every other way of firing. This is the one path that
          // called fireAt directly instead of going through engage(), which is where the `cooldown <= 0`
          // test lives, so a sieged tank re-acquiring a new target fired every frame: 75 shots in the
          // time it is allowed one. Reported from play as "one tank, 81 kills in seconds", and it is
          // reachable whenever a held tank is given an attack order (the AI does it, and so does a
          // right-click) whose target then dies or walks out of range. Being shot at alone does not do
          // it: G.onHit retaliates only for an idle unit, and a held tank stays on hold.
          const t = this.autoTarget(true); if (t) { if (this.cooldown <= 0) this.fireAt(t); break; }
          // Nothing in range. A Lurker's weapon is burrowOnly so staying down is the whole point, but any
          // other burrowed unit cannot shoot at all and was just sitting on the order forever: surface.
          if (this.burrowed && !d.mine && !((d.gw && d.gw.burrowOnly) || (d.aw && d.aw.burrowOnly))) { this.surface(); this.path = null; }
          break;
        }
        this.engage(o.target); if (this.moveFailed) this.nextOrder(); break;
      }
      case 'gather': this.tickGather(); break;
      case 'return': this.tickReturn(); break;
      case 'build': this.tickBuild(); break;
      case 'construct': { const b = o.target; if (!b || !b.alive || b.done) { this.nextOrder(); break; } if (b.builder && b.builder !== this && b.builder.alive && b.builder.order.target === b) { this.nextOrder(); break; } b.builder = this; if (this.moveToRect(b, 4)) { if (this.moveFailed) { if (b.builder === this) b.builder = null; this.nextOrder(); break; } this.facing = DMath.atan2(b.y - this.y, b.x - this.x); } break; }
      case 'repair': Abilities.repairTick(this); break;
      case 'ability': Abilities.orderTick(this); break;
      case 'load': { const t = o.target; if (!t || !t.alive || t.owner !== this.owner || this.fly || t.inside) { this.nextOrder(); break; }
        const near = t.isBuilding ? this.moveToRect(t, 8) : (dist(this, t) < this.r + t.r + 12 || this.moveTo(t.x, t.y, t)); if (near && (this.moveFailed || !G.loadUnit(t, this))) this.nextOrder(); break; }
      case 'pickup': { const t = o.target; if (!t || !t.alive || t.inside) { this.nextOrder(); break; } if (dist(this, t) < this.r + t.r + 12) { G.loadUnit(this, t); this.nextOrder(); } else this.moveTo(t.x, t.y, t); break; }
      case 'unload': { if (this.moveTo(o.x, o.y)) { if (this.cargo.length) { if ((G.frame & 7) === 0 && !G.unloadOne(this)) { this.player.msg('Cannot unload here.', 'error'); this.nextOrder(); } } else this.nextOrder(); } break; }
      // A ferry route. M11 wave three, item 4: a transport that runs itself.
      //
      // ONE point, not two. The near end is wherever the transport is standing when you set it, and
      // the click is the far end -- so it is "park the shuttle at your base, click the drop site", one
      // click through the existing pending system, rather than a two-stage mode nothing else in the UI
      // has. The route is a loop and never calls nextOrder: it runs until you give the transport
      // something else to do, which is what "runs itself" has to mean.
      //
      // It only ever picks up IDLE units. Loading anything standing nearby would hijack a worker on its
      // way to a patch, and a shuttle that steals your economy is worse than no shuttle.
      case 'ferry': {
        const cap = G.cargoCap(this);
        if (!cap) { this.nextOrder(); break; }
        const tx = o.leg === 'b' ? o.bx : o.ax, ty = o.leg === 'b' ? o.by : o.ay;
        if (!this.moveTo(tx, ty)) break;                       // still on the way
        if (o.leg === 'b') {
          // Far end: put everything down, then go back for more. An unload that cannot find room does
          // not strand the cargo -- it turns around and tries again next lap.
          if (this.cargo.length) { if ((G.frame & 7) === 0 && !G.unloadOne(this)) { o.leg = 'a'; o.since = null; } }
          else { o.leg = 'a'; o.since = null; }
        } else {
          if (o.since == null) o.since = G.frame;
          if ((G.frame & 3) === 0) {
            for (const t of G.near(this.x, this.y, FERRY_PICKUP * TILE)) {
              if (t === this || !t.alive || t.inside || t.fly || t.isBuilding) continue;
              if (t.owner !== this.owner || t.def.notUnit || t.def.larva || t.def.egg) continue;
              if (!t.idle) continue;
              if (!G.loadUnit(this, t)) break;                 // full, or it will not fit
            }
          }
          const full = G.cargoUsed(this) >= cap;
          if (full || (this.cargo.length && G.frame - o.since >= FERRY_WAIT)) { o.leg = 'b'; o.since = null; }
        }
        break; }
      case 'merge': { const t = o.partner; if (!t || !t.alive || t.order.type !== 'merge' || t.order.partner !== this) { this.nextOrder(); break; } if (dist(this, t) < 28) { if (this.id < t.id) G.mergeUnits(this, t, o.unit); } else this.moveTo(t.x, t.y, t); break; }
      // A walk that gave up is not an arrival. moveTo returns true in three ways that are not one -- the
      // ten-second watchdog, a path that ended short, a unit wedged within 140 px -- and this case landed
      // the building at the ordered tile from wherever it stood: measured 499 px (sixteen tiles) in the
      // eight-player game, and straight through a sealed ring of colonies in the pin. The order drops
      // like every other failed walk, and a building only roots within a tile of where it is standing.
      // (REVIEW-M17 task 29.)
      case 'land': { const cx = (o.tx + d.w / 2) * TILE, cy = (o.ty + d.h / 2) * TILE; if (this.moveTo(cx, cy)) { if (this.moveFailed || distPt(this.x, this.y, cx, cy) > TILE) { this.nextOrder(); break; } G.landBuilding(this, o.tx, o.ty); } break; }
      case 'nydus': { const c = o.target; if (!c || !c.alive || !c.nydusLink || !c.nydusLink.alive || !c.nydusLink.done || this.fly) { this.nextOrder(); break; } if (this.moveToRect(c, 6)) { const e = c.nydusLink; const t = G.map.findFreeTile(e.tx + 1, e.ty + e.def.h + 1, 6); if (t) { this.x = (t[0] + .5) * TILE; this.y = (t[1] + .5) * TILE; this.px = this.x; this.py = this.y; this.path = null; G.effects.push({ kind: 'ring', x: this.x, y: this.y, r: 16, t: 10, color: '#c8f' }); } this.nextOrder(); } break; }
      case 'intercept': { Abilities.interceptTick(this); break; }
      case 'dock': { Abilities.dockTick(this); break; }
      case 'scarab': { Abilities.scarabTick(this); break; }
      default: this.nextOrder();
    }
  }
  tickIdle() {
    const d = this.def;
    if (this.def.worker) { if (this.carrying && !this.heldOrder && (G.frame + this.id) % 24 === 0) { this.applyOrder({ type: 'return' }); } return; }
    if (this.hasWeapon() && !this.def.notUnit && (G.frame + this.id) % 6 === 0) { const t = this.autoTarget(false); if (t) { this.applyOrder({ type: 'attack', target: t, auto: true, ox: this.x, oy: this.y }); } }
  }
  autoTarget(holdOnly) {
    if (!this.hasWeapon()) return null;
    if (this.def.gw && this.def.gw.burrowOnly && !this.burrowed) return null;
    const range = holdOnly ? this.maxRange() * TILE : Math.max(this.maxRange() + 1, 5) * TILE;
    return this.findTarget(range, holdOnly);
  }
  // auto-acquisition never picks larvae or eggs (explicit attack orders still can)
  findTarget(rangePx, strict) {
    let best = null, bs = 1e9;
    for (const t of G.near(this.x, this.y, rangePx + 40)) {
      if (t === this || !t.alive || t.inside || G.allied(this.owner, t.owner) || t.def.larva || t.def.egg) continue;
      // A derelict is not auto-acquired. It is owned by nobody, so without this every army that walked
      // past one shot it down on its own -- and demolishing the map's only Sentinel foundry is a
      // decision the player should have to make, not one their marines make for them on the way to a
      // fight. Explicitly ordering an attack still works, which is how you deny one. Wildlife is NOT
      // exempt: a creature that has surfaced and is coming at you must be shot back at.
      if (t.def.derelict && G.neutral && t.owner === G.neutral.id) continue;
      if (!G.targetable(this, t)) continue;
      const w = this.weaponFor(t); if (!w) continue;
      const dd = dist(this, t) - t.r - this.r; if (dd > rangePx) continue;
      if (strict && !this.inRange(t)) continue;
      if (w.minRange && dd < w.minRange * TILE) continue;
      let s = dd;
      if (t.isBuilding) s += 400 + (t.hasWeapon() ? -300 : 0);
      else if (!t.hasWeapon() && !t.def.worker) s += 160; if (t.def.worker) s += 60;
      if (t.halluc) s += 50;
      // What is shooting at ME comes first. Scoring purely by distance means a unit will walk past the
      // thing killing it to shoot whatever happens to be a few pixels nearer, which is the single most
      // complained-about behaviour in this genre. Two signals, because they catch different cases: a
      // target whose ORDER is aimed at me covers the moment before its first shot lands, and lastHitBy
      // covers everything after -- including attackers whose order has since moved on.
      if (t.order && t.order.target === this) s -= 260;
      else if (this.lastHitBy === t && G.frame - this.lastHit < 48) s -= 200;
      // Then: prefer something I am actually good against. A concussive weapon picking the large unit
      // beside the small one is throwing three quarters of its damage away, and distance alone could
      // never see that.
      const mult = (DMG_MULT[w.type] || DMG_MULT.normal)[t.def.size || 'medium'];
      s -= (mult - 0.75) * 200;
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }
  inRange(t) { const w = this.weaponFor(t); if (!w) return false; const dd = dist(this, t) - t.r - this.r; if (w.minRange && dd < w.minRange * TILE) return false; return dd <= this.wRangeAt(w, t) * TILE + 2; }
  // Can this unit shoot what it is pointed at WITHOUT stopping? Asked of the weapon it would use
  // against THIS target, because a unit can carry two and only one of them need be an on-the-move gun.
  // The immobility tests are here rather than at the call sites so nothing can forget one.
  firesOnMove(t) { const w = this.weaponFor(t); return !!(w && w.onMove) && this.canMove && !this.sieged && !this.burrowed && !this.inside; }
  engage(t) {
    const w = this.weaponFor(t);
    if (!w) { this.moveTo(t.x, t.y, t); return; }
    const dd = dist(this, t) - t.r - this.r;
    if (dd <= this.wRangeAt(w, t) * TILE) {
      if (w.minRange && dd < w.minRange * TILE) { if (this.canMove && !this.sieged) this.moveTo(this.x + (this.x - t.x), this.y + (this.y - t.y)); return; }
      this.facing = DMath.atan2(t.y - this.y, t.x - this.x);
      this.plantF = G.frame;   // standing in range and fighting: G.separate does not let an arriving ally shove it out of reach
      if (this.cooldown <= 0) this.fireAt(t);
      // THE HALT, and the one weapon that is exempt from it. Clearing the path is what makes every unit
      // in this game stand still the moment something walks into range -- it is the engine's default and
      // it is why a Goliath plants itself. A weapon flagged `onMove` (FIXLIST-M14 C4, the Cyclone) keeps
      // its carrier's path, so the shot costs it no ground. A flag on the WEAPON and not on the unit, so
      // the next thing that needs it is one field rather than another branch here.
      if (!w.onMove) this.path = null;
    } else if (this.canMove && !this.sieged && !(this.burrowed && !this.def.mine)) {
      if (this.burrowed) { this.surface(); return; }
      this.moveTo(t.x, t.y, t);
    }
  }
  fireAt(t) {
    const w = this.weaponFor(t); if (!w) return;
    if (this.fx.dweb > 0 && !this.fly) return;
    this.cooldown = this.wCd(w) + Math.floor(G.rand() * 3) - 1; this.facing = DMath.atan2(t.y - this.y, t.x - this.x); this.lastFire = G.frame;
    if (this.def.worker && !this.isBuilding) this.cooldown = 22;
    Combat.fire(this, t, w);
  }

  // ---------------- movement ----------------
  moveTo(x, y, targetUnit) {
    if (!this.canMove || this.speed <= 0 || this.transT > 0 && this.def.id === 'siege_tank') return distPt(this.x, this.y, x, y) < 8;
    // A sieged tank does not walk either. applyOrder refuses move/attackmove/patrol for one, but follow,
    // load, gather, repair, construct and the rest reached here and walked it, siege and all (measured:
    // 275 px on a follow order; a right-click on a friendly unit is the everyday trigger). Refusing here
    // the way burrow does lets every caller drop the order through the existing moveFailed paths.
    // (REVIEW-M17)
    if ((this.burrowed && !this.def.mine) || this.sieged) { this.moveFailed = true; return false; }
    const m = G.map; const spd = this.speed;
    this.moveFailed = false; // set when we return true without actually arriving, so callers can drop the order
    const dd = distPt(this.x, this.y, x, y);
    this.goalD = dd;   // G.separate: of two units of one owner both on the move, the one nearer its goal has right of way
    const arriveR = targetUnit ? Math.max(6, this.r + targetUnit.r - 4) : Math.max(4, spd);
    if (dd <= arriveR) { this.noProgT = 0; return true; }
    if (this.stuck > 40 && dd < 140) { this.stuck = 0; return true; }
    // Movement watchdog. A* returns a best-effort path, so an unreachable goal never fails - the unit just
    // grinds into the obstacle with an order that can never complete. Sliding along a wall still counts as
    // progress to u.stuck, so that does not catch it either. Ten seconds without getting any closer means
    // give up and let the caller drop the order. A goal that moves (a follow target) restarts the clock.
    if (!this.progG || distPt(this.progG[0], this.progG[1], x, y) > 2 * TILE) { this.progG = [x, y]; this.bestDD = dd; this.noProgT = 0; this.progF = G.frame; }
    // Sixteen pixels, not four. The watchdog resets whenever the unit gets closer to its goal, and four
    // pixels is inside the noise: a unit being shoved about by its neighbours drifts a few pixels toward
    // the goal often enough to keep resetting the clock, so it never gives up. That is what made
    // full-strength separation break test/wrongthing.js -- units rallied somewhere unreachable ground
    // against the wall forever because the jostling read as progress. Sixteen was chosen as larger than any
    // single separation push when contact distances ran 12 to 31; units keep their BODIES apart now (G.separate)
    // and a push between two big ones can be larger, but a crowd that has already met jostles by a few pixels,
    // not by a push from a standing start -- test/wrongthing.js, which is this case for all three races, holds.
    // It is still far below what real movement covers in the ten seconds the watchdog allows.
    else if (dd < this.bestDD - 16) { this.bestDD = dd; this.noProgT = 0; this.progF = G.frame; }
    // WAITING IS NOT GRINDING (seventh session, item 1). Once units kept their bodies apart, a jam could take longer
    // than the ten seconds this allows: the last of twelve zealots through a one-tile gap jostled at the mouth for 240
    // frames, gave up, and was left behind while the jam it was waiting in cleared. So the clock stops while the unit
    // is pressed into a crowd that is still getting somewhere (flowF, passed along contact by contact in G.separate).
    // A crowd grinding at something unreachable gets nowhere, its news goes stale after FLOW_HOLD, and every unit in
    // it gives up as before -- test/wrongthing.js is that case.
    else if (!(G.frame - this.flowF < FLOW_HOLD) && ++this.noProgT > 240) { this.noProgT = 0; this.stuck = 0; this.moveFailed = true; return true; }
    let gx = x, gy = y;
    if (!this.fly) {
      const [sx, sy] = this.tile(); const tx = clamp(Math.floor(x / TILE), 0, m.w - 1), ty = clamp(Math.floor(y / TILE), 0, m.h - 1);
      if (!this.path || this.pathGoal[0] !== tx || this.pathGoal[1] !== ty || this.repathT <= 0) {
        if (G.pathBudget > 0 || !this.path) { G.pathBudget--; this.path = G.pf.find(sx, sy, tx, ty, 5000, this.r > WIDE_BODY); this.pathI = 0; this.pathGoal = [tx, ty]; this.repathT = 90 + (this.id % 30); }
      } else this.repathT--;
      // advance along path
      while (this.path && this.pathI < this.path.length) { const wp = this.path[this.pathI]; const wx = (wp[0] + 0.5) * TILE, wy = (wp[1] + 0.5) * TILE; if (distPt(this.x, this.y, wx, wy) < Math.max(6, spd + 2)) this.pathI++; else break; }
      if (this.path && this.pathI < this.path.length) { const wp = this.path[this.pathI]; gx = (wp[0] + 0.5) * TILE; gy = (wp[1] + 0.5) * TILE; }
      // A PATH THAT RUNS OUT BESIDE A BUILDING HAS NOT FAILED (tenth session). A building's centre is inside its own footprint,
      // so the path to it ends on a free tile next to it -- and this line called that "unreachable" whenever the unit was
      // still more than a tile and a half from the centre, which a melee attacker on the tile beside a 2x2 building always
      // is. Measured on open ground (.claude/review/tenth/melee-probe.js, eight directions): Probes, SCVs, Drones, Zerglings
      // and Zealots dropped their attack on a Pylon, Photon Cannon, Missile Turret or Creep Colony from three to five
      // directions in eight, an Ultralisk from seven, 107 attacks in 384 in all -- a player's first worker sent at a Pylon
      // stood there. So a unit within a tile and a half of a target building's EDGE keeps closing on it straight (1 tile
      // still lost 7 Ultralisk attacks; 1.5 and 2 lost none); anything else still counts as unreachable here, and the
      // watchdog above still ends a real grind.
      else if (this.path && this.path.length) { const wp = this.path[this.path.length - 1]; const b = targetUnit && targetUnit.isBuilding && !targetUnit.lifted ? targetUnit : null; const gap = b ? DMath.hypot(Math.max(b.tx * TILE - this.x, 0, this.x - (b.tx + b.def.w) * TILE), Math.max(b.ty * TILE - this.y, 0, this.y - (b.ty + b.def.h) * TILE)) - this.r : Infinity; if (distPt(this.x, this.y, (wp[0] + .5) * TILE, (wp[1] + .5) * TILE) < TILE && distPt(this.x, this.y, x, y) > TILE * 1.5 && !(gap <= TILE * 1.5)) { /* path ended short (unreachable) */ this.stuck = 0; this.moveFailed = true; return true; } }
    }
    const want = DMath.atan2(gy - this.y, gx - this.x); let ang = want; let step = Math.min(spd, dd);
    if (!this.lifted) {
      const turn = TURN[this.def.id] || (this.fly ? 0.3 : 0.7); let diff = want - this.facing; diff = DMath.atan2(DMath.sin(diff), DMath.cos(diff));
      // THE LAST TWENTY PIXELS ARE NOT A BEARING (TODO-M18 item 11, "dragoons wobble very fast after they
      // move"). This used to SNAP the facing onto `want` inside 20 px of the destination, and at that range
      // the bearing is whichever way a neighbour has just shoved you. Measured: eight dragoons ordered to
      // one point turned 37, 58 and 79 degrees in a single frame against a turn rate of 14.32; a lone one
      // never did. Hold the facing and strafe the last few pixels instead.
      //
      // `ang = want` is load-bearing: the direction of travel is normally taken FROM the facing, so holding
      // the facing without it sends the unit off the way it happens to point (a dragoon told to move six
      // pixels walked out past twenty and turned 143 degrees to come back -- test/movement.js caught it).
      // The hard-turn slowdown below is deliberately left on everywhere: exempting these 20 px was tried
      // and it made crowd moves slower and stopped the AI expanding in test/eightplayer.js.
      if (dd < 20) { ang = want; }
      else {
        if (Math.abs(diff) <= turn) this.facing = want; else this.facing += Math.sign(diff) * turn;
        this.facing = DMath.atan2(DMath.sin(this.facing), DMath.cos(this.facing)); ang = this.facing;
      }
      if (!this.fly) { if (Math.abs(diff) > 1.2) step *= TURN[this.def.id] ? 0.15 : 0.45; }
      else { const acc = ACCEL[this.def.id] || 0.4; this.spdCur = Math.min(spd, (this.spdCur || 0) + acc); const brake = (this.spdCur * this.spdCur) / (2 * acc); if (dd < brake) this.spdCur = Math.max(Math.min(spd, 1.5), this.spdCur - acc); step = Math.min(this.spdCur, dd); }
    } else this.facing = ang;
    let nx = this.x + DMath.cos(ang) * step, ny = this.y + DMath.sin(ang) * step;
    if (!this.fly) {
      if (!G.passable(nx, ny, this) && G.passable(this.x, this.y, this)) {
        // slide along the obstacle at full speed (axis-aligned first, then diagonals)
        const sx = Math.sign(nx - this.x) || 1, sy = Math.sign(ny - this.y) || 1;
        const tries = Math.abs(nx - this.x) >= Math.abs(ny - this.y) ? [[this.x + sx * step, this.y], [this.x, this.y + sy * step], [this.x + DMath.cos(ang + 0.8) * step, this.y + DMath.sin(ang + 0.8) * step], [this.x + DMath.cos(ang - 0.8) * step, this.y + DMath.sin(ang - 0.8) * step]] : [[this.x, this.y + sy * step], [this.x + sx * step, this.y], [this.x + DMath.cos(ang + 0.8) * step, this.y + DMath.sin(ang + 0.8) * step], [this.x + DMath.cos(ang - 0.8) * step, this.y + DMath.sin(ang - 0.8) * step]];
        let ok = false; for (const [ax, ay] of tries) if (G.passable(ax, ay, this)) { nx = ax; ny = ay; ok = true; break; }
        if (!ok) { this.stuck += 3; this.repathT = 0; if (this.stuck > 30) this.path = null; return false; }
      }
    } else { nx = clamp(nx, 8, G.map.w * TILE - 8); ny = clamp(ny, 8, G.map.h * TILE - 8); }
    const moved = distPt(nx, ny, this.x, this.y);
    this.vx = nx - this.x; this.vy = ny - this.y; this.x = nx; this.y = ny; this.moving = true; this.walkDist = (this.walkDist || 0) + moved;
    if (moved < spd * 0.3) this.stuck++; else this.stuck = Math.max(0, this.stuck - 1);
    return false;
  }
  moveToRect(b, pad = 6) { // move adjacent to a building/resource
    const x0 = b.tx !== undefined ? b.tx * TILE : b.x * TILE, y0 = b.ty !== undefined ? b.ty * TILE : b.y * TILE;
    const w = (b.def ? b.def.w : b.w) * TILE, h = (b.def ? b.def.h : b.h) * TILE;
    const cx = clamp(this.x, x0, x0 + w), cy = clamp(this.y, y0, y0 + h);
    const dd = distPt(this.x, this.y, cx, cy);
    this.moveFailed = false; // moveToRect can report success without calling moveTo, so do not leave a stale flag
    if (dd <= this.r + pad) return true;
    // aim slightly outside the nearest edge point
    let ax = cx + (this.x - cx) / (dd || 1) * (this.r + 2), ay = cy + (this.y - cy) / (dd || 1) * (this.r + 2);
    if (!this.fly && !G.passable(ax, ay, this)) { // approach point blocked (another building touching this one): nearest passable spot around the perimeter
      const off = this.r + 2; let best = null, bd = 1e9;
      for (let t = 0; t <= 1.001; t += 0.125) for (const [px, py] of [[x0 + w * t, y0 - off], [x0 + w * t, y0 + h + off], [x0 - off, y0 + h * t], [x0 + w + off, y0 + h * t]]) { if (!G.passable(px, py, this)) continue; const d = distPt(this.x, this.y, px, py); if (d < bd) { bd = d; best = [px, py]; } }
      if (best) { ax = best[0]; ay = best[1]; }
    }
    if (this.moveTo(ax, ay)) return true;
    return distPt(this.x, this.y, clamp(this.x, x0, x0 + w), clamp(this.y, y0, y0 + h)) <= this.r + pad;
  }

  // ---------------- gathering ----------------
  tickGather() {
    const o = this.order, res = o.target;
    // A PATCH THAT RAN OUT SENDS THE WORKER TO ANOTHER PATCH ON THE SAME LINE, AND NOWHERE ELSE (TODO-M18
    // item 6). This used to be findNearestResource -- a scan of every resource on the map -- so a worker
    // whose main ran dry set off for the natural on its own and shuttled its minerals back past the hall
    // it had left. Measured: twelve of twelve workers, about 280 tiles each in ninety seconds.
    //
    // When the line is finished there is nothing to fall back to and the worker goes idle, which is the
    // point: an idle worker is visible (the idle-worker key finds it) and moving it is an instruction.
    // The computer is unaffected -- AI.economy picks its own idle workers up and re-tasks them, which is
    // the deliberate move to a new base that this must not take away.
    //
    // GAS keeps the old behaviour on purpose: a refinery that is destroyed or mined out is a building,
    // not a line, and walking to another of your own refineries is the only sensible answer.
    if (!res || (res.type === 'mineral' && res.amount <= 0) || (res.type === 'gas' && !res.alive)) {
      const n = (res && res.type === 'mineral') ? G.nextPatchInBase(this, res) : G.findNearestResource(this, res && res.type === 'gas' ? 'gas' : 'mineral');
      // THROUGH applyOrder, NOT BY EDITING THE ORDER (SCAN-M18 A1.1). This used to write `o.target = n; o.phase =
      // 'goto'`, which skips the teardown applyOrder exists for -- above all the one that clears `inside`. A worker
      // in a Refinery when it died therefore kept `inside` pointing at the wreck, and tick() returns at the
      // `inside` guard for anything not mid-gather: measured, the SCV was still alive, still inside, order
      // gather/goto and motionless 600 frames later, out of the grid (unclickable, untargetable) and still counted
      // in supply. It needs a SECOND gas building to exist, or `n` is null and nextOrder() frees it -- which is
      // why the suites never saw it.
      if (!n) { this.nextOrder(); return; } this.applyOrder(Object.assign({}, o, { target: n, phase: 'goto' })); return;
    }
    if (this.carrying) { this.applyOrder({ type: 'return', then: res }); return; }
    this.lastRes = res;
    if (res.type === 'mineral') {
      if (o.phase === 'mine') { if (--o.t <= 0) { res.miner = null; res.amount -= WORKER_HAUL;
        G.map.crater(res.cx, res.cy, 1.8, MINE_STRIP);   // the attrition economy: working a patch strips the ground around it, for good
 this.carrying = { type: 'mineral', amt: res.amount >= 0 ? WORKER_HAUL : WORKER_HAUL + res.amount }; if (res.amount <= 0) G.removeResource(res); this.applyOrder({ type: 'return', then: res }); } return; }
      if (this.moveToRect(res, 6)) {
        // Brood War puts TWO workers on a patch, not one. This used to hand the patch to a single
        // claimant and send everyone else looking elsewhere, so a second worker right-clicked onto a
        // patch would turn round and walk off it.
        if (G.minersOn(res, this) < MINERS_PER_PATCH) { res.miner = this; o.phase = 'mine'; o.t = MINE_TIME; }
        else { // find another free field nearby
          if ((G.frame + this.id) % 16 === 0) { let best = null, bd = 1e9; for (const r of G.map.resources) { if (r.type !== 'mineral' || r.amount <= 0 || G.minersOn(r) >= MINERS_PER_PATCH) continue; const dd = distPt(r.cx, r.cy, res.cx, res.cy); if (dd < 6 * TILE && dd < bd) { bd = dd; best = r; } } if (best) { o.target = best; o.phase = 'goto'; this.path = null; } }
        }
      }
    } else { // gas building
      const g = res; if (!g.done || g.owner !== this.owner) { this.nextOrder(); return; }
      if (o.phase === 'inside') { if (--o.t <= 0) { g.occupant = null; this.inside = null; g.geyser.amount -= WORKER_HAUL; const amt = g.geyser.amount > 0 ? WORKER_HAUL : GAS_DEPLETED; if (g.geyser.amount < 0) g.geyser.amount = 0; this.carrying = { type: 'gas', amt }; this.x = g.x; this.y = g.y + g.r + this.r; this.applyOrder({ type: 'return', then: g }); } return; }
      if (this.moveToRect(g, 6)) { if (!g.occupant || !g.occupant.alive || g.occupant.order.type !== 'gather') { g.occupant = this; o.phase = 'inside'; o.t = GAS_TIME; this.inside = g; } }
    }
  }
  // A MULE takes MULE_HAUL extra minerals out of the patch it just worked and carries them home on the same trip.
  // See MULE_HAUL at the top of the file for why it debits the patch rather than crediting the player out of nothing.
  //
  // The hook is the frame the payload appears: tickGather above sets `carrying` and hands the unit a 'return' order
  // in one step, so a `carrying` without our tag is a pickup that has not been topped up yet. The tag goes on
  // unconditionally, before any of the reasons this might do nothing, so a MULE standing on a patch that ran dry
  // cannot be topped up twice on the way home.
  //
  // `lastRes` rather than `order.then`: tickGather sets `lastRes` on every gather tick and it survives whatever the
  // order queue does next, whereas `then` is only there if the return order is still the current one.
  //
  // Written in js/abilities.js and run from Abilities.tickFields while M12's Terran branch did not own this file;
  // merged at M13, it lives beside the gather it tops up (REVIEW-M17 task 22). It is still called from G.tickTerran,
  // after every unit has ticked, and NOT from tickGather: hauled from inside the gather it would debit the patch
  // before the other workers on it have mined this frame, which changes what they carry home.
  muleHaul() {
    const c = this.carrying;
    if (!c || c.type !== 'mineral' || c.hauled) return;
    c.hauled = true;
    const res = this.lastRes;
    if (!res || res.type !== 'mineral' || res.amount <= 0) return;   // the patch died on this very trip
    const extra = Math.min(res.amount, MULE_HAUL);
    res.amount -= extra; c.amt += extra;
    if (res.amount <= 0) G.removeResource(res);
  }
  tickReturn() {
    const o = this.order;
    if (!this.carrying) { if (o.then) this.applyOrder({ type: 'gather', target: o.then, phase: 'goto' }); else this.nextOrder(); return; }
    if (!o.depot || !o.depot.alive || !o.depot.done) {
      // No hall to return to: look again every 24 frames, not every frame, and keep the order -- a hall
      // under construction will finish. The old line reset waitT to 24 and then decremented it once, so
      // it never expired and G.nearestDepot walked G.units every frame (measured: 638 calls in 240
      // frames with the only hall dead). (REVIEW-M17)
      if (this.waitT > 0) { this.waitT--; return; }
      o.depot = G.nearestDepot(this); if (!o.depot) { this.waitT = 24; return; } this.path = null;
    }
    if (this.moveToRect(o.depot, 6)) {
      const p = this.player; if (this.carrying.type === 'mineral') { p.minerals += this.carrying.amt; p.stats.mined += this.carrying.amt; } else { p.gas += this.carrying.amt; p.stats.gassed += this.carrying.amt; }
      this.carrying = null;
      if (this.queue.length) { this.nextOrder(); return; } // shift-queued orders run after the current trip
      if (o.then && ((o.then.type === 'mineral' && o.then.amount > 0) || (o.then.type === 'gas' && o.then.alive))) this.applyOrder({ type: 'gather', target: o.then, phase: 'goto' });
      // The other half of the same rule: the worker has just delivered and the patch it remembered has
      // run out. Same line or idle. With no remembered patch at all -- a worker told to return by hand --
      // the whole-map search is still the right answer, because there is no line to stay on.
      else { const n = (o.then && o.then.type === 'mineral') ? G.nextPatchInBase(this, o.then) : G.findNearestResource(this, 'mineral'); if (n) this.applyOrder({ type: 'gather', target: n, phase: 'goto' }); else this.nextOrder(); }
    }
  }
  // ---------------- building ----------------
  tickBuild() {
    const o = this.order, def = o.def, p = this.player;
    const cx = (o.tx + def.w / 2) * TILE, cy = (o.ty + def.h / 2) * TILE;
    const fake = { tx: o.tx, ty: o.ty, def };
    if (def.onGeyser) { const g = G.map.geyserAt(o.tx, o.ty); if (!g) { this.nextOrder(); return; } }
    if (this.moveToRect(fake, 8)) {
      const err = G.map.canPlace(def, o.tx, o.ty, p, G.units, this);
      if (err) { p.msg(err, 'error'); this.nextOrder(); return; }
      if (!p.hasReq(def)) { p.msg('Requires ' + p.missingReq(def), 'error'); this.nextOrder(); return; }
      if (!p.canAfford(def.min, def.gas)) { this.nextOrder(); return; }
      p.minerals -= def.min; p.gas -= def.gas;
      const b = G.placeBuilding(def, o.tx, o.ty, this.owner);
      if (def.race === 'T') { this.applyOrder({ type: 'construct', target: b }); b.builder = this; }
      else if (def.race === 'Z') { G.kill(this, null, true); }
      else { this.nextOrder(); }
      // push away from footprint
      if (this.alive && !this.fly) G.nudgeOut(this, b);
    }
  }
}
