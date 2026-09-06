'use strict';
// ============================================================================
// LAN multiplayer client: deterministic lockstep over a WebSocket relay.
// Commands issued at local frame F are scheduled for frame F+delay on all
// clients; a frame only advances once every live human player's batch for it
// has arrived. Every HASH_EVERY frames the clients exchange a state hash;
// a mismatch is reported on screen and both command logs are dumped.
// A dropped player's units stop at a frame chosen by the relay (so every
// client applies it on the same tick); the player can rejoin by connecting
// again with the same name: the relay sends the whole command history and
// the client re-simulates from frame 0, then rejoins the lockstep.
// ============================================================================
const Net = {
  active: false, ws: null, me: -1, delay: 3, outbox: [], inbox: {}, sent: {}, gone: {}, players: [], lobby: null, connected: false, id: 0, waitingSince: 0, chatLog: [],
  HASH_EVERY: 48, myHashes: {}, theirHashes: {}, desynced: false, desyncFrame: -1, catchingUp: false, catchTarget: 0, serverState: 'lobby', name: 'Player', lastError: '',
  defaultUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host || 'localhost:8765') + '/ws'; },
  connect(url, name, race) {
    this.disconnect(); this.name = name || 'Player'; const ws = new WebSocket(url || this.defaultUrl()); this.ws = ws;
    ws.onopen = () => { this.connected = true; this.send({ t: 'join', name: this.name, race }); this.status('Connected. Waiting in lobby...'); };
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
      case 'hello': this.id = m.id; this.serverState = m.state; if (m.state !== 'lobby') this.status('A game is running on this server. Connect with the name you used to rejoin it.'); break;
      case 'lobby': this.lobby = m; this.serverState = m.state; this.render(); break;
      case 'error': this.lastError = m.msg; this.status(m.msg); break;
      case 'start': this.startGame(m); break;
      case 'rejoin': this.rejoinGame(m); break;
      case 'cmds': if (this.active && m.f >= G.frame) { if (!this.inbox[m.f]) this.inbox[m.f] = {}; this.inbox[m.f][m.p] = m.c; } break;
      case 'hash': this.onHash(m); break;
      case 'left': { this.gone[m.p] = { from: m.f, to: Infinity }; if (typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg(this.playerName(m.p) + ' dropped. Their units stop at ' + this.clock(m.f) + '; the game continues.', 'info'); break; }
      case 'rejoined': { const g = this.gone[m.p]; if (g) g.to = m.f; else this.gone[m.p] = { from: -1, to: m.f }; if (typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg(this.playerName(m.p) + ' is rejoining; they take control again at ' + this.clock(m.f) + '.', 'info'); break; }
      case 'chat': if (typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg(m.from + ': ' + m.text, 'chat'); this.chatLog.push(m); break;
    }
  },
  clock(f) { const s = Math.floor(f / TPS); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  render() {
    const el = document.getElementById('lobby'); if (!el) return; const L = this.lobby; if (!L) { el.innerHTML = ''; return; }
    const meP = L.players.find(p => p.id === this.id); const host = !!(meP && meP.host);
    let h = '<div class="lobbyList">' + L.players.map(p => `<div class="lp">${p.host ? '★ ' : ''}${p.name}${p.ai ? ' (AI ' + p.difficulty + ')' : ''}${p.gone ? ' (dropped)' : ''} — ${{ T: 'Terran', Z: 'Zerg', P: 'Protoss', R: 'Random' }[p.race]} — Team ${p.team}${host && p.id !== this.id ? ` <a href="#" data-kick="${p.id}">✕</a>` : ''}</div>`).join('') + '</div>';
    if (L.state !== 'lobby') { h += '<div class="sub">Game in progress. Dropped players can rejoin by connecting with their name.</div>'; el.innerHTML = h; return; }
    if (meP) h += `<div class="row"><label>My race</label><select id="lbRace"><option value="R">Random</option><option value="T">Terran</option><option value="Z">Zerg</option><option value="P">Protoss</option></select><label>Team</label><select id="lbTeam">${[1, 2, 3, 4].map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>`;
    if (host) h += `<div class="row"><label>Map</label><select id="lbLayout"><option value="temple">Lost Ruins</option><option value="bloodbath">Blood Pit</option><option value="valley">Twilight Valley</option></select><button id="lbAddAi" class="small">ADD AI</button></div><button id="lbStart">START MULTIPLAYER GAME</button>`;
    else h += '<div class="sub">Waiting for the host to start...</div>';
    el.innerHTML = h;
    if (meP) { const r = document.getElementById('lbRace'), t = document.getElementById('lbTeam'); r.value = meP.race; t.value = meP.team; r.onchange = () => this.send({ t: 'set', race: r.value }); t.onchange = () => this.send({ t: 'set', team: parseInt(t.value) }); }
    if (host) { const ly = document.getElementById('lbLayout'); ly.value = L.layout; ly.onchange = () => this.send({ t: 'set', layout: ly.value }); document.getElementById('lbAddAi').onclick = () => this.send({ t: 'addai', race: 'R', difficulty: 'normal' }); document.getElementById('lbStart').onclick = () => this.send({ t: 'start' }); }
    el.querySelectorAll('[data-kick]').forEach(a => a.onclick = e => { e.preventDefault(); this.send({ t: 'kick', id: parseInt(a.dataset.kick) }); });
  },
  reset(m) {
    this.active = true; this.me = m.you; this.delay = m.delay || 3; this.outbox = []; this.inbox = {}; this.sent = {}; this.gone = {}; this.appliedFrame = -1; this.players = m.players; this.myHashes = {}; this.theirHashes = {}; this.desynced = false; this.desyncFrame = -1; this.catchingUp = false;
    for (let f = 0; f < this.delay; f++) { this.inbox[f] = {}; m.players.forEach((p, i) => { if (p.human) this.inbox[f][i] = []; }); this.sent[f] = true; }
    for (const [p, g] of Object.entries(m.gone || {})) this.gone[p] = { from: g.from, to: g.to == null ? Infinity : g.to };
  },
  startGame(m) {
    this.reset(m);
    UI.start({ players: m.players.map(p => ({ race: p.race, human: p.human, name: p.name, difficulty: p.difficulty, team: p.team })), seed: m.seed, layout: m.layout, human: m.you, mode: 'play', net: true });
  },
  // Rejoin after a drop: the relay sends every command batch since the start; re-simulate from frame 0, then continue live.
  rejoinGame(m) {
    this.reset(m);
    for (const h of (m.history || [])) { if (!this.inbox[h.f]) this.inbox[h.f] = {}; this.inbox[h.f][h.p] = h.c; if (h.p === this.me) this.sent[h.f] = true; }
    this.catchingUp = true; this.catchTarget = m.frame || 0;
    UI.start({ players: m.players.map(p => ({ race: p.race, human: p.human, name: p.name, difficulty: p.difficulty, team: p.team })), seed: m.seed, layout: m.layout, human: m.you, mode: 'play', net: true });
    UI.loading = { target: this.catchTarget, start: 0, label: 'Rejoining... re-simulating' };
  },
  queue(c) { c.p = this.me; this.outbox.push(c); },
  isGone(i, f) { const g = this.gone[i]; return !!g && f >= g.from && f < g.to; },
  // can frame F be simulated? (all live human players' batches for F present)
  ready(f) { const b = this.inbox[f] || {}; for (let i = 0; i < this.players.length; i++) { const p = this.players[i]; if (!p.human || this.isGone(i, f)) continue; if (!b[i]) return false; } return true; },
  // send my batch for F+delay and apply everyone's batch for F
  beforeTick() {
    const f = G.frame, tf = f + this.delay;
    if (!this.sent[tf]) { const c = this.outbox; this.outbox = []; this.send({ t: 'cmds', f: tf, c }); if (!this.inbox[tf]) this.inbox[tf] = {}; this.inbox[tf][this.me] = c; this.sent[tf] = true; }
    if (this.appliedFrame === f) return; this.appliedFrame = f; // a finished (or paused) game must never apply a frame's batch twice
    for (let i = 0; i < this.players.length; i++) { const g = this.gone[i]; if (g && g.from === f) G.exec({ t: 'stopall', p: i }); }
    const b = this.inbox[f] || {};
    for (let i = 0; i < this.players.length; i++) for (const c of (b[i] || [])) G.exec(c);
    delete this.inbox[f]; delete this.sent[f];
    if (f % this.HASH_EVERY === 0 && f > 0) this.exchangeHash(f);
  },
  // ---------------- desync detection ----------------
  exchangeHash(f) {
    const h = G.stateHash(); this.myHashes[f] = h; this.send({ t: 'hash', f, h });
    const theirs = this.theirHashes[f]; if (theirs) for (const [p, th] of Object.entries(theirs)) if (th !== h) this.desync(f, +p);
    for (const k of Object.keys(this.myHashes)) if (+k < f - this.HASH_EVERY * 40) { delete this.myHashes[k]; delete this.theirHashes[k]; }
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
