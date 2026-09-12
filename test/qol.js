// M12 wave one: the quality-of-life layer.
//
// Nine items, and the reason they are tested together is that they share one failure mode: every one
// of them is a convenience, so when one breaks the game still works and nobody notices. A selection
// cap that silently comes back, a worker that stops auto-mining, an autocast that fires when it should
// not -- none of those throw, none of them fail an existing test, and all of them are things a player
// feels rather than reports.
//   node test/qol.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const divs = {};
const div = id => (divs[id] = divs[id] || { id, style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] });
const calls = [];
const mkCtx = () => new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 1280, height: 720 };
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() { } });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (typeof k === 'symbol') return undefined;
    return (...a) => { calls.push({ op: k, a }); };
  },
  set(t, k, v) { calls.push({ op: '=' + String(k), a: [v] }); return true; },
});
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { },
  localStorage: { getItem() { return null; }, setItem() { } },
  document: { getElementById: div, createElement: () => ({ width: 0, height: 0, style: {}, addEventListener() { }, getContext: mkCtx }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' },
  __calls: calls, __mkCtx: mkCtx };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'sprites_units', 'sprites_buildings', 'sprites', 'atlas', 'fx', 'terrain', 'render', 'ui', 'hud']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

const r = vm.runInContext(`(() => {
  const out = {};
  const start = () => G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 5, layout: 'temple' });
  const P = () => G.players[G.human];

  // ---- 2. unlimited selection ----
  start(); UI.mode = 'play'; G.human = 0;
  const many = [];
  for (let i = 0; i < 40; i++) many.push(G.spawnUnit('marine', 0, P().startX + 60 + (i % 8) * 22, P().startY + 60 + Math.floor(i / 8) * 22));
  UI.select(many.slice());
  out.sel40 = UI.selection.length;
  const huge = many.slice(); for (let i = 0; i < 90; i++) huge.push(G.spawnUnit('marine', 0, P().startX + 200 + (i % 10) * 20, P().startY + 200 + Math.floor(i / 10) * 20));
  UI.select(huge.slice());
  out.sel130 = UI.selection.length;
  // control groups take the whole selection too
  UI.groups['1'] = UI.selection.slice();
  out.group = UI.groups['1'].length;
  // and the console can draw any of it without throwing
  Render.ctx = __mkCtx(); Render.W = 1280; Render.H = 720; Render.dpr = 1;
  let threw = null;
  try { __calls.length = 0; UI.drawSelGrid(Render.ctx, UI.selection, 300, 500, 700, 200); } catch (e) { threw = String(e && e.message || e); }
  out.gridDrew = { threw, calls: __calls.length, hotspots: UI.hotspots ? UI.hotspots.length : -1 };
  // REVIEW-M17 task 1: the strip through the console's OWN draw (hud.js replaces UI.drawConsole at load and
  // its branch never called drawSelGrid). Forty units, and every tile's hotspot has to lie on the console
  // band: the old branch capped itself at six columns of 58 px rows, so unit nineteen and everything
  // after it was drawn below the bottom of the screen -- measured in the browser, eighteen on the plate
  // and twenty-two off it, with nothing saying so.
  UI.select(many.slice()); UI.hotspots = []; __calls.length = 0; let threw40 = null;
  try { UI.drawConsole(); } catch (e) { threw40 = String(e && e.message || e); }
  const band = Render.H - UI.consoleH;
  out.strip40 = { threw: threw40, sel: UI.selection.length, hotspots: UI.hotspots.length, onPlate: UI.hotspots.filter(h => h.y >= band && h.y + h.h <= Render.H).length, offScreen: UI.hotspots.filter(h => h.y + h.h > Render.H).length };
  // ...and again in the NARROWEST window the doubled HUD has to work in. Measured in the page: at
  // 1024x768 the unit panel is only 155 console units wide, because the minimap and the card either side
  // of it doubled, and the shrink loop gave up at a 22-CONSOLE-unit tile -- a 36 px one on screen --
  // leaving ten of the forty in a "+10 more". The floor is 22 SCREEN pixels now, so all forty fit and
  // none of them is smaller than the smallest tile the game drew before the HUD was scaled at all.
  Render.W = 1024; Render.H = 768;
  UI.select(many.slice()); UI.hotspots = []; let threwN = null;
  try { UI.drawConsole(); } catch (e) { threwN = String(e && e.message || e); }
  const bandN = Render.H - UI.consoleH;
  out.strip40narrow = { threw: threwN, k: +UI.hudK.toFixed(3), hotspots: UI.hotspots.length,
    onPlate: UI.hotspots.filter(h => h.y >= bandN && h.y + h.h <= Render.H).length,
    offScreen: UI.hotspots.filter(h => h.y + h.h > Render.H).length,
    tileW: UI.hotspots.length ? Math.round(UI.hotspots[0].w) : 0 };
  Render.W = 1280; Render.H = 720;

  // ---- 2b. THE HUD'S SCALE (TODO-M18 item 5) ----
  // MEASURED FIRST, in the page (.claude/review/hud-measure.js): the band was clamp(Render.H * 0.26,
  // 140, 196) and above a 754 px window the CEILING decided it, so 1366x768 and 3840x2160 both got 196
  // px and the HUD read 25.5% of one screen and 9.1% of the other. HUD_SCALE doubles it; HUD_MAX_FRAC
  // stops it eating a short window. These are the numbers, not a shape -- a check that only asserted
  // "bigger than before" would pass on a scale of 1.01.
  out.hudScale = {};
  for (const wh of [[1280, 720], [1920, 1080], [2560, 1440], [800, 400], [800, 320]]) {   // 400: HUD_MAX_FRAC's own case at 1.4; 320: where it bites below the 140 floor, so the band cannot grow at all
    Render.W = wh[0]; Render.H = wh[1];
    out.hudScale[wh[0] + 'x' + wh[1]] = { base: UI.consoleBase, ch: UI.consoleH, k: +UI.hudK.toFixed(3), frac: +(UI.consoleH / wh[1]).toFixed(3), mini: Math.round(UI.miniRect().s), btn: Math.round(UI.cardRect().bw) };
  }
  Render.W = 1280; Render.H = 720;

  // Every card button's click box is in SCREEN pixels while the card is DRAWN in console units, so a
  // missing conversion lands each click on a different button or on nothing at all. Pressing the centre
  // of every slot in turn has to press exactly those buttons, in that order.
  start(); G.human = 0; UI.mode = 'play';
  Render.ctx = __mkCtx(); Render.W = 1280; Render.H = 720; Render.dpr = 1;
  const cc3 = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  UI.select([cc3]); UI.hotspots = []; UI.drawConsole();
  const cr3 = UI.cardRect(), card3 = UI.currentCard(), pressed = [];
  const savedPress = UI.press; UI.press = b => { pressed.push(b.label); };
  for (const b of card3) {
    const bx = cr3.x + cr3.pad + (b.slot % UI.CARD_COLS) * (cr3.bw + cr3.gap);
    const by = cr3.y + cr3.pad + Math.floor(b.slot / UI.CARD_COLS) * (cr3.bh + cr3.gap);
    UI.consoleClick(bx + cr3.bw / 2, by + cr3.bh / 2, 0);
  }
  UI.press = savedPress;
  out.cardClicks = { n: card3.length, pressed: pressed.length, same: card3.length > 0 && pressed.join(',') === card3.map(b => b.label).join(','),
    onBand: cr3.y >= Render.H - UI.consoleH && cr3.y + cr3.h <= Render.H + 1, k: +UI.hudK.toFixed(3) };

  // The minimap hit test is in screen pixels too: its own rect's centre must be inside it, and a point
  // just above the band must not be.
  const mr3 = UI.miniRect();
  out.miniHit = { inside: UI.inMinimap(mr3.x + mr3.s / 2, mr3.y + mr3.s / 2), above: UI.inMinimap(mr3.x + mr3.s / 2, Render.H - UI.consoleH - 20),
    onBand: mr3.y >= Render.H - UI.consoleH && mr3.y + mr3.s <= Render.H };

  // Icons are rasterised at the size they are DRAWN at, not at the console-unit size: a 32 px icon
  // stretched to 52 is soft, and a doubled HUD exists to be legible. Sprites caches by size, so this is
  // one extra render per size and not per frame.
  const askedI = [], askedT = [];
  const realIcon = Sprites.icon.bind(Sprites), realTint = Sprites.tinted.bind(Sprites);
  Sprites.icon = (id, col, sz) => { askedI.push(sz); return realIcon(id, col, sz); };
  Sprites.tinted = (id, col, sz, t) => { askedT.push(sz); return realTint(id, col, sz, t); };
  UI.select([cc3]); UI.drawConsole();
  const crC = UI.cardRectC(), ikC = Math.round(32 * crC.k);
  UI.select(many.slice()); UI.drawConsole();
  Sprites.icon = realIcon; Sprites.tinted = realTint;
  out.iconRaster = { ikConsole: ikC, wantIcon: Math.max(8, Math.round(ikC * UI.hudK)), gotIcon: [...new Set(askedI)].sort((a, b) => a - b),
    gotTint: [...new Set(askedT)].sort((a, b) => a - b), k: +UI.hudK.toFixed(3) };
  // ...and HUD.sprite on its own, at one viewport that scales and one that cannot, which is the claim
  // stated without any of the strip's own fit arithmetic in the way.
  { const spyI = [], spyT = [];
    Sprites.icon = (id, col, sz) => { spyI.push(sz); return realIcon(id, col, sz); };
    Sprites.tinted = (id, col, sz, t) => { spyT.push(sz); return realTint(id, col, sz, t); };
    Render.W = 1280; Render.H = 720; const kBig = UI.hudK;
    HUD.sprite(Render.ctx, 'marine', '#f40404', 30, 0, 0); HUD.sprite(Render.ctx, 'marine', '#f40404', 30, 0, 0, 'rgba(60,230,60,0.8)');
    Render.W = 800; Render.H = 320; const kOne = UI.hudK;
    HUD.sprite(Render.ctx, 'marine', '#f40404', 30, 0, 0); HUD.sprite(Render.ctx, 'marine', '#f40404', 30, 0, 0, 'rgba(60,230,60,0.8)');
    Sprites.icon = realIcon; Sprites.tinted = realTint; Render.W = 1280; Render.H = 720;
    out.spriteRaster = { dest: 30, kBig: +kBig.toFixed(3), kOne, icon: spyI, tint: spyT }; }

  // ---- 2c. UNEXPLORED GROUND IS BLACK ON THE MINIMAP (seventh session) ----
  // The fog bitmap is alpha 255 for never-seen ground; the minimap blitted it at 0.85, so fifteen percent of
  // the terrain of every unexplored base showed through. Read the alpha in force at the moment the fog
  // bitmap is drawn onto the minimap rectangle.
  {
    start(); G.human = 0; UI.mode = 'play';
    Render.ctx = __mkCtx(); Render.W = 1280; Render.H = 720; Render.dpr = 1;
    Render.fogCanvas = { width: G.map.w, height: G.map.h, getContext: () => __mkCtx() };
    UI.select([]); __calls.length = 0; UI.drawConsole();
    let alpha = 1, fogAlpha = null;
    for (const c of __calls) {
      if (c.op === '=globalAlpha') alpha = c.a[0];
      if (c.op === 'drawImage' && c.a[0] === Render.fogCanvas) { fogAlpha = alpha; break; }
    }
    out.minimapFog = { drawn: fogAlpha !== null, alpha: fogAlpha };
  }

  // ---- 2d. THE CURSOR IS THE BROWSER'S (seventh session: "the mouse feels a little bit laggy") ----
  // A cursor PAINTED on the canvas is at least one frame behind the pointer, and further whenever a frame is
  // slow; a CSS cursor is drawn by the browser from the pointer itself. The art is rendered into images once.
  {
    start(); G.human = 0; UI.mode = 'play';
    Render.ctx = __mkCtx(); Render.W = 1280; Render.H = 720; Render.dpr = 1;
    let writes = 0; const style = {}; let cur = '';
    Object.defineProperty(style, 'cursor', { get: () => cur, set: v => { writes++; cur = v; }, configurable: true });
    Render.canvas = { style };
    // images need a toDataURL the stub document does not have
    const realCreate = document.createElement;
    document.createElement = t => { const e = realCreate(t); e.toDataURL = () => 'data:image/png;base64,QUJD'; return e; };
    UI._cursorCSS = {}; UI._cursorShape = null;
    const own = G.spawnUnit('marine', 0, P().startX + 90, P().startY + 90);
    const foe = G.spawnUnit('marine', 1, P().startX + 190, P().startY + 90);
    const shapeAt = (mx, my, pending, hover) => { UI.mouse.x = mx; UI.mouse.y = my; UI.pending = pending; UI.hover = hover; return UI.cursorShape(); };
    out.cursor = {
      arrow: shapeAt(400, 300, null, null),
      orderMove: shapeAt(400, 300, { kind: 'move' }, null),
      orderAttack: shapeAt(400, 300, { kind: 'attack' }, null),
      orderOnEnemy: shapeAt(400, 300, { kind: 'move' }, foe),
      hoverOwn: shapeAt(400, 300, null, own),
      hoverEnemy: shapeAt(400, 300, null, foe),
      overConsole: shapeAt(400, Render.H - 10, { kind: 'attack' }, foe),
    };
    UI.pending = null; UI.hover = null; UI.mouse.x = 400; UI.mouse.y = 300;
    UI.syncCursor(); writes = 0; for (let i = 0; i < 10; i++) UI.syncCursor();   // the first call sets the shape; the next ten must write nothing
    out.cursor.writesForOneShape = writes; out.cursor.css = String(cur).slice(0, 40);
    UI.hover = foe; UI.syncCursor(); UI.syncCursor();
    out.cursor.writesAfterChange = writes; out.cursor.css2 = String(cur).slice(0, 40);
    // nothing is painted at the pointer: drive the pass that used to draw it and look for the pointer's coordinates
    UI.hover = null; UI.mouse.x = 777; UI.mouse.y = 333; UI.pending = { kind: 'attack' };
    __calls.length = 0; UI.drawMessages();
    out.cursor.paintedAtPointer = __calls.filter(c => (c.op === 'moveTo' || c.op === 'arc') && c.a[0] >= 770 && c.a[0] <= 800 && c.a[1] >= 320 && c.a[1] <= 360).length;
    UI.pending = null;
    document.createElement = realCreate;
  }

  // ---- 3. multi-building production goes to the shortest queue ----
  start(); G.human = 0;
  const bars = [];
  for (let i = 0; i < 3; i++) { const b = G.placeBuilding(DATA.buildings.barracks, 30 + i * 5, 30, 0); G.completeBuilding(b); bars.push(b); }
  P().minerals = 2000; P().gas = 2000; P().supMax = 200;
  UI.select(bars.slice());
  const card = UI.buildCard();
  const marineBtn = card.find(b => b.label === 'Marine');
  out.multiCard = { gotCard: !!marineBtn, n: card.length };
  if (marineBtn) for (let k = 0; k < 6; k++) marineBtn.fn();
  out.spread = bars.map(b => b.prod.length);

  // ---- 4. a new worker mines by itself ----
  start(); G.human = 0;
  const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  P().minerals = 500;
  const w0 = G.units.filter(u => u.alive && u.owner === 0 && u.def.worker).length;
  G.queueUnit(cc, 'scv');
  for (let i = 0; i < 700; i++) G.tick();
  const ws = G.units.filter(u => u.alive && u.owner === 0 && u.def.worker);
  out.autoMine = { before: w0, after: ws.length, working: ws.filter(u => u.order.type === 'gather' || u.order.type === 'return').length };
  // ...but an explicit rally still wins
  start(); G.human = 0;
  const cc2 = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  P().minerals = 500;
  G.setRally(cc2, cc2.x + 400, cc2.y + 400, null);
  const w1 = G.units.filter(u => u.alive && u.owner === 0 && u.def.worker).length;
  G.queueUnit(cc2, 'scv');
  for (let i = 0; i < 620; i++) G.tick();
  const ws2 = G.units.filter(u => u.alive && u.owner === 0 && u.def.worker);
  out.rallyWins = { made: ws2.length > w1, newestOrder: ws2.length ? ws2[ws2.length - 1].order.type : 'none' };

  // ---- 4b. A MINERAL LINE THAT RUNS OUT STOPS THE WORKERS ON IT (TODO-M18 item 6) ----
  // MEASURED first (.claude/review/worker-walk.js, Lost Ruins, twelve workers): with the main drained,
  // ALL TWELVE walked to the natural 31 tiles away and covered about 280 tiles each in ninety seconds,
  // carrying minerals back past a hall they had no reason to stand at, and not one of them went idle so
  // nothing on screen said the base was finished. StarCraft II stops them instead, and so does this now.
  start(); G.human = 0;
  {
    const p = P(), m = G.map;
    const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
    const baseIdx = res => m.bases.findIndex(b => b.minerals.includes(res));
    const home = m.bases.findIndex(b => b.minerals.length && Math.hypot(b.cx - hall.x, b.cy - hall.y) < 6 * TILE);
    const ws = () => G.units.filter(u => u.alive && u.owner === 0 && u.def.worker);
    for (const w of ws()) { const n = G.findNearestResource(w, 'mineral'); if (n) w.applyOrder({ type: 'gather', target: n, phase: 'goto' }); }
    for (let f = 0; f < 240; f++) G.tick();
    const mining = ws().filter(w => w.order.type === 'gather' || w.order.type === 'return').length;
    // ONE patch of the line runs out: the worker on it must move to another patch of the SAME line.
    const mine0 = m.bases[home].minerals;
    // Pick a worker and drain ITS patch, rather than draining patch 0 and hoping somebody was on it:
    // findNearestResource spreads the workers, so patch 0 is often nobody's.
    const onIt = ws().find(w => (w.order.target && mine0.includes(w.order.target)) || (w.order.then && mine0.includes(w.order.then)));
    const itsPatch = onIt ? (mine0.includes(onIt.order.target) ? onIt.order.target : onIt.order.then) : null;
    if (itsPatch) itsPatch.amount = 0;
    for (let f = 0; f < 400; f++) G.tick();
    const movedWithin = onIt ? { order: onIt.order.type, base: baseIdx(onIt.order.target || onIt.order.then), sameLine: mine0.includes(onIt.order.target || onIt.order.then), drained: !!itsPatch } : null;
    // ...now the WHOLE line runs out.
    for (const r of mine0) r.amount = 0;
    const pos = new Map(ws().map(w => [w.id, { x: w.x, y: w.y, walked: 0 }]));
    for (let f = 0; f < 24 * 90; f++) { G.tick(); for (const w of ws()) { const t = pos.get(w.id); if (!t) continue; t.walked += Math.hypot(w.x - t.x, w.y - t.y); t.x = w.x; t.y = w.y; } }
    const after = ws().map(w => ({ order: w.order.type, base: w.order.target ? baseIdx(w.order.target) : (w.order.then ? baseIdx(w.order.then) : -1), walked: Math.round((pos.get(w.id) || { walked: 0 }).walked / TILE) }));
    // ...and an explicit order to another base's patch is still obeyed, which is the whole of "unless you
    // command them". Without this the check above would pass just as well with gathering deleted.
    const far = m.bases[home === 0 ? 1 : 0].minerals.find(r => r.amount > 0);
    const one = ws()[0];
    if (far && one) one.applyOrder({ type: 'gather', target: far, phase: 'goto' });
    for (let f = 0; f < 24 * 60; f++) G.tick();
    out.dryLine = {
      minedBefore: mining, workers: after.length,
      movedWithinLine: movedWithin,
      idleAfter: after.filter(a => a.order === 'idle').length,
      wentElsewhere: after.filter(a => a.base >= 0 && a.base !== home).length,
      maxWalk: Math.max(0, ...after.map(a => a.walked)),
      orderedAway: one ? { order: one.order.type, base: one.order.target ? baseIdx(one.order.target) : (one.order.then ? baseIdx(one.order.then) : -1) } : null,
      homeBase: home,
    };
  }
  // ...and the COMPUTER still re-tasks its own idle workers, which is the deliberate move to a new base
  // this rule must not take away (AI.economy picks up anything idle and not carrying).
  start(); G.human = 0;
  {
    const p = G.players[1]; p.ai = p.ai || new AI(p, 'normal');
    const m = G.map;
    const hall = G.units.find(u => u.alive && u.owner === 1 && u.def.depot);
    const home = m.bases.findIndex(b => b.minerals.length && Math.hypot(b.cx - hall.x, b.cy - hall.y) < 6 * TILE);
    for (const r of m.bases[home].minerals) r.amount = 0;
    for (let f = 0; f < 24 * 60; f++) G.tick();
    const aiw = G.units.filter(u => u.alive && u.owner === 1 && u.def.worker);
    out.aiRetasks = { workers: aiw.length, mining: aiw.filter(w => w.order.type === 'gather' || w.order.type === 'return').length };
  }

  // ---- 4c. A BUILDER THAT FINISHES STAYS WHERE IT IS (seventh session) ----
  // Measured before the fix: a Terran SCV came off every construction and walked about ten tiles back to the
  // patch it had last mined -- even one that had been idle before it was told to build, and even from the
  // Refinery it had just made. A Probe never did. Each case is driven through setOrder, the way the UI does.
  {
    const scene = (race, mode, id) => {
      start(); G.human = 0;
      const p = P(); p.minerals = 5000; p.gas = 5000;
      for (const pl of G.players) if (pl.id !== 0) pl.ai = null;
      const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
      for (let f = 0; f < 240; f++) G.tick();
      const wd = race === 'T' ? 'scv' : 'probe';
      let w = G.units.find(u => u.alive && u.owner === 0 && u.def.id === wd && (u.order.type === 'gather' || u.order.type === 'return'));
      if (!w) { w = G.spawnUnit(wd, 0, hall.x + 60, hall.y + 80); const n = G.findNearestResource(w, 'mineral'); w.applyOrder({ type: 'gather', target: n, phase: 'goto' }); for (let f = 0; f < 400; f++) G.tick(); }
      if (mode === 'idle') { w.stop(); for (let f = 0; f < 24; f++) G.tick(); }
      const def = DATA.buildings[id];
      let tx, ty;
      if (def.onGeyser) { const g = G.map.resources.find(res => res.type === 'geyser' && Math.hypot(res.cx - hall.x, res.cy - hall.y) < 12 * TILE); tx = g.x; ty = g.y; }
      else { const t = G.map.findFreeTile(Math.floor(hall.x / TILE) + 6, Math.floor(hall.y / TILE) + 6, 12, (x, y) => !G.map.canPlace(def, x, y, p, G.units, null)); tx = t[0]; ty = t[1]; }
      w.setOrder({ type: 'build', def, tx, ty });
      let done = false;
      for (let f = 0; f < 24 * 90 && !done; f++) { G.tick(); const b = G.units.find(u => u.alive && u.owner === 0 && u.def === def && u.tx === tx && u.ty === ty); done = !!(b && b.done); }
      const at = { x: w.x, y: w.y };
      for (let f = 0; f < 24 * 15; f++) G.tick();
      return { done, order: w.order.type, moved: +(Math.hypot(w.x - at.x, w.y - at.y) / TILE).toFixed(1) };
    };
    out.builderStays = { scvMining: scene('T', 'mining', 'supply_depot'), scvIdle: scene('T', 'idle', 'supply_depot'), scvGas: scene('T', 'mining', 'refinery'), probe: scene('P', 'mining', 'pylon') };
    // ...and what it WAS told still happens: two depots shift-queued on one SCV are both built
    start(); G.human = 0;
    { const p = P(); p.minerals = 5000; for (const pl of G.players) if (pl.id !== 0) pl.ai = null;
      const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
      const def = DATA.buildings.supply_depot;
      const w = G.spawnUnit('scv', 0, hall.x + 60, hall.y + 90);
      const a = G.map.findFreeTile(Math.floor(hall.x / TILE) + 6, Math.floor(hall.y / TILE) + 6, 12, (x, y) => !G.map.canPlace(def, x, y, p, G.units, null));
      w.setOrder({ type: 'build', def, tx: a[0], ty: a[1] });
      const b2 = G.map.findFreeTile(a[0] + 4, a[1], 12, (x, y) => (Math.abs(x - a[0]) > 2 || Math.abs(y - a[1]) > 2) && !G.map.canPlace(def, x, y, p, G.units, null));
      w.setOrder({ type: 'build', def, tx: b2[0], ty: b2[1] }, true);
      for (let f = 0; f < 24 * 120; f++) G.tick();
      out.builderStays.queuedTwo = G.units.filter(u => u.alive && u.owner === 0 && u.def === def && u.done).length; }
  }

  // ---- 4d. A SELECTED WORKER STAYS SELECTED INSIDE A REFINERY (seventh session, item 6) ----
  {
    start(); G.human = 0; UI.mode = 'play';
    for (const pl of G.players) if (pl.id !== 0) pl.ai = null;
    const p = P(); p.minerals = 5000; p.gas = 5000; p.vis.fill(2);
    const hall = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
    const g = G.map.resources.find(res => res.type === 'geyser' && Math.hypot(res.cx - hall.x, res.cy - hall.y) < 12 * TILE);
    const ref = G.placeBuilding(DATA.buildings.refinery, g.x, g.y, 0); G.completeBuilding(ref);
    // the per-frame prune; before it was extracted it was this inline filter in UI.loop, which is kept as the fallback so the check reads red (not a crash) against the old code
    const prune = () => UI.pruneSelection ? UI.pruneSelection() : (UI.selection = UI.selection.filter(u => u.alive && !u.inside));
    const w = G.spawnUnit('scv', 0, ref.x + 40, ref.y + 60);
    UI.select([w]);
    w.setOrder({ type: 'gather', target: ref, phase: 'goto' });
    let wentIn = false, keptWhileIn = true, framesIn = 0;
    for (let f = 0; f < 24 * 20 && !(wentIn && framesIn > 10); f++) {
      G.tick(); prune();
      if (w.inside) { wentIn = true; framesIn++; if (!UI.selection.includes(w)) keptWhileIn = false; }
    }
    // the unit panel says what it is doing while it is out of sight
    Render.ctx = __mkCtx(); Render.W = 1280; Render.H = 720; Render.dpr = 1; __calls.length = 0;
    const insideNow = !!w.inside;
    UI.drawConsole();
    const said = __calls.filter(c => c.op === 'fillText').map(c => String(c.a[0])).join(' | ');
    // ...and it can be ordered out: a move sends it out of the Refinery and on its way
    const x0 = w.x;
    w.setOrder({ type: 'move', x: ref.x + 400, y: ref.y });
    for (let f = 0; f < 96; f++) { G.tick(); prune(); }
    // CONTROL: a Marine loaded into a Bunker is cargo, and leaves the selection as it always did
    const bunker = G.placeBuilding(DATA.buildings.bunker, Math.floor(hall.x / TILE) + 8, Math.floor(hall.y / TILE) + 6, 0); G.completeBuilding(bunker);
    const m = G.spawnUnit('marine', 0, bunker.x + 40, bunker.y + 40);
    UI.select([m]); G.loadUnit(bunker, m); prune();
    out.gasSelect = { wentIn, keptWhileIn, framesIn, insideWhenDrawn: insideNow, panelSaysGas: /Harvesting gas/.test(said),
      orderedOut: !w.inside && Math.abs(w.x - x0) > 20,
      bunkerCargoDropped: !!m.inside && !UI.selection.includes(m) };
  }

  // ---- 5. smart casting: the RIGHT caster, not the first one ----
  // The naive reading of this feature is "one press, one cast", and that was already true: the ability
  // branch in execPending returns after the first unit for point and unit abilities alike. What was NOT
  // true is that it picked a sensible caster -- it took whatever happened to be first in the selection,
  // even with no energy and standing furthest away. So that is what this measures.
  start(); G.human = 0;
  const hts = [];
  for (let i = 0; i < 6; i++) { const h = G.spawnUnit('high_templar', 0, P().startX + 500 - i * 70, P().startY + 80); h.energy = 0; hts.push(h); }
  hts[4].energy = 200;                       // the only one that can pay, and it is not first in the list
  P().tech.add('psi_storm_tech');
  const foe = G.spawnUnit('marine', 1, P().startX + 120, P().startY + 80);
  G.players[0].vis.fill(2);
  UI.select(hts.slice());
  UI.pending = { kind: 'ability', abil: 'psi_storm' };
  UI.execPending(foe, foe.x, foe.y, false);
  const casters = hts.map((h, i) => (h.order && h.order.type === 'ability') ? i : -1).filter(i => i >= 0);
  out.smart = { casters, wanted: 4, energies: hts.map(h => h.energy) };

  // ---- 6. autocast ----
  start(); G.human = 0;
  const med = G.spawnUnit('medic', 0, P().startX + 100, P().startY + 100);
  out.armDefaultsOff = !(med.armed && med.armed.size);
  out.armed = G.setAutocast([med], 'heal');
  out.armedNow = !!(med.armed && med.armed.has('heal'));
  out.disarmed = G.setAutocast([med], 'heal');
  out.armedAfter = !!(med.armed && med.armed.has('heal'));
  // nothing that consumes a unit may ever be autocastable
  const forbidden = ['infest', 'nuke', 'consume', 'lurker_aspect', 'guardian_aspect', 'devourer_aspect', 'summon_archon', 'summon_dark_archon'];
  out.noUnitCostAutocast = forbidden.filter(id => DATA.abilities[id] && DATA.abilities[id].autocast);
  out.autocastSet = Object.keys(DATA.abilities).filter(k => DATA.abilities[k].autocast);
  // refuses to arm something not flagged
  out.refuses = G.setAutocast([med], 'psi_storm');

  // ---- 9. signals ----
  start(); G.human = 0;
  G.signals = [];
  G.signal(0, 'ping', 500, 600, null);
  G.signal(0, 'draw', 100, 100, [100, 100, 140, 130, 190, 150]);
  out.signals = G.signals.map(s => s.kind);
  const h0 = G.stateHash();
  G.signal(0, 'ping', 900, 900, null);
  out.hashUnchanged = G.stateHash() === h0;
  const before = G.signals.length;
  for (let i = 0; i < 200; i++) G.tick();
  out.expired = G.signals.length < before;
  // spam is bounded
  for (let i = 0; i < 400; i++) G.signal(0, 'ping', i, i, null);
  out.bounded = G.signals.length <= 80;
  return out;
})()`, ctx);

ok(r.sel40 === 40, 'a selection of 40 stays 40 -- the twelve-cap is gone', String(r.sel40));
ok(r.sel130 === 130, '...and so does one of 130', String(r.sel130));
ok(r.group === 130, 'a control group holds the whole selection too', String(r.group));
ok(!r.gridDrew.threw && r.gridDrew.calls > 0, 'the console draws 130 units without throwing', JSON.stringify(r.gridDrew));
ok(r.gridDrew.hotspots > 0, '...and every tile it draws is clickable', JSON.stringify(r.gridDrew));
ok(!r.strip40.threw && r.strip40.sel === 40 && r.strip40.hotspots === 40 && r.strip40.onPlate === 40, 'forty units through the console itself: forty tiles, every one on the console band (REVIEW-M17 task 1: the HUD drew eighteen and put the rest below the screen)', JSON.stringify(r.strip40));
ok(r.strip40.offScreen === 0, '...and none of them below the bottom of the screen', JSON.stringify(r.strip40));
ok(r.builderStays.scvMining.done && r.builderStays.scvMining.order === 'idle' && r.builderStays.scvMining.moved === 0,
  'A TERRAN SCV THAT FINISHES A BUILDING STAYS WHERE IT IS (it walked about ten tiles back to the patch it had last mined)', JSON.stringify(r.builderStays.scvMining));
ok(r.builderStays.scvIdle.done && r.builderStays.scvIdle.order === 'idle' && r.builderStays.scvIdle.moved === 0,
  '...including one that was idle before it was told to build (it went back to a patch it had mined minutes earlier)', JSON.stringify(r.builderStays.scvIdle));
ok(r.builderStays.scvGas.done && r.builderStays.scvGas.order === 'idle' && r.builderStays.scvGas.moved === 0,
  '...and one that built a Refinery (it walked away from its own gas, back to the minerals)', JSON.stringify(r.builderStays.scvGas));
ok(r.builderStays.probe.done && r.builderStays.probe.order === 'idle' && r.builderStays.probe.moved === 0,
  'a Protoss Probe stays where it is, as it always did (the CONTROL: Probes never passed through the Terran construction path)', JSON.stringify(r.builderStays.probe));
ok(r.builderStays.queuedTwo === 2,
  'what a builder WAS told still happens: two depots shift-queued on one SCV are both built', String(r.builderStays.queuedTwo));
ok(r.gasSelect.wentIn && r.gasSelect.framesIn > 10 && r.gasSelect.keptWhileIn,
  'A SELECTED WORKER STAYS SELECTED WHILE IT IS INSIDE A REFINERY HARVESTING GAS (the selection dropped anything inside anything, every frame)', JSON.stringify(r.gasSelect));
ok(r.gasSelect.insideWhenDrawn && r.gasSelect.panelSaysGas,
  '...and the unit panel shows it as "Harvesting gas" while it is out of sight -- a line that existed and could never be seen', JSON.stringify(r.gasSelect));
ok(r.gasSelect.orderedOut,
  '...and an order brings it out of the Refinery and on its way, so keeping it selected cannot strand it inside', JSON.stringify(r.gasSelect));
ok(r.gasSelect.bunkerCargoDropped,
  'CONTROL: a Marine loaded into a Bunker is cargo and still leaves the selection, as in both StarCraft games', JSON.stringify(r.gasSelect));
ok(r.cursor.arrow === 'arrow' && r.cursor.orderMove === 'order-ally' && r.cursor.orderAttack === 'order-enemy' && r.cursor.orderOnEnemy === 'order-enemy'
  && r.cursor.hoverOwn === 'hover-own' && r.cursor.hoverEnemy === 'hover-enemy' && r.cursor.overConsole === 'arrow',
  'the cursor picks the same five shapes the painted one drew -- arrow, green or red order reticle, own or enemy brackets -- and the plain arrow over the console', JSON.stringify(r.cursor));
ok(/url\(/.test(r.cursor.css) && r.cursor.writesForOneShape === 0 && r.cursor.writesAfterChange > 0 && /url\(/.test(r.cursor.css2),
  'THE CURSOR IS A CSS CURSOR wearing that art, and the style is written only when the shape changes (nothing at all for ten frames of the same shape)', JSON.stringify(r.cursor));
ok(r.cursor.paintedAtPointer === 0,
  '...and NOTHING is painted at the pointer any more: a cursor painted onto the canvas is at least a frame behind the hand, which is the lag the user felt', String(r.cursor.paintedAtPointer));
ok(r.minimapFog.drawn && r.minimapFog.alpha === 1,
  'the minimap blits the fog OPAQUE, so never-seen ground is black rather than fifteen percent terrain (it was drawn at 0.85: every unexplored base was readable off the minimap)', JSON.stringify(r.minimapFog));
ok(!r.strip40narrow.threw && r.strip40narrow.hotspots === 40 && r.strip40narrow.onPlate === 40 && r.strip40narrow.offScreen === 0 && r.strip40narrow.tileW >= 22,
  'forty of them still fit in the NARROWEST window the doubled HUD has to work in (1024x768), at a tile no smaller than the smallest the game drew before it was scaled at all -- the shrink floor is 22 SCREEN pixels, not 22 console units (TODO-M18 item 5; measured as ten lost to "+10 more")', JSON.stringify(r.strip40narrow));

ok(r.hudScale['1920x1080'].ch === 274 && r.hudScale['1920x1080'].k === 1.398 && r.hudScale['2560x1440'].ch === 274 && r.hudScale['2560x1440'].k === 1.398,
  'the console band is 1.4 times its old size where there is room: 196 -> 274 px at 1080p and at 1440p (TODO-M18 item 5 doubled it; the user played that and asked for about 30% less)', JSON.stringify(r.hudScale));
ok(r.hudScale['1920x1080'].mini === 243 && r.hudScale['1920x1080'].btn === 74,
  '...and everything on it scales with it, because it all derives from the band: the minimap 174 -> 243 and the card button 53 -> 74', JSON.stringify(r.hudScale['1920x1080']));
ok(r.hudScale['800x400'].frac <= 0.42 && r.hudScale['800x400'].k > 1 && r.hudScale['800x400'].k < 1.4,
  'a short window gets as much of the growth as fits and no more: 400 px tall takes 42% of the height at k 1.2, not 49% at k 1.4', JSON.stringify(r.hudScale['800x400']));
ok(r.hudScale['800x320'].k === 1 && r.hudScale['800x320'].ch === r.hudScale['800x320'].base && r.hudScale['800x320'].ch === 140,
  'a window too short even for the unscaled console behaves exactly as it did before -- hudK never goes below 1, so nothing is drawn off the plate', JSON.stringify(r.hudScale['800x320']));
ok(r.cardClicks.same && r.cardClicks.n > 0 && r.cardClicks.onBand && r.cardClicks.k !== 1,
  'the command card is drawn in console units and clicked in screen pixels: pressing the centre of every slot presses exactly those buttons, in order (' + r.cardClicks.n + ' of them, at scale ' + r.cardClicks.k + ')', JSON.stringify(r.cardClicks));
ok(r.miniHit.inside && !r.miniHit.above && r.miniHit.onBand,
  'the minimap hit test scales with the minimap: its own centre is inside it and a point above the band is not', JSON.stringify(r.miniHit));
ok(r.iconRaster.gotIcon.includes(r.iconRaster.wantIcon) && !r.iconRaster.gotIcon.includes(r.iconRaster.ikConsole),
  'a card icon is rasterised at the size it is DRAWN at (' + r.iconRaster.wantIcon + ' px, not the console-unit ' + r.iconRaster.ikConsole + '), so a doubled HUD is sharp rather than a stretched small one', JSON.stringify(r.iconRaster));
ok(r.spriteRaster.icon[0] === Math.round(30 * r.spriteRaster.kBig) && r.spriteRaster.icon[0] > 30 && r.spriteRaster.tint[0] === r.spriteRaster.icon[0] && r.spriteRaster.icon[1] === 30 && r.spriteRaster.tint[1] === 30,
  '...and the rule behind it, stated on its own: a 30 px destination asks the painter for 30 x hudK where the HUD is scaled (' + r.spriteRaster.icon[0] + ' at ' + r.spriteRaster.kBig + ') and for 30 where it is not -- icons and selection-strip portraits alike', JSON.stringify(r.spriteRaster));


ok(r.multiCard.gotCard, 'three barracks selected together still get a production card', JSON.stringify(r.multiCard));
ok(r.spread.reduce((a, b) => a + b, 0) === 6, 'six presses queue six units', JSON.stringify(r.spread));
ok(Math.max(...r.spread) - Math.min(...r.spread) <= 1, '...spread across the three, not stacked on one', JSON.stringify(r.spread));

ok(r.autoMine.after === r.autoMine.before + 1 && r.autoMine.working === r.autoMine.after, 'a new worker goes to the minerals on its own', JSON.stringify(r.autoMine));
ok(r.dryLine.minedBefore > 0, 'the workers are mining before the line is drained (scene check)', JSON.stringify(r.dryLine.minedBefore));
ok(r.dryLine.movedWithinLine && r.dryLine.movedWithinLine.base === r.dryLine.homeBase,
  'ONE patch running out moves the worker to another patch of the SAME line -- which is the thing the rule must not break', JSON.stringify(r.dryLine.movedWithinLine));
ok(r.dryLine.idleAfter === r.dryLine.workers && r.dryLine.wentElsewhere === 0,
  'THE WHOLE LINE RUNNING OUT STOPS THEM: every worker goes idle and none sets off for another base (measured before the change: twelve of twelve walked to the natural)', JSON.stringify(r.dryLine));
ok(r.dryLine.maxWalk <= 3,
  '...and they do not wander while they wait -- at most 3 tiles in ninety seconds, against about 280 each before', JSON.stringify(r.dryLine.maxWalk));
ok(r.dryLine.orderedAway && r.dryLine.orderedAway.base !== r.dryLine.homeBase && r.dryLine.orderedAway.order !== 'idle',
  '...but an explicit order to another base IS obeyed, which is the whole of "they stop unless you command them"', JSON.stringify(r.dryLine.orderedAway));
ok(r.aiRetasks.workers > 0 && r.aiRetasks.mining === r.aiRetasks.workers,
  'and the COMPUTER still moves its own idle workers to a new base -- AI.economy re-tasks them, and taking that away would have stalled every AI whose main ran dry', JSON.stringify(r.aiRetasks));
ok(r.rallyWins.made && r.rallyWins.newestOrder !== 'gather', 'but an explicit rally still wins -- an instruction beats a convenience', JSON.stringify(r.rallyWins));

// Asserted on ORDERS ISSUED, not on energy spent. Energy is the wrong probe: without smart casting all
// six templar are ordered to storm, but only the first one's storm actually lands -- the rest find the
// field already there and quietly do nothing, so "one unit paid" was true either way and the check
// passed with the feature removed. The negative control caught exactly that.
ok(r.smart.casters.length === 1, 'one storm press issues exactly one cast order', JSON.stringify(r.smart));
ok(r.smart.casters[0] === r.smart.wanted, '...from the templar that can actually pay for it, not whichever was first in the selection', JSON.stringify(r.smart));

ok(r.armDefaultsOff, 'autocast is off by default');
ok(r.armed === true && r.armedNow, 'arming an ability arms it', JSON.stringify([r.armed, r.armedNow]));
ok(r.disarmed === false && !r.armedAfter, '...and toggling again disarms it', JSON.stringify([r.disarmed, r.armedAfter]));
ok(r.refuses === false, 'an ability not flagged autocastable refuses to be armed');
ok(r.noUnitCostAutocast.length === 0, 'NOTHING that consumes a unit is autocastable', r.noUnitCostAutocast.join(', '));
ok(r.autocastSet.length >= 4, 'the autocast set is the Brood War one', r.autocastSet.join(', '));

ok(r.signals.join(',') === 'ping,draw', 'pings and drawings both land as signals', JSON.stringify(r.signals));
ok(r.hashUnchanged, 'a signal does NOT change the simulation hash -- a cosmetic broadcast must never desync');
ok(r.expired, 'signals expire');
ok(r.bounded, '...and spamming them is bounded');

console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
