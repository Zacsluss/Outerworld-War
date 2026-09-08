'use strict';
// ============================================================================
// Sprite cache: pre-renders unit painters per facing (16 dirs, 32 for a few) and building
// painters per type/colour, applies consistent top-left lighting + outline.
// ============================================================================
const Sprites = {
  DIRS: 16, cache: new Map(),
  clear() { this.cache.clear(); this._dirs.clear(); },
  // How many facings this unit was actually baked at. Most are DIRS; a handful of slow-turning types
  // are baked at 32 because they visibly hold a bucket for two or more sim frames (see FINE_DIRS in
  // tools/bake.js). The atlas has recorded `cols` per unit since the sheets existed -- nothing read it.
  // Falls back to DIRS whenever the baked sheet is not the one being drawn, which is what keeps the
  // vector painters correct: they rotate by dir * 2PI / DIRS.
  // Memoised per sheet id, because the draw loop asks twice per unit per frame -- once in the shadow
  // pass and once in drawUnit -- and the answer only changes when a sheet finishes loading. A miss
  // while the images are still in flight is deliberately not cached: `Sprites.unit` takes the vector
  // path under exactly the same condition, and the two have to flip together or the fallback painters
  // get a facing index they cannot rotate to.
  _dirs: new Map(),
  dirsFor(u) {
    if (!u || !u.def) return this.DIRS;
    const id = u.sieged ? u.def.id + '_s' : u.def.id;
    const n = this._dirs.get(id); if (n !== undefined) return n;
    if (typeof Atlas === 'undefined' || !Atlas.data || !Atlas.hasUnit(id)) return this.DIRS;
    const c = (Atlas.data.units[id] || {}).cols || this.DIRS;
    this._dirs.set(id, c); return c;
  },
  dirOf(facing, u) { const n = this.dirsFor(u); const d = Math.round(facing / (Math.PI * 2 / n)); return ((d % n) + n) % n; },
  variant(u) { return u.sieged ? 's' : ''; },
  light(c, S, strength = 1) { // fixed-direction lighting over painted pixels
    c.globalCompositeOperation = 'source-atop'; const g = c.createLinearGradient(-S / 2, -S / 2, S / 2, S / 2); g.addColorStop(0, `rgba(255,255,255,${0.26 * strength})`); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.42 * strength})`); c.fillStyle = g; c.fillRect(-S / 2, -S / 2, S, S); c.globalCompositeOperation = 'source-over';
  },
  WALK_FRAMES: 8, ATK_FRAMES: 5, IDLE_FRAMES: 4,
  draw(ctx, s, x, y) { if (s.sub) ctx.drawImage(s.cv, s.sx, s.sy, s.S, s.S, x - s.ox, y - s.oy, s.S, s.S); else ctx.drawImage(s.cv, x - s.ox, y - s.oy); },
  unit(u, dir, anim = 'i') {
    const id = u.def.id, color = G.players[u.owner].color, v = this.variant(u); const aid = v === 's' ? id + '_s' : id;
    if (typeof Atlas !== 'undefined' && Atlas.hasUnit(aid)) return Atlas.unitFrame(aid, color, dir, anim);
    const key = 'u|' + id + '|' + color + '|' + dir + '|' + v + '|' + anim;
    let s = this.cache.get(key); if (s) return s;
    const r = u.r; const S = Math.ceil(r * 4.2) + 12; const cv = document.createElement('canvas'); cv.width = S; cv.height = S; const c = cv.getContext('2d');
    c.translate(S / 2, S / 2); c.rotate(dir * Math.PI * 2 / this.DIRS);
    const painter = UNIT_PAINTERS[id] || UNIT_PAINTERS.marine; const h = PaintHelpers(c);
    const st = { sieged: v === 's', walk: null, atk: null, idle: null }; if (anim[0] === 'w') st.walk = parseInt(anim.slice(1)) / this.WALK_FRAMES; else if (anim[0] === 'a') st.atk = (parseInt(anim.slice(1)) + 0.5) / this.ATK_FRAMES; else st.idle = parseInt(anim.slice(1) || '0') / this.IDLE_FRAMES;
    c.lineJoin = 'round'; painter(h, r, color, shade(color, 0.6), st);
    c.setTransform(1, 0, 0, 1, S / 2, S / 2); this.light(c, S, 1);
    s = { cv, S, ox: S / 2, oy: S / 2 }; this.cache.set(key, s); return s;
  },
  // The unit's own outline in one flat colour: black for the cast shadow in render.js, pale for the
  // rim light. Atlas sheets get one silhouette sheet per type and fill; the vector fallback derives
  // one per cached frame the same way `tinted` does. Returns null only when neither path has a frame
  // yet, and the caller falls back to the ellipse this used to be.
  shadow(u, dir, anim = 'i', fill = '#000') {
    const id = u.def.id, v = this.variant(u), aid = v === 's' ? id + '_s' : id;
    if (typeof Atlas !== 'undefined' && Atlas.hasUnit(aid)) return Atlas.unitShadow(aid, dir, anim, fill);
    const s = this.unit(u, dir, anim); if (!s) return null;
    const key = 'sh|' + id + '|' + dir + '|' + v + '|' + anim + '|' + fill; let sh = this.cache.get(key); if (sh) return sh;
    const cv = document.createElement('canvas'); cv.width = s.cv.width; cv.height = s.cv.height; const c = cv.getContext('2d');
    c.drawImage(s.cv, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = fill; c.fillRect(0, 0, cv.width, cv.height);
    sh = { cv, S: s.S, ox: s.ox, oy: s.oy, sub: s.sub, sx: s.sx, sy: s.sy };
    this.cache.set(key, sh); return sh;
  },
  // Black copy of a building's sprite, for the shadow pass. Cached per type and colour like the
  // sprite itself, so it costs one canvas per building type actually on screen.
  buildingShadow(u) {
    const id = u.def.id, key = 'bsh|' + id;
    let sh = this.cache.get(key); if (sh) return sh;
    const b = this.building(u);
    const cv = document.createElement('canvas'); cv.width = b.cv.width; cv.height = b.cv.height;
    const c = cv.getContext('2d');
    c.drawImage(b.cv, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
    sh = { cv, M: b.M, T: b.T, W: b.W, H: b.H };
    this.cache.set(key, sh); return sh;
  },
  building(u) {
    const id = u.def.id, color = G.players[u.owner].color; const key = 'b|' + id + '|' + color;
    if (typeof Atlas !== 'undefined' && Atlas.hasBuilding(id)) return Atlas.buildingImage(id, color);
    let s = this.cache.get(key); if (s) return s;
    const M = 18, W = u.def.w * TILE, H = u.def.h * TILE; const cv = document.createElement('canvas'); cv.width = W + M * 2; cv.height = H + M * 2; const c = cv.getContext('2d');
    c.translate(M, M); const h = PaintHelpers(c); c.lineJoin = 'round';
    (BUILDING_PAINTERS[id] || BUILDING_PAINTERS.supply_depot)(h, c, W, H, color, shade(color, 0.6));
    c.setTransform(1, 0, 0, 1, M + W / 2, M + H / 2); this.light(c, Math.max(W, H) + M * 2, 0.8);
    s = { cv, M, T: M, W, H }; this.cache.set(key, s); return s;
  },
  // Icon rendering for HUD (unit or building), returns canvas of size sz
  icon(defId, color, sz) {
    const key = 'i|' + defId + '|' + color + '|' + sz; let s = this.cache.get(key); if (s) return s;
    const cv = document.createElement('canvas'); cv.width = sz; cv.height = sz; const c = cv.getContext('2d'); const def = DATA.all[defId]; if (!def) return cv;
    if (typeof Atlas !== 'undefined') { if (!def.isBuilding && Atlas.hasUnit(defId)) { const cols = Atlas.data.units[defId].cols || this.DIRS; const f = Atlas.unitFrame(defId, color, Math.round(14 * cols / this.DIRS) % cols, 'i'); const k = (sz - 2) / f.S * 1.35; c.translate(sz / 2, sz / 2 + 2); c.scale(k, k); this.draw(c, f, 0, 0); this.cache.set(key, cv); return cv; } if (def.isBuilding && Atlas.hasBuilding(defId)) { const b = Atlas.buildingImage(defId, color); const k = (sz - 4) / Math.max(b.cv.width, b.cv.height); c.translate(sz / 2 - b.cv.width * k / 2, sz / 2 - b.cv.height * k / 2); c.scale(k, k); c.drawImage(b.cv, 0, 0); this.cache.set(key, cv); return cv; } }
    const h = PaintHelpers(c); c.lineJoin = 'round';
    if (def.isBuilding) { const W = def.w * TILE, H = def.h * TILE; const k = (sz - 6) / Math.max(W, H); c.translate(sz / 2 - W * k / 2, sz / 2 - H * k / 2); c.scale(k, k); (BUILDING_PAINTERS[defId] || BUILDING_PAINTERS.supply_depot)(h, c, W, H, color, shade(color, .6)); }
    else { const r = def.r || 10; const k = (sz / 2 - 3) / (r * 1.5); c.translate(sz / 2, sz / 2); c.scale(k, k); c.rotate(-Math.PI / 2 + 0.6); (UNIT_PAINTERS[defId] || UNIT_PAINTERS.marine)(h, r, color, shade(color, .6), { walk: null, atk: null }); }
    c.setTransform(1, 0, 0, 1, sz / 2, sz / 2); this.light(c, sz, 0.8);
    this.cache.set(key, cv); return cv;
  },
  // Tinted silhouette (wireframe panel)
  tinted(defId, color, sz, tint) {
    const key = 't|' + defId + '|' + sz + '|' + tint; let s = this.cache.get(key); if (s) return s;
    const base = this.icon(defId, color, sz); const cv = document.createElement('canvas'); cv.width = sz; cv.height = sz; const c = cv.getContext('2d');
    c.drawImage(base, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = tint; c.fillRect(0, 0, sz, sz); c.globalCompositeOperation = 'source-over';
    this.cache.set(key, cv); return cv;
  },
};
