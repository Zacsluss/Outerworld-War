// Headless feature tests: node test/features.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const ctx = { console, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { } }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
vm.runInContext(`
UI.ping = () => {}; UI.onUnitDied = () => {};
let pass = 0, fail = 0; const T = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL: ' + name); } };
function fresh(r0, r1) { G.init({ players: [{ race: r0, human: true }, { race: r1, human: false }], seed: 1 }); G.players[1].ai = null; for (const p of G.players) { p.minerals = 5000; p.gas = 5000; } return G.players[0]; }
function run(n) { for (let i = 0; i < n; i++) G.tick(); }
function sp(id, o, x, y) { return G.spawnUnit(id, o, x, y); }
function freeNear(x, y) { const t = G.map.findFreeTile(Math.floor(x / TILE), Math.floor(y / TILE), 20, (tx, ty) => G.map.walkable(tx, ty) && G.map.walkable(tx+1, ty) && G.map.walkable(tx, ty+1)); return [(t[0] + .5) * TILE, (t[1] + .5) * TILE]; }
function place(defId, owner, nearX, nearY) { const def = DATA.buildings[defId]; const p = G.players[owner]; for (let r = 2; r < 30; r++) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const tx = Math.round(nearX / TILE + Math.cos(a) * r - def.w / 2), ty = Math.round(nearY / TILE + Math.sin(a) * r * .8 - def.h / 2); if (!G.map.canPlace(def, tx, ty, p, G.units, null) && (!def.addons.length || !G.map.canPlace(DATA.buildings.comsat_station, tx + def.w, ty + def.h - 2, p, G.units, null))) { const b = G.placeBuilding(def, tx, ty, owner); b.done = true; b.progress = def.time; b.hp = b.maxHp; b.sh = b.maxSh; if (def.creep) G.map.recomputeCreep(G.units); if (def.psi) G.map.recomputePsi(owner, G.units); G.recomputeSupply(); return b; } } throw new Error('no place for ' + defId); }

// ---------- Terran ----------
let p = fresh('T', 'Z'); let hx = p.startX, hy = p.startY;
const scv = G.units.find(u => u.def.id === 'scv');
let [bx, by] = freeNear(hx + 200, hy + 100); const dtx = Math.floor(bx / TILE), dty = Math.floor(by / TILE);
scv.setOrder({ type: 'build', def: DATA.buildings.supply_depot, tx: dtx, ty: dty }); run(700);
let depot = G.units.find(u => u.def.id === 'supply_depot'); T('SCV builds depot', depot && depot.done);
T('depot supply', p.supMax === 18);
const cc = G.units.find(u => u.def.id === 'command_center');
T('queue scv', G.queueUnit(cc, 'scv')); run(310); T('scv trained', G.units.filter(u => u.def.id === 'scv' && u.alive).length === 5);
const rax = place('barracks', 0, hx + 300, hy); const acad = place('academy', 0, hx + 300, hy + 150);
T('queue tech stim', G.queueTech(acad, 'stim')); run(1210); T('stim researched', p.hasTech('stim'));
G.queueUnit(rax, 'marine'); run(370); const mar = G.units.find(u => u.def.id === 'marine'); T('marine trained', !!mar);
T('stim instant', Abilities.issue(mar, 'stim') && mar.hp === 30 && mar.stim > 0);
const ebay = place('engineering_bay', 0, hx - 100, hy + 200); T('queue upg', G.queueUpgrade(ebay, 'infW')); run(4010); T('infW L1', p.upgLevel('infW') === 1 && mar.wDmg(mar.def.gw) === 7);
// siege tank
const fac = place('factory', 0, hx + 100, hy + 260); T('addon machine shop', G.queueAddon(fac, 'machine_shop')); run(610); T('addon done', fac.addon && fac.addon.done);
T('siege tech', G.queueTech(fac.addon, 'siege_tech')); run(1210); T('siege researched', p.hasTech('siege_tech'));
const tank = sp('siege_tank', 0, hx, hy + 300); T('siege mode', Abilities.issue(tank, 'siege_mode')); run(45); T('sieged', tank.sieged && tank.weaponFor({ fly: false }) === SIEGE_W);
const ling = sp('zergling', 1, tank.x + 200, tank.y); run(60); T('sieged tank kills ling at range', !ling.alive);
const ling2 = sp('zergling', 1, tank.x + 30, tank.y); run(40); T('min range: ling survives', ling2.alive); G.kill(ling2, null, true);
// bunker
const bunker = place('bunker', 0, hx - 200, hy + 250); mar.setOrder({ type: 'load', target: bunker }); run(200); T('marine in bunker', mar.inside === bunker && bunker.cargo.length === 1);
const ling3 = sp('zergling', 1, bunker.x + 5 * TILE, bunker.y); run(80); T('bunker marine shoots', !ling3.alive || ling3.hp < 35);
G.unloadAll(bunker); T('bunker unload', !mar.inside && bunker.cargo.length === 0);
// dropship
const ds = sp('dropship', 0, hx, hy - 100); mar.setOrder({ type: 'load', target: ds }); run(150); T('dropship load', mar.inside === ds);
ds.setOrder({ type: 'unload', x: ds.x + 100, y: ds.y }); run(120); T('dropship unload', !mar.inside && mar.alive);
// comsat scan & detection of burrowed
G.queueAddon(cc, 'comsat_station'); run(610); const cs = cc.addon; T('comsat', cs && cs.def.id === 'comsat_station'); cs.energy = 100;
const lurk = sp('lurker', 1, hx + 400, hy + 400); Abilities.instant(lurk, 'burrow'); run(30); T('lurker burrowed', lurk.burrowed && lurk.isCloaked);
T('not detected', !G.detected(lurk, 0)); Abilities.issue(cs, 'scanner_sweep', null, lurk.x, lurk.y); run(6); T('scan detects', G.detected(lurk, 0));
// lift off / land
T('lift', (G.liftBuilding(rax), rax.lifted && rax.fly)); rax.setOrder({ type: 'land', tx: rax.tx, ty: rax.ty }); run(20); T('land', !rax.lifted && !rax.fly);
// repair
tank.hp = 50; scv.setOrder({ type: 'repair', target: tank }); run(300); T('repair', tank.hp > 100);
// nuke
const sf = place('science_facility', 0, hx - 250, hy - 200); G.queueAddon(sf, 'covert_ops'); run(610); G.kill(cs, null, true); cc.addon = null; T('silo queued', G.queueAddon(cc, 'nuclear_silo')); run(1210);
const siloB = G.units.find(u => u.def.id === 'nuclear_silo'); T('silo', siloB && siloB.done); T('nuke build', G.queueUnit(siloB, 'nuke')); run(1810); T('nuke ready', p.nukes === 1);
G.kill(lurk, null, true); for (const u of G.units) if (u.alive && u.owner === 1) G.kill(u, null, true); const ghost = sp('ghost', 0, hx + 100, hy + 100); const enemyHatch = place('hatchery', 1, hx + 500, hy + 500); ghost.energy = 200;
T('nuke issue', Abilities.issue(ghost, 'nuke', null, enemyHatch.x, enemyHatch.y)); run(700); T('nuke hits', !enemyHatch.alive || enemyHatch.hp < 800);
// damage math: concussive vs large
// Facing is set toward the attacker on purpose. Directional armour (M11) multiplies the result by
// where the hit landed, and both units are spawned at the same point and then nudged apart by
// placement -- so without this the relative angle, and the multiplier with it, is arbitrary. This
// assertion is about the damage formula, so it takes the front arc, where the multiplier is 1.
const vult = sp('vulture', 0, hx, hy); const ultra = sp('ultralisk', 1, hx, hy); ultra.hp = 400;
ultra.facing = Math.atan2(vult.y - ultra.y, vult.x - ultra.x);
// The exact formula, and the multiplier is read from the table rather than written out here -- it is
// the assertion that caught directional armour trying to discount the front arc, so it has to stay an
// exact equality, but hard-coding 0.25 meant softening the counter matrix (M11 idea 24) showed up as
// a mysterious failure in a check about something else.
const d = G.damage(ultra, 20, 'concussive', vult); const exp = (20 - 1) * DMG_MULT.concussive[ultra.def.size || 'medium'];   // the ultralisk is the TARGET; the vulture is firing
T('concussive vs large = (20-1)*' + DMG_MULT.concussive.large, Math.abs(d - exp) < 0.01); G.kill(ultra, null, true);
// fog: low ground unit cannot see high ground
// The pair must be clear of every unit player 0 already has, or this measures the base's vision rather
// than the marine's. It did not matter until high ground granted +15% sight (M11 vertical layers) and
// a structure on a plateau started reaching the chosen tile on its own -- the assertion then failed
// while the thing it is about was still true.
const m = G.map; let lowT = null, highT = null;
const clearOfOurs = (x, y) => !G.units.some(u => u.alive && u.owner === 0 && Math.hypot(u.x / TILE - x, u.y / TILE - y) < 20);
for (let y = 2; y < m.h; y++) for (let x = 2; x < m.w; x++) { const i = m.idx(x, y); if (m.height[i] === 0 && m.walk[i] && !lowT) { for (let dx = 0; dx < 6; dx++) { const j = m.idx(x + dx, y); if (m.height[j] === 2 && !highT && clearOfOurs(x, y) && clearOfOurs(x + dx, y)) { lowT = [x, y]; highT = [x + dx, y]; } } } }
if (lowT) { const spot = sp('marine', 0, (lowT[0] + .5) * TILE, (lowT[1] + .5) * TILE); run(4); T('high ground hidden from low ground', !G.visible(0, highT[0], highT[1])); const fly = sp('wraith', 0, spot.x, spot.y); run(4); T('flyer sees high ground', G.visible(0, highT[0], highT[1])); }

// ---------- Zerg ----------
p = fresh('Z', 'T'); hx = p.startX; hy = p.startY;
const hatch = G.units.find(u => u.def.spawnsLarva); let larva = G.units.find(u => u.def.larva);
T('larva morph drone', G.larvaMorph(larva, 'drone')); T('egg', larva.def.egg); run(310); T('drone hatched', G.units.filter(u => u.def.id === 'drone' && u.alive).length === 5);
larva = G.units.find(u => u.def.larva); G.larvaMorph(larva, 'overlord'); run(610); T('overlord supply', p.supMax === 17);
const pool = place('spawning_pool', 0, hx + 150, hy + 150); larva = G.units.find(u => u.def.larva); T('ling morph', G.larvaMorph(larva, 'zergling')); run(430); T('2 lings', G.units.filter(u => u.def.id === 'zergling' && u.alive).length === 2);
T('creep colony needs creep', G.map.canPlace(DATA.buildings.creep_colony, 2, 60, p, G.units, null) !== null);
const cre = place('creep_colony', 0, hx + 200, hy); T('sunken morph', G.queueMorph(cre, 'sunken_colony')); run(310); T('sunken', cre.def.id === 'sunken_colony');
T('lair morph', G.queueMorph(hatch, 'lair')); run(1510); T('lair', hatch.def.id === 'lair');
const den = place('hydralisk_den', 0, hx - 150, hy + 200); G.queueTech(den, 'lurker_aspect'); run(1810); T('lurker aspect', p.hasTech('lurker_aspect'));
const hyd = sp('hydralisk', 0, hx, hy + 300); T('lurker morph', Abilities.issue(hyd, 'lurker_aspect')); T('lurker egg', hyd.def.id === 'lurker_egg'); run(610); const lurkU = G.units.find(u => u.def.id === 'lurker' && u.alive); T('lurker', !!lurkU && !hyd.alive);
const tgt = sp('marine', 1, lurkU.x + 100, lurkU.y); Abilities.instant(lurkU, 'burrow'); run(120); T('lurker line attack', !tgt.alive);
const qn = place('queens_nest', 0, hx + 250, hy - 100); G.queueMorph(hatch, 'hive'); run(1810); T('hive', hatch.def.id === 'hive');
const mound = place('defiler_mound', 0, hx - 250, hy - 100); G.queueTech(mound, 'plague_tech'); G.queueTech(mound, 'consume_tech'); run(3100); T('plague+consume', p.hasTech('plague_tech') && p.hasTech('consume_tech'));
// Cast well away from the base. This check asserts the victim is DAMAGED BUT ALIVE -- plague
// floors at 1 and never kills, which is the property worth checking -- and a 40 hp enemy marine
// standing in the middle of the player's army does not survive thirty frames for reasons that have
// nothing to do with plague. It did until M11 softened the counter matrix and explosive-vs-small went
// from 0.5 to 0.65; the check then failed while the thing it is about still worked.
const quiet = G.map.findFreeTile(Math.floor(G.map.w / 2), Math.floor(G.map.h / 2), 24) || [Math.floor(G.map.w / 2), Math.floor(G.map.h / 2)];
const def = sp('defiler', 0, (quiet[0] + .5) * TILE, (quiet[1] + .5) * TILE); def.energy = 200;
const mar2 = sp('marine', 1, def.x + 90, def.y); mar2.hp = 40;
Abilities.issue(def, 'plague', null, mar2.x, mar2.y); run(30); T('plague ticks', mar2.hp < 40 && mar2.hp >= 1); G.kill(mar2, null, true);
// A zergling of its own, beside it, rather than whichever one happens to be alive back at the base:
// consume has to walk to its target and 300 frames does not cross half a map.
const ling4 = sp('zergling', 0, def.x + 40, def.y); def.energy = 10; Abilities.issue(def, 'consume', ling4); run(300); T('consume', !ling4.alive && def.energy >= 50);
def.energy = 200; Abilities.issue(def, 'dark_swarm', null, def.x + 100, def.y); run(30); T('swarm field', !!Abilities.inField(def.x + 100, def.y, 'swarm'));
const q = sp('queen', 0, hx, hy + 100); q.energy = 200; G.queueTech(qn, 'spawn_broodling_tech'); run(1210); const gol = sp('goliath', 1, q.x + 100, q.y); Abilities.issue(q, 'spawn_broodling', gol); run(30); T('broodlings', !gol.alive && G.units.filter(u => u.def.id === 'broodling' && u.alive).length === 2);
const gs = place('spire', 0, hx - 300, hy + 100); G.queueMorph(gs, 'greater_spire'); run(1810); const muta = sp('mutalisk', 0, hx, hy); T('guardian morph', Abilities.issue(muta, 'guardian_aspect')); run(610); T('guardian', G.units.some(u => u.def.id === 'guardian' && u.alive));
const dr = G.units.find(u => u.def.id === 'drone' && u.alive); const geyser = p.startBase.geyser; dr.setOrder({ type: 'build', def: DATA.buildings.extractor, tx: geyser.x, ty: geyser.y }); run(400); T('drone consumed by extractor', !dr.alive && G.units.some(u => u.def.id === 'extractor'));

// ---------- Protoss ----------
p = fresh('P', 'T'); hx = p.startX; hy = p.startY;
T('gateway needs psi', G.map.canPlace(DATA.buildings.gateway, Math.floor(hx / TILE) + 6, Math.floor(hy / TILE), p, G.units, null) === 'Requires psi power');
const pylon = place('pylon', 0, hx + 200, hy + 100); T('psi', G.map.hasPsi(0, pylon.tx, pylon.ty + 3));
const probe = G.units.find(u => u.def.id === 'probe'); const gtx = pylon.tx, gty = pylon.ty + 3; const errg = G.map.canPlace(DATA.buildings.gateway, gtx, gty, p, G.units, probe);
if (!errg) { probe.setOrder({ type: 'build', def: DATA.buildings.gateway, tx: gtx, ty: gty }); run(200); T('probe freed after warp-in', probe.order.type !== 'build' && G.units.some(u => u.def.id === 'gateway')); run(920); const gw = G.units.find(u => u.def.id === 'gateway'); T('gateway done', gw.done); G.kill(pylon, null, true); run(5); T('unpowered', gw.unpowered); }
const py2 = place('pylon', 0, hx - 200, hy - 150); G.map.recomputePsi(0, G.units); const ta = place('templar_archives', 0, hx - 200, hy - 200); G.queueTech(ta, 'psi_storm_tech'); run(1810); T('storm tech', p.hasTech('psi_storm_tech'));
const ht1 = sp('high_templar', 0, hx, hy + 200), ht2 = sp('high_templar', 0, hx + 40, hy + 200); ht1.energy = 200;
const mars = [0, 1, 2].map(i => sp('marine', 1, hx + 200 + i * 10, hy + 200)); Abilities.issue(ht1, 'psi_storm', null, hx + 205, hy + 200); run(90); T('storm kills marines', mars.every(m => !m.alive));
T('archon merge', Abilities.merge([ht1, ht2], 'summon_archon')); run(340); const arch = G.units.find(u => u.def.id === 'archon'); T('archon', arch && !ht1.alive && arch.morphT === 0);
const dt = sp('dark_templar', 0, hx + 300, hy + 300); const scv2 = sp('scv', 1, dt.x + 20, dt.y); run(80); T('DT kills undetected', !scv2.alive);
const turret = place('missile_turret', 1, dt.x + 100, dt.y); const mar3 = sp('marine', 1, dt.x + 60, dt.y); run(12); T('turret detects DT', G.detected(dt, 1)); run(100); T('detected DT takes damage', dt.hp + dt.sh < 120);
const arb = sp('arbiter', 0, hx, hy - 300); const zeal = sp('zealot', 0, arb.x + 50, arb.y); run(20); T('arbiter cloaks zealot', zeal.isCloaked && !arb.isCloaked);
const tri = place('arbiter_tribunal', 0, hx + 300, hy - 250); G.queueTech(tri, 'stasis_tech'); G.queueTech(tri, 'recall_tech'); run(3700); arb.energy = 200;
const tankE = sp('siege_tank', 1, arb.x + 150, arb.y); Abilities.issue(arb, 'stasis_field', null, tankE.x, tankE.y); run(30); T('stasis', tankE.fx.stasis > 0 && !G.targetable(zeal, tankE));
arb.energy = 200; Abilities.issue(arb, 'recall', null, hx + 600, hy + 600); const far = sp('dragoon', 0, hx + 600, hy + 600); run(60); T('recall', distPt(far.x, far.y, arb.x, arb.y) < 8 * TILE);
G.queueTech(ta, 'mind_control_tech'); run(1810); const da = sp('dark_archon', 0, hx - 300, hy + 300); da.energy = 200; const mc = sp('marine', 1, da.x + 100, da.y); Abilities.issue(da, 'mind_control', mc); run(30); T('mind control', mc.owner === 0 && da.sh < 5);
const car = sp('carrier', 0, hx, hy - 400); G.queueUnit(car, 'interceptor'); run(310); T('interceptor built', car.interceptors === 1); car.interceptors = 4; const tgt2 = sp('marine', 1, car.x + 150, car.y); run(120); T('carrier attacks', !tgt2.alive);
const rea = sp('reaver', 0, hx - 100, hy + 260); rea.scarabs = 1; const tgt3 = sp('marine', 1, rea.x + 200, rea.y); run(150); T('reaver scarab', !tgt3.alive && rea.scarabs === 0);
const bat = place('shield_battery', 0, hx + 100, hy + 300); bat.energy = 200; const z2 = sp('zealot', 0, bat.x + 60, bat.y); z2.sh = 0; run(40); T('shield battery recharges', z2.sh > 30);
const cannon = place('photon_cannon', 0, hx - 100, hy + 400); const m5 = sp('marine', 1, cannon.x + 150, cannon.y); run(100); T('cannon shoots', !m5.alive);
const cor = sp('corsair', 0, hx, hy); const muta2 = sp('mutalisk', 1, cor.x + 100, cor.y); run(200); T('corsair damages muta', !muta2.alive || muta2.hp < 100);
const zealD = sp('zealot', 0, hx, hy); zealD.sh = 60; const dmgd = G.damage(zealD, 10, 'normal', null); T('shields absorb first', zealD.sh === 50 && zealD.hp === 100);
console.log('PASS ' + pass + '  FAIL ' + fail);
`, ctx);
