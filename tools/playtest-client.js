'use strict';
// THE PLAYTEST RECORDER, the page's half. Served only by tools/playtest-listen.js, which puts it first in the page it
// hands out; the game, the desktop app and the relay never load it. It records a hand playtest for the assistant to read
// and posts it to the listener. It READS the game and never writes to it: every wrapper calls the original with the same
// arguments and returns what it returned, every hook is inside try/catch, and nothing here runs inside a simulation step
// -- so a fault in this file cannot change a game, a replay or a lockstep hash. Math.random below names a browser tab.
//
// What it sends (the `t` of each event):
//   boot            build stamp, window size, pixel ratio, browser, the bw_* settings this origin already holds
//   error, console-error, console-warn, resource, alert    anything the page complained about, with stacks
//   panel           a menu screen was shown, with the text on it
//   click, change, key    what the player pressed (typed text in a text box is not sent key by key; its value arrives
//                   as a `change`)
//   storage         a bw_* setting written or removed -- the name, a key binding, the skirmish setup (saves: size only)
//   net-in, net-out lobby and connection messages (command batches, hashes and pings are only counted, in `tick`)
//   net-status, net-error   what the multiplayer screen told the player
//   skirmish        a message the skirmish lobby answered
//   game-start, load, game-over    a game begun (its options), a save or replay opened, a game ended
//   tick            every five seconds in a game: clock, speed, frame rate, simulation rate, bank, supply, selection,
//                   and every production queue's head with its progress
//   stall           a queue head whose progress has not moved in ten game seconds of a running game (TODO-M18 item F)
//   gather          a right-click with several units selected: how spread they were, and eight seconds later how far
//                   each stands from the point (PLAYTEST-M18 item 93)
//   note            the player's own words, from the NOTE button, with the screen's text; a canvas shot goes separately
(function () {
  if (window.__playtest) return; window.__playtest = true;
  const T0 = performance.now();
  let tab = '', load = 1;
  try { tab = sessionStorage.getItem('pt_tab') || ''; if (!/^[a-z0-9]{1,12}$/.test(tab)) { tab = Math.random().toString(36).slice(2, 8); sessionStorage.setItem('pt_tab', tab); } load = (parseInt(sessionStorage.getItem('pt_load'), 10) || 0) + 1; sessionStorage.setItem('pt_load', String(load)); } catch (e) { tab = tab || 'nosess'; }
  let q = [], seq = 0, gameNo = 0, shots = 0;
  // G, UI, Net... are global `const`s, not window properties, so they are asked for by name, at the moment they are needed.
  const GLOBALS = { G: () => typeof G !== 'undefined', UI: () => typeof UI !== 'undefined', Net: () => typeof Net !== 'undefined', Replay: () => typeof Replay !== 'undefined', BUILD: () => typeof BUILD !== 'undefined', Render: () => typeof Render !== 'undefined' };
  const has = name => { try { return !!(GLOBALS[name] && GLOBALS[name]()); } catch (e) { return false; } };
  const str = (v, n) => { n = n || 2000; try { let s = typeof v === 'string' ? v : v instanceof Error ? (v.stack || v.message) : JSON.stringify(v); if (s === undefined) s = String(v); return s.length > n ? s.slice(0, n) + '...' : s; } catch (e) { return String(v); } };
  const ev = (t, o) => { try { q.push(Object.assign({ t, tab, load, seq: ++seq, ms: Math.round(performance.now() - T0), at: new Date().toISOString() }, o || {})); if (q.length > 5000) q.splice(0, q.length - 5000); } catch (e) { } };
  const post = (url, body, keep) => { try { return fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: !!keep }).catch(() => { }); } catch (e) { return null; } };
  const flush = last => { if (!q.length) return; const b = JSON.stringify(q); q = []; if (last && navigator.sendBeacon && b.length < 60000) { navigator.sendBeacon('/playtest/log', b); return; } post('/playtest/log', b, last && b.length < 60000); };
  setInterval(flush, 1000);

  // ---- complaints ----
  const repeats = new Map();
  const once = (key, fn) => { const n = (repeats.get(key) || 0) + 1; repeats.set(key, n); if (n <= 20 || n % 100 === 0) fn(n); };
  window.addEventListener('error', e => {
    try {
      const el = e.target;
      if (el && el !== window && (el.src || el.href)) { once('res|' + (el.src || el.href), n => ev('resource', { src: el.src || el.href, tag: el.tagName, n })); return; }
      once('err|' + e.message, n => ev('error', { msg: str(e.message, 600), src: e.filename, line: e.lineno, col: e.colno, stack: str(e.error && e.error.stack, 4000), n }));
    } catch (ex) { }
  }, true);
  window.addEventListener('unhandledrejection', e => { try { const r = e.reason; once('rej|' + str(r, 200), n => ev('error', { msg: 'unhandled rejection: ' + str(r && (r.stack || r.message) || r, 4000), n })); } catch (ex) { } });
  for (const level of ['error', 'warn']) {
    const orig = console[level];
    console[level] = function () { try { const args = Array.from(arguments).map(a => str(a, 2000)); once(level + '|' + (args[0] || '').slice(0, 200), n => ev('console-' + level, { args, n })); } catch (e) { } return orig.apply(this, arguments); };
  }
  const origAlert = window.alert;
  window.alert = function (m) { try { ev('alert', { msg: str(m, 1000) }); flush(); } catch (e) { } return origAlert.apply(this, arguments); };

  // ---- settings written ----
  const BIG = /^(bw_save|bw_autosave|bw_snap)/;
  const setItem = Storage.prototype.setItem, removeItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) { try { if (this === localStorage && /^bw_/.test(k)) ev('storage', BIG.test(k) ? { key: k, bytes: String(v).length } : { key: k, value: str(String(v), 6000) }); } catch (e) { } return setItem.apply(this, arguments); };
  Storage.prototype.removeItem = function (k) { try { if (this === localStorage && /^bw_/.test(k)) ev('storage', { key: k, removed: true }); } catch (e) { } return removeItem.apply(this, arguments); };

  // ---- what the player pressed ----
  const describe = el => {
    try {
      let x = el, hops = 0;
      while (x && x.nodeType === 1 && hops < 6 && !(x.id || x.dataset && Object.keys(x.dataset).length || /^(BUTTON|A|INPUT|SELECT|LABEL|OPTION|CANVAS)$/.test(x.tagName))) { x = x.parentElement; hops++; }
      if (!x || x.nodeType !== 1) return null;
      const o = { tag: x.tagName.toLowerCase() };
      if (x.id) o.id = x.id;
      if (x.className && typeof x.className === 'string') o.cls = x.className.slice(0, 80);
      if (x.dataset && Object.keys(x.dataset).length) o.data = Object.assign({}, x.dataset);
      const text = (x.innerText || x.value || x.title || '').trim().replace(/\s+/g, ' ');
      if (text && x.tagName !== 'CANVAS') o.text = text.slice(0, 60);
      if (x.disabled) o.disabled = true;
      return o;
    } catch (e) { return null; }
  };
  const inGame = () => has('UI') && !!UI.running;
  document.addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('#__pt')) return; const d = describe(e.target); if (d && d.tag !== 'canvas') ev('click', d); }, true);
  document.addEventListener('change', e => {
    try { const x = e.target; if (!x || !/^(INPUT|SELECT|TEXTAREA)$/.test(x.tagName)) return; ev('change', Object.assign(describe(x) || {}, { value: x.type === 'checkbox' ? !!x.checked : str(x.value, 200) })); } catch (ex) { }
  }, true);
  document.addEventListener('keydown', e => {
    try {
      const x = e.target, typing = x && (x.tagName === 'TEXTAREA' || (x.tagName === 'INPUT' && !/^(checkbox|range|radio|button)$/.test(x.type)));
      if (typing && !/^(Enter|Escape|Tab)$/.test(e.key)) return;
      const o = { key: e.key, code: e.code, game: inGame() };
      if (e.ctrlKey) o.ctrl = true; if (e.shiftKey) o.shift = true; if (e.altKey) o.alt = true; if (e.metaKey) o.meta = true; if (e.repeat) o.repeat = true;
      if (!o.game) { const d = describe(x); if (d && d.tag !== 'body') o.on = d; }
      ev('key', o);
    } catch (ex) { }
  }, true);
  window.addEventListener('resize', () => ev('resize', { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }));
  document.addEventListener('visibilitychange', () => { ev('visibility', { hidden: document.hidden }); if (document.hidden) flush(true); });
  window.addEventListener('pagehide', () => { ev('pagehide', {}); sendReplay(true); flush(true); });

  // ---- the game's own functions, wrapped once each as they come into existence ----
  const wrap = (obj, name, before, after) => {
    const f = obj && obj[name]; if (typeof f !== 'function' || f.__pt) return typeof f === 'function';
    const w = function () { try { if (before) before.apply(this, arguments); } catch (e) { } const r = f.apply(this, arguments); try { if (after) after.call(this, r, arguments); } catch (e) { } return r; };
    w.__pt = true; obj[name] = w; return true;
  };
  const NOISY = new Set(['cmds', 'hash', 'lping', 'lpong', 'ping', 'pong', 'countdown']);
  const noisy = { in: {}, out: {} };
  const panelText = id => { try { const el = document.getElementById(id); return el ? (el.innerText || '').trim().replace(/\n{2,}/g, '\n').slice(0, 1500) : ''; } catch (e) { return ''; } };
  const shownPanel = () => { try { const p = [...document.querySelectorAll('#menu .panel')].find(x => x.style.display !== 'none' && x.offsetParent !== null); return p ? p.id : ''; } catch (e) { return ''; } };
  const summarise = o => { try { return (o.players || []).map(p => (p.human ? 'you' : (p.difficulty || 'normal') + (p.style ? '/' + p.style : '')) + ':' + p.race + ':t' + p.team + (p.start != null ? ':s' + p.start : '')).join(' ') + ' on ' + o.layout + ' seed ' + o.seed + (o.mode ? ' ' + o.mode : '') + (o.net ? ' (network)' : ''); } catch (e) { return ''; } };
  let wrapped = {};
  const tryWrap = () => {
    if (has('UI')) {
      if (!wrapped.panel && UI.showPanel) wrapped.panel = wrap(UI, 'showPanel', null, (r, a) => { const id = a[0]; setTimeout(() => ev('panel', { id, text: panelText(id) }), 60); });
      if (!wrapped.start) wrapped.start = wrap(UI, 'start', a => { gameNo++; seen.over = false; seen.prod.clear(); ev('game-start', { game: gameNo, summary: summarise(a), opts: str(a, 6000) }); });
      if (!wrapped.fromLog) wrapped.fromLog = wrap(UI, 'startFromLog', (d, mode) => ev('load', { mode, info: str({ build: d && d.build, frame: d && d.frame, layout: d && d.layout, players: d && d.players && d.players.length }, 400) }));
      if (!wrapped.sk && UI.Skirmish) wrapped.sk = wrap(UI.Skirmish, 'apply', m => ev('skirmish', { m: str(m, 1000) }));
    }
    if (has('Net')) {
      if (!wrapped.nin) wrapped.nin = wrap(Net, 'handle', m => { if (!m) return; if (NOISY.has(m.t)) { noisy.in[m.t] = (noisy.in[m.t] || 0) + 1; return; } ev('net-in', { m: str(m, 3000) }); if (m.t === 'error') ev('net-error', { msg: m.msg }); });
      if (!wrapped.nout) wrapped.nout = wrap(Net, 'send', m => { if (!m) return; if (NOISY.has(m.t)) { noisy.out[m.t] = (noisy.out[m.t] || 0) + 1; return; } ev('net-out', { m: str(m, 2000) }); });
      if (!wrapped.nstat) wrapped.nstat = wrap(Net, 'status', t => { if (t) ev('net-status', { text: str(t, 300) }); });
      if (!wrapped.desync) wrapped.desync = wrap(Net, 'desync', (f, p) => ev('desync', { f, p }));
    }
    if (has('Replay')) { if (!wrapped.save) wrapped.save = wrap(Replay, 'save', () => ev('rec', { text: 'saved the game' })); }
  };
  setInterval(tryWrap, 250); tryWrap();
  // UI.showPanel is ASSIGNED inside the game's DOMContentLoaded handler, and the first screen (the name prompt, or the
  // main menu) is shown from that same handler -- before any timer here runs. This capture listener runs before that
  // handler (capture before bubble), when UI exists and showPanel does not yet, and traps the assignment.
  window.addEventListener('DOMContentLoaded', () => {
    try {
      if (!has('UI') || Object.getOwnPropertyDescriptor(UI, 'showPanel')) return;
      let fn;
      Object.defineProperty(UI, 'showPanel', { configurable: true, enumerable: true, get() { return fn; }, set(v) { const holder = { f: v }; wrap(holder, 'f', null, (r, a) => { const id = a[0]; setTimeout(() => ev('panel', { id, text: panelText(id) }), 60); }); fn = holder.f; } });
      wrapped.panel = true;
    } catch (e) { }
  }, true);

  // ---- the boot line ----
  const boot = () => {
    const keys = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^bw_/.test(k)) continue; const v = localStorage.getItem(k) || ''; keys[k] = BIG.test(k) ? v.length + ' bytes' : v.slice(0, 1500); } } catch (e) { }
    ev('boot', { build: has('BUILD') && BUILD.hash ? BUILD.hash() : null, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent, url: location.pathname + location.search, storage: keys, panel: shownPanel() });
    flush();
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(boot, 200)); else setTimeout(boot, 200);

  // ---- in a game ----
  let frames = 0, fps = 0; const rafCount = () => { frames++; requestAnimationFrame(rafCount); }; requestAnimationFrame(rafCount);
  setInterval(() => { fps = frames; frames = 0; }, 1000);
  const seen = { over: false, prod: new Map(), lastFrame: -1, lastAt: 0, logLen: -1, replayAt: 0 };
  const prims = (o, max) => { const r = {}; let n = 0; try { for (const k of Object.keys(o)) { if (n >= (max || 90)) break; const v = o[k]; if (typeof v === 'number' || typeof v === 'boolean') { r[k] = v; n++; } else if (typeof v === 'string' && v.length <= 60) { r[k] = v; n++; } else if (v && typeof v === 'object' && !Array.isArray(v) && (v.id != null || v.type)) { r[k] = { id: v.id, type: v.type }; n++; } else if (Array.isArray(v) && v.length <= 12) { r[k] = v.map(x => x && typeof x === 'object' ? (x.id != null ? x.id : x.type || '?') : x); n++; } } } catch (e) { } return r; };
  const clock = f => { const s = Math.floor(f / 24); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function sendReplay(last) {
    try {
      if (!has('Replay') || !has('G') || !G.setup || !G.log) return;
      if (G.log.length === seen.logLen && !last) return;
      seen.logLen = G.log.length;
      const body = JSON.stringify(Replay.data());
      post('/playtest/replay?tab=' + tab + '&n=' + gameNo, body, last && body.length < 60000);
    } catch (e) { }
  }
  setInterval(() => {
    try {
      if (!inGame() || !has('G') || !G.players || !G.players.length) return;
      const hp = G.players[G.human]; if (!hp) return;
      const now = performance.now(), tps = seen.lastFrame >= 0 && now > seen.lastAt ? Math.round((G.frame - seen.lastFrame) * 1000 / (now - seen.lastAt)) : null;
      seen.lastFrame = G.frame; seen.lastAt = now;
      const prod = [];
      for (const u of G.units) {
        if (!u.alive || u.owner !== G.human || !u.isBuilding || !u.prod || !u.prod.length) continue;
        const it = u.prod[0];
        prod.push({ id: u.id, b: u.def.id, it: it.kind + ':' + it.id, p: it.progress, of: it.total, n: u.prod.length });
        const key = it.kind + ':' + it.id, s = seen.prod.get(u.id);
        if (!s || s.key !== key || s.p !== it.progress) { seen.prod.set(u.id, { key, p: it.progress, frame: G.frame, flagged: false }); continue; }
        // A unit waiting for supply is the rule working, not a stall: the first playtest's three "stalls" were a Probe at 10/10
        // and 18/18 and a Zealot (two supply) at 103/104.
        const ud = it.kind === 'unit' && typeof DATA !== 'undefined' && DATA.units ? DATA.units[it.id] : null;
        if (it.kind === 'unit' && hp.supUsed + (ud && ud.sup != null ? ud.sup : 1) > hp.supMax) { s.frame = G.frame; continue; }
        if (!s.flagged && G.frame - s.frame >= 240) {
          s.flagged = true;
          ev('stall', { what: u.def.id + ' #' + u.id + ' ' + key + ' stuck at ' + it.progress + '/' + it.total + ' since ' + clock(s.frame) + ' (now ' + clock(G.frame) + ')', building: prims(u), item: prims(it), queue: u.prod.map(x => x.kind + ':' + x.id + ':' + x.progress), player: prims(hp), researching: hp.researching ? [...hp.researching] : [], frame: G.frame });
          sendReplay(false);
        }
      }
      ev('tick', { game: gameNo, frame: G.frame, clock: clock(G.frame), mode: UI.mode, speed: UI.speedIdx, paused: !!G.paused, fps, tps, minerals: hp.minerals, gas: hp.gas, supply: Math.ceil(hp.supUsed) + '/' + hp.supMax, units: G.units.filter(u => u.alive && u.owner === G.human).length, sel: (UI.selection || []).map(u => u.def && u.def.id).slice(0, 24), prod, researching: hp.researching ? [...hp.researching] : [], zoom: has('Render') ? Render.zoom : null, net: has('Net') && Net.active ? { in: noisy.in, out: noisy.out } : null });
      if (G.over && !seen.over) { seen.over = true; ev('game-over', { game: gameNo, clock: clock(G.frame), result: 'winner ' + G.winner + ', you are player ' + G.human + ' on team ' + hp.team }); sendReplay(true); }
      if (now - seen.replayAt > 30000) { seen.replayAt = now; sendReplay(false); }
    } catch (e) { }
  }, 5000);

  // ---- a right-click with several units selected (item 93) ----
  // Only the LAST right-click of a burst is measured: a second one inside the eight seconds sends the units somewhere else,
  // and measuring the first against its own point would read as units that never gathered.
  let rdown = null, rseq = 0;
  document.addEventListener('mousedown', e => {
    try {
      if (e.button !== 2 || !inGame() || !(e.target && e.target.tagName === 'CANVAS')) return;
      const sel = (UI.selection || []).filter(u => u.alive && !u.isBuilding);
      if (sel.length < 2) return;
      rdown = { x: e.clientX, y: e.clientY, units: sel.map(u => ({ u, x: u.x, y: u.y })) };
    } catch (ex) { }
  }, true);
  document.addEventListener('mouseup', e => {
    try {
      if (e.button !== 2 || !rdown || !has('Render')) return;
      const d = rdown; rdown = null;
      const drag = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const [wx, wy] = Render.screenToWorld(e.clientX, e.clientY);
      const spread = pts => { const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length; return Math.round(Math.max(...pts.map(p => Math.hypot(p.x - cx, p.y - cy)))); };
      const before = spread(d.units), types = [...new Set(d.units.map(p => p.u.def.id))].join(','), mine = ++rseq;
      setTimeout(() => {
        try {
          if (mine !== rseq) return;
          const live = d.units.filter(p => p.u.alive), now = live.map(p => ({ x: p.u.x, y: p.u.y }));
          if (!now.length) return;
          const far = Math.round(Math.max(...now.map(p => Math.hypot(p.x - wx, p.y - wy))));
          ev('gather', { n: d.units.length, types, line: drag > 12, point: [Math.round(wx), Math.round(wy)], spreadBefore: before, spreadAfter: spread(now), farthestFromPoint: far, frame: has('G') ? G.frame : null });
        } catch (ex) { }
      }, 8000);
    } catch (ex) { }
  }, true);

  // ---- the NOTE button, and the sign that this page is being recorded ----
  const badge = () => {
    if (document.getElementById('__pt') || !document.body) return;
    const b = document.createElement('div'); b.id = '__pt';
    b.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:2147483647;font:11px/16px sans-serif;color:#ffcc66;background:rgba(10,12,16,.72);border:1px solid rgba(255,204,102,.55);border-radius:9px;padding:1px 8px;user-select:none;cursor:pointer';
    b.title = 'This page is recorded for the playtest. Click to write a note (a screenshot of the game goes with it).';
    b.innerHTML = '<span style="color:#ff5a4f">&#9679;</span> REC &middot; <b>NOTE</b>';
    b.addEventListener('mousedown', e => e.stopPropagation(), true);
    b.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault();
      let shot = null;
      try { if (inGame()) { const c = [...document.querySelectorAll('canvas')].sort((a, z) => z.width * z.height - a.width * a.height)[0]; if (c) shot = c.toDataURL('image/jpeg', 0.72); } } catch (ex) { shot = null; }
      const text = window.prompt('Playtest note: what did you see? (It is saved with where you are' + (shot ? ' and a screenshot' : '') + '.)');
      if (text == null || !text.trim()) return;
      const where = inGame() && has('G') ? 'in a game at ' + clock(G.frame) : 'screen ' + (shownPanel() || '?');
      ev('note', { text: text.trim().slice(0, 2000), where, panel: shownPanel(), panelText: inGame() ? '' : panelText(shownPanel()), frame: has('G') && inGame() ? G.frame : null, shot: shot ? ++shots : null });
      if (shot) post('/playtest/shot?tab=' + tab + '&n=' + shots, shot);
      if (inGame()) sendReplay(false);
      flush();
    });
    document.body.appendChild(b);
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', badge); else badge();
})();
