// REVIEW-M17 -- every order the interface can issue survives the command log.
//   node test/cmdlog.js
//
// A replay is a seed plus a command log, and a LAN peer is a replay running live, so anything the
// interface can do to the simulation that does not go through CMD is a game that cannot be replayed
// and a peer that quietly diverges. The review found two such things, plus a corner where live and
// restored clients disagreed on one command, plus a log that nothing checked before replaying it:
//
//  1. AUTOCAST ARMING. G.setAutocast was not in CMD.install's wrap list; u.armed is read inside the
//     tick by G.tickAutocast, so a replay of a game with an armed Medic re-ran without the heals.
//     Three reviewers found it independently. Checked two ways: the arm lands in G.log, and a game
//     with a Medic healing a wounded Marine replays to the same state hash from the log alone.
//  2. THE FERRY ROUTE. packOrder kept x/y/tx/ty/phase/unit/abil and nothing else, so a ferry order
//     from the UI packed as {type:'ferry'}, failed apply()'s target-less allow-list, and the ship
//     stayed idle. test/ferry.js used applyOrder, which bypasses the packer, and never noticed.
//  3. A DEAD TARGET. CMD.deref returned a corpse (G.byId never forgets a unit); a rejoiner restored
//     from a snapshot has no unreferenced corpses, so its deref returned null and the two clients
//     disagreed on whether the order was applied. Both drop it now.
//  4. A MALFORMED LOG. An entry without a command threw out of G.tick; an out-of-order frame stalled
//     applyPending so every later command was dropped in silence. UI.startFromLog refuses both with a
//     sentence, on the same path the build stamp uses.
//
// Negative controls, each run by hand with the fix removed: (1) the log check counts zero entries and
// the replay hash differs; (2) the ship's order reads 'idle'; (3) deref returns the corpse; (4) the
// malformed log starts a game (the frame moves) instead of being refused.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + extra : '')); } };

function makeCtx(withUI) {
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '' });
  const ctx = {
    console: { log() { }, warn() { }, error: (...a) => ctx.errors.push(String(a[0] && a[0].message || a[0])) }, errors: [], Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
    localStorage: { getItem() { return null; }, setItem() { } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
    requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, alert(m) { ctx.alerted = m; },
  };
  ctx.window = ctx; vm.createContext(ctx);
  const files = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot'].concat(withUI ? ['render', 'ui'] : []);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  if (withUI) vm.runInContext('UI.ping = () => {}; UI.onUnitDied = () => {}; UI.mode = "play";', ctx);
  return ctx;
}
const R = (c, src) => vm.runInContext('(() => {' + src + '})();', c);
const INIT = `G.init({ players: [{ race: 'T', human: true, name: 'H' }, { race: 'Z', human: false, difficulty: 'easy', name: 'C' }], seed: 11, layout: 'temple' }); G.human = 0; G.recording = true; G.log = [];`;

// ============================================================================
// 1. autocast arming goes through the log, and a game with an armed Medic replays from it
// ============================================================================
{
  const live = makeCtx();
  // the scene: a Medic and a Marine at half health, side by side, nothing else nearby
  const SCENE = `const p = G.players[0]; const med = G.spawnUnit('medic', 0, p.startX + 120, p.startY + 120); const mar = G.spawnUnit('marine', 0, p.startX + 140, p.startY + 120); mar.hp = 10; this.medId = med.id; this.marId = mar.id;`;
  R(live, INIT + SCENE);
  const before = R(live, 'return G.log.length;');
  const armed = R(live, `const med = G.byId.get(this.medId); const r = G.setAutocast([med], 'heal'); return { r, armed: !!(med.armed && med.armed.has('heal')), logged: G.log.length, entry: G.log[G.log.length - 1] };`);
  ok('arming autocast from outside a tick arms the unit', armed.armed === true, JSON.stringify(armed));
  ok('...and lands in the command log as an autocast command', armed.logged === before + 1 && armed.entry && armed.entry.c && armed.entry.c.t === 'autocast' && armed.entry.c.a === 'heal', JSON.stringify(armed.entry));
  ok('...returning the new state, as the card expects', armed.r === true, String(armed.r));
  R(live, 'for (let i = 0; i < 400; i++) G.tick();');
  const liveOut = R(live, `const mar = G.byId.get(this.marId); return { hp: mar.hp, hash: G.stateHash(), log: G.log.slice() };`);
  ok('the armed Medic healed the Marine during the run (the scene is not vacuous)', liveOut.hp > 10, 'marine hp ' + liveOut.hp);

  // the same scene in a fresh context, driven by the log alone
  const rep = makeCtx();
  R(rep, INIT + SCENE);
  rep.__log = liveOut.log;
  R(rep, 'G.recording = false; G.pendingCmds = { list: this.__log, i: 0 }; for (let i = 0; i < 400; i++) G.tick();');
  const repOut = R(rep, `const mar = G.byId.get(this.marId); const med = G.byId.get(this.medId); return { hp: mar.hp, hash: G.stateHash(), armed: !!(med.armed && med.armed.has('heal')) };`);
  ok('the replay armed the Medic from the log', repOut.armed === true);
  ok('...and the replay reaches the same state hash as the live game', repOut.hash === liveOut.hash, repOut.hash + ' vs ' + liveOut.hash + ' (marine hp ' + repOut.hp + ' vs ' + liveOut.hp + ')');

  // an explicit off, the other shape the packer carries
  // guarded so the control (wrap removed, log empty) is a clean red rather than a crash
  const off = R(live, `const med = G.byId.get(this.medId); const n = G.log.length; G.setAutocast([med], 'heal', false); const e = G.log[G.log.length - 1]; return { armed: !!(med.armed && med.armed.has('heal')), on: G.log.length > n && e && e.c ? e.c.on : 'no entry logged' };`);
  ok('an explicit off goes through the log with on:false and disarms', off.armed === false && off.on === false, JSON.stringify(off));
}

// ============================================================================
// 2. a ferry order from the interface survives the packer
// ============================================================================
{
  const c = makeCtx();
  R(c, INIT);
  const out = R(c, `const p = G.players[0]; const ax = p.startX + 6 * TILE, ay = p.startY + 6 * TILE;
    const ship = G.spawnUnit('dropship', 0, ax, ay);
    const r = ship.setOrder({ type: 'ferry', ax, ay, bx: ax + 20 * TILE, by: ay, leg: 'a', since: null });   // exactly what js/ui.js sends
    const e = G.log[G.log.length - 1];
    return { r, type: ship.order.type, packed: e && e.c && e.c.o, leg: ship.order.leg, bx: ship.order.bx };`);
  ok('a ferry order issued through setOrder is applied (not refused as target-less)', out.type === 'ferry' && out.r === true, JSON.stringify({ type: out.type, r: out.r }));
  ok('...and the packed command carries the route', out.packed && out.packed.ax !== undefined && out.packed.bx !== undefined && out.packed.leg === 'a' && 'since' in out.packed, JSON.stringify(out.packed));
  ok('...so the unpacked order has both ends', out.leg === 'a' && out.bx === out.packed.bx, JSON.stringify({ leg: out.leg, bx: out.bx }));
}

// ============================================================================
// 3. a dead unit dereferences to nothing
// ============================================================================
{
  const c = makeCtx();
  R(c, INIT);
  const out = R(c, `const p = G.players[0]; const a = G.spawnUnit('marine', 0, p.startX + 100, p.startY + 100), b = G.spawnUnit('marine', 0, p.startX + 130, p.startY + 100);
    G.kill(a, null, true);
    return { liveRef: CMD.deref('u' + b.id) === b, deadRef: CMD.deref('u' + a.id), stillInById: G.byId.get(a.id) === a };`);
  ok('a live unit dereferences to itself', out.liveRef === true);
  ok('a dead unit dereferences to null, though G.byId still remembers it', out.deadRef === null && out.stillInById === true, JSON.stringify(out));
}

// ============================================================================
// 4. a malformed log is refused before anything starts
// ============================================================================
{
  const u = makeCtx(true);
  R(u, INIT + 'for (let i = 0; i < 60; i++) G.tick(); this.good = Replay.data();');
  // UI.start is replaced by a recorder: what matters is whether startFromLog reaches it, and a real
  // start needs the renderer, which this harness does not load. With the check removed, the malformed
  // logs below reach start() -- a clean red here rather than a crash in Terrain.
  R(u, 'this.startedWith = null; UI.start = opts => { this.startedWith = opts; };');
  const attempt = (label, mutate) => {
    const d = JSON.parse(JSON.stringify(u.good)); mutate(d); u.__d = d; u.alerted = null;
    const r = R(u, 'this.startedWith = null; const r = UI.startFromLog(this.__d, "load"); return { r, started: !!this.startedWith, alerted: this.alerted };');
    ok(label + ' is refused, the game does not start, and the player is told', r.r === false && r.started === false && typeof r.alerted === 'string' && /cannot be loaded/.test(r.alerted), JSON.stringify(r));
  };
  const fine = R(u, 'this.startedWith = null; this.alerted = null; UI.startFromLog(this.good, "load"); return { started: !!this.startedWith, alerted: this.alerted };');
  ok('the recorded log itself reaches start() with no alert (positive control)', fine.started === true && fine.alerted === null, JSON.stringify(fine));
  attempt('a log entry with no command', d => { d.cmds = [{ f: 5 }]; });
  attempt('a log entry with a non-numeric frame', d => { d.cmds = [{ f: 'five', c: { t: 'stop', u: [] } }]; });
  attempt('a log whose frames go backwards', d => { d.cmds = [{ f: 10, c: { t: 'stop', u: [] } }, { f: 5, c: { t: 'stop', u: [] } }]; });
  attempt('a log that is not a list', d => { d.cmds = 'nope'; });
  attempt('a save with no players', d => { d.players = []; });
  const goodCheck = R(u, 'return UI.logError(this.good);');
  ok('the recorded log passes the same check (negative control for the validator)', goodCheck === null, String(goodCheck));
  ok('no JS errors', u.errors.length === 0, u.errors.join(' | '));
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
