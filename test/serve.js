// Static server + multiplayer relay (WebSocket, no dependencies):  node test/serve.js [port] [delay]
// The relay keeps every command batch of the running game so a dropped player can rejoin and
// re-simulate, and it picks the frame at which a dropped player's units stop so all clients agree.
//
// ROOMS. One relay holds many independent games, keyed by a short code a client sends with `join`.
// An empty or missing code means the room called LAN, so a client that never heard of rooms behaves
// exactly as it did before -- which is what keeps LAN play zero-friction and every existing net test
// passing unchanged.
//
// THE CODE IS THE ACCESS CONTROL FOR A ROOM NOBODY LISTED. On a LAN, reaching the server at all meant
// you were invited. Put the server behind a public tunnel -- which is how internet play works here, see
// PLAY-ONLINE.bat -- and the URL is no longer a secret, so anything with the link could walk into a
// lobby. A code the host shares out of band fixes that. Guessing wrong lands you in an empty room of
// your own, never in someone else's.
// THE LOBBY BROWSER (fifth session, the user's call). A room made with `join {create: true, title}` is
// LISTED: the relay makes up its code, and every client that asked for the list (`list`, on a socket
// with no room) is told the room's title, host, map, count and state, and joins it by that code the
// moment it clicks. A room reached by typing a code stays unlisted, so the privacy above still holds
// for anyone who wants it; the list is what makes a game findable by everyone else on the server.
// NO code is not a private room: it is the shared room called LAN, where everyone else with no code
// also lands -- the path test/net.js and test/net_many.js use, kept as it always was.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const root = path.join(__dirname, '..'); const port = parseInt(process.argv[2] || '8765');
// THE LOCKSTEP BUDGET, and on the internet it is the difference between "connects" and "playable".
// A command issued at frame F executes at F+DELAY on every client, and Net.ready() blocks a frame
// until every live player's batch for it has arrived. TPS is 24 and multiplayer runs at speed 1.0, so
// the default 3 is a 125 ms budget: generous on a LAN, and less than one round trip through a tunnel.
// Exceed it and nothing desyncs -- every client just waits, constantly, which reads as stutter.
// Server-set rather than per-client on purpose: it is sent to everyone in startMsg and all of them
// must use the same number or the lockstep is not lockstep. Clamped because 0 would schedule commands
// into a frame that has already been simulated.
const DELAY = Math.max(1, Math.min(20, parseInt(process.argv[3] || process.env.BW_DELAY || '3')));
// How far ahead of the room's newest batch a client's batch may claim to be. A client sends its batch
// for frame F + DELAY when it is at F, and it can only be at F once every other player's batch for F is
// in, so an honest lead over maxFrame(L) is at most DELAY (the first batch of a game reads DELAY + 1
// against an empty room). Measured against test/net_many.js and test/net.js before this number was
// chosen: net_many.js 65,256 batches, lead -2 to 4; net.js 36,411 batches, lead -2 to 4 (the 4s are each game's first batch). Without a window a batch at f = 2147483647 set that slot's lastF, maxFrame()
// with it, and every later rejoin's catch target and stop frame came from it. (REVIEW-M17 task 13)
const CMD_LEAD = 2 * DELAY + 24;
const MAX_PLAYERS = 8;          // humans + AI, the same ceiling `addai` has always had. `join` had none.
// READY MEANS READY (seventh session, item 2; FAF, BAR and Age of Empires II all launch only once every player has
// readied). START refuses while a human other than the host has not, and names who. BW_READY=0 turns the check off
// for the suites that start games to test something else, the way BW_COUNTDOWN=0 skips the count.
const READY_CHECK = process.env.BW_READY !== '0';
// SPECTATORS (item 2). A room holds up to this many beside its players. They take no seat, send no batch the lockstep waits
// on and never ready; they receive every batch and simulate the same game with the whole map in view. One can join a room
// in its lobby, during its countdown, or while it plays -- the last catches up from a player's snapshot like a rejoin does.
const MAX_SPECS = 8;
// LATENCY IN THE LOBBY (item 2; FAF shows every player's ping before the game). The relay measures each member's
// round trip itself with a numbered ping, so the number a lobby shows cannot be typed in by the client it describes.
// Lobby and countdown only: once the game runs, every command batch already proves the connection.
const LOBBY_PING_MS = Math.max(200, parseInt(process.env.BW_LOBBY_PING || '2000', 10) || 2000);
// THE SKIRMISH RULES A HOSTED GAME CARRIES (item 2): the keys the skirmish screen writes, which every client turns into
// the same G.init layout id and purses with UI.skirmishLayoutId and UI.setupBank, from the seed this relay picks. The
// relay checks their SHAPE only -- it never loads js/data.js, so it cannot know which weathers exist -- and every client
// resolves them against the same tables and ignores the same unknown values, so a bad value is a no-op everywhere and
// never a desync.
const RULE_KEYS = ['bank', 'hazard', 'night', 'features', 'derelicts', 'wildlife', 'size'];
const RULE_DEFAULTS = { bank: 'standard', hazard: 'map', night: 'map', features: 'map', derelicts: 'map', wildlife: 'map', size: 'auto' };
function ruleOf(v) { const s = String(v == null ? '' : v); return /^[a-z0-9_:-]{1,32}$/i.test(s) ? s : null; }
// REVIEW-M17 decision 4. A code shorter than four characters is refused (the code is the only lock, and
// "AB" is not one); an address may join JOIN_LIMIT times a minute; and cheats are refused in a network
// game unless the relay was started with BW_CHEATS=1, which test/net.js and test/net_many.js set because
// they keep their humans alive with `power overwhelming`. Behind a tunnel every socket is 127.0.0.1, so
// the address is read from the forwarding headers cloudflared and ngrok set before the socket's own.
const MIN_CODE = 4, JOIN_LIMIT = Math.max(1, parseInt(process.env.BW_JOIN_LIMIT || '60')), CHEATS = process.env.BW_CHEATS === '1';
// THE COUNTDOWN BEFORE A GAME UNLOCKS, and THE RELAY OWNS IT (the user's item 12: "this will help the
// game start time stay equal"). Every client counting 5-4-3-2-1 off its own clock would reach zero at
// five slightly different moments -- which is precisely the skew lockstep then has to wait out on the
// first frames. The relay broadcasting each number means every client draws the same digit at the same
// moment and the start message that follows is one message to everybody.
// Configurable, and 0 turns it off: test/net.js and test/net_many.js set BW_COUNTDOWN=0 because they are
// lockstep and rejoin suites with no business paying five seconds a game for a menu. test/rooms.js runs
// a relay WITH one and times the real thing.
const COUNTDOWN = (() => { const n = parseInt(process.env.BW_COUNTDOWN, 10); return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 5; })();
const joins = new Map();        // address -> recent join timestamps
function joinAllowed(ip) { const now = Date.now(); const arr = (joins.get(ip) || []).filter(t => now - t < 60000); if (arr.length >= JOIN_LIMIT) { joins.set(ip, arr); return false; } arr.push(now); joins.set(ip, arr); return true; }
const DEFAULT_ROOM = 'LAN';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
// What the static half serves: the page, the code and the art. It used to serve the whole checkout --
// /.git/HEAD, every handoff, this file -- to anyone holding the tunnel link, and a malformed URL
// (GET /%) threw out of decodeURIComponent and took every room on the relay down with it. (REVIEW-M17)
const SERVED = p => p === '/index.html' || p.startsWith('/js/') || p.startsWith('/assets/');
const server = http.createServer((req, res) => {
  let p; try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end('bad request'); }
  if (p === '/') p = '/index.html';
  if (!SERVED(p)) { res.writeHead(404); return res.end('not found'); }
  const f = path.join(root, p); if (!f.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
});
// ---------------- minimal WebSocket server ----------------
const clients = new Map(); let nextId = 1;
const rooms = new Map();        // code -> lobby. Created on demand, deleted when the last client leaves.
// players: {id, name, race, team, ai, difficulty, gone}
function newLobby(code) { return { code, players: [], state: 'lobby', layout: 'temple', seed: 0, started: null, history: [], lastF: {}, gone: {}, title: '', listed: false, count: 0, timer: null, lockTeams: false, created: Date.now(), rules: Object.assign({}, RULE_DEFAULTS), cap: MAX_PLAYERS, specs: [] }; }
function specOf(L, id) { return (L.specs || []).find(s => s.id === id) || null; }
// How many players the room's map has starts for. The relay never loads the map tables, so the HOST'S client says (Net.mapCap)
// whenever the map changes; until it does, the old ceiling of eight holds. A host who lied would only be breaking their own game.
function capOf(L) { return Math.max(1, Math.min(MAX_PLAYERS, L.cap || MAX_PLAYERS)); }   // state: 'lobby' | 'starting' (the countdown) | 'playing'   // listed: made by `join {create}` and shown to browsers
// Normalised hard, because this is a thing humans read out over voice chat: case-folded, anything that
// is not a letter or a digit dropped, and capped. So "ab-12", "AB12" and "  ab12  " are one room.
function roomCode(s) { const k = String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return k || DEFAULT_ROOM; }
function roomFor(code) { const k = roomCode(code); let L = rooms.get(k); if (!L) { L = newLobby(k); rooms.set(k, L); } return L; }
function roomOf(c) { return c.room ? rooms.get(c.room) : null; }
function tag(L) { return L.code === DEFAULT_ROOM ? '' : '[' + L.code + '] '; }
function frameRaw(op, b) { let h; if (b.length < 126) h = Buffer.from([0x80 | op, b.length]); else if (b.length < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(b.length, 2); } else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(b.length), 2); } return Buffer.concat([h, b]); }
function frame(text) { return frameRaw(1, Buffer.from(text, 'utf8')); }
// The largest frame a client may send. A rejoin snapshot is the biggest honest message and measures
// about a megabyte after twenty minutes with 550 units; a client claiming a 2^63-byte frame used to be
// believed and streamed into memory. (REVIEW-M17)
const MAX_FRAME = 16 * 1024 * 1024;
function raceOf(r) { return /^[TZPR]$/.test(r) ? r : 'R'; }
// Difficulty and play style for an AI slot. The style list is MIRRORED from AI.prototype.styleDeltas()
// rather than read from it: the relay is a plain node process that never loads js/ai.js, and pulling the
// whole simulation in to validate one string is the worse trade. It is only a FILTER -- the AI
// constructor validates again against its own table and falls back to 'standard' (js/ai.js, "own keys
// only"), so a style this list lets through that the game does not know is a standard AI, never a crash.
const AI_DIFFS = ['easy', 'normal', 'hard'], AI_STYLES = ['standard', 'turtle', 'rusher', 'expander', 'harasser'];
function diffOf(d, fallback) { return AI_DIFFS.includes(d) ? d : (fallback || 'normal'); }
function styleOf(s, fallback) { return AI_STYLES.includes(s) ? s : (fallback || 'standard'); }
function teamOf(t, fallback) { return Number.isInteger(t) && t >= 1 && t <= MAX_PLAYERS ? t : fallback; }
function send(c, msg) { try { c.socket.write(frame(JSON.stringify(msg))); } catch (e) { } }
// Room-scoped. A client that has not joined yet has no `room` and hears nothing, which is what stops
// a connection leaking the existence of a game it has not given the code for.
function inRoom(L) { const out = []; for (const c of clients.values()) if (c.room === L.code) out.push(c); return out; }
function broadcast(L, msg, except) { for (const c of inRoom(L)) if (c !== except) send(c, msg); }
function hostOf(L) { return L.players.find(q => !q.ai && !q.gone) || null; }
// The style rides here and in startMsg's player list, and that is the WHOLE plumbing an AI play style
// needs: js/ai.js's constructor reads it off G.setup.players[id].style, and G.setup is the options object
// Net.startGame builds. So a styled network AI costs no change to any stamped file. (item 1)
function lobbyState(L) { const host = hostOf(L); return { t: 'lobby', room: L.code, title: L.title, listed: !!L.listed, players: L.players.map(p => ({ id: p.id, name: p.name, race: p.race, team: p.team, ai: !!p.ai, difficulty: p.difficulty, style: p.style, gone: !!p.gone, ready: !!p.ready || !!p.ai, host: host ? p.id === host.id : false, ping: p.ai ? null : pingOf(p.id) })), cap: capOf(L), specs: (L.specs || []).map(s => ({ id: s.id, name: s.name, ping: pingOf(s.id) })), layout: L.layout, state: L.state, speed: L.speed == null ? 6 : L.speed, count: L.count | 0, lockTeams: !!L.lockTeams, rules: L.rules, delay: DELAY, readyCheck: READY_CHECK }; }
function pingOf(id) { const c = clients.get(id); return c && c.rtt != null ? c.rtt : null; }
// A line for the lobby chat, written by the relay (item 2). Every change a player did not make themselves -- a join, a
// kick, a new map, a shuffle -- is said out loud, so nobody is surprised by one. Structured rather than worded: the relay
// knows a map only by its id, and the client that knows its name writes the sentence.
function sys(L, ev, extra) { broadcast(L, Object.assign({ t: 'sys', ev }, extra || {})); }
// READY IS CONSENT (item 2; FAF and Age of Empires II both do this). A player who readied agreed to the game on screen;
// when the host changes what that game is, the agreement is withdrawn and the room is told why. The host is not
// unreadied -- pressing START is the host's ready.
function unreadyAll(L, why) { const host = hostOf(L); let n = 0; for (const p of L.players) if (!p.ai && p.ready && p !== host) { p.ready = false; n++; } if (n) sys(L, 'unready', { why }); return n; }
// The browser. A row per listed room that still has someone in it; pushed to every browsing client (one
// that sent `list` and is in no room) whenever a listed room changes, and sent once to a `list`.
function lobbyRow(L) { const h = hostOf(L); return { code: L.code, title: L.title, host: h ? h.name : '', players: L.players.length, humans: L.players.filter(p => !p.ai).length, cap: capOf(L), state: L.state, layout: L.layout, speed: L.speed == null ? 6 : L.speed, created: L.created, lockTeams: !!L.lockTeams, rules: L.rules, specs: (L.specs || []).length }; }
function lobbies() { return { t: 'lobbies', rooms: [...rooms.values()].filter(L => L.listed && L.players.length).map(lobbyRow), online: clients.size }; }
function pushLobbies() { const m = lobbies(); for (const c of clients.values()) if (c.browsing && !c.room) send(c, m); }
// A hosted room's code, made here so two hosts cannot collide and no host has to invent one. Six from an
// alphabet without 0/O and 1/I, because the code is also what a friend types to join a private game.
function newCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (;;) { let s = ''; for (let i = 0; i < 6; i++) s += A[crypto.randomInt(A.length)]; if (!rooms.has(s)) return s; } }
// Where a joining human sits: the least-populated of the teams in play (at least two), the lowest on a tie. The
// old rule gave every joiner a team of their own, so a third human opened Team 3 in a lobby drawn as two.
function joinTeam(L) { const top = Math.max(2, ...L.players.map(p => p.team || 1)); let best = 1, n = Infinity; for (let t = 1; t <= top; t++) { const k = L.players.filter(p => p.team === t).length; if (k < n) { n = k; best = t; } } return best; }
function maxFrame(L) { let m = -1; for (const f of Object.values(L.lastF)) if (f > m) m = f; return m; }
// `snapApplied`: the donor took its snapshot with its own frame's batch already applied -- which is the
// case once G.over (G.tick no-ops, so the frame never moves past the batch it applied) or paused. The
// rejoiner must not apply that batch a second time; without the flag it did, and a game continued after
// "Continue playing" diverged on the rejoiner. (REVIEW-M17 task 14)
function sendRejoin(L, c, idx, snap, snapFrame, snapApplied) {
  // only the commands the snapshot has not already accounted for
  const hist = snap ? L.history.filter(h => h.f >= snapFrame) : L.history;
  send(c, Object.assign({ t: 'rejoin', history: hist, frame: Math.max(0, maxFrame(L) - DELAY), snap, snapFrame, snapApplied: !!snapApplied }, startMsg(L, idx)));
  console.log('  ' + tag(L) + 'rejoin sent ' + (snap ? 'from a snapshot at frame ' + snapFrame + ' plus ' + hist.length + ' commands' : 'as ' + hist.length + ' commands from frame 0'));
}
// Bring a client into a running game: a rejoining player (idx is their slot) or a spectator (idx -1).
function catchUp(L, c, idx) {
  // ...and not a client that is itself mid-rejoin: `slot.gone` is cleared before this search, so
  // once simultaneous rejoins actually work, the previous rejoiner looks like a healthy donor
  // while it is still catching up and would hand over a snapshot from before it was caught up.
  const rejoining = new Set([...(L.pendingSnaps || new Map()).values()].map(p => p.want));
  const donor = inRoom(L).find(x => x !== c && !rejoining.has(x.id) && L.players.some(p => p.id === x.id && !p.gone && !p.ai));
  if (donor) {
    // ask a live client for a state snapshot; the rejoiner waits rather than re-simulating the game
    // Keyed by request, not a single slot. This used to be `lobby.pendingSnap = {...}`, so two
    // rejoins arriving close together overwrote each other: the donor's first snapshot went to
    // the SECOND requester, the second snapshot found the slot empty and was dropped, and the
    // first requester's fallback timer had been disarmed along with it, so it waited forever.
    // Worse than losing one player -- the relay has already broadcast `rejoined`, so every
    // client blocks at that frame for a batch that never comes and the whole game wedges.
    const req = (L.snapSeq = (L.snapSeq || 0) + 1);
    L.pendingSnaps = L.pendingSnaps || new Map();
    L.pendingSnaps.set(req, { want: c.id, idx, donor: donor.id });   // donor recorded: only it may answer (any room member could, and a wrong snapshot is a silent desync for the rejoiner)
    send(donor, { t: 'needsnap', req });
    setTimeout(() => { // donor did not answer: fall back to replaying the whole history
      const ps = L.pendingSnaps && L.pendingSnaps.get(req);
      if (ps) { L.pendingSnaps.delete(req); sendRejoin(L, c, idx, null, 0); }
    }, 4000);
  } else sendRejoin(L, c, idx, null, 0);
}
function startMsg(L, idx) { return { room: L.code, seed: L.seed, layout: L.layout, players: L.started, you: idx, delay: DELAY, gone: L.gone, speed: L.speed == null ? 6 : L.speed, cheats: CHEATS, rules: L.rules, spectate: idx < 0 }; }
// The body of the old start case, now reached either straight away (COUNTDOWN 0) or when the count runs
// out. Everything the game is built from is read HERE, at zero, not when START was pressed -- which is
// why the room is frozen in between.
function beginGame(L) {
  L.state = 'playing'; L.count = 0; L.timer = null; pushLobbies();
  L.seed = Math.floor(Math.random() * 1e9); const races = ['T', 'Z', 'P'];
  L.started = L.players.map(p => ({ name: p.name, race: p.race === 'R' ? races[Math.floor(Math.random() * 3)] : p.race, team: p.team, human: !p.ai, difficulty: p.difficulty, style: p.style }));
  L.history = []; L.lastF = {}; L.gone = {};
  for (const cl of inRoom(L)) { const idx = L.players.findIndex(p => p.id === cl.id); if (idx >= 0) send(cl, Object.assign({ t: 'start' }, startMsg(L, idx))); else if (specOf(L, cl.id)) send(cl, Object.assign({ t: 'start' }, startMsg(L, -1))); }
  console.log(tag(L) + 'game started: ' + L.started.map(p => p.name + '/' + p.race + (p.human ? '' : '/' + p.difficulty + '/' + (p.style || 'standard'))).join(', ') + ' on ' + L.layout + ' seed ' + L.seed);
}
// While it runs the room state is 'starting': join, set, addai and kick all refuse, because the player
// list beginGame() reads must not move under the count. Anyone leaving cancels it -- a game that counted
// to zero with a slot that had walked out would hand every client a different player list -- and the host
// may cancel by hand.
function beginCountdown(L) {
  L.state = 'starting'; L.count = COUNTDOWN; broadcast(L, lobbyState(L)); pushLobbies();
  const tick = () => {
    if (L.state !== 'starting') return;                       // cancelled between ticks
    if (L.count <= 0) { L.timer = null; beginGame(L); return; }
    broadcast(L, { t: 'countdown', n: L.count });
    L.count--; L.timer = setTimeout(tick, 1000);
  };
  tick();
}
function cancelCountdown(L, why) {
  if (L.timer) { clearTimeout(L.timer); L.timer = null; }
  if (L.state !== 'starting') return;
  L.state = 'lobby'; L.count = 0;
  broadcast(L, { t: 'countdown', n: 0, cancelled: true, msg: String(why || '') });
  broadcast(L, lobbyState(L)); pushLobbies();
  console.log(tag(L) + 'countdown cancelled: ' + (why || ''));
}
function onMessage(c, m) {
  // `join` and `list` are the only messages a client with no room may send: one puts it in a room, the
  // other makes it a browser that is told the listed rooms until it joins one.
  if (m.t === 'list' && !roomOf(c)) { c.browsing = true; send(c, lobbies()); return; }
  if (m.t !== 'join' && !roomOf(c)) return;
  if (m.t === 'join' && !c.room) {
    if (m.create === true) m.room = newCode();   // a hosted game: the relay picks the code
    const k = roomCode(m.room); if (k !== DEFAULT_ROOM && k.length < MIN_CODE) { send(c, { t: 'error', msg: 'A room code is at least ' + MIN_CODE + ' letters or digits.' }); return; }
    // `existing`: an invite link or a click in the list means THAT game. Without it a code that has since emptied would
    // quietly make a new, empty room under the old name, and the player would sit in it waiting for a host who has gone.
    if (m.existing === true && m.create !== true && !rooms.has(k)) { send(c, { t: 'error', msg: 'That game has ended or no longer exists.', gone: true }); return; }
    if (!joinAllowed(c.ip)) { send(c, { t: 'error', msg: 'Too many join attempts from this address. Wait a minute.' }); return; }
  }
  const fresh = m.t === 'join' && !c.room && !rooms.has(roomCode(m.room));   // this join is what creates the room
  const L = m.t === 'join' ? roomFor(c.room || m.room) : roomOf(c);
  const me = L.players.find(p => p.id === c.id); const host = hostOf(L); const isHost = me && host === me;
  switch (m.t) {
    case 'join': {
      // A client stays in the room it first joined (roomFor above prefers c.room). Re-sending `join` with
      // a different code would otherwise let it walk between rooms while its old slot was still in a
      // running game. `c.room` is set only once a join SUCCEEDS: a client refused here (a stranger, or the
      // ninth player) used to count as in the room -- it received every broadcast, and the room was never
      // reset when the real players left because inRoom() still saw it. (REVIEW-M17)
      if (m.spectate === true && m.create !== true && !me) {
        const already = specOf(L, c.id), name = String(m.name || 'Player').slice(0, 16);
        if (!already && (L.specs || []).length >= MAX_SPECS) { send(c, { t: 'error', msg: 'That game has no room for more spectators (' + MAX_SPECS + ').' }); return; }
        if (!already) L.specs.push({ id: c.id, name });
        c.room = L.code; c.browsing = false;
        if (L.state === 'playing' && !already) catchUp(L, c, -1);   // the running game, from a player's snapshot
        broadcast(L, lobbyState(L)); if (!already) sys(L, 'spectate', { name }); if (L.state !== 'playing') lobbyPing(c); pushLobbies();
        console.log(tag(L) + name + ' is spectating');
        break;
      }
      if (L.state !== 'lobby') { // a dropped player reconnecting under the same name takes their slot back
        if (me) { send(c, { t: 'error', msg: 'You are already in this game.' }); return; }   // a live player re-sending join with a dropped name used to take that slot too, and two slots shared one id
        const name = String(m.name || '').slice(0, 16); const idx = L.players.findIndex(p => p.gone && p.name === name);
        if (idx < 0) { send(c, { t: 'error', msg: 'Game already in progress' + (name ? ' and no dropped player is called ' + name : '') + '.' }); return; }
        c.room = L.code;
        const slot = L.players[idx]; slot.id = c.id; slot.gone = false;
        const R = Math.max(maxFrame(L) + 1, DELAY); L.gone[idx].to = R;
        // ...and not a client that is itself mid-rejoin: `slot.gone` is cleared before this search, so
        // once simultaneous rejoins actually work, the previous rejoiner looks like a healthy donor
        // while it is still catching up and would hand over a snapshot from before it was caught up.
        catchUp(L, c, idx);
        broadcast(L, { t: 'rejoined', p: idx, f: R }, c); broadcast(L, lobbyState(L)); console.log(tag(L) + name + ' rejoined as player ' + idx + ', live again from frame ' + R);
        return;
      }
      // THE CAP. `addai` has always refused past eight and `join` never did, so a lobby could hold any
      // number of humans and start a game with more players than the map has starts. It did not matter
      // while reaching the server meant being on the LAN.
      if (!me && L.players.length >= capOf(L)) { send(c, { t: 'error', msg: 'That game is full (' + capOf(L) + ' players).' }); return; }
      if (!c.room) c.room = L.code;
      if (!me) L.players.push({ id: c.id, name: String(m.name || 'Player').slice(0, 16), race: raceOf(m.race), team: joinTeam(L) });
      if (fresh && m.create === true) { L.listed = true; L.title = String(m.title || '').trim().slice(0, 40) || L.players[0].name + "'s game"; }   // a hosted game: listed under its title
      c.browsing = false; broadcast(L, lobbyState(L)); if (!me) sys(L, 'join', { name: L.players[L.players.length - 1].name }); lobbyPing(c); if (L.listed) pushLobbies(); break;
    }
    // Lobby settings are lobby-only. The relay is the authority here, and it was accepting both of
    // these after the game had started: `set layout` rewrote lobby.layout, which sendRejoin reads via
    // startMsg(), so the next player to rejoin loaded a DIFFERENT MAP than everyone else was playing;
    // and `addai` grew lobby.players out of step with the running game. Neither is reachable from the
    // UI, which is why nothing caught them, but a relay must not trust that its clients are the UI.
    // Gated on the STATE now, not only on L.started: L.started is built at zero of the countdown, so a
    // gate that read it alone would have let every setting change while the count was running.
    case 'set': {
      if (L.state === 'lobby' && !L.started) {
        // WHOSE SLOT. A message with no id means the sender's own, which is every set the client sent
        // before AI slots became editable. An AI slot has no socket of its own, so the host naming its id
        // is the only way it can ever change -- and the second half of the test is what stops a non-host,
        // or the host, editing another HUMAN's race out from under them.
        const t = (m.id != null) ? L.players.find(p => p.id === m.id) : me;
        if (t && (t === me || (isHost && t.ai))) {
          const was = t.race + '|' + t.team + '|' + t.difficulty + '|' + t.style;
          if (m.race) t.race = raceOf(m.race);
          // LOCK TEAMS (item 2; StarCraft II's lobby option): once the host locks them only the host moves anyone.
          if (m.team && (!L.lockTeams || isHost)) t.team = teamOf(m.team, t.team);
          if (t.ai && m.difficulty) t.difficulty = diffOf(m.difficulty, t.difficulty);
          if (t.ai && m.style) t.style = styleOf(m.style, t.style);
          if (was !== t.race + '|' + t.team + '|' + t.difficulty + '|' + t.style) {
            // An opponent changed under everyone: every agreement is withdrawn. A player's own race or team: only theirs.
            if (t.ai) { sys(L, 'ai', { name: t.name }); unreadyAll(L, 'ai'); } else if (t.ready && t !== hostOf(L)) t.ready = false;
          }
        }
        // PLAY / SPECTATE. The host cannot step out: the host is the first human in the game, and a room whose host was only
        // watching would have nobody who may start it.
        if (typeof m.spectate === 'boolean') {
          const sp = specOf(L, c.id);
          if (m.spectate && me && !isHost && (L.specs || []).length < MAX_SPECS) { L.players = L.players.filter(p => p !== me); L.specs.push({ id: me.id, name: me.name }); sys(L, 'spectate', { name: me.name }); }
          else if (!m.spectate && sp && L.players.length < capOf(L)) { L.specs = L.specs.filter(s => s !== sp); L.players.push({ id: sp.id, name: sp.name, race: raceOf(m.race), team: joinTeam(L) }); sys(L, 'play', { name: sp.name }); }
        }
        if (me && typeof m.ready === 'boolean' && !!me.ready !== m.ready) { me.ready = m.ready; sys(L, m.ready ? 'ready' : 'notready', { name: me.name }); }
        if (isHost && typeof m.layout === 'string' && m.layout.length <= 64 && m.layout !== L.layout) { L.layout = m.layout; sys(L, 'map', { layout: L.layout }); unreadyAll(L, 'map'); }
        if (isHost && m.speed != null) { const sp = Math.max(0, Math.min(6, m.speed | 0)); if (sp !== (L.speed == null ? 6 : L.speed)) { L.speed = sp; sys(L, 'speed', { speed: sp }); unreadyAll(L, 'speed'); } }
        if (isHost && typeof m.title === 'string' && m.title.trim()) L.title = m.title.trim().slice(0, 40);
        if (isHost && m.cap != null) L.cap = Math.max(1, Math.min(MAX_PLAYERS, m.cap | 0));
        // GAME PRIVACY (the SC2 lobby's row, and a real one): listed means every browser on this server
        // sees the game, unlisted means only the code reaches it. The code never changes, so going private
        // does not lock out the people already in the room.
        if (isHost && typeof m.listed === 'boolean' && m.listed !== !!L.listed) { L.listed = m.listed; sys(L, 'privacy', { listed: L.listed }); }
        if (isHost && typeof m.lockTeams === 'boolean' && m.lockTeams !== !!L.lockTeams) { L.lockTeams = m.lockTeams; sys(L, 'lock', { on: L.lockTeams }); }
        if (isHost && m.rules && typeof m.rules === 'object') {
          let changed = false;
          for (const k of RULE_KEYS) { if (!(k in m.rules)) continue; const v = ruleOf(m.rules[k]); if (v !== null && v !== L.rules[k]) { L.rules[k] = v; changed = true; sys(L, 'rule', { key: k, value: v }); } }
          if (changed) unreadyAll(L, 'rules');
        }
      }
      // Unconditional, unlike before: a game that has just gone PRIVATE has to leave every browser's list,
      // and "if (L.listed)" is exactly the test that would skip that push.
      broadcast(L, lobbyState(L)); pushLobbies(); break;   // everyone must run the same speed or lockstep just makes the fast clients wait
    }
    case 'addai': if (isHost && L.state === 'lobby' && !L.started && L.players.length < capOf(L)) { L.players.push({ id: -(nextId++), name: 'Computer ' + L.players.filter(p => p.ai).length, race: raceOf(m.race), team: teamOf(m.team, L.players.length + 1), ai: true, difficulty: diffOf(m.difficulty), style: styleOf(m.style) }); sys(L, 'addai', { name: L.players[L.players.length - 1].name }); unreadyAll(L, 'ai'); broadcast(L, lobbyState(L)); pushLobbies(); } break;   // `team`: the lobby's add-AI is per team
    case 'kick': if (isHost && L.state === 'lobby' && m.id !== c.id) { const out = L.players.find(p => p.id === m.id) || specOf(L, m.id); L.players = L.players.filter(p => p.id !== m.id); L.specs = (L.specs || []).filter(s => s.id !== m.id); if (out) { sys(L, 'kick', { name: out.name, ai: !!out.ai }); if (out.ai) unreadyAll(L, 'ai'); } const kc = clients.get(m.id); if (kc) { kc.room = null; kc.browsing = true; send(kc, { t: 'error', msg: 'The host removed you from the game.' }); send(kc, lobbies()); } broadcast(L, lobbyState(L)); if (L.listed) pushLobbies(); } break;   // the kicked client leaves the room too: it used to keep hearing every broadcast, and a re-sent join put it straight back
    case 'start': {
      if (!isHost || L.state !== 'lobby' || L.players.filter(p => !p.ai).length < 1) return;
      // The host pressing START is the host's own ready; everyone else must have readied, and the room hears who has not.
      if (L.players.length > capOf(L)) { send(c, { t: 'error', msg: 'This map has ' + capOf(L) + ' start positions and there are ' + L.players.length + ' players. Remove a slot or pick a bigger map.' }); return; }
      const waiting = READY_CHECK ? L.players.filter(p => !p.ai && !p.gone && p !== me && !p.ready) : [];
      if (waiting.length) { send(c, { t: 'error', msg: 'Waiting for ' + waiting.map(p => p.name).join(', ') + ' to ready up.' }); sys(L, 'waiting', { names: waiting.map(p => p.name) }); return; }
      if (COUNTDOWN > 0) beginCountdown(L); else beginGame(L);
      break;
    }
    // SHUFFLE (item 2; BAR balances teams by skill, Age of Empires II randomises them). There is no rating here to
    // balance on, so this is the honest half: every slot dealt at random onto as many teams as are in use (at least
    // two), sizes differing by at most one. The relay's randomness, so no client can deal itself a team; the seats,
    // and so the colours, stay where they were.
    case 'shuffle': if (isHost && L.state === 'lobby' && !L.started) {
      const n = Math.max(2, new Set(L.players.map(p => p.team || 1)).size);
      const deck = L.players.slice(); for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); const x = deck[i]; deck[i] = deck[j]; deck[j] = x; }
      deck.forEach((p, i) => { p.team = (i % n) + 1; });
      sys(L, 'shuffle', { teams: n }); unreadyAll(L, 'teams'); broadcast(L, lobbyState(L)); pushLobbies();
    } break;
    // THE NUDGE (item 2; BAR's `!ring`): the host reminds one player who has not readied that the room is waiting on them.
    case 'ring': if (isHost && L.state === 'lobby') { const t = L.players.find(p => p.id === m.id && !p.ai && !p.ready); const tc = t && clients.get(t.id); if (tc && tc !== c) send(tc, { t: 'ring', from: me.name }); } break;
    case 'lpong': if (m.n === c.pingN && c.pingAt) { const ms = Date.now() - c.pingAt; c.rtt = c.rtt == null ? ms : Math.round((c.rtt + ms) / 2); c.pingAt = 0; } break;
    case 'cancel': if (isHost && L.state === 'starting') cancelCountdown(L, (me ? me.name : 'The host') + ' cancelled the start.'); break;
    case 'snap': {
      const ps = L.pendingSnaps && L.pendingSnaps.get(m.req); if (!ps || ps.donor !== c.id) break;
      const target = clients.get(ps.want); L.pendingSnaps.delete(m.req);
      if (target) sendRejoin(L, target, ps.idx, m.snap, m.frame | 0, m.applied === true);
      break;
    }
    // THE SENDER IS STAMPED ON EVERY COMMAND. The envelope carried the slot the relay knew; the commands
    // inside carried whatever `p` the client wrote, and CMD.apply trusted that -- so any player could order
    // another player's units, cancel their production or `game over man` them, deterministically, on
    // every client, with no desync to show for it. A batch that is not an array is dropped: forwarded, it
    // threw inside every receiver's beforeTick. (REVIEW-M17)
    case 'cmds': { const idx = L.players.findIndex(p => p.id === c.id); if (idx >= 0 && L.state === 'playing' && Array.isArray(m.c)) { const cs = m.c.filter(x => x && typeof x === 'object' && (CHEATS || x.t !== 'cheat')).map(x => Object.assign({}, x, { p: idx })); const f = m.f | 0; if (f > maxFrame(L) + CMD_LEAD) { console.log(tag(L) + 'dropped a batch from ' + L.players[idx].name + ' claiming frame ' + f + ' (' + (f - maxFrame(L)) + ' ahead of the room, window ' + CMD_LEAD + ')'); break; } L.history.push({ p: idx, f, c: cs }); if (!(L.lastF[idx] >= f)) L.lastF[idx] = f; broadcast(L, { t: 'cmds', p: idx, f, c: cs }, c); } break; }
    case 'hash': { const idx = L.players.findIndex(p => p.id === c.id); if (idx >= 0) broadcast(L, { t: 'hash', p: idx, f: m.f, h: m.h }, c); break; }
    // `leave` is the lobby's LEAVE button: out of the room and back to the list on the same socket. The
    // host leaving hands the room to the next human (hostOf), and the last human leaving empties it. In
    // a running game closing the socket is the way out, so `leave` there is ignored.
    case 'leave': if (L.state !== 'playing') { if (L.state === 'starting' && me) cancelCountdown(L, me.name + ' left, so the start was cancelled.'); const wasHost = hostOf(L), sp = specOf(L, c.id); L.players = L.players.filter(p => p.id !== c.id); L.specs = (L.specs || []).filter(s => s.id !== c.id); if (!L.players.some(p => !p.ai)) L.players = []; c.room = null; c.browsing = true; departed(L, me || sp, wasHost); broadcast(L, lobbyState(L)); if (!inRoom(L).length && L.code !== DEFAULT_ROOM) rooms.delete(L.code); send(c, lobbies()); pushLobbies(); console.log(tag(L) + (me ? me.name : 'client ' + c.id) + ' left the lobby'); } break;
    case 'chat': { const sp = me ? null : specOf(L, c.id), from = me || sp; if (from) broadcast(L, { t: 'chat', from: from.name, id: from.id, spec: !!sp, text: String(m.text).slice(0, 200) }); break; }
    case 'ping': send(c, { t: 'pong' }); break;
  }
}
function leave(c) {
  if (!clients.has(c.id)) return; clients.delete(c.id);
  const L = roomOf(c); if (!L) return;                 // never joined a room: nothing to clean up
  const idx = L.players.findIndex(p => p.id === c.id);
  if (L.state === 'playing') {
    if (idx >= 0 && !L.players[idx].gone) {
      // every client can only have simulated up to the last frame this player sent a batch for; stop their units on the next one
      const stopAt = Math.max((L.lastF[idx] == null ? -1 : L.lastF[idx]) + 1, DELAY);
      L.players[idx].gone = true; L.players[idx].id = 0; L.gone[idx] = { from: stopAt, to: null };
      broadcast(L, { t: 'left', p: idx, f: stopAt }); broadcast(L, lobbyState(L)); console.log(tag(L) + L.players[idx].name + ' dropped; units stop at frame ' + stopAt);
    }
    if (specOf(L, c.id)) { L.specs = L.specs.filter(s => s.id !== c.id); broadcast(L, lobbyState(L)); }
    if (!inRoom(L).length) { L.players = []; L.specs = []; L.state = 'lobby'; L.started = null; L.history = []; L.lastF = {}; L.gone = {}; L.pendingSnaps = null; console.log(tag(L) + 'all players gone, back to lobby'); }   // `started` too: `set` and `addai` gate on it, so the second game in the LAN room could change no race, team, map or speed (REVIEW-M17)
  }
  else {
    // ...including one that drops mid-countdown: beginGame() reads the player list at zero, so a slot that
    // walked out during the count would have been in some clients' game and not others'.
    // A spectator walking out cancels nothing: the player list the count is building from did not move.
    if (L.state === 'starting' && idx >= 0) cancelCountdown(L, L.players[idx].name + ' disconnected, so the start was cancelled.');
    const wasHost = hostOf(L), who = idx >= 0 ? L.players[idx] : specOf(L, c.id);
    L.specs = (L.specs || []).filter(s => s.id !== c.id);
    L.players = L.players.filter(p => p.id !== c.id); if (!L.players.some(p => !p.ai)) L.players = []; departed(L, who, wasHost); broadcast(L, lobbyState(L));
  }
  // An empty room is forgotten, so a relay that has hosted a thousand games holds a thousand nothings.
  // The default room is kept: it is the one a client with no code lands in, and re-creating it every
  // time would be churn for no gain.
  if (!inRoom(L).length && L.code !== DEFAULT_ROOM) rooms.delete(L.code);
  pushLobbies();   // a listed room's count changed, or the room is gone
}
// A player left a lobby: say so, and say who holds it now if it was the host who went.
function departed(L, who, wasHost) {
  if (!who || !L.players.length) return;
  sys(L, 'leave', { name: who.name });
  const now = hostOf(L); if (now && wasHost === who) sys(L, 'host', { name: now.name });
}
// THE LOBBY PING (LOBBY_PING_MS). One numbered ping out; the answer's delay, smoothed, is that member's round trip.
function lobbyPing(c) { c.pingN = (c.pingN || 0) + 1; c.pingAt = Date.now(); send(c, { t: 'lping', n: c.pingN }); }
function drop(c, why) { console.log('  dropping client ' + c.id + ': ' + why); try { c.socket.destroy(); } catch (e) { } leave(c); }
function onData(c, data) {
  c.lastSeen = Date.now();
  // Chunks are collected and joined once per frame rather than on every chunk: a large frame arriving
  // in 64 KB pieces used to be re-copied in full for each piece.
  c.chunks.push(data); c.chunked += data.length; if (c.chunked < c.need) return;
  c.buf = Buffer.concat([c.buf].concat(c.chunks)); c.chunks = []; c.chunked = 0; c.need = 0;
  for (;;) {
    if (c.buf.length < 2) return; const b0 = c.buf[0], b1 = c.buf[1]; const fin = !!(b0 & 0x80), op = b0 & 0x0f, masked = !!(b1 & 0x80); let len = b1 & 0x7f, off = 2;
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (c.buf.length < 10) return; len = Number(c.buf.readBigUInt64BE(2)); off = 10; }
    if (len > MAX_FRAME) { drop(c, 'frame of ' + len + ' bytes'); return; }
    if (!fin || op === 0) { drop(c, 'fragmented frame'); return; }   // never assembled here; browsers and Node send whole frames, and half a message used to become 'bad message' plus lost pieces
    const mlen = masked ? 4 : 0; if (c.buf.length < off + mlen + len) { c.need = off + mlen + len - c.buf.length; return; }
    const mask = masked ? c.buf.subarray(off, off + 4) : null; const payload = Buffer.from(c.buf.subarray(off + mlen, off + mlen + len)); if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    c.buf = c.buf.subarray(off + mlen + len);
    if (op === 8) { try { c.socket.end(); } catch (e) { } leave(c); return; }
    if (op === 9) { try { c.socket.write(frameRaw(0xa, payload)); } catch (e) { } continue; }   // a pong with the right length header (the one-byte form was malformed past 125 bytes)
    if (op === 10) continue;   // a pong to our keepalive ping; lastSeen is already updated
    if (op === 1) { try { onMessage(c, JSON.parse(payload.toString('utf8'))); } catch (e) { console.error('bad message', e.message); } }
  }
}
server.on('upgrade', (req, socket) => {
  if (req.url !== '/ws') { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key']; const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const ip = String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || socket.remoteAddress || '?');
  const c = { id: nextId++, socket, ip, buf: Buffer.alloc(0), chunks: [], chunked: 0, need: 0, room: null, lastSeen: Date.now() }; clients.set(c.id, c); socket.setNoDelay(true);
  socket.on('data', d => onData(c, d)); socket.on('close', () => leave(c)); socket.on('error', () => leave(c));
  // `state` describes the relay, not a game: a client that has not sent a code cannot be told whether
  // some room is playing without being told that room exists. The real state arrives with the `lobby`
  // message `join` triggers, or with the `error` that refuses it.
  send(c, { t: 'hello', id: c.id, state: 'lobby', rooms: true, browser: true });
});
// KEEPALIVE. A connection that dies without a FIN -- wifi drop, a laptop closing, a tunnel hiccup, the
// ordinary internet failure -- was never leave()d: every other client waited on that player's batch
// until the OS gave up on the socket, and the player's own reconnect was refused because their slot
// was not `gone`. A ping every PING_MS; silence for DEAD_MS drops the client. A live client sends a
// batch every frame during play, so silence is unambiguous. (REVIEW-M17)
const PING_MS = 15000, DEAD_MS = 45000;
// Every member of a room that has not started is pinged, and the room is told everyone's latest numbers in one message,
// so a lobby's latency column moves without the whole lobby being redrawn under someone's open dropdown.
setInterval(() => {
  for (const L of rooms.values()) {
    if (L.state === 'playing') continue;
    const members = inRoom(L); if (!members.length) continue;
    const list = members.filter(x => x.rtt != null).map(x => ({ id: x.id, ms: x.rtt }));
    if (list.length) broadcast(L, { t: 'pings', list });
    for (const x of members) lobbyPing(x);
  }
}, LOBBY_PING_MS).unref();
setInterval(() => { const now = Date.now(); for (const c of [...clients.values()]) { if (now - c.lastSeen > DEAD_MS) drop(c, 'no data for ' + Math.round((now - c.lastSeen) / 1000) + ' s'); else { try { c.socket.write(frameRaw(9, Buffer.alloc(0))); } catch (e) { } } } }, PING_MS).unref();
server.listen(port, () => {
  const ips = []; for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  console.log('Brood War Remake: http://localhost:' + port + (ips.length ? '   LAN: ' + ips.map(ip => 'http://' + ip + ':' + port).join(' ') : '') + '   delay ' + DELAY + ' frames' + (CHEATS ? '   CHEATS ON' : ''));
});
