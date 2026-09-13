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
  // The master VOLUME (Settings, Audio), 0 to 1. Unlike mute it is remembered (UI.loadPrefs): a level is a preference,
  // where an unmute is a decision about this page. Every sound goes through one of three places and all three read it:
  // tone() here, Voice.speak and Music's master gain.
  volume: 1,
  setMuted(v) {
    this.muted = !!v;
    if (typeof Music === 'undefined') return;
    if (this.muted) Music.stop();
    else if (Music.on && typeof G !== 'undefined' && G.players.length) Music.start();
  },
  init() { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.enabled = false; } },
  tone(f, dur, type = 'square', vol = 0.05, slide = 0) { if (this.muted || !this.enabled || !this.ctx || !(this.volume > 0)) return; vol *= this.volume; const c = this.ctx; if (c.state === 'suspended') c.resume(); const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; if (slide) o.frequency.linearRampToValueAtTime(f + slide, c.currentTime + dur); g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur); },
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

// THE HUD'S SIZE IS ONE NUMBER (TODO-M18 item 5, "the HUD is far too small and should be doubled").
//
// MEASURED FIRST, in the page, before anything was touched (.claude/review/hud-measure.js):
//
//   viewport      1280x720  1366x768  1600x900  1920x1080  2560x1440  3840x2160
//   console band     187       196       196        196        196        196
//   of the window   26.0%     25.5%     21.8%      18.1%      13.6%       9.1%
//   minimap side     165       174       174        174        174        174
//   card button       51        53        53         53         53         53
//
// The 0.26 fraction is DEAD above a 754 px window: every viewport from 1366x768 up got the same 196 px,
// because the clamp CEILING is what decides it, not the fraction. So the taller the display the smaller
// the HUD reads -- and the minimap, the command card and the selection tile are all derived from the
// band, so they are pinned with it. That is the whole of the complaint and the whole of the cause.
//
// HUD_SCALE is the one knob. Everything on the console is drawn in CONSOLE UNITS -- the coordinates the
// HUD has always used, in which the band is consoleBase tall -- and UI.drawConsole runs that entire
// pass under scale(hudK). Doubling the HUD is therefore this constant and NOT a hundred edited literals:
// every font, gap, icon, tile and bar inside is already expressed in console units. Hotspots are
// collected in console units and converted back, which is what keeps every click box on the thing it
// draws (test/qol.js pins exactly that with forty selected units).
//
// HUD_MAX_FRAC is the guard for a short window: the band never takes more than this much of the height,
// and hudK falls with it. It can never go BELOW the unscaled band either, so hudK is never less than 1 and
// a window too short even for the old console behaves exactly as it always did.
//
// 1.4, NOT 2. The sixth session doubled it as asked; the user played it and said "increased too much --
// reduce it by about 30%", and 2 x 0.7 is 1.4. What that gives, by number (test/qol.js pins them):
//   1920x1080 and 2560x1440   band 274 px (k 1.40), minimap 243, card button 74
//   1280x720                  band 262 px, 36% of the height -- the ceiling no longer bites at 720p
//   800x400                   band 168 px at k 1.20: the ceiling's own case, 42% of the height
// Set HUD_SCALE to 1 and every number in the table above comes back unchanged.
//
// HUD_SCALE is now the DEFAULT, not the knob: the player's own HUD size (Settings, Display) is UI.hudScale, kept between
// HUD_SCALE_MIN and HUD_SCALE_MAX and remembered (UI.loadPrefs). A player who never touches it gets exactly 1.4.
const HUD_SCALE = 1.4, HUD_MAX_FRAC = 0.42, HUD_SCALE_MIN = 1, HUD_SCALE_MAX = 1.6;
const UI = {
  // What the band would be unscaled. A fixed height left no map at all in a short window.
  get consoleBase() { return Math.round(clamp(Render.H * 0.26, 140, 196)); },
  get consoleH() { const b = this.consoleBase; return Math.round(Math.max(b, Math.min(b * this.hudScale, Render.H * HUD_MAX_FRAC))); },
  // ---- remembered settings (seventh session, item 2) ----
  // Read once at boot and written the moment one changes. A value missing or malformed in storage is the default, so a
  // bad write can never take the interface down, and loading never turns a missing key into a stored one. Mute is not
  // here on purpose: see Sound.
  hudScale: HUD_SCALE, scrollSpeed: 1, edgeScroll: true, gridKeys: false,
  readPref(k) { try { const s = localStorage.getItem(k); return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; } },
  savePref(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  loadPrefs() {
    const num = (k, lo, hi, d) => { const v = this.readPref(k); return typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
    this.hudScale = Math.round(num('bw_hud_scale', HUD_SCALE_MIN, HUD_SCALE_MAX, HUD_SCALE) * 10) / 10;
    this.scrollSpeed = num('bw_scroll', 0.5, 2, 1);
    this.edgeScroll = this.readPref('bw_edge') !== false;
    Sound.volume = num('bw_volume', 0, 1, 1);
    // The command card's layout (Settings, Controls): stored as the bare word it always was, 'grid' or 'bw'.
    try { this.gridKeys = localStorage.getItem('bw_hotkeys') === 'grid'; } catch (e) { this.gridKeys = false; }
  },
  setGridKeys(on) { this.gridKeys = !!on; try { localStorage.setItem('bw_hotkeys', this.gridKeys ? 'grid' : 'bw'); } catch (e) { } return this.gridKeys; },
  setHudScale(v) { const n = Number(v); this.hudScale = isFinite(n) ? Math.round(Math.max(HUD_SCALE_MIN, Math.min(HUD_SCALE_MAX, n)) * 10) / 10 : HUD_SCALE; this.savePref('bw_hud_scale', this.hudScale); return this.hudScale; },
  setScrollSpeed(v) { const n = Number(v); this.scrollSpeed = isFinite(n) ? Math.max(0.5, Math.min(2, n)) : 1; this.savePref('bw_scroll', this.scrollSpeed); return this.scrollSpeed; },
  setEdgeScroll(v) { this.edgeScroll = v !== false; this.savePref('bw_edge', this.edgeScroll); return this.edgeScroll; },
  setVolume(v) { const n = Number(v); Sound.volume = isFinite(n) ? Math.max(0, Math.min(1, n)) : 1; this.savePref('bw_volume', Sound.volume); if (typeof Music !== 'undefined' && Music.setVolume) Music.setVolume(); return Sound.volume; },
  // The factor the band actually achieved, and therefore the scale its draw pass runs under. Never
  // below 1, because consoleH is never below consoleBase.
  get hudK() { return this.consoleH / this.consoleBase; },
  // The screen in CONSOLE UNITS, which is what everything inside the console's draw pass is placed in.
  get conW() { return Render.W / this.hudK; },
  get conH() { return Render.H / this.hudK; },
  selection: [], subgroup: 0, idleIdx: 0, groups: {}, hover: null, mouse: { x: 0, y: 0, down: false, wx: 0, wy: 0, inside: false }, drag: null, dragging: false, pending: null, placing: null, menu: null, markers: [], pings: [], keys: {}, lastClick: 0, lastClickUnit: null, msgLog: [], camSaves: {}, showHelp: false, cardButtons: [], lastAlertPos: null, speedIdx: 6, accum: 0, lastT: 0, running: false, fps: 0, frames: 0, fpsT: 0,
  SPEEDS: [0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 2, 4, 8], SPEED_NAMES: ['Slowest', 'Slower', 'Slow', 'Normal', 'Fast', 'Faster', 'Fastest', '2x', '4x', '8x'], mode: 'play', viewAll: false, chat: null, loading: null, prodOverlay: false, replayData: null, seeking: false, snaps: [], SNAP_EVERY: 24 * 30,
  // One speed index for both the simulation step and the draw interpolation: in a network game the host's
  // Net.speed paces the sim, and the draw pass used to read speedIdx, so the two disagreed and units
  // stepped instead of gliding for the rest of the match. (REVIEW-M17)
  speedIndex() { if (this.net && typeof Net !== 'undefined') return Net.speed != null ? Net.speed : 6; return this.speedIdx; },
  speedName() { return this.net && typeof Net !== 'undefined' && Net.speed != null ? this.SPEED_NAMES[Net.speed] + ' (set by the host)' : this.SPEED_NAMES[this.speedIdx]; },
  maxSpeedIdx() { return this.mode === 'replay' ? 9 : 6; },
  init() {
    try { this.loadPrefs(); } catch (e) { }   // the remembered settings, before anything is drawn at the wrong HUD size
    const c = document.getElementById('game'); Render.init(c); Sound.init(); if (typeof Atlas !== 'undefined') Atlas.init();
    window.addEventListener('resize', () => Render.resize());
    c.addEventListener('mousemove', e => this.onMove(e)); c.addEventListener('mousedown', e => this.onDown(e)); window.addEventListener('mouseup', e => this.onUp(e));
    c.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this.onKey(e)); window.addEventListener('keyup', e => { this.keys[e.key] = false; });
    this.armFocusGuards(window, document);   // a keyup that went to another window would otherwise leave the key held forever
    // The wheel zooms. Guarded on the console strip and on any modal, so scrolling over the command
    // card or the codex does not silently move the world behind it. Render.zoomAt clamps and re-clamps
    // the camera itself; the anchor is the cursor, so the tile under the pointer stays under it.
    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (typeof Codex !== 'undefined' && Codex.isOpen()) { Codex.wheel(e.deltaY); return; }   // the manual scrolls; this was the only caller Codex.wheel never had (REVIEW-M17)
      if (this.menu) return;
      if (e.clientY >= Render.H - this.consoleH) return;
      Render.zoomAt(Render.zoom * Math.pow(1.12, -Math.sign(e.deltaY)), e.clientX, e.clientY);
    }, { passive: false });
    c.addEventListener('mouseleave', () => { this.mouse.inside = false; }); c.addEventListener('mouseenter', () => { this.mouse.inside = true; });
  },
  start(opts) {
    opts = Object.assign({}, opts, { players: opts.players.map(p => Object.assign({}, p, { race: p.race === 'R' ? ['T', 'Z', 'P'][Math.floor(Math.random() * 3)] : p.race })) });
    this.lastOpts = opts; this.mode = opts.mode || 'play'; this.overSent = false; this.fromLobby = null; this.viewAll = false; this.prodOverlay = false; this.chat = null; this.loading = null; if (this.speedIdx > this.maxSpeedIdx()) this.speedIdx = this.maxSpeedIdx();
    // A composed skirmish layout id describes its own map, so it can be rebuilt rather than shipped.
    // This is the one place that has to happen, and it has to happen BEFORE G.init: GameMap resolves
    // the id in its constructor, and G.daylight looks the layout up in MAP_LAYOUTS by name on every
    // frame. A no-op for every id that is not composed. See UI.skirmishOptions for the whole argument.
    this.registerSkirmishLayout(opts.layout);
    G.init(opts); opts.seed = G.seed;   // resolve it back onto lastOpts so Restart reproduces THIS game, not a default (FIXLIST-M14 B4)
    this.applyStartingBank(opts); G.recording = this.mode === 'play'; G.log = []; G.pendingCmds = null; this.branchedFrom = null; G.mission = null; if (opts.mission && typeof Missions !== 'undefined') Missions.begin(opts.mission);
    Render.reset(); if (typeof Music !== 'undefined' && Music.on && !Sound.muted) Music.start(); this.net = !!opts.net; if (this.net) G.paused = false; this.selection = []; this.groups = {}; this.pending = null; this.placing = null; this.menu = null; this.markers = []; this.pings = []; this.msgLog = []; if (G.mission) this.menu = 'brief';
    const hp = G.players[G.human]; Render.camX = hp.startX - Render.viewWorldW() / 2; Render.camY = hp.startY - Render.viewWorldH() / 2 + 40; this.clampCam();
    const hall = G.units.find(u => u.owner === G.human && u.isBuilding); if (hall) this.select([hall]);
    document.getElementById('menu').style.display = 'none'; document.getElementById('game').style.display = 'block';
    this.running = true; this.menuCodex = false; this.lastT = performance.now(); this.accum = 0; this.lastR = performance.now();
    if (!this._loop) { this._loop = t => this.loop(t); requestAnimationFrame(this._loop); }
    if (!this.simTimer) this.simTimer = this.makeTicker(() => this.simStep(), 1000 / 60);   // a Worker's timer: a hidden tab cannot throttle it (see makeTicker)
  },
  startFromLog(data, mode) {
    // A save is a seed plus a command log, so a different build re-simulates it into a different game and
    // drifts away silently. Refuse it with the reason instead.
    const bad = Replay.versionError(data, mode === 'watch' ? 'replay' : 'save');
    if (bad) { this.loading = null; if (typeof alert === 'function') alert(bad); else console.error(bad); return false; }
    // The log itself is checked before anything starts. Nothing used to look at it: an entry without a
    // command threw out of G.tick, and an out-of-order frame stalled applyPending so every later command
    // was dropped in silence -- a game that looks loaded and plays nothing. Same alert path as the stamp.
    // (REVIEW-M17)
    const shape = this.logError(data);
    if (shape) { this.loading = null; const msg = 'This ' + (mode === 'watch' ? 'replay' : 'save') + ' cannot be loaded: ' + shape + '.'; if (typeof alert === 'function') alert(msg); else console.error(msg); return false; }
    const opts = { players: data.players, seed: data.seed, layout: data.layout, mission: data.mission || null, mode: mode === 'watch' ? 'replay' : 'play' };
    this.start(opts); G.pendingCmds = { list: data.cmds || [], i: 0 }; G.recording = mode === 'load';
    if (mode === 'watch') { this.replayData = data; this.replayOpts = opts; this.viewAll = true; this.prodOverlay = true; this.snaps = []; } // an observer wants to see everything by default
    if (mode === 'load') this.fastForward(data.frame, () => { G.pendingCmds = null; if (data.cam) { Render.camX = data.cam.x; Render.camY = data.cam.y; this.clampCam(); } });
  },
  // null when the log can be replayed, otherwise what is wrong with it, in a sentence fragment
  logError(data) {
    if (!data || !Array.isArray(data.players) || !data.players.length) return 'it names no players';
    const cmds = data.cmds === undefined ? [] : data.cmds;
    if (!Array.isArray(cmds)) return 'its command log is not a list';
    let last = -Infinity;
    for (let i = 0; i < cmds.length; i++) {
      const e = cmds[i];
      if (!e || typeof e.f !== 'number' || !(e.f >= last) || !e.c || typeof e.c !== 'object' || typeof e.c.t !== 'string') return 'command ' + i + ' of its log is malformed';
      last = e.f;
    }
    return null;
  },
  fastForward(target, done) {
    this.loading = { target, start: G.frame };
    const step = () => { const t0 = performance.now(); while (G.frame < target && !G.over && performance.now() - t0 < 40) { G.tick(); this.keepSnapshot(); } if (G.frame < target && !G.over) setTimeout(step, 0); else { this.loading = null; done(); } };
    setTimeout(step, 0);
  },
  // ---------------- the simulation's clock ----------------
  // A page timer in a hidden tab -- or in a window another window covers, which Chromium counts as hidden --
  // fires once or twice a second. Measured in the desktop app's browser pane on 2026-09-12: 312 simStep calls
  // in five seconds while visible, 10 once hidden; a Worker's setInterval over the same hidden five seconds
  // delivered 312 messages. In a network game simStep ticks at most eight frames a call, so a host who had
  // Alt-Tabbed fed every peer a burst of eight frames a second: the freeze-every-second of the first internet
  // game. The clock is a Worker's timer, whose message wakes the page; it falls back to setInterval where
  // Workers, Blobs or object URLs do not exist (file://, the test harness) or where the worker never speaks
  // (a CSP that forbids blob: workers reports an error, or nothing at all -- a silent one is given a second).
  makeTicker(fn, ms) {
    const t = { worker: null, id: 0, alive: false, fallback() { if (!t.id) t.id = setInterval(fn, ms); if (t.worker) { try { t.worker.terminate(); } catch (e) { } t.worker = null; } } };
    try {
      if (typeof Worker === 'function' && typeof Blob === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function')
        t.worker = new Worker(URL.createObjectURL(new Blob(['setInterval(function () { postMessage(0); }, ' + ms + ');'], { type: 'text/javascript' })));
    } catch (e) { t.worker = null; }
    if (!t.worker) { t.id = setInterval(fn, ms); return t; }
    t.worker.onmessage = () => { t.alive = true; fn(); };
    t.worker.onerror = () => t.fallback();
    setTimeout(() => { if (!t.alive) t.fallback(); }, 1000);
    return t;
  },
  // Stops the clock start() made, whichever kind it is (test/perf_render.js drives the sim by hand).
  stopSim() { const t = this.simTimer; this.simTimer = null; if (!t) return; if (typeof t === 'object') { if (t.id) clearInterval(t.id); if (t.worker) { try { t.worker.terminate(); } catch (e) { } t.worker = null; } } else clearInterval(t); },
  // Keys the page never saw released. A keydown followed by Alt-Tab, a browser dialog or a covered window
  // delivers no keyup, and `keys`, polled by scrollCam, kept the camera panning until the key was pressed
  // again -- the "screen keeps panning down" of the first internet game. Focus leaving the window or the
  // tab hiding forgets every held key and puts the mouse outside; scrollCam also polls the keys only while
  // the document has focus.
  armFocusGuards(win, doc) {
    win.addEventListener('blur', () => { this.keys = {}; this.mouse.inside = false; });
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) { this.keys = {}; this.mouse.inside = false; } });
  },
  simStep() {
    if (!this.running) return; const now = performance.now(); const dt = Math.min(1, (now - this.lastT) / 1000); this.lastT = now;
    if (this.net && typeof Net !== 'undefined' && Net.active && Net.catchingUp) { // rejoin: replay the relay's history as fast as possible, then go live
      const t0 = performance.now(); while (Net.ready(G.frame) && performance.now() - t0 < 40) { Net.beforeTick(); G.tick(); }
      if (!Net.ready(G.frame)) { Net.catchingUp = false; this.loading = null; this.accum = 0; this.menu = null; G.players[G.human].msg('Rejoined the game at ' + Net.clock(G.frame) + '.', 'info'); }
      else if (this.loading) this.loading.target = Math.max(this.loading.target, G.frame + 1);
      return;
    }
    // A menu is a local overlay. In a network game the lockstep runs behind it: a client with the pause
    // menu open, or an eliminated player looking at the result screen, used to stop sending batches and
    // every peer froze on "Waiting for other players". (REVIEW-M17)
    if (G.paused || this.loading || (this.menu && !this.net)) return;
    if (this.mode === 'play' && G.frame > 0 && G.frame % (TPS * 120) === 0 && !(typeof Net !== 'undefined' && Net.active) && !this._autosaved) { this._autosaved = true; Replay.save(false); } else if (G.frame % (TPS * 120) !== 0) this._autosaved = false;
    const step = 1 / (TPS * this.SPEEDS[this.speedIndex()]); this.accum += dt; let n = 0;
    if (this.net && typeof Net !== 'undefined' && Net.active) { while (this.accum >= step && n < 8) { if (!Net.ready(G.frame)) { if (!Net.waitingSince) Net.waitingSince = performance.now(); this.accum = Math.min(this.accum, step); break; } Net.waitingSince = 0; Net.beforeTick(); G.tick(); this.accum -= step; n++; } return; }
    while (this.accum >= step && n < 48) { G.tick(); this.keepSnapshot(); this.accum -= step; n++; }
    if (n >= 48) this.accum = 0;
  },
  loop(t) {
    requestAnimationFrame(this._loop);
    if (this.menuCodex) { this.drawMenuCodex(); return; }   // the main-menu codex; see openCodexFromMenu
    if (!this.running) return;
    const dt = Math.min(0.1, (t - this.lastR) / 1000); this.lastR = t;
    const step = 1 / (TPS * this.SPEEDS[this.speedIndex()]);
    this.scrollCam(dt);
    for (let i = this.markers.length - 1; i >= 0; i--) if (--this.markers[i].t <= 0) this.markers.splice(i, 1);
    for (let i = this.pings.length - 1; i >= 0; i--) if (--this.pings[i].t <= 0) this.pings.splice(i, 1);
    this.pruneSelection();
    Render.frame(G.paused ? 1 : Math.min(1, this.accum / step));
    if (typeof Music !== 'undefined' && Music.poll) Music.poll();   // combat music state; render-side, reads the sim and never writes it
    this.drawConsole(); this.drawTop(); this.drawMessages();
    if (typeof Codex !== 'undefined') Codex.draw(Render.ctx);   // above the console, below the menu
    if (this.mode === 'replay') { this.drawTimeline(); if (this.prodOverlay) this.drawProdOverlay(); }
    if ((G.over || this.humanIsOut()) && !this.menu) this.menu = 'over';
    // THE END OF A NETWORK GAME, told to the relay once (queue item B): the frame G.over came at and the winning team. The relay
    // calls the game over when every player still in it says the same frame, and only then can one player's BACK TO LOBBY
    // take the room with them. A spectator's word counts for nothing, so a spectator sends none.
    this.reportOver();
    this.watchStalls();
    if (this.menu) this.drawMenu();
    this.frames++; if (t - this.fpsT > 1000) { this.fps = this.frames; this.frames = 0; this.fpsT = t; }
  },
  // ==========================================================================
  // WHY THE PLAYER WAS NOT SEEING THE DEFEAT SCREEN -- FIXLIST-M14 B4 (item 8)
  // ==========================================================================
  // The screen was built and it worked; the reason it never appeared is that `G.over` answers a
  // DIFFERENT QUESTION from "has this player's game finished". G.checkVictory sets it only when ONE
  // TEAM REMAINS, so in a free-for-all with three or more teams the human can be wiped out and the
  // flag stays false for ever while the surviving AIs fight it out. Measured, before anything was
  // changed, by wiping the human out at frame 120 and reading the flag:
  //
  //   2 players  human defeated: true   G.over: true    <- the only case that ever worked
  //   3 players  human defeated: true   G.over: FALSE
  //   4 players  human defeated: true   G.over: FALSE
  //   2 AIs on one team vs the human    G.over: true    (one team left, so the old rule fires)
  //
  // That is the whole report. In a 1v1 the last team standing ends the game anyway, so the screen
  // showed; in anything larger the player who just lost was left watching with no screen, no result,
  // and no way out but the pause menu.
  //
  // THE FIX IS HERE AND NOT IN js/game.js, and that is deliberate rather than convenient: Group B may
  // not move the build stamp, js/game.js is hashed and js/ui.js is not -- and this is genuinely an
  // interface question. Whether one team remains is a fact about the simulation; whether to show YOU a
  // result screen is a fact about you.
  //
  // Not in a replay: a replay of a game the recorded human lost would stop dead at the moment they
  // died instead of playing out. `freePlay` is the existing escape hatch and it still works -- it is
  // what "Keep watching" sets.
  humanIsOut() {
    if (this.mode === 'replay' || G.freePlay) return false;
    const p = G.players && G.players[G.human];
    return !!(p && p.human && p.defeated);
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
    // A network spectator (mode 'replay', net) watches a game that has not happened yet: there is nothing to seek back to
    // that the relay would let it keep, so it keeps no snapshots.
    if (this.mode !== 'replay' || this.net || typeof Snapshot === 'undefined') return;
    if (G.frame % this.SNAP_EVERY !== 0) return;
    const last = this.snaps[this.snaps.length - 1];
    if (last && last.f >= G.frame) return; // already have this point (we just seeked onto it)
    this.snaps.push({ f: G.frame, s: Snapshot.take() });
    if (this.snaps.length > 80) this.snaps = this.snaps.filter((x, i) => i % 2 === 0 || i > this.snaps.length - 20);
  },
  nearestSnapshot(frame) { let best = null; for (const c of this.snaps) if (c.f <= frame && (!best || c.f > best.f)) best = c; return best; },

  // A replay is a command log rather than a series of snapshots, so reaching a frame means SIMULATING
  // to it. The checkpoints exist to shorten that walk, and the only question worth asking is where the
  // walk should start from.
  //
  // IT USED TO ASK THAT ONLY WHEN SEEKING BACKWARDS. Forward, it simply ran the simulation on from
  // wherever it happened to be -- which is right if you are nudging thirty seconds ahead and absurd if
  // you are jumping twenty minutes, because there is almost certainly a checkpoint sitting just before
  // the target. Measured on test/longgame.js, an hour-long game: seeking back from 53:20 to 23:20 cost
  // 4,985 ms because it restored a checkpoint and walked a minute of game time, while seeking FORWARD
  // from there to 46:40 cost 88,505 ms -- 33,600 frames re-simulated one at a time, within 1.7% of a
  // 90-second test budget it was quietly about to blow through.
  //
  // So the direction is not the question. Restore whenever the nearest checkpoint at or before the
  // target is AHEAD of where we are now, because then it is strictly less work than walking there, and
  // fall through to simulating forward when it is not.
  seekTo(frame) {
    if (this.mode !== 'replay' || !this.replayData || this.seeking) return;
    const target = clamp(Math.round(frame), 0, this.replayLength()), watched = G.human, all = this.viewAll, ov = this.prodOverlay;
    const cp = this.nearestSnapshot(target);
    if (target < G.frame || (cp && cp.f > G.frame)) {
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
    const s = 900 * this.scrollSpeed * dt / Render.zoom; const m = this.mouse; let dx = 0, dy = 0;   // screen-constant speed: without /zoom, edge scroll crawls at the strategic view; scrollSpeed is the player's (Settings, Game)
    if (document.hasFocus()) { if (this.keys.ArrowLeft) dx -= s; if (this.keys.ArrowRight) dx += s; if (this.keys.ArrowUp) dy -= s; if (this.keys.ArrowDown) dy += s; }   // polled only with focus: a key released elsewhere is a key held forever (armFocusGuards)
    if (this.edgeScroll && document.hasFocus() && !this.menu && m.inside) { if (m.x <= 2) dx -= s; if (m.x >= Render.W - 3) dx += s; if (m.y <= 2) dy -= s; if (m.y >= Render.H - 3) dy += s; }
    if (dx || dy) { Render.camX += dx; Render.camY += dy; this.clampCam(); }
  },
  centerOn(x, y) { Render.camX = x - Render.viewWorldW() / 2; Render.camY = y - Render.viewWorldH() / 2; this.clampCam(); },
  // ---------------- selection ----------------
  select(units, add) {
    this.subgroup = 0;   // a new selection starts on its first kind
    let list = add ? this.selection.slice() : [];
    for (const u of units) { if (!list.includes(u)) list.push(u); }   // no cap; see below
    // if mix of own units and others, keep own only; buildings only when nothing else
    const own = list.filter(u => u.owner === G.human);
    if (own.length && own.length < list.length) list = own;
    const mobile = list.filter(u => !u.isBuilding);
    if (mobile.length && mobile.length < list.length) list = mobile;
    // No cap. Brood War's twelve was a genuine skill expression and removing it is a real change to how
    // the game plays; it goes because this project already has select-all-army, control groups and a
    // paginating command card, so the cap was producing clicking rather than decisions. drawSelGrid is
    // what keeps an unbounded selection legible.
    if (list.length > 1) list = list.filter(u => !u.def.larva || list.every(v => v.def.larva));
    // A unit selection and a resource selection are exclusive (FIXLIST-M14 B1). Clearing it HERE
    // rather than at each call site is what guarantees it: control groups, select-all-army, the idle
    // worker key and the multi-select strip all come through this one function.
    this.selection = list; this.selRes = null; this.pending = null; this.placing = null; this.cardMenu = null;
    if (list.length) Sound.select(list[0]);
  },
  onUnitDied(u) { const i = this.selection.indexOf(u); if (i >= 0) this.selection.splice(i, 1); for (const k in this.groups) { const j = this.groups[k].indexOf(u); if (j >= 0) this.groups[k].splice(j, 1); } },
  // The hit area is in WORLD units, so at the strategic view it shrinks with everything else while the
  // icon the player is actually aiming at does not -- Render.hitBox carries the floor that handles that.
  //
  // FIXLIST-M14 B3: the area comes from Render.hitBox, which is measured from the DRAWN SPRITE rather
  // than derived from `u.r`. It is a box and not a circle because the ink is not symmetric about the
  // unit -- see the SPRITE_INK block in js/render.js for the measurement and why. The tie-break is
  // unchanged and is what stops the wider area making a clump worse: among everything the click lands
  // on, the NEAREST CENTRE still wins.
  unitAt(wx, wy) {
    let best = null, bd = 1e9;
    for (const u of G.units) { if (!u.alive || u.inside || u.def.notUnit) continue; if (u.owner !== G.human && !G.canSee(G.human, u) && !(u.isBuilding && G.explored(G.human, Math.floor(u.x / TILE), Math.floor(u.y / TILE)))) continue; let hit, d; if (u.isBuilding && !u.lifted) { hit = wx >= u.tx * TILE && wx < (u.tx + u.def.w) * TILE && wy >= u.ty * TILE && wy < (u.ty + u.def.h) * TILE; d = 500; } else { const b = Render.hitBox(u); const dx = wx - u.x, dy = wy - u.y; hit = dx >= -b.side && dx <= b.side && dy >= -b.up && dy <= b.down; d = distPt(wx, wy, u.x, u.y); } if (hit && d < bd) { bd = d; best = u; } }
    return best;
  },
  // ==========================================================================
  // RESOURCES ARE CLICKABLE -- FIXLIST-M14 B1 (reported items 1, 3 and 14)
  // ==========================================================================
  // "Click a mineral node to see how many minerals are left", "click a gas patch for gas remaining",
  // "hovering either should show a ring so you know you are over it".
  //
  // This was a MISSING FEATURE, not a broken one: `unitAt` walks `G.units`, and mineral patches and
  // geysers live in `G.map.resources`, so no click could ever reach one. They are not Units and must
  // not become Units -- a resource in `UI.selection` would be handed orders, swept into control groups
  // and drawn in the multi-select strip, all of which want a `def`, an owner and hit points.
  //
  // So a resource selection is its own field. `selRes` is set only when nothing else was hit, is
  // cleared by any unit selection, and is read by exactly two places: the console panel, and the hover
  // ring. It never enters `selection`, so nothing downstream has to learn that it exists.
  selRes: null,
  hoverRes: null,
  // A patch, a geyser, or the geyser under a finished refinery/extractor/assimilator. Fog-gated: a
  // patch on ground the player has never explored is not there as far as the interface is concerned.
  resourceAt(wx, wy) {
    if (!G.map || !G.map.resources) return null;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (!G.explored(G.human, tx, ty)) return null;
    for (const r of G.map.resources) {
      if (wx < r.x * TILE || wx >= (r.x + r.w) * TILE || wy < r.y * TILE || wy >= (r.y + r.h) * TILE) continue;
      return r;
    }
    return null;
  },
  // The geyser under a gas building, so clicking a Refinery answers the same question clicking the
  // geyser did. `b.geyser` is set by G.placeBuilding and cleared when the building dies.
  resourceUnder(u) { return (u && u.isBuilding && u.def.onGeyser && u.geyser) ? u.geyser : null; },
  DOUBLE_MS: 350,
  // "Is this the second click of a double-click on the same thing?" -- its own question rather than a
  // condition buried in onUp, so test/clicking.js can ASK IT rather than re-typing it. A test that
  // retypes the condition is testing its own copy: putting the removed clause back would leave it
  // green, which is exactly what happened the first time this was written.
  //
  // FIXLIST-M14 B2 (item 2) is the clause that is NOT here any more: `&& !t.isBuilding`. It was the
  // only thing stopping a double-click on a Barracks selecting every Barracks on screen, and the
  // Ctrl-click branch two lines below in onUp already did select-all-of-type without excluding
  // buildings -- which is what said the exclusion was unmotivated rather than load-bearing.
  isDoubleClick(t, now) { return now - this.lastClick < this.DOUBLE_MS && this.lastClickUnit === t && t.owner === G.human; },
  // ---------------- input ----------------
  // Delegated to Render, which owns the zoom. This is the load-bearing line: every click, drag,
  // order and hover goes through it, so leaving the old `sx + camX` here would land every one of them
  // in the wrong place at any zoom other than 1 -- and it would look like a targeting bug, not a
  // camera bug.
  screenToWorld(sx, sy) { return Render.screenToWorld(sx, sy); },
  inMinimap(x, y) { const r = this.miniRect(); return x >= r.x && x < r.x + r.s && y >= r.y && y < r.y + r.s; },
  miniToWorld(x, y) { const r = this.miniRect(); return [(x - r.x) / r.s * G.map.w * TILE, (y - r.y) / r.s * G.map.h * TILE]; },
  onMove(e) {
    const m = this.mouse; m.x = e.clientX; m.y = e.clientY; [m.wx, m.wy] = this.screenToWorld(m.x, m.y);
    if (typeof Codex !== 'undefined' && Codex.isOpen()) { Codex.move(m.x, m.y); return; }
    if (this.drag && m.down && distPt(m.x, m.y, this.drag.x0, this.drag.y0) > 4) { this.dragging = true; this.drag.x1 = m.x; this.drag.y1 = m.y; }
    // FIXLIST-M14 C7: the drag remembers its whole path, not just where it started and where it is now.
    // Sampled in SCREEN space, like x0/y0/x1/y1 beside it, because the camera may move mid-drag and the
    // shape the player drew is the shape on the glass. Converted to world exactly once, on release.
    if (this.lineDrag) {
      const d = this.lineDrag; d.x1 = m.x; d.y1 = m.y;
      const n = d.pts.length;
      if (distPt(m.x, m.y, d.pts[n - 2], d.pts[n - 1]) >= this.CURVE_STEP) {
        d.pts.push(m.x, m.y);
        // The cap. A drag that wanders for a minute is still one gesture and must not grow without
        // bound; dropping the OLDEST pair keeps the recent shape, which is the part the player is
        // still looking at. 160 samples at CURVE_STEP apart is far longer than any map's diagonal.
        if (d.pts.length > this.CURVE_MAX * 2) d.pts.splice(0, 2);
      }
    }
    if (this.sketch) { const n = this.sketch.length; if (n < 2 || distPt(m.wx, m.wy, this.sketch[n - 2], this.sketch[n - 1]) > 14) { this.sketch.push(m.wx, m.wy); if (this.sketch.length > 80) this.sketch.splice(0, 2); } }
    if (this.miniDrag) { const [wx, wy] = this.miniToWorld(m.x, m.y); this.centerOn(wx, wy); }
    if (this.placing) { const d = this.placing.def; this.placing.tx = Math.floor(m.wx / TILE - d.w / 2 + 0.5); this.placing.ty = Math.floor(m.wy / TILE - d.h / 2 + 0.5); if (d.onGeyser) { const g = G.map.resources.find(r => r.type === 'geyser' && m.wx >= r.x * TILE - 16 && m.wx < (r.x + r.w) * TILE + 16 && m.wy >= r.y * TILE - 16 && m.wy < (r.y + r.h) * TILE + 16); if (g) { this.placing.tx = g.x; this.placing.ty = g.y; } } }
    this.hover = (m.y < Render.H - this.consoleH) ? this.unitAt(m.wx, m.wy) : null;
    if (this.syncCursor) this.syncCursor();   // the cursor's SHAPE follows the pointer on the event, not on the next frame
    // B1: the ring. A resource only reads as hovered when nothing is standing on it, so a worker
    // mining a patch still highlights as the worker -- the unit is what a click there would select.
    this.hoverRes = (!this.hover && m.y < Render.H - this.consoleH) ? this.resourceAt(m.wx, m.wy) : (this.hover ? this.resourceUnder(this.hover) : null);
  },
  onDown(e) {
    if (this.loading) return;   // a rejoin catching up: see onKey
    const m = this.mouse; m.x = e.clientX; m.y = e.clientY; [m.wx, m.wy] = this.screenToWorld(m.x, m.y);
    // Alt is the signalling modifier (M12 item 9): alt-click pings, alt-drag draws a stroke. Both go
    // out as commands, so allies see them and a replay keeps them.
    if (e.altKey && e.button === 0 && m.y < Render.H - this.consoleH) { e.preventDefault(); this.sketch = [m.wx, m.wy]; return; }
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
      this.lineDrag = { x0: m.x, y0: m.y, x1: m.x, y1: m.y, shift: e.shiftKey, pts: [m.x, m.y] };
      return;
      const t = this.unitAt(m.wx, m.wy); this.smartCommand(t, m.wx, m.wy, e.shiftKey);
    }
  },
  onUp(e) {
    const m = this.mouse; if (this.miniDrag) { this.miniDrag = false; return; }
    if (this.sketch) {
      const pts = this.sketch; this.sketch = null;
      // a stroke of one point is a click, and a click is a ping -- so the same gesture covers both and
      // there is nothing extra to learn
      if (pts.length <= 4) G.signal(G.human, 'ping', pts[0], pts[1], null);
      else G.signal(G.human, 'draw', pts[0], pts[1], pts);
      return;
    }
    if (e.button === 2 && this.lineDrag) {
      const d = this.lineDrag; this.lineDrag = null;
      const len = distPt(d.x0, d.y0, d.x1, d.y1);
      const [wx0, wy0] = this.screenToWorld(d.x0, d.y0), [wx1, wy1] = this.screenToWorld(d.x1, d.y1);
      if (len < this.LINE_MIN) { const t = this.unitAt(wx1, wy1); this.smartCommand(t, wx1, wy1, d.shift || this.keys.Shift); }
      // A CURVED drag spreads the selection along the curve; a STRAIGHT one takes the path it always
      // took. `curved` is the whole switch and it is deliberately conservative -- see UI.curved -- so
      // that "this extends the feature, it does not replace it" is true by construction rather than by
      // the two code paths happening to agree.
      else if (this.curved(d.pts)) this.curveCommand(d.pts, d.shift || this.keys.Shift);
      else this.lineCommand(wx0, wy0, wx1, wy1, d.shift || this.keys.Shift);
      return;
    }
    if (e.button !== 0 || !m.down) return; m.down = false;
    if (this.dragging && this.drag) { const d = this.drag; const [x0, y0] = this.screenToWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1)), [x1, y1] = this.screenToWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1)); const inBox = G.units.filter(u => u.alive && !u.inside && !u.isBuilding && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1 && (u.owner === G.human || G.canSee(G.human, u)) && !u.def.notUnit); let own = inBox.filter(u => u.owner === G.human); if (!own.length && inBox.length) own = [inBox[0]]; if (own.length) this.select(own, e.shiftKey); else if (!e.shiftKey) { const b = G.units.filter(u => u.alive && u.isBuilding && u.owner === G.human && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1)[0]; if (b) this.select([b]); } }
    // B2 (item 2): the `!t.isBuilding` clause that used to sit in the double-click test is GONE.
    // Double-clicking a building now selects every building of that type on screen, exactly as it has
    // always done for units -- same 350 ms window, same on-screen restriction, same code path.
    // Ctrl-click on the very next branch already did select-all-of-type WITHOUT excluding buildings,
    // which is what said the exclusion was unmotivated rather than load-bearing.
    else if (this.drag) { const t = this.unitAt(m.wx, m.wy); const now = performance.now(); if (t) { if (this.isDoubleClick(t, now)) { const same = G.units.filter(u => u.alive && u.owner === G.human && u.def.id === t.def.id && !u.inside && u.x > Render.camX && u.x < Render.camX + Render.viewWorldW() && u.y > Render.camY && u.y < Render.camY + Render.viewWorldH()); this.select(same, e.shiftKey); } else if (e.shiftKey && this.selection.includes(t)) { this.selection = this.selection.filter(u => u !== t); } else if (e.ctrlKey) { const same = G.units.filter(u => u.alive && u.owner === t.owner && u.def.id === t.def.id && !u.inside && u.x > Render.camX && u.x < Render.camX + Render.viewWorldW() && u.y > Render.camY && u.y < Render.camY + Render.viewWorldH()); this.select(same, e.shiftKey); } else this.select([t], e.shiftKey && t.owner === G.human); this.lastClick = now; this.lastClickUnit = t; }
      // B1: nothing was hit, so ask the map. A resource click clears the unit selection and fills
      // `selRes` instead -- the two are exclusive, and only one of them can be given an order.
      else { const r = this.resourceAt(m.wx, m.wy); if (r) { this.selRes = r; if (!e.shiftKey) { this.selection = []; this.cardMenu = null; } } else if (!e.shiftKey) { this.selection = []; this.selRes = null; this.cardMenu = null; } } }
    this.drag = null; this.dragging = false;
  },
  // ==========================================================================
  // KEY BINDINGS -- M12 item 10, the half that did not exist in any form.
  // ==========================================================================
  // Every global action the player can take now has a NAME, a default key and a place in a table, so
  // the Controls screen can list them and rebind them. Command-card letters are deliberately NOT here:
  // those come from the unit and building defs and are governed by the existing Brood War / Grid
  // layout switch, which is a different question (what letter builds a Barracks) from this one (what
  // key centres the camera).
  //
  // `bindings()` resolves the table against whatever the player has saved, once, and caches it. Every
  // read goes through UI.key(action) so there is exactly one place that knows a key can be remapped --
  // the alternative, sprinkling lookups through onKey, is how half the actions end up unrebindable and
  // nobody notices until someone tries.
  //
  // The keys that are NOT in the table but that onKey (and the camera scroll) read by literal -- the
  // control groups, the camera slots, F8, F9, Ctrl+M and the rest -- are listed in RESERVED below, and
  // setBinding refuses them. Without that list a rebind could land on one of them and the two handlers
  // shared the key in silence: whichever line of onKey came first won, and the other was dead with
  // nothing to say so. test/controls.js scrapes onKey for every literal key and checks the list both
  // ways. (REVIEW-M17 task 15)
  //
  // Stored per action rather than per key so a saved binding survives a default changing underneath it,
  // and so an unbound action is expressible (empty string) rather than being confused with a default.
  BIND_DEFAULTS: {
    idleWorker: { key: ',', label: 'Select idle worker', group: 'Selection' },
    selectArmy: { key: 'ctrl+a', label: 'Select all army', group: 'Selection' },
    cycleSubgroup: { key: 'Tab', label: 'Cycle subgroup', group: 'Selection' },
    centerSel: { key: 'Backspace', label: 'Centre on selection', group: 'Camera' },
    lastAlert: { key: ' ', label: 'Jump to last alert', group: 'Camera' },
    // The shifted characters, because that is what e.key carries when Shift is held: bound to '=' the
    // zoom never matched ('+' arrived), and the speed line below it matched instead. (REVIEW-M17)
    zoomIn: { key: '+', label: 'Zoom in', group: 'Camera' },
    zoomOut: { key: '_', label: 'Zoom out', group: 'Camera' },
    help: { key: 'F1', label: 'Toggle help overlay', group: 'Interface' },
    codex: { key: 'F3', label: 'Open the codex', group: 'Interface' },
    // ESCAPE, NOT F10 (tenth session, item 6; the user: "settings in-game should be bound to ESC, not F10"). One key does both
    // things Escape means: it first cancels what is half-done -- placing a building, choosing a target, a build menu -- and
    // otherwise opens the game menu, which is where Settings is. It never destroys anything: a queued unit or an unfinished
    // building is cancelled with its card's Cancel button, not with Escape, so a player reaching for the menu cannot lose one.
    pause: { key: 'Escape', label: 'Game menu (Escape also cancels a target or a placement)', group: 'Interface' },
    save: { key: 'F5', label: 'Save game', group: 'Interface' },
    chat: { key: 'Enter', label: 'Chat', group: 'Interface' },
    speedUp: { key: '=', label: 'Game speed up', group: 'Interface' },
    speedDown: { key: '-', label: 'Game speed down', group: 'Interface' },
  },
  // Keys a hard-coded handler owns, in the form setBinding stores them (e.key as the browser gives it, or
  // 'ctrl+' and the lower-cased key). One line per key, naming the reader. setBinding refuses these, and
  // test/controls.js scrapes onKey and scrollCam for every literal key read and checks this list both
  // ways. Case is ignored the way hit() ignores it, and a ctrl+ chord over a bare key here is reserved
  // too: none of the bare reads below checks Ctrl, so Ctrl+F8 still loads the autosave and a binding on
  // it would be dead. A default from the table above is never in this list -- those are read through hit().
  RESERVED: new Set([
    'ctrl+m',   // onKey: mute / unmute (Sound.setMuted); plain M is the Move command
    'ctrl+v',   // onKey, replay: toggle full-map vision (viewAll)
    'ctrl+b',   // onKey, replay: take control from here (branchReplay)
    'F8',   // onKey: load the autosave (Replay.loadAutosave, asking first with a game running)
    'F9',   // onKey: pause the simulation (G.paused; not in a network game)
    'Pause',   // onKey: pause the simulation, the same line as F9
    // (Escape is not here any more: it is the pause binding's default, read through hit() -- tenth session, item 6.)
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',   // onKey: control groups (Ctrl assigns, Shift adds, bare recalls)
    'F2', 'F4', 'F6', 'F7',   // onKey: camera slots (Shift saves, bare recalls) -- the four the help overlay lists
    '[', ']',   // onKey, replay: switch whose vision is shown (cycleObserved)
    'o',   // onKey, replay: the production overlay (prodOverlay)
    'Home',   // onKey, replay: restart (seekTo(0))
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',   // scrollCam polls this.keys for these every frame, outside onKey; onKey reads Shift+Left/Right in a replay (seek 30 s)
  ]),
  // Is `key`, as setBinding stores it, one a hard-coded handler owns? See RESERVED.
  reserved(key) {
    if (!key) return false;
    const lc = this._reservedLC || (this._reservedLC = new Set([...this.RESERVED].map(r => r.toLowerCase())));
    const k = key.toLowerCase();
    return lc.has(k) || (k.startsWith('ctrl+') && lc.has(k.slice(5)));
  },
  bindings() {
    if (this._binds) return this._binds;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('bw_binds') || '{}') || {}; } catch (e) { saved = {}; }
    const out = {};
    for (const id of Object.keys(this.BIND_DEFAULTS)) {
      out[id] = Object.assign({}, this.BIND_DEFAULTS[id]);
      if (typeof saved[id] === 'string') out[id].key = saved[id];
    }
    return this._binds = out;
  },
  key(action) { const b = this.bindings()[action]; return b ? b.key : ''; },
  // Does this keydown match the binding? `ctrl+` is the only modifier prefix, which covers everything
  // the game binds today; a general modifier parser would be more code than the feature has uses.
  hit(action, e, k) {
    const want = this.key(action); if (!want) return false;
    if (want.startsWith('ctrl+')) return !!e.ctrlKey && k.toLowerCase() === want.slice(5);
    if (e.ctrlKey) return false;
    return k === want || (want.length === 1 && k.toLowerCase() === want.toLowerCase());
  },
  setBinding(action, key) {
    const b = this.bindings(); if (!b[action]) return false;
    // A reserved key (RESERVED above) is refused before anything is taken off another action: the caller
    // gets false and the table and storage are exactly as they were. (REVIEW-M17 task 15)
    if (this.reserved(key)) return false;
    // A key already in use is TAKEN OFF the other action rather than silently duplicated. Two actions
    // on one key is a state the player cannot see and cannot debug.
    if (key) for (const id of Object.keys(b)) if (id !== action && b[id].key === key) b[id].key = '';
    b[action].key = key;
    const save = {}; for (const id of Object.keys(b)) if (b[id].key !== this.BIND_DEFAULTS[id].key) save[id] = b[id].key;
    try { localStorage.setItem('bw_binds', JSON.stringify(save)); } catch (e) { }
    return true;
  },
  resetBindings() { this._binds = null; try { localStorage.removeItem('bw_binds'); } catch (e) { } return this.bindings(); },
  onKey(e) {
    this.keys[e.key] = true; const k = e.key;
    // Three guards. A keydown inside a text field belongs to the field: with the menu's Name, Room or
    // Seed box focused, Backspace and Tab were swallowed, Enter opened an invisible chat buffer that ate
    // every key until Escape, and F5 threw inside Replay.data(). With no game running there is nothing
    // for a hotkey to act on except the codex, which keeps its own key. And while a rejoin is catching
    // up, an order issued here would be stamped with a frame the live clients have already passed --
    // they drop it, the rejoiner applies it, and the rejoiner desyncs at the next hash. (REVIEW-M17)
    const tag = e.target && e.target.tagName; if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (!this.running && !(typeof Codex !== 'undefined' && (Codex.isOpen() || this.hit('codex', e, k)))) return;
    // The pause key is read from the table here and in the menu below, like every other bound key: read
    // as the literal F10 it stayed the menus' close key after a rebind, and the rebound key never closed
    // them. (REVIEW-M17 task 15)
    if (this.loading && !this.hit('pause', e, k)) { e.preventDefault(); return; }
    // The codex is modal: while it is open it eats the keyboard so nothing leaks through to the game.
    if (typeof Codex !== 'undefined' && Codex.isOpen()) { if (Codex.key(k)) { e.preventDefault(); return; } }
    if (this.hit('codex', e, k)) { e.preventDefault(); if (typeof Codex !== 'undefined') Codex.toggle(); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'F10', 'F1'].includes(k)) e.preventDefault();
    if (this.menu) { if (this.hit('pause', e, k)) { if (this.menu === 'settings') this.menu = 'pause'; else if (this.menu === 'pause') this.menu = null; } return; }
    if (this.chat !== null) { e.preventDefault(); if (k === 'Enter') { const line = this.chat.trim(); this.chat = null; if (line) { if (this.net) Net.chat(line); else if (!G.cheat(line)) G.players[G.human].msg(line, 'info'); } } else if (k === 'Escape') this.chat = null; else if (k === 'Backspace') this.chat = this.chat.slice(0, -1); else if (k.length === 1 && this.chat.length < 60) this.chat += k; return; }
    if (this.hit('chat', e, k) && this.mode === 'play') { this.chat = ''; e.preventDefault(); return; }
    // AFTER the chat buffer, which keeps Escape for itself (closing what you are typing is not opening the menu). A placement,
    // a target being chosen or a build menu is cancelled first; only with none of them does the key open the menu.
    if (this.hit('pause', e, k)) { e.preventDefault(); if (this.placing || this.pending || this.cardMenu) { this.placing = null; this.pending = null; this.cardMenu = null; } else this.menu = 'pause'; return; }
    if (this.hit('save', e, k)) { e.preventDefault(); Replay.save(true); return; }
    // F8 loads the autosave (README) -- and it used to do so mid-game with no confirmation, while the
    // help text advertised F8 as a camera slot. A running game asks first. (REVIEW-M17)
    if (k === 'F8') { e.preventDefault(); if (Replay.hasAutosave() && (!this.running || typeof confirm !== 'function' || confirm('Load the autosave? The game in progress will be lost.'))) Replay.loadAutosave(); return; }
    if ((k === 'm' || k === 'M') && e.ctrlKey) { Sound.setMuted(!Sound.muted); e.preventDefault(); const hp = G.players[G.human]; if (hp) hp.msg(Sound.muted ? 'Sound muted.' : 'Sound on.', 'info'); return; }   // plain M is the Move command
    if ((k === 'v' || k === 'V') && e.ctrlKey && this.mode === 'replay') { this.viewAll = !this.viewAll; e.preventDefault(); return; }
    if ((k === 'b' || k === 'B') && e.ctrlKey && this.mode === 'replay') { this.branchReplay(); e.preventDefault(); return; }
    if (this.mode === 'replay') { // observer controls: whose vision, production overlay, scrubbing
      if (k === '[') { this.cycleObserved(-1); this.viewAll = false; return; }
      if (k === ']') { this.cycleObserved(1); this.viewAll = false; return; }
      if (k === 'o' || k === 'O') { this.prodOverlay = !this.prodOverlay; return; }
      if (k === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); this.seekTo(G.frame - TPS * 30); return; }
      if (k === 'ArrowRight' && e.shiftKey) { e.preventDefault(); this.seekTo(G.frame + TPS * 30); return; }
      if (k === 'Home') { e.preventDefault(); this.seekTo(0); return; }
    }
    // Only when there is a subgroup to cycle to: Tab is also the card's page-turn key (the 'More' button,
    // UI.paginate), and this line used to swallow it in Brood War hotkey mode. (REVIEW-M17)
    if (this.hit('cycleSubgroup', e, k) && this.subgroupKinds().length > 1) { e.preventDefault(); this.cycleSubgroup(e.shiftKey ? -1 : 1); return; }   // Brood War cycles the card through the kinds in a mixed selection
    if (this.hit('idleWorker', e, k)) { this.idleWorker(); return; }
    if (this.hit('centerSel', e, k)) { e.preventDefault(); this.centerOnSelection(); return; }
    if (this.hit('selectArmy', e, k)) { e.preventDefault(); this.selectArmy(); return; }
    if (this.hit('help', e, k)) { this.showHelp = !this.showHelp; return; }
    if (k === 'F9' || k === 'Pause') { if (!this.net) G.paused = !G.paused; return; }
    // Speed and zoom share the +/- row, so zoom takes SHIFT and speed takes the bare key. The
    // strategic zoom shipped with no keyboard access at all -- only the wheel -- which left it
    // unusable to anyone playing with a trackpad that swallows wheel events.
    if (this.hit('zoomIn', e, k)) { Render.setZoom(Render.zoom * 1.25); this.clampCam(); return; }
    if (this.hit('zoomOut', e, k)) { Render.setZoom(Render.zoom / 1.25); this.clampCam(); return; }
    // In a network game the host's delay sets the pace (Net.speed) and these keys used to move a number
    // nothing read; say so instead of pretending.
    if (this.hit('speedUp', e, k) || this.hit('speedDown', e, k)) { if (this.net) { const hp = G.players[G.human]; if (hp) hp.msg('The host sets the speed in a network game.', 'info'); return; } this.speedIdx = this.hit('speedUp', e, k) ? Math.min(this.maxSpeedIdx(), this.speedIdx + 1) : Math.max(0, this.speedIdx - 1); return; }
    // The most recent alert, whether it was ours (UI.ping) or an ally's (G.signal records those on G; the
    // key used to read only ours, so an ally's ping never became "jump to last alert").
    if (this.hit('lastAlert', e, k)) { const a = [this.lastAlertPos, G.lastAlertPos].filter(Boolean).sort((p, q) => (q.f || 0) - (p.f || 0))[0]; if (a) this.centerOn(a.x, a.y); return; }
    if (/^[0-9]$/.test(k)) { if (e.ctrlKey) { this.groups[k] = this.selection.slice(); e.preventDefault(); } else if (e.shiftKey) { this.groups[k] = (this.groups[k] || []).concat(this.selection.filter(u => !(this.groups[k] || []).includes(u))); } else if (this.groups[k] && this.groups[k].length) { const g = this.groups[k].filter(u => u.alive); if (this.lastGroupKey === k && performance.now() - this.lastGroupT < 400) this.centerOn(g[0].x, g[0].y); this.selection = g; this.pending = null; this.placing = null; this.cardMenu = null; this.lastGroupKey = k; this.lastGroupT = performance.now(); } return; }
    // The four camera slots the help overlay lists. F3, F5 and F8 are the codex, save and autosave keys
    // and returned above before this line while bound, so a slot that appeared only once its key had been
    // moved was one nobody could find; the pattern names the four now and RESERVED lists them. (REVIEW-M17 task 15)
    if (/^F[2467]$/.test(k)) { if (e.shiftKey) this.camSaves[k] = { x: Render.camX, y: Render.camY, z: Render.zoom }; else if (this.camSaves[k]) { if (this.camSaves[k].z) Render.setZoom(this.camSaves[k].z); Render.camX = this.camSaves[k].x; Render.camY = this.camSaves[k].y; this.clampCam(); } return; }
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
  // The single choke point for the card: build it, page it, then give every button its key. Paginating
  // HERE rather than in buildCard means every one of buildCard's many early returns is covered without
  // each having to remember, and the grid keys are assigned to the slot a button actually occupies on
  // the page it is on rather than the slot it asked for.
  GRID_KEYS: 'QWERASDFZXCV',
  currentCard() {
    const btns = this.paginate(this.buildCard());
    for (const b of btns) if (b.hk !== 'Escape' && !b.noKey) b.hk = this.cardKeyFor(b.cmd, b.slot, b.hk);   // noKey: a Cancel that destroys something has no key at all (tenth session, item 6)
    return btns;
  },
  // ---- the command card's keys, every one of them the player's to choose ----
  // Eighth session, the user's item 5: "All controls in Hotkeys should be customizable". StarCraft II's model
  // (RESEARCH-LOBBY.md section 5): a key belongs to a COMMAND, not to a button, so a command on many cards -- Move,
  // Stop, Set Rally, a Marine from any Barracks -- is one key and changes everywhere at once. Every button buildCard
  // makes names its command: 'unit:marine', 'bld:barracks' (placed from a build menu, added on, or morphed into),
  // 'upg:', 'tech:', 'abil:' and the general commands 'cmd:move' and the rest (CARD_COMMANDS). Cancel keeps Escape.
  //
  // A key is resolved in one place, cardKeyFor: the player's own key for that command if they chose one, otherwise the
  // layout's -- Standard is each command's own letter from the tables, Grid is the slot's letter from QWER / ASDF / ZXCV.
  // The two layouts keep separate sets of choices, as StarCraft II's profiles do. Keys are letters: every other key the
  // game reads is a global binding or reserved (UI.RESERVED), and onKey reads those first.
  CARD_COMMANDS: {
    move: ['Move', 'M'], stop: ['Stop', 'S'], attack: ['Attack', 'A'], patrol: ['Patrol', 'P'], hold: ['Hold Position', 'H'],
    gather: ['Gather', 'G'], return: ['Return Cargo', 'C'], repair: ['Repair', 'R'], build: ['Build', 'B'], buildAdv: ['Build Advanced', 'V'],
    rally: ['Set Rally', 'R'], selectLarvae: ['Select Larvae', 'S'], lift: ['Lift Off', 'L'], land: ['Land', 'L'], ferry: ['Ferry', 'Y'],
  },
  CARD_CMD_RE: /^(unit|bld|upg|tech|abil|cmd):[a-z0-9_]+$/i,
  cardKeyStore() {
    if (this._cardKeys) return this._cardKeys;
    let s = {}; try { s = JSON.parse(localStorage.getItem('bw_cardkeys') || '{}') || {}; } catch (e) { s = {}; }
    // Read back through the same rule setCardKey writes by, so a hand-edited or stale entry is dropped, not obeyed.
    const clean = o => { const out = {}; if (o && typeof o === 'object') for (const k of Object.keys(o)) if (this.CARD_CMD_RE.test(k) && typeof o[k] === 'string' && /^[A-Z]?$/.test(o[k])) out[k] = o[k]; return out; };
    return this._cardKeys = { standard: clean(s.standard), grid: clean(s.grid) };
  },
  cardKeys() { return this.cardKeyStore()[this.gridKeys ? 'grid' : 'standard']; },
  cardKeyFor(cmd, slot, dflt) {
    const own = this.cardKeys();
    if (cmd && Object.prototype.hasOwnProperty.call(own, cmd)) return own[cmd];
    return this.gridKeys ? (this.GRID_KEYS[slot] || '') : dflt;
  },
  // A letter, or '' for no key at all. Anything else is refused and nothing is stored.
  setCardKey(cmd, key) {
    if (!this.CARD_CMD_RE.test(String(cmd))) return false;
    const k = String(key == null ? '' : key).toUpperCase(); if (!/^[A-Z]?$/.test(k)) return false;
    this.cardKeys()[cmd] = k; this.saveCardKeys(); return true;
  },
  resetCardKey(cmd) { delete this.cardKeys()[cmd]; this.saveCardKeys(); },
  resetCardKeys() { const s = this.cardKeyStore(); s.standard = {}; s.grid = {}; this.saveCardKeys(); },
  saveCardKeys() {
    const s = this.cardKeyStore();
    try { if (!Object.keys(s.standard).length && !Object.keys(s.grid).length) localStorage.removeItem('bw_cardkeys'); else localStorage.setItem('bw_cardkeys', JSON.stringify(s)); } catch (e) { }
  },
  keyName(k) { return !k ? '' : k === ' ' ? 'Space' : k.startsWith('ctrl+') ? 'Ctrl+' + k.slice(5).toUpperCase() : k.length === 1 ? k.toUpperCase() : k; },
  // EVERY COMMAND CARD, for the Controls tab: per race the units, the larva and the egg, the buildings (and a flying one's
  // card), and the two build menus, each button with its command, label, Standard letter, slot and page. Built from DATA
  // by buildCard's own rules with everything researched and nothing queued -- and test/hotkeys.js holds it against
  // buildCard itself, card by card, so the list a player edits is the card they will see.
  cardCatalog() {
    if (this._catalog) return this._catalog;
    const K = this.CARD_COMMANDS, out = { T: [], Z: [], P: [] }, races = Object.keys(out);
    const C = id => ({ cmd: 'cmd:' + id, label: K[id][0], hk: K[id][1] });
    const unit = id => ({ cmd: 'unit:' + id, label: DATA.units[id].name, hk: DATA.units[id].hk });
    const bld = id => ({ cmd: 'bld:' + id, label: DATA.buildings[id].name, hk: DATA.buildings[id].hk });
    const abil = (id, label) => { const ab = DATA.abilities[id]; return ab ? { cmd: 'abil:' + id, label: label || ab.name, hk: ab.hk } : null; };
    const cancel = { label: 'Cancel', hk: 'Escape', pin: true };
    const card = (race, key, name, kind, btns) => { btns = btns.filter(Boolean); if (btns.length) out[race].push({ key, name, kind, buttons: this.cardSlots(btns) }); };
    const units = Object.keys(DATA.units).filter(id => { const d = DATA.units[id]; return races.includes(d.race) && !d.notUnit && !d.mine && !d.neutral; });
    // The worker first, then the larva and the egg, then the rest in the tables' order: the order a player meets them.
    const rank = id => { const d = DATA.units[id]; return d.worker && !d.mule ? 0 : d.larva ? 1 : d.egg ? 2 : 3; };
    units.sort((a, b) => rank(a) - rank(b));
    for (const id of units) {
      const d = DATA.units[id];
      if (d.larva) card(d.race, 'unit:' + id, d.name, 'unit', DATA.larvaMorphs.map(unit).concat([C('rally')]));
      else if (d.egg) { if (id === 'egg') card(d.race, 'unit:' + id, d.name, 'unit', [C('rally'), cancel]); }
      else if (d.worker) card(d.race, 'unit:' + id, d.name, 'unit', [C('move'), C('stop'), C('attack'), C('gather'), C('return'), id === 'scv' ? C('repair') : null, C('build'), C('buildAdv'), id === 'drone' ? abil('burrow', 'Burrow') : null]);
      else {
        // Six abilities at most (buildCard's `i > 10`), and 'Unload' says what it does rather than 'Unload All'.
        const abils = (d.abil || []).filter(a => DATA.abilities[a] && DATA.abilities[a].kind !== 'menu').slice(0, 6);
        const carries = !!(d.cargo || d.cargoTech);
        card(d.race, 'unit:' + id, d.name, 'unit', [C('move'), C('stop'), (d.gw || d.aw) ? C('attack') : null, C('patrol'), C('hold')]
          .concat(abils.map(a => abil(a, a === 'unload' ? 'Unload' : null)))
          .concat([carries && !abils.includes('unload') ? abil('unload', 'Unload') : null, carries ? C('ferry') : null]));
      }
    }
    for (const id of Object.keys(DATA.buildings)) {
      const d = DATA.buildings[id]; if (!races.includes(d.race) || d.neutral) continue;
      const btns = (d.produces || []).map(unit)
        .concat((d.upg || []).map(u => ({ cmd: 'upg:' + u, label: DATA.upgrades[u].name, hk: DATA.upgrades[u].hk })))
        .concat((d.tech || []).map(t => ({ cmd: 'tech:' + t, label: DATA.techs[t].name, hk: DATA.techs[t].hk })))
        .concat((d.addons || []).map(bld), d.morphTo ? [bld(d.morphTo)] : [], (d.morphOptions || []).map(bld), (d.abil || []).map(a => abil(a)))
        .concat([d.spawnsLarva ? C('selectLarvae') : null, (d.produces || []).length || d.spawnsLarva ? C('rally') : null, d.canLift ? C('lift') : null]);
      card(d.race, 'bld:' + id, d.name, 'building', btns);
      if (d.canLift) card(d.race, 'bld:' + id + ':flying', d.name + ' (flying)', 'building', [C('land')]);
    }
    for (const race of races) for (const menu of ['basic', 'adv']) {
      const w = DATA.units[RACE_INFO[race].worker];
      card(race, 'menu:' + race + ':' + menu, (w ? w.name + ': ' : '') + (menu === 'basic' ? 'Build' : 'Build Advanced'), 'menu', DATA.buildMenu[race][menu].map(bld).concat([cancel]));
    }
    return this._catalog = out;
  },
  // Where each button lands, by UI.paginate's rule: pinned buttons on the last slot of every page, the rest in order,
  // and a page's last free slot given to More when there is more than one page.
  cardSlots(btns) {
    const last = this.CARD_SLOTS - 1, pinned = btns.filter(b => b.pin), flow = btns.filter(b => !b.pin);
    const cap = pinned.length ? last : last + 1;
    let per = cap, pages = Math.max(1, Math.ceil(flow.length / per));
    if (pages > 1) { per = cap - 1; pages = Math.max(1, Math.ceil(flow.length / per)); }
    return flow.map((b, i) => Object.assign({}, b, { slot: i % per, page: Math.floor(i / per) }))
      .concat(pinned.map(b => Object.assign({}, b, { slot: last, page: -1 })))
      .concat(pages > 1 ? [{ label: 'More', hk: 'Tab', more: true, slot: pinned.length ? last - 1 : last, page: -1 }] : []);
  },
  // How many cards each command is on, for the Controls tab to say what a change reaches.
  cardUses() {
    if (this._cardUses) return this._cardUses;
    const n = {}; for (const race of Object.keys(this.cardCatalog())) for (const c of this.cardCatalog()[race]) for (const b of c.buttons) if (b.cmd) n[b.cmd] = (n[b.cmd] || 0) + 1;
    return this._cardUses = n;
  },
  // What is wrong with a card's keys as they stand, by command: a letter two buttons on one page share (onKey presses
  // the first), or a letter an Interface binding holds (onKey reads those before the card, so the button never hears it).
  cardClashes(card) {
    const out = {}, binds = this.bindings();
    const pages = [...new Set(card.buttons.map(b => b.page).filter(p => p >= 0))]; if (!pages.length) pages.push(0);
    for (const pg of pages) {
      const on = card.buttons.filter(b => b.page === pg || b.page === -1).map(b => ({ b, k: b.hk === 'Escape' ? '' : String(b.more ? (this.gridKeys ? this.GRID_KEYS[b.slot] : '') : this.cardKeyFor(b.cmd, b.slot, b.hk)).toUpperCase() }));
      for (const x of on) {
        if (!x.k || !x.b.cmd) continue;
        const twin = on.find(y => y !== x && y.k === x.k);
        if (twin) out[x.b.cmd] = x.k + ' is also ' + twin.b.label + ' on this card';
        const g = Object.keys(binds).find(id => binds[id].key && binds[id].key.length === 1 && binds[id].key.toUpperCase() === x.k);
        if (g) out[x.b.cmd] = x.k + ' is ' + binds[g].label + ' (Interface), which is read first';
      }
    }
    return out;
  },
  // ---------------- commands ----------------
  ownSel() { return this.selection.filter(u => u.owner === G.human && u.alive); },
  // WHO STAYS SELECTED. The dead leave, and so does anything loaded into a Bunker or a transport -- it is
  // cargo then, shown in the carrier's own panel, the way both StarCraft games do it. A worker INSIDE A GAS
  // BUILDING does not leave (seventh session, item 6). This pass used to drop every unit that was `inside`
  // anything, every frame, so a worker selected on its way to a Refinery vanished from the selection the
  // moment it went in and never came back, and the unit panel's own "Harvesting gas" line -- which existed --
  // could never be seen. The simulation was already safe for it: an order given to a worker inside a gas
  // building brings it out first (Unit.applyOrder, REVIEW-M17), so it can stay selected and be commanded.
  keepSelected(u) { return !!u && u.alive && (!u.inside || !!(u.inside.def && u.inside.def.onGeyser)); },
  pruneSelection() { this.selection = this.selection.filter(u => this.keepSelected(u)); },
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
    // A worker inside a Refinery is centred on at the Refinery: its own x/y is frozen where it went in.
    const sel = this.selection.filter(u => this.keepSelected(u)); if (!sel.length) return;
    let x = 0, y = 0; for (const u of sel) { const at = u.inside || u; x += at.x; y += at.y; }
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
  // ==========================================================================
  // FREEHAND FORMATION SHAPES -- FIXLIST-M14 C7 (item 16)
  // ==========================================================================
  // The right-drag line works and the player said so, so the ask was to keep it and let the mouse's
  // ACTUAL PATH be the shape: parabolas, arcs, curves.
  //
  // DETERMINISM WAS THE WHOLE RISK, and the architecture had already answered it. A formation does not
  // enter the command log as a shape -- lineCommand RESOLVES it into one ordinary move order per unit,
  // and it is those that CMD packs. So the log carries the OUTCOME rather than the input, which is a
  // stronger guarantee than quantising a path and shipping it: there is no path in the log to
  // re-derive, no mouse state at replay time, and a replay issues the same N moves to the same N units.
  // The curve does exactly the same thing, so it inherits that for free and adds no new command kind.
  //
  //   CURVE_STEP  how far the mouse must travel before another sample is kept. Small enough that a
  //               deliberate arc is captured, large enough that a shaky hand is not.
  //   CURVE_MAX   the cap the item asked for. A drag that wanders for a minute is still one gesture;
  //               past this the OLDEST sample is dropped, keeping the recent shape, which is the part
  //               the player is still looking at. 160 samples is longer than any map's diagonal.
  //   CURVE_BEND  how far off the straight chord the path must stray, in pixels, before it counts as a
  //               curve at all. Below it the drag takes the original straight-line path untouched.
  CURVE_STEP: 12, CURVE_MAX: 160, CURVE_BEND: 22,
  // Is this drag actually curved? Maximum perpendicular distance from the chord joining its ends.
  // Conservative on purpose: a straight drag with a wobble in it is a straight drag, and the original
  // line command -- which players already like -- is what it must still get.
  curved(pts) {
    if (!pts || pts.length < 6) return false;
    const x0 = pts[0], y0 = pts[1], x1 = pts[pts.length - 2], y1 = pts[pts.length - 1];
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1) return true;   // a closed loop has no chord to be straight along; treat it as a shape
    const ux = dx / len, uy = dy / len;
    let worst = 0;
    for (let i = 2; i < pts.length - 2; i += 2) {
      const rx = pts[i] - x0, ry = pts[i + 1] - y0;
      const perp = Math.abs(-rx * uy + ry * ux);
      if (perp > worst) worst = perp;
    }
    return worst >= this.CURVE_BEND;
  },
  // Walk a polyline and return the point at arc-length `s`. One helper, used by the command and by the
  // preview, so the pips cannot end up anywhere other than where the units are actually sent.
  alongPath(pts, s) {
    let acc = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
      const seg = Math.hypot(bx - ax, by - ay);
      if (acc + seg >= s || i + 5 >= pts.length) {
        const f = seg < 1e-6 ? 0 : Math.max(0, Math.min(1, (s - acc) / seg));
        return [ax + (bx - ax) * f, ay + (by - ay) * f];
      }
      acc += seg;
    }
    return [pts[pts.length - 2], pts[pts.length - 1]];
  },
  pathLength(pts) { let t = 0; for (let i = 0; i + 3 < pts.length; i += 2) t += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]); return t; },
  // Spread the selection along the drawn curve, EVENLY BY ARC LENGTH. Screen points in, world orders
  // out -- the conversion happens here and only here, because the samples were taken on the glass.
  curveCommand(scr, shift) {
    const sel = this.ownSel().filter(u => !u.isBuilding && !u.def.larva && !u.def.egg && !u.inside);
    if (!sel.length) return;
    if (sel.length === 1) { const [wx, wy] = this.screenToWorld(scr[scr.length - 2], scr[scr.length - 1]); this.smartCommand(null, wx, wy, shift); return; }
    const pts = []; for (let i = 0; i < scr.length; i += 2) { const [wx, wy] = this.screenToWorld(scr[i], scr[i + 1]); pts.push(wx, wy); }
    const total = this.pathLength(pts);
    const n = sel.length;
    // Ordered by where each unit already sits ALONG the curve, the same idea lineCommand uses against
    // its chord: the unit nearest the start of the stroke takes the start of it, so the group does not
    // cross over itself walking into formation. Ties break on id, which is stable and replayable.
    const key = u => { let best = 0, bd = 1e18, acc = 0;
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const seg = Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
        const d = distPt(u.x, u.y, pts[i], pts[i + 1]);
        if (d < bd) { bd = d; best = acc; }
        acc += seg;
      }
      return best; };
    const order = sel.map(u => ({ u, k: key(u) })).sort((a, b) => a.k - b.k || a.u.id - b.u.id);
    for (let i = 0; i < n; i++) {
      const [gx, gy] = this.alongPath(pts, total * (i / (n - 1)));
      order[i].u.setOrder({ type: 'move', x: gx, y: gy }, shift);
    }
    this.marker(pts[0], pts[1], '120,220,255'); this.marker(pts[pts.length - 2], pts[pts.length - 1], '120,220,255');
    if (typeof Sound !== 'undefined') Sound.ack(order[0].u);
  },
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
  // arrives. And the goal has to be somewhere the unit can stand, or the far edge of a formation ends up
  // aimed into a cliff and grinds -- that is what the passable check does.
  //
  // BUT ONLY FOR A GROUP THAT IS TOGETHER (eighth session, the user's report: units "not on the same area"
  // right-clicked to one point "never go to the same point ... it's impossible to get units to group
  // together"). This used to cap each offset at SHAPE_CAP and keep it, and a cap cannot tell a formation
  // from a scatter: four SCVs spread across a base kept that spread around the point for good -- measured,
  // 194 px from their centre before the click and 194 px twenty seconds after. The rule is StarCraft II's
  // magic box now. A group keeps its shape only when it is already one clump (every unit within SHAPE_GAP
  // of another, body to body), no unit is farther than SHAPE_CAP from the middle, and the click lands
  // outside the box the group stands in. Otherwise every unit is sent to the point itself, and bodies
  // (G.separate) settle them round it: units in different places gather, and a click inside a group
  // tightens it, which is how a player masses an army. null means "send them all to the point".
  SHAPE_CAP: 7 * 32, SHAPE_GAP: 32,
  shapeOffsets(sel, wx, wy) {
    if (sel.length < 2) return null;
    const body = u => u.def.body || u.r || 0;
    let cx = 0, cy = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const u of sel) { cx += u.x; cy += u.y; const b = body(u); x0 = Math.min(x0, u.x - b); y0 = Math.min(y0, u.y - b); x1 = Math.max(x1, u.x + b); y1 = Math.max(y1, u.y + b); }
    cx /= sel.length; cy /= sel.length;
    if (wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1) return null;                      // a click inside the group gathers it
    if (sel.some(u => Math.hypot(u.x - cx, u.y - cy) > this.SHAPE_CAP)) return null;      // wider than any formation anyone meant
    if (!this.oneClump(sel, body)) return null;                                          // units in different places gather at the point
    const out = new Map();
    for (const u of sel) { const gx = wx + u.x - cx, gy = wy + u.y - cy; out.set(u, G.passable(gx, gy, u) ? [gx, gy] : [wx, wy]); }
    return out;
  },
  // One clump: every unit reachable from the first by steps between units whose bodies are at most SHAPE_GAP
  // apart. A flood rather than a radius, so a column that snakes through a choke is one clump and two squads a
  // screen apart are two.
  oneClump(sel, body) {
    const seen = new Set([sel[0]]), todo = [sel[0]];
    while (todo.length) { const a = todo.pop(); for (const b of sel) if (!seen.has(b) && Math.hypot(a.x - b.x, a.y - b.y) <= body(a) + body(b) + this.SHAPE_GAP) { seen.add(b); todo.push(b); } }
    return seen.size === sel.length;
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
        // A derelict is the one thing on the map you take by repairing rather than by shooting, so this
        // sits AHEAD of the not-mine branch below -- that branch would turn every right-click on one
        // into an attack order, which is the opposite of what the player meant. Any race's worker, per
        // `derelict.by`. Shooting one to deny it still works; that is what an explicit attack is for.
        if (u.def.worker && t.def.derelict && G.neutral && t.owner === G.neutral.id && t.hp < t.maxHp) { u.setOrder({ type: 'repair', target: t }, shift); continue; }
        if (t.owner !== G.human && !G.allied(G.human, t.owner)) { if (u.def.worker && !u.hasWeapon()) { u.setOrder({ type: 'attack', target: t }, shift); } else if (u.hasWeapon() && u.weaponFor(t)) u.setOrder({ type: 'attack', target: t }, shift); else if (u.def.worker) u.setOrder({ type: 'attack', target: t }, shift); else u.setOrder({ type: 'move', x: wx, y: wy, target: t }, shift); }
        else if (u.def.worker && t.def.onGeyser && t.done) u.setOrder({ type: 'gather', target: t, phase: 'goto' }, shift);
        else if (u.def.worker && t.isBuilding && !t.done && t.def.race === 'T') u.setOrder({ type: 'construct', target: t }, shift);
        else if (u.def.worker && t.def.depot && t.done && u.carrying) u.setOrder({ type: 'return', then: u.lastRes, depot: t }, shift);
        else if (u.def.id === 'scv' && (t.def.mech || t.isBuilding) && t.hp < t.maxHp && t.done !== false) u.setOrder({ type: 'repair', target: t }, shift);
        else if ((G.cargoCap(t) || t.def.bunker) && !u.fly && !u.isBuilding && t !== u) u.setOrder({ type: 'load', target: t }, shift);
        else if (G.cargoCap(u) && !t.fly && !t.isBuilding) u.setOrder({ type: 'pickup', target: t }, shift);
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
    // SMART CASTING (M12 item 5). This loop casts from EVERY selected unit, so eight templar with
    // storm selected produced eight storms on one spot -- eight times the energy for one storm's worth
    // of damage, and the single most expensive misclick in the game. One press is now one cast, from
    // the unit best placed to make it: enough energy first, then nearest to the target, then lowest id
    // so the choice is stable and a replay reproduces it.
    //
    // Deliberately not applied to `auto` abilities, which are the toggles and instant self-casts where
    // "all of them" is exactly what the player means (stim, cloak, siege, burrow).
    if (p.kind === 'ability' && sel.length > 1) {
      const ab = DATA.abilities[p.abil];
      if (ab && !ab.auto) {
        const cost = ab.energy || 0;
        const able = sel.filter(x => x.alive && !x.disabled && (!cost || (x.energy || 0) >= cost));
        const pool = able.length ? able : sel;
        pool.sort((a, b) => distPt(a.x, a.y, wx, wy) - distPt(b.x, b.y, wx, wy) || a.id - b.id);
        sel = [pool[0]];
      }
    }
    for (const u of sel) {
      if (u.isBuilding && !u.lifted && p.kind !== 'ability') continue;
      switch (p.kind) {
        case 'move': if (t) u.setOrder({ type: 'follow', target: t }, shift); else u.setOrder({ type: 'move', x: wx, y: wy }, shift); break;
        // THE ATTACK COMMAND ON A UNIT ATTACKS THAT UNIT, WHOEVER OWNS IT (tenth session, item 1; the user: "if we click the
        // 'attack' button in the hud... and we select our own unit/building, that should bypass and allow our units to attack
        // our own buildings/units, like in starcraft (applies to drones/probes/scv as well)"). An own or allied target used
        // to become an attack-move to the spot, so there was no way to kill your own blocking depot or an infested unit. The
        // RIGHT-click never attacks your own side (smartCommand) -- that half is unchanged. A unit told to attack itself
        // attack-moves to the spot instead, as the rest of the selection does.
        case 'attack': if (t && t !== u) u.setOrder({ type: 'attack', target: t }, shift); else u.setOrder({ type: 'attackmove', x: wx, y: wy }, shift); break;
        case 'patrol': u.setOrder({ type: 'patrol', x: wx, y: wy }, shift); break;
        case 'gather': { const res = G.map.resourceAt(Math.floor(wx / TILE), Math.floor(wy / TILE)); if (res && res.type === 'mineral') u.setOrder({ type: 'gather', target: res, phase: 'goto' }, shift); else if (t && t.def.onGeyser) u.setOrder({ type: 'gather', target: t, phase: 'goto' }, shift); break; }
        case 'repair': if (t && t.owner === G.human) u.setOrder({ type: 'repair', target: t }, shift); break;
        case 'unload': u.setOrder({ type: 'unload', x: wx, y: wy }, shift); break;
        // The near end is wherever this transport is standing right now, so the route needs one click
        // rather than two. Starting on leg 'a' means it loads before its first run even though it is
        // already there -- moveTo returns true immediately and the same frame begins picking up.
        case 'ferry': u.setOrder({ type: 'ferry', ax: u.x, ay: u.y, bx: wx, by: wy, leg: 'a', since: null }, shift); break;
        case 'ability': { const ab = DATA.abilities[p.abil]; if (ab.kind === 'unit') { if (t) { Abilities.issue(u, p.abil, t, wx, wy, shift); if (!ab.auto) { this.marker(wx, wy, '120,200,255'); return; } } } else Abilities.issue(u, p.abil, null, wx, wy, shift); if (ab.kind === 'point' && ['psi_storm', 'nuke', 'emp', 'stasis_field', 'maelstrom', 'plague', 'ensnare', 'dark_swarm', 'disruption_web', 'recall', 'scanner_sweep'].includes(p.abil)) { this.marker(wx, wy, '120,200,255'); return; } break; }
      }
    }
    this.marker(wx, wy, p.kind === 'attack' ? '255,60,60' : '80,255,80'); Sound.ack(sel[0]);
  },
  // PLANNED BUILDINGS (seventh session, item 9). Every building one of your workers has been told to put down and
  // has not put down yet: its CURRENT order if that is a build -- it is on its way -- and every build in its
  // shift-queue. One reader, used by the ghosts Render.drawPlannedBuilds draws and by the placement check below, so
  // what you see planned and what you are stopped from placing over cannot disagree. `except` leaves one worker's
  // plans out: a placement WITHOUT shift replaces that worker's whole queue (Unit.setOrder), so its old sites are
  // about to stop existing and must not block the new one.
  plannedBuilds(except) {
    const out = [];
    for (const u of G.units) {
      if (!u.alive || u.owner !== G.human || !u.def.worker || u === except) continue;
      if (u.order && u.order.type === 'build' && u.order.def) out.push({ u, def: u.order.def, tx: u.order.tx, ty: u.order.ty });
      if (u.queue) for (const o of u.queue) if (o && o.type === 'build' && o.def) out.push({ u, def: o.def, tx: o.tx, ty: o.ty });
    }
    return out;
  },
  // The planned site a footprint would overlap, or null. This is the half that stops the accident the user described:
  // the ghost shows you where the last one went, and this refuses to put a second one on top of it.
  plannedOverlap(def, tx, ty, builder, shift) {
    for (const s of this.plannedBuilds(shift ? null : builder)) {
      if (tx < s.tx + s.def.w && s.tx < tx + def.w && ty < s.ty + s.def.h && s.ty < ty + def.h) return s;
    }
    return null;
  },
  PLANNED_MSG: 'A building is already planned there.',
  confirmPlacement(shift) {
    const pl = this.placing; const p = G.players[G.human]; const err = G.map.canPlace(pl.def, pl.tx, pl.ty, p, G.units, pl.builder);
    if (err) { p.msg(err, 'error'); return; }
    // Not for a Terran building LANDING: that is the building itself moving, and its own old site is no plan.
    if (!pl.land && this.plannedOverlap(pl.def, pl.tx, pl.ty, pl.builder, shift)) { p.msg(this.PLANNED_MSG, 'error'); return; }
    if (pl.land) { pl.builder.setOrder({ type: 'land', tx: pl.tx, ty: pl.ty }, shift); Sound.ack(pl.builder); this.placing = null; this.cardMenu = null; return; }
    if (!p.canAfford(pl.def.min, pl.def.gas)) return;
    pl.builder.setOrder({ type: 'build', def: pl.def, tx: pl.tx, ty: pl.ty }, shift); Sound.ack(pl.builder);
    if (!shift) { this.placing = null; this.cardMenu = null; }
  },
  ping(x, y) { this.pings.push({ x, y, t: 90 }); this.lastAlertPos = { x, y, f: G.frame }; },
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
  // How wide the command-card tooltip is allowed to get, in pixels, before a description wraps. A
  // sentence is longer than a price, so without a cap the popup grows to the width of the longest
  // def in the game and covers the map it is describing. 260 holds about six words a line at size 10.
  TIP_W: 260,
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
    // THE PAGE TURN NEEDS A SLOT OF ITS OWN -- FIXLIST-M14 B5 (item 15), and this is the whole of the
    // "the more 1/2 button does nothing" report.
    //
    // `per` used to be the FULL remaining capacity, so a card of exactly one page's worth plus a bit
    // filled every slot and the More button was then pushed on top of the last one. Measured on the
    // Starport with a Control Tower: fourteen flowed buttons, twelve slots, so page one held slots
    // 0..11 AND a "More 1/2" also at slot 11. UI.consoleClick returns on the first button whose rect
    // contains the click and the flowed one comes first in the array, so pressing "More 1/2" actually
    // pressed Apollo Reactor. The page could never turn, and the tooltip under the cursor named the
    // wrong thing -- which is the second half of the same report, from the same cause.
    //
    // Two passes because it is circular: whether a page button is needed depends on how many pages
    // there are, which depends on whether a page button is taking a slot.
    const cap = pinned.length ? last : last + 1;
    let per = cap, pages = Math.max(1, Math.ceil(flow.length / per));
    if (pages > 1) { per = cap - 1; pages = Math.max(1, Math.ceil(flow.length / per)); }
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
    // `cmd` is the command the button's key belongs to (UI.cardKeyFor). An ability button's is its ability; C() is the
    // general commands', whose labels and letters live in UI.CARD_COMMANDS so the Controls tab lists the same ones.
    const B = (slot, label, hk, fn, o = {}) => btns.push(Object.assign({ slot, label, hk, fn, cmd: o.abil ? 'abil:' + o.abil : undefined }, o));
    const C = (slot, id, fn, o) => B(slot, this.CARD_COMMANDS[id][0], this.CARD_COMMANDS[id][1], fn, Object.assign({ cmd: 'cmd:' + id }, o));
    // Why a greyed button is greyed, for UI.press to say out loud. Player.missingReq already knew;
    // nothing ever asked it on behalf of the command card.
    const why = def => { const m = p.missingReq(def); return m ? 'Requires ' + m : null; };
    const setPending = (kind, abil) => () => { this.pending = { kind, abil }; };
    if (this.cardMenu === 'basic' || this.cardMenu === 'adv') {
      const list = DATA.buildMenu[p.race][this.cardMenu]; list.forEach((id, i) => { const d = DATA.buildings[id]; const ok = p.hasReq(d); B(i, d.name, d.hk, () => { this.placing = { def: d, builder: u, tx: Math.floor(this.mouse.wx / TILE - d.w / 2 + .5), ty: Math.floor(this.mouse.wy / TILE - d.h / 2 + .5) }; }, { cmd: 'bld:' + id, cost: d, enabled: ok, dim: !ok, why: why(d) }); });
      B(this.CARD_SLOTS - 1, 'Cancel', 'Escape', () => { this.cardMenu = null; }, { pin: true }); return btns;
    }
    // The morphed larva stays in the selection. larvaMorph reuses the object, so the egg IS the larva
    // and its rally can be set the instant it morphs; the filter drops only what actually died. Eggs are
    // skipped by the `l.def.larva` test below, so the next press still morphs the next larva.
    // THE LARVA CARD -- FIXLIST-M15 B1 and B3, which are one bug.
    //
    // Set Rally used to be emitted FIRST, asking for slot 6. UI.paginate ignores the slot a flowed
    // button asks for -- it renumbers by array index -- so Set Rally took slot 0 and pushed every
    // morph one place right. Drone was not in the top-left corner of its own card, and the whole
    // ladder was off by one.
    //
    // That is also where the second, unexplained half of item 6 came from. With grid hotkeys on, keys
    // are assigned by SLOT from 'QWERASDFZXCV', so the shift moved D off Queen and onto SCOURGE.
    // Pressing D -- which every player reads as Drone -- hit a greyed Scourge and answered
    // 'Requires Spire'. Reproduced exactly: with normal keys D at the supply cap says 'Spawn more
    // overlords.', and with grid keys the same press at the same cap says 'Requires Spire'.
    //
    // So the morphs are emitted first and Set Rally last. Note that B()'s slot argument is decorative
    // for anything not pinned; ARRAY ORDER is what decides the card.
    if (u.def.larva) {
      DATA.larvaMorphs.forEach(id => {
        const d = DATA.units[id], ok = p.hasReq(d);
        // ONE CLICK IS ONE ATTEMPT. This used to walk every selected larva and only stop on SUCCESS,
        // so a refusal was announced once per larva -- three selected larvae at the supply cap gave
        // three identical 'Spawn more overlords.' errors from one keypress, which is the first half
        // of item 6. Every larva is interchangeable: if one cannot morph for cost, supply or
        // requirements, none of them can, so trying the rest can only repeat the same refusal.
        B(0, d.name, d.hk, () => {
          const l = sel.find(x => x.def.larva);
          if (l && G.larvaMorph(l, id)) this.selection = this.selection.filter(x => x.alive);
        }, { cmd: 'unit:' + id, cost: d, enabled: ok, dim: !ok, why: why(d) });
      });
      C(0, 'rally', setPending('rally'));
      return btns;
    }
    if (u.def.egg) { C(6, 'rally', setPending('rally')); B(this.CARD_SLOTS - 1, 'Cancel', '', () => { for (const e of sel) G.cancelProd(e, 0); }, { pin: true, noKey: true }); return btns; }   // no Escape: Escape is the menu (item 6)
    // Several buildings at once. Brood War shows the first one's card and applies what you press to all
    // of them that can do it, which is what makes "select every hatchery, press S" work. The card is
    // built from `u` as before; only the actions below fan out. Buildings that cannot do the thing are
    // simply skipped, so a hatchery, a lair and a hive together behave as one larva pool.
    if (u.isBuilding && sel.length > 1) {
      const halls = sel.filter(b => b.isBuilding && b.done && !b.lifted);
      const lv = []; for (const b of halls) if (b.def.spawnsLarva) for (const l of b.larvae) if (l.alive && l.def.larva) lv.push(l);
      if (lv.length) C(7, 'selectLarvae', () => { this.selection = lv.slice(0, 24); this.cardMenu = null; this.pending = null; },
        { count: lv.length, enabled: true });
      if (halls.some(b => b.def.produces.length || b.def.spawnsLarva)) C(6, 'rally', setPending('rally'));
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
        }, { cmd: 'unit:' + id, cost: ud, enabled: ok, dim: !ok, why: why(ud) });
        if (j > 5) break;
      }
      return btns;
    }
    // MULTI-BUILDING PRODUCTION (M12 item 3). The card used to require a selection of exactly one
    // building, so five barracks meant five clicks on five buildings to queue five marines. Now any
    // number of buildings of the SAME type share one card, and a production button goes to whichever
    // of them has the shortest queue -- which is what a player doing it by hand is trying to achieve.
    //
    // Same type only, deliberately. A mixed selection of a barracks and a factory has no shared card
    // and no sensible answer to "queue a marine"; Tab already cycles the subgroup for that case.
    // Research and upgrades stay on ONE building even when several are selected: queueing the same
    // upgrade five times is a mistake every time, not a shortcut.
    const bldGroup = sel.length > 1 && sel.every(x => x.isBuilding && x.def.id === sel[0].def.id && x.done && !x.lifted) ? sel : null;
    if (u.isBuilding && (sel.length === 1 || bldGroup)) {
      const d = u.def; let i = 0;
      // the building a production order should go to: fewest items queued, ties broken by id so it is
      // stable frame to frame and does not jitter between two equal buildings
      const target = () => (bldGroup ? bldGroup.slice().sort((a, b) => a.prod.length - b.prod.length || a.id - b.id)[0] : u);
      if (!u.done) { B(this.CARD_SLOTS - 1, 'Cancel', '', () => G.cancelBuilding(u), { pin: true, noKey: true }); return btns; }
      if (u.lifted) { C(0, 'land', () => { this.placing = { def: d, builder: u, land: true, tx: 0, ty: 0 }; }); return btns; }
      for (const id of d.produces) { const ud = DATA.units[id]; const ok = p.hasReq(ud); B(i++, ud.name, ud.hk, () => G.queueUnit(target(), id), { cmd: 'unit:' + id, cost: ud, enabled: ok, dim: !ok, why: why(ud) }); }
      for (const id of d.upg) { const ud = DATA.upgrades[id]; const lvl = p.upgLevel(id); if (lvl >= 3) continue; const rq = ud.req[lvl]; const ok = !rq || p.hasBuilding(rq); B(i++, ud.name + ' L' + (lvl + 1), ud.hk, () => G.queueUpgrade(u, id), { cmd: 'upg:' + id, cost: { min: ud.min[lvl], gas: ud.gas[lvl], time: ud.time[lvl] }, enabled: ok && !p.researching.has(id), dim: !ok || p.researching.has(id), why: !ok && rq ? 'Requires ' + DATA.buildings[rq].name : p.researching.has(id) ? 'Already researching.' : null }); }
      for (const id of d.tech) { const td = DATA.techs[id]; if (p.tech.has(id)) continue; const ok = !td.req || p.hasReq(td); B(i++, td.name, td.hk, () => G.queueTech(u, id), { cmd: 'tech:' + id, cost: td, enabled: ok && !p.researching.has(id), dim: !ok || p.researching.has(id), why: !ok ? why(td) : p.researching.has(id) ? 'Already researching.' : null }); }
      // AN ADD-ON KEEPS ITS OWN CARD -- FIXLIST-M14 B5 (item 15). This block used to copy the add-on's
      // tech, abilities and production onto its PARENT, which is what put "Apollo Reactor" on a
      // Starport and Scanner Sweep on a Command Center. Measured across all seven Terran parent/add-on
      // pairs: six of the seven leaked, and the Starport and Factory leaked enough to push their cards
      // past twelve slots and into the paging bug directly above.
      //
      // It is deleted rather than moved, because there is nowhere to move it TO: an add-on is a real
      // building with its own footprint, so it is already clickable and buildCard already gives it its
      // own card from its own `tech`, `abil` and `produces`. Select the Control Tower and Apollo
      // Reactor is there; select the Comsat and Scanner Sweep is there. The parent still names what is
      // attached to it, on the unit panel: "Add-on: Control Tower".
      //
      // The one thing this changes for a player: Scanner Sweep and building a nuke are now done from
      // the add-on, which is where Brood War does them.
      if (!u.addon) for (const id of d.addons) { const ad = DATA.buildings[id]; const ok = p.hasReq(ad); B(i++, ad.name, ad.hk, () => G.queueAddon(u, id), { cmd: 'bld:' + id, cost: ad, enabled: ok, dim: !ok, why: why(ad) }); }
      if (d.morphTo) { const nd = DATA.buildings[d.morphTo]; const ok = p.hasReq(nd); B(i++, nd.name, nd.hk, () => G.queueMorph(u, d.morphTo), { cmd: 'bld:' + d.morphTo, cost: nd, enabled: ok, dim: !ok, why: why(nd) }); }
      if (d.morphOptions) for (const id of d.morphOptions) { const nd = DATA.buildings[id]; const ok = p.hasReq(nd); B(i++, nd.name, nd.hk, () => G.queueMorph(u, id), { cmd: 'bld:' + id, cost: nd, enabled: ok, dim: !ok, why: why(nd) }); }
      // Abilities.label, not ab.name: a toggle's button says what pressing it will DO (a Supply Depot's Lower / Raise).
      if (d.abil) for (const id of d.abil) { const ab = DATA.abilities[id]; if (!Abilities.available(u, id)) continue; if (ab.kind === 'instant') B(i++, Abilities.label(u, id), ab.hk, () => Abilities.issue(u, id), { abil: id }); else B(i++, ab.name, ab.hk, () => { this.pending = { kind: 'ability', abil: id }; }, { energy: ab.energy, abil: id }); }
      // Select Larvae, as Brood War has it on S. Without this the only way to morph is to click each
      // larva individually, which is not how anyone plays Zerg: you select the hall, take its larvae,
      // and press the morph key once per larva.
      if (d.spawnsLarva) { const lv = u.larvae.filter(l => l.alive && l.def.larva);
        C(7, 'selectLarvae', () => { this.selection = lv.slice(); this.cardMenu = null; this.pending = null; },
          { enabled: lv.length > 0, dim: !lv.length, why: lv.length ? null : 'No larvae have hatched yet.' }); }
      if (d.produces.length || d.spawnsLarva) C(6, 'rally', setPending('rally'));
      if (d.canLift && !u.prod.length) C(7, 'lift', () => G.liftBuilding(u));
      if (u.prod.length) B(8, 'Cancel', '', () => G.cancelProd(u, u.prod.length - 1), { noKey: true });
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
      C(0, 'move', setPending('move')); C(1, 'stop', () => mobile.forEach(x => x.stop())); C(2, 'attack', setPending('attack'));
      C(3, 'gather', setPending('gather')); C(4, 'return', () => mobile.forEach(x => { if (x.carrying) x.setOrder({ type: 'return', then: x.lastRes }); }));
      if (all(x => x.def.id === 'scv')) C(5, 'repair', setPending('repair'));
      C(6, 'build', () => { this.cardMenu = 'basic'; }); C(7, 'buildAdv', () => { this.cardMenu = 'adv'; });
      if (all(x => x.def.id === 'drone') && p.hasTech('burrow_tech')) B(8, mobile[0].burrowed ? 'Unburrow' : 'Burrow', DATA.abilities.burrow.hk, () => mobile.forEach(x => Abilities.issue(x, 'burrow')), { cmd: 'abil:burrow' });
      return btns;
    }
    C(0, 'move', setPending('move')); C(1, 'stop', () => mobile.forEach(x => x.stop()));
    if (any(x => x.hasWeapon())) C(2, 'attack', setPending('attack'));
    C(3, 'patrol', setPending('patrol')); C(4, 'hold', () => mobile.forEach(x => x.setOrder({ type: 'hold' })));
    let i = 5;
    // abilities common to selection (by first unit's def), only if all share the ability
    const abils = (mobile[0].def.abil || []).filter(id => Abilities.available(mobile[0], id) && all(x => (x.def.abil || []).includes(id) || x.def.id === mobile[0].def.id));
    for (const id of abils) {
      // SIX ABILITY SLOTS, not four. `i > 8` was the 3x3 command card's ceiling and it was never raised
      // when the card grew to 4x3 in M11 -- slots 9, 10 and 11 have been sitting empty on every unit
      // card in the game since. The Queen is what found it (FIXLIST-M14 C3 gives her a sixth ability),
      // and four was already one too few: the js/data.js comment above her def records that `infest`
      // fell off the end and calls it a deliberate loss. It is not a loss any more.
      //
      // Ten and not eleven: slot 11 is the one UI.paginate reserves for a page turn, so leaving it free
      // means a seventh ability pages rather than colliding -- which is the bug B5 was about.
      if (i > 10) break; const ab = DATA.abilities[id]; const label = Abilities.label(mobile[0], id);
      if (id === 'unload') B(i++, 'Unload', 'U', setPending('unload'), { abil: id }); // targeted unload (click a spot); the cargo wireframes unload single units
      else if (ab.kind === 'toggle' || ab.kind === 'instant') B(i++, label, ab.hk, () => mobile.forEach(x => Abilities.issue(x, id)), { abil: id });
      else if (ab.kind === 'morph') B(i++, label, ab.hk, () => mobile.forEach(x => Abilities.issue(x, id)), { cost: DATA.units[ab.unit], abil: id });
      else if (ab.kind === 'merge') B(i++, label, ab.hk, () => Abilities.merge(mobile, id), { abil: id });
      else if (ab.kind === 'produce') B(i++, label, ab.hk, () => mobile.forEach(x => G.queueUnit(x, ab.unit)), { cost: DATA.units[ab.unit], abil: id });
      else B(i++, label, ab.hk, () => { this.pending = { kind: 'ability', abil: id }; }, { energy: ab.energy, abil: id });
    }
    if (mobile.some(x => x.cargo.length) && !abils.includes('unload')) B(Math.min(8, i++), 'Unload', DATA.abilities.unload.hk, setPending('unload'), { cmd: 'abil:unload' });
    // A ferry route. Offered on anything that can actually carry something, loaded or not -- the whole
    // point is to set it up BEFORE there is anything to move.
    if (mobile.some(x => G.cargoCap(x))) C(i++, 'ferry', setPending('ferry'));
    // mixed selections still get the merge buttons when at least two templar of a kind are selected
    for (const [id, want] of [['summon_archon', 'high_templar'], ['summon_dark_archon', 'dark_templar']]) if (!abils.includes(id) && i <= 8 && mobile.filter(x => x.def.id === want && !x.disabled).length >= 2) { const ab = DATA.abilities[id]; B(i++, ab.name, ab.hk, () => Abilities.merge(mobile, id), { abil: id }); }
    return btns;
  },
  consoleClick(x, y, button) {
    if (this.inMinimap(x, y)) { const [wx, wy] = this.miniToWorld(x, y); if (button === 2) { const t = this.unitAt(wx, wy); if (this.pending) this.execPending(t, wx, wy, false); else this.smartCommand(t, wx, wy, this.keys.Shift); } else if (this.pending) { this.execPending(null, wx, wy, false); } else { this.centerOn(wx, wy); this.miniDrag = true; } return; }
    // Right-click on a card button ARMS an autocastable ability (M12 item 6). This used to return
    // immediately on any non-left button, so the card had no right-click behaviour at all.
    const cr = this.cardRect();
    if (button === 2) {
      for (const b of this.currentCard()) {
        const gap = cr.gap !== undefined ? cr.gap : 4, pad = cr.pad !== undefined ? cr.pad : 4;   // pad: the card's inner margin, which scales with the HUD (TODO-M18 item 5)
        const bx = cr.x + pad + (b.slot % this.CARD_COLS) * (cr.bw + gap), by = cr.y + pad + Math.floor(b.slot / this.CARD_COLS) * (cr.bh + gap);
        if (x < bx || x >= bx + cr.bw || y < by || y >= by + cr.bh) continue;
        const id = b.abil; const ab = id && DATA.abilities[id];
        if (!ab || !ab.autocast) return;
        const units = this.ownSel().filter(u => (u.def.abil || []).includes(id) || (u.def.produces || []).includes(ab.unit));
        if (!units.length) return;
        // Decided here rather than read back from setAutocast: it goes through the command log now, and in
        // a net game the wrapper queues the command and returns true before anything has changed.
        const on = !units.every(u => u.armed && u.armed.has(id));
        G.setAutocast(units, id, on);
        G.players[G.human].msg(ab.name + (on ? ' autocast ON' : ' autocast OFF'), 'info');
        Sound.click(); return;
      }
      return;
    }
    if (button !== 0) return;
    for (const b of this.currentCard()) { const gap = cr.gap !== undefined ? cr.gap : 4, pad = cr.pad !== undefined ? cr.pad : 4; const bx = cr.x + pad + (b.slot % this.CARD_COLS) * (cr.bw + gap), by = cr.y + pad + Math.floor(b.slot / this.CARD_COLS) * (cr.bh + gap); if (x >= bx && x < bx + cr.bw && y >= by && y < by + cr.bh) { this.press(b); return; } }
    // info panel: selection wireframes / queue / cargo
    for (const h of this.hotspots) if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) { h.fn(); Sound.click(); return; }
  },
  hotspots: [],
  // The day/night dial. Drawn only on a map that actually has a cycle -- G.daylight is a flat 1 on
  // every other map, so a permanently-noon sun in the corner of Lost Ruins would be furniture that
  // means nothing, and the player would learn to stop reading it.
  //
  // The countdown is the point, not the icon. "Night is a window you plan a raid inside" is the whole
  // design of the feature (see daylightAt in js/game.js), and a window you cannot see coming is just a
  // period where you lose fights for no visible reason -- which is exactly how it was reported. So the
  // dial says how long until the light changes, and that is the number to act on.
  //
  // The forward scan is capped and CACHED PER SECOND. Stepping a whole cycle at 24 fps to find the next
  // threshold is 720 coarse samples; doing that every drawn frame would be 43,000 a second for a label.
  // Cached on the second, it is 720 once a second, which is free. It reads daylightAt, a pure function
  // of a frame number, so this is a render-side query of the simulation's clock and writes nothing.
  dayPhase() {
    if (typeof MAP_LAYOUTS === 'undefined' || typeof daylightAt !== 'function') return null;
    const L = MAP_LAYOUTS[G.layout];
    if (!L || !L.dayNight) return null;
    const d = G.daylight, sec = Math.floor(G.frame / TPS);
    if (this._dayCache && this._dayCache.sec === sec) return this._dayCache.v;
    const DARK = 0.15, LIGHT = 0.85;
    const state = x => (x >= LIGHT ? 'day' : x <= DARK ? 'night' : 'twilight');
    const now = state(d), rising = daylightAt(G.frame + TPS) > d;
    // ...to the next state change, whatever it is
    let until = 0;
    for (let k = 1; k <= 720; k++) { const f = G.frame + k * TPS; if (state(daylightAt(f)) !== now) { until = k; break; } }
    const name = now === 'day' ? 'Day' : now === 'night' ? 'Night' : (rising ? 'Dawn' : 'Dusk');
    const nextName = now === 'day' ? 'dusk' : now === 'night' ? 'dawn' : (rising ? 'day' : 'night');
    const v = { d, name, next: nextName, until, rising };
    this._dayCache = { sec, v };
    return v;
  },
  drawDayDial(ctx, x, y) {
    const p = this.dayPhase(); if (!p) return 0;
    const w = 116, h = 22, r = 8, cx = x + 14, cy = y + h / 2, BG = '#0b1016';
    // The panel is OPAQUE, unlike the clock chip beside it, and that is not a style choice: the moon
    // is drawn by biting a crescent out of a disc, and the only way to bite without knowing what is
    // underneath is destination-out -- which does not bite the disc, it erases the canvas, leaving a
    // transparent hole straight through the HUD to whatever is behind the element.
    ctx.fillStyle = BG; ctx.fillRect(x, y, w, h);
    // The disc is lit by the daylight value itself, so it reads at a glance without the label: a full
    // pale disc at noon, a thin cold crescent at the bottom of the night.
    const lit = p.d;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = lit > 0.5 ? '#ffd98a' : '#8fa6c8'; ctx.globalAlpha = 0.25 + 0.75 * Math.max(lit, 1 - lit);
    ctx.fill(); ctx.globalAlpha = 1;
    if (lit > 0.55) {                                   // sun: short rays, count rising with the light
      ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r + 1.5), cy + Math.sin(a) * (r + 1.5)); ctx.lineTo(cx + Math.cos(a) * (r + 3.5), cy + Math.sin(a) * (r + 3.5)); ctx.stroke(); }
    } else {                                            // moon: bite the disc with the background colour
      ctx.fillStyle = BG;                             // the panel colour, not destination-out; see above
      ctx.beginPath(); ctx.arc(cx + 3 + (1 - lit) * 2, cy - 1, r * 0.92, 0, Math.PI * 2); ctx.fill();
    }
    ctx.textAlign = 'left'; ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = p.name === 'Night' ? '#9fb4d6' : p.name === 'Day' ? '#ffd98a' : '#e0c07a';
    ctx.fillText(p.name, x + 27, y + 10);
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#9aa';
    ctx.fillText(p.until ? p.next + ' in ' + this.clock(p.until * TPS) : p.next, x + 27, y + 20);
    return w + 6;
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
  // ---------------- menus ----------------
  // REMATCH and BACK TO LOBBY (ninth session, queue item B), first on the end screen of a game that came from a lobby. Online
  // they go to the relay's room (Net.backToLobby; a spectator has no seat to be ready in, so only goes back); in single player
  // to the skirmish lobby the page still holds (UI.Skirmish). A mission, a loaded save and a replay came from no lobby and
  // get neither.
  lobbyItems() {
    if (this.fromLobby === 'net' && typeof Net !== 'undefined' && Net.connected) return (this.mode === 'replay' ? [] : [['Rematch', () => Net.backToLobby(true)]]).concat([['Back to lobby', () => Net.backToLobby(false)]]);
    if (this.fromLobby === 'skirmish' && this.Skirmish && this.Skirmish.L) return [['Rematch', () => this.Skirmish.rematch()], ['Back to lobby', () => this.Skirmish.backToLobby()]];
    return [];
  },
  // A PRODUCTION SLOT THAT STOPS FOR NO REASON (ninth session, queue item F; the user's report, "some tech gets stuck during
  // research"). Never reproduced: not in the eighth session's 75 minutes of six-player hard-AI games, not in the ninth's 75
  // more on today's code (tools/stall-probe.js), not in the eleven directed scenes (tools/stall-scenes.js), and not in the
  // user's own recorded game replayed frame by frame (tools/stall-replay.js) -- every pause in all of them was
  // a rule working. So rather than guess, the game watches: once a game second it looks at the head of each of your
  // production queues, and a slot that has not moved for STALL_FRAMES of game time with none of the reasons the rules give
  // for waiting (stallExcuse) is reported ONCE, in one line -- on screen, in the browser console, and in localStorage as
  // bw_stall -- with what the building, the item and the player looked like, so the next time it happens the line names
  // the cause (PLAYTEST-M18 item 68 asked players for exactly this by hand). It only reads the simulation, and never in a
  // replay, so it cannot change a game, a replay or a lockstep hash.
  //
  // AND A PAUSE THE RULES DO EXPLAIN is said out loud when it is a RESEARCH that has waited EXPLAIN_FRAMES: the ninth session's
  // probe on today's code found a Protoss upgrade whose building lost its power and never got it back before the game ended --
  // the exact shape of "research gets stuck" -- and the only sign of it was the word UNPOWERED on a building possibly off
  // the screen. (A unit waiting on supply has its own alert already, so it is left to that.)
  STALL_FRAMES: 240, EXPLAIN_FRAMES: 480,
  STALL_WHY: { unpowered: 'it has no power: a Pylon has to reach it', lifted: 'it is lifted off the ground', addon: 'its add-on is still being built', disabled: 'it is disabled (stasis, lockdown or maelstrom)', morph: 'it is changing form', inside: 'it is inside a transport' },
  watchStalls() {
    // (No pause guard and no per-game reset: every clock here is G.frame, which a paused game does not move, and a new game's
    // queue items are new objects that no old entry can match -- negative controls found both guards changed nothing.)
    if (!this.running || this.mode !== 'play' || typeof G === 'undefined' || !G.players || !G.players.length) return false;
    if (this._stallFrame != null && G.frame >= this._stallFrame && G.frame - this._stallFrame < TPS) return false;
    this._stallFrame = G.frame;
    if (!this._stalls) this._stalls = new Map();
    const seen = this._stalls, live = new Set(); let told = false;
    for (const u of G.units) {
      if (!u.alive || u.owner !== G.human || !u.prod || !u.prod.length) continue;
      const it = u.prod[0], key = u.id + '|' + it.kind + '|' + it.id + '|' + (it.level || 0); live.add(key);
      const w = seen.get(key), why = this.stallExcuse(u, it);
      if (!w || w.item !== it || w.p !== it.progress) { seen.set(key, { item: it, p: it.progress, f: G.frame, told: !!(w && w.item === it && w.told), why: '', whyF: G.frame, explained: false }); continue; }
      if (why) {   // waiting for a reason the rules give: not a stall, but a research kept waiting long enough is explained once
        if (w.why !== why) { w.why = why; w.whyF = G.frame; w.explained = false; }
        if (!w.explained && it.kind !== 'unit' && why !== 'supply' && G.frame - w.whyF >= this.EXPLAIN_FRAMES) { w.explained = true; this.explainPause(u, it, why); }
        w.f = G.frame; continue;
      }
      w.why = '';
      if (!w.told && G.frame - w.f >= this.STALL_FRAMES) { w.told = true; told = true; this.reportStall(u, it, G.frame - w.f); }
    }
    for (const k of [...seen.keys()]) if (!live.has(k)) seen.delete(k);
    return told;
  },
  // The rules' reasons for a slot to wait, as the probe knows them: a unit that has not started and has no supply room, an
  // add-on still being built, a lifted, unpowered or morphing building, stasis, lockdown or maelstrom, a unit in a transport.
  stallExcuse(u, it) {
    if (u.unpowered) return 'unpowered';
    if (u.lifted) return 'lifted';
    if (u.morphT) return 'morph';
    if (u.inside) return 'inside';
    if (u.addon && !u.addon.done) return 'addon';
    if (u.fx && (u.fx.stasis || u.fx.lockdown || u.fx.maelstrom)) return 'disabled';
    if (it.kind === 'unit' && !it.started && !it.reserved && typeof DATA !== 'undefined' && DATA.units[it.id] && G.supplyBlocked(u.player, DATA.units[it.id])) return 'supply';
    return '';
  },
  explainPause(u, it, why) {
    const p = G.players[u.owner], def = (typeof DATA !== 'undefined' && (DATA.techs[it.id] || DATA.upgrades[it.id])) || {};
    const text = (u.def.name || u.def.id) + ' has stopped researching ' + (def.name || it.id) + ': ' + (this.STALL_WHY[why] || why) + '.';
    if (p && p.msg) p.msg(text, 'info');
    return text;
  },
  reportStall(u, it, frames) {
    const p = G.players[u.owner], clock = f => Math.floor(f / TPS / 60) + ':' + String(Math.floor(f / TPS) % 60).padStart(2, '0');
    const def = (typeof DATA !== 'undefined' && (DATA.techs[it.id] || DATA.upgrades[it.id] || DATA.units[it.id] || DATA.buildings[it.id])) || {};
    const line = '[stall] build ' + (typeof BUILD !== 'undefined' && BUILD.hash ? BUILD.hash() : '?') + ' at ' + clock(G.frame) + ' (frame ' + G.frame + '): '
      + u.def.id + ' #' + u.id + ' ' + it.kind + ':' + it.id + (it.level ? ' L' + it.level : '') + ' stuck at ' + Math.round(it.progress) + '/' + it.total + ' for ' + Math.round(frames / TPS) + ' s'
      + '; done ' + (u.done ? 1 : 0) + ', lifted ' + (u.lifted ? 1 : 0) + ', unpowered ' + (u.unpowered ? 1 : 0) + ', morphT ' + (u.morphT | 0) + ', addon ' + (u.addon ? u.addon.def.id + (u.addon.done ? '' : ' building') : '-')
      + ', started ' + (it.started ? 1 : 0) + ', reserved ' + (it.reserved ? 1 : 0)
      + '; researching [' + (p.researching ? [...p.researching].join(', ') : '') + ']; queue [' + u.prod.map(x => x.kind + ':' + x.id + ':' + Math.round(x.progress)).join(', ') + ']; supply ' + Math.ceil(p.supUsed) + '/' + p.supMax;
    this.stallReport = line;
    try { console.warn(line); } catch (e) { }
    try { localStorage.setItem('bw_stall', line); } catch (e) { }
    if (p.msg) p.msg((u.def.name || u.def.id) + ' has not moved ' + (def.name || it.id) + ' on for ' + Math.round(frames / TPS) + ' seconds, and the game cannot say why. Please send the line it wrote to the browser console (F12).', 'error');
    return line;
  },
  reportOver() { if (G.over && this.net && !this.overSent && typeof Net !== 'undefined' && Net.active && !Net.spectating) { this.overSent = true; Net.send({ t: 'over', f: G.frame, team: G.winTeam }); return true; } return false; },
  // Restart keeps where the game came from, so a restarted skirmish still offers its lobby.
  restart() { const from = this.fromLobby; this.start(this.lastOpts); this.fromLobby = from; },
  menuItems() {
    if (this.menu === 'brief' && G.mission) { const d = G.mission.def; return { title: d.title.toUpperCase(), lines: d.brief.concat(['', 'OBJECTIVE: ' + d.objective]), items: [['Begin mission', () => { this.menu = null; }]] }; }
    if (this.net && Net.active && !Net.connected) return { title: 'CONNECTION LOST', lines: ['The relay connection dropped.', 'Reconnect from the main menu with the same name to rejoin this game.'], items: [['Keep watching', () => { this.menu = null; }], ['Return to main menu', () => this.toMenu()]] };
    if (this.menu === 'over') { const hp = G.players[G.human]; const won = G.mission ? G.winner === G.human : (G.winTeam != null ? G.winTeam === hp.team : G.winner === G.human); const mins = Math.max(1, G.frame / TPS / 60); const apm = Math.round(G.log.filter(e => e.c.p === G.human).length / mins); const lines = [`Time ${Math.floor(G.frame / TPS / 60)}:${String(Math.floor(G.frame / TPS) % 60).padStart(2, '0')}   APM ${apm}`]; if (G.mission) { lines.push('Objective: ' + G.mission.def.objective + (G.mission.done ? (won ? '  — complete' : '  — failed') : '')); if (G.mission.summary) lines.push(G.mission.summary); } if (this.net && typeof Net !== 'undefined' && Net.lastRated) lines.push(Net.ratedText(Net.lastRated)); lines.push(''); for (const q of G.players) { const s = q.stats; lines.push(`${q.name} (${RACE_INFO[q.race].name})  kills ${s.unitsKilled}/${s.buildingsKilled}  lost ${s.unitsLost}/${s.buildingsLost}  minerals ${s.mined}  gas ${s.gassed}${q.defeated ? '  ELIMINATED' : ''}`); } return { title: this.mode === 'replay' && this.net ? 'GAME OVER' : won ? 'VICTORY' : 'DEFEAT', lines, items: this.lobbyItems().concat([[hp.defeated || this.mode === 'replay' ? 'Keep watching' : 'Continue playing', () => { this.menu = null; G.over = false; G.freePlay = true; }]], this.net ? [] : [['Restart this game', () => this.restart()]], [['Save replay', () => { Replay.saveReplay(); }], ['Return to main menu', () => this.toMenu()]]) }; }   // no Restart online: it would start a private copy of a game everyone else is still in
    // A network spectator's menu: the game runs on behind it (the lockstep never waits for a spectator), and there is no
    // speed to change, nothing to seek and nobody's game to take over.
    if (this.mode === 'replay' && this.net) return { title: 'SPECTATING', lines: ['Watching: ' + (this.viewAll ? 'everyone' : G.players[G.human].name), '', '[ and ] switch player, O production overlay, Ctrl+V the whole map', 'The game carries on while this menu is open.'], items: [['Resume (Esc)', () => { this.menu = null; }], [(Sound.muted ? 'Sound: off' : 'Sound: on') + ' (Ctrl+M)', () => Sound.setMuted(!Sound.muted)], ['Toggle full map view (Ctrl+V)', () => { this.viewAll = !this.viewAll; this.menu = null; }], ['Next player (])', () => { this.cycleObserved(1); this.viewAll = false; this.menu = null; }], ['Toggle production overlay (O)', () => { this.prodOverlay = !this.prodOverlay; this.menu = null; }]].concat(this.lobbyItems(), [['Stop watching', () => this.toMenu()]]) };
    if (this.mode === 'replay') return { title: 'REPLAY PAUSED', lines: ['Speed: ' + this.speedName(), 'Watching: ' + (this.viewAll ? 'everyone' : G.players[G.human].name), '', '[ and ] switch player, O production overlay', 'Shift+Left/Right skip 30 s, Home restarts, click the bar to seek'], items: [['Resume (Esc)', () => { this.menu = null; }], [(Sound.muted ? 'Sound: off' : 'Sound: on') + ' (Ctrl+M)', () => Sound.setMuted(!Sound.muted)], ['Toggle full map view (Ctrl+V)', () => { this.viewAll = !this.viewAll; this.menu = null; }], ['Next player (])', () => { this.cycleObserved(1); this.viewAll = false; this.menu = null; }], ['Toggle production overlay (O)', () => { this.prodOverlay = !this.prodOverlay; this.menu = null; }], ['Take control from here (Ctrl+B)', () => this.branchReplay()], ['Quit to menu', () => this.toMenu()]] };
    // Settings is its own screen rather than four more rows on the pause menu: the pause menu is where
    // you go to leave or to save, and mixing "quit to menu" in with "music off" made both harder to find.
    if (this.menu === 'settings') return { title: 'SETTINGS', lines: ['Audio starts muted on every load.'], items: [
      [(Sound.muted ? 'Sound: off' : 'Sound: on') + '  (Ctrl+M)', () => Sound.setMuted(!Sound.muted)],
      ['Voice: ' + (typeof Voice !== 'undefined' && Voice.on ? 'on' : 'off'), () => { if (typeof Voice !== 'undefined') Voice.set(!Voice.on); }],
      ['Music: ' + (typeof Music !== 'undefined' && Music.on ? 'on' : 'off'), () => { if (typeof Music !== 'undefined') Music.set(!Music.on); }],
      ['Command card keys: ' + (this.gridKeys ? 'Grid' : 'Standard'), () => { this.setGridKeys(!this.gridKeys); }],
      // The same settings as the menu's tabs, a step per press, wrapping round (seventh session, item 2).
      ['HUD size: ' + this.hudScale.toFixed(1) + 'x', () => { this.setHudScale(this.hudScale >= HUD_SCALE_MAX - 1e-9 ? HUD_SCALE_MIN : this.hudScale + 0.1); }],
      ['Scroll speed: ' + Math.round(this.scrollSpeed * 100) + '%', () => { const steps = [0.5, 0.75, 1, 1.5, 2]; const i = steps.findIndex(s => s > this.scrollSpeed + 1e-9); this.setScrollSpeed(i < 0 ? steps[0] : steps[i]); }],
      ['Edge scroll: ' + (this.edgeScroll ? 'on' : 'off'), () => { this.setEdgeScroll(!this.edgeScroll); }],
      ['Volume: ' + Math.round(Sound.volume * 100) + '%', () => { const steps = [0.25, 0.5, 0.75, 1]; const i = steps.findIndex(s => s > Sound.volume + 1e-9); this.setVolume(i < 0 ? steps[0] : steps[i]); }],
      ['Back (Esc)', () => { this.menu = 'pause'; }],
    ] };
    // A branch says so, and offers the way back. Nothing was destroyed to get here -- the file on disk
    // is untouched and branchedFrom still holds what was loaded -- so "watch the original again" is
    // startFromLog with data we already have.
    const br = this.branchedFrom;
    return { title: br ? 'PAUSED  (BRANCH)' : 'PAUSED',
      lines: br ? ['You took control at ' + this.clock(br.at) + '. Saving a replay saves the branch.'] : [],
      items: [['Resume (Esc)', () => { this.menu = null; }],
      ...(br ? [['Abandon branch, watch the original', () => this.unbranch()]] : []),
      // ONLINE, no Save game and no Restart (found while building queue item B): Replay.save does nothing while Net.active,
      // and Restart started a private copy of a game everyone else was still in -- the end screen had always left it out for
      // that reason, and this menu had not.
      ['Settings', () => { this.menu = 'settings'; }]].concat(this.net ? [] : [['Save game (F5)', () => { Replay.save(true); this.menu = null; }]], [['Save replay', () => { Replay.saveReplay(); this.menu = null; }]], this.net ? [] : [['Restart', () => { this.restart(); }]], [['Quit to menu', () => this.toMenu()]]) };
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
  // ==========================================================================
  // BRANCHING REPLAY -- M11 wave three, item 24. "What if I had done that?"
  // ==========================================================================
  // Taking control mid-replay costs almost nothing, because a replay in this engine is not a recording
  // of what happened -- it is the seed plus the human's commands, re-simulated. So the AI is already
  // being re-derived live rather than played back, and "take control" is only two things: stop feeding
  // the recorded commands in, and lift the gate in CMD.apply that refuses player input while
  // UI.mode === 'replay'.
  //
  // The branch is a REAL GAME, not a preview. G.log is seeded with the recorded commands up to this
  // frame and recording is turned back on, so Replay.data() afterwards yields a complete file that
  // replays from frame 0 through the original opening into whatever you did instead. That is the
  // difference between a what-if you can keep and one you can only watch once.
  //
  // Nothing is destroyed. The original file on disk is untouched, and `branchedFrom` keeps the loaded
  // data, so "back to the replay" is just startFromLog again with what we already have.
  branchReplay() {
    if (this.mode !== 'replay' || !this.replayData) return;
    const at = G.frame;
    this.branchedFrom = { data: this.replayData, at };
    G.pendingCmds = null;                                  // stop applying the recorded future
    G.log = (this.replayData.cmds || []).filter(e => e.f <= at);   // keep the past that led here
    G.recording = true;
    this.mode = 'play';
    this.viewAll = false; this.prodOverlay = false; this.menu = null;
    // Replay speeds go to 9 and play speeds stop at 6; branching at speed 8 would otherwise leave the
    // game running faster than any play speed can be set back to.
    this.speedIdx = Math.min(this.speedIdx, this.maxSpeedIdx());
    G.paused = false;
    const p = G.players[G.human];
    if (p) { p.human = true; p.ai = null; p.msg('You have the controls, at ' + this.clock(at) + '. This is your game now.', 'info'); }
  },
  // Abandon the branch and watch the original again. Only offered while `branchedFrom` is set, and it
  // reloads rather than rewinds -- the branch has been writing into G.log and the map since, so there
  // is nothing to rewind to that is cheaper or safer than starting the file over.
  unbranch() {
    const b = this.branchedFrom; if (!b) return;
    this.branchedFrom = null;
    this.startFromLog(b.data, 'replay');
  },
  clock(f) { const s = Math.floor(f / TPS); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  toMenu() { if (typeof Net !== 'undefined' && Net.active) Net.disconnect(); this.leaveGame('mainPanel'); },
  // Out of the game onto a menu panel, keeping any connection: toMenu less the disconnect, for BACK TO LOBBY (queue item B),
  // which goes to a room the socket is still in, or to the skirmish lobby.
  leaveGame(panel) { this.running = false; this.menuCodex = false; this.menu = null; this.loading = null; if (this.refreshMapList) this.refreshMapList(); if (typeof Music !== 'undefined') Music.stop(); if (this.showPanel) this.showPanel(panel || 'mainPanel'); document.getElementById('menu').style.display = 'flex'; document.getElementById('game').style.display = 'none'; const ab = document.getElementById('autosaveBtn'); if (ab) ab.style.display = Replay.hasAutosave() ? 'block' : 'none'; },

  // ==========================================================================
  // Skirmish setup (M11 wave two, item 22)
  // ==========================================================================
  // A milestone of gameplay had shipped that the player could not reach. Four map sizes that are
  // different RULES, four AI play styles, four procedural archetypes, weather of two kinds, the
  // per-map toggles for derelicts and wildlife -- all of it tested, all of it in the tables, and the
  // menu offered race, opponent count and map. This is the surface for it. (The eighth session replaced the form with
  // the skirmish lobby, UI.Skirmish, which hands UI.skirmishOptions the same settings object the form did.)
  //
  // THE SHAPE, AND WHY IT IS THIS SHAPE. The screen is a form; a form is DOM; DOM cannot be tested in
  // node without a browser or a fake one. So the screen is split in two, and the seam is a plain
  // object:
  //
  //     the lobby  --UI.Skirmish.setup()-->  a settings object  --skirmishOptions()-->  G.init options
  //                                           (plain, inert)        (pure, no DOM)
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
  //   * PER PLAYER   -- race, difficulty, play style, team, starting bank, start position. These ride on the
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
    // A start chosen in the lobby, and only then: an Auto seat carries no key, so an untouched lobby's options stay the old
    // menu's byte for byte (G.init places a keyless player on its seat's own start, GameMap.assignStarts).
    if (Number.isInteger(s.start)) players[0].start = s.start;
    if (Number.isInteger(s.color)) players[0].color = s.color;   // a colour chosen in the lobby, likewise only when chosen (tenth session, item 2)
    const opps = Array.isArray(s.opponents) ? s.opponents : d.opponents;
    opps.forEach((o, i) => {
      o = o || {};
      const p = { race: String(o.race || 'R'), human: false, difficulty: String(o.difficulty || 'normal'), name: 'Computer ' + (i + 1), team: parseInt(o.team, 10) || (i + 2) };
      // 'standard' is the zero delta and is what AI's constructor falls back to, so leaving the key off
      // keeps a default game's options byte-identical to the ones the old menu produced.
      if (o.style && o.style !== 'standard') p.style = String(o.style);
      if (Number.isInteger(o.start)) p.start = o.start;
      if (Number.isInteger(o.color)) p.color = o.color;
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
};

// ---------------- the skirmish lobby ----------------
// THE SKIRMISH SETUP IS THE MULTIPLAYER LOBBY (eighth session, the user's item 1: the Skirmish Setup Lobby "should look
// exactly the same as the Multiplayer Lobby. The only difference is that no other humans will be able to join"). That is
// OpenRA's design -- its Skirmish button starts a server of its own and opens the very lobby its multiplayer uses, with
// BACK for DISCONNECT and no ready check -- and StarCraft II's, whose games against the computer are set up in the
// custom-game lobby. There is no server to start here: this holds a room in the shape of the relay's lobby message,
// answers the messages the lobby's controls send the way test/serve.js answers them, and Net.roomHtml draws it.
//
// START turns the room into the settings object the old skirmish form was read into (UI.readSetup, gone with the form),
// so UI.skirmishOptions -- and every check test/skirmish.js makes of it -- is still the one way a skirmish becomes a game.
UI.Skirmish = {
  KEY: 'bw_skirmish',   // what was set up last time: the map, the speed, the rules and the slots. Never the seed.
  ME: 1,                // your slot's id; the computers' are negative, as the relay numbers them
  L: null, log: [], teamsShown: 2,
  el() { return typeof document !== 'undefined' && document.getElementById ? document.getElementById('skLobby') : null; },
  name() { let n = ''; try { n = Net.loadIdentity().name; } catch (e) { n = ''; } return n || 'Player'; },
  // A new seed every time the lobby opens, the way the relay picks one at every START; the Seed row pins one.
  roll() { return 1 + Math.floor(Math.random() * 999999); },
  cap(L) { L = L || this.L; return Net.mapCap(L.layout, L.rules && L.rules.size); },
  raceOf(r, d) { return /^[TZPR]$/.test(r) ? r : d; },
  teamOf(t, d) { const n = parseInt(t, 10); return n >= 1 && n <= 8 ? n : d; },
  diffOf(v) { return Object.prototype.hasOwnProperty.call(Net.DIFF_NAMES, v) ? v : 'normal'; },
  styleOf(v) { return Net.styles().some(x => x[0] === v) ? v : 'standard'; },
  // Starts belong to a map: a new map, or a new size of a procedural one, puts every seat back on Auto, and the log says so.
  clearStarts(L, line) { let n = 0; for (const p of L.players) if (Number.isInteger(p.start)) { delete p.start; n++; } if (n && line) line('starts', { reset: true }); return n; },
  // Computer 1, Computer 2... in seat order, which is the order UI.skirmishOptions names them in the game.
  renumber(L) { let n = 0; for (const p of L.players) if (p.ai) p.name = 'Computer ' + (++n); return L; },
  // A new room: you and one computer on the settings the skirmish screen always opened with (UI.setupDefaults).
  fresh() {
    const d = UI.setupDefaults();
    return this.renumber({ state: 'lobby', title: 'Skirmish', layout: d.map, speed: 6, seed: this.roll(), cap: 8, listed: false, lockTeams: false, readyCheck: false, specs: [],
      rules: Object.assign({}, Net.RULE_DEFAULTS),
      players: [{ id: this.ME, name: this.name(), race: d.race, team: d.team, host: true, ready: true }]
        .concat(d.opponents.map((o, i) => ({ id: -(i + 1), ai: true, name: '', race: o.race, difficulty: o.difficulty, style: o.style, team: o.team }))) });
  },
  save() {
    const L = this.L; if (!L) return;
    const keep = { layout: L.layout, speed: L.speed, rules: L.rules, players: L.players.map(p => Object.assign(p.ai ? { ai: true, race: p.race, difficulty: p.difficulty, style: p.style, team: p.team } : { race: p.race, team: p.team }, Number.isInteger(p.start) ? { start: p.start } : {}, Number.isInteger(p.color) ? { color: p.color } : {})) };
    try { localStorage.setItem(this.KEY, JSON.stringify(keep)); } catch (e) { }
  },
  // Last time's room, read back through the same checks a message from the lobby's controls passes. Whatever does not
  // survive them -- a map deleted in the editor, a play style that no longer exists -- is the default instead.
  load() {
    const L = this.fresh();
    let s = null; try { s = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') return L;
    if (typeof s.layout === 'string' && Net.maps(true).some(m => m[0] === s.layout)) L.layout = s.layout;
    if (typeof s.speed === 'number' && isFinite(s.speed)) L.speed = Math.max(0, Math.min(6, s.speed | 0));
    if (s.rules && typeof s.rules === 'object') for (const k of Object.keys(Net.RULE_DEFAULTS)) { const v = s.rules[k]; if (typeof v === 'string' && Net.ruleOptions(k).some(x => x[0] === v)) L.rules[k] = v; }
    const ps = Array.isArray(s.players) ? s.players.filter(p => p && typeof p === 'object') : [];
    const me = ps.find(p => !p.ai); if (me) { L.players[0].race = this.raceOf(me.race, L.players[0].race); L.players[0].team = this.teamOf(me.team, L.players[0].team); }
    const ais = ps.filter(p => p.ai).slice(0, 7);
    if (ais.length) L.players = [L.players[0]].concat(ais.map((a, i) => ({ id: -(i + 1), ai: true, name: '', race: this.raceOf(a.race, 'R'), difficulty: this.diffOf(a.difficulty), style: this.styleOf(a.style), team: this.teamOf(a.team, i + 2) })));
    L.cap = this.cap(L);
    // Starts come back only where they still hold: on this map's starts, one seat each. The computers' are theirs only when
    // the computers themselves came back.
    const from = [me || null].concat(ais.length ? ais : L.players.slice(1).map(() => null));
    L.players.forEach((p, i) => { const s = from[i] ? from[i].start : null; if (Number.isInteger(s) && s >= 0 && s < L.cap && !L.players.some(q => q !== p && q.start === s)) p.start = s; });
    L.players.forEach((p, i) => { const c = from[i] ? from[i].color : null; if (Number.isInteger(c) && c >= 0 && c < PLAYER_COLORS.length && !L.players.some(q => q !== p && q.color === c)) p.color = c; });   // colours come back as starts do (item 2)
    return this.renumber(L);
  },
  // The lobby's messages, answered as test/serve.js answers them for a host -- less everything about other humans.
  apply(m) {
    const L = this.L; if (!L || !m) return;
    const me = L.players.find(p => p.id === this.ME);
    const line = (ev, extra) => { const text = Net.sysText(Object.assign({ ev }, extra || {}), true); if (text) this.log.push({ sys: true, text }); };
    switch (m.t) {
      case 'set': {
        const t = m.id != null ? L.players.find(p => p.id === m.id) : me;
        if (t) {
          if (m.race) t.race = this.raceOf(m.race, t.race);
          if (m.team) t.team = this.teamOf(m.team, t.team);
          if (t.ai && m.difficulty) t.difficulty = this.diffOf(m.difficulty);
          if (t.ai && m.style) t.style = this.styleOf(m.style);
          // As the relay: a start on this map that no other seat holds, or null for Auto.
          if ('start' in m) {
            const was = t.start;
            if (m.start === null) delete t.start;
            else if (Number.isInteger(m.start) && m.start >= 0 && m.start < this.cap(L) && !L.players.some(q => q !== t && q.start === m.start)) t.start = m.start;
            if (was !== t.start) line('start', Object.assign({ name: t.name }, Number.isInteger(t.start) ? { start: t.start } : {}));
          }
          // As the relay: a colour no other seat chose, or null for Auto (tenth session, item 2).
          if ('color' in m) {
            const was = t.color;
            if (m.color === null) delete t.color;
            else if (Number.isInteger(m.color) && m.color >= 0 && m.color < PLAYER_COLORS.length && !L.players.some(q => q !== t && q.color === m.color)) t.color = m.color;
            if (was !== t.color) line('color', Object.assign({ name: t.name }, Number.isInteger(t.color) ? { color: t.color } : {}));
          }
        }
        if (typeof m.layout === 'string' && m.layout !== L.layout && Net.maps(true).some(x => x[0] === m.layout)) { L.layout = m.layout; line('map', { layout: L.layout }); this.clearStarts(L, line); }
        if (m.speed != null) { const sp = Math.max(0, Math.min(6, m.speed | 0)); if (sp !== L.speed) { L.speed = sp; line('speed', { speed: sp }); } }
        if (m.seed != null) { const n = parseInt(m.seed, 10); if (isFinite(n) && n >= 1) L.seed = Math.min(999999, n); }
        if (m.rules && typeof m.rules === 'object') for (const k of Object.keys(Net.RULE_DEFAULTS)) {
          if (!(k in m.rules)) continue;
          const v = m.rules[k]; if (v !== L.rules[k] && Net.ruleOptions(k).some(x => x[0] === v)) { L.rules[k] = v; line('rule', { key: k, value: v }); if (k === 'size') this.clearStarts(L, line); }
        }
        break;
      }
      case 'roll': L.seed = this.roll(); break;
      case 'addai':
        if (L.players.length >= this.cap()) return this.render();
        L.players.push({ id: -(1 + Math.max(0, ...L.players.filter(p => p.ai).map(p => -p.id))), ai: true, name: '', race: this.raceOf(m.race, 'R'), difficulty: this.diffOf(m.difficulty), style: this.styleOf(m.style), team: this.teamOf(m.team, 2) });
        this.renumber(L); line('addai', { name: L.players[L.players.length - 1].name });
        break;
      case 'kick': { const out = L.players.find(p => p.ai && p.id === m.id); if (!out) return; L.players = L.players.filter(p => p !== out); line('kick', { name: out.name }); this.renumber(L); break; }
      // The relay's shuffle: every slot dealt at random onto as many teams as are in use (at least two); seats stay put.
      case 'shuffle': {
        const n = Math.max(2, new Set(L.players.map(p => p.team || 1)).size), deck = L.players.slice();
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = deck[i]; deck[i] = deck[j]; deck[j] = x; }
        deck.forEach((p, i) => { p.team = (i % n) + 1; }); line('shuffle', { teams: n });
        break;
      }
      case 'chat': { const text = String(m.text || '').trim().slice(0, 200); if (!text) return; this.log.push({ from: me ? me.name : 'Player', id: this.ME, text }); break; }
      case 'start': return this.start();
      case 'leave': return this.close();
      default: return;
    }
    if (this.log.length > 80) this.log.splice(0, this.log.length - 80);
    L.cap = this.cap();
    this.save(); this.render();
  },
  // The room as the settings object UI.skirmishOptions reads. You are seat one; the computers follow in seat order.
  setup(L) {
    L = L || this.L; const me = L.players.find(p => p.id === this.ME) || L.players[0], r = Object.assign({}, Net.RULE_DEFAULTS, L.rules);
    return { race: me.race, team: me.team, start: me.start, color: me.color, seed: L.seed, map: L.layout, size: r.size, bank: r.bank, hazard: r.hazard, night: r.night, features: r.features,
      derelicts: r.derelicts, wildlife: r.wildlife, opponents: L.players.filter(p => p.ai).map(p => ({ race: p.race, difficulty: p.difficulty, style: p.style, team: p.team, start: p.start, color: p.color })) };
  },
  // START needs someone to play and a map with a start for everyone -- nothing else, because there is nobody to wait for.
  canStart(L) { L = L || this.L; return !!L && L.players.some(p => p.ai) && L.players.length <= this.cap(L); },
  options(L) { L = L || this.L; const o = UI.skirmishOptions(this.setup(L)); const me = L.players.find(p => p.id === this.ME); if (me && o.players[0]) o.players[0].name = me.name; return o; },
  start() {
    if (!this.canStart()) { this.render(); return false; }
    const opts = this.options();
    UI.speedIdx = this.L.speed == null ? 6 : this.L.speed;
    const el = this.el(); if (el) el.innerHTML = '';   // its ids are the multiplayer lobby's; nothing of it may linger behind a game
    UI.start(opts); UI.fromLobby = 'skirmish';   // the end screen offers REMATCH and BACK TO LOBBY (UI.lobbyItems)
    return true;
  },
  // REMATCH and BACK TO LOBBY from a skirmish's end screen (queue item B): the room the game started from, which the page
  // still holds. A rematch is that room at once on a new seed -- as the relay picks a new one at every START, and "Restart
  // this game" is still there for the same one; back to the lobby is the room as it was left, to change something first.
  rematch() { if (!this.L) return false; this.L.seed = this.roll(); return this.start(); },
  backToLobby() { if (UI.leaveGame) UI.leaveGame('skirmishPanel'); this.open(); },
  open() {
    if (!this.L) { this.L = this.load(); this.log = []; this.teamsShown = 2; }
    const me = this.L.players.find(p => p.id === this.ME); if (me) me.name = this.name();
    this.L.seed = this.roll(); this.L.cap = this.cap();
    if (UI.showPanel) UI.showPanel('skirmishPanel');
    this.render();
  },
  close() { const el = this.el(); if (el) el.innerHTML = ''; if (UI.showPanel) UI.showPanel('singlePanel'); },
  render() {
    const el = this.el(); if (!el || !this.L || typeof Net === 'undefined') return;
    Net.paint(el, Net.roomHtml(this.L, { local: true, me: this.ME, chatLog: this.log, teamsShown: this.teamsShown }));
    Net.bindRoom(el, this.L, { local: true, me: this.ME, send: m => this.apply(m), redraw: () => this.render(), holder: this });
  },
};

// ---------------- boot ----------------
window.addEventListener('DOMContentLoaded', () => {
  UI.init();
  const $ = id => document.getElementById(id);

  // ---- panels -------------------------------------------------------------
  // Id-based, not `previousElementSibling`. The settings panel found the main panel by walking one
  // element back, which was true when there were two panels and quietly wrong the moment there were
  // three -- the kind of breakage that shows up as "SETTINGS hides the wrong screen" and is invisible
  // in a diff. Everything with class .panel inside #menu is now a page, and exactly one is shown.
  UI.showPanel = id => {
    const menu = $('menu'); if (!menu || !menu.querySelectorAll) return;
    for (const p of menu.querySelectorAll('.panel')) p.style.display = p.id === id ? '' : 'none';
  };
  // THE MENUS (eighth session, the user's list, and the pattern OpenRA and StarCraft II share -- RESEARCH-LOBBY.md,
  // section 6). The front is the title and three doors. SINGLE PLAYER is doors only: Skirmish Setup, Campaign, Load
  // Saved Game, Watch Replay, Continue Autosave and Map Editor, and START lives in the skirmish lobby and nowhere else.
  // MULTIPLAYER connects and shows the game list. SETTINGS holds everything a player sets, including every key.

  // ---- your name, asked once ----------------------------------------------
  // OpenRA's introduction prompt: the first thing a new player sees is a box for their name, before the main menu. It is
  // shown when the prompt's version is newer than the one this browser last completed (so a player who connected before
  // there was a prompt -- as "Player", the old box's default -- is asked once too), or when no name is stored at all.
  const INTRO_VERSION = 1;
  UI.needsName = () => { let v = 0; try { v = parseInt(localStorage.getItem('bw_intro'), 10) || 0; } catch (e) { v = 0; } return v < INTRO_VERSION || !Net.loadIdentity().name; };
  let afterName = null;
  UI.askName = then => {
    afterName = then || null;
    const input = $('nameInput'), note = $('nameNote'), idn = Net.loadIdentity();
    if (input) input.value = idn.name && idn.name !== 'Player' ? idn.name : '';
    if (note) note.textContent = 'Other players see this name. You can change it later in Settings.';
    UI.showPanel('namePanel');
    if (input && input.focus) { try { input.focus(); } catch (e) { } }
  };
  // The name is kept with the rest of who you are (Net.saveIdentity: name, the server you typed, your race), so the other
  // two are read back first rather than overwritten with this page's defaults.
  UI.saveName = name => {
    const nm = String(name == null ? '' : name).trim().slice(0, 16); if (!nm) return false;
    const idn = Net.loadIdentity(); Net.name = nm; Net.urlTyped = idn.url; Net.race = idn.race; Net.saveIdentity();
    try { localStorage.setItem('bw_intro', String(INTRO_VERSION)); } catch (e) { }
    return true;
  };
  const nameOk = () => {
    const input = $('nameInput'), note = $('nameNote');
    if (!UI.saveName(input ? input.value : '')) { if (note) note.textContent = 'Type a name first: it is how other players will know you.'; return; }
    const then = afterName; afterName = null;
    UI.showPanel('mainPanel');
    if (then) then();
  };
  const nok = $('nameOk'); if (nok) nok.addEventListener('click', nameOk);
  const nin = $('nameInput'); if (nin) nin.addEventListener('keydown', ev => { if (ev.key === 'Enter') nameOk(); });

  // ---- multiplayer: pressing the button is pressing CONNECT -----------------
  // The name is the one asked for above and the server is the page's own, unless Settings (or an invite link) names
  // another. Already connected as the same player to the same server: the list is simply shown again. #netForm appears
  // only when the server could not be reached (Net.renderBar), and TRY AGAIN there takes a typed address.
  UI.enterMultiplayer = opts => {
    opts = opts || {};
    UI.showPanel('multiPanel');
    const idn = Net.loadIdentity(), name = idn.name || 'Player';
    // A server given here (TRY AGAIN's box, an invite link) is used even when it is empty: empty is the page's own.
    const typed = opts.server != null ? String(opts.server).trim() : idn.url;
    const url = typed ? Net.normUrl(typed) : Net.defaultUrl();
    if (Net.lobby || Net.active) { Net.render(); return; }
    // Compared with the address actually connected, not with what was typed: Settings writes the typed one the moment it changes.
    if ((Net.connected || Net.connecting) && Net.name === name && Net.url === url && !opts.join) { Net.render(); return; }
    Net.race = idn.race; Net.urlTyped = typed || '';
    if ($('netUrl')) $('netUrl').value = typed || '';
    if (!url) { Net.disconnect(); Net.failed = false; Net.status(''); Net.render(); return; }   // the desktop app, with no server named: the form asks
    Net.status('Connecting to ' + url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '') + '...');
    Net.browse(url, name, opts.join ? { join: opts.join } : undefined);
    Net.renderBar();   // the form a failed attempt left on screen goes the moment the new attempt begins
  };
  const nc = $('netConnect');
  if (nc) {
    $('netUrl').placeholder = Net.defaultUrl().replace(/^wss?:\/\//, '').replace(/\/ws$/, '') || 'the host\'s address, e.g. 192.168.1.5:8765';
    const retry = () => { Net.disconnect(); UI.enterMultiplayer({ server: $('netUrl').value }); };
    nc.addEventListener('click', retry);
    $('netUrl').addEventListener('keydown', ev => { if (ev.key === 'Enter') retry(); });
  }

  // ---- settings -------------------------------------------------------------
  // Tabs, and every control applied the moment it moves and remembered (UI.loadPrefs).
  const tabs = $('setTabs');
  const showTab = name => {
    if (!tabs) return;
    for (const a of tabs.querySelectorAll('[data-tab]')) a.classList.toggle('on', a.dataset.tab === name);
    for (const b of document.querySelectorAll('#settingsPanel [data-body]')) b.style.display = b.dataset.body === name ? '' : 'none';
    if (UI.stopKeyGrab) UI.stopKeyGrab();
    if (name === 'keys' && UI.drawKeys) UI.drawKeys();
  };
  UI.showSettingsTab = showTab;
  if (tabs) for (const a of tabs.querySelectorAll('[data-tab]')) a.addEventListener('click', ev => { ev.preventDefault(); showTab(a.dataset.tab); });
  const bindRange = (id, get, set, fmt) => {
    const r = $(id), v = $(id + 'Val'); if (!r) return () => { };
    const show = () => { r.value = String(get()); if (v) v.textContent = fmt(get()); };
    r.addEventListener('input', () => { set(parseFloat(r.value)); if (v) v.textContent = fmt(get()); });
    show(); return show;
  };
  const refreshSettings = [
    bindRange('optHud', () => UI.hudScale, x => UI.setHudScale(x), x => x.toFixed(1) + 'x'),
    bindRange('optScroll', () => Math.round(UI.scrollSpeed * 100), x => UI.setScrollSpeed(x / 100), x => Math.round(x) + '%'),
    bindRange('optVolume', () => Math.round(Sound.volume * 100), x => UI.setVolume(x / 100), x => Math.round(x) + '%'),
  ];
  const edge = $('optEdge'); if (edge) { edge.checked = UI.edgeScroll; edge.addEventListener('change', () => UI.setEdgeScroll(edge.checked)); refreshSettings.push(() => { edge.checked = UI.edgeScroll; }); }
  const idName = $('optNetName'), idUrl = $('optNetUrl');
  if (idName && idUrl) {
    const fillId = () => { const idn = Net.loadIdentity(); idName.value = idn.name; idUrl.value = idn.url; };
    // A name cannot be emptied here: an empty box puts the stored name back rather than playing as nobody.
    const saveId = () => { const nm = idName.value.trim(); const idn = Net.loadIdentity(); Net.name = nm || idn.name || 'Player'; Net.urlTyped = idUrl.value.trim(); Net.race = idn.race; Net.saveIdentity(); if (!nm) idName.value = Net.name; };
    idName.addEventListener('change', saveId); idUrl.addEventListener('change', saveId);
    fillId(); refreshSettings.push(fillId);
  }
  const qc = $('mute'); if (qc) { qc.checked = Sound.muted; qc.addEventListener('change', () => Sound.setMuted(qc.checked)); refreshSettings.push(() => { qc.checked = Sound.muted; }); }
  const vc = $('voice'), mc = $('music'); if (vc) { vc.checked = Voice.on; vc.addEventListener('change', () => Voice.set(vc.checked)); } if (mc) { mc.checked = Music.on; mc.addEventListener('change', () => Music.set(mc.checked)); }
  // The Codex has a tab of its own. It opens with no game running -- it reads DATA, not G -- and draws over the canvas,
  // so the canvas has to be visible for it; closing it puts this screen back as it was.
  const cbx = $('codexBtn'); if (cbx) cbx.addEventListener('click', () => UI.openCodexFromMenu());

  // ---- Controls: every key ---------------------------------------------------
  // Built from UI.bindings() rather than from markup, so adding an action to BIND_DEFAULTS puts it on
  // this screen with no HTML change and no chance of the two lists disagreeing.
  //
  // Rebinding captures the NEXT keydown at the window, in the capture phase, so it beats UI.onKey --
  // otherwise pressing F10 to bind it would open the pause menu instead. That listener is installed
  // for exactly one keypress and removes itself, which matters: a stuck capture listener would eat
  // the whole keyboard and the only way out would be a reload.
  const bindRow = (id, b, redraw) => {
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('label'); lab.textContent = b.label;
    const btn = document.createElement('button'); btn.className = 'small keyBtn';
    const pretty = k => !k ? '(unbound)' : k === ' ' ? 'Space' : k.startsWith('ctrl+') ? 'Ctrl+' + k.slice(5).toUpperCase() : k.length === 1 ? k.toUpperCase() : k;
    btn.textContent = pretty(b.key);
    btn.addEventListener('click', () => {
      btn.textContent = 'press a key...';
      const grab = ev => {
        ev.preventDefault(); ev.stopPropagation();
        window.removeEventListener('keydown', grab, true);
        if (ev.key === 'Escape') { redraw(); return; }
        if (ev.key === 'Delete') { UI.setBinding(id, ''); redraw(); return; }
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(ev.key)) { redraw(); return; }   // a modifier alone is not a binding
        const key = ev.ctrlKey ? 'ctrl+' + ev.key.toLowerCase() : ev.key;
        // A reserved key (UI.RESERVED: the control groups, the camera slots, F8, F9, Ctrl+M...) is refused,
        // and the button says so for a moment rather than snapping back as if nothing had been pressed.
        if (!UI.setBinding(id, key)) { btn.textContent = pretty(key) + ' is reserved'; setTimeout(redraw, 1200); return; }
        redraw();
      };
      window.addEventListener('keydown', grab, true);
    });
    row.appendChild(lab); row.appendChild(btn);
    return row;
  };
  UI.drawBindings = () => {
    const host = $('bindList'); if (!host) return;
    host.innerHTML = '';
    const b = UI.bindings();
    let lastGroup = null;
    for (const id of Object.keys(b)) {
      if (b[id].group !== lastGroup) {
        lastGroup = b[id].group;
        const h = document.createElement('div'); h.className = 'bindHead'; h.textContent = lastGroup;
        host.appendChild(h);
      }
      const row = bindRow(id, b[id], UI.drawKeys);
      // A letter here is read before the command card (UI.onKey), so a card's button on that letter stops answering it.
      if (/^[a-z]$/i.test(b[id].key)) { const L = b[id].key.toUpperCase(); row.className += ' clash'; row.title = L + ' is also a command card letter: while it is bound here, a button on ' + L + ' does not answer it.'; }
      host.appendChild(row);
    }
  };
  // ---- the command card's keys, card by card ------------------------------------
  // StarCraft II's hotkey editor, which this copies (RESEARCH-LOBBY.md section 5): pick a race, pick a unit, a building or
  // a build menu, and its command card is drawn with the key on every button. Click a key and press a letter. A command on
  // many cards is one command -- the button's tooltip says on how many (UI.cardUses) -- so it changes on all of them. A
  // letter used twice on the card, or held by an Interface key that is read first, is red and says why, and so is the
  // card's name in the list. Grid and Standard keep separate choices. The key is captured the way bindRow captures one:
  // one keydown, in the capture phase, and the listener removes itself.
  let keyView = 'ui', grabbing = null;
  const keyCard = { T: null, Z: null, P: null };
  const stopGrab = () => { if (grabbing) { window.removeEventListener('keydown', grabbing, true); grabbing = null; } };
  UI.stopKeyGrab = stopGrab;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  UI.drawCardKeys = () => {
    const list = $('cardList'), edit = $('cardEdit'); if (!list || !edit) return;
    const race = keyView, cards = UI.cardCatalog()[race] || [];
    if (!cards.some(c => c.key === keyCard[race])) keyCard[race] = cards.length ? cards[0].key : null;
    const groups = [['unit', 'Units'], ['building', 'Buildings'], ['menu', 'Build menus']];
    list.innerHTML = groups.map(([kind, title]) => '<div class="ckGroup">' + title + '</div>' + cards.filter(c => c.kind === kind).map(c => {
      const bad = Object.keys(UI.cardClashes(c)).length;
      return '<a href="#" data-card="' + esc(c.key) + '" class="' + (c.key === keyCard[race] ? 'on' : '') + (bad ? ' clash' : '') + '"' + (bad ? ' title="A key on this card is used twice, or taken by an Interface key"' : '') + '>' + esc(c.name) + '</a>';
    }).join('')).join('');
    for (const a of list.querySelectorAll('[data-card]')) a.onclick = ev => { if (ev && ev.preventDefault) ev.preventDefault(); stopGrab(); keyCard[race] = a.dataset.card; UI.drawCardKeys(); };
    const card = cards.find(c => c.key === keyCard[race]);
    if (!card) { edit.innerHTML = ''; return; }
    const clashes = UI.cardClashes(card), own = UI.cardKeys(), uses = UI.cardUses();
    const pages = Math.max(1, ...card.buttons.map(b => b.page + 1));
    let h = '<div class="ckTitle">' + esc(card.name) + '</div>';
    for (let pg = 0; pg < pages; pg++) {
      if (pages > 1) h += '<div class="ckPage">Page ' + (pg + 1) + ' of ' + pages + '</div>';
      h += '<div class="ckGrid">';
      for (let s = 0; s < UI.CARD_SLOTS; s++) {
        const b = card.buttons.find(x => x.slot === s && (x.page === pg || x.page === -1));
        if (!b) { h += '<div class="ckCell ckEmpty"></div>'; continue; }
        if (!b.cmd) { h += '<div class="ckCell ckFixed" title="' + (b.more ? 'Turns the page' : 'Always Escape') + '"><span class="ckLabel">' + esc(b.label) + '</span><span class="ckKey">' + esc(b.more ? (UI.gridKeys ? UI.GRID_KEYS[s] : 'Tab') : 'Esc') + '</span></div>'; continue; }
        const k = UI.cardKeyFor(b.cmd, b.slot, b.hk), mine = Object.prototype.hasOwnProperty.call(own, b.cmd), why = clashes[b.cmd], n = uses[b.cmd] || 1;
        const dflt = UI.gridKeys ? (UI.GRID_KEYS[b.slot] || '') : b.hk;
        const tip = (why ? why + '. ' : '') + (n > 1 ? b.label + ' is on ' + n + ' cards; a key set here is its key on all of them.' : '');
        h += '<div class="ckCell' + (mine ? ' mine' : '') + (why ? ' clash' : '') + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>'
          + '<span class="ckLabel">' + esc(b.label) + '</span>'
          + '<button class="ckKey" data-cmd="' + esc(b.cmd) + '">' + (k ? esc(k) : '&mdash;') + '</button>'
          + (mine ? '<a href="#" class="ckReset" data-reset="' + esc(b.cmd) + '" title="Back to ' + esc(dflt || 'no key') + '">&#8634;</a>' : '')
          + '</div>';
      }
      h += '</div>';
    }
    // One sentence per letter in trouble, naming every button on it.
    const trouble = {};
    for (const b of card.buttons) if (b.cmd && clashes[b.cmd]) { const k = UI.cardKeyFor(b.cmd, b.slot, b.hk).toUpperCase(); (trouble[k] = trouble[k] || { names: [], why: clashes[b.cmd] }).names.push(b.label); }
    const lines = Object.keys(trouble).map(k => / \(Interface\)/.test(trouble[k].why) ? trouble[k].why + ': ' + trouble[k].names.join(' and ') + ' will not answer it.' : k + ' is on ' + trouble[k].names.join(' and ') + ': ' + k + ' presses the first of them.');
    h += '<div class="ckMsg' + (lines.length ? ' clash' : '') + '">' + (lines.length ? esc(lines.join(' ')) : 'Click a key, then press a letter. Delete leaves the button with no key.') + '</div>'
      + '<button id="cardReset" class="small inline" title="Every key on this card back to the layout\'s own -- shared commands such as Move included, on every card they are on">Reset this card</button>';
    edit.innerHTML = h;
    for (const btn of edit.querySelectorAll('[data-cmd]')) btn.onclick = () => {
      stopGrab();
      const cmd = btn.dataset.cmd; btn.textContent = 'press'; btn.classList.add('wait');
      grabbing = ev => {
        ev.preventDefault(); ev.stopPropagation(); stopGrab();
        if (ev.key === 'Escape' || ['Control', 'Shift', 'Alt', 'Meta'].includes(ev.key)) { UI.drawCardKeys(); return; }
        if (ev.key === 'Delete' || ev.key === 'Backspace') { UI.setCardKey(cmd, ''); UI.drawCardKeys(); return; }
        // Letters only: every other key the game reads is an Interface key or a reserved one, and onKey reads those first.
        if (ev.ctrlKey || ev.altKey || ev.metaKey || !/^[a-z]$/i.test(ev.key)) { btn.textContent = 'A to Z'; setTimeout(UI.drawCardKeys, 1100); return; }
        UI.setCardKey(cmd, ev.key); UI.drawCardKeys();
      };
      window.addEventListener('keydown', grabbing, true);
    };
    for (const a of edit.querySelectorAll('[data-reset]')) a.onclick = ev => { if (ev && ev.preventDefault) ev.preventDefault(); stopGrab(); UI.resetCardKey(a.dataset.reset); UI.drawCardKeys(); };
    const cr = edit.querySelector('#cardReset'); if (cr) cr.onclick = () => { stopGrab(); for (const b of card.buttons) if (b.cmd) UI.resetCardKey(b.cmd); UI.drawCardKeys(); };
  };
  // The Controls tab's views -- Interface, and each race's command cards -- under the layout switch that governs both.
  UI.drawKeys = () => {
    stopGrab();
    const kt = $('keyTabs'); if (kt) for (const a of kt.querySelectorAll('[data-keys]')) a.classList.toggle('on', a.dataset.keys === keyView);
    const bl = $('bindList'), ck = $('cardKeys');
    if (bl) bl.style.display = keyView === 'ui' ? '' : 'none';
    if (ck) ck.style.display = keyView === 'ui' ? 'none' : '';
    for (const k of ['keyStd', 'keyGrid']) { const x = $(k); if (x) x.classList.toggle('on', (k === 'keyGrid') === !!UI.gridKeys); }
    if (keyView === 'ui') UI.drawBindings(); else UI.drawCardKeys();
  };
  const kt = $('keyTabs'); if (kt) for (const a of kt.querySelectorAll('[data-keys]')) a.addEventListener('click', ev => { ev.preventDefault(); keyView = a.dataset.keys; UI.drawKeys(); });
  const creset = $('bindReset'); if (creset) creset.addEventListener('click', () => { UI.resetBindings(); UI.resetCardKeys(); UI.setGridKeys(false); UI.drawKeys(); });
  const kstd = $('keyStd'), kgrid = $('keyGrid');
  if (kstd) kstd.addEventListener('click', () => { UI.setGridKeys(false); UI.drawKeys(); });
  if (kgrid) kgrid.addEventListener('click', () => { UI.setGridKeys(true); UI.drawKeys(); });

  // ---- the three doors -------------------------------------------------------
  // The in-game settings screen changes the same values, so the tabs re-read them every time they are opened.
  const sb = $('settingsBtn'); if (sb) sb.addEventListener('click', () => { for (const f of refreshSettings) f(); UI.drawKeys(); UI.showPanel('settingsPanel'); });
  const sbk = $('settingsBack'); if (sbk) sbk.addEventListener('click', () => { UI.stopKeyGrab(); UI.showPanel('mainPanel'); });
  const spb = $('singleBtn'); if (spb) spb.addEventListener('click', () => UI.showPanel('singlePanel'));
  const spk = $('singleBack'); if (spk) spk.addEventListener('click', () => UI.showPanel('mainPanel'));
  const mpb = $('multiBtn'); if (mpb) mpb.addEventListener('click', () => UI.enterMultiplayer());
  // BACK from inside a lobby leaves the lobby: it used to leave the player's slot sitting in a room they could no longer
  // see, holding up everyone's START (seventh session, item 2). The connection stays, so MULTIPLAYER returns to the list.
  const mpk = $('multiBack'); if (mpk) mpk.addEventListener('click', () => { if (Net.lobby && !Net.active) Net.leaveRoom(); UI.showPanel('mainPanel'); });
  const cpb = $('campaignBtn'); if (cpb) cpb.addEventListener('click', () => UI.showPanel('campaignPanel'));
  const cpk = $('campaignBack'); if (cpk) cpk.addEventListener('click', () => UI.showPanel('singlePanel'));
  const setupBtn = $('setupBtn'); if (setupBtn) setupBtn.addEventListener('click', () => UI.Skirmish.open());

  // ---- everything else behind the doors, unchanged --------------------------
  const ms = $('mission'); if (ms) { for (const m of Missions.list) { const o = document.createElement('option'); o.value = m.id; o.textContent = `${RACE_INFO[m.race].name}: ${m.title}`; ms.appendChild(o); } $('missionBtn').addEventListener('click', () => { const m = Missions.get(ms.value); if (!m) return; UI.start({ players: [{ race: m.race, human: true, name: 'Player', team: 1 }, { race: m.enemy.race, human: false, difficulty: m.enemy.difficulty, name: 'Enemy', team: 2 }], seed: m.seed, layout: m.layout, mission: m.id }); }); }
  // Custom maps made in the editor appear in the skirmish lobby's map list with the built-ins. Editor.register() is what
  // puts them into MAP_LAYOUTS, so it runs before the lobby is drawn from it.
  UI.refreshMapList = () => {
    try { if (typeof Editor !== 'undefined') Editor.register(); } catch (e) { }
    const sp = $('skirmishPanel'); if (sp && sp.style.display !== 'none' && UI.Skirmish.L) UI.Skirmish.render();
  };
  UI.refreshMapList();
  const eb = $('editorBtn'); if (eb) eb.addEventListener('click', () => Editor.open());
  const mf = $('mapFile'); if (mf) mf.addEventListener('change', e => { if (e.target.files[0]) Editor.importFile(e.target.files[0]); e.target.value = ''; });
  const ab = $('autosaveBtn'); if (ab) { ab.style.display = Replay.hasAutosave() ? 'block' : 'none'; ab.addEventListener('click', () => Replay.loadAutosave()); }
  $('loadBtn').addEventListener('click', () => $('loadFile').click()); $('loadFile').addEventListener('change', e => { if (e.target.files[0]) Replay.fromFile(e.target.files[0], 'load'); e.target.value = ''; });
  $('replayBtn').addEventListener('click', () => $('replayFile').click()); $('replayFile').addEventListener('change', e => { if (e.target.files[0]) Replay.fromFile(e.target.files[0], 'watch'); e.target.value = ''; });

  // ---- what the page opens on ------------------------------------------------
  // AN INVITE LINK (seventh session): ?join=CODE connects and joins that game. The query comes off the address at once,
  // so a reload does not walk back into a lobby that has moved on. A player with no name yet is asked for one first.
  Net.race = Net.loadIdentity().race;
  const inv = Net.parseInvite(location.search);
  if (inv) { try { history.replaceState(null, '', location.pathname); } catch (e) { } }
  const go = inv ? () => UI.enterMultiplayer({ join: inv.code, server: inv.server }) : null;
  if (UI.needsName()) UI.askName(go);
  else if (go) go();
});
