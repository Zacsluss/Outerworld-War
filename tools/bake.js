'use strict';
// ============================================================================
// Sprite baking pipeline:  node tools/bake.js [--only id,id] [--ss N]
// Renders every unit (16 facings x idle/walk/attack frames) and building
// model into PNG sprite sheets + team-colour masks, and writes assets/atlas.js
// ============================================================================
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Renderer, encodePNG, sheet } = require('./raster');
const { UNITS, BUILDINGS, deathWrap } = require('./models');
const root = path.join(__dirname, '..'); const outDir = path.join(root, 'assets', 'sprites'); fs.mkdirSync(outDir, { recursive: true });
// load game data tables
const ctx = { console }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8') + ';this.DATA = DATA;', ctx);
const DATA = ctx.DATA;
const args = process.argv.slice(2); const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null; const ssArg = args.includes('--ss') ? parseInt(args[args.indexOf('--ss') + 1]) : 0;
// Which sheet row the contact sheet samples. Default 0 is the first idle frame, which is what you want
// for judging silhouettes; `--pv 19` is the settled frame of death pose 0, and is the only way to look
// at a death row without a browser.
const pvRow = args.includes('--pv') ? parseInt(args[args.indexOf('--pv') + 1]) : 0;
const DIRS = 16, WALK = 8, ATK = 5, IDLE = 4, EL = 50, GZ = 0.85;
// Facings are per unit, not global. Lane B measured how long each type holds one 16-direction bucket
// while turning: siege_tank 3.3 sim frames, reaver 2.6, ultralisk 2.0, vulture 1.8, and everything
// else under 1.6 -- the nineteen ground types with no TURN entry rotate at 0.7 rad/frame and already
// cross nearly two buckets per frame, so extra rows for them would be sub-frame and invisible.
// Doubling globally cost x1.96 bytes and took the runtime tinted-sheet budget from 576 MB to 1152 MB
// for a fix only four types can show. Doubling just these five is about +3.3 MB.
const FINE_DIRS = new Set(['siege_tank', 'siege_tank_s', 'vulture', 'reaver', 'ultralisk']);
const dirsFor = id => FINE_DIRS.has(id) ? 32 : DIRS;
// Death: DVAR poses x DFR frames, appended after the attack rows. Ground units only -- js/fx.js only
// makes a corpse decal when the dead unit was not flying, so death rows on a battlecruiser would be
// 180 KB of sheet nothing can ever draw.
//
// Three poses of two frames, and the split between those two numbers is the whole design. Measured on
// marine.png (299,948 B before): three poses x three frames costs +57.6%, three x two costs +37.6%,
// and three x three with the death rows baked at 8 facings instead of 16 costs +32.8%. So frames are
// what is expensive and poses are what is worth having, because of the timing: the collapse is 12 game
// frames and the settled corpse lingers for 1100. An intermediate frame is on screen for well under one
// percent of a corpse's life; the pose it settles into is on screen for all of it, next to eleven other
// corpses from the same fight. Two frames plus the 2D squash js/fx.js already applies is enough motion
// to read as a fall, and the third pose is what stops a lost battle looking stamped from one die.
// The 8-facing trick is real and is deliberately not taken: it saves 5 points over the option chosen
// here and needs the sub-rect arithmetic in js/atlas.js to special-case one anim kind.
const DVAR = 3, DFR = 2;
const DEASE = [0.55, 1];   // where in the fall each frame sits
// Infantry read too small at 1:1 next to a 32 px tile, because the sprite is scaled from the collision
// radius and infantry have tiny radii. This is a render-only boost: sim radii are untouched, so a marine
// just draws bigger than its footprint, which is what Brood War does too.
const ART_SCALE = { marine: 1.32, firebat: 1.32, medic: 1.32, ghost: 1.28, zergling: 1.35, zealot: 1.3, dark_templar: 1.3, high_templar: 1.24 };
const META = { el: EL, dirs: DIRS, walk: WALK, atk: ATK, idle: IDLE, dvar: DVAR, dframes: DFR, death: DVAR * DFR };
const atlas = Object.assign({}, META, { units: {}, buildings: {} });
const t0 = Date.now(); let frames = 0; const PREVIEW = [];

function bakeUnit(id, model) {
  const baseId = id.replace(/_s$/, ''); const def = DATA.units[baseId]; if (!def) return;
  const r = def.r || 10; const k = r * (r <= 9 ? 1.75 : r <= 14 ? 1.4 : 1.15) * (ART_SCALE[baseId] || 1); const S = Math.ceil(k * 5) + 14; const ss = ssArg || (r <= 10 ? 3 : 2);
  const NDIR = dirsFor(id);
  const rend = new Renderer({ elevation: EL, ss, groundScale: GZ, ambient: 0.3, aoH: 1.2, race: def.race }); const rows = [], mrows = []; const previewFrame = { S };
  const anims = []; for (let i = 0; i < IDLE; i++) anims.push({ walk: null, atk: null, idle: i / IDLE }); for (let i = 0; i < WALK; i++) anims.push({ walk: i / WALK, atk: null, idle: null }); for (let i = 0; i < ATK; i++) anims.push({ walk: null, atk: (i + 0.5) / ATK, idle: null });
  const dies = !def.fly; if (dies) for (let v = 0; v < DVAR; v++) for (let i = 0; i < DFR; i++) anims.push({ walk: null, atk: null, idle: null, death: { v, t: DEASE[i] } });
  for (const st of anims) { const row = [], mrow = []; for (let d = 0; d < NDIR; d++) { const m = st.death ? deathWrap(model(), st.death) : model(); const f = rend.render(m, { W: S, H: S, cx: S / 2, cy: S / 2, k, facing: d * Math.PI * 2 / NDIR, st }); row.push(f.rgba); mrow.push(f.mask); frames++; } rows.push(row); mrows.push(mrow); }
  const sh = sheet(rows, S), msh = sheet(mrows, S);
  fs.writeFileSync(path.join(outDir, id + '.png'), encodePNG(sh.W, sh.H, sh.out)); fs.writeFileSync(path.join(outDir, id + '_m.png'), encodePNG(msh.W, msh.H, msh.out));
  PREVIEW.push({ id, S, rgba: rows[Math.min(pvRow, rows.length - 1)][2] });
  atlas.units[id] = { file: 'assets/sprites/' + id + '.png', mask: 'assets/sprites/' + id + '_m.png', S, cols: NDIR, rows: dies ? { i: 0, w: IDLE, a: IDLE + WALK, d: IDLE + WALK + ATK } : { i: 0, w: IDLE, a: IDLE + WALK } };
  process.stdout.write(id + ' ');
}
function bakeBuilding(id, model) {
  const def = DATA.buildings[id]; if (!def) return;
  const TILE = 32, W = def.w * TILE, H = def.h * TILE, M = 18, T = 72; const rend = new Renderer({ elevation: EL, ss: 2, groundScale: GZ, ambient: 0.3, aoH: 1.4, race: def.race });
  const m = model(def.w, def.h); const f = rend.render(m, { W: W + M * 2, H: H + M + T, cx: M + W / 2, cy: T + H / 2, k: TILE, facing: 0, st: null }); frames++;
  fs.writeFileSync(path.join(outDir, id + '.png'), encodePNG(W + M * 2, H + M + T, f.rgba)); fs.writeFileSync(path.join(outDir, id + '_m.png'), encodePNG(W + M * 2, H + M + T, f.mask));
  PREVIEW.push({ id, W: W + M * 2, H: H + M + T, rgba: f.rgba, building: true });
  atlas.buildings[id] = { file: 'assets/sprites/' + id + '.png', mask: 'assets/sprites/' + id + '_m.png', W, H, M, T };
  process.stdout.write(id + ' ');
}
for (const [id, model] of Object.entries(UNITS)) { if (only && !only.includes(id)) continue; try { bakeUnit(id, model); } catch (e) { console.error('\nFAILED unit ' + id, e); } }
for (const [id, model] of Object.entries(BUILDINGS)) { if (only && !only.includes(id)) continue; try { bakeBuilding(id, model); } catch (e) { console.error('\nFAILED building ' + id, e); } }
if (!only) fs.writeFileSync(path.join(root, 'assets', 'atlas.js'), '// generated by tools/bake.js\nconst SPRITE_ATLAS = ' + JSON.stringify(atlas) + ';\n');
else { // merge into existing atlas
  const ap = path.join(root, 'assets', 'atlas.js'); let prev = { units: {}, buildings: {} }; if (fs.existsSync(ap)) { const c2 = {}; vm.createContext(c2); vm.runInContext(fs.readFileSync(ap, 'utf8') + ';this.__a = SPRITE_ATLAS;', c2); prev = c2.__a; }
  Object.assign(prev.units, atlas.units); Object.assign(prev.buildings, atlas.buildings); Object.assign(prev, META);
  fs.writeFileSync(ap, '// generated by tools/bake.js\nconst SPRITE_ATLAS = ' + JSON.stringify(prev) + ';\n');
}
console.log('\nbaked ' + frames + ' frames in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

// contact sheet: units at 2x, buildings at 1x, 8 per row
function writePreview() {
  if (!PREVIEW.length) return; const cell = 150, cols = 8; const rows = Math.ceil(PREVIEW.length / cols); const W = cols * cell, H = rows * cell; const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = 60; out[i * 4 + 1] = 52; out[i * 4 + 2] = 40; out[i * 4 + 3] = 255; }
  PREVIEW.forEach((p, i) => { const ox = (i % cols) * cell, oy = Math.floor(i / cols) * cell; const sc = p.building ? 1 : 2; const w = p.building ? p.W : p.S, h = p.building ? p.H : p.S; const dw = Math.min(cell - 4, w * sc), dh = Math.min(cell - 4, h * sc);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const sx = Math.floor(x / sc + (w - dw / sc) / 2), sy = Math.floor(y / sc + (h - dh / sc) / 2); const si = (sy * w + sx) * 4; const a = p.rgba[si + 3] / 255; if (a <= 0) continue; const di = ((oy + 2 + y) * W + ox + 2 + x) * 4; out[di] = Math.round(out[di] * (1 - a) + p.rgba[si] * a); out[di + 1] = Math.round(out[di + 1] * (1 - a) + p.rgba[si + 1] * a); out[di + 2] = Math.round(out[di + 2] * (1 - a) + p.rgba[si + 2] * a); } });
  fs.writeFileSync(path.join(root, 'assets', 'preview.png'), encodePNG(W, H, out));
}
writePreview();
