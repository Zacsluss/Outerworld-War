// Rooms, the join code, the player cap and the configurable lockstep delay.
//
// These are what make the relay usable over the internet rather than only on a LAN. The transport
// itself needed no code at all -- Net.defaultUrl() already picks wss:// when the page is https, and
// the relay's upgrade handler never looks at Host, so it works behind a tunnel as-is. What did not
// work was everything that assumed "reaching this server means you were invited":
//
//   * ONE GLOBAL LOBBY. Every client on a relay was in the same game, so one server could host one
//     game and a second pair of players had to run a second server.
//   * NO ACCESS CONTROL OF ANY KIND. `join` had no gate. On a LAN the network was the gate; behind a
//     public tunnel the URL is not a secret and anything with the link walked into the lobby.
//   * NO CAP ON HUMANS. `addai` refused past eight and `join` never did.
//   * DELAY WAS A CONST. A command issued at frame F executes at F+3, and at TPS 24 that is a 125 ms
//     budget -- less than one round trip through a tunnel. Nothing desyncs when it is exceeded;
//     every client just waits, constantly, which reads as stutter.
//
// This file talks to the relay over real sockets but never simulates a game, so it runs in seconds
// and belongs in the gate. test/net.js and test/net_many.js are the ones that play.
//
//   node test/rooms.js [port=8793]
const path = require('path'), { spawn } = require('child_process'), http = require('http'), net = require('net'), vm = require('vm'), fs = require('fs');
const root = path.join(__dirname, '..');
const PORT = parseInt(process.argv[2] || '8793');
if (typeof WebSocket === 'undefined') { console.error('needs Node 22+ (global WebSocket)'); process.exit(2); }
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const servers = [];
function serve(port, delay) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port), String(delay)], { stdio: ['ignore', 'pipe', 'pipe'] });
  s.stdout.on('data', () => { }); s.stderr.on('data', d => console.log('  [relay err] ' + String(d).trim()));
  servers.push(s); return s;
}
function killAll() { for (const s of servers) { try { s.kill(); } catch (e) { } } }
process.on('exit', killAll);

// A client that records everything it is sent, so an assertion can ask "did this ever arrive".
function client(port, tag) {
  const c = { tag, msgs: [], lobby: null, started: null, error: null, hello: null, chats: [], cmds: [] };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => {
    const m = JSON.parse(ev.data); c.msgs.push(m);
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'start') c.started = m;
    if (m.t === 'error') c.error = m.msg;
    if (m.t === 'hello') c.hello = m;
    if (m.t === 'chat') c.chats.push(m);
    if (m.t === 'cmds') c.cmds.push(m);
  };
  c.send = o => c.ws.send(JSON.stringify(o));
  // REVIEW-M17: `onopen` alone hangs the whole gate against a port something else already holds (the
  // relay child dies on EADDRINUSE and this file carried on waiting). Error, close and a deadline all
  // reject, and the rejection is marked handled so an un-awaited client cannot crash the process.
  c.open = new Promise((r, j) => {
    c.ws.onopen = r;
    c.ws.onerror = () => j(new Error('socket error before open on port ' + port + ' -- is another relay (or another gate) holding it?'));
    c.ws.onclose = () => j(new Error('socket closed before open on port ' + port));
    setTimeout(() => j(new Error('no open within 10 s on port ' + port)), 10000).unref();
  });
  c.open.catch(() => { });
  c.close = () => { try { c.ws.close(); } catch (e) { } };
  return c;
}

(async () => {
  // =========================================================================
  // 1. the delay is the server's to set, and it reaches the clients
  // =========================================================================
  serve(PORT, 7);
  await sleep(500);
  const A = client(PORT, 'A'), B = client(PORT, 'B');
  await Promise.all([A.open, B.open]);
  A.send({ t: 'join', name: 'Alice', race: 'T', room: 'ABCD' });
  B.send({ t: 'join', name: 'Bob', race: 'Z', room: 'ABCD' });
  await sleep(300);

  ok(A.hello && A.hello.rooms === true, 'the relay announces that it speaks rooms', JSON.stringify(A.hello));
  ok(A.hello && A.hello.state === 'lobby', 'hello reports the RELAY, not a game -- naming a running game would leak that the room exists', JSON.stringify(A.hello && A.hello.state));

  // =========================================================================
  // 2. two rooms on one relay, and they cannot see or hear each other
  // =========================================================================
  const C = client(PORT, 'C'), D = client(PORT, 'D');
  await Promise.all([C.open, D.open]);
  C.send({ t: 'join', name: 'Carol', race: 'P', room: 'WXYZ' });
  D.send({ t: 'join', name: 'Dave', race: 'T', room: 'WXYZ' });
  await sleep(300);

  ok(A.lobby && A.lobby.players.length === 2, 'room ABCD holds exactly its own two players', A.lobby && JSON.stringify(A.lobby.players.map(p => p.name)));
  ok(C.lobby && C.lobby.players.length === 2, 'room WXYZ holds exactly its own two players', C.lobby && JSON.stringify(C.lobby.players.map(p => p.name)));
  ok(A.lobby && A.lobby.players.every(p => p.name === 'Alice' || p.name === 'Bob'), 'ABCD cannot see WXYZ\'s players', A.lobby && JSON.stringify(A.lobby.players.map(p => p.name)));
  ok(A.lobby && A.lobby.room === 'ABCD' && C.lobby && C.lobby.room === 'WXYZ', 'each lobby names its own room', JSON.stringify([A.lobby && A.lobby.room, C.lobby && C.lobby.room]));
  ok(A.lobby.players.some(p => p.host) && C.lobby.players.some(p => p.host), 'each room has a host of its own', '');

  // chat does not cross
  A.send({ t: 'chat', text: 'only-abcd' });
  await sleep(250);
  ok(B.chats.some(m => m.text === 'only-abcd'), 'chat reaches the other player in the same room', JSON.stringify(B.chats.map(m => m.text)));
  ok(!C.chats.some(m => m.text === 'only-abcd') && !D.chats.some(m => m.text === 'only-abcd'),
    'CHAT DOES NOT CROSS ROOMS', JSON.stringify(C.chats.concat(D.chats).map(m => m.text)));

  // =========================================================================
  // 3. starting one game does not start the other
  // =========================================================================
  A.send({ t: 'start' });
  await sleep(400);
  ok(A.started && B.started, 'the host can start their own room', JSON.stringify([!!A.started, !!B.started]));
  ok(!C.started && !D.started, 'STARTING ONE ROOM DOES NOT START THE OTHER', JSON.stringify([!!C.started, !!D.started]));
  ok(A.started && A.started.delay === 7, 'THE DELAY IS THE SERVER\'S: launched with 7, the start message carries 7', A.started && String(A.started.delay));
  ok(A.started && A.started.room === 'ABCD', 'the start message names the room it belongs to', A.started && A.started.room);
  ok(C.lobby && C.lobby.state === 'lobby', 'the other room is still in its lobby, unaware', C.lobby && C.lobby.state);

  // commands do not cross
  A.send({ t: 'cmds', f: 10, c: [{ t: 'stopall', p: 0 }] });
  await sleep(250);
  ok(B.cmds.some(m => m.f === 10), 'a command batch reaches the other player in the same room', JSON.stringify(B.cmds.map(m => m.f)));
  ok(!C.cmds.length && !D.cmds.length, 'COMMAND BATCHES DO NOT CROSS ROOMS', JSON.stringify([C.cmds.length, D.cmds.length]));

  // =========================================================================
  // 4. a wrong code is an empty room of your own, never someone else's
  // =========================================================================
  const E = client(PORT, 'E');
  await E.open;
  E.send({ t: 'join', name: 'Eve', race: 'T', room: 'NOPE' });
  await sleep(300);
  ok(E.lobby && E.lobby.players.length === 1 && E.lobby.players[0].name === 'Eve',
    'A WRONG CODE LANDS YOU IN AN EMPTY ROOM OF YOUR OWN -- it is not an error, and it is not someone else\'s game', E.lobby && JSON.stringify(E.lobby.players.map(p => p.name)));
  ok(!E.error, '...and says nothing about whether any other room exists', String(E.error));
  E.close();

  // =========================================================================
  // 5. the code is normalised, because humans read it out loud
  // =========================================================================
  const F = client(PORT, 'F'), G2 = client(PORT, 'G');
  await Promise.all([F.open, G2.open]);
  F.send({ t: 'join', name: 'Frank', race: 'T', room: 'qw-12' });
  await sleep(200);
  G2.send({ t: 'join', name: 'Grace', race: 'Z', room: '  QW12  ' });
  await sleep(300);
  ok(F.lobby && F.lobby.players.length === 2, 'lower case, punctuation and spaces normalise to the same room ("qw-12" == "  QW12  ")', F.lobby && JSON.stringify(F.lobby.players.map(p => p.name)));
  ok(F.lobby && F.lobby.room === 'QW12', '...and the room reports its normalised code', F.lobby && F.lobby.room);
  F.close(); G2.close();

  // =========================================================================
  // 6. no code at all is the default room -- which is what keeps LAN play unchanged
  // =========================================================================
  // test/net.js and test/net_many.js never send a room and must keep working untouched. This is that
  // guarantee, asserted rather than assumed.
  const H = client(PORT, 'H'), I = client(PORT, 'I');
  await Promise.all([H.open, I.open]);
  H.send({ t: 'join', name: 'Heidi', race: 'T' });
  await sleep(200);
  I.send({ t: 'join', name: 'Ivan', race: 'Z', room: '' });
  await sleep(300);
  ok(H.lobby && H.lobby.players.length === 2, 'NO CODE AND AN EMPTY CODE ARE THE SAME ROOM -- a client that never heard of rooms is unaffected', H.lobby && JSON.stringify(H.lobby.players.map(p => p.name)));
  ok(H.lobby && H.lobby.room === 'LAN', '...and that room is called LAN', H.lobby && H.lobby.room);
  ok(!H.lobby.players.some(p => p.name === 'Alice'), '...and it is NOT the room the first game is in', H.lobby && JSON.stringify(H.lobby.players.map(p => p.name)));

  // =========================================================================
  // 7. the cap. `addai` has always refused past eight; `join` never did.
  // =========================================================================
  const many = [];
  for (let i = 0; i < 8; i++) { const c = client(PORT, 'cap' + i); many.push(c); await c.open; c.send({ t: 'join', name: 'Cap' + i, race: 'T', room: 'FULL' }); }
  await sleep(500);
  const last = many[7];
  ok(last.lobby && last.lobby.players.length === 8, 'eight players fit in a room', last.lobby && String(last.lobby.players.length));
  const over = client(PORT, 'over');
  await over.open;
  over.send({ t: 'join', name: 'Ninth', race: 'T', room: 'FULL' });
  await sleep(300);
  ok(/full/i.test(String(over.error)), 'THE NINTH IS REFUSED, and told why', String(over.error));
  ok(last.lobby && last.lobby.players.length === 8 && !last.lobby.players.some(p => p.name === 'Ninth'),
    '...and did not get in anyway', last.lobby && String(last.lobby.players.length));
  over.close(); for (const c of many) c.close();

  // =========================================================================
  // 8. an empty room is forgotten, and the delay is clamped
  // =========================================================================
  A.close(); B.close(); C.close(); D.close(); H.close(); I.close();
  await sleep(300);

  const P2 = PORT + 1;
  serve(P2, 0);                                  // 0 would schedule commands into an already-simulated frame
  await sleep(500);
  const J = client(P2, 'J');
  await J.open;
  J.send({ t: 'join', name: 'Judy', race: 'T', room: 'CLAMP' });
  await sleep(250);
  J.send({ t: 'start' });
  await sleep(300);
  ok(J.started && J.started.delay === 1, 'A DELAY OF 0 IS CLAMPED TO 1 -- zero would schedule a command into a frame already simulated', J.started && String(J.started.delay));
  J.close();

  const P3 = PORT + 2;
  serve(P3, 999);
  await sleep(500);
  const K = client(P3, 'K');
  await K.open;
  K.send({ t: 'join', name: 'Ken', race: 'T', room: 'CLAMP' });
  await sleep(250);
  K.send({ t: 'start' });
  await sleep(300);
  ok(K.started && K.started.delay === 20, '...and an absurd one is clamped to 20', K.started && String(K.started.delay));
  K.close();

  // =========================================================================
  // 9. the relay does not trust its clients (REVIEW-M17)
  // =========================================================================
  // Every one of these was probed against the old relay first: GET /% killed the process, the checkout
  // was served whole, a command's `p` was whatever the sender wrote, a non-array batch was forwarded
  // and threw in every receiver, a refused stranger counted as in the room, a live player could take a
  // dropped slot, a race of "QQ" reached G.init, the LAN room could not change a setting for its second
  // game, a kicked client kept hearing the lobby, and a frame could claim 2^63 bytes.
  const P4 = PORT + 3;
  serve(P4, 3);
  await sleep(500);
  const get = (p) => new Promise(r => { const rq = http.get('http://localhost:' + P4 + p, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => r({ status: res.statusCode, body: b })); }); rq.on('error', e => r({ status: -1, body: String(e.message) })); });
  const bad = await get('/%'); const after = await get('/index.html');
  ok(bad.status === 400 && after.status === 200, 'GET /% is a 400 and the relay is still up afterwards (it used to throw out of decodeURIComponent and exit)', bad.status + ' then ' + after.status);
  const git = await get('/.git/HEAD'), md = await get('/HANDOFF-M16.md'), srv = await get('/test/serve.js'), js = await get('/js/net.js'), art = await get('/assets/atlas.js');
  ok(git.status === 404 && md.status === 404 && srv.status === 404, 'the static half serves neither the repository nor the docs nor itself (was 200 for all three)', git.status + '/' + md.status + '/' + srv.status);
  ok(js.status === 200 && art.status === 200, '...and still serves the page\'s code and art', js.status + '/' + art.status);

  const SA = client(P4, 'SA'), SB = client(P4, 'SB');
  await SA.open; await SB.open;
  SA.send({ t: 'join', name: 'Ann', race: 'T', room: 'SEC' }); await sleep(200);
  SB.send({ t: 'join', name: 'Bee', race: 'QQ', room: 'SEC' }); await sleep(200);
  ok(SA.lobby && SA.lobby.players.length === 2 && SA.lobby.players[1].race === 'R', 'a race the game does not have becomes Random rather than reaching G.init (was "QQ", which threw on every client)', JSON.stringify(SA.lobby && SA.lobby.players.map(p => p.race)));
  SB.send({ t: 'set', team: { z: 1 } }); await sleep(200);
  ok(SA.lobby.players[1].team === 2, 'a team that is not an integer is ignored', JSON.stringify(SA.lobby.players[1].team));
  SA.send({ t: 'addai', race: 'Z', difficulty: 'x'.repeat(500) }); await sleep(200);
  ok(SA.lobby.players.length === 3 && SA.lobby.players[2].difficulty === 'normal', 'an unknown difficulty becomes normal (was stored verbatim, 500 characters of it, and rendered into every lobby)', JSON.stringify(SA.lobby.players[2] && SA.lobby.players[2].difficulty));
  SA.send({ t: 'start' }); await sleep(300);
  ok(SA.started && SB.started, 'the SEC game starts');
  SB.send({ t: 'cmds', f: 5, c: [{ t: 'cheat', p: 0, code: 'game over man' }] }); await sleep(200);
  const forged = SA.cmds.find(m => m.f === 5);
  ok(forged && forged.p === 1 && forged.c.length === 1 && forged.c[0].p === 1, 'a command whose `p` names another player is re-stamped with the sender\'s slot (was forwarded as p:0, and CMD.apply trusted it)', JSON.stringify(forged));
  SB.send({ t: 'cmds', f: 6, c: 42 }); SB.send({ t: 'cmds', f: 7, c: [] }); await sleep(200);
  ok(!SA.cmds.some(m => m.f === 6) && SA.cmds.some(m => m.f === 7), 'a batch that is not a list is dropped, and the next real one still arrives (was forwarded, and threw in every receiver)', SA.cmds.map(m => m.f).join(','));
  const SE = client(P4, 'SE'); await SE.open;
  SE.send({ t: 'join', name: 'Eve', race: 'T', room: 'SEC' }); await sleep(200);
  const chatsBefore = SE.chats.length; SA.send({ t: 'chat', text: 'private' }); await sleep(200);
  ok(/in progress/i.test(String(SE.error)) && SE.chats.length === chatsBefore, 'a stranger refused mid-game hears nothing afterwards (it used to count as in the room and receive every broadcast)', String(SE.error) + ' chats ' + SE.chats.length);
  SB.close(); await sleep(300);
  SA.send({ t: 'join', name: 'Bee', race: 'T', room: 'SEC' }); await sleep(200);
  ok(/already in this game/i.test(String(SA.error)), 'a live player re-sending join with a dropped player\'s name is refused (it used to take the slot, and two slots shared one id)', String(SA.error));
  const SB2 = client(P4, 'SB2'); await SB2.open;
  SB2.send({ t: 'join', name: 'Bee', race: 'T', room: 'SEC' });
  for (let i = 0; i < 60 && !SB2.msgs.some(m => m.t === 'rejoin'); i++) await sleep(100);   // the donor (a raw client here) never answers, so the relay's 4 s fallback serves the rejoin
  ok(SB2.msgs.some(m => m.t === 'rejoin'), '...so the real Bee can still rejoin her slot', SB2.msgs.map(m => m.t).join(','));
  SA.close(); SB2.close(); SE.close(); await sleep(300);

  // the LAN room's second game: no code means the shared room, and it must be reusable
  const L1 = client(P4, 'L1'); await L1.open;
  L1.send({ t: 'join', name: 'Lou', race: 'T', room: '' }); await sleep(200);
  L1.send({ t: 'start' }); await sleep(300);
  ok(L1.started, 'a game starts in the LAN room');
  L1.close(); await sleep(300);
  const L2 = client(P4, 'L2'); await L2.open;
  L2.send({ t: 'join', name: 'Mo', race: 'T', room: '' }); await sleep(200);
  L2.send({ t: 'set', race: 'Z' }); await sleep(200);
  ok(L2.lobby && L2.lobby.state === 'lobby' && L2.lobby.players[0] && L2.lobby.players[0].race === 'Z', 'the second game in the LAN room can change a setting again (the reset left `started` behind, so race, team, map and speed were all refused)', JSON.stringify(L2.lobby && { state: L2.lobby.state, race: L2.lobby.players[0] && L2.lobby.players[0].race }));
  const L3 = client(P4, 'L3'); await L3.open;
  L3.send({ t: 'join', name: 'Ned', race: 'T', room: '' }); await sleep(200);
  const nedId = L3.hello && L3.hello.id;
  L2.send({ t: 'kick', id: nedId }); await sleep(200);
  const lobbiesBefore = L3.msgs.filter(m => m.t === 'lobby').length; L2.send({ t: 'set', race: 'P' }); await sleep(200);
  ok(/removed you/i.test(String(L3.error)) && L3.msgs.filter(m => m.t === 'lobby').length === lobbiesBefore, 'a kicked client is told, and hears no more of that lobby (it used to keep receiving every broadcast)', String(L3.error) + ' lobbies ' + lobbiesBefore + '/' + L3.msgs.filter(m => m.t === 'lobby').length);
  L2.close(); L3.close();

  // a frame that claims more bytes than any honest message: the socket is closed, not believed
  const raw = await new Promise(r => {
    const sock = net.createConnection(P4, 'localhost'); let closed = false; let out = '';
    sock.on('data', d => { out += d; if (out.includes('\r\n\r\n') && !sock.sentBad) { sock.sentBad = true; const h = Buffer.alloc(14); h[0] = 0x81; h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(2 ** 40), 2); sock.write(h); } });
    sock.on('close', () => { closed = true; r({ closed }); }); sock.on('error', () => { });
    sock.on('connect', () => sock.write('GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'));
    setTimeout(() => r({ closed }), 3000);
  });
  ok(raw.closed, 'a frame claiming 2^40 bytes gets the connection closed (it used to be streamed into memory)', JSON.stringify(raw));
  const alive = await get('/index.html');
  ok(alive.status === 200, '...and the relay is still up', String(alive.status));

  // the lobby renders names as text, never as markup
  {
    const netSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8');
    const html = { v: '' }; const el = () => ({ get innerHTML() { return html.v; }, set innerHTML(v) { html.v = v; }, querySelectorAll: () => [], value: '', onchange: null });
    const c = { console, location: { protocol: 'http:', host: 'localhost' }, document: { getElementById: el }, TPS: 24, WebSocket: function () { } };
    vm.createContext(c); vm.runInContext(netSrc, c);
    const rendered = vm.runInContext(`Net.id = 7; Net.lobby = { room: 'LAN', state: 'lobby', speed: 6, players: [{ id: 7, name: '<svg/onload=x()>', race: 'T', team: 1, host: true }, { id: -1, name: 'Computer 0', ai: true, difficulty: '<img src=x onerror=y>', race: 'R', team: 2 }] }; Net.render(); Net.lobby = null; 1;`, c);
    ok(!/<svg|<img/.test(html.v) && /&lt;svg/.test(html.v), 'a player name or difficulty is escaped before it reaches innerHTML (was raw: script in every lobby member\'s page over a public tunnel)', html.v.slice(0, 160));
  }
  ok(/PING_MS/.test(fs.readFileSync(path.join(__dirname, 'serve.js'), 'utf8')) && /DEAD_MS/.test(fs.readFileSync(path.join(__dirname, 'serve.js'), 'utf8')), 'the relay has a keepalive (static: a silent connection is dropped after DEAD_MS; verified by hand, it takes 45 s)');

  await sleep(200);
  killAll();
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); killAll(); process.exit(1); });
