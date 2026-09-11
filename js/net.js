'use strict';
// ============================================================================
// LAN multiplayer client: deterministic lockstep over a WebSocket relay.
// Commands issued at local frame F are scheduled for frame F+delay on all
// clients; a frame only advances once every live human player's batch for it
// has arrived. Every HASH_EVERY frames the clients exchange a state hash;
// a mismatch is reported on screen and both command logs are dumped.
// A dropped player's units stop at a frame chosen by the relay (so every
// client applies it on the same tick); the player can rejoin by connecting
// again with the same name and room: the relay asks a live player for a
// snapshot and sends it with the commands since, so the client restores and
// replays only the tail (or, with no donor, re-simulates the whole history
// from frame 0), then rejoins the lockstep.
// ============================================================================
// Speed names for the lobby. Duplicated from UI rather than referenced, because net.js is loaded
// without ui.js in the headless harnesses and reaching into UI here threw for both clients.
const NET_SPEED_NAMES = ['Slowest', 'Slower', 'Slow', 'Normal', 'Fast', 'Faster', 'Fastest'];
const Net = {
  active: false, ws: null, me: -1, delay: 3, outbox: [], inbox: {}, sent: {}, gone: {}, players: [], lobby: null, connected: false, id: 0, waitingSince: 0, room: '',
  HASH_EVERY: 48, myHashes: {}, theirHashes: {}, desynced: false, desyncFrame: -1, catchingUp: false, catchTarget: 0, name: 'Player', lastError: '',
  defaultUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host || 'localhost:8765') + '/ws'; },
  // `room` is a short code deciding WHICH game on this relay you are joining, and on a public server
  // it is the only thing stopping anything with the link walking into your lobby. Empty means the room
  // called LAN, so a LAN game needs nothing typed and behaves exactly as it always did.
  //
  // KEPT ON `this` so a caller that passes no room lands in the one it had. The connect button always
  // passes the room field's current value, so in practice what keeps a rejoin in its room is that field
  // still holding the code: clear it and you land in LAN and are refused as a stranger.
  connect(url, name, race, room) {
    this.disconnect(); this.name = name || 'Player'; this.room = (room == null ? this.room : room) || ''; const ws = new WebSocket(url || this.defaultUrl()); this.ws = ws;
    ws.onopen = () => { this.connected = true; this.send({ t: 'join', name: this.name, race, room: this.room }); this.status('Connected. Waiting in lobby...'); };
    ws.onmessage = ev => { try { this.handle(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
    ws.onclose = () => { this.connected = false; if (this.active) { this.status('Connection lost.'); if (typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg('Connection to the relay lost. Reconnect from the menu with the same name to rejoin.', 'error'); } this.lobby = null; this.render(); };
    ws.onerror = () => { this.status('Could not connect to ' + (url || this.defaultUrl())); };
  },
  disconnect() { if (this.ws) { try { this.ws.close(); } catch (e) { } } this.ws = null; this.connected = false; this.active = false; this.lobby = null; this.catchingUp = false; },
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
  status(t) { const el = document.getElementById('netStatus'); if (el) el.textContent = t; },
  playerName(i) { const p = this.players[i]; return p ? p.name : 'Player ' + (i + 1); },
  handle(m) {
    switch (m.t) {
      // GUARDED ON `m.state` BEING PRESENT, which is not belt and braces. A relay with rooms cannot say
      // whether "the game" is running before it has been given a code -- answering would leak that the
      // room exists, which is the one secret the code is. So `hello` describes the relay and the real
      // state arrives with the `lobby` message `join` triggers, or the `error` that refuses it. Without
      // the guard `undefined !== 'lobby'` is true and every fresh connection announces a game in
      // progress that may not exist.
      case 'hello': this.id = m.id; if (m.state && m.state !== 'lobby') this.status('A game is running on this server. Connect with the name you used to rejoin it.'); break;
      case 'lobby': this.lobby = m; this.render(); break;
      case 'error': this.lastError = m.msg; this.status(m.msg); break;
      case 'start': this.startGame(m); break;
      case 'rejoin': this.rejoinGame(m); break;
      // `applied`: whether this frame's batch is already in the state being snapshotted. Between ticks it
      // never is (beforeTick applied frame F, G.tick moved to F + 1); once the game is over or paused,
      // G.tick no-ops and the frame stays on the batch it applied, so a rejoiner that assumed the usual
      // case applied that batch twice. (REVIEW-M17 task 14)
      case 'needsnap': if (this.active && typeof Snapshot !== 'undefined') { try { this.send({ t: 'snap', req: m.req, frame: G.frame, applied: this.appliedFrame === G.frame, snap: Snapshot.take() }); } catch (e) { console.error('snapshot for rejoin failed', e); } } break;
      case 'cmds': if (this.active && m.f >= G.frame) { if (!this.inbox[m.f]) this.inbox[m.f] = {}; this.inbox[m.f][m.p] = Array.isArray(m.c) ? m.c : []; } break;   // a batch that is not a list counts as an empty one that ARRIVED, so the frame is not blocked forever
      case 'hash': this.onHash(m); break;
      case 'left': { this.gone[m.p] = { from: m.f, to: Infinity }; if (typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg(this.playerName(m.p) + ' dropped. Their units stop at ' + this.clock(m.f) + '; the game continues.', 'info'); break; }
      case 'rejoined': { const g = this.gone[m.p]; if (g) g.to = m.f; else this.gone[m.p] = { from: -1, to: m.f }; if (typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg(this.playerName(m.p) + ' is rejoining; they take control again at ' + this.clock(m.f) + '.', 'info'); break; }
      case 'chat': if (typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg(m.from + ': ' + m.text, 'chat'); break;
    }
  },
  clock(f) { const s = Math.floor(f / TPS); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  // Everything from the relay that lands in innerHTML goes through here: a 16-character name fits
  // <svg/onload=x()>, and on a public tunnel that is script in every lobby member's page. (REVIEW-M17)
  esc(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); },
  render() {
    const el = document.getElementById('lobby'); if (!el) return; const L = this.lobby; if (!L) { el.innerHTML = ''; return; }
    const meP = L.players.find(p => p.id === this.id); const host = !!(meP && meP.host);
    // The room is shown only when it is not the default: on a LAN there is one room and naming it is
    // noise, and over a tunnel it is the thing everyone needs to have agreed on.
    let h = (L.room && L.room !== 'LAN' ? '<div class="sub">Room <b>' + this.esc(L.room) + '</b></div>' : '') + '<div class="lobbyList">' + L.players.map(p => `<div class="lp">${p.host ? '★ ' : ''}${this.esc(p.name)}${p.ai ? ' (AI ' + this.esc(p.difficulty) + ')' : ''}${p.gone ? ' (dropped)' : ''} — ${{ T: 'Terran', Z: 'Zerg', P: 'Protoss', R: 'Random' }[p.race]} — Team ${p.team}${host && p.id !== this.id ? ` <a href="#" data-kick="${p.id}">✕</a>` : ''}</div>`).join('') + '</div>';
    if (L.state !== 'lobby') { h += '<div class="sub">Game in progress. Dropped players can rejoin by connecting with their name.</div>'; el.innerHTML = h; return; }
    if (meP) h += `<div class="row"><label>My race</label><select id="lbRace"><option value="R">Random</option><option value="T">Terran</option><option value="Z">Zerg</option><option value="P">Protoss</option></select><label>Team</label><select id="lbTeam">${[1, 2, 3, 4].map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>`;
    if (host) h += `<div class="row"><label>Map</label><select id="lbLayout"><option value="temple">Lost Ruins</option><option value="bloodbath">Blood Pit</option><option value="valley">Twilight Valley</option></select><button id="lbAddAi" class="small">ADD AI</button></div><div class="row"><label>Speed</label><select id="lbSpeed">` + NET_SPEED_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('') + `</select></div><button id="lbStart">START MULTIPLAYER GAME</button>`;
    else h += '<div class="sub">Waiting for the host to start... (speed: ' + NET_SPEED_NAMES[L.speed == null ? 6 : L.speed] + ')</div>';
    el.innerHTML = h;
    if (meP) { const r = document.getElementById('lbRace'), t = document.getElementById('lbTeam'); r.value = meP.race; t.value = meP.team; r.onchange = () => this.send({ t: 'set', race: r.value }); t.onchange = () => this.send({ t: 'set', team: parseInt(t.value) }); }
    if (host) { const ly = document.getElementById('lbLayout'); ly.value = L.layout; ly.onchange = () => this.send({ t: 'set', layout: ly.value }); const sp = document.getElementById('lbSpeed'); if (sp) { sp.value = String(L.speed == null ? 6 : L.speed); sp.onchange = () => this.send({ t: 'set', speed: +sp.value }); } document.getElementById('lbAddAi').onclick = () => this.send({ t: 'addai', race: 'R', difficulty: 'normal' }); document.getElementById('lbStart').onclick = () => this.send({ t: 'start' }); }
    el.querySelectorAll('[data-kick]').forEach(a => a.onclick = e => { e.preventDefault(); this.send({ t: 'kick', id: parseInt(a.dataset.kick) }); });
  },
  reset(m) {
    this.active = true; this.me = m.you; this.delay = m.delay || 3; this.outbox = []; this.inbox = {}; this.sent = {}; this.gone = {}; this.appliedFrame = -1; this.players = m.players; this.myHashes = {}; this.theirHashes = {}; this.desynced = false; this.desyncFrame = -1; this.catchingUp = false;
    for (let f = 0; f < this.delay; f++) { this.inbox[f] = {}; m.players.forEach((p, i) => { if (p.human) this.inbox[f][i] = []; }); this.sent[f] = true; }
    for (const [p, g] of Object.entries(m.gone || {})) this.gone[p] = { from: g.from, to: g.to == null ? Infinity : g.to };
  },
  startGame(m) {
    this.reset(m);
    this.speed = m.speed == null ? 6 : m.speed; // agreed in the lobby; every client must pace the same or lockstep just makes the fast ones wait
    this.cheats = !!m.cheats;                   // the relay says whether cheats are on for this game (off unless it was started with BW_CHEATS=1)
    UI.start({ players: m.players.map(p => ({ race: p.race, human: p.human, name: p.name, difficulty: p.difficulty, team: p.team, style: p.style, minerals: p.minerals, gas: p.gas })), seed: m.seed, layout: m.layout, human: m.you, mode: 'play', net: true });
  },
  // Rejoin after a drop: the relay sends every command batch since the start; re-simulate from frame 0, then continue live.
  rejoinGame(m) {
    this.reset(m);
    this.speed = m.speed == null ? 6 : m.speed; this.cheats = !!m.cheats;
    for (const h of (m.history || [])) { if (!this.inbox[h.f]) this.inbox[h.f] = {}; this.inbox[h.f][h.p] = Array.isArray(h.c) ? h.c : []; if (h.p === this.me) this.sent[h.f] = true; }
    this.catchingUp = true; this.catchTarget = m.frame || 0;
    UI.start({ players: m.players.map(p => ({ race: p.race, human: p.human, name: p.name, difficulty: p.difficulty, team: p.team, style: p.style, minerals: p.minerals, gas: p.gas })), seed: m.seed, layout: m.layout, human: m.you, mode: 'play', net: true });
    // A snapshot from a live player skips straight to their state; only the commands after it get replayed.
    // Without one this re-simulates the whole game, which gets slower the longer the game has run.
    let from = 0;
    if (m.snap && typeof Snapshot !== 'undefined') {
      try { Snapshot.restore(m.snap); from = G.frame; this.appliedFrame = m.snapApplied ? G.frame : G.frame - 1; }   // the donor said whether its frame's batch is already in this state (task 14)
      catch (e) { console.error('rejoin snapshot rejected, re-simulating instead', e); }
    }
    UI.loading = { target: this.catchTarget, start: from, label: m.snap ? 'Rejoining... catching up' : 'Rejoining... re-simulating' };
  },
  queue(c) { c.p = this.me; this.outbox.push(c); },
  isGone(i, f) { const g = this.gone[i]; return !!g && f >= g.from && f < g.to; },
  // can frame F be simulated? (all live human players' batches for F present)
  ready(f) { const b = this.inbox[f] || {}; for (let i = 0; i < this.players.length; i++) { const p = this.players[i]; if (!p.human || this.isGone(i, f)) continue; if (!b[i]) return false; } return true; },
  // send my batch for F+delay and apply everyone's batch for F
  beforeTick() {
    const f = G.frame, tf = f + this.delay;
    // Catching up ends at the target frame, not when the inbox runs dry. Restoring from a snapshot lands
    // us at the target already, and the other players keep feeding us commands, so waiting for an empty
    // inbox would mean catching up forever.
    if (this.catchingUp && f >= this.catchTarget) this.catchingUp = false;
    if (!this.sent[tf]) { const c = this.outbox; this.outbox = []; this.send({ t: 'cmds', f: tf, c }); if (!this.inbox[tf]) this.inbox[tf] = {}; this.inbox[tf][this.me] = c; this.sent[tf] = true; }
    if (this.appliedFrame === f) return; this.appliedFrame = f; // a finished (or paused) game must never apply a frame's batch twice
    for (let i = 0; i < this.players.length; i++) { const g = this.gone[i]; if (g && g.from === f) G.exec({ t: 'stopall', p: i }); }
    const b = this.inbox[f] || {};
    // The slot the batch arrived under is the owner of every command in it, whatever `p` the sender
    // wrote: the relay stamps it too, and this covers a rejoin history from an older relay. (REVIEW-M17)
    for (let i = 0; i < this.players.length; i++) { const batch = Array.isArray(b[i]) ? b[i] : []; for (const c of batch) { if (!c || typeof c !== 'object') continue; c.p = i; G.exec(c); } }
    delete this.inbox[f]; delete this.sent[f];
    if (f % this.HASH_EVERY === 0 && f > 0) this.exchangeHash(f);
  },
  // ---------------- desync detection ----------------
  exchangeHash(f) {
    const h = G.stateHash(); this.myHashes[f] = h; this.send({ t: 'hash', f, h });
    const theirs = this.theirHashes[f]; if (theirs) for (const [p, th] of Object.entries(theirs)) if (th !== h) this.desync(f, +p);
    for (const k of Object.keys(this.myHashes)) if (+k < f - this.HASH_EVERY * 40) delete this.myHashes[k];
    for (const k of Object.keys(this.theirHashes)) if (+k < f - this.HASH_EVERY * 40) delete this.theirHashes[k];   // by its own keys: a peer's hashes for frames we never hashed used to pile up forever
  },
  onHash(m) {
    if (!this.active) return;
    if (!this.theirHashes[m.f]) this.theirHashes[m.f] = {}; this.theirHashes[m.f][m.p] = m.h;
    const mine = this.myHashes[m.f]; if (mine !== undefined && mine !== m.h) this.desync(m.f, m.p);
  },
  desync(f, p) {
    if (this.desynced) return; this.desynced = true; this.desyncFrame = f;
    const hp = G.players[G.human]; if (hp) hp.msg('DESYNC detected at ' + this.clock(f) + ' with ' + this.playerName(p) + '. Command logs saved; the game keeps running but is no longer in sync.', 'error');
    console.error('desync at frame ' + f + ' with player ' + p);
    try { if (typeof Replay !== 'undefined' && typeof document !== 'undefined' && document.body) Replay.download(Object.assign(Replay.data(), { desync: f, me: this.me, hashes: this.myHashes }), 'broodwar-desync-' + f + '-p' + this.me + '.json'); } catch (e) { console.error(e); }
  },
  chat(text) { this.send({ t: 'chat', text }); },
};
