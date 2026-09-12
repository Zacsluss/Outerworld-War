// Multiplayer with more than two humans, and what happens when two of them leave at once.
//
// test/net.js runs two clients plus an AI. Everything below has never been exercised:
//   * four humans in one lockstep game (Net.ready has to wait on three peers, not one)
//   * two players dropping simultaneously (the relay picks a stop frame per player, and every other
//     client has to apply both on the same tick)
//   * two players rejoining -- sequentially, and then at the same moment, which is where the relay's
//     snapshot bookkeeping lives (it was a single `pendingSnap` slot once, and that is the wedge this
//     found; it is a map keyed by request now)
//   * dropping the *host*. HANDOFF says migration "should work by construction" because the relay
//     picks the first non-dropped human; this drops player 0 and checks that the next player really
//     does inherit the host-only powers, and that nobody else has them before or after.
//   * a rejoin into a game old enough to have mined a mineral patch out. Nothing networked has ever
//     run that long: a three-AI game loses its first patch at frame 18732 and test/net.js stops at
//     14400. Game C reaches the state in twenty seconds instead of thirteen minutes.
//
// Three relays on three ports, so a game that wedges cannot take the next one with it.
//
//   node test/net_many.js [frames=3600] [port=8830]     (uses port, port+1, port+2)
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const FRAMES = parseInt(process.argv[2] || '3600'), PORT = parseInt(process.argv[3] || '8830');
if (typeof WebSocket === 'undefined') { console.error('needs Node 22+ (global WebSocket)'); process.exit(2); }

let fails = 0, passes = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (ok) passes++; else fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(cond, ms, what) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what); await sleep(20); } }

function startRelay(port, tag) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_CHEATS: '1', BW_COUNTDOWN: '0', BW_READY: '0' }) });   // god mode through the command stream keeps the humans alive; cheats are off in a network game otherwise. BW_COUNTDOWN=0 for the same reason test/net.js sets it: the start countdown is test/rooms.js section 13's
  s.stdout.on('data', d => { const t = String(d).trim(); if (t) console.log('  [' + tag + '] ' + t.split('\n').join('\n  [' + tag + '] ')); });
  s.stderr.on('data', d => console.log('  [' + tag + ' err] ' + String(d).trim()));
  process.on('exit', () => { try { s.kill(); } catch (e) { } });
  return s;
}

function makeClient(name, race, port, room) {
  const errors = [];
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '', querySelectorAll: () => [] });
  const ctx = {
    console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 2).join(' | ') : String(x)).join(' ')) },
    Math, performance, setTimeout, clearTimeout, setInterval() { return 0; }, WebSocket,
    location: { protocol: 'http:', host: 'localhost:' + port }, localStorage: { getItem() { return null; }, setItem() { } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: null, querySelectorAll: () => [] },
    addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'net'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  // Eight seats whatever the map: this suite plays five players on four-start maps on purpose (see its header), which the
  // lobby would otherwise refuse since the seventh session (test/lobby.js section 7).
  vm.runInContext(`this.__Net = Net; this.__G = G; Net.mapCap = () => 8;
    this.UI = { mode: 'play', net: true, loading: null, menu: null, selection: [], ping() {}, onUnitDied() {}, started: false,
      start(opts) { G.init(opts); G.recording = true; G.log = []; G.pendingCmds = null; G.mission = null; this.started = true; this.opts = opts; } };
    this.step = max => { let n = 0; while (n < max && Net.active && !G.over && Net.ready(G.frame)) { Net.beforeTick(); G.tick(); n++; } return n; };
    this.orderSomething = () => { const mine = G.units.filter(u => u.alive && u.owner === G.human && !u.isBuilding && !u.def.larva && !u.def.egg); if (!mine.length) return;
      const t = mine[(G.frame * 7 + mine[0].id) % mine.length]; t.setOrder({ type: 'move', x: t.x + ((G.frame % 5) - 2) * 60, y: t.y + ((G.frame % 3) - 1) * 60 }); };
    this.waitingOn = () => Net.players.map((p, i) => p.human && !Net.isGone(i, G.frame) && !(Net.inbox[G.frame] || {})[i] ? i : '').join('');`, ctx);
  return {
    name, ctx, errors, race,
    connect() { vm.runInContext(`Net.connect('ws://localhost:${port}/ws', ${JSON.stringify(name)}, ${JSON.stringify(race)}, ${JSON.stringify(room || '')})`, ctx); },
    get Net() { return ctx.__Net; }, get G() { return ctx.__G; },
    frame() { return ctx.__G.frame; }, step(n) { return ctx.step(n); }, order() { ctx.orderSomething(); },
    waiting() { return ctx.waitingOn(); }, kill() { try { ctx.__Net.ws.close(); } catch (e) { } },
  };
}

// Step every client until they all reach `target` (or the game ends). Live clients block on each other,
// which is the point: a deadlock here is the failure this file is looking for.
async function play(clients, target, label, budget = 240000) {
  const t0 = Date.now();
  while (clients.some(c => c.frame() < target && !c.G.over && c.Net.active)) {
    for (const c of clients) if (c.frame() < target) { c.step(30); if (c.frame() % 120 === 0) c.order(); }
    await sleep(0);
    if (Date.now() - t0 > budget) {
      for (const c of clients) console.log('    ' + c.name + ': frame ' + c.frame() + ' ready=' + c.Net.ready(c.frame()) + ' waitingOn=[' + c.waiting() + ']' +
        ' gone=' + JSON.stringify(c.Net.gone) + ' catchingUp=' + c.Net.catchingUp + ' connected=' + c.Net.connected);
      throw new Error('DEADLOCK in ' + label);
    }
  }
}
// The newest frame at which every client has a hash of its own, and whether they all agree there.
function agree(clients, above = -1) {
  const [first, ...rest] = clients;
  const common = Object.keys(first.Net.myHashes).map(Number).filter(f => f > above && rest.every(c => c.Net.myHashes[f] !== undefined)).sort((a, b) => b - a);
  if (!common.length) return { ok: false, why: 'no common hash frame above ' + above };
  const f = common[0], hs = clients.map(c => c.Net.myHashes[f]);
  return { ok: hs.every(h => h === hs[0]), f, hs, n: common.length };
}
const hostId = c => { const L = c.Net.lobby; const h = L && L.players.find(p => p.host); return h ? h.name : null; };

// ============================================================================================
// Game A: four humans + an AI. Two drop together, both rejoin one after the other, then the host
// drops and someone else has to become host.
// ============================================================================================
async function gameA() {
  console.log('\n=== four humans + one AI, port ' + PORT + ' ===========================================');
  startRelay(PORT, 'relay A'); await sleep(700);
  const names = [['Alice', 'T'], ['Bob', 'Z'], ['Carol', 'P'], ['Dave', 'T']];
  const cl = names.map(([n, r]) => makeClient(n, r, PORT));
  const [A, B, C, D] = cl;
  for (let i = 0; i < cl.length; i++) { cl[i].connect(); await until(() => cl[i].Net.connected && cl[i].Net.lobby && cl[i].Net.lobby.players.length === i + 1, 6000, cl[i].name + ' in lobby'); }
  check(cl.every(c => c.Net.lobby.players.length === 4), 'all four clients see a four-player lobby');
  check(hostId(A) === 'Alice' && cl.every(c => hostId(c) === 'Alice'), 'the first player is host, and everyone agrees (' + cl.map(hostId).join(',') + ')');
  A.Net.send({ t: 'addai', race: 'Z', difficulty: 'easy' });
  await until(() => cl.every(c => c.Net.lobby.players.length === 5), 6000, 'AI added');
  // Host-only powers, before any migration. Speed is the safe one to poke: it is in every start and
  // rejoin message but changes only pacing, so a wrong answer cannot desync the check that follows.
  D.Net.send({ t: 'set', speed: 3 }); await sleep(250);
  const speedAfterNonHost = A.Net.lobby.speed;
  A.Net.send({ t: 'set', speed: 2 }); await until(() => A.Net.lobby.speed === 2, 4000, 'host set the speed');
  check(speedAfterNonHost !== 3, 'a non-host cannot change a host-only setting (speed stayed ' + speedAfterNonHost + ')');

  A.Net.send({ t: 'start' }); await until(() => cl.every(c => c.ctx.UI.started), 8000, 'game start');
  const seeds = cl.map(c => c.G.seed), mes = cl.map(c => c.Net.me);
  check(seeds.every(s => s === seeds[0]) && mes.join(',') === '0,1,2,3', 'all four started the same game as players 0-3 (seed ' + seeds[0] + ')');
  check(cl.every(c => c.Net.players.length === 5 && c.G.players.length === 5), 'the AI is player 4 on every client');
  A.G.cheat('power overwhelming'); // every human becomes invulnerable, so the AI cannot end the game

  // ---- phase 1: four-way lockstep
  await play(cl, FRAMES, 'phase 1 (four-way)');
  const a1 = agree(cl);
  check(a1.ok, 'phase 1: all four hashes agree at frame ' + a1.f + ' (' + (a1.hs || []).join('/') + ')');
  check(cl.every(c => !c.Net.desynced), 'phase 1: no client reported a desync');
  check(cl.every(c => c.G.log.length > 10), 'phase 1: every client applied the whole command stream (' + cl.map(c => c.G.log.length).join('/') + ')');

  // ---- phase 2: Bob and Carol drop in the same instant
  const droppedAt = B.frame();
  B.kill(); C.kill();
  console.log('  killed Bob and Carol together, around frame ' + droppedAt);
  await until(() => A.Net.gone[1] && A.Net.gone[2] && D.Net.gone[1] && D.Net.gone[2], 8000, 'both drops announced');
  const stopB = A.Net.gone[1].from, stopC = A.Net.gone[2].from;
  check(D.Net.gone[1].from === stopB && D.Net.gone[2].from === stopC, 'both survivors were given the same stop frames (Bob ' + stopB + ', Carol ' + stopC + ')');
  await play([A, D], FRAMES + 1800, 'phase 2 (two survivors)');
  check(A.frame() >= FRAMES + 1800 && D.frame() >= FRAMES + 1800, 'phase 2: the game kept running with two of four gone (' + A.frame() + '/' + D.frame() + ')');
  const stopped = c => [1, 2].every(p => c.G.log.some(e => e.c.t === 'stopall' && e.c.p === p && e.f === (p === 1 ? stopB : stopC)));
  check(stopped(A) && stopped(D), 'phase 2: both dropped players\' units were stopped on the relay-chosen frames, identically on both survivors');
  const a2 = agree([A, D], FRAMES);
  check(a2.ok, 'phase 2: the two survivors still agree at frame ' + a2.f + ' (' + (a2.hs || []).join('/') + ')');

  // ---- phase 3: both rejoin, one at a time
  const B2 = makeClient('Bob', 'Z', PORT); B2.connect();
  await until(() => B2.ctx.UI.started, 12000, 'Bob rejoin start');
  check(B2.Net.catchingUp && B2.Net.me === 1, 'phase 3: Bob got his slot back (player ' + B2.Net.me + ', ' + Object.keys(B2.Net.inbox).length + ' batches to replay)');
  check(Object.keys(B2.Net.inbox).length < 100 && B2.frame() > FRAMES, 'phase 3: Bob rejoined from a snapshot, not from frame 0 (frame ' + B2.frame() + ')');
  await catchUp(B2, [A, D], 'Bob');
  await play([A, D, B2], A.frame() + 600, 'phase 3a (three live)');

  const C2 = makeClient('Carol', 'P', PORT); C2.connect();
  await until(() => C2.ctx.UI.started, 12000, 'Carol rejoin start');
  check(C2.Net.catchingUp && C2.Net.me === 2, 'phase 3: Carol got her slot back too (player ' + C2.Net.me + ')');
  await catchUp(C2, [A, D, B2], 'Carol');
  const four = [A, D, B2, C2];
  await play(four, A.frame() + 1200, 'phase 3b (all four again)');
  const a3 = agree(four, FRAMES + 1800);
  check(a3.ok, 'phase 3: all four agree again after both rejoined, at frame ' + a3.f + ' (' + (a3.hs || []).join('/') + ')');
  check(four.every(c => !c.Net.desynced), 'phase 3: no desync after two rejoins');

  // ---- phase 4: the host drops
  console.log('  --- dropping the host ---');
  const hostBefore = hostId(D);
  A.kill();
  await until(() => D.Net.gone[0] && B2.Net.gone[0] && C2.Net.gone[0], 8000, 'the host\'s drop announced');
  await until(() => hostId(D) !== null && hostId(D) !== 'Alice', 8000, 'a new host is named');
  const hostAfter = hostId(D);
  check(hostBefore === 'Alice' && hostAfter === 'Bob', 'dropping the host promotes the next surviving human (' + hostBefore + ' -> ' + hostAfter + ')');
  check(B2.Net.lobby.players.find(p => p.host).name === hostAfter && C2.Net.lobby.players.find(p => p.host).name === hostAfter, 'every remaining client is told who the new host is');
  const rest = [D, B2, C2], target4 = D.frame() + 1800;
  await play(rest, target4, 'phase 4 (host gone)');
  check(rest.every(c => c.frame() >= target4), 'phase 4: the game continued without the host to frame ' + target4 + ' (' + rest.map(c => c.frame()).join('/') + ')');
  check(rest.every(c => c.G.log.some(e => e.c.t === 'stopall' && e.c.p === 0 && e.f === D.Net.gone[0].from)), 'phase 4: the host\'s units stopped on the relay-chosen frame on every client');
  const a4 = agree(rest, a3.f || 0);
  check(a4.ok, 'phase 4: the survivors agree after the host left, at frame ' + a4.f + ' (' + (a4.hs || []).join('/') + ')');
  // The promotion has to be real, not cosmetic -- but mid-game there is NO host-only power to prove it
  // with: the relay refuses every `set`, `addai` and `kick` once a game has started, from the host or
  // anyone else, by design. The assertion that used to sit here ("the promoted host's speed change is
  // obeyed") contradicted that rule and was HANDOFF-M16's fourth known red. So this half asserts the
  // rule, promoted host included, and the lobby block after game A proves the promotion with the
  // powers a lobby has. (REVIEW-M17)
  const speedBefore = D.Net.lobby.speed;
  D.Net.send({ t: 'set', speed: 6 }); B2.Net.send({ t: 'set', speed: 4 }); await sleep(400);
  check(rest.every(c => c.Net.lobby.speed === speedBefore), 'phase 4: once the game has started no setting is mutable, from the promoted host or anyone else (' + speedBefore + ' -> ' + rest.map(c => c.Net.lobby.speed).join('/') + ')');

  // ---- phase 5: the old host comes back
  const A2 = makeClient('Alice', 'T', PORT); A2.connect();
  await until(() => A2.ctx.UI.started, 12000, 'Alice rejoin start');
  check(A2.Net.me === 0 && A2.Net.catchingUp, 'phase 5: the dropped host can rejoin its own slot');
  await catchUp(A2, rest, 'Alice');
  const all4 = [A2, D, B2, C2];
  await play(all4, D.frame() + 1200, 'phase 5 (host back)');
  const a5 = agree(all4, a4.f || 0);
  check(a5.ok, 'phase 5: everyone agrees again with the old host back, at frame ' + a5.f + ' (' + (a5.hs || []).join('/') + ')');
  await until(() => hostId(D) === 'Alice', 6000, 'host handed back').catch(() => { });
  check(hostId(D) === 'Alice', 'phase 5: the relay hands the host role back to player 0 on rejoin (' + hostId(D) + ')');

  // a stranger must not be able to walk into a running game
  const stranger = makeClient('Eve', 'T', PORT); stranger.connect();
  await until(() => stranger.Net.lastError, 6000, 'stranger refused').catch(() => { });
  check(/in progress/i.test(stranger.Net.lastError || '') && !stranger.ctx.UI.started, 'a name nobody dropped under is refused mid-game ("' + (stranger.Net.lastError || '') + '")');

  // ---- host migration where host-only powers EXIST: a lobby, in its own room on the same relay ----
  // Every check reads the NON-acting client's lobby, so it measures what the relay broadcast, not local
  // state. Negative control (run by hand): drop the `filter` in leave()'s lobby branch so the dead host
  // stays first in the list -- hostOf() returns Xavier, Yves's `set` is refused, and this block goes red.
  {
    const X = makeClient('Xavier', 'T', PORT, 'HOSTTEST'), Y = makeClient('Yves', 'Z', PORT, 'HOSTTEST'), Z = makeClient('Zoe', 'P', PORT, 'HOSTTEST');
    X.connect(); await until(() => X.Net.lobby, 6000, 'X in the lobby');
    Y.connect(); await until(() => Y.Net.lobby && Y.Net.lobby.players.length === 2, 6000, 'Y in the lobby');
    Z.connect(); await until(() => Z.Net.lobby && Z.Net.lobby.players.length === 3, 6000, 'Z in the lobby');
    check(hostId(Z) === 'Xavier', 'lobby: the first to join is the host (' + hostId(Z) + ')');
    X.kill(); await until(() => hostId(Z) === 'Yves', 6000, 'host promoted in the lobby').catch(() => { });
    check(hostId(Z) === 'Yves', 'lobby: when the host leaves, the next human is promoted (' + hostId(Z) + ')');
    Y.Net.send({ t: 'set', speed: 3 }); await sleep(300);
    check(Z.Net.lobby && Z.Net.lobby.speed === 3, 'lobby: the promoted host\'s speed setting is obeyed, as seen by a third client (' + (Z.Net.lobby && Z.Net.lobby.speed) + ')');
    Z.Net.send({ t: 'set', speed: 5 }); await sleep(300);
    check(Y.Net.lobby && Y.Net.lobby.speed === 3, 'lobby: a non-host\'s speed setting is refused (' + (Y.Net.lobby && Y.Net.lobby.speed) + ')');
    Y.Net.send({ t: 'addai', race: 'T', difficulty: 'easy' }); await sleep(300);
    check(Z.Net.lobby && Z.Net.lobby.players.length === 3 && Z.Net.lobby.players.some(p => p.ai), 'lobby: the promoted host can add a computer player (' + (Z.Net.lobby && Z.Net.lobby.players.length) + ' slots)');
    Z.Net.send({ t: 'addai', race: 'T' }); await sleep(300);
    check(Y.Net.lobby && Y.Net.lobby.players.filter(p => p.ai).length === 1, 'lobby: a non-host cannot add one');
    const zId = Z.Net.id; Y.Net.send({ t: 'kick', id: zId }); await sleep(300);
    check(Y.Net.lobby && !Y.Net.lobby.players.some(p => p.id === zId), 'lobby: the promoted host can kick, and the kicked client leaves the list');
    check(/removed you/i.test(Z.Net.lastError || ''), 'lobby: ...and the kicked client is told why ("' + (Z.Net.lastError || '') + '")');
    Y.kill(); Z.kill();
  }

  const errs = [];
  for (const c of [A, B, C, D, B2, C2, A2, stranger]) for (const e of c.errors) if (!/desync at frame/.test(e)) errs.push(c.name + ': ' + e);
  check(errs.length === 0, 'game A: no JS errors on any client (' + errs.length + ')' + (errs.length ? ' -- ' + errs.slice(0, 3).join(' || ') : ''));
  return { lastFrame: D.frame() };
}

// A rejoining client replays the relay's tail. Everyone else is blocked waiting for its first batch,
// so they have to be stepped too or nothing moves.
async function catchUp(joiner, others, label) {
  const t0 = Date.now(), from = joiner.frame();
  while (joiner.Net.catchingUp) {
    const n = joiner.step(400);
    if (!n && !joiner.Net.ready(joiner.frame())) joiner.Net.catchingUp = false;
    for (const c of others) c.step(30);
    await sleep(0);
    if (Date.now() - t0 > 120000) throw new Error(label + ' rejoin catch-up timeout at frame ' + joiner.frame());
  }
  console.log('  ' + label + ' caught up ' + from + ' -> ' + joiner.frame() + ' in ' + (Date.now() - t0) + ' ms (others at ' + others.map(c => c.frame()).join('/') + ')');
}

// ============================================================================================
// Game B: three humans + an AI, and the case game A deliberately avoided -- two dropped players
// reconnecting in the same instant, before the relay has finished serving the first one a snapshot.
// ============================================================================================
async function gameB() {
  const P = PORT + 1;
  console.log('\n=== three humans, two rejoining at the same moment, port ' + P + ' =================');
  startRelay(P, 'relay B'); await sleep(700);
  const cl = [['Alice', 'T'], ['Bob', 'Z'], ['Carol', 'P']].map(([n, r]) => makeClient(n, r, P));
  const [A, B, C] = cl;
  for (let i = 0; i < cl.length; i++) { cl[i].connect(); await until(() => cl[i].Net.lobby && cl[i].Net.lobby.players.length === i + 1, 6000, cl[i].name + ' in lobby'); }
  A.Net.send({ t: 'addai', race: 'Z', difficulty: 'easy' }); await until(() => cl.every(c => c.Net.lobby.players.length === 4), 6000, 'AI added');
  A.Net.send({ t: 'start' }); await until(() => cl.every(c => c.ctx.UI.started), 8000, 'start');
  A.G.cheat('power overwhelming');
  // Make the one surviving client -- who will be the snapshot donor for both rejoins -- take 300 ms to
  // answer `needsnap`, so the race below is decided by the relay's bookkeeping rather than by loopback
  // latency. 300 ms is not a handicap: test/snapshot.js budgets Snapshot.take at under 400 ms, and this
  // is the value a donor in a long game actually costs.
  vm.runInContext(`const orig = Net.handle.bind(Net);
    Net.handle = m => { if (m.t === 'needsnap') { setTimeout(() => orig(m), 300); return; } return orig(m); };`, A.ctx);
  await play(cl, FRAMES, 'game B phase 1');
  const b1 = agree(cl);
  check(b1.ok, 'game B: three-way lockstep agrees at frame ' + b1.f + ' (' + (b1.hs || []).join('/') + ')');

  B.kill(); C.kill();
  await until(() => A.Net.gone[1] && A.Net.gone[2], 8000, 'both drops announced');
  await play([A], A.frame() + 900, 'game B phase 2 (one survivor)');
  check(A.frame() > FRAMES, 'game B: the last player alone keeps playing (frame ' + A.frame() + ')');

  // Both reconnect back to back, with no wait between them. The relay asks a donor for a snapshot per
  // request; when it kept one `pendingSnap` slot the second join overwrote the first request's bookkeeping,
  // which is the wedge this check exists for.
  const B2 = makeClient('Bob', 'Z', P), C2 = makeClient('Carol', 'P', P);
  B2.connect(); C2.connect();
  console.log('  both reconnected in the same tick of the event loop');
  let started = 0;
  try { await until(() => B2.ctx.UI.started && C2.ctx.UI.started, 20000, 'both rejoins served'); started = 2; }
  catch (e) { started = (B2.ctx.UI.started ? 1 : 0) + (C2.ctx.UI.started ? 1 : 0); }
  check(started === 2, 'two players reconnecting in the same instant both get served a rejoin' +
    (started === 2 ? '' : ' -- only ' + started + ' of 2 did (Bob started=' + B2.ctx.UI.started + ', Carol started=' + C2.ctx.UI.started + '); ' +
      'the relay keeps a single lobby.pendingSnap, so the second join overwrites the first and the donor\'s snapshot is delivered to the wrong requester'));
  if (started === 2) {
    await catchUp(B2, [A, C2], 'Bob');
    await catchUp(C2, [A, B2], 'Carol');
    const live = [A, B2, C2];
    await play(live, A.frame() + 1200, 'game B phase 3 (both back)');
    const b3 = agree(live, FRAMES);
    check(b3.ok, 'game B: all three agree after a simultaneous double rejoin, at frame ' + b3.f + ' (' + (b3.hs || []).join('/') + ')');
    check(live.every(c => !c.Net.desynced), 'game B: no desync after a simultaneous double rejoin');
  } else {
    // The half-rejoined state is the part that matters: the relay has already told everyone that the
    // unserved player is live again from frame R, so every remaining client blocks at R for a batch
    // that is never coming. One lost rejoin kills the game for everyone, not just for the rejoiner.
    const served = B2.ctx.UI.started ? B2 : (C2.ctx.UI.started ? C2 : null);
    if (served) await catchUp(served, [A], served.name).catch(e => console.log('  ' + e.message));
    const R = Math.max(...Object.values(A.Net.gone).map(g => (g.to === Infinity ? 0 : g.to)));
    await play([A], R + 240, 'game B phase 3 (half-rejoined)', 20000).catch(e => console.log('  ' + e.message));
    check(A.frame() >= R + 240, 'game B: the game is not wedged by a rejoin the relay never served -- stuck at frame ' + A.frame() +
      ' where the relay said every player is live again from ' + R + ', waiting on player(s) [' + A.waiting() + ']');
  }
  const errs = [];
  for (const c of [A, B, C, B2, C2]) for (const e of c.errors) if (!/desync at frame/.test(e)) errs.push(c.name + ': ' + e);
  check(errs.length === 0, 'game B: no JS errors on any client (' + errs.length + ')' + (errs.length ? ' -- ' + errs.slice(0, 3).join(' || ') : ''));
}

// ============================================================================================
// Game C: a rejoin into a game that has been going long enough to mine a mineral patch out.
// test/net.js runs 14400 frames and a three-AI game does not lose its first patch until frame 18732,
// so no networked test has ever crossed that line. G.removeResource splices the patch out of
// G.map.resources; Snapshot restores that array positionally into a client that has just re-run
// G.init and therefore has the full list.
//
// Rather than play for thirteen minutes, the state is reached in twenty seconds by leaving the patches
// every client is already mining with one trip left. The poke is applied to every client at the same
// frame, from the same predicate over state they already agree on, so lockstep is preserved -- and the
// hash check right after it is there to prove that.
// ============================================================================================
async function gameC() {
  const P = PORT + 2;
  console.log('\n=== two humans, a rejoin after a mineral patch has been mined out, port ' + P + ' =====');
  startRelay(P, 'relay C'); await sleep(700);
  const cl = [['Alice', 'T'], ['Bob', 'Z']].map(([n, r]) => makeClient(n, r, P));
  const [A, B] = cl;
  for (let i = 0; i < cl.length; i++) { cl[i].connect(); await until(() => cl[i].Net.lobby && cl[i].Net.lobby.players.length === i + 1, 6000, cl[i].name + ' in lobby'); }
  A.Net.send({ t: 'addai', race: 'Z', difficulty: 'normal' }); await until(() => cl.every(c => c.Net.lobby.players.length === 3), 6000, 'AI added');
  A.Net.send({ t: 'start' }); await until(() => cl.every(c => c.ctx.UI.started), 8000, 'start');
  A.G.cheat('power overwhelming');
  await play(cl, FRAMES, 'game C phase 1');

  // line every client up on exactly the same frame, then apply the same thing to each
  const pokeAt = Math.max(...cl.map(c => c.frame())) + 48;
  const t0 = Date.now();
  while (cl.some(c => c.frame() < pokeAt)) { for (const c of cl) if (c.frame() < pokeAt) c.step(1); await sleep(0); if (Date.now() - t0 > 60000) throw new Error('could not line the clients up'); }
  const before = cl.map(c => vm.runInContext('G.map.resources.length', c.ctx));
  for (const c of cl) vm.runInContext('this.poked = 0; for (const r of G.map.resources) if (r.miner && r.miner.alive) { r.amount = 8; this.poked++; }', c.ctx);
  check(cl.every(c => c.frame() === pokeAt) && new Set(cl.map(c => c.ctx.poked)).size === 1 && cl[0].ctx.poked > 0,
    'game C: every client is on frame ' + pokeAt + ' and left the same ' + cl[0].ctx.poked + ' patches with one trip to go');
  await play(cl, pokeAt + 1200, 'game C phase 2');
  const after = cl.map(c => vm.runInContext('G.map.resources.length', c.ctx));
  check(after[0] < before[0] && after.every(n => n === after[0]), 'game C: patches were mined out on every client alike (' + before.join('/') + ' -> ' + after.join('/') + ')');
  const c1 = agree(cl, pokeAt);
  check(c1.ok && !cl.some(c => c.Net.desynced), 'game C: still in lockstep after the patches went (frame ' + c1.f + ', ' + (c1.hs || []).join('/') + ')');

  B.kill();
  await until(() => A.Net.gone[1], 8000, 'Bob\'s drop announced');
  await play([A], A.frame() + 600, 'game C phase 3');
  const B2 = makeClient('Bob', 'Z', P); B2.connect();
  await until(() => B2.ctx.UI.started, 15000, 'Bob rejoin start');
  await catchUp(B2, [A], 'Bob');
  const donorRes = vm.runInContext('G.map.resources.length', A.ctx), joinRes = vm.runInContext('G.map.resources.length', B2.ctx);
  check(joinRes === donorRes, 'game C: the rejoining client has the same resource list as the live one (' + joinRes + ' vs ' + donorRes + ')' +
    (joinRes === donorRes ? '' : '  -- Snapshot.restore (js/snapshot.js) writes the donor\'s shorter list over the head of the rejoiner\'s freshly generated full one'));
  await play([A, B2], A.frame() + 2400, 'game C phase 4');
  const c2 = agree([A, B2], pokeAt + 1200);
  check(c2.ok, 'game C: the rejoined client stays in sync (frame ' + c2.f + ', ' + (c2.hs || []).join('/') + ')');
  check(!A.Net.desynced && !B2.Net.desynced, 'game C: no desync reported after the rejoin' +
    (A.Net.desynced || B2.Net.desynced ? ' -- desync at frame ' + (A.Net.desyncFrame > 0 ? A.Net.desyncFrame : B2.Net.desyncFrame) + ', ' +
      ((A.Net.desyncFrame > 0 ? A.Net.desyncFrame : B2.Net.desyncFrame) - (pokeAt + 1200)) + ' frames or so after the rejoin' : ''));
  // Two lobby-only messages the relay never gates on lobby.state. Checked last, because a map change
  // would poison the rejoins above. Neither is reachable from the UI -- Net.render returns before it
  // draws the map picker or the ADD AI button once a game is running -- but the relay is the authority
  // and takes them from any client that is host.
  const lay0 = A.Net.lobby.layout;
  A.Net.send({ t: 'set', layout: lay0 === 'temple' ? 'valley' : 'temple' }); await sleep(400);
  check(A.Net.lobby.layout === lay0, 'game C: the relay refuses a map change once the game is running (' + lay0 + ' -> ' + A.Net.lobby.layout + ')' +
    (A.Net.lobby.layout === lay0 ? '' : '  -- test/serve.js sendRejoin() builds its message from startMsg(), which reads lobby.layout, so the next player to rejoin loads a different map and Snapshot.restore walks off the end of the new map\'s resource list'));
  const n0 = A.Net.lobby.players.length;
  A.Net.send({ t: 'addai', race: 'Z', difficulty: 'easy' }); await sleep(400);
  check(A.Net.lobby.players.length === n0, 'game C: the relay refuses a new AI slot once the game is running (' + n0 + ' -> ' + A.Net.lobby.players.length + ' slots)' +
    (A.Net.lobby.players.length === n0 ? '' : '  -- test/serve.js case \'addai\' checks isHost but not lobby.state, so lobby.players grows out of step with lobby.started, which every start and rejoin message is built from'));

  const errs = [];
  for (const c of [A, B, B2]) for (const e of c.errors) if (!/desync at frame/.test(e)) errs.push(c.name + ': ' + e);
  check(errs.length === 0, 'game C: no JS errors (' + errs.length + ')' + (errs.length ? ' -- ' + errs.slice(0, 2).join(' || ') : ''));
}

(async () => {
  await gameA();
  await gameB();
  await gameC();
  console.log('\n' + (fails ? 'FAIL' : 'ALL PASS') + '  ' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); console.log('\nFAIL  ' + passes + ' passed, ' + (fails + 1) + ' failed'); process.exit(1); });
