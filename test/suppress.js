// Suppressing fire (M11 idea 7). One research per building that trains ranged units; everything that
// building makes then pins what it shoots. The point of the test is that the wiring is data-driven --
// Unit.suppresses reads { suppress: true } off the tech table rather than a list of unit ids -- so the
// checks are about the rule, not about which units happen to have it today.
//   node test/suppress.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, addEventListener() { }, setTimeout,
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };
const r = vm.runInContext(`(() => {
  const out = {};
  // every suppression tech hangs off a building that actually trains ranged units
  out.techs = Object.keys(DATA.techs).filter(id => DATA.techs[id].suppress);
  out.hosts = out.techs.map(id => { const b = DATA.buildings[DATA.techs[id].bld]; const t = DATA.techs[id];
    return { tech: id, bld: t.bld, listed: (b.tech || []).includes(id),
             ranged: t.suppress.every(u => { const d = DATA.units[u]; return d && (d.gw || d.aw); }),
             real: t.suppress.every(u => !!DATA.units[u]) }; });
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 2 });
  const p = G.players[0];
  const m = G.spawnUnit('marine', 0, 900, 900);
  out.beforeTech = m.suppresses;
  p.tech.add('suppress_inf');
  out.afterTech = m.suppresses;
  const scv = G.units.find(u => u.alive && u.owner === 0 && u.def.worker);
  out.workerNever = scv.suppresses;                       // no weapon in the def, so no suppression
  // hitting something pins it, and the pin decays
  const t = G.spawnUnit('zergling', 1, 960, 900);
  const base = t.speed;
  G.damage(t, 5, 'normal', m);
  out.pinnedSpeed = +(t.speed / base).toFixed(2); out.pinFrames = t.fx.suppress;
  for (let i = 0; i < 30; i++) t.tick();
  out.afterDecay = +(t.speed / base).toFixed(2);
  // a building cannot be pinned
  const b2 = G.units.find(u => u.alive && u.owner === 1 && u.isBuilding) || G.units.find(u => u.alive && u.isBuilding);
  G.damage(b2, 5, 'normal', m); out.buildingPinned = (b2.fx.suppress || 0) > 0;
  // and an attacker without the tech does not pin
  const p2 = G.players[1]; const ling = G.spawnUnit('zergling', 1, 1200, 1200);
  const t2 = G.spawnUnit('marine', 0, 1260, 1200);
  G.damage(t2, 5, 'normal', ling); out.untechedPin = (t2.fx.suppress || 0) > 0;
  return out;
})()`, ctx);
ok(r.techs.length === 6, 'six suppression researches exist, one per ranged production line', r.techs.join(' '));
ok(r.hosts.every(h => h.listed), 'each is listed on the building that hosts it', JSON.stringify(r.hosts.filter(h => !h.listed)));
ok(r.hosts.every(h => h.ranged), 'every unit a suppression tech names actually has a weapon', JSON.stringify(r.hosts.filter(h => !h.ranged)));
ok(r.hosts.every(h => h.real), 'every unit a suppression tech names is a real unit', JSON.stringify(r.hosts.filter(h => !h.real)));
ok(r.beforeTech === false && r.afterTech === true, 'a marine suppresses only once the barracks research is done', r.beforeTech + ' -> ' + r.afterTech);
ok(r.workerNever === false, 'a worker never suppresses, having no weapon in its def');
ok(r.pinnedSpeed < 0.5 && r.pinFrames === 24, 'a hit pins the target for a second', r.pinnedSpeed + ' x speed, ' + r.pinFrames + ' frames');
ok(r.afterDecay === 1, 'and the pin wears off when the fire stops', String(r.afterDecay));
ok(r.buildingPinned === false, 'buildings cannot be pinned');
ok(r.untechedPin === false, 'an attacker without the research does not pin');
console.log(fail ? `FAIL  ${pass} passed, ${fail} failed` : `ALL PASS  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
