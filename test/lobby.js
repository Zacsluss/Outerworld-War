// THE ONLINE LOBBY, SEVENTH SESSION (the user's item 2: "find what makes a real-time strategy game lobby great ... we
// need a truly sophisticated set of menus and online lobby"). RESEARCH-LOBBY.md is the research: what StarCraft II,
// Forged Alliance Forever, Beyond All Reason and Age of Empires II share, and what this game lacked of it.
//   node test/lobby.js [port=8810]      (uses port, port+1, port+2)
//
// RELAY (real sockets against test/serve.js):
//   1. READY MEANS READY: START refuses while a human other than the host has not readied, and names who
//   2. READY IS CONSENT: a change to the game on screen withdraws every ready; a player's own change, only theirs
//   3. SYSTEM LINES: joins, leaves, kicks and a new host are said in the room
//   4. LATENCY: the relay measures every member's round trip itself and tells the room
//   5. LOCK TEAMS, SHUFFLE, THE NUDGE
//   6. AN EXISTING GAME: a link or a list click to a game that has gone says so instead of making an empty room
//   7. THE MAP'S SEATS: no join, A.I. or START past the chosen map's start positions (the fifth player on a four-start
//      map used to be built in player one's base)
//   8. THE RULES: host-only, shape-checked, carried into the start message; the browser row carries what it needs
// CLIENT (js/net.js in a VM, with the real UI.skirmish* functions loaded):
//   9. the browser's filter, sort and quick-join choice, the invite link both ways
//  10. gameOptions: rules at their defaults start the game they always started; rules set start what they say
//  11. the room draws what the relay said: system lines escaped, latency, the nudge, the seat cap, START's reason
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const PORT = parseInt(process.argv[2] || '8810', 10);
if (typeof WebSocket === 'undefined') { console.error('needs Node 22+ (global WebSocket)'); process.exit(2); }
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const servers = [];
function serve(port, env) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port), '3'], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_COUNTDOWN: '0', BW_LOBBY_PING: '250' }, env || {}) });
  s.stdout.on('data', () => { }); s.stderr.on('data', d => console.log('  [relay err] ' + String(d).trim()));
  servers.push(s); return s;
}
function killAll() { for (const s of servers) { try { s.kill(); } catch (e) { } } }
process.on('exit', killAll);
function client(port, tag) {
  const c = { tag, msgs: [], lobby: null, started: null, errors: [], sys: [], chats: [], rings: [], pings: [] };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => {
    const m = JSON.parse(ev.data); c.msgs.push(m);
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'start') c.started = m;
    if (m.t === 'error') c.errors.push(m);
    if (m.t === 'sys') c.sys.push(m);
    if (m.t === 'chat') c.chats.push(m);
    if (m.t === 'ring') c.rings.push(m);
    if (m.t === 'pings') c.pings.push(m);
    if (m.t === 'lping' && c.answerPings !== false) c.send({ t: 'lpong', n: m.n });
  };
  c.send = o => { try { c.ws.send(JSON.stringify(o)); } catch (e) { } };
  c.open = new Promise((r, j) => { c.ws.onopen = r; c.ws.onerror = () => j(new Error('socket error on port ' + port + ' -- is another relay holding it?')); setTimeout(() => j(new Error('no open within 10 s')), 10000).unref(); });
  c.open.catch(() => { });
  c.close = () => { try { c.ws.close(); } catch (e) { } };
  c.me = () => c.lobby && c.lobby.players.find(p => p.name === tag);
  return c;
}
const who = (c, name) => c.lobby && c.lobby.players.find(p => p.name === name);

(async () => {
  // ===========================================================================================
  // RELAY
  // ===========================================================================================
  serve(PORT);
  await sleep(500);
  const A = client(PORT, 'Ada'), B = client(PORT, 'Ben'), C = client(PORT, 'Cy');
  await Promise.all([A.open, B.open, C.open]);
  A.send({ t: 'join', name: 'Ada', race: 'T', create: true, title: 'Lobby test' }); await sleep(250);
  const code = A.lobby ? A.lobby.room : 'NOROOM';
  B.send({ t: 'join', name: 'Ben', race: 'Z', room: code, existing: true }); await sleep(250);

  // ---- 1. READY MEANS READY ----
  A.send({ t: 'start' }); await sleep(300);
  const refused = A.errors.pop();
  ok(!A.started && !B.started && refused && /Ben/.test(refused.msg) && /ready/i.test(refused.msg),
    'START refuses while a human other than the host has not readied, and tells the host who', JSON.stringify({ started: !!A.started, err: refused }));
  const waitLine = B.sys.find(m => m.ev === 'waiting');
  ok(waitLine && Array.isArray(waitLine.names) && waitLine.names.join() === 'Ben', '...and the whole room hears who the start is waiting on', JSON.stringify(waitLine));

  // ---- 2. READY IS CONSENT ----
  const readyBen = async () => { B.send({ t: 'set', ready: true }); await sleep(200); };
  await readyBen();
  ok(who(A, 'Ben').ready === true && A.sys.some(m => m.ev === 'ready' && m.name === 'Ben'), 'READY is per player and the room is told', JSON.stringify(who(A, 'Ben')));
  A.send({ t: 'set', layout: 'bloodbath' }); await sleep(250);
  ok(who(A, 'Ben').ready === false && B.sys.some(m => m.ev === 'unready' && m.why === 'map') && B.sys.some(m => m.ev === 'map' && m.layout === 'bloodbath'),
    'the host changing the MAP withdraws every ready, and says both what changed and why the ready went', JSON.stringify({ ben: who(A, 'Ben'), sys: B.sys.slice(-2) }));
  const consent = [];
  for (const [label, msg] of [['speed', { t: 'set', speed: 3 }], ['rules', { t: 'set', rules: { bank: 'fast' } }], ['an added A.I.', { t: 'addai', race: 'P', difficulty: 'easy', team: 2 }]]) {
    await readyBen(); A.send(msg); await sleep(250); consent.push([label, who(A, 'Ben').ready]);
  }
  const aiId = (A.lobby.players.find(p => p.ai) || {}).id;
  await readyBen(); A.send({ t: 'set', id: aiId, difficulty: 'hard' }); await sleep(250); consent.push(['a changed A.I.', who(A, 'Ben').ready]);
  ok(consent.every(x => x[1] === false), '...and so does the SPEED, the RULES, adding an A.I. and changing one', JSON.stringify(consent));
  await readyBen(); A.send({ t: 'set', title: 'Renamed' }); await sleep(250);
  ok(who(A, 'Ben').ready === true, 'renaming the game is not a change to the game: the ready stands', JSON.stringify(who(A, 'Ben')));
  C.send({ t: 'join', name: 'Cy', race: 'P', room: code, existing: true }); await sleep(250);
  C.send({ t: 'set', ready: true }); await sleep(200);
  B.send({ t: 'set', race: 'T' }); await sleep(250);
  ok(who(A, 'Ben').ready === false && who(A, 'Cy').ready === true, 'a player changing their OWN race withdraws only their own ready', JSON.stringify(A.lobby.players.map(p => p.name + (p.ready ? '*' : ''))));

  // ---- 3. SYSTEM LINES ----
  ok(A.sys.some(m => m.ev === 'join' && m.name === 'Cy'), 'a join is said in the room', JSON.stringify(A.sys.filter(m => m.ev === 'join')));
  B.send({ t: 'chat', text: 'hi' }); await sleep(200);
  const hi = A.chats.find(m => m.text === 'hi');
  ok(hi && hi.id === who(A, 'Ben').id && hi.from === 'Ben', 'a chat line carries who said it, so the lobby can colour it by seat', JSON.stringify(hi));
  A.send({ t: 'kick', id: aiId }); await sleep(250);
  ok(B.sys.some(m => m.ev === 'kick' && /Computer/.test(m.name) && m.ai === true), 'a kick is said in the room', JSON.stringify(B.sys.filter(m => m.ev === 'kick')));

  // ---- 4. LATENCY ----
  const pingsSeen = B.pings.length ? B.pings[B.pings.length - 1].list : [];
  const ids = [who(A, 'Ada').id, who(A, 'Ben').id, who(A, 'Cy').id];
  ok(pingsSeen.length >= 2 && pingsSeen.every(x => typeof x.ms === 'number' && x.ms >= 0 && x.ms < 2000) && ids.slice(0, 2).every(id => pingsSeen.some(x => x.id === id)),
    'the relay measures each member\'s round trip itself and tells the room everybody\'s at once', JSON.stringify(pingsSeen));
  A.send({ t: 'addai', race: 'Z' }); await sleep(250);
  const aiRow = A.lobby.players.find(p => p.ai), benRow = who(A, 'Ben');
  ok(aiRow && aiRow.ping === null && typeof benRow.ping === 'number', '...an A.I. has no latency, and a human\'s rides the lobby state too', JSON.stringify({ ai: aiRow && aiRow.ping, ben: benRow.ping }));

  // ---- 5. LOCK TEAMS, SHUFFLE, THE NUDGE ----
  A.send({ t: 'set', lockTeams: true }); await sleep(250);
  const benTeam = who(A, 'Ben').team;
  B.send({ t: 'set', team: benTeam === 1 ? 2 : 1 }); await sleep(250);
  ok(A.lobby.lockTeams === true && who(A, 'Ben').team === benTeam && B.sys.some(m => m.ev === 'lock' && m.on === true), 'LOCKED TEAMS: a player can no longer move themselves, and the room was told', JSON.stringify({ lock: A.lobby.lockTeams, team: who(A, 'Ben').team }));
  A.send({ t: 'set', id: aiRow.id, team: 1 }); A.send({ t: 'set', team: 2 }); await sleep(250);
  ok(A.lobby.players.find(p => p.ai).team === 1 && who(A, 'Ada').team === 2, '...but the host still moves an A.I. and themselves', JSON.stringify(A.lobby.players.map(p => p.name + '/' + p.team)));
  A.send({ t: 'set', lockTeams: false }); await sleep(200); B.send({ t: 'set', team: benTeam === 1 ? 2 : 1 }); await sleep(250);
  ok(who(A, 'Ben').team !== benTeam, 'unlocked, the player moves again', JSON.stringify(who(A, 'Ben')));
  const D = client(PORT, 'Di'); await D.open; D.send({ t: 'join', name: 'Di', race: 'T', room: code, existing: true }); await sleep(250);
  A.send({ t: 'addai', race: 'P', team: 1 }); await sleep(200);
  B.send({ t: 'set', ready: true }); C.send({ t: 'set', ready: true }); await sleep(200);
  const before = A.lobby.players.map(p => p.id).join();
  C.send({ t: 'shuffle' }); await sleep(250);
  const notHostShuffle = !A.sys.some(m => m.ev === 'shuffle');
  A.send({ t: 'shuffle' }); await sleep(300);
  const sizes = {}; for (const p of A.lobby.players) sizes[p.team] = (sizes[p.team] || 0) + 1;
  const counts = Object.values(sizes);
  ok(notHostShuffle && A.sys.some(m => m.ev === 'shuffle') && A.lobby.players.map(p => p.id).join() === before && Math.max(...counts) - Math.min(...counts) <= 1 && counts.length >= 2,
    'SHUFFLE is the host\'s alone, keeps every seat where it was, and deals the teams to within one of each other', JSON.stringify({ sizes, notHostShuffle }));
  ok(who(A, 'Ben').ready === false && who(A, 'Cy').ready === false, '...and it withdraws the readies: the teams are part of the game on screen', JSON.stringify(A.lobby.players.map(p => p.name + (p.ready ? '*' : ''))));
  C.send({ t: 'set', ready: true }); await sleep(200);
  C.send({ t: 'ring', id: who(A, 'Ben').id }); A.send({ t: 'ring', id: who(A, 'Cy').id }); A.send({ t: 'ring', id: who(A, 'Ben').id }); await sleep(250);
  ok(B.rings.length === 1 && B.rings[0].from === 'Ada' && C.rings.length === 0, 'THE NUDGE reaches a player who has not readied, from the host only, and never one who has', JSON.stringify({ ben: B.rings, cy: C.rings }));

  // ---- host leaves: the line, and the new host ----
  D.send({ t: 'leave' }); await sleep(250);
  ok(A.sys.some(m => m.ev === 'leave' && m.name === 'Di'), 'a leave is said in the room', JSON.stringify(A.sys.filter(m => m.ev === 'leave')));
  A.close(); await sleep(400);
  ok(B.sys.some(m => m.ev === 'leave' && m.name === 'Ada') && B.sys.some(m => m.ev === 'host' && m.name === 'Ben') && who(B, 'Ben').host === true,
    'when the host goes, the room is told who holds it now', JSON.stringify(B.sys.slice(-3)));
  B.close(); C.close(); D.close(); await sleep(300);

  // ---- 6. AN EXISTING GAME ----
  const P2 = PORT + 1; serve(P2); await sleep(500);
  const E = client(P2, 'Eve'), F = client(P2, 'Fox'); await Promise.all([E.open, F.open]);
  F.send({ t: 'list' }); await sleep(150);
  E.send({ t: 'join', name: 'Eve', race: 'T', room: 'GONE42', existing: true }); await sleep(250);
  const goneErr = E.errors[E.errors.length - 1];
  ok(!E.lobby && goneErr && goneErr.gone === true && /ended|exist/i.test(goneErr.msg), 'a link or a list click to a game that has gone is refused and says so', JSON.stringify(goneErr));
  E.send({ t: 'join', name: 'Eve', race: 'T', room: 'GONE42' }); await sleep(250);
  ok(E.lobby && E.lobby.players.length === 1, '...where a typed code still opens a private room of its own, as it always did', JSON.stringify(E.lobby && E.lobby.players));

  // ---- 7. THE MAP'S SEATS ----
  E.send({ t: 'leave' }); await sleep(200);
  E.send({ t: 'join', name: 'Eve', race: 'T', create: true, title: 'Seats' }); await sleep(250);
  const scode = E.lobby.room;
  E.send({ t: 'set', layout: 'valley', cap: 2 }); await sleep(250);
  E.send({ t: 'addai', race: 'Z' }); await sleep(250);
  E.send({ t: 'addai', race: 'P' }); await sleep(250);
  F.send({ t: 'join', name: 'Fox', race: 'P', room: scode, existing: true }); await sleep(250);
  const fullErr = F.errors[F.errors.length - 1];
  const row = (F.msgs.filter(m => m.t === 'lobbies').pop() || { rooms: [] }).rooms.find(r => r.code === scode);
  ok(E.lobby.cap === 2 && E.lobby.players.length === 2 && !F.lobby && fullErr && /full \(2 players\)/.test(fullErr.msg) && row && row.cap === 2,
    'on a two-start map the room holds two: a second A.I. and a third player are refused, and the list shows two seats', JSON.stringify({ cap: E.lobby.cap, players: E.lobby.players.length, err: fullErr, row }));
  E.send({ t: 'set', cap: 1 }); await sleep(200); E.send({ t: 'start' }); await sleep(250);
  const capErr = E.errors[E.errors.length - 1];
  ok(!E.started && capErr && /1 start positions and there are 2 players/.test(capErr.msg), 'a room already past its map\'s starts refuses START and says why', JSON.stringify(capErr));

  // ---- 8. THE RULES ----
  E.send({ t: 'set', cap: 8, layout: 'temple' }); await sleep(150);
  E.send({ t: 'set', rules: { bank: 'rich', hazard: 'none', size: 'huge', night: '<b>on</b>', bogus: 'x' } }); await sleep(250);
  const r1 = E.lobby.rules;
  ok(r1 && r1.bank === 'rich' && r1.hazard === 'none' && r1.size === 'huge' && r1.night === 'map' && !('bogus' in r1),
    'the host sets the rules; a value that is not a plain word is refused and an unknown key ignored', JSON.stringify(r1));
  F.send({ t: 'join', name: 'Fox', race: 'P', room: scode, existing: true }); await sleep(250);
  F.send({ t: 'set', rules: { bank: 'standard' } }); await sleep(250);
  ok(E.lobby.rules.bank === 'rich', 'a player who is not the host cannot change a rule', JSON.stringify(E.lobby.rules));
  const lastRow = (F.msgs.filter(m => m.t === 'lobbies').pop() || { rooms: [] }).rooms.find(r => r.code === scode) || {};
  const listMsg = F.msgs.filter(m => m.t === 'lobbies').pop() || {};
  ok(lastRow.rules && lastRow.rules.bank === 'rich' && typeof lastRow.created === 'number' && lastRow.speed === 6 && typeof listMsg.online === 'number' && listMsg.online >= 2,
    'the browser row carries the rules, the speed and when it was hosted, and the list says how many are connected', JSON.stringify({ row: lastRow, online: listMsg.online }));
  F.send({ t: 'set', ready: true }); await sleep(150); E.send({ t: 'kick', id: E.lobby.players.find(p => p.ai).id }); await sleep(150);
  F.send({ t: 'set', ready: true }); await sleep(150); E.send({ t: 'start' }); await sleep(400);
  ok(F.started && F.started.rules && F.started.rules.bank === 'rich' && F.started.rules.hazard === 'none', 'the rules ride the start message to every client', JSON.stringify(F.started && F.started.rules));
  E.close(); F.close(); await sleep(300);

  // ---- 1b. the ready check can be turned off for the suites that start games to test something else ----
  const P3 = PORT + 2; serve(P3, { BW_READY: '0' }); await sleep(500);
  const G1 = client(P3, 'Gil'), G2 = client(P3, 'Hal'); await Promise.all([G1.open, G2.open]);
  G1.send({ t: 'join', name: 'Gil', race: 'T', room: 'OFFREADY' }); await sleep(200);
  G2.send({ t: 'join', name: 'Hal', race: 'Z', room: 'OFFREADY' }); await sleep(200);
  G1.send({ t: 'start' }); await sleep(300);
  ok(G1.started && G2.started && G1.lobby.readyCheck === false, 'BW_READY=0 starts without the check, and the lobby state says it is off', JSON.stringify({ started: !!G1.started, check: G1.lobby && G1.lobby.readyCheck }));
  G1.close(); G2.close(); await sleep(200);
  killAll();

  // ===========================================================================================
  // CLIENT
  // ===========================================================================================
  const els = new Map();
  const elFor = id => { if (!els.has(id)) els.set(id, { id, innerHTML: '', style: {}, value: '', querySelectorAll: () => [], classList: { toggle() { } } }); return els.get(id); };
  const ctx = {
    console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, clearTimeout, setInterval() { return 0; },
    addEventListener() { }, requestAnimationFrame() { }, Image: function () { }, WebSocket: function () { },
    localStorage: { _v: {}, getItem(k) { return this._v[k] || null; }, setItem(k, v) { this._v[k] = String(v); } },
    location: { protocol: 'http:', host: 'play.example:8765', origin: 'http://play.example:8765', pathname: '/' },
    document: { getElementById: elFor, createElement: () => ({ style: {}, getContext: () => null, addEventListener() { }, appendChild() { } }), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
  };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  const R = src => vm.runInContext('(() => {' + src + '})()', ctx);
  const J = v => JSON.stringify(v);

  // ---- 9. the browser's three decisions, and the link ----
  const rooms = [
    { code: 'AAAA11', title: 'Open quiet', host: 'Q', players: 2, humans: 1, cap: 8, state: 'lobby', layout: 'temple', created: 100 },
    { code: 'BBBB22', title: 'Open busy', host: 'Zed', players: 3, humans: 3, cap: 8, state: 'lobby', layout: 'valley', created: 300 },
    { code: 'CCCC33', title: 'Full one', host: 'F', players: 2, humans: 2, cap: 2, state: 'lobby', layout: 'valley', created: 200 },
    { code: 'DDDD44', title: 'Running', host: 'R', players: 4, humans: 4, cap: 4, state: 'playing', layout: 'temple', created: 50 },
    { code: 'EEEE55', title: 'Also open', host: 'Q2', players: 1, humans: 1, cap: 4, state: 'lobby', layout: 'bloodbath', created: 10 },
  ];
  const f = filt => R('return Net.filterRooms(' + J(rooms) + ', ' + J(filt) + ').map(r => r.code);');
  ok(J(f({})) === J(['BBBB22', 'AAAA11', 'EEEE55', 'DDDD44', 'CCCC33']), 'the list puts joinable games first, then by humans in them, then by everyone in them', J(f({})));
  ok(J(f({ full: false, playing: false })) === J(['BBBB22', 'AAAA11', 'EEEE55']), 'full and running games can each be hidden', J(f({ full: false, playing: false })));
  ok(J(f({ q: 'twilight' })) === J(['BBBB22', 'CCCC33']) && J(f({ q: 'zed' })) === J(['BBBB22']) && J(f({ q: 'dddd44' })) === J(['DDDD44']), 'search reads the title, the host, the map\'s NAME and the code, in any case', J([f({ q: 'twilight' }), f({ q: 'zed' }), f({ q: 'dddd44' })]));
  ok(J(f({ sort: 'newest' })) === J(['BBBB22', 'CCCC33', 'AAAA11', 'DDDD44', 'EEEE55']) && f({ sort: 'name' })[0] === 'EEEE55', 'and it sorts by newest or by name on request', J([f({ sort: 'newest' }), f({ sort: 'name' })]));
  ok(R('return Net.quickPick(' + J(rooms) + ').code;') === 'BBBB22' && R('return Net.quickPick(' + J(rooms.filter(r => r.code !== 'BBBB22' && r.code !== 'AAAA11' && r.code !== 'EEEE55')) + ');') === null,
    'QUICK JOIN picks the open game with the most humans, and nothing (so it hosts) when every game is full or running', '');
  const inv = s => R('return Net.parseInvite(' + J(s) + ');');
  ok(J(inv('?join=ab12cd')) === J({ code: 'AB12CD', server: '' }) && J(inv('?x=1&join=WXYZ99&server=wss%3A%2F%2Frelay.example%2Fws')) === J({ code: 'WXYZ99', server: 'wss://relay.example/ws' }),
    'an invite link reads the room code and a ws:// or wss:// server', J([inv('?join=ab12cd'), inv('?x=1&join=WXYZ99&server=wss%3A%2F%2Frelay.example%2Fws')]));
  ok(inv('') === null && inv('?join=AB') === null && inv('?join=AB12CD%3Cb%3E') === null && inv('?join=AB12CD&server=javascript%3Aalert(1)').server === '',
    '...and nothing else: no code, a short code, a code with more in it, or a server that is not a socket', J([inv(''), inv('?join=AB'), inv('?join=AB12CD%3Cb%3E'), inv('?join=AB12CD&server=javascript%3Aalert(1)')]));
  ok(R('Net.url = Net.defaultUrl(); return Net.inviteLink("AB12CD");') === 'http://play.example:8765/?join=AB12CD'
    && R('Net.url = "ws://elsewhere:9000/ws"; return Net.inviteLink("AB12CD");') === 'http://play.example:8765/?join=AB12CD&server=' + encodeURIComponent('ws://elsewhere:9000/ws'),
    'the host\'s link is the page with ?join=CODE, and names the server only when it is not the page\'s own', R('return Net.inviteLink("AB12CD");'));
  ok(R('Net.urlTyped = "ws://x:1/ws"; Net.name = "Zac"; Net.race = "P"; Net.saveIdentity(); return Net.loadIdentity();').name === 'Zac' && R('return Net.loadIdentity().race;') === 'P',
    'the name, the typed server and the race are remembered for next time', J(R('return Net.loadIdentity();')));

  // ---- 10. gameOptions ----
  const startMsg = rules => ({ seed: 12345, layout: 'temple', you: 1, rules, players: [{ name: 'A', race: 'T', team: 1, human: true }, { name: 'B', race: 'Z', team: 2, human: true }, { name: 'C', race: 'P', team: 2, human: false, difficulty: 'hard', style: 'rusher' }] });
  const plain = R('return Net.gameOptions(' + J(startMsg(undefined)) + ');');
  const defaults = R('return Net.gameOptions(' + J(startMsg({ bank: 'standard', hazard: 'map', night: 'map', features: 'map', derelicts: 'map', wildlife: 'map', size: 'auto' })) + ');');
  ok(plain.layout === 'temple' && plain.players.every(p => p.minerals === undefined && p.gas === undefined) && J(plain) === J(defaults) && plain.human === 1 && plain.net === true && plain.seed === 12345,
    'rules at their defaults start exactly the game a lobby without rules started: the plain layout id, no purses', J(plain));
  const rich = R('return Net.gameOptions(' + J(startMsg({ bank: 'rich', hazard: 'none', night: 'on' })) + ');');
  const expectId = R('return UI.skirmishLayoutId({ map: "temple", seed: 12345, hazard: "none", night: "on", features: "map", derelicts: "map", wildlife: "map", size: "auto" });');
  const bank = R('return UI.setupBank("rich");');
  ok(rich.layout === expectId && rich.layout !== 'temple' && rich.players.every(p => p.minerals === bank[2] && p.gas === bank[3]),
    'rules set become the skirmish screen\'s own composed layout id and purses', J({ layout: rich.layout, expect: expectId, purse: rich.players[0] }));
  const played = R('const o = Net.gameOptions(' + J(startMsg({ bank: 'rich', hazard: 'none', night: 'on' })) + '); UI.registerSkirmishLayout(o.layout); G.init(o); UI.applyStartingBank(o); return { m: G.players.map(p => p.minerals), g: G.players.map(p => p.gas), night: !!(G.map.layout ? G.map.layout.dayNight : MAP_LAYOUTS[o.layout].dayNight), hazard: !!G.map.hazard };');
  ok(played.m.every(v => v === bank[2]) && played.g.every(v => v === bank[3]) && played.hazard === false,
    '...and the game those options make starts with that bank and without its weather', J(played));
  const gen = R('return Net.gameOptions({ seed: 777, layout: "gen:" + Archetypes.keys[0], you: 0, rules: { size: "auto" }, players: [{ name: "A", race: "T", team: 1, human: true }] }).layout;');
  ok(gen === R('return UI.skirmishLayoutId({ map: "gen:" + Archetypes.keys[0], seed: 777, size: "auto" });') && !/^gen:/.test(gen), 'a procedural map grows from the relay\'s seed exactly as a skirmish on that seed would', gen);

  // ---- 11. the room draws what the relay said ----
  const lobby = extra => Object.assign({ t: 'lobby', room: 'ROOM42', title: 'T', listed: true, state: 'lobby', speed: 6, layout: 'temple', count: 0, cap: 4, delay: 3, readyCheck: true, lockTeams: false,
    rules: { bank: 'standard', hazard: 'map', night: 'map', features: 'map', derelicts: 'map', wildlife: 'map', size: 'auto' },
    players: [{ id: 7, name: 'Me', race: 'T', team: 1, host: true, ping: 12 }, { id: 8, name: 'Slow', race: 'Z', team: 2, ready: false, ping: 400 }, { id: -1, name: 'Computer 0', ai: true, difficulty: 'hard', style: 'rusher', race: 'P', team: 2, ping: null }] }, extra || {});
  const html = () => elFor('lobby').innerHTML;
  ctx.__m = lobby();
  R('Net.connected = true; Net.id = 7; Net.chatLog = []; Net.pings = {}; Net.lobby = null; Net.handle(__m);');
  let h = html();
  ok(/data-ring="8"/.test(h) && /class="lbPing q3" data-ping="7"/.test(h) && /class="lbPing q1 slow" data-ping="8"/.test(h) && !/data-ping="-1"/.test(h),
    'the host sees a bell on the player who has not readied, and every human\'s latency, slow ones marked against the command delay', h.slice(0, 300));
  ok(/id="lbStart" class="lbWaiting" title="Slow not ready yet"/.test(h) && /Waiting for Slow to ready up/.test(h), 'START says who it is waiting on before it is pressed', h.slice(0, 200));
  ok(/data-rule="bank"/.test(h) && /data-rule="hazard"/.test(h) && /id="lbLock"/.test(h) && /id="lbShuffle"/.test(h) && /INVITE LINK/.test(h), 'the host has the rules, LOCK, SHUFFLE and the invite link', h.slice(0, 200));
  ctx.__m2 = lobby({ players: [{ id: 7, name: 'Me', race: 'T', team: 1, ping: 12 }, { id: 8, name: 'Boss', race: 'Z', team: 2, host: true, ping: 30 }], lockTeams: true, rules: { bank: 'rich', hazard: 'none', night: 'map', features: 'map', derelicts: 'map', wildlife: 'map', size: 'auto' } });
  R('Net.handle(__m2);'); h = html();
  ok(!/data-rule=/.test(h) && !/data-ring=/.test(h) && !/data-slot="7" data-field="team"/.test(h) && /data-slot="7" data-field="race"/.test(h) && /Rich/.test(h) && /Locked by the host/.test(h),
    'a guest reads the rules and the lock, keeps their race, and loses their team choice while teams are locked', h.slice(0, 300));
  R('Net.handle({ t: "sys", ev: "join", name: "<img src=x onerror=x()>" }); Net.handle({ t: "chat", from: "Boss", id: 8, text: "<b>hi</b>" });'); h = html();
  ok(/class="lbSys">&lt;img src=x onerror=x\(\)&gt; joined\.</.test(h) && !/<img src=x/.test(h) && /<b style="color:[^"]+">Boss:<\/b> &lt;b&gt;hi&lt;\/b&gt;/.test(h),
    'a system line and a chat line are drawn escaped, the chat name in its seat\'s colour', (h.match(/lbChat" id="lbChatLog">[\s\S]{0,300}/) || [''])[0]);
  R('Net.handle({ t: "ring", from: "Boss" });'); h = html();
  ok(/id="lbReady" class=" lbRing"/.test(h), 'THE NUDGE makes READY pulse', (h.match(/<button id="lbReady"[^>]*>/) || [''])[0]);
  ctx.__m3 = lobby({ cap: 2 }); R('Net.handle(__m3);'); h = html();
  ok(/class="lbOver">3\/2 players/.test(h) && /has 2 start positions and there are 3 players/.test(h) && !/data-addai=/.test(h),
    'a room past its map\'s starts says so in the header and above the buttons, and offers no more A.I.', h.slice(0, 300));
  R('Net.handle({ t: "pings", list: [{ id: 8, ms: 44 }] });');
  ok(R('return Net.pings[8];') === 44, 'a pings message updates the numbers the lobby draws from', R('return JSON.stringify(Net.pings);'));
  const sent = []; ctx.__sent = sent; R('Net.send = m => __sent.push(m); Net.handle({ t: "lping", n: 5 });');
  ok(sent.length === 1 && sent[0].t === 'lpong' && sent[0].n === 5, 'a lobby ping is answered with its own number', J(sent));
  sent.length = 0; ctx.__m4 = lobby({ cap: 8 }); R('Net.handle(__m4);');
  ok(sent.some(m => m.t === 'set' && m.cap === 4), 'the host\'s client tells the relay how many starts the chosen map has (Lost Ruins: four)', J(sent));

  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); killAll(); process.exit(1); });
