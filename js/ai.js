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
  // M12 wave four adds four Terran structures to this order, and WHERE each one sits is the only part
  // of it that is a judgement rather than a constraint:
  //   comsat_station@30 then orbital_command@31 -- in that order deliberately. AI.addon() finds a
  //     parent by `u.def.id === ad.parent`, and after the morph the def is 'orbital_command', so a
  //     Comsat that is not bolted on before the morph can never be bolted on after it. Morphing keeps
  //     an add-on it already has (G.morphBuilding does not touch b.addon), so this order gets both.
  //   reactor@45, right behind the third barracks@44 -- AI.addon() picks a parent with no add-on and
  //     nothing in its queue, so it lands on whichever Barracks is free rather than stalling the first.
  //   planetary_fortress@48, behind the second command_center@46 -- AI.morph takes the FIRST plain
  //     Command Center it owns, and by 46 the main one is already an Orbital, so the Fortress lands on
  //     the natural. That is where a Fortress belongs and it is arrived at rather than special-cased.
  //   sensor_tower@52 -- late, cheap, and needs the engineering bay from 25.
  // TIER 3 COMES BEFORE THE OPTIONAL STRUCTURES. The Starport sat at supply 36, behind a bunker, an
  // engineering bay, a blast barricade, a comsat and an armory; it is at 22 now, with the Control
  // Tower right behind it. Nothing is removed -- the defensive and utility buildings move to AFTER
  // the tech that decides what army you are allowed to have.
  T: [[9, 'supply_depot'], [11, 'barracks'], [12, 'refinery'], [15, 'supply_depot'], [16, 'factory'], [18, 'machine_shop'], [19, 'supply_depot'], [20, 'academy'], [22, 'starport'], [23, 'bunker'], [24, 'command_center'], [25, 'control_tower'], [26, 'supply_depot'], [27, 'armory'], [28, 'factory'], [29, 'engineering_bay'], [30, 'comsat_station'], [31, 'orbital_command'], [32, 'science_facility'], [34, 'supply_depot'], [36, 'blast_barricade'], [37, 'scrambler_mast'], [38, 'machine_shop'], [39, 'aid_station'], [42, 'physics_lab'], [44, 'barracks'], [45, 'reactor'], [46, 'command_center'], [48, 'planetary_fortress'], [50, 'factory'], [52, 'sensor_tower'], [56, 'missile_turret'], [62, 'science_facility'], [64, 'starport'], [66, 'covert_ops'], [68, 'nuclear_silo'], [70, 'barracks'], [80, 'factory']],
  // Lair moves 20 -> 16 and everything behind it moves with it. Hive was at supply 52 behind a
  // Queen's Nest at 44, so a Zerg reached Hive at seventeen minutes when it reached it at all, and
  // Ultralisk Cavern and Greater Spire at 60 and 70 were unreachable in any real game.
  Z: [[11, 'spawning_pool'], [12, 'hatchery'], [13, 'extractor'], [15, 'hydralisk_den'], [16, 'lair'], [17, 'roach_warren'], [18, 'creep_colony'], [19, 'sunken_colony'], [20, 'spire'], [21, 'carapace_ridge'], [22, 'extractor'], [24, 'hatchery'], [25, 'queens_nest'], [26, 'infestation_pit'], [28, 'evolution_chamber'], [30, 'hive'], [31, 'spore_colony'], [32, 'defiler_mound'], [34, 'hatchery'], [35, 'greater_spire'], [36, 'mending_pool'], [38, 'creep_colony'], [40, 'ultralisk_cavern'], [42, 'miasma_gland'], [44, 'creep_colony'], [48, 'extractor'], [56, 'creep_colony'], [64, 'hatchery'], [68, 'nydus_canal'], [80, 'hatchery']],
  // M12 wave four adds two steps and no more: the Roach Warren at 17, between the den and the first
  // creep colony, because the Roach is a tier-one unit and AI_COMP.Z now spends four of its weight on
  // one; and the Infestation Pit at 42, ahead of the Queen's Nest, because everything behind it
  // (infestor, swarm host, viper) is lair-tier or later and Zerg reaching lair tech at all is the
  // thing this AI has historically been worst at. Both inserted in ascending order -- test/aiscripts.js
  // exists because ONE inverted pair once hid Protoss's whole tech tree.
  // M12 wave four adds exactly ONE Protoss step, and where it sits is the only judgement in it. The
  // Warp Gate at 30 is behind the Robotics Facility (28) and level with the Observatory, which is the
  // first supply at which `warp_gate_tech` has realistically finished -- AI.research needs 200/150
  // spare and the tech is second in AI_RESEARCH.P, so it lands somewhere in the middle twenties.
  // AI.script skips a step whose `req` is unmet (`p.hasReq`) and comes back to it, so arriving early
  // costs nothing but arriving late would waste the mechanic for the whole opening.
  //
  // ONE Warp Gate, not all of them. AI.morph takes the first plain Gateway it owns, so the AI ends up
  // with one warp gate and rebuilds the gateway it converted -- `scriptHave` counts by def id, and a
  // converted gateway stops counting, so the later `gateway` steps go unmet and one more goes up. That
  // is the right shape for a computer opponent: it keeps a queue-based production line AND gains the
  // ability to put reinforcements at the front, rather than betting the whole army on warp-in.
  // Protoss was the worst of the three: NINE side-buildings sat between the Templar Archives and the
  // Stargate -- three shield batteries, a null obelisk, a photon cannon, a rejuvenation shrine, a
  // warded bastion, a gateway and a pylon -- so Stargate at 42, Robotics Support Bay at 50 and Fleet
  // Beacon at 52 were never reached in a real game. The tech tree front-loads now: robotics, citadel,
  // stargate and archives all sit inside supply 24, and the batteries and cannons follow them.
  P: [[8, 'pylon'], [10, 'gateway'], [12, 'assimilator'], [14, 'cybernetics_core'], [15, 'pylon'], [18, 'gateway'], [19, 'robotics_facility'], [20, 'nexus'], [21, 'citadel_of_adun'], [22, 'pylon'], [23, 'stargate'], [24, 'templar_archives'], [26, 'forge'], [27, 'pylon'], [28, 'observatory'], [29, 'robotics_support_bay'], [30, 'warp_gate'], [32, 'fleet_beacon'], [33, 'gateway'], [34, 'arbiter_tribunal'], [36, 'pylon'], [37, 'shield_battery'], [38, 'photon_cannon'], [39, 'rejuvenation_shrine'], [40, 'gateway'], [41, 'null_obelisk'], [42, 'warded_bastion'], [44, 'nexus'], [46, 'shield_battery'], [48, 'pylon'], [56, 'gateway'], [66, 'gateway'], [72, 'stargate'], [80, 'nexus']],
};
const gasBuildings = ai => ai.mine(u => u.def.onGeyser).length + 1;
// WEIGHTS ARE A SHARE OF ARMY SUPPLY, and the heavy end of every list was set so low that it could
// not be reached. AI.production scores a candidate as (count * sup + sup) / weight and picks the
// lowest, so a 6-supply Thor at weight 2 opens at 3.00 while a Marine opens at 0.17 -- the Thor is
// eighteenth in line, and because `count` is LIVE units, attrition keeps resetting the Marine's score
// before the queue ever gets that far. The composition never matured. Measured: across eighteen
// AI-vs-AI games, every unit scoring 2.0 or less was fielded and almost nothing scoring 3.0 or more
// ever was.
//
// Every unit that needs an advanced building or costs 100+ gas now has a weight giving it a score of
// at most 1.25, computed from its own supply rather than chosen per unit. Tier 1 still opens far
// cheaper (0.17-0.50) and so still forms the bulk of an army; this only makes the heavy end reachable
// once its tech exists, which is the whole point of having built the tech.
const AI_COMP = {
  // M12 wave four puts eleven more Terran units in reach, and all eleven are here rather than in a
  // "late game" list, because production() already filters on `p.hasReq` AND on owning a building that
  // makes the thing -- a Thor at weight 2 with no Armory is not a wasted slot, it is simply not a
  // candidate that think. The weights keep the character the table already had (mech-leaning for T,
  // bio-leaning for TvP) rather than resetting it: the new units take share from their own line, so
  // marines pay for marauders and vultures pay for hellions.
  //
  // `viking_a` and `mule` are deliberately ABSENT. Neither is trained: the assault Viking is a mode the
  // micro switches into, and the MULE comes out of an Orbital's energy. A weight on either would be a
  // permanent zero-count top pick that production() re-scores every think and can never satisfy.
  // Every pre-existing weight is left exactly as it was, deliberately: they are the numbers every
  // balance figure in HANDOFF.md was measured against, and the new units already dilute all of them.
  // Dropping the marine's weight as well would be two moves inside one measurement -- and it would
  // also quietly break test/version.js, which reaches into this table by SOURCE TEXT to prove that an
  // edit to js/ai.js moves the build stamp. Note for anyone editing the comments here: that test does
  // a plain string replace, so the first occurrence in the file wins. Do not repeat one of these pairs
  // in prose above the table, or the test will patch the comment, the stamp will not move, and the
  // failure will look like a bug in the build stamp rather than in a sentence. (It did.)
  T: [['marine', 6], ['medic', 2], ['firebat', 1], ['marauder', 2], ['reaper', 1], ['ghost', 1], ['vulture', 2], ['hellion', 2], ['siege_tank', 4], ['goliath', 2], ['cyclone', 2], ['widow_mine', 1], ['thor', 5], ['science_vessel', 2], ['raven', 2], ['wraith', 2], ['banshee', 2], ['viking', 2], ['liberator', 2], ['valkyrie', 2], ['dropship', 2], ['medivac', 2], ['battlecruiser', 5]],
  Z: [['zergling', 4], ['hydralisk', 6], ['mutalisk', 4], ['scourge', 1], ['ultralisk', 3], ['defiler', 2], ['queen', 2], ['roach', 4], ['infestor', 2]],
  // M12 wave four. Only the FOUR larva-tier additions are weighted here; baneling, ravager, swarm
  // host, viper and overseer are morphs off something already in this list and are bought in
  // production() beside the lurker, guardian and devourer clauses that have always worked that way.
  // Weights are a share of army supply, so anything added here dilutes everything else -- the Roach
  // is given real weight because it is meant to be a core unit, and the three casters are given one
  // apiece, which is what the defiler and the queen already get.
  // Terran had no per-matchup composition at all, so it built the same mech-heavy army into everyone --
  // and test/duel.js prices that army against Protoss at 0 wins in 8, a mean supply margin of -14.5.
  // The same test has Terran BIO beating the same Protoss army 5 of 8. Terran was building precisely the
  // thing Protoss is best against, in the one matchup this project has measured formally outside 60/40
  // (P 66% [61-71]). Bio-heavy here, with tanks kept for the siege line rather than as the core.
  // ...and the marauder is the single largest change to this list, because it is the unit TvP was
  // missing: the reason Terran's mech army loses to Protoss here is dragoons and zealots, both of
  // which are `large`, and until now the only explosive thing in a bio ball was a siege tank that has
  // to sit down. The medivac is doubled over the base comp for the same reason the medic is.
  TvP: [['marine', 8], ['medic', 3], ['firebat', 2], ['marauder', 4], ['reaper', 1], ['ghost', 1], ['vulture', 1], ['hellion', 1], ['siege_tank', 3], ['goliath', 2], ['cyclone', 1], ['widow_mine', 1], ['thor', 5], ['science_vessel', 2], ['raven', 2], ['wraith', 2], ['banshee', 2], ['viking', 2], ['liberator', 2], ['valkyrie', 2], ['dropship', 2], ['medivac', 2], ['battlecruiser', 5]],
  ZvT: [['zergling', 3], ['hydralisk', 5], ['mutalisk', 5], ['scourge', 1], ['ultralisk', 4], ['defiler', 2], ['queen', 2], ['roach', 5], ['infestor', 2]],
  // Roaches heavier into Terran than into Protoss: normal damage and 145 hit points is what holds a
  // line against marines and does very little against a zealot's shields, and Terran is the matchup
  // where Zerg spends the game being shot at from range.
  // M12 wave four weights the nine new Protoss units that have a producer, in both Protoss lists,
  // because AI.production only ever scores what is named here -- a def missing from this table is a
  // unit no computer opponent can field, which is the M11 failure test/aiscripts.js exists to catch.
  // The tenth, the Mothership, is deliberately absent: nothing trains it, so a weight on it would be a
  // permanent zero-count top pick that production() re-scores every think and can never satisfy. It is
  // merged explicitly in production() beside the Archon, which is the same shape the Viking's assault
  // mode and the MULE are handled in.
  //
  // Weights take share from the line they join rather than resetting the table, as the Terran block
  // above does and for the same reason: every existing number is what HANDOFF.md's balance figures
  // were measured against, and thirty-seven new units already dilute all of them. Into Zerg the
  // Colossus is heavier (splash into a swarm is the reason the unit exists) and the Immortal lighter
  // (explosive is wasted on a zergling); in the generic list it is the other way round.
  PvZ: [['zealot', 2], ['dragoon', 8], ['sentry', 2], ['high_templar', 3], ['dark_templar', 2], ['immortal', 3], ['colossus', 5], ['disruptor', 2], ['reaver', 3], ['shuttle', 1], ['warp_prism', 1], ['observer', 3], ['corsair', 2], ['phoenix', 2], ['oracle', 2], ['void_ray', 3], ['scout', 2], ['carrier', 5], ['tempest', 3], ['arbiter', 3]],
  ZvP: [['zergling', 3], ['hydralisk', 6], ['roach', 3], ['mutalisk', 3], ['scourge', 1], ['ultralisk', 3], ['defiler', 2], ['queen', 2], ['infestor', 2]],
  P: [['zealot', 4], ['dragoon', 5], ['sentry', 2], ['high_templar', 2], ['dark_templar', 2], ['immortal', 3], ['colossus', 5], ['disruptor', 2], ['reaver', 3], ['shuttle', 1], ['warp_prism', 1], ['observer', 1], ['corsair', 2], ['phoenix', 2], ['oracle', 2], ['void_ray', 3], ['scout', 2], ['carrier', 5], ['tempest', 3], ['arbiter', 3]],
};
const AI_RESEARCH = {
  T: ['stim', 'siege_tech', 'u238', 'infW', 'infA', 'ion_thrusters', 'spider_mines_tech', 'vehW', 'charon', 'vehA', 'irradiate_tech', 'emp_tech', 'personnel_cloaking', 'lockdown_tech', 'yamato_tech', 'shipW', 'shipA', 'cloaking_field', 'suppress_inf', 'suppress_veh', 'restoration_tech', 'optical_flare_tech', 'caduceus', 'moebius', 'ocular', 'apollo', 'titan', 'colossus'],
  // M12's five Zerg researches, placed by what they unlock rather than appended. `volatile_bile` and
  // `ravager_aspect` gate whole units and sit with lurker_aspect near the front; `glial_reconstitution`
  // is a speed upgrade and sits with the other two; the two Infestation Pit techs go late, next to the
  // other lair-and-beyond spell techs, because Zerg reaching that building at all is the open question.
  // Order here is priority only -- research() skips anything whose building does not exist yet -- and
  // HANDOFF.md records that reordering this list has never moved a measured outcome.
  Z: ['metabolic', 'flyW', 'lurker_aspect', 'volatile_bile', 'carapace', 'meleeW', 'ravager_aspect', 'grooved', 'muscular', 'glial_reconstitution', 'missW', 'flyA', 'burrow_tech', 'pneumatized', 'anabolic', 'chitinous', 'adrenal', 'consume_tech', 'plague_tech', 'pathogen_glands', 'suppress_hyd', 'suppress_air', 'spawn_broodling_tech', 'ensnare_tech', 'pressurised_glands', 'ventral_sacs', 'antennae', 'gamete', 'metasynaptic'],
  // M12's two Protoss researches are placed by what they unlock, not appended. `warp_gate_tech` is
  // SECOND, right behind Singularity Charge: it is the only prerequisite of a scripted building
  // (`warp_gate` at supply 30), and everything a research list can do to a build order it does by
  // being early enough to have finished when the order reaches the step. `blink` goes behind Leg
  // Enhancements because they are the same kind of thing, both come off the Citadel, and the Citadel is
  // already in the script at 24. Order here is priority only -- research() skips anything whose
  // building does not exist yet -- and HANDOFF.md records that reordering this list has never moved a
  // measured outcome.
  P: ['singularity', 'warp_gate_tech', 'gW', 'leg_enhancements', 'blink', 'gA', 'psi_storm_tech', 'shields', 'scarab_damage', 'gravitic_drive', 'airW', 'carrier_capacity', 'stasis_tech', 'khaydarin_amulet', 'airA', 'recall_tech', 'suppress_gate', 'suppress_bay', 'maelstrom_tech', 'mind_control_tech', 'hallucination_tech', 'disruption_web_tech', 'reaver_capacity', 'gravitic_boosters', 'sensor_array', 'apial_sensors', 'gravitic_thrusters', 'argus_talisman', 'argus_jewel', 'khaydarin_core'],
};
// Derived style tables, built once on first use from the deltas in AI.styleDeltas() and never edited
// afterwards. It is a cache of a pure function of two constants, so a rejoining client, a replay in a
// fresh process and the game that recorded it all build the same thing -- which is the only property
// the simulation needs from it.
const AI_STYLE_CACHE = {};
class AI {
  constructor(p, diff, style) {
    // Style and difficulty are orthogonal. Difficulty sets the base numbers -- how much army before the
    // first attack, how often the AI thinks at all -- and a style shifts them, so every style is
    // playable at every difficulty and the ordering between styles is the same at all three.
    //
    // Callers that pass two arguments get 'standard', which is a zero delta in every field and plays
    // exactly as this AI played before styles existed. That matters: every balance figure in HANDOFF.md
    // was measured against it, and a default with anything in it would silently void all of them.
    //
    // Nothing constructs an AI with a third argument yet (wave two's skirmish setup screen is where the
    // player will choose one), so a style may also be named on the player options, which is where it can
    // arrive without editing js/game.js. G.setup is those options; Replay.data() saves them and G.init
    // is handed them again on load, so a styled game replays as itself with no second place to keep the
    // setting and no new field for the snapshot to carry.
    const opt = (typeof G !== 'undefined' && G.setup && G.setup.players && G.setup.players[p.id]) || {};
    const want = style || opt.style;
    this.style = this.styleDeltas()[want] ? want : 'standard';
    this.p = p; const st = this.sty();       // p first: sty() is per race as well as per style
    this.diff = diff; this.step = 0; this.pending = {}; this.lastThink = 0; this.lastArmy = 0; this.state = 'gather'; this.target = null; this.attackN = 0; this.attackThreshold = Math.max(10, (diff === 'easy' ? 40 : diff === 'hard' ? 24 : 30) + 4 + (st.atk || 0)); this.waves = 0; this.scouted = false; this.dropOp = null; this.lastDrop = 0;
    this.thinkEvery = diff === 'easy' ? 72 : diff === 'hard' ? 20 : 32; this.scriptIdx = 0; this.lastExpand = 0; this.rally = null; this.startedAttack = 0; this.reserveMin = 0; this.reserveGas = 0;
  }
  // ---------------- play styles ----------------
  // A style is a DELTA over the three tables at the top of this file, not a fourth copy of them. Six
  // shapes of delta, and everything else is a plain number some rule below multiplies or adds:
  //   add    extra build steps, merged into the race's script and re-sorted
  //   early  pull a step the script already has forward to this supply
  //   comp   multiply one unit's share of the army supply, in every matchup variant at once
  //   front  research to move to the head of the list
  //   res    keep only this many entries of the research list -- "minimal tech"
  //   race   override any of the above for one race, because one style has to (see styleFor)
  //   atk       how much army supply before the first attack (economy(), army())
  //   waveGrow  how much more each wave after it wants
  //   reinforce how much has to gather before it is sent after the wave
  //   regroup   seconds spent rebuilding after a retreat
  //   workers   multiplier on the worker cap
  //   wkFloor   how many workers are free of the army gate
  //   wkGate    how much army the gate then wants per worker
  //   halls     bases wanted, relative to the clock
  //   expandT   how fast that clock and the expansion cooldown run
  //   def       static defence wanted at each base past the first
  //   dropT     how soon and how often it drops
  //   under     how many buildings the script may have going up at once, over the usual two
  //
  // This table lives inside a method rather than beside AI_SCRIPTS for one reason, and it is worth
  // stating because the shape looks odd otherwise: js/build.js stamps simulation data tables BY NAME
  // ('AI_SCRIPTS', 'AI_COMP', 'AI_RESEARCH') and separately hashes the source text of everything on
  // AI.prototype. A new global would be simulation data the build stamp cannot see, so tuning a style
  // would not move the stamp, and a save recorded before the tune would load and drift quietly -- the
  // exact failure js/build.js exists to prevent. A table inside a method is covered for free.
  styleDeltas() {
    return {
      standard: {},
      // Defensive buildings early, a bigger army before it commits, and a base count that lags the clock.
      turtle: {
        atk: 20, waveGrow: 10, halls: -1, expandT: 1.2, def: 2.5, workers: 1.1, under: 1,
        early: { T: { engineering_bay: 18 }, Z: { evolution_chamber: 20 }, P: { forge: 13 } }, // the thing each race's static defence needs before it can have any
        add: {
          T: [[13, 'bunker'], [21, 'bunker'], [26, 'missile_turret'], [30, 'missile_turret']],
          Z: [[14, 'creep_colony'], [22, 'creep_colony'], [26, 'creep_colony'], [33, 'creep_colony']],
          P: [[16, 'photon_cannon'], [21, 'photon_cannon'], [30, 'photon_cannon'], [33, 'shield_battery']],
        },
        comp: { siege_tank: 1.5, goliath: 1.3, vulture: 0.6, hydralisk: 1.3, zergling: 0.6, mutalisk: 0.7, dragoon: 1.3, high_templar: 1.5, zealot: 0.7 },
      },
      // Production before tech, and a first attack at about two thirds of the usual army. `res` is the
      // whole of "minimal tech": the research list is a priority order, so truncating it buys the cheap
      // early upgrades and nothing else, without removing a single building from the tech tree.
      rusher: {
        atk: -12, waveGrow: 5, workers: 0.85, wkFloor: -2, wkGate: 1.6, res: 6, expandT: 1.25, def: 0.5,
        early: { T: { barracks: 9, academy: 16 }, Z: { spawning_pool: 9 }, P: { gateway: 9 } },
        add: { T: [[12, 'barracks']], Z: [[16, 'hatchery']], P: [[12, 'gateway']] },
        comp: {
          marine: 1.5, firebat: 1.4, medic: 1.2, vulture: 1.5, siege_tank: 0.7, science_vessel: 0.5, valkyrie: 0.5, battlecruiser: 0.4,
          zergling: 2, hydralisk: 1.2, ultralisk: 0.5, defiler: 0.5, queen: 0,
          zealot: 2, dragoon: 1.2, high_templar: 0.6, reaver: 0.6, carrier: 0.4, arbiter: 0.4,
        },
      },
      // More town halls, sooner, and the workers to fill them: the worker cap goes up, the floor below
      // which the army gate does not apply goes up with it, and the attack waits.
      expander: {
        atk: 6, halls: 1, expandT: 0.6, workers: 1.15, wkFloor: 4, wkGate: 0.5, under: 1,
        race: { Z: { expandT: 1, halls: 0 } },   // see styleFor(): Zerg expands hard for free
        // Protoss needed pulling harder once tier 3 moved forward. A Nexus at 16 used to sit in an empty
        // stretch of the Protoss order; it now competes with a Robotics Facility at 19, a Citadel at 21
        // and a Stargate at 23, and it lost -- expander Protoss took TWO bases against standard's four,
        // which is the style doing the opposite of its name. Measured by test/aistyles.js, which
        // compares the styles against each other rather than against fixed numbers, and so noticed.
        early: { T: { command_center: 18 }, Z: { hatchery: 10 }, P: { nexus: 13 } },
        // Zerg gets the earlier first hatchery and nothing else. A hatchery is a Zerg's production as
        // well as its expansion, so the shared expansion rules already push it hard: with a step here
        // too it reached thirteen hatcheries and twenty army supply at ten minutes, which is not a play
        // style but a caricature of one.
        add: { T: [[28, 'command_center']], P: [[22, 'nexus'], [30, 'nexus']] },
      },
      // Smaller waves, more of them, and an army that can leave: mobile units up, siege units down,
      // speed upgrades first, and twice as many drops. waveGrow is the important one -- the second wave
      // normally wants eight more supply than the first, and this one barely waits at all.
      harasser: {
        atk: -6, waveGrow: 3, reinforce: 8, regroup: 14, dropT: 0.5, def: 0.75, workers: 1.05,
        front: { T: ['ion_thrusters', 'u238'], Z: ['metabolic', 'pneumatized'], P: ['leg_enhancements', 'gravitic_drive'] },
        // These have to stay AHEAD of the base script, and the base script moved: Starport went 36 -> 22
        // and Spire 26 -> 20 when tier 3 was pulled forward, which left the old 30 and 22 here pointing
        // BEHIND the thing they exist to bring forward. test/aistyles.js caught it -- it asserts that
        // every id a style names is actually moved earlier, precisely so a style cannot quietly become
        // a no-op when the order beneath it changes.
        early: { T: { starport: 16 }, Z: { spire: 16 }, P: { citadel_of_adun: 16 } },
        comp: {
          vulture: 3, wraith: 2, dropship: 2.5, goliath: 0.8, siege_tank: 0.5, valkyrie: 0.7, battlecruiser: 0.5,
          zergling: 2, mutalisk: 2, scourge: 1.5, hydralisk: 0.8, ultralisk: 0.4,
          dark_templar: 3, corsair: 2, scout: 2, shuttle: 2.5, dragoon: 0.8, reaver: 0.5, carrier: 0.4,   // not the zealot: it is the default thing a gas-starved Protoss builds anyway, and boosting it says nothing
        },
      },
    };
  }
  // The delta for a style AND a race. `race` is a shallow override of everything above it, and it exists
  // because one of these styles does mean something different for one race: a Zerg town hall is also its
  // production building and its larva, so Zerg already expands hard for reasons that have nothing to do
  // with expanding. Given the same expansion clock as Terran, the expander Zerg reached fourteen
  // hatcheries at ten minutes with a spawning pool and nothing else -- no lair, no den, no evolution
  // chamber. That is not a play style, it is an amputated tech tree, and it is the M10 failure with a
  // different cause.
  styleFor(style, race) {
    const k = 'D' + style + race; if (AI_STYLE_CACHE[k]) return AI_STYLE_CACHE[k];
    const d = this.styleDeltas()[style] || {};
    return AI_STYLE_CACHE[k] = Object.assign({}, d, (d.race || {})[race] || {});
  }
  sty() { return this.styleFor(this.style, this.race); }
  // The build order for a race under a style. THE invariant is that the result is in ascending supply
  // order -- see the comment above AI_SCRIPTS for what one inverted pair costs -- so added and moved
  // steps are merged and the whole thing is re-sorted rather than spliced in by hand. Array sort has
  // been required to be stable since ES2019, so two steps at the same supply keep the order written:
  // the script's own first, then the style's. test/aistyles.js asserts the ordering for every style and
  // every race instead of trusting this paragraph.
  styleScript(race, style) {
    const k = 'S' + style + race; if (AI_STYLE_CACHE[k]) return AI_STYLE_CACHE[k];
    const st = this.styleFor(style, race), s = AI_SCRIPTS[race].map(x => [x[0], x[1]]);
    const early = st.early && st.early[race];
    if (early) for (const id of Object.keys(early)) { const step = s.find(x => x[1] === id); if (step && early[id] < step[0]) step[0] = early[id]; } // only ever earlier, and only a step the script already has
    for (const x of (st.add && st.add[race]) || []) s.push([x[0], x[1]]);
    s.sort((a, b) => a[0] - b[0]);
    return AI_STYLE_CACHE[k] = s;
  }
  // Weights are a share of army supply and only ever divide, so a fractional one is meaningful and there
  // is nothing to round to. A multiplier of exactly 0 removes the unit: production() skips on `!wgt`.
  styleComp(key, style) {
    const k = 'C' + style + key; if (AI_STYLE_CACHE[k]) return AI_STYLE_CACHE[k];
    const mul = this.styleFor(style, key[0]).comp;
    return AI_STYLE_CACHE[k] = AI_COMP[key].map(([id, w]) => [id, mul && mul[id] !== undefined ? w * mul[id] : w]);
  }
  styleResearch(race, style) {
    const k = 'R' + style + race; if (AI_STYLE_CACHE[k]) return AI_STYLE_CACHE[k];
    const st = this.styleFor(style, race); let r = AI_RESEARCH[race].slice();
    const front = st.front && st.front[race];
    if (front) r = front.filter(id => r.includes(id)).concat(r.filter(id => !front.includes(id)));
    if (st.res) r = r.slice(0, st.res);
    return AI_STYLE_CACHE[k] = r;
  }
  // money set aside for the building the script/expansion logic is waiting to afford; workers, supply and gas ignore it
  // HAS THE BUILD ORDER BEEN STUCK LONG ENOUGH THAT IT OUTRANKS EXPANDING?
  //
  // macro() spends with force=true for expansions and production buildings, and force bypasses
  // afford(), which is what the head step of the build script reserves with. So a Zerg expansion --
  // 300 minerals, every few minutes, forever -- takes exactly the money the Spire is saving for.
  // Measured on a solo 20-minute game, seed 1: the Spire held the head of the script for 842 SECONDS,
  // 4:23 to 18:25, and spent that whole time on ~60 minerals and ~300 gas. It had the gas. It never
  // had the minerals, because a hatchery took them first every time.
  //
  // Expanding is not wrong and this does not stop it -- it stops it OUTRANKING a tech step that has
  // been starved for 45 seconds. Gas buildings keep their force unconditionally: gas pays for itself
  // and is the thing the tech step is usually short of anyway.
  techStarved() { return this.stepT !== undefined && G.frame - this.stepT > 24 * 45; }
  // Once 40% of the target is banked, stop spending until it is affordable. A quarter was too eager: it
  // froze unit production for a fifth of the game while a hall was being saved for, which is the single
  // largest cause of idle production buildings.
  //
  // THE 40% FLOOR IS A TRAP WHEN INCOME IS BEING SPENT AS FAST AS IT ARRIVES, though, and that is the
  // normal state of a working AI. Below 40% the reserve is off, so units are bought, so the bank never
  // reaches 40%, so the reserve is never on. The bank random-walks near zero and the thing it is
  // "saving for" is never bought. Measured, solo 20-minute game, seed 1: Zerg's Spire held the head of
  // the build script for 842 seconds sitting on ~60 minerals against a 200 target -- 30%, just under
  // the floor -- while zerglings took every mineral that arrived.
  //
  // So the floor is skipped once the head step has actually been starved (see techStarved). That keeps
  // the measured behaviour in the normal case, where a step is briefly unaffordable and production
  // should not stall, and drops it in the pathological one, where nothing is going to change on its
  // own. It is a deadlock breaker, not a new spending policy.
  afford(min, gas) {
    const m = this.p.minerals, g = this.p.gas, hard = this.techStarved();
    if (min && this.reserveMin && (hard || m >= this.reserveMin * 0.4) && m - this.reserveMin < min) return false;
    if (gas && this.reserveGas && (hard || g >= this.reserveGas * 0.4) && g - this.reserveGas < gas) return false;
    return m >= min && g >= gas;
  }
  reserve(def) { this.reserveMin = Math.max(this.reserveMin, def.min); this.reserveGas = Math.max(this.reserveGas, def.gas); } // hold back the single most expensive thing we are saving for, not the sum
  get race() { return this.p.race; }
  mine(pred) { const out = []; for (const u of G.units) if (u.alive && u.owner === this.p.id && pred(u)) out.push(u); return out; }
  count(id, inclProd = true) { let n = 0; for (const u of G.units) { if (!u.alive || u.owner !== this.p.id) continue; if (u.def.id === id) n++; if (inclProd) for (const it of u.prod) if (it.id === id) n++; if (u.order.type === 'build' && u.order.def.id === id) n++; } if (this.pending[id] && G.frame - this.pending[id] < 360) n++; return n; }
  halls() { return this.mine(u => u.isBuilding && u.def.depot && !u.lifted); }
  // The neutral owner is not an opponent. It passes both of the other two tests -- nothing is allied
  // with it and it is never defeated -- so without this every AI on a map with wildlife would pick a
  // warren as an enemy base and send waves at it. Killing the wildlife is a decision a player makes
  // about a piece of ground, not a war aim. See the RACE_INFO.N block in js/data.js.
  enemies() { return G.players.filter(q => !G.allied(q.id, this.p.id) && !q.defeated && !q.neutral); }
  tick() {
    if (this.p.defeated) return;
    if (G.frame - this.lastThink < this.thinkEvery) { if (G.frame % 12 === 0) this.micro(); return; }
    this.lastThink = G.frame;
    this.reserveMin = 0; this.reserveGas = 0;
    for (const w of this.mine(u => u.def.worker && u.order.type === 'build' && u.order.def)) this.reserve(w.order.def); // keep the money for buildings a worker is walking to
    // THE HEAD STEP'S COST, CARRIED FROM THE LAST THINK. Everything below runs in order, and script()
    // -- the only thing that knows what the build order currently wants -- runs FOURTH. So economy()
    // and supply(), which are the two largest mineral sinks in the game (every worker and every
    // overlord), always saw a reserve of exactly zero and spent as if nothing were being saved for.
    // That is why gating worker production on afford() changed nothing at all for Zerg: at the moment
    // workers are trained there was never anything to be short of.
    //
    // One think stale is fine and is the point: the figure is only a spending brake, and the step it
    // refers to is by definition the one that was not affordable last time.
    if (this.headDef && !this.overrun()) this.reserve(this.headDef);
    try { this.economy(); this.supply(); this.script(); this.macro(); this.production(); this.research(); this.army(); this.scout(); this.drops(); this.micro(); } catch (e) { console.error('AI', e); }
  }
  // ---------------- economy ----------------
  economy() {
    const p = this.p, halls = this.halls();
    // `!u.def.mule` everywhere a worker is COUNTED. A MULE is a worker in every way the simulation
    // cares about -- it gathers, it returns cargo, it walks to a depot -- and in none of the ways this
    // function cares about: it expires in 75 seconds, it cannot be trained, and counting it here would
    // make an Orbital Command SUPPRESS SCV production for as long as its MULEs live, so the macro
    // mechanic would pay for itself out of the economy it exists to grow. Excluding it from the whole
    // pass rather than only from the count is deliberate too: the gas-balancing loop below would
    // otherwise send MULEs into a refinery, and a MULE mining gas is worth exactly one SCV. It needs no
    // shepherding -- Abilities.cast aims it at a patch when it lands and Unit.tickGather re-aims it at
    // another when that one runs out.
    const workers = this.mine(u => u.def.worker && !u.def.mule);
    // idle workers -> mine
    for (const w of workers) if (w.order.type === 'idle' && !w.carrying) { const m = G.findNearestResource(w, 'mineral'); if (m) w.applyOrder({ type: 'gather', target: m, phase: 'goto' }); }
    // gas balancing: 3 per gas building
    const gasB = this.mine(u => u.def.onGeyser && u.done && u.geyser.amount > 0);
    gasB.forEach((g, gi) => {
      const on = workers.filter(w => (w.order.type === 'gather' && w.order.target === g) || (w.order.type === 'return' && w.order.then === g));
      let want = workers.length < 11 ? (gi === 0 ? 2 : 0) : workers.length < 18 ? 3 : 3;
      if (p.gas > 800 && p.minerals < 300) want = Math.min(want, 1); if ((p.gas > 400 && p.minerals < 150) || p.gas > 1500) want = 0;
      // A GEYSER WITH NOBODY NEAR IT IS STILL WORTH STAFFING. The candidate list was restricted to
      // workers already within 20 tiles, so a geyser at a base the AI had just taken -- where there are
      // no workers yet, because they arrive by being sent -- stayed on ZERO for the rest of the game.
      // Measured on a solo 20-minute game: Protoss held eleven geysers staffed [3,3,3,2,0,3,3,0,0,2,0],
      // 19 of a possible 33, with 39 workers on minerals and 100 gas in the bank. Zerg was worse at
      // 6/15. Tier 3 is gas-gated, and the same run with unlimited gas reached every tier-3 building in
      // five to eight minutes -- so this single filter was most of the reason the AI never teched.
      //
      // Near workers are still strongly preferred: the fallback only widens the search when nothing is
      // close, and the list is sorted by distance either way, so the nearest worker is always taken.
      if (on.length < want) {
        const free = workers.filter(w => w.order.type === 'gather' && w.order.target && w.order.target.type === 'mineral' && !w.carrying);
        let cands = free.filter(w => dist(w, g) < 20 * TILE);
        if (!cands.length) cands = free;
        cands.sort((a, b) => dist(a, g) - dist(b, g));
        for (let i = 0; i < want - on.length && i < cands.length; i++) cands[i].applyOrder({ type: 'gather', target: g, phase: 'goto' });
      }
      else if (on.length > want) { const m = G.findNearestResource(on[0], 'mineral'); if (m) on[0].applyOrder({ type: 'gather', target: m, phase: 'goto' }); }
    });
    // worker production
    const st = this.sty(); // an expander wants more workers per patch and keeps making them for longer before the army gate below applies; a rusher wants fewer
    const fields = G.map.resources.filter(r => r.type === 'mineral' && r.amount > 0 && halls.some(h => h.done && distPt(r.cx, r.cy, h.x, h.y) < 10 * TILE)).length; const want = Math.min(70, Math.round((fields * 2 + gasB.length * 3 + 2) * (st.workers || 1)));
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
    // wkFloor is the count below which workers are free of the army gate (the Zerg ramp still starts at
    // 16, so raising the floor only widens the free window); wkGate is how much army the gate then wants
    // per worker. The second one exists because of a feedback loop the expander walked straight into on
    // Protoss: saving 400 for a nexus stops zealot production, a small army fails the gate written here,
    // failing it stops probe production, and fewer probes mean the nexus is saved for even longer. The
    // "expander" ended a lab game with 46 workers and four bases where plain standard had 66 and five.
    const wkFloor = (p.race !== 'Z' ? 12 : 16) + (st.wkFloor || 0), wkGate = st.wkGate || 1;
    if (this.count(RACE_INFO[p.race].worker) < want && (p.race !== 'Z' ? (workers.length < wkFloor || armySup >= workers.length * 0.4 * wkGate) : (workers.length < wkFloor || armySup >= (workers.length - 16) * 1.5 * wkGate))) this.train(RACE_INFO[p.race].worker, 2);
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
  // ...and 'command_center' joined that list in M12: an Orbital Command and a Planetary Fortress are
  // both still Command Centers for the purpose of "do we owe another one". Without this clause the two
  // scripted `command_center` steps become permanently unmet the moment either morph happens, and the
  // build order stalls on an expansion it already has for the whole 200 s give-up timer.
  scriptHave(cnt, id) { return (cnt[id] || 0) + (id === 'hatchery' ? (cnt.lair || 0) + (cnt.hive || 0) : id === 'lair' ? (cnt.hive || 0) : id === 'spire' ? (cnt.greater_spire || 0) : id === 'creep_colony' ? (cnt.sunken_colony || 0) + (cnt.spore_colony || 0) : id === 'command_center' ? (cnt.orbital_command || 0) + (cnt.planetary_fortress || 0) : 0); }
  // A build order is not a queue. It used to be run strictly at the head: one step that could not be
  // started froze everything behind it until a 200-second timer threw the step away for good, and the
  // steps that needed it were then thrown away in turn on `req`. Over nine games that abandoned 29 steps
  // and amputated the tech tree -- Protoss finished templar archives in none of six games, so no Protoss
  // caster was ever fielded and 23 of the 28 spells never fired once (test/casters.js). A human whose
  // next building is unaffordable starts the one after it, so scan forward instead: `scriptIdx` still
  // means "the first thing we still owe", and the timer only runs when nothing in reach can be started.
  script() {
    const s = this.styleScript(this.race, this.style), p = this.p, st = this.sty();
    const cnt = {}; for (const u of G.units) if (u.alive && u.owner === p.id) cnt[u.def.id] = (cnt[u.def.id] || 0) + 1;
    const need = i => { let n = 0; for (let k = 0; k <= i; k++) if (s[k][1] === s[i][1]) n++; return n; };
    const met = i => this.scriptHave(cnt, s[i][1]) >= need(i);
    while (this.scriptIdx < s.length && met(this.scriptIdx)) { this.scriptIdx++; this.stepT = G.frame; }
    if (this.scriptIdx >= s.length) return;
    if (this.stepT === undefined) this.stepT = G.frame;
    if (p.supUsed < s[this.scriptIdx][0]) { this.stepT = G.frame; return; }
    // Remember what the head of the order is, so turn() can hold money for it BEFORE economy() and
    // supply() get to spend next think. Cleared when the script runs out.
    this.headDef = s[this.scriptIdx] ? DATA.buildings[s[this.scriptIdx][1]] : null;
    const under = this.underway();
    // `!u.def.depot` excluded a Zerg hatchery, and EVERY Zerg production building is a depot -- so
    // prodDone was permanently 0 for Zerg and the gas-tech gate below (which passes at prodDone >= 3)
    // could only ever be opened by the armySup arm. Measured: the Spire was refused for this reason
    // 138 times in one solo game while Zerg sat on the same script step from 6:40 to 16:40. A larva
    // hatchery IS the production building; count it as one.
    const prodDone = this.mine(u => u.isBuilding && u.done && (u.def.spawnsLarva || (u.def.produces.length && !u.def.depot))).length;
    // HOW MANY THINGS MAY BE GOING UP AT ONCE -- a function of income, not a constant.
    //
    // This was a flat 2 (3 for a hall), which is right for a twelve-worker opening and absurd for a
    // seventy-worker one, and macro() does not respect it at all: expansions, gas and production
    // buildings start whenever they like. So in any developed economy `under` sat at 3-5 permanently
    // and the head of the TECH order was simply never startable. Measured on a solo 20-minute game,
    // seed 1: the head step was rejected for this reason 423 times for Protoss's Citadel of Adun and
    // 226 for its Robotics Facility; Terran's Factory 244; Zerg's Spire 225 and its Hive 58. The
    // 200-second escape hatch below then advanced past them, so the buildings were not delayed --
    // they were SKIPPED, which is why no tier-3 unit appeared in any of the eighteen soak games.
    //
    // A worker is roughly a unit of income, so slots scale with workers. Twelve workers still gets 2,
    // which preserves the opening this was tuned for; seventy gets 7, which is what a player with
    // seventy workers actually does.
    const wCount = this.mine(u => u.def.worker && !u.def.mule).length;
    const slots = Math.floor(wCount / 12);
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
      // ...and a style that adds steps has to be allowed to start them. Measured, and it is the reason
      // `under` exists as a knob at all: a turtle Terran with two extra bunkers in its order built ONE
      // defensive building in ten minutes and no engineering bay, academy or machine shop either. The
      // throttle is a shared budget, the Terran script already spends all of it, and two more steps
      // starved the rest of the order rather than being starved themselves.
      // The HEAD step gets one slot more than a look-ahead step. It is the single most time-critical
      // building the AI owns and everything behind it waits on it, whereas a step reached by scanning
      // ahead is by definition optional right now.
      if (!(def.gw || def.aw || def.id === 'creep_colony')
          && under >= (def.depot ? 3 : 2) + (st.under || 0) + slots + (i === this.scriptIdx ? 1 : 0)) continue; // finish what is already going up first
      // gas-hungry tech waits until there is an army and enough production to use it
      if (def.gas >= 100 && !def.produces.length && (this.armySup || 0) < 16 && prodDone < 3) continue;
      if (p.minerals < def.min || p.gas < def.gas) { if (i === this.scriptIdx && !this.overrun()) this.reserve(def); continue; } // save up for the head step instead of spending on units -- unless an army is on its way here, in which case units now beat a building later
      // Only the head step may spend past the reserve; a step reached by scanning ahead must not eat the
      // money the step in front of it is saving for, or it would starve the thing it jumped over.
      if (this.build(id, i === this.scriptIdx && !this.mine(u => u.def.worker && u.order.type === 'build' && u.order.def).length)) { this.stepT = G.frame; return; } // a worker already walking to a site keeps its money
    }
    if (G.frame - this.stepT > 24 * 200) { this.scriptIdx++; this.stepT = G.frame; } // nothing in the whole order was startable for that long: stop asking for the head
  }
  macro() {
    const p = this.p, r = this.race; const halls = this.halls();
    // expansion when floating minerals or saturated
    const workers = this.mine(u => u.def.worker && !u.def.mule).length;   // a MULE is temporary; counting it here would trigger an expansion the economy cannot hold once it expires
    // Expanding only on floating minerals rewards whoever spends worst: Zerg banks between larvae and takes
    // a third base, while Protoss and Terran spend every mineral and sit on two forever. Keep a base-count
    // floor that grows with the clock so every race keeps taking ground.
    const st = this.sty(), exT = st.expandT || 1; // an expander runs the same clock faster and starts a base ahead of it; a turtle runs it slower and stays a base behind
    const wantHalls = Math.min(G.map.bases.length, 2 + (st.halls || 0) + Math.floor(G.frame / (24 * 60 * 3 * exT)));
    if (G.frame - this.lastExpand > 24 * 45 * exT && (p.minerals > 500 || workers > halls.length * 16 || halls.length < wantHalls || ((this.armySup || 0) >= 30 && halls.length < 3)) && this.count(RACE_INFO[r].hall) <= halls.length) { const hd = DATA.buildings[RACE_INFO[r].hall]; if (p.minerals < hd.min) { if (this.pickExpansion()) this.reserve(hd); } else if (this.build(RACE_INFO[r].hall, !this.techStarved() || (st.halls || 0) > 0)) this.lastExpand = G.frame; } // ...but an EXPANDER keeps its forced expansion: taking ground before teching is the whole style, and yielding it cost a base against standard // start saving as soon as a free base exists, or the army eats the money forever
    // more production when floating
    // production capacity should track income: roughly one production building per 4 workers
    const prodWant = Math.min(10, Math.max(2, Math.floor(workers / 4)));
    if ((p.minerals > 250 && this.scriptIdx >= 6 && this.mine(u => u.isBuilding && u.def.produces.length && !u.def.depot && u.done).length < prodWant) || p.minerals > 600) {
      // An expander always has a base going up, and without the style term here its own expansions stop
      // it ever adding production: eight command centres, one barracks and no army at ten minutes.
      if (this.underway() >= 3 + (st.under || 0)) return; const prodId = r === 'T' ? (this.count('factory') >= 2 && p.gas > 200 ? 'factory' : 'barracks') : r === 'P' ? 'gateway' : 'hatchery';
      if (r === 'Z' && this.count('hatchery') + this.count('lair') + this.count('hive') < 8 && workers >= 12 * this.mine(u => u.isBuilding && u.def.spawnsLarva).length) this.build('hatchery');
      else if (r !== 'Z' && this.count(prodId) < prodWant) this.build(prodId, !this.techStarved()); // the army engine outranks whatever the script is saving for -- unless that step has been starved for 45s
    }
    // Zerg macro hatcheries: larvae are the bottleneck, so floating minerals with no larva means another hatchery, not more drones per hatchery
    if (r === 'Z' && ((p.minerals > 300 && !this.mine(u => u.def.larva).length) || p.minerals > 550) && workers >= 5 * this.mine(u => u.isBuilding && u.def.spawnsLarva).length && this.count('hatchery') <= this.halls().length && this.mine(u => u.isBuilding && u.def.spawnsLarva).length < 6 && halls.length) { const h = halls[Math.floor(G.rand() * halls.length)]; this.buildNear('hatchery', h.x, h.y); } // macro hatcheries go next to a base we already hold; real expansions come from the shared rule below
    // gas: one per base with hall
    if (this.scriptIdx >= 3 && workers > 5 * gasBuildings(this) && !(p.gas > 800 && p.minerals < 300)) for (const h of halls) { if (!h.done) continue; const base = G.map.bases.find(b => distPt(b.cx, b.cy, h.x, h.y) < 3 * TILE); if (base && base.geyser && base.geyser.amount > 0 && !(base.geyser.building && base.geyser.building.alive) && p.minerals >= 100 && this.count(RACE_INFO[r].gasB) <= this.mine(u => u.def.onGeyser).length) { this.buildAt(RACE_INFO[r].gasB, base.geyser.x, base.geyser.y, true); break; } } // gas pays for itself, never let the reserve block it
    // Static defence at the natural, placed on the line the enemy actually comes down rather than
    // towards the middle of the map, so an attack meets it instead of walking round it.
    if (this.scriptIdx >= 4 && p.minerals > 200) {
      for (const nat of halls.slice(1)) if (nat.done) { const defId = r === 'T' ? 'missile_turret' : r === 'P' ? 'photon_cannon' : 'creep_colony'; const en = this.enemies()[0]; const tox = en && en.startX != null ? en.startX : G.map.w * TILE / 2, toy = en && en.startY != null ? en.startY : G.map.h * TILE / 2; const px = nat.x + (tox - nat.x) * 0.15, py = nat.y + (toy - nat.y) * 0.15; const isDef = u => u.isBuilding && (u.def.id === defId || u.def.id === 'sunken_colony' || u.def.id === 'spore_colony'); const near = this.mine(u => isDef(u) && (dist(u, nat) < 16 * TILE || distPt(u.x, u.y, px, py) < 16 * TILE)).length; if (near < Math.max(1, Math.round((r === 'Z' ? 4 : 2) * (st.def || 1))) && this.count(defId) <= this.mine(isDef).length && p.hasReq(DATA.buildings[defId])) { this.buildNear(defId, px, py); break; } }
    }
    // Zerg: morph creep colonies into sunkens
    if (r === 'Z') { const enemyAir = this.sawAir(); const spores = this.mine(u => u.def.id === 'spore_colony').length, sunkens = this.mine(u => u.def.id === 'sunken_colony').length; for (const c of this.mine(u => u.def.id === 'creep_colony' && u.done && !u.prod.length)) G.queueMorph(c, p.hasBuilding('evolution_chamber') && (enemyAir ? spores < sunkens : spores < Math.floor(sunkens / 3)) ? 'spore_colony' : 'sunken_colony'); }
    // Terran addons
    // 'reactor' is new in M12 and it gets its OWN gate rather than joining the cheap group, which is a
    // correction and not a preference. Dropped into the cheap group it fired at supply 13 on the only
    // Barracks the AI owned, and Unit.tickBuilding halts a parent's production for the whole time an
    // add-on is going up (`if (this.addon && !this.addon.done) return;`) -- so the Terran AI stopped
    // making infantry for 600 frames, sat at supply 13 for 1,800, spent the 100 gas its Factory was
    // saving for, and never reached step 4 of its own build order in a twenty-thousand-frame game.
    // Measured, seed 1, TvZ temple: 0 factories and 9 barracks at frame 19,200 against 1 factory, an
    // academy, an armory and a siege line on the same seed without it.
    //
    // So: never the last production building, and only out of a bank that can afford to lose it.
    // A throughput add-on is a thing you buy when you are already ahead.
    if (r === 'T') { for (const b of this.mine(u => u.isBuilding && u.done && !u.addon && !u.prod.length && u.def.addons.length)) { const aid = b.def.addons[0]; if (aid === 'comsat_station' && !p.hasBuilding('academy')) continue;
      if (aid === 'reactor') { if (this.mine(x => x.isBuilding && x.done && x.def.id === 'barracks').length >= 2 && p.minerals > 400 && p.gas > 200) G.queueAddon(b, aid); }
      else if (aid === 'machine_shop' || aid === 'control_tower' || aid === 'comsat_station') { if (p.minerals > 150 && p.gas > 100) G.queueAddon(b, aid); } else if (aid === 'physics_lab' && p.minerals > 300) G.queueAddon(b, aid); } }
    // Protoss: pylons when running low on power spots
    if (r === 'P' && p.minerals > 200 && this.afford(100, 0) && this.count('pylon') < 3 + this.mine(u => u.isBuilding && !u.def.psi && !u.def.depot).length / 2) this.build('pylon');
    // Zerg: lair/hive/greater spire upgrades are in script; hatchery tech at 2 hatch
  }
  production() {
    const p = this.p; const foe = this.enemies()[0]; const key = foe && AI_COMP[this.race + 'v' + foe.race] ? this.race + 'v' + foe.race : this.race; const comp = this.styleComp(key, this.style); const cands = []; // the style multiplies weights, so a per-matchup composition stays per-matchup
    const counts = {}; for (const u of G.units) if (u.alive && u.owner === p.id) { counts[u.def.id] = (counts[u.def.id] || 0) + 1; for (const it of u.prod) if (it.kind === 'unit') counts[it.id] = (counts[it.id] || 0) + 1; }
    // Was a raw scan of G.units with no vision test -- the AI knew about air it had never seen. It goes
    // through the intel model now, so hiding your air tech actually hides it.
    const enemyAir = this.sawAir(), needAA = enemyAir, needDet = this.sawCloak(), read = this.readEnemy();
    for (const [id, wgt] of comp) {
      const ud = DATA.units[id]; if (!wgt || !p.hasReq(ud)) continue;
      if (id === 'scourge' && !enemyAir) continue; if (id === 'corsair' && !enemyAir && !this.enemies().some(q => q.race === 'Z')) continue;
      if (id === 'observer' && (counts.observer || 0) >= (foe && foe.race === 'Z' ? 3 : 2)) continue;
      let w = wgt; if (this.race === 'Z' && id === 'hydralisk' && p.hasTech('lurker_aspect')) w += 2;
      // COUNTER WHAT WE HAVE SEEN. The composition weights say what this race likes to build; these
      // say what THIS GAME calls for, and they are multipliers on top so a matchup table still decides
      // the shape of the army. All three read the intel model, so all three are earned by scouting.
      if (needAA && (ud.aw || (ud.gw && ud.gw.targets === 'both'))) w *= 1.6;            // they have air, or are about to
      if (read === 'massing' && ((ud.gw && ud.gw.splash) || (ud.aw && ud.aw.splash))) w *= 1.8; // a big cheap army dies to splash
      if (read === 'massing' && (ud.min + ud.gas) <= 75 && !ud.worker) w *= 0.7;         // ...and trading cheap units into it is how you lose
      if (read === 'teching' && (ud.min + ud.gas) <= 125 && !ud.worker) w *= 1.5;        // they are buying something expensive: be there before it arrives
      if (needDet && ud.detector) w *= 2.5;                                              // something we saw needs a detector to shoot at
      if (ud.from !== 'larva' && !this.mine(b => b.isBuilding && b.done && b.def.produces.includes(id)).length) continue;
      const sup = (ud.sup || 1) * (ud.pair ? 2 : 1); cands.push([((counts[id] || 0) * sup + sup) / w, id, w, sup]); // weights are a share of army supply, so cheap units cannot crowd out the rest; w and sup ride along so the score can be recomputed after a train
    }
    cands.sort((a, b) => a[0] - b[0]);
    if (!cands.length) return;
    // A NYDUS CANAL WITH NO EXIT DOES NOTHING. The script has built one since M10 and nothing ever
    // placed the far end, so Zerg spent 150 minerals on an inert building every game and the ability
    // that justifies it -- Unit.order 'nydus', which teleports a ground army across the map -- could
    // never fire, because it refuses a canal whose nydusLink is missing.
    //
    // The exit goes at the furthest base this player owns from the canal, which is the only placement
    // that is worth anything: a link between two points you already hold is a shortcut, and a link to
    // somewhere you do not hold is a gift to the enemy.
    if (this.race === 'Z') {
      for (const cn of this.mine(u => u.def.nydus && u.done && !u.nydusLink)) {
        if (p.minerals < DATA.buildings.nydus_canal.min) break;
        let best = null, bd = -1;
        for (const b of this.mine(u => u.def.depot && u.done)) {
          const d = distPt(b.x, b.y, cn.x, cn.y);
          if (d > bd) { bd = d; best = b; }
        }
        if (!best || bd < 12 * TILE) break;                 // both ends in one base is not a shortcut
        const t = G.map.findFreeTile(best.tx, best.ty + best.def.h + 1, 8);
        if (t) Abilities.issue(cn, 'nydus_exit', null, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE);
        break;                                              // one a turn; it costs minerals
      }
      // M12 wave four: the network past the second end. A worm may only surface on creep, so this is
      // the AI's half of the tumour interlock -- the mouths follow the creep, and the creep follows
      // whatever the tumour chain has crawled over. Capped at three mouths and gated on 200 spare
      // minerals so a Nydus network never competes with an expansion or with army production.
      for (const cn of this.mine(u => u.def.id === 'nydus_canal' && u.done && u.nydusLink)) {
        const net = cn.nydusNet || [];
        if (net.length >= 3 || p.minerals < DATA.buildings.nydus_worm.min + 200) break;
        const halls = this.halls().filter(h => h.done && !h.lifted); const h = halls[halls.length - 1];
        if (!h || net.some(w => distPt(w.x, w.y, h.x, h.y) < 10 * TILE)) break;
        const t = G.map.findFreeTile(h.tx, h.ty + h.def.h + 1, 8, (x, y) => G.map.hasCreep(x, y));
        if (t) Abilities.issue(cn, 'nydus_worm', null, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE);
        break;
      }
    }
  // A NOTE ON THE MORPH CLAUSES BELOW. Every one of them used to gate on `p.minerals >= X && p.gas >= Y`
  // read straight off the player, which walks past AI.afford() and therefore past the reserve that the
  // head step of the build script is saving with. A Lurker morph is 50/100 and a Spire is 200/150, so
  // Zerg spent the Spire's gas on lurkers frame after frame and then reported the Spire as unaffordable
  // -- measured as 146 refusals of the Hive and 103 of the Greater Spire for "broke" in a single solo
  // game, while gas never rose above 118. They all go through afford() now, which honours the reserve.
    // M12 wave four: the five Zerg morphs. Each sits after the lurker/guardian/devourer clauses above
    // and each returns, so a think spends itself on at most one morph and the composition weights in
    // AI_COMP still decide everything that comes off a larva. All five are gated on a count relative
    // to the unit they consume, because a morph that eats its own source unconditionally converts the
    // whole army -- which is the mistake the Protoss archon clause below was written to stop.
    if (this.race === 'Z' && p.hasTech('volatile_bile') && (counts.baneling || 0) < 6 && (counts.zergling || 0) > 6 && this.afford(25, 25)) { const z = this.mine(u => u.def.id === 'zergling' && u.order.type !== 'attack'); if (z.length) { Abilities.morph(z[0], 'baneling'); return; } }
    if (this.race === 'Z' && p.hasTech('ravager_aspect') && (counts.ravager || 0) < (counts.roach || 0) / 2 && this.afford(25, 75)) { const r = this.mine(u => u.def.id === 'roach' && u.order.type !== 'attack'); if (r.length) { Abilities.morph(r[0], 'ravager'); return; } }
    if (this.race === 'Z' && p.hasBuilding('infestation_pit') && (counts.swarm_host || 0) < 3 && (counts.roach || 0) > 4 && this.afford(50, 100)) { const r = this.mine(u => u.def.id === 'roach' && u.order.type !== 'attack'); if (r.length) { Abilities.morph(r[0], 'swarm_host'); return; } }
    if (this.race === 'Z' && p.hasBuilding('infestation_pit') && p.hasBuilding('hive') && (counts.viper || 0) < 2 && this.afford(100, 200)) { const m = this.mine(u => u.def.id === 'mutalisk'); if (m.length > 4) { Abilities.morph(m[0], 'viper'); return; } }
    // An Overseer costs eight SUPPLY as well as its minerals, because it gives up the overlord's
    // `supGive`. Exactly one, and only with room to lose it: an AI that morphs at 198/200 has supply
    // blocked itself to buy detection it already had, since every overlord in this game detects.
    if (this.race === 'Z' && p.hasBuilding('lair') && (counts.overseer || 0) < 1 && p.supMax - p.supUsed >= 12 && this.afford(50, 50)) { const o = this.mine(u => u.def.id === 'overlord'); if (o.length > 2) { Abilities.morph(o[0], 'overseer'); return; } }
    // Zerg morphs: hydras -> lurkers, mutas -> guardians
    if (this.race === 'Z' && p.hasTech('lurker_aspect') && (counts.lurker || 0) < (counts.hydralisk || 0) / 1.5 && this.afford(50, 100)) { const h = this.mine(u => u.def.id === 'hydralisk' && u.order.type !== 'attack' && u.done); if (h.length) { Abilities.morph(h[0], 'lurker'); return; } }
    if (this.race === 'Z' && p.hasBuilding('greater_spire') && (counts.guardian || 0) < 4 && this.afford(50, 100)) { const m = this.mine(u => u.def.id === 'mutalisk'); if (m.length > 4) { Abilities.morph(m[0], 'guardian'); return; } }
    // Devourers, which nothing ever built: guardians hit ground, devourers hit air, and the greater spire
    // buys both. Gated on the enemy actually flying, the way scourge and corsairs already are.
    if (this.race === 'Z' && p.hasBuilding('greater_spire') && (counts.devourer || 0) < 3 && enemyAir && this.afford(150, 50)) { const m = this.mine(u => u.def.id === 'mutalisk'); if (m.length > 4) { Abilities.morph(m[0], 'devourer'); return; } }
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
      // M12 wave four: THE MOTHERSHIP, WHICH NOTHING PRODUCES. It has no `from`, so AI_COMP cannot
      // reach it and AI.train cannot build it -- the only way a computer opponent ever fields one is
      // this line, and without it the def would be exactly the M11 failure test/aiscripts.js exists to
      // catch, with a merge in place of a morph.
      //
      // ONE, EVER, and only from a surplus. Two Arbiters are 200/700 and both of them can Recall and
      // Stasis, which the Mothership cannot; converting the pair the moment it exists would trade the
      // AI's only escape hatch for a bigger gun. So it waits for a THIRD arbiter -- the pair it spends
      // is the surplus above the one it keeps -- and it checks `order.type !== 'merge'` so a merge
      // already under way is not re-issued every think.
      if ((counts.mothership || 0) < 1 && p.hasBuilding('fleet_beacon')) {
        const arbs = this.mine(u => u.def.id === 'arbiter' && u.order.type !== 'merge' && u.energy < DATA.abilities.recall.energy);
        if (arbs.length >= 2 && (counts.arbiter || 0) > 2) { Abilities.merge(arbs, 'summon_mothership'); return; }
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
    for (const id of this.styleResearch(this.race, this.style)) {
      if (DATA.techs[id]) { if (p.tech.has(id) || p.researching.has(id)) continue; const td = DATA.techs[id]; const b = this.mine(u => u.isBuilding && u.done && u.def.id === td.bld && !u.prod.length && !u.lifted)[0]; if (!b) continue; if (G.queueTech(b, id)) return; }
      else if (DATA.upgrades[id]) { const ud = DATA.upgrades[id]; const lvl = p.upgLevel(id); if (lvl >= 3 || p.researching.has(id)) continue; if (this.diff === 'easy' && lvl >= 1) continue; const b = this.mine(u => u.isBuilding && u.done && (u.def.id === ud.bld || (ud.bld === 'spire' && u.def.id === 'greater_spire')) && !u.prod.length)[0]; if (!b) continue; if (G.queueUpgrade(b, id)) return; }
    }
  }
  // ---------------- helpers ----------------
  train(id, maxQ) {
    const p = this.p, ud = DATA.units[id]; if (!ud || !p.hasReq(ud)) return false;
    if (p.minerals < ud.min || p.gas < ud.gas) return false;
    // Saving up never starves workers or urgent supply -- EXCEPT when the build order has been starved
    // for 45 seconds, at which point another drone is not what is wrong with this game. Zerg is the
    // reason: drones and overlords both skip afford(), Zerg wants ~70 of the first and a steady stream
    // of the second, and between them they took every mineral that arrived while the Spire sat at the
    // head of the script on one mineral. Supply keeps its exemption unconditionally, because blocking
    // it trades a tech stall for a supply block, which is worse.
    if (!(ud.supGive && p.supMax - p.supUsed < 4) && (!ud.worker || this.techStarved()) && !this.afford(ud.min, ud.gas)) return false;
    if (ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) return false;
    if (ud.from === 'larva') { const l = this.mine(u => u.def.larva)[0]; if (!l) return false; return G.larvaMorph(l, id); }
    const bs = this.mine(u => u.isBuilding && u.done && !u.lifted && u.def.produces.includes(id) && u.prod.length < (maxQ || 2) && !(u.addon && !u.addon.done)); if (!bs.length) return false;
    bs.sort((a, b) => a.prod.length - b.prod.length); return G.queueUnit(bs[0], id);
  }
  // could we train this if we had the money? (requirements, supply room and a production building with a free slot)
  canTrainSoon(id) { const p = this.p, ud = DATA.units[id]; if (!ud || !p.hasReq(ud)) return false; if (ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) return false; if (ud.from === 'larva') return !!this.mine(u => u.def.larva).length; return !!this.mine(u => u.isBuilding && u.done && !u.lifted && u.def.produces.includes(id) && u.prod.length < 3 && !(u.addon && !u.addon.done)).length; }
  addon(id) { const p = this.p, ad = DATA.buildings[id]; if (!p.hasReq(ad)) return false; const b = this.mine(u => u.isBuilding && u.done && u.def.id === ad.parent && !u.addon && !u.prod.length)[0]; if (!b) return false; return G.queueAddon(b, id); }
  // The source of a morph is DERIVED from the data, not listed here. It used to be a three-way ternary
  // -- lair from hatchery, hive from lair, greater spire from spire -- which was every morph that
  // existed when it was written. M11 added three Protoss structures that morph off a Shield Battery,
  // and because they were not in that ternary the AI could not build them at all: they were in the
  // tech tree, on the command card, and unreachable by any computer opponent.
  morphSource(id) {
    for (const k of Object.keys(DATA.buildings)) {
      const d = DATA.buildings[k];
      if (d.morphTo === id || (d.morphOptions || []).includes(id)) return k;
    }
    return null;
  }
  morph(id) { const p = this.p, nd = DATA.buildings[id]; const from = this.morphSource(id); if (!from) return false; if (p.minerals < nd.min || p.gas < nd.gas) return false; const b = this.mine(u => u.isBuilding && u.done && u.def.id === from && !u.prod.length)[0]; if (!b) return false; return G.queueMorph(b, id); }
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
  // A MULE must never be picked to put up a building: it expires, and a Terran building whose builder
  // is gone stops advancing (Unit.tickBuilding requires the builder to be standing on it), so the site
  // would sit at whatever fraction it reached when the MULE ran out.
  pickWorker(x, y) { const ws = this.mine(u => u.def.worker && !u.def.mule && !u.inside && u.stuck < 60 && (u.order.type === 'gather' || u.order.type === 'idle' || u.order.type === 'return') && !(u.order.type === 'gather' && u.order.target && u.order.target.type === 'gas')); if (!ws.length) return null; ws.sort((a, b) => distPt(a.x, a.y, x, y) + (a.carrying ? 200 : 0) - distPt(b.x, b.y, x, y) - (b.carrying ? 200 : 0)); return ws[0]; }
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
  // The four M12 Zerg additions with no weapon at all. armyUnits() is gated on hasWeapon(), so without
  // this an infestor, viper, swarm host or overseer would be trained and then stand at the hatchery
  // for the rest of the game -- the exact shape of "the AI casts 7 of 28 spells" in HANDOFF.md.
  supportUnits() { return this.mine(u => ['medic', 'science_vessel', 'observer', 'high_templar', 'defiler', 'arbiter', 'dark_archon', 'queen', 'infestor', 'viper', 'swarm_host', 'overseer'].includes(u.def.id) && !u.inside); }
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
  // ---------------- INTEL: what we have actually SEEN, and what we conclude from it ----------------
  //
  // This exists because the AI was cheating and it made scouting pointless. `enemyAir` -- the switch
  // that decides whether Zerg builds Scourge and Spore Colonies and whether Protoss builds Corsairs --
  // was a raw scan of G.units with NO vision test at all. The computer opponent knew about a Wraith
  // the moment it hatched, from across an unexplored map, and a player who hid their air tech gained
  // nothing by hiding it.
  //
  // Everything here goes through G.canSee (units, which move and can be hidden again) or G.explored
  // (buildings, which do not, so seeing one once is knowing it forever). Sightings are REMEMBERED and
  // never forgotten, which is the right model for a building and a generous-but-fair one for a unit:
  // a person who saw six Wraiths does not un-know it when they fly home.
  //
  // Deterministic: iteration order is G.units, no G.rand, no clock.
  observe() {
    const I = this.intel || (this.intel = { bld: {}, unit: {}, peak: {} });
    const pid = this.p.id, m = G.map;
    const now = {};
    for (const u of G.units) {
      if (!u.alive || G.allied(u.owner, pid) || u.def.notUnit || u.def.larva || u.def.egg) continue;
      if (G.players[u.owner] && G.players[u.owner].neutral) continue;
      if (u.isBuilding) {
        if (!G.explored(pid, Math.floor(u.x / TILE), Math.floor(u.y / TILE))) continue;
        I.bld[u.def.id] = 1;
      } else {
        if (!G.canSee(pid, u)) continue;
        I.unit[u.def.id] = 1;
        now[u.def.id] = (now[u.def.id] || 0) + 1;
      }
    }
    // the most of each kind ever seen at one time -- "they have a lot of zerglings" is a claim about a
    // count, and one glimpse of one zergling is not that claim
    for (const k of Object.keys(now)) I.peak[k] = Math.max(I.peak[k] || 0, now[k]);
    return I;
  }
  // Have we SEEN anything that flies and shoots, or anything that makes one? The building half matters
  // as much as the unit half: a Starport seen at six minutes is the warning, and the Wraith that comes
  // out of it at eight is too late to start building anti-air.
  sawAir() {
    const I = this.observe();
    for (const k of Object.keys(I.unit)) { const d = DATA.units[k]; if (d && d.fly && (d.gw || d.aw)) return true; }
    return ['starport', 'spire', 'greater_spire', 'stargate', 'fleet_beacon'].some(b => I.bld[b]);
  }
  // ...and anything we would need a detector to shoot at.
  sawCloak() {
    const I = this.observe();
    for (const k of Object.keys(I.unit)) { const d = DATA.units[k]; if (d && (d.cloak || d.burrow || d.permaCloak)) return true; }
    return ['covert_ops', 'control_tower', 'templar_archives', 'hydralisk_den'].some(b => I.bld[b]);
  }
  // ARE WE ABOUT TO BE OVERRUN? The other half of "sometimes massing tier 1 is the right answer":
  // holding 200 minerals for a Spire is correct against an opponent who is teching too, and suicidal
  // against one who is walking across the map with thirty zerglings right now. When the army we have
  // SEEN is half again ours and the read says massing, the build order stops reserving and the money
  // goes into units this minute.
  //
  // Deliberately strict -- it needs BOTH the read and the supply deficit -- because the failure mode of
  // getting this wrong is an AI that panics permanently and never techs at all, which is the bug this
  // whole branch was fixing.
  overrun() {
    if (this.readEnemy() !== 'massing') return false;
    const mine = this.armyUnits().reduce((t, u) => t + (u.def.sup || 1), 0);
    return this.seenEnemyArmy() > mine * 1.5 + 8;
  }
  // Is the enemy MASSING or TECHING? The two call for opposite answers and the whole point of scouting
  // is to tell them apart. "Massing" is a big cheap army with a shallow tech tree; "teching" is the
  // reverse -- an enemy with three advanced buildings and eight units is buying something expensive and
  // is soft right now. Neutral when we have not seen enough to say, which is the honest default.
  readEnemy() {
    const I = this.observe();
    const adv = Object.keys(I.bld).filter(b => DATA.buildings[b] && DATA.buildings[b].tier === 'adv').length;
    let cheap = 0, all = 0;
    for (const k of Object.keys(I.peak)) {
      const d = DATA.units[k]; if (!d || d.worker) continue;
      all += I.peak[k];
      if ((d.min || 0) + (d.gas || 0) <= 75) cheap += I.peak[k];
    }
    if (!all && !adv) return 'unknown';
    if (all >= 10 && cheap >= all * 0.6 && adv <= 1) return 'massing';
    if (adv >= 2 && all <= 8) return 'teching';
    return 'even';
  }
  // biggest enemy army supply we have actually seen, decayed slowly so old sightings stop mattering
  seenEnemyArmy() {
    let sup = 0;
    for (const u of G.units) { if (!u.alive || u.def.worker || u.def.larva || u.def.egg || u.def.notUnit) continue; if (G.allied(u.owner, this.p.id)) continue; if (u.isBuilding) { if ((u.def.gw || u.def.aw) && u.done && G.explored(this.p.id, Math.floor(u.x / TILE), Math.floor(u.y / TILE))) sup += 4; continue; } if (!u.hasWeapon()) continue; if (!G.canSee(this.p.id, u)) continue; sup += u.def.sup || 1; } // a defended base costs more army than an open field
    if (sup > (this.seenSup || 0)) this.seenSup = sup; else this.seenSup = (this.seenSup || 0) * 0.995;
    return this.seenSup;
  }
  army() {
    const p = this.p, army = this.armyUnits(), sup = army.reduce((s, u) => s + u.def.sup, 0), st = this.sty();
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
      // WHEN TO ATTACK IS ALSO A SCOUTING DECISION. An enemy who is teching has spent their money on
      // buildings and has a small army right now; that window is the entire reason to scout them. An
      // enemy who is massing has the opposite, and walking into it on schedule is how an army dies.
      const readNow = this.readEnemy();
      const readAdj = readNow === 'teching' ? -10 : readNow === 'massing' ? 8 : 0;
      const threshold = Math.max(this.attackThreshold + readAdj + this.waves * (st.waveGrow || 8) + (p.supUsed > 150 ? -20 : 0), this.seenEnemyArmy() * 1.25); // waveGrow is what makes a harasser come back with a small wave and a turtle come back with a bigger one
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
        this.state = 'gather'; this.regroupUntil = G.frame + 24 * (st.regroup || 25);
        const home = this.halls()[0] || { x: p.startX, y: p.startY };
        for (const u of army) { u.wave = 0; if (!u.burrowed) u.setOrder({ type: 'move', x: home.x, y: home.y }); }
        return;
      }
      for (const u of rest) if (u.order.type === 'idle' && distPt(u.x, u.y, rally.x, rally.y) > 5 * TILE) u.setOrder({ type: 'attackmove', x: rally.x + (G.rand() - .5) * 96, y: rally.y + (G.rand() - .5) * 96 });
      // reinforce: send gathered units as a group when enough have collected
      const gathered = rest.filter(u => distPt(u.x, u.y, rally.x, rally.y) < 8 * TILE); if (gathered.reduce((s, u) => s + u.def.sup, 0) >= (st.reinforce || 16)) for (const u of gathered) u.wave = this.waves;
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
  // ---- M12 wave four: the Zerg structures micro() cannot reach ------------------------------------
  // micro()'s loop skips buildings outright, and three of this milestone's Zerg mechanics live on
  // buildings: the tumour chain, the Nydus network's far ends, and the crawlers that can now walk.
  // Creep is something a player DRIVES now, so an AI that never planted a tumour would not be playing
  // the race a human is playing.
  zergCreep() {
    const p = this.p;
    // Chain the tumours: one child a think, from a finished tumour that has not seeded yet.
    //
    // BOTH GATES ARE LOAD-BEARING AND THE FIRST VERSION HAD NEITHER. A tumour seeds a tumour and that
    // one seeds another, so the chain is unbounded BY DESIGN -- that is the mechanic. Measured with no
    // bound on it, at eight minutes against a passive opponent the Zerg AI held 176 creep tumours,
    // twenty-one drones, no spawning pool, no den, no lair and an army of zero: 4,400 minerals of
    // creep and nothing to walk on it. `tumoured` stops one tumour paving the map on its own; it does
    // nothing about eight of them doing it in relay. So the bound is a hard count and real floating
    // money, and 300 is chosen to sit above the AI's own "am I floating" triggers rather than below
    // them -- creep is bought with the minerals a Zerg had nothing else to do with.
    if (this.tumourBudget()) for (const t of this.mine(u => u.def.tumour && u.done && !u.tumoured)) {
      const s = this.creepEdge(t.x, t.y, DATA.abilities.spawn_tumour.range);
      if (s) { Abilities.issue(t, 'spawn_tumour', null, s[0], s[1]); break; }
    }
    if (!this.turn(p.id, 8)) return;
    // Crawlers. TWO clauses and the order matters: recover first, then advance. An uprooted crawler
    // that cannot find anywhere to root is a defensive building the AI has disabled for the rest of
    // the game, so anything idle and standing up gets sat down where it is -- and if that spot is not
    // creep, it is sent to a legal one near a hall instead of retrying the same illegal tile forever.
    const halls = this.halls().filter(b => b.done && !b.lifted);
    for (const c of this.mine(u => u.def.crawler && u.lifted && u.order.type === 'idle')) {
      const tx = Math.round(c.x / TILE - c.def.w / 2), ty = Math.round(c.y / TILE - c.def.h / 2);
      if (!G.map.canPlace(c.def, tx, ty, p, G.units, c)) { Abilities.instant(c, 'uproot'); break; }   // canPlace returns a REASON on failure, null when legal
      const h = halls[0]; if (!h) break;
      const s = this.findSpot(c.def, h.tx, h.ty);
      c.setOrder(s ? { type: 'land', tx: s[0], ty: s[1] } : { type: 'move', x: h.x, y: h.y });
      break;
    }
    // ...and advance. Only towards a base that has no crawler at all, only from one that is not being
    // shot at, and only once a legal rooting tile has been found FIRST -- uprooting on spec is how a
    // crawler ends up walking around for twenty minutes.
    const nat = halls[halls.length - 1];
    if (!nat || halls.length < 2) return;
    if (this.mine(u => u.def.crawler && distPt(u.x, u.y, nat.x, nat.y) < 14 * TILE).length) return;
    const spare = this.mine(u => u.def.crawler && !u.lifted && u.done && distPt(u.x, u.y, nat.x, nat.y) > 20 * TILE
      && !G.near(u.x, u.y, 14 * TILE).some(o => o.alive && !G.allied(o.owner, p.id) && o.hasWeapon()))[0];
    if (!spare) return;
    const s = this.findSpot(spare.def, nat.tx, nat.ty);
    if (s && Abilities.instant(spare, 'uproot')) spare.setOrder({ type: 'land', tx: s[0], ty: s[1] });
  }
  // May this player spend on creep at all right now? One place, because the Overlord that starts a
  // chain and the tumour that continues it have to answer to the same budget or the cheaper of the two
  // simply spends everything the other one saved.
  tumourBudget() { return this.p.minerals >= 300 && this.count('creep_tumour') < 8; }
  // The nearest hatchery this Queen could usefully inject: one of ours, finished, short of larvae, and
  // without an inject already booked against it in G.fields. Null when there is nothing worth casting
  // on, which is what lets the Queen's other spells have the tick.
  injectHall(u) {
    const cap = DATA.abilities.larva_inject.cap;
    let best = null, bd = 26 * TILE;
    for (const o of G.units) {
      if (!o.alive || o.owner !== u.owner || !o.isBuilding || !o.done || !o.def.spawnsLarva) continue;
      if (o.larvae.length >= cap) continue;
      const dd = distPt(o.x, o.y, u.x, u.y); if (dd >= bd) continue;
      if (G.fields.some(f => f.kind === 'inject' && f.hall === o)) continue;
      bd = dd; best = o;
    }
    return best;
  }
  // The outermost creep tile within `range` of a point, leaning towards the enemy. A tumour planted in
  // the middle of creep you already own is a tumour that did nothing, so this walks rings from the far
  // edge inwards and takes the first legal tile -- which is what makes the chain travel.
  creepEdge(fx, fy, range) {
    const p = this.p, m = G.map, en = this.enemies()[0];
    const tox = en && en.startX != null ? en.startX : m.w * TILE / 2, toy = en && en.startY != null ? en.startY : m.h * TILE / 2;
    const base = Math.atan2(toy - fy, tox - fx), cx = Math.floor(fx / TILE), cy = Math.floor(fy / TILE);
    for (let r = Math.floor(range); r >= 2; r--) {
      for (let k = 0; k < 11; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
        const tx = Math.round(cx + Math.cos(a) * r), ty = Math.round(cy + Math.sin(a) * r * 0.8);
        if (!m.hasCreep(tx, ty)) continue;
        if (m.canPlace(DATA.buildings.creep_tumour, tx, ty, p, G.units, null)) continue;
        return [(tx + 0.5) * TILE, (ty + 0.5) * TILE];
      }
    }
    return null;
  }
  // ---- M12 wave four: the two Protoss mechanics micro() cannot reach ------------------------------
  // Both live on BUILDINGS, and micro()'s per-unit loop skips buildings outright -- the same structural
  // reason the Comsat, the Orbital Command and the Zerg tumour chain are handled before that loop.
  protossMacro() {
    const p = this.p;
    // ITEM 11, CHRONO BOOST. One cast per player per few ticks, not one per Nexus per tick.
    //
    // WHAT IT IS AIMED AT is the whole mechanic, so it is chosen rather than dumped on the caster: the
    // building with something in its queue that is worth the most supply, ignoring anything already
    // boosted. Preferring supply over "the first thing found" is what makes it accelerate a Carrier or
    // an Archon rather than the probe a Nexus happens to be making, and preferring a non-hall breaks
    // the tie towards army: economy is what the AI is already best at.
    if (this.turn(p.id, 3)) {
      const cb = DATA.abilities.chrono_boost;
      const nxs = this.mine(u => u.def.id === 'nexus' && u.done && !u.unpowered && u.energy >= cb.energy);
      nxs.sort((a, b) => b.energy - a.energy || a.id - b.id);        // ties by id so two full Nexuses do not jitter
      if (nxs.length) {
        let best = null, bs = -1;
        for (const b of this.mine(u => u.isBuilding && u.done && !u.lifted && !u.unpowered && u.prod.length)) {
          if (G.fields.some(f => f.kind === 'chrono' && f.bld === b)) continue;
          const it = b.prod[0];
          const s = (it.kind === 'unit' ? (DATA.units[it.id].sup || 1) * 2 : 3) + (b.def.depot ? 0 : 1);
          if (s > bs) { bs = s; best = b; }
        }
        if (best) Abilities.issue(nxs[0], 'chrono_boost', null, best.x, best.y);
      }
    }
    this.warpIn();
  }
  // ITEM 12. A Warp Gate has NO production queue, so this is the only way one ever makes anything --
  // without it, morphing a Gateway would be a strict downgrade for a computer opponent and the whole
  // item would be unreachable, which is exactly the M11 failure test/aiscripts.js exists to catch.
  //
  // WHAT to warp is decided by the composition table, scored the same way AI.production scores it --
  // share of army supply, cheapest-satisfied first -- so warp-in obeys the same ratios as the Gateways
  // beside it rather than being a second, disagreeing opinion about what the army should be.
  //
  // WHERE is the interesting half and it is deliberately conservative: at the army's rally point if
  // that ground is powered, and at a base otherwise. Warping ON TO the enemy is the aggressive use and
  // it needs a Warp Prism flown somewhere dangerous first, which is a piece of judgement this AI does
  // not have; reinforcing at the front is the honest version of the mechanic and is worth most of it.
  warpIn() {
    const p = this.p;
    const gates = this.mine(u => u.def.id === 'warp_gate' && u.done && !u.unpowered && u.cooldown <= 0);
    if (!gates.length) return;
    const foe = this.enemies()[0];
    const key = foe && AI_COMP[this.race + 'v' + foe.race] ? this.race + 'v' + foe.race : this.race;
    const counts = {};
    for (const u of G.units) if (u.alive && u.owner === p.id) { counts[u.def.id] = (counts[u.def.id] || 0) + 1; for (const it of u.prod) if (it.kind === 'unit') counts[it.id] = (counts[it.id] || 0) + 1; }
    let best = null, bs = 1e9;
    for (const [id, wgt] of this.styleComp(key, this.style)) {
      if (!wgt || !DATA.abilities['warp_' + id]) continue;
      const ud = DATA.units[id]; if (!p.hasReq(ud) || !this.afford(ud.min, ud.gas)) continue;
      const sup = ud.sup || 1; if (p.supUsed + sup > p.supMax) continue;
      const s = ((counts[id] || 0) * sup + sup) / wgt;
      if (s < bs) { bs = s; best = id; }
    }
    if (!best) return;
    const spot = this.warpSpot();
    if (spot) Abilities.issue(gates[0], 'warp_' + best, null, spot[0], spot[1]);
  }
  // A powered tile to warp on to. GameMap.findFreeTile already spirals outward and already refuses
  // anything unwalkable, so the psi test goes in as its predicate and the two rules the mechanic has
  // are asked in one query -- which matters, because Abilities.warpIn refuses rather than sliding, so
  // an unpowered guess is simply a wasted think.
  warpSpot() {
    const p = this.p, m = G.map, out = [];
    if (this.rally) out.push([this.rally.x, this.rally.y]);
    for (const h of this.halls()) if (h.done) out.push([h.x, h.y]);
    for (const [ax, ay] of out) {
      const t = m.findFreeTile(Math.floor(ax / TILE), Math.floor(ay / TILE), 10, (x, y) => m.hasPsi(p.id, x, y));
      if (t) return [(t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE];
    }
    return null;
  }
  micro() {
    const p = this.p;
    if (p.race === 'Z') this.zergCreep();
    if (p.race === 'P') this.protossMacro();
    // Terran: scan where our units are being hit by something we cannot see (burrowed lurkers, cloaked units)
    if (p.race === 'T' && this.turn(p.id, 4)) { const cs = this.mine(u => u.def.id === 'comsat_station' && u.done && u.energy >= 50)[0]; if (cs) { const hit = this.mine(u => !u.isBuilding && G.frame - u.lastHit < 24 && u.lastHitBy && u.lastHitBy.alive && u.lastHitBy.isCloaked && !G.detected(u.lastHitBy, p.id))[0];
      if (hit) Abilities.issue(cs, 'scanner_sweep', null, hit.lastHitBy.x, hit.lastHitBy.y);
      // A comsat parked at 200/200 is four scans thrown away, and it was the second largest pool of
      // unspent energy in the audit. Once the bar is nearly full the regeneration is wasted anyway, so
      // buy vision on what we are about to walk into.
      else if (cs.energy >= 180 && this.state === 'attack' && this.target && this.target.alive && !G.visibleAt(p.id, this.target.x, this.target.y)) Abilities.issue(cs, 'scanner_sweep', null, this.target.x, this.target.y); } }
    // M12 item 11: the Orbital Command spends its energy on MULEs.
    //
    // It is HERE and not in the per-unit loop below for a structural reason -- that loop skips
    // `u.isBuilding` -- and it is keyed on `this.turn(p.id, ...)` for the reason the comsat above is:
    // one cast per player per few ticks, not one per building per tick.
    //
    // WHERE it drops is the whole mechanic, so it is chosen rather than dumped at the caster: the
    // hall with the fewest workers already on it, which in practice is the newest expansion. A MULE on
    // a saturated main is worth a fraction of a MULE on a base with two SCVs, because Brood War caps a
    // patch at two miners and a third just queues (MINERS_PER_PATCH in js/sim.js).
    //
    // The 100-energy floor rather than 50 leaves headroom so an Orbital that also grew a Comsat can
    // still afford a scan; dropping at exactly 50 would starve the vision that keeps the army alive.
    if (p.race === 'T' && this.turn(p.id, 3)) {
      const oc = this.mine(u => u.def.id === 'orbital_command' && u.done && !u.lifted && u.energy >= 100)[0];
      if (oc) {
        let best = null, bw = 1e9;
        for (const h of this.halls()) {
          if (!h.done) continue;
          const near = this.mine(w => w.def.worker && !w.def.mule && distPt(w.x, w.y, h.x, h.y) < 12 * TILE).length;
          if (near < bw) { bw = near; best = h; }
        }
        if (best) {
          // Aim at a real patch near that hall rather than at the hall itself, so the MULE lands on the
          // mineral line instead of on the roof and does not spend a tenth of its life walking there.
          let px = best.x, py = best.y, bd = 1e9;
          for (const rr of G.map.resources) { if (rr.type !== 'mineral' || rr.amount <= 0) continue; const dd = distPt(rr.cx, rr.cy, best.x, best.y); if (dd < bd && dd < 12 * TILE) { bd = dd; px = rr.cx; py = rr.cy; } }
          Abilities.issue(oc, 'mule', null, px, py);
        }
      }
    }
    for (const u of G.units) {
      if (!u.alive || u.owner !== p.id || u.isBuilding || u.inside) continue;
      const d = u.def.id;
      if (d === 'siege_tank' && p.hasTech('siege_tech') && u.transT <= 0) { const near = G.near(u.x, u.y, 11 * TILE).some(o => o.owner !== p.id && !o.fly && o.alive && (o.hasWeapon() || o.isBuilding)); const veryNear = G.near(u.x, u.y, 2 * TILE).some(o => o.owner !== p.id && !o.fly && o.alive && o.hasWeapon()); if (near && !u.sieged && !veryNear && this.turn(u.id, 2)) Abilities.instant(u, 'siege_mode'); else if (u.sieged && !near && this.turn(u.id, 8)) Abilities.instant(u, 'siege_mode'); }
      // M12 wave four: BLINK, and it CLOSES rather than retreats. It sits ahead of the kite clause
      // below on purpose -- both are dragoon clauses in an else-if chain, and a dragoon that can be
      // shooting this second should not spend the tick shuffling.
      //
      // THE OBVIOUS TRIGGER IS UNREACHABLE IN THIS ENGINE AND WAS MEASURED BEFORE IT WAS ABANDONED.
      // "Blink out when you are losing the trade" is the use a human gets most from, and it was
      // written first, as `u.sh <= 0 && u.hp < u.maxHp * 0.5`. Two things are wrong with it. Unit.tick
      // regenerates 0.045 shields EVERY frame, so `sh <= 0` is true on roughly the one frame shields
      // break and micro only looks once in twelve. And the honest version -- combined bar under 40%,
      // hit within the last second -- fires no more often: instrumented over four AI games and 82,701
      // dragoon micro-ticks after Blink finished researching, "hurt" happened 0 times and "hit in the
      // last second" happened 4. Fights here are decisive and units are healthy or dead. That is the
      // same finding HANDOFF.md records for army retreats ("0 retreats in 12 games"), and a clause
      // that provably never fires is the M9 failure this milestone exists not to repeat.
      //
      // So the trigger is the one that actually happens: an attacking dragoon whose target is past its
      // gun but inside a blink hops the gap and starts shooting. Aimed to just inside its own range
      // rather than on top of the target, and gated on two friends nearby -- a dragoon that blinks
      // into a line alone is a dragoon donated, and the gate is what keeps this a group manoeuvre.
      else if (d === 'dragoon' && p.hasTech('blink') && this.state === 'attack' && this.turn(u.id, 2)
               && (u.order.type === 'attack' || u.order.type === 'attackmove') && u.order.target && u.order.target.alive && !u.order.target.fly
               && G.frame - (typeof u.blinkAt === 'number' ? u.blinkAt : -1e9) >= DATA.abilities.blink.cd) {
        const t = u.order.target, gap = distPt(u.x, u.y, t.x, t.y) / TILE, reach = u.maxRange();
        if (gap > reach + 1.5 && gap < DATA.abilities.blink.range
            && this.mine(o => o !== u && !o.isBuilding && o.hasWeapon() && distPt(o.x, o.y, u.x, u.y) < 6 * TILE).length >= 2) {
          const a = Math.atan2(t.y - u.y, t.x - u.x), hop = (gap - reach * 0.8) * TILE;
          Abilities.issue(u, 'blink', null, u.x + Math.cos(a) * hop, u.y + Math.sin(a) * hop);
        }
      }
      else if ((d === 'vulture' || d === 'mutalisk' || d === 'dragoon') && u.order.type === 'attack' && this.turn(u.id, 1)) this.kite(u);
      // Stim: the marauder and the reaper are bio and carry it, so they use it. The hp floor is raised
      // for them in proportion to what stim costs -- a flat 10 hp off a 60-hp reaper is a sixth of it.
      else if ((d === 'marine' || d === 'firebat' || d === 'marauder' || d === 'reaper') && p.hasTech('stim') && u.stim <= 0 && u.hp > (d === 'reaper' ? 30 : 25) && u.order.type === 'attack' && u.order.target && dist(u, u.order.target) < 6 * TILE) Abilities.instant(u, 'stim');
      else if (d === 'lurker' && u.transT <= 0) { const near = G.near(u.x, u.y, 7 * TILE).some(o => o.owner !== p.id && !o.fly && o.alive && !o.def.larva); if (near && !u.burrowed && this.turn(u.id, 1)) Abilities.instant(u, 'burrow'); else if (u.burrowed && !near && this.turn(u.id, 6) && this.state !== 'gather') Abilities.instant(u, 'burrow'); }
      // ---- M12 wave four ---------------------------------------------------------------------------
      // A Widow Mine buried is a weapon and a Widow Mine walking is a 90-hit-point paperweight -- its
      // gun is `burrowOnly`, so Unit.weaponFor hands it nothing at all while it is up. Same shape as
      // the Lurker clause directly above, with one difference that matters: the mine hits AIR too, so
      // the "is there anything here" test must not filter on `!o.fly` the way the Lurker's does.
      else if (d === 'widow_mine' && u.transT <= 0) {
        const near = G.near(u.x, u.y, 6 * TILE).some(o => o.owner !== p.id && o.alive && !o.def.larva && !o.isBuilding);
        if (near && !u.burrowed && this.turn(u.id, 1)) Abilities.instant(u, 'burrow');
        else if (u.burrowed && !near && this.turn(u.id, 8) && this.state !== 'gather') Abilities.instant(u, 'burrow');
      }
      // The Viking picks a sky. Fighter mode can only shoot air and assault mode can only shoot ground,
      // so a wing that never transforms is half a unit whichever half it is -- this is the line that
      // makes `viking_a` reachable at all for a computer opponent, since nothing trains it.
      //
      // Air wins ties on purpose. Landing takes 40 frames of transT and there is no way back inside
      // that window, so a Viking that folds up in front of a mutalisk flock is dead; one that stays up
      // while there is anything flying has merely not helped yet.
      else if (d === 'viking' && u.transT <= 0 && this.turn(u.id, 4)) {
        const air = G.near(u.x, u.y, 12 * TILE).some(o => o.owner !== p.id && o.alive && o.fly && !o.def.larva);
        const ground = G.near(u.x, u.y, 8 * TILE).some(o => o.owner !== p.id && o.alive && !o.fly && (o.hasWeapon() || o.isBuilding));
        if (!air && ground) Abilities.instant(u, 'viking_mode');
      }
      else if (d === 'viking_a' && u.transT <= 0 && this.turn(u.id, 2)) {
        const air = G.near(u.x, u.y, 14 * TILE).some(o => o.owner !== p.id && o.alive && o.fly && !o.def.larva);
        if (air) Abilities.instant(u, 'viking_mode');
      }
      // The Raven blinds a defended position. The cluster test is the enemy's, not ours: what the field
      // is worth is proportional to how many of their eyes are inside it, and dropping it on our own
      // army would blind nothing (Abilities.tickFields skips anyone allied with the owner).
      else if (d === 'raven' && u.energy >= 75 && this.turn(u.id, 2)) {
        const c = this.cluster(u, 9, 3, o => o.owner !== p.id && !o.def.larva);
        if (c && !Abilities.inField(c.x, c.y, 'jam')) Abilities.issue(u, 'jam_field', null, c.x, c.y);
      }
      // The Banshee cloaks for the same reason and off the same research as the Wraith. It is a
      // separate clause rather than an extra `||` on the wraith one below because the wraith clause is
      // far down the else-if chain, behind several that a banshee would never match anyway.
      else if (d === 'banshee' && !u.cloaked && u.energy >= 50 && p.hasTech('cloaking_field') && this.turn(u.id, 4) && G.near(u.x, u.y, 8 * TILE).some(o => o.owner !== p.id && o.hasWeapon())) Abilities.instant(u, 'cloak_wraith');
      else if (d === 'high_templar' && u.energy >= 75 && p.hasTech('psi_storm_tech') && this.turn(u.id, 1)) { const c = this.cluster(u, 9, 3, o => o.owner !== p.id && !o.isBuilding); if (c) Abilities.issue(u, 'psi_storm', null, c.x, c.y); }
      // Dark Swarm is as much a defensive spell as an offensive one, and the cluster test below already
      // says "our ground units are being shot at". Gating it on the army being on the attack meant the
      // Zerg AI, which spends most of a losing game in `defend`, never cast it when it needed it most.
      else if (d === 'defiler' && u.energy >= 100 && this.turn(u.id, 1)) { const c = this.cluster(u, 9, 3, o => o.owner === p.id && !o.fly && !o.isBuilding && o.hasWeapon() && G.frame - o.lastHit < 48); if (c && !Abilities.inField(c.x, c.y, 'swarm')) Abilities.issue(u, 'dark_swarm', null, c.x, c.y); else if (p.hasTech('plague_tech') && u.energy >= 150) { const e = this.cluster(u, 9, 4, o => o.owner !== p.id); if (e) Abilities.issue(u, 'plague', null, e.x, e.y); } }
      else if (d === 'science_vessel' && u.energy >= 75 && p.hasTech('irradiate_tech') && this.turn(u.id, 2)) { const t = G.near(u.x, u.y, 9 * TILE).find(o => o.owner !== p.id && o.def.bio && !o.isBuilding && !o.fx.irradiate && o.maxHp >= 80); if (t) Abilities.issue(u, 'irradiate', t); }
      // M12 item 11. FIRST among the Queen's clauses, because inject is what a Queen is for: it is the
      // only ability in the game that produces anything, and at 25 energy against Spawn Broodling's
      // 150 it almost never costs a cast that would otherwise have happened. Offered only on a hall
      // with room for larvae and no inject already in flight, so a saturated hatchery falls straight
      // through to the clauses below instead of eating the energy for nothing.
      // It is tested in the condition AND used in the body on purpose: this is an else-if chain, so a
      // clause that matches on `d === 'queen'` and then finds nothing to do would swallow the Queen's
      // three older clauses for that tick.
      else if (d === 'queen' && u.energy >= DATA.abilities.larva_inject.energy && this.turn(u.id, 2) && this.injectHall(u)) Abilities.issue(u, 'larva_inject', this.injectHall(u));
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
        const hurt = this.mine(o => o !== u && o.hp < o.maxHp * 0.85 && repairableDef(o.def) && distPt(o.x, o.y, u.x, u.y) < 12 * TILE)[0];
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
      // ---- M12 wave four: the seven Zerg additions with something to press --------------------
      // An idle Overlord is a supply crate that happens to fly. Planting from one is how the tumour
      // chain STARTS -- a tumour can only be seeded on creep, so something has to walk to the edge of
      // it first, and the overlord is the only Zerg unit that is already everywhere and already idle.
      // Capped at eight tumours and gated on 100 spare minerals so creep never competes with an army.
      else if (d === 'overlord' && u.order.type === 'idle' && this.turn(u.id, 8) && this.tumourBudget()) {
        const s = this.creepEdge(u.x, u.y, DATA.abilities.plant_tumour.range);
        if (s) Abilities.issue(u, 'plant_tumour', null, s[0], s[1]);
      }
      // A Baneling is worth its gas the moment it is standing in three of something, or touching a
      // building -- its blast is doubled against structures, and popping one on a bunker or a wall is
      // the job. Both tests are "is it worth the unit", which is the decision the ability exists for.
      else if (d === 'baneling' && this.turn(u.id, 1)) {
        const ab = DATA.abilities.volatile_burst;
        let n = 0, bld = false;
        for (const o of G.near(u.x, u.y, ab.r * TILE)) { if (!o.alive || o.fly || G.allied(o.owner, p.id)) continue; if (o.isBuilding) { if (o.done) bld = true; } else if (o.hasWeapon() || o.def.worker) n++; }
        if (n >= 3 || (bld && n === 0 && this.state === 'attack')) Abilities.instant(u, 'volatile_burst');
      }
      // Bile at what cannot walk out of it: a sieged tank, a lurker, a bunker, a colony, a wall. The
      // delay is the whole balance of the ability and firing it at moving infantry throws it away.
      else if (d === 'ravager' && u.energy >= DATA.abilities.corrosive_bile.energy && this.turn(u.id, 2)) {
        const r = DATA.abilities.corrosive_bile.range * TILE;
        const t = G.near(u.x, u.y, r).find(o => o.alive && !G.allied(o.owner, p.id) && !o.fly
          && ((o.isBuilding && o.done && (o.def.gw || o.def.aw || o.def.wall)) || o.sieged || o.burrowed));
        if (t) Abilities.issue(u, 'corrosive_bile', null, t.x, t.y);
      }
      // Locusts expire whether or not they were used, so spend the energy the moment there is anything
      // to spend it on rather than banking it for a better moment that never arrives.
      else if (d === 'swarm_host' && u.energy >= DATA.abilities.spawn_locusts.energy && this.turn(u.id, 2)
               && G.near(u.x, u.y, 14 * TILE).some(o => o.alive && !G.allied(o.owner, p.id) && (o.isBuilding ? o.done : o.hasWeapon()))) Abilities.instant(u, 'spawn_locusts');
      // Fungal first, infested second, and the order is the point: the cloud is worth more than the
      // bodies, and 100 energy spent on infested terrans is a fungal that did not happen.
      else if (d === 'infestor' && this.turn(u.id, 1)) {
        if (u.energy >= DATA.abilities.fungal_growth.energy) { const c = this.cluster(u, 9, 3, o => !G.allied(o.owner, p.id) && !o.isBuilding && !o.fly); if (c && !Abilities.inField(c.x, c.y, 'fungal')) { Abilities.issue(u, 'fungal_growth', null, c.x, c.y); continue; } }
        if (u.energy >= DATA.abilities.spawn_infested.energy && p.hasTech('pathogen_glands') && this.state === 'attack' && this.target && this.target.alive
            && distPt(u.x, u.y, this.target.x, this.target.y) < DATA.abilities.spawn_infested.range * TILE) Abilities.issue(u, 'spawn_infested', null, this.target.x, this.target.y);
      }
      // Pull the most expensive thing in reach. Preferring supply cost rather than hit points is what
      // makes it take the siege tank and the high templar instead of the nearest marine.
      else if (d === 'viper' && u.energy >= DATA.abilities.abduct.energy && this.turn(u.id, 2)) {
        let best = null, bs = 2;
        for (const o of G.near(u.x, u.y, DATA.abilities.abduct.range * TILE)) { if (!o.alive || G.allied(o.owner, p.id) || o.isBuilding || o.def.worker || o.def.larva || o.def.egg || o.def.notUnit) continue; const s = (o.def.sup || 0) + (o.sieged || o.maxEnergy ? 2 : 0); if (s > bs) { bs = s; best = o; } }
        if (best) Abilities.issue(u, 'abduct', best);
      }
      // A Viper short of energy eats a building rather than waiting. Only a big, healthy one, so it
      // never finishes off a structure that was already in trouble -- and only a Zerg one regenerates
      // the hundred hit points back, which is why this is a Zerg ability and not a general one.
      else if (d === 'viper' && this.turn(u.id, 4)) {
        const b = this.mine(o => o.isBuilding && o.done && o.hp - 100 > o.maxHp * 0.6 && o.hp > 400 && distPt(o.x, o.y, u.x, u.y) < 9 * TILE)[0];
        if (b) Abilities.issue(u, 'consume_essence', b);
      }
      // Contaminate what MAKES things, not what shoots them: turning off a factory for thirty seconds
      // is worth more than turning off a turret, and it is the only reason to fly an Overseer into a
      // base rather than over it.
      else if (d === 'overseer' && u.energy >= DATA.abilities.contaminate.energy && this.turn(u.id, 4)) {
        const t = G.near(u.x, u.y, DATA.abilities.contaminate.range * TILE).find(o => o.alive && !G.allied(o.owner, p.id) && o.isBuilding && o.done
          && (o.def.produces.length || o.def.spawnsLarva || (o.def.tech || []).length) && !(o.fx.maelstrom > 0));
        if (t) Abilities.issue(u, 'contaminate', t);
      }
      // ---- M12 wave four: the five Protoss casters with something to press ---------------------
      // THE SENTRY, and the order of its two spells is the design. Guardian Shield is cheaper, cannot
      // miss and wants exactly the moment a fight starts, so it is offered first and the Force Field
      // only gets the tick when there is nothing to shield. Both clauses are inside ONE `d === 'sentry'`
      // arm rather than two, because this is an else-if chain: a second sentry arm further down would
      // never be reached, which is the mistake the Queen's inject clause documents further up.
      //
      // The shield's test is the defiler's -- "our ground units are being shot at" -- and not "we are
      // attacking, because a bubble is worth as much defending a ramp as it is walking up one.
      else if (d === 'sentry' && this.turn(u.id, 1)) {
        const gs = DATA.abilities.guardian_shield, ff = DATA.abilities.force_field;
        if (u.energy >= gs.energy && !u.fx.matrix
            && this.cluster(u, gs.r, 3, o => o.owner === p.id && !o.isBuilding && o.hasWeapon() && G.frame - o.lastHit < 48)) Abilities.instant(u, 'guardian_shield');
        else if (u.energy >= ff.energy) {
          // A wall in front of the enemy's GROUND army only: a force field costs 50 energy and does
          // nothing whatever to something flying, and the AI has no way to tell "this splits their
          // army" from "this walls off my own zealots", so it is put where the enemy is thickest and
          // left at that.
          const c = this.cluster(u, ff.range, 3, o => !G.allied(o.owner, p.id) && !o.isBuilding && !o.fly && o.hasWeapon());
          if (c && !Abilities.inField(c.x, c.y, 'force_field')) Abilities.issue(u, 'force_field', null, c.x, c.y);
        }
      }
      // Lift the most expensive thing in reach, which is the Viper's abduct rule with the sign
      // flipped: supply cost plus a bonus for anything sieged or with an energy bar, so a Phoenix
      // takes a siege tank or a high templar out of the fight rather than the nearest marine.
      else if (d === 'phoenix' && u.energy >= DATA.abilities.graviton_beam.energy && this.turn(u.id, 2)) {
        const ab = DATA.abilities.graviton_beam;
        let best = null, bs = 2;
        for (const o of G.near(u.x, u.y, ab.range * TILE)) {
          if (!o.alive || G.allied(o.owner, p.id) || o.fly || o.isBuilding || o.def.worker || o.def.larva || o.def.egg || o.def.notUnit || o.fx.maelstrom > 0) continue;
          const s = (o.def.sup || 0) + (o.sieged || o.maxEnergy ? 2 : 0); if (s > bs) { bs = s; best = o; }
        }
        if (best) Abilities.issue(u, 'graviton_beam', best);
      }
      // Revelation buys vision on what the army is about to walk into, which is the Comsat's second
      // clause with a ship instead of an add-on. Only when the target cannot already be seen: a scan
      // on ground you are looking at is 50 energy for nothing.
      else if (d === 'oracle' && u.energy >= DATA.abilities.revelation.energy && this.turn(u.id, 4)
               && this.state === 'attack' && this.target && this.target.alive && !G.visibleAt(p.id, this.target.x, this.target.y)) {
        Abilities.issue(u, 'revelation', null, this.target.x, this.target.y);
      }
      // The nova is a fuse that hits our own army too, so it goes where the ENEMY is thickest and the
      // AI accepts the friendly fire -- exactly the deal the high templar's psi storm clause makes.
      // `inField` stops two disruptors arming the same patch of ground twice.
      else if (d === 'disruptor' && u.energy >= DATA.abilities.purification_nova.energy && this.turn(u.id, 2)) {
        const ab = DATA.abilities.purification_nova;
        const c = this.cluster(u, ab.range, 3, o => !G.allied(o.owner, p.id) && !o.isBuilding && !o.fly);
        if (c && !Abilities.inField(c.x, c.y, 'nova')) Abilities.issue(u, 'purification_nova', null, c.x, c.y);
      }
      // Time Warp on the thickest enemy ground: it is the Mothership's only spell, it costs 100 of the
      // 200 it can hold, and there is nothing else to save the energy for.
      else if (d === 'mothership' && u.energy >= DATA.abilities.time_warp.energy && this.turn(u.id, 2)) {
        const ab = DATA.abilities.time_warp;
        const c = this.cluster(u, ab.range, 3, o => !G.allied(o.owner, p.id) && !o.isBuilding && !o.fly);
        if (c && !Abilities.inField(c.x, c.y, 'time_warp')) Abilities.issue(u, 'time_warp', null, c.x, c.y);
      }
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
    const dT = this.sty().dropT || 1; // a drop is harassment by definition, so the harasser starts them earlier and runs twice as many
    if (this.state !== 'gather' || G.frame < 24 * 60 * 6 * dT || G.frame - this.lastDrop < 24 * 180 * dT || !this.rally) return;
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
