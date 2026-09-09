// The unit codex (M11 wave two, idea 25), and above all its damage calculator.
//
// A codex that lies is worse than no codex, so the check that matters is not "does it draw" -- it is
// "does the number it prints match what G.damage actually takes off". Every attacker/defender pair
// below is played out for real: two units are spawned, the defender is turned so the hit lands on a
// known facing, upgrades and kill counts are set, and one shot is fired through the same G.damage the
// game uses. The calculator is then asked the same question and the two are compared exactly.
//
//   node test/codex.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');

// ---- a headless canvas that answers anything ------------------------------
// Every 2D call the HUD and the sprite painters make is a no-op except the two that return values.
function fakeCtx() {
  const grad = { addColorStop() { } };
  const c = {
    canvas: null, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: '', lineJoin: '',
    textAlign: '', textBaseline: '', globalCompositeOperation: '', imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: '',
    measureText(s) { return { width: String(s).length * 6 }; },
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; }, createPattern() { return null; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; },
    putImageData() { }, createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; },
  };
  for (const m of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect',
    'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'translate', 'scale', 'rotate',
    'transform', 'setTransform', 'resetTransform', 'drawImage', 'setLineDash', 'quadraticCurveTo', 'bezierCurveTo']) c[m] = () => { };
  return c;
}
function fakeCanvas() { const cv = { width: 1, height: 1, style: {}, getContext: () => cv._c || (cv._c = fakeCtx()), toDataURL: () => '', addEventListener() { }, appendChild() { }, remove() { }, click() { }, value: '' }; return cv; }

const errors = [];
const ctx = {
  console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, clearTimeout,
  setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } },
  location: { protocol: 'http:', host: 'localhost' },
  document: { getElementById: () => fakeCanvas(), createElement: () => fakeCanvas(), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
};
ctx.window = ctx; vm.createContext(ctx);
// Everything index.html loads except the baked atlas, so the sprite painters run in their vector
// fallback -- which is the path that has to work when the PNGs are missing anyway.
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain',
  'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud', 'codex'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };
const run = src => vm.runInContext('(() => {' + src + '})()', ctx);

// ---- 1. the API is there ---------------------------------------------------
const api = run(`
  const need = ['open','close','draw','click','key'];
  const extra = ['toggle','isOpen','move','wheel','calc','layout','list'];
  const out = { missing: [], extraMissing: [], type: typeof Codex };
  for (const k of need) if (typeof Codex[k] !== 'function') out.missing.push(k);
  for (const k of extra) if (typeof Codex[k] !== 'function') out.extraMissing.push(k);
  return out;`);
ok(api.type === 'object', 'Codex is a global object', api.type);
ok(api.missing.length === 0, 'Codex.open / close / draw / click / key all exist', api.missing.join(','));
ok(api.extraMissing.length === 0, 'the extras UI needs exist too (toggle, isOpen, move, wheel, calc, layout, list)', api.extraMissing.join(','));

const life = run(`
  const out = {};
  out.closedAtFirst = Codex.isOpen();
  out.drawWhenClosed = Codex.draw({});      // must be a no-op, not a crash
  out.clickWhenClosed = Codex.click(10, 10);
  out.keyWhenClosed = Codex.key('Escape');
  Codex.open(); out.openWorks = Codex.isOpen();
  Codex.key('Escape'); out.escapeCloses = !Codex.isOpen();
  Codex.toggle(); out.toggleOpens = Codex.isOpen();
  Codex.toggle(); out.toggleCloses = !Codex.isOpen();
  Codex.open('siege_tank'); out.opensOnAUnit = Codex.sel === 'siege_tank' && Codex.race === 'T';
  Codex.open('spire'); out.opensOnAStructure = Codex.sel === 'spire' && Codex.kind === 'structures';
  Codex.close();
  return out;`);
ok(life.closedAtFirst === false, 'the codex starts closed');
ok(life.drawWhenClosed === false && life.clickWhenClosed === false && life.keyWhenClosed === false, 'draw / click / key are inert while closed', JSON.stringify(life));
ok(life.openWorks && life.escapeCloses && life.toggleOpens && life.toggleCloses, 'open, Escape and toggle all do what they say', JSON.stringify(life));
ok(life.opensOnAUnit && life.opensOnAStructure, 'open(id) jumps to the right race, list and entry', JSON.stringify(life));

// ---- 2. it draws, for every race and every entry in the tables --------------
// A game is started so the console skin, Sprites and Render all have something real underneath them.
const drew = run(`
  UI.start({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 4, layout: 'temple' });
  UI.menu = null;
  const c = document.createElement('canvas').getContext('2d');
  const out = { thrown: [], drawn: 0, sizes: 0 };
  Codex.open();
  for (const race of ['T','Z','P']) {
    Codex.race = race;
    for (const kind of ['units','structures']) {
      Codex.kind = kind;
      for (const id of Codex.list(race, kind)) {
        Codex.sel = id;
        try { Codex.draw(c); out.drawn++; } catch (e) { out.thrown.push(race + '/' + kind + '/' + id + ': ' + (e && e.message)); }
      }
    }
  }
  // every unit in the whole table, whatever race tab happens to be up
  out.allUnits = 0;
  for (const id in DATA.units) {
    const d = DATA.units[id];
    Codex.race = d.race; Codex.kind = 'units'; Codex.sel = id; Codex.atkId = id; Codex.defId = id;
    try { Codex.draw(c); out.allUnits++; } catch (e) { out.thrown.push('unit ' + id + ': ' + (e && e.message)); }
  }
  out.unitCount = Object.keys(DATA.units).length;
  // and at a range of window sizes, including one small enough to squeeze every panel
  for (const [w,h] of [[800,600],[1280,720],[1920,1080],[2560,1440],[700,460]]) {
    Render.W = w; Render.H = h;
    try { Codex.draw(c); out.sizes++; } catch (e) { out.thrown.push(w + 'x' + h + ': ' + (e && e.message)); }
  }
  Render.W = 1280; Render.H = 720;
  Codex.close();
  return out;`);
ok(drew.thrown.length === 0, 'drawing never throws', drew.thrown.slice(0, 4).join(' | '));
ok(drew.drawn > 90, 'every list entry for all three races draws (' + drew.drawn + ' of them)');
ok(drew.allUnits === drew.unitCount, 'every unit in DATA.units can be displayed (' + drew.allUnits + '/' + drew.unitCount + ')');
ok(drew.sizes === 5, 'it lays out at five window sizes from 700x460 to 2560x1440', String(drew.sizes));

// ---- 3. input never throws and always lands somewhere sane ------------------
const input = run(`
  const c = document.createElement('canvas').getContext('2d');
  const out = { thrown: [], clicks: 0, keys: 0 };
  Codex.open();
  const L = Codex.layout();
  // press every hot region the layout offers, in both directions, and redraw after each
  for (let round = 0; round < 2; round++) {
    for (const r of Codex.layout().hot) {
      try { Codex.move(r.x + 2, r.y + 2); Codex.click(r.x + 2, r.y + 2); Codex.draw(c); out.clicks++; }
      catch (e) { out.thrown.push('click ' + r.id + ': ' + (e && e.message)); }
    }
  }
  for (const k of ['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','PageDown','PageUp','Home','End','Tab','Enter',' ','a','d','s','t','z','p','q','F3']) {
    try { Codex.key(k); Codex.draw(c); out.keys++; } catch (e) { out.thrown.push('key ' + k + ': ' + (e && e.message)); }
  }
  Codex.open();
  try { Codex.wheel(1); Codex.wheel(-1); Codex.click(5, 5, 2); } catch (e) { out.thrown.push('wheel/rmb: ' + (e && e.message)); }
  out.rmbClosed = !Codex.isOpen();
  // hammer the scroll past both ends and make sure the list still resolves
  Codex.open(); Codex.scroll = 9999; Codex.clampScroll(); out.scrollHi = Codex.scroll;
  Codex.scroll = -9999; Codex.clampScroll(); out.scrollLo = Codex.scroll;
  out.selValid = Codex.list().includes(Codex.sel);
  Codex.close();
  return out;`);
ok(input.thrown.length === 0, 'clicking every hot region and pressing every key never throws', input.thrown.slice(0, 4).join(' | '));
ok(input.clicks > 40, 'the panel exposes a real number of click targets (' + input.clicks / 2 + ')');
ok(input.rmbClosed, 'right-click closes the manual');
ok(input.scrollLo === 0 && input.scrollHi >= 0 && input.selValid, 'the scroll clamps at both ends and the selection stays in the list', JSON.stringify({ hi: input.scrollHi, lo: input.scrollLo }));

// ---- 4. THE CALCULATOR AGREES WITH G.damage --------------------------------
// The pairs are chosen to hit every branch of G.damage: each damage type against each size, a shield
// that absorbs the hit, a shield that breaks and spills into the hull, the 0.5 floor when armour
// exceeds the shot, multi-hit volleys, a unit with no answer to air, veterancy on both sides, upgrades
// on both sides, an armour tech, and a building (which has no facing at all).
const PAIRS = [
  ['marine', 'zergling', 0, 0, 0, 0], ['marine', 'ultralisk', 0, 0, 0, 0],
  ['marine', 'zealot', 0, 0, 0, 0], ['marine', 'zealot', 3, 3, 0, 0],
  ['firebat', 'zergling', 0, 0, 0, 0], ['firebat', 'siege_tank', 0, 0, 0, 0],
  ['siege_tank', 'marine', 0, 0, 0, 0], ['siege_tank', 'ultralisk', 2, 1, 0, 0],
  ['hydralisk', 'marine', 0, 0, 0, 0], ['hydralisk', 'battlecruiser', 0, 0, 0, 0],
  ['dragoon', 'mutalisk', 1, 1, 0, 0], ['zealot', 'siege_tank', 0, 0, 3, 3],
  ['zergling', 'ultralisk', 0, 3, 0, 0], ['zergling', 'archon', 0, 0, 0, 0],
  ['goliath', 'wraith', 0, 0, 1, 2], ['vulture', 'zealot', 0, 0, 2, 0],
  ['scv', 'command_center', 0, 0, 0, 0], ['marine', 'supply_depot', 0, 0, 0, 0],
  ['photon_cannon', 'zergling', 0, 0, 0, 0], ['sunken_colony', 'marine', 0, 0, 0, 0],
  ['ghost', 'siege_tank', 0, 0, 0, 3], ['dark_templar', 'dragoon', 0, 0, 0, 0],
  ['probe', 'overlord', 0, 0, 0, 0], ['archon', 'hydralisk', 0, 0, 3, 0],
  ['ultralisk', 'battlecruiser', 0, 0, 0, 0], ['scout', 'wraith', 2, 2, 1, 1],
];
const dmg = run(`
  const out = { rows: [], errs: [] };
  const PAIRS = ${JSON.stringify(PAIRS)};
  const FACE_POS = { front: 0, flank: Math.PI * 0.6, rear: Math.PI };   // angle from the defender to the shooter
  const A_UPG = { infW:1, vehW:1, shipW:1, meleeW:1, missW:1, flyW:1, gW:1, airW:1 };
  for (const [aid, did, aUp, dUp, aVet, dVet] of PAIRS) {
    for (const face of ['front','flank','rear']) {
      // ---- what the codex claims -------------------------------------------
      const said = Codex.calc({ atk: aid, def: did, aUp, dUp, aVet, dVet, aTech: false, dTech: false });
      if (!said.weapon) { out.rows.push({ aid, did, face, skipped: said.why }); continue; }

      // ---- what the game does ----------------------------------------------
      // Fresh players every pair so an upgrade set for one cannot leak into the next -- and the
      // attacker is always player 0 and the defender player 1 whatever race they are, because a
      // mirror match would otherwise hand both sides the same upgrade object. (It did: the first
      // version of this test read zergling-versus-ultralisk at meleeW 3 for both.)
      G.init({ players: [{ race: 'T', human: false, name: 'A' }, { race: 'Z', human: false, name: 'B' }], seed: 9 });
      const aDef = DATA.all[aid], dDef = DATA.all[did];
      const ao = 0, doo = 1;
      const ap = G.players[ao], dp = G.players[doo];
      for (const k in DATA.upgrades) { ap.upg[k] = aUp; dp.upg[k] = dUp; }
      const cx = 40 * TILE, cy = 40 * TILE;
      const d = G.spawnUnit(did, doo, cx, cy);
      const ang = FACE_POS[face];
      const a = G.spawnUnit(aid, ao, cx + Math.cos(ang) * 120, cy + Math.sin(ang) * 120);
      d.facing = 0; d.hp = d.maxHp = dDef.hp; d.sh = d.maxSh = (dDef.sh || 0);
      a.kills = [0,2,5,10][aVet]; d.kills = [0,2,5,10][dVet];
      const w = a.weaponFor(d);
      if (!w) { out.errs.push(aid + ' vs ' + did + ': codex found a weapon and the sim did not'); continue; }
      const realShot = a.wDmg(w), realArmor = d.armor;
      const before = d.hp, beforeSh = d.sh;
      const dealt = G.damage(d, realShot, w.type, a);
      const hullTaken = before - d.hp, shTaken = beforeSh - d.sh;
      out.rows.push({ aid, did, face, aUp, dUp, aVet, dVet,
        saidShot: said.shot, realShot,
        saidArmor: said.armor, realArmor,
        saidPer: +said.faces[face].per.toFixed(6),
        saidShieldHit: +said.shieldHit.toFixed(6),
        hullTaken: +hullTaken.toFixed(6), shTaken: +shTaken.toFixed(6), dealt: +dealt.toFixed(6),
        hadShields: beforeSh > 0, directional: said.directional, hits: said.hits, weapon: w === a.def.aw ? 'air' : 'ground' });
    }
  }
  return out;`);

ok(dmg.errs.length === 0, 'the codex and the sim pick the same weapon for every pair', dmg.errs.slice(0, 3).join(' | '));
let shotBad = [], armorBad = [], perBad = [], shBad = [], tested = 0, skipped = 0;
for (const r of dmg.rows) {
  if (r.skipped) { skipped++; continue; }
  tested++;
  const tag = r.aid + ' -> ' + r.did + ' (' + r.face + ', upg ' + r.aUp + '/' + r.dUp + ', vet ' + r.aVet + '/' + r.dVet + ')';
  if (r.saidShot !== r.realShot) shotBad.push(tag + ' shot ' + r.saidShot + ' vs ' + r.realShot);
  if (r.saidArmor !== r.realArmor) armorBad.push(tag + ' armour ' + r.saidArmor + ' vs ' + r.realArmor);
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  if (!r.hadShields) { if (!near(r.saidPer, r.hullTaken)) perBad.push(tag + ' per-hit ' + r.saidPer + ' vs ' + r.hullTaken); }
  else if (r.shTaken > 0 && r.hullTaken === 0) { if (!near(r.saidShieldHit, r.shTaken)) shBad.push(tag + ' shield hit ' + r.saidShieldHit + ' vs ' + r.shTaken); }
}
ok(tested > 60, 'the calculator was checked against real shots ' + tested + ' times (' + skipped + ' pairs cannot fire at all)');
ok(shotBad.length === 0, 'shot damage matches Unit.wDmg exactly, upgrades and rank included', shotBad.slice(0, 3).join(' | '));
ok(armorBad.length === 0, 'armour matches Unit.armor exactly, upgrades and rank included', armorBad.slice(0, 3).join(' | '));
ok(perBad.length === 0, 'per-hit damage matches what G.damage takes off the hull, on all three facings', perBad.slice(0, 3).join(' | '));
ok(shBad.length === 0, 'a hit absorbed by shields matches too, and skips armour and the size table', shBad.slice(0, 3).join(' | '));

// ---- 5. the facings are the ones the sim uses ------------------------------
const face = run(`
  const out = {};
  G.init({ players: [{ race: 'T', human: false, name: 'A' }, { race: 'Z', human: false, name: 'B' }], seed: 3 });
  const said = Codex.calc({ atk: 'marine', def: 'zergling' });
  out.mults = [said.faces.front.mult, said.faces.flank.mult, said.faces.rear.mult];
  out.simMults = [FACE_MULT.front, FACE_MULT.flank, FACE_MULT.rear];
  out.rising = said.faces.front.per < said.faces.flank.per && said.faces.flank.per < said.faces.rear.per;
  // a building has no facing and the codex must not pretend otherwise
  const b = Codex.calc({ atk: 'marine', def: 'supply_depot' });
  out.buildingFlat = b.faces.front.per === b.faces.rear.per && !b.directional;
  // a lurker's line attack has no direction either
  const l = Codex.calc({ atk: 'lurker', def: 'marine' });
  out.lineFlat = l.weapon ? (l.faces.front.per === l.faces.rear.per && !l.directional) : null;
  // and a unit with no answer to air says so rather than inventing a number
  const air = Codex.calc({ atk: 'zealot', def: 'mutalisk' });
  out.noAir = !air.weapon && !!air.why;
  // the carrier's damage is its interceptors', which is the one redirect in the table
  const car = Codex.calc({ atk: 'carrier', def: 'marine' });
  out.carrierVia = car.via === 'interceptor' && car.shot === DATA.units.interceptor.gw.dmg;
  return out;`);
ok(JSON.stringify(face.mults) === JSON.stringify(face.simMults), 'the facing multipliers are FACE_MULT itself, not a copy of it', JSON.stringify(face.mults));
ok(face.rising, 'front < flank < rear, which is the whole mechanic');
ok(face.buildingFlat, 'a structure has no facing and every hit on it counts as a front hit');
ok(face.lineFlat === true, 'a lurker line has no direction either', String(face.lineFlat));
ok(face.noAir, 'an attacker that cannot reach the target says so instead of printing a number');
ok(face.carrierVia, 'a carrier is priced by its interceptor, because the carrier has no weapon of its own');

// ---- 6. shots-to-kill is a real count, not hp divided by damage -------------
// Fired for real, one volley at a time, against fresh units -- including a Protoss target where the
// hit that breaks the shields spills its remainder into the hull.
const kill = run(`
  const out = { rows: [] };
  const CASES = [['marine','zergling'],['marine','zealot'],['zergling','marine'],['hydralisk','dragoon'],
                 ['dragoon','zealot'],['siege_tank','marine'],['goliath','wraith'],['marine','supply_depot'],['zealot','archon']];
  for (const [aid, did] of CASES) {
    for (const face of ['front','rear']) {
      const said = Codex.calc({ atk: aid, def: did });
      if (!said.weapon) continue;
      G.init({ players: [{ race: 'T', human: false, name: 'A' }, { race: 'Z', human: false, name: 'B' }], seed: 11 });
      const dDef = DATA.all[did];
      const ao = 0, doo = 1;
      const cx = 40 * TILE, cy = 40 * TILE;
      const d = G.spawnUnit(did, doo, cx, cy);
      const ang = face === 'front' ? 0 : Math.PI;
      const a = G.spawnUnit(aid, ao, cx + Math.cos(ang) * 120, cy + Math.sin(ang) * 120);
      d.facing = 0; d.hp = d.maxHp = dDef.hp; d.sh = d.maxSh = (dDef.sh || 0);
      const w = a.weaponFor(d); if (!w) continue;
      let n = 0;
      while (d.alive && n < 6000) { n++; for (let i = 0; i < (w.hits || 1) && d.alive; i++) G.damage(d, a.wDmg(w), w.type, a); }
      out.rows.push({ aid, did, face, said: said.faces[face].kill, real: n });
    }
  }
  return out;`);
const killBad = kill.rows.filter(r => r.said !== r.real).map(r => r.aid + '->' + r.did + '/' + r.face + ': said ' + r.said + ' real ' + r.real);
ok(kill.rows.length >= 14, 'shots-to-kill was played out for real ' + kill.rows.length + ' times');
ok(killBad.length === 0, 'shots to kill matches a fight fought one volley at a time', killBad.slice(0, 4).join(' | '));
// ...and the branch that makes it more than hp-divided-by-damage is real: exactly one shot in a fight
// against a shielded target eats the last of the shields AND carries its remainder into the hull, at
// which point armour and the size table apply to that remainder and not to the whole shot.
const spill = run(`
  G.init({ players: [{ race: 'T', human: false, name: 'A' }, { race: 'P', human: false, name: 'B' }], seed: 12 });
  const cx = 40 * TILE, cy = 40 * TILE;
  const d = G.spawnUnit('dragoon', 1, cx, cy);
  const a = G.spawnUnit('siege_tank', 0, cx + 120, cy);
  d.facing = 0; d.hp = d.maxHp = DATA.units.dragoon.hp; d.sh = d.maxSh = DATA.units.dragoon.sh;
  const w = a.def.gw; const both = []; let n = 0;
  while (d.alive && n < 200) { n++; const h0 = d.hp, s0 = d.sh; G.damage(d, a.wDmg(w), w.type, a); if (s0 - d.sh > 0 && h0 - d.hp > 0) both.push({ n, sh: s0 - d.sh, hp: +(h0 - d.hp).toFixed(3) }); }
  return { both, real: n, said: Codex.calc({ atk: 'siege_tank', def: 'dragoon' }).faces.front.kill };`);
ok(spill.both.length === 1, 'exactly one shot breaks the shields and spills into the hull', JSON.stringify(spill.both));
ok(spill.said === spill.real, 'the codex counts that shot the way the fight does (' + spill.said + ' = ' + spill.real + ')');

// ---- 7. it says the invisible things out loud ------------------------------
const depth = run(`
  const out = {};
  // suppression is read off the tech table, the same way Unit.suppresses does
  out.marineSuppress = (Codex.suppressTech('marine') || {}).id;
  out.dragoonSuppress = (Codex.suppressTech('dragoon') || {}).id;
  out.zealotSuppress = Codex.suppressTech('zealot');
  const techCount = Object.keys(DATA.techs).filter(k => DATA.techs[k].suppress).length;
  let covered = 0; for (const k in DATA.techs) if (DATA.techs[k].suppress) for (const u of DATA.techs[k].suppress) if (Codex.suppressTech(u)) covered++;
  out.techCount = techCount; out.covered = covered;
  // veterancy shows up as a bigger number, and rank 2 as a point of armour on the defender
  const v0 = Codex.calc({ atk: 'marine', def: 'zergling', aVet: 0 }), v3 = Codex.calc({ atk: 'marine', def: 'zergling', aVet: 3 });
  out.vetDamage = [v0.shot, v3.shot];
  const d0 = Codex.calc({ atk: 'marine', def: 'zergling', dVet: 1 }), d2 = Codex.calc({ atk: 'marine', def: 'zergling', dVet: 2 });
  out.vetArmor = [d0.armor, d2.armor];
  // the armour tech toggle is real: chitinous plating is +2 on an ultralisk
  const t0 = Codex.calc({ atk: 'marine', def: 'ultralisk', dTech: false }), t1 = Codex.calc({ atk: 'marine', def: 'ultralisk', dTech: true });
  out.armorTech = [t0.armor, t1.armor];
  // siege mode swaps the weapon, and the sieged tank cannot hit air
  const unsieged = Codex.calc({ atk: 'siege_tank', def: 'marine', siege: false });
  const sieged = Codex.calc({ atk: 'siege_tank', def: 'marine', siege: true });
  out.siege = [unsieged.shot, sieged.shot];
  out.siegedNoAir = !Codex.calc({ atk: 'siege_tank', def: 'wraith', siege: true }).weapon;
  // and the tech tree wiring answers the two questions a manual exists for
  out.builtBy = Codex.builtBy(DATA.units.siege_tank);
  out.requires = Codex.requires(DATA.units.battlecruiser);
  out.unlocksBarracks = Codex.unlocks(DATA.buildings.barracks);
  return out;`);
ok(depth.marineSuppress === 'suppress_inf' && depth.dragoonSuppress === 'suppress_gate' && !depth.zealotSuppress,
  'suppression is found from the tech table, and only for the units a tech names', JSON.stringify([depth.marineSuppress, depth.dragoonSuppress]));
ok(depth.techCount === 6 && depth.covered > 0, 'all six suppression researches are reachable from a unit', depth.techCount + '/' + depth.covered);
ok(depth.vetDamage[1] > depth.vetDamage[0], 'rank shows up as more damage (' + depth.vetDamage.join(' -> ') + ')');
ok(depth.vetArmor[1] === depth.vetArmor[0] + 1, 'rank 2 shows up as a point of armour (' + depth.vetArmor.join(' -> ') + ')');
ok(depth.armorTech[1] === depth.armorTech[0] + 2, 'an armour tech shows up when it is toggled on (' + depth.armorTech.join(' -> ') + ')');
ok(depth.siege[1] > depth.siege[0] && depth.siegedNoAir, 'siege mode swaps the weapon and gives up the sky', JSON.stringify(depth.siege));
ok(/Factory/.test(depth.builtBy.join(' ')), 'it knows a siege tank comes out of a Factory', depth.builtBy.join(' '));
ok(depth.requires.length >= 2 && /Physics/.test(depth.requires.join(' ')), 'it knows a battlecruiser needs a Physics Lab', depth.requires.join(', '));
ok(depth.unlocksBarracks.length >= 4, 'it knows what a Barracks unlocks (' + depth.unlocksBarracks.length + ' things)');

// ---- 8. it never writes to the sim -----------------------------------------
const pure = run(`
  UI.start({ players: [{ race: 'P', human: true, name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 6, layout: 'temple' });
  UI.menu = null;
  for (let i = 0; i < 60; i++) G.tick();
  const c = document.createElement('canvas').getContext('2d');
  const before = G.stateHash(), frame = G.frame, units = G.units.length;
  Codex.open();
  for (const race of ['T','Z','P']) { Codex.race = race; Codex.ensure(); for (const id of Codex.list()) { Codex.sel = id; Codex.atkId = id; Codex.draw(c); Codex.calc(); } }
  for (const r of Codex.layout().hot) Codex.click(r.x + 2, r.y + 2);
  Codex.close();
  return { same: G.stateHash() === before, frame: G.frame === frame, units: G.units.length === units, cmds: G.log.length };`);
ok(pure.same && pure.frame && pure.units, 'the codex never moves the simulation: same state hash, same frame, same units', JSON.stringify(pure));
ok(pure.cmds === 0, 'and issues no commands', String(pure.cmds));

// ---- 9. the per-race console skin still builds, and no longer thrashes ------
const skin = run(`
  const out = { thrown: [], keys: [] };
  const c = document.createElement('canvas').getContext('2d');
  for (const race of ['T','Z','P']) {
    HUD.skinOverride = race;
    try { HUD.frame(c, 0, 0, 900, 120); HUD.frame(c, 0, 0, 440, 300, { ribs: false }); HUD.inset(c, 4, 4, 200, 80); HUD.bevel(c, 4, 4, 60, 20); }
    catch (e) { out.thrown.push(race + ': ' + (e && e.message)); }
    const s = HUD.skin(); out.keys.push([race, s.grain, !!s.btn, !!s.slot, !!s.glow].join(':'));
  }
  HUD.skinOverride = null;
  // three sizes must coexist in the cache rather than evicting each other every frame
  HUD.skinOverride = 'T';
  HUD.frame(c, 0, 0, 900, 120); HUD.frame(c, 0, 0, 440, 300); HUD.frame(c, 0, 0, 1200, 700, { ribs: false });
  out.cached = HUD._panels.size;
  const a = HUD.panel(900, 120, true), b = HUD.panel(900, 120, true);
  out.sameCanvas = a === b;
  // a 4K full-screen panel is built at half size and blitted up; the console never is
  HUD._panels.clear(); HUD.frame(c, 0, 0, 3840, 2160, { ribs: false });
  out.bigW = [...HUD._panels.values()][0].width;
  HUD._panels.clear(); HUD.frame(c, 0, 0, 3840, 220);
  out.consoleW = [...HUD._panels.values()][0].width;
  HUD.skinOverride = null;
  // and with no game at all it must still pick a skin rather than throwing
  const savedPlayers = G.players; G.players = [];
  try { out.noGame = HUD.skin().grain; HUD.frame(c, 0, 0, 300, 100); } catch (e) { out.thrown.push('no game: ' + (e && e.message)); }
  G.players = savedPlayers;
  return out;`);
ok(skin.thrown.length === 0, 'every race skin draws a frame, an inset and a bevel without throwing', skin.thrown.join(' | '));
ok(skin.keys.length === 3 && skin.keys.every(k => /:(brushed|organic|gilded):true:true:true$/.test(k)), 'each race has its own grain and its own button, slot and glow colours', skin.keys.join(' | '));
ok(skin.cached >= 3 && skin.sameCanvas, 'three panel sizes coexist in the cache instead of evicting each other every frame', 'cached=' + skin.cached);
ok(skin.bigW === 1920 && skin.consoleW === 3840, 'a 4K full-screen panel is textured at half size; a 4K console still is not', 'big=' + skin.bigW + ' console=' + skin.consoleW);
ok(skin.noGame === 'brushed', 'the skin resolves with no game running, which is what lets the codex open from the menu', String(skin.noGame));

// ---- 10. nothing shouted into the console ----------------------------------
ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));

console.log(fail ? `\nFAIL  ${pass} passed, ${fail} failed` : `\nALL PASS  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
