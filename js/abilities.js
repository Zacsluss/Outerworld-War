'use strict';
// ============================================================================
// Abilities & spells, status fields, auto-cast behaviours.
// ============================================================================
const HOVER = new Set(['vulture', 'probe', 'archon', 'dark_archon']);
const NO_BROODLING = new Set(['probe', 'reaver', 'dragoon', 'archon', 'dark_archon', 'ultralisk', 'scv']);
const Abilities = {
  // Is ability usable/visible for this unit right now?
  available(u, id) {
    const ab = DATA.abilities[id]; if (!ab) return false; const p = u.player;
    if (ab.tech && !p.hasTech(ab.tech) && !(id === 'burrow' && u.def.id === 'lurker')) return false;
    if (id === 'nuke' && p.nukes <= 0) return false;
    if (id === 'spider_mine' && u.mines <= 0) return false;
    if (id === 'unload' && !u.cargo.length) return false;
    if (id === 'lurker_aspect' || id === 'guardian_aspect' || id === 'devourer_aspect') { const ud = DATA.units[ab.unit]; if (!p.hasReq(ud)) return false; }
    if ((id === 'guardian_aspect' || id === 'devourer_aspect') && !p.hasBuilding('greater_spire')) return false;
    return true;
  },
  label(u, id) { const ab = DATA.abilities[id]; if (id === 'siege_mode') return u.sieged ? 'Tank Mode' : 'Siege Mode'; if (id === 'burrow') return u.burrowed ? 'Unburrow' : 'Burrow'; if (id === 'cloak_ghost' || id === 'cloak_wraith') return u.cloaked ? 'Decloak' : ab.name; return ab.name; },
  needsTarget(id) { const k = DATA.abilities[id].kind; return k === 'unit' || k === 'point'; },
  // Entry point from UI/AI. For unit/point kinds target/x/y must be supplied.
  issue(u, id, target, x, y, shift) {
    const ab = DATA.abilities[id], p = u.player; if (!u.alive || !this.available(u, id)) return false;
    if (u.disabled) return false;
    if (ab.energy && u.energy < ab.energy) { p.msg('Not enough energy.', 'error'); return false; }
    switch (ab.kind) {
      case 'toggle': case 'instant': return this.instant(u, id);
      case 'morph': return this.morph(u, ab.unit);
      case 'produce': return G.queueUnit(u, ab.unit);
      case 'unit': if (!target) return false; if (target === u && id !== 'consume') return false; u.setOrder({ type: 'ability', abil: id, target, x: target.x, y: target.y }, shift); return true;
      case 'point': if (u.isBuilding) { if (ab.energy) u.energy -= ab.energy; this.cast(u, id, null, x, y); return true; } u.setOrder({ type: 'ability', abil: id, x, y }, shift); return true;
    }
    return false;
  },
  instant(u, id) {
    const p = u.player, ab = DATA.abilities[id];
    switch (id) {
      case 'stim': if (u.hp <= 10 || u.stim > 200) return false; u.hp -= 10; u.stim = 300; return true;
      case 'siege_mode': if (u.transT > 0) return false; u.sieged = !u.sieged; u.transT = 40; u.path = null; if (u.sieged) u.order = { type: 'hold' }; else u.order = { type: 'idle' }; return true;
      case 'burrow': if (u.transT > 0) return false; u.burrowed = !u.burrowed; u.transT = 24; u.path = null; u.order = { type: u.burrowed ? 'hold' : 'idle' }; u.queue = []; return true;
      case 'cloak_ghost': case 'cloak_wraith': if (u.cloaked) { u.cloaked = false; return true; } if (u.energy < 25) { p.msg('Not enough energy.', 'error'); return false; } u.energy -= 25; u.cloaked = true; return true;
      case 'unload': G.unloadAll(u); return true;
    }
    return false;
  },
  morph(u, toId) {
    const p = u.player, ud = DATA.units[toId];
    if (!p.hasReq(ud)) { p.msg('Requires ' + p.missingReq(ud), 'error'); return false; }
    if (!p.canAfford(ud.min, ud.gas)) return false;
    const extra = ud.sup - u.def.sup; if (extra > 0 && p.supUsed + extra > p.supMax && !(G.cheats.food && p.human)) { p.msg(RACE_INFO.Z.supplyMsg, 'error'); return false; }
    p.minerals -= ud.min; p.gas -= ud.gas; G.morphUnit(u, toId); return true;
  },
  // Pair up selected units for Archon / Dark Archon merging
  merge(units, id) {
    const ab = DATA.abilities[id]; const want = id === 'summon_archon' ? 'high_templar' : 'dark_templar';
    const list = units.filter(x => x.alive && x.def.id === want && !x.disabled);
    for (let i = 0; i + 1 < list.length; i += 2) { const a = list[i], b = list[i + 1]; a.setOrder({ type: 'merge', partner: b, unit: ab.unit }); b.setOrder({ type: 'merge', partner: a, unit: ab.unit }); }
    return list.length >= 2;
  },
  // ---------------- ability order execution ----------------
  orderTick(u) {
    const o = u.order, ab = DATA.abilities[o.abil], p = u.player;
    const t = o.target; if (t && (!t.alive || (t.owner !== u.owner && !G.canSee(u.owner, t) && o.abil !== 'consume'))) { u.nextOrder(); return; }
    const tx = t ? t.x : o.x, ty = t ? t.y : o.y; const range = (ab.range || 1) * TILE + (t ? t.r : 0) + u.r;
    if (o.phase === 'channel') { this.channel(u, o); return; }
    if (distPt(u.x, u.y, tx, ty) > range) { if (!u.canMove || u.sieged || u.burrowed) { u.nextOrder(); return; } u.moveTo(tx, ty, t); return; }
    u.facing = Math.atan2(ty - u.y, tx - u.x); u.path = null;
    if (ab.energy && u.energy < ab.energy) { p.msg('Not enough energy.', 'error'); u.nextOrder(); return; }
    if (o.abil === 'heal') { this.healTick(u, t); return; }
    if (o.abil === 'yamato' || o.abil === 'nuke' || o.abil === 'recall') { o.phase = 'channel'; o.t = o.abil === 'yamato' ? 50 : o.abil === 'nuke' ? 336 : 30; if (o.abil === 'nuke') { if (p.nukes <= 0) { u.nextOrder(); return; } p.nukes--; const silo = G.units.find(b => b.alive && b.owner === u.owner && b.def.id === 'nuclear_silo' && b.hasNuke); if (silo) silo.hasNuke = false; G.fields.push({ kind: 'nuke_target', x: o.x, y: o.y, r: 8, t: 336, owner: u.owner, ghost: u }); for (const q of G.players) if (q.id !== u.owner) { q.msg('Nuclear launch detected.', 'nuke'); if (q.human && typeof UI !== 'undefined') UI.ping(o.x, o.y); } if (typeof Sound !== 'undefined') Sound.nuke(); } if (o.abil === 'recall') { u.energy -= ab.energy; G.fields.push({ kind: 'recall', x: o.x, y: o.y, r: 2.5, t: 30, owner: u.owner, src: u }); u.nextOrder(); } return; }
    if (ab.energy) u.energy -= ab.energy;
    this.cast(u, o.abil, t, tx, ty);
    u.nextOrder();
  },
  channel(u, o) {
    if (o.abil === 'yamato') { if (--o.t <= 0) { const t = o.target; if (t && t.alive) { u.energy -= 150; G.projectiles.push({ kind: 'yamato', x: u.x, y: u.y, target: t, owner: u.owner, src: u, life: 60, spd: 12 }); u.cooldown = 30; } u.nextOrder(); } else G.effects.push({ kind: 'charge', x: u.x, y: u.y, t: 2, r: 20 }); return; }
    if (o.abil === 'nuke') { const f = G.fields.find(f => f.kind === 'nuke_target' && f.ghost === u); if (!f) { u.nextOrder(); return; } if (u.fx.lockdown > 0 || u.fx.stasis > 0) { f.t = 0; f.cancel = true; u.nextOrder(); return; } if (f.t <= 1) u.nextOrder(); return; }
  },
  healTick(u, t) {
    if (!t || !t.alive || !t.def.bio || t.isBuilding) { u.nextOrder(); return; }
    if (t.hp >= t.maxHp || u.energy < 0.25) { u.nextOrder(); return; }
    const amt = Math.min(0.5, t.maxHp - t.hp); t.hp += amt; u.energy -= amt / 2;
    if ((G.frame & 3) === 0) G.effects.push({ kind: 'heal', x: t.x, y: t.y - 8, t: 4 });
  },
  medicAuto(u) {
    if (u.energy < 1 || u.disabled) return;
    if (!(u.order.type === 'idle' || u.order.type === 'attackmove' || u.order.type === 'follow' || u.order.type === 'hold')) return;
    let best = null, bd = 1e9;
    for (const t of G.near(u.x, u.y, 6 * TILE)) { if (t === u || t.owner !== u.owner || !t.def.bio || t.isBuilding || t.hp >= t.maxHp || t.inside || t.def.egg || t.def.larva) continue; const d = dist(u, t); if (d < bd) { bd = d; best = t; } }
    if (!best) return;
    if (u.order.type === 'idle') { u.applyOrder({ type: 'ability', abil: 'heal', target: best, x: best.x, y: best.y }); return; }
    if (bd <= u.r + best.r + TILE) { const amt = Math.min(4, best.maxHp - best.hp); best.hp += amt; u.energy -= amt / 2; G.effects.push({ kind: 'heal', x: best.x, y: best.y - 8, t: 6 }); }
  },
  batteryAuto(b) {
    if (b.unpowered) return; let best = null, bd = 1e9;
    for (const t of G.near(b.x, b.y, 6 * TILE)) { if (t.owner !== b.owner || t.isBuilding || t.sh >= t.maxSh || !t.maxSh) continue; const d = dist(b, t); if (d < bd) { bd = d; best = t; } }
    if (!best) return; const amt = Math.min(2, best.maxSh - best.sh, b.energy * 2); best.sh += amt; b.energy -= amt / 2; if ((G.frame & 3) === 0) G.effects.push({ kind: 'line', x: b.x, y: b.y, tx: best.x, ty: best.y, t: 3, color: '#6af' });
  },
  repairTick(u) {
    const t = u.order.target; const p = u.player;
    if (!t || !t.alive || (!t.def.mech && !t.isBuilding) || t.owner !== u.owner || t.hp >= t.maxHp || (t.isBuilding && !t.done)) { u.nextOrder(); return; }
    if (!(t.isBuilding ? u.moveToRect(t, 6) : dist(u, t) <= u.r + t.r + 8)) { if (!t.isBuilding) u.moveTo(t.x, t.y, t); return; }
    const rate = t.maxHp / Math.max(200, t.def.time * 0.6); const frac = rate / t.maxHp;
    const cm = t.def.min * 0.25 * frac, cg = t.def.gas * 0.25 * frac;
    u.repairAcc = (u.repairAcc || 0) + cm; u.repairAccG = (u.repairAccG || 0) + cg;
    if (u.repairAcc >= 1) { if (p.minerals < 1) { p.msg('Not enough minerals.', 'error'); u.nextOrder(); return; } p.minerals -= 1; u.repairAcc -= 1; }
    if (u.repairAccG >= 1) { if (p.gas < 1) { p.msg('Not enough vespene gas.', 'error'); u.nextOrder(); return; } p.gas -= 1; u.repairAccG -= 1; }
    t.hp = Math.min(t.maxHp, t.hp + rate); if ((G.frame & 3) === 0) G.effects.push({ kind: 'spark', x: t.x + (G.rand() - .5) * t.r, y: t.y + (G.rand() - .5) * t.r, t: 4 });
  },
  mineTick(u) {
    if (!u.armT) u.armT = 0;
    if (u.burrowed) {
      u.armT++; if (u.armT < 60 || (G.frame + u.id) % 4) return;
      for (const t of G.near(u.x, u.y, 3 * TILE)) { if (t.owner === u.owner || t.fly || t.isBuilding || HOVER.has(t.def.id) || !t.alive || t.inside || t.burrowed) continue; if (!G.canSee(u.owner, t) && !G.targetable(u, t)) continue; u.burrowed = false; u.target = t; break; }
      return;
    }
    const t = u.target; if (!t || !t.alive) { u.burrowed = true; u.armT = 0; return; }
    if (dist(u, t) <= u.r + t.r + 4) { Combat.explode(u, t, u.def.gw); return; }
    const ang = Math.atan2(t.y - u.y, t.x - u.x); u.x += Math.cos(ang) * 16; u.y += Math.sin(ang) * 16; u.facing = ang;
  },
  scarabTick(u) { const t = u.order.target, p = u.parent; if (!t || !t.alive || !p) { G.kill(u, null, true); return; } if (dist(u, t) <= u.r + t.r + 10) { const w = p.def.gw; Combat.splash(p.alive ? p : u, t.x, t.y, (p.alive ? p.wDmg(w) : w.dmg), w, t); G.kill(u, null, true); return; } u.moveTo(t.x, t.y, t); },
  interceptTick(u) {
    const o = u.order, t = o.target, p = u.parent;
    if (!p || !p.alive) { G.kill(u, null, true); return; }
    if (!t || !t.alive || !G.targetable(u, t) || dist(u, p) > 14 * TILE) { u.applyOrder({ type: 'dock' }); return; }
    if (o.pass) { if (u.moveTo(o.pass.x, o.pass.y)) o.pass = null; return; }
    const w = u.def.gw; const dd = dist(u, t) - t.r - u.r;
    if (dd <= u.wRange(w) * TILE) { if (u.cooldown <= 0) { u.fireAt(t); const a = Math.atan2(t.y - u.y, t.x - u.x) + (G.rand() - .5) * 0.8; o.pass = { x: t.x + Math.cos(a) * 130, y: t.y + Math.sin(a) * 130 }; } else u.moveTo(t.x + Math.cos(u.facing + 1.2) * 60, t.y + Math.sin(u.facing + 1.2) * 60); }
    else u.moveTo(t.x, t.y, t);
  },
  dockTick(u) { const p = u.parent; if (!p || !p.alive) { G.kill(u, null, true); return; } if (dist(u, p) <= p.r) { p.interceptors = Math.min(p.interceptors + 1, 8); G.kill(u, null, true); return; } u.moveTo(p.x, p.y, p); },
  inField(x, y, kind) { for (const f of G.fields) if (f.kind === kind && distPt(x, y, f.x, f.y) <= f.r * TILE) return f; return null; },
  // ---------------- spell effects ----------------
  cast(u, id, t, x, y) {
    const p = u.player;
    const ring = (r, color) => G.effects.push({ kind: 'ring', x, y, r: r * TILE, t: 14, color });
    switch (id) {
      case 'restoration': for (const k of ['ensnare', 'plague', 'irradiate', 'lockdown', 'blind', 'maelstrom']) t.fx[k] = 0; t.fx.parasite = undefined; t.acidSpores = 0; ring(0.5, '#8f8'); break;
      case 'optical_flare': t.fx.blind = 1e9; ring(0.5, '#fff'); break;
      case 'lockdown': if (!t.def.mech || t.isBuilding) { p.msg('Lockdown only affects mechanical units.', 'error'); u.energy += 100; break; } t.fx.lockdown = 1000; t.path = null; ring(0.6, '#f88'); break;
      case 'spider_mine': { const m = G.spawnUnit('spider_mine', u.owner, x, y); m.burrowed = true; m.armT = 0; u.mines--; break; }
      case 'defensive_matrix': t.fx.matrix = { hp: 250, t: 1440 }; ring(0.6, '#8cf'); break;
      case 'emp': for (const o of G.near(x, y, 3 * TILE)) { o.energy = 0; o.sh = 0; } ring(3, '#adf'); break;
      case 'irradiate': t.fx.irradiate = 720; ring(0.5, '#8f4'); break;
      case 'scanner_sweep': G.fields.push({ kind: 'scan', x, y, r: 10, t: 288, owner: u.owner }); break;
      case 'parasite': t.fx.parasite = u.owner; ring(0.5, '#f8f'); break;
      case 'ensnare': for (const o of G.near(x, y, 2 * TILE)) if (!o.isBuilding) o.fx.ensnare = 576; ring(2, '#8f8'); break;
      case 'spawn_broodling': if (t.fly || t.isBuilding || NO_BROODLING.has(t.def.id) || t.def.race === 'P' && t.def.mech) { p.msg('Invalid target.', 'error'); u.energy += 150; break; } G.kill(t, u); for (let i = 0; i < 2; i++) { const b = G.spawnUnit('broodling', u.owner, t.x + (i ? 10 : -10), t.y); b.lifetime = 1800; } break;
      case 'dark_swarm': G.fields.push({ kind: 'swarm', x, y, r: 3, t: 900, owner: u.owner }); break;
      case 'plague': for (const o of G.near(x, y, 2 * TILE)) o.fx.plague = 600; ring(2, '#f80'); break;
      case 'consume': if (!t || t.owner !== u.owner || t.isBuilding || t.def.larva || t.def.egg || t === u) { p.msg('Invalid target.', 'error'); break; } G.kill(t, null, true); u.energy = Math.min(u.maxEnergy, u.energy + 50); break;
      case 'psi_storm': if (this.inField(x, y, 'storm')) { u.energy += 75; break; } G.fields.push({ kind: 'storm', x, y, r: 1.5, t: 64, owner: u.owner, tickT: 0 }); break;
      case 'hallucination': if (t.isBuilding || t.def.larva || t.def.egg || t.def.notUnit) { p.msg('Invalid target.', 'error'); u.energy += 100; break; } for (let i = 0; i < 2; i++) { const h = G.spawnUnit(t.def.id, u.owner, t.x + (i ? 20 : -20), t.y); h.halluc = true; h.lifetime = 1000; h.hp = t.maxHp; h.sh = t.maxSh; h.energy = 0; h.maxEnergy = 0; } break;
      case 'feedback': if (!t.maxEnergy) { p.msg('Target has no energy.', 'error'); u.energy += 50; break; } { const e = t.energy; t.energy = 0; G.damageRaw(t, e, u); ring(0.5, '#f4f'); } break;
      case 'mind_control': if (t.isBuilding || t.owner === u.owner || t.def.larva || t.def.egg) { p.msg('Invalid target.', 'error'); u.energy += 150; break; } this.changeOwner(t, u.owner); u.sh = 0; ring(0.6, '#f4f'); break;
      case 'maelstrom': for (const o of G.near(x, y, 1.5 * TILE)) if (o.def.bio && !o.isBuilding) { o.fx.maelstrom = 144; o.path = null; } ring(1.5, '#f4f'); break;
      case 'disruption_web': G.fields.push({ kind: 'dweb', x, y, r: 2.5, t: 576, owner: u.owner }); break;
      case 'stasis_field': for (const o of G.near(x, y, 1.5 * TILE)) if (!o.isBuilding) { o.fx.stasis = 720; o.path = null; } ring(1.5, '#8cf'); break;
      case 'infest': { if (!t || t.def.id !== 'command_center' || !t.done || t.hp >= t.maxHp * 0.5 || t.lifted) { p.msg('Only a damaged, landed Command Center can be infested.', 'error'); break; } if (t.addon) { t.addon.parent = null; t.addon = null; } for (const it of t.prod) if (it.kind === 'upg' || it.kind === 'tech') G.players[t.owner].researching.delete(it.id); t.prod = []; t.rally = null; while (t.cargo.length) G.unloadOne(t); const od = G.players[t.owner]; t.owner = u.owner; t.def = DATA.buildings.infested_command_center; t.maxHp = t.def.hp; t.done = true; G.recomputeSupply(); if (od.human) od.msg('Your Command Center has been infested!', 'attack'); if (p.human) p.msg('Command Center infested.'); ring(1, '#c4f'); break; }
      case 'nydus_exit': { const def = DATA.buildings.nydus_canal; const tx = Math.floor(x / TILE - def.w / 2 + .5), ty = Math.floor(y / TILE - def.h / 2 + .5); const err = G.map.canPlace(def, tx, ty, p, G.units, null); if (err) { p.msg(err, 'error'); break; } const e = G.placeBuilding(def, tx, ty, u.owner); e.nydusLink = u; u.nydusLink = e; break; }
    }
  },
  changeOwner(t, pid) { if (t.order.type === 'gather' && t.order.target && t.order.target.miner === t) t.order.target.miner = null; if (t.order.type === 'gather' && t.order.phase === 'inside' && t.order.target) { t.order.target.occupant = null; t.inside = null; } if (t.order.type === 'construct' && t.order.target && t.order.target.builder === t) t.order.target.builder = null; t.owner = pid; t.order = { type: 'idle' }; t.queue = []; t.path = null; t.target = null; t.carrying = null; t.wave = 0; if (typeof UI !== 'undefined' && UI.onUnitDied) UI.onUnitDied(t); G.recomputeSupply(); if (t.player.human) t.player.msg('Unit mind controlled.'); },
  nukeImpact(p) { },
  tickFields() {
    const fs = G.fields;
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i]; f.t--;
      if (f.kind === 'storm') { if (++f.tickT % 8 === 0) for (const o of G.near(f.x, f.y, f.r * TILE)) if (!o.isBuilding) G.damageRaw(o, 14, null); }
      else if (f.kind === 'dweb') { for (const o of G.near(f.x, f.y, f.r * TILE)) if (!o.fly) o.fx.dweb = 3; }
      else if (f.kind === 'recall' && f.t <= 0) { const src = f.src; if (src && src.alive) for (const o of G.near(f.x, f.y, f.r * TILE)) if (o.owner === f.owner && !o.isBuilding && !o.inside) { const tl = G.map.findFreeTile(Math.floor(src.x / TILE), Math.floor(src.y / TILE), 5); if (tl) { o.x = (tl[0] + .5) * TILE; o.y = (tl[1] + .5) * TILE; o.px = o.x; o.py = o.y; o.path = null; G.effects.push({ kind: 'ring', x: o.x, y: o.y, r: 16, t: 10, color: '#8cf' }); } } }
      else if (f.kind === 'nuke_target' && f.t <= 0 && !f.cancel) {
        G.effects.push({ kind: 'nuke', x: f.x, y: f.y, t: 60, r: 4 * TILE });
        for (const o of G.near(f.x, f.y, 4.5 * TILE)) { const d = distPt(o.x, o.y, f.x, f.y) / TILE; const m = d <= 3 ? 1 : 0.5; const dmg = Math.max(500, o.maxHp * 2 / 3) * m; G.damageRaw(o, dmg, f.ghost); }
        if (typeof Sound !== 'undefined') Sound.boom();
      }
      if (f.t <= 0) fs.splice(i, 1);
    }
  },
};
