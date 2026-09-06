'use strict';
// ============================================================================
// Renderer: composes terrain chunks, creep, decals, sprites, effects, fog.
// ============================================================================
const Render = {
  canvas: null, ctx: null, W: 0, H: 0, camX: 0, camY: 0, viewW: 0, viewH: 0, fogCanvas: null, creepMask: null, creepLayer: null, built: false, lastFrameTime: 0, mini: null,
  init(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.resize(); },
  resize() { this.W = this.canvas.width = Math.max(1, window.innerWidth); this.H = this.canvas.height = Math.max(1, window.innerHeight); this.viewW = this.W; this.viewH = Math.max(1, this.H - UI.consoleH); this.creepLayer = null; }, // a hidden or unlaid-out canvas reports 0 and every drawImage of it throws
  reset() { Terrain.reset(G.map.seed); Sprites.clear(); FX.reset(); this.built = false; },
  buildStatic() {
    const m = G.map; this.fogCanvas = document.createElement('canvas'); this.fogCanvas.width = m.w; this.fogCanvas.height = m.h; this.fogImg = null; this.creepBounds = undefined;
    this.creepMask = document.createElement('canvas'); this.creepMask.width = m.w * 2; this.creepMask.height = m.h * 2;
    this.mini = Terrain.buildMini(); this.built = true; this.creepFrame = -1;
  },
  drawCreepMask() {
    const m = G.map, c = this.creepMask.getContext('2d'); c.clearRect(0, 0, m.w * 2, m.h * 2); c.fillStyle = '#fff';
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) if (m.creep[m.idx(tx, ty)]) { c.fillRect(tx * 2 - 1, ty * 2 - 1, 4, 4); if (tx < x0) x0 = tx; if (tx > x1) x1 = tx; if (ty < y0) y0 = ty; if (ty > y1) y1 = ty; }
    this.creepBounds = x1 < x0 ? null : { x0: x0 * TILE, y0: y0 * TILE, x1: (x1 + 1) * TILE, y1: (y1 + 1) * TILE }; // so a creep-free view can skip the whole pass
  },
  drawCreep(ctx) {
    if (!this.creepLayer || this.creepLayer.width !== this.viewW || this.creepLayer.height !== this.viewH) { this.creepLayer = document.createElement('canvas'); this.creepLayer.width = this.viewW; this.creepLayer.height = this.viewH; }
    if (this.creepFrame !== G.frame && (G.frame % 12 === 0 || this.creepBounds === undefined)) { this.drawCreepMask(); this.creepFrame = G.frame; }
    const b = this.creepBounds; if (b === null) return; // no creep anywhere
    if (b && (b.x1 < this.camX || b.x0 > this.camX + this.viewW || b.y1 < this.camY || b.y0 > this.camY + this.viewH)) return; // none of it on screen
    const l = this.creepLayer.getContext('2d'); l.clearRect(0, 0, this.viewW, this.viewH);
    l.imageSmoothingEnabled = true; l.drawImage(this.creepMask, this.camX / 16, this.camY / 16, this.viewW / 16, this.viewH / 16, 0, 0, this.viewW, this.viewH);
    l.globalCompositeOperation = 'source-in'; l.save(); l.translate(-this.camX % 192, -this.camY % 192); l.fillStyle = Terrain.creepPattern(l); l.fillRect(-192, -192, this.viewW + 384, this.viewH + 384); l.restore(); l.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.9; ctx.drawImage(this.creepLayer, 0, 0); ctx.globalAlpha = 1;
  },
  frame(alpha) {
    const ctx = this.ctx, m = G.map; if (!ctx || this.viewW < 1 || this.viewH < 1) return; if (!this.built) this.buildStatic();
    const now = performance.now(); const dt = Math.min(0.1, (now - (this.lastFrameTime || now)) / 1000); this.lastFrameTime = now; if (!G.paused && !UI.menu) FX.update(dt);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.viewW, this.viewH); ctx.clip();
    const cx = this.camX, cy = this.camY;
    Terrain.draw(ctx, cx, cy, this.viewW, this.viewH);
    this.drawCreep(ctx);
    ctx.translate(-cx, -cy);
    const hp = G.players[G.human]; const vis = UI.viewAll ? G.allVis() : hp.vis;
    const inView = (x, y, r) => x + r > cx && x - r < cx + this.viewW && y + r > cy && y - r < cy + this.viewH;
    const seen = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inb(tx, ty) && vis[ty * m.w + tx] > 0; };
    const visNow = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inb(tx, ty) && vis[ty * m.w + tx] === 2; };
    if (UI.placing && UI.placing.def.needsPsi) { const p = m.psi[G.human]; if (p) { ctx.fillStyle = 'rgba(80,140,255,0.13)'; for (let ty = Math.floor(cy / TILE); ty < (cy + this.viewH) / TILE; ty++) for (let tx = Math.floor(cx / TILE); tx < (cx + this.viewW) / TILE; tx++) if (m.inb(tx, ty) && p[m.idx(tx, ty)]) ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE); } }
    FX.drawDecals(ctx, inView, visNow);
    for (const r of m.resources) { if (!inView(r.cx, r.cy, 70) || !seen(r.cx, r.cy)) continue; this.drawResource(ctx, r); }
    for (const f of G.fields) { if (!inView(f.x, f.y, f.r * TILE + 40)) continue; if (f.kind !== 'storm' && f.kind !== 'nuke_target' && !visNow(f.x, f.y) && f.owner !== G.human) continue; FX.drawField(ctx, f, G.frame); }
    // collect visible units
    const list = [];
    for (const u of G.units) {
      if (!u.alive || u.inside) continue; const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha; if (!inView(x, y, u.r * 2 + 40)) continue;
      let canSee; if (u.owner === G.human) canSee = true; else if (u.isBuilding) canSee = seen(x, y); else canSee = visNow(x, y); if (!canSee) continue;
      if (u.owner !== G.human && u.isCloaked && !G.detected(u, G.human) && !UI.viewAll) { if (!visNow(x, y)) continue; u._alpha = 0.16; } else u._alpha = u.isCloaked ? 0.45 : 1;
      if (u.owner !== G.human && u.isBuilding && !visNow(x, y)) u._alpha = 0.75;
      u._x = x; u._y = y; list.push(u);
    }
    list.sort((a, b) => (a.fly - b.fly) || (b.isBuilding - a.isBuilding) || (a._y - b._y));
    // shadows
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const u of list) { if (u.isBuilding && !u.lifted) continue; if (u.burrowed) continue; const off = u.fly ? 1 : 0; ctx.globalAlpha = u._alpha * (u.fly ? 0.3 : 0.4); ctx.beginPath(); ctx.ellipse(u._x + (u.fly ? 14 : 3), u._y + (u.fly ? 26 : u.r * 0.35 + 2), u.r * 0.95, u.r * 0.45, 0, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const u of list) if (!u.fly) this.drawUnit(ctx, u);
    for (const u of list) if (u.fly) this.drawUnit(ctx, u);
    // projectiles
    for (const p of G.projectiles) { if (!inView(p.x, p.y, 10) || !visNow(p.x, p.y)) continue; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const col = p.kind === 'interceptor' ? '#cfe6ff' : p.kind === 'yamato' ? '#ff6a4a' : '#ffd060'; const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.kind === 'yamato' ? 14 : 7); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'yamato' ? 14 : 7, 0, 7); ctx.fill(); if (p.kind === 'interceptor') { ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill(); } ctx.restore(); }
    for (const e of G.effects) { if (!inView(e.x, e.y, 220)) continue; if (!visNow(e.x, e.y) && !(e.tx !== undefined && visNow(e.tx, e.ty)) && e.kind !== 'nuke') continue; FX.drawEffect(ctx, e); }
    FX.drawParticles(ctx);
    for (const u of UI.selection) { if (!u.alive || u.inside) continue; this.drawSelection(ctx, u, true); }
    if (UI.hover && UI.hover.alive && !UI.selection.includes(UI.hover)) this.drawSelection(ctx, UI.hover, false);
    for (const u of list) if (u.hp < u.maxHp && !UI.selection.includes(u) && (u.owner === G.human || G.frame - u.lastHit < 72)) this.drawBars(ctx, u);
    if (UI.selection.length === 1 && UI.selection[0].rally && UI.selection[0].owner === G.human) { const b = UI.selection[0], r = b.rally; const rx = r.target ? r.target.x : r.x, ry = r.target ? r.target.y : r.y; ctx.strokeStyle = 'rgba(80,255,80,0.6)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(rx, ry); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5f5'; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry - 16); ctx.lineTo(rx + 10, ry - 12); ctx.lineTo(rx, ry - 8); ctx.closePath(); ctx.fill(); }
    if (UI.placing) this.drawPlacement(ctx);
    this.drawFog(ctx, vis, cx, cy);
    for (const mk of UI.markers) { const a = mk.t / 20; ctx.strokeStyle = `rgba(${mk.color},${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(mk.x, mk.y, 5 + (20 - mk.t) * 0.7, (5 + (20 - mk.t) * 0.7) * 0.6, 0, 0, 7); ctx.stroke(); }
    ctx.restore();
    if (UI.drag && UI.dragging) { const d = UI.drag; ctx.strokeStyle = '#4f4'; ctx.lineWidth = 1; ctx.strokeRect(Math.min(d.x0, d.x1) + .5, Math.min(d.y0, d.y1) + .5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); }
  },
  drawFog(ctx, vis, cx, cy) {
    const m = G.map; const fc = this.fogCanvas.getContext('2d');
    if (!this.fogImg || this.fogImg.width !== m.w) this.fogImg = fc.createImageData(m.w, m.h); // one buffer for the whole game instead of one per frame
    const img = this.fogImg; const d = img.data;
    for (let i = 0; i < vis.length; i++) { const v = vis[i]; const o = i * 4; d[o] = 4; d[o + 1] = 6; d[o + 2] = 10; d[o + 3] = v === 2 ? 0 : v === 1 ? 140 : 255; }
    fc.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(this.fogCanvas, cx / TILE - 0.5, cy / TILE - 0.5, this.viewW / TILE, this.viewH / TILE, cx, cy, this.viewW, this.viewH); ctx.restore();
  },
  drawResource(ctx, r) {
    if (r.type === 'mineral') {
      const x0 = r.x * TILE, y0 = r.y * TILE; const rich = r.amount / 1500; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x0 + 32, y0 + 22, 30, 10, 0, 0, 7); ctx.fill();
      const n = rich > 0.5 ? 5 : rich > 0.2 ? 3 : 2;
      for (let k = 0; k < n; k++) { const x = x0 + 8 + k * 12 + (k % 2) * 3, y = y0 + 8 + (k % 2) * 7, hgt = 14 + (k % 3) * 4; const g = ctx.createLinearGradient(x, y - hgt, x + 12, y + 8); g.addColorStop(0, '#dff8ff'); g.addColorStop(0.4, '#5fd0ff'); g.addColorStop(1, '#1c6a9a'); ctx.fillStyle = g; ctx.strokeStyle = '#0b3a55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + 3, y - hgt); ctx.lineTo(x + 10, y - hgt * 0.7); ctx.lineTo(x + 13, y + 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(x + 3, y - hgt); ctx.lineTo(x + 5, y - hgt * 0.5); ctx.lineTo(x + 2, y); ctx.closePath(); ctx.fill(); }
    } else {
      ctx.fillStyle = '#4a4438'; ctx.strokeStyle = '#26221a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(r.cx, r.cy, 62, 30, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#2f3a2a'; ctx.beginPath(); ctx.ellipse(r.cx, r.cy, 44, 20, 0, 0, 7); ctx.fill();
      if (r.amount > 0) { const g = ctx.createRadialGradient(r.cx, r.cy, 2, r.cx, r.cy, 34); g.addColorStop(0, '#b6ff9a'); g.addColorStop(0.5, '#5ad06a'); g.addColorStop(1, '#2a5a30'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(r.cx, r.cy, 34, 15, 0, 0, 7); ctx.fill(); if (!r.building || !r.building.alive) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 3; k++) { const t = ((G.frame / 50) + k / 3) % 1; ctx.fillStyle = `rgba(160,255,140,${0.35 * (1 - t)})`; ctx.beginPath(); ctx.arc(r.cx + Math.sin(k * 2 + t * 6) * 10, r.cy - 6 - t * 40, 6 + t * 10, 0, 7); ctx.fill(); } ctx.restore(); } }
      else { ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.ellipse(r.cx, r.cy, 34, 15, 0, 0, 7); ctx.fill(); }
    }
  },
  drawUnit(ctx, u) {
    const x = u._x, y = u._y;
    if (u.isBuilding && !u.lifted) { this.drawBuilding(ctx, u); return; }
    ctx.save(); ctx.globalAlpha = u._alpha * (u.fx.stasis > 0 ? 0.6 : 1);
    if (u.burrowed && !u.def.mine) { ctx.fillStyle = 'rgba(60,30,70,0.7)'; ctx.beginPath(); ctx.ellipse(x, y, u.r, u.r * .55, 0, 0, 7); ctx.fill(); ctx.fillStyle = G.players[u.owner].color; ctx.fillRect(x - 3, y - 2, 6, 4); ctx.restore(); return; }
    if (u.def.mine) { ctx.globalAlpha *= u.burrowed ? 0.5 : 1; ctx.fillStyle = '#4a5058'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.fillStyle = (G.frame % 20 < 10) ? '#ff3030' : '#802020'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); ctx.restore(); return; }
    const s = Sprites.unit(u, Sprites.dirOf(u.facing), this.animOf(u));
    let bob = 0, sc = 1; if (u.moving && !u.fly && u.def.bio) bob = Math.sin(G.frame * 0.7 + u.id) * 1.2; if (u.fly) bob = Math.sin(G.frame * 0.08 + u.id) * 2; if (u.def.id === 'zergling' && u.moving) sc = 1 + Math.sin(G.frame * 0.9 + u.id) * 0.06;
    if (u.morphT > 0) { ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(G.frame * 0.3); }
    ctx.translate(x, y + bob); if (sc !== 1) ctx.scale(sc, 1 / sc);
    if (u.def.id === 'archon' || u.def.id === 'dark_archon') { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, 0, 2, 0, 0, u.r * 1.8); g.addColorStop(0, u.def.id === 'archon' ? 'rgba(120,200,255,0.6)' : 'rgba(200,80,255,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, u.r * 1.8 + Math.sin(G.frame * 0.3) * 3, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    Sprites.draw(ctx, s, 0, 0);
    if (u.halluc) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(100,180,255,0.25)'; ctx.beginPath(); ctx.arc(0, 0, u.r + 2, 0, 7); ctx.fill(); }
    ctx.restore();
    this.drawStatus(ctx, u, x, y);
  },
  animOf(u) {
    const id = u.def.id; const ATK_LEN = 10;
    if (u.lastFire !== undefined && G.frame - u.lastFire < ATK_LEN && !u.def.worker) return 'a' + Math.min(Sprites.ATK_FRAMES - 1, Math.floor((G.frame - u.lastFire) / ATK_LEN * Sprites.ATK_FRAMES));
    if (u.lastFire !== undefined && G.frame - u.lastFire < 6 && u.def.worker) return 'a' + Math.floor((G.frame - u.lastFire) / 6 * Sprites.ATK_FRAMES);
    if (ANIM_KIND.winged.has(id)) { const rate = id === 'overlord' ? 0.12 : id === 'cocoon' ? 0.08 : id === 'scourge' ? 0.9 : 0.45; return 'w' + (Math.floor(G.frame * rate + u.id) % Sprites.WALK_FRAMES); }
    if (ANIM_KIND.engine.has(id)) return 'w' + (Math.floor(G.frame * 0.3 + u.id) % Sprites.WALK_FRAMES);
    if (u.moving || (u.def.larva && (G.frame + u.id) % 90 < 30)) { const cycle = u.def.larva ? 30 : Math.max(20, u.r * 2.2); const d = u.def.larva ? G.frame : (u.walkDist || 0); return 'w' + (Math.floor((d / cycle) * Sprites.WALK_FRAMES) % Sprites.WALK_FRAMES); }
    // Idle loop, offset per unit so a group does not breathe in lockstep. Render-only: G.frame drives it,
    // nothing here feeds back into the simulation.
    return 'i' + (Math.floor(G.frame / 14 + u.id * 1.7) % Sprites.IDLE_FRAMES);
  },
  drawStatus(ctx, u, x, y) {
    const r = u.r;
    if (u.fx.stasis > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(140,200,255,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4); ctx.fillStyle = 'rgba(120,180,255,0.25)'; ctx.fillRect(x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4); ctx.restore(); }
    if (u.fx.lockdown > 0) { ctx.fillStyle = '#ff4040'; ctx.beginPath(); ctx.arc(x, y - r - 8, 3, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,80,80,0.6)'; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 7); ctx.stroke(); }
    if (u.fx.matrix) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 7); ctx.stroke(); ctx.restore(); }
    if (u.fx.irradiate > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(x, y, 1, x, y, r + 8); g.addColorStop(0, 'rgba(150,255,80,0.5)'); g.addColorStop(1, 'rgba(80,255,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r + 8 + (G.frame % 8), 0, 7); ctx.fill(); ctx.restore(); }
    if (u.fx.plague > 0) { ctx.fillStyle = 'rgba(255,120,0,0.6)'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + Math.sin(G.frame * 0.2 + k * 2) * r * .6, y - r - 4 - ((G.frame + k * 7) % 12), 2.5, 0, 7); ctx.fill(); } }
    if (u.fx.ensnare > 0) { ctx.fillStyle = 'rgba(120,255,120,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, r + 2, (r + 2) * .7, 0, 0, 7); ctx.fill(); }
    if (u.fx.maelstrom > 0) { ctx.strokeStyle = '#f4f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, G.frame * .2, G.frame * .2 + 4); ctx.stroke(); }
    if (u.fx.parasite === G.human && u.owner !== G.human) { ctx.fillStyle = '#f4f'; ctx.beginPath(); ctx.arc(x, y - r - 6, 2.5, 0, 7); ctx.fill(); }
    if (u.stim > 0) { ctx.fillStyle = '#ff8020'; ctx.fillRect(x + r - 3, y - r - 8, 5, 5); }
    if (u.carrying) { ctx.fillStyle = u.carrying.type === 'gas' ? '#6ee06a' : '#5fd0ff'; ctx.strokeStyle = '#123'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 3, y + 1); ctx.lineTo(x + 7, y - 6); ctx.lineTo(x + 11, y + 1); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    if ((u.def.egg || u.morphT > 0) && u.prod[0]) { const w = 30; ctx.fillStyle = '#000'; ctx.fillRect(x - 15, y + r + 2, w, 4); ctx.fillStyle = '#3f3'; ctx.fillRect(x - 15, y + r + 2, w * u.prod[0].progress / u.prod[0].total, 4); }
  },
  drawBuilding(ctx, u) {
    const s = Sprites.building(u); const x0 = u.tx * TILE, y0 = u.ty * TILE, W = s.W, H = s.H;
    ctx.save(); ctx.globalAlpha = u._alpha;
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x0 + W / 2 + 4, y0 + H / 2 + 8, W / 2 + 4, H / 2 + 2, 0, 0, 7); ctx.fill();
    if (u.done) { ctx.drawImage(s.cv, x0 - s.M, y0 - s.T); if (u.def.race === 'P' && u.unpowered) { ctx.fillStyle = 'rgba(40,20,20,0.45)'; ctx.fillRect(x0, y0, W, H); } const an = BUILDING_ANIM[u.def.id]; if (an && u._alpha > 0.5) an(ctx, u, x0, y0, W, H, G.frame); }
    else this.drawConstruction(ctx, u, s, x0, y0, W, H);
    ctx.restore();
    if (u.done && u.unpowered) { ctx.fillStyle = '#ff5050'; ctx.font = 'bold 10px Arial'; ctx.fillText('UNPOWERED', x0 + W / 2 - 30, y0 + H / 2); }
    if (u.hasNuke) { ctx.fillStyle = G.frame % 20 < 10 ? '#ff3030' : '#902020'; ctx.beginPath(); ctx.arc(x0 + W / 2, y0 - 6, 5, 0, 7); ctx.fill(); }
  },
  drawConstruction(ctx, u, s, x0, y0, W, H) {
    const k = clamp(u.progress / u.def.time, 0, 1); const race = u.def.race;
    if (race === 'T') {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 3, y0 + 3, W - 6, H - 6); ctx.fillStyle = '#2a2e33'; ctx.fillRect(x0 + 4, y0 + 4, W - 8, H - 8);
      ctx.save(); ctx.beginPath(); const full = H + s.T + s.M; ctx.rect(x0 - s.M, y0 + H + s.M - full * k, W + s.M * 2, full * k); ctx.clip(); ctx.drawImage(s.cv, x0 - s.M, y0 - s.T); ctx.restore();
      ctx.strokeStyle = 'rgba(255,200,60,0.7)'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const yy = y0 + 6 + i * (H - 12) / 3; if (yy < y0 + H - H * k) { ctx.beginPath(); ctx.moveTo(x0 + 4, yy); ctx.lineTo(x0 + W - 4, yy); ctx.stroke(); } } ctx.beginPath(); ctx.moveTo(x0 + 6, y0 + 6); ctx.lineTo(x0 + 6, y0 + H - 6); ctx.moveTo(x0 + W - 6, y0 + 6); ctx.lineTo(x0 + W - 6, y0 + H - 6); ctx.stroke();
      if (u.builder && u.builder.alive && (G.frame % 6) < 3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.beginPath(); ctx.arc(x0 + 10 + (G.frame * 7) % (W - 20), y0 + H - H * k, 3, 0, 7); ctx.fill(); ctx.restore(); }
    } else if (race === 'Z') {
      ctx.save(); ctx.translate(x0 + W / 2, y0 + H / 2); const sc = 0.45 + k * 0.55; ctx.scale(sc, sc); ctx.globalAlpha *= 0.55 + k * 0.45; ctx.drawImage(s.cv, -W / 2 - s.M, -H / 2 - s.T); ctx.restore();
      ctx.fillStyle = `rgba(150,90,150,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(x0 + W / 2, y0 + H / 2, W / 2 * (0.6 + 0.4 * k), H / 2 * (0.6 + 0.4 * k), 0, 0, 7); ctx.fill();
    } else {
      ctx.save(); ctx.globalAlpha *= 0.25 + k * 0.75; ctx.drawImage(s.cv, x0 - s.M, y0 - s.T); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(x0 + W / 2, y0 + H / 2, 2, x0 + W / 2, y0 + H / 2, Math.max(W, H) * 0.7); g.addColorStop(0, `rgba(120,200,255,${0.5 * (1 - k) + 0.1})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x0 - 20, y0 - 20, W + 40, H + 40); for (let i = 0; i < 5; i++) { const xx = x0 + 8 + ((i * 37 + G.frame * 2) % (W - 16)); ctx.fillStyle = 'rgba(160,220,255,0.35)'; ctx.fillRect(xx, y0 - 10, 2, H + 20); } ctx.restore();
    }
    const w = W - 8; ctx.fillStyle = '#000'; ctx.fillRect(x0 + 4, y0 + H - 7, w, 5); ctx.fillStyle = '#3f3'; ctx.fillRect(x0 + 4, y0 + H - 7, w * k, 5);
  },
  drawSelection(ctx, u, sel) {
    const col = u.owner === G.human ? '#3fe83f' : G.allied(G.human, u.owner) ? '#f0e040' : '#ff3c3c';
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = sel ? 1.5 : 1; ctx.globalAlpha = sel ? 0.95 : 0.5;
    if (u.isBuilding && !u.lifted) { ctx.beginPath(); ctx.ellipse(u.tx * TILE + u.def.w * TILE / 2, u.ty * TILE + u.def.h * TILE / 2 + 6, u.def.w * TILE / 2 + 4, u.def.h * TILE / 2 + 2, 0, 0, 7); ctx.stroke(); }
    else { ctx.beginPath(); ctx.ellipse(u._x || u.x, (u._y || u.y) + u.r * 0.4, u.r + 3, (u.r + 3) * 0.5, 0, 0, 7); ctx.stroke(); }
    ctx.restore();
    if (sel) this.drawBars(ctx, u);
  },
  drawBars(ctx, u) {
    const w = Math.max(24, Math.min(64, u.r * 2.4)), x = (u._x || u.x) - w / 2; let y = (u._y || u.y) + u.r * 0.9 + 6; if (u.isBuilding && !u.lifted) { y = u.ty * TILE + u.def.h * TILE + 8; }
    const seg = Math.max(4, Math.round(w / 6));
    const bar = (frac, color) => { ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 6); for (let i = 0; i < seg; i++) { const sx = x + i * w / seg; const filled = (i + 1) / seg <= frac + 0.001 || (i / seg < frac && frac < (i + 1) / seg); ctx.fillStyle = filled ? color : '#2a2f36'; ctx.fillRect(sx + 0.5, y, w / seg - 1, 4); } y += 6; };
    if (u.maxSh) bar(u.sh / u.maxSh, '#5aa8ff');
    const hr = u.hp / u.maxHp; bar(hr, hr > 0.66 ? '#3fe83f' : hr > 0.33 ? '#f0e040' : '#ff3c3c');
    if (u.maxEnergy && u.owner === G.human) bar(u.energy / u.maxEnergy, '#c86aff');
  },
  drawPlacement(ctx) {
    const pl = UI.placing, def = pl.def, m = G.map; const tx = pl.tx, ty = pl.ty;
    const err = m.canPlace(def, tx, ty, G.players[G.human], G.units, pl.builder);
    const fake = { def, owner: G.human }; const s = Sprites.building(fake); ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(s.cv, tx * TILE - s.M, ty * TILE - s.T); ctx.restore();
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) { ctx.fillStyle = !err ? 'rgba(60,255,60,0.28)' : 'rgba(255,60,60,0.35)'; ctx.fillRect((tx + x) * TILE + 1, (ty + y) * TILE + 1, TILE - 2, TILE - 2); }
    if (def.psi) { ctx.strokeStyle = 'rgba(80,140,255,0.5)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse((tx + 1) * TILE, (ty + 1) * TILE, def.psi * TILE, def.psi * 0.7 * TILE, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (def.creep) { ctx.strokeStyle = 'rgba(180,80,255,0.5)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse((tx + def.w / 2) * TILE, (ty + def.h / 2) * TILE, def.creep * TILE, def.creep * 0.8 * TILE, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (err) { ctx.fillStyle = '#ff8a8a'; ctx.font = 'bold 12px Arial'; ctx.fillText(err, tx * TILE, ty * TILE - 6); }
  },
};
