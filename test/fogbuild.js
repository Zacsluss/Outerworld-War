// FIXLIST-M14 C1 (item 9) -- you may not build on ground you have never seen.
//
// `GameMap.canPlace` checked terrain, occupancy, creep and psi and said nothing at all about whether
// the player had ever looked at the tile. So a Command Center could be dropped into the middle of the
// black, on ground that might be a cliff, a lake or the enemy's natural, and the first you knew of it
// was the building appearing.
//
// THE THREE STATES ARE THE WHOLE ITEM, and two of them must still work:
//
//   vis 0   never seen          REFUSED
//   vis 1   seen, fogged now    ALLOWED  <- rebuilding on ground you scouted is how the game is played
//   vis 2   visible now         ALLOWED
//
// And a footprint straddling the boundary is refused, deliberately: a hall half on ground you have
// scouted is a hall you have not scouted, because the unexplored half is where the surprise would be.
//
//   node test/fogbuild.js
const vm = require('vm'), { makeCtx, makeOk, summary } = require('./_harness');
const errors = [];
const ctx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'render', 'ui', 'hud'], ext: false, errors, collect: 'join' });
const ok = makeOk({ extra: 'nonempty' });
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

const MSG = vm.runInContext('UNEXPLORED_MSG', ctx);
ok(MSG === "You can't build here until it is explored", 'the message is the one the item specified, verbatim', MSG);

// =============================================================================
// 1. the three vision states
// =============================================================================
const three = J(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'temple' });
  for (const p of G.players) p.ai = null;
  for (let f = 0; f < 48; f++) G.tick();
  const p = G.players[0], m = G.map, depot = DATA.buildings.supply_depot;
  p.minerals = 9000; p.gas = 9000;
  // a legal, flat, empty patch of ground well away from everything
  const find = () => {
    for (let ty = 4; ty < m.h - 6; ty++) for (let tx = 4; tx < m.w - 6; tx++) {
      // temporarily grant vision so canPlace answers about the TERRAIN only
      const save = [];
      for (let y = ty - 1; y < ty + depot.h + 1; y++) for (let x = tx - 1; x < tx + depot.w + 1; x++) { const i = y * m.w + x; save.push([i, p.vis[i]]); p.vis[i] = 2; }
      const err = m.canPlace(depot, tx, ty, p, G.units, null);
      for (const s of save) p.vis[s[0]] = s[1];
      if (!err) {
        // and only take one nobody has explored yet
        let dark = true;
        for (let y = ty; y < ty + depot.h; y++) for (let x = tx; x < tx + depot.w; x++) if (p.vis[y * m.w + x] !== 0) dark = false;
        if (dark) return [tx, ty];
      }
    }
    return null;
  };
  const spot = find(); if (!spot) return { noSpot: true };
  const [tx, ty] = spot;
  const setVis = v => { for (let y = ty; y < ty + depot.h; y++) for (let x = tx; x < tx + depot.w; x++) p.vis[y * m.w + x] = v; };
  const out = { tx, ty };
  setVis(0); out.never = m.canPlace(depot, tx, ty, p, G.units, null);
  setVis(1); out.fogged = m.canPlace(depot, tx, ty, p, G.units, null);
  setVis(2); out.visible = m.canPlace(depot, tx, ty, p, G.units, null);
  // straddling: one corner tile dark, the rest seen
  setVis(1); p.vis[ty * m.w + tx] = 0;
  out.straddleCorner = m.canPlace(depot, tx, ty, p, G.units, null);
  setVis(1); p.vis[(ty + depot.h - 1) * m.w + (tx + depot.w - 1)] = 0;
  out.straddleFar = m.canPlace(depot, tx, ty, p, G.units, null);
  setVis(1);
  // and it really does build once explored, through the real command path
  const scv = G.units.find(u => u.owner === 0 && u.def.worker);
  out.built = !!G.placeBuilding(depot, tx, ty, 0);
  return out;
})()`);
ok(!three.noSpot, 'the probe found flat empty unexplored ground to test on', JSON.stringify(three));
ok(three.never === MSG, 'NEVER SEEN: refused, with the specified message', String(three.never));
ok(three.fogged === null, 'SEEN BEFORE, FOGGED NOW: allowed -- rebuilding on scouted ground still works', String(three.fogged));
ok(three.visible === null, 'VISIBLE NOW: allowed', String(three.visible));
ok(three.straddleCorner === MSG && three.straddleFar === MSG,
  'a footprint with ANY unexplored tile is refused, whichever corner it is', JSON.stringify([three.straddleCorner, three.straddleFar]));
ok(three.built, 'and the building really does go down once the ground is explored');

// The human's own build path says it, not just canPlace.
const said = J(`(() => {
  const p = G.players[0], m = G.map, depot = DATA.buildings.supply_depot;
  // find dark ground again
  let spot = null;
  for (let ty = 4; ty < m.h - 6 && !spot; ty++) for (let tx = 4; tx < m.w - 6 && !spot; tx++) {
    let dark = true;
    for (let y = ty - 1; y < ty + depot.h + 1; y++) for (let x = tx - 1; x < tx + depot.w + 1; x++) if (p.vis[y * m.w + x] !== 0) dark = false;
    if (!dark) continue;
    const save = [];
    for (let y = ty; y < ty + depot.h; y++) for (let x = tx; x < tx + depot.w; x++) { const i = y * m.w + x; save.push([i, p.vis[i]]); p.vis[i] = 2; }
    const err = m.canPlace(depot, tx, ty, p, G.units, null);
    for (const s of save) p.vis[s[0]] = s[1];
    if (!err) spot = [tx, ty];
  }
  if (!spot) return { noSpot: true };
  const scv = G.units.find(u => u.owner === 0 && u.def.worker && u.alive);
  UI.placing = { def: depot, builder: scv, tx: spot[0], ty: spot[1] };
  p.msgs.length = 0; p.lastAlert = {};
  const before = p.minerals;
  UI.confirmPlacement(false);
  return { said: p.msgs.map(x => x.kind + '|' + x.text), charged: p.minerals !== before, stillPlacing: !!UI.placing };
})()`);
ok(!said.noSpot && said.said.length === 1 && said.said[0] === 'error|' + MSG,
  'clicking to build there tells the player why, in red', JSON.stringify(said));
ok(!said.charged, 'and does not charge them for it');

// =============================================================================
// 2. the placement ghost is red before the click
// =============================================================================
const ghost = J(`(() => {
  const p = G.players[0], m = G.map, depot = DATA.buildings.supply_depot;
  UI.placing = null;
  // The ghost's colour is decided by the same canPlace call drawPlacement makes, which is the point:
  // there is one answer and the ghost and the click cannot disagree about it.
  const src = String(Render.drawPlacement);
  return { readsCanPlace: /canPlace\\(def, tx, ty, G\\.players\\[G\\.human\\]/.test(src),
    redOnErr: /err \\? .rgba\\(255,60,60/.test(src) || /!err \\? 'rgba\\(60,255,60/.test(src),
    printsErr: /fillText\\(err/.test(src) };
})()`);
ok(ghost.readsCanPlace, 'the ghost asks canPlace as the player itself, so it cannot disagree with the click');
ok(ghost.redOnErr && ghost.printsErr, 'and it is red and carries the reason before the click', JSON.stringify(ghost));

// =============================================================================
// 3. the exemptions, each of which would otherwise break something real
// =============================================================================
const exempt = J(`(() => {
  const out = {};
  // the map editor validates bases with a stand-in player that has no vision array at all
  const hall = DATA.buildings.command_center, stand = { id: 0 };
  out.editor = G.map.canPlace(hall, G.map.bases[1].x, G.map.bases[1].y, stand, [], null);
  // a scenario places buildings before anybody has vision
  out.missionSrc = /UNEXPLORED_MSG/.test(String(G.placeDone));
  return out;
})()`);
ok(exempt.editor !== MSG, 'a player with no vision array (the map editor) is unrestricted', String(exempt.editor));
ok(exempt.missionSrc, 'and a scripted mission placement is exempt, or every scenario would start short of its buildings');

// =============================================================================
// 4. THE AI still builds -- this is the risk the item named
// =============================================================================
// AI.findSpot spirals outward calling canPlace, so a new refusal reason can make it fail to place
// buildings it placed before. A full game per race, counting what actually got built.
const ai = J(`(() => {
  const out = {};
  for (const race of ['T', 'Z', 'P']) {
    G.init({ players: [{ race, human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 5, layout: 'temple' });
    for (let f = 0; f < 24 * 60 * 12; f++) G.tick();
    const mine = G.units.filter(u => u.alive && u.owner === 0);
    out[race] = { buildings: mine.filter(u => u.isBuilding && u.done).length,
      halls: mine.filter(u => u.isBuilding && u.def.depot && u.done).length,
      workers: mine.filter(u => u.def.worker).length,
      kinds: [...new Set(mine.filter(u => u.isBuilding).map(u => u.def.id))].length,
      supply: G.players[0].supUsed };
  }
  return out;
})()`);
for (const [race, r] of Object.entries(ai)) {
  ok(r.buildings >= 6, race + ': the AI still puts up a base in twelve minutes (' + r.buildings + ' buildings, ' + r.kinds + ' kinds)', JSON.stringify(r));
  ok(r.halls >= 2, race + ': and still expands -- findSpot did not start refusing everything', JSON.stringify(r));
  ok(r.workers >= 12, race + ': and still mines', JSON.stringify(r));
}

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
summary({ nl: true });
