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
// Shadows are pooled into their own layer at SHADOW_SS of the viewport and blitted once at SHADOW_A,
// instead of being composited one at a time straight onto the scene. Two reasons, one of each kind.
// Cost: this was a second full-sprite blit per unit, and by the draw pass's own exchange rate that is
// about 2 ms of the budget at 490 units; a half-size layer is a quarter of the fill. Correctness: two
// overlapping shadows used to double-darken, because each carried its own alpha. Pooled, the layer is
// simply opaque wherever any silhouette landed and the alpha is applied once, which is what a shadow
// actually does. Half resolution is invisible on something drawn at 38% alpha and squashed to 42%
// height -- the upscale softens the edge by about a pixel, on an edge that is already soft.
const SHADOW_SS = 0.5, SHADOW_A = 0.38;
// The canvas used to be sized in CSS pixels, so on any display with scaling -- a HiDPI panel, or
// Windows at 125% -- the browser stretched the whole frame to fit the physical pixels and everything
// went soft. The backing store is physical pixels now and the context carries a scale, which keeps
// every coordinate in the code (and every mouse event, which arrives in CSS pixels) exactly as it was.
// It is very nearly free, which was not the expectation. Four times the pixels ought to cost four times
// the fill, so this was written expecting to have to pick a cautious cap. Measured instead, at 490 units
// and a 1920x1080 viewport (test/perf_render.js takes a dpr argument now):
//
//   dpr 1     1920x1080   2.80 ms median   p95 3.3   max 4.8
//   dpr 1.25  2400x1350   2.80 ms          p95 3.2   max 3.4
//   dpr 1.5   2880x1620   2.80 ms          p95 3.3   max 4.1
//   dpr 2     3840x2160   2.90 ms          p95 3.5   max 4.7
//
// Full 4K costs a tenth of a millisecond. Canvas2D here is GPU-composited, so this pass is bound by the
// number of draw calls and not by how many pixels each one covers -- which is the same reason the per-
// unit blit is the thing to budget in and the resolution is not. The cap is 2 because that is the point
// past which the sheets have no detail left to show, not because of the frame budget.
//
// What this sharpens is only what is drawn as geometry: HUD text, bevels and panels, selection rings,
// health bars, particles, projectiles, decals, the shadow blobs. It does NOT sharpen the world. Terrain
// and creep are cached chunk canvases baked at CH * TILE, sprites come off fixed-size sheets, and the
// fog and minimap are bitmaps -- all of them are blitted at their natural size and so are upscaled by
// the ratio, exactly as the browser was already upscaling them. Making those sharper means baking them
// at the ratio too, which for the sheets is a four-fold blow-up of both the files and the tinted-sheet
// ceiling, and is a separate decision about whether the art should be crisper or stay chunky.
//
// Integer ratios only, which is the part that is not cosmetic. Terrain.draw blits chunks on whole
// pixels on purpose: a chunk at a fractional offset goes through the bilinear filter and the first
// thing that filter removes is the 1 px ordered dither the posterise pass puts in, which is the period
// look on the whole screen. That rounding is in CSS pixels, so at a fractional ratio -- 1.5 is the
// common one -- a whole CSS pixel is one and a half device pixels and every chunk lands half a device
// pixel off. Flooring keeps the invariant true: at ratio 2 a whole CSS pixel is exactly two device
// pixels and nothing moves. A 1.5 display therefore gets no change from before, which is correct until
// the chunk bake is ratio-aware.
const DPR_CAP = 2;
// How long a muzzle flash and a shield hit stay up, in sim frames at 24/s. Short: three frames is an
// eighth of a second, which is a flash, and anything longer reads as a unit that is permanently on
// fire once forty marines are shooting at once.
const MUZZLE_F = 3, SHIELD_F = 8, RECOIL_F = 5;
// Weight, continued. RECOIL_F above is the first half of this language -- a kick straight back along
// the barrel, biggest for the heavy guns -- and these are the second: the same axis, driven by the
// unit's own acceleration instead of by its weapon.
//
// A body on a chassis is a mass on a spring. Feed it the frame-to-frame change in speed and it lags
// behind under acceleration, overshoots forward under braking, and rings down to rest in about half a
// second: start, stop and settle, from one integrator with no special cases. SETTLE_K is the spring,
// SETTLE_D the damping (under 1, or it never stops), SETTLE_IMP how hard a change in speed shoves it,
// and SETTLE_MAX the clamp -- past about three pixels the sprite visibly separates from its own shadow.
const SETTLE_K = 0.20, SETTLE_D = 0.66, SETTLE_IMP = 0.62, SETTLE_MAX = 3.4;
// The same acceleration, as a stretch along the direction of travel: a body leaning into the pull. Kept
// small deliberately -- this is anticipation, and at more than a few percent a marine reads as rubber.
const LEAN_STRETCH = 0.075;
// Legibility at scale. Below RIM_ON units on screen a battle is legible on its own and the rim is off
// entirely; by RIM_FULL it is at full strength. Tying it to the count means a twelve-marine skirmish
// looks exactly as it did and a four-hundred-unit brawl gets the help, which is the situation the idea
// is actually about. RIM_A is the ceiling, and it is low on purpose: this is meant to be read, not seen.
const RIM_ON = 80, RIM_FULL = 240, RIM_A = 0.5, RIM_HURT = 0.35;
// How far the baked crystal cluster's scree sits above the bottom of its own canvas, so drawResource
// can line that up with the bottom of the patch's tiles rather than centring the two.
const MINERAL_FOOT = 0;
// ---------------------------------------------------------------------------
// Strategic zoom
// ---------------------------------------------------------------------------
// One number multiplies the base transform and everything downstream is written in world coordinates,
// so the whole renderer follows for free. What does NOT follow for free is legibility, and that is the
// entire feature: a marine drawn at 38 px is a marine, a marine drawn at 9 px is a smudge, and a screen
// of smudges is worse than no zoom at all. Below ZOOM_ICON the sprites are replaced by role icons at a
// fixed SCREEN size, so pulling further back stops making units smaller and starts making the map
// smaller, which is the thing Supreme Commander got right and nobody copied.
//
// ZOOM_MAX is 2.6 because past that the baked sheets have no detail left to magnify -- the same
// argument DPR_CAP is 2 for. ZOOM_MIN is a floor under the map-fit clamp in clampZoom, not the usual
// limit: on any map bigger than the viewport the fit is the binding constraint and is much larger.
//
// ZOOM_ICON is 0.5 because that is where a small unit's sprite drops under about 20 px. It is a
// crossover, not a cliff: at 0.5 the icons are barely bigger than the sprites they replace, and they
// stay that size all the way out while everything else shrinks around them.
const ZOOM_MIN = 0.1, ZOOM_MAX = 2.6, ZOOM_ICON = 0.5;
// Icon half-size in SCREEN pixels by unit size class, and the floor for a building (whose icon is its
// own footprint until the footprint gets too small to see). These are half-sizes, so a medium unit's
// icon is 11 px across whatever the zoom is.
const ICON_HS = { small: 4.6, medium: 5.5, large: 7 }, ICON_HB = 5;
const Render = {
  canvas: null, ctx: null, dpr: 1, W: 0, H: 0, camX: 0, camY: 0, viewW: 0, viewH: 0, zoom: 1, fogCanvas: null, shadowBuf: null, shadowCtx: null, creepOn: undefined, built: false, lastFrameTime: 0, mini: null,
  // Render-side motion state, keyed by unit id: the settle spring and the last speed it saw. It lives
  // here rather than on the unit for the reason invariant 3 exists -- a field on a Unit is inside the
  // reflective snapshot walk and would travel into saves and across the network, where a cosmetic
  // spring has no business being. Keyed by id and pruned, so a dead unit's entry goes away by itself.
  motion: new Map(), motionFrame: -1, hazeBuf: null, hazeCtx: null,
  init(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.resize(); },
  resize() { // a hidden or unlaid-out canvas reports 0 and every drawImage of it throws
    const c = this.canvas;
    this.dpr = Math.max(1, Math.min(DPR_CAP, Math.floor(window.devicePixelRatio || 1)));   // integer only -- see DPR_CAP
    this.W = Math.max(1, window.innerWidth); this.H = Math.max(1, window.innerHeight);
    c.width = Math.round(this.W * this.dpr); c.height = Math.round(this.H * this.dpr);
    c.style.width = this.W + 'px'; c.style.height = this.H + 'px';   // or the element lays out at its backing size
    this.viewW = this.W; this.viewH = Math.max(1, this.H - UI.consoleH);
    this.zoom = this.clampZoom(this.zoom);   // the map-fit floor moves with the viewport
    this.clampCam();
  },
  // The base transform every draw on the main context sits on: set at the top of a frame and never
  // reset to identity, so the HUD, the menus and the shadow blit all inherit it. It is SCREEN space and
  // deliberately carries no zoom -- the HUD, the console and the pooled layers are all composed in
  // screen pixels, and every one of them blits back through here.
  base(ctx) { ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); },
  // ---------------- the zoom API ----------------
  // Three entry points and four derived readings. Nothing here is wired to an input device: js/ui.js
  // owns the wheel, the keys and the camera clamp, and calls setZoom/zoomAt.
  //
  // The floor is the zoom at which the whole map fits in the viewport, because past that the extra
  // screen is void. It is recomputed rather than stored: the viewport changes on every resize and the
  // map changes on every game, and a stored floor would be wrong after either. Capped at 1 so a map
  // SMALLER than the viewport -- a 64x64 in a tall window -- cannot produce a floor above 1 and jam
  // the clamp inside out.
  fitZoom() {
    const m = (typeof G !== 'undefined' && G && G.map) || null;
    if (!m || !m.w || !m.h) return ZOOM_MIN;
    return Math.min(this.viewW / Math.max(1, m.w * TILE), this.viewH / Math.max(1, m.h * TILE));
  },
  clampZoom(z) {
    if (typeof z !== 'number' || !isFinite(z) || z <= 0) return this.zoom;   // NaN, 0, Infinity, a string
    const lo = Math.max(ZOOM_MIN, Math.min(1, this.fitZoom()));
    return z < lo ? lo : z > ZOOM_MAX ? ZOOM_MAX : z;
  },
  // The live bounds, for anything outside this file that wants to show where the zoom is -- a slider,
  // a readout, a minimap that draws the viewport rectangle. `lo` is what clampZoom will actually
  // enforce on this map at this viewport, which is usually the map fit rather than ZOOM_MIN.
  zoomLimits() { return { lo: Math.max(ZOOM_MIN, Math.min(1, this.fitZoom())), hi: ZOOM_MAX, icon: ZOOM_ICON, fit: this.fitZoom() }; },
  // Zoom about the centre of the viewport, which is what a key or a slider should do.
  setZoom(z) { return this.zoomAt(z, this.viewW / 2, this.viewH / 2); },
  // Zoom about a screen point, which is what a wheel should do: the world under the cursor stays under
  // the cursor. camX + sx/z is that world point, so holding it fixed across the change gives the camera
  // shift directly. At a map edge clampCam wins and the point slides, which is correct -- there is no
  // camera position that would have kept it.
  zoomAt(z, sx, sy) {
    const old = this.zoom, nz = this.clampZoom(z);
    if (nz !== old && isFinite(sx) && isFinite(sy)) {
      this.camX += sx / old - sx / nz;
      this.camY += sy / old - sy / nz;
      this.zoom = nz;
    }
    this.clampCam();
    return this.zoom;
  },
  // How much WORLD the viewport shows. Every camera clamp, cull test and layer transform is written in
  // terms of these two rather than viewW/viewH, which is the whole of what "make everything downstream
  // respect it" comes to.
  viewWorldW() { return this.viewW / this.zoom; },
  viewWorldH() { return this.viewH / this.zoom; },
  screenToWorld(sx, sy) { return [this.camX + sx / this.zoom, this.camY + sy / this.zoom]; },
  worldToScreen(wx, wy) { return [(wx - this.camX) * this.zoom, (wy - this.camY) * this.zoom]; },
  iconMode() { return this.zoom < ZOOM_ICON; },
  // The camera clamp lives here rather than in js/ui.js because it now depends on the zoom, and two
  // copies of a rule that has to agree is how a camera ends up in two places at once. When the view is
  // WIDER than the map -- which zooming out past the fit does on the axis the fit was not decided by --
  // there is no legal range at all, so the map is centred; clamp(v, 0, negative) returns 0 and would
  // jam it against a corner instead.
  clampCam() {
    const m = (typeof G !== 'undefined' && G && G.map) || null; if (!m || !m.w) return;
    const wW = this.viewWorldW(), wH = this.viewWorldH(), mw = m.w * TILE, mh = m.h * TILE;
    this.camX = wW >= mw ? (mw - wW) / 2 : clamp(this.camX, 0, mw - wW);
    this.camY = wH >= mh ? (mh - wH) / 2 : clamp(this.camY, 0, mh - wH);
  },
  // The team-colour caches go too. They are keyed on the owner's INDEX, and the same index is a
  // different colour in the next game -- so a cache that survives `reset` draws the second game's
  // rims and icons in the first game's colours. That was already true of the rim cache and had never
  // been reachable, because nothing else was keyed that way; adding a second one of the same shape is
  // reason enough to fix the pattern rather than copy it.
  reset() { Terrain.reset(G.map.seed); Sprites.clear(); FX.reset(); this.built = false; this.motion.clear(); this.motionFrame = -1; this.zoom = 1; this._rimRGB = this._icoRGB = null; },
  // The pooled shadow layer, cleared and put into world space so the draw calls above can keep using
  // world coordinates unchanged. Reallocated only when the viewport changes size.
  shadowLayer() {
    const w = Math.max(1, Math.ceil(this.viewW * SHADOW_SS)), h = Math.max(1, Math.ceil(this.viewH * SHADOW_SS));
    let cv = this.shadowBuf;
    if (!cv || cv.width !== w || cv.height !== h) { cv = this.shadowBuf = document.createElement('canvas'); cv.width = w; cv.height = h; this.shadowCtx = cv.getContext('2d'); }
    const c = this.shadowCtx;
    // The layer is viewport-sized and the zoom goes into its transform, not into its size: it is a
    // screen-space buffer that happens to be addressed in world coordinates, exactly like the scene.
    const s = SHADOW_SS * this.zoom;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    c.setTransform(s, 0, 0, s, -this.camX * s, -this.camY * s);
    return c;
  },
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
  // Terrain chunks are cached by content, and a destructible feature changes the ground underneath one
  // without changing anything the cache key knows about -- so a dropped bridge would go on being drawn
  // until the chunk happened to be evicted. map.featureRev() is derived from the grids rather than
  // counted, so it is still correct after a replay seek restores an older state.
  syncFeatures() {
    const m = G.map; if (!m.featureRev) return;
    const rev = m.featureRev();
    if (rev !== this._featRev) { this._featRev = rev; Terrain.chunks.clear(); Terrain.clearOverview(); this.mini = Terrain.buildMini(); }
  },
  drawCreep(ctx) {
    if (this.creepFrame !== G.frame && (G.frame % 12 === 0 || this.creepOn === undefined)) { this.creepOn = Terrain.syncCreep(); this.creepFrame = G.frame; }
    if (!this.creepOn) return;
    const CH = Terrain.CH * TILE, nx = Terrain.creepNx(), z = this.zoom;
    const x0 = Math.max(0, Math.floor(this.camX / CH)), y0 = Math.max(0, Math.floor(this.camY / CH));
    const x1 = Math.min(nx - 1, Math.floor((this.camX + this.viewWorldW()) / CH)), y1 = Math.min(Math.ceil(G.map.h / Terrain.CH) - 1, Math.floor((this.camY + this.viewWorldH()) / CH));
    Terrain.creepBudget = 2;   // at most two chunk bakes a frame; see Terrain.creepChunk
    // Whole pixels, or the filter eats the dither -- see Terrain.draw. Only at zoom 1: at any other
    // zoom the blit is resampled anyway and rounding the camera would just make the creep crawl
    // against the terrain under it by up to a pixel as you scroll.
    const ox = z === 1 ? Math.round(this.camX) : this.camX, oy = z === 1 ? Math.round(this.camY) : this.camY;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const cv = Terrain.creepChunk(cx, cy); if (cv) ctx.drawImage(cv, cx * CH - ox, cy * CH - oy);
    }
  },
  frame(alpha) {
    const ctx = this.ctx, m = G.map; if (!ctx) return; this.base(ctx);
    // CLEAR FIRST. Nothing here cleared the canvas until the strategic zoom shipped, and nothing had
    // to: at zoom 1 the terrain always covers the whole viewport, so every pixel was overwritten every
    // frame by definition. Once you can zoom out past the map fit that stops being true -- the view is
    // wider than the world, and the pixels outside the map are simply never written again. They keep
    // whatever the last frame that DID reach them left there, so panning at minimum zoom smears copies
    // of the map's edge across the void and they accumulate: reported, exactly, as "the left side of
    // the screen is replicated infinitely".
    //
    // Unconditional rather than "only when the view is bigger than the map". One viewport fill is a
    // single GPU-composited op -- this repo has already measured that four times the pixels costs
    // almost nothing, because the budget is draw CALLS -- and a clear that is only sometimes correct
    // is the kind of thing that comes back.
    ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, this.W, this.H);
    if (this.viewW < 1 || this.viewH < 1) return; if (!this.built) this.buildStatic();
    const now = performance.now(); const dt = Math.min(0.1, (now - (this.lastFrameTime || now)) / 1000); this.lastFrameTime = now;
    // The zoom, and the two numbers everything downstream is written against. wW/wH is how much WORLD
    // the viewport shows -- at zoom 1 it is exactly viewW/viewH and every expression below reduces to
    // what it was, which is why turning the feature off is free rather than merely cheap.
    const z = this.zoom, wW = this.viewW / z, wH = this.viewH / z, icons = z < ZOOM_ICON;
    if (!G.paused && !UI.menu) { FX.update(dt); FX.ambient(this.camX, this.camY, wW, wH); }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.viewW, this.viewH); ctx.clip();
    // The clip is in screen pixels and is set before the scale on purpose; everything after it is in
    // world coordinates. Skipped entirely at zoom 1 so the transform is bit-identical to before.
    if (z !== 1) ctx.scale(z, z);
    const cx = this.camX, cy = this.camY;
    this.syncFeatures();
    Terrain.draw(ctx, cx, cy, wW, wH, z);
    this.drawCreep(ctx);
    ctx.translate(-cx, -cy);
    const hp = G.players[G.human]; const vis = UI.viewAll ? G.allVis() : hp.vis;
    const inView = (x, y, r) => x + r > cx && x - r < cx + wW && y + r > cy && y - r < cy + wH;
    const seen = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inb(tx, ty) && vis[ty * m.w + tx] > 0; };
    const visNow = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inb(tx, ty) && vis[ty * m.w + tx] === 2; };
    // One fillRect per psi tile, so the cost is the number of TILES on screen -- which zooming out
    // multiplies by up to twenty. Nobody places a pylon from orbit, so it is skipped in icon mode.
    if (!icons && UI.placing && UI.placing.def.needsPsi) { const p = m.psi[G.human]; if (p) { ctx.fillStyle = 'rgba(80,140,255,0.13)'; for (let ty = Math.floor(cy / TILE); ty < (cy + wH) / TILE; ty++) for (let tx = Math.floor(cx / TILE); tx < (cx + wW) / TILE; tx++) if (m.inb(tx, ty) && p[m.idx(tx, ty)]) ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE); } }
    FX.drawTracks(ctx, inView);   // under the decals: a corpse fell on top of the ruts, not into them
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
    this.tickMotion(list);   // one pass per SIM frame, whatever the frame rate; see tickMotion
    // Shadows. The unit's own silhouette, sheared away from the light and flattened onto the ground,
    // rather than the ellipse this used to draw -- a marine's shadow is now marine-shaped. The light
    // direction has to match the one baked into the sprites (Sprites.light and the rasterizer both
    // put it at the upper left), or every unit looks lit from one side and shadowed from the other.
    // A flyer's shadow falls further and stays a soft blob, because a sharp silhouette that far from
    // the unit reads as a second unit.
    // Below ZOOM_ICON the whole sprite half of the pass -- shadow layer, per-unit blit, rims, status
    // marks, health bars -- is replaced by drawIcons, which is a handful of batched paths. That is not
    // only for legibility: at zoom 0.25 the viewport holds twenty times the world, so it holds every
    // unit in the game, and twenty times the sprite blits is not a budget anybody has.
    if (icons) this.drawIcons(ctx, list);
    else this.drawSprites(ctx, list);
    // projectiles
    for (const p of G.projectiles) { if (!inView(p.x, p.y, 10) || !visNow(p.x, p.y)) continue; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const col = p.kind === 'interceptor' ? '#cfe6ff' : p.kind === 'yamato' ? '#ff6a4a' : '#ffd060'; const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.kind === 'yamato' ? 14 : 7); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'yamato' ? 14 : 7, 0, 7); ctx.fill(); if (p.kind === 'interceptor') { ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill(); } ctx.restore(); }
    for (const e of G.effects) { if (!inView(e.x, e.y, 220)) continue; if (!visNow(e.x, e.y) && !(e.tx !== undefined && visNow(e.tx, e.ty)) && e.kind !== 'nuke') continue; FX.drawEffect(ctx, e); }
    FX.drawParticles(ctx);
    // Weather goes over the world and under the interface. Everything below this line -- selection
    // rings, health bars, rally lines, the placement ghost, order markers -- is how the player reads
    // and gives orders, and a storm that buried those would be a storm that took the game away rather
    // than one that made it harder. The units, the ground and the corpses are all behind it.
    this.drawHazard(ctx);
    // Night, in the same slot and for the same reason: it is weather, not interface.
    this.drawNight(ctx, list);
    for (const u of UI.selection) { if (!u.alive || u.inside) continue; this.drawSelection(ctx, u, true); }
    this.drawRallies(ctx);
    if (UI.hover && UI.hover.alive && !UI.selection.includes(UI.hover)) this.drawSelection(ctx, UI.hover, false);
    if (!icons) for (const u of list) if (u.hp < u.maxHp && !UI.selection.includes(u) && (u.owner === G.human || G.frame - u.lastHit < 72)) this.drawBars(ctx, u);
    if (UI.selection.length === 1 && UI.selection[0].rally && UI.selection[0].owner === G.human) {
      const b = UI.selection[0], r = b.rally;
      // A rally onto a resource is drawn as a ring around the patch, not as a flag planted in it.
      // Brood War does it this way because the two mean different things: a flag is "walk here and
      // wait", a ring is "go and work this". Showing the flag for both is what made it look as though
      // the rally had been set to a bare point in the middle of the minerals.
      if (r.res) { this.drawResourceRing(ctx, r.res, 0.75); }
      else {
        const rx = r.target ? r.target.x : r.x, ry = r.target ? r.target.y : r.y;
        ctx.strokeStyle = 'rgba(80,255,80,0.6)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5 / z; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(rx, ry); ctx.stroke(); ctx.setLineDash([]);
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
      ctx.strokeStyle = `rgba(${mk.color},${a})`; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.ellipse(mk.x, mk.y, 5 + (20 - mk.t) * 0.7, (5 + (20 - mk.t) * 0.7) * 0.6, 0, 0, 7); ctx.stroke();
    }
    // Pings and drawings (M12 item 9). World space, above the ground and under the HUD. An ally's
    // signal is drawn in that player's colour, which is the only thing that makes a shared ping useful
    // in a team game -- "someone pinged" is noise, "blue pinged the natural" is information.
    if (G.signals && G.signals.length) {
      for (const sg of G.signals) {
        if (!G.allied(sg.owner, G.human)) continue;
        const col = (G.players[sg.owner] && G.players[sg.owner].color) || '#fff';
        const a = Math.min(1, sg.t / 40);
        ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 2 / z; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (sg.kind === 'draw' && sg.pts && sg.pts.length >= 4) {
          ctx.beginPath(); ctx.moveTo(sg.pts[0], sg.pts[1]);
          for (let i = 2; i < sg.pts.length; i += 2) ctx.lineTo(sg.pts[i], sg.pts[i + 1]);
          ctx.stroke();
        } else {
          const grow = (96 - sg.t) * 0.9;
          ctx.beginPath(); ctx.arc(sg.x, sg.y, 10 + grow, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(sg.x, sg.y, 4, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    if (UI.drag && UI.dragging) { const d = UI.drag; ctx.strokeStyle = '#4f4'; ctx.lineWidth = 1; ctx.strokeRect(Math.min(d.x0, d.x1) + .5, Math.min(d.y0, d.y1) + .5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); }
    // The line-formation preview. The mechanic has worked since M11 and was reported as missing,
    // which it effectively was: nothing drew it. You held right-drag, saw NOTHING, released, and the
    // units moved -- indistinguishable from an ordinary move order. In Beyond All Reason the live
    // preview IS the feature; the line tells you where every unit is going before you commit, and
    // without it there is no reason to drag rather than click.
    //
    // Screen space, drawn after ctx.restore(), so it needs no camera maths and stays 1 px at any zoom.
    if (UI.lineDrag) {
      const d = UI.lineDrag, len = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
      const sel = UI.ownSel ? UI.ownSel().filter(u => !u.isBuilding && !u.def.larva && !u.def.egg && !u.inside) : [];
      const armed = len >= (UI.LINE_MIN || 24) && sel.length > 1;
      ctx.save();
      ctx.strokeStyle = armed ? 'rgba(120,255,120,0.95)' : 'rgba(180,180,180,0.5)';
      ctx.lineWidth = 1.5; ctx.setLineDash(armed ? [] : [4, 4]);
      ctx.beginPath(); ctx.moveTo(d.x0 + .5, d.y0 + .5); ctx.lineTo(d.x1 + .5, d.y1 + .5); ctx.stroke();
      ctx.setLineDash([]);
      if (armed) {
        // one pip per selected unit, at the slot it will actually take -- same arithmetic as
        // UI.lineCommand, so what you see is what you get
        const n = sel.length;
        for (let i = 0; i < n; i++) {
          const f = n === 1 ? 0.5 : i / (n - 1);
          const px = d.x0 + (d.x1 - d.x0) * f, py = d.y0 + (d.y1 - d.y0) * f;
          ctx.beginPath(); ctx.arc(px + .5, py + .5, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(120,255,120,0.9)'; ctx.fill();
          ctx.strokeStyle = 'rgba(0,40,0,0.8)'; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.fillStyle = 'rgba(180,255,180,0.95)'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(n + ' in line', d.x1 + 10, d.y1 - 8);
      }
      ctx.restore();
    }
  },
  // The sprite half of the draw pass: the pooled shadow layer, both unit passes and the rims. Split out
  // of frame() so the icon path can replace all four of them with one call rather than four guards.
  drawSprites(ctx, list) {
    const sb = this.shadowLayer();
    for (const u of list) {
      // Buildings cast their own outline now, like units do, instead of being skipped entirely. They
      // are the largest things on the map and a hard-edged silhouette under them is most of what makes
      // a base read as sitting ON the ground rather than pasted onto it. Only grounded ones: a lifted
      // building takes the blob below, further out, because it is in the air.
      if (u.burrowed || u.def.mine) continue;
      // A lifted building has no unit silhouette either, for the same reason, so it takes the blob --
      // cast well below it, because it is in the air.
      const sh = (u.fly || u.lifted) ? null : (u.isBuilding ? Sprites.buildingShadow(u) : Sprites.shadow(u, Sprites.dirOf(u.facing, u), this.animOf(u)));
      // The blob stays on the scene rather than in the layer: it is a path fill, not a blit, so it was
      // never part of the cost this pools away, and it carries its own two alphas.
      if (!sh) { const air = u.fly || u.isBuilding; ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.globalAlpha = u._alpha * (air ? 0.3 : 0.4); const rr = u.isBuilding ? u.def.w * TILE * 0.42 : u.r * 0.95; ctx.beginPath(); ctx.ellipse(u._x + (air ? 14 : 3), u._y + (air ? 26 : u.r * 0.35 + 2), rr, rr * 0.47, 0, 0, 7); ctx.fill(); continue; }
      // Squash straight into drawImage's destination rectangle rather than setting a matrix. A shear
      // would be truer -- a shadow really does lean away from the light -- but a sheared blit is not
      // axis-aligned and cost 4.3 ms a frame at 490 units against a 6 ms budget, where this costs a
      // fraction of that. The silhouette is what makes a marine's shadow marine-shaped; the lean was
      // the expensive half of the effect and the cheap half is the half that reads.
      // Full alpha into the layer -- the one blit below applies SHADOW_A to all of them at once.
      sb.globalAlpha = u._alpha;
      if (u.isBuilding) {   // anchored to the footprint, squashed the same way a unit's is
        const bw = sh.cv.width, bh = sh.cv.height;
        sb.drawImage(sh.cv, u.tx * TILE - sh.M + SHADOW_DX, (u.ty + u.def.h) * TILE - bh * SHADOW_FLAT, bw, bh * SHADOW_FLAT);
        continue;
      }
      const S = sh.S;
      sb.drawImage(sh.cv, sh.sx || 0, sh.sy || 0, S, S, u._x - sh.ox + SHADOW_DX, u._y - sh.oy * SHADOW_FLAT + u.r * 0.3, S, S * SHADOW_FLAT);
    }
    ctx.save(); this.base(ctx); ctx.globalAlpha = SHADOW_A;
    ctx.drawImage(this.shadowBuf, 0, 0, this.shadowBuf.width, this.shadowBuf.height, 0, 0, this.viewW, this.viewH);
    ctx.restore();
    ctx.globalAlpha = 1;
    for (const u of list) if (!u.fly) this.drawUnit(ctx, u);
    for (const u of list) if (u.fly) this.drawUnit(ctx, u);
    this.drawRims(ctx, list);
  },
  drawFog(ctx, vis, cx, cy) {
    const m = G.map; const fc = this.fogCanvas.getContext('2d');
    if (!this.fogImg || this.fogImg.width !== m.w) this.fogImg = fc.createImageData(m.w, m.h); // one buffer for the whole game instead of one per frame
    const img = this.fogImg; const d = img.data;
    for (let i = 0; i < vis.length; i++) { const v = vis[i]; const o = i * 4; d[o] = 4; d[o + 1] = 6; d[o + 2] = 10; d[o + 3] = v === 2 ? 0 : v === 1 ? 140 : 255; }
    fc.putImageData(img, 0, 0);
    // Source AND destination clipped to the bitmap, the same deal Terrain.drawOverview makes and for
    // the same reason -- this one just took until the strategic zoom shipped to bite.
    //
    // The source rectangle is derived from the camera, and once you can zoom out past the map fit the
    // camera goes NEGATIVE and the view is wider than the world: at minimum zoom on a 128-tile map the
    // rect asked for was x -90.2, width 307, out of a bitmap 128 wide. What a browser does with a
    // source rect mostly outside its image is not something to rely on -- with smoothing on, the edge
    // texels get clamped and column 0 is smeared across the whole void, which is what "the left side
    // of the map is replicated infinitely" was. Clipping both rectangles together means the fog covers
    // exactly the map and the void outside it is left as the background it should be.
    const wW = this.viewWorldW(), wH = this.viewWorldH();
    const sx0 = Math.max(0, cx / TILE - 0.5), sy0 = Math.max(0, cy / TILE - 0.5);
    const sx1 = Math.min(m.w, (cx + wW) / TILE - 0.5), sy1 = Math.min(m.h, (cy + wH) / TILE - 0.5);
    if (!(sx1 > sx0 && sy1 > sy0)) return;
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogCanvas, sx0, sy0, sx1 - sx0, sy1 - sy0,
      (sx0 + 0.5) * TILE, (sy0 + 0.5) * TILE, (sx1 - sx0) * TILE, (sy1 - sy0) * TILE);
    ctx.restore();
  },
  // ---------------- weather ----------------
  // The sandstorm. js/map.js had a fully tested hazard for a milestone and nothing drew it, so the one
  // map that has one played as an invisible force that removed hit points -- the worst possible version
  // of a hazard, because a player cannot answer what they cannot see. This pass is what made it
  // visible; FIXLIST-M14 A2 then removed the damage entirely, so what is drawn here IS the hazard now.
  //
  // Everything here is derived from `GameMap.hazardState(G.frame)`, which is a pure function of the
  // frame number and is READ ONLY. That is not politeness: the whole reason the hazard survives a
  // replay seek or a rejoin is that it stores nothing, and a renderer that wrote to it would put
  // render-side state into the simulation's answer. (There is no damage pass any more; `hazard.safe`
  // outlived it as a render radius, so the settled ground around a main still visibly clears.)
  //
  // The pass composes into a half-resolution layer for the same two reasons the shadow pool does.
  // Cost: the whole storm is about a dozen draw calls whatever it covers, because a gradient or a
  // pattern fill is one call however many pixels it lands on, and M9's dpr measurement is the proof
  // that fill area is not what this pass is bound by. Correctness: the safe zones are erased with
  // `destination-out`, which needs somewhere to erase that is not the scene.
  HAZE_SS: 0.5, HAZE_A: 0.68, HAZE_STEPS: 14, HAZE_WOB: 30,
  hazeLayer() {
    const w = Math.max(1, Math.ceil(this.viewW * this.HAZE_SS)), h = Math.max(1, Math.ceil(this.viewH * this.HAZE_SS));
    let cv = this.hazeBuf;
    if (!cv || cv.width !== w || cv.height !== h) { cv = this.hazeBuf = document.createElement('canvas'); cv.width = w; cv.height = h; this.hazeCtx = cv.getContext('2d'); this._pat = null; }
    const c = this.hazeCtx; if (!c) return null;
    const s = this.HAZE_SS * this.zoom;   // screen-sized buffer, world-addressed; see shadowLayer
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    c.setTransform(s, 0, 0, s, -this.camX * s, -this.camY * s);
    return c;
  },
  // The dust is made of the ground it came off, so it takes the tileset's own mote colour -- the same
  // table the ambient drift uses. A sandstorm on the ice map is spindrift and on the space platform is
  // vented particulate, for free, because the palette already knew what the air there is full of.
  dustCol() { return (typeof FX !== 'undefined' && FX.AMBIENT[Terrain.setId]) || [196, 170, 120]; },
  dustRGB(c, a, k = 1) {
    const q = v => Math.max(0, Math.min(255, Math.round(v * k)));
    return 'rgba(' + q(c[0]) + ',' + q(c[1]) + ',' + q(c[2]) + ',' + a + ')';
  },
  // One tileable 128px cloud, baked per tileset. Nine copies of every blob so the tile wraps: a pattern
  // with a visible seam reads as wallpaper scrolling past, not as air.
  dustTile() {
    if (this._dust && this._dustSet === Terrain.setId) return this._dust;
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
    if (c) {
      const col = this.dustCol(); let s = 20250909;
      const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      for (let i = 0; i < 30; i++) {
        const x = rnd() * S, y = rnd() * S, r = 12 + rnd() * 26, a = 0.06 + rnd() * 0.13, k = 0.7 + rnd() * 0.6;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const bx = x + dx * S, by = y + dy * S;
          if (bx + r < 0 || by + r < 0 || bx - r > S || by - r > S) continue;
          const g = c.createRadialGradient(bx, by, 0, bx, by, r);
          g.addColorStop(0, this.dustRGB(col, a, k)); g.addColorStop(1, this.dustRGB(col, 0, k));
          c.fillStyle = g; c.fillRect(bx - r, by - r, r * 2, r * 2);
        }
      }
    }
    this._dustSet = Terrain.setId; return this._dust = cv;
  },
  dustPattern(c) {
    if (this._pat !== undefined && this._pat !== null && this._patSet === Terrain.setId) return this._pat;
    this._patSet = Terrain.setId;
    try { this._pat = c.createPattern(this.dustTile(), 'repeat'); } catch (e) { this._pat = null; }
    return this._pat;
  },
  drawHazard(ctx) {
    const m = G.map; if (!m || !m.hazard || !m.hazardState) return;
    const s = m.hazardState(G.frame); if (!s) return;
    if (s.active) this.drawStorm(ctx, s);
    else if (s.warning) this.drawStormWarn(ctx, s);
  },
  // The warning, and the reason it is two things. At t = 0 the front is still a full band-width OFF the
  // map, so there is nothing at all to see from inside it -- a tell that only draws the front would show
  // nothing for the whole ten seconds and then hit. So: dust gathering at the map edge it will enter
  // from, which is truthful and is there if you are looking at that edge; and a wash across the leading
  // side of the SCREEN, which is there wherever the camera is. FX.wind() does the third part, leaning
  // the ambient drift over and speeding it up, which is what makes the air itself feel like it moved.
  drawStormWarn(ctx, s) {
    const h = G.map.hazard, k = Math.min(1, s.phase / Math.max(1, h.warn)), col = this.dustCol();
    const vert = s.axis === 'y';
    const wW = this.viewWorldW(), wH = this.viewWorldH();
    const camA = vert ? this.camY : this.camX, lenA = vert ? wH : wW;
    const edge = s.dir > 0 ? 0 : s.span * TILE, depth = h.band * TILE * (0.3 + k * 0.6);
    const a0 = Math.min(edge, edge + depth * s.dir), a1 = Math.max(edge, edge + depth * s.dir);
    if (a1 > camA && a0 < camA + lenA) {
      const g = vert ? ctx.createLinearGradient(0, edge, 0, edge + depth * s.dir) : ctx.createLinearGradient(edge, 0, edge + depth * s.dir, 0);
      g.addColorStop(0, this.dustRGB(col, 0.66 * k, 0.5)); g.addColorStop(0.4, this.dustRGB(col, 0.3 * k, 0.62)); g.addColorStop(1, this.dustRGB(col, 0, 0.7));
      ctx.save(); ctx.fillStyle = g;
      if (vert) ctx.fillRect(this.camX - 8, a0, wW + 16, a1 - a0);
      else ctx.fillRect(a0, this.camY - 8, a1 - a0, wH + 16);
      ctx.restore();
    }
    // Squared, so the first half of the window is almost nothing and the last two seconds are
    // unmistakable, and a slow throb at the end because a light that pulses is read as an alarm.
    const puls = k > 0.7 ? 1 + Math.sin(G.frame * 0.32) * 0.22 * ((k - 0.7) / 0.3) : 1;
    ctx.save(); this.base(ctx);
    const g2 = vert ? ctx.createLinearGradient(0, s.dir > 0 ? 0 : this.viewH, 0, s.dir > 0 ? this.viewH * 0.8 : this.viewH * 0.2)
      : ctx.createLinearGradient(s.dir > 0 ? 0 : this.viewW, 0, s.dir > 0 ? this.viewW * 0.8 : this.viewW * 0.2, 0);
    // Darker than the ground, like the wall it is announcing: the light on that side is going.
    g2.addColorStop(0, this.dustRGB(col, 0.34 * k * k * puls, 0.55)); g2.addColorStop(1, this.dustRGB(col, 0, 0.7));
    ctx.fillStyle = g2; ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.restore();
  },
  // The front itself. `.t0`/`.t1` are its near and far edges in TILES along `.axis`; which of the two is
  // the LEADING edge depends on `.dir`, because the pair is always returned in ascending order.
  drawStorm(ctx, s) {
    const vert = s.axis === 'y', WOB = this.HAZE_WOB, N = this.HAZE_STEPS;
    const wW = this.viewWorldW(), wH = this.viewWorldH();
    const camA = vert ? this.camY : this.camX, camB = vert ? this.camX : this.camY;
    const lenA = vert ? wH : wW, lenB = vert ? wW : wH;
    const n0 = s.t0 * TILE, n1 = s.t1 * TILE;
    if (n1 + WOB <= camA || n0 - WOB >= camA + lenA) return;   // off camera; the cheapest frame is the one not drawn
    const c = this.hazeLayer(); if (!c) return;
    const col = this.dustCol(), lead = s.dir > 0 ? n1 : n0, back = s.dir > 0 ? n0 : n1;
    const P = (a, b) => vert ? [b, a] : [a, b];                // (along, across) -> (x, y), so one body of code serves either axis
    const b0 = camB - 24, b1 = camB + lenB + 24;
    // The crest wanders. Two sine waves of different period and drift, so the wall rolls rather than
    // arriving as a rectangle, and both are functions of world position and G.frame only -- nothing is
    // stored, so a replay of this frame draws the identical storm.
    const crest = i => { const b = b0 + (i / N) * (b1 - b0); return [lead + (Math.sin(b * 0.0075 + G.frame * 0.026) * WOB + Math.sin(b * 0.019 - G.frame * 0.017) * WOB * 0.45) * s.dir, b]; };
    c.beginPath();
    for (let i = 0; i <= N; i++) { const [a, b] = crest(i), [x, y] = P(a, b); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    { const [x, y] = P(back, b1); c.lineTo(x, y); } { const [x, y] = P(back, b0); c.lineTo(x, y); }
    c.closePath(); c.save(); c.clip();
    const ra = Math.min(n0, n1) - WOB * 2, rb = Math.max(n0, n1) + WOB * 2;
    const [rx, ry] = P(ra, b0), [rx2, ry2] = P(rb, b1), rw = rx2 - rx, rh = ry2 - ry;
    // A lit face and a dark body, in that order, and the value gap between them is the whole effect.
    // The first version tinted the whole band with the tileset's own dust colour and was nearly
    // invisible on the one map that ships with a hazard -- dust-coloured dust over a desert reads as
    // slightly warmer desert. What a sandstorm actually does is put out the sun, so the front carries a
    // bright rim where the light still catches it and everything behind that goes DARKER than the
    // ground it is covering. That works on ice and on a space platform too, because it is a value
    // relationship rather than a hue.
    const [gx0, gy0] = P(lead, 0), [gx1, gy1] = P(back, 0);
    const g = c.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, this.dustRGB(col, 0.86, 1.05)); g.addColorStop(0.1, this.dustRGB(col, 0.86, 0.6));
    g.addColorStop(0.36, this.dustRGB(col, 0.74, 0.44)); g.addColorStop(0.78, this.dustRGB(col, 0.42, 0.4));
    g.addColorStop(1, this.dustRGB(col, 0, 0.4));
    c.fillStyle = g; c.fillRect(rx, ry, rw, rh);
    const mod = (v, n) => ((v % n) + n) % n;
    // Three scrolling copies of one baked tile at different speeds and scales. Parallax is most of what
    // separates "a volume of moving air" from "a coloured rectangle", and it is three draw calls.
    // The scroll offset is wrapped to one tile: a game an hour in would otherwise be translating the
    // pattern by a quarter of a million pixels, which is the same picture at worse float precision.
    const pat = this.dustPattern(c);
    if (pat) {
      c.fillStyle = pat;
      for (let l = 0; l < 3; l++) {
        const sc = 1 + l * 0.7, [ox, oy] = P(mod(-G.frame * (2.2 + l * 1.7) * s.dir, 128 * sc), Math.sin(G.frame * 0.004 + l) * 26);
        c.save(); c.globalAlpha = 0.5 - l * 0.12; c.translate(ox, oy); c.scale(sc, sc);
        c.fillRect((rx - ox) / sc, (ry - oy) / sc, rw / sc, rh / sc); c.restore();
      }
      c.globalAlpha = 1;
    }
    // Streaks: the fast stuff at the face of the front. One path, one stroke.
    const span = Math.max(1, rb - ra);
    c.beginPath();
    for (let i = 0; i < 20; i++) {
      const b = b0 + mod(i * 137 + G.frame * 4, b1 - b0), a = ra + mod(i * 271 + G.frame * 11 * s.dir, span);
      const [x0, y0] = P(a, b), [x1, y1] = P(a + 30 * s.dir, b + 3);
      c.moveTo(x0, y0); c.lineTo(x1, y1);
    }
    c.strokeStyle = this.dustRGB(col, 0.3, 1.2); c.lineWidth = 2; c.lineCap = 'round'; c.stroke();
    c.restore();
    // The lit face of the wall: the sun is still on the outside of it, which is what makes it read as a
    // solid thing arriving rather than as a wash over the screen.
    c.beginPath();
    for (let i = 0; i <= N; i++) { const [a, b] = crest(i), [x, y] = P(a, b); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.strokeStyle = this.dustRGB(col, 0.5, 1.3); c.lineWidth = 8; c.lineJoin = 'round'; c.stroke();
    // The dust is erased over the settled ground around a start base. It was drawn this way because
    // that ground took no damage; it stays drawn this way because a storm that visually buries a
    // mineral line nobody can move reads as the game being broken rather than as weather.
    const r = (G.map.hazard.safe || 0) * TILE;
    if (r > 0 && c.globalCompositeOperation !== undefined) {
      c.globalCompositeOperation = 'destination-out';
      for (const b of G.map.starts) {
        const a = vert ? b.cy : b.cx;
        if (a + r < ra || a - r > rb) continue;
        if (b.cx + r < this.camX || b.cx - r > this.camX + wW || b.cy + r < this.camY || b.cy - r > this.camY + wH) continue;
        const g3 = c.createRadialGradient(b.cx, b.cy, r * 0.5, b.cx, b.cy, r);
        g3.addColorStop(0, 'rgba(0,0,0,0.94)'); g3.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g3; c.beginPath(); c.arc(b.cx, b.cy, r, 0, 7); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
    ctx.save(); this.base(ctx); ctx.globalAlpha = this.HAZE_A;
    ctx.drawImage(this.hazeBuf, 0, 0, this.hazeBuf.width, this.hazeBuf.height, 0, 0, this.viewW, this.viewH);
    ctx.restore();
  },

  // ---------------- strategic zoom: icons ----------------
  // The half of the zoom that is actually the feature. Below ZOOM_ICON a sprite is smaller than the
  // information it carries, so every unit becomes a role icon at a fixed SCREEN size: pulling further
  // back stops shrinking the army and starts shrinking the ground under it, which is the whole reason
  // Supreme Commander's zoom worked and a plain scale does not.
  //
  // THE CONSTRAINT IS DRAW CALLS, not pixels -- the same rule the rest of this file is budgeted under.
  // Four hundred icon BLITS would cost what four hundred sprite blits cost, about 2 ms, and buy
  // nothing. So an icon is geometry, and every icon of one owner goes into ONE path that is filled
  // once: the whole screen is one dark outline stroke, one fill per owner per layer, one wounded ring
  // and one detector dot pass. Eight players is about twenty draw calls for a thousand units, against
  // the four hundred-odd blits and the pooled shadow layer it replaces. Zooming out is CHEAPER than
  // zooming in, which is the property that makes the feature usable at all.
  //
  // Two channels of information and no more, because at nine pixels there is no room for a third:
  // COLOUR is whose, SHAPE is what it does. Air is a triangle because it is the one distinction that
  // decides whether you can shoot back at all; a worker is a circle because round reads as "not a
  // threat" at a glance; artillery gets a turret on its box because standing in front of it is the
  // other thing that kills you. Wounded units keep the red ring the rim pass gives them at zoom 1, so
  // "which ones are about to die" survives the transition, and detectors get a white pip because a
  // detector is the only reason a cloaked army stops working.
  //
  // Health bars, reload arcs, veteran chevrons and status marks are all skipped down here: at four
  // screen pixels tall they are noise, and the ring says the only part of it that still matters.
  roleOf(def) {
    const R = this._roles || (this._roles = {});
    let r = R[def.id]; if (r) return r;
    // Derived from the def rather than declared in js/data.js, which is a SIMULATION file: the build
    // stamp covers it, and a render-only taxonomy has no business moving the stamp.
    if (def.isBuilding) r = (def.gw || def.aw) ? 'siege' : 'building';
    else if (def.worker) r = 'worker';
    else if (def.cargo) r = 'transport';
    else if (def.fly) r = 'air';
    else if (!def.gw && !def.aw) r = 'caster';
    else { const w = def.gw || def.aw; r = (w.range >= 6) ? 'siege' : def.energy ? 'caster' : 'ground'; }
    return R[def.id] = r;
  },
  // Half the icon's world size: its own footprint until that drops below the screen floor, and the
  // floor from there out. That crossover is what makes an ultralisk still bigger than a marine at
  // zoom 0.5 and the same size as one at zoom 0.15, which is right -- close in you are reading units,
  // far out you are reading counts.
  iconH(u) {
    const d = u.def, z = this.zoom;
    return u.isBuilding ? Math.max(ICON_HB / z, d.w * TILE * 0.42) : Math.max((ICON_HS[d.size] || ICON_HS.medium) / z, u.r * 0.75);
  },
  iconPath(ctx, x, y, h, role) {
    switch (role) {
      case 'worker': ctx.moveTo(x + h * 0.8, y); ctx.arc(x, y, h * 0.8, 0, 7); break;
      case 'air': ctx.moveTo(x, y - h * 1.18); ctx.lineTo(x + h * 1.05, y + h * 0.78); ctx.lineTo(x - h * 1.05, y + h * 0.78); ctx.closePath(); break;
      case 'caster': ctx.moveTo(x, y - h * 1.25); ctx.lineTo(x + h * 1.1, y); ctx.lineTo(x, y + h * 1.25); ctx.lineTo(x - h * 1.1, y); ctx.closePath(); break;
      case 'transport': ctx.moveTo(x - h * 1.4, y - h * 0.6); ctx.lineTo(x + h * 1.4, y - h * 0.6); ctx.lineTo(x + h * 1.05, y + h * 0.66); ctx.lineTo(x - h * 1.05, y + h * 0.66); ctx.closePath(); break;
      case 'siege': ctx.moveTo(x - h, y + h); ctx.lineTo(x - h, y - h * 0.2); ctx.lineTo(x, y - h * 1.2); ctx.lineTo(x + h, y - h * 0.2); ctx.lineTo(x + h, y + h); ctx.closePath(); break;
      case 'building': ctx.moveTo(x - h, y - h); ctx.lineTo(x + h, y - h); ctx.lineTo(x + h, y + h); ctx.lineTo(x - h, y + h); ctx.closePath(); break;
      default: ctx.moveTo(x - h, y - h * 0.86); ctx.lineTo(x + h, y - h * 0.86); ctx.lineTo(x + h, y + h * 0.86); ctx.lineTo(x - h, y + h * 0.86); ctx.closePath(); break;
    }
  },
  // The owner's colour, lifted the same way the rim pass lifts it and for the same reason: a saturated
  // team colour at nine pixels on top of ground of a similar value is a smudge, and what makes an icon
  // read is that it is LIGHTER than everything around it, not that it is coloured.
  iconCol(owner) {
    const cache = this._icoRGB || (this._icoRGB = {});
    let c = cache[owner];
    if (!c) {
      const h = String((G.players[owner] && G.players[owner].color) || '#ffffff').replace('#', '');
      const r = parseInt(h.slice(0, 2), 16) || 0, g = parseInt(h.slice(2, 4), 16) || 0, b = parseInt(h.slice(4, 6), 16) || 0;
      c = cache[owner] = 'rgb(' + Math.min(255, r + 46) + ',' + Math.min(255, g + 46) + ',' + Math.min(255, b + 46) + ')';
    }
    return c;
  },
  drawIcons(ctx, list) {
    const z = this.zoom;
    // Sparse by owner, two layers each: ground and buildings under, air over. Air over ground is the
    // only z-ordering that carries meaning at this scale, and each extra layer is one more fill.
    const bins = this._icBins || (this._icBins = []);
    for (const b of bins) if (b) { b[0].length = 0; b[1].length = 0; }
    const det = this._icDet || (this._icDet = []), hurt = this._icHurt || (this._icHurt = []);
    det.length = 0; hurt.length = 0;
    let n = 0;
    for (const u of list) {
      const d = u.def;
      if (d.larva || d.egg || d.mine || d.notUnit || u.burrowed || u._alpha < 0.3) continue;
      const h = this.iconH(u);
      const x = u.isBuilding && !u.lifted ? u.tx * TILE + d.w * TILE / 2 : (u._x !== undefined ? u._x : u.x);
      const y = u.isBuilding && !u.lifted ? u.ty * TILE + d.h * TILE / 2 : (u._y !== undefined ? u._y : u.y);
      const e = { x, y, h, role: this.roleOf(d) };
      let b = bins[u.owner]; if (!b) b = bins[u.owner] = [[], []];
      b[(d.fly || u.lifted) ? 1 : 0].push(e); n++;
      if (d.det) det.push(e);
      if (!u.isBuilding && u.hp < u.maxHp * RIM_HURT) hurt.push(e);
    }
    if (!n) return;
    ctx.save();
    // One dark path under all of them. Stroked wide and then covered by the fills, so what survives is
    // a one-pixel halo -- an outline, drawn once for the whole screen instead of once per icon.
    ctx.beginPath();
    for (const b of bins) if (b) for (const layer of b) for (const e of layer) this.iconPath(ctx, e.x, e.y, e.h, e.role);
    ctx.strokeStyle = 'rgba(4,6,10,0.85)'; ctx.lineWidth = 2.6 / z; ctx.lineJoin = 'round'; ctx.stroke();
    for (let layer = 0; layer < 2; layer++) for (let o = 0; o < bins.length; o++) {
      const b = bins[o]; if (!b || !b[layer].length) continue;
      ctx.beginPath();
      for (const e of b[layer]) this.iconPath(ctx, e.x, e.y, e.h, e.role);
      ctx.fillStyle = this.iconCol(o); ctx.fill();
    }
    if (hurt.length) {
      ctx.beginPath();
      for (const e of hurt) { ctx.moveTo(e.x + e.h * 1.75, e.y); ctx.arc(e.x, e.y, e.h * 1.75, 0, 7); }
      ctx.strokeStyle = 'rgba(255,70,60,0.85)'; ctx.lineWidth = 1.8 / z; ctx.stroke();
    }
    if (det.length) {
      ctx.beginPath();
      for (const e of det) { ctx.moveTo(e.x + e.h * 0.34, e.y); ctx.arc(e.x, e.y, e.h * 0.34, 0, 7); }
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    }
    ctx.restore();
  },
  // ---------------- day and night ----------------
  // The other half of wave one's idea 19: the weather shipped, the light did not. G.daylight is the
  // simulation's clock, 1 at noon and 0 at the bottom of the night.
  //
  // CODED FOR IT NOT BEING THERE. The sim half may not have landed, an older save may not carry it,
  // and a mission may not run a clock at all -- so anything that is not a finite number in 0..1 reads
  // as broad daylight and this whole pass costs one comparison and returns.
  //
  // The wash is a single source-over fill and that is not a shortcut, it is the effect: blending the
  // scene toward a constant dark blue darkens it, tints it, AND compresses its range, which is the
  // reduced contrast night actually has. A multiply would darken without lifting the blacks, and a
  // night where the shadows are blacker than the day's is a night nobody has ever seen.
  //
  // The lights are holes punched in that wash with destination-out, which is why the pass composes
  // into a layer rather than straight onto the scene -- the same reason and the same machinery the
  // sandstorm's safe zones use. A pool of light is ground that is simply less washed, which is what a
  // pool of light IS; there is no additive pass, because the muzzle flashes, explosions and plasma
  // that already draw with `lighter` become the bright part for free once everything around them is
  // darker. Their alpha is lifted with the night for exactly that reason.
  NIGHT_A: 0.62, NIGHT_SS: 0.5, NIGHT_HOT: 56, NIGHT_DIM: 72,
  daylight() {
    const d = (typeof G !== 'undefined' && G) ? G.daylight : undefined;
    return (typeof d === 'number' && isFinite(d)) ? (d < 0 ? 0 : d > 1 ? 1 : d) : 1;
  },
  // 0 in daylight, 1 at the bottom of the night, and the only thing anything outside this section
  // needs to know. Squared: the first third of the fade is barely visible, which is what dusk is.
  night() { const k = 1 - this.daylight(); return k <= 0 ? 0 : k * k; },
  nightLayer() {
    const w = Math.max(1, Math.ceil(this.viewW * this.NIGHT_SS)), h = Math.max(1, Math.ceil(this.viewH * this.NIGHT_SS));
    let cv = this.nightBuf;
    if (!cv || cv.width !== w || cv.height !== h) { cv = this.nightBuf = document.createElement('canvas'); cv.width = w; cv.height = h; this.nightCtx = cv.getContext('2d'); }
    const c = this.nightCtx; if (!c) return null;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    return c;
  },
  // One soft disc, baked once and blitted with destination-out. Baked for the same reason the muzzle
  // flash is: createRadialGradient per light per frame was 0.8 ms there and would be worse here.
  lightSprite() {
    if (this._lightCv) return this._lightCv;
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
    if (c) {
      const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.66)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
    }
    return this._lightCv = cv;
  },
  // What on screen puts light on the ground, in two classes with separate caps. HOT is anything that
  // just went off -- a gun, an explosion -- and DIM is anything that merely glows: a finished building
  // with its lights on, a Protoss hull, a structure that is on fire. The split is a cap and a
  // priority, because a 200-supply battle has more muzzle flashes in a frame than the pass can afford
  // and those are exactly the ones worth keeping.
  //
  // Every field read here is one the draw pass already reads for something else -- u.lastFire drives
  // the muzzle flash, u.done and u.hp drive the building art -- so nothing new is stored anywhere and
  // nothing can leak back into the simulation.
  nightLights(list) {
    const hot = this._nlHot || (this._nlHot = []), dim = this._nlDim || (this._nlDim = []);
    hot.length = 0; dim.length = 0;
    const F = G.frame;
    for (const u of list) {
      if (u._alpha < 0.3) continue;
      const d = u.def;
      if (u.lastFire !== undefined && F - u.lastFire < MUZZLE_F * 3 && !d.worker && (d.gw || d.aw)) {
        if (hot.length < this.NIGHT_HOT * 3) hot.push(u._x, u._y, u.r * 4.6);
        continue;
      }
      if (dim.length >= this.NIGHT_DIM * 3) continue;
      if (u.isBuilding && !u.lifted) { if (u.done) dim.push(u.tx * TILE + d.w * TILE / 2, u.ty * TILE + d.h * TILE / 2, Math.max(d.w, d.h) * TILE * (u.hp < u.maxHp * 0.34 ? 1.15 : 0.85)); }
      else if (d.race === 'P' && !d.worker) dim.push(u._x, u._y, u.r * 2.6);
    }
    for (const e of G.effects) {
      if (hot.length >= this.NIGHT_HOT * 3) break;
      const k = e.kind;
      if (k !== 'boom' && k !== 'bigboom' && k !== 'nuke' && k !== 'fire' && k !== 'storm') continue;
      hot.push(e.x, e.y, (e.r || 14) * (k === 'nuke' ? 6 : k === 'bigboom' ? 4 : 2.6));
    }
    return [hot, dim];
  },
  drawNight(ctx, list) {
    const k = this.night(); if (k <= 0.002) return;
    const c = this.nightLayer();
    if (!c) {   // no second canvas to punch holes in: the wash alone still reads as night
      ctx.save(); this.base(ctx); ctx.fillStyle = 'rgba(11,17,44,' + (this.NIGHT_A * k).toFixed(3) + ')';
      ctx.fillRect(0, 0, this.viewW, this.viewH); ctx.restore(); return;
    }
    const w = this.nightBuf.width, h = this.nightBuf.height;
    c.fillStyle = 'rgb(11,17,44)'; c.fillRect(0, 0, w, h);
    const s = this.NIGHT_SS * this.zoom;
    c.setTransform(s, 0, 0, s, -this.camX * s, -this.camY * s);
    if (c.globalCompositeOperation !== undefined) {
      const [hot, dim] = this.nightLights(list), sp = this.lightSprite();
      c.globalCompositeOperation = 'destination-out';
      // Dim first and hot on top, so a gun going off inside a base still brightens the ground under it
      // rather than being swallowed by the pool the base already has.
      c.globalAlpha = 0.62;
      for (let i = 0; i < dim.length; i += 3) c.drawImage(sp, dim[i] - dim[i + 2], dim[i + 1] - dim[i + 2], dim[i + 2] * 2, dim[i + 2] * 2);
      c.globalAlpha = 1;
      for (let i = 0; i < hot.length; i += 3) c.drawImage(sp, hot[i] - hot[i + 2], hot[i + 1] - hot[i + 2], hot[i + 2] * 2, hot[i + 2] * 2);
      c.globalCompositeOperation = 'source-over';
    }
    ctx.save(); this.base(ctx); ctx.globalAlpha = this.NIGHT_A * k;
    ctx.drawImage(this.nightBuf, 0, 0, w, h, 0, 0, this.viewW, this.viewH);
    ctx.restore();
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
    const rx = r.w * TILE * 0.62, ry = r.h * TILE * 0.72, z = this.zoom;
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = '#5f5'; ctx.lineWidth = 2 / z;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = alpha * 0.45; ctx.lineWidth = 1 / z;
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
      // The vapour is the only part that moves, so it is the only part not baked -- and it is four
      // arcs per geyser, which is nothing at zoom 1 and is every unmined geyser on the map at once
      // in the strategic view, where the plume is two pixels tall. Off below the icon threshold.
      if (r.amount > 0 && (!r.building || !r.building.alive) && this.zoom >= ZOOM_ICON) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 4; k++) { const t = ((G.frame / 50) + k / 4) % 1; ctx.fillStyle = 'rgba(160,255,140,' + (0.3 * (1 - t)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(r.cx + Math.sin(k * 2 + t * 6) * 11, r.cy - 6 - t * 42, 5 + t * 12, 0, 7); ctx.fill(); }
        ctx.restore();
      }
    }
  },
  // ---------------- weight ----------------
  // How much a thing weighs, for the settle spring. Size is the honest axis -- a marine and an
  // ultralisk differ by size, not by hit points -- and metal is given a little more than meat because a
  // chassis does not absorb its own momentum the way a body does.
  massOf(d) { return (d.size === 'large' ? 1 : d.size === 'medium' ? 0.62 : 0.3) * (d.mech ? 1.15 : 0.9); },
  // One pass per SIM frame, not per drawn frame. The spring is integrated in sim time, so a 144 Hz
  // display and a throttled browser pane settle a tank over the same quarter of a second; making it a
  // function of wall-clock dt instead would have made weight a property of the machine watching.
  //
  // The input is the distance the unit covered during the tick that just ran -- u.px/u.py is where the
  // sim put it at the top of the tick, which is the same pair the draw pass interpolates from, so this
  // needs nothing added to the simulation and reads nothing that is not already on screen.
  tickMotion(list) {
    if (this.motionFrame === G.frame) return;
    this.motionFrame = G.frame;
    const M = this.motion;
    for (const u of list) {
      if (u.isBuilding || u.burrowed || u.def.mine || u.def.larva || u.def.egg) continue;
      let s = M.get(u.id); if (!s) M.set(u.id, s = { spd: 0, p: 0, v: 0, f: 0 });
      s.f = G.frame;
      const sp = Math.hypot(u.x - u.px, u.y - u.py), acc = sp - s.spd, mass = this.massOf(u.def);
      s.spd = sp;
      // Mass on a spring: acceleration shoves it back, braking throws it forward, the spring rings it
      // down. Start, stop and settle out of one integrator, with no state machine and no special case
      // for "has just stopped" -- which is the whole reason it reads as weight rather than as an effect.
      s.v = (s.v - acc * SETTLE_IMP * mass - s.p * SETTLE_K) * SETTLE_D;
      s.p = clamp(s.p + s.v, -SETTLE_MAX * mass, SETTLE_MAX * mass);
      if (u.fly || u.def.worker || typeof FX === 'undefined') continue;
      const d = u.def;
      // Ruts for anything with a drive train, dust for anything that hovers or is simply enormous.
      // Staggered by id so a column of tanks does not lay its marks in lockstep.
      if (sp > 0.4) {
        if (d.mech && !d.hover && (G.frame + u.id) % 10 === 0) FX.track(u.x, u.y + u.r * 0.32, u.facing, u.r * 0.5, u.r * 0.55);
        else if ((d.hover || d.size === 'large') && (G.frame + u.id) % 14 === 0 && FX.particles.length < FX.MAX_PARTICLES * 0.7) FX.dust(u.x, u.y + u.r * 0.4, 1, 0.5 + mass * 0.7);
      }
      // Braking throws dirt forward -- the same event as the forward lurch, told by the ground.
      if (acc < -0.8 && mass > 0.5 && FX.particles.length < FX.MAX_PARTICLES * 0.7)
        FX.dust(u.x + Math.cos(u.facing) * u.r * 0.6, u.y + Math.sin(u.facing) * u.r * 0.5 + u.r * 0.3, 2, 0.7 + mass * 0.7);
    }
    // A unit that died or walked off camera stops being asked about; sweep its entry eventually.
    if (M.size > 512 && (G.frame & 63) === 0) for (const [id, st] of M) if (G.frame - st.f > 120) M.delete(id);
  },
  // ---------------- legibility at scale ----------------
  // A thin ellipse in the owner's colour around every unit's feet, and a hotter one around anything
  // nearly dead. Drawn AFTER every sprite, which is the point of it: with four hundred sprites
  // overlapping, what is lost first is not detail but WHOSE and WHICH ONES ARE ABOUT TO DIE, and
  // neither of those is recoverable from a silhouette that the unit in front has painted over.
  //
  // It costs one draw call per player plus one, not one per unit, and that is the entire design
  // constraint: every ring goes into a single path per owner and each path is stroked once. The rule
  // this pass exists under is the one at the top of the file -- an extra per-unit BLIT is 2 ms and there
  // is no room for another one, but per-unit geometry batched into a handful of fills is nearly free.
  // Measured at 400 units: see test/renderfeel.js, which counts both the draw calls and how many units
  // are still identifiable after everything in front of them has been painted.
  //
  // It fades in with the crowd. Below RIM_ON units on screen there is nothing to disambiguate and the
  // rim is not drawn at all, so a twelve-marine skirmish looks exactly as it always did.
  rimCol(owner, a) {
    const cache = this._rimRGB || (this._rimRGB = {});
    let c = cache[owner];
    if (!c) {
      const h = String((G.players[owner] && G.players[owner].color) || '#ffffff').replace('#', '');
      c = cache[owner] = [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
    }
    // Lifted toward white, because a saturated team colour at 1 px on top of a sprite of the same
    // colour is invisible -- the ring has to be lighter than what it is drawn over, not merely coloured.
    return 'rgba(' + Math.min(255, c[0] + 70) + ',' + Math.min(255, c[1] + 70) + ',' + Math.min(255, c[2] + 70) + ',' + a.toFixed(3) + ')';
  },
  drawRims(ctx, list) {
    const n = list.length; if (n < RIM_ON) return;
    const k = Math.min(1, (n - RIM_ON) / (RIM_FULL - RIM_ON));
    const by = this._rimBins || (this._rimBins = []), hurt = this._rimHurt || (this._rimHurt = []);
    for (const b of by) if (b) b.length = 0;   // sparse: owner ids are the indices, and a game need not have player 0
    hurt.length = 0;
    for (const u of list) {
      if (u.isBuilding || u.burrowed || u.def.mine || u.def.larva || u.def.egg || u._alpha < 0.3) continue;
      (by[u.owner] || (by[u.owner] = [])).push(u);
      if (u.hp < u.maxHp * RIM_HURT) hurt.push(u);
    }
    ctx.save();
    if (hurt.length) {   // drawn first and wider, so it reads as a halo around the ring rather than as one
      ctx.beginPath();
      for (const u of hurt) { const yy = u._y + (u.fly ? 0 : u.r * 0.4), rx = u.r + 4, ry = rx * (u.fly ? 0.62 : 0.5); ctx.moveTo(u._x + rx, yy); ctx.ellipse(u._x, yy, rx, ry, 0, 0, 7); }
      ctx.strokeStyle = 'rgba(255,70,60,' + (0.55 * k).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.lineWidth = 1.4;
    for (let o = 0; o < by.length; o++) {
      const b = by[o]; if (!b || !b.length) continue;
      ctx.beginPath();
      for (const u of b) { const yy = u._y + (u.fly ? 0 : u.r * 0.4), rx = u.r + 2, ry = rx * (u.fly ? 0.62 : 0.5); ctx.moveTo(u._x + rx, yy); ctx.ellipse(u._x, yy, rx, ry, 0, 0, 7); }
      ctx.strokeStyle = this.rimCol(o, RIM_A * k); ctx.stroke();
    }
    ctx.restore();
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
    if (u.burrowed && !u.def.mine) {
      ctx.fillStyle = 'rgba(60,30,70,0.7)'; ctx.beginPath(); ctx.ellipse(x, y, u.r, u.r * .55, 0, 0, 7); ctx.fill();
      ctx.fillStyle = G.players[u.owner].color; ctx.fillRect(x - 3, y - 2, 6, 4);
      // ARMING versus ARMED, for any def with its own dig timings -- today the Widow Mine. Without this
      // the arming delay FIXLIST-M14 A3 adds would be a rule the player cannot see: a mine still digging
      // in looked exactly like one ready to fire. Amber and blinking fast while it arms, steady red once
      // the weapon is live, which is the language the spider mine's own light already speaks.
      if (u.def.dig) { const armed = !(u.digT > 0); ctx.fillStyle = armed ? '#ff3030' : (G.frame % 8 < 4 ? '#ffb020' : '#6a4a10'); ctx.beginPath(); ctx.arc(x, y - u.r * .55 - 3, 2.2, 0, 7); ctx.fill(); }
      ctx.restore(); return;
    }
    if (u.def.mine) { ctx.globalAlpha *= u.burrowed ? 0.5 : 1; ctx.fillStyle = '#4a5058'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.fillStyle = (G.frame % 20 < 10) ? '#ff3030' : '#802020'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); ctx.restore(); return; }
    const s = Sprites.unit(u, Sprites.dirOf(u.facing, u), this.animOf(u));
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
    // Settle: the same axis again, driven by the unit's own acceleration instead of by its weapon --
    // the body lags going, overshoots stopping, and rings down. Recoil and settle are deliberately ONE
    // language, a displacement along the facing, because two different vocabularies for "this thing has
    // mass" read as two unrelated effects. Both come off Render.tickMotion; see there.
    let lean = 0, kick = 0, pitch = 0, stretch = 0;
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
      const mo = this.motion.get(u.id);
      // The stretch is the same number as the lag, not a second one: a body pulling away from its own
      // feet is elongated along the direction it is pulling. Deriving both from one quantity is what
      // keeps them in phase -- two independent easings would drift apart and read as a wobble.
      if (mo) { pitch = mo.p; stretch = -mo.p / (SETTLE_MAX * this.massOf(u.def)) * LEAN_STRETCH; }
    }
    const push = pitch - kick;
    ctx.translate(x + Math.cos(u.facing) * push, y + bob + Math.sin(u.facing) * push);
    if (lean) ctx.rotate(lean);
    if (stretch > 0.004 || stretch < -0.004) { ctx.rotate(u.facing); ctx.scale(1 + stretch, 1 - stretch * 0.55); ctx.rotate(-u.facing); }
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
      // Brighter at night, and this is the whole of the "light pooling" idea from the flash's side: the
      // darkness pass punches a hole in the ground under a firing unit and this puts the light in it.
      // Clamped, because globalAlpha over 1 is silently 1 on some engines and an error on others.
      const fl = this.muzzleSprite(), a0 = ctx.globalAlpha, nb = 1 + this.night() * 0.5;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a0 * 0.8 * k * nb);
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
  // Rally lines for whatever is selected, drawn for as long as it stays selected rather than as the
  // half-second marker the click used to leave behind. Both StarCraft and StarCraft II keep them up, and
  // with two rallies per building there is no other way to see which is which: the unit rally is green
  // and the worker rally yellow, matching the flash the right-click gives.
  RALLY_G: '120,255,120', RALLY_W: '255,220,80',
  drawRallies(ctx) {
    const seen = new Set(), z = this.zoom;
    for (const b of UI.selection) {
      if (!b.alive || b.inside || seen.has(b.id)) continue; seen.add(b.id);
      for (const [r, col] of [[b.rally, this.RALLY_G], [b.rallyW, this.RALLY_W]]) {
        if (!r) continue;
        // A rally onto a unit follows it, so the line is redrawn from wherever that unit is now.
        const live = (r.target && r.target.alive) ? r.target : (r.gas && r.gas.alive ? r.gas : null);
        const tx = live ? live.x : r.x, ty = live ? live.y : r.y;
        ctx.save();
        ctx.strokeStyle = 'rgba(' + col + ',0.5)'; ctx.lineWidth = 1.5 / z; ctx.setLineDash([7 / z, 5 / z]);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.setLineDash([]);
        const res = r.res || (r.gas && r.gas.geyser);
        if (res) {   // a ring round the patch's own footprint, the shape the acknowledgement flash uses
          ctx.strokeStyle = 'rgba(' + col + ',0.85)'; ctx.lineWidth = 2 / z;
          ctx.beginPath(); ctx.ellipse(res.cx, res.cy, res.w * TILE * 0.62, res.h * TILE * 0.85, 0, 0, 7); ctx.stroke();
        } else {     // otherwise a small flag, so a rally onto open ground is still findable
          ctx.strokeStyle = 'rgba(' + col + ',0.9)'; ctx.fillStyle = 'rgba(' + col + ',0.35)'; ctx.lineWidth = 2 / z;
          ctx.beginPath(); ctx.arc(tx, ty, 7, 0, 7); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tx, ty - 7); ctx.lineTo(tx, ty - 17); ctx.stroke();
        }
        ctx.restore();
      }
    }
  },
  drawSelection(ctx, u, sel) {
    const col = u.owner === G.human ? '#3fe83f' : G.allied(G.human, u.owner) ? '#f0e040' : '#ff3c3c';
    const z = this.zoom, icons = z < ZOOM_ICON;
    // The ring is an interface element, so its WIDTH is in screen pixels rather than world ones -- a
    // 1.5 px ring scaled to 0.3 px is a ring nobody can see, and a selection you cannot see is the one
    // thing about zooming out that would make the game unplayable.
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = (sel ? 1.5 : 1) / z; ctx.globalAlpha = sel ? 0.95 : 0.5;
    if (u.isBuilding && !u.lifted) { ctx.beginPath(); ctx.ellipse(u.tx * TILE + u.def.w * TILE / 2, u.ty * TILE + u.def.h * TILE / 2 + 6, u.def.w * TILE / 2 + 4, u.def.h * TILE / 2 + 2, 0, 0, 7); ctx.stroke(); }
    else if (icons) { const h = this.iconH(u) * 1.7; ctx.beginPath(); ctx.ellipse(u._x || u.x, u._y || u.y, h, h * 0.72, 0, 0, 7); ctx.stroke(); }
    else { ctx.beginPath(); ctx.ellipse(u._x || u.x, (u._y || u.y) + u.r * 0.4, u.r + 3, (u.r + 3) * 0.5, 0, 0, 7); ctx.stroke(); }
    ctx.restore();
    // Reload arcs, chevrons and bars are all a few world pixels tall; below the icon threshold they are
    // a smear rather than a reading, and drawIcons already says the part of it that still carries.
    if (sel && !icons) { this.drawReload(ctx, u); this.drawBars(ctx, u); }
  },
  // The reload arc. A unit's rate of fire was legible only as an effect -- flashes and recoil tell you
  // it HAS fired, never that it is about to. This is the other half: a ring that sweeps round as the
  // weapon comes back up, and a bright pip when it is ready. The rhythm of a fight becomes something
  // you can read and time against rather than infer, which is the whole point of the idea.
  //
  // Selected units only, so a 400-unit brawl does not turn into a wall of rings, and render-only --
  // u.cooldown and u.wCd are read, never written.
  drawReload(ctx, u) {
    if ((u.isBuilding && !u.lifted) || u.def.worker) return;   // a worker's 'weapon' is not a cadence anyone times against, same exclusion the muzzle flash uses
    const w = u.sieged ? SIEGE_W : (u.def.gw || u.def.aw); if (!w) return;
    const full = u.wCd(w); if (!full || full < 4) return;   // a weapon this fast has no readable cadence
    const k = 1 - Math.max(0, Math.min(1, u.cooldown / full));
    const x = u._x || u.x, y = (u._y || u.y) + u.r * 0.4, rx = u.r + 6, ry = (u.r + 6) * 0.5;
    ctx.save();
    if (k >= 1) {   // ready: a small steady pip rather than a full ring, so a waiting army is calm
      ctx.fillStyle = 'rgba(255,240,150,0.9)'; ctx.beginPath(); ctx.ellipse(x, y - ry, 2.2, 2.2, 0, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,225,120,0.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  },
  // Veteran chevrons, above the bars. Three ranks, so three marks at most, and only on units that have
  // earned one -- a fresh army draws nothing extra.
  drawVet(ctx, u) {
    const v = u.vet; if (!v || u.isBuilding) return;
    const x = (u._x || u.x), y = (u._y || u.y) - u.r * 0.95 - 3;
    ctx.save(); ctx.strokeStyle = 'rgba(255,225,120,0.95)'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    for (let i = 0; i < v; i++) { const yy = y - i * 3.2; ctx.beginPath(); ctx.moveTo(x - 4, yy + 2); ctx.lineTo(x, yy - 1); ctx.lineTo(x + 4, yy + 2); ctx.stroke(); }
    ctx.restore();
  },
  drawBars(ctx, u) {
    this.drawVet(ctx, u);
    const w = Math.max(24, Math.min(64, u.r * 2.4)), x = (u._x || u.x) - w / 2; let y = (u._y || u.y) + u.r * 0.9 + 6; if (u.isBuilding && !u.lifted) { y = u.ty * TILE + u.def.h * TILE + 8; }
    const seg = Math.max(4, Math.round(w / 6));
    const bar = (frac, color) => { ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 6); for (let i = 0; i < seg; i++) { const sx = x + i * w / seg; const filled = (i + 1) / seg <= frac + 0.001 || (i / seg < frac && frac < (i + 1) / seg); ctx.fillStyle = filled ? color : '#2a2f36'; ctx.fillRect(sx + 0.5, y, w / seg - 1, 4); } y += 6; };
    if (u.maxSh) bar(u.sh / u.maxSh, '#5aa8ff');
    const hr = u.hp / u.maxHp; bar(hr, hr > 0.66 ? '#3fe83f' : hr > 0.33 ? '#f0e040' : '#ff3c3c');
    // The scar: capacity this unit has permanently lost. The bar is drawn against the CURRENT maxHp, so
    // a scarred unit at full health shows a full bar and the loss is invisible -- which defeats the
    // point of it. A dark cap over the missing fraction of the original puts the history back on screen.
    if (!u.isBuilding && u.scarred > 0.5) {
      const lost = u.scarred / u.def.hp, lw = Math.max(1, Math.round(w * Math.min(1, lost)));
      ctx.fillStyle = 'rgba(120,20,20,0.9)'; ctx.fillRect(x + w - lw, y - 1, lw, 2);
    }
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
