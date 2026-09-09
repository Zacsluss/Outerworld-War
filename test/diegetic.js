// The diegetic console (M11 wave one, idea 15): a HUD that belongs to the commander, takes damage and
// glitches.
//
//   node test/diegetic.js
//
// "Does it look like cracked steel" is not a thing a test can answer, so this file asserts the six
// things around the look that CAN fail silently -- and five of the six have a matching precedent in
// this repository's own history:
//
//  1. THE THREE MACHINES ARE THREE MACHINES. The whole claim of the feature is that a Zerg console is
//     not a Terran console in purple. Each race's texture is baked against a recording canvas and the
//     op histograms and colour palettes are required to be pairwise different, plus one named cue per
//     race (the phosphor, the bioluminescence, the slab gaps) so that quietly deleting a race's chrome
//     fails rather than passing on "well, the numbers still differ".
//
//  2. CONDITION IS DERIVED AND NOT STORED. The one that would have bitten. A renderer that keeps a
//     decaying damage counter looks perfect until somebody drags the replay scrubber, and this repo
//     has already lost two milestones to exactly that shape of bug (M9's snapshot resource indices).
//     So: the same game run twice yields the same condition frame for frame, and a snapshot restored
//     over a wrecked base yields the condition of the moment it was TAKEN, not of the moment before
//     the restore.
//
//  3. THE GLITCH IS A PURE FUNCTION OF THE FRAME. No Math.random anywhere, checked both by running it
//     and by reading the file, because a replay that tears in different places is a replay that does
//     not reproduce.
//
//  4. IT COSTS DRAW CALLS, AND A BOUNDED NUMBER OF THEM. M9's measurement is that this renderer is
//     bound by call count and not by pixels, so the budget here is calls: a full-strength glitch on a
//     4K console has to stay in the low teens, and an intact console has to cost exactly zero.
//
//  5. THE CACHE IS BOUNDED. HUD.panel already had a size cap and this change added a dimension to its
//     key. Every race, every bucket, every plausible size, hammered, with the cap asserted throughout.
//
//  6. IT NEVER WRITES TO THE SIMULATION, AND THE BUILD STAMP DOES NOT MOVE. Invariants 3 and 6.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined ? '  ' + x : '')); } };
const n2 = v => Math.round(v * 1000) / 1000;

// ============================================================================
// 0. A canvas that remembers what it was told to draw, and in what colour
// ============================================================================
// The colour matters here in a way it did not in test/renderfeel.js: the claim under test is about
// what the three consoles are MADE of, and most of that lives in a fill style rather than in an op
// name. Gradients record their stops, because the amber phosphor and the bioluminescent nodes are
// both radial gradients and would otherwise read as an anonymous "gradient".
const DRAWS = new Set(['drawImage', 'fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'putImageData', 'clearRect']);
function recorder() { return { ops: [], on: false, calls: 0, reset() { this.ops.length = 0; this.calls = 0; } }; }
function mkCtx(cv, rec) {
  const mkGrad = () => ({ stops: [], addColorStop(o, col) { this.stops.push(String(col)); } });
  const style = v => (v && typeof v === 'object' && v.stops) ? 'grad(' + v.stops.join(',') + ')' : String(v);
  const c = {
    canvas: cv, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    globalAlpha: 1, globalCompositeOperation: 'source-over', font: '10px sans-serif', filter: 'none',
    imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: '#000', textAlign: 'start', textBaseline: 'alphabetic',
    miterLimit: 10, lineDashOffset: 0,
    createLinearGradient: mkGrad, createRadialGradient: mkGrad, createConicGradient: mkGrad,
    createPattern: () => ({ setTransform() { } }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    measureText: t => ({ width: String(t).length * 6 }),
    isPointInPath: () => false, getLineDash: () => [], setLineDash() { }, toDataURL: () => '',
  };
  for (const k of ['save', 'restore', 'setTransform', 'resetTransform', 'transform', 'translate', 'rotate', 'scale',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'quadraticCurveTo', 'bezierCurveTo',
    'clip', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'fillText', 'strokeText', 'putImageData']) {
    c[k] = function (...a) {
      if (!rec.on) return;
      if (DRAWS.has(k)) rec.calls++;
      rec.ops.push({ op: k, a, fs: style(c.fillStyle), ss: style(c.strokeStyle), src: k === 'drawImage' ? a[0] : null });
    };
  }
  return c;
}
function mkCanvas(rec) {
  const cv = { width: 300, height: 150, style: {}, _ctx: null, isCanvas: true };
  cv.getContext = () => cv._ctx || (cv._ctx = mkCtx(cv, rec));
  cv.addEventListener = () => { }; cv.appendChild = () => { }; cv.remove = () => { }; cv.click = () => { }; cv.value = '';
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: cv.width, height: cv.height });
  cv.toDataURL = () => '';
  return cv;
}

// Everything index.html loads except the baked atlas, so the sprite painters run in their vector
// fallback -- the path that has to work when the PNGs are missing anyway.
const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot', 'net',
  'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud', 'codex'];
const VIEW_W = 1600, VIEW_H = 900;

const errors = [];
const rec = recorder();
const ctx = {
  console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0] && a[0].message || a[0])) },
  Math, performance, setTimeout, clearTimeout, clearInterval, setInterval() { return 0; },
  addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  devicePixelRatio: 1, innerWidth: VIEW_W, innerHeight: VIEW_H,
  localStorage: { getItem() { return null; }, setItem() { } },
  location: { protocol: 'http:', host: 'localhost' },
  document: {
    getElementById: () => mkCanvas(rec), createElement: () => mkCanvas(rec),
    addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [],
  },
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
ctx._rec = rec;
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const R = src => vm.runInContext('(() => {' + src + '})()', ctx);

// A real game with a real canvas under it, sized like a window rather than like a stub, so the tear
// below has something to read back out of.
R(`
  UI.start({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 4, layout: 'temple' });
  UI.menu = null;
  Render.init(document.getElementById('game'));
`);

// ============================================================================
// 1. The entry points exist and say what they are
// ============================================================================
const api = R(`
  const t = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v]));
  return { fns: t({ condition: HUD.condition, wear: HUD.wear, wearBucket: HUD.wearBucket, bucketWear: HUD.bucketWear,
                    noise: HUD.noise, glitch: HUD.glitch, glitchDraw: HUD.glitchDraw, chrome: HUD.chrome,
                    wearLayer: HUD.wearLayer, pGaps: HUD.pGaps, slice: HUD.slice, fxTile: HUD.fxTile,
                    chromeT: HUD.chromeT, chromeZ: HUD.chromeZ, chromeP: HUD.chromeP,
                    wearT: HUD.wearT, wearZ: HUD.wearZ, wearP: HUD.wearP,
                    glitchT: HUD.glitchT, glitchZ: HUD.glitchZ, glitchP: HUD.glitchP }),
           buckets: HUD.WEAR_BUCKETS,
           words: HUD.INTEGRITY,
           shape: Object.keys(HUD.condition()).sort().join(',') };
`);
ok(Object.values(api.fns).every(v => v === 'function'), 'every diegetic entry point is on HUD', JSON.stringify(Object.entries(api.fns).filter(([, v]) => v !== 'function')));
ok(api.buckets === 5, 'the condition is quantised into five buckets', String(api.buckets));
ok(new Set(Object.values(api.words)).size >= 3, 'each race calls the failing thing by its own name', JSON.stringify(api.words));
ok(/\bbase\b/.test(api.shape) && /\battrition\b/.test(api.shape) && /\bshock\b/.test(api.shape) && /\bbucket\b/.test(api.shape),
  'condition() reports its parts and not just a number', api.shape);

// ============================================================================
// 2. Three machines, not one machine in three colours
// ============================================================================
// Each race's texture baked at the same size and the same (pristine) condition, recorded op by op.
const chrome = R(`
  const out = {};
  HUD.wearOverride = 0;
  for (const race of ['T', 'Z', 'P']) {
    HUD.skinOverride = race; HUD._panels.clear();
    _rec.reset(); _rec.on = true;
    HUD.panel(960, 220, true);
    _rec.on = false;
    const hist = {}, cols = new Set();
    for (const o of _rec.ops) { hist[o.op] = (hist[o.op] || 0) + 1; cols.add(o.fs); cols.add(o.ss); }
    out[race] = { hist, cols: [...cols], calls: _rec.calls, ops: _rec.ops.length };
  }
  HUD.skinOverride = null; HUD.wearOverride = null; HUD._panels.clear();
  return out;
`);
{
  const sig = r => JSON.stringify(chrome[r].hist);
  const pairs = [['T', 'Z'], ['T', 'P'], ['Z', 'P']];
  ok(pairs.every(([a, b]) => sig(a) !== sig(b)), 'no two races bake the same sequence of operations',
    JSON.stringify(pairs.map(([a, b]) => [a, b, sig(a) === sig(b)])));
  const share = ([a, b]) => { const A = new Set(chrome[a].cols), B = new Set(chrome[b].cols); let both = 0; for (const c of A) if (B.has(c)) both++; return both / (A.size + B.size - both); };
  const worst = Math.max(...pairs.map(share));
  ok(worst < 0.35, 'and no two share more than a third of their palette (worst overlap ' + Math.round(worst * 100) + '%)',
    JSON.stringify(pairs.map(p => [p.join('/'), Math.round(share(p) * 100) + '%'])));
  const has = (race, needle) => chrome[race].cols.some(c => c.indexOf(needle) >= 0);
  ok(chrome.T.hist.fillRect >= 60 && has('T', '226,164,58'), 'Terran is a cathode tube: scanlines and amber phosphor',
    'fillRect=' + chrome.T.hist.fillRect + ' phosphor=' + has('T', '226,164,58'));
  ok((chrome.Z.hist.ellipse || 0) >= 60 && has('Z', '180,255,170'), 'Zerg is a living thing: chitin cells and bioluminescence',
    'ellipse=' + chrome.Z.hist.ellipse + ' biolum=' + has('Z', '180,255,170'));
  ok(has('P', '4,6,10') && (chrome.P.hist.fillRect || 0) >= 20, 'Protoss is a row of separate slabs with lit voids between them',
    'voids=' + has('P', '4,6,10') + ' fillRect=' + chrome.P.hist.fillRect);
  ok(['T', 'Z', 'P'].every(r => chrome[r].ops > 150), 'all three textures are substantial (' + ['T', 'Z', 'P'].map(r => r + ':' + chrome[r].ops).join(' ') + ')');
}

// The damage is in the same bake, so a wrecked console costs the same per frame as a pristine one --
// and bucket 0 must paint nothing at all, so an undamaged game looks exactly as it did before.
const wearBake = R(`
  const out = {};
  for (const race of ['T', 'Z', 'P']) {
    HUD.skinOverride = race; out[race] = {};
    for (const k of [0, 4]) {
      HUD._panels.clear();
      _rec.reset(); _rec.on = true; HUD.panel(960, 220, true, k); _rec.on = false;
      const cols = new Set(); for (const o of _rec.ops) { cols.add(o.fs); cols.add(o.ss); }
      out[race][k] = { ops: _rec.ops.length, cols: [...cols] };
    }
  }
  HUD.skinOverride = null; HUD._panels.clear();
  return out;
`);
{
  const rust = r => wearBake[r][4].cols.some(c => /158,74,26|150,20,40|4,8,14/.test(c));
  const clean = r => !wearBake[r][0].cols.some(c => /158,74,26|150,20,40|96,104,72/.test(c));
  ok(['T', 'Z', 'P'].every(r => wearBake[r][4].ops > wearBake[r][0].ops + 20),
    'a wrecked console is a busier texture than an intact one', JSON.stringify(['T', 'Z', 'P'].map(r => r + ' ' + wearBake[r][0].ops + '->' + wearBake[r][4].ops)));
  ok(['T', 'Z', 'P'].every(rust), 'and each race is damaged in its own material: rust, necrosis, fracture',
    JSON.stringify(['T', 'Z', 'P'].map(r => [r, rust(r)])));
  ok(['T', 'Z', 'P'].every(clean), 'bucket 0 paints no damage at all, so an intact console is unchanged',
    JSON.stringify(['T', 'Z', 'P'].map(r => [r, clean(r)])));
}

// ============================================================================
// 3. Condition tracks the simulation, and each term is monotone in its own damage
// ============================================================================
// Global monotonicity is deliberately not claimed -- js/hud.js says why -- so the two halves are
// swept separately, which is the claim that is actually true and actually worth pinning.
const fresh = R(`
  UI.start({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 4, layout: 'temple' });
  UI.menu = null;
  const c = HUD.condition();
  return { v: c.v, wear: c.wear, bucket: c.bucket, base: c.base, attrition: c.attrition, shock: c.shock };
`);
ok(fresh.v > 0.99 && fresh.bucket === 0, 'a console at the start of a game is pristine', JSON.stringify(fresh));

// NOTHING BELOW EVER CLEARS THE MEMO BY HAND. The first draft of this file did, before every read,
// and that made the negative control -- replace the memo key with "return whatever you computed
// first" -- pass all fifty-three checks. The frame is advanced instead, which is what a game does.
const burn = R(`
  const blds = G.units.filter(u => u.alive && u.owner === 0 && u.isBuilding);
  const full = blds.map(u => u.maxHp);
  const rows = [];
  for (let step = 0; step <= 10; step++) {
    blds.forEach((u, i) => { u.hp = Math.max(1, full[i] * (1 - step / 11)); });
    G.frame++;
    const c = HUD.condition();
    rows.push({ step, wear: +c.wear.toFixed(6), base: +c.base.toFixed(6), bucket: c.bucket });
  }
  blds.forEach((u, i) => { u.hp = full[i]; }); G.frame++;
  return { rows, blds: blds.length, back: HUD.condition().wear };
`);
{
  const w = burn.rows.map(r => r.wear);
  ok(burn.rows.every((r, i) => i === 0 || r.wear >= burn.rows[i - 1].wear - 1e-9), 'burning the base down never makes the console healthier',
    JSON.stringify(w.map(n2)));
  ok(w[w.length - 1] > w[0] + 0.25, 'and a base at 10% is a visibly worse console than a base at 100% (' + n2(w[0]) + ' -> ' + n2(w[w.length - 1]) + ')');
  ok(burn.rows[burn.rows.length - 1].bucket > burn.rows[0].bucket, 'which moves it into a different bake bucket', JSON.stringify(burn.rows.map(r => r.bucket)));
  ok(Math.abs(burn.back) < 1e-9, 'repairing it all the way back returns the console to pristine', String(burn.back));
}

const attrit = R(`
  const p = G.players[0];
  const rows = [];
  G.frame++; rows.push({ lost: 0, wear: +HUD.condition().wear.toFixed(6) });
  for (let step = 1; step <= 8; step++) {
    p.stats.unitsLost += 6; G.frame++;
    rows.push({ lost: p.stats.unitsLost, wear: +HUD.condition().wear.toFixed(6) });
  }
  const before = HUD.condition().wear;
  p.stats.buildingsLost += 1; G.frame++;
  const afterB = HUD.condition().wear;
  p.stats.unitsLost = 0; p.stats.buildingsLost = 0; G.frame++;
  return { rows, before: +before.toFixed(6), afterB: +afterB.toFixed(6), reset: +HUD.condition().wear.toFixed(6) };
`);
ok(attrit.rows.every((r, i) => i === 0 || r.wear >= attrit.rows[i - 1].wear - 1e-9), 'losing units never makes the console healthier',
  JSON.stringify(attrit.rows.map(r => n2(r.wear))));
ok(attrit.rows[attrit.rows.length - 1].wear > attrit.rows[0].wear + 0.1, 'forty-eight dead is a measurably worse console (' + n2(attrit.rows[0].wear) + ' -> ' + n2(attrit.rows[attrit.rows.length - 1].wear) + ')');
ok(attrit.afterB > attrit.before, 'and losing one structure weighs more than losing one unit', attrit.before + ' -> ' + attrit.afterB);

// The discrete events: a nuke tears harder than a raid, and both fade.
const events = R(`
  const p = G.players[0];
  G.frame = 5000;
  // Each probe on its own frame, with the alert aged backwards from it, so the memo is exercised
  // rather than bypassed.
  const at = (age, kind) => { G.frame++; p.msgs = [{ text: 'x', t: G.frame - age, kind }]; return HUD.condition().event; };
  const fresh = at(0, 'nuke'), half = at(Math.floor(HUD.EVENT_WINDOW / 2), 'nuke'), stale = at(HUD.EVENT_WINDOW + 10, 'nuke');
  const raid = at(0, 'attack'), noise = at(0, 'error');
  G.frame++; p.msgs = [];
  // and a loss the reaper has not swept up yet, which is the sim's own record of "you just lost that"
  const before = HUD.condition().event;
  const dead = G.units.filter(u => u.alive && u.owner === 0 && !u.isBuilding).slice(0, 3);
  for (const u of dead) u.alive = false;
  G.frame++; const after = HUD.condition();
  for (const u of dead) u.alive = true; G.frame++;
  return { fresh, half, stale, raid, noise, before, afterEv: after.event, lost: after.lost };
`);
ok(events.fresh === 1 && events.stale === 0, 'a nuke punches in at full strength and has faded to nothing three seconds later', JSON.stringify(events));
ok(events.half > 0.4 && events.half < 0.6, 'and decays linearly in between (' + n2(events.half) + ' at half the window)');
ok(events.raid > 0 && events.raid < events.fresh, 'a raid tears less than a nuke (' + n2(events.raid) + ' vs ' + n2(events.fresh) + ')');
ok(events.noise === 0, '"not enough minerals" is not a shock and does not glitch the display', String(events.noise));
ok(events.before === 0 && events.lost === 3 && events.afterEv > 0.5,
  'units killed inside the last second are read straight out of G.units, before the reaper takes them', JSON.stringify(events));

// ============================================================================
// 4. Derived, not stored: the same game twice, and a snapshot over a wrecked base
// ============================================================================
// This is the check the whole design is shaped around. A stored, ticked condition passes everything
// above and fails both of these.
const twice = R(`
  const run = () => {
    UI.start({ players: [{ race: 'T', human: true, name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 17, layout: 'temple' });
    UI.menu = null;
    const seq = [];
    for (let f = 0; f < 400; f++) { G.tick(); const c = HUD.condition(); seq.push([+c.wear.toFixed(9), c.bucket, +c.event.toFixed(9)]); }
    return seq;
  };
  const a = run(), b = run();
  let firstDiff = -1;
  for (let i = 0; i < a.length; i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { firstDiff = i; break; }
  return { n: a.length, firstDiff, sample: a[399], moved: a.some(r => r[0] !== a[0][0]) };
`);
ok(twice.firstDiff === -1, 'the same game played twice gives the same console at every one of ' + twice.n + ' frames',
  'first divergence at frame ' + twice.firstDiff);

const seek = R(`
  UI.start({ players: [{ race: 'P', human: true, name: 'A', team: 1 }, { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 21, layout: 'temple' });
  UI.menu = null;
  for (let f = 0; f < 120; f++) G.tick();
  // wreck the place, through the simulation's own doors
  const mine = G.units.filter(u => u.alive && u.owner === 0);
  for (const u of mine) if (u.isBuilding) u.hp = u.maxHp * 0.3;
  G.players[0].stats.unitsLost = 24; G.players[0].stats.buildingsLost = 3;
  for (let f = 0; f < 6; f++) G.tick();
  const wrecked = HUD.condition();
  const snap = Snapshot.take();
  // ...then heal everything and lose the counters, which is the state a naive stored condition would
  // still be showing after the restore below
  for (const u of G.units) if (u.alive && u.owner === 0) u.hp = u.maxHp;
  G.players[0].stats.unitsLost = 0; G.players[0].stats.buildingsLost = 0;
  for (let f = 0; f < 30; f++) G.tick();
  const healed = HUD.condition();
  Snapshot.restore(snap);
  const back = HUD.condition();
  const k = c => [+c.wear.toFixed(9), c.bucket, +c.base.toFixed(9), +c.attrition.toFixed(9)];
  return { wrecked: k(wrecked), healed: k(healed), back: k(back), frame: G.frame };
`);
ok(JSON.stringify(seek.wrecked) !== JSON.stringify(seek.healed), 'healing the base really does change the console', JSON.stringify(seek));
ok(JSON.stringify(seek.back) === JSON.stringify(seek.wrecked),
  'and a restored snapshot restores the console with it, exactly', JSON.stringify({ want: seek.wrecked, got: seek.back }));

// ============================================================================
// 5. The glitch is a pure function of the frame
// ============================================================================
const pure = R(`
  const keys = g => [g.i, g.bands, g.roll, g.hiss, g.seed].map(v => +Number(v).toFixed(9)).join('|');
  // forwards, backwards, and interleaved with other wear values: same frame, same answer
  const fwd = {}, back = {};
  for (let f = 0; f < 1500; f++) fwd[f] = keys(HUD.glitch(f, 0.7, 0));
  for (let f = 1499; f >= 0; f--) { HUD.glitch(f, 0.1, 0.9); back[f] = keys(HUD.glitch(f, 0.7, 0)); }
  let diff = 0; for (let f = 0; f < 1500; f++) if (fwd[f] !== back[f]) diff++;
  // how often it fires, at rest and at ruin
  const rate = w => { let on = 0; for (let f = 0; f < 6000; f++) if (HUD.glitch(f, w, 0).i > 0.03) on++; return on / 6000; };
  // the noise itself: uniform enough to be noise, and always in range
  let lo = 1, hi = 0, sum = 0, bad = 0;
  for (let i = 0; i < 20000; i++) { const v = HUD.noise(i, i % 7); if (!(v >= 0 && v < 1)) bad++; lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; }
  return { diff, rest: rate(0), mid: rate(0.5), ruin: rate(1), bad, lo: +lo.toFixed(4), hi: +hi.toFixed(4), mean: +(sum / 20000).toFixed(4),
           evOverridesCalm: HUD.glitch(1234, 0, 1).i, calm: HUD.glitch(1234, 0, 0).i };
`);
ok(pure.diff === 0, 'fifteen hundred frames give the same glitch whichever order they are asked in', String(pure.diff));
ok(pure.bad === 0 && pure.lo < 0.001 && pure.hi > 0.999 && Math.abs(pure.mean - 0.5) < 0.02,
  'the noise is uniform on [0,1) over twenty thousand samples (mean ' + pure.mean + ')', JSON.stringify(pure));
ok(pure.rest < pure.mid && pure.mid < pure.ruin, 'a healthier console glitches less often (' + [pure.rest, pure.mid, pure.ruin].map(v => Math.round(v * 100) + '%').join(' -> ') + ')');
ok(pure.rest === 0, 'and an intact one never tears on its own at all -- only an event can do that', String(pure.rest));
ok(pure.calm === 0 && pure.evOverridesCalm === 1, 'a nuke tears a pristine console anyway, which is what makes it an event', JSON.stringify([pure.calm, pure.evOverridesCalm]));

// The static half of the same claim.
{
  // Line endings normalised FIRST, the same way BUILD.src does it and for the same reason: this repo
  // is checked out CRLF, `.` in a JavaScript regex does not match `\r`, and so `//.*$` silently strips
  // nothing at all. That failure is invisible -- the check just stops checking -- which is why it is
  // written down here rather than quietly fixed.
  const src = fs.readFileSync(path.join(root, 'js', 'hud.js'), 'utf8').split('\r\n').join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  ok(!/Math\s*\.\s*random/.test(src), 'js/hud.js contains no call to Math.random outside its comments');
  ok(!/\bG\.[A-Za-z_$][\w$]*\s*=[^=]/.test(src) && !/\bG\.[A-Za-z_$][\w$]*\s*(\+\+|--)/.test(src),
    'and no assignment to anything on G', (src.match(/\bG\.[A-Za-z_$][\w$]*\s*=[^=]/g) || []).join(' | '));
  ok(!/\b(Date|performance)\s*\.\s*now\s*\(\s*\)[^]{0,40}(glitch|wear|condition)/.test(src),
    'and the glitch is not timed off the wall clock');
}

// ============================================================================
// 6. What it costs, in draw calls
// ============================================================================
const cost = R(`
  const out = {};
  const c = Render.ctx;
  Render.W = 3840; Render.H = 2160; Render.dpr = 1;
  Render.canvas.width = 3840; Render.canvas.height = 2160;
  // Warm the effect tiles before counting. They are baked once for the life of the process (section 7
  // pins that), so charging their ninety ellipses to whichever frame happened to be first would be
  // measuring the cache being filled rather than the pass being drawn -- and it did, at 99 calls.
  HUD.fxTile('pulse'); HUD.fxTile('fleck');
  for (const race of ['T', 'Z', 'P']) {
    HUD.skinOverride = race;
    let worst = 0, worstFrame = -1, total = 0, drewFrom = 0, blits = 0;
    HUD.wearOverride = 1;
    for (let f = 0; f < 600; f++) {
      G.frame = f;
      _rec.reset(); _rec.on = true;
      const said = HUD.glitchDraw(c, 0, 1940, 3840, 220);
      _rec.on = false;
      total += _rec.calls;
      if (_rec.calls > worst) { worst = _rec.calls; worstFrame = f; }
      if (said !== _rec.calls) out.mismatch = (out.mismatch || 0) + 1;
      for (const o of _rec.ops) if (o.op === 'drawImage') { blits++; if (o.src === Render.canvas) drewFrom++; }
    }
    // and at rest: only the frames the glitch itself calls its own may cost anything
    HUD.wearOverride = 0;
    let quiet = 0, quietFrames = 0;
    for (let f = 0; f < 600; f++) {
      G.frame = f;
      _rec.reset(); _rec.on = true; HUD.glitchDraw(c, 0, 1940, 3840, 220); _rec.on = false;
      quiet += _rec.calls; if (_rec.calls === 0) quietFrames++;
    }
    out[race] = { worst, worstFrame, mean: +(total / 600).toFixed(2), blits, drewFrom, quiet, quietFrames };
  }
  HUD.skinOverride = null; HUD.wearOverride = null;
  Render.W = ${VIEW_W}; Render.H = ${VIEW_H}; Render.canvas.width = ${VIEW_W}; Render.canvas.height = ${VIEW_H};
  return out;
`);
{
  const races = ['T', 'Z', 'P'];
  ok(!cost.mismatch, 'glitchDraw reports the number of calls it actually made', String(cost.mismatch));
  ok(races.every(r => cost[r].worst > 0), 'a wrecked console really does tear (' + races.map(r => r + ':' + cost[r].worst).join(' ') + ')');
  ok(races.every(r => cost[r].worst <= 16), 'and the worst frame on a 4K console is at most sixteen draw calls, whatever the race',
    JSON.stringify(races.map(r => [r, cost[r].worst, 'frame ' + cost[r].worstFrame])));
  ok(races.every(r => cost[r].drewFrom > 0), 'the tear reads back out of the frame it is tearing, rather than laying noise over it',
    JSON.stringify(races.map(r => [r, cost[r].drewFrom + '/' + cost[r].blits])));
  ok(races.every(r => cost[r].quiet === 0 && cost[r].quietFrames === 600), 'and an intact console costs exactly zero draw calls, on all 600 frames',
    JSON.stringify(races.map(r => [r, cost[r].quietFrames, cost[r].quiet])));
}

// ============================================================================
// 7. The cache stays small
// ============================================================================
const cache = R(`
  let worstPanels = 0, worstFx = 0;
  const c = document.createElement('canvas').getContext('2d');
  for (let round = 0; round < 3; round++)
    for (const race of ['T', 'Z', 'P'])
      for (let k = 0; k < HUD.WEAR_BUCKETS; k++)
        for (const [w, h] of [[900, 120], [1280, 160], [1920, 220], [3840, 300], [440, 300]]) {
          HUD.skinOverride = race; HUD.wearOverride = k / (HUD.WEAR_BUCKETS - 1);
          HUD.frame(c, 0, 0, w, h);
          worstPanels = Math.max(worstPanels, HUD._panels.size);
          worstFx = Math.max(worstFx, HUD._fx ? HUD._fx.size : 0);
        }
  // ...and the same request twice really is one bake
  HUD.skinOverride = 'Z'; HUD.wearOverride = 0.5;
  const a = HUD.panel(900, 120, true), b = HUD.panel(900, 120, true);
  const diffBucket = HUD.panel(900, 120, true, 0);
  HUD.skinOverride = null; HUD.wearOverride = null; HUD._panels.clear();
  return { worstPanels, worstFx, same: a === b, bucketed: a !== diffBucket };
`);
ok(cache.worstPanels <= 21, '225 panel requests across every race, bucket and size leave at most 21 textures cached', String(cache.worstPanels));
ok(cache.worstFx <= 2, 'and the effect tiles are two canvases, baked once for the life of the process', String(cache.worstFx));
ok(cache.same, 'the same panel asked for twice is one bake');
ok(cache.bucketed, 'and two conditions are two textures, which is what makes the damage free per frame');

// ============================================================================
// 8. Nothing throws, anywhere on the dial
// ============================================================================
const robust = R(`
  const out = { thrown: [], drawn: 0 };
  const c = Render.ctx;
  for (const race of ['T', 'Z', 'P']) {
    UI.start({ players: [{ race, human: true, name: 'A', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 8, layout: 'temple' });
    UI.menu = null;
    for (let f = 0; f < 40; f++) G.tick();
    for (const wv of [0, 0.001, 0.25, 0.5, 0.75, 0.999, 1]) {
      HUD.wearOverride = wv;
      for (const [w, h] of [[800, 600], [1280, 720], [1920, 1080], [3840, 2160], [640, 400]]) {
        Render.W = w; Render.H = h; Render.viewW = w; Render.viewH = h - UI.consoleH;
        Render.canvas.width = w; Render.canvas.height = h;
        for (const sel of [[], G.units.filter(u => u.alive && u.owner === 0).slice(0, 1), G.units.filter(u => u.alive && u.owner === 0).slice(0, 9)]) {
          UI.selection = sel;
          try { UI.drawConsole(); UI.drawTop(); UI.drawMessages(); out.drawn++; }
          catch (e) { out.thrown.push(race + '/' + wv + '/' + w + 'x' + h + '/' + sel.length + ': ' + (e && e.message)); }
        }
      }
    }
  }
  // ...and with a console so short the command card is squeezed, plus no game at all
  HUD.wearOverride = null;
  try { const savedP = G.players; G.players = []; HUD.condition(); HUD.glitch(); HUD.frame(c, 0, 0, 300, 100); G.players = savedP; }
  catch (e) { out.thrown.push('no game: ' + (e && e.message)); }
  try { HUD.glitchDraw({ canvas: null }, 0, 0, 100, 100); HUD.glitchDraw(c, 0, 0, 0, 0); }
  catch (e) { out.thrown.push('degenerate ctx: ' + (e && e.message)); }
  UI.selection = [];
  Render.W = ${VIEW_W}; Render.H = ${VIEW_H}; Render.canvas.width = ${VIEW_W}; Render.canvas.height = ${VIEW_H};
  return out;
`);
ok(robust.thrown.length === 0, 'the console draws at every condition, race, size and selection (' + robust.drawn + ' of them)', robust.thrown.slice(0, 4).join(' | '));

// ============================================================================
// 9. The renderer never writes to the simulation
// ============================================================================
const purity = R(`
  UI.start({ players: [{ race: 'Z', human: true, name: 'A', team: 1 }, { race: 'P', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 33, layout: 'temple' });
  UI.menu = null;
  for (let f = 0; f < 240; f++) G.tick();
  const before = G.stateHash(), frame = G.frame, units = G.units.length, cmds = G.log.length;
  let threw = null;
  try {
    for (const wv of [0, 0.3, 0.6, 1, null]) { HUD.wearOverride = wv; for (let i = 0; i < 40; i++) { UI.drawConsole(); UI.drawTop(); UI.drawMessages(); } }
  } catch (e) { threw = String(e && e.message || e); }
  HUD.wearOverride = null;
  // Read every "did drawing move it" comparison HERE, before the 200 ticks below. Getting that order
  // wrong reports the ticks as the renderer's doing, which is exactly what the first draft did.
  const still = { hash: G.stateHash() === before, frame: G.frame === frame, units: G.units.length === units, cmds: G.log.length === cmds };
  for (let f = 0; f < 200; f++) G.tick();
  return { before, threw, still, after: G.stateHash() };
`);
const control = R(`
  UI.start({ players: [{ race: 'Z', human: true, name: 'A', team: 1 }, { race: 'P', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 33, layout: 'temple' });
  UI.menu = null;
  for (let f = 0; f < 440; f++) G.tick();
  return { hash: G.stateHash() };
`);
ok(purity.threw === null, 'two hundred drawn frames do not throw', String(purity.threw));
ok(purity.still.hash && purity.still.frame && purity.still.units && purity.still.cmds,
  'and move nothing: same state hash, same frame, same units, no commands', JSON.stringify(purity.still));
ok(purity.after === control.hash, 'a game that was drawn re-simulates to the same state as one that was not',
  purity.after + ' vs ' + control.hash);

// ============================================================================
// 10. The build stamp does not move for a render file
// ============================================================================
// Invariant 6, asserted as the invariant rather than against a hardcoded hash: three agents are
// editing simulation files this milestone and a literal would go stale by lunchtime.
const bare = (() => {
  const c = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval, clearTimeout, clearInterval, Image: function () { }, addEventListener() { }, requestAnimationFrame() { }, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600, document: { getElementById: () => mkCanvas(recorder()), createElement: () => mkCanvas(recorder()), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } } } };
  c.window = c; c.self = c; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'build.js'), 'utf8'), c, { filename: 'build.js' });
  return vm.runInContext('BUILD.hash()', c);
})();
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'build.js'), 'utf8'), ctx, { filename: 'build.js' });
const full = R('return BUILD.hash();');
ok(bare === full, 'the build stamp is the same with the HUD loaded and without: ' + bare, bare + ' vs ' + full);
ok(/^[0-9a-f]{16}$/.test(bare), 'and it is a 16-character hash', bare);
ok(errors.length === 0, 'nothing was logged to the console along the way', errors.slice(0, 3).join(' | '));

console.log(fail ? `\nFAIL  ${pass} passed, ${fail} failed   build ${bare}` : `\nALL PASS  ${pass} passed, 0 failed   build ${bare}`);
process.exit(fail ? 1 : 0);
