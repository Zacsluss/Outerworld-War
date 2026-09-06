// Static server + LAN multiplayer relay (WebSocket, no dependencies):  node test/serve.js [port]
// The relay keeps every command batch of the running game so a dropped player can rejoin and
// re-simulate, and it picks the frame at which a dropped player's units stop so all clients agree.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const root = path.join(__dirname, '..'); const port = parseInt(process.argv[2] || '8765');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
});
// ---------------- minimal WebSocket server ----------------
const clients = new Map(); let nextId = 1; const DELAY = 3;
const lobby = { players: [], state: 'lobby', layout: 'temple', seed: 0, started: null, history: [], lastF: {}, gone: {} }; // players: {id, name, race, team, ai, difficulty, gone}
function frame(text) { const b = Buffer.from(text, 'utf8'); let h; if (b.length < 126) h = Buffer.from([0x81, b.length]); else if (b.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(b.length, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(b.length), 2); } return Buffer.concat([h, b]); }
function send(c, msg) { try { c.socket.write(frame(JSON.stringify(msg))); } catch (e) { } }
function broadcast(msg, except) { for (const c of clients.values()) if (c !== except) send(c, msg); }
function hostOf() { return lobby.players.find(q => !q.ai && !q.gone) || null; }
function lobbyState() { const host = hostOf(); return { t: 'lobby', players: lobby.players.map(p => ({ id: p.id, name: p.name, race: p.race, team: p.team, ai: !!p.ai, difficulty: p.difficulty, gone: !!p.gone, host: host ? p.id === host.id : false })), layout: lobby.layout, state: lobby.state, speed: lobby.speed == null ? 6 : lobby.speed }; }
function maxFrame() { let m = -1; for (const f of Object.values(lobby.lastF)) if (f > m) m = f; return m; }
function startMsg(idx) { return { seed: lobby.seed, layout: lobby.layout, players: lobby.started, you: idx, delay: DELAY, gone: lobby.gone, speed: lobby.speed == null ? 6 : lobby.speed }; }
function onMessage(c, m) {
  const me = lobby.players.find(p => p.id === c.id); const host = hostOf(); const isHost = me && host === me;
  switch (m.t) {
    case 'join': {
      if (lobby.state !== 'lobby') { // a dropped player reconnecting under the same name takes their slot back
        const name = String(m.name || '').slice(0, 16); const idx = lobby.players.findIndex(p => p.gone && p.name === name);
        if (idx < 0) { send(c, { t: 'error', msg: 'Game already in progress' + (name ? ' and no dropped player is called ' + name : '') + '.' }); return; }
        const slot = lobby.players[idx]; slot.id = c.id; slot.gone = false;
        const R = Math.max(maxFrame() + 1, DELAY); lobby.gone[idx].to = R;
        send(c, Object.assign({ t: 'rejoin', history: lobby.history, frame: Math.max(0, maxFrame() - DELAY) }, startMsg(idx)));
        broadcast({ t: 'rejoined', p: idx, f: R }, c); broadcast(lobbyState()); console.log(name + ' rejoined as player ' + idx + ', live again from frame ' + R);
        return;
      }
      if (!me) lobby.players.push({ id: c.id, name: String(m.name || 'Player').slice(0, 16), race: m.race || 'R', team: lobby.players.length + 1 }); broadcast(lobbyState()); break;
    }
    case 'set': if (me) { if (m.race) me.race = m.race; if (m.team) me.team = m.team; if (isHost && m.layout) lobby.layout = m.layout; if (isHost && m.speed != null) lobby.speed = Math.max(0, Math.min(6, m.speed | 0)); } broadcast(lobbyState()); break; // everyone must run the same speed or lockstep just makes the fast clients wait
    case 'addai': if (isHost && lobby.players.length < 8) { lobby.players.push({ id: -(nextId++), name: 'Computer ' + lobby.players.filter(p => p.ai).length, race: m.race || 'R', team: lobby.players.length + 1, ai: true, difficulty: m.difficulty || 'normal' }); broadcast(lobbyState()); } break;
    case 'kick': if (isHost && lobby.state === 'lobby') { lobby.players = lobby.players.filter(p => p.id !== m.id); broadcast(lobbyState()); } break;
    case 'start': {
      if (!isHost || lobby.state !== 'lobby' || lobby.players.filter(p => !p.ai).length < 1) return; lobby.state = 'playing';
      lobby.seed = Math.floor(Math.random() * 1e9); const races = ['T', 'Z', 'P'];
      lobby.started = lobby.players.map(p => ({ name: p.name, race: p.race === 'R' ? races[Math.floor(Math.random() * 3)] : p.race, team: p.team, human: !p.ai, difficulty: p.difficulty }));
      lobby.history = []; lobby.lastF = {}; lobby.gone = {};
      for (const cl of clients.values()) { const idx = lobby.players.findIndex(p => p.id === cl.id); if (idx >= 0) send(cl, Object.assign({ t: 'start' }, startMsg(idx))); }
      console.log('game started: ' + lobby.started.map(p => p.name + '/' + p.race).join(', ') + ' on ' + lobby.layout + ' seed ' + lobby.seed);
      break;
    }
    case 'cmds': { const idx = lobby.players.findIndex(p => p.id === c.id); if (idx >= 0 && lobby.state === 'playing') { const f = m.f | 0; lobby.history.push({ p: idx, f, c: m.c }); if (!(lobby.lastF[idx] >= f)) lobby.lastF[idx] = f; broadcast({ t: 'cmds', p: idx, f, c: m.c }, c); } break; }
    case 'hash': { const idx = lobby.players.findIndex(p => p.id === c.id); if (idx >= 0) broadcast({ t: 'hash', p: idx, f: m.f, h: m.h }, c); break; }
    case 'chat': if (me) broadcast({ t: 'chat', from: me.name, text: String(m.text).slice(0, 200) }); break;
    case 'ping': send(c, { t: 'pong' }); break;
  }
}
function leave(c) {
  if (!clients.has(c.id)) return; clients.delete(c.id);
  const idx = lobby.players.findIndex(p => p.id === c.id);
  if (lobby.state === 'playing') {
    if (idx >= 0 && !lobby.players[idx].gone) {
      // every client can only have simulated up to the last frame this player sent a batch for; stop their units on the next one
      const stopAt = Math.max((lobby.lastF[idx] == null ? -1 : lobby.lastF[idx]) + 1, DELAY);
      lobby.players[idx].gone = true; lobby.players[idx].id = 0; lobby.gone[idx] = { from: stopAt, to: null };
      broadcast({ t: 'left', p: idx, f: stopAt }); broadcast(lobbyState()); console.log(lobby.players[idx].name + ' dropped; units stop at frame ' + stopAt);
    }
    if (!clients.size) { lobby.players = []; lobby.state = 'lobby'; lobby.history = []; lobby.lastF = {}; lobby.gone = {}; console.log('all players gone, back to lobby'); }
  }
  else { lobby.players = lobby.players.filter(p => p.id !== c.id); if (!lobby.players.some(p => !p.ai)) lobby.players = []; broadcast(lobbyState()); }
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
  const c = { id: nextId++, socket, buf: Buffer.alloc(0) }; clients.set(c.id, c); socket.setNoDelay(true);
  socket.on('data', d => onData(c, d)); socket.on('close', () => leave(c)); socket.on('error', () => leave(c));
  send(c, { t: 'hello', id: c.id, state: lobby.state });
});
server.listen(port, () => {
  const ips = []; for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  console.log('Brood War Remake: http://localhost:' + port + (ips.length ? '   LAN: ' + ips.map(ip => 'http://' + ip + ':' + port).join(' ') : ''));
});
