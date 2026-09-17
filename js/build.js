'use strict';
// ============================================================================
// Build stamp. Saves and replays are a seed plus a command log, so they only
// reproduce the original game if the simulation behaves identically. A save
// from a different build re-simulates into something else and drifts away
// silently, which looks like a corrupt save rather than a version mismatch.
//
// There is no build step, so the stamp is computed by reflection: a digest of
// the data tables plus the source text of every function the simulation runs.
// Function.prototype.toString returns the exact source slice, so two copies of
// the same files hash the same in any engine, and editing any sim file changes
// the hash. Render, HUD and input code is deliberately not included - it cannot
// affect the simulation, and stamping it would reject saves for a UI tweak.
// ============================================================================
const BUILD = {
  _hash: null,

  // The source text of one function, with line endings normalised. Both places that hash a function
  // go through here so a third one cannot reintroduce the split described above.
  src(fn) { return Function.prototype.toString.call(fn).split('\r\n').join('\n'); },

  // CMD.install() replaces seventeen of the functions below with a wrapper that packs the call into a
  // command -- setOrder, stop, queueUnit, larvaMorph, queueUpgrade, queueTech, queueAddon, queueMorph,
  // cancelProd, cancelBuilding, setRally, liftBuilding, unloadAll, unloadCargo, cheat, issue, merge.
  // Every one of those is core simulation, and every one of them was invisible here: toString on a
  // wrapper returns the wrapper's source, which is identical no matter what the function it wraps
  // does. Rewrite how orders are issued or how units are queued and the stamp did not move, so a save
  // from the old build loaded into the new one and drifted quietly -- the exact failure this file
  // exists to prevent. CMD.orig keeps the originals; hash those.
  //
  // Substituted only when the live function really is the wrapper, so a same-named function on some
  // other object is left alone.
  unwrap(k, v) {
    if (typeof CMD === 'undefined' || !CMD.orig) return v;
    const o = CMD.orig[k];
    return (o && o !== v) ? o : v;
  },

  // Deterministic textual serialisation. Keys are sorted so property order cannot
  // change the digest; depth and a seen-set keep cyclic tables (a def referring
  // back to its parent) from running away.
  ser(v, out, seen, depth) {
    if (depth > 8) { out.push('~'); return; }
    const t = typeof v;
    // Newlines are normalised out of the source text before hashing. Function.prototype.toString
    // returns the exact slice including its line terminators, so a CRLF checkout and an LF checkout of
    // the *same commit* used to produce different stamps -- and this repo is on Windows inside OneDrive
    // with git converting line endings, so that is not hypothetical. It means a save written by one
    // clone was refused by another clone running byte-identical logic, which is precisely the silent
    // drift this stamp exists to prevent, firing backwards as a false alarm. Found when two agents in
    // separate worktrees of one commit reported two different stamps.
    if (t === 'function') { out.push('fn', this.src(v)); return; }
    if (v === null || v === undefined || t !== 'object') { out.push(String(v)); return; }
    if (seen.has(v)) { out.push('@'); return; }
    seen.add(v);
    if (Array.isArray(v)) { out.push('['); for (const x of v) this.ser(x, out, seen, depth + 1); out.push(']'); }
    else if (v instanceof Set) { out.push('S['); for (const x of [...v].map(String).sort()) out.push(x); out.push(']'); }
    else if (v instanceof Map) { out.push('M['); for (const k of [...v.keys()].map(String).sort()) { out.push(k); this.ser(v.get(k), out, seen, depth + 1); } out.push(']'); }
    else { out.push('{'); for (const k of Object.keys(v).sort()) { out.push(k); this.ser(v[k], out, seen, depth + 1); } out.push('}'); }
    seen.delete(v); // a shared def reached twice by different paths should read the same both times
  },

  // Only the functions of an object, by name. Used for the live singletons (G, CMD,
  // Abilities...) whose own properties are mostly running game state, and -- with `statics` set to
  // 'Class.' -- for a class object itself, whose static members `c.prototype` cannot see.
  fns(name, o, out, statics) {
    if (!o) return;
    out.push('#' + name);
    for (const k of Object.getOwnPropertyNames(o).sort()) {
      // A static deliberately left out names itself Class.member in NOT_SIM, with its reason, exactly
      // as a top-level binding does. `prototype`, `length` and `name` need no entry: they are not
      // functions, so the test below skips them anyway.
      if (statics && this.NOT_SIM[statics + k] !== undefined) continue;
      // ACCESSORS ARE HASHED BY SOURCE, NEVER BY READING THEM. The old code did `v = o[k]` inside a
      // try/catch and skipped anything that threw, on the grounds that "getters on a prototype can
      // throw off an instance" -- which is true, and meant every accessor was silently skipped rather
      // than hashed. Unit.prototype has `speed`, `sight`, `armor`, `vet`, `isCloaked` and a dozen more
      // as getters, so NONE of the combat and movement maths in js/sim.js had ever been stamped:
      // retuning night sight, the high-ground bonus or the churn penalty changed how the simulation
      // behaves and left the build hash untouched, so a save from before the change loaded happily and
      // desynced. That is precisely the failure this stamp exists to prevent, and it was invisible.
      const desc = Object.getOwnPropertyDescriptor(o, k);
      if (desc && (desc.get || desc.set)) {
        if (desc.get) out.push(k + '#get', this.src(desc.get));
        if (desc.set) out.push(k + '#set', this.src(desc.set));
        continue;
      }
      let v; try { v = o[k]; } catch (e) { continue; }
      // CMD.install wraps prototype and singleton methods, never statics, so a static that happens to
      // share a wrapped name is hashed by its own source rather than by the wrapper's original.
      if (typeof v === 'function') { out.push(k, this.src(statics ? v : this.unwrap(k, v))); }
    }
  },

  // ==========================================================================================
  // WHAT IS STAMPED, BY NAME. A top-level `const`, `let`, `function` or `class` in a classic script is
  // NOT a property of the global object, so nothing can enumerate it: every one has to be named here,
  // and `look` below reaches it with eval. The old list named nine tables and six singletons and
  // nothing else, and REVIEW-M17 measured what that missed: 56 of the 76 top-level bindings in the
  // stamped files, among them the WHOLE of Combat (weapon firing and splash), DMG_MULT, MINE_TIME,
  // MINERS_PER_PATCH, SUPPLY_CAP, CHURN_SLOW, FACE_MULT, HOVER, and the helpers dist, distPt, clamp,
  // daylightAt and hitFacing. Seventeen of seventeen simulation edits tried left the hash unchanged,
  // so a save from before any of them loaded into the build after it and drifted -- the exact failure
  // this file exists to refuse. test/version.js parses every stamped file for its top-level
  // declarations and fails if one is missing from these lists, so they cannot rot the way that one did.
  //
  // Every top-level binding of a stamped file is in exactly one list. Two rules for a new one:
  //   - if the simulation reads it, it goes in TABLES, TUNING, HELPERS, SINGLETONS or CLASSES;
  //   - if it does not, it goes in NOT_SIM with the reason, so the omission is a decision and not a hole.
  // ==========================================================================================
  // Data, hashed by walking it (ser): tables, sets, and the objects of pure functions map generation runs.
  TABLES: ['DATA', 'RACE_INFO', 'TURN', 'ACCEL', 'MAP_LAYOUTS', 'NO_BROODLING', 'AI_SCRIPTS', 'AI_COMP', 'AI_RESEARCH',
    'DMG_MULT', 'MAP_SIZES', 'HAZARDS', 'MapModes', 'MAP_FEATURES', 'Archetypes', 'SIEGE_W', 'EQUIV', 'BURROW_SURFACES',
    'SEP_DIRS', 'FACE_MULT', 'HOVER', 'Z12_ASPECTS', 'ENERGY_TECH',
    'CMD.pack'],   // the packers decide the log format; fns() skips them because they are not functions of CMD itself
  // Scalars the simulation reads. A dotted name is a constant that lives on a singleton.
  TUNING: ['TILE', 'TPS', 'FEATURE_ID0', 'FEAT_BLOCKED', 'WRECK_BLOCKED', 'LOWERED_BLOCKED', 'CHURN_SLOW', 'MINE_STRIP', 'RAMP_LEN', 'RAMP_CLEAR',
    'WIDE_BODY', 'FLOW_HOLD', 'MELEE_REACH', 'SEP_SLACK', 'MINE_TIME', 'GAS_TIME', 'LARVA_TIME', 'LARVA_NATURAL', 'MAX_QUEUE', 'WORKER_HAUL', 'GAS_DEPLETED', 'MODE_TRANS', 'MINERS_PER_PATCH', 'CREEP_SEED', 'CREEP_GROW',
    'D', 'SUPPLY_CAP', 'PATH_BUDGET', 'DAY_CYCLE', 'NIGHT_SIGHT', 'NIGHT_DET', 'NIGHT_AIR', 'WRECK_LIFE_BUILDING', 'WRECK_LIFE_UNIT',
    'FERRY_PICKUP', 'FERRY_WAIT', 'FACE_FLANK', 'FACE_REAR', 'MULE_HAUL', 'BLINK_ESCAPE',
    'HALL_PULL', 'ANCHOR_PULL', 'ANCHOR_CAP', 'GUARD_COST', 'BASE_PULL', 'BASE_R', 'SENSOR_NEAR', 'SENSOR_CALM', 'AI_CLOAK_RESERVE', 'CAST_APPROACH', 'HOME_R', 'MIN_BLOCKED', 'GAS_BLOCKED', 'G.cell'],
  // Top-level functions, hashed by source.
  HELPERS: ['repairableDef', 'dist', 'distPt', 'clamp', 'setUnitId', 'daylightAt', 'hitFacing', 'gasBuildings',
    'Replay.applyPending'],   // the one method of Replay that decides simulation order; the rest is save/load plumbing
  // Objects of methods: their own FUNCTIONS are hashed (fns), their state is not.
  SINGLETONS: ['G', 'CMD', 'Abilities', 'Missions', 'RNG', 'MapCodec', 'Combat', 'DMath'],   // DMath: the simulation's transcendentals, by source
  // Classes: every prototype method and accessor, and `constructor` carries the whole class body.
  CLASSES: ['Unit', 'Player', 'AI', 'GameMap', 'Pathfinder'],
  // Declared in a stamped file, deliberately not hashed. Presentation is left out on purpose -- the
  // header comment says why: stamping it would refuse a save for a wording or colour tweak.
  NOT_SIM: {
    DESC_MAX: 'tooltip length cap; presentation',
    PLAYER_COLORS: 'paint',
    TILESET_IDS: 'the tileset is paint; the layout id in the save names it',
    TILESET_NAMES: 'menu labels',
    UNEXPLORED_MSG: 'a message', HAZARD_SAYS: 'messages', FEATURE_SAYS: 'messages',
    ALERTS: 'alert cooldowns gate whether a message is said, never what the simulation does',
    ARCH_CACHE: 'a cache; generation is pure and Archetypes is stamped',
    HEIGHT_BONUS: 'a cache of GameMap.heightBonusTable, which is stamped',
    UNIT_ID: 'runtime counter; snapshots restore it',
    AI_STYLE_CACHE: 'a cache of AI_SCRIPTS derivations, which are stamped',
    BUILD: 'the stamp itself',
    Replay: 'save/load plumbing (download, autosave, file reading); Replay.applyPending is named in HELPERS',
    // Statics, keyed Class.member (see fns). Everything else static is hashed.
    'Player.assignColors': 'which colour each seat is painted, and nothing else: no simulation code reads p.color, and PLAYER_COLORS beside it is NOT_SIM for the same reason. Stamping it would refuse a save for a paint rule',
  },

  // Every global that can change what the simulation does. Missing ones are skipped so
  // this still works in the headless harnesses, which load a subset of the files.
  parts() {
    const out = [], seen = new Set();
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const look = n => { try { return typeof eval(n) !== 'undefined' ? eval(n) : g[n]; } catch (e) { return g[n]; } };
    for (const n of this.TABLES.concat(this.TUNING, this.HELPERS)) {
      const v = look(n); if (v !== undefined) { out.push('$' + n); this.ser(v, out, seen, 0); }
    }
    // Missions.list, explicitly. `fns` below hashes an object's own FUNCTIONS, and a scenario's setup
    // and check hang off entries of this array rather than off Missions itself -- so no mission script
    // had ever been stamped, and rewriting one would not have refused a save written before the change.
    // The list only, not the whole object: fns already covers the methods, and ser walks a function by
    // its source, so hashing both would count every method twice for nothing.
    { const M = look('Missions'); if (M && M.list) { out.push('$Missions.list'); this.ser(M.list, out, seen, 0); } }
    for (const n of this.SINGLETONS) this.fns(n, look(n), out);
    // STATIC MEMBERS TOO. Hashing `c.prototype` alone missed every one of them, and two of the three
    // decide the whole game: GameMap.assignStarts picks every player's start, GameMap.quadrantsOf
    // decides which corners a layout's bases and features are copied into. SCAN-M18 A2.12 measured it --
    // editing a prototype method moved the stamp c6d7084ba9f97299 -> 3499671e739ecad5 and editing either
    // static left it at c6d7084ba9f97299 -- so a replay from before such an edit loaded happily and
    // re-simulated a different map in silence, the exact failure this file exists to refuse. A static IS
    // an own property of the class object, so these enumerate: unlike the top-level lists above there is
    // no name list here to rot, and an opt-out has to say so in NOT_SIM.
    for (const n of this.CLASSES) { const c = look(n); this.fns(n, c && c.prototype, out); this.fns(n + ' statics', c, out, n + '.'); }
    return out;
  },

  // 64-bit-ish digest as two FNV-1a lanes, printed as 16 hex chars.
  hash() {
    if (this._hash) return this._hash;
    let a = 0x811c9dc5 | 0, b = 0x01000193 | 0;
    const s = this.parts().join('');
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b + c, 2654435761) ^ (b >>> 15); }
    const hex = v => (v >>> 0).toString(16).padStart(8, '0');
    return this._hash = hex(a) + hex(b);
  },

  // null when the save can be trusted, otherwise a sentence to show the player.
  check(d, what = 'save') {
    const mine = this.hash();
    if (!d || !d.build) return `This ${what} was made by an older build that did not stamp its version. Re-simulating it would drift out of sync with the original game, so it cannot be loaded. (This build is ${mine}.)`;
    if (d.build !== mine) return `This ${what} was made by a different build of the game (${what} ${d.build}, this build ${mine}). Re-simulating it would drift out of sync with the original game, so it cannot be loaded.`;
    return null;
  },
};
