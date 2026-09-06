// Harness-side "human": UI-level actions + invariant/stuck checks. Loaded into the game VM by playtest.js.
Render.reset = () => {}; Render.frame = () => {}; UI.ping = () => {}; UI.mode = 'play'; Render.W = 1280; Render.H = 720; Render.viewW = 1280; Render.viewH = 524;
const R = { s: 12345, next() { let s = this.s; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; this.s = s; return s / 4294967296; } }; // harness-only rng
const Bot = {
  errors: [], issues: [], actions: 0, quietLog: false, log(t) { if (!this.quietLog) console.log('f' + G.frame + ' ' + t); },
  p() { return G.players[G.human]; }, en() { return G.players.find(q => q.id !== G.human); },
  mine(pred) { return G.units.filter(u => u.alive && u.owner === G.human && !u.inside && (!pred || pred(u))); },
  act(name, fn) { this.actions++; try { return fn(); } catch (e) { this.errors.push('ACTION ' + name + ': ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); return null; } },
  select(units, add) { return this.act('select', () => { UI.select(units, add); return UI.selection.slice(); }); },
  rclick(x, y, shift) { return this.act('rclick', () => { const t = UI.unitAt(x, y); UI.smartCommand(t, x, y, shift); }); },
  rclickOn(t, shift) { return this.act('rclickOn', () => UI.smartCommand(t, t.x, t.y, shift)); },
  key(k, mods = {}) { return this.act('key ' + k, () => { UI.buildCard(); UI.onKey({ key: k, preventDefault() { }, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift }); }); },
  button(label) { return this.act('button ' + label, () => { const bs = UI.buildCard(); const b = bs.find(b => b.label === label) || bs.find(b => b.label.startsWith(label)); if (!b) return false; if (b.enabled === false) return false; b.fn(); return true; }); },
  lclick(x, y, shift) { return this.act('lclick', () => { if (UI.placing) { UI.placing.tx = Math.floor(x / TILE - UI.placing.def.w / 2 + .5); UI.placing.ty = Math.floor(y / TILE - UI.placing.def.h / 2 + .5); UI.confirmPlacement(shift); return; } if (UI.pending) { UI.execPending(UI.unitAt(x, y), x, y, shift); return; } const t = UI.unitAt(x, y); if (t) UI.select([t], shift); else if (!shift) UI.selection = []; }); },
  lclickOn(t, shift) { return this.lclick(t.x, t.y, shift); },
  esc() { return this.key('Escape'); },
  chat(line) { return this.act('chat', () => { UI.onKey({ key: 'Enter', preventDefault() { } }); for (const ch of line) UI.onKey({ key: ch, preventDefault() { } }); UI.onKey({ key: 'Enter', preventDefault() { } }); }); },
  group(n, units) { this.select(units); this.key(String(n), { ctrl: true }); },
  pick(arr) { return arr.length ? arr[Math.floor(R.next() * arr.length)] : null; },
  // ----- placement helper (harness side, no sim rng) -----
  findSpot(def, cx, cy, rmin = 3) { const m = G.map, p = this.p(); for (let r = rmin; r < 22; r++) for (let k = 0; k < 20; k++) { const ang = (k / 20) * Math.PI * 2 + r * 0.4; const tx = Math.round(cx + Math.cos(ang) * r - def.w / 2), ty = Math.round(cy + Math.sin(ang) * r * 0.8 - def.h / 2); if (m.canPlace(def, tx, ty, p, G.units, null)) continue; let near = false; for (const rs of m.resources) if (tx < rs.x + rs.w + 3 && tx + def.w > rs.x - 3 && ty < rs.y + rs.h + 3 && ty + def.h > rs.y - 3) near = true; if (near) continue; let ok = true; for (let y = ty - 1; y <= ty + def.h && ok; y++) for (let x = tx - 1; x <= tx + def.w && ok; x++) { if (x >= tx && x < tx + def.w && y >= ty && y < ty + def.h) continue; if (!m.walkable(x, y)) ok = false; } if (ok && def.race === 'T' && (def.addons || []).length) for (let y = ty + def.h - 2; y < ty + def.h && ok; y++) for (let x = tx + def.w; x < tx + def.w + 3; x++) if (!m.walkable(x, y)) ok = false; if (ok) return [tx, ty]; } return null; },
  hall() { return this.mine(u => u.isBuilding && u.def.depot && u.done)[0] || this.mine(u => u.isBuilding && u.def.depot)[0]; },
  worker(pred) { const ws = this.mine(u => u.def.worker && (u.order.type === 'gather' || u.order.type === 'idle' || u.order.type === 'return') && !(u.order.type === 'gather' && u.order.target && u.order.target.type === 'gas') && (!pred || pred(u))); ws.sort((a, b) => (a.carrying ? 1 : 0) - (b.carrying ? 1 : 0)); return ws[0]; },
  count(id) { let n = 0; for (const u of G.units) { if (!u.alive || u.owner !== G.human) continue; if (u.def.id === id) n++; for (const it of u.prod) if (it.id === id) n++; if (u.order.type === 'build' && u.order.def.id === id) n++; for (const q of u.queue) if (q.type === 'build' && q.def.id === id) n++; } return n; },
  has(id) { return this.p().hasBuilding(id); },
  // Build a structure through the worker's command card, exactly as a player would.
  build(id, near, opts = {}) {
    const def = DATA.buildings[id], p = this.p(); if (!def) return false; if (!p.hasReq(def) || p.minerals < def.min || p.gas < def.gas) return false;
    let tx, ty;
    if (def.onGeyser) { const h = this.hall(); const g = G.map.resources.filter(r => r.type === 'geyser' && r.amount > 0 && !(r.building && r.building.alive)).sort((a, b) => distPt(a.cx, a.cy, h.x, h.y) - distPt(b.cx, b.cy, h.x, h.y))[0]; if (!g) return false; tx = g.x; ty = g.y; }
    else if (def.depot && opts.expand) { const b = this.expansion(); if (!b) return false; tx = b.x; ty = b.y; }
    else { const c = near || this.hall(); if (!c) return false; const s = this.findSpot(def, Math.floor(c.x / TILE), Math.floor(c.y / TILE), def.race === 'Z' ? 4 : 2); if (!s) return false; [tx, ty] = s; }
    const w = opts.worker || this.worker(); if (!w) return false;
    this.select([w]); const menu = def.tier === 'adv' ? 'Build Advanced' : 'Build'; if (!this.button(menu)) return false;
    if (opts.hotkey) { this.key(def.hk); } else if (!this.button(def.name)) { this.esc(); return false; }
    if (!UI.placing) { this.issues.push('no placement mode for ' + id); this.esc(); return false; }
    this.lclick((tx + def.w / 2) * TILE, (ty + def.h / 2) * TILE, !!opts.shift); if (opts.shift) this.esc();
    const ok = w.order.type === 'build' || w.queue.some(q => q.type === 'build'); if (ok) this.log('build ' + id + ' at ' + tx + ',' + ty); else this.esc(); return ok;
  },
  expansion() { const p = this.p(); let best = null, bd = 1e9; for (const b of G.map.bases) { if (b.minerals.every(m => m.amount <= 0)) continue; if (G.units.some(u => u.alive && u.isBuilding && u.def.depot && distPt(u.x, u.y, b.cx, b.cy) < 6 * TILE)) continue; if (G.units.some(u => u.alive && u.owner !== G.human && (u.isBuilding || u.hasWeapon()) && distPt(u.x, u.y, b.cx, b.cy) < 14 * TILE)) continue; const d = distPt(p.startX, p.startY, b.cx, b.cy); if (d < bd) { bd = d; best = b; } } return best; },
  saveFor: null, // [min, gas] the script is saving up for (next build-order item)
  reserved() { let m = this.saveFor ? this.saveFor[0] : 0, g = this.saveFor ? this.saveFor[1] : 0; for (const u of this.mine(u => u.def.worker)) { const os = [u.order].concat(u.queue); for (const o of os) if (o.type === 'build' && o.def) { m += o.def.min; g += o.def.gas; } } return [m, g]; },
  train(bid, uid, maxQ = 2, useKey = true) { const bs = this.mine(u => u.isBuilding && u.done && !u.lifted && u.def.id === bid && u.prod.length < maxQ && !(u.addon && !u.addon.done)); if (!bs.length) return false; const b = bs.sort((a, c) => a.prod.length - c.prod.length)[0]; const ud = DATA.units[uid]; const p = this.p(); const [rm, rg] = this.reserved(); if (p.minerals - rm < ud.min || p.gas - rg < ud.gas) return false; const n = b.prod.length; this.select([b]); if (useKey) this.key(ud.hk); else this.button(ud.name); return b.prod.length > n; },
  larva(uid, useKey = true) { const ls = this.mine(u => u.def.larva); if (!ls.length) return false; const ud = DATA.units[uid]; const p = this.p(); const [rm, rg] = this.reserved(); if (p.minerals - rm < ud.min || p.gas - rg < ud.gas) return false; this.select(ls); const before = this.mine(u => u.def.egg).length; if (useKey) this.key(ud.hk); else this.button(ud.name); return this.mine(u => u.def.egg).length > before; },
  research(bid, id) { const b = this.mine(u => u.isBuilding && u.done && !u.lifted && u.def.id === bid && !u.prod.length)[0]; if (!b) return false; const p = this.p(); const ud = DATA.upgrades[id], td = DATA.techs[id]; if (td && (p.tech.has(id) || p.researching.has(id))) return false; if (ud && (p.researching.has(id) || p.upgLevel(id) >= 3)) return false; this.select([b]); const n = b.prod.length; this.key((td || ud).hk); return b.prod.length > n; },
  addon(bid, aid) { const b = this.mine(u => u.isBuilding && u.done && !u.lifted && u.def.id === bid && !u.addon && !u.prod.length)[0]; if (!b) return false; this.select([b]); this.key(DATA.buildings[aid].hk); return !!b.addon; },
  morph(bid, toId) { const b = this.mine(u => u.isBuilding && u.done && u.def.id === bid && !u.prod.length)[0]; if (!b) return false; this.select([b]); this.key(DATA.buildings[toId].hk); return b.prod.length > 0; },
  gasWorkers(n) { const gs = this.mine(u => u.def.onGeyser && u.done && u.geyser.amount > 0); for (const g of gs) { const on = this.mine(u => u.def.worker && ((u.order.type === 'gather' && u.order.target === g) || (u.order.type === 'return' && u.order.then === g))); for (let i = on.length; i < n; i++) { const w = this.worker(u => dist(u, g) < 20 * TILE); if (!w) break; this.select([w]); this.rclickOn(g); } } },
  idleWorkersMine() { for (const w of this.mine(u => u.def.worker && u.order.type === 'idle' && !u.carrying)) { const m = G.findNearestResource(w, 'mineral'); if (m) { this.select([w]); this.rclick(m.cx, m.cy); } } },
  army() { return this.mine(u => !u.isBuilding && !u.def.worker && !u.def.larva && !u.def.egg && !u.def.notUnit && u.hasWeapon() && !u.def.mine); },
  enemyTarget() { const e = this.en(); const bs = G.units.filter(u => u.alive && u.owner === e.id && u.isBuilding && u.def.tier !== 'addon'); if (!bs.length) return null; const p = this.p(); return bs.sort((a, b) => distPt(a.x, a.y, p.startX, p.startY) - distPt(b.x, b.y, p.startX, p.startY))[0]; },
  // base under attack: send the army there (returns true while defending)
  defend(army) { const hit = this.mine(u => (u.isBuilding || u.def.worker) && G.frame - u.lastHit < 72 && u.lastHitBy && u.lastHitBy.owner !== G.human && !G.allied(u.lastHitBy.owner, G.human))[0]; if (!hit) { if (this.defending && G.frame - this.defending > 24 * 20) this.defending = 0; return !!this.defending; } this.defending = G.frame; const far = army.filter(u => u.order.type !== 'attack' && distPt(u.x, u.y, hit.x, hit.y) > 6 * TILE && !u.sieged && !u.burrowed); if (far.length) { this.attackMove(far.slice(0, 12), hit.x, hit.y); if (far.length > 12) this.attackMove(far.slice(12, 24), hit.x, hit.y); } return true; },
  attackMove(units, x, y, shift) { if (!units.length) return; this.select(units); this.key('a'); this.lclick(x, y, shift); },
  move(units, x, y, shift) { if (!units.length) return; this.select(units); this.rclick(x, y, shift); },
  ability(u, id, target, x, y) { const ab = DATA.abilities[id]; if (!ab) return false; this.select([u]); const bs = UI.buildCard(); const b = bs.find(b => b.label === Abilities.label(u, id)); if (!b) return false; b.fn(); if (ab.kind === 'unit' || ab.kind === 'point') { if (!UI.pending) return false; if (target) this.lclickOn(target); else this.lclick(x, y); } return true; },
};
// ---------------- invariant / stuck checks ----------------
const Check = {
  last: new Map(), stuckSeen: new Set(),
  goalOf(u) { const o = u.order; switch (o.type) { case 'move': case 'attackmove': case 'patrol': case 'unload': return o.target && o.target.alive && o.type !== 'unload' ? [o.target.x, o.target.y] : [o.x, o.y]; case 'follow': case 'load': case 'pickup': case 'attack': return o.target && o.target.alive ? [o.target.x, o.target.y] : null; case 'gather': return o.phase === 'goto' && o.target ? [o.target.cx !== undefined ? o.target.cx : o.target.x, o.target.cy !== undefined ? o.target.cy : o.target.y] : null; case 'return': return o.depot ? [o.depot.x, o.depot.y] : null; case 'build': return [(o.tx + o.def.w / 2) * TILE, (o.ty + o.def.h / 2) * TILE]; case 'construct': case 'repair': case 'nydus': return o.target ? [o.target.x, o.target.y] : null; case 'land': return [(o.tx + u.def.w / 2) * TILE, (o.ty + u.def.h / 2) * TILE]; case 'ability': return o.phase === 'channel' ? null : o.target ? [o.target.x, o.target.y] : (o.x !== undefined ? [o.x, o.y] : null); } return null; },
  around(u) { const m = G.map, cx = Math.floor(u.x / TILE), cy = Math.floor(u.y / TILE); const rows = []; for (let y = cy - 4; y <= cy + 4; y++) { let r = ''; for (let x = cx - 4; x <= cx + 4; x++) { if (x === cx && y === cy) r += 'U'; else if (!m.inb(x, y)) r += ' '; else if (!m.walk[m.idx(x, y)]) r += '#'; else { const b = m.blocked[m.idx(x, y)]; r += b === -1 ? '.' : b === -2 ? 'm' : b === -3 ? 'g' : 'B'; } } rows.push(r); } return rows.join('/'); },
  run(out) {
    const f = G.frame;
    for (const u of G.units) {
      if (!u.alive) continue;
      if (!isFinite(u.x) || !isFinite(u.y) || !isFinite(u.hp)) out.push('NaN state ' + u.def.id + '#' + u.id);
      if (!u.inside && !u.isBuilding && (u.x < 0 || u.y < 0 || u.x > G.map.w * TILE || u.y > G.map.h * TILE)) out.push('off-map ' + u.def.id + '#' + u.id + ' ' + Math.round(u.x) + ',' + Math.round(u.y));
      if (u.inside && !u.inside.def.onGeyser && (!u.inside.alive || !u.inside.cargo.includes(u))) out.push('inside-orphan ' + u.def.id + '#' + u.id);
      for (const c of u.cargo) if (c.inside !== u || !c.alive) out.push('cargo-mismatch ' + u.def.id + '#' + u.id + ' holds ' + c.def.id + '#' + c.id);
      if (u.def.larva && u.hatch && !u.hatch.larvae.includes(u)) out.push('larva not listed by hatch #' + u.id);
      if (u.owner !== G.human || u.inside) continue;
      // ground unit standing inside a building footprint
      if (!u.isBuilding && !u.fly && !u.burrowed && !u.def.larva) { const b = G.map.blocked[G.map.idx(Math.floor(u.x / TILE), Math.floor(u.y / TILE))]; if (b >= 0) { const bb = G.byId.get(b); if (bb && bb.alive && bb.isBuilding && !bb.lifted) { const key = 'in-footprint:' + u.def.id + '#' + u.id; if (!this.stuckSeen.has(key)) { this.stuckSeen.add(key); out.push('unit inside footprint ' + u.def.id + '#' + u.id + ' in ' + bb.def.id + ' (' + u.order.type + ')'); } } } }
      // stuck: movement order, far from goal, no displacement for 10 s
      const g = this.goalOf(u); const rec = this.last.get(u.id) || { x: u.x, y: u.y, f, type: u.order.type, far: f };
      const moved = distPt(u.x, u.y, rec.x, rec.y) > 6 || rec.type !== u.order.type;
      if (moved) { rec.x = u.x; rec.y = u.y; rec.f = f; rec.type = u.order.type; }
      const farNow = g && distPt(u.x, u.y, g[0], g[1]) > 3 * TILE + (u.order.type === 'follow' && u.order.target ? u.r + u.order.target.r : 0); if (!farNow) rec.far = f; // the goal must have been out of reach for the whole window
      const crowd = u.order.type === 'attack' && u.order.target && u.order.target.isBuilding && G.near(u.x, u.y, 96).filter(o => o.owner === u.owner && !o.isBuilding && o !== u).length >= 4; // waiting behind allies around a building
      this.last.set(u.id, rec);
      if (g && !moved && !crowd && f - rec.f > ((u.order.type === 'attack' || u.order.type === 'attackmove' || u.order.type === 'patrol') ? 600 : 240) && f - rec.far > 240 && farNow && !u.disabled && !(u.sieged) && !(u.isBuilding && !u.lifted) && !(u.order.target && u.order.target.def && u.inRange(u.order.target)) && !(u.order.type === 'gather' && u.order.phase !== 'goto')) {
        const key = u.id + ':' + u.order.type; if (!this.stuckSeen.has(key)) { this.stuckSeen.add(key); out.push('STUCK ' + u.def.id + '#' + u.id + ' order ' + u.order.type + ' at ' + Math.round(u.x) + ',' + Math.round(u.y) + ' goal ' + Math.round(g[0]) + ',' + Math.round(g[1]) + ' stuck=' + u.stuck + ' path=' + (u.path ? u.path.length + '/' + u.pathI : 'none') + (u.order.target ? ' tgt=' + (u.order.target.def ? u.order.target.def.id : u.order.target.type) : '') + ' map=' + this.around(u)); }
      }
    }
    const p = G.players[G.human]; if (p.minerals < -0.01 || p.gas < -0.01) out.push('negative resources ' + p.minerals + '/' + p.gas);
    let used = 0; for (const u of G.units) { if (!u.alive || u.owner !== G.human || u.def.notUnit) continue; if (!u.isBuilding) used += u.def.sup || 0; for (const it of u.prod) if (it.kind === 'unit' && !it.reserved) { const ud = DATA.units[it.id]; if (!ud.notUnit) used += (ud.sup || 0) * (ud.pair ? 2 : 1); } if (u.def.egg && u.prod[0]) { const ud = DATA.units[u.prod[0].id]; used += (ud.sup || 0) * (ud.pair ? 2 : 1); } }
    if (Math.abs(used - p.supUsed) > 0.01 && G.frame % 8 === 0) out.push('supply mismatch computed ' + used + ' stored ' + p.supUsed);
  },
};
this.Bot = Bot; this.Check = Check; this.R = R;
