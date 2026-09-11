// Static server + multiplayer relay (WebSocket, no dependencies):  node test/serve.js [port] [delay]
// The relay keeps every command batch of the running game so a dropped player can rejoin and
// re-simulate, and it picks the frame at which a dropped player's units stop so all clients agree.
//
// ROOMS. One relay holds many independent games, keyed by a short code a client sends with `join`.
// An empty or missing code means the room called LAN, so a client that never heard of rooms behaves
// exactly as it did before -- which is what keeps LAN play zero-friction and every existing net test
// passing unchanged.
//
// THE CODE IS ALSO THE ONLY ACCESS CONTROL THERE IS, and that is the reason it exists. On a LAN,
// reaching the server at all meant you were invited. Put the server behind a public tunnel -- which
// is how internet play works here, see PLAY-ONLINE.bat -- and the URL is no longer a secret, so
// anything with the link could walk into a lobby. A code the host shares out of band fixes that, and
// it is why THE RELAY NEVER LISTS THE ROOMS IT HOLDS. A room browser would hand out exactly the
// secret the code is. Guessing wrong lands you in an empty room of your own, never in someone else's.
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
const MAX_PLAYERS = 8;          // humans + AI, the same ceiling `addai` has always had. `join` had none.
const DEFAULT_ROOM = 'LAN';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
});
// ---------------- minimal WebSocket server ----------------
const clients = new Map(); let nextId = 1;
const rooms = new Map();        // code -> lobby. Created on demand, deleted when the last client leaves.
// players: {id, name, race, team, ai, difficulty, gone}
function newLobby(code) { return { code, players: [], state: 'lobby', layout: 'temple', seed: 0, started: null, history: [], lastF: {}, gone: {} }; }
// Normalised hard, because this is a thing humans read out over voice chat: case-folded, anything that
// is not a letter or a digit dropped, and capped. So "ab-12", "AB12" and "  ab12  " are one room.
function roomCode(s) { const k = String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return k || DEFAULT_ROOM; }
function roomFor(code) { const k = roomCode(code); let L = rooms.get(k); if (!L) { L = newLobby(k); rooms.set(k, L); } return L; }
function roomOf(c) { return c.room ? rooms.get(c.room) : null; }
function tag(L) { return L.code === DEFAULT_ROOM ? '' : '[' + L.code + '] '; }
function frame(text) { const b = Buffer.from(text, 'utf8'); let h; if (b.length < 126) h = Buffer.from([0x81, b.length]); else if (b.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(b.length, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(b.length), 2); } return Buffer.concat([h, b]); }
function send(c, msg) { try { c.socket.write(frame(JSON.stringify(msg))); } catch (e) { } }
// Room-scoped. A client that has not joined yet has no `room` and hears nothing, which is what stops
// a connection leaking the existence of a game it has not given the code for.
function inRoom(L) { const out = []; for (const c of clients.values()) if (c.room === L.code) out.push(c); return out; }
function broadcast(L, msg, except) { for (const c of inRoom(L)) if (c !== except) send(c, msg); }
function hostOf(L) { return L.players.find(q => !q.ai && !q.gone) || null; }
function lobbyState(L) { const host = hostOf(L); return { t: 'lobby', room: L.code, players: L.players.map(p => ({ id: p.id, name: p.name, race: p.race, team: p.team, ai: !!p.ai, difficulty: p.difficulty, gone: !!p.gone, host: host ? p.id === host.id : false })), layout: L.layout, state: L.state, speed: L.speed == null ? 6 : L.speed }; }
function maxFrame(L) { let m = -1; for (const f of Object.values(L.lastF)) if (f > m) m = f; return m; }
function sendRejoin(L, c, idx, snap, snapFrame) {
  // only the commands the snapshot has not already accounted for
  const hist = snap ? L.history.filter(h => h.f >= snapFrame) : L.history;
  send(c, Object.assign({ t: 'rejoin', history: hist, frame: Math.max(0, maxFrame(L) - DELAY), snap, snapFrame }, startMsg(L, idx)));
  console.log('  ' + tag(L) + 'rejoin sent ' + (snap ? 'from a snapshot at frame ' + snapFrame + ' plus ' + hist.length + ' commands' : 'as ' + hist.length + ' commands from frame 0'));
}
function startMsg(L, idx) { return { room: L.code, seed: L.seed, layout: L.layout, players: L.started, you: idx, delay: DELAY, gone: L.gone, speed: L.speed == null ? 6 : L.speed }; }
function onMessage(c, m) {
  // `join` is the only message a client with no room may send: it is what puts it in one.
  if (m.t !== 'join' && !roomOf(c)) return;
  const L = m.t === 'join' ? roomFor(c.room || m.room) : roomOf(c);
  const me = L.players.find(p => p.id === c.id); const host = hostOf(L); const isHost = me && host === me;
  switch (m.t) {
    case 'join': {
      // A client stays in the room it first joined. Re-sending `join` with a different code would
      // otherwise let it walk between rooms while its old slot was still in a running game.
      if (!c.room) c.room = L.code;
      if (L.state !== 'lobby') { // a dropped player reconnecting under the same name takes their slot back
        const name = String(m.name || '').slice(0, 16); const idx = L.players.findIndex(p => p.gone && p.name === name);
        if (idx < 0) { send(c, { t: 'error', msg: 'Game already in progress' + (name ? ' and no dropped player is called ' + name : '') + '.' }); return; }
        const slot = L.players[idx]; slot.id = c.id; slot.gone = false;
        const R = Math.max(maxFrame(L) + 1, DELAY); L.gone[idx].to = R;
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
          L.pendingSnaps.set(req, { want: c.id, idx, at: Date.now() });
          send(donor, { t: 'needsnap', req });
          setTimeout(() => { // donor did not answer: fall back to replaying the whole history
            const ps = L.pendingSnaps && L.pendingSnaps.get(req);
            if (ps) { L.pendingSnaps.delete(req); sendRejoin(L, c, idx, null, 0); }
          }, 4000);
        } else sendRejoin(L, c, idx, null, 0);
        broadcast(L, { t: 'rejoined', p: idx, f: R }, c); broadcast(L, lobbyState(L)); console.log(tag(L) + name + ' rejoined as player ' + idx + ', live again from frame ' + R);
        return;
      }
      // THE CAP. `addai` has always refused past eight and `join` never did, so a lobby could hold any
      // number of humans and start a game with more players than the map has starts. It did not matter
      // while reaching the server meant being on the LAN.
      if (!me && L.players.length >= MAX_PLAYERS) { send(c, { t: 'error', msg: 'That game is full (' + MAX_PLAYERS + ' players).' }); return; }
      if (!me) L.players.push({ id: c.id, name: String(m.name || 'Player').slice(0, 16), race: m.race || 'R', team: L.players.length + 1 }); broadcast(L, lobbyState(L)); break;
    }
    // Lobby settings are lobby-only. The relay is the authority here, and it was accepting both of
    // these after the game had started: `set layout` rewrote lobby.layout, which sendRejoin reads via
    // startMsg(), so the next player to rejoin loaded a DIFFERENT MAP than everyone else was playing;
    // and `addai` grew lobby.players out of step with the running game. Neither is reachable from the
    // UI, which is why nothing caught them, but a relay must not trust that its clients are the UI.
    case 'set': if (me && !L.started) { if (m.race) me.race = m.race; if (m.team) me.team = m.team; if (isHost && m.layout) L.layout = m.layout; if (isHost && m.speed != null) L.speed = Math.max(0, Math.min(6, m.speed | 0)); } broadcast(L, lobbyState(L)); break; // everyone must run the same speed or lockstep just makes the fast clients wait
    case 'addai': if (isHost && !L.started && L.players.length < MAX_PLAYERS) { L.players.push({ id: -(nextId++), name: 'Computer ' + L.players.filter(p => p.ai).length, race: m.race || 'R', team: L.players.length + 1, ai: true, difficulty: m.difficulty || 'normal' }); broadcast(L, lobbyState(L)); } break;
    case 'kick': if (isHost && L.state === 'lobby') { L.players = L.players.filter(p => p.id !== m.id); broadcast(L, lobbyState(L)); } break;
    case 'start': {
      if (!isHost || L.state !== 'lobby' || L.players.filter(p => !p.ai).length < 1) return; L.state = 'playing';
      L.seed = Math.floor(Math.random() * 1e9); const races = ['T', 'Z', 'P'];
      L.started = L.players.map(p => ({ name: p.name, race: p.race === 'R' ? races[Math.floor(Math.random() * 3)] : p.race, team: p.team, human: !p.ai, difficulty: p.difficulty }));
      L.history = []; L.lastF = {}; L.gone = {};
      for (const cl of inRoom(L)) { const idx = L.players.findIndex(p => p.id === cl.id); if (idx >= 0) send(cl, Object.assign({ t: 'start' }, startMsg(L, idx))); }
      console.log(tag(L) + 'game started: ' + L.started.map(p => p.name + '/' + p.race).join(', ') + ' on ' + L.layout + ' seed ' + L.seed);
      break;
    }
    case 'snap': {
      const ps = L.pendingSnaps && L.pendingSnaps.get(m.req); if (!ps) break;
      const target = clients.get(ps.want); L.pendingSnaps.delete(m.req);
      if (target) sendRejoin(L, target, ps.idx, m.snap, m.frame | 0);
      break;
    }
    case 'cmds': { const idx = L.players.findIndex(p => p.id === c.id); if (idx >= 0 && L.state === 'playing') { const f = m.f | 0; L.history.push({ p: idx, f, c: m.c }); if (!(L.lastF[idx] >= f)) L.lastF[idx] = f; broadcast(L, { t: 'cmds', p: idx, f, c: m.c }, c); } break; }
    case 'hash': { const idx = L.players.findIndex(p => p.id === c.id); if (idx >= 0) broadcast(L, { t: 'hash', p: idx, f: m.f, h: m.h }, c); break; }
    case 'chat': if (me) broadcast(L, { t: 'chat', from: me.name, text: String(m.text).slice(0, 200) }); break;
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
    if (!inRoom(L).length) { L.players = []; L.state = 'lobby'; L.history = []; L.lastF = {}; L.gone = {}; console.log(tag(L) + 'all players gone, back to lobby'); }
  }
  else { L.players = L.players.filter(p => p.id !== c.id); if (!L.players.some(p => !p.ai)) L.players = []; broadcast(L, lobbyState(L)); }
  // An empty room is forgotten, so a relay that has hosted a thousand games holds a thousand nothings.
  // The default room is kept: it is the one a client with no code lands in, and re-creating it every
  // time would be churn for no gain.
  if (!inRoom(L).length && L.code !== DEFAULT_ROOM) rooms.delete(L.code);
}
function onData(c, data) {
  c.buf = Buffer.concat([c.buf, data]);
  for (;;) {
    if (c.buf.length < 2) return; const b0 = c.buf[0], b1 = c.buf[1]; const op = b0 & 0x0f, masked = !!(b1 & 0x80); let len = b1 & 0x7f, off = 2;
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (c.buf.length < 10) return; len = Number(c.buf.readBigUInt64BE(2)); off = 10; }
    const mlen = masked ? 4 : 0; if (c.buf.length < off + mlen + len) return;
    const mask = masked ? c.buf.subarray(off, off + 4) : null; const payload = Buffer.from(c.buf.subarray(off + mlen, off + mlen + len)); if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    c.buf = c.buf.subarray(off + mlen + len);
    if (op === 8) { try { c.socket.end(); } catch (e) { } leave(c); return; }
    if (op === 9) { try { c.socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (e) { } continue; }
    if (op === 1) { try { onMessage(c, JSON.parse(payload.toString('utf8'))); } catch (e) { console.error('bad message', e.message); } }
  }
}
server.on('upgrade', (req, socket) => {
  if (req.url !== '/ws') { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key']; const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const c = { id: nextId++, socket, buf: Buffer.alloc(0), room: null }; clients.set(c.id, c); socket.setNoDelay(true);
  socket.on('data', d => onData(c, d)); socket.on('close', () => leave(c)); socket.on('error', () => leave(c));
  // `state` describes the relay, not a game: a client that has not sent a code cannot be told whether
  // some room is playing without being told that room exists. The real state arrives with the `lobby`
  // message `join` triggers, or with the `error` that refuses it.
  send(c, { t: 'hello', id: c.id, state: 'lobby', rooms: true });
});
server.listen(port, () => {
  const ips = []; for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  console.log('Brood War Remake: http://localhost:' + port + (ips.length ? '   LAN: ' + ips.map(ip => 'http://' + ip + ':' + port).join(' ') : '') + '   delay ' + DELAY + ' frames');
});
