'use strict';
// ============================================================================
// Brood War data tables. Times are in game frames (24/s = "Fastest").
// Distances: ranges/sight in tiles (32px). Speeds in px/frame.
// ============================================================================
const TILE = 32;
const TPS = 24;

const DMG_MULT = {
  normal:     { small: 1,   medium: 1,    large: 1 },
  concussive: { small: 1,   medium: 0.5,  large: 0.25 },
  explosive:  { small: 0.5, medium: 0.75, large: 1 },
  ignore:     { small: 1,   medium: 1,    large: 1 },
};

const DATA = (() => {
  const units = {}, buildings = {}, upgrades = {}, techs = {}, abilities = {};
  const U = (id, o) => { o.id = id; o.kind = 'unit'; if (o.sup === undefined) o.sup = 0; if (o.armor === undefined) o.armor = 0; if (o.sh === undefined) o.sh = 0; if (!o.r) o.r = 10; if (o.gas === undefined) o.gas = 0; units[id] = o; };
  const B = (id, o) => { o.id = id; o.kind = 'building'; o.isBuilding = true; o.size = 'large'; if (o.armor === undefined) o.armor = 1; if (o.sh === undefined) o.sh = 0; if (o.gas === undefined) o.gas = 0; if (!o.sight) o.sight = 8; if (!o.produces) o.produces = []; if (!o.upg) o.upg = []; if (!o.tech) o.tech = []; if (!o.addons) o.addons = []; buildings[id] = o; };
  const W = (dmg, type, range, cd, o = {}) => Object.assign({ dmg, type, range, cd, hits: 1, upgDmg: 1, targets: 'ground' }, o);
  const UP = (id, o) => { o.id = id; upgrades[id] = o; };
  const TE = (id, o) => { o.id = id; techs[id] = o; };
  const AB = (id, o) => { o.id = id; abilities[id] = o; };

  // ============================ TERRAN UNITS ============================
  U('scv', { name: 'SCV', race: 'T', hp: 60, size: 'small', min: 50, sup: 1, time: 300, speed: 4.92, sight: 7, r: 9, hk: 'S', from: 'command_center', worker: true, mech: true, bio: true, cargoSize: 1,
    gw: W(5, 'normal', 0.4, 15, { upgKey: null }), abil: ['repair', 'gather', 'build_basic', 'build_adv'] });
  U('marine', { name: 'Marine', race: 'T', hp: 40, size: 'small', min: 50, sup: 1, time: 360, speed: 4, sight: 7, r: 8, hk: 'M', from: 'barracks', bio: true, cargoSize: 1,
    gw: W(6, 'normal', 4, 15, { upgKey: 'infW', targets: 'both' }), abil: ['stim'], upgA: 'infA' });
  U('firebat', { name: 'Firebat', race: 'T', hp: 50, armor: 1, size: 'small', min: 50, gas: 25, sup: 1, time: 360, speed: 4, sight: 7, r: 8, hk: 'F', from: 'barracks', req: ['academy'], bio: true, cargoSize: 1,
    gw: W(8, 'concussive', 1, 22, { hits: 2, upgKey: 'infW', splash: [0.5, 0.75, 1] }), abil: ['stim'], upgA: 'infA' });
  U('medic', { name: 'Medic', race: 'T', hp: 60, armor: 1, size: 'small', min: 50, gas: 25, sup: 1, time: 450, speed: 4, sight: 9, r: 8, hk: 'C', from: 'barracks', req: ['academy'], bio: true, cargoSize: 1, energy: 200,
    abil: ['heal', 'restoration', 'optical_flare'], upgA: 'infA' });
  U('ghost', { name: 'Ghost', race: 'T', hp: 45, size: 'small', min: 25, gas: 75, sup: 1, time: 750, speed: 4, sight: 9, r: 8, hk: 'G', from: 'barracks', req: ['academy', 'covert_ops'], bio: true, cargoSize: 1, energy: 200,
    gw: W(10, 'concussive', 7, 22, { upgKey: 'infW', targets: 'both' }), abil: ['lockdown', 'cloak_ghost', 'nuke'], upgA: 'infA' });
  U('vulture', { name: 'Vulture', race: 'T', hp: 80, size: 'medium', min: 75, sup: 2, time: 450, speed: 6.4, sight: 8, r: 12, hk: 'V', from: 'factory', mech: true, cargoSize: 2, hover: true,
    gw: W(20, 'concussive', 5, 30, { upgKey: 'vehW', upgDmg: 2 }), abil: ['spider_mine'], upgA: 'vehA', mines: 3 });
  U('siege_tank', { name: 'Siege Tank', race: 'T', hp: 150, armor: 1, size: 'large', min: 150, gas: 100, sup: 2, time: 750, speed: 4, sight: 10, r: 16, hk: 'T', from: 'factory', req: ['machine_shop'], mech: true, cargoSize: 4,
    gw: W(30, 'explosive', 7, 37, { upgKey: 'vehW', upgDmg: 3 }), abil: ['siege_mode'], upgA: 'vehA' });
  U('goliath', { name: 'Goliath', race: 'T', hp: 125, armor: 1, size: 'large', min: 100, gas: 50, sup: 2, time: 600, speed: 4.57, sight: 8, r: 14, hk: 'G', from: 'factory', req: ['armory'], mech: true, cargoSize: 2,
    gw: W(12, 'normal', 5, 22, { upgKey: 'vehW', upgDmg: 2 }), aw: W(10, 'explosive', 5, 22, { hits: 2, upgKey: 'vehW', upgDmg: 2, targets: 'air', rangeTech: ['charon', 3] }), upgA: 'vehA' });
  U('wraith', { name: 'Wraith', race: 'T', hp: 120, size: 'large', min: 150, gas: 100, sup: 2, time: 900, speed: 6.67, sight: 7, r: 14, hk: 'W', from: 'starport', mech: true, fly: true, energy: 200,
    gw: W(8, 'normal', 5, 30, { upgKey: 'shipW' }), aw: W(20, 'explosive', 5, 22, { upgKey: 'shipW', upgDmg: 2, targets: 'air' }), abil: ['cloak_wraith'], upgA: 'shipA' });
  U('dropship', { name: 'Dropship', race: 'T', hp: 150, armor: 1, size: 'large', min: 100, gas: 100, sup: 2, time: 750, speed: 5.47, sight: 8, r: 16, hk: 'D', from: 'starport', req: ['control_tower'], mech: true, fly: true, cargo: 8,
    abil: ['unload'], upgA: 'shipA' });
  U('science_vessel', { name: 'Science Vessel', race: 'T', hp: 200, armor: 1, size: 'large', min: 100, gas: 225, sup: 2, time: 1200, speed: 5, sight: 10, r: 18, hk: 'V', from: 'starport', req: ['control_tower', 'science_facility'], mech: true, fly: true, det: true, energy: 200,
    abil: ['defensive_matrix', 'emp', 'irradiate'], upgA: 'shipA' });
  U('battlecruiser', { name: 'Battlecruiser', race: 'T', hp: 500, armor: 3, size: 'large', min: 400, gas: 300, sup: 6, time: 2000, speed: 2.5, sight: 11, r: 22, hk: 'B', from: 'starport', req: ['control_tower', 'physics_lab'], mech: true, fly: true, energy: 200,
    gw: W(25, 'normal', 6, 30, { upgKey: 'shipW', upgDmg: 3, targets: 'both' }), abil: ['yamato'], upgA: 'shipA' });
  U('valkyrie', { name: 'Valkyrie', race: 'T', hp: 200, armor: 2, size: 'large', min: 250, gas: 125, sup: 3, time: 750, speed: 6.6, sight: 8, r: 16, hk: 'Y', from: 'starport', req: ['control_tower', 'armory'], mech: true, fly: true,
    aw: W(6, 'explosive', 6, 64, { hits: 8, upgKey: 'shipW', targets: 'air', splash: [0.5, 1, 1.5] }), upgA: 'shipA' });
  U('spider_mine', { name: 'Spider Mine', race: 'T', hp: 20, size: 'small', speed: 16, sight: 3, r: 6, mech: true, noSelectInfo: true, mine: true, burrowed: true, cloaked: true,
    gw: W(125, 'explosive', 0.5, 1, { splash: [1.5, 1.5, 1.5], suicide: true, upgKey: null }) });
  U('nuke', { name: 'Nuclear Missile', race: 'T', hp: 100, size: 'large', min: 200, gas: 200, sup: 8, time: 1800, hk: 'N', from: 'nuclear_silo', r: 8, notUnit: true, sight: 0 });

  // ============================ ZERG UNITS ============================
  U('larva', { name: 'Larva', race: 'Z', hp: 25, armor: 10, size: 'small', speed: 0.3, sight: 4, r: 6, bio: true, larva: true, abil: ['morph_menu'] });
  U('egg', { name: 'Egg', race: 'Z', hp: 200, armor: 10, size: 'medium', speed: 0, sight: 4, r: 10, bio: true, egg: true });
  U('lurker_egg', { name: 'Lurker Egg', race: 'Z', hp: 200, armor: 10, size: 'medium', speed: 0, sight: 4, r: 12, bio: true, egg: true });
  U('cocoon', { name: 'Cocoon', race: 'Z', hp: 200, armor: 10, size: 'medium', speed: 0, sight: 4, r: 12, bio: true, egg: true, fly: true });
  U('drone', { name: 'Drone', race: 'Z', hp: 40, size: 'small', min: 50, sup: 1, time: 300, speed: 4.92, sight: 7, r: 9, hk: 'D', from: 'larva', worker: true, bio: true, cargoSize: 1,
    gw: W(5, 'normal', 0.4, 22, { upgKey: null }), abil: ['gather', 'build_basic', 'build_adv', 'burrow'], upgA: 'carapace' });
  U('overlord', { name: 'Overlord', race: 'Z', hp: 200, size: 'large', min: 100, sup: 0, supGive: 8, time: 600, speed: 0.83, sight: 9, r: 18, hk: 'O', from: 'larva', bio: true, fly: true, det: true,
    abil: ['unload'], upgA: 'flyA', speedTech: ['pneumatized', 2.5], cargoTech: 'ventral_sacs', sightTech: ['antennae', 11] });
  U('zergling', { name: 'Zergling', race: 'Z', hp: 35, size: 'small', min: 50, sup: 0.5, time: 420, speed: 5.49, sight: 5, r: 7, hk: 'Z', from: 'larva', req: ['spawning_pool'], bio: true, cargoSize: 1, pair: true,
    gw: W(5, 'normal', 0.5, 8, { upgKey: 'meleeW', cdTech: ['adrenal', 6] }), abil: ['burrow'], upgA: 'carapace', speedTech: ['metabolic', 6.58] });   // Brood War's own pair: 5.49 base, 6.58 boosted. The table had 2.61/5.49 -- the boosted value was BW's base, and the base was invented under it, leaving a zergling slower than a high templar.
  U('hydralisk', { name: 'Hydralisk', race: 'Z', hp: 80, size: 'medium', min: 75, gas: 25, sup: 1, time: 420, speed: 3.66, sight: 6, r: 10, hk: 'H', from: 'larva', req: ['hydralisk_den'], bio: true, cargoSize: 2,
    gw: W(10, 'explosive', 4, 15, { upgKey: 'missW', targets: 'both', rangeTech: ['grooved', 5] }), abil: ['burrow', 'lurker_aspect'], upgA: 'carapace', speedTech: ['muscular', 5.0] });
  U('lurker', { name: 'Lurker', race: 'Z', hp: 125, armor: 1, size: 'medium', min: 50, gas: 100, sup: 2, time: 600, speed: 5.82, sight: 8, r: 12, from: 'hydralisk', req: ['lurker_aspect'], bio: true, cargoSize: 2, morphFrom: 'hydralisk', hk: 'L',
    gw: W(20, 'normal', 6, 37, { upgKey: 'missW', upgDmg: 2, line: true, burrowOnly: true }), abil: ['burrow'], upgA: 'carapace' });
  U('mutalisk', { name: 'Mutalisk', race: 'Z', hp: 120, size: 'medium', min: 100, gas: 100, sup: 2, time: 600, speed: 6.67, sight: 7, r: 12, hk: 'M', from: 'larva', req: ['spire'], bio: true, fly: true,
    gw: W(9, 'normal', 3, 30, { upgKey: 'flyW', targets: 'both', glaive: true }), abil: ['guardian_aspect', 'devourer_aspect'], upgA: 'flyA' });
  U('scourge', { name: 'Scourge', race: 'Z', hp: 25, size: 'small', min: 25, gas: 75, sup: 0.5, time: 450, speed: 6.67, sight: 5, r: 8, hk: 'S', from: 'larva', req: ['spire'], bio: true, fly: true, pair: true,
    aw: W(110, 'normal', 0.3, 1, { targets: 'air', suicide: true, upgKey: null }), upgA: 'flyA' });
  U('queen', { name: 'Queen', race: 'Z', hp: 120, size: 'medium', min: 100, gas: 100, sup: 2, time: 750, speed: 6.67, sight: 10, r: 14, hk: 'Q', from: 'larva', req: ['queens_nest'], bio: true, fly: true, energy: 200,
    abil: ['parasite', 'ensnare', 'spawn_broodling', 'infest'], upgA: 'flyA' });
  U('guardian', { name: 'Guardian', race: 'Z', hp: 150, armor: 2, size: 'large', min: 50, gas: 100, sup: 2, time: 600, speed: 2.5, sight: 11, r: 16, from: 'mutalisk', req: ['greater_spire'], bio: true, fly: true, morphFrom: 'mutalisk', hk: 'G',
    gw: W(20, 'normal', 8, 30, { upgKey: 'flyW', upgDmg: 2 }), upgA: 'flyA' });
  U('devourer', { name: 'Devourer', race: 'Z', hp: 250, armor: 2, size: 'large', min: 150, gas: 50, sup: 2, time: 600, speed: 5, sight: 10, r: 16, from: 'mutalisk', req: ['greater_spire'], bio: true, fly: true, morphFrom: 'mutalisk', hk: 'V',
    aw: W(25, 'explosive', 6, 100, { upgKey: 'flyW', upgDmg: 2, targets: 'air', acidSpores: true }), upgA: 'flyA' });
  U('ultralisk', { name: 'Ultralisk', race: 'Z', hp: 400, armor: 1, size: 'large', min: 200, gas: 200, sup: 4, time: 900, speed: 5.12, sight: 7, r: 20, hk: 'U', from: 'larva', req: ['ultralisk_cavern'], bio: true, cargoSize: 4,
    gw: W(20, 'normal', 0.6, 15, { upgKey: 'meleeW', upgDmg: 3 }), upgA: 'carapace', speedTech: ['anabolic', 6.5], armorTech: ['chitinous', 2] });
  U('defiler', { name: 'Defiler', race: 'Z', hp: 80, armor: 1, size: 'medium', min: 50, gas: 150, sup: 2, time: 750, speed: 4, sight: 10, r: 12, hk: 'F', from: 'larva', req: ['defiler_mound'], bio: true, cargoSize: 2, energy: 200,
    abil: ['dark_swarm', 'plague', 'consume', 'burrow'], upgA: 'carapace' });
  U('broodling', { name: 'Broodling', race: 'Z', hp: 30, size: 'small', speed: 6, sight: 5, r: 6, bio: true, lifetime: 1800,
    gw: W(4, 'normal', 0.4, 15, { upgKey: 'meleeW' }), upgA: 'carapace' });
  U('infested_terran', { name: 'Infested Terran', race: 'Z', hp: 60, size: 'small', min: 100, gas: 50, sup: 1, time: 600, speed: 4, sight: 5, r: 8, hk: 'I', from: 'infested_command_center', bio: true, cargoSize: 1,
    gw: W(500, 'explosive', 0.3, 1, { suicide: true, splash: [1, 1.5, 2], upgKey: null }), abil: ['burrow'], upgA: 'carapace' });

  // ============================ PROTOSS UNITS ============================
  U('probe', { name: 'Probe', race: 'P', hp: 20, sh: 20, size: 'small', min: 50, sup: 1, time: 300, speed: 4.92, sight: 8, r: 8, hk: 'P', from: 'nexus', worker: true, mech: true, cargoSize: 1,
    gw: W(5, 'normal', 0.4, 22, { upgKey: null }), abil: ['gather', 'build_basic', 'build_adv'], upgA: 'gA' });
  U('zealot', { name: 'Zealot', race: 'P', hp: 100, sh: 60, armor: 1, size: 'small', min: 100, sup: 2, time: 600, speed: 4, sight: 7, r: 9, hk: 'Z', from: 'gateway', bio: true, cargoSize: 2,
    gw: W(8, 'normal', 0.4, 22, { hits: 2, upgKey: 'gW' }), upgA: 'gA', speedTech: ['leg_enhancements', 6.4] });
  U('dragoon', { name: 'Dragoon', race: 'P', hp: 100, sh: 80, armor: 1, size: 'large', min: 125, gas: 50, sup: 2, time: 750, speed: 5, sight: 8, r: 14, hk: 'D', from: 'gateway', req: ['cybernetics_core'], mech: true, cargoSize: 4,
    gw: W(20, 'explosive', 4, 30, { upgKey: 'gW', upgDmg: 2, targets: 'both', rangeTech: ['singularity', 6] }), upgA: 'gA' });
  U('high_templar', { name: 'High Templar', race: 'P', hp: 40, sh: 40, size: 'small', min: 50, gas: 150, sup: 2, time: 750, speed: 3.2, sight: 7, r: 8, hk: 'T', from: 'gateway', req: ['templar_archives'], bio: true, cargoSize: 2, energy: 200,
    abil: ['psi_storm', 'hallucination', 'summon_archon'], upgA: 'gA' });
  U('dark_templar', { name: 'Dark Templar', race: 'P', hp: 80, sh: 40, armor: 1, size: 'small', min: 125, gas: 100, sup: 2, time: 750, speed: 4.92, sight: 7, r: 8, hk: 'K', from: 'gateway', req: ['templar_archives'], bio: true, cargoSize: 2, cloaked: true, permaCloak: true,
    gw: W(40, 'normal', 0.4, 30, { upgKey: 'gW', upgDmg: 3 }), abil: ['summon_dark_archon'], upgA: 'gA' });
  U('archon', { name: 'Archon', race: 'P', hp: 10, sh: 350, size: 'large', sup: 4, time: 300, speed: 4.92, sight: 8, r: 16, bio: true, cargoSize: 4, name2: 'Archon',
    gw: W(30, 'normal', 2, 20, { upgKey: 'gW', upgDmg: 3, targets: 'both', splash: [0.5, 1, 1.5] }), upgA: 'gA' });
  U('dark_archon', { name: 'Dark Archon', race: 'P', hp: 25, sh: 200, armor: 1, size: 'large', sup: 4, time: 300, speed: 4.92, sight: 10, r: 16, bio: true, cargoSize: 4, energy: 200,
    abil: ['feedback', 'mind_control', 'maelstrom'], upgA: 'gA' });
  U('reaver', { name: 'Reaver', race: 'P', hp: 100, sh: 80, size: 'large', min: 200, gas: 100, sup: 4, time: 1050, speed: 1.78, sight: 10, r: 18, hk: 'V', from: 'robotics_facility', req: ['robotics_support_bay'], mech: true, cargoSize: 4,
    gw: W(100, 'normal', 8, 60, { upgKey: null, scarab: true, splash: [0.6, 1.2, 1.8], dmgTech: ['scarab_damage', 25] }), abil: ['build_scarab'], upgA: 'gA', scarabs: 0, scarabTech: ['reaver_capacity', 10] });
  U('shuttle', { name: 'Shuttle', race: 'P', hp: 80, sh: 60, armor: 1, size: 'large', min: 200, sup: 2, time: 900, speed: 4.44, sight: 8, r: 16, hk: 'S', from: 'robotics_facility', mech: true, fly: true, cargo: 8,
    abil: ['unload'], upgA: 'airA', speedTech: ['gravitic_drive', 6.67] });
  U('observer', { name: 'Observer', race: 'P', hp: 40, sh: 20, size: 'small', min: 25, gas: 75, sup: 1, time: 600, speed: 3.33, sight: 9, r: 8, hk: 'O', from: 'robotics_facility', req: ['observatory'], mech: true, fly: true, det: true, cloaked: true, permaCloak: true,
    upgA: 'airA', speedTech: ['gravitic_boosters', 5], sightTech: ['sensor_array', 11] });
  U('scout', { name: 'Scout', race: 'P', hp: 150, sh: 100, size: 'large', min: 275, gas: 125, sup: 3, time: 1200, speed: 6.67, sight: 8, r: 14, hk: 'S', from: 'stargate', mech: true, fly: true,
    gw: W(8, 'normal', 4, 30, { upgKey: 'airW' }), aw: W(14, 'explosive', 4, 22, { hits: 2, upgKey: 'airW', targets: 'air' }), upgA: 'airA', speedTech: ['gravitic_thrusters', 8], sightTech: ['apial_sensors', 10] });
  U('corsair', { name: 'Corsair', race: 'P', hp: 100, sh: 80, armor: 1, size: 'medium', min: 150, gas: 100, sup: 2, time: 600, speed: 6.67, sight: 9, r: 14, hk: 'O', from: 'stargate', mech: true, fly: true, energy: 200,
    aw: W(5, 'explosive', 5, 8, { upgKey: 'airW', targets: 'air', splash: [0.6, 1, 1.4] }), abil: ['disruption_web'], upgA: 'airA' });
  U('carrier', { name: 'Carrier', race: 'P', hp: 300, sh: 150, armor: 4, size: 'large', min: 350, gas: 250, sup: 6, time: 2100, speed: 3.33, sight: 11, r: 22, hk: 'C', from: 'stargate', req: ['fleet_beacon'], mech: true, fly: true,
    gw: W(6, 'normal', 8, 37, { upgKey: 'airW', targets: 'both', interceptor: true }), abil: ['build_interceptor'], upgA: 'airA', interceptors: 0, interceptorTech: ['carrier_capacity', 8] });
  U('arbiter', { name: 'Arbiter', race: 'P', hp: 200, sh: 150, armor: 1, size: 'large', min: 100, gas: 350, sup: 4, time: 2400, speed: 5, sight: 9, r: 18, hk: 'A', from: 'stargate', req: ['arbiter_tribunal'], mech: true, fly: true, energy: 200, cloakField: 8,
    gw: W(10, 'explosive', 5, 45, { upgKey: 'airW', targets: 'both' }), abil: ['recall', 'stasis_field'], upgA: 'airA' });
  U('interceptor', { name: 'Interceptor', race: 'P', hp: 40, sh: 40, size: 'small', min: 25, time: 300, speed: 13, sight: 6, r: 5, mech: true, fly: true, hk: 'I', from: 'carrier', notUnit: true, gw: W(6, 'normal', 2, 45, { upgKey: 'airW', targets: 'both' }), upgA: 'airA' });
  U('scarab', { name: 'Scarab', race: 'P', hp: 20, size: 'small', min: 15, time: 168, speed: 12, r: 4, hk: 'S', from: 'reaver', notUnit: true, sight: 3 });
  U('hallucination', { name: 'Hallucination', race: 'P', hp: 1, size: 'small', speed: 4, sight: 7, r: 8, notUnit: true });

  // ============================ TERRAN BUILDINGS ============================
  B('command_center', { name: 'Command Center', race: 'T', hp: 1500, w: 4, h: 3, min: 400, time: 1800, hk: 'C', tier: 'basic', produces: ['scv'], sup: 10, depot: true, canLift: true, addons: ['comsat_station', 'nuclear_silo'], sight: 10 });
  B('comsat_station', { name: 'Comsat Station', race: 'T', hp: 500, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'C', tier: 'addon', parent: 'command_center', req: ['academy'], energy: 200, abil: ['scanner_sweep'] });
  B('nuclear_silo', { name: 'Nuclear Silo', race: 'T', hp: 600, w: 2, h: 2, min: 100, gas: 100, time: 1200, hk: 'N', tier: 'addon', parent: 'command_center', req: ['covert_ops'], produces: ['nuke'] });
  B('supply_depot', { name: 'Supply Depot', race: 'T', hp: 500, w: 3, h: 2, min: 100, time: 600, hk: 'S', tier: 'basic', sup: 8 });
  B('refinery', { name: 'Refinery', race: 'T', hp: 750, w: 4, h: 2, min: 100, time: 600, hk: 'R', tier: 'basic', onGeyser: true });
  B('barracks', { name: 'Barracks', race: 'T', hp: 1000, w: 4, h: 3, min: 150, time: 1200, hk: 'B', tier: 'basic', req: ['command_center'], produces: ['marine', 'firebat', 'medic', 'ghost'], canLift: true });
  B('engineering_bay', { name: 'Engineering Bay', race: 'T', hp: 850, w: 4, h: 3, min: 125, time: 900, hk: 'E', tier: 'basic', req: ['command_center'], upg: ['infW', 'infA'], canLift: true });
  B('academy', { name: 'Academy', race: 'T', hp: 600, w: 3, h: 2, min: 150, time: 1200, hk: 'A', tier: 'basic', req: ['barracks'], tech: ['stim', 'u238', 'restoration_tech', 'optical_flare_tech', 'caduceus'] });
  B('missile_turret', { name: 'Missile Turret', race: 'T', hp: 200, armor: 0, w: 2, h: 2, min: 75, time: 450, hk: 'T', tier: 'basic', req: ['engineering_bay'], det: true, sight: 11,
    aw: W(20, 'explosive', 7, 15, { targets: 'air', upgKey: null }) });
  B('bunker', { name: 'Bunker', race: 'T', hp: 350, w: 3, h: 2, min: 100, time: 450, hk: 'U', tier: 'basic', req: ['barracks'], cargo: 4, bunker: true, abil: ['unload'] });
  B('factory', { name: 'Factory', race: 'T', hp: 1250, w: 4, h: 3, min: 200, gas: 100, time: 1200, hk: 'F', tier: 'adv', req: ['barracks'], produces: ['vulture', 'siege_tank', 'goliath'], addons: ['machine_shop'], canLift: true });
  B('machine_shop', { name: 'Machine Shop', race: 'T', hp: 750, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'M', tier: 'addon', parent: 'factory', tech: ['ion_thrusters', 'spider_mines_tech', 'siege_tech', 'charon'] });
  B('starport', { name: 'Starport', race: 'T', hp: 1300, w: 4, h: 3, min: 150, gas: 100, time: 1050, hk: 'S', tier: 'adv', req: ['factory'], produces: ['wraith', 'dropship', 'science_vessel', 'battlecruiser', 'valkyrie'], addons: ['control_tower'], canLift: true });
  B('control_tower', { name: 'Control Tower', race: 'T', hp: 500, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'C', tier: 'addon', parent: 'starport', tech: ['cloaking_field', 'apollo'] });
  B('science_facility', { name: 'Science Facility', race: 'T', hp: 850, w: 4, h: 3, min: 100, gas: 150, time: 900, hk: 'I', tier: 'adv', req: ['starport'], addons: ['physics_lab', 'covert_ops'], tech: ['emp_tech', 'irradiate_tech', 'titan'], canLift: true });
  B('physics_lab', { name: 'Physics Lab', race: 'T', hp: 600, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'P', tier: 'addon', parent: 'science_facility', tech: ['yamato_tech', 'colossus'] });
  B('covert_ops', { name: 'Covert Ops', race: 'T', hp: 750, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'C', tier: 'addon', parent: 'science_facility', tech: ['lockdown_tech', 'personnel_cloaking', 'ocular', 'moebius'] });
  B('armory', { name: 'Armory', race: 'T', hp: 750, w: 3, h: 2, min: 100, gas: 50, time: 1200, hk: 'A', tier: 'adv', req: ['factory'], upg: ['vehW', 'vehA', 'shipW', 'shipA'] });

  // ============================ ZERG BUILDINGS ============================
  B('hatchery', { name: 'Hatchery', race: 'Z', hp: 1250, w: 4, h: 3, min: 300, time: 1800, hk: 'H', tier: 'basic', sup: 1, depot: true, spawnsLarva: true, creep: 11, morphTo: 'lair', sight: 9 });
  B('lair', { name: 'Lair', race: 'Z', hp: 1800, w: 4, h: 3, min: 150, gas: 100, time: 1500, hk: 'L', tier: 'morph', req: ['spawning_pool'], sup: 1, depot: true, spawnsLarva: true, creep: 11, morphTo: 'hive', tech: ['ventral_sacs', 'antennae', 'pneumatized'], sight: 10 });
  B('hive', { name: 'Hive', race: 'Z', hp: 2500, w: 4, h: 3, min: 200, gas: 150, time: 1800, hk: 'H', tier: 'morph', req: ['queens_nest'], sup: 1, depot: true, spawnsLarva: true, creep: 11, tech: ['ventral_sacs', 'antennae', 'pneumatized'], sight: 11 });
  B('creep_colony', { name: 'Creep Colony', race: 'Z', hp: 400, w: 2, h: 2, min: 75, time: 300, hk: 'C', tier: 'basic', creep: 8, needsCreep: true, morphOptions: ['sunken_colony', 'spore_colony'] });
  B('sunken_colony', { name: 'Sunken Colony', race: 'Z', hp: 300, armor: 2, w: 2, h: 2, min: 50, time: 300, hk: 'S', tier: 'morph', req: ['spawning_pool'], creep: 8, gw: W(40, 'explosive', 7, 32, { upgKey: null }) });
  B('spore_colony', { name: 'Spore Colony', race: 'Z', hp: 400, w: 2, h: 2, min: 50, time: 300, hk: 'P', tier: 'morph', req: ['evolution_chamber'], creep: 8, det: true, sight: 10, aw: W(15, 'normal', 7, 15, { targets: 'air', upgKey: null }) });
  B('extractor', { name: 'Extractor', race: 'Z', hp: 750, w: 4, h: 2, min: 50, time: 600, hk: 'E', tier: 'basic', onGeyser: true, creep: 3 });
  B('spawning_pool', { name: 'Spawning Pool', race: 'Z', hp: 750, w: 3, h: 2, min: 200, time: 1200, hk: 'S', tier: 'basic', req: ['hatchery'], needsCreep: true, tech: ['metabolic', 'adrenal'] });
  B('evolution_chamber', { name: 'Evolution Chamber', race: 'Z', hp: 750, w: 3, h: 2, min: 75, time: 600, hk: 'V', tier: 'basic', req: ['hatchery'], needsCreep: true, upg: ['meleeW', 'missW', 'carapace'] });
  B('hydralisk_den', { name: 'Hydralisk Den', race: 'Z', hp: 850, w: 3, h: 2, min: 100, gas: 50, time: 600, hk: 'D', tier: 'basic', req: ['spawning_pool'], needsCreep: true, tech: ['muscular', 'grooved', 'lurker_aspect'] });
  B('spire', { name: 'Spire', race: 'Z', hp: 600, w: 2, h: 2, min: 200, gas: 150, time: 1800, hk: 'S', tier: 'adv', req: ['lair'], needsCreep: true, upg: ['flyW', 'flyA'], morphTo: 'greater_spire' });
  B('greater_spire', { name: 'Greater Spire', race: 'Z', hp: 1000, w: 2, h: 2, min: 100, gas: 150, time: 1800, hk: 'G', tier: 'morph', req: ['hive'], upg: ['flyW', 'flyA'] });
  B('queens_nest', { name: "Queen's Nest", race: 'Z', hp: 850, w: 3, h: 2, min: 150, gas: 100, time: 900, hk: 'Q', tier: 'adv', req: ['lair'], needsCreep: true, tech: ['ensnare_tech', 'spawn_broodling_tech', 'gamete'] });
  B('ultralisk_cavern', { name: 'Ultralisk Cavern', race: 'Z', hp: 600, w: 3, h: 2, min: 150, gas: 200, time: 1200, hk: 'U', tier: 'adv', req: ['hive'], needsCreep: true, tech: ['anabolic', 'chitinous'] });
  // Lair, not Hive: in Brood War the Defiler Mound is a Lair-tech building, and having it behind the
  // Hive put Zerg's only answer to healed bio four minutes past the end of an average AI game.
  B('defiler_mound', { name: 'Defiler Mound', race: 'Z', hp: 850, w: 4, h: 2, min: 100, gas: 100, time: 900, hk: 'D', tier: 'adv', req: ['lair'], needsCreep: true, tech: ['plague_tech', 'consume_tech', 'metasynaptic'] });
  B('nydus_canal', { name: 'Nydus Canal', race: 'Z', hp: 250, w: 2, h: 2, min: 150, time: 600, hk: 'N', tier: 'adv', req: ['hive'], needsCreep: true, nydus: true, abil: ['nydus_exit'] });
  B('infested_command_center', { name: 'Infested Command Center', race: 'Z', hp: 1500, w: 4, h: 3, time: 1, tier: 'none', produces: ['infested_terran'], sight: 10 });

  // ============================ PROTOSS BUILDINGS ============================
  B('nexus', { name: 'Nexus', race: 'P', hp: 750, sh: 750, w: 4, h: 3, min: 400, time: 1800, hk: 'N', tier: 'basic', produces: ['probe'], sup: 10, depot: true, sight: 11 });
  B('pylon', { name: 'Pylon', race: 'P', hp: 300, sh: 300, armor: 0, w: 2, h: 2, min: 100, time: 450, hk: 'P', tier: 'basic', sup: 8, psi: 6.5 });
  B('assimilator', { name: 'Assimilator', race: 'P', hp: 450, sh: 450, w: 4, h: 2, min: 100, time: 600, hk: 'A', tier: 'basic', onGeyser: true });
  B('gateway', { name: 'Gateway', race: 'P', hp: 500, sh: 500, w: 4, h: 3, min: 150, time: 900, hk: 'G', tier: 'basic', req: ['nexus'], needsPsi: true, produces: ['zealot', 'dragoon', 'high_templar', 'dark_templar'] });
  B('forge', { name: 'Forge', race: 'P', hp: 550, sh: 550, w: 3, h: 2, min: 150, time: 600, hk: 'F', tier: 'basic', req: ['nexus'], needsPsi: true, upg: ['gW', 'gA', 'shields'] });
  B('photon_cannon', { name: 'Photon Cannon', race: 'P', hp: 100, sh: 100, armor: 0, w: 2, h: 2, min: 150, time: 750, hk: 'C', tier: 'basic', req: ['forge'], needsPsi: true, det: true, sight: 11,
    gw: W(20, 'normal', 7, 22, { targets: 'both', upgKey: null }) });
  B('cybernetics_core', { name: 'Cybernetics Core', race: 'P', hp: 500, sh: 500, w: 3, h: 2, min: 200, time: 900, hk: 'Y', tier: 'basic', req: ['gateway'], needsPsi: true, upg: ['airW', 'airA'], tech: ['singularity'] });
  B('shield_battery', { name: 'Shield Battery', race: 'P', hp: 200, sh: 200, w: 3, h: 2, min: 100, time: 450, hk: 'B', tier: 'basic', req: ['gateway'], needsPsi: true, energy: 200, battery: true });
  B('robotics_facility', { name: 'Robotics Facility', race: 'P', hp: 500, sh: 500, w: 3, h: 2, min: 200, gas: 200, time: 1200, hk: 'R', tier: 'adv', req: ['cybernetics_core'], needsPsi: true, produces: ['shuttle', 'reaver', 'observer'] });
  B('stargate', { name: 'Stargate', race: 'P', hp: 600, sh: 600, w: 4, h: 3, min: 150, gas: 150, time: 1050, hk: 'S', tier: 'adv', req: ['cybernetics_core'], needsPsi: true, produces: ['scout', 'corsair', 'carrier', 'arbiter'] });
  B('citadel_of_adun', { name: 'Citadel of Adun', race: 'P', hp: 450, sh: 450, w: 3, h: 2, min: 150, gas: 100, time: 900, hk: 'C', tier: 'adv', req: ['cybernetics_core'], needsPsi: true, tech: ['leg_enhancements'] });
  B('robotics_support_bay', { name: 'Robotics Support Bay', race: 'P', hp: 450, sh: 450, w: 3, h: 2, min: 150, gas: 100, time: 450, hk: 'B', tier: 'adv', req: ['robotics_facility'], needsPsi: true, tech: ['scarab_damage', 'reaver_capacity', 'gravitic_drive'] });
  B('fleet_beacon', { name: 'Fleet Beacon', race: 'P', hp: 500, sh: 500, w: 3, h: 2, min: 300, gas: 200, time: 900, hk: 'F', tier: 'adv', req: ['stargate'], needsPsi: true, tech: ['apial_sensors', 'gravitic_thrusters', 'carrier_capacity', 'disruption_web_tech', 'argus_jewel'] });
  B('templar_archives', { name: 'Templar Archives', race: 'P', hp: 500, sh: 500, w: 3, h: 2, min: 150, gas: 200, time: 900, hk: 'T', tier: 'adv', req: ['citadel_of_adun'], needsPsi: true, tech: ['psi_storm_tech', 'hallucination_tech', 'khaydarin_amulet', 'mind_control_tech', 'maelstrom_tech', 'argus_talisman'] });
  B('observatory', { name: 'Observatory', race: 'P', hp: 250, sh: 250, w: 3, h: 2, min: 50, gas: 100, time: 450, hk: 'O', tier: 'adv', req: ['robotics_facility'], needsPsi: true, tech: ['gravitic_boosters', 'sensor_array'] });
  B('arbiter_tribunal', { name: 'Arbiter Tribunal', race: 'P', hp: 500, sh: 500, w: 3, h: 2, min: 200, gas: 150, time: 900, hk: 'A', tier: 'adv', req: ['templar_archives', 'stargate'], needsPsi: true, tech: ['recall_tech', 'stasis_tech', 'khaydarin_core'] });

  // ============================ UPGRADES (3 levels) ============================
  const L3 = (id, name, race, bld, hk, extraReq) => UP(id, { name, race, bld, hk, levels: 3, min: [100, 175, 250], gas: [100, 175, 250], time: [4000, 4480, 4960], req: [null, extraReq, extraReq] });
  L3('infW', 'Infantry Weapons', 'T', 'engineering_bay', 'W', 'science_facility');
  L3('infA', 'Infantry Armor', 'T', 'engineering_bay', 'A', 'science_facility');
  L3('vehW', 'Vehicle Weapons', 'T', 'armory', 'V', 'science_facility');
  L3('vehA', 'Vehicle Plating', 'T', 'armory', 'P', 'science_facility');
  L3('shipW', 'Ship Weapons', 'T', 'armory', 'S', 'science_facility');
  L3('shipA', 'Ship Plating', 'T', 'armory', 'L', 'science_facility');
  L3('meleeW', 'Melee Attacks', 'Z', 'evolution_chamber', 'M', 'lair');
  L3('missW', 'Missile Attacks', 'Z', 'evolution_chamber', 'A', 'lair');
  L3('carapace', 'Carapace', 'Z', 'evolution_chamber', 'C', 'lair');
  L3('flyW', 'Flyer Attacks', 'Z', 'spire', 'A', 'lair');
  L3('flyA', 'Flyer Carapace', 'Z', 'spire', 'C', 'lair');
  L3('gW', 'Ground Weapons', 'P', 'forge', 'W', 'cybernetics_core');
  L3('gA', 'Ground Armor', 'P', 'forge', 'A', 'cybernetics_core');
  L3('shields', 'Plasma Shields', 'P', 'forge', 'S', 'cybernetics_core');
  L3('airW', 'Air Weapons', 'P', 'cybernetics_core', 'W', 'fleet_beacon');
  L3('airA', 'Air Armor', 'P', 'cybernetics_core', 'A', 'fleet_beacon');
  // Level 2/3 costs for vehicle/ship/etc
  ['vehW', 'vehA', 'shipW', 'shipA', 'meleeW', 'missW', 'carapace', 'flyW', 'flyA', 'gW', 'gA', 'shields', 'airW', 'airA'].forEach(k => { upgrades[k].min = [100, 175, 250]; upgrades[k].gas = [100, 175, 250]; });
  upgrades.carapace.min = [150, 225, 300]; upgrades.carapace.gas = [150, 225, 300];
  upgrades.shields.min = [200, 300, 400]; upgrades.shields.gas = [200, 300, 400];
  upgrades.vehW.min = [100, 175, 250]; upgrades.shipW.min = [100, 175, 250];
  upgrades.airW.min = [100, 175, 250]; upgrades.airA.min = [150, 225, 300]; upgrades.airA.gas = [150, 225, 300];
  upgrades.gA.min = [100, 175, 250]; upgrades.gW.min = [100, 175, 250];
  upgrades.flyA.min = [150, 225, 300]; upgrades.flyA.gas = [150, 225, 300];

  // ============================ TECH (single research) ============================
  const T = (id, name, race, bld, hk, min, gas, time, o = {}) => TE(id, Object.assign({ name, race, bld, hk, min, gas, time }, o));
  T('stim', 'Stim Packs', 'T', 'academy', 'T', 100, 100, 1200);
  T('u238', 'U-238 Shells', 'T', 'academy', 'U', 150, 150, 1500, { effect: { unit: 'marine', range: 5 } });
  T('restoration_tech', 'Restoration', 'T', 'academy', 'R', 100, 100, 1200);
  T('optical_flare_tech', 'Optical Flare', 'T', 'academy', 'F', 100, 100, 1800);
  T('caduceus', 'Caduceus Reactor', 'T', 'academy', 'C', 150, 150, 2500, { energy: 'medic' });
  T('ion_thrusters', 'Ion Thrusters', 'T', 'machine_shop', 'I', 100, 100, 1500, { effect: { unit: 'vulture', speed: 8.53 } });
  T('spider_mines_tech', 'Spider Mines', 'T', 'machine_shop', 'M', 100, 100, 1200);
  T('siege_tech', 'Siege Tech', 'T', 'machine_shop', 'S', 150, 150, 1200);
  T('charon', 'Charon Boosters', 'T', 'machine_shop', 'C', 100, 100, 2000);
  T('cloaking_field', 'Cloaking Field', 'T', 'control_tower', 'C', 150, 150, 1500);
  T('apollo', 'Apollo Reactor', 'T', 'control_tower', 'A', 200, 200, 2500, { energy: 'wraith' });
  T('emp_tech', 'EMP Shockwave', 'T', 'science_facility', 'E', 200, 200, 1800);
  T('irradiate_tech', 'Irradiate', 'T', 'science_facility', 'I', 200, 200, 1200);
  T('titan', 'Titan Reactor', 'T', 'science_facility', 'T', 150, 150, 2500, { energy: 'science_vessel' });
  T('yamato_tech', 'Yamato Gun', 'T', 'physics_lab', 'Y', 100, 100, 1800);
  T('colossus', 'Colossus Reactor', 'T', 'physics_lab', 'C', 150, 150, 2500, { energy: 'battlecruiser' });
  T('lockdown_tech', 'Lockdown', 'T', 'covert_ops', 'L', 200, 200, 1500);
  T('personnel_cloaking', 'Personnel Cloaking', 'T', 'covert_ops', 'C', 100, 100, 1200);
  T('ocular', 'Ocular Implants', 'T', 'covert_ops', 'O', 100, 100, 2500, { effect: { unit: 'ghost', sight: 11 } });
  T('moebius', 'Moebius Reactor', 'T', 'covert_ops', 'M', 150, 150, 2500, { energy: 'ghost' });
  T('metabolic', 'Metabolic Boost', 'Z', 'spawning_pool', 'M', 100, 100, 1500);
  T('adrenal', 'Adrenal Glands', 'Z', 'spawning_pool', 'A', 200, 200, 1500, { req: ['hive'] });
  T('muscular', 'Muscular Augments', 'Z', 'hydralisk_den', 'M', 150, 150, 1500);
  T('grooved', 'Grooved Spines', 'Z', 'hydralisk_den', 'G', 150, 150, 1500);
  T('lurker_aspect', 'Lurker Aspect', 'Z', 'hydralisk_den', 'L', 200, 200, 1800, { req: ['lair'] });
  T('burrow_tech', 'Burrow', 'Z', 'hatchery', 'B', 100, 100, 1200);
  T('ventral_sacs', 'Ventral Sacs', 'Z', 'lair', 'V', 200, 200, 2400);
  T('antennae', 'Antennae', 'Z', 'lair', 'A', 150, 150, 2000);
  T('pneumatized', 'Pneumatized Carapace', 'Z', 'lair', 'P', 150, 150, 2000);
  T('ensnare_tech', 'Ensnare', 'Z', 'queens_nest', 'E', 100, 100, 1200);
  T('spawn_broodling_tech', 'Spawn Broodlings', 'Z', 'queens_nest', 'B', 100, 100, 1200);
  T('gamete', 'Gamete Meiosis', 'Z', 'queens_nest', 'G', 150, 150, 2500, { energy: 'queen' });
  T('anabolic', 'Anabolic Synthesis', 'Z', 'ultralisk_cavern', 'A', 200, 200, 2000);
  T('chitinous', 'Chitinous Plating', 'Z', 'ultralisk_cavern', 'C', 150, 150, 2000);
  T('plague_tech', 'Plague', 'Z', 'defiler_mound', 'P', 200, 200, 1500);
  T('consume_tech', 'Consume', 'Z', 'defiler_mound', 'C', 100, 100, 1500);
  T('metasynaptic', 'Metasynaptic Node', 'Z', 'defiler_mound', 'M', 150, 150, 2500, { energy: 'defiler' });
  T('leg_enhancements', 'Leg Enhancements', 'P', 'citadel_of_adun', 'L', 150, 150, 2000);
  T('singularity', 'Singularity Charge', 'P', 'cybernetics_core', 'S', 150, 150, 2500);
  T('psi_storm_tech', 'Psionic Storm', 'P', 'templar_archives', 'P', 200, 200, 1800);
  T('hallucination_tech', 'Hallucination', 'P', 'templar_archives', 'H', 150, 150, 1200);
  T('khaydarin_amulet', 'Khaydarin Amulet', 'P', 'templar_archives', 'K', 150, 150, 2500, { energy: 'high_templar' });
  T('mind_control_tech', 'Mind Control', 'P', 'templar_archives', 'M', 200, 200, 1800);
  T('maelstrom_tech', 'Maelstrom', 'P', 'templar_archives', 'E', 100, 100, 1800);
  T('argus_talisman', 'Argus Talisman', 'P', 'templar_archives', 'T', 150, 150, 2500, { energy: 'dark_archon' });
  T('scarab_damage', 'Scarab Damage', 'P', 'robotics_support_bay', 'S', 200, 200, 2500);
  T('reaver_capacity', 'Reaver Capacity', 'P', 'robotics_support_bay', 'C', 200, 200, 2500);
  T('gravitic_drive', 'Gravitic Drive', 'P', 'robotics_support_bay', 'G', 200, 200, 2500);
  T('gravitic_boosters', 'Gravitic Boosters', 'P', 'observatory', 'G', 150, 150, 2500);
  T('sensor_array', 'Sensor Array', 'P', 'observatory', 'S', 150, 150, 2000);
  T('apial_sensors', 'Apial Sensors', 'P', 'fleet_beacon', 'A', 100, 100, 2500);
  T('gravitic_thrusters', 'Gravitic Thrusters', 'P', 'fleet_beacon', 'G', 200, 200, 2500);
  T('carrier_capacity', 'Carrier Capacity', 'P', 'fleet_beacon', 'C', 100, 100, 1500);
  T('disruption_web_tech', 'Disruption Web', 'P', 'fleet_beacon', 'D', 200, 200, 1200);
  T('argus_jewel', 'Argus Jewel', 'P', 'fleet_beacon', 'J', 100, 100, 2500, { energy: 'corsair' });
  T('recall_tech', 'Recall', 'P', 'arbiter_tribunal', 'R', 150, 150, 1800);
  T('stasis_tech', 'Stasis Field', 'P', 'arbiter_tribunal', 'S', 150, 150, 1800);
  T('khaydarin_core', 'Khaydarin Core', 'P', 'arbiter_tribunal', 'K', 150, 150, 2500, { energy: 'arbiter' });
  buildings.hatchery.tech = ['burrow_tech']; buildings.lair.tech.push('burrow_tech'); buildings.hive.tech.push('burrow_tech');

  // ============================ ABILITIES ============================
  // kind: instant | unit (target unit) | point (target position) | toggle | menu | auto
  const A = (id, name, hk, kind, o = {}) => AB(id, Object.assign({ name, hk, kind }, o));
  A('gather', 'Gather', 'G', 'unit');
  A('repair', 'Repair', 'R', 'unit');
  A('build_basic', 'Build', 'B', 'menu');
  A('build_adv', 'Build Advanced', 'V', 'menu');
  A('morph_menu', 'Morph', 'M', 'menu');
  A('unload', 'Unload All', 'U', 'instant');
  A('stim', 'Stim Pack', 'T', 'instant', { tech: 'stim' });
  A('heal', 'Heal', 'E', 'unit', { energy: 0, auto: true });
  A('restoration', 'Restoration', 'R', 'unit', { energy: 50, tech: 'restoration_tech' });
  A('optical_flare', 'Optical Flare', 'F', 'unit', { energy: 75, tech: 'optical_flare_tech' });
  A('lockdown', 'Lockdown', 'L', 'unit', { energy: 100, tech: 'lockdown_tech', range: 8 });
  A('cloak_ghost', 'Personnel Cloaking', 'C', 'toggle', { energy: 25, tech: 'personnel_cloaking' });
  A('cloak_wraith', 'Cloaking Field', 'C', 'toggle', { energy: 25, tech: 'cloaking_field' });
  A('nuke', 'Nuclear Strike', 'N', 'point', { range: 8, needsNuke: true });
  A('spider_mine', 'Spider Mines', 'I', 'point', { tech: 'spider_mines_tech', range: 1 });
  A('siege_mode', 'Siege Mode', 'O', 'toggle', { tech: 'siege_tech' });
  A('defensive_matrix', 'Defensive Matrix', 'D', 'unit', { energy: 100, range: 10 });
  A('emp', 'EMP Shockwave', 'E', 'point', { energy: 100, tech: 'emp_tech', range: 8 });
  A('irradiate', 'Irradiate', 'I', 'unit', { energy: 75, tech: 'irradiate_tech', range: 9 });
  A('yamato', 'Yamato Gun', 'Y', 'unit', { energy: 150, tech: 'yamato_tech', range: 10 });
  A('scanner_sweep', 'Scanner Sweep', 'S', 'point', { energy: 50, range: 999 });
  A('burrow', 'Burrow', 'U', 'toggle', { tech: 'burrow_tech' });
  A('lurker_aspect', 'Lurker Aspect', 'L', 'morph', { unit: 'lurker' });
  A('guardian_aspect', 'Guardian Aspect', 'G', 'morph', { unit: 'guardian' });
  A('devourer_aspect', 'Devourer Aspect', 'V', 'morph', { unit: 'devourer' });
  A('parasite', 'Parasite', 'R', 'unit', { energy: 75, range: 12 });
  A('ensnare', 'Ensnare', 'E', 'point', { energy: 75, tech: 'ensnare_tech', range: 9 });
  A('spawn_broodling', 'Spawn Broodlings', 'B', 'unit', { energy: 150, tech: 'spawn_broodling_tech', range: 9 });
  A('dark_swarm', 'Dark Swarm', 'W', 'point', { energy: 100, range: 9 });
  A('plague', 'Plague', 'G', 'point', { energy: 150, tech: 'plague_tech', range: 9 });
  A('consume', 'Consume', 'C', 'unit', { energy: 0, tech: 'consume_tech', range: 1 });
  A('nydus_exit', 'Build Nydus Exit', 'N', 'point');
  A('infest', 'Infest Command Center', 'I', 'unit', { range: 1 });
  A('psi_storm', 'Psionic Storm', 'T', 'point', { energy: 75, tech: 'psi_storm_tech', range: 9 });
  A('hallucination', 'Hallucination', 'L', 'unit', { energy: 100, tech: 'hallucination_tech', range: 9 });
  A('summon_archon', 'Summon Archon', 'W', 'merge', { unit: 'archon' });
  A('summon_dark_archon', 'Summon Dark Archon', 'W', 'merge', { unit: 'dark_archon' });
  A('feedback', 'Feedback', 'F', 'unit', { energy: 50, range: 10 });
  A('mind_control', 'Mind Control', 'C', 'unit', { energy: 150, tech: 'mind_control_tech', range: 8 });
  A('maelstrom', 'Maelstrom', 'E', 'point', { energy: 100, tech: 'maelstrom_tech', range: 10 });
  A('build_scarab', 'Build Scarab', 'B', 'produce', { unit: 'scarab' });
  A('build_interceptor', 'Build Interceptor', 'I', 'produce', { unit: 'interceptor' });
  A('disruption_web', 'Disruption Web', 'D', 'point', { energy: 125, tech: 'disruption_web_tech', range: 9 });
  A('recall', 'Recall', 'R', 'point', { energy: 150, tech: 'recall_tech', range: 999 });
  A('stasis_field', 'Stasis Field', 'T', 'point', { energy: 100, tech: 'stasis_tech', range: 9 });

  // Command-card ordering hints for worker build menus
  const buildMenu = {
    T: { basic: ['command_center', 'supply_depot', 'refinery', 'barracks', 'engineering_bay', 'missile_turret', 'academy', 'bunker'], adv: ['factory', 'starport', 'science_facility', 'armory'] },
    Z: { basic: ['hatchery', 'creep_colony', 'extractor', 'spawning_pool', 'evolution_chamber', 'hydralisk_den'], adv: ['spire', 'queens_nest', 'nydus_canal', 'ultralisk_cavern', 'defiler_mound'] },
    P: { basic: ['nexus', 'pylon', 'assimilator', 'gateway', 'forge', 'photon_cannon', 'cybernetics_core', 'shield_battery'], adv: ['robotics_facility', 'stargate', 'citadel_of_adun', 'robotics_support_bay', 'fleet_beacon', 'templar_archives', 'observatory', 'arbiter_tribunal'] },
  };
  const larvaMorphs = ['drone', 'overlord', 'zergling', 'hydralisk', 'mutalisk', 'scourge', 'queen', 'ultralisk', 'defiler'];
  const all = Object.assign({}, units, buildings);
  return { units, buildings, upgrades, techs, abilities, buildMenu, larvaMorphs, all };
})();

const RACE_INFO = {
  T: { name: 'Terran', worker: 'scv', hall: 'command_center', supply: 'supply_depot', gasB: 'refinery', color: '#3a6ea5', supplyMsg: 'Additional supply depots required.' },
  Z: { name: 'Zerg', worker: 'drone', hall: 'hatchery', supply: 'overlord', gasB: 'extractor', color: '#7b3fa0', supplyMsg: 'Spawn more overlords.' },
  P: { name: 'Protoss', worker: 'probe', hall: 'nexus', supply: 'pylon', gasB: 'assimilator', color: '#c9a227', supplyMsg: 'You must construct additional pylons.' },
};
const PLAYER_COLORS = ['#f40404', '#0c48cc', '#2cb494', '#88409c', '#f88c14', '#703014', '#cce0d0', '#fcfc38'];
