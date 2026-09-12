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
  url: '', urlTyped: '', online: 0, pings: {}, rungAt: 0, pick: null,   // the server we are on, what the player typed for it, how many are connected, each member's measured latency, when the host last nudged us, the game picked in the browser
  filt: { q: '', full: true, playing: true, sort: 'players' },           // the browser's search, its two filters and its order
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
    this.disconnect(); this.name = name || 'Player'; this.lobbies = null; this.chatLog = []; this.teamsShown = 2; this.url = url || this.defaultUrl(); this.pings = {}; this.pick = null; this.online = 0; this.rungAt = 0; const ws = new WebSocket(this.url); this.ws = ws;
    ws.onopen = () => { this.connected = true; onopen(); };
    ws.onmessage = ev => { try { this.handle(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
    // Guarded on `this.ws === ws`: disconnect() closes the old socket when a new one opens, and the old
    // one's close arrived after the new session had begun and wiped its lobby.
    ws.onclose = () => { if (this.ws !== ws) return; this.connected = false; if (this.active) { this.status('Connection lost.'); if (typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg('Connection to the relay lost. Reconnect from the menu with the same name to rejoin.', 'error'); } this.lobby = null; this.lobbies = null; this.browsing = false; this.render(); };
    ws.onerror = () => { this.status('Could not connect to ' + (url || this.defaultUrl())); };
  },
  connect(url, name, race, room) { this.room = (room == null ? this.room : room) || ''; this.browsing = false; this.open(url, name, () => { this.send({ t: 'join', name: this.name, race, room: this.room }); this.status('Connected. Waiting in lobby...'); }); },
  // `opts.join`: an invite link's code, joined the moment the socket opens -- as an EXISTING game, so a link to one that
  // has ended says so instead of quietly making an empty room under its name.
  browse(url, name, opts) { this.room = ''; this.browsing = true; this.open(url, name, () => { this.status(''); this.saveIdentity(); if (opts && opts.host) this.host(opts.title); else if (opts && opts.join) { this.send({ t: 'list' }); this.join(opts.join, true); } else this.send({ t: 'list' }); this.render(); }); },
  host(title) { this.send({ t: 'join', name: this.name, race: this.race, create: true, title: String(title || '').trim() || this.name + "'s game" }); this.status('Hosting...'); },
  join(code, existing) { code = String(code || '').trim(); if (!code) { this.status('Type a room code first.'); return; } this.room = code; this.send({ t: 'join', name: this.name, race: this.race, room: code, existing: !!existing }); this.status('Joining ' + code.toUpperCase() + '...'); },
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
      case 'lobbies': this.lobbies = Array.isArray(m.rooms) ? m.rooms : []; this.online = m.online | 0; this.lobby = null; this.browsing = true; this.render(); if (typeof Desktop !== 'undefined' && Desktop.hosting) Desktop.share(); break;
      case 'lobby': this.lobby = m; if (m.room) this.room = m.room; this.count = m.count | 0; if (Array.isArray(m.players)) for (const q of m.players) if (q && typeof q.ping === 'number') this.pings[q.id | 0] = q.ping | 0;
        // The host's client keeps the relay told how many seats the chosen map has (test/serve.js, capOf).
        if (m.state === 'lobby' && m.cap != null && Array.isArray(m.players) && m.players.some(q => q && q.id === this.id && q.host)) { const want = this.mapCap(m.layout, m.rules && m.rules.size); if (want !== m.cap) this.send({ t: 'set', cap: want }); } if (this.browsing) this.status('In the lobby.'); this.browsing = false; this.render(); if (typeof Desktop !== 'undefined' && Desktop.hosting) Desktop.share(); break;
      // THE START COUNTDOWN, and the relay is the clock (the user's item 12). A number arrives a second;
      // at zero the relay sends 'start' instead, so no client is ever counting on its own and none of
      // them can reach zero early. A cancelled countdown arrives as n 0 with the reason.
      case 'countdown': this.count = m.n | 0; this.countMsg = m.cancelled ? String(m.msg || 'The start was cancelled.') : ''; this.render(); break;
      // A refusal while browsing (a full game, one that has ended) is answered with a fresh list, so the row that could
      // not be joined is gone from it.
      case 'error': this.lastError = m.msg; this.status(m.msg); if (!this.lobby && this.connected && this.browsing) this.send({ t: 'list' }); break;
      case 'sys': { const text = this.sysText(m); if (text) { this.logLine({ sys: true, text }); this.render(); } break; }
      case 'pings': this.applyPings(m.list); break;
      case 'lping': this.send({ t: 'lpong', n: m.n }); break;
      // THE NUDGE: the host is waiting on us. READY pulses for a few seconds and the status line says who is asking.
      case 'ring': if (this.lobby && this.lobby.state === 'lobby') { this.rungAt = Date.now(); this.status(String(m.from || 'The host') + ' is waiting for you to press READY.'); this.render(); } break;
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
      case 'chat': if (this.active && typeof G !== 'undefined' && G.players[G.human]) G.players[G.human].msg(m.from + ': ' + m.text, 'chat'); else { this.logLine({ from: String(m.from), id: m.id, text: String(m.text) }); this.render(); } break;   // in a game it is chat on screen; in the lobby it is the lobby's log
    }
  },
  clock(f) { const s = Math.floor(f / TPS); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  // Everything from the relay that lands in innerHTML goes through here: a 16-character name fits
  // <svg/onload=x()>, and on a public tunnel that is script in every lobby member's page. (REVIEW-M17)
  esc(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); },
  // ---------------- the browser and the lobby ----------------
  // THE SEVENTH SESSION'S LOBBY (the user's item 2: "find what makes a real-time strategy game lobby great ... we need
  // a truly sophisticated set of menus and online lobby"). RESEARCH-LOBBY.md has the four lobbies it was measured
  // against -- StarCraft II, Forged Alliance Forever, Beyond All Reason, Age of Empires II -- and the eight things they
  // share. What each one is here: a browser you can search, filter and sort, with a detail pane and QUICK JOIN; an
  // invite link that joins by itself; READY that means consent (the relay refuses START until everyone has, and a
  // change to the game withdraws it); every player's measured latency against the command delay; a line in chat for
  // every change nobody made themselves; shuffle, lock and a nudge for the teams; and the skirmish rules.
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
  // The maps a host may pick, as [id, name, players, group]. Never a custom map -- it exists only on the machine that
  // drew it, and a client without it falls back to Lost Ruins: a desync on the first frame. The fixed maps; the map
  // SIZES the skirmish screen offers (their own layouts, MapModes); and the PROCEDURAL archetypes as 'gen:<key>', which
  // every client grows from the same key and the seed the relay picks at START (UI.skirmishBaseId), exactly as a
  // skirmish does.
  maps() {
    if (typeof MAP_LAYOUTS === 'undefined') return [['temple', 'Lost Ruins', 4, 'Maps'], ['bloodbath', 'Blood Pit', 4, 'Maps'], ['valley', 'Twilight Valley', 2, 'Maps']];
    const sizes = (typeof MapModes !== 'undefined' && MapModes.keys) ? MapModes.keys : [];
    const out = [];
    for (const [id, L] of Object.entries(MAP_LAYOUTS)) { if (!L || L.custom || id === '__preview' || id.slice(0, 3) === 'sk:' || sizes.includes(id)) continue; out.push([id, L.name || id, L.players || 0, 'Maps']); }
    for (const k of sizes) { const L = MAP_LAYOUTS[k]; if (L) out.push([k, (L.name || k) + ' ' + L.w + 'x' + L.h, L.players || 0, 'Map sizes']); }
    try { if (typeof Archetypes !== 'undefined' && Archetypes.keys) for (const k of Archetypes.keys) out.push(['gen:' + k, (Archetypes.names && Archetypes.names[k]) || k, 0, 'Procedural: a new map from the seed']); } catch (ex) { }
    return out;
  },
  mapName(id) { const m = this.maps().find(x => x[0] === id); return m ? m[1] : String(id || ''); },
  // How many players a map has starts for: the layout's own number, or for a procedural map what the skirmish screen
  // resolves its archetype and size to (the seed places the bases, not how many there are). Eight when nothing says.
  mapCap(id, size) {
    let n = 0;
    try {
      if (String(id || '').slice(0, 4) === 'gen:' && typeof UI !== 'undefined' && UI.setupMapInfo) n = UI.setupMapInfo({ map: id, size: size || 'auto', seed: 1 }).players | 0;
      else if (typeof MAP_LAYOUTS !== 'undefined' && MAP_LAYOUTS[id]) n = MAP_LAYOUTS[id].players | 0;
    } catch (ex) { n = 0; }
    return Math.max(1, Math.min(8, n || 8));
  },
  // THE MAP PREVIEW (the SC2 lobby has one; the fifth session left it out because the SEED is picked at
  // START). That was true of the GROUND and never of the START POSITIONS: those are the layout's
  // quadrant-0 bases mirrored four ways and then put in startOrder, with no seed anywhere in it. This
  // reproduces GameMap.generate's own arithmetic and CALLS its mirrorPt rather than copying it, so the
  // preview cannot drift from the map. Returns null when there is nothing honest to draw -- which includes a
  // procedural map, whose ground does not exist until the seed does.
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
  // except the layout id, which is a lookup key and draws nothing when it misses. The seat number is drawn on
  // each start so a player can see which corner their colour is.
  mapPreview(id, n, size) {
    const M = this.mapStarts(id);
    if (!M) return '<div class="lbPrev lbPrevNone">' + (String(id || '').slice(0, 4) === 'gen:' ? 'grown from the seed at START' : 'no preview') + '</div>';
    const S = size || 132, k = S / Math.max(M.w, M.h), ox = (S - M.w * k) / 2, oy = (S - M.h * k) / 2, R = Math.max(4.2, S / 32);
    const X = p => (ox + p[0] * k).toFixed(1), Y = p => (oy + p[1] * k).toFixed(1);
    let g = '<rect x="' + ox.toFixed(1) + '" y="' + oy.toFixed(1) + '" width="' + (M.w * k).toFixed(1) + '" height="' + (M.h * k).toFixed(1) + '" fill="#0e141b" stroke="#3a3122"/>';
    for (const x of M.exps) g += '<circle cx="' + X(x) + '" cy="' + Y(x) + '" r="' + (R * 0.45).toFixed(1) + '" fill="#5d6775"/>';
    M.starts.forEach((s, i) => {
      g += '<circle cx="' + X(s) + '" cy="' + Y(s) + '" r="' + R.toFixed(1) + '" fill="' + (i < n ? this.slotColor(i) : '#39424f') + '" stroke="#0b0e13" stroke-width="1"/>';
      if (i < n && S >= 160) g += '<text x="' + X(s) + '" y="' + (+Y(s) + R * 0.42).toFixed(1) + '" text-anchor="middle" font-size="' + (R * 1.15).toFixed(1) + '" font-weight="bold" fill="#0b0e13">' + (i + 1) + '</text>';
    });
    return '<svg class="lbPrev" viewBox="0 0 ' + S + ' ' + S + '" width="' + S + '" height="' + S + '" role="img" aria-label="map preview">' + g + '</svg>';
  },
  // ---- the skirmish rules, in the lobby (item 2) ----
  // The options are read from the same tables the skirmish screen fills its dropdowns from (UI.SETUP_BANKS, HAZARDS,
  // DATA's presets, MAP_SIZES), so a rule the game gains appears in both places at once. The fallbacks are for the
  // headless harnesses, which load this file without them.
  RULE_NAMES: { bank: 'Starting bank', hazard: 'Weather', night: 'Light', features: 'Destructibles', derelicts: 'Derelicts', wildlife: 'Wildlife', size: 'Size' },
  RULE_ORDER: ['bank', 'hazard', 'night', 'features', 'derelicts', 'wildlife'],
  RULE_DEFAULTS: { bank: 'standard', hazard: 'map', night: 'map', features: 'map', derelicts: 'map', wildlife: 'map', size: 'auto' },
  ruleOptions(key) {
    const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1), U = typeof UI !== 'undefined' ? UI : null;
    const presets = which => { try { return U && U.setupPresets ? U.setupPresets(which) : []; } catch (ex) { return []; } };
    switch (key) {
      case 'bank': return U && Array.isArray(U.SETUP_BANKS) ? U.SETUP_BANKS.map(b => [b[0], String(b[1]).replace(/\s+/g, ' ')]) : [['standard', 'Standard']];
      case 'hazard': return [['map', 'As the map defines'], ['none', 'Clear']].concat(typeof HAZARDS !== 'undefined' ? Object.keys(HAZARDS).map(k => [k, cap(k)]) : []);
      case 'night': return [['map', 'As the map defines'], ['on', 'Day and night'], ['off', 'Permanent day']];
      case 'features': return [['map', 'As the map defines'], ['none', 'None']];
      case 'derelicts': return [['map', 'As the map defines'], ['none', 'None']].concat(presets('derelict').map(k => [k, cap(k)]));
      case 'wildlife': return [['map', 'As the map defines'], ['none', 'None']].concat(presets('wildlife').map(k => [k, cap(k)]));
      case 'size': return [['auto', 'As the archetype defines']].concat(typeof MAP_SIZES !== 'undefined' ? Object.keys(MAP_SIZES).map(k => [k, cap(k)]) : []);
    }
    return [];
  },
  ruleLabel(key, v) { const o = this.ruleOptions(key).find(x => x[0] === v); return o ? o[1] : String(v == null ? '' : v); },
  // THE ONE PLACE A NETWORK GAME'S OPTIONS ARE BUILT, for a start and a rejoin alike. The relay sends the lobby's map,
  // its rules and the seed it picked; every client turns them into G.init options with the skirmish screen's own pure
  // functions, so a network game and a skirmish on the same settings are the same game and every client builds the
  // same one. Rules at their defaults compose to the plain layout id and no purse, so a lobby that never touched them
  // starts byte-for-byte the game it started before rules existed.
  gameOptions(m) {
    const r = Object.assign({}, this.RULE_DEFAULTS, (m && m.rules) || {}), U = typeof UI !== 'undefined' ? UI : null;
    const s = { map: m.layout, size: r.size, seed: m.seed, hazard: r.hazard, night: r.night, features: r.features, derelicts: r.derelicts, wildlife: r.wildlife };
    let layout = m.layout; try { if (U && U.skirmishLayoutId) layout = U.skirmishLayoutId(s); } catch (ex) { layout = m.layout; }
    let bank = null; try { if (U && U.setupBank) bank = U.setupBank(r.bank); } catch (ex) { bank = null; }
    const players = (m.players || []).map(p => {
      const o = { race: p.race, human: p.human, name: p.name, difficulty: p.difficulty, team: p.team, style: p.style, minerals: p.minerals, gas: p.gas };
      if (bank && bank[2] !== 50 && o.minerals === undefined) o.minerals = bank[2];
      if (bank && bank[3] !== 0 && o.gas === undefined) o.gas = bank[3];
      return o;
    });
    return { players, seed: m.seed, layout, human: m.you, mode: 'play', net: true };
  },
  // ---- who you are, and the link that brings a friend ----
  // The name, the server typed and the race are remembered (item 2: "getting in is fast"); nothing else is, and the
  // server box stays empty for a player who never typed one, so the page's own relay stays the default.
  IDENTITY_KEY: 'bw_net',
  loadIdentity() {
    try {
      const o = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(this.IDENTITY_KEY)) || '{}') || {};
      return { name: typeof o.name === 'string' ? o.name.slice(0, 16) : '', url: typeof o.url === 'string' ? o.url.slice(0, 200) : '', race: /^[TZPR]$/.test(o.race) ? o.race : 'R' };
    } catch (ex) { return { name: '', url: '', race: 'R' }; }
  },
  saveIdentity() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(this.IDENTITY_KEY, JSON.stringify({ name: this.name, url: this.urlTyped || '', race: this.race })); } catch (ex) { } },
  // THE INVITE LINK (every lobby the research looked at lets the host bring a friend in one step). The page's own
  // address with ?join=CODE, and &server= only when the relay is not the page's own. Only offered when the page came
  // over http(s): a link to a file on the host's disk invites nobody.
  inviteLink(code) {
    if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol) || !code) return '';
    const base = (location.origin || (location.protocol + '//' + location.host)) + (location.pathname || '/');
    const url = this.url || '', own = this.defaultUrl();
    return base + '?join=' + encodeURIComponent(code) + (url && url !== own ? '&server=' + encodeURIComponent(url) : '');
  },
  // The other end, pure so it can be tested without a page: a room code (the relay's alphabet and length rules) and
  // an optional ws:// or wss:// server. Anything else in the link is ignored -- a link is text from a stranger.
  parseInvite(search) {
    const q = String(search || ''), m = /[?&]join=([A-Za-z0-9]{4,8})(?=&|$)/.exec(q);
    if (!m) return null;
    let server = ''; const s = /[?&]server=([^&]*)/.exec(q);
    if (s) { try { server = decodeURIComponent(s[1]); } catch (ex) { server = ''; } if (!/^wss?:\/\/[^\s"'<>]{1,200}$/i.test(server)) server = ''; }
    return { code: m[1].toUpperCase(), server };
  },
  // ---- the browser's three decisions, pure ----
  // What is shown: a search over title, host, map and code; full games and running games each hideable.
  // In what order: games you can still join first, then by the humans in them, then by everyone in them (a room with its
  // A.I. already added is nearer starting), and on a tie the one that has waited longest -- or newest, or by name.
  filterRooms(rooms, f) {
    f = f || {}; const q = String(f.q || '').trim().toLowerCase();
    const out = (rooms || []).filter(r => {
      if (!r) return false;
      if (f.full === false && r.state === 'lobby' && (r.players | 0) >= (r.cap | 0)) return false;
      if (f.playing === false && r.state !== 'lobby') return false;
      if (q && ![r.title, r.host, this.mapName(r.layout), r.code].some(s => String(s || '').toLowerCase().includes(q))) return false;
      return true;
    });
    const shut = r => (r.state === 'lobby' && (r.players | 0) < (r.cap | 0) ? 0 : 1);
    const by = {
      players: (a, b) => shut(a) - shut(b) || (b.humans | 0) - (a.humans | 0) || (b.players | 0) - (a.players | 0) || (a.created || 0) - (b.created || 0),
      newest: (a, b) => (b.created || 0) - (a.created || 0),
      name: (a, b) => String(a.title || '').toLowerCase().localeCompare(String(b.title || '').toLowerCase()),
    };
    return out.sort(by[f.sort] || by.players);
  },
  // QUICK JOIN: the open game with the most humans, the longest-waiting on a tie; null means host one instead.
  quickPick(rooms) {
    const open = (rooms || []).filter(r => r && r.state === 'lobby' && (r.players | 0) < (r.cap | 0));
    open.sort((a, b) => (b.humans | 0) - (a.humans | 0) || (a.created || 0) - (b.created || 0));
    return open[0] || null;
  },
  quickJoin() { const r = this.quickPick(this.lobbies); if (r) this.join(r.code, true); else this.host(this.name + "'s game"); },
  // ---- latency ----
  // Three bars and the number. The budget is the command delay: an order given at frame F runs at F + delay, so a
  // round trip longer than delay frames makes every client wait on that player (test/serve.js, DELAY).
  pingQ(ms) { return ms == null ? 0 : ms <= 90 ? 3 : ms <= 180 ? 2 : 1; },
  budgetMs() { const L = this.lobby; return Math.round((((L && L.delay) || this.delay || 3) * 1000) / (typeof TPS !== 'undefined' ? TPS : 24)); },
  pingOf(p) { return this.pings && this.pings[p.id] != null ? this.pings[p.id] : (p.ping == null ? null : p.ping); },
  pingInner(ms) { return '<i></i><i></i><i></i><b>' + (ms == null ? '&hellip;' : (ms | 0) + ' ms') + '</b>'; },
  pingTitle(ms) {
    const b = this.budgetMs();
    if (ms == null) return 'Measuring the round trip to the server';
    return 'Round trip to the server: ' + (ms | 0) + ' ms. Orders take effect ' + b + ' ms after they are given' + (ms > b ? ' -- this connection is slower than that, so every player will wait on it' : '') + '.';
  },
  pingClass(ms) { return 'lbPing q' + this.pingQ(ms) + (ms != null && ms > this.budgetMs() ? ' slow' : ''); },
  // The relay's 'pings' message moves the numbers in place: redrawing the lobby every two seconds would close a
  // dropdown under the player's mouse.
  applyPings(list) {
    this.pings = this.pings || {};
    for (const x of (Array.isArray(list) ? list : [])) if (x && typeof x.ms === 'number') this.pings[x.id | 0] = x.ms | 0;
    const el = typeof document !== 'undefined' && document.getElementById('lobby');
    const cells = el && el.querySelectorAll ? Array.from(el.querySelectorAll('[data-ping]')) : [];
    for (const c of cells) { const ms = this.pings[parseInt(c.getAttribute ? c.getAttribute('data-ping') : c.dataset.ping, 10)]; if (ms == null) continue; c.className = this.pingClass(ms); c.title = this.pingTitle(ms); c.innerHTML = this.pingInner(ms); }
    this.renderBar();
  },
  // ---- the chat's system lines ----
  // The relay says what happened; this says it in words. Every string in it is escaped where it is drawn.
  sysText(m) {
    const n = s => String(s == null ? '' : s);
    switch (m && m.ev) {
      case 'join': return n(m.name) + ' joined.';
      case 'leave': return n(m.name) + ' left.';
      case 'host': return n(m.name) + ' is the host now.';
      case 'kick': return 'The host removed ' + n(m.name) + '.';
      case 'ready': return n(m.name) + ' is ready.';
      case 'notready': return n(m.name) + ' is not ready.';
      case 'map': return 'Map: ' + this.mapName(m.layout) + '.';
      case 'speed': return 'Speed: ' + (NET_SPEED_NAMES[m.speed] || n(m.speed)) + '.';
      case 'privacy': return m.listed ? 'The game is public: it is in the game list.' : 'The game is private: only its code reaches it.';
      case 'lock': return m.on ? 'Teams are locked: only the host moves players.' : 'Teams are unlocked.';
      case 'rule': return (this.RULE_NAMES[m.key] || n(m.key)) + ': ' + this.ruleLabel(m.key, m.value) + '.';
      case 'addai': return 'The host added ' + n(m.name) + '.';
      case 'ai': return 'The host changed ' + n(m.name) + '.';
      case 'shuffle': return 'The host shuffled the teams.';
      case 'unready': return 'The game changed, so everyone has to ready up again.';
      case 'waiting': return 'Waiting for ' + (Array.isArray(m.names) ? m.names.map(n).join(', ') : '') + ' to ready up.';
    }
    return '';
  },
  logLine(entry) { this.chatLog.push(entry); if (this.chatLog.length > 80) this.chatLog.shift(); },
  hostLabel() { return String(this.url || '').replace(/^wss?:\/\//, '').replace(/\/ws$/, ''); },
  // The strip that replaces the SERVER / NAME / CONNECT form once connected: where, as whom, and the way back out.
  renderBar() {
    if (typeof document === 'undefined') return;
    const form = document.getElementById('netForm'), bar = document.getElementById('netBar'); if (!form || !bar) return;
    const on = !!this.connected;
    if (form.style) form.style.display = on ? 'none' : '';
    if (bar.style) bar.style.display = on ? '' : 'none';
    const panel = document.getElementById('multiPanel'); if (panel && panel.classList) panel.classList.toggle('on', on);
    if (!on) return;
    const mine = this.pings && this.pings[this.id] != null ? this.pings[this.id] : null;
    bar.innerHTML = '<span class="nbDot"></span><span class="nbText">Connected to <b>' + this.esc(this.hostLabel()) + '</b> as <b>' + this.esc(this.name) + '</b>'
      + (this.online ? ' &middot; ' + (this.online | 0) + ' online' : '') + (mine != null ? ' &middot; <span class="' + this.pingClass(mine) + '">' + this.pingInner(mine) + '</span>' : '') + '</span>'
      + '<a href="#" id="nbChange" title="Disconnect, to change server or name">change</a>';
    const ch = document.getElementById('nbChange'); if (ch) ch.onclick = ev => { if (ev && ev.preventDefault) ev.preventDefault(); this.disconnect(); this.lobbies = null; this.render(); this.status('Disconnected.'); };
  },
  render() {
    const el = document.getElementById('lobby'); if (!el) return;
    this.renderBar();
    const q = sel => (el.querySelectorAll ? Array.from(el.querySelectorAll(sel)) : []);
    const $ = id => document.getElementById(id);
    const on = (id, ev, fn) => { const x = $(id); if (x) x[ev] = fn; };
    // What the player is typing survives a redraw: the relay redraws the lobby on every change anyone makes.
    const keep = {};
    for (const id of ['lbChat', 'lbSearch', 'lbCode', 'lbTitle', 'lbRename']) {
      const x = $(id); if (!x || typeof x.value !== 'string') continue;
      keep[id] = { v: x.value, f: typeof document.activeElement !== 'undefined' && document.activeElement === x, s: x.selectionStart, e: x.selectionEnd };
    }
    const restore = () => { for (const id of Object.keys(keep)) { const x = $(id), k = keep[id]; if (!x) continue; if (id !== 'lbRename' || k.f) x.value = k.v; if (k.f && x.focus) { try { x.focus(); if (x.setSelectionRange) x.setSelectionRange(k.s, k.e); } catch (ex) { } } } };
    const L = this.lobby;
    if (!L) {   // no room: the browser while connected, nothing otherwise
      if (!(this.browsing && this.connected)) { el.innerHTML = ''; return; }
      el.innerHTML = this.browserHtml(); restore();
      on('lbHost', 'onclick', () => this.host($('lbTitle') ? $('lbTitle').value : ''));
      on('lbJoinCode', 'onclick', () => this.join($('lbCode') ? $('lbCode').value : ''));
      on('lbCode', 'onkeydown', ev => { if (ev.key === 'Enter') this.join($('lbCode').value); });
      on('lbQuick', 'onclick', () => this.quickJoin());
      on('lbSearch', 'oninput', () => { this.filt.q = $('lbSearch').value; this.render(); });
      on('lbFull', 'onchange', () => { this.filt.full = !!$('lbFull').checked; this.render(); });
      on('lbPlaying', 'onchange', () => { this.filt.playing = !!$('lbPlaying').checked; this.render(); });
      on('lbSort', 'onchange', () => { this.filt.sort = $('lbSort').value; this.render(); });
      on('lbJoinSel', 'onclick', () => { if (this.pick) this.join(this.pick, true); });
      for (const r of q('[data-pick]')) { r.onclick = () => { this.pick = r.dataset.pick; this.render(); }; r.ondblclick = () => this.join(r.dataset.join, true); }
      return;
    }
    el.innerHTML = this.roomHtml(); restore();
    const meP = L.players.find(p => p.id === this.id), code = L.room && L.room !== 'LAN' ? L.room : '';
    // One handler for every per-slot control. `id` names the slot: with no id the relay reads the sender's
    // own, which is what a client that predates editable AI slots sent.
    for (const s of q('[data-slot]')) s.onchange = () => {
      const id = parseInt(s.dataset.slot, 10), field = s.dataset.field, msg = { t: 'set', id };
      msg[field] = field === 'team' ? parseInt(s.value, 10) : s.value;
      if (field === 'race' && id === this.id) { this.race = s.value; this.saveIdentity(); }   // so a rejoin or a re-host keeps the race just chosen
      this.send(msg);
    };
    for (const s of q('[data-rule]')) s.onchange = () => { const rules = {}; rules[s.dataset.rule] = s.value; const msg = { t: 'set', rules }; if (s.dataset.rule === 'size') msg.cap = this.mapCap(L.layout, s.value); this.send(msg); };
    on('lbLayout', 'onchange', () => { const v = $('lbLayout').value; this.send({ t: 'set', layout: v, cap: this.mapCap(v, L.rules && L.rules.size) }); });
    on('lbSpeed', 'onchange', () => this.send({ t: 'set', speed: +$('lbSpeed').value }));
    on('lbPrivacy', 'onclick', () => this.send({ t: 'set', listed: !L.listed }));
    on('lbLock', 'onchange', () => this.send({ t: 'set', lockTeams: !!$('lbLock').checked }));
    on('lbShuffle', 'onclick', ev => { if (ev && ev.preventDefault) ev.preventDefault(); this.send({ t: 'shuffle' }); });
    on('lbRename', 'onchange', () => { const v = String($('lbRename').value || '').trim(); if (v) this.send({ t: 'set', title: v }); });
    on('lbReady', 'onclick', () => { this.rungAt = 0; this.send({ t: 'set', ready: !(meP && meP.ready) }); });
    on('lbStart', 'onclick', () => this.send({ t: 'start' }));
    on('lbCancel', 'onclick', () => this.send({ t: 'cancel' }));
    on('lbLeave', 'onclick', () => this.leaveRoom());
    const copy = (text, said) => { try { navigator.clipboard.writeText(text); this.status(said); } catch (ex) { this.status(text); } };
    on('lbCopy', 'onclick', () => copy(code, 'Code ' + code + ' copied.'));
    on('lbInvite', 'onclick', () => { const link = this.inviteLink(code); if (link) copy(link, 'Invite link copied: whoever opens it lands in this lobby.'); });
    on('lbAddTeam', 'onclick', ev => { if (ev && ev.preventDefault) ev.preventDefault(); this.teamsShown = Math.min(8, Math.max(this.teamsShown, ...L.players.map(p => p.team || 1)) + 1); this.render(); });
    on('lbChat', 'onkeydown', ev => { if (ev.key === 'Enter') { const x = $('lbChat'); const t = String(x.value || '').trim(); if (t) this.chat(t); x.value = ''; } });
    for (const a of q('[data-team]')) a.onclick = ev => { ev.preventDefault(); this.send({ t: 'set', team: parseInt(a.dataset.team, 10) }); };
    // A new AI copies the race, difficulty and style of the last one added, so filling a lobby with three
    // hard rushers is three clicks and not nine. The first is Random/normal/standard, as it always was.
    for (const a of q('[data-addai]')) a.onclick = ev => { ev.preventDefault(); const last = L.players.filter(p => p.ai).pop() || {}; this.send({ t: 'addai', race: last.race || 'R', difficulty: last.difficulty || 'normal', style: last.style || 'standard', team: parseInt(a.dataset.addai, 10) }); };
    for (const a of q('[data-kick]')) a.onclick = ev => { ev.preventDefault(); this.send({ t: 'kick', id: parseInt(a.dataset.kick, 10) }); };
    for (const a of q('[data-ring]')) a.onclick = ev => { ev.preventDefault(); this.send({ t: 'ring', id: parseInt(a.dataset.ring, 10) }); };
    const log = $('lbChatLog'); if (log && typeof log.scrollTop === 'number') log.scrollTop = 1e9;
  },
  // The list: a row per hosted game, clicked to see it and double-clicked to join. Everything in it came from other
  // clients' keyboards (a title, a host's name) and goes through esc() like the lobby's names.
  browserHtml() {
    const e = s => this.esc(s), f = this.filt, all = this.lobbies || [], rooms = this.filterRooms(all, f);
    const pick = rooms.find(r => r.code === this.pick) || null;
    const speedName = r => NET_SPEED_NAMES[r.speed == null ? 6 : r.speed] || '';
    const stateName = r => r.state === 'lobby' ? ((r.players | 0) >= (r.cap | 0) ? 'full' : 'open') : r.state === 'starting' ? 'starting' : 'in game';
    const rows = rooms.map(r => '<div class="lbRow' + (r.state === 'lobby' ? '' : ' playing') + (pick && pick.code === r.code ? ' sel' : '') + '" data-join="' + e(r.code) + '" data-pick="' + e(r.code) + '" title="' + (r.state === 'lobby' ? 'Click to see this game, double-click to join it' : 'In progress: a player who dropped rejoins by connecting with their old name') + '">'
      + '<span class="lbTitle">' + e(r.title || r.code) + '</span><span class="lbHostName">' + e(r.host || '') + '</span><span class="lbMap">' + e(this.mapName(r.layout)) + '</span>'
      + '<span class="lbSpeedCol">' + e(speedName(r)) + '</span><span class="lbCount" title="' + (r.humans | 0) + ' human, ' + Math.max(0, (r.players | 0) - (r.humans | 0)) + ' computer">' + (r.players | 0) + '/' + (r.cap | 0) + '</span>'
      + '<span class="lbState">' + stateName(r) + '</span></div>').join('');
    const opt = (v, n, sel) => '<option value="' + e(v) + '"' + (sel ? ' selected' : '') + '>' + e(n) + '</option>';
    let detail;
    if (pick) {
      const rules = this.RULE_ORDER.filter(k => pick.rules && pick.rules[k] != null && pick.rules[k] !== this.RULE_DEFAULTS[k]).map(k => e(this.RULE_NAMES[k]) + ': ' + e(this.ruleLabel(k, pick.rules[k])));
      const joinable = pick.state === 'lobby' && (pick.players | 0) < (pick.cap | 0);
      detail = '<div class="lbDetail">' + this.mapPreview(pick.layout, pick.players | 0, 180)
        + '<div class="lbDetTitle">' + e(pick.title || pick.code) + '</div>'
        + '<div class="lbDetRow"><label>Host</label><span>' + e(pick.host || '') + '</span></div>'
        + '<div class="lbDetRow"><label>Map</label><span>' + e(this.mapName(pick.layout)) + '</span></div>'
        + '<div class="lbDetRow"><label>Players</label><span>' + (pick.humans | 0) + ' human, ' + Math.max(0, (pick.players | 0) - (pick.humans | 0)) + ' computer, ' + Math.max(0, (pick.cap | 0) - (pick.players | 0)) + ' open</span></div>'
        + '<div class="lbDetRow"><label>Speed</label><span>' + e(speedName(pick)) + '</span></div>'
        + '<div class="lbDetRow"><label>Rules</label><span>' + (rules.length ? rules.join('<br>') : 'Standard') + (pick.lockTeams ? '<br>Teams locked' : '') + '</span></div>'
        + '<button id="lbJoinSel"' + (joinable ? '' : ' disabled') + '>' + (joinable ? 'JOIN' : pick.state === 'lobby' ? 'FULL' : 'IN PROGRESS') + '</button></div>';
    } else {
      detail = '<div class="lbDetail lbDetEmpty">' + (rooms.length ? 'Pick a game to see its map, its players and its rules.' : 'Nothing to pick yet.') + '<br><br>QUICK JOIN puts you in the open game with the most players, or hosts one if there is none.</div>';
    }
    return '<div class="lbTools"><input id="lbSearch" maxlength="40" placeholder="Search games, hosts and maps" value="' + e(f.q || '') + '">'
      + '<label class="chk"><input type="checkbox" id="lbFull"' + (f.full === false ? '' : ' checked') + '> Full</label>'
      + '<label class="chk"><input type="checkbox" id="lbPlaying"' + (f.playing === false ? '' : ' checked') + '> In progress</label>'
      + '<select id="lbSort" class="lbSel">' + opt('players', 'Most players', f.sort !== 'newest' && f.sort !== 'name') + opt('newest', 'Newest', f.sort === 'newest') + opt('name', 'Name', f.sort === 'name') + '</select>'
      + '<button id="lbQuick" class="small inline">QUICK JOIN</button></div>'
      + '<div class="lbBrowse"><div class="lbListWrap"><div class="lbListHead"><span class="lbTitle">Game</span><span class="lbHostName">Host</span><span class="lbMap">Map</span><span class="lbSpeedCol">Speed</span><span class="lbCount">Players</span><span class="lbState">Status</span></div>'
      + '<div class="lbList">' + (rows || '<div class="lbEmpty">' + (all.length ? 'No game matches. Clear the search or show full and running games.' : 'No games on this server yet. Host one and everyone connected here sees it.') + '</div>') + '</div>'
      + '<div class="lbListFoot">' + rooms.length + ' of ' + all.length + ' game' + (all.length === 1 ? '' : 's') + (this.online ? ' &middot; ' + (this.online | 0) + ' connected to this server' : '') + '</div></div>'
      + detail + '</div>'
      + '<div class="lbBar"><input id="lbTitle" maxlength="40" placeholder="Game name" value="' + e(this.name) + '&#39;s game"><button id="lbHost" class="small inline">HOST GAME</button></div>'
      + '<div class="lbBar"><input id="lbCode" maxlength="8" placeholder="Private room code"><button id="lbJoinCode" class="small inline">JOIN BY CODE</button></div>';
  },
  roomHtml() {
    const e = s => this.esc(s), L = this.lobby;
    const meP = L.players.find(p => p.id === this.id), host = !!(meP && meP.host);
    const open = L.state === 'lobby';           // a lobby that may still be changed
    const counting = L.state === 'starting';    // the relay's countdown is running; the room is frozen
    const RN = this.RACE_NAMES, checks = L.readyCheck !== false;
    const maxTeam = Math.min(8, Math.max(this.teamsShown, ...L.players.map(p => p.team || 1)));
    const seat = new Map(L.players.map((p, i) => [p.id, i]));   // the slot's index IS the player index the game starts it at, and therefore its colour
    const seats = Math.max(1, Math.min(8, (L.cap | 0) || 8));   // the map's start positions, as the relay holds them
    const opt = (v, n, on2) => '<option value="' + e(v) + '"' + (on2 ? ' selected' : '') + '>' + e(n) + '</option>';
    const sel = (attrs, opts, val) => '<select class="lbSel" ' + attrs + '>' + opts.map(o => opt(o[0], o[1], String(o[0]) === String(val))).join('') + '</select>';
    // A per-slot control names its slot and its field; one delegated handler sends the set.
    const slotSel = (p, field, opts, val) => sel('data-slot="' + (p.id | 0) + '" data-field="' + field + '"', opts, val);
    const raceOpts = ['R', 'T', 'Z', 'P'].map(r => [r, RN[r]]);
    const diffOpts = Object.keys(this.DIFF_NAMES).map(d => [d, this.DIFF_NAMES[d]]);
    const styleOpts = this.styles();
    const teamOpts = []; for (let t = 1; t <= maxTeam; t++) teamOpts.push([String(t), 'Team ' + t]);
    // A row is a SLOT: colour, ready, host star, name, latency, then what that slot may be set to. A human's own row
    // offers race and team (the team only while teams are unlocked, or to the host); an AI's row offers race,
    // difficulty, play style and team TO THE HOST -- an AI has no socket of its own, so the host is the only one who
    // can ever speak for it. The host also sees a bell on every human who has not readied.
    const row = p => {
      const mine = p.id === this.id, editable = open && (mine || (host && p.ai)), teamEditable = editable && (!L.lockTeams || host);
      const fixed = s => '<span class="lbFixed">' + e(s) + '</span>';
      const ms = this.pingOf(p);
      return '<div class="lp' + (p.gone ? ' gone' : '') + (mine ? ' me' : '') + '">'
        + '<span class="lbSwatch" style="background:' + this.slotColor(seat.get(p.id)) + '" title="Seat ' + (seat.get(p.id) + 1) + ': this seat plays in this colour, from this start"></span>'
        + '<span class="lbReady" title="' + (p.ready || p.ai ? 'ready' : 'not ready') + '">' + (p.ready || p.ai ? '&#10003;' : '&middot;') + '</span>'
        + (p.host ? '<span class="lbStar" title="host">&#9733;</span>' : '')
        + '<span class="lbName">' + e(p.name) + (p.ai ? '<i class="lbTag">A.I.</i>' : '') + (p.gone ? '<i class="lbTag">dropped</i>' : '') + '</span>'
        + (p.ai ? '' : '<span class="' + this.pingClass(ms) + '" data-ping="' + (p.id | 0) + '" title="' + this.pingTitle(ms) + '">' + this.pingInner(ms) + '</span>')
        + (host && open && checks && !p.ai && !p.ready && !p.host && !mine ? '<a href="#" class="lbNudge" data-ring="' + (p.id | 0) + '" title="Remind this player the room is waiting for them to ready up">&#128276;</a>' : '')
        + '<span class="lbSlotOpts">'
        + (editable ? slotSel(p, 'race', raceOpts, p.race) : fixed(RN[p.race] || p.race))
        + (p.ai ? (editable ? slotSel(p, 'difficulty', diffOpts, p.difficulty || 'normal') + slotSel(p, 'style', styleOpts, p.style || 'standard')
          : fixed(this.DIFF_NAMES[p.difficulty] || p.difficulty || 'Normal') + fixed(this.STYLE_NAMES[p.style] || p.style || 'Standard')) : '')
        + (teamEditable ? slotSel(p, 'team', teamOpts, String(p.team || 1)) : '')
        + '</span>'
        + (host && open && p.id !== this.id ? '<a href="#" class="lbKick" data-kick="' + (p.id | 0) + '" title="Remove this slot">&#10005;</a>' : '')
        + '</div>';
    };
    const team = t => '<div class="lbTeam"><div class="lbTeamHead"><b>Team ' + t + '</b><span class="lbTeamBtns">'
      + (open && meP && meP.team !== t && (!L.lockTeams || host) ? '<a href="#" data-team="' + t + '">join</a>' : '')
      + (host && open && L.players.length < seats ? '<a href="#" data-addai="' + t + '">+ add A.I.</a>' : '') + '</span></div>'
      + (L.players.filter(p => (p.team || 1) === t).map(row).join('') || '<div class="lbNone">empty</div>') + '</div>';
    const teams = []; for (let t = 1; t <= maxTeam; t++) teams.push(team(t));
    const code = L.room && L.room !== 'LAN' ? L.room : '';
    const speed = NET_SPEED_NAMES[L.speed == null ? 6 : L.speed];
    const over = L.players.length > seats;
    const rules = Object.assign({}, this.RULE_DEFAULTS, L.rules || {});
    // Readiness, in words: who the start is waiting on. The host is not listed -- the host's START is the host's ready.
    const humans = L.players.filter(p => !p.ai && !p.gone), waiting = humans.filter(p => !p.host && !p.ready);
    const readyLine = !checks ? '' : humans.length <= 1 ? 'Just you so far. Add an A.I. or share the code.'
      : waiting.length ? 'Waiting for ' + waiting.map(p => e(p.name)).join(', ') + ' to ready up.' : 'Everyone is ready.';
    // THE SETTINGS COLUMN, and what is deliberately NOT in it. The user's screenshots show Category,
    // Mode, Game Duration, Game Speed, Locked Alliances and Game Privacy; two of those six are real here.
    //   * Game Speed and Game Privacy are honoured -- the relay carries both.
    //   * Locked Alliances is shown as a FACT, not a switch: teams are fixed at G.init and there is no
    //     diplomacy in the simulation, so a switch would have nothing to turn off. (LOCK TEAMS is a different
    //     thing and a real one: who may change team in the lobby.)
    //   * Handicap scales a player's income, which is a simulation change and therefore the gated balance
    //     work. Left out rather than drawn dead.
    //   * Category, Mode and Game Duration have nothing behind them at all.
    // The skirmish rules below them are real: every client composes them into the layout and the purses (gameOptions).
    const setRow = (label, body) => '<div class="lbSetRow"><label>' + label + '</label>' + body + '</div>';
    const edit = host && open;
    const mapOpts = this.maps();
    const groups = []; for (const m of mapOpts) if (!groups.includes(m[3])) groups.push(m[3]);
    const mapSel = '<select id="lbLayout" class="lbSel grow">' + groups.map(g => '<optgroup label="' + e(g) + '">' + mapOpts.filter(m => m[3] === g).map(m => opt(m[0], m[1] + (m[2] ? '  (' + m[2] + ' players)' : ''), m[0] === L.layout)).join('') + '</optgroup>').join('') + '</select>';
    const ruleRow = k => setRow(e(this.RULE_NAMES[k]), edit ? sel('data-rule="' + k + '"', this.ruleOptions(k), rules[k]) : '<span>' + e(this.ruleLabel(k, rules[k])) + '</span>');
    const invite = code ? this.inviteLink(code) : '';
    let settings = '<div class="lbSettings"><div class="lbSetHead">GAME SETTINGS</div>'
      + this.mapPreview(L.layout, L.players.length, 236)
      + '<div class="lbPrevName">' + e(this.mapName(L.layout)) + '</div>'
      + setRow('Map', edit ? mapSel : '<span>' + e(this.mapName(L.layout)) + '</span>')
      + (String(L.layout || '').slice(0, 4) === 'gen:' ? ruleRow('size') : '')
      + setRow('Speed', edit ? '<select id="lbSpeed" class="lbSel grow">' + NET_SPEED_NAMES.map((n, i) => opt(String(i), n, i === (L.speed == null ? 6 : L.speed))).join('') + '</select>' : '<span>' + e(speed) + '</span>')
      + this.RULE_ORDER.map(ruleRow).join('')
      + setRow('Teams', edit ? '<label class="chk lbChk" title="Only the host moves players between teams"><input type="checkbox" id="lbLock"' + (L.lockTeams ? ' checked' : '') + '> Locked</label>' : '<span>' + (L.lockTeams ? 'Locked by the host' : 'Players choose') + '</span>')
      + setRow('Privacy', '<span>' + (L.listed ? 'Public &mdash; in the game list' : 'Private &mdash; code only') + '</span>')
      + setRow('Alliances', '<span>Locked</span>')
      + (edit ? setRow('Name', '<input id="lbRename" maxlength="40" class="lbSel grow" value="' + e(L.title || '') + '">') : '')
      + (code ? setRow('Code', '<b class="lbCodeVal">' + e(code) + '</b><button id="lbCopy" class="small inline">COPY</button>' + (invite ? '<button id="lbInvite" class="small inline" title="' + e(invite) + '">INVITE LINK</button>' : '')) : '')
      + '<div class="lbSetNote">Share the code or the invite link to bring a player in. Colours and start positions come from the seat, in the order shown. Locked alliances is a fact, not a switch: teams are fixed when the game starts. Handicap, Category, Mode and Game Duration are the StarCraft II rows this simulation does not honour, so they are not here.</div>'
      + '</div>';
    let h = '<div class="lbHead"><span class="lbHeadTitle">' + e(L.title || (code ? 'Room ' + code : 'LAN game')) + '</span>'
      + '<span class="lbHeadInfo">' + e(this.mapName(L.layout)) + ' &middot; <span' + (over ? ' class="lbOver"' : '') + '>' + L.players.length + '/' + seats + ' players</span> &middot; ' + e(speed)
      + (code ? ' &middot; code <b>' + e(code) + '</b>' : '') + '</span></div>';
    const lines = this.chatLog.map(c => c.sys
      ? '<div class="lbSys">' + e(c.text) + '</div>'
      : '<div><b style="color:' + (seat.has(c.id) ? this.slotColor(seat.get(c.id)) : '#e8d9a6') + '">' + e(c.from) + ':</b> ' + e(c.text) + '</div>').join('');
    h += '<div class="lbBody"><div class="lbSlots"><div class="lbTeams">' + teams.join('') + '</div>'
      + '<div class="lbTeamTools">' + (open && maxTeam < 8 ? '<a href="#" id="lbAddTeam" class="lbLink">+ add a team</a>' : '')
      + (edit ? '<a href="#" id="lbShuffle" class="lbLink" title="Deal every slot onto the teams in use at random, as evenly as they go">shuffle teams</a>' : '') + '</div>'
      + '<div class="lbChat" id="lbChatLog">' + lines + '</div>'
      + '<input id="lbChat" placeholder="Say something and press Enter" maxlength="200">'
      + '</div>' + settings + '</div>';
    // THE COUNTDOWN. Every number here came from the relay, so every client draws the same digit at the
    // same moment; nothing is timed locally. (item 12)
    if (open && over) h += '<div class="sub lbCancelled">' + e(this.mapName(L.layout)) + ' has ' + seats + ' start positions and there are ' + L.players.length + ' players. ' + (host ? 'Remove a slot or pick a bigger map to start.' : 'The host has to remove a slot or pick a bigger map.') + '</div>';
    if (counting) h += '<div class="lbCd"><span class="lbCdT">The game starts in</span><span class="lbCdN">' + (this.count | 0) + '</span></div>';
    else if (!open) h += '<div class="sub">Game in progress. Dropped players can rejoin by connecting with their name.</div>';
    else if (this.countMsg) h += '<div class="sub lbCancelled">' + e(this.countMsg) + '</div>';
    const rung = this.rungAt && Date.now() - this.rungAt < 8000;
    // THE BUTTON BAR: READY first, because it is the one thing every player has to press.
    h += '<div class="lbButtons">'
      + (open ? '<button id="lbReady" class="' + (meP && meP.ready ? 'on' : '') + (rung ? ' lbRing' : '') + '">' + (meP && meP.ready ? 'READY &#10003;' : 'READY') + '</button>' : '')
      + (host && open ? '<button id="lbStart"' + (over ? ' class="lbWaiting" title="Too many players for this map"' : checks && waiting.length ? ' class="lbWaiting" title="' + waiting.map(p => e(p.name)).join(', ') + ' not ready yet"' : '') + '>START GAME</button>' : '')
      + (host && counting ? '<button id="lbCancel">CANCEL</button>' : '')
      + (host && open ? '<button id="lbPrivacy" class="small">' + (L.listed ? 'MAKE PRIVATE' : 'MAKE PUBLIC') + '</button>' : '')
      + '<button id="lbLeave" class="small">QUIT</button>'
      + (open ? '<span class="sub lbWait">' + (host ? readyLine : (meP && meP.ready ? 'Ready. Waiting for the host to start.' : 'Press READY when the game on screen is the one you want to play.')) + '</span>' : '')
      + '</div>';
    return h;
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
    UI.start(this.gameOptions(m));
  },
  // Rejoin after a drop: the relay sends every command batch since the start; re-simulate from frame 0, then continue live.
  rejoinGame(m) {
    this.reset(m);
    this.speed = m.speed == null ? 6 : m.speed; this.cheats = !!m.cheats;
    for (const h of (m.history || [])) { if (!this.inbox[h.f]) this.inbox[h.f] = {}; this.inbox[h.f][h.p] = Array.isArray(h.c) ? h.c : []; if (h.p === this.me) this.sent[h.f] = true; }
    this.catchingUp = true; this.catchTarget = m.frame || 0;
    UI.start(this.gameOptions(m));;
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
