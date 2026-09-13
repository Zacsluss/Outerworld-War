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

// mkDom(indexHtmlText) -> a document built from index.html's <body>: every element with an id (and the settings tabs' data-
// attributes) is an element, and an element's innerHTML is parsed on demand, so querySelector('[data-kick]'), .value, .onchange
// and .click() behave as the menus need them to. Moved here verbatim from test/menus.js (ninth session) for test/starts.js.
function mkDom(text) {
  const document = { activeElement: undefined };
  const statics = [];
  const parseAttrs = s => { const a = {}; const re = /([\w-]+)(?:="([^"]*)")?/g; let m; while ((m = re.exec(s || ''))) a[m[1]] = m[2] === undefined ? '' : m[2]; return a; };
  const tagsOf = t => { const out = []; const re = /<([a-zA-Z][\w-]*)(\s[^<>]*?)?\s*\/?>/g; let m; while ((m = re.exec(t))) out.push({ tag: m[1].toLowerCase(), attrs: parseAttrs(m[2]), index: m.index, end: re.lastIndex }); return out; };
  const matches = (t, sel) => {
    if (sel[0] === '#') return t.attrs.id === sel.slice(1);
    if (sel[0] === '.') return String(t.attrs.class || '').split(/\s+/).includes(sel.slice(1));
    if (sel[0] === '[') {   // one attribute or several: [data-slot="-2"][data-field="race"]
      const parts = sel.match(/\[[^\]]+\]/g) || [];
      return parts.join('') === sel && parts.every(part => { const am = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part); return !!am && am[1] in t.attrs && (am[2] === undefined || t.attrs[am[1]] === am[2]); });
    }
    return t.tag === sel.toLowerCase();
  };
  const lastPart = sel => sel.trim().split(/\s+/).pop();
  const decode = s => s.replace(/&mdash;/g, '—').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  function mkEl(tag, attrs, inner) {
    const listeners = {};
    const el = {
      tagName: tag.toUpperCase(), id: attrs.id || '', attrs, style: {}, dataset: {}, kids: [], _html: '', _cache: null,
      value: attrs.value || '', checked: 'checked' in attrs, disabled: 'disabled' in attrs, placeholder: attrs.placeholder || '', textContent: inner || '', title: attrs.title || '',
      classList: { set: new Set(String(attrs.class || '').split(/\s+/).filter(Boolean)), toggle(c, on) { if (on === undefined ? !this.set.has(c) : on) this.set.add(c); else this.set.delete(c); }, contains(c) { return this.set.has(c); }, add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); } },
      get className() { return [...this.classList.set].join(' '); }, set className(v) { this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean)); },
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
      removeEventListener(t, fn) { const l = listeners[t] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
      fire(t, extra) { const ev = Object.assign({ type: t, target: el, preventDefault() { }, stopPropagation() { } }, extra || {}); for (const fn of (listeners[t] || []).slice()) fn(ev); if (typeof el['on' + t] === 'function') el['on' + t](ev); },
      click() { el.fire('click'); },
      focus() { document.activeElement = el; },
      appendChild(c) { el.kids.push(c); return c; },
      get innerHTML() { return el._html; }, set innerHTML(v) { el._html = String(v); el.kids = []; el._cache = null; },
      querySelectorAll(sel) {
        const part = lastPart(sel);
        if (el._html) {
          if (!el._cache) el._cache = new Map();
          return tagsOf(el._html).filter(t => matches(t, part)).map(t => {
            if (!el._cache.has(t.index)) { const close = el._html.indexOf('<', t.end); el._cache.set(t.index, mkEl(t.tag, t.attrs, close > t.end ? decode(el._html.slice(t.end, close)) : '')); }
            return el._cache.get(t.index);
          });
        }
        return statics.filter(e => e !== el && matches({ tag: e.tagName.toLowerCase(), attrs: Object.assign({}, e.attrs, { class: e.className }) }, part));
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      getContext() { return null; },
    };
    if (/display:\s*none/.test(attrs.style || '')) el.style.display = 'none';
    for (const k of Object.keys(attrs)) if (k.startsWith('data-')) el.dataset[k.slice(5).replace(/-(\w)/g, (m, ch) => ch.toUpperCase())] = attrs[k];
    return el;
  }
  const body = text.slice(text.indexOf('<body>'));
  for (const t of tagsOf(body)) if (t.attrs.id || 'data-tab' in t.attrs || 'data-body' in t.attrs || 'data-keys' in t.attrs) { const close = body.indexOf('<', t.end); statics.push(mkEl(t.tag, t.attrs, close > t.end ? body.slice(t.end, close) : '')); }
  document.getElementById = id => statics.find(e => e.id === id) || null;
  document.querySelectorAll = sel => statics.filter(e => matches({ tag: e.tagName.toLowerCase(), attrs: Object.assign({}, e.attrs, { class: e.className }) }, lastPart(sel)));
  document.createElement = tag => mkEl(tag, {});
  document.addEventListener = () => { };
  document.hasFocus = () => true;
  document.body = { appendChild() { } };
  return document;
}

module.exports = { SIM, COLLECT, makeCtx, load, makeOk, ok, okMC, counts, summary, root, mkDom };
