// FIXLIST-M14 A1 -- every unit and every building says what it is FOR.
//
// Before this, `grep -c "desc:" js/data.js` returned 0: not one of the 73 buildings and not one of the
// 85 units carried a description, so the command card could tell a player a name and a price and
// nothing else. The reported symptom was two buildings ("the healing and jammer ones have no
// description"); the cause was that NOTHING had one.
//
// Three things are checked here and the first is the one that has to keep working: EVERY def has a
// description, so a unit added in a later milestone cannot ship without one. The other two are the
// two surfaces that render it -- the command-card tooltip and the codex detail pane -- each with its
// own negative control: strip the desc off one def and the surface must stop drawing it.
//
//   node test/describe.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');

// ---- a canvas that records the strings drawn through it ---------------------
// Everything is a no-op except measureText (the wrap has to be able to measure) and fillText, which
// appends. HUD.text paints a black outline by calling fillText five times before the real one, so the
// recorder de-duplicates consecutive identical strings or every line would appear six times.
function recorder() {
  const grad = { addColorStop() { } };
  const c = {
    said: [], canvas: null, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: '', lineJoin: '',
    textAlign: '', textBaseline: '', globalCompositeOperation: '', imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: '',
    measureText(s) { return { width: String(s).length * 6 }; },
    fillText(s) { if (c.said[c.said.length - 1] !== String(s)) c.said.push(String(s)); },
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; }, createPattern() { return null; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; },
    putImageData() { }, createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; },
  };
  for (const m of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect',
    'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'strokeText', 'translate', 'scale', 'rotate',
    'transform', 'setTransform', 'resetTransform', 'drawImage', 'setLineDash', 'quadraticCurveTo', 'bezierCurveTo']) c[m] = () => { };
  return c;
}
function fakeCanvas() { const cv = { width: 1, height: 1, style: {}, getContext: () => cv._c || (cv._c = recorder()), toDataURL: () => '', addEventListener() { }, appendChild() { }, remove() { }, click() { }, value: '' }; return cv; }

const errors = [];
const ctx = {
  console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, clearTimeout,
  setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } },
  location: { protocol: 'http:', host: 'localhost' },
  document: { getElementById: () => fakeCanvas(), createElement: () => fakeCanvas(), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain',
  'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud', 'codex'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };
const run = body => vm.runInContext('(() => {' + body + '})()', ctx);

// ---- 1. coverage: every def, no exceptions ---------------------------------
// DESC_MAX is read out of the data table, never written as a literal here. A stale constant in a test
// has cost this repository real time twice (AI.supply() returning early at 200 against a SUPPLY_CAP
// that had been 500 for a milestone), so the ceiling has exactly one definition.
const cover = run(`
  const out = { max: DESC_MAX, missing: [], tooLong: [], lazy: [], units: 0, buildings: 0, total: 0 };
  for (const [kind, table] of [['unit', DATA.units], ['building', DATA.buildings]]) {
    for (const id of Object.keys(table)) {
      const d = table[id]; out.total++;
      if (kind === 'unit') out.units++; else out.buildings++;
      const s = d.desc;
      if (typeof s !== 'string' || !s.trim()) { out.missing.push(id); continue; }
      if (s.length > DESC_MAX) out.tooLong.push(id + ':' + s.length);
      // "Marine. A Marine." is not a description. A def whose whole text is its own name, or which is
      // shorter than a clause, is a placeholder and this is the check that refuses it.
      if (s.trim().length < 25 || s.trim().toLowerCase().replace(/[^a-z]/g, '') === String(d.name).toLowerCase().replace(/[^a-z]/g, '')) out.lazy.push(id);
    }
  }
  return out;`);
ok(cover.missing.length === 0, 'every unit and every building has a desc (' + cover.total + ' of them: ' + cover.units + ' units, ' + cover.buildings + ' buildings)', cover.missing.slice(0, 6).join(', '));
ok(cover.tooLong.length === 0, 'no desc is longer than DESC_MAX (' + cover.max + ') characters', cover.tooLong.slice(0, 6).join(', '));
ok(cover.lazy.length === 0, 'no desc is a placeholder -- none is just the name back again', cover.lazy.slice(0, 6).join(', '));
ok(cover.units === 85 && cover.buildings === 73, 'the tables are the size this test thinks they are', cover.units + '/' + cover.buildings);

// ---- 2. the command-card tooltip renders it under the cost ------------------
// Driven through the real UI.drawConsole with the mouse parked on a real card button, so what is
// asserted is what a player hovering a Barracks sees, not a helper called in isolation.
const tip = run(`
  UI.start({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 4, layout: 'temple' });
  UI.menu = null; Render.init(document.getElementById('game'));
  Render.W = 1600; Render.H = 900; Render.viewW = 1600; Render.viewH = 760;
  const p = G.players[G.human];
  const cc = G.units.find(u => u.owner === G.human && u.def.id === 'command_center');
  const out = { thrown: null };
  // Select the hall: its card offers SCV, whose desc is the string we are looking for.
  UI.selection = [cc];
  const hover = label => {
    const btn = UI.currentCard().find(b => b.label === label);
    if (!btn) return null;
    const cr = UI.cardRect();
    UI.mouse.x = cr.x + 4 + (btn.slot % UI.CARD_COLS) * (cr.bw + cr.gap) + cr.bw / 2;
    UI.mouse.y = cr.y + 4 + Math.floor(btn.slot / UI.CARD_COLS) * (cr.bh + cr.gap) + cr.bh / 2;
    const c = Render.ctx; c.said.length = 0;
    UI.drawConsole();
    return { said: c.said.slice(), tip: UI.tooltip };
  };
  try {
    const r = hover('SCV');
    out.gotTip = !!(r && r.tip);
    out.tipDesc = r && r.tip && r.tip.desc;
    out.deflDesc = DATA.units.scv.desc;
    // The description is drawn as wrapped lines, so look for its first few words rather than the whole
    // sentence -- a match on the joined output would pass even if nothing had been wrapped at all.
    const joined = (r ? r.said : []).join(' ');
    out.drewHead = joined.includes(out.deflDesc.split(' ').slice(0, 4).join(' '));
    out.drewTail = joined.includes(out.deflDesc.split(' ').slice(-4).join(' '));
    out.drewCost = joined.includes('50 minerals');
    out.wrapped = HUD.wrapLines(Render.ctx, out.deflDesc, UI.TIP_W, 10).length;
    out.widest = Math.max(...HUD.wrapLines(Render.ctx, out.deflDesc, UI.TIP_W, 10).map(l => Render.ctx.measureText(l).width));

    // NEGATIVE CONTROL. Take the desc away and the same hover must stop drawing it, while the cost
    // line it sits under is untouched. Restored immediately afterwards.
    const saved = DATA.units.scv.desc; delete DATA.units.scv.desc;
    const n = hover('SCV');
    const nj = (n ? n.said : []).join(' ');
    out.negDrewHead = nj.includes(saved.split(' ').slice(0, 4).join(' '));
    out.negDrewCost = nj.includes('50 minerals');
    DATA.units.scv.desc = saved;

    // A description that mentions gas must not be mistaken for a price. The Refinery's says "harvest
    // gas", and the cost lines are coloured by searching them for that very word.
    out.refineryInLines = false;
    const bld = UI.currentCard();
    out.refineryDesc = DATA.buildings.refinery.desc;
  } catch (e) { out.thrown = (e && e.message) || String(e); }
  return out;`);
ok(tip.thrown === null, 'hovering a card button never throws', String(tip.thrown));
ok(tip.gotTip && tip.tipDesc === tip.deflDesc, 'the tooltip carries the hovered def\'s description', String(tip.tipDesc).slice(0, 40));
ok(tip.drewCost, 'the cost line is still drawn');
ok(tip.drewHead && tip.drewTail, 'the whole description is drawn, first words and last', 'head=' + tip.drewHead + ' tail=' + tip.drewTail);
ok(tip.wrapped >= 2, 'it wraps rather than running off in one line (' + tip.wrapped + ' lines)');
ok(tip.widest <= 260, 'no wrapped line is wider than UI.TIP_W', String(tip.widest));
ok(!tip.negDrewHead && tip.negDrewCost, 'NEGATIVE CONTROL: delete the desc and the tooltip loses it, and only it', 'desc=' + tip.negDrewHead + ' cost=' + tip.negDrewCost);
// The tooltip colours its cost lines by looking for the words "minerals", "gas" and "energy" in them.
// A description is a sentence and will contain those words -- the Refinery's does -- so it must not be
// pushed into `lines`. This asserts the separation directly.
ok(/\bgas\b/.test(tip.refineryDesc), 'the Refinery description does contain the word "gas" -- so the separation below matters', tip.refineryDesc);

const sep = run(`
  const cc = G.units.find(u => u.owner === G.human && u.def.id === 'command_center');
  const scv = G.units.find(u => u.owner === G.human && u.def.id === 'scv');
  UI.selection = [scv]; UI.cardMenu = 'basic';
  const btn = UI.currentCard().find(b => b.label === 'Refinery');
  const cr = UI.cardRect();
  UI.mouse.x = cr.x + 4 + (btn.slot % UI.CARD_COLS) * (cr.bw + cr.gap) + cr.bw / 2;
  UI.mouse.y = cr.y + 4 + Math.floor(btn.slot / UI.CARD_COLS) * (cr.bh + cr.gap) + cr.bh / 2;
  Render.ctx.said.length = 0; UI.drawConsole();
  const out = { lines: UI.tooltip ? UI.tooltip.lines.slice() : null, desc: UI.tooltip ? UI.tooltip.desc : null };
  UI.cardMenu = null; UI.selection = [];
  return out;`);
ok(sep.lines && sep.lines.every(l => !/harvest/.test(l)), 'the description is NOT pushed into the cost lines, where it would be coloured as a price', JSON.stringify(sep.lines));
ok(sep.desc === tip.refineryDesc, 'it travels in its own field instead', String(sep.desc).slice(0, 40));

// ---- 3. the codex detail pane renders it too --------------------------------
const cdx = run(`
  const out = { thrown: [], hits: 0, checked: 0 };
  const c = document.createElement('canvas').getContext('2d');
  Render.W = 1600; Render.H = 900;
  Codex.open();
  const shows = id => {
    const d = DATA.all[id];
    Codex.race = d.race; Codex.kind = d.isBuilding ? 'structures' : 'units'; Codex.sel = id;
    c.said.length = 0;
    try { Codex.draw(c); } catch (e) { out.thrown.push(id + ': ' + (e && e.message)); return false; }
    const j = c.said.join(' ');
    return !!(d.desc && j.includes(d.desc.split(' ').slice(0, 4).join(' ')));
  };
  for (const id of ['marine', 'thor', 'zergling', 'hatchery', 'nexus', 'photon_cannon', 'aid_station', 'scrambler_mast', 'reactor', 'sensor_tower']) { out.checked++; if (shows(id)) out.hits++; }
  const saved = DATA.units.marine.desc; delete DATA.units.marine.desc;
  out.negative = shows('marine');
  DATA.units.marine.desc = saved;
  Codex.close();
  return out;`);
ok(cdx.thrown.length === 0, 'the codex draws the description without throwing', cdx.thrown.slice(0, 3).join(' | '));
ok(cdx.hits === cdx.checked, 'the codex detail pane shows the description (' + cdx.hits + '/' + cdx.checked + ', including the two buildings that were reported)');
ok(cdx.negative === false, 'NEGATIVE CONTROL: delete the desc and the codex stops showing it');

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));

console.log(fail ? `FAIL  ${pass} passed, ${fail} failed` : `ALL PASS  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
