// FIXLIST-M14 C5 (item 20) -- the Hellion's line attack, and the three things wrong with it.
//
// Reported as "the hellion's shot should be a beam that hits all units in its path". THE MECHANIC WAS
// ALREADY THERE AND ALREADY CORRECT, which is why the item said to build a probe before editing
// anything. Measured, before any change: one Hellion, one shot, into a row of five marines one tile
// apart -- FIVE of five took 9 each. The player was seeing correct damage and an unrecognisable effect.
//
// Three real defects sat around it, all confirmed by the same probe:
//
//   1. THE LENGTH was a hardcoded 6 * TILE whatever the weapon said. The Hellion's range is 5, so it
//      reached a full tile past its own table: a lone target was hit at 5.5 and at 6.0 and missed at
//      6.5. It comes from wRange now -- the same number Unit.inRange uses to decide the shot was legal.
//   2. THE EFFECT was { kind: 'spines' } for both line weapons, written for the Lurker. A hover bike
//      drew subterranean spines. It comes off the weapon now.
//   3. FLYERS were skipped by the shared branch rather than by either weapon, so the answer was right
//      and the reason was not.
//
// THE LURKER IS THE CONTROL AND IT IS NOT AN ACCIDENT: its range is 6, exactly the number that was
// baked in, so taking the length from the weapon must leave it untouched. The item asked for that
// check by name and it is section 3.
//
//   node test/line.js
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

// A bare arena. G.rebuildGrid() matters and is the reason the first version of the probe reported
// ZERO damage for every weapon including the Lurker: G.near reads the spatial hash, G.tick is what
// rebuilds it, and a test that spawns units and fires without ticking finds nobody at all.
const ARENA = `
  G.init({ players: [{ race: 'T', human: false, name: 'A', team: 1 }, { race: 'T', human: false, name: 'B', team: 2 }], seed: 3, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (const u of [...G.units]) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive);
  G.checkVictory = () => { };
  const T = TILE, m = G.map, ly = Math.floor(m.h / 2), lx = Math.floor(m.w / 2) - 12;
  const ready = () => { G.updateVision(); G.rebuildGrid(); };
  const foe = (tx, ty) => { const u = G.spawnUnit('marine', 1, (lx + tx) * T, (ly + (ty || 0)) * T); u.hp = 9999; u.maxHp = 9999; return u; };
  const lost = u => Math.round((9999 - u.hp) * 10) / 10;
`;

// =============================================================================
// 1. THE MECHANIC: one shot, a row of five, five hit
// =============================================================================
const row = J(`(() => { ${ARENA}
  const me = G.spawnUnit('hellion', 0, lx * T, ly * T);
  const line = []; for (let i = 1; i <= 5; i++) line.push(foe(i));
  ready();
  Combat.fire(me, line[0], me.def.gw);
  return { lost: line.map(lost), hit: line.map(lost).filter(v => v > 0).length, dmg: me.wDmg(me.def.gw) };
})()`);
ok(row.hit === 5, 'ONE SHOT INTO A ROW OF FIVE HITS ALL FIVE -- the mechanic was always right', JSON.stringify(row));
ok(row.lost.every(v => v === row.dmg), 'and every one of them takes the full damage, not a falloff', JSON.stringify(row));

// It is the LINE that does it, not splash. Remove the flag and only the aimed target is touched.
{ const noFlag = J(`(() => { ${ARENA}
    const me = G.spawnUnit('hellion', 0, lx * T, ly * T);
    const line = []; for (let i = 1; i <= 5; i++) line.push(foe(i));
    ready();
    const w = Object.assign({}, me.def.gw); delete w.line;
    Combat.fire(me, line[0], w);
    return { hit: line.map(lost).filter(v => v > 0).length };
  })()`);
  ok(noFlag.hit === 1, 'NEGATIVE CONTROL, in-line: strip `line` from the weapon and only the aimed target is hit', JSON.stringify(noFlag)); }

// =============================================================================
// 2. THE LENGTH comes from the weapon, not from a literal
// =============================================================================
const reach = J(`(() => { ${ARENA}
  const me = G.spawnUnit('hellion', 0, lx * T, ly * T);
  const R = me.wRange(me.def.gw);
  const at = d => {
    for (const u of [...G.units]) if (u.owner === 1) G.kill(u, null, true);
    G.units = G.units.filter(u => u.alive);
    const far = foe(d), near = foe(0.7);
    ready();
    Combat.fire(me, near, me.def.gw);
    return lost(far) > 0;
  };
  const out = { range: R, hits: {} };
  for (const d of [R - 1, R - 0.5, R, R + 0.5, R + 1, R + 1.5]) out.hits[d] = at(d);
  return out;
})()`);
ok(reach.range === 5, 'the Hellion\'s range is 5', String(reach.range));
ok(reach.hits[reach.range] === true, 'the line reaches a target AT the weapon\'s range', JSON.stringify(reach.hits));
ok(reach.hits[reach.range + 0.5] === false && reach.hits[reach.range + 1] === false,
  'AND STOPS THERE -- it used to reach 6 tiles on a 5-tile weapon, which is the measured defect', JSON.stringify(reach.hits));
{ const src = fs.readFileSync(path.join(root, 'js', 'combat.js'), 'utf8');
  const br = src.slice(src.indexOf('if (w.line) {'), src.indexOf('this.visual(a, t, w);'));
  ok(/const len = a\.wRange\(w\) \* TILE;/.test(br), 'and the length is read off the weapon, not written as a number', br.slice(0, 80));
  ok(!/6 \* TILE/.test(br), 'the literal is gone'); }

// =============================================================================
// 3. THE LURKER IS UNCHANGED -- the check the item asked for by name
// =============================================================================
const lurk = J(`(() => { ${ARENA}
  const me = G.spawnUnit('lurker', 0, lx * T, ly * T); me.burrowed = true; me.digT = 0;
  const R = me.wRange(me.def.gw);
  const line = []; for (let i = 1; i <= 5; i++) line.push(foe(i));
  ready();
  G.effects.length = 0;
  Combat.fire(me, line[0], me.def.gw);
  const fxKind = G.effects.length ? G.effects[0].kind : null;
  const fxLen = G.effects.length ? Math.round(Math.hypot(G.effects[0].tx - G.effects[0].x, G.effects[0].ty - G.effects[0].y) / T * 10) / 10 : null;
  return { range: R, hit: line.map(lost).filter(v => v > 0).length, lost: line.map(lost), fxKind, fxLen };
})()`);
ok(lurk.range === 6, 'THE LURKER\'S RANGE IS 6 -- exactly the number that was baked in, which is why this is the control', String(lurk.range));
ok(lurk.hit === 5 && lurk.lost.every(v => v === 20), 'it still hits all five for 20', JSON.stringify(lurk));
ok(lurk.fxLen === 6, 'its line is still 6 tiles long -- taking the length from the weapon changed NOTHING for it', String(lurk.fxLen));
ok(lurk.fxKind === 'spines', 'and it still draws spines', String(lurk.fxKind));

// =============================================================================
// 4. THE EFFECT is per weapon, so a Hellion no longer draws a Lurker's spines
// =============================================================================
const fx = J(`(() => { ${ARENA}
  const shot = (id, burrow) => {
    for (const u of [...G.units]) G.kill(u, null, true);
    G.units = G.units.filter(u => u.alive);
    const me = G.spawnUnit(id, 0, lx * T, ly * T);
    if (burrow) { me.burrowed = true; me.digT = 0; }
    const t = foe(2); ready(); G.effects.length = 0;
    Combat.fire(me, t, me.def.gw);
    return G.effects.length ? G.effects[0].kind : null;
  };
  return { hellion: shot('hellion', false), lurker: shot('lurker', true), fxOnDef: DATA.units.hellion.gw.fx || null };
})()`);
ok(fx.hellion === 'flamejet', 'THE HELLION DRAWS A FLAME JET', String(fx.hellion));
ok(fx.lurker === 'spines', 'the Lurker still draws spines', String(fx.lurker));
ok(fx.hellion !== fx.lurker, 'and the two no longer share a look by accident -- which is what made a working weapon look broken');
ok(fx.fxOnDef === 'flamejet', 'the kind is on the weapon, so a third line weapon needs no edit to js/combat.js', String(fx.fxOnDef));
// The flame has to actually draw. FX.drawEffect is where a new kind silently does nothing.
{ const drew = J(`(() => {
    const rec = []; const g = { addColorStop() { } };
    const c = { globalCompositeOperation: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '',
      createLinearGradient() { rec.push('grad'); return g; }, createRadialGradient() { rec.push('rgrad'); return g; }, measureText: () => ({ width: 1 }) };
    for (const k of ['save','restore','beginPath','closePath','moveTo','lineTo','arc','rect','fill','stroke','fillRect','fillText','translate','rotate','scale','setLineDash','ellipse','quadraticCurveTo','bezierCurveTo','clip','drawImage']) c[k] = () => rec.push(k);
    let threw = null;
    try { for (let t = 12; t > 0; t--) FX.drawEffect(c, { kind: 'flamejet', x: 100, y: 100, tx: 260, ty: 100, t }); } catch (e) { threw = String(e); }
    return { threw, fills: rec.filter(v => v === 'fill').length, grads: rec.filter(v => v === 'grad').length };
  })()`);
  ok(drew.threw === null, 'the flame effect draws without throwing', String(drew.threw));
  ok(drew.fills >= 3 && drew.grads >= 3, 'and it draws something -- three gradient lobes per frame, not a no-op case', JSON.stringify(drew)); }

// =============================================================================
// 5. WHO IT HITS, stated by the weapon rather than by the branch
// =============================================================================
const who = J(`(() => { ${ARENA}
  const me = G.spawnUnit('hellion', 0, lx * T, ly * T);
  const friend = G.spawnUnit('marine', 0, (lx + 2) * T, ly * T); friend.hp = 9999; friend.maxHp = 9999;
  const enemy = foe(4);
  const flier = G.spawnUnit('wraith', 1, (lx + 3) * T, ly * T); flier.hp = 9999; flier.maxHp = 9999;
  const offLine = foe(3, 3);
  ready();
  Combat.fire(me, enemy, me.def.gw);
  return { friend: Math.round((9999 - friend.hp) * 10) / 10, enemy: lost(enemy),
    flier: Math.round((9999 - flier.hp) * 10) / 10, offLine: lost(offLine), targets: DATA.units.hellion.gw.targets };
})()`);
ok(who.enemy > 0, 'an enemy standing in the line is hit', String(who.enemy));
ok(who.friend === 0, 'AN ALLY IS NOT -- friendly fire is off, deliberately: a flame that cooked your own marines would make the Hellion unusable in the ball it escorts', String(who.friend));
ok(who.flier === 0, 'and a flyer is not, because the weapon says targets: ' + who.targets, String(who.flier));
ok(who.offLine === 0, 'nor is something standing beside the line rather than in it', String(who.offLine));
{ const src = fs.readFileSync(path.join(root, 'js', 'combat.js'), 'utf8');
  const br = src.slice(src.indexOf('if (w.line) {'), src.indexOf('this.visual(a, t, w);'));
  ok(/w\.targets/.test(br), 'and the flyer rule is read off the weapon, not hardcoded as `o.fly` in the branch'); }

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
