'use strict';
// ============================================================================
// Unit sprite painters with animation state. Each paints a unit facing +x at
// the origin with flat colours; Sprites applies lighting and caches per
// (facing, animation frame). st = { sieged, walk: 0..1|null, atk: 0..1|null }
//   sw  : leg/wing swing  -1..1        sw2 : double-rate swing
//   ak  : attack lunge     0..1..0     rec : recoil 1..0
// ============================================================================
const OUT = '#141518';
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; r = clamp(Math.round(r * k), 0, 255); g = clamp(Math.round(g * k), 0, 255); b = clamp(Math.round(b * k), 0, 255); return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0'); };
const ANIM = st => { const w = st && st.walk != null ? st.walk : null, a = st && st.atk != null ? st.atk : null; return { sw: w == null ? 0 : Math.sin(w * Math.PI * 2), sw2: w == null ? 0 : Math.sin(w * Math.PI * 4), ak: a == null ? 0 : Math.sin(a * Math.PI), rec: a == null ? 0 : Math.max(0, 1 - a * 1.5), atk: a != null }; };
const PaintHelpers = c => ({
  E(x, y, rx, ry, fill, stroke = OUT, lw = 1.2, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); } },
  C(x, y, r, fill, stroke = OUT, lw = 1.2) { this.E(x, y, r, r, fill, stroke, lw); },
  R(x, y, w, h, rad, fill, stroke = OUT, lw = 1.2) { c.beginPath(); c.roundRect(x, y, w, h, rad); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); } },
  P(pts, fill, stroke = OUT, lw = 1.2) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); } },
  L(x1, y1, x2, y2, color, lw = 2, cap = 'round') { c.strokeStyle = color; c.lineWidth = lw; c.lineCap = cap; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); },
  Q(x1, y1, cx, cy, x2, y2, color, lw = 2) { c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(cx, cy, x2, y2); c.stroke(); },
  G(x, y, r, color, a = 0.8) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.globalAlpha = 1; },
  // n leg pairs along x; sw swings alternate legs fore/aft (walking gait)
  legs(n, x0, len, spread, color, lw, sw = 0) { for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); const x = x0 + (t - 0.5) * spread; for (const s of [-1, 1]) { const ph = (i % 2 ? -1 : 1) * s * sw; const tipx = x - len * 0.15 + ph * len * 0.45, tipy = s * len * 1.05; const kx = x + ph * len * 0.15 + s * 0, ky = s * len * 0.65; this.Q(x, s * len * 0.25, kx + s * len * 0.25 * 0, ky, tipx, tipy, color, lw); this.C(tipx, tipy, lw * 0.6, color, null); } } },
  // biped feet under a body: two boots that swing fore/aft
  feet(x, y, w, color, sw = 0) { this.E(x + sw * w * 0.9, -y, w * 0.55, w * 0.38, color, OUT, 1); this.E(x - sw * w * 0.9, y, w * 0.55, w * 0.38, color, OUT, 1); },
  // insect / bat wing: pts relative, flap scales the span
  wing(s, r, span, color, edge, flap = 0) { const k = 1 + flap * 0.25; this.P([[-r * .2, 0], [r * .2, s * r * .5 * k], [-r * .3, s * span * k], [-r * .9, s * span * 0.8 * k], [-r * .6, s * r * .3]], color, edge, 1.2); },
});
const TCOL = { M: '#8f9aa6', Md: '#59636d', Ml: '#c3cbd3', gun: '#2b3036', visor: '#57d3ff', F: '#9b7466', Fd: '#5b3d38', Cp: '#6f4f64', bone: '#eadfc8', eye: '#ffd23f', Au: '#d8b24f', Aud: '#8b6c20', Aul: '#f4e2a1', psi: '#62d4ff', navy: '#2c3b70' };
// The neutral palette (race 'N'): map life, the ground above it, derelict structures and the one
// unit a derelict grants. It is deliberately the dullest set of colours in the file. Terran reads as
// steel-blue, Zerg as purple flesh and Protoss as gold, and each of those says "an army is here";
// the whole job of this palette is to say the opposite, so that a woken creature is alarming because
// of what it does rather than because it lit up. Everything here sits in the same value range as the
// terrain and gets its separation from silhouette and outline, not from hue.
const NCOL = {
  soil: '#6b5a41', soilD: '#3f3527', soilL: '#8a7857',       // the tells: churned earth, its shadow, its dust
  chit: '#6d5f4a', chitD: '#3c3427', flesh: '#a8926a', bone: '#d9cfae',   // the wildlife
  steel: '#77807a', steelD: '#3c443f', steelL: '#a7b0a8', amber: '#e8a33c',  // salvaged machinery
  rust: '#7a5236', rustD: '#4a3221', ash: '#2d2c29', dead: '#4c5150',     // ruin: oxide, scorch, cold metal
};
// Which units animate how
const ANIM_KIND = {
  biped: new Set(['scv', 'marine', 'firebat', 'medic', 'ghost', 'zealot', 'high_templar', 'dark_templar', 'infested_terran', 'marauder', 'reaper']),
  legged: new Set(['zergling', 'hydralisk', 'lurker', 'ultralisk', 'defiler', 'broodling', 'dragoon', 'goliath', 'drone', 'larva', 'reaver',
    'carrion_grub', 'carrion_maw', 'sentinel',   // race 'N': two walkers and a tripod. The tells are not units and are not listed.
    'thor', 'widow_mine', 'viking_a']),          // M12: a walker, a tripod-on-a-disc, and a Viking with its legs down
  treads: new Set(['siege_tank', 'cyclone']),
  winged: new Set(['mutalisk', 'guardian', 'devourer', 'scourge', 'queen', 'overlord', 'cocoon']),
  // `engine` is the one of these five that Render.animOf actually reads, and what it means is "this
  // never stops moving, so run its walk cycle whether or not it is going anywhere". Every M12 flyer is
  // here, and so are the hellion and the MULE: a wheeled vehicle idling still has its wheels turning.
  engine: new Set(['wraith', 'valkyrie', 'dropship', 'science_vessel', 'battlecruiser', 'vulture', 'probe', 'shuttle', 'observer', 'scout', 'corsair', 'carrier', 'arbiter', 'interceptor',
    'banshee', 'liberator', 'viking', 'medivac', 'raven', 'hellion', 'mule']),
};
const UNIT_PAINTERS = {
  scv(h, r, TC, TCd, st) { const { M, Md, Ml, visor, gun } = TCOL; const { sw, ak } = ANIM(st); h.feet(-r * .3, r * .62, r * .34, Md, sw); h.R(-r * 1.15, -r * .35, r * .35, r * .7, 2, Md); h.R(-r * .85, -r * .75, r * 1.6, r * 1.5, 3, M); h.R(-r * .6, -r * .55, r * .9, r * .5, 2, TC, OUT, 1); h.E(r * .45, 0, r * .35, r * .45, visor); const ex = ak * r * .25; h.L(r * .2, -r * .65, r * 1.15 + ex, -r * .55, gun, 3); h.L(r * 1.05 + ex, -r * .7, r * 1.25 + ex, -r * .45, Ml, 3); h.L(r * .2, r * .65, r * 1.15 + ex, r * .55, gun, 3); h.L(r * 1.05 + ex, r * .7, r * 1.25 + ex, r * .45, Ml, 3); h.G(-r * 1.2, 0, r * .4, '#7fd0ff'); },
  marine(h, r, TC, TCd, st) { const { M, Md, Ml, visor, gun } = TCOL; const { sw, rec } = ANIM(st); const bx = -rec * r * .15; h.feet(-r * .15, r * .5, r * .3, Md, sw); h.R(-r * .95 + bx, -r * .4, r * .4, r * .8, 2, Md); h.E(-r * .15 + bx, -r * .7, r * .38, r * .3, TC); h.E(-r * .15 + bx, r * .7, r * .38, r * .3, TC); h.C(bx, 0, r * .62, M); h.E(r * .25 + bx, 0, r * .3, r * .38, visor, OUT, 1); h.L(r * .1 + bx, r * .25, r * 1.35 + bx, r * .2, gun, 3.5); h.L(r * .9 + bx, r * .2, r * 1.3 + bx, r * .2, Ml, 1.5); h.C(-r * .05 + bx, -r * .05, r * .2, Ml, null); },
  firebat(h, r, TC, TCd, st) { const { M, Md, Ml, gun } = TCOL; const { sw, ak } = ANIM(st); h.feet(-r * .15, r * .55, r * .32, Md, sw); h.C(-r * .75, -r * .45, r * .3, '#7a2e22'); h.C(-r * .75, r * .45, r * .3, '#7a2e22'); h.E(-r * .1, -r * .75, r * .42, r * .33, TC); h.E(-r * .1, r * .75, r * .42, r * .33, TC); h.C(0, 0, r * .68, '#a08a72'); h.E(r * .25, 0, r * .28, r * .34, '#ff9a3c', OUT, 1); h.L(r * .2, -r * .5, r * 1.3, -r * .45, gun, 4); h.L(r * .2, r * .5, r * 1.3, r * .45, gun, 4); h.C(r * 1.3, -r * .45, r * .12 + ak * r * .2, '#ffd050', null); h.C(r * 1.3, r * .45, r * .12 + ak * r * .2, '#ffd050', null); },
  medic(h, r, TC, TCd, st) { const { Md, visor } = TCOL; const { sw } = ANIM(st); h.feet(-r * .15, r * .5, r * .3, Md, sw); h.R(-r * .9, -r * .4, r * .35, r * .8, 2, Md); h.E(-r * .15, -r * .7, r * .36, r * .3, TC); h.E(-r * .15, r * .7, r * .36, r * .3, TC); h.C(0, 0, r * .62, '#e6eaee'); h.E(r * .25, 0, r * .28, r * .36, visor, OUT, 1); h.L(-r * .35, -r * .2, -r * .35, r * .2, '#e03030', 3); h.L(-r * .55, 0, -r * .15, 0, '#e03030', 3); h.L(r * .1, r * .3, r * .9, r * .3, '#9aa3ad', 2.5); },
  ghost(h, r, TC, TCd, st) { const { gun, Ml } = TCOL; const { sw, rec } = ANIM(st); const bx = -rec * r * .2; h.feet(-r * .15, r * .45, r * .26, '#2b3036', sw); h.E(-r * .15 + bx, -r * .6, r * .3, r * .22, TC); h.E(-r * .15 + bx, r * .6, r * .3, r * .22, TC); h.C(bx, 0, r * .55, '#3b434c'); h.E(r * .22 + bx, 0, r * .28, r * .3, '#ff4d4d', OUT, 1); h.L(bx, r * .2, r * 1.7 + bx, r * .15, gun, 3); h.L(r * 1.2 + bx, r * .15, r * 1.65 + bx, r * .15, Ml, 1.2); },
  vulture(h, r, TC, TCd, st) { const { M, Md, Ml, gun } = TCOL; const { sw2, rec } = ANIM(st); h.P([[r * 1.25, 0], [r * .6, -r * .55], [-r * .9, -r * .6], [-r * 1.1, -r * .25], [-r * 1.1, r * .25], [-r * .9, r * .6], [r * .6, r * .55]], M); h.R(-r * .55, -r * .35, r * .75, r * .7, 3, TC, OUT, 1); h.C(-r * .05, 0, r * .28, Md); h.L(r * .7 - rec * r * .15, -r * .3, r * 1.2 - rec * r * .15, -r * .1, gun, 3); h.L(r * .7 - rec * r * .15, r * .3, r * 1.2 - rec * r * .15, r * .1, gun, 3); h.R(r * .45, -r * .25, r * .35, r * .5, 2, Ml, OUT, 1); h.G(-r * 1.15, 0, r * (.5 + sw2 * .12), '#7fc8ff'); },
  siege_tank(h, r, TC, TCd, st) { const { M, Md, Ml, gun } = TCOL; const { rec } = ANIM(st); const s = st && st.sieged; const off = st && st.walk != null ? (st.walk % 1) * r * .34 : 0;
    if (s) { for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { h.L(dx * r * .5, dy * r * .5, dx * r * 1.15, dy * r * 1.05, Md, 5); h.C(dx * r * 1.15, dy * r * 1.05, r * .2, Md); } }
    h.R(-r * 1.0, -r * .95, r * 2.0, r * .32, 3, '#3a3f45'); h.R(-r * 1.0, r * .63, r * 2.0, r * .32, 3, '#3a3f45'); for (let k = 0; k < 7; k++) { const x = -r * .95 + ((k * r * .34 + off) % (r * 2.0)); h.L(x, -r * .92, x, -r * .66, '#5a6068', 1.5); h.L(x, r * .66, x, r * .92, '#5a6068', 1.5); }
    h.R(-r * .95, -r * .65, r * 1.9, r * 1.3, 4, M); h.R(-r * .75, -r * .5, r * .5, r * 1.0, 2, TC, OUT, 1); h.C(r * .05, 0, r * .55, Md); h.C(r * .05, 0, r * .38, M, null);
    const rb = rec * r * (s ? .45 : .25); if (s) { h.L(r * .3, 0, r * 1.9 - rb, 0, gun, 6); h.L(r * 1.4 - rb, 0, r * 1.95 - rb, 0, Ml, 2); h.R(r * .1, -r * .22, r * .5, r * .44, 2, '#4a5058'); } else { h.L(r * .3, 0, r * 1.45 - rb, 0, gun, 5); h.L(r * 1.1 - rb, 0, r * 1.5 - rb, 0, Ml, 2); } },
  goliath(h, r, TC, TCd, st) { const { M, Md, Ml, gun } = TCOL; const { sw, rec } = ANIM(st); const l = sw * r * .35; h.L(-r * .2, -r * .5, -r * .8 + l, -r * 1.05, Md, 6); h.L(-r * .2, r * .5, -r * .8 - l, r * 1.05, Md, 6); h.R(-r * 1.05 + l, -r * 1.2, r * .5, r * .35, 2, Md); h.R(-r * 1.05 - l, r * .85, r * .5, r * .35, 2, Md); h.R(-r * .7, -r * .6, r * 1.4, r * 1.2, 4, M); h.R(-r * .45, -r * .35, r * .5, r * .7, 2, TC, OUT, 1); h.E(r * .35, 0, r * .3, r * .4, TCOL.visor, OUT, 1); const rb = rec * r * .2; h.L(r * .2, -r * .85, r * 1.35 - rb, -r * .8, gun, 4); h.L(r * .2, r * .85, r * 1.35 - rb, r * .8, gun, 4); h.L(r * 1.05 - rb, -r * .8, r * 1.4 - rb, -r * .8, Ml, 1.5); h.L(r * 1.05 - rb, r * .8, r * 1.4 - rb, r * .8, Ml, 1.5); },
  wraith(h, r, TC, TCd, st) { const { M, Md, Ml, visor } = TCOL; const { sw2 } = ANIM(st); h.P([[r * 1.3, 0], [r * .2, -r * .35], [-r * .6, -r * 1.05], [-r * 1.0, -r * .9], [-r * .7, -r * .25], [-r * .7, r * .25], [-r * 1.0, r * .9], [-r * .6, r * 1.05], [r * .2, r * .35]], M); h.P([[-r * .55, -r * .95], [-r * .9, -r * .85], [-r * .65, -r * .35]], TC, OUT, 1); h.P([[-r * .55, r * .95], [-r * .9, r * .85], [-r * .65, r * .35]], TC, OUT, 1); h.E(r * .35, 0, r * .45, r * .2, visor, OUT, 1); h.G(-r * .8, 0, r * (.45 + sw2 * .1), '#8fd4ff'); },
  dropship(h, r, TC, TCd, st) { const { M, Md, Ml, visor } = TCOL; const { sw2 } = ANIM(st); h.R(-r * .6, -r * 1.05, r * .9, r * .35, 3, Md); h.R(-r * .6, r * .7, r * .9, r * .35, 3, Md); h.E(0, 0, r * 1.05, r * .7, M); h.R(-r * .5, -r * .3, r * .6, r * .6, 2, TC, OUT, 1); h.E(r * .55, 0, r * .3, r * .4, visor, OUT, 1); h.G(-r * .95, -r * .85, r * (.35 + sw2 * .08), '#8fd4ff'); h.G(-r * .95, r * .85, r * (.35 - sw2 * .08), '#8fd4ff'); },
  science_vessel(h, r, TC, TCd, st) { const { M, Md, Ml, visor } = TCOL; const { sw } = ANIM(st); h.E(0, 0, r * 1.05, r * .85, null, Ml, 4); h.E(0, 0, r * 1.05, r * .85, null, Md, 1.5); h.C(0, 0, r * .55, M); h.C(0, 0, r * .3, visor, OUT, 1); h.L(-r * .3, -r * .55, -r * .6 + sw * 2, -r * 1.2, Md, 2.5); h.L(-r * .3, r * .55, -r * .6 - sw * 2, r * 1.2, Md, 2.5); h.R(r * .2, -r * .2, r * .6, r * .4, 2, TC, OUT, 1); },
  battlecruiser(h, r, TC, TCd, st) { const { M, Md, Ml, visor } = TCOL; const { sw2, rec } = ANIM(st); h.P([[r * 1.25, 0], [r * .7, -r * .45], [-r * .4, -r * .6], [-r * 1.05, -r * .5], [-r * 1.05, r * .5], [-r * .4, r * .6], [r * .7, r * .45]], Md); h.R(-r * .8, -r * .3, r * 1.4, r * .6, 3, M); h.R(-r * .55, -r * .2, r * .5, r * .4, 2, TC, OUT, 1); h.E(r * .35, 0, r * .28, r * .18, visor, OUT, 1); h.L(-r * .2, -r * .75, r * .6 - rec * r * .1, -r * .75, Md, 4); h.L(-r * .2, r * .75, r * .6 - rec * r * .1, r * .75, Md, 4); for (const dy of [-.3, 0, .3]) h.G(-r * 1.1, r * dy, r * (.3 + sw2 * .06), '#8fd4ff'); },
  valkyrie(h, r, TC, TCd, st) { const { M, Md, Ml, visor } = TCOL; const { sw2 } = ANIM(st); h.P([[r * 1.2, 0], [r * .3, -r * .4], [-r * .3, -r * 1.05], [-r * .95, -r * .95], [-r * .8, -r * .3], [-r * .8, r * .3], [-r * .95, r * .95], [-r * .3, r * 1.05], [r * .3, r * .4]], M); h.R(-r * .55, -r * 1.0, r * .9, r * .28, 2, Md); h.R(-r * .55, r * .72, r * .9, r * .28, 2, Md); h.R(-r * .4, -r * .28, r * .55, r * .56, 2, TC, OUT, 1); h.E(r * .4, 0, r * .35, r * .18, visor, OUT, 1); h.G(-r * .95, 0, r * (.4 + sw2 * .1), '#8fd4ff'); },
  spider_mine(h, r) { h.C(0, 0, r * .9, '#4a5058'); h.C(0, 0, r * .45, '#2b3036'); h.C(r * .3, 0, r * .15, '#ff3030', null); },
  nuke() { }, scanner() { },
  drone(h, r, TC, TCd, st) { const { F, Fd, Cp, bone } = TCOL; const { sw, ak } = ANIM(st); const wk = 1 + sw * .3; h.E(-r * .5, -r * .55 * wk, r * .45, r * .25, 'rgba(200,210,230,0.45)', 'rgba(60,60,80,0.5)', 1, -0.4); h.E(-r * .5, r * .55 * wk, r * .45, r * .25, 'rgba(200,210,230,0.45)', 'rgba(60,60,80,0.5)', 1, 0.4); h.E(-r * .1, 0, r * .85, r * .6, F); h.E(-r * .2, 0, r * .35, r * .28, TC, OUT, 1); h.C(r * .55, 0, r * .35, Cp); const ex = ak * r * .3; h.Q(r * .7, -r * .3, r * 1.2 + ex, -r * .6, r * 1.15 + ex, -r * .1 + ak * r * .1, bone, 2.5); h.Q(r * .7, r * .3, r * 1.2 + ex, r * .6, r * 1.15 + ex, r * .1 - ak * r * .1, bone, 2.5); },
  overlord(h, r, TC, TCd, st) { const { F, Fd, Cp } = TCOL; const { sw } = ANIM(st); for (let k = 0; k < 4; k++) { const wv = Math.sin(k * 1.3) * sw * r * .15; h.Q(-r * .6 + k * r * .4, r * .5, -r * .6 + k * r * .4 - r * .2 + wv, r * .9, -r * .5 + k * r * .35 + wv * 2, r * 1.15, Fd, 3); } h.E(0, 0, r * 1.05, r * .78, '#8f6e60'); h.E(-r * .1, -r * .1, r * .75, r * .45, '#a68878', null); h.E(0, 0, r * .45, r * .3, TC, OUT, 1); h.C(r * .85, 0, r * .3, Cp); h.C(r * .95, -r * .1, r * .07, TCOL.eye, null); },
  zergling(h, r, TC, TCd, st) { const { F, Fd, Cp, bone } = TCOL; const { sw, ak } = ANIM(st); h.legs(2, -r * .2, r * .9, r * .9, Fd, 2, sw); h.P([[-r * .9, -r * .2], [-r * 1.4, -r * .9], [-r * .5, -r * .5]], 'rgba(120,80,100,0.55)', Fd, 1); h.P([[-r * .9, r * .2], [-r * 1.4, r * .9], [-r * .5, r * .5]], 'rgba(120,80,100,0.55)', Fd, 1); h.E(-r * .15, 0, r * .85, r * .5, F); h.E(-r * .25, 0, r * .3, r * .22, TC, OUT, 1); const hx = ak * r * .25; h.C(r * .55 + hx, 0, r * .4, Cp); const ja = ak * r * .3; h.L(r * .8 + hx, -r * .25, r * 1.2 + hx + ja, -r * .45 + ja * .5, bone, 2); h.L(r * .8 + hx, r * .25, r * 1.2 + hx + ja, r * .45 - ja * .5, bone, 2); h.C(r * .65 + hx, -r * .15, r * .06, TCOL.eye, null); h.C(r * .65 + hx, r * .15, r * .06, TCOL.eye, null); },
  hydralisk(h, r, TC, TCd, st) { const { F, Fd, Cp, bone } = TCOL; const { sw, ak } = ANIM(st); h.E(-r * .7, sw * r * .18, r * .75, r * .35, Fd, OUT, 1.2, sw * 0.15); h.E(-r * .35, sw * r * .08, r * .55, r * .4, F); for (let k = 0; k < 4; k++) h.L(-r * 1.3 + k * r * .3, -r * .1 + sw * r * .12, -r * 1.35 + k * r * .3, -r * .5 + sw * r * .1, bone, 1.5); const fl = 1 + ak * .35; h.E(r * .1, 0, r * .65, r * .8 * fl, Cp); h.E(r * .1, 0, r * .35, r * .5 * fl, TC, OUT, 1); h.C(r * .45, 0, r * .32, F); const back = ak * r * .5; h.Q(r * .3, -r * .6, r * 1.1 - back, -r * .9, r * 1.3 - back, -r * .2, bone, 3); h.Q(r * .3, r * .6, r * 1.1 - back, r * .9, r * 1.3 - back, r * .2, bone, 3); if (ak > 0.3) { h.C(r * .8, 0, r * .12, '#ffd0ff', null); } },
  lurker(h, r, TC, TCd, st) { const { F, Fd, Cp, bone } = TCOL; const { sw } = ANIM(st); h.legs(3, -r * .1, r * .9, r * 1.2, Fd, 2.5, sw); h.E(0, 0, r * 1.0, r * .7, Cp); h.E(-r * .2, 0, r * .55, r * .4, TC, OUT, 1); for (let k = 0; k < 5; k++) h.L(-r * .7 + k * r * .35, 0, -r * .8 + k * r * .35, -r * .9 - (k % 2) * r * .2, bone, 2); h.C(r * .7, 0, r * .35, F); },
  mutalisk(h, r, TC, TCd, st) { const { F, Fd, Cp } = TCOL; const { sw, ak } = ANIM(st); h.wing(-1, r, r * 1.35, '#7d5566', Fd, sw); h.wing(1, r, r * 1.35, '#7d5566', Fd, sw); h.Q(-r * .4, 0, -r * 1.0, r * .1 + sw * r * .1, -r * 1.4, -r * .3 + sw * r * .2, Fd, 2.5); h.E(0, 0, r * .55, r * .3, F); h.E(-r * .05, 0, r * .25, r * .16, TC, OUT, 1); h.C(r * .5 + ak * r * .15, 0, r * .25, Cp); },
  scourge(h, r, TC, TCd, st) { const { F, Fd } = TCOL; const { sw } = ANIM(st); const k = 1 + sw * .3; h.P([[0, 0], [-r * .5, -r * 1.1 * k], [-r * 1.0, -r * .4 * k]], '#8a5a72', Fd, 1); h.P([[0, 0], [-r * .5, r * 1.1 * k], [-r * 1.0, r * .4 * k]], '#8a5a72', Fd, 1); h.E(0, 0, r * .55, r * .4, F); h.C(r * .3, 0, r * .2, TC, OUT, 1); },
  queen(h, r, TC, TCd, st) { const { F, Fd, Cp } = TCOL; const { sw } = ANIM(st); const k = 1 + sw * .25; const wing = s => h.P([[0, 0], [r * .1, s * r * .5 * k], [-r * .5, s * r * 1.3 * k], [-r * 1.2, s * r * .9 * k], [-r * .7, s * r * .25]], '#8c6a8f', Fd, 1.2); wing(-1); wing(1); h.E(-r * .1, 0, r * .8, r * .32, F); h.E(-r * .2, 0, r * .3, r * .18, TC, OUT, 1); h.C(r * .6, 0, r * .28, Cp); h.Q(-r * .8, 0, -r * 1.3, r * .3, -r * 1.5, -r * .2 + sw * r * .2, Fd, 2); },
  guardian(h, r, TC, TCd, st) { const { F, Fd, Cp, bone } = TCOL; const { sw } = ANIM(st); const k = 1 + sw * .2; h.P([[-r * .2, 0], [0, -r * .5 * k], [-r * .7, -r * 1.05 * k], [-r * 1.1, -r * .5 * k]], '#7d5566', Fd, 1.2); h.P([[-r * .2, 0], [0, r * .5 * k], [-r * .7, r * 1.05 * k], [-r * 1.1, r * .5 * k]], '#7d5566', Fd, 1.2); h.E(0, 0, r * .95, r * .62, Cp); h.E(-r * .15, 0, r * .45, r * .3, TC, OUT, 1); h.Q(r * .5, -r * .4, r * 1.1, -r * .6, r * 1.0, 0, bone, 3); h.Q(r * .5, r * .4, r * 1.1, r * .6, r * 1.0, 0, bone, 3); h.C(r * .55, 0, r * .3, F); },
  devourer(h, r, TC, TCd, st) { const { F, Fd, Cp, bone } = TCOL; const { sw, ak } = ANIM(st); const k = 1 + sw * .2; h.P([[-r * .3, 0], [0, -r * .6 * k], [-r * .6, -r * 1.15 * k], [-r * 1.2, -r * .6 * k]], '#5f7a60', Fd, 1.2); h.P([[-r * .3, 0], [0, r * .6 * k], [-r * .6, r * 1.15 * k], [-r * 1.2, r * .6 * k]], '#5f7a60', Fd, 1.2); h.E(0, 0, r * 1.0, r * .7, '#6d8a6a'); h.E(-r * .2, 0, r * .4, r * .3, TC, OUT, 1); h.E(r * .6, 0, r * .45, r * .5 * (1 + ak * .3), Cp); h.L(r * .8, -r * .35, r * 1.2, -r * .2 - ak * r * .2, bone, 2.5); h.L(r * .8, r * .35, r * 1.2, r * .2 + ak * r * .2, bone, 2.5); },
  ultralisk(h, r, TC, TCd, st) { const { F, Fd, Cp, bone } = TCOL; const { sw, ak } = ANIM(st); h.legs(2, -r * .15, r * 1.0, r * 1.1, Fd, 5, sw); h.E(-r * .1, 0, r * 1.0, r * .72, '#7a5546'); h.E(-r * .3, 0, r * .55, r * .4, Cp, OUT, 1); h.E(-r * .3, 0, r * .3, r * .2, TC, OUT, 1); h.C(r * .65, 0, r * .45, F); const sweep = ak * r * .5; h.Q(r * .8, -r * .35, r * 1.5, -r * 1.0 + sweep, r * 1.7 + sweep * .4, -r * .3 + sweep, bone, 4); h.Q(r * .8, r * .35, r * 1.5, r * 1.0 - sweep, r * 1.7 + sweep * .4, r * .3 - sweep, bone, 4); h.C(r * .8, -r * .12, r * .07, TCOL.eye, null); h.C(r * .8, r * .12, r * .07, TCOL.eye, null); },
  defiler(h, r, TC, TCd, st) { const { F, Fd, Cp, bone } = TCOL; const { sw } = ANIM(st); h.legs(3, -r * .1, r * .8, r * 1.1, Fd, 2, sw); h.E(-r * .1, 0, r * .8, r * .5, '#5a4a6a'); h.E(-r * .2, 0, r * .3, r * .22, TC, OUT, 1); h.Q(-r * .7, 0, -r * 1.5, -r * .2 + sw * r * .2, -r * 1.3, -r * .9 + sw * r * .15, Cp, 4); h.C(-r * 1.3, -r * .9 + sw * r * .15, r * .15, bone, OUT, 1); h.C(r * .55, 0, r * .32, Cp); h.L(r * .7, -r * .2, r * 1.1, -r * .45, bone, 2); h.L(r * .7, r * .2, r * 1.1, r * .45, bone, 2); },
  broodling(h, r, TC, TCd, st) { const { F, Fd } = TCOL; const { sw, ak } = ANIM(st); h.legs(2, 0, r * .8, r * .8, Fd, 1.5, sw); h.E(0, 0, r * .8, r * .5, '#a58a6a'); h.C(r * .5 + ak * r * .2, 0, r * .3, TC, OUT, 1); },
  infested_terran(h, r, TC, TCd, st) { const { sw } = ANIM(st); h.feet(-r * .15, r * .5, r * .3, '#4a5a30', sw); h.C(0, 0, r * .62, '#7f9a63'); h.E(-r * .15, -r * .7, r * .36, r * .3, TC); h.E(-r * .15, r * .7, r * .36, r * .3, TC); h.E(r * .25, 0, r * .28, r * .34, '#c0ff60', OUT, 1); h.L(-r * .2, -r * .2, -r * .8, -r * .9, '#5a6a40', 3); },
  larva(h, r, TC, TCd, st) { const { sw } = ANIM(st); for (let k = 0; k < 3; k++) h.E(-r * .5 + k * r * .45, sw * r * .1 * (k - 1), r * .4, r * .32 + k * r * .05, k === 2 ? '#c99aa5' : '#b48a98'); h.C(r * .5, -r * .12, r * .05, '#222', null); h.C(r * .5, r * .12, r * .05, '#222', null); },
  egg(h, r) { h.E(0, 0, r * .8, r * 1.0, '#a08a98', OUT, 1.5); h.E(-r * .15, -r * .2, r * .35, r * .5, 'rgba(210,170,210,0.5)', null); h.E(0, 0, r * .45, r * .6, 'rgba(120,60,110,0.55)', null); },
  lurker_egg(h, r, TC, TCd, st) { UNIT_PAINTERS.egg(h, r, TC, TCd, st); },
  cocoon(h, r, TC, TCd, st) { const { sw } = ANIM(st); h.E(0, 0, r * .75 * (1 + sw * .03), r * 1.0, '#7d6a80', OUT, 1.5); h.E(0, 0, r * .4, r * .6, 'rgba(120,80,140,0.6)', null); },
  probe(h, r, TC, TCd, st) { const { Au, Aud, Aul, psi } = TCOL; const { sw2 } = ANIM(st); h.P([[r * 1.1, 0], [r * .2, -r * .7], [-r * .7, -r * .55], [-r * .9, 0], [-r * .7, r * .55], [r * .2, r * .7]], Au); h.E(-r * .2, 0, r * .4, r * .35, TC, OUT, 1); h.C(r * .3, 0, r * .25, psi, OUT, 1); h.G(-r * 1.0, 0, r * (.45 + sw2 * .1), '#8fe0ff'); },
  zealot(h, r, TC, TCd, st) { const { Au, Aud, Aul, psi } = TCOL; const { sw, ak } = ANIM(st); h.feet(-r * .15, r * .5, r * .32, Aud, sw); h.E(-r * .1, -r * .75, r * .48, r * .35, TC); h.E(-r * .1, r * .75, r * .48, r * .35, TC); h.C(0, 0, r * .6, Au); h.C(r * .15, 0, r * .28, Aud); h.C(r * .25, 0, r * .12, psi, null); const th = ak * r * .5, sp = (1 - ak * .6); h.L(r * .3, -r * .55 * sp, r * 1.4 + th, -r * .5 * sp, psi, 3); h.L(r * .3, r * .55 * sp, r * 1.4 + th, r * .5 * sp, psi, 3); h.L(r * .3, -r * .55 * sp, r * 1.4 + th, -r * .5 * sp, '#ffffff', 1); h.L(r * .3, r * .55 * sp, r * 1.4 + th, r * .5 * sp, '#ffffff', 1); },
  dragoon(h, r, TC, TCd, st) { const { Au, Aud, Aul, psi } = TCOL; const { sw, rec } = ANIM(st); let i = 0; for (const [a, s] of [[0.7, 1], [0.7, -1], [2.4, 1], [2.4, -1]]) { const ph = (i % 2 ? -1 : 1) * s * sw; i++; const x1 = Math.cos(a) * r * .45, y1 = Math.sin(a) * r * .45 * s, x2 = Math.cos(a) * r * 1.1 + ph * r * .3, y2 = Math.sin(a) * r * 1.1 * s; h.L(x1, y1, x2 * .8, y2 * 1.1, Aud, 4); h.L(x2 * .8, y2 * 1.1, x2 * 1.05, y2 * .95, Au, 3); } const bx = -rec * r * .15; h.E(bx, 0, r * .7, r * .55, Au); h.E(-r * .15 + bx, 0, r * .3, r * .25, TC, OUT, 1); h.C(r * .3 + bx, 0, r * .28, '#2c3b70'); h.C(r * .3 + bx, 0, r * .16 + rec * r * .08, psi, null); },
  high_templar(h, r, TC, TCd, st) { const { sw, ak } = ANIM(st); h.E(-r * .2, 0, r * .55, r * .7 + sw * r * .04, '#e6dbbf'); h.E(-r * .3, 0, r * .3, r * .5, TC, OUT, 1); h.C(r * .2, 0, r * .32, '#3a3050'); h.C(r * .3, 0, r * .12, TCOL.psi, null); h.G(r * .9, -r * .5, r * (.3 + ak * .3), '#9fe8ff'); h.G(r * .9, r * .5, r * (.3 + ak * .3), '#9fe8ff'); },
  dark_templar(h, r, TC, TCd, st) { const { sw, ak } = ANIM(st); h.E(-r * .2, 0, r * .55, r * .7 + sw * r * .04, '#2d3140'); h.E(-r * .3, 0, r * .3, r * .5, TC, OUT, 1); h.C(r * .2, 0, r * .32, '#1b1e28'); h.C(r * .28, 0, r * .1, '#7cff9a', null); const a = -0.5 + ak * 1.2; const x2 = r * .2 + Math.cos(a) * r * 1.3, y2 = r * .45 + Math.sin(a) * r * 1.3; h.L(r * .2, r * .45, x2, y2, '#7cff9a', 2.5); h.L(r * .2, r * .45, x2, y2, '#e8ffee', 1); },
  archon(h, r, TC) { h.G(0, 0, r * 1.3, '#66c8ff', 0.9); h.C(0, 0, r * .55, '#dff6ff', null); h.C(0, 0, r * .3, '#ffffff', null); h.G(0, 0, r * .8, TC, 0.35); },
  dark_archon(h, r) { h.G(0, 0, r * 1.3, '#c04cff', 0.9); h.C(0, 0, r * .55, '#f0c8ff', null); h.C(0, 0, r * .28, '#ff6a6a', null); },
  reaver(h, r, TC, TCd, st) { const { Au, Aud, Aul, psi } = TCOL; const { sw, rec } = ANIM(st); for (let k = 3; k >= 0; k--) { const x = -r * .9 + k * r * .45; const yy = Math.sin(sw * 1.5 + k * 1.2) * sw * r * .08; h.E(x, yy, r * .4, r * .5 - k * r * .04, k % 2 ? Au : TC, OUT, 1.2); } h.E(r * .6 - rec * r * .15, 0, r * .45, r * .55, Aud); h.C(r * .8 - rec * r * .15, 0, r * .18, psi, null); h.R(-r * .2, -r * .7, r * .6, r * .2, 2, Aul, OUT, 1); },
  shuttle(h, r, TC, TCd, st) { const { Au, Aud, psi } = TCOL; const { sw2 } = ANIM(st); h.R(-r * .9, -r * .55, r * 1.8, r * 1.1, 6, Au); h.R(-r * .5, -r * .3, r * .7, r * .6, 3, TC, OUT, 1); h.E(r * .55, 0, r * .25, r * .35, '#2c3b70', OUT, 1); h.G(-r * .95, -r * .3, r * (.3 + sw2 * .08), '#8fe0ff'); h.G(-r * .95, r * .3, r * (.3 - sw2 * .08), '#8fe0ff'); },
  observer(h, r, TC, TCd, st) { const { Au, psi } = TCOL; const { sw } = ANIM(st); for (let k = 0; k < 3; k++) { const a = k * 2.09 + 0.5 + sw * 0.3; h.L(0, 0, Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1, Au, 2); } h.C(0, 0, r * .5, '#3a4a80'); h.C(0, 0, r * .25, psi, null); },
  scout(h, r, TC, TCd, st) { const { Au, Aud, psi } = TCOL; const { sw2 } = ANIM(st); h.P([[r * 1.3, 0], [r * .3, -r * .35], [-r * .5, -r * 1.0], [-r * 1.0, -r * .8], [-r * .7, -r * .2], [-r * .7, r * .2], [-r * 1.0, r * .8], [-r * .5, r * 1.0], [r * .3, r * .35]], Au); h.R(-r * .55, -r * .25, r * .7, r * .5, 3, TC, OUT, 1); h.E(r * .5, 0, r * .3, r * .15, '#2c3b70', OUT, 1); h.G(-r * .85, 0, r * (.4 + sw2 * .1), '#8fe0ff'); },
  corsair(h, r, TC, TCd, st) { const { Au, Aud, psi } = TCOL; const { sw2 } = ANIM(st); h.P([[r * .6, 0], [r * .1, -r * .5], [-r * .9, -r * .7], [-r * .7, 0], [-r * .9, r * .7], [r * .1, r * .5]], Au); h.L(r * .3, -r * .45, r * 1.3, -r * .35, Aud, 3.5); h.L(r * .3, r * .45, r * 1.3, r * .35, Aud, 3.5); h.C(-r * .2, 0, r * .3, TC, OUT, 1); h.C(-r * .2, 0, r * .14 + sw2 * .03 * r, psi, null); },
  carrier(h, r, TC, TCd, st) { const { Au, Aud, Aul, psi } = TCOL; const { sw2 } = ANIM(st); h.E(0, 0, r * 1.1, r * .6, Au); h.R(-r * .9, -r * .35, r * .5, r * .7, 3, Aud); for (let k = 0; k < 3; k++) { h.R(-r * .3 + k * r * .35, -r * .55, r * .25, r * .2, 1, '#2c3b70', OUT, 1); h.R(-r * .3 + k * r * .35, r * .35, r * .25, r * .2, 1, '#2c3b70', OUT, 1); } h.R(-r * .2, -r * .2, r * .7, r * .4, 2, TC, OUT, 1); h.C(r * .85, 0, r * .15, psi, null); h.G(-r * 1.15, 0, r * (.4 + sw2 * .1), '#8fe0ff'); },
  arbiter(h, r, TC, TCd, st) { const { Au, Aud, psi } = TCOL; const { sw2 } = ANIM(st); h.P([[r * 1.1, 0], [0, -r * .9], [-r * 1.1, 0], [0, r * .9]], Au); h.P([[r * .5, 0], [0, -r * .4], [-r * .5, 0], [0, r * .4]], TC, OUT, 1); h.C(0, 0, r * .25, psi, null); h.G(0, 0, r * (.6 + sw2 * .1), '#8fe0ff', 0.5); },
  scarab(h, r) { h.C(0, 0, r * 1.2, TCOL.Au); h.C(r * .3, 0, r * .5, TCOL.psi, null); },
  interceptor(h, r, TC) { h.P([[r * 1.6, 0], [-r * .6, -r * 1.2], [-r * .2, 0], [-r * .6, r * 1.2]], TCOL.Au); h.C(r * .2, 0, r * .4, TC, null); },
  hallucination(h, r) { h.C(0, 0, r * .6, 'rgba(120,200,255,0.6)'); },

  // ============================ NEUTRAL LIFE, AND THE GROUND ABOVE IT ============================
  // Painted in NCOL, not TCOL: the wildlife belongs to no race and must not read as a fourth army.
  // Every one of these is dirt, chitin and old bone -- desaturated browns against the terrain's own
  // palette -- and the team colour is used only where the engine insists on it (a thin membrane band
  // on the creatures, because Sprites tints by owner and the neutral owner's colour is the dead
  // ochre in RACE_INFO.N, so the band reads as part of the animal rather than as a banner).
  //
  // The three TELLS are the point of the feature and are drawn like ground decals, not like units:
  // low contrast, no outline, nothing that reads as a silhouette. A tell should be the sort of thing
  // you notice on the second look and kick yourself about on the third. They are addressed by key
  // from DATA.buriedTells, and the renderer calls them exactly as it calls a unit painter, with
  // `r` in pixels -- so `r` here is the whole radius of the disturbed patch, not a body radius.
  carrion_grub(h, r, TC, TCd, st) {
    const { chit, chitD, flesh, bone } = NCOL; const { sw, ak } = ANIM(st);
    h.legs(3, -r * .15, r * .55, r * 1.1, chitD, 1.8, sw);
    for (let k = 0; k < 4; k++) { const t = k / 3; h.E(-r * .85 + k * r * .42, sw * r * .07 * (k - 1.5), r * .32 - t * r * .05, r * .34 - t * r * .07, k % 2 ? flesh : '#9d8a63'); }
    h.E(-r * .5, 0, r * .26, r * .18, TC, OUT, 1);                                  // the one team-coloured band
    const hx = ak * r * .2; h.C(r * .62 + hx, 0, r * .34, chit);                    // chitin head
    const ja = ak * r * .28;
    h.L(r * .85 + hx, -r * .2, r * 1.2 + hx + ja, -r * .42 + ja * .4, bone, 2);     // mandibles
    h.L(r * .85 + hx, r * .2, r * 1.2 + hx + ja, r * .42 - ja * .4, bone, 2);
    h.C(r * .7 + hx, -r * .13, r * .05, '#d8452c', null); h.C(r * .7 + hx, r * .13, r * .05, '#d8452c', null);
  },
  carrion_maw(h, r, TC, TCd, st) {
    const { chit, chitD, flesh, bone } = NCOL; const { sw, ak } = ANIM(st);
    h.legs(2, -r * .1, r * .95, r * 1.15, chitD, 5, sw);
    h.E(-r * .15, 0, r * 1.0, r * .74, chit);                                        // carapace
    for (let k = 0; k < 4; k++) { const x = -r * .8 + k * r * .42; h.P([[x - r * .1, -r * .1], [x + r * .06, -r * .95 - (k % 2) * r * .12], [x + r * .2, -r * .1]], bone, OUT, 1); h.P([[x - r * .1, r * .1], [x + r * .06, r * .95 + (k % 2) * r * .12], [x + r * .2, r * .1]], bone, OUT, 1); }
    h.E(-r * .35, 0, r * .42, r * .3, TC, OUT, 1);
    const gape = 1 + ak * .55;
    h.C(r * .62, 0, r * .48 * gape, '#2a1f1a');                                      // the maw itself
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; h.P([[r * .62 + Math.cos(a) * r * .46 * gape, Math.sin(a) * r * .46 * gape], [r * .62 + Math.cos(a + .35) * r * .46 * gape, Math.sin(a + .35) * r * .46 * gape], [r * .62 + Math.cos(a + .17) * r * .2 * gape, Math.sin(a + .17) * r * .2 * gape]], bone, null); }
    h.C(r * .28, -r * .3, r * .07, '#d8452c', null); h.C(r * .28, r * .3, r * .07, '#d8452c', null);
  },
  // The Sentinel is salvaged machinery and is deliberately in nobody's material language: no Terran
  // rivets, no Zerg carapace, no Protoss gold. A drum on a tripod with a twin barrel and one amber
  // eye, in the grey-green of something that has been standing outdoors for a very long time.
  sentinel(h, r, TC, TCd, st) {
    const { steel, steelD, steelL, amber } = NCOL; const { sw, rec } = ANIM(st);
    for (const [a, s] of [[2.2, 1], [2.2, -1], [0, 1]]) { const ph = s * sw * r * .18; h.L(Math.cos(a) * r * .35, Math.sin(a) * r * .35 * s, Math.cos(a) * r * 1.0 + ph, Math.sin(a) * r * 1.0 * s, steelD, 4); h.C(Math.cos(a) * r * 1.0 + ph, Math.sin(a) * r * 1.0 * s, r * .13, steelD); }
    const bx = -rec * r * .12;
    h.C(bx, 0, r * .62, steel);                                                       // armoured drum
    h.C(bx, 0, r * .42, steelD, null);
    h.R(bx - r * .5, -r * .16, r * .35, r * .32, 2, TC, OUT, 1);                       // owner's plate
    for (let k = 0; k < 5; k++) { const a = k * 1.256 + .3; h.L(bx + Math.cos(a) * r * .44, Math.sin(a) * r * .44, bx + Math.cos(a) * r * .6, Math.sin(a) * r * .6, steelL, 1.5); }
    const rb = rec * r * .22;
    h.L(bx + r * .3, -r * .17, r * 1.35 - rb, -r * .15, '#33383a', 3.5);               // twin barrel
    h.L(bx + r * .3, r * .17, r * 1.35 - rb, r * .15, '#33383a', 3.5);
    h.L(r * 1.05 - rb, -r * .15, r * 1.4 - rb, -r * .15, steelL, 1.4);
    h.L(r * 1.05 - rb, r * .15, r * 1.4 - rb, r * .15, steelL, 1.4);
    h.C(bx + r * .12, 0, r * .16, amber, null);                                        // one eye
  },
  // ---- M12 wave four: Terran ---------------------------------------------------------------
  // These are the FALLBACK painters, and in this branch they are what the game actually draws --
  // tools/bake.js has not been run for these units yet, so js/sprites.js finds no atlas entry and
  // comes here (see the comment at the top of test/baked.js). They therefore have to carry the same
  // silhouettes the 3D models do, or a unit changes shape the day somebody bakes.
  //
  // Same rule as the M8 infantry pass: one oversized outline-breaking feature each, and never colour.
  marauder(h, r, TC, TCd, st) { const { M, Md, Ml, visor, gun } = TCOL; const { sw, rec } = ANIM(st); const bx = -rec * r * .2;
    h.feet(-r * .2, r * .55, r * .34, Md, sw);
    h.R(-r * .95 + bx, -r * .45, r * .45, r * .9, 2, Md);
    h.R(-r * .3 + bx, -r * 1.05, r * .8, r * .45, 3, '#5a636d');                        // the slab pauldrons,
    h.R(-r * .3 + bx, r * .6, r * .8, r * .45, 3, '#5a636d');                           // overhanging both sides
    h.R(-r * .25 + bx, -r * 1.0, r * .7, r * .16, 1, TC, null);
    h.R(-r * .25 + bx, r * .84, r * .7, r * .16, 1, TC, null);
    h.C(bx, 0, r * .6, M); h.E(r * .22 + bx, 0, r * .26, r * .34, visor, OUT, 1);
    h.L(r * .1 + bx, r * .3, r * 1.25 + bx, r * .26, gun, 6);                           // one fat grenade tube
    h.C(r * 1.28 + bx, r * .26, r * .17, Ml, OUT, 1);
  },
  reaper(h, r, TC, TCd, st) { const { Md, Ml, gun } = TCOL; const { sw, rec } = ANIM(st); const bx = -rec * r * .15;
    h.feet(-r * .1, r * .45, r * .26, Md, sw);
    h.R(-r * 1.25 + bx, -r * .55, r * .6, r * 1.1, 3, '#54483a');                       // the oversized pack
    h.C(-r * 1.35 + bx, -r * .5, r * .22, Md); h.C(-r * 1.35 + bx, r * .5, r * .22, Md);
    h.G(-r * 1.5 + bx, -r * .5, r * .34, '#7fd0ff'); h.G(-r * 1.5 + bx, r * .5, r * .34, '#7fd0ff');
    h.E(-r * .1 + bx, -r * .62, r * .3, r * .22, TC); h.E(-r * .1 + bx, r * .62, r * .3, r * .22, TC);
    h.C(bx, 0, r * .5, '#7f7161'); h.E(r * .2 + bx, 0, r * .24, r * .28, '#ff9f40', OUT, 1);
    h.L(r * .05 + bx, -r * .3, r * .8 + bx, -r * .26, gun, 2.5); h.L(r * .05 + bx, r * .3, r * .8 + bx, r * .26, gun, 2.5);
    h.L(r * .6 + bx, -r * .26, r * .85 + bx, -r * .26, Ml, 1.2);
  },
  hellion(h, r, TC, TCd, st) { const { M, Md, Ml, gun } = TCOL; const { sw2, ak } = ANIM(st);
    for (const s of [-1, 1]) { h.C(-r * .55, s * r * .62, r * .26, '#2b3036'); h.C(r * .55, s * r * .62, r * .26, '#2b3036'); }
    h.P([[r * 1.15, 0], [r * .1, -r * .6], [-r * 1.0, -r * .5], [-r * 1.0, r * .5], [r * .1, r * .6]], '#8a7a55');   // the wedge
    h.R(-r * .7, -r * .3, r * .55, r * .6, 2, TC, OUT, 1);
    h.E(-r * .05, 0, r * .26, r * .3, TCOL.visor, OUT, 1);
    h.L(r * .2, 0, r * 1.5, 0, gun, 4); h.C(r * 1.55, 0, r * .16 + ak * r * .3, '#ffb03c', null);   // the flame tube
    h.R(-r * 1.05, -r * .5, r * .2, r * 1.0, 2, '#6b3226');
    h.G(-r * 1.1, 0, r * (.34 + sw2 * .08), '#ff9a50');
    h.L(r * .55, -r * .55, r * .95, -r * .3, Ml, 1.5);
  },
  cyclone(h, r, TC, TCd, st) { const { M, Md, Ml } = TCOL; const { rec } = ANIM(st); const off = st && st.walk != null ? (st.walk % 1) * r * .3 : 0;
    h.R(-r * .85, -r * .9, r * 1.7, r * .3, 3, '#3a3f45'); h.R(-r * .85, r * .6, r * 1.7, r * .3, 3, '#3a3f45');
    for (let k = 0; k < 5; k++) { const x = -r * .8 + ((k * r * .34 + off) % (r * 1.7)); h.L(x, -r * .88, x, -r * .64, '#5a6068', 1.4); h.L(x, r * .64, x, r * .88, '#5a6068', 1.4); }
    h.R(-r * .8, -r * .6, r * 1.6, r * 1.2, 4, M);
    h.P([[r * .8, -r * .45], [r * 1.2, 0], [r * .8, r * .45]], Md);
    h.R(-r * .7, -r * .3, r * .4, r * .6, 2, TC, OUT, 1);
    h.C(-r * .05, 0, r * .55 - rec * r * .05, '#4d555f');                              // the raised drum, seen end-on
    h.C(-r * .05, 0, r * .4, '#333a42', null);
    for (let k = 0; k < 6; k++) { const a = k * 1.047; h.C(-r * .05 + Math.cos(a) * r * .26, Math.sin(a) * r * .26, r * .1, '#c04030', null); }
    h.C(-r * .05, 0, r * .12, '#ff8040', null);
  },
  widow_mine(h, r, TC, TCd, st) { const { Md, Ml } = TCOL; const { sw, ak } = ANIM(st);
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + .4 + sw * .18; h.L(Math.cos(a) * r * .5, Math.sin(a) * r * .5, Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, Md, 3.5); h.C(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, r * .12, Md, null); }
    h.C(0, 0, r * .78, '#6b6f66');                                                     // the disc
    h.C(0, 0, r * .55, TC, OUT, 1);
    h.C(0, 0, r * .3, '#3c4148', null);
    h.C(-r * .1, 0, r * .13 + ak * r * .2, '#ff4030', null);                           // the eye, opening on the shot
  },
  thor(h, r, TC, TCd, st) { const { M, Md, Ml, visor, gun } = TCOL; const { sw, rec } = ANIM(st); const bx = -rec * r * .12;
    h.feet(-r * .25, r * .68, r * .4, '#2d3238', sw);
    h.R(-r * .9 + bx, -r * .78, r * 1.7, r * 1.56, 5, M);                              // simply enormous
    h.R(-r * .95 + bx, -r * .35, r * .5, r * .7, 2, TC, OUT, 1);
    h.E(r * .55 + bx, 0, r * .34, r * .42, visor, OUT, 1);
    h.C(r * .05 + bx, 0, r * .5, '#4a525c', null);
    for (const s of [-1, 1]) { h.R(bx - r * .05, s * r * .75 - r * .22, r * .55, r * .44, 3, Md);
      h.L(bx + r * .4, s * r * .75, r * 1.55 + bx - rec * r * .25, s * r * .75, gun, 6);
      h.L(bx + r * 1.25 - rec * r * .25, s * r * .75, r * 1.6 + bx - rec * r * .25, s * r * .75, Ml, 2.4); }
    h.C(-r * .55 + bx, 0, r * .16, '#ff4030', null);
  },
  banshee(h, r, TC, TCd, st) { const { M, Md, Ml, gun } = TCOL; const { sw2, rec } = ANIM(st);
    for (const s of [-1, 1]) { h.R(-r * .1, s * r * .35, r * .34, r * .32, 1, Md);
      h.E(-r * .05, s * r * .85, r * .78, r * .16, 'rgba(190,200,215,0.55)', 'rgba(0,0,0,0.25)', 1);   // the rotor discs
      h.E(-r * .05, s * r * .85, r * .14, r * .1, Md, null);
      h.L(r * .3, s * r * .5, r * 1.0 - rec * r * .15, s * r * .45, gun, 3); }
    h.P([[r * 1.25, 0], [r * .4, -r * .4], [-r * .95, -r * .35], [-r * 1.05, 0], [-r * .95, r * .35], [r * .4, r * .4]], '#4a5058');
    h.R(-r * .55, -r * .22, r * .5, r * .44, 2, TC, OUT, 1);
    h.E(r * .5, 0, r * .26, r * .2, '#ffa040', OUT, 1);
    h.G(-r * 1.05, 0, r * (.34 + sw2 * .08), '#ff9040');
  },
  liberator(h, r, TC, TCd, st) { const { M, Md, Ml } = TCOL; const { rec } = ANIM(st);
    h.E(0, 0, r * 1.3, r * 1.15, '#40474f');                                           // the ring, wider than the hull
    h.E(0, 0, r * .95, r * .82, '#565f69', null);
    h.R(-r * .75, -r * .55, r * 1.5, r * 1.1, 4, M);
    h.R(-r * .55, -r * .2, r * .45, r * .4, 2, TC, OUT, 1);
    h.C(r * .05, 0, r * .38 - rec * r * .06, '#262b30');                               // the barrel, through the middle
    h.C(r * .05, 0, r * .2, '#12151a', null);
    h.E(r * .8, 0, r * .2, r * .16, TCOL.visor, OUT, 1);
    for (const s of [-1, 1]) { h.G(-r * .8, s * r * .5, r * .3, '#7fc8ff'); h.R(-r * .35, s * r * .9, r * .3, r * .22, 1, Md); }
  },
  viking(h, r, TC, TCd, st) { const { M, Md, Ml, visor, gun } = TCOL; const { sw2, rec } = ANIM(st);
    for (const s of [-1, 1]) { h.P([[-r * .2, s * r * .3], [-r * .95, s * r * 1.05], [-r * 1.05, s * r * .55], [-r * .45, s * r * .2]], '#454c54');   // swept wings
      h.R(-r * .8, s * r * .5 - r * .16, r * 1.3, r * .32, 3, '#5b636d');              // the nacelles, lying flat
      h.L(r * .5, s * r * .5, r * 1.15 - rec * r * .15, s * r * .5, gun, 2.6);
      h.G(-r * .95, s * r * .5, r * (.26 + sw2 * .06), '#7fc8ff'); }
    h.P([[r * 1.3, 0], [r * .3, -r * .34], [-r * .95, -r * .28], [-r * .95, r * .28], [r * .3, r * .34]], M);
    h.R(-r * .6, -r * .18, r * .45, r * .36, 2, TC, OUT, 1);
    h.E(r * .5, 0, r * .24, r * .2, visor, OUT, 1);
  },
  viking_a(h, r, TC, TCd, st) { const { M, Md, Ml, visor, gun } = TCOL; const { sw, rec } = ANIM(st);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const px = sx * r * .5 + sx * sz * sw * r * .1;
      h.L(px, sz * r * .55, px + sx * r * .22, sz * r * .95, Md, 3); h.C(px + sx * r * .22, sz * r * .95, r * .1, Md, null); }
    h.E(0, 0, r * .95, r * .5, M);                                                     // the same fuselage, wings folded
    h.E(r * .42, 0, r * .26, r * .2, visor, OUT, 1);
    h.R(-r * .55, -r * .16, r * .4, r * .32, 2, TC, OUT, 1);
    for (const s of [-1, 1]) { h.C(-r * .05, s * r * .55, r * .3, '#5b636d');          // nacelles now upright: two drums
      h.L(r * .15, s * r * .55, r * 1.05 - rec * r * .18, s * r * .5, gun, 3);
      h.C(-r * .05, s * r * .55, r * .11, '#ff9040', null); }
  },
  medivac(h, r, TC, TCd, st) { const { Md, Ml, visor } = TCOL; const { sw2 } = ANIM(st);
    h.P([[r * 1.15, 0], [r * .5, -r * .55], [-r * .8, -r * .62], [-r * 1.0, 0], [-r * .8, r * .62], [r * .5, r * .55]], '#b9bec2');
    for (const s of [-1, 1]) { h.R(-r * .55, s * r * .5, r * 1.0, r * .12, 1, '#8ce8ff', null);   // the lit window strips
      h.R(-r * .5, s * r * .78, r * .5, r * .22, 2, Md); h.G(-r * .35, s * r * .95, r * (.3 + sw2 * .06), '#7fc8ff'); }
    h.R(-r * .35, -r * .3, r * .55, r * .6, 3, '#eef2f4', OUT, 1);                     // the cross housing
    h.R(-r * .14, -r * .22, r * .13, r * .44, 1, '#e03030', null);
    h.R(-r * .3, -r * .07, r * .45, r * .14, 1, '#e03030', null);
    h.E(r * .62, 0, r * .24, r * .2, visor, OUT, 1);
    h.R(-r * .95, -r * .16, r * .25, r * .32, 1, TC, null);
  },
  raven(h, r, TC, TCd, st) { const { Md, Ml } = TCOL; const { sw2 } = ANIM(st);
    for (let k = 0; k < 4; k++) { const a = k * 1.5708 + .785;                          // four booms in a cross
      h.L(Math.cos(a) * r * .3, Math.sin(a) * r * .3, Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25, '#9aa4ae', 2);
      h.C(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25, r * .12, '#66ffb0', null); }
    h.E(0, 0, r * .7, r * .34, '#3f4750');
    h.E(r * .35, 0, r * .2, r * .15, '#8effd0', OUT, 1);
    h.R(-r * .5, -r * .13, r * .35, r * .26, 1, TC, null);
    h.C(-r * .1, 0, r * .18, '#2b3036'); h.C(-r * .1, 0, r * .1, '#66ffb0', null);
    h.G(-r * .8, 0, r * (.26 + sw2 * .06), '#7fffcc');
  },
  mule(h, r, TC, TCd, st) { const { M, Md, Ml } = TCOL; const { sw2, ak } = ANIM(st);
    for (const s of [-1, 1]) h.C(-r * .2, s * r * .52, r * .24, '#2b3036');
    h.R(-r * .65, -r * .45, r * 1.3, r * .9, 3, '#8c7f57');                             // hopper-and-arms, not a cab
    h.P([[-r * .65, -r * .45], [-r * 1.1, -r * .3], [-r * 1.1, r * .3], [-r * .65, r * .45]], '#6a6144');
    h.R(-r * .4, -r * .2, r * .55, r * .4, 2, TC, OUT, 1);
    const ex = ak * r * .2;
    h.L(r * .3, -r * .4, r * 1.0 + ex, -r * .3, Md, 3); h.L(r * .3, r * .4, r * 1.0 + ex, r * .3, Md, 3);
    h.C(r * 1.05 + ex, -r * .3, r * .12, Ml, null); h.C(r * 1.05 + ex, r * .3, r * .12, Ml, null);
    h.C(r * .35, 0, r * .16, '#ffbf50', null);
  },
  // ---- the tells ---------------------------------------------------------------------------
  // `r` is the radius of the disturbed patch in pixels (DATA.buriedTells[k].r * TILE). No outline,
  // no team colour, nothing brighter than the ground: this is a hint, not a marker.
  tell_churn(h, r) {
    const { soil, soilD, soilL } = NCOL;
    h.E(0, 0, r, r * .74, soil, null);
    h.E(-r * .12, -r * .1, r * .62, r * .42, soilL, null);
    for (let k = 0; k < 5; k++) { const a = k * 1.257 + .4; h.L(Math.cos(a) * r * .25, Math.sin(a) * r * .18, Math.cos(a) * r * .88, Math.sin(a) * r * .64, soilD, 1.6); }
    h.C(r * .1, 0, r * .13, '#2b2117', null);
  },
  tell_mound(h, r) {
    const { soil, soilD, soilL, bone } = NCOL;
    h.E(0, 0, r, r * .66, soil, null);
    h.E(-r * .05, -r * .12, r * .74, r * .38, soilL, null);
    h.Q(-r * .8, r * .05, 0, -r * .16, r * .82, r * .08, soilD, 2.5);                  // the crack
    h.Q(-r * .3, r * .12, r * .05, r * .3, r * .42, r * .2, soilD, 1.6);
    for (const [x, y] of [[-r * .55, -r * .3], [r * .48, r * .34], [r * .12, -r * .42]]) h.P([[x, y], [x + r * .1, y - r * .16], [x + r * .16, y]], bone, null);
  },
  tell_vent(h, r) {
    const { soil, soilD, soilL } = NCOL;
    h.E(0, 0, r, r * .7, soil, null);
    h.E(0, r * .04, r * .66, r * .44, soilD, null);
    for (let k = 0; k < 6; k++) { const a = k * 1.047 + .25; const x = Math.cos(a) * r * .62, y = Math.sin(a) * r * .44; h.E(x, y, r * .17, r * .12, soilL, null); h.E(x, y, r * .09, r * .06, '#221a12', null); }
    h.E(0, r * .04, r * .16, r * .11, '#1c150f', null);
  },
};
