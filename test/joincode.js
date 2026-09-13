// JOIN BY CODE JOINS A GAME THAT EXISTS (tenth session, item 5; the user: "join by code should not work if no lobbies exist
// with the code used"). In the user's playtest the code "fewrg" matched no game, and the relay made a new room FEWRG with
// the typist as its host, because the button sent `existing: false`. HOST GAME is the way to make a room.
//   node test/joincode.js [port=8900]
//
// RELAY (real sockets against test/serve.js):
//   1. a code that matches a game joins it; a code that matches none is refused with the code named, and makes no room
//   2. a join with no flags (scripts, the LAN default room) still makes one, as before
// CLIENT (the page in a VM):
//   3. the JOIN BY CODE button and Enter in the code box ask for an existing game by code
//   4. a refusal is said, and leaves the browser on the game list with no room remembered
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { spawn } = require('child_process');
const { ok, counts, mkDom, root } = require('./_harness');
const PORT = parseInt(process.argv[2] || '8900', 10);
const J = v => JSON.stringify(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const servers = [];
function serve(port) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port), '3'], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_COUNTDOWN: '0', BW_LOBBY_PING: '60000' }) });
  s.out = []; s.stdout.on('data', d => s.out.push(String(d))); s.stderr.on('data', d => console.log('  [relay err] ' + String(d).trim()));
  servers.push(s); return s;
}
process.on('exit', () => { for (const s of servers) { try { s.kill(); } catch (e) { } } });
function client(port) {
  const c = { msgs: [], lobby: null, errors: [], lobbies: null };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'lobby') c.lobby = m; if (m.t === 'error') c.errors.push(m); if (m.t === 'lobbies') c.lobbies = m; if (m.t === 'lping') c.send({ t: 'lpong', n: m.n }); };
  c.send = o => { try { c.ws.send(JSON.stringify(o)); } catch (e) { } };
  c.open = new Promise((r, j) => { c.ws.onopen = r; c.ws.onerror = () => j(new Error('socket error on port ' + port + ' -- is another relay holding it?')); setTimeout(() => j(new Error('no open within 10 s')), 10000).unref(); });
  c.open.catch(() => { });
  return c;
}

(async () => {
  if (typeof WebSocket === 'undefined') { console.log('FAIL needs Node 22+ (global WebSocket)'); process.exit(1); }
  serve(PORT); await sleep(500);
  const A = client(PORT), B = client(PORT), C = client(PORT), D = client(PORT);
  await Promise.all([A.open, B.open, C.open, D.open]);

  console.log('--- 1. a code joins a game that exists, and only that ---');
  A.send({ t: 'join', name: 'Ada', race: 'T', create: true, title: 'Code test' }); await sleep(250);
  const code = A.lobby ? A.lobby.room : 'NOROOM';
  A.send({ t: 'set', listed: false }); await sleep(150);
  B.send({ t: 'join', name: 'Ben', race: 'Z', room: code.toLowerCase(), existing: true, byCode: true }); await sleep(250);
  ok(B.lobby && B.lobby.room === code && B.lobby.players.some(p => p.name === 'Ben') && B.lobby.players.some(p => p.name === 'Ada' && p.host),
    'the code of a private game joins it, in any case, with its host still hosting', J(B.lobby && B.lobby.players));
  C.send({ t: 'join', name: 'Cy', race: 'P', room: 'fewrg', existing: true, byCode: true }); await sleep(250);
  const err = C.errors[0];
  ok(!C.lobby && err && err.gone === true && /No game here has the code FEWRG/.test(err.msg), 'a code no game has is refused, and the refusal names the code (the playtest\'s "fewrg" made a room)', J({ lobby: C.lobby, err }));
  D.send({ t: 'join', name: 'Di', race: 'T', room: 'FEWRG', existing: true, byCode: true }); await sleep(250);
  ok(!D.lobby && D.errors.length === 1 && /FEWRG/.test(D.errors[0].msg), '...and it made no room: the next player to type it is refused too', J({ lobby: D.lobby, errors: D.errors }));
  C.send({ t: 'join', name: 'Cy', race: 'P', room: code, existing: true, byCode: true }); await sleep(250);
  ok(C.lobby && C.lobby.room === code, 'the refused client can still join a real game by its code afterwards', J(C.lobby && C.lobby.players));

  console.log('--- 2. a join with no flags still makes a room ---');
  D.send({ t: 'join', name: 'Di', race: 'T', room: 'SCRIPT1' }); await sleep(250);
  ok(D.lobby && D.lobby.room === 'SCRIPT1' && D.lobby.players.length === 1, 'a plain join (the LAN room, scripts, the older suites) still makes its room as before', J(D.lobby));
  for (const c of [A, B, C, D]) try { c.ws.close(); } catch (e) { }
  for (const s of servers) try { s.kill(); } catch (e) { }

  console.log('--- 3. the page asks for an existing game ---');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
  const store = { bw_net: J({ name: 'Zac', url: '', race: 'R' }), bw_intro: '1' };
  const document = mkDom(html), loaded = [], sockets = [];
  function WS(url) { this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); }
  WS.prototype.send = function (s) { this.sent.push(JSON.parse(s)); };
  WS.prototype.close = function () { this.readyState = 3; };
  const cx = {
    console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { },
    requestAnimationFrame() { }, Image: function () { }, WebSocket: WS, navigator: {},
    addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { protocol: 'http:', host: 'play.example:8765', origin: 'http://play.example:8765', pathname: '/', search: '' }, history: { replaceState() { } }, document,
  };
  cx.window = cx; cx.globalThis = cx; vm.createContext(cx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), cx, { filename: f + '.js' });
  vm.runInContext('UI.init = () => {}; UI.makeTicker = () => 1; Render.reset = () => {};', cx);
  for (const fn of loaded) fn();
  const R = src => vm.runInContext('(() => {' + src + '})()', cx);
  const page = R(`Net.ws = new WebSocket('ws://play.example:8765/ws'); Net.connected = true; Net.browsing = true; Net.name = 'Zac'; Net.lobby = null; Net.lobbies = [];
    Net.render();
    const $ = Net.finder(document.getElementById('lobby')), box = $('lbCode'), btn = $('lbJoinCode');
    if (!box || !btn) return { found: false };
    box.value = 'fewrg'; btn.onclick();
    const clicked = Net.ws.sent.filter(m => m.t === 'join').pop();
    box.value = 'abcd12'; box.onkeydown({ key: 'Enter' });
    const entered = Net.ws.sent.filter(m => m.t === 'join').pop();
    return { found: true, clicked, entered };`);
  ok(page.found && page.clicked && page.clicked.existing === true && page.clicked.byCode === true && page.clicked.room === 'fewrg',
    'JOIN BY CODE asks the relay for a game that EXISTS, by code (it sent existing: false, which made the room)', J(page));
  ok(page.entered && page.entered.existing === true && page.entered.byCode === true && page.entered.room === 'abcd12', '...and so does Enter in the code box', J(page.entered));

  console.log('--- 4. a refusal is said and forgotten ---');
  const after = R(`Net.room = 'fewrg'; Net.handle({ t: 'error', msg: 'No game here has the code FEWRG.', gone: true });
    return { room: Net.room, lastError: Net.lastError, lobby: Net.lobby, listed: Net.ws.sent.filter(m => m.t === 'list').length };`);
  ok(after.lastError === 'No game here has the code FEWRG.' && after.room === '' && !after.lobby && after.listed >= 1,
    'the refusal is shown, the typed code is not kept as this client\'s room, and the game list is asked for again', J(after));

  const { pass, fail } = counts();
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL the suite threw: ' + (e && e.stack || e)); for (const s of servers) try { s.kill(); } catch (x) { } process.exit(1); });
