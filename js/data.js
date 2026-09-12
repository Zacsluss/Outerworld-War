'use strict';
// ============================================================================
// Brood War data tables. Times are in game frames (24/s = "Fastest").
// Distances: ranges/sight in tiles (32px). Speeds in px/frame.
// ============================================================================
// DETERMINISTIC TRANSCENDENTALS. Math.sin, Math.cos, Math.atan2 and Math.hypot are not required to be
// correctly rounded, and the engines differ in the last bit: V8 and SpiderMonkey carry fdlibm ports,
// JavaScriptCore calls the platform libm. Lockstep hashes positions at 1/16 px, so two DIFFERENT engines
// -- Chrome against Firefox, or a Tauri build on Windows (WebView2, V8) against one on macOS (WebKit) --
// drift apart over minutes and call it a desync. Everything below uses only +, -, *, /, sqrt and floor,
// which IEEE 754 requires to be correctly rounded everywhere, so every engine computes the same bits.
// Range reduction by whole turns and a fold to [-pi/2, pi/2], then a Taylor series to ~1e-16; atan by
// argument reduction to |x| <= tan(pi/12) and a series to the same. About twice the cost of the natives
// on some eighty call sites. Presentation code keeps the natives. test/dmath.js measures the error
// against Math and scrapes the stamped files for a native that crept back in. (REVIEW-M17 decision 1)
const DMath = {
  // x folded into [-pi, pi]; anything non-finite becomes 0 rather than NaN
  wrap(x) { if (!(x < 1e15 && x > -1e15)) return 0; return x - Math.floor((x + Math.PI) / (2 * Math.PI)) * (2 * Math.PI); },
  sin(x) {
    x = this.wrap(x); if (x > Math.PI / 2) x = Math.PI - x; else if (x < -Math.PI / 2) x = -Math.PI - x;   // sin(pi - x) = sin(x)
    const x2 = x * x; let term = x, sum = x;
    for (let n = 1; n <= 12; n++) { term *= -x2 / ((2 * n) * (2 * n + 1)); sum += term; }
    return sum;
  },
  cos(x) {   // its own series, not sin(x + pi/2): that shift rounds and cos(0) came out 1.0000000000000002
    x = this.wrap(x); if (x < 0) x = -x; let neg = false; if (x > Math.PI / 2) { x = Math.PI - x; neg = true; }   // cos(pi - x) = -cos(x)
    const x2 = x * x; let term = 1, sum = 1;
    for (let n = 1; n <= 12; n++) { term *= -x2 / ((2 * n - 1) * (2 * n)); sum += term; }
    return neg ? -sum : sum;
  },
  hypot(a, b) { return Math.sqrt(a * a + b * b); },
  atan(x) {
    let neg = false, big = false, shift = 0;
    if (x < 0) { x = -x; neg = true; } if (x > 1) { x = 1 / x; big = true; }                  // atan(x) = pi/2 - atan(1/x)
    if (x > 0.2679491924311227) { x = (x * 1.7320508075688772 - 1) / (x + 1.7320508075688772); shift = Math.PI / 6; }   // atan(x) = pi/6 + atan((x*sqrt3 - 1)/(x + sqrt3)); tan(pi/12) = 2 - sqrt3
    const x2 = x * x; let term = x, sum = x;
    for (let n = 1; n <= 14; n++) { term *= -x2; sum += term / (2 * n + 1); }
    let r = sum + shift; if (big) r = Math.PI / 2 - r; return neg ? -r : r;
  },
  atan2(y, x) {
    if (x > 0) return this.atan(y / x);
    if (x < 0) return y >= 0 ? this.atan(y / x) + Math.PI : this.atan(y / x) - Math.PI;
    return y > 0 ? Math.PI / 2 : y < 0 ? -Math.PI / 2 : 0;
  },
};
const TILE = 32;
const TPS = 24;
// The ceiling on a def's `desc`, in characters. A description is a sentence or two about what the
// thing is FOR; past this it is documentation, and the command-card tooltip it renders into is a
// popup over a 3x3 grid, not a page. test/card.js reads THIS, never a literal.
const DESC_MAX = 200;

// Can an SCV repair this? A positive property on the def, not a rule derived from other fields.
// The derived version -- "mechanical, and has a build time, and has a mineral cost" -- was written to
// stop repairTick dividing by an undefined build time, which is how a SPIDER MINE ended up with NaN hit
// points that spread through every comparison they touched. It worked, and it is the wrong shape: a
// whitelist cannot rot, whereas a derived rule silently admits the next unit somebody adds without a
// cost. Mechanical UNITS and every building are repairable; munitions, larvae, eggs and the sub-units
// that are really ammunition are not.
function repairableDef(d) {
  if (d.mine || d.larva || d.egg || d.notUnit) return false;
  if (d.id === 'scarab' || d.id === 'interceptor' || d.id === 'nuke' || d.id === 'spider_mine') return false;
  return !!(d.isBuilding || d.mech);
}
// Weapon type against unit size. M11 wave one, idea 24 -- the LAST mechanic of the milestone, landed
// last on purpose, because it invalidates every balance number in the repository and should therefore
// arrive on top of everything else that also does.
//
// SOFTENED, NOT REMOVED. The spread was 0.25 to 1.0, and against the wrong size a shot did a quarter
// of its damage: rock-paper-scissors so sharp that composition was the whole game and everything else
// -- range, speed, splash, where a unit was standing, which way it was facing -- was rounding error
// next to it. That is a matchup quiz, not a battle.
//
// It is now 0.65 to 1.0, chosen deliberately. Counters stay LEGIBLE: concussive is still visibly bad
// into large, explosive still visibly bad into small, and you can still read a fight by what is in it.
// But a wrong-target shot is a poor trade rather than a wasted one, so the difference between a good
// army and a bad one now runs through the mechanics this milestone spent its time on -- directional
// armour, suppression, veterancy, high ground, and terrain that remembers. Role matters, and counters
// still matter; neither one decides it alone.
//
// The ladder is 0.65 / 0.75 / 0.90 / 1.00 rather than the arithmetic remap of the old numbers, because
// a data table a human has to reason about should be round. Ordering and monotonicity are unchanged,
// so nothing counters anything it did not counter before.
const DMG_MULT = {
  normal:     { small: 1,    medium: 1,    large: 1 },
  concussive: { small: 1,    medium: 0.75, large: 0.65 },
  explosive:  { small: 0.65, medium: 0.90, large: 1 },
  ignore:     { small: 1,    medium: 1,    large: 1 },
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
    gw: W(6, 'normal', 4, 15, { upgKey: 'infW', targets: 'both', rangeTech: ['u238', 5] }), abil: ['stim'], upgA: 'infA' });
  U('firebat', { name: 'Firebat', race: 'T', hp: 50, armor: 1, size: 'small', min: 50, gas: 25, sup: 1, time: 360, speed: 4, sight: 7, r: 8, hk: 'F', from: 'barracks', req: ['academy'], bio: true, cargoSize: 1,
    gw: W(8, 'concussive', 1, 22, { hits: 2, upgKey: 'infW', splash: [0.5, 0.75, 1] }), abil: ['stim'], upgA: 'infA' });
  U('medic', { name: 'Medic', race: 'T', hp: 60, armor: 1, size: 'small', min: 50, gas: 25, sup: 1, time: 450, speed: 4, sight: 9, r: 8, hk: 'C', from: 'barracks', req: ['academy'], bio: true, cargoSize: 1, energy: 200,
    abil: ['heal', 'restoration', 'optical_flare'], upgA: 'infA' });
  U('ghost', { name: 'Ghost', race: 'T', hp: 45, size: 'small', min: 25, gas: 75, sup: 1, time: 750, speed: 4, sight: 9, r: 8, hk: 'G', from: 'barracks', req: ['academy', 'covert_ops'], bio: true, cargoSize: 1, energy: 200, sightTech: ['ocular', 11],
    gw: W(10, 'concussive', 7, 22, { upgKey: 'infW', targets: 'both' }), abil: ['lockdown', 'cloak_ghost', 'nuke'], upgA: 'infA' });
  U('vulture', { name: 'Vulture', race: 'T', hp: 80, size: 'medium', min: 75, sup: 2, time: 450, speed: 6.4, sight: 8, r: 12, hk: 'V', from: 'factory', mech: true, cargoSize: 2, hover: true, speedTech: ['ion_thrusters', 8.53],
    gw: W(20, 'concussive', 5, 30, { upgKey: 'vehW', upgDmg: 2 }), abil: ['spider_mine'], upgA: 'vehA', mines: 3 });
  U('siege_tank', { name: 'Siege Tank', race: 'T', hp: 150, armor: 1, size: 'large', min: 150, gas: 100, sup: 2, time: 750, speed: 4, sight: 10, r: 16, hk: 'T', from: 'factory', req: ['machine_shop'], mech: true, cargoSize: 4,
    gw: W(30, 'explosive', 7, 37, { upgKey: 'vehW', upgDmg: 3 }), abil: ['siege_mode'], upgA: 'vehA' });
  U('goliath', { name: 'Goliath', race: 'T', hp: 125, armor: 1, size: 'large', min: 100, gas: 50, sup: 2, time: 600, speed: 4.57, sight: 8, r: 14, hk: 'G', from: 'factory', req: ['armory'], mech: true, cargoSize: 2,
    // rangeTech is an ABSOLUTE range, like every other pair in this file (hydralisk 4 -> 5, dragoon 4 -> 6),
    // and this one read ['charon', 3]: researching Charon Boosters cut the air range from 5 to 3. Brood
    // War's number is 8. (REVIEW-M17; the AI buys charon, so this is on the balance list too)
    gw: W(12, 'normal', 5, 22, { upgKey: 'vehW', upgDmg: 2 }), aw: W(10, 'explosive', 5, 22, { hits: 2, upgKey: 'vehW', upgDmg: 2, targets: 'air', rangeTech: ['charon', 8] }), upgA: 'vehA' });
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

  // ======================= TERRAN, M12 WAVE FOUR (item 15) =======================
  // Fifteen new Terran entries. The rule for every one of them, taken from DESIGN-M12: take the
  // ergonomics wholesale, take the mechanics only where they add a DECISION, and where an SC2 unit
  // would duplicate something this game already has, change its ROLE rather than shipping a near-clone.
  // Each def below says which existing unit it was in danger of duplicating and what was changed.
  //
  // Every one carries `min` and `gas` explicitly even when zero. That is not style: Abilities.repairTick
  // computes `t.def.min * 0.25 * frac`, `undefined * 0.25` is NaN, and NaN hit points spread through
  // every comparison they touch. This repository lost an afternoon to exactly that, on a spider mine.

  // ---- the bio line ------------------------------------------------------------------------------
  // Terran infantry was marine / firebat / medic / ghost, and the only thing in it that was good into
  // armour was... nothing. Firebat is concussive (0.65 into large) and marine is 6 normal damage. So a
  // bio ball's answer to a dragoon, an ultralisk or a siege line was "bring tanks", which is why
  // AI_COMP.T is mech-heavy in every matchup that is not TvP. These two finish the triangle.
  //
  // MARAUDER -- the anti-large leg. Explosive, long-ish reach for infantry, slow rate of fire, and
  // `size: 'large'` itself, so it is the bio unit that a firebat cannot chew through. Not a marine
  // upgrade: it is worse than a marine into zerglings by design (explosive is 0.65 into small), and it
  // cannot shoot air at all, so a marauder ball loses to mutalisks that marines beat.
  U('marauder', { name: 'Marauder', race: 'T', hp: 125, armor: 1, size: 'large', min: 100, gas: 25, sup: 2, time: 480, speed: 3.7, sight: 8, r: 10, hk: 'D', from: 'barracks', req: ['academy'], bio: true, cargoSize: 2,
    gw: W(10, 'explosive', 6, 30, { upgKey: 'infW', upgDmg: 2 }), abil: ['stim'], upgA: 'infA' });
  // REAPER -- the anti-small leg, and the fastest ground unit in the game at 8.6 px/frame, ahead of a
  // metabolic-boost zergling (6.58) and an ion-thruster vulture (8.53) by a whisker.
  //
  // NOT A VULTURE. The vulture is mech: an SCV repairs it, it rides the vehicle upgrades, it lays
  // spider mines and it shoots 5 tiles of concussive. The reaper is BIO: a medic heals it, an aid
  // station mends it, it stims, it fits a bunker and it costs one cargo slot in a dropship instead of
  // two. Its weapon is normal damage at range 3, so it beats workers and zerglings and loses to
  // anything with armour -- the opposite end of the harass problem from the vulture's mines.
  // `hover: true` puts it in HOVER (js/abilities.js derives that Set from the defs) with the vulture, because jump
  // jets over a minefield is the whole fantasy of the unit and that Set is already the mechanism.
  //
  // `req: ['academy']` and NOT a bare Barracks, for two measured reasons rather than for flavour.
  // (1) Off a bare Barracks it competes with the Refinery's first hundred gas -- the Terran AI spent
  // it on reapers, held production waiting for 25 more, and reached frame 19,200 on seed 1 with no
  // Factory at all. (2) The Academy is already the infantry unlock -- firebat, medic, ghost -- and one
  // unit hanging off nothing was the odd one out. It is still early: the AI's own script puts the
  // Academy at supply 22.
  U('reaper', { name: 'Reaper', race: 'T', hp: 60, size: 'small', min: 50, gas: 25, sup: 1, time: 400, speed: 8.6, sight: 8, r: 8, hk: 'E', from: 'barracks', req: ['academy'], bio: true, cargoSize: 1, hover: true,
    gw: W(7, 'normal', 3, 15, { hits: 2, upgKey: 'infW' }), abil: ['stim'], upgA: 'infA' });

  // ---- the factory line --------------------------------------------------------------------------
  // HELLION -- the only weapon in the Terran table that hits a LINE. `line: true` already exists for the
  // Lurker and it is the one attack shape Terran did not have: everything in front of it, at once, out
  // to six tiles, ground only. That is a different thing from the firebat (two hits of splash at melee
  // range) and from the vulture (one target, five tiles), and it is what makes a hellion good into a
  // worker line and bad into four spaced-out goliaths. No gas, so it is the mineral dump the factory
  // never had.
  U('hellion', { name: 'Hellion', race: 'T', hp: 90, size: 'medium', min: 100, gas: 0, sup: 2, time: 420, speed: 7.2, sight: 8, r: 12, hk: 'H', from: 'factory', mech: true, cargoSize: 2, hover: true,
    // `fx: 'flame'` is FIXLIST-M14 C5. The `line` mechanic was always correct -- one Hellion into a
    // row of five hits all five, measured -- but the EFFECT was the Lurker's, because Combat's line
    // branch pushed { kind: 'spines' } for anything that carried the flag. A hover bike drawing
    // subterranean spines is why a working weapon was reported as broken. The look now comes off the
    // weapon, so two weapons can share a mechanic without sharing an appearance.
    gw: W(9, 'concussive', 5, 30, { line: true, upgKey: 'vehW', upgDmg: 2 }), upgA: 'vehA' });
  // CYCLONE -- one weapon that hits ground AND air, on the fastest chassis in the factory. The goliath
  // already exists and is the tanky escort with two separate guns and Charon Boosters; the cyclone is
  // the opposite trade -- half the armour, twice the speed, one gun for both targets, and it is the
  // only mech unit that can chase a mutalisk pack across the map rather than waiting for it to come
  // back. Requires the Machine Shop, so it sits on the tank branch rather than the armory branch and
  // does not simply replace the goliath in a build.
  //
  // `onMove` IS FIXLIST-M14 C4 (item 19), and it is a flag on the WEAPON rather than a Cyclone clause
  // in the combat loop -- so the next unit that needs it costs one field and not another branch. Every
  // other unit in the game plants itself the moment something walks into range; this one does not.
  //
  // DAMAGE, RANGE AND COOLDOWN ARE UNCHANGED, and that is the user's decision recorded in the fixlist:
  // firing on the move is a mobility change only, and any adjustment to what it costs belongs to the
  // gated balance run rather than to a guess made here.
  U('cyclone', { name: 'Cyclone', race: 'T', hp: 110, armor: 1, size: 'large', min: 125, gas: 50, sup: 3, time: 540, speed: 7.0, sight: 9, r: 13, hk: 'Y', from: 'factory', req: ['machine_shop'], mech: true, cargoSize: 4,
    gw: W(14, 'explosive', 6, 22, { targets: 'both', onMove: true, upgKey: 'vehW', upgDmg: 2 }), upgA: 'vehA' });
  // WIDOW MINE -- and the reason it is not a spider mine, since that was the brief's own question.
  // A spider mine is a MUNITION: three of them come free with a vulture, they cost no supply, they are
  // fire-and-forget, they hit ground only, and they die on the shot. A widow mine is a UNIT you train:
  // it costs supply, it SURVIVES its own shot and reloads on a 90-frame timer, it hits AIR as well as
  // ground, and it can be dug up and moved somewhere else. So the spider mine is a trap you spend and
  // the widow mine is a position you hold, which is a different decision even though the silhouette
  // under the ground is the same.
  //
  // It reuses the Lurker's mechanism exactly -- `burrowOnly` on the weapon, the `burrow` toggle, and
  // the Lurker's exemption from needing burrow_tech (widened in Abilities.available) -- because that
  // path is the one thing in this engine that is known to work for a dug-in attacker. It deliberately
  // does NOT carry `mine: true`: that flag routes the unit into Abilities.mineTick, which is the
  // suicide-charge behaviour and would take away everything above.
  //
  // ---- TIMINGS (FIXLIST-M14 A3) -------------------------------------------------------------------
  // Reported as "the widow mine burrow time should match StarCraft II", and until now it had NO timing
  // of its own at all: it shared the generic 24-frame burrow lockout with every Zerg unit and it could
  // fire the instant it went down. A mine that arms immediately is not a mine, it is a turret you can
  // pick up -- the whole decision the unit is meant to create is "did I get it planted in time".
  //
  // Three separate durations, and the middle one is the one that was missing:
  //   burrow    the animation going down. It cannot move and cannot fire.
  //   arm       dug in, still cannot fire. THIS is the window an opponent can walk a unit through and
  //             live, and it is what makes planting a mine a commitment rather than a reflex.
  //   unburrow  coming back up. It cannot fire and cannot move until it is out.
  //
  // Frames, at 24 a second ("Fastest"), rounded to the nearest whole frame from the StarCraft II
  // figure noted beside each. Drilling Claws shortens all three, which is the user's decision recorded
  // in FIXLIST-M14: "model the full SC2 arming delay as well as burrow and unburrow times, WITH THE
  // UPGRADE THAT SHORTENS IT". (SC2 has moved this upgrade's exact wording between expansions -- in
  // Heart of the Swarm it cut the arming time, in Legacy of the Void it is written as the unburrow
  // time. Shortening all three is the reading that matches the decision as it was given.)
  //
  // These are named constants and every test reads THEM, never the numbers. Attaching them to the def
  // rather than leaving them as bare module-level consts is deliberate: js/build.js hashes DATA but
  // not arbitrary globals, so a value that lived only in a `const` could be changed without moving the
  // build stamp, and two builds that disagree about how long a mine takes to arm would desync.
  const WM_BURROW = 26, WM_ARM = 26, WM_UNBURROW = 34;                //  1.07 s,  1.07 s,  1.43 s
  const WM_BURROW_D = 17, WM_ARM_D = 17, WM_UNBURROW_D = 17;          //  0.71 s each, with Drilling Claws
  U('widow_mine', { name: 'Widow Mine', race: 'T', hp: 90, size: 'small', min: 75, gas: 25, sup: 2, time: 420, speed: 4.4, sight: 7, r: 9, hk: 'W', from: 'factory', req: ['machine_shop'], mech: true, cargoSize: 2,
    dig: { burrow: WM_BURROW, arm: WM_ARM, unburrow: WM_UNBURROW, tech: 'drilling_claws',
      fast: { burrow: WM_BURROW_D, arm: WM_ARM_D, unburrow: WM_UNBURROW_D } },
    gw: W(40, 'explosive', 5, 90, { burrowOnly: true, targets: 'both', splash: [0.7, 1.2, 1.8], upgKey: 'vehW', upgDmg: 3 }), abil: ['burrow'], upgA: 'vehA' });
  // THOR -- six supply of walking artillery that shoots air. The siege tank out-ranges it and hits
  // harder, and cannot move or defend itself while it does; the goliath is a quarter of the price. The
  // Thor's reason to exist is that it is the only Terran unit whose GROUND attack splashes while it is
  // still mobile, so a mech army finally has something that punishes a clump without being told to sit
  // down first. Slow enough (3.2) that it decides where a fight happens long before the fight.
  U('thor', { name: 'Thor', race: 'T', hp: 400, armor: 2, size: 'large', min: 300, gas: 200, sup: 6, time: 1200, speed: 3.2, sight: 10, r: 20, hk: 'O', from: 'factory', req: ['armory', 'machine_shop'], mech: true,
    gw: W(30, 'explosive', 7, 45, { splash: [0.6, 1.0, 1.4], upgKey: 'vehW', upgDmg: 3 }),
    aw: W(12, 'explosive', 7, 22, { hits: 2, targets: 'air', splash: [0.4, 0.8, 1.2], upgKey: 'vehW', upgDmg: 1 }), upgA: 'vehA' });

  // ---- the starport line -------------------------------------------------------------------------
  // BANSHEE -- the wraith turned inside out. A wraith is an air-superiority fighter: 20 explosive into
  // air, 8 normal into ground. The banshee has NO air attack at all and hits ground twice as hard as
  // the wraith does, and it takes the same Cloaking Field from the same Control Tower -- so the
  // cloaked-harass decision becomes "which half of the sky do I give up", instead of "is the wraith
  // worth it". Reuses `cloak_wraith` verbatim; a second identical toggle would be a lie in the codex.
  U('banshee', { name: 'Banshee', race: 'T', hp: 140, size: 'large', min: 150, gas: 100, sup: 3, time: 900, speed: 5.6, sight: 8, r: 14, hk: 'A', from: 'starport', req: ['control_tower'], mech: true, fly: true, energy: 200,
    gw: W(12, 'explosive', 6, 15, { hits: 2, upgKey: 'shipW', upgDmg: 1 }), abil: ['cloak_wraith'], upgA: 'shipA' });
  // LIBERATOR -- air artillery, and the first weapon in the game with a MINIMUM range. `w.minRange` is
  // already honoured by Unit.inRange and nothing used it. Ten tiles of splash into ground, nothing
  // within three, and no air attack: it is a siege tank that can cross a cliff and cannot defend
  // itself at all. That is the whole unit -- it needs an escort, it decides sieges, and it is helpless
  // the moment a scourge or a corsair reaches it.
  U('liberator', { name: 'Liberator', race: 'T', hp: 180, armor: 1, size: 'large', min: 150, gas: 125, sup: 3, time: 960, speed: 4.6, sight: 11, r: 16, hk: 'I', from: 'starport', req: ['control_tower'], mech: true, fly: true,
    gw: W(45, 'explosive', 10, 60, { minRange: 3, splash: [0.5, 0.9, 1.3], upgKey: 'shipW', upgDmg: 3 }), upgA: 'shipA' });
  // VIKING -- two modes, two sprite sets, on the siege_tank / siege_tank_s precedent. It is TWO DEFS
  // rather than one def with a flag, and that is forced rather than chosen: Unit.weaponFor dispatches
  // on `this.def`, and the only way for one unit to have an air weapon in one mode and a ground weapon
  // in the other, with different movement, is for the def to change. The transform lives in
  // Abilities.instant ('viking_mode') and swaps def/maxHp/fly/r in place, exactly as siege_mode swaps
  // `sieged`, with the same `transT` lockout so it cannot be spammed.
  //
  // Fighter mode is what the Starport builds and is air-to-air only; assault mode walks and is
  // ground-only. Neither can do the other's job, which is the point: a Viking wing that has landed to
  // kill a tank line cannot answer a mutalisk flock until it takes off again. `sup` is 2 in both
  // modes -- G.recomputeSupply sums `def.sup` over the units, so a transform that changed it would
  // supply-block a player for pressing a button.
  U('viking', { name: 'Viking', race: 'T', hp: 125, armor: 0, size: 'large', min: 150, gas: 75, sup: 2, time: 660, speed: 6.4, sight: 10, r: 14, hk: 'K', from: 'starport', req: ['control_tower', 'armory'], mech: true, fly: true,
    aw: W(14, 'explosive', 7, 30, { hits: 2, targets: 'air', upgKey: 'shipW', upgDmg: 1 }), abil: ['viking_mode'], upgA: 'shipA' });
  // The landed half. `min`/`gas`/`time` are zero because it is a MODE and not a purchase -- the cost
  // was paid at the Starport -- and zero is spelled out rather than left undefined for the NaN reason
  // above. It keeps `upgA: 'shipA'` and `upgKey: 'shipW'`: it is the same airframe with its wings
  // folded, so it must not quietly change which upgrade line pays for it halfway through a battle.
  U('viking_a', { name: 'Viking (Assault)', race: 'T', hp: 125, armor: 0, size: 'large', min: 0, gas: 0, sup: 2, time: 0, speed: 4.4, sight: 9, r: 14, hk: 'K', from: 'viking', morphFrom: 'viking', req: ['control_tower', 'armory'], mech: true, cargoSize: 4,
    gw: W(18, 'normal', 6, 30, { upgKey: 'shipW', upgDmg: 2 }), abil: ['viking_mode'], upgA: 'shipA' });
  // MEDIVAC -- the dropship and the medic in one hull, and both halves are the EXISTING code paths
  // rather than new ones: `cargo: 8` is the dropship's, `heal` is the medic's ability, and the
  // autocast is Abilities.medicAuto, dispatched for the medivac from G.tickTerran (js/game.js) after the
  // projectile pass, not from Unit.tick's 'medic' line: the two run at different points in the frame, and
  // moving it would change results (REVIEW-M17 task 22).
  //
  // It does NOT make the dropship obsolete: a dropship is 100/100 for eight slots off a bare Control
  // Tower, the medivac is 100/100 off a Control Tower AND an Academy, is slower, and spends its energy
  // healing rather than existing. The decision is whether the drop is bio (heal on arrival) or mech
  // (nothing to heal, so pay less tech for the same eight slots).
  U('medivac', { name: 'Medivac', race: 'T', hp: 150, armor: 1, size: 'large', min: 100, gas: 100, sup: 2, time: 800, speed: 5.0, sight: 9, r: 16, hk: 'M', from: 'starport', req: ['control_tower', 'academy'], mech: true, fly: true, cargo: 8, energy: 200,
    abil: ['unload', 'heal'], upgA: 'shipA' });
  // RAVEN -- an electronic-warfare aircraft, NOT a second science vessel. The vessel keeps everything
  // it had (irradiate, EMP, defensive matrix) and stays the 100/225 late-game caster; the raven is
  // cheaper, arrives earlier, detects, and casts exactly one thing: Jamming Field.
  //
  // The field is a mobile, temporary Scrambler Mast -- it blinds and un-detects everything hostile
  // inside it. That is what makes it the escort for the cloak line this milestone just doubled
  // (banshee, wraith, ghost): a turret and a spore colony still SHOOT inside the field, they just
  // cannot see a cloaked unit while they are in it. See Abilities.tickFields for the reader.
  U('raven', { name: 'Raven', race: 'T', hp: 140, armor: 1, size: 'large', min: 100, gas: 150, sup: 2, time: 900, speed: 5.4, sight: 11, r: 14, hk: 'E', from: 'starport', req: ['control_tower', 'science_facility'], mech: true, fly: true, det: true, energy: 200,
    abil: ['jam_field'], upgA: 'shipA' });

  // ---- the MULE (M12 item 11: the Terran macro mechanic) -----------------------------------------
  // A temporary worker dropped by an Orbital Command. It is a real unit with a real lifetime rather
  // than a lump of minerals, because the whole point of a macro mechanic is that it rewards ATTENTION:
  // a MULE dropped on a saturated patch does less than one dropped on a fresh expansion, and one
  // dropped and forgotten while its patch runs dry does nothing at all.
  //
  // WHAT MAKES IT FAST is `Unit.muleHaul` (js/sim.js, run from G.tickTerran), not this table: it takes MULE_HAUL extra minerals out
  // of the patch on the same trip and carries them home, so it mines about four times an SCV's rate
  // AND strips the patch four times as fast. That second half is deliberate and is the interesting
  // part under M11's attrition economy -- a MULE is income borrowed from the end of the game.
  //
  // `worker: true` is required and is not cosmetic: Unit.tickGather, Unit.tickReturn, G.nearestDepot
  // and UI.smartCommand's right-click-a-patch branch all key on it. `lifetime` is read by Unit.tick,
  // which kills the unit when it reaches zero, so expiry needs no code of its own -- and cannot be
  // switched off, which is the property the test pins.
  U('mule', { name: 'MULE', race: 'T', hp: 60, size: 'small', min: 0, gas: 0, sup: 0, time: 0, speed: 6.5, sight: 8, r: 9, mech: true, worker: true, mule: true, lifetime: 1800, cargoSize: 1,
    abil: ['gather'] });

  // ============================ ZERG UNITS ============================
  U('larva', { name: 'Larva', race: 'Z', hp: 25, armor: 10, size: 'small', speed: 0.3, sight: 4, r: 6, bio: true, larva: true, abil: ['morph_menu'] });
  U('egg', { name: 'Egg', race: 'Z', hp: 200, armor: 10, size: 'medium', speed: 0, sight: 4, r: 10, bio: true, egg: true });
  U('lurker_egg', { name: 'Lurker Egg', race: 'Z', hp: 200, armor: 10, size: 'medium', speed: 0, sight: 4, r: 12, bio: true, egg: true });
  U('cocoon', { name: 'Cocoon', race: 'Z', hp: 200, armor: 10, size: 'medium', speed: 0, sight: 4, r: 12, bio: true, egg: true, fly: true });
  U('drone', { name: 'Drone', race: 'Z', hp: 40, size: 'small', min: 50, sup: 1, time: 300, speed: 4.92, sight: 7, r: 9, hk: 'D', from: 'larva', worker: true, bio: true, cargoSize: 1,
    gw: W(5, 'normal', 0.4, 22, { upgKey: null }), abil: ['gather', 'build_basic', 'build_adv', 'burrow'], upgA: 'carapace' });
  // `energy: 200` -- FIXLIST-M15 C1 (item 2). The Overlord was NOT AN ENERGY UNIT AT ALL: no `energy`,
  // no `maxEnergy`, no bar, and therefore a free and unlimited `plant_tumour`. One Overlord with money
  // in the bank planted THIRTY tumours back to back in the probe that opened C1, thirty of thirty.
  // Joining the pool is the whole fix and it needs nothing else: Unit's constructor reads `def.energy`
  // for the cap and starts every caster in the game at 50, and Unit.tick's ONE regen line (js/sim.js)
  // fills it at the shared rate. No second regen was written and none should be -- 200 at 0.03125 a
  // frame is 6,400 frames, the same four and a half minutes a Queen waits.
  //
  // THE SIDE EFFECT IS DELIBERATE AND IS A REAL BALANCE CHANGE: an Overlord with a pool is now a legal
  // Feedback and EMP target like any other caster, and Feedback does damage equal to the energy it
  // burns. A full Overlord is 200 energy against 200 hp. That is exactly SC2's rule for energy units,
  // so it is listed for the balance run rather than special-cased here.
  U('overlord', { name: 'Overlord', race: 'Z', hp: 200, size: 'large', min: 100, sup: 0, supGive: 8, time: 600, speed: 0.83, sight: 9, r: 18, hk: 'O', from: 'larva', bio: true, fly: true, det: true, energy: 200,
    abil: ['unload', 'plant_tumour', 'overseer_aspect'], upgA: 'flyA', speedTech: ['pneumatized', 2.5], cargoTech: ['ventral_sacs', 8], sightTech: ['antennae', 11] });   // cargoTech is [tech, slots] like speedTech: no cargo at all until Ventral Sacs. G.cargoCap is the one reader (REVIEW-M17 task 22)
  U('zergling', { name: 'Zergling', race: 'Z', hp: 35, size: 'small', min: 50, sup: 0.5, time: 420, speed: 5.49, sight: 5, r: 7, hk: 'Z', from: 'larva', req: ['spawning_pool'], bio: true, cargoSize: 1, pair: true,
    gw: W(5, 'normal', 0.5, 8, { upgKey: 'meleeW', cdTech: ['adrenal', 6] }), abil: ['burrow', 'baneling_aspect'], upgA: 'carapace', speedTech: ['metabolic', 6.58] });   // Brood War's own pair: 5.49 base, 6.58 boosted. The table had 2.61/5.49 -- the boosted value was BW's base, and the base was invented under it, leaving a zergling slower than a high templar.
  U('hydralisk', { name: 'Hydralisk', race: 'Z', hp: 80, size: 'medium', min: 75, gas: 25, sup: 1, time: 420, speed: 3.66, sight: 6, r: 10, hk: 'H', from: 'larva', req: ['hydralisk_den'], bio: true, cargoSize: 2,
    gw: W(10, 'explosive', 4, 15, { upgKey: 'missW', targets: 'both', rangeTech: ['grooved', 5] }), abil: ['burrow', 'lurker_aspect'], upgA: 'carapace', speedTech: ['muscular', 5.0] });
  U('lurker', { name: 'Lurker', race: 'Z', hp: 125, armor: 1, size: 'medium', min: 50, gas: 100, sup: 2, time: 600, speed: 5.82, sight: 8, r: 12, from: 'hydralisk', req: ['lurker_aspect'], bio: true, cargoSize: 2, morphFrom: 'hydralisk', hk: 'L',
    gw: W(20, 'normal', 6, 37, { upgKey: 'missW', upgDmg: 2, line: true, burrowOnly: true }), abil: ['burrow'], upgA: 'carapace' });
  U('mutalisk', { name: 'Mutalisk', race: 'Z', hp: 120, size: 'medium', min: 100, gas: 100, sup: 2, time: 600, speed: 6.67, sight: 7, r: 12, hk: 'M', from: 'larva', req: ['spire'], bio: true, fly: true,
    gw: W(9, 'normal', 3, 30, { upgKey: 'flyW', targets: 'both', glaive: true }), abil: ['guardian_aspect', 'devourer_aspect', 'viper_aspect'], upgA: 'flyA' });
  U('scourge', { name: 'Scourge', race: 'Z', hp: 25, size: 'small', min: 25, gas: 75, sup: 0.5, time: 450, speed: 6.67, sight: 5, r: 8, hk: 'S', from: 'larva', req: ['spire'], bio: true, fly: true, pair: true,
    aw: W(110, 'normal', 0.3, 1, { targets: 'air', suicide: true, upgKey: null }), upgA: 'flyA' });
  // `larva_inject` goes FIRST and `infest` stays LAST, and the order is the whole of the decision.
  // UI.buildCard flows a mobile unit's abilities from slot 5 and stops at `if (i > 8) break`, so a
  // unit shows at most FOUR abilities. A Queen with both of its researches finished already has four.
  // Inject is M12 item 11 -- the macro mechanic the whole race's production rate now runs through --
  // so it takes the first slot, and the ability that falls off the end is `infest`, which HANDOFF.md
  // describes as "niche, and the only reason it is here is that every ability should mean every one".
  // It is not lost: the Infestor carries it too, and an Infestor infesting a command centre is a
  // better home for it than a Queen was.
  //
  // `plant_tumour` GOES SECOND -- FIXLIST-M14 C3 (item 5). The report was "how are creep tumours made,
  // from our Queen unit? this is how it should be", and it is right that it should be: in StarCraft II
  // the Queen's whole kit is Spawn Larva, Transfuse and Creep Tumour. What the report had wrong is
  // where they came from: not the Queen and not nowhere, but the OVERLORD, which has had
  // `plant_tumour` since M12 and KEEPS IT. The user's decision was two sources on purpose, so this is
  // an addition and nothing is taken away.
  //
  // Second, immediately behind larva_inject, because the two are the same kind of thing -- the macro
  // pair the race's production and its map control run through -- and the ordering rule above is that
  // the card's order is an argument about what a Queen is for. It does NOT push anything off the end:
  // UI.buildCard's ability cap was raised from four to six in the same change, which is where it
  // should have gone when the command card grew from 3x3 to 4x3 and did not.
  //
  // IT NOW COSTS 25 ENERGY, and that reverses the note that stood here through M14. The old reasoning
  // was sound on its own terms -- the ability is shared with the Overlord, the Overlord had no energy
  // at all, so pricing the ability would have silently disarmed one of its two sources -- but it was
  // reasoning from a missing pool rather than from what the ability is worth. FIXLIST-M15 C1 gave the
  // Overlord the 200-point pool it never had, so the premise is gone and SC2's own price applies to
  // both casters. 25 is SC2's number for Creep Tumour and it is charged ON TOP of the tumour's own
  // 25 minerals, not instead of it: the mineral cost bounds how much creep you can afford and the
  // energy cost bounds how FAST you can lay it, which is the half that was missing.
  U('queen', { name: 'Queen', race: 'Z', hp: 120, size: 'medium', min: 100, gas: 100, sup: 2, time: 750, speed: 6.67, sight: 10, r: 14, hk: 'Q', from: 'larva', req: ['queens_nest'], bio: true, fly: true, energy: 200,
    abil: ['larva_inject', 'plant_tumour', 'parasite', 'ensnare', 'spawn_broodling', 'infest'], upgA: 'flyA' });
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

  // ---------------------------------------------------------------------------------------------
  // M12 wave four: the Zerg ten. Each one had to earn a place beside zergling, hydralisk, lurker,
  // mutalisk, scourge, queen, guardian, devourer, ultralisk and defiler, and where the obvious SC2
  // shape would have been a near-clone of one of those the ROLE was changed rather than the name.
  // The reasoning is per def below; the two that changed most are the Baneling and the Overseer.
  //
  // TWO LINEAGES, NOT ONE FLAT LIST. Everything here hangs off something that already exists:
  // roach -> ravager (break a siege line) and roach -> swarm host (be one), mutalisk -> viper beside
  // guardian and devourer, zergling -> baneling, overlord -> overseer. That is deliberate. A larva
  // card with fifteen entries is a menu; a card with eleven and four aspects is a set of decisions
  // about units you already own -- and it is also the only way this fits, because UI.paginate gives
  // the larva card twelve flowed slots and Set Rally takes one of them.
  //
  // The Roach is the armoured line, and the point of it is that it is NOT a hydralisk. A hydralisk
  // is 80 hit points for one supply, shoots air, does explosive damage (so it is bad into small) and
  // its whole future is the Lurker. The Roach is 145 hit points for two, cannot shoot air at all,
  // does NORMAL damage (so it is the one Zerg ranged unit that is not punished for shooting
  // marines and zealots), and its future is a choice between two morphs. Hydralisks are what Zerg
  // shoots WITH; roaches are what Zerg stands BEHIND.
  U('roach', { name: 'Roach', race: 'Z', hp: 145, armor: 1, size: 'medium', min: 75, gas: 25, sup: 2, time: 480, speed: 4.2, sight: 8, r: 11, hk: 'C', from: 'larva', req: ['roach_warren'], bio: true, cargoSize: 2,
    gw: W(16, 'normal', 4, 22, { upgKey: 'missW', upgDmg: 2 }), abil: ['burrow', 'ravager_aspect', 'swarm_host_aspect'], upgA: 'carapace', speedTech: ['glial_reconstitution', 5.4] });
  // The Ravager exists because Zerg has no answer to a thing that does not move. A siege line, a row
  // of sunken colonies, a bunker, a wall: everything Zerg owns has to walk into range of it first.
  // Corrosive Bile is the only Zerg ability that attacks a PLACE -- it lands after a visible delay, so
  // it is dodgeable by anything with legs and undodgeable by anything without them, and it goes
  // through Combat.splash, which means it also breaks the destructible map features a defender is
  // hiding behind. It is not a Guardian: a guardian is an air unit with a long auto-attack that dies
  // to any anti-air, and it never opens a hole in terrain.
  U('ravager', { name: 'Ravager', race: 'Z', hp: 190, armor: 1, size: 'large', min: 25, gas: 75, sup: 3, time: 540, speed: 4.2, sight: 9, r: 14, hk: 'R', from: 'roach', req: ['ravager_aspect'], morphFrom: 'roach', bio: true, cargoSize: 4, energy: 100,
    gw: W(18, 'normal', 6, 30, { upgKey: 'missW', upgDmg: 2 }), abil: ['burrow', 'corrosive_bile'], upgA: 'carapace' });
  // THE BANELING IS NOT A `suicide: true` WEAPON, AND THAT IS THE DESIGN, NOT A COMPROMISE.
  //
  // Scourge and Infested Terran both carry `suicide: true` and both are fire-and-forget: you point
  // them at something and the unit spends itself the instant it arrives, on whatever it arrived at.
  // A third unit built the same way would be a third of the same unit. What a Baneling is FOR is the
  // moment of detonation -- rolling one into a clump and choosing when it goes off is the whole
  // decision -- so the blast is an ability the player presses (`volatile_burst`) and the walking-around
  // state is a real, cheap, repeatable acid spit. Concussive, so it is good into small things and
  // poor into large ones, which is exactly the shape of what banelings are meant to eat.
  //
  // There is a second, load-bearing reason and it is worth writing down rather than discovering:
  // test/rates.js measures EVERY weapon in DATA.units in both order paths and asserts at least three
  // shots. A `suicide` weapon fires once and kills its owner, which is why `NO_RATE` in that file
  // lists spider_mine, scourge and infested_terran by id. A fourth suicide weapon would have to be
  // added to that list, and test/rates.js is not this change's to edit.
  U('baneling', { name: 'Baneling', race: 'Z', hp: 35, armor: 0, size: 'small', min: 25, gas: 25, sup: 0.5, time: 300, speed: 5.49, sight: 5, r: 8, hk: 'B', from: 'zergling', req: ['volatile_bile'], morphFrom: 'zergling', bio: true, cargoSize: 1,
    gw: W(8, 'concussive', 1.5, 26, { upgKey: 'meleeW' }), abil: ['burrow', 'volatile_burst'], upgA: 'carapace', speedTech: ['metabolic', 6.58] });
  // The Swarm Host has no weapon of its own, on purpose: it is a siege engine that pays in TIME
  // rather than in supply. Locusts are free, arrive in waves, and expire whether or not they killed
  // anything, so a swarm host trades map presence for attrition against a position -- the pressure a
  // Zerg army cannot otherwise apply without walking into it. Not a Lurker: a lurker holds ground it
  // is standing on, a swarm host attacks ground it is nowhere near.
  U('swarm_host', { name: 'Swarm Host', race: 'Z', hp: 160, armor: 1, size: 'medium', min: 50, gas: 100, sup: 3, time: 600, speed: 3.4, sight: 9, r: 13, hk: 'W', from: 'roach', req: ['infestation_pit'], morphFrom: 'roach', bio: true, cargoSize: 4, energy: 200,
    abil: ['burrow', 'spawn_locusts'], upgA: 'carapace' });
  // Free, short-lived, and upgraded by nothing (`upgKey: null` and no `upgA`) so that a swarm host
  // parked behind three carapace upgrades is not quietly a better swarm host. min/gas/sup spelled out
  // because a locust never passes through a cost calculation and `undefined * n` is NaN -- the exact
  // shape of the spider-mine repair bug this repository already paid for once.
  U('locust', { name: 'Locust', race: 'Z', hp: 50, armor: 0, size: 'small', min: 0, gas: 0, sup: 0, speed: 5.6, sight: 5, r: 7, bio: true, lifetime: 480,
    gw: W(10, 'normal', 3, 18, { upgKey: null }) });
  // The Viper is the only unit in this game that moves an enemy. Ensnare slows, Maelstrom freezes,
  // Stasis removes, Dark Swarm blinds -- every existing control spell acts on a unit where it stands.
  // Abduct takes a siege tank out of its line, a high templar out of its army, a reaver off its
  // shuttle, and puts it where you are. That is why it morphs off a mutalisk rather than a larva: the
  // spire lineage is guardian (hit ground), devourer (hit air) and viper (decide who is in the fight).
  U('viper', { name: 'Viper', race: 'Z', hp: 150, armor: 1, size: 'large', min: 100, gas: 200, sup: 3, time: 750, speed: 5.4, sight: 10, r: 14, hk: 'B', from: 'mutalisk', req: ['infestation_pit', 'hive'], morphFrom: 'mutalisk', bio: true, fly: true, energy: 200,
    abil: ['abduct', 'consume_essence'], upgA: 'flyA' });
  // Defiler versus Infestor, because they are the two that could most easily have been one unit. The
  // defiler PROTECTS and ATTRITS: dark swarm makes your army unshootable, plague takes a bar down and
  // leaves it. The infestor DENIES and REPLACES: fungal growth stops a fight happening at all for four
  // seconds, and spawn infested puts bodies on ground you do not hold. It also carries `infest`, which
  // is a better home for that ability than the Queen -- see the Queen's `abil` list for why it moved.
  U('infestor', { name: 'Infestor', race: 'Z', hp: 90, armor: 1, size: 'medium', min: 100, gas: 125, sup: 2, time: 600, speed: 4, sight: 9, r: 12, hk: 'I', from: 'larva', req: ['infestation_pit'], bio: true, cargoSize: 2, energy: 200,
    abil: ['fungal_growth', 'spawn_infested', 'infest', 'burrow'], upgA: 'carapace' });
  // AN OVERSEER IN THIS GAME CANNOT BE "THE OVERLORD THAT DETECTS", BECAUSE THIS GAME'S OVERLORD
  // ALREADY DETECTS. So it is the swarm's saboteur instead. Contaminate shuts a building down --
  // no production, no research, no larva, no creep growth -- without killing it, which is a thing no
  // other unit of any race can do, and it is the reason to fly one INTO a base rather than over it.
  // The price is real and is the point: `supGive` is absent, so morphing an overlord costs eight
  // supply. You are spending your food to blind and gag somebody else's.
  U('overseer', { name: 'Overseer', race: 'Z', hp: 200, armor: 1, size: 'large', min: 50, gas: 50, sup: 0, time: 300, speed: 3.2, sight: 11, r: 18, hk: 'O', from: 'overlord', req: ['lair'], morphFrom: 'overlord', bio: true, fly: true, det: true, energy: 200,
    abil: ['contaminate'], upgA: 'flyA' });
  // The ground morph egg. G.morphUnit picks `lurker_egg` for a Lurker and the FLYING `cocoon` for
  // everything else, which was right while every other morph was a mutalisk; a baneling in a cocoon
  // would drift off the ground and take anti-air fire. Abilities.morph swaps this in for a morph whose
  // product walks. It is not `lurker_egg` because the selection panel prints the def's name and
  // "Lurker Egg" over a morphing roach is a small lie told forever.
  U('brood_cocoon', { name: 'Brood Cocoon', race: 'Z', hp: 200, armor: 10, size: 'medium', min: 0, gas: 0, speed: 0, sight: 4, r: 12, bio: true, egg: true });

  // ============================ PROTOSS UNITS ============================
  U('probe', { name: 'Probe', race: 'P', hp: 20, sh: 20, size: 'small', min: 50, sup: 1, time: 300, speed: 4.92, sight: 8, r: 8, hk: 'P', from: 'nexus', worker: true, mech: true, cargoSize: 1, hover: true,
    gw: W(5, 'normal', 0.4, 22, { upgKey: null }), abil: ['gather', 'build_basic', 'build_adv'], upgA: 'gA' });
  U('zealot', { name: 'Zealot', race: 'P', hp: 100, sh: 60, armor: 1, size: 'small', min: 100, sup: 2, time: 600, speed: 4, sight: 7, r: 9, hk: 'Z', from: 'gateway', bio: true, cargoSize: 2,
    gw: W(8, 'normal', 0.4, 22, { hits: 2, upgKey: 'gW' }), upgA: 'gA', speedTech: ['leg_enhancements', 6.4] });
  // M12 wave four: THE DRAGOON IS THE STALKER. Blink lives here rather than on a second def -- see the
  // Protoss block further down this file for the argument. Everything else about the unit is unchanged,
  // deliberately: the fold must not also be a buff, or a balance run could not tell the two apart.
  U('dragoon', { name: 'Dragoon', race: 'P', hp: 100, sh: 80, armor: 1, size: 'large', min: 125, gas: 50, sup: 2, time: 750, speed: 5, sight: 8, r: 14, hk: 'D', from: 'gateway', req: ['cybernetics_core'], mech: true, cargoSize: 4,
    gw: W(20, 'explosive', 4, 30, { upgKey: 'gW', upgDmg: 2, targets: 'both', rangeTech: ['singularity', 6] }), abil: ['blink'], upgA: 'gA' });
  U('high_templar', { name: 'High Templar', race: 'P', hp: 40, sh: 40, size: 'small', min: 50, gas: 150, sup: 2, time: 750, speed: 3.2, sight: 7, r: 8, hk: 'T', from: 'gateway', req: ['templar_archives'], bio: true, cargoSize: 2, energy: 200,
    abil: ['psi_storm', 'hallucination', 'summon_archon'], upgA: 'gA' });
  U('dark_templar', { name: 'Dark Templar', race: 'P', hp: 80, sh: 40, armor: 1, size: 'small', min: 125, gas: 100, sup: 2, time: 750, speed: 4.92, sight: 7, r: 8, hk: 'K', from: 'gateway', req: ['templar_archives'], bio: true, cargoSize: 2, cloaked: true, permaCloak: true,
    gw: W(40, 'normal', 0.4, 30, { upgKey: 'gW', upgDmg: 3 }), abil: ['summon_dark_archon'], upgA: 'gA' });
  // `min: 0` on both, added with the Mothership in M12. All three are MERGED rather than bought, and a
  // merged def is exactly the one somebody leaves blank -- U() defaults `gas` and does not default
  // `min`, so these two carried an undefined mineral cost from the day they were written. Nothing has
  // read it yet (G.mergeUnits charges nothing and neither is ever in a production queue), which is
  // precisely how the spider mine's undefined build time survived until the AI was taught to repair.
  // Zero costs nothing to spell out and cannot become NaN.
  U('archon', { name: 'Archon', race: 'P', hp: 10, sh: 350, size: 'large', min: 0, gas: 0, sup: 4, time: 300, speed: 4.92, sight: 8, r: 16, bio: true, cargoSize: 4, hover: true, name2: 'Archon',
    gw: W(30, 'normal', 2, 20, { upgKey: 'gW', upgDmg: 3, targets: 'both', splash: [0.5, 1, 1.5] }), upgA: 'gA' });
  U('dark_archon', { name: 'Dark Archon', race: 'P', hp: 25, sh: 200, armor: 1, size: 'large', min: 0, gas: 0, sup: 4, time: 300, speed: 4.92, sight: 10, r: 16, bio: true, cargoSize: 4, energy: 200, hover: true,
    abil: ['feedback', 'mind_control', 'maelstrom'], upgA: 'gA' });
  U('reaver', { name: 'Reaver', race: 'P', hp: 100, sh: 80, size: 'large', min: 200, gas: 100, sup: 4, time: 1050, speed: 1.78, sight: 10, r: 18, hk: 'V', from: 'robotics_facility', req: ['robotics_support_bay'], mech: true, cargoSize: 4,
    gw: W(100, 'normal', 8, 60, { upgKey: null, scarab: true, splash: [0.6, 1.2, 1.8], dmgTech: ['scarab_damage', 25] }), abil: ['build_scarab'], upgA: 'gA', scarabs: 0, scarabCap: 5, scarabTech: ['reaver_capacity', 10] });   // the hangar: empty at birth, scarabCap deep, scarabTech[1] deep once scarabTech[0] is researched. G.hangarCap (js/game.js) is the one reader (REVIEW-M17 task 22)
  U('shuttle', { name: 'Shuttle', race: 'P', hp: 80, sh: 60, armor: 1, size: 'large', min: 200, sup: 2, time: 900, speed: 4.44, sight: 8, r: 16, hk: 'S', from: 'robotics_facility', mech: true, fly: true, cargo: 8,
    abil: ['unload'], upgA: 'airA', speedTech: ['gravitic_drive', 6.67] });
  U('observer', { name: 'Observer', race: 'P', hp: 40, sh: 20, size: 'small', min: 25, gas: 75, sup: 1, time: 600, speed: 3.33, sight: 9, r: 8, hk: 'O', from: 'robotics_facility', req: ['observatory'], mech: true, fly: true, det: true, cloaked: true, permaCloak: true,
    upgA: 'airA', speedTech: ['gravitic_boosters', 5], sightTech: ['sensor_array', 11] });
  U('scout', { name: 'Scout', race: 'P', hp: 150, sh: 100, size: 'large', min: 275, gas: 125, sup: 3, time: 1200, speed: 6.67, sight: 8, r: 14, hk: 'S', from: 'stargate', mech: true, fly: true,
    gw: W(8, 'normal', 4, 30, { upgKey: 'airW' }), aw: W(14, 'explosive', 4, 22, { hits: 2, upgKey: 'airW', targets: 'air' }), upgA: 'airA', speedTech: ['gravitic_thrusters', 8], sightTech: ['apial_sensors', 10] });
  U('corsair', { name: 'Corsair', race: 'P', hp: 100, sh: 80, armor: 1, size: 'medium', min: 150, gas: 100, sup: 2, time: 600, speed: 6.67, sight: 9, r: 14, hk: 'O', from: 'stargate', mech: true, fly: true, energy: 200,
    aw: W(5, 'explosive', 5, 8, { upgKey: 'airW', targets: 'air', splash: [0.6, 1, 1.4] }), abil: ['disruption_web'], upgA: 'airA' });
  U('carrier', { name: 'Carrier', race: 'P', hp: 300, sh: 150, armor: 4, size: 'large', min: 350, gas: 250, sup: 6, time: 2100, speed: 3.33, sight: 11, r: 22, hk: 'C', from: 'stargate', req: ['fleet_beacon'], mech: true, fly: true,
    gw: W(6, 'normal', 8, 37, { upgKey: 'airW', targets: 'both', interceptor: true }), abil: ['build_interceptor'], upgA: 'airA', interceptors: 0, interceptorCap: 4, interceptorTech: ['carrier_capacity', 8] });   // the Carrier's hangar, read the same way as the Reaver's: G.hangarCap
  U('arbiter', { name: 'Arbiter', race: 'P', hp: 200, sh: 150, armor: 1, size: 'large', min: 100, gas: 350, sup: 4, time: 2400, speed: 5, sight: 9, r: 18, hk: 'A', from: 'stargate', req: ['arbiter_tribunal'], mech: true, fly: true, energy: 200, cloakField: 8,
    gw: W(10, 'explosive', 5, 45, { upgKey: 'airW', targets: 'both' }), abil: ['recall', 'stasis_field', 'summon_mothership'], upgA: 'airA' });
  U('interceptor', { name: 'Interceptor', race: 'P', hp: 40, sh: 40, size: 'small', min: 25, time: 300, speed: 13, sight: 6, r: 5, mech: true, fly: true, hk: 'I', from: 'carrier', notUnit: true, gw: W(6, 'normal', 2, 45, { upgKey: 'airW', targets: 'both' }), upgA: 'airA' });
  U('scarab', { name: 'Scarab', race: 'P', hp: 20, size: 'small', min: 15, time: 168, speed: 12, r: 4, hk: 'S', from: 'reaver', notUnit: true, sight: 3 });
  U('hallucination', { name: 'Hallucination', race: 'P', hp: 1, size: 'small', speed: 4, sight: 7, r: 8, notUnit: true });

  // ===================== PROTOSS UNITS, M12 WAVE FOUR =====================
  // Ten units, and the shortest way to describe the set is by what is NOT here.
  //
  // THERE IS NO STALKER. DESIGN-M12 lists twelve Protoss items and the Stalker is one of them; it is
  // shipped as Blink on the DRAGOON instead of as a def of its own. A Stalker beside a Dragoon is two
  // ranged, mechanical, 125/50-ish gateway units with an explosive attack and four supply between
  // them -- the same role, the same production building, the same counter, and the player would pick
  // whichever number was larger. The interesting half of a Stalker is Blink, and Blink on the unit
  // that already fills the role is the whole item with none of the duplication. test/protoss12.js
  // pins the decision in both directions so that a later change cannot quietly turn it back into a
  // clone: no `stalker` def, and `blink` on the Dragoon's `abil`.
  //
  // THE SHUTTLE SURVIVES. The Warp Prism is not a rename of it: it is 50 more minerals for the same
  // eight cargo slots plus `psi`, which is the whole of item 12's mobile half. So the decision is
  // "ferry, or ferry that carries the warp field with it", which is a decision -- where a straight
  // replacement would have deleted a Brood War unit to add an SC2 one, which this milestone's rule
  // (take the ergonomics, take the mechanics only where they add a decision) says not to do.
  //
  // WHERE THEY SIT is chosen so no producer's card overflows and no hotkey collides: five on the
  // Gateway (one new), seven on the Robotics Facility (four new), eight on the Stargate (four new).
  // The card is twelve slots since M12 wave one, and the Stargate at eight units plus a research plus
  // Set Rally is the fullest of the three at ten. test/protoss12.js checks all of them for duplicate
  // keys, whole cards rather than only the newcomers, because a collision is a property of the card.

  // ---- the Gateway line ---------------------------------------------------------------------------
  // THE SENTRY is the first Protoss unit that is worth more for what it does to the ground than for
  // what it shoots. Its gun is deliberately feeble -- 6 damage at 5 range is a third of a dragoon's --
  // because everything it is for is in the two abilities: Guardian Shield, which is a bubble of
  // absorbed damage over the army it walks with, and Force Field, which is TERRAIN. Nothing else in
  // this game lets a player put a wall down in the middle of a fight, and that is the reason the unit
  // exists rather than a fourth Gateway body.
  U('sentry', { name: 'Sentry', race: 'P', hp: 40, sh: 40, armor: 1, size: 'small', min: 50, gas: 100, sup: 2, time: 550, speed: 4.4, sight: 9, r: 9, hk: 'E', from: 'gateway', req: ['cybernetics_core'], mech: true, cargoSize: 2, energy: 200,
    gw: W(6, 'normal', 5, 12, { upgKey: 'gW', targets: 'both' }), abil: ['guardian_shield', 'force_field'], upgA: 'gA' });

  // ---- the Robotics line --------------------------------------------------------------------------
  // THE IMMORTAL is explosive damage off a Robotics Facility, which is a hole Protoss has always had:
  // every other explosive weapon it owns is a dragoon or a ship. 30 explosive at 5 range into `large`
  // targets means it is the answer to a siege line and to an ultralisk, and the concussive/explosive
  // table (DMG_MULT) means it is a poor answer to marines and zerglings -- which is the point, and is
  // why it does not simply replace the dragoon at twice the price.
  U('immortal', { name: 'Immortal', race: 'P', hp: 200, sh: 100, armor: 1, size: 'large', min: 250, gas: 100, sup: 4, time: 900, speed: 4.4, sight: 9, r: 15, hk: 'I', from: 'robotics_facility', mech: true, cargoSize: 4,
    gw: W(30, 'explosive', 5, 30, { upgKey: 'gW', upgDmg: 3 }), upgA: 'gA' });
  // THE COLOSSUS WALKS OVER CLIFFS, and `fly: true` is the only lever this engine has that says so.
  // That is a trade rather than a free win and it is worth spelling out, because the def looks odd:
  // `fly` also means Unit.weaponFor hands a plain ground unit NOTHING against it, so a colossus is
  // untouchable by marines and zealots and dies instantly to anything with an air weapon. In SC2 it
  // is hit by both. Getting that here would need a third targeting class in js/sim.js, which this
  // change does not own -- and of the two half-versions available, "crosses terrain, needs an escort
  // against air" is the one that keeps the unit's identity. It keeps `gW`/`gA` rather than the air
  // lines because it is a walker that happens to step over things, not an aircraft.
  U('colossus', { name: 'Colossus', race: 'P', hp: 200, sh: 150, armor: 1, size: 'large', min: 300, gas: 200, sup: 6, time: 1350, speed: 4.0, sight: 11, r: 20, hk: 'C', from: 'robotics_facility', req: ['robotics_support_bay'], mech: true, fly: true,
    gw: W(15, 'normal', 7, 22, { hits: 2, upgKey: 'gW', upgDmg: 2, splash: [0.4, 0.8, 1.2] }), upgA: 'gA' });
  // THE DISRUPTOR HAS NO WEAPON AT ALL, which makes it the only army unit in the game that cannot
  // shoot. Everything it is worth is Purification Nova, and the nova is a FUSE: it arms, it sits
  // there for two seconds in plain sight, and then it hits everything -- including the caster's own
  // army, exactly as Psionic Storm does. A disruptor caught alone is 150/150 of nothing.
  U('disruptor', { name: 'Disruptor', race: 'P', hp: 100, sh: 100, armor: 1, size: 'large', min: 150, gas: 150, sup: 3, time: 900, speed: 4.4, sight: 9, r: 14, hk: 'D', from: 'robotics_facility', req: ['robotics_support_bay'], mech: true, cargoSize: 4, energy: 200,
    abil: ['purification_nova'], upgA: 'gA' });
  // THE WARP PRISM is a Pylon that flies, and `psi` on a mobile def is the whole feature -- it is what
  // makes item 12's warp-in mobile instead of a thing you do at home. Its field is 4 against a Pylon's
  // 6.5, so a prism projects a real but small pocket of ground you can warp on to, and it is a 100/100
  // hull with no weapon holding it up. GameMap.recomputePsi paints it from its pixel position rather
  // than a building's `tx`; Abilities.tickProtoss is what notices it has moved, every twelve frames.
  U('warp_prism', { name: 'Warp Prism', race: 'P', hp: 100, sh: 100, armor: 1, size: 'large', min: 250, gas: 0, sup: 2, time: 900, speed: 4.44, sight: 9, r: 16, hk: 'W', from: 'robotics_facility', mech: true, fly: true, cargo: 8, psi: 4,
    abil: ['unload'], upgA: 'airA', speedTech: ['gravitic_drive', 6.67] });

  // ---- the Stargate line --------------------------------------------------------------------------
  // THE PHOENIX is air-superiority only -- no ground attack whatever -- against the Scout, which has
  // both and is worse at each. What it has instead is Graviton Beam: it picks a GROUND unit up and
  // holds it out of the fight, which is the only way Protoss can remove a siege tank or a lurker from
  // a line without killing it first. Fast enough (7.5) to arrive, thin enough (120/60) to die to a
  // turret it did not see.
  U('phoenix', { name: 'Phoenix', race: 'P', hp: 120, sh: 60, size: 'medium', min: 150, gas: 100, sup: 2, time: 600, speed: 7.5, sight: 10, r: 12, hk: 'X', from: 'stargate', mech: true, fly: true, energy: 200,
    aw: W(10, 'normal', 5, 15, { hits: 2, upgKey: 'airW', targets: 'air' }), abil: ['graviton_beam'], upgA: 'airA' });
  // THE ORACLE is the mirror of that: ground only, short range, and a hard-hitting beam for its price.
  // Revelation is a Comsat scan cast from a ship, which is deliberately NOT detection -- it reveals
  // ground, it does not un-cloak. Protoss keeps the Observer for that, and this is what a harasser
  // uses to find out whether the base it is about to dive is defended.
  U('oracle', { name: 'Oracle', race: 'P', hp: 100, sh: 60, size: 'medium', min: 150, gas: 150, sup: 3, time: 750, speed: 7.0, sight: 10, r: 13, hk: 'E', from: 'stargate', mech: true, fly: true, energy: 200,
    gw: W(15, 'normal', 4, 12, { upgKey: 'airW' }), abil: ['revelation'], upgA: 'airA' });
  // THE VOID RAY hits both and hits hard and slowly, which is what makes it the anti-armour ship: one
  // heavy beam every second is wasted on a scourge and is exactly right against a battlecruiser or a
  // building. It is the Stargate's line-holder, where the Corsair is its skirmisher.
  U('void_ray', { name: 'Void Ray', race: 'P', hp: 150, sh: 100, size: 'large', min: 250, gas: 150, sup: 4, time: 1000, speed: 4.4, sight: 10, r: 14, hk: 'V', from: 'stargate', mech: true, fly: true,
    gw: W(20, 'normal', 6, 24, { upgKey: 'airW', targets: 'both' }), upgA: 'airA' });
  // THE TEMPEST out-ranges everything on the map except a sieged tank, and pays for it in every other
  // way: 3.0 speed is the slowest thing that flies, and a 55-frame cooldown means it contributes about
  // as much damage per second as a dragoon. It exists to shoot things that cannot shoot back -- a
  // siege line, a colony, a turret -- and to be useless the moment anything reaches it.
  U('tempest', { name: 'Tempest', race: 'P', hp: 200, sh: 150, armor: 2, size: 'large', min: 300, gas: 200, sup: 4, time: 1400, speed: 3.0, sight: 12, r: 18, hk: 'T', from: 'stargate', req: ['fleet_beacon'], mech: true, fly: true,
    gw: W(35, 'explosive', 10, 55, { upgKey: 'airW', upgDmg: 3, targets: 'both' }), upgA: 'airA' });

  // ---- and the one nothing builds -----------------------------------------------------------------
  // THE MOTHERSHIP has no `from`, no build time and no price, because it is MADE OF TWO ARBITERS --
  // the archon merge, applied to the most expensive unit Protoss owns. That is the whole design of it:
  // you cannot have a Mothership and the two Arbiters, so the 200/700 it costs is paid in a capability
  // you already had. Deliberately NOT a bigger Arbiter: no Recall, no Stasis Field and no cloak field,
  // because a strictly-better Arbiter would make the Arbiter dead data the moment the Beacon is up.
  // What it has instead is Time Warp and detection, neither of which an Arbiter has.
  //
  // `min: 0, gas: 0, time: 0` are spelled out rather than left off. Nothing charges them -- G.mergeUnits
  // takes no money -- but `undefined * n` is NaN and this repository has lost an afternoon to exactly
  // that twice, and a def that is never purchased is precisely the one somebody leaves blank.
  U('mothership', { name: 'Mothership', race: 'P', hp: 350, sh: 350, armor: 2, size: 'large', min: 0, gas: 0, sup: 6, time: 0, speed: 3.0, sight: 14, r: 26, req: ['fleet_beacon'], mech: true, fly: true, det: true, energy: 200,
    gw: W(20, 'normal', 7, 30, { hits: 2, upgKey: 'airW', upgDmg: 2, targets: 'both' }), abil: ['time_warp'], upgA: 'airA' });

  // ============================ THE FOURTH RACE: race 'N' ============================
  // Everything below this line belongs to NOBODY. Neutral life (wave two, item 1) and capturable
  // derelicts (item 8) both need a third owner that is neither a player nor an ally, and they share
  // one mechanism: `race: 'N'`.
  //
  // WHY THE RACE LETTER AND NOT A FLAG. Every reachability closure, every build page, every command
  // card and every codex list in this repository is already keyed on the literal set ['T','Z','P'] --
  // test/techtree.js walks it three times, test/newbuildings.js walks it three times, Codex.list
  // filters `src[id].race === race`, and DATA.buildMenu has exactly three keys. A def whose race is
  // 'N' is therefore invisible to all of them by construction rather than by an exception written
  // into each. That is the difference between "excluded" and "excluded so far": adding a fourth
  // neutral def later needs no test to be taught about it.
  //
  // RACE_INFO.N exists for the same reason (see below): js/codex.js reads RACE_INFO[d.race].name for
  // whatever unit it is asked to draw, and test/codex.js asks it for every entry in DATA.units.
  //
  // THREE FLAGS, EACH SAYING ONE THING, and test/neutrals.js pins all three:
  //   neutral: true       no player owns this. It is placed by the map generator, it belongs to the
  //                       neutral player, and it must never appear in DATA.buildMenu, AI_COMP or an
  //                       AI build script
  //   unlocked: <id>      the opposite: a PLAYER owns this, but the only way to get it is to capture
  //                       the named derelict. Not neutral, and still not in any tech tree
  //   wake / nest /       the behaviour blocks, documented above the defs that carry them
  //   derelict
  //
  // ---------------------------------------------------------------------------------------------
  // NEUTRAL LIFE. Creatures living on the map that wake when you build or mine near them.
  //
  // THE POINT OF THE FEATURE IS THE TELL, NOT THE AMBUSH. A creature that surfaces out of nowhere is
  // a dice roll; a creature that has been sitting under a patch of churned ground you walked past
  // four times is a mistake you made. So the ground above a buried creature is marked, always, to
  // everyone, from the first second of the game -- see DATA.buriedTells below.
  //
  //   wake = {
  //     buried:  true              it is placed underground and stays there until something wakes it.
  //                                NOTE this is deliberately NOT the def-level `burrowed: true` flag
  //                                that the spider mine carries: the Unit constructor reads that one
  //                                and would burrow every instance, including a grub the warren just
  //                                spat out mid-fight. Buried is a SPAWN STATE the placer applies
  //     tell:    <key>             which entry of DATA.buriedTells marks the ground above it
  //     r:       <tiles>           WAKE RADIUS. Measured centre to centre, from the creature to the
  //                                thing that disturbed it
  //     by:      [<trigger>...]    what counts as a disturbance. 'build' a building finishing or
  //                                starting inside r; 'mine' a worker gathering inside r; 'walk' any
  //                                non-worker ground unit of a player passing inside r. A creature
  //                                whose list omits 'walk' can be scouted past safely, which is what
  //                                makes the tell worth reading rather than worth fleeing
  //     delay:   <frames>          from the trip to actually surfacing. This is the last chance to
  //                                pull the worker out, and it is why the number is not zero
  //     aggro:   <tiles>           AGGRESSION RADIUS. Once awake it attacks anything of any player
  //                                inside this. Always >= r, or a creature would wake and stand still
  //     leash:   <tiles>           how far from where it was buried it will chase. Past this it
  //                                breaks off and walks home. Keeps a woken nest out of a main base
  //     rebury:  <frames>          with nothing inside `aggro` for this long it digs back in and its
  //                                tell comes back. 0 means it never reburies
  //     respawn: <frames>          after it dies, frames before the SITE produces another. 0 means
  //                                gone for good, which is what every creature placed on the ground
  //                                says -- only the nest respawns, and it does it through `nest`
  //   }
  //
  // Rules that hold for all of them, and belong in the reader once rather than in each def:
  //   * a neutral creature is hostile to EVERY player equally. It has no ally and takes no side, so
  //     it must never be used as a weapon: nothing about waking one may depend on who woke it
  //   * it does not gather, does not build, is never counted in anyone's supply or score, and is
  //     never selectable by a player
  //   * whatever walks the units walks G.units in order. Nothing here may depend on Set or Map
  //     iteration order, or test/determinism.js will find it
  //   * a buried creature is `u.burrowed`, therefore `u.isCloaked`, therefore invisible without a
  //     detector. THAT IS THE WHOLE REASON THE TELL IS SEPARATE DATA WITH ITS OWN PAINTER: the
  //     marker has to be drawn when the creature is not
  U('carrion_grub', { name: 'Carrion Grub', race: 'N', min: 0, hp: 60, armor: 1, size: 'small', speed: 5.2, sight: 6, r: 9, neutral: true,
    gw: W(9, 'normal', 0.5, 12, { upgKey: null }),
    wake: { buried: true, tell: 'churn', r: 7, by: ['build', 'mine', 'walk'], delay: 36, aggro: 10, leash: 14, rebury: 480, respawn: 0 } });
  // The one worth walking around. Two marines need about fifty seconds to chew through 500 hit
  // points behind 3 armour, and it kills both of them in four shots; `size: 'large'` means explosive
  // weapons hurt it and concussive ones barely scratch it, so the answer is siege tanks and dragoons
  // -- an army, which is to say later. It ignores 'walk' on purpose: you may look at it, and it only
  // wakes if you try to LIVE there.
  U('carrion_maw', { name: 'Carrion Maw', race: 'N', min: 0, hp: 500, armor: 3, size: 'large', speed: 3.6, sight: 8, r: 20, neutral: true,
    gw: W(28, 'normal', 1.2, 22, { upgKey: null, splash: [0.7, 1.1, 1.6] }),
    wake: { buried: true, tell: 'mound', r: 6, by: ['build', 'mine'], delay: 48, aggro: 9, leash: 10, rebury: 720, respawn: 0 } });
  // ---------------------------------------------------------------------------------------------
  // The one unit in the game that no tech tree contains. `unlocked` names the derelict that grants
  // it; see the derelict contract below the Protoss buildings.
  //
  // `upgKey: null` and no `upgA` is the balance safety valve and is deliberate: the Sentinel never
  // benefits from a single upgrade either side researches, so a map objective captured at six
  // minutes is a strong unit then and an ordinary one at twenty. A free unit that scaled would make
  // the derelict the game.
  U('sentinel', { name: 'Sentinel', race: 'N', hp: 220, armor: 2, size: 'large', min: 150, gas: 100, sup: 3, time: 900, speed: 4.2, sight: 9, r: 15,
    hk: 'S', from: 'derelict_foundry', mech: true, cargoSize: 4, unlocked: 'derelict_foundry',
    gw: W(16, 'normal', 6, 22, { upgKey: null, targets: 'both' }) });

  // ============================ AURA CONTRACT (M11 wave two, items 11 and 15) ============================
  // Three new structures per race: a field hospital, a jamming tower and a wall. The first two project
  // a passive field, and `aura` below is the DATA for it. Nothing reads `aura` yet -- the simulation
  // half is another file's work -- so this comment is the interface, written before the reader exists
  // so that reader is a lookup and not a redesign.
  //
  //   aura = {
  //     kind:    'mend' | 'blind'     what the field does. One string, so the sim dispatches on it and
  //                                   a fourth kind needs no new field
  //     r:       <tiles>              radius in TILES from the footprint CENTRE to the unit's centre,
  //                                   the same convention `psi` and `creep` already use on this table
  //     affects: 'ally' | 'enemy'     'ally' is the owner plus anyone G.allied() with them; 'enemy' is
  //                                   everyone else and never the owner. There is no 'all'
  //     stacks:  false                two fields of the same kind over one unit do NOT add: take the
  //                                   single strongest that covers it. Every aura here says false; the
  //                                   field is written out so a later one can say otherwise
  //   -- kind 'mend' --
  //     hp:      <hp per second>      hit points restored per second, ground and air alike. PER SECOND,
  //                                   not per frame: the caller scales by its own tick share. Absent
  //                                   means zero
  //     sh:      <shields per second> plasma shields restored per second. Absent means zero
  //   -- kind 'blind' --
  //     sight:   <multiplier 0..1>    the factor an affected unit's sight range is multiplied by while
  //                                   it is inside. 0.5 halves it. Clamp the result at one tile, so a
  //                                   blinded unit is short-sighted rather than blind
  //     detect:  true | absent        while inside, an affected unit does not count as a detector, so
  //                                   cloaked and burrowed units near the tower stay hidden from it.
  //                                   Absent leaves detection alone
  //
  // Rules that hold for every aura in this table, and that belong in the reader once rather than in
  // each building:
  //   * only a finished building projects: `u.done`, never `u.lifted`, and never `u.unpowered` -- the
  //     same three gates a Photon Cannon fires under
  //   * the field is passive. No energy, no cooldown, no target choice, nothing to cast or toggle
  //   * 'mend' never revives, never exceeds maxHp/maxSh, and does not act on buildings -- a base that
  //     repairs itself for free is a different game
  //   * whatever walks the units must walk `G.units` in order. Nothing about an aura may depend on Set
  //     or Map iteration order, or the determinism tests will find it and the replay will not
  //
  // Walls carry no aura and instead carry `wall: true`, which is the flag to select them by: they are
  // cheap, high-hp, produce nothing, research nothing, and exist to stand in the way.
  // ============================ TERRAN BUILDINGS ============================
  // `morphOptions` is the Shield Battery's mechanism, used here for the reason it was used there: a
  // morph needs no build-page slot, and the Terran Basic page has been full at eight since M11. The two
  // options are mutually exclusive BY CONSTRUCTION and not by a rule -- G.morphBuilding swaps `def` in
  // place, and neither orbital_command nor planetary_fortress carries a morphOptions of its own, so the
  // buttons simply stop existing the moment one of them is taken. Nothing has to check.
  B('command_center', { name: 'Command Center', race: 'T', hp: 1500, w: 4, h: 3, min: 400, time: 1800, hk: 'C', tier: 'basic', produces: ['scv'], sup: 10, depot: true, canLift: true, addons: ['comsat_station', 'nuclear_silo'], morphOptions: ['orbital_command', 'planetary_fortress'], sight: 10 });
  B('comsat_station', { name: 'Comsat Station', race: 'T', hp: 500, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'C', tier: 'addon', parent: 'command_center', req: ['academy'], energy: 200, abil: ['scanner_sweep'] });
  B('nuclear_silo', { name: 'Nuclear Silo', race: 'T', hp: 600, w: 2, h: 2, min: 100, gas: 100, time: 1200, hk: 'N', tier: 'addon', parent: 'command_center', req: ['covert_ops'], produces: ['nuke'] });
  B('supply_depot', { name: 'Supply Depot', race: 'T', hp: 500, w: 3, h: 2, min: 100, time: 600, hk: 'S', tier: 'basic', sup: 8, abil: ['lower_depot'] });
  B('refinery', { name: 'Refinery', race: 'T', hp: 750, w: 4, h: 2, min: 100, time: 600, hk: 'R', tier: 'basic', onGeyser: true });
  B('barracks', { name: 'Barracks', race: 'T', hp: 1000, w: 4, h: 3, min: 150, time: 1200, hk: 'B', tier: 'basic', req: ['command_center'], produces: ['marine', 'firebat', 'medic', 'ghost', 'marauder', 'reaper'], canLift: true, tech: ['suppress_inf'], addons: ['reactor'] });
  B('engineering_bay', { name: 'Engineering Bay', race: 'T', hp: 850, w: 4, h: 3, min: 125, time: 900, hk: 'E', tier: 'basic', req: ['command_center'], upg: ['infW', 'infA'], canLift: true });
  B('academy', { name: 'Academy', race: 'T', hp: 600, w: 3, h: 2, min: 150, time: 1200, hk: 'A', tier: 'basic', req: ['barracks'], tech: ['stim', 'u238', 'restoration_tech', 'optical_flare_tech', 'caduceus'] });
  B('missile_turret', { name: 'Missile Turret', race: 'T', hp: 200, armor: 0, w: 2, h: 2, min: 75, time: 450, hk: 'T', tier: 'basic', req: ['engineering_bay'], det: true, sight: 11,
    aw: W(20, 'explosive', 7, 15, { targets: 'air', upgKey: null }) });
  B('bunker', { name: 'Bunker', race: 'T', hp: 350, w: 3, h: 2, min: 100, time: 450, hk: 'U', tier: 'basic', req: ['barracks'], cargo: 4, bunker: true, abil: ['unload'] });
  B('factory', { name: 'Factory', race: 'T', hp: 1250, w: 4, h: 3, min: 200, gas: 100, time: 1200, hk: 'F', tier: 'adv', req: ['barracks'], produces: ['vulture', 'siege_tank', 'goliath', 'hellion', 'cyclone', 'widow_mine', 'thor'], addons: ['machine_shop'], canLift: true, tech: ['suppress_veh'] });
  B('machine_shop', { name: 'Machine Shop', race: 'T', hp: 750, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'M', tier: 'addon', parent: 'factory', tech: ['ion_thrusters', 'spider_mines_tech', 'siege_tech', 'charon', 'drilling_claws'] });
  B('starport', { name: 'Starport', race: 'T', hp: 1300, w: 4, h: 3, min: 150, gas: 100, time: 1050, hk: 'S', tier: 'adv', req: ['factory'], produces: ['wraith', 'dropship', 'science_vessel', 'battlecruiser', 'valkyrie', 'banshee', 'liberator', 'viking', 'medivac', 'raven'], addons: ['control_tower'], canLift: true });
  B('control_tower', { name: 'Control Tower', race: 'T', hp: 500, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'C', tier: 'addon', parent: 'starport', tech: ['cloaking_field', 'apollo'] });
  B('science_facility', { name: 'Science Facility', race: 'T', hp: 850, w: 4, h: 3, min: 100, gas: 150, time: 900, hk: 'I', tier: 'adv', req: ['starport'], addons: ['physics_lab', 'covert_ops'], tech: ['emp_tech', 'irradiate_tech', 'titan'], canLift: true });
  B('physics_lab', { name: 'Physics Lab', race: 'T', hp: 600, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'P', tier: 'addon', parent: 'science_facility', tech: ['yamato_tech', 'colossus_reactor'] });   // the tech was called 'colossus', the same id as the Protoss unit (REVIEW-M17)
  B('covert_ops', { name: 'Covert Ops', race: 'T', hp: 750, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'C', tier: 'addon', parent: 'science_facility', tech: ['lockdown_tech', 'personnel_cloaking', 'ocular', 'moebius'] });
  B('armory', { name: 'Armory', race: 'T', hp: 750, w: 3, h: 2, min: 100, gas: 50, time: 1200, hk: 'A', tier: 'adv', req: ['factory'], upg: ['vehW', 'vehA', 'shipW', 'shipA'] });
  // Terran's three: a dressing station behind the line, an EW mast, and the concrete the engineers pour.
  // All three sit on the Advanced page because the Basic page is full at eight -- the command card is a
  // fixed three-by-three and slot 8 is Cancel, so eight is the hard ceiling per page. `tier` has to
  // agree with the page it is listed on: test/playtest_bot.js picks the menu with `tier === 'adv'`.
  B('aid_station', { name: 'Aid Station', race: 'T', hp: 550, w: 3, h: 2, min: 100, gas: 50, time: 750, hk: 'D', tier: 'adv', req: ['academy'],
    aura: { kind: 'mend', r: 6, affects: 'ally', hp: 2.4, stacks: false } });
  B('scrambler_mast', { name: 'Scrambler Mast', race: 'T', hp: 450, armor: 0, w: 2, h: 2, min: 100, gas: 75, time: 750, hk: 'J', tier: 'adv', req: ['engineering_bay'], sight: 9,
    aura: { kind: 'blind', r: 8, affects: 'enemy', sight: 0.5, detect: true, stacks: false } });
  B('blast_barricade', { name: 'Blast Barricade', race: 'T', hp: 800, armor: 2, w: 2, h: 2, min: 75, time: 300, hk: 'W', tier: 'adv', req: ['barracks'], sight: 3, wall: true });

  // ===================== TERRAN STRUCTURES, M12 WAVE FOUR =====================
  // Four entries and exactly ONE new build-page slot between them, which is not a coincidence: the
  // Terran Basic page has been full at eight since M11 and Advanced had one free. So the Sensor Tower
  // takes the last slot, the Reactor is an add-on (add-ons live on their parent's card and need no
  // slot), and the two hall upgrades are morphs (morphs live on the source's card and need no slot).
  //
  // The two morphs are 4x3 because the Command Center is 4x3. G.morphBuilding swaps the def in place
  // and never re-blocks the collision grid, so a morph that changed its footprint would leave the map
  // describing the building it used to be -- the same constraint every Zerg morph and all three
  // Protoss attunements are written under.

  // ORBITAL COMMAND -- the MULE platform (M12 item 11), and deliberately NOT a Comsat replacement.
  // It would have been trivial to give it Scanner Sweep as well, and that would have made the Comsat
  // strictly worse than a morph -- one of the two would then be dead data. Instead the Orbital carries
  // ONLY the MULE, keeps the Command Center's add-on slot, and can therefore have a Comsat bolted to
  // it: the decision is "economy, vision, or 100 more minerals for both", which is a decision, where
  // "the strictly better Command Center" is not.
  //
  // Energy is the whole cost model. 200 maximum, 50 a MULE, and a MULE that is dropped badly is gone --
  // so the mechanic rewards looking at your bases, which is what a macro mechanic is for.
  B('orbital_command', { name: 'Orbital Command', race: 'T', hp: 1500, w: 4, h: 3, min: 150, gas: 0, time: 900, hk: 'O', tier: 'morph', req: ['academy'], produces: ['scv'], sup: 10, depot: true, canLift: true, addons: ['comsat_station', 'nuclear_silo'], energy: 200, abil: ['mule'], sight: 11 });
  // PLANETARY FORTRESS -- the other half of the same choice, and it gives something up rather than
  // only adding: no `canLift`, so a Fortress that is losing cannot fly away, which is the one thing a
  // Command Center has always been able to do. Ground only, so it is not an answer to a mutalisk
  // flock; it is an answer to a runby, and it is why an expansion can be left without an army on it.
  // Armour 3 rather than a huge hit-point bar, because armour is what makes it hard for the SMALL fast
  // things it exists to stop while leaving a siege line perfectly able to crack it.
  B('planetary_fortress', { name: 'Planetary Fortress', race: 'T', hp: 1750, armor: 3, w: 4, h: 3, min: 150, gas: 150, time: 1050, hk: 'P', tier: 'morph', req: ['engineering_bay'], produces: ['scv'], sup: 10, depot: true, addons: ['comsat_station', 'nuclear_silo'], sight: 10,
    gw: W(40, 'normal', 6, 22, { upgKey: null }) });
  // SENSOR TOWER -- sixteen tiles of CONTACTS, and almost no sight at all.
  //
  // It shipped in M12 as a plain 16-tile vision source, and the comment that used to sit here said why:
  // SC2 shows enemy positions as blips beyond vision range, that needs a hook in the vision pass and a
  // second render layer, and a half-built version would be worse than none. FIXLIST-M14 C2 is that hook.
  //
  // A CONTACT IS A BLIP: POSITION ONLY. You learn that something moved there. Not what it is, not how
  // many, not how hurt -- and you cannot shoot it. The fog inside the radius stays fogged and the
  // terrain stays as explored or unexplored as it already was, so the tower reveals NOTHING; it reports.
  // That is the difference between an early-warning array and a floodlight, and it is the whole unit.
  //
  //   sensor    the contact radius, in tiles. Read by G.contacts.
  //   sight     3, its own footprint and a little more, so it is not blind standing in its own base.
  //             It WAS 16, and that number is the one the player reported.
  //
  // Stationary and burrowed things produce nothing: it is a movement detector, so a dug-in army is
  // invisible to it and sitting still is a real answer to it.
  //
  // The user decided the AI reads the contacts too, which is what makes them simulation state rather
  // than an overlay -- so this def moves the build stamp and G.contacts is a pure function of unit
  // positions, with no stored history for a snapshot to lose.
  //
  // NOT a detector, on purpose. A 16-tile detector for 125 minerals would answer every cloak in the
  // game from the safety of your own base -- and a contact is emphatically not detection: a cloaked
  // unit that is MOVING makes a blip like anything else, which tells you where it is and nothing about
  // what you would need to kill it.
  B('sensor_tower', { name: 'Sensor Tower', race: 'T', hp: 300, armor: 0, w: 2, h: 2, min: 125, gas: 100, time: 600, hk: 'T', tier: 'adv', req: ['engineering_bay'], sight: 3, sensor: 16 });
  // REACTOR -- the Barracks' first add-on, ever, in this game or in Brood War.
  //
  // Which parent it hangs off is the entire design. The Factory and the Starport already have add-ons
  // that gate their whole unit lists -- no Machine Shop, no siege tank; no Control Tower, no dropship,
  // vessel, battlecruiser or valkyrie -- and a building holds exactly one add-on, so a Reactor there
  // would not be a choice between two things, it would be a choice between a unit line and a
  // throughput bonus, which nobody would ever take twice. The Barracks had nothing to give up. Now it
  // has one thing to choose to build, and the choice is legible: a Reactor doubles marine output, and
  // it is the slot Suppressing Fire's Barracks would otherwise have used for nothing.
  //
  // `reactor: true` is the flag the simulation reads (G.tickTerran, which calls Unit.reactorTick), not the id, so a second
  // parent later is a one-word change to `addons` and nothing else.
  //
  // `req: ['academy']` is FIXLIST-M14 A4, and it is the answer to "the Reactor gives no prerequisite
  // error": it had no `req` array at all, so `p.hasReq` passed trivially and nothing could ever be
  // refused. The Academy is the gate because it is the Barracks' own upgrade building -- Stimpacks,
  // U-238, the Medic and the Ghost all come off it -- so "you have committed to infantry, now you may
  // mass them" is the sentence the tree already speaks. Without it a 50/50 add-on doubled the game's
  // cheapest production line the moment the opening Barracks finished, which is the hole rather than
  // the feature. THIS IS A BALANCE-RELEVANT CHOICE and is flagged for the gated balance run; the AI
  // build script is unaffected (Academy at supply 20, Reactor at 45).
  B('reactor', { name: 'Reactor', race: 'T', hp: 600, w: 2, h: 2, min: 50, gas: 50, time: 600, hk: 'X', tier: 'addon', parent: 'barracks', req: ['academy'], reactor: true });

  // ============================ ZERG BUILDINGS ============================
  B('hatchery', { name: 'Hatchery', race: 'Z', hp: 1250, w: 4, h: 3, min: 300, time: 1800, hk: 'H', tier: 'basic', sup: 1, depot: true, spawnsLarva: true, creep: 11, morphTo: 'lair', sight: 9 });
  B('lair', { name: 'Lair', race: 'Z', hp: 1800, w: 4, h: 3, min: 150, gas: 100, time: 1500, hk: 'L', tier: 'morph', req: ['spawning_pool'], sup: 1, depot: true, spawnsLarva: true, creep: 11, morphTo: 'hive', tech: ['ventral_sacs', 'antennae', 'pneumatized'], sight: 10 });
  B('hive', { name: 'Hive', race: 'Z', hp: 2500, w: 4, h: 3, min: 200, gas: 150, time: 1800, hk: 'H', tier: 'morph', req: ['queens_nest'], sup: 1, depot: true, spawnsLarva: true, creep: 11, tech: ['ventral_sacs', 'antennae', 'pneumatized'], sight: 11 });
  B('creep_colony', { name: 'Creep Colony', race: 'Z', hp: 400, w: 2, h: 2, min: 75, time: 300, hk: 'C', tier: 'basic', creep: 8, needsCreep: true, morphOptions: ['sunken_colony', 'spore_colony'] });
  // M12 wave four: THE CRAWLERS ARE THE EXISTING COLONIES, GIVEN LEGS. Two new defs were the other
  // option and were rejected: a "spine crawler" beside a sunken colony is two buildings that do the
  // same job, it doubles the Zerg static-defence tech tree for nothing, and every existing map, save,
  // replay and AI script would then have the old one in it while the card offered the new one.
  // Uproot/root is an ability pair on what is already there, so a sunken built in M4 can stand up.
  //
  // `needsCreep` is the whole safety rail and it is one word. G.landBuilding runs GameMap.canPlace
  // before it puts anything down, and canPlace refuses `def.needsCreep` off creep -- so an uprooted
  // crawler can WALK anywhere but can only ROOT on creep, and a walking crawler has no weapon
  // (Unit.tickBuilding returns at `if (this.lifted)` before it reaches tickCombatBuilding). It costs
  // nothing anywhere else: neither def is ever placed by a worker, both are morphs of a creep colony
  // that already required creep, so the only code path this new flag reaches is landing.
  // `crawler` marks the two defs for Abilities' creep bookkeeping; see uproot in js/abilities.js.
  B('sunken_colony', { name: 'Sunken Colony', race: 'Z', hp: 300, armor: 2, w: 2, h: 2, min: 50, time: 300, hk: 'S', tier: 'morph', req: ['spawning_pool'], creep: 8, needsCreep: true, crawler: true, abil: ['uproot'], gw: W(40, 'explosive', 7, 32, { upgKey: null }) });
  B('spore_colony', { name: 'Spore Colony', race: 'Z', hp: 400, w: 2, h: 2, min: 50, time: 300, hk: 'P', tier: 'morph', req: ['evolution_chamber'], creep: 8, needsCreep: true, crawler: true, abil: ['uproot'], det: true, sight: 10, aw: W(15, 'normal', 7, 15, { targets: 'air', upgKey: null }) });
  B('extractor', { name: 'Extractor', race: 'Z', hp: 750, w: 4, h: 2, min: 50, time: 600, hk: 'E', tier: 'basic', onGeyser: true, creep: 3 });
  B('spawning_pool', { name: 'Spawning Pool', race: 'Z', hp: 750, w: 3, h: 2, min: 200, time: 1200, hk: 'S', tier: 'basic', req: ['hatchery'], needsCreep: true, tech: ['metabolic', 'adrenal', 'volatile_bile'] });
  B('evolution_chamber', { name: 'Evolution Chamber', race: 'Z', hp: 750, w: 3, h: 2, min: 75, time: 600, hk: 'V', tier: 'basic', req: ['hatchery'], needsCreep: true, upg: ['meleeW', 'missW', 'carapace'] });
  B('hydralisk_den', { name: 'Hydralisk Den', race: 'Z', hp: 850, w: 3, h: 2, min: 100, gas: 50, time: 600, hk: 'D', tier: 'basic', req: ['spawning_pool'], needsCreep: true, tech: ['muscular', 'grooved', 'lurker_aspect', 'suppress_hyd'] });
  B('spire', { name: 'Spire', race: 'Z', hp: 600, w: 2, h: 2, min: 200, gas: 150, time: 1800, hk: 'S', tier: 'adv', req: ['lair'], needsCreep: true, upg: ['flyW', 'flyA'], morphTo: 'greater_spire', tech: ['suppress_air'] });
  B('greater_spire', { name: 'Greater Spire', race: 'Z', hp: 1000, w: 2, h: 2, min: 100, gas: 150, time: 1800, hk: 'G', tier: 'morph', req: ['hive'], upg: ['flyW', 'flyA'] });
  B('queens_nest', { name: "Queen's Nest", race: 'Z', hp: 850, w: 3, h: 2, min: 150, gas: 100, time: 900, hk: 'Q', tier: 'adv', req: ['lair'], needsCreep: true, tech: ['ensnare_tech', 'spawn_broodling_tech', 'gamete'] });
  B('ultralisk_cavern', { name: 'Ultralisk Cavern', race: 'Z', hp: 600, w: 3, h: 2, min: 150, gas: 200, time: 1200, hk: 'U', tier: 'adv', req: ['hive'], needsCreep: true, tech: ['anabolic', 'chitinous'] });
  // Lair, not Hive: in Brood War the Defiler Mound is a Lair-tech building, and having it behind the
  // Hive put Zerg's only answer to healed bio four minutes past the end of an average AI game.
  B('defiler_mound', { name: 'Defiler Mound', race: 'Z', hp: 850, w: 4, h: 2, min: 100, gas: 100, time: 900, hk: 'D', tier: 'adv', req: ['lair'], needsCreep: true, tech: ['plague_tech', 'consume_tech', 'metasynaptic'] });
  B('nydus_canal', { name: 'Nydus Canal', race: 'Z', hp: 250, w: 2, h: 2, min: 150, time: 600, hk: 'N', tier: 'adv', req: ['hive'], needsCreep: true, nydus: true, abil: ['nydus_exit', 'nydus_worm'] });
  B('infested_command_center', { name: 'Infested Command Center', race: 'Z', hp: 1500, w: 4, h: 3, min: 0, gas: 0, time: 1, tier: 'none', produces: ['infested_terran'], sight: 10 });
  // Zerg's three. All three need creep, like every other Zerg structure, which is the natural limit on
  // where a Zerg player may wall or mend: on ground the swarm already holds. The ridge goes on the Basic
  // page (six entries, two spare) and the other two on Advanced (five, three spare).
  B('mending_pool', { name: 'Mending Pool', race: 'Z', hp: 600, w: 3, h: 2, min: 100, gas: 50, time: 750, hk: 'M', tier: 'adv', req: ['evolution_chamber'], needsCreep: true,
    aura: { kind: 'mend', r: 8, affects: 'ally', hp: 1.4, stacks: false } });
  B('miasma_gland', { name: 'Miasma Gland', race: 'Z', hp: 500, w: 2, h: 2, min: 100, gas: 75, time: 750, hk: 'J', tier: 'adv', req: ['lair'], needsCreep: true, sight: 9,
    aura: { kind: 'blind', r: 10, affects: 'enemy', sight: 0.6, stacks: false } });
  B('carapace_ridge', { name: 'Carapace Ridge', race: 'Z', hp: 700, armor: 2, w: 2, h: 2, min: 25, time: 300, hk: 'W', tier: 'basic', req: ['spawning_pool'], needsCreep: true, sight: 3, wall: true });
  // M12 wave four. Exactly TWO new buildings a drone can put down, and that is a ceiling rather than
  // a preference: DATA.buildMenu holds eight per page (slot 8 is Cancel in a three-by-three card),
  // Zerg was at seven and seven, and test/newbuildings.js asserts both halves of that. Zerg's build
  // pages are now FULL. Anything added to this race after today has to be a morph, an add-on, or
  // placed by an ability the way the Creep Tumour and the Nydus Worm below are.
  B('roach_warren', { name: 'Roach Warren', race: 'Z', hp: 800, w: 3, h: 2, min: 100, gas: 0, time: 900, hk: 'R', tier: 'basic', req: ['spawning_pool'], needsCreep: true, tech: ['glial_reconstitution', 'ravager_aspect'] });
  B('infestation_pit', { name: 'Infestation Pit', race: 'Z', hp: 850, w: 3, h: 2, min: 100, gas: 100, time: 900, hk: 'I', tier: 'adv', req: ['lair'], needsCreep: true, tech: ['pathogen_glands', 'pressurised_glands'] });
  // ---------------------------------------------------------------------------------------------
  // M12 ITEM 13: THE CREEP TUMOUR, AND THE PROMISE THAT IT IS ADDITIVE.
  //
  // Read GameMap.recomputeCreep before changing anything here. Creep is the union of ellipses around
  // every living, finished unit carrying `def.creep`, at radius min(def.creep, u.creepR), and
  // Unit.tickBuilding grows creepR from CREEP_SEED to def.creep over about a minute. A tumour is
  // therefore NOT a new creep system. It is one more entry in the union that already exists, and it
  // needed no change at all to that function: the hatchery, the lair, the hive, the creep colony, the
  // extractor and every other `def.creep` source behave on frame 40,000 of an existing save exactly as
  // they did before this commit. test/zerg12.js asserts that directly on a tumour-free map, because
  // "it should be additive" is a claim and a claim is not a test.
  //
  // What makes it a MECHANIC rather than a seventh emitter is who places it. An Overlord seeds one on
  // creep it is floating over (`plant_tumour`), and a finished tumour may seed exactly ONE child
  // (`spawn_tumour`), anywhere within nine tiles that is already creep. So the swarm walks its own
  // ground forward: plant at the edge, wait for the radius to grow, seed the next one at the new edge.
  // Creep is something a player drives, and the thing they are driving it towards is the Nydus Worm
  // below, which can only surface on creep. That interlock is the whole point of doing both at once.
  //
  // One child, not many, and it is why `tumoured` is a flag on the unit rather than a counter: a
  // tumour that could seed repeatedly is a tumour that covers the map on its own while the player does
  // something else, and the mechanic is supposed to cost attention.
  //
  // 1x1 because a 2x2 free structure every ten seconds is a wall kit. `armor: 0` because B() defaults
  // it to 1 and 50 hit points behind 1 armour is annoyingly durable against the small-arms fire that
  // ought to clear it. `min`/`gas` spelled out on both of these: Abilities charges def.min directly.
  B('creep_tumour', { name: 'Creep Tumour', race: 'Z', hp: 50, armor: 0, w: 1, h: 1, min: 25, gas: 0, time: 240, hk: 'T', tier: 'none', creep: 7, needsCreep: true, sight: 5, tumour: true, abil: ['spawn_tumour'] });
  // The far end of a Nydus network. `nydus_canal` already existed and already had ONE exit; a network
  // is more than two ends, and the answer to "is that worth it" is yes for exactly one reason: with
  // tumours in the game, creep is now something that reaches places, and a mouth that can surface on
  // any creep you own is the payoff for having driven it there.
  //
  // The topology is a HUB, and it is shaped by what js/sim.js already does rather than by taste. The
  // 'nydus' order reads `c.nydusLink` -- one link per mouth -- so: every worm links home to the canal,
  // and the canal links to the most recently surfaced worm. Enter any mouth and you come out at the
  // hub; enter the hub and you come out at the newest mouth, which is the one you just dug where you
  // wanted the reinforcements. When that worm dies the canal falls back to the next newest, which is
  // the redundancy that makes it a network rather than two ends with extra steps. Abilities keeps
  // `canal.nydusNet` in order; nothing in js/sim.js had to change.
  B('nydus_worm', { name: 'Nydus Worm', race: 'Z', hp: 300, armor: 1, w: 2, h: 2, min: 75, gas: 0, time: 360, hk: 'W', tier: 'none', needsCreep: true, nydus: true, sight: 7 });

  // ============================ PROTOSS BUILDINGS ============================
  // M12 ITEM 11: the Nexus has an energy bar now, and one thing to spend it on. Chrono Boost is the
  // Protoss macro mechanic and it is the least intrusive of the three -- a MULE is a unit and an
  // inject is a delivery, where this only makes something that was already happening happen twice as
  // fast. That is deliberate: it rewards LOOKING at your production without changing what production
  // is. Energy 200, 50 a cast, so a Nexus left alone banks four boosts and then wastes everything
  // after that, which is the same pressure an Orbital is under.
  B('nexus', { name: 'Nexus', race: 'P', hp: 750, sh: 750, w: 4, h: 3, min: 400, time: 1800, hk: 'N', tier: 'basic', produces: ['probe'], sup: 10, depot: true, sight: 11, energy: 200, abil: ['chrono_boost'] });
  B('pylon', { name: 'Pylon', race: 'P', hp: 300, sh: 300, armor: 0, w: 2, h: 2, min: 100, time: 450, hk: 'P', tier: 'basic', sup: 8, psi: 6.5 });
  B('assimilator', { name: 'Assimilator', race: 'P', hp: 450, sh: 450, w: 4, h: 2, min: 100, time: 600, hk: 'A', tier: 'basic', onGeyser: true });
  B('gateway', { name: 'Gateway', race: 'P', hp: 500, sh: 500, w: 4, h: 3, min: 150, time: 900, hk: 'G', tier: 'basic', req: ['nexus'], needsPsi: true, produces: ['zealot', 'dragoon', 'sentry', 'high_templar', 'dark_templar'], tech: ['suppress_gate'], morphOptions: ['warp_gate'] });
  B('forge', { name: 'Forge', race: 'P', hp: 550, sh: 550, w: 3, h: 2, min: 150, time: 600, hk: 'F', tier: 'basic', req: ['nexus'], needsPsi: true, upg: ['gW', 'gA', 'shields'] });
  B('photon_cannon', { name: 'Photon Cannon', race: 'P', hp: 100, sh: 100, armor: 0, w: 2, h: 2, min: 150, time: 750, hk: 'C', tier: 'basic', req: ['forge'], needsPsi: true, det: true, sight: 11,
    gw: W(20, 'normal', 7, 22, { targets: 'both', upgKey: null }) });
  B('cybernetics_core', { name: 'Cybernetics Core', race: 'P', hp: 500, sh: 500, w: 3, h: 2, min: 200, time: 900, hk: 'Y', tier: 'basic', req: ['gateway'], needsPsi: true, upg: ['airW', 'airA'], tech: ['singularity', 'warp_gate_tech'] });
  // The Shield Battery is the Protoss Creep Colony now: a cheap psi-fed focus that can be re-attuned
  // into one of three things. That is not decoration, it is the only door left. The command card is a
  // fixed three-by-three with Cancel in the last slot, so each build page holds eight buildings and no
  // more, and Protoss already fills both pages -- eight basic, eight advanced, sixteen of sixteen, with
  // every one of them gating a unit line or an expansion. Terran came into this with four spare slots
  // and Zerg with five; Protoss had none, and none of its sixteen can leave without taking a unit with
  // it. A morph needs no slot at all: `morphOptions` puts the buttons on the battery's own card, which
  // had none.
  B('shield_battery', { name: 'Shield Battery', race: 'P', hp: 200, sh: 200, w: 3, h: 2, min: 100, time: 450, hk: 'B', tier: 'basic', req: ['gateway'], needsPsi: true, energy: 200, battery: true,
    morphOptions: ['rejuvenation_shrine', 'null_obelisk', 'warded_bastion'] });
  B('robotics_facility', { name: 'Robotics Facility', race: 'P', hp: 500, sh: 500, w: 3, h: 2, min: 200, gas: 200, time: 1200, hk: 'R', tier: 'adv', req: ['cybernetics_core'], needsPsi: true, produces: ['shuttle', 'warp_prism', 'observer', 'immortal', 'reaver', 'colossus', 'disruptor'] });
  B('stargate', { name: 'Stargate', race: 'P', hp: 600, sh: 600, w: 4, h: 3, min: 150, gas: 150, time: 1050, hk: 'S', tier: 'adv', req: ['cybernetics_core'], needsPsi: true, produces: ['scout', 'phoenix', 'corsair', 'oracle', 'void_ray', 'carrier', 'tempest', 'arbiter'], tech: ['suppress_bay'] });
  B('citadel_of_adun', { name: 'Citadel of Adun', race: 'P', hp: 450, sh: 450, w: 3, h: 2, min: 150, gas: 100, time: 900, hk: 'C', tier: 'adv', req: ['cybernetics_core'], needsPsi: true, tech: ['leg_enhancements', 'blink'] });
  B('robotics_support_bay', { name: 'Robotics Support Bay', race: 'P', hp: 450, sh: 450, w: 3, h: 2, min: 150, gas: 100, time: 450, hk: 'B', tier: 'adv', req: ['robotics_facility'], needsPsi: true, tech: ['scarab_damage', 'reaver_capacity', 'gravitic_drive'] });
  B('fleet_beacon', { name: 'Fleet Beacon', race: 'P', hp: 500, sh: 500, w: 3, h: 2, min: 300, gas: 200, time: 900, hk: 'F', tier: 'adv', req: ['stargate'], needsPsi: true, tech: ['apial_sensors', 'gravitic_thrusters', 'carrier_capacity', 'disruption_web_tech', 'argus_jewel'] });
  B('templar_archives', { name: 'Templar Archives', race: 'P', hp: 500, sh: 500, w: 3, h: 2, min: 150, gas: 200, time: 900, hk: 'T', tier: 'adv', req: ['citadel_of_adun'], needsPsi: true, tech: ['psi_storm_tech', 'hallucination_tech', 'khaydarin_amulet', 'mind_control_tech', 'maelstrom_tech', 'argus_talisman'] });
  B('observatory', { name: 'Observatory', race: 'P', hp: 250, sh: 250, w: 3, h: 2, min: 50, gas: 100, time: 450, hk: 'O', tier: 'adv', req: ['robotics_facility'], needsPsi: true, tech: ['gravitic_boosters', 'sensor_array'] });
  B('arbiter_tribunal', { name: 'Arbiter Tribunal', race: 'P', hp: 500, sh: 500, w: 3, h: 2, min: 200, gas: 150, time: 900, hk: 'A', tier: 'adv', req: ['templar_archives', 'stargate'], needsPsi: true, tech: ['recall_tech', 'stasis_tech', 'khaydarin_core'] });
  // The three attunements of the Shield Battery. Two constraints shape every number here and neither is
  // taste. They are 3x2 because G.morphBuilding swaps the def in place and never re-blocks the map, so a
  // morph that changed its footprint would leave the collision grid describing the building it used to
  // be -- every Zerg morph is the same size as its source for the same reason. And all three carry
  // `sh: 200`, the battery's own shields, because morphBuilding updates maxHp and does NOT update maxSh:
  // whatever a morphed Protoss building says about shields, it keeps the source's. Matching the source
  // is the only way `def.sh` and the shield bar can agree, so Protoss durability here is in hit points.
  B('rejuvenation_shrine', { name: 'Rejuvenation Shrine', race: 'P', hp: 400, sh: 200, w: 3, h: 2, min: 75, gas: 50, time: 450, hk: 'D', tier: 'morph', req: ['cybernetics_core'], needsPsi: true,
    aura: { kind: 'mend', r: 6, affects: 'ally', hp: 1.0, sh: 3.0, stacks: false } });
  B('null_obelisk', { name: 'Null Obelisk', race: 'P', hp: 350, sh: 200, w: 3, h: 2, min: 75, gas: 100, time: 450, hk: 'J', tier: 'morph', req: ['citadel_of_adun'], needsPsi: true, sight: 9,
    aura: { kind: 'blind', r: 6, affects: 'enemy', sight: 0.35, detect: true, stacks: false } });
  B('warded_bastion', { name: 'Warded Bastion', race: 'P', hp: 700, sh: 200, armor: 2, w: 3, h: 2, min: 100, time: 240, hk: 'W', tier: 'morph', req: ['forge'], needsPsi: true, sight: 3, wall: true });

  // ===================== THE WARP GATE (M12 item 12) =====================
  // A Gateway that has given up its production queue. `produces: []` is not an oversight and it is
  // not a placeholder -- it IS the trade, and it is written in the data rather than enforced by a rule
  // so that every part of the game that asks "what does this building make" gets the right answer for
  // free: the command card, AI.canTrainSoon, AI.production's producer filter, G.queueUnit's
  // `produces.includes` guard and G.tickAlerts's idle-production check all stop offering it units
  // without one line of code knowing what a Warp Gate is.
  //
  // What it has instead is five warp-in abilities, one per Gateway unit. Each puts the unit down
  // ANYWHERE the player holds psi -- so production stops being "at the building" and becomes "at the
  // front", which is the entire mechanic. The costs are the same, the unit is helpless while it forms,
  // and the gate then recharges for a quarter LONGER than training would have taken. That last number
  // is the balance of the whole item: a Warp Gate is not faster, it is closer, and if you use it at
  // home it is strictly worse than the Gateway you converted.
  //
  // FREE, AND THAT IS DELIBERATE. `min: 0, gas: 0` -- the price was paid once for the whole army as
  // the research, exactly as SC2 charges it. Spelled out as numbers because G.queueMorph subtracts
  // them and `undefined` there is NaN minerals.
  //
  // THE FOOTPRINT AND THE SHIELDS MUST MATCH THE GATEWAY'S, and neither is taste. G.morphBuilding
  // swaps `def` in place and never re-blocks the collision grid, so a different `w`/`h` would leave
  // the map describing the building this used to be; and it updates `maxHp` and NOT `maxSh`, so a
  // different `sh` would be a number the shield bar never honours. Both are the same constraints the
  // three Shield Battery attunements above are written under.
  B('warp_gate', { name: 'Warp Gate', race: 'P', hp: 500, sh: 500, w: 4, h: 3, min: 0, gas: 0, time: 300, hk: 'W', tier: 'morph', req: ['warp_gate_tech'], needsPsi: true, produces: [],
    abil: ['warp_zealot', 'warp_dragoon', 'warp_sentry', 'warp_high_templar', 'warp_dark_templar'] });

  // ============================ NEUTRAL STRUCTURES (race 'N') ============================
  // Four of them: one nest that belongs to the wildlife, and three derelicts that belong to whoever
  // repairs them. All four carry `tier: 'none'` as well as `race: 'N'` -- the race is what keeps them
  // out of the three-race closures, and `tier: 'none'` is what keeps them out of the two build-page
  // walks that filter on tier instead. Either alone is enough; both together mean a future refactor
  // of one of them cannot quietly put a derelict on somebody's command card.
  //
  // NOTE THE ABSENCES, each of which a whole-table test would otherwise catch as a surprise:
  //   * no `aura` -- test/auras.js and test/newbuildings.js both count aura buildings over the WHOLE
  //     table and require exactly the six from item 11
  //   * no `wall: true` -- same, counted over the whole table and required to be exactly three
  //   * `min: 0` spelled out rather than left undefined. Abilities.repairTick computes
  //     `t.def.min * 0.25 * frac`, and undefined * 0.25 is NaN. Nothing can reach that today (repair
  //     requires `t.owner === u.owner`) but a derelict is a building a player will be repairing on
  //     purpose, and M11 already lost an afternoon to a spider mine with no cost producing NaN hit
  //     points that spread through every comparison they touched
  //
  // ---------------------------------------------------------------------------------------------
  // The nest. Same `wake` block as a creature -- it is buried, it has a tell, it wakes -- plus a
  // `nest` block, which is the only thing in the wildlife that puts anything new on the map:
  //
  //   nest = {
  //     spawns: <unit id>     what it produces. One kind, so nothing has to score a choice
  //     pack:   <n>           how many of them it keeps alive at once. It does not produce while it
  //                           already has `pack` living children
  //     every:  <frames>      minimum frames between one replacement and the next
  //     cap:    <n>           lifetime total it will ever produce, INCLUDING the pack it was placed
  //                           with. 0 means no cap. This exists because a nest nobody kills is a
  //                           free army for whoever walks a marine past it every ninety seconds,
  //                           and because an uncapped spawner in a 60-minute game is a memory leak
  //     dormant: true         it produces nothing until it is woken. A nest you never disturb is
  //                           scenery, and stays scenery
  //   }
  //
  // Killing the nest does not kill its children; they finish what they are doing and rebury.
  B('carrion_warren', { name: 'Carrion Warren', race: 'N', hp: 700, armor: 2, w: 3, h: 2, min: 0, gas: 0, time: 1, tier: 'none', sight: 5, neutral: true,
    wake: { buried: true, tell: 'vent', r: 8, by: ['build', 'mine', 'walk'], delay: 24, aggro: 12, leash: 18, rebury: 600, respawn: 0 },
    nest: { spawns: 'carrion_grub', pack: 4, every: 900, cap: 12, dormant: true } });

  // ---------------------------------------------------------------------------------------------
  // CAPTURABLE DERELICTS (wave two, item 8). Structures already standing when the match begins, at a
  // fraction of their hit points, owned by nobody. Repair one to full and it is yours, with whatever
  // it grants.
  //
  // WHY THEY ARE PER-MAP AND NOT GLOBAL. A map with derelicts is a different match: map control buys
  // tech, so the centre is worth holding for a reason that has nothing to do with expansions. That is
  // a property of the MAP, exactly as a hazard is -- and for the same practical reason as the
  // sandstorm, which this follows deliberately: every layout, every mission and every balance log in
  // this repository predates derelicts, and a feature that turned itself on everywhere would silently
  // change all of them. A layout without a `derelicts` key has none. See DATA.derelictPresets.
  //
  //   derelict = {
  //     ruin:   <0..1>        the fraction of maxHp it stands at while nobody owns it. It is a WRECK:
  //                           it produces nothing, researches nothing, projects no vision for anyone
  //                           and is not a valid target for anything but repair and damage
  //     rate:   <hp/second>   hit points of repair a single repairing unit restores per second. PER
  //                           SECOND, not per frame, matching the aura contract above. Several
  //                           repairers add; the sim scales by its own tick share
  //     min:    <minerals>    total minerals the FULL repair costs, from `ruin` to full. Charged
  //                           pro rata as the repair proceeds, the way Abilities.repairTick already
  //                           charges: cost per hit point is min / (hp * (1 - ruin))
  //     gas:    <gas>         the same for gas
  //     by:     'worker'      who may repair it. 'worker' means ANY race's worker -- SCV, Drone and
  //                           Probe alike. This is the one place the game lets a Drone or a Probe
  //                           repair, and it has to be: a derelict only a Terran can take is not a
  //                           map feature, it is a Terran bonus
  //     grants: { ... }       what capture is FOR. Exactly one key per derelict; see each below
  //     hold:   true          ownership follows the building. Lose the building and you lose what it
  //                           granted, except an upgrade already applied -- see `grants.upg`
  //   }
  //
  // Rules the reader owns once:
  //   * capture completes at full hit points, and the building changes owner at that instant. The
  //     player whose repairer landed the tick that filled it gets it, which is what makes a contested
  //     derelict a fight rather than a race of two independent progress bars: repair is one shared
  //     pool of hit points and damage takes it back down
  //   * damage during a repair is not a special case. A derelict at 3 hp is still a derelict
  //   * a captured derelict cannot be re-captured while its owner is alive; it can be killed, and
  //     what is left is rubble, not a fresh derelict. Capture happens once
  //   * `u.captured` is the field the sim sets on capture and the field js/sprites_buildings.js's
  //     animated overlays read to decide whether to light the thing up. Absent or false means ruin
  //   * a derelict never blocks a mineral line: placement is the map generator's problem, and
  //     DATA.derelictPresets carries the clearances it must honour
  //
  // Each grants something no tech tree does. That is the whole design: not a shortcut to what you
  // could already have, but a thing you could not.
  //
  // 1. THE FOUNDRY grants a UNIT. `produces` is already the field every command card reads, and
  //    UI.buildCard builds from UI.ownSel(), so the captured building offers the Sentinel with no new
  //    UI code at all and a derelict nobody owns shows nobody a button. The Sentinel's `race: 'N'` is
  //    what keeps it out of test/techtree.js's closure; `unlocked: 'derelict_foundry'` is what says
  //    that was on purpose.
  B('derelict_foundry', { name: 'Derelict Foundry', race: 'N', hp: 900, armor: 2, w: 4, h: 3, min: 0, gas: 0, time: 1200, tier: 'none', sight: 4, neutral: true,
    produces: ['sentinel'],
    derelict: { ruin: 0.15, rate: 12, min: 150, gas: 100, by: 'worker', hold: true, grants: { unit: 'sentinel' } } });
  // 2. THE ARCHIVE grants an UPGRADE, free and instant, and -- this is the part no tech tree does --
  //    without the building that normally researches it. A Zerg that never built an evolution chamber
  //    still gets the carapace level. `levels` is added on top of whatever is already researched and
  //    the total is capped at 3, so taking the archive at minute five is worth a level and taking it
  //    at minute thirty is worth nothing, which is the correct shape for a map objective.
  //    It is the one grant that survives losing the building: an upgrade already applied to an army
  //    cannot be un-applied without giving armour a history, and a granted level is not tracked
  //    separately from a researched one.
  B('derelict_archive', { name: 'Derelict Archive', race: 'N', hp: 650, armor: 1, w: 3, h: 2, min: 0, gas: 0, time: 900, tier: 'none', sight: 4, neutral: true,
    derelict: { ruin: 0.2, rate: 12, min: 100, gas: 75, by: 'worker', hold: true, grants: { upg: { T: 'infA', Z: 'carapace', P: 'gA' }, levels: 1, cap: 3, permanent: true } } });
  // 3. THE WATCHTOWER grants VISION, and it is the one grant that needs no code at all: `sight: 18`
  //    is on the def, G.updateVision already marks from every unit allied with the player looking,
  //    and the neutral player is allied with nobody -- so while it stands derelict it shows nothing
  //    to anyone, and the instant it changes owner it shows eighteen tiles to them. It is NOT a
  //    detector, deliberately: a tower that revealed every buried creature within eighteen tiles
  //    would answer item 1 with item 8 and cost both of them their point.
  B('derelict_watchtower', { name: 'Derelict Watchtower', race: 'N', hp: 500, armor: 1, w: 2, h: 2, min: 0, gas: 0, time: 600, tier: 'none', sight: 18, neutral: true,
    derelict: { ruin: 0.25, rate: 12, min: 75, gas: 0, by: 'worker', hold: true, grants: { vision: 18 } } });

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
  // Suppressing fire (M11 idea 7). One research per building that trains ranged units, unlocking it for
  // everything that building makes -- so it is a choice about a production line, not a per-unit tax.
  // Sustained fire pins: a suppressed unit is slowed while the fire keeps landing, so a machine-gun unit
  // becomes area denial rather than just low damage per second, and infantry get a role beside big units.
  // The flag lives on the tech, and Unit.suppresses reads it, so adding a fourth race would need no code.
  // Each names the units it unlocks for. Not derived from the building's `produces` list, because Zerg
  // trains everything off larva -- a hydralisk's `from` is 'larva', which is not a building and has no
  // tech list -- so the only wiring that works for all three races is an explicit set on the tech.
  // M12 added six armed units to these two production lines. They are listed here rather than left out
  // because the contract above says "one research per building, unlocking it for EVERYTHING that
  // building makes" -- a Barracks that pins with a marine and not with a marauder would be the tech
  // quietly becoming per-unit again, which is the shape this deliberately is not.
  T('suppress_inf', 'Suppressing Fire', 'T', 'barracks', 'U', 100, 100, 1200, { suppress: ['marine', 'firebat', 'ghost', 'marauder', 'reaper'] });
  T('suppress_veh', 'Sustained Barrage', 'T', 'factory', 'U', 150, 150, 1500, { suppress: ['vulture', 'siege_tank', 'goliath', 'hellion', 'cyclone', 'widow_mine', 'thor'] });
  T('suppress_hyd', 'Barbed Spines', 'Z', 'hydralisk_den', 'U', 100, 100, 1200, { suppress: ['hydralisk', 'lurker'] });
  T('suppress_air', 'Harrying Flight', 'Z', 'spire', 'U', 150, 150, 1500, { suppress: ['mutalisk', 'devourer'] });
  T('suppress_gate', 'Disruption Cadence', 'P', 'gateway', 'U', 100, 100, 1200, { suppress: ['dragoon'] });
  T('suppress_bay', 'Phase Salvo', 'P', 'stargate', 'U', 150, 150, 1500, { suppress: ['scout', 'corsair', 'carrier'] });
  T('stim', 'Stim Packs', 'T', 'academy', 'T', 100, 100, 1200);
  // The three techs below used to carry an `effect` key that nothing read, while js/sim.js applied each
  // one by unit id with the number repeated as a literal. The effect lives on the unit or weapon now,
  // through the same speedTech/sightTech/rangeTech fields twenty other defs already use. (REVIEW-M17)
  T('u238', 'U-238 Shells', 'T', 'academy', 'U', 150, 150, 1500);
  T('restoration_tech', 'Restoration', 'T', 'academy', 'R', 100, 100, 1200);
  T('optical_flare_tech', 'Optical Flare', 'T', 'academy', 'F', 100, 100, 1800);
  T('caduceus', 'Caduceus Reactor', 'T', 'academy', 'C', 150, 150, 2500, { energy: 'medic' });
  T('ion_thrusters', 'Ion Thrusters', 'T', 'machine_shop', 'I', 100, 100, 1500);
  T('spider_mines_tech', 'Spider Mines', 'T', 'machine_shop', 'M', 100, 100, 1200);
  T('siege_tech', 'Siege Tech', 'T', 'machine_shop', 'S', 150, 150, 1200);
  T('charon', 'Charon Boosters', 'T', 'machine_shop', 'C', 100, 100, 2000);
  // StarCraft II's Drilling Claws, researched where SC2 researches it: the Factory's lab, which here is
  // the Machine Shop. It shortens all three of the Widow Mine's timings -- see the `dig` block on the
  // widow_mine def for the figures and for why the numbers live there rather than here.
  T('drilling_claws', 'Drilling Claws', 'T', 'machine_shop', 'D', 75, 75, 1300);
  T('cloaking_field', 'Cloaking Field', 'T', 'control_tower', 'C', 150, 150, 1500);
  T('apollo', 'Apollo Reactor', 'T', 'control_tower', 'A', 200, 200, 2500, { energy: 'wraith' });
  T('emp_tech', 'EMP Shockwave', 'T', 'science_facility', 'E', 200, 200, 1800);
  T('irradiate_tech', 'Irradiate', 'T', 'science_facility', 'I', 200, 200, 1200);
  T('titan', 'Titan Reactor', 'T', 'science_facility', 'T', 150, 150, 2500, { energy: 'science_vessel' });
  T('yamato_tech', 'Yamato Gun', 'T', 'physics_lab', 'Y', 100, 100, 1800);
  T('colossus_reactor', 'Colossus Reactor', 'T', 'physics_lab', 'C', 150, 150, 2500, { energy: 'battlecruiser' });
  T('lockdown_tech', 'Lockdown', 'T', 'covert_ops', 'L', 200, 200, 1500);
  T('personnel_cloaking', 'Personnel Cloaking', 'T', 'covert_ops', 'C', 100, 100, 1200);
  T('ocular', 'Ocular Implants', 'T', 'covert_ops', 'O', 100, 100, 2500);
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
  // M12 wave four. Four of these five gate something real rather than describing it: `volatile_bile`
  // and `ravager_aspect` are named in a unit's `req`, `pathogen_glands` is named in an ability's
  // `tech` (Abilities.available reads it), and `glial_reconstitution` is the second half of the
  // Roach's `speedTech` pair. `pressurised_glands` is read by spawn_locusts in js/abilities.js.
  // Nothing here carries an `energy:` or `effect:` key -- both of those are inert in this engine
  // (grep: nothing reads them; the two upgrades that claim to raise max energy do not), and a tech
  // that documents a behaviour nobody implements is worse than no tech at all.
  T('volatile_bile', 'Volatile Bile', 'Z', 'spawning_pool', 'V', 150, 150, 1500);
  T('glial_reconstitution', 'Glial Reconstitution', 'Z', 'roach_warren', 'G', 150, 150, 1500);
  T('ravager_aspect', 'Ravager Aspect', 'Z', 'roach_warren', 'R', 200, 200, 1800, { req: ['lair'] });
  T('pathogen_glands', 'Pathogen Glands', 'Z', 'infestation_pit', 'P', 150, 150, 1500);
  T('pressurised_glands', 'Pressurised Glands', 'Z', 'infestation_pit', 'G', 150, 150, 2000);
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
  // M12 wave four, Protoss. Two researches and each of them IS a milestone item rather than a number.
  //
  // `blink` is the folded Stalker (see the unit block in this file): the Citadel is where a Protoss
  // movement upgrade already lives, beside Leg Enhancements, so a player looking for "the thing that
  // makes my army move differently" finds both on one card. Note the id is shared with the ability of
  // the same name -- that is legal and intentional, DATA.techs and DATA.abilities are separate tables
  // and `DATA.all` is units plus buildings only, so nothing can confuse the two.
  //
  // `warp_gate_tech` is item 12, and it sits on the Cybernetics Core because that is the building
  // whose whole job is upgrading what a Gateway does. It carries no `effect` or `energy` key: both
  // are inert in this engine, and everything this research does is gate the Warp Gate morph through
  // that building's `req`.
  T('blink', 'Blink', 'P', 'citadel_of_adun', 'B', 150, 150, 1800);
  T('warp_gate_tech', 'Warp Gate', 'P', 'cybernetics_core', 'G', 150, 150, 1800);
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
  // `autocast: true` means the ability may be ARMED by the player (right-click its card button) and
  // will then fire on its own. The set is deliberately Brood War's own: heal, restoration, and the two
  // ammo builders. Nothing here consumes a unit -- there is no autocast on infest, nuke, consume or any
  // morph, and there must not be, because an ability that spends a unit without being asked is a bug
  // the player cannot undo. Each armed ability carries its own "would this be wasted" rule in
  // G.tickAutocast; a generic energy check is not enough (a full-health target wastes a heal just as
  // surely as no energy does).
  A('heal', 'Heal', 'E', 'unit', { energy: 0, auto: true, autocast: true });
  A('restoration', 'Restoration', 'R', 'unit', { energy: 50, tech: 'restoration_tech', autocast: true });
  A('optical_flare', 'Optical Flare', 'F', 'unit', { energy: 75, tech: 'optical_flare_tech' });
  A('lockdown', 'Lockdown', 'L', 'unit', { energy: 100, tech: 'lockdown_tech', range: 8 });
  A('cloak_ghost', 'Personnel Cloaking', 'C', 'toggle', { energy: 25, tech: 'personnel_cloaking' });
  A('cloak_wraith', 'Cloaking Field', 'C', 'toggle', { energy: 25, tech: 'cloaking_field' });
  A('nuke', 'Nuclear Strike', 'N', 'point', { range: 8 });   // the silo check is in Abilities.available (p.nukes), not a flag
  A('spider_mine', 'Spider Mines', 'I', 'point', { tech: 'spider_mines_tech', range: 1 });
  A('siege_mode', 'Siege Mode', 'O', 'toggle', { tech: 'siege_tech' });
  A('defensive_matrix', 'Defensive Matrix', 'D', 'unit', { energy: 100, range: 10 });
  A('emp', 'EMP Shockwave', 'E', 'point', { energy: 100, tech: 'emp_tech', range: 8 });
  A('irradiate', 'Irradiate', 'I', 'unit', { energy: 75, tech: 'irradiate_tech', range: 9 });
  A('yamato', 'Yamato Gun', 'Y', 'unit', { energy: 150, tech: 'yamato_tech', range: 10 });
  A('scanner_sweep', 'Scanner Sweep', 'S', 'point', { energy: 50, range: 999 });
  // ---- M12 wave four, Terran ----------------------------------------------------------------------
  // Calling Down the MULE. `range: 999` matches Scanner Sweep because both are cast from a building and
  // Abilities.issue's building branch does not consult range at all -- writing a small number here
  // would be a lie the reader would have to un-learn. The real limit is distance: a MULE dropped across
  // the map spends most of its 75 seconds walking home, so where you put it is the decision.
  A('mule', 'Call Down MULE', 'M', 'point', { energy: 50, range: 999, unit: 'mule' });
  // The Viking's transform. 'toggle' rather than 'morph': a morph goes through Abilities.morph and
  // G.morphUnit, which builds a Zerg EGG (`toId === 'lurker' ? 'lurker_egg' : 'cocoon'`) and would turn
  // a Terran fighter into a chrysalis. This is the siege_mode shape instead -- an instant swap with a
  // transT lockout -- and the swap itself is in Abilities.instant.
  A('viking_mode', 'Transform', 'O', 'toggle', {});
  // The Raven's one spell. See the raven def for why it is the only one.
  A('jam_field', 'Jamming Field', 'J', 'point', { energy: 75, range: 9 });
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
  // ---- M12 wave four: the Zerg additions -------------------------------------------------------
  // Hotkeys avoid M, S, A, P and H: UI.buildCard pins Move/Stop/Attack/Patrol/Hold to those on every
  // mobile card and the dispatcher takes the FIRST button with a matching key, so an ability on one
  // of them is a key that silently does the wrong thing.
  //
  // ITEM 11, LARVA INJECT. `delay` is what makes it a decision instead of a button: ten seconds pass
  // between the cast and the larvae, so injecting is a bet that you will still want them.
  // `per` and `cap` (REVIEW-M17 task 25, a user decision): each cast ADDS `per` larvae and a hall may
  // hold up to `cap` of them, which is SC2's rule. M12 shipped it as `cap: 3` -- the same three
  // Unit.tickBuilding spawns on its own -- so inject FILLED a hatchery and never raised its ceiling, on
  // the reasoning that banked larvae rewrite Zerg's production curve. That is exactly what the user then
  // chose: a hall with a Queen on it is worth more than a hall without one. Natural spawning is untouched
  // (LARVA_NATURAL in js/sim.js: three, one per LARVA_TIME), so a hall never passes three on its own and a
  // Zerg who never injects plays the M12 game exactly. On the balance run's list.
  A('larva_inject', 'Spawn Larva', 'L', 'unit', { energy: 25, range: 4, delay: 240, per: 3, cap: 12 });
  // `energy: 25` -- FIXLIST-M15 C1 (item 2), and SC2's own price for Creep Tumour. It is charged to the
  // CASTER, so it lands on the Queen and on the Overlord (which C1 gave a pool of its own) and NOT on
  // `spawn_tumour` below, because the thing that casts that is a tumour and a tumour has no pool. That
  // asymmetry is the mechanic and not an oversight: STARTING a chain costs a caster's attention and its
  // energy, CONTINUING one costs only the 25 minerals the tumour itself is worth.
  //
  // `noApproach` -- FIXLIST-M15 C2 (item 3), amended by TODO-M18 item 3, and it is the ONLY flag of its
  // kind in the game. `range` on a point ability normally means "get this close and then cast":
  // Abilities.orderTick walks the caster to the spot first from ANY distance, which is what every other
  // point ability relies on and what made these two read as unlimited.
  //
  // With the flag the distance is BOUNDED rather than unlimited, and what happens at the bound depends
  // on whether the caster can move at all:
  //   a MOBILE caster (Queen, Overlord) walks into range and casts, up to CAST_APPROACH tiles of walk
  //     (js/abilities.js, where the number is measured); past that it refuses and says the WALK ran out.
  //   an IMMOBILE caster -- a tumour seeding its own child, which is a building and casts in issue(),
  //     or a burrowed or sieged unit -- still refuses at its range, because it will never be closer.
  // The flat refusal for a mobile caster was C2's, and the user asked for the walk back (item 3); what
  // C2 was actually right about is the building, and that half is unchanged.
  // Nothing else carries the flag, so nothing else changed.
  A('plant_tumour', 'Creep Tumour', 'C', 'point', { range: 3, energy: 25, noApproach: true });
  A('spawn_tumour', 'Spread Creep', 'C', 'point', { range: 9, noApproach: true });
  // 'instant', not 'toggle', and the reason is UI.buildCard: on a BUILDING it fires only the `instant`
  // kind directly and sends everything else to targeting mode, which would ask a spine crawler where
  // it would like to stand up. The rooting half of the pair is the Land button the card already grows
  // for anything `lifted`, and it goes through G.landBuilding, which is where the creep check lives.
  A('uproot', 'Uproot', 'U', 'instant');
  // StarCraft II's Supply Depot Lower / Raise (seventh session, item 8). One ability that toggles, like Siege Mode and
  // Burrow, so it is one button whose label says what pressing it will do (Abilities.label). R, StarCraft II's key
  // for both. What it does is in Abilities.lowerDepot.
  A('lower_depot', 'Lower', 'R', 'instant');
  A('volatile_burst', 'Volatile Burst', 'B', 'instant', { dmg: 40, r: 1.6, bldMult: 2 });
  A('corrosive_bile', 'Corrosive Bile', 'C', 'point', { energy: 25, range: 8, delay: 40, r: 1.5, dmg: 70 });
  A('spawn_locusts', 'Spawn Locusts', 'L', 'instant', { energy: 40 });
  A('fungal_growth', 'Fungal Growth', 'F', 'point', { energy: 75, range: 9, r: 2, t: 96 });
  A('spawn_infested', 'Spawn Infested', 'N', 'point', { energy: 100, range: 6, tech: 'pathogen_glands' });
  A('abduct', 'Abduct', 'B', 'unit', { energy: 75, range: 10 });
  A('consume_essence', 'Consume Essence', 'C', 'unit', { energy: 0, range: 1 });
  A('contaminate', 'Contaminate', 'C', 'unit', { energy: 75, range: 8 });
  A('nydus_worm', 'Nydus Worm', 'W', 'point', { range: 999 });
  A('baneling_aspect', 'Baneling Aspect', 'B', 'morph', { unit: 'baneling' });
  A('ravager_aspect', 'Ravager Aspect', 'R', 'morph', { unit: 'ravager' });
  A('swarm_host_aspect', 'Swarm Host Aspect', 'W', 'morph', { unit: 'swarm_host' });
  A('viper_aspect', 'Viper Aspect', 'B', 'morph', { unit: 'viper' });
  A('overseer_aspect', 'Overseer Aspect', 'O', 'morph', { unit: 'overseer' });
  A('psi_storm', 'Psionic Storm', 'T', 'point', { energy: 75, tech: 'psi_storm_tech', range: 9 });
  A('hallucination', 'Hallucination', 'L', 'unit', { energy: 100, tech: 'hallucination_tech', range: 9 });
  A('summon_archon', 'Summon Archon', 'W', 'merge', { unit: 'archon' });
  A('summon_dark_archon', 'Summon Dark Archon', 'W', 'merge', { unit: 'dark_archon' });
  A('feedback', 'Feedback', 'F', 'unit', { energy: 50, range: 10 });
  A('mind_control', 'Mind Control', 'C', 'unit', { energy: 150, tech: 'mind_control_tech', range: 8 });
  A('maelstrom', 'Maelstrom', 'E', 'point', { energy: 100, tech: 'maelstrom_tech', range: 10 });
  A('build_scarab', 'Build Scarab', 'B', 'produce', { unit: 'scarab', autocast: true });
  A('build_interceptor', 'Build Interceptor', 'I', 'produce', { unit: 'interceptor', autocast: true });
  A('disruption_web', 'Disruption Web', 'D', 'point', { energy: 125, tech: 'disruption_web_tech', range: 9 });
  A('recall', 'Recall', 'R', 'point', { energy: 150, tech: 'recall_tech', range: 999 });
  A('stasis_field', 'Stasis Field', 'T', 'point', { energy: 100, tech: 'stasis_tech', range: 9 });
  // ---- M12 wave four: the Protoss additions ----------------------------------------------------
  // Hotkeys avoid M, S, A, P and H for the same reason the Zerg block above does: UI.buildCard pins
  // Move/Stop/Attack/Patrol/Hold to those on every mobile card and the dispatcher takes the FIRST
  // button with a matching key, so an ability on one of them is a key that does the wrong thing.
  //
  // ITEM 11, CHRONO BOOST. Cast from a building, so `range: 999` matches Scanner Sweep and the MULE:
  // Abilities.issue's building branch does not consult range at all and a small number here would be
  // a lie. `t` is 20 seconds of DOUBLE speed on one building's queue, and it cannot stack -- a second
  // cast on the same building is refused and refunded rather than adding a third unit of progress a
  // frame, because "cast it twice" is the first thing a player tries and the answer has to be one a
  // player can predict. The boost lives in G.fields, not in a counter on the building, so a replay
  // seek and a rejoin reproduce the remaining time exactly.
  A('chrono_boost', 'Chrono Boost', 'C', 'point', { energy: 50, range: 999, t: 480 });
  // GUARDIAN SHIELD reuses `fx.matrix` -- the Science Vessel's Defensive Matrix -- rather than adding a
  // status of its own. A pool of absorbed damage over every unit nearby is a fair reading of the SC2
  // shield and it needs nothing from js/sim.js or js/snapshot.js: the pool ticks down in Unit.tick and
  // G.damage already spends it before armour. The alternative, a flat -2 on incoming ranged damage,
  // would have been a new branch in the damage path, which this change does not own.
  A('guardian_shield', 'Guardian Shield', 'G', 'instant', { energy: 75, r: 3, absorb: 60, t: 360 });
  // FORCE FIELD IS TERRAIN WITH A TIMER, and that is the one thing js/map.js warns will desync a
  // replay seek if it remembers a countdown of its own. It does not: the tiles go in G.fields beside
  // storm, dark swarm and the jamming field, and the walk grid is in the snapshot already.
  A('force_field', 'Force Field', 'F', 'point', { energy: 50, range: 9, r: 1.5, t: 360 });
  // GRAVITON BEAM lifts a GROUND unit out of the fight. Reuses `fx.maelstrom`, which is the one status
  // this engine has that returns from Unit.tick outright -- so a lifted unit does not move, shoot or
  // cast, which is what being held in the air means. An air target is refused and refunded.
  A('graviton_beam', 'Graviton Beam', 'G', 'unit', { energy: 50, range: 6, t: 240 });
  // REVELATION is a Comsat scan cast from a ship, and it is the Comsat's own field kind so it needs no
  // new vision code: G.updateVision already marks `scan` fields for whoever owns them. It is not
  // detection -- an Observer is still the only thing Protoss has that sees a cloaked unit.
  A('revelation', 'Revelation', 'R', 'point', { energy: 50, range: 12, r: 8, t: 480 });
  // PURIFICATION NOVA is a fuse and not a hit: two seconds pass between the cast and the blast, and it
  // hits the caster's own army too. Both halves are the balance of it -- anything with legs walks out,
  // and a nova dropped on a melee scrum kills the zealots in it.
  A('purification_nova', 'Purification Nova', 'N', 'point', { energy: 75, range: 8, delay: 48, r: 1.5, dmg: 100 });
  // TIME WARP slows enemy GROUND units inside it, and refreshes `fx.ensnare` every frame the way
  // Disruption Web and the Jamming Field refresh theirs -- so walking out of it clears in two frames
  // with no per-unit list for a snapshot to carry. Allies are exempt and flyers are exempt.
  A('time_warp', 'Time Warp', 'W', 'point', { energy: 100, range: 9, r: 2.5, t: 720 });
  // BLINK. No energy: a Dragoon has no energy bar, so the whole cost is the ten-second recharge, which
  // is stamped on the unit as `blinkAt` rather than kept as a counting-down field. That is deliberate
  // and it is the determinism-safe half: a frame stamp is a fact about the past that a snapshot
  // restores by copying one number, where a countdown has to be ticked by something.
  A('blink', 'Blink', 'B', 'point', { tech: 'blink', range: 8, cd: 240 });
  // The Mothership is merged, not built. `from` names what is consumed: Abilities.merge used to derive
  // it from the id ('summon_archon' or else dark templar), which silently made this one want dark
  // templar, so the pair is named in the data now and the old guess is only a fallback.
  A('summon_mothership', 'Summon Mothership', 'W', 'merge', { unit: 'mothership', from: 'arbiter' });
  // ITEM 12, THE FIVE WARP-INS. One per Gateway unit, each carrying the unit's own hotkey so a Warp
  // Gate's card reads exactly like the Gateway's did. `range: 999` for the reason Chrono Boost has it:
  // the real limit is the psi grid, not a distance from the building, and a number here would suggest
  // otherwise. `form` is how long the unit is helpless after it lands.
  const WARP = (id, hk) => A('warp_' + id, 'Warp In ' + units[id].name, hk, 'point', { warp: true, unit: id, range: 999, form: 48, cdMult: 1.25 });
  WARP('zealot', 'Z'); WARP('dragoon', 'D'); WARP('sentry', 'E'); WARP('high_templar', 'T'); WARP('dark_templar', 'K');

  // Command-card ordering hints for worker build menus.
  //
  // EIGHT PER PAGE, AND THAT IS A CEILING, NOT A STYLE. UI.buildCard hands entry `i` the card slot `i`
  // and then puts Cancel in slot 8, and the card is a fixed three-by-three in both UI.cardRect and
  // HUD's override of it. A ninth entry lands under Cancel and a tenth lands off the bottom of the
  // console. Protoss is at sixteen of sixteen, which is why its three new structures are morphs of the
  // Shield Battery rather than entries here.
  //
  // A building's `tier` must agree with the page it is listed on: test/playtest_bot.js presses "Build"
  // or "Build Advanced" on the strength of `tier === 'adv'`.
  const buildMenu = {
    T: { basic: ['command_center', 'supply_depot', 'refinery', 'barracks', 'engineering_bay', 'missile_turret', 'academy', 'bunker'], adv: ['factory', 'starport', 'science_facility', 'armory', 'aid_station', 'scrambler_mast', 'blast_barricade', 'sensor_tower'] },
    Z: { basic: ['hatchery', 'creep_colony', 'extractor', 'spawning_pool', 'evolution_chamber', 'hydralisk_den', 'carapace_ridge', 'roach_warren'], adv: ['spire', 'queens_nest', 'nydus_canal', 'ultralisk_cavern', 'defiler_mound', 'mending_pool', 'miasma_gland', 'infestation_pit'] },
    P: { basic: ['nexus', 'pylon', 'assimilator', 'gateway', 'forge', 'photon_cannon', 'cybernetics_core', 'shield_battery'], adv: ['robotics_facility', 'stargate', 'citadel_of_adun', 'robotics_support_bay', 'fleet_beacon', 'templar_archives', 'observatory', 'arbiter_tribunal'] },
  };
  // ELEVEN, AND THAT IS THE CEILING. The larva card is these plus Set Rally, flowed by UI.paginate,
  // which gives twelve slots when nothing on the card is pinned -- and the larva card pins nothing.
  // At thirteen flowed buttons paginate would grow a "More" turn and put it on the same slot as the
  // twelfth entry, because `per` is CARD_SLOTS when there are no pins and the page turn then lands on
  // `last` alongside it. That is a latent bug in UI.paginate, not a rule; it is simply not this
  // change's file to fix, so M12's four new larva-tier units are two here and two as aspects off a
  // roach and a mutalisk. APPENDED rather than sorted: every existing entry keeps the slot a Zerg
  // player's hands already know.
  const larvaMorphs = ['drone', 'overlord', 'zergling', 'hydralisk', 'mutalisk', 'scourge', 'queen', 'ultralisk', 'defiler', 'roach', 'infestor'];

  // ============================ CREEP MOVEMENT ============================
  // FIXLIST-M15 C3 (item 5, second half): "All zerg units on creep should have their speed increased
  // just like it is in StarCraft 2 so look up the exact percentage." Measured absent first -- every
  // one of 23 cases moved the same distance on creep and off it, and every `u.speed` read identical.
  //
  // The multipliers are StarCraft II's, from Liquipedia's Creep and Speed pages. `_` is the default
  // that any Zerg ground unit without an entry gets; a named entry overrides it.
  //
  // THIS LIVES IN `DATA` AND NOT IN A CONST OF ITS OWN, for the reason spelled out at the bottom of
  // this file for RACE_INFO.N: js/build.js hashes DATA and does not hash arbitrary globals. Unit.speed
  // is hashed by source, so the CODE that reads this table is stamped either way -- but the NUMBERS
  // in it would not have been, and retuning them would change the simulation while leaving the build
  // stamp still. That is the exact desync js/build.js exists to refuse, and CHURN_SLOW in js/map.js
  // still has the hole. Do not copy that.
  //
  // THE EXCEPTIONS ARE THE POINT and each one is here on purpose:
  //   drone      -- SC2 gives the Drone no creep bonus. It is the one most likely to be missed and
  //                 the one that most changes the early game if it is wrong: a 30% faster worker is
  //                 a faster mineral line, and the request was about ARMIES moving over their own
  //                 ground. The Drone sees nothing.
  //   broodling  -- no bonus in SC2 either. It is a timed nuisance, not a unit you manoeuvre.
  //   changeling -- SC2's scout-disguise unit. THERE IS NO CHANGELING DEF IN THIS GAME. The entry is
  //                 here so that adding one later cannot silently hand it the default bonus.
  //   locust     -- 40%, not 30%. It is already fast and already on a timer.
  //   queen      -- SC2's Queen is a GROUND unit that crawls at 1.88 off creep and 5.01 on it, which
  //                 is where +167% comes from. THE QUEEN IN THIS GAME FLIES -- Brood War's Queen,
  //                 `fly: true` in her def -- and she already moves at 6.67, which is ABOVE SC2's
  //                 on-creep figure. So she gets nothing, from the flier rule, and the 2.67 below is
  //                 inert. It is recorded rather than dropped because "+167% Queen" is what the
  //                 request named, and the next person deserves to find the answer here rather than
  //                 conclude it was forgotten. Making her a ground unit would light it up.
  //   crawlers   -- 150%. Unit.speed pins ANY lifted building to a flat 1, so an uprooted Sunken or
  //                 Spore colony crawls at 1 off creep and 2.5 on it. That is the one case where the
  //                 bonus is applied after a hard override rather than to a def's own number.
  const creepSpeed = { _: 1.30, drone: 1, broodling: 1, changeling: 1, locust: 1.40, queen: 2.67, sunken_colony: 2.50, spore_colony: 2.50 };

  // ============================ THE BURIED TELL ============================
  // What marks the ground above a buried creature. This is the feature, not a garnish on it: the
  // horror of something coming out of the floor only works if the player could have known, and the
  // whole difference between "unfair" and "your fault" is one patch of disturbed earth.
  //
  // It has to be its own data with its own painter rather than a state of the creature's sprite, for
  // a reason that is structural and not stylistic. A buried creature is `u.burrowed`, which makes it
  // `u.isCloaked`, which makes it invisible without a detector -- so the marker must be drawn when
  // the unit is not, and cannot be a frame of the unit's own sheet. Sprites.unit also caches per
  // (facing, animation frame) and nothing in that key could carry "buried".
  //
  //   sprite:  <key>      the UNIT_PAINTERS entry that draws it. Called as a unit painter would be:
  //                       painter(PaintHelpers(c), r * TILE, tint, tintDark, { walk: null, atk: null })
  //   r:       <tiles>    how wide the disturbed patch is. Bigger creature, bigger patch, which is
  //                       what lets a player read WHICH thing is down there before waking it
  //   period:  <frames>   the loop length of whatever the painter's animated cousin does. Purely
  //                       cosmetic and safe to ignore; it is here so two tells do not pulse in step
  //
  // RULES THE RENDERER OWNS, written here because they are the contract and not the drawing:
  //   * NO DETECTOR REQUIRED. A tell is not a detection. It shows to any player whose vision covers
  //     that ground, with or without a detector, from the first frame of the game. This is the one
  //     clause that must not be "improved"
  //   * it shows on CURRENTLY VISIBLE ground only, under the fog rules everything else obeys. Ground
  //     you have never seen shows nothing; ground you saw an hour ago shows nothing today
  //   * it is decoration, not a unit: never selectable, never targetable, never in the spatial hash,
  //     never in a snapshot. It is derived every frame from the buried creature that is already there
  //   * it is drawn UNDER units and over terrain, and it disappears the moment the creature surfaces
  //   * a tell does not say how MANY. A warren's vent field looks the same with one grub left as with
  //     four, which is the difference between a warning and a readout
  const buriedTells = {
    churn: { sprite: 'tell_churn', r: 1.2, period: 96 },    // carrion grub -- a scuffed patch and a few claw ridges
    mound: { sprite: 'tell_mound', r: 2.2, period: 150 },   // carrion maw -- a long low swell with a crack down it
    vent: { sprite: 'tell_vent', r: 2.6, period: 120 },     // carrion warren -- breathing holes ringed with pale dust
  };

  // ============================ THE PER-MAP TOGGLES ============================
  // Both wave-two features are OFF unless a layout asks for them, and both are asked for the same
  // way the sandstorm is (js/map.js, MAP_LAYOUTS.dustbowl): a key on the layout naming a preset.
  //
  //   L.derelicts = <preset name> | true | false | { ...an inline preset }
  //   L.wildlife  = <preset name> | true | false | { ...an inline preset }
  //
  // Absent or false means the feature does not exist on that map, and that is the default for every
  // layout that already exists. `true` means 'standard'. Resolution, which the map generator does:
  //
  //   const cfg = L.derelicts && (DATA.derelictPresets[L.derelicts === true ? 'standard' : L.derelicts]
  //                               || (typeof L.derelicts === 'object' ? L.derelicts : null));
  //
  // These tables live inside DATA on purpose. js/build.js hashes DATA, so two clients that disagree
  // about how many derelicts a map has cannot agree about the build -- which is the whole job of the
  // stamp. A top-level const beside HAZARDS would not be hashed at all.
  //
  //   count    how many to place, in TOTAL across the map
  //   kinds    which building ids to draw from, cycled in order so a count of 4 over 3 kinds is
  //            2/1/1 and never random. Placement position may be seeded; the CAST may not, because
  //            "which derelicts does this map have" is something both players should be able to read
  //            off the map name
  //   minBase  minimum tiles from any start location's hall. A derelict inside somebody's main is
  //            not a map objective, it is a coin flip on spawn
  //   minRes   minimum tiles from any mineral patch or geyser, so nothing ever blocks a mineral line
  //   minEach  minimum tiles between two of them
  //   mirror   place them symmetrically about the map's own symmetry, so no start is closer to the
  //            foundry than another. On a layout with no symmetry this degrades to "as far apart as
  //            the spacing rules allow" and the generator says so
  const derelictPresets = {
    sparse: { count: 2, kinds: ['derelict_watchtower', 'derelict_archive'], minBase: 14, minRes: 6, minEach: 20, mirror: true },
    standard: { count: 3, kinds: ['derelict_watchtower', 'derelict_archive', 'derelict_foundry'], minBase: 14, minRes: 6, minEach: 18, mirror: true },
    rich: { count: 6, kinds: ['derelict_watchtower', 'derelict_archive', 'derelict_foundry'], minBase: 10, minRes: 6, minEach: 12, mirror: true },
  };
  // The wildlife toggle is the same shape and exists for the same reason. Item 1 is not per-map in
  // the design document, but it has to be per-map in the data or it retro-changes every mission and
  // every balance log in the repository the moment it lands -- the argument HAZARDS already makes in
  // js/map.js, and the reason `dustbowl` is one layout rather than a global rule.
  //
  //   sites    how many separate creature sites to place
  //   kinds    weighted draw, [id, weight]. Cycled deterministically, not sampled
  //   pack     how many creatures per site, [min, max] inclusive, seeded per site
  //   minBase  minimum tiles from any start hall -- a creature in your main at frame 0 is not an
  //            ambush, it is a loss
  //   nearRes  place sites NEAR resources rather than anywhere: the whole point is that they sit on
  //            the ground you want to expand onto. Tiles from a patch to prefer
  const wildlifePresets = {
    sparse: { sites: 3, kinds: [['carrion_grub', 3], ['carrion_warren', 1]], pack: [2, 3], minBase: 22, nearRes: 8, mirror: true },
    standard: { sites: 5, kinds: [['carrion_grub', 3], ['carrion_warren', 1], ['carrion_maw', 1]], pack: [2, 4], minBase: 20, nearRes: 8, mirror: true },
    infested: { sites: 9, kinds: [['carrion_grub', 3], ['carrion_warren', 2], ['carrion_maw', 2]], pack: [3, 5], minBase: 16, nearRes: 6, mirror: true },
  };

  // ---------------------------------------------------------------------------------------------
  // WHAT EVERY THING IS FOR (FIXLIST-M14 A1). One or two sentences per unit and per building,
  // saying what you would use it for -- never restating a stat the tooltip already prints beside
  // it. The command card tooltip and the codex both render this, so a def with no `desc` shows a
  // player a name and a price and nothing that tells them why they would build it.
  //
  // A TABLE RATHER THAN A FIELD ON EACH DEF, for two reasons. The def lines are already long enough
  // to need horizontal scrolling and a sentence of prose on the end of each would finish them off;
  // and test/version.js probes js/data.js by SOURCE TEXT to prove an edit moves the build stamp, so
  // leaving all 158 existing def lines byte-identical keeps that probe testing what it thinks it is.
  //
  // test/card.js asserts every unit and every building has one and that it is under DESC_MAX
  // characters, so a def added later cannot ship without one.
  // WHAT EACH WEAPON LOOKS LIKE WHEN IT FIRES. FIXLIST-M15 A1.
  //
  // This was a hardcoded list of unit ids inside Combat.visual(), and anything not on the list fell
  // through to a small white bullet. Measured before the change: of the 63 armed units and buildings,
  // 29 were named and 34 were not, so 54% of everything in the game fired the identical white dot --
  // including every unit M12 added. The Colossus, the Carrier, the Void Ray, the Immortal, the Thor
  // and the Mutalisk all looked the same.
  //
  // Keyed by WEAPON, not by unit, which is the actual fix and not just a longer list. A Goliath's
  // autocannon and its anti-air rockets are two different weapons and used to draw identically; so
  // did the Wraith's laser and its missiles, the Scout's twin guns, and the Thor's two mounts.
  //
  // Kept out of the def lines on purpose, exactly like DESC below: test/version.js reaches into this
  // file by SOURCE TEXT to prove an edit moves the build stamp, and long def lines are what it reads.
  //
  // The three races are deliberately disjoint in KIND, not merely in colour, so that a zoomed-out
  // fight is readable: Terran fires solid objects, Zerg fires organic matter, Protoss fires energy.
  // Colour then separates units inside a race.
  const SHOT = {
    // ---- Terran: kinetic. Bullets are pale and fast, shells are heavy and orange, rockets trail smoke,
    // flak bursts rather than travels. Everything Terran shoots is a physical object.
    // The two LINE weapons live here too, so SHOT is the ONE place any look is chosen. Combat.fire's
    // line branch reads w.fx the same way the projectile branch does -- FIXLIST-M14 C5 made that true
    // and this keeps it true rather than leaving one weapon configured somewhere else.
    'hellion:gw': ['flamejet', '#f83'],
    'lurker:gw': ['spines', '#c96'],
    'scv:gw': ['punch', '#ccb'],
    'marine:gw': ['gauss', '#ffd'],
    'firebat:gw': ['flame', '#f92'],
    'ghost:gw': ['gauss', '#dfe'],
    'vulture:gw': ['frag', '#fd6'],
    'siege_tank:gw': ['shell', '#fc6'],
    'goliath:gw': ['gauss', '#ffc'],
    'goliath:aw': ['rocket', '#fb8'],
    'wraith:gw': ['gauss', '#ffd'],
    'wraith:aw': ['rocket', '#fa6'],
    'battlecruiser:gw': ['battery', '#fd8'],
    'valkyrie:aw': ['flak', '#fc7'],
    'spider_mine:gw': ['shell', '#f84'],
    'marauder:gw': ['rocket', '#fc9'],
    'reaper:gw': ['gauss', '#fed'],
    'cyclone:gw': ['rocket', '#9df'],
    'widow_mine:gw': ['flak', '#f7a'],
    'thor:gw': ['shell', '#fd7'],
    'thor:aw': ['flak', '#fe9'],
    'banshee:gw': ['rocket', '#f96'],
    'liberator:gw': ['shell', '#fb5'],
    'viking:aw': ['rocket', '#fca'],
    'viking_a:gw': ['gauss', '#ffd'],
    // ---- Zerg: organic. Spines and needles are chitin, acid is green and wet, teeth and claws are close.
    'drone:gw': ['claw', '#b9d'],
    'zergling:gw': ['claw', '#d97'],
    'hydralisk:gw': ['needle', '#dc7'],
    'mutalisk:gw': ['glaive', '#cf9'],
    'scourge:aw': ['boom', '#af6'],
    'guardian:gw': ['acid', '#ad4'],
    'devourer:aw': ['acid', '#9c3'],
    'ultralisk:gw': ['claw', '#e97'],
    'broodling:gw': ['claw', '#c86'],
    'infested_terran:gw': ['boom', '#8c4'],
    'roach:gw': ['acid', '#8d3'],
    'ravager:gw': ['acid', '#7c2'],
    'baneling:gw': ['acid', '#bd3'],
    'locust:gw': ['acid', '#9d5'],
    // The Battlecruiser fires 'battery' and not 'laser', and the Corsair fires 'plasma' and not
    // 'flak', for one reason: test/shots.js asserts the three races share NO shot kind, and those two
    // rows were the only crossings. Readability by race is the whole point of the table, so the rule
    // wins over the flavour of the word 'laser'.
    // ---- Protoss: energy. Plasma is a ball, beams are continuous, psi crackles. Nothing Protoss fires
    // is solid, so none of it reuses a Terran kind.
    'probe:gw': ['laser', '#9cf'],
    'zealot:gw': ['blade', '#cdf'],
    'dragoon:gw': ['plasma', '#6cf'],
    'dark_templar:gw': ['blade', '#a7f'],
    'archon:gw': ['psi', '#dbf'],
    'reaver:gw': ['plasma', '#fc7'],
    'scout:gw': ['laser', '#8cf'],
    'scout:aw': ['plasma', '#9df'],
    'corsair:aw': ['plasma', '#adf'],
    'carrier:gw': ['laser', '#cef'],
    'interceptor:gw': ['laser', '#cef'],
    'arbiter:gw': ['plasma', '#b9f'],
    'sentry:gw': ['plasma', '#8df'],
    'immortal:gw': ['plasma', '#7bf'],
    'colossus:gw': ['beam', '#fd9'],
    'phoenix:aw': ['beam', '#9ef'],
    'oracle:gw': ['beam', '#f9d'],
    'void_ray:gw': ['beam', '#c9f'],
    'tempest:gw': ['plasma', '#adf'],
    'mothership:gw': ['psi', '#c8f'],
    // ---- neutral wildlife, and the five armed buildings.
    'carrion_grub:gw': ['claw', '#ba8'],
    'carrion_maw:gw': ['claw', '#c97'],
    'sentinel:gw': ['laser', '#8fc'],
    'missile_turret:aw': ['rocket', '#fb8'],
    'planetary_fortress:gw': ['shell', '#fd8'],
    'sunken_colony:gw': ['needle', '#c85'],
    'spore_colony:aw': ['acid', '#ad5'],
    'photon_cannon:gw': ['laser', '#8cf'],
  };

  // WHAT EVERY ABILITY DOES, AND WHAT IT CAN BE USED ON. FIXLIST-M15 A2.
  //
  // M14's A1 gave a description to every unit and every building and stopped there, so 0 of the 80
  // abilities in the game explained themselves. The reported symptom was Spawn Broodlings -- 'I'm not
  // sure what it does and it only says invalid target' -- but Spawn Broodlings is simply the one that
  // got noticed. Every ability had the same hole.
  //
  // THE SECOND HALF OF EACH SENTENCE IS THE POINT. 'What it does' was never the whole complaint; the
  // complaint was not knowing what to click. So anything with a target rule that can refuse states the
  // rule -- Lockdown says mechanical, Maelstrom says organic, Spawn Broodlings says ground organic and
  // not robotic -- because that is the sentence that stops a player guessing at a red error message.
  //
  // Kept out of the def lines, exactly like DESC and SHOT: test/version.js reads this file's def lines
  // as SOURCE TEXT to prove an edit moves the build stamp.
  const ABIL_DESC = {
    // ---- shared
    gather: 'Send a worker to mine minerals or gas. Right-clicking a patch does the same thing.',
    repair: 'Repair a damaged mechanical unit or any building, spending minerals as it works. Organic units cannot be repaired.',
    build_basic: 'Open the list of basic structures this worker can put up.',
    build_adv: 'Open the list of advanced structures, which need a tech building of their own first.',
    morph_menu: 'Open the list of things this unit can turn into. Morphing consumes the unit.',
    unload: 'Unload every passenger at once. Click a spot to choose where they come out.',
    // ---- Terran
    stim: 'Costs 10 HP and makes this unit fire and move much faster for a short time. Works on Marines, Firebats, Marauders and Reapers, and stacks with nothing.',
    heal: 'Restore health to a friendly organic unit, a little at a time, for 1 energy per point. Mechanical units cannot be healed.',
    restoration: 'Strip a friendly unit of Lockdown, Irradiate, Optical Flare, Ensnare, Plague, Parasite and Maelstrom.',
    optical_flare: 'Blind an organic unit: its sight collapses to one tile, so it can still shoot but can no longer see for itself or spot for others.',
    lockdown: 'Freeze an enemy MECHANICAL unit solid for about 50 seconds. It cannot move, shoot or cast. Organic units are immune.',
    cloak_ghost: 'Turn invisibility on or off. While cloaked the Ghost drains energy and only detectors can see it.',
    cloak_wraith: 'Turn invisibility on or off. While cloaked the Wraith drains energy and only detectors can see it.',
    nuke: 'Paint a target spot for a nuclear missile from a Nuclear Silo. The Ghost must stand still and stay alive while it falls, and everyone on the map is warned.',
    spider_mine: 'Bury a Spider Mine that waits underground and charges the first enemy ground unit to come near. Three per Vulture, and they do not come back.',
    siege_mode: 'Anchor the tank into Siege Mode for much longer range and splash damage, at the cost of being unable to move, or unpack again.',
    defensive_matrix: 'Cover a friendly unit in a shield that absorbs 250 damage of any kind for about 40 seconds. Works on any unit, including mechanical.',
    emp: 'Strip every unit in the blast of ALL shields and ALL energy. Devastating against Protoss and against casters; harmless to a unit with neither.',
    irradiate: 'Poison a unit so that it and everything organic near it takes damage for 25 seconds. A mechanical host takes none itself but still carries it.',
    yamato: 'Charge a shot for about two seconds and deal 260 damage to a single target, unit or building. Cancelled if the Battlecruiser is interrupted.',
    scanner_sweep: 'Reveal an area anywhere on the map for a few seconds, detectors included, so cloaked and burrowed units show up. Costs a Comsat\'s energy.',
    mule: 'Call down a MULE anywhere you can see. It mines minerals much faster than an SCV and expires after 75 seconds.',
    viking_mode: 'Switch between fighter mode, which flies and shoots only air, and assault mode, which walks and shoots only ground.',
    jam_field: 'Scramble enemy detection in an area so cloaked and burrowed units stay hidden inside it.',
    // ---- Zerg
    burrow: 'Dig in or dig out. A burrowed unit cannot move or be hit, and only a detector can see it. Most Zerg ground units can burrow once it is researched.',
    lurker_aspect: 'Turn a Hydralisk into a Lurker, which attacks only while burrowed and hits everything in a line.',
    guardian_aspect: 'Turn a Mutalisk into a Guardian: long-range, heavy damage, ground only, and slow.',
    devourer_aspect: 'Turn a Mutalisk into a Devourer, an anti-air unit whose acid makes its target take more damage from everything.',
    parasite: 'Attach to any enemy unit and see everything it sees, for the rest of its life. It does no damage and cannot be removed except by Restoration.',
    ensnare: 'Slow every unit in the area, air or ground, and reveal cloaked ones. Does no damage.',
    spawn_broodling: 'KILLS a ground organic unit outright and hatches two Broodlings from its corpse, which live about 75 seconds. Cannot target air, buildings, or Protoss robotic units.',
    dark_swarm: 'Drop a cloud that blocks ALL ranged fire against ground units under it, friend and foe. Melee attacks and splash still work.',
    plague: 'Damage everything in the area over time, down to a minimum of 1 HP. It cannot kill on its own, and it ignores whether a target is organic.',
    consume: 'Eat one of your own units to restore 50 energy to the Defiler. Cannot eat larvae, eggs or itself.',
    nydus_exit: 'Place the far end of a Nydus Canal at another base you hold. Until it has one, the canal does nothing at all.',
    infest: 'Take over an enemy Terran Command Center that has been damaged below half health, turning it into an Infested Command Center.',
    larva_inject: 'Add three larvae to one of your Hatcheries after a short delay, up to twelve. A hall never passes three on its own.',
    plant_tumour: 'Costs 25 energy. Grow a Creep Tumour on creep you are standing over. It spreads creep around itself and can seed one more tumour of its own.',
    spawn_tumour: 'Seed one more Creep Tumour anywhere within nine tiles that is already creep. Each tumour may do this exactly once, ever.',
    uproot: 'Pull a Spine or Spore Crawler out of the ground so it can walk. It cannot attack until it roots again.',
    lower_depot: 'Sink the depot so ground units can walk over it; raise it to block again. Supply is unaffected. Rising pushes your units aside, and an enemy standing on it stops it rising.',
    volatile_burst: 'Detonate the Baneling, destroying it and dealing splash damage to ground units around it.',
    corrosive_bile: 'Launch a shell that lands after a short delay and hits everything at that spot, including destructible terrain. Anything with legs can walk out of it.',
    spawn_locusts: 'Release Locusts that fly out, land, attack ground targets for a while, then die. The Swarm Host keeps working from cover.',
    fungal_growth: 'Root every enemy in the cloud in place and silence them: nothing inside moves, shoots or casts while it lasts. Your own units are unaffected.',
    spawn_infested: 'Drop two Infested Terrans at a spot. They live for a short time and explode on whatever they reach.',
    abduct: 'Drag an enemy unit across the map to the Viper. It arrives un-sieged and un-burrowed. Cannot take buildings, larvae, eggs or mines.',
    consume_essence: 'Eat the health of one of your own finished buildings to restore the Viper\'s energy. The building must be above 120 HP.',
    contaminate: 'Stop an enemy building producing anything at all for a while. It does no damage and does not stop what is already in progress.',
    nydus_worm: 'Surface a Nydus Worm mouth anywhere on your creep, linked to the Nydus Network, so your army can cross the map underground.',
    baneling_aspect: 'Turn a Zergling into a Baneling, which is a walking bomb.',
    ravager_aspect: 'Turn a Roach into a Ravager, which gains the Corrosive Bile shell.',
    swarm_host_aspect: 'Turn a Roach into a Swarm Host, which fights by sending free Locusts forward instead of attacking itself.',
    viper_aspect: 'Turn a Mutalisk into a Viper, a flying caster that drags enemies out of position.',
    overseer_aspect: 'Turn an Overlord into an Overseer: faster, a detector, and able to Contaminate.',
    // ---- Protoss
    psi_storm: 'Burn everything in the area, friend and foe, for heavy damage over about three seconds. Storms do not stack on the same spot.',
    hallucination: 'Create two illusory copies of a friendly unit. They deal no damage, die to a couple of hits, and fade after a while.',
    summon_archon: 'Merge two High Templar into an Archon. Both are consumed.',
    summon_dark_archon: 'Merge two Dark Templar into a Dark Archon. Both are consumed.',
    feedback: 'Burn away a target\'s entire energy pool and deal that much damage to it. Useless against anything with no energy.',
    mind_control: 'Permanently take an enemy unit as your own. Costs the Dark Archon all of its shields. Cannot take buildings, larvae or eggs.',
    maelstrom: 'Freeze every ORGANIC unit in the area for about six seconds. Mechanical and robotic units are immune.',
    build_scarab: 'Load another Scarab into the Reaver. It carries a few at a time and fires one per attack.',
    build_interceptor: 'Build another Interceptor for the Carrier, which is what actually does its fighting.',
    disruption_web: 'Blanket an area so that ground units inside it cannot attack at all. They can still move, and air units are unaffected.',
    recall: 'Teleport every unit you own near the target spot to the Arbiter, from anywhere on the map you can see.',
    stasis_field: 'Freeze every unit in the area in unbreakable crystal: they cannot act, and NOTHING can damage them either. Use it to remove part of a fight.',
    chrono_boost: 'Speed up everything a friendly building is producing or researching for a while. Cannot be stacked on the same building.',
    guardian_shield: 'Reduce all ranged damage taken by friendly units around the Sentry while it lasts. Melee damage is unaffected.',
    force_field: 'Drop a wall of energy that ground units simply cannot cross, for a while. Air units ignore it. It is terrain, not a weapon.',
    graviton_beam: 'Lift an enemy ground unit into the air where it cannot move or attack, and can only be hit by anti-air.',
    revelation: 'Reveal a wide area for a while, cloaked and burrowed units included.',
    purification_nova: 'Launch a slow nova that detonates after a moment for heavy splash damage. Anything that moves can leave before it lands.',
    time_warp: 'Slow every enemy unit inside the field, ground and air, for a long while. Does no damage.',
    blink: 'Teleport the Dragoon a short distance instantly, through terrain and past anything in the way.',
    summon_mothership: 'Merge two Arbiters into a Mothership. Only one Mothership may exist at a time.',
    warp_zealot: 'Warp a Zealot straight onto the psi grid, anywhere a Pylon powers, instead of walking it out of a Gateway.',
    warp_dragoon: 'Warp a Dragoon straight onto the psi grid, anywhere a Pylon powers.',
    warp_sentry: 'Warp a Sentry straight onto the psi grid, anywhere a Pylon powers.',
    warp_high_templar: 'Warp a High Templar straight onto the psi grid, anywhere a Pylon powers.',
    warp_dark_templar: 'Warp a Dark Templar straight onto the psi grid, anywhere a Pylon powers.',
  };

  const DESC = {
    command_center: 'The Terran main base. Trains SCVs, takes in everything they mine, and lifts off to move somewhere else when a base runs dry.',
    comsat_station: 'A Command Center add-on. Its scanner sweep reveals any patch of the map for a moment, cloaked units included -- the cheapest detection Terran has.',
    nuclear_silo: 'A Command Center add-on that builds and holds one nuclear missile, ready for a Ghost to paint a target with it.',
    supply_depot: 'Housing that raises your supply ceiling. Cheap enough to double as masonry: a line of depots across a ramp keeps ground units out entirely.',
    refinery: 'Built over a vespene geyser so SCVs can harvest gas. Almost everything past basic infantry needs it.',
    barracks: 'The Terran infantry line -- Marines, Firebats, Medics, Ghosts, Marauders and Reapers -- and the first step of the tech tree everything else hangs off.',
    engineering_bay: 'Researches infantry weapons and armour, and unlocks the Missile Turret and Sensor Tower. It lifts off, so it can also plug a ramp.',
    academy: 'Infantry support research: Stimpacks, longer Marine range, and what the Medic can do. It also gates the Ghost and the Orbital Command.',
    missile_turret: 'Static anti-air, and a detector. Two or three of them turn a base from an easy cloaked raid into an expensive one.',
    bunker: 'A garrison for up to four infantry. They shoot from inside at longer range and are safe from splash until the bunker itself falls.',
    factory: 'The Terran mechanical line -- Vultures, Siege Tanks, Goliaths, Hellions, Cyclones, Widow Mines and Thors -- and the way through to the Starport.',
    machine_shop: 'A Factory add-on. Unlocks the Siege Tank and researches Siege Mode, Spider Mines, faster Vultures and longer Goliath range.',
    starport: 'Builds everything Terran flies, from the Wraith and the Dropship up to the Battlecruiser.',
    control_tower: 'A Starport add-on. Unlocks the heavier air units and researches Wraith cloaking and more energy for Terran casters.',
    science_facility: 'Terran late research, and the parent of both the Physics Lab and Covert Ops. Unlocks the Science Vessel.',
    physics_lab: 'A Science Facility add-on. Unlocks the Battlecruiser and researches its Yamato Cannon.',
    covert_ops: 'A Science Facility add-on for Ghost work: Lockdown, personal cloaking, further sight and deeper energy.',
    armory: 'Researches weapons and plating for Terran vehicles and ships, and unlocks the Goliath and the Valkyrie.',
    aid_station: 'A dressing station behind the line. Everything friendly inside its radius slowly mends, for free, with nothing to micromanage. Put it where your army regroups.',
    scrambler_mast: 'An electronic warfare mast. Enemy units inside its radius lose half their sight and their detection, so they fight without seeing what is hitting them.',
    blast_barricade: 'Poured concrete with no purpose but shape. Wall a ramp or narrow a choke so an attack has to arrive where you want it.',
    orbital_command: 'A Command Center refitted for orbital support. It calls down MULEs, which out-mine an SCV several times over for a short working life.',
    planetary_fortress: 'A Command Center rebuilt as a fort: heavy armour and a cannon that punishes anything walking into the base. It gives up the ability to lift off.',
    sensor_tower: 'An early-warning array. It reports enemy movement well beyond what you can see, so an attack is a thing you knew about rather than a thing that happened.',
    reactor: 'A Barracks add-on. The building trains two units at a time instead of one, which is what turns a single Barracks into a real production line.',
    hatchery: 'The Zerg main base. It spawns the larvae every Zerg unit is made from, grows creep around itself, and takes in what Drones mine.',
    lair: 'A Hatchery grown deeper. Opens the middle of the tech tree and the research that turns an Overlord from a supply cost into a tool.',
    hive: 'The last form of the Hatchery, and the door to Ultralisks, Defilers and the Greater Spire.',
    creep_colony: 'A lump of defensive tissue that does nothing at all on its own. Morph it into a Sunken or a Spore Colony.',
    sunken_colony: 'Static anti-ground defence grown from a Creep Colony. Its tentacle hits hard and slowly, so it wants something beside it that handles a swarm.',
    spore_colony: 'Static anti-air defence grown from a Creep Colony, and a detector. The Zerg answer to anything cloaked or flying.',
    extractor: 'Grown over a vespene geyser so Drones can harvest gas.',
    spawning_pool: 'The first thing a Zerg builds after a Drone line. Unlocks Zerglings, the Sunken Colony, and every Zerg building past the basics.',
    evolution_chamber: 'Researches Zerg ground weapons and carapace, and unlocks the Spore Colony.',
    hydralisk_den: 'Unlocks the Hydralisk, its range and speed evolutions, and the Lurker aspect it can morph into.',
    spire: 'Unlocks Mutalisks and Scourge and evolves flyer attacks and carapace. The Zerg answer to anything in the air.',
    greater_spire: 'A Spire grown on a Hive. Unlocks the Guardian and Devourer aspects and carries flyer evolutions to their last level.',
    queens_nest: 'Unlocks the Queen and her spells, and is what a Hatchery needs before it can become a Hive.',
    ultralisk_cavern: 'Unlocks the Ultralisk and the evolutions -- speed and chitin -- that let it lead an attack instead of dying in front of one.',
    defiler_mound: 'Unlocks the Defiler and its two battle-deciding spells, Dark Swarm and Plague.',
    nydus_canal: 'One mouth of a tunnel through the ground. Anything that walks in here surfaces instantly at a worm placed anywhere your creep reaches.',
    infested_command_center: 'A Terran hall taken and infested. It trains Infested Terrans, which walk into an enemy line and come apart.',
    mending_pool: 'A pool of regenerative fluid. Everything friendly inside its radius slowly mends, for free. Grow it where your swarm falls back to.',
    miasma_gland: 'A gland that vents blinding spores. Enemy units inside its radius lose most of their sight and their detection.',
    carapace_ridge: 'A cheap ridge of dead chitin with no purpose but shape. Wall a ramp or narrow a choke so an attack comes the way you want it.',
    roach_warren: 'Unlocks the Roach, the evolution that lets it burrow-heal on the move, and the Ravager aspect.',
    infestation_pit: 'Unlocks the Infestor, the Swarm Host and the Viper -- the Zerg units that win ground by controlling it rather than by standing on it.',
    creep_tumour: 'A node of creep. It pushes the carpet outward and sees over it, and one tumour can seed one more, so a chain of them can reach across a map.',
    nydus_worm: 'The far mouth of a Nydus Canal. Anything entering the canal surfaces here, anywhere creep has reached.',
    nexus: 'The Protoss main base. Warps in Probes, takes in what they mine, and can Chrono Boost any of your buildings to work faster for a while.',
    pylon: 'Raises your supply ceiling and projects the psionic field every other Protoss building has to stand in. Kill the pylon and the buildings under it go dark.',
    assimilator: 'Warped onto a vespene geyser so Probes can harvest gas.',
    gateway: 'Warps in Protoss ground units: Zealots, Dragoons, Sentries, and both kinds of Templar.',
    forge: 'Researches Protoss ground weapons, armour and shields, and unlocks the Photon Cannon.',
    photon_cannon: 'Static defence that hits ground and air and sees the cloaked. It needs a Pylon powering it to fire at all.',
    cybernetics_core: 'Researches air weapons and armour and longer Dragoon range, and gates the Robotics Facility, the Stargate and the Citadel.',
    shield_battery: 'Spends its own energy recharging the shields of nearby friendly units. It is how a Protoss army walks out of a fight and comes back whole.',
    robotics_facility: 'Builds Protoss machines: Observers, Shuttles, Immortals, Reavers, Colossi and Disruptors.',
    stargate: 'Warps in every Protoss flyer, from the Scout and the Corsair up to the Carrier and the Arbiter.',
    citadel_of_adun: 'Researches faster Zealots and Blink, and is what stands between you and the Templar Archives.',
    robotics_support_bay: 'Improves the Reaver and the Shuttle, and unlocks the Colossus and the Disruptor.',
    fleet_beacon: 'Unlocks the Carrier and the Tempest, and researches the upgrades that make Protoss air worth what it costs.',
    templar_archives: 'Unlocks the High and Dark Templar and researches Psionic Storm, Mind Control and Maelstrom.',
    observatory: 'Researches a faster, further-seeing Observer -- the detector nothing without detection can shoot at.',
    arbiter_tribunal: 'Unlocks the Arbiter and researches Recall and Stasis Field, the two spells that move a Protoss army through ground it does not control.',
    rejuvenation_shrine: 'A Shield Battery attuned to healing. It restores hit points and shields to everything friendly around it, continuously and for free.',
    null_obelisk: 'A Shield Battery attuned to denial. Enemy units inside its radius are nearly blinded and lose their detection.',
    warded_bastion: 'A Shield Battery attuned to stone. It has no aura and no energy -- it is a wall, for shaping ground and holding a choke.',
    warp_gate: 'A Gateway that has traded its production queue away. Instead of walking units out, it warps them straight onto any powered ground you own.',
    carrion_warren: 'A buried nest of native life. Disturb it and it wakes, and it keeps sending grubs out until it is killed -- an expansion beside one is contested before an enemy shows up.',
    derelict_foundry: 'An abandoned factory standing in ruins. Repair it with a worker to claim it, and it builds Sentinels for you.',
    derelict_archive: 'An abandoned data vault. Repair it with a worker and it grants an armour level outright, with no research and no building of your own.',
    derelict_watchtower: 'An abandoned watchtower. Repair it with a worker and it sees eighteen tiles for you, permanently, for as long as you hold it.',
    scv: 'The Terran worker. Mines, builds every Terran structure, and repairs anything mechanical -- including other SCVs, and including buildings mid-fight.',
    marine: 'The Terran infantry line in one unit. Cheap, shoots air and ground, and gets frightening in numbers once Stimpack and range are researched.',
    firebat: 'Short-ranged flamethrower infantry. Its splash melts massed small units, which is exactly what a Marine line cannot handle alone.',
    medic: 'Unarmed infantry support. Heals biological units, cures what has been cast on them, and can blind an enemy so it fights at melee range.',
    ghost: 'A cloaked infantry specialist. Locks down a mechanical target for half a minute, and is the only unit that can call in a nuclear strike.',
    vulture: 'A fast hover bike for raiding and denying ground. Lays Spider Mines, which is what makes it worth more than its damage suggests.',
    siege_tank: 'The Terran siege engine. In Siege Mode it cannot move but outranges everything on the ground, so it turns held ground into ground nobody can cross.',
    goliath: 'A walker built to shoot down aircraft. Good against ground too, but it is in the army for what it does to the sky.',
    wraith: 'A cloaking fighter. Its air attack is the real one; cloak is what lets it work uncontested until the enemy builds detection.',
    dropship: 'A transport with no weapons. Eight slots of infantry landed behind a line is a different game from eight walking into it.',
    science_vessel: 'A flying support ship and a detector. Shields a unit from damage, burns energy off casters, and irradiates biological clumps.',
    battlecruiser: 'The Terran capital ship. Enormous hit points, hits ground and air, and its Yamato Cannon deletes anything expensive in a single shot.',
    valkyrie: 'A missile frigate built for one job: erasing massed air. Its salvo splashes, so it punishes flyers that fly in a clump.',
    spider_mine: 'A cloaked mine laid by a Vulture. It waits, then runs at the first ground unit close enough and detonates.',
    nuke: 'A nuclear missile. Built in a silo, painted by a Ghost, and everything near where it lands stops being a problem.',
    marauder: 'Armoured infantry with a heavy grenade launcher. It is what a Marine line puts in front of it when the enemy brings armour.',
    reaper: 'Raiding infantry. Fast, cheap, and made for arriving where an army is not -- worker lines, expansions, anything undefended.',
    hellion: 'A fast raider that fires a line of flame, hitting every ground unit along its path. Devastating into a worker line, weak into anything armoured.',
    cyclone: 'A quick, hard-hitting walker that fires on ground and air without stopping. It is a chaser: it can shoot the things that outrun a Siege Tank.',
    widow_mine: 'A mine that burrows, waits, and puts a large explosive shot into the first thing to walk over it. It has to be dug in and armed before it can fire.',
    thor: 'The heaviest thing Terran can build. Splashing artillery on the ground, flak in the air, and enough hit points to be the reason a push does not break.',
    banshee: 'A cloaking gunship that hits only ground. Uncontested it takes a base apart; against one Missile Turret it is a waste of gas.',
    liberator: 'A gunship with siege-length range against ground. It is what a Terran air force uses to break something dug in.',
    viking: 'A fighter that lands. In the air it is anti-air only; on the ground it is a decent assault walker. Switching modes is the unit.',
    viking_a: 'A landed Viking. Now a ground assault walker, with no ability to shoot at aircraft until it takes off again.',
    medivac: 'A transport that also heals. Eight slots of infantry and a healing beam is a Dropship and a Medic that never gets left behind.',
    raven: 'A flying support ship and a detector. Its jamming field is the tool that turns off an enemy position rather than killing it.',
    mule: 'A drop pod worker called down by an Orbital Command. Mines several times faster than an SCV, cannot build, and expires on a timer.',
    larva: 'The raw material every Zerg unit is made from. A Hatchery grows them slowly and a Queen can force more; if they are sitting idle you are behind.',
    egg: 'A larva mid-morph. Whatever was ordered hatches out of it when it finishes.',
    lurker_egg: 'A Hydralisk mid-morph into a Lurker.',
    cocoon: 'A Mutalisk mid-morph into one of its greater forms.',
    drone: 'The Zerg worker. Mines, and is consumed by every building it makes -- so every Zerg structure costs a worker as well as its price.',
    overlord: 'Zerg supply on wings, and a detector. Slow and defenceless, but it carries units once upgraded, and its 200 energy pays for creep tumours.',
    zergling: 'The cheapest unit in the game, made two at a time. Alone it is nothing; in enough numbers it surrounds and eats almost anything on the ground.',
    hydralisk: 'The Zerg ranged core. Shoots ground and air, is cheap enough to mass, and morphs into a Lurker when a Den allows it.',
    lurker: 'A burrowed ambusher. It cannot be seen or shot without detection, and its spines hit everything along a line -- a wall of them holds a choke on their own.',
    mutalisk: 'Fast Zerg air. Its attack bounces between targets, and its real value is that it can be somewhere else before the defence gets there.',
    scourge: 'A flying suicide bomb, made two at a time. It exists to kill expensive aircraft that cost far more than the pair that took them down.',
    queen: 'A Zerg support flyer. Injects a Hatchery for extra larvae, and its spells break a defence apart rather than out-damaging it.',
    guardian: 'A Mutalisk grown into a long-range siege flyer. It outranges ground defence and takes it apart from outside its reach.',
    devourer: 'A Mutalisk grown into an anti-air specialist. Its acid stacks on what it hits, so the next attack lands harder.',
    ultralisk: 'The Zerg heavy. Huge hit points, heavy armour, and a melee attack that clears a line -- what a swarm walks in behind.',
    defiler: 'A Zerg caster and one of the strongest units in the game in the right hands. Dark Swarm turns off ranged fire; Plague strips an army to almost nothing.',
    broodling: 'A short-lived creature left behind when a Queen kills something with Spawn Broodling. It fights until its own timer runs out.',
    infested_terran: 'A walking bomb made from a captured Terran hall. It runs into something expensive and detonates.',
    roach: 'Tough, cheap ranged ground. It regenerates fast, and faster still burrowed, so it survives fights other units of its price do not.',
    ravager: 'A Roach grown into an artillery piece. Its corrosive bile lands where you aim it, hits regardless of range, and forces units off held ground.',
    baneling: 'A Zergling grown into a rolling acid bomb. It detonates on contact, splashing over everything nearby -- the counter to massed small units.',
    swarm_host: 'A siege unit that never fights itself. Burrowed, it sends out free locusts on a timer, so it costs an enemy ammunition and attention forever.',
    locust: 'A short-lived flying attacker spawned free by a Swarm Host. It fights until its timer expires and then dies.',
    viper: 'A Zerg air caster. It drags a single unit out of a formation and pulls it to you -- one Siege Tank or one Colossus removed decides a fight.',
    infestor: 'A burrowing Zerg caster. Fungal Growth roots an army in place; the rest of its kit turns enemy units into your problem instead of theirs.',
    overseer: 'An Overlord grown into a proper scout and detector. Faster, sees further, and can contaminate an enemy building to stop it producing.',
    brood_cocoon: 'An Overlord mid-morph into an Overseer.',
    probe: 'The Protoss worker. It warps a building in and walks away immediately, so it loses no mining time to construction.',
    zealot: 'The Protoss melee core. Heavy shields and hit points for its price, and with leg enhancements it closes on ranged units before they can leave.',
    dragoon: 'The Protoss ranged core. Hits ground and air at good range, and Blink lets it get up a cliff or out of a bad fight.',
    high_templar: 'A Protoss caster and the reason Protoss armies are feared. Psionic Storm does enormous damage over an area; two of them merge into an Archon.',
    dark_templar: 'A permanently cloaked assassin that kills almost anything on the ground in two hits. Against a player with no detection it ends the game.',
    archon: 'Two High Templar burned together. Almost no hit points and an enormous shield pool, with splash damage against ground and air.',
    dark_archon: 'Two Dark Templar merged. It has no attack at all -- it takes enemy units instead, permanently, and locks down the rest.',
    reaver: 'A slow siege machine that lobs scarabs for very heavy splash. It has to be carried by a Shuttle to be worth anything.',
    shuttle: 'The Protoss transport. Unarmed, and with a Reaver inside it becomes the most feared harassment tool Protoss has.',
    observer: 'A permanently cloaked flying detector with no weapon. It sees Lurkers and Dark Templar and nothing without detection can touch it.',
    scout: 'A Protoss fighter that hits ground and air. Expensive for what it does, but very fast once upgraded.',
    corsair: 'A fast anti-air fighter with splash. Disruption Web shuts off ground defences under it without killing them.',
    carrier: 'The Protoss capital ship. It carries interceptors and never fires itself -- the fleet is the weapon, and it takes time to build up.',
    arbiter: 'A Protoss support flyer. It cloaks everything around it, freezes units in Stasis, and Recalls an army across the map instantly.',
    interceptor: 'A small drone launched by a Carrier. It flies out, attacks, and returns; the Carrier rebuilds them when they die.',
    scarab: 'The munition a Reaver fires. It crawls to the target and detonates for very heavy splash damage.',
    hallucination: 'A copy of one of your units with no substance. It deals no damage and dies to anything, and it is real enough to soak an enemy volley.',
    sentry: 'A Protoss support caster. Guardian Shield cuts ranged damage across your army; Force Field puts a wall of solid energy wherever you want one.',
    immortal: 'An armoured walker that shrugs off heavy hits and punishes them. Built to stand in front of Siege Tanks and Ultralisks.',
    colossus: 'A striding siege walker whose beams splash in a line. It walks over cliffs, and being tall it can be shot at by anti-air.',
    disruptor: 'A machine with no attack that launches a purification nova -- a slow-moving charge that annihilates anything still standing where it lands.',
    warp_prism: 'A transport that also projects a psionic field, so warp-ins and Protoss buildings work wherever it is parked.',
    phoenix: 'A fast anti-air fighter that shoots while moving. Its Graviton Beam lifts one ground unit into the air, helpless, for a few seconds.',
    oracle: 'A fast harassment flyer. Devastating into an undefended worker line, and its Revelation shows a chunk of the map for a while.',
    void_ray: 'A Protoss beam ship that hits ground and air. It builds up on a target, so it rewards staying pointed at one big thing.',
    tempest: 'A long-range Protoss capital ship. It outranges every static defence in the game and takes it apart from outside.',
    mothership: 'One per player, warped in by an Arbiter. A detector that cloaks your fleet and warps time around your enemies.',
    carrion_grub: 'Native wildlife, buried until something disturbs it. Individually harmless; a pack of them on an expansion site is a real fight.',
    carrion_maw: 'The largest thing the native life grows into. Enormous hit points and a splashing bite -- clear it before you try to expand onto its ground.',
    sentinel: 'An automated defence walker built by a captured Derelict Foundry. It shoots ground and air and costs no supply.',
  };
  // Applied here rather than inside U()/B() so the table above can sit in race order and read as
  // prose. Anything in DESC that is not a def is a typo and would be silently dropped, so it throws.
  // Anything in SHOT that names a weapon that does not exist is a typo and would be silently dropped,
  // and any armed weapon MISSING from SHOT is the bug this table exists to remove -- so both throw.
  for (const key of Object.keys(SHOT)) {
    const [id, slot] = key.split(':');
    const d = units[id] || buildings[id];
    if (!d) throw new Error('SHOT names something that is not a unit or a building: ' + id);
    if (!d[slot]) throw new Error('SHOT names a weapon that does not exist: ' + key);
    d[slot].fx = SHOT[key][0]; d[slot].col = SHOT[key][1];
  }
  for (const src of [units, buildings]) for (const id of Object.keys(src))
    for (const slot of ['gw', 'aw'])
      if (src[id][slot] && !src[id][slot].fx) throw new Error('armed but no shot in SHOT: ' + id + ':' + slot);

  // Both directions throw, for the same reason the SHOT table does: a typo here would silently drop a
  // description, and an ability added later with no entry is exactly the hole this table exists to close.
  for (const id of Object.keys(ABIL_DESC)) {
    if (!abilities[id]) throw new Error('ABIL_DESC names something that is not an ability: ' + id);
    abilities[id].desc = ABIL_DESC[id];
  }
  for (const id of Object.keys(abilities))
    if (!abilities[id].desc) throw new Error('ability with no description: ' + id);

  for (const id of Object.keys(DESC)) {
    const d = units[id] || buildings[id];
    if (!d) throw new Error('DESC names something that is not a unit or a building: ' + id);
    d.desc = DESC[id];
  }

  const all = Object.assign({}, units, buildings);
  return { units, buildings, upgrades, techs, abilities, buildMenu, larvaMorphs, creepSpeed, buriedTells, derelictPresets, wildlifePresets, all };
})();

const RACE_INFO = {
  T: { name: 'Terran', worker: 'scv', hall: 'command_center', supply: 'supply_depot', gasB: 'refinery', color: '#3a6ea5', supplyMsg: 'Additional supply depots required.' },
  Z: { name: 'Zerg', worker: 'drone', hall: 'hatchery', supply: 'overlord', gasB: 'extractor', color: '#7b3fa0', supplyMsg: 'Spawn more overlords.' },
  P: { name: 'Protoss', worker: 'probe', hall: 'nexus', supply: 'pylon', gasB: 'assimilator', color: '#c9a227', supplyMsg: 'You must construct additional pylons.' },
  // The fourth entry, and it is not a race anybody plays. Neutral life and unclaimed derelicts need
  // an owner, and an owner needs a Player: Unit.speed, Unit.sight and Unit.armor all dereference
  // `this.player` unconditionally, so a unit whose owner is not a real index in G.players throws on
  // the first frame it moves.
  //
  // WHAT THE NEUTRAL PLAYER IS:
  //   * APPENDED to G.players after every real player, so its id is G.players.length at the end of
  //     G.init and no real player's id moves. Nothing else is ever appended
  //   * `team: -1`. G.allied compares `pa.team === pb.team`, and a real team id is either the value
  //     from the setup or the player's own index, both non-negative -- so -1 is allied with exactly
  //     itself. Neutral life is hostile to everybody and is nobody's weapon
  //   * `human: false`, `ai: null`, no supply, no score
  //   * `vis` IS REQUIRED and is not optional: G.updateVision does `const v = p.vis; for (let i = 0;
  //     i < v.length; ...)` with no guard, so a Player without one throws on the first vision pass.
  //     Give it a Uint8Array like everyone else, or skip it beside the existing
  //     `if (p.defeated && !p.human) continue;` -- either is correct, one costs a full-map pass and
  //     the other costs a line. Nothing ever looks through neutral eyes
  //
  // FOUR PLACES IN THE EXISTING SIM MUST LEARN ABOUT IT, and three of them are quiet failures:
  //   1. G.checkVictory, the surviving-teams line. `players.filter(p => !p.defeated)` mapped to a Set
  //      of teams, and the game ends when that set has one entry. A neutral player holding one
  //      derelict is never defeated, contributes team -1, and THE GAME NEVER ENDS. This is the one
  //      that must not be missed: on a derelict map it fires every single game
  //   2. G.checkVictory, the elimination pass. Left alone it would defeat the neutral player the
  //      moment its last creature died, kill anything else it owned, and tell every human that
  //      "Neutral has been eliminated." Skip the neutral player in the loop entirely
  //   3. AI.enemies(), which is `G.players.filter(q => !G.allied(q.id, this.p.id) && !q.defeated)`.
  //      The neutral player passes both tests, so every AI would treat a warren as an enemy base and
  //      may send a wave at it. Whether an AI should ever attack the wildlife is a design question;
  //      that it should not mistake it for its OPPONENT is not
  //   4. Abilities.repairTick refuses `t.owner !== u.owner`, which is exactly what capturing a
  //      derelict has to do. That refusal is right for everything else and has to gain one exception
  //
  // Two things it does NOT need: G.recomputeSupply and G.tickAlerts already no-op for it (no supply
  // defs, not human), and js/snapshot.js walks G.players reflectively, so the neutral player and its
  // units are captured and restored with no change at all.
  //
  // Its colour is deliberately dead: neutral things are the colour of the ground, and nothing on the
  // map should read as a fourth army.
  //
  // This entry sits in RACE_INFO rather than in a const of its own because js/build.js hashes
  // RACE_INFO and does not hash arbitrary globals, and because js/codex.js reads
  // RACE_INFO[d.race].name for any def it is handed -- test/codex.js hands it every unit in the table.
  N: { name: 'Neutral', worker: null, hall: null, supply: null, gasB: null, color: '#8d8570', supplyMsg: '', neutral: true, team: -1 },
};
const PLAYER_COLORS = ['#f40404', '#0c48cc', '#2cb494', '#88409c', '#f88c14', '#703014', '#cce0d0', '#fcfc38'];
