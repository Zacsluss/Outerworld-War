// REVIEW-M17 -- the interface faults the review found, fixed, and pinned.
//   node test/review17ui.js
//
// Presentation code is not stamped and cannot be checked by looking, so these assert the things around
// the drawing that CAN fail silently: which handler a key reaches, whether a spawn fires once per sim
// frame or once per drawn frame, whether a second open of the editor asks for a frame at all. Each
// section was RED against the tree before its fix; the messages carry what the probe saw.
//
//  1. KEYS LEAKED INTO TEXT FIELDS AND THE MAIN MENU. With the Name box focused, Enter opened an invisible
//     chat buffer that ate every key until Escape, and F5 threw inside Replay.data() with no game.
//  2. THE ZOOM KEYS NEVER MATCHED. zoomIn was bound to '=' and read with Shift held, when e.key is '+';
//     the speed line below matched '+' instead, so Shift+= sped the game up and nothing zoomed.
//  3. F8 LOADED THE AUTOSAVE OVER A RUNNING GAME WITH NO CONFIRMATION, while the help text called it a
//     camera slot.
//  4. TAB NEVER TURNED THE CARD PAGE. cycleSubgroup took Tab before the card saw it, even with one kind
//     of unit selected, so the 'More 1/2' button was click-only in Brood War hotkey mode.
//  5. AN ALLY'S PING NEVER BECAME "JUMP TO LAST ALERT": G.signal recorded it on G, the key read UI's own.
//  6. THE SPEED KEYS AND THE DRAW PASS IGNORED THE HOST'S SPEED in a network game, so units stepped.
//  7. INPUT DURING A REJOIN CATCH-UP was stamped with a frame the live clients had passed.
//  8. THE EDITOR WENT BLANK ON ITS SECOND OPEN: the draw loop was made once and never re-armed.
//  9. EFFECTS FIRED PER DRAWN FRAME, NOT PER SIM FRAME: decals aged 2.5x too fast at 60 Hz, a rocket's
//     smoke spawned two or three times a tick, and the rocket's trail used keys p() does not read.
// 10. THE MANUAL COULD NOT BE WHEEL-SCROLLED: the wheel handler returned before calling Codex.wheel.
// 11. Static: the terrain clamp uses both axes, the minimap reads the tileset's palette, the help text
//     tells the truth about F-keys, and three pieces of dead code are gone.
// 12. THE FOG SHOWED WHAT IS THERE, NOT WHAT YOU SAW: G.rememberSeen kept the memory since M11 and the
//     renderer drew live enemy buildings on explored ground (REVIEW-M17 decision 10).
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + extra : '')); } };
const src = f => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');

function makeCtx() {
  const listeners = {};
  const cx2d = () => new Proxy({ canvas: null, measureText: () => ({ width: 10 }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), createRadialGradient: () => ({ addColorStop() { } }), createLinearGradient: () => ({ addColorStop() { } }), createPattern: () => ({}) }, { get: (t, k) => k in t ? t[k] : (() => { }) });
  const el = () => ({ style: {}, width: 800, height: 600, addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }, removeEventListener() { }, click() { }, remove() { }, getContext: cx2d, value: '', appendChild() { }, textContent: '', getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), focus() { }, blur() { } });
  const ctx = {
    console: { log() { }, warn() { }, error: (...a) => ctx.errors.push(String(a[0] && a[0].message || a[0])) }, errors: [], listeners, Math, performance, addEventListener(type, fn) { (listeners['window:' + type] = listeners['window:' + type] || []).push(fn); }, setTimeout, clearTimeout, setInterval() { return 0; }, clearInterval() { },
    localStorage: { getItem() { return null; }, setItem() { }, removeItem() { } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [], querySelector: () => null },
    requestAnimationFrame(fn) { ctx.rafs.push(fn); return ctx.rafs.length; }, rafs: [], Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, alert() { }, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600,
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'terrain', 'fx', 'render', 'editor', 'ui', 'hud']) vm.runInContext(src(f), ctx, { filename: f + '.js' });
  vm.runInContext(`
    Sound.init = () => {}; Sound.click = () => {}; Sound.setMuted = () => {}; Sound.alert = () => {}; Sound.attack = () => {};   // js/ui.js declares Sound; js/audio.js is not loaded
    var Voice = { announce() {}, speak() {} };
    var Codex = { open: false, wheels: [], isOpen() { return this.open; }, wheel(dy) { this.wheels.push(dy); return true; }, key() { return false; }, toggle() { this.open = !this.open; } };
    UI.ping = UI.ping.bind(UI); UI.onUnitDied = () => {};
    Render.setZoom = z => { Render.zoomCalls.push(z); Render.zoom = z; }; Render.zoomCalls = []; Render.zoom = 1; Render.camX = 0; Render.camY = 0; Render.W = 800; Render.H = 600;
    UI.clampCam = () => {}; UI.centerOn = (x, y) => { UI.centred = [x, y]; };
    UI.init();
  `, ctx);
  return ctx;
}
const R = (c, s) => vm.runInContext('(() => {' + s + '})();', c);
const ctx = makeCtx();
const key = (c, k, extra) => R(c, `const e = Object.assign({ key: ${JSON.stringify(k)}, target: { tagName: 'CANVAS' }, pd: false, preventDefault() { this.pd = true; } }, ${JSON.stringify(extra || {})}); UI.onKey(e); return e.pd;`);
R(ctx, `G.init({ players: [{ race: 'T', human: true, name: 'H' }, { race: 'Z', human: false, difficulty: 'easy', name: 'C' }], seed: 3, layout: 'temple' }); G.human = 0; UI.running = true; UI.mode = 'play'; UI.menu = null; UI.chat = null; UI.loading = null; UI.net = false;`);

// ============================================================================
// 1. keys in a text field, and keys with no game running
// ============================================================================
{
  R(ctx, 'UI.chat = null;');
  const pd = R(ctx, `const e = { key: 'Enter', target: { tagName: 'INPUT' }, pd: false, preventDefault() { this.pd = true; } }; UI.onKey(e); return { pd: e.pd, chat: UI.chat };`);
  ok('Enter inside a text field is left to the field (was: an invisible chat buffer opened)', pd.pd === false && pd.chat === null, JSON.stringify(pd));
  const ctl = R(ctx, `const e = { key: 'Enter', target: { tagName: 'CANVAS' }, pd: false, preventDefault() { this.pd = true; } }; UI.onKey(e); const r = { chat: UI.chat }; UI.chat = null; return r;`);
  ok('...and the same key on the canvas opens chat (negative control)', ctl.chat === '', JSON.stringify(ctl));
  const noGame = R(ctx, `UI.running = false; let saved = 0; const orig = Replay.save; Replay.save = () => { saved++; }; const e = { key: 'F5', target: { tagName: 'BODY' }, pd: false, preventDefault() { this.pd = true; } }; UI.onKey(e); const e2 = { key: 'Enter', target: { tagName: 'BODY' }, pd: false, preventDefault() { this.pd = true; } }; UI.onKey(e2); Replay.save = orig; const r = { saved, chat: UI.chat, pd: e.pd }; UI.running = true; UI.chat = null; return r;`);
  ok('with no game running, F5 does not try to save and Enter does not open chat (F5 used to throw in Replay.data)', noGame.saved === 0 && noGame.chat === null, JSON.stringify(noGame));
  const codexStill = R(ctx, `UI.running = false; const before = Codex.open; const e = { key: UI.key('codex'), target: { tagName: 'BODY' }, pd: false, preventDefault() { this.pd = true; } }; UI.onKey(e); const r = { toggled: Codex.open !== before }; Codex.open = false; UI.running = true; return r;`);
  ok('...but the codex key still works from the main menu', codexStill.toggled === true, JSON.stringify(codexStill));
}

// ============================================================================
// 2. the zoom keys zoom and the speed keys speed
// ============================================================================
{
  const out = R(ctx, `Render.zoomCalls = []; UI.speedIdx = 3; const s0 = UI.speedIdx;   // below the cap, so a step up is visible
    const plus = { key: '+', shiftKey: true, target: { tagName: 'CANVAS' }, preventDefault() {} }; UI.onKey(plus);
    const zoomed = Render.zoomCalls.slice(); const s1 = UI.speedIdx;
    const eq = { key: '=', target: { tagName: 'CANVAS' }, preventDefault() {} }; UI.onKey(eq);
    const s2 = UI.speedIdx; const zoomedAfterEq = Render.zoomCalls.length;
    const under = { key: '_', shiftKey: true, target: { tagName: 'CANVAS' }, preventDefault() {} }; UI.onKey(under);
    UI.speedIdx = s0; return { zoomed, s0, s1, s2, zoomedAfterEq, out: Render.zoomCalls[Render.zoomCalls.length - 1] };`);
  ok('Shift+= (e.key "+") zooms in (was: sped the game up, zoomed nothing)', out.zoomed.length === 1 && out.zoomed[0] > 1 && out.s1 === out.s0, JSON.stringify(out));
  ok('bare = speeds the game up and does not zoom', out.s2 === out.s0 + 1 && out.zoomedAfterEq === 1, JSON.stringify(out));
  ok('Shift+- (e.key "_") zooms out', out.out < 1.25, JSON.stringify(out));
}

// ============================================================================
// 3. F8 asks before loading the autosave over a running game
// ============================================================================
{
  const out = R(ctx, `let loads = 0, asked = 0; Replay.hasAutosave = () => true; Replay.loadAutosave = () => { loads++; };
    this.confirm = () => { asked++; return false; }; UI.running = true; UI.onKey({ key: 'F8', target: { tagName: 'CANVAS' }, preventDefault() {} });
    const refused = { loads, asked };
    this.confirm = () => { asked++; return true; }; UI.onKey({ key: 'F8', target: { tagName: 'CANVAS' }, preventDefault() {} });
    const accepted = { loads, asked };
    return { refused, accepted };`);
  ok('F8 with a game running asks first, and a "no" loads nothing (was: the game was replaced in silence)', out.refused.asked === 1 && out.refused.loads === 0, JSON.stringify(out));
  ok('...and a "yes" loads the autosave', out.accepted.loads === 1, JSON.stringify(out));
}

// ============================================================================
// 4. Tab turns the card page when there is no subgroup to cycle
// ============================================================================
{
  const out = R(ctx, `let turned = 0; const card = [{ hk: 'Tab', fn: () => { turned++; }, enabled: true, label: 'More 1/2' }];
    const origCard = UI.currentCard, origSel = UI.ownSel, origPress = UI.press;
    UI.currentCard = () => card; UI.press = b => b.fn(); UI.subgroup = 0;
    UI.ownSel = () => [{ def: { id: 'marine' } }, { def: { id: 'marine' } }];
    UI.onKey({ key: 'Tab', target: { tagName: 'CANVAS' }, preventDefault() {} });
    const oneKind = { turned, subgroup: UI.subgroup };
    UI.ownSel = () => [{ def: { id: 'marine' } }, { def: { id: 'medic' } }];
    UI.onKey({ key: 'Tab', target: { tagName: 'CANVAS' }, preventDefault() {} });
    const twoKinds = { turned, subgroup: UI.subgroup };
    UI.currentCard = origCard; UI.ownSel = origSel; UI.press = origPress; UI.subgroup = 0;
    return { oneKind, twoKinds };`);
  ok('with one kind selected, Tab reaches the card and turns the page (was: swallowed by cycleSubgroup)', out.oneKind.turned === 1 && out.oneKind.subgroup === 0, JSON.stringify(out));
  ok('with two kinds selected, Tab cycles the subgroup and the page stays (negative control)', out.twoKinds.turned === 1 && out.twoKinds.subgroup === 1, JSON.stringify(out));
}

// ============================================================================
// 5. the last alert is the most recent one, ours or an ally's
// ============================================================================
{
  const out = R(ctx, `UI.centred = null; G.lastAlertPos = { x: 100, y: 200, f: 50 }; UI.lastAlertPos = { x: 1, y: 2, f: 10 };
    UI.onKey({ key: UI.key('lastAlert'), target: { tagName: 'CANVAS' }, preventDefault() {} }); const ally = UI.centred;
    UI.lastAlertPos = { x: 1, y: 2, f: 60 }; UI.onKey({ key: UI.key('lastAlert'), target: { tagName: 'CANVAS' }, preventDefault() {} }); const own = UI.centred;
    G.frame = 77; G.signal(1, 'ping', 300, 400, null); const rec = G.lastAlertPos; UI.ping(5, 6); const mine = UI.lastAlertPos;
    return { ally, own, rec, mine };`);
  ok('an ally\'s later ping wins the jump (was: only our own alerts were read)', out.ally && out.ally[0] === 100 && out.ally[1] === 200, JSON.stringify(out.ally));
  ok('...and our own later alert wins the next one', out.own && out.own[0] === 1, JSON.stringify(out.own));
  ok('both records carry the frame they were made on', out.rec && out.rec.f === 77 && out.mine && typeof out.mine.f === 'number', JSON.stringify([out.rec, out.mine]));
}

// ============================================================================
// 6. one speed index: the host's in a network game
// ============================================================================
{
  const out = R(ctx, `this.Net = { speed: 3, active: true, connected: true }; UI.net = true; const s0 = UI.speedIdx;
    const net = UI.speedIndex(); const msgs = []; const p = G.players[G.human]; const om = p.msg; p.msg = (t) => msgs.push(t);
    UI.onKey({ key: '=', target: { tagName: 'CANVAS' }, preventDefault() {} }); p.msg = om;
    const r = { net, idxAfter: UI.speedIdx, s0, said: msgs.join(' | ') }; UI.net = false; delete this.Net; r.local = UI.speedIndex(); return r;`);
  ok('in a network game the draw pass and the sim step share the host\'s speed index (was: speedIdx for one, Net.speed for the other)', out.net === 3, JSON.stringify(out));
  ok('...and the speed key changes nothing there but says why', out.idxAfter === out.s0 && /host sets the speed/.test(out.said), JSON.stringify(out));
  ok('out of a network game the index is the local one', out.local === out.s0, JSON.stringify(out));
}

// ============================================================================
// 7. no input while a rejoin is catching up
// ============================================================================
{
  const out = R(ctx, `UI.loading = { target: 999 }; UI.mouse.x = -1;
    const e = { key: 'a', target: { tagName: 'CANVAS' }, pd: false, preventDefault() { this.pd = true; } }; UI.onKey(e);
    UI.onDown({ clientX: 50, clientY: 50, button: 0, preventDefault() {} });
    const r = { keyBlocked: e.pd, mouseX: UI.mouse.x }; UI.loading = null; return r;`);
  ok('a key during a catch-up is swallowed and a click is ignored', out.keyBlocked === true && out.mouseX === -1, JSON.stringify(out));
}

// ============================================================================
// 8. the editor asks for a frame on every open
// ============================================================================
{
  const out = R(ctx, `Editor.draw = () => {}; Editor.template = () => {}; Editor.resize = () => {}; Editor.bind = () => {};
    const n0 = this.rafs.length; Editor.open(); const n1 = this.rafs.length;
    this.rafs[this.rafs.length - 1]();               // the loop runs once and re-requests while active
    const n2 = this.rafs.length; Editor.close(); this.rafs[this.rafs.length - 1](); // the loop sees active=false and stops
    const n3 = this.rafs.length; Editor.open(); const n4 = this.rafs.length; Editor.close();
    return { first: n1 - n0, loopReq: n2 - n1, stoppedOnClose: n3 - n2, second: n4 - n3 };`);
  ok('the first open requests a frame and the loop keeps requesting while active', out.first === 1 && out.loopReq === 1, JSON.stringify(out));
  ok('close stops the loop', out.stoppedOnClose === 0, JSON.stringify(out));
  ok('the second open requests a frame again (was: 0, a blank editor)', out.second === 1, JSON.stringify(out));
}

// ============================================================================
// 9. effects per sim frame, not per drawn frame
// ============================================================================
{
  const out = R(ctx, `FX.decals.length = 0; FX.decal({ kind: 'scorch', x: 0, y: 0, r: 1, max: 9999 }); G.frame = 48;
    FX.update(0.016); FX.update(0.016); FX.update(0.016); const aged = FX.decals[0].t;
    const e = { kind: 'rocket' }; const a = FX.once(e), b = FX.once(e); G.frame = 49; const c = FX.once(e);
    return { aged, a, b, c };`);
  ok('a decal drawn three times in one sim frame ages once (was 72 for 24)', out.aged === 24, String(out.aged));
  ok('FX.once() admits an effect once per sim frame', out.a === true && out.b === false && out.c === true, JSON.stringify(out));
  const fx = src('fx');
  const rocket = fx.slice(fx.indexOf("case 'rocket': { const [x, y]"), fx.indexOf("case 'rocket': { const [x, y]") + 400);
  ok('the rocket trail spawns through the once() gate with keys p() reads (size/col/kind, not r/c/g)', /this\.once\(e\)\) this\.p\(\{[^}]*kind: 'smoke'/.test(rocket) && !/c: 'rgba\(150/.test(rocket), rocket.slice(0, 160));
  ok('every spawn inside drawEffect is gated (flame, bigboom, nuke, missile, rocket)', (fx.match(/this\.once\(e\)/g) || []).length >= 5, String((fx.match(/this\.once\(e\)/g) || []).length));
}

// ============================================================================
// 10. the manual scrolls with the wheel
// ============================================================================
{
  const out = R(ctx, `Codex.open = true; Codex.wheels = []; const h = this.listeners.wheel || []; for (const fn of h) fn({ preventDefault() {}, clientX: 10, clientY: 10, deltaY: 120 }); const r = { handlers: h.length, wheels: Codex.wheels.slice() }; Codex.open = false; return r;`);
  ok('the canvas wheel handler exists (negative control for the harness)', out.handlers >= 1, JSON.stringify(out));
  ok('with the manual open the wheel reaches Codex.wheel (was: returned before calling it)', out.wheels.length === out.handlers && out.wheels[0] === 120, JSON.stringify(out));
}

// ============================================================================
// 11. static: the clamp, the palette, the help text, and the dead code
// ============================================================================
{
  const terrain = src('terrain'), hud = src('hud'), ui = src('ui'), render = src('render'), sb = src('sprites_buildings');
  ok('the chunk clamp uses the map height for the y axis (was the width on both)', /maxCy = Math\.ceil\(G\.map\.h/.test(terrain) && /Math\.min\(maxCy - 1, y1\)/.test(terrain));
  ok('buildMini reads the tileset palette rather than five badlands browns', /buildMini\(\) \{[\s\S]{0,600}this\.pal/.test(terrain) && !/\[118, 96, 62\]/.test(terrain));
  ok('the help text no longer promises F2-F8 as camera slots', !/F2-F8/.test(hud) && /F8 load autosave/.test(hud));
  ok('dead: the \'waiting\' menu nothing set, the interceptor projectile colour nothing pushed, a stray path before a save()', !/menu === 'waiting'/.test(ui) && !/p\.kind === 'interceptor'/.test(render) && !/roundRect\(-6, -7, 20, 14, 2\); ctx\.save/.test(sb));
}

// ============================================================================
// 12. the fog shows what you last saw, not what is there (REVIEW-M17 decision 10)
// ============================================================================
// G.rememberSeen has kept the memory since M11; the renderer drew live enemy buildings on explored
// ground instead, so a building destroyed while you were not watching vanished at once. Render.remembered
// turns the memory into ghosts for tiles you have explored but cannot see; live enemy buildings are
// drawn only where you can see right now. Negative control: with the memory pass removed, the destroyed
// building draws nowhere.
{
  const out = R(ctx, `
    G.init({ players: [{ race: 'T', human: true, name: 'H' }, { race: 'T', human: false, difficulty: 'easy', name: 'C' }], seed: 3, layout: 'temple' }); G.human = 0; G.players[1].ai = null; UI.viewAll = false;
    const hp = G.players[0], foe = G.players[1];
    // an enemy building far from both bases, and a Marine standing next to it
    const def = DATA.buildings.supply_depot; let bld = null;   // a Terran building: no creep needed at the map centre
    const cx = Math.floor(G.map.w / 2), cy = Math.floor(G.map.h / 2);
    for (let r = 0; r < 40 && !bld; r++) for (let k = 0; k < 16 && !bld; k++) { const a = k / 16 * Math.PI * 2; const tx = Math.round(cx + Math.cos(a) * r), ty = Math.round(cy + Math.sin(a) * r); let free = true; for (let yy = 0; yy < def.h && free; yy++) for (let xx = 0; xx < def.w; xx++) if (!G.map.walkable(tx + xx, ty + yy)) { free = false; break; } if (free) { bld = G.placeBuilding(def, tx, ty, 1);   /* placed directly: canPlace refuses unexplored ground (FIXLIST-M14 C1), and nobody has explored the centre */ if (bld) { bld.done = true; bld.hp = bld.maxHp; bld.progress = def.time; G.completeBuilding(bld); } } }
    if (!bld) return { noBuilding: true };
    const marine = G.spawnUnit('marine', 0, bld.x + 3 * TILE, bld.y);
    for (let i = 0; i < 6; i++) G.tick();                       // vision and memory update every third frame
    const mem = hp.seen && hp.seen.get(bld.id);
    const m = G.map, vis = hp.vis;
    const seen = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inb(tx, ty) && vis[ty * m.w + tx] > 0; };
    const visNow = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inb(tx, ty) && vis[ty * m.w + tx] === 2; };
    const inView = () => true;
    const whileVisible = typeof Render.remembered === 'function' ? Render.remembered(seen, visNow, inView).length : 'no such method';
    // the Marine leaves, the tile falls back to explored, and the building is destroyed while nobody watches
    G.kill(marine, null, true); for (let i = 0; i < 6; i++) G.tick();
    const nowVisible = visNow(bld.x, bld.y), explored = seen(bld.x, bld.y);
    G.kill(bld, null, true); for (let i = 0; i < 6; i++) G.tick();
    const ghosts = typeof Render.remembered === 'function' ? Render.remembered(seen, visNow, inView) : [];
    const g = ghosts[0];
    return { remembered: !!mem, memHp: mem && mem.hp, whileVisible, nowVisible, explored, buildingAlive: bld.alive, ghosts: ghosts.length, ghostDef: g && g.def.id, ghostAt: g && [g.tx, g.ty], realAt: [bld.tx, bld.ty], ghostAlpha: g && g._alpha, ghostIsProxy: !!g && Object.getPrototypeOf(g) === bld, unitUntouched: bld.alive === false && bld._alpha !== 0.75 };`);
  ok('the scene stands: the building was remembered with its hp while a Marine could see it', !out.noBuilding && out.remembered && out.memHp > 0, JSON.stringify(out));
  ok('while the tile is visible nothing is drawn from memory (the live building is drawn instead)', out.whileVisible === 0, JSON.stringify(out.whileVisible));
  ok('after the Marine is gone the tile is explored but not visible, and the building is dead', out.nowVisible === false && out.explored === true && out.buildingAlive === false, JSON.stringify(out));
  ok('the fog draws a ghost of the destroyed building at its remembered footprint, at fog alpha (was: nothing -- it vanished the moment it died)', out.ghosts === 1 && out.ghostDef === 'supply_depot' && out.ghostAt && out.ghostAt[0] === out.realAt[0] && out.ghostAt[1] === out.realAt[1] && out.ghostAlpha === 0.75, JSON.stringify(out));
  ok('the ghost is a proxy over the real unit and writes nothing to it', out.ghostIsProxy === true && out.unitUntouched === true, JSON.stringify({ proxy: out.ghostIsProxy, untouched: out.unitUntouched }));
  const render = src('render');
  ok('a live enemy building is drawn only where it is visible right now (the memory pass owns the fog)', /else canSee = visNow\(x, y\); if \(!canSee\) continue;/.test(render) && !/else if \(u\.isBuilding\) canSee = seen\(x, y\)/.test(render));
  ok('...and the draw list takes the memory pass (the wiring; the method itself is exercised above)', /for \(const g of this\.remembered\(seen, visNow, inView\)\) list\.push\(g\);/.test(render));
}

ok('no JS errors', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
