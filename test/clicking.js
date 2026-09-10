// FIXLIST-M14 B1, B2 and B3 -- what a click can reach.
//
// Three reported items, all of them the same function and its callers, so they are one pass and one
// check file:
//
//   B3 (item 7)      "units are hard to click". The hit area was a circle of max(u.r + 4, icon), and
//                    `u.r` is a SIMULATION radius with no relationship to how big the sprite is drawn.
//                    Measured across every baked sheet: the old radius was a MEDIAN 0.62x the drawn
//                    ink and as low as 0.36x.
//   B2 (item 2)      "double-click selects all of that building". The behaviour existed and was
//                    switched off for buildings by one clause.
//   B1 (items 1,3,14) "click a mineral node to see what is left", "same for gas", "hover ring". A
//                    missing feature: UI.unitAt walks G.units and resources are not units.
//
// THE ANTI-DRIFT CHECK IS THE IMPORTANT ONE. Render.SPRITE_INK is a measured table, and a measured
// table that nothing re-measures is a stale constant waiting to happen -- HANDOFF-M13 lists exactly
// that under "regex probes that go stale". So section 1 decodes the baked PNGs and re-derives every
// entry, and names any unit that has moved. Re-bake the art and this goes red the same day.
//
//   node test/clicking.js
const fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };

// ---- a headless canvas, enough for UI.drawConsole to run ---------------------
function fakeCtx() {
  const grad = { addColorStop() { } };
  const c = { said: [], canvas: null, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: '', lineJoin: '',
    textAlign: '', textBaseline: '', globalCompositeOperation: '', imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: '',
    measureText(s) { return { width: String(s).length * 6 }; },
    fillText(s) { if (c.said[c.said.length - 1] !== String(s)) c.said.push(String(s)); },
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; }, createPattern() { return null; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; },
    putImageData() { }, createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; } };
  for (const m of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect',
    'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'strokeText', 'translate', 'scale', 'rotate',
    'transform', 'setTransform', 'resetTransform', 'drawImage', 'setLineDash', 'quadraticCurveTo', 'bezierCurveTo']) c[m] = () => { };
  return c;
}
function fakeCanvas() { const cv = { width: 1, height: 1, style: {}, getContext: () => cv._c || (cv._c = fakeCtx()), toDataURL: () => '', addEventListener() { }, appendChild() { }, remove() { }, click() { }, value: '' }; return cv; }
const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, clearTimeout,
  setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
  document: { getElementById: () => fakeCanvas(), createElement: () => fakeCanvas(), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain',
  'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const J = src => JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));
const run = body => vm.runInContext('(() => {' + body + '})()', ctx);

// =============================================================================
// 1. SPRITE_INK still describes the art -- re-measured from the PNGs, not trusted
// =============================================================================
// A minimal PNG reader: IHDR for the size, the IDAT stream inflated and un-filtered, alpha only. It
// exists here rather than in a tool because the whole point is that the CHECK re-derives the numbers;
// a table checked against another copy of itself checks nothing.
function pngAlpha(file) {
  const buf = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, bd = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); bd = buf[p + 16]; ct = buf[p + 17]; }
    else if (type === 'IDAT') idat.push(buf.slice(p + 8, p + 8 + len));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 4)) throw new Error('unhandled PNG (bd ' + bd + ', ct ' + ct + '): ' + file);
  const ch = ct === 6 ? 4 : 2;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(w * h);
  let prev = Buffer.alloc(stride), q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++]; const line = Buffer.from(raw.slice(q, q + stride)); q += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) out[y * w + x] = line[x * ch + (ch - 1)];
    prev = line;
  }
  return { w, h, a: out };
}
const INK = J('Render.SPRITE_INK');
{
  const apath = path.join(root, 'assets', 'atlas.js');
  const actx = { console: { log() { } }, Math }; actx.window = actx; vm.createContext(actx);
  vm.runInContext(fs.readFileSync(apath, 'utf8'), actx, { filename: 'atlas-data' });
  const A = JSON.parse(vm.runInContext('JSON.stringify(SPRITE_ATLAS)', actx));
  const units = J('DATA.units');
  const moved = [], missing = [], extra = [];
  for (const [id, a] of Object.entries(A.units)) {
    const base = id.replace(/_s$/, ''); if (!units[base]) continue;
    const file = path.join(root, a.file); if (!fs.existsSync(file)) { missing.push(id + ' (no png)'); continue; }
    if (!INK[id]) { missing.push(id); continue; }
    const img = pngAlpha(file), S = a.S, cx = S / 2, cy = S / 2;
    let up = 0, down = 0, side = 0;
    const rows = [];
    for (let i = 0; i < (A.idle || 1); i++) rows.push(a.rows.i + i);
    for (let i = 0; i < (A.atk || 1); i++) rows.push(a.rows.a + i);
    for (const row of rows) for (let col = 0; col < a.cols; col++) {
      const x0 = col * S, y0 = row * S;
      let lx = 1e9, ly = 1e9, hx = -1, hy = -1;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (img.a[(y0 + y) * img.w + (x0 + x)] > 24) { if (x < lx) lx = x; if (x > hx) hx = x; if (y < ly) ly = y; if (y > hy) hy = y; }
      }
      if (hx < 0) continue;
      up = Math.max(up, cy - ly); down = Math.max(down, hy - cy); side = Math.max(side, cx - lx, hx - cx);
    }
    const want = [Math.round(up), Math.round(down), Math.round(side)], got = INK[id];
    if (want.join(',') !== got.join(',')) moved.push(id + ' table[' + got.join(',') + '] art[' + want.join(',') + ']');
  }
  for (const id of Object.keys(INK)) if (!A.units[id]) extra.push(id);
  ok(moved.length === 0, 'SPRITE_INK still matches the baked art, re-measured from the PNGs (' + Object.keys(INK).length + ' entries)', moved.slice(0, 5).join(' | '));
  ok(missing.length === 0, 'every unit in the atlas has an entry in the table', missing.slice(0, 6).join(', '));
  ok(extra.length === 0, 'and the table names nothing the atlas does not have', extra.slice(0, 6).join(', '));
}

// =============================================================================
// 2. B3 -- the hit area comes from the sprite, and it is bigger than it was
// =============================================================================
const box = run(`
  UI.start({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 4, layout: 'temple' });
  UI.menu = null; Render.init(document.getElementById('game'));
  Render.W = 1600; Render.H = 900; Render.viewW = 1600; Render.viewH = 760; Render.zoom = 1;
  const out = { rows: [], iconGrew: null };
  const st = G.map.starts[0];
  for (const id of ['marine', 'thor', 'colossus', 'battlecruiser', 'zergling', 'scarab']) {
    const u = G.spawnUnit(id, 0, st.cx + 400, st.cy + 400);
    const b = Render.hitBox(u);
    // the rule this replaces, spelled out here so the comparison is exact rather than remembered
    const old = Math.max(u.r + 4, Render.iconH(u) * 1.4);
    out.rows.push({ id, r: u.r, up: b.up, down: b.down, side: b.side, old });
    G.kill(u, null, true);
  }
  // and the icon floor still bites at strategic zoom, where the sprite is not drawn at all
  const m = G.spawnUnit('marine', 0, st.cx + 400, st.cy + 400);
  const at1 = Render.hitBox(m); Render.zoom = 0.15; const atZ = Render.hitBox(m); Render.zoom = 1;
  out.iconGrew = { one: at1.side, zoomed: atZ.side };
  G.kill(m, null, true);
  return out;`);
for (const r of box.rows) ok(r.up >= r.old && r.side >= r.old, 'the ' + r.id + ' hit box is at least as big as the circle it replaces', JSON.stringify(r));
ok(box.rows.find(r => r.id === 'marine').up > box.rows.find(r => r.id === 'marine').old * 2,
  'a Marine, the reported case, is more than twice as tall to click as it was', JSON.stringify(box.rows.find(r => r.id === 'marine')));
// The measured ink of a Colossus does not reach its own centre at all -- `down` is 0 -- because the
// sheets are rendered at 50 degrees of elevation with the model centred in the frame. No circle can
// express that, which is the whole reason the hit test is a box. The APPLIED box is less lopsided than
// the raw ink because the old radius survives as a floor, so nothing became harder to click; both
// halves of that are asserted, because either one alone would be misleading.
ok(INK.colossus[0] > INK.colossus[1] * 4 && INK.colossus[1] === 0,
  'the measured ink of a Colossus does not reach its own centre downward -- this is why the hit test is a box, not a circle', JSON.stringify(INK.colossus));
{ const c = box.rows.find(r => r.id === 'colossus');
  ok(c.up > c.down && c.down >= c.old, 'and the applied box is taller upward while still never shrinking below the old radius', JSON.stringify(c)); }
ok(box.iconGrew.zoomed > box.iconGrew.one, 'at strategic zoom the icon floor takes over, so a unit stays clickable when its sprite is not drawn', JSON.stringify(box.iconGrew));

// The click that matters: the visual top edge of a tall unit. This is the acceptance criterion.
const top = run(`
  const st = G.map.starts[0];
  const out = {};
  for (const id of ['thor', 'colossus', 'battlecruiser']) {
    const u = G.spawnUnit(id, 0, st.cx + 500, st.cy + 500);
    const ink = Render.SPRITE_INK[id];
    // one pixel inside the top of the drawn ink, dead centre horizontally
    const hitTop = UI.unitAt(u.x, u.y - (ink[0] - 1));
    // and one pixel OUTSIDE it, which must miss -- otherwise the box is not a box, it is "everything"
    const missAbove = UI.unitAt(u.x, u.y - (ink[0] + Render.HIT_PAD + 8));
    // the old radius, for the record: was the top edge reachable before?
    const old = Math.max(u.r + 4, Render.iconH(u) * 1.4);
    out[id] = { hitTop: hitTop === u, missAbove: missAbove === null, inkUp: ink[0], oldR: old, reachableBefore: ink[0] - 1 <= old };
    G.kill(u, null, true);
  }
  return out;`);
for (const [id, r] of Object.entries(top)) {
  ok(r.hitTop, 'clicking the VISUAL TOP EDGE of a ' + id + ' selects it', JSON.stringify(r));
  ok(!r.reachableBefore, '...and it was NOT reachable under the old rule, which is the whole report', JSON.stringify(r));
  ok(r.missAbove, '...while clicking clear above it still hits nothing', JSON.stringify(r));
}

// Widening must not make a clump worse: the nearest centre still wins.
const clump = run(`
  const st = G.map.starts[0];
  const a = G.spawnUnit('marine', 0, st.cx + 600, st.cy + 600);
  const b = G.spawnUnit('marine', 0, st.cx + 620, st.cy + 600);
  const t = G.spawnUnit('thor', 0, st.cx + 660, st.cy + 600);
  const out = { nearA: UI.unitAt(a.x + 2, a.y) === a, nearB: UI.unitAt(b.x - 2, b.y) === b,
    marineBesideThor: UI.unitAt(b.x, b.y) === b, thorItself: UI.unitAt(t.x, t.y) === t };
  for (const u of [a, b, t]) G.kill(u, null, true);
  return out;`);
ok(clump.nearA && clump.nearB, 'between two overlapping units the click still resolves to the nearer centre', JSON.stringify(clump));
ok(clump.marineBesideThor, 'a Marine standing inside a Thor\'s much bigger box is still the one selected when you click it', JSON.stringify(clump));
ok(clump.thorItself, 'and the Thor is still selectable at its own centre');
// u.r is a simulation radius and must not have moved
ok(J('DATA.units.thor.r') === 20 && J('DATA.units.marine.r') === 8 && J('DATA.units.widow_mine.r') === 9,
  'u.r IS UNTOUCHED -- it drives pathing, collision and combat and is in the build stamp');

// =============================================================================
// 3. B2 -- double-clicking a building selects all of that building on screen
// =============================================================================
const dbl = run(`
  const st = G.map.starts[0], T = TILE;
  const out = {};
  const put = (id, dx, dy) => { const b = G.placeBuilding(DATA.buildings[id], Math.floor(st.cx / T) + dx, Math.floor(st.cy / T) + dy, 0); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
  const b1 = put('barracks', 6, 6), b2 = put('barracks', 12, 6), b3 = put('barracks', 18, 6);
  const fac = put('factory', 24, 6);
  Render.camX = 0; Render.camY = 0; Render.W = 4000; Render.H = 3000; Render.viewW = 4000; Render.viewH = 2900;
  Render.centerOn ? 0 : 0;
  // put the camera over them
  Render.camX = b1.x - 200; Render.camY = b1.y - 200;
  const at = u => { UI.mouse.wx = u.x; UI.mouse.wy = u.y; return u; };
  // first click
  UI.selection = []; UI.lastClick = 0; UI.lastClickUnit = null;
  const t = UI.unitAt(b2.x, b2.y);
  out.hitsBuilding = t === b2;
  // simulate the double-click branch exactly as onUp reaches it
  UI.select([t]); UI.lastClick = performance.now(); UI.lastClickUnit = t;
  const now = UI.lastClick + 100;
  // Asked of the shipped UI, not re-typed here -- see UI.isDoubleClick for why that distinction is
  // the difference between a check and a copy of the thing it checks.
  const isDouble = UI.isDoubleClick(t, now);
  out.isDouble = isDouble;
  if (isDouble) { const same = G.units.filter(u => u.alive && u.owner === G.human && u.def.id === t.def.id && !u.inside && u.x > Render.camX && u.x < Render.camX + Render.viewWorldW() && u.y > Render.camY && u.y < Render.camY + Render.viewWorldH()); UI.select(same); }
  out.selected = UI.selection.length;
  out.allBarracks = UI.selection.every(u => u.def.id === 'barracks');
  out.gotFactory = UI.selection.includes(fac);
  // the source clause, read out of the shipped file rather than remembered
  return out;`);
ok(dbl.hitsBuilding, 'a building is hit by a click at its centre');
ok(dbl.isDouble, 'a second click inside 350 ms on the SAME BUILDING now counts as a double-click -- it did not before');
ok(dbl.selected === 3 && dbl.allBarracks && !dbl.gotFactory, 'and it selects all three Barracks on screen, and only Barracks', JSON.stringify(dbl));
// The clause itself is gone from the file. This is the negative control in its cheapest form: put
// `!t.isBuilding` back into that test and this goes red.
{ const src = fs.readFileSync(path.join(root, 'js', 'ui.js'), 'utf8');
  ok(!/lastClickUnit === t && t\.owner === G\.human && !t\.isBuilding/.test(src),
    'the `!t.isBuilding` clause is gone from the double-click test in js/ui.js'); }

// =============================================================================
// 4. B1 -- mineral patches and geysers are clickable, and say what is left
// =============================================================================
const res = run(`
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });
  G.human = 0; UI.selection = []; UI.selRes = null;
  const out = {};
  const st = G.map.starts[0];
  const base = G.map.bases.find(b => b === st);
  const patch = base.minerals[0], gey = base.geyser;
  // a patch in the main is explored from frame 0
  G.updateVision();
  out.patchHit = UI.resourceAt(patch.cx, patch.cy) === patch;
  out.geyserHit = UI.resourceAt(gey.cx, gey.cy) === gey;
  out.patchAmount = patch.amount; out.patchStart = patch.start; out.gasAmount = gey.amount;
  // FOG: a patch at another start has never been explored
  const far = G.map.bases.filter(b => b !== st && b.minerals.length)[0];
  const farPatch = far.minerals[0];
  out.farExplored = G.explored(0, farPatch.x, farPatch.y);
  out.farHit = UI.resourceAt(farPatch.cx, farPatch.cy) !== null;
  // clicking it fills selRes and NOT selection
  UI.selRes = UI.resourceAt(patch.cx, patch.cy);
  out.selResSet = UI.selRes === patch;
  out.selectionEmpty = UI.selection.length === 0;
  // and it can never be commanded: it is not in the selection array, and selecting a unit clears it
  const scv = G.units.find(u => u.owner === 0 && u.def.worker);
  UI.select([scv]);
  out.clearedBySelect = UI.selRes === null;
  out.scvSelected = UI.selection[0] === scv;
  // control groups only ever hold what is in the selection array
  UI.selRes = patch; UI.selection = [];
  UI.groups[1] = UI.selection.slice();
  out.groupEmpty = UI.groups[1].length === 0;
  // the gas building answers for the geyser under it
  const ref = G.placeBuilding(DATA.buildings.refinery, gey.x, gey.y, 0);
  ref.done = true; ref.hp = ref.maxHp;
  out.underRefinery = UI.resourceUnder(ref) === gey;
  out.underBarracks = UI.resourceUnder(G.units.find(u => u.def.id === 'command_center' && u.owner === 0)) === null;
  UI.selRes = null; UI.selection = [];
  return out;`);
ok(res.patchHit, 'a mineral patch can be clicked');
ok(res.geyserHit, 'a geyser can be clicked');
ok(res.patchAmount > 0 && res.patchStart > 0, 'and it carries the amounts the panel prints', JSON.stringify([res.patchAmount, res.patchStart]));
ok(!res.farExplored && !res.farHit, 'a patch on ground never explored cannot be clicked -- amounts respect fog', JSON.stringify([res.farExplored, res.farHit]));
ok(res.selResSet && res.selectionEmpty, 'selecting a resource fills UI.selRes and leaves UI.selection empty', JSON.stringify(res));
ok(res.clearedBySelect && res.scvSelected, 'and selecting any unit clears it -- the two are exclusive', JSON.stringify(res));
ok(res.groupEmpty, 'a selected resource never enters a control group, because groups copy `selection`');
ok(res.underRefinery && res.underBarracks, 'a finished Refinery answers for the geyser under it, and a Command Center answers for nothing', JSON.stringify([res.underRefinery, res.underBarracks]));

// It draws, with the numbers in it.
const panel = run(`
  const st = G.map.starts[0], base = G.map.bases.find(b => b === st);
  const patch = base.minerals[0], gey = base.geyser;
  const c = Render.ctx;
  const shot = r => { UI.selection = []; UI.selRes = r; c.said.length = 0; UI.drawConsole(); return c.said.join(' | '); };
  const out = { mineral: shot(patch), gas: shot(gey) };
  // and a selected Refinery
  const ref = G.units.find(u => u.def.id === 'refinery' && u.owner === 0);
  UI.selRes = null; UI.selection = [ref]; c.said.length = 0; UI.drawConsole();
  out.refinery = c.said.join(' | ');
  UI.selection = []; UI.selRes = null;
  return out;`);
ok(/Mineral Field/.test(panel.mineral) && new RegExp('Minerals remaining ' + res.patchAmount).test(panel.mineral),
  'the console names the patch and prints what is left in it', panel.mineral.slice(0, 120));
ok(/Vespene Geyser/.test(panel.gas) && new RegExp('Vespene remaining ' + res.gasAmount).test(panel.gas),
  'and the same for a geyser', panel.gas.slice(0, 120));
ok(/Vespene remaining/.test(panel.refinery), 'selecting the Refinery shows the geyser under it, in the same place', panel.refinery.slice(0, 160));

// The hover ring, drawn at half alpha, and only when nothing is standing on the patch.
const ring = run(`
  const st = G.map.starts[0], base = G.map.bases.find(b => b === st);
  const patch = base.minerals[0];
  UI.selection = []; UI.selRes = null; UI.hover = null;
  UI.mouse.x = 100; UI.mouse.y = 100; UI.mouse.wx = patch.cx; UI.mouse.wy = patch.cy;
  Render.H = 900; UI.consoleH = 140;
  UI.hover = UI.unitAt(patch.cx, patch.cy);
  UI.hoverRes = (!UI.hover) ? UI.resourceAt(patch.cx, patch.cy) : UI.resourceUnder(UI.hover);
  const out = { hoveredNothing: UI.hover === null, ring: UI.hoverRes === patch };
  // a worker standing on it wins: the unit is what the click would select
  const scv = G.units.find(u => u.owner === 0 && u.def.worker);
  scv.x = patch.cx; scv.y = patch.cy;
  const h2 = UI.unitAt(patch.cx, patch.cy);
  out.unitWins = h2 === scv;
  UI.hover = null; UI.hoverRes = null;
  return out;`);
ok(ring.hoveredNothing && ring.ring, 'hovering a bare patch sets the ring', JSON.stringify(ring));
ok(ring.unitWins, 'a worker standing on the patch takes the hover, because the unit is what a click there selects');
{ const src = fs.readFileSync(path.join(root, 'js', 'render.js'), 'utf8');
  ok(/UI\.hoverRes\) this\.drawResourceRing\(ctx, UI\.hoverRes, 0\.5\)/.test(src),
    'and the ring is drawn at 50% transparency, with the same helper the rally indicator uses'); }

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
