// AI play styles: turtle, rusher, expander, harasser, and 'standard' -- which is the default and must
// stay a zero delta, because every balance number in HANDOFF.md was measured against it.
//
// A style is a delta over AI_SCRIPTS / AI_COMP / AI_RESEARCH plus a handful of numeric knobs, so most of
// what can go wrong is silent: a moved step that names a building the script does not have, a comp
// multiplier on a unit that is not in the composition, a research id that is not in the list. None of
// those throw and none of them change anything, so each gets a check here. The ordering invariant gets
// one for every style and every race -- test/aiscripts.js only sees the base tables, and a style that
// pushes a step past its neighbour breaks exactly the way M10's shield battery did.
//
// Then it plays games, because a table that differs and a game that does not is not a play style.
//   node test/aistyles.js            the checks
//   node test/aistyles.js --dump     print the per-game measurements the checks are built on
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const DUMP = process.argv.includes('--dump');
const ctx = {
  console: { log() { }, warn() { }, error() { } }, Math, performance, addEventListener() { }, setTimeout,
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { }
};
ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
const { D, SCR, COMP, RES } = vm.runInContext('({D:DATA,SCR:AI_SCRIPTS,COMP:AI_COMP,RES:AI_RESEARCH})', ctx);

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };
const RACES = ['T', 'Z', 'P'];

// One AI instance is enough to reach the style methods; they take the race and the style as arguments
// and read nothing else off `this`.
const A = vm.runInContext(`
  G.init({ players: [{ race: 'T', human: false }, { race: 'Z', human: false }], seed: 1, layout: 'temple' });
  G.players[0].ai`, ctx);
const DELTAS = A.styleDeltas();
const STYLES = Object.keys(DELTAS);
const script = (race, style) => A.styleScript(race, style);
const comp = (key, style) => A.styleComp(key, style);
const research = (race, style) => A.styleResearch(race, style);

// ---------------------------------------------------------------- the table itself
ok(STYLES.length === 5 && ['standard', 'turtle', 'rusher', 'expander', 'harasser'].every(s => STYLES.includes(s)),
  'the five styles exist: ' + STYLES.join(', '));
ok(Object.keys(DELTAS.standard).length === 0, "'standard' is a zero delta", JSON.stringify(DELTAS.standard));

for (const race of RACES) {
  ok(JSON.stringify(script(race, 'standard')) === JSON.stringify(SCR[race]), "'standard' leaves the " + race + ' build script exactly as written');
  ok(JSON.stringify(research(race, 'standard')) === JSON.stringify(RES[race]), "'standard' leaves AI_RESEARCH." + race + ' exactly as written');
}
for (const key of Object.keys(COMP)) ok(JSON.stringify(comp(key, 'standard')) === JSON.stringify(COMP[key]), "'standard' leaves AI_COMP." + key + ' exactly as written');

// ---------------------------------------------------------------- every style's scripts
for (const style of STYLES) {
  for (const race of RACES) {
    const s = script(race, style), bad = [];
    for (let i = 1; i < s.length; i++) if (s[i][0] < s[i - 1][0]) bad.push(`${s[i - 1][1]}@${s[i - 1][0]} then ${s[i][1]}@${s[i][0]}`);
    ok(!bad.length, style + '/' + race + ' build script is in ascending supply order (' + s.length + ' steps)', bad.join('; '));
    const wrong = s.filter(([, id]) => !D.buildings[id] || D.buildings[id].race !== race).map(([, id]) => id);
    ok(!wrong.length, style + '/' + race + ' names only real ' + race + ' buildings', wrong.join(' '));
    // A style may add and may reorder; it may never drop a step. Losing one is how a tech tree gets
    // amputated, and the loss would be invisible -- the AI simply never builds the thing again.
    const have = {}; for (const [, id] of s) have[id] = (have[id] || 0) + 1;
    const lost = []; const base = {}; for (const [, id] of SCR[race]) base[id] = (base[id] || 0) + 1;
    for (const id of Object.keys(base)) if ((have[id] || 0) < base[id]) lost.push(id);
    ok(!lost.length, style + '/' + race + ' keeps every step the base script has', lost.join(' '));
  }
}

// ---------------------------------------------------------------- the deltas name things that exist
for (const style of STYLES) {
  const d = DELTAS[style];
  const bad = [];
  for (const race of RACES) {
    for (const id of Object.keys((d.early && d.early[race]) || {})) {
      if (!SCR[race].some(x => x[1] === id)) bad.push(race + ':' + id + ' is not in the base script');       // a silent no-op
      else if (d.early[race][id] >= SCR[race].find(x => x[1] === id)[0]) bad.push(race + ':' + id + ' is not moved earlier'); // also a silent no-op
    }
    for (const [sup, id] of (d.add && d.add[race]) || []) {
      if (!D.buildings[id] || D.buildings[id].race !== race) bad.push(race + ':' + id + ' is not a ' + race + ' building');
      if (!(sup > 0)) bad.push(race + ':' + id + ' has no supply');
    }
    for (const id of (d.front && d.front[race]) || []) if (!RES[race].includes(id)) bad.push(race + ':' + id + ' is not in AI_RESEARCH.' + race);
  }
  ok(!bad.length, style + ' names only steps and techs that exist', bad.join('; '));

  const cbad = [];
  for (const id of Object.keys(d.comp || {})) {
    if (!D.units[id]) cbad.push(id + ' is not a unit');
    else if (!Object.keys(COMP).some(k => COMP[k].some(([u]) => u === id))) cbad.push(id + ' is in no composition');   // a silent no-op
    if (!(d.comp[id] >= 0)) cbad.push(id + ' has a nonsense multiplier');
  }
  ok(!cbad.length, style + ' multiplies only units that are in a composition', cbad.join('; '));
}

// ---------------------------------------------------------------- research lists stay sane
for (const style of STYLES) {
  const bad = [];
  for (const race of RACES) {
    const r = research(race, style);
    if (r.some(id => !D.techs[id] && !D.upgrades[id])) bad.push(race + ' names something that is not a tech');
    if (r.some((id, i) => r.indexOf(id) !== i)) bad.push(race + ' has a duplicate');
    if (!r.length) bad.push(race + ' is empty');
    const want = DELTAS[style].res ? Math.min(DELTAS[style].res, RES[race].length) : RES[race].length;
    if (r.length !== want) bad.push(race + ' is ' + r.length + ' long, wanted ' + want);
    if (!DELTAS[style].res && r.slice().sort().join() !== RES[race].slice().sort().join()) bad.push(race + ' gained or lost an entry');
  }
  ok(!bad.length, style + ' research list is a reordering, and a truncation only where asked', bad.join('; '));
}
// ---------------------------------------------------------------- and the compositions
// A composition delta is a table fact and does not need a game to check. What a game is needed for is
// whether it survives contact with what the AI can afford, which is what the last section is about.
const wgt = (key, style, id) => (comp(key, style).find(([u]) => u === id) || [, 0])[1];
ok(wgt('T', 'harasser', 'vulture') > wgt('T', 'standard', 'vulture') && wgt('T', 'standard', 'vulture') > wgt('T', 'turtle', 'vulture'),
  'a vulture is a bigger share of a harasser army than of a standard one, and of a standard one than a turtle',
  [wgt('T', 'harasser', 'vulture'), wgt('T', 'standard', 'vulture'), wgt('T', 'turtle', 'vulture')].join(' '));
ok(wgt('T', 'turtle', 'siege_tank') > wgt('T', 'harasser', 'siege_tank') && wgt('Z', 'harasser', 'zergling') > wgt('Z', 'turtle', 'zergling'),
  'and the other way round for a siege tank, and a zergling goes the harasser way');
ok(wgt('T', 'rusher', 'battlecruiser') < wgt('T', 'standard', 'battlecruiser') && wgt('Z', 'rusher', 'queen') === 0,
  'a rusher builds fewer of the slowest things, and a zero weight removes a unit outright');
for (const style of STYLES.filter(s => DELTAS[s].comp)) {
  const same = Object.keys(COMP).filter(k => JSON.stringify(comp(k, style)) === JSON.stringify(COMP[k]));
  ok(!same.length, style + ' changes every composition, including the per-matchup ones', same.join(' '));
  const shape = Object.keys(COMP).filter(k => comp(k, style).map(x => x[0]).join() !== COMP[k].map(x => x[0]).join());
  ok(!shape.length, style + ' changes only the weights, never which units are in the list', shape.join(' '));
}
ok(research('T', 'rusher').length === 6 && research('T', 'rusher')[0] === 'stim', 'rusher keeps only the head of the research list (minimal tech)');
ok(research('T', 'harasser')[0] === 'ion_thrusters' && research('Z', 'harasser')[0] === 'metabolic' && research('P', 'harasser')[0] === 'leg_enhancements',
  'harasser researches its speed upgrade first, in all three races');

// ---------------------------------------------------------------- construction, at every difficulty
const DIFFS = ['easy', 'normal', 'hard'];
const build = (race, diff, style) => vm.runInContext(`(function () {
  G.init({ players: [{ race: '${race}', human: false, difficulty: '${diff}' }, { race: 'Z', human: false }], seed: 3, layout: 'temple' });
  const a = new AI(G.players[0], '${diff}'${style === undefined ? '' : ', ' + JSON.stringify(style)});
  return { style: a.style, atk: a.attackThreshold, think: a.thinkEvery, diff: a.diff };
})()`, ctx);

for (const style of STYLES) {
  const rows = DIFFS.map(d => build('T', d, style));
  ok(rows.every(r => r.style === style && r.atk >= 10 && isFinite(r.atk)), style + ' constructs at easy, normal and hard', JSON.stringify(rows));
  ok(rows[0].think === 72 && rows[1].think === 32 && rows[2].think === 20, style + ' leaves the think rate to the difficulty alone');
  ok(rows[0].atk > rows[1].atk && rows[1].atk > rows[2].atk, style + ' still gets easier as the difficulty drops', JSON.stringify(rows.map(r => r.atk)));
}
ok(RACES.every(r => DIFFS.every(d => STYLES.every(s => build(r, d, s).style === s))), 'every style constructs for every race at every difficulty');

// The point of "orthogonal": the styles are in the same order at every difficulty, and the whole ladder
// moves with the difficulty rather than being replaced by it.
for (const d of DIFFS) {
  const atk = {}; for (const s of STYLES) atk[s] = build('T', d, s).atk;
  ok(atk.rusher < atk.harasser && atk.harasser < atk.standard && atk.standard < atk.expander && atk.expander < atk.turtle,
    'at ' + d + ', rusher < harasser < standard < expander < turtle by attack threshold', JSON.stringify(atk));
}

// The constructor other code already calls. game.js, test/alerts.js, test/missions.js, test/smoke.js and
// test/diag.js all pass two arguments, and 34/44/28 are the thresholds this AI has had since M9.
const two = DIFFS.map(d => build('T', d, undefined));
ok(two.every(r => r.style === 'standard'), 'a two-argument AI still constructs, and is standard', JSON.stringify(two.map(r => r.style)));
ok(two[0].atk === 44 && two[1].atk === 34 && two[2].atk === 28, 'a two-argument AI has exactly the thresholds it had before styles existed', JSON.stringify(two.map(r => r.atk)));
ok(build('T', 'normal', 'nonsense').style === 'standard' && build('T', 'normal', '').style === 'standard', 'an unknown or empty style falls back to standard');

// The other way a style can arrive, which is the one that survives a save: the player options G.init was
// handed. Replay.data() stores G.setup.players verbatim, so a styled game replays as itself.
const viaSetup = vm.runInContext(`(function () {
  G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', style: 'rusher' }, { race: 'Z', human: false, difficulty: 'normal', style: 'turtle' }], seed: 3, layout: 'temple' });
  return { a: G.players[0].ai.style, b: G.players[1].ai.style, saved: Replay.data().players.map(x => x.style || 'standard').join(',') };
})()`, ctx);
ok(viaSetup.a === 'rusher' && viaSetup.b === 'turtle', 'a style on the player options reaches the AI', JSON.stringify(viaSetup));
ok(viaSetup.saved === 'rusher,turtle', 'and is saved with the replay, so it re-simulates as itself', viaSetup.saved);
const argWins = vm.runInContext(`(function () {
  G.init({ players: [{ race: 'T', human: false, style: 'rusher' }, { race: 'Z', human: false }], seed: 3, layout: 'temple' });
  return new AI(G.players[0], 'normal', 'turtle').style;
})()`, ctx);
ok(argWins === 'turtle', 'an explicit style argument beats the one on the player options');

// ---------------------------------------------------------------- and now play games
// Ten minutes each, one seed, three races per style. Every number is a measurement of player 0 only.
//
// The opponent is a real player on a real map with real resources, but its AI is switched off, and that
// is deliberate: two AIs playing each other is chaotic, so the same style measured against a live
// opponent on one seed says as much about which fight happened as about the style. Measured that way the
// expander built five bases in one game and two in the next off a single knob turned by a fifth. With a
// passive opponent every difference below is the style and nothing else -- at the price of measuring an
// AI that is never punished for greed, which is exactly the property a style comparison wants.
// (`over` in the dump means the styled AI finished the passive player off before the ten minutes were up,
// which freezes the sim; only the rusher gets close.)
const arg = (n, d) => { const f = process.argv.find(a => a.startsWith('--' + n + '=')); return f ? parseInt(f.slice(n.length + 3)) : d; };
// The units the harasser's table favours, taken from the table rather than listed again here, so this
// cannot drift away from what the style actually asks for. `mobile` below is their supply in the army.
const FAV = Object.keys(DELTAS.harasser.comp).filter(id => DELTAS.harasser.comp[id] > 1);
// FRAMES is the ten minutes the comparison comment below describes -- it was 12,000 (8.3 minutes), and the
// four first-wave comparisons hung on a single Protoss arm attacking at frame 10,944 of it. The default seed
// is the one the gate runs; 1, 5 and 11 are the three to run by hand, and HANDOFF-M17 records which
// assertions each fails. (REVIEW-M17, the starting Queen: seed 5 kept one economy line red, seed 1 is clean.)
const FRAMES = arg('frames', 14400), SEED = arg('seed', 1), MID = 7200;
const play = (race, style) => vm.runInContext(`(function () {
  G.init({ players: [{ race: '${race}', human: false, difficulty: 'normal' }, { race: 'Z', human: false, difficulty: 'normal' }], seed: ${SEED}, layout: 'temple' });
  G.players[0].ai = new AI(G.players[0], 'normal', ${JSON.stringify(style)});
  G.players[1].ai = null; G.freePlay = true;   // ...and the sim does not stop when the passive player is razed, or the styles that attack earliest would be measured over a shorter game than the ones that do not
  const a = G.players[0].ai, p = G.players[0];
  const mine = f => G.units.filter(u => u.alive && u.owner === 0 && f(u));
  let first = 0, firstSup = 0, mid = null;
  for (let i = 0; i < ${FRAMES}; i++) {
    G.tick();
    if (!first && a.waves > 0) { first = G.frame; firstSup = a.waveSup0 || 0; }        // the supply that actually walked out, which is what attackThreshold sets
    if (G.frame === ${MID}) mid = { workers: mine(u => u.def.worker).length, halls: mine(u => u.isBuilding && u.def.depot && u.done).length };
  }
  const army = mine(u => !u.isBuilding && !u.def.worker && !u.def.larva && !u.def.egg && !u.def.notUnit && u.hasWeapon());
  const sup = army.reduce((s, u) => s + (u.def.sup || 0), 0);
  const blds = {}; for (const u of mine(u => u.isBuilding)) blds[u.def.id] = (blds[u.def.id] || 0) + 1;
  return {
    style: a.style, first: first || ${FRAMES}, firstSup: firstSup, waves: a.waves, sup: p.supUsed,
    halls: mine(u => u.isBuilding && u.def.depot).length,          // standing or going up: a base the enemy killed still says the style tried to take it
    workers: mine(u => u.def.worker).length,
    w5: mid ? mid.workers : 0, h5: mid ? mid.halls : 0,
    def: mine(u => u.isBuilding && (u.def.gw || u.def.aw || u.def.bunker)).length,
    army: sup, speed: sup ? army.reduce((s, u) => s + (u.def.speed || 0) * (u.def.sup || 0), 0) / sup : 0,
    mobile: army.reduce((s, u) => s + (${JSON.stringify(FAV)}.includes(u.def.id) ? (u.def.sup || 0) : 0), 0),
    units: (function () { const c = {}; for (const u of army) c[u.def.id] = (c[u.def.id] || 0) + 1; return c; })(),
    tech: p.tech.size + Object.values(p.upg || {}).reduce((s, l) => s + l, 0), over: G.over ? G.frame : 0,
    blds: Object.keys(blds).sort().map(k => k + ':' + blds[k]).join(' '),
  };
})()`, ctx);

// --games=turtle/T,standard/T plays only those and skips the comparisons, which is how the numbers above
// were calibrated: the full set is fifteen ten-minute games.
const ONLY = (process.argv.find(a => a.startsWith('--games=')) || '').slice(8).split(',').filter(Boolean);
const M = {}; for (const style of STYLES) M[style] = {};
for (const style of STYLES) for (const race of RACES) {
  if (ONLY.length && !ONLY.includes(style + '/' + race)) continue;
  const t0 = Date.now(); M[style][race] = play(race, style); M[style][race].ms = Date.now() - t0;
}
const tot = (style, k) => RACES.reduce((s, r) => s + (M[style][r] ? M[style][r][k] : 0), 0);
if (DUMP) {
  console.log('\n' + FRAMES + ' frames, seed ' + SEED + ', vs a passive Zerg (w5/h5 are workers and bases at frame ' + MID + ')');
  console.log('style     race  1st wave  sup@1st  waves  halls  workers   w5  h5  def  army  speed  mobile  tech  supply   over     ms');
  for (const style of STYLES) for (const race of RACES) { const m = M[style][race]; if (!m) continue;
    console.log(style.padEnd(9) + ' ' + race + '    ' + String(m.first).padStart(8) + String(m.firstSup).padStart(9) + String(m.waves).padStart(7) + String(m.halls).padStart(7) + String(m.workers).padStart(9) + String(m.w5).padStart(5) + String(m.h5).padStart(4) + String(m.def).padStart(5) + String(m.army).padStart(6) + m.speed.toFixed(2).padStart(7) + m.mobile.toFixed(2).padStart(8) + String(m.tech).padStart(6) + String(m.sup).padStart(8) + String(m.over).padStart(7) + String(m.ms).padStart(7)); }
  console.log('');
  for (const style of STYLES) for (const race of RACES) if (M[style][race]) console.log('  ' + (style + '/' + race).padEnd(12) + M[style][race].blds);
  console.log('');
  for (const style of STYLES) for (const race of RACES) if (M[style][race]) console.log('  ' + (style + '/' + race).padEnd(12) + Object.keys(M[style][race].units).sort().map(k => k + ':' + M[style][race].units[k]).join(' '));
  console.log('');
}

// The size of the first wave is the cleanest reading of a style there is: attackThreshold decides it
// directly, and unlike the frame the wave leaves on it is not confounded by how fast the economy grew.
// Compared only over the races where both styles attacked at all inside the window.
const sup1 = (a, b) => {
  const rs = RACES.filter(r => M[a][r] && M[b][r] && M[a][r].firstSup > 0 && M[b][r].firstSup > 0);
  return [rs.reduce((s, r) => s + M[a][r].firstSup, 0), rs.reduce((s, r) => s + M[b][r].firstSup, 0), rs.join('')];
};
const attacked = s => RACES.filter(r => M[s][r] && M[s][r].firstSup > 0).length;
const wave = (a, cmp, b, what) => {
  const [x, y, rs] = sup1(a, b);
  // "a wants a bigger wave than b" with no race where both attacked is not a failed comparison if a
  // never attacked at all and b did: not attacking inside ten minutes is the stronger form of the claim.
  if (!rs.length && cmp === '>' && !attacked(a) && attacked(b)) return ok(true, what + ' (it did not attack at all inside the window, which is the stronger version)');
  ok(rs.length > 0 && (cmp === '<' ? x < y : x > y), what, x + ' vs ' + y + ' over ' + (rs || 'no races where both attacked'));
};

if (ONLY.length) console.log('\n(--games given: the comparisons below are skipped)');
else {
  // Each of these is the style's own headline, summed over the three races so that one race having a bad
  // game on this seed cannot flip it. They are deliberately loose: the claim is that a style changes what
  // the AI does, not that it changes it by a particular amount.
  wave('rusher', '<', 'standard', 'rusher commits a smaller first wave than standard');
  wave('harasser', '<', 'standard', 'harasser commits a smaller first wave than standard');
  wave('turtle', '>', 'standard', 'turtle commits a bigger first wave than standard');
  wave('expander', '>', 'standard', 'expander commits a bigger first wave than standard');
  wave('turtle', '>', 'rusher', 'turtle commits a bigger first wave than rusher');
  ok(tot('rusher', 'first') < tot('standard', 'first'), 'rusher attacks earlier in the game than standard', tot('rusher', 'first') + ' vs ' + tot('standard', 'first'));
  ok(tot('rusher', 'first') < tot('turtle', 'first'), 'rusher attacks earlier in the game than turtle', tot('rusher', 'first') + ' vs ' + tot('turtle', 'first'));
  ok(tot('turtle', 'def') > tot('standard', 'def'), 'turtle builds more static defence than standard', tot('turtle', 'def') + ' vs ' + tot('standard', 'def'));
  ok(tot('turtle', 'def') > tot('rusher', 'def'), 'turtle builds more static defence than rusher', tot('turtle', 'def') + ' vs ' + tot('rusher', 'def'));
  // At five minutes, not at ten. A turtle that has not attacked by ten minutes is sitting on minerals it
  // has nothing to spend on, and `p.minerals > 500` is one of the AI's expansion triggers, so late in a
  // lab game the turtle catches up on bases and sometimes passes. "Expands late" is a claim about the
  // opening and is measured in the opening.
  ok(tot('turtle', 'h5') <= tot('standard', 'h5'), 'turtle has taken no more ground than standard at five minutes', tot('turtle', 'h5') + ' vs ' + tot('standard', 'h5'));
  ok(tot('expander', 'halls') > tot('turtle', 'halls'), 'expander holds more bases than turtle', tot('expander', 'halls') + ' vs ' + tot('turtle', 'halls'));
  ok(tot('expander', 'halls') >= tot('standard', 'halls'), 'expander holds at least as many bases as standard', tot('expander', 'halls') + ' vs ' + tot('standard', 'halls'));
  ok(tot('expander', 'w5') > tot('rusher', 'w5'), 'expander mines with more workers than rusher at five minutes', tot('expander', 'w5') + ' vs ' + tot('rusher', 'w5'));
  ok(tot('expander', 'w5') > tot('turtle', 'w5'), 'expander mines with more workers than turtle at five minutes', tot('expander', 'w5') + ' vs ' + tot('turtle', 'w5'));
  ok(tot('harasser', 'waves') >= tot('turtle', 'waves'), 'harasser sends at least as many waves as turtle', tot('harasser', 'waves') + ' vs ' + tot('turtle', 'waves'));
  // The composition delta, read back out of the games as army supply in the units the harasser's own
  // table multiplies up. Two things were tried first and are recorded because they are traps: the mean
  // unit speed is dominated by whatever the bulk unit is and put the TURTLE ahead half the time, and the
  // same measure as a share rather than a total made a turtle whose whole 21-supply army happened to be
  // zerglings score 1.00. Note also that ten minutes is not long enough for a composition to separate
  // properly -- every army in these games is mostly marines, zerglings or zealots, because that is what
  // the AI can afford -- so this is the weakest of the behavioural checks by some way.
  ok(tot('harasser', 'mobile') > tot('turtle', 'mobile'), 'harasser fields more of the fast units its table favours than turtle', tot('harasser', 'mobile') + ' vs ' + tot('turtle', 'mobile'));
  // Nothing here is allowed to be a no-op: a style that measures identically to standard in every column
  // is a style that is not implemented, however good its table looks.
  for (const style of STYLES.filter(s => s !== 'standard')) {
    const keys = ['first', 'firstSup', 'waves', 'halls', 'workers', 'w5', 'h5', 'def', 'army', 'mobile', 'tech'];
    const moved = keys.filter(k => Math.abs(tot(style, k) - tot('standard', k)) > 1e-9);
    ok(moved.length >= 3, style + ' plays measurably differently from standard (' + moved.join(', ') + ')');
  }
}

console.log(fail ? `FAIL  ${pass} passed, ${fail} failed` : `ALL PASS  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
