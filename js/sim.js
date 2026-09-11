'use strict';
// ============================================================================
// Simulation core: Game state, Player, Unit, orders, movement, combat,
// economy, production. Deterministic fixed-step at TPS.
// ============================================================================
const SIEGE_W = { dmg: 70, type: 'explosive', range: 12, minRange: 2, cd: 75, hits: 1, upgDmg: 5, upgKey: 'vehW', targets: 'ground', splash: [0.3, 0.8, 1.25], ff: true };
const EQUIV = { hatchery: ['lair', 'hive'], lair: ['hive'], spire: ['greater_spire'], command_center: [], nexus: [] };
// A body wider than this needs a path with CLEARANCE rather than one found for a point -- see the
// comment on Pathfinder.find (FIXLIST-M14 C6). Half a tile: a unit standing dead centre in a tile
// pokes (r - 16) px into its neighbour, so 16 is exactly the radius at which that stops being zero.
// Three defs are over it today: Thor and Ultralisk at 20, Reaver at 18.
const WIDE_BODY = TILE / 2;
const MINE_TIME = 75, GAS_TIME = 37, LARVA_TIME = 342, MAX_QUEUE = 5;
const WORKER_HAUL = 8, GAS_DEPLETED = 2;   // a trip's minerals or gas, and a depleted geyser's; MULE_HAUL in js/abilities.js sits on top of the eight (REVIEW-M17: four literals before)
const MODE_TRANS = 40;                     // frames a mode change locks a unit: siege and unsiege, the Viking transform, an abducted tank's forced unsiege (three literals before)
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
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const distPt = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
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
  upgLevel(k) { return k ? (this.upg[k] || 0) : 0; }
  hasTech(t) { return this.tech.has(t); }
  msg(text, kind = 'info') { if (!this.human) return; const last = this.lastAlert[text] || -9999; if (G.frame - last < 72) return; this.lastAlert[text] = G.frame; this.msgs.push({ text, t: G.frame, kind }); if (this.msgs.length > 6) this.msgs.shift(); if (typeof Sound !== 'undefined') Sound.alert(kind); if (typeof Voice !== 'undefined' && (kind === 'attack' || kind === 'nuke' || text.endsWith('complete.') || text === RACE_INFO[this.race].supplyMsg || text.startsWith('Mission') || text.startsWith('Nuclear'))) Voice.announce(text); }
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
    this.maxEnergy = def.energy || 0; this.energy = def.energy ? 50 : 0;
    this.facing = G.rand() * Math.PI * 2; this.fly = !!def.fly; this.done = !this.isBuilding;
    this.order = { type: 'idle' }; this.queue = []; this.path = null; this.pathI = 0; this.stuck = 0; this.repathT = 0;
    this.cooldown = 0; this.cargo = []; this.inside = null; this.carrying = null; this.lastRes = null; this.heldOrder = false;
    this.prod = []; this.rally = null; this.addon = null; this.parent = null; this.sieged = false; this.transT = 0;
    // Frames until a dug-in weapon is live. Only a def with `dig` ever sets it (the Widow Mine); it is
    // zero for everything else, so `digT > 0` is false and weaponFor is unaffected. A mine that spawns
    // already burrowed starts unarmed, which is the same rule as one that burrows by hand.
    this.digT = (def.dig && def.burrowed) ? def.dig.burrow + def.dig.arm : 0;
    this.cloaked = !!def.cloaked; this.burrowed = !!def.burrowed; this.stim = 0; this.fx = {}; this.kills = 0; this.detBy = {};
    this.lifetime = def.lifetime || 0; this.mines = def.mines || 0; this.scarabs = def.scarabs || 0; this.interceptors = def.interceptors || 0;
    this.creepR = 0;
    this.larvae = []; this.larvaT = LARVA_TIME; this.hatch = null; this.morphT = 0; this.progress = 0; this.builder = null; this.lifted = false;
    this.lastHit = -9999; this.lastHitBy = null; this.arbCloak = -9999; this.halluc = false; this.idleT = 0; this.acidSpores = 0;
    this.auraSight = 1; this.auraNoDet = false;   // recomputed each pass by G.tickAuras; see the aura contract in js/data.js
    this.waitT = 0; this.moving = false; this.vx = 0; this.vy = 0; this.spawnT = G.frame; this.cloakT = 0; this.unpowered = false;
    if (this.isBuilding) { this.tx = Math.round(x / TILE - def.w / 2); this.ty = Math.round(y / TILE - def.h / 2); this.x = (this.tx + def.w / 2) * TILE; this.y = (this.ty + def.h / 2) * TILE; this.px = this.x; this.py = this.y; this.r = Math.max(def.w, def.h) * TILE / 2; }
  }
  get player() { return G.players[this.owner]; }
  get name() { return this.def.name; }
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
    if (d.id === 'siege_tank' && this.sieged) return t.fly ? null : SIEGE_W;
    if (d.id === 'siege_tank' && this.transT > 0) return null;
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
    if (d.spawnsLarva) { if (this.larvae.length < 3) { if (--this.larvaT <= 0) { this.larvaT = LARVA_TIME; G.spawnLarva(this); } } else this.larvaT = LARVA_TIME; }
    if (this.addon && !this.addon.alive) this.addon = null;
    if (this.addon && !this.addon.done) return; // building addon
    this.tickProduction();
    if (this.order.type === 'land') this.tickOrder();
    // defensive weapons
    if ((d.gw || d.aw) && !(this.fx.dweb > 0)) this.tickCombatBuilding();
    if (d.bunker) { for (const c of this.cargo) { if (c.cooldown > 0) c.cooldown--; c.x = this.x; c.y = this.y; this.acquireFor(c); } }
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
    if (it.kind === 'unit' && !d.egg && !it.started) { const ud = DATA.units[it.id]; if (ud.sup && this.player.supUsed + ud.sup * (ud.pair ? 2 : 1) > this.player.supMax && !it.reserved && !(G.cheats.food && this.player.human)) return; /* G.tickAlerts says this once on its own cooldown, rather than every 72 frames until a depot goes up */ it.started = true; }
    it.progress += (G.cheats.cwal && this.player.human) ? 10 : 1;
    if (it.progress >= it.total) { this.prod.shift(); G.finishProduction(this, it); }
  }

  // ---------------- larva ----------------
  tickLarva() {
    if (!this.hatch || !this.hatch.alive) { G.kill(this, null, true); return; }
    if ((G.frame + this.id) % 60 === 0) { const a = G.rand() * Math.PI * 2; this.wx = this.hatch.x + Math.cos(a) * 60; this.wy = this.hatch.y + (this.hatch.def.h / 2) * TILE + 14 + G.rand() * 18; }
    if (this.wx !== undefined) { const dx = this.wx - this.x, dy = this.wy - this.y, dd = Math.hypot(dx, dy); if (dd > 2) { this.x += dx / dd * 0.3; this.y += dy / dd * 0.3; } }
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
      case 'construct': { const b = o.target; if (!b || !b.alive || b.done) { this.nextOrder(); break; } if (b.builder && b.builder !== this && b.builder.alive && b.builder.order.target === b) { this.nextOrder(); break; } b.builder = this; if (this.moveToRect(b, 4)) { if (this.moveFailed) { if (b.builder === this) b.builder = null; this.nextOrder(); break; } this.facing = Math.atan2(b.y - this.y, b.x - this.x); } break; }
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
        const cap = d.cargo || (d.cargoTech && this.player.hasTech(d.cargoTech) ? 8 : 0);
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
      case 'land': { if (this.moveTo((o.tx + d.w / 2) * TILE, (o.ty + d.h / 2) * TILE)) { G.landBuilding(this, o.tx, o.ty); } break; }
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
      this.facing = Math.atan2(t.y - this.y, t.x - this.x);
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
    this.cooldown = this.wCd(w) + Math.floor(G.rand() * 3) - 1; this.facing = Math.atan2(t.y - this.y, t.x - this.x); this.lastFire = G.frame;
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
    const arriveR = targetUnit ? Math.max(6, this.r + targetUnit.r - 4) : Math.max(4, spd);
    if (dd <= arriveR) { this.noProgT = 0; return true; }
    if (this.stuck > 40 && dd < 140) { this.stuck = 0; return true; }
    // Movement watchdog. A* returns a best-effort path, so an unreachable goal never fails - the unit just
    // grinds into the obstacle with an order that can never complete. Sliding along a wall still counts as
    // progress to u.stuck, so that does not catch it either. Ten seconds without getting any closer means
    // give up and let the caller drop the order. A goal that moves (a follow target) restarts the clock.
    if (!this.progG || distPt(this.progG[0], this.progG[1], x, y) > 2 * TILE) { this.progG = [x, y]; this.bestDD = dd; this.noProgT = 0; }
    // Sixteen pixels, not four. The watchdog resets whenever the unit gets closer to its goal, and four
    // pixels is inside the noise: a unit being shoved about by its neighbours drifts a few pixels toward
    // the goal often enough to keep resetting the clock, so it never gives up. That is what made
    // full-strength separation break test/wrongthing.js -- units rallied somewhere unreachable ground
    // against the wall forever because the jostling read as progress. Sixteen is larger than any single
    // separation push (half of a contact distance, and contact distances here run 12 to 31) and far
    // below what real movement covers in the ten seconds the watchdog allows.
    else if (dd < this.bestDD - 16) { this.bestDD = dd; this.noProgT = 0; }
    else if (++this.noProgT > 240) { this.noProgT = 0; this.stuck = 0; this.moveFailed = true; return true; }
    let gx = x, gy = y;
    if (!this.fly) {
      const [sx, sy] = this.tile(); const tx = clamp(Math.floor(x / TILE), 0, m.w - 1), ty = clamp(Math.floor(y / TILE), 0, m.h - 1);
      if (!this.path || this.pathGoal[0] !== tx || this.pathGoal[1] !== ty || this.repathT <= 0) {
        if (G.pathBudget > 0 || !this.path) { G.pathBudget--; this.path = G.pf.find(sx, sy, tx, ty, 5000, this.r > WIDE_BODY); this.pathI = 0; this.pathGoal = [tx, ty]; this.repathT = 90 + (this.id % 30); }
      } else this.repathT--;
      // advance along path
      while (this.path && this.pathI < this.path.length) { const wp = this.path[this.pathI]; const wx = (wp[0] + 0.5) * TILE, wy = (wp[1] + 0.5) * TILE; if (distPt(this.x, this.y, wx, wy) < Math.max(6, spd + 2)) this.pathI++; else break; }
      if (this.path && this.pathI < this.path.length) { const wp = this.path[this.pathI]; gx = (wp[0] + 0.5) * TILE; gy = (wp[1] + 0.5) * TILE; }
      else if (this.path && this.path.length) { const wp = this.path[this.path.length - 1]; if (distPt(this.x, this.y, (wp[0] + .5) * TILE, (wp[1] + .5) * TILE) < TILE && distPt(this.x, this.y, x, y) > TILE * 1.5) { /* path ended short (unreachable) */ this.stuck = 0; this.moveFailed = true; return true; } }
    }
    const want = Math.atan2(gy - this.y, gx - this.x); let ang = want; let step = Math.min(spd, dd);
    if (!this.lifted) {
      const turn = TURN[this.def.id] || (this.fly ? 0.3 : 0.7); let diff = want - this.facing; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) <= turn || dd < 20) this.facing = want; else this.facing += Math.sign(diff) * turn;
      this.facing = Math.atan2(Math.sin(this.facing), Math.cos(this.facing)); ang = this.facing;
      if (!this.fly) { if (Math.abs(diff) > 1.2) step *= TURN[this.def.id] ? 0.15 : 0.45; }
      else { const acc = ACCEL[this.def.id] || 0.4; this.spdCur = Math.min(spd, (this.spdCur || 0) + acc); const brake = (this.spdCur * this.spdCur) / (2 * acc); if (dd < brake) this.spdCur = Math.max(Math.min(spd, 1.5), this.spdCur - acc); step = Math.min(this.spdCur, dd); }
    } else this.facing = ang;
    let nx = this.x + Math.cos(ang) * step, ny = this.y + Math.sin(ang) * step;
    if (!this.fly) {
      if (!G.passable(nx, ny, this) && G.passable(this.x, this.y, this)) {
        // slide along the obstacle at full speed (axis-aligned first, then diagonals)
        const sx = Math.sign(nx - this.x) || 1, sy = Math.sign(ny - this.y) || 1;
        const tries = Math.abs(nx - this.x) >= Math.abs(ny - this.y) ? [[this.x + sx * step, this.y], [this.x, this.y + sy * step], [this.x + Math.cos(ang + 0.8) * step, this.y + Math.sin(ang + 0.8) * step], [this.x + Math.cos(ang - 0.8) * step, this.y + Math.sin(ang - 0.8) * step]] : [[this.x, this.y + sy * step], [this.x + sx * step, this.y], [this.x + Math.cos(ang + 0.8) * step, this.y + Math.sin(ang + 0.8) * step], [this.x + Math.cos(ang - 0.8) * step, this.y + Math.sin(ang - 0.8) * step]];
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
    if (!res || (res.type === 'mineral' && res.amount <= 0) || (res.type === 'gas' && !res.alive)) { const n = G.findNearestResource(this, res && res.type === 'gas' ? 'gas' : 'mineral'); if (!n) { this.nextOrder(); return; } o.target = n; o.phase = 'goto'; return; }
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
      else { const n = G.findNearestResource(this, 'mineral'); if (n) this.applyOrder({ type: 'gather', target: n, phase: 'goto' }); else this.nextOrder(); }
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
