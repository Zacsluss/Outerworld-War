// Build stamp: saves and replays carry a digest of the simulation, and a log from a
// different build is refused instead of re-simulating into a different game.
//   node test/version.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const SIM = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build'];
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); } };

function makeCtx(patch) {
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { } });
  const ctx = {
    console: { log() { }, warn() { }, error() { } }, Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
    localStorage: { _v: {}, getItem(k) { return this._v[k] || null; }, setItem(k, v) { this._v[k] = v; } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
    requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, alert(m) { ctx.alerted = m; },
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of SIM) {
    let src = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
    if (patch) src = patch(f, src);
    vm.runInContext(src, ctx, { filename: f + '.js' });
  }
  return ctx;
}

// 1. stable: the same sources hash the same, twice over and across two contexts
const a = makeCtx(), b = makeCtx();
const ha = vm.runInContext('BUILD.hash()', a), hb = vm.runInContext('BUILD.hash()', b);
ok('hash is 16 hex chars', /^[0-9a-f]{16}$/.test(ha), ha);
ok('hash is stable across contexts', ha === hb, ha + ' vs ' + hb);
ok('hash is stable when recomputed', vm.runInContext('BUILD._hash = null; BUILD.hash()', a) === ha);

// 2. sensitive: changing a sim rule changes the hash
const edits = [
  ['sim.js', s => s.replace("case 'move':", "case 'move': /* edited */")],
  ['game.js', s => s.replace('  tick() {', '  tick() { /* edited */')],
  ['data.js', s => s.replace("hp: 40, sh: 40", "hp: 41, sh: 40")],   // High Templar hp
  ['ai.js', s => s.replace("['marine', 6]", "['marine', 7]")],
];
for (const [file, edit] of edits) {
  const name = file.replace('.js', '');
  const c = makeCtx((f, src) => f === name ? edit(src) : src);
  const h = vm.runInContext('BUILD.hash()', c);
  ok('editing ' + file + ' changes the hash', h !== ha, h + ' vs ' + ha);
}

// 3. a save carries the stamp, and a foreign one is refused with a reason
const c = makeCtx();
vm.runInContext(`
  G.init({ players: [{ race: 'T', human: true, name: 'Zac' }, { race: 'Z', human: false, difficulty: 'easy', name: 'AI' }], seed: 7, layout: 'temple' });
  for (let i = 0; i < 240; i++) G.tick();
  this.save = Replay.data();
`, c);
ok('a save carries the build stamp', c.save.build === ha, String(c.save.build));
ok('a matching save is accepted', vm.runInContext('Replay.versionError(this.save, "save")', c) === null);

const foreign = JSON.parse(JSON.stringify(c.save)); foreign.build = '0123456789abcdef';
c.foreign = foreign;
const msg = vm.runInContext('Replay.versionError(this.foreign, "save")', c);
ok('a save from another build is refused', typeof msg === 'string' && msg.includes('0123456789abcdef') && msg.includes(ha), String(msg));

const old = JSON.parse(JSON.stringify(c.save)); delete old.build; c.old = old;
const msg2 = vm.runInContext('Replay.versionError(this.old, "save")', c);
ok('a save from before stamping is refused', typeof msg2 === 'string' && /older build/.test(msg2), String(msg2));

// 4. the refusal actually stops the load: UI.startFromLog must not start a game
const u = makeCtx(); // ui.js needs render.js, so load the display half too
for (const f of ['render', 'ui']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), u, { filename: f + '.js' });
vm.runInContext(`
  UI.ping = () => {}; UI.onUnitDied = () => {};
  G.init({ players: [{ race: 'T', human: true, name: 'Zac' }, { race: 'Z', human: false, difficulty: 'easy', name: 'AI' }], seed: 7, layout: 'temple' });
  for (let i = 0; i < 120; i++) G.tick();
  const good = Replay.data(); const bad = JSON.parse(JSON.stringify(good)); bad.build = 'deadbeefdeadbeef';
  this.frameBefore = G.frame;
  this.refused = UI.startFromLog(bad, 'load');
  this.frameAfter = G.frame;
`, u);
ok('a mismatched save does not start a game', u.refused === false && u.frameAfter === u.frameBefore, 'refused=' + u.refused + ' frame ' + u.frameBefore + '->' + u.frameAfter);
ok('the player is told why', typeof u.alerted === 'string' && u.alerted.includes('deadbeefdeadbeef'), String(u.alerted));

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} passed, ${fail} failed   build ${ha}`);
process.exit(fail ? 1 : 0);
