// Every unit and building has a baked sprite.
//
// This exists because thirteen buildings and three units shipped across M11 with no entry in
// tools/models.js, and nothing anywhere noticed. The failure is silent BY DESIGN: js/sprites.js asks
// the atlas first and falls back to the vector painter when there is no baked sheet --
//
//     if (typeof Atlas !== 'undefined' && Atlas.hasBuilding(id)) return Atlas.buildingImage(id, color);
//
// -- so an unbaked building draws perfectly happily, just flat, next to fifty baked neighbours that
// have real shading and ambient occlusion. Every test passed. It was reported by a player, in the only
// way it can be: "why do all the new buildings look 2d".
//
// The fallback is worth keeping -- it is what makes a new def playable the moment it is defined, before
// anyone has modelled it -- so the guard is here rather than in the engine.
//   node test/baked.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

const dctx = { console: { log() { }, warn() { }, error() { } } }; vm.createContext(dctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8') + ';this.DATA = DATA;', dctx);
const DATA = dctx.DATA;

const atlasSrc = fs.readFileSync(path.join(root, 'assets', 'atlas.js'), 'utf8');
const atlas = vm.runInContext('(' + atlasSrc.replace(/^[\s\S]*?SPRITE_ATLAS\s*=\s*/, '').replace(/;\s*$/, '') + ')', vm.createContext({}));
const { UNITS, BUILDINGS } = require(path.join(root, 'tools', 'models.js'));

// `notUnit` covers the things that are defs but never stand on the map as a unit (nukes, scanner
// sweeps, and so on); they have no sprite by design and asking for one would be the bug.
const wantUnits = Object.keys(DATA.units).filter(k => !DATA.units[k].notUnit);
const wantBuildings = Object.keys(DATA.buildings);

const noModelU = wantUnits.filter(k => !UNITS[k]);
const noModelB = wantBuildings.filter(k => !BUILDINGS[k]);
ok(noModelU.length === 0, 'every unit has a 3D model in tools/models.js (' + wantUnits.length + ' units)', noModelU.join(', '));
ok(noModelB.length === 0, 'every building has a 3D model in tools/models.js (' + wantBuildings.length + ' buildings)', noModelB.join(', '));

const noSheetU = wantUnits.filter(k => !atlas.units[k]);
const noSheetB = wantBuildings.filter(k => !atlas.buildings[k]);
ok(noSheetU.length === 0, '...and a baked sheet in assets/atlas.js', noSheetU.join(', '));
ok(noSheetB.length === 0, '...and so does every building', noSheetB.join(', '));

// A model without a bake means someone added the model and did not re-run tools/bake.js, which is the
// same flat sprite in the game with a different cause.
ok(noSheetU.length === 0 && noSheetB.length === 0 && noModelU.length === 0 && noModelB.length === 0,
  'so nothing in the game falls through to the flat vector painter');

// The files the atlas names have to actually be on disk, or Atlas.ready() reports false at runtime and
// the fallback silently takes over again -- the same symptom, one layer down.
const missingFiles = [];
for (const [kind, tbl] of [['units', atlas.units], ['buildings', atlas.buildings]])
  for (const [id, a] of Object.entries(tbl))
    for (const f of [a.file, a.mask])
      if (!fs.existsSync(path.join(root, f))) missingFiles.push(kind + '/' + id + ':' + f);
ok(missingFiles.length === 0, 'every sheet and mask the atlas names exists on disk', missingFiles.slice(0, 4).join(' '));

// Sheets carry the rows the runtime asks for. js/atlas.js reads rows.i/w/a and optionally rows.d, and
// falls through to idle for a missing death row rather than reading off the end of the sheet -- so a
// missing `i`, `w` or `a` is the real breakage.
const badRows = Object.entries(atlas.units).filter(([, a]) => !a.rows || a.rows.i == null || a.rows.w == null || a.rows.a == null).map(([k]) => k);
ok(badRows.length === 0, 'every baked unit sheet declares its idle, walk and attack rows', badRows.join(', '));

// Buildings are single images, so what they need is a footprint that matches the def -- a mismatch
// draws the sprite at the wrong scale against its own collision box.
const TILE = 32;
const badSize = wantBuildings.filter(k => { const a = atlas.buildings[k], d = DATA.buildings[k]; return a && (a.W !== d.w * TILE || a.H !== d.h * TILE); })
  .map(k => k + ' sheet ' + atlas.buildings[k].W + 'x' + atlas.buildings[k].H + ' vs def ' + DATA.buildings[k].w * TILE + 'x' + DATA.buildings[k].h * TILE);
ok(badSize.length === 0, 'every baked building matches its def footprint', badSize.slice(0, 3).join(' | '));

console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
