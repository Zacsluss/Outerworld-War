// ATTACKING YOUR OWN SIDE ON PURPOSE (tenth session, item 1; the user: "my own units should NOT attack my own structures if
// they are right clicked... BUT if we click the 'attack' button in the hud and we select our own unit/building, that should
// bypass and allow our units to attack our own buildings/units, like in starcraft (applies to drones/probes/scv as well)").
// Measured before: a right-click on your own things already moved, followed or repaired; the ATTACK command on them became
// an attack-move to the spot, so nothing could be force-attacked; and an idle unit hit by its own side would have fought back.
//   node test/forceattack.js
//
//   1. a right-click on your own building or unit never gives an attack order, for soldiers and for workers
//   2. the ATTACK command (the card's button) on your own building is an attack order on it, and it takes damage
//   3. ...on your own unit too, and the unit hit does not fight back -- while an enemy's idle unit still does
//   4. workers of all three races attack their own side the same way
//   5. an attack command on nothing is still an attack-move, and a unit is not told to attack itself
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const { ok, counts, mkDom, root } = require('./_harness');
const J = v => JSON.stringify(v);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
const store = { bw_net: J({ name: 'Zac', url: '', race: 'R' }), bw_intro: '1' };
const document = mkDom(html), loaded = [];
const c = { console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { }, requestAnimationFrame() { }, Image: function () { }, WebSocket: function () { }, navigator: {},
  addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  location: { protocol: 'http:', host: 'x', origin: 'http://x', pathname: '/', search: '' }, history: { replaceState() { } }, document };
c.window = c; c.globalThis = c; vm.createContext(c);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
vm.runInContext('UI.init = () => {}; UI.makeTicker = () => 1; Render.reset = () => {};', c);
for (const fn of loaded) fn();
const R = src => vm.runInContext('(() => {' + src + '})()', c);
R(`this.scene = (race) => {
  UI.start({ players: [{ race, human: true, name: 'Zac' }, { race: 'T', human: false, difficulty: 'easy', name: 'Bot' }], seed: 5, layout: 'temple' });
  for (const pl of G.players) if (!pl.neutral) pl.ai = null;
  const p = G.players[0]; p.minerals = 100000; p.gas = 100000; p.supMax = 200;
  return p;
};
this.hallOf = () => G.units.find(u => u.owner === 0 && u.def.depot);
this.put = (id, dx, dy, owner) => { const h = hallOf(); const b = G.placeBuilding(DATA.buildings[id], h.tx + dx, h.ty + dy, owner || 0); if (b) G.completeBuilding(b); return b; };
this.spawn = (id, dx, dy, owner) => { const h = hallOf(); return G.spawnUnit(id, owner || 0, h.x + dx, h.y + dy); };
this.run = n => { for (let f = 0; f < n; f++) G.tick(); };
this.pressAttack = () => { const b = UI.currentCard().find(x => x.cmd === 'cmd:attack'); if (!b) return false; UI.press(b); return !!(UI.pending && UI.pending.kind === 'attack'); };
this.aClick = t => { UI.execPending(UI.unitAt(t.x, t.y) === t ? t : t, t.x, t.y, false); };`);

console.log('--- 1. a right-click on your own side never attacks it ---');
{
  const r = R(`scene('T'); const d = put('supply_depot', 8, 0); const m = [0, 1, 2, 3].map(i => spawn('marine', 60 + i * 20, 120)); const scvs = G.units.filter(u => u.owner === 0 && u.def.worker).slice(0, 3);
    UI.selection = m.slice(); UI.smartCommand(UI.unitAt(d.x, d.y), d.x, d.y, false); const onDepot = m.map(u => u.order.type + (u.order.target ? ':' + u.order.target.def.id : ''));
    UI.selection = m.slice(0, 3); UI.smartCommand(m[3], m[3].x, m[3].y, false); const onMarine = m.slice(0, 3).map(u => u.order.type);
    d.hp = d.maxHp - 60; UI.selection = scvs.slice(); UI.smartCommand(UI.unitAt(d.x, d.y), d.x, d.y, false); const workers = scvs.map(u => u.order.type);
    run(24 * 4); return { hit: UI.unitAt(d.x, d.y) === d, onDepot, onMarine, workers, depotHp: d.hp, full: d.maxHp };`);
  ok(r.hit && r.onDepot.every(o => !/^attack/.test(o)) && r.onMarine.every(o => o === 'follow'), 'a right-click on your own building moves the selection there, and on your own unit follows it -- never an attack order', J(r));
  ok(r.workers.every(o => o === 'repair'), '...and SCVs right-clicking their own damaged depot repair it, as before', J(r.workers));
}

console.log('--- 2. the ATTACK command on your own building ---');
{
  const r = R(`scene('T'); const d = put('supply_depot', 8, 0); const m = [0, 1, 2, 3].map(i => spawn('marine', 60 + i * 20, 120));
    UI.selection = m.slice(); const armed = pressAttack(); const hp0 = d.hp; aClick(d);
    const orders = m.map(u => u.order.type + (u.order.target === d ? ':depot' : '')); run(24 * 5);
    return { armed, orders, hp0, hp: d.hp, alive: d.alive, pending: UI.pending };`);
  ok(r.armed && r.orders.every(o => o === 'attack:depot'), 'the card\'s ATTACK then a click on your own depot gives every selected marine an attack order ON THE DEPOT (it was an attack-move to the spot)', J(r));
  ok(r.hp < r.hp0 && r.pending === null, '...and the depot takes the damage', J({ hp0: r.hp0, hp: r.hp }));
}

console.log('--- 3. on your own unit, which does not fight back ---');
{
  const r = R(`scene('T'); const m = [0, 1, 2].map(i => spawn('marine', 60 + i * 20, 120)); const v = spawn('marine', 80, 190); run(4);
    UI.selection = m.slice(); pressAttack(); aClick(v); const orders = m.map(u => u.order.type + (u.order.target === v ? ':victim' : ''));
    const hp0 = v.hp; run(24 * 2); const victim = { order: v.order.type, target: v.order.target ? (m.includes(v.order.target) ? 'an attacker' : v.order.target.def.id) : null, hurt: v.hp < hp0 };
    // The rule itself, through G.onHit, with the shooter far outside anything the victim could acquire on its own -- so an
    // attack order on the victim can only be retaliation. The control is an enemy's idle marine, which must still answer.
    // 200 px apart: inside a Marine's sight (so the foe may target the shooter) and outside its 5-tile auto-acquisition.
    // Found, not assumed: three open spots in a column on one level, clear of every unit by eight tiles. Height gates sight, and the
    // offsets this used to name (400 px east of the hall, 100-500 down) ran off the main's plateau once the looks queue redesigned
    // Lost Ruins -- the foe stood below the shooter and could not see it.
    const gm = G.map, hh = hallOf(), col = [];
    for (let r = 10; r < 50 && !col.length; r++) for (let a = 0; a < 16 && !col.length; a++) {
      const x = hh.x + Math.round(Math.cos(a * Math.PI / 8) * r * TILE), y = hh.y + Math.round(Math.sin(a * Math.PI / 8) * r * TILE);
      const pts = [0, 200, 400].map(d => [x, y + d]), ts = pts.map(([px, py]) => [Math.floor(px / TILE), Math.floor(py / TILE)]);
      const lv = gm.inb(ts[0][0], ts[0][1]) ? gm.height[gm.idx(ts[0][0], ts[0][1])] : 1;
      const open = ([tx, ty]) => { for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (!gm.inb(tx + c, ty + b) || !gm.walkable(tx + c, ty + b) || gm.height[gm.idx(tx + c, ty + b)] !== lv) return false; return true; };
      if (lv !== 1 && ts.every(open) && !G.units.some(u => u.alive && pts.some(([px, py]) => Math.hypot(u.x - px, u.y - py) < 8 * TILE))) col.push(...pts);
    }
    const own = G.spawnUnit('marine', 0, col[0][0], col[0][1]), far = G.spawnUnit('marine', 0, col[1][0], col[1][1]), foe = G.spawnUnit('marine', 1, col[2][0], col[2][1]); run(8);
    const before = { own: own.order.type, foe: foe.order.type, foeSees: G.canSee(1, far) };
    G.onHit(own, far); G.onHit(foe, far);
    return { orders, victim, rule: { before, own: own.order.type + (own.order.target === far ? ':shooter' : ''), foe: foe.order.type + (foe.order.target === far ? ':shooter' : '') } };`);
  ok(r.orders.every(o => o === 'attack:victim') && r.victim.hurt, 'ATTACK on your own marine: the selection attacks it and it is hurt', J(r));
  ok(r.victim.order !== 'attack', '...and it stands and takes it rather than turning on your own army (an idle unit hit by its own side used to retaliate)', J(r.victim));
  ok(r.rule.before.own === 'idle' && r.rule.before.foe === 'idle' && r.rule.before.foeSees === true, 'setup: both marines stand idle, and the enemy one can see the shooter', J(r.rule.before));
  ok(r.rule.own !== 'attack:shooter' && r.rule.foe === 'attack:shooter', 'the rule: an idle unit hit by its own side does not answer, while an enemy\'s idle marine hit by ours still goes for the shooter', J(r.rule));
}

console.log('--- 4. workers of every race ---');
{
  const r = R(`const out = {};
    for (const [race, bld] of [['T', 'supply_depot'], ['Z', 'evolution_chamber'], ['P', 'pylon']]) {
      scene(race); const b = put(bld, 8, 0); const ws = G.units.filter(u => u.owner === 0 && u.def.worker).slice(0, 3);
      UI.selection = ws.slice(); const armed = pressAttack(); const hp0 = b.hp + (b.sh || 0); aClick(b); const orders = ws.map(u => u.order.type + (u.order.target === b ? ':own' : ''));
      run(24 * 6); out[race] = { worker: ws[0].def.id, armed, orders, hurt: b.hp + (b.sh || 0) < hp0 };   // shields first: a Pylon's hit points do not move until its shield is down
    }
    return out;`);
  ok(['T', 'Z', 'P'].every(k => r[k].armed && r[k].orders.every(o => o === 'attack:own') && r[k].hurt), 'SCVs, Drones and Probes given ATTACK on their own building attack it and hurt it', J(r));
}

console.log('--- 5. nothing clicked, or itself ---');
{
  const r = R(`scene('T'); const m = [0, 1].map(i => spawn('marine', 60 + i * 20, 120)); const h = hallOf();
    UI.selection = m.slice(); pressAttack(); UI.execPending(null, h.x + 300, h.y + 300, false); const ground = m.map(u => u.order.type);
    UI.selection = m.slice(); pressAttack(); UI.execPending(m[0], m[0].x, m[0].y, false); const self = { a: m[0].order.type, aTarget: !!m[0].order.target, b: m[1].order.type + (m[1].order.target === m[0] ? ':first' : '') };
    return { ground, self };`);
  ok(r.ground.every(o => o === 'attackmove'), 'ATTACK on open ground is still an attack-move', J(r.ground));
  ok(r.self.a === 'attackmove' && !r.self.aTarget && r.self.b === 'attack:first', 'ATTACK on one of the selection: the others attack it, and it is not told to attack itself', J(r.self));
}

console.log('--- 6. a melee attacker reaches a small building from every side ---');
{
  // Found while measuring this item: the path to a building ends on the tile beside it, and js/sim.js called that
  // unreachable, so a Probe sent at a Pylon -- anyone's -- often stood a tile short and gave up (107 of 384 approaches over
  // eight attackers and six buildings, .claude/review/tenth/melee-probe.js). Four attackers, eight directions, open ground.
  const r = R(`const out = {};
    for (const aid of ['probe', 'zergling', 'zealot', 'ultralisk']) {
      const fails = [];
      for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
        G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'P', human: false, name: 'B' }], seed: 5, layout: 'temple' });
        for (const pl of G.players) pl.ai = null; G.freePlay = true;
        const cx = Math.floor(G.map.w / 2), cy = Math.floor(G.map.h / 2); let spot = null;
        for (let rr = 0; rr < 20 && !spot; rr++) for (let k = 0; k < 16 && !spot; k++) { const tx = cx + Math.round(Math.cos(k / 16 * 6.283) * rr), ty = cy + Math.round(Math.sin(k / 16 * 6.283) * rr); if (!G.map.canPlace({ id: 'footprint', w: 2, h: 2 }, tx, ty, null, G.units, null)) spot = [tx, ty]; }
        const b = G.placeBuilding(DATA.buildings.pylon, spot[0], spot[1], 1); G.completeBuilding(b); b.sh = 0;
        const u = G.spawnUnit(aid, 0, b.x + dx * 7 * TILE, b.y + dy * 7 * TILE); const hp0 = b.hp;
        G.applying = true; try { u.setOrder({ type: 'attack', target: b }, false); } finally { G.applying = false; }
        let f = 0; for (; f < 24 * 8 && b.hp >= hp0 && u.order.type === 'attack'; f++) G.tick();
        if (b.hp >= hp0) fails.push(dx + ',' + dy + ':' + u.order.type);
      }
      out[aid] = fails;
    }
    return out;`);
  ok(Object.values(r).every(f => f.length === 0), 'a Probe, a Zergling, a Zealot and an Ultralisk told to attack a Pylon hit it from all eight directions (they used to give up a tile short from three to seven of them)', J(r));
}

const { pass, fail } = counts();
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
