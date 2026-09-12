'use strict';
// ============================================================================
// How much room does each unit's MODEL take up?   node tools/bodies.js [--only id,id] [--table]
//
// Collision radii (DATA.units[id].r) are Brood War's footprints, and the art is not: tools/bake.js draws a
// unit at 1.15-1.75x its radius, and up to 1.35x that again for infantry (ART_SCALE), so a marine is drawn
// about 30 px wide on a 16 px collision circle. Units that only kept their collision radii apart still stood
// half inside each other's pictures (seventh session, user item 1). This measures the picture.
//
// For every unit with a model: render its idle silhouette at 16 facings through the same pipeline and the
// same scale bake.js uses, and find the CONTACT DISTANCE -- how far apart two copies facing the same way
// must stand, in a given direction, before no opaque pixel of one lies on the other. The Minkowski
// difference of the silhouette with itself, per row span, gives that for every direction at once.
//
// Prints, per unit: r, the mean contact distance over all directions and facings, its 75th percentile,
// and the body radius that comes out of it. --table prints the UNIT_BODY table for js/data.js.
// test/overlap.js recomputes a sample of these from the models and fails if js/data.js has gone stale,
// so re-baking the art without re-running this is caught.
// ============================================================================
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Renderer } = require('./raster');
const { UNITS } = require('./models');
const root = path.join(__dirname, '..');

// The numbers bake.js uses, read from its source rather than restated, so the two cannot drift apart.
const bakeSrc = fs.readFileSync(path.join(__dirname, 'bake.js'), 'utf8');
const pick = re => { const m = bakeSrc.match(re); if (!m) throw new Error('tools/bake.js no longer matches ' + re); return m[1]; };
const EL = +pick(/EL = (\d+)/), GZ = +pick(/GZ = ([\d.]+)/);
const ART_SCALE = vm.runInNewContext('(' + pick(/const ART_SCALE = (\{[^}]*\})/) + ')');
const kFor = vm.runInNewContext('(def, id, ART_SCALE) => { const r = def.r || 10; return ' + pick(/const k = (r \* \(r <= 9[^;]*);/).replace('baseId', 'id') + '; }');

const DIRS = 16;      // facings sampled; the bake's FINE_DIRS extra facings are in-between poses of the same model
const ALPHA = 128;    // a pixel at least half opaque is part of the model

// The share of each model the body radius is allowed to leave overlapping. Measured with
// .claude/review/overlap/probe.js on settled clumps: BODY_PCT is the percentile of the contact distances,
// over every direction and facing, that the diameter covers.
const BODY_PCT = 0.5;

function contactStats(id) {
  const def = DATA.units[id]; const k = kFor(def, id, ART_SCALE); const S = Math.ceil(k * 5) + 14;
  const rend = new Renderer({ elevation: EL, ss: 1, groundScale: GZ, ambient: 0.3, aoH: 1.2, race: def.race });
  const all = [];
  for (let d = 0; d < DIRS; d++) {
    const f = rend.render(UNITS[id](), { W: S, H: S, cx: S / 2, cy: S / 2, k, facing: d * Math.PI * 2 / DIRS, st: { walk: null, atk: null, idle: 0 } });
    const lo = new Int32Array(S).fill(S), hi = new Int32Array(S).fill(-1);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (f.rgba[(y * S + x) * 4 + 3] > ALPHA) { if (x < lo[y]) lo[y] = x; if (x > hi[y]) hi[y] = x; }
    // D(dy) = the hull of horizontal offsets dx at which a copy moved by (dx, dy) still overlaps
    const dlo = new Int32Array(2 * S + 1).fill(1 << 30), dhi = new Int32Array(2 * S + 1).fill(-(1 << 30));
    for (let dy = -S; dy <= S; dy++) {
      for (let y = 0; y < S; y++) {
        const y2 = y - dy; if (y2 < 0 || y2 >= S || hi[y] < 0 || hi[y2] < 0) continue;
        // copy B = A moved by (dx, dy): B's row y holds A's row y - dy shifted by dx; overlap iff the spans meet
        const a = lo[y] - hi[y2], b = hi[y] - lo[y2];
        if (a < dlo[dy + S]) dlo[dy + S] = a; if (b > dhi[dy + S]) dhi[dy + S] = b;
      }
    }
    for (let t = 0; t < 16; t++) {
      const th = t * Math.PI * 2 / 16, cx = Math.cos(th), cy = Math.sin(th);
      let c = 0;
      for (let s = 1; s < 2 * S; s++) {
        const dx = Math.round(s * cx), dy = Math.round(s * cy); if (dy < -S || dy > S) break;
        if (dx >= dlo[dy + S] && dx <= dhi[dy + S]) c = s;
      }
      all.push(c + 1);
    }
  }
  all.sort((a, b) => a - b);
  const mean = all.reduce((s, x) => s + x, 0) / all.length;
  const at = p => all[Math.min(all.length - 1, Math.floor(p * all.length))];
  return { r: def.r, mean, p25: at(0.25), p50: at(0.5), p75: at(0.75), max: all[all.length - 1], body: Math.max(def.r, Math.round(at(BODY_PCT) / 2)) };
}

let DATA;
function load() { const c = { console }; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8') + ';this.DATA = DATA;', c); DATA = c.DATA; }
load();

function measure(only) {
  const out = {};
  for (const id of Object.keys(UNITS)) {
    if (id.endsWith('_s') || !DATA.units[id] || (only && !only.includes(id))) continue;
    out[id] = contactStats(id);
  }
  return out;
}
module.exports = { measure, BODY_PCT };

if (require.main === module) {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
  const res = measure(only);
  if (args.includes('--table')) {
    const ids = Object.keys(res).filter(id => res[id].body !== res[id].r);
    let line = '  ', lines = [];
    for (const id of ids) { const e = id + ': ' + res[id].body + ', '; if (line.length + e.length > 118) { lines.push(line.trimEnd()); line = '  '; } line += e; }
    if (line.trim()) lines.push(line.trimEnd());
    console.log('const UNIT_BODY = {\n' + lines.join('\n').replace(/,$/, '') + '\n};');
  } else {
    console.log('id                 r   contact: mean   p25   p50   p75   max  -> body');
    for (const [id, s] of Object.entries(res)) console.log(id.padEnd(16) + String(s.r).padStart(4) + s.mean.toFixed(1).padStart(14) + String(s.p25).padStart(6) + String(s.p50).padStart(6) + String(s.p75).padStart(6) + String(s.max).padStart(6) + '  -> ' + s.body);
  }
}
