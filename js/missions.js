'use strict';
// ============================================================================
// Scenario missions: scripted setups with custom objectives and briefings.
//
// Besides the scenarios this file owns two campaign-level ideas, and both of
// them are about the campaign remembering what was done in it.
//
//   MORAL WEIGHT (design item 14). Three of the missions below have no good
//   answer, only a cheap one and an expensive one. Nothing scores them, nothing
//   congratulates or scolds, and there is no meter anywhere. What a choice does
//   is turn up later: one line in a briefing, four fewer marines, a building the
//   requisition no longer issues.
//
//   ATTRITION (design item 13). A facility a mission was carrying, and lost, is
//   closed for the rest of the campaign. The war narrows as it goes badly.
//
// ---------------------------------------------------------------------------
// WHERE THE CAMPAIGN RECORD LIVES, AND WHY IT IS NOT SIMULATION STATE
//
// A save and a replay are a seed, a layout, a player list, a mission id and a
// command log, and loading one re-runs the simulation from frame 0 (Replay.data
// in js/commands.js). Anything the simulation reads at frame 0 therefore has to
// be inside that header, or the same log re-simulates into a different game on a
// different machine -- which is precisely the silent drift js/build.js exists to
// prevent, arriving through a side door.
//
// Campaign progress is NOT simulation state. It is meta-state about which
// missions have been played and what was decided in them, so it has no business
// in Snapshot's reflective walk of G (js/snapshot.js) any more than the hotkey
// preference has. It lives in localStorage under 'bw_campaign', beside
// bw_voice, bw_music, bw_hotkeys, bw_maps and bw_save.
//
// The rule that keeps a mission replaying deterministically is one line:
//
//     Missions.begin() reads the record from the mission id it was handed and
//     NEVER from localStorage.
//
// The menu composes the two together once, outside the simulation:
//
//     Missions.startId('p1')  ->  'p1#w=t1,t2;l=stargate~p4;c=gates:reliquary'
//
// That string is what UI.start puts in opts.mission, which is what Replay.data
// already stores and what UI.startFromLog already hands straight back to
// begin(). A replay therefore carries a frozen copy of the campaign it was
// recorded in and re-simulates against that, not against whatever this machine's
// localStorage happens to say today. Nothing in js/commands.js or
// js/snapshot.js had to change, and test/campaign.js asserts the determinism.
//
// The write side is one-way on purpose: Missions.remember() runs when a mission
// finishes and is never read back by a running simulation, so it cannot affect
// one. It declines to write while a replay is playing, so watching a mission
// back does not re-record its outcome.
// ============================================================================
const Missions = {
  // ---------------- campaign record: format, floor and persistence ----------------
  //
  // The four below are constants written as functions ON PURPOSE. BUILD.fns reflects over an object's
  // FUNCTIONS and nothing else, so a plain `CORE: [...]` property would not be in the build stamp --
  // and a table of building ids that decides which branches a mission closes is simulation behaviour,
  // not decoration. Editing it has to move the stamp, or a save from before the edit re-simulates
  // against a different set of closures and drifts, which is the whole thing js/build.js exists to
  // stop. Same argument for the storage key and the separator: both are part of how a launch id is
  // read, and a launch id is an input to the simulation.
  key() { return 'bw_campaign'; },
  sep() { return '#'; },
  // Everything a mission may close is a branch, never a spine. These are never lockable at all, so
  // "the war narrowed" can cost you a tech path and can never cost you the ability to field an army.
  core() {
    return ['command_center', 'supply_depot', 'refinery', 'barracks', 'bunker',
      'hatchery', 'lair', 'hive', 'extractor', 'spawning_pool', 'creep_colony', 'sunken_colony', 'spore_colony',
      'nexus', 'pylon', 'assimilator', 'gateway', 'cybernetics_core', 'shield_battery'];
  },
  // ...and at most this many branches are closed at once. Three is enough for the campaign to feel
  // thinner and few enough that every race still has several ways to win; test/campaign.js walks every
  // combination of three and proves it.
  maxLost() { return 3; },

  // ---- id <-> record ----
  // The wire format is deliberately flat text rather than JSON: it has to survive being a value inside
  // a JSON replay header, being read by eye in a bug report, and being hand-edited by someone curious.
  // Tokens are [a-z0-9_] and anything else is dropped on the way in, so a doctored replay cannot smuggle
  // a building id that does not exist -- decode() only ever produces names, and closedIn() only ever
  // acts on names DATA already knows.
  token(s) { return /^[a-z0-9_]+$/.test(s); },
  baseId(id) { const s = id == null ? '' : String(id); const i = s.indexOf(this.sep()); return i < 0 ? s : s.slice(0, i); },
  bodyOf(id) { const s = id == null ? '' : String(id); const i = s.indexOf(this.sep()); return i < 0 ? '' : s.slice(i + 1); },
  frozen(id) { return (id == null ? '' : String(id)).indexOf(this.sep()) >= 0; },
  blank() { return { w: [], l: [], c: {} }; },
  decode(id) { return this.decodeBody(this.bodyOf(id)); },
  decodeBody(body) {
    const d = this.blank(); if (!body) return d;
    for (const part of String(body).split(';')) {
      const eq = part.indexOf('='); if (eq < 0) continue;
      const k = part.slice(0, eq), v = part.slice(eq + 1); if (!v) continue;
      if (k === 'w') { for (const t of v.split(',')) if (this.token(t) && !d.w.includes(t)) d.w.push(t); }
      else if (k === 'l') {
        for (const t of v.split(',')) { const [id2, at] = t.split('~'); if (!this.token(id2 || '')) continue; if (at && !this.token(at)) continue; if (!d.l.some(e => e.id === id2)) d.l.push({ id: id2, at: at || '' }); }
      } else if (k === 'c') {
        for (const t of v.split(',')) { const [key, val] = t.split(':'); if (this.token(key || '') && this.token(val || '')) d.c[key] = val; }
      }
    }
    if (d.l.length > this.maxLost()) d.l = d.l.slice(-this.maxLost());
    return d;
  },
  encodeBody(d) {
    const out = [];
    if (d.w && d.w.length) out.push('w=' + d.w.join(','));
    if (d.l && d.l.length) out.push('l=' + d.l.map(e => e.id + (e.at ? '~' + e.at : '')).join(','));
    const keys = Object.keys(d.c || {}).sort();
    if (keys.length) out.push('c=' + keys.map(k => k + ':' + d.c[k]).join(','));
    return out.join(';');
  },
  // The one place the two halves meet. The separator is emitted even when the campaign is untouched,
  // so "has a separator" means exactly "already frozen" -- which is what lets begin() tell a fresh
  // launch from a replay of a clean campaign without having to ask UI what mode it is in.
  startId(id) { return this.baseId(id) + this.sep() + this.encodeBody(this.load()); },

  // ---- localStorage, guarded exactly like Voice/Music/the map list ----
  load() { try { return this.decodeBody(localStorage.getItem(this.key()) || ''); } catch (e) { return this.blank(); } },
  store(d) { try { localStorage.setItem(this.key(), this.encodeBody(d)); } catch (e) { } },
  forget() { try { localStorage.setItem(this.key(), ''); } catch (e) { } },
  mergeInto(d, rec) {
    if (!rec) return d;
    if (rec.won && rec.id && !d.w.includes(rec.id)) d.w.push(rec.id);
    for (const k of Object.keys(rec.choices || {})) d.c[k] = rec.choices[k];
    // Facility losses only stick on a mission you actually completed. Failing and retrying should not
    // amputate the campaign on the way past -- you are going to play it again in a minute.
    if (rec.won) for (const id of (rec.lost || [])) if (!d.l.some(e => e.id === id)) d.l.push({ id, at: rec.id || '' });
    if (d.l.length > this.maxLost()) d.l = d.l.slice(-this.maxLost());
    return d;
  },
  // Write-only, and never read by a running simulation. Guarded against a replay so that watching a
  // mission back does not re-record it.
  remember(rec) {
    if (!rec) return null;
    if (typeof UI !== 'undefined' && UI.mode === 'replay') return null;
    const d = this.load(); this.mergeInto(d, rec); this.store(d); return d;
  },

  // ---- narrowing ----
  // Everything a race can still put up with a set of branches closed. A plain fixpoint over the
  // requirement graph: start from the town hall, add anything whose requirements are already met and
  // which is not closed, repeat. A tech counts as reachable exactly when the building that researches
  // it is, which is the same rule the command card uses.
  //
  // The subtlety that has to be modelled and is not in `req`: a morph names its RESULT, not its source.
  // A Greater Spire requires a Hive, so on requirements alone it stays reachable with the Spire closed
  // -- and with it every mutalisk and scourge Zerg has, which is the difference between a floor that
  // works and one that reads as though it does.
  morphSources(id) { const out = []; for (const k of Object.keys(DATA.buildings)) { const d = DATA.buildings[k]; if (d.morphTo === id || (d.morphOptions || []).includes(id)) out.push(k); } return out; },
  reachable(race, closed) {
    const have = new Set([RACE_INFO[race].hall]);
    const okReq = req => !req || req.every(r => typeof r !== 'string' ? true
      : DATA.techs[r] ? (DATA.techs[r].bld ? have.has(DATA.techs[r].bld) : true)
        : (have.has(r) || (EQUIV[r] || []).some(e => have.has(e))));
    const src = {}; for (const k of Object.keys(DATA.buildings)) if (DATA.buildings[k].tier === 'morph') src[k] = this.morphSources(k);
    for (let pass = 0; pass < 12; pass++) {
      let grew = false;
      for (const k of Object.keys(DATA.buildings)) {
        const d = DATA.buildings[k];
        if (d.race !== race || have.has(k) || closed.has(k)) continue;
        if (d.tier === 'addon' && d.parent && !have.has(d.parent)) continue;
        if (src[k] && src[k].length && !src[k].some(s => have.has(s))) continue;
        if (!okReq(d.req)) continue;
        have.add(k); grew = true;
      }
      if (!grew) break;
    }
    return have;
  },
  // THE FLOOR, COMPUTED RATHER THAN HOPED FOR. A record can only close a branch if the race is still
  // left with: its worker, its supply, its gas building, at least two distinct armed units that are
  // not the worker, and at least one of them able to shoot at air. That is the minimum a campaign
  // mission can actually be finished with, and checking it here is what makes "the war narrows" safe
  // to say -- CORE alone would only have made it likely. test/campaign.js walks every combination of
  // three losses against a second, independent reading of the same tables and agrees.
  canFight(race, closed) {
    const info = RACE_INFO[race], have = this.reachable(race, closed);
    if (!have.has(info.gasB)) return false;
    const okReq = req => !req || req.every(r => typeof r !== 'string' ? true
      : DATA.techs[r] ? (DATA.techs[r].bld ? have.has(DATA.techs[r].bld) : true)
        : (have.has(r) || (EQUIV[r] || []).some(e => have.has(e))));
    let worker = false, supply = have.has(info.supply), armed = 0, air = false;
    for (const k of Object.keys(DATA.units)) {
      const u = DATA.units[k];
      if (u.race !== race || u.notUnit || u.larva || u.egg) continue;
      const src = u.from === 'larva' ? info.hall : u.from;
      if (!src || !have.has(src) || !okReq(u.req)) continue;
      if (u.worker) { worker = true; continue; }   // an SCV has a weapon and is not an army
      if (k === info.supply) supply = true;
      let hasW = false;
      for (const w of [u.gw, u.aw]) { if (!w) continue; hasW = true; if (w.targets === 'air' || w.targets === 'both') air = true; }
      if (hasW) armed++;
    }
    return worker && supply && armed >= 2 && air;
  },
  // Which buildings are closed for THIS mission, given the record it was launched with.
  closedIn(def, d) {
    const race = def && def.race, out = new Set();
    for (const e of ((d && d.l) || [])) {
      const id = e.id;
      if (!DATA.buildings[id]) continue;             // a name this build does not know: ignore it
      if (this.core().includes(id)) continue;        // the spine, and it is not negotiable
      if (def && def.needs && def.needs.includes(id)) continue; // this theatre still has one of its own
      out.add(id);
      if (race && !this.canFight(race, out)) out.delete(id);   // the floor: this one would strand you
    }
    return out;
  },
  // Why a def is unavailable, as a sentence fragment UI's `'Requires ' + missingReq(def)` can use. Any
  // def that hasReq refuses must produce one of these or a greyed command-card button becomes a dead
  // key again -- test/cardsay.js is the check that says so.
  //
  // A closed branch is exactly one thing: that building is never constructed again. Everything
  // downstream of it is already refused by the ordinary requirement test the moment the building is
  // absent, so this does not need to -- and must not -- refuse it a second time. That distinction is
  // what keeps the narrowing readable: a mission that puts the last Academy on this front into your
  // hands can still train from it, and what you have lost is the ability to replace it.
  closedReason(p, def) {
    const c = p && p.closed; if (!c || !c.size || !def) return null;
    const nm = id => (DATA.buildings[id] ? DATA.buildings[id].name : id) + ' (lost earlier in the campaign)';
    if (c.has(def.id)) return nm(def.id);
    const gone = id => c.has(id) && !Player.prototype.hasBuilding.call(p, id);
    if (def.from && gone(def.from)) return nm(def.from);
    if (def.parent && gone(def.parent)) return nm(def.parent);
    if (def.bld && gone(def.bld)) return nm(def.bld);
    if (Array.isArray(def.req)) for (const r of def.req) if (typeof r === 'string' && gone(r)) return nm(r);
    return null;
  },
  // The lock is installed as own properties on the ONE player it applies to, not on Player.prototype.
  //
  // That is deliberate and it is about js/build.js. BUILD.fns hashes the live functions on
  // Player.prototype, so wrapping hasReq there would replace the hashed source with a wrapper whose text
  // never changes -- and editing the real hasReq in js/sim.js would stop moving the build stamp. That is
  // the exact failure BUILD.unwrap was written for, and it is not worth reintroducing for a campaign
  // feature. An own property shadows the prototype for this player only, leaves js/sim.js's function as
  // the hashed one, and is installed by a function that is itself hashed (Missions is in BUILD.parts).
  //
  // Snapshots survive it: Snapshot skips functions on the way out and _apply refuses to delete a
  // function on the way back in, so a restored player keeps the override with its Set of closed ids.
  installLocks(p, closed) {
    if (!p) return;
    p.closed = new Set(closed || []);
    if (!p.closed.size) { delete p.hasReq; delete p.missingReq; return; }
    p.hasReq = function (def) { return Missions.closedReason(this, def) ? false : Player.prototype.hasReq.call(this, def); };
    p.missingReq = function (def) { return Missions.closedReason(this, def) || Player.prototype.missingReq.call(this, def); };
  },
  // The quiet remembering. One or two lines appended to a briefing, stating a fact and drawing no
  // conclusion from it. A mission may add its own through def.notes(G, d).
  notes(def, d, closed) {
    const out = [];
    const extra = def.notes ? def.notes(G, d) : null;
    if (extra && extra.length) { out.push(''); for (const l of extra) out.push(l); }
    if (closed && closed.size) {
      out.push('');
      out.push('REQUISITION CLOSED');
      for (const id of closed) {
        const name = DATA.buildings[id] ? DATA.buildings[id].name : id;
        const at = ((d.l || []).find(e => e.id === id) || {}).at;
        const where = at ? (this.list.find(m => m.id === at) || {}).title : null;
        out.push(name + (where ? ' -- lost at ' + where + '.' : '.') + ' Not replaced.');
      }
    }
    return out;
  },

  // ================================ the scenarios ================================
  list: [
    { id: 't1', race: 'T', title: 'Hold the Line', layout: 'temple', seed: 11, enemy: { race: 'Z', difficulty: 'hard' },
      brief: ['Commander, our forward colony is about to be overrun.', 'The Zerg will hit within minutes and keep coming.', 'Hold the Command Center for ten minutes until the evacuation fleet arrives.', 'You have a bunker crew, a few marines, and the colony Academy. The Academy is the only one on this front.'],
      objective: 'Survive for 10:00 with your Command Center intact', minutes: 10,
      facilities: ['academy'], needs: ['academy'],
      setup(G, me, en) { const h = G.hallOf(me); G.placeDone(me, 'academy', h.tx - 5, h.ty + 4); for (let i = 0; i < 8; i++) G.spawnUnit('marine', me, h.x - 80 + i * 22, h.y + 90); G.spawnUnit('medic', me, h.x, h.y + 120); G.givePlayer(me, { minerals: 300, tech: ['stim'] }); G.players[en].ai.attackThreshold = 10; G.players[en].ai.thinkEvery = 16; },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; if (G.frame - m.start >= 24 * 60 * 10) return 'win'; return null; } },
    { id: 't2', race: 'T', title: 'Ghost Protocol', layout: 'valley', seed: 23, enemy: { race: 'P', difficulty: 'normal' },
      brief: ['A Protoss expedition has fortified the far side of the valley.', 'Command has authorised a nuclear strike.', 'Your Ghosts are cloak-capable and a warhead is loaded.', 'Destroy every Nexus before they establish a fleet.'],
      objective: 'Destroy all enemy Nexuses', minutes: 0,
      facilities: ['engineering_bay'], needs: ['academy', 'engineering_bay'],
      setup(G, me, en) { const h = G.hallOf(me); G.givePlayer(me, { minerals: 400, gas: 200, tech: ['personnel_cloaking', 'lockdown_tech'], nukes: 1 }); for (let i = 0; i < 2; i++) { const g = G.spawnUnit('ghost', me, h.x + 60 + i * 24, h.y + 100); g.energy = 150; } G.placeDone(me, 'barracks', h.tx + 6, h.ty); G.placeDone(me, 'academy', h.tx + 6, h.ty + 4); G.placeDone(me, 'engineering_bay', h.tx - 5, h.ty + 4); },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; return G.units.some(u => u.alive && u.owner === en && u.def.id === 'nexus') ? null : 'win'; } },
    { id: 'z1', race: 'Z', title: 'The Brood Awakens', layout: 'bloodbath', seed: 5, enemy: { race: 'T', difficulty: 'easy' },
      brief: ['The Overmind stirs. A Terran outpost squats on our feeding ground.', 'Grow the swarm quickly and consume the intruders.', 'Zerglings are cheap and fast; the Terrans are not yet dug in.'],
      objective: 'Destroy all Terran structures', minutes: 0,
      setup(G, me, en) { const h = G.hallOf(me); G.placeDone(me, 'spawning_pool', h.tx + 6, h.ty + 1); for (let i = 0; i < 12; i++) G.spawnUnit('zergling', me, h.x - 90 + (i % 6) * 30, h.y + 90 + Math.floor(i / 6) * 26); G.givePlayer(me, { minerals: 200 }); },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; return null; } },
    { id: 'z2', race: 'Z', title: 'Infestation', layout: 'temple', seed: 31, enemy: { race: 'T', difficulty: 'normal' },
      brief: ['A Terran Command Center sits ripe for the taking.', 'Bring a Queen to it once its armour is broken below half.', 'An infested Command Center will spawn our own Infested Terrans.'],
      objective: 'Infest an enemy Command Center', minutes: 0,
      facilities: ['queens_nest'], needs: ['hydralisk_den', 'queens_nest'],
      setup(G, me, en) { const h = G.hallOf(me); G.morphBuilding(h, 'lair'); G.placeDone(me, 'spawning_pool', h.tx + 6, h.ty + 1); G.placeDone(me, 'hydralisk_den', h.tx + 6, h.ty + 4); G.placeDone(me, 'queens_nest', h.tx - 5, h.ty + 4); const q = G.spawnUnit('queen', me, h.x, h.y - 80); q.energy = 100; for (let i = 0; i < 8; i++) G.spawnUnit('hydralisk', me, h.x - 90 + i * 24, h.y + 100); G.givePlayer(me, { minerals: 300, gas: 200 }); },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; return G.units.some(u => u.alive && u.owner === me && u.def.id === 'infested_command_center') ? 'win' : null; } },
    { id: 'p1', race: 'P', title: 'Reclamation', layout: 'valley', seed: 17, enemy: { race: 'Z', difficulty: 'normal' },
      brief: ['A Khaydarin crystal lies in the Zerg-held valley beyond our natural expansion.', 'Escort a Zealot to the beacon and hold it for ten seconds.', 'The swarm will not let you pass quietly.'],
      objective: 'Bring a Zealot to the beacon and hold it for 10 seconds', minutes: 0,
      setup(G, me, en) { const h = G.hallOf(me); G.placeDone(me, 'gateway', h.tx + 6, h.ty); G.placeDone(me, 'pylon', h.tx + 6, h.ty + 4); for (let i = 0; i < 6; i++) G.spawnUnit('zealot', me, h.x - 80 + i * 26, h.y + 100); for (let i = 0; i < 2; i++) G.spawnUnit('dragoon', me, h.x - 40 + i * 40, h.y + 130); const eb = G.map.bases.find(b => b.natural && b.quadrant === (G.players[en].startBase.quadrant)); const bx = eb ? eb.cx : G.players[en].startX, by = eb ? eb.cy + 120 : G.players[en].startY; G.mission.state.beacon = { x: bx, y: by }; G.fields.push({ kind: 'beacon', x: bx, y: by, r: 3, t: 1e9, owner: me }); G.givePlayer(me, { minerals: 250, gas: 100 }); },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; const b = m.state.beacon; const z = G.units.some(u => u.alive && u.owner === me && u.def.id === 'zealot' && distPt(u.x, u.y, b.x, b.y) < 3 * TILE); m.state.hold = z ? (m.state.hold || 0) + 1 : 0; if (z) G.players[me].msg('Holding the beacon... ' + m.state.hold + '/10', 'info'); return m.state.hold >= 10 ? 'win' : null; } },
    { id: 'p2', race: 'P', title: 'Fleet of Aiur', layout: 'temple', seed: 41, enemy: { race: 'T', difficulty: 'hard' },
      brief: ['The Terrans have entrenched with siege tanks and turrets.', 'The Conclave grants you a Fleet Beacon and two Carriers.', 'Raze every structure they have built.'],
      objective: 'Destroy all enemy structures', minutes: 0,
      facilities: ['fleet_beacon'], needs: ['stargate', 'fleet_beacon'],
      setup(G, me, en) { const h = G.hallOf(me); G.placeDone(me, 'gateway', h.tx + 6, h.ty); G.placeDone(me, 'cybernetics_core', h.tx + 6, h.ty + 4); G.placeDone(me, 'stargate', h.tx - 5, h.ty + 4); G.placeDone(me, 'fleet_beacon', h.tx - 4, h.ty - 3); for (let i = 0; i < 2; i++) { const c = G.spawnUnit('carrier', me, h.x + 40 + i * 60, h.y - 60); c.interceptors = 4; } G.givePlayer(me, { minerals: 500, gas: 300 }); },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; return null; } },
    { id: 'z3', race: 'Z', title: 'Tunnel Vision', layout: 'valley', seed: 53, enemy: { race: 'T', difficulty: 'normal' },
      brief: ['The Terrans hold the far plateau and our swarm cannot cross the open ground alive.', 'A Nydus Canal is grown and waiting. Place its exit near their mining line.', 'Ventral Sacs are ready: Overlords can carry a strike force over the cliffs.', 'Take their command post apart from the inside.'],
      objective: 'Destroy the Terran Command Center', minutes: 0,
      facilities: ['hydralisk_den'], needs: ['hydralisk_den'],
      setup(G, me, en) {
        const h = G.hallOf(me); G.morphBuilding(h, 'lair');
        G.placeDone(me, 'spawning_pool', h.tx + 6, h.ty + 1); G.placeDone(me, 'hydralisk_den', h.tx + 6, h.ty + 4); G.placeDone(me, 'extractor', h.tx, h.ty);
        const canal = G.placeDone(me, 'nydus_canal', h.tx - 4, h.ty + 3); if (canal) G.mission.state.canal = canal;
        G.givePlayer(me, { minerals: 500, gas: 400, tech: ['metabolic', 'ventral_sacs', 'muscular', 'burrow_tech'] });
        for (let i = 0; i < 8; i++) G.spawnUnit('zergling', me, h.x - 90 + i * 24, h.y + 100);
        for (let i = 0; i < 6; i++) G.spawnUnit('hydralisk', me, h.x - 70 + i * 26, h.y + 130);
        for (let i = 0; i < 2; i++) G.spawnUnit('overlord', me, h.x + 40 + i * 50, h.y - 70);
      },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; return G.units.some(u => u.alive && u.owner === en && u.def.id === 'command_center') ? null : 'win'; } },
    { id: 'p3', race: 'P', title: 'The Long Way Home', layout: 'bloodbath', seed: 67, enemy: { race: 'Z', difficulty: 'normal' },
      brief: ['The swarm has dug in behind a wall of sunken colonies.', 'A frontal assault would feed them. The Arbiter Tribunal offers another road.', 'Stasis their defenders, then Recall your army straight into the hive cluster.', 'Leave nothing of it standing.'],
      objective: 'Destroy every Zerg Hatchery, Lair and Hive', minutes: 0,
      facilities: ['arbiter_tribunal'], needs: ['citadel_of_adun', 'stargate', 'templar_archives', 'arbiter_tribunal'],
      setup(G, me, en) {
        const h = G.hallOf(me);
        G.placeDone(me, 'gateway', h.tx + 6, h.ty); G.placeDone(me, 'pylon', h.tx + 6, h.ty + 4); G.placeDone(me, 'cybernetics_core', h.tx - 5, h.ty + 4);
        G.placeDone(me, 'citadel_of_adun', h.tx - 5, h.ty); G.placeDone(me, 'stargate', h.tx + 2, h.ty - 4); G.placeDone(me, 'arbiter_tribunal', h.tx - 2, h.ty - 4);
        G.givePlayer(me, { minerals: 600, gas: 500, tech: ['recall_tech', 'stasis_tech', 'singularity', 'leg_enhancements'] });
        const a = G.spawnUnit('arbiter', me, h.x, h.y - 90); a.energy = 200;
        for (let i = 0; i < 6; i++) G.spawnUnit('zealot', me, h.x - 80 + i * 26, h.y + 100);
        for (let i = 0; i < 4; i++) G.spawnUnit('dragoon', me, h.x - 50 + i * 34, h.y + 130);
      },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; return G.units.some(u => u.alive && u.owner === en && u.def.spawnsLarva) ? null : 'win'; } },

    // ---------------------------------------------------------------- the weighted three
    // Each of these has a cheap answer and an expensive one, and the game says nothing about which you
    // took. It only remembers.

    // THE CHOICE: level six occupied habitation blocks, which stops the garrison rotating fresh squads
    // through them, or fight the same company over and over on their ground. Nothing forces either.
    { id: 't3', race: 'T', title: 'The Terrace', layout: 'valley', seed: 71, enemy: { race: 'T', difficulty: 'normal' },
      brief: ['The garrison holds the terrace above the ore road. We go through it or we go home.',
        'Six habitation blocks stand on the approach. The survey is three weeks old and it lists all six as occupied. The garrison did not move anyone out. It moved in around them.',
        'While the blocks stand they rotate fresh squads through the terrace and we fight the same company four times over.',
        'The blocks are not hardened. Two tanks would take an hour off this. Command has issued no preference and will not be issuing one.'],
      objective: 'Destroy the enemy Command Center', minutes: 0,
      facilities: ['factory'], needs: ['factory', 'academy'],
      setup(G, me, en) {
        const h = G.hallOf(me);
        G.placeDone(me, 'barracks', h.tx + 6, h.ty);
        const f = G.placeDone(me, 'factory', h.tx + 6, h.ty + 5);
        const ms = f ? G.placeDone(me, 'machine_shop', f.tx + f.def.w, f.ty + f.def.h - 2) : null;
        if (f && ms && ms.tx === f.tx + f.def.w && ms.ty === f.ty + f.def.h - 2) { ms.parent = f; f.addon = ms; }
        G.givePlayer(me, { minerals: 450, gas: 250, tech: ['siege_tech', 'stim'] });
        for (let i = 0; i < 8; i++) G.spawnUnit('marine', me, h.x - 90 + i * 24, h.y + 100);
        for (let i = 0; i < 2; i++) G.spawnUnit('siege_tank', me, h.x - 30 + i * 70, h.y + 140);
        G.spawnUnit('medic', me, h.x + 40, h.y + 140);
        // The terrace itself: six blocks, two thirds of the way to the garrison, spread wide enough that
        // ground units still have a road between them. They are the enemy's, so they are also the
        // enemy's supply -- which is the whole reason levelling them is the efficient play.
        const eb = G.players[en].startBase;
        const cx = Math.round(h.tx + (eb.x - h.tx) * 0.66), cy = Math.round(h.ty + (eb.y - h.ty) * 0.66);
        const ids = [];
        for (let i = 0; i < 6; i++) { const b = G.placeDone(en, 'supply_depot', cx + (i % 3) * 6 - 6, cy + Math.floor(i / 3) * 6 - 3); if (b) ids.push(b.id); }
        G.mission.state.terrace = ids; G.mission.state.built = ids.length;
        G.mission.state.tx = (cx + 1) * TILE; G.mission.state.ty = (cy + 1) * TILE;
      },
      check(G, m, me, en) {
        if (!G.hallOf(me)) return 'lose';
        const s = m.state, ids = s.terrace || []; s.t = (s.t || 0) + 1;   // mission ticks are one a second
        const standing = ids.filter(id => { const u = G.byId.get(id); return u && u.alive; }).length;
        if (standing !== s.standing) {
          s.standing = standing;
          // Said once per block, flatly. No adjectives, and no follow-up.
          if (s.built && standing < s.built) G.players[me].msg('Terrace: ' + standing + ' of ' + s.built + ' blocks standing.', 'info');
        }
        // The garrison rotates a squad through whatever is left, every forty seconds.
        if (standing > 0 && s.t % 40 === 0) {
          const h = G.hallOf(me); if (h) G.sendSquad(en, ['marine', 'marine', 'firebat'], s.tx, s.ty, h.x, h.y);
          s.rotations = (s.rotations || 0) + 1;
        }
        m.choices.terrace = !s.built ? 'none' : standing === 0 ? 'razed' : standing === s.built ? 'spared' : 'partial';
        return G.units.some(u => u.alive && u.owner === en && u.def.id === 'command_center') ? null : 'win';
      } },

    // THE CHOICE: leave a rearguard on the ridge and the column gets through, but the swarm does not go
    // back for what it leaves. Keep the rearguard and the pursuit reaches the drones instead.
    { id: 'z4', race: 'Z', title: 'The Rearguard', layout: 'temple', seed: 83, enemy: { race: 'T', difficulty: 'normal' },
      brief: ['The colony is finished. What is left of the brood moves tonight.',
        'Ten drones carry the genetic stock. They are already on the loading ground and the lift is six minutes out. Six have to be alive when it comes. They will not leave the ground for orders.',
        'One ridge covers the road in. Whatever the swarm leaves standing on it stops the pursuit for as long as it lasts, and the swarm does not go back for what it leaves.',
        'You can hold the ridge or you can keep what is standing on it. Not both.'],
      objective: 'Six of the ten drones alive at 6:00', minutes: 6,
      facilities: ['hydralisk_den'], needs: ['hydralisk_den'],
      setup(G, me, en) {
        const h = G.hallOf(me); const es = G.players[en];
        G.placeDone(me, 'spawning_pool', h.tx + 6, h.ty + 1); G.placeDone(me, 'hydralisk_den', h.tx + 6, h.ty + 5);
        G.givePlayer(me, { minerals: 350, gas: 200, tech: ['metabolic', 'muscular'] });
        for (let i = 0; i < 10; i++) G.spawnUnit('zergling', me, h.x - 100 + i * 22, h.y + 100);
        for (let i = 0; i < 6; i++) G.spawnUnit('hydralisk', me, h.x - 70 + i * 26, h.y + 130);
        G.spawnUnit('overlord', me, h.x + 60, h.y - 70);
        // The ridge sits a third of the way down the road the pursuit has to use; the loading ground is
        // the same distance again beyond the hive, away from them. Anything that gets past the ridge
        // walks over the hive to reach the drones.
        const dx = h.x - es.startX, dy = h.y - es.startY, L = Math.hypot(dx, dy) || 1;
        const ridge = G.spot(h.x - dx * 0.34, h.y - dy * 0.34);
        const exit = G.spot(h.x + (dx / L) * 16 * TILE, h.y + (dy / L) * 16 * TILE);
        G.mission.state.ridge = ridge; G.mission.state.exit = exit;
        G.fields.push({ kind: 'beacon', x: ridge.x, y: ridge.y, r: 3, t: 1e9, owner: me });
        G.fields.push({ kind: 'beacon', x: exit.x, y: exit.y, r: 4, t: 1e9, owner: me });
        const col = [];
        for (let i = 0; i < 10; i++) { const s = G.spot(exit.x - 60 + (i % 5) * 30, exit.y - 30 + Math.floor(i / 5) * 30); const d = G.spawnUnit('drone', me, s.x, s.y); d.applyOrder({ type: 'move', x: exit.x, y: exit.y }); col.push(d.id); }
        G.mission.state.column = col;
      },
      check(G, m, me, en) {
        if (!G.hallOf(me)) return 'lose';
        const s = m.state; if (!s.exit || !s.ridge) return null;
        s.t = (s.t || 0) + 1;
        // The column stays on the loading ground. Anything that drags it off -- an idle-worker sweep,
        // an order -- is undone on the next pass, so this mission is only ever about what covers it.
        let alive = 0;
        for (const id of s.column || []) {
          const u = G.byId.get(id); if (!u || !u.alive) continue; alive++;
          if (distPt(u.x, u.y, s.exit.x, s.exit.y) > 4 * TILE && !(u.order.type === 'move' && u.order.x === s.exit.x && u.order.y === s.exit.y)) u.applyOrder({ type: 'move', x: s.exit.x, y: s.exit.y });
        }
        const held = G.forceAt(me, s.ridge.x, s.ridge.y, 6) >= 4;
        s.heldSecs = (s.heldSecs || 0) + (held ? 1 : 0); s.alive = alive;
        // The pursuit comes over the ridge every thirty-five seconds and goes for the loading ground.
        // Something standing on the ridge is what it meets first.
        if (s.t % 35 === 0) G.sendSquad(en, ['marine', 'marine', 'marine', 'firebat'], s.ridge.x, s.ridge.y, s.exit.x, s.exit.y);
        if (s.t % 60 === 0 && s.t < 360) G.players[me].msg(alive + ' of 10 on the ground, ' + Math.max(0, 6 - Math.floor(s.t / 60)) + ' minutes to lift.', 'info');
        if (s.t < 360) return null;
        // Lift. Everything still on the ridge stays on the ridge.
        const left = G.units.filter(u => u.alive && u.owner === me && !u.isBuilding && !u.def.larva && !u.def.egg && distPt(u.x, u.y, s.ridge.x, s.ridge.y) <= 6 * TILE);
        m.choices.rearguard = left.length ? 'held' : 'withdrawn';
        m.choices.column = alive >= 6 ? 'through' : 'broken';
        s.spent = left.length; s.got = alive;
        if (left.length) { for (const u of left) G.kill(u, null, false); G.players[me].msg('The ridge held. Nothing comes back from it.', 'attack'); }
        G.players[me].msg(alive + ' of 10 drones lifted.', 'info');
        return alive >= 6 ? 'win' : 'lose';
      } },

    // THE CHOICE: two positions, one fleet. Whichever one you are not standing at is overrun when the
    // swarm lands, and losing the Assembly closes Protoss air for the rest of the campaign.
    { id: 'p4', race: 'P', title: 'Two Gates', layout: 'bloodbath', seed: 97, enemy: { race: 'Z', difficulty: 'normal' },
      brief: ['The swarm makes landfall in five minutes and the fleet can be over one position. Not two.',
        'The Reliquary holds what came off the transports. Nine thousand, none of them soldiers, and no lift capacity for a week.',
        'The Assembly is the last stargate line on this world. If it burns there are no more carriers -- here, or anywhere, for as long as this war runs.',
        'The Conclave has declined to choose. Stand at one of them.'],
      objective: 'Hold one of the two positions when the swarm lands (5:00)', minutes: 5,
      facilities: ['stargate'], needs: ['stargate', 'fleet_beacon', 'citadel_of_adun'],
      setup(G, me, en) {
        const h = G.hallOf(me);
        G.placeDone(me, 'gateway', h.tx + 6, h.ty); G.placeDone(me, 'cybernetics_core', h.tx + 6, h.ty + 5);
        G.givePlayer(me, { minerals: 400, gas: 250, tech: ['singularity', 'leg_enhancements'] });
        for (let i = 0; i < 6; i++) G.spawnUnit('zealot', me, h.x - 80 + i * 26, h.y + 100);
        for (let i = 0; i < 4; i++) G.spawnUnit('dragoon', me, h.x - 50 + i * 34, h.y + 130);
        // The Reliquary: shelter structures a short walk from the hall.
        const rel = [];
        for (const b of [G.placeDone(me, 'pylon', h.tx - 7, h.ty - 3), G.placeDone(me, 'pylon', h.tx - 7, h.ty), G.placeDone(me, 'photon_cannon', h.tx - 5, h.ty - 2)]) if (b) rel.push(b.id);
        // The Assembly: out at the natural, which is the whole difficulty.
        const nat = G.map.bases.find(b => b.natural && b.quadrant === G.players[me].startBase.quadrant) || G.map.bases.find(b => !b.main);
        const ax = nat ? nat.x : h.tx + 12, ay = nat ? nat.y : h.ty + 12;
        const asm = [];
        for (const b of [G.placeDone(me, 'pylon', ax + 3, ay + 3), G.placeDone(me, 'stargate', ax - 1, ay + 4), G.placeDone(me, 'fleet_beacon', ax + 4, ay)]) if (b) asm.push(b.id);
        const relC = G.spot((h.tx - 5) * TILE, (h.ty - 1) * TILE), asmC = G.spot((ax + 2) * TILE, (ay + 3) * TILE);
        G.mission.state.rel = rel; G.mission.state.asm = asm; G.mission.state.relC = relC; G.mission.state.asmC = asmC;
        G.fields.push({ kind: 'beacon', x: relC.x, y: relC.y, r: 4, t: 1e9, owner: me });
        G.fields.push({ kind: 'beacon', x: asmC.x, y: asmC.y, r: 4, t: 1e9, owner: me });
      },
      check(G, m, me, en) {
        if (!G.hallOf(me)) return 'lose';
        const s = m.state; if (!s.relC || !s.asmC) return null;
        s.t = (s.t || 0) + 1;
        const standing = ids => (ids || []).some(id => { const u = G.byId.get(id); return u && u.alive; });
        // Probes from two minutes in, on both positions, so neither is safe by being ignored.
        if (s.t >= 120 && s.t % 30 === 0) {
          G.sendSquad(en, ['zergling', 'zergling', 'zergling', 'zergling'], s.relC.x + 7 * TILE, s.relC.y, s.relC.x, s.relC.y);
          G.sendSquad(en, ['zergling', 'zergling', 'zergling', 'zergling'], s.asmC.x + 7 * TILE, s.asmC.y, s.asmC.x, s.asmC.y);
        }
        if (s.t === 240) G.players[me].msg('One minute to landfall.', 'attack');
        if (s.t < 300) return null;
        // Landfall. Whichever position has less standing over it is overrun; an even split loses both,
        // because the fleet cannot be told to cover two and the Conclave still will not choose.
        const dr = G.forceAt(me, s.relC.x, s.relC.y, 8), da = G.forceAt(me, s.asmC.x, s.asmC.y, 8);
        const relUp = standing(s.rel), asmUp = standing(s.asm);
        const keep = relUp && !asmUp ? 'rel' : asmUp && !relUp ? 'asm' : (relUp && asmUp) ? (dr > da ? 'rel' : da > dr ? 'asm' : null) : null;
        const overrun = (ids, c, name) => {
          for (const id of ids || []) { const u = G.byId.get(id); if (u && u.alive) G.kill(u, null, false); }
          for (const u of G.units.filter(q => q.alive && q.owner === me && !q.isBuilding && distPt(q.x, q.y, c.x, c.y) <= 6 * TILE)) G.kill(u, null, false);
          G.players[me].msg(name + ' is gone.', 'attack');
        };
        if (keep !== 'rel') overrun(s.rel, s.relC, 'The Reliquary');
        if (keep !== 'asm') overrun(s.asm, s.asmC, 'The Assembly');
        m.choices.gates = keep === 'rel' ? 'reliquary' : keep === 'asm' ? 'assembly' : 'neither';
        s.resolved = m.choices.gates;
        if (keep === 'rel') G.players[me].msg('The Reliquary holds. The Assembly does not.', 'info');
        if (keep === 'asm') G.players[me].msg('The Assembly holds. The Reliquary does not.', 'info');
        return keep ? 'win' : 'lose';
      } },

    // The one that reads the record back. Nothing here explains itself.
    { id: 't4', race: 'T', title: 'Cold Start', layout: 'temple', seed: 109, enemy: { race: 'Z', difficulty: 'hard' },
      brief: ['Last hive cluster on the continent. There is no relief behind you and no lift out.',
        'Everything the campaign has left is already on the ground.'],
      objective: 'Destroy every Zerg Hatchery, Lair and Hive', minutes: 0,
      // 'factory' is deliberately NOT here. If The Terrace lost it, the finale is fought without mech,
      // which is the whole of what campaign attrition is for.
      needs: ['academy', 'engineering_bay'],
      // Read four ways, stated flat, never explained.
      notes(G, d) {
        const out = []; const c = d.c || {};
        if (c.terrace === 'razed') out.push('Two of the four companies assigned to you did not redeploy. The order gives no reason and does not invite one.');
        else if (c.terrace === 'spared' || c.terrace === 'partial') out.push('The terrace company asked to come with you. All of it did.');
        if (c.rearguard === 'held') out.push('The pursuit that crossed the ridge never re-formed. The record does not say what stopped it.');
        if (c.gates === 'assembly') out.push('The Reliquary is not in the casualty tables. It is not in any table.');
        else if (c.gates === 'reliquary') out.push('A relief detachment attached itself to your column at the staging yard. Their movement order was signed by a shelter administrator.');
        return out;
      },
      setup(G, me, en) {
        const h = G.hallOf(me), eb = G.players[en].startBase;
        G.placeDone(me, 'barracks', h.tx + 6, h.ty); G.placeDone(me, 'academy', h.tx + 6, h.ty + 5); G.placeDone(me, 'engineering_bay', h.tx - 6, h.ty + 4);
        G.givePlayer(me, { minerals: 500, gas: 250, tech: ['stim', 'u238'] });
        // Two of the four companies did not redeploy.
        const marines = G.chose('terrace') === 'razed' ? 6 : 12;
        for (let i = 0; i < marines; i++) G.spawnUnit('marine', me, h.x - 110 + (i % 6) * 24, h.y + 100 + Math.floor(i / 6) * 26);
        for (let i = 0; i < 2; i++) G.spawnUnit('medic', me, h.x - 20 + i * 40, h.y + 160);
        // The shelter sent people back.
        if (G.chose('gates') === 'reliquary') { for (let i = 0; i < 4; i++) G.spawnUnit('marine', me, h.x + 40 + i * 24, h.y + 160); G.spawnUnit('medic', me, h.x + 140, h.y + 160); }
        // The cluster is dug in, because this is the last one and they know it.
        G.givePlayer(en, { minerals: 700, gas: 400 });
        G.placeDone(en, 'spawning_pool', eb.x + 6, eb.y + 1); G.placeDone(en, 'hydralisk_den', eb.x + 6, eb.y + 5);
        const nat = G.map.bases.find(b => b.natural && b.quadrant === eb.quadrant);
        if (nat) G.placeDone(en, 'hatchery', nat.x, nat.y);
        // ...unless the pursuit that crossed the ridge never came back to dig it in.
        const sunkens = G.chose('rearguard') === 'held' ? 2 : 5;
        for (let i = 0; i < sunkens; i++) G.placeDone(en, 'sunken_colony', eb.x + 2 + (i % 3) * 3, eb.y + 6 + Math.floor(i / 3) * 3);
        for (let i = 0; i < 8; i++) G.spawnUnit('zergling', en, G.players[en].startX - 80 + i * 22, G.players[en].startY + 90);
        G.mission.state.started = marines; G.mission.state.sunkens = sunkens;
      },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; return G.units.some(u => u.alive && u.owner === en && u.def.spawnsLarva) ? null : 'win'; } },
  ],

  get(id) { const b = this.baseId(id); return this.list.find(m => m.id === b); },
  // Called from UI.start after G.init; wires mission state into G.
  //
  // `id` is either a launch id already carrying a frozen campaign record ('t1#w=z1;c=gates:reliquary')
  // or a bare mission id ('t1'), which is what the main menu hands over today. A bare one is frozen
  // HERE, once, and the frozen id is written straight back into G.setup -- because G.setup.mission is
  // what Replay.data() stores, and the rule that matters is:
  //
  //     the id a replay carries is the id the original run actually used.
  //
  // A replay therefore re-simulates against the record that was in force when it was recorded rather
  // than against whatever this machine's campaign says by the time somebody watches it. startId()
  // emits the separator even for an untouched campaign, so a replay's id is always already frozen and
  // this cannot fire on the playback path. Freezing is the only localStorage read anywhere near the
  // simulation, it happens once at frame 0, and after it G.setup, UI.lastOpts, the save and the replay
  // all name the same run.
  begin(id) {
    if (!this.frozen(id)) { id = this.startId(id); if (G.setup) G.setup.mission = id; }
    const def = this.get(id); if (!def) return; const me = G.human, en = G.players.findIndex(p => !p.human);
    const dossier = this.decode(id);
    const closed = this.closedIn(def, dossier);
    // The live def is a shallow clone so a briefing composed from the record cannot leak into the next
    // launch of the same mission. Everything else, including setup and check, is the same function.
    const live = Object.assign({}, def);
    G.mission = {
      def: live, id: this.baseId(id), launchId: id == null ? '' : String(id), dossier, closed: [...closed],
      done: false, start: G.frame, state: {}, choices: {}, facilities: [], lost: [], record: null, summary: null,
      // Time, kills and losses, shown on the result screen and in the message log.
      score() { const p = G.players[me]; const t = Math.floor((G.frame - this.start) / TPS); return `Time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}   killed ${p.stats.unitsKilled} units / ${p.stats.buildingsKilled} buildings   lost ${p.stats.unitsLost} units / ${p.stats.buildingsLost} buildings   mined ${p.stats.mined}`; },
      finish(won) {
        this.done = true; this.summary = this.score(); G.over = true; G.winner = won ? me : en; G.winTeam = G.players[G.winner].team;
        // What this mission was carrying and did not bring home. Only facilities the setup actually
        // placed can be lost, so a mission whose placement failed never closes a branch by accident.
        this.lost = this.facilities.filter(fid => !G.units.some(u => u.alive && u.owner === me && u.isBuilding && u.def.id === fid));
        this.record = { id: this.def.id, won: !!won, choices: Object.assign({}, this.choices), lost: this.lost.slice() };
        G.players[me].msg(won ? 'Mission accomplished.' : 'Mission failed.');
        G.players[me].msg(this.summary, 'info');
        for (const fid of this.lost) G.players[me].msg((DATA.buildings[fid] ? DATA.buildings[fid].name : fid) + ' was not recovered.', 'info');
        Missions.remember(this.record);
      },
      tick() {
        if (this.done) return;
        const r = live.check(G, this, me, en);
        if (r === 'win') return this.finish(true);
        if (r === 'lose') return this.finish(false);
        // Fallback: razing the enemy always completes a mission, so an objective that became
        // impossible (the Command Center to infest died, the beacon holder was killed) is never a dead end.
        if (!G.units.some(u => u.alive && u.owner === en && u.isBuilding && u.def.tier !== 'addon')) this.finish(true);
      },
    };
    this.installLocks(G.players[me], closed);
    def.setup(G, me, en);
    // Declared facilities count only if the setup managed to place them; see finish().
    G.mission.facilities = (def.facilities || []).filter(fid => G.units.some(u => u.alive && u.owner === me && u.isBuilding && u.def.id === fid));
    live.brief = def.brief.concat(this.notes(def, dossier, closed));
    G.recomputeSupply(); G.updateVision();
    if (typeof UI !== 'undefined') { UI.menu = 'brief'; }
  },
};
// helpers used by mission setups
G.hallOf = function (pid) { return this.units.find(u => u.alive && u.owner === pid && u.isBuilding && u.def.depot) || null; };
G.givePlayer = function (pid, o) { const p = this.players[pid]; if (o.minerals) p.minerals += o.minerals; if (o.gas) p.gas += o.gas; if (o.tech) for (const t of o.tech) p.tech.add(t); if (o.nukes) p.nukes += o.nukes; };
G.placeDone = function (pid, id, tx, ty) { const def = DATA.buildings[id]; const p = this.players[pid]; let spot = null; for (let r = 0; r < 12 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) { if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; const x = tx + dx, y = ty + dy; const err = this.map.canPlace(def, x, y, p, this.units, null); if (!err || (err === 'Requires psi power') || (err === 'Requires creep')) spot = [x, y]; } if (!spot) return null; const b = this.placeBuilding(def, spot[0], spot[1], pid); this.completeBuilding(b); b.hp = b.maxHp; b.sh = b.maxSh; return b; };
// Nearest walkable point to a world position, so a mission can name a place without knowing the terrain.
G.spot = function (x, y) { const tx = clamp(Math.floor(x / TILE), 1, this.map.w - 2), ty = clamp(Math.floor(y / TILE), 1, this.map.h - 2); const t = this.map.findFreeTile(tx, ty, 16, (a, b) => this.map.walkable(a, b)); return t ? { x: (t[0] + 0.5) * TILE, y: (t[1] + 0.5) * TILE } : { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; };
// Scripted pressure. The owning AI will fold these into its own waves within a think or two, which is
// fine -- they are spawned close enough to their objective to have engaged by then.
G.sendSquad = function (pid, kinds, x, y, tx, ty) { const out = []; for (let i = 0; i < kinds.length; i++) { const s = this.spot(x + (i % 3) * 28 - 28, y + Math.floor(i / 3) * 28); const u = this.spawnUnit(kinds[i], pid, s.x, s.y); u.applyOrder({ type: 'attackmove', x: tx, y: ty }); out.push(u); } return out; };
// Fighting supply a player has standing within r tiles of a point. Workers, larvae and eggs do not hold
// ground, so they do not count towards holding it.
G.forceAt = function (pid, x, y, rTiles) { let s = 0; for (const u of this.units) { if (!u.alive || u.owner !== pid || u.isBuilding || u.def.worker || u.def.larva || u.def.egg) continue; if (distPt(u.x, u.y, x, y) > rTiles * TILE) continue; s += u.def.sup || 1; } return s; };
// What an earlier mission decided, and what the campaign no longer has. Read from G.mission.dossier,
// which came in on the launch id -- never from localStorage, so a replay sees what the original saw.
G.chose = function (k) { const m = this.mission; return m && m.dossier && m.dossier.c ? (m.dossier.c[k] || null) : null; };
G.branchLost = function (id) { const m = this.mission; return !!(m && m.dossier && (m.dossier.l || []).some(e => e.id === id)); };
