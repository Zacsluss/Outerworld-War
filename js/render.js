'use strict';
// ============================================================================
// Renderer: composes terrain chunks, creep, decals, sprites, effects, fog.
// ============================================================================
// The sun. Sprites.light and the rasterizer in tools/raster.js both light from the upper left, so a
// cast shadow falls down and to the right: FLAT squashes the silhouette onto the ground and DX slides
// it off the unit's feet.
//
// Budget note, because it decided the shape of this. Every extra full-sprite blit costs about 2 ms a
// frame at 490 units, and the draw pass had 3.7 ms of headroom against its 6 ms target -- so this
// pass can afford one of them and not two. The silhouette shadow is that one. A rim light was written
// and measured here too, and it belongs in tools/raster.js instead: a lit edge is a property of the
// model under a light, the bake already has an outline pass to hang it on, and there it costs nothing
// per frame. Do not put it back in the draw loop.
const SHADOW_FLAT = 0.42, SHADOW_DX = 5;
// How long a muzzle flash and a shield hit stay up, in sim frames at 24/s. Short: three frames is an
// eighth of a second, which is a flash, and anything longer reads as a unit that is permanently on
// fire once forty marines are shooting at once.
const MUZZLE_F = 3, SHIELD_F = 8, RECOIL_F = 5;
// How far the baked crystal cluster's scree sits above the bottom of its own canvas, so drawResource
// can line that up with the bottom of the patch's tiles rather than centring the two.
const MINERAL_FOOT = 0;
const Render = {
  canvas: null, ctx: null, W: 0, H: 0, camX: 0, camY: 0, viewW: 0, viewH: 0, fogCanvas: null, creepOn: undefined, built: false, lastFrameTime: 0, mini: null,
  init(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.resize(); },
  resize() { this.W = this.canvas.width = Math.max(1, window.innerWidth); this.H = this.canvas.height = Math.max(1, window.innerHeight); this.viewW = this.W; this.viewH = Math.max(1, this.H - UI.consoleH); }, // a hidden or unlaid-out canvas reports 0 and every drawImage of it throws
  reset() { Terrain.reset(G.map.seed); Sprites.clear(); FX.reset(); this.built = false; },
  buildStatic() {
    const m = G.map; this.fogCanvas = document.createElement('canvas'); this.fogCanvas.width = m.w; this.fogCanvas.height = m.h; this.fogImg = null;
    Terrain.resetCreep(); this.creepOn = undefined;
    this.mini = Terrain.buildMini(); this.built = true; this.creepFrame = -1;
  },
  // Creep. This used to compose a viewport-sized layer every frame -- clear it, blow a 2 px-per-tile
  // mask up 16x through the bilinear filter, then pour the creep pattern through it with `source-in`.
  // Three full-viewport operations, and an airbrushed edge as the reward. Terrain.creepChunk caches the
  // whole thing at 8x8 tiles now, keyed by the creep bits, so this is a handful of opaque blits over
  // the creeped part of the screen and every idea about how the border should look moved into the bake.
  //
  // The two rate limits are the same two the old version had, for the same reasons: the map is only
  // re-examined twice a second, because `m.creep` only changes when a creep source finishes or dies,
  // and a view with no creep in it does no work at all.
  drawCreep(ctx) {
    if (this.creepFrame !== G.frame && (G.frame % 12 === 0 || this.creepOn === undefined)) { this.creepOn = Terrain.syncCreep(); this.creepFrame = G.frame; }
    if (!this.creepOn) return;
    const CH = Terrain.CH * TILE, nx = Terrain.creepNx();
    const x0 = Math.max(0, Math.floor(this.camX / CH)), y0 = Math.max(0, Math.floor(this.camY / CH));
    const x1 = Math.min(nx - 1, Math.floor((this.camX + this.viewW) / CH)), y1 = Math.min(Math.ceil(G.map.h / Terrain.CH) - 1, Math.floor((this.camY + this.viewH) / CH));
    Terrain.creepBudget = 2;   // at most two chunk bakes a frame; see Terrain.creepChunk
    const ox = Math.round(this.camX), oy = Math.round(this.camY);   // whole pixels, or the filter eats the dither -- see Terrain.draw
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const cv = Terrain.creepChunk(cx, cy); if (cv) ctx.drawImage(cv, cx * CH - ox, cy * CH - oy);
    }
  },
  frame(alpha) {
    const ctx = this.ctx, m = G.map; if (!ctx || this.viewW < 1 || this.viewH < 1) return; if (!this.built) this.buildStatic();
    const now = performance.now(); const dt = Math.min(0.1, (now - (this.lastFrameTime || now)) / 1000); this.lastFrameTime = now;
    if (!G.paused && !UI.menu) { FX.update(dt); FX.ambient(this.camX, this.camY, this.viewW, this.viewH); }
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
    // Shadows. The unit's own silhouette, sheared away from the light and flattened onto the ground,
    // rather than the ellipse this used to draw -- a marine's shadow is now marine-shaped. The light
    // direction has to match the one baked into the sprites (Sprites.light and the rasterizer both
    // put it at the upper left), or every unit looks lit from one side and shadowed from the other.
    // A flyer's shadow falls further and stays a soft blob, because a sharp silhouette that far from
    // the unit reads as a second unit.
    for (const u of list) {
      if ((u.isBuilding && !u.lifted) || u.burrowed || u.def.mine) continue;
      // A lifted building has no unit silhouette either, for the same reason, so it takes the blob --
      // cast well below it, because it is in the air.
      const sh = (u.fly || u.isBuilding) ? null : Sprites.shadow(u, Sprites.dirOf(u.facing), this.animOf(u));
      if (!sh) { const air = u.fly || u.isBuilding; ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.globalAlpha = u._alpha * (air ? 0.3 : 0.4); const rr = u.isBuilding ? u.def.w * TILE * 0.42 : u.r * 0.95; ctx.beginPath(); ctx.ellipse(u._x + (air ? 14 : 3), u._y + (air ? 26 : u.r * 0.35 + 2), rr, rr * 0.47, 0, 0, 7); ctx.fill(); continue; }
      // Squash straight into drawImage's destination rectangle rather than setting a matrix. A shear
      // would be truer -- a shadow really does lean away from the light -- but a sheared blit is not
      // axis-aligned and cost 4.3 ms a frame at 490 units against a 6 ms budget, where this costs a
      // fraction of that. The silhouette is what makes a marine's shadow marine-shaped; the lean was
      // the expensive half of the effect and the cheap half is the half that reads.
      ctx.globalAlpha = u._alpha * 0.38;
      const S = sh.S;
      ctx.drawImage(sh.cv, sh.sx || 0, sh.sy || 0, S, S, u._x - sh.ox + SHADOW_DX, u._y - sh.oy * SHADOW_FLAT + u.r * 0.3, S, S * SHADOW_FLAT);
    }
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
    if (UI.selection.length === 1 && UI.selection[0].rally && UI.selection[0].owner === G.human) {
      const b = UI.selection[0], r = b.rally;
      // A rally onto a resource is drawn as a ring around the patch, not as a flag planted in it.
      // Brood War does it this way because the two mean different things: a flag is "walk here and
      // wait", a ring is "go and work this". Showing the flag for both is what made it look as though
      // the rally had been set to a bare point in the middle of the minerals.
      if (r.res) { this.drawResourceRing(ctx, r.res, 0.75); }
      else {
        const rx = r.target ? r.target.x : r.x, ry = r.target ? r.target.y : r.y;
        ctx.strokeStyle = 'rgba(80,255,80,0.6)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(rx, ry); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#5f5'; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry - 16); ctx.lineTo(rx + 10, ry - 12); ctx.lineTo(rx, ry - 8); ctx.closePath(); ctx.fill();
      }
    }
    if (UI.placing) this.drawPlacement(ctx);
    this.drawFog(ctx, vis, cx, cy);
    for (const mk of UI.markers) {
      const a = mk.t / 20;
      // A marker carrying a resource is the acknowledgement for targeting a patch: it settles onto the
      // patch's own footprint instead of shrinking to a point, so it reads as the same ring the rally
      // indicator leaves behind rather than as a different thing that happens to be green.
      if (mk.res) { this.drawResourceRing(ctx, mk.res, a); continue; }
      ctx.strokeStyle = `rgba(${mk.color},${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(mk.x, mk.y, 5 + (20 - mk.t) * 0.7, (5 + (20 - mk.t) * 0.7) * 0.6, 0, 0, 7); ctx.stroke();
    }
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
  // A mineral field and a geyser are on screen from the first second of every game to the last, and
  // they were the two least detailed things in it: five flat quads and an ellipse with a gradient.
  // Both are now baked once per (kind, richness) into a small canvas and blitted, because they are
  // static -- a crystal does not animate -- and the draw pass has no room for per-frame gradients.
  resourceSprite(kind, step) {
    const key = kind + step; this._res = this._res || {}; if (this._res[key]) return this._res[key];
    const W = kind === 'mineral' ? 76 : 140, H = kind === 'mineral' ? 62 : 78;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    let s = 987654 + step * 7919;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    if (kind === 'mineral') {
      const n = step >= 4 ? 8 : step >= 2 ? 6 : 4;          // a field visibly empties as it is mined
      c.fillStyle = 'rgba(0,0,0,0.34)'; c.beginPath(); c.ellipse(W / 2, H - 14, 30, 9, 0, 0, 7); c.fill();
      // scree at the base, so the cluster sits in the ground instead of on it
      for (let k = 0; k < 14; k++) { const bx = W / 2 + (rnd() - .5) * 56, by = H - 16 + (rnd() - .5) * 12, br = 1 + rnd() * 2.6; c.fillStyle = 'rgba(30,58,78,' + (0.35 + rnd() * 0.4).toFixed(2) + ')'; c.beginPath(); c.ellipse(bx, by, br, br * .7, 0, 0, 7); c.fill(); }
      const shards = [];
      for (let k = 0; k < n; k++) shards.push({ x: 12 + (k / Math.max(1, n - 1)) * (W - 24) + (rnd() - .5) * 7, base: H - 14 + (rnd() - .5) * 8, h: 16 + rnd() * 20, w: 5 + rnd() * 4, lean: (rnd() - .5) * 5 });
      shards.sort((a, b) => a.base - b.base);
      for (const sh of shards) {
        const tipX = sh.x + sh.lean, tipY = sh.base - sh.h;
        // Three facets per crystal instead of one flat quad: a lit face, a shadow face and a bright
        // spine between them. That is what makes it read as a solid with volume rather than a sticker.
        c.beginPath(); c.moveTo(sh.x - sh.w, sh.base); c.lineTo(tipX - sh.w * .18, tipY); c.lineTo(tipX, tipY + 2); c.lineTo(sh.x, sh.base + 2); c.closePath();
        c.fillStyle = '#1d5f8c'; c.fill();
        c.beginPath(); c.moveTo(sh.x, sh.base + 2); c.lineTo(tipX, tipY + 2); c.lineTo(tipX + sh.w * .22, tipY + 1); c.lineTo(sh.x + sh.w, sh.base); c.closePath();
        const g = c.createLinearGradient(tipX, tipY, sh.x + sh.w, sh.base);
        g.addColorStop(0, '#eafcff'); g.addColorStop(0.35, '#7fdcff'); g.addColorStop(1, '#2b86bd'); c.fillStyle = g; c.fill();
        c.strokeStyle = 'rgba(8,40,62,0.85)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(sh.x - sh.w, sh.base); c.lineTo(tipX - sh.w * .18, tipY); c.lineTo(tipX + sh.w * .22, tipY + 1); c.lineTo(sh.x + sh.w, sh.base); c.stroke();
        c.strokeStyle = 'rgba(230,252,255,0.75)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(tipX, tipY + 2); c.lineTo(sh.x, sh.base + 1); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(tipX - sh.w * .05, tipY + 3, 1.4, 0, 7); c.fill();
      }
    } else {
      // geyser: a cracked rock rim, a dark shaft, and a lit throat
      c.fillStyle = '#3a352a'; c.strokeStyle = '#1b1811'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(W / 2, H / 2, 62, 30, 0, 0, 7); c.fill(); c.stroke();
      for (let k = 0; k < 22; k++) { const a = rnd() * 7, rr = 40 + rnd() * 22, bx = W / 2 + Math.cos(a) * rr, by = H / 2 + Math.sin(a) * rr * 0.48, br = 3 + rnd() * 6; c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(bx + 1, by + 1.5, br, br * .66, 0, 0, 7); c.fill(); const gg = c.createLinearGradient(bx - br, by - br, bx + br, by + br); gg.addColorStop(0, '#6d6552'); gg.addColorStop(1, '#332f26'); c.fillStyle = gg; c.beginPath(); c.ellipse(bx, by, br, br * .66, 0, 0, 7); c.fill(); }
      for (let k = 0; k < 7; k++) { const a = rnd() * 7; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1 + rnd(); c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * 20, H / 2 + Math.sin(a) * 10); c.lineTo(W / 2 + Math.cos(a) * 58, H / 2 + Math.sin(a) * 28); c.stroke(); }
      c.fillStyle = '#241f18'; c.beginPath(); c.ellipse(W / 2, H / 2, 44, 20, 0, 0, 7); c.fill();
      if (step) { const g = c.createRadialGradient(W / 2, H / 2 - 3, 2, W / 2, H / 2, 36); g.addColorStop(0, '#d8ffc0'); g.addColorStop(0.35, '#7ee27a'); g.addColorStop(0.75, '#2f7a3c'); g.addColorStop(1, 'rgba(20,50,26,0.9)'); c.fillStyle = g; c.beginPath(); c.ellipse(W / 2, H / 2, 34, 15, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(190,255,170,0.45)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(W / 2, H / 2, 34, 15, 0, 0, 7); c.stroke(); }
      else { c.fillStyle = '#2e2c28'; c.beginPath(); c.ellipse(W / 2, H / 2, 34, 15, 0, 0, 7); c.fill(); }
    }
    return this._res[key] = { cv, W, H };
  },
  // The ring Brood War puts round a resource you have targeted: an ellipse on the ground matching the
  // patch's footprint, not a circle centred on the sprite, because the sprite overhangs the tiles.
  drawResourceRing(ctx, r, alpha) {
    const cx = (r.x + r.w / 2) * TILE, cy = (r.y + r.h / 2) * TILE;
    const rx = r.w * TILE * 0.62, ry = r.h * TILE * 0.72;
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = '#5f5'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = alpha * 0.45; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx + 3, ry + 3, 0, 0, 7); ctx.stroke();
    ctx.restore();
  },
  drawResource(ctx, r) {
    if (r.type === 'mineral') {
      const step = Math.max(0, Math.min(5, Math.round(r.amount / 1500 * 5)));
      const s = this.resourceSprite('mineral', step);
      // Anchor the cluster's BASE to the bottom of the patch's tiles, not its centre to their centre.
      // A patch is 2x1 tiles (64x32) and this sprite is 76x62, so centring it hung 25 px of crystal --
      // every crystal base and all the scree, the part you actually aim at -- below the clickable
      // area. GameMap.resourceAt only knows about the tiles, so a right-click there found no resource:
      // the rally fell back to a bare point and workers walked to it and stood idle. The tall shards
      // still overhang upward, which is correct and is how Brood War does it too; what must line up is
      // the ground contact.
      ctx.drawImage(s.cv, r.x * TILE + r.w * TILE / 2 - s.W / 2, (r.y + r.h) * TILE - s.H + MINERAL_FOOT);
    } else {
      const s = this.resourceSprite('gas', r.amount > 0 ? 1 : 0);
      ctx.drawImage(s.cv, r.cx - s.W / 2, r.cy - s.H / 2);
      // the vapour is the only part that moves, so it is the only part not baked
      if (r.amount > 0 && (!r.building || !r.building.alive)) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 4; k++) { const t = ((G.frame / 50) + k / 4) % 1; ctx.fillStyle = 'rgba(160,255,140,' + (0.3 * (1 - t)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(r.cx + Math.sin(k * 2 + t * 6) * 11, r.cy - 6 - t * 42, 5 + t * 12, 0, 7); ctx.fill(); }
        ctx.restore();
      }
    }
  },
  drawUnit(ctx, u) {
    const x = u._x, y = u._y;
    if (u.isBuilding && !u.lifted) { this.drawBuilding(ctx, u); return; }
    // A LIFTED building fell straight through to the unit path below, which asks Sprites.unit for a
    // sheet no building has -- and the vector fallback is `UNIT_PAINTERS[id] || UNIT_PAINTERS.marine`.
    // So a Command Center in the air was drawn as a marine. It gets its own sprite, at its flying
    // position rather than its old tile, with a hover bob and thrusters underneath.
    if (u.isBuilding && u.lifted) {
      const bs = Sprites.building(u), bob = Math.sin(G.frame * 0.05 + u.id) * 2.2;
      ctx.save(); ctx.globalAlpha = u._alpha;
      ctx.globalCompositeOperation = 'lighter';
      for (const dx of [-bs.W * 0.28, bs.W * 0.28]) {
        const g = ctx.createRadialGradient(x + dx, y + bs.H * 0.34 + bob, 0, x + dx, y + bs.H * 0.34 + bob, 9);
        g.addColorStop(0, 'rgba(150,205,255,0.55)'); g.addColorStop(1, 'rgba(90,150,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + dx, y + bs.H * 0.34 + bob, 9, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(bs.cv, x - bs.W / 2 - bs.M, y - bs.H / 2 - bs.T + bob);
      ctx.restore();
      this.drawStatus(ctx, u, x, y);
      return;
    }
    ctx.save(); ctx.globalAlpha = u._alpha * (u.fx.stasis > 0 ? 0.6 : 1);
    if (u.burrowed && !u.def.mine) { ctx.fillStyle = 'rgba(60,30,70,0.7)'; ctx.beginPath(); ctx.ellipse(x, y, u.r, u.r * .55, 0, 0, 7); ctx.fill(); ctx.fillStyle = G.players[u.owner].color; ctx.fillRect(x - 3, y - 2, 6, 4); ctx.restore(); return; }
    if (u.def.mine) { ctx.globalAlpha *= u.burrowed ? 0.5 : 1; ctx.fillStyle = '#4a5058'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.fillStyle = (G.frame % 20 < 10) ? '#ff3030' : '#802020'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); ctx.restore(); return; }
    const s = Sprites.unit(u, Sprites.dirOf(u.facing), this.animOf(u));
    let bob = 0, sc = 1; if (u.moving && !u.fly && u.def.bio) bob = Math.sin(G.frame * 0.7 + u.id) * 1.2; if (u.fly) bob = Math.sin(G.frame * 0.08 + u.id) * 2; if (u.def.id === 'zergling' && u.moving) sc = 1 + Math.sin(G.frame * 0.9 + u.id) * 0.06;
    if (u.morphT > 0) { ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(G.frame * 0.3); }
    // Weight, part two. A unit that translates and rotates rigidly reads as a chess piece being slid;
    // mass shows up as lag. Both cues here are derived from state the simulation already keeps, so
    // nothing new is stored on the unit and nothing can leak back into it (invariant 3).
    //
    // Lean: the gap between where the unit is pointing and where it is trying to go is exactly what
    // Unit.tickMove turns on, so leaning by it means a tank heels over into a turn and comes upright
    // as it finishes -- no history required.
    // Recoil: a kick straight back along the barrel for the first few frames after a shot, biggest for
    // the heavy guns. This is what makes a siege tank feel like it weighs sixty tons.
    let lean = 0, kick = 0;
    if (!u.isBuilding) {
      if (u.moving && (u.order.type === 'move' || u.order.type === 'attackmove' || u.order.type === 'patrol') && u.order.x !== undefined) {
        let d = Math.atan2(u.order.y - u.y, u.order.x - u.x) - u.facing;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        lean = Math.max(-0.16, Math.min(0.16, d * 0.16));
      }
      if (u.lastFire !== undefined && G.frame - u.lastFire < RECOIL_F) {
        const w = u.def.gw || u.def.aw;
        kick = (1 - (G.frame - u.lastFire) / RECOIL_F) * Math.min(3.2, ((w && w.dmg) || 8) * 0.05);
      }
    }
    ctx.translate(x - Math.cos(u.facing) * kick, y + bob - Math.sin(u.facing) * kick);
    if (lean) ctx.rotate(lean);
    if (sc !== 1) ctx.scale(sc, 1 / sc);
    if (u.def.id === 'archon' || u.def.id === 'dark_archon') { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, 0, 2, 0, 0, u.r * 1.8); g.addColorStop(0, u.def.id === 'archon' ? 'rgba(120,200,255,0.6)' : 'rgba(200,80,255,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, u.r * 1.8 + Math.sin(G.frame * 0.3) * 3, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    Sprites.draw(ctx, s, 0, 0);
    // Muzzle flash and shield hit. Both are read off simulation state the draw pass already reads --
    // u.lastFire drives the attack animation two lines up, u.lastHit and u.sh drive the health bars --
    // so neither needs a new effect kind in combat.js, and the build stamp stays where it is. Nothing
    // here is stored: a frame that is not drawn leaves no trace, which is what keeps replays honest.
    if (u.lastFire !== undefined && G.frame - u.lastFire < MUZZLE_F && !u.def.worker && (u.def.gw || u.def.aw)) {
      const k = 1 - (G.frame - u.lastFire) / MUZZLE_F, mx = Math.cos(u.facing) * u.r * 0.95, my = Math.sin(u.facing) * u.r * 0.95, rad = 3 + 7 * k;
      // One gradient, baked once, blitted scaled. Building the gradient per flash per frame was 0.8 ms
      // at 490 units -- most of a battle is units that fired this frame, so "only when firing" is not
      // the small set it sounds like.
      const fl = this.muzzleSprite(), a0 = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a0 * 0.8 * k;
      ctx.drawImage(fl, mx - rad, my - rad, rad * 2, rad * 2);
      ctx.globalAlpha = a0; ctx.globalCompositeOperation = 'source-over';
    }
    if (u.maxSh > 0 && u.sh > 0 && G.frame - u.lastHit < SHIELD_F) {
      const k = 1 - (G.frame - u.lastHit) / SHIELD_F;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(126,192,255,' + (0.6 * k).toFixed(3) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, u.r + 1 + (1 - k) * 3, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (u.halluc) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(100,180,255,0.25)'; ctx.beginPath(); ctx.arc(0, 0, u.r + 2, 0, 7); ctx.fill(); }
    ctx.restore();
    this.drawStatus(ctx, u, x, y);
  },
  // The muzzle flash, drawn once into a small canvas and reused. White-hot core to transparent orange.
  muzzleSprite() {
    if (this._muzzle) return this._muzzle;
    const S = 32, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,246,214,1)'); g.addColorStop(0.35, 'rgba(255,208,120,0.75)'); g.addColorStop(1, 'rgba(255,150,40,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    return this._muzzle = cv;
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
    // Fidget. A unit standing still used to cycle its four idle frames forever at a fixed rate, which
    // is a loop, not life -- a line of marines all breathing is uncanny in a way that stillness is
    // not. It rests on frame 0 most of the time now and every so often runs the cycle once, on a
    // period derived from its id so no two units twitch together. Still pure G.frame: nothing is
    // stored, so it cannot reach the simulation and a replay looks the same as the game did.
    const period = 210 + (u.id * 37) % 190, t = (G.frame + u.id * 53) % period;
    if (t >= Sprites.IDLE_FRAMES * 7) return 'i0';
    return 'i' + (Math.floor(t / 7) % Sprites.IDLE_FRAMES);
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
    if (u.done) this.drawDamage(ctx, u, x0, y0, W, H);
    if (u.done && u.unpowered) { ctx.fillStyle = '#ff5050'; ctx.font = 'bold 10px Arial'; ctx.fillText('UNPOWERED', x0 + W / 2 - 30, y0 + H / 2); }
    if (u.hasNuke) { ctx.fillStyle = G.frame % 20 < 10 ? '#ff3030' : '#902020'; ctx.beginPath(); ctx.arc(x0 + W / 2, y0 - 6, 5, 0, 7); ctx.fill(); }
  },
  // Visible damage at two thresholds, in each race's own idiom. Render-only and deterministic in
  // G.frame, so nothing here can feed back into the simulation. Terran structures already catch fire
  // below a third (that part is in sim.js because it costs hp); this adds the look of it and gives the
  // other two races an equivalent.
  drawDamage(ctx, u, x0, y0, W, H) {
    const hr = u.hp / u.maxHp;
    if (hr >= 0.66 || u._alpha < 0.4) return;
    const heavy = hr < 0.33, race = u.def.race;
    const f = G.frame, seed = u.id * 2654435761;
    // deterministic per-building jitter, so the cracks do not crawl around between frames
    const rnd = i => { const v = Math.sin((seed + i * 374761393) % 65536) * 43758.5453; return v - Math.floor(v); };
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, W, H); ctx.clip();
    ctx.globalAlpha = u._alpha * (heavy ? 0.9 : 0.7);
    const n = heavy ? 5 : 3;
    if (race === 'T') {
      // scorched plating and buckled panels, plus smoke that thickens with the damage
      ctx.strokeStyle = 'rgba(20,16,12,0.85)'; ctx.lineWidth = heavy ? 2.2 : 1.4;
      for (let i = 0; i < n; i++) {
        const sx = x0 + rnd(i) * W, sy = y0 + rnd(i + 9) * H;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (rnd(i + 3) - 0.5) * W * 0.5, sy + (rnd(i + 5) - 0.5) * H * 0.6);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = heavy ? 'rgba(60,40,30,0.5)' : 'rgba(80,60,45,0.28)';
      for (let i = 0; i < n; i++) { const sx = x0 + rnd(i + 20) * W, sy = y0 + rnd(i + 30) * H; ctx.beginPath(); ctx.ellipse(sx, sy, W * 0.18, H * 0.16, 0, 0, 7); ctx.fill(); }
    } else if (race === 'Z') {
      // necrotic patches and ichor running down the shell
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = heavy ? 'rgba(50,60,30,0.55)' : 'rgba(70,80,45,0.3)';
      for (let i = 0; i < n; i++) { const sx = x0 + rnd(i) * W, sy = y0 + rnd(i + 7) * H; ctx.beginPath(); ctx.ellipse(sx, sy, W * 0.2, H * 0.18, 0, 0, 7); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = heavy ? 'rgba(140,190,60,0.7)' : 'rgba(130,170,70,0.4)'; ctx.lineWidth = heavy ? 2.4 : 1.6;
      for (let i = 0; i < n; i++) {
        const sx = x0 + rnd(i + 11) * W, sy = y0 + rnd(i + 13) * H * 0.5;
        const drip = (heavy ? 10 : 5) + ((f * 0.35 + i * 17 + u.id) % (heavy ? 14 : 8));
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + drip); ctx.stroke();
      }
    } else {
      // failed shielding: dark rents in the hull with plasma arcing across them
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = heavy ? 'rgba(40,35,60,0.55)' : 'rgba(60,55,80,0.3)';
      for (let i = 0; i < n; i++) { const sx = x0 + rnd(i) * W, sy = y0 + rnd(i + 4) * H; ctx.beginPath(); ctx.ellipse(sx, sy, W * 0.17, H * 0.15, 0, 0, 7); ctx.fill(); }
      ctx.globalCompositeOperation = 'lighter';
      const arcs = heavy ? 3 : 1;
      for (let i = 0; i < arcs; i++) {
        if (((f + u.id + i * 7) % (heavy ? 7 : 19)) > 2) continue; // arcs snap on briefly rather than glowing steadily
        const sx = x0 + rnd(i + 15) * W, sy = y0 + rnd(i + 17) * H;
        ctx.strokeStyle = 'rgba(150,200,255,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        for (let k = 1; k <= 3; k++) ctx.lineTo(sx + (rnd(i * 4 + k) - 0.5) * W * 0.35, sy + (rnd(i * 4 + k + 40) - 0.5) * H * 0.35);
        ctx.stroke();
      }
    }
    ctx.restore();
    // smoke for everyone once it is serious; Terran already has fire from the simulation side
    if (typeof FX !== 'undefined' && (f + u.id) % (heavy ? 12 : 34) === 0)
      FX.smoke(x0 + W * (0.25 + rnd(f % 7) * 0.5), y0 + H * 0.3, 1, heavy ? 1.1 : 0.7);
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
