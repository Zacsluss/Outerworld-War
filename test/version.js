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
  // REVIEW-M17. Every one of these left the hash UNCHANGED before BUILD named them: a top-level const
  // or function in a classic script is not a property of the global, so the old nine-name list could
  // not see them. Each is a change a player would feel, and each used to load an old save and drift.
  ['combat.js', s => s.replace(/^  fire\(a, t, w\) \{/m, '  fire(a, t, w) { /* edited */')],          // the whole Combat object
  ['data.js', s => s.replace('const DMG_MULT = {', 'const DMG_MULT = { __edited: 1,')],              // damage type table
  ['sim.js', s => s.replace('const MINE_TIME = 190,', 'const MINE_TIME = 191,')],                     // a scalar on a multi-name line (re-anchored when TODO-M18 7a moved it from 75)
  ['sim.js', s => s.replace('const distPt = (x1, y1, x2, y2) => DMath.hypot(x1 - x2, y1 - y2);', 'const distPt = (x1, y1, x2, y2) => DMath.hypot(x1 - x2, y1 - y2) + 0;')],   // an arrow helper
  ['game.js', s => s.replace('const SUPPLY_CAP = 500;', 'const SUPPLY_CAP = 501;')],
  ['game.js', s => s.replace(/^function daylightAt\(frame\) \{/m, 'function daylightAt(frame) { /* edited */')],   // a function declaration
  ['map.js', s => s.replace('const CHURN_SLOW = 0.25', 'const CHURN_SLOW = 0.26')],                  // HANDOFF-M16 trap 8
  ['abilities.js', s => s.replace("const NO_BROODLING = new Set(['probe',", "const NO_BROODLING = new Set(['__edited', 'probe',")],   // a Set (HOVER, the old anchor here, is derived from DATA since REVIEW-M17 task 22)
  ['sim.js', s => s.replace('vulture: 0.22', 'vulture: 0.23')],                                        // TURN, which the old list DID name
];
for (const [file, edit] of edits) {
  const name = file.replace('.js', '');
  let applied = false;
  const c = makeCtx((f, src) => { if (f !== name) return src; const s2 = edit(src); applied = s2 !== src; return s2; });
  const h = vm.runInContext('BUILD.hash()', c);
  ok('editing ' + file + ' (' + edit.toString().slice(0, 50).replace(/\s+/g, ' ') + ') changes the hash', applied && h !== ha, applied ? h + ' vs ' + ha : 'the edit matched nothing -- the anchor is stale, so this check is vacuous');
}

// 2b. the lists in BUILD name every top-level binding of every stamped file. This is what keeps the
// fix above from rotting: a new `const FOO = 3` in js/sim.js that nobody adds to BUILD fails here,
// and so does a name left in a list after the binding it named was renamed away.
{
  // top-level declarations, by text; `const A = 1, B = 2;` on one line yields both names
  const names = line => {
    const m = /^(const|let|var|function|class)\s+(.*)$/.exec(line); if (!m) return [];
    if (m[1] === 'function' || m[1] === 'class') return [/^([A-Za-z_$][\w$]*)/.exec(m[2])[1]];
    const out = []; let depth = 0, q = null, seg = '';
    for (const ch of m[2]) {
      if (q) { if (ch === q) q = null; seg += ch; continue; }
      if (ch === '\'' || ch === '"' || ch === '`') { q = ch; seg += ch; continue; }
      if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
      if ((ch === ',' || ch === ';') && depth === 0) { out.push(seg); seg = ''; continue; }
      seg += ch;
    }
    if (seg.trim()) out.push(seg);
    return out.map(s => (/^\s*([A-Za-z_$][\w$]*)\s*=/.exec(s) || [])[1]).filter(Boolean);
  };
  const decl = [];
  for (const f of SIM) fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8').split(/\r?\n/).forEach((line, i) => { for (const n of names(line)) decl.push({ f, line: i + 1, n }); });
  ok('the audit finds the declarations (negative control for the parser)', decl.length >= 60, decl.length + ' found');
  const B = vm.runInContext('BUILD', a);
  const lists = ['TABLES', 'TUNING', 'HELPERS', 'SINGLETONS', 'CLASSES'];
  const hashed = new Set([].concat(...lists.map(k => B[k] || [])));
  const notSim = new Set(Object.keys(B.NOT_SIM || {}));
  const missing = decl.filter(d => !hashed.has(d.n) && !notSim.has(d.n));
  ok('every top-level binding of a stamped file is in a BUILD list', missing.length === 0, missing.map(d => d.f + '.js:' + d.line + ' ' + d.n).join(', '));
  const both = decl.filter(d => hashed.has(d.n) && notSim.has(d.n));
  ok('no binding is both hashed and NOT_SIM', both.length === 0, both.map(d => d.n).join(', '));
  const declared = new Set(decl.map(d => d.n));
  const stale = [...hashed, ...notSim].filter(n => !n.includes('.') && !declared.has(n));
  ok('every name in a BUILD list is still declared somewhere (a rename cannot leave a stale name silently unstamped)', stale.length === 0, stale.join(', '));
  const unresolved = [...hashed].filter(n => vm.runInContext('(() => { try { return typeof eval(' + JSON.stringify(n) + ') === "undefined"; } catch (e) { return true; } })()', a));
  ok('every hashed name resolves in a full simulation context', unresolved.length === 0, unresolved.join(', '));
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
