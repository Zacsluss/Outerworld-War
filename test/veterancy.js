// Veterancy and scarring (M11 idea 2). Both are derived rather than stored -- rank comes from `kills`,
// and the scar is the gap between def.hp and maxHp -- so the thing most worth asserting is that they
// survive a snapshot without any code having been written to carry them.
//   node test/veterancy.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, addEventListener() { }, setTimeout,
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };
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
ok(r.snapshot.afterVet === r.snapshot.beforeVet && r.snapshot.afterMax === r.snapshot.beforeMax,
  'rank and scar both survive a snapshot round trip', JSON.stringify(r.snapshot));
console.log(fail ? `FAIL  ${pass} passed, ${fail} failed` : `ALL PASS  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
