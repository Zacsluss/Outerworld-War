'use strict';
// ============================================================================
// Computer opponent: scripted opening, macro loop, army control, basic micro.
// ============================================================================
const AI_SCRIPTS = {
  T: [[9, 'supply_depot'], [11, 'barracks'], [12, 'refinery'], [15, 'supply_depot'], [16, 'factory'], [19, 'supply_depot'], [20, 'machine_shop'], [22, 'academy'], [23, 'command_center'], [24, 'engineering_bay'], [26, 'supply_depot'], [28, 'factory'], [30, 'comsat_station'], [32, 'armory'], [34, 'supply_depot'], [36, 'starport'], [38, 'barracks'], [40, 'machine_shop'], [42, 'control_tower'], [44, 'science_facility'], [46, 'command_center'], [50, 'factory'], [56, 'missile_turret'], [60, 'physics_lab'], [64, 'starport'], [70, 'barracks'], [80, 'factory']],
  Z: [[11, 'spawning_pool'], [12, 'hatchery'], [13, 'extractor'], [16, 'creep_colony'], [17, 'hydralisk_den'], [18, 'creep_colony'], [20, 'hatchery'], [22, 'lair'], [23, 'evolution_chamber'], [26, 'hatchery'], [28, 'extractor'], [30, 'creep_colony'], [34, 'spire'], [36, 'hatchery'], [44, 'queens_nest'], [48, 'extractor'], [52, 'hive'], [56, 'creep_colony'], [60, 'ultralisk_cavern'], [64, 'hatchery'], [66, 'defiler_mound'], [70, 'greater_spire'], [80, 'hatchery']],
  P: [[8, 'pylon'], [10, 'gateway'], [12, 'assimilator'], [14, 'cybernetics_core'], [15, 'pylon'], [18, 'gateway'], [20, 'nexus'], [22, 'pylon'], [24, 'citadel_of_adun'], [26, 'forge'], [27, 'pylon'], [28, 'robotics_facility'], [30, 'templar_archives'], [32, 'gateway'], [34, 'pylon'], [36, 'photon_cannon'], [38, 'gateway'], [40, 'stargate'], [42, 'observatory'], [44, 'nexus'], [46, 'pylon'], [48, 'robotics_support_bay'], [52, 'fleet_beacon'], [56, 'gateway'], [60, 'arbiter_tribunal'], [66, 'gateway'], [72, 'stargate'], [80, 'nexus']],
};
const gasBuildings = ai => ai.mine(u => u.def.onGeyser).length + 1;
const AI_COMP = {
  T: [['marine', 6], ['medic', 2], ['firebat', 1], ['vulture', 2], ['siege_tank', 4], ['goliath', 2], ['science_vessel', 1], ['wraith', 1], ['battlecruiser', 2]],
  Z: [['zergling', 4], ['hydralisk', 6], ['mutalisk', 4], ['scourge', 1], ['ultralisk', 3], ['defiler', 1], ['queen', 0]],
  P: [['zealot', 4], ['dragoon', 5], ['high_templar', 2], ['dark_templar', 1], ['reaver', 1], ['observer', 1], ['corsair', 1], ['carrier', 2], ['arbiter', 1]],
};
const AI_RESEARCH = {
  T: ['stim', 'siege_tech', 'u238', 'infW', 'ion_thrusters', 'spider_mines_tech', 'infA', 'vehW', 'charon', 'vehA', 'irradiate_tech', 'emp_tech', 'yamato_tech', 'shipW', 'cloaking_field'],
  Z: ['metabolic', 'lurker_aspect', 'carapace', 'grooved', 'muscular', 'missW', 'burrow_tech', 'flyW', 'pneumatized', 'meleeW', 'anabolic', 'chitinous', 'adrenal', 'consume_tech', 'plague_tech', 'flyA'],
  P: ['singularity', 'leg_enhancements', 'gW', 'psi_storm_tech', 'gA', 'shields', 'scarab_damage', 'gravitic_drive', 'airW', 'carrier_capacity', 'stasis_tech', 'khaydarin_amulet', 'airA', 'recall_tech'],
};
class AI {
  constructor(p, diff) {
    this.p = p; this.diff = diff; this.step = 0; this.pending = {}; this.lastThink = 0; this.lastArmy = 0; this.state = 'gather'; this.target = null; this.attackN = 0; this.attackThreshold = (diff === 'easy' ? 40 : diff === 'hard' ? 24 : 30) + (p.race === 'Z' ? 6 : 0); this.waves = 0; this.scouted = false; this.dropOp = null; this.lastDrop = 0;
    this.thinkEvery = diff === 'easy' ? 72 : diff === 'hard' ? 20 : 32; this.scriptIdx = 0; this.lastExpand = 0; this.rally = null; this.startedAttack = 0;
  }
  get race() { return this.p.race; }
  mine(pred) { const out = []; for (const u of G.units) if (u.alive && u.owner === this.p.id && pred(u)) out.push(u); return out; }
  count(id, inclProd = true) { let n = 0; for (const u of G.units) { if (!u.alive || u.owner !== this.p.id) continue; if (u.def.id === id) n++; if (inclProd) for (const it of u.prod) if (it.id === id) n++; if (u.order.type === 'build' && u.order.def.id === id) n++; } if (this.pending[id] && G.frame - this.pending[id] < 360) n++; return n; }
  halls() { return this.mine(u => u.isBuilding && u.def.depot && !u.lifted); }
  enemies() { return G.players.filter(q => !G.allied(q.id, this.p.id) && !q.defeated); }
  tick() {
    if (this.p.defeated) return;
    if (G.frame - this.lastThink < this.thinkEvery) { if (G.frame % 12 === 0) this.micro(); return; }
    this.lastThink = G.frame;
    try { this.economy(); this.supply(); this.script(); this.macro(); this.production(); this.research(); this.army(); this.scout(); this.drops(); this.micro(); } catch (e) { console.error('AI', e); }
  }
  // ---------------- economy ----------------
  economy() {
    const p = this.p, halls = this.halls();
    const workers = this.mine(u => u.def.worker);
    // idle workers -> mine
    for (const w of workers) if (w.order.type === 'idle' && !w.carrying) { const m = G.findNearestResource(w, 'mineral'); if (m) w.applyOrder({ type: 'gather', target: m, phase: 'goto' }); }
    // gas balancing: 3 per gas building
    const gasB = this.mine(u => u.def.onGeyser && u.done && u.geyser.amount > 0);
    gasB.forEach((g, gi) => {
      const on = workers.filter(w => (w.order.type === 'gather' && w.order.target === g) || (w.order.type === 'return' && w.order.then === g));
      let want = workers.length < 14 ? (gi === 0 ? 2 : 0) : workers.length < 24 ? (gi === 0 ? 3 : 1) : 3;
      if (p.gas > 800 && p.minerals < 300) want = Math.min(want, 1); if ((p.gas > 400 && p.minerals < 150) || p.gas > 1500) want = 0;
      if (on.length < want) { const cands = workers.filter(w => w.order.type === 'gather' && w.order.target && w.order.target.type === 'mineral' && !w.carrying && dist(w, g) < 20 * TILE); cands.sort((a, b) => dist(a, g) - dist(b, g)); for (let i = 0; i < want - on.length && i < cands.length; i++) cands[i].applyOrder({ type: 'gather', target: g, phase: 'goto' }); }
      else if (on.length > want) { const m = G.findNearestResource(on[0], 'mineral'); if (m) on[0].applyOrder({ type: 'gather', target: m, phase: 'goto' }); }
    });
    // worker production
    const fields = G.map.resources.filter(r => r.type === 'mineral' && r.amount > 0 && halls.some(h => h.done && distPt(r.cx, r.cy, h.x, h.y) < 10 * TILE)).length; const want = Math.min(70, fields * 2 + gasB.length * 3 + 2);
    const larvaN = this.race === 'Z' ? this.mine(u => u.def.larva).length : 9;
    if (this.count(RACE_INFO[p.race].worker) < want && (larvaN >= 2 || workers.length < 12 || this.armyUnits().length > workers.length)) this.train(RACE_INFO[p.race].worker, 2);
    // transfer workers from saturated to new bases
    if (G.frame % (24 * 10) < this.thinkEvery && halls.length > 1) {
      for (const h of halls) { const near = workers.filter(w => dist(w, h) < 12 * TILE); const fields = G.map.resources.filter(r => r.type === 'mineral' && distPt(r.cx, r.cy, h.x, h.y) < 10 * TILE).length; if (near.length > fields * 2 + 3) { const other = halls.find(o => o !== h && o.done && workers.filter(w => dist(w, o) < 12 * TILE).length < 8); if (other) { const m = G.map.resources.find(r => r.type === 'mineral' && distPt(r.cx, r.cy, other.x, other.y) < 10 * TILE); if (m) for (let i = 0; i < 4; i++) { const w = near.find(w => w.order.type === 'gather' && !w.carrying); if (w) w.applyOrder({ type: 'gather', target: m, phase: 'goto' }); } } } }
    }
  }
  supply() {
    const p = this.p; if (p.supMax >= 200) return;
    const prodN = this.mine(u => u.isBuilding && u.def.produces.length && u.done).length + (p.race === 'Z' ? this.halls().length : 0);
    const margin = 4 + prodN * 2;
    if (p.supMax - p.supUsed < margin) {
      const sid = RACE_INFO[p.race].supply;
      if (p.race === 'Z') { if (this.count('overlord') - this.mine(u => u.def.id === 'overlord').length < 1 + (prodN > 6 ? 1 : 0)) this.train('overlord', 1); }
      else if (this.count(sid) - this.mine(u => u.def.id === sid && u.done).length < 1 + (prodN > 6 ? 1 : 0)) this.build(sid);
    }
  }
  script() {
    const s = AI_SCRIPTS[this.race]; if (this.scriptIdx >= s.length) return;
    const [at, id] = s[this.scriptIdx]; const p = this.p;
    if (p.supUsed < at) { this.stepT = G.frame; return; }
    const def = DATA.buildings[id];
    let need = 0; for (let i = 0; i <= this.scriptIdx; i++) if (s[i][1] === id) need++;
    const have = this.mine(u => u.def.id === id || (id === 'hatchery' && (u.def.id === 'lair' || u.def.id === 'hive')) || (id === 'lair' && u.def.id === 'hive') || (id === 'spire' && u.def.id === 'greater_spire')).length;
    if (have >= need) { this.scriptIdx++; this.stepT = G.frame; return; }
    if (this.stepT === undefined) this.stepT = G.frame;
    if (G.frame - this.stepT > 24 * 240) { this.scriptIdx++; this.stepT = G.frame; return; } // give up on this step
    if (!p.hasReq(def)) return;
    if (def.tier === 'addon') { this.addon(id); return; }
    if (def.tier === 'morph') { if (!this.mine(u => u.prod.some(it => it.kind === 'morph' && it.id === id)).length) this.morph(id); return; }
    if (this.count(id) > have) return; // already pending / in construction
    if (p.minerals < def.min || p.gas < def.gas) return;
    this.build(id);
  }
  macro() {
    const p = this.p, r = this.race; const halls = this.halls();
    // expansion when floating minerals or saturated
    const workers = this.mine(u => u.def.worker).length;
    if (G.frame - this.lastExpand > 24 * 60 && (p.minerals > 500 || workers > halls.length * 18) && this.count(RACE_INFO[r].hall) <= halls.length) { if (this.build(RACE_INFO[r].hall)) this.lastExpand = G.frame; }
    // more production when floating
    if ((p.minerals > 450 && this.scriptIdx >= 6) || p.minerals > 700) {
      const prodId = r === 'T' ? (this.count('factory') >= 2 && p.gas > 200 ? 'factory' : 'barracks') : r === 'P' ? 'gateway' : 'hatchery';
      if (r === 'Z' && this.count('hatchery') + this.count('lair') + this.count('hive') < 8 && workers >= 12 * this.mine(u => u.isBuilding && u.def.spawnsLarva).length) this.build('hatchery');
      else if (r !== 'Z' && this.count(prodId) < 10) this.build(prodId);
    }
    if (r === 'Z' && ((p.minerals > 350 && !this.mine(u => u.def.larva).length) || p.minerals > 600) && workers >= 12 * this.mine(u => u.isBuilding && u.def.spawnsLarva).length && this.count('hatchery') <= this.halls().length && this.mine(u => u.isBuilding && u.def.spawnsLarva).length < 8 && halls.length) this.buildNear('hatchery', halls[0].x, halls[0].y);
    // gas: one per base with hall
    if (this.scriptIdx >= 3 && workers > 14 * gasBuildings(this) && !(p.gas > 800 && p.minerals < 300)) for (const h of halls) { if (!h.done) continue; const base = G.map.bases.find(b => distPt(b.cx, b.cy, h.x, h.y) < 3 * TILE); if (base && base.geyser.amount > 0 && !(base.geyser.building && base.geyser.building.alive) && p.minerals >= 100 && this.count(RACE_INFO[r].gasB) <= this.mine(u => u.def.onGeyser).length) { this.buildAt(RACE_INFO[r].gasB, base.geyser.x, base.geyser.y); break; } }
    // static defense at natural / detection
    if (this.scriptIdx >= 8 && p.minerals > 300) {
      const nat = halls.find(h => h !== halls[0]);
      if (nat && nat.done) { const defId = r === 'T' ? 'missile_turret' : r === 'P' ? 'photon_cannon' : 'creep_colony'; const near = this.mine(u => u.isBuilding && (u.def.id === defId || u.def.id === 'sunken_colony' || u.def.id === 'spore_colony') && dist(u, nat) < 10 * TILE).length; if (near < (r === 'Z' ? 3 : 2) && p.hasReq(DATA.buildings[defId])) this.buildNear(defId, nat.x + (G.map.w * TILE / 2 - nat.x) * 0.15, nat.y + (G.map.h * TILE / 2 - nat.y) * 0.15); }
    }
    // Zerg: morph creep colonies into sunkens
    if (r === 'Z') for (const c of this.mine(u => u.def.id === 'creep_colony' && u.done && !u.prod.length)) { G.queueMorph(c, p.hasBuilding('evolution_chamber') && this.mine(u => u.def.id === 'spore_colony').length < this.mine(u => u.def.id === 'sunken_colony').length ? 'spore_colony' : 'sunken_colony'); }
    // Terran addons
    if (r === 'T') { for (const b of this.mine(u => u.isBuilding && u.done && !u.addon && !u.prod.length && u.def.addons.length)) { const aid = b.def.addons[0]; if (aid === 'comsat_station' && !p.hasBuilding('academy')) continue; if (aid === 'machine_shop' || aid === 'control_tower' || aid === 'comsat_station') { if (p.minerals > 150 && p.gas > 100) G.queueAddon(b, aid); } else if (aid === 'physics_lab' && p.minerals > 300) G.queueAddon(b, aid); } }
    // Protoss: pylons when running low on power spots
    if (r === 'P' && p.minerals > 200 && this.count('pylon') < 3 + this.mine(u => u.isBuilding && !u.def.psi && !u.def.depot).length / 2) this.build('pylon');
    // Zerg: lair/hive/greater spire upgrades are in script; hatchery tech at 2 hatch
  }
  production() {
    const p = this.p, comp = AI_COMP[this.race]; const cands = [];
    const counts = {}; for (const u of G.units) if (u.alive && u.owner === p.id) { counts[u.def.id] = (counts[u.def.id] || 0) + 1; for (const it of u.prod) if (it.kind === 'unit') counts[it.id] = (counts[it.id] || 0) + 1; }
    const enemyAir = this.enemies().some(q => G.units.some(u => u.alive && u.owner === q.id && u.fly && u.hasWeapon())) ;
    for (const [id, wgt] of comp) {
      const ud = DATA.units[id]; if (!wgt || !p.hasReq(ud)) continue;
      if (id === 'scourge' && !enemyAir) continue; if (id === 'corsair' && !enemyAir && !this.enemies().some(q => q.race === 'Z')) continue;
      if (id === 'observer' && (counts.observer || 0) >= 2) continue;
      let w = wgt; if (this.race === 'Z' && id === 'hydralisk' && p.hasTech('lurker_aspect')) w += 2;
      if (ud.from !== 'larva' && !this.mine(b => b.isBuilding && b.done && b.def.produces.includes(id)).length) continue;
      cands.push([((counts[id] || 0) + 1) / w, id]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    if (!cands.length) return;
    // Zerg morphs: hydras -> lurkers, mutas -> guardians
    if (this.race === 'Z' && p.hasTech('lurker_aspect') && (counts.lurker || 0) < (counts.hydralisk || 0) / 1.5 && p.minerals >= 50 && p.gas >= 100) { const h = this.mine(u => u.def.id === 'hydralisk' && u.order.type !== 'attack' && u.done); if (h.length) { Abilities.morph(h[0], 'lurker'); return; } }
    if (this.race === 'Z' && p.hasBuilding('greater_spire') && (counts.guardian || 0) < 4 && p.minerals >= 50 && p.gas >= 100) { const m = this.mine(u => u.def.id === 'mutalisk'); if (m.length > 4) { Abilities.morph(m[0], 'guardian'); return; } }
    // Protoss: merge archons when HTs have low energy and storm not researched or many HTs
    if (this.race === 'P') { const hts = this.mine(u => u.def.id === 'high_templar' && u.energy < 60 && u.order.type !== 'merge'); if (hts.length >= 2 && ((counts.high_templar || 0) > 3 || !p.hasTech('psi_storm_tech'))) Abilities.merge(hts, 'summon_archon'); }
    // Reaver scarabs / carrier interceptors
    for (const u of this.mine(u => (u.def.id === 'reaver' || u.def.id === 'carrier') && !u.prod.length)) { if (u.def.id === 'reaver' && u.scarabs < 5) G.queueUnit(u, 'scarab'); if (u.def.id === 'carrier' && u.interceptors < (p.hasTech('carrier_capacity') ? 8 : 4)) G.queueUnit(u, 'interceptor'); }
    let made = 0; for (const [, id] of cands) { if (this.train(id, 3)) { made++; if (made >= (this.race === 'Z' ? 2 : 1)) break; } }
  }
  research() {
    const p = this.p; if (p.minerals < 200 || p.gas < 150) return;
    for (const id of AI_RESEARCH[this.race]) {
      if (DATA.techs[id]) { if (p.tech.has(id) || p.researching.has(id)) continue; const td = DATA.techs[id]; const b = this.mine(u => u.isBuilding && u.done && u.def.id === td.bld && !u.prod.length && !u.lifted)[0]; if (!b) continue; if (G.queueTech(b, id)) return; }
      else if (DATA.upgrades[id]) { const ud = DATA.upgrades[id]; const lvl = p.upgLevel(id); if (lvl >= 3 || p.researching.has(id)) continue; if (this.diff === 'easy' && lvl >= 1) continue; const b = this.mine(u => u.isBuilding && u.done && (u.def.id === ud.bld || (ud.bld === 'spire' && u.def.id === 'greater_spire')) && !u.prod.length)[0]; if (!b) continue; if (G.queueUpgrade(b, id)) return; }
    }
  }
  // ---------------- helpers ----------------
  train(id, maxQ) {
    const p = this.p, ud = DATA.units[id]; if (!ud || !p.hasReq(ud)) return false;
    if (p.minerals < ud.min || p.gas < ud.gas) return false;
    if (ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) return false;
    if (ud.from === 'larva') { const l = this.mine(u => u.def.larva)[0]; if (!l) return false; return G.larvaMorph(l, id); }
    const bs = this.mine(u => u.isBuilding && u.done && !u.lifted && u.def.produces.includes(id) && u.prod.length < (maxQ || 2) && !(u.addon && !u.addon.done)); if (!bs.length) return false;
    bs.sort((a, b) => a.prod.length - b.prod.length); return G.queueUnit(bs[0], id);
  }
  addon(id) { const p = this.p, ad = DATA.buildings[id]; if (!p.hasReq(ad)) return false; const b = this.mine(u => u.isBuilding && u.done && u.def.id === ad.parent && !u.addon && !u.prod.length)[0]; if (!b) return false; return G.queueAddon(b, id); }
  morph(id) { const p = this.p, nd = DATA.buildings[id]; const from = id === 'lair' ? 'hatchery' : id === 'hive' ? 'lair' : id === 'greater_spire' ? 'spire' : null; if (!from) return false; if (p.minerals < nd.min || p.gas < nd.gas) return false; const b = this.mine(u => u.isBuilding && u.done && u.def.id === from && !u.prod.length)[0]; if (!b) return false; return G.queueMorph(b, id); }
  build(id) {
    const def = DATA.buildings[id], p = this.p; if (!p.hasReq(def)) return false;
    if (def.depot) { const base = this.pickExpansion(); if (!base) return false; return this.buildAt(id, base.x, base.y); }
    if (def.onGeyser) { for (const h of this.halls()) { const base = G.map.bases.find(b => distPt(b.cx, b.cy, h.x, h.y) < 3 * TILE); if (base && !(base.geyser.building && base.geyser.building.alive) && base.geyser.amount > 0) return this.buildAt(id, base.geyser.x, base.geyser.y); } return false; }
    const halls = this.halls(); const h = halls[Math.floor(G.rand() * Math.min(2, halls.length))] || { x: p.startX, y: p.startY };
    return this.buildNear(id, h.x, h.y);
  }
  buildNear(id, x, y) {
    const def = DATA.buildings[id], p = this.p; const spot = this.findSpot(def, Math.floor(x / TILE), Math.floor(y / TILE)); if (!spot) return false;
    return this.buildAt(id, spot[0], spot[1]);
  }
  buildAt(id, tx, ty) {
    const def = DATA.buildings[id], p = this.p; if (p.minerals < def.min || p.gas < def.gas) return false;
    const w = this.pickWorker((tx + def.w / 2) * TILE, (ty + def.h / 2) * TILE); if (!w) return false;
    w.setOrder({ type: 'build', def, tx, ty }); this.pending[id] = G.frame; return true;
  }
  pickWorker(x, y) { const ws = this.mine(u => u.def.worker && !u.inside && (u.order.type === 'gather' || u.order.type === 'idle' || u.order.type === 'return') && !(u.order.type === 'gather' && u.order.target && u.order.target.type === 'gas')); if (!ws.length) return null; ws.sort((a, b) => distPt(a.x, a.y, x, y) + (a.carrying ? 200 : 0) - distPt(b.x, b.y, x, y) - (b.carrying ? 200 : 0)); return ws[0]; }
  pickExpansion() {
    const p = this.p; let best = null, bd = 1e9; const halls = this.halls();
    for (const b of G.map.bases) {
      if (b.minerals.every(m => m.amount <= 0)) continue;
      if (G.units.some(u => u.alive && u.isBuilding && u.def.depot && distPt(u.x, u.y, b.cx, b.cy) < 6 * TILE)) continue;
      if (G.units.some(u => u.alive && !G.allied(u.owner, p.id) && (u.isBuilding || u.hasWeapon()) && distPt(u.x, u.y, b.cx, b.cy) < 14 * TILE)) continue;
      if (this.mine(u => u.def.worker && u.order.type === 'build' && u.order.def.depot && distPt(u.order.tx * TILE, u.order.ty * TILE, b.cx, b.cy) < 6 * TILE).length) continue;
      const d = distPt(p.startX, p.startY, b.cx, b.cy) + (halls.length ? Math.min(...halls.map(h => distPt(h.x, h.y, b.cx, b.cy))) : 0);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  findSpot(def, cx, cy) {
    const m = G.map, p = this.p; const isProd = def.produces.length > 0 || def.addons.length > 0;
    for (let r = (def.race === 'Z' ? 4 : 2); r < 24; r++) {
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2 + r * 0.3; const tx = Math.round(cx + Math.cos(ang) * r - def.w / 2), ty = Math.round(cy + Math.sin(ang) * r * 0.8 - def.h / 2);
        if (m.canPlace(def, tx, ty, p, G.units, null)) continue;
        if (this.nearResources(tx, ty, def.w, def.h)) continue;
        // keep an exit row below and addon slot free for production buildings
        let ok = true;
        for (let x = tx - 1; x <= tx + def.w && ok; x++) { if (!m.walkable(x, ty + def.h)) ok = false; }
        if (ok && isProd && def.race === 'T') { for (let y = ty + def.h - 2; y < ty + def.h && ok; y++) for (let x = tx + def.w; x < tx + def.w + 2; x++) if (!m.walkable(x, y)) ok = false; }
        if (ok && def.psi) { let close = false; for (const u of G.units) if (u.alive && u.owner === p.id && u.def.psi && distPt(u.x, u.y, (tx + 1) * TILE, (ty + 1) * TILE) < 5 * TILE) close = true; if (close && G.rand() < 0.7) ok = false; }
        if (ok) return [tx, ty];
      }
    }
    return null;
  }
  nearResources(tx, ty, w, h) { for (const r of G.map.resources) { if (tx < r.x + r.w + 3 && tx + w > r.x - 3 && ty < r.y + r.h + 3 && ty + h > r.y - 3) return true; } return false; }
  // ---------------- army ----------------
  armyUnits() { return this.mine(u => !u.isBuilding && !u.def.worker && !u.def.larva && !u.def.egg && u.hasWeapon() && !u.inside && !u.def.notUnit && u.def.id !== 'spider_mine' && !(u.def.id === 'lurker' && false)); }
  supportUnits() { return this.mine(u => ['medic', 'science_vessel', 'observer', 'high_templar', 'defiler', 'arbiter', 'dark_archon', 'queen'].includes(u.def.id) && !u.inside); }
  rallyPoint() {
    const halls = this.halls().filter(h => h.done); const p = this.p;
    const nat = halls.length > 1 ? halls[1] : halls[0]; if (!nat) return { x: p.startX, y: p.startY };
    const cx = G.map.w * TILE / 2, cy = G.map.h * TILE / 2; const d = distPt(nat.x, nat.y, cx, cy);
    return { x: nat.x + (cx - nat.x) / d * 7 * TILE, y: nat.y + (cy - nat.y) / d * 7 * TILE };
  }
  army() {
    const p = this.p, army = this.armyUnits(), sup = army.reduce((s, u) => s + u.def.sup, 0);
    const rally = this.rallyPoint(); this.rally = rally;
    for (const b of this.mine(u => u.isBuilding && (u.def.produces.length || u.def.spawnsLarva))) b.rally = { x: rally.x + (G.rand() - .5) * 64, y: rally.y + (G.rand() - .5) * 64 };
    // defense
    const attacked = this.mine(u => u.owner === p.id && G.frame - u.lastHit < 72 && u.lastHitBy && !G.allied(u.lastHitBy.owner, p.id) && (u.isBuilding || u.def.worker));
    if (attacked.length) { const t = attacked[0]; this.state = 'defend'; this.defendPt = { x: t.x, y: t.y }; this.defendT = G.frame; }
    if (this.state === 'defend') { if (G.frame - this.defendT > 24 * 20) this.state = 'gather'; else { for (const u of army) if (u.order.type !== 'attack' && distPt(u.x, u.y, this.defendPt.x, this.defendPt.y) > 6 * TILE) u.setOrder({ type: 'attackmove', x: this.defendPt.x, y: this.defendPt.y }); for (const u of this.supportUnits()) if (u.order.type === 'idle') u.setOrder({ type: 'follow', target: army[0] || u }); return; } }
    if (this.state === 'gather') {
      for (const u of army) if (u.order.type === 'idle' && distPt(u.x, u.y, rally.x, rally.y) > 5 * TILE) u.setOrder({ type: 'attackmove', x: rally.x + (G.rand() - .5) * 96, y: rally.y + (G.rand() - .5) * 96 });
      for (const u of this.supportUnits()) if (u.order.type === 'idle' && distPt(u.x, u.y, rally.x, rally.y) > 6 * TILE) u.setOrder({ type: 'move', x: rally.x, y: rally.y });
      const threshold = this.attackThreshold + this.waves * 8 + (p.supUsed > 150 ? -20 : 0);
      if (sup >= threshold || p.supUsed >= 190) { this.state = 'attack'; this.waves++; this.startedAttack = G.frame; const wave = army.filter(u => distPt(u.x, u.y, rally.x, rally.y) < 14 * TILE || this.waves > 1); for (const u of wave) u.wave = this.waves; this.attackN = wave.length; this.target = this.pickTarget(rally); }
    }
    if (this.state === 'attack') {
      if (!this.target || !this.target.alive) this.target = this.pickTarget(rally);
      if (!this.target) { this.state = 'gather'; return; }
      const waveUnits = army.filter(u => u.wave === this.waves), rest = army.filter(u => u.wave !== this.waves);
      if (waveUnits.length < this.attackN * 0.35 && G.frame - this.startedAttack > 24 * 20) { this.state = 'gather'; for (const u of army) { u.wave = 0; u.setOrder({ type: 'move', x: rally.x, y: rally.y }); } return; }
      for (const u of rest) if (u.order.type === 'idle' && distPt(u.x, u.y, rally.x, rally.y) > 5 * TILE) u.setOrder({ type: 'attackmove', x: rally.x + (G.rand() - .5) * 96, y: rally.y + (G.rand() - .5) * 96 });
      // reinforce: send gathered units as a group when enough have collected
      const gathered = rest.filter(u => distPt(u.x, u.y, rally.x, rally.y) < 8 * TILE); if (gathered.reduce((s, u) => s + u.def.sup, 0) >= 16) for (const u of gathered) u.wave = this.waves;
      const t = this.target;
      for (const u of waveUnits) { if (u.order.type === 'attack' || u.order.type === 'ability') continue; if (u.order.type === 'attackmove' && distPt(u.order.x, u.order.y, t.x, t.y) < 3 * TILE) continue; if (u.sieged) continue; u.setOrder({ type: 'attackmove', x: t.x, y: t.y }); }
      for (const u of this.supportUnits()) { if (u.def.id === 'high_templar' || u.def.id === 'defiler') { if (u.order.type !== 'ability' && u.order.type !== 'follow') u.setOrder({ type: 'follow', target: army[0] || u }); } else if (u.order.type === 'idle' || u.order.type === 'move') u.setOrder({ type: 'follow', target: army[Math.floor(G.rand() * army.length)] || u }); }
      // scourge / overlords stay home
      if (G.frame - this.startedAttack > 24 * 240) { this.state = 'gather'; for (const u of army) u.wave = 0; }
    }
    // overlords: one per base for detection, rest near rally
    if (this.race === 'Z') { const ovs = this.mine(u => u.def.id === 'overlord'); const halls = this.halls(); ovs.forEach((o, i) => { if (o.order.type !== 'idle') return; const h = halls[i % Math.max(1, halls.length)]; const tgt = i < halls.length && h ? { x: h.x, y: h.y - 40 } : { x: rally.x, y: rally.y }; if (distPt(o.x, o.y, tgt.x, tgt.y) > 3 * TILE) o.setOrder({ type: 'move', x: tgt.x, y: tgt.y }); }); }
  }
  pickTarget(from) {
    let best = null, bd = 1e9;
    for (const u of G.units) { if (!u.alive || G.allied(u.owner, this.p.id) || !u.isBuilding || u.def.tier === 'addon') continue; if (G.players[u.owner].defeated) continue; const d = distPt(u.x, u.y, from.x, from.y) - (u.def.depot ? 8 * TILE : 0); if (d < bd) { bd = d; best = u; } }
    if (!best) { for (const u of G.units) { if (u.alive && !G.allied(u.owner, this.p.id) && !G.players[u.owner].defeated && !u.def.larva) { const d = distPt(u.x, u.y, from.x, from.y); if (d < bd) { bd = d; best = u; } } } }
    return best;
  }
  micro() {
    const p = this.p;
    for (const u of G.units) {
      if (!u.alive || u.owner !== p.id || u.isBuilding || u.inside) continue;
      const d = u.def.id;
      if (d === 'siege_tank' && p.hasTech('siege_tech') && u.transT <= 0) { const near = G.near(u.x, u.y, 11 * TILE).some(o => o.owner !== p.id && !o.fly && o.alive && (o.hasWeapon() || o.isBuilding)); const veryNear = G.near(u.x, u.y, 2 * TILE).some(o => o.owner !== p.id && !o.fly && o.alive && o.hasWeapon()); if (near && !u.sieged && !veryNear && (G.frame + u.id) % 24 === 0) Abilities.instant(u, 'siege_mode'); else if (u.sieged && !near && (G.frame + u.id) % 96 === 0) Abilities.instant(u, 'siege_mode'); }
      else if ((d === 'vulture' || d === 'mutalisk' || d === 'dragoon') && u.order.type === 'attack' && (G.frame + u.id) % 12 === 0) this.kite(u);
      else if ((d === 'marine' || d === 'firebat') && p.hasTech('stim') && u.stim <= 0 && u.hp > 25 && u.order.type === 'attack' && u.order.target && dist(u, u.order.target) < 6 * TILE) Abilities.instant(u, 'stim');
      else if (d === 'lurker' && u.transT <= 0) { const near = G.near(u.x, u.y, 7 * TILE).some(o => o.owner !== p.id && !o.fly && o.alive && !o.def.larva); if (near && !u.burrowed && (G.frame + u.id) % 12 === 0) Abilities.instant(u, 'burrow'); else if (u.burrowed && !near && (G.frame + u.id) % 72 === 0 && this.state !== 'gather') Abilities.instant(u, 'burrow'); }
      else if (d === 'high_templar' && u.energy >= 75 && p.hasTech('psi_storm_tech') && (G.frame + u.id) % 16 === 0) { const c = this.cluster(u, 9, 3, o => o.owner !== p.id && !o.isBuilding); if (c) Abilities.issue(u, 'psi_storm', null, c.x, c.y); }
      else if (d === 'defiler' && u.energy >= 100 && (G.frame + u.id) % 16 === 0 && this.state === 'attack') { const c = this.cluster(u, 9, 3, o => o.owner === p.id && !o.fly && !o.isBuilding && o.hasWeapon() && G.frame - o.lastHit < 48); if (c && !Abilities.inField(c.x, c.y, 'swarm')) Abilities.issue(u, 'dark_swarm', null, c.x, c.y); else if (p.hasTech('plague_tech') && u.energy >= 150) { const e = this.cluster(u, 9, 4, o => o.owner !== p.id); if (e) Abilities.issue(u, 'plague', null, e.x, e.y); } }
      else if (d === 'science_vessel' && u.energy >= 75 && p.hasTech('irradiate_tech') && (G.frame + u.id) % 24 === 0) { const t = G.near(u.x, u.y, 9 * TILE).find(o => o.owner !== p.id && o.def.bio && !o.isBuilding && !o.fx.irradiate && o.maxHp >= 80); if (t) Abilities.issue(u, 'irradiate', t); }
      else if (d === 'queen' && u.energy >= 150 && p.hasTech('spawn_broodling_tech') && (G.frame + u.id) % 24 === 0) { const t = G.near(u.x, u.y, 9 * TILE).find(o => o.owner !== p.id && !o.fly && !o.isBuilding && !NO_BROODLING.has(o.def.id) && o.def.sup >= 2); if (t) Abilities.issue(u, 'spawn_broodling', t); }
      else if (d === 'medic' && u.order.type === 'idle' && this.rally && distPt(u.x, u.y, this.rally.x, this.rally.y) > 8 * TILE) { const a = this.armyUnits()[0]; if (a) u.setOrder({ type: 'follow', target: a }); }
      else if (d === 'vulture' && u.mines > 0 && p.hasTech('spider_mines_tech') && u.order.type === 'idle' && (G.frame + u.id) % 48 === 0) { Abilities.issue(u, 'spider_mine', null, u.x + (G.rand() - .5) * 64, u.y + (G.rand() - .5) * 64); }
      else if (d === 'arbiter' && u.energy >= 100 && p.hasTech('stasis_tech') && (G.frame + u.id) % 24 === 0) { const c = this.cluster(u, 9, 4, o => o.owner !== p.id && !o.isBuilding); if (c) Abilities.issue(u, 'stasis_field', null, c.x, c.y); }
      else if (d === 'ghost' && p.nukes > 0 && u.energy > 50 && (G.frame + u.id) % 48 === 0 && u.order.type !== 'ability') { const t = this.target; if (t && t.alive) { if (p.hasTech('personnel_cloaking') && !u.cloaked) Abilities.instant(u, 'cloak_ghost'); Abilities.issue(u, 'nuke', null, t.x, t.y); } }
    }
  }
  scout() {
    const p = this.p; if (this.scouted || p.supUsed < 9) return; this.scouted = true;
    const w = this.pickWorker(p.startX, p.startY); if (!w) return; const targets = G.map.starts.filter(b => distPt(b.cx, b.cy, p.startX, p.startY) > 10 * TILE);
    targets.forEach((b, i) => w.setOrder({ type: 'move', x: b.cx, y: b.cy + 80 }, i > 0)); const home = G.map.resources.find(r => r.type === 'mineral' && distPt(r.cx, r.cy, p.startX, p.startY) < 10 * TILE); if (home) w.setOrder({ type: 'gather', target: home, phase: 'goto' }, true);
  }
  drops() {
    const p = this.p; const op = this.dropOp;
    if (op) {
      const t = op.transport; if (!t || !t.alive) { this.dropOp = null; return; }
      if (op.phase === 'load') { const left = op.units.filter(u => u.alive && !u.inside); if (!left.length || G.frame - op.t0 > 24 * 25) { op.phase = 'fly'; t.setOrder({ type: 'move', x: op.x, y: op.y }); op.t0 = G.frame; } else for (const u of left) if (u.order.type !== 'load') u.setOrder({ type: 'load', target: t }); }
      else if (op.phase === 'fly') { if (distPt(t.x, t.y, op.x, op.y) < 3 * TILE || G.frame - op.t0 > 24 * 90) { t.setOrder({ type: 'unload', x: op.x, y: op.y }); op.phase = 'unload'; op.t0 = G.frame; } else if (t.order.type === 'idle') t.setOrder({ type: 'move', x: op.x, y: op.y }); }
      else if (op.phase === 'unload') { if (!t.cargo.length || G.frame - op.t0 > 24 * 15) { for (const u of op.units) if (u.alive && !u.inside) u.setOrder({ type: 'attackmove', x: op.tx, y: op.ty }); t.setOrder({ type: 'move', x: this.rally ? this.rally.x : p.startX, y: this.rally ? this.rally.y : p.startY }); this.dropOp = null; this.lastDrop = G.frame; } }
      return;
    }
    if (this.state !== 'gather' || G.frame < 24 * 60 * 6 || G.frame - this.lastDrop < 24 * 180 || !this.rally) return;
    const t = this.mine(u => !u.isBuilding && (u.def.cargo || (u.def.cargoTech && p.hasTech(u.def.cargoTech))) && !u.cargo.length && u.order.type === 'idle' && u.def.id !== 'overlord')[0] || this.mine(u => u.def.id === 'overlord' && p.hasTech('ventral_sacs') && !u.cargo.length)[0]; if (!t) return;
    const cargo = this.armyUnits().filter(u => !u.fly && u.def.cargoSize && u.def.cargoSize <= 2 && distPt(u.x, u.y, this.rally.x, this.rally.y) < 8 * TILE && u.order.type !== 'attack'); let slots = 8; const chosen = []; for (const u of cargo) { if (u.def.cargoSize <= slots) { chosen.push(u); slots -= u.def.cargoSize; } if (slots <= 0) break; } if (chosen.length < 4) return;
    const en = this.enemies()[0]; if (!en) return; const eb = en.startBase; const cx = G.map.w * TILE / 2, cy = G.map.h * TILE / 2; const away = Math.atan2(eb.cy - cy, eb.cx - cx); const x = clamp(eb.cx + Math.cos(away) * 5 * TILE, 64, G.map.w * TILE - 64), y = clamp(eb.cy + Math.sin(away) * 5 * TILE, 64, G.map.h * TILE - 64);
    this.dropOp = { transport: t, units: chosen, phase: 'load', x, y, tx: eb.cx, ty: eb.cy, t0: G.frame }; t.setOrder({ type: 'move', x: this.rally.x, y: this.rally.y });
  }
  kite(u) {
    const t = u.order.target; if (!t || !t.alive || t.fly) return; const tw = t.def.gw; if (!tw || tw.range > 1.5) return; if (u.cooldown < 6) return;
    const d = dist(u, t); const myR = u.maxRange() * TILE; if (d > myR * 0.7) return;
    const a = Math.atan2(u.y - t.y, u.x - t.x); const x = u.x + Math.cos(a) * 80, y = u.y + Math.sin(a) * 80; if (!G.map.walkable(Math.floor(x / TILE), Math.floor(y / TILE)) && !u.fly) return;
    const tgt = t; u.applyOrder({ type: 'move', x, y }); u.queue = [{ type: 'attack', target: tgt }];
  }
  cluster(u, rangeT, min, pred) {
    const cands = G.near(u.x, u.y, rangeT * TILE).filter(o => o.alive && pred(o)); let best = null, bn = min - 1;
    for (const c of cands) { let n = 0; for (const o of cands) if (distPt(o.x, o.y, c.x, c.y) < 1.5 * TILE) n++; if (n > bn) { bn = n; best = c; } }
    return best ? { x: best.x, y: best.y } : null;
  }
}
