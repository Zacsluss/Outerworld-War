// A placeholder icon set for the wrapper, generated so that `cargo build` and `tauri build` find every file
// tauri.conf.json's bundle.icon names (tauri-build embeds icons/icon.ico into the Windows executable and
// refuses a missing one). It draws the menu's own colours -- a gold diamond ring on the panel's dark blue --
// with no dependency and no binary asset checked in.
//
// To use a real icon: put a 512x512 app-icon.png in desktop/ and run `npx tauri icon app-icon.png`, which
// rewrites src-tauri/icons from it. This script also writes desktop/app-icon.png as that starting point.
//   node icons.js
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const out = path.join(__dirname, 'src-tauri', 'icons');
fs.mkdirSync(out, { recursive: true });

// ---- PNG, RGBA, filter 0 on every row --------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(size, pixel) {
  const stride = size * 4 + 1, raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) { raw[y * stride] = 0; for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x, y, size); const o = y * stride + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- the emblem, supersampled 4x4 so the diagonals are not stair-steps -------------------------------
const GROUND = [21, 26, 34], GOLD = [232, 216, 144];
function emblem(x, y, size) {
  const S = 4; let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
    const u = (x + (sx + 0.5) / S) / size - 0.5, v = (y + (sy + 0.5) / S) / size - 0.5;   // -0.5 .. 0.5
    const R = 0.11, e = 0.5 - R, au = Math.abs(u), av = Math.abs(v);
    const outside = au > e && av > e && Math.hypot(au - e, av - e) > R;                  // rounded corners
    if (outside) continue;
    const d = au + av;                                                                   // diamond distance
    const c = d < 0.13 ? GOLD : d < 0.27 ? GROUND : d < 0.33 ? GOLD : GROUND;
    r += c[0]; g += c[1]; b += c[2]; a += 255;
  }
  const n = S * S;
  // colour is averaged over the covered samples only, so the anti-aliased edge fades in alpha, not to black
  const covered = a / 255 || 1;
  return [Math.round(r / covered), Math.round(g / covered), Math.round(b / covered), Math.round(a / n)];
}

// ---- ICO (PNG-compressed entries, valid since Windows Vista) and ICNS (PNG-typed entries) -----------
function ico(entries) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length); let off = 6 + dir.length;
  entries.forEach((e, i) => { const o = i * 16; dir[o] = e.size >= 256 ? 0 : e.size; dir[o + 1] = e.size >= 256 ? 0 : e.size; dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6); dir.writeUInt32LE(e.data.length, o + 8); dir.writeUInt32LE(off, o + 12); off += e.data.length; });
  return Buffer.concat([head, dir].concat(entries.map(e => e.data)));
}
function icns(entries) {
  const parts = entries.map(e => { const h = Buffer.alloc(8); h.write(e.type, 0, 'ascii'); h.writeUInt32BE(8 + e.data.length, 4); return Buffer.concat([h, e.data]); });
  const head = Buffer.alloc(8); head.write('icns', 0, 'ascii'); head.writeUInt32BE(8 + parts.reduce((n, p) => n + p.length, 0), 4);
  return Buffer.concat([head].concat(parts));
}

const P = {}; for (const s of [16, 32, 48, 64, 128, 256, 512]) P[s] = png(s, emblem);
const files = {
  '32x32.png': P[32], '128x128.png': P[128], '128x128@2x.png': P[256], 'icon.png': P[512],
  'icon.ico': ico([16, 32, 48, 256].map(s => ({ size: s, data: P[s] }))),
  'icon.icns': icns([['ic11', 32], ['ic12', 64], ['ic07', 128], ['ic13', 256], ['ic08', 256], ['ic09', 512]].map(([type, s]) => ({ type, data: P[s] }))),
};
for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(out, name), data);
fs.writeFileSync(path.join(__dirname, 'app-icon.png'), P[512]);
console.log('icons: ' + Object.keys(files).join(', ') + ' in ' + out + '; source app-icon.png (512) beside this script');
