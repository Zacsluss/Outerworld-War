// FIXLIST-M14 C2 (item 12) -- the Sensor Tower reports movement, it does not reveal ground.
//
// Reported as "the sensor tower should show enemy movement as dots without illuminating its whole
// sight range". M12 shipped it as a plain `sight: 16` -- an ordinary vision source with a big radius,
// which is the opposite of what was asked for: it revealed sixteen tiles of map and told you nothing
// you would not have learned by walking there.
//
// A CONTACT IS A POSITION AND NOTHING ELSE. The user's decision was that the AI reads them too, which
// makes them simulation state rather than an overlay -- so the build stamp moves, and G.contacts has
// to be deterministic and snapshot-safe. It is neither stored nor remembered: it is a pure function of
// unit positions, for the same reason GameMap.hazardState is a pure function of the frame.
//
// The three things that have to be true at once, and each has its own section below:
//   1. the radius grants NO vision -- fog inside it stays fogged
//   2. a MOVING enemy in it produces a contact; a stationary or burrowed one does not
//   3. the contact carries no identity, cannot be targeted, and survives a snapshot
//
//   node test/sensor.js
const fs = require('fs'), vm = require('vm'), path = require('path'), { makeCtx, makeOk, summary } = require('./_harness'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot'], ext: false, errors, collect: 'join' });
const ok = makeOk({ extra: 'nonempty' });
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

// A rig: a Terran with one finished Sensor Tower, and an enemy marine placed at a chosen distance.
const RIG = `
  G.init({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 3, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (let f = 0; f < 24; f++) G.tick();
  const me = G.players[0], st = G.map.starts[0];
  // somewhere flat and far from the base, so the tower's radius covers only ground nothing else sees
  const bx = Math.floor(st.cx / TILE) + 26, by = Math.floor(st.cy / TILE) + 26;
  const tower = G.placeBuilding(DATA.buildings.sensor_tower, bx, by, 0);
  tower.done = true; tower.hp = tower.maxHp; tower.progress = tower.def.time;
  const SENSOR = tower.def.sensor, SIGHT = tower.def.sight;
  G.updateVision();
  // put an enemy marine a set number of tiles from the tower
  const put = (tiles) => { const u = G.spawnUnit('marine', 1, tower.x + tiles * TILE, tower.y); u.px = u.x; u.py = u.y; return u; };
  const move = (u, dx) => { u.px = u.x; u.py = u.y; u.x += dx; };   // one frame of movement, by hand
  const still = (u) => { u.px = u.x; u.py = u.y; };
`;

// =============================================================================
// 1. the radius grants no vision at all
// =============================================================================
const vis = J(`(() => { ${RIG}
  const out = { sensor: SENSOR, sight: SIGHT };
  const tileAt = t => { const tx = Math.floor((tower.x + t * TILE) / TILE), ty = Math.floor(tower.y / TILE); return me.vis[ty * G.map.w + tx]; };
  out.atOwnFootprint = tileAt(0);
  out.atHalfSensor = tileAt(Math.floor(SENSOR / 2));
  out.atSensorEdge = tileAt(SENSOR - 1);
  // a marine out there is NOT visible, however much it moves
  const m = put(SENSOR - 3);
  for (let f = 0; f < 6; f++) { move(m, 4); G.updateVision(); }
  out.canSeeMarine = G.canSee(0, m);
  out.contacts = G.contacts(0).length;
  return out;
})()`);
ok(vis.sensor >= 16, 'the tower has a sensor radius', String(vis.sensor));
ok(vis.sight <= 4 && vis.sight < vis.sensor, 'and only a small sight of its own, so it is not blind but does not floodlight', JSON.stringify([vis.sight, vis.sensor]));
ok(vis.atOwnFootprint === 2, 'its own footprint is lit');
ok(vis.atHalfSensor === 0 && vis.atSensorEdge === 0, 'GROUND INSIDE THE RADIUS STAYS UNEXPLORED -- the fog is not lifted', JSON.stringify([vis.atHalfSensor, vis.atSensorEdge]));
ok(vis.canSeeMarine === false, 'and an enemy inside the radius is NOT visible', String(vis.canSeeMarine));
ok(vis.contacts === 1, '...but it does produce a contact, which is the whole item', String(vis.contacts));

// =============================================================================
// 2. movement, and only movement
// =============================================================================
const move = J(`(() => { ${RIG}
  const out = {};
  const m = put(SENSOR - 4);
  still(m);       out.stationary = G.contacts(0).length;
  move(m, 3);     out.moving = G.contacts(0).length;
  still(m);       out.stoppedAgain = G.contacts(0).length;
  // burrowed: ground is cover
  move(m, 3); m.burrowed = true;  out.burrowed = G.contacts(0).length;
  m.burrowed = false;
  // inside a transport: the transport makes the blip, not its passengers
  const d = G.spawnUnit('dropship', 1, tower.x + (SENSOR - 4) * TILE, tower.y + 40); d.px = d.x - 3; d.py = d.y;
  m.inside = d; d.cargo.push(m); move(m, 3);
  out.rider = G.contacts(0).length;    // the dropship only
  m.inside = null; d.cargo.length = 0; G.kill(d, null, true);
  // out of range
  move(m, 3);
  m.x = tower.x + (SENSOR + 6) * TILE; m.px = m.x - 4;
  out.outOfRange = G.contacts(0).length;
  m.x = tower.x + (SENSOR - 4) * TILE; m.px = m.x - 4;
  out.backInRange = G.contacts(0).length;
  // MY OWN units never make one
  const mine = G.spawnUnit('marine', 0, tower.x + 3 * TILE, tower.y); mine.px = mine.x - 4;
  out.withOwnUnitMoving = G.contacts(0).length;
  // an unfinished tower reports nothing
  tower.done = false; out.unfinished = G.contacts(0).length; tower.done = true;
  // and a player with no tower at all
  out.noTower = G.contacts(1).length;
  return out;
})()`);
ok(move.stationary === 0, 'a STATIONARY enemy in the radius produces nothing -- it is a movement detector', String(move.stationary));
ok(move.moving === 1, 'a MOVING one produces exactly one contact', String(move.moving));
ok(move.stoppedAgain === 0, 'and the contact disappears the moment it stops', String(move.stoppedAgain));
ok(move.burrowed === 0, 'a burrowed unit produces none -- ground is cover from it', String(move.burrowed));
ok(move.rider === 1, 'a passenger produces none; its transport produces the one blip', String(move.rider));
ok(move.outOfRange === 0 && move.backInRange === 1, 'and the radius is a radius', JSON.stringify([move.outOfRange, move.backInRange]));
ok(move.withOwnUnitMoving === 1, 'your own moving units never make a contact -- you know where your army is', String(move.withOwnUnitMoving));
ok(move.unfinished === 0, 'a tower still under construction reports nothing', String(move.unfinished));
ok(move.noTower === 0, 'and a player with no tower has no contacts at all', String(move.noTower));

// =============================================================================
// 3. a contact carries NO identity, and cannot be reached through
// =============================================================================
const blind = J(`(() => { ${RIG}
  const m = put(SENSOR - 4); move(m, 3);
  const cs = G.contacts(0);
  const keys = cs.length ? Object.keys(cs[0]).sort() : [];
  // does anything in the returned object lead back to the unit?
  let leaks = false;
  for (const c of cs) for (const k of Object.keys(c)) { const v = c[k]; if (v && typeof v === 'object') leaks = true; if (typeof v === 'string') leaks = true; }
  return { n: cs.length, keys, leaks, sample: cs[0] };
})()`);
ok(blind.keys.join(',') === 'x,y', 'a contact is EXACTLY {x, y} -- no def, no owner, no hit points', blind.keys.join(','));
ok(!blind.leaks, 'and nothing in it is an object or a string, so nothing can be reached through it', JSON.stringify(blind.sample));

// The AI reads them, and reads nothing else off them.
const ai = J(`(() => { ${RIG}
  const p0 = G.players[0];
  p0.ai = new AI(p0, 'normal', 'standard');
  const m = put(SENSOR - 4); move(m, 3);
  const before = JSON.stringify(p0.ai.observe());
  G.contacts(0);
  const after = JSON.stringify(p0.ai.observe());
  return { intelUnchanged: before === after,
    intelHasMarine: !!p0.ai.observe().unit.marine,
    srcUsesContacts: /G\\.contacts\\(/.test(String(AI.prototype.contactAlarm)),
    observeUsesContacts: /contacts/.test(String(AI.prototype.observe)) };
})()`);
ok(!ai.intelHasMarine, 'THE AI LEARNS NOTHING ABOUT WHAT IT IS: a contact never reaches the intel model as a unit type', JSON.stringify(ai));
ok(ai.observeUsesContacts === false, 'observe() does not touch contacts at all -- the separation is structural, not a filter');
ok(ai.srcUsesContacts, 'but the AI does read them, through contactAlarm');

// ...and it acts on one, which is what stops the tower being present and inert for a computer opponent.
const alarm = J(`(() => { ${RIG}
  const p0 = G.players[0];
  p0.ai = new AI(p0, 'normal', 'standard');
  // a hall next to the tower, so a blip there is "near a base"
  const hall = G.units.find(u => u.owner === 0 && u.def.depot);
  const near = G.spawnUnit('marine', 1, hall.x + 6 * TILE, hall.y);
  // move the tower on top of the hall so its radius covers the approach
  tower.x = hall.x; tower.y = hall.y;
  near.px = near.x - 4;
  const out = {};
  out.contactsNearHall = G.contacts(0).length;
  p0.ai.contactT = -99999;
  const a = p0.ai.contactAlarm();
  out.raised = !!a;
  out.atTheBlip = a ? Math.round(Math.hypot(a.x - near.x, a.y - near.y)) : -1;
  // and it will not raise a second alarm immediately -- one scout may not pin the army at home
  const again = p0.ai.contactAlarm();
  out.secondAlarm = !!again;
  out.calm = SENSOR_CALM;
  // A blip far from every base raises nothing. The TOWER has to move out too, or there would be no
  // contact to ignore and the check would pass by being vacuous -- so it is asserted that one exists.
  const far = (SENSOR_NEAR + 12) * TILE;
  tower.x = hall.x + far; tower.y = hall.y;
  near.x = tower.x; near.y = tower.y; near.px = near.x - 4;
  out.contactsFarOut = G.contacts(0).length;
  p0.ai.contactT = -99999;
  out.farAway = !!p0.ai.contactAlarm();
  out.near = SENSOR_NEAR;
  return out;
})()`);
ok(alarm.contactsNearHall >= 1, 'the rig really does put a contact near a base', String(alarm.contactsNearHall));
ok(alarm.raised && alarm.atTheBlip === 0, 'THE AI RAISES AN ALARM ON A BLIP, at the blip itself', JSON.stringify(alarm));
ok(!alarm.secondAlarm, 'and will not raise another inside the calm window, so one scout cannot pin its army at home', String(alarm.calm));
ok(alarm.contactsFarOut >= 1, 'a tower posted ' + (alarm.near + 12) + ' tiles out still reports the blip beside it', String(alarm.contactsFarOut));
ok(!alarm.farAway, '...but a blip that far from every base raises no alarm -- the army is not sent across the map for a dot', JSON.stringify([alarm.near, alarm.farAway]));

// =============================================================================
// 4. deterministic, and it survives a snapshot -- because nothing is stored
// =============================================================================
const det = J(`(() => {
  const play = () => {
    G.init({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 9, layout: 'temple' });
    for (let f = 0; f < 900; f++) G.tick();
    const st = G.map.starts[0];
    const t = G.placeBuilding(DATA.buildings.sensor_tower, Math.floor(st.cx / TILE) + 20, Math.floor(st.cy / TILE) + 20, 0);
    t.done = true; t.hp = t.maxHp;
    for (let f = 0; f < 300; f++) G.tick();
    return t;
  };
  play();
  const a = JSON.stringify(G.contacts(0)), a2 = JSON.stringify(G.contacts(0));
  const hashA = G.stateHash();
  // snapshot, carry on, restore, carry on: the contacts at the same frame must match
  const s = Snapshot.take();
  for (let f = 0; f < 120; f++) G.tick();
  const straight = JSON.stringify(G.contacts(0)) + '|' + G.stateHash();
  Snapshot.restore(s);
  for (let f = 0; f < 120; f++) G.tick();
  const restored = JSON.stringify(G.contacts(0)) + '|' + G.stateHash();
  // and a second, independent game on the same seed
  play();
  const b = JSON.stringify(G.contacts(0));
  return { sameTwice: a === a2, sameGame: a === b, survivesSnapshot: straight === restored,
    n: JSON.parse(a).length, hashA };
})()`);
ok(det.sameTwice, 'asking twice on the same frame gives the same answer -- it is derived, not sampled');
ok(det.sameGame, 'and the same seed replayed gives the same contacts', JSON.stringify([det.n]));
ok(det.survivesSnapshot, 'A SNAPSHOT AND A REPLAY SEEK REPRODUCE THEM EXACTLY -- nothing is stored, so there is nothing to lose');
{ const src = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8');
  const fn = src.slice(src.indexOf('contacts(pid) {'), src.indexOf('// ---------------- spawning'));
  ok(fn.length > 200, 'the slice found G.contacts (negative control for the anchor: ~800 chars today)', fn.length + ' chars');
  ok(!/Math\.random|Date\.now|performance\.|this\._|G\._/.test(fn), 'G.contacts uses no randomness, no clock and no stored state', fn.length + ' chars'); }

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
summary({ nl: true });
