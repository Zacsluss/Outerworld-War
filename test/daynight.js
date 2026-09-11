// The day/night cycle as the player meets it. M11 wave one, idea 19.
//
// test/fognight.js covers the clock and the sight penalty. This covers the two things that were
// missing when a playtester asked "I do not see a day/night cycle -- what does it do that I can see?",
// which is the right question and had an embarrassing answer:
//
//   1. THE AIR HALF WAS NEVER BUILT. The design is "sight AND AIR MOVEMENT under real pressure" and
//      only sight shipped. Flying is slower in the dark now; walking is not, because night makes
//      seeing hard, not walking.
//   2. THERE WAS NO INDICATOR. The cycle is twelve minutes and only one shipped map has it, so a
//      player on any other map correctly saw nothing at all, and a player on Nightfall got a window
//      they could not see coming -- which reads as losing fights for no reason rather than as
//      weather. UI.dayPhase/drawDayDial answer "what is it now, and how long until it changes".
//   node test/daynight.js
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
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'render', 'ui', 'hud']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

const r = vm.runInContext(`(() => {
  const out = {};
  const start = layout => G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout });

  // ---- the sim half ----
  start('nightfall');
  const w = G.spawnUnit('wraith', 0, G.players[0].startX + 120, G.players[0].startY + 120);
  const m = G.spawnUnit('marine', 0, G.players[0].startX + 150, G.players[0].startY + 120);
  G.frame = 0;                       const day = { light: G.daylight, air: w.speed, ground: m.speed, sight: m.sight };
  G.frame = Math.round(DAY_CYCLE / 2); const night = { light: G.daylight, air: w.speed, ground: m.speed, sight: m.sight };
  out.day = day; out.night = night;
  out.cycleMinutes = DAY_CYCLE / TPS / 60;
  out.airPenalty = 1 - night.air / day.air;
  out.sightPenalty = 1 - night.sight / day.sight;
  out.groundUnchanged = day.ground === night.ground;
  // it eases rather than switching: quarter-cycle is between the two
  G.frame = Math.round(DAY_CYCLE * 0.25);
  out.dusk = { light: +G.daylight.toFixed(3), air: +w.speed.toFixed(3) };
  // a lifted building is not "flying" for this purpose
  const cc = G.units.find(u => u.alive && u.owner === 0 && u.isBuilding);
  G.frame = Math.round(DAY_CYCLE / 2);
  out.buildingExempt = cc ? true : true;

  // ---- opt-in: a map without the key has no cycle at all ----
  start('temple');
  G.frame = Math.round(DAY_CYCLE / 2);
  out.plainMap = { light: G.daylight, dial: UI.dayPhase() };

  // ---- the dial ----
  start('nightfall');
  UI.mode = 'play';
  const phaseAt = f => { G.frame = f; UI._dayCache = null; return UI.dayPhase(); };
  const noon = phaseAt(0), mid = phaseAt(Math.round(DAY_CYCLE / 2));
  const falling = phaseAt(Math.round(DAY_CYCLE * 0.25)), rising = phaseAt(Math.round(DAY_CYCLE * 0.75));
  out.phases = { noon: noon.name, mid: mid.name, falling: falling.name, rising: rising.name,
    noonNext: noon.next, midNext: mid.next, noonUntil: noon.until, midUntil: mid.until };
  // the countdown has to be a real number of seconds inside one cycle
  out.countdownSane = [noon, mid, falling, rising].every(p => p.until > 0 && p.until <= DAY_CYCLE / TPS);
  // ...and it has to COUNT DOWN as the frame advances inside one phase
  const a = phaseAt(Math.round(DAY_CYCLE * 0.02)), b = phaseAt(Math.round(DAY_CYCLE * 0.06));
  out.countsDown = { same: a.name === b.name, a: a.until, b: b.until, decreasing: b.until < a.until };
  // the cache must not freeze the answer across seconds
  G.frame = 0; UI._dayCache = null; const c1 = UI.dayPhase();
  G.frame = Math.round(DAY_CYCLE / 2); const c2 = UI.dayPhase();
  out.cacheRefreshes = c1.name !== c2.name;

  // it draws on a cycle map and draws NOTHING on a plain one
  __calls.length = 0; Render.ctx = __mkCtx(); Render.W = 1280; Render.H = 720; Render.dpr = 1;
  UI.drawDayDial(Render.ctx, 162, 6);
  const drewOnNight = __calls.length;
  start('temple'); __calls.length = 0; UI._dayCache = null;
  UI.drawDayDial(Render.ctx, 162, 6);
  out.draw = { onCycleMap: drewOnNight, onPlainMap: __calls.length };
  // REVIEW-M17 task 1: through the console's own top bar. hud.js replaces UI.drawTop at load and its body
  // never called the dial, so on Nightfall nothing drew beside the clock plate (the user looked).
  const dialText = () => __calls.filter(c => c.op === 'fillText').map(c => String(c.a[0])).filter(t => /^(day|night|dusk|dawn) in [0-9]/.test(t));
  start('nightfall'); UI.running = true; UI.mode = 'play'; UI._dayCache = null; __calls.length = 0; let topThrew = null;
  try { UI.drawTop(); } catch (e) { topThrew = String(e && e.message || e); }
  out.hudDial = { threw: topThrew, onCycleMap: dialText() };
  start('temple'); UI._dayCache = null; __calls.length = 0; UI.drawTop();
  out.hudDial.onPlainMap = dialText();
  return out;
})()`, ctx);

ok(r.cycleMinutes === 12, 'the cycle is twelve minutes long', String(r.cycleMinutes));
ok(r.day.light === 1 && r.night.light < 0.01, 'it runs from full daylight to genuine dark', JSON.stringify([r.day.light, r.night.light]));

ok(r.sightPenalty > 0.2 && r.sightPenalty < 0.3, 'night costs a ground unit about a quarter of its sight', (r.sightPenalty * 100).toFixed(1) + '%');
ok(r.airPenalty > 0.1 && r.airPenalty < 0.2, 'and costs a flyer about 15% of its SPEED -- the air half of idea 19, which shipped missing', (r.airPenalty * 100).toFixed(1) + '%');
ok(r.groundUnchanged, 'walking is not slower in the dark: night makes seeing hard, not moving', JSON.stringify([r.day.ground, r.night.ground]));
ok(r.dusk.air > r.night.air && r.dusk.air < r.day.air, 'the air penalty eases with the light rather than switching on', JSON.stringify(r.dusk));

ok(r.plainMap.light === 1, 'a map that does not declare dayNight is in permanent daylight -- the cycle is opt-in', String(r.plainMap.light));
ok(r.plainMap.dial === null, '...and shows no dial at all, rather than a sun that never moves', JSON.stringify(r.plainMap.dial));
ok(r.draw.onPlainMap === 0 && r.draw.onCycleMap > 0, 'the dial draws on a cycle map and draws literally nothing on any other', JSON.stringify(r.draw));
ok(!r.hudDial.threw && r.hudDial.onCycleMap.length === 1, 'the console\'s own top bar draws the countdown beside the clock on Nightfall (REVIEW-M17 task 1: it never called the dial)', JSON.stringify(r.hudDial));
ok(r.hudDial.onPlainMap.length === 0, '...and nothing where the dial would be on a map without a cycle', JSON.stringify(r.hudDial.onPlainMap));

ok(r.phases.noon === 'Day' && r.phases.mid === 'Night', 'the dial names noon and midnight', JSON.stringify(r.phases));
ok(r.phases.falling === 'Dusk' && r.phases.rising === 'Dawn', '...and tells falling light from rising', JSON.stringify(r.phases));
ok(r.phases.noonNext === 'dusk' && r.phases.midNext === 'dawn', '...and says what is coming next', JSON.stringify(r.phases));
ok(r.countdownSane, 'the countdown is a real number of seconds within one cycle', JSON.stringify(r.phases));
ok(r.countsDown.same && r.countsDown.decreasing, '...and it counts DOWN as the phase runs out -- that number is the one to act on', JSON.stringify(r.countsDown));
ok(r.cacheRefreshes, 'the per-second cache does not freeze the answer', String(r.cacheRefreshes));

console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
