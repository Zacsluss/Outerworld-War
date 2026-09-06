'use strict';
// ============================================================================
// Scenario missions: scripted setups with custom objectives and briefings.
// ============================================================================
const Missions = {
  list: [
    { id: 't1', race: 'T', title: 'Hold the Line', layout: 'temple', seed: 11, enemy: { race: 'Z', difficulty: 'hard' },
      brief: ['Commander, our forward colony is about to be overrun.', 'The Zerg will hit within minutes and keep coming.', 'Hold the Command Center for ten minutes until the evacuation fleet arrives.', 'You have a bunker crew and a few marines. Use the ramp.'],
      objective: 'Survive for 10:00 with your Command Center intact', minutes: 10,
      setup(G, me, en) { const h = G.hallOf(me); for (let i = 0; i < 8; i++) G.spawnUnit('marine', me, h.x - 80 + i * 22, h.y + 90); G.spawnUnit('medic', me, h.x, h.y + 120); G.givePlayer(me, { minerals: 300, tech: ['stim'] }); G.players[en].ai.attackThreshold = 10; G.players[en].ai.thinkEvery = 16; },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; if (G.frame - m.start >= 24 * 60 * 10) return 'win'; return null; } },
    { id: 't2', race: 'T', title: 'Ghost Protocol', layout: 'valley', seed: 23, enemy: { race: 'P', difficulty: 'normal' },
      brief: ['A Protoss expedition has fortified the far side of the valley.', 'Command has authorised a nuclear strike.', 'Your Ghosts are cloak-capable and a warhead is loaded.', 'Destroy every Nexus before they establish a fleet.'],
      objective: 'Destroy all enemy Nexuses', minutes: 0,
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
      setup(G, me, en) { const h = G.hallOf(me); G.placeDone(me, 'gateway', h.tx + 6, h.ty); G.placeDone(me, 'cybernetics_core', h.tx + 6, h.ty + 4); G.placeDone(me, 'stargate', h.tx - 5, h.ty + 4); G.placeDone(me, 'fleet_beacon', h.tx - 4, h.ty - 3); for (let i = 0; i < 2; i++) { const c = G.spawnUnit('carrier', me, h.x + 40 + i * 60, h.y - 60); c.interceptors = 4; } G.givePlayer(me, { minerals: 500, gas: 300 }); },
      check(G, m, me, en) { if (!G.hallOf(me)) return 'lose'; return null; } },
    { id: 'z3', race: 'Z', title: 'Tunnel Vision', layout: 'valley', seed: 53, enemy: { race: 'T', difficulty: 'normal' },
      brief: ['The Terrans hold the far plateau and our swarm cannot cross the open ground alive.', 'A Nydus Canal is grown and waiting. Place its exit near their mining line.', 'Ventral Sacs are ready: Overlords can carry a strike force over the cliffs.', 'Take their command post apart from the inside.'],
      objective: 'Destroy the Terran Command Center', minutes: 0,
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
  ],
  get(id) { return this.list.find(m => m.id === id); },
  // Called from UI.start after G.init; wires mission state into G
  begin(id) {
    const def = this.get(id); if (!def) return; const me = G.human, en = G.players.findIndex(p => !p.human);
    G.mission = {
      def, done: false, start: G.frame, state: {}, summary: null,
      // Time, kills and losses, shown on the result screen and in the message log.
      score() { const p = G.players[me]; const t = Math.floor((G.frame - this.start) / TPS); return `Time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}   killed ${p.stats.unitsKilled} units / ${p.stats.buildingsKilled} buildings   lost ${p.stats.unitsLost} units / ${p.stats.buildingsLost} buildings   mined ${p.stats.mined}`; },
      finish(won) { this.done = true; this.summary = this.score(); G.over = true; G.winner = won ? me : en; G.winTeam = G.players[G.winner].team; G.players[me].msg(won ? 'Mission accomplished.' : 'Mission failed.'); G.players[me].msg(this.summary, 'info'); },
      tick() {
        if (this.done) return;
        const r = def.check(G, this, me, en);
        if (r === 'win') return this.finish(true);
        if (r === 'lose') return this.finish(false);
        // Fallback: razing the enemy always completes a mission, so an objective that became
        // impossible (the Command Center to infest died, the beacon holder was killed) is never a dead end.
        if (!G.units.some(u => u.alive && u.owner === en && u.isBuilding && u.def.tier !== 'addon')) this.finish(true);
      },
    };
    def.setup(G, me, en); G.recomputeSupply(); G.updateVision();
    if (typeof UI !== 'undefined') { UI.menu = 'brief'; }
  },
};
// helpers used by mission setups
G.hallOf = function (pid) { return this.units.find(u => u.alive && u.owner === pid && u.isBuilding && u.def.depot) || null; };
G.givePlayer = function (pid, o) { const p = this.players[pid]; if (o.minerals) p.minerals += o.minerals; if (o.gas) p.gas += o.gas; if (o.tech) for (const t of o.tech) p.tech.add(t); if (o.nukes) p.nukes += o.nukes; };
G.placeDone = function (pid, id, tx, ty) { const def = DATA.buildings[id]; const p = this.players[pid]; let spot = null; for (let r = 0; r < 12 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) { if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; const x = tx + dx, y = ty + dy; const err = this.map.canPlace(def, x, y, p, this.units, null); if (!err || (err === 'Requires psi power') || (err === 'Requires creep')) spot = [x, y]; } if (!spot) return null; const b = this.placeBuilding(def, spot[0], spot[1], pid); this.completeBuilding(b); b.hp = b.maxHp; b.sh = b.maxSh; return b; };
