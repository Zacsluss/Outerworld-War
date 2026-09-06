'use strict';
// ============================================================================
// Runtime loader for baked sprite sheets (assets/atlas.js + PNGs).
// Team colour is applied by multiplying the mask region with the player colour.
// ============================================================================
const Atlas = {
  data: (typeof SPRITE_ATLAS !== 'undefined') ? SPRITE_ATLAS : null, imgs: {}, tinted: new Map(), frames: new Map(), started: false,
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
  unitFrame(id, color, dir, anim) {
    const key = id + '|' + color + '|' + dir + '|' + anim; let f = this.frames.get(key); if (f) return f;
    const a = this.data.units[id]; const cv = this.sheet('u', id, color); const S = a.S;
    let row = 0; if (anim[0] === 'w') row = a.rows.w + (parseInt(anim.slice(1)) % this.data.walk); else if (anim[0] === 'a') row = a.rows.a + Math.min(this.data.atk - 1, parseInt(anim.slice(1)));
    else row = a.rows.i + (parseInt(anim.slice(1) || '0') % (this.data.idle || 1)); // sheets baked before idle animation have a single idle row
    f = { cv, sx: dir * S, sy: row * S, S, ox: S / 2, oy: S / 2, sub: true }; this.frames.set(key, f); return f;
  },
  buildingImage(id, color) { const a = this.data.buildings[id]; return { cv: this.sheet('b', id, color), M: a.M, T: a.T, W: a.W, H: a.H }; },
};
