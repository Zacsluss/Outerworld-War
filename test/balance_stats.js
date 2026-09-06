// The statistics behind test/balance.js. Every wrong turn in M3's balance work came from reading a
// single 108-game run as if it were precise, so the harness now reports a confidence interval and
// refuses to call a matchup either way when that interval crosses the 60/40 line. This checks the
// maths, and checks it against the two real M3 runs that caused the trouble.
//   node test/balance_stats.js
const { wilson, gamesFor } = require('./balance.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); } };
const pc = n => (n * 100).toFixed(1) + '%';

// ---- the interval itself ----
{
  const [lo, hi] = wilson(0, 0);
  ok('no games means no information', lo === 0 && hi === 1);
}
{
  const [lo, hi] = wilson(50, 100);
  ok('50/100 straddles a half and is about +/-10 points', lo > 0.39 && lo < 0.41 && hi > 0.59 && hi < 0.61, pc(lo) + ' - ' + pc(hi));
}
{
  const [lo, hi] = wilson(36, 36);
  ok('a clean sweep still has a lower bound below 1', hi === 1 && lo > 0.85 && lo < 0.95, pc(lo) + ' - ' + pc(hi));
  ok('...and that lower bound is above 60, so a sweep is decisive', lo > 0.6);
}
{
  const a = wilson(20, 40), b = wilson(200, 400);
  ok('ten times the games gives a much tighter interval', (b[1] - b[0]) < (a[1] - a[0]) / 3, pc(a[1] - a[0]) + ' vs ' + pc(b[1] - b[0]));
}
ok('the interval always contains the point estimate', [[1, 10], [5, 36], [25, 35], [17, 72], [300, 400]].every(([w, n]) => { const [lo, hi] = wilson(w, n); return w / n >= lo && w / n <= hi; }));
ok('gamesFor asks for more games as the target tightens', gamesFor(0.5, 0.05) > gamesFor(0.5, 0.1), gamesFor(0.5, 0.05) + ' vs ' + gamesFor(0.5, 0.1));

// ---- the M3 runs ----
// Identical code, two independent 108-game runs (6 seeds x 3 layouts x both sides). These are the real
// numbers, and reading either one on its own is what produced a wrong conclusion in M3.
const M3 = {
  PvT: [[15, 36], [9, 36]],
  PvZ: [[17, 36], [13, 36]],
  TvZ: [[25, 35], [29, 36]],
};
for (const [name, [a, b]] of Object.entries(M3)) {
  const [lo, hi] = wilson(a[0], a[1]);
  ok(name + ': a 36-game interval is far too wide to tune against (' + pc(hi - lo) + ' wide)', hi - lo > 0.28, pc(lo) + ' - ' + pc(hi));
}
// PvT swung 41.7% -> 25.0% between two runs of the same code. That is *further* than binomial noise alone
// explains at 95%: run B's rate falls just outside run A's interval. So per-seed map and matchup structure
// adds variation on top of the coin-flipping, which means these intervals are optimistic, not pessimistic.
{
  const ia = wilson(15, 36), rb = 9 / 36;
  ok('PvT: the two runs disagree by more than binomial noise explains', rb < ia[0], 'run B ' + pc(rb) + ' vs run A interval ' + pc(ia[0]) + '-' + pc(ia[1]));
  ok('...so a run must never be tuned against on its own', true);
}
// Two of the three matchups do reconcile once the interval is drawn, which is the normal case.
for (const name of ['PvZ', 'TvZ']) {
  const [a, b] = M3[name];
  const ia = wilson(a[0], a[1]), rb = b[0] / b[1];
  ok(name + ': the two runs agree once the interval is drawn', rb >= ia[0] && rb <= ia[1], 'run B ' + pc(rb) + ' in ' + pc(ia[0]) + '-' + pc(ia[1]));
}

// ---- pooled over all 12 seeds: what is actually established ----
// This is the table HANDOFF.md quotes. The point of the interval is that only two of these six cells are
// a result at all; the other four are "not enough games", which is not the same as "at target".
const verdict = (w, n) => { const [lo, hi] = wilson(w, n); return lo >= 0.4 && hi <= 0.6 ? 'at target' : lo > 0.6 || hi < 0.4 ? 'outside' : 'undecided'; };
const POOLED = {
  'baseline PvT': [27, 72, 'undecided'],
  'baseline PvZ': [16, 72, 'outside'],
  'baseline TvZ': [45, 72, 'undecided'],
  'after PvT': [24, 72, 'undecided'],
  'after PvZ': [30, 72, 'undecided'],
  'after TvZ': [54, 71, 'outside'],
};
for (const [name, [w, n, want]] of Object.entries(POOLED)) {
  const got = verdict(w, n); const [lo, hi] = wilson(w, n);
  ok(name + ' over ' + n + ' games is ' + want + ' (' + pc(w / n) + ' [' + pc(lo) + '-' + pc(hi) + '])', got === want, 'got ' + got);
}
// The honest summary of M3 task 1: one established failure traded for another.
ok('M3 fixed the only established baseline failure (PvZ)', verdict(16, 72) === 'outside' && verdict(30, 72) !== 'outside');
ok('M3 created a new established failure (TvZ)', verdict(45, 72) !== 'outside' && verdict(54, 71) === 'outside');
ok('PvT was never established either way, before or after', verdict(27, 72) === 'undecided' && verdict(24, 72) === 'undecided');

// How much work an actual verdict costs, so M4 sizes its runs before spending an hour on them.
console.log('\ngames needed for a verdict at the 60/40 line: ' + gamesFor(0.5, 0.1) + ' decided games per matchup (+/-10 points), ' + gamesFor(0.5, 0.05) + ' for +/-5');

console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
