'use strict';
// ============================================================================
// Building sprite painters (static) + animated overlays. Origin = footprint
// top-left; W/H in px. Painted flat, lit afterwards by Sprites.
// ============================================================================
const BP = {
  tBase(h, c, W, H, TC, opts = {}) {
    const M = TCOL.M, Md = TCOL.Md, Ml = TCOL.Ml; const inset = opts.inset || 4, depth = opts.depth || 10;
    h.R(inset, inset + depth, W - inset * 2, H - inset * 2 - depth + 2, 4, '#3d444c');               // lower wall
    h.R(inset, inset, W - inset * 2, H - inset * 2 - depth, 4, M);                                    // roof
    // panel seams
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; const cols = Math.max(2, Math.round(W / 40)), rows = Math.max(1, Math.round((H - depth) / 40));
    for (let i = 1; i < cols; i++) { c.beginPath(); c.moveTo(inset + i * (W - inset * 2) / cols, inset + 2); c.lineTo(inset + i * (W - inset * 2) / cols, H - inset - depth - 2); c.stroke(); }
    for (let j = 1; j < rows; j++) { c.beginPath(); c.moveTo(inset + 2, inset + j * (H - inset * 2 - depth) / rows); c.lineTo(W - inset - 2, inset + j * (H - inset * 2 - depth) / rows); c.stroke(); }
    // rivets
    c.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < cols; i++) for (let j = 0; j <= rows; j++) c.fillRect(inset + 6 + i * (W - inset * 2) / cols, inset + 5 + j * Math.max(1, (H - inset * 2 - depth - 10)) / Math.max(1, rows), 2, 2);
    // vents on the wall
    for (let i = 0; i < Math.max(1, Math.floor(W / 28)); i++) h.R(inset + 8 + i * 28, H - inset - depth + 2, 14, depth - 5, 1, '#20252a', null);
    // team colour stripe + lights
    h.R(inset + 4, inset + 4, Math.min(28, W / 4), 6, 2, TC, null); c.fillStyle = TC; for (let i = 0; i < Math.floor(W / 24); i++) c.fillRect(inset + 6 + i * 24, H - inset - depth - 5, 3, 3);
  },
  zBase(h, c, W, H, TC, opts = {}) {
    const cx = W / 2, cy = H / 2, rx = W / 2 - 3, ry = H / 2 - 3;
    h.E(cx, cy + 3, rx, ry, '#4a2f3a', OUT, 1.5); h.E(cx, cy, rx * .92, ry * .88, '#7a5a5e', null); h.E(cx - rx * .12, cy - ry * .15, rx * .6, ry * .5, '#8f6f6a', null);
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.3; const bx = cx + Math.cos(a) * rx * .7, by = cy + Math.sin(a) * ry * .7; h.C(bx, by, 3 + (k % 3) * 2, '#5b3d48', 'rgba(0,0,0,0.4)', 1); h.C(bx - 1, by - 1, 1.5 + (k % 3), '#9a7a8a', null); }
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.2; h.Q(cx + Math.cos(a) * rx * .85, cy + Math.sin(a) * ry * .85, cx + Math.cos(a) * rx * 1.05, cy + Math.sin(a) * ry * 1.05 + 4, cx + Math.cos(a + .35) * rx * 1.15, cy + Math.sin(a + .35) * ry * 1.15 + 2, '#5a3a48', 3); }
    h.E(cx, cy, rx * .35, ry * .3, TC, 'rgba(0,0,0,0.5)', 1);
  },
  pBase(h, c, W, H, TC, opts = {}) {
    const ch = 10; h.P([[ch, 0], [W - ch, 0], [W, ch], [W, H - ch], [W - ch, H], [ch, H], [0, H - ch], [0, ch]], '#8b6c20', OUT, 1.5);
    h.P([[ch + 4, 4], [W - ch - 4, 4], [W - 4, ch + 4], [W - 4, H - ch - 8], [W - ch - 4, H - 8], [ch + 4, H - 8], [4, H - ch - 8], [4, ch + 4]], TCOL.Au, null);
    c.strokeStyle = 'rgba(255,240,200,0.35)'; c.lineWidth = 1; c.strokeRect(10, 10, W - 20, H - 26);
    h.R(8, H - 12, W - 16, 6, 2, TC, null);
    for (let i = 0; i < Math.floor(W / 30); i++) { h.P([[16 + i * 30, 12], [22 + i * 30, 6], [28 + i * 30, 12]], TCOL.psi, null); }
  },
  dome(h, x, y, r, col) { h.C(x, y, r, col); h.E(x - r * .3, y - r * .3, r * .4, r * .25, 'rgba(255,255,255,0.35)', null); },
  // ---- the ruined base, shared by all three derelicts -------------------------------------------
  // A derelict has to read as RUINED at a glance and at forty pixels, and the only cue that survives
  // that is SILHOUETTE. Colour is the first thing lost under fog and a team tint (M8's finding on the
  // unit pass, and it applies twice over here, because a captured derelict is tinted with its new
  // owner's colour and must still read as a wreck). So the ruin is cut into the outline: a bitten
  // corner, a collapsed roof line, and rubble spilling past the footprint. Everything else -- the
  // scorch, the oxide, the dead lights -- is confirmation for someone already looking.
  //
  // The team stripe is drawn DARK and unlit. A captured derelict lights up through BUILDING_ANIM,
  // which is the only painter path that gets the unit and can therefore see `u.captured`; the static
  // sprite is cached per (id, colour) and has no state to read.
  ruinBase(h, c, W, H, TC, opts = {}) {
    const bite = opts.bite || 0.28, depth = opts.depth || 9;
    const bw = W * bite;
    // wall, with the top-right corner missing
    h.P([[3, 12], [W - bw, 12], [W - bw + 4, 20], [W - 8, 22], [W - 3, 30], [W - 3, H - 3], [3, H - 3]], '#3a352e', OUT, 1.5);
    // roof slab, cracked and short of the wall on the bitten side
    h.P([[6, 6], [W - bw - 4, 6], [W - bw + 2, 14], [W - bw - 10, 18], [6, 18 - 0]], NCOL.dead, OUT, 1.2);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
    for (let i = 1; i < Math.max(2, Math.round(W / 34)); i++) { const x = 6 + i * (W - bw - 10) / Math.max(2, Math.round(W / 34)); c.beginPath(); c.moveTo(x, 8); c.lineTo(x - 2, H - 6); c.stroke(); }
    // exposed girders where the corner went
    for (let k = 0; k < 3; k++) { const x = W - bw + 2 + k * 6; h.L(x, 14 + k * 2, x + 4, H * .45, NCOL.rustD, 2); }
    h.L(W - bw - 2, 13, W - 10, 21, NCOL.rust, 2.5);
    // scorch across the face, and rubble along the bottom edge
    h.E(W * .62, H * .55, W * .2, H * .16, 'rgba(20,18,16,0.45)', null);
    for (let k = 0; k < Math.max(4, Math.floor(W / 14)); k++) { const x = 5 + k * (W - 10) / Math.max(4, Math.floor(W / 14)); h.P([[x, H - 3], [x + 4, H - 9 - (k % 3) * 3], [x + 9, H - 3]], k % 2 ? NCOL.ash : '#4a4137', null); }
    // the dead stripe: where a working building would carry its owner's colour
    h.R(7, H - 12, Math.min(30, W / 3), 5, 2, TC, null); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(7, H - 12, Math.min(30, W / 3), 5);
    return { bw, depth };
  },
  crystal(h, x, y, s, col = TCOL.psi) { h.P([[x, y - s], [x + s * .5, y], [x, y + s * .6], [x - s * .5, y]], col, 'rgba(0,40,80,0.6)', 1); h.P([[x, y - s], [x + s * .2, y - s * .2], [x, y]], 'rgba(255,255,255,0.5)', null); },
};
const BUILDING_PAINTERS = {
  command_center(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 14 }); h.R(8, 20, 30, 40, 4, TCOL.Md); h.R(W - 38, 20, 30, 40, 4, TCOL.Md); BP.dome(h, W / 2, H / 2 - 8, 26, TCOL.Ml); h.C(W / 2, H / 2 - 8, 12, TCOL.Md); h.R(W / 2 - 22, H - 26, 44, 8, 2, '#2a2f35'); },
  supply_depot(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 10 }); for (let k = 0; k < 3; k++) { h.E(18 + k * 30, H / 2 - 6, 12, 9, TCOL.Ml); h.E(18 + k * 30, H / 2 - 6, 12, 9, null, 'rgba(0,0,0,0.3)', 1); h.R(6 + k * 30, H / 2 - 6, 24, 12, 2, TCOL.M, null); h.E(18 + k * 30, H / 2 + 6, 12, 5, TCOL.Md, OUT, 1); } },
  refinery(h, c, W, H, TC) { h.E(W / 2, H / 2, W / 2 - 4, H / 2 - 4, '#2f3a2c', OUT, 1.5); BP.tBase(h, c, W * .55, H, TC, { depth: 10 }); h.C(W - 30, H / 2, 16, TCOL.Md); h.C(W - 30, H / 2, 10, '#5ad06a', null); h.L(W * .5, H / 2 - 8, W - 40, H / 2 - 8, TCOL.Ml, 5); h.L(W * .5, H / 2 + 8, W - 40, H / 2 + 8, TCOL.Ml, 5); },
  barracks(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 14 }); h.R(W / 2 - 22, H - 34, 44, 20, 2, '#1e2226'); c.fillStyle = TC; c.fillRect(W / 2 - 22, H - 34, 44, 3); h.R(W - 36, 8, 24, 30, 3, TCOL.Md); h.C(W - 24, 22, 7, TC, OUT, 1); h.R(10, 10, 40, 22, 3, TCOL.Ml, OUT, 1); },
  engineering_bay(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 12 }); h.C(W / 2 + 10, H / 2 - 6, 22, TCOL.Md); h.E(W / 2 + 10, H / 2 - 6, 16, 8, TCOL.Ml, OUT, 1); h.L(W / 2 + 10, H / 2 - 6, W / 2 + 26, H / 2 - 24, TCOL.Ml, 3); h.R(12, 12, 26, 40, 3, TCOL.Md); },
  academy(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 10 }); for (let k = 0; k < 3; k++) h.L(16 + k * 26, H / 2 + 4, 16 + k * 26, 8, TCOL.Ml, 2.5); h.R(W - 34, 12, 22, 22, 3, TCOL.Md); h.C(W - 23, 23, 6, TCOL.visor, OUT, 1); },
  missile_turret(h, c, W, H, TC) { h.C(W / 2, H / 2 + 4, 22, '#3d444c', OUT, 1.5); h.C(W / 2, H / 2, 18, TCOL.M); h.C(W / 2, H / 2, 8, TC, OUT, 1); },
  bunker(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 12, inset: 3 }); for (let k = 0; k < 3; k++) h.R(12 + k * 28, H - 24, 16, 5, 1, '#0f1214', null); h.R(W / 2 - 12, 10, 24, 14, 2, TCOL.Md); },
  factory(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 14 }); h.R(W / 2 - 30, H - 36, 60, 22, 2, '#1e2226'); c.fillStyle = 'rgba(255,200,80,0.6)'; for (let k = 0; k < 5; k++) c.fillRect(W / 2 - 26 + k * 12, H - 34, 6, 2); h.R(W - 30, 6, 16, 16, 2, TCOL.Md); h.C(W - 22, 14, 5, '#2a2f35', null); h.L(12, 14, 60, 14, TCOL.Ml, 4); h.L(36, 14, 36, 40, TCOL.Ml, 3); },
  starport(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 12 }); h.C(W * .6, H / 2 - 6, 30, '#4a525b', OUT, 1.2); h.C(W * .6, H / 2 - 6, 24, '#5b646d', null); c.strokeStyle = 'rgba(255,220,120,0.7)'; c.setLineDash([4, 4]); c.lineWidth = 1.5; c.beginPath(); c.arc(W * .6, H / 2 - 6, 27, 0, 7); c.stroke(); c.setLineDash([]); h.R(10, 10, 30, 44, 3, TCOL.Md); },
  science_facility(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 12 }); h.C(W / 2, H / 2 - 6, 20, TCOL.Md); for (const [dx, dy] of [[-32, -14], [32, -14], [-32, 18], [32, 18]]) BP.dome(h, W / 2 + dx, H / 2 - 6 + dy, 11, TCOL.Ml); h.C(W / 2, H / 2 - 6, 9, TCOL.visor, OUT, 1); },
  armory(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 10 }); h.L(20, H / 2, 50, H / 2 - 20, TCOL.Ml, 4); h.L(50, H / 2 - 20, 66, H / 2 - 6, TCOL.Ml, 4); h.C(66, H / 2 - 6, 5, TCOL.Md); h.R(W - 32, 10, 20, 26, 2, TCOL.Md); },
  comsat_station(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 8, inset: 3 }); h.E(W / 2, H / 2 - 4, 18, 9, TCOL.Ml); h.L(W / 2, H / 2 - 4, W / 2 + 10, H / 2 - 18, TCOL.Md, 2.5); },
  nuclear_silo(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 8, inset: 3 }); BP.dome(h, W / 2, H / 2 - 4, 18, TCOL.Md); h.L(W / 2 - 14, H / 2 - 4, W / 2 + 14, H / 2 - 4, '#d33', 3); },
  machine_shop(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 8, inset: 3 }); h.C(W / 2 - 8, H / 2 - 4, 10, TCOL.Md); h.C(W / 2 + 10, H / 2 - 8, 7, TCOL.Md); },
  control_tower(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 8, inset: 3 }); h.R(W / 2 - 8, 6, 16, 30, 2, TCOL.Md); h.C(W / 2, 10, 4, '#ff5050', null); },
  physics_lab(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 8, inset: 3 }); BP.dome(h, W / 2, H / 2 - 4, 16, TCOL.visor); },
  covert_ops(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 8, inset: 3 }); h.R(10, 8, W - 20, 20, 2, '#1e2226'); h.C(W / 2, 18, 4, '#ff3030', null); },
  hatchery(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.E(W / 2, H * .68, 22, 12, '#2a1420', OUT, 1.5); h.E(W / 2, H * .66, 14, 6, '#5a2a44', null); h.E(W / 2 - 6, H * .36, 22, 16, '#a3857e', null); },
  lair(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.E(W / 2, H * .68, 24, 13, '#2a1420', OUT, 1.5); for (let k = 0; k < 5; k++) h.L(W / 2 - 40 + k * 20, H * .35, W / 2 - 44 + k * 22, H * .12 + (k % 2) * 8, TCOL.bone, 3); h.E(W / 2, H * .4, 26, 18, '#9a7a78', null); },
  hive(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.E(W / 2, H * .7, 28, 14, '#2a1420', OUT, 1.5); for (let k = 0; k < 7; k++) h.L(W / 2 - 54 + k * 18, H * .38, W / 2 - 60 + k * 20, H * .06 + (k % 2) * 10, TCOL.bone, 3.5); h.E(W / 2, H * .42, 30, 20, '#a98a86', null); h.E(W / 2, H * .42, 12, 8, TC, null); },
  creep_colony(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); },
  sunken_colony(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.E(W / 2, H / 2, 16, 11, '#2a1420', OUT, 1.5); },
  spore_colony(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); for (const [dx, dy] of [[-14, -8], [12, -12], [0, 12]]) { h.C(W / 2 + dx, H / 2 + dy, 9, '#4c8a4a', OUT, 1); h.C(W / 2 + dx - 3, H / 2 + dy - 3, 3, '#9ad08a', null); } },
  extractor(h, c, W, H, TC) { h.E(W / 2, H / 2, W / 2 - 4, H / 2 - 4, '#2f3a2c', OUT, 1.5); BP.zBase(h, c, W, H, TC); h.E(W / 2, H / 2 - 4, 18, 10, '#2a1420', OUT, 1.5); h.E(W / 2, H / 2 - 4, 10, 5, '#5ad06a', null); },
  spawning_pool(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.E(W / 2, H / 2 + 2, W * .34, H * .3, '#3f7a3a', OUT, 1.5); h.E(W / 2 - 8, H / 2 - 2, W * .18, H * .14, '#6ab05a', null); h.L(W / 2 + 12, H / 2 - 8, W / 2 + 26, H / 2 - 18, TCOL.bone, 2); },
  evolution_chamber(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); for (const dx of [-16, 0, 16]) { h.C(W / 2 + dx, H / 2 - 4, 6, '#2a1420', OUT, 1); h.C(W / 2 + dx, H / 2 - 4, 2.5, TCOL.eye, null); } },
  hydralisk_den(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); for (let k = 0; k < 5; k++) h.L(W / 2 - 24 + k * 12, H / 2 + 4, W / 2 - 28 + k * 14, H / 2 - 20 - (k % 2) * 6, TCOL.bone, 2.5); },
  spire(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.P([[W / 2 - 14, H - 12], [W / 2, 4], [W / 2 + 14, H - 12]], '#6b4a5a', OUT, 1.5); h.P([[W / 2 - 6, H - 14], [W / 2, 14], [W / 2 + 4, H - 14]], '#8f6a7a', null); },
  greater_spire(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.P([[W / 2 - 18, H - 10], [W / 2, 0], [W / 2 + 18, H - 10]], '#5c3f52', OUT, 1.5); h.P([[W / 2 - 8, H - 12], [W / 2, 10], [W / 2 + 6, H - 12]], '#9a7a8a', null); h.C(W / 2, 8, 4, TC, null); },
  queens_nest(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.E(W / 2, H / 2, 20, 12, '#6a4a5e', OUT, 1); h.E(W / 2, H / 2, 10, 6, '#c8a0b8', null); },
  ultralisk_cavern(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.E(W / 2, H / 2 + 4, 26, 14, '#1e1018', OUT, 1.5); h.L(W / 2 - 20, H / 2 - 4, W / 2 - 30, H / 2 - 18, TCOL.bone, 3); h.L(W / 2 + 20, H / 2 - 4, W / 2 + 30, H / 2 - 18, TCOL.bone, 3); },
  defiler_mound(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); for (const dx of [-30, 0, 30]) h.E(W / 2 + dx, H / 2, 10, 7, '#3a2a48', OUT, 1); h.E(W / 2, H / 2 - 10, 14, 6, '#8a5a9a', null); },
  nydus_canal(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.E(W / 2, H / 2, 16, 12, '#1e1018', OUT, 1.5); for (let k = 0; k < 6; k++) { const a = k * 1.05; h.L(W / 2 + Math.cos(a) * 14, H / 2 + Math.sin(a) * 10, W / 2 + Math.cos(a) * 22, H / 2 + Math.sin(a) * 16, TCOL.bone, 2); } },
  infested_command_center(h, c, W, H, TC) { BUILDING_PAINTERS.command_center(h, c, W, H, TC); h.E(W / 2, H / 2, 40, 26, 'rgba(120,60,110,0.55)', null); },
  nexus(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); for (const [dx, dy] of [[18, 18], [W - 18, 18], [18, H - 24], [W - 18, H - 24]]) { h.C(dx, dy, 8, TCOL.Aud); BP.crystal(h, dx, dy - 4, 8); } h.C(W / 2, H / 2 - 6, 24, TCOL.Aud); h.C(W / 2, H / 2 - 6, 18, '#2c3b70'); BP.crystal(h, W / 2, H / 2 - 12, 22); },
  pylon(h, c, W, H, TC) { h.E(W / 2, H / 2 + 8, 24, 12, '#8b6c20', OUT, 1.5); h.E(W / 2, H / 2 + 8, 16, 7, TCOL.Au, null); h.P([[W / 2, 6], [W / 2 + 14, H / 2 + 4], [W / 2, H / 2 + 14], [W / 2 - 14, H / 2 + 4]], TCOL.psi, '#1a4a80', 1.5); h.P([[W / 2, 6], [W / 2 + 5, H / 2 - 2], [W / 2, H / 2 + 4]], 'rgba(255,255,255,0.55)', null); h.R(W / 2 - 8, H / 2 + 12, 16, 4, 1, TC, null); },
  assimilator(h, c, W, H, TC) { h.E(W / 2, H / 2, W / 2 - 4, H / 2 - 4, '#2f3a2c', OUT, 1.5); BP.pBase(h, c, W * .55, H, TC); h.C(W - 30, H / 2, 16, TCOL.Aud); h.C(W - 30, H / 2, 10, '#5ad06a', null); h.L(W * .5, H / 2, W - 44, H / 2, TCOL.Au, 6); },
  gateway(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.R(W / 2 - 34, 10, 68, H - 34, 6, TCOL.Aud); h.R(W / 2 - 26, 16, 52, H - 44, 4, '#1c2a55', null); BP.crystal(h, 22, 30, 10); BP.crystal(h, W - 22, 30, 10); },
  forge(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.C(W / 2, H / 2 - 6, 18, TCOL.Aud); h.C(W / 2, H / 2 - 6, 10, '#ff9a3c', null); h.C(W / 2, H / 2 - 6, 5, '#ffe08a', null); BP.crystal(h, 16, H / 2 - 4, 8); BP.crystal(h, W - 16, H / 2 - 4, 8); },
  photon_cannon(h, c, W, H, TC) { h.C(W / 2, H / 2 + 6, 22, TCOL.Aud, OUT, 1.5); h.C(W / 2, H / 2 + 2, 16, TCOL.Au); BP.crystal(h, W / 2, H / 2 - 6, 14); h.R(W / 2 - 8, H / 2 + 14, 16, 4, 1, TC, null); },
  cybernetics_core(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.C(W / 2, H / 2 - 6, 20, TCOL.Aud); h.C(W / 2, H / 2 - 6, 12, '#2c3b70'); h.C(W / 2, H / 2 - 6, 6, TCOL.psi, null); for (let k = 0; k < 4; k++) { const a = k * 1.57 + .78; h.L(W / 2 + Math.cos(a) * 14, H / 2 - 6 + Math.sin(a) * 14, W / 2 + Math.cos(a) * 28, H / 2 - 6 + Math.sin(a) * 26, TCOL.Aul, 3); } },
  shield_battery(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.E(W / 2, H / 2 - 6, 26, 12, TCOL.Aud); h.E(W / 2, H / 2 - 6, 18, 8, '#2c3b70'); h.E(W / 2, H / 2 - 6, 10, 4, TCOL.psi, null); },
  robotics_facility(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.R(12, 12, W - 24, H - 34, 4, TCOL.Aud); h.C(W / 2, H / 2 - 6, 12, '#2c3b70'); h.L(20, H / 2 - 6, W - 20, H / 2 - 6, TCOL.Aul, 3); },
  stargate(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.E(W / 2, H / 2 - 6, 40, 30, null, TCOL.Aud, 8); h.E(W / 2, H / 2 - 6, 40, 30, null, TCOL.Aul, 2); h.E(W / 2, H / 2 - 6, 30, 22, '#1c2a55', null); BP.crystal(h, W / 2, 12, 8); },
  citadel_of_adun(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.P([[W / 2 - 20, H - 16], [W / 2, 6], [W / 2 + 20, H - 16]], TCOL.Aud, OUT, 1.2); BP.crystal(h, W / 2, 16, 8); },
  robotics_support_bay(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.R(14, 14, W - 28, H - 36, 4, TCOL.Aud); h.C(W / 2 - 14, H / 2 - 6, 8, '#2c3b70'); h.C(W / 2 + 14, H / 2 - 6, 8, '#2c3b70'); },
  fleet_beacon(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.C(W / 2, H / 2 - 6, 22, TCOL.Aud); BP.crystal(h, W / 2, H / 2 - 10, 18); for (let k = 0; k < 3; k++) BP.crystal(h, 16 + k * ((W - 32) / 2), H - 22, 6); },
  templar_archives(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.R(W / 2 - 24, 10, 48, H - 32, 4, TCOL.Aud); BP.crystal(h, W / 2, H / 2 - 8, 14, '#b48cff'); BP.crystal(h, 14, H / 2 - 4, 7, '#b48cff'); BP.crystal(h, W - 14, H / 2 - 4, 7, '#b48cff'); },
  observatory(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.C(W / 2, H / 2 - 6, 16, TCOL.Aud); h.C(W / 2, H / 2 - 6, 9, '#2c3b70'); h.L(W / 2, H / 2 - 6, W / 2 + 22, H / 2 - 26, TCOL.Aul, 3); },
  arbiter_tribunal(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.P([[W / 2, 8], [W / 2 + 26, H / 2 - 6], [W / 2, H - 22], [W / 2 - 26, H / 2 - 6]], TCOL.Aud, OUT, 1.2); BP.crystal(h, W / 2, H / 2 - 10, 12); },
  // ---- M11 wave two: field hospital, jamming tower, wall ----
  // Each race reads its own way at 40 px under fog, which is the only size that matters: the hospital is
  // the one with a light on it, the jammer is the one with something pointed at the sky, and the wall is
  // the one with no silhouette above the roofline at all. A wall that looked like a building would be
  // clicked like a building.
  aid_station(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 10 }); h.R(W / 2 - 15, 10, 30, 26, 3, '#e6ebf0', OUT, 1); h.R(W / 2 - 3, 14, 6, 18, 1, '#d03030', null); h.R(W / 2 - 10, 20, 20, 6, 1, '#d03030', null); h.R(11, 14, 20, 22, 3, TCOL.Md); h.C(21, 25, 5, TCOL.visor, OUT, 1); h.R(W - 31, 14, 20, 22, 3, TCOL.Md); h.C(W - 21, 25, 4, '#4ad06a', null); for (let k = 0; k < 3; k++) h.R(12 + k * 26, H - 20, 16, 5, 1, '#1e2226', null); },
  scrambler_mast(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 8, inset: 3 }); const mx = W / 2; h.L(mx - 7, H - 18, mx - 2, 10, TCOL.Md, 3); h.L(mx + 7, H - 18, mx + 2, 10, TCOL.Md, 3); for (let k = 0; k < 4; k++) { const y = H - 20 - k * 8; h.L(mx - 6 + k * 1.2, y, mx + 6 - k * 1.2, y - 6, TCOL.M, 1.5); h.L(mx + 6 - k * 1.2, y, mx - 6 + k * 1.2, y - 6, TCOL.M, 1.5); } h.E(mx, 9, 11, 5, TCOL.Ml, OUT, 1); h.C(mx, 6, 3, '#ff5050', null); h.R(8, H - 26, 14, 10, 2, TCOL.Md); },
  blast_barricade(h, c, W, H, TC) { h.R(2, 12, W - 4, H - 18, 3, '#3a4046', OUT, 1.5); h.R(2, 5, W - 4, 15, 4, '#6b737c', OUT, 1.5); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; for (let k = 1; k < 3; k++) { c.beginPath(); c.moveTo(2 + k * (W - 4) / 3, 20); c.lineTo(2 + k * (W - 4) / 3, H - 8); c.stroke(); } for (let k = 0; k < 4; k++) h.P([[6 + k * 15, 18], [12 + k * 15, 7], [18 + k * 15, 7], [12 + k * 15, 18]], k % 2 ? '#e0b429' : '#20252a', null); h.R(4, H - 10, W - 8, 5, 2, TC, null); h.C(8, 12, 3, TCOL.Md); h.C(W - 8, 12, 3, TCOL.Md); },
  // ---- M12 wave four: Terran ------------------------------------------------------------------
  // The fallback painters for the four new Terran structures. In this branch they are what is actually
  // drawn: tools/bake.js has not been run for them, so js/sprites.js finds no atlas entry and lands
  // here. Each is separated by SHAPE from the specific building it will be confused with -- the
  // Orbital and the Fortress from a plain Command Center and from each other, the Sensor Tower from
  // the Scrambler Mast, the Reactor from the four other 2x2 add-ons -- exactly as the 3D models are.
  orbital_command(h, c, W, H, TC) { BUILDING_PAINTERS.command_center(h, c, W, H, TC);
    // a dish half the width of the building, tilted, on a mast: round where the Fortress is square
    h.L(W / 2 + 4, H / 2 - 6, W / 2 + 14, H / 2 - 26, TCOL.Md, 4);
    h.E(W / 2 + 16, H / 2 - 30, 30, 15, '#b6bec6', OUT, 1.5);
    h.E(W / 2 + 12, H / 2 - 32, 20, 9, '#dbe2e8', null);
    h.C(W / 2 + 16, H / 2 - 30, 4, TCOL.Md); h.C(W / 2 + 34, H / 2 - 26, 3, '#7fd0ff', null);
    h.R(10, H - 24, 18, 6, 2, TC, null);
  },
  planetary_fortress(h, c, W, H, TC) { BUILDING_PAINTERS.command_center(h, c, W, H, TC);
    // a blast skirt past the footprint on all four sides, four casemates, one twin turret
    h.R(-2, -2, W + 4, H + 4, 6, null, '#2a2f33', 5);
    for (const [x, y] of [[12, 14], [W - 12, 14], [12, H - 16], [W - 12, H - 16]]) { h.C(x, y, 10, '#5e666a'); h.C(x, y, 5, '#2f3438', null); }
    h.C(W / 2, H / 2 - 4, 20, '#454c50');
    h.R(W / 2 - 4, H / 2 - 12, 34, 7, 2, '#33383a', OUT, 1); h.R(W / 2 - 4, H / 2 + 5, 34, 7, 2, '#33383a', OUT, 1);
    h.R(W / 2 - 16, H / 2 - 8, 14, 16, 2, TC, OUT, 1);
    h.C(14, H - 14, 3, '#ff5040', null);
  },
  sensor_tower(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 7, inset: 3 }); const mx = W / 2;
    // a lattice, like the Scrambler Mast -- and then a long horizontal search BAR instead of its dish,
    // hanging past both edges of the footprint. Straight against round, at the same height.
    h.L(mx - 6, H - 16, mx - 2, 14, TCOL.Md, 2.5); h.L(mx + 6, H - 16, mx + 2, 14, TCOL.Md, 2.5);
    for (let k = 0; k < 5; k++) { const y = H - 18 - k * 7; h.L(mx - 5 + k, y, mx + 5 - k, y - 5, TCOL.M, 1.2); }
    h.C(mx, 13, 5, TCOL.Md);
    h.L(mx - 26, 11, mx + 26, 11, '#c3cbd3', 3);
    h.R(mx - 30, 8, 8, 7, 1, TCOL.Md); h.R(mx + 22, 8, 8, 7, 1, TCOL.Md);
    h.C(mx - 30, 11, 2.5, '#66ff9a', null); h.C(mx + 30, 11, 2.5, '#66ff9a', null);
    h.R(6, H - 22, 12, 8, 2, TCOL.Md);
  },
  reactor(h, c, W, H, TC) { BP.tBase(h, c, W, H, TC, { depth: 8, inset: 3 });
    // a lit RING over an open core, which no other add-on is
    h.C(W / 2, H / 2 - 2, 19, '#3d444c');
    h.C(W / 2, H / 2 - 2, 15, '#4fd6ff', null);
    h.C(W / 2, H / 2 - 2, 9, TCOL.Md, null);
    h.C(W / 2, H / 2 - 2, 5, '#bff2ff', null);
    for (const dx of [-1, 1]) { h.C(W / 2 + dx * 20, H - 16, 6, TCOL.Md); h.C(W / 2 + dx * 20, H - 16, 3, '#20252a', null); }
    h.R(W - 20, 6, 12, 5, 2, TC, null);
  },
  mending_pool(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.E(W / 2, H / 2 + 2, W * .3, H * .28, '#3f5a7a', OUT, 1.5); h.E(W / 2 - 5, H / 2 - 1, W * .16, H * .13, '#7fc8b0', null); for (const dx of [-30, 30]) { h.E(W / 2 + dx, H / 2 - 2, 9, 7, '#6b4a58', OUT, 1); h.Q(W / 2 + dx, H / 2 - 2, W / 2 + dx * .5, H / 2 - 12, W / 2, H / 2 - 4, '#8a6a70', 3); } h.C(W / 2, H / 2 - 14, 4, '#b8f0d0', null); },
  miasma_gland(h, c, W, H, TC) { BP.zBase(h, c, W, H, TC); h.E(W / 2, H / 2 + 2, 15, 13, '#5a4a68', OUT, 1.5); h.E(W / 2 - 4, H / 2 - 2, 7, 6, '#9a7ab0', null); for (let k = 0; k < 5; k++) { const a = k * 1.26 + .4; h.Q(W / 2 + Math.cos(a) * 12, H / 2 + Math.sin(a) * 10, W / 2 + Math.cos(a) * 20, H / 2 + Math.sin(a) * 16 - 4, W / 2 + Math.cos(a) * 24, H / 2 + Math.sin(a) * 20 - 10, '#6a5a78', 2.5); } h.C(W / 2, H / 2 - 12, 3.5, '#c8a0e0', null); },
  carapace_ridge(h, c, W, H, TC) { h.R(3, H * .28, W - 6, H * .6, 7, '#402833', OUT, 1.5); for (let k = 0; k < 3; k++) h.E(11 + k * (W - 22) / 2, H * .56, 13, 15, k % 2 ? '#7a5a5e' : '#694a54', OUT, 1.2); for (let k = 0; k < 4; k++) { const x = 8 + k * (W - 16) / 3; h.P([[x - 4, H * .34], [x + 1, H * .05], [x + 5, H * .34]], TCOL.bone, OUT, 1); } h.E(W / 2, H * .5, 7, 5, TC, 'rgba(0,0,0,0.5)', 1); },
  rejuvenation_shrine(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.E(W / 2, H / 2 - 4, 26, 14, TCOL.Aud); h.E(W / 2, H / 2 - 4, 18, 9, '#1c3a55', null); BP.crystal(h, W / 2, H / 2 - 10, 16, '#7effd0'); BP.crystal(h, 18, H / 2 - 4, 8, '#7effd0'); BP.crystal(h, W - 18, H / 2 - 4, 8, '#7effd0'); for (let k = 0; k < 4; k++) { const a = k * 1.57 + .78; h.L(W / 2 + Math.cos(a) * 20, H / 2 - 4 + Math.sin(a) * 11, W / 2 + Math.cos(a) * 30, H / 2 - 4 + Math.sin(a) * 16, TCOL.Aul, 2); } },
  null_obelisk(h, c, W, H, TC) { BP.pBase(h, c, W, H, TC); h.P([[W / 2 - 11, H - 20], [W / 2 - 6, 6], [W / 2 + 6, 6], [W / 2 + 11, H - 20]], '#2a2038', OUT, 1.5); h.P([[W / 2 - 4, H - 22], [W / 2 - 2, 10], [W / 2 + 2, 10], [W / 2 + 3, H - 22]], '#5c4a7a', null); BP.crystal(h, W / 2, H / 2 - 8, 10, '#3a2a52'); h.C(W / 2, H / 2 - 12, 3, '#b48cff', null); BP.crystal(h, 18, H / 2 + 2, 7, '#3a2a52'); BP.crystal(h, W - 18, H / 2 + 2, 7, '#3a2a52'); },
  warded_bastion(h, c, W, H, TC) { h.P([[8, 4], [W - 8, 4], [W - 2, 14], [W - 2, H - 14], [W - 8, H - 6], [8, H - 6], [2, H - 14], [2, 14]], '#8b6c20', OUT, 1.5); h.P([[12, 9], [W - 12, 9], [W - 7, 16], [W - 7, H - 15], [W - 12, H - 11], [12, H - 11], [7, H - 15], [7, 16]], TCOL.Au, null); c.strokeStyle = 'rgba(255,240,200,0.3)'; c.lineWidth = 1; for (let k = 1; k < 3; k++) { c.beginPath(); c.moveTo(7 + k * (W - 14) / 3, 12); c.lineTo(7 + k * (W - 14) / 3, H - 13); c.stroke(); } for (let k = 0; k < 3; k++) BP.crystal(h, 20 + k * (W - 40) / 2, H / 2 - 4, 7); h.R(10, H - 10, W - 20, 4, 2, TC, null); },

  // ============================ NEUTRAL STRUCTURES (race 'N') ============================
  // One nest and three derelicts. See js/data.js for what each of them is for; what matters here is
  // that none of them may look like it belongs to a race. The nest is dirt and chitin in NCOL, the
  // derelicts are BP.ruinBase plus one silhouette feature each.
  //
  // THE NEST IS DRAWN AS IF IT WERE ALREADY OPEN, because by the time anything draws it, it is: while
  // it is buried the map shows the `vent` tell from UNIT_PAINTERS instead, and the structure sprite
  // only appears once the thing has surfaced. That is the same split the creatures use, and it is
  // why neither needs a second "buried" frame.
  carrion_warren(h, c, W, H, TC) {
    const { soil, soilD, soilL, chit, chitD, bone } = NCOL;
    h.E(W / 2, H * .58, W / 2 - 3, H * .42, soilD, OUT, 1.5);                          // the spoil heap
    h.E(W / 2, H * .52, W / 2 - 8, H * .32, soil, null);
    h.E(W / 2 - W * .06, H * .44, W * .28, H * .16, soilL, null);
    h.E(W / 2, H * .54, W * .19, H * .17, '#191309', OUT, 1.2);                        // the throat
    h.E(W / 2, H * .5, W * .12, H * .1, '#000', null);
    for (let k = 0; k < 7; k++) { const a = k * .9 + .35; const x = W / 2 + Math.cos(a) * (W * .3), y = H * .55 + Math.sin(a) * (H * .28); h.P([[x - 4, y + 3], [x + (k % 2 ? 2 : -1), y - 9 - (k % 3) * 3], [x + 5, y + 3]], k % 2 ? chit : bone, OUT, 1); }
    for (let k = 0; k < 4; k++) { const x = 8 + k * (W - 16) / 3; h.E(x, H - 9, 5, 3, '#231a11', null); h.E(x, H - 10, 7, 4, 'rgba(190,178,150,0.28)', null); }  // vent holes still smoking
    h.E(W / 2, H * .54, W * .07, H * .05, TC, 'rgba(0,0,0,0.5)', 1);
  },
  // 4x3. A shed with its roof open to the sky, a cold chimney and a dead gantry crane over the bay.
  derelict_foundry(h, c, W, H, TC) {
    const { rust, rustD, steel, steelD, ash } = NCOL;
    BP.ruinBase(h, c, W, H, TC, { bite: 0.3 });
    h.R(10, 20, 22, H - 30, 2, '#2a2723');                                             // the cold furnace
    h.R(13, 24, 16, 14, 1, ash, null);
    h.R(14, H * .5, 14, 6, 1, rustD, null);
    h.P([[36, 16], [46, 4], [56, 4], [50, 20]], steelD, OUT, 1.2);                     // the stack, snapped
    h.P([[46, 4], [56, 4], [54, 0], [48, 1]], rust, null);
    h.L(34, 26, W - 24, 30, steelD, 3);                                                // the gantry rail
    h.L(W * .55, 28, W * .55, H - 22, rust, 2);                                        // and the hook, dropped
    h.C(W * .55, H - 20, 4, rustD);
    for (let k = 0; k < 3; k++) h.R(W - 34 + k * 9, H - 26, 6, 14, 1, k === 1 ? '#26221d' : rustD, null);
    h.E(W * .3, H - 12, 13, 6, ash, null);
  },
  // 3x2. A slab of dark screens with a snapped data spire leaning off it, and its panels on the floor.
  derelict_archive(h, c, W, H, TC) {
    const { steel, steelD, ash, rust, dead } = NCOL;
    BP.ruinBase(h, c, W, H, TC, { bite: 0.24 });
    h.R(9, 18, W * .42, H - 30, 2, '#23262a');                                         // the screen wall
    for (let k = 0; k < 4; k++) { const x = 12 + (k % 2) * (W * .19), y = 21 + Math.floor(k / 2) * ((H - 34) / 2); h.R(x, y, W * .15, (H - 36) / 2, 1, k === 2 ? '#2f3d3a' : ash, null); }
    h.L(11, 24, 11 + W * .38, 24 + 3, 'rgba(120,150,140,0.25)', 1);                    // one pane still faintly lit by nothing
    h.P([[W * .62, H - 12], [W * .69, 8], [W * .76, 9], [W * .72, H - 12]], dead, OUT, 1.3);   // the spire, leaning
    h.P([[W * .69, 8], [W * .76, 9], [W * .84, 3]], steelD, null);                     // the broken tip
    h.L(W * .66, H * .5, W * .74, H * .5, rust, 1.5);
    for (let k = 0; k < 3; k++) h.P([[W - 26 + k * 8, H - 6], [W - 22 + k * 8, H - 14], [W - 16 + k * 8, H - 6]], k % 2 ? steel : ash, null);   // spilled panels
  },
  // 2x2. A lattice mast leaning off true with a cracked dish; the cabin at its foot is caved in.
  derelict_watchtower(h, c, W, H, TC) {
    const { steel, steelD, steelL, rust, rustD, ash, dead } = NCOL;
    h.P([[3, H - 20], [W - 6, H - 22], [W - 3, H - 3], [3, H - 3]], '#332f29', OUT, 1.5);   // the caved cabin
    h.R(6, H - 18, 10, 9, 1, ash, null);
    h.E(W * .62, H - 8, 8, 4, rustD, null);
    const mx = W * .48, lean = 5;                                                       // the mast, off true
    h.L(mx - 7, H - 20, mx - 2 + lean, 12, steelD, 3);
    h.L(mx + 7, H - 20, mx + 8 + lean, 13, steelD, 3);
    for (let k = 0; k < 4; k++) { const t = k / 4, y0 = H - 22 - k * ((H - 34) / 4), y1 = y0 - (H - 34) / 4; const x0 = mx - 6 + t * lean, x1 = mx + 6 + (t + .25) * lean; h.L(x0, y0, x1, y1, k === 2 ? rust : steel, 1.4); h.L(x1, y0, x0, y1, k === 1 ? rustD : steel, 1.4); }
    h.P([[mx + 2 + lean, 14], [mx + 13 + lean, 7], [mx + 13 + lean, 18], [mx + 3 + lean, 20]], dead, OUT, 1.2);   // the dish, cracked
    h.L(mx + 5 + lean, 10, mx + 11 + lean, 19, ash, 1.4);
    h.C(mx + 6 + lean, 14, 2, rustD, null);
    h.R(4, H - 10, Math.min(20, W / 2), 4, 1, TC, null); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(4, H - 10, Math.min(20, W / 2), 4);
  },
};
// Animated overlays drawn on top of static sprites each frame (world coords, x0/y0 = footprint top-left)
const BUILDING_ANIM = {
  command_center(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + H / 2 - 8; const a = f * 0.05; ctx.strokeStyle = '#e8eef4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 10); ctx.stroke(); },
  missile_turret(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + H / 2; const a = u.facing; ctx.fillStyle = '#5a636c'; ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-6, -7, 20, 14, 2); ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.beginPath(); ctx.roundRect(-6, -7, 22, 14, 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#c33'; ctx.fillRect(10, -5, 4, 3); ctx.fillRect(10, 2, 4, 3); ctx.restore(); },
  sunken_colony(ctx, u, x0, y0, W, H, f) { if (u.cooldown > 24) { const cx = x0 + W / 2, cy = y0 + H / 2, a = u.facing, len = 40 + (u.cooldown - 24) * 6; ctx.strokeStyle = '#6a3a48'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + Math.cos(a) * len * .5, cy + Math.sin(a) * len * .5 - 16, cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke(); ctx.strokeStyle = TCOL.bone; ctx.lineWidth = 2; ctx.stroke(); } },
  spawning_pool(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + H / 2 + 2; ctx.fillStyle = 'rgba(160,230,120,0.35)'; for (let k = 0; k < 3; k++) { const t = ((f / 40) + k / 3) % 1; ctx.beginPath(); ctx.arc(cx + Math.cos(k * 2.1) * 14, cy + Math.sin(k * 2.1) * 7, 2 + t * 6, 0, 7); ctx.fill(); } },
  gateway(ctx, u, x0, y0, W, H, f) { if (u.unpowered) return; const cx = x0 + W / 2, cy = y0 + H / 2 - 8; ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 3; k++) { ctx.strokeStyle = 'rgba(90,180,255,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 8 + k * 6, f * 0.06 + k, f * 0.06 + k + 2.2); ctx.stroke(); } ctx.restore(); },
  stargate(ctx, u, x0, y0, W, H, f) { if (u.unpowered) return; const cx = x0 + W / 2, cy = y0 + H / 2 - 6; ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 3; k++) { ctx.strokeStyle = 'rgba(90,180,255,0.3)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, cy, 10 + k * 7, 7 + k * 5, 0, f * 0.05 + k, f * 0.05 + k + 2.5); ctx.stroke(); } ctx.restore(); },
  pylon(ctx, u, x0, y0, W, H, f) { if (!u.done) return; const cx = x0 + W / 2, cy = y0 + H / 2; const a = 0.35 + Math.sin(f * 0.1) * 0.15; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26); g.addColorStop(0, `rgba(120,200,255,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.fill(); ctx.restore(); },
  nexus(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + H / 2 - 12; const a = 0.3 + Math.sin(f * 0.08) * 0.12; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34); g.addColorStop(0, `rgba(120,200,255,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 34, 0, 7); ctx.fill(); ctx.restore(); },
  photon_cannon(ctx, u, x0, y0, W, H, f) { if (u.unpowered) return; const cx = x0 + W / 2, cy = y0 + H / 2 - 6; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 16); g.addColorStop(0, 'rgba(140,220,255,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 7); ctx.fill(); ctx.restore(); },
  hatchery(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + H * .36; const s = 1 + Math.sin(f * 0.07 + u.id) * 0.06; ctx.fillStyle = 'rgba(190,150,150,0.25)'; ctx.beginPath(); ctx.ellipse(cx - 6, cy, 22 * s, 16 * s, 0, 0, 7); ctx.fill(); },
  extractor(ctx, u, x0, y0, W, H, f) { if ((f + u.id) % 20 < 10) { ctx.fillStyle = 'rgba(120,255,140,0.25)'; ctx.beginPath(); ctx.arc(x0 + W / 2 + ((f + u.id) % 20) - 5, y0 + H / 2 - 10 - ((f + u.id) % 20), 5, 0, 7); ctx.fill(); } },
  // The six aura buildings say so on the sprite: a field nobody can see is a field nobody plays around.
  // These are the cheap half of that -- a local tell at the building, strokes and small fills only, no
  // per-instance gradient (M8 measured one at 0.8 ms a frame). Drawing the radius itself belongs with
  // the sim change that gives the radius meaning, and with whoever owns js/render.js.
  aid_station(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + 22; const a = 0.35 + Math.sin(f * 0.09) * 0.3; ctx.fillStyle = `rgba(120,255,170,${a})`; ctx.fillRect(cx - 2, cy - 7, 4, 14); ctx.fillRect(cx - 7, cy - 2, 14, 4); },
  scrambler_mast(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + 9; for (let k = 0; k < 2; k++) { const t = ((f / 34) + k / 2) % 1; ctx.strokeStyle = `rgba(120,200,255,${0.45 * (1 - t)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, 6 + t * 24, 3 + t * 12, 0, 0, 7); ctx.stroke(); } },
  // M12 wave four. Three of the four say what they are by MOVING, which is the cheapest way to
  // separate a new 2x2 from the four 2x2s beside it: strokes and small fills only, no per-instance
  // gradient (M8 measured one of those at 0.8 ms a frame).
  orbital_command(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2 + 16, cy = y0 + H / 2 - 30; for (let k = 0; k < 2; k++) { const t = ((f / 52) + k / 2) % 1; ctx.strokeStyle = `rgba(140,215,255,${0.4 * (1 - t)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, 8 + t * 30, 4 + t * 15, 0, 0, 7); ctx.stroke(); } },
  sensor_tower(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + 11; const a = f * 0.04; const dx = Math.cos(a) * 26, dy = Math.sin(a) * 9; ctx.strokeStyle = '#c8d2da'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke(); ctx.fillStyle = `rgba(110,255,160,${0.5 + Math.sin(f * 0.12) * 0.35})`; ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 2.5, 0, 7); ctx.fill(); },
  reactor(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + H / 2 - 2; const a = 0.35 + Math.sin(f * 0.08) * 0.25; ctx.strokeStyle = `rgba(120,235,255,${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.stroke(); ctx.fillStyle = `rgba(200,245,255,${a})`; ctx.beginPath(); ctx.arc(cx, cy, 4 + Math.sin(f * 0.08) * 1.5, 0, 7); ctx.fill(); },
  mending_pool(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + H / 2 + 2; ctx.fillStyle = 'rgba(150,240,200,0.35)'; for (let k = 0; k < 3; k++) { const t = ((f / 44) + k / 3) % 1; ctx.beginPath(); ctx.arc(cx + Math.cos(k * 2.1) * 12, cy + Math.sin(k * 2.1) * 6 - t * 10, 1.5 + t * 4, 0, 7); ctx.fill(); } },
  miasma_gland(ctx, u, x0, y0, W, H, f) { const cx = x0 + W / 2, cy = y0 + H / 2; for (let k = 0; k < 3; k++) { const t = ((f / 56) + k / 3) % 1; ctx.fillStyle = `rgba(170,120,200,${0.3 * (1 - t)})`; ctx.beginPath(); ctx.ellipse(cx + Math.cos(k * 2.1 + t * 1.2) * (6 + t * 18), cy + Math.sin(k * 2.1) * 5 - t * 6, 4 + t * 7, 3 + t * 5, 0, 0, 7); ctx.fill(); } },
  rejuvenation_shrine(ctx, u, x0, y0, W, H, f) { if (u.unpowered) return; const cx = x0 + W / 2, cy = y0 + H / 2 - 8; const t = (f / 60) % 1; ctx.strokeStyle = `rgba(126,255,208,${0.5 * (1 - t)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, 8 + t * 22, 5 + t * 13, 0, 0, 7); ctx.stroke(); },
  null_obelisk(ctx, u, x0, y0, W, H, f) { if (u.unpowered) return; const cx = x0 + W / 2, cy = y0 + H / 2 - 8; const t = (f / 70) % 1; ctx.strokeStyle = `rgba(180,140,255,${0.45 * t})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, 30 - t * 24, 17 - t * 13, 0, 0, 7); ctx.stroke(); },

  // ---- race 'N' -------------------------------------------------------------------------------
  // The nest breathes whether or not anybody woke it, because a nest you can hear is a nest you were
  // warned about -- the same argument as the buried tell, one layer up.
  carrion_warren(ctx, u, x0, y0, W, H, f) {
    const cx = x0 + W / 2, cy = y0 + H * .52;
    const b = 1 + Math.sin((f + (u.id || 0) * 13) * 0.045) * 0.14;
    ctx.fillStyle = 'rgba(24,18,10,0.5)'; ctx.beginPath(); ctx.ellipse(cx, cy, W * .12 * b, H * .1 * b, 0, 0, 7); ctx.fill();
    for (let k = 0; k < 3; k++) { const t = ((f / 70) + k / 3) % 1; ctx.fillStyle = `rgba(190,178,150,${0.22 * (1 - t)})`; ctx.beginPath(); ctx.ellipse(cx + Math.cos(k * 2.1) * 12, cy - t * 12, 3 + t * 7, 2 + t * 5, 0, 0, 7); ctx.fill(); }
  },
  // THE ONLY THING IN THE DRAW PASS THAT KNOWS A DERELICT WAS CAPTURED.
  // Sprites.building caches the static sprite per (id, colour) and hands the painter no unit, so a
  // painter cannot branch on state; an animated overlay is handed the unit and can. `u.captured` is
  // the field js/game.js sets on capture (see the derelict contract in js/data.js). It is absent
  // everywhere else -- on a derelict nobody has taken, and on the fake unit a test or a command-card
  // icon passes in -- and absent means "still a wreck", which is why the test is written this way
  // round rather than as `if (!u.captured) return` plus a ruin overlay.
  derelict_foundry(ctx, u, x0, y0, W, H, f) {
    if (!u.captured) return;
    const g = 0.4 + Math.sin(f * 0.07) * 0.22;
    ctx.fillStyle = `rgba(255,150,60,${g})`; ctx.fillRect(x0 + 13, y0 + 24, 16, 14);           // the furnace, relit
    ctx.fillStyle = `rgba(255,210,120,${0.5 + Math.sin(f * 0.11) * 0.3})`;
    for (let k = 0; k < 3; k++) ctx.fillRect(x0 + W - 34 + k * 9, y0 + H - 24, 6, 4);
  },
  derelict_archive(ctx, u, x0, y0, W, H, f) {
    if (!u.captured) return;
    for (let k = 0; k < 4; k++) {                                                              // screens waking one at a time
      const t = ((f / 26) + k * 0.31) % 1; if (t > 0.72) continue;
      ctx.fillStyle = `rgba(120,220,200,${0.18 + t * 0.3})`;
      ctx.fillRect(x0 + 12 + (k % 2) * (W * .19), y0 + 21 + Math.floor(k / 2) * ((H - 34) / 2), W * .15, (H - 36) / 2);
    }
  },
  derelict_watchtower(ctx, u, x0, y0, W, H, f) {
    if (!u.captured) return;
    const cx = x0 + W * .54 + 5, cy = y0 + 14;                                                 // the dish, sweeping
    for (let k = 0; k < 2; k++) { const t = ((f / 48) + k / 2) % 1; ctx.strokeStyle = `rgba(150,220,255,${0.4 * (1 - t)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, 5 + t * 26, 3 + t * 15, 0, 0, 7); ctx.stroke(); }
    ctx.fillStyle = `rgba(255,90,70,${0.4 + Math.sin(f * 0.13) * 0.35})`; ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, 7); ctx.fill();
  },
};
BUILDING_ANIM.lair = BUILDING_ANIM.hatchery; BUILDING_ANIM.hive = BUILDING_ANIM.hatchery; BUILDING_ANIM.refinery = BUILDING_ANIM.extractor; BUILDING_ANIM.assimilator = BUILDING_ANIM.extractor;
