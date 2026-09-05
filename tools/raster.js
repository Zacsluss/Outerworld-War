'use strict';
// ============================================================================
// Software 3D rasterizer + PNG writer for the sprite baking pipeline.
// Orthographic oblique camera (classic pre-rendered RTS look), Gouraud
// lighting, z-buffer, supersampling, outline pass, team-colour mask channel.
// ============================================================================
const zlib = require('zlib');

// ---------------- vector helpers ----------------
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
// 3x4 affine matrices as [m00..m23]
const M = {
  I: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  mul(a, b) { const r = new Array(12); for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0); } return r; },
  T: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z],
  S: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0],
  Rx: a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; },
  Ry: a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; },
  Rz: a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; },
  R: (rx, ry, rz) => M.mul(M.mul(M.Ry(ry), M.Rx(rx)), M.Rz(rz)),
  p(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3], m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7], m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11]]; },
  n(m, v) { return V.norm([m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[4] * v[0] + m[5] * v[1] + m[6] * v[2], m[8] * v[0] + m[9] * v[1] + m[10] * v[2]]); },
};

// ---------------- primitive meshes (unit size, centred, Y up) ----------------
const meshCache = {};
function mesh(kind, seg = 12) {
  const key = kind + seg; if (meshCache[key]) return meshCache[key];
  const v = [], n = [], t = [];
  const quad = (a, b, c, d) => { t.push([a, b, c]); t.push([a, c, d]); };
  if (kind === 'box') {
    const faces = [[[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [0, 0, -1]], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, 0, 0]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, 0, 0]], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], [0, 1, 0]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [0, -1, 0]]];
    for (const f of faces) { const b = v.length; for (let i = 0; i < 4; i++) { v.push(f[i].map(x => x * 0.5)); n.push(f[4]); } quad(b, b + 1, b + 2, b + 3); }
  } else if (kind === 'sphere') {
    const la = Math.max(4, Math.round(seg * 0.6)), lo = seg;
    for (let i = 0; i <= la; i++) { const ph = Math.PI * i / la; for (let j = 0; j <= lo; j++) { const th = Math.PI * 2 * j / lo; const p = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)]; v.push(p.map(x => x * 0.5)); n.push(p); } }
    for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const a = i * (lo + 1) + j; quad(a, a + lo + 1, a + lo + 2, a + 1); }
  } else if (kind === 'cyl' || kind === 'cone') {
    const top = kind === 'cone' ? 0 : 0.5;
    for (let j = 0; j <= seg; j++) { const th = Math.PI * 2 * j / seg; const c = Math.cos(th), s = Math.sin(th); const nn = kind === 'cone' ? V.norm([c, 0.5, s]) : [c, 0, s]; v.push([c * 0.5, -0.5, s * 0.5]); n.push(nn); v.push([c * top, 0.5, s * top]); n.push(nn); }
    for (let j = 0; j < seg; j++) { const a = j * 2; quad(a, a + 2, a + 3, a + 1); }
    // caps
    const cb = v.length; v.push([0, -0.5, 0]); n.push([0, -1, 0]); for (let j = 0; j <= seg; j++) { const th = Math.PI * 2 * j / seg; v.push([Math.cos(th) * 0.5, -0.5, Math.sin(th) * 0.5]); n.push([0, -1, 0]); } for (let j = 0; j < seg; j++) t.push([cb, cb + 1 + j + 1, cb + 1 + j]);
    if (kind === 'cyl') { const ct = v.length; v.push([0, 0.5, 0]); n.push([0, 1, 0]); for (let j = 0; j <= seg; j++) { const th = Math.PI * 2 * j / seg; v.push([Math.cos(th) * 0.5, 0.5, Math.sin(th) * 0.5]); n.push([0, 1, 0]); } for (let j = 0; j < seg; j++) t.push([ct, ct + 1 + j, ct + 1 + j + 1]); }
  } else if (kind === 'wedge') { // triangular prism: rises toward +X
    const pts = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5]];
    const addF = (idx, nn) => { const b = v.length; for (const i of idx) { v.push(pts[i]); n.push(nn); } if (idx.length === 4) quad(b, b + 1, b + 2, b + 3); else t.push([b, b + 1, b + 2]); };
    addF([0, 3, 4, 1], [0, -1, 0]); addF([1, 4, 5, 2], [1, 0, 0]); addF([0, 2, 5, 3], V.norm([-1, 1, 0])); addF([0, 1, 2], [0, 0, -1]); addF([3, 5, 4], [0, 0, 1]);
  } else if (kind === 'oct') { // octahedron (crystal)
    const pts = [[0, 0.5, 0], [0.5, 0, 0], [0, 0, 0.5], [-0.5, 0, 0], [0, 0, -0.5], [0, -0.5, 0]];
    const faces = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]];
    for (const f of faces) { const nn = V.norm(V.cross(V.sub(pts[f[1]], pts[f[0]]), V.sub(pts[f[2]], pts[f[0]]))); const b = v.length; for (const i of f) { v.push(pts[i]); n.push(nn); } t.push([b, b + 1, b + 2]); }
  } else if (kind === 'dome') { // half sphere, flat bottom at y=0, top at y=0.5
    const la = Math.max(3, Math.round(seg * 0.35)), lo = seg;
    for (let i = 0; i <= la; i++) { const ph = Math.PI / 2 * i / la; for (let j = 0; j <= lo; j++) { const th = Math.PI * 2 * j / lo; const p = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)]; v.push([p[0] * 0.5, p[1] * 0.5, p[2] * 0.5]); n.push(p); } }
    for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const a = i * (lo + 1) + j; quad(a, a + lo + 1, a + lo + 2, a + 1); }
    const cb = v.length; v.push([0, 0, 0]); n.push([0, -1, 0]); for (let j = 0; j <= seg; j++) { const th = Math.PI * 2 * j / seg; v.push([Math.cos(th) * 0.5, 0, Math.sin(th) * 0.5]); n.push([0, -1, 0]); } for (let j = 0; j < seg; j++) t.push([cb, cb + 1 + j + 1, cb + 1 + j]);
  }
  return meshCache[key] = { v, n, t };
}

// ---------------- renderer ----------------
class Renderer {
  constructor(opts = {}) { this.el = (opts.elevation || 62) * Math.PI / 180; this.light = V.norm(opts.light || [-0.55, 0.95, -0.55]); this.ambient = opts.ambient || 0.38; this.ss = opts.ss || 2; this.gz = opts.groundScale == null ? 1 : opts.groundScale; this.aoH = opts.aoH || 1.0; }
  // Render a part tree at given facing into an RGBA + mask buffer of size S x S (pixels), scale k px per model unit.
  render(root, o) {
    const ss = this.ss, W = o.W * ss, H = o.H * ss; const col = new Float32Array(W * H * 4), zb = new Float32Array(W * H).fill(-1e9), mask = new Float32Array(W * H);
    const el = this.el, se = Math.sin(el), ce = Math.cos(el); const cx = o.cx * ss, cy = o.cy * ss; const kk = o.k * ss; const facing = o.facing || 0, st = o.st;
    const face = M.Ry(-facing);
    const walk = (part, parentM) => {
      let rot = part.rot || [0, 0, 0], pos = part.pos || [0, 0, 0], size = part.size || [1, 1, 1];
      if (part.anim && st) { const a = part.anim(st) || {}; if (a.rot) rot = [rot[0] + a.rot[0], rot[1] + a.rot[1], rot[2] + a.rot[2]]; if (a.pos) pos = [pos[0] + a.pos[0], pos[1] + a.pos[1], pos[2] + a.pos[2]]; if (a.size) size = [size[0] * a.size[0], size[1] * a.size[1], size[2] * a.size[2]]; }
      const local = M.mul(M.mul(parentM, M.T(pos[0], pos[1], pos[2])), M.R(rot[0], rot[1], rot[2]));
      if (part.shape && !(part.hide && st && part.hide(st))) this.drawMesh(mesh(part.shape, part.seg || (part.shape === 'sphere' ? 14 : 12)), M.mul(local, M.S(size[0], size[1], size[2])), size, part.mat || {}, face, col, zb, mask, W, H, cx, cy, kk, se, ce);
      if (part.children) for (const ch of part.children) walk(ch, local);
    };
    walk(root, M.I());
    return this.finish(col, zb, mask, W, H, ss, o.W, o.H);
  }
  drawMesh(me, m, size, mat, face, col, zb, mask, W, H, cx, cy, kk, se, ce) {
    const base = mat.team ? [0.86, 0.86, 0.86] : (mat.color || [0.7, 0.7, 0.7]); const spec = mat.spec == null ? 0.25 : mat.spec, glow = !!mat.glow, team = mat.team ? 1 : 0;
    const nv = me.v.length; const sx = new Float32Array(nv), sy = new Float32Array(nv), sd = new Float32Array(nv), cr = new Float32Array(nv), cg = new Float32Array(nv), cb = new Float32Array(nv);
    const inv = [1 / size[0], 1 / size[1], 1 / size[2]]; const V3 = [0, se, ce]; // toward camera (approx) in world space after facing
    for (let i = 0; i < nv; i++) {
      const pw = M.p(m, me.v[i]); const p = M.p(face, pw); const nl = me.n[i]; const ao = 0.72 + 0.28 * Math.min(1, Math.max(0, pw[1]) / this.aoH); const nn = M.n(face, M.n(m, [nl[0] * inv[0], nl[1] * inv[1], nl[2] * inv[2]]));
      sx[i] = cx + p[0] * kk; sy[i] = cy + (p[2] * this.gz - p[1] * ce) * kk; sd[i] = p[2] * ce + p[1] * se;
      let r, g, b;
      if (glow) { r = base[0]; g = base[1]; b = base[2]; }
      else { const d = Math.max(0, V.dot(nn, this.light)); const hv = V.norm(V.add(this.light, V3)); const s = Math.pow(Math.max(0, V.dot(nn, hv)), 18) * spec; const lt = (this.ambient + (1 - this.ambient) * d) * ao; r = Math.min(1, base[0] * lt + s); g = Math.min(1, base[1] * lt + s); b = Math.min(1, base[2] * lt + s); }
      cr[i] = r; cg[i] = g; cb[i] = b;
    }
    for (const tri of me.t) {
      const [a, b, c] = tri; const x0 = sx[a], y0 = sy[a], x1 = sx[b], y1 = sy[b], x2 = sx[c], y2 = sy[c];
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(area) < 1e-6) continue;
      const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2))), miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      const ia = 1 / area;
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        let w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * ia, w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * ia, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const d = w0 * sd[a] + w1 * sd[b] + w2 * sd[c]; const i = y * W + x; if (d <= zb[i]) continue; zb[i] = d;
        col[i * 4] = w0 * cr[a] + w1 * cr[b] + w2 * cr[c]; col[i * 4 + 1] = w0 * cg[a] + w1 * cg[b] + w2 * cg[c]; col[i * 4 + 2] = w0 * cb[a] + w1 * cb[b] + w2 * cb[c]; col[i * 4 + 3] = 1; mask[i] = team;
      }
    }
  }
  finish(col, zb, mask, W, H, ss, OW, OH) {
    const out = new Uint8Array(OW * OH * 4), mo = new Uint8Array(OW * OH * 4); const n = ss * ss;
    for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
      let r = 0, g = 0, b = 0, a = 0, mk = 0;
      for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) { const i = (y * ss + dy) * W + (x * ss + dx); if (col[i * 4 + 3] > 0) { r += col[i * 4]; g += col[i * 4 + 1]; b += col[i * 4 + 2]; a++; mk += mask[i]; } }
      const o = (y * OW + x) * 4;
      if (a) { out[o] = Math.round(255 * r / a); out[o + 1] = Math.round(255 * g / a); out[o + 2] = Math.round(255 * b / a); out[o + 3] = Math.round(255 * a / n); mo[o] = mo[o + 1] = mo[o + 2] = 255; mo[o + 3] = Math.round(255 * mk / n); }
    }
    // outline: darken edge pixels & add a 1px dark rim outside
    const rim = new Uint8Array(OW * OH * 4); rim.set(out);
    for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) { const o = (y * OW + x) * 4; if (out[o + 3] > 60) continue; let near = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= OW || yy >= OH) continue; if (out[(yy * OW + xx) * 4 + 3] > 120) near = Math.max(near, out[(yy * OW + xx) * 4 + 3]); } if (near) { rim[o] = 14; rim[o + 1] = 15; rim[o + 2] = 20; rim[o + 3] = Math.round(near * 0.85); } }
    return { rgba: rim, mask: mo, W: OW, H: OH };
  }
}

// ---------------- PNG writer ----------------
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// Sheet assembler: frames[row][col] = {rgba,S}
function sheet(frames, S) { const cols = frames[0].length, rows = frames.length; const W = cols * S, H = rows * S; const out = new Uint8Array(W * H * 4); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const f = frames[r][c]; for (let y = 0; y < S; y++) out.set(f.subarray(y * S * 4, (y + 1) * S * 4), ((r * S + y) * W + c * S) * 4); } return { W, H, out }; }

module.exports = { Renderer, encodePNG, sheet, mesh, V, M };
