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
const path = require('path'), { spawn } = require('child_process');
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
  c.open = new Promise(r => { c.ws.onopen = r; });
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

  await sleep(200);
  killAll();
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); killAll(); process.exit(1); });
