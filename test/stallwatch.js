// A PRODUCTION SLOT THAT STOPS FOR NO REASON, WATCHED (ninth session, queue item F). "Some tech gets stuck during research" was
// never reproduced -- tools/stall-probe.js, tools/stall-scenes.js and the user's own replayed game found only rules working --
// so the game now watches its own production queues and names a stall the rules cannot explain (UI.watchStalls).
//   node test/stallwatch.js
//
//   1. the watcher is wired into the game's loop
//   2. a research moving normally is never reported, and neither is one paused under ten seconds
//   3. a research that stops for no reason is reported ONCE after ten seconds: one line naming the building, the item, the
//      progress and everything the rules would look at, on screen, in the console and in localStorage (bw_stall)
//   4. every reason the rules give for waiting keeps it quiet: supply, an add-on building, lifted, unpowered, stasis
//   4b. a research kept waiting twenty seconds for one of those reasons is explained once, in words (a unit waiting on
//      supply is left to the supply alert)
//   5. a replay is not watched, and a stall already reported in the last game is still found in a new one
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const { ok, counts, mkDom, root } = require('./_harness');
const J = v => JSON.stringify(v);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
const store = { bw_net: J({ name: 'Zac', url: '', race: 'R' }), bw_intro: '1' }, warned = [];
const document = mkDom(html), loaded = [];
const c = { console: { log() { }, warn: (...a) => warned.push(a.join(' ')), error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { }, requestAnimationFrame() { }, Image: function () { }, WebSocket: function () { }, navigator: {},
  addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  location: { protocol: 'http:', host: 'x', origin: 'http://x', pathname: '/', search: '' }, history: { replaceState() { } }, document };
c.window = c; c.globalThis = c; vm.createContext(c);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
vm.runInContext('UI.init = () => {}; UI.makeTicker = () => 1; Render.reset = () => {};', c);
for (const fn of loaded) fn();
const R = src => vm.runInContext('(() => {' + src + '})()', c);
// A game with every help a scene needs: money, supply, the computer switched off, and helpers to place and run.
R(`this.scene = (race) => {
  UI.start({ players: [{ race, human: true, name: 'Zac' }, { race: 'T', human: false, difficulty: 'easy', name: 'Bot' }], seed: 5, layout: 'temple' });
  for (const pl of G.players) if (!pl.neutral) pl.ai = null;
  const p = G.players[0]; p.minerals = 100000; p.gas = 100000; p.supMax = 200;
  UI.stallReport = null; p.msgs.length = 0;
  return p;
};
this.hallOf = () => G.units.find(u => u.owner === 0 && u.def.depot);
this.put = (id, dx, dy) => { const h = hallOf(); const b = G.placeBuilding(DATA.buildings[id], h.tx + dx, h.ty + dy, 0); if (b) G.completeBuilding(b); return b; };
this.run = n => { let told = 0; for (let f = 0; f < n; f++) { G.tick(); if (UI.watchStalls()) told++; } return told; };
this.msgs = () => G.players[0].msgs.map(m => m.text || m);`);

console.log('--- 1. wired in ---');
ok(/this\.watchStalls\(\)/.test(R('return UI.loop.toString();')), 'the game\'s loop asks UI.watchStalls every frame it draws', '');

console.log('--- 2. what is not a stall ---');
{
  const r = R(`scene('T'); const a = put('academy', 6, 0); const q = G.queueTech(a, 'stim'); const told = run(600); return { q, told, report: UI.stallReport, progress: a.prod.length ? a.prod[0].progress : 'done' };`);
  ok(r.q === true && r.told === 0 && !r.report, 'a research that is moving is never reported', J(r));
  const s = R(`scene('T'); const a = put('academy', 6, 0); G.queueTech(a, 'stim'); run(48); const real = a.tickProduction; a.tickProduction = () => {}; const told = run(216); a.tickProduction = real; const after = run(240); return { told, after, report: UI.stallReport };`);
  ok(s.told === 0 && s.after === 0 && !s.report, 'one that stops for nine seconds and moves again is not either', J(s));
}

console.log('--- 3. a stall nobody can explain ---');
{
  warned.length = 0;
  const r = R(`scene('T'); const a = put('academy', 6, 0); G.queueTech(a, 'stim'); run(48); a.tickProduction = () => {}; const first = run(260); const report = UI.stallReport; const again = run(480); return { first, again, report, msgs: msgs(), frame: G.frame, id: a.id };`);
  ok(r.first === 1 && r.again === 0, 'a research frozen for ten seconds with no reason is reported, and only once however long it stays frozen', J({ first: r.first, again: r.again }));
  ok(/^\[stall\] build [0-9a-f]{16} at 0:\d\d \(frame \d+\): academy #\d+ tech:stim stuck at \d+\/\d+ for 1\d s; done 1, lifted 0, unpowered 0, morphT 0, addon -, started \d, reserved \d; researching \[stim\]; queue \[tech:stim:\d+\]; supply \d+\/\d+$/.test(r.report || ''),
    'the one line names the build, the time, the building, the item, how far it got, and everything the rules would look at', r.report);
  ok(warned.some(w => w === r.report) && store.bw_stall === r.report, '...and it is in the browser console and kept in localStorage as bw_stall, for the player to copy', J({ warned: warned.length, stored: !!store.bw_stall }));
  ok(r.msgs.some(m => /Academy has not moved Stim Packs on for 1\d seconds, and the game cannot say why/.test(m) || /has not moved .* on for 1\d seconds, and the game cannot say why/.test(m)), 'the player is told on screen, in words, and asked to send the line', J(r.msgs.slice(-2)));
}

console.log('--- 4. every reason the rules give ---');
{
  // post: what the scene must still look like after the run -- each scene proves it really made the situation it names.
  const quiet = (label, setup, post) => {
    const r = R(`const p = scene(${J(label.race)}); ${setup}; const told = run(400); return { told, report: UI.stallReport, held: ${post || 'true'} };`);
    ok(r.told === 0 && !r.report && r.held === true, label.text, J(r));
  };
  quiet({ race: 'T', text: 'a Marine waiting for supply is not a stall' }, `const b = put('barracks', 6, 0); const h = hallOf(); for (let i = 0; i < 6; i++) G.spawnUnit('marine', 0, h.x - 60 + i * 24, h.y + 120); G.recomputeSupply(); if (p.supUsed < p.supMax) throw new Error('setup: supply not full ' + p.supUsed + '/' + p.supMax); b.prod.push({ kind: 'unit', id: 'marine', progress: 0, total: DATA.units.marine.time });`, `b.prod.length >= 1 && b.prod[0].progress === 0`);
  // The real way a slot waits on an add-on: the Machine Shop is started first (G.queueAddon refuses a busy building), then a
  // Vulture is queued, and the Factory holds it until the shop is finished. (A first version wrote a fake `addon` onto the
  // Factory, which the game overwrote, and the check reported a stall that was the test's own doing.)
  quiet({ race: 'T', text: 'production waiting on an add-on still being built is not a stall' }, `const f = put('factory', 6, 0); const started = G.queueAddon(f, 'machine_shop'); f.prod.push({ kind: 'unit', id: 'vulture', progress: 0, total: DATA.units.vulture.time }); if (!started || !f.addon || f.addon.done) throw new Error('setup: no add-on building ' + started);`, `f.prod.length === 1 && f.prod[0].progress === 0 && !!f.addon && !f.addon.done`);
  quiet({ race: 'T', text: 'a lifted building is not a stall' }, `const a = put('academy', 6, 0); G.queueTech(a, 'stim'); a.tickProduction = () => {}; a.lifted = true;`, `a.lifted === true && a.prod.length === 1`);
  quiet({ race: 'P', text: 'an unpowered Protoss building is not a stall' }, `const fg = put('forge', 6, 0); G.queueUpgrade(fg, 'gW') || fg.prod.push({ kind: 'upg', id: 'x', progress: 10, total: 1000, level: 1 }); fg.tickProduction = () => {}; fg.unpowered = true;`, `fg.unpowered === true && fg.prod.length === 1`);
  quiet({ race: 'T', text: 'a building under stasis is not a stall' }, `const a = put('academy', 6, 0); G.queueTech(a, 'stim'); a.tickProduction = () => {}; a.fx.stasis = 99999;`, `a.fx.stasis > 0 && a.prod.length === 1`);
}

console.log('--- 4b. a pause the rules explain, said out loud ---');
{
  // A Forge with no Pylon: the upgrade is accepted, the building goes dark on its first tick, and the upgrade waits for power
  // for as long as there is none -- the shape tools/stall-probe.js found in a 25-minute game on today's code.
  const dark = R(`scene('P'); const fg = put('forge', 6, 0); const q = G.queueUpgrade(fg, 'gW'); if (!fg.prod.length) fg.prod.push({ kind: 'upg', id: 'gW', progress: 0, total: 1000, level: 1 });
    const early = run(400); const before = msgs().filter(m => /stopped researching/.test(m)).length; run(200); const after = msgs().filter(m => /stopped researching/.test(m)); run(600);
    return { q, unpowered: fg.unpowered, early, before, after, later: msgs().filter(m => /stopped researching/.test(m)).length, report: UI.stallReport, progress: fg.prod[0] && fg.prod[0].progress };`);
  ok(dark.unpowered === true && dark.before === 0 && dark.after.length === 1 && /^Forge has stopped researching Ground Weapons: it has no power: a Pylon has to reach it\.$/.test(dark.after[0]) && dark.later === 1 && !dark.report,
    'an upgrade on a Forge with no power is explained once it has waited twenty seconds -- once, and it is not reported as a stall', J(dark));
  const lifted = R(`scene('T'); const a = put('academy', 6, 0); G.queueTech(a, 'stim'); a.tickProduction = () => {}; a.lifted = true; run(600); return msgs().filter(m => /stopped researching/.test(m));`);
  ok(lifted.length === 1 && /Academy has stopped researching Stim Packs: it is lifted off the ground\./.test(lifted[0]), 'a research on a lifted building is explained the same way', J(lifted));
  const supply = R(`const p = scene('T'); const b = put('barracks', 6, 0); const h = hallOf(); for (let i = 0; i < 6; i++) G.spawnUnit('marine', 0, h.x - 60 + i * 24, h.y + 120); G.recomputeSupply(); b.prod.push({ kind: 'unit', id: 'marine', progress: 0, total: DATA.units.marine.time }); run(700); return { said: msgs().filter(m => /stopped/.test(m)), held: b.prod.length === 1 && b.prod[0].progress === 0 };`);
  ok(supply.said.length === 0 && supply.held === true, 'a unit waiting on supply is left to the supply alert that already exists', J(supply));
}

console.log('--- 5. when it does not watch ---');
{
  const replay = R(`scene('T'); const a = put('academy', 6, 0); G.queueTech(a, 'stim'); run(48); a.tickProduction = () => {}; UI.mode = 'replay'; const told = run(400); UI.mode = 'play'; return { told };`);
  ok(replay.told === 0, 'a replay is not watched: it is someone\'s game already played', J(replay));
  // Game one's stall is reported; game two builds the same Academy (same id) and freezes the same research at the same
  // progress, so its watch entry would match the old one on every field but the queue item itself.
  const fresh = R(`scene('T'); const a = put('academy', 6, 0); G.queueTech(a, 'stim'); a.tickProduction = () => {}; const first = run(280); const id = a.id, p1 = a.prod[0].progress;
    scene('T'); const b = put('academy', 6, 0); G.queueTech(b, 'stim'); b.tickProduction = () => {}; const same = b.id === id && b.prod.length === 1 && b.prod[0].progress === p1 && G.frame === 0;
    const early = run(200); const late = run(80); return { first, same, early, late };`);
  ok(fresh.first === 1 && fresh.same === true && fresh.early === 0 && fresh.late === 1, 'a new game starts the watch afresh: the same stall already reported in the last game is still found in this one, in its own ten seconds', J(fresh));
}

const { pass, fail } = counts();
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
