// Multiplayer robustness test: two headless lockstep clients + one AI through the relay.
//   node test/net.js [frames=14400] [port=8790]
// 1. both clients play `frames` frames issuing random orders; state hashes must match every 48 frames
// 2. client B's socket is killed; A must keep playing (B's units stop at the relay-chosen frame)
// 3. B reconnects with the same name, re-simulates the relay history and rejoins; hashes must match again
// 4. an injected divergence (an extra G.rand() on one client) must be reported by both clients at the same frame
const fs = require('fs'), vm = require('vm'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '..'); const FRAMES = parseInt(process.argv[2] || '14400'), PORT = parseInt(process.argv[3] || '8790');
if (typeof WebSocket === 'undefined') { console.error('needs Node 22+ (global WebSocket)'); process.exit(2); }
const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', d => { const s = String(d).trim(); if (s) console.log('  [relay] ' + s); });
server.stderr.on('data', d => console.log('  [relay err] ' + String(d).trim()));
process.on('exit', () => { try { server.kill(); } catch (e) { } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function makeClient(name) {
  const errors = [];
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '', querySelectorAll: () => [] });
  const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 2).join(' | ') : String(x)).join(' ')) }, Math, performance, setTimeout, clearTimeout, setInterval() { return 0; }, WebSocket, location: { protocol: 'http:', host: 'localhost:' + PORT }, localStorage: { getItem() { return null; }, setItem() { } }, document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: null, querySelectorAll: () => [] }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'net']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  vm.runInContext(`this.__Net = Net; this.__G = G; this.UI = { mode: 'play', net: true, loading: null, menu: null, selection: [], ping() {}, onUnitDied() {}, started: false, start(opts) { G.init(opts); G.recording = true; G.log = []; G.pendingCmds = null; G.mission = null; this.started = true; } };
    this.step = max => { let n = 0; while (n < max && Net.active && !G.over && Net.ready(G.frame)) { Net.beforeTick(); G.tick(); n++; } return n; };
    this.orderSomething = () => { const mine = G.units.filter(u => u.alive && u.owner === G.human && !u.isBuilding && !u.def.larva && !u.def.egg); if (!mine.length) return; const u = mine[0]; const t = mine[(G.frame * 7 + u.id) % mine.length]; t.setOrder({ type: 'move', x: t.x + ((G.frame % 5) - 2) * 60, y: t.y + ((G.frame % 3) - 1) * 60 }); };`, ctx);
  return { name, ctx, errors, connect() { vm.runInContext(`Net.connect('ws://localhost:${PORT}/ws', ${JSON.stringify(name)}, 'T')`, ctx); }, get Net() { return ctx.__Net; }, get G() { return ctx.__G; }, frame() { return ctx.__G.frame; }, step(n) { return ctx.step(n); }, hash() { return ctx.__G.stateHash(); }, order() { ctx.orderSomething(); } };
}
async function until(cond, ms, what) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what); await sleep(20); } }
async function main() {
  await until(() => true, 0, ''); await sleep(600);
  const A = makeClient('Alice'), B = makeClient('Bob'); let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
  A.connect(); await until(() => A.Net.connected && A.Net.lobby, 5000, 'A in lobby'); B.connect(); await until(() => B.Net.lobby && B.Net.lobby.players.length === 2, 5000, 'B in lobby');
  A.Net.send({ t: 'addai', race: 'Z', difficulty: 'easy' }); await until(() => A.Net.lobby && A.Net.lobby.players.length === 3, 5000, 'AI added');
  A.Net.send({ t: 'start' }); await until(() => A.ctx.UI.started && B.ctx.UI.started, 5000, 'game start');
  check(A.G.seed === B.G.seed && A.Net.me === 0 && B.Net.me === 1, 'both clients started the same game (seed ' + A.G.seed + ')');
  A.G.cheat('power overwhelming'); // goes through the command stream: both humans become invulnerable on every client, so the AI cannot end the game early
  // ---- phase 1: play FRAMES frames together
  const run = async (clients, target, label) => { const t0 = Date.now(); while (clients.some(c => c.frame() < target && !c.G.over)) { for (const c of clients) { if (c.frame() < target) { c.step(30); if (c.frame() % 120 === 0) c.order(); } } await sleep(0); if (Date.now() - t0 > (label === 'phase 3' ? 120000 : 240000)) { for (const c of clients) console.log('  ' + c.name + ': frame ' + c.frame() + ' ready=' + c.Net.ready(c.frame()) + ' missing=' + c.Net.players.map((p, i) => p.human && !c.Net.isGone(i, c.frame()) && !(c.Net.inbox[c.frame()] || {})[i] ? i : '').join('') + ' inboxKeys=' + Object.keys(c.Net.inbox).slice(0, 6).join(',') + ' gone=' + JSON.stringify(c.Net.gone) + ' connected=' + c.Net.connected + ' active=' + c.Net.active); throw new Error('timeout in ' + label); } } };
  await run([A, B], FRAMES, 'phase 1');
  const common = Object.keys(A.Net.myHashes).map(Number).filter(f => B.Net.myHashes[f] !== undefined).sort((a, b) => b - a);
  check(common.length > 0 && A.Net.myHashes[common[0]] === B.Net.myHashes[common[0]], 'phase 1: hashes match at frame ' + common[0] + ' (' + FRAMES + ' frames, ' + A.G.log.length + '/' + B.G.log.length + ' commands logged)');
  check(!A.Net.desynced && !B.Net.desynced, 'phase 1: no desync reported by either client');
  // ---- phase 2: kill B, A must continue
  const bFrame = B.frame(); B.Net.ws.close(); console.log('  killed Bob at frame ' + bFrame);
  await until(() => A.Net.gone[1], 5000, 'A told that Bob left');
  const stopAt = A.Net.gone[1].from; console.log('  relay says Bob\'s units stop at frame ' + stopAt);
  await run([A], FRAMES + 2400, 'phase 2');
  check(A.frame() >= FRAMES + 2400 || A.G.over, 'phase 2: Alice kept playing alone to frame ' + A.frame() + (A.G.over ? ' (game over, winner ' + A.G.winner + ')' : ''));
  check(A.G.log.some(e => e.c.t === 'stopall' && e.c.p === 1 && e.f === stopAt), 'phase 2: Bob\'s units were stopped at the relay-chosen frame');
  // ---- phase 3: Bob rejoins and catches up
  const B2 = makeClient('Bob'); B2.connect(); await until(() => B2.ctx.UI.started, 8000, 'Bob rejoin start');
  check(B2.Net.catchingUp && B2.Net.me === 1, 'phase 3: relay accepted the rejoin with the history (' + Object.keys(B2.Net.inbox).length + ' frames of batches)');
  // A rejoin used to replay the entire game; with a snapshot from a live player it replays only the tail,
  // so this must stay tiny however long the game has been running.
  check(Object.keys(B2.Net.inbox).length < 100 && B2.frame() >= 16000, 'phase 3: rejoin started from a snapshot, not from frame 0 (frame ' + B2.frame() + ', ' + Object.keys(B2.Net.inbox).length + ' batches to replay)');
  const t0 = Date.now(); while (B2.Net.catchingUp) { const n = B2.step(400); if (!n) { if (!B2.Net.ready(B2.frame())) B2.Net.catchingUp = false; } A.step(30); await sleep(0); if (Date.now() - t0 > 120000) throw new Error('rejoin catch-up timeout'); }
  console.log('  Bob caught up to frame ' + B2.frame() + ' (Alice at ' + A.frame() + ')');
  await run([A, B2], A.frame() + 2400, 'phase 3');
  const common2 = Object.keys(A.Net.myHashes).map(Number).filter(f => B2.Net.myHashes[f] !== undefined && f > FRAMES + 2400).sort((a, b) => b - a);
  check(common2.length > 0 && A.Net.myHashes[common2[0]] === B2.Net.myHashes[common2[0]], 'phase 3: hashes match after rejoin at frame ' + common2[0]);
  check(!A.Net.desynced && !B2.Net.desynced, 'phase 3: no desync reported');
  // ---- phase 4: a real divergence must be reported by both clients at the same frame
  B2.G.rand(); B2.G.rand(); await run([A, B2], A.frame() + 200, 'phase 4');
  check(A.Net.desynced && B2.Net.desynced && A.Net.desyncFrame === B2.Net.desyncFrame && A.Net.desyncFrame > 0, 'phase 4: injected divergence detected by both clients at frame ' + A.Net.desyncFrame + '/' + B2.Net.desyncFrame);
  if (!A.Net.desynced) { const ks = Object.keys(A.Net.myHashes).map(Number).sort((a, b) => a - b).slice(-4); console.log('  A frames', A.frame(), 'B2', B2.frame(), 'A mine', ks.map(k => k + ':' + A.Net.myHashes[k]).join(' '), '| B2 mine', ks.map(k => k + ':' + B2.Net.myHashes[k]).join(' '), '| A theirs', ks.map(k => k + ':' + JSON.stringify(A.Net.theirHashes[k])).join(' '), '| rngA', A.G.rand && vm.runInContext('RNG.s', A.ctx), 'rngB', vm.runInContext('RNG.s', B2.ctx)); }
  for (const c of [A, B, B2]) c.errors.splice(0, c.errors.length, ...c.errors.filter(e => !e.includes('desync at frame'))); check(!A.errors.length && !B.errors.length && !B2.errors.length, 'no JS errors (' + [A, B, B2].map(c => c.errors.length).join('/') + ')'); for (const c of [A, B, B2]) c.errors.slice(0, 3).forEach(e => console.log('   ' + c.name + ': ' + e));
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
