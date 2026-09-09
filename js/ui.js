'use strict';
// ============================================================================
// UI: input, selection, command card, console panel, minimap, hotkeys,
// messages, sound, main loop, menus.
// ============================================================================
const Sound = {
  // Master mute, over the top of Voice.on and Music.on. It starts true on every load and is
  // deliberately NOT restored from localStorage: the game always opens silent, and unmuting lasts for
  // the page session only. A browser tab that starts making noise on its own is the thing being
  // avoided, and a remembered "unmuted" would defeat that on the one load that matters -- the next one.
  ctx: null, last: {}, enabled: true, muted: true,
  setMuted(v) {
    this.muted = !!v;
    if (typeof Music === 'undefined') return;
    if (this.muted) Music.stop();
    else if (Music.on && typeof G !== 'undefined' && G.players.length) Music.start();
  },
  init() { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.enabled = false; } },
  tone(f, dur, type = 'square', vol = 0.05, slide = 0) { if (this.muted || !this.enabled || !this.ctx) return; const c = this.ctx; if (c.state === 'suspended') c.resume(); const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; if (slide) o.frequency.linearRampToValueAtTime(f + slide, c.currentTime + dur); g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur); },
  limited(key, ms) { const n = performance.now(); if (n - (this.last[key] || 0) < ms) return false; this.last[key] = n; return true; },
  click() { this.tone(900, 0.04, 'square', 0.03); },
  select(u) { if (typeof Voice !== 'undefined') Voice.select(u); if (!this.limited('sel', 120)) return; const r = u.def.race; this.tone(r === 'Z' ? 220 : r === 'P' ? 520 : 380, 0.08, r === 'Z' ? 'sawtooth' : 'triangle', 0.04, r === 'Z' ? -60 : 40); },
  ack(u) { if (typeof Voice !== 'undefined') Voice.ack(u); if (!this.limited('ack', 120)) return; const r = u.def.race; this.tone(r === 'Z' ? 260 : r === 'P' ? 600 : 440, 0.07, 'triangle', 0.04, 60); },
  // A weapon should be identifiable by ear. This used to be two sounds -- big and small -- so a siege
  // line and a battlecruiser were the same noise, and nothing off-screen told you what was shooting at
  // you. Five voices now, chosen by what the weapon IS rather than by how hard it hits: the damage type
  // and whether it is a beam, a missile or a blade. Being able to hear "that is a tank, not a goliath"
  // without looking is the whole point.
  WVOICE: {
    // freq, duration, wave, gain, slide
    bullet:   [300, 0.045, 'square',   0.022, -70],    // rifles and autocannon: dry and fast
    cannon:   [ 95, 0.170, 'sawtooth', 0.065, -55],    // siege, yamato, anything explosive and heavy
    beam:     [640, 0.110, 'sine',     0.030, 340],    // lasers and psionic weapons: rising and clean
    missile:  [180, 0.130, 'triangle', 0.045, 120],    // anything that flies to its target
    blade:    [520, 0.060, 'triangle', 0.028, -240],   // melee: a short downward swipe
  },
  voiceOf(u, w) {
    if (!w) return 'bullet';
    if (w.melee || u.wRange(w) <= 1.5) return 'blade';
    if (w.type === 'explosive' && w.dmg >= 25) return 'cannon';
    if (u.def.race === 'P' && w.type !== 'explosive') return 'beam';
    if (w.splash || w.dmg >= 20) return 'missile';
    return 'bullet';
  },
  attack(u) {
    if (!this.limited('atk' + u.def.id, 90)) return;
    const w = u.sieged ? SIEGE_W : (u.def.gw || u.def.aw);
    const [f, d, t, g, sl] = this.WVOICE[this.voiceOf(u, w)];
    this.tone(f + (u.id % 5) * 6, d, t, g, sl);   // a few Hz of spread so a volley is a texture, not one note
  },
  death(u) { if (!this.limited('death', 60)) return; this.tone(u.isBuilding ? 60 : 160, u.isBuilding ? 0.6 : 0.2, 'sawtooth', 0.06, -50); },
  alert(kind) { if (kind === 'error') { this.tone(200, 0.12, 'square', 0.04); } else if (kind === 'attack') { this.tone(660, 0.1, 'square', 0.05); setTimeout(() => this.tone(440, 0.15, 'square', 0.05), 120); } else if (kind === 'nuke') { for (let i = 0; i < 4; i++) setTimeout(() => this.tone(300, 0.3, 'sawtooth', 0.06, 200), i * 400); } else this.tone(700, 0.06, 'triangle', 0.03); },
  nuke() { this.alert('nuke'); }, boom() { this.tone(40, 1.2, 'sawtooth', 0.15, -20); },
};

const UI = {
  get consoleH() { return Math.round(clamp(Render.H * 0.26, 140, 196)); }, // a fixed height left no map at all in a short window
  selection: [], subgroup: 0, idleIdx: 0, groups: {}, hover: null, mouse: { x: 0, y: 0, down: false, wx: 0, wy: 0, inside: false }, drag: null, dragging: false, pending: null, placing: null, menu: null, markers: [], pings: [], keys: {}, lastClick: 0, lastClickUnit: null, msgLog: [], camSaves: {}, showHelp: false, cardButtons: [], lastAlertPos: null, speedIdx: 6, accum: 0, lastT: 0, running: false, fps: 0, frames: 0, fpsT: 0,
  SPEEDS: [0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 2, 4, 8], SPEED_NAMES: ['Slowest', 'Slower', 'Slow', 'Normal', 'Fast', 'Faster', 'Fastest', '2x', '4x', '8x'], mode: 'play', viewAll: false, chat: null, loading: null, prodOverlay: false, replayData: null, seeking: false, snaps: [], SNAP_EVERY: 24 * 30,
  speedName() { return this.net && typeof Net !== 'undefined' && Net.speed != null ? this.SPEED_NAMES[Net.speed] + ' (set by the host)' : this.SPEED_NAMES[this.speedIdx]; },
  maxSpeedIdx() { return this.mode === 'replay' ? 9 : 6; },
  init() {
    const c = document.getElementById('game'); Render.init(c); Sound.init(); if (typeof Atlas !== 'undefined') Atlas.init();
    window.addEventListener('resize', () => Render.resize());
    c.addEventListener('mousemove', e => this.onMove(e)); c.addEventListener('mousedown', e => this.onDown(e)); window.addEventListener('mouseup', e => this.onUp(e));
    c.addEventListener('contextmenu', e => e.preventDefault()); c.addEventListener('dblclick', e => { });
    window.addEventListener('keydown', e => this.onKey(e)); window.addEventListener('keyup', e => { this.keys[e.key] = false; });
    // The wheel zooms. Guarded on the console strip and on any modal, so scrolling over the command
    // card or the codex does not silently move the world behind it. Render.zoomAt clamps and re-clamps
    // the camera itself; the anchor is the cursor, so the tile under the pointer stays under it.
    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.menu || (typeof Codex !== 'undefined' && Codex.isOpen())) return;
      if (e.clientY >= Render.H - this.consoleH) return;
      Render.zoomAt(Render.zoom * Math.pow(1.12, -Math.sign(e.deltaY)), e.clientX, e.clientY);
    }, { passive: false });
    c.addEventListener('mouseleave', () => { this.mouse.inside = false; }); c.addEventListener('mouseenter', () => { this.mouse.inside = true; });
  },
  start(opts) {
    opts = Object.assign({}, opts, { players: opts.players.map(p => Object.assign({}, p, { race: p.race === 'R' ? ['T', 'Z', 'P'][Math.floor(Math.random() * 3)] : p.race })) });
    this.lastOpts = opts; this.mode = opts.mode || 'play'; this.viewAll = false; this.prodOverlay = false; this.chat = null; this.loading = null; if (this.speedIdx > this.maxSpeedIdx()) this.speedIdx = this.maxSpeedIdx();
    // A composed skirmish layout id describes its own map, so it can be rebuilt rather than shipped.
    // This is the one place that has to happen, and it has to happen BEFORE G.init: GameMap resolves
    // the id in its constructor, and G.daylight looks the layout up in MAP_LAYOUTS by name on every
    // frame. A no-op for every id that is not composed. See UI.skirmishOptions for the whole argument.
    this.registerSkirmishLayout(opts.layout);
    G.init(opts); this.applyStartingBank(opts); G.recording = this.mode === 'play'; G.log = []; G.pendingCmds = null; G.mission = null; if (opts.mission && typeof Missions !== 'undefined') Missions.begin(opts.mission);
    Render.reset(); if (typeof Music !== 'undefined' && Music.on && !Sound.muted) Music.start(); this.net = !!opts.net; if (this.net) G.paused = false; this.selection = []; this.groups = {}; this.pending = null; this.placing = null; this.menu = null; this.markers = []; this.pings = []; this.msgLog = []; if (G.mission) this.menu = 'brief';
    const hp = G.players[G.human]; Render.camX = hp.startX - Render.viewWorldW() / 2; Render.camY = hp.startY - Render.viewWorldH() / 2 + 40; this.clampCam();
    const hall = G.units.find(u => u.owner === G.human && u.isBuilding); if (hall) this.select([hall]);
    document.getElementById('menu').style.display = 'none'; document.getElementById('game').style.display = 'block';
    this.running = true; this.menuCodex = false; this.lastT = performance.now(); this.accum = 0; this.lastR = performance.now();
    if (!this._loop) { this._loop = t => this.loop(t); requestAnimationFrame(this._loop); }
    if (!this.simTimer) this.simTimer = setInterval(() => this.simStep(), 1000 / 60);
  },
  startFromLog(data, mode) {
    // A save is a seed plus a command log, so a different build re-simulates it into a different game and
    // drifts away silently. Refuse it with the reason instead.
    const bad = Replay.versionError(data, mode === 'watch' ? 'replay' : 'save');
    if (bad) { this.loading = null; if (typeof alert === 'function') alert(bad); else console.error(bad); return false; }
    const opts = { players: data.players, seed: data.seed, layout: data.layout, mission: data.mission || null, mode: mode === 'watch' ? 'replay' : 'play' };
    this.start(opts); G.pendingCmds = { list: data.cmds || [], i: 0 }; G.recording = mode === 'load';
    if (mode === 'watch') { this.replayData = data; this.replayOpts = opts; this.viewAll = true; this.prodOverlay = true; this.snaps = []; } // an observer wants to see everything by default
    if (mode === 'load') this.fastForward(data.frame, () => { G.pendingCmds = null; if (data.cam) { Render.camX = data.cam.x; Render.camY = data.cam.y; this.clampCam(); } });
  },
  fastForward(target, done) {
    this.loading = { target, start: G.frame };
    const step = () => { const t0 = performance.now(); while (G.frame < target && !G.over && performance.now() - t0 < 40) { G.tick(); this.keepSnapshot(); } if (G.frame < target && !G.over) setTimeout(step, 0); else { this.loading = null; done(); } };
    setTimeout(step, 0);
  },
  simStep() {
    if (!this.running) return; const now = performance.now(); const dt = Math.min(1, (now - this.lastT) / 1000); this.lastT = now;
    if (this.net && typeof Net !== 'undefined' && Net.active && Net.catchingUp) { // rejoin: replay the relay's history as fast as possible, then go live
      const t0 = performance.now(); while (Net.ready(G.frame) && performance.now() - t0 < 40) { Net.beforeTick(); G.tick(); }
      if (!Net.ready(G.frame)) { Net.catchingUp = false; this.loading = null; this.accum = 0; this.menu = null; G.players[G.human].msg('Rejoined the game at ' + Net.clock(G.frame) + '.', 'info'); }
      else if (this.loading) this.loading.target = Math.max(this.loading.target, G.frame + 1);
      return;
    }
    if (G.paused || this.menu || this.loading) return;
    if (this.mode === 'play' && G.frame > 0 && G.frame % (TPS * 120) === 0 && !(typeof Net !== 'undefined' && Net.active) && !this._autosaved) { this._autosaved = true; Replay.save(false); } else if (G.frame % (TPS * 120) !== 0) this._autosaved = false;
    const step = 1 / (TPS * this.SPEEDS[this.net ? (typeof Net !== 'undefined' && Net.speed != null ? Net.speed : 6) : this.speedIdx]); this.accum += dt; let n = 0;
    if (this.net && typeof Net !== 'undefined' && Net.active) { while (this.accum >= step && n < 8) { if (!Net.ready(G.frame)) { if (!Net.waitingSince) Net.waitingSince = performance.now(); this.accum = Math.min(this.accum, step); break; } Net.waitingSince = 0; Net.beforeTick(); G.tick(); this.accum -= step; n++; } return; }
    while (this.accum >= step && n < 48) { G.tick(); this.keepSnapshot(); this.accum -= step; n++; }
    if (n >= 48) this.accum = 0;
  },
  loop(t) {
    requestAnimationFrame(this._loop);
    if (this.menuCodex) { this.drawMenuCodex(); return; }   // the main-menu codex; see openCodexFromMenu
    if (!this.running) return;
    const dt = Math.min(0.1, (t - this.lastR) / 1000); this.lastR = t;
    const step = 1 / (TPS * this.SPEEDS[this.speedIdx]);
    this.scrollCam(dt);
    for (let i = this.markers.length - 1; i >= 0; i--) if (--this.markers[i].t <= 0) this.markers.splice(i, 1);
    for (let i = this.pings.length - 1; i >= 0; i--) if (--this.pings[i].t <= 0) this.pings.splice(i, 1);
    this.selection = this.selection.filter(u => u.alive && !u.inside);
    Render.frame(G.paused ? 1 : Math.min(1, this.accum / step));
    if (typeof Music !== 'undefined' && Music.poll) Music.poll();   // combat music state; render-side, reads the sim and never writes it
    this.drawConsole(); this.drawTop(); this.drawMessages();
    if (typeof Codex !== 'undefined') Codex.draw(Render.ctx);   // above the console, below the menu
    if (this.mode === 'replay') { this.drawTimeline(); if (this.prodOverlay) this.drawProdOverlay(); }
    if (G.over && !this.menu) this.menu = 'over';
    if (this.menu) this.drawMenu();
    this.frames++; if (t - this.fpsT > 1000) { this.fps = this.frames; this.frames = 0; this.fpsT = t; }
  },
  // ---------------- observer / replay controls ----------------
  // G.human only drives what is rendered (vision, the console, alerts) and the command wrappers are inert
  // in replay mode, so pointing it at another player is a pure view change with no effect on the sim.
  observePlayer(id) { if (this.mode !== 'replay') return; const n = G.players.length; G.human = ((id % n) + n) % n; this.selection = []; this.pending = null; this.placing = null; },
  cycleObserved(d) { this.observePlayer(G.human + d); const p = G.players[G.human]; if (p) p.msg('Watching ' + p.name + ' (' + RACE_INFO[p.race].name + ')', 'info'); },
  replayLength() { const d = this.replayData; if (!d) return 0; const last = d.cmds && d.cmds.length ? d.cmds[d.cmds.length - 1].f : 0; return Math.max(d.frame || 0, last); },
  // Checkpoints so that seeking backwards does not have to re-run from frame 0. Thirty seconds of game
  // time apart; past 80 of them (40 minutes) every second one is dropped, which halves the resolution of
  // the distant past rather than letting memory grow without bound.
  keepSnapshot() {
    if (this.mode !== 'replay' || typeof Snapshot === 'undefined') return;
    if (G.frame % this.SNAP_EVERY !== 0) return;
    const last = this.snaps[this.snaps.length - 1];
    if (last && last.f >= G.frame) return; // already have this point (we just seeked onto it)
    this.snaps.push({ f: G.frame, s: Snapshot.take() });
    if (this.snaps.length > 80) this.snaps = this.snaps.filter((x, i) => i % 2 === 0 || i > this.snaps.length - 20);
  },
  nearestSnapshot(frame) { let best = null; for (const c of this.snaps) if (c.f <= frame && (!best || c.f > best.f)) best = c; return best; },

  // Seeking forward just runs the sim on. Seeking back restarts from the nearest checkpoint, or from frame 0
  // if there is none, because a replay is a command log rather than a series of snapshots.
  seekTo(frame) {
    if (this.mode !== 'replay' || !this.replayData || this.seeking) return;
    const target = clamp(Math.round(frame), 0, this.replayLength()), watched = G.human, all = this.viewAll, ov = this.prodOverlay;
    if (target < G.frame) {
      const cp = this.nearestSnapshot(target);
      if (cp) Snapshot.restore(cp.s);
      else { const keep = this.snaps; this.start(this.replayOpts); this.snaps = keep; G.pendingCmds = { list: this.replayData.cmds || [], i: 0 }; }
      this.viewAll = all; this.prodOverlay = ov; G.human = watched; this.selection = [];
    }
    if (target <= G.frame) return;
    this.seeking = true;
    this.fastForward(target, () => { this.seeking = false; G.human = watched; this.viewAll = all; this.prodOverlay = ov; });
  },
  timelineRect() { return { x: 10, y: 34, w: Math.max(120, Render.W - 320), h: 12 }; },
  timelineClick(x, y) {
    if (this.mode !== 'replay' || !this.replayData) return false;
    const r = this.timelineRect(); if (x < r.x - 4 || x > r.x + r.w + 4 || y < r.y - 6 || y > r.y + r.h + 6) return false;
    this.seekTo((x - r.x) / r.w * this.replayLength()); return true;
  },
  // Per-player production, resources and research. Replay only: in a live game this would be a maphack.
  prodRows() {
    return G.players.map(p => {
      const items = {}; let army = 0, workers = 0;
      for (const u of G.units) {
        if (!u.alive || u.owner !== p.id) continue;
        if (u.def.worker) workers++;
        else if (!u.isBuilding && !u.def.larva && !u.def.egg && u.hasWeapon()) army += u.def.sup || 0;
        for (const it of u.prod) { const d = it.kind === 'unit' ? DATA.units[it.id] : DATA.buildings[it.id]; const k = d ? d.name : it.id; items[k] = (items[k] || 0) + 1; }
      }
      for (const t of p.researching) { const d = DATA.techs[t] || DATA.upgrades[t]; const k = d ? d.name : t; items[k] = (items[k] || 0) + 1; }
      const top = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 4).map(kv => kv[1] > 1 ? kv[0] + ' x' + kv[1] : kv[0]);
      return { p, workers, army: Math.round(army), making: top.join(', ') || 'nothing' };
    });
  },
  prodRowRect(i) { return { x: 10, y: 66 + i * 20, w: 340, h: 18 }; },
  prodClick(x, y) {
    if (!this.prodOverlay || this.mode !== 'replay') return false;
    for (let i = 0; i < G.players.length; i++) { const r = this.prodRowRect(i); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { this.observePlayer(i); this.viewAll = false; return true; } }
    return false;
  },

  // ---------------- camera ----------------
  clampCam() { Render.clampCam(); },   // zoom-dependent, and centres the map when the view is wider than it
  scrollCam(dt) {
    const s = 900 * dt / Render.zoom; const m = this.mouse; let dx = 0, dy = 0;   // screen-constant speed: without /zoom, edge scroll crawls at the strategic view
    if (this.keys.ArrowLeft) dx -= s; if (this.keys.ArrowRight) dx += s; if (this.keys.ArrowUp) dy -= s; if (this.keys.ArrowDown) dy += s;
    if (document.hasFocus() && !this.menu && m.inside) { if (m.x <= 2) dx -= s; if (m.x >= Render.W - 3) dx += s; if (m.y <= 2) dy -= s; if (m.y >= Render.H - 3) dy += s; }
    if (dx || dy) { Render.camX += dx; Render.camY += dy; this.clampCam(); }
  },
  centerOn(x, y) { Render.camX = x - Render.viewWorldW() / 2; Render.camY = y - Render.viewWorldH() / 2; this.clampCam(); },
  // ---------------- selection ----------------
  select(units, add) {
    this.subgroup = 0;   // a new selection starts on its first kind
    let list = add ? this.selection.slice() : [];
    for (const u of units) { if (!list.includes(u) && list.length < 12) list.push(u); }
    // if mix of own units and others, keep own only; buildings only when nothing else
    const own = list.filter(u => u.owner === G.human);
    if (own.length && own.length < list.length) list = own;
    const mobile = list.filter(u => !u.isBuilding);
    if (mobile.length && mobile.length < list.length) list = mobile;
    if (list.length > 1) list = list.filter(u => !u.def.larva || list.every(v => v.def.larva)).slice(0, 12);
    this.selection = list; this.pending = null; this.placing = null; this.cardMenu = null;
    if (list.length) Sound.select(list[0]);
  },
  onUnitDied(u) { const i = this.selection.indexOf(u); if (i >= 0) this.selection.splice(i, 1); for (const k in this.groups) { const j = this.groups[k].indexOf(u); if (j >= 0) this.groups[k].splice(j, 1); } },
  // The hit radius is in WORLD units, so at the strategic view it shrinks with everything else while
  // the icon the player is actually aiming at does not. Max against the icon's own size keeps a unit
  // clickable at the size it is drawn rather than the size it is.
  unitAt(wx, wy) {
    let best = null, bd = 1e9;
    for (const u of G.units) { if (!u.alive || u.inside || u.def.notUnit) continue; if (u.owner !== G.human && !G.canSee(G.human, u) && !(u.isBuilding && G.explored(G.human, Math.floor(u.x / TILE), Math.floor(u.y / TILE)))) continue; let hit, d; if (u.isBuilding && !u.lifted) { hit = wx >= u.tx * TILE && wx < (u.tx + u.def.w) * TILE && wy >= u.ty * TILE && wy < (u.ty + u.def.h) * TILE; d = 500; } else { d = distPt(wx, wy, u.x, u.y); hit = d <= Math.max(u.r + 4, Render.iconH(u) * 1.4); } if (hit && d < bd) { bd = d; best = u; } }
    return best;
  },
  // ---------------- input ----------------
  // Delegated to Render, which owns the zoom. This is the load-bearing line: every click, drag,
  // order and hover goes through it, so leaving the old `sx + camX` here would land every one of them
  // in the wrong place at any zoom other than 1 -- and it would look like a targeting bug, not a
  // camera bug.
  screenToWorld(sx, sy) { return Render.screenToWorld(sx, sy); },
  inMinimap(x, y) { const r = this.miniRect(); return x >= r.x && x < r.x + r.s && y >= r.y && y < r.y + r.s; },
  miniRect() { return { x: 10, y: Render.H - this.consoleH + 6, s: this.consoleH - 12 }; },
  miniToWorld(x, y) { const r = this.miniRect(); return [(x - r.x) / r.s * G.map.w * TILE, (y - r.y) / r.s * G.map.h * TILE]; },
  onMove(e) {
    const m = this.mouse; m.x = e.clientX; m.y = e.clientY; [m.wx, m.wy] = this.screenToWorld(m.x, m.y);
    if (typeof Codex !== 'undefined' && Codex.isOpen()) { Codex.move(m.x, m.y); return; }
    if (this.drag && m.down && distPt(m.x, m.y, this.drag.x0, this.drag.y0) > 4) { this.dragging = true; this.drag.x1 = m.x; this.drag.y1 = m.y; }
    if (this.lineDrag) { this.lineDrag.x1 = m.x; this.lineDrag.y1 = m.y; }
    if (this.miniDrag) { const [wx, wy] = this.miniToWorld(m.x, m.y); this.centerOn(wx, wy); }
    if (this.placing) { const d = this.placing.def; this.placing.tx = Math.floor(m.wx / TILE - d.w / 2 + 0.5); this.placing.ty = Math.floor(m.wy / TILE - d.h / 2 + 0.5); if (d.onGeyser) { const g = G.map.resources.find(r => r.type === 'geyser' && m.wx >= r.x * TILE - 16 && m.wx < (r.x + r.w) * TILE + 16 && m.wy >= r.y * TILE - 16 && m.wy < (r.y + r.h) * TILE + 16); if (g) { this.placing.tx = g.x; this.placing.ty = g.y; } } }
    this.hover = (m.y < Render.H - this.consoleH) ? this.unitAt(m.wx, m.wy) : null;
  },
  onDown(e) {
    const m = this.mouse; m.x = e.clientX; m.y = e.clientY; [m.wx, m.wy] = this.screenToWorld(m.x, m.y);
    if (typeof Codex !== 'undefined' && Codex.isOpen()) { Codex.click(m.x, m.y, e.button); return; }
    if (Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume();
    if (this.menu) { this.menuClick(m.x, m.y); return; }
    if (this.mode === 'replay' && e.button === 0 && (this.timelineClick(m.x, m.y) || this.prodClick(m.x, m.y))) return;
    if (m.y >= Render.H - this.consoleH) { this.consoleClick(m.x, m.y, e.button); return; }
    if (e.button === 0) {
      if (this.placing) { this.confirmPlacement(e.shiftKey); return; }
      if (this.pending) { const t = this.unitAt(m.wx, m.wy); this.execPending(t, m.wx, m.wy, e.shiftKey); return; }
      m.down = true; this.drag = { x0: m.x, y0: m.y, x1: m.x, y1: m.y }; this.dragging = false;
    } else if (e.button === 2) {
      if (this.placing || this.pending) { this.placing = null; this.pending = null; return; }
      // Beyond All Reason's line formation: hold the right button and drag, and the selection spreads
      // evenly along the line you drew. The command is issued on RELEASE now rather than on press, so a
      // plain right-click is simply a drag of zero length and behaves exactly as it always did.
      this.lineDrag = { x0: m.x, y0: m.y, x1: m.x, y1: m.y, shift: e.shiftKey };
      return;
      const t = this.unitAt(m.wx, m.wy); this.smartCommand(t, m.wx, m.wy, e.shiftKey);
    }
  },
  onUp(e) {
    const m = this.mouse; if (this.miniDrag) { this.miniDrag = false; return; }
    if (e.button === 2 && this.lineDrag) {
      const d = this.lineDrag; this.lineDrag = null;
      const len = distPt(d.x0, d.y0, d.x1, d.y1);
      const [wx0, wy0] = this.screenToWorld(d.x0, d.y0), [wx1, wy1] = this.screenToWorld(d.x1, d.y1);
      if (len < this.LINE_MIN) { const t = this.unitAt(wx1, wy1); this.smartCommand(t, wx1, wy1, d.shift || this.keys.Shift); }
      else this.lineCommand(wx0, wy0, wx1, wy1, d.shift || this.keys.Shift);
      return;
    }
    if (e.button !== 0 || !m.down) return; m.down = false;
    if (this.dragging && this.drag) { const d = this.drag; const [x0, y0] = this.screenToWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1)), [x1, y1] = this.screenToWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1)); const inBox = G.units.filter(u => u.alive && !u.inside && !u.isBuilding && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1 && (u.owner === G.human || G.canSee(G.human, u)) && !u.def.notUnit); let own = inBox.filter(u => u.owner === G.human); if (!own.length && inBox.length) own = [inBox[0]]; if (own.length) this.select(own, e.shiftKey); else if (!e.shiftKey) { const b = G.units.filter(u => u.alive && u.isBuilding && u.owner === G.human && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1)[0]; if (b) this.select([b]); } }
    else if (this.drag) { const t = this.unitAt(m.wx, m.wy); const now = performance.now(); if (t) { if (now - this.lastClick < 350 && this.lastClickUnit === t && t.owner === G.human && !t.isBuilding) { const same = G.units.filter(u => u.alive && u.owner === G.human && u.def.id === t.def.id && !u.inside && u.x > Render.camX && u.x < Render.camX + Render.viewWorldW() && u.y > Render.camY && u.y < Render.camY + Render.viewWorldH()); this.select(same, e.shiftKey); } else if (e.shiftKey && this.selection.includes(t)) { this.selection = this.selection.filter(u => u !== t); } else if (e.ctrlKey) { const same = G.units.filter(u => u.alive && u.owner === t.owner && u.def.id === t.def.id && !u.inside && u.x > Render.camX && u.x < Render.camX + Render.viewWorldW() && u.y > Render.camY && u.y < Render.camY + Render.viewWorldH()); this.select(same, e.shiftKey); } else this.select([t], e.shiftKey && t.owner === G.human); this.lastClick = now; this.lastClickUnit = t; } else if (!e.shiftKey) { this.selection = []; this.cardMenu = null; } }
    this.drag = null; this.dragging = false;
  },
  onKey(e) {
    this.keys[e.key] = true; const k = e.key;
    // The codex is modal: while it is open it eats the keyboard so nothing leaks through to the game.
    if (typeof Codex !== 'undefined' && Codex.isOpen()) { if (Codex.key(k)) { e.preventDefault(); return; } }
    if (k === 'F3') { e.preventDefault(); if (typeof Codex !== 'undefined') Codex.toggle(); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'F10', 'F1'].includes(k)) e.preventDefault();
    if (this.menu) { if (k === 'Escape' || k === 'F10') { if (this.menu === 'settings') this.menu = 'pause'; else if (this.menu === 'pause') this.menu = null; } return; }
    if (k === 'F10') { this.menu = 'pause'; return; }
    if (this.chat !== null) { e.preventDefault(); if (k === 'Enter') { const line = this.chat.trim(); this.chat = null; if (line) { if (this.net) Net.chat(line); else if (!G.cheat(line)) G.players[G.human].msg(line, 'info'); } } else if (k === 'Escape') this.chat = null; else if (k === 'Backspace') this.chat = this.chat.slice(0, -1); else if (k.length === 1 && this.chat.length < 60) this.chat += k; return; }
    if (k === 'Enter' && this.mode === 'play') { this.chat = ''; e.preventDefault(); return; }
    if (k === 'F5') { e.preventDefault(); Replay.save(true); return; }
    if (k === 'F8') { e.preventDefault(); if (Replay.hasAutosave()) Replay.loadAutosave(); return; }
    if ((k === 'm' || k === 'M') && e.ctrlKey) { Sound.setMuted(!Sound.muted); e.preventDefault(); const hp = G.players[G.human]; if (hp) hp.msg(Sound.muted ? 'Sound muted.' : 'Sound on.', 'info'); return; }   // plain M is the Move command
    if ((k === 'v' || k === 'V') && e.ctrlKey && this.mode === 'replay') { this.viewAll = !this.viewAll; e.preventDefault(); return; }
    if (this.mode === 'replay') { // observer controls: whose vision, production overlay, scrubbing
      if (k === '[') { this.cycleObserved(-1); this.viewAll = false; return; }
      if (k === ']') { this.cycleObserved(1); this.viewAll = false; return; }
      if (k === 'o' || k === 'O') { this.prodOverlay = !this.prodOverlay; return; }
      if (k === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); this.seekTo(G.frame - TPS * 30); return; }
      if (k === 'ArrowRight' && e.shiftKey) { e.preventDefault(); this.seekTo(G.frame + TPS * 30); return; }
      if (k === 'Home') { e.preventDefault(); this.seekTo(0); return; }
    }
    if (k === 'Tab') { e.preventDefault(); this.cycleSubgroup(e.shiftKey ? -1 : 1); return; }   // Brood War cycles the card through the kinds in a mixed selection
    if (k === ',') { this.idleWorker(); return; }
    if (k === 'Backspace') { e.preventDefault(); this.centerOnSelection(); return; }
    if ((k === 'a' || k === 'A') && e.ctrlKey) { e.preventDefault(); this.selectArmy(); return; }
    if (k === 'F1') { this.showHelp = !this.showHelp; return; }
    if (k === 'Escape') { if (this.placing || this.pending || this.cardMenu) { this.placing = null; this.pending = null; this.cardMenu = null; } else if (this.selection.length === 1 && this.selection[0].isBuilding && !this.selection[0].done && this.selection[0].owner === G.human) G.cancelBuilding(this.selection[0]); else if (this.selection.length === 1 && this.selection[0].prod.length && this.selection[0].owner === G.human) G.cancelProd(this.selection[0], this.selection[0].prod.length - 1); return; }
    if (k === 'F9' || k === 'Pause') { if (!this.net) G.paused = !G.paused; return; }
    if (k === '+' || k === '=') { this.speedIdx = Math.min(this.maxSpeedIdx(), this.speedIdx + 1); return; } if (k === '-') { this.speedIdx = Math.max(0, this.speedIdx - 1); return; }
    if (k === ' ') { if (this.lastAlertPos) this.centerOn(this.lastAlertPos.x, this.lastAlertPos.y); return; }
    if (/^[0-9]$/.test(k)) { if (e.ctrlKey) { this.groups[k] = this.selection.slice(); e.preventDefault(); } else if (e.shiftKey) { this.groups[k] = (this.groups[k] || []).concat(this.selection.filter(u => !(this.groups[k] || []).includes(u))).slice(0, 12); } else if (this.groups[k] && this.groups[k].length) { const g = this.groups[k].filter(u => u.alive); if (this.lastGroupKey === k && performance.now() - this.lastGroupT < 400) this.centerOn(g[0].x, g[0].y); this.selection = g; this.pending = null; this.placing = null; this.cardMenu = null; this.lastGroupKey = k; this.lastGroupT = performance.now(); } return; }
    if (/^F[2-8]$/.test(k)) { if (e.shiftKey) this.camSaves[k] = { x: Render.camX, y: Render.camY, z: Render.zoom }; else if (this.camSaves[k]) { if (this.camSaves[k].z) Render.setZoom(this.camSaves[k].z); Render.camX = this.camSaves[k].x; Render.camY = this.camSaves[k].y; this.clampCam(); } return; }
    const up = k.length === 1 ? k.toUpperCase() : k;
    for (const b of this.currentCard()) if (b.hk === up) { this.press(b); return; }
  },
  // One place that decides what a command-card button does, so a hotkey and a click behave the same.
  // A disabled button used to do nothing at all and say nothing: pressing F on a Barracks with no
  // Academy was indistinguishable from a dead key. It says what is missing now -- the requirement
  // lookup already existed on Player, it was just never reachable, because every caller passed
  // `enabled: false` and both dispatchers skipped `fn` before it could run.
  press(b) {
    if (b.enabled === false) { if (b.why && G.players[G.human]) G.players[G.human].msg(b.why, 'error'); return; }
    b.fn(); Sound.click();
  },
  // the command card as the player sees it right now (rebuilt on demand so input never depends on render timing)
  // The single choke point for the card: build it, page it, then relabel for grid hotkeys. Paginating
  // HERE rather than in buildCard means every one of buildCard's many early returns is covered without
  // each having to remember, and the grid keys are assigned to the slot a button actually occupies on
  // the page it is on rather than the slot it asked for.
  GRID_KEYS: 'QWERASDFZXCV',
  currentCard() {
    const btns = this.paginate(this.buildCard());
    if (this.gridKeys) for (const b of btns) if (b.hk !== 'Escape') b.hk = this.GRID_KEYS[b.slot] || '';
    return btns;
  },
  // ---------------- commands ----------------
  ownSel() { return this.selection.filter(u => u.owner === G.human && u.alive); },
  // Idle worker, which Brood War has no equivalent of and StarCraft II players reach for constantly.
  // Cycles rather than selecting them all: the point is to find the one that stopped, not to gather a
  // crowd. It wraps and remembers where it was, so pressing it repeatedly walks the whole set.
  idleWorker() {
    const idle = G.units.filter(u => u.alive && !u.inside && u.owner === G.human && u.def.worker && u.order.type === 'idle');
    if (!idle.length) { const p = G.players[G.human]; if (p) p.msg('No idle workers.', 'info'); return; }
    idle.sort((a, b) => a.id - b.id);
    const u = idle[this.idleIdx % idle.length]; this.idleIdx = (this.idleIdx + 1) % idle.length;
    this.select([u], false); this.centerOn(u.x, u.y);
  },
  // The whole army, as F2 does in StarCraft II: everything that fights. Workers, buildings, larvae,
  // eggs and anything sitting in a transport stay out of it.
  selectArmy() {
    const army = G.units.filter(u => u.alive && !u.inside && u.owner === G.human && !u.isBuilding && !u.def.worker && !u.def.larva && !u.def.egg);
    if (!army.length) { const p = G.players[G.human]; if (p) p.msg('No army units.', 'info'); return; }
    this.select(army, false);
  },
  // Put the camera on what is selected. StarCraft II has this and Brood War does not; hunting for a
  // group you just recalled by number is the reason people want it.
  centerOnSelection() {
    const sel = this.selection.filter(u => u.alive && !u.inside); if (!sel.length) return;
    let x = 0, y = 0; for (const u of sel) { x += u.x; y += u.y; }
    this.centerOn(x / sel.length, y / sel.length);
  },
  // The distinct kinds in the selection, in a stable order, for Tab cycling.
  subgroupKinds() { const out = []; for (const u of this.ownSel()) if (!out.includes(u.def.id)) out.push(u.def.id); return out; },
  cycleSubgroup(d) { const k = this.subgroupKinds(); if (k.length < 2) return; this.subgroup = ((this.subgroup + d) % k.length + k.length) % k.length; this.cardMenu = null; },
  marker(x, y, color) { this.markers.push({ x, y, t: 20, color }); },
  // Same lifetime as marker(), but drawn as a ring around a resource's footprint by Render.
  ringMarker(res, color = '80,255,80') { this.markers.push({ res, t: 20, color }); },
  // Below this many pixels a right-drag is just a right-click. Small enough that a deliberate line is
  // never mistaken for a click, large enough that a shaky hand on a normal command never draws a line.
  LINE_MIN: 24,
  // Spread the selection evenly along the drawn line, in the order they are standing in ALONG that line
  // rather than selection order -- so units walk to the nearest slot instead of crossing through each
  // other to reach an arbitrary one. Buildings, larvae and eggs are left out; they cannot go anywhere.
  lineCommand(x0, y0, x1, y1, shift) {
    const sel = this.ownSel().filter(u => !u.isBuilding && !u.def.larva && !u.def.egg && !u.inside);
    if (!sel.length) return;
    if (sel.length === 1) { this.smartCommand(null, x1, y1, shift); return; }
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // project each unit onto the line and sort by that, so the left of the group takes the left of the line
    const order = sel.map(u => ({ u, k: (u.x - x0) * ux + (u.y - y0) * uy })).sort((a, b) => a.k - b.k || a.u.id - b.u.id);
    const n = order.length;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      const gx = x0 + dx * f, gy = y0 + dy * f;
      order[i].u.setOrder({ type: 'move', x: gx, y: gy }, shift);
    }
    this.marker(x0, y0, '120,220,255'); this.marker(x1, y1, '120,220,255');
    if (typeof Sound !== 'undefined') Sound.ack(order[0].u);
  },
  // Hold the group's shape over the walk. A plain move sent every unit to the SAME point, so a spread
  // formation collapsed into a scrum on arrival and a column that set off in order arrived as a blob --
  // the thing Supreme Commander and Beyond All Reason both get right and StarCraft II does not.
  //
  // Each unit keeps its offset from the group's centre, so the shape that left is the shape that
  // arrives. Offsets are capped: a selection strung across the whole map should converge, not preserve
  // a formation nobody meant. And the goal has to be somewhere the unit can stand, or the far edge of a
  // formation ends up aimed into a cliff and grinds -- that is what SHAPE_CAP and the passable check do.
  SHAPE_CAP: 7 * 32,
  shapeOffsets(sel, wx, wy) {
    if (sel.length < 2) return null;
    let cx = 0, cy = 0; for (const u of sel) { cx += u.x; cy += u.y; }
    cx /= sel.length; cy /= sel.length;
    const out = new Map();
    for (const u of sel) {
      let ox = u.x - cx, oy = u.y - cy;
      const d = Math.hypot(ox, oy);
      if (d > this.SHAPE_CAP) { const k = this.SHAPE_CAP / d; ox *= k; oy *= k; }
      const gx = wx + ox, gy = wy + oy;
      out.set(u, G.passable(gx, gy, u) ? [gx, gy] : [wx, wy]);
    }
    return out;
  },
  smartCommand(t, wx, wy, shift) {
    const sel = this.ownSel(); if (!sel.length) return;
    // No minimap guard here. There used to be one, and it killed the minimap right-click entirely:
    // consoleClick routes a right-click on the minimap straight to this function, and the cursor is by
    // definition over the minimap when it does. onDown already splits console clicks from world clicks
    // by y before either can reach here, so the guard protected nothing and only blocked the one caller
    // that needed to get through.
    // rally for single building
    // Larvae and eggs take a rally of their own, which overrides the hall's when they hatch. They
    // cannot move, so a right-click had nothing else to mean; this is every selected one at once, so
    // "select larvae, right-click where you want them" works the way selecting them and morphing does.
    if (sel.length && sel.every(u => u.def.larva || u.def.egg)) {
      for (const u of sel) G.setRally(u, wx, wy, t);
      const rr = sel[0].rally && sel[0].rally.res; if (rr) this.ringMarker(rr); else this.marker(wx, wy, '80,255,80');
      return;
    }
    // Every selected production building takes the rally, not just a lone one: ten gateways, one click.
    // Which of the two slots it lands in is G.setRally's decision -- a click on minerals, a geyser or a
    // refinery sets the worker rally, anything else the unit rally -- so the same gesture does both.
    const halls = sel.filter(b => b.isBuilding && !b.lifted && (b.def.produces.length || b.def.spawnsLarva));
    if (halls.length && halls.length === sel.length) {
      for (const b of halls) G.setRally(b, wx, wy, t);
      const b0 = halls[0];
      if (t === b0) { this.marker(wx, wy, '200,200,200'); return; }       // right-click itself clears
      const w = b0.rallyW, isW = !!(w && (w.res || w.gas) && (w.x === wx && w.y === wy));
      const rr = isW ? (w.res || (w.gas && w.gas.geyser)) : null;
      if (rr) this.ringMarker(rr, '255,220,80'); else this.marker(wx, wy, isW ? '255,220,80' : '80,255,80');
      return;
    }
    const res = G.map.resourceAt(Math.floor(wx / TILE), Math.floor(wy / TILE));
    if (res) this.ringMarker(res);   // targeting a patch reads as a ring round it, not a dot in it
    let acked = false;
    const shape = this.shapeOffsets(sel.filter(u => !u.isBuilding && !u.def.larva && !u.def.egg), wx, wy);
    const goal = u => (shape && shape.get(u)) || [wx, wy];
    for (const u of sel) {
      if (u.isBuilding && !u.lifted) continue; if (u.def.larva || u.def.egg) continue;
      if (u.lifted) { const d = u.def; u.setOrder({ type: 'land', tx: Math.floor(wx / TILE - d.w / 2 + .5), ty: Math.floor(wy / TILE - d.h / 2 + .5) }, shift); continue; }
      if (t && t !== u) {
        if (t.owner !== G.human && !G.allied(G.human, t.owner)) { if (u.def.worker && !u.hasWeapon()) { u.setOrder({ type: 'attack', target: t }, shift); } else if (u.hasWeapon() && u.weaponFor(t)) u.setOrder({ type: 'attack', target: t }, shift); else if (u.def.worker) u.setOrder({ type: 'attack', target: t }, shift); else u.setOrder({ type: 'move', x: wx, y: wy, target: t }, shift); }
        else if (u.def.worker && t.def.onGeyser && t.done) u.setOrder({ type: 'gather', target: t, phase: 'goto' }, shift);
        else if (u.def.worker && t.isBuilding && !t.done && t.def.race === 'T') u.setOrder({ type: 'construct', target: t }, shift);
        else if (u.def.worker && t.def.depot && t.done && u.carrying) u.setOrder({ type: 'return', then: u.lastRes, depot: t }, shift);
        else if (u.def.id === 'scv' && (t.def.mech || t.isBuilding) && t.hp < t.maxHp && t.done !== false) u.setOrder({ type: 'repair', target: t }, shift);
        else if ((t.def.cargo || t.def.bunker || (t.def.cargoTech && t.player.hasTech(t.def.cargoTech))) && !u.fly && !u.isBuilding && t !== u) u.setOrder({ type: 'load', target: t }, shift);
        else if ((u.def.cargo || (u.def.cargoTech && u.player.hasTech(u.def.cargoTech))) && !t.fly && !t.isBuilding) u.setOrder({ type: 'pickup', target: t }, shift);
        else if (t.def.nydus && t.nydusLink && t.nydusLink.alive && !u.fly) u.setOrder({ type: 'nydus', target: t }, shift);
        else if (t.isBuilding && !t.lifted) { const [gx, gy] = goal(u); u.setOrder({ type: 'move', x: gx, y: gy }, shift); }
        else u.setOrder({ type: 'follow', target: t }, shift);
      } else if (res && u.def.worker) { if (res.type === 'geyser') { const b = res.building; if (b && b.alive && b.done && b.owner === G.human) u.setOrder({ type: 'gather', target: b, phase: 'goto' }, shift); else u.setOrder({ type: 'move', x: wx, y: wy }, shift); } else u.setOrder({ type: 'gather', target: res, phase: 'goto' }, shift); }
      else { const [gx, gy] = goal(u); u.setOrder({ type: 'move', x: gx, y: gy }, shift); }
      if (!acked) { Sound.ack(u); acked = true; }
    }
    this.marker(wx, wy, t && t.owner !== G.human ? '255,60,60' : '80,255,80');
  },
  execPending(t, wx, wy, shift) {
    const p = this.pending; let sel = this.ownSel(); this.pending = null; if (!sel.length) return;
    if (p.kind === 'rally') { const b = sel[0]; G.setRally(b, wx, wy, t); return; }
    if (p.caster && p.caster.alive) sel = [p.caster]; // ability offered on a parent's card but cast by its add-on (Comsat on a Command Center)
    for (const u of sel) {
      if (u.isBuilding && !u.lifted && p.kind !== 'ability') continue;
      switch (p.kind) {
        case 'move': if (t) u.setOrder({ type: 'follow', target: t }, shift); else u.setOrder({ type: 'move', x: wx, y: wy }, shift); break;
        case 'attack': if (t && t.owner !== G.human) u.setOrder({ type: 'attack', target: t }, shift); else if (t) u.setOrder({ type: 'attackmove', x: wx, y: wy }, shift); else u.setOrder({ type: 'attackmove', x: wx, y: wy }, shift); break;
        case 'patrol': u.setOrder({ type: 'patrol', x: wx, y: wy }, shift); break;
        case 'gather': { const res = G.map.resourceAt(Math.floor(wx / TILE), Math.floor(wy / TILE)); if (res && res.type === 'mineral') u.setOrder({ type: 'gather', target: res, phase: 'goto' }, shift); else if (t && t.def.onGeyser) u.setOrder({ type: 'gather', target: t, phase: 'goto' }, shift); break; }
        case 'repair': if (t && t.owner === G.human) u.setOrder({ type: 'repair', target: t }, shift); break;
        case 'unload': u.setOrder({ type: 'unload', x: wx, y: wy }, shift); break;
        case 'ability': { const ab = DATA.abilities[p.abil]; if (ab.kind === 'unit') { if (t) { Abilities.issue(u, p.abil, t, wx, wy, shift); if (!ab.auto) { this.marker(wx, wy, '120,200,255'); return; } } } else Abilities.issue(u, p.abil, null, wx, wy, shift); if (ab.kind === 'point' && ['psi_storm', 'nuke', 'emp', 'stasis_field', 'maelstrom', 'plague', 'ensnare', 'dark_swarm', 'disruption_web', 'recall', 'scanner_sweep'].includes(p.abil)) { this.marker(wx, wy, '120,200,255'); return; } break; }
      }
    }
    this.marker(wx, wy, p.kind === 'attack' ? '255,60,60' : '80,255,80'); Sound.ack(sel[0]);
  },
  confirmPlacement(shift) {
    const pl = this.placing; const p = G.players[G.human]; const err = G.map.canPlace(pl.def, pl.tx, pl.ty, p, G.units, pl.builder);
    if (err) { p.msg(err, 'error'); return; }
    if (pl.land) { pl.builder.setOrder({ type: 'land', tx: pl.tx, ty: pl.ty }, shift); Sound.ack(pl.builder); this.placing = null; this.cardMenu = null; return; }
    if (!p.canAfford(pl.def.min, pl.def.gas)) return;
    pl.builder.setOrder({ type: 'build', def: pl.def, tx: pl.tx, ty: pl.ty }, shift); Sound.ack(pl.builder);
    if (!shift) { this.placing = null; this.cardMenu = null; }
  },
  ping(x, y) { this.pings.push({ x, y, t: 90 }); this.lastAlertPos = { x, y }; },
  // ---------------- command card ----------------
  // The card is 4 wide and 3 tall -- twelve slots -- and pages beyond that. It used to be 3x3 with
  // Cancel pinned to slot 8, and nothing enforced the nine-entry ceiling: a tenth button drew
  // UNDERNEATH Cancel and stayed clickable, and an eleventh fell off the bottom of the console. Neither
  // threw. Protoss reached 16 of 16 build entries during M11 and only fitted its new structures by
  // hanging them off a morph, which does not scale.
  //
  // Slot 11 is reserved: it is Cancel where a card has one, and the page turn where a card overflows.
  CARD_COLS: 4, CARD_ROWS: 3,
  get CARD_SLOTS() { return this.CARD_COLS * this.CARD_ROWS; },
  cardPage: 0,
  // Split an over-long card into pages, keeping any button that asked for the reserved slot pinned to
  // it on every page -- Cancel has to stay reachable from page two.
  paginate(btns) {
    const last = this.CARD_SLOTS - 1;
    // Pinned buttons are marked, not inferred from their slot. The first version treated slot >= last as
    // "pinned", which is right for Cancel and wrong for everything else: buildCard hands out sequential
    // slots, so an over-long card's own overflow buttons have high slot numbers too and were being
    // mistaken for pins -- the card then reported one page and quietly dropped nothing, which is the
    // exact class of bug this whole change exists to remove.
    const pinned = btns.filter(b => b.pin);
    const flow = btns.filter(b => !b.pin);
    const per = pinned.length ? last : last + 1;
    const pages = Math.max(1, Math.ceil(flow.length / per));
    if (this.cardPage >= pages) this.cardPage = 0;
    const page = flow.slice(this.cardPage * per, this.cardPage * per + per).map((b, i) => Object.assign({}, b, { slot: i }));
    for (const b of pinned) page.push(Object.assign({}, b, { slot: last }));
    if (pages > 1) {
      const nx = (this.cardPage + 1) % pages;
      page.push({ slot: pinned.length ? last - 1 : last, label: 'More ' + (this.cardPage + 1) + '/' + pages, hk: 'Tab',
                  fn: () => { this.cardPage = nx; }, enabled: true, pin: true });
    }
    return page;
  },
  buildCard() {
    const btns = []; const sel = this.ownSel(); this.cardButtons = btns; if (!sel.length) return btns;
    const p = G.players[G.human];
    // Normally the card follows the first selected unit. The exception is a selection holding both an
    // egg and larvae, which is exactly what you have the moment you morph one of several larvae: the egg
    // stays selected so its rally can be set, but the morph buttons must stay up so the next press
    // morphs the next larva. So the card reaches past a leading egg for the first larva.
    // Tab picks which kind the card describes. sel[0] is only the default, and the larva/egg rule still
    // wins over it, because a mixed larva-and-egg selection has one right answer regardless.
    const kinds = this.subgroupKinds();
    const pick = kinds.length > 1 ? sel.find(x => x.def.id === kinds[this.subgroup % kinds.length]) : null;
    const u = (sel[0].def.egg && sel.find(x => x.def.larva)) || pick || sel[0];
    const B = (slot, label, hk, fn, o = {}) => btns.push(Object.assign({ slot, label, hk, fn }, o));
    // Why a greyed button is greyed, for UI.press to say out loud. Player.missingReq already knew;
    // nothing ever asked it on behalf of the command card.
    const why = def => { const m = p.missingReq(def); return m ? 'Requires ' + m : null; };
    const setPending = (kind, abil) => () => { this.pending = { kind, abil }; };
    if (this.cardMenu === 'basic' || this.cardMenu === 'adv') {
      const list = DATA.buildMenu[p.race][this.cardMenu]; list.forEach((id, i) => { const d = DATA.buildings[id]; const ok = p.hasReq(d); B(i, d.name, d.hk, () => { this.placing = { def: d, builder: u, tx: Math.floor(this.mouse.wx / TILE - d.w / 2 + .5), ty: Math.floor(this.mouse.wy / TILE - d.h / 2 + .5) }; }, { cost: d, enabled: ok, dim: !ok, why: why(d) }); });
      B(this.CARD_SLOTS - 1, 'Cancel', 'Escape', () => { this.cardMenu = null; }, { pin: true }); return btns;
    }
    // The morphed larva stays in the selection. larvaMorph reuses the object, so the egg IS the larva
    // and its rally can be set the instant it morphs; the filter drops only what actually died. Eggs are
    // skipped by the `l.def.larva` test below, so the next press still morphs the next larva.
    if (u.def.larva) { B(6, 'Set Rally', 'R', setPending('rally')); DATA.larvaMorphs.forEach((id, i) => { const d = DATA.units[id]; const ok = p.hasReq(d); B(i, d.name, d.hk, () => { for (const l of sel) if (l.def.larva) { if (G.larvaMorph(l, id)) { this.selection = this.selection.filter(x => x.alive); break; } } }, { cost: d, enabled: ok, dim: !ok, why: why(d) }); }); return btns; }
    if (u.def.egg) { B(6, 'Set Rally', 'R', setPending('rally')); B(this.CARD_SLOTS - 1, 'Cancel', 'Escape', () => { for (const e of sel) G.cancelProd(e, 0); }, { pin: true }); return btns; }
    // Several buildings at once. Brood War shows the first one's card and applies what you press to all
    // of them that can do it, which is what makes "select every hatchery, press S" work. The card is
    // built from `u` as before; only the actions below fan out. Buildings that cannot do the thing are
    // simply skipped, so a hatchery, a lair and a hive together behave as one larva pool.
    if (u.isBuilding && sel.length > 1) {
      const halls = sel.filter(b => b.isBuilding && b.done && !b.lifted);
      const lv = []; for (const b of halls) if (b.def.spawnsLarva) for (const l of b.larvae) if (l.alive && l.def.larva) lv.push(l);
      if (lv.length) B(7, 'Select Larvae', 'S', () => { this.selection = lv.slice(0, 24); this.cardMenu = null; this.pending = null; },
        { count: lv.length, enabled: true });
      if (halls.some(b => b.def.produces.length || b.def.spawnsLarva)) B(6, 'Set Rally', 'R', setPending('rally'));
      // The union of what the selection can train, in the first building's order so the card is stable.
      const seen = new Set(); let j = 0;
      for (const b of halls) for (const id of b.def.produces) {
        if (seen.has(id)) continue; seen.add(id);
        const ud = DATA.units[id]; const ok = p.hasReq(ud);
        // Queue on the least busy building that can make it, which is what a player clicking through
        // them one at a time would achieve, and keeps a group of gateways filling evenly.
        B(j++, ud.name, ud.hk, () => {
          const able = halls.filter(b2 => b2.def.produces.includes(id));
          let best = null; for (const b2 of able) if (!best || b2.prod.length < best.prod.length) best = b2;
          if (best) G.queueUnit(best, id);
        }, { cost: ud, enabled: ok, dim: !ok, why: why(ud) });
        if (j > 5) break;
      }
      return btns;
    }
    if (u.isBuilding && sel.length === 1) {
      const d = u.def; let i = 0;
      if (!u.done) { B(this.CARD_SLOTS - 1, 'Cancel', 'Escape', () => G.cancelBuilding(u), { pin: true }); return btns; }
      if (u.lifted) { B(0, 'Land', 'L', setPending('land'), {}); btns[0].fn = () => { this.placing = { def: d, builder: u, land: true, tx: 0, ty: 0 }; }; return btns; }
      for (const id of d.produces) { const ud = DATA.units[id]; const ok = p.hasReq(ud); B(i++, ud.name, ud.hk, () => G.queueUnit(u, id), { cost: ud, enabled: ok, dim: !ok, why: why(ud) }); }
      if (d.id === 'reaver' || d.id === 'carrier') { }
      for (const id of d.upg) { const ud = DATA.upgrades[id]; const lvl = p.upgLevel(id); if (lvl >= 3) continue; const rq = ud.req[lvl]; const ok = !rq || p.hasBuilding(rq); B(i++, ud.name + ' L' + (lvl + 1), ud.hk, () => G.queueUpgrade(u, id), { cost: { min: ud.min[lvl], gas: ud.gas[lvl], time: ud.time[lvl] }, enabled: ok && !p.researching.has(id), dim: !ok || p.researching.has(id), why: !ok && rq ? 'Requires ' + DATA.buildings[rq].name : p.researching.has(id) ? 'Already researching.' : null }); }
      for (const id of d.tech) { const td = DATA.techs[id]; if (p.tech.has(id)) continue; const ok = !td.req || p.hasReq(td); B(i++, td.name, td.hk, () => G.queueTech(u, id), { cost: td, enabled: ok && !p.researching.has(id), dim: !ok || p.researching.has(id), why: !ok ? why(td) : p.researching.has(id) ? 'Already researching.' : null }); }
      if (u.addon && u.addon.done) { for (const id of (u.addon.def.tech || [])) { const td = DATA.techs[id]; if (p.tech.has(id)) continue; B(i++, td.name, td.hk, () => G.queueTech(u.addon, id), { cost: td, enabled: !p.researching.has(id), why: p.researching.has(id) ? 'Already researching.' : null }); } if (u.addon.def.abil) for (const id of u.addon.def.abil) { const ab = DATA.abilities[id]; const addon = u.addon; const taken = btns.some(b => b.hk === ab.hk); B(i++, ab.name, taken ? '' : ab.hk, () => { this.pending = { kind: 'ability', abil: id, caster: addon }; }, { energy: ab.energy }); } if (u.addon.def.produces.length) for (const id of u.addon.def.produces) { const ud = DATA.units[id]; B(i++, ud.name, ud.hk, () => G.queueUnit(u.addon, id), { cost: ud, enabled: !u.addon.hasNuke, why: u.addon.hasNuke ? 'A nuclear missile is already armed.' : null }); } }
      if (!u.addon) for (const id of d.addons) { const ad = DATA.buildings[id]; const ok = p.hasReq(ad); B(i++, ad.name, ad.hk, () => G.queueAddon(u, id), { cost: ad, enabled: ok, dim: !ok, why: why(ad) }); }
      if (d.morphTo) { const nd = DATA.buildings[d.morphTo]; const ok = p.hasReq(nd); B(i++, nd.name, nd.hk, () => G.queueMorph(u, d.morphTo), { cost: nd, enabled: ok, dim: !ok, why: why(nd) }); }
      if (d.morphOptions) for (const id of d.morphOptions) { const nd = DATA.buildings[id]; const ok = p.hasReq(nd); B(i++, nd.name, nd.hk, () => G.queueMorph(u, id), { cost: nd, enabled: ok, dim: !ok, why: why(nd) }); }
      if (d.abil) for (const id of d.abil) { const ab = DATA.abilities[id]; if (!Abilities.available(u, id)) continue; if (ab.kind === 'instant') B(i++, ab.name, ab.hk, () => Abilities.issue(u, id)); else B(i++, ab.name, ab.hk, () => { this.pending = { kind: 'ability', abil: id }; }, { energy: ab.energy }); }
      // Select Larvae, as Brood War has it on S. Without this the only way to morph is to click each
      // larva individually, which is not how anyone plays Zerg: you select the hall, take its larvae,
      // and press the morph key once per larva.
      if (d.spawnsLarva) { const lv = u.larvae.filter(l => l.alive && l.def.larva);
        B(7, 'Select Larvae', 'S', () => { this.selection = lv.slice(); this.cardMenu = null; this.pending = null; },
          { enabled: lv.length > 0, dim: !lv.length, why: lv.length ? null : 'No larvae have hatched yet.' }); }
      if (d.produces.length || d.spawnsLarva) B(6, 'Set Rally', 'R', setPending('rally'));
      if (d.canLift && !u.prod.length) B(7, 'Lift Off', 'L', () => G.liftBuilding(u));
      if (u.prod.length) B(8, 'Cancel', 'Escape', () => G.cancelProd(u, u.prod.length - 1));
      return btns;
    }
    // mobile units
    // Narrowed to the kind Tab has selected, which is what makes Tab mean anything: with marines and
    // vultures together the card shows stim or spider mines depending on which kind you are looking at,
    // rather than the union of both. Movement is unaffected -- Move/Attack/Patrol set `pending`, which
    // executes against the whole selection, and a right-click always moved everything.
    const kindsM = this.subgroupKinds();
    const kindM = kindsM.length > 1 ? kindsM[this.subgroup % kindsM.length] : null;
    let mobile = sel.filter(x => !x.isBuilding || x.lifted);
    if (kindM && mobile.some(x => x.def.id === kindM)) mobile = mobile.filter(x => x.def.id === kindM);
    if (!mobile.length) return btns;
    const all = pred => mobile.every(pred), any = pred => mobile.some(pred);
    if (any(x => x.def.worker) && all(x => x.def.worker)) {
      B(0, 'Move', 'M', setPending('move')); B(1, 'Stop', 'S', () => mobile.forEach(x => x.stop())); B(2, 'Attack', 'A', setPending('attack'));
      B(3, 'Gather', 'G', setPending('gather')); B(4, 'Return Cargo', 'C', () => mobile.forEach(x => { if (x.carrying) x.setOrder({ type: 'return', then: x.lastRes }); }));
      if (all(x => x.def.id === 'scv')) B(5, 'Repair', 'R', setPending('repair'));
      B(6, 'Build', 'B', () => { this.cardMenu = 'basic'; }); B(7, 'Build Advanced', 'V', () => { this.cardMenu = 'adv'; });
      if (all(x => x.def.id === 'drone') && p.hasTech('burrow_tech')) B(8, mobile[0].burrowed ? 'Unburrow' : 'Burrow', 'U', () => mobile.forEach(x => Abilities.issue(x, 'burrow')));
      return btns;
    }
    B(0, 'Move', 'M', setPending('move')); B(1, 'Stop', 'S', () => mobile.forEach(x => x.stop()));
    if (any(x => x.hasWeapon())) B(2, 'Attack', 'A', setPending('attack'));
    B(3, 'Patrol', 'P', setPending('patrol')); B(4, 'Hold Position', 'H', () => mobile.forEach(x => x.setOrder({ type: 'hold' })));
    let i = 5;
    // abilities common to selection (by first unit's def), only if all share the ability
    const abils = (mobile[0].def.abil || []).filter(id => Abilities.available(mobile[0], id) && all(x => (x.def.abil || []).includes(id) || x.def.id === mobile[0].def.id));
    for (const id of abils) {
      if (i > 8) break; const ab = DATA.abilities[id]; const label = Abilities.label(mobile[0], id);
      if (id === 'unload') B(i++, 'Unload', 'U', setPending('unload')); // targeted unload (click a spot); the cargo wireframes unload single units
      else if (ab.kind === 'toggle' || ab.kind === 'instant') B(i++, label, ab.hk, () => mobile.forEach(x => Abilities.issue(x, id)));
      else if (ab.kind === 'morph') B(i++, label, ab.hk, () => mobile.forEach(x => Abilities.issue(x, id)), { cost: DATA.units[ab.unit] });
      else if (ab.kind === 'merge') B(i++, label, ab.hk, () => Abilities.merge(mobile, id));
      else if (ab.kind === 'produce') B(i++, label, ab.hk, () => mobile.forEach(x => G.queueUnit(x, ab.unit)), { cost: DATA.units[ab.unit] });
      else B(i++, label, ab.hk, () => { this.pending = { kind: 'ability', abil: id }; }, { energy: ab.energy });
    }
    if (mobile.some(x => x.cargo.length) && !abils.includes('unload')) B(Math.min(8, i++), 'Unload', 'U', setPending('unload'));
    // mixed selections still get the merge buttons when at least two templar of a kind are selected
    for (const [id, want] of [['summon_archon', 'high_templar'], ['summon_dark_archon', 'dark_templar']]) if (!abils.includes(id) && i <= 8 && mobile.filter(x => x.def.id === want && !x.disabled).length >= 2) { const ab = DATA.abilities[id]; B(i++, ab.name, ab.hk, () => Abilities.merge(mobile, id)); }
    return btns;
  },
  cardRect() { const ch = this.consoleH, k = Math.min(1, (ch - 12) / 164); const bw = Math.round(66 * k), bh = Math.round(52 * k); const w = this.CARD_COLS * bw + 8, h = this.CARD_ROWS * bh + 8; return { x: Render.W - w - 10, y: Render.H - ch + 6, w, h, bw: bw - 4, bh: bh - 4 }; },
  consoleClick(x, y, button) {
    if (this.inMinimap(x, y)) { const [wx, wy] = this.miniToWorld(x, y); if (button === 2) { const t = this.unitAt(wx, wy); if (this.pending) this.execPending(t, wx, wy, false); else this.smartCommand(t, wx, wy, this.keys.Shift); } else if (this.pending) { this.execPending(null, wx, wy, false); } else { this.centerOn(wx, wy); this.miniDrag = true; } return; }
    if (button !== 0) return;
    const cr = this.cardRect();
    for (const b of this.currentCard()) { const gap = cr.gap !== undefined ? cr.gap : 4; const bx = cr.x + 4 + (b.slot % this.CARD_COLS) * (cr.bw + gap), by = cr.y + 4 + Math.floor(b.slot / this.CARD_COLS) * (cr.bh + gap); if (x >= bx && x < bx + cr.bw && y >= by && y < by + cr.bh) { this.press(b); return; } }
    // info panel: selection wireframes / queue / cargo
    for (const h of this.hotspots) if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) { h.fn(); Sound.click(); return; }
  },
  hotspots: [],
  // ---------------- drawing: console ----------------
  drawConsole() {
    const ctx = Render.ctx, W = Render.W, H = Render.H, ch = this.consoleH, y0 = H - ch;
    ctx.fillStyle = '#1b1f26'; ctx.fillRect(0, y0, W, ch); ctx.fillStyle = '#2c3340'; ctx.fillRect(0, y0, W, 3);
    // minimap
    const mr = this.miniRect(); ctx.fillStyle = '#000'; ctx.fillRect(mr.x - 2, mr.y - 2, mr.s + 4, mr.s + 4);
    if (Render.mini) { ctx.imageSmoothingEnabled = false; ctx.drawImage(Render.mini, mr.x, mr.y, mr.s, mr.s); ctx.imageSmoothingEnabled = true; }
    const sc = mr.s / (G.map.w * TILE); const hp = G.players[G.human];
    if (Render.fogCanvas) { ctx.globalAlpha = 0.9; ctx.drawImage(Render.fogCanvas, mr.x, mr.y, mr.s, mr.s); ctx.globalAlpha = 1; }
    for (const r of G.map.resources) { const tx = r.x, ty = r.y; if (hp.vis[ty * G.map.w + tx] === 0) continue; ctx.fillStyle = r.type === 'mineral' ? '#5df' : '#6d5'; ctx.fillRect(mr.x + r.x * mr.s / G.map.w, mr.y + r.y * mr.s / G.map.h, 2, 1.5); }
    for (const u of G.units) { if (!u.alive || u.inside || u.def.larva) continue; if (u.owner !== G.human && !G.canSee(G.human, u) && !(u.isBuilding && G.explored(G.human, Math.floor(u.x / TILE), Math.floor(u.y / TILE)))) continue; ctx.fillStyle = G.players[u.owner].color; const s = u.isBuilding ? Math.max(3, u.def.w * TILE * sc) : 2.5; ctx.fillRect(mr.x + u.x * sc - s / 2, mr.y + u.y * sc - s / 2, s, s); }
    for (const pg of this.pings) { ctx.strokeStyle = `rgba(255,60,60,${pg.t / 90})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mr.x + pg.x * sc, mr.y + pg.y * sc, 4 + (90 - pg.t) % 30 / 3, 0, 7); ctx.stroke(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(mr.x + Render.camX * sc, mr.y + Render.camY * sc, Render.viewWorldW() * sc, Render.viewWorldH() * sc);
    // info panel
    this.hotspots = [];
    const ix = mr.x + mr.s + 16, iw = Render.W - ix - (3 * 66 + 30); ctx.fillStyle = '#12151a'; ctx.fillRect(ix, y0 + 6, iw, ch - 12);
    const sel = this.selection; ctx.fillStyle = '#ddd'; ctx.font = '13px sans-serif';
    if (sel.length === 1) this.drawUnitInfo(ctx, sel[0], ix, y0 + 6, iw, ch - 12);
    else if (sel.length > 1) { sel.forEach((u, i) => { const bx = ix + 8 + (i % 6) * 44, by = y0 + 12 + Math.floor(i / 6) * 52; ctx.fillStyle = '#222a33'; ctx.fillRect(bx, by, 40, 46); const hr = u.hp / u.maxHp; ctx.fillStyle = hr > .66 ? '#3f3' : hr > .33 ? '#ff3' : '#f33'; ctx.fillRect(bx + 2, by + 40, 36 * hr, 3); ctx.save(); ctx.translate(bx + 20, by + 20); ctx.scale(0.8, 0.8); ctx.translate(-u.x, -u.y); u._x = u.x; u._y = u.y; u._alpha = 1; Render.drawUnit(ctx, u, u.x, u.y); ctx.restore(); ctx.fillStyle = '#aaa'; ctx.font = '9px sans-serif'; ctx.fillText(u.def.name.slice(0, 9), bx + 2, by + 9); this.hotspots.push({ x: bx, y: by, w: 40, h: 46, fn: () => { if (this.keys.Shift) this.selection = this.selection.filter(v => v !== u); else this.select([u]); } }); }); }
    else { ctx.fillStyle = '#667'; ctx.font = '12px sans-serif'; ctx.fillText('F1: help   F10: menu   Speed ' + this.SPEEDS[this.speedIdx] + 'x (+/-)   ' + this.fps + ' fps', ix + 10, y0 + 24); ctx.fillText('Map seed ' + G.map.seed + '   Frame ' + G.frame, ix + 10, y0 + 44); }
    // command card
    const cr = this.cardRect(); ctx.fillStyle = '#12151a'; ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
    const btns = this.currentCard(); const p = G.players[G.human];
    for (const b of btns) { const bx = cr.x + 4 + (b.slot % this.CARD_COLS) * 66, by = cr.y + 4 + Math.floor(b.slot / this.CARD_COLS) * 52; const hov = this.mouse.x >= bx && this.mouse.x < bx + cr.bw && this.mouse.y >= by && this.mouse.y < by + cr.bh; const active = this.pending && ((this.pending.kind === 'ability' && b.label === (DATA.abilities[this.pending.abil] || {}).name) || (this.pending.kind !== 'ability' && b.label.toLowerCase().startsWith(this.pending.kind))); ctx.fillStyle = active ? '#3a5a3a' : hov ? '#38404c' : b.dim ? '#1c2026' : '#262c36'; ctx.fillRect(bx, by, cr.bw, cr.bh); ctx.strokeStyle = b.dim ? '#333' : '#556'; ctx.strokeRect(bx + .5, by + .5, cr.bw - 1, cr.bh - 1); ctx.fillStyle = b.dim ? '#666' : '#eee'; ctx.font = '10px sans-serif'; const words = b.label.split(' '); let ly = by + 14; let line = ''; for (const w of words) { if ((line + ' ' + w).trim().length > 11 && line) { ctx.fillText(line, bx + 3, ly); ly += 11; line = w; } else line = (line + ' ' + w).trim(); } ctx.fillText(line, bx + 3, ly); ctx.fillStyle = '#ff5'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(b.hk === 'Escape' ? 'Esc' : b.hk, bx + cr.bw - 14, by + cr.bh - 4); if (b.cost && b.cost.min !== undefined) { ctx.fillStyle = p.minerals >= b.cost.min ? '#5df' : '#f55'; ctx.font = '9px sans-serif'; ctx.fillText(b.cost.min, bx + 3, by + cr.bh - 4); if (b.cost.gas) { ctx.fillStyle = p.gas >= b.cost.gas ? '#6d5' : '#f55'; ctx.fillText(b.cost.gas, bx + 24, by + cr.bh - 4); } } if (b.energy) { ctx.fillStyle = '#c6f'; ctx.font = '9px sans-serif'; ctx.fillText(b.energy + 'e', bx + 3, by + cr.bh - 4); }
      if (hov && b.cost) { this.tooltip = { text: b.label + (b.cost.min !== undefined ? `  ${b.cost.min}m ${b.cost.gas ? b.cost.gas + 'g ' : ''}${b.cost.sup ? b.cost.sup + 's ' : ''}${b.cost.time ? Math.round(b.cost.time / TPS) + 's' : ''}` : ''), x: bx, y: by - 8 }; } }
    if (this.tooltip) { ctx.font = '11px sans-serif'; const tw = ctx.measureText(this.tooltip.text).width + 10; ctx.fillStyle = '#000c'; ctx.fillRect(this.tooltip.x - tw + 60, this.tooltip.y - 14, tw, 18); ctx.fillStyle = '#fff'; ctx.fillText(this.tooltip.text, this.tooltip.x - tw + 65, this.tooltip.y - 1); this.tooltip = null; }
  },
  drawUnitInfo(ctx, u, x, y, w, h) {
    const p = G.players[u.owner];
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    // portrait
    ctx.fillStyle = '#222a33'; ctx.fillRect(x + 8, y + 8, 64, 64); ctx.save(); ctx.translate(x + 40, y + 40); const sc = u.isBuilding ? Math.min(1, 56 / (u.def.w * TILE)) : Math.min(1.6, 24 / u.r); ctx.scale(sc, sc); if (u.isBuilding) { ctx.translate(-u.x, -u.y); Render.drawBuilding(ctx, u, u.x, u.y); } else { ctx.translate(-u.x, -u.y); u._x = u.x; u._y = u.y; u._alpha = 1; Render.drawUnit(ctx, u, u.x, u.y); } ctx.restore();
    ctx.fillStyle = p.color; ctx.font = 'bold 14px sans-serif'; ctx.fillText(u.def.name + (u.halluc ? ' (Hallucination)' : ''), x + 84, y + 22);
    ctx.fillStyle = '#ccc'; ctx.font = '12px sans-serif';
    let ly = y + 40; const line = t => { ctx.fillText(t, x + 84, ly); ly += 15; };
    line(`HP ${Math.ceil(u.hp)}/${u.maxHp}` + (u.maxSh ? `   Shields ${Math.ceil(u.sh)}/${u.maxSh}` : '') + (u.maxEnergy ? `   Energy ${Math.floor(u.energy)}/${u.maxEnergy}` : ''));
    if (!u.isBuilding || u.def.gw || u.def.aw) { const parts = []; const w = u.sieged ? SIEGE_W : u.def.gw; if (w) parts.push(`Ground ${u.wDmg(w)}${w.hits > 1 ? 'x' + w.hits : ''} (${w.type[0].toUpperCase()}) rng ${u.wRange(w)}`); if (u.def.aw) parts.push(`Air ${u.wDmg(u.def.aw)}${u.def.aw.hits > 1 ? 'x' + u.def.aw.hits : ''} rng ${u.wRange(u.def.aw)}`); parts.push(`Armor ${u.armor}`); if (u.kills) parts.push(`Kills ${u.kills}`); if (parts.length) line(parts.join('   ')); }
    if (u.owner === G.human) {
      const st = { idle: 'Idle', move: 'Moving', attack: 'Attacking', attackmove: 'Attack-moving', gather: u.order.phase === 'mine' ? 'Mining' : u.order.phase === 'inside' ? 'Harvesting gas' : 'Moving to resource', return: 'Returning cargo', build: 'Moving to build', construct: 'Constructing', hold: 'Holding position', patrol: 'Patrolling', ability: 'Casting ' + (u.order.abil ? DATA.abilities[u.order.abil].name : ''), repair: 'Repairing', follow: 'Following', load: 'Boarding', unload: 'Unloading', merge: 'Merging', land: 'Landing' }[u.order.type] || u.order.type;
      if (!u.isBuilding) line(st + (u.mines ? `   Mines ${u.mines}` : '') + (u.def.scarabs ? `   Scarabs ${u.scarabs}` : '') + (u.def.interceptors ? `   Interceptors ${u.interceptors}` : ''));
      if (u.isBuilding && u.def.larva) line(`Larvae ${u.larvae.length}` + (u.def.creep ? '' : ''));
      if (u.isBuilding && !u.done) line(`Constructing ${Math.floor(100 * u.progress / u.def.time)}%` + (u.def.race === 'T' && !(u.builder && u.builder.alive && u.builder.order.target === u) ? '  (no SCV)' : ''));
      if (u.isBuilding && u.addon) line(`Addon: ${u.addon.def.name}${u.addon.done ? '' : ' (building)'}`);
      // production queue
      if (u.prod.length) { const qx = x + 84, qy = ly + 2; u.prod.forEach((it, i) => { const name = it.kind === 'unit' ? DATA.units[it.id].name : it.kind === 'upg' ? DATA.upgrades[it.id].name + ' L' + it.level : it.kind === 'tech' ? DATA.techs[it.id].name : DATA.buildings[it.id].name; const bx = qx + i * 74; ctx.fillStyle = '#222a33'; ctx.fillRect(bx, qy, 70, 30); ctx.fillStyle = '#ddd'; ctx.font = '10px sans-serif'; ctx.fillText(name.slice(0, 13), bx + 3, qy + 12); if (i === 0) { ctx.fillStyle = '#000'; ctx.fillRect(bx + 3, qy + 18, 64, 8); ctx.fillStyle = '#3f3'; ctx.fillRect(bx + 3, qy + 18, 64 * it.progress / it.total, 8); } this.hotspots.push({ x: bx, y: qy, w: 70, h: 30, fn: () => G.cancelProd(u, i) }); }); ly += 36; }
      if (u.cargo.length) { u.cargo.forEach((c, i) => { const bx = x + 84 + i * 36, by = ly + 2; ctx.fillStyle = '#222a33'; ctx.fillRect(bx, by, 32, 24); ctx.fillStyle = '#ddd'; ctx.font = '9px sans-serif'; ctx.fillText(c.def.name.slice(0, 6), bx + 2, by + 15); this.hotspots.push({ x: bx, y: by, w: 32, h: 24, fn: () => { if (u.isBuilding) { const k = u.cargo.indexOf(c); if (k >= 0) { u.cargo.splice(k, 1); u.cargo.unshift(c); G.unloadOne(u); } } else G.unloadAll(u); } }); }); ly += 30; }
      if (u.def.upgA && !u.isBuilding) { const parts = []; if (p.upgLevel(u.def.upgA)) parts.push(`Armor +${p.upgLevel(u.def.upgA)}`); const w = u.def.gw || u.def.aw; if (w && w.upgKey && p.upgLevel(w.upgKey)) parts.push(`Weapons +${p.upgLevel(w.upgKey)}`); if (u.maxSh && p.upgLevel('shields')) parts.push(`Shields +${p.upgLevel('shields')}`); if (parts.length) { ctx.fillStyle = '#9ab'; line(parts.join('  ')); } }
    } else { line(p.name); }
    ctx.restore();
  },
  drawTop() {
    const ctx = Render.ctx, p = G.players[G.human]; ctx.font = 'bold 13px sans-serif';
    const txt = [['#5df', Math.floor(p.minerals)], ['#6d5', Math.floor(p.gas)], [p.supUsed > p.supMax ? '#f55' : '#eee', `${p.supUsed}/${p.supMax}`]];
    let x = Render.W - 20; ctx.textAlign = 'right';
    for (let i = txt.length - 1; i >= 0; i--) { ctx.fillStyle = '#000a'; const tw = ctx.measureText(txt[i][1]).width + 28; ctx.fillRect(x - tw, 6, tw, 22); ctx.fillStyle = txt[i][0]; ctx.fillText(txt[i][1], x - 6, 22); ctx.fillRect(x - tw + 6, 11, 12, 12); x -= tw + 8; }
    ctx.textAlign = 'left';
    const t = Math.floor(G.frame / TPS); ctx.fillStyle = '#000a'; ctx.fillRect(6, 6, 150, 22); ctx.fillStyle = '#eee'; ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}  ${RACE_INFO[p.race].name}` + (G.paused ? '  PAUSED' : ''), 12, 22);
    if (this.pending) { ctx.fillStyle = '#ff8'; ctx.fillText('Select target for ' + (this.pending.kind === 'ability' ? DATA.abilities[this.pending.abil].name : this.pending.kind) + ' (right-click to cancel)', 12, 44); }
    if (this.showHelp) this.drawHelp(ctx);
  },
  // Replay scrubber. The bar spans the whole recording; the filled part is where we are, and clicking
  // anywhere on it seeks (backwards means restarting and re-running, so it can take a moment on a long game).
  drawTimeline() {
    const ctx = Render.ctx, r = this.timelineRect(), total = this.replayLength(); if (!total) return;
    const f = clamp(G.frame / total, 0, 1);
    ctx.fillStyle = '#000a'; ctx.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    ctx.fillStyle = '#2c3340'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = this.seeking ? '#c8a23c' : '#4a7fb5'; ctx.fillRect(r.x, r.y, r.w * f, r.h);
    ctx.fillStyle = '#e6eaf0'; ctx.fillRect(r.x + r.w * f - 1, r.y - 3, 3, r.h + 6);
    const mm = t => Math.floor(t / TPS / 60) + ':' + String(Math.floor(t / TPS) % 60).padStart(2, '0');
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#9aa4b0';
    ctx.fillText(mm(G.frame) + ' / ' + mm(total) + (this.seeking ? '  seeking...' : ''), r.x, r.y + r.h + 13);
  },
  // Per-player production, resources and research, with the player being watched highlighted.
  drawProdOverlay() {
    const ctx = Render.ctx, rows = this.prodRows();
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], q = this.prodRowRect(i), p = row.p;
      ctx.fillStyle = p.id === G.human && !this.viewAll ? 'rgba(40,60,90,0.85)' : 'rgba(0,0,0,0.65)';
      ctx.fillRect(q.x, q.y, q.w, q.h);
      ctx.fillStyle = p.color; ctx.fillRect(q.x, q.y, 4, q.h);
      ctx.fillStyle = p.defeated ? '#777' : '#e6eaf0';
      ctx.fillText(p.name.slice(0, 9).padEnd(9) + ' ' + RACE_INFO[p.race].name[0] + '  ' + String(Math.floor(p.minerals)).padStart(4) + 'm ' + String(Math.floor(p.gas)).padStart(4) + 'g  ' + p.supUsed + '/' + p.supMax + '  w' + row.workers + ' a' + row.army, q.x + 8, q.y + 13);
      ctx.fillStyle = '#9aa4b0'; ctx.fillText(row.making, q.x + q.w + 8, q.y + 13);
    }
    ctx.fillStyle = '#7b869a'; ctx.fillText('[ ] switch player   O hide   Ctrl+V all vision   Shift+arrows skip 30 s', 10, 66 + rows.length * 20 + 12);
  },
  drawMessages() {
    const ctx = Render.ctx, p = G.players[G.human]; ctx.font = '13px sans-serif';
    let y = Render.H - this.consoleH - 12; for (let i = p.msgs.length - 1; i >= 0; i--) { const m = p.msgs[i]; const age = G.frame - m.t; if (age > 24 * 8) continue; ctx.fillStyle = m.kind === 'error' ? '#f77' : m.kind === 'attack' || m.kind === 'nuke' ? '#f55' : '#ff8'; ctx.globalAlpha = age > 24 * 6 ? 1 - (age - 144) / 48 : 1; ctx.fillText(m.text, 12, y); ctx.globalAlpha = 1; y -= 18; }
  },
  drawHelp(ctx) {
    const lines = ['CONTROLS', 'Left click / drag: select   Right click: smart command   Shift: queue / add to selection', 'Ctrl+click: select all of type on screen   Double-click: same', 'M move  S stop  A attack(-move)  P patrol  H hold   B build  V advanced build', 'Ctrl+1..9 assign group   1..9 select   Shift+# add   F2-F8 (+Shift) camera saves', 'Esc: cancel / cancel construction or last queue item   Space: jump to last alert', 'Arrow keys / screen edge: scroll   Minimap click: move, right-click: command', 'Tab: cycle selected kind   , idle worker   Ctrl+A select army   Backspace: centre on selection',
      '+ / -: game speed   F9: pause   F10: menu   Ctrl+M: mute   F1: toggle this help', 'Unit-specific hotkeys are shown on the command card (bottom right).'];
    ctx.fillStyle = '#000c'; ctx.fillRect(Render.W / 2 - 330, 60, 660, 20 * lines.length + 20); ctx.fillStyle = '#eee'; ctx.font = '13px sans-serif'; lines.forEach((l, i) => ctx.fillText(l, Render.W / 2 - 320, 84 + i * 20));
  },
  // ---------------- menus ----------------
  menuItems() {
    if (this.menu === 'brief' && G.mission) { const d = G.mission.def; return { title: d.title.toUpperCase(), lines: d.brief.concat(['', 'OBJECTIVE: ' + d.objective]), items: [['Begin mission', () => { this.menu = null; }]] }; }
    if (this.menu === 'waiting') return { title: 'WAITING FOR PLAYERS', lines: ['The game resumes when all players have caught up.'], items: [['Keep waiting', () => { this.menu = null; }], ['Leave game', () => { Net.disconnect(); this.toMenu(); }]] };
    if (this.net && Net.active && !Net.connected) return { title: 'CONNECTION LOST', lines: ['The relay connection dropped.', 'Reconnect from the main menu with the same name to rejoin this game.'], items: [['Keep watching', () => { this.menu = null; }], ['Return to main menu', () => this.toMenu()]] };
    if (this.menu === 'over') { const hp = G.players[G.human]; const won = G.mission ? G.winner === G.human : (G.winTeam != null ? G.winTeam === hp.team : G.winner === G.human); const mins = Math.max(1, G.frame / TPS / 60); const apm = Math.round(G.log.filter(e => e.c.p === G.human).length / mins); const lines = [`Time ${Math.floor(G.frame / TPS / 60)}:${String(Math.floor(G.frame / TPS) % 60).padStart(2, '0')}   APM ${apm}`]; if (G.mission) { lines.push('Objective: ' + G.mission.def.objective + (G.mission.done ? (won ? '  — complete' : '  — failed') : '')); if (G.mission.summary) lines.push(G.mission.summary); } lines.push(''); for (const q of G.players) { const s = q.stats; lines.push(`${q.name} (${RACE_INFO[q.race].name})  kills ${s.unitsKilled}/${s.buildingsKilled}  lost ${s.unitsLost}/${s.buildingsLost}  minerals ${s.mined}  gas ${s.gassed}${q.defeated ? '  ELIMINATED' : ''}`); } return { title: won ? 'VICTORY' : 'DEFEAT', lines, items: [['Continue playing', () => { this.menu = null; G.over = false; G.freePlay = true; }], ['Save replay', () => { Replay.saveReplay(); }], ['Return to main menu', () => this.toMenu()]] }; }
    if (this.mode === 'replay') return { title: 'REPLAY PAUSED', lines: ['Speed: ' + this.speedName(), 'Watching: ' + (this.viewAll ? 'everyone' : G.players[G.human].name), '', '[ and ] switch player, O production overlay', 'Shift+Left/Right skip 30 s, Home restarts, click the bar to seek'], items: [['Resume (Esc)', () => { this.menu = null; }], [(Sound.muted ? 'Sound: off' : 'Sound: on') + ' (Ctrl+M)', () => Sound.setMuted(!Sound.muted)], ['Toggle full map view (Ctrl+V)', () => { this.viewAll = !this.viewAll; this.menu = null; }], ['Next player (])', () => { this.cycleObserved(1); this.viewAll = false; this.menu = null; }], ['Toggle production overlay (O)', () => { this.prodOverlay = !this.prodOverlay; this.menu = null; }], ['Quit to menu', () => this.toMenu()]] };
    // Settings is its own screen rather than four more rows on the pause menu: the pause menu is where
    // you go to leave or to save, and mixing "quit to menu" in with "music off" made both harder to find.
    if (this.menu === 'settings') return { title: 'SETTINGS', lines: ['Audio starts muted on every load.'], items: [
      [(Sound.muted ? 'Sound: off' : 'Sound: on') + '  (Ctrl+M)', () => Sound.setMuted(!Sound.muted)],
      ['Voice: ' + (typeof Voice !== 'undefined' && Voice.on ? 'on' : 'off'), () => { if (typeof Voice !== 'undefined') Voice.set(!Voice.on); }],
      ['Music: ' + (typeof Music !== 'undefined' && Music.on ? 'on' : 'off'), () => { if (typeof Music !== 'undefined') Music.set(!Music.on); }],
      ['Hotkeys: ' + (this.gridKeys ? 'Grid' : 'Brood War'), () => { this.gridKeys = !this.gridKeys; try { localStorage.setItem('bw_hotkeys', this.gridKeys ? 'grid' : 'bw'); } catch (e) { } }],
      ['Back (Esc)', () => { this.menu = 'pause'; }],
    ] };
    return { title: 'PAUSED', lines: [], items: [['Resume (Esc)', () => { this.menu = null; }], ['Settings', () => { this.menu = 'settings'; }], ['Save game (F5)', () => { Replay.save(true); this.menu = null; }], ['Save replay', () => { Replay.saveReplay(); this.menu = null; }], ['Restart', () => { this.start(this.lastOpts); }], ['Quit to menu', () => this.toMenu()]] };
  },
  drawMenu() {
    const ctx = Render.ctx, m = this.menuItems(); const w = 420, h = 120 + m.lines.length * 22 + m.items.length * 44, x = Render.W / 2 - w / 2, y = Render.H / 2 - h / 2;
    ctx.fillStyle = '#000b'; ctx.fillRect(0, 0, Render.W, Render.H); ctx.fillStyle = '#1b1f26'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#556'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.title, Render.W / 2, y + 44);
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#ccc'; m.lines.forEach((l, i) => ctx.fillText(l, Render.W / 2, y + 76 + i * 22));
    this.menuRects = []; m.items.forEach((it, i) => { const by = y + 90 + m.lines.length * 22 + i * 44; const hov = this.mouse.x >= x + 60 && this.mouse.x < x + w - 60 && this.mouse.y >= by && this.mouse.y < by + 36; ctx.fillStyle = hov ? '#38404c' : '#262c36'; ctx.fillRect(x + 60, by, w - 120, 36); ctx.fillStyle = '#eee'; ctx.fillText(it[0], Render.W / 2, by + 24); this.menuRects.push({ x: x + 60, y: by, w: w - 120, h: 36, fn: it[1] }); });
    ctx.textAlign = 'left';
  },
  menuClick(x, y) { for (const r of this.menuRects || []) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { r.fn(); return; } },
  // The codex, opened from the main menu where there is no game. Two things stand in the way and both
  // are invisible from the button's side. UI.loop returns early unless `running`, and `running` only
  // becomes true when a match starts -- so before the first game nothing would ever call Codex.draw.
  // And #menu is `position:absolute; inset:0`, so leaving it displayed paints a full-screen gradient
  // over the canvas the codex draws on.
  //
  // Drawn from inside UI.loop rather than from a private requestAnimationFrame chain of its own. The
  // first version did have its own loop and it works, but it means the app has two rAF chains that
  // must agree about who owns the canvas, and the codex's one has to be started, stopped and not
  // leaked. UI.loop already self-schedules forever -- it re-requests before it checks `running` -- so
  // there is exactly one chain, and menuCodex is a branch in it taken ahead of the `running` gate.
  openCodexFromMenu() {
    if (typeof Codex === 'undefined') return;
    document.getElementById('menu').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    Render.resize(); Codex.open(); this.menuCodex = true;
    if (!this._loop) { this._loop = t => this.loop(t); requestAnimationFrame(this._loop); }   // no game has run yet, so the chain does not exist
  },
<<<<<<< HEAD
  // One frame of the menu codex. Render.frame is deliberately not called: it reads a G that does not
  // exist yet. Closing the codex is what puts the menu back, so Escape, F3 and the panel's own close
  // button all work without any of them knowing this mode exists.
  drawMenuCodex() {
    if (!Codex.isOpen()) {
      this.menuCodex = false;
      document.getElementById('game').style.display = 'none';
      document.getElementById('menu').style.display = 'flex';
      return;
    }
    const c = Render.ctx; c.setTransform(Render.dpr, 0, 0, Render.dpr, 0, 0);
    c.fillStyle = '#05070a'; c.fillRect(0, 0, Render.W, Render.H);
    Codex.draw(c);
  },
  toMenu() { this.running = false; this.menuCodex = false; this.menu = null; this.loading = null; if (this.refreshMapList) this.refreshMapList(); if (typeof Net !== 'undefined' && Net.active) Net.disconnect(); if (typeof Music !== 'undefined') Music.stop(); document.getElementById('menu').style.display = 'flex'; document.getElementById('game').style.display = 'none'; const ab = document.getElementById('autosaveBtn'); if (ab) ab.style.display = Replay.hasAutosave() ? 'block' : 'none'; },
=======
  toMenu() { this.running = false; this.menu = null; this.loading = null; if (this.refreshMapList) this.refreshMapList(); if (typeof Net !== 'undefined' && Net.active) Net.disconnect(); if (typeof Music !== 'undefined') Music.stop(); if (this.showPanel) this.showPanel('mainPanel'); document.getElementById('menu').style.display = 'flex'; document.getElementById('game').style.display = 'none'; const ab = document.getElementById('autosaveBtn'); if (ab) ab.style.display = Replay.hasAutosave() ? 'block' : 'none'; },

  // ==========================================================================
  // Skirmish setup (M11 wave two, item 22)
  // ==========================================================================
  // A milestone of gameplay had shipped that the player could not reach. Four map sizes that are
  // different RULES, four AI play styles, four procedural archetypes, weather of two kinds, the
  // per-map toggles for derelicts and wildlife -- all of it tested, all of it in the tables, and the
  // menu offered race, opponent count and map. This is the surface for it.
  //
  // THE SHAPE, AND WHY IT IS THIS SHAPE. The screen is a form; a form is DOM; DOM cannot be tested in
  // node without a browser or a fake one. So the screen is split in two, and the seam is a plain
  // object:
  //
  //     the DOM  --readSetup()-->  a settings object  --skirmishOptions()-->  G.init options
  //                                (plain, inert)        (pure, no DOM)
  //
  // Everything that can be wrong -- a setting that does not reach the sim, a default that is not
  // today's default, a preset name nothing resolves, a seed that does not round-trip -- is wrong in
  // the RIGHT half, which test/skirmish.js exercises directly with no document at all. The left half
  // is reading `.value` off a select, and the one bug it can still have (a control id in the wiring
  // that does not exist in index.html) is caught by parsing index.html as text.
  //
  // WHY THE OUTPUT IS ONLY { players, seed, layout }, AND NOTHING ELSE.
  // That object is what a replay and a network join reproduce. js/commands.js's `Replay.data()` saves
  // `seed`, `layout`, `G.setup.players`, `human` and `mission` -- and NOTHING ELSE -- and
  // UI.startFromLog hands exactly those back to UI.start. So a top-level option of my own invention
  // (`opts.hazard`, say) would work perfectly until the moment somebody saved the game, and then the
  // reload would silently be a different match. There are therefore exactly two places a setting is
  // allowed to live, and every control on this screen goes to one of them:
  //
  //   * PER PLAYER   -- race, difficulty, play style, team, starting bank. These ride on the
  //                     players[] entries, which round-trip verbatim.
  //   * IN THE MAP   -- size, archetype, weather, destructibles, derelicts, wildlife. These are
  //                     properties of the LAYOUT, which is named by one string, and that string
  //                     round-trips.
  //
  // The map half is the interesting one, and the answer is stolen wholesale from `Archetypes.id()`:
  // MAKE THE ID DESCRIBE THE MAP. "arch:islands:97:large" is already a layout id that two clients can
  // each turn into the same ground without shipping the ground, and this does the same one level up:
  //
  //     sk:<comma-separated overrides>:<any other layout id>
  //     sk:hz=sandstorm,dn=1,dr=standard:arch:islands:97:large
  //
  // `skirmishLayout()` turns that back into a layout object, purely, from constants every client has.
  // `UI.start` registers the result into MAP_LAYOUTS before G.init, which is what js/editor.js already
  // does for '__preview' and for every 'custom:' map. Registering after load means js/build.js does not
  // hash it -- and that is FINE HERE, exactly as it is fine for 'arch:', because the id is the whole
  // description: two clients on the same build cannot read the same id and build different ground. It
  // would NOT be fine for a custom editor map, whose tiles live only in one browser's localStorage,
  // and that hole is pre-existing and not this screen's to close.
  //
  // WHY AN UNCHANGED SCREEN MUST PRODUCE A BYTE-IDENTICAL OPTIONS OBJECT. Every balance figure in
  // HANDOFF.md was measured against the default AI, and 'standard' is a zero delta chosen so those
  // numbers stay true. If this screen wrote `style: 'standard'` and `minerals: 50` into every game, the
  // options object would differ from today's for no reason, replays would differ in the bytes they
  // save, and the next person to diff two saves would be chasing a ghost. So every field is OMITTED
  // when it is the default, and `skirmishLayoutId` returns the bare base id when nothing is overridden.
  // test/skirmish.js asserts that against a hard-coded copy of what the old menu produced.
  //
  // ROADS NOT TAKEN:
  //   * a `derelicts` key on the options object, resolved in G.init -- the honest place for it, and it
  //     does not survive Replay.data(). Rejected for that alone.
  //   * a second seed for the map, separate from the game seed. Two seeds is two things to write down
  //     to reproduce a match, and the whole point of the field is that one number is enough.
  //   * offering to ADD destructibles to a hand-written map. Placement is the generator's job -- it has
  //     `repairConnectivity` and a mirror to honour -- so the terrain control only takes them AWAY,
  //     which can never strand a player: js/map.js floods the map with every feature forced shut and
  //     carves a corridor to any base it cannot reach, so a map that is legal with them all shut is
  //     legal with them all absent.
  //   * a supply-cap control. SUPPLY_CAP is a const in js/game.js clamped into `p.supMax` every tick by
  //     G.recomputeSupply, so nothing outside that file can move it. It is reported in the summary
  //     instead, because a player should at least know what it is.

  // The settings object that reproduces the old menu exactly: Terran, one Random normal opponent on
  // team 2, Lost Ruins, seed 1, and 'as the map defines' for every map property. 'map' rather than
  // 'none' is deliberate -- no shipping layout declares derelicts or wildlife today, so the two read
  // the same now, but they stop reading the same the moment a map does, and 'as the map defines' is
  // the answer that stays right.
  setupDefaults() {
    return {
      race: 'T', team: 1, seed: 1, map: 'temple', size: 'auto', bank: 'standard',
      hazard: 'map', night: 'map', features: 'map', derelicts: 'map', wildlife: 'map',
      opponents: [{ race: 'R', difficulty: 'normal', style: 'standard', team: 2 }],
    };
  },
  SETUP_DIFFS: [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']],
  // Labels only. The KEYS come from AI.prototype.styleDeltas() so a fifth style appears in the menu the
  // day it appears in the table, and an unlabelled one falls back to its own id rather than vanishing.
  SETUP_STYLE_NAMES: {
    standard: 'Standard', turtle: 'Turtle', rusher: 'Rusher', expander: 'Expander', harasser: 'Harasser',
  },
  SETUP_STYLE_BLURB: {
    standard: 'the base build order, unchanged',
    turtle: 'static defence early, a bigger army before it commits, expands late',
    rusher: 'production before tech, minimal upgrades, attacks early',
    expander: 'more bases sooner and the workers to fill them',
    harasser: 'small waves often, mobile units, twice as many drops',
  },
  // Starting banks. There is nothing in the sim to derive these from -- Player's constructor hard-codes
  // 50 and 0 -- so this is a UI table, and 'standard' has to be exactly those two numbers.
  SETUP_BANKS: [
    ['standard', 'Standard  (50 minerals)', 50, 0],
    ['fast', 'Fast  (400 / 100)', 400, 100],
    ['rich', 'Rich  (1500 / 700)', 1500, 700],
  ],
  // [key, label, what it actually does]. The third entry is the option's tooltip: "Turtle" and
  // "Harasser" are evocative and say nothing, and a player choosing between five words with no idea
  // what any of them changes is not being offered a choice.
  setupStyles() {
    let keys = ['standard'];
    try { if (typeof AI !== 'undefined' && AI.prototype.styleDeltas) keys = Object.keys(AI.prototype.styleDeltas()); } catch (e) { }
    return keys.map(k => [k, this.SETUP_STYLE_NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1)), this.SETUP_STYLE_BLURB[k] || '']);
  },
  setupBank(key) { return this.SETUP_BANKS.find(b => b[0] === key) || this.SETUP_BANKS[0]; },
  // The preset names for a per-map toggle, straight out of DATA. Absent tables are the normal case in a
  // worktree where the neutral sim half has not landed yet, so this returns [] and the caller offers
  // nothing rather than throwing.
  setupPresets(which) {
    try {
      const t = typeof DATA !== 'undefined' && DATA[which === 'wildlife' ? 'wildlifePresets' : 'derelictPresets'];
      return t ? Object.keys(t) : [];
    } catch (e) { return []; }
  },

  // The base layout id a settings object names, before any override is layered on. Three kinds:
  // 'gen:<archetype>' is generated from the seed, anything else is a MAP_LAYOUTS key or an 'arch:' id
  // handed through untouched. An archetype nothing recognises falls back to the default map rather than
  // throwing -- Archetypes.layout() does throw on an unknown key, and a stale saved setting must not be
  // able to take the menu down.
  skirmishBaseId(s) {
    const m = String((s && s.map) || 'temple');
    if (m.slice(0, 4) !== 'gen:') return m;
    const key = m.slice(4);
    if (typeof Archetypes === 'undefined' || !Archetypes.keys.includes(key)) return 'temple';
    const seed = this.skirmishSeed(s);
    const size = (typeof MAP_SIZES !== 'undefined' && MAP_SIZES[s && s.size]) ? s.size : null;
    return Archetypes.id(key, seed, size);
  },
  skirmishSeed(s) { const n = parseInt(s && s.seed, 10); return (isFinite(n) && n) ? (n >>> 0) || 1 : 1; },

  // The layout id for a whole settings object: the base, plus the overrides that differ from the map's
  // own answer. Order is fixed so the same settings always produce the same string -- ids get compared.
  skirmishLayoutId(s) {
    s = s || {}; const base = this.skirmishBaseId(s), o = [];
    if (s.hazard && s.hazard !== 'map') o.push('hz=' + (s.hazard === 'none' ? '0' : s.hazard));
    if (s.night && s.night !== 'map') o.push('dn=' + (s.night === 'on' ? '1' : '0'));
    if (s.features === 'none') o.push('ft=0');
    if (s.derelicts && s.derelicts !== 'map') o.push('dr=' + (s.derelicts === 'none' ? '0' : s.derelicts));
    if (s.wildlife && s.wildlife !== 'map') o.push('wl=' + (s.wildlife === 'none' ? '0' : s.wildlife));
    return o.length ? 'sk:' + o.join(',') + ':' + base : base;
  },
  // The inverse: a composed id back into a layout object, purely. Everything it needs is a constant
  // every client holds, which is what makes the id sufficient to ship instead of the map.
  //
  // The clone is not politeness either. MAP_LAYOUTS entries and the Archetypes cache are SHARED objects
  // that GameMap reads on every generation, so writing `L.hazard` onto one of them would put a
  // sandstorm on Lost Ruins for the rest of the session, including for the next replay loaded.
  skirmishLayout(id) {
    const str = String(id || '');
    if (str.slice(0, 3) !== 'sk:') return null;
    const c2 = str.indexOf(':', 3); if (c2 < 0) return null;
    const overrides = str.slice(3, c2), baseId = str.slice(c2 + 1);
    if (typeof MAP_LAYOUTS === 'undefined') return null;
    const base = (typeof Archetypes !== 'undefined' && Archetypes.resolve(baseId)) || MAP_LAYOUTS[baseId] || MAP_LAYOUTS.temple;
    if (!base) return null;
    let L; try { L = JSON.parse(JSON.stringify(base)); } catch (e) { return null; }
    const tags = [];
    for (const part of overrides.split(',')) {
      const eq = part.indexOf('='); if (eq < 0) continue;
      const k = part.slice(0, eq), v = part.slice(eq + 1);
      if (k === 'hz') {
        // A hazard on the layout is the OBJECT HAZARDS builds, not its name -- js/map.js copies it
        // straight onto the map. The span it is fed is the map's own width, which is what
        // MapModes.layout does; a band sized for a 128 map on a 256 one is a quarter of the front it
        // should be, and it is the sort of thing that reads as "the storm feels weak" forever.
        if (v === '0') { delete L.hazard; tags.push('no storm'); }
        else if (typeof HAZARDS !== 'undefined' && typeof HAZARDS[v] === 'function') { L.hazard = HAZARDS[v](L.w || 128); tags.push(v); }
      } else if (k === 'dn') {
        if (v === '1') { L.dayNight = true; tags.push('day/night'); } else { delete L.dayNight; tags.push('daylight'); }
      } else if (k === 'ft') {
        if (v === '0' && L.features && L.features.length) { L.features = []; tags.push('no destructibles'); }
      } else if (k === 'dr' || k === 'wl') {
        const field = k === 'dr' ? 'derelicts' : 'wildlife';
        if (v === '0') delete L[field];
        else { L[field] = v; tags.push(v + ' ' + field); }
      }
    }
    // The name is what the player sees in the pause menu and the replay list, so it says what was done
    // to the map rather than repeating the base map's name and lying about it.
    L.name = (base.name || baseId) + (tags.length ? ' (' + tags.join(', ') + ')' : '');
    return L;
  },
  // Idempotent, and a no-op for every id that is not composed -- which is every id the game had before
  // this screen existed. Called from UI.start, so it runs on the quick start, on a replay loaded in a
  // fresh page, and on Restart from the pause menu, all through the one funnel.
  registerSkirmishLayout(id) {
    if (typeof MAP_LAYOUTS === 'undefined' || typeof id !== 'string' || id.slice(0, 3) !== 'sk:') return null;
    if (MAP_LAYOUTS[id]) return MAP_LAYOUTS[id];
    const L = this.skirmishLayout(id);
    if (L) MAP_LAYOUTS[id] = L;      // and if it did not compose, layoutDef() falls back to Lost Ruins
    return L || null;
  },

  // THE function this screen exists to produce. Pure: a settings object in, the G.init options out, no
  // DOM, no globals written, no clock. test/skirmish.js calls it directly.
  skirmishOptions(s) {
    const d = this.setupDefaults(); s = s || {};
    const pick = k => (s[k] === undefined || s[k] === null || s[k] === '' ? d[k] : s[k]);
    const bank = this.setupBank(pick('bank'));
    // Written onto every player rather than once at the top level, because per-player is the only
    // shape that survives Replay.data(). It also happens to be the shape a handicap wants, which is
    // where the next version of this control goes.
    const purse = p => { if (bank[2] !== 50) p.minerals = bank[2]; if (bank[3] !== 0) p.gas = bank[3]; return p; };
    const players = [purse({ race: String(pick('race')), human: true, name: 'Player', team: parseInt(pick('team'), 10) || 1 })];
    const opps = Array.isArray(s.opponents) ? s.opponents : d.opponents;
    opps.forEach((o, i) => {
      o = o || {};
      const p = { race: String(o.race || 'R'), human: false, difficulty: String(o.difficulty || 'normal'), name: 'Computer ' + (i + 1), team: parseInt(o.team, 10) || (i + 2) };
      // 'standard' is the zero delta and is what AI's constructor falls back to, so leaving the key off
      // keeps a default game's options byte-identical to the ones the old menu produced.
      if (o.style && o.style !== 'standard') p.style = String(o.style);
      players.push(purse(p));
    });
    return { players, seed: this.skirmishSeed(s), layout: this.skirmishLayoutId(s) };
  },

  // What the chosen settings actually resolve to, along the same path GameMap.layoutDef will take.
  // One resolution, used by the summary, by the opponent cap and by the size control's enabled state,
  // so the three cannot disagree about what map is selected.
  setupMapInfo(s) {
    const id = this.skirmishLayoutId(s || {});
    let L = null;
    try {
      L = (id.slice(0, 3) === 'sk:' ? this.skirmishLayout(id) : null)
        || (typeof Archetypes !== 'undefined' && Archetypes.resolve(id))
        || (typeof MAP_LAYOUTS !== 'undefined' ? MAP_LAYOUTS[id] : null) || null;
    } catch (e) { L = null; }
    return {
      id, layout: L, ok: !!L,
      name: (L && L.name) || id, w: (L && L.w) || 128, h: (L && L.h) || 128,
      players: (L && L.players) || 4, bases: (L && L.bases) ? L.bases.length : 0,
      size: (L && L.size) || null, archetype: (L && L.archetype) || null, tileset: (L && L.tileset) || null,
      hazard: !!(L && L.hazard), night: !!(L && L.dayNight),
      features: (L && L.features) ? L.features.length : 0,
      // The KINDS, not the count. L.features is a list of quadrant-0 definitions that GameMap mirrors
      // four ways, so "2 destructibles" on a map with eight of them on the ground is a small lie that
      // a player would notice; the kinds are what they actually want to know anyway.
      featureKinds: (L && L.features || []).map(f => f.kind).filter((k, i, a) => a.indexOf(k) === i)
        .map(k => (typeof MAP_FEATURES !== 'undefined' && MAP_FEATURES[k] ? MAP_FEATURES[k].name : k)),
      derelicts: (L && L.derelicts) || null, wildlife: (L && L.wildlife) || null,
    };
  },
  setupMaxOpponents(s) { return Math.max(1, Math.min(3, this.setupMapInfo(s).players - 1)); },

  // The sentence under the form. Three lines, and each one answers a question a player actually has:
  // who am I playing, what am I playing it on, and what are the rules. It is plain text rather than
  // markup so it can be asserted in node, and it never says "default" -- a summary whose job is to say
  // what you are about to play cannot answer with the name of a setting.
  skirmishSummary(s) {
    const d = this.setupDefaults(); s = Object.assign({}, d, s || {});
    const opts = this.skirmishOptions(s), m = this.setupMapInfo(s);
    const race = r => (typeof RACE_INFO !== 'undefined' && RACE_INFO[r] ? RACE_INFO[r].name : r === 'R' ? 'Random' : r);
    const styleName = k => this.SETUP_STYLE_NAMES[k] || k;
    const me = opts.players[0], foes = opts.players.slice(1);
    const teams = new Set(opts.players.map(p => p.team));
    const l1 = race(me.race) + ' on team ' + me.team + ' against ' + foes.length + ' opponent' + (foes.length === 1 ? '' : 's') + ': '
      + foes.map(p => race(p.race) + ', ' + p.difficulty + ', ' + styleName(p.style || 'standard') + ', team ' + p.team).join('; ')
      + (teams.size === 2 && opts.players.length > 2 ? '  (two teams)' : '') + '.';
    const bits = [m.w + 'x' + m.h, m.players + ' starts', m.bases ? m.bases + ' bases a player' : null];
    if (m.archetype) bits.push('procedural');
    if (m.hazard) bits.push('sandstorm');
    if (m.night) bits.push('day/night cycle');
    if (m.featureKinds.length) bits.push('destructible ' + m.featureKinds.map(k => k.toLowerCase() + 's').join(' and '));
    if (m.derelicts) bits.push('derelicts: ' + m.derelicts);
    if (m.wildlife) bits.push('wildlife: ' + m.wildlife);
    const l2 = m.name + ' -- ' + bits.filter(Boolean).join(', ') + '.';
    const bank = this.setupBank(s.bank);
    const l3 = 'Start with ' + bank[2] + ' minerals' + (bank[3] ? ' and ' + bank[3] + ' gas' : '') + '. '
      + 'Supply cap ' + (typeof SUPPLY_CAP !== 'undefined' ? SUPPLY_CAP : 200) + '. Seed ' + opts.seed + '.';
    return l1 + '\n' + l2 + '\n' + l3;
  },

  // Starting resources, applied straight after G.init. It belongs in G.init beside the Player
  // construction and it is one line there -- `if (po.minerals != null) p.minerals = po.minerals;` --
  // but js/game.js is not this change's to edit, so it is done here instead, through the same options
  // object and before a single tick has run. It is therefore still deterministic and it still
  // round-trips: UI.start is the one funnel every entry point uses (quick start, the setup screen,
  // Restart, a loaded save, a watched replay, the map editor's test game), and Replay.data() saves
  // G.setup.players verbatim. The one gap is a LAN game, because js/net.js rebuilds the players array
  // from the relay's lobby with five fields and drops anything else -- and the network lobby has no
  // control for this, so a LAN game correctly gets the standard bank.
  applyStartingBank(opts) {
    if (typeof G === 'undefined' || !G.players || !opts || !Array.isArray(opts.players)) return;
    opts.players.forEach((po, i) => {
      const p = G.players[i]; if (!p || !po) return;
      if (typeof po.minerals === 'number' && isFinite(po.minerals)) p.minerals = Math.max(0, Math.round(po.minerals));
      if (typeof po.gas === 'number' && isFinite(po.gas)) p.gas = Math.max(0, Math.round(po.gas));
    });
  },
>>>>>>> worktree-agent-a400bd22010d4b08f
};

// ---------------- boot ----------------
window.addEventListener('DOMContentLoaded', () => {
  UI.init();
  const $ = id => document.getElementById(id);
  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const el = (tag, props) => Object.assign(document.createElement(tag), props);
  // Every select on the skirmish screen is filled from the sim's own tables rather than written out in
  // index.html. That is the same decision the map dropdown already made and for the same reason: the
  // four size modes and the hazard map appeared in the menu the day they were added, with nobody
  // remembering to add an <option>, and a fifth AI style will do the same.
  const fill = (id, items, value) => {
    const sel = $(id); if (!sel) return null;
    sel.innerHTML = '';
    for (const [v, t] of items) sel.appendChild(el('option', { value: v, textContent: t }));
    if (value != null) sel.value = value;
    return sel;
  };

  // ---- panels -------------------------------------------------------------
  // Id-based, not `previousElementSibling`. The settings panel found the main panel by walking one
  // element back, which was true when there were two panels and quietly wrong the moment there were
  // three -- the kind of breakage that shows up as "SETTINGS hides the wrong screen" and is invisible
  // in a diff. Everything with class .panel inside #menu is now a page, and exactly one is shown.
  UI.showPanel = id => {
    const menu = $('menu'); if (!menu || !menu.querySelectorAll) return;
    for (const p of menu.querySelectorAll('.panel')) p.style.display = p.id === id ? '' : 'none';
  };
  const sb = $('settingsBtn'); if (sb) sb.addEventListener('click', () => UI.showPanel('settingsPanel'));
  const sbk = $('settingsBack'); if (sbk) sbk.addEventListener('click', () => UI.showPanel('mainPanel'));

  // ---- the skirmish form --------------------------------------------------
  const oppRows = $('opps');
  const readOpponents = () => [...document.querySelectorAll('#opps .oprow')].map((r, i) => ({
    race: (r.querySelector('.orace') || {}).value || 'R',
    difficulty: (r.querySelector('.odiff') || {}).value || 'normal',
    style: (r.querySelector('.ostyle') || {}).value || 'standard',
    team: parseInt((r.querySelector('.oteam') || {}).value, 10) || (i + 2),
  }));
  // Rebuilt rather than added to, because the row count comes from a select. It reads the existing
  // rows first: setting three opponents up and then changing the count to 2 used to reset all of them
  // to Random/Normal, which with four controls a row instead of three is now genuinely annoying.
  const rebuildOpps = () => {
    if (!oppRows) return;
    const n = parseInt(($('nopp') || { value: '1' }).value, 10) || 1, prev = readOpponents(), styles = UI.setupStyles();
    const sel = (cls, items, chosen, title) => `<select class="${cls}"${title ? ' title="' + title + '"' : ''}>`
      + items.map(([v, t, tip]) => `<option value="${v}"${tip ? ' title="' + tip + '"' : ''}${String(v) === String(chosen) ? ' selected' : ''}>${t}</option>`).join('') + '</select>';
    let h = '';
    for (let i = 0; i < n; i++) {
      const p = prev[i] || { race: 'R', difficulty: 'normal', style: 'standard', team: i + 2 };
      h += `<div class="row oprow"><label>Opponent ${i + 1}</label>`
        + sel('orace', [['R', 'Random'], ['T', 'Terran'], ['Z', 'Zerg'], ['P', 'Protoss']], p.race, 'Race')
        + sel('odiff', UI.SETUP_DIFFS, p.difficulty, 'Difficulty')
        + sel('ostyle', styles, p.style, 'Play style -- how it opens, what it builds and when it attacks')
        + sel('oteam', [1, 2, 3, 4].map(t => [t, 'Team ' + t]), p.team, 'Team')
        + '</div>';
    }
    oppRows.innerHTML = h;
  };

  const sizeKeys = (typeof MapModes !== 'undefined' && MapModes.keys) ? MapModes.keys.slice() : [];
  const buildLayoutList = () => {
    const sel = $('layout'); if (!sel || typeof MAP_LAYOUTS === 'undefined') return;
    const keep = sel.value; sel.innerHTML = '';
    const group = label => { const g = el('optgroup', { label }); sel.appendChild(g); return g; };
    const add = (g, value, textContent) => g.appendChild(el('option', { value, textContent }));
    const fixed = group('Fixed maps'), custom = [];
    for (const [id, L] of Object.entries(MAP_LAYOUTS)) {
      // '__preview' is the editor's scratch entry and 'sk:' entries are compositions registered by
      // UI.start; neither is a map anybody chose, and both would otherwise appear in this list.
      if (!L || id === '__preview' || id.slice(0, 3) === 'sk:' || sizeKeys.includes(id)) continue;
      if (L.custom) { custom.push([id, L]); continue; }
      add(fixed, id, (L.name || id) + (L.players ? ' (' + L.players + ' players)' : '') + (L.archetype ? ' -- fixed sample' : ''));
    }
    if (sizeKeys.length) {
      const g = group('Map sizes -- four different sets of rules');
      for (const k of sizeKeys) { const L = MAP_LAYOUTS[k]; if (L) add(g, k, (L.name || k) + '  ' + L.w + 'x' + L.h + ', ' + L.players + ' players, ' + (L.bases || []).length + ' bases each'); }
    }
    if (typeof Archetypes !== 'undefined') {
      const g = group('Procedural -- a new map from the seed');
      for (const k of Archetypes.keys) add(g, 'gen:' + k, Archetypes.names[k] || cap(k));
    }
    if (custom.length) { const g = group('Made in the editor'); for (const [id, L] of custom) add(g, id, (L.name || id.slice(7)) + ' (custom)'); }
    if (keep) sel.value = keep;
    if (!sel.value) sel.value = 'temple';
  };

  const val = (id, dflt) => { const e = $(id); return e && e.value !== '' && e.value != null ? e.value : dflt; };
  // The seam. Everything above this line is DOM; everything below it is a plain object that
  // UI.skirmishOptions turns into a game, and that test/skirmish.js can build by hand.
  const readSetup = () => {
    const opps = readOpponents();
    return {
      race: val('race', 'T'), team: parseInt(val('team', '1'), 10) || 1, seed: parseInt(val('seed', '1'), 10) || 1,
      map: val('layout', 'temple'), size: val('mapSize', 'auto'), bank: val('optStart', 'standard'),
      hazard: val('optHazard', 'map'), night: val('optNight', 'map'), features: val('optFeatures', 'map'),
      derelicts: val('optDerelicts', 'map'), wildlife: val('optWildlife', 'map'),
      opponents: opps.length ? opps : undefined,     // undefined, not [], so the defaults fill it in
    };
  };
  UI.readSetup = readSetup;

  const refreshSetup = () => {
    // Size only means something for a procedural map: every other entry in the list already IS a size,
    // either because it is one of the four modes or because the layout says how big it is.
    const lay = $('layout'), ms = $('mapSize');
    const gen = lay ? String(lay.value || '').slice(0, 4) === 'gen:' : false;
    if (ms) { ms.disabled = !gen; if (!gen) ms.value = 'auto'; }
    let s = readSetup();
    // G.init hands out start locations with `starts[i % starts.length]`, so more players than the map
    // has starts is two armies in one main rather than an error. Cap instead.
    const no = $('nopp'), maxOpp = UI.setupMaxOpponents(s);
    if (no) {
      for (const o of no.options) o.disabled = parseInt(o.value, 10) > maxOpp;
      if ((parseInt(no.value, 10) || 1) > maxOpp) { no.value = String(maxOpp); rebuildOpps(); s = readSetup(); }
    }
    const text = UI.skirmishSummary(s);
    const a = $('setupSummary'); if (a) a.textContent = text;
    const b = $('menuSummary'); if (b) b.textContent = text;
  };
  UI.refreshSetup = refreshSetup;

  fill('mapSize', [['auto', 'As the map defines']].concat(sizeKeys.map(k => [k, (MAP_SIZES[k].name || k) + '  ' + MAP_SIZES[k].w + 'x' + MAP_SIZES[k].h])), 'auto');
  const hazKeys = typeof HAZARDS !== 'undefined' ? Object.keys(HAZARDS) : [];
  fill('optHazard', [['map', 'Weather: as the map defines'], ['none', 'Weather: clear']].concat(hazKeys.map(k => [k, 'Weather: ' + cap(k)])), 'map');
  fill('optNight', [['map', 'Light: as the map defines'], ['on', 'Light: day and night'], ['off', 'Light: permanent day']], 'map');
  fill('optFeatures', [['map', 'Destructibles: as the map defines'], ['none', 'Destructibles: none']], 'map');
  // Both lists come from DATA, and both are empty in a build where the neutral tables have not landed.
  // An empty list leaves only 'as the map defines' and 'none', which are the same thing on every map
  // that ships today -- so the screen degrades to telling the truth rather than to throwing.
  const derPresets = UI.setupPresets('derelict'), wildPresets = UI.setupPresets('wildlife');
  fill('optDerelicts', [['map', 'As the map defines'], ['none', 'None']].concat(derPresets.map(k => [k, cap(k)])), 'map');
  fill('optWildlife', [['map', 'As the map defines'], ['none', 'None']].concat(wildPresets.map(k => [k, cap(k)])), 'map');
  fill('optStart', UI.SETUP_BANKS.map(b => [b[0], b[1]]), 'standard');
  const nn = $('neutralNote');
  if (nn) nn.textContent = (derPresets.length || wildPresets.length)
    ? 'Capturable derelicts and buried wildlife are properties of the map, like the weather, so they travel in the layout the seed names. Placement is still landing on the simulation side; the choice is carried either way.'
    : 'This build carries no derelict or wildlife presets, so there are none to place.';

  buildLayoutList();
  rebuildOpps();

  const panel = $('skirmishPanel');
  if (panel) {
    const onChange = e => { if (e.target && e.target.id === 'nopp') rebuildOpps(); refreshSetup(); };
    panel.addEventListener('change', onChange); panel.addEventListener('input', onChange);
  }
  const sr = $('seedRoll'); if (sr) sr.addEventListener('click', () => { const e = $('seed'); if (e) { e.value = String(1 + Math.floor(Math.random() * 999999)); refreshSetup(); } });
  const setupBtn = $('setupBtn'); if (setupBtn) setupBtn.addEventListener('click', () => { refreshSetup(); UI.showPanel('skirmishPanel'); });
  const setupBack = $('setupBack'); if (setupBack) setupBack.addEventListener('click', () => UI.showPanel('mainPanel'));
  // One start, two buttons. The main menu's START and the setup screen's START are the same click on
  // the same settings -- if they could ever disagree, the summary on the main menu would be a lie.
  const startSkirmish = () => UI.start(UI.skirmishOptions(readSetup()));
  const startBtn = $('start'); if (startBtn) startBtn.addEventListener('click', startSkirmish);
  const setupStart = $('setupStart'); if (setupStart) setupStart.addEventListener('click', startSkirmish);

  // ---- everything else on the main menu, unchanged ------------------------
  const ms = $('mission'); if (ms) { for (const m of Missions.list) { const o = document.createElement('option'); o.value = m.id; o.textContent = `${RACE_INFO[m.race].name}: ${m.title}`; ms.appendChild(o); } $('missionBtn').addEventListener('click', () => { const m = Missions.get(ms.value); if (!m) return; UI.start({ players: [{ race: m.race, human: true, name: 'Player', team: 1 }, { race: m.enemy.race, human: false, difficulty: m.enemy.difficulty, name: 'Enemy', team: 2 }], seed: m.seed, layout: m.layout, mission: m.id }); }); }
  const hk = $('hotkeys'); if (hk) { try { hk.value = localStorage.getItem('bw_hotkeys') || 'bw'; } catch (e) { } UI.gridKeys = hk.value === 'grid'; hk.addEventListener('change', () => { UI.gridKeys = hk.value === 'grid'; try { localStorage.setItem('bw_hotkeys', hk.value); } catch (e) { } }); }
  // The codex opens with no game running -- it reads DATA, not G -- so it belongs on the main menu
  // as well as on F3 in game. It draws over the canvas, so the canvas has to be visible for it.
  const cbx = $('codexBtn'); if (cbx) cbx.addEventListener('click', () => UI.openCodexFromMenu());
  const qc = $('mute'); if (qc) { qc.checked = Sound.muted; qc.addEventListener('change', () => Sound.setMuted(qc.checked)); }
  const vc = $('voice'), mc = $('music'); if (vc) { vc.checked = Voice.on; vc.addEventListener('change', () => Voice.set(vc.checked)); } if (mc) { mc.checked = Music.on; mc.addEventListener('change', () => Music.set(mc.checked)); }
  const nc = $('netConnect'); if (nc) { $('netUrl').placeholder = Net.defaultUrl(); nc.addEventListener('click', () => Net.connect($('netUrl').value.trim() || Net.defaultUrl(), $('netName').value.trim() || 'Player', 'R')); }
  // Custom maps made in the editor appear in the same dropdown as the built-ins. Editor.register() is
  // what puts them into MAP_LAYOUTS, so it has to run before the list is rebuilt from it; the whole
  // select is rebuilt rather than patched because the list is grouped now and a saved map has to land
  // in its own group rather than after whatever happened to be last.
  UI.refreshMapList = () => {
    try { if (typeof Editor !== 'undefined') Editor.register(); } catch (e) { }
    buildLayoutList(); refreshSetup();
  };
  UI.refreshMapList();
  const eb = $('editorBtn'); if (eb) eb.addEventListener('click', () => Editor.open());
  const mf = $('mapFile'); if (mf) mf.addEventListener('change', e => { if (e.target.files[0]) Editor.importFile(e.target.files[0]); e.target.value = ''; });
  const ab = $('autosaveBtn'); if (ab) { ab.style.display = Replay.hasAutosave() ? 'block' : 'none'; ab.addEventListener('click', () => Replay.loadAutosave()); }
  $('loadBtn').addEventListener('click', () => $('loadFile').click()); $('loadFile').addEventListener('change', e => { if (e.target.files[0]) Replay.fromFile(e.target.files[0], 'load'); e.target.value = ''; });
  $('replayBtn').addEventListener('click', () => $('replayFile').click()); $('replayFile').addEventListener('change', e => { if (e.target.files[0]) Replay.fromFile(e.target.files[0], 'watch'); e.target.value = ''; });
});
