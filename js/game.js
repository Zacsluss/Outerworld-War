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
// The supply ceiling. 200 is StarCraft's number and it exists to stop a match becoming unreadable; at
// 500 an army is allowed to become unwieldy instead of impossible, which is the point of the attrition
// direction -- a long game should end on a stripped map with two ruined armies, not two capped ones.
// Referenced rather than inlined because the supply-block alert and the refusal message both have to
// agree with it, and they did not used to.
const SUPPLY_CAP = 500;
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
  const a = Math.atan2(src.y - t.y, src.x - t.x) - t.facing;
  const off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));   // wrapped to [0, PI]
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
  pathBudget: 40, over: false, winner: -1, speed: 1, paused: false, human: 0, cell: 64, grid: null, gw: 0, gh: 0, alliances: null,
  nukeAlerts: [],

  init(opts) {
    UNIT_ID = 1; this.seed = opts.seed || 1; this.layout = opts.layout || 'temple'; this.setup = opts; this.cheats = {}; this.log = []; this.pendingCmds = null; RNG.seed((this.seed * 7919 + 17) >>> 0); this._allVis = null; this.freePlay = false; this.mission = null;
    this.map = new GameMap(opts.seed || 1, opts.layout || 'temple'); this.pf = new Pathfinder(this.map);
    this.units = []; this.byId = new Map(); this.effects = []; this.projectiles = []; this.fields = []; this.frame = 0; this.over = false; this.winner = -1;
    this.gw = Math.ceil(this.map.w * TILE / this.cell); this.gh = Math.ceil(this.map.h * TILE / this.cell);
    this.grid = new Array(this.gw * this.gh).fill(null).map(() => []);
    this.players = [];
    const races = ['T', 'Z', 'P'];
    const pick = r => r === 'R' ? races[Math.floor(this.rand() * 3)] : r;
    opts.players.forEach((po, i) => {
      const p = new Player(i, pick(po.race), po.human, po.name || (po.human ? 'Player' : 'Computer ' + i)); p.team = po.team == null ? i : po.team;
      p.vis = new Uint8Array(this.map.w * this.map.h); p.ai = po.human ? null : new AI(p, po.difficulty || 'normal');
      this.players.push(p);
      const base = this.map.starts[i % this.map.starts.length];
      p.startBase = base; p.startX = base.cx; p.startY = base.cy;
      this.setupStart(p, base);
    });
    this.human = opts.human != null ? opts.human : this.players.findIndex(p => p.human);
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
    if (hallDef.spawnsLarva) for (let i = 0; i < 3; i++) this.spawnLarva(hall);
    const wd = RACE_INFO[p.race].worker;
    for (let i = 0; i < 4; i++) { const u = this.spawnUnit(wd, p.id, hall.x - 40 + i * 28, hall.y + hall.def.h / 2 * TILE + 24); const m = this.findNearestResource(u, 'mineral'); if (m) u.applyOrder({ type: 'gather', target: m, phase: 'goto' }); }
    if (p.race === 'Z') this.spawnUnit('overlord', p.id, hall.x, hall.y - 60);
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
    // there forever. nearEach already reaches into the neighbouring cells; nothing was asking it to.
    for (const cell of this.grid) {
      for (let i = 0; i < cell.length; i++) {
        const a = cell[i]; if (a.isBuilding || a.def.larva || a.burrowed) continue;
        this.nearEach(a.x, a.y, a.r, b => {
          if (b === a || b.isBuilding || b.def.larva || b.burrowed || b.id < a.id) return;
          // Air separates from air and ground from ground, but the two layers pass through each other:
          // a wraith flying over a marine is not a collision. Flyers used to be skipped entirely, so any
          // number of overlords could sit on one pixel. Note this is a deliberate departure from Brood
          // War, where air units do not collide at all and stacking mutalisks is a real technique.
          if (!!a.fly !== !!b.fly) return;
          const dx = b.x - a.x, dy = b.y - a.y; let d = Math.hypot(dx, dy); const min = (a.r + b.r) * 0.85;
          if (d >= min) return;
          let ux, uy;
          if (d < 0.01) {
            // Exactly coincident. dx and dy are both zero, so the unit vector is (0,0) and the push
            // below moves nothing -- two units on one pixel could never come apart. Pick a direction
            // from the pair's ids instead: same answer on every client, and no trig, whose last bit is
            // not guaranteed to agree between engines.
            const h = ((a.id * 73856093) ^ (b.id * 19349663)) >>> 0;
            const v = SEP_DIRS[h & 7]; ux = v[0]; uy = v[1]; d = 0.01;
          } else { ux = dx / d; uy = dy / d; }
          // 0.9, up from 0.6. The old damping never caught up with a crowd walking into itself: twelve
          // marines ordered onto one point settled 2.7 px inside contact distance and stayed there, two
          // pairs still overlapping after they had stopped. At 0.9 the same crowd lands on 13.1 of a
          // 13.6 contact distance with nothing overlapping, and pairs overlapping in transit drop from
          // three to one.
          //
          // Not 1.0, which resolves an overlap exactly and is measurably the best on both counts -- it
          // breaks test/wrongthing.js. A unit rallied somewhere nothing can reach is jostled hard enough
          // by its neighbours that its stuck detector reads the jostling as progress and it never gives
          // up, which is a worse bug than the one being fixed. The real repair is for that detector to
          // watch distance to the goal instead of distance moved; until then, damping.
          //
          // Running the damped pass twice also fixes the stacking, and is worse in every way: a second
          // traversal of every unit, and it breaks test/snapshot.js's cross-process check, which is the
          // multiplayer rejoin path. That break is unexplained and is a real lead -- JSON round-trips a
          // snapshot exactly and there are no negative zeros, so extra position churn is exposing
          // something the snapshot does not capture. Chase it before adding a second pass for any reason.
          const push = (min - d) * 0.5;
          const am = a.sieged ? 0 : 1, bm = b.sieged ? 0 : 1;
          const ax = a.x - ux * push * am, ay = a.y - uy * push * am, bx = b.x + ux * push * bm, by = b.y + uy * push * bm;
          // passable() reads the walk grid, which says nothing useful about a flyer -- gating on it
          // would pin overlords over cliffs and water, the places they most want to be.
          if (am && (a.fly || this.passable(ax, ay, a))) { a.x = ax; a.y = ay; }
          if (bm && (b.fly || this.passable(bx, by, b))) { b.x = bx; b.y = by; }
        });
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
  detected(u, pid) { return (u.detBy[pid] || -99) >= this.frame - 8; },
  canSee(pid, u) { if (u.owner === pid || this.allied(pid, u.owner)) return true; if (u.fx.parasite === pid) return true; if (!this.visibleAt(pid, u.x, u.y)) return false; if (u.isCloaked && !this.detected(u, pid) && !(u.fx.ensnare > 0 || u.fx.plague > 0)) return false; return true; },
  targetable(att, t) { if (!t.alive || t.inside) return false; if (t.fx.stasis > 0) return false; if (t.owner === att.owner || this.allied(att.owner, t.owner)) return true; return this.canSee(att.owner, t); },
  circles: {},
  circle(r) { if (this.circles[r]) return this.circles[r]; const o = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) o.push([dx, dy]); return this.circles[r] = o; },
  updateVision() {
    const m = this.map;
    for (const p of this.players) {
      if (p.defeated && !p.human) continue; // a defeated computer player has nothing to see
      const v = p.vis; for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1;
      const mark = (ux, uy, r, uh) => { const tx = Math.floor(ux / TILE), ty = Math.floor(uy / TILE); for (const [dx, dy] of this.circle(r)) { const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue; const i = y * m.w + x; if (m.height[i] <= uh || (m.height[i] === 2 && uh === 1 && false)) v[i] = 2; } };
      for (const u of this.units) { if (!u.alive || u.inside) continue; if (this.allied(u.owner, p.id) || u.fx.parasite === p.id) mark(u.x, u.y, u.sight, u.heightLevel()); }
      for (const f of this.fields) if (f.kind === 'scan' && this.allied(f.owner, p.id)) mark(f.x, f.y, 10, 2);
      if (p.human && (this.cheats.reveal || this.cheats.nofog)) v.fill(2);
    }
    // detection
    for (const u of this.units) { if (!u.alive || !u.isDetector) continue; const r = u.sight * TILE; for (const t of this.near(u.x, u.y, r)) if (t.owner !== u.owner && t.isCloaked) for (const q of this.players) if (this.allied(q.id, u.owner)) t.detBy[q.id] = this.frame; }
    for (const f of this.fields) if (f.kind === 'scan') for (const t of this.near(f.x, f.y, 10 * TILE)) if (t.isCloaked) t.detBy[f.owner] = this.frame;
  },

  // ---------------- spawning ----------------
  spawnUnit(defId, owner, x, y) { const u = new Unit(defId, owner, x, y); this.units.push(u); this.byId.set(u.id, u); return u; },
  placeBuilding(def, tx, ty, owner) {
    const b = new Unit(def.id, owner, (tx + def.w / 2) * TILE, (ty + def.h / 2) * TILE); b.tx = tx; b.ty = ty; b.hp = Math.max(1, def.hp * 0.1); b.sh = 0; b.done = false; b.progress = 0;
    this.units.push(b); this.byId.set(b.id, b); this.map.block(tx, ty, def.w, def.h, b.id);
    if (def.onGeyser) { const g = this.map.geyserAt(tx, ty); b.geyser = g; g.building = b; }
    if (def.tier === 'addon') { } // parent set by caller
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
    
    if (b.builder && b.builder.alive && b.builder.order.type === 'construct' && b.builder.order.target === b) { const w = b.builder; w.nextOrder(); if (w.order.type === 'idle' && w.lastRes) { const r = w.lastRes; if ((r.type === 'mineral' && r.amount > 0) || (r.type === 'gas' && r.alive)) w.applyOrder({ type: 'gather', target: r, phase: 'goto' }); } }
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
  finishProduction(b, it) {
    const p = this.players[b.owner];
    if (it.kind === 'unit') {
      const ud = DATA.units[it.id];
      if (it.id === 'nuke') { p.nukes++; b.hasNuke = true; p.msg('Nuclear missile ready.'); return; }
      if (it.id === 'scarab') { b.scarabs = Math.min(b.scarabs + 1, b.player.hasTech('reaver_capacity') ? 10 : 5); return; }
      if (it.id === 'interceptor') { b.interceptors = Math.min(b.interceptors + 1, b.player.hasTech('carrier_capacity') ? 8 : 4); return; }
      const count = ud.pair ? 2 : 1;
      for (let i = 0; i < count; i++) {
        let u;
        if (b.def.egg) { u = this.spawnUnit(it.id, b.owner, b.x + (i ? 12 : -12), b.y); }
        else { const [sx, sy] = this.freeSpotAround(b, ud.fly); u = this.spawnUnit(it.id, b.owner, sx + (i ? 14 : 0), sy); }
        const rr = this.rallyFor(b, u) || (b.def.egg && b.rallyFrom ? this.rallyFor(b.rallyFrom, u) : null);
        if (rr) this.applyRally(u, rr);
      }
      if (b.def.egg) { this.kill(b, null, true); }
      if (b.def.id === 'lurker_egg' || b.def.id === 'cocoon') { }
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
  cargoUsed(t) { return t.cargo.reduce((s, c) => s + (c.def.cargoSize || 1), 0); },
  loadUnit(t, u) {
    if (!t.alive || !u.alive || u.inside || u.isBuilding || u.fly) return false;
    const cap = t.def.cargo || (t.def.cargoTech && t.player.hasTech(t.def.cargoTech) ? 8 : 0); if (!cap) return false;
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
    if (amt > 0 && t.hp > 0 && !t.isBuilding && !t.def.larva && !t.def.egg) {
      const floor = t.def.hp * 0.4;
      if (t.maxHp > floor) { t.maxHp = Math.max(floor, t.maxHp - amt * 0.1); if (t.hp > t.maxHp) t.hp = t.maxHp; }
    }
    if (t.hp <= 0) this.kill(t, src);
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
    // Suppressing fire pins what it hits, and only while the fire keeps landing: a second of slow,
    // refreshed by every hit. Ranged attackers only, and never against buildings, larvae or eggs --
    // nothing that was going anywhere in the first place.
    if (src && src.suppresses && !t.isBuilding && !t.def.larva && !t.def.egg) t.fx.suppress = 24;
    if (d < 0.5) d = 0.5;
    t.hp -= d; this.onHit(t, src);
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
    // auto-retaliate: idle units that get hit attack back
    if (src && t.idle && !t.isBuilding && t.hasWeapon() && !t.def.worker && t.weaponFor(src) && this.targetable(t, src)) t.applyOrder({ type: 'attack', target: src, auto: true });
    // workers flee when attacked (mining)
    if (src && t.def.worker && t.owner !== src.owner && t.order.type === 'gather' && t.hp < t.maxHp * 0.5 && !p.human) { /* AI workers ignore */ }
  },
  kill(u, killer, silent) {
    if (!u.alive) return; u.alive = false; const p = this.players[u.owner];
    if (u.isBuilding) { if (!u.lifted) this.map.unblock(u.tx, u.ty, u.def.w, u.def.h, u.id); if (u.def.creep) this.map.recomputeCreep(this.units); if (u.def.psi) this.map.recomputePsi(u.owner, this.units); if (u.geyser) u.geyser.building = null; for (const l of u.larvae) this.kill(l, null, true); if (u.def.bunker) { while (u.cargo.length) this.unloadOne(u); } if (u.addon) { u.addon.parent = null; } if (u.parent) u.parent.addon = null; if (u.builder && u.builder.order.target === u) u.builder.nextOrder(); for (const it of u.prod) if (it.kind === 'upg' || it.kind === 'tech') p.researching.delete(it.id); }
    for (const c of u.cargo) { c.inside = null; if (!u.def.bunker) this.kill(c, killer, true); }
    if (u.launched) for (const ic of u.launched) if (ic.alive) this.kill(ic, null, true);
    if (u.parent && u.parent.launched) { const i = u.parent.launched.indexOf(u); if (i >= 0) u.parent.launched.splice(i, 1); }
    if (u.inside && u.inside.cargo) { const i = u.inside.cargo.indexOf(u); if (i >= 0) u.inside.cargo.splice(i, 1); }
    if (u.order.type === 'gather' && u.order.target && u.order.target.miner === u) u.order.target.miner = null;
    if (u.order.type === 'gather' && u.order.phase === 'inside' && u.order.target) u.order.target.occupant = null;
    if (u.hatch) { const i = u.hatch.larvae.indexOf(u); if (i >= 0) u.hatch.larvae.splice(i, 1); }
    if (killer && killer.owner !== u.owner && !silent) { killer.kills++; const kp = this.players[killer.owner]; if (u.isBuilding) kp.stats.buildingsKilled++; else kp.stats.unitsKilled++; }
    if (!silent) { if (u.isBuilding) p.stats.buildingsLost++; else p.stats.unitsLost++; }
    if (!silent && !u.halluc) { this.effects.push({ kind: u.isBuilding ? 'bigboom' : (u.def.race === 'Z' ? 'blood' : 'boom'), x: u.x, y: u.y, t: u.isBuilding ? 40 : 18, r: u.r, def: u.isBuilding ? null : u.def.id, owner: u.owner, facing: u.facing, fly: u.fly }); if (typeof Sound !== 'undefined' && this.visibleAt(this.human, u.x, u.y)) Sound.death(u); }
    if (u.def.id === 'nuke_ghost') { }
    if (typeof UI !== 'undefined') UI.onUnitDied(u);
    this.recomputeSupply();
  },

  // ---------------- commands (validated) ----------------
  queueUnit(b, uid) {
    const p = this.players[b.owner], ud = DATA.units[uid];
    if (!ud || !b.done || b.lifted) return false;
    if (!((b.def.produces || []).includes(uid) || (b.def.id === 'reaver' && uid === 'scarab') || (b.def.id === 'carrier' && uid === 'interceptor'))) return false;
    if (uid === 'scarab' || uid === 'interceptor') { const max = uid === 'scarab' ? (p.hasTech('reaver_capacity') ? 10 : 5) : (p.hasTech('carrier_capacity') ? 8 : 4); const have = (uid === 'scarab' ? b.scarabs : b.interceptors) + b.prod.length; if (have >= max) return false; }
    if (b.prod.length >= MAX_QUEUE) return false;
    if (!p.hasReq(ud)) { p.msg('Requires ' + p.missingReq(ud), 'error'); return false; }
    if (uid === 'nuke' && b.hasNuke) return false;
    if (!p.canAfford(ud.min, ud.gas)) return false;
    if (ud.sup && !ud.notUnit && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax && !(this.cheats.food && p.human)) { this.supplyRefused(p); return false; }
    p.minerals -= ud.min; p.gas -= ud.gas;
    b.prod.push({ kind: 'unit', id: uid, progress: 0, total: ud.time }); this.recomputeSupply(); return true;
  },
  larvaMorph(l, uid) {
    const p = this.players[l.owner], ud = DATA.units[uid];
    if (!l.alive || !l.def.larva) return false;
    if (!p.hasReq(ud)) { p.msg('Requires ' + p.missingReq(ud), 'error'); return false; }
    if (!p.canAfford(ud.min, ud.gas)) return false;
    if (ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax && !(this.cheats.food && p.human)) { this.supplyRefused(p); return false; }
    p.minerals -= ud.min; p.gas -= ud.gas;
    const h = l.hatch; if (h) { const i = h.larvae.indexOf(l); if (i >= 0) h.larvae.splice(i, 1); }
    l.hatch = null; l.rallyFrom = h; const ed = DATA.units.egg; l.def = ed; l.maxHp = ed.hp; l.hp = ed.hp; l.r = ed.r; l.prod = [{ kind: 'unit', id: uid, progress: 0, total: ud.time, reserved: true }];
    this.recomputeSupply(); return true;
  },
  queueUpgrade(b, uid) {
    const p = this.players[b.owner], ud = DATA.upgrades[uid]; if (!b.done || b.lifted || b.unpowered) return false;
    const lvl = p.upgLevel(uid); if (lvl >= 3 || p.researching.has(uid)) return false;
    const rq = ud.req[lvl]; if (rq && !p.hasBuilding(rq)) { p.msg('Requires ' + DATA.buildings[rq].name, 'error'); return false; }
    if (b.prod.length >= MAX_QUEUE) return false; if (!p.canAfford(ud.min[lvl], ud.gas[lvl])) return false;
    p.minerals -= ud.min[lvl]; p.gas -= ud.gas[lvl]; p.researching.add(uid);
    b.prod.push({ kind: 'upg', id: uid, level: lvl + 1, progress: 0, total: ud.time[lvl] }); return true;
  },
  queueTech(b, tid) {
    const p = this.players[b.owner], td = DATA.techs[tid]; if (!b.done || b.lifted || b.unpowered) return false;
    if (p.tech.has(tid) || p.researching.has(tid)) return false;
    if (td.req && !p.hasReq(td)) { p.msg('Requires ' + p.missingReq(td), 'error'); return false; }
    if (b.prod.length >= MAX_QUEUE) return false; if (!p.canAfford(td.min, td.gas)) return false;
    p.minerals -= td.min; p.gas -= td.gas; p.researching.add(tid);
    b.prod.push({ kind: 'tech', id: tid, progress: 0, total: td.time }); return true;
  },
  queueAddon(b, aid) {
    const p = this.players[b.owner], ad = DATA.buildings[aid]; if (!b.done || b.lifted || b.addon || b.prod.length) return false;
    if (!p.hasReq(ad)) { p.msg('Requires ' + p.missingReq(ad), 'error'); return false; }
    const tx = b.tx + b.def.w, ty = b.ty + b.def.h - 2;
    const err = this.map.canPlace(ad, tx, ty, p, this.units, null); if (err) { p.msg(err, 'error'); return false; }
    if (!p.canAfford(ad.min, ad.gas)) return false;
    p.minerals -= ad.min; p.gas -= ad.gas;
    const a = this.placeBuilding(ad, tx, ty, b.owner); a.parent = b; b.addon = a; return true;
  },
  queueMorph(b, toId) {
    const p = this.players[b.owner], nd = DATA.buildings[toId]; if (!b.done || b.prod.length) return false;
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
      if (b.def.id === 'egg') { const ed = DATA.units.larva; b.def = ed; b.maxHp = ed.hp; b.hp = ed.hp; b.r = ed.r; b.hatch = b.rallyFrom; if (b.hatch && b.hatch.alive && b.hatch.larvae.length < 3) b.hatch.larvae.push(b); else this.kill(b, null, true); }
      else { const back = b.def.id === 'lurker_egg' ? 'hydralisk' : 'mutalisk'; const ud = DATA.units[back]; b.def = ud; b.maxHp = ud.hp; b.hp = ud.hp; b.r = ud.r; b.fly = !!ud.fly; }
    }
    this.recomputeSupply();
  },
  cancelBuilding(b) {
    if (b.done) return; const p = this.players[b.owner]; p.minerals += Math.floor(b.def.min * 0.75); p.gas += Math.floor(b.def.gas * 0.75);
    if (b.def.race === 'Z' && !b.def.onGeyser && b.def.tier !== 'addon') { const d = this.spawnUnit('drone', b.owner, b.x, b.y + b.r); }
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

  // ---------------- main tick ----------------
  tick() {
    if (this.over || this.paused) return;
    if (typeof Replay !== 'undefined') Replay.applyPending();
    this.inTick = true;
    this.frame++; this.pathBudget = 40;
    this.rebuildGrid();
    if (this.frame % 3 === 0) this.updateVision();
    for (const u of this.units) { if (u.alive) { u.px = u.x; u.py = u.y; } }
    for (const u of this.units) { if (u.alive) { try { u.tick(); } catch (e) { console.error(e, u.def.id); } } }
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
    Combat.tickProjectiles(); Abilities.tickFields();
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
        const ud = DATA.units[it.id]; if (ud && ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) { stalled = true; break; }
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
          if (d.sup && p.supUsed + d.sup * (d.pair ? 2 : 1) > p.supMax) continue;
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
      if (p.defeated) continue;
      const hasB = this.units.some(u => u.alive && u.owner === p.id && u.isBuilding && !u.def.notUnit && u.def.tier !== 'addon');
      const hasU = this.units.some(u => u.alive && u.owner === p.id && !u.isBuilding && !u.def.notUnit && !u.def.larva);
      if (!hasB && (!hasU || this.frame > 24 * 60 * 3) && !(this.cheats.alive && p.human)) { p.defeated = true; p.alive = false; for (const u of this.units) if (u.alive && u.owner === p.id) this.kill(u, null, true); for (const q of this.players) if (q.human) q.msg(p.name + ' has been eliminated.'); }
    }
    if (this.freePlay) return; // player chose "continue playing" after the result screen
    const alive = this.players.filter(p => !p.defeated); const teams = new Set(alive.map(p => p.team));
    if (teams.size <= 1 && !(this.mission && !this.mission.done)) { this.over = true; this.winner = alive.length ? alive[0].id : -1; this.winTeam = alive.length ? alive[0].team : -1; }
  },
};
