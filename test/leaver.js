// A PLAYER WHO LEAVES IS OUT OF THE GAME (tenth session, item 4; the user: "in 2 player human testing, when the one human
// opponent leaves, it does NOT trigger an end game - it should."). Researched: StarCraft II's leaving is "equivalent to
// surrender" and a disconnect gets a vote-to-drop dialog; Brood War marks a leaver defeated and its victory trigger fires.
// Measured before (the user's recorded playtest): Quit to menu closed the socket, the relay called it a drop, the other player
// read "...dropped. Their units stop at 0:51; the game continues." and nobody was ever defeated.
//   node test/leaver.js [port=8912]      (uses port .. port+1)
//
// RELAY (real sockets):
//   1. QUIT: the others are told the player left, and that they are out at the frame their units stop; the seat is not
//      rejoinable by name
//   2. A DROP: told as a drop with the seconds left to rejoin; out once they have passed, at a frame past every batch; a
//      rejoin inside them keeps the player in; a spectator arriving afterwards is told who is out
// CLIENT (the page in a VM, lockstep driven by hand):
//   3. `out` runs the `leave` command at its frame: the player is defeated, their units stand down, and a 1v1 is over with the
//      other side the winner -- in the command log, so a replay ends the same way
//  3b. a drop that runs out of time is told as the drop with its seconds, then once as leaving -- never twice
//   4. a 2v1 whose leaver has an ally still playing goes on
//   5. Quit to menu in a running network game sends `quit` before the socket closes; from a finished game it does not
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { spawn } = require('child_process');
const { ok, counts, mkDom, root } = require('./_harness');
const PORT = parseInt(process.argv[2] || '8912', 10);
const J = v => JSON.stringify(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const servers = [];
function serve(port, env) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port), '3'], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_COUNTDOWN: '0', BW_LOBBY_PING: '60000' }, env || {}) });
  s.out = []; s.stdout.on('data', d => s.out.push(String(d))); s.stderr.on('data', d => console.log('  [relay err] ' + String(d).trim()));
  servers.push(s); return s;
}
process.on('exit', () => { for (const s of servers) { try { s.kill(); } catch (e) { } } });
function client(port) {
  const c = { msgs: [], lobby: null, errors: [] };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'lobby') c.lobby = m; if (m.t === 'error') c.errors.push(m); if (m.t === 'lping') c.send({ t: 'lpong', n: m.n }); };
  c.send = o => { try { c.ws.send(JSON.stringify(o)); } catch (e) { } };
  c.open = new Promise((r, j) => { c.ws.onopen = r; c.ws.onerror = () => j(new Error('socket error on port ' + port)); setTimeout(() => j(new Error('no open within 10 s')), 10000).unref(); });
  c.open.catch(() => { });
  return c;
}
const frames = async (cs, from, to) => { for (const c of cs) for (let f = from; f < to; f++) c.send({ t: 'cmds', f, c: [] }); await sleep(250); };
const got = (c, t) => c.msgs.filter(m => m.t === t);

(async () => {
  if (typeof WebSocket === 'undefined') { console.log('FAIL needs Node 22+ (global WebSocket)'); process.exit(1); }

  console.log('--- 1. quit ---');
  const S1 = serve(PORT, { BW_DROP_OUT_MS: '60000' }); await sleep(500);
  const A = client(PORT), B = client(PORT), X = client(PORT);
  await Promise.all([A.open, B.open, X.open]);
  A.send({ t: 'join', name: 'Ada', race: 'T', create: true, title: 'Leave test' }); await sleep(250);
  const code = A.lobby.room;
  B.send({ t: 'join', name: 'Ben', race: 'Z', room: code, existing: true }); await sleep(250);
  B.send({ t: 'set', ready: true }); await sleep(150); A.send({ t: 'start' }); await sleep(400);
  await frames([A, B], 0, 10);
  A.send({ t: 'quit' }); A.ws.close(); await sleep(400);
  const left = got(B, 'left')[0], out = got(B, 'out')[0];
  ok(left && left.p === 0 && left.quit === true && out && out.p === 0 && out.why === 'quit' && out.f === left.f && left.f >= 10,
    'Ada quits: Ben is told she left, and that she is out at the frame her units stop', J({ left, out }));
  X.send({ t: 'join', name: 'Ada', race: 'T', room: code, existing: true }); await sleep(300);
  ok(!got(X, 'rejoin').length && X.errors.length === 1, '...and her seat cannot be taken back by name: a quit is a surrender', J(X.errors));
  for (const c of [B, X]) try { c.ws.close(); } catch (e) { }
  try { S1.kill(); } catch (e) { }
  await sleep(300);

  console.log('--- 2. a drop ---');
  const S2 = serve(PORT + 1, { BW_DROP_OUT_MS: '1500' }); await sleep(500);
  const C = client(PORT + 1), D = client(PORT + 1), E = client(PORT + 1);
  await Promise.all([C.open, D.open, E.open]);
  C.send({ t: 'join', name: 'Cy', race: 'T', create: true, title: 'Drop test' }); await sleep(250);
  const code2 = C.lobby.room;
  D.send({ t: 'join', name: 'Di', race: 'P', room: code2, existing: true }); E.send({ t: 'join', name: 'Ed', race: 'Z', room: code2, existing: true }); await sleep(250);
  D.send({ t: 'set', ready: true }); E.send({ t: 'set', ready: true }); await sleep(150); C.send({ t: 'start' }); await sleep(400);
  await frames([C, D, E], 0, 12);
  D.ws.close(); await sleep(300);
  const dl = got(C, 'left')[0];
  ok(dl && dl.p === 1 && !dl.quit && dl.grace === 2, 'Di\'s socket goes: told as a drop, with the seconds left to rejoin (1.5 s here, said as 2)', J(dl));
  ok(!got(C, 'out').length, '...and nobody is out yet', J(got(C, 'out')));
  // Ed drops too, and comes back inside the time.
  E.ws.close(); await sleep(300);
  const E2 = client(PORT + 1); await E2.open; E2.send({ t: 'join', name: 'Ed', race: 'Z', room: code2, existing: true }); await sleep(300);
  await frames([C], 12, 30); await sleep(1800);
  const outs = got(C, 'out');
  ok(outs.length === 1 && outs[0].p === 1 && outs[0].why === 'dropped' && outs[0].f >= 30, 'once the time passes Di is out, at a frame past every batch the relay has seen; Ed, who came back in time, is not', J(outs));
  const D2 = client(PORT + 1); await D2.open; D2.send({ t: 'join', name: 'Di', race: 'P', room: code2, existing: true }); await sleep(300);
  ok(outs.length === 1 && !got(D2, 'rejoin').length && D2.errors.length === 1, '...and once out, her seat cannot be taken back by name either', J(D2.errors));
  // A spectator joining a running game waits for a live player's snapshot, and these raw sockets never send one: the relay
  // hands over the history instead after its donor wait (about four seconds).
  const W = client(PORT + 1); await W.open; W.send({ t: 'join', name: 'Wes', race: 'T', room: code2, existing: true, spectate: true });
  for (let i = 0; i < 40 && !got(W, 'rejoin').length && !got(W, 'start').length; i++) await sleep(200);
  const ws = got(W, 'start')[0] || got(W, 'rejoin')[0];
  ok(outs.length === 1 && ws && ws.out && ws.out[1] === outs[0].f, 'a spectator joining afterwards is told who is out, and from when', J(ws && ws.out));
  for (const c of [C, D2, E2, W]) try { c.ws.close(); } catch (e) { }
  try { S2.kill(); } catch (e) { }

  // =========================================================================================== CLIENT
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
  const page = () => {
    const document = mkDom(html), loaded = [];
    function WS(url) { this.url = url; this.readyState = 1; this.sent = []; this.closed = false; }
    WS.prototype.send = function (s) { this.sent.push(JSON.parse(s)); }; WS.prototype.close = function () { this.closed = true; this.readyState = 3; };
    const cx = { console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { }, requestAnimationFrame() { }, Image: function () { }, WebSocket: WS, navigator: {},
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
      localStorage: { getItem: () => null, setItem() { }, removeItem() { } }, location: { protocol: 'http:', host: 'x', origin: 'http://x', pathname: '/', search: '' }, history: { replaceState() { } }, document };
    cx.window = cx; cx.globalThis = cx; vm.createContext(cx);
    for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), cx, { filename: f + '.js' });
    vm.runInContext('UI.init = () => {}; UI.makeTicker = () => 1; Render.reset = () => {};', cx);
    for (const fn of loaded) fn();
    return src => vm.runInContext('(() => {' + src + '})()', cx);
  };
  // Drive the lockstep by hand: every other human's empty batch arrives for every frame until they are gone.
  const DRIVE = `const drive = (to, others) => { let n = 0; while (G.frame < to && n++ < 5000) { const f = G.frame; for (const i of others) { if (Net.isGone(i, f)) continue; if (!Net.inbox[f]) Net.inbox[f] = {}; if (!Net.inbox[f][i]) Net.inbox[f][i] = []; } if (!Net.ready(f)) break; Net.beforeTick(); G.tick(); if (G.over) break; } };`;

  console.log('--- 3. out ends a 1v1 ---');
  {
    const R = page();
    const r = R(`${DRIVE}
      Net.ws = new WebSocket('ws://x/ws'); Net.connected = true;
      Net.startGame({ seed: 5, layout: 'temple', you: 1, delay: 3, players: [{ name: 'Ada', race: 'T', team: 1, human: true }, { name: 'Ben', race: 'Z', team: 2, human: true }] });
      G.recording = true; G.log = [];
      drive(40, [0]);
      Net.handle({ t: 'left', p: 0, f: 48, quit: true }); Net.handle({ t: 'out', p: 0, f: 48, why: 'quit' });
      drive(100, [0]);
      const ada = G.players[0], msgs = G.players[1].msgs.map(m => m.text); this.liveEnd = G.frame;
      return { frame: G.frame, over: G.over, winTeam: G.winTeam, defeated: ada.defeated, left: !!ada.left, logged: G.log.filter(e => e.c.t === 'leave').map(e => e.f + ':' + e.c.p), stopped: G.log.filter(e => e.c.t === 'stopall').map(e => e.f + ':' + e.c.p), said: msgs.filter(t => /left the game/.test(t)) };`);
    ok(r.over === true && r.winTeam === 2 && r.defeated === true && r.left === true && r.frame >= 48 && r.frame <= 72, 'Ada\'s out at frame 48 ends the game within a second (G.tick\'s own victory check), with Ben\'s team the winner', J(r));
    ok(J(r.logged) === J(['48:0']) && J(r.stopped) === J(['48:0']), '...through the command log: her units stood down and she left at that frame, so a replay ends the same way', J({ logged: r.logged, stopped: r.stopped }));
    ok(J(r.said) === J(['Ada has left the game.']), 'Ben is told once, in words, at the frame she is out', J(r.said));
    const rep = R(`const d = Replay.data(); const cmds = G.log.slice(); G.init({ players: d.players, seed: d.seed, layout: d.layout }); G.pendingCmds = { list: cmds.map(e => ({ f: e.f, c: e.c })), i: 0 }; let n = 0; while (!G.over && n++ < 500) G.tick(); return { over: G.over, frame: G.frame, winTeam: G.winTeam, live: this.liveEnd };`);
    ok(rep.over === true && rep.frame === rep.live && rep.winTeam === 2, '...and the replay, re-simulated from its log, ends at the same frame with the same winner', J(rep));
  }

  console.log('--- 3b. a drop that runs out of time ---');
  {
    const R = page();
    const r = R(`${DRIVE}
      Net.ws = new WebSocket('ws://x/ws'); Net.connected = true;
      Net.startGame({ seed: 5, layout: 'temple', you: 1, delay: 3, players: [{ name: 'Ada', race: 'T', team: 1, human: true }, { name: 'Ben', race: 'Z', team: 2, human: true }] });
      drive(30, [0]);
      Net.handle({ t: 'left', p: 0, f: 36, grace: 60 }); drive(50, [0]);
      Net.handle({ t: 'out', p: 0, f: 60, why: 'dropped' }); drive(120, [0]);
      return { over: G.over, said: G.players[1].msgs.map(m => m.text).filter(t => /^Ada /.test(t)) };`);
    ok(r.over === true && r.said.length === 2 && /^Ada dropped\. Their units stop at .*; they have 60 seconds to rejoin\.$/.test(r.said[0]) && r.said[1] === 'Ada has left the game.',
      'Ada drops and does not come back: Ben reads the drop with its seconds, then once that she has left, and the game ends', J(r));
  }

  console.log('--- 4. a leaver\'s ally plays on ---');
  {
    const R = page();
    const r = R(`${DRIVE}
      Net.ws = new WebSocket('ws://x/ws'); Net.connected = true;
      Net.startGame({ seed: 5, layout: 'temple', you: 2, delay: 3, players: [{ name: 'Ada', race: 'T', team: 1, human: true }, { name: 'Cy', race: 'P', team: 1, human: true }, { name: 'Ben', race: 'Z', team: 2, human: true }] });
      drive(30, [0, 1]);
      Net.handle({ t: 'left', p: 0, f: 36, quit: true }); Net.handle({ t: 'out', p: 0, f: 36, why: 'quit' });
      drive(80, [0, 1]);
      return { frame: G.frame, over: G.over, adaOut: G.players[0].defeated, cyIn: !G.players[1].defeated };`);
    ok(r.over === false && r.adaOut && r.cyIn && r.frame >= 80, 'Ada quits a 2v1 while Cy, her ally, still plays: she is out and the game goes on', J(r));
  }

  console.log('--- 5. Quit to menu says so ---');
  {
    const R = page();
    const r = R(`Net.ws = new WebSocket('ws://x/ws'); const sock = Net.ws; Net.connected = true;
      Net.startGame({ seed: 5, layout: 'temple', you: 0, delay: 3, players: [{ name: 'Ada', race: 'T', team: 1, human: true }, { name: 'Ben', race: 'Z', team: 2, human: true }] });
      UI.toMenu(); const quits = sock.sent.filter(m => m.t === 'quit').length, closedAfter = sock.closed;
      Net.ws = new WebSocket('ws://x/ws'); const sock2 = Net.ws; Net.connected = true;
      Net.startGame({ seed: 5, layout: 'temple', you: 0, delay: 3, players: [{ name: 'Ada', race: 'T', team: 1, human: true }, { name: 'Ben', race: 'Z', team: 2, human: true }] });
      G.over = true; UI.toMenu();
      return { quits, closedAfter, afterOver: sock2.sent.filter(m => m.t === 'quit').length };`);
    ok(r.quits === 1 && r.closedAfter === true, 'Quit to menu in a running network game sends quit, then closes the socket', J(r));
    ok(r.afterOver === 0, '...and from a finished game it does not: the game is already decided', J(r));
  }

  const { pass, fail } = counts();
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL the suite threw: ' + (e && e.stack || e)); for (const s of servers) try { s.kill(); } catch (x) { } process.exit(1); });
