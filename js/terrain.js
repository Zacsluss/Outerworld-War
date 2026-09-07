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
        col = [lo[0] + (hi[0] - lo[0]) * w, lo[1] + (hi[1] - lo[1]) * w, lo[2] + (hi[2] - lo[2]) * w];
        if (i >= 0 && m.height[i] === 1) { const rc = this.rampCol(n); col = [(col[0] + rc[0]) / 2, (col[1] + rc[1]) / 2, (col[2] + rc[2]) / 2]; }
        // grain
        const g = (this.hash(wx, wy) - 0.5) * 14; col[0] += g; col[1] += g; col[2] += g;
      }
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
