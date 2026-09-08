'use strict';
// ============================================================================
// Simulation snapshots. A replay is a seed plus a command log, so seeking
// backwards means restarting and re-running from frame 0 - about thirty
// seconds for a twenty-minute game. Snapshots let a seek restart from the
// nearest checkpoint instead.
//
// The serialiser is reflective rather than a hand-written field list. A field
// list is the wrong shape for this: every field someone forgets to add later
// becomes a silent desync after a seek, which is the one failure mode this
// project can least afford. Walking the object graph captures whatever is
// actually there, and test/snapshot.js proves a restored state re-simulates
// bit-identically.
//
// References are stored by identity, not by value: units, players, map
// resources and DATA definitions all become tagged ids and are re-linked on
// restore, so the graph keeps its shape (a unit's order.target is the same
// object as the unit in G.units).
// ============================================================================
const Snapshot = {
  // ---------------- serialise ----------------
  // Anything reachable that is not one of these becomes a plain deep copy.
  _seen: null, // while take() runs: every unit id a reference was written for (see `gone` in take)
  _tag(v) {
    if (v instanceof Unit) { if (this._seen) this._seen.add(v.id); return { __u: v.id }; }
    if (v instanceof Player) return { __p: v.id };
    // By id, through resById, and never by position in G.map.resources. That array is spliced when a
    // patch runs dry (G.removeResource), but the patch object lives on wherever something still points
    // at it -- p.startBase.minerals, a worker's order target. A positional tag on one of those survivors
    // is a stale index: it decoded to whichever patch had shifted into that slot, or off the end to
    // undefined, so restoring a checkpoint quietly re-aimed workers at other people's minerals. That is
    // the replay backward-seek bug, and it needed no thinning and no long game -- just one mined-out
    // patch, which is about 13:00 into any game.
    // resById is the identity map: built in GameMap.generate and never pruned, so it still holds the
    // dry ones and a reference to a dry patch round-trips to the same object it did live.
    if (v && G.map && G.map.resById && G.map.resById.get(v.id) === v) return { __r: v.id };
    if (v && typeof v === 'object' && typeof v.id === 'string' && DATA.all[v.id] === v) return { __d: v.id };
    return null;
  },
  enc(v, depth = 0) {
    if (v === undefined) return { __undef: 1 };
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? null : v;
    const t = this._tag(v); if (t) return t;
    if (ArrayBuffer.isView(v)) return { __ta: v.constructor.name, d: Array.from(v) };
    if (v instanceof Set) return { __set: [...v].map(x => this.enc(x, depth + 1)) };
    if (v instanceof Map) return { __map: [...v].map(([k, x]) => [this.enc(k, depth + 1), this.enc(x, depth + 1)]) };
    if (Array.isArray(v)) return v.map(x => this.enc(x, depth + 1));
    if (depth > 12) return null; // nothing in the sim nests this deep; a cycle we failed to tag would
    const o = {};
    for (const k of Object.keys(v)) { const x = v[k]; if (typeof x === 'function') continue; o[k] = this.enc(x, depth + 1); }
    return o;
  },
  dec(v) {
    if (v === null || typeof v !== 'object') return v;
    if (v.__undef) return undefined;
    if (v.__u !== undefined) return G.byId.get(v.__u) || null;
    if (v.__p !== undefined) return G.players[v.__p];
    if (v.__r !== undefined) return G.map.resById.get(v.__r);
    if (v.__d !== undefined) return DATA.all[v.__d];
    if (v.__ta) return new (globalThis[v.__ta] || Uint8Array)(v.d);
    if (v.__set) return new Set(v.__set.map(x => this.dec(x)));
    if (v.__map) return new Map(v.__map.map(([k, x]) => [this.dec(k), this.dec(x)]));
    if (Array.isArray(v)) return v.map(x => this.dec(x));
    const o = {};
    for (const k of Object.keys(v)) o[k] = this.dec(v[k]);
    return o;
  },
  // Encode an object's own fields rather than a reference to it. Needed wherever we store the thing
  // itself (a resource, an AI, a mission): enc() would notice it is taggable and helpfully store a
  // pointer back to the very object we are trying to capture, and restore would then wipe it.
  encOwn(v) { const o = {}; for (const k of Object.keys(v)) { if (typeof v[k] === 'function') continue; o[k] = this.enc(v[k], 1); } return o; },
  // A unit is stored as its own fields; the prototype and def come back on restore.
  encUnit(u) { const o = {}; for (const k of Object.keys(u)) { if (typeof u[k] === 'function') continue; o[k] = k === 'def' ? { __d: u.def.id } : this.enc(u[k], 1); } return o; },

  take() {
    this._seen = new Set();
    const s = {
      frame: G.frame, rng: RNG.s, nextId: (typeof UNIT_ID !== 'undefined' ? UNIT_ID : 0),
      over: G.over, winner: G.winner, winTeam: G.winTeam, freePlay: G.freePlay,
      logLen: G.log.length, pending: G.pendingCmds ? G.pendingCmds.i : null,
      cheats: this.enc(G.cheats, 1),
      units: G.units.map(u => this.encUnit(u)),
      // The AI is simulation state, not a view: its wave counter, current target and drop op decide what
      // orders get issued next, so a snapshot without it diverges within seconds of being restored.
      players: G.players.map(p => { const o = {}; for (const k of Object.keys(p)) { if (k === 'ai' || typeof p[k] === 'function') continue; o[k] = this.enc(p[k], 1); } o.__ai = p.ai ? this.encOwn(p.ai) : null; return o; }),
      resources: G.map.resources.map(r => this.encOwn(r)),
      creep: Array.from(G.map.creep), blocked: Array.from(G.map.blocked), walk: Array.from(G.map.walk),
      psi: Object.fromEntries(Object.entries(G.map.psi).map(([k, v]) => [k, Array.from(v)])), // the Protoss power grid is cached, not recomputed every tick

      fields: this.enc(G.fields, 1), projectiles: this.enc(G.projectiles, 1),
      mission: G.mission ? this.encOwn(G.mission) : null,
    };
    // Corpses that something still points at. G.units is reaped of the dead once a second, but nothing
    // ever deletes from G.byId, so in a live game a reference to a unit that died a moment ago still
    // resolves -- and the simulation reads those: AI.think's "am I being attacked" test asks
    // lastHitBy.owner without asking whether the attacker is still alive. Restoring only the units in
    // G.units dropped them, dec() turned the reference into null, and the restored AI stopped defending
    // a base the live one defended. That is the desync a rejoining client hit inside a hundred frames.
    // They go back into byId only, never into G.units, so G.units still matches the live game exactly.
    const inUnits = new Set(G.units.map(u => u.id));
    s.gone = [];
    for (let pass = 0; pass < 8; pass++) {          // an orphan's own fields can name another orphan
      const missing = [...this._seen].filter(id => !inUnits.has(id)).sort((a, b) => a - b);
      if (!missing.length) break;
      for (const id of missing) { inUnits.add(id); const u = G.byId.get(id); if (u) s.gone.push(this.encUnit(u)); }
    }
    this._seen = null;
    return s;
  },

  // Assigning only the keys present in the snapshot leaves behind any field set *after* it was taken,
  // and one stale AI timer is enough to diverge the whole re-simulation. Restoring an object in place
  // has to delete as well as assign.
  _apply(target, obj, skip) {
    for (const k of Object.keys(target)) if (!(k in obj) && !(skip && skip.has(k)) && typeof target[k] !== 'function') delete target[k];
    for (const k of Object.keys(obj)) if (!(skip && skip.has(k))) target[k] = obj[k];
  },
  restore(s) {
    // 1. units first, as empty shells, so every reference can be resolved in pass 2. The reaped-but-still
    //    referenced corpses in s.gone get a shell and a byId entry but stay out of G.units, which is
    //    where a live game has them too.
    G.units = []; G.byId = new Map();
    for (const su of s.units) { const u = Object.create(Unit.prototype); u.id = su.id; G.units.push(u); G.byId.set(u.id, u); }
    for (const su of (s.gone || [])) { const u = Object.create(Unit.prototype); u.id = su.id; G.byId.set(u.id, u); }
    // 2. map arrays and resources, because unit references point at resources
    G.map.creep.set(s.creep); G.map.blocked.set(s.blocked); G.map.walk.set(s.walk);
    G.map.psi = {}; for (const k of Object.keys(s.psi || {})) G.map.psi[k] = new Uint8Array(s.psi[k]);
    // Rebuild the resource list by id rather than walking it positionally. G.removeResource SPLICES a
    // mined-out patch out of G.map.resources, so the live array and a snapshot's are different lengths
    // the moment any patch runs dry -- about 13:00 in a normal game. Walking them in step therefore
    // wrote patch n's state onto patch n+1 once anything had been mined:
    //   - seeking a replay backwards threw, because the snapshot has more patches than the live map
    //     and G.map.resources[i] came back undefined;
    //   - a rejoin silently desynced, because the rejoiner has just run G.init and holds the FULL
    //     list, so the donor's shorter one landed on the head and the tail survived as duplicates.
    //     _apply then copied the donor's `id` onto whichever object sat at that index, leaving
    //     resById -- built once in GameMap.generate and never rebuilt -- pointing at the wrong patch,
    //     so a worker sent to r5 mined r8. Divergence followed 30-80 seconds later, far from the cause.
    // Reusing the live object where the id matches keeps identity, so anything already holding a
    // reference to a patch still points at the right one.
    // Match on resById, not on the live list: a snapshot taken before a patch ran dry and restored
    // after it did would otherwise find nothing to reuse and build a second object for that id, while
    // resById and everything holding a reference kept pointing at the first.
    const byId = G.map.resById || new Map(G.map.resources.map(r => [r.id, r]));
    G.map.resources = s.resources.map(sr => {
      const d = {}; for (const k of Object.keys(sr)) d[k] = this.dec(sr[k]);
      const r = byId.get(d.id) || {};
      this._apply(r, d); return r;
    });
    // Merge rather than replace, for the same reason resById is never pruned live: a dry patch is out
    // of G.map.resources but is still the thing a reference to it must resolve to.
    if (!G.map.resById) G.map.resById = new Map();
    for (const r of G.map.resources) G.map.resById.set(r.id, r);
    // 3. fill the units and players in
    s.units.forEach((su, i) => { const u = G.units[i]; for (const k of Object.keys(su)) u[k] = this.dec(su[k]); });
    for (const su of (s.gone || [])) { const u = G.byId.get(su.id); for (const k of Object.keys(su)) u[k] = this.dec(su[k]); }
    const AI_KEEP = new Set(['__ai']);
    s.players.forEach((sp, i) => {
      const p = G.players[i];
      const decoded = {}; for (const k of Object.keys(sp)) if (k !== '__ai') decoded[k] = this.dec(sp[k]);
      this._apply(p, decoded, new Set(['ai']));
      if (sp.__ai && p.ai) this._apply(p.ai, this.dec(sp.__ai)); // keep the AI instance, replace its state exactly
    });
    G.fields = this.dec(s.fields); G.projectiles = this.dec(s.projectiles);
    G.cheats = this.dec(s.cheats);
    G.frame = s.frame; RNG.s = s.rng; setUnitId(s.nextId);
    G.over = s.over; G.winner = s.winner; G.winTeam = s.winTeam; G.freePlay = s.freePlay;
    G.log.length = Math.min(G.log.length, s.logLen);
    if (G.pendingCmds && s.pending !== null) G.pendingCmds.i = s.pending;
    if (G.mission && s.mission) this._apply(G.mission, this.dec(s.mission), new Set(['def']));
    G.effects.length = 0; // render-only, and stale ones would draw explosions that never happened
    // 4. rebuild the derived structures the tick expects
    G._allVis = null;
    G.rebuildGrid();
  },
};
