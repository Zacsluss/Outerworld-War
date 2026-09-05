'use strict';
// ============================================================================
// LAN multiplayer client: deterministic lockstep over a WebSocket relay.
// Commands issued at local frame F are scheduled for frame F+delay on all
// clients; a frame only advances once every human player's batch for it has
// arrived.
// ============================================================================
const Net = {
  active: false, ws: null, me: -1, delay: 3, outbox: [], inbox: {}, sent: {}, gone: {}, players: [], lobby: null, connected: false, id: 0, waitingSince: 0, chatLog: [],
  defaultUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host || 'localhost:8765') + '/ws'; },
  connect(url, name, race) {
    this.disconnect(); const ws = new WebSocket(url || this.defaultUrl()); this.ws = ws;
    ws.onopen = () => { this.connected = true; this.send({ t: 'join', name, race }); this.status('Connected. Waiting in lobby...'); };
    ws.onmessage = ev => { try { this.handle(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
    ws.onclose = () => { this.connected = false; if (this.active) { this.status('Connection lost.'); } this.lobby = null; this.render(); };
    ws.onerror = () => { this.status('Could not connect to ' + (url || this.defaultUrl())); };
  },
  disconnect() { if (this.ws) { try { this.ws.close(); } catch (e) { } } this.ws = null; this.connected = false; this.active = false; this.lobby = null; },
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
  status(t) { const el = document.getElementById('netStatus'); if (el) el.textContent = t; },
  handle(m) {
    switch (m.t) {
      case 'hello': this.id = m.id; if (m.state !== 'lobby') this.status('A game is already running on this server.'); break;
      case 'lobby': this.lobby = m; this.render(); break;
      case 'error': this.status(m.msg); break;
      case 'start': this.startGame(m); break;
      case 'cmds': if (!this.inbox[m.f]) this.inbox[m.f] = {}; this.inbox[m.f][m.p] = m.c; break;
      case 'left': this.gone[m.p] = true; if (G.players[m.p]) G.players[G.human].msg(G.players[m.p].name + ' has left the game.', 'info'); break;
      case 'chat': if (typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg(m.from + ': ' + m.text, 'chat'); this.chatLog.push(m); break;
    }
  },
  render() {
    const el = document.getElementById('lobby'); if (!el) return; const L = this.lobby; if (!L) { el.innerHTML = ''; return; }
    const meP = L.players.find(p => p.id === this.id); const host = !!(meP && meP.host);
    let h = '<div class="lobbyList">' + L.players.map(p => `<div class="lp">${p.host ? '★ ' : ''}${p.name}${p.ai ? ' (AI ' + p.difficulty + ')' : ''} — ${{ T: 'Terran', Z: 'Zerg', P: 'Protoss', R: 'Random' }[p.race]} — Team ${p.team}${host && p.id !== this.id ? ` <a href="#" data-kick="${p.id}">✕</a>` : ''}</div>`).join('') + '</div>';
    if (meP) h += `<div class="row"><label>My race</label><select id="lbRace"><option value="R">Random</option><option value="T">Terran</option><option value="Z">Zerg</option><option value="P">Protoss</option></select><label>Team</label><select id="lbTeam">${[1, 2, 3, 4].map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>`;
    if (host) h += `<div class="row"><label>Map</label><select id="lbLayout"><option value="temple">Lost Ruins</option><option value="bloodbath">Blood Pit</option><option value="valley">Twilight Valley</option></select><button id="lbAddAi" class="small">ADD AI</button></div><button id="lbStart">START MULTIPLAYER GAME</button>`;
    else h += '<div class="sub">Waiting for the host to start...</div>';
    el.innerHTML = h;
    if (meP) { const r = document.getElementById('lbRace'), t = document.getElementById('lbTeam'); r.value = meP.race; t.value = meP.team; r.onchange = () => this.send({ t: 'set', race: r.value }); t.onchange = () => this.send({ t: 'set', team: parseInt(t.value) }); }
    if (host) { const ly = document.getElementById('lbLayout'); ly.value = L.layout; ly.onchange = () => this.send({ t: 'set', layout: ly.value }); document.getElementById('lbAddAi').onclick = () => this.send({ t: 'addai', race: 'R', difficulty: 'normal' }); document.getElementById('lbStart').onclick = () => this.send({ t: 'start' }); }
    el.querySelectorAll('[data-kick]').forEach(a => a.onclick = e => { e.preventDefault(); this.send({ t: 'kick', id: parseInt(a.dataset.kick) }); });
  },
  startGame(m) {
    this.active = true; this.me = m.you; this.delay = m.delay || 3; this.outbox = []; this.inbox = {}; this.sent = {}; this.gone = {}; this.players = m.players;
    for (let f = 0; f < this.delay; f++) { this.inbox[f] = {}; m.players.forEach((p, i) => { if (p.human) this.inbox[f][i] = []; }); this.sent[f] = true; }
    UI.start({ players: m.players.map(p => ({ race: p.race, human: p.human, name: p.name, difficulty: p.difficulty, team: p.team })), seed: m.seed, layout: m.layout, human: m.you, mode: 'play', net: true });
  },
  queue(c) { c.p = this.me; this.outbox.push(c); },
  // can frame F be simulated? (all live human players' batches for F present)
  ready(f) { const b = this.inbox[f] || {}; for (let i = 0; i < this.players.length; i++) { const p = this.players[i]; if (!p.human || this.gone[i]) continue; if (!b[i]) return false; } return true; },
  // send my batch for F+delay and apply everyone's batch for F
  beforeTick() {
    const f = G.frame, tf = f + this.delay;
    if (!this.sent[tf]) { const c = this.outbox; this.outbox = []; this.send({ t: 'cmds', f: tf, c }); if (!this.inbox[tf]) this.inbox[tf] = {}; this.inbox[tf][this.me] = c; this.sent[tf] = true; }
    const b = this.inbox[f] || {};
    for (let i = 0; i < this.players.length; i++) for (const c of (b[i] || [])) G.exec(c);
    delete this.inbox[f]; delete this.sent[f];
  },
  chat(text) { this.send({ t: 'chat', text }); },
};
