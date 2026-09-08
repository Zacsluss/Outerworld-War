'use strict';
// ============================================================================
// HUD: BW-style console (minimap, unit panel, command card), resource bar,
// messages, menus, custom cursor. Overrides the drawing methods of UI.
// ============================================================================
const HUD = {
  // ---- skin -------------------------------------------------------------
  // The console used to be one gunmetal panel with a coloured line on top whichever race you were.
  // A 90s RTS console is a piece of the faction's own material -- Terran is stamped steel with hazard
  // paint, Zerg is carapace, Protoss is gilded stone -- so each race gets a palette and a texture,
  // and the frame is built from them rather than hard-coded.
  SKINS: {
    T: { hi: '#3a4452', lo: '#161b22', edge: '#7d93ad', accent: '#d7a13c', rivet: '#0a0d11', ink: '#0b0e13', grain: 'brushed', stripe: true },
    Z: { hi: '#3f2c3d', lo: '#150f16', edge: '#a86ad0', accent: '#c07ad8', rivet: '#160b18', ink: '#0d070e', grain: 'organic', stripe: false },
    P: { hi: '#3b3524', lo: '#16130d', edge: '#e0b84a', accent: '#62d4ff', rivet: '#0d0a06', ink: '#0a0805', grain: 'gilded', stripe: false },
  },
  skin() { return this.SKINS[G.players[G.human].race] || this.SKINS.T; },
  accent() { return this.skin().edge; },

  // The console background is the same pixels every frame, so it is built once into a canvas and
  // blitted. Drawing the texture live cost more than the whole rest of the HUD; cached it is one
  // drawImage. Keyed on race and size because those are the only things that change it.
  panel(w, h) {
    const r = G.players[G.human].race, key = r + '|' + w + '|' + h;
    if (this._panelKey === key) return this._panel;
    const s = this.skin(), cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
    // Lit hard along the top and falling away fast, the way a plate tilted toward the room catches
    // light. A flat top-to-bottom ramp reads as a coloured rectangle; the kink at 0.18 is what makes
    // it read as a surface with a thickness.
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, s.hi); g.addColorStop(0.18, s.hi); g.addColorStop(0.55, s.lo); g.addColorStop(1, s.ink);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // texture. Deterministic from a fixed seed so the panel does not shimmer when the window resizes.
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    c.save();
    if (s.grain === 'brushed') { // horizontal tooling marks, like rolled plate
      for (let i = 0; i < h * 1.4; i++) { const y = rnd() * h; c.strokeStyle = 'rgba(255,255,255,' + (0.012 + rnd() * 0.022).toFixed(3) + ')'; c.beginPath(); c.moveTo(rnd() * w * 0.5, y); c.lineTo(w * (0.4 + rnd() * 0.6), y); c.stroke(); }
    } else if (s.grain === 'organic') { // carapace: overlapping dark cells with a wet highlight
      for (let i = 0; i < 90; i++) { const x = rnd() * w, y = rnd() * h, rx = 14 + rnd() * 40, ry = 6 + rnd() * 14; c.fillStyle = 'rgba(0,0,0,' + (0.10 + rnd() * 0.16).toFixed(3) + ')'; c.beginPath(); c.ellipse(x, y, rx, ry, rnd() * 0.6 - 0.3, 0, 7); c.fill(); c.strokeStyle = 'rgba(190,140,210,0.05)'; c.lineWidth = 1; c.beginPath(); c.ellipse(x, y - 1, rx, ry, 0, 3.6, 5.8); c.stroke(); }
    } else { // gilded: fine vertical fluting and a warm sheen
      for (let x = 0; x < w; x += 6) { c.fillStyle = 'rgba(255,225,150,' + (0.018 + (x % 12 ? 0 : 0.02)).toFixed(3) + ')'; c.fillRect(x, 0, 2, h); }
      const sh = c.createLinearGradient(0, 0, w, h); sh.addColorStop(0, 'rgba(255,220,140,0.05)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,220,140,0.04)'); c.fillStyle = sh; c.fillRect(0, 0, w, h);
    }
    c.restore();
    // the lit top edge, and Terran's hazard stripe under it
    c.fillStyle = s.edge; c.globalAlpha = 0.75; c.fillRect(0, 0, w, 2); c.globalAlpha = 1;
    if (s.stripe) { c.save(); c.beginPath(); c.rect(0, 2, w, 5); c.clip(); for (let x = -20; x < w + 20; x += 14) { c.fillStyle = (x / 14 | 0) % 2 ? 'rgba(215,161,60,0.5)' : 'rgba(20,24,30,0.5)'; c.beginPath(); c.moveTo(x, 7); c.lineTo(x + 7, 2); c.lineTo(x + 14, 2); c.lineTo(x + 7, 7); c.closePath(); c.fill(); } c.restore(); }
    // Ribs where the console divides into minimap / unit panel / command card. A real one is bolted
    // together out of sections and the seams are where the eye rests; without them the whole bar is
    // one undifferentiated slab however good the texture is.
    for (const fx of [0.155, 0.815]) {
      const x = Math.round(w * fx);
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - 3, 4, 3, h - 8);
      c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(x, 4, 2, h - 8);
      c.fillStyle = s.edge; c.globalAlpha = 0.18; c.fillRect(x - 1, 4, 1, h - 8); c.globalAlpha = 1;
      for (let ry = 12; ry < h - 10; ry += 22) { c.fillStyle = s.rivet; c.beginPath(); c.arc(x - 1, ry, 2, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.arc(x - 1.5, ry - .6, 0.9, 0, 7); c.fill(); }
    }
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, h - 1, w, 1);
    this._panelKey = key; return this._panel = cv;
  },
  font(sz, bold = true) { return (bold ? 'bold ' : '') + sz + 'px "Trebuchet MS", "Segoe UI", Arial, sans-serif'; },
  // Two-pixel bevel rather than one: the outer line is the hard highlight, the inner a softer one, so
  // a button reads as a thick piece of plate at a glance instead of a rectangle with a light edge.
  bevel(ctx, x, y, w, h, raised = true, fill = '#1c212a') {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    for (const [i, a] of [[0, raised ? 0.22 : 0.62], [1, raised ? 0.10 : 0.28]]) {
      ctx.strokeStyle = raised ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + i + .5, y + h - i - .5); ctx.lineTo(x + i + .5, y + i + .5); ctx.lineTo(x + w - i - .5, y + i + .5); ctx.stroke();
      ctx.strokeStyle = raised ? 'rgba(0,0,0,' + (a * 2.6) + ')' : 'rgba(255,255,255,' + (a * 0.35) + ')';
      ctx.beginPath(); ctx.moveTo(x + w - i - .5, y + i + .5); ctx.lineTo(x + w - i - .5, y + h - i - .5); ctx.lineTo(x + i + .5, y + h - i - .5); ctx.stroke();
    }
  },
  frame(ctx, x, y, w, h) {
    const s = this.skin();
    ctx.drawImage(this.panel(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))), x, y);
    this.bevel(ctx, x + 2, y + 2, w - 4, h - 4, true, 'rgba(0,0,0,0)');
    // Corner brackets rather than four loose rivets: an L of plate with a rivet through it, which is
    // the detail that makes a console read as bolted together instead of drawn on.
    const B = 16;
    for (const [cx, cy, sx, sy] of [[x + 4, y + 4, 1, 1], [x + w - 4, y + 4, -1, 1], [x + 4, y + h - 4, 1, -1], [x + w - 4, y + h - 4, -1, -1]]) {
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(cx + sx * B, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * B); ctx.stroke();
      ctx.strokeStyle = s.edge; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(cx + sx * (B - 3), cy + sy * 3); ctx.lineTo(cx + sx * 3, cy + sy * 3); ctx.lineTo(cx + sx * 3, cy + sy * (B - 3)); ctx.stroke(); ctx.globalAlpha = 1;
      const rx = cx + sx * 7, ry = cy + sy * 7;
      ctx.fillStyle = s.rivet; ctx.beginPath(); ctx.arc(rx, ry, 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(rx - .8, ry - .8, 1.1, 0, 7); ctx.fill();
    }
  },
  inset(ctx, x, y, w, h) { const s = this.skin(); ctx.fillStyle = s.ink; ctx.fillRect(x, y, w, h); this.bevel(ctx, x, y, w, h, false, 'rgba(0,0,0,0)'); ctx.strokeStyle = s.edge; ctx.globalAlpha = 0.22; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); ctx.globalAlpha = 1; },
  text(ctx, s, x, y, color = '#d8dde4', sz = 12, bold = true, align = 'left') { ctx.font = this.font(sz, bold); ctx.textAlign = align; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.textAlign = 'left'; },
  hotLabel(ctx, label, hk, x, y, w, color = '#e6eaf0', fs = 10) { // label with hotkey letter highlighted
    ctx.font = this.font(fs); const words = label.split(' '); const lines = []; let cur = ''; for (const wd of words) { if (ctx.measureText((cur + ' ' + wd).trim()).width > w - 6 && cur) { lines.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); } lines.push(cur);
    let hkDone = false; lines.forEach((ln, i) => { let lx = x + w / 2 - ctx.measureText(ln).width / 2, ly = y + i * (fs + 1); if (!hkDone && hk && hk.length === 1) { const idx = ln.toUpperCase().indexOf(hk.toUpperCase()); if (idx >= 0) { const a = ln.slice(0, idx), b = ln[idx], c = ln.slice(idx + 1); ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillText(ln, lx + 1, ly + 1); ctx.fillStyle = color; ctx.fillText(a, lx, ly); lx += ctx.measureText(a).width; ctx.fillStyle = '#ffe45a'; ctx.fillText(b, lx, ly); lx += ctx.measureText(b).width; ctx.fillStyle = color; ctx.fillText(c, lx, ly); hkDone = true; return; } } ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillText(ln, lx + 1, ly + 1); ctx.fillStyle = color; ctx.fillText(ln, lx, ly); });
  },
  iconFor(b) { if (b.icon) return b.icon; const l = b.label; const map = { 'Move': 'move', 'Stop': 'stop', 'Attack': 'attack', 'Patrol': 'patrol', 'Hold Position': 'hold', 'Gather': 'gather', 'Return Cargo': 'gather', 'Repair': 'repair', 'Build': 'build', 'Build Advanced': 'build2', 'Cancel': 'cancel', 'Set Rally': 'rally', 'Lift Off': 'lift', 'Land': 'land', 'Unload': 'unload', 'Unload All': 'unload' }; return map[l] || null; },
  glyph(ctx, kind, x, y, s, color) { ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (kind) {
      case 'move': ctx.beginPath(); ctx.moveTo(-s * .6, 0); ctx.lineTo(s * .6, 0); ctx.moveTo(s * .2, -s * .4); ctx.lineTo(s * .6, 0); ctx.lineTo(s * .2, s * .4); ctx.stroke(); break;
      case 'stop': ctx.beginPath(); ctx.rect(-s * .45, -s * .45, s * .9, s * .9); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * .3, -s * .3); ctx.lineTo(s * .3, s * .3); ctx.stroke(); break;
      case 'attack': ctx.beginPath(); ctx.arc(0, 0, s * .5, 0, 7); ctx.moveTo(-s * .7, 0); ctx.lineTo(-s * .25, 0); ctx.moveTo(s * .25, 0); ctx.lineTo(s * .7, 0); ctx.moveTo(0, -s * .7); ctx.lineTo(0, -s * .25); ctx.moveTo(0, s * .25); ctx.lineTo(0, s * .7); ctx.stroke(); break;
      case 'patrol': ctx.beginPath(); ctx.moveTo(-s * .5, s * .3); ctx.lineTo(-s * .5, -s * .3); ctx.lineTo(s * .5, -s * .3); ctx.lineTo(s * .5, s * .3); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s * .2, -s * .55); ctx.lineTo(s * .5, -s * .3); ctx.lineTo(s * .2, -s * .05); ctx.stroke(); break;
      case 'hold': ctx.beginPath(); ctx.moveTo(0, -s * .6); ctx.lineTo(s * .55, -s * .3); ctx.lineTo(s * .55, s * .3); ctx.lineTo(0, s * .6); ctx.lineTo(-s * .55, s * .3); ctx.lineTo(-s * .55, -s * .3); ctx.closePath(); ctx.stroke(); break;
      case 'gather': ctx.beginPath(); ctx.moveTo(-s * .5, s * .4); ctx.lineTo(-s * .25, -s * .4); ctx.lineTo(s * .1, -s * .1); ctx.lineTo(s * .5, -s * .5); ctx.lineTo(s * .5, s * .4); ctx.closePath(); ctx.fill(); break;
      case 'repair': ctx.beginPath(); ctx.moveTo(-s * .5, s * .5); ctx.lineTo(s * .2, -s * .2); ctx.stroke(); ctx.beginPath(); ctx.arc(s * .3, -s * .3, s * .3, 0.5, 5.5); ctx.stroke(); break;
      case 'build': case 'build2': ctx.beginPath(); ctx.rect(-s * .5, -s * .1, s * 1, s * .6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * .6, -s * .1); ctx.lineTo(0, -s * .6); ctx.lineTo(s * .6, -s * .1); ctx.stroke(); if (kind === 'build2') { ctx.fillStyle = '#ffe45a'; ctx.fillRect(-s * .15, s * .1, s * .3, s * .3); } break;
      case 'cancel': ctx.strokeStyle = '#ff6060'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-s * .45, -s * .45); ctx.lineTo(s * .45, s * .45); ctx.moveTo(s * .45, -s * .45); ctx.lineTo(-s * .45, s * .45); ctx.stroke(); break;
      case 'rally': ctx.beginPath(); ctx.moveTo(-s * .3, s * .6); ctx.lineTo(-s * .3, -s * .6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * .3, -s * .6); ctx.lineTo(s * .5, -s * .35); ctx.lineTo(-s * .3, -s * .1); ctx.closePath(); ctx.fill(); break;
      case 'lift': ctx.beginPath(); ctx.moveTo(0, s * .5); ctx.lineTo(0, -s * .5); ctx.moveTo(-s * .35, -s * .15); ctx.lineTo(0, -s * .5); ctx.lineTo(s * .35, -s * .15); ctx.stroke(); break;
      case 'land': ctx.beginPath(); ctx.moveTo(0, -s * .5); ctx.lineTo(0, s * .5); ctx.moveTo(-s * .35, s * .15); ctx.lineTo(0, s * .5); ctx.lineTo(s * .35, s * .15); ctx.stroke(); break;
      case 'unload': ctx.beginPath(); ctx.rect(-s * .5, -s * .2, s, s * .6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -s * .1); ctx.lineTo(0, -s * .65); ctx.moveTo(-s * .25, -s * .4); ctx.lineTo(0, -s * .65); ctx.lineTo(s * .25, -s * .4); ctx.stroke(); break;
      default: ctx.beginPath(); ctx.arc(0, 0, s * .4, 0, 7); ctx.stroke();
    } ctx.restore(); },
  resIcon(ctx, kind, x, y) { ctx.save(); ctx.translate(x, y); if (kind === 'min') { const g = ctx.createLinearGradient(-6, -8, 6, 6); g.addColorStop(0, '#e6fbff'); g.addColorStop(0.5, '#5fd0ff'); g.addColorStop(1, '#1a6a9a'); ctx.fillStyle = g; ctx.strokeStyle = '#0b3a55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7, 6); ctx.lineTo(-4, -7); ctx.lineTo(3, -4); ctx.lineTo(7, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); } else if (kind === 'gas') { const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8); g.addColorStop(0, '#c8ffb0'); g.addColorStop(1, '#2a7a3a'); ctx.fillStyle = g; ctx.strokeStyle = '#123a1a'; ctx.beginPath(); ctx.ellipse(0, 1, 8, 6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(200,255,180,0.7)'; ctx.beginPath(); ctx.arc(2, -6, 2.5, 0, 7); ctx.fill(); } else { const r = G.players[G.human].race; ctx.strokeStyle = '#e8ecf0'; ctx.fillStyle = '#e8ecf0'; ctx.lineWidth = 1.5; if (r === 'T') { ctx.beginPath(); ctx.arc(0, -3, 4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-6, 7); ctx.lineTo(-4, 1); ctx.lineTo(4, 1); ctx.lineTo(6, 7); ctx.closePath(); ctx.fill(); } else if (r === 'Z') { ctx.beginPath(); ctx.ellipse(0, 0, 5, 7, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#6a3a7a'; ctx.beginPath(); ctx.ellipse(0, 0, 2.5, 4, 0, 0, 7); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 0); ctx.lineTo(0, 8); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#62d4ff'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(2.5, 0); ctx.lineTo(0, 4); ctx.lineTo(-2.5, 0); ctx.closePath(); ctx.fill(); } } ctx.restore(); },
};

Object.assign(UI, {
  miniRect() { return { x: 12, y: Render.H - this.consoleH + 10, s: this.consoleH - 22 }; },
  // The card shrinks with the console so a short window still shows all nine slots and the click boxes stay on them.
  cardRect() { const ch = this.consoleH, k = Math.min(1, (ch - 16) / 182); const bw = Math.round(64 * k), bh = Math.round(54 * k), gap = Math.max(2, Math.round(4 * k)); const w = 3 * (bw + gap) + 8, h = 3 * (bh + gap) + 8; return { x: Render.W - w - 12, y: Render.H - ch + 8, w, h, bw, bh, gap, k }; },
  drawConsole() {
    const ctx = Render.ctx, W = Render.W, H = Render.H, ch = this.consoleH, y0 = H - ch; const p = G.players[G.human];
    HUD.frame(ctx, 0, y0, W, ch);
    // ---- minimap ----
    const mr = this.miniRect(); HUD.inset(ctx, mr.x - 3, mr.y - 3, mr.s + 6, mr.s + 6);
    if (Render.mini) { ctx.imageSmoothingEnabled = false; ctx.drawImage(Render.mini, mr.x, mr.y, mr.s, mr.s); ctx.imageSmoothingEnabled = true; }
    const sc = mr.s / (G.map.w * TILE); const vis = UI.viewAll ? G.allVis() : p.vis;
    ctx.fillStyle = 'rgba(96,40,120,0.6)'; const m = G.map; for (let ty = 0; ty < m.h; ty += 2) for (let tx = 0; tx < m.w; tx += 2) if (m.creep[m.idx(tx, ty)] && vis[ty * m.w + tx]) ctx.fillRect(mr.x + tx * mr.s / m.w, mr.y + ty * mr.s / m.h, 2 * mr.s / m.w + .5, 2 * mr.s / m.h + .5);
    if (Render.fogCanvas) { ctx.globalAlpha = 0.85; ctx.imageSmoothingEnabled = false; ctx.drawImage(Render.fogCanvas, mr.x, mr.y, mr.s, mr.s); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1; }
    for (const r of m.resources) { if (vis[r.y * m.w + r.x] === 0) continue; ctx.fillStyle = r.type === 'mineral' ? '#6fe0ff' : '#7ee07a'; ctx.fillRect(mr.x + r.x * sc * TILE, mr.y + r.y * sc * TILE, Math.max(2, r.w * sc * TILE), Math.max(1.5, r.h * sc * TILE)); }
    for (const u of G.units) { if (!u.alive || u.inside || u.def.larva || u.def.notUnit) continue; if (u.owner !== G.human && !G.canSee(G.human, u) && !(u.isBuilding && G.explored(G.human, Math.floor(u.x / TILE), Math.floor(u.y / TILE)))) continue; ctx.fillStyle = u.owner === G.human ? '#3fe83f' : G.players[u.owner].color; const s = u.isBuilding ? Math.max(3, u.def.w * TILE * sc) : 2.5; ctx.fillRect(mr.x + u.x * sc - s / 2, mr.y + u.y * sc - s / 2, s, s); }
    for (const pg of this.pings) { ctx.strokeStyle = `rgba(255,60,60,${pg.t / 90})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mr.x + pg.x * sc, mr.y + pg.y * sc, 4 + (90 - pg.t) % 30 / 3, 0, 7); ctx.stroke(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(mr.x + Render.camX * sc + .5, mr.y + Render.camY * sc + .5, Render.viewW * sc, Render.viewH * sc);
    // ---- unit panel ----
    this.hotspots = []; const cr = this.cardRect();
    const ix = mr.x + mr.s + 18, iw = cr.x - ix - 14; HUD.inset(ctx, ix, y0 + 8, iw, ch - 16);
    const sel = this.selection;
    if (sel.length === 1) this.drawUnitInfo(ctx, sel[0], ix, y0 + 8, iw, ch - 16);
    else if (sel.length > 1) { const cols = Math.min(6, Math.floor((iw - 16) / 46)); sel.forEach((u, i) => { const bx = ix + 10 + (i % cols) * 46, by = y0 + 16 + Math.floor(i / cols) * 58; HUD.bevel(ctx, bx, by, 42, 52, true, '#141922'); const hr = u.hp / u.maxHp; const tint = hr > .66 ? 'rgba(60,230,60,0.8)' : hr > .33 ? 'rgba(240,220,60,0.8)' : 'rgba(255,60,60,0.8)'; ctx.drawImage(Sprites.tinted(u.def.id, G.players[u.owner].color, 36, tint), bx + 3, by + 3); if (u.maxSh) { ctx.fillStyle = '#5aa8ff'; ctx.fillRect(bx + 3, by + 42, 36 * u.sh / u.maxSh, 2); } ctx.fillStyle = hr > .66 ? '#3fe83f' : hr > .33 ? '#f0e040' : '#ff3c3c'; ctx.fillRect(bx + 3, by + 46, 36 * hr, 3); this.hotspots.push({ x: bx, y: by, w: 42, h: 52, fn: () => { if (this.keys.Shift) this.selection = this.selection.filter(v => v !== u); else this.select([u]); } }); }); }
    else { HUD.text(ctx, RACE_INFO[p.race].name + ' Command', ix + 12, y0 + 30, HUD.accent(), 13); HUD.text(ctx, 'F1 help  ·  F10 menu  ·  F5 save  ·  Enter chat  ·  speed ' + this.speedName() + ' (+/-)  ·  ' + this.fps + ' fps', ix + 12, y0 + 50, '#8a93a0', 11, false); HUD.text(ctx, 'Seed ' + G.map.seed + '   Frame ' + G.frame, ix + 12, y0 + 68, '#8a93a0', 11, false); }
    // ---- command card ----
    HUD.inset(ctx, cr.x, cr.y, cr.w, cr.h);
    const btns = this.currentCard(); this.tooltip = null;
    for (const b of btns) {
      const bx = cr.x + 4 + (b.slot % 3) * (cr.bw + cr.gap), by = cr.y + 4 + Math.floor(b.slot / 3) * (cr.bh + cr.gap);
      const hov = this.mouse.x >= bx && this.mouse.x < bx + cr.bw && this.mouse.y >= by && this.mouse.y < by + cr.bh;
      const active = this.pending && ((this.pending.kind === 'ability' && b.label === (DATA.abilities[this.pending.abil] || {}).name) || (this.pending.kind !== 'ability' && b.label.toLowerCase().startsWith(this.pending.kind)));
      HUD.bevel(ctx, bx, by, cr.bw, cr.bh, !active, active ? '#2f4a2f' : hov ? '#2a3240' : b.dim ? '#151920' : '#1e2530');
      // icon
      const defId = b.cost && b.cost.id && DATA.all[b.cost.id] ? b.cost.id : null; const gl = HUD.iconFor(b);
      ctx.save(); if (b.dim) ctx.globalAlpha = 0.4;
      const ik = Math.round(32 * cr.k);
      if (defId) ctx.drawImage(Sprites.icon(defId, G.players[G.human].color, ik), bx + cr.bw / 2 - ik / 2, by + Math.round(3 * cr.k));
      else if (gl) HUD.glyph(ctx, gl, bx + cr.bw / 2, by + Math.round(18 * cr.k), Math.round(14 * cr.k), '#cfd6de');
      else { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(bx + cr.bw / 2, by + Math.round(18 * cr.k), 1, bx + cr.bw / 2, by + Math.round(18 * cr.k), 14 * cr.k); g.addColorStop(0, b.energy ? 'rgba(200,120,255,0.9)' : 'rgba(255,200,80,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx + cr.bw / 2, by + Math.round(18 * cr.k), 14 * cr.k, 0, 7); ctx.fill(); ctx.restore(); }
      ctx.restore();
      HUD.hotLabel(ctx, b.label, this.gridKeys ? '' : b.hk, bx, by + cr.bh - Math.round(10 * cr.k), cr.bw, b.dim ? '#7a828c' : '#e6eaf0', Math.max(8, Math.round(10 * cr.k))); if (this.gridKeys && b.hk !== 'Escape') { ctx.font = HUD.font(9); ctx.fillStyle = '#ffe45a'; ctx.fillText(b.hk, bx + 3, by + 10); }
      if (b.hk === 'Escape') { ctx.font = HUD.font(8); ctx.fillStyle = '#ffe45a'; ctx.fillText('ESC', bx + cr.bw - 20, by + 10); }
      if (hov && (b.cost || b.energy)) { const parts = [b.label]; if (b.cost && b.cost.min !== undefined) { parts.push(b.cost.min + ' minerals'); if (b.cost.gas) parts.push(b.cost.gas + ' gas'); if (b.cost.sup) parts.push(b.cost.sup + ' supply'); if (b.cost.time) parts.push(Math.round(b.cost.time / TPS) + 's'); } if (b.energy) parts.push(b.energy + ' energy'); this.tooltip = { lines: parts, x: bx, y: by }; }
    }
    if (this.tooltip) { const t = this.tooltip; ctx.font = HUD.font(11); const tw = Math.max(...t.lines.map(l => ctx.measureText(l).width)) + 16, th = t.lines.length * 15 + 8; const tx = Math.min(t.x, Render.W - tw - 4), ty = t.y - th - 6; HUD.bevel(ctx, tx, ty, tw, th, true, 'rgba(10,12,16,0.95)'); t.lines.forEach((l, i) => HUD.text(ctx, l, tx + 8, ty + 15 + i * 15, i ? (l.includes('minerals') ? '#6fe0ff' : l.includes('gas') ? '#7ee07a' : l.includes('energy') ? '#c86aff' : '#c8d0d8') : '#ffe45a', 11, i === 0)); }
  },
  drawUnitInfo(ctx, u, x, y, w, h) {
    const p = G.players[u.owner]; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    // portrait
    HUD.bevel(ctx, x + 8, y + 8, 80, 80, false, '#0a0d12'); const g = ctx.createRadialGradient(x + 48, y + 48, 4, x + 48, y + 48, 44); g.addColorStop(0, '#1e2a3a'); g.addColorStop(1, '#05070a'); ctx.fillStyle = g; ctx.fillRect(x + 9, y + 9, 78, 78);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 9, y + 9, 78, 78); ctx.clip(); ctx.translate(x + 48, y + 50 + Math.sin(G.frame * 0.05) * 1.5);
    if (u.isBuilding) { const s = Sprites.building(u); const k = Math.min(72 / s.cv.width, 72 / s.cv.height) * 1.05; ctx.scale(k, k); ctx.drawImage(s.cv, -s.cv.width / 2, -s.cv.height / 2 + 4); }
    else { const s = Sprites.unit(u, Sprites.dirOf(-Math.PI / 2 + Math.sin(G.frame * 0.02) * 0.5), Render.animOf(u)); const k = Math.min(2.4, 36 / u.r); ctx.scale(k, k); Sprites.draw(ctx, s, 0, 0); }
    ctx.restore(); ctx.fillStyle = 'rgba(255,255,255,0.04)'; for (let i = 0; i < 78; i += 3) ctx.fillRect(x + 9, y + 9 + i, 78, 1);
    // name + stats
    let ly = y + 24; const tx = x + 100; HUD.text(ctx, u.def.name + (u.halluc ? ' (Hallucination)' : ''), tx, ly, u.owner === G.human ? HUD.accent() : p.color, 14); ly += 16;
    const line = (s, col = '#c8d0d8') => { HUD.text(ctx, s, tx, ly, col, 11, false); ly += 14; };
    let stats = `HP ${Math.ceil(u.hp)}/${u.maxHp}`; if (u.maxSh) stats += `   Shields ${Math.ceil(u.sh)}/${u.maxSh}`; if (u.maxEnergy) stats += `   Energy ${Math.floor(u.energy)}/${u.maxEnergy}`; line(stats);
    if (!u.isBuilding || u.def.gw || u.def.aw) { const parts = []; const wpn = u.sieged ? SIEGE_W : u.def.gw; if (wpn) parts.push(`Ground ${u.wDmg(wpn)}${wpn.hits > 1 ? 'x' + wpn.hits : ''} (${wpn.type[0].toUpperCase()}) range ${u.wRange(wpn)}`); if (u.def.aw) parts.push(`Air ${u.wDmg(u.def.aw)}${u.def.aw.hits > 1 ? 'x' + u.def.aw.hits : ''} range ${u.wRange(u.def.aw)}`); parts.push(`Armor ${u.armor}`); if (u.kills) parts.push(`Kills ${u.kills}`); line(parts.join('   ')); }
    if (u.owner === G.human) {
      const st = { idle: 'Idle', move: 'Moving', attack: 'Attacking', attackmove: 'Attack-moving', gather: u.order.phase === 'mine' ? 'Mining' : u.order.phase === 'inside' ? 'Harvesting gas' : 'Moving to resource', return: 'Returning cargo', build: 'Moving to build', construct: 'Constructing', hold: 'Holding position', patrol: 'Patrolling', ability: 'Casting ' + (u.order.abil ? DATA.abilities[u.order.abil].name : ''), repair: 'Repairing', follow: 'Following', load: 'Boarding', unload: 'Unloading', merge: 'Merging', land: 'Landing' }[u.order.type] || u.order.type;
      if (!u.isBuilding) line(st + (u.mines ? `   Mines ${u.mines}` : '') + (u.def.scarabs !== undefined ? `   Scarabs ${u.scarabs}` : '') + (u.def.interceptors !== undefined ? `   Interceptors ${u.interceptors}` : ''), '#9aa4b0');
      if (u.isBuilding && u.def.spawnsLarva) line(`Larvae ${u.larvae.length}`, '#9aa4b0');
      if (u.isBuilding && !u.done) line(`Constructing ${Math.floor(100 * u.progress / u.def.time)}%` + (u.def.race === 'T' && !(u.builder && u.builder.alive && u.builder.order.target === u) ? '  (no SCV)' : ''), '#ffe45a');
      if (u.isBuilding && u.addon) line(`Add-on: ${u.addon.def.name}${u.addon.done ? '' : ' (building)'}`, '#9aa4b0');
      if (u.prod.length) { const qx = tx, qy = ly + 2; u.prod.forEach((it, i) => { const name = it.kind === 'unit' ? DATA.units[it.id].name : it.kind === 'upg' ? DATA.upgrades[it.id].name + ' L' + it.level : it.kind === 'tech' ? DATA.techs[it.id].name : DATA.buildings[it.id].name; const bx = qx + i * 50; HUD.bevel(ctx, bx, qy, 46, 40, true, '#141922'); if (it.kind === 'unit' || it.kind === 'morph') ctx.drawImage(Sprites.icon(it.id, p.color, 28), bx + 9, qy + 2); else { ctx.font = HUD.font(8); ctx.fillStyle = '#cfd6de'; ctx.fillText(name.slice(0, 9), bx + 3, qy + 18); } if (i === 0) { ctx.fillStyle = '#000'; ctx.fillRect(bx + 3, qy + 32, 40, 5); ctx.fillStyle = '#3fe83f'; ctx.fillRect(bx + 3, qy + 32, 40 * it.progress / it.total, 5); } this.hotspots.push({ x: bx, y: qy, w: 46, h: 40, fn: () => G.cancelProd(u, i) }); }); if (u.prod[0]) { const it = u.prod[0]; const name = it.kind === 'unit' ? DATA.units[it.id].name : it.kind === 'upg' ? DATA.upgrades[it.id].name + ' ' + it.level : it.kind === 'tech' ? DATA.techs[it.id].name : DATA.buildings[it.id].name; HUD.text(ctx, name, tx + u.prod.length * 50 + 6, qy + 26, '#ffe45a', 11); } ly += 46; }
      if (u.cargo.length) { u.cargo.forEach((c, i) => { const bx = tx + i * 34, by = ly + 2; HUD.bevel(ctx, bx, by, 30, 30, true, '#141922'); ctx.drawImage(Sprites.icon(c.def.id, p.color, 26), bx + 2, by + 2); this.hotspots.push({ x: bx, y: by, w: 30, h: 30, fn: () => G.unloadCargo(u, c) }); }); ly += 36; }
      if (u.def.upgA && !u.isBuilding) { const parts = []; if (p.upgLevel(u.def.upgA)) parts.push(`Armor +${p.upgLevel(u.def.upgA)}`); const wpn = u.def.gw || u.def.aw; if (wpn && wpn.upgKey && p.upgLevel(wpn.upgKey)) parts.push(`Weapons +${p.upgLevel(wpn.upgKey)}`); if (u.maxSh && p.upgLevel('shields')) parts.push(`Shields +${p.upgLevel('shields')}`); if (parts.length) line(parts.join('  '), '#9fb8d8'); }
    } else line(p.name, p.color);
    ctx.restore();
  },
  drawTop() {
    const ctx = Render.ctx, p = G.players[G.human];
    const items = [['min', Math.floor(p.minerals), '#dff6ff'], ['gas', Math.floor(p.gas), '#d6f5d0'], ['sup', `${Math.ceil(p.supUsed)}/${p.supMax}`, p.supUsed > p.supMax ? '#ff6a6a' : '#f0f2f4']];
    let x = Render.W - 14; ctx.font = HUD.font(14);
    for (let i = items.length - 1; i >= 0; i--) { const [k, v, col] = items[i]; const tw = ctx.measureText(String(v)).width + 40; HUD.bevel(ctx, x - tw, 6, tw, 24, true, 'rgba(12,15,20,0.85)'); HUD.resIcon(ctx, k, x - tw + 14, 18); HUD.text(ctx, String(v), x - 8, 23, col, 14, true, 'right'); x -= tw + 6; }
    const t = Math.floor(G.frame / TPS); HUD.bevel(ctx, 8, 6, 170, 24, true, 'rgba(12,15,20,0.85)'); HUD.text(ctx, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}   ${RACE_INFO[p.race].name}` + (G.paused ? '   PAUSED' : ''), 16, 23, G.paused ? '#ffe45a' : '#e6eaf0', 13);
    if (this.mode === 'replay') HUD.text(ctx, 'REPLAY  ' + this.speedName() + '  (+/- speed, Ctrl+V perspective, F10 menu)', Render.W / 2, 23, '#ffe45a', 13, true, 'center');
    if (G.mission && !G.mission.done) { const d = G.mission.def; const left = d.minutes ? Math.max(0, d.minutes * 60 - Math.floor((G.frame - G.mission.start) / TPS)) : 0; HUD.text(ctx, 'Objective: ' + d.objective + (d.minutes ? `   ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : ''), 16, 66, '#ffe45a', 12); }
    if (this.net && Net.waitingSince && performance.now() - Net.waitingSince > 800) HUD.text(ctx, 'Waiting for other players...', Render.W / 2, 60, '#ffe45a', 14, true, 'center');
    if (this.net && Net.desynced) HUD.text(ctx, 'DESYNC DETECTED at ' + Net.clock(Net.desyncFrame) + ' — command log saved to a download; the game is no longer in sync', Render.W / 2, 84, '#ff5050', 14, true, 'center');
    if (this.net && !Net.connected && Net.active) HUD.text(ctx, 'Connection lost — leave with F10 and reconnect with the same name to rejoin', Render.W / 2, 108, '#ff5050', 14, true, 'center');
    if (this.pending) HUD.text(ctx, 'Select target: ' + (this.pending.kind === 'ability' ? DATA.abilities[this.pending.abil].name : this.pending.kind) + '  (right-click to cancel)', 16, 48, '#ffe45a', 12);
    if (this.showHelp) this.drawHelp(ctx);
  },
  drawMessages() {
    const ctx = Render.ctx, p = G.players[G.human];
    let y = Render.H - this.consoleH - 14; for (let i = p.msgs.length - 1; i >= 0; i--) { const m = p.msgs[i]; const age = G.frame - m.t; if (age > 24 * 8) continue; const col = m.kind === 'error' ? '#ff8a8a' : m.kind === 'attack' || m.kind === 'nuke' ? '#ff5050' : '#ffe45a'; ctx.globalAlpha = age > 24 * 6 ? 1 - (age - 144) / 48 : 1; HUD.text(ctx, m.text, 14, y, col, 13); ctx.globalAlpha = 1; y -= 18; }
    if (this.chat !== null && this.chat !== undefined) { HUD.bevel(ctx, 10, Render.H - this.consoleH - 40, 420, 24, false, 'rgba(8,10,14,0.9)'); HUD.text(ctx, '> ' + this.chat + (G.frame % 24 < 12 ? '_' : ''), 16, Render.H - this.consoleH - 23, '#e6eaf0', 13); }
    if (this.loading) { const k = (G.frame - this.loading.start) / Math.max(1, this.loading.target - this.loading.start); HUD.bevel(ctx, Render.W / 2 - 160, Render.H / 2 - 30, 320, 60, true, 'rgba(10,12,16,0.95)'); HUD.text(ctx, (this.loading.label || 'Loading... re-simulating') + ' ' + Math.round(k * 100) + '%', Render.W / 2, Render.H / 2 - 6, '#ffe45a', 14, true, 'center'); ctx.fillStyle = '#3fe83f'; ctx.fillRect(Render.W / 2 - 140, Render.H / 2 + 6, 280 * k, 8); }
    this.drawCursor(ctx);
  },
  drawCursor(ctx) {
    const m = this.mouse; if (!m.inside && m.x === 0 && m.y === 0) return; const x = m.x, y = m.y; ctx.save();
    const overUnit = this.hover && y < Render.H - this.consoleH;
    if (this.pending && y < Render.H - this.consoleH) { const enemy = this.hover && this.hover.owner !== G.human; const col = this.pending.kind === 'attack' || enemy ? '#ff4040' : '#3fe83f'; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke(); ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 5, y + dy * 5); ctx.lineTo(x + dx * 14, y + dy * 14); } ctx.stroke(); }
    else if (overUnit) { const col = this.hover.owner === G.human ? '#3fe83f' : '#ff4040'; ctx.strokeStyle = col; ctx.lineWidth = 2; const s = 7; ctx.beginPath(); ctx.moveTo(x - s, y - s + 4); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + 4, y - s); ctx.moveTo(x + s - 4, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + 4); ctx.moveTo(x + s, y + s - 4); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - 4, y + s); ctx.moveTo(x - s + 4, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - 4); ctx.stroke(); }
    else { ctx.fillStyle = '#e9f5ea'; ctx.strokeStyle = '#0a2a10'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 11, y + 11); ctx.lineTo(x + 6, y + 11); ctx.lineTo(x + 9, y + 17); ctx.lineTo(x + 6, y + 18); ctx.lineTo(x + 3, y + 12); ctx.lineTo(x, y + 15); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#3fe83f'; ctx.beginPath(); ctx.moveTo(x + 2, y + 3); ctx.lineTo(x + 8, y + 9); ctx.lineTo(x + 5, y + 9); ctx.lineTo(x + 2, y + 11); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  },
  drawHelp(ctx) {
    const lines = ['CONTROLS', 'Left click / drag: select    Right click: smart command    Shift: queue / add to selection', 'Ctrl+click or double-click: select all of a type on screen', 'M move   S stop   A attack-move   P patrol   H hold   B build   V advanced build', 'Ctrl+1..9 assign group   1..9 select group   Shift+# add   F2-F8 (+Shift) camera saves', 'Esc: cancel / cancel construction or last queued item    Space: jump to last alert', 'Arrow keys or screen edge: scroll    Minimap: click to move, right-click to command', '+ / -: game speed    F9: pause    F10: menu    F1: toggle this help', 'Unit-specific hotkeys are the yellow letters on the command card.'];
    HUD.bevel(ctx, Render.W / 2 - 340, 60, 680, 20 * lines.length + 24, true, 'rgba(10,12,16,0.94)'); lines.forEach((l, i) => HUD.text(ctx, l, Render.W / 2 - 326, 86 + i * 20, i ? '#d0d6de' : '#ffe45a', 13, i === 0));
  },
  drawMenu() {
    const ctx = Render.ctx, m = this.menuItems();
    // Size the panel to its widest line instead of a fixed 440: mission briefings are long enough to be
    // clipped at both edges otherwise, and shrink the text if even the full window is not wide enough.
    ctx.font = '14px sans-serif';
    const widest = m.lines.reduce((n, l) => Math.max(n, ctx.measureText(l).width), 0);
    const w = clamp(Math.ceil(widest) + 80, 440, Render.W - 40);
    const fs = widest + 80 > w ? Math.max(10, Math.floor(14 * (w - 80) / widest)) : 14;
    const h = 130 + m.lines.length * 22 + m.items.length * 46, x = Render.W / 2 - w / 2, y = Render.H / 2 - h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, Render.W, Render.H); HUD.frame(ctx, x, y, w, h);
    HUD.text(ctx, m.title, Render.W / 2, y + 48, m.title === 'VICTORY' ? '#ffe45a' : m.title === 'DEFEAT' ? '#ff5050' : '#e6eaf0', 28, true, 'center');
    m.lines.forEach((l, i) => HUD.text(ctx, l, Render.W / 2, y + 80 + i * 22, '#c8d0d8', fs, false, 'center'));
    this.menuRects = []; m.items.forEach((it, i) => { const by = y + 96 + m.lines.length * 22 + i * 46; const hov = this.mouse.x >= x + 60 && this.mouse.x < x + w - 60 && this.mouse.y >= by && this.mouse.y < by + 38; HUD.bevel(ctx, x + 60, by, w - 120, 38, !hov, hov ? '#2f3a4c' : '#1e2530'); HUD.text(ctx, it[0], Render.W / 2, by + 25, '#e6eaf0', 15, true, 'center'); this.menuRects.push({ x: x + 60, y: by, w: w - 120, h: 38, fn: it[1] }); });
    this.drawCursor(ctx);
  },
});
