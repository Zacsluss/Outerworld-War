'use strict';
// ============================================================================
// Game state container G: units, players, spatial hash, vision, production,
// spawning/killing, supply, victory.
// ============================================================================
const G = {
  map: null, pf: null, players: [], units: [], byId: new Map(), effects: [], projectiles: [], fields: [], frame: 0,
  pathBudget: 40, over: false, winner: -1, speed: 1, paused: false, human: 0, cell: 64, grid: null, gw: 0, gh: 0, alliances: null,
  nukeAlerts: [],

  init(opts) {
    UNIT_ID = 1;
    this.map = new GameMap(opts.seed || 1); this.pf = new Pathfinder(this.map);
    this.units = []; this.byId = new Map(); this.effects = []; this.projectiles = []; this.fields = []; this.frame = 0; this.over = false; this.winner = -1;
    this.gw = Math.ceil(this.map.w * TILE / this.cell); this.gh = Math.ceil(this.map.h * TILE / this.cell);
    this.grid = new Array(this.gw * this.gh).fill(null).map(() => []);
    this.players = [];
    const races = ['T', 'Z', 'P'];
    const pick = r => r === 'R' ? races[Math.floor(Math.random() * 3)] : r;
    const startOrder = opts.players.length === 2 ? [0, 3] : [0, 3, 1, 2];
    opts.players.forEach((po, i) => {
      const p = new Player(i, pick(po.race), po.human, po.name || (po.human ? 'Player' : 'Computer ' + i));
      p.vis = new Uint8Array(this.map.w * this.map.h); p.ai = po.human ? null : new AI(p, po.difficulty || 'normal');
      this.players.push(p);
      const base = this.map.starts[startOrder[i]];
      p.startBase = base; p.startX = base.cx; p.startY = base.cy;
      this.setupStart(p, base);
    });
    this.human = this.players.findIndex(p => p.human);
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
  near(x, y, r) {
    const out = []; const x0 = clamp(((x - r) / this.cell) | 0, 0, this.gw - 1), x1 = clamp(((x + r) / this.cell) | 0, 0, this.gw - 1), y0 = clamp(((y - r) / this.cell) | 0, 0, this.gh - 1), y1 = clamp(((y + r) / this.cell) | 0, 0, this.gh - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (const u of this.grid[cy * this.gw + cx]) { if (u.alive && distPt(u.x, u.y, x, y) <= r + u.r) out.push(u); }
    return out;
  },
  allied(a, b) { return a === b; },
  passable(x, y, u) {
    const m = this.map; const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!m.walkable(tx, ty)) return false;
    // check corners for units wider than a few px
    const r = Math.min(u.r, 14) * 0.6;
    if (!m.walkable(Math.floor((x - r) / TILE), ty) || !m.walkable(Math.floor((x + r) / TILE), ty) || !m.walkable(tx, Math.floor((y - r) / TILE)) || !m.walkable(tx, Math.floor((y + r) / TILE))) return false;
    return true;
  },
  separate() {
    for (const cell of this.grid) {
      if (cell.length < 2) continue;
      for (let i = 0; i < cell.length; i++) {
        const a = cell[i]; if (a.isBuilding || a.def.larva || a.burrowed || a.fly) continue;
        for (const b of this.near(a.x, a.y, a.r)) {
          if (b === a || b.isBuilding || b.def.larva || b.burrowed || b.fly || b.id < a.id) continue;
          const dx = b.x - a.x, dy = b.y - a.y; let d = Math.hypot(dx, dy); const min = (a.r + b.r) * 0.85;
          if (d >= min) continue; if (d < 0.01) { d = 0.01; }
          const push = (min - d) * 0.5 * 0.6; const ux = dx / d, uy = dy / d;
          const am = a.sieged ? 0 : 1, bm = b.sieged ? 0 : 1;
          const ax = a.x - ux * push * am, ay = a.y - uy * push * am, bx = b.x + ux * push * bm, by = b.y + uy * push * bm;
          if (am && this.passable(ax, ay, a)) { a.x = ax; a.y = ay; }
          if (bm && this.passable(bx, by, b)) { b.x = bx; b.y = by; }
        }
      }
    }
  },
  nudgeOut(u, b) { const x0 = b.tx * TILE, y0 = b.ty * TILE, x1 = x0 + b.def.w * TILE, y1 = y0 + b.def.h * TILE; if (u.x > x0 - u.r && u.x < x1 + u.r && u.y > y0 - u.r && u.y < y1 + u.r) { const t = this.map.findFreeTile(Math.floor(u.x / TILE), Math.floor(u.y / TILE), 8); if (t) { u.x = (t[0] + .5) * TILE; u.y = (t[1] + .5) * TILE; } } },

  // ---------------- visibility ----------------
  visible(pid, tx, ty) { const p = this.players[pid]; return p && p.vis[ty * this.map.w + tx] === 2; },
  visibleAt(pid, x, y) { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return this.map.inb(tx, ty) && this.visible(pid, tx, ty); },
  explored(pid, tx, ty) { return this.players[pid].vis[ty * this.map.w + tx] > 0; },
  detected(u, pid) { return (u.detBy[pid] || -99) >= this.frame - 8; },
  canSee(pid, u) { if (u.owner === pid) return true; if (u.fx.parasite === pid) return true; if (!this.visibleAt(pid, u.x, u.y)) return false; if (u.isCloaked && !this.detected(u, pid)) return false; return true; },
  targetable(att, t) { if (!t.alive || t.inside) return false; if (t.fx.stasis > 0) return false; if (t.owner === att.owner) return true; return this.canSee(att.owner, t); },
  circles: {},
  circle(r) { if (this.circles[r]) return this.circles[r]; const o = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) o.push([dx, dy]); return this.circles[r] = o; },
  updateVision() {
    const m = this.map;
    for (const p of this.players) {
      const v = p.vis; for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1;
      const mark = (ux, uy, r, uh) => { const tx = Math.floor(ux / TILE), ty = Math.floor(uy / TILE); for (const [dx, dy] of this.circle(r)) { const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue; const i = y * m.w + x; if (m.height[i] <= uh || (m.height[i] === 2 && uh === 1 && false)) v[i] = 2; } };
      for (const u of this.units) { if (!u.alive || u.inside) continue; if (u.owner === p.id || u.fx.parasite === p.id) mark(u.x, u.y, u.sight, u.heightLevel()); }
      for (const f of this.fields) if (f.kind === 'scan' && f.owner === p.id) mark(f.x, f.y, 10, 2);
    }
    // detection
    for (const u of this.units) { if (!u.alive || !u.isDetector) continue; const r = u.sight * TILE; for (const t of this.near(u.x, u.y, r)) if (t.owner !== u.owner && t.isCloaked) t.detBy[u.owner] = this.frame; }
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
    if (b.def.creep) this.map.recomputeCreep(this.units);
    if (b.def.psi) this.map.recomputePsi(b.owner, this.units);
    
    if (b.builder && b.builder.alive && b.builder.order.type === 'construct' && b.builder.order.target === b) { const w = b.builder; w.nextOrder(); if (w.order.type === 'idle' && w.lastRes) { const r = w.lastRes; if ((r.type === 'mineral' && r.amount > 0) || (r.type === 'gas' && r.alive)) w.applyOrder({ type: 'gather', target: r, phase: 'goto' }); } }
    b.builder = null;
    if (b.def.tier === 'addon' && b.parent) { b.parent.addon = b; }
    if (b.def.onGeyser) { b.alive = true; b.type = 'gas'; }
    this.recomputeSupply();
  },
  spawnLarva(h) { const l = this.spawnUnit('larva', h.owner, h.x - 30 + Math.random() * 60, h.y + h.def.h / 2 * TILE + 14); l.hatch = h; h.larvae.push(l); },
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
        if (b.rally) this.applyRally(u, b.rally);
        else if (b.def.egg && b.rallyFrom && b.rallyFrom.rally) this.applyRally(u, b.rallyFrom.rally);
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
    if (r.res && u.def.worker) { u.applyOrder({ type: 'gather', target: r.res, phase: 'goto' }); return; }
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
  landBuilding(b, tx, ty) { const err = this.map.canPlace(b.def, tx, ty, b.player, this.units, b); if (err) { b.player.msg(err, 'error'); b.order = { type: 'idle' }; return; } b.lifted = false; b.fly = false; b.tx = tx; b.ty = ty; b.x = (tx + b.def.w / 2) * TILE; b.y = (ty + b.def.h / 2) * TILE; this.map.block(tx, ty, b.def.w, b.def.h, b.id); b.order = { type: 'idle' }; for (const u of this.units) if (u.alive && !u.isBuilding && !u.fly) this.nudgeOut(u, b); this.recomputeSupply(); },
  liftBuilding(b) { if (!b.def.canLift || b.prod.length || (b.addon && !b.addon.done)) return; b.lifted = true; b.fly = true; this.map.unblock(b.tx, b.ty, b.def.w, b.def.h, b.id); b.order = { type: 'idle' }; if (b.addon) { b.addon.parent = null; b.addon = null; } this.recomputeSupply(); },

  // ---------------- transports ----------------
  cargoUsed(t) { return t.cargo.reduce((s, c) => s + (c.def.cargoSize || 1), 0); },
  loadUnit(t, u) {
    if (!t.alive || !u.alive || u.inside || u.isBuilding || u.fly) return false;
    const cap = t.def.cargo || (t.def.cargoTech && t.player.hasTech(t.def.cargoTech) ? 8 : 0); if (!cap) return false;
    if (t.def.bunker && !['marine', 'firebat', 'ghost', 'medic', 'scv'].includes(u.def.id)) return false;
    if (this.cargoUsed(t) + (u.def.cargoSize || 1) > cap) { t.player.msg('Transport is full.', 'error'); u.nextOrder(); return false; }
    if (u.order.type === 'gather' && u.order.target && u.order.target.miner === u) u.order.target.miner = null;
    u.inside = t; t.cargo.push(u); u.order = { type: 'idle' }; u.queue = []; u.path = null; u.target = null; u.sieged = false; u.burrowed = false; return true;
  },
  unloadOne(t) {
    const u = t.cargo.shift(); if (!u) return;
    let x = t.x, y = t.y;
    if (t.isBuilding) { const s = this.freeSpotAround(t, false); x = s[0]; y = s[1]; }
    else { const tl = this.map.findFreeTile(Math.floor(t.x / TILE), Math.floor(t.y / TILE), 4); if (!tl) { t.cargo.unshift(u); return; } x = (tl[0] + .5) * TILE; y = (tl[1] + .5) * TILE; }
    u.inside = null; u.x = x; u.y = y; u.px = x; u.py = y; u.order = { type: 'idle' };
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
  removeResource(r) { r.amount = 0; this.map.unblock(r.x, r.y, r.w, r.h, -2); this.map.rect(r.x, r.y, r.w, r.h, (x, y) => { if (this.map.blocked[this.map.idx(x, y)] === -2) this.map.blocked[this.map.idx(x, y)] = -1; }); const i = this.map.resources.indexOf(r); if (i >= 0) this.map.resources.splice(i, 1); },

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
    for (const p of this.players) p.supMax = Math.min(200, p.supMax);
  },

  // ---------------- damage & death ----------------
  damageRaw(t, amt, src) { if (!t.alive || t.fx.stasis > 0) return; if (t.sh > 0) { const s = Math.min(t.sh, amt); t.sh -= s; amt -= s; } t.hp -= amt; if (src) { t.lastHit = this.frame; t.lastHitBy = src; } if (t.hp <= 0) this.kill(t, src); },
  damage(t, dmg, type, src, opts = {}) {
    if (!t.alive || t.fx.stasis > 0) return 0;
    if (t.halluc) dmg *= 2;
    if (t.fx.matrix) { const ab = Math.min(t.fx.matrix.hp, dmg); t.fx.matrix.hp -= ab; dmg -= ab; if (t.fx.matrix.hp <= 0) t.fx.matrix = null; if (dmg <= 0) return 0; }
    let d = dmg; const p = this.players[t.owner];
    if (t.sh > 0) { d -= p.upgLevel('shields'); if (d < 0.5) d = 0.5; if (d <= t.sh) { t.sh -= d; this.onHit(t, src); return d; } d -= t.sh; t.sh = 0; }
    d = (d - t.armor) * (DMG_MULT[type] || DMG_MULT.normal)[t.def.size || 'medium']; if (d < 0.5) d = 0.5;
    t.hp -= d; this.onHit(t, src);
    if (t.hp <= 0) this.kill(t, src);
    return d;
  },
  onHit(t, src) {
    t.lastHit = this.frame; if (src) t.lastHitBy = src;
    const p = this.players[t.owner];
    if (p.human && src && src.owner !== t.owner) { if (this.frame - (p.lastAttackAlert || -9999) > 24 * 20) { p.lastAttackAlert = this.frame; p.msg(t.isBuilding || t.def.worker ? 'Your base is under attack.' : 'Your forces are under attack.', 'attack'); if (typeof UI !== 'undefined') UI.ping(t.x, t.y); } }
    // auto-retaliate: idle units that get hit attack back
    if (src && t.idle && !t.isBuilding && t.hasWeapon() && !t.def.worker && t.weaponFor(src) && this.targetable(t, src)) t.applyOrder({ type: 'attack', target: src, auto: true });
    // workers flee when attacked (mining)
    if (src && t.def.worker && t.owner !== src.owner && t.order.type === 'gather' && t.hp < t.maxHp * 0.5 && !p.human) { /* AI workers ignore */ }
  },
  kill(u, killer, silent) {
    if (!u.alive) return; u.alive = false; const p = this.players[u.owner];
    if (u.isBuilding) { if (!u.lifted) this.map.unblock(u.tx, u.ty, u.def.w, u.def.h, u.id); if (u.def.creep) this.map.recomputeCreep(this.units); if (u.def.psi) this.map.recomputePsi(u.owner, this.units); if (u.geyser) u.geyser.building = null; for (const l of u.larvae) this.kill(l, null, true); if (u.def.bunker) { while (u.cargo.length) this.unloadOne(u); } if (u.addon) { u.addon.parent = null; } if (u.parent) u.parent.addon = null; if (u.builder && u.builder.order.target === u) u.builder.nextOrder(); for (const it of u.prod) if (it.kind === 'upg' || it.kind === 'tech') p.researching.delete(it.id); }
    for (const c of u.cargo) { c.inside = null; if (!u.def.bunker) this.kill(c, killer, true); }
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
    if (ud.sup && !ud.notUnit && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) { p.msg(RACE_INFO[p.race].supplyMsg, 'error'); return false; }
    p.minerals -= ud.min; p.gas -= ud.gas;
    b.prod.push({ kind: 'unit', id: uid, progress: 0, total: ud.time }); this.recomputeSupply(); return true;
  },
  larvaMorph(l, uid) {
    const p = this.players[l.owner], ud = DATA.units[uid];
    if (!l.alive || !l.def.larva) return false;
    if (!p.hasReq(ud)) { p.msg('Requires ' + p.missingReq(ud), 'error'); return false; }
    if (!p.canAfford(ud.min, ud.gas)) return false;
    if (ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) { p.msg(RACE_INFO[p.race].supplyMsg, 'error'); return false; }
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
  setRally(b, x, y, target) { if (!b.isBuilding || !(b.def.produces.length || b.def.spawnsLarva)) return; const res = target ? null : this.map.resourceAt(Math.floor(x / TILE), Math.floor(y / TILE)); b.rally = { x, y, target: target && target.alive ? target : null, res }; },

  // ---------------- main tick ----------------
  tick() {
    if (this.over || this.paused) return;
    this.frame++; this.pathBudget = 40;
    this.rebuildGrid();
    if (this.frame % 3 === 0) this.updateVision();
    for (const u of this.units) { if (u.alive) { u.px = u.x; u.py = u.y; } }
    for (const u of this.units) { if (u.alive) { try { u.tick(); } catch (e) { console.error(e, u.def.id); } } }
    this.separate();
    Combat.tickProjectiles(); Abilities.tickFields();
    for (const p of this.players) if (p.ai && this.frame % 4 === p.id % 4) p.ai.tick();
    if (this.frame % 8 === 0) this.recomputeSupply();
    if (this.frame % 24 === 0) { this.units = this.units.filter(u => u.alive); this.checkVictory(); }
    for (let i = this.effects.length - 1; i >= 0; i--) { if (--this.effects[i].t <= 0) this.effects.splice(i, 1); }
  },
  checkVictory() {
    for (const p of this.players) {
      if (p.defeated) continue;
      const hasB = this.units.some(u => u.alive && u.owner === p.id && u.isBuilding && !u.def.notUnit && u.def.tier !== 'addon');
      const hasU = this.units.some(u => u.alive && u.owner === p.id && !u.isBuilding && !u.def.notUnit && !u.def.larva);
      if (!hasB && (!hasU || this.frame > 24 * 60 * 3)) { p.defeated = true; p.alive = false; for (const u of this.units) if (u.alive && u.owner === p.id) this.kill(u, null, true); for (const q of this.players) if (q.human) q.msg(p.name + ' has been eliminated.'); }
    }
    const alive = this.players.filter(p => !p.defeated);
    if (alive.length <= 1) { this.over = true; this.winner = alive.length ? alive[0].id : -1; }
  },
};
