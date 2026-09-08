'use strict';
// ============================================================================
// Terrain renderer: procedural "Badlands"-style tileset. Chunk-cached.
// ============================================================================
// ---------------------------------------------------------------------------
// Tilesets. Everything that makes a biome look like itself is a colour, so a
// set is just a palette: the two ground materials, the ramp, the rock faces
// and the doodads. Adding another means adding an entry here, nothing else.
// ---------------------------------------------------------------------------
const TILESETS = {
  badlands: {
    name: 'Badlands',
    low: (n, c) => { let r = 112 + n * 46, g = 90 + n * 38, b = 58 + n * 24; const crack = c > 0.9 ? (c - 0.9) * 6 : 0; return [r - crack * 45, g - crack * 38, b - crack * 26]; },
    high: (n, c) => { let r = 138 + n * 40, g = 122 + n * 34, b = 96 + n * 26; const plate = c > 0.93 ? (c - 0.93) * 8 : 0; return [r - plate * 40, g - plate * 36, b - plate * 30]; },
    ramp: n => [128 + n * 30, 114 + n * 26, 86 + n * 20],
    rock: k => [70 * k + 20, 66 * k + 18, 60 * k + 16],
    slope: k => [96 * k + 22, 80 * k + 18, 60 * k + 14],
    face: ['rgba(150,120,90,0.55)', 'rgba(90,66,48,0.35)', 'rgba(30,20,14,0.75)'],
    crack: 'rgba(20,12,8,0.5)', rim: 'rgba(255,240,210,0.28)',
    rubbleShade: 'rgba(40,28,20,0.6)', rubble: k => 'rgb(' + (110 + k * 12) + ',' + (92 + k * 10) + ',' + (70 + k * 8) + ')',
    boulder: ['#8a8478', '#3b352e'], pebble: '#9a8a72',
    flora: 'rgba(90,110,50,0.75)',
    crater: ['rgba(40,28,18,0.55)', 'rgba(60,44,30,0.35)', 'rgba(200,170,130,0.25)'],
  },
  jungle: {
    name: 'Jungle',
    // wet moss over dark loam, and a lighter grassy plateau above it
    // dark wet loam below, drier olive scrub on the plateau; the gap between the two is what reads as
    // height, so it is deliberately wider than the colours are saturated
    low: (n, c) => { let r = 46 + n * 24, g = 62 + n * 30, b = 38 + n * 16; const wet = c > 0.9 ? (c - 0.9) * 6 : 0; return [r - wet * 20, g - wet * 26, b - wet * 14]; },
    high: (n, c) => { let r = 112 + n * 36, g = 126 + n * 38, b = 74 + n * 22; const plate = c > 0.93 ? (c - 0.93) * 8 : 0; return [r - plate * 34, g - plate * 38, b - plate * 24]; },
    ramp: n => [86 + n * 26, 96 + n * 28, 58 + n * 18],
    rock: k => [46 * k + 16, 54 * k + 20, 40 * k + 14],
    slope: k => [70 * k + 18, 88 * k + 22, 52 * k + 12],
    face: ['rgba(96,124,74,0.55)', 'rgba(52,72,44,0.4)', 'rgba(14,24,14,0.78)'],
    crack: 'rgba(10,18,10,0.5)', rim: 'rgba(210,240,190,0.3)',
    rubbleShade: 'rgba(18,30,18,0.6)', rubble: k => 'rgb(' + (74 + k * 10) + ',' + (96 + k * 12) + ',' + (58 + k * 8) + ')',
    boulder: ['#6f7d5e', '#252e22'], pebble: '#7b8a68',
    flora: 'rgba(120,190,70,0.85)',
    crater: ['rgba(18,30,16,0.55)', 'rgba(34,52,30,0.4)', 'rgba(170,210,140,0.28)'],
  },
  ice: {
    name: 'Ice',
    // Shadowed blue ice below, wind-packed snow above. Snow is nearly white, so the low ground has to
    // carry all the colour: the gap between the two is in value, not saturation, or the whole map reads
    // as one flat sheet with the cliffs invisible.
    low: (n, c) => { let r = 84 + n * 34, g = 110 + n * 38, b = 140 + n * 40; const crev = c > 0.9 ? (c - 0.9) * 6 : 0; return [r - crev * 46, g - crev * 40, b - crev * 26]; },
    high: (n, c) => { let r = 188 + n * 42, g = 202 + n * 40, b = 218 + n * 34; const drift = c > 0.93 ? (c - 0.93) * 8 : 0; return [r - drift * 30, g - drift * 26, b - drift * 16]; },
    ramp: n => [156 + n * 34, 172 + n * 32, 194 + n * 30],
    rock: k => [52 * k + 30, 66 * k + 40, 86 * k + 56],
    slope: k => [110 * k + 40, 130 * k + 52, 156 * k + 70],
    face: ['rgba(206,228,246,0.6)', 'rgba(96,132,170,0.4)', 'rgba(14,26,44,0.78)'],
    crack: 'rgba(18,40,70,0.5)', rim: 'rgba(255,255,255,0.4)',
    rubbleShade: 'rgba(24,44,72,0.55)', rubble: k => 'rgb(' + (150 + k * 14) + ',' + (176 + k * 14) + ',' + (202 + k * 12) + ')',
    boulder: ['#cfe4f2', '#3a5170'], pebble: '#b6cadb',
    flora: 'rgba(70,110,90,0.7)',
    crater: ['rgba(28,50,78,0.5)', 'rgba(60,92,126,0.35)', 'rgba(240,250,255,0.3)'],
  },
  desert: {
    name: 'Desert',
    // The hard part is not looking like Badlands, which is already tan. Badlands is a brown lowland
    // with a slightly lighter plateau; Desert inverts the relationship -- a dark rusted canyon floor
    // under bleached sand mesas -- so the two read apart at a glance even though both are warm. The
    // value gap (146 -> 214 in red) is doing the work; the hue only says which desert it is.
    low: (n, c) => { let r = 146 + n * 40, g = 96 + n * 32, b = 58 + n * 22; const dry = c > 0.9 ? (c - 0.9) * 6 : 0; return [r - dry * 40, g - dry * 30, b - dry * 20]; },
    high: (n, c) => { let r = 214 + n * 34, g = 190 + n * 32, b = 142 + n * 26; const ripple = c > 0.93 ? (c - 0.93) * 8 : 0; return [r - ripple * 26, g - ripple * 28, b - ripple * 30]; },
    ramp: n => [186 + n * 32, 156 + n * 30, 110 + n * 24],
    rock: k => [92 * k + 30, 60 * k + 20, 38 * k + 14],
    slope: k => [128 * k + 32, 96 * k + 22, 62 * k + 16],
    face: ['rgba(226,190,140,0.55)', 'rgba(128,84,50,0.4)', 'rgba(38,20,10,0.76)'],
    crack: 'rgba(48,24,10,0.5)', rim: 'rgba(255,246,214,0.32)',
    rubbleShade: 'rgba(58,32,14,0.6)', rubble: k => 'rgb(' + (176 + k * 14) + ',' + (144 + k * 12) + ',' + (100 + k * 10) + ')',
    boulder: ['#b08a5e', '#4a3020'], pebble: '#c2a074',
    flora: 'rgba(126,140,64,0.7)',   // scrub, not grass: a desert with green in it stops reading as one
    crater: ['rgba(56,30,12,0.55)', 'rgba(92,58,28,0.35)', 'rgba(240,214,168,0.28)'],
  },
  space: {
    name: 'Space Platform',
    // Unlit deck in the platform's shadow below, hull plating catching a distant sun above, so the
    // value gap is the widest of the five on purpose: on a space platform the cliff edge is the edge
    // of the world and it has to be unmissable. The low ground is a dark slate rather than the black
    // it wants to be, because it is walkable -- units fight on it, and fog darkens it again on top of
    // whatever this returns. Cracks read as panel seams rather than fractures, which is why the crack
    // colour is darker than the low ground instead of a tint of it.
    low: (n, c) => { let r = 58 + n * 26, g = 66 + n * 30, b = 84 + n * 36; const seam = c > 0.9 ? (c - 0.9) * 6 : 0; return [r - seam * 22, g - seam * 26, b - seam * 32]; },
    high: (n, c) => { let r = 128 + n * 40, g = 136 + n * 42, b = 152 + n * 46; const panel = c > 0.93 ? (c - 0.93) * 8 : 0; return [r - panel * 44, g - panel * 46, b - panel * 48]; },
    ramp: n => [104 + n * 34, 112 + n * 36, 130 + n * 40],
    rock: k => [64 * k + 26, 72 * k + 30, 88 * k + 38],
    slope: k => [86 * k + 28, 96 * k + 32, 116 * k + 42],
    face: ['rgba(168,196,224,0.6)', 'rgba(64,84,112,0.42)', 'rgba(4,6,12,0.85)'],
    crack: 'rgba(6,10,18,0.6)', rim: 'rgba(226,244,255,0.45)',
    rubbleShade: 'rgba(8,12,22,0.6)', rubble: k => 'rgb(' + (108 + k * 16) + ',' + (118 + k * 16) + ',' + (138 + k * 16) + ')',
    boulder: ['#8fa2b8', '#232c3a'], pebble: '#7e8ea2',
    flora: 'rgba(70,150,150,0.6)',   // no plants in vacuum; this slot is the only place a hull light can live
    crater: ['rgba(6,10,18,0.6)', 'rgba(40,54,74,0.35)', 'rgba(200,230,255,0.3)'],
  },
};
const Terrain = {
  CH: 8, chunks: new Map(), seed: 1, creepPat: null, mini: null, setId: 'badlands',
  get pal() { return TILESETS[this.setId] || TILESETS.badlands; },
  hash(x, y) { let h = (x * 374761393 + y * 668265263 + this.seed * 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; },
  vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = this.hash(xi, yi), b = this.hash(xi + 1, yi), c = this.hash(xi, yi + 1), d = this.hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; },
  fbm(x, y, o = 3) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += this.vnoise(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.1; } return s / n; },
  ridge(x, y) { return 1 - Math.abs(this.vnoise(x, y) * 2 - 1); },
  reset(seed) { this.seed = seed; this.setId = (G.map && G.map.tileset) || 'badlands'; this.chunks.clear(); this.creepPat = null; this.mini = null; },
  // palette
  // ---- period look ------------------------------------------------------
  // The games this is imitating rendered to a small palette and covered the seams with an ordered
  // dither, and that crunch is most of what makes them look like themselves. A smooth gradient is a
  // 2010s look no matter what colours are in it. BAYER is the classic 4x4 threshold matrix; STEP is
  // how many values a channel is allowed (255/STEP of them), and the dither is what stops the bands
  // it creates from reading as bands.
  //
  // All of this happens while a chunk is being baked into its canvas, so it costs nothing per frame.
  BAYER: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5],
  STEP: 13,
  bayerAt(x, y) { return this.BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5; },
  posterise(col, x, y) {
    const t = this.bayerAt(x, y) * this.STEP;
    for (let k = 0; k < 3; k++) { let v = Math.round((col[k] + t) / this.STEP) * this.STEP; col[k] = v < 0 ? 0 : v > 255 ? 255 : v; }
    return col;
  },
  lowCol(n, c) { return this.pal.low(n, c); },   // n noise 0..1, c crack 0..1
  highCol(n, c) { return this.pal.high(n, c); },
  rampCol(n) { return this.pal.ramp(n); },
  getChunk(cx, cy) {
    const key = cx + ',' + cy; let c = this.chunks.get(key); if (c) return c;
    c = this.renderChunk(cx, cy); this.chunks.set(key, c); return c;
  },
  renderChunk(cx, cy) {
    const m = G.map, CH = this.CH, px = CH * TILE; const cv = document.createElement('canvas'); cv.width = px; cv.height = px; const x = cv.getContext('2d');
    const img = x.createImageData(px, px); const d = img.data; const ox = cx * CH * TILE, oy = cy * CH * TILE;
    const hAt = (tx, ty) => { if (!m.inb(tx, ty)) return 1; const i = m.idx(tx, ty); if (m.cliff[i] === 2) return -1; if (m.cliff[i] === 1) return 1; return m.height[i] === 2 ? 1 : m.height[i] === 1 ? 0.5 : 0; };
    for (let py = 0; py < px; py++) for (let pxx = 0; pxx < px; pxx++) {
      const wx = ox + pxx, wy = oy + py; const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
      const i = m.inb(tx, ty) ? m.idx(tx, ty) : -1; const cl = i >= 0 ? m.cliff[i] : 2;
      const n = this.fbm(wx / 40, wy / 40, 3) * 0.7 + this.vnoise(wx / 7, wy / 7) * 0.3, n2 = this.vnoise(wx / 9, wy / 9), cr = this.ridge(wx / 44, wy / 44);
      let col;
      if (cl === 2) { col = this.pal.rock(0.45 + n * 0.35); }
      else if (cl === 1) { const s = this.vnoise(wx / 6, wy / 20); col = this.pal.slope(0.5 + n * 0.3 + (s > 0.6 ? 0.15 : 0)); }
      else {
        // bilinear blend of neighbouring tile heights for smooth material transitions
        const fx = (wx - TILE / 2) / TILE, fy = (wy - TILE / 2) / TILE; const x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
        const h00 = hAt(x0, y0), h10 = hAt(x0 + 1, y0), h01 = hAt(x0, y0 + 1), h11 = hAt(x0 + 1, y0 + 1);
        const fix = h => h < 0 ? 0 : h; let w = fix(h00) * (1 - u) * (1 - v) + fix(h10) * u * (1 - v) + fix(h01) * (1 - u) * v + fix(h11) * u * v;
        w += (n2 - 0.5) * 0.35; w = w < 0 ? 0 : w > 1 ? 1 : w;
        const lo = this.lowCol(n, cr), hi = this.highCol(n, cr);
        // Dithered transition rather than a blend. Between the two materials the pixel picks one or
        // the other against the Bayer threshold instead of averaging them, which is how a 90s tileset
        // joined two ground types -- an interlocking speckle, not an airbrushed ramp. Outside that
        // band it is still a straight blend, so open ground stays smooth and only the seam speckles.
        const edge = w > 0.28 && w < 0.72;
        if (edge) { const pick = (w - 0.28) / 0.44 > this.bayerAt(wx, wy) + 0.5 ? hi : lo; col = [pick[0], pick[1], pick[2]]; }
        else col = [lo[0] + (hi[0] - lo[0]) * w, lo[1] + (hi[1] - lo[1]) * w, lo[2] + (hi[2] - lo[2]) * w];
        if (i >= 0 && m.height[i] === 1) { const rc = this.rampCol(n); col = [(col[0] + rc[0]) / 2, (col[1] + rc[1]) / 2, (col[2] + rc[2]) / 2]; }
        // grain
        const g = (this.hash(wx, wy) - 0.5) * 14; col[0] += g; col[1] += g; col[2] += g;
      }
      this.posterise(col, wx, wy);
      const o = (py * px + pxx) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // ---- vector pass: cliff faces, rims, shadows, ramps, doodads ----
    const t0x = cx * CH, t0y = cy * CH;
    for (let ty = t0y - 1; ty < t0y + CH + 1; ty++) for (let tx = t0x - 1; tx < t0x + CH + 1; tx++) {
      if (!m.inb(tx, ty)) continue; const i = m.idx(tx, ty); const lx = tx * TILE - ox, ly = ty * TILE - oy;
      const cl = m.cliff[i], h = m.height[i];
      if (cl === 1) {
        const southLow = m.inb(tx, ty + 1) && m.cliff[m.idx(tx, ty + 1)] === 0 && m.height[m.idx(tx, ty + 1)] !== 2;
        const northHigh = m.inb(tx, ty - 1) && m.cliff[m.idx(tx, ty - 1)] === 0 && m.height[m.idx(tx, ty - 1)] === 2;
        if (southLow) { // visible rock face
          const g = x.createLinearGradient(0, ly, 0, ly + TILE); g.addColorStop(0, this.pal.face[0]); g.addColorStop(0.35, this.pal.face[1]); g.addColorStop(1, this.pal.face[2]); x.fillStyle = g; x.fillRect(lx, ly, TILE, TILE);
          x.strokeStyle = this.pal.crack; x.lineWidth = 1; for (let k = 0; k < 4; k++) { const sx = lx + 4 + this.hash(tx * 7 + k, ty) * 24; x.beginPath(); x.moveTo(sx, ly + 6); x.lineTo(sx + (this.hash(tx, ty * 3 + k) - .5) * 8, ly + TILE); x.stroke(); }
          x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(lx, ly + TILE, TILE, 7); x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(lx, ly + TILE + 7, TILE, 5);
        } else { // rubble edge
          for (let k = 0; k < 3; k++) { const bx = lx + 6 + this.hash(tx * 3 + k, ty * 5) * 20, by = ly + 6 + this.hash(tx * 5, ty * 3 + k) * 20, br = 4 + this.hash(tx + k, ty - k) * 6; x.fillStyle = this.pal.rubbleShade; x.beginPath(); x.ellipse(bx + 1.5, by + 1.5, br, br * .7, 0, 0, 7); x.fill(); x.fillStyle = this.pal.rubble(k); x.beginPath(); x.ellipse(bx, by, br, br * .7, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(255,240,220,0.25)'; x.beginPath(); x.ellipse(bx - br * .3, by - br * .3, br * .4, br * .25, 0, 0, 7); x.fill(); }
        }
        if (northHigh) { x.fillStyle = this.pal.rim; x.fillRect(lx, ly, TILE, 3); }
      } else if (cl === 2) { // boulders
        const nb = 2 + Math.floor(this.hash(tx, ty) * 3);
        for (let k = 0; k < nb; k++) { const bx = lx + 4 + this.hash(tx * 11 + k, ty) * 24, by = ly + 4 + this.hash(tx, ty * 11 + k) * 24, br = 6 + this.hash(tx * 3 + k, ty * 7) * 9; x.fillStyle = 'rgba(0,0,0,0.45)'; x.beginPath(); x.ellipse(bx + 3, by + 3, br, br * .75, 0, 0, 7); x.fill(); const g = x.createRadialGradient(bx - br * .4, by - br * .4, 1, bx, by, br); g.addColorStop(0, this.pal.boulder[0]); g.addColorStop(1, this.pal.boulder[1]); x.fillStyle = g; x.beginPath(); x.ellipse(bx, by, br, br * .75, 0, 0, 7); x.fill(); }
      } else if (h === 1) { // ramp shading: steps
        const up = m.inb(tx, ty - 1) && m.height[m.idx(tx, ty - 1)] === 2, dn = m.inb(tx, ty + 1) && m.height[m.idx(tx, ty + 1)] === 2, lf = m.inb(tx - 1, ty) && m.height[m.idx(tx - 1, ty)] === 2 && !m.cliff[m.idx(tx - 1, ty)], rt = m.inb(tx + 1, ty) && m.height[m.idx(tx + 1, ty)] === 2 && !m.cliff[m.idx(tx + 1, ty)];
        const vertical = !(lf || rt) || up || dn;
        for (let k = 0; k < 4; k++) { x.fillStyle = k % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.07)'; if (vertical) x.fillRect(lx, ly + k * 8, TILE, 8); else x.fillRect(lx + k * 8, ly, 8, TILE); }
        x.fillStyle = 'rgba(0,0,0,0.25)'; if (vertical) { x.fillRect(lx, ly, 3, TILE); x.fillRect(lx + TILE - 3, ly, 3, TILE); } else { x.fillRect(lx, ly, TILE, 3); x.fillRect(lx, ly + TILE - 3, TILE, 3); }
      } else if (h === 0 && m.walk[i]) { // low ground doodads
        const r = this.hash(tx * 13, ty * 17);
        if (r < 0.025) { const cxp = lx + 16, cyp = ly + 16, cr = 8 + r * 200; x.strokeStyle = this.pal.crater[0]; x.lineWidth = 3; x.beginPath(); x.ellipse(cxp, cyp, cr, cr * .7, 0, 0, 7); x.stroke(); x.fillStyle = this.pal.crater[1]; x.beginPath(); x.ellipse(cxp, cyp, cr - 2, cr * .7 - 2, 0, 0, 7); x.fill(); x.strokeStyle = this.pal.crater[2]; x.lineWidth = 1.5; x.beginPath(); x.ellipse(cxp, cyp - 1, cr, cr * .7, 0, Math.PI, Math.PI * 2); x.stroke(); }
        else if (r < 0.07) { x.strokeStyle = this.pal.flora; x.lineWidth = 1.5; const gx = lx + 8 + this.hash(tx, ty + 99) * 16, gy = ly + 10 + this.hash(tx + 99, ty) * 16; for (let k = 0; k < 6; k++) { x.beginPath(); x.moveTo(gx, gy + 6); x.lineTo(gx + (k - 2.5) * 2.4, gy - 4 - this.hash(k, tx + ty) * 6); x.stroke(); } }
        else if (r < 0.10) { for (let k = 0; k < 3; k++) { const bx = lx + 6 + this.hash(tx + k, ty * 2) * 20, by = ly + 6 + this.hash(tx * 2, ty + k) * 20, br = 2 + this.hash(tx * k + 1, ty) * 3; x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(bx + 1, by + 1, br, br * .7, 0, 0, 7); x.fill(); x.fillStyle = this.pal.pebble; x.beginPath(); x.ellipse(bx, by, br, br * .7, 0, 0, 7); x.fill(); } }
        // Four more low-ground doodads. Open ground was three kinds of thing spread over 7.5% of
        // tiles, so most of a map was bare noise; these take it to about 15% and, more to the point,
        // give the eye something with a straight edge on it. Every one of them is drawn from `hash`,
        // which is a pure function of the tile, so a chunk redrawn after a resize is identical.
        else if (r < 0.115) { // dry stream bed: a few linked scours
          x.strokeStyle = this.pal.crack; x.lineWidth = 2.5; x.lineCap = 'round'; x.beginPath();
          let sx = lx + 2, sy = ly + 6 + this.hash(tx, ty * 3) * 20; x.moveTo(sx, sy);
          for (let k = 1; k <= 3; k++) x.lineTo(lx + k * 10, sy + (this.hash(tx + k, ty) - 0.5) * 14);
          x.stroke(); x.strokeStyle = this.pal.rim; x.lineWidth = 1; x.stroke();
        }
        else if (r < 0.128) { // bleached bones / debris: three short pale strokes
          const bx = lx + 8 + this.hash(tx * 3, ty) * 14, by = ly + 10 + this.hash(tx, ty * 5) * 14;
          x.strokeStyle = 'rgba(226,220,198,0.5)'; x.lineWidth = 2; x.lineCap = 'round';
          for (let k = 0; k < 3; k++) { const a = this.hash(tx + k * 5, ty + k) * 3.14; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(a) * 9, by + Math.sin(a) * 6); x.stroke(); }
        }
        else if (r < 0.142) { // a single larger boulder with a lit cap, to break the pebble rhythm
          const bx = lx + 10 + this.hash(tx * 2, ty * 3) * 12, by = ly + 12 + this.hash(tx * 3, ty * 2) * 10, br = 5 + this.hash(tx, ty) * 4;
          x.fillStyle = this.pal.rubbleShade; x.beginPath(); x.ellipse(bx + 2, by + 2, br, br * .72, 0, 0, 7); x.fill();
          x.fillStyle = this.pal.boulder[1]; x.beginPath(); x.ellipse(bx, by, br, br * .72, 0, 0, 7); x.fill();
          x.fillStyle = this.pal.boulder[0]; x.beginPath(); x.ellipse(bx - br * .2, by - br * .3, br * .62, br * .42, 0, 0, 7); x.fill();
        }
        else if (r < 0.155) { // scorch/vent stain, a soft dark patch that is not a crater
          const bx = lx + 16, by = ly + 16, br = 8 + this.hash(tx * 5, ty * 5) * 7;
          const g = x.createRadialGradient(bx, by, 1, bx, by, br); g.addColorStop(0, this.pal.crack); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.beginPath(); x.ellipse(bx, by, br, br * .7, 0, 0, 7); x.fill();
        }
      } else if (h === 2 && !cl && m.walk[i]) { // plateau plate seams
        const r = this.hash(tx * 7, ty * 19); if (r < 0.06) { x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1; x.beginPath(); x.moveTo(lx + 2, ly + 30); x.lineTo(lx + 14, ly + 12); x.lineTo(lx + 30, ly + 6); x.stroke(); x.strokeStyle = 'rgba(255,255,255,0.08)'; x.beginPath(); x.moveTo(lx + 3, ly + 31); x.lineTo(lx + 15, ly + 13); x.lineTo(lx + 31, ly + 7); x.stroke(); }
      }
    }
    return cv;
  },
  draw(ctx, camX, camY, vw, vh) {
    const CH = this.CH * TILE; const x0 = Math.floor(camX / CH), y0 = Math.floor(camY / CH), x1 = Math.floor((camX + vw) / CH), y1 = Math.floor((camY + vh) / CH);
    const maxC = Math.ceil(G.map.w / this.CH);
    for (let cy = Math.max(0, y0); cy <= Math.min(maxC - 1, y1); cy++) for (let cx = Math.max(0, x0); cx <= Math.min(maxC - 1, x1); cx++) ctx.drawImage(this.getChunk(cx, cy), cx * CH - camX, cy * CH - camY);
  },
  creepPattern(ctx) {
    if (this.creepPat) return this.creepPat;
    const S = 192; const cv = document.createElement('canvas'); cv.width = S; cv.height = S; const x = cv.getContext('2d'); const img = x.createImageData(S, S); const d = img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) { const n = this.fbm(px / 22 + 500, py / 22 + 500, 3); const v = this.ridge(px / 14 + 900, py / 14 + 900); const o = (py * S + px) * 4; let r = 70 + n * 60, g = 30 + n * 28, b = 84 + n * 60; if (v > 0.88) { r -= 30; g -= 12; b -= 30; } d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255; }
    x.putImageData(img, 0, 0);
    for (let k = 0; k < 40; k++) { const bx = this.hash(k, 3) * S, by = this.hash(3, k) * S, br = 3 + this.hash(k, k) * 7; const g = x.createRadialGradient(bx - br * .3, by - br * .3, 0, bx, by, br); g.addColorStop(0, 'rgba(190,120,200,0.55)'); g.addColorStop(1, 'rgba(60,20,70,0.0)'); x.fillStyle = g; x.beginPath(); x.arc(bx, by, br, 0, 7); x.fill(); }
    this.creepPat = ctx.createPattern(cv, 'repeat'); this.creepPatCanvas = cv; return this.creepPat;
  },
  buildMini() {
    const m = G.map; const cv = document.createElement('canvas'); cv.width = m.w; cv.height = m.h; const x = cv.getContext('2d'); const img = x.createImageData(m.w, m.h); const d = img.data;
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) { const i = m.idx(tx, ty); let c; if (m.cliff[i] === 2) c = [40, 36, 32]; else if (m.cliff[i] === 1) c = [72, 54, 40]; else if (m.height[i] === 2) c = [150, 142, 124]; else if (m.height[i] === 1) c = [130, 116, 90]; else c = [118, 96, 62]; const o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
    x.putImageData(img, 0, 0); this.mini = cv; return cv;
  },
};
