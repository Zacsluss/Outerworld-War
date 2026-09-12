// Directional armour (M11 idea 6). A hit from behind hurts more than one you are facing, so where a
// unit points is part of what it is worth. The things worth pinning down are the boundaries -- which
// arc is which -- and the exemptions, because a rule that applies to explosions and spells as well
// would make flanking meaningless noise rather than a decision.
//   node test/facing.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'], ext: false });
const r = vm.runInContext(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 2 });
  const p = G.players[0], out = {};
  // one defender, one attacker placed at a chosen angle, measured by how much health the hit removed
  const hit = (ang, opts) => {
    const t = G.spawnUnit('marine', 0, 900, 900); t.facing = 0;            // facing +x
    const a = G.spawnUnit('marine', 1, 900 + Math.cos(ang) * 60, 900 + Math.sin(ang) * 60);
    const before = t.hp; G.damage(t, 20, 'normal', a, opts || {});
    const lost = before - t.hp; G.kill(t, null, true); G.kill(a, null, true); return +lost.toFixed(3);
  };
  out.front = hit(0);                    // attacker dead ahead
  out.flankL = hit(Math.PI * 0.62);      // just past the front arc
  out.rear = hit(Math.PI);               // directly behind
  // The arc boundaries are checked against hitFacing directly rather than through spawned units:
  // spawnUnit nudges a unit onto a free tile, which shifts the angle by a degree or two and makes an
  // assertion about a boundary meaningless. The damage numbers above already cover the integration.
  const face = deg => { const t = { x: 0, y: 0, facing: 0, def: {}, isBuilding: false }; const a = deg * Math.PI / 180;
    return hitFacing(t, { x: Math.cos(a) * 100, y: Math.sin(a) * 100 }); };
  out.arcs = { d0: face(0), d89: face(89), d91: face(91), d134: face(134), d136: face(136), d180: face(180) };

  out.splash = { front: hit(0, { splash: true }), rear: hit(Math.PI, { splash: true }) };
  // a building has no facing to flank
  const b = G.units.find(u => u.alive && u.owner === 0 && u.isBuilding);
  const bHit = ang => { const a = G.spawnUnit('marine', 1, b.x + Math.cos(ang) * 90, b.y + Math.sin(ang) * 90);
    const before = b.hp; G.damage(b, 20, 'normal', a); const lost = before - b.hp; b.hp = before; G.kill(a, null, true); return +lost.toFixed(3); };
  out.building = { front: bHit(0), rear: bHit(Math.PI) };
  // and no source means no direction
  const t2 = G.spawnUnit('marine', 0, 1200, 1200); const h0 = t2.hp; G.damage(t2, 20, 'normal', null); out.noSrc = +(h0 - t2.hp).toFixed(3);
  return out;
})()`, ctx);
ok(r.rear > r.flankL && r.flankL > r.front, 'rear hurts more than flank, flank more than front  (' + r.front + ' / ' + r.flankL + ' / ' + r.rear + ')');
ok(r.arcs.d0 === 'front' && r.arcs.d89 === 'front', 'the front arc runs to 90 degrees off the nose', JSON.stringify(r.arcs));
ok(r.arcs.d91 === 'flank' && r.arcs.d134 === 'flank', 'past 90 and up to 135 is a flank', JSON.stringify(r.arcs));
ok(r.arcs.d136 === 'rear' && r.arcs.d180 === 'rear', 'past 135 is a rear hit', JSON.stringify(r.arcs));
ok(r.splash.front === r.splash.rear, 'an explosion has no direction', JSON.stringify(r.splash));
ok(r.building.front === r.building.rear, 'a building cannot be flanked', JSON.stringify(r.building));
ok(r.noSrc === r.front, 'damage with no source is treated as a front hit', r.noSrc + ' vs ' + r.front);
summary();
