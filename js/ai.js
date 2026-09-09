'use strict';
// ============================================================================
// Computer opponent: scripted opening, macro loop, army control, basic micro.
// ============================================================================
// covert_ops was in no script, so the AI could not build a ghost -- req: ['academy','covert_ops'] --
// or a nuclear silo, ever, in any matchup. It needs a science facility of its own: both Terran science
// add-ons name science_facility as their parent and AI.addon() looks for a parent that has none, so the
// one facility in the script was always already spoken for by physics_lab.
// Where these sit in the order is a balance question and is deliberately not being guessed at here --
// they are appended at the supply the rest of the late game already sits at.
// Steps MUST be in ascending supply order. script() scans forward from the first thing it still owes
// and breaks on `p.supUsed < s[i][0]`, so a single out-of-order entry hides every step behind it until
// supply catches up to it. One 29 sitting between a 27 and a 28 cost Protoss its whole tech tree --
// templar archives reached at 17 minutes and never finished, and no templar, dark archon or arbiter in
// six games. test/aiscripts.js asserts the ordering now.
const AI_SCRIPTS = {
  T: [[9, 'supply_depot'], [11, 'barracks'], [12, 'refinery'], [15, 'supply_depot'], [16, 'factory'], [19, 'supply_depot'], [20, 'machine_shop'], [22, 'academy'], [23, 'bunker'], [24, 'command_center'], [25, 'engineering_bay'], [26, 'supply_depot'], [28, 'factory'], [30, 'comsat_station'], [32, 'armory'], [34, 'supply_depot'], [36, 'starport'], [38, 'science_facility'], [40, 'machine_shop'], [42, 'control_tower'], [44, 'barracks'], [46, 'command_center'], [50, 'factory'], [56, 'missile_turret'], [60, 'physics_lab'], [62, 'science_facility'], [64, 'starport'], [66, 'covert_ops'], [68, 'nuclear_silo'], [70, 'barracks'], [80, 'factory']],
  Z: [[11, 'spawning_pool'], [12, 'hatchery'], [13, 'extractor'], [16, 'hydralisk_den'], [18, 'creep_colony'], [19, 'sunken_colony'], [20, 'lair'], [22, 'extractor'], [24, 'hatchery'], [26, 'spire'], [28, 'evolution_chamber'], [30, 'creep_colony'], [31, 'spore_colony'], [32, 'defiler_mound'], [34, 'hatchery'], [38, 'creep_colony'], [44, 'queens_nest'], [48, 'extractor'], [52, 'hive'], [56, 'creep_colony'], [60, 'ultralisk_cavern'], [64, 'hatchery'], [68, 'nydus_canal'], [70, 'greater_spire'], [80, 'hatchery']],
  P: [[8, 'pylon'], [10, 'gateway'], [12, 'assimilator'], [14, 'cybernetics_core'], [15, 'pylon'], [18, 'gateway'], [20, 'nexus'], [22, 'pylon'], [24, 'citadel_of_adun'], [26, 'forge'], [27, 'pylon'], [28, 'robotics_facility'], [29, 'shield_battery'], [30, 'observatory'], [32, 'templar_archives'], [34, 'gateway'], [36, 'pylon'], [38, 'photon_cannon'], [40, 'gateway'], [42, 'stargate'], [44, 'nexus'], [46, 'arbiter_tribunal'], [48, 'pylon'], [50, 'robotics_support_bay'], [52, 'fleet_beacon'], [56, 'gateway'], [66, 'gateway'], [72, 'stargate'], [80, 'nexus']],
};
const gasBuildings = ai => ai.mine(u => u.def.onGeyser).length + 1;
const AI_COMP = {
  T: [['marine', 6], ['medic', 2], ['firebat', 1], ['ghost', 1], ['vulture', 2], ['siege_tank', 4], ['goliath', 2], ['science_vessel', 1], ['wraith', 1], ['valkyrie', 1], ['dropship', 1], ['battlecruiser', 2]],
  Z: [['zergling', 4], ['hydralisk', 6], ['mutalisk', 4], ['scourge', 1], ['ultralisk', 3], ['defiler', 1], ['queen', 1]],
  // Terran had no per-matchup composition at all, so it built the same mech-heavy army into everyone --
  // and test/duel.js prices that army against Protoss at 0 wins in 8, a mean supply margin of -14.5.
  // The same test has Terran BIO beating the same Protoss army 5 of 8. Terran was building precisely the
  // thing Protoss is best against, in the one matchup this project has measured formally outside 60/40
  // (P 66% [61-71]). Bio-heavy here, with tanks kept for the siege line rather than as the core.
  TvP: [['marine', 8], ['medic', 3], ['firebat', 2], ['ghost', 1], ['vulture', 1], ['siege_tank', 3], ['goliath', 2], ['science_vessel', 1], ['wraith', 1], ['valkyrie', 1], ['dropship', 1], ['battlecruiser', 1]],
  ZvT: [['zergling', 3], ['hydralisk', 5], ['mutalisk', 5], ['scourge', 1], ['ultralisk', 4], ['defiler', 2], ['queen', 1]],
  PvZ: [['zealot', 2], ['dragoon', 8], ['high_templar', 3], ['dark_templar', 1], ['reaver', 1], ['shuttle', 1], ['observer', 3], ['corsair', 2], ['scout', 1], ['carrier', 1], ['arbiter', 1]],
  ZvP: [['zergling', 3], ['hydralisk', 6], ['mutalisk', 3], ['scourge', 1], ['ultralisk', 3], ['defiler', 1], ['queen', 1]],
  P: [['zealot', 4], ['dragoon', 5], ['high_templar', 2], ['dark_templar', 1], ['reaver', 1], ['shuttle', 1], ['observer', 1], ['corsair', 1], ['scout', 1], ['carrier', 2], ['arbiter', 1]],
};
const AI_RESEARCH = {
  T: ['stim', 'siege_tech', 'u238', 'infW', 'infA', 'ion_thrusters', 'spider_mines_tech', 'vehW', 'charon', 'vehA', 'irradiate_tech', 'emp_tech', 'personnel_cloaking', 'lockdown_tech', 'yamato_tech', 'shipW', 'cloaking_field', 'suppress_inf', 'suppress_veh', 'restoration_tech', 'optical_flare_tech', 'caduceus', 'moebius', 'ocular', 'apollo', 'titan', 'colossus'],
  Z: ['metabolic', 'flyW', 'lurker_aspect', 'carapace', 'meleeW', 'grooved', 'muscular', 'missW', 'flyA', 'burrow_tech', 'pneumatized', 'anabolic', 'chitinous', 'adrenal', 'consume_tech', 'plague_tech', 'suppress_hyd', 'suppress_air', 'spawn_broodling_tech', 'ensnare_tech', 'ventral_sacs', 'antennae', 'gamete', 'metasynaptic'],
  P: ['singularity', 'gW', 'leg_enhancements', 'gA', 'psi_storm_tech', 'shields', 'scarab_damage', 'gravitic_drive', 'airW', 'carrier_capacity', 'stasis_tech', 'khaydarin_amulet', 'airA', 'recall_tech', 'suppress_gate', 'suppress_bay', 'maelstrom_tech', 'mind_control_tech', 'hallucination_tech', 'disruption_web_tech', 'reaver_capacity', 'gravitic_boosters', 'sensor_array', 'apial_sensors', 'gravitic_thrusters', 'argus_talisman', 'argus_jewel', 'khaydarin_core'],
};
class AI {
  constructor(p, diff) {
    this.p = p; this.diff = diff; this.step = 0; this.pending = {}; this.lastThink = 0; this.lastArmy = 0; this.state = 'gather'; this.target = null; this.attackN = 0; this.attackThreshold = (diff === 'easy' ? 40 : diff === 'hard' ? 24 : 30) + 4; this.waves = 0; this.scouted = false; this.dropOp = null; this.lastDrop = 0;
    this.thinkEvery = diff === 'easy' ? 72 : diff === 'hard' ? 20 : 32; this.scriptIdx = 0; this.lastExpand = 0; this.rally = null; this.startedAttack = 0; this.reserveMin = 0; this.reserveGas = 0;
  }
  // money set aside for the building the script/expansion logic is waiting to afford; workers, supply and gas ignore it
  afford(min, gas) { const m = this.p.minerals, g = this.p.gas; if (min && this.reserveMin && m >= this.reserveMin * 0.4 && m - this.reserveMin < min) return false; if (gas && this.reserveGas && g >= this.reserveGas * 0.4 && g - this.reserveGas < gas) return false; return m >= min && g >= gas; } // once 40% of the target is banked, stop spending until it is affordable. A quarter was too eager: it froze unit production for a fifth of the game while a hall was being saved for, which is the single largest cause of idle production buildings
  reserve(def) { this.reserveMin = Math.max(this.reserveMin, def.min); this.reserveGas = Math.max(this.reserveGas, def.gas); } // hold back the single most expensive thing we are saving for, not the sum
  get race() { return this.p.race; }
  mine(pred) { const out = []; for (const u of G.units) if (u.alive && u.owner === this.p.id && pred(u)) out.push(u); return out; }
  count(id, inclProd = true) { let n = 0; for (const u of G.units) { if (!u.alive || u.owner !== this.p.id) continue; if (u.def.id === id) n++; if (inclProd) for (const it of u.prod) if (it.id === id) n++; if (u.order.type === 'build' && u.order.def.id === id) n++; } if (this.pending[id] && G.frame - this.pending[id] < 360) n++; return n; }
  halls() { return this.mine(u => u.isBuilding && u.def.depot && !u.lifted); }
  enemies() { return G.players.filter(q => !G.allied(q.id, this.p.id) && !q.defeated); }
  tick() {
    if (this.p.defeated) return;
    if (G.frame - this.lastThink < this.thinkEvery) { if (G.frame % 12 === 0) this.micro(); return; }
    this.lastThink = G.frame;
    this.reserveMin = 0; this.reserveGas = 0;
    for (const w of this.mine(u => u.def.worker && u.order.type === 'build' && u.order.def)) this.reserve(w.order.def); // keep the money for buildings a worker is walking to
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
      let want = workers.length < 11 ? (gi === 0 ? 2 : 0) : workers.length < 18 ? 3 : 3;
      if (p.gas > 800 && p.minerals < 300) want = Math.min(want, 1); if ((p.gas > 400 && p.minerals < 150) || p.gas > 1500) want = 0;
      if (on.length < want) { const cands = workers.filter(w => w.order.type === 'gather' && w.order.target && w.order.target.type === 'mineral' && !w.carrying && dist(w, g) < 20 * TILE); cands.sort((a, b) => dist(a, g) - dist(b, g)); for (let i = 0; i < want - on.length && i < cands.length; i++) cands[i].applyOrder({ type: 'gather', target: g, phase: 'goto' }); }
      else if (on.length > want) { const m = G.findNearestResource(on[0], 'mineral'); if (m) on[0].applyOrder({ type: 'gather', target: m, phase: 'goto' }); }
    });
    // worker production
    const fields = G.map.resources.filter(r => r.type === 'mineral' && r.amount > 0 && halls.some(h => h.done && distPt(r.cx, r.cy, h.x, h.y) < 10 * TILE)).length; const want = Math.min(70, fields * 2 + gasB.length * 3 + 2);
    const armySup = this.armyUnits().reduce((s, u) => s + u.def.sup, 0); this.armySup = armySup;
    // "Drones only once the army keeps up" -- which, until M8, only Zerg ever did. The non-Zerg branch
    // used to read `larvaN >= 2 || workers.length < 12 || armySup >= ...`, and larvaN was
    // `this.race === 'Z' ? <count larvae> : 9`. It is only read here, on the branch where it is the
    // literal 9, so `larvaN >= 2` was a constant true that short-circuited the army test written
    // beside it: Terran and Protoss built workers to the cap unconditionally and always had.
    //
    // It cost nothing while Terran could not reach the cap anyway. M7's build-order fix removed that
    // limit -- Terran went from 40 workers at ten minutes to 62 and TvZ went to 77% -- and this is the
    // half of that change nobody had looked at. The other reading of the same slip, that `larvaN >= 2`
    // was meant for the *Zerg* branch, was tried too: it is much worse (all three proxy indicators
    // move to Terran), because a larva-gated Zerg drones to 60 and fields no army.
    if (this.count(RACE_INFO[p.race].worker) < want && (p.race !== 'Z' ? (workers.length < 12 || armySup >= workers.length * 0.4) : (workers.length < 16 || armySup >= (workers.length - 16) * 1.5))) this.train(RACE_INFO[p.race].worker, 2);
    // transfer workers from saturated to new bases
    if (G.frame % (24 * 10) < this.thinkEvery && halls.length > 1) {
      for (const h of halls) { const near = workers.filter(w => dist(w, h) < 12 * TILE); const fields = G.map.resources.filter(r => r.type === 'mineral' && distPt(r.cx, r.cy, h.x, h.y) < 10 * TILE).length; if (near.length > fields * 2 + 3) { const other = halls.find(o => o !== h && o.done && workers.filter(w => dist(w, o) < 12 * TILE).length < 8); if (other) { const m = G.map.resources.find(r => r.type === 'mineral' && distPt(r.cx, r.cy, other.x, other.y) < 10 * TILE); if (m) for (let i = 0; i < 4; i++) { const w = near.find(w => w.order.type === 'gather' && !w.carrying); if (w) w.applyOrder({ type: 'gather', target: m, phase: 'goto' }); } } } }
    }
  }
  supply() {
    const p = this.p; if (p.supMax >= 200) return;
    const prodN = this.mine(u => u.isBuilding && u.def.produces.length && u.done).length + (p.race === 'Z' ? this.halls().length : 0);
    // A depot takes 25 s to finish and late-game production eats supply faster than that, so the margin
    // has to scale with how much production is actually running. Measured with test/aiaudit.js: the AI
    // was supply blocked 13% of the time, which no human would tolerate.
    const margin = 6 + prodN * 3;
    if (p.supMax - p.supUsed < margin) {
      const sid = RACE_INFO[p.race].supply;
      if (p.race === 'Z') { const inFlight = this.count('overlord') - this.mine(u => u.def.id === 'overlord').length; if (inFlight < (p.supMax - p.supUsed < 4 ? 3 : prodN > 4 ? 2 : 1)) this.train('overlord', 1); }
      else if (this.count(sid) - this.mine(u => u.def.id === sid && u.done).length < 1 + (prodN > 4 ? 1 : 0) + (prodN > 8 ? 1 : 0)) this.build(sid, p.supMax - p.supUsed < 4); // more than one in flight once there is real production to feed
    }
  }
  // how many buildings are being built or walked to right now (a human never starts five things at once)
  underway() { return this.mine(u => (u.isBuilding && !u.done && u.def.tier !== 'addon') || (u.def.worker && u.order.type === 'build' && u.order.def)).length; }
  // how many of a scripted building we already own; a morph counts as the thing it grew out of
  scriptHave(cnt, id) { return (cnt[id] || 0) + (id === 'hatchery' ? (cnt.lair || 0) + (cnt.hive || 0) : id === 'lair' ? (cnt.hive || 0) : id === 'spire' ? (cnt.greater_spire || 0) : id === 'creep_colony' ? (cnt.sunken_colony || 0) + (cnt.spore_colony || 0) : 0); }
  // A build order is not a queue. It used to be run strictly at the head: one step that could not be
  // started froze everything behind it until a 200-second timer threw the step away for good, and the
  // steps that needed it were then thrown away in turn on `req`. Over nine games that abandoned 29 steps
  // and amputated the tech tree -- Protoss finished templar archives in none of six games, so no Protoss
  // caster was ever fielded and 23 of the 28 spells never fired once (test/casters.js). A human whose
  // next building is unaffordable starts the one after it, so scan forward instead: `scriptIdx` still
  // means "the first thing we still owe", and the timer only runs when nothing in reach can be started.
  script() {
    const s = AI_SCRIPTS[this.race], p = this.p;
    const cnt = {}; for (const u of G.units) if (u.alive && u.owner === p.id) cnt[u.def.id] = (cnt[u.def.id] || 0) + 1;
    const need = i => { let n = 0; for (let k = 0; k <= i; k++) if (s[k][1] === s[i][1]) n++; return n; };
    const met = i => this.scriptHave(cnt, s[i][1]) >= need(i);
    while (this.scriptIdx < s.length && met(this.scriptIdx)) { this.scriptIdx++; this.stepT = G.frame; }
    if (this.scriptIdx >= s.length) return;
    if (this.stepT === undefined) this.stepT = G.frame;
    if (p.supUsed < s[this.scriptIdx][0]) { this.stepT = G.frame; return; }
    const under = this.underway(); const prodDone = this.mine(u => u.isBuilding && u.def.produces.length && !u.def.depot && u.done).length;
    for (let i = this.scriptIdx; i < s.length; i++) {
      if (p.supUsed < s[i][0]) break;                                    // not time for this one, nor for anything after it
      if (met(i)) continue;
      const id = s[i][1], def = DATA.buildings[id];
      if (!p.hasReq(def)) continue;
      // The head step is "the first thing we still owe", so its money should be held whether or not this
      // think can *start* it. The reserve is set only on the affordability path below, which puts it
      // behind two gates that skip the step for reasons that have nothing to do with money -- the
      // underway throttle and the gas-hungry-tech gate -- so those two release the head step's money in
      // the same breath as they refuse it. Measured over nine TvZ games with the Zerg head step on the
      // Spire (200/150): 750 think-ticks refused by the throttle and 502 by the tech gate against 925
      // for money, so on 58% of the ticks where the Spire was still owed, nothing was being saved for it.
      // It finished in 1 of 9 games, the Hive and the Cavern in none, and 11 of the 20 weight in
      // AI_COMP.ZvT therefore sits behind buildings that never exist.
      //
      // Zerg only, and the reason is measured rather than tidy. Holding the head step's money is not
      // free: it trades army now for tech on time, and because `afford` exempts workers the same brake
      // lands differently per race -- Terran pays it out of marines, Zerg pays it out of zerglings and
      // the minerals go to drones instead. Race-neutral over 128 paired ten-minute games it was a 14.7
      // supply swing towards Zerg, but decomposed that is Terran -9.6 (p = 0.000) and Zerg +5.2
      // (p = 0.001): mostly a Terran regression, and PvT has no trustworthy number to check it against.
      // Zerg is the one race whose tech tree the measurement shows amputated, so Zerg gets it.
      //
      // **This strengthens Zerg in PvZ too, by about as much as in TvZ**, and PvZ is the matchup that
      // punished the last Zerg-only lever (M8: relaxing the base-count floor for Zerg took TvZ to 65%
      // and collapsed PvZ to 11%). Proxied here at 132 ZP games: sup@10 -10.46 (p = 0.005), score@cap
      // -16.39 (p = 0.013) against TvZ's -10.78 and -18.28. PvZ has no trustworthy absolute number yet
      // -- M9 task 0 is producing it -- so the confirming run has to cover TZ *and* ZP, and if PvZ has
      // come back Zerg-favoured after the Hold Position fix then this line is the first suspect.
      // M9 measured this line and it did two things at once. TvZ went 79% -> 64% (-15, p = 0.000), which
      // is the second largest balance move in this project's history and the direction five milestones
      // had been trying to go. PvZ went 63% -> 36% for Protoss (-27, p = 0.000), which is about twice
      // what centring it needed -- Protoss went from favoured to unfavoured without stopping in between.
      // Zerg was under-built against everyone, so correcting it helped against everyone.
      //
      // Against Protoss the reserve therefore only engages once half the cost is already banked, rather
      // than from zero. That is deliberately a weaker version of the same lever and not an off switch:
      // turning it off entirely would hand PvZ back to Protoss at 63%, which is just as wrong the other
      // way. AI_COMP already carries ZvT and ZvP variants, so conditioning Zerg's economy on the
      // opponent is the idiom here rather than a special case.
      //
      // UNMEASURED. Proxy it against the shipped code before believing a number, and confirm on TZ and
      // ZP together -- TvZ must not give back the 15 points it just gained.
      const vsP = (this.enemies()[0] || {}).race === 'P';
      if (this.race === 'Z' && i === this.scriptIdx && this.count(id) <= this.scriptHave(cnt, id)
          && (!vsP || p.minerals >= def.min * 0.5)) this.reserve(def);
      if (def.tier === 'addon') { if (this.addon(id)) { this.stepT = G.frame; return; } continue; }
      if (def.tier === 'morph') { if (this.mine(u => u.prod.some(it => it.kind === 'morph' && it.id === id)).length) continue; if (this.morph(id)) { this.stepT = G.frame; return; } continue; }
      if (this.count(id) > this.scriptHave(cnt, id)) continue;           // already pending / in construction
      // Static defence is cheap and time-critical, so it must not queue behind expansions: Zerg kept letting its
      // scripted creep colonies time out while hatcheries were going up, and met the first push with no sunkens.
      if (!(def.gw || def.aw || def.id === 'creep_colony') && under >= (def.depot ? 3 : 2)) continue; // finish what is already going up first
      // gas-hungry tech waits until there is an army and enough production to use it
      if (def.gas >= 100 && !def.produces.length && (this.armySup || 0) < 16 && prodDone < 3) continue;
      if (p.minerals < def.min || p.gas < def.gas) { if (i === this.scriptIdx) this.reserve(def); continue; } // save up for the head step instead of spending on units
      // Only the head step may spend past the reserve; a step reached by scanning ahead must not eat the
      // money the step in front of it is saving for, or it would starve the thing it jumped over.
      if (this.build(id, i === this.scriptIdx && !this.mine(u => u.def.worker && u.order.type === 'build' && u.order.def).length)) { this.stepT = G.frame; return; } // a worker already walking to a site keeps its money
    }
    if (G.frame - this.stepT > 24 * 200) { this.scriptIdx++; this.stepT = G.frame; } // nothing in the whole order was startable for that long: stop asking for the head
  }
  macro() {
    const p = this.p, r = this.race; const halls = this.halls();
    // expansion when floating minerals or saturated
    const workers = this.mine(u => u.def.worker).length;
    // Expanding only on floating minerals rewards whoever spends worst: Zerg banks between larvae and takes
    // a third base, while Protoss and Terran spend every mineral and sit on two forever. Keep a base-count
    // floor that grows with the clock so every race keeps taking ground.
    const wantHalls = Math.min(G.map.bases.length, 2 + Math.floor(G.frame / (24 * 60 * 3)));
    if (G.frame - this.lastExpand > 24 * 45 && (p.minerals > 500 || workers > halls.length * 16 || halls.length < wantHalls || ((this.armySup || 0) >= 30 && halls.length < 3)) && this.count(RACE_INFO[r].hall) <= halls.length) { const hd = DATA.buildings[RACE_INFO[r].hall]; if (p.minerals < hd.min) { if (this.pickExpansion()) this.reserve(hd); } else if (this.build(RACE_INFO[r].hall, true)) this.lastExpand = G.frame; } // start saving as soon as a free base exists, or the army eats the money forever
    // more production when floating
    // production capacity should track income: roughly one production building per 4 workers
    const prodWant = Math.min(10, Math.max(2, Math.floor(workers / 4)));
    if ((p.minerals > 250 && this.scriptIdx >= 6 && this.mine(u => u.isBuilding && u.def.produces.length && !u.def.depot && u.done).length < prodWant) || p.minerals > 600) {
      if (this.underway() >= 3) return; const prodId = r === 'T' ? (this.count('factory') >= 2 && p.gas > 200 ? 'factory' : 'barracks') : r === 'P' ? 'gateway' : 'hatchery';
      if (r === 'Z' && this.count('hatchery') + this.count('lair') + this.count('hive') < 8 && workers >= 12 * this.mine(u => u.isBuilding && u.def.spawnsLarva).length) this.build('hatchery');
      else if (r !== 'Z' && this.count(prodId) < prodWant) this.build(prodId, true); // the army engine outranks whatever the script is saving for
    }
    // Zerg macro hatcheries: larvae are the bottleneck, so floating minerals with no larva means another hatchery, not more drones per hatchery
    if (r === 'Z' && ((p.minerals > 300 && !this.mine(u => u.def.larva).length) || p.minerals > 550) && workers >= 5 * this.mine(u => u.isBuilding && u.def.spawnsLarva).length && this.count('hatchery') <= this.halls().length && this.mine(u => u.isBuilding && u.def.spawnsLarva).length < 6 && halls.length) { const h = halls[Math.floor(G.rand() * halls.length)]; this.buildNear('hatchery', h.x, h.y); } // macro hatcheries go next to a base we already hold; real expansions come from the shared rule below
    // gas: one per base with hall
    if (this.scriptIdx >= 3 && workers > 5 * gasBuildings(this) && !(p.gas > 800 && p.minerals < 300)) for (const h of halls) { if (!h.done) continue; const base = G.map.bases.find(b => distPt(b.cx, b.cy, h.x, h.y) < 3 * TILE); if (base && base.geyser && base.geyser.amount > 0 && !(base.geyser.building && base.geyser.building.alive) && p.minerals >= 100 && this.count(RACE_INFO[r].gasB) <= this.mine(u => u.def.onGeyser).length) { this.buildAt(RACE_INFO[r].gasB, base.geyser.x, base.geyser.y, true); break; } } // gas pays for itself, never let the reserve block it
    // Static defence at the natural, placed on the line the enemy actually comes down rather than
    // towards the middle of the map, so an attack meets it instead of walking round it.
    if (this.scriptIdx >= 4 && p.minerals > 200) {
      for (const nat of halls.slice(1)) if (nat.done) { const defId = r === 'T' ? 'missile_turret' : r === 'P' ? 'photon_cannon' : 'creep_colony'; const en = this.enemies()[0]; const tox = en && en.startX != null ? en.startX : G.map.w * TILE / 2, toy = en && en.startY != null ? en.startY : G.map.h * TILE / 2; const px = nat.x + (tox - nat.x) * 0.15, py = nat.y + (toy - nat.y) * 0.15; const isDef = u => u.isBuilding && (u.def.id === defId || u.def.id === 'sunken_colony' || u.def.id === 'spore_colony'); const near = this.mine(u => isDef(u) && (dist(u, nat) < 16 * TILE || distPt(u.x, u.y, px, py) < 16 * TILE)).length; if (near < (r === 'Z' ? 4 : 2) && this.count(defId) <= this.mine(isDef).length && p.hasReq(DATA.buildings[defId])) { this.buildNear(defId, px, py); break; } }
    }
    // Zerg: morph creep colonies into sunkens
    if (r === 'Z') { const enemyAir = this.enemies().some(q => G.units.some(u => u.alive && u.owner === q.id && u.fly && (u.hasWeapon() || u.def.cargo))); const spores = this.mine(u => u.def.id === 'spore_colony').length, sunkens = this.mine(u => u.def.id === 'sunken_colony').length; for (const c of this.mine(u => u.def.id === 'creep_colony' && u.done && !u.prod.length)) G.queueMorph(c, p.hasBuilding('evolution_chamber') && (enemyAir ? spores < sunkens : spores < Math.floor(sunkens / 3)) ? 'spore_colony' : 'sunken_colony'); }
    // Terran addons
    if (r === 'T') { for (const b of this.mine(u => u.isBuilding && u.done && !u.addon && !u.prod.length && u.def.addons.length)) { const aid = b.def.addons[0]; if (aid === 'comsat_station' && !p.hasBuilding('academy')) continue; if (aid === 'machine_shop' || aid === 'control_tower' || aid === 'comsat_station') { if (p.minerals > 150 && p.gas > 100) G.queueAddon(b, aid); } else if (aid === 'physics_lab' && p.minerals > 300) G.queueAddon(b, aid); } }
    // Protoss: pylons when running low on power spots
    if (r === 'P' && p.minerals > 200 && this.afford(100, 0) && this.count('pylon') < 3 + this.mine(u => u.isBuilding && !u.def.psi && !u.def.depot).length / 2) this.build('pylon');
    // Zerg: lair/hive/greater spire upgrades are in script; hatchery tech at 2 hatch
  }
  production() {
    const p = this.p; const foe = this.enemies()[0]; const comp = (foe && AI_COMP[this.race + 'v' + foe.race]) || AI_COMP[this.race]; const cands = [];
    const counts = {}; for (const u of G.units) if (u.alive && u.owner === p.id) { counts[u.def.id] = (counts[u.def.id] || 0) + 1; for (const it of u.prod) if (it.kind === 'unit') counts[it.id] = (counts[it.id] || 0) + 1; }
    const enemyAir = this.enemies().some(q => G.units.some(u => u.alive && u.owner === q.id && u.fly && u.hasWeapon())) ;
    for (const [id, wgt] of comp) {
      const ud = DATA.units[id]; if (!wgt || !p.hasReq(ud)) continue;
      if (id === 'scourge' && !enemyAir) continue; if (id === 'corsair' && !enemyAir && !this.enemies().some(q => q.race === 'Z')) continue;
      if (id === 'observer' && (counts.observer || 0) >= (foe && foe.race === 'Z' ? 3 : 2)) continue;
      let w = wgt; if (this.race === 'Z' && id === 'hydralisk' && p.hasTech('lurker_aspect')) w += 2;
      if (ud.from !== 'larva' && !this.mine(b => b.isBuilding && b.done && b.def.produces.includes(id)).length) continue;
      const sup = (ud.sup || 1) * (ud.pair ? 2 : 1); cands.push([((counts[id] || 0) * sup + sup) / w, id, w, sup]); // weights are a share of army supply, so cheap units cannot crowd out the rest; w and sup ride along so the score can be recomputed after a train
    }
    cands.sort((a, b) => a[0] - b[0]);
    if (!cands.length) return;
    // Zerg morphs: hydras -> lurkers, mutas -> guardians
    if (this.race === 'Z' && p.hasTech('lurker_aspect') && (counts.lurker || 0) < (counts.hydralisk || 0) / 1.5 && p.minerals >= 50 && p.gas >= 100) { const h = this.mine(u => u.def.id === 'hydralisk' && u.order.type !== 'attack' && u.done); if (h.length) { Abilities.morph(h[0], 'lurker'); return; } }
    if (this.race === 'Z' && p.hasBuilding('greater_spire') && (counts.guardian || 0) < 4 && p.minerals >= 50 && p.gas >= 100) { const m = this.mine(u => u.def.id === 'mutalisk'); if (m.length > 4) { Abilities.morph(m[0], 'guardian'); return; } }
    // Devourers, which nothing ever built: guardians hit ground, devourers hit air, and the greater spire
    // buys both. Gated on the enemy actually flying, the way scourge and corsairs already are.
    if (this.race === 'Z' && p.hasBuilding('greater_spire') && (counts.devourer || 0) < 3 && enemyAir && p.minerals >= 150 && p.gas >= 50) { const m = this.mine(u => u.def.id === 'mutalisk'); if (m.length > 4) { Abilities.morph(m[0], 'devourer'); return; } }
    // A high templar is built to cast storm; an archon is what a spent one becomes. Merging any pair
    // under 60 energy while storm was unresearched merged every templar on sight -- a fresh one starts
    // at 50 -- so no templar ever lived to see the tech land. Merge only what cannot storm: the spent
    // ones while storm is in or on the way, all of them once it is neither.
    if (this.race === 'P') {
      const stormable = p.hasTech('psi_storm_tech') || p.researching.has('psi_storm_tech');
      const hts = this.mine(u => u.def.id === 'high_templar' && u.order.type !== 'merge' && (!stormable || u.energy < DATA.abilities.psi_storm.energy));
      if (hts.length >= 2 && (!stormable || (counts.high_templar || 0) > 3)) Abilities.merge(hts, 'summon_archon');
      // A dark archon is two dark templar, and nothing ever made one. Only worth it once the archives
      // have paid for something to cast: feedback is free at 50 energy, so one is enough to be useful.
      if ((counts.dark_archon || 0) < 1 && p.hasBuilding('templar_archives')) {
        const dts = this.mine(u => u.def.id === 'dark_templar' && u.order.type !== 'merge');
        if (dts.length >= 2 && (counts.dark_templar || 0) > 2) Abilities.merge(dts, 'summon_dark_archon');
      }
    }
    // Reaver scarabs / carrier interceptors
    for (const u of this.mine(u => (u.def.id === 'reaver' || u.def.id === 'carrier') && !u.prod.length)) { if (u.def.id === 'reaver' && u.scarabs < 5) G.queueUnit(u, 'scarab'); if (u.def.id === 'carrier' && u.interceptors < (p.hasTech('carrier_capacity') ? 8 : 4)) G.queueUnit(u, 'interceptor'); }
    // The composition is a priority order, so spending on a cheaper unit every time the preferred one is a few
    // minerals short ratchets the army towards the cheapest thing in the list (this is what turned Protoss into
    // an all-zealot army while gas piled up). Bank for the top pick instead, but never stall on it for long.
    // ...and hold only the buildings that could make it. Holding all of them left a Protoss robotics
    // facility and stargate idle for eight seconds because a gateway was saving for a dragoon; the hold
    // was a seventh of every idle-production-building-second the audit counts (test/aiaudit.js). For
    // Zerg every unit comes off larva, so a Zerg hold still holds everything, which is right: larva is
    // the shared resource being saved.
    let holding = null;
    const want = cands.find(([, id]) => this.canTrainSoon(id));
    if (want) { const wd = DATA.units[want[1]];
      const close = p.minerals >= wd.min * 0.7 && p.gas >= wd.gas * 0.7; // only wait when the money is nearly there; saving from nothing just idles production (and wastes Zerg larvae)
      if ((p.minerals < wd.min || p.gas < wd.gas) && close) { if (this.holdFor !== want[1]) { this.holdFor = want[1]; this.holdT = G.frame; } if (G.frame - this.holdT < 24 * 8) holding = wd.from; }
      else this.holdFor = null;
    } else this.holdFor = null;
    // One pass over the composition queues at most one of each unit, so a Terran with six idle barracks
    // needed six thinks -- eight seconds -- to fill them, and the audit counted every one of those
    // building-seconds as idle production. It was 58% of the whole count and nothing in the audit could
    // name it. Keep going while something can still be trained, re-scoring the unit just trained so the
    // composition ratios still decide the order. train() applies the money reserve on every call, so
    // this cannot empty the bank into units.
    let made = 0, pick;
    do {                                                  // a think is 1.3 s at normal; twelve is far more than income can pay for
      pick = null;
      for (const c of cands) { if (holding && DATA.units[c[1]].from === holding) continue; if (this.train(c[1], 3)) { pick = c; break; } }
      if (!pick) break;
      const [, id, w, sup] = pick; counts[id] = (counts[id] || 0) + 1; pick[0] = (counts[id] * sup + sup) / w; cands.sort((a, b) => a[0] - b[0]); made++;
    } while (made < 12);
  }
  // The flat gate stays. M4 tried a cost-aware one for every race (TvZ 97%) and M7 tried it for Zerg
  // alone, which is the form M6's handoff called "a real lever if approached from the Zerg side only":
  // it was worth +5 points to Terran over 360 paired seeds. Zerg buys upgrades it does not live to use.
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
    if (!ud.worker && !(ud.supGive && p.supMax - p.supUsed < 4) && !this.afford(ud.min, ud.gas)) return false; // saving up never starves workers or urgent supply
    if (ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) return false;
    if (ud.from === 'larva') { const l = this.mine(u => u.def.larva)[0]; if (!l) return false; return G.larvaMorph(l, id); }
    const bs = this.mine(u => u.isBuilding && u.done && !u.lifted && u.def.produces.includes(id) && u.prod.length < (maxQ || 2) && !(u.addon && !u.addon.done)); if (!bs.length) return false;
    bs.sort((a, b) => a.prod.length - b.prod.length); return G.queueUnit(bs[0], id);
  }
  // could we train this if we had the money? (requirements, supply room and a production building with a free slot)
  canTrainSoon(id) { const p = this.p, ud = DATA.units[id]; if (!ud || !p.hasReq(ud)) return false; if (ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) return false; if (ud.from === 'larva') return !!this.mine(u => u.def.larva).length; return !!this.mine(u => u.isBuilding && u.done && !u.lifted && u.def.produces.includes(id) && u.prod.length < 3 && !(u.addon && !u.addon.done)).length; }
  addon(id) { const p = this.p, ad = DATA.buildings[id]; if (!p.hasReq(ad)) return false; const b = this.mine(u => u.isBuilding && u.done && u.def.id === ad.parent && !u.addon && !u.prod.length)[0]; if (!b) return false; return G.queueAddon(b, id); }
  morph(id) { const p = this.p, nd = DATA.buildings[id]; const from = id === 'lair' ? 'hatchery' : id === 'hive' ? 'lair' : id === 'greater_spire' ? 'spire' : null; if (!from) return false; if (p.minerals < nd.min || p.gas < nd.gas) return false; const b = this.mine(u => u.isBuilding && u.done && u.def.id === from && !u.prod.length)[0]; if (!b) return false; return G.queueMorph(b, id); }
  // force: this is the building being saved for (script step, expansion, gas, urgent supply); otherwise the reserve applies
  build(id, force) {
    const def = DATA.buildings[id], p = this.p; if (!p.hasReq(def)) return false;
    if (def.depot) { const base = this.pickExpansion(); if (!base) return false; return this.buildAt(id, base.x, base.y, force); }
    if (def.onGeyser) { for (const h of this.halls()) { const base = G.map.bases.find(b => distPt(b.cx, b.cy, h.x, h.y) < 3 * TILE); if (base && base.geyser && !(base.geyser.building && base.geyser.building.alive) && base.geyser.amount > 0) return this.buildAt(id, base.geyser.x, base.geyser.y, true); } return false; }
    const halls = this.halls(); const defensive = def.gw || def.aw || def.id === 'creep_colony'; const h = (defensive && halls.length > 1 ? halls[halls.length - 1] : halls[Math.floor(G.rand() * Math.min(2, halls.length))]) || { x: p.startX, y: p.startY }; // static defence goes to the newest (most exposed) base
    return this.buildNear(id, h.x, h.y, force);
  }
  buildNear(id, x, y, force) {
    const def = DATA.buildings[id], p = this.p; const spot = this.findSpot(def, Math.floor(x / TILE), Math.floor(y / TILE)); if (!spot) return false;
    return this.buildAt(id, spot[0], spot[1], force);
  }
  buildAt(id, tx, ty, force) {
    const def = DATA.buildings[id], p = this.p; if (p.minerals < def.min || p.gas < def.gas) return false; if (!force && !this.afford(def.min, def.gas)) return false;
    const w = this.pickWorker((tx + def.w / 2) * TILE, (ty + def.h / 2) * TILE); if (!w) return false;
    w.setOrder({ type: 'build', def, tx, ty }); this.pending[id] = G.frame; this.reserve(def); return true; // the walk to the site must not be spent
  }
  pickWorker(x, y) { const ws = this.mine(u => u.def.worker && !u.inside && u.stuck < 60 && (u.order.type === 'gather' || u.order.type === 'idle' || u.order.type === 'return') && !(u.order.type === 'gather' && u.order.target && u.order.target.type === 'gas')); if (!ws.length) return null; ws.sort((a, b) => distPt(a.x, a.y, x, y) + (a.carrying ? 200 : 0) - distPt(b.x, b.y, x, y) - (b.carrying ? 200 : 0)); return ws[0]; }
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
        // keep a free tile all around (units must never get walled in) and the addon slot free for Terran production buildings
        let ok = true;
        for (let y = ty - 1; y <= ty + def.h && ok; y++) for (let x = tx - 1; x <= tx + def.w && ok; x++) { if (x >= tx && x < tx + def.w && y >= ty && y < ty + def.h) continue; if (!m.walkable(x, y)) ok = false; }
        if (ok && isProd && def.race === 'T') { for (let y = ty + def.h - 2; y < ty + def.h && ok; y++) for (let x = tx + def.w; x < tx + def.w + 3; x++) if (!m.walkable(x, y)) ok = false; }
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
  // Enemy strength inside a radius, counting static defence as the army it is worth. Used to decide
  // whether a fight is worth staying in - unlike seenEnemyArmy this is about here and now, not the game.
  enemyStrengthNear(x, y, r) {
    let sup = 0;
    for (const u of G.near(x, y, r)) {
      if (!u.alive || G.allied(u.owner, this.p.id)) continue;
      if (u.isBuilding) { if ((u.def.gw || u.def.aw) && u.done) sup += 4; continue; }
      if (!u.hasWeapon() || u.def.worker) continue;
      sup += u.def.sup || 1;
    }
    return sup;
  }
  centroid(us) { let x = 0, y = 0; for (const u of us) { x += u.x; y += u.y; } return us.length ? { x: x / us.length, y: y / us.length } : null; }
  // biggest enemy army supply we have actually seen, decayed slowly so old sightings stop mattering
  seenEnemyArmy() {
    let sup = 0;
    for (const u of G.units) { if (!u.alive || u.def.worker || u.def.larva || u.def.egg || u.def.notUnit) continue; if (G.allied(u.owner, this.p.id)) continue; if (u.isBuilding) { if ((u.def.gw || u.def.aw) && u.done && G.explored(this.p.id, Math.floor(u.x / TILE), Math.floor(u.y / TILE))) sup += 4; continue; } if (!u.hasWeapon()) continue; if (!G.canSee(this.p.id, u)) continue; sup += u.def.sup || 1; } // a defended base costs more army than an open field
    if (sup > (this.seenSup || 0)) this.seenSup = sup; else this.seenSup = (this.seenSup || 0) * 0.995;
    return this.seenSup;
  }
  army() {
    const p = this.p, army = this.armyUnits(), sup = army.reduce((s, u) => s + u.def.sup, 0);
    const rally = this.rallyPoint(); this.rally = rally;
    for (const b of this.mine(u => u.isBuilding && (u.def.produces.length || u.def.spawnsLarva))) b.rally = { x: rally.x + (G.rand() - .5) * 64, y: rally.y + (G.rand() - .5) * 64 };
    // defense
    const attacked = this.mine(u => u.owner === p.id && G.frame - u.lastHit < 72 && u.lastHitBy && !G.allied(u.lastHitBy.owner, p.id) && (u.isBuilding || u.def.worker));
    if (attacked.length) {
      // Stay where we are already defending while it is still being hit, and otherwise go to whichever
      // cluster has the most things under attack. Taking whatever was hit most recently made the army
      // ping-pong between two bases whenever a scout poked each of them in turn.
      let t = this.defendPt && attacked.find(u => distPt(u.x, u.y, this.defendPt.x, this.defendPt.y) < 12 * TILE);
      if (!t) { let bestN = -1; for (const u of attacked) { const n = attacked.reduce((c, o) => c + (distPt(o.x, o.y, u.x, u.y) < 12 * TILE ? 1 : 0), 0); if (n > bestN) { bestN = n; t = u; } } }
      this.state = 'defend'; this.defendPt = { x: t.x, y: t.y }; this.defendT = G.frame;
    }
    if (this.state === 'defend') { if (G.frame - this.defendT > 24 * 20) this.state = 'gather'; else { for (const u of army) if (u.order.type !== 'attack' && !u.burrowed && distPt(u.x, u.y, this.defendPt.x, this.defendPt.y) > 6 * TILE) u.setOrder({ type: 'attackmove', x: this.defendPt.x, y: this.defendPt.y }); for (const u of this.supportUnits()) if (u.order.type === 'idle') u.setOrder({ type: 'follow', target: army[0] || u }); return; } }
    if (this.state === 'gather') {
      for (const u of army) if (u.order.type === 'idle' && !u.burrowed && distPt(u.x, u.y, rally.x, rally.y) > 5 * TILE) u.setOrder({ type: 'attackmove', x: rally.x + (G.rand() - .5) * 96, y: rally.y + (G.rand() - .5) * 96 });
      for (const u of this.supportUnits()) if (u.order.type === 'idle' && distPt(u.x, u.y, rally.x, rally.y) > 6 * TILE) u.setOrder({ type: 'move', x: rally.x, y: rally.y });
      const threshold = Math.max(this.attackThreshold + this.waves * 8 + (p.supUsed > 150 ? -20 : 0), this.seenEnemyArmy() * 1.25);
      // After a retreat, rebuild before walking back into the same fight. Without this the AI turned
      // straight round and fed the survivors in one at a time.
      if ((sup >= threshold || p.supUsed >= 190) && G.frame >= (this.regroupUntil || 0)) {
        this.state = 'attack'; this.waves++; this.startedAttack = G.frame;
        const wave = army.filter(u => distPt(u.x, u.y, rally.x, rally.y) < 14 * TILE || this.waves > 1);
        for (const u of wave) u.wave = this.waves;
        this.attackN = wave.length; this.waveSup0 = wave.reduce((a, u) => a + (u.def.sup || 0), 0);
        this.target = this.pickTarget(rally);
      }
    }
    if (this.state === 'attack') {
      if (!this.target || !this.target.alive || (this.target.probe && this.hasSeen(this.target.x, this.target.y))) this.target = this.pickTarget(rally);
      if (!this.target) { this.state = 'gather'; return; }
      const waveUnits = army.filter(u => u.wave === this.waves), rest = army.filter(u => u.wave !== this.waves);
      const waveSup = waveUnits.reduce((a, u) => a + (u.def.sup || 0), 0);
      const head = this.centroid(waveUnits);
      // Retreat. Losing half the wave, or being outgunned where we are standing, both mean the fight is
      // already lost; the old rule waited until 65% of the units were dead, by which point the army was
      // gone and the game with it. Pull back, rebuild, come again.
      const local = head ? this.enemyStrengthNear(head.x, head.y, 10 * TILE) : 0;
      const gutted = this.waveSup0 && waveSup < this.waveSup0 * 0.8; // a fifth of the wave dead is already a losing fight; measured, 0.8 beats 0.7 and 0.55 outright
      const outgunned = local > 0 && waveSup < local * 0.7 && waveUnits.some(u => G.frame - u.lastHit < 48);
      if ((gutted || outgunned) && G.frame - this.startedAttack > 24 * 6) {
        this.state = 'gather'; this.regroupUntil = G.frame + 24 * 25;
        const home = this.halls()[0] || { x: p.startX, y: p.startY };
        for (const u of army) { u.wave = 0; if (!u.burrowed) u.setOrder({ type: 'move', x: home.x, y: home.y }); }
        return;
      }
      for (const u of rest) if (u.order.type === 'idle' && distPt(u.x, u.y, rally.x, rally.y) > 5 * TILE) u.setOrder({ type: 'attackmove', x: rally.x + (G.rand() - .5) * 96, y: rally.y + (G.rand() - .5) * 96 });
      // reinforce: send gathered units as a group when enough have collected
      const gathered = rest.filter(u => distPt(u.x, u.y, rally.x, rally.y) < 8 * TILE); if (gathered.reduce((s, u) => s + u.def.sup, 0) >= 16) for (const u of gathered) u.wave = this.waves;
      const t = this.target;
      // Keep the wave together. Every unit attack-moving straight at the target means the fast ones
      // arrive first and die first; anything trailing the pack regroups on it instead of running ahead.
      for (const u of waveUnits) {
        if (u.order.type === 'attack' || u.order.type === 'ability') continue;
        if (u.sieged || u.burrowed) continue;
        const lagging = head && distPt(u.x, u.y, head.x, head.y) > 13 * TILE && distPt(u.x, u.y, t.x, t.y) > distPt(head.x, head.y, t.x, t.y);
        const gx = lagging ? head.x : t.x, gy = lagging ? head.y : t.y;
        if (u.order.type === 'attackmove' && distPt(u.order.x, u.order.y, gx, gy) < 3 * TILE) continue;
        u.setOrder({ type: 'attackmove', x: gx, y: gy });
      }
      for (const u of this.supportUnits()) { if (u.def.id === 'high_templar' || u.def.id === 'defiler') { if (u.order.type !== 'ability' && u.order.type !== 'follow') u.setOrder({ type: 'follow', target: army[0] || u }); } else if (u.order.type === 'idle' || u.order.type === 'move') u.setOrder({ type: 'follow', target: army[Math.floor(G.rand() * army.length)] || u }); }
      // scourge / overlords stay home
      if (G.frame - this.startedAttack > 24 * 240) { this.state = 'gather'; for (const u of army) u.wave = 0; }
    }
    // overlords: one per base for detection, rest near rally
    if (this.race === 'Z') { const ovs = this.mine(u => u.def.id === 'overlord'); const halls = this.halls(); ovs.forEach((o, i) => { if (o.order.type !== 'idle') return; const h = halls[i % Math.max(1, halls.length)]; const tgt = i < halls.length && h ? { x: h.x, y: h.y - 40 } : { x: rally.x, y: rally.y }; if (distPt(o.x, o.y, tgt.x, tgt.y) > 3 * TILE) o.setOrder({ type: 'move', x: tgt.x, y: tgt.y }); }); }
  }
  // What this player has actually seen. p.vis is 2 for visible, 1 for explored and 0 for never seen, so
  // `> 0` is memory rather than sight: a base scouted once stays a target after the scout dies, which is
  // what a person does.
  hasSeen(x, y) { const m = G.map, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inb(tx, ty) && this.p.vis[ty * m.w + tx] > 0; }
  // Somewhere worth looking when nothing of the enemy is known. Where the bases ARE is fair knowledge --
  // the map layout is public in both StarCraft games -- but what is standing on them is not, so the army
  // walks to the nearest start it has not explored and finds out. Without this the AI simply stops
  // attacking once it has scouted nothing, which is a worse game than one that cheats.
  probeTarget(from) {
    let best = null, bd = 1e9;
    for (const list of [G.map.starts || [], G.map.bases || []]) {
      for (const b of list) { if (this.hasSeen(b.cx, b.cy)) continue; const d = distPt(b.cx, b.cy, from.x, from.y); if (d < bd) { bd = d; best = b; } }
      if (best) break;
    }
    return best ? { alive: true, x: best.cx, y: best.cy, probe: true } : null;
  }
  // Targets are chosen from what this player has seen, not from the map. This used to walk G.units
  // directly and pick the least defended enemy building anywhere, counting defenders it had never laid
  // eyes on -- perfect map knowledge, and the largest way in which the AI was not playing the same game
  // as the player. It scouted at supply 9 purely for show, because it already knew everything.
  pickTarget(from) {
    let best = null, bd = 1e9;
    const defenders = G.units.filter(u => u.alive && u.isBuilding && (u.def.gw || u.def.aw) && !G.allied(u.owner, this.p.id) && this.hasSeen(u.x, u.y));
    for (const u of G.units) { if (!u.alive || G.allied(u.owner, this.p.id) || !u.isBuilding || u.def.tier === 'addon') continue; if (G.players[u.owner].defeated) continue; if (!this.hasSeen(u.x, u.y)) continue; const guarded = defenders.filter(d => distPt(d.x, d.y, u.x, u.y) < 8 * TILE).length; const d = distPt(u.x, u.y, from.x, from.y) - (u.def.depot ? 8 * TILE : 0) + guarded * 10 * TILE; if (d < bd) { bd = d; best = u; } } // prefer targets without static defence around them
    if (!best) { for (const u of G.units) { if (u.alive && !G.allied(u.owner, this.p.id) && !G.players[u.owner].defeated && !u.def.larva && this.hasSeen(u.x, u.y)) { const d = distPt(u.x, u.y, from.x, from.y); if (d < bd) { bd = d; best = u; } } } }
    // Go looking whenever no enemy TOWN HALL has been seen, even if some forward building has been.
    // Without this clause the fog version won zero games of eight where the omniscient one won seven:
    // it could always see something to hit, so it ground away at outlying buildings while the enemy
    // main -- never scouted, therefore never targetable -- rebuilt behind the fog. Razing bases is how
    // the game is won, so not knowing where any of them are is the condition that should send the army
    // out to look, not merely having nothing at all to shoot.
    const seenHall = best && best.def && best.def.depot;
    if (!seenHall) { const probe = this.probeTarget(from); if (probe) return probe; }
    return best;
  }
  // micro() does not run every frame. think() runs it on multiples of 12 and on each full think, so
  // the only values G.frame % 16 ever takes in here are {0,4,8,12} -- measured, not reasoned. Every
  // stagger below was written as (G.frame + id) % N === 0, which therefore came true only for ids in a
  // quarter to an eighth of the residue classes, and did so for the whole life of the unit: a defiler
  // whose id was not a multiple of 4 could not cast dark swarm however long it lived. That is most of
  // what "1194 defiler-seconds alive and zero casts" was in test/casters.js, and the same arithmetic
  // silently disabled psi storm, irradiate, spawn broodling, stasis, the nuke, spider mines and kiting
  // for most of the units that had them. The comsat gate is keyed on p.id, where the reachable set is
  // {0,12,16,24,32,36} and no player id is ever above 7 -- so only player 0 could ever scan.
  //
  // Count guaranteed micro ticks instead of raw frames: every id lands on one, and the stagger still
  // spreads the work across ticks. n is the old period in units of 12 frames.
  turn(id, n) { return (((G.frame / 12) | 0) + id) % n === 0; }
  micro() {
    const p = this.p;
    // Terran: scan where our units are being hit by something we cannot see (burrowed lurkers, cloaked units)
    if (p.race === 'T' && this.turn(p.id, 4)) { const cs = this.mine(u => u.def.id === 'comsat_station' && u.done && u.energy >= 50)[0]; if (cs) { const hit = this.mine(u => !u.isBuilding && G.frame - u.lastHit < 24 && u.lastHitBy && u.lastHitBy.alive && u.lastHitBy.isCloaked && !G.detected(u.lastHitBy, p.id))[0];
      if (hit) Abilities.issue(cs, 'scanner_sweep', null, hit.lastHitBy.x, hit.lastHitBy.y);
      // A comsat parked at 200/200 is four scans thrown away, and it was the second largest pool of
      // unspent energy in the audit. Once the bar is nearly full the regeneration is wasted anyway, so
      // buy vision on what we are about to walk into.
      else if (cs.energy >= 180 && this.state === 'attack' && this.target && this.target.alive && !G.visibleAt(p.id, this.target.x, this.target.y)) Abilities.issue(cs, 'scanner_sweep', null, this.target.x, this.target.y); } }
    for (const u of G.units) {
      if (!u.alive || u.owner !== p.id || u.isBuilding || u.inside) continue;
      const d = u.def.id;
      if (d === 'siege_tank' && p.hasTech('siege_tech') && u.transT <= 0) { const near = G.near(u.x, u.y, 11 * TILE).some(o => o.owner !== p.id && !o.fly && o.alive && (o.hasWeapon() || o.isBuilding)); const veryNear = G.near(u.x, u.y, 2 * TILE).some(o => o.owner !== p.id && !o.fly && o.alive && o.hasWeapon()); if (near && !u.sieged && !veryNear && this.turn(u.id, 2)) Abilities.instant(u, 'siege_mode'); else if (u.sieged && !near && this.turn(u.id, 8)) Abilities.instant(u, 'siege_mode'); }
      else if ((d === 'vulture' || d === 'mutalisk' || d === 'dragoon') && u.order.type === 'attack' && this.turn(u.id, 1)) this.kite(u);
      else if ((d === 'marine' || d === 'firebat') && p.hasTech('stim') && u.stim <= 0 && u.hp > 25 && u.order.type === 'attack' && u.order.target && dist(u, u.order.target) < 6 * TILE) Abilities.instant(u, 'stim');
      else if (d === 'lurker' && u.transT <= 0) { const near = G.near(u.x, u.y, 7 * TILE).some(o => o.owner !== p.id && !o.fly && o.alive && !o.def.larva); if (near && !u.burrowed && this.turn(u.id, 1)) Abilities.instant(u, 'burrow'); else if (u.burrowed && !near && this.turn(u.id, 6) && this.state !== 'gather') Abilities.instant(u, 'burrow'); }
      else if (d === 'high_templar' && u.energy >= 75 && p.hasTech('psi_storm_tech') && this.turn(u.id, 1)) { const c = this.cluster(u, 9, 3, o => o.owner !== p.id && !o.isBuilding); if (c) Abilities.issue(u, 'psi_storm', null, c.x, c.y); }
      // Dark Swarm is as much a defensive spell as an offensive one, and the cluster test below already
      // says "our ground units are being shot at". Gating it on the army being on the attack meant the
      // Zerg AI, which spends most of a losing game in `defend`, never cast it when it needed it most.
      else if (d === 'defiler' && u.energy >= 100 && this.turn(u.id, 1)) { const c = this.cluster(u, 9, 3, o => o.owner === p.id && !o.fly && !o.isBuilding && o.hasWeapon() && G.frame - o.lastHit < 48); if (c && !Abilities.inField(c.x, c.y, 'swarm')) Abilities.issue(u, 'dark_swarm', null, c.x, c.y); else if (p.hasTech('plague_tech') && u.energy >= 150) { const e = this.cluster(u, 9, 4, o => o.owner !== p.id); if (e) Abilities.issue(u, 'plague', null, e.x, e.y); } }
      else if (d === 'science_vessel' && u.energy >= 75 && p.hasTech('irradiate_tech') && this.turn(u.id, 2)) { const t = G.near(u.x, u.y, 9 * TILE).find(o => o.owner !== p.id && o.def.bio && !o.isBuilding && !o.fx.irradiate && o.maxHp >= 80); if (t) Abilities.issue(u, 'irradiate', t); }
      else if (d === 'queen' && u.energy >= 150 && p.hasTech('spawn_broodling_tech') && this.turn(u.id, 2)) { const t = G.near(u.x, u.y, 9 * TILE).find(o => o.owner !== p.id && !o.fly && !o.isBuilding && !NO_BROODLING.has(o.def.id) && o.def.sup >= 2); if (t) Abilities.issue(u, 'spawn_broodling', t); }
      else if (d === 'medic' && u.order.type === 'idle' && this.rally && distPt(u.x, u.y, this.rally.x, this.rally.y) > 8 * TILE) { const a = this.armyUnits()[0]; if (a) u.setOrder({ type: 'follow', target: a }); }
      else if (d === 'vulture' && u.mines > 0 && p.hasTech('spider_mines_tech') && u.order.type === 'idle' && this.turn(u.id, 4)) { Abilities.issue(u, 'spider_mine', null, u.x + (G.rand() - .5) * 64, u.y + (G.rand() - .5) * 64); }
      else if (d === 'arbiter' && u.energy >= 100 && p.hasTech('stasis_tech') && this.turn(u.id, 2)) { const c = this.cluster(u, 9, 4, o => o.owner !== p.id && !o.isBuilding); if (c) Abilities.issue(u, 'stasis_field', null, c.x, c.y); }
      // The rest of the spell book. Every one of these had working code in js/abilities.js, a place on
      // the command card and an entry in the tech tree, and no line anywhere that made the AI press it,
      // so a player never saw them. Each sits AFTER the existing clause for the same unit, and an
      // else-if chain takes the first match -- so a defiler still prefers dark swarm and only consumes
      // below the energy for it, a templar still prefers storm, a vessel still prefers irradiate.
      // Lockdown, which was researched and never pressed. Sits before the nuke clause so a ghost with
      // no nuke still has a job; a nuke-carrying ghost matches the clause below instead.
      else if (d === 'ghost' && p.nukes === 0 && u.energy >= 100 && p.hasTech('lockdown_tech') && this.turn(u.id, 2)) {
        const t = G.near(u.x, u.y, 8 * TILE).find(o => o.owner !== p.id && !o.isBuilding && o.def.mech && !o.fx.lockdown && o.def.sup >= 2); if (t) Abilities.issue(u, 'lockdown', t);
      }
      // Repair. SCVs never repaired anything, so a damaged tank line, a bunker or a cracked building
      // simply stayed damaged -- the one Terran mechanic that is free and was going entirely unused.
      else if (u.def.worker && p.race === 'T' && u.order.type === 'idle' && this.turn(u.id, 4)) {
        const hurt = this.mine(o => o !== u && o.hp < o.maxHp * 0.85 && (o.isBuilding || o.def.mech) && !o.def.larva && distPt(o.x, o.y, u.x, u.y) < 12 * TILE)[0];
        if (hurt) u.setOrder({ type: 'repair', target: hurt });
      }
      else if (d === 'queen' && u.energy >= 150 && this.turn(u.id, 4)) {
        // Infest: a Terran command centre under 50% is a free infested terran factory. Niche, and the
        // only reason it is here is that "every ability the game has" should mean every one.
        const cc = G.near(u.x, u.y, 8 * TILE).find(o => o.owner !== p.id && o.isBuilding && o.def.id === 'command_center' && o.hp < o.maxHp * 0.5);
        if (cc) Abilities.issue(u, 'infest', cc);
      }
      else if (d === 'medic' && this.turn(u.id, 2) && u.energy >= 50) {
        const hurt = this.mine(o => o !== u && !o.isBuilding && o.fx && (o.fx.plague > 0 || o.fx.irradiate) && distPt(o.x, o.y, u.x, u.y) < 9 * TILE)[0];
        if (hurt && p.hasTech('restoration_tech')) Abilities.issue(u, 'restoration', hurt);
        else if (u.energy >= 75 && p.hasTech('optical_flare_tech')) { const e = G.near(u.x, u.y, 9 * TILE).find(o => o.owner !== p.id && !o.isBuilding && !o.fly && o.def.sight >= 7 && !o.fx.blind); if (e) Abilities.issue(u, 'optical_flare', e); }
      }
      else if (d === 'science_vessel' && this.turn(u.id, 2) && u.energy >= 100) {
        const emp = p.hasTech('emp_tech') ? this.cluster(u, 8, 3, o => o.owner !== p.id && (o.maxSh > 0 || o.maxEnergy > 0)) : null;
        if (emp) Abilities.issue(u, 'emp', null, emp.x, emp.y);
        else { const hurt = this.mine(o => !o.isBuilding && o.hp < o.maxHp * 0.5 && o.def.sup >= 2 && !o.fx.matrix && distPt(o.x, o.y, u.x, u.y) < 10 * TILE)[0]; if (hurt) Abilities.issue(u, 'defensive_matrix', hurt); }
      }
      else if (d === 'battlecruiser' && u.energy >= 150 && p.hasTech('yamato_tech') && this.turn(u.id, 2)) {
        const t = G.near(u.x, u.y, 10 * TILE).find(o => o.owner !== p.id && (o.maxHp >= 200 || o.isBuilding)); if (t) Abilities.issue(u, 'yamato', t);
      }
      else if (d === 'wraith' && !u.cloaked && u.energy >= 50 && p.hasTech('cloaking_field') && this.turn(u.id, 4) && G.near(u.x, u.y, 8 * TILE).some(o => o.owner !== p.id && o.hasWeapon())) Abilities.instant(u, 'cloak_wraith');
      else if (d === 'queen' && this.turn(u.id, 2) && u.energy >= 75) {
        const c = p.hasTech('ensnare_tech') ? this.cluster(u, 9, 3, o => o.owner !== p.id && !o.isBuilding && !o.fx.ensnare) : null;
        if (c) Abilities.issue(u, 'ensnare', null, c.x, c.y);
        else { const big = G.near(u.x, u.y, 12 * TILE).find(o => o.owner !== p.id && !o.isBuilding && o.def.sup >= 2 && !o.fx.parasite); if (big) Abilities.issue(u, 'parasite', big); }
      }
      else if (d === 'defiler' && u.energy < 100 && p.hasTech('consume_tech') && this.turn(u.id, 2)) {
        const food = this.mine(o => o.def.id === 'zergling' && distPt(o.x, o.y, u.x, u.y) < 2 * TILE)[0]; if (food) Abilities.issue(u, 'consume', food);
      }
      else if (d === 'dark_archon' && this.turn(u.id, 2) && u.energy >= 50) {
        const caster = G.near(u.x, u.y, 10 * TILE).find(o => o.owner !== p.id && o.maxEnergy > 0 && o.energy >= 50);
        if (caster) Abilities.issue(u, 'feedback', caster);
        else if (u.energy >= 100 && p.hasTech('maelstrom_tech')) { const c = this.cluster(u, 10, 3, o => o.owner !== p.id && !o.isBuilding && o.def.bio); if (c) Abilities.issue(u, 'maelstrom', null, c.x, c.y); }
        else if (u.energy >= 150 && p.hasTech('mind_control_tech')) { const t = G.near(u.x, u.y, 8 * TILE).find(o => o.owner !== p.id && !o.isBuilding && o.def.sup >= 2); if (t) Abilities.issue(u, 'mind_control', t); }
      }
      else if (d === 'corsair' && u.energy >= 125 && p.hasTech('disruption_web_tech') && this.turn(u.id, 2)) {
        const c = this.cluster(u, 9, 3, o => o.owner !== p.id && !o.fly && o.hasWeapon()); if (c) Abilities.issue(u, 'disruption_web', null, c.x, c.y);
      }
      else if (d === 'high_templar' && u.energy >= 100 && p.hasTech('hallucination_tech') && this.turn(u.id, 4) && this.state === 'attack') {
        const friend = this.mine(o => !o.isBuilding && o.def.sup >= 2 && distPt(o.x, o.y, u.x, u.y) < 9 * TILE)[0]; if (friend) Abilities.issue(u, 'hallucination', friend);
      }
      else if (d === 'arbiter' && u.energy >= 150 && p.hasTech('recall_tech') && this.turn(u.id, 4) && this.state === 'attack' && this.target && this.target.alive) {
        const stranded = this.mine(o => !o.isBuilding && o.hasWeapon() && distPt(o.x, o.y, this.target.x, this.target.y) > 30 * TILE).length;
        if (stranded >= 6) Abilities.issue(u, 'recall', null, u.x, u.y);
      }
      else if (d === 'ghost' && p.nukes > 0 && u.energy > 50 && this.turn(u.id, 4) && u.order.type !== 'ability') { const t = this.target; if (t && t.alive) { if (p.hasTech('personnel_cloaking') && !u.cloaked) Abilities.instant(u, 'cloak_ghost'); Abilities.issue(u, 'nuke', null, t.x, t.y); } }
    }
  }
  scout() {
    const p = this.p; if (p.supUsed < 9) return;
    // Scouting used to happen exactly once, at supply 9, and never again. That was harmless while the AI
    // had perfect map knowledge and became fatal the moment it lost it: pickTarget can only aim at what
    // has been seen, so an AI whose first scout died never found a town hall and never closed a game --
    // four wins in eight against seven for the omniscient version. Keep looking while no enemy hall is
    // known, which is what a person does, and stop the moment one is.
    const knowsHall = G.units.some(u => u.alive && u.isBuilding && u.def.depot && !G.allied(u.owner, p.id) && !G.players[u.owner].defeated && this.hasSeen(u.x, u.y));
    if (this.scouted && (knowsHall || G.frame - (this.lastScout || 0) < 24 * 40)) return;
    this.scouted = true; this.lastScout = G.frame;
    const w = this.pickWorker(p.startX, p.startY); if (!w) return; const targets = G.map.starts.filter(b => distPt(b.cx, b.cy, p.startX, p.startY) > 10 * TILE);
    targets.forEach((b, i) => w.setOrder({ type: 'move', x: b.cx, y: b.cy + 80 }, i > 0)); const home = G.map.resources.find(r => r.type === 'mineral' && distPt(r.cx, r.cy, p.startX, p.startY) < 10 * TILE); if (home) w.setOrder({ type: 'gather', target: home, phase: 'goto' }, true);
  }
  drops() {
    const p = this.p; const op = this.dropOp;
    if (op) {
      const t = op.transport; if (!t || !t.alive) { this.dropOp = null; return; }
      if (op.phase === 'load') {
        const left = op.units.filter(u => u.alive && !u.inside);
        if (!left.length || G.frame - op.t0 > 24 * 25) {
          if (!t.cargo.length) { this.dropOp = null; this.lastDrop = G.frame; t.setOrder({ type: 'move', x: this.rally ? this.rally.x : p.startX, y: this.rally ? this.rally.y : p.startY }); return; } // nothing boarded: flying an empty transport into their base just donates it
          op.phase = 'fly'; t.setOrder({ type: 'move', x: op.x, y: op.y }); op.t0 = G.frame;
        } else for (const u of left) if (u.order.type !== 'load') u.setOrder({ type: 'load', target: t });
      }
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
