'use strict';
// ============================================================================
// Deterministic RNG, command interception/recording, replay + save/load.
// Every player action that touches the simulation is captured as a plain
// command object; replays and network play re-apply those at the same frame.
// ============================================================================
const RNG = { s: 1, seed(v) { this.s = (v >>> 0) || 1; }, next() { let s = this.s; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; this.s = s; return s / 4294967296; } };
G.rand = () => RNG.next();
G.inTick = false; G.applying = false; G.recording = false; G.log = []; G.pendingCmds = null; G.cheats = {};

const CMD = {
  ref(x) { if (!x) return null; if (x.def) return 'u' + x.id; if (x.type === 'mineral' || x.type === 'geyser') return 'r' + x.id; return null; },
  deref(s) { if (!s) return null; if (s[0] === 'u') return G.byId.get(+s.slice(1)) || null; if (s[0] === 'r') return G.map.resById.get(+s.slice(1)) || null; return null; },
  packOrder(o) { const p = { type: o.type }; for (const k of ['x', 'y', 'tx', 'ty', 'phase', 'unit', 'abil']) if (o[k] !== undefined) p[k] = o[k]; if (o.target) p.tg = this.ref(o.target); if (o.then) p.then = this.ref(o.then); if (o.depot) p.depot = this.ref(o.depot); if (o.partner) p.partner = this.ref(o.partner); if (o.def) p.def = o.def.id; return p; },
  unpackOrder(p) { const o = { type: p.type }; for (const k of ['x', 'y', 'tx', 'ty', 'phase', 'unit', 'abil']) if (p[k] !== undefined) o[k] = p[k]; if (p.tg) o.target = this.deref(p.tg); if (p.then) o.then = this.deref(p.then); if (p.depot) o.depot = this.deref(p.depot); if (p.partner) o.partner = this.deref(p.partner); if (p.def) o.def = DATA.buildings[p.def]; return o; },
  ids(units) { return units.map(u => u.id); },
  units(ids, p) { const out = []; for (const id of ids) { const u = G.byId.get(id); if (u && u.alive && (p === undefined || u.owner === p || G.allied(u.owner, p))) out.push(u); } return out; },
  // -------- dispatcher: applies a command with original (unwrapped) functions --------
  apply(c) {
    const O = CMD.orig; const own = c.p;
    switch (c.t) {
      case 'order': { const o = this.unpackOrder(c.o); if (o.type === 'build' && !o.def) return false; if (o.type !== 'idle' && o.type !== 'hold' && o.type !== 'move' && o.type !== 'attackmove' && o.type !== 'patrol' && o.type !== 'unload' && o.type !== 'land' && !o.target && !o.def && !o.then && o.type !== 'return') return false; let ok = false; for (const u of this.units(c.u, own)) { O.setOrder.call(u, o, c.s); ok = true; } return ok; }
      case 'stop': for (const u of this.units(c.u, own)) O.stop.call(u); return true;
      case 'train': { const b = G.byId.get(c.b); return b && b.owner === own ? O.queueUnit.call(G, b, c.id) : false; }
      case 'larva': { const l = G.byId.get(c.b); return l && l.owner === own ? O.larvaMorph.call(G, l, c.id) : false; }
      case 'upg': { const b = G.byId.get(c.b); return b && b.owner === own ? O.queueUpgrade.call(G, b, c.id) : false; }
      case 'tech': { const b = G.byId.get(c.b); return b && b.owner === own ? O.queueTech.call(G, b, c.id) : false; }
      case 'addon': { const b = G.byId.get(c.b); return b && b.owner === own ? O.queueAddon.call(G, b, c.id) : false; }
      case 'morphB': { const b = G.byId.get(c.b); return b && b.owner === own ? O.queueMorph.call(G, b, c.id) : false; }
      case 'cancel': { const b = G.byId.get(c.b); if (b && b.owner === own) O.cancelProd.call(G, b, c.i); return true; }
      case 'cancelB': { const b = G.byId.get(c.b); if (b && b.owner === own) O.cancelBuilding.call(G, b); return true; }
      case 'rally': { const b = G.byId.get(c.b); if (b && b.owner === own) O.setRally.call(G, b, c.x, c.y, this.deref(c.tg)); return true; }
      case 'lift': { const b = G.byId.get(c.b); if (b && b.owner === own) O.liftBuilding.call(G, b); return true; }
      case 'unloadAll': { const b = G.byId.get(c.b); if (b && b.owner === own) O.unloadAll.call(G, b); return true; }
      case 'unloadCargo': { const b = G.byId.get(c.b), u = G.byId.get(c.c); if (b && b.owner === own && u) O.unloadCargo.call(G, b, u); return true; }
      case 'ability': { let ok = false; const tg = this.deref(c.tg); for (const u of this.units(c.u, own)) if (O.issue.call(Abilities, u, c.a, tg, c.x, c.y, c.s)) ok = true; return ok; }
      case 'merge': return O.merge.call(Abilities, this.units(c.u, own), c.a);
      case 'cheat': return O.cheat.call(G, c.code, own);
      case 'stopall': for (const u of G.units) if (u.alive && u.owner === own && (!u.isBuilding || u.lifted)) O.stop.call(u); return true; // a dropped player's units stand down
    }
    return false;
  },
  // -------- packers for intercepted calls --------
  pack: {
    setOrder: (u, o, shift) => ({ t: 'order', u: [u.id], o: CMD.packOrder(o), s: !!shift }),
    stop: u => ({ t: 'stop', u: [u.id] }),
    queueUnit: (g, b, id) => ({ t: 'train', b: b.id, id }),
    larvaMorph: (g, l, id) => ({ t: 'larva', b: l.id, id }),
    queueUpgrade: (g, b, id) => ({ t: 'upg', b: b.id, id }),
    queueTech: (g, b, id) => ({ t: 'tech', b: b.id, id }),
    queueAddon: (g, b, id) => ({ t: 'addon', b: b.id, id }),
    queueMorph: (g, b, id) => ({ t: 'morphB', b: b.id, id }),
    cancelProd: (g, b, i) => ({ t: 'cancel', b: b.id, i }),
    cancelBuilding: (g, b) => ({ t: 'cancelB', b: b.id }),
    setRally: (g, b, x, y, tg) => ({ t: 'rally', b: b.id, x, y, tg: CMD.ref(tg) }),
    liftBuilding: (g, b) => ({ t: 'lift', b: b.id }),
    unloadAll: (g, b) => ({ t: 'unloadAll', b: b.id }),
    unloadCargo: (g, b, c) => ({ t: 'unloadCargo', b: b.id, c: c.id }),
    issue: (a, u, id, tg, x, y, shift) => ({ t: 'ability', u: [u.id], a: id, tg: CMD.ref(tg), x, y, s: !!shift }),
    merge: (a, units, id) => ({ t: 'merge', u: CMD.ids(units), a: id }),
    cheat: (g, code) => ({ t: 'cheat', code }),
  },
  orig: {},
  install() {
    const wrap = (obj, name, packName) => {
      const orig = obj[name]; CMD.orig[packName] = orig;
      obj[name] = function (...args) {
        if (G.inTick || G.applying) return orig.apply(this, args);
        if (typeof UI !== 'undefined' && UI.mode === 'replay') return false;
        const c = CMD.pack[packName](this, ...args); c.p = G.human;
        if (typeof Net !== 'undefined' && Net.active) { Net.queue(c); return true; }
        return G.exec(c);
      };
    };
    wrap(Unit.prototype, 'setOrder', 'setOrder'); wrap(Unit.prototype, 'stop', 'stop');
    for (const n of ['queueUnit', 'larvaMorph', 'queueUpgrade', 'queueTech', 'queueAddon', 'queueMorph', 'cancelProd', 'cancelBuilding', 'setRally', 'liftBuilding', 'unloadAll', 'unloadCargo', 'cheat']) wrap(G, n, n);
    wrap(Abilities, 'issue', 'issue'); wrap(Abilities, 'merge', 'merge');
  },
};
// Deterministic digest of the simulation state (lockstep desync detection, tests).
G.stateHash = function () {
  let h = 0x811c9dc5 | 0; const mix = v => { h = Math.imul(h ^ (v | 0), 16777619); }; const str = s => { for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); };
  mix(this.frame); mix(RNG.s);
  for (const u of this.units) { if (!u.alive) continue; mix(u.id); mix(u.owner); str(u.def.id); mix(Math.round(u.x * 16)); mix(Math.round(u.y * 16)); mix(Math.round(u.hp * 16)); mix(Math.round(u.sh * 16)); mix(Math.round(u.energy * 16)); str(u.order.type); mix(u.cooldown); mix(u.prod.length); mix(u.cargo.length); }
  for (const p of this.players) { mix(Math.round(p.minerals)); mix(Math.round(p.gas)); mix(Math.round(p.supUsed * 2)); mix(p.supMax); mix(p.tech.size); mix(p.defeated ? 1 : 0); }
  mix(this.fields.length); mix(this.projectiles.length);
  return h >>> 0;
};
// Execute a command now (records it when recording). Used for local play, replay playback and network delivery.
G.exec = function (c) { if (this.recording) this.log.push({ f: this.frame, c }); this.applying = true; try { return CMD.apply(c); } finally { this.applying = false; } };
G.unloadCargo = function (b, c) { const k = b.cargo.indexOf(c); if (k < 0) return; if (b.isBuilding) { b.cargo.splice(k, 1); b.cargo.unshift(c); this.unloadOne(b); } else this.unloadAll(b); };
// Cheat codes (single player only)
G.cheat = function (code, p) {
  const pl = this.players[p]; if (!pl) return false; const c = code.trim().toLowerCase(); const ch = this.cheats;
  const say = t => pl.msg(t, 'info');
  switch (c) {
    case 'show me the money': pl.minerals += 10000; pl.gas += 10000; say('Cheat enabled.'); return true;
    case 'whats mine is mine': pl.minerals += 500; say('Cheat enabled.'); return true;
    case 'breathe deep': pl.gas += 500; say('Cheat enabled.'); return true;
    case 'black sheep wall': ch.reveal = !ch.reveal; say('Cheat ' + (ch.reveal ? 'enabled' : 'disabled') + '.'); return true;
    case 'war aint what it used to be': ch.nofog = !ch.nofog; say('Cheat ' + (ch.nofog ? 'enabled' : 'disabled') + '.'); return true;
    case 'operation cwal': ch.cwal = !ch.cwal; say('Cheat ' + (ch.cwal ? 'enabled' : 'disabled') + '.'); return true;
    case 'power overwhelming': ch.god = !ch.god; say('Cheat ' + (ch.god ? 'enabled' : 'disabled') + '.'); return true;
    case 'food for thought': ch.food = !ch.food; say('Cheat ' + (ch.food ? 'enabled' : 'disabled') + '.'); return true;
    case 'the gathering': ch.energy = !ch.energy; say('Cheat ' + (ch.energy ? 'enabled' : 'disabled') + '.'); return true;
    case 'modify the phase variance': ch.noreq = !ch.noreq; say('Cheat ' + (ch.noreq ? 'enabled' : 'disabled') + '.'); return true;
    case 'staying alive': ch.alive = !ch.alive; say('Cheat ' + (ch.alive ? 'enabled' : 'disabled') + '.'); return true;
    case 'medieval man': for (const t of Object.keys(DATA.techs)) pl.tech.add(t); say('Cheat enabled.'); return true;
    case 'something for nothing': for (const u of Object.keys(DATA.upgrades)) pl.upg[u] = 3; say('Cheat enabled.'); return true;
    case 'there is no cow level': for (const q of this.players) if (q.id !== p && !this.allied(p, q.id)) { q.defeated = true; for (const u of this.units) if (u.alive && u.owner === q.id) this.kill(u, null, true); } this.checkVictory(); return true;
    case 'game over man': pl.defeated = true; for (const u of this.units) if (u.alive && u.owner === p) this.kill(u, null, true); this.checkVictory(); return true;
  }
  return false;
};

// ============================================================================
// Replay / save-game: seed + settings + command log; loading re-simulates.
// ============================================================================
const Replay = {
  data() { return { ver: 2, seed: G.seed, layout: G.layout, players: G.setup.players, human: G.human, cmds: G.log.slice(), frame: G.frame, cam: { x: Render.camX, y: Render.camY }, mission: G.setup.mission || null }; },
  download(obj, name) { const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); },
  save(toFile = true) { if (UI.mode !== 'play' || (typeof Net !== 'undefined' && Net.active)) return; const d = this.data(); try { localStorage.setItem('bw_save', JSON.stringify(d)); } catch (e) { } if (toFile) this.download(d, 'broodwar-save-' + Math.floor(G.frame / TPS) + 's.json'); G.players[G.human].msg('Game saved.', 'info'); },
  saveReplay() { const d = this.data(); this.download(d, 'broodwar-replay-' + Date.now() + '.json'); },
  hasAutosave() { try { return !!localStorage.getItem('bw_save'); } catch (e) { return false; } },
  loadAutosave() { try { const d = JSON.parse(localStorage.getItem('bw_save')); if (d) UI.startFromLog(d, 'load'); } catch (e) { console.error(e); } },
  fromFile(file, mode) { const r = new FileReader(); r.onload = () => { try { UI.startFromLog(JSON.parse(r.result), mode); } catch (e) { alert('Could not read that file: ' + e.message); } }; r.readAsText(file); },
  // apply all logged commands scheduled for the current frame
  applyPending() { const q = G.pendingCmds; if (!q) return; while (q.i < q.list.length && q.list[q.i].f <= G.frame) { const e = q.list[q.i++]; G.applying = true; try { CMD.apply(e.c); } finally { G.applying = false; } if (G.recording) G.log.push({ f: G.frame, c: e.c }); } },
};

CMD.install();
