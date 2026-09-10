// NOT A TEST. This is a one-off codemod from M10: it REWRITES FILES IN js/ and was applied once,
// years of milestones ago. It lives in test/ only because that is where it was written.
//
// Running it today does damage. Its anchors no longer match, so it throws part-way -- and `edit()`
// writes each file as it finishes it, so the files it got through before the throw are already
// modified. It appended a second `CMD.install()` to js/commands.js before failing on js/map.js, which
// is a duplicate that parses, runs, and would have been committed by anything that did not diff first.
//
// Kept for the record rather than deleted, behind a flag, so that `for f in test/*.js` is safe.
if (!process.argv.includes('--i-know-this-rewrites-source')) {
  console.log(__filename.split(/[\/]/).pop() + ': a one-off codemod, already applied. Not a test; refusing to run.');
  process.exit(0);
}
const fs = require('fs');
function edit(p, pairs) { let s = fs.readFileSync(p, 'utf8'); for (const [a, b, all] of pairs) { if (!s.includes(a)) throw new Error('missing in ' + p + ': ' + a.slice(0, 80)); s = all ? s.split(a).join(b) : s.replace(a, b); } fs.writeFileSync(p, s); }

// ---------------- map.js: resource lookup by id ----------------
edit('js/map.js', [
  ["    // Ensure resource tiles walkable flag off (they block)\n    for (const r of this.resources) this.rect(r.x, r.y, r.w, r.h, (x, y) => { this.cliff[this.idx(x, y)] = 0; });",
    "    // Ensure resource tiles walkable flag off (they block)\n    for (const r of this.resources) this.rect(r.x, r.y, r.w, r.h, (x, y) => { this.cliff[this.idx(x, y)] = 0; });\n    this.resById = new Map(this.resources.map(r => [r.id, r]));"],
]);

// ---------------- game.js ----------------
edit('js/game.js', [
  ["  init(opts) {\n    UNIT_ID = 1;\n    this.map = new GameMap(opts.seed || 1); this.pf = new Pathfinder(this.map);",
    "  init(opts) {\n    UNIT_ID = 1; this.seed = opts.seed || 1; this.layout = opts.layout || 'temple'; this.setup = opts; this.cheats = {}; this.log = []; this.pendingCmds = null; RNG.seed((this.seed * 7919 + 17) >>> 0); this._allVis = null;\n    this.map = new GameMap(opts.seed || 1, opts.layout || 'temple'); this.pf = new Pathfinder(this.map);"],
  ["    const pick = r => r === 'R' ? races[Math.floor(Math.random() * 3)] : r;", "    const pick = r => r === 'R' ? races[Math.floor(this.rand() * 3)] : r;"],
  ["      const p = new Player(i, pick(po.race), po.human, po.name || (po.human ? 'Player' : 'Computer ' + i));",
    "      const p = new Player(i, pick(po.race), po.human, po.name || (po.human ? 'Player' : 'Computer ' + i)); p.team = po.team == null ? i : po.team;"],
  ["  allied(a, b) { return a === b; },", "  allied(a, b) { if (a === b) return true; const pa = this.players[a], pb = this.players[b]; return !!(pa && pb && pa.team === pb.team); },\n  allVis() { if (!this._allVis) { this._allVis = new Uint8Array(this.map.w * this.map.h).fill(2); } return this._allVis; },"],
  ["      for (const u of this.units) { if (!u.alive || u.inside) continue; if (u.owner === p.id || u.fx.parasite === p.id) mark(u.x, u.y, u.sight, u.heightLevel()); }\n      for (const f of this.fields) if (f.kind === 'scan' && f.owner === p.id) mark(f.x, f.y, 10, 2);",
    "      for (const u of this.units) { if (!u.alive || u.inside) continue; if (this.allied(u.owner, p.id) || u.fx.parasite === p.id) mark(u.x, u.y, u.sight, u.heightLevel()); }\n      for (const f of this.fields) if (f.kind === 'scan' && this.allied(f.owner, p.id)) mark(f.x, f.y, 10, 2);\n      if (p.human && (this.cheats.reveal || this.cheats.nofog)) v.fill(2);"],
  ["    for (const u of this.units) { if (!u.alive || !u.isDetector) continue; const r = u.sight * TILE; for (const t of this.near(u.x, u.y, r)) if (t.owner !== u.owner && t.isCloaked) t.detBy[u.owner] = this.frame; }",
    "    for (const u of this.units) { if (!u.alive || !u.isDetector) continue; const r = u.sight * TILE; for (const t of this.near(u.x, u.y, r)) if (t.owner !== u.owner && t.isCloaked) for (const q of this.players) if (this.allied(q.id, u.owner)) t.detBy[q.id] = this.frame; }"],
  ["  canSee(pid, u) { if (u.owner === pid) return true; if (u.fx.parasite === pid) return true; if (!this.visibleAt(pid, u.x, u.y)) return false; if (u.isCloaked && !this.detected(u, pid)) return false; return true; },",
    "  canSee(pid, u) { if (u.owner === pid || this.allied(pid, u.owner)) return true; if (u.fx.parasite === pid) return true; if (!this.visibleAt(pid, u.x, u.y)) return false; if (u.isCloaked && !this.detected(u, pid) && !(u.fx.ensnare > 0 || u.fx.plague > 0)) return false; return true; },"],
  ["  targetable(att, t) { if (!t.alive || t.inside) return false; if (t.fx.stasis > 0) return false; if (t.owner === att.owner) return true; return this.canSee(att.owner, t); },",
    "  targetable(att, t) { if (!t.alive || t.inside) return false; if (t.fx.stasis > 0) return false; if (t.owner === att.owner || this.allied(att.owner, t.owner)) return true; return this.canSee(att.owner, t); },"],
  ["  spawnLarva(h) { const l = this.spawnUnit('larva', h.owner, h.x - 30 + Math.random() * 60,", "  spawnLarva(h) { const l = this.spawnUnit('larva', h.owner, h.x - 30 + this.rand() * 60,"],
  ["  damageRaw(t, amt, src) { if (!t.alive || t.fx.stasis > 0) return;", "  damageRaw(t, amt, src) { if (!t.alive || t.fx.stasis > 0) return; if (this.cheats.god && this.players[t.owner].human) return;"],
  ["  damage(t, dmg, type, src, opts = {}) {\n    if (!t.alive || t.fx.stasis > 0) return 0;", "  damage(t, dmg, type, src, opts = {}) {\n    if (!t.alive || t.fx.stasis > 0) return 0; if (this.cheats.god && this.players[t.owner].human) return 0;"],
  ["    if (ud.sup && !ud.notUnit && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) { p.msg(RACE_INFO[p.race].supplyMsg, 'error'); return false; }\n    p.minerals -= ud.min; p.gas -= ud.gas;\n    b.prod.push({ kind: 'unit', id: uid, progress: 0, total: ud.time }); this.recomputeSupply(); return true;",
    "    if (ud.sup && !ud.notUnit && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax && !(this.cheats.food && p.human)) { p.msg(RACE_INFO[p.race].supplyMsg, 'error'); return false; }\n    p.minerals -= ud.min; p.gas -= ud.gas;\n    b.prod.push({ kind: 'unit', id: uid, progress: 0, total: ud.time }); this.recomputeSupply(); return true;"],
  ["    if (ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax) { p.msg(RACE_INFO[p.race].supplyMsg, 'error'); return false; }\n    p.minerals -= ud.min; p.gas -= ud.gas;\n    const h = l.hatch;",
    "    if (ud.sup && p.supUsed + ud.sup * (ud.pair ? 2 : 1) > p.supMax && !(this.cheats.food && p.human)) { p.msg(RACE_INFO[p.race].supplyMsg, 'error'); return false; }\n    p.minerals -= ud.min; p.gas -= ud.gas;\n    const h = l.hatch;"],
  ["  tick() {\n    if (this.over || this.paused) return;\n    this.frame++; this.pathBudget = 40;",
    "  tick() {\n    if (this.over || this.paused) return;\n    if (typeof Replay !== 'undefined') Replay.applyPending();\n    this.inTick = true;\n    this.frame++; this.pathBudget = 40;"],
  ["    for (let i = this.effects.length - 1; i >= 0; i--) { if (--this.effects[i].t <= 0) this.effects.splice(i, 1); }\n  },\n  checkVictory() {",
    "    for (let i = this.effects.length - 1; i >= 0; i--) { if (--this.effects[i].t <= 0) this.effects.splice(i, 1); }\n    if (this.mission && this.frame % 24 === 0) this.mission.tick();\n    this.inTick = false;\n  },\n  checkVictory() {"],
  ["      if (!hasB && (!hasU || this.frame > 24 * 60 * 3)) { p.defeated = true;", "      if (!hasB && (!hasU || this.frame > 24 * 60 * 3) && !(this.cheats.alive && p.human)) { p.defeated = true;"],
  ["    const alive = this.players.filter(p => !p.defeated);\n    if (alive.length <= 1) { this.over = true; this.winner = alive.length ? alive[0].id : -1; }",
    "    const alive = this.players.filter(p => !p.defeated); const teams = new Set(alive.map(p => p.team));\n    if (teams.size <= 1 && !(this.mission && !this.mission.done)) { this.over = true; this.winner = alive.length ? alive[0].id : -1; this.winTeam = alive.length ? alive[0].team : -1; }"],
]);

// ---------------- sim.js ----------------
edit('js/sim.js', [
  ["    this.facing = Math.random() * Math.PI * 2; this.fly = !!def.fly;", "    this.facing = G.rand() * Math.PI * 2; this.fly = !!def.fly;"],
  ["    if ((G.frame + this.id) % 60 === 0) { const a = Math.random() * Math.PI * 2;", "    if ((G.frame + this.id) % 60 === 0) { const a = G.rand() * Math.PI * 2;"],
  ["  hasReq(def) { if (!def.req) return true;", "  hasReq(def) { if (!def.req || (G.cheats.noreq && this.human)) return true;"],
  ["    if (this.maxEnergy && this.energy < this.maxEnergy && !(this.fx.stasis > 0)) this.energy = Math.min(this.maxEnergy, this.energy + 0.03125);",
    "    if (this.maxEnergy && this.energy < this.maxEnergy && !(this.fx.stasis > 0)) this.energy = Math.min(this.maxEnergy, this.energy + 0.03125);\n    if (G.cheats.energy && p.human && this.maxEnergy) this.energy = this.maxEnergy;"],
  ["      if (adv) {\n        this.progress++;", "      if (adv) {\n        this.progress += (G.cheats.cwal && p.human) ? 10 : 1;"],
  ["    if (this.lifted) { this.tickOrder(); return; }", "    if (d.race === 'T' && this.hp < this.maxHp / 3) { this.hp -= 0.03; if ((G.frame + this.id) % 10 === 0) G.effects.push({ kind: 'fire', x: this.x + (G.rand() - .5) * d.w * TILE * 0.6, y: this.y + (G.rand() - .5) * d.h * TILE * 0.5, t: 14 }); if (this.hp <= 0) { G.kill(this, null); return; } }\n    if (this.lifted) { this.tickOrder(); return; }"],
  ["    it.progress++;\n    if (it.progress >= it.total) { this.prod.shift(); G.finishProduction(this, it); }",
    "    it.progress += (G.cheats.cwal && this.player.human) ? 10 : 1;\n    if (it.progress >= it.total) { this.prod.shift(); G.finishProduction(this, it); }"],
  ["    if (it.kind === 'unit' && !d.egg && !it.started) { const ud = DATA.units[it.id]; if (ud.sup && this.player.supUsed + ud.sup * (ud.pair ? 2 : 1) > this.player.supMax && !it.reserved) {",
    "    if (it.kind === 'unit' && !d.egg && !it.started) { const ud = DATA.units[it.id]; if (ud.sup && this.player.supUsed + ud.sup * (ud.pair ? 2 : 1) > this.player.supMax && !it.reserved && !(G.cheats.food && this.player.human)) {"],
  ["    this.cooldown = this.wCd(w); this.facing = Math.atan2(t.y - this.y, t.x - this.x); this.lastFire = G.frame;",
    "    this.cooldown = this.wCd(w) + Math.floor(G.rand() * 3) - 1; this.facing = Math.atan2(t.y - this.y, t.x - this.x); this.lastFire = G.frame;"],
  ["      if (t === this || !t.alive || t.owner === this.owner || t.inside || G.allied(this.owner, t.owner)) continue;", "      if (t === this || !t.alive || t.inside || G.allied(this.owner, t.owner)) continue;"],
]);

// ---------------- abilities.js ----------------
edit('js/abilities.js', [
  ["    const extra = ud.sup - u.def.sup; if (extra > 0 && p.supUsed + extra > p.supMax) {", "    const extra = ud.sup - u.def.sup; if (extra > 0 && p.supUsed + extra > p.supMax && !(G.cheats.food && p.human)) {"],
  ["x: t.x + (Math.random() - .5) * t.r, y: t.y + (Math.random() - .5) * t.r, t: 4", "x: t.x + (G.rand() - .5) * t.r, y: t.y + (G.rand() - .5) * t.r, t: 4"],
]);
// ---------------- combat.js ----------------
edit('js/combat.js', [["x: a.x + (Math.random() - .5) * 40, y: a.y + (Math.random() - .5) * 40", "x: a.x + (G.rand() - .5) * 40, y: a.y + (G.rand() - .5) * 40"]]);
// ---------------- ai.js ----------------
edit('js/ai.js', [
  ["Math.random()", "G.rand()", true],
  ["  enemies() { return G.players.filter(q => q.id !== this.p.id && !q.defeated); }", "  enemies() { return G.players.filter(q => !G.allied(q.id, this.p.id) && !q.defeated); }"],
  ["    for (const u of G.units) { if (!u.alive || u.owner === this.p.id || !u.isBuilding || u.def.tier === 'addon') continue; if (G.players[u.owner].defeated) continue;",
    "    for (const u of G.units) { if (!u.alive || G.allied(u.owner, this.p.id) || !u.isBuilding || u.def.tier === 'addon') continue; if (G.players[u.owner].defeated) continue;"],
  ["    if (!best) { for (const u of G.units) { if (u.alive && u.owner !== this.p.id && !G.players[u.owner].defeated && !u.def.larva) {",
    "    if (!best) { for (const u of G.units) { if (u.alive && !G.allied(u.owner, this.p.id) && !G.players[u.owner].defeated && !u.def.larva) {"],
  ["    const attacked = this.mine(u => u.owner === p.id && G.frame - u.lastHit < 72 && u.lastHitBy && u.lastHitBy.owner !== p.id && (u.isBuilding || u.def.worker));",
    "    const attacked = this.mine(u => u.owner === p.id && G.frame - u.lastHit < 72 && u.lastHitBy && !G.allied(u.lastHitBy.owner, p.id) && (u.isBuilding || u.def.worker));"],
  ["      if (G.units.some(u => u.alive && u.owner !== p.id && (u.isBuilding || u.hasWeapon()) && distPt(u.x, u.y, b.cx, b.cy) < 14 * TILE)) continue;",
    "      if (G.units.some(u => u.alive && !G.allied(u.owner, p.id) && (u.isBuilding || u.hasWeapon()) && distPt(u.x, u.y, b.cx, b.cy) < 14 * TILE)) continue;"],
]);
// ---------------- hud.js: cargo unload through command ----------------
edit('js/hud.js', [["fn: () => { if (u.isBuilding) { const k = u.cargo.indexOf(c); if (k >= 0) { u.cargo.splice(k, 1); u.cargo.unshift(c); G.unloadOne(u); } } else G.unloadAll(u); }", "fn: () => G.unloadCargo(u, c)"]]);
// ---------------- index.html ----------------
edit('index.html', [
  ['<script src="js/abilities.js"></script>\n<script src="js/ai.js"></script>', '<script src="js/abilities.js"></script>\n<script src="js/commands.js"></script>\n<script src="js/ai.js"></script>'],
]);
console.log('patched');
