// BASIC INTERNET-PLAY SAFETY (ninth session, queue item E; the user: "if there's something simple and basic we can implement,
// let's do it"). RESEARCH-LOBBY.md section 9 is the research; .claude/review/safety/probe.js measured the relay first.
//   node test/safety.js [port=8860]      (uses port .. port+3)
//
// RELAY (real sockets against test/serve.js):
//   1. one address holds at most BW_IP_SOCKETS sockets, and a closed one frees its place
//   2. behind a tunnel the address is the forwarding header's -- CF-Connecting-IP first, else X-Forwarded-For's LAST entry
//   3. a socket that floods the relay with messages is dropped; one at an honest game's pace is not
//   4. chat and lobby changes past their own caps are ignored, and the socket stays
//   5. a large frame is refused unless it is a snapshot the relay asked that socket for
//   6. BW_PASSWORD: nothing but the password is answered until it is given; a wrong one is refused and five close the
//      socket; the password is never logged; a relay without one says nothing about passwords
// CLIENT (the page in a VM):
//   7. the multiplayer screen asks for the password, sends it, runs its first action again once accepted, remembers it
//      per server, sends a remembered one at once, and forgets one that is refused
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), net = require('net'), crypto = require('crypto'), { spawn } = require('child_process');
const { ok, counts, mkDom, root } = require('./_harness');
const PORT = parseInt(process.argv[2] || '8860', 10);
const J = v => JSON.stringify(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const servers = [];
function serve(port, env) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port), '3'], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_COUNTDOWN: '0', BW_READY: '0', BW_LOBBY_PING: '60000', BW_CHEATS: '1' }, env || {}) });
  s.out = []; s.stdout.on('data', d => s.out.push(String(d))); s.stderr.on('data', d => s.out.push(String(d)));
  servers.push(s); return s;
}
const killAll = () => { for (const s of servers) { try { s.kill(); } catch (e) { } } };
process.on('exit', killAll);
function client(port, tag) {
  const c = { tag, msgs: [], lobby: null, lobbies: null, closed: false, auth: [] };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'lobby') c.lobby = m; if (m.t === 'lobbies') c.lobbies = m; if (m.t === 'auth') c.auth.push(m); if (m.t === 'lping') c.send({ t: 'lpong', n: m.n }); };
  c.ws.onclose = () => { c.closed = true; };
  c.send = o => { try { c.ws.send(typeof o === 'string' ? o : J(o)); } catch (e) { } };
  c.open = new Promise(r => { c.ws.onopen = () => r(true); c.ws.onerror = () => r(false); });
  return c;
}
// A handshake by hand, so the request can carry the headers a tunnel adds. Resolves with the status line; the socket stays
// open (a socket the relay counts) until `.end()`.
function raw(port, headers) {
  return new Promise(res => {
    const s = net.connect(port, '127.0.0.1', () => {
      let h = 'GET /ws HTTP/1.1\r\nHost: localhost:' + port + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + crypto.randomBytes(16).toString('base64') + '\r\nSec-WebSocket-Version: 13\r\n';
      for (const [k, v] of Object.entries(headers || {})) h += k + ': ' + v + '\r\n';
      s.write(h + '\r\n');
    });
    let got = '', done = false; const finish = v => { if (!done) { done = true; res({ status: v, end: () => s.destroy() }); } };
    s.on('data', d => { got += d; if (got.includes('\r\n\r\n')) finish(got.split('\r\n')[0]); });
    s.on('error', () => finish('error')); s.on('close', () => finish(got.split('\r\n')[0] || 'closed'));
    setTimeout(() => finish(got.split('\r\n')[0] || 'timeout'), 3000);
  });
}

(async () => {
  if (typeof WebSocket === 'undefined') { console.log('FAIL needs Node 22+ (global WebSocket)'); process.exit(1); }
  // =========================================================================================== RELAY
  console.log('--- 1. sockets per address ---');
  const R1 = serve(PORT, { BW_IP_SOCKETS: '6' }); await sleep(500);
  const six = []; for (let i = 0; i < 6; i++) six.push(await raw(PORT));
  const seventh = await raw(PORT);
  ok(six.every(x => /101/.test(x.status)) && /429/.test(seventh.status), 'one address holds six sockets (BW_IP_SOCKETS=6) and the seventh is refused with 429', J({ six: six.map(x => x.status), seventh: seventh.status }));
  six[0].end(); await sleep(300);
  const again = await raw(PORT);
  ok(/101/.test(again.status) && R1.out.join('').includes('refused a socket: 6 already open from one address'), '...a closed socket frees its place, and the refusal is logged without the address', again.status);
  for (const x of six.concat([seventh, again])) x.end();
  await sleep(300);

  console.log('--- 2. the address behind a tunnel ---');
  const R2 = serve(PORT + 1, { BW_IP_SOCKETS: '2' }); await sleep(500);
  const P2 = PORT + 1;
  const a1 = await raw(P2, { 'X-Forwarded-For': '203.0.113.5' }), a2 = await raw(P2, { 'X-Forwarded-For': '203.0.113.5' }), a3 = await raw(P2, { 'X-Forwarded-For': '203.0.113.5' });
  const b1 = await raw(P2, { 'X-Forwarded-For': '203.0.113.6' });
  ok(/101/.test(a1.status) && /101/.test(a2.status) && /429/.test(a3.status) && /101/.test(b1.status), 'a socket from this machine (a tunnel) counts as the address in X-Forwarded-For: two from one, the third refused, another address still let in', J([a1.status, a2.status, a3.status, b1.status]));
  const c1 = await raw(P2, { 'X-Forwarded-For': '198.51.100.1, 203.0.113.7' }), c2 = await raw(P2, { 'X-Forwarded-For': '198.51.100.2, 203.0.113.7' }), c3 = await raw(P2, { 'X-Forwarded-For': '198.51.100.3, 203.0.113.7' });
  ok(/101/.test(c1.status) && /101/.test(c2.status) && /429/.test(c3.status), '...its LAST entry, the one the proxy added: a client changing the first entry it wrote is still one address', J([c1.status, c2.status, c3.status]));
  const d1 = await raw(P2, { 'CF-Connecting-IP': '192.0.2.9', 'X-Forwarded-For': '203.0.113.5' }), d2 = await raw(P2, { 'CF-Connecting-IP': '192.0.2.9', 'X-Forwarded-For': '203.0.113.6' }), d3 = await raw(P2, { 'CF-Connecting-IP': '192.0.2.9' });
  ok(/101/.test(d1.status) && /101/.test(d2.status) && /429/.test(d3.status), '...and CF-Connecting-IP (Cloudflare\'s) before either', J([d1.status, d2.status, d3.status]));
  for (const x of [a1, a2, a3, b1, c1, c2, c3, d1, d2, d3]) x.end();
  await sleep(300);

  console.log('--- 3. a message flood, and an honest pace ---');
  const R3 = serve(PORT + 2); await sleep(500);
  const P3 = PORT + 2;
  const F = client(P3, 'Flood'), H = client(P3, 'Honest'), Wt = client(P3, 'Watcher'); await Promise.all([F.open, H.open, Wt.open]);
  for (const [c, n] of [[F, 'Fay'], [H, 'Hal'], [Wt, 'Wes']]) { c.send({ t: 'join', name: n, race: 'T', room: 'SAFE' }); await sleep(120); }
  for (let i = 0; i < 1000; i++) F.send({ t: 'ping' });
  for (let i = 0; i < 75; i++) { H.send({ t: 'ping' }); if (i % 25 === 24) await sleep(1000); }
  await sleep(500);
  ok(F.closed && /dropping client \d+: more than 600 messages at once or 300 a second/.test(R3.out.join('')), 'a socket sending a thousand messages at once is dropped, and the log says why', J({ closed: F.closed }));
  ok(!H.closed, 'a socket at an honest game\'s pace, 25 a second for three seconds, is not', J({ closed: H.closed }));

  console.log('--- 4. chat and lobby changes ---');
  const before = Wt.msgs.filter(m => m.t === 'chat').length;
  for (let i = 0; i < 20; i++) H.send({ t: 'chat', text: 'line ' + i });
  await sleep(400);
  const burst = Wt.msgs.filter(m => m.t === 'chat').length - before;
  await sleep(1100); H.send({ t: 'chat', text: 'after a second' }); await sleep(300);
  ok(burst === 8 && Wt.msgs.some(m => m.t === 'chat' && m.text === 'after a second') && !H.closed, 'twenty chat lines at once reach the room as eight, a line a second later still arrives, and the talker stays connected', J({ burst, closed: H.closed }));
  const lobbies0 = Wt.msgs.filter(m => m.t === 'lobby').length;
  for (let i = 0; i < 80; i++) H.send({ t: 'set', race: i % 2 ? 'Z' : 'P' });
  await sleep(500);
  const lobbyBurst = Wt.msgs.filter(m => m.t === 'lobby').length - lobbies0;
  ok(lobbyBurst <= 31 && lobbyBurst >= 25 && !H.closed, 'eighty lobby changes at once make at most thirty broadcasts to the room, and the player stays connected', J({ lobbyBurst }));

  console.log('--- 5. large frames ---');
  const big = client(P3, 'Big'); await big.open; big.send({ t: 'join', name: 'Bea', race: 'T', room: 'SAFE' }); await sleep(200);
  const chats0 = Wt.msgs.filter(m => m.t === 'chat').length;
  big.send(J({ t: 'chat', text: 'y'.repeat(60 * 1024) })); await sleep(300);
  ok(!big.closed && Wt.msgs.filter(m => m.t === 'chat').length === chats0 + 1, 'a 60 KB message is read (and its chat cut to 200 characters)', J({ closed: big.closed }));
  big.send(J({ t: 'chat', text: 'z'.repeat(100 * 1024) })); await sleep(400);
  ok(big.closed && /frame of \d+ bytes that is not a snapshot the relay asked for/.test(R3.out.join('')), 'a 100 KB one is refused and the socket dropped: nobody asked it for a snapshot', J({ closed: big.closed }));
  // a snapshot the relay asked for: a spectator joins a running game, and the relay asks a player for one
  const P = client(P3, 'P1'), Q = client(P3, 'P2'); await Promise.all([P.open, Q.open]);
  P.send({ t: 'join', name: 'Pip', race: 'T', room: 'SNAPS' }); await sleep(120); Q.send({ t: 'join', name: 'Quin', race: 'Z', room: 'SNAPS' }); await sleep(120);
  P.send({ t: 'start' }); await sleep(400);
  for (const c of [P, Q]) for (let f = 0; f < 6; f++) c.send({ t: 'cmds', f, c: [] });
  await sleep(200);
  P.ws.onmessage = (orig => ev => { orig(ev); const m = JSON.parse(ev.data); if (m.t === 'needsnap') P.send(J({ t: 'snap', req: m.req, frame: 5, applied: false, snap: { pad: 's'.repeat(500 * 1024) } })); })(P.ws.onmessage);
  Q.ws.onmessage = (orig => ev => { orig(ev); const m = JSON.parse(ev.data); if (m.t === 'needsnap') Q.send(J({ t: 'snap', req: m.req, frame: 5, applied: false, snap: { pad: 's'.repeat(500 * 1024) } })); })(Q.ws.onmessage);
  const S = client(P3, 'Spec'); await S.open; S.send({ t: 'join', name: 'Sid', room: 'SNAPS', spectate: true, existing: true }); await sleep(1200);
  const rj = S.msgs.find(m => m.t === 'rejoin');
  ok(rj && rj.snap && rj.snap.pad && rj.snap.pad.length === 500 * 1024 && !P.closed && !Q.closed, 'a 500 KB snapshot from the player the relay asked for it goes through to the spectator catching up', J({ got: !!rj, snap: !!(rj && rj.snap), closedP: P.closed, closedQ: Q.closed }));
  const liar = client(P3, 'Liar'); await liar.open; liar.send({ t: 'join', name: 'Lia', race: 'P', room: 'SAFE' }); await sleep(150);
  liar.send(J({ t: 'snap', req: 1, frame: 0, snap: { pad: 's'.repeat(500 * 1024) } })); await sleep(400);
  ok(liar.closed, '...and the same snapshot from a socket nobody asked is refused', J({ closed: liar.closed }));
  for (const c of [F, H, Wt, big, P, Q, S, liar]) try { c.ws.close(); } catch (e) { }
  await sleep(200);

  console.log('--- 6. the server password ---');
  const R4 = serve(PORT + 3, { BW_PASSWORD: 'hunter2' }); await sleep(500);
  const P4 = PORT + 3;
  const K = client(P4, 'Kim'); await K.open; await sleep(150);
  const hello = K.msgs.find(m => m.t === 'hello');
  ok(hello && hello.password === true, 'a relay started with BW_PASSWORD says so in its hello', J(hello));
  K.send({ t: 'list' }); K.send({ t: 'join', name: 'Kim', race: 'T', room: 'SECRET' }); await sleep(300);
  ok(!K.lobbies && !K.lobby, 'nothing is answered before the password: no game list, no room', J(K.msgs.map(m => m.t)));
  K.send({ t: 'auth', password: 'hunter3' }); await sleep(200);
  K.send({ t: 'list' }); await sleep(200);
  ok(K.auth[0] && K.auth[0].ok === false && /Wrong password/.test(K.auth[0].msg) && !K.lobbies, 'a wrong password is refused, and the list still is', J(K.auth));
  K.send({ t: 'auth', password: 'hunter2' }); await sleep(200);
  K.send({ t: 'list' }); await sleep(250);
  ok(K.auth[1] && K.auth[1].ok === true && K.lobbies, 'the right one is accepted, and then the relay answers', J(K.auth));
  const M = client(P4, 'Mal'); await M.open;
  for (let i = 0; i < 5; i++) M.send({ t: 'auth', password: 'guess' + i });
  await sleep(500);
  ok(M.closed && /five wrong passwords/.test(R4.out.join('')), 'five wrong passwords close the socket', J({ closed: M.closed }));
  ok(!R4.out.join('').includes('hunter2') && !R4.out.join('').includes('hunter3') && !R4.out.join('').includes('guess') && /PASSWORD ON/.test(R4.out.join('')), 'the password -- right or wrong -- is never in the relay\'s log, which says only that one is on', R4.out.join('').slice(0, 300));
  const plainHello = (() => { const c = client(P3, 'x'); return c; })();
  await plainHello.open; await sleep(150);
  ok(!('password' in (plainHello.msgs.find(m => m.t === 'hello') || { password: 1 })), 'a relay without a password says nothing about one', J(plainHello.msgs[0]));
  for (const c of [K, M, plainHello]) try { c.ws.close(); } catch (e) { }
  killAll();

  // =========================================================================================== CLIENT
  console.log('--- 7. the multiplayer screen ---');
  {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
    const store = { bw_net: J({ name: 'Zac', url: '', race: 'R' }), bw_intro: '1' };
    const document = mkDom(html), loaded = [], sockets = [];
    function WebSocket(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    WebSocket.prototype.send = function (s) { this.sent.push(JSON.parse(s)); };
    WebSocket.prototype.close = function () { this.readyState = 3; };
    const c = { console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { }, requestAnimationFrame() { }, Image: function () { }, WebSocket, navigator: {},
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
      localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
      location: { protocol: 'http:', host: 'play.example:8765', origin: 'http://play.example:8765', pathname: '/', search: '' }, history: { replaceState() { } }, document };
    c.window = c; c.globalThis = c; vm.createContext(c);
    for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
    vm.runInContext('UI.init = () => {};', c);
    for (const fn of loaded) fn();
    const $ = id => document.getElementById(id), R = src => vm.runInContext('(() => {' + src + '})()', c);
    const deliver = (s, m) => s.onmessage({ data: J(m) });
    $('multiBtn').click();
    const s1 = sockets[sockets.length - 1]; s1.readyState = 1; s1.onopen();
    const firstList = s1.sent.filter(m => m.t === 'list').length;
    deliver(s1, { t: 'hello', id: 3, state: 'lobby', rooms: true, browser: true, password: true });
    const lob = $('lobby');
    ok(R('return Net.needAuth;') === true && /This server needs a password/.test(lob.innerHTML) && lob.querySelector('#lbPass') && !s1.sent.some(m => m.t === 'auth'), 'a server that wants a password gets a password box, and nothing is sent until it is typed', lob.innerHTML.slice(0, 200));
    lob.querySelector('#lbPass').value = 'hunter2'; lob.querySelector('#lbPassOk').click();
    const authSent = s1.sent.filter(m => m.t === 'auth');
    ok(authSent.length === 1 && authSent[0].password === 'hunter2', 'JOIN SERVER sends it', J(authSent));
    deliver(s1, { t: 'auth', ok: true });
    ok(s1.sent.filter(m => m.t === 'list').length === firstList + 1 && R('return Net.needAuth;') === false && JSON.parse(store.bw_pass || '{}')[R('return Net.url;')] === 'hunter2',
      'once it is accepted the game list is asked for again (the first ask was ignored), and the password is remembered for this server', J({ lists: s1.sent.filter(m => m.t === 'list').length, pass: store.bw_pass }));
    R('Net.disconnect();'); $('multiBtn').click();
    const s2 = sockets[sockets.length - 1]; s2.readyState = 1; s2.onopen();
    deliver(s2, { t: 'hello', id: 4, state: 'lobby', rooms: true, browser: true, password: true });
    ok(s2.sent.some(m => m.t === 'auth' && m.password === 'hunter2'), 'the next time, the remembered password goes at once, before anyone is asked', J(s2.sent));
    deliver(s2, { t: 'auth', ok: false, msg: 'Wrong password.' });
    ok(!('play.example' in JSON.parse(store.bw_pass || '{}')) && !JSON.parse(store.bw_pass || '{}')[R('return Net.url;')] && /Wrong password\./.test($('lobby').innerHTML), 'a remembered password the server refuses is forgotten, and the box says why', J({ pass: store.bw_pass }));
  }

  const { pass, fail } = counts();
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); killAll(); process.exit(1); });
