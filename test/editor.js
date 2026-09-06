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
