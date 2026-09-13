// SPECTATORS (seventh session, item 2: every lobby RESEARCH-LOBBY.md read has observers, and Beyond All Reason lets anyone
// join a running game to watch it). A spectator is in the ROOM and not in the GAME: no seat, no ready, no command batch
// the lockstep waits for. It receives every player's batches and simulates the same game in the replay viewer's mode
// (commands inert, the whole map in view).
//   node test/spectate.js [frames=1200] [port=8840]      (uses port)
//
//  1. a spectator joins the lobby without a seat: the room counts it apart, START does not wait for it to ready, and
//     the map's seat cap does not count it
//  2. at START it is sent the game as nobody (you -1) and starts it in the observer's mode
//  3. it stays in lockstep: its state hash agrees with both players' at the same frame, and it never desyncs
//  4. it cannot act: a command batch it sends is dropped by the relay, so no client ever applies it
//  5. the players never wait on it: a spectator that stops stepping stalls nobody
//  6. a spectator can join a game that is already running, catches up from a player's snapshot, and then agrees
//  7. a spectator leaving is not a player dropping: nobody's units stop, nothing is announced to the lockstep
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const FRAMES = parseInt(process.argv[2] || '1200', 10), PORT = parseInt(process.argv[3] || '8840', 10);
if (typeof WebSocket === 'undefined') { console.error('needs Node 22+ (global WebSocket)'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
async function until(cond, ms, what) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what); await sleep(20); } }
// BW_CHEATS so the humans can be made invulnerable and the game lasts; the ready check stays ON, because section 1 is
// partly about it.
const relay = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_CHEATS: '1', BW_COUNTDOWN: '0', BW_MSG_RATE: '100000' }) });   // BW_MSG_RATE: headless clients simulate as fast as the CPU allows -- net_many peaked at 670 messages in one second against the relay's cap of 300, which is ten times a browser's (test/serve.js, BASIC INTERNET-PLAY SAFETY)
const relayLog = [];
relay.stdout.on('data', d => relayLog.push(String(d))); relay.stderr.on('data', d => console.log('  [relay err] ' + String(d).trim()));
process.on('exit', () => { try { relay.kill(); } catch (e) { } });

function makeClient(name, race) {
  const errors = [];
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '', querySelectorAll: () => [] });
  const ctx = {
    console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 2).join(' | ') : String(x)).join(' ')) },
    Math, performance, setTimeout, clearTimeout, setInterval() { return 0; }, WebSocket,
    location: { protocol: 'http:', host: 'localhost:' + PORT }, localStorage: { getItem() { return null; }, setItem() { } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: null, querySelectorAll: () => [] },
    addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'net'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  // The same UI stand-in test/net_many.js uses, plus the two things a spectator's start sets: the mode and the view.
  vm.runInContext(`this.__Net = Net; this.__G = G;
    this.UI = { mode: 'play', net: true, loading: null, menu: null, selection: [], viewAll: false, prodOverlay: false, ping() {}, onUnitDied() {}, started: false,
      start(opts) { this.mode = opts.mode || 'play'; G.init(opts); G.recording = this.mode === 'play'; G.log = []; G.pendingCmds = null; G.mission = null; this.started = true; this.opts = opts; } };
    this.step = max => { let n = 0; while (n < max && Net.active && !G.over && Net.ready(G.frame)) { Net.beforeTick(); G.tick(); n++; } return n; };
    this.orderSomething = () => { const mine = G.units.filter(u => u.alive && u.owner === G.human && !u.isBuilding && !u.def.larva && !u.def.egg); if (!mine.length) return;
      const t = mine[(G.frame * 7 + mine[0].id) % mine.length]; t.setOrder({ type: 'move', x: t.x + ((G.frame % 5) - 2) * 60, y: t.y + ((G.frame % 3) - 1) * 60 }); };`, ctx);
  const url = 'ws://localhost:' + PORT + '/ws';
  return {
    name, ctx, errors,
    play(room) { vm.runInContext('Net.connect(' + JSON.stringify(url) + ', ' + JSON.stringify(name) + ', ' + JSON.stringify(race) + ', ' + JSON.stringify(room) + ')', ctx); },
    watch(room) { vm.runInContext('Net.open(' + JSON.stringify(url) + ', ' + JSON.stringify(name) + ', () => Net.join(' + JSON.stringify(room) + ', false, true))', ctx); },
    get Net() { return ctx.__Net; }, get G() { return ctx.__G; }, get UI() { return ctx.UI; },
    frame() { return ctx.__G.frame; }, step(n) { return ctx.step(n); }, order() { ctx.orderSomething(); },
    kill() { try { ctx.__Net.ws.close(); } catch (e) { } },
  };
}
async function play(clients, target, label, budget = 180000) {
  const t0 = Date.now();
  while (clients.some(c => c.frame() < target && !c.G.over && c.Net.active)) {
    for (const c of clients) if (c.frame() < target) { c.step(30); if (!c.Net.spectating && c.frame() % 120 === 0) c.order(); }
    await sleep(0);
    if (Date.now() - t0 > budget) throw new Error('DEADLOCK in ' + label + ': ' + clients.map(c => c.name + '@' + c.frame()).join(' '));
  }
}
function agree(clients, above = -1) {
  const [first, ...rest] = clients;
  const common = Object.keys(first.Net.myHashes).map(Number).filter(f => f > above && rest.every(c => c.Net.myHashes[f] !== undefined)).sort((a, b) => b - a);
  if (!common.length) return { ok: false, why: 'no common hash frame above ' + above };
  const f = common[0], hs = clients.map(c => c.Net.myHashes[f]);
  return { ok: hs.every(h => h === hs[0]), f, hs };
}

(async () => {
  await sleep(600);
  const ROOM = 'WATCH1';
  const A = makeClient('Ada', 'T'), B = makeClient('Ben', 'Z'), S = makeClient('Sam', 'P');
  A.play(ROOM); await until(() => A.Net.lobby, 5000, 'Ada in the lobby');
  B.play(ROOM); await until(() => A.Net.lobby && A.Net.lobby.players.length === 2, 5000, 'Ben in the lobby');
  S.watch(ROOM); await until(() => A.Net.lobby && (A.Net.lobby.specs || []).length === 1, 5000, 'Sam watching');

  // ---- 1. in the lobby ----
  ok(A.Net.lobby.players.length === 2 && A.Net.lobby.specs[0].name === 'Sam' && S.Net.spectating === true && !A.Net.lobby.players.some(p => p.name === 'Sam'),
    'a spectator is in the room and not in a seat, and knows it', JSON.stringify({ players: A.Net.lobby.players.map(p => p.name), specs: A.Net.lobby.specs }));
  // Lost Ruins has four starts (the host's client tells the relay): fill them, and a fifth person can still watch.
  A.Net.send({ t: 'addai', race: 'Z' }); A.Net.send({ t: 'addai', race: 'P' }); await until(() => A.Net.lobby.players.length === 4, 5000, 'the seats filled');
  const S3 = makeClient('Sue', 'T'); S3.watch(ROOM); await until(() => (A.Net.lobby.specs || []).length === 2, 5000, 'Sue watching a full room');
  ok(A.Net.lobby.cap === 4 && A.Net.lobby.players.length === 4 && A.Net.lobby.specs.length === 2, 'a room whose seats are all taken still lets people in to watch', JSON.stringify({ cap: A.Net.lobby.cap, players: A.Net.lobby.players.length, specs: A.Net.lobby.specs.length }));
  S3.kill(); await until(() => A.Net.lobby.specs.length === 1, 5000, 'Sue gone');
  for (const p of A.Net.lobby.players.filter(q => q.ai)) A.Net.send({ t: 'kick', id: p.id }); await until(() => A.Net.lobby.players.length === 2, 5000, 'the seats emptied');
  A.Net.send({ t: 'addai', race: 'Z', difficulty: 'easy' }); await until(() => A.Net.lobby.players.length === 3, 5000, 'AI added');
  B.Net.send({ t: 'set', ready: true }); await until(() => A.Net.lobby.players.find(p => p.name === 'Ben').ready, 5000, 'Ben ready');
  A.Net.send({ t: 'start' });
  await until(() => A.UI.started && B.UI.started && S.UI.started, 8000, 'the start, the spectator never having readied');

  // ---- 2. the start ----
  ok(S.Net.me === -1 && S.UI.mode === 'replay' && S.UI.opts.human === 0 && S.UI.viewAll === true && S.Net.spectating === true,
    'START sends the spectator the game as nobody, and it starts it in the observer\'s mode with the whole map in view', JSON.stringify({ me: S.Net.me, mode: S.UI.mode, human: S.UI.opts.human, viewAll: S.UI.viewAll }));
  ok(A.Net.me === 0 && B.Net.me === 1 && A.UI.mode === 'play' && A.G.seed === S.G.seed && A.Net.players.length === 3 && S.Net.players.length === 3,
    'the players start as players, the same game with the same three slots', JSON.stringify({ a: A.Net.me, b: B.Net.me, seeds: [A.G.seed, S.G.seed] }));
  A.G.cheat('power overwhelming');

  // ---- 3. lockstep ----
  await play([A, B, S], FRAMES, 'phase 1');
  const a1 = agree([A, B, S]);
  ok(a1.ok, 'the spectator\'s state agrees with both players\' at frame ' + a1.f, JSON.stringify(a1));
  ok(![A, B, S].some(c => c.Net.desynced), 'nobody reports a desync', '');

  // ---- 4. it cannot act ----
  const f0 = S.frame();
  S.Net.send({ t: 'cmds', f: f0 + 6, c: [{ t: 'stopall' }, { t: 'cheat', code: 'show me the money' }] });
  await play([A, B, S], FRAMES + 240, 'phase 2');
  const applied = c => c.G.log.filter(e => e.f >= f0 && (e.c.t === 'stopall' || e.c.t === 'cheat'));
  ok(applied(A).length === 0 && applied(B).length === 0 && applied(S).length === 0 && A.G.players[0].minerals === S.G.players[0].minerals,
    'a batch a spectator sends is dropped by the relay: no client applies it', JSON.stringify({ a: applied(A), s: applied(S) }));

  // ---- 5. nobody waits for it ----
  const sFrozen = S.frame();
  await play([A, B], A.frame() + 480, 'phase 3 (spectator stopped stepping)', 60000);
  ok(A.frame() >= sFrozen + 480 && S.frame() === sFrozen, 'the players carry on while the spectator stops stepping: nobody waits on a spectator', JSON.stringify({ a: A.frame(), s: S.frame() }));
  await play([S], A.frame(), 'the spectator catches up');
  await play([A, B, S], A.frame() + 240, 'phase 3b');
  const a3 = agree([A, B, S], sFrozen);
  ok(a3.ok, '...and when it steps again it catches up and still agrees, at frame ' + a3.f, JSON.stringify(a3));

  // ---- 6. joining a game already running ----
  const L = makeClient('Liv', 'Z'); L.watch(ROOM);
  await until(() => L.UI.started, 12000, 'Liv joins a running game to watch');
  ok(L.Net.me === -1 && L.Net.catchingUp && L.UI.mode === 'replay' && Object.keys(L.Net.inbox).length < 100 && L.frame() > FRAMES,
    'a spectator joining a running game is sent it from a player\'s snapshot, not re-simulated from frame 0', JSON.stringify({ me: L.Net.me, frame: L.frame(), batches: Object.keys(L.Net.inbox).length }));
  const t0 = Date.now(); while (L.Net.catchingUp) { const n = L.step(400); if (!n && !L.Net.ready(L.frame())) L.Net.catchingUp = false; A.step(30); B.step(30); S.step(30); await sleep(0); if (Date.now() - t0 > 60000) throw new Error('catch-up timeout'); }
  const lateFrom = L.frame();
  await play([A, B, S, L], A.frame() + 480, 'phase 4');
  const a4 = agree([A, B, S, L], lateFrom);
  ok(a4.ok, 'the late spectator agrees with the players and the first spectator, at frame ' + a4.f, JSON.stringify(a4));

  // ---- 7. a spectator leaving ----
  const goneBefore = JSON.stringify(A.Net.gone);
  S.kill(); await sleep(600);
  await play([A, B, L], A.frame() + 240, 'phase 5');
  ok(JSON.stringify(A.Net.gone) === goneBefore && !A.G.log.some(e => e.c.t === 'stopall') && A.frame() > 0, 'a spectator leaving stops nobody\'s units and the game runs on', JSON.stringify({ gone: A.Net.gone }));
  const a5 = agree([A, B, L], lateFrom + 480);
  ok(a5.ok, 'and the rest still agree, at frame ' + a5.f, JSON.stringify(a5));
  ok([A, B, S, L].every(c => c.errors.length === 0), 'no JS errors on any client', [A, B, S, L].map(c => c.name + ':' + c.errors.length).join(' ') + ' ' + [A, B, S, L].map(c => c.errors[0] || '').join(' | ').slice(0, 300));
  for (const c of [A, B, L]) c.kill();
  await sleep(200);
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { relay.kill(); } catch (x) { } console.log('\nFAIL  ' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });
