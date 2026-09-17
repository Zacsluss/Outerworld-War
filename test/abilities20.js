// REVIEW-M17 task 20 -- the abilities the gate never drove, driven.
//   node test/abilities20.js
//
// The reviewer's identifier sweep found eighteen of the eighty ids in DATA.abilities never named in any
// gate suite. Re-measured at 6eb8b85 (.claude/review/agent-20/sweep.js, quoted strings, the 75 files in
// test/all.js's TESTS list): SEVENTEEN -- the reviewer's eighteenth, cloak_ghost, entered the gate with
// test/review17.js section 4 -- and three of the seventeen are `menu` kinds (card pages, not casts).
// Section 0 below is that sweep as a check, with the count as the guard: a sweep that matched nothing
// would report eighty, and one that matched everything would report none.
//
// Every scene here drives an ability through the entry point the interface uses -- Abilities.issue for
// a targeted or point cast, Abilities.instant through issue for a toggle, G.queueUnit through issue for
// the two ammo builders, G.setAutocast for the two armed ones -- and asserts the effect a player would
// see in the simulation: a status on the target, hit points gone, a unit that cannot move, a unit that
// cannot be shot, a building that changed hands, minerals spent, energy debited. Never merely that
// issue() said yes. Each check names its negative control in NOTES (agent-20) and ten of them were run.
//
//  0. the sweep itself, and the three menu kinds refused as casts
//  1. Restoration clears every status it names, by hand and armed (autocast)
//  2. Optical Flare blinds a detector for good: sight 2, no detection
//  3. Lockdown freezes a mechanical unit and refunds on a biological one
//  4. Defensive Matrix soaks 250 before a hit point is lost
//  5. EMP Shockwave empties energy and shields around the point
//  6. Yamato Gun: a fifty-frame channel, a projectile, 260 explosive at the end of it
//  7. Parasite gives the caster's owner the target's eyes
//  8. Ensnare halves the speed of everything under it
//  9. Nydus Exit places the far end, links it, and a Zergling comes out of it
// 10. Feedback burns a target's energy as damage and refuses one with none
// 11. Maelstrom holds the biological and lets the mechanical walk on
// 12. Disruption Web silences the ground and not the air
// 13. Build Scarab: one queued, one aboard after its build time, the cap, and the armed version
// 14. Build Interceptor: the same for the Carrier
// 15. a Scarab walks to its target and lands the Reaver's hundred
// 16. Interceptors dock when the fight ends, and die with their Carrier
// 17. a transport killed with cargo takes the cargo with it; a Bunker does not
// 18. a worker whose patch mines out moves to another, and one sent to a dead patch turns away
// 19. Infest Command Center: a damaged, landed hall changes hands and def; a healthy one is refused
// 20. Personnel Cloaking: unseen without a detector, seen with one, energy draining while cloaked
// 21. Siege Mode costs its forty frames going IN as well as coming out
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + extra : '')); } };

function makeCtx() {
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '' });
  const ctx = {
    console: { log() { }, warn() { }, error: (...a) => ctx.errors.push(String(a[0] && a[0].message || a[0])) }, errors: [], Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
    localStorage: { getItem() { return null; }, setItem() { } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
    requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, alert() { },
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  vm.runInContext(`
    UI.ping = () => {}; UI.onUnitDied = () => {}; UI.mode = 'play';
    // a two-player game with the computer switched off and both banks full; orders go straight at the
    // simulation (G.applying) rather than through the command log, so an enemy-owned unit can be given one too
    this.fresh = (r0, r1) => { G.init({ players: [{ race: r0, human: true }, { race: r1, human: false }], seed: 1 }); G.players[1].ai = null; for (const p of G.players) { p.minerals = 5000; p.gas = 5000; } G.recording = false; G.applying = true; return G.players[0]; };
    this.run = n => { for (let i = 0; i < n; i++) G.tick(); };
    this.sp = (id, o, x, y) => G.spawnUnit(id, o, x, y);
    this.freeNear = (x, y) => { const t = G.map.findFreeTile(Math.floor(x / TILE), Math.floor(y / TILE), 20, (tx, ty) => G.map.walkable(tx, ty) && G.map.walkable(tx + 1, ty) && G.map.walkable(tx, ty + 1)); return [(t[0] + .5) * TILE, (t[1] + .5) * TILE]; };
    this.wall = (o, x, y, id) => { const t = G.spawnUnit(id || 'zergling', o, x, y); t.hp = t.maxHp = 1e6; return t; };   // a target that never dies
    // the last thing said to player 0 that matches
    this.said = re => G.players[0].msgs.some(m => re.test(m.text));
  `, ctx);
  return ctx;
}
const R = (c, src) => vm.runInContext('(() => {' + src + '})();', c);
const ctx = makeCtx();

// ============================================================================
// 0. the sweep: seventeen never named elsewhere, three of them menus; this file names the rest
// ============================================================================
// The list is the measurement, kept here so the count guards the sweep: a regex that matched nothing
// would leave eighty, one that matched everything would leave none, and either is a red. When another
// suite starts naming one of these, delete it from the list -- this check will say which.
const NEVER = ['build_basic', 'build_adv', 'morph_menu', 'restoration', 'optical_flare', 'defensive_matrix', 'emp', 'yamato', 'parasite', 'ensnare', 'nydus_exit', 'maelstrom', 'build_scarab', 'build_interceptor', 'disruption_web'];
{
  const ids = R(ctx, 'return Object.keys(DATA.abilities);');
  const allSrc = fs.readFileSync(path.join(__dirname, 'all.js'), 'utf8');
  const files = [...allSrc.matchAll(/args: \['([^']+)'/g)].map(m => m[1]);
  const texts = files.filter(f => f !== 'abilities20.js').map(f => fs.readFileSync(path.join(__dirname, f), 'utf8'));
  const quoted = id => new RegExp("['\"`]" + id + "['\"`]");
  const never = ids.filter(id => !texts.some(t => quoted(id).test(t)));
  ok('DATA.abilities holds eighty-one ids and test/all.js names at least seventy-five suites (scene check for the sweep; the eighty-first is the Supply Depot\'s Lower / Raise, seventh session)', ids.length === 81 && files.length >= 75, ids.length + ' ids, ' + files.length + ' suites');
  ok('the other gate suites never name exactly these fifteen as a quoted string (18 at the sweep; review17.js took cloak_ghost, and onecopy.js took lockdown and feedback when SCAN-M18 B1 drove their refunds)', never.length === NEVER.length && never.every(id => NEVER.includes(id)), 'measured ' + never.length + ': ' + never.join(', '));
  const self = fs.readFileSync(__filename, 'utf8');
  ok('...and this file names every one of them', NEVER.every(id => quoted(id).test(self)), NEVER.filter(id => !quoted(id).test(self)).join(', '));
  const menus = R(ctx, `
    const p = fresh('T', 'Z'); const w = G.units.find(u => u.def.worker && u.owner === 0); const m0 = p.minerals;
    const res = {}; for (const id of ['build_basic', 'build_adv', 'morph_menu']) res[id] = Abilities.issue(w, id, null, w.x, w.y);
    return { res, kinds: ['build_basic', 'build_adv', 'morph_menu'].map(id => DATA.abilities[id].kind), order: w.order.type, spent: m0 - p.minerals };`);
  ok('the three menu kinds are card pages, not casts: issue() refuses all three and nothing is spent or ordered', Object.values(menus.res).every(v => v === false) && menus.kinds.every(k => k === 'menu') && menus.spent === 0, JSON.stringify(menus));
}

// ============================================================================
// 1. Restoration
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); p.tech.add('restoration_tech'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const mar = sp('marine', 0, x, y); mar.hp = mar.maxHp = 500;
    mar.fx.ensnare = 500; mar.fx.plague = 500; mar.fx.blind = 1e9; mar.fx.irradiate = 500; mar.fx.maelstrom = 100; mar.fx.parasite = 1; mar.acidSpores = 3;
    const med = sp('medic', 0, x + 30, y); med.energy = 60;
    const noEnergy = (() => { med.energy = 10; const r = Abilities.issue(med, 'restoration', mar, mar.x, mar.y); med.energy = 60; return r; })();
    const issued = Abilities.issue(med, 'restoration', mar, mar.x, mar.y); run(30);
    const after = { ensnare: mar.fx.ensnare, plague: mar.fx.plague, blind: mar.fx.blind, irradiate: mar.fx.irradiate, maelstrom: mar.fx.maelstrom, parasite: mar.fx.parasite, spores: mar.acidSpores, energy: med.energy };
    // armed: a second marine goes blind, and the medic clears it on her own
    const mar2 = sp('marine', 0, x, y + 30); mar2.fx.blind = 1e9; med.energy = 100;
    const armed = G.setAutocast([med], 'restoration', true); run(60); const energy2 = med.energy;
    // without the research the button is not there
    p.tech.delete('restoration_tech'); med.energy = 100; mar.fx.blind = 1e9; const noTech = Abilities.issue(med, 'restoration', mar, mar.x, mar.y);
    return { noEnergy, issued, after, armed, blind2: mar2.fx.blind, energy2, noTech, stillBlind: mar.fx.blind };`);
  ok('a cast at 10 energy is refused, at 60 accepted (scene check)', out.noEnergy === false && out.issued === true, JSON.stringify([out.noEnergy, out.issued]));
  ok('RESTORATION CLEARS ensnare, plague, blind, irradiate, maelstrom, parasite and acid spores on the target', out.after.ensnare === 0 && out.after.plague === 0 && out.after.blind === 0 && out.after.irradiate === 0 && out.after.maelstrom === 0 && out.after.parasite === undefined && out.after.spores === 0, JSON.stringify(out.after));
  ok('...and the Medic paid 50 energy for it', out.after.energy < 12, String(out.after.energy));
  ok('ARMED (right-click the button), the Medic restores a blinded ally on her own and pays for it', out.armed === true && out.blind2 === 0 && out.energy2 < 55, JSON.stringify([out.armed, out.blind2, out.energy2]));
  ok('without the research it cannot be cast at all (negative control for the gate)', out.noTech === false && out.stillBlind > 1e8, JSON.stringify([out.noTech, out.stillBlind]));
}

// ============================================================================
// 2. Optical Flare
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); p.tech.add('optical_flare_tech'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const ov = sp('overlord', 1, x + 40, y); const med = sp('medic', 0, x, y); med.energy = 100; run(3);
    const before = { sight: ov.sight, det: ov.isDetector };
    const issued = Abilities.issue(med, 'optical_flare', ov, ov.x, ov.y); run(10);
    return { issued, before, blind: ov.fx.blind, sight: ov.sight, det: ov.isDetector, energy: med.energy };`);
  ok('an Overlord sees nine tiles and detects before the flare (scene check)', out.before.sight === 9 && out.before.det === true, JSON.stringify(out.before));
  ok('OPTICAL FLARE blinds it for the game: sight two, no longer a detector', out.issued && out.blind > 1e8 && out.sight === 2 && out.det === false, JSON.stringify(out));
  ok('...for 75 of the Medic\'s energy', out.energy < 27, String(out.energy));
}

// ============================================================================
// 3. Lockdown
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); p.tech.add('lockdown_tech'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const tk = sp('siege_tank', 1, x + 5 * TILE, y); const g = sp('ghost', 0, x, y); g.energy = 200; run(3);
    tk.setOrder({ type: 'move', x: tk.x + 8 * TILE, y: tk.y });
    const issued = Abilities.issue(g, 'lockdown', tk, tk.x, tk.y);
    let at = null; for (let i = 0; i < 60 && at === null; i++) { G.tick(); if (tk.fx.lockdown > 0) at = i; }
    const x0 = tk.x, y0 = tk.y, energy = g.energy; run(50);
    const moved = distPt(x0, y0, tk.x, tk.y);
    // a biological target: refused, refunded, and told why
    const z = sp('zergling', 1, x + 3 * TILE, y + 40); g.energy = 200; run(3);
    const bio = Abilities.issue(g, 'lockdown', z, z.x, z.y); run(10);
    return { issued, at, lockdown: tk.fx.lockdown, disabled: tk.disabled, moved, energy, bio, zLocked: z.fx.lockdown, refunded: g.energy, told: said(/mechanical/) };`);
  ok('the cast lands within a few frames (scene check)', out.issued && out.at !== null && out.at < 10, JSON.stringify([out.issued, out.at]));
  ok('LOCKDOWN holds a moving Siege Tank still for a thousand frames: disabled, and not a pixel in fifty', out.lockdown > 900 && out.disabled === true && out.moved < 1, JSON.stringify({ lockdown: out.lockdown, disabled: out.disabled, moved: out.moved.toFixed(1) }));
  ok('...for 100 energy', out.energy < 102, String(out.energy));
  ok('on a Zergling it is refused with its energy back and a sentence naming why', out.bio === true && !(out.zLocked > 0) && out.refunded > 195 && out.told === true, JSON.stringify([out.bio, out.zLocked, out.refunded, out.told]));
}

// ============================================================================
// 4. Defensive Matrix
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const mar = sp('marine', 0, x, y); const sv = sp('science_vessel', 0, x + 60, y); sv.energy = 200;
    const z = sp('zergling', 1, x + 300, y);
    const issued = Abilities.issue(sv, 'defensive_matrix', mar, mar.x, mar.y); run(5);
    const m = mar.fx.matrix && Object.assign({}, mar.fx.matrix);
    const hp0 = mar.hp; G.damage(mar, 30, 'normal', z); const hp1 = mar.hp, left = mar.fx.matrix && mar.fx.matrix.hp;
    G.damage(mar, 300, 'normal', z); const hp2 = mar.hp;
    return { issued, m, hp0, hp1, left, hp2, popped: !mar.fx.matrix, energy: sv.energy };`);
  ok('the matrix is on the Marine: 250 points for 1440 frames (scene check)', out.issued && out.m && out.m.hp === 250 && out.m.t > 1400, JSON.stringify(out.m));
  ok('DEFENSIVE MATRIX soaks a 30-damage hit whole: not a hit point lost, 220 left in the matrix', out.hp1 === out.hp0 && out.left === 220, JSON.stringify([out.hp0, out.hp1, out.left]));
  ok('...a 300-damage hit pops it and only the rest goes through', out.popped === true && out.hp2 < out.hp1 && out.hp0 - out.hp2 < 100, JSON.stringify([out.hp1, out.hp2, out.popped]));
  ok('...for 100 of the Vessel\'s energy', out.energy < 102, String(out.energy));
}

// ============================================================================
// 5. EMP Shockwave
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'P'); p.tech.add('emp_tech'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const ov = sp('overlord', 1, x, y); ov.energy = 150; const ze = sp('zealot', 1, x + 20, y + 20);
    const sv = sp('science_vessel', 0, x - 6 * TILE, y); sv.energy = 200; run(3);
    const before = { energy: ov.energy, sh: ze.sh };
    const issued = Abilities.issue(sv, 'emp', null, x, y); run(6);
    return { issued, before, energy: ov.energy, sh: ze.sh, cost: sv.energy };`);
  ok('an Overlord with 150 energy and a Zealot with full shields stand at the point (scene check)', out.before.energy >= 150 && out.before.energy < 151 && out.before.sh === 60, JSON.stringify(out.before));
  ok('EMP SHOCKWAVE empties both: energy and shields to zero', out.issued && out.energy < 1 && out.sh < 1, JSON.stringify([out.energy, out.sh]));
  ok('...for 100 of the Vessel\'s energy', out.cost < 102, String(out.cost));
}

// ============================================================================
// 6. Yamato Gun
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); p.tech.add('yamato_tech'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const u = wall(1, x + 9 * TILE, y, 'ultralisk'); const bc = sp('battlecruiser', 0, x, y); bc.energy = 200; run(3);
    const hp0 = u.hp; const issued = Abilities.issue(bc, 'yamato', u, u.x, u.y);
    let launched = null, landed = null, channel = 0;
    for (let i = 1; i <= 120 && landed === null; i++) { G.tick(); if (bc.order.type === 'ability' && bc.order.phase === 'channel') channel++; if (launched === null && G.projectiles.some(q => q.kind === 'yamato')) launched = i; if (launched !== null && !G.projectiles.some(q => q.kind === 'yamato')) landed = i; }
    return { issued, channel, launched, landed, lost: hp0 - u.hp, energy: bc.energy };`);
  ok('the Battlecruiser channels for fifty frames and a yamato projectile leaves it (scene check)', out.issued && out.channel >= 48 && out.launched !== null && out.launched >= 50, JSON.stringify(out));
  ok('YAMATO GUN lands 260 explosive on a large target when the projectile arrives', out.landed !== null && out.lost >= 200 && out.lost <= 450, JSON.stringify({ landed: out.landed, lost: out.lost }));
  ok('...for 150 energy, paid when it fires', out.energy < 55, String(out.energy));
}

// ============================================================================
// 7. Parasite
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('Z', 'T'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const mar = sp('marine', 1, x + 3 * TILE, y); const q = sp('queen', 0, x, y); q.energy = 200; run(3);
    const issued = Abilities.issue(q, 'parasite', mar, mar.x, mar.y); run(6);
    const tagged = mar.fx.parasite;
    // carried into the enemy's own base, out of every Zerg eye
    const e = G.players[1]; const [fx, fy] = freeNear(e.startX + 120, e.startY + 120); mar.x = fx; mar.y = fy; mar.px = fx; mar.py = fy; run(3);
    const seen = G.canSee(0, mar), tileVisible = G.visibleAt(0, mar.x, mar.y);
    // ...and the ground around it: a Terran worker next to the parasite is in view too
    const scv = sp('scv', 1, fx + 20, fy); run(3); const scvSeen = G.canSee(0, scv);
    return { issued, tagged, seen, tileVisible, scvSeen, energy: q.energy };`);
  ok('PARASITE tags the Marine with the Queen\'s owner', out.issued && out.tagged === 0, JSON.stringify([out.issued, out.tagged]));
  ok('...and in the enemy base, out of sight of anything Zerg, the Marine and the ground around it are visible to the Zerg player', out.seen === true && out.tileVisible === true && out.scvSeen === true, JSON.stringify([out.seen, out.tileVisible, out.scvSeen]));
  ok('...for 75 energy', out.energy < 127, String(out.energy));
}

// ============================================================================
// 8. Ensnare
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('Z', 'T'); p.tech.add('ensnare_tech'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const mar = sp('marine', 1, x, y); const q = sp('queen', 0, x - 4 * TILE, y); q.energy = 200; run(3);
    const s0 = mar.speed; const issued = Abilities.issue(q, 'ensnare', null, x, y); run(6);
    const s1 = mar.speed, ens = mar.fx.ensnare;
    mar.setOrder({ type: 'move', x: mar.x + 8 * TILE, y: mar.y }); const x0 = mar.x; run(24); const walked = distPt(x0, y0(), mar.x, mar.y);
    function y0() { return y; }
    return { issued, s0, s1, ens, walked, energy: q.energy };`);
  ok('ENSNARE halves the Marine\'s speed for 576 frames', out.issued && out.ens > 550 && out.s1 < out.s0 * 0.6 && out.s1 > 0, JSON.stringify([out.s0, out.s1, out.ens]));
  ok('...and it covers less than two thirds of the ground it would have in a second', out.walked < out.s0 * 24 * 0.66 && out.walked > 10, out.walked.toFixed(1) + ' px against ' + (out.s0 * 24).toFixed(0) + ' unensnared');
  ok('...for 75 energy', out.energy < 127, String(out.energy));
}

// ============================================================================
// 9. Nydus Exit
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('Z', 'T'); const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.spawnsLarva); const def = DATA.buildings.nydus_canal;
    // a legal creep spot for the canal, then one for the exit at least eight tiles from it
    const spot = (far) => { for (let r = 3; r < 14; r++) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const tx = Math.round(hall.x / TILE + Math.cos(a) * r - def.w / 2), ty = Math.round(hall.y / TILE + Math.sin(a) * r * .8 - def.h / 2); if (G.map.canPlace(def, tx, ty, p, G.units, null)) continue; if (far && distPt((tx + 1) * TILE, (ty + 1) * TILE, far.x, far.y) < 8 * TILE) continue; return [tx, ty]; } return null; };
    const a = spot(null); if (!a) return { noSpot: 'canal' };
    const canal = G.placeBuilding(def, a[0], a[1], 0); G.completeBuilding(canal);
    const b = spot(canal); if (!b) return { noSpot: 'exit' };
    const ex = (b[0] + 1) * TILE, ey = (b[1] + 1) * TILE; const n0 = G.units.filter(u => u.alive && u.def.id === 'nydus_canal').length;
    const issued = Abilities.issue(canal, 'nydus_exit', null, ex, ey);
    const exit = G.units.find(u => u.alive && u.def.id === 'nydus_canal' && u !== canal);
    const placed = { n: G.units.filter(u => u.alive && u.def.id === 'nydus_canal').length - n0, linked: !!exit && canal.nydusLink === exit && exit.nydusLink === canal && (canal.nydusNet || []).includes(exit), apart: exit ? distPt(canal.x, canal.y, exit.x, exit.y) / TILE : 0, done: exit && exit.done };
    if (!exit) return { issued, placed };
    G.completeBuilding(exit);
    // a Zergling beside the canal comes out at the exit without walking there
    const [zx, zy] = freeNear(canal.x, canal.y + 2 * TILE); const z = sp('zergling', 0, zx, zy); z.walkDist = 0;
    z.setOrder({ type: 'nydus', target: canal });
    let outAt = null; for (let i = 1; i <= 120 && outAt === null; i++) { G.tick(); if (distPt(z.x, z.y, exit.x, exit.y) < 4 * TILE) outAt = i; }
    return { issued, placed, outAt, walked: z.walkDist / TILE, toExit: distPt(z.x, z.y, exit.x, exit.y) / TILE };`);
  ok('a Nydus Canal stands on creep and there is room for an exit eight tiles off (scene check)', !out.noSpot && out.issued === true, JSON.stringify(out));
  ok('NYDUS EXIT places a second canal at the point, unfinished, and the two are linked both ways', out.placed && out.placed.n === 1 && out.placed.linked === true && out.placed.apart >= 8 && out.placed.done === false, JSON.stringify(out.placed));
  ok('...and a Zergling sent into the canal comes out beside the exit having walked under four tiles', out.outAt !== null && out.walked < 4 && out.toExit < 4, JSON.stringify({ outAt: out.outAt, walked: out.walked && out.walked.toFixed(1), toExit: out.toExit && out.toExit.toFixed(1) }));
}

// ============================================================================
// 10. Feedback
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('P', 'Z'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const ov = sp('overlord', 1, x + 4 * TILE, y); ov.energy = 120; const da = sp('dark_archon', 0, x, y); da.energy = 200; run(3);
    const hp0 = ov.hp; const issued = Abilities.issue(da, 'feedback', ov, ov.x, ov.y); run(6);
    const burned = { energy: ov.energy, lost: hp0 - ov.hp, cost: da.energy };
    const z = sp('zergling', 1, x + 3 * TILE, y + 40); da.energy = 200; run(3);
    const none = Abilities.issue(da, 'feedback', z, z.x, z.y); run(6);
    return { issued, burned, none, zHp: z.hp, refunded: da.energy, told: said(/no energy/) };`);
  ok('FEEDBACK burns the Overlord\'s 120 energy as 120 damage', out.issued && out.burned.energy < 2 && out.burned.lost >= 115 && out.burned.lost <= 125, JSON.stringify(out.burned));
  ok('...for 50 of the Dark Archon\'s', out.burned.cost < 152, String(out.burned.cost));
  ok('on a Zergling, which has no energy, it is refused with the energy back and a sentence', out.none === true && out.zHp === 35 && out.refunded > 195 && out.told === true, JSON.stringify([out.none, out.zHp, out.refunded, out.told]));
}

// ============================================================================
// 11. Maelstrom
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('P', 'T'); p.tech.add('maelstrom_tech'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const z = sp('zergling', 1, x, y); const v = sp('vulture', 1, x + 24, y + 24); const da = sp('dark_archon', 0, x - 3 * TILE, y); da.energy = 200; run(3);
    z.setOrder({ type: 'move', x: x + 8 * TILE, y }); v.setOrder({ type: 'move', x: x + 8 * TILE, y: y + 24 });
    const issued = Abilities.issue(da, 'maelstrom', null, x, y);
    let at = null; for (let i = 0; i < 30 && at === null; i++) { G.tick(); if (z.fx.maelstrom > 0) at = i; }
    const held0 = z.fx.maelstrom, zx = z.x, zy = z.y, vx = v.x, vy = v.y; run(50);
    return { issued, at, held0, held: z.fx.maelstrom, disabled: z.disabled, zMoved: distPt(zx, zy, z.x, z.y), vHeld: v.fx.maelstrom || 0, vMoved: distPt(vx, vy, v.x, v.y), energy: da.energy };`);
  ok('the cast lands within a few frames (scene check)', out.issued && out.at !== null && out.at < 10, JSON.stringify([out.issued, out.at]));
  ok('MAELSTROM holds the Zergling: 144 frames on landing, disabled, not a pixel in fifty', out.held0 >= 140 && out.held > 80 && out.disabled === true && out.zMoved < 1, JSON.stringify({ held0: out.held0, held: out.held, disabled: out.disabled, moved: out.zMoved.toFixed(1) }));
  ok('...and the Vulture beside it, mechanical, walks on untouched', out.vHeld === 0 && out.vMoved > 100, JSON.stringify({ vHeld: out.vHeld, vMoved: out.vMoved.toFixed(1) }));
  ok('...for 100 energy', out.energy < 102, String(out.energy));
}

// ============================================================================
// 12. Disruption Web
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('P', 'T'); p.tech.add('disruption_web_tech'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    // two Marines, each with a target it can hit next to it: one under the web, one six tiles off
    const inW = sp('marine', 1, x, y), wIn = wall(0, x + 20, y - 20, 'overlord');
    const outW = sp('marine', 1, x + 6 * TILE, y), wOut = wall(0, x + 6 * TILE + 20, y - 20, 'overlord');
    const cor = sp('corsair', 0, x - 8 * TILE, y); cor.energy = 200; run(3);
    const issued = Abilities.issue(cor, 'disruption_web', null, x, y); run(4);
    const field = G.fields.find(f => f.kind === 'dweb'); const hpIn = wIn.hp, hpOut = wOut.hp; run(60);
    return { issued, field: !!field, r: field && field.r, t: field && field.t, webbed: inW.fx.dweb, firedIn: inW.lastFire > 0, lostIn: hpIn - wIn.hp, firedOut: outW.lastFire > 0, lostOut: hpOut - wOut.hp, energy: cor.energy };`);
  ok('a web of 2.5 tiles for 576 frames lies on the point (scene check)', out.issued && out.field && out.r === 2.5 && out.t > 500, JSON.stringify([out.issued, out.field, out.r, out.t]));
  ok('DISRUPTION WEB silences the Marine under it: never fires, its target loses nothing in sixty frames', out.webbed > 0 && out.firedOut === true && out.lostOut > 0 && out.firedIn === false && out.lostIn === 0, JSON.stringify({ webbed: out.webbed, firedIn: out.firedIn, lostIn: out.lostIn, firedOut: out.firedOut, lostOut: out.lostOut }));
  ok('...for 125 energy', out.energy < 77, String(out.energy));
}

// ============================================================================
// 13. Build Scarab
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('P', 'T'); const [x, y] = freeNear(p.startX + 200, p.startY + 200); const rv = sp('reaver', 0, x, y);
    const m0 = p.minerals; const issued = Abilities.issue(rv, 'build_scarab'); const queued = rv.prod.length, spent = m0 - p.minerals;
    run(DATA.units.scarab.time + 2);
    const built = rv.scarabs;
    rv.scarabs = 5; const atCap = Abilities.issue(rv, 'build_scarab'); const capQueued = rv.prod.length;
    // armed, the Reaver keeps itself stocked
    const rv2 = sp('reaver', 0, x + 40, y); const m1 = p.minerals; const armed = G.setAutocast([rv2], 'build_scarab', true); run(120);
    return { issued, queued, spent, built, atCap, capQueued, armed, stocked: rv2.scarabs + rv2.prod.length, spent2: m1 - p.minerals };`);
  ok('BUILD SCARAB queues one for 15 minerals and the Reaver has it aboard after its build time', out.issued && out.queued === 1 && out.spent === 15 && out.built === 1, JSON.stringify([out.issued, out.queued, out.spent, out.built]));
  ok('...a sixth is refused without Reaver Capacity', out.atCap === false && out.capQueued === 0, JSON.stringify([out.atCap, out.capQueued]));
  ok('ARMED, a Reaver queues scarabs on its own and pays for them', out.armed === true && out.stocked >= 2 && out.spent2 >= 30, JSON.stringify([out.armed, out.stocked, out.spent2]));
}

// ============================================================================
// 14. Build Interceptor
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('P', 'T'); const [x, y] = freeNear(p.startX + 200, p.startY + 200); const car = sp('carrier', 0, x, y);
    const m0 = p.minerals; const issued = Abilities.issue(car, 'build_interceptor'); const queued = car.prod.length, spent = m0 - p.minerals;
    run(DATA.units.interceptor.time + 2);
    const built = car.interceptors;
    car.interceptors = 4; const atCap = Abilities.issue(car, 'build_interceptor'); const capQueued = car.prod.length;
    const car2 = sp('carrier', 0, x + 60, y); const m1 = p.minerals; const armed = G.setAutocast([car2], 'build_interceptor', true); run(120);
    return { issued, queued, spent, built, atCap, capQueued, armed, stocked: car2.interceptors + car2.prod.length, spent2: m1 - p.minerals };`);
  ok('BUILD INTERCEPTOR queues one for 25 minerals and the Carrier has it aboard after its build time', out.issued && out.queued === 1 && out.spent === 25 && out.built === 1, JSON.stringify([out.issued, out.queued, out.spent, out.built]));
  ok('...a fifth is refused without Carrier Capacity', out.atCap === false && out.capQueued === 0, JSON.stringify([out.atCap, out.capQueued]));
  ok('ARMED, a Carrier queues interceptors on its own and pays for them', out.armed === true && out.stocked >= 2 && out.spent2 >= 50, JSON.stringify([out.armed, out.stocked, out.spent2]));
}

// ============================================================================
// 15. Scarab pathing
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('P', 'T'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const rv = sp('reaver', 0, x, y); rv.scarabs = 1; const t = wall(1, x + 5 * TILE, y); run(3);
    const hp0 = t.hp; rv.setOrder({ type: 'attack', target: t });
    let scarab = null, born = null, died = null, far = 0;
    for (let i = 1; i <= 150 && died === null; i++) { G.tick(); if (!scarab) { scarab = G.units.find(u => u.def.id === 'scarab' && u.parent === rv); if (scarab) born = i; } else { far = Math.max(far, distPt(scarab.x, scarab.y, x, y)); if (!scarab.alive) died = i; } }
    return { born, died, far: far / TILE, lost: hp0 - t.hp, left: rv.scarabs, reached: scarab ? distPt(scarab.x, scarab.y, t.x, t.y) / TILE : null };`);
  ok('the Reaver fires and a Scarab is born, which is the shot (scene check)', out.born !== null && out.left === 0, JSON.stringify([out.born, out.left]));
  ok('THE SCARAB WALKS TO ITS TARGET five tiles off, lands the Reaver\'s hundred, and is spent', out.died !== null && out.far > 3.5 && out.reached < 1.5 && out.lost >= 90, JSON.stringify({ born: out.born, died: out.died, far: out.far && out.far.toFixed(1), reached: out.reached && out.reached.toFixed(2), lost: out.lost }));
}

// ============================================================================
// 16. Interceptors dock, and die with their Carrier
// ============================================================================
{
  const out = R(ctx, `
    const scene = () => { const p = fresh('P', 'T'); const [x, y] = freeNear(p.startX + 200, p.startY + 200); const car = sp('carrier', 0, x, y); car.interceptors = 4; const t = wall(1, x + 6 * TILE, y); run(3); car.setOrder({ type: 'attack', target: t }); let outN = 0; for (let i = 0; i < 80 && outN < 4; i++) { G.tick(); outN = car.launched ? car.launched.filter(ic => ic.alive).length : 0; } return { car, t, outN, aboard: car.interceptors }; };
    // the fight ends: they come home and are counted back aboard
    const a = scene(); G.kill(a.t, null, true); let home = null, first = null, strays = []; const ics0 = a.car.launched.slice();
    for (let i = 1; i <= 300 && home === null; i++) { G.tick(); if (first === null && a.car.interceptors > 0) first = i; if (a.car.interceptors === 4) home = i; }
    for (const ic of ics0) if (ic.alive) strays.push(distPt(ic.x, ic.y, a.car.x, a.car.y).toFixed(2));
    const dock = { outN: a.outN, aboardDuring: a.aboard, first, home, aboard: a.car.interceptors, stillOut: G.units.filter(u => u.alive && u.def.id === 'interceptor' && u.parent === a.car).length, strays, arriveR: Math.max(6, ics0[0].r + a.car.r - 4), dockR: a.car.r };
    // the Carrier dies: every Interceptor out dies with it
    const b = scene(); const ics = b.car.launched.filter(ic => ic.alive); G.kill(b.car, null, true);
    const death = { outN: b.outN, aliveSameFrame: ics.filter(ic => ic.alive).length, n: ics.length, leftInLaunched: b.car.launched.length }; run(2); death.later = G.units.filter(u => u.alive && u.def.id === 'interceptor').length;
    return { dock, death };`);
  ok('four Interceptors are out and none aboard while the Carrier fights (scene check)', out.dock.outN === 4 && out.dock.aboardDuring === 0 && out.death.outN === 4, JSON.stringify([out.dock.outN, out.dock.aboardDuring, out.death.outN]));
  ok('WHEN THE TARGET DIES THEY DOCK: the first is counted back aboard within two seconds', out.dock.first !== null && out.dock.first < 48 && out.dock.aboard >= 3, JSON.stringify({ first: out.dock.first, aboard: out.dock.aboard }));
  // KNOWN RED (a simulation fault found by this suite, left as measured -- see NOTES agent-20 and REVIEW-M17):
  // Unit.moveTo treats "within max(6, r + R - 4) px" of a unit target as arrived (23 px for an Interceptor and
  // its Carrier) and stops moving; Abilities.dockTick docks only at "within R" (22 px). An Interceptor that
  // brakes to a stop in that one-pixel band never docks: measured d = 22.95 px, speed 1.5, motionless for
  // eleven frames, then shoved about by separation and never inside 22 px again in 600 frames. One of four here.
  ok('...ALL FOUR come home, none left flying (RED: one of four hovers in the 22-23 px band for ever; moveTo arrives at ' + out.dock.arriveR + ', dockTick docks at ' + out.dock.dockR + ')', out.dock.home !== null && out.dock.aboard === 4 && out.dock.stillOut === 0, JSON.stringify(out.dock));
  ok('WHEN THE CARRIER DIES THEY ALL DIE WITH IT within a frame (Abilities.interceptTick\'s own guard)', out.death.n === 4 && out.death.later === 0, JSON.stringify(out.death));
  // KNOWN RED (found by this suite, left as measured): G.kill walks `u.launched` with for...of and kills each
  // Interceptor, whose own G.kill splices it out of that same array, so every other one is skipped: two of
  // four are alive on the frame their Carrier dies (dead, alive, dead, alive), and die a frame later.
  ok('...and on the SAME frame, as G.kill\'s loop intends (RED: the loop splices the array it walks; two of four survive the frame)', out.death.aliveSameFrame === 0 && out.death.leftInLaunched === 0, JSON.stringify(out.death));
}

// ============================================================================
// 17. a transport killed with cargo
// ============================================================================
// What the code does (G.kill): a transport's cargo is killed with it, silently -- no death effect, and
// NOT counted in either side's unit tallies; a Bunker's cargo is unloaded first (the isBuilding branch)
// and lives. Asserted as written; the tally is noted in NOTES rather than judged here.
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const ds = sp('dropship', 0, x, y); const a = sp('marine', 0, x, y + 20), b = sp('marine', 0, x + 20, y + 20); const z = sp('zergling', 1, x + 200, y);
    const loaded = G.loadUnit(ds, a) && G.loadUnit(ds, b); G.recomputeSupply(); const sup0 = p.supUsed, lost0 = p.stats.unitsLost, kills0 = z.kills;
    G.kill(ds, z); G.recomputeSupply();
    const trans = { loaded, aAlive: a.alive, bAlive: b.alive, aInside: a.inside, supDrop: sup0 - p.supUsed, lostCounted: p.stats.unitsLost - lost0, killsCredited: z.kills - kills0 };
    // the Bunker: cargo is put outside first and survives
    const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.depot); const def = DATA.buildings.bunker; let bk = null;
    for (let r = 3; r < 30 && !bk; r++) for (let k = 0; k < 24 && !bk; k++) { const an = k / 24 * Math.PI * 2; const tx = Math.round(cc.x / TILE + Math.cos(an) * r - def.w / 2), ty = Math.round(cc.y / TILE + Math.sin(an) * r * .8 - def.h / 2); if (!G.map.canPlace(def, tx, ty, p, G.units, null)) { bk = G.placeBuilding(def, tx, ty, 0); G.completeBuilding(bk); } }
    const foot = u => u.x >= bk.tx * TILE && u.x < (bk.tx + def.w) * TILE && u.y >= bk.ty * TILE && u.y < (bk.ty + def.h) * TILE;
    const m = sp('marine', 0, bk.x, bk.y + 50); const inB = G.loadUnit(bk, m); run(1);   // a tick: the bunker holds its cargo at its own centre
    const wasIn = foot(m); G.kill(bk, z);
    return { trans, bunker: { inB, wasIn, alive: m.alive, inside: m.inside, out: distPt(m.x, m.y, bk.x, bk.y) / TILE, inFoot: foot(m) } };`);
  ok('two Marines are aboard the Dropship (scene check)', out.trans.loaded === true, JSON.stringify(out.trans));
  ok('A DROPSHIP KILLED WITH CARGO KILLS THE CARGO: both Marines dead, nobody left "inside" a wreck, four supply freed', out.trans.aAlive === false && out.trans.bAlive === false && out.trans.aInside === null && out.trans.supDrop === 4, JSON.stringify(out.trans));
  ok('...and as the code stands the cargo\'s deaths are silent: not on the loss tally and no kill credit (pinned as written; see NOTES)', out.trans.lostCounted === 1 && out.trans.killsCredited === 1, JSON.stringify([out.trans.lostCounted, out.trans.killsCredited]));
  ok('a Bunker killed with a Marine inside (held at its centre) puts the Marine outside its footprint, alive', out.bunker.inB === true && out.bunker.wasIn === true && out.bunker.alive === true && out.bunker.inside === null && out.bunker.out < 6 && out.bunker.inFoot === false, JSON.stringify(out.bunker));
}

// ============================================================================
// 18. a worker whose patch mines out
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('T', 'Z'); const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
    for (const w of G.units.filter(u => u.alive && u.owner === 0 && u.def.worker)) G.kill(w, null, true);   // nobody else on the line
    const patches = G.map.resources.filter(r => r.type === 'mineral' && distPt(r.cx, r.cy, cc.x, cc.y) < 14 * TILE).sort((a, b) => distPt(a.cx, a.cy, cc.x, cc.y) - distPt(b.cx, b.cy, cc.x, cc.y));
    const res = patches[0]; res.amount = WORKER_HAUL;   // one trip left in it
    const w = sp('scv', 0, res.cx, res.cy + 2 * TILE); w.setOrder({ type: 'gather', target: res, phase: 'goto' });
    const m0 = p.minerals; let gone = null, deadOrders = 0, onNew = null, secondTrip = null;
    for (let i = 1; i <= 600 && secondTrip === null; i++) {
      G.tick();
      if (gone === null && res.amount <= 0) gone = i;
      if (gone !== null) { if (w.order.type === 'gather' && w.order.target === res) deadOrders++; if (onNew === null && w.order.type === 'gather' && w.order.target !== res && w.order.target.amount > 0) onNew = i; if (p.minerals - m0 > WORKER_HAUL) secondTrip = i; }
    }
    const live = w.order.target && w.order.target.type === 'mineral' ? w.order.target.amount : null;
    // a second worker sent to the patch after it is gone turns to another on its first tick
    const b = sp('scv', 0, cc.x, cc.y + 3 * TILE); b.setOrder({ type: 'gather', target: res, phase: 'goto' }); run(2);
    return { gone, removed: !G.map.resources.includes(res), deadOrders, onNew, secondTrip, live, order: w.order.type, b: { order: b.order.type, retargeted: b.order.target !== res && !!b.order.target && b.order.target.amount > 0 } };`);
  ok('the patch mines out on the first trip and is removed from the map (scene check)', out.gone !== null && out.gone < 300 && out.removed === true, JSON.stringify([out.gone, out.removed]));
  ok('THE WORKER MOVES TO ANOTHER PATCH: never ordered back to the dead one, on a live one within a second, and a second haul lands', out.deadOrders === 0 && out.onNew !== null && out.onNew - out.gone < 30 && out.secondTrip !== null && out.live > 0 && out.order === 'gather', JSON.stringify(out));
  ok('a worker sent to the dead patch turns to a live one on its first tick', out.b.order === 'gather' && out.b.retargeted === true, JSON.stringify(out.b));
}

// ============================================================================
// 19. Infest Command Center
// ============================================================================
{
  const out = R(ctx, `
    const p = fresh('Z', 'T'); const e = G.players[1]; const cc = G.units.find(u => u.alive && u.owner === 1 && u.def.id === 'command_center');
    const q = sp('queen', 0, cc.x + 5 * TILE, cc.y); q.energy = 200; run(3);
    // healthy: refused, and told why
    const healthy = Abilities.issue(q, 'infest', cc, cc.x, cc.y); run(20);
    const refused = { issued: healthy, owner: cc.owner, told: said(/damaged, landed Command Center/) };
    // damaged below half: taken
    cc.hp = cc.maxHp * 0.4; G.recomputeSupply(); const sup0 = e.supMax;
    const issued = Abilities.issue(q, 'infest', cc, cc.x, cc.y); let at = null; for (let i = 1; i <= 60 && at === null; i++) { G.tick(); if (cc.owner === 0) at = i; }
    G.recomputeSupply();
    const trains = cc.owner === 0 ? G.queueUnit(cc, 'infested_terran') : null;
    return { refused, issued, at, owner: cc.owner, def: cc.def.id, maxHp: cc.maxHp, done: cc.done, supLost: sup0 - e.supMax, trains, prod: cc.prod.map(it => it.id) };`);
  ok('a healthy Command Center cannot be infested, and the Queen is told why', out.refused.issued === true && out.refused.owner === 1 && out.refused.told === true, JSON.stringify(out.refused));
  ok('INFEST COMMAND CENTER: a hall under half health changes owner and def, a finished Infested Command Center', out.issued && out.at !== null && out.owner === 0 && out.def === 'infested_command_center' && out.maxHp === 1500 && out.done === true, JSON.stringify(out));
  ok('...the Terran loses its ten supply and the Zerg can train Infested Terrans from it', out.supLost === 10 && out.trains === true && out.prod[0] === 'infested_terran', JSON.stringify([out.supLost, out.trains, out.prod]));
}

// ============================================================================
// 20. Personnel Cloaking
// ============================================================================
// test/review17.js section 4 pins the toggle and the decloak gate; this is the effect a player sees.
{
  const out = R(ctx, `
    const p = fresh('T', 'T'); p.tech.add('personnel_cloaking'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const g = sp('ghost', 0, x, y); g.energy = 100; const mar = sp('marine', 1, x + 3 * TILE, y); run(3);
    const seenBefore = G.targetable(mar, g);
    const on = Abilities.issue(g, 'cloak_ghost'); const e0 = g.energy; run(12);
    const hidden = !G.targetable(mar, g), drain = e0 - g.energy;
    // an enemy detector arrives and the Ghost is a target again
    const sv = sp('science_vessel', 1, x + 3 * TILE, y - 40); run(3);
    const found = G.targetable(mar, g), detected = G.detected(g, 1);
    return { on, seenBefore, cloaked: g.cloaked, hidden, drain, found, detected };`);
  ok('a Marine can shoot the Ghost before it cloaks (scene check)', out.seenBefore === true, String(out.seenBefore));
  ok('CLOAKED, the Ghost cannot be targeted by the enemy Marine, and its energy drains while it hides (0.15 a frame less regen)', out.on === true && out.cloaked === true && out.hidden === true && out.drain > 1, JSON.stringify(out));
  ok('...until an enemy Science Vessel is in sight of it', out.detected === true && out.found === true, JSON.stringify([out.detected, out.found]));
}


// ============================================================================
// A MORPH IS REFUSED FOR A UNIT INSIDE A TRANSPORT (TODO-M18 item 4's probe)
// ============================================================================
// MEASURED, not supposed: .claude/review/stall-probe.js watched 75 minutes of six-player hard-AI games
// and reported exactly one kind of production slot it could not explain --
//   {"what":"baneling","progress":0,"started":false,"inside":true,"insideOf":"overlord","egg":true}
// frozen for 240+ frames, twice. Unit.tick returns at its `inside` guard BEFORE it reaches
// `if (d.egg) { this.tickProduction(); return; }`, so an egg in a transport never develops: the unit is
// out of the game and the money is spent for as long as the ride lasts. The AI had morphed a Zergling
// that was riding in an Overlord, and would have gone on picking the same one every think.
{
  const out = R(ctx, `
    const p = fresh('Z', 'T'); p.tech.add('volatile_bile'); const [x, y] = freeNear(p.startX + 200, p.startY + 200);
    const ov = sp('overlord', 0, x, y); p.tech.add('ventral_sacs');
    const z = sp('zergling', 0, x + 40, y); run(2);
    G.loadUnit(ov, z); run(2);
    const loaded = !!z.inside && ov.cargo.includes(z);
    const min0 = p.minerals, gas0 = p.gas;
    const refused = Abilities.morph(z, 'baneling');
    // read the purse IMMEDIATELY: the workers are still mining, so 120 frames of anything makes the
    // difference a measure of the economy rather than of the refusal.
    const spent = (min0 - p.minerals) + (gas0 - p.gas);
    run(120);
    const told = said(/inside a transport/i);
    // ...and OUT of the transport it morphs and the egg actually develops, which is the half that must
    // not break: a check that only proved the refusal would pass with morph deleted entirely.
    G.unloadCargo(ov, z); run(6);
    const outNow = !z.inside;
    const ok2 = Abilities.morph(z, 'baneling');
    const eggAt0 = G.units.filter(u => u.alive && u.owner === 0 && u.def.egg).map(u => u.prod.length ? Math.round(u.prod[0].progress) : -1);
    run(120);
    const eggAfter = G.units.filter(u => u.alive && u.owner === 0 && u.def.egg).map(u => u.prod.length ? Math.round(u.prod[0].progress) : -1);
    run(400);
    const banelings = G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'baneling').length;
    return { loaded, refused, told, spent, outNow, ok2, eggAt0, eggAfter, banelings };`);
  ok('a Zergling really is inside the Overlord (scene check)', out.loaded === true, JSON.stringify(out.loaded));
  ok('A MORPH IS REFUSED FOR A UNIT INSIDE A TRANSPORT, and nothing is charged for it -- the egg would have sat at progress 0 until it was unloaded, because Unit.tick returns at its inside guard before an egg ever reaches tickProduction (measured: two frozen baneling cocoons in 75 minutes of AI games)', out.refused === false && out.spent === 0, JSON.stringify({ refused: out.refused, spent: out.spent }));
  ok('...and the player is told why rather than the click doing nothing', out.told === true, String(out.told));
  ok('...while the SAME Zergling unloaded morphs normally and its egg develops and hatches', out.outNow === true && out.ok2 === true && out.eggAfter[0] > out.eggAt0[0] && out.banelings === 1, JSON.stringify({ outNow: out.outNow, ok2: out.ok2, eggAt0: out.eggAt0, eggAfter: out.eggAfter, banelings: out.banelings }));
}

// ============================================================================
// 21. Siege Mode costs its forty frames going IN as well as coming out
// ============================================================================
// SCAN-M18 A2.13. Siege Mode sets `sieged` and `transT` in one statement, and weaponFor tested `sieged`
// FIRST -- so on the way down the sieged branch shadowed the lockout on the next line and the tank fired
// on frame 3 of its own forty-frame deployment (measured: 37 frames still on the clock, 143 damage
// already done). Standing up was always right, because it clears `sieged` and leaves only the lockout to
// match, which is why two adjacent lines could look symmetrical while only one half was paid. The scene
// check is the third arm: a tank ALREADY dug in, given no cast, must fire almost at once, or the two
// checks above it would pass on a tank that simply could not reach.
{
  const scene = (startSieged, cast) => R(ctx, `
    const p = fresh('T', 'T'); p.tech.add('siege_tech');
    const b = G.map.bases[0];
    const [x, y] = freeNear((b.x + 8) * TILE, (b.y + 8) * TILE);
    const tk = sp('siege_tank', 0, x, y);
    const tgt = wall(1, x + 6 * TILE, y, 'marine');           // six tiles: inside SIEGE_W's 12 and past its minRange 2
    tk.sieged = ${startSieged}; tk.transT = 0; tk.order = { type: '${startSieged ? 'hold' : 'idle'}' };
    const hp0 = tgt.hp;
    const issued = ${cast} ? Abilities.issue(tk, 'siege_mode') : null;
    const armedAtCast = !!tk.weaponFor(tgt);
    let first = null, left = null;
    for (let f = 1; f <= 200; f++) { run(1); if (first === null && tgt.hp < hp0) { first = f; left = tk.transT; } }
    return { issued, transT: ${cast} ? ${'MODE_TRANS'} : 0, armedAtCast, first, left, trans: MODE_TRANS };
  `);
  const ready = scene(true, false), going = scene(false, true), coming = scene(true, true);
  ok('a Siege Tank already dug in, six tiles from a target, opens fire within a few frames (scene check: without this the two below would pass on a tank that could not reach)',
    ready.first !== null && ready.first < 10, JSON.stringify(ready));
  ok('Siege Mode is accepted both ways (scene check)', going.issued === true && coming.issued === true, JSON.stringify([going.issued, coming.issued]));
  ok('A SIEGE TANK DOES NOT FIRE WHILE IT IS DIGGING IN -- the whole forty-frame transition, not three frames of it',
    going.armedAtCast === false && going.first !== null && going.first >= going.trans, JSON.stringify(going));
  ok('...nor while it is standing up, which is the half that always worked',
    coming.armedAtCast === false && (coming.first === null || coming.first >= coming.trans), JSON.stringify(coming));
}

ok('no JS errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
ok('nothing threw inside a tick across every scene', R(ctx, 'return G.tickErrors;') === 0, String(R(ctx, 'return G.tickErrors;')));
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
