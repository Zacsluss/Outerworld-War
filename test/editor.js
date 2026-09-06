// Map editor test: builds a custom 2-player map the way the editor does, validates it,
// plays a full AI-vs-AI game on it and then a two-client LAN game on it.
//   node test/editor.js [frames=12000] [port=8801]
const fs = require('fs'), vm = require('vm'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '..'); const FRAMES = parseInt(process.argv[2] || '12000'), PORT = parseInt(process.argv[3] || '8801');
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
function makeCtx(withNet) {
  const errors = [];
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '', querySelectorAll: () => [], options: [] });
  const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0])) }, Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; }, localStorage: (() => { let s = {}; return { getItem: k => s[k] || null, setItem: (k, v) => s[k] = String(v) }; })(), document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] }, requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost:' + PORT }, prompt: () => 'x' };
  if (withNet) ctx.WebSocket = WebSocket;
  ctx.window = ctx; vm.createContext(ctx);
  const files = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'editor'].concat(withNet ? ['net'] : []);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  ctx.errors = errors; return ctx;
}
// ---------- build and validate the map ----------
const ctx = makeCtx(false);
vm.runInContext(`
  Editor.canvas = { width: 1280, height: 720 }; Editor.template(); Editor.name = 'Test Arena';
  this.layout = Editor.toLayout();
  this.problems = Editor.problems();
  this.saved = (Editor.store.save('Test Arena', this.layout), Editor.register());
`, ctx);
const layout = ctx.layout;
console.log('built "' + layout.name + '": ' + layout.players + ' players, ' + layout.bases.length + ' bases, ' + (JSON.stringify(layout).length / 1024).toFixed(1) + ' KB');
check(ctx.problems.length === 0, 'template map validates' + (ctx.problems.length ? ': ' + ctx.problems.slice(0, 3).join('; ') : ''));
check(ctx.saved.includes('Test Arena'), 'map registers as a selectable layout ("custom:Test Arena")');
// ---------- editor quality of life: mirrored painting, rectangle fill, undo/redo, minimap ----------
// This is the M3 task 4 acceptance case: build a symmetric 4-player map with a handful of gestures.
const qol = makeCtx(false);
vm.runInContext(`
  Editor.canvas = { width: 1280, height: 720 }; Editor.zoom = 6; Editor.blank(); Editor.name = 'Four Corners';
  Editor.mirror = '4';
  const gestures = [];
  // one rectangle per feature, each mirrored into four corners by the editor
  Editor.tool = 'high'; Editor.mark(); Editor.fillRect(6, 6, 39, 33, false); gestures.push('main plateau');
  Editor.tool = 'ramp'; Editor.mark(); Editor.fillRect(40, 28, 44, 33, false); gestures.push('ramp');
  Editor.tool = 'high'; Editor.mark(); Editor.fillRect(50, 50, 60, 60, false); gestures.push('centre island');
  Editor.tool = 'start'; Editor.mark(); this.mains = Editor.addBaseMirrored(12, 12, true); gestures.push('start locations');
  Editor.tool = 'base'; Editor.mark(); this.exps = Editor.addBaseMirrored(48, 20, false); gestures.push('expansions');
  this.gestures = gestures.length;
  // symmetry: every tile must equal its three mirror images
  let asym = 0;
  for (let y = 0; y < Editor.H; y++) for (let x = 0; x < Editor.W; x++) {
    const v = Editor.height[Editor.idx(x, y)];
    for (const [mx, my] of Editor.mirrors(x, y)) if (Editor.height[Editor.idx(mx, my)] !== v) asym++;
  }
  this.asym = asym;
  this.starts = Editor.bases.filter(b => b.main).length; this.total = Editor.bases.length;
  // undo/redo must round-trip the last gesture exactly
  const before = Editor.snap();
  Editor.undo(); this.afterUndo = Editor.bases.length;
  Editor.redo();
  this.redoMatches = Editor.bases.length === before.bases.length && Editor.height.every((v, i) => v === before.height[i]);
  // undo all the way back to the blank canvas
  for (let i = 0; i < 10; i++) Editor.undo();
  this.emptyAgain = Editor.bases.length === 0 && Editor.height.every(v => v === 0);
  for (let i = 0; i < 10; i++) Editor.redo();
  this.restored = Editor.bases.length === before.bases.length && Editor.height.every((v, i) => v === before.height[i]);
  // the minimap must cover the whole map and map a click back to a camera position.
  // Zoom in first, otherwise the viewport already covers the whole map and every camera position clamps to 0.
  Editor.zoom = 12; const r = Editor.minimapRect();
  this.mmMax = [Math.max(0, Editor.W - Editor.viewTilesX()), Math.max(0, Editor.H - Editor.viewTilesY())];
  Editor.camX = 0; Editor.camY = 0;
  this.mmHit = Editor.minimapClick(r.x + r.w * 0.9, r.y + r.h * 0.9);
  this.mmCam = [Editor.camX, Editor.camY];
  this.mmMiss = Editor.minimapClick(r.x - 20, r.y - 20);
  Editor.zoom = 6;
  this.problems = Editor.problems();
  this.layout = Editor.toLayout();
  Editor.store.save('Four Corners', this.layout); this.saved = Editor.register();
`, qol);
check(qol.mains === 4 && qol.starts === 4, 'mirroring turns one start-location click into 4 (' + qol.starts + ' starts from ' + qol.gestures + ' gestures)');
check(qol.exps === 4 && qol.total === 8, 'mirroring turns one expansion click into 4 (' + qol.total + ' bases total)');
check(qol.asym === 0, 'rectangle fills are 4-way symmetric (' + qol.asym + ' asymmetric tiles)');
check(qol.afterUndo === 4 && qol.redoMatches, 'undo removes the last gesture and redo restores it exactly');
check(qol.emptyAgain, 'undo unwinds every gesture back to a blank map');
check(qol.restored, 'redo replays every gesture back to the finished map');
check(qol.mmHit === true && qol.mmMiss === false && qol.mmCam[0] === qol.mmMax[0] && qol.mmCam[1] === qol.mmMax[1],
  'a minimap click near the far corner scrolls the camera there (' + qol.mmCam.join(',') + ' of a possible ' + qol.mmMax.join(',') + ') and clicks outside it are ignored');
check(qol.problems.length === 0, 'the mirrored 4-player map validates' + (qol.problems.length ? ': ' + qol.problems.slice(0, 3).join('; ') : ''));
check(qol.layout.players === 4, 'it registers as a 4-player layout');

// the symmetric map has to actually play
const play4 = makeCtx(false);
play4.layout4 = qol.layout;
vm.runInContext(`
  MAP_LAYOUTS['custom:Four Corners'] = this.layout4;
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' },
                     { race: 'P', human: false, difficulty: 'normal', name: 'C' }, { race: 'T', human: false, difficulty: 'normal', name: 'D' }],
           seed: 5, layout: 'custom:Four Corners' });
  this.startsUsed = new Set(G.players.map(p => p.startX + ',' + p.startY)).size;
  for (let i = 0; i < 9600 && !G.over; i++) G.tick();
  this.halls = G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding && u.def.depot).length);
  this.sup = G.players.map(p => p.supUsed);
`, play4);
check(play4.startsUsed === 4, 'four players get four distinct start locations');
check(play4.sup.every(s => s > 20) && play4.halls.every(h => h >= 1), '4-player game on it runs: supply ' + play4.sup.join('/') + ', halls ' + play4.halls.join('/'));
check(play4.errors.length === 0, 'no errors in the 4-player game' + (play4.errors.length ? ': ' + play4.errors[0] : ''));

// round trip through JSON, as export/import does
const rt = makeCtx(false);
vm.runInContext(`MAP_LAYOUTS['custom:rt'] = ${JSON.stringify(layout)}; const m = new GameMap(1, 'custom:rt');
  this.info = { starts: m.starts.length, bases: m.bases.length, res: m.resources.length, walkable: Array.from(m.walk).filter(v => v === 1).length, high: Array.from(m.height).filter(v => v === 2).length };`, rt);
check(rt.info.starts >= 2 && rt.info.bases === layout.bases.length, 'exported JSON rebuilds the same map (' + rt.info.starts + ' starts, ' + rt.info.bases + ' bases, ' + rt.info.res + ' resource patches)');
check(rt.info.high > 500 && rt.info.walkable > 8000, 'terrain survives the round trip (' + rt.info.high + ' high tiles, ' + rt.info.walkable + ' walkable)');
// ---------- full AI game on the custom map ----------
const g = makeCtx(false);
vm.runInContext(`MAP_LAYOUTS['custom:Test Arena'] = ${JSON.stringify(layout)};
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 3, layout: 'custom:Test Arena' });
  const t0 = Date.now(); for (let i = 0; i < ${FRAMES} && !G.over; i++) G.tick();
  this.out = { frame: G.frame, over: G.over, winner: G.winner, ms: Date.now() - t0, sup: G.players.map(p => p.supUsed), halls: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && u.def.depot).length), units: G.units.filter(u => u.alive).length, expanded: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding).length) };`, g);
const o = g.out;
console.log('AI game: ' + o.frame + ' frames in ' + o.ms + ' ms, over=' + o.over + ' winner=' + o.winner + ', supply ' + o.sup.join('/') + ', halls ' + o.halls.join('/') + ', buildings ' + o.expanded.join('/'));
check(!g.errors.length, 'no errors during the AI game' + (g.errors.length ? ': ' + g.errors[0] : ''));
check(o.sup[0] > 20 && o.sup[1] > 20, 'both AIs built an economy on the custom map');
check(o.halls[0] >= 1 && o.halls[1] >= 1 && (o.halls[0] > 1 || o.halls[1] > 1), 'the map supports expanding (halls ' + o.halls.join('/') + ')');
// ---------- LAN game on the custom map ----------
if (typeof WebSocket === 'undefined') { console.log('SKIP LAN check (needs Node 22+)'); }
else {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: ['ignore', 'ignore', 'ignore'] });
  process.on('exit', () => { try { server.kill(); } catch (e) { } });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (cond, ms, what) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + what); await sleep(20); } };
  (async () => {
    await sleep(600);
    const mk = name => { const c = makeCtx(true); vm.runInContext(`MAP_LAYOUTS['custom:Test Arena'] = ${JSON.stringify(layout)};
      this.__Net = Net; this.__G = G;
      this.UI = { mode: 'play', net: true, loading: null, menu: null, selection: [], ping() {}, onUnitDied() {}, started: false, start(o) { G.init(o); G.recording = true; G.log = []; G.pendingCmds = null; G.mission = null; this.started = true; } };
      this.step = max => { let n = 0; while (n < max && Net.active && !G.over && Net.ready(G.frame)) { Net.beforeTick(); G.tick(); n++; } return n; };
      this.join = () => Net.connect('ws://localhost:${PORT}/ws', ${JSON.stringify(name)}, 'T');`, c); return c; };
    const A = mk('Alice'), B = mk('Bob');
    A.join(); await until(() => A.__Net.lobby, 5000, 'A lobby'); B.join(); await until(() => B.__Net.lobby && B.__Net.lobby.players.length === 2, 5000, 'B lobby');
    A.__Net.send({ t: 'set', layout: 'custom:Test Arena' }); await sleep(200);
    A.__Net.send({ t: 'start' }); await until(() => A.UI.started && B.UI.started, 5000, 'start');
    check(A.__G.layout === 'custom:Test Arena' && B.__G.layout === A.__G.layout, 'both LAN clients loaded the custom map');
    const t0 = Date.now();
    while (A.__G.frame < 4800 || B.__G.frame < 4800) { A.step(30); B.step(30); await sleep(0); if (Date.now() - t0 > 120000) break; }
    const common = Object.keys(A.__Net.myHashes).map(Number).filter(f => B.__Net.myHashes[f] !== undefined).sort((a, b) => b - a);
    check(common.length > 0 && A.__Net.myHashes[common[0]] === B.__Net.myHashes[common[0]], 'LAN game on the custom map stays in sync (frame ' + common[0] + ', ' + A.__G.frame + '/' + B.__G.frame + ' frames)');
    check(!A.__Net.desynced && !B.__Net.desynced && !A.errors.length && !B.errors.length, 'no desync or errors in the LAN game');
    console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
  })().catch(e => { console.error(e); process.exit(1); });
}
if (typeof WebSocket === 'undefined') { console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0); }
