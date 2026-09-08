'use strict';
// ============================================================================
// Runtime loader for baked sprite sheets (assets/atlas.js + PNGs).
// Team colour is applied by multiplying the mask region with the player colour.
// ============================================================================
const Atlas = {
  data: (typeof SPRITE_ATLAS !== 'undefined') ? SPRITE_ATLAS : null, imgs: {}, tinted: new Map(), frames: new Map(), sils: new Map(), silFrames: new Map(), started: false,
  init() {
    if (!this.data || this.started) return; this.started = true;
    const load = (key, src) => { const im = new Image(); im.onload = () => { im.ok = true; }; im.onerror = () => { im.ok = false; }; im.src = src; this.imgs[key] = im; };
    for (const [id, a] of Object.entries(this.data.units)) { load('u|' + id, a.file); load('um|' + id, a.mask); }
    for (const [id, a] of Object.entries(this.data.buildings)) { load('b|' + id, a.file); load('bm|' + id, a.mask); }
  },
  ready(kind, id) { const a = this.imgs[kind + '|' + id], b = this.imgs[kind + 'm|' + id]; return !!(a && a.ok && b && b.ok); },
  hasUnit(id) { return !!(this.data && this.data.units[id] && this.ready('u', id)); },
  hasBuilding(id) { return !!(this.data && this.data.buildings[id] && this.ready('b', id)); },
  // tinted sheet canvas for (kind,id,color)
  sheet(kind, id, color) {
    const key = kind + '|' + id + '|' + color; let cv = this.tinted.get(key); if (cv) return cv;
    const base = this.imgs[kind + '|' + id], mask = this.imgs[kind + 'm|' + id];
    cv = document.createElement('canvas'); cv.width = base.width; cv.height = base.height; const c = cv.getContext('2d');
    c.drawImage(base, 0, 0);
    const mc = document.createElement('canvas'); mc.width = base.width; mc.height = base.height; const x = mc.getContext('2d');
    x.drawImage(mask, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, mc.width, mc.height);
    c.globalCompositeOperation = 'multiply'; c.drawImage(mc, 0, 0); c.globalCompositeOperation = 'source-over';
    this.tinted.set(key, cv); return cv;
  },
  // Anim string -> sheet row, shared by the colour path and the silhouette path so the two cannot
  // drift apart. 'w<n>' walk, 'a<n>' attack, 'd<n>' death (n indexes the dvar poses x dframes frames
  // baked by tools/bake.js, laid out pose by pose), anything else idle. A sheet with no death rows --
  // every flyer, because nothing ever draws a flying corpse, and any sheet baked before they existed
  // -- falls through to idle rather than reading past the end of the sheet.
  row(a, anim) {
    if (anim[0] === 'w') return a.rows.w + (parseInt(anim.slice(1)) % this.data.walk);
    if (anim[0] === 'a') return a.rows.a + Math.min(this.data.atk - 1, parseInt(anim.slice(1)));
    if (anim[0] === 'd' && a.rows.d != null) return a.rows.d + Math.min((this.data.death || 1) - 1, parseInt(anim.slice(1)));
    return a.rows.i + (parseInt(anim.slice(1) || '0') % (this.data.idle || 1)); // sheets baked before idle animation have a single idle row
  },
  unitFrame(id, color, dir, anim) {
    const key = id + '|' + color + '|' + dir + '|' + anim; let f = this.frames.get(key); if (f) return f;
    const a = this.data.units[id]; const cv = this.sheet('u', id, color); const S = a.S;
    f = { cv, sx: dir * S, sy: this.row(a, anim) * S, S, ox: S / 2, oy: S / 2, sub: true }; this.frames.set(key, f); return f;
  },
  buildingImage(id, color) { const a = this.data.buildings[id]; return { cv: this.sheet('b', id, color), M: a.M, T: a.T, W: a.W, H: a.H }; },

  // Flat single-colour copy of a whole sheet: black for the shadow pass, pale for the rim light.
  // One per type and fill rather than per team colour, because a silhouette does not care whose unit
  // it is -- so two fills cost what one extra player colour would, however many players are in.
  silhouette(kind, id, fill) {
    const key = kind + '|' + id + '|' + fill; let cv = this.sils.get(key); if (cv) return cv;
    const base = this.imgs[kind + '|' + id];
    cv = document.createElement('canvas'); cv.width = base.width; cv.height = base.height;
    const c = cv.getContext('2d');
    c.drawImage(base, 0, 0);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = fill; c.fillRect(0, 0, cv.width, cv.height); c.globalCompositeOperation = 'source-over';
    this.sils.set(key, cv); return cv;
  },
  // Same sub-rect arithmetic as unitFrame, against a silhouette sheet.
  unitShadow(id, dir, anim, fill) {
    const key = id + '|' + dir + '|' + anim + '|' + fill; let f = this.silFrames.get(key); if (f) return f;
    const a = this.data.units[id]; const S = a.S;
    f = { cv: this.silhouette('u', id, fill), sx: dir * S, sy: this.row(a, anim) * S, S, ox: S / 2, oy: S / 2, sub: true };
    this.silFrames.set(key, f); return f;
  },
};
