// FIXLIST-M15 A1 -- every weapon has its own shot, and every shot actually draws.
//
// MEASURED BEFORE THE CHANGE. Combat.visual() chose a shot's look from a hardcoded list of unit ids
// and anything absent fell through to { kind: 'bullet', color: '#ffe' }:
//
//     armed units         58
//     armed buildings      5
//     TOTAL armed         63
//     named in visual()   29
//     FALL THROUGH        34   (54%)
//
// The 34 that all looked identical included every unit M12 added -- Thor, Colossus, Carrier, Void Ray,
// Immortal, Phoenix, Mutalisk, Roach, Baneling, Lurker. The answer to "did you research their
// projectiles at all" was no.
//
// The fix is that the look comes off the WEAPON (DATA's SHOT table -> w.fx / w.col), not off a list of
// ids, so this file's job is to make a regression impossible rather than to admire the new art:
//
//   1. no armed weapon anywhere may be missing a shot -- DATA throws at load, and that throw is tested
//   2. per-WEAPON, not per-unit: a Goliath's two mounts must differ
//   3. the three races must be disjoint in kind, which is what keeps a zoomed-out fight readable
//   4. Combat.SHOT_T and FX's lerpPos durations must agree, because a mismatch does not throw
//   5. every kind must actually draw something -- a new case that silently does nothing is the M14
//      Hellion bug, where a duplicate `case 'flame'` made the second one unreachable
//
//   node test/shots.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'fx'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

// =============================================================================
// 1. every armed weapon in the game has a shot of its own
// =============================================================================
const W = J(`(() => {
  const out = [];
  for (const [src, isB] of [[DATA.units, false], [DATA.buildings, true]])
    for (const id of Object.keys(src))
      for (const slot of ['gw', 'aw'])
        if (src[id][slot]) out.push({ id, slot, b: isB, fx: src[id][slot].fx || null, col: src[id][slot].col || null, race: src[id].race || '-' });
  return out;
})()`);
ok(W.length >= 60, 'the scene is real: sixty-plus armed weapon slots were found', String(W.length));
const noFx = W.filter(w => !w.fx);
ok(noFx.length === 0, 'EVERY armed weapon has its own shot -- 34 of 63 used to fall through to a white bullet',
  noFx.map(w => w.id + ':' + w.slot).join(', '));
const noCol = W.filter(w => !w.col);
ok(noCol.length === 0, '...and its own colour', noCol.map(w => w.id + ':' + w.slot).join(', '));

const kinds = [...new Set(W.map(w => w.fx))];
ok(kinds.length >= 15, 'and there are genuinely many looks, not one look with many names', kinds.length + ': ' + kinds.join(' '));
// ANTI-VACUITY: "every weapon has an fx" is trivially satisfiable by giving them all the same one.
const biggest = Math.max(...kinds.map(k => W.filter(w => w.fx === k).length));
ok(biggest < W.length * 0.25, 'NO SINGLE LOOK DOMINATES: the commonest is under a quarter of all weapons, where it used to be 54%',
  biggest + ' of ' + W.length);

// =============================================================================
// 2. keyed by WEAPON, not by unit -- which is the actual fix
// =============================================================================
// The old table was per-unit, so a unit with two mounts drew the same shot from both. These four are
// exactly the units that fact was wrong for.
for (const id of ['goliath', 'wraith', 'scout', 'thor']) {
  const two = W.filter(w => w.id === id);
  ok(two.length === 2 && two[0].fx !== two[1].fx,
    id + ' fires a different shot from each of its two mounts', two.map(w => w.slot + '=' + w.fx).join(' '));
}

// =============================================================================
// 3. the races are disjoint in KIND, which is what makes a fight readable
// =============================================================================
const byRace = r => new Set(W.filter(w => w.race === r).map(w => w.fx));
const [T, Z, P] = ['T', 'Z', 'P'].map(byRace);
const shared = (a, b) => [...a].filter(k => b.has(k));
ok(shared(T, Z).length === 0, 'Terran and Zerg share no shot kind -- solid objects against organic matter', shared(T, Z).join(' '));
ok(shared(T, P).length === 0, 'Terran and Protoss share no shot kind -- solid objects against energy', shared(T, P).join(' '));
ok(shared(Z, P).length === 0, 'Zerg and Protoss share no shot kind', shared(Z, P).join(' '));
ok(T.size >= 4 && Z.size >= 3 && P.size >= 4, '...and each race has several of its own, not one apiece',
  'T' + T.size + ' Z' + Z.size + ' P' + P.size);

// =============================================================================
// 4. DATA refuses to load if a weapon is missed -- the guard, not the state
// =============================================================================
// The check above passes today. What stops it failing SILENTLY next time somebody adds a unit is the
// throw in js/data.js, so that is what is tested: break the table and DATA must refuse to build.
{
  const src = fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8');
  ok(/armed but no shot in SHOT/.test(src), 'js/data.js THROWS if an armed weapon has no shot, so a new unit cannot inherit one by accident');
  ok(/SHOT names a weapon that does not exist/.test(src), '...and throws on a SHOT entry naming a weapon that is not there, so the table cannot rot');
  // Prove the guard fires rather than trusting that it is written down.
  const broken = src.replace(/'marine:gw': \['[a-z]+', '#[0-9a-f]+'\],/, '');
  let threw = null;
  try {
    const c2 = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { } };
    c2.window = c2; vm.createContext(c2);
    vm.runInContext(broken, c2, { filename: 'data-broken' });
  } catch (e) { threw = String(e.message); }
  ok(threw !== null && /marine/.test(threw), 'NEGATIVE CONTROL: delete the marine from SHOT and DATA refuses to load, naming it', String(threw));
}

// =============================================================================
// 5. the two duration tables agree
// =============================================================================
// FX.drawEffect divides by a literal duration in lerpPos(e, T); Combat.SHOT_T decides the t an effect
// is created with. Nothing connects them, and a mismatch does not throw -- it just makes a shot arrive
// early or late, which is invisible in a test that only checks the kind.
{
  // REVIEW-M17: this scrape used to search the whole file, and js/fx.js has TWO switches with the same
  // case labels -- the impact effects come first and interpolate nothing -- so twelve of nineteen kinds
  // matched the wrong switch, found no lerpPos, and were silently skipped: the check was verified for
  // seven kinds and read as if for all. It is scoped to drawEffect now, reads `lerpPos(e, T)` through
  // the `const T = N` beside it, and counts what it found, so an anchor that matches nothing is a red.
  const fxSrc = fs.readFileSync(path.join(root, 'js', 'fx.js'), 'utf8');
  const draw = fxSrc.slice(fxSrc.indexOf('drawEffect('));
  const shotT = J('Combat.SHOT_T');
  const bad = [], found = [];
  for (const [kind, t] of Object.entries(shotT)) {
    const m = new RegExp("case '" + kind + "':([\\s\\S]{0,400}?)lerpPos\\(e, (\\d+|T)\\)").exec(draw);
    if (!m) continue;
    const n = m[2] === 'T' ? (/const T = (\d+)/.exec(m[1]) || [])[1] : m[2];
    found.push(kind);
    if (Number(n) !== t) bad.push(kind + ' SHOT_T=' + t + ' lerpPos=' + n);
  }
  ok(found.length >= 9, 'the scrape finds the kinds that interpolate their flight (negative control for the anchor: nine today)', found.length + ' found: ' + found.join(' '));
  ok(bad.length === 0, 'every kind that interpolates its flight uses the same duration Combat.SHOT_T gave it', bad.join(', '));
  ok(Object.keys(shotT).length >= 12, 'and SHOT_T covers the new kinds rather than leaving them on the 4-frame default', String(Object.keys(shotT).length));
}

// =============================================================================
// 6. every kind actually draws, and none is unreachable
// =============================================================================
// The M14 Hellion bug in one sentence: a second `case 'flame'` in the same switch is dead code, and
// the symptom is a weapon that looks like it does nothing.
{
  const fxSrc = fs.readFileSync(path.join(root, 'js', 'fx.js'), 'utf8');
  const block = fxSrc.slice(fxSrc.indexOf('  drawEffect(ctx, e) {'));
  const ks = [...block.matchAll(/case '([a-z_]+)'/g)].map(m => m[1]);
  const dup = [...new Set(ks.filter((k, i) => ks.indexOf(k) !== i))];
  ok(dup.length === 0, 'NO DUPLICATE CASE in drawEffect -- a second one is unreachable and reads as a broken weapon', dup.join(' '));
  const missing = kinds.filter(k => !ks.includes(k));
  ok(missing.length === 0, 'every shot kind a weapon can fire has a case in FX.drawEffect', missing.join(' '));
}

// ...and it has to survive being called. A case that throws takes the whole frame with it.
{
  const drew = J(`(() => {
    const calls = { fill: 0, stroke: 0 };
    // A kind may legitimately draw with NO ctx fill/stroke at all -- 'flame' is pure particle emission
    // and 'frag' is fillRect -- so "did it draw" counts those too. Counting only fill/stroke reported
    // two WORKING effects as silent, which is a false red on correct code and worse than no check.
    const stub = { save() { }, restore() { }, translate() { }, rotate() { }, beginPath() { }, moveTo() { }, lineTo() { }, closePath() { },
      arc() { }, ellipse() { }, fillRect() { calls.fill++; }, fill() { calls.fill++; }, stroke() { calls.stroke++; },
      createRadialGradient: () => ({ addColorStop() { } }), createLinearGradient: () => ({ addColorStop() { } }),
      set fillStyle(v) { }, set strokeStyle(v) { }, set lineWidth(v) { },
      set globalAlpha(v) { }, set lineCap(v) { }, set lineJoin(v) { }, set globalCompositeOperation(v) { }, set font(v) { }, set textAlign(v) { }, fillText() { calls.fill++; } };
    const kinds = ${JSON.stringify(kinds)};
    const out = {};
    for (const k of kinds) {
      FX.particles.length = 0;
      const before = calls.fill + calls.stroke;
      let threw = null;
      try { for (let t = 12; t > 0; t--) { FX.seen = new WeakSet(); FX.drawEffect(stub, { kind: k, x: 100, y: 100, tx: 220, ty: 140, t, color: '#8cf', r: 10 }); } }
      catch (e) { threw = String(e.message); }
      out[k] = threw ? 'THREW: ' + threw : (calls.fill + calls.stroke) - before + FX.particles.length;
    }
    return out;
  })()`);
  const threw = Object.entries(drew).filter(([, v]) => typeof v === 'string');
  ok(threw.length === 0, 'no shot kind throws when drawn', threw.map(e => e[0] + ' ' + e[1]).join(' | '));
  const silent = Object.entries(drew).filter(([, v]) => v === 0);
  ok(silent.length === 0, 'AND EVERY ONE PUTS SOMETHING ON SCREEN -- a kind that draws nothing is the bug this file exists for',
    silent.map(e => e[0]).join(' '));
}

// =============================================================================
// 7. a real shot, fired in a real game, carries the weapon's look
// =============================================================================
const live = J(`(() => {
  G.init({ players: [{ race: 'T', human: false, difficulty: 'hard', name: 'A', team: 1 },
                     { race: 'P', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: 4, layout: 'temple' });
  G.checkVictory = () => { };
  const shot = (aid, tid) => {
    const a = G.spawnUnit(aid, 0, 40 * TILE, 40 * TILE);
    const t = G.spawnUnit(tid, 1, 42 * TILE, 40 * TILE);
    a.cooldown = 0; G.rebuildGrid(); G.effects.length = 0;
    const w = a.def.gw && (!t.fly || a.def.gw.targets !== 'ground') ? a.def.gw : a.def.aw;
    if (!w) return null;
    Combat.fire(a, t, w);
    const e = G.effects[0] || null;
    G.kill(a, null, true); G.kill(t, null, true);
    return e && { kind: e.kind, color: e.color };
  };
  return { tank: shot('siege_tank', 'zealot'), goliathAir: shot('goliath', 'scout'),
    colossus: shot('colossus', 'marine'), roach: shot('roach', 'marine') };
})()`);
ok(live.tank && live.tank.kind === 'shell', 'a Siege Tank really fires a shell in a running game', JSON.stringify(live.tank));
ok(live.goliathAir && live.goliathAir.kind === 'rocket', 'a Goliath shooting AIR really fires a rocket, not its autocannon', JSON.stringify(live.goliathAir));
ok(live.colossus && live.colossus.kind === 'beam', 'a Colossus really fires a beam -- it used to fire the white bullet', JSON.stringify(live.colossus));
ok(live.roach && live.roach.kind === 'acid', 'a Roach really spits acid -- it used to fire the white bullet', JSON.stringify(live.roach));
ok(new Set([live.tank, live.goliathAir, live.colossus, live.roach].map(e => e && e.kind)).size === 4,
  'and those four are four different things, which is the whole point of the item');

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
