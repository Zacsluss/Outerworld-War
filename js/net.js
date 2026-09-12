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
  lobbies: null, browsing: false, chatLog: [], teamsShown: 2, race: 'R',   // the browser: the list, whether we asked for it, the lobby chat, the empty teams shown, the race we join with
  count: 0, countMsg: '',   // the relay's start countdown: the digit it last sent, and why it stopped if it was cancelled
  HASH_EVERY: 48, myHashes: {}, theirHashes: {}, desynced: false, desyncFrame: -1, catchingUp: false, catchTarget: 0, name: 'Player', lastError: '',
  defaultUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host || 'localhost:8765') + '/ws'; },
  // ---------------- the way in ----------------
  // One socket, three ways in. `connect` joins a room by code the moment the socket opens -- the room
  // called LAN when the code is empty -- which is the path test/net.js, test/net_many.js and a private
  // game still use. `browse` opens the socket and asks the relay for the list of hosted games instead;
  // `host` and `join` then create or enter one over the same socket. (The lobby browser is the fifth
  // session's, the user's call: a hosted game is listed for everyone on the server, a code-joined room is
  // not, so a code is still a lock for anyone who wants one.)
  //
  // `room` is KEPT ON `this` so a caller that passes no room lands in the one it had: what keeps a rejoin
  // in its room is the code still held here.
  open(url, name, onopen) {
    this.disconnect(); this.name = name || 'Player'; this.lobbies = null; this.chatLog = []; this.teamsShown = 2; const ws = new WebSocket(url || this.defaultUrl()); this.ws = ws;
    ws.onopen = () => { this.connected = true; onopen(); };
    ws.onmessage = ev => { try { this.handle(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
    // Guarded on `this.ws === ws`: disconnect() closes the old socket when a new one opens, and the old
    // one's close arrived after the new session had begun and wiped its lobby.
    ws.onclose = () => { if (this.ws !== ws) return; this.connected = false; if (this.active) { this.status('Connection lost.'); if (typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg('Connection to the relay lost. Reconnect from the menu with the same name to rejoin.', 'error'); } this.lobby = null; this.lobbies = null; this.browsing = false; this.render(); };
    ws.onerror = () => { this.status('Could not connect to ' + (url || this.defaultUrl())); };
  },
  connect(url, name, race, room) { this.room = (room == null ? this.room : room) || ''; this.browsing = false; this.open(url, name, () => { this.send({ t: 'join', name: this.name, race, room: this.room }); this.status('Connected. Waiting in lobby...'); }); },
  browse(url, name, opts) { this.room = ''; this.browsing = true; this.open(url, name, () => { this.status('Connected.'); if (opts && opts.host) this.host(opts.title); else this.send({ t: 'list' }); this.render(); }); },
  host(title) { this.send({ t: 'join', name: this.name, race: this.race, create: true, title: String(title || '').trim() || this.name + "'s game" }); this.status('Hosting...'); },
  join(code) { code = String(code || '').trim(); if (!code) { this.status('Type a room code first.'); return; } this.room = code; this.send({ t: 'join', name: this.name, race: this.race, room: code }); this.status('Joining ' + code.toUpperCase() + '...'); },
  leaveRoom() { this.send({ t: 'leave' }); this.lobby = null; this.room = ''; this.browsing = true; this.chatLog = []; this.teamsShown = 2; this.count = 0; this.countMsg = ''; this.status('Connected.'); this.render(); },
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
      // Only a client in no room is sent the list, so receiving it means the relay has us out of any lobby
      // (left, or kicked): back to the browser.
      case 'lobbies': this.lobbies = Array.isArray(m.rooms) ? m.rooms : []; this.lobby = null; this.browsing = true; this.render(); if (typeof Desktop !== 'undefined' && Desktop.hosting) Desktop.share(); break;
      case 'lobby': this.lobby = m; if (m.room) this.room = m.room; this.count = m.count | 0; if (this.browsing) this.status('In the lobby.'); this.browsing = false; this.render(); if (typeof Desktop !== 'undefined' && Desktop.hosting) Desktop.share(); break;
      // THE START COUNTDOWN, and the relay is the clock (the user's item 12). A number arrives a second;
      // at zero the relay sends 'start' instead, so no client is ever counting on its own and none of
      // them can reach zero early. A cancelled countdown arrives as n 0 with the reason.
      case 'countdown': this.count = m.n | 0; this.countMsg = m.cancelled ? String(m.msg || 'The start was cancelled.') : ''; this.render(); break;
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
      case 'chat': if (this.active && typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg(m.from + ': ' + m.text, 'chat'); else { this.chatLog.push({ from: String(m.from), text: String(m.text) }); if (this.chatLog.length > 60) this.chatLog.shift(); this.render(); } break;   // in a game it is chat on screen; in the lobby it is the lobby's log
    }
  },
  clock(f) { const s = Math.floor(f / TPS); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  // Everything from the relay that lands in innerHTML goes through here: a 16-character name fits
  // <svg/onload=x()>, and on a public tunnel that is script in every lobby member's page. (REVIEW-M17)
  esc(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); },
  // ---------------- the browser and the lobby ----------------
  RACE_NAMES: { T: 'Terran', Z: 'Zerg', P: 'Protoss', R: 'Random' },
  DIFF_NAMES: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },
  // The play styles an AI slot may be given. The KEYS come from the table the simulation actually uses:
  // js/ai.js is loaded before this file in the page, so a sixth style appears in the lobby the day it
  // appears in AI.prototype.styleDeltas(), exactly as UI.setupStyles() does it for the skirmish screen.
  // The literal below is the labels plus the fallback for the headless harnesses, which load net.js on
  // its own. test/serve.js keeps its own copy of the KEYS as a filter and says why; a style added to the
  // table wants that list updated too, or the lobby offers one the relay quietly turns back to standard.
  STYLE_NAMES: { standard: 'Standard', turtle: 'Turtle', rusher: 'Rusher', expander: 'Expander', harasser: 'Harasser' },
  styles() {
    let keys = Object.keys(this.STYLE_NAMES);
    try { if (typeof AI !== 'undefined' && AI.prototype && AI.prototype.styleDeltas) keys = Object.keys(AI.prototype.styleDeltas()); } catch (ex) { }
    return keys.map(k => [k, this.STYLE_NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1))]);
  },
  // A slot's colour is its SEAT, not a choice. Player i is painted PLAYER_COLORS[i] in js/sim.js and the
  // relay starts the game in the order the lobby lists, so slot i really is that colour and the lobby can
  // say so truthfully. It is deliberately NOT a picker: a chosen colour has to be read back in G.init or
  // in Player's constructor, both STAMPED files, and TODO-M18 says not to move the build stamp for paint.
  slotColor(i) { try { return (typeof PLAYER_COLORS !== 'undefined' && PLAYER_COLORS[i]) || '#8f98a8'; } catch (ex) { return '#8f98a8'; } },
  // The maps a host may pick: the fixed maps and the archetype samples. Never a custom map -- it exists
  // only on the machine that drew it, and a client without it falls back to Lost Ruins: a desync on the
  // first frame -- and never the size keys, which are the skirmish screen's own control. [id, name, players].
  maps() {
    if (typeof MAP_LAYOUTS === 'undefined') return [['temple', 'Lost Ruins', 4], ['bloodbath', 'Blood Pit', 4], ['valley', 'Twilight Valley', 2]];
    const skip = (typeof MapModes !== 'undefined' && MapModes.keys) ? MapModes.keys : [];
    const out = []; for (const [id, L] of Object.entries(MAP_LAYOUTS)) { if (!L || L.custom || id === '__preview' || id.slice(0, 3) === 'sk:' || skip.includes(id)) continue; out.push([id, L.name || id, L.players || 0]); }
    return out;
  },
  mapName(id) { const m = this.maps().find(x => x[0] === id); return m ? m[1] : String(id || ''); },
  // THE MAP PREVIEW (the SC2 lobby has one; the fifth session left it out because the SEED is picked at
  // START). That was true of the GROUND and never of the START POSITIONS: those are the layout's
  // quadrant-0 bases mirrored four ways and then put in startOrder, with no seed anywhere in it. This
  // reproduces GameMap.generate's own arithmetic and CALLS its mirrorPt rather than copying it, so the
  // preview cannot drift from the map. Returns null when there is nothing honest to draw.
  mapStarts(id) {
    let L = null;
    try { L = (typeof MAP_LAYOUTS !== 'undefined' && MAP_LAYOUTS[id]) || null; } catch (ex) { }
    if (!L || !Array.isArray(L.bases) || typeof GameMap === 'undefined' || !GameMap.prototype.mirrorPt) return null;
    const w = L.w || 128, h = L.h || 128;
    const tr = (x, y, bw, bh, qd) => { const p = GameMap.prototype.mirrorPt.call({ w, h }, x, y, qd); let tx = p[0], ty = p[1]; if (qd === 1 || qd === 3) tx -= bw - 1; if (qd === 2 || qd === 3) ty -= bh - 1; return [tx + 2, ty + 1.5]; };
    const mains = [], exps = [];
    for (let qd = 0; qd < 4; qd++) for (const bd of L.bases) {
      if (bd.quadrants && !bd.quadrants.includes(qd)) continue;
      if (!bd.hall) continue;
      (bd.main ? mains : exps).push(tr(bd.hall[0], bd.hall[1], 4, 3, qd));
    }
    const order = L.startOrder || [0, 3, 1, 2];
    const starts = order.map(i => mains[i]).filter(Boolean); for (const m of mains) if (!starts.includes(m)) starts.push(m);
    return { w, h, name: L.name || String(id), starts, exps };
  },
  // Numbers only, all of them derived from local constants -- nothing from the relay reaches this markup
  // except the layout id, which is a lookup key and draws nothing when it misses.
  mapPreview(id, n) {
    const M = this.mapStarts(id);
    if (!M) return '<div class="lbPrev lbPrevNone">no preview</div>';
    const S = 132, k = S / Math.max(M.w, M.h), ox = (S - M.w * k) / 2, oy = (S - M.h * k) / 2;
    const X = p => (ox + p[0] * k).toFixed(1), Y = p => (oy + p[1] * k).toFixed(1);
    let g = '<rect x="' + ox.toFixed(1) + '" y="' + oy.toFixed(1) + '" width="' + (M.w * k).toFixed(1) + '" height="' + (M.h * k).toFixed(1) + '" fill="#0e141b" stroke="#3a3122"/>';
    for (const x of M.exps) g += '<circle cx="' + X(x) + '" cy="' + Y(x) + '" r="1.9" fill="#5d6775"/>';
    M.starts.forEach((s, i) => { g += '<circle cx="' + X(s) + '" cy="' + Y(s) + '" r="4.2" fill="' + (i < n ? this.slotColor(i) : '#39424f') + '" stroke="#0b0e13" stroke-width="1"/>'; });
    return '<svg class="lbPrev" viewBox="0 0 ' + S + ' ' + S + '" width="' + S + '" height="' + S + '" role="img" aria-label="map preview">' + g + '</svg>';
  },
  render() {
    const el = document.getElementById('lobby'); if (!el) return;
    const q = sel => (el.querySelectorAll ? Array.from(el.querySelectorAll(sel)) : []);
    const $ = id => document.getElementById(id);
    const on = (id, ev, fn) => { const x = $(id); if (x) x[ev] = fn; };
    const e = s => this.esc(s);
    const L = this.lobby;
    if (!L) {   // no room: the browser while connected, nothing otherwise
      if (!(this.browsing && this.connected)) { el.innerHTML = ''; return; }
      el.innerHTML = this.browserHtml();
      on('lbHost', 'onclick', () => this.host($('lbTitle') ? $('lbTitle').value : ''));
      on('lbJoinCode', 'onclick', () => this.join($('lbCode') ? $('lbCode').value : ''));
      on('lbCode', 'onkeydown', ev => { if (ev.key === 'Enter') this.join($('lbCode').value); });
      for (const r of q('[data-join]')) r.onclick = () => this.join(r.dataset.join);
      return;
    }
    const meP = L.players.find(p => p.id === this.id), host = !!(meP && meP.host);
    const open = L.state === 'lobby';           // a lobby that may still be changed
    const counting = L.state === 'starting';    // the relay's countdown is running; the room is frozen
    const RN = this.RACE_NAMES;
    const maxTeam = Math.min(8, Math.max(this.teamsShown, ...L.players.map(p => p.team || 1)));
    const seat = new Map(L.players.map((p, i) => [p.id, i]));   // the slot's index IS the player index the game starts it at, and therefore its colour
    const opt = (v, n, on2) => '<option value="' + e(v) + '"' + (on2 ? ' selected' : '') + '>' + e(n) + '</option>';
    // A per-slot control names its slot and its field; one delegated handler below sends the set.
    const slotSel = (p, field, opts, val) => '<select class="lbSel" data-slot="' + (p.id | 0) + '" data-field="' + field + '">'
      + opts.map(o => opt(o[0], o[1], String(o[0]) === String(val))).join('') + '</select>';
    const raceOpts = ['R', 'T', 'Z', 'P'].map(r => [r, RN[r]]);
    const diffOpts = Object.keys(this.DIFF_NAMES).map(d => [d, this.DIFF_NAMES[d]]);
    const styleOpts = this.styles();
    const teamOpts = []; for (let t = 1; t <= maxTeam; t++) teamOpts.push([String(t), 'Team ' + t]);
    // A row is a SLOT: colour, ready, host star, name, then what that slot may be set to. A human's own
    // row offers race and team; an AI's row offers race, difficulty, play style and team TO THE HOST --
    // an AI has no socket of its own, so the host is the only one who can ever speak for it. (item 1)
    const row = p => {
      const mine = p.id === this.id, editable = open && (mine || (host && p.ai));
      const fixed = s => '<span class="lbFixed">' + e(s) + '</span>';
      return '<div class="lp' + (p.gone ? ' gone' : '') + (mine ? ' me' : '') + '">'
        + '<span class="lbSwatch" style="background:' + this.slotColor(seat.get(p.id)) + '" title="This seat plays in this colour"></span>'
        + '<span class="lbReady" title="' + (p.ready || p.ai ? 'ready' : 'not ready') + '">' + (p.ready || p.ai ? '&#10003;' : '&middot;') + '</span>'
        + (p.host ? '<span class="lbStar" title="host">&#9733;</span>' : '')
        + '<span class="lbName">' + e(p.name) + (p.ai ? '<i class="lbTag">A.I.</i>' : '') + (p.gone ? '<i class="lbTag">dropped</i>' : '') + '</span>'
        + '<span class="lbSlotOpts">'
        + (editable ? slotSel(p, 'race', raceOpts, p.race) : fixed(RN[p.race] || p.race))
        + (p.ai ? (editable ? slotSel(p, 'difficulty', diffOpts, p.difficulty || 'normal') + slotSel(p, 'style', styleOpts, p.style || 'standard')
          : fixed(this.DIFF_NAMES[p.difficulty] || p.difficulty || 'Normal') + fixed(this.STYLE_NAMES[p.style] || p.style || 'Standard')) : '')
        + (editable ? slotSel(p, 'team', teamOpts, String(p.team || 1)) : '')
        + '</span>'
        + (host && open && p.id !== this.id ? '<a href="#" class="lbKick" data-kick="' + (p.id | 0) + '" title="Remove this slot">&#10005;</a>' : '')
        + '</div>';
    };
    const team = t => '<div class="lbTeam"><div class="lbTeamHead"><b>Team ' + t + '</b><span class="lbTeamBtns">'
      + (open && meP && meP.team !== t ? '<a href="#" data-team="' + t + '">join</a>' : '')
      + (host && open ? '<a href="#" data-addai="' + t + '">+ add A.I.</a>' : '') + '</span></div>'
      + (L.players.filter(p => (p.team || 1) === t).map(row).join('') || '<div class="lbNone">empty</div>') + '</div>';
    const teams = []; for (let t = 1; t <= maxTeam; t++) teams.push(team(t));
    const code = L.room && L.room !== 'LAN' ? L.room : '';
    const speed = NET_SPEED_NAMES[L.speed == null ? 6 : L.speed];
    // THE SETTINGS COLUMN, and what is deliberately NOT in it. The user's screenshots show Category,
    // Mode, Game Duration, Game Speed, Locked Alliances and Game Privacy; two of those six are real here.
    //   * Game Speed and Game Privacy are honoured -- the relay carries both.
    //   * Locked Alliances is shown as a FACT, not a switch: teams are fixed at G.init and there is no
    //     diplomacy in the simulation, so a switch would have nothing to turn off.
    //   * Handicap scales a player's income, which is a simulation change and therefore the gated balance
    //     work. Left out rather than drawn dead.
    //   * Category, Mode and Game Duration have nothing behind them at all.
    // An inert control is worse than a missing one, so the note under the panel says which is which.
    const setRow = (label, body) => '<div class="lbSetRow"><label>' + label + '</label>' + body + '</div>';
    let settings = '<div class="lbSettings"><div class="lbSetHead">GAME SETTINGS</div>'
      + this.mapPreview(L.layout, L.players.length)
      + '<div class="lbPrevName">' + e(this.mapName(L.layout)) + '</div>'
      + setRow('Map', host && open ? '<select id="lbLayout" class="lbSel grow">' + this.maps().map(m => opt(m[0], m[1] + (m[2] ? '  (' + m[2] + ' players)' : ''), m[0] === L.layout)).join('') + '</select>' : '<span>' + e(this.mapName(L.layout)) + '</span>')
      + setRow('Speed', host && open ? '<select id="lbSpeed" class="lbSel grow">' + NET_SPEED_NAMES.map((n, i) => opt(String(i), n, i === (L.speed == null ? 6 : L.speed))).join('') + '</select>' : '<span>' + e(speed) + '</span>')
      + setRow('Privacy', '<span>' + (L.listed ? 'Public &mdash; in the game list' : 'Private &mdash; code only') + '</span>')
      + setRow('Alliances', '<span>Locked</span>')
      + (code ? setRow('Code', '<b class="lbCodeVal">' + e(code) + '</b><button id="lbCopy" class="small inline">COPY</button>') : '')
      + '<div class="lbSetNote">Share the code (or the game in the list) to add a player. Colours come from the seat, in the order shown. Locked alliances is a fact, not a switch: teams are fixed when the game starts. Handicap, Category, Mode and Game Duration are the StarCraft II rows this simulation does not honour, so they are absent rather than dead.</div>'
      + '</div>';
    let h = '<div class="lbHead"><span class="lbHeadTitle">' + e(L.title || (code ? 'Room ' + code : 'LAN game')) + '</span>'
      + '<span class="lbHeadInfo">' + e(this.mapName(L.layout)) + ' &middot; ' + L.players.length + '/8 players &middot; ' + e(speed)
      + (code ? ' &middot; code <b>' + e(code) + '</b>' : '') + '</span></div>';
    h += '<div class="lbBody"><div class="lbSlots"><div class="lbTeams">' + teams.join('') + '</div>'
      + (open && maxTeam < 8 ? '<a href="#" id="lbAddTeam" class="lbLink">+ add a team</a>' : '') + '</div>' + settings + '</div>';
    // THE COUNTDOWN. Every number here came from the relay, so every client draws the same digit at the
    // same moment; nothing is timed locally. (item 12)
    if (counting) h += '<div class="lbCd"><span class="lbCdT">The game starts in</span><span class="lbCdN">' + (this.count | 0) + '</span></div>';
    else if (!open) h += '<div class="sub">Game in progress. Dropped players can rejoin by connecting with their name.</div>';
    else if (this.countMsg) h += '<div class="sub lbCancelled">' + e(this.countMsg) + '</div>';
    h += '<div class="lbChat" id="lbChatLog">' + this.chatLog.map(c => '<div><b>' + e(c.from) + ':</b> ' + e(c.text) + '</div>').join('') + '</div>'
      + '<input id="lbChat" placeholder="Say something and press Enter" maxlength="200">';
    // THE BUTTON BAR, in the shape of the screenshots: START / MAKE PUBLIC / QUIT.
    h += '<div class="lbButtons">'
      + (open ? '<button id="lbReady" class="small">' + (meP && meP.ready ? 'READY &#10003;' : 'READY') + '</button>' : '')
      + (host && open ? '<button id="lbStart">START GAME</button>' : '')
      + (host && counting ? '<button id="lbCancel">CANCEL</button>' : '')
      + (host && open ? '<button id="lbPrivacy" class="small">' + (L.listed ? 'MAKE PRIVATE' : 'MAKE PUBLIC') + '</button>' : '')
      + '<button id="lbLeave" class="small">QUIT</button>'
      + (!host && open ? '<span class="sub lbWait">Waiting for the host to start.</span>' : '')
      + '</div>';
    el.innerHTML = h;
    // One handler for every per-slot control. `id` names the slot: with no id the relay reads the sender's
    // own, which is what a client that predates editable AI slots sent.
    for (const s of q('[data-slot]')) s.onchange = () => {
      const id = parseInt(s.dataset.slot, 10), field = s.dataset.field, msg = { t: 'set', id };
      msg[field] = field === 'team' ? parseInt(s.value, 10) : s.value;
      if (field === 'race' && id === this.id) this.race = s.value;   // so a rejoin or a re-host keeps the race just chosen
      this.send(msg);
    };
    on('lbLayout', 'onchange', () => this.send({ t: 'set', layout: $('lbLayout').value }));
    on('lbSpeed', 'onchange', () => this.send({ t: 'set', speed: +$('lbSpeed').value }));
    on('lbPrivacy', 'onclick', () => this.send({ t: 'set', listed: !L.listed }));
    on('lbReady', 'onclick', () => this.send({ t: 'set', ready: !(meP && meP.ready) }));
    on('lbStart', 'onclick', () => this.send({ t: 'start' }));
    on('lbCancel', 'onclick', () => this.send({ t: 'cancel' }));
    on('lbLeave', 'onclick', () => this.leaveRoom());
    on('lbCopy', 'onclick', () => { try { navigator.clipboard.writeText(code); this.status('Code ' + code + ' copied.'); } catch (ex) { this.status('The code is ' + code + '.'); } });
    on('lbAddTeam', 'onclick', ev => { if (ev && ev.preventDefault) ev.preventDefault(); this.teamsShown = maxTeam + 1; this.render(); });
    on('lbChat', 'onkeydown', ev => { if (ev.key === 'Enter') { const x = $('lbChat'); const t = String(x.value || '').trim(); if (t) this.chat(t); x.value = ''; } });
    for (const a of q('[data-team]')) a.onclick = ev => { ev.preventDefault(); this.send({ t: 'set', team: parseInt(a.dataset.team, 10) }); };
    // A new AI copies the race, difficulty and style of the last one added, so filling a lobby with three
    // hard rushers is three clicks and not nine. The first is Random/normal/standard, as it always was.
    for (const a of q('[data-addai]')) a.onclick = ev => { ev.preventDefault(); const last = L.players.filter(p => p.ai).pop() || {}; this.send({ t: 'addai', race: last.race || 'R', difficulty: last.difficulty || 'normal', style: last.style || 'standard', team: parseInt(a.dataset.addai, 10) }); };
    for (const a of q('[data-kick]')) a.onclick = ev => { ev.preventDefault(); this.send({ t: 'kick', id: parseInt(a.dataset.kick, 10) }); };
    const log = $('lbChatLog'); if (log && typeof log.scrollTop === 'number') log.scrollTop = 1e9;
  },
  // The list: a row per hosted game, clicked to join. Everything in it came from other clients' keyboards
  // (a title, a host's name) and goes through esc() like the lobby's names.
  browserHtml() {
    const e = s => this.esc(s); const rooms = this.lobbies || [];
    const rows = rooms.map(r => `<div class="lbRow${r.state === 'lobby' ? '' : ' playing'}" data-join="${e(r.code)}" title="${r.state === 'lobby' ? 'Join this game' : 'In progress: connect with your old name to rejoin'}"><span class="lbTitle">${e(r.title || r.code)}</span><span class="lbHostName">${e(r.host || '')}</span><span class="lbMap">${e(this.mapName(r.layout))}</span><span class="lbCount">${r.players | 0}/${r.cap | 0}</span><span class="lbState">${r.state === 'lobby' ? 'open' : 'in game'}</span></div>`).join('');
    return `<div class="lbBar"><input id="lbTitle" maxlength="40" placeholder="Game name" value="${e(this.name)}&#39;s game"><button id="lbHost" class="small inline">HOST GAME</button></div>` +
      `<div class="lbList">${rows || '<div class="lbEmpty">No games on this server yet. Host one and everyone connected here sees it.</div>'}</div>` +
      `<div class="lbBar"><input id="lbCode" maxlength="8" placeholder="Private room code"><button id="lbJoinCode" class="small inline">JOIN BY CODE</button></div>`;
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
