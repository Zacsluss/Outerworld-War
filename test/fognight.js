// Fog that lies (M11 wave one, idea 5) and the day/night cycle (idea 19's second half).
//
// Both are simulation-side here; the render halves read G.daylight and player.seen. The interesting
// property of the fog memory is its ASYMMETRY: it is corrected by sight and by nothing else, so a
// building destroyed while you were not watching stays on your map. That is the feature, not a leak.
//   node test/fognight.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot'], ext: false });
const SRC = `(() => {
  const out = {};
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'temple' });
  out.plainMapAlwaysDay = [0, 5000, 8640, 20000].map(f => { G.frame = f; return G.daylight; });
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'nightfall' });
  const curve = []; for (let f = 0; f <= 17280; f += 17280 / 8) { G.frame = Math.round(f); curve.push(+G.daylight.toFixed(3)); }
  out.curve = curve; out.dayAtStart = curve[0] > 0.95; out.darkAtMid = curve[4] < 0.1;
  G.frame = 0;
  const m = G.spawnUnit('marine', 0, G.players[0].startX + 90, G.players[0].startY + 90);
  const det = G.spawnUnit('science_vessel', 0, G.players[0].startX + 130, G.players[0].startY + 90);
  const daySight = m.sight, dayDet = det.sight;
  G.frame = 8640; out.night = { unit: m.sight, was: daySight, det: det.sight, detWas: dayDet };
  G.frame = 0;
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'temple' });
  const p0 = G.players[0];
  const foe = G.spawnUnit('spawning_pool', 1, p0.startX + 300, p0.startY + 300); foe.done = true;
  const scout = G.spawnUnit('scv', 0, foe.x + 60, foe.y);
  G.updateVision();
  out.rememberedWhileSeen = p0.seen.has(foe.id);
  scout.x = p0.startX; scout.y = p0.startY; G.updateVision(); G.updateVision();
  out.stillRememberedUnseen = p0.seen.has(foe.id);
  out.memoryContents = p0.seen.get(foe.id) ? p0.seen.get(foe.id).d : null;
  G.kill(foe, null, true); G.updateVision(); G.updateVision();
  out.liesAfterDeath = p0.seen.has(foe.id);
  const looker = G.spawnUnit('scv', 0, p0.startX + 300, p0.startY + 300);
  G.updateVision(); G.updateVision();
  out.correctedBySight = !p0.seen.has(foe.id);
  out.ownNotRemembered = ![...p0.seen.values()].some(v => v.o === 0);
  const foe2 = G.spawnUnit('hatchery', 1, looker.x + 40, looker.y); foe2.done = true;
  G.updateVision();
  const had = p0.seen.size;
  const snap = JSON.parse(JSON.stringify(Snapshot.take()));
  p0.seen.clear();
  Snapshot.restore(snap);
  out.survivesSnapshot = { before: had, after: G.players[0].seen.size };
  return out;
})()`;
const r = vm.runInContext(SRC, ctx);
ok(r.plainMapAlwaysDay.every(v => v === 1), 'a map without dayNight is always full day', JSON.stringify(r.plainMapAlwaysDay));
ok(r.dayAtStart && r.darkAtMid, 'a night map starts in daylight and gets properly dark', JSON.stringify(r.curve));
ok(r.night.unit < r.night.was && r.night.unit >= 2, "night shortens a unit's sight, with a floor", JSON.stringify(r.night));
// A detector pays HALF the night penalty, not none. It was exempt outright until a night playtest
// showed the consequence: the detector was the only thing on the map that could see, which reads as a
// broken renderer rather than as weather. Half keeps it the best eye in the dark without making it the
// only one, and the ratio is what this pins -- a future retune of NIGHT_SIGHT should not silently
// re-exempt them.
ok(r.night.det < r.night.detWas, 'a detector is dimmed by the dark too', JSON.stringify(r.night));
ok(r.night.det / r.night.detWas > r.night.unit / r.night.was, 'but a detector keeps more of its sight than an eye does', JSON.stringify(r.night));
ok(r.rememberedWhileSeen, 'an enemy building is remembered while it is visible');
ok(r.stillRememberedUnseen && r.memoryContents === 'spawning_pool', 'and stays remembered once you look away', r.memoryContents);
ok(r.liesAfterDeath, 'a building destroyed while you were not watching stays on your map -- the lie');
ok(r.correctedBySight, '...and only going back and looking corrects it');
ok(r.ownNotRemembered, 'your own buildings are not in the memory');
ok(r.survivesSnapshot.after === r.survivesSnapshot.before && r.survivesSnapshot.before > 0, 'the memory survives a snapshot', JSON.stringify(r.survivesSnapshot));
summary();
