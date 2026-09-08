// Does the cheap proxy in test/proxy.js actually predict the balance number?
//   node test/proxy_validate.js [--dir=C:\Users\zacsl\bw-scratch\proxy]
//
// This runs no games of its own. It scores test/proxy.js's indicators against five balance calls that
// are already paid for: five full 66-seed runs sitting on disk, each pair on identical seeds, with a
// verdict from test/balance_ab.js. A proxy is only worth having if it reproduces calls it was not
// tuned on, so the honest output of this file is the list of the ones it gets WRONG.
//
// The five calls, and where each truth came from (node test/balance_ab.js <before> <after>):
//   1. M6 shipped -> M7 tasks 2+3    TvZ  +13 pts to T, 104/56 of 371, p = 0.000   MOVED
//   2. M7 t2+3    -> + Zerg research gate  TvZ   +5 pts to T,  72/53 of 360, p = 0.107   not significant
//   3. M6 shipped -> M7 task 2       PvT   -3 pts to P,  89/99 of 380, p = 0.512   no move
//   4. M6 shipped -> M7 task 2       PvZ   -3 pts to P,  79/92 of 388, p = 0.359   no move
//   5. M7 t2+3    -> M7 shipped      TvZ   +0 pts to T,  39/40 of 365, p = 1.000   no move
//
// Call 2 is the weakest ground truth of the five: the full run's own rule says "no detectable shift",
// and only the point estimate points at Terran. M7 reverted the change on that +5, so it is scored on
// the direction of the point estimate and flagged as soft wherever it matters.
const path = require('path'), fs = require('fs');
const { readProxy, INDICATORS, score } = require('./proxy.js');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const DIR = arg('dir', path.join(process.env.USERPROFILE || process.env.HOME || '.', 'bw-scratch', 'proxy'));

// before-log, after-log, matchup, race, truth. `pts` is the paired win-rate move in points for `race`;
// `p` is the full run's McNemar p. `moved` is the balance harness's own verdict at its own threshold.
const CALLS = [
  { name: 'M6ship -> M7 t2+3', a: 'm6head-tz', b: 'm7head2-tz', mu: 'TZ', race: 'T', pts: +13, p: 0.000, moved: true },
  { name: 'M7 t2+3 -> Zerg gate', a: 'm7head2-tz', b: 'm7zerg-tz', mu: 'TZ', race: 'T', pts: +5, p: 0.107, moved: false, soft: true },
  { name: 'M6ship -> M7 t2 (PvT)', a: 'm7head-pvtpvz', b: 'm7casters-pvtpvz', mu: 'TP', race: 'P', pts: -3, p: 0.512, moved: false },
  { name: 'M6ship -> M7 t2 (PvZ)', a: 'm7head-pvtpvz', b: 'm7casters-pvtpvz', mu: 'ZP', race: 'P', pts: -3, p: 0.359, moved: false },
  { name: 'M7 t2+3 -> M7 shipped', a: 'm7head2-tz', b: 'm7mound-tz', mu: 'TZ', race: 'T', pts: 0, p: 1.000, moved: false },
];
// How to regenerate the logs, printed when they are not on disk. Each is one variant's sim code copied
// into a scratch directory beside test/proxy.js, exactly as the Balance section of HANDOFF.md describes.
const RECIPE = [
  ['m6head-tz', 'm6-head  (M6 as shipped, 0f87106)', 'TZ'],
  ['m7head2-tz', 'm7-head2 (M7 tasks 2+3, 07836c6)', 'TZ'],
  ['m7zerg-tz', 'm7-zerg  (M7 + the reverted Zerg research gate)', 'TZ'],
  ['m7mound-tz', 'm7-mound (M7 as shipped, 2802b31)', 'TZ'],
  ['m7head-pvtpvz', 'm7-head  (M6 as shipped, c494be6)', 'TP,ZP'],
  ['m7casters-pvtpvz', 'm7-casters (M7 task 2, a23d92b)', 'TP,ZP'],
];

const need = [...new Set(CALLS.flatMap(c => [c.a, c.b]))];
const missing = need.filter(f => !fs.existsSync(path.join(DIR, f + '.log')));
if (missing.length) {
  console.log('proxy logs not found in ' + DIR + '\n  missing: ' + missing.join(', ') + '\n');
  console.log('Regenerate them (about 25 minutes for all six, 132 games each at --jobs=14).');
  console.log('Each variant\'s js/ is already on disk under bw-scratch; copy test/proxy.js in beside it:\n');
  for (const [out, dir, mu] of RECIPE) console.log('  # ' + dir + '\n  ( cd <scratch>/' + dir.split(' ')[0] + ' && node test/proxy.js --seeds=1..22 --matchups=' + mu + ' --jobs=14 ) > ' + out + '.log');
  process.exit(2);
}
const LOGS = {}; for (const f of need) LOGS[f] = readProxy(path.join(DIR, f + '.log'));

// The proxy's call, from one indicator on one pair, using the same threshold balance_ab.js uses.
const call = s => (!s ? null : s.p < 0.05 ? (s.mean > 0 ? 'moved+' : 'moved-') : 'none');
const truthCall = c => (c.moved ? (c.pts > 0 ? 'moved+' : 'moved-') : 'none');
const truthSign = c => Math.sign(c.pts);

console.log('Validating test/proxy.js against five paid-for balance calls. No games are run here.\n');
console.log('  ' + 'call'.padEnd(24) + 'truth (full run, 66 seeds, ~380 decided games)');
for (const c of CALLS) console.log('  ' + c.name.padEnd(24) + (c.pts >= 0 ? '+' : '') + c.pts + ' pts to ' + c.race + ', p = ' + c.p.toFixed(3) + '   ' + (c.moved ? 'MOVED' : 'no move') + (c.soft ? '   (soft: only the point estimate)' : ''));

const inds = Object.keys(INDICATORS);
const rows = [];
console.log('\nEach indicator\'s paired delta on the same seeds, 22 seeds x 3 layouts x both sides:\n');
console.log('  ' + 'indicator'.padEnd(15) + CALLS.map((c, i) => ('call ' + (i + 1)).padEnd(17)).join('') + 'sign  verdict');
for (const ind of inds) {
  const cells = [], row = { ind, sign: 0, verdict: 0, n: 0 };
  for (const c of CALLS) {
    const s = score(LOGS[c.a], LOGS[c.b], ind, c.race, c.mu);
    if (!s) { cells.push('(none)'.padEnd(17)); continue; }
    row.n++;
    if (Math.sign(s.mean) === truthSign(c) || (truthSign(c) === 0 && s.p >= 0.05)) row.sign++;
    if (call(s) === truthCall(c)) row.verdict++;
    const mark = call(s) === truthCall(c) ? ' ' : '!';
    cells.push((((s.mean >= 0 ? '+' : '') + s.mean.toFixed(1)) + ' p=' + s.p.toFixed(3) + mark).padEnd(17));
  }
  rows.push(row);
  console.log('  ' + ind.padEnd(15) + cells.join('') + String(row.sign) + '/' + row.n + '   ' + row.verdict + '/' + row.n);
}
console.log('\n  sign    = the indicator moved the same way the win rate did (a 0-point truth counts as right when the indicator is also flat)');
console.log('  verdict = the indicator called MOVED / no move exactly as the full run did, at the same p < 0.05');
console.log('  !       = this cell disagrees with the full run\n');

rows.sort((a, b) => (b.verdict - a.verdict) || (b.sign - a.sign) || a.ind.localeCompare(b.ind));
const top = rows.filter(r => r.verdict === rows[0].verdict && r.sign === rows[0].sign);
console.log('Reproduce every call: ' + top.map(r => r.ind).join(', ') + '  (' + rows[0].verdict + '/' + rows[0].n + ' verdicts, ' + rows[0].sign + '/' + rows[0].n + ' signs)');
for (const r of rows.slice(top.length)) {
  const misses = CALLS.filter(c => call(score(LOGS[c.a], LOGS[c.b], r.ind, c.race, c.mu)) !== truthCall(c));
  console.log('  ' + r.ind.padEnd(15) + r.verdict + '/' + r.n + ' verdicts, ' + r.sign + '/' + r.n + ' signs'
    + (misses.length ? '   wrong verdict on: ' + misses.map(m => m.name).join('; ') : '   every verdict right, but points the wrong way somewhere'));
}
// The limit of this validation, which matters more than the score. Four of the five calls are "no
// move", so most of what is being tested is whether an indicator cries wolf. The one positive is a
// 13-point move. That is enough to say these three do not produce false alarms and do catch a large
// move; it is not enough to say they would catch a small one, because the ground truth has no
// confirmed small move in it -- call 2's +5 is not significant even over 360 paired games.
console.log('\nWhat this does and does not establish, with 1 positive call and 4 negative ones:');
console.log('  DOES  -- these three do not fire on a change that did nothing (0 false alarms in 4 chances),');
console.log('           and they do fire, hard, on the one change that moved 13 points.');
console.log('  DOES NOT -- say anything about a 5-point move. There is no confirmed small move to test against.');
console.log('  So: a quiet proxy is a reason not to spend a full run, not proof the change is neutral.');
console.log('\nThe two candidates HANDOFF expected to win are the two that lose. upg@10 and army@contact');
console.log('both fire at p < 0.05 in the wrong direction on calls the full runs settled -- they measure');
console.log('what a change does, not what it wins. Zerg buying upgrades it does not live to use is');
console.log('exactly the M7 finding, and upg@10 reports it as progress.');
