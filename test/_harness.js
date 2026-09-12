// The one test harness (REVIEW-M17 task 21). Every suite in this directory used to carry its own copy
// of the same four things: a `document` stub for js/ to load against, `vm.createContext`, the loop
// that reads js/*.js into it, and an `ok` that counts PASS/FAIL and a summary line test/all.js can
// parse. This file is those four things once, with the variations the suites actually used as options,
// so that a migrated suite builds a context with the SAME stub methods and the SAME globals it built
// before -- the point is that no suite's result can move, not that the stub gets better.
//
//   const { makeCtx, ok, summary } = require('./_harness');
//   const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'] });
//   const r = vm.runInContext('...', ctx);
//   ok(r.x === 1, 'x is one', JSON.stringify(r));
//   summary();
//
// makeCtx(options) -> a vm context with js/ loaded into it. Options, every one optional:
//   tier      'sim' (default): console, Math, performance, addEventListener, setTimeout, document,
//                              requestAnimationFrame -- what the simulation files need and nothing more
//             'ui':            the above plus setInterval, Image, localStorage, location, a document
//                              with body/querySelectorAll and elements with click/value/appendChild --
//                              what render.js, ui.js and hud.js need to load
//   files     the js/ files to load, in order (default SIM below); null loads nothing
//   ext       true (default): the file is compiled as 'sim.js'; false: as 'sim'. Only stack traces see it
//   el        'sim' (default) or 'bare': whether document.getElementById's element has getContext
//   errors    an array; console.error pushes into it instead of being silent
//   collect   how console.error's arguments become the pushed string (see COLLECT); default 'first'
//   console   a console object to use as-is (the host's, to see the game's own logging)
//   setInterval  true: add setInterval() { return 0; } to the sim tier (the ui tier always has it)
//   globalThis / self  true: alias the context under that name too (ctx.window is always set)
//   globals   an object merged into the context before it is created (__errors, TPS, sent: [] ...)
// load(ctx, files, { ext })  the loop on its own, for a suite that builds its context some other way
// ok(cond, msg, extra)  counts and prints 'PASS msg' or 'FAIL msg  extra'; the order 53 suites used
// okMC(msg, cond, extra)  the same with the message first, the order the other 24 used
// makeOk(spec)  the exact variant a suite had: { order: 'cm'|'mc', extra: 'truthy'|'nonempty'|'defined',
//               sep, pad, verbose: () => bool, ret }. `ok` is makeOk({}) and `okMC` is makeOk({ order: 'mc' }).
// summary({ nl, word, suffix })  prints the line test/all.js's summarize() parses and exits non-zero on
//               any failure: 'ALL PASS  N passed, 0 failed' or 'FAIL  N passed, M failed'
//               (word: 'FAILURES' for the fourteen suites that said 'FAILURES N passed, M failed';
//               nl: true for the thirty-one that put a blank line first; suffix for a build stamp)
// counts()  { pass, fail } so far, for a suite that reads them mid-way
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');

const SIM = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'];

// The ways the suites turned console.error's arguments into the string they kept. Only a failure
// message ever shows one, but a migrated suite should print the same failure it printed before.
const COLLECT = {
  first: errors => (...a) => errors.push(String(a[0])),
  join: errors => (...a) => errors.push(a.join(' ')),
  stack: errors => (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ')),
  stackline: errors => (...a) => errors.push(a.map(x => x && x.stack ? String(x.stack).split('\n')[0] : String(x)).join(' ')),
  message: errors => (...a) => errors.push(String(a[0] && a[0].message || a[0])),
};

const makeConsole = o => o.console ? o.console
  : o.errors ? { log() { }, warn() { }, error: COLLECT[o.collect || 'first'](o.errors) }
    : { log() { }, warn() { }, error() { } };

function load(ctx, files, o = {}) {
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: o.ext === false ? f : f + '.js' });
}

function makeCtx(o = {}) {
  let ctx;
  if ((o.tier || 'sim') === 'sim') {
    const el = o.el === 'bare' ? () => ({ style: {}, addEventListener() { } }) : () => ({ style: {}, addEventListener() { }, getContext: () => null });
    ctx = { console: makeConsole(o), Math, performance, addEventListener() { }, setTimeout,
      document: { getElementById: el, createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
    if (o.setInterval) ctx.setInterval = function () { return 0; };
  } else if (o.tier === 'ui') {
    ctx = { console: makeConsole(o), Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
      localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
      document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] } };
  } else throw new Error('_harness.makeCtx: unknown tier ' + JSON.stringify(o.tier));
  if (o.globals) Object.assign(ctx, o.globals);
  ctx.window = ctx;
  if (o.globalThis) ctx.globalThis = ctx;
  if (o.self) ctx.self = ctx;
  vm.createContext(ctx);
  if (o.files !== null) load(ctx, o.files || SIM, o);
  return ctx;
}

let pass = 0, fail = 0;
function makeOk(o = {}) {
  const mc = o.order === 'mc';
  const has = o.extra === 'nonempty' ? x => x !== undefined && x !== '' : o.extra === 'defined' ? x => x !== undefined : x => !!x;
  const sep = o.sep === undefined ? '  ' : o.sep, pad = o.pad || '', verbose = o.verbose, ret = !!o.ret;
  return (a, b, x) => {
    const c = mc ? b : a, m = mc ? a : b;
    if (c) { pass++; if (!verbose || verbose()) console.log(pad + 'PASS ' + m); } else { fail++; console.log(pad + 'FAIL ' + m + (has(x) ? sep + x : '')); }
    if (ret) return !!c;
  };
}
const ok = makeOk({}), okMC = makeOk({ order: 'mc' });
const counts = () => ({ pass, fail });
function summary(o = {}) {
  console.log((o.nl ? '\n' : '') + (fail ? (o.word === 'FAILURES' ? 'FAILURES ' : 'FAIL  ') : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed' + (o.suffix || ''));
  process.exit(fail ? 1 : 0);
}

module.exports = { SIM, COLLECT, makeCtx, load, makeOk, ok, okMC, counts, summary, root };
