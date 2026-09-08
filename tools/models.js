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

// ---------------- rigs ----------------
const RIG = {
  biped(o) {
    const legLen = o.legLen || 0.55, lw = o.legW || 0.22, torsoH = o.torsoH || 0.75, torsoW = o.torsoW || 0.95, torsoD = o.torsoD || 0.8, headR = o.headR || 0.5;
    const root = N([0, 0, 0]); const suit = o.suit || C.metal, dark = o.dark || C.metalD;
    for (const s of [-1, 1]) { const leg = N([0, legLen, s * 0.3], { anim: swing(o.stride == null ? 0.6 : o.stride, 0, s) }); leg.children.push(P('cyl', [lw, legLen, lw], [0, -legLen / 2, 0], m(dark))); leg.children.push(P('sphere', [lw * 1.5, lw * 1.2, lw * 1.5], [0.05, -legLen * 0.45, 0], m(o.suit || C.metal, { spec: 0.5 }))); leg.children.push(P('box', [0.42, 0.14, 0.3], [0.08, -legLen + 0.07, 0], m(dark))); root.children.push(leg); }
    const torso = N([0, legLen + torsoH / 2, 0], { anim: st => ({ pos: [st.atk == null ? 0 : -(o.recoil || 0.12) * Math.max(0, 1 - st.atk * 1.5), (o.idleAmp == null ? 0.045 : o.idleAmp) * IDLE(st), 0], rot: [0, 0, 0.035 * IDLE(st)] }) }); root.children.push(torso);
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
    const body = N([0, bodyY, 0], { anim: st => ({ pos: [st.atk == null ? 0 : (o.lunge || 0.08) * Math.sin(st.atk * Math.PI), (o.idleAmp == null ? 0.05 : o.idleAmp) * IDLE(st), 0], rot: [0, 0, 0.05 * IDLE(st)] }) }); root.children.push(body);
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
    for (let i = 0; i < legs; i++) { const x = (o.legX0 == null ? 0.35 : o.legX0) - i * (o.legGap || 0.5); for (const s of [-1, 1]) { const hip = N([x, bodyY * 0.8, s * 0.4], { anim: yaw(o.legSwing == null ? 0.35 : o.legSwing, i * Math.PI, s) }); const up = N([0, 0, 0], { rot: [s * 0.9, 0, 0] }); up.children.push(P('cyl', [lw, legLen * 0.6, lw], [0, legLen * 0.3, 0], m(o.legColor || C.fleshD))); const knee = N([0, legLen * 0.6, 0], { rot: [-s * 1.9, 0, 0] }); knee.children.push(P('cyl', [lw * 0.8, legLen * 0.7, lw * 0.8], [0, legLen * 0.35, 0], m(o.legColor || C.fleshD))); up.children.push(knee); hip.children.push(up); root.children.push(hip); } }
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
    [[0.6, -1], [0.6, 1], [2.5, -1], [2.5, 1]].forEach(([a, s], i) => { const hip = N([Math.cos(a) * 0.5, by - 0.1, Math.sin(a) * 0.5 * s], { rot: [0, -Math.atan2(Math.sin(a) * s, Math.cos(a)), 0], anim: yaw(0.3, i % 2 ? Math.PI : 0, 1) }); const up = N([0, 0, 0], { rot: [0, 0, -0.9] }); up.children.push(P('cyl', [0.16, ll * 0.7, 0.16], [0, -ll * 0.35, 0], m(o.legColor || C.goldD, { spec: 0.5 }))); const knee = N([0, -ll * 0.7, 0], { rot: [0, 0, 1.6] }); knee.children.push(P('cyl', [0.13, ll * 0.75, 0.13], [0, -ll * 0.37, 0], m(o.legColor || C.goldD, { spec: 0.5 }))); up.children.push(knee); hip.children.push(up); root.children.push(hip); });
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
  barracks: (w, h) => { const r = B.terranBase(w, h, { height: 0.8 }); r.children.push(B.tower(1.3, -0.6, 0.8, 0.7, 0.8), P('box', [1.4, 0.7, 0.1], [-0.3, 0.35, h / 2 - 0.05], m(C.dark)), P('box', [1.5, 0.05, 0.9], [-0.8, 0.83, -0.2], m(C.metalL)), P('sphere', [0.3, 0.3, 0.3], [1.3, 1.6, -0.6], TEAM)); return r; },
  engineering_bay: (w, h) => { const r = B.terranBase(w, h, { height: 0.7 }); r.children.push(B.tower(-1.2, 0, 0.9, 0.9, 0.7), B.post(0.6, 0, 0.6, 0.7), B.dome(0.6, 0, 0.7, 1.2, m(C.metalL)), P('cyl', [0.9, 0.08, 0.9], [0.6, 1.5, 0], m(C.metalL), { rot: [0.6, 0, 0] })); return r; },
  academy: (w, h) => { const r = B.terranBase(w, h, { height: 0.6 }); for (let k = 0; k < 3; k++) r.children.push(B.post(-0.8 + k * 0.8, -0.3, 0.9, 0.6)); r.children.push(B.tower(0.9, 0.4, 0.6, 0.5, 0.6), P('sphere', [0.25, 0.25, 0.25], [0.9, 1.25, 0.4], GLOW(C.visor))); return r; },
  missile_turret: (w, h) => { const r = N([0, 0, 0]); r.children.push(P('cyl', [1.6, 0.3, 1.6], [0, 0.15, 0], m(C.metalD)), P('cyl', [0.7, 0.8, 0.7], [0, 0.7, 0], m(C.metal)), P('box', [0.9, 0.35, 0.6], [0.2, 1.25, 0], m(C.metalD)), P('box', [0.5, 0.1, 0.5], [-0.3, 0.32, 0], TEAM)); for (const s of [-1, 1]) r.children.push(cylX(0.6, 0.12, [0.6, 1.3, s * 0.18], m(C.red))); return r; },
  bunker: (w, h) => { const r = B.terranBase(w, h, { height: 0.55 }); for (let k = 0; k < 3; k++) r.children.push(P('box', [0.5, 0.15, 0.08], [-0.9 + k * 0.9, 0.35, h / 2 - 0.06], m(C.dark))); r.children.push(P('box', [1.2, 0.3, 0.8], [0, 0.7, -0.2], m(C.metalD))); return r; },
  factory: (w, h) => { const r = B.terranBase(w, h, { height: 0.9 }); r.children.push(P('box', [1.8, 0.8, 0.1], [0, 0.4, h / 2 - 0.05], m(C.dark)), B.tower(1.4, -0.7, 0.6, 0.9, 0.9), P('cyl', [0.3, 1.0, 0.3], [-1.4, 1.4, -0.6], m(C.metalD)), cylX(1.6, 0.1, [-0.5, 1.5, -0.7], m(C.metalL)), P('box', [0.3, 0.4, 0.3], [0.3, 1.2, -0.7], m(C.metalL))); return r; },
  starport: (w, h) => { const r = B.terranBase(w, h, { height: 0.6 }); r.children.push(P('cyl', [2.2, 0.15, 2.0], [0.4, 0.65, 0], m([0.3, 0.33, 0.38])), B.tower(-1.4, -0.4, 0.8, 1.0, 0.6), P('box', [0.5, 0.2, 0.5], [-1.4, 1.7, -0.4], GLOW(C.visor))); for (let k = 0; k < 8; k++) r.children.push(P('sphere', [0.1, 0.1, 0.1], [0.4 + Math.cos(k * 0.785) * 1.0, 0.75, Math.sin(k * 0.785) * 0.9], GLOW([1, 0.85, 0.4]))); return r; },
  science_facility: (w, h) => { const r = B.terranBase(w, h, { height: 0.7 }); r.children.push(B.tower(0, 0, 1.0, 1.1, 0.7), B.dome(0, 0, 0.5, 1.8, GLOW(C.visor))); for (const [dx, dz] of [[-1.3, -0.5], [1.3, -0.5], [-1.3, 0.6], [1.3, 0.6]]) r.children.push(B.dome(dx, dz, 0.45, 0.7)); return r; },
  armory: (w, h) => { const r = B.terranBase(w, h, { height: 0.6 }); r.children.push(B.tower(1.0, 0, 0.7, 0.6, 0.6), P('cyl', [0.15, 0.9, 0.15], [-0.7, 1.0, 0], m(C.metalL), { rot: [0, 0, 0.7] }), P('cyl', [0.15, 0.7, 0.15], [-0.2, 1.4, 0], m(C.metalL), { rot: [0, 0, -0.6] })); return r; },
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
};
module.exports = { UNITS, BUILDINGS, C };
