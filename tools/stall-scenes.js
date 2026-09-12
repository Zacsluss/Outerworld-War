// TODO-M18 item 4, the directed half. The passive sweep (stall-probe.js) watches an AI game and reports
// what stalls; this one DRIVES each candidate cause on a building that is mid-research and asks the only
// question that matters: does the research come back, and can it ever be started again?
//
//   node tools/stall-scenes.js
//
// The candidates TODO-M18 lists, none confirmed: a lifted building, a morphed one (Lair/Hive, Greater
// Spire), one that changed owner, a cancelled-and-requeued slot. Each is a scene. Two more came from
// reading the code: a building KILLED mid-research, and one that changes owner -- both touch
// `p.researching`, the per-PLAYER reservation set that G.queueTech and G.queueUpgrade refuse on and
// that only G.finishProduction and G.cancelProd ever clear.
//
// EVERY SCENE ASSERTS ITS OWN SETUP. The first version of this file had four scenes that silently did
// nothing -- an Academy cannot lift, a Forge does not research infW, a Factory will not take siege_tech
// without a finished Machine Shop -- and each reported "ok" for a case it had never created. A probe
// that does not do what it says is worse than no probe, so `setup` is part of every verdict.
'use strict';
const path = require('path'), vm = require('vm');
const { makeCtx } = require(path.join(__dirname, '..', 'test', '_harness'));
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'] });

const SCENES = `(() => {
  const out = [];
  const start = race => {
    G.init({ players: [{ race, human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 5, layout: 'temple' });
    for (const pl of G.players) if (!pl.neutral) pl.ai = null;
    const p = G.players[0]; p.minerals = 100000; p.gas = 100000; p.supMax = 200;
    return p;
  };
  const hallOf = () => G.units.find(u => u.owner === 0 && u.def.depot);
  const put = (id, tx, ty) => { const b = G.placeBuilding(DATA.buildings[id], tx, ty, 0); if (b) G.completeBuilding(b); return b; };
  const run = n => { for (let f = 0; f < n; f++) G.tick(); };
  const prog = b => (b && b.alive && b.prod && b.prod.length) ? Math.round(b.prod[0].progress) : -1;
  const has = (p, id) => DATA.techs[id] ? p.tech.has(id) : p.upgLevel(id) > 0;
  const timeOf = id => DATA.techs[id] ? DATA.techs[id].time : DATA.upgrades[id].time[0];
  const push = o => { out.push(o); return o; };
  // ---- 1. an ENGINEERING BAY asked to LIFT while it is upgrading ---------------------------------
  // The Engineering Bay is the one building that both lifts and researches, which is what makes the
  // candidate reachable at all (an Academy cannot lift; the first version of this scene tried and quietly
  // tested nothing). The answer turns out to be that it is not reachable either: G.liftBuilding refuses
  // while anything is in the queue. The control at the end is the same building lifting once the queue is
  // empty, without which this scene would pass just as happily if lifting were broken outright.
  {
    const p = start('T'); const hall = hallOf();
    const eng = put('engineering_bay', hall.tx + 6, hall.ty);
    const queued = G.queueUpgrade(eng, 'infW');
    run(60); const mid = prog(eng);
    G.liftBuilding(eng); run(240);
    const refusedLift = !eng.lifted, after = prog(eng);
    run(timeOf('infW') + 900);
    const done = has(p, 'infW');
    G.liftBuilding(eng); run(4);                      // the control: with an empty queue it lifts
    push({ scene: '1. engineering bay asked to LIFT while upgrading', setup: queued === true && mid > 0,
      refusedLift, progressAtRequest: mid, after240: after, keptGoing: after > mid, upgradeFinished: done,
      liftsWithAnEmptyQueue: !!eng.lifted,
      state: (done && refusedLift && eng.lifted) ? 'ok: the lift is refused, the upgrade finishes, and lifting still works afterwards' : 'STUCK' });
  }

  // ---- 4. a Hatchery asked to MORPH while it is researching --------------------------------------
  {
    const p = start('Z'); const hall = hallOf();
    put('spawning_pool', hall.tx + 6, hall.ty); run(2);
    const queued = G.queueTech(hall, 'burrow_tech');
    const morphed = G.queueMorph(hall, 'lair');
    run(timeOf('burrow_tech') + 600);
    push({ scene: '4. hatchery asked to morph while researching', setup: queued === true,
      morphAccepted: morphed, now: hall.def.id, state: has(p, 'burrow_tech') ? 'finished' : 'STUCK' });
  }

  // ---- 5. a Spire asked to morph to a GREATER SPIRE while upgrading ------------------------------
  {
    const p = start('Z'); const hall = hallOf();
    put('spawning_pool', hall.tx + 6, hall.ty); put('lair', hall.tx + 12, hall.ty);
    put('queens_nest', hall.tx + 18, hall.ty); put('hive', hall.tx + 24, hall.ty);
    const spire = put('spire', hall.tx + 12, hall.ty + 6); run(2);
    const queued = G.queueUpgrade(spire, 'flyW');
    run(60); const mid = prog(spire);
    const morphed = G.queueMorph(spire, 'greater_spire');
    run(timeOf('flyW') + 900);
    push({ scene: '5. spire asked to morph to a greater spire while upgrading', setup: queued === true && mid > 0,
      morphAccepted: morphed, now: spire.def.id, level: p.upgLevel('flyW'),
      state: has(p, 'flyW') ? 'finished' : prog(spire) > mid ? 'still advancing' : 'STUCK' });
  }

  // ---- 6. a building that CHANGES OWNER mid-research ---------------------------------------------
  // The shape mind control takes. The question is not only whether the research finishes but WHOSE
  // reservation it clears: p.researching is per player and G.finishProduction deletes it from the
  // building's CURRENT owner, so the old one could be left holding a reservation for ever.
  {
    const p = start('T'); const hall = hallOf();
    const acad = put('academy', hall.tx + 6, hall.ty);
    const queued = G.queueTech(acad, 'stim');
    run(60); const mid = prog(acad);
    acad.owner = 1; acad.player = G.players[1];
    run(timeOf('stim') + 600);
    const acad2 = put('academy', hall.tx + 6, hall.ty + 4);
    const askAgain = acad2 ? G.queueTech(acad2, 'stim') : 'no building';
    push({ scene: '6. academy CHANGES OWNER mid-research', setup: queued === true && mid > 0,
      progressAtHandover: mid, oldOwnerHasIt: G.players[0].tech.has('stim'), newOwnerHasIt: G.players[1].tech.has('stim'),
      oldOwnerStillReserves: G.players[0].researching.has('stim'), canOldOwnerAskAgain: askAgain,
      state: askAgain === false && !G.players[0].tech.has('stim') ? 'STUCK: refused for ever, and nothing says why' : 'ok' });
  }

  // ---- 7. a slot CANCELLED and requeued -----------------------------------------------------------
  {
    const p = start('T'); const hall = hallOf();
    const acad = put('academy', hall.tx + 6, hall.ty);
    const queued = G.queueTech(acad, 'stim');
    run(60); G.cancelProd(acad, 0);
    const afterCancel = acad.prod.length, stillReserved = p.researching.has('stim');
    const requeued = G.queueTech(acad, 'stim');
    run(timeOf('stim') + 600);
    push({ scene: '7. research cancelled and requeued', setup: queued === true,
      queueAfterCancel: afterCancel, reservedAfterCancel: stillReserved, requeued,
      state: has(p, 'stim') ? 'finished' : 'STUCK' });
  }

  // ---- 8. the building researching it is KILLED, then rebuilt and asked again ---------------------
  {
    const p = start('T'); const hall = hallOf();
    const acad = put('academy', hall.tx + 6, hall.ty);
    const queued = G.queueTech(acad, 'stim');
    run(60); const mid = prog(acad);
    const reservedWhileGoing = p.researching.has('stim');
    G.kill(acad, null, true); run(60);
    const reservedAfterDeath = p.researching.has('stim');
    const acad2 = put('academy', hall.tx + 6, hall.ty + 4);
    const requeued = acad2 ? G.queueTech(acad2, 'stim') : 'no building';
    run(timeOf('stim') + 600);
    push({ scene: '8. the building researching it is KILLED, then rebuilt and asked again',
      setup: queued === true && mid > 0 && reservedWhileGoing === true,
      reservedWhileGoing, reservedAfterDeath, requeued,
      state: has(p, 'stim') ? 'finished' : 'STUCK: the reservation outlived the building' });
  }

  // ---- 9. the same for an UPGRADE ----------------------------------------------------------------
  {
    const p = start('T'); const hall = hallOf();
    const eng = put('engineering_bay', hall.tx + 6, hall.ty);
    const queued = G.queueUpgrade(eng, 'infW');
    run(60); const mid = prog(eng);
    const reservedWhileGoing = p.researching.has('infW');
    G.kill(eng, null, true); run(60);
    const reservedAfterDeath = p.researching.has('infW');
    const eng2 = put('engineering_bay', hall.tx + 6, hall.ty + 4);
    const requeued = eng2 ? G.queueUpgrade(eng2, 'infW') : 'no building';
    run(timeOf('infW') + 900);
    push({ scene: '9. the building UPGRADING is killed, then rebuilt and asked again',
      setup: queued === true && mid > 0 && reservedWhileGoing === true,
      reservedWhileGoing, reservedAfterDeath, requeued, level: p.upgLevel('infW'),
      state: has(p, 'infW') ? 'finished' : 'STUCK: the reservation outlived the building' });
  }

  // ---- 10. a Terran ADD-ON destroyed while it researches -------------------------------------------
  // siege_tech is researched AT the Machine Shop, so the add-on has to be finished for the case to
  // exist at all. It is then killed mid-research.
  {
    const p = start('T'); const hall = hallOf();
    const fac = put('factory', hall.tx + 6, hall.ty + 6);
    const shop = put('machine_shop', fac.tx + fac.def.w, fac.ty + 1);
    if (shop) { fac.addon = shop; shop.parent = fac; }
    run(4);
    const queued = shop ? G.queueTech(shop, 'siege_tech') : false;
    run(60); const mid = prog(shop);
    if (shop) G.kill(shop, null, true);
    run(120);
    const reservedAfterDeath = p.researching.has('siege_tech');
    const shop2 = put('machine_shop', fac.tx + fac.def.w, fac.ty + 1);
    if (shop2) { fac.addon = shop2; shop2.parent = fac; }
    const requeued = shop2 ? G.queueTech(shop2, 'siege_tech') : 'no building';
    run(timeOf('siege_tech') + 600);
    push({ scene: '10. the add-on researching it is destroyed, then rebuilt and asked again',
      setup: queued === true && mid > 0, reservedAfterDeath, requeued,
      state: has(p, 'siege_tech') ? 'finished' : 'STUCK' });
  }

  // ---- 11. a Protoss building that loses power mid-upgrade, and gets it back -----------------------
  {
    const p = start('P'); const hall = hallOf();
    const pylon = put('pylon', hall.tx + 8, hall.ty); run(4);
    const forge = put('forge', hall.tx + 10, hall.ty); run(4);
    const queued = G.queueUpgrade(forge, 'gW');
    run(60); const mid = prog(forge);
    G.kill(pylon, null, true); run(360);
    const dark = prog(forge), unpowered = !!forge.unpowered;
    put('pylon', hall.tx + 8, hall.ty); run(4);
    run(timeOf('gW') + 900);
    push({ scene: '11. forge loses its pylon mid-upgrade, then gets another', setup: queued === true && mid > 0,
      unpoweredWhileDark: unpowered, progressAtBlackout: mid, after360Dark: dark, frozeWhileDark: dark === mid,
      level: p.upgLevel('gW'), state: has(p, 'gW') ? 'finished' : prog(forge) > dark ? 'still advancing' : 'STUCK' });
  }
  return out;
})()`;

const out = vm.runInContext(SCENES, ctx);
let bad = 0, unset = 0;
for (const s of out) {
  const stuck = typeof s.state === 'string' && /^STUCK/.test(s.state);
  const setupBad = s.setup === false;
  if (stuck) bad++;
  if (setupBad) unset++;
  console.log((setupBad ? 'SETUP?  ' : stuck ? 'STUCK   ' : 'ok      ') + s.scene);
  console.log('          ' + JSON.stringify(s));
}
console.log('\n' + bad + ' of ' + out.length + ' scene(s) ended stuck.'
  + (unset ? '  ' + unset + ' scene(s) never created the case they claim -- fix those first.' : '  Every scene created the case it claims.'));
