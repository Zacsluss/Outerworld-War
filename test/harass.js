// A COMPUTER'S WORKERS ANSWER A WORKER ATTACKING ITS BASE (tenth session, item 8; the user: "if i send a probe/drone/scv to an
// enemy base and start attacking it, the AI enemy should know to swarm the probe/drone/scv with their probes/drones/scvs to
// repel/destroy the attacking probe/drone/scv"). Measured before: one enemy worker attacking a computer's mineral line at one
// minute lived through 45 seconds in 9 match-ups of 9 and killed 18 workers between them, and no computer worker ever struck
// back (.claude/review/tenth/harass-probe.js).
//   node test/harass.js
//
//   1. every race of computer against every race of harassing worker: it dies within fifteen seconds, the computer loses no
//      worker, and no more than three are pulled onto it at once
//  1b. three attacking together (the research's pitfall: defenders answering one at a time lose to a group) meet more
//      than three workers and all die
//   2. the pulled workers go back to mining once it is dead
//   3. a worker that only walks through is left alone
//   4. one that hits and runs is not chased out of the base
//   5. an enemy soldier is the army's business: no workers are pulled for a Marine
//   6. a human player's workers are not moved for them
//   7. a snapshot taken mid-defence -- what a rejoining player is sent -- runs on identically: aiDefend rides it
'use strict';
const vm = require('vm'), { makeCtx, ok, counts } = require('./_harness');
const J = v => JSON.stringify(v);
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot'], setInterval: true });
const R = src => vm.runInContext('(() => {' + src + '})()', ctx);
R(`this.scene = (aiRace, harRace, seed, humanDefender) => {
  G.init({ players: [{ race: harRace, human: true, name: 'Harasser' }, { race: aiRace, human: !!humanDefender, difficulty: 'normal', name: 'Defender' }], seed: seed || 3, layout: 'temple' });
  G.players[0].ai = null; if (humanDefender) G.players[1].ai = null;
  for (let f = 0; f < 1440; f++) G.tick();
  const hall = G.units.find(u => u.alive && u.owner === 1 && u.def.depot);
  const ms = G.map.resources.filter(r => r.type === 'mineral' && Math.hypot(r.cx - hall.x, r.cy - hall.y) < 10 * TILE);
  const mx = ms.reduce((s, r) => s + r.cx, 0) / ms.length, my = ms.reduce((s, r) => s + r.cy, 0) / ms.length;
  return { hall, line: { x: (mx + hall.x) / 2, y: (my + hall.y) / 2 } };
};
this.order = (u, o) => { G.applying = true; try { u.setOrder(o, false); } finally { G.applying = false; } };
this.nearestWorker = (owner, x, y) => G.units.filter(u => u.alive && u.owner === owner && u.def.worker).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || a.id - b.id)[0];
this.onHim = h => G.units.filter(u => u.alive && u.owner === 1 && u.def.worker && u.order.type === 'attack' && u.order.target === h);`);

console.log('--- 1. every race against every race ---');
{
  const r = R(`const out = [];
    for (const ai of ['T', 'Z', 'P']) for (const har of ['T', 'Z', 'P']) {
      const s = scene(ai, har); const h = G.spawnUnit(RACE_INFO[har].worker, 0, s.line.x, s.line.y);
      const mine0 = G.units.filter(u => u.alive && u.owner === 1 && u.def.worker); let most = 0, died = null;
      for (let f = 0; f < 24 * 15; f++) {
        if (h.alive && h.order.type !== 'attack') { const v = nearestWorker(1, h.x, h.y); if (v) order(h, { type: 'attack', target: v }); }
        G.tick(); most = Math.max(most, onHim(h).length); if (!h.alive && died === null) { died = G.frame; break; }
      }
      out.push({ m: ai + 'v' + har, died: died !== null, lost: mine0.filter(u => !u.alive).length, most });
    }
    return out;`);
  ok(r.every(x => x.died), 'a harassing SCV, Drone or Probe dies inside fifteen seconds in all nine match-ups (it lived through 45 in all nine)', J(r));
  ok(r.every(x => x.lost === 0), '...and no computer loses a worker to it (they lost 18 between them)', J(r.map(x => x.m + ':' + x.lost)));
  ok(r.every(x => x.most >= 2 && x.most <= 3), '...with two or three workers on it at once, never more than three', J(r.map(x => x.m + ':' + x.most)));
}

console.log('--- 1b. three at once ---');
{
  // Measured with the pull per harasser (.claude/review/tenth/harass-group-probe.js): all three died in every match-up, in
  // 8.3 to 18.7 seconds, with 3 to 7 workers on them and 1 to 3 of the computer's 5 to 7 lost.
  const r = R(`const out = [];
    for (const ai of ['T', 'Z', 'P']) for (const har of ['T', 'Z', 'P']) {
      const s = scene(ai, har); const hs = [-12, 0, 12].map(dx => G.spawnUnit(RACE_INFO[har].worker, 0, s.line.x + dx, s.line.y));
      const mine0 = G.units.filter(u => u.alive && u.owner === 1 && u.def.worker); let most = 0;
      for (let f = 0; f < 24 * 25 && hs.some(h => h.alive); f++) {
        for (const h of hs) if (h.alive && h.order.type !== 'attack') { const v = nearestWorker(1, h.x, h.y); if (v) order(h, { type: 'attack', target: v }); }
        G.tick(); most = Math.max(most, G.units.filter(u => u.alive && u.owner === 1 && u.aiDefend).length);
      }
      out.push({ m: ai + 'v' + har, dead: hs.filter(h => !h.alive).length, lost: mine0.filter(u => !u.alive).length, of: mine0.length, most });
    }
    return out;`);
  ok(r.every(x => x.dead === 3 && x.lost * 2 < x.of), 'three workers attacking together all die inside 25 seconds in all nine match-ups, and the computer keeps most of its workers', J(r));
  ok(r.filter(x => x.most > 3).length >= 6, '...because more than three workers answer three harassers (in six match-ups of nine at least)', J(r.map(x => x.m + ':' + x.most)));
}

console.log('--- 2. back to mining ---');
{
  const r = R(`const s = scene('P', 'T'); const h = G.spawnUnit('scv', 0, s.line.x, s.line.y); const pulled = new Set();
    for (let f = 0; f < 24 * 15 && h.alive; f++) { if (h.order.type !== 'attack') { const v = nearestWorker(1, h.x, h.y); if (v) order(h, { type: 'attack', target: v }); } G.tick(); for (const u of onHim(h)) pulled.add(u); }
    for (let f = 0; f < 24 * 5; f++) G.tick();
    const ps = [...pulled].filter(u => u.alive);
    return { dead: !h.alive, pulled: ps.length, orders: ps.map(u => u.order.type), marked: ps.filter(u => u.aiDefend).length };`);
  ok(r.dead && r.pulled >= 2 && r.orders.every(o => o === 'gather' || o === 'return' || o === 'build') && r.marked === 0, 'five seconds after it dies, every worker pulled onto it is back at work and no longer marked', J(r));
}

console.log('--- 3. a worker that only looks ---');
{
  const r = R(`const s = scene('T', 'P'); const h = G.spawnUnit('probe', 0, s.line.x, s.line.y); let most = 0;
    for (let f = 0; f < 24 * 20; f++) { if (f % 48 === 0) order(h, { type: 'move', x: s.line.x + (f % 96 ? 40 : -40), y: s.line.y }); G.tick(); most = Math.max(most, G.units.filter(u => u.alive && u.owner === 1 && u.def.worker && u.order.type === 'attack').length); }
    return { alive: h.alive, most };`);
  ok(r.alive && r.most === 0, 'a Probe walking through the mineral line without attacking is left alone for twenty seconds', J(r));
}

console.log('--- 4. hit and run ---');
{
  // A Protoss defender, so no worker walks off to become a building and read as "far from home" for its own reasons.
  const r = R(`const s = scene('P', 'T'); const h = G.spawnUnit('scv', 0, s.line.x, s.line.y);
    let hitF = null; for (let f = 0; f < 24 * 10 && hitF === null; f++) { if (h.order.type !== 'attack') { const v = nearestWorker(1, h.x, h.y); if (v) order(h, { type: 'attack', target: v }); } G.tick(); if (G.units.some(u => u.owner === 1 && u.lastHitBy === h && G.frame - u.lastHit < 2)) hitF = G.frame; }
    for (let f = 0; f < 40; f++) G.tick();   // two thinks for the computer to see it and pull
    const pulled = G.units.filter(u => u.alive && u.owner === 1 && u.aiDefend === h);
    const away = { x: s.hall.x + (s.hall.x < G.map.w * TILE / 2 ? 30 : -30) * TILE, y: s.hall.y + (s.hall.y < G.map.h * TILE / 2 ? 30 : -30) * TILE };
    order(h, { type: 'move', x: away.x, y: away.y });
    for (let f = 0; f < 24 * 20; f++) G.tick();
    const far = pulled.filter(u => u.alive && Math.hypot(u.x - s.hall.x, u.y - s.hall.y) > 18 * TILE);
    return { hit: hitF !== null, pulled: pulled.length, harasserAlive: h.alive, stillMarked: G.units.filter(u => u.alive && u.owner === 1 && u.aiDefend).length, far: far.length, orders: pulled.filter(u => u.alive).map(u => u.order.type), harasserFar: Math.round(Math.hypot(h.x - s.hall.x, h.y - s.hall.y) / TILE) };`);
  ok(r.hit && r.pulled >= 1, 'setup: the SCV hits a Probe, and the computer pulls workers onto it', J(r));
  ok(!r.harasserAlive || (r.stillMarked === 0 && r.far === 0 && r.orders.every(o => o !== 'attack')), 'when it runs, it is chased only to the edge of the base: twenty seconds later no worker is marked, none is far from home, none still attacking', J(r));
}

console.log('--- 5. a soldier ---');
{
  const r = R(`const s = scene('P', 'T'); const h = G.spawnUnit('marine', 0, s.line.x, s.line.y); let most = 0;
    for (let f = 0; f < 24 * 10; f++) { if (h.alive && h.order.type !== 'attack') { const v = nearestWorker(1, h.x, h.y); if (v) order(h, { type: 'attack', target: v }); } G.tick(); most = Math.max(most, G.units.filter(u => u.alive && u.owner === 1 && u.aiDefend).length); }
    return { most };`);
  ok(r.most === 0, 'a Marine attacking the mineral line pulls no workers: soldiers are the army\'s business', J(r));
}

console.log('--- 6. a human player ---');
{
  const r = R(`const s = scene('T', 'P', 3, true); const h = G.spawnUnit('probe', 0, s.line.x, s.line.y); let most = 0;
    for (let f = 0; f < 24 * 10; f++) { if (h.alive && h.order.type !== 'attack') { const v = nearestWorker(1, h.x, h.y); if (v) order(h, { type: 'attack', target: v }); } G.tick(); most = Math.max(most, G.units.filter(u => u.alive && u.owner === 1 && u.def.worker && u.order.type === 'attack').length); }
    return { most, ai: !!G.players[1].ai };`);
  ok(r.ai === false && r.most === 0, 'a human player\'s workers are never moved for them', J(r));
}

console.log('--- 7. a rejoin mid-defence ---');
{
  // Snapshot.restore makes new unit objects, so the harasser is found by its id on both runs.
  const r = R(`const s = scene('Z', 'T'); const hid = G.spawnUnit('scv', 0, s.line.x, s.line.y).id;
    const step = () => { const h = G.byId.get(hid); if (h && h.alive && h.order.type !== 'attack') { const v = nearestWorker(1, h.x, h.y); if (v) order(h, { type: 'attack', target: v }); } G.tick(); };
    let n = 0; while (G.units.filter(u => u.alive && u.owner === 1 && u.aiDefend).length < 2 && n++ < 24 * 10) step();
    const marked = G.units.filter(u => u.alive && u.owner === 1 && u.aiDefend).length;
    const wire = JSON.stringify(Snapshot.take()); const ref = [];
    for (let f = 1; f <= 240; f++) { step(); if (f % 24 === 0) ref.push(G.stateHash()); }
    Snapshot.restore(JSON.parse(wire)); const again = [];
    for (let f = 1; f <= 240; f++) { step(); if (f % 24 === 0) again.push(G.stateHash()); }
    return { marked, same: JSON.stringify(ref) === JSON.stringify(again), firstDiff: ref.findIndex((x, i) => x !== again[i]) };`);
  ok(r.marked >= 2 && r.same, 'a snapshot taken while workers are on a harasser (what a rejoining player is sent) runs on identically for ten seconds', J(r));
}

const { pass, fail } = counts();
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
