// Race scripts for the scripted human (see playtest.js). Each think() runs once per second of game time
// and issues a handful of UI-level actions, the way a busy player would.
const T = {
  order: [[9, 'supply_depot'], [11, 'barracks'], [12, 'refinery'], [15, 'supply_depot'], [16, 'academy'], [18, 'factory'], [20, 'engineering_bay'], [22, 'supply_depot'], [24, 'bunker'], [26, 'starport'], [28, 'supply_depot'], [30, 'barracks'], [32, 'armory'], [34, 'science_facility'], [36, 'supply_depot'], [40, 'missile_turret'], [44, 'supply_depot'], [50, 'supply_depot'], [56, 'supply_depot'], [62, 'supply_depot'], [70, 'supply_depot'], [78, 'supply_depot']],
  idx: 0, done: {},
  think() {
    const p = Bot.p(); const f = G.frame; const s = Math.round(p.supUsed);
    Bot.idleWorkersMine();
    Bot.saveFor = null;
    if (this.idx < this.order.length) { const [at, id] = this.order[this.idx]; if (s >= at) { const need = this.order.slice(0, this.idx + 1).filter(o => o[1] === id).length; if (Bot.mine(u => u.def.id === id).length >= need) this.idx++; else if (Bot.count(id) < need) { if (!Bot.build(id, null, { hotkey: (this.idx % 2) === 0 })) Bot.saveFor = [DATA.buildings[id].min, DATA.buildings[id].gas]; } } }
    if (p.supMax - p.supUsed < 4 && Bot.count('supply_depot') <= Bot.mine(u => u.def.id === 'supply_depot').length && p.minerals >= 100) Bot.build('supply_depot');
    if (Bot.count('scv') < 22 + 8 * Math.max(0, Bot.mine(u => u.def.depot && u.done).length - 1)) Bot.train('command_center', 'scv', 2, f % 2 === 0);
    Bot.gasWorkers(3);
    if (Bot.has('academy')) Bot.research('academy', 'stim'); if (Bot.has('academy') && p.hasTech('stim')) Bot.research('academy', 'u238');
    if (Bot.has('factory')) { Bot.addon('factory', 'machine_shop'); if (Bot.mine(u => u.def.id === 'machine_shop' && u.done).length) { Bot.research('machine_shop', 'siege_tech'); Bot.research('machine_shop', 'spider_mines_tech'); Bot.research('machine_shop', 'ion_thrusters'); } }
    if (Bot.has('starport')) { Bot.addon('starport', 'control_tower'); }
    if (Bot.has('command_center') && Bot.has('academy') && !this.done.comsat) { if (Bot.addon('command_center', 'comsat_station')) this.done.comsat = true; }
    if (Bot.has('engineering_bay')) { Bot.research('engineering_bay', 'infW'); Bot.research('engineering_bay', 'infA'); }
    if (Bot.has('armory')) Bot.research('armory', 'vehW');
    if (Bot.has('science_facility')) { Bot.addon('science_facility', 'covert_ops'); Bot.research('science_facility', 'irradiate_tech'); }
    // production
    if (p.minerals >= 50) { Bot.train('barracks', 'marine', 2, f % 3 !== 0); if (Bot.has('academy') && Bot.mine(u => u.def.id === 'medic').length < Bot.mine(u => u.def.id === 'marine').length / 4) Bot.train('barracks', 'medic'); if (Bot.has('academy') && f % 5 === 0) Bot.train('barracks', 'firebat'); }
    if (Bot.has('factory') && p.gas >= 100) { if (Bot.mine(u => u.def.id === 'siege_tank').length < 6 && Bot.mine(u => u.def.id === 'machine_shop' && u.done).length) Bot.train('factory', 'siege_tank'); else Bot.train('factory', 'vulture'); }
    if (Bot.has('starport')) { if (!Bot.mine(u => u.def.id === 'dropship').length && Bot.has('control_tower')) Bot.train('starport', 'dropship'); else if (Bot.has('science_facility') && Bot.has('control_tower') && Bot.mine(u => u.def.id === 'science_vessel').length < 2) Bot.train('starport', 'science_vessel'); else if (f % 4 === 0) Bot.train('starport', 'wraith'); }
    if (Bot.has('covert_ops')) { Bot.research('covert_ops', 'personnel_cloaking'); Bot.research('covert_ops', 'lockdown_tech'); if (Bot.mine(u => u.def.id === 'ghost').length < 2) Bot.train('barracks', 'ghost'); if (!Bot.mine(u => u.def.id === 'nuclear_silo').length) Bot.addon('command_center', 'nuclear_silo'); }
    const silo = Bot.mine(u => u.def.id === 'nuclear_silo' && u.done && !u.hasNuke && !u.prod.length)[0]; if (silo && p.minerals >= 200 && p.gas >= 200) { Bot.select([silo.parent && silo.parent.alive ? silo.parent : silo]); Bot.key('N'); }
    // expand at 7 minutes
    if (f > 24 * 60 * 7 && !this.done.expand && p.minerals >= 400) { if (Bot.build('command_center', null, { expand: true })) this.done.expand = true; }
    // bunker: load 4 marines, later unload one by clicking its wireframe, then unload all
    const bunker = Bot.mine(u => u.def.id === 'bunker' && u.done)[0];
    if (bunker && !this.done.bunkerLoad && bunker.cargo.length < 4) { const ms = Bot.mine(u => u.def.id === 'marine' && u.order.type !== 'load').slice(0, 4 - bunker.cargo.length); for (const m of ms) { Bot.select([m]); Bot.rclickOn(bunker); } if (bunker.cargo.length >= 4) this.done.bunkerLoad = f; }
    if (bunker && this.done.bunkerLoad && f - this.done.bunkerLoad > 24 * 60 && !this.done.bunkerUnload) { Bot.select([bunker]); if (bunker.cargo.length) { Bot.act('unload one', () => G.unloadCargo(bunker, bunker.cargo[0])); } Bot.key('U'); this.done.bunkerUnload = true; Bot.log('bunker unload -> cargo ' + bunker.cargo.length); }
    // lift a barracks and land it a bit further once
    if (!this.done.lift && f > 24 * 60 * 5) { const b = Bot.mine(u => u.def.id === 'barracks' && u.done && !u.prod.length)[0]; if (b) { Bot.select([b]); Bot.key('L'); if (b.lifted) { this.done.lift = f; this.liftB = b; Bot.log('lifted barracks'); } } }
    if (this.done.lift && this.liftB && this.liftB.alive && this.liftB.lifted && f - this.done.lift > 24 * 5 && !this.done.land) { const b = this.liftB; const s = Bot.findSpot(b.def, Math.floor(b.x / TILE) + 6, Math.floor(b.y / TILE) + 2, 2); if (s) { Bot.select([b]); if (f % 2) { Bot.rclick((s[0] + 2) * TILE, (s[1] + 1.5) * TILE); } else { Bot.button('Land'); Bot.lclick((s[0] + 2) * TILE, (s[1] + 1.5) * TILE); } this.done.land = f; Bot.log('landing barracks order=' + b.order.type); } }
    // scan the enemy base whenever the comsat has energy
    const comsat = Bot.mine(u => u.def.id === 'comsat_station' && u.done && u.energy >= 50)[0]; const eb = Bot.en().startBase;
    if (comsat && f - (this.done.scan || 0) > 24 * 90) { Bot.select([comsat.parent && comsat.parent.alive && f % 2 ? comsat.parent : comsat]); Bot.button('Scanner Sweep'); Bot.lclick(eb.cx, eb.cy); this.done.scan = f; Bot.log('scan issued fields=' + G.fields.filter(x => x.kind === 'scan').length); if (!G.fields.some(x => x.kind === 'scan')) Bot.issues.push('scanner sweep did nothing'); }
    // repair damaged buildings
    const dmg = Bot.mine(u => u.isBuilding && u.done && u.hp < u.maxHp * 0.7 && u.def.race === 'T')[0]; if (dmg && f % 4 === 0) { const w = Bot.worker(); if (w) { Bot.select([w]); Bot.rclickOn(dmg); } }
    // siege tanks near enemies / unsiege
    for (const t of Bot.mine(u => u.def.id === 'siege_tank')) { if (!p.hasTech('siege_tech') || t.transT > 0) continue; const near = G.near(t.x, t.y, 10 * TILE).some(o => o.owner !== G.human && !o.fly && (o.hasWeapon() || o.isBuilding)); if (near && !t.sieged) Bot.ability(t, 'siege_mode'); else if (!near && t.sieged && f % 5 === 0) Bot.ability(t, 'siege_mode'); }
    // stim in combat
    for (const m of Bot.mine(u => (u.def.id === 'marine' || u.def.id === 'firebat') && u.order.type === 'attack' && u.stim <= 0 && u.hp > 20)) if (p.hasTech('stim') && f % 3 === 0) { Bot.select([m]); Bot.key('T'); }
    // vulture mines at rally
    for (const v of Bot.mine(u => u.def.id === 'vulture' && u.mines > 0 && u.order.type === 'idle')) if (p.hasTech('spider_mines_tech')) { Bot.ability(v, 'spider_mine', null, v.x + 40, v.y + 20); break; }
    // science vessel: dmatrix on a tank, irradiate on enemy bio
    const sv = Bot.mine(u => u.def.id === 'science_vessel')[0]; if (sv) { const tank = Bot.mine(u => u.def.id === 'siege_tank')[0]; if (tank && sv.energy >= 100 && f % 7 === 0) Bot.ability(sv, 'defensive_matrix', tank); const bio = G.near(sv.x, sv.y, 9 * TILE).find(o => o.owner !== G.human && o.def.bio && !o.isBuilding && !o.fx.irradiate); if (bio && p.hasTech('irradiate_tech') && sv.energy >= 75) Bot.ability(sv, 'irradiate', bio); const a = Bot.army()[0]; if (a && sv.order.type === 'idle') { Bot.select([sv]); Bot.rclickOn(a); } }
    // ghosts: cloak + lockdown mech, nuke when available
    for (const g of Bot.mine(u => u.def.id === 'ghost')) { if (p.hasTech('personnel_cloaking') && !g.cloaked && g.energy >= 25 && f % 4 === 0) Bot.ability(g, 'cloak_ghost'); const mech = G.near(g.x, g.y, 8 * TILE).find(o => o.owner !== G.human && o.def.mech && !o.isBuilding); if (mech && p.hasTech('lockdown_tech') && g.energy >= 100) Bot.ability(g, 'lockdown', mech); if (p.nukes > 0 && g.order.type !== 'ability' && f % 6 === 0) { const t = Bot.enemyTarget(); if (t) Bot.ability(g, 'nuke', null, t.x, t.y); } }
    // dropship: load 4 marines and drop at enemy natural
    const ds = Bot.mine(u => u.def.id === 'dropship')[0];
    if (ds && !this.drop) { const ms = Bot.mine(u => u.def.id === 'marine' && u.order.type !== 'attack' && !u.inside).slice(0, 4); if (ms.length >= 4) { this.drop = { t0: f, phase: 'load' }; Bot.select(ms); Bot.rclickOn(ds); Bot.select([ds]); Bot.rclickOn(ms[0]); } }
    if (ds && this.drop) { const d = this.drop; if (d.phase === 'load' && (ds.cargo.length >= 4 || f - d.t0 > 24 * 30)) { d.phase = 'fly'; d.t0 = f; const nat = G.map.bases.find(b => b.natural && b.quadrant === Bot.en().startBase.quadrant) || Bot.en().startBase; Bot.select([ds]); Bot.rclick(nat.cx, nat.cy); Bot.key('U'); Bot.lclick(nat.cx, nat.cy + 40, true); } else if (d.phase === 'fly' && (!ds.cargo.length || f - d.t0 > 24 * 120)) { d.phase = 'done'; Bot.log('drop finished cargo=' + ds.cargo.length); Bot.select([ds]); Bot.rclick(p.startX, p.startY); } }
    // army: group 1, attack when big, else rally at the ramp side
    const army = Bot.army().filter(u => !u.fly && !u.def.mine);
    if (Bot.defend(army)) return; const rally = { x: p.startX + (G.map.w * TILE / 2 - p.startX) * 0.25, y: p.startY + (G.map.h * TILE / 2 - p.startY) * 0.25 };
    if (f % 8 === 0 && army.length) Bot.group(1, army.slice(0, 12));
    const sup = army.reduce((a, u) => a + u.def.sup, 0);
    if (!this.attacking && sup >= 28) { this.attacking = f; const t = Bot.enemyTarget(); if (t) { Bot.key('1'); Bot.key('a'); Bot.lclick(t.x, t.y); const rest = army.filter(u => !UI.selection.includes(u)); Bot.attackMove(rest.slice(0, 12), t.x, t.y); Bot.log('ATTACK with ' + army.length); } }
    else if (this.attacking && f - this.attacking > 24 * 120) { this.attacking = 0; }
    else if (!this.attacking) { const idle = army.filter(u => u.order.type === 'idle' && distPt(u.x, u.y, rally.x, rally.y) > 5 * TILE); if (idle.length) { Bot.attackMove(idle.slice(0, 12), rally.x + (R.next() - .5) * 96, rally.y + (R.next() - .5) * 96); if (f % 3 === 0) { Bot.select(idle.slice(0, 3)); Bot.key('h'); } } }
    // random human fidgeting: patrol / shift-queue / stop / rally / cancel last queued
    if (f % 9 === 0) { const u = Bot.pick(army); if (u) { Bot.select([u]); Bot.key('p'); Bot.lclick(u.x + 100, u.y); Bot.rclick(u.x + 60, u.y + 60, true); Bot.rclick(u.x, u.y, true); } }
    if (f % 11 === 0) { const b = Bot.mine(u => u.isBuilding && u.done && u.def.produces.length)[0]; if (b) { Bot.select([b]); Bot.rclick(rally.x, rally.y); } }
    if (f % 13 === 0) { const b = Bot.mine(u => u.isBuilding && u.prod.length > 1)[0]; if (b) { Bot.select([b]); Bot.esc(); } }
  },
};
const P = {
  order: [[8, 'pylon'], [10, 'gateway'], [12, 'assimilator'], [14, 'cybernetics_core'], [15, 'pylon'], [18, 'gateway'], [20, 'forge'], [22, 'pylon'], [24, 'citadel_of_adun'], [26, 'robotics_facility'], [28, 'pylon'], [30, 'templar_archives'], [32, 'shield_battery'], [34, 'pylon'], [36, 'stargate'], [38, 'observatory'], [40, 'pylon'], [42, 'robotics_support_bay'], [44, 'photon_cannon'], [46, 'pylon'], [50, 'fleet_beacon'], [52, 'pylon'], [56, 'arbiter_tribunal'], [58, 'pylon'], [64, 'pylon'], [70, 'pylon'], [76, 'pylon']],
  idx: 0, done: {},
  think() {
    const p = Bot.p(); const f = G.frame; const s = Math.round(p.supUsed);
    Bot.idleWorkersMine();
    Bot.saveFor = null;
    if (this.idx < this.order.length) { const [at, id] = this.order[this.idx]; if (s >= at) { const need = this.order.slice(0, this.idx + 1).filter(o => o[1] === id).length; if (Bot.mine(u => u.def.id === id).length >= need) this.idx++; else if (Bot.count(id) < need) { const py = Bot.mine(u => u.def.id === 'pylon' && u.done); const near = id === 'pylon' ? null : (py.length ? py[Math.floor(R.next() * py.length)] : null); if (id !== 'pylon' && !near) { } else if (!Bot.build(id, near, { hotkey: this.idx % 2 === 1 })) Bot.saveFor = [DATA.buildings[id].min, DATA.buildings[id].gas]; } } }
    if (p.supMax - p.supUsed < 4 && Bot.count('pylon') <= Bot.mine(u => u.def.id === 'pylon').length && p.minerals >= 100) Bot.build('pylon');
    if (Bot.count('probe') < 22 + 8 * Math.max(0, Bot.mine(u => u.def.depot && u.done).length - 1)) Bot.train('nexus', 'probe', 2, f % 2 === 0);
    Bot.gasWorkers(3);
    if (Bot.has('cybernetics_core')) Bot.research('cybernetics_core', 'singularity');
    if (Bot.has('forge')) { Bot.research('forge', 'gW'); Bot.research('forge', 'gA'); }
    if (Bot.has('citadel_of_adun')) Bot.research('citadel_of_adun', 'leg_enhancements');
    if (Bot.has('templar_archives')) { Bot.research('templar_archives', 'psi_storm_tech'); Bot.research('templar_archives', 'hallucination_tech'); Bot.research('templar_archives', 'mind_control_tech'); Bot.research('templar_archives', 'maelstrom_tech'); }
    if (Bot.has('robotics_support_bay')) Bot.research('robotics_support_bay', 'scarab_damage');
    if (Bot.has('arbiter_tribunal')) { Bot.research('arbiter_tribunal', 'recall_tech'); Bot.research('arbiter_tribunal', 'stasis_tech'); }
    if (Bot.has('fleet_beacon')) { Bot.research('fleet_beacon', 'carrier_capacity'); Bot.research('fleet_beacon', 'disruption_web_tech'); }
    if (p.minerals >= 100) { if (Bot.has('cybernetics_core') && p.gas >= 50 && f % 3) Bot.train('gateway', 'dragoon', 2, f % 2 === 0); else Bot.train('gateway', 'zealot', 2, f % 2 === 0); if (Bot.has('templar_archives') && Bot.mine(u => u.def.id === 'high_templar').length < 4) Bot.train('gateway', 'high_templar'); if (Bot.has('templar_archives') && Bot.mine(u => u.def.id === 'dark_templar').length < 3 && f % 4 === 0) Bot.train('gateway', 'dark_templar'); }
    if (Bot.has('robotics_facility')) { if (!Bot.mine(u => u.def.id === 'shuttle').length) Bot.train('robotics_facility', 'shuttle'); else if (Bot.has('observatory') && Bot.mine(u => u.def.id === 'observer').length < 2) Bot.train('robotics_facility', 'observer'); else if (Bot.has('robotics_support_bay') && Bot.mine(u => u.def.id === 'reaver').length < 2) Bot.train('robotics_facility', 'reaver'); }
    if (Bot.has('stargate')) { if (Bot.mine(u => u.def.id === 'corsair').length < 2) Bot.train('stargate', 'corsair'); else if (Bot.has('arbiter_tribunal') && Bot.mine(u => u.def.id === 'arbiter').length < 1) Bot.train('stargate', 'arbiter'); else if (Bot.has('fleet_beacon') && Bot.mine(u => u.def.id === 'carrier').length < 2) Bot.train('stargate', 'carrier'); }
    for (const r of Bot.mine(u => u.def.id === 'reaver' && !u.prod.length && u.scarabs < 5)) { if (p.minerals < 15) break; Bot.select([r]); Bot.key('B'); if (!r.prod.length) Bot.issues.push('build scarab hotkey did nothing: sel=' + UI.selection.map(u => u.def.id).join(',') + ' disabled=' + r.disabled + ' scarabs=' + r.scarabs + ' min=' + Math.floor(p.minerals) + ' card=' + UI.currentCard().map(b => b.label).join('/')); }
    for (const c of Bot.mine(u => u.def.id === 'carrier' && !u.prod.length && u.interceptors < 4)) { Bot.select([c]); Bot.key('I'); }
    if (f > 24 * 60 * 7 && !this.done.expand && p.minerals >= 400) { if (Bot.build('nexus', null, { expand: true })) this.done.expand = true; }
    // archon merge when 4+ HTs; dark archon once
    const hts = Bot.mine(u => u.def.id === 'high_templar' && u.order.type !== 'merge'); if (hts.length >= 4 && f % 5 === 0) { Bot.select(hts.slice(0, 2)); Bot.key('W'); Bot.log('archon merge ' + hts[0].order.type); if (hts[0].order.type !== 'merge') Bot.issues.push('archon merge hotkey did nothing'); }
    const dts = Bot.mine(u => u.def.id === 'dark_templar' && u.order.type !== 'merge'); if (dts.length >= 3 && !this.done.darchon && f % 5 === 0) { Bot.select(dts.slice(0, 2)); Bot.key('W'); this.done.darchon = true; }
    // storms / hallucination
    for (const ht of Bot.mine(u => u.def.id === 'high_templar' && u.energy >= 75)) if (p.hasTech('psi_storm_tech')) { const e = G.near(ht.x, ht.y, 9 * TILE).find(o => o.owner !== G.human && !o.isBuilding); if (e) { Bot.ability(ht, 'psi_storm', null, e.x, e.y); break; } else if (p.hasTech('hallucination_tech') && ht.energy >= 100 && f % 6 === 0) { const z = Bot.mine(u => u.def.id === 'dragoon')[0]; if (z) Bot.ability(ht, 'hallucination', z); } }
    for (const da of Bot.mine(u => u.def.id === 'dark_archon' && u.energy >= 50)) { const e = G.near(da.x, da.y, 9 * TILE).find(o => o.owner !== G.human && !o.isBuilding); if (!e) continue; if (e.maxEnergy && e.energy > 30) Bot.ability(da, 'feedback', e); else if (p.hasTech('mind_control_tech') && da.energy >= 150) Bot.ability(da, 'mind_control', e); else if (p.hasTech('maelstrom_tech') && da.energy >= 100 && e.def.bio) Bot.ability(da, 'maelstrom', null, e.x, e.y); }
    for (const ar of Bot.mine(u => u.def.id === 'arbiter')) { const e = G.near(ar.x, ar.y, 9 * TILE).find(o => o.owner !== G.human && !o.isBuilding); if (e && p.hasTech('stasis_tech') && ar.energy >= 100) Bot.ability(ar, 'stasis_field', null, e.x, e.y); else if (p.hasTech('recall_tech') && ar.energy >= 150 && f % 8 === 0) { const a = Bot.army().filter(u => !u.fly)[0]; if (a) Bot.ability(ar, 'recall', null, a.x, a.y); } }
    for (const co of Bot.mine(u => u.def.id === 'corsair' && u.energy >= 125)) if (p.hasTech('disruption_web_tech')) { const e = G.near(co.x, co.y, 9 * TILE).find(o => o.owner !== G.human && o.isBuilding && (o.def.gw || o.def.aw)); if (e) Bot.ability(co, 'disruption_web', null, e.x, e.y); }
    // shuttle: pick up 4 zealots (shuttle right-clicks units), drop at enemy natural
    const sh = Bot.mine(u => u.def.id === 'shuttle')[0];
    if (sh && !this.drop) { const zs = Bot.mine(u => u.def.id === 'zealot' && u.order.type !== 'attack' && !u.inside).slice(0, 4); if (zs.length >= 4) { this.drop = { t0: f, phase: 'load' }; Bot.select([sh]); for (const z of zs) Bot.rclickOn(z, true); } }
    if (sh && this.drop) { const d = this.drop; if (d.phase === 'load' && (sh.cargo.length >= 4 || f - d.t0 > 24 * 30)) { d.phase = 'fly'; d.t0 = f; const nat = G.map.bases.find(b => b.natural && b.quadrant === Bot.en().startBase.quadrant) || Bot.en().startBase; Bot.select([sh]); Bot.rclick(nat.cx, nat.cy); Bot.button('Unload'); Bot.lclick(nat.cx, nat.cy + 40, true); } else if (d.phase === 'fly' && (!sh.cargo.length || f - d.t0 > 24 * 120)) { d.phase = 'done'; Bot.log('shuttle drop finished cargo=' + sh.cargo.length); Bot.select([sh]); Bot.rclick(p.startX, p.startY); } }
    // observer follows army
    for (const ob of Bot.mine(u => u.def.id === 'observer' && u.order.type === 'idle')) { const a = Bot.army()[0]; if (a) { Bot.select([ob]); Bot.rclickOn(a); } }
    const army = Bot.army().filter(u => u.def.id !== 'interceptor' && u.def.id !== 'scarab'); if (Bot.defend(army)) return; const rally = { x: p.startX + (G.map.w * TILE / 2 - p.startX) * 0.25, y: p.startY + (G.map.h * TILE / 2 - p.startY) * 0.25 };
    if (f % 8 === 0 && army.length) Bot.group(1, army.slice(0, 12));
    const sup = army.reduce((a, u) => a + u.def.sup, 0);
    if (!this.attacking && sup >= 30) { this.attacking = f; const t = Bot.enemyTarget(); if (t) { Bot.key('1'); Bot.key('a'); Bot.lclick(t.x, t.y); Bot.attackMove(army.filter(u => !UI.selection.includes(u)).slice(0, 12), t.x, t.y); for (const ht of Bot.mine(u => u.def.id === 'high_templar' || u.def.id === 'dark_archon' || u.def.id === 'arbiter')) { Bot.select([ht]); Bot.rclickOn(army[0]); } Bot.log('ATTACK with ' + army.length); } }
    else if (this.attacking && f - this.attacking > 24 * 120) this.attacking = 0;
    else if (!this.attacking) { const idle = army.filter(u => u.order.type === 'idle' && distPt(u.x, u.y, rally.x, rally.y) > 5 * TILE); if (idle.length) Bot.attackMove(idle.slice(0, 12), rally.x + (R.next() - .5) * 96, rally.y + (R.next() - .5) * 96); }
    if (f % 9 === 0) { const u = Bot.pick(army); if (u) { Bot.select([u]); Bot.key('p'); Bot.lclick(u.x + 100, u.y); Bot.rclick(u.x + 60, u.y + 60, true); Bot.key('s'); } }
    if (f % 11 === 0) { const b = Bot.mine(u => u.isBuilding && u.done && u.def.produces.length)[0]; if (b) { Bot.select([b]); Bot.rclick(rally.x, rally.y); } }
  },
};
const Z = {
  order: [[9, 'spawning_pool'], [11, 'hatchery'], [13, 'extractor'], [16, 'hydralisk_den'], [18, 'creep_colony'], [20, 'evolution_chamber'], [22, 'lair'], [26, 'creep_colony'], [30, 'spire'], [34, 'queens_nest'], [38, 'hatchery'], [44, 'hive'], [48, 'ultralisk_cavern'], [52, 'defiler_mound'], [56, 'nydus_canal'], [60, 'greater_spire'], [70, 'hatchery']],
  idx: 0, done: {},
  think() {
    const p = Bot.p(); const f = G.frame; const s = Math.round(p.supUsed);
    Bot.idleWorkersMine();
    Bot.saveFor = null;
    if (this.idx < this.order.length) { const [at, id] = this.order[this.idx]; if (s >= at) { const def = DATA.buildings[id]; const need = this.order.slice(0, this.idx + 1).filter(o => o[1] === id).length; const have = Bot.mine(u => u.def.id === id || (id === 'hatchery' && (u.def.id === 'lair' || u.def.id === 'hive')) || (id === 'lair' && u.def.id === 'hive') || (id === 'spire' && u.def.id === 'greater_spire')).length; if (have >= need) this.idx++; else if (def.tier === 'morph') { const from = id === 'lair' ? 'hatchery' : id === 'hive' ? 'lair' : 'spire'; if (p.hasReq(def) && !Bot.mine(u => u.def.id === from && u.prod.length).length && !Bot.morph(from, id)) Bot.saveFor = [def.min, def.gas]; } else if (Bot.count(id) < need) { const ok = (id === 'hatchery' && this.idx > 3) ? Bot.build(id, null, { expand: true }) : Bot.build(id, null, { hotkey: this.idx % 2 === 0 }); if (!ok) Bot.saveFor = [def.min, def.gas]; } } }
    if (p.supMax - p.supUsed < 4 + 2 * Bot.mine(u => u.def.larva).length && Bot.count('overlord') - Bot.mine(u => u.def.id === 'overlord').length < (p.supMax - p.supUsed < 2 ? 3 : 1) && p.minerals >= 100 && p.supMax < 200) { Bot.saveFor = null; Bot.larva('overlord', f % 2 === 0); if (p.supMax - p.supUsed < 2) Bot.larva('overlord'); }
    if (Bot.count('drone') < 14 + 8 * Math.max(0, Bot.mine(u => u.def.depot && u.done).length - 1) && Bot.mine(u => u.def.larva).length >= 1 && f % 2 === 0) Bot.larva('drone', f % 4 === 0);
    if (p.minerals > 2000 && Bot.count('hatchery') + Bot.mine(u => u.def.id === 'lair' || u.def.id === 'hive').length < 5) Bot.build('hatchery');
    Bot.gasWorkers(3);
    if (Bot.has('spawning_pool')) Bot.research('spawning_pool', 'metabolic');
    if (Bot.has('hydralisk_den')) { Bot.research('hydralisk_den', 'muscular'); Bot.research('hydralisk_den', 'grooved'); if (Bot.has('lair')) Bot.research('hydralisk_den', 'lurker_aspect'); }
    if (Bot.has('evolution_chamber')) { Bot.research('evolution_chamber', 'missW'); Bot.research('evolution_chamber', 'carapace'); }
    if (Bot.has('lair')) { Bot.research('lair', 'burrow_tech'); Bot.research('lair', 'ventral_sacs'); Bot.research('lair', 'pneumatized'); }
    if (Bot.has('queens_nest')) { Bot.research('queens_nest', 'spawn_broodling_tech'); Bot.research('queens_nest', 'ensnare_tech'); }
    if (Bot.has('defiler_mound')) { Bot.research('defiler_mound', 'consume_tech'); Bot.research('defiler_mound', 'plague_tech'); }
    if (Bot.has('spire')) Bot.research('spire', 'flyW');
    // creep colonies -> sunken / spore
    for (const c of Bot.mine(u => u.def.id === 'creep_colony' && u.done && !u.prod.length)) { Bot.select([c]); Bot.key(Bot.has('evolution_chamber') && Bot.mine(u => u.def.id === 'spore_colony').length < 1 ? 'P' : 'S'); }
    // army production from larva
    for (let k = 0; k < (p.minerals > 1000 ? 3 : 1); k++) if (Bot.has('spawning_pool') && p.minerals >= 50) { if (Bot.has('hydralisk_den') && p.gas >= 25 && f % 3) Bot.larva('hydralisk', f % 2 === 0); else if (Bot.has('spire') && p.gas >= 100 && Bot.mine(u => u.def.id === 'mutalisk').length < 8 && f % 2) Bot.larva('mutalisk'); else if (Bot.has('ultralisk_cavern') && p.gas >= 200 && f % 3 === 0) Bot.larva('ultralisk'); else if (Bot.has('defiler_mound') && Bot.mine(u => u.def.id === 'defiler').length < 2 && p.gas >= 150) Bot.larva('defiler'); else if (Bot.has('queens_nest') && Bot.mine(u => u.def.id === 'queen').length < 2 && p.gas >= 100) Bot.larva('queen'); else Bot.larva('zergling', f % 2 === 0); }
    // lurker morph
    if (p.hasTech('lurker_aspect') && p.minerals >= 50 && p.gas >= 100 && Bot.mine(u => u.def.id === 'lurker' || u.def.id === 'lurker_egg').length < 4) { const h = Bot.mine(u => u.def.id === 'hydralisk' && u.order.type !== 'attack')[0]; if (h) { Bot.select([h]); Bot.key('L'); } }
    if (Bot.has('greater_spire') && p.gas >= 100) { const m = Bot.mine(u => u.def.id === 'mutalisk')[0]; if (m) { Bot.select([m]); Bot.key(f % 2 ? 'G' : 'V'); } }
    // burrow lurkers near enemies; burrow zerglings at home
    for (const l of Bot.mine(u => u.def.id === 'lurker' && u.transT <= 0)) { const near = G.near(l.x, l.y, 7 * TILE).some(o => o.owner !== G.human && !o.fly && !o.def.larva); if (near && !l.burrowed) Bot.ability(l, 'burrow'); else if (!near && l.burrowed && f % 6 === 0) Bot.ability(l, 'burrow'); }
    if (p.hasTech('burrow_tech') && f % 10 === 0) { const z = Bot.mine(u => u.def.id === 'zergling' && u.order.type === 'idle' && !u.burrowed)[0]; if (z) Bot.ability(z, 'burrow'); }
    // queen spells, defiler spells
    for (const q of Bot.mine(u => u.def.id === 'queen')) { const e = G.near(q.x, q.y, 9 * TILE).find(o => o.owner !== G.human && !o.isBuilding && !o.fly); if (e && q.energy >= 150 && p.hasTech('spawn_broodling_tech') && !NO_BROODLING.has(e.def.id)) Bot.ability(q, 'spawn_broodling', e); else if (e && q.energy >= 75 && p.hasTech('ensnare_tech')) Bot.ability(q, 'ensnare', null, e.x, e.y); else if (q.energy >= 75 && f % 8 === 0) { const w = G.units.find(o => o.alive && o.owner !== G.human && o.def.worker && G.canSee(G.human, o)); if (w) Bot.ability(q, 'parasite', w); } const cc = G.units.find(o => o.alive && o.owner !== G.human && o.def.id === 'command_center' && o.done && o.hp < o.maxHp * 0.5 && !o.lifted); if (cc) Bot.ability(q, 'infest', cc); }
    for (const d of Bot.mine(u => u.def.id === 'defiler')) { const own = G.near(d.x, d.y, 8 * TILE).filter(o => o.owner === G.human && o.hasWeapon() && !o.fly && !o.isBuilding && G.frame - o.lastHit < 48); if (own.length && d.energy >= 100 && !Abilities.inField(own[0].x, own[0].y, 'swarm')) Bot.ability(d, 'dark_swarm', null, own[0].x, own[0].y); else { const e = G.near(d.x, d.y, 9 * TILE).find(o => o.owner !== G.human && !o.isBuilding); if (e && d.energy >= 150 && p.hasTech('plague_tech')) Bot.ability(d, 'plague', null, e.x, e.y); else if (d.energy < 100 && p.hasTech('consume_tech')) { const z = G.near(d.x, d.y, 2 * TILE).find(o => o.owner === G.human && o.def.id === 'zergling'); if (z) Bot.ability(d, 'consume', z); } } }
    // nydus: build the exit next to our furthest hatchery, then send lings through
    const canal = Bot.mine(u => u.def.id === 'nydus_canal' && u.done && !u.nydusLink)[0];
    if (canal && !this.done.nydus) { const hatch = Bot.mine(u => u.def.spawnsLarva && u.done).sort((a, b) => distPt(b.x, b.y, p.startX, p.startY) - distPt(a.x, a.y, p.startX, p.startY))[0]; if (hatch) { Bot.select([canal]); Bot.button('Build Nydus Exit'); Bot.lclick(hatch.x + 5 * TILE, hatch.y); this.done.nydus = f; Bot.log('nydus exit ' + (canal.nydusLink ? 'placed' : 'FAILED')); if (!canal.nydusLink) Bot.issues.push('nydus exit could not be placed'); } }
    const canalL = Bot.mine(u => u.def.id === 'nydus_canal' && u.done && u.nydusLink && u.nydusLink.alive && u.nydusLink.done)[0]; if (canalL && f % 6 === 0) { const zs = Bot.mine(u => u.def.id === 'zergling' && u.order.type === 'idle' && !u.burrowed).slice(0, 4); if (zs.length) { Bot.select(zs); Bot.rclickOn(canalL); } }
    // overlord drop (ventral sacs)
    const ov = Bot.mine(u => u.def.id === 'overlord')[0];
    if (ov && p.hasTech('ventral_sacs') && !this.drop) { const zs = Bot.mine(u => u.def.id === 'zergling' && u.order.type !== 'attack' && !u.inside).slice(0, 8); if (zs.length >= 4) { this.drop = { t0: f, phase: 'load' }; Bot.select(zs); Bot.rclickOn(ov); } }
    if (ov && this.drop) { const d = this.drop; if (d.phase === 'load' && (ov.cargo.length >= 4 || f - d.t0 > 24 * 30)) { d.phase = 'fly'; d.t0 = f; const nat = G.map.bases.find(b => b.natural && b.quadrant === Bot.en().startBase.quadrant) || Bot.en().startBase; Bot.select([ov]); Bot.rclick(nat.cx, nat.cy); Bot.key('U'); Bot.lclick(nat.cx, nat.cy + 40, true); } else if (d.phase === 'fly' && (!ov.cargo.length || f - d.t0 > 24 * 150)) { d.phase = 'done'; Bot.log('overlord drop finished cargo=' + ov.cargo.length); } }
    if (f > 24 * 60 * 8 && !this.done.expand && p.minerals >= 300) { if (Bot.build('hatchery', null, { expand: true })) this.done.expand = true; }
    const army = Bot.army().filter(u => u.def.id !== 'broodling'); if (Bot.defend(army)) return; const rally = { x: p.startX + (G.map.w * TILE / 2 - p.startX) * 0.25, y: p.startY + (G.map.h * TILE / 2 - p.startY) * 0.25 };
    if (f % 8 === 0 && army.length) Bot.group(1, army.slice(0, 12));
    const sup = army.reduce((a, u) => a + u.def.sup, 0);
    if (!this.attacking && sup >= 30) { this.attacking = f; const t = Bot.enemyTarget(); if (t) { Bot.key('1'); Bot.key('a'); Bot.lclick(t.x, t.y); Bot.attackMove(army.filter(u => !UI.selection.includes(u) && !u.burrowed).slice(0, 12), t.x, t.y); for (const c of Bot.mine(u => u.def.id === 'defiler' || u.def.id === 'queen')) { Bot.select([c]); Bot.rclickOn(army[0]); } Bot.log('ATTACK with ' + army.length); } }
    else if (this.attacking && f - this.attacking > 24 * 120) this.attacking = 0;
    else if (!this.attacking) { const idle = army.filter(u => u.order.type === 'idle' && !u.burrowed && distPt(u.x, u.y, rally.x, rally.y) > 5 * TILE); if (idle.length) Bot.attackMove(idle.slice(0, 12), rally.x + (R.next() - .5) * 96, rally.y + (R.next() - .5) * 96); }
    if (f % 9 === 0) { const u = Bot.pick(army.filter(x => !x.burrowed)); if (u) { Bot.select([u]); Bot.key('p'); Bot.lclick(u.x + 100, u.y); Bot.rclick(u.x + 60, u.y + 60, true); } }
    if (f % 11 === 0) { const b = Bot.mine(u => u.isBuilding && u.done && u.def.spawnsLarva)[0]; if (b) { Bot.select([b]); Bot.rclick(rally.x, rally.y); } }
    for (const o of Bot.mine(u => u.def.id === 'overlord' && u.order.type === 'idle' && u !== ov).slice(0, 2)) if (f % 7 === 0) { Bot.select([o]); Bot.rclick(rally.x + (R.next() - .5) * 200, rally.y + (R.next() - .5) * 200); }
  },
};
this.SCRIPTS = { T, P, Z };
