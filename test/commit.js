// Two M11 rules that are easy to regress and invisible when they do:
//   * cancelling a BUILDING refunds nothing, while cancelling a queued UNIT still refunds
//   * every weapon maps to one of the five audio voices, so nothing falls through to silence
//   node test/commit.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui'], ext: false });
const r = vm.runInContext(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3 });
  const p = G.players[0], out = {};
  p.minerals = 2000; p.gas = 2000;
  // a half-built building refunds nothing
  const b = G.spawnUnit('barracks', 0, p.startX + 200, p.startY + 200); b.done = false; b.progress = 10;
  const m0 = p.minerals, g0 = p.gas; G.cancelBuilding(b);
  out.buildingRefund = { min: p.minerals - m0, gas: p.gas - g0 };
  // a queued unit still does
  const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  G.applying = true; G.queueUnit(cc, 'scv'); G.applying = false;
  const m1 = p.minerals; G.cancelProd(cc, cc.prod.length - 1);
  out.unitRefund = p.minerals - m1;
  // a cancelled Zerg building still gives the drone back -- the drone IS the building
  G.init({ players: [{ race: 'Z', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 3 });
  const zp = G.players[0]; zp.minerals = 2000;
  const before = G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'drone').length;
  const sp2 = G.spawnUnit('spawning_pool', 0, zp.startX + 200, zp.startY + 200); sp2.done = false; sp2.progress = 10;
  G.cancelBuilding(sp2);
  out.droneBack = G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'drone').length - before;
  // every weapon in the game maps to a real voice
  const voices = Object.keys(Sound.WVOICE); const bad = [];
  for (const id of Object.keys(DATA.units)) { const d = DATA.units[id];
    for (const w of [d.gw, d.aw]) { if (!w) continue;
      const fake = { def: d, sieged: false, wRange: () => (w.range || 4) };
      const v = Sound.voiceOf(fake, w); if (!voices.includes(v)) bad.push(id + ':' + v); } }
  out.badVoices = bad; out.voiceCount = voices.length;
  return out;
})()`, ctx);
ok(r.buildingRefund.min === 0 && r.buildingRefund.gas === 0, 'cancelling a building refunds nothing', JSON.stringify(r.buildingRefund));
ok(r.unitRefund > 0, 'cancelling a queued unit still refunds -- a production queue is scheduling, not commitment', String(r.unitRefund));
ok(r.droneBack === 1, 'a cancelled Zerg building still returns its drone, because the drone is the building', String(r.droneBack));
ok(r.voiceCount === 5 && r.badVoices.length === 0, 'every weapon maps to one of the five audio voices', r.badVoices.slice(0, 6).join(' '));
summary();
