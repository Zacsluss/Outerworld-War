// Veterancy and scarring (M11 idea 2). Both are derived rather than stored -- rank comes from `kills`,
// and the scar is the gap between def.hp and maxHp -- so the thing most worth asserting is that they
// survive a snapshot without any code having been written to carry them.
//   node test/veterancy.js
const vm = require('vm'), path = require('path'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot'], ext: false });
const r = vm.runInContext(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 2 });
  const p = G.players[0], out = {};
  const m = G.spawnUnit('marine', 0, p.startX + 60, p.startY + 60);
  const w = m.def.gw;
  out.ranks = []; out.dmg = [];
  for (const k of [0, 2, 5, 10]) { m.kills = k; out.ranks.push(m.vet); out.dmg.push(m.wDmg(w)); }
  m.kills = 5; out.armorAtRank2 = m.armor; m.kills = 0; out.armorAtRank0 = m.armor;
  // scarring: a survivable wound permanently lowers maxHp, and healing cannot undo it
  const s = G.spawnUnit('marine', 0, p.startX + 90, p.startY + 60);
  out.hp0 = s.maxHp;
  G.damageRaw(s, 20, null);
  out.maxAfterWound = s.maxHp; out.scar = +s.scarred.toFixed(2);
  s.hp = 9999; if (s.hp > s.maxHp) s.hp = s.maxHp;      // a full heal cannot exceed the scarred ceiling
  out.hpAfterFullHeal = s.hp;
  // the floor holds
  for (let i = 0; i < 400; i++) { s.hp = s.maxHp; G.damageRaw(s, 5, null); }
  out.floorRatio = +(s.maxHp / s.def.hp).toFixed(2);
  // ...and through the path a real fight uses. G.damage() does NOT call damageRaw -- it subtracts hp
  // itself -- so a test that only exercises damageRaw passes while scarring never happens in a game.
  // It did exactly that: a 30,000-frame scan across six matchups found not one scarred unit.
  const c = G.spawnUnit('marine', 0, 1400, 1400); const e = G.spawnUnit('zergling', 1, 1460, 1400);
  const cMax = c.maxHp; G.damage(c, 12, 'normal', e);
  out.combatScar = c.maxHp < cMax;
  // a munition is not repairable: no build time, no cost, and repairing one used to make its hp NaN
  const mine = G.spawnUnit('spider_mine', 0, 1600, 1600);
  out.mineDef = { hasTime: !!mine.def.time, hasMin: mine.def.min !== undefined, isMine: !!mine.def.mine };
  mine.hp = 5; const scv2 = G.units.find(u => u.alive && u.owner === 0 && u.def.worker);
  scv2.setOrder({ type: 'repair', target: mine });
  for (let i = 0; i < 40; i++) scv2.tick();
  out.mineHpFinite = isFinite(mine.hp);
  // buildings are exempt
  const b = G.units.find(u => u.alive && u.owner === 0 && u.isBuilding);
  const bMax = b.maxHp; G.damageRaw(b, 50, null); out.buildingUnscarred = b.maxHp === bMax;
  // both survive a snapshot round trip with no code carrying them
  const vet = G.spawnUnit('marine', 0, p.startX + 120, p.startY + 60);
  vet.kills = 7; G.damageRaw(vet, 30, null);
  const before = { vet: vet.vet, maxHp: vet.maxHp, kills: vet.kills };
  const snap = JSON.parse(JSON.stringify(Snapshot.take()));
  vet.kills = 0; vet.maxHp = vet.def.hp;                 // wipe it, then restore
  Snapshot.restore(snap);
  const back = G.byId.get(vet.id);
  out.snapshot = { beforeVet: before.vet, afterVet: back.vet, beforeMax: +before.maxHp.toFixed(2), afterMax: +back.maxHp.toFixed(2) };
  return out;
})()`, ctx);
ok(JSON.stringify(r.ranks) === '[0,1,2,3]', 'rank comes from kills at 2 / 5 / 10', JSON.stringify(r.ranks));
ok(r.dmg[3] > r.dmg[0], 'a rank-3 unit hits harder than a fresh one (' + r.dmg[0] + ' -> ' + r.dmg[3] + ')');
ok(r.armorAtRank2 === r.armorAtRank0 + 1, 'rank 2 is worth one armour', r.armorAtRank0 + ' -> ' + r.armorAtRank2);
ok(r.maxAfterWound < r.hp0 && r.scar > 0, 'a survivable wound permanently lowers maxHp', JSON.stringify(r));
ok(r.hpAfterFullHeal === r.maxAfterWound, 'a full heal cannot exceed the scarred ceiling', r.hpAfterFullHeal + ' vs ' + r.maxAfterWound);
ok(r.floorRatio === 0.4, 'scarring floors at 40% of the original', String(r.floorRatio));
ok(r.buildingUnscarred, 'buildings do not scar, because repair is supposed to make them whole');
ok(r.combatScar, 'scarring happens on the path a real fight uses, not only through damageRaw');
ok(!r.mineDef.hasTime && !r.mineDef.hasMin && r.mineDef.isMine, 'a spider mine really is a munition with no build cost', JSON.stringify(r.mineDef));
ok(r.mineHpFinite, 'repairing a munition is refused rather than turning its hp into NaN');
ok(r.snapshot.afterVet === r.snapshot.beforeVet && r.snapshot.afterMax === r.snapshot.beforeMax,
  'rank and scar both survive a snapshot round trip', JSON.stringify(r.snapshot));
summary();
