'use strict';
// ============================================================================
// Abilities & spells, status fields, auto-cast behaviours.
// ============================================================================
// Things a spider mine will not trigger on. The reaper's jump jets and the hellion's air cushion are
// the same argument the vulture already makes: nothing that never touches the ground sets off a
// pressure mine. (M12 wave four.)
const HOVER = new Set(['vulture', 'probe', 'archon', 'dark_archon', 'reaper', 'hellion']);
const NO_BROODLING = new Set(['probe', 'reaver', 'dragoon', 'archon', 'dark_archon', 'ultralisk', 'scv']);

// ---------------------------------------------------------------------------------------------
// M12 wave four, and the one line of this milestone that belongs in another file.
//
// EQUIV (js/sim.js) is the table that says "a Lair still counts as a Hatchery". Player.hasBuilding
// reads it, Player.hasReq reads it through that, test/techtree.js reads it, and js/missions.js reads it
// for objectives. Its `command_center` entry is an EMPTY array, written when nothing morphed off a
// Command Center -- and now two things do. Without this, morphing your only Command Center makes
// `hasBuilding('command_center')` false, and a Barracks or an Engineering Bay can no longer be built:
// a player who pressed the Orbital button would silently lose half a tech tree.
//
// The correct fix is one line in js/sim.js:
//     command_center: ['orbital_command', 'planetary_fortress']
// This branch does not own js/sim.js, and three race branches are editing in parallel, so the entry is
// EXTENDED IN PLACE here instead -- js/abilities.js loads after js/sim.js in index.html and in every
// test harness, `const EQUIV` binds the object and not its contents, and pushing is additive, so the
// Zerg and Protoss branches can do the same to their own keys without touching this one. It is
// idempotent and it runs once at load, so it is deterministic and invisible to snapshots.
// REPLACE THIS with the sim.js line the moment those branches are merged.
if (typeof EQUIV !== 'undefined' && Array.isArray(EQUIV.command_center)) {
  for (const id of ['orbital_command', 'planetary_fortress']) if (!EQUIV.command_center.includes(id)) EQUIV.command_center.push(id);
}
// How much a MULE takes out of a patch ON TOP of the eight a worker takes, on the same trip, and
// carries home with it. Three times a worker's haul on a round trip that is also faster, which is
// roughly four SCVs for seventy-five seconds.
//
// IT COMES OUT OF THE PATCH. That is the whole design of the thing under M11's attrition economy: a
// MULE is not free minerals, it is minerals borrowed from the end of the game, and a base that has had
// MULEs dropped on it all match runs dry visibly sooner. The alternative -- crediting the player
// without debiting the field -- would have been three characters shorter and would have quietly made
// the one economy mechanic in the game the one thing that does not obey it.
const MULE_HAUL = 16;
// M12 wave four. The five new Zerg morph-aspects are checked exactly the way the three older ones
// are -- "can this player have the thing it turns into" -- but on their own line rather than by
// extending that or-chain, because two other races are adding to the same function this milestone
// and a three-way merge of one long boolean is how somebody's work goes missing.
const Z12_ASPECTS = new Set(['baneling_aspect', 'ravager_aspect', 'swarm_host_aspect', 'viper_aspect', 'overseer_aspect']);
// How far a ground unit must be able to WALK from a blink destination for that destination to be legal.
// See Abilities.blinkReach for what this is protecting against and why it is not a reachability test
// from the caster.
const BLINK_ESCAPE = 4;
const Abilities = {
  // Is ability usable/visible for this unit right now?
  available(u, id) {
    const ab = DATA.abilities[id]; if (!ab) return false; const p = u.player;
    // The burrow exemption. A Lurker cannot fight at all without digging in, so it has never needed the
    // Zerg research; a Widow Mine is the same shape for the same reason (`burrowOnly` weapon), and it
    // is Terran, so requiring a Zerg tech would make it unusable rather than merely gated.
    if (ab.tech && !p.hasTech(ab.tech) && !(id === 'burrow' && (u.def.id === 'lurker' || u.def.id === 'widow_mine'))) return false;
    if (id === 'nuke' && p.nukes <= 0) return false;
    if (id === 'spider_mine' && u.mines <= 0) return false;
    if (id === 'unload' && !u.cargo.length) return false;
    if (id === 'lurker_aspect' || id === 'guardian_aspect' || id === 'devourer_aspect') { const ud = DATA.units[ab.unit]; if (!p.hasReq(ud)) return false; }
    if ((id === 'guardian_aspect' || id === 'devourer_aspect') && !p.hasBuilding('greater_spire')) return false;
    if (Z12_ASPECTS.has(id)) { const ud = DATA.units[ab.unit]; if (!p.hasReq(ud)) return false; }
    // M12 item 12. A Warp Gate offers exactly the units a Gateway would have offered, so the button is
    // hidden for anything whose tech is not in yet -- the same line the Zerg aspects above use rather
    // than a second rule. NOT gated on the gate's recharge: the card should keep showing what this
    // building makes, and Abilities.warpIn says "recharging" out loud when it is pressed early.
    if (ab.warp) { const ud = DATA.units[ab.unit]; if (!ud || !p.hasReq(ud)) return false; }
    // A tumour seeds exactly one child, ever. `tumoured` is a flag and not a counter on purpose: a
    // tumour that could seed twice covers the map while the player is looking somewhere else, and the
    // whole mechanic is supposed to cost attention rather than minerals.
    if (id === 'spawn_tumour' && (u.tumoured || !u.done)) return false;
    if (id === 'uproot' && (!u.done || u.prod.length || u.lifted)) return false;
    return true;
  },
  label(u, id) { const ab = DATA.abilities[id]; if (id === 'siege_mode') return u.sieged ? 'Tank Mode' : 'Siege Mode'; if (id === 'burrow') return u.burrowed ? 'Unburrow' : 'Burrow'; if (id === 'viking_mode') return u.def.id === 'viking' ? 'Assault Mode' : 'Fighter Mode'; if (id === 'cloak_ghost' || id === 'cloak_wraith') return u.cloaked ? 'Decloak' : ab.name; return ab.name; },
  // FIXLIST-M15 C2. How far a caster can be from a point and still cast, in pixels -- the declared
  // tile range plus both bodies, which is what orderTick has always computed inline. It is a method
  // now because TWO paths need it and they were about to drift: orderTick for a mobile caster, and
  // issue() for a caster that is a BUILDING and never reaches orderTick at all.
  castRange(u, ab, t) { return (ab.range || 1) * TILE + (t ? t.r : 0) + u.r; },
  // One sentence, said the same way by both paths. B2's rule: a refusal names what it needed.
  outOfRangeMsg(ab) { return ab.name + ' only reaches ' + (ab.range || 1) + ' tiles -- pick a spot closer in.'; },
  // The burrow, arming and unburrow durations for a unit that has its own -- today only the Widow Mine.
  // Null for everything else, which is what keeps the generic 24-frame burrow the generic 24-frame
  // burrow. Reads the def, so the numbers have exactly one home (js/data.js) and every caller, the AI
  // and the tests included, gets them from here rather than writing 26 somewhere.
  digTimes(u) {
    const d = u.def && u.def.dig; if (!d) return null;
    return (d.tech && u.player && u.player.hasTech(d.tech)) ? d.fast : d;
  },
  // Is a dug-in unit's weapon live yet? False while it is still going down or still arming. Unit.tick
  // counts `digT` to zero; Unit.weaponFor refuses to hand out a weapon until it gets there.
  digArmed(u) { return !(u.digT > 0); },
  // Entry point from UI/AI. For unit/point kinds target/x/y must be supplied.
  issue(u, id, target, x, y, shift) {
    const ab = DATA.abilities[id], p = u.player; if (!u.alive || !this.available(u, id)) return false;
    if (u.disabled) return false;
    // Decloaking is free -- the toggle-off branch in instant() charges nothing -- but this gate read the
    // ability's 25 first, so a cloaked Ghost or Wraith between 0 and 25 energy was told "Not enough
    // energy" and could not decloak until it regenerated. Measured. (REVIEW-M17)
    const decloaking = u.cloaked && (id === 'cloak_ghost' || id === 'cloak_wraith');
    if (ab.energy && u.energy < ab.energy && !decloaking) { p.msg('Not enough energy.', 'error'); return false; }
    switch (ab.kind) {
      case 'toggle': case 'instant': return this.instant(u, id);
      case 'morph': return this.morph(u, ab.unit);
      case 'produce': return G.queueUnit(u, ab.unit);
      case 'unit': if (!target) return false; if (target === u && id !== 'consume') return false; u.setOrder({ type: 'ability', abil: id, target, x: target.x, y: target.y }, shift); return true;
      // A BUILDING CASTS RIGHT HERE and never reaches orderTick, so a `noApproach` limit has to be
      // enforced on this path too -- and this is the path the reported half of C2 actually takes. A
      // creep tumour IS a building: measured before the fix, a finished tumour seeded a child 21.4
      // tiles away against a declared range of 9. FIXLIST-M15 says this half already worked because
      // an immobile caster takes orderTick's refuse branch; it does not, because it never gets there.
      // Checking at issue-time is exactly right for a building and only for a building: a building
      // will never be closer to the target than it is now.
      case 'point':
        if (u.isBuilding) {
          if (ab.noApproach && distPt(u.x, u.y, x, y) > this.castRange(u, ab, null)) { p.msg(this.outOfRangeMsg(ab), 'error'); return false; }
          if (ab.energy) u.energy -= ab.energy; this.cast(u, id, null, x, y); return true;
        }
        u.setOrder({ type: 'ability', abil: id, x, y }, shift); return true;
    }
    return false;
  },
  instant(u, id) {
    const p = u.player, ab = DATA.abilities[id];
    switch (id) {
      case 'stim': if (u.hp <= 10 || u.stim > 200) return false; u.hp -= 10; u.stim = 300; return true;
      case 'siege_mode': if (u.transT > 0) return false; u.sieged = !u.sieged; u.transT = 40; u.path = null; if (u.sieged) u.order = { type: 'hold' }; else u.order = { type: 'idle' }; return true;
      // BURROW. 24 frames for everything that digs in, EXCEPT a def carrying `dig` -- see the Widow
      // Mine in js/data.js, which has its own going-down, arming and coming-up durations because the
      // player reported that its burrow time did not match StarCraft II's and it in fact had none.
      //
      // `digT` is a countdown of frames until the weapon is live, and it is set on the way DOWN only:
      // burrow plus arm. It is deliberately NOT `armT`, which is a different field with the opposite
      // sense -- Abilities.mineTick counts armT UP for a spider mine, and one shared decrement in
      // Unit.tick would have held it at zero and quietly stopped every spider mine in the game arming.
      case 'burrow': {
        if (u.transT > 0) return false;
        const t = this.digTimes(u);
        u.burrowed = !u.burrowed;
        u.transT = t ? (u.burrowed ? t.burrow : t.unburrow) : 24;
        u.digT = (t && u.burrowed) ? t.burrow + t.arm : 0;
        u.path = null; u.order = { type: u.burrowed ? 'hold' : 'idle' }; u.queue = []; return true;
      }
      case 'cloak_ghost': case 'cloak_wraith': if (u.cloaked) { u.cloaked = false; return true; } if (u.energy < 25) { p.msg('Not enough energy.', 'error'); return false; } u.energy -= 25; u.cloaked = true; return true;
      case 'unload': G.unloadAll(u); return true;
      // The Viking transform. Modelled on 'siege_mode' directly above it -- same transT lockout, same
      // "clear the order and the path so nothing carries across the change" -- but it swaps the DEF
      // rather than a boolean, because Unit.weaponFor dispatches on `this.def` and the two modes need
      // different weapons, different movement and different sprites. See the viking defs in js/data.js.
      //
      // Supply is unchanged by construction (both defs say sup 2), so G.recomputeSupply here is
      // belt-and-braces rather than load-bearing: it is called so that a future asymmetry cannot leave
      // the supply counter describing the mode the unit used to be in.
      case 'viking_mode': {
        if (u.transT > 0 || u.disabled) return false;
        const to = u.def.id === 'viking' ? 'viking_a' : 'viking';
        // Landing needs somewhere to land. A fighter over a cliff, over water or over a building
        // footprint would fold its wings into terrain it cannot stand on and be wedged there for good,
        // and Unit.moveTo would never get it out -- the pathfinder starts from where you already are.
        if (to === 'viking_a' && !G.passable(u.x, u.y, u)) { p.msg('Cannot land here.', 'error'); return false; }
        const nd = DATA.units[to], ratio = u.hp / u.maxHp;
        u.def = nd; u.maxHp = nd.hp; u.hp = Math.max(1, Math.min(nd.hp, nd.hp * ratio));
        u.fly = !!nd.fly; u.r = nd.r; u.transT = 40; u.path = null; u.target = null;
        u.order = { type: 'idle' }; u.queue = [];
        G.effects.push({ kind: 'ring', x: u.x, y: u.y, r: 20, t: 10, color: '#9cf' });
        G.recomputeSupply();
        return true;
      }
      case 'uproot': return this.uproot(u);
      case 'volatile_burst': return this.volatileBurst(u);
      case 'spawn_locusts': return this.spawnLocusts(u);
      // M12 wave four. GUARDIAN SHIELD REUSES `fx.matrix`, the Science Vessel's Defensive Matrix, and
      // that is the whole implementation: a pool of absorbed damage per unit, spent by G.damage before
      // armour and expired by Unit.tick. Nothing new for js/snapshot.js to learn, nothing new in the
      // damage path, and it reads correctly -- a bubble over the army that soaks a fixed amount and
      // then pops. SC2's version is a flat -2 on incoming ranged damage, which would have meant a new
      // branch inside G.damage, in a file this change does not own.
      //
      // It covers ALLIES and not the enemy, which is the check test/protoss12.js pins, and it covers
      // the Sentry itself: a shield that excluded its own caster would be the one unit standing in the
      // fight without one.
      case 'guardian_shield': {
        if (u.energy < ab.energy) { p.msg('Not enough energy.', 'error'); return false; }
        u.energy -= ab.energy;
        for (const o of G.near(u.x, u.y, ab.r * TILE)) {
          if (!o.alive || o.isBuilding || o.inside || o.def.larva || o.def.egg || o.def.notUnit) continue;
          if (!G.allied(o.owner, u.owner)) continue;
          o.fx.matrix = { hp: ab.absorb, t: ab.t };
        }
        G.effects.push({ kind: 'ring', x: u.x, y: u.y, r: ab.r * TILE, t: 16, color: '#adf' });
        return true;
      }
    }
    return false;
  },
  morph(u, toId) {
    const p = u.player, ud = DATA.units[toId];
    if (!p.hasReq(ud)) { p.msg('Requires ' + p.missingReq(ud), 'error'); return false; }
    if (!p.canAfford(ud.min, ud.gas)) return false;
    const extra = ud.sup - u.def.sup; if (extra > 0 && p.supUsed + extra > p.supMax && !(G.cheats.food && p.human)) { G.supplyRefused(p); return false; } // one voice for being supply blocked; see G.supplyRefused
    p.minerals -= ud.min; p.gas -= ud.gas; G.morphUnit(u, toId);
    // G.morphUnit picks `lurker_egg` for a Lurker and the FLYING `cocoon` for everything else, which
    // was correct while every other morph in the game was a mutalisk turning into another flyer. M12
    // adds three morphs whose product WALKS (baneling, ravager, swarm host), and a cocoon would put
    // them in the air for the whole morph -- drifting, and shootable only by anti-air. Swapped here
    // rather than in js/game.js because this is the caller that knows what it asked for.
    if (!ud.fly && u.def.id === 'cocoon') { const ed = DATA.units.brood_cocoon; u.def = ed; u.maxHp = ed.hp; u.hp = ed.hp; u.r = ed.r; u.fly = false; }
    return true;
  },
  // ---------------- M12 wave four: Zerg ----------------
  // Uproot is half of a pair and the other half is the Land button UI.buildCard already grows for
  // anything `lifted`, so this only ever has to handle standing UP -- except from the AI, which needs
  // to be able to put one down where it stands, so both directions live here.
  //
  // `fly` STAYS FALSE, and that is the difference between this and G.liftBuilding. A Terran building
  // that lifts flies, ignores terrain and crosses cliffs; a crawler that could do that would be a
  // 300-hit-point turret that walks up a wall, which is a change to what high ground is worth. So it
  // pathfinds like any ground unit (Unit.moveTo's `!this.fly` branch), at the speed `lifted` pins it
  // to (1 px/frame in Unit.speed -- deliberately slow), and it cannot shoot on the way because
  // Unit.tickBuilding returns at `if (this.lifted)` before it reaches tickCombatBuilding.
  //
  // It can never ROOT off creep: G.landBuilding calls GameMap.canPlace, and both crawler defs carry
  // `needsCreep`. It may walk anywhere it likes; it may only stand up on ground the swarm holds.
  uproot(u) {
    if (!u.def.crawler || !u.done || u.prod.length) return false;
    if (u.lifted) { G.landBuilding(u, Math.round(u.x / TILE - u.def.w / 2), Math.round(u.y / TILE - u.def.h / 2)); return true; }
    u.lifted = true; u.fly = false;
    G.map.unblock(u.tx, u.ty, u.def.w, u.def.h, u.id);
    u.order = { type: 'idle' }; u.queue = []; u.path = null; u.target = null;
    u.creepKey = -1; G.map.recomputeCreep(G.units);   // its creep patch leaves with it; see tickZergNet
    G.effects.push({ kind: 'ring', x: u.x, y: u.y, r: u.r, t: 12, color: '#c8f' });
    return true;
  },
  // The Baneling's blast. Not a `suicide: true` weapon -- see the def in js/data.js for the two
  // reasons -- so the damage table is written here rather than in the weapon table. Doubled against
  // buildings, which is the one thing that makes a baneling worth its gas next to a zergling: it is
  // the swarm's answer to a wall, a bunker and a row of colonies, not to an army.
  volatileBurst(u) {
    const ab = DATA.abilities.volatile_burst, p = u.player;
    const dmg = ab.dmg + p.upgLevel('meleeW') * 2;
    for (const o of G.near(u.x, u.y, ab.r * TILE + 16)) {
      if (!o.alive || o.fly || o.inside || o.def.larva || G.allied(o.owner, u.owner)) continue;
      const d = Math.max(0, distPt(o.x, o.y, u.x, u.y) - o.r) / TILE; if (d > ab.r) continue;
      const fall = d <= ab.r * 0.5 ? 1 : d <= ab.r * 0.8 ? 0.6 : 0.3;
      G.damage(o, dmg * fall * (o.isBuilding ? ab.bldMult : 1), 'concussive', u, { splash: true });   // a blast has no facing
    }
    G.map.damageFeatureAt(u.x, u.y, dmg);
    G.effects.push({ kind: 'boom', x: u.x, y: u.y, t: 16, r: ab.r * TILE * 0.7 });
    if (typeof Sound !== 'undefined') Sound.boom();
    G.kill(u, null, true);
    return true;
  },
  // Locusts arrive with an order already on them. A swarm host whose brood stands still is a swarm
  // host that does nothing: they live 20 seconds and the walk is most of it, so they are pointed at
  // the nearest thing worth attacking the moment they surface.
  spawnLocusts(u) {
    const ab = DATA.abilities.spawn_locusts, p = u.player;
    if (u.energy < ab.energy) { p.msg('Not enough energy.', 'error'); return false; }
    u.energy -= ab.energy;
    const n = p.hasTech('pressurised_glands') ? 3 : 2;
    let tx = u.x + Math.cos(u.facing) * 8 * TILE, ty = u.y + Math.sin(u.facing) * 8 * TILE, bd = 1e9;
    for (const o of G.near(u.x, u.y, 14 * TILE)) { if (!o.alive || G.allied(o.owner, u.owner) || o.def.notUnit) continue; const d = dist(u, o); if (d < bd) { bd = d; tx = o.x; ty = o.y; } }
    for (let i = 0; i < n; i++) {
      const a = u.facing + (i - (n - 1) / 2) * 0.7;
      const l = G.spawnUnit('locust', u.owner, u.x + Math.cos(a) * (u.r + 12), u.y + Math.sin(a) * (u.r + 12));
      l.facing = a; l.applyOrder({ type: 'attackmove', x: tx, y: ty });
    }
    G.effects.push({ kind: 'ring', x: u.x, y: u.y, r: u.r + 12, t: 12, color: '#8c4' });
    return true;
  },
  // Both tumour paths, shared. Placement goes through GameMap.canPlace exactly like a drone-built
  // structure, so `needsCreep` does the gating and nothing here has to know what creep is.
  plantTumour(u, x, y) {
    const p = u.player, def = DATA.buildings.creep_tumour;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const err = G.map.canPlace(def, tx, ty, p, G.units, null); if (err) { p.msg(err, 'error'); return null; }
    if (!p.canAfford(def.min, def.gas)) return null;
    p.minerals -= def.min; p.gas -= def.gas;
    return G.placeBuilding(def, tx, ty, u.owner);
  },
  // Pair up selected units for Archon / Dark Archon / Mothership merging.
  //
  // `ab.from` NAMES WHAT IS CONSUMED, and it is read before the old guess. The guess was
  // "summon_archon means high templar, anything else means dark templar", which was true while there
  // were exactly two merges and silently made the Mothership ask for two dark templar. A third merge
  // is the moment a two-way guess stops being a shortcut and becomes a bug, so the pairing is in the
  // data now; the fallback stays so the two older abilities keep working unchanged.
  merge(units, id) {
    const ab = DATA.abilities[id]; const want = ab.from || (id === 'summon_archon' ? 'high_templar' : 'dark_templar');
    const list = units.filter(x => x.alive && x.def.id === want && !x.disabled);
    for (let i = 0; i + 1 < list.length; i += 2) { const a = list[i], b = list[i + 1]; a.setOrder({ type: 'merge', partner: b, unit: ab.unit }); b.setOrder({ type: 'merge', partner: a, unit: ab.unit }); }
    return list.length >= 2;
  },
  // ---------------- M12 wave four: Protoss ----------------
  // ITEM 12, WARP-IN. Every refusal happens BEFORE anything is spent, and the order of the checks is
  // the order a player would ask them in: is the gate ready, is that ground mine, can something stand
  // there, do I have the tech, can I pay, do I have the supply.
  //
  // THE PSI CHECK IS THE WHOLE MECHANIC AND IT IS A HARD REFUSAL, not a nudge. The obvious kindness --
  // "slide the landing to the nearest powered tile" -- is precisely the failure this must not have: a
  // warp that quietly moves is a warp on to ground the player does not hold, which is the difference
  // between a mechanic and an exploit. It asks GameMap.hasPsi, the same query a Protoss building makes
  // every tick to decide whether it is powered, so there is exactly one power grid and a Warp Prism's
  // moving field feeds it for free.
  //
  // THE RECHARGE IS LONGER THAN THE TRAINING TIME IT REPLACES (`cdMult` 1.25). That is the balance of
  // the item in one number: converting a Gateway makes your production worse everywhere except at the
  // front, so the Warp Gate is a decision about WHERE rather than a free upgrade. `u.cooldown` is used
  // for it rather than a new field because Unit.tick already decrements it for every unit including
  // buildings, and a Warp Gate has no weapon to contend for it.
  //
  // The unit lands helpless: `morphT` is the same field G.mergeUnits uses for a forming Archon, so
  // Unit.tick returns early, Unit.disabled is true, and the render pass already fades anything with a
  // morph timer. That is the risk half -- a warp-in on top of an army is five free kills.
  warpIn(gate, id, x, y) {
    const ab = DATA.abilities[id], p = gate.player, ud = DATA.units[ab.unit], m = G.map;
    if (gate.cooldown > 0) { p.msg('Warp Gate is recharging.', 'error'); return false; }
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!m.hasPsi(gate.owner, tx, ty)) { p.msg('Can only warp in to a powered area.', 'error'); return false; }
    if (!m.walkable(tx, ty)) { p.msg('Cannot warp in there.', 'error'); return false; }
    if (!p.hasReq(ud)) { p.msg('Requires ' + p.missingReq(ud), 'error'); return false; }
    if (!p.canAfford(ud.min, ud.gas)) return false;
    if (ud.sup && p.supUsed + ud.sup > p.supMax && !(G.cheats.food && p.human)) { G.supplyRefused(p); return false; }
    p.minerals -= ud.min; p.gas -= ud.gas;
    const u = G.spawnUnit(ab.unit, gate.owner, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
    u.morphT = ab.form;
    gate.cooldown = Math.round(ud.time * ab.cdMult);
    G.effects.push({ kind: 'ring', x: u.x, y: u.y, r: u.r + 12, t: 14, color: '#8cf' });
    G.recomputeSupply();
    return true;
  },
  // BLINK, and the one check that is not obvious. "Is the destination walkable" is not enough, because
  // the top of a cliff is walkable and so is a single tile sealed in by rock -- and a unit blinked into
  // the second one is gone for the rest of the game, because the pathfinder starts from where you
  // already are.
  //
  // The rule is NOT "can a ground unit walk here from the caster". That would be the tidy version and
  // it would delete the ability: crossing terrain you cannot walk is the entire point of Blink, and a
  // cliff top fails a reachability test from below every time. What a legal destination has to be is
  // ground you can walk OFF -- so this floods out from the destination over walkable tiles and asks
  // whether anything BLINK_ESCAPE tiles away is reachable. A plateau passes, a wall you can walk around
  // passes, a one-tile pocket does not, and a rock island in the middle of water does not.
  //
  // Bounded at 400 tiles, which it only ever reaches when the answer is already no; it returns the
  // instant it escapes, so the normal case visits a handful. Blink is rate-limited to one cast per unit
  // per ten seconds, so even the worst case is nothing next to one pathfinder search.
  blinkReach(m, tx, ty, esc) {
    if (!m.walkable(tx, ty)) return false;
    const seen = new Set([m.idx(tx, ty)]), q = [tx, ty];
    for (let h = 0; h < q.length && h < 800; h += 2) {
      const x = q[h], y = q[h + 1];
      if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) >= esc) return true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!m.walkable(nx, ny)) continue;
        const i = m.idx(nx, ny); if (seen.has(i)) continue;
        seen.add(i); q.push(nx, ny);
      }
    }
    return false;
  },
  // Which of my buildings is under this point. Chrono Boost is cast from a building, so
  // Abilities.issue's building branch hands `cast` a position and no target -- this is what turns the
  // position back into the thing the player clicked. Footprint containment rather than nearest-centre,
  // because two 4x3 halls placed a tile apart (which G.placeBuilding permits: it does not re-check
  // canPlace) would otherwise fight over a click that is unambiguously inside one of them.
  chronoTarget(u, x, y) {
    for (const b of G.units) {
      if (!b.alive || !b.isBuilding || b.owner !== u.owner || !b.done || b.lifted) continue;
      if (x < b.tx * TILE || x >= (b.tx + b.def.w) * TILE) continue;
      if (y < b.ty * TILE || y >= (b.ty + b.def.h) * TILE) continue;
      return b;
    }
    return null;
  },
  // THE MOVING HALF OF THE PSI GRID -- the part that notices a source has MOVED. A building never
  // does, so nothing outside this function ever had to ask; a Warp Prism does it constantly.
  //
  // Painting is not this function's job any more. It used to recompute the buildings and then paint
  // the mobile sources on top, because js/map.js was not this change's to edit -- and that overlay
  // was worse than the bug it worked around, since it is keyed and therefore skipped when nothing
  // moved, while any other caller of recomputePsi (a pylon completing or dying) wiped the grid back
  // to buildings only and left a parked prism with no field for the rest of the game. GameMap.
  // recomputePsi now handles both kinds of source, so this is only the trigger.
  //
  // IT IS KEYED, NOT UNCONDITIONAL. `p.psiKey` is a digest of every mobile source's id and tile, so a
  // full recompute happens only when one appears, moves a tile or dies -- and a Protoss player with no
  // Warp Prism at all pays one walk of G.units every twelve frames and nothing else. The key lives on
  // the Player, which js/snapshot.js already captures whole, so a restored checkpoint agrees with its
  // restored `psi` grids instead of recomputing one frame later and diverging.
  //
  // Deterministic: G.units in order, integer arithmetic, no G.rand, no clock.
  tickProtoss() {
    if (G.frame % 12) return;
    const m = G.map;
    for (const p of G.players) {
      if (!p || p.race !== 'P' || p.neutral) continue;
      let key = 0;
      for (const u of G.units) {
        if (!u.alive || u.owner !== p.id || !u.def.psi || u.isBuilding) continue;
        key = (Math.imul(key, 31) + u.id * 8191 + Math.floor(u.y / TILE) * m.w + Math.floor(u.x / TILE)) | 0;
      }
      if (key === (p.psiKey || 0)) continue;
      p.psiKey = key;
      m.recomputePsi(p.id, G.units);          // buildings AND mobile sources; the map owns both now
    }
  },
  // ---------------- ability order execution ----------------
  orderTick(u) {
    const o = u.order, ab = DATA.abilities[o.abil], p = u.player;
    const t = o.target; if (t && (!t.alive || (t.owner !== u.owner && !G.canSee(u.owner, t) && o.abil !== 'consume'))) { u.nextOrder(); return; }
    const tx = t ? t.x : o.x, ty = t ? t.y : o.y; const range = this.castRange(u, ab, t);
    if (o.phase === 'channel') { this.channel(u, o); return; }
    // THE ONE LINE FIXLIST-M15 C2 NAMES. For anything that can move, `range` on a point ability is a
    // WALK-TO distance and not a limit: the caster is sent to the spot and casts when it arrives. That
    // is correct and load-bearing for every point ability in the game -- a Defiler ordered to Dark
    // Swarm 30 tiles away walks 45 tiles and casts, and it should. It is also why an Overlord asked to
    // plant a Creep Tumour 17 tiles away flew 13 tiles and planted it, against a declared range of 3.
    //
    // `noApproach` is a per-ability opt-out and NOT a change to the shared path, which is the whole
    // of the decision: two abilities want a hard limit and twenty-six want walk-to. It is checked
    // BEFORE the immobile-caster branch so a flagged ability says why it refused instead of dropping
    // the order in silence, and before energy is spent a few lines below, so a refusal is free.
    if (distPt(u.x, u.y, tx, ty) > range) {
      if (ab.noApproach) { p.msg(this.outOfRangeMsg(ab), 'error'); u.nextOrder(); return; }
      if (!u.canMove || u.sieged || u.burrowed) { u.nextOrder(); return; }
      u.moveTo(tx, ty, t); return;
    }
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
    const o = u.order.type;
    if (!(o === 'idle' || o === 'attackmove' || o === 'follow' || o === 'hold' || o === 'move')) return;
    let best = null, bd = 1e9;
    for (const t of G.near(u.x, u.y, 6 * TILE)) { if (t === u || t.owner !== u.owner || !t.def.bio || t.isBuilding || t.hp >= t.maxHp || t.inside || t.def.egg || t.def.larva) continue; const d = dist(u, t); if (d < bd) { bd = d; best = t; } }
    if (!best) return;
    if (bd <= u.r + best.r + TILE) { const amt = Math.min(4, best.maxHp - best.hp); best.hp += amt; u.energy -= amt / 2; G.effects.push({ kind: 'heal', x: best.x, y: best.y - 8, t: 6 }); return; }
    if (o === 'hold') return;                                    // hold means stay put, even for a medic
    if (o === 'idle') { u.applyOrder({ type: 'ability', abil: 'heal', target: best, x: best.x, y: best.y }); return; }
    // Out of touch range on the move: walk over, heal, then carry on. Without this a medic only ever
    // healed what it happened to bump into, which is why medics alone were three quarters of all the
    // energy the AI never spent (test/aiaudit.js --casters).
    const prev = u.order;
    u.applyOrder({ type: 'ability', abil: 'heal', target: best, x: best.x, y: best.y });
    u.queue.unshift(prev); if (u.queue.length > 8) u.queue.length = 8;
  },
  batteryAuto(b) {
    if (b.unpowered) return; let best = null, bd = 1e9;
    for (const t of G.near(b.x, b.y, 6 * TILE)) { if (t.owner !== b.owner || t.isBuilding || t.sh >= t.maxSh || !t.maxSh) continue; const d = dist(b, t); if (d < bd) { bd = d; best = t; } }
    if (!best) return; const amt = Math.min(2, best.maxSh - best.sh, b.energy * 2); best.sh += amt; b.energy -= amt / 2; if ((G.frame & 3) === 0) G.effects.push({ kind: 'line', x: b.x, y: b.y, tx: best.x, ty: best.y, t: 3, color: '#6af' });
  },
  repairTick(u) {
    const t = u.order.target; const p = u.player;
    // repairableDef is a positive whitelist on the def (js/data.js) rather than a rule derived from
    // other fields. A spider mine is mech but is a munition with no build time, so the rate below
    // divided by undefined and the target's hp became NaN -- which then spread through every comparison
    // it touched. Nothing reached that until the AI was taught to repair in M10, and then a tank
    // shooting a mine left NaN units on the map.
    // ONE exception, and it is the whole of M11 wave two item 8: repairing something you do NOT own is
    // how you take it. Everywhere else that refusal is exactly right, which is why this is a narrow
    // clause rather than a relaxed rule -- it applies only to a def that carries `derelict`, only while
    // the neutral owner still holds it, and only to a worker.
    const der = t && t.def.derelict;
    const cap = !!(der && G.neutral && t.owner === G.neutral.id && u.def.worker);
    if (!t || !t.alive || (!cap && (!repairableDef(t.def) || t.owner !== u.owner)) || t.hp >= t.maxHp || (t.isBuilding && !t.done)) { u.nextOrder(); return; }
    if (!(t.isBuilding ? u.moveToRect(t, 6) : dist(u, t) <= u.r + t.r + 8)) { if (!t.isBuilding) u.moveTo(t.x, t.y, t); return; }
    // A derelict has its own rate (hp per second per repairer) and its own price, and the price is the
    // TOTAL for the whole job charged pro rata -- so it is spread over the hp actually being restored,
    // (1 - ruin) of the building, not over its full bar.
    const span = cap ? Math.max(1, t.maxHp * (1 - (der.ruin || 0))) : 0;
    const rate = cap ? (der.rate || 12) / TPS : t.maxHp / Math.max(200, t.def.time * 0.6);
    const frac = rate / t.maxHp;
    const cm = cap ? (der.min || 0) * rate / span : t.def.min * 0.25 * frac;
    const cg = cap ? (der.gas || 0) * rate / span : t.def.gas * 0.25 * frac;
    u.repairAcc = (u.repairAcc || 0) + cm; u.repairAccG = (u.repairAccG || 0) + cg;
    if (u.repairAcc >= 1) { if (p.minerals < 1) { p.msg('Not enough minerals.', 'error'); u.nextOrder(); return; } p.minerals -= 1; u.repairAcc -= 1; }
    if (u.repairAccG >= 1) { if (p.gas < 1) { p.msg('Not enough vespene gas.', 'error'); u.nextOrder(); return; } p.gas -= 1; u.repairAccG -= 1; }
    t.hp = Math.min(t.maxHp, t.hp + rate); if ((G.frame & 3) === 0) G.effects.push({ kind: 'spark', x: t.x + (G.rand() - .5) * t.r, y: t.y + (G.rand() - .5) * t.r, t: 4 });
    if (cap && t.hp >= t.maxHp) { G.captureDerelict(t, u.owner); u.nextOrder(); }
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
    // The five warp-ins are one behaviour with five payloads, so they are dispatched off the def rather
    // than as five identical switch arms below. See Abilities.warpIn.
    const abd = DATA.abilities[id];
    if (abd && abd.warp) return this.warpIn(u, id, x, y);
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
      // ---- M12 wave four, Terran -------------------------------------------------------------------
      // CALL DOWN MULE. The unit carries its own expiry (`lifetime` on the def, counted down by
      // Unit.tick), so nothing here has to remember it exists; the ability's whole job is to put it on
      // the ground and point it at a rock.
      //
      // It is aimed at the nearest patch to the DROP POINT rather than to the Orbital, which is what
      // makes "where you drop it" the decision: drop it on a far expansion and it works that
      // expansion. If there is no mineral field left anywhere it still spawns and stands there, which
      // is correct -- 50 energy spent badly is the punishment, not a refund.
      case 'mule': {
        const mu = G.spawnUnit('mule', u.owner, x, y);
        const near = G.findNearestResource(mu, 'mineral');
        if (near) mu.applyOrder({ type: 'gather', target: near, phase: 'goto' });
        G.effects.push({ kind: 'ring', x, y, r: 20, t: 14, color: '#8cf' });
        break;
      }
      // JAMMING FIELD. A mobile, temporary Scrambler Mast: everything hostile inside it is blinded to
      // two tiles and stops counting as a detector, for as long as it stays inside. The refresh idiom
      // is Disruption Web's -- set the status to 3 frames every tick from tickFields, so leaving the
      // field clears it two frames later with no bookkeeping and no per-unit list to keep in a
      // snapshot. Both effects fall out of `fx.blind`, which Unit.get sight and Unit.get isDetector
      // already read; this adds no new status.
      case 'jam_field': G.fields.push({ kind: 'jam', x, y, r: 4, t: 480, owner: u.owner }); ring(4, '#7ae'); break;
      case 'parasite': t.fx.parasite = u.owner; ring(0.5, '#f8f'); break;
      case 'ensnare': for (const o of G.near(x, y, 2 * TILE)) if (!o.isBuilding) o.fx.ensnare = 576; ring(2, '#8f8'); break;
      // FIXLIST-M15 B2. Every refusal below used to say the same three words, 'Invalid target.', in
      // seven places -- which tells a player that they were wrong and nothing else. Each one now PICKS
      // THE REASON from the condition that actually failed, because 'cannot target air units' says what
      // to do next and 'only works on organic ground units' just makes them read it again.
      //
      // The audit the item asked for turned up an eighth, which was worse than generic: Psionic Storm
      // refunded its 75 energy and said NOTHING when the spot was already burning, so the click looked
      // like it had been swallowed by the game.
      case 'spawn_broodling': if (t.fly || t.isBuilding || NO_BROODLING.has(t.def.id) || t.def.race === 'P' && t.def.mech) { p.msg(t.isBuilding ? 'Spawn Broodlings cannot target buildings.' : t.fly ? 'Spawn Broodlings cannot target air units.' : 'Spawn Broodlings only works on organic ground units -- not robotic ones.', 'error'); u.energy += 150; break; } G.kill(t, u); for (let i = 0; i < 2; i++) { const b = G.spawnUnit('broodling', u.owner, t.x + (i ? 10 : -10), t.y); b.lifetime = 1800; } break;
      case 'dark_swarm': G.fields.push({ kind: 'swarm', x, y, r: 3, t: 900, owner: u.owner }); break;
      case 'plague': for (const o of G.near(x, y, 2 * TILE)) o.fx.plague = 600; ring(2, '#f80'); break;
      case 'consume': if (!t || t.owner !== u.owner || t.isBuilding || t.def.larva || t.def.egg || t === u) { p.msg(!t || t.owner !== u.owner ? 'Consume only works on your own units.' : t === u ? 'The Defiler cannot consume itself.' : t.isBuilding ? 'Consume cannot eat a building.' : 'Consume cannot eat larvae or eggs.', 'error'); break; } G.kill(t, null, true); u.energy = Math.min(u.maxEnergy, u.energy + 50); break;
      case 'psi_storm': if (this.inField(x, y, 'storm')) { p.msg('A Psionic Storm is already burning there.', 'error'); u.energy += 75; break; } G.fields.push({ kind: 'storm', x, y, r: 1.5, t: 64, owner: u.owner, tickT: 0 }); break;
      case 'hallucination': if (t.isBuilding || t.def.larva || t.def.egg || t.def.notUnit) { p.msg(t.isBuilding ? 'Hallucination cannot copy a building.' : 'Hallucination can only copy a unit.', 'error'); u.energy += 100; break; } for (let i = 0; i < 2; i++) { const h = G.spawnUnit(t.def.id, u.owner, t.x + (i ? 20 : -20), t.y); h.halluc = true; h.lifetime = 1000; h.hp = t.maxHp; h.sh = t.maxSh; h.energy = 0; h.maxEnergy = 0; } break;
      case 'feedback': if (!t.maxEnergy) { p.msg('Target has no energy.', 'error'); u.energy += 50; break; } { const e = t.energy; t.energy = 0; G.damageRaw(t, e, u); ring(0.5, '#f4f'); } break;
      case 'mind_control': if (t.isBuilding || t.owner === u.owner || t.def.larva || t.def.egg) { p.msg(t.isBuilding ? 'Mind Control cannot take a building.' : t.owner === u.owner ? 'Mind Control only works on enemy units.' : 'Mind Control cannot take larvae or eggs.', 'error'); u.energy += 150; break; } this.changeOwner(t, u.owner); u.sh = 0; ring(0.6, '#f4f'); break;
      case 'maelstrom': for (const o of G.near(x, y, 1.5 * TILE)) if (o.def.bio && !o.isBuilding) { o.fx.maelstrom = 144; o.path = null; } ring(1.5, '#f4f'); break;
      case 'disruption_web': G.fields.push({ kind: 'dweb', x, y, r: 2.5, t: 576, owner: u.owner }); break;
      case 'stasis_field': for (const o of G.near(x, y, 1.5 * TILE)) if (!o.isBuilding) { o.fx.stasis = 720; o.path = null; } ring(1.5, '#8cf'); break;
      case 'infest': { if (!t || t.def.id !== 'command_center' || !t.done || t.hp >= t.maxHp * 0.5 || t.lifted) { p.msg('Only a damaged, landed Command Center can be infested.', 'error'); break; } if (t.addon) { t.addon.parent = null; t.addon = null; } for (const it of t.prod) if (it.kind === 'upg' || it.kind === 'tech') G.players[t.owner].researching.delete(it.id); t.prod = []; t.rally = null; while (t.cargo.length) G.unloadOne(t); const od = G.players[t.owner]; t.owner = u.owner; t.def = DATA.buildings.infested_command_center; t.maxHp = t.def.hp; t.done = true; G.recomputeSupply(); if (od.human) od.msg('Your Command Center has been infested!', 'attack'); if (p.human) p.msg('Command Center infested.'); ring(1, '#c4f'); break; }
      case 'nydus_exit': { const def = DATA.buildings.nydus_canal; const tx = Math.floor(x / TILE - def.w / 2 + .5), ty = Math.floor(y / TILE - def.h / 2 + .5); const err = G.map.canPlace(def, tx, ty, p, G.units, null); if (err) { p.msg(err, 'error'); break; } const e = G.placeBuilding(def, tx, ty, u.owner); e.nydusLink = u; u.nydusLink = e; (u.nydusNet || (u.nydusNet = [])).push(e); break; }   // the old two-ended exit joins the network too, so there is one list and one rule
      // ---- M12 wave four -----------------------------------------------------------------------
      // A worm may only surface on creep (`needsCreep` on the def), which is what ties this to the
      // Creep Tumour: the tumour chain is how creep gets somewhere worth surfacing at.
      case 'nydus_worm': { const def = DATA.buildings.nydus_worm; const tx = Math.floor(x / TILE - def.w / 2 + .5), ty = Math.floor(y / TILE - def.h / 2 + .5); const err = G.map.canPlace(def, tx, ty, p, G.units, null); if (err) { p.msg(err, 'error'); break; } if (!p.canAfford(def.min, def.gas)) break; p.minerals -= def.min; p.gas -= def.gas; const w = G.placeBuilding(def, tx, ty, u.owner); w.nydusLink = u; (u.nydusNet || (u.nydusNet = [])).push(w); u.nydusLink = w; break; }
      case 'plant_tumour': { this.plantTumour(u, x, y); break; }
      case 'spawn_tumour': { if (this.plantTumour(u, x, y)) u.tumoured = true; break; }
      // Corrosive Bile is a delayed shell, not a hit. The delay is the whole balance of it: anything
      // with legs walks out, anything sieged, burrowed, rooted or built does not. Routed through
      // Combat.splash so it also reaches destructible map features -- the wall a defender is standing
      // behind is a legitimate target, and this is Zerg's only way to shoot one.
      case 'corrosive_bile': { const a = DATA.abilities.corrosive_bile; G.fields.push({ kind: 'bile', x, y, r: a.r, t: a.delay, owner: u.owner, src: u }); ring(a.r, '#9d4'); break; }
      // Fungal Growth roots AND silences: fx.maelstrom is the one status this engine already has that
      // returns from Unit.tick outright, so nothing inside the cloud moves, shoots or casts. Allies
      // are exempt, which is not how SC2 plays it and is how this reads at a glance -- "the cloud
      // holds what is not yours" is a rule a player can see happening.
      case 'fungal_growth': { const a = DATA.abilities.fungal_growth; G.fields.push({ kind: 'fungal', x, y, r: a.r, t: a.t, owner: u.owner, tickT: 0 }); ring(a.r, '#6c5'); break; }
      // The one ability in the game that makes `infested_terran` a unit anybody ever sees. It is
      // otherwise reachable only by infesting a damaged Command Center, which needs a Terran opponent
      // to have let a hall fall below half. Given a lifetime so an Infestor cannot supply-lock itself.
      case 'spawn_infested': { for (let i = 0; i < 2; i++) { const it = G.spawnUnit('infested_terran', u.owner, x + (i ? 14 : -14), y + (i ? 8 : -8)); it.lifetime = 720; } ring(1, '#8c4'); break; }
      // Nothing else in this game moves an enemy unit. Un-sieges and un-burrows what it takes, which
      // is most of the value: a tank pulled out of its line arrives in tank mode, in your army.
      case 'abduct': {
        const ab = DATA.abilities.abduct;
        if (!t || t.isBuilding || t.def.larva || t.def.egg || t.def.notUnit || t.def.mine || t.fx.stasis > 0) { p.msg(!t || t.isBuilding ? 'Abduct cannot take a building.' : t.fx.stasis > 0 ? 'That unit is in stasis and cannot be moved.' : 'Abduct can only take a unit.', 'error'); u.energy += ab.energy; break; }
        let ax = u.x, ay = u.y;
        if (!t.fly) { const tl = G.map.findFreeTile(Math.floor(u.x / TILE), Math.floor(u.y / TILE), 6); if (!tl) { p.msg('No room to pull it to.', 'error'); u.energy += ab.energy; break; } ax = (tl[0] + .5) * TILE; ay = (tl[1] + .5) * TILE; }
        if (t.burrowed) { t.burrowed = false; t.transT = 24; }
        if (t.sieged) { t.sieged = false; t.transT = 40; }
        t.x = ax; t.y = ay; t.px = ax; t.py = ay; t.path = null; t.target = null; t.stuck = 0; t.applyOrder({ type: 'idle' });
        G.effects.push({ kind: 'line', x: u.x, y: u.y, tx: ax, ty: ay, t: 8, color: '#7d5' }); ring(0.8, '#7d5'); break;
      }
      // The defiler eats your zerglings; the viper eats your buildings. Same idea, opposite cost, and
      // it means a viper parked over a hatchery sustains itself without spending army.
      case 'consume_essence': {
        if (!t || t.owner !== u.owner || !t.isBuilding || !t.done || t.hp <= 120) { p.msg(!t || !t.isBuilding ? 'Consume Essence only works on a building.' : t.owner !== u.owner ? 'Consume Essence only works on your OWN buildings.' : !t.done ? 'That building is not finished yet.' : 'That building is too damaged to drain -- it needs more than 120 health.', 'error'); break; }
        G.damageRaw(t, 100, null); u.energy = Math.min(u.maxEnergy, u.energy + 50); ring(0.8, '#8f8'); break;
      }
      // Contaminate reuses fx.maelstrom because Unit.tick returns on it BEFORE tickBuilding runs, so a
      // contaminated structure produces nothing, researches nothing, spawns no larva and grows no
      // creep, without a single new status field for js/snapshot.js to learn about. A Terran medic's
      // Restoration clears it, which is a counterplay this happens to get for free and is welcome.
      case 'contaminate': {
        const ab = DATA.abilities.contaminate;
        if (!t || !t.isBuilding || !t.done || G.allied(t.owner, u.owner)) { p.msg(!t || !t.isBuilding ? 'Contaminate only works on a building.' : !t.done ? 'That building is not finished yet.' : 'Contaminate only works on ENEMY buildings.', 'error'); u.energy += ab.energy; break; }
        t.fx.maelstrom = 720; ring(1.2, '#a6f'); break;
      }
      // ITEM 11. The cast only books the delivery; tickFields hatches it, exactly the way the nuke and
      // Recall already work, which is what keeps the ten-second wait inside G.fields where snapshots,
      // replay seeks and rejoins all reproduce it without knowing this ability exists.
      case 'larva_inject': {
        const ab = DATA.abilities.larva_inject;
        if (!t || t.owner !== u.owner || !t.isBuilding || !t.def.spawnsLarva || !t.done) { p.msg('Spawn Larva needs one of your hatcheries.', 'error'); u.energy += ab.energy; break; }
        if (G.fields.some(f => f.kind === 'inject' && f.hall === t)) { p.msg('That hatchery is already spawning larva.', 'error'); u.energy += ab.energy; break; }
        G.fields.push({ kind: 'inject', x: t.x, y: t.y, r: 0, t: ab.delay, owner: u.owner, hall: t }); ring(1.4, '#c8f'); break;
      }
      // ---- M12 wave four, Protoss ------------------------------------------------------------------
      // ITEM 11, CHRONO BOOST. Like the nuke, Recall and Larva Inject, the cast only books the effect
      // and tickFields does the work -- which is what keeps the twenty seconds inside G.fields, where
      // a snapshot, a replay seek and a rejoining client all reproduce it without knowing this ability
      // exists. A counter on the building would restore to a fresh one after a seek.
      //
      // IT CANNOT STACK, and the refusal is a refund rather than a silent no-op, because
      // Abilities.issue's building branch spends the energy before this runs. "Cast it twice" is the
      // first thing a player tries and the answer has to be one they can predict: one boost, one
      // building, and the second Nexus keeps its energy for something else.
      case 'chrono_boost': {
        const ab = DATA.abilities.chrono_boost;
        const b = this.chronoTarget(u, x, y);
        if (!b) { p.msg('Chrono Boost needs one of your own structures.', 'error'); u.energy += ab.energy; break; }
        if (G.fields.some(f => f.kind === 'chrono' && f.bld === b)) { p.msg('That structure is already accelerated.', 'error'); u.energy += ab.energy; break; }
        G.fields.push({ kind: 'chrono', x: b.x, y: b.y, r: 0, t: ab.t, owner: u.owner, bld: b });
        G.effects.push({ kind: 'ring', x: b.x, y: b.y, r: b.r, t: 16, color: '#ffd76a' });
        break;
      }
      // FORCE FIELD. The tiles come back from GameMap.raiseForceField (see the top of this file) and
      // are carried in the field itself, so expiry gives back exactly what was taken and a snapshot
      // restores both halves together.
      //
      // Anything standing on the ground that just stopped existing is pushed off it. SC2 shoves units
      // aside; this does the same thing with G.map.findFreeTile, and it is not politeness -- a ground
      // unit left inside the plug is wedged until the field expires, because Unit.moveTo's pathfinder
      // starts from where the unit already is and G.tick's self-heal pass only rescues units caught
      // inside BUILDING footprints.
      case 'force_field': {
        const ab = DATA.abilities.force_field;
        const tiles = G.map.raiseForceField(x, y, ab.r);
        if (!tiles.length) { p.msg('No room for a Force Field there.', 'error'); u.energy += ab.energy; break; }
        for (const o of G.units) {
          if (!o.alive || o.fly || o.isBuilding || o.inside) continue;
          const ox = Math.floor(o.x / TILE), oy = Math.floor(o.y / TILE);
          if (!G.map.inb(ox, oy) || !tiles.includes(G.map.idx(ox, oy))) continue;
          const tl = G.map.findFreeTile(ox, oy, 6);
          if (tl) { o.x = (tl[0] + 0.5) * TILE; o.y = (tl[1] + 0.5) * TILE; o.px = o.x; o.py = o.y; o.path = null; o.stuck = 0; }
        }
        G.fields.push({ kind: 'force_field', x, y, r: ab.r, t: ab.t, owner: u.owner, tiles });
        ring(ab.r, '#9cf'); break;
      }
      // GRAVITON BEAM. `fx.maelstrom` is the one status this engine has that returns from Unit.tick
      // outright, so a lifted unit does not move, shoot or cast -- which is what being held in the air
      // means, and it needs no new status for js/snapshot.js to carry. A flyer is not a legal target
      // (there is nothing to lift it off) and the energy comes back, the same refusal shape lockdown
      // and spawn broodling already use.
      case 'graviton_beam': {
        const ab = DATA.abilities.graviton_beam;
        if (!t || t.fly || t.isBuilding || t.def.larva || t.def.egg || t.def.notUnit || G.allied(t.owner, u.owner)) {
          p.msg('Graviton Beam can only lift an enemy ground unit.', 'error'); u.energy += ab.energy; break;
        }
        t.fx.maelstrom = ab.t; t.path = null; t.target = null;
        G.effects.push({ kind: 'line', x: u.x, y: u.y, tx: t.x, ty: t.y, t: 10, color: '#9df' });
        ring(0.6, '#9df'); break;
      }
      // REVELATION is the Comsat's own field kind, reused rather than reinvented: G.updateVision
      // already marks a `scan` field for whoever owns it, so this is vision and nothing else. It is
      // deliberately not detection -- an Observer is still the only thing Protoss has that sees
      // through a cloak, and a 150/150 ship that answered every cloak in the game would delete it.
      case 'revelation': { const ab = DATA.abilities.revelation; G.fields.push({ kind: 'scan', x, y, r: ab.r, t: ab.t, owner: u.owner }); ring(ab.r, '#dbf'); break; }
      // PURIFICATION NOVA is a fuse, and it does NOTHING on the frame it is cast. Same shape as the
      // Ravager's bile and the nuke: the delay is the balance of the ability, because anything with
      // legs walks out and anything sieged, rooted or built does not. `ff: true` is the other half --
      // it hits the caster's own army exactly as Psionic Storm does, which is what stops it being a
      // free button in a melee.
      case 'purification_nova': { const ab = DATA.abilities.purification_nova; G.fields.push({ kind: 'nova', x, y, r: ab.r, t: ab.delay, owner: u.owner, src: u }); ring(ab.r, '#c9f'); break; }
      // TIME WARP refreshes `fx.ensnare` from tickFields every frame, which is Disruption Web's idiom:
      // leaving the field clears it two frames later with no per-unit list to keep in a snapshot, and
      // it costs no new status. Enemy GROUND units only -- allies walk through it and flyers are over
      // it, which is a rule a player can read off the screen while it is happening.
      case 'time_warp': { const ab = DATA.abilities.time_warp; G.fields.push({ kind: 'time_warp', x, y, r: ab.r, t: ab.t, owner: u.owner }); ring(ab.r, '#9cf'); break; }
      // BLINK, the folded Stalker. Two refusals, and the second one is the interesting one -- see
      // Abilities.blinkReach for why a plain walkability test on the destination is not enough.
      //
      // A REFUSED BLINK DOES NOT SPEND THE RECHARGE. That is the difference between an ability with a
      // cooldown and a trap: misclicking on to a cliff must not cost ten seconds of the thing that
      // keeps the unit alive. `blinkAt` is a frame STAMP rather than a counting-down field, so a
      // snapshot restores it by copying one number and nothing has to tick it.
      case 'blink': {
        const ab = DATA.abilities.blink;
        const last = typeof u.blinkAt === 'number' ? u.blinkAt : -1e9;   // never `|| -1e9`: a blink on frame 0 is a real blink
        if (G.frame - last < ab.cd) { p.msg('Blink is recharging.', 'error'); break; }
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (!G.map.walkable(tx, ty) || !this.blinkReach(G.map, tx, ty, BLINK_ESCAPE)) { p.msg('Cannot blink there.', 'error'); break; }
        G.effects.push({ kind: 'ring', x: u.x, y: u.y, r: u.r + 8, t: 10, color: '#8cf' });
        u.x = (tx + 0.5) * TILE; u.y = (ty + 0.5) * TILE; u.px = u.x; u.py = u.y;
        u.path = null; u.stuck = 0; u.blinkAt = G.frame;
        G.effects.push({ kind: 'ring', x: u.x, y: u.y, r: u.r + 8, t: 10, color: '#8cf' });
        break;
      }
    }
  },
  changeOwner(t, pid) { if (t.order.type === 'gather' && t.order.target && t.order.target.miner === t) t.order.target.miner = null; if (t.order.type === 'gather' && t.order.phase === 'inside' && t.order.target) { t.order.target.occupant = null; t.inside = null; } if (t.order.type === 'construct' && t.order.target && t.order.target.builder === t) t.order.target.builder = null; t.owner = pid; t.order = { type: 'idle' }; t.queue = []; t.path = null; t.target = null; t.carrying = null; t.wave = 0; if (typeof UI !== 'undefined' && UI.onUnitDied) UI.onUnitDied(t); G.recomputeSupply(); if (t.player.human) t.player.msg('Unit mind controlled.'); },
  // ================= M12 wave four: the Terran per-frame pass =================
  // Three things that have no other home in the files this branch owns, in ONE walk of G.units.
  //
  // WHERE THIS BELONGS, so the next person does not have to work it out. All three of these are
  // per-unit simulation and their natural home is js/sim.js -- the MULE's haul beside Unit.tickGather,
  // the Reactor beside Unit.tickProduction, the Medivac beside the line that dispatches
  // Abilities.medicAuto for the literal id 'medic'. This branch does not own js/sim.js and three race
  // branches are editing in parallel, so they are gathered here and called from tickFields, which
  // G.tick already runs unconditionally once a frame. The exact hooks are listed in the handoff.
  //
  // COST. One property read and one branch per living unit per frame. The tick is dominated by unit
  // separation at ~0.9 ms of ~3 ms at 500 units; this is a flag test in the same order of magnitude as
  // the reap filter that already runs once a second. Nothing here allocates.
  //
  // DETERMINISM. G.units in order, no G.rand, no wall clock, no Set or Map iteration.
  tickTerran() {
    for (const u of G.units) {
      if (!u.alive) continue;
      const d = u.def;
      if (d.mule) { this.muleHaul(u); continue; }
      // The Medivac's heal autocast. js/sim.js runs this for `d.id === 'medic'` on the same
      // (frame + id) % 8 stagger, and the stagger matters for more than cost: M9 found that every
      // `(G.frame + id) % N` gate in micro() was only ever true for a fraction of the ids, so the
      // residues are kept identical to the medic's rather than invented here.
      if (d.id === 'medivac' && u.done && !u.disabled && u.order.type !== 'ability' && (G.frame + u.id) % 8 === 0) this.medicAuto(u);
      if (d.reactor && u.done && u.parent) this.reactorTick(u.parent);
    }
  },
  // A MULE takes MULE_HAUL extra minerals out of the patch it just worked and carries them home on the
  // same trip. See MULE_HAUL at the top of the file for why it debits the patch rather than crediting
  // the player out of nothing.
  //
  // The hook is the frame the payload appears: Unit.tickGather sets `carrying` and hands the unit a
  // 'return' order in one step, so a `carrying` without our tag is a pickup that has not been topped up
  // yet. The tag goes on unconditionally, before any of the reasons this might do nothing, so a MULE
  // standing on a patch that ran dry cannot be topped up twice on the way home.
  //
  // `lastRes` rather than `order.then`: Unit.tickGather sets `lastRes` on every gather tick and it
  // survives whatever the order queue does next, whereas `then` is only there if the return order is
  // still the current one.
  muleHaul(u) {
    const c = u.carrying;
    if (!c || c.type !== 'mineral' || c.hauled) return;
    c.hauled = true;
    const res = u.lastRes;
    if (!res || res.type !== 'mineral' || res.amount <= 0) return;   // the patch died on this very trip
    const extra = Math.min(res.amount, MULE_HAUL);
    res.amount -= extra; c.amt += extra;
    if (res.amount <= 0) G.removeResource(res);
  },
  // The Reactor: a second unit built in parallel with the first.
  //
  // Unit.tickProduction only ever advances `prod[0]`, so this advances `prod[1]` under exactly the same
  // rules -- the same supply gate, the same `it.started` latch, the same cwal cheat multiplier, the
  // same finishProduction on completion. Duplicating those four lines rather than generalising them is
  // deliberate: the alternative is a change to Unit.tickProduction, which this branch does not own.
  //
  // BOTH SLOTS MUST BE UNITS. A Barracks can research Suppressing Fire, and a reactor that let a
  // marine slide out from behind a research would make the add-on a research-cancel button as well as
  // a throughput bonus. One thing, legibly.
  reactorTick(b) {
    if (!b.alive || !b.done || b.lifted || b.prod.length < 2) return;
    if (b.prod[0].kind !== 'unit' || b.prod[1].kind !== 'unit') return;
    const it = b.prod[1], p = b.player, ud = DATA.units[it.id];
    if (!it.started) {
      if (ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax && !it.reserved && !(G.cheats.food && p.human)) return;
      it.started = true;
    }
    it.progress += (G.cheats.cwal && p.human) ? 10 : 1;
    if (it.progress >= it.total) { b.prod.splice(1, 1); G.finishProduction(b, it); }
  },
  // Per-frame bookkeeping for the two M12 Zerg structures whose state js/sim.js has no way to notice.
  // It lives here, and is called from tickFields, for one reason: tickFields is the only per-frame
  // hook this file owns, and giving it a second one would mean a new line in G.tick -- js/game.js,
  // which this change may not touch. Staggered to one frame in twelve and it reads two properties per
  // unit, so it costs about forty property reads a frame amortised at 500 units.
  //
  // Two jobs:
  //   NYDUS -- the hub's `nydusLink` is the newest living mouth. js/sim.js's 'nydus' order reads one
  //   link per building, so a network of N worms is expressed as "every worm points home, the canal
  //   points at the newest". When that worm dies the canal has to fall back to the next newest, or
  //   the whole network silently stops working and nothing tells the player why.
  //   CRAWLERS -- an uprooted crawler still carries `def.creep`. GameMap.recomputeCreep skips it while
  //   it is `lifted`, but nothing calls recomputeCreep when it stands back up: G.landBuilding does not,
  //   and creepR has already reached def.creep so Unit.tickBuilding's growth step never fires again.
  //   Keyed on the tile it is standing on so the recompute happens once per move, not once per frame.
  tickZergNet() {
    if (G.frame % 12) return;
    let recreep = false;
    for (const u of G.units) {
      if (!u.alive || !u.isBuilding) continue;
      if (u.nydusNet) {
        if (u.nydusNet.some(w => !w.alive)) u.nydusNet = u.nydusNet.filter(w => w.alive);
        if (!u.nydusLink || !u.nydusLink.alive) u.nydusLink = u.nydusNet.length ? u.nydusNet[u.nydusNet.length - 1] : null;
      }
      if (u.def.crawler) { const key = u.lifted ? -1 : u.tx * 4096 + u.ty; if (u.creepKey !== key) { u.creepKey = key; recreep = true; } }
    }
    if (recreep) G.map.recomputeCreep(G.units);   // one recompute per pass however many crawlers moved
  },
  tickFields() {
    this.tickTerran();
    this.tickZergNet();
    this.tickProtoss();
    const fs = G.fields;
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i]; f.t--;
      if (f.kind === 'storm') { if (++f.tickT % 8 === 0) for (const o of G.near(f.x, f.y, f.r * TILE)) if (!o.isBuilding) G.damageRaw(o, 14, null); }
      else if (f.kind === 'dweb') { for (const o of G.near(f.x, f.y, f.r * TILE)) if (!o.fly) o.fx.dweb = Math.max(o.fx.dweb || 0, 3); }
      // The Raven's Jamming Field. Buildings are included on purpose and are most of the point: the
      // things a cloaked Terran army actually has to get past are a Missile Turret, a Spore Colony and
      // a Photon Cannon, and every one of those is a building whose `isDetector` reads `fx.blind`.
      // A jammed detector still SHOOTS -- it just cannot see anything cloaked while it is jammed.
      //
      // The ring is pushed from here rather than drawn by js/fx.js, which this branch does not own. It
      // is frame-gated and not random, so it reproduces in a replay; see the handoff for the one-line
      // FX.drawField branch that would replace it.
      else if (f.kind === 'jam') {
        // Math.max, not assignment, at every field that refreshes a status per frame: a Jam over an
        // Optical Flare used to CURE the flare when the jam ended (blind 1e9 -> 3 -> 0), a Time Warp
        // cured an Ensnare, a Fungal cured a Maelstrom. Measured, all three. (REVIEW-M17)
        for (const o of G.near(f.x, f.y, f.r * TILE)) if (!G.allied(o.owner, f.owner)) o.fx.blind = Math.max(o.fx.blind || 0, 3);
        if (f.t % 12 === 0) G.effects.push({ kind: 'ring', x: f.x, y: f.y, r: f.r * TILE, t: 12, color: '#7ae' });
      }
      // M12: the Infestor's cloud. Refreshed to 2 every frame so it decays two frames after the field
      // ends rather than needing an expiry pass of its own, and the damage rides the same eight-frame
      // cadence a Psionic Storm uses so the two read as the same kind of thing.
      else if (f.kind === 'fungal') {
        for (const o of G.near(f.x, f.y, f.r * TILE)) { if (!o.alive || o.isBuilding || o.fly || o.inside || o.def.larva || o.def.egg || G.allied(o.owner, f.owner)) continue; o.fx.maelstrom = Math.max(o.fx.maelstrom || 0, 2); o.path = null; }
        if (++f.tickT % 8 === 0) for (const o of G.near(f.x, f.y, f.r * TILE)) { if (!o.alive || o.isBuilding || o.fly || o.inside || G.allied(o.owner, f.owner)) continue; G.damageRaw(o, 6, null); }
      }
      // M12: the Ravager's shell lands. `ff: false` so it does not eat the army that walked in behind
      // it; Combat.splash reaches destructible map features on its own, which is the half of this that
      // makes a Ravager the thing Zerg sends at a wall.
      else if (f.kind === 'bile' && f.t <= 0) {
        const a = DATA.abilities.corrosive_bile, src = f.src;
        if (src) Combat.splash(src, f.x, f.y, a.dmg + G.players[f.owner].upgLevel('missW') * 2, { type: 'normal', targets: 'ground', hits: 1, splash: [f.r * 0.5, f.r * 0.8, f.r] }, null);
      }
      // M12 item 11: the injected larvae arrive. Capped at the same three Unit.tickBuilding allows, so
      // inject fills a hatchery rather than raising its ceiling -- and the loop is bounded by that cap
      // whatever state h.larvae is in. G.kill splices a dead larva out of it, so its length is live.
      else if (f.kind === 'inject' && f.t <= 0) {
        const h = f.hall, cap = DATA.abilities.larva_inject.cap;
        if (h && h.alive && h.done && h.def.spawnsLarva && h.owner === f.owner) {
          for (let n = h.larvae.length; n < cap; n++) G.spawnLarva(h);
          G.effects.push({ kind: 'ring', x: h.x, y: h.y, r: 26, t: 14, color: '#c8f' });
        }
      }
      // ---- M12 wave four, Protoss --------------------------------------------------------------
      // ITEM 11: the boost. ONE extra unit of progress a frame on top of the one Unit.tickProduction
      // already adds, which is exactly double and is the number test/protoss12.js measures rather than
      // infers. It reproduces tickProduction's own guards deliberately -- `it.started` so a queue
      // stalled on supply is not secretly advanced, `unpowered` so an unpowered Gateway stays stopped,
      // `lifted` for symmetry -- because the alternative is a multiplier inside js/sim.js, which this
      // change does not own. Completion is left to tickProduction on the next frame; overshooting
      // `total` by one frame is invisible and duplicating finishProduction here would not be.
      //
      // A boost whose building dies CLEARS ITSELF rather than lingering as a field pointing at a
      // corpse: `f.t = 0` and the splice at the bottom of this loop does the rest.
      else if (f.kind === 'chrono') {
        const b = f.bld;
        if (!b || !b.alive || !b.done || b.owner !== f.owner) f.t = 0;
        else if (!b.unpowered && !b.lifted && b.prod.length) {
          const it = b.prod[0];
          if (it.kind !== 'unit' || it.started) it.progress += (G.cheats.cwal && b.player.human) ? 10 : 1;
          if (f.t % 8 === 0) G.effects.push({ kind: 'ring', x: b.x, y: b.y, r: b.r * 0.8, t: 8, color: '#ffd76a' });
        }
      }
      // The wall gives the ground back on the frame it expires, and only the tiles it took.
      else if (f.kind === 'force_field') { if (f.t <= 0) G.map.clearForceField(f.tiles); }
      // Time Warp. Refreshed to 3 rather than set once: leaving the field clears in two frames with no
      // per-unit bookkeeping, which is the same trick Disruption Web and the Jamming Field use.
      else if (f.kind === 'time_warp') {
        for (const o of G.near(f.x, f.y, f.r * TILE)) {
          if (!o.alive || o.isBuilding || o.fly || o.inside || o.def.larva || o.def.egg || G.allied(o.owner, f.owner)) continue;
          o.fx.ensnare = Math.max(o.fx.ensnare || 0, 3);
        }
        if (f.t % 12 === 0) G.effects.push({ kind: 'ring', x: f.x, y: f.y, r: f.r * TILE, t: 12, color: '#9cf' });
      }
      // The Disruptor's nova lands. `ff: true` -- unlike the Ravager's bile, this one DOES eat the army
      // standing in it, which is the whole reason it is a fuse and not a gun.
      else if (f.kind === 'nova' && f.t <= 0) {
        const a = DATA.abilities.purification_nova, src = f.src;
        if (src) Combat.splash(src, f.x, f.y, a.dmg + G.players[f.owner].upgLevel('gW') * 4,
          { type: 'normal', targets: 'ground', hits: 1, ff: true, splash: [f.r * 0.6, f.r * 0.85, f.r] }, null);
      }
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
