'use strict';
// ============================================================================
// 3D model definitions for the sprite baker. Model space: X forward, Y up,
// Z right. Units are authored with footprint radius ~1 (scaled by r px).
// Buildings are authored in tiles. Parts: {shape,size,pos,rot,mat,children,anim,hide}
// ============================================================================
const C = {
  metal: [0.56, 0.61, 0.67], metalD: [0.34, 0.38, 0.43], metalL: [0.8, 0.84, 0.88], gun: [0.15, 0.17, 0.2], dark: [0.12, 0.13, 0.16], visor: [0.34, 0.83, 1], red: [0.9, 0.2, 0.15], orange: [1, 0.6, 0.2], white: [0.92, 0.93, 0.95], tread: [0.2, 0.22, 0.25],
  flesh: [0.6, 0.46, 0.4], fleshD: [0.37, 0.25, 0.23], fleshL: [0.72, 0.58, 0.52], carapace: [0.43, 0.3, 0.39], carapaceD: [0.3, 0.2, 0.27], bone: [0.92, 0.87, 0.78], eye: [1, 0.82, 0.25], wing: [0.5, 0.33, 0.41], zpurple: [0.4, 0.22, 0.45], zgreen: [0.35, 0.55, 0.3], toxin: [0.55, 0.95, 0.4],
  gold: [0.85, 0.7, 0.31], goldD: [0.55, 0.42, 0.13], goldL: [0.96, 0.9, 0.65], psi: [0.38, 0.83, 1], navy: [0.16, 0.22, 0.42], violet: [0.7, 0.55, 1], cream: [0.9, 0.86, 0.75], shadowCloth: [0.18, 0.19, 0.25],
  gas: [0.35, 0.82, 0.42], rock: [0.3, 0.28, 0.25],
};
const m = (color, o = {}) => Object.assign({ color }, o);
const TEAM = { team: true }, GLOW = c => ({ color: c, glow: true }), SHINY = c => ({ color: c, spec: 0.6 });
const P = (shape, size, pos, mat, extra) => Object.assign({ shape, size, pos, mat, children: [] }, extra || {});
const N = (pos, extra) => Object.assign({ pos, children: [] }, extra || {}); // empty node (pivot)
const swing = (amp, phase = 0, sign = 1) => st => ({ rot: [0, 0, st.walk == null ? 0 : sign * amp * Math.sin(st.walk * Math.PI * 2 + phase)] });
const yaw = (amp, phase = 0, sign = 1) => st => ({ rot: [0, st.walk == null ? 0 : sign * amp * Math.sin(st.walk * Math.PI * 2 + phase), 0] });
const flap = (amp, sign = 1) => st => ({ rot: [st.walk == null ? 0 : sign * amp * Math.sin(st.walk * Math.PI * 2), 0, 0] });
const recoil = k => st => ({ pos: [st.atk == null ? 0 : -k * Math.max(0, 1 - st.atk * 1.5), 0, 0] });
const lunge = k => st => ({ pos: [st.atk == null ? 0 : k * Math.sin(st.atk * Math.PI), 0, 0] });
// The attack curve, and the reason attacks used to read as a flicker rather than a hit. It was
// sin(t*PI): a symmetric swell that eases in, peaks, and eases out at the same rate. Nothing in
// animation moves like that. A strike is anticipation, then a snap, then a slow settle -- the pull
// back is what tells the eye a blow is coming, and the asymmetry between the fast out and the slow
// return is what gives it force.
//
// Every model drives its attack off this one function, so all ~50 of them gain the timing at once.
// It goes NEGATIVE during the wind-up, which is deliberate: arms rotate the other way and `size`
// multipliers dip below 1, so a unit compresses before it strikes. Bounded at -0.28, and the largest
// multiplier any model applies is 2, so the smallest scale this can produce is 0.44 -- never zero.
const AK = st => {
  if (st.atk == null) return 0;
  const t = st.atk;
  if (t < 0.34) return -0.28 * Math.sin((t / 0.34) * Math.PI);           // anticipation
  const u = (t - 0.34) / 0.66;
  return u < 0.28 ? Math.sin((u / 0.28) * (Math.PI / 2))                  // snap out
                  : Math.cos(((u - 0.28) / 0.72) * (Math.PI / 2));        // and settle back, slower
};
// Idle channel: 0..1 around a loop, null while walking or attacking. Keep the amplitudes small - at
// 1:1 an infantry sprite is about 24 px tall, so anything larger reads as a twitch rather than breathing.
const IDLE = st => st.idle == null ? 0 : Math.sin(st.idle * Math.PI * 2);
const breathe = (amp, phase = 0) => st => ({ pos: [0, st.idle == null ? 0 : amp * Math.sin(st.idle * Math.PI * 2 + phase), 0] });
const sway = (amp, phase = 0) => st => ({ rot: [0, 0, st.idle == null ? 0 : amp * Math.sin(st.idle * Math.PI * 2 + phase)] });
const cylX = (len, w, pos, mat, extra) => P('cyl', [w, len, w], pos, mat, Object.assign({ rot: [0, 0, -Math.PI / 2] }, extra || {})); // cylinder along +X centred at pos

// ---------------- death ----------------
// There was one death in the game and it was not a pose at all: js/fx.js took the *live* sprite and
// applied a 2D rotate-and-squash to it. That cannot foreshorten, and from a 50-degree camera a body on
// the ground is almost entirely foreshortening -- which is why every corpse looked like a standing unit
// that had been sheared rather than like something that had fallen over. These are 3D poses, baked as
// extra rows: the model actually lies down, its limbs splay, its silhouette collapses along the axis it
// fell, and the rasterizer's own AO darkens it because it is now near the floor.
//
// Three of them, because a fight kills a dozen units in the same second and one shape a dozen times is
// what makes a battle read as a spreadsheet. Which one a corpse uses is chosen render-side per corpse,
// so the cost is rows in a sheet and not a frame: no extra draw-loop pass, no second blit.
//   0  fold forward   -- knees give, the body pitches over its own feet. The old collapse, done right.
//   1  roll right     -- knocked off its feet sideways, lands on one shoulder.
//   2  sprawl back    -- thrown backwards, a small hop at the apex, lands flat with the limbs up.
//
// `t` runs 0..1 across the frames of one variant. Ground units only: flyers are never given a corpse
// decal (js/fx.js guards on `e.fly`), so baking death rows for a battlecruiser would be 100 KB of sheet
// nothing can ever draw.
const DTH = st => (st && st.death) ? st.death.t : 0;
const DVAR = st => (st && st.death) ? st.death.v : -1;
const A3 = (a, b) => a ? (b ? [a[0] + b[0], a[1] + b[1], a[2] + b[2]] : a) : b;
const S3 = (a, b) => a ? (b ? [a[0] * b[0], a[1] * b[1], a[2] * b[2]] : a) : b;
// Compose an existing joint animation with a death response, so no rig loses the walk/attack/idle it
// already had and every rig can opt in with one wrapper.
const withDeath = (base, f) => st => {
  const b = (base ? base(st) : null) || {}; const t = DTH(st); if (!t) return b;
  const d = f(t, DVAR(st)) || {};
  return { rot: A3(b.rot, d.rot), pos: A3(b.pos, d.pos), size: S3(b.size, d.size) };
};
// Ease so the buckle is slow and the landing is fast -- a body accelerates into the floor, and the
// frames are few enough that a linear ramp reads as a controlled lie-down.
function deathPose(v, t) {
  const e = t * t * (3 - 2 * t);
  if (v === 1) return { pos: [0.06 * e, -0.10 * e, 0.34 * e], rot: [1.46 * e, 0.22 * e, -0.20 * e], size: [1, 1 - 0.06 * e, 1] };
  if (v === 2) return { pos: [-0.44 * e, 0.11 * Math.sin(t * Math.PI) - 0.05 * e, -0.12 * e], rot: [-0.22 * e, -0.30 * e, 1.28 * e], size: [1, 1 - 0.05 * e, 1 + 0.06 * e] };
  return { pos: [0.38 * e, -0.07 * e, 0], rot: [0.10 * e, 0.12 * e, -1.38 * e], size: [1, 1 - 0.12 * e, 1 + 0.08 * e] };
}
// Wrap a finished model in a node carrying the whole-body pose, so no model definition has to know
// that death exists. The pivot is the model origin, which is the feet: rotating there topples a unit
// over its own base instead of spinning it about its waist.
const deathWrap = (model, d) => Object.assign({ children: [model] }, deathPose(d.v, d.t));

// ---------------- rigs ----------------
const RIG = {
  biped(o) {
    const legLen = o.legLen || 0.55, lw = o.legW || 0.22, torsoH = o.torsoH || 0.75, torsoW = o.torsoW || 0.95, torsoD = o.torsoD || 0.8, headR = o.headR || 0.5;
    const root = N([0, 0, 0]); const suit = o.suit || C.metal, dark = o.dark || C.metalD;
    // Legs buckle outward and fold under on death; the sign flips for the backward sprawl, which is the
     // one where the feet come off the ground and end up in front of the body.
    for (const s of [-1, 1]) { const leg = N([0, legLen, s * 0.3], { anim: withDeath(swing(o.stride == null ? 0.6 : o.stride, 0, s), (t, v) => ({ rot: [s * 0.55 * t, 0, (v === 2 ? 0.95 : -0.75) * t] })) }); leg.children.push(P('cyl', [lw, legLen, lw], [0, -legLen / 2, 0], m(dark))); leg.children.push(P('sphere', [lw * 1.5, lw * 1.2, lw * 1.5], [0.05, -legLen * 0.45, 0], m(o.suit || C.metal, { spec: 0.5 }))); leg.children.push(P('box', [0.42, 0.14, 0.3], [0.08, -legLen + 0.07, 0], m(dark))); root.children.push(leg); }
    const torso = N([0, legLen + torsoH / 2, 0], { anim: withDeath(st => ({ pos: [st.atk == null ? 0 : -(o.recoil || 0.12) * Math.max(0, 1 - st.atk * 1.5), (o.idleAmp == null ? 0.045 : o.idleAmp) * IDLE(st), 0], rot: [0, 0, 0.035 * IDLE(st)] }), (t, v) => ({ pos: [0, -0.12 * t, 0], rot: [v === 1 ? 0.2 * t : 0, 0, (v === 2 ? 0.28 : -0.34) * t] })) }); root.children.push(torso);
    torso.children.push(P('sphere', [torsoD, torsoH, torsoW], [0, 0, 0], m(suit, { spec: 0.4 })));
    if (o.pads !== false) for (const s of [-1, 1]) torso.children.push(P('sphere', [0.45, 0.35, 0.5], [-0.05, torsoH * 0.35, s * torsoW * 0.5], o.padMat || TEAM));
    if (o.pack !== false) torso.children.push(P('box', [0.3, torsoH * 0.8, torsoW * 0.7], [-torsoD * 0.5, 0, 0], m(dark)));
    torso.children.push(P('sphere', [headR, headR * 0.95, headR], [0.05, torsoH / 2 + headR * 0.4, 0], m(o.headColor || suit, { spec: 0.5 })));
    torso.children.push(P('box', [0.16, headR * 0.35, headR * 0.7], [headR * 0.45, torsoH / 2 + headR * 0.4, 0], GLOW(o.visor || C.visor)));
    torso.children.push(P('box', [0.5, torsoH * 0.45, torsoW * 0.55], [torsoD * 0.35, -torsoH * 0.05, 0], m(o.chest || dark, { spec: 0.5 })));
    if (o.antenna !== false) torso.children.push(P('cyl', [0.05, 0.5, 0.05], [-0.25, torsoH / 2 + headR * 0.9, -headR * 0.5], m(dark)));
    if (o.gun) torso.children.push(cylX(o.gun.len || 1.3, o.gun.w || 0.16, [o.gun.len * 0.35, -0.05, 0.42], m(o.gun.color || C.gun)));
    if (o.extra) for (const e of o.extra(torso, root)) (e.parent === 'root' ? root : torso).children.push(e.part || e);
    root.yOffset = 0; return root;
  },
  bug(o) {
    const root = N([0, 0, 0]); const segs = o.segs || [[0, 0.5, 1.6, 0.9, 1.1]]; const bodyY = o.bodyY || 0.45; const legs = o.legs || 2, legLen = o.legLen || 0.9, lw = o.legW || 0.12;
    const body = N([0, bodyY, 0], { anim: withDeath(st => ({ pos: [st.atk == null ? 0 : (o.lunge || 0.08) * Math.sin(st.atk * Math.PI), (o.idleAmp == null ? 0.05 : o.idleAmp) * IDLE(st), 0], rot: [0, 0, 0.05 * IDLE(st)] }), (t, v) => ({ pos: [0, -bodyY * 0.45 * t, 0], rot: [(v === 1 ? 0.5 : -0.25) * t, 0, 0] })) }); root.children.push(body);
    segs.forEach(([x, y, sx, sy, sz], i) => body.children.push(P('sphere', [sx, sy, sz], [x, y, 0], m(i === 0 ? (o.color || C.flesh) : (o.color2 || C.carapace), { spec: 0.35 }))));

    // ---- carapace -------------------------------------------------------------------------------
    // Every Zerg unit was one or two ellipsoids with a few loose spikes, which is why they read as
    // potatoes. An insect is not a smooth solid: it is overlapping plate, banded segments, and rows of
    // spines, and the hard straight edges of plate against the soft curve of the body are the whole
    // reason chitin looks like chitin. All of it is derived from the first segment's own dimensions,
    // so every unit built on this rig gets it in proportion without touching fifty model definitions.
    const [bx, by, bsx, bsy, bsz] = segs[0];
    const shell = o.color2 || C.carapace, shellD = C.carapaceD;
    const jag = (i, k) => Math.sin(i * 12.9898 + k * 78.233) * 0.5;   // deterministic per-plate wobble

    // Dorsal plates: overlapping wedges down the spine, largest over the shoulders and tapering back.
    // Tilted nose-down so each one laps over the next, which is what makes the row read as armour
    // rather than as bumps.
    const plateN = o.plates == null ? 5 : o.plates;
    for (let i = 0; i < plateN; i++) {
      const t = plateN === 1 ? 0.5 : i / (plateN - 1);
      // Narrow, and bedded down INTO the body rather than perched on it: a plate the full width of the
      // back reads as a roof, and the body's own curve has to show past it on both sides for the plate
      // to look like it is growing out of something.
      const w = bsx * (0.26 - 0.09 * t), h = bsy * (0.24 - 0.07 * t), d = bsz * (0.60 - 0.20 * t);
      body.children.push(P('wedge', [w, h, d], [bx + bsx * (0.55 - 1.15 * t), by + bsy * (0.40 - 0.05 * t), 0],
        m(i % 2 ? shell : shellD, { spec: 0.62 }), { rot: [0, 0, -0.22 + jag(i, 1) * 0.10] }));
    }

    // Segment banding: rings standing slightly proud of the body, so the abdomen has articulation
    // instead of being one continuous surface.
    const bandN = o.bands == null ? 3 : o.bands;
    for (let i = 0; i < bandN; i++) {
      const t = (i + 1) / (bandN + 1);
      body.children.push(P('sphere', [bsx * 0.085, bsy * 1.015, bsz * 1.03], [bx + bsx * (0.55 - 1.25 * t), by - bsy * 0.06, 0],
        m(shellD, { spec: 0.5 })));
    }

    // Spine rows: paired, graded, swept back, and deliberately not mirrored -- the left row sits a
    // little further forward than the right. Symmetry is what made these look moulded.
    const spineN = o.spines == null ? 6 : o.spines;
    for (let i = 0; i < spineN; i++) {
      const t = i / Math.max(1, spineN - 1);
      const len = bsy * (0.50 - 0.24 * t) * (o.spineLen || 1), rad = bsy * 0.055;
      for (const sd of [-1, 1]) {
        body.children.push(P('cone', [rad, len, rad],
          [bx + bsx * (0.34 - 1.05 * t) + sd * bsx * 0.03, by + bsy * 0.5, sd * bsz * (0.34 + 0.12 * t)],
          m(C.bone, { spec: 0.4 }), { rot: [sd * 0.30, 0, 0.55 + jag(i, sd) * 0.2] }));
      }
    }

    // Wet underbelly: darker, flatter, and unlit from above, which is what stops the body reading as a
    // ball. With the Zerg material's subsurface term this is where the warmth shows.
    if (o.belly !== false) body.children.push(P('sphere', [bsx * 0.90, bsy * 0.40, bsz * 0.90], [bx, by - bsy * 0.58, 0], m(C.fleshD, { spec: 0.12 })));

    if (o.teamSpot !== false) body.children.push(P('sphere', [0.5, 0.25, 0.4], [o.teamX == null ? -0.2 : o.teamX, 0.32, 0], TEAM));
    // A dead insect curls: the legs draw in under the body and the knees close up. That, and nothing
    // else, is what tells you at a glance that the thing on the ground used to be Zerg.
    for (let i = 0; i < legs; i++) { const x = (o.legX0 == null ? 0.35 : o.legX0) - i * (o.legGap || 0.5); for (const s of [-1, 1]) { const hip = N([x, bodyY * 0.8, s * 0.4], { anim: withDeath(yaw(o.legSwing == null ? 0.35 : o.legSwing, i * Math.PI, s), (t, v) => ({ rot: [s * 0.75 * t, s * 0.5 * t, (v === 2 ? 0.4 : -0.3) * t] })) }); const up = N([0, 0, 0], { rot: [s * 0.9, 0, 0] }); up.children.push(P('cyl', [lw, legLen * 0.6, lw], [0, legLen * 0.3, 0], m(o.legColor || C.fleshD))); const knee = N([0, legLen * 0.6, 0], { rot: [-s * 1.9, 0, 0], anim: st => ({ rot: [-s * 1.15 * DTH(st), 0, 0] }) }); knee.children.push(P('cyl', [lw * 0.8, legLen * 0.7, lw * 0.8], [0, legLen * 0.35, 0], m(o.legColor || C.fleshD))); up.children.push(knee); hip.children.push(up); root.children.push(hip); } }
    if (o.head !== false) { const hx = o.headX == null ? 0.9 : o.headX; body.children.push(P('sphere', [o.headR || 0.6, (o.headR || 0.6) * 0.85, (o.headR || 0.6) * 0.9], [hx, 0.05, 0], m(o.headColor || C.carapace, { spec: 0.4 }))); for (const s of [-1, 1]) { const jaw = N([hx + 0.2, -0.05, s * 0.2], { anim: st => ({ rot: [0, -s * (0.5 - AK(st) * 0.9), 0] }) }); jaw.children.push(P('cone', [0.14, 0.5, 0.14], [0.25, 0, 0], m(C.bone), { rot: [0, 0, -Math.PI / 2] })); body.children.push(jaw); } for (const s of [-1, 1]) body.children.push(P('sphere', [0.1, 0.1, 0.1], [hx + 0.2, 0.18, s * 0.22], GLOW(C.eye))); }
    if (o.extra) for (const e of o.extra(body, root)) body.children.push(e);
    root.yOffset = 0; return root;
  },
  tank(o) {
    const root = N([0, 0, 0]); const sieged = !!o.sieged; const hy = sieged ? 0.55 : 0.4;
    for (const s of [-1, 1]) { root.children.push(P('box', [2.0, 0.42, 0.42], [0, 0.22, s * 0.78], m(C.tread))); for (let k = 0; k < 6; k++) root.children.push(P('box', [0.08, 0.46, 0.44], [-0.85 + k * 0.34, 0.22, s * 0.78], m(C.metalD))); }
    root.children.push(P('box', [1.8, 0.5, 1.25], [0, hy, 0], m(C.metal, { spec: 0.45 })));
    root.children.push(P('box', [0.5, 0.06, 0.9], [-0.55, hy + 0.28, 0], TEAM));
    const tur = N([0.1, hy + 0.25, 0]); root.children.push(tur); tur.children.push(P('cyl', [1.0, 0.4, 1.0], [0, 0.2, 0], m(C.metalD, { spec: 0.5 })));
    const bl = sieged ? 1.9 : 1.3; tur.children.push(cylX(bl, sieged ? 0.22 : 0.18, [bl / 2 + 0.2, 0.25, 0], m(C.gun), { anim: recoil(sieged ? 0.45 : 0.25) }));
    if (sieged) for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { root.children.push(P('box', [0.7, 0.14, 0.18], [dx * 0.95, 0.5, dz * 0.95], m(C.metalD), { rot: [0, -Math.atan2(dz, dx), 0] })); root.children.push(P('cyl', [0.3, 0.5, 0.3], [dx * 1.2, 0.25, dz * 1.15], m(C.metalD))); }
    root.yOffset = 0; return root;
  },
  ship(o) {
    const root = N([0, o.alt == null ? 0.2 : o.alt, 0]); const col = o.color || C.metal;
    if (o.body !== 'box') root.children.push(P('sphere', o.bodySize || [2.2, 0.55, 0.9], [0, 0, 0], m(col, { spec: 0.6 }))); else root.children.push(P('box', o.bodySize || [2.0, 0.5, 0.9], [0, 0, 0], m(col, { spec: 0.6 })));
    if (o.wings) for (const s of [-1, 1]) root.children.push(P(o.wingShape || 'wedge', [o.wings.len || 1.2, 0.08, o.wings.span || 1.0], [o.wings.x || -0.4, -0.05, s * (o.wings.span || 1.0) * 0.55], m(o.wingColor || col, { spec: 0.5 }), { rot: [0, s * (o.wings.sweep || 0.5), 0] }));
    root.children.push(P('box', [0.6, 0.12, 0.5], [-0.3, (o.bodySize ? o.bodySize[1] : 0.55) * 0.45, 0], TEAM));
    if (o.cockpit !== false) root.children.push(P('sphere', [0.5, 0.25, 0.4], [(o.bodySize ? o.bodySize[0] : 2.2) * 0.3, (o.bodySize ? o.bodySize[1] : 0.55) * 0.35, 0], GLOW(o.cockpit || C.visor)));
    for (const e of (o.engines || [[-(o.bodySize ? o.bodySize[0] : 2.2) * 0.5, 0, 0]])) root.children.push(P('sphere', [0.35, 0.3, 0.3], e, GLOW(o.engineColor || [0.55, 0.85, 1])));
    if (o.extra) for (const e of o.extra(root)) root.children.push(e);
    root.yOffset = 0; return root;
  },
  flyer(o) {
    const root = N([0, o.alt == null ? 0.3 : o.alt, 0]); const col = o.color || C.flesh;
    root.children.push(P('sphere', o.bodySize || [1.3, 0.55, 0.65], [0, 0, 0], m(col, { spec: 0.35 })));
    root.children.push(P('sphere', [0.5, 0.2, 0.35], [-0.1, 0.22, 0], TEAM));
    if (o.head !== false) root.children.push(P('sphere', [0.55, 0.45, 0.5], [(o.bodySize ? o.bodySize[0] : 1.3) * 0.5, 0, 0], m(o.headColor || C.carapace)));
    for (const s of [-1, 1]) { const w = N([0, 0.05, s * 0.2], { anim: flap(o.flap == null ? 0.7 : o.flap, s) }); w.children.push(P(o.wingShape || 'sphere', [o.wingLen || 1.2, 0.06, o.wingSpan || 1.5], [-0.25, 0, s * (o.wingSpan || 1.5) * 0.5], m(o.wingColor || C.wing, { spec: 0.2 }))); root.children.push(w); }
    if (o.tail) root.children.push(P('cone', [0.25, o.tail, 0.25], [-(o.bodySize ? o.bodySize[0] : 1.3) * 0.5 - o.tail * 0.4, -0.05, 0], m(C.fleshD), { rot: [0, 0, Math.PI / 2] }));
    if (o.extra) for (const e of o.extra(root)) root.children.push(e);
    root.yOffset = 0; return root;
  },
  walker4(o) { // dragoon-style quadruped with raised body
    const root = N([0, 0, 0]); const by = o.bodyY || 0.9, ll = o.legLen || 0.9;
    const body = N([0, by, 0], { anim: recoil(0.12) }); root.children.push(body);
    body.children.push(P('sphere', o.bodySize || [1.3, 0.8, 1.1], [0, 0, 0], m(o.color || C.gold, { spec: 0.6 })));
    // A dragoon was one gold sphere. It is a walking sarcophagus with something alive inside, so: a
    // dorsal shell plate over the top, a lit core showing through the front, and shoulder vents.
    if (o.shell !== false) {
      const bs = o.bodySize || [1.3, 0.8, 1.1];
      body.children.push(P('dome', [bs[0] * 1.30, bs[1] * 1.15, bs[2] * 1.28], [-bs[0] * 0.10, bs[1] * 0.10, 0], m(C.goldD, { spec: 0.66 })));
      body.children.push(P('oct', [bs[0] * 0.34, bs[1] * 0.62, bs[2] * 0.34], [bs[0] * 0.52, 0, 0], GLOW(C.psi)));
      for (const sd of [-1, 1]) body.children.push(P('cyl', [0.10, 0.34, 0.10], [-bs[0] * 0.35, bs[1] * 0.45, sd * bs[2] * 0.60], m(C.goldL, { spec: 0.7 }), { rot: [0, 0, sd * 0.3] }));
      for (const sd of [-1, 1]) body.children.push(P('sphere', [0.09, 0.09, 0.09], [bs[0] * 0.30, bs[1] * 0.42, sd * bs[2] * 0.34], GLOW(C.visor)));
    }
    body.children.push(P('sphere', [0.5, 0.25, 0.5], [-0.2, 0.3, 0], TEAM));
    body.children.push(P('sphere', [0.45, 0.45, 0.45], [0.55, 0.05, 0], m(C.navy))); body.children.push(P('sphere', [0.22, 0.22, 0.22], [0.75, 0.05, 0], GLOW(C.psi)));
    [[0.6, -1], [0.6, 1], [2.5, -1], [2.5, 1]].forEach(([a, s], i) => { const hip = N([Math.cos(a) * 0.5, by - 0.1, Math.sin(a) * 0.5 * s], { rot: [0, -Math.atan2(Math.sin(a) * s, Math.cos(a)), 0], anim: withDeath(yaw(0.3, i % 2 ? Math.PI : 0, 1), (t, v) => ({ rot: [0, 0, (i < 2 ? 0.7 : -0.5) * t] })) }); const up = N([0, 0, 0], { rot: [0, 0, -0.9] }); up.children.push(P('cyl', [0.16, ll * 0.7, 0.16], [0, -ll * 0.35, 0], m(o.legColor || C.goldD, { spec: 0.5 }))); const knee = N([0, -ll * 0.7, 0], { rot: [0, 0, 1.6] }); knee.children.push(P('cyl', [0.13, ll * 0.75, 0.13], [0, -ll * 0.37, 0], m(o.legColor || C.goldD, { spec: 0.5 }))); up.children.push(knee); hip.children.push(up); root.children.push(hip); });
    root.yOffset = 0; return root;
  },
};

// ---------------- units ----------------
const UNITS = {
  scv: () => { const r = RIG.biped({ legLen: 0.4, legW: 0.2, torsoH: 0.9, torsoW: 1.2, torsoD: 1.1, headR: 0.3, pads: false, pack: false, suit: C.metal, visor: C.visor, stride: 0.5 }); r.children[2].children.push(P('box', [0.9, 0.55, 1.1], [0, 0.05, 0], m(C.metal, { spec: 0.4 })), P('box', [0.5, 0.35, 0.8], [-0.2, 0.33, 0], TEAM), P('box', [0.3, 0.4, 0.3], [-0.65, 0, 0], m(C.metalD)), P('sphere', [0.3, 0.3, 0.3], [-0.85, 0, 0], GLOW([0.5, 0.8, 1]))); for (const s of [-1, 1]) { const arm = N([0.45, 0.1, s * 0.55], { anim: lunge(0.15) }); arm.children.push(cylX(0.8, 0.12, [0.4, 0, 0], m(C.gun)), P('box', [0.25, 0.12, 0.3], [0.85, 0, 0], m(C.metalL))); r.children[2].children.push(arm); } return r; },
  // ---- Terran infantry silhouettes -------------------------------------------------------------
  // These four were the same biped in four colours. At 40 px, under fog, tinted by team colour and
  // sitting on badlands, colour is the first thing you lose -- shape is what you actually identify a
  // unit by, and identifying them is how you decide whether to engage. Each one now carries one
  // deliberately oversized feature that breaks its outline from above, which is the only angle this
  // game is ever seen from. Nothing here changes a stat; it is all in tools/models.js and baked.
  marine: () => { const r = RIG.biped({ gun: { len: 1.3 }, suit: C.metal }); const t = r.children[2];
    t.children.push(P('sphere', [0.14, 0.14, 0.14], [0.2, 0.55, -0.5], GLOW([1, 0.9, 0.6])));
    // a heavy squared pauldron on the gun shoulder, and a stubby aerial: the marine reads as a wide block
    t.children.push(P('box', [0.42, 0.3, 0.34], [0.05, 0.5, -0.62], m(C.metalD, { spec: 0.4 })), P('box', [0.46, 0.14, 0.38], [0.05, 0.66, -0.62], TEAM));
    t.children.push(P('cyl', [0.05, 0.7, 0.05], [-0.3, 0.75, -0.38], m(C.metalD), { rot: [0.25, 0, 0.12] }));
    return r; },
  firebat: () => { const r = RIG.biped({ suit: [0.62, 0.55, 0.45], torsoW: 1.05, pads: true }); const t = r.children[2]; for (const s of [-1, 1]) { t.children.push(cylX(1.1, 0.2, [0.6, -0.05, s * 0.45], m(C.gun)), P('sphere', [0.22, 0.22, 0.22], [1.2, -0.05, s * 0.45], GLOW(C.orange), { anim: st => ({ size: [1 + AK(st) * 1.5, 1 + AK(st) * 1.5, 1 + AK(st) * 1.5] }) }));
      // fuel tanks, much bigger than they were and standing proud of the shoulders with a capped valve:
      // the twin-cylinder hump is the firebat's whole silhouette from above
      t.children.push(P('cyl', [0.34, 0.95, 0.34], [-0.62, 0.3, s * 0.34], m([0.55, 0.2, 0.15], { spec: 0.5 })), P('cyl', [0.4, 0.14, 0.4], [-0.62, 0.8, s * 0.34], m(C.metalD)), P('sphere', [0.12, 0.12, 0.12], [-0.62, 0.92, s * 0.34], GLOW(C.orange)));
    } return r; },
  medic: () => { const r = RIG.biped({ suit: C.white, gun: { len: 0.7, w: 0.1, color: C.metalD } }); const t = r.children[2];
    // the cross is lifted onto a raised dorsal plate so it is visible from overhead, not on the spine
    // where nothing but the floor could see it, and it is flanked by two canisters that widen the top
    t.children.push(P('box', [0.5, 0.12, 0.62], [-0.4, 0.52, 0], m(C.white, { spec: 0.3 })), P('box', [0.12, 0.16, 0.44], [-0.4, 0.62, 0], GLOW(C.red)), P('box', [0.44, 0.16, 0.12], [-0.4, 0.62, 0], GLOW(C.red)));
    for (const s of [-1, 1]) t.children.push(P('cyl', [0.17, 0.5, 0.17], [-0.5, 0.2, s * 0.46], m([0.85, 0.88, 0.9], { spec: 0.55 })));
    t.children.push(P('sphere', [0.1, 0.1, 0.1], [0.35, 0.6, 0.4], GLOW([0.7, 1, 1])));
    return r; },
  ghost: () => { const r = RIG.biped({ suit: [0.24, 0.27, 0.32], torsoW: 0.75, torsoD: 0.65, headR: 0.42, gun: { len: 1.8, w: 0.11 }, visor: [1, 0.35, 0.35], pads: true, recoil: 0.2 }); const t = r.children[2];
    // long rifle case slung diagonally across the back: a hard straight line no other infantry has,
    // which is what separates a ghost from a marine at a glance when both are dark against dark ground
    t.children.push(P('box', [1.5, 0.13, 0.16], [-0.3, 0.42, 0.2], m([0.16, 0.18, 0.22], { spec: 0.35 }), { rot: [0, 0.45, 0.22] }));
    t.children.push(P('cyl', [0.04, 0.85, 0.04], [-0.35, 0.7, -0.3], m(C.metalD), { rot: [0.4, 0, 0.2] }));
    return r; },
  vulture: () => { const r = RIG.ship({ alt: 0.3, body: 'box', bodySize: [1.9, 0.4, 0.9], color: C.metal, cockpit: false, engines: [[-1.0, 0.05, 0]], engineColor: [0.5, 0.75, 1] }); r.children.push(P('sphere', [0.5, 0.5, 0.5], [-0.2, 0.35, 0], m(C.metalD)), P('box', [0.5, 0.12, 0.35], [0.6, 0.25, 0], m(C.metalL)), cylX(0.6, 0.12, [1.1, 0.1, -0.25], m(C.gun), { anim: recoil(0.15) }), cylX(0.6, 0.12, [1.1, 0.1, 0.25], m(C.gun), { anim: recoil(0.15) }), P('wedge', [0.5, 0.2, 0.9], [1.05, 0.05, 0], m(C.metal))); return r; },
  siege_tank: () => RIG.tank({}), siege_tank_s: () => RIG.tank({ sieged: true }),
  goliath: () => { const root = N([0, 0, 0]); for (const s of [-1, 1]) { const leg = N([-0.2, 0.75, s * 0.55], { anim: swing(0.45, 0, s) }); leg.children.push(P('cyl', [0.26, 0.5, 0.26], [-0.1, -0.25, 0], m(C.metalD), { rot: [0, 0, 0.5] })); const shin = N([-0.25, -0.5, 0], { rot: [0, 0, -0.8] }); shin.children.push(P('cyl', [0.22, 0.5, 0.22], [0, -0.25, 0], m(C.metalD)), P('box', [0.55, 0.14, 0.4], [0.05, -0.5, 0], m(C.metalD))); leg.children.push(shin); root.children.push(leg); } const body = N([0, 1.05, 0], { anim: recoil(0.12) }); root.children.push(body); body.children.push(P('box', [1.3, 0.75, 1.2], [0, 0, 0], m(C.metal, { spec: 0.45 })), P('box', [0.5, 0.1, 0.7], [-0.25, 0.42, 0], TEAM), P('box', [0.2, 0.3, 0.5], [0.66, 0.05, 0], GLOW(C.visor))); for (const s of [-1, 1]) body.children.push(cylX(1.2, 0.16, [0.55, 0.15, s * 0.78], m(C.gun), { anim: recoil(0.2) })); return root; },
  wraith: () => RIG.ship({ bodySize: [2.4, 0.5, 0.8], wings: { len: 1.0, span: 1.2, sweep: 0.9, x: -0.6 }, engines: [[-1.15, 0, 0]] }),
  dropship: () => RIG.ship({ bodySize: [2.1, 0.8, 1.3], engines: [[-0.7, 0.1, -0.85], [-0.7, 0.1, 0.85]], extra: r => [P('box', [1.0, 0.35, 0.4], [-0.3, 0, -0.9], m(C.metalD)), P('box', [1.0, 0.35, 0.4], [-0.3, 0, 0.9], m(C.metalD))] }),
  science_vessel: () => RIG.ship({ bodySize: [1.2, 0.9, 1.2], cockpit: C.visor, engines: [], extra: r => [P('cyl', [2.4, 0.12, 2.4], [0, -0.1, 0], m(C.metalL, { spec: 0.6 })), P('cyl', [2.0, 0.16, 2.0], [0, -0.1, 0], m(C.metalD)), P('cyl', [0.08, 0.9, 0.08], [-0.5, 0.5, -0.4], m(C.metalD)), P('cyl', [0.08, 0.9, 0.08], [-0.5, 0.5, 0.4], m(C.metalD)), P('sphere', [0.18, 0.18, 0.18], [-0.5, 0.95, -0.4], GLOW(C.red)), P('sphere', [0.18, 0.18, 0.18], [-0.5, 0.95, 0.4], GLOW(C.red))] }),
  battlecruiser: () => RIG.ship({ body: 'box', bodySize: [2.4, 0.55, 1.1], color: C.metalD, engines: [[-1.25, 0, -0.35], [-1.25, 0, 0], [-1.25, 0, 0.35]], extra: r => [P('box', [1.5, 0.35, 0.7], [-0.2, 0.4, 0], m(C.metal, { spec: 0.5 })), P('wedge', [0.9, 0.35, 0.8], [1.2, -0.05, 0], m(C.metalD)), P('box', [0.9, 0.12, 0.25], [0.2, 0.15, -0.72], m(C.metal)), P('box', [0.9, 0.12, 0.25], [0.2, 0.15, 0.72], m(C.metal)), cylX(0.9, 0.14, [1.2, 0.5, 0], m(C.gun), { anim: recoil(0.2) })] }),
  valkyrie: () => RIG.ship({ bodySize: [2.2, 0.55, 0.9], wings: { len: 1.1, span: 1.3, sweep: 0.4, x: -0.3 }, engines: [[-1.05, 0, -0.25], [-1.05, 0, 0.25]], extra: r => [P('box', [1.1, 0.25, 0.3], [-0.2, 0.05, -1.0], m(C.metalD)), P('box', [1.1, 0.25, 0.3], [-0.2, 0.05, 1.0], m(C.metalD))] }),
  spider_mine: () => { const r = N([0, 0, 0]); r.children.push(P('cyl', [1.4, 0.3, 1.4], [0, 0.15, 0], m(C.metalD)), P('sphere', [0.2, 0.2, 0.2], [0.45, 0.32, 0], GLOW(C.red))); return r; },
  drone: () => RIG.bug({ segs: [[0, 0.1, 1.5, 0.8, 1.0]], legs: 1, legLen: 0.5, legX0: -0.3, headR: 0.55, headX: 0.75, lunge: 0.12, extra: b => [P('sphere', [0.9, 0.05, 0.5], [-0.4, 0.4, -0.5], m([0.8, 0.85, 0.95], { spec: 0.2 }), { rot: [0, 0.4, 0], anim: flap(0.5, -1) }), P('sphere', [0.9, 0.05, 0.5], [-0.4, 0.4, 0.5], m([0.8, 0.85, 0.95], { spec: 0.2 }), { rot: [0, -0.4, 0], anim: flap(0.5, 1) })] }),
  overlord: () => RIG.flyer({ alt: 0.6, bodySize: [2.2, 1.4, 1.7], color: [0.55, 0.42, 0.37], head: false, flap: 0.15, wingLen: 1.0, wingSpan: 0.9, wingColor: [0.45, 0.32, 0.3], extra: r => [P('sphere', [0.6, 0.5, 0.55], [1.1, -0.2, 0], m(C.carapace)), P('sphere', [0.12, 0.12, 0.12], [1.35, -0.1, -0.15], GLOW(C.eye)), P('sphere', [0.12, 0.12, 0.12], [1.35, -0.1, 0.15], GLOW(C.eye)), P('cyl', [0.1, 1.1, 0.1], [-0.4, -0.95, -0.4], m(C.fleshD), { rot: [0.2, 0, 0.1] }), P('cyl', [0.1, 1.1, 0.1], [0.1, -0.95, 0.4], m(C.fleshD), { rot: [-0.2, 0, -0.1] }), P('cyl', [0.1, 1.0, 0.1], [-0.6, -0.9, 0.5], m(C.fleshD), { rot: [0.3, 0, 0.2] })] }),
  zergling: () => RIG.bug({ segs: [[-0.1, 0, 1.5, 0.7, 0.9]], legs: 2, legLen: 0.8, legX0: 0.3, legGap: 0.6, headR: 0.62, headX: 0.85, bodyY: 0.4, lunge: 0.2, extra: b => [P('cone', [0.12, 0.35, 0.12], [-0.4, 0.4, 0], m(C.bone)), P('cone', [0.12, 0.3, 0.12], [-0.7, 0.35, 0], m(C.bone)), P('cone', [0.1, 0.25, 0.1], [0.0, 0.42, 0], m(C.bone)),P('sphere', [0.9, 0.04, 0.6], [-0.6, 0.25, -0.5], m(C.wing), { rot: [0, 0.5, 0.3] }), P('sphere', [0.9, 0.04, 0.6], [-0.6, 0.25, 0.5], m(C.wing), { rot: [0, -0.5, -0.3] })] }),
  hydralisk: () => { const r = RIG.bug({ segs: [[-0.6, -0.1, 1.5, 0.5, 0.7], [0.1, 0.35, 0.9, 0.9, 0.85]], legs: 0, head: false, bodyY: 0.35, teamX: 0.1, lunge: 0.1, color: C.fleshD, color2: C.carapace }); const b = r.children[0]; b.children.push(P('sphere', [0.7, 0.75, 0.7], [0.5, 0.75, 0], m(C.flesh)), P('sphere', [0.1, 0.1, 0.1], [0.82, 0.8, -0.15], GLOW(C.eye)), P('sphere', [0.1, 0.1, 0.1], [0.82, 0.8, 0.15], GLOW(C.eye)), P('sphere', [0.4, 1.0, 1.4], [0.05, 0.85, 0], m(C.carapace), { anim: st => ({ size: [1, 1 + AK(st) * 0.3, 1 + AK(st) * 0.3] }) })); for (const s of [-1, 1]) { const arm = N([0.4, 0.55, s * 0.5], { anim: st => ({ rot: [0, s * (0.6 - AK(st) * 1.2), 0] }) }); arm.children.push(cylX(1.1, 0.12, [0.5, 0, 0], m(C.bone)), P('cone', [0.12, 0.5, 0.12], [1.15, 0, 0], m(C.bone), { rot: [0, 0, -Math.PI / 2] })); b.children.push(arm); } for (let k = 0; k < 4; k++) b.children.push(P('cone', [0.12, 0.35, 0.12], [-1.2 + k * 0.3, 0.2, 0], m(C.bone), { rot: [0, 0, 0.4] })); return r; },
  lurker: () => { const r = RIG.bug({ segs: [[0, 0, 2.0, 0.7, 1.4]], legs: 3, legLen: 0.9, legX0: 0.6, legGap: 0.55, headR: 0.55, headX: 1.0, color: C.carapace, color2: C.carapace, lunge: 0 }); for (let k = 0; k < 5; k++) r.children[0].children.push(P('cone', [0.14, 0.7, 0.14], [-0.7 + k * 0.35, 0.55, 0], m(C.bone), { rot: [0, 0, (k % 2 ? 0.3 : -0.2)] })); return r; },
  mutalisk: () => RIG.flyer({ bodySize: [1.4, 0.5, 0.6], wingLen: 1.3, wingSpan: 1.9, flap: 0.8, tail: 1.2, extra: r => [P('sphere', [0.25, 0.25, 0.25], [0.95, 0.05, 0], m(C.carapaceD))] }),
  scourge: () => RIG.flyer({ bodySize: [0.9, 0.6, 0.6], wingLen: 0.9, wingSpan: 1.3, flap: 1.1, head: false, extra: r => [P('sphere', [0.14, 0.14, 0.14], [0.45, 0.1, 0], GLOW(C.eye))] }),
  queen: () => RIG.flyer({ bodySize: [1.8, 0.45, 0.55], wingLen: 1.5, wingSpan: 2.0, flap: 0.5, tail: 1.0, wingColor: [0.55, 0.4, 0.58], color: C.fleshL }),
  guardian: () => RIG.flyer({ alt: 0.4, bodySize: [1.9, 0.8, 1.3], wingLen: 1.0, wingSpan: 1.4, flap: 0.35, color: C.carapace, extra: r => [P('cone', [0.2, 0.9, 0.2], [0.8, -0.2, -0.45], m(C.bone), { rot: [0, 0, -1.2] }), P('cone', [0.2, 0.9, 0.2], [0.8, -0.2, 0.45], m(C.bone), { rot: [0, 0, -1.2] })] }),
  devourer: () => RIG.flyer({ alt: 0.4, bodySize: [2.0, 0.9, 1.3], wingLen: 1.1, wingSpan: 1.5, flap: 0.3, color: [0.4, 0.55, 0.4], wingColor: [0.35, 0.45, 0.35], headColor: C.carapace, extra: r => [P('cone', [0.15, 0.6, 0.15], [1.2, -0.1, -0.3], m(C.bone), { rot: [0, 0, -1.5] }), P('cone', [0.15, 0.6, 0.15], [1.2, -0.1, 0.3], m(C.bone), { rot: [0, 0, -1.5] })] }),
  ultralisk: () => RIG.bug({ segs: [[-0.1, 0.2, 2.0, 1.2, 1.5], [-0.4, 0.75, 1.0, 0.6, 0.9]], legs: 2, legLen: 1.1, legW: 0.28, legX0: 0.55, legGap: 1.0, legSwing: 0.3, headR: 0.8, headX: 1.0, bodyY: 0.7, color: [0.5, 0.35, 0.3], color2: C.carapace, headColor: C.flesh, lunge: 0.15, extra: b => [P('cone', [0.22, 1.4, 0.22], [1.3, 0.3, -0.5], m(C.bone), { rot: [0, 0.5, -1.3], anim: st => ({ rot: [0, -AK(st) * 0.8, 0] }) }), P('cone', [0.22, 1.4, 0.22], [1.3, 0.3, 0.5], m(C.bone), { rot: [0, -0.5, -1.3], anim: st => ({ rot: [0, AK(st) * 0.8, 0] }) })] }),
  defiler: () => RIG.bug({ segs: [[-0.2, 0, 1.6, 0.6, 1.0]], legs: 3, legLen: 0.75, legX0: 0.4, legGap: 0.5, headR: 0.5, headX: 0.85, color: [0.36, 0.3, 0.42], color2: C.zpurple, extra: b => [P('cyl', [0.16, 1.1, 0.16], [-1.0, 0.45, 0], m(C.carapace), { rot: [0, 0, 0.9] }), P('cone', [0.2, 0.4, 0.2], [-1.45, 0.95, 0], m(C.bone), { rot: [0, 0, 0.9] })] }),
  broodling: () => RIG.bug({ segs: [[0, 0, 1.3, 0.6, 0.8]], legs: 2, legLen: 0.6, legX0: 0.25, legGap: 0.5, headR: 0.5, headX: 0.7, color: [0.62, 0.52, 0.4] }),
  infested_terran: () => RIG.biped({ suit: [0.45, 0.58, 0.35], headColor: [0.5, 0.65, 0.4], visor: [0.7, 1, 0.4], gun: null, pack: false }),
  larva: () => { const r = N([0, 0, 0]); for (let k = 0; k < 3; k++) r.children.push(P('sphere', [0.8, 0.6 + k * 0.1, 0.65 + k * 0.1], [-0.5 + k * 0.45, 0.3, 0], m(k === 2 ? [0.78, 0.6, 0.66] : [0.68, 0.5, 0.58]), { anim: st => ({ pos: [0, 0, st.walk == null ? 0 : Math.sin(st.walk * Math.PI * 2 + k) * 0.1] }) })); r.children.push(P('sphere', [0.1, 0.1, 0.1], [0.55, 0.35, -0.15], m(C.dark)), P('sphere', [0.1, 0.1, 0.1], [0.55, 0.35, 0.15], m(C.dark))); return r; },
  egg: () => { const r = N([0, 0, 0]); r.children.push(P('sphere', [1.6, 1.9, 1.6], [0, 0.9, 0], m([0.62, 0.52, 0.58], { spec: 0.5 })), P('sphere', [0.9, 1.1, 0.9], [0, 0.95, 0], m([0.45, 0.25, 0.42]))); return r; },
  lurker_egg: () => UNITS.egg(), cocoon: () => { const r = UNITS.egg(); r.children[0].mat = m([0.48, 0.4, 0.5], { spec: 0.5 }); return r; },
  // ---- M12 wave four: the Zerg ten ---------------------------------------------------------------
  // Same rule the Terran infantry got in M8 and the Zerg carapace got in M9: at 40 px under fog with a
  // team tint, SHAPE is the only thing you identify a unit by. Each of these carries one deliberately
  // oversized feature that breaks its outline seen from directly overhead, because overhead is the
  // only angle this game is ever drawn from -- the roach is a low armoured slab, the ravager is that
  // slab with a mortar sac standing off the back of it, the baneling is two green bulbs and almost no
  // body, the swarm host is a shell with an open hatch, the viper is a long spine with reaching arms.
  brood_cocoon: () => { const r = UNITS.egg(); r.children[0].mat = m([0.52, 0.36, 0.34], { spec: 0.35 }); return r; },
  // Low, wide and plated: the silhouette says "this does not die quickly", which is the whole unit.
  roach: () => { const r = RIG.bug({ segs: [[-0.1, 0.05, 1.7, 0.72, 1.45]], legs: 3, legLen: 0.55, legW: 0.15, legX0: 0.5, legGap: 0.55, headR: 0.55, headX: 0.85, bodyY: 0.34, plates: 7, bands: 4, spines: 4, spineLen: 0.7, color: [0.44, 0.32, 0.30], color2: C.carapace, lunge: 0.09 });
    const b = r.children[0];
    for (const s of [-1, 1]) b.children.push(P('sphere', [0.42, 0.30, 0.34], [0.55, 0.18, s * 0.52], m(C.carapaceD, { spec: 0.6 })));
    b.children.push(P('sphere', [0.34, 0.26, 0.30], [0.95, 0.10, 0], GLOW([0.55, 0.85, 0.35]), { anim: st => ({ size: [1 + AK(st) * 0.5, 1 + AK(st) * 0.5, 1 + AK(st) * 0.5] }) }));   // the acid gland it spits from
    return r; },
  // A roach with a mortar on its back. The sac is the read: it stands proud of the shell, it is the
  // only bright thing on the model, and it swells on the attack frame.
  ravager: () => { const r = RIG.bug({ segs: [[-0.15, 0.1, 1.95, 0.9, 1.55]], legs: 3, legLen: 0.7, legW: 0.19, legX0: 0.6, legGap: 0.65, headR: 0.6, headX: 1.0, bodyY: 0.46, plates: 6, bands: 4, spines: 5, color: [0.40, 0.28, 0.30], color2: C.carapaceD, lunge: 0.1 });
    const b = r.children[0];
    b.children.push(P('sphere', [0.85, 0.85, 0.85], [-0.45, 0.72, 0], m(C.carapace, { spec: 0.5 })));
    b.children.push(P('cone', [0.44, 0.9, 0.44], [-0.35, 1.15, 0], m([0.30, 0.42, 0.20], { spec: 0.3 }), { rot: [0, 0, -0.35] }));
    b.children.push(P('sphere', [0.26, 0.26, 0.26], [-0.05, 1.5, 0], GLOW([0.72, 0.95, 0.30]), { anim: st => ({ size: [1 + AK(st), 1 + AK(st), 1 + AK(st)] }) }));
    for (const s of [-1, 1]) b.children.push(P('cone', [0.15, 0.7, 0.15], [0.6, 0.35, s * 0.55], m(C.bone), { rot: [s * 0.3, 0, -0.9] }));
    return r; },
  // Two acid sacs with legs. Almost no carapace on purpose -- it has 35 hit points and the model
  // should say so -- and the sacs pulse on the attack channel so a rolling baneling reads as armed.
  baneling: () => { const r = RIG.bug({ segs: [[0, 0.1, 1.0, 0.85, 1.0]], legs: 2, legLen: 0.45, legW: 0.1, legX0: 0.2, legGap: 0.42, head: false, bodyY: 0.32, plates: 2, bands: 1, spines: 2, spineLen: 0.5, color: [0.46, 0.42, 0.26], color2: [0.36, 0.34, 0.22], teamX: -0.1, lunge: 0.16 });
    const b = r.children[0];
    for (const s of [-1, 1]) b.children.push(P('sphere', [0.62, 0.62, 0.55], [0.05, 0.42, s * 0.36], GLOW([0.55, 0.9, 0.25]), { anim: st => ({ size: [1 + AK(st) * 0.35, 1 + AK(st) * 0.35, 1 + AK(st) * 0.35] }) }));
    b.children.push(P('sphere', [0.30, 0.26, 0.28], [0.62, 0.05, 0], m(C.carapaceD)));
    for (const s of [-1, 1]) b.children.push(P('sphere', [0.09, 0.09, 0.09], [0.74, 0.14, s * 0.14], GLOW(C.eye)));
    return r; },
  // A shell with a hatch in it. The hatch is the feature: it is the only opening on any Zerg ground
  // unit, and it is what tells you the thing crawling towards you is not the thing that will hit you.
  swarm_host: () => { const r = RIG.bug({ segs: [[-0.1, 0.12, 1.6, 1.05, 1.5]], legs: 3, legLen: 0.5, legW: 0.16, legX0: 0.45, legGap: 0.5, headR: 0.42, headX: 0.85, bodyY: 0.38, plates: 4, bands: 3, spines: 3, color: [0.40, 0.34, 0.28], color2: C.carapaceD, lunge: 0 });
    const b = r.children[0];
    b.children.push(P('sphere', [0.95, 0.55, 0.95], [-0.25, 0.62, 0], m([0.14, 0.07, 0.11], { spec: 0.1 })));   // the open hatch, recessed and dark
    b.children.push(P('sphere', [0.34, 0.24, 0.34], [-0.25, 0.72, 0], GLOW([0.55, 0.85, 0.35])));
    for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.4; b.children.push(P('cone', [0.13, 0.55, 0.13], [-0.25 + Math.cos(a) * 0.6, 0.6, Math.sin(a) * 0.6], m(C.bone), { rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] })); }
    return r; },
  // Small, fast and disposable. Kept plain: a dozen of these arrive at once and anything ornate at
  // this size turns into noise.
  locust: () => RIG.bug({ segs: [[0, 0, 1.1, 0.5, 0.7]], legs: 2, legLen: 0.5, legW: 0.09, legX0: 0.2, legGap: 0.45, headR: 0.4, headX: 0.6, bodyY: 0.3, plates: 3, bands: 2, spines: 3, spineLen: 0.7, color: [0.5, 0.44, 0.3], color2: [0.38, 0.32, 0.24], lunge: 0.14, teamSpot: true }),
  // Long, thin and reaching. The two arms are the whole silhouette and they are what Abduct looks
  // like -- the model should make it obvious which flyer is the one that pulls things.
  viper: () => RIG.flyer({ alt: 0.5, bodySize: [2.2, 0.55, 0.7], wingLen: 1.4, wingSpan: 2.1, flap: 0.4, tail: 1.4, color: [0.42, 0.46, 0.32], wingColor: [0.36, 0.42, 0.30], headColor: [0.30, 0.40, 0.24],
    extra: r => [P('sphere', [0.20, 0.20, 0.20], [1.25, 0.06, 0], GLOW([0.75, 0.95, 0.35])),
      ...[-1, 1].map(s => P('cyl', [0.11, 1.5, 0.11], [0.5, -0.28, s * 0.4], m(C.fleshD), { rot: [0, 0, -1.15], anim: st => ({ rot: [0, s * (0.4 - AK(st) * 1.1), -1.15] }) })),
      ...[-1, 1].map(s => P('cone', [0.14, 0.5, 0.14], [1.25, -0.42, s * 0.55], m(C.bone), { rot: [0, 0, -1.4] }))] }),
  // A sac carried under the body, dragging. It is the one Zerg ground caster that is not a defiler,
  // so it deliberately does NOT get the defiler's raised scythe -- low and swollen instead of tall.
  infestor: () => { const r = RIG.bug({ segs: [[-0.15, 0.02, 1.5, 0.6, 1.05]], legs: 3, legLen: 0.6, legW: 0.12, legX0: 0.4, legGap: 0.5, headR: 0.45, headX: 0.8, bodyY: 0.34, plates: 4, bands: 3, spines: 4, color: [0.36, 0.42, 0.30], color2: [0.28, 0.36, 0.26], lunge: 0.06 });
    const b = r.children[0];
    b.children.push(P('sphere', [0.85, 0.62, 0.75], [-0.55, -0.18, 0], m([0.48, 0.62, 0.34], { spec: 0.2 })));
    b.children.push(P('sphere', [0.32, 0.26, 0.30], [-0.75, 0.2, 0], GLOW([0.62, 0.95, 0.40])));
    for (let k = 0; k < 3; k++) b.children.push(P('sphere', [0.16, 0.16, 0.16], [-0.2 - k * 0.3, 0.42, (k % 2 ? 0.28 : -0.28)], GLOW([0.5, 0.85, 0.35])));
    return r; },
  // Built off the overlord on purpose: it has to read as the same creature at a glance, because the
  // decision a player makes about it is "which of my overlords is this". The single huge eye is the
  // difference, and the drop tentacles are gone -- it carries nothing.
  overseer: () => { const r = RIG.flyer({ alt: 0.7, bodySize: [2.0, 1.3, 1.6], color: [0.46, 0.40, 0.44], head: false, flap: 0.22, wingLen: 1.2, wingSpan: 1.1, wingColor: [0.38, 0.30, 0.36],
    extra: r2 => [P('sphere', [0.75, 0.7, 0.7], [0.95, 0.05, 0], m(C.carapace, { spec: 0.45 })),
      P('sphere', [0.42, 0.42, 0.42], [1.25, 0.05, 0], GLOW([0.95, 0.75, 0.30]), { anim: st => ({ size: [1 + 0.08 * IDLE(st), 1 + 0.08 * IDLE(st), 1 + 0.08 * IDLE(st)] }) }),
      P('sphere', [0.16, 0.16, 0.16], [1.5, 0.05, 0], m(C.dark))] });
    for (let k = 0; k < 5; k++) { const a = k * 1.256 + 0.5; r.children.push(P('cone', [0.13, 0.7, 0.13], [Math.cos(a) * 0.8 - 0.3, 0.62, Math.sin(a) * 0.75], m(C.bone), { rot: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8] })); }
    return r; },
  probe: () => RIG.ship({ alt: 0.4, bodySize: [1.7, 0.9, 1.2], color: C.gold, cockpit: C.psi, engines: [[-0.85, 0, 0]], extra: r => [P('oct', [0.5, 0.5, 0.5], [0.3, 0.55, 0], GLOW(C.psi))] }),
  zealot: () => { const r = RIG.biped({ suit: C.gold, headColor: C.goldD, visor: C.psi, gun: null, pack: false, padMat: TEAM, torsoW: 1.0, stride: 0.7, chest: C.goldD, antenna: false, dark: C.goldD }); const t = r.children[2]; for (const s of [-1, 1]) { const arm = N([0.3, 0.1, s * 0.6], { anim: lunge(0.35) }); arm.children.push(cylX(0.5, 0.18, [0.2, 0, 0], m(C.goldD)), cylX(1.0, 0.07, [0.95, 0, 0], GLOW(C.psi))); t.children.push(arm); } return r; },
  dragoon: () => RIG.walker4({}),
  high_templar: () => { const r = RIG.biped({ suit: C.cream, headColor: [0.25, 0.2, 0.35], visor: C.psi, gun: null, pack: false, pads: false, legLen: 0.3, torsoH: 1.0, torsoW: 0.9, stride: 0.15 }); r.children[2].children.push(P('sphere', [0.35, 0.35, 0.35], [0.3, 0.65, 0], TEAM), P('sphere', [0.2, 0.2, 0.2], [0.8, 0.1, -0.5], GLOW(C.psi), { anim: st => ({ size: [1 + AK(st) * 2, 1 + AK(st) * 2, 1 + AK(st) * 2] }) }), P('sphere', [0.2, 0.2, 0.2], [0.8, 0.1, 0.5], GLOW(C.psi), { anim: st => ({ size: [1 + AK(st) * 2, 1 + AK(st) * 2, 1 + AK(st) * 2] }) })); return r; },
  dark_templar: () => { const r = RIG.biped({ suit: C.shadowCloth, headColor: [0.1, 0.11, 0.15], visor: [0.5, 1, 0.6], gun: null, pack: false, pads: false, legLen: 0.35, torsoH: 0.95, torsoW: 0.85, stride: 0.5 }); const arm = N([0.3, 0.05, 0.5], { anim: st => ({ rot: [0, -0.4 + AK(st) * 1.4, 0] }) }); arm.children.push(cylX(1.3, 0.07, [0.7, 0, 0], GLOW([0.5, 1, 0.6]))); r.children[2].children.push(arm, P('sphere', [0.3, 0.3, 0.3], [-0.1, 0.55, 0], TEAM)); return r; },
  archon: () => { const r = N([0, 0.8, 0]); r.children.push(P('sphere', [1.6, 1.6, 1.6], [0, 0, 0], GLOW([0.55, 0.8, 1])), P('sphere', [0.9, 0.9, 0.9], [0, 0.1, 0], GLOW([0.92, 0.97, 1])), P('sphere', [0.5, 0.5, 0.5], [0, 0.2, 0], TEAM)); return r; },
  dark_archon: () => { const r = N([0, 0.8, 0]); r.children.push(P('sphere', [1.6, 1.6, 1.6], [0, 0, 0], GLOW([0.75, 0.3, 1])), P('sphere', [0.9, 0.9, 0.9], [0, 0.1, 0], GLOW([1, 0.55, 0.55])), P('sphere', [0.5, 0.5, 0.5], [0, 0.2, 0], TEAM)); return r; },
  reaver: () => { const r = N([0, 0, 0]); for (let k = 0; k < 4; k++) r.children.push(P('sphere', [0.75, 0.75 - k * 0.06, 0.95 - k * 0.08], [0.6 - k * 0.55, 0.4, 0], k % 2 ? m(C.gold, { spec: 0.5 }) : TEAM, { anim: st => ({ pos: [0, st.walk == null ? 0 : Math.sin(st.walk * Math.PI * 2 + k * 1.2) * 0.06, 0] }) })); r.children.push(P('sphere', [0.8, 0.85, 0.95], [1.05, 0.45, 0], m(C.goldD, { spec: 0.5 }), { anim: recoil(0.15) }), P('sphere', [0.3, 0.3, 0.3], [1.45, 0.45, 0], GLOW(C.psi))); return r; },
  shuttle: () => RIG.ship({ body: 'box', bodySize: [2.0, 0.55, 1.3], color: C.gold, cockpit: C.navy, engines: [[-1.05, 0, -0.35], [-1.05, 0, 0.35]], engineColor: [0.6, 0.9, 1] }),
  observer: () => { const r = N([0, 0.4, 0]); r.children.push(P('sphere', [0.9, 0.7, 0.9], [0, 0, 0], m(C.navy, { spec: 0.6 })), P('sphere', [0.35, 0.35, 0.35], [0.2, 0.05, 0], GLOW(C.psi))); for (let k = 0; k < 3; k++) { const a = k * 2.09 + 0.5; r.children.push(cylX(1.2, 0.08, [Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6], m(C.gold), { rot: [0, -a, -Math.PI / 2] })); } return r; },
  scout: () => RIG.ship({ bodySize: [2.5, 0.6, 0.9], color: C.gold, cockpit: C.navy, wings: { len: 1.0, span: 1.3, sweep: 1.0, x: -0.5 }, engines: [[-1.2, 0, 0]], engineColor: [0.6, 0.9, 1] }),
  corsair: () => RIG.ship({ bodySize: [1.5, 0.5, 1.1], color: C.gold, cockpit: C.navy, engines: [[-0.75, 0, 0]], engineColor: [0.6, 0.9, 1], extra: r => [cylX(1.3, 0.14, [0.9, 0, -0.5], m(C.goldD)), cylX(1.3, 0.14, [0.9, 0, 0.5], m(C.goldD))] }),
  carrier: () => RIG.ship({ bodySize: [2.4, 0.9, 1.5], color: C.gold, cockpit: C.psi, engines: [[-1.2, 0, 0]], engineColor: [0.6, 0.9, 1], extra: r => [P('box', [0.9, 0.7, 1.3], [-0.6, 0.05, 0], m(C.goldD)), P('box', [1.2, 0.2, 0.4], [0.2, -0.25, -0.75], m(C.navy)), P('box', [1.2, 0.2, 0.4], [0.2, -0.25, 0.75], m(C.navy))] }),
  arbiter: () => RIG.ship({ body: 'box', bodySize: [2.0, 0.4, 2.0], color: C.gold, cockpit: false, engines: [], extra: r => [P('box', [1.0, 0.5, 1.0], [0, 0.2, 0], m(C.goldD)), P('oct', [0.8, 0.8, 0.8], [0, 0.6, 0], GLOW(C.psi))] }),
  interceptor: () => RIG.ship({ bodySize: [1.2, 0.3, 0.6], color: C.gold, cockpit: false, engines: [[-0.6, 0, 0]] }),
  scarab: () => { const r = N([0, 0.3, 0]); r.children.push(P('sphere', [1.2, 0.6, 1.0], [0, 0, 0], m(C.gold)), P('sphere', [0.4, 0.4, 0.4], [0.4, 0.1, 0], GLOW(C.psi))); return r; },
  hallucination: () => { const r = N([0, 0.5, 0]); r.children.push(P('sphere', [1.2, 1.2, 1.2], [0, 0, 0], GLOW([0.5, 0.8, 1]))); return r; },
  // ---- M12: the Protoss twelve -------------------------------------------------------------------
  // The rule M8 wrote down for the Terran infantry applies here with more force, because Protoss is
  // ten new units in one race and every one of them is gold: at 40 px under fog with a team tint,
  // COLOUR IS THE FIRST THING YOU LOSE, so each of these carries one oversized outline-breaking
  // feature and no two share it. Legs and height do most of the work -- a Colossus is four spider
  // legs and almost no body, an Immortal is a squat brick on four short ones, a Sentry is a small
  // thing that hovers -- and the air units separate on plan shape: a dart, a shell, a spike, a disc
  // and a saucer. None of them is a recoloured Scout.
  //
  // THE SENTRY hovers, which nothing else on the Protoss ground card does, and it is small. Three
  // dangling legs under a floating shell read as "not a soldier" at any size.
  sentry: () => {
    const r = N([0, 0.55, 0]);
    r.children.push(P('dome', [1.15, 0.75, 1.15], [0, 0.08, 0], m(C.gold, { spec: 0.62 })), P('cyl', [1.0, 0.16, 1.0], [0, 0.04, 0], m(C.goldD, { spec: 0.5 })));
    r.children.push(P('sphere', [0.42, 0.42, 0.42], [0.32, 0.10, 0], GLOW(C.psi)), P('box', [0.42, 0.07, 0.5], [-0.2, 0.42, 0], TEAM));
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.6; r.children.push(P('cyl', [0.10, 0.62, 0.10], [Math.cos(a) * 0.44, -0.32, Math.sin(a) * 0.44], m(C.goldD), { rot: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], anim: st => ({ pos: [0, st.idle == null ? 0 : 0.05 * IDLE(st), 0] }) })); }
    for (const s of [-1, 1]) r.children.push(P('oct', [0.22, 0.4, 0.22], [-0.1, 0.5, s * 0.5], GLOW(C.psi), { anim: st => ({ size: [1 + AK(st) * 0.8, 1 + AK(st) * 0.8, 1 + AK(st) * 0.8] }) }));
    return r;
  },
  // THE IMMORTAL is the Dragoon rig deliberately -- it IS a dragoon lineage machine -- but squat and
  // wide where the Dragoon is tall and round, with two slab arm cannons that double its width. Same
  // family, opposite proportions, which is how a player reads "the big one" without a label.
  immortal: () => {
    const r = RIG.walker4({ bodySize: [1.45, 0.85, 1.5], bodyY: 0.82, legLen: 0.78, color: C.goldD });
    const b = r.children[0];
    for (const s of [-1, 1]) {
      const arm = N([0.25, -0.05, s * 0.95], { anim: recoil(0.2) });
      arm.children.push(P('box', [1.15, 0.42, 0.42], [0.45, 0, 0], m(C.gold, { spec: 0.6 })), P('box', [0.3, 0.2, 0.2], [1.1, 0, 0], GLOW(C.psi)));
      b.children.push(arm);
    }
    // the hardened-shield emitters: four lit posts standing proud of the hull, so the silhouette has
    // a spiky top edge the Dragoon's smooth dome does not
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.children.push(P('cyl', [0.09, 0.5, 0.09], [sx * 0.5, 0.55, sz * 0.55], m(C.goldL, { spec: 0.7 })), P('oct', [0.17, 0.26, 0.17], [sx * 0.5, 0.86, sz * 0.55], GLOW([0.6, 0.9, 1])));
    return r;
  },
  // THE COLOSSUS: four very long thin legs and almost no body. This is the whole silhouette and it is
  // the only one like it in the game, which matters more than usual because the def flies -- the
  // player has to be able to tell at a glance that the thing walking over the cliff is theirs and is
  // not a ship.
  colossus: () => {
    const r = N([0, 0, 0]);
    const body = N([0, 2.5, 0], { anim: withDeath(st => ({ pos: [0, st.idle == null ? 0 : 0.06 * IDLE(st), 0] }), t => ({ pos: [0, -2.1 * t, 0], rot: [0.9 * t, 0, 0.5 * t] })) });
    r.children.push(body);
    body.children.push(P('sphere', [1.05, 0.6, 0.9], [0, 0, 0], m(C.goldD, { spec: 0.6 })), P('dome', [1.15, 0.5, 1.0], [0, 0.2, 0], m(C.gold, { spec: 0.65 })), P('box', [0.5, 0.08, 0.6], [-0.35, 0.42, 0], TEAM));
    for (const s of [-1, 1]) body.children.push(P('cyl', [0.16, 0.55, 0.16], [0.42, 0.28, s * 0.38], m(C.goldL, { spec: 0.7 })), P('sphere', [0.26, 0.26, 0.26], [0.42, 0.58, s * 0.38], GLOW([0.9, 0.6, 0.3]), { anim: st => ({ size: [1 + AK(st) * 1.4, 1 + AK(st) * 1.4, 1 + AK(st) * 1.4] }) }));
    [[0.7, -1], [0.7, 1], [2.44, -1], [2.44, 1]].forEach(([a, s], i) => {
      const hip = N([Math.cos(a) * 0.55, 2.4, Math.sin(a) * 0.55 * s], { rot: [0, -Math.atan2(Math.sin(a) * s, Math.cos(a)), 0], anim: withDeath(yaw(0.22, i % 2 ? Math.PI : 0, 1), t => ({ rot: [0, 0, (i < 2 ? 1.2 : -1.0) * t] })) });
      const up = N([0, 0, 0], { rot: [0, 0, -1.15] });
      up.children.push(P('cyl', [0.13, 1.5, 0.13], [0, -0.75, 0], m(C.goldD, { spec: 0.55 })));
      const knee = N([0, -1.5, 0], { rot: [0, 0, 2.0] }); knee.children.push(P('cyl', [0.10, 1.6, 0.10], [0, -0.8, 0], m(C.goldD, { spec: 0.55 })));
      up.children.push(knee); hip.children.push(up); r.children.push(hip);
    });
    return r;
  },
  // THE DISRUPTOR: a caged sphere. No legs at all, so it is the only Protoss ground unit that is a
  // circle from above, and the cage rings turn while it charges.
  disruptor: () => {
    const r = N([0, 0.7, 0]);
    r.children.push(P('sphere', [1.0, 1.0, 1.0], [0, 0, 0], GLOW([0.75, 0.45, 1]), { anim: st => ({ size: [1 + AK(st) * 0.5, 1 + AK(st) * 0.5, 1 + AK(st) * 0.5] }) }));
    for (let k = 0; k < 3; k++) r.children.push(P('cyl', [1.55, 0.14, 1.55], [0, 0, 0], m(C.goldD, { spec: 0.6 }), { rot: [k === 0 ? 0 : Math.PI / 2, 0, k === 2 ? Math.PI / 2 : 0], anim: st => ({ rot: [0, (st.idle || 0) * 6.283 * (k + 1) * 0.4, 0] }) }));
    r.children.push(P('sphere', [0.45, 0.45, 0.45], [0, -0.75, 0], m(C.goldD)), P('box', [0.5, 0.08, 0.45], [-0.2, 0.85, 0], TEAM));
    return r;
  },
  // THE WARP PRISM is a Pylon that flies and it should look like one: the same floating octahedron the
  // Pylon carries, slung under a flat carrier plate. Nothing else in the air has a lit crystal hanging
  // below it, which is the tell that this is the thing making ground powered.
  warp_prism: () => RIG.ship({ body: 'box', bodySize: [1.7, 0.32, 1.5], color: C.goldD, cockpit: C.psi, engines: [[-0.9, 0, -0.4], [-0.9, 0, 0.4]], engineColor: [0.6, 0.9, 1],
    extra: () => [P('oct', [0.85, 1.3, 0.85], [0, -0.62, 0], GLOW(C.psi), { anim: st => ({ rot: [0, (st.idle || 0) * 6.283, 0], pos: [0, st.idle == null ? 0 : 0.07 * IDLE(st), 0] }) }),
      P('cyl', [0.16, 0.4, 0.16], [0, -0.28, 0], m(C.gold)),
      P('box', [0.35, 0.14, 1.9], [0.2, 0.1, 0], m(C.gold, { spec: 0.6 }))] }),
  // THE PHOENIX: a dart. Long, narrow, sharply swept wings, and the smallest plan area of any Protoss
  // ship -- against the Corsair's fat twin booms it is unmistakable.
  phoenix: () => RIG.ship({ bodySize: [2.1, 0.34, 0.5], color: C.gold, cockpit: C.psi, wings: { len: 0.75, span: 1.55, sweep: 1.25, x: -0.3 }, wingColor: C.goldD, engines: [[-1.0, 0, 0]], engineColor: [0.7, 0.95, 1],
    extra: () => [P('cone', [0.28, 0.9, 0.28], [1.2, 0, 0], m(C.goldL, { spec: 0.7 }), { rot: [0, 0, -Math.PI / 2] }),
      P('sphere', [0.18, 0.18, 0.18], [0.95, 0.05, 0], GLOW([0.7, 1, 1]), { anim: st => ({ size: [1 + AK(st) * 1.6, 1 + AK(st) * 1.6, 1 + AK(st) * 1.6] }) })] }),
  // THE ORACLE: a curved shell with a wide dorsal fin, which gives it a tall silhouette from the side
  // and a teardrop from above. It is the harasser, so it should read as fast and thin-skinned.
  oracle: () => RIG.ship({ bodySize: [1.9, 0.62, 0.85], color: C.cream, cockpit: false, engines: [[-0.95, 0, 0]], engineColor: [0.9, 0.7, 1],
    extra: () => [P('wedge', [1.5, 0.85, 0.16], [-0.15, 0.35, 0], m(C.goldD, { spec: 0.6 })),
      P('oct', [0.5, 0.75, 0.5], [0.55, 0.28, 0], GLOW([0.95, 0.75, 1]), { anim: st => ({ size: [1 + AK(st) * 0.9, 1 + AK(st) * 0.9, 1 + AK(st) * 0.9] }) }),
      P('box', [0.5, 0.07, 0.55], [-0.4, 0.3, 0], TEAM)] }),
  // THE VOID RAY: a spike. The prism spine is longer than the hull and does the whole job of saying
  // "this fires one continuous heavy beam", which is the opposite reading from the Scout's two guns.
  void_ray: () => RIG.ship({ body: 'box', bodySize: [1.5, 0.7, 0.8], color: C.navy, cockpit: false, engines: [[-0.85, 0, 0]], engineColor: [0.55, 0.75, 1],
    extra: () => [P('oct', [0.55, 2.6, 0.55], [0.85, 0.05, 0], GLOW([0.6, 0.55, 1]), { rot: [0, 0, -Math.PI / 2], anim: st => ({ size: [1 + AK(st) * 0.4, 1, 1 + AK(st) * 0.4] }) }),
      P('box', [0.6, 0.5, 1.6], [-0.35, 0.05, 0], m(C.goldD, { spec: 0.6 })),
      P('cyl', [0.35, 0.9, 0.35], [-0.3, 0.05, 0], m(C.gold), { rot: [Math.PI / 2, 0, 0] }),
      P('box', [0.45, 0.07, 0.5], [-0.5, 0.42, 0], TEAM)] }),
  // THE TEMPEST: a wide flat disc with a floating ring above it, the largest plan area of any Protoss
  // ship except the Mothership. Big and slow should look big and slow from the minimap up.
  tempest: () => RIG.ship({ alt: 0.35, body: 'box', bodySize: [1.5, 0.4, 1.5], color: C.goldD, cockpit: false, engines: [], extra: () => [
    P('cyl', [3.0, 0.22, 3.0], [0, 0, 0], m(C.gold, { spec: 0.6 })),
    P('cyl', [2.2, 0.1, 2.2], [0, 0.22, 0], GLOW([0.35, 0.55, 0.95]), { anim: st => ({ rot: [0, (st.idle || 0) * 6.283, 0] }) }),
    P('dome', [1.3, 0.7, 1.3], [0, 0.24, 0], m(C.goldD, { spec: 0.66 })),
    P('oct', [0.5, 0.9, 0.5], [0, 0.85, 0], GLOW(C.psi), { anim: st => ({ size: [1 + AK(st) * 0.7, 1 + AK(st) * 0.7, 1 + AK(st) * 0.7] }) }),
    P('box', [0.6, 0.07, 0.55], [-0.9, 0.3, 0], TEAM)] }),
  // THE MOTHERSHIP: the largest thing in the game and it has to read that way instantly -- a saucer
  // with three crystals orbiting it. Made of two Arbiters, so the Arbiter's floating octahedron is
  // kept and multiplied rather than replaced.
  mothership: () => {
    const r = N([0, 0.5, 0]);
    r.children.push(P('cyl', [4.0, 0.3, 4.0], [0, 0, 0], m(C.goldD, { spec: 0.62 })), P('dome', [3.0, 1.2, 3.0], [0, 0.15, 0], m(C.gold, { spec: 0.7 })), P('cyl', [1.6, 0.24, 1.6], [0, 1.2, 0], m(C.navy)));
    r.children.push(P('oct', [1.1, 1.8, 1.1], [0, 1.9, 0], GLOW(C.psi), { anim: st => ({ pos: [0, st.idle == null ? 0 : 0.12 * IDLE(st), 0], rot: [0, (st.idle || 0) * 6.283, 0] }) }));
    for (let k = 0; k < 3; k++) { const a = k * 2.094; r.children.push(P('oct', [0.5, 0.85, 0.5], [Math.cos(a) * 2.4, 0.55, Math.sin(a) * 2.4], GLOW([0.7, 0.55, 1]), { anim: st => ({ pos: [0, st.idle == null ? 0 : 0.09 * Math.sin((st.idle || 0) * 6.283 + k * 2.1), 0] }) })); }
    r.children.push(P('box', [1.0, 0.08, 0.7], [-1.6, 0.35, 0], TEAM));
    for (let k = 0; k < 6; k++) { const a = k * 1.047 + 0.5; r.children.push(P('box', [0.7, 0.12, 0.22], [Math.cos(a) * 1.9, 0.22, Math.sin(a) * 1.9], m(C.goldL, { spec: 0.72 }), { rot: [0, -a, 0] })); }
    return r;
  },
  // ---- M11 additions: the map's own units --------------------------------------------------------
  // Three units shipped with no model and so had no baked sheet at all. See the M11 block in BUILDINGS
  // for why that matters. None of these may look like it belongs to a race: the creatures are dirt and
  // chitin rather than Zerg purple, and the Sentinel is old machinery someone else built and left.
  //
  // The Sentinel is the only one that is ever team-coloured, because it is the only one that can be
  // owned -- capturing the foundry is what builds it.
  sentinel: () => {
    const root = N([0, 0, 0]);
    // A squat four-legged automaton. Legs splayed and short, so it reads as a walking gun emplacement
    // rather than as a Goliath: it is a thing that was left guarding something, not an army unit.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = N([sx * 0.42, 0.62, sz * 0.5], { anim: swing(0.30, sx * sz > 0 ? 0 : Math.PI, sz) });
      leg.children.push(P('cyl', [0.17, 0.42, 0.17], [sx * 0.1, -0.21, sz * 0.08], m([0.32, 0.30, 0.27]), { rot: [-sz * 0.35, 0, -sx * 0.35] }));
      const shin = N([sx * 0.2, -0.42, sz * 0.16], { rot: [sz * 0.2, 0, sx * 0.2] });
      shin.children.push(P('cyl', [0.13, 0.44, 0.13], [0, -0.22, 0], m([0.26, 0.24, 0.22])),
        P('box', [0.30, 0.10, 0.26], [0, -0.44, 0], m([0.20, 0.19, 0.17])));
      leg.children.push(shin); root.children.push(leg);
    }
    const body = N([0, 0.92, 0], { anim: recoil(0.10) });
    root.children.push(body);
    // hull: old plate, a warmer grey than Terran steel, with oxide streaks implied by the darker skirt
    body.children.push(P('box', [1.05, 0.46, 0.95], [0, 0, 0], m([0.42, 0.40, 0.36], { spec: 0.35 })));
    body.children.push(P('box', [1.15, 0.12, 1.02], [0, -0.24, 0], m([0.28, 0.24, 0.20])));
    body.children.push(P('box', [0.45, 0.10, 0.55], [-0.2, 0.26, 0], TEAM));
    // sensor drum and a single amber eye -- the tell that it is awake and yours
    body.children.push(P('cyl', [0.34, 0.26, 0.34], [0.05, 0.36, 0], m([0.34, 0.32, 0.29])));
    body.children.push(P('sphere', [0.17, 0.17, 0.17], [0.30, 0.38, 0], GLOW([1.0, 0.72, 0.25])));
    // one heavy barrel, recoiling. Range 6, so it wants to look like it reaches.
    const gun = N([0.35, 0.02, 0], { anim: recoil(0.22) });
    gun.children.push(cylX(1.25, 0.15, [0.62, 0, 0], m(C.gun)),
      P('box', [0.30, 0.26, 0.32], [0.05, 0, 0], m([0.30, 0.28, 0.25])),
      P('cyl', [0.20, 0.14, 0.20], [1.28, 0, 0], m([0.22, 0.21, 0.19]), { rot: [0, 0, -Math.PI / 2] }));
    body.children.push(gun);
    return root;
  },
  // Small, low and many. It has to read at r9 -- which is tiny -- so it is one body, a wide head and
  // mandibles, and nothing else competing for those pixels.
  carrion_grub: () => {
    const r = RIG.bug({
      segs: [[-0.15, 0, 1.35, 0.62, 0.85], [0.55, 0.02, 0.7, 0.5, 0.62]],
      legs: 2, legLen: 0.5, legX0: 0.25, legGap: 0.5, head: false, bodyY: 0.34, lunge: 0.22,
      color: [0.40, 0.33, 0.24], color2: [0.31, 0.26, 0.19],
    });
    const b = r.children[0];
    b.children.push(P('sphere', [0.10, 0.10, 0.10], [0.85, 0.12, -0.13], GLOW([0.95, 0.55, 0.20])),
      P('sphere', [0.10, 0.10, 0.10], [0.85, 0.12, 0.13], GLOW([0.95, 0.55, 0.20])));
    // mandibles, opening on the strike
    for (const s of [-1, 1]) {
      const jaw = N([0.85, -0.05, s * 0.16], { anim: st => ({ rot: [0, s * (0.25 + AK(st) * 0.8), 0] }) });
      jaw.children.push(P('cone', [0.11, 0.42, 0.11], [0.18, 0, 0], m(C.bone), { rot: [0, 0, -Math.PI / 2 + 0.25] }));
      b.children.push(jaw);
    }
    for (let k = 0; k < 3; k++) b.children.push(P('cone', [0.10, 0.26, 0.10], [-0.55 + k * 0.28, 0.28, 0], m([0.52, 0.46, 0.34]), { rot: [0, 0, 0.35] }));
    return r;
  },
  // Large, armoured and slow, with splash. The silhouette is the MAW: a head nearly as wide as the body,
  // because at r20 next to a grub the difference has to be obvious before either of them moves.
  carrion_maw: () => {
    const r = RIG.bug({
      segs: [[-0.5, 0, 2.0, 1.05, 1.5], [0.7, 0.1, 1.3, 1.0, 1.35]],
      legs: 3, legLen: 0.85, legX0: 0.5, legGap: 0.62, head: false, bodyY: 0.55, lunge: 0.16,
      color: [0.36, 0.30, 0.23], color2: [0.27, 0.23, 0.18],
    });
    const b = r.children[0];
    // the maw: a ring of teeth around a dark throat, hinged open on the strike
    const maw = N([1.25, 0.05, 0], { anim: st => ({ size: [1 + AK(st) * 0.25, 1 + AK(st) * 0.3, 1 + AK(st) * 0.3] }) });
    maw.children.push(P('cyl', [0.95, 0.35, 1.05], [0, 0, 0], m([0.30, 0.25, 0.19]), { rot: [0, 0, -Math.PI / 2] }));
    maw.children.push(P('cyl', [0.62, 0.30, 0.72], [0.10, 0, 0], m([0.05, 0.04, 0.03]), { rot: [0, 0, -Math.PI / 2] }));
    for (let k = 0; k < 8; k++) {
      const a = k * 0.785 + 0.15;
      maw.children.push(P('cone', [0.13, 0.38, 0.13], [0.16, Math.cos(a) * 0.42, Math.sin(a) * 0.48], m(C.bone),
        { rot: [0, 0, -Math.PI / 2 + Math.cos(a) * 0.5] }));
    }
    b.children.push(maw);
    b.children.push(P('sphere', [0.13, 0.13, 0.13], [0.95, 0.45, -0.30], GLOW([1.0, 0.5, 0.15])),
      P('sphere', [0.13, 0.13, 0.13], [0.95, 0.45, 0.30], GLOW([1.0, 0.5, 0.15])));
    // dorsal plates, biggest at the shoulders and tapering back
    for (let k = 0; k < 5; k++)
      b.children.push(P('cone', [0.20 - k * 0.02, 0.62 - k * 0.07, 0.20], [0.25 - k * 0.42, 0.52, 0], m([0.55, 0.49, 0.36]), { rot: [0, 0, 0.30 + k * 0.06] }));
    return r;
  },
  // ---- M12 wave four: Terran ---------------------------------------------------------------------
  // Thirteen unit models (eleven new units, plus the Viking's second mode and the MULE). The rule they
  // are built under is M8's and M9's and it has not changed: at 40 px, under fog, with a team tint, the
  // only things that survive are ROUND against SQUARE, TALL against FLAT, and anything that hangs past
  // the footprint. Colour is the first thing lost, so none of these is distinguished by paint.
  //
  // The pressure here is much higher than it was for the original roster, because Terran now has six
  // things in the factory and ten in the starport and half of them are grey boxes with a gun. So each
  // one below carries ONE oversized feature, and the features are chosen to be different from each
  // other rather than merely appropriate: the marauder is the wide one, the reaper is the one with
  // something on its back, the hellion is the low wedge, the cyclone is the one with a raised drum, the
  // thor is the one that is simply enormous, the widow mine is a disc with legs.

  // Wide and squat where the marine is narrow: two slab pauldrons that overhang the body on both sides,
  // and a single fat grenade tube instead of the marine's thin rifle. Reads as a doorway with legs.
  marauder: () => { const r = RIG.biped({ suit: [0.44, 0.48, 0.52], torsoW: 1.35, torsoD: 1.0, torsoH: 0.85, headR: 0.36, legW: 0.28, stride: 0.35, recoil: 0.2, pads: false }); const t = r.children[2];
    for (const s of [-1, 1]) t.children.push(P('box', [0.62, 0.34, 0.5], [-0.02, 0.42, s * 0.82], m([0.36, 0.40, 0.45], { spec: 0.4 })), P('box', [0.66, 0.10, 0.54], [-0.02, 0.60, s * 0.82], TEAM));
    t.children.push(cylX(1.1, 0.26, [0.62, -0.10, 0.34], m(C.gun), { anim: recoil(0.28) }), P('cyl', [0.34, 0.16, 0.34], [1.20, -0.10, 0.34], m(C.metalD), { rot: [0, 0, -Math.PI / 2] }));
    t.children.push(P('box', [0.34, 0.5, 0.8], [-0.55, 0.05, 0], m([0.28, 0.31, 0.35])));
    return r; },
  // A backpack that is bigger than the torso, with two downward nozzles that stand proud of the
  // silhouette from above. Nothing else Terran has anything hanging below the shoulder line.
  reaper: () => { const r = RIG.biped({ suit: [0.50, 0.44, 0.36], torsoW: 0.78, torsoD: 0.7, headR: 0.40, legLen: 0.5, stride: 0.85, pack: false, visor: [1, 0.62, 0.25], gun: { len: 0.75, w: 0.1 } }); const t = r.children[2];
    t.children.push(P('box', [0.52, 0.72, 0.9], [-0.52, 0.05, 0], m([0.33, 0.30, 0.26], { spec: 0.45 })));
    for (const s of [-1, 1]) t.children.push(P('cyl', [0.24, 0.42, 0.24], [-0.62, -0.18, s * 0.42], m(C.metalD), { rot: [0, 0, 0.35] }), P('sphere', [0.16, 0.16, 0.16], [-0.74, -0.42, s * 0.46], GLOW([0.5, 0.8, 1])));
    t.children.push(P('box', [0.44, 0.1, 0.34], [-0.5, 0.44, 0], TEAM), cylX(0.7, 0.09, [0.5, -0.05, -0.4], m(C.gun)));
    return r; },
  // A flat wedge on four exposed wheels with one long flame tube down the centre line. The only
  // ground vehicle in the game whose body is a wedge rather than a box, and the lowest thing Terran
  // fields -- next to a tank it reads as half the height at the same width.
  hellion: () => { const r = N([0, 0, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) r.children.push(P('cyl', [0.42, 0.26, 0.42], [sx * 0.72, 0.21, sz * 0.62], m(C.tread), { rot: [Math.PI / 2, 0, 0] }));
    r.children.push(P('wedge', [2.1, 0.42, 1.15], [0.1, 0.42, 0], m([0.52, 0.45, 0.33], { spec: 0.45 })), P('box', [0.7, 0.16, 0.9], [-0.5, 0.62, 0], TEAM), P('sphere', [0.4, 0.2, 0.32], [0.05, 0.6, 0], GLOW(C.visor)));
    r.children.push(cylX(1.5, 0.15, [1.1, 0.46, 0], m(C.gun), { anim: recoil(0.12) }), P('sphere', [0.3, 0.24, 0.24], [1.85, 0.46, 0], GLOW(C.orange), { anim: st => ({ size: [1 + AK(st) * 2, 1 + AK(st) * 2, 1 + AK(st) * 2] }) }));
    for (const s of [-1, 1]) r.children.push(P('cyl', [0.2, 0.55, 0.2], [-0.85, 0.62, s * 0.35], m([0.4, 0.2, 0.15])));
    return r; },
  // A hull-down chassis with a rotating missile drum standing straight up out of it. The drum is the
  // feature: a cylinder taller than it is wide, on a vehicle, is a shape nothing else here makes.
  cyclone: () => { const r = N([0, 0, 0]);
    for (const s of [-1, 1]) { r.children.push(P('box', [1.7, 0.34, 0.36], [0, 0.18, s * 0.62], m(C.tread))); for (let k = 0; k < 5; k++) r.children.push(P('box', [0.08, 0.38, 0.38], [-0.65 + k * 0.33, 0.18, s * 0.62], m(C.metalD))); }
    r.children.push(P('box', [1.55, 0.4, 1.0], [0, 0.5, 0], m([0.48, 0.53, 0.58], { spec: 0.5 })), P('box', [0.5, 0.06, 0.7], [-0.5, 0.71, 0], TEAM), P('wedge', [0.6, 0.24, 1.0], [0.95, 0.5, 0], m(C.metalD)));
    const drum = N([-0.05, 0.72, 0], { anim: recoil(0.1) });
    drum.children.push(P('cyl', [0.66, 0.95, 0.66], [0, 0.47, 0], m([0.36, 0.40, 0.46], { spec: 0.55 })), P('cyl', [0.74, 0.12, 0.74], [0, 0.98, 0], m(C.metalD)));
    for (let k = 0; k < 6; k++) { const a = k * 1.047; drum.children.push(P('cyl', [0.11, 0.9, 0.11], [Math.cos(a) * 0.42, 0.5, Math.sin(a) * 0.42], m(C.red))); }
    drum.children.push(P('sphere', [0.18, 0.18, 0.18], [0, 1.12, 0], GLOW([1, 0.5, 0.2])));
    r.children.push(drum);
    return r; },
  // A disc on three folded legs with a single sensor stalk. Deliberately close to nothing else: it
  // spends most of its life underground, so what has to read is the moment it is UP and walking, and
  // a wide flat disc travelling on stubby legs is the clearest way to say "that is a mine, on the move".
  widow_mine: () => { const r = N([0, 0, 0]);
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.4; const leg = N([Math.cos(a) * 0.5, 0.34, Math.sin(a) * 0.5], { anim: yaw(0.25, k * 2.1, 1) });
      leg.children.push(P('cyl', [0.11, 0.4, 0.11], [Math.cos(a) * 0.2, -0.18, Math.sin(a) * 0.2], m(C.metalD), { rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] })); r.children.push(leg); }
    r.children.push(P('cyl', [1.5, 0.34, 1.5], [0, 0.5, 0], m([0.42, 0.44, 0.40], { spec: 0.4 })), P('cyl', [1.1, 0.1, 1.1], [0, 0.68, 0], TEAM), P('dome', [0.9, 0.4, 0.9], [0, 0.66, 0], m(C.metalD)));
    r.children.push(P('cyl', [0.08, 0.7, 0.08], [-0.15, 1.05, 0], m(C.metalD)), P('sphere', [0.2, 0.2, 0.2], [-0.15, 1.42, 0], GLOW(C.red), { anim: st => ({ size: [1 + AK(st) * 1.5, 1 + AK(st) * 1.5, 1 + AK(st) * 1.5] }) }));
    return r; },
  // Enormous, and that is the whole silhouette: the tallest ground unit in the game, twice a goliath in
  // both directions, with two shoulder cannons that overhang the legs. It is meant to be identifiable
  // by SIZE alone at any zoom, which is the one cue nothing else in the Terran roster is using.
  thor: () => { const root = N([0, 0, 0]);
    for (const s of [-1, 1]) { const leg = N([-0.15, 1.15, s * 0.78], { anim: swing(0.32, 0, s) });
      leg.children.push(P('cyl', [0.42, 0.72, 0.42], [-0.06, -0.36, 0], m([0.34, 0.37, 0.42]), { rot: [0, 0, 0.32] }));
      const shin = N([-0.32, -0.72, 0], { rot: [0, 0, -0.5] });
      shin.children.push(P('cyl', [0.36, 0.78, 0.36], [0, -0.39, 0], m([0.30, 0.33, 0.38])), P('box', [0.9, 0.22, 0.66], [0.1, -0.8, 0], m(C.metalD)));
      leg.children.push(shin); root.children.push(leg); }
    const body = N([0, 1.75, 0], { anim: recoil(0.16) }); root.children.push(body);
    body.children.push(P('box', [1.7, 1.05, 1.6], [0, 0, 0], m([0.50, 0.54, 0.60], { spec: 0.5 })), P('box', [0.8, 0.14, 0.95], [-0.3, 0.6, 0], TEAM),
      P('dome', [1.2, 0.7, 1.2], [0.15, 0.5, 0], m([0.38, 0.42, 0.48], { spec: 0.55 })), P('box', [0.3, 0.4, 0.66], [0.88, 0.1, 0], GLOW(C.visor)));
    for (const s of [-1, 1]) { const arm = N([0.15, 0.34, s * 1.0], { anim: recoil(0.3) });
      arm.children.push(P('box', [0.85, 0.55, 0.55], [0, 0, 0], m(C.metalD)), cylX(1.7, 0.24, [1.15, 0, 0], m(C.gun)), P('cyl', [0.36, 0.18, 0.36], [1.95, 0, 0], m(C.metalD), { rot: [0, 0, -Math.PI / 2] })); body.children.push(arm); }
    for (const s of [-1, 1]) body.children.push(P('box', [0.5, 0.55, 0.34], [-0.6, 0.55, s * 0.66], m(C.red)));
    return root; },
  // Wraith-shaped hull turned upside down: the rotors hang BELOW the body on two outriggers, so from
  // above it is a fuselage with two discs beside it -- the only Terran flyer with anything circular.
  banshee: () => RIG.ship({ bodySize: [2.0, 0.5, 0.7], color: [0.32, 0.35, 0.40], cockpit: [0.9, 0.5, 0.2], engines: [[-1.0, 0, 0]], engineColor: [1, 0.6, 0.25],
    extra: r => { const out = []; for (const s of [-1, 1]) { out.push(P('box', [0.34, 0.16, 0.9], [0.1, -0.05, s * 0.55], m(C.metalD)));
      out.push(P('cyl', [1.15, 0.07, 1.15], [0.1, -0.22, s * 1.0], m([0.24, 0.26, 0.30], { spec: 0.3 }), { anim: st => ({ rot: [0, (st.walk == null ? (st.idle || 0) : st.walk) * 12.6, 0] }) }));
      out.push(P('cyl', [0.2, 0.3, 0.2], [0.1, -0.18, s * 1.0], m(C.metalD)));
      out.push(cylX(0.8, 0.11, [0.85, -0.12, s * 0.45], m(C.gun), { anim: recoil(0.14) })); }
      out.push(P('box', [0.7, 0.1, 0.4], [-0.45, 0.28, 0], TEAM)); return out; } }),
  // A flying gun platform: a wide flat ring with the barrel hanging through the middle of it, pointing
  // down. Nothing else in the air here is a disc, and the barrel below the hull is what says "this
  // shoots the ground and nothing else".
  liberator: () => RIG.ship({ alt: 0.3, body: 'box', bodySize: [1.5, 0.5, 1.3], color: [0.46, 0.50, 0.55], cockpit: false, engines: [[-0.85, 0, -0.5], [-0.85, 0, 0.5]],
    extra: r => [P('cyl', [2.5, 0.18, 2.4], [0, -0.12, 0], m([0.34, 0.37, 0.42], { spec: 0.45 })), P('cyl', [1.7, 0.1, 1.65], [0, 0.02, 0], m(C.metalD)),
      P('cyl', [0.6, 0.7, 0.6], [0.1, -0.45, 0], m(C.gun), { anim: recoil(0.3) }), P('cyl', [0.8, 0.14, 0.8], [0.1, -0.82, 0], m(C.metalD)),
      P('box', [0.8, 0.1, 0.45], [-0.35, 0.3, 0], TEAM), P('sphere', [0.22, 0.18, 0.22], [0.75, 0.25, 0], GLOW(C.visor)),
      ...[-1, 1].map(s => P('box', [0.3, 0.5, 0.24], [-0.2, 0.35, s * 0.95], m(C.metalD)))] }),
  // The two Viking modes, and the thing that makes them read as ONE unit in two states rather than as
  // two units: both are built from the same fuselage and the same twin nacelles, and only the wings
  // and the legs change. In the air the nacelles are swept back and there are no legs; on the ground
  // the nacelles have rotated upright into shoulders and four legs have come down out of them. A
  // player who has seen one transform once can read the other at a glance.
  viking: () => RIG.ship({ bodySize: [2.2, 0.5, 0.8], color: [0.50, 0.54, 0.58], cockpit: C.visor, wings: { len: 1.2, span: 1.25, sweep: 0.85, x: -0.35 }, engines: [[-1.1, 0, -0.55], [-1.1, 0, 0.55]],
    extra: r => { const out = []; for (const s of [-1, 1]) { out.push(cylX(1.5, 0.28, [-0.15, -0.05, s * 0.78], m([0.38, 0.42, 0.47], { spec: 0.5 })));
      out.push(cylX(0.9, 0.1, [1.0, -0.05, s * 0.78], m(C.gun), { anim: recoil(0.18) })); } out.push(P('box', [0.7, 0.1, 0.4], [-0.5, 0.3, 0], TEAM)); return out; } }),
  viking_a: () => { const root = N([0, 0, 0]);
    // Four short legs folded out of the nacelles. Splayed wide so the footprint is square from above,
    // which is the fastest way to say "landed" next to the fighter's long thin arrowhead.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = N([sx * 0.45, 0.72, sz * 0.72], { anim: swing(0.22, sx > 0 ? 0 : Math.PI, sz) });
      leg.children.push(P('cyl', [0.15, 0.5, 0.15], [sx * 0.12, -0.25, sz * 0.1], m(C.metalD), { rot: [-sz * 0.3, 0, -sx * 0.3] }), P('box', [0.34, 0.12, 0.28], [sx * 0.25, -0.5, sz * 0.2], m(C.metalD))); root.children.push(leg); }
    const body = N([0, 1.0, 0], { anim: recoil(0.14) }); root.children.push(body);
    body.children.push(P('sphere', [1.7, 0.5, 0.8], [0, 0, 0], m([0.50, 0.54, 0.58], { spec: 0.5 })), P('sphere', [0.5, 0.25, 0.4], [0.6, 0.2, 0], GLOW(C.visor)), P('box', [0.6, 0.1, 0.4], [-0.4, 0.28, 0], TEAM));
    // the nacelles, now standing upright as shoulders with the guns pointing forward over them
    for (const s of [-1, 1]) { const sh = N([-0.1, 0.15, s * 0.72], { anim: recoil(0.24) });
      sh.children.push(P('cyl', [0.44, 1.1, 0.44], [0, 0.35, 0], m([0.38, 0.42, 0.47], { spec: 0.5 })), cylX(1.3, 0.13, [0.75, 0.75, 0], m(C.gun)), P('sphere', [0.14, 0.14, 0.14], [0, 0.95, 0], GLOW([1, 0.55, 0.2]))); body.children.push(sh); }
    return root; },
  // A dropship with a lit medical bay. It has to be told apart from the dropship it is descended from
  // at a glance, so: the same twin-engine hull, a full-length glowing window strip down both flanks,
  // and a raised white cross housing on the roof. Lit-and-white against the dropship's flat grey.
  medivac: () => RIG.ship({ bodySize: [2.1, 0.8, 1.35], color: [0.72, 0.74, 0.76], cockpit: C.visor, engines: [[-0.7, 0.1, -0.9], [-0.7, 0.1, 0.9]],
    extra: r => { const out = [P('box', [1.0, 0.35, 0.4], [-0.3, 0, -0.95], m(C.metalD)), P('box', [1.0, 0.35, 0.4], [-0.3, 0, 0.95], m(C.metalD)),
      P('box', [0.9, 0.4, 0.75], [-0.1, 0.5, 0], m(C.white, { spec: 0.35 })), P('box', [0.62, 0.1, 0.16], [-0.1, 0.72, 0], GLOW(C.red)), P('box', [0.18, 0.1, 0.5], [-0.1, 0.72, 0], GLOW(C.red))];
      for (const s of [-1, 1]) out.push(P('box', [1.5, 0.16, 0.06], [0.1, 0.05, s * 0.68], GLOW([0.55, 0.9, 1])));
      out.push(P('box', [0.55, 0.1, 0.34], [-0.95, 0.42, 0], TEAM)); return out; } }),
  // Not a second science vessel, and it must not look like one. The vessel is a saucer; the raven is a
  // narrow spine hung with four sensor booms that stick out past the hull in a cross. Spidery where the
  // vessel is solid.
  raven: () => RIG.ship({ alt: 0.35, bodySize: [1.5, 0.6, 0.55], color: [0.36, 0.40, 0.46], cockpit: [0.6, 1, 0.8], engines: [[-0.8, 0, 0]], engineColor: [0.5, 1, 0.75],
    extra: r => { const out = []; for (let k = 0; k < 4; k++) { const a = k * 1.5708 + 0.785;
      out.push(cylX(1.5, 0.06, [Math.cos(a) * 0.75, 0.05, Math.sin(a) * 0.75], m(C.metalL, { spec: 0.5 }), { rot: [0, -a, -Math.PI / 2] }));
      out.push(P('sphere', [0.16, 0.16, 0.16], [Math.cos(a) * 1.45, 0.05, Math.sin(a) * 1.45], GLOW([0.45, 1, 0.7]))); }
      out.push(P('box', [0.55, 0.1, 0.34], [-0.35, 0.34, 0], TEAM), P('cyl', [0.34, 0.5, 0.34], [-0.15, 0.42, 0], m(C.metalD)), P('sphere', [0.22, 0.22, 0.22], [-0.15, 0.72, 0], GLOW([0.45, 1, 0.7]))); return out; } }),
  // The MULE. Deliberately a machine rather than a man: it is an SCV silhouette with the cab removed
  // and a hopper bolted on, so it reads as "an SCV that is not an SCV" -- which is exactly what it is
  // for seventy-five seconds. Team-coloured, because a MULE on a shared mineral line has to be
  // attributable at a glance.
  mule: () => { const r = N([0, 0, 0]);
    for (const s of [-1, 1]) r.children.push(P('cyl', [0.5, 0.3, 0.5], [-0.2, 0.25, s * 0.5], m(C.tread), { rot: [Math.PI / 2, 0, 0] }));
    r.children.push(P('box', [1.3, 0.5, 0.9], [0, 0.55, 0], m([0.55, 0.5, 0.35], { spec: 0.4 })), P('wedge', [0.7, 0.5, 0.85], [-0.75, 0.6, 0], m([0.4, 0.36, 0.26])), P('box', [0.5, 0.1, 0.6], [-0.15, 0.82, 0], TEAM));
    for (const s of [-1, 1]) { const arm = N([0.55, 0.5, s * 0.42], { anim: lunge(0.2) }); arm.children.push(cylX(0.85, 0.13, [0.4, 0, 0], m(C.metalD)), P('box', [0.3, 0.22, 0.26], [0.85, -0.05, 0], m(C.metalL))); r.children.push(arm); }
    r.children.push(P('sphere', [0.22, 0.2, 0.22], [0.55, 0.85, 0], GLOW([1, 0.75, 0.3])));
    return r; },
};

// ---------------- buildings (tile units; footprint centred at origin) ----------------
// Running lights. The complaint was that buildings and units are short of colour and of anything that
// glows, and it is fair: outside the Protoss the only emissive parts in the game were weapon muzzles
// and Zerg eyes. Real 90s RTS structures were covered in blinking strip lights and lit panels, and
// they cost nothing here -- a GLOW material is unlit, so it is one flat-shaded primitive.
//
// `lights` lays a row down each long side of a footprint at a given height; `beacon` is a single
// larger lamp for a roof. Both are deterministic in position so nothing crawls between frames.
const lights = (w, h, y, col, n) => {
  const out = []; const count = n || Math.max(2, Math.floor(w));
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const x = -w / 2 + 0.45 + t * (w - 0.9);
    for (const sd of [-1, 1]) out.push(P('sphere', [0.075, 0.055, 0.075], [x, y, sd * (h / 2 - 0.18)], GLOW(col)));
  }
  return out;
};
const beacon = (x, z, y, col, r = 0.13) => P('sphere', [r, r * 0.8, r], [x, y, z], GLOW(col));

const B = {
  terranBase(w, h, o = {}) { const root = N([0, 0, 0]); const ht = o.height || 0.6; const steel = [0.47, 0.52, 0.6], steelD = [0.3, 0.34, 0.4], roof = [0.6, 0.65, 0.72];
    root.children.push(P('box', [w - 0.05, 0.14, h - 0.05], [0, 0.07, 0], m(steelD)), P('box', [w - 0.25, ht - 0.1, h - 0.25], [0, ht / 2, 0], m(steel, { spec: 0.45 })), P('box', [w - 0.35, 0.1, h - 0.35], [0, ht, 0], m(roof, { spec: 0.5 })), P('box', [0.9, 0.04, 0.22], [-w / 2 + 0.65, ht + 0.06, -h / 2 + 0.35], TEAM), P('box', [w - 0.5, 0.03, 0.05], [0, ht + 0.06, 0], m(steelD)), P('box', [0.05, 0.03, h - 0.6], [0, ht + 0.06, 0], m(steelD)));
    for (let i = 0; i < Math.floor(w); i++) { root.children.push(P('box', [0.4, 0.22, 0.06], [-w / 2 + 0.5 + i, ht * 0.4, h / 2 - 0.1], m(C.dark)), P('box', [0.06, 0.06, 0.06], [-w / 2 + 0.5 + i, ht + 0.1, h / 2 - 0.35], GLOW([1, 0.8, 0.4]))); }
    for (let j = 0; j < Math.floor(h); j++) root.children.push(P('box', [0.06, ht * 0.5, 0.35], [w / 2 - 0.12, ht * 0.45, -h / 2 + 0.5 + j], m(steelD)));
    // amber strip lights down both long sides, and a red hazard beacon on the roof corner
    for (const L of lights(w, h, (o.height || 0.5) + 0.30, [1, 0.72, 0.28])) root.children.push(L);
    root.children.push(beacon(-w / 2 + 0.42, -h / 2 + 0.42, (o.height || 0.5) + 0.52, [1, 0.25, 0.18]));
    return root; },
  // A Zerg building was two smooth domes with five bumps on it, which is a potato. What is missing is
  // everything that says "grown": ribs of plate radiating off the crown, a crest of spines, cords of
  // sinew running down into the creep, and a maw. Same reasoning as RIG.bug's carapace -- the hard
  // edge of plate against the soft curve is what reads as chitin -- and every Zerg structure is built
  // on this one function, so they all gain it together.
  zergMound(w, h, o = {}) {
    const root = N([0, 0, 0]); const ht = o.height || 0.7;
    root.children.push(P('dome', [w - 0.1, ht * 2, h - 0.1], [0, 0, 0], m(o.color || [0.47, 0.34, 0.37], { spec: 0.25 })),
      P('dome', [w * 0.55, ht * 1.6, h * 0.55], [-w * 0.1, ht * 0.3, -h * 0.1], m([0.56, 0.42, 0.44])));
    // radial ribs: plates laid over the shoulder of the dome, alternating tone so the segments read
    const ribs = o.ribs == null ? 7 : o.ribs;
    for (let k = 0; k < ribs; k++) {
      const a = (k / ribs) * Math.PI * 2 + 0.3, rr = 0.40;
      root.children.push(P('wedge', [w * 0.17, ht * 0.42, h * 0.30],
        [Math.cos(a) * w * rr, ht * 0.62, Math.sin(a) * h * rr],
        m(k % 2 ? C.carapace : C.carapaceD, { spec: 0.55 }), { rot: [0, -a, -0.42] }));
    }
    for (let k = 0; k < 5; k++) root.children.push(P('sphere', [0.3, 0.25, 0.3], [Math.cos(k * 1.3) * w * 0.38, ht * 0.5 + Math.sin(k) * 0.1, Math.sin(k * 1.3) * h * 0.38], m(C.carapaceD)));
    // crest, tallest at the middle
    const crest = o.crest == null ? 5 : o.crest;
    for (let k = 0; k < crest; k++) { const t = crest === 1 ? 0.5 : k / (crest - 1); const len = ht * (0.55 + 0.7 * Math.sin(Math.PI * t));
      root.children.push(P('cone', [0.11, len, 0.11], [(t - 0.5) * w * 0.72, ht * 1.15, -h * 0.06], m(C.bone, { spec: 0.4 }), { rot: [0, 0, (t - 0.5) * 0.7] })); }
    // a maw: recessed, dark, and the one place a Zerg building looks like it opens
    root.children.push(P('sphere', [w * 0.20, ht * 0.34, h * 0.20], [w * 0.20, ht * 0.72, h * 0.24], m([0.12, 0.05, 0.10], { spec: 0.1 })));
    root.children.push(P('sphere', [0.6, 0.25, 0.5], [0, ht * 1.05, 0], TEAM));
    // sinew: cords running off the base into the creep, thicker at the top
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.4;
      root.children.push(P('cyl', [0.10, 0.8, 0.10], [Math.cos(a) * (w / 2 + 0.12), 0.16, Math.sin(a) * (h / 2 + 0.12)], m(C.fleshD),
        { rot: [Math.sin(a) * 1.35, 0, -Math.cos(a) * 1.35] })); }
    // nodules clustered where the mound meets the ground
    for (let k = 0; k < 4; k++) { const a = k * 1.7 + 1.1;
      root.children.push(P('sphere', [0.22, 0.18, 0.22], [Math.cos(a) * w * 0.46, 0.14, Math.sin(a) * h * 0.46], m(C.flesh, { spec: 0.45 }))); }
    // bioluminescence: a few lit nodes in the carapace, sickly green rather than lamp-coloured
    for (let k = 0; k < 5; k++) { const a = k * 1.27 + 0.6; root.children.push(P('sphere', [0.085, 0.065, 0.085], [Math.cos(a) * w * 0.30, ht * 0.86, Math.sin(a) * h * 0.30], GLOW(C.toxin))); }
    return root;
  },
  // A Protoss building was two boxes and a strip of team colour, which is the least interesting thing
  // any of the three races had. Protoss is not industrial -- it is ceremonial: stepped stone, ornate
  // trim, and energy that is visibly *running through* the structure rather than bolted to it. Every
  // Protoss building is built on this, so all of them gain it together.
  protossSlab(w, h, o = {}) {
    const root = N([0, 0, 0]); const ht = o.height || 0.5;
    // plinth, with a lighter chamfer course on top of it so the base has an edge that catches light
    root.children.push(P('box', [w - 0.1, 0.22, h - 0.1], [0, 0.11, 0], m(C.goldD, { spec: 0.5 })));
    root.children.push(P('box', [w - 0.28, 0.07, h - 0.28], [0, 0.25, 0], m(C.goldL, { spec: 0.7 })));
    // stepped tiers: three courses, each inset and shorter, which is the whole silhouette
    const tiers = o.tiers == null ? 3 : o.tiers;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers, inset = 0.5 + t * (Math.min(w, h) * 0.30);
      root.children.push(P('box', [w - inset, ht * (0.62 - 0.15 * i), h - inset],
        [0, 0.29 + ht * (0.32 * i + 0.31), 0], m(i % 2 ? C.gold : C.goldD, { spec: 0.62 })));
    }
    // psi conduit: a glowing seam running the full width at the first step, so the energy reads as
    // being inside the building. This is the single biggest thing separating Protoss from Terran gold.
    root.children.push(P('box', [w - 0.62, 0.06, 0.10], [0, 0.42, h / 2 - 0.34], GLOW(C.psi)));
    root.children.push(P('box', [w - 0.62, 0.06, 0.10], [0, 0.42, -h / 2 + 0.34], GLOW(C.psi)));
    root.children.push(P('box', [0.10, 0.06, h - 0.62], [w / 2 - 0.34, 0.42, 0], GLOW(C.psi)));
    root.children.push(P('box', [0.10, 0.06, h - 0.62], [-w / 2 + 0.34, 0.42, 0], GLOW(C.psi)));
    // corner pylons, each capped with a lit crystal
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = sx * (w / 2 - 0.34), pz = sz * (h / 2 - 0.34);
      root.children.push(P('cyl', [0.13, ht * 0.95, 0.13], [px, 0.28 + ht * 0.47, pz], m(C.goldD, { spec: 0.6 })));
      root.children.push(P('oct', [0.19, 0.28, 0.19], [px, 0.30 + ht * 1.06, pz], GLOW(C.psi)));
    }
    // the floating crystal: nothing else in the game has a part that does not touch the ground, and
    // that alone says "these people do not build the way the other two do"
    root.children.push(P('oct', [0.30, 0.46, 0.30], [0, 0.34 + ht * 1.55, 0], GLOW(o.coreColor || C.psi),
      { anim: st => ({ pos: [0, 0.06 * IDLE(st), 0], rot: [0, (st.idle || 0) * 6.283, 0] }) }));
    root.children.push(P('box', [w - 0.3, 0.05, 0.18], [0, 0.27, h / 2 - 0.2], TEAM));
    return root;
  },
  dome: (x, z, r, y, mat) => P('dome', [r * 2, r * 1.4, r * 2], [x, y, z], mat || m(C.metalL, { spec: 0.5 })),
  tower: (x, z, w, hgt, y, mat) => P('box', [w, hgt, w], [x, y + hgt / 2, z], mat || m(C.metalD)),
  post: (x, z, hgt, y) => P('cyl', [0.12, hgt, 0.12], [x, y + hgt / 2, z], m(C.metalD)),
  crystal: (x, z, s, y, col) => P('oct', [s, s * 1.6, s], [x, y + s * 0.8, z], GLOW(col || C.psi)),
  spike: (x, z, hgt, y, tilt = 0) => P('cone', [0.25, hgt, 0.25], [x, y + hgt / 2, z], m(C.bone), { rot: [0, 0, tilt] }),
  geyserBase: (w, h) => [P('cyl', [w - 0.2, 0.15, h - 0.2], [0, 0.07, 0], m(C.rock)), P('cyl', [1.6, 0.2, 1.1], [0.9, 0.15, 0], GLOW(C.gas))],
};
const BUILDINGS = {
  command_center: (w, h) => { const r = B.terranBase(w, h, { height: 0.8 }); r.children.push(B.dome(0, -0.2, 1.0, 0.8), B.tower(-1.4, 0, 0.7, 0.5, 0.8), B.tower(1.4, 0, 0.7, 0.5, 0.8), B.post(0, -0.2, 0.6, 1.4), P('box', [0.7, 0.05, 0.3], [0.2, 2.0, -0.2], m(C.metalL))); return r; },
  supply_depot: (w, h) => { const r = B.terranBase(w, h, { height: 0.35 }); for (let k = 0; k < 3; k++) r.children.push(P('cyl', [0.7, 0.45, 0.7], [-1 + k, 0.55, 0], m(C.metalL, { spec: 0.5 }))); return r; },
  refinery: (w, h) => { const r = N([0, 0, 0]); r.children.push(...B.geyserBase(w, h)); const base = B.terranBase(2.0, h, { height: 0.7 }); base.pos = [-1.0, 0, 0]; r.children.push(base, P('cyl', [0.9, 0.9, 0.9], [-1.0, 1.1, -0.2], m(C.metalD)), cylX(2.0, 0.18, [0.4, 0.5, -0.3], m(C.metalL)), cylX(2.0, 0.18, [0.4, 0.5, 0.3], m(C.metalL))); return r; },
  // ---- Terran building silhouettes ---------------------------------------------------------------
  // M8 did this to the infantry and never got to the buildings, which left one race as grey boxes in
  // two sizes. Barracks, factory, starport, science facility and engineering bay are all 4x3, all the
  // same slab off `terranBase`, all lit identically, and what told them apart was a bump on the roof
  // about six pixels across. At 40 px under fog with a team tint that is nothing, and picking the
  // factory out of an enemy base is how you decide what is about to come at you.
  //
  // Same rule as the marines: one deliberately oversized feature each, chosen to break the outline
  // seen from directly overhead, because that is the only angle this game is ever seen from. Three
  // things survive the fog -- round against square, tall against flat, and anything that hangs past
  // the footprint edge -- and paint is not one of them.
  //
  // The vertical budget was there all along and unspent: bake.js already reserves 72 px of canvas
  // above the footprint (`T`) and nothing was using more than a third of it. Two constraints to keep
  // if these are edited. Horizontal overhang has 18 px (`M`) and no more, so about half a tile. And
  // anything that covers the roof covers `terranBase`'s team-colour patch with it -- every building
  // below that grew a roof carries a replacement TEAM part somewhere the new structure cannot hide.
  barracks: (w, h) => { const r = B.terranBase(w, h, { height: 0.8 });
    // a barrel-vault hangar roof down the full length: the only curve-along-X in the Terran set, so
    // the barracks is the one with a round back
    r.children.push(cylX(w - 0.7, 1.45, [0.05, 0.95, -0.15], m([0.53, 0.58, 0.66], { spec: 0.5 })));
    for (const s of [-1, 1]) r.children.push(P('cyl', [1.5, 0.1, 1.5], [s * (w - 0.7) / 2 + 0.05, 0.95, -0.15], m([0.34, 0.37, 0.43]), { rot: [0, 0, -Math.PI / 2] }));
    // and a drop ramp folded down past the front edge, which is the bit that hangs off the outline
    r.children.push(P('wedge', [0.55, 0.42, 1.6], [0.2, 0.2, h / 2 + 0.18], m(C.metalD), { rot: [0, Math.PI, 0] }), P('box', [1.4, 0.7, 0.1], [0.2, 0.35, h / 2 - 0.05], m(C.dark)));
    r.children.push(B.tower(-1.45, -0.75, 0.7, 0.6, 0.8), P('box', [0.62, 0.08, 0.42], [-1.45, 1.42, -0.75], TEAM), P('sphere', [0.26, 0.26, 0.26], [0.05, 1.75, -0.15], TEAM)); return r; },
  engineering_bay: (w, h) => { const r = B.terranBase(w, h, { height: 0.7 });
    // A crane boom on a counterweighted mast, hanging half a tile past the front edge. The first try
    // here was a big dish, and it had to be thrown away for a reason worth writing down: this camera
    // is an OBLIQUE projection, not a perspective one -- ground z maps to screen y at a flat 0.85 --
    // so a disc projects as a circle whatever angle it is tilted at, and the starport's landing pad is
    // already a circle. Two big discs is one silhouette, not two. A long thin diagonal that crosses
    // the outline is the only shape in the Terran set that is neither a block nor a disc.
    r.children.push(B.tower(-1.35, 0.3, 0.7, 0.8, 0.7), P('box', [0.58, 0.08, 0.4], [-1.35, 1.55, 0.3], TEAM));
    r.children.push(P('box', [0.34, 1.5, 0.34], [-0.15, 1.45, -0.5], m([0.4, 0.43, 0.48], { spec: 0.4 })), P('box', [0.5, 0.34, 0.5], [-0.15, 2.25, -0.5], m(C.metalD)),
      P('box', [0.2, 0.2, 3.4], [0.35, 2.2, 0.42], m(C.metalL, { spec: 0.55 }), { rot: [0, 0.42, 0.1] }),
      P('box', [0.42, 0.42, 0.5], [-0.55, 2.05, -0.95], m(C.metalD)), P('cyl', [0.06, 1.0, 0.06], [1.05, 1.55, 1.55], m(C.metalD)), P('box', [0.3, 0.24, 0.34], [1.05, 1.0, 1.55], m(C.metalD)),
      beacon(-0.15, -0.5, 2.5, [1, 0.3, 0.2], 0.11)); return r; },
  academy: (w, h) => { const r = B.terranBase(w, h, { height: 0.6 }); for (let k = 0; k < 3; k++) r.children.push(B.post(-0.8 + k * 0.8, -0.35, 0.9, 0.6));
    // a lit slanted frontage and one needle spire with two rings: thin and tall where the armory next
    // to it is fat and low, which is the pair most often confused
    r.children.push(P('box', [1.35, 0.1, h - 0.55], [0.62, 1.02, 0.1], m([0.36, 0.5, 0.62], { spec: 0.75 }), { rot: [0, 0, 0.6] }), P('box', [0.9, 0.08, h - 0.9], [0.5, 1.16, 0.1], GLOW([0.35, 0.8, 1]), { rot: [0, 0, 0.6] }));
    r.children.push(P('cyl', [0.15, 2.3, 0.15], [-1.15, 1.75, 0.45], m(C.metalL, { spec: 0.5 })), P('cyl', [0.6, 0.09, 0.6], [-1.15, 2.35, 0.45], m(C.metalD)), P('cyl', [0.42, 0.09, 0.42], [-1.15, 2.62, 0.45], m(C.metalD)), beacon(-1.15, 0.45, 2.88, [0.4, 1, 0.6], 0.11), P('box', [0.5, 0.08, 0.34], [0.95, 0.68, -0.62], TEAM)); return r; },
  missile_turret: (w, h) => { const r = N([0, 0, 0]); r.children.push(P('cyl', [1.6, 0.3, 1.6], [0, 0.15, 0], m(C.metalD)), P('cyl', [0.7, 0.8, 0.7], [0, 0.7, 0], m(C.metal)), P('box', [0.9, 0.35, 0.6], [0.2, 1.25, 0], m(C.metalD)), P('box', [0.5, 0.1, 0.5], [-0.3, 0.32, 0], TEAM)); for (const s of [-1, 1]) r.children.push(cylX(0.6, 0.12, [0.6, 1.3, s * 0.18], m(C.red))); return r; },
  bunker: (w, h) => { const r = B.terranBase(w, h, { height: 0.55 }); for (let k = 0; k < 3; k++) r.children.push(P('box', [0.5, 0.15, 0.08], [-0.9 + k * 0.9, 0.35, h / 2 - 0.06], m(C.dark)));
    // a heavy turtle shell over the whole footprint with four corner buttresses: a low round lump,
    // deliberately the opposite of every other Terran building, because the structure you most need to
    // identify at a glance is the one shooting at you
    r.children.push(P('dome', [w - 0.4, 1.3, h - 0.25], [0, 0.5, 0], m([0.44, 0.47, 0.53], { spec: 0.35 })));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) r.children.push(P('box', [0.44, 0.8, 0.44], [dx * (w / 2 - 0.4), 0.4, dz * (h / 2 - 0.34)], m(C.metalD)));
    r.children.push(P('box', [0.7, 0.09, 0.4], [-0.15, 1.16, 0], TEAM), P('box', [1.2, 0.3, 0.8], [0, 0.85, -0.2], m(C.metalD))); return r; },
  factory: (w, h) => { const r = B.terranBase(w, h, { height: 0.9 }); r.children.push(P('box', [1.8, 0.8, 0.1], [0, 0.4, h / 2 - 0.05], m(C.dark)));
    // twin flared smokestacks and a gantry rail on legs: two vertical pins and one hard horizontal
    // line, which is a shape nothing else in the game makes and reads at any zoom
    for (const s of [-1, 1]) r.children.push(P('cyl', [0.44, 1.9, 0.44], [-1.3, 1.85, s * 0.55], m([0.33, 0.35, 0.4], { spec: 0.3 })), P('cyl', [0.66, 0.2, 0.66], [-1.3, 2.85, s * 0.55], m(C.metalD)), beacon(-1.3, s * 0.55, 3.02, [1, 0.35, 0.2], 0.1));
    r.children.push(P('box', [0.16, 1.05, 0.16], [0.95, 1.42, -h / 2 + 0.45], m(C.metalD)), P('box', [0.16, 1.05, 0.16], [0.95, 1.42, h / 2 - 0.45], m(C.metalD)),
      P('box', [0.34, 0.18, h - 0.6], [0.95, 2.0, 0], m(C.metalL, { spec: 0.5 })), P('box', [0.5, 0.36, 0.5], [0.95, 1.74, 0.35], m(C.metalD)), P('box', [0.46, 0.08, 0.36], [0.95, 2.13, -0.75], TEAM)); return r; },
  starport: (w, h) => { const r = B.terranBase(w, h, { height: 0.6 });
    // the landing pad is wider than the building and stands off the roof on four pillars. A circle
    // pushing past the rectangle on both sides is the only cue here that survives with half the
    // building under fog -- and the pad's centre marking is the team colour, which is both the
    // readable place for it and where a helipad marking belongs.
    r.children.push(P('cyl', [w * 1.02, 0.2, h * 1.14], [0.3, 1.12, 0], m([0.29, 0.32, 0.37], { spec: 0.4 })), P('cyl', [w * 0.74, 0.1, h * 0.84], [0.3, 1.24, 0], m([0.44, 0.47, 0.52], { spec: 0.5 })), P('cyl', [w * 0.34, 0.07, h * 0.4], [0.3, 1.3, 0], TEAM));
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) r.children.push(P('cyl', [0.2, 0.6, 0.2], [0.3 + dx * 1.1, 0.75, dz * 0.9], m(C.metalD)));
    r.children.push(B.tower(-1.55, -h / 2 + 0.55, 0.5, 1.9, 0.6), P('box', [0.5, 0.2, 0.5], [-1.55, 2.05, -h / 2 + 0.55], GLOW(C.visor)), cylX(1.15, 0.12, [-1.55, 2.55, -h / 2 + 0.55], m(C.metalL)), beacon(-1.55, -h / 2 + 0.55, 2.72, [0.4, 1, 0.5], 0.12));
    for (let k = 0; k < 8; k++) r.children.push(P('sphere', [0.1, 0.1, 0.1], [0.3 + Math.cos(k * 0.785) * (w * 0.44), 1.27, Math.sin(k * 0.785) * (h * 0.5)], GLOW([1, 0.85, 0.4]))); return r; },
  science_facility: (w, h) => { const r = B.terranBase(w, h, { height: 0.7 });
    // one enormous observatory dome on a drum, taking most of the roof and rising higher than anything
    // else Terran builds. Round-on-square at twice the size of the old one, with four raked struts
    // that break the corners of the rectangle underneath it.
    r.children.push(P('cyl', [2.35, 0.42, 2.15], [-0.1, 0.9, 0], m([0.35, 0.38, 0.44], { spec: 0.4 })), P('dome', [2.5, 1.85, 2.3], [-0.1, 1.11, 0], m([0.46, 0.6, 0.74], { spec: 0.8 })),
      P('cyl', [0.9, 0.14, 0.9], [-0.1, 2.0, 0], m(C.metalD)), beacon(-0.1, 0, 2.18, [0.5, 0.95, 1], 0.14));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) r.children.push(P('cyl', [0.13, 1.6, 0.13], [-0.1 + dx * 1.45, 1.15, dz * (h / 2 - 0.35)], m(C.metalL, { spec: 0.5 }), { rot: [dz * 0.22, 0, -dx * 0.26] }));
    r.children.push(P('box', [0.55, 0.08, 0.38], [1.5, 0.78, -h / 2 + 0.45], TEAM)); return r; },
  armory: (w, h) => { const r = B.terranBase(w, h, { height: 0.6 });
    // two fat ordnance tanks lying the length of the roof with bolted end caps: a double-barrel hump,
    // low and wide, against the academy's needle. Both are 3x2 and they were the closest pair.
    for (const s of [-1, 1]) r.children.push(cylX(w - 0.65, 0.92, [0.05, 1.02, s * 0.48], m([0.5, 0.52, 0.48], { spec: 0.5 })),
      P('cyl', [1.0, 0.12, 1.0], [(w - 0.65) / 2 + 0.05, 1.02, s * 0.48], m(C.metalD), { rot: [0, 0, -Math.PI / 2] }),
      P('cyl', [1.0, 0.12, 1.0], [-(w - 0.65) / 2 + 0.05, 1.02, s * 0.48], m(C.metalD), { rot: [0, 0, -Math.PI / 2] }));
    r.children.push(P('box', [0.2, 1.15, 0.2], [-1.0, 1.68, 0], m(C.metalD)), cylX(1.0, 0.13, [-0.5, 2.2, 0], m(C.metalL)), P('cyl', [0.1, 0.45, 0.1], [-0.05, 1.95, 0], m(C.metalD)), P('box', [0.34, 0.3, 0.3], [-0.05, 1.6, 0], m(C.metalD)), P('box', [0.5, 0.09, 0.3], [1.0, 1.53, 0], TEAM)); return r; },
  comsat_station: (w, h) => { const r = B.terranBase(w, h, { height: 0.5 }); r.children.push(B.post(0, 0, 0.5, 0.5), P('cyl', [1.0, 0.08, 1.0], [0.1, 1.1, 0], m(C.metalL), { rot: [0.7, 0, 0] })); return r; },
  nuclear_silo: (w, h) => { const r = B.terranBase(w, h, { height: 0.5 }); r.children.push(B.dome(0, 0, 0.7, 0.5, m(C.metalD)), P('box', [1.0, 0.08, 0.12], [0, 0.85, 0.3], m(C.red))); return r; },
  machine_shop: (w, h) => { const r = B.terranBase(w, h, { height: 0.5 }); r.children.push(P('cyl', [0.6, 0.3, 0.6], [-0.3, 0.65, 0], m(C.metalD)), P('cyl', [0.4, 0.4, 0.4], [0.35, 0.7, -0.2], m(C.metalD))); return r; },
  control_tower: (w, h) => { const r = B.terranBase(w, h, { height: 0.5 }); r.children.push(B.tower(0, 0, 0.6, 1.2, 0.5), P('sphere', [0.2, 0.2, 0.2], [0, 1.8, 0], GLOW(C.red))); return r; },
  physics_lab: (w, h) => { const r = B.terranBase(w, h, { height: 0.5 }); r.children.push(B.dome(0, 0, 0.6, 0.5, GLOW(C.visor))); return r; },
  covert_ops: (w, h) => { const r = B.terranBase(w, h, { height: 0.5 }); r.children.push(P('box', [1.3, 0.35, 0.9], [0, 0.67, 0], m(C.dark)), P('sphere', [0.15, 0.15, 0.15], [0.3, 0.9, 0.3], GLOW(C.red))); return r; },
  hatchery: (w, h) => { const r = B.zergMound(w, h, { height: 0.8 }); r.children.push(P('cyl', [1.3, 0.2, 0.9], [0.3, 0.3, 0.7], m([0.15, 0.06, 0.12])), P('sphere', [1.2, 0.6, 1.0], [-0.3, 1.2, -0.3], m([0.64, 0.5, 0.5]))); return r; },
  lair: (w, h) => { const r = B.zergMound(w, h, { height: 1.0 }); r.children.push(P('cyl', [1.4, 0.2, 1.0], [0.3, 0.3, 0.7], m([0.15, 0.06, 0.12]))); for (let k = 0; k < 5; k++) r.children.push(B.spike(-1.2 + k * 0.6, -0.4, 0.9 + (k % 2) * 0.3, 1.0, (k - 2) * 0.15)); return r; },
  hive: (w, h) => { const r = B.zergMound(w, h, { height: 1.2, color: [0.5, 0.33, 0.4] }); r.children.push(P('cyl', [1.6, 0.2, 1.1], [0.3, 0.3, 0.7], m([0.15, 0.06, 0.12]))); for (let k = 0; k < 7; k++) r.children.push(B.spike(-1.5 + k * 0.5, -0.5 + (k % 2) * 0.4, 1.0 + (k % 3) * 0.3, 1.2, (k - 3) * 0.12)); return r; },
  creep_colony: (w, h) => B.zergMound(w, h, { height: 0.45 }),
  sunken_colony: (w, h) => { const r = B.zergMound(w, h, { height: 0.5 }); r.children.push(P('cyl', [0.9, 0.2, 0.7], [0, 0.55, 0], m([0.15, 0.06, 0.12]))); return r; },
  spore_colony: (w, h) => { const r = B.zergMound(w, h, { height: 0.5 }); for (const [dx, dz] of [[-0.4, -0.2], [0.35, -0.35], [0, 0.35]]) r.children.push(P('sphere', [0.5, 0.5, 0.5], [dx, 0.7, dz], m(C.zgreen, { spec: 0.5 })), P('sphere', [0.15, 0.15, 0.15], [dx - 0.1, 0.9, dz - 0.1], GLOW(C.toxin))); return r; },
  extractor: (w, h) => { const r = N([0, 0, 0]); r.children.push(...B.geyserBase(w, h)); const md = B.zergMound(2.6, h, { height: 0.7 }); md.pos = [-0.7, 0, 0]; r.children.push(md, P('cyl', [0.8, 0.5, 0.8], [-0.7, 0.9, -0.2], m([0.15, 0.06, 0.12])), P('sphere', [0.3, 0.3, 0.3], [-0.7, 1.1, -0.2], GLOW(C.gas))); return r; },
  spawning_pool: (w, h) => { const r = B.zergMound(w, h, { height: 0.4 }); r.children.push(P('cyl', [2.0, 0.15, 1.3], [0, 0.45, 0.1], m([0.2, 0.42, 0.2])), P('cyl', [1.2, 0.12, 0.8], [-0.2, 0.5, 0.05], GLOW([0.45, 0.8, 0.35])), B.spike(0.9, -0.3, 0.6, 0.4, -0.3)); return r; },
  evolution_chamber: (w, h) => { const r = B.zergMound(w, h, { height: 0.6 }); for (const dx of [-0.6, 0, 0.6]) r.children.push(P('sphere', [0.35, 0.35, 0.35], [dx, 0.8, 0.1], m([0.15, 0.06, 0.12])), P('sphere', [0.15, 0.15, 0.15], [dx, 0.85, 0.2], GLOW(C.eye))); return r; },
  hydralisk_den: (w, h) => { const r = B.zergMound(w, h, { height: 0.6 }); for (let k = 0; k < 5; k++) r.children.push(B.spike(-0.9 + k * 0.45, 0.1, 0.8 + (k % 2) * 0.3, 0.55, (k - 2) * 0.2)); return r; },
  spire: (w, h) => { const r = B.zergMound(w, h, { height: 0.45 }); r.children.push(P('cone', [1.0, 2.4, 1.0], [0, 1.4, 0], m([0.42, 0.3, 0.38])), P('cone', [0.4, 1.2, 0.4], [0.15, 2.4, 0.1], m([0.6, 0.45, 0.5]))); return r; },
  greater_spire: (w, h) => { const r = B.zergMound(w, h, { height: 0.5 }); r.children.push(P('cone', [1.2, 3.0, 1.2], [0, 1.7, 0], m([0.36, 0.25, 0.32])), P('cone', [0.5, 1.5, 0.5], [0.15, 3.0, 0.1], m([0.6, 0.45, 0.5])), P('sphere', [0.3, 0.3, 0.3], [0, 3.5, 0], TEAM)); return r; },
  queens_nest: (w, h) => { const r = B.zergMound(w, h, { height: 0.6 }); r.children.push(P('sphere', [1.2, 0.7, 0.9], [0, 0.75, 0], m([0.42, 0.3, 0.38])), P('sphere', [0.6, 0.35, 0.45], [0, 1.0, 0], m([0.78, 0.63, 0.72]))); return r; },
  ultralisk_cavern: (w, h) => { const r = B.zergMound(w, h, { height: 0.7 }); r.children.push(P('cyl', [1.5, 0.3, 1.0], [0, 0.7, 0.2], m([0.12, 0.06, 0.1])), B.spike(-1.0, -0.2, 1.0, 0.6, 0.4), B.spike(1.0, -0.2, 1.0, 0.6, -0.4)); return r; },
  defiler_mound: (w, h) => { const r = B.zergMound(w, h, { height: 0.5 }); for (const dx of [-1.2, 0, 1.2]) r.children.push(P('sphere', [0.55, 0.4, 0.5], [dx, 0.6, 0], m([0.23, 0.17, 0.28]))); r.children.push(P('sphere', [0.8, 0.35, 0.6], [0, 0.9, -0.3], m([0.55, 0.35, 0.6]))); return r; },
  nydus_canal: (w, h) => { const r = B.zergMound(w, h, { height: 0.5 }); r.children.push(P('cyl', [1.0, 0.3, 0.8], [0, 0.55, 0], m([0.12, 0.06, 0.1]))); for (let k = 0; k < 6; k++) r.children.push(B.spike(Math.cos(k * 1.05) * 0.6, Math.sin(k * 1.05) * 0.5, 0.45, 0.5, -Math.cos(k * 1.05) * 0.6)); return r; },
  infested_command_center: (w, h) => { const r = BUILDINGS.command_center(w, h); r.children.push(P('sphere', [3.0, 0.6, 2.0], [0, 0.9, 0], m([0.45, 0.25, 0.42]))); return r; },
  nexus: (w, h) => { const r = B.protossSlab(w, h, { height: 0.6 }); for (const [dx, dz] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.8], [1.4, 0.8]]) r.children.push(P('cyl', [0.5, 0.8, 0.5], [dx, 0.6, dz], m(C.goldD)), B.crystal(dx, dz, 0.3, 1.0)); r.children.push(P('cyl', [1.4, 0.5, 1.4], [0, 1.1, -0.1], m(C.goldD, { spec: 0.6 })), P('cyl', [1.0, 0.3, 1.0], [0, 1.5, -0.1], m(C.navy)), B.crystal(0, -0.1, 0.7, 1.6)); return r; },
  pylon: (w, h) => { const r = N([0, 0, 0]); r.children.push(P('cyl', [1.6, 0.25, 1.4], [0, 0.12, 0], m(C.goldD, { spec: 0.5 })), P('cyl', [1.0, 0.2, 0.9], [0, 0.35, 0], m(C.gold)), P('oct', [0.8, 1.9, 0.8], [0, 1.3, 0], GLOW(C.psi)), P('box', [0.6, 0.06, 0.15], [0, 0.42, 0.5], TEAM)); return r; },
  assimilator: (w, h) => { const r = N([0, 0, 0]); r.children.push(...B.geyserBase(w, h)); const s = B.protossSlab(2.0, h, { height: 0.5 }); s.pos = [-1.0, 0, 0]; r.children.push(s, P('cyl', [0.9, 0.7, 0.9], [-1.0, 1.1, -0.2], m(C.goldD)), B.crystal(-1.0, -0.2, 0.3, 1.45), cylX(2.0, 0.22, [0.4, 0.45, 0], m(C.gold))); return r; },
  gateway: (w, h) => { const r = B.protossSlab(w, h, { height: 0.4 }); r.children.push(P('box', [0.5, 1.6, 0.5], [-1.2, 1.4, -0.2], m(C.goldD, { spec: 0.5 })), P('box', [0.5, 1.6, 0.5], [1.2, 1.4, -0.2], m(C.goldD, { spec: 0.5 })), P('box', [2.9, 0.4, 0.5], [0, 2.3, -0.2], m(C.goldD, { spec: 0.5 })), P('box', [2.0, 1.3, 0.12], [0, 1.4, -0.2], GLOW([0.2, 0.4, 0.8])), B.crystal(-1.2, -0.2, 0.25, 2.5), B.crystal(1.2, -0.2, 0.25, 2.5)); return r; },
  forge: (w, h) => { const r = B.protossSlab(w, h, { height: 0.5 }); r.children.push(P('cyl', [1.2, 0.5, 1.2], [0, 1.0, 0], m(C.goldD)), P('cyl', [0.7, 0.2, 0.7], [0, 1.3, 0], GLOW(C.orange)), B.crystal(-1.0, -0.4, 0.22, 0.75), B.crystal(1.0, -0.4, 0.22, 0.75)); return r; },
  photon_cannon: (w, h) => { const r = N([0, 0, 0]); r.children.push(P('cyl', [1.7, 0.3, 1.5], [0, 0.15, 0], m(C.goldD, { spec: 0.5 })), P('cyl', [1.0, 0.5, 1.0], [0, 0.55, 0], m(C.gold)), P('oct', [0.7, 1.3, 0.7], [0, 1.3, 0], GLOW(C.psi)), P('box', [0.6, 0.06, 0.15], [0, 0.45, 0.5], TEAM)); return r; },
  cybernetics_core: (w, h) => { const r = B.protossSlab(w, h, { height: 0.5 }); r.children.push(P('cyl', [1.1, 0.6, 1.1], [0, 1.05, 0], m(C.goldD)), P('sphere', [0.7, 0.7, 0.7], [0, 1.5, 0], m(C.navy)), P('sphere', [0.35, 0.35, 0.35], [0, 1.5, 0], GLOW(C.psi))); for (let k = 0; k < 4; k++) r.children.push(P('box', [0.8, 0.08, 0.15], [Math.cos(k * 1.57 + 0.78) * 0.9, 1.35, Math.sin(k * 1.57 + 0.78) * 0.8], m(C.goldL), { rot: [0, -(k * 1.57 + 0.78), 0] })); return r; },
  shield_battery: (w, h) => { const r = B.protossSlab(w, h, { height: 0.4 }); r.children.push(P('sphere', [1.6, 0.5, 1.2], [0, 0.85, 0], m(C.goldD)), P('sphere', [1.0, 0.3, 0.7], [0, 1.05, 0], m(C.navy)), P('sphere', [0.5, 0.2, 0.4], [0, 1.15, 0], GLOW(C.psi))); return r; },
  robotics_facility: (w, h) => { const r = B.protossSlab(w, h, { height: 0.6 }); r.children.push(P('box', [2.2, 0.5, 1.2], [0, 1.1, 0], m(C.goldD)), P('cyl', [0.7, 0.3, 0.7], [0, 1.5, 0], m(C.navy)), P('box', [2.4, 0.08, 0.15], [0, 1.4, -0.5], m(C.goldL))); return r; },
  stargate: (w, h) => { const r = B.protossSlab(w, h, { height: 0.4 }); r.children.push(P('cyl', [2.6, 0.25, 2.6], [0, 1.4, 0], m(C.goldD, { spec: 0.5 }), { rot: [Math.PI / 2, 0, 0] }), P('cyl', [2.0, 0.1, 2.0], [0, 1.4, 0], GLOW([0.2, 0.4, 0.8]), { rot: [Math.PI / 2, 0, 0] }), P('box', [0.5, 1.4, 0.4], [-1.3, 0.9, 0], m(C.goldD)), P('box', [0.5, 1.4, 0.4], [1.3, 0.9, 0], m(C.goldD)), B.crystal(0, -0.3, 0.3, 2.7)); return r; },
  citadel_of_adun: (w, h) => { const r = B.protossSlab(w, h, { height: 0.5 }); r.children.push(P('cone', [1.4, 2.0, 1.2], [0, 1.6, 0], m(C.goldD, { spec: 0.5 })), B.crystal(0, 0, 0.3, 2.5)); return r; },
  robotics_support_bay: (w, h) => { const r = B.protossSlab(w, h, { height: 0.5 }); r.children.push(P('box', [2.0, 0.5, 1.2], [0, 1.0, 0], m(C.goldD)), P('sphere', [0.6, 0.6, 0.6], [-0.5, 1.35, 0], m(C.navy)), P('sphere', [0.6, 0.6, 0.6], [0.5, 1.35, 0], m(C.navy))); return r; },
  fleet_beacon: (w, h) => { const r = B.protossSlab(w, h, { height: 0.5 }); r.children.push(P('cyl', [1.6, 0.5, 1.6], [0, 1.0, 0], m(C.goldD)), B.crystal(0, 0, 0.6, 1.25)); for (let k = 0; k < 3; k++) r.children.push(B.crystal(-1.0 + k, 0.7, 0.2, 0.75)); return r; },
  templar_archives: (w, h) => { const r = B.protossSlab(w, h, { height: 0.5 }); r.children.push(P('box', [1.6, 1.0, 1.2], [0, 1.25, 0], m(C.goldD)), B.crystal(0, 0, 0.45, 1.75, C.violet), B.crystal(-1.2, -0.3, 0.22, 0.75, C.violet), B.crystal(1.2, -0.3, 0.22, 0.75, C.violet)); return r; },
  observatory: (w, h) => { const r = B.protossSlab(w, h, { height: 0.4 }); r.children.push(P('cyl', [1.1, 0.5, 1.1], [0, 0.9, 0], m(C.goldD)), P('sphere', [0.6, 0.6, 0.6], [0, 1.3, 0], m(C.navy)), P('cyl', [0.1, 1.2, 0.1], [0.4, 1.7, -0.3], m(C.goldL), { rot: [0.5, 0, -0.6] })); return r; },
  arbiter_tribunal: (w, h) => { const r = B.protossSlab(w, h, { height: 0.5 }); r.children.push(P('oct', [2.0, 1.2, 1.6], [0, 1.2, 0], m(C.goldD, { spec: 0.6 })), B.crystal(0, 0, 0.35, 1.7)); return r; },
  // THE WARP GATE (M12 item 12). It shares the Gateway's 4x3 footprint -- a morph must, because
  // G.morphBuilding never re-blocks the map -- so the only thing that can tell a player which one they
  // are looking at is the SHAPE, and the two are deliberately opposites. A Gateway is a vertical arch
  // you walk out of: two uprights, a lintel, a lit panel standing on end. A Warp Gate is a horizontal
  // ring lying flat on the plinth, because nothing walks out of it -- it is an aperture pointing at
  // the sky, and the thing it makes appears somewhere else entirely.
  warp_gate: (w, h) => {
    const r = B.protossSlab(w, h, { height: 0.4, coreColor: [0.55, 0.7, 1] });
    r.children.push(P('cyl', [3.0, 0.24, 2.2], [0, 1.0, -0.1], m(C.goldD, { spec: 0.66 })),
      P('cyl', [2.4, 0.12, 1.7], [0, 1.16, -0.1], GLOW([0.35, 0.6, 1]), { anim: st => ({ rot: [0, (st.idle || 0) * 6.283, 0] }) }),
      P('cyl', [1.2, 0.1, 0.9], [0, 1.26, -0.1], GLOW([0.8, 0.92, 1])));
    for (let k = 0; k < 4; k++) { const a = k * 1.5708 + 0.785; r.children.push(P('cyl', [0.22, 1.0, 0.22], [Math.cos(a) * 1.25, 0.55, -0.1 + Math.sin(a) * 0.9], m(C.goldD, { spec: 0.6 }), { rot: [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22] })); }
    r.children.push(B.crystal(-1.5, -0.1, 0.28, 1.6), B.crystal(1.5, -0.1, 0.28, 1.6));
    return r;
  },
  // ============================ M11 ADDITIONS ============================
  // Thirteen buildings and three units shipped this milestone with no MODEL, which meant no baked
  // sheet, which meant js/sprites.js fell through to the flat vector painter for every one of them.
  // Next to fifty baked neighbours they read as cut-outs, and that is exactly how it was reported:
  // "why do all the new buildings look 2d". Nothing was wrong with the painters -- the painters are
  // the fallback, and the fallback was all these ever had.
  //
  // Each of these keeps the silhouette contract its 2D painter already states, because that is the
  // thing that has to survive fog, a team tint and forty pixels: the hospital is the one with a light
  // on it, the jammer is the one with something pointed at the sky, and a wall has NO silhouette above
  // the roofline at all -- a wall that looked like a building would be clicked like one.

  // ---- Terran ------------------------------------------------------------------------------------
  aid_station: (w, h) => {
    const r = B.terranBase(w, h, { height: 0.5 });
    // the lit cross, raised on its own housing so it clears the roof line and reads from any facing
    r.children.push(P('box', [1.0, 0.5, 0.9], [0, 0.75, 0], m(C.white, { spec: 0.35 })));
    r.children.push(P('box', [0.62, 0.10, 0.16], [0, 1.02, -0.46], GLOW(C.red)));
    r.children.push(P('box', [0.18, 0.10, 0.52], [0, 1.02, -0.46], GLOW(C.red)));
    // two bays with lit interiors, and a green ready lamp on a short post
    for (const s of [-1, 1]) {
      r.children.push(P('box', [0.7, 0.42, 0.5], [s * (w / 2 - 0.55), 0.71, h / 2 - 0.4], m(C.metalD)));
      r.children.push(P('box', [0.5, 0.22, 0.06], [s * (w / 2 - 0.55), 0.71, h / 2 - 0.15], GLOW(C.visor)));
    }
    r.children.push(B.post(-w / 2 + 0.45, -h / 2 + 0.45, 0.6, 0.5),
      P('sphere', [0.16, 0.16, 0.16], [-w / 2 + 0.45, 1.16, -h / 2 + 0.45], GLOW([0.29, 0.82, 0.42])));
    return r;
  },
  scrambler_mast: (w, h) => {
    const r = B.terranBase(w, h, { height: 0.45 });
    // A lattice mast: four legs and cross-bracing, because a solid pole bakes as a grey stick and the
    // gaps are what make it read as an aerial rather than as a chimney.
    const y0 = 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      r.children.push(P('cyl', [0.07, 1.5, 0.07], [sx * 0.22, y0 + 0.75, sz * 0.22], m(C.metalD), { rot: [sz * 0.06, 0, -sx * 0.06] }));
    for (let k = 0; k < 4; k++) {
      const y = y0 + 0.25 + k * 0.36;
      r.children.push(P('box', [0.5, 0.05, 0.05], [0, y, -0.2], m(C.metal), { rot: [0, 0, 0.5] }));
      r.children.push(P('box', [0.5, 0.05, 0.05], [0, y, 0.2], m(C.metal), { rot: [0, 0, -0.5] }));
    }
    // the dish, tilted at the sky, and a hazard beacon above it
    r.children.push(P('dome', [0.85, 0.34, 0.85], [0, y0 + 1.55, 0], m(C.metalL, { spec: 0.55 }), { rot: [0, 0, 0.35] }));
    r.children.push(P('cyl', [0.09, 0.3, 0.09], [0, y0 + 1.5, 0], m(C.gun)));
    r.children.push(P('sphere', [0.15, 0.15, 0.15], [0, y0 + 1.85, 0], GLOW(C.red)));
    r.children.push(P('box', [0.5, 0.3, 0.4], [-w / 2 + 0.45, 0.65, h / 2 - 0.4], m(C.metalD)));
    return r;
  },
  // A WALL. Deliberately the flattest thing in the game: an armoured berm barely taller than the
  // ground clutter, so it never competes with a real building for the eye or for a click.
  blast_barricade: (w, h) => {
    const r = N([0, 0, 0]);
    r.children.push(P('box', [w - 0.12, 0.34, h - 0.12], [0, 0.17, 0], m([0.30, 0.33, 0.37], { spec: 0.3 })));
    r.children.push(P('box', [w - 0.34, 0.14, h - 0.34], [0, 0.40, 0], m([0.44, 0.48, 0.54], { spec: 0.45 })));
    // hazard chevrons along the face, alternating so the stripe reads at a distance
    for (let k = 0; k < 4; k++)
      r.children.push(P('box', [0.28, 0.07, 0.1], [-w / 2 + 0.45 + k * 0.42, 0.44, -h / 2 + 0.14], m(k % 2 ? [0.88, 0.70, 0.16] : C.dark), { rot: [0, 0, 0] }));
    // squat corner bollards: the only thing above the berm, and only just
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      r.children.push(P('cyl', [0.16, 0.30, 0.16], [sx * (w / 2 - 0.28), 0.45, sz * (h / 2 - 0.28)], m(C.metalD)));
    r.children.push(P('box', [w - 0.6, 0.05, 0.14], [0, 0.49, h / 2 - 0.24], TEAM));
    return r;
  },
  mending_pool: (w, h) => {    const r = B.zergMound(w, h, { height: 0.45, color: [0.42, 0.32, 0.38] });    r.children.push(P('cyl', [w * 0.52, 0.14, h * 0.52], [0, 0.42, 0], m([0.34, 0.24, 0.30])));    r.children.push(P('cyl', [w * 0.42, 0.10, h * 0.42], [0, 0.50, 0], GLOW([0.42, 0.86, 0.68])));    for (let k = 0; k < 5; k++) {      const a = k * 1.256 + 0.3, cx = Math.cos(a) * w * 0.34, cz = Math.sin(a) * h * 0.34;      r.children.push(P('cyl', [0.11, 0.55, 0.11], [cx, 0.55, cz], m(C.fleshD), { rot: [cz * 0.5, 0, -cx * 0.5] }));      r.children.push(P('sphere', [0.17, 0.17, 0.17], [cx * 0.55, 0.82, cz * 0.55], m(C.flesh)));    }    r.children.push(P('sphere', [0.22, 0.22, 0.22], [0, 0.88, 0], GLOW([0.62, 0.95, 0.80])));    return r;  },  miasma_gland: (w, h) => {    const r = B.zergMound(w, h, { height: 0.5, color: [0.38, 0.28, 0.42] });    r.children.push(P('sphere', [w * 0.62, 0.95, h * 0.62], [0, 0.70, 0], m([0.44, 0.34, 0.52], { spec: 0.3 })));    r.children.push(P('sphere', [w * 0.30, 0.42, h * 0.30], [-0.12, 0.95, -0.10], m([0.60, 0.48, 0.68])));    for (let k = 0; k < 4; k++) {      const a = k * 1.571 + 0.6, cx = Math.cos(a) * 0.42, cz = Math.sin(a) * 0.36;      r.children.push(P('cone', [0.20, 0.55, 0.20], [cx, 1.05, cz], m(C.carapaceD), { rot: [cz * 0.8, 0, -cx * 0.8] }));    }    r.children.push(P('sphere', [0.20, 0.20, 0.20], [0, 1.30, 0], GLOW([0.78, 0.62, 0.90])));    return r;  },  // The Zerg wall: a chitin RIDGE, so it is long and low rather than round. A dome at 2x2 is a ball,
  // and a ball is what a creep colony is -- this has to read as something you walk along, not up to.
  carapace_ridge: (w, h) => {
    const r = N([0, 0, 0]);
    r.children.push(P('box', [w - 0.15, 0.30, h * 0.62], [0, 0.15, 0], m([0.30, 0.21, 0.27], { spec: 0.2 })));
    // three overlapping plates along the length, each a squashed dome, so the top is a scalloped
    // armour line instead of one smooth curve
    for (let k = 0; k < 3; k++) {
      const x = -w / 2 + 0.42 + k * (w - 0.84) / 2;
      r.children.push(P('dome', [0.86, 0.34, h * 0.72], [x, 0.26, 0], m(k % 2 ? [0.46, 0.33, 0.38] : [0.38, 0.26, 0.32], { spec: 0.28 })));
    }
    r.children.push(P('box', [w - 0.4, 0.08, h * 0.30], [0, 0.44, -0.05], m([0.52, 0.40, 0.44])));
    // bone spurs leaning out over the front edge: short, and the only thing that breaks the top line
    for (let k = 0; k < 5; k++) {
      const x = -w / 2 + 0.32 + k * (w - 0.64) / 4;
      r.children.push(P('cone', [0.13, 0.40, 0.13], [x, 0.40, -h * 0.28], m(C.bone), { rot: [-0.75, 0, (k % 2 ? 0.18 : -0.18)] }));
    }
    r.children.push(P('sphere', [0.34, 0.10, 0.22], [0, 0.36, h * 0.26], TEAM));
    return r;
  },
  // ---- M12 wave four: the four new Zerg structures ----------------------------------------------
  // A burrow with a lip round it, and five spines leaning inward over the hole. Reads as a den rather
  // than as another mound, which matters because it sits on the Basic page next to five other mounds.
  roach_warren: (w, h) => {
    const r = B.zergMound(w, h, { height: 0.5, color: [0.44, 0.31, 0.30], crest: 3, ribs: 6 });
    r.children.push(P('cyl', [w * 0.46, 0.20, h * 0.46], [0.1, 0.52, 0.1], m([0.14, 0.06, 0.10], { spec: 0.1 })));
    r.children.push(P('cyl', [w * 0.58, 0.14, h * 0.58], [0.1, 0.44, 0.1], m(C.carapaceD, { spec: 0.5 })));
    for (let k = 0; k < 5; k++) { const a = k * 1.256 + 0.4; r.children.push(P('cone', [0.16, 0.7, 0.16], [0.1 + Math.cos(a) * w * 0.32, 0.6, 0.1 + Math.sin(a) * h * 0.32], m(C.bone), { rot: [-Math.sin(a) * 1.0, 0, Math.cos(a) * 1.0] })); }
    return r;
  },
  // A pit: the mound is inverted into a dark bowl with three sacs bubbling in it, so the one Zerg
  // building that is a HOLE looks like a hole from directly overhead.
  infestation_pit: (w, h) => {
    const r = B.zergMound(w, h, { height: 0.42, color: [0.36, 0.40, 0.30], crest: 4 });
    r.children.push(P('cyl', [w * 0.66, 0.18, h * 0.66], [0, 0.40, 0], m([0.12, 0.16, 0.10], { spec: 0.1 })));
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5, cx = Math.cos(a) * w * 0.20, cz = Math.sin(a) * h * 0.20;
      r.children.push(P('sphere', [0.42, 0.34, 0.42], [cx, 0.52, cz], m([0.44, 0.58, 0.32], { spec: 0.35 })));
      r.children.push(P('sphere', [0.15, 0.15, 0.15], [cx, 0.68, cz], GLOW([0.62, 0.98, 0.42]))); }
    return r;
  },
  // One tile. Everything on this has to survive being drawn 32 px across, so it is one low blister,
  // one glowing membrane and three short roots -- nothing that would turn into mush at that size.
  creep_tumour: (w, h) => {
    const r = N([0, 0, 0]);
    r.children.push(P('dome', [w * 0.92, 0.34, h * 0.92], [0, 0, 0], m([0.42, 0.28, 0.34], { spec: 0.3 })));
    r.children.push(P('sphere', [w * 0.40, 0.20, h * 0.40], [0, 0.24, 0], GLOW([0.72, 0.42, 0.68])));
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.6;
      r.children.push(P('cyl', [0.07, 0.42, 0.07], [Math.cos(a) * w * 0.42, 0.08, Math.sin(a) * h * 0.42], m(C.fleshD), { rot: [Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3] })); }
    r.children.push(P('sphere', [0.22, 0.08, 0.16], [0, 0.32, 0], TEAM));
    return r;
  },
  // Deliberately NOT a nydus canal in a different colour: a canal is a ringed pit, this is a head that
  // has come up through the floor. Two people have to be able to tell the hub from a mouth at a glance
  // to know which end of the network they are looking at.
  nydus_worm: (w, h) => {
    const r = N([0, 0, 0]);
    r.children.push(P('cyl', [w * 0.94, 0.16, h * 0.94], [0, 0.08, 0], m([0.34, 0.22, 0.28], { spec: 0.25 })));
    r.children.push(P('sphere', [w * 0.60, 1.15, h * 0.60], [0, 0.62, 0], m(C.carapace, { spec: 0.45 })));
    r.children.push(P('sphere', [w * 0.34, 0.42, h * 0.34], [0, 1.10, 0], m([0.13, 0.06, 0.10], { spec: 0.1 })));
    for (let k = 0; k < 6; k++) { const a = k * 1.047 + 0.3;
      r.children.push(P('cone', [0.14, 0.62, 0.14], [Math.cos(a) * w * 0.26, 1.02, Math.sin(a) * h * 0.26], m(C.bone), { rot: [Math.sin(a) * 0.85, 0, -Math.cos(a) * 0.85] })); }
    r.children.push(P('sphere', [0.4, 0.12, 0.28], [0, 0.24, h * 0.30], TEAM));
    return r;
  },
  rejuvenation_shrine: (w, h) => {    const r = B.protossSlab(w, h, { height: 0.42, tiers: 2, coreColor: [0.49, 1.0, 0.82] });    for (let k = 0; k < 6; k++) {      const a = k * 1.047 + 0.5;      r.children.push(B.crystal(Math.cos(a) * (w * 0.28), Math.sin(a) * (h * 0.26), 0.20, 0.62, [0.49, 1.0, 0.82]));    }    r.children.push(P('cyl', [w * 0.44, 0.06, h * 0.44], [0, 0.60, 0], m(C.goldL, { spec: 0.7 })));    return r;  },  null_obelisk: (w, h) => {    const r = B.protossSlab(w, h, { height: 0.38, tiers: 2, coreColor: C.violet });    r.children.push(P('oct', [0.42, 2.0, 0.42], [0, 1.35, 0], m([0.16, 0.12, 0.22], { spec: 0.55 })));    r.children.push(P('oct', [0.16, 1.5, 0.16], [0, 1.40, 0], GLOW(C.violet)));    r.children.push(P('oct', [0.24, 0.34, 0.24], [0, 2.45, 0], GLOW([0.78, 0.62, 1.0]),      { anim: st => ({ pos: [0, 0.05 * IDLE(st), 0], rot: [0, (st.idle || 0) * 6.283, 0] }) }));    for (const s of [-1, 1]) r.children.push(B.crystal(s * (w / 2 - 0.5), 0, 0.16, 0.52, [0.35, 0.24, 0.50]));    return r;  },  // The Protoss wall. Darker gold than a shrine and with a dark skirt under it, because the first
  // version was pale cream on pale cream and washed out to a flat card at any distance -- gold needs
  // something dark beneath it to read as metal rather than as paper.
  warded_bastion: (w, h) => {
    const r = N([0, 0, 0]);
    r.children.push(P('box', [w - 0.08, 0.16, h - 0.08], [0, 0.08, 0], m([0.20, 0.16, 0.09])));
    r.children.push(P('box', [w - 0.24, 0.24, h - 0.24], [0, 0.26, 0], m(C.goldD, { spec: 0.55 })));
    r.children.push(P('box', [w - 0.5, 0.08, h - 0.5], [0, 0.42, 0], m(C.gold, { spec: 0.7 })));
    // the ward: an upright pane, bright, and the only thing above the plinth
    r.children.push(P('box', [w - 0.85, 0.42, 0.06], [0, 0.67, 0], GLOW([0.38, 0.83, 1.0])));
    r.children.push(P('box', [w - 0.85, 0.05, 0.14], [0, 0.90, 0], m(C.goldL, { spec: 0.75 })));
    for (const s of [-1, 1]) {
      r.children.push(P('cyl', [0.17, 0.62, 0.17], [s * (w / 2 - 0.3), 0.61, 0], m(C.goldD, { spec: 0.6 })));
      r.children.push(P('oct', [0.19, 0.28, 0.19], [s * (w / 2 - 0.3), 1.02, 0], GLOW(C.psi)));
    }
    r.children.push(P('box', [w - 1.0, 0.05, 0.13], [0, 0.47, h / 2 - 0.2], TEAM));
    return r;
  },
  // Dirt and chitin, and deliberately NOT Zerg purple: this belongs to the map, not to a player. It is
  // modelled already open, because by the time anything draws it, it is -- while it is buried the map
  // shows the `vent` tell instead, and the structure only appears once the thing has surfaced.
  carrion_warren: (w, h) => {
    const r = N([0, 0, 0]);
    r.children.push(P('dome', [w - 0.1, 0.85, h - 0.1], [0, 0, 0], m([0.32, 0.27, 0.20], { spec: 0.15 })));
    r.children.push(P('dome', [w * 0.62, 0.62, h * 0.62], [-0.15, 0.10, -0.10], m([0.40, 0.34, 0.25])));
    // the mouth: a dark shaft ringed with chitin plates
    r.children.push(P('cyl', [0.86, 0.30, 0.76], [0.15, 0.62, 0.10], m([0.20, 0.16, 0.13])));
    r.children.push(P('cyl', [0.60, 0.34, 0.54], [0.15, 0.70, 0.10], m([0.06, 0.05, 0.04])));
    for (let k = 0; k < 7; k++) {
      const a = k * 0.897 + 0.2;
      r.children.push(P('cone', [0.17, 0.40, 0.17], [0.15 + Math.cos(a) * 0.50, 0.72, 0.10 + Math.sin(a) * 0.45],
        m(C.bone), { rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] }));
    }
    // spent husks around the rim, and a couple of breathing vents
    for (let k = 0; k < 3; k++) {
      r.children.push(P('sphere', [0.34, 0.20, 0.28], [-w / 2 + 0.55 + k * 0.5, 0.48, h / 2 - 0.42], m([0.46, 0.40, 0.30])));
    }
    for (const s of [-1, 1]) {
      r.children.push(P('cyl', [0.20, 0.26, 0.20], [s * (w / 2 - 0.5), 0.52, -h / 2 + 0.45], m([0.24, 0.20, 0.16])));
    }
    return r;
  },
  // The foundry is 4x3 -- the biggest thing in the neutral set -- and the first version was one tall
  // box, which from a 50-degree camera is a wall and nothing else. It is TWO masses now, at different
  // heights with the roof gone between them, so the ruin is in the outline rather than in the texture,
  // and a dark skirt keeps the base off the ground the way B.terranBase does for every Terran building.
  derelict_foundry: (w, h) => {
    const r = N([0, 0, 0]);
    r.children.push(P('box', [w - 0.1, 0.14, h - 0.1], [0, 0.07, 0], m([0.17, 0.16, 0.14])));
    const iw = w * 0.52;
    // the standing half
    r.children.push(P('box', [iw, 0.62, h - 0.3], [-w / 2 + iw / 2 + 0.08, 0.45, 0], m([0.33, 0.31, 0.27], { spec: 0.25 })));
    r.children.push(P('box', [iw - 0.18, 0.10, h - 0.5], [-w / 2 + iw / 2 + 0.08, 0.81, 0], m([0.41, 0.39, 0.34])));
    for (let k = 0; k < 3; k++) {
      r.children.push(P('box', [0.09, 0.09, h - 0.55], [-w / 2 + 0.45 + k * (iw - 0.5) / 2, 0.90, 0], m([0.26, 0.25, 0.22])));
    }
    // the collapsed half: lower, tipped, and open to the sky
    const cw = w * 0.36;
    r.children.push(P('box', [cw, 0.34, h - 0.4], [w / 2 - cw / 2 - 0.12, 0.31, 0.05], m([0.29, 0.27, 0.24]), { rot: [0, 0, -0.06] }));
    r.children.push(P('box', [cw * 0.7, 0.08, h - 0.7], [w / 2 - cw / 2 - 0.2, 0.52, 0.1], m([0.34, 0.32, 0.28]), { rot: [0.16, 0, -0.30] }));
    // girders standing where the roof used to span, leaning at different angles
    for (let k = 0; k < 4; k++) {
      r.children.push(P('box', [0.07, 0.70 - k * 0.09, 0.07], [w * 0.04 + k * 0.17, 0.62, -h / 2 + 0.4 + k * 0.34], m([0.36, 0.22, 0.13]), { rot: [0.10 + k * 0.05, 0, 0.14 - k * 0.07] }));
    }
    // the snapped chimney, and a cold casting bay in the standing half
    r.children.push(P('cyl', [0.36, 1.05, 0.36], [-w / 2 + 0.72, 1.35, -h / 2 + 0.75], m([0.27, 0.25, 0.22]), { rot: [0, 0, 0.09] }));
    r.children.push(P('cyl', [0.40, 0.11, 0.40], [-w / 2 + 0.67, 1.90, -h / 2 + 0.75], m([0.13, 0.12, 0.11])));
    r.children.push(P('box', [1.05, 0.44, 0.12], [-w * 0.22, 0.40, h / 2 - 0.17], m([0.05, 0.05, 0.05])));
    // rubble spilling past the footprint on the collapsed side
    for (let k = 0; k < 6; k++) {
      r.children.push(P('oct', [0.22 + (k % 3) * 0.09, 0.18 + (k % 2) * 0.06, 0.20], [w / 2 - 0.1 - k * 0.26, 0.12, -h / 2 + 0.12 + k * 0.24], m([0.31, 0.29, 0.26])));
    }
    r.children.push(P('box', [0.85, 0.05, 0.13], [-w * 0.24, 0.80, h / 2 - 0.32], TEAM));
    return r;
  },
  derelict_archive: (w, h) => {
    const r = N([0, 0, 0]);
    r.children.push(P('box', [w - 0.1, 0.12, h - 0.1], [0, 0.06, 0], m([0.16, 0.16, 0.15])));
    r.children.push(P('box', [w - 0.3, 0.46, h - 0.28], [0, 0.35, 0], m([0.28, 0.28, 0.27], { spec: 0.25 })));
    // roof gone over the near third, tipped in
    r.children.push(P('box', [w * 0.60, 0.09, h - 0.45], [-w * 0.16, 0.62, 0], m([0.36, 0.36, 0.33]), { rot: [0.05, 0, -0.04] }));
    r.children.push(P('box', [w * 0.24, 0.07, h - 0.6], [w * 0.30, 0.50, 0.08], m([0.31, 0.31, 0.28]), { rot: [0.22, 0, 0.34] }));
    // the broken dish, big and leaning hard: this is the whole silhouette
    r.children.push(P('cyl', [0.11, 0.95, 0.11], [w / 2 - 0.75, 1.02, 0.05], m([0.30, 0.28, 0.25]), { rot: [0, 0, 0.40] }));
    r.children.push(P('dome', [1.25, 0.42, 1.25], [w / 2 - 1.15, 1.50, 0.05], m([0.34, 0.33, 0.30]), { rot: [0, 0.3, 1.25] }));
    r.children.push(P('cyl', [0.10, 0.34, 0.10], [w / 2 - 0.95, 1.42, 0.05], m([0.20, 0.19, 0.18]), { rot: [0, 0, 0.9] }));
    // dead rack stacks, visible through the missing roof
    for (let k = 0; k < 3; k++)
      r.children.push(P('box', [0.20, 0.40, 0.62], [-w / 2 + 0.55 + k * 0.44, 0.70, -0.05], m([0.19, 0.19, 0.20])));
    for (let k = 0; k < 4; k++)
      r.children.push(P('oct', [0.19, 0.15, 0.17], [-w / 2 + 0.35 + k * 0.52, 0.09, h / 2 - 0.16], m([0.29, 0.28, 0.26])));
    r.children.push(P('box', [0.78, 0.05, 0.12], [-w * 0.16, 0.68, h / 2 - 0.28], TEAM));
    return r;
  },
  derelict_watchtower: (w, h) => {
    const r = N([0, 0, 0]);
    // The tall one, and the only derelict with real height -- it is the vision grant, so it should look
    // like the thing on the map you can see furthest from.
    r.children.push(P('box', [w - 0.35, 0.40, h - 0.35], [0, 0.20, 0], m([0.28, 0.27, 0.24], { spec: 0.2 })));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      r.children.push(P('cyl', [0.10, 1.65, 0.10], [sx * 0.35, 1.20, sz * 0.35], m([0.30, 0.22, 0.16]), { rot: [-sz * 0.05, 0, sx * 0.05] }));
    for (let k = 0; k < 3; k++) {
      const y = 0.55 + k * 0.5;
      r.children.push(P('box', [0.78, 0.05, 0.05], [0, y, -0.33], m([0.32, 0.24, 0.18]), { rot: [0, 0, 0.4] }));
      r.children.push(P('box', [0.78, 0.05, 0.05], [0, y, 0.33], m([0.32, 0.24, 0.18]), { rot: [0, 0, -0.4] }));
    }
    // the cabin, with one corner collapsed, and a dead sensor drum on top
    r.children.push(P('box', [1.05, 0.42, 0.95], [0, 2.15, 0], m([0.31, 0.30, 0.27]), { rot: [0, 0, 0.07] }));
    r.children.push(P('box', [0.55, 0.06, 0.9], [0.28, 2.36, 0], m([0.24, 0.23, 0.21]), { rot: [0, 0, -0.22] }));
    r.children.push(P('cyl', [0.42, 0.30, 0.42], [-0.05, 2.55, 0], m([0.22, 0.21, 0.19])));
    r.children.push(P('sphere', [0.14, 0.14, 0.14], [-0.05, 2.74, 0], m([0.10, 0.10, 0.10])));
    r.children.push(P('box', [0.7, 0.05, 0.12], [0, 2.38, 0.42], TEAM));
    return r;
  },

  // ---- M12 wave four: Terran structures ----------------------------------------------------------
  // Four of them, and three have a harder legibility problem than any building in the game so far,
  // because they must be told apart from a building the player ALREADY has on the same ground:
  //   * the Orbital Command and the Planetary Fortress are both a Command Center a second ago, and a
  //     player has to know which one an enemy expansion is before deciding to run at it
  //   * the Sensor Tower is 2x2 and sits next to a Scrambler Mast, which is also 2x2 and also a mast
  //   * the Reactor is a 2x2 add-on among four other 2x2 add-ons
  // So each is separated by SHAPE from the specific thing it will be confused with, not in general.

  // Command Center plus a parabolic dish the width of the building, tilted at the sky on a gimbal. It
  // keeps the CC's towers so the family reads, and the dish is the one part that is round and tilted --
  // which is what distinguishes it from the Fortress below, whose addition is square and flat.
  orbital_command: (w, h) => { const r = B.terranBase(w, h, { height: 0.8 });
    r.children.push(B.tower(-1.4, 0, 0.7, 0.5, 0.8), B.tower(1.4, 0, 0.7, 0.5, 0.8));
    r.children.push(P('cyl', [1.0, 0.5, 1.0], [0.1, 1.0, -0.1], m(C.metalD)), P('cyl', [0.16, 0.9, 0.16], [0.1, 1.6, -0.1], m(C.metalL, { spec: 0.5 })));
    r.children.push(P('dome', [2.6, 1.0, 2.4], [0.25, 2.05, -0.1], m([0.72, 0.76, 0.80], { spec: 0.7 }), { rot: [0, 0, 0.55] }),
      P('cyl', [0.12, 0.7, 0.12], [0.65, 2.15, -0.1], m(C.metalD), { rot: [0, 0, -0.55] }), P('sphere', [0.18, 0.18, 0.18], [0.95, 2.45, -0.1], GLOW([0.5, 0.9, 1])));
    r.children.push(P('box', [0.6, 0.06, 0.3], [-1.4, 1.35, 0], TEAM), beacon(-1.4, 0, 1.42, [0.4, 1, 0.6], 0.12));
    return r; },
  // The same Command Center, armoured instead. A sloped blast skirt that overhangs the footprint on
  // every side, four corner casemates and one heavy twin turret on the roof: all square, all low, and
  // the widest thing on the map at 4x3 -- so it is a squat block where the Orbital is a block with a
  // dish, and neither can be mistaken for a plain Command Center at any zoom.
  planetary_fortress: (w, h) => { const r = B.terranBase(w, h, { height: 0.7 });
    r.children.push(P('wedge', [w + 0.5, 0.4, h + 0.5], [0, 0.2, 0], m([0.34, 0.36, 0.33], { spec: 0.3 })));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) r.children.push(P('box', [0.75, 0.85, 0.75], [dx * (w / 2 - 0.5), 0.5, dz * (h / 2 - 0.42)], m([0.40, 0.42, 0.39], { spec: 0.35 })), P('box', [0.5, 0.16, 0.5], [dx * (w / 2 - 0.5), 0.98, dz * (h / 2 - 0.42)], m(C.metalD)));
    r.children.push(P('cyl', [1.5, 0.42, 1.5], [0, 0.95, 0], m([0.32, 0.35, 0.32])));
    const tur = N([0, 1.2, 0], { anim: recoil(0.2) }); r.children.push(tur);
    tur.children.push(P('box', [1.15, 0.55, 1.3], [0, 0.2, 0], m([0.44, 0.47, 0.44], { spec: 0.45 })), P('box', [0.7, 0.1, 0.5], [-0.35, 0.5, 0], TEAM));
    for (const s of [-1, 1]) tur.children.push(cylX(1.5, 0.17, [0.95, 0.2, s * 0.34], m(C.gun)), P('cyl', [0.26, 0.14, 0.26], [1.68, 0.2, s * 0.34], m(C.metalD), { rot: [0, 0, -Math.PI / 2] }));
    r.children.push(beacon(-w / 2 + 0.45, -h / 2 + 0.45, 1.1, [1, 0.25, 0.18], 0.12));
    return r; },
  // Against the Scrambler Mast, which is the building this must not be confused with. The mast is a
  // lattice with a DISH on top -- round, tilted, static. This is a lattice with a long horizontal
  // SEARCH BAR on top: a hard straight line crossing the whole 2x2 footprint and hanging past it on
  // both sides, spinning. Round versus straight, at the same height, on the same shaped tower.
  sensor_tower: (w, h) => { const r = B.terranBase(w, h, { height: 0.4 });
    const y0 = 0.45;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) r.children.push(P('cyl', [0.06, 1.9, 0.06], [sx * 0.26, y0 + 0.95, sz * 0.26], m(C.metalD), { rot: [sz * 0.05, 0, -sx * 0.05] }));
    for (let k = 0; k < 5; k++) { const y = y0 + 0.3 + k * 0.38;
      r.children.push(P('box', [0.56, 0.045, 0.045], [0, y, -0.24], m(C.metal), { rot: [0, 0, k % 2 ? 0.55 : -0.55] }));
      r.children.push(P('box', [0.56, 0.045, 0.045], [0, y, 0.24], m(C.metal), { rot: [0, 0, k % 2 ? -0.55 : 0.55] })); }
    // the search bar, turning. `idle` runs 0..1 round the loop, so one full revolution per idle cycle.
    const head = N([0, y0 + 2.0, 0], { anim: st => ({ rot: [0, (st.idle || 0) * 6.283, 0] }) });
    head.children.push(P('cyl', [0.3, 0.22, 0.3], [0, 0, 0], m(C.metalD)),
      P('box', [0.16, 0.1, 3.0], [0, 0.18, 0], m(C.metalL, { spec: 0.6 })),
      P('box', [0.34, 0.16, 0.6], [0, 0.3, 1.1], m(C.metalD)), P('box', [0.34, 0.16, 0.6], [0, 0.3, -1.1], m(C.metalD)),
      P('sphere', [0.13, 0.13, 0.13], [0, 0.42, 1.35], GLOW([0.4, 1, 0.6])), P('sphere', [0.13, 0.13, 0.13], [0, 0.42, -1.35], GLOW([0.4, 1, 0.6])));
    r.children.push(head);
    r.children.push(P('box', [0.45, 0.06, 0.3], [-0.3, 0.52, h / 2 - 0.3], TEAM));
    return r; },
  // Against the other four 2x2 add-ons: the Machine Shop is two small cylinders, the Control Tower is
  // a tall box, the Physics Lab is a lit dome, the Comsat is a flat dish, the Nuclear Silo is a dark
  // dome. None of them is a lit RING, so that is what this is -- a glowing torus over an open core,
  // flanked by two cooling stacks that vent.
  reactor: (w, h) => { const r = B.terranBase(w, h, { height: 0.45 });
    r.children.push(P('cyl', [1.3, 0.16, 1.3], [0, 0.55, 0], m([0.30, 0.33, 0.38])));
    r.children.push(P('cyl', [1.15, 0.14, 1.15], [0, 0.66, 0], GLOW([0.35, 0.95, 1])));
    r.children.push(P('cyl', [0.7, 0.2, 0.7], [0, 0.7, 0], m(C.metalD)));
    r.children.push(P('sphere', [0.3, 0.3, 0.3], [0, 0.86, 0], GLOW([0.6, 1, 1]), { anim: st => ({ size: [1 + 0.12 * IDLE(st), 1 + 0.12 * IDLE(st), 1 + 0.12 * IDLE(st)] }) }));
    for (const s of [-1, 1]) r.children.push(P('cyl', [0.26, 0.85, 0.26], [-0.6, 0.9, s * 0.55], m([0.34, 0.36, 0.40], { spec: 0.4 })), P('cyl', [0.34, 0.1, 0.34], [-0.6, 1.35, s * 0.55], m(C.metalD)));
    r.children.push(P('box', [0.5, 0.06, 0.18], [0.55, 0.5, -h / 2 + 0.28], TEAM));
    return r; },
};
module.exports = { UNITS, BUILDINGS, C, deathWrap };
