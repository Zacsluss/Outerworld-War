// SETTINGS (seventh session, item 2: "a truly sophisticated set of menus"). The Settings plate becomes tabs, and gains
// the settings a player has asked about or will: the HUD size (the player asked about it twice -- first too small, then
// too big), scroll speed, edge scrolling, one master volume, and the multiplayer name and server.
//   node test/settings.js
//
//  1. THE WIRING: index.html has the six tabs and every control id js/ui.js reaches for (the eighth session added Codex)
//  2. HUD SIZE: 1.4 unless the player says otherwise; 1.0 is the original console and 1.6 the largest; kept in range,
//     remembered, and a malformed stored value is the default rather than a broken HUD
//  3. SCROLL SPEED and EDGE SCROLL move the camera by exactly what they say, and edge scroll off leaves the arrow keys
//  4. VOLUME reaches all three places sound comes from: the interface tones, the voices and the music
//  5. THE IN-GAME SETTINGS SCREEN steps the same four values, and the menu's tabs read them back
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = v => JSON.stringify(v);

// ---- 1. THE WIRING ----
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const panel = (html.match(/<div class="panel wide" id="settingsPanel"[\s\S]*?<button id="settingsBack"/) || [''])[0];
  const tabs = (panel.match(/data-tab="(\w+)"/g) || []).map(s => s.slice(10, -1));
  const bodies = (panel.match(/data-body="(\w+)"/g) || []).map(s => s.slice(11, -1));
  ok(J(tabs) === J(['game', 'display', 'audio', 'online', 'keys', 'codex']) && J(bodies) === J(tabs), 'Settings has six tabs, each with its own body: Game, Display, Audio, Multiplayer, Controls, Codex', J({ tabs, bodies }));
  const ids = ['optScroll', 'optScrollVal', 'optEdge', 'optHud', 'optHudVal', 'mute', 'voice', 'music', 'optVolume', 'optVolumeVal', 'optNetName', 'optNetUrl', 'bindList', 'bindReset', 'keyStd', 'keyGrid', 'codexBtn', 'settingsBack', 'setTabs'];
  const ui = fs.readFileSync(path.join(root, 'js', 'ui.js'), 'utf8');
  const missing = ids.filter(id => !new RegExp('id="' + id + '"').test(html)), unread = ids.filter(id => id !== 'settingsBack' && !/Val$/.test(id) && !ui.includes("'" + id + "'"));
  ok(!missing.length && !unread.length, 'every control is on the page and js/ui.js reaches for every one of them', J({ missing, unread }));
}

// ---- a context that loads what the page loads, and boots nothing ----
function mkCtx(stored) {
  const store = Object.assign({}, stored || {});
  const cv = () => ({ width: 1, height: 1, style: {}, getContext: () => null, toDataURL: () => '', addEventListener() { }, appendChild() { }, remove() { }, click() { }, value: '' });
  const c = {
    console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { },   // 1, not 0: Music keeps its timer handle as the sign it is playing
    addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { protocol: 'http:', host: 'localhost' },
    document: { getElementById: () => cv(), createElement: () => cv(), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
  };
  c.window = c; c.globalThis = c; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  c.__store = store;
  return c;
}
const R = (c, src) => vm.runInContext('(() => {' + src + '})()', c);

// ---- 2. HUD SIZE ----
{
  const c = mkCtx();
  const band = scale => R(c, 'Render.W = 1920; Render.H = 1080; ' + (scale === undefined ? '' : 'UI.setHudScale(' + J(scale) + '); ') + 'return { ch: UI.consoleH, k: +UI.hudK.toFixed(3), s: UI.hudScale };');
  R(c, 'UI.loadPrefs();');
  const d = band();
  ok(d.s === 1.4 && d.ch === 274, 'with nothing stored the HUD is 1.4x: the 274 px band at 1080p that test/qol.js pins', J(d));
  const one = band(1), max = band(1.6), over = band(9), junk = band('big');
  ok(one.ch === 196 && one.k === 1 && max.ch === 314 && over.s === 1.6 && junk.s === 1.4, '1.0x is the original 196 px console, 1.6x is the largest (314), past it is 1.6, and nonsense is the default', J({ one, max, over, junk }));
  band(1.2);
  ok(c.__store.bw_hud_scale === '1.2', 'the size chosen is remembered', J(c.__store));
  const c2 = mkCtx({ bw_hud_scale: '1.2', bw_scroll: '1.5', bw_edge: 'false', bw_volume: '0.5' });
  const loaded = R(c2, 'UI.loadPrefs(); return { h: UI.hudScale, s: UI.scrollSpeed, e: UI.edgeScroll, v: Sound.volume };');
  ok(J(loaded) === J({ h: 1.2, s: 1.5, e: false, v: 0.5 }), 'the next page load comes back with every remembered setting', J(loaded));
  const c3 = mkCtx({ bw_hud_scale: '"huge"', bw_scroll: '{bad json', bw_volume: '7' });
  const bad = R(c3, 'UI.loadPrefs(); return { h: UI.hudScale, s: UI.scrollSpeed, e: UI.edgeScroll, v: Sound.volume, stored: Object.keys(__store).length };');
  ok(bad.h === 1.4 && bad.s === 1 && bad.e === true && bad.v === 1 && bad.stored === 3, 'a malformed or out-of-range stored value loads as the default (volume 7 is 1), and loading writes nothing', J(bad));
}

// ---- 3. SCROLL SPEED AND EDGE SCROLL ----
{
  const c = mkCtx();
  const pan = (speed, edge, how) => R(c, 'UI.loadPrefs(); G.init({ players: [{ race: "T", human: true }, { race: "Z", human: false }], seed: 2, layout: "temple" }); Render.W = 1280; Render.H = 720; Render.zoom = 1;'
    + ' UI.setScrollSpeed(' + speed + '); UI.setEdgeScroll(' + edge + '); UI.menu = null; UI.keys = {}; UI.mouse = { x: 640, y: 300, inside: true };'
    + (how === 'key' ? ' UI.keys.ArrowRight = true;' : ' UI.mouse.x = 0;')
    + ' Render.camX = 1200; Render.camY = 1200; const x0 = Render.camX; UI.scrollCam(0.1); return +(Render.camX - x0).toFixed(3);');
  const k1 = pan(1, true, 'key'), k2 = pan(2, true, 'key'), kh = pan(0.5, true, 'key'), e1 = pan(1, true, 'edge'), e0 = pan(1, false, 'edge'), k0 = pan(1, false, 'key');
  ok(k1 === 90 && k2 === 180 && kh === 45, 'SCROLL SPEED pans by exactly what it says: 90 px in a tenth of a second at 100%, 180 at 200%, 45 at 50%', J({ k1, k2, kh }));
  ok(e1 === -90 && e0 === 0 && k0 === 90, 'EDGE SCROLL off stops the mouse at the edge panning, and leaves the arrow keys alone', J({ e1, e0, k0 }));
}

// ---- 4. VOLUME ----
{
  const c = mkCtx();
  const heard = R(c, `
    const log = { tone: [], voice: [], music: [] };
    const gain = sink => ({ gain: { set value(v) { sink.push(v); }, get value() { return 0; }, exponentialRampToValueAtTime() {}, linearRampToValueAtTime(v) { sink.push(v); }, cancelScheduledValues() {}, setValueAtTime(v) { sink.push(v); } }, connect() {} });
    Sound.ctx = { state: 'running', currentTime: 0, destination: {}, createOscillator: () => ({ type: '', frequency: { value: 0, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }), createGain: () => gain(log.tone) };
    Sound.enabled = true; Sound.muted = false;
    UI.setVolume(0.5); Sound.tone(440, 0.1, 'square', 0.05);
    UI.setVolume(0); Sound.tone(440, 0.1, 'square', 0.05);
    this.SpeechSynthesisUtterance = function (t) { this.text = t; };
    this.speechSynthesis = { speaking: false, cancel() {}, speak(u) { log.voice.push(+u.volume.toFixed(3)); } };
    UI.setVolume(0.5); Voice.on = true; Voice.lastAt = -1e9; Voice.speak('Hello', 'T', 'adv');
    Music.ctx = { state: 'running', currentTime: 0, destination: {}, createGain: () => gain(log.music), createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: {} }), createBiquadFilter: () => ({ frequency: {}, connect() {} }), createBuffer: () => ({ getChannelData: () => new Float32Array(1) }), createBufferSource: () => ({ connect() {}, start() {} }), sampleRate: 44100 };
    Music.on = true; Music.bar = () => {}; UI.setVolume(0.5); Music.start();
    const rampTarget = log.music.slice(-1)[0];
    UI.setVolume(1);
    return { tone: log.tone, voice: log.voice, rampTarget, after: log.music.slice(-1)[0], stored: __store.bw_volume };
  `);
  ok(heard.tone.length === 1 && heard.tone[0] === 0.025, 'an interface tone plays at its level times the volume, and at zero it does not play at all', J(heard.tone));
  ok(heard.voice.length === 1 && heard.voice[0] === 0.45, 'a voice line is spoken at its level times the volume', J(heard.voice));
  ok(Math.abs(heard.rampTarget - 0.08) < 1e-9 && Math.abs(heard.after - 0.16) < 1e-9, 'the music rises to its level times the volume, and a change while it plays applies at once', J(heard));
  ok(heard.stored === '1', 'the volume is remembered (mute, on purpose, still is not)', J(heard.stored));
}

// ---- 5. THE IN-GAME SETTINGS SCREEN ----
{
  const c = mkCtx();
  const steps = R(c, `
    UI.loadPrefs(); UI.menu = 'settings';
    const label = re => UI.menuItems().items.find(i => re.test(i[0]));
    const press = re => { const it = label(re); if (!it) return null; it[1](); const now = label(re); return now ? now[0] : null; };   // a missing item reads as null, so its check fails rather than the suite throwing
    const before = UI.menuItems().items.map(i => i[0]).filter(t => /HUD size|Scroll speed|Edge scroll|Volume/.test(t));
    const hud = [press(/^HUD size/), press(/^HUD size/), press(/^HUD size/)];
    const scroll = [press(/^Scroll speed/), press(/^Scroll speed/)];
    const edge = press(/^Edge scroll/), vol = press(/^Volume/);
    UI.menu = null;
    return { before, hud, scroll, edge, vol, values: { h: UI.hudScale, s: UI.scrollSpeed, e: UI.edgeScroll, v: Sound.volume } };
  `);
  ok(J(steps.before) === J(['HUD size: 1.4x', 'Scroll speed: 100%', 'Edge scroll: on', 'Volume: 100%']), 'the in-game settings screen shows the same four settings', J(steps.before));
  ok(J(steps.hud) === J(['HUD size: 1.5x', 'HUD size: 1.6x', 'HUD size: 1.0x']) && J(steps.scroll) === J(['Scroll speed: 150%', 'Scroll speed: 200%']) && steps.edge === 'Edge scroll: off' && steps.vol === 'Volume: 25%',
    'each press steps the value and wraps round: HUD 1.4 -> 1.5 -> 1.6 -> 1.0, scroll 100% -> 150% -> 200%, volume 100% -> 25%', J(steps));
  ok(J(steps.values) === J({ h: 1, s: 2, e: false, v: 0.25 }), '...and the values it stepped are the ones the game uses', J(steps.values));
}

console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
