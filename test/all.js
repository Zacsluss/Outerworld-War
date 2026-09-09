// The fast, deterministic checks, in one run, with one summary and a non-zero exit on any failure.
//   node test/all.js                 everything below, in parallel
//   node test/all.js rates cardsay   just those
//   node test/all.js --serial        one at a time (readable interleaving, ~3x slower)
//   node test/all.js --jobs=4        cap the parallelism
//   node test/all.js --verbose       print every child's full output, pass or fail
//
// "Fast" here means it finishes in about the time the slowest member takes, and "deterministic" means
// a green run is a green run -- no seeds sampled, no win rates, no wall-clock budgets. Those two
// properties are what make it safe to require before a commit.
//
// DELIBERATELY NOT IN THIS SUITE, and why:
//   test/balance.js         win-rate matrix, ~9 min for six seeds and ~40 min for a real one, and its
//                           answer is a confidence interval rather than a pass or a fail
//   test/proxy.js           the same thing cheaper: still minutes, still a measurement not a check
//   test/proxy_validate.js  scores indicators against past runs; a research tool, no verdict
//   test/duel.js            equal-supply duels; a measurement
//   test/perf.js            timings, so its result depends on what else the machine is doing
//   test/perf_render.js     needs a browser and a human to open the URL it prints
//   test/playtest.js        drives whole games through the UI; minutes per matchup
//   test/net.js             spins up the relay and two clients with real sockets and 240 s phase
//                           budgets, so it is both slow and environment-dependent
//   test/missions.js        eight scripted scenarios end to end
//   test/editor.js          builds a map, then plays an AI game and a LAN game on it
//   test/aiaudit.js         counts, does not assert
//   test/casters.js         counts, does not assert
//   test/micro.js           prints a duel frame by frame; explicitly diagnostic
//   test/smoke.js           one AI game; a harness for the above rather than a check
//   test/diag.js            AI progression dump
//   test/diverge.js         finds the first non-deterministic frame; run it when determinism.js breaks
//   test/rejoindiag.js      splits a rejoin to isolate a desync; run it when net.js breaks
//   test/balance_ab.js      pairs two existing logs; needs logs
//   test/balance_stats.js   the statistics behind the harness; fast, but it tests the harness, not the game
// Run the slow ones by hand, or in CI on a schedule. They are listed in HANDOFF.md under
// "How to run everything".
'use strict';
const { spawn } = require('child_process'), path = require('path'), os = require('os');

const TESTS = [
  { name: 'features', args: ['features.js'], what: '87 gameplay checks' },
  { name: 'determinism', args: ['determinism.js'], what: 'identical runs match; a replay reproduces the original' },
  { name: 'version', args: ['version.js'], what: 'build stamp: a save from another build is refused' },
  { name: 'movement', args: ['movement.js'], what: 'unreachable goals, wedged units, burrowed units' },
  { name: 'alerts', args: ['alerts.js'], what: 'the four player alerts fire when they should, never when not' },
  { name: 'observer', args: ['observer.js'], what: 'replay observer: vision, production overlay, seeking' },
  { name: 'snapshot', args: ['snapshot.js'], what: 'a restored snapshot re-simulates bit-identically' },
  { name: 'techtree', args: ['techtree.js', '--quiet'], what: 'every unit, building and tech is reachable' },
  { name: 'rates', args: ['rates.js'], what: 'every weapon fires at the interval its table says' },
  { name: 'cardsay', args: ['cardsay.js'], what: 'every greyed command-card button says why' },
  { name: 'wrongthing', args: ['wrongthing.js'], what: 'doing the wrong thing on purpose neither crashes nor hangs' },
  { name: 'aiscripts', args: ['aiscripts.js'], what: 'the AI build scripts are ordered and name only real things' },
  { name: 'aistyles', args: ['aistyles.js'], what: 'each AI play style is constructible, ordered, and plays differently' },
  { name: 'veterancy', args: ['veterancy.js'], what: 'rank and scars are derived, and survive a snapshot' },
  { name: 'facing', args: ['facing.js'], what: 'a hit from behind hurts more, and explosions have no direction' },
  { name: 'suppress', args: ['suppress.js'], what: 'suppressing fire is researched per production line and pins what it hits' },
  { name: 'commit', args: ['commit.js'], what: 'buildings refund nothing, units still do, and every weapon has a voice' },
];

const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith('--'));
const wanted = argv.filter(a => !a.startsWith('--'));
const VERBOSE = flags.includes('--verbose');
const SERIAL = flags.includes('--serial');
const JOBS = SERIAL ? 1 : Math.max(1, parseInt((flags.find(f => f.startsWith('--jobs=')) || '').slice(7) || '0') || Math.min(TESTS.length, Math.max(2, os.cpus().length - 1)));

const chosen = wanted.length ? TESTS.filter(t => wanted.includes(t.name)) : TESTS;
const unknown = wanted.filter(w => !TESTS.some(t => t.name === w));
if (unknown.length) { console.log('unknown test' + (unknown.length > 1 ? 's' : '') + ': ' + unknown.join(', ') + '\nknown: ' + TESTS.map(t => t.name).join(', ')); process.exit(2); }

// Pull "N passed, M failed" out of a child's output. Every check in this repo prints one of these
// shapes; determinism.js prints none and speaks only through its exit code, which is fine.
const summarize = out => {
  let m = /(?:ALL PASS|FAIL)\s+(\d+) passed, (\d+) failed/.exec(out);
  if (m) return m[1] + ' passed, ' + m[2] + ' failed';
  m = /^PASS (\d+)\s+FAIL (\d+)\s*$/m.exec(out);
  if (m) return m[1] + ' passed, ' + m[2] + ' failed';
  m = /ALL PASS\s+(\d+) checks/.exec(out);
  if (m) return m[1] + ' checks';
  m = /(\d+) FAILED of (\d+) checks/.exec(out);
  if (m) return m[1] + ' failed of ' + m[2] + ' checks';
  return '(exit code only)';
};

const runOne = t => new Promise(resolve => {
  const t0 = Date.now();
  const child = spawn(process.execPath, [path.join(__dirname, t.args[0])].concat(t.args.slice(1)), { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.on('error', e => resolve(Object.assign({}, t, { rc: -1, ms: Date.now() - t0, out: String(e && e.stack || e) })));
  child.on('close', rc => {
    const r = Object.assign({}, t, { rc, ms: Date.now() - t0, out });
    console.log((rc === 0 ? '  ok   ' : ' FAIL  ') + r.name.padEnd(13) + (r.ms / 1000).toFixed(1).padStart(6) + 's  ' + summarize(out));
    resolve(r);
  });
});

(async () => {
  console.log('running ' + chosen.length + ' check' + (chosen.length > 1 ? 's' : '') + (JOBS > 1 ? ' with up to ' + JOBS + ' at a time' : ' one at a time') + '\n');
  const t0 = Date.now();
  const results = new Array(chosen.length);
  let next = 0;
  const worker = async () => { while (next < chosen.length) { const i = next++; results[i] = await runOne(chosen[i]); } };
  await Promise.all(Array.from({ length: Math.min(JOBS, chosen.length) }, worker));

  const bad = results.filter(r => r.rc !== 0);
  console.log('\n' + '='.repeat(88));
  console.log('check         status      time  result                        what it covers');
  console.log('-'.repeat(88));
  for (const r of results) {
    console.log(r.name.padEnd(13) + (r.rc === 0 ? 'ok    ' : 'FAIL  ').padEnd(8) + (r.ms / 1000).toFixed(1).padStart(6) + 's  ' + summarize(r.out).padEnd(28) + '  ' + r.what);
  }
  console.log('-'.repeat(88));
  console.log('wall clock ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, cpu time ' + (results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(1) + 's');

  // A failure is only useful if you can see why without re-running it, so print the failing child's
  // own output. Its tail is where every check in this repo puts its verdict.
  for (const r of bad) {
    console.log('\n' + '='.repeat(88) + '\n=== ' + r.name + ' failed (exit ' + r.rc + '), its output:\n' + '='.repeat(88));
    const lines = r.out.split('\n');
    console.log(lines.length > 60 ? '... ' + (lines.length - 60) + ' earlier lines omitted, run `node test/' + r.args[0] + '` for all of it ...\n' + lines.slice(-60).join('\n') : r.out);
  }
  if (VERBOSE) for (const r of results.filter(x => x.rc === 0)) console.log('\n=== ' + r.name + ' ===\n' + r.out);

  console.log('\n' + (bad.length ? 'FAIL  ' + bad.length + ' of ' + results.length + ' failed: ' + bad.map(r => r.name).join(', ') : 'ALL PASS  ' + results.length + ' checks, 0 failed'));
  process.exit(bad.length ? 1 : 0);
})();
