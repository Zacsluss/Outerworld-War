// REMATCH AND BACK TO THE LOBBY (ninth session, queue item B; the user: "build this now"). RESEARCH-LOBBY.md section 8 is the
// research: Beyond All Reason's and Zero-K's rooms outlive the match with their settings and everyone unready, while OpenRA
// and StarCraft II throw the room away, Age of Empires II makes a new lobby from an opt-in Rematch, and Forged Alliance
// Forever's Rehost was switched off in 2023.
//   node test/rematch.js [port=8850]      (uses port .. port+1)
//
// RELAY (real sockets against test/serve.js):
//   1. THE END OF A GAME is agreed: one player saying so is not enough, two disagreeing on the frame is not enough
//   2. a player going back after the game is over takes the room back to its lobby -- the same code, title, privacy, map,
//      speed, rules, computer, teams and starts; REMATCH comes in ready, BACK TO LOBBY not; a player still on the end screen
//      is away and not ready; spectators stay; the host who is away hands the room on; the game list shows it open
//   3. START waits for an away player; their own BACK TO LOBBY brings them in (and the host back to them); the rematch starts
//      on the same settings and a new seed
//   4. going back BEFORE the game is over is out of the game, not the room: told to the others as a drop with a stop frame,
//      no more batches relayed, the seat not takeable by name; when the last one in the game goes back, the room is a lobby
//   5. who is left: a player who closed the socket loses the seat, and one back in the lobby may still walk out; players
//      who all DROP while a spectator watches still leave the game for a rejoin by name, as before
// CLIENT (the page in a VM, with the real UI.start):
//   6. the end screen: REMATCH and BACK TO LOBBY online and in single player, BACK TO LOBBY for a spectator, neither for a game
//      from no lobby; Restart keeps them
//   7. Net.backToLobby leaves the game for the lobby on the same socket; UI.reportOver tells the relay once; a lobby arriving
//      while this client is still in the game opens the end screen; the room draws away and back players
//   8. the skirmish lobby: REMATCH is the same room at once on a new seed; BACK TO LOBBY is the room as it was left
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { spawn } = require('child_process');
const { ok, counts, mkDom, root } = require('./_harness');
const PORT = parseInt(process.argv[2] || '8850', 10);
const J = v => JSON.stringify(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const servers = [];
function serve(port, env) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port), '3'], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_COUNTDOWN: '0', BW_LOBBY_PING: '60000' }, env || {}) });
  s.out = []; s.stdout.on('data', d => s.out.push(String(d))); s.stderr.on('data', d => console.log('  [relay err] ' + String(d).trim()));
  servers.push(s); return s;
}
const killAll = () => { for (const s of servers) { try { s.kill(); } catch (e) { } } };
process.on('exit', killAll);
function client(port, tag) {
  const c = { tag, msgs: [], lobby: null, errors: [], sys: [], lobbies: null };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'lobby') c.lobby = m; if (m.t === 'error') c.errors.push(m); if (m.t === 'sys') c.sys.push(m); if (m.t === 'lobbies') c.lobbies = m; if (m.t === 'lping') c.send({ t: 'lpong', n: m.n }); };
  c.send = o => { try { c.ws.send(JSON.stringify(o)); } catch (e) { } };
  c.open = new Promise((r, j) => { c.ws.onopen = r; c.ws.onerror = () => j(new Error('socket error on port ' + port + ' -- is another relay holding it?')); setTimeout(() => j(new Error('no open within 10 s')), 10000).unref(); });
  c.open.catch(() => { });
  c.starts = () => c.msgs.filter(m => m.t === 'start');
  return c;
}
const who = (c, name) => c.lobby && c.lobby.players.find(p => p.name === name);
const frames = async (cs, from, to) => { for (const c of cs) for (let f = from; f < to; f++) c.send({ t: 'cmds', f, c: [] }); await sleep(250); };

(async () => {
  if (typeof WebSocket === 'undefined') { console.log('FAIL needs Node 22+ (global WebSocket)'); process.exit(1); }
  // =========================================================================================== RELAY
  const R1 = serve(PORT); await sleep(500);
  const relaySaid = re => re.test(R1.out.join(''));
  const A = client(PORT, 'Ada'), B = client(PORT, 'Ben'), W = client(PORT, 'Wes'), X = client(PORT, 'Xia');
  await Promise.all([A.open, B.open, W.open, X.open]);
  A.send({ t: 'join', name: 'Ada', race: 'T', create: true, title: 'Rematch test' }); await sleep(250);
  const code = A.lobby ? A.lobby.room : 'NOROOM';
  B.send({ t: 'join', name: 'Ben', race: 'Z', room: code, existing: true }); W.send({ t: 'join', name: 'Wes', race: 'P', room: code, existing: true, spectate: true }); await sleep(250);
  A.send({ t: 'set', layout: 'bloodbath', cap: 4, speed: 3, rules: { bank: 'rich' } }); A.send({ t: 'addai', race: 'P', difficulty: 'hard', style: 'rusher', team: 2 }); await sleep(250);
  const aiId = (A.lobby.players.find(p => p.ai) || {}).id;
  A.send({ t: 'set', id: aiId, start: 3 }); B.send({ t: 'set', start: 1 }); await sleep(200); B.send({ t: 'set', ready: true }); await sleep(200);
  A.send({ t: 'start' }); await sleep(400);
  ok(A.starts().length === 1 && B.starts().length === 1 && W.starts().length === 1, 'setup: Ada hosts Ben, a hard rusher on start 4 and a spectator on Blood Pit at speed 3 with a rich bank, and the game starts', J(A.lobby && A.lobby.players));
  const seed1 = A.starts()[0].seed;
  await frames([A, B], 0, 8);

  console.log('--- 1. the end of a game is agreed ---');
  A.send({ t: 'over', f: 2147483647, team: 1 }); B.send({ t: 'over', f: 2147483647, team: 1 }); await sleep(200);
  ok(!relaySaid(/game over at frame/), 'a report from a frame the room has not reached counts for nothing, even when every player sends it', R1.out.join('').slice(-200));
  A.send({ t: 'over', f: 12, team: 1 }); await sleep(150);
  B.send({ t: 'over', f: 13, team: 1 }); await sleep(200);
  ok(!relaySaid(/game over at frame/), 'one player saying the game is over does not make it over, and two players disagreeing on the frame does not either', R1.out.join('').slice(-200));
  B.send({ t: 'over', f: 12, team: 1 }); await sleep(200);
  ok(relaySaid(/game over at frame 12, agreed by 2 players/), 'when every player still in the game says the same frame, it is over', R1.out.join('').slice(-200));
  ok(!A.sys.some(m => m.ev === 'lobby'), '...and nobody is moved while everyone is still on the end screen', J(A.sys.slice(-3)));

  console.log('--- 2. back to the lobby ---');
  B.send({ t: 'back', ready: true }); await sleep(350);
  const L1 = A.lobby || {};
  ok(L1.state === 'lobby' && L1.room === code && L1.title === 'Rematch test' && L1.listed === true && L1.layout === 'bloodbath' && L1.speed === 3 && L1.rules && L1.rules.bank === 'rich',
    'a player going back after the game is over takes the room back to its lobby: the same code, title, privacy, map, speed and rules', J(L1));
  const ai1 = (L1.players || []).find(p => p.ai);
  ok(ai1 && ai1.difficulty === 'hard' && ai1.style === 'rusher' && ai1.team === 2 && ai1.start === 3 && who(A, 'Ben').start === 1 && who(A, 'Ben').team === who(B, 'Ben').team,
    '...with the same computer, its team and its start, and Ben still on his', J(L1.players));
  ok(who(A, 'Ben').ready === true && !who(A, 'Ben').away && who(A, 'Ada').away === true && who(A, 'Ada').ready === false,
    'REMATCH brings Ben in ready; Ada, still on the end screen, is away and not ready', J(L1.players));
  ok((L1.specs || []).some(s => s.name === 'Wes'), 'the spectator is still a spectator', J(L1.specs));
  ok(A.sys.some(m => m.ev === 'back' && m.name === 'Ben' && m.ready === true) && A.sys.some(m => m.ev === 'lobby' && J(m.away) === J(['Ada'])),
    'the room is told: Ben is back for a rematch, the game is over, Ada is still on the end screen', J(A.sys.slice(-4)));
  ok(who(A, 'Ben').host === true && who(A, 'Ada').host === false && A.sys.some(m => m.ev === 'host' && m.name === 'Ben'), 'the host, away, hands the room to the first player back, and the room is told', J(L1.players));
  X.send({ t: 'list' }); await sleep(200);
  const row = X.lobbies && X.lobbies.rooms.find(r => r.code === code);
  ok(row && row.state === 'lobby' && row.players === 3, 'the game list shows the room open again, with its three slots', J(row));

  console.log('--- 3. the rematch ---');
  B.send({ t: 'start' }); await sleep(300);
  const refused = B.errors.pop();
  ok(B.starts().length === 1 && refused && /Ada/.test(refused.msg), 'START waits for a player still on the end screen, and names her', J(refused));
  A.send({ t: 'back' }); await sleep(250);
  ok(!who(B, 'Ada').away && who(B, 'Ada').ready === false && who(B, 'Ada').host === true && B.sys.some(m => m.ev === 'host' && m.name === 'Ada'),
    'BACK TO LOBBY brings Ada in, not ready -- and first in the room, she hosts it again, and the room is told', J(B.lobby.players));
  A.send({ t: 'start' }); await sleep(400);
  const s2 = A.starts()[1];
  ok(s2 && s2.seed !== seed1 && s2.layout === 'bloodbath' && s2.speed === 3 && s2.rules.bank === 'rich' && s2.players.find(p => !p.human).style === 'rusher' && s2.players.find(p => p.name === 'Ben').start === 1 && B.starts().length === 2,
    'the rematch starts on the same settings and a new seed', J(s2));

  console.log('--- 4. back before the game is over ---');
  await frames([A, B], 0, 6);
  const lefts = A.msgs.filter(m => m.t === 'left').length;
  B.send({ t: 'back' }); await sleep(300);
  const left = A.msgs.filter(m => m.t === 'left')[lefts];
  ok(B.lobby.state === 'playing' && who(B, 'Ben').back === true && left && left.back === true && left.p === 1 && left.f >= 3,
    'going back before the game is over is out of the game, not the room: the others are told as for a drop, with the frame his units stop at, and play on', J({ state: B.lobby.state, left }));
  const relayed = A.msgs.filter(m => m.t === 'cmds' && m.p === 1).length;
  B.send({ t: 'cmds', f: 6, c: [] }); await sleep(200);
  ok(A.msgs.filter(m => m.t === 'cmds' && m.p === 1).length === relayed, 'a player back in the lobby sends the game nothing more: his batches are not relayed', relayed);
  const S = client(PORT, 'Imp'); await S.open; S.send({ t: 'join', name: 'Ben', race: 'Z', room: code, existing: true }); await sleep(250);
  ok(S.errors.some(e => /no dropped player is called Ben/.test(e.msg)), '...and nobody can take the seat of a player back in the lobby by joining under his name', J(S.errors));
  try { S.ws.close(); } catch (e) { }
  const lobbyLines = A.sys.filter(m => m.ev === 'lobby').length;
  W.send({ t: 'back' }); await sleep(200);
  ok(A.sys.filter(m => m.ev === 'lobby').length === lobbyLines && who(A, 'Ada') && !who(A, 'Ada').back, 'a spectator going back changes nothing in the game', J(A.lobby.players));
  A.send({ t: 'back' }); await sleep(350);
  ok(A.lobby.state === 'lobby' && !who(A, 'Ada').away && !who(A, 'Ben').away && who(A, 'Ada').ready === false && who(A, 'Ben').ready === false,
    'when the last player in the game goes back too, the room is its lobby again before anyone said the game was over, with nobody away and nobody ready', J(A.lobby.players));
  for (const c of [A, B, W, X]) try { c.ws.close(); } catch (e) { }
  await sleep(200);

  console.log('--- 5. who is left ---');
  const R2 = serve(PORT + 1, { BW_READY: '0' }); await sleep(500);
  const P = PORT + 1;
  const C = client(P, 'Cy'), D = client(P, 'Di'), E = client(P, 'Eve'); await Promise.all([C.open, D.open, E.open]);
  for (const [c, n] of [[C, 'Cy'], [D, 'Di'], [E, 'Eve']]) { c.send({ t: 'join', name: n, race: 'T', room: 'WHOLEFT' }); await sleep(150); }
  C.send({ t: 'start' }); await sleep(400);
  await frames([C, D, E], 0, 6);
  D.ws.close(); await sleep(300);
  C.send({ t: 'back' }); await sleep(250);
  E.send({ t: 'over', f: 9 }); await sleep(350);
  ok(C.lobby.state === 'lobby' && !who(C, 'Di') && who(C, 'Cy') && !who(C, 'Cy').away && who(C, 'Eve').away === true,
    'a player who closed the socket loses the seat; the one still on the end screen keeps hers, away -- and the game ended the moment its last player in it said so', J(C.lobby.players));
  C.ws.close(); E.ws.close(); await sleep(200);
  const F = client(P, 'Fay'), H = client(P, 'Gus'), I = client(P, 'Hal'); await Promise.all([F.open, H.open, I.open]);
  F.send({ t: 'join', name: 'Fay', race: 'T', room: 'LEAVEBACK' }); await sleep(150); H.send({ t: 'join', name: 'Gus', race: 'Z', room: 'LEAVEBACK' }); await sleep(150);
  I.send({ t: 'join', name: 'Hal', race: 'P', room: 'LEAVEBACK', spectate: true }); await sleep(150);
  F.send({ t: 'start' }); await sleep(400);
  await frames([F, H], 0, 6);
  F.send({ t: 'back' }); await sleep(200); F.send({ t: 'leave' }); await sleep(300);
  ok(F.lobbies && Array.isArray(F.lobbies.rooms), 'a player back in the lobby can still walk out of the room while the game runs', J(F.lobbies));
  H.send({ t: 'back' }); await sleep(350);
  ok(H.lobby.state === 'lobby' && !who(H, 'Fay') && who(H, 'Gus') && (H.lobby.specs || []).some(s => s.name === 'Hal'), '...and when the room is a lobby again, her seat is gone and the spectator is still watching', J(H.lobby));
  H.ws.close(); I.ws.close(); F.ws.close(); await sleep(200);
  const K = client(P, 'Kim'), M = client(P, 'Max'), N = client(P, 'Ned'); await Promise.all([K.open, M.open, N.open]);
  K.send({ t: 'join', name: 'Kim', race: 'T', room: 'DROPS' }); await sleep(150); M.send({ t: 'join', name: 'Max', race: 'Z', room: 'DROPS' }); await sleep(150);
  N.send({ t: 'join', name: 'Ned', race: 'P', room: 'DROPS', spectate: true }); await sleep(150);
  K.send({ t: 'start' }); await sleep(400);
  await frames([K, M], 0, 6);
  K.ws.close(); M.ws.close(); await sleep(400);
  const K2 = client(P, 'Kim again'); await K2.open; K2.send({ t: 'join', name: 'Kim', race: 'T', room: 'DROPS' }); await sleep(600);
  ok(N.lobby.state === 'playing' && K2.msgs.some(m => m.t === 'rejoin'), 'players who all DROP while a spectator watches leave the game running, and one can still rejoin it by name, as before', J({ state: N.lobby.state, got: K2.msgs.map(m => m.t) }));
  for (const c of [K2, N]) try { c.ws.close(); } catch (e) { }
  killAll();

  // =========================================================================================== CLIENT
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
  const SRC = {}; for (const f of FILES) SRC[f] = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
  function page() {
    const store = { bw_net: J({ name: 'Zac', url: '', race: 'R' }), bw_intro: '1' };
    const document = mkDom(html), loaded = [], sockets = [];
    function WebSocket(url) { this.url = url; this.readyState = 1; this.sent = []; this.closed = false; sockets.push(this); }
    WebSocket.prototype.send = function (s) { this.sent.push(JSON.parse(s)); };
    WebSocket.prototype.close = function () { this.closed = true; this.readyState = 3; };
    const c = {
      console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { },
      requestAnimationFrame() { }, Image: function () { }, WebSocket, navigator: {},
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
      localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
      location: { protocol: 'http:', host: 'play.example:8765', origin: 'http://play.example:8765', pathname: '/', search: '' }, history: { replaceState() { } }, document, __started: [],
    };
    c.window = c; c.globalThis = c; vm.createContext(c);
    for (const f of FILES) vm.runInContext(SRC[f], c, { filename: f + '.js' });
    // The real UI.start, with the two things a page without a canvas cannot do stubbed: the draw reset and the timer Worker.
    vm.runInContext('UI.init = () => {}; UI.makeTicker = () => 1; Render.reset = () => {}; const realStart = UI.start; UI.start = function (o) { __started.push(JSON.parse(JSON.stringify(o))); return realStart.call(this, o); };', c);
    for (const fn of loaded) fn();
    return { c, document, sockets, store, $: id => document.getElementById(id), R: src => vm.runInContext('(() => {' + src + '})()', c) };
  }
  const labels = r => (r || []).map(x => x[0]);

  console.log('--- 6. the end screen ---');
  {
    const p = page();
    const net = p.R('Net.connected = true; Net.ws = new WebSocket("ws://x/ws"); Net.startGame({ seed: 5, layout: "temple", you: 0, delay: 3, players: [{ name: "Zac", race: "T", team: 1, human: true }, { name: "Bo", race: "Z", team: 2, human: true }] }); UI.menu = "over"; return { from: UI.fromLobby, items: UI.menuItems().items.map(x => x[0]) };');
    ok(net.from === 'net' && J(net.items.slice(0, 2)) === J(['Rematch', 'Back to lobby']) && !net.items.includes('Restart this game'), 'an online game\'s end screen starts with REMATCH and BACK TO LOBBY (and still has no Restart)', J(net));
    const spec = p.R('Net.startGame({ seed: 5, layout: "temple", you: -1, delay: 3, players: [{ name: "Zac", race: "T", team: 1, human: true }, { name: "Bo", race: "Z", team: 2, human: true }] }); UI.menu = "over"; const over = UI.menuItems().items.map(x => x[0]); UI.menu = "pause"; G.over = false; const watching = UI.menuItems().items.map(x => x[0]); return { over, watching };');
    ok(spec.over[0] === 'Back to lobby' && !spec.over.includes('Rematch') && spec.watching.includes('Back to lobby') && spec.watching.indexOf('Back to lobby') < spec.watching.indexOf('Stop watching'), 'a spectator has BACK TO LOBBY, on the end screen and while watching, and no REMATCH: there is no seat to be ready in', J(spec));
    const none = p.R('UI.start({ players: [{ race: "T", human: true, name: "Zac" }, { race: "Z", human: false }], seed: 3, layout: "temple" }); UI.net = false; UI.menu = "over"; return UI.menuItems().items.map(x => x[0]);');
    ok(!none.includes('Rematch') && !none.includes('Back to lobby') && none.includes('Restart this game'), 'a game that came from no lobby (a loaded save, a quick start) offers neither -- UI.start forgets where the last one came from', J(none));
    const pause = p.R('UI.menu = "pause"; const local = UI.menuItems().items.map(x => x[0]); Net.startGame({ seed: 7, layout: "temple", you: 0, delay: 3, players: [{ name: "Zac", race: "T", team: 1, human: true }, { name: "Bo", race: "Z", team: 2, human: true }] }); UI.menu = "pause"; const online = UI.menuItems().items.map(x => x[0]); UI.menu = null; return { local, online };');
    ok(pause.local.includes('Restart') && pause.local.includes('Save game (F5)') && !pause.online.includes('Restart') && !pause.online.includes('Save game (F5)') && pause.online.includes('Quit to menu'),
      'the F10 menu of an online game has no Restart (a private copy of a game everyone else is in) and no Save game (which saves nothing online); a local game keeps both', J(pause));
    p.$('singleBtn').click(); p.$('setupBtn').click(); p.$('skLobby').querySelector('#lbStart').click();
    const sk = p.R('UI.menu = "over"; const a = UI.menuItems().items.map(x => x[0]); UI.restart(); UI.menu = "over"; const b = UI.menuItems().items.map(x => x[0]); UI.menu = null; return { a, b, from: UI.fromLobby };');
    ok(J(sk.a.slice(0, 2)) === J(['Rematch', 'Back to lobby']) && sk.a.includes('Restart this game') && J(sk.b.slice(0, 2)) === J(['Rematch', 'Back to lobby']) && sk.from === 'skirmish',
      'a skirmish from the lobby offers REMATCH and BACK TO LOBBY beside Restart, and still does after a Restart', J(sk));
  }

  console.log('--- 7. the way back, online ---');
  {
    const p = page();
    p.R('Net.connected = true; Net.id = 7; Net.ws = new WebSocket("ws://x/ws"); Net.startGame({ seed: 5, layout: "temple", you: 0, delay: 3, players: [{ name: "Zac", race: "T", team: 1, human: true }, { name: "Bo", race: "Z", team: 2, human: true }] });');
    const ws = p.sockets[0];
    const r1 = p.R('G.over = true; G.winTeam = 1; G.frame = 480; const a = UI.reportOver(); const b = UI.reportOver(); return { a, b };');
    const overs = ws.sent.filter(m => m.t === 'over');
    ok(r1.a === true && r1.b === false && overs.length === 1 && overs[0].f === 480 && overs[0].team === 1, 'the end of an online game is told to the relay once, with its frame and the winning team', J({ r1, overs }));
    const lobbyMsg = { t: 'lobby', room: 'ROOM42', title: 'T', listed: true, state: 'lobby', speed: 6, layout: 'temple', cap: 4, readyCheck: true, rules: {}, specs: [], players: [{ id: 8, name: 'Bo', race: 'Z', team: 2, host: true, ready: true }, { id: 7, name: 'Zac', race: 'T', team: 1, away: true }] };
    const rb = p.R('UI.menu = null; G.over = false; Net.handle(' + J(lobbyMsg) + '); return { back: Net.roomBack, menu: UI.menu };');
    ok(rb.back === true && rb.menu === 'over', 'a lobby arriving while this client is still in the game means the room went back without it: the end screen opens', J(rb));
    const h = p.R('return Net.roomHtml(' + J(lobbyMsg) + ');');
    ok(/Zac<i class="lbTag" title="Still on the end screen of the last game">end screen<\/i>/.test(h), 'the room draws a player still on the end screen as such', (h.match(/<span class="lbName">Zac[\s\S]{0,120}/) || [''])[0]);
    const asHost = p.R('Net.id = 8; const s = Net.roomHtml(' + J(lobbyMsg) + '); Net.id = 7; return s;');
    ok(/Waiting for Zac \(still on the end screen\) to ready up/.test(asHost), '...and the host\'s ready line says who START is waiting on, and why', (asHost.match(/Waiting for[^<]*/) || [''])[0]);
    const back = p.R('const r = Net.backToLobby(true); return { r, active: Net.active, running: UI.running, shown: [...document.querySelectorAll(".panel")].filter(x => x.style.display !== "none").map(x => x.id) };');
    const sentBack = ws.sent.filter(m => m.t === 'back');
    ok(back.r === true && sentBack.length === 1 && sentBack[0].ready === true && back.active === false && back.running === false && J(back.shown) === J(['multiPanel']) && !ws.closed,
      'REMATCH sends back-and-ready, ends this client\'s game, and shows the lobby -- on the same socket, which stays open', J({ back, sentBack, closed: ws.closed }));
    const waiting = { t: 'lobby', room: 'ROOM42', title: 'T', listed: true, state: 'playing', speed: 6, layout: 'temple', cap: 4, rules: {}, specs: [], players: [{ id: 7, name: 'Zac', race: 'T', team: 1, back: true, gone: true }, { id: 8, name: 'Bo', race: 'Z', team: 2, host: true }] };
    const wh = p.R('Net.id = 7; return Net.roomHtml(' + J(waiting) + ');');
    ok(/You are back in the lobby\. It opens again when the game is over for Bo\./.test(wh) && /Zac<i class="lbTag"[^>]*>back<\/i>/.test(wh), 'while the others finish, the room says who it is waiting for, and marks who is back', (wh.match(/You are back[^<]*/) || [''])[0]);
    const txt = p.R('return [Net.sysText({ ev: "back", name: "Bo", ready: true }), Net.sysText({ ev: "back", name: "Bo" }), Net.sysText({ ev: "lobby", away: ["Zac"] })];');
    ok(txt[0] === 'Bo is back in the lobby, ready for a rematch.' && txt[1] === 'Bo is back in the lobby.' && /The game is over\. This is its lobby again, with the same settings\. Still on the end screen: Zac\./.test(txt[2]), 'the room reads who came back, for a rematch or not, and who is still on the end screen', J(txt));
    const specNo = p.R('Net.startGame({ seed: 6, layout: "temple", you: -1, delay: 3, players: [{ name: "Zac", race: "T", team: 1, human: true }] }); G.over = true; UI.overSent = false; return UI.reportOver();');
    ok(specNo === false, 'a spectator tells the relay nothing about the end: its word would count for nothing', J(specNo));
  }

  console.log('--- 8. the skirmish lobby ---');
  {
    const p = page();
    p.$('singleBtn').click(); p.$('setupBtn').click();
    const lob = p.$('skLobby');
    lob.querySelector('[data-addai="2"]').click();
    lob.querySelector('[data-start="2"]').click();
    lob.querySelector('#lbStart').click();
    const first = p.c.__started[p.c.__started.length - 1];
    p.R('UI.Skirmish.rematch();');
    const second = p.c.__started[p.c.__started.length - 1];
    const same = o => J(Object.assign({}, o, { seed: 0 }));
    ok(p.c.__started.length === 2 && second.seed !== first.seed && same(second) === same(first) && second.players[0].start === 2 && p.R('return UI.fromLobby;') === 'skirmish',
      'REMATCH starts the same lobby again at once, with everything the same but the seed', J({ first, second }));
    p.R('UI.menu = "over"; UI.menuItems().items.find(x => x[0] === "Back to lobby")[1]();');
    const L = p.R('return { shown: [...document.querySelectorAll(".panel")].filter(x => x.style.display !== "none").map(x => x.id), running: UI.running, players: UI.Skirmish.L.players.map(x => [x.name, x.ai ? x.difficulty : "you", x.start === undefined ? null : x.start]) };');
    ok(J(L.shown) === J(['skirmishPanel']) && L.running === false && J(L.players) === J([['Zac', 'you', 2], ['Computer 1', 'normal', null], ['Computer 2', 'normal', null]]) && /data-start="2"/.test(lob.innerHTML),
      'BACK TO LOBBY ends the game and opens the skirmish lobby as it was left: the same slots, the same start', J(L));
  }

  const { pass, fail } = counts();
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); killAll(); process.exit(1); });
