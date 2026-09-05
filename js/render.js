'use strict';
// ============================================================================
// Renderer: terrain (cached), creep, resources, units (procedural vector art),
// fog of war, effects, selection, placement ghost.
// ============================================================================
const Render = {
  canvas: null, ctx: null, terrainCanvas: null, fogCanvas: null, creepCanvas: null, W: 0, H: 0, camX: 0, camY: 0, viewW: 0, viewH: 0, lerp: 0, creepDirty: true, lastCreepFrame: -1,
  init(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.resize(); },
  resize() { this.W = this.canvas.width = window.innerWidth; this.H = this.canvas.height = window.innerHeight; this.viewW = this.W; this.viewH = this.H - UI.consoleH; },
  buildTerrain() {
    const m = G.map; const c = this.terrainCanvas = document.createElement('canvas'); c.width = m.w * TILE; c.height = m.h * TILE; const x = c.getContext('2d');
    const low = ['#3b3f2f', '#3f4332', '#373b2c', '#41452f'], high = ['#5a5545', '#5e5948', '#565141', '#605b4a'];
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) {
      const i = m.idx(tx, ty), h = m.height[i], n = m.noise[i];
      let col;
      if (m.cliff[i] === 2) col = ['#2a2a2e', '#2e2e33', '#26262a'][n % 3];
      else if (m.cliff[i] === 1) col = ['#2f2a22', '#352f26', '#2a2620'][n % 3];
      else if (h === 2) col = high[n % 4]; else if (h === 1) col = '#4c4a3c'; else col = low[n % 4];
      x.fillStyle = col; x.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      // texture speckles
      if (m.cliff[i] === 0) { x.fillStyle = 'rgba(0,0,0,0.12)'; const k = n % 7; x.fillRect(tx * TILE + (n % 23), ty * TILE + (n * 7 % 29), 3 + k, 2); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(tx * TILE + (n * 3 % 27), ty * TILE + (n * 11 % 25), 4, 2); }
      if (m.cliff[i] === 2) { x.fillStyle = 'rgba(255,255,255,0.08)'; x.beginPath(); x.arc(tx * TILE + 16, ty * TILE + 16, 6 + n % 6, 0, 7); x.fill(); }
    }
    // cliff edge highlight lines
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2;
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) { const i = m.idx(tx, ty); if (m.cliff[i] !== 1) continue; if (m.H(tx, ty + 1) === 0 && m.walkableTerrain(tx, ty + 1)) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(tx * TILE, (ty + 1) * TILE, TILE, 6); } if (m.height[i] === 2 && m.H(tx, ty - 1) === 2 && m.cliff[m.idx(tx, ty - 1)] === 0) { x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(tx * TILE, ty * TILE, TILE, 3); } }
    // ramps shading
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) { if (m.height[m.idx(tx, ty)] === 1) { x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(tx * TILE, ty * TILE, TILE, 2); x.fillRect(tx * TILE, ty * TILE + 16, TILE, 2); } }
    this.fogCanvas = document.createElement('canvas'); this.fogCanvas.width = m.w; this.fogCanvas.height = m.h;
    this.creepCanvas = document.createElement('canvas'); this.creepCanvas.width = m.w * 4; this.creepCanvas.height = m.h * 4;
    this.mini = document.createElement('canvas'); this.mini.width = m.w; this.mini.height = m.h; const mc = this.mini.getContext('2d');
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) { const i = m.idx(tx, ty); mc.fillStyle = m.cliff[i] === 2 ? '#222' : m.cliff[i] === 1 ? '#3a3020' : m.height[i] === 2 ? '#6a6450' : m.height[i] === 1 ? '#555040' : '#3d4230'; mc.fillRect(tx, ty, 1, 1); }
  },
  drawCreep() {
    const m = G.map, c = this.creepCanvas.getContext('2d'); c.clearRect(0, 0, this.creepCanvas.width, this.creepCanvas.height);
    c.fillStyle = 'rgba(96,40,120,0.75)';
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) if (m.creep[m.idx(tx, ty)]) { c.fillRect(tx * 4, ty * 4, 4, 4); }
    // psi for human protoss (only when placing)
  },
  worldToScreen(x, y) { return [x - this.camX, y - this.camY]; },
  frame(alpha) {
    const ctx = this.ctx, m = G.map; this.lerp = alpha;
    if (!this.terrainCanvas) this.buildTerrain();
    if (G.frame !== this.lastCreepFrame && G.frame % 12 === 0) { this.drawCreep(); this.lastCreepFrame = G.frame; }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.viewW, this.viewH); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.viewW, this.viewH);
    const cx = this.camX, cy = this.camY;
    ctx.drawImage(this.terrainCanvas, cx, cy, this.viewW, this.viewH, 0, 0, this.viewW, this.viewH);
    ctx.drawImage(this.creepCanvas, cx / 8, cy / 8, this.viewW / 8, this.viewH / 8, 0, 0, this.viewW, this.viewH);
    ctx.translate(-cx, -cy);
    const hp = G.players[G.human]; const vis = hp.vis;
    const inView = (x, y, r) => x + r > cx && x - r < cx + this.viewW && y + r > cy && y - r < cy + this.viewH;
    const seen = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inb(tx, ty) && vis[ty * m.w + tx] > 0; };
    const visNow = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inb(tx, ty) && vis[ty * m.w + tx] === 2; };
    // psi field during placement
    if (UI.placing && UI.placing.def.needsPsi) { const p = m.psi[G.human]; if (p) { ctx.fillStyle = 'rgba(80,140,255,0.13)'; for (let ty = Math.floor(cy / TILE); ty < (cy + this.viewH) / TILE; ty++) for (let tx = Math.floor(cx / TILE); tx < (cx + this.viewW) / TILE; tx++) if (m.inb(tx, ty) && p[m.idx(tx, ty)]) ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE); } }
    // resources
    for (const r of m.resources) { if (!inView(r.cx, r.cy, 64) || !seen(r.cx, r.cy)) continue; this.drawResource(ctx, r); }
    // fields (ground)
    for (const f of G.fields) { if (!inView(f.x, f.y, f.r * TILE)) continue; this.drawField(ctx, f, visNow(f.x, f.y)); }
    // units: buildings, ground, then air
    const list = []; for (const u of G.units) { if (!u.alive || u.inside) continue; const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha; if (!inView(x, y, u.r + 20)) continue; let canSee; if (u.owner === G.human) canSee = true; else if (u.isBuilding) canSee = seen(x, y); else canSee = visNow(x, y); if (!canSee) continue; if (u.owner !== G.human && u.isCloaked && !G.detected(u, G.human)) { if (!visNow(x, y)) continue; u._alpha = 0.18; } else u._alpha = u.isCloaked ? 0.5 : 1; u._x = x; u._y = y; list.push(u); }
    list.sort((a, b) => (a.fly - b.fly) || (b.isBuilding - a.isBuilding) || (a._y - b._y));
    for (const u of list) { if (!u.fly) this.drawShadowless(ctx, u); }
    for (const u of list) { if (u.fly) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(u._x + 10, u._y + 18, u.r * 0.9, u.r * 0.5, 0, 0, 7); ctx.fill(); } }
    for (const u of list) { if (u.fly) this.drawShadowless(ctx, u); }
    // projectiles
    for (const p of G.projectiles) { if (!inView(p.x, p.y, 10) || !visNow(p.x, p.y)) continue; ctx.fillStyle = p.kind === 'interceptor' ? '#dde' : p.kind === 'yamato' ? '#f66' : '#fc0'; ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'yamato' ? 7 : 4, 0, 7); ctx.fill(); }
    // effects
    for (const e of G.effects) { if (!inView(e.x, e.y, 200)) continue; if (!visNow(e.x, e.y) && !(e.tx !== undefined && visNow(e.tx, e.ty)) && e.kind !== 'nuke') continue; this.drawEffect(ctx, e); }
    // selection & health bars
    for (const u of UI.selection) { if (!u.alive || u.inside) continue; this.drawSelection(ctx, u, true); }
    if (UI.hover && UI.hover.alive && !UI.selection.includes(UI.hover)) this.drawSelection(ctx, UI.hover, false);
    // rally lines
    if (UI.selection.length === 1 && UI.selection[0].rally && UI.selection[0].owner === G.human) { const b = UI.selection[0], r = b.rally; ctx.strokeStyle = 'rgba(80,255,80,0.6)'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(r.target ? r.target.x : r.x, r.target ? r.target.y : r.y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#5f5'; ctx.beginPath(); ctx.arc(r.target ? r.target.x : r.x, r.target ? r.target.y : r.y, 5, 0, 7); ctx.fill(); }
    // placement ghost
    if (UI.placing) this.drawPlacement(ctx);
    // fog
    this.drawFog(ctx, vis, cx, cy);
    // move markers
    for (const mk of UI.markers) { const a = mk.t / 20; ctx.strokeStyle = `rgba(${mk.color},${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mk.x, mk.y, 6 + (20 - mk.t) * 0.6, 0, 7); ctx.stroke(); }
    ctx.restore();
    // drag box
    if (UI.drag && UI.dragging) { const d = UI.drag; ctx.strokeStyle = '#4f4'; ctx.lineWidth = 1; ctx.strokeRect(Math.min(d.x0, d.x1) + .5, Math.min(d.y0, d.y1) + .5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); }
  },
  drawFog(ctx, vis, cx, cy) {
    const m = G.map; const fc = this.fogCanvas.getContext('2d'); const img = fc.createImageData(m.w, m.h); const d = img.data;
    for (let i = 0; i < vis.length; i++) { const v = vis[i]; d[i * 4] = 0; d[i * 4 + 1] = 0; d[i * 4 + 2] = 0; d[i * 4 + 3] = v === 2 ? 0 : v === 1 ? 128 : 255; }
    fc.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(this.fogCanvas, cx / TILE, cy / TILE, this.viewW / TILE, this.viewH / TILE, cx, cy, this.viewW, this.viewH); ctx.restore();
  },
  drawResource(ctx, r) {
    if (r.type === 'mineral') { ctx.fillStyle = r.amount > 500 ? '#4fd8ff' : '#2a8faa'; ctx.strokeStyle = '#0a4a66'; ctx.lineWidth = 1; for (let k = 0; k < 4; k++) { const x = r.x * TILE + 8 + k * 14 + (k % 2) * 3, y = r.y * TILE + 10 + (k % 2) * 8; ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x + 5, y); ctx.lineTo(x + 12, y + 4); ctx.lineTo(x + 14, y + 14); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
    else { ctx.fillStyle = '#3a4a2a'; ctx.strokeStyle = '#1e2a14'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(r.cx, r.cy, 60, 28, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = r.amount > 0 ? '#6bd35a' : '#556'; ctx.beginPath(); ctx.ellipse(r.cx, r.cy, 30, 14, 0, 0, 7); ctx.fill(); if (r.amount > 0 && G.frame % 40 < 20) { ctx.fillStyle = 'rgba(160,255,120,0.4)'; ctx.beginPath(); ctx.arc(r.cx + (G.frame % 20) - 10, r.cy - 10 - (G.frame % 20), 8, 0, 7); ctx.fill(); } }
  },
  drawField(ctx, f, vis) {
    const r = f.r * TILE;
    if (f.kind === 'swarm') { ctx.fillStyle = 'rgba(220,120,30,0.35)'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill(); for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(255,150,50,0.25)'; ctx.beginPath(); ctx.arc(f.x + Math.cos(i + G.frame / 20) * r * .5, f.y + Math.sin(i * 1.7 + G.frame / 25) * r * .5, r * .4, 0, 7); ctx.fill(); } }
    else if (f.kind === 'dweb') { ctx.fillStyle = 'rgba(80,120,255,0.3)'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill(); }
    else if (f.kind === 'storm') { for (let i = 0; i < 8; i++) { ctx.strokeStyle = `rgba(120,200,255,${0.5 + Math.random() * .5})`; ctx.lineWidth = 2; ctx.beginPath(); const a = Math.random() * 7; ctx.moveTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r); ctx.lineTo(f.x + (Math.random() - .5) * r, f.y + (Math.random() - .5) * r); ctx.stroke(); } }
    else if (f.kind === 'nuke_target' && (f.owner === G.human || true)) { ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(f.x, f.y, 4 + (G.frame % 12 < 6 ? 2 : 0), 0, 7); ctx.fill(); }
    else if (f.kind === 'scan' && f.owner === G.human) { ctx.strokeStyle = 'rgba(120,255,120,0.3)'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.stroke(); }
    else if (f.kind === 'recall') { ctx.strokeStyle = 'rgba(120,200,255,0.6)'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.stroke(); }
  },
  drawSelection(ctx, u, sel) {
    const col = u.owner === G.human ? '#3f3' : G.allied(G.human, u.owner) ? '#ff3' : '#f33';
    ctx.strokeStyle = col; ctx.lineWidth = sel ? 1.5 : 1; ctx.globalAlpha = sel ? 1 : 0.5;
    if (u.isBuilding && !u.lifted) ctx.strokeRect(u.tx * TILE + 1, u.ty * TILE + 1, u.def.w * TILE - 2, u.def.h * TILE - 2);
    else { ctx.beginPath(); ctx.ellipse(u._x || u.x, (u._y || u.y) + u.r * 0.5, u.r + 2, (u.r + 2) * 0.55, 0, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (sel || u.hp < u.maxHp) {
      const w = Math.max(20, u.r * 2), x = (u._x || u.x) - w / 2, y = (u._y || u.y) + u.r + 4; let yy = y;
      if (u.maxSh) { ctx.fillStyle = '#000'; ctx.fillRect(x - 1, yy - 1, w + 2, 5); ctx.fillStyle = '#48f'; ctx.fillRect(x, yy, w * u.sh / u.maxSh, 3); yy += 5; }
      const hr = u.hp / u.maxHp; ctx.fillStyle = '#000'; ctx.fillRect(x - 1, yy - 1, w + 2, 5); ctx.fillStyle = hr > 0.66 ? '#3f3' : hr > 0.33 ? '#ff3' : '#f33'; ctx.fillRect(x, yy, w * hr, 3); yy += 5;
      if (u.maxEnergy && u.owner === G.human) { ctx.fillStyle = '#000'; ctx.fillRect(x - 1, yy - 1, w + 2, 5); ctx.fillStyle = '#c6f'; ctx.fillRect(x, yy, w * u.energy / u.maxEnergy, 3); }
    }
  },
  drawPlacement(ctx) {
    const pl = UI.placing, def = pl.def, m = G.map; const tx = pl.tx, ty = pl.ty;
    const err = m.canPlace(def, tx, ty, G.players[G.human], G.units, pl.builder);
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) { const ok = !err; ctx.fillStyle = ok ? 'rgba(60,255,60,0.35)' : 'rgba(255,60,60,0.35)'; ctx.fillRect((tx + x) * TILE + 1, (ty + y) * TILE + 1, TILE - 2, TILE - 2); }
    if (def.psi) { ctx.strokeStyle = 'rgba(80,140,255,0.5)'; ctx.beginPath(); ctx.ellipse((tx + 1) * TILE, (ty + 1) * TILE, def.psi * TILE, def.psi * 0.7 * TILE, 0, 0, 7); ctx.stroke(); }
    if (def.creep) { ctx.strokeStyle = 'rgba(180,80,255,0.5)'; ctx.beginPath(); ctx.ellipse((tx + def.w / 2) * TILE, (ty + def.h / 2) * TILE, def.creep * TILE, def.creep * 0.8 * TILE, 0, 0, 7); ctx.stroke(); }
    if (err) { ctx.fillStyle = '#f88'; ctx.font = '12px sans-serif'; ctx.fillText(err, tx * TILE, ty * TILE - 4); }
  },
  // ---------------- unit art ----------------
  drawShadowless(ctx, u) {
    const x = u._x, y = u._y; ctx.save(); ctx.globalAlpha = u._alpha;
    if (u.fx.stasis > 0) ctx.globalAlpha *= 0.6;
    if (u.isBuilding) this.drawBuilding(ctx, u, x, y); else this.drawUnit(ctx, u, x, y);
    ctx.restore();
    // status icons
    if (u.fx.stasis > 0) { ctx.strokeStyle = '#8cf'; ctx.lineWidth = 2; ctx.strokeRect(x - u.r, y - u.r, u.r * 2, u.r * 2); }
    if (u.fx.lockdown > 0) { ctx.fillStyle = '#f44'; ctx.fillRect(x - 3, y - u.r - 8, 6, 6); }
    if (u.fx.matrix) { ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, u.r + 4, 0, 7); ctx.stroke(); }
    if (u.fx.irradiate > 0) { ctx.fillStyle = 'rgba(120,255,60,0.5)'; ctx.beginPath(); ctx.arc(x, y, u.r + 2 + (G.frame % 8), 0, 7); ctx.fill(); }
    if (u.fx.plague > 0) { ctx.fillStyle = 'rgba(255,120,0,0.5)'; ctx.beginPath(); ctx.arc(x + (G.frame % 5) - 2, y - u.r, 3, 0, 7); ctx.fill(); }
    if (u.fx.ensnare > 0) { ctx.fillStyle = 'rgba(120,255,120,0.4)'; ctx.beginPath(); ctx.arc(x, y, u.r, 0, 7); ctx.fill(); }
    if (u.fx.maelstrom > 0) { ctx.strokeStyle = '#f4f'; ctx.beginPath(); ctx.arc(x, y, u.r + 3, 0, 7); ctx.stroke(); }
    if (u.stim > 0) { ctx.fillStyle = '#f80'; ctx.fillRect(x + u.r - 2, y - u.r - 6, 4, 4); }
    if (u.carrying) { ctx.fillStyle = u.carrying.type === 'gas' ? '#6d5' : '#5df'; ctx.fillRect(x + 4, y - 4, 6, 6); }
    if (u.isBuilding && !u.done && !u.def.egg) { const w = u.def.w * TILE - 8; ctx.fillStyle = '#000'; ctx.fillRect(u.tx * TILE + 4, (u.ty + u.def.h) * TILE - 8, w, 5); ctx.fillStyle = '#3f3'; ctx.fillRect(u.tx * TILE + 4, (u.ty + u.def.h) * TILE - 8, w * u.progress / u.def.time, 5); }
    if ((u.def.egg || u.morphT > 0) && u.prod[0]) { const w = 30; ctx.fillStyle = '#000'; ctx.fillRect(x - 15, y + u.r + 2, w, 4); ctx.fillStyle = '#3f3'; ctx.fillRect(x - 15, y + u.r + 2, w * u.prod[0].progress / u.prod[0].total, 4); }
    if (u.isBuilding && u.done && u.unpowered) { ctx.fillStyle = '#f44'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('UNPOWERED', x - 34, y); }
  },
  drawUnit(ctx, u, x, y) {
    const d = u.def, id = d.id, pc = G.players[u.owner].color, race = d.race, r = u.r;
    ctx.translate(x, y);
    if (u.burrowed && !d.mine) { ctx.fillStyle = 'rgba(80,40,100,0.6)'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .6, 0, 0, 7); ctx.fill(); ctx.fillStyle = pc; ctx.fillRect(-3, -3, 6, 6); return; }
    if (d.mine) { ctx.fillStyle = u.burrowed ? 'rgba(120,120,120,0.5)' : '#aaa'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); ctx.fillStyle = pc; ctx.fillRect(-2, -2, 4, 4); return; }
    const bob = u.moving ? Math.sin(G.frame * 0.6 + u.id) * 1.5 : 0;
    ctx.rotate(u.facing);
    const body = race === 'T' ? '#8a97a8' : race === 'Z' ? '#8a6a5a' : '#c9b46a';
    const dark = race === 'T' ? '#4a5563' : race === 'Z' ? '#4a3030' : '#6a5a2a';
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#111';
    switch (id) {
      case 'scv': case 'probe': case 'drone':
        ctx.fillStyle = body; ctx.beginPath(); if (id === 'probe') ctx.ellipse(0, 0, r, r * .8, 0, 0, 7); else ctx.rect(-r * .8, -r * .7, r * 1.6, r * 1.4); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.fillRect(-r * .4, -r * .4, r * .8, r * .8); if (id !== 'probe') { ctx.fillStyle = dark; ctx.fillRect(r * .5, -3, r * .6, 6); } break;
      case 'marine': case 'firebat': case 'ghost': case 'medic':
        ctx.fillStyle = id === 'medic' ? '#dde' : id === 'firebat' ? '#b86' : body; ctx.beginPath(); ctx.arc(0, bob, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, bob, r * .5, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(r * .3, -2 + bob, r * 1.1, 4); if (id === 'firebat') { ctx.fillStyle = '#f60'; ctx.fillRect(r * .3, -5 + bob, r * 1.1, 3); } if (id === 'medic') { ctx.fillStyle = '#f33'; ctx.fillRect(-2, -6 + bob, 4, 12); ctx.fillRect(-6, -2 + bob, 12, 4); } break;
      case 'vulture': ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * .6, -r * .6); ctx.lineTo(-r, 0); ctx.lineTo(-r * .6, r * .6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.fillRect(-r * .5, -3, r * .8, 6); break;
      case 'siege_tank':
        ctx.fillStyle = dark; ctx.fillRect(-r * .9, -r * .8, r * 1.8, r * 1.6); ctx.strokeRect(-r * .9, -r * .8, r * 1.8, r * 1.6); ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, r * .55, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, 7); ctx.fill();
        if (u.sieged) { ctx.fillStyle = '#333'; ctx.fillRect(-2, -3, r * 1.6, 6); ctx.fillStyle = dark; ctx.fillRect(-r * 1.1, -r * .9, r * .3, r * .5); ctx.fillRect(-r * 1.1, r * .4, r * .3, r * .5); ctx.fillRect(r * .8, -r * .9, r * .3, r * .5); ctx.fillRect(r * .8, r * .4, r * .3, r * .5); } else { ctx.fillStyle = '#333'; ctx.fillRect(0, -2, r * 1.2, 4); } break;
      case 'goliath': ctx.fillStyle = body; ctx.fillRect(-r * .6, -r * .6, r * 1.2, r * 1.2); ctx.strokeRect(-r * .6, -r * .6, r * 1.2, r * 1.2); ctx.fillStyle = dark; ctx.fillRect(-r * .9, -r * .9 + bob, r * .3, r * .5); ctx.fillRect(-r * .9, r * .4 - bob, r * .3, r * .5); ctx.fillStyle = pc; ctx.fillRect(-r * .3, -r * .3, r * .6, r * .6); ctx.fillStyle = '#222'; ctx.fillRect(r * .2, -r * .7, r * .8, 3); ctx.fillRect(r * .2, r * .5, r * .8, 3); break;
      case 'wraith': case 'valkyrie': case 'scout': case 'corsair':
        ctx.fillStyle = id === 'scout' || id === 'corsair' ? '#d8c880' : body; ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * .8, -r); ctx.lineTo(-r * .4, 0); ctx.lineTo(-r * .8, r); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, 7); ctx.fill(); break;
      case 'dropship': case 'shuttle': ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .7, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.fillRect(-r * .5, -r * .3, r, r * .6); break;
      case 'science_vessel': ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, r * .6, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#ccd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, 7); ctx.fill(); break;
      case 'battlecruiser': ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * .3, -r * .6); ctx.lineTo(-r, -r * .5); ctx.lineTo(-r, r * .5); ctx.lineTo(r * .3, r * .6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = body; ctx.fillRect(-r * .6, -r * .25, r * 1.2, r * .5); ctx.fillStyle = pc; ctx.fillRect(-r * .3, -r * .15, r * .6, r * .3); break;
      case 'overlord': ctx.fillStyle = '#9a7a8a'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .75, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.ellipse(0, 0, r * .5, r * .35, 0, 0, 7); ctx.fill(); ctx.fillStyle = dark; for (let i = 0; i < 4; i++) ctx.fillRect(-r * .8 + i * r * .5, r * .6, 3, r * .5 + Math.sin(G.frame / 10 + i) * 2); break;
      case 'zergling': case 'broodling': ctx.fillStyle = '#a06a5a'; ctx.beginPath(); ctx.ellipse(0, bob, r, r * .6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.fillRect(-2, -2 + bob, 4, 4); ctx.strokeStyle = '#333'; for (let i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.moveTo(-2, i * r * .5); ctx.lineTo(-r, i * r + bob); ctx.moveTo(r * .3, i * r * .5); ctx.lineTo(r * .8, i * r); ctx.stroke(); } break;
      case 'hydralisk': ctx.fillStyle = '#7a6a8a'; ctx.beginPath(); ctx.ellipse(-r * .2, 0, r, r * .55, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = body; ctx.beginPath(); ctx.arc(r * .5, 0, r * .45, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.fillRect(-r * .4, -3, r * .5, 6); break;
      case 'lurker': ctx.fillStyle = '#6a5a7a'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .7, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#333'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-r * .5 + i * r * .5, -r * .6); ctx.lineTo(-r * .5 + i * r * .5, -r * 1.1); ctx.moveTo(-r * .5 + i * r * .5, r * .6); ctx.lineTo(-r * .5 + i * r * .5, r * 1.1); ctx.stroke(); } ctx.fillStyle = pc; ctx.fillRect(-4, -4, 8, 8); break;
      case 'mutalisk': case 'guardian': case 'devourer': case 'scourge': case 'queen': {
        const flap = Math.sin(G.frame * 0.4 + u.id) * r * .4; ctx.fillStyle = id === 'guardian' ? '#8a5a7a' : id === 'devourer' ? '#5a7a5a' : id === 'queen' ? '#9a6a9a' : '#8a6a7a'; ctx.beginPath(); ctx.moveTo(r * .8, 0); ctx.lineTo(-r * .2, -r - flap); ctx.lineTo(-r * .6, 0); ctx.lineTo(-r * .2, r + flap); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, 7); ctx.fill(); break; }
      case 'ultralisk': ctx.fillStyle = '#7a5a4a'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .7, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(r * .7, -r * .3); ctx.lineTo(r * 1.3, -r * .7); ctx.lineTo(r * .8, -r * .1); ctx.moveTo(r * .7, r * .3); ctx.lineTo(r * 1.3, r * .7); ctx.lineTo(r * .8, r * .1); ctx.fill(); ctx.fillStyle = pc; ctx.fillRect(-r * .4, -r * .3, r * .6, r * .6); break;
      case 'defiler': ctx.fillStyle = '#5a4a6a'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(r * .3, 0, r * .3, 0, 7); ctx.fill(); ctx.strokeStyle = '#333'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * .3, 0); ctx.lineTo(i * r * .3, (i % 2 ? 1 : -1) * r); ctx.stroke(); } break;
      case 'larva': ctx.fillStyle = '#c9a'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .7, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(2, -2, 2, 2); break;
      case 'egg': case 'lurker_egg': case 'cocoon': ctx.rotate(-u.facing); ctx.fillStyle = '#a89'; ctx.beginPath(); ctx.ellipse(0, 0, r * .8, r, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(180,120,200,0.5)'; ctx.beginPath(); ctx.ellipse(0, 0, r * .4, r * .6, 0, 0, 7); ctx.fill(); break;
      case 'infested_terran': ctx.fillStyle = '#7a8a5a'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.fillRect(-3, -3, 6, 6); break;
      case 'zealot': ctx.fillStyle = '#d8c880'; ctx.beginPath(); ctx.arc(0, bob, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, bob, r * .5, 0, 7); ctx.fill(); ctx.fillStyle = '#6cf'; ctx.fillRect(r * .3, -r * .8 + bob, r * .9, 3); ctx.fillRect(r * .3, r * .5 + bob, r * .9, 3); break;
      case 'dragoon': ctx.fillStyle = '#d8c880'; ctx.beginPath(); ctx.arc(0, 0, r * .6, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#332'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4 + (u.moving ? Math.sin(G.frame * .5 + i) * .2 : 0); ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * .5, Math.sin(a) * r * .5); ctx.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1); ctx.stroke(); } ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, 7); ctx.fill(); break;
      case 'high_templar': case 'dark_templar': ctx.fillStyle = id === 'dark_templar' ? '#334' : '#e8e0c0'; ctx.beginPath(); ctx.arc(0, bob, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, bob, r * .45, 0, 7); ctx.fill(); if (id === 'dark_templar') { ctx.fillStyle = '#8f8'; ctx.fillRect(r * .3, -1 + bob, r * 1.2, 2); } break;
      case 'archon': case 'dark_archon': { const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r); g.addColorStop(0, id === 'archon' ? '#fff' : '#f8f'); g.addColorStop(0.5, id === 'archon' ? '#8cf' : '#a4c'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r + Math.sin(G.frame * .3) * 2, 0, 7); ctx.fill(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, 0, r * .25, 0, 7); ctx.fill(); break; }
      case 'reaver': ctx.fillStyle = '#c8b870'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = dark; for (let i = 0; i < 4; i++) ctx.fillRect(-r * .8 + i * r * .45, -r * .8, r * .3, r * .3); ctx.fillStyle = pc; ctx.fillRect(-r * .3, -r * .2, r * .6, r * .4); break;
      case 'observer': ctx.fillStyle = '#aac'; ctx.beginPath(); ctx.arc(0, 0, r * .6, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = pc; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); break;
      case 'carrier': ctx.fillStyle = '#d8c880'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .55, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = dark; ctx.fillRect(-r * .7, -r * .5, r * .4, r); ctx.fillStyle = pc; ctx.fillRect(-r * .2, -r * .25, r * .8, r * .5); break;
      case 'arbiter': ctx.fillStyle = '#c8c0a0'; ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(0, -r * .8); ctx.lineTo(-r, 0); ctx.lineTo(0, r * .8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, 0, r * .35, 0, 7); ctx.fill(); break;
      default: ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, 0, r * .5, 0, 7); ctx.fill();
    }
    if (u.halluc) { ctx.rotate(-u.facing); ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, 7); ctx.stroke(); }
  },
  drawBuilding(ctx, u, x, y) {
    const d = u.def, pc = G.players[u.owner].color, race = d.race; const w = d.w * TILE, h = d.h * TILE; const x0 = u.lifted ? x - w / 2 : u.tx * TILE, y0 = u.lifted ? y - h / 2 : u.ty * TILE;
    const prog = u.done ? 1 : u.progress / d.time;
    ctx.lineWidth = 2; ctx.strokeStyle = '#111';
    if (race === 'T') { ctx.fillStyle = u.done ? '#6b7683' : '#3a4048'; ctx.fillRect(x0 + 3, y0 + 3, w - 6, h - 6); ctx.strokeRect(x0 + 3, y0 + 3, w - 6, h - 6); ctx.fillStyle = '#8b96a3'; ctx.fillRect(x0 + 8, y0 + 8, w - 16, (h - 16) * prog); ctx.fillStyle = pc; ctx.fillRect(x0 + 8, y0 + 8, 10, 10); ctx.fillStyle = '#333'; for (let i = 0; i < d.w; i++) ctx.fillRect(x0 + 6 + i * TILE, y0 + h - 12, 20, 6); if (d.id === 'missile_turret') { ctx.fillStyle = '#444'; ctx.fillRect(x + Math.cos(u.facing) * 10 - 3, y + Math.sin(u.facing) * 10 - 3, 12, 6); } if (d.id === 'bunker') { ctx.fillStyle = '#222'; for (let i = 0; i < u.cargo.length; i++) ctx.fillRect(x0 + 10 + i * 20, y0 + 10, 12, 8); } if (d.depot) { ctx.fillStyle = '#9aa'; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill(); ctx.stroke(); } }
    else if (race === 'Z') { ctx.fillStyle = u.done ? '#7a5a6a' : '#4a3a44'; ctx.beginPath(); ctx.ellipse(x, y, w / 2 - 2, h / 2 - 2, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#9a7a8a'; ctx.beginPath(); ctx.ellipse(x, y, (w / 2 - 8) * prog, (h / 2 - 8) * prog, 0, 0, 7); ctx.fill(); ctx.fillStyle = pc; ctx.beginPath(); ctx.ellipse(x, y, 8, 6, 0, 0, 7); ctx.fill(); if (d.id === 'sunken_colony') { ctx.strokeStyle = '#533'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(u.facing) * 20, y + Math.sin(u.facing) * 20); ctx.stroke(); } if (d.id === 'spore_colony') { ctx.fillStyle = '#5a8'; ctx.beginPath(); ctx.arc(x, y - 6, 8, 0, 7); ctx.fill(); } if (d.spawnsLarva) { ctx.fillStyle = '#c8a'; ctx.beginPath(); ctx.arc(x, y - 10, 10 + Math.sin(G.frame / 12) * 2, 0, 7); ctx.fill(); } }
    else { ctx.fillStyle = u.done ? '#c9b46a' : '#5a5040'; ctx.beginPath(); ctx.moveTo(x0 + 10, y0 + 2); ctx.lineTo(x0 + w - 10, y0 + 2); ctx.lineTo(x0 + w - 2, y0 + h - 4); ctx.lineTo(x0 + 2, y0 + h - 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e8d890'; ctx.fillRect(x0 + 10, y0 + 8 + (h - 16) * (1 - prog), w - 20, (h - 16) * prog); ctx.fillStyle = u.unpowered ? '#844' : '#4cf'; ctx.beginPath(); ctx.arc(x, y, 8 + Math.sin(G.frame / 10) * 2, 0, 7); ctx.fill(); ctx.fillStyle = pc; ctx.fillRect(x0 + 12, y0 + 8, 10, 10); if (d.id === 'pylon') { ctx.fillStyle = '#4cf'; ctx.beginPath(); ctx.moveTo(x, y0 + 4); ctx.lineTo(x + 10, y + 6); ctx.lineTo(x - 10, y + 6); ctx.closePath(); ctx.fill(); } if (d.id === 'photon_cannon') { ctx.fillStyle = '#8cf'; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); } }
    if (d.depot && u.done) { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(G.players[u.owner].name.slice(0, 12), x0 + 6, y0 + h - 16); }
    if (u.hasNuke) { ctx.fillStyle = '#f33'; ctx.beginPath(); ctx.arc(x, y - 8, 6, 0, 7); ctx.fill(); }
  },
  drawEffect(ctx, e) {
    switch (e.kind) {
      case 'bullet': ctx.strokeStyle = e.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke(); ctx.fillStyle = '#ff8'; ctx.beginPath(); ctx.arc(e.tx, e.ty, 3, 0, 7); ctx.fill(); break;
      case 'laser': ctx.strokeStyle = e.color; ctx.lineWidth = 3; ctx.globalAlpha = e.t / 6; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke(); ctx.globalAlpha = 1; break;
      case 'line': ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke(); break;
      case 'missile': { const k = 1 - e.t / 8; const x = e.x + (e.tx - e.x) * k, y = e.y + (e.ty - e.y) * k; ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,200,100,0.5)'; ctx.beginPath(); ctx.moveTo(e.x + (e.tx - e.x) * Math.max(0, k - .2), e.y + (e.ty - e.y) * Math.max(0, k - .2)); ctx.lineTo(x, y); ctx.stroke(); break; }
      case 'glaive': ctx.strokeStyle = '#8f8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke(); break;
      case 'flame': { const a = Math.atan2(e.ty - e.y, e.tx - e.x); ctx.fillStyle = 'rgba(255,120,20,0.7)'; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a - .5) * 40, e.y + Math.sin(a - .5) * 40); ctx.lineTo(e.x + Math.cos(a + .5) * 40, e.y + Math.sin(a + .5) * 40); ctx.closePath(); ctx.fill(); break; }
      case 'slash': ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.tx, e.ty, 8, 0, Math.PI); ctx.stroke(); break;
      case 'spines': ctx.strokeStyle = '#c9c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke(); for (let i = 1; i < 6; i++) { const k = i / 6; ctx.fillStyle = '#ecd'; ctx.beginPath(); ctx.arc(e.x + (e.tx - e.x) * k, e.y + (e.ty - e.y) * k, 4, 0, 7); ctx.fill(); } break;
      case 'boom': { const k = 1 - e.t / 18; ctx.fillStyle = `rgba(255,${180 - k * 150},40,${1 - k})`; ctx.beginPath(); ctx.arc(e.x, e.y, (e.r || 14) * (0.5 + k), 0, 7); ctx.fill(); break; }
      case 'bigboom': { const k = 1 - e.t / 40; ctx.fillStyle = `rgba(255,${150 - k * 120},30,${1 - k})`; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.4 + k * 1.2), 0, 7); ctx.fill(); ctx.fillStyle = `rgba(60,60,60,${(1 - k) * .6})`; ctx.beginPath(); ctx.arc(e.x - 10, e.y - 20 - k * 30, e.r * .6, 0, 7); ctx.fill(); break; }
      case 'blood': { const k = 1 - e.t / 18; ctx.fillStyle = `rgba(150,30,60,${1 - k})`; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(e.x + Math.cos(i * 1.3) * k * 20, e.y + Math.sin(i * 1.3) * k * 20, 4, 0, 7); ctx.fill(); } break; }
      case 'ring': ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.globalAlpha = e.t / 14; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.2 - e.t / 14), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; break;
      case 'heal': ctx.fillStyle = '#5f5'; ctx.fillRect(e.x - 1, e.y - 4, 2, 8); ctx.fillRect(e.x - 4, e.y - 1, 8, 2); break;
      case 'spark': ctx.fillStyle = '#ff8'; ctx.fillRect(e.x - 1, e.y - 1, 3, 3); break;
      case 'charge': ctx.strokeStyle = '#f66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + Math.random() * 8, 0, 7); ctx.stroke(); break;
      case 'text': ctx.fillStyle = e.color; ctx.font = '11px sans-serif'; ctx.fillText(e.text, e.x - 10, e.y - (20 - e.t)); break;
      case 'nuke': { const k = 1 - e.t / 60; ctx.fillStyle = `rgba(255,255,255,${(1 - k) * .9})`; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.3 + k * 1.5), 0, 7); ctx.fill(); ctx.fillStyle = `rgba(255,120,0,${(1 - k) * .7})`; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * k, 0, 7); ctx.fill(); break; }
    }
  },
};
