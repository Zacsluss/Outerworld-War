// REVIEW-M17 decision 1 -- the simulation's transcendentals are the same bits on every engine.
//   node test/dmath.js
//
// Math.sin, Math.cos, Math.atan2 and Math.hypot are not required to be correctly rounded and the engines
// differ in the last bit (V8 and SpiderMonkey carry fdlibm ports, JavaScriptCore calls the platform
// libm). Lockstep hashes positions at 1/16 px, so two different engines -- Chrome against Firefox, or a
// Tauri build on Windows against one on macOS -- drift apart over minutes. DMath (js/data.js) computes
// the four with +, -, *, /, sqrt and floor only, which IEEE 754 requires to be correctly rounded, so
// every engine computes the same bits. Cross-engine determinism cannot be run headlessly in one Node;
// what CAN be checked is here:
//
//  1. ACCURACY. DMath against Math over a hundred thousand points: sin, cos and atan2 within 4e-15,
//     hypot within one part in 1e15. A polynomial that drifted would show up as positions that
//     disagree with the natives by more than rounding, which is a different game, not a deterministic
//     one.
//  2. PURITY. DMath's own source calls no native transcendental (sin, cos, tan, atan, atan2, hypot,
//     pow, exp, log) -- only sqrt and floor, which are exact. A count guard proves the scrape found the
//     object.
//  3. THE SIMULATION USES IT. No stamped file calls Math.sin/cos/atan2/hypot in code (comments may),
//     and the DMath call count is at least what the review replaced (75).
//  4. A GAME RUNS ON IT and is deterministic: two contexts, same seed, same hash after 2,400 frames.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + extra : '')); } };
const SIM = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'];
function makeCtx() {
  const el = () => ({ style: {}, addEventListener() { }, getContext: () => null });
  const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, clearTimeout, addEventListener() { }, requestAnimationFrame() { }, document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of SIM) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  return ctx;
}
const ctx = makeCtx();
const D = vm.runInContext('DMath', ctx);

// 1. accuracy
{
  let worst = { sin: 0, cos: 0, atan2: 0, hypot: 0 }, nan = 0;
  // a deterministic sample: a fixed xorshift, so the worst case is reproducible
  let s = 12345 >>> 0; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 100000; i++) {
    const x = (rnd() - 0.5) * 2000, y = (rnd() - 0.5) * 2000, a = (rnd() - 0.5) * 40;
    const es = Math.abs(D.sin(a) - Math.sin(a)), ec = Math.abs(D.cos(a) - Math.cos(a)), ea = Math.abs(D.atan2(y, x) - Math.atan2(y, x)), eh = Math.abs(D.hypot(x, y) - Math.hypot(x, y)) / Math.max(1, Math.hypot(x, y));
    if ([es, ec, ea, eh].some(e => !(e >= 0))) nan++;
    worst.sin = Math.max(worst.sin, es); worst.cos = Math.max(worst.cos, ec); worst.atan2 = Math.max(worst.atan2, ea); worst.hypot = Math.max(worst.hypot, eh);
  }
  ok('sin and cos agree with Math to 4e-15 over 100,000 angles in [-20, 20]', worst.sin < 4e-15 && worst.cos < 4e-15, JSON.stringify(worst));
  ok('atan2 agrees with Math to 4e-15 over 100,000 points', worst.atan2 < 4e-15, JSON.stringify(worst));
  ok('hypot agrees with Math to one part in 1e15', worst.hypot < 1e-15, JSON.stringify(worst));
  ok('no NaN anywhere in the sample', nan === 0, String(nan));
  // the edges: exact zeros, the axes, a full turn, huge and non-finite inputs
  ok('sin(0) is exactly 0 and cos(0) exactly 1', D.sin(0) === 0 && D.cos(0) === 1, D.sin(0) + ' ' + D.cos(0));
  ok('atan2 on the axes', D.atan2(0, 1) === 0 && D.atan2(1, 0) === Math.PI / 2 && D.atan2(-1, 0) === -Math.PI / 2 && Math.abs(D.atan2(0, -1) - Math.PI) < 1e-15 && D.atan2(0, 0) === 0, [D.atan2(0, 1), D.atan2(1, 0), D.atan2(0, -1)].join(' '));
  ok('a non-finite angle is 0, not NaN (a NaN facing would spread through every position)', D.sin(NaN) === 0 && D.cos(Infinity) === 1 && D.sin(-Infinity) === 0, D.sin(NaN) + ' ' + D.cos(Infinity));
  ok('a million radians reduce correctly', Math.abs(D.sin(1e6) - Math.sin(1e6)) < 1e-9, String(D.sin(1e6) - Math.sin(1e6)));
}

// 2. purity
{
  const src = vm.runInContext('Object.values(DMath).map(f => String(f)).join("\\n")', ctx);
  ok('the scrape found DMath (negative control: five functions, hundreds of characters)', src.length > 500 && src.split('\n').length >= 5, src.length + ' chars');
  ok('DMath calls no native transcendental -- only sqrt, floor and PI', !/Math\.(sin|cos|tan|atan|atan2|hypot|pow|exp|log|expm1|log1p|cbrt|asin|acos|sinh|cosh)\b/.test(src) && /Math\.sqrt/.test(src) && /Math\.floor/.test(src));
}

// 3. the simulation uses it
{
  let native = [], calls = 0;
  for (const f of ['map', 'sim', 'game', 'combat', 'abilities', 'ai', 'missions']) {
    const lines = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8').split(/\r?\n/);
    // (?<![A-Za-z]) so that DMath.sin is not read as Math.sin
    lines.forEach((line, i) => { if (/^\s*\/\//.test(line)) return; if (/(?<![A-Za-z])Math\.(sin|cos|atan2|hypot)\(/.test(line)) native.push(f + '.js:' + (i + 1)); calls += (line.match(/DMath\.(sin|cos|atan2|hypot)\(/g) || []).length; });
  }
  ok('no stamped simulation file calls Math.sin/cos/atan2/hypot in code', native.length === 0, native.join(', '));
  ok('...and DMath is called at least as often as the review replaced (75: 66 trig and 9 hypot)', calls >= 75, calls + ' calls');
  ok('DMath is stamped (BUILD.SINGLETONS names it)', vm.runInContext('BUILD.SINGLETONS.includes("DMath")', (() => { const c = makeCtx(); vm.runInContext(fs.readFileSync(path.join(root, 'js', 'build.js'), 'utf8'), c); return c; })()));
}

// 4. a game runs on it, deterministically
{
  const hash = c => vm.runInContext(`G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 17, layout: 'temple' }); for (let i = 0; i < 2400; i++) G.tick(); G.stateHash()`, c);
  const a = hash(makeCtx()), b = hash(makeCtx());
  ok('two contexts reach the same hash after 2,400 frames', a === b && typeof a === 'number', a + ' vs ' + b);
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
