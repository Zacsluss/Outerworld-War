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
//   test/soak.js            every matchup x three seeds at 32k frames; minutes, and its coverage
//                           half is a report rather than a pass or a fail
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
  { name: 'targeting', args: ['targeting.js'], what: 'a unit shoots what threatens it, not merely what is nearest' },
  { name: 'newbuildings', args: ['newbuildings.js'], what: 'field hospitals, jammers and walls: data, art and the nine-slot card' },
  { name: 'auras', args: ['auras.js'], what: 'field hospitals mend and jamming towers blind, to the documented contract' },
  { name: 'card', args: ['card.js'], what: 'the command card is 4x3, pages, and never draws outside its grid' },
  { name: 'describe', args: ['describe.js'], what: 'every unit and building says what it is for, on the card and in the codex' },
  { name: 'gated', args: ['gated.js'], what: 'nothing is gated by convention: every command refuses what it should, out loud' },
  { name: 'clicking', args: ['clicking.js'], what: 'the hit area matches the drawn sprite, buildings double-click, resources are clickable' },
  { name: 'defeat', args: ['defeat.js'], what: 'the result screen actually appears when you lose, and Restart replays the same game' },
  { name: 'addons', args: ['addons.js'], what: 'an add-on keeps its own card, and the page turn has a slot nothing else is on' },
  { name: 'fogbuild', args: ['fogbuild.js'], what: 'you cannot build on ground you have never seen, and the AI still can' },
  { name: 'sensor', args: ['sensor.js'], what: 'the Sensor Tower reports movement as contacts and reveals nothing' },
  { name: 'tumour', args: ['tumour.js'], what: 'the Queen plants creep tumours, the Overlord still does, and the bound holds' },
  { name: 'onmove', args: ['onmove.js'], what: 'the Cyclone fires without stopping; everything else still plants itself' },
  { name: 'line', args: ['line.js'], what: 'a line weapon hits everything along it, to its own range, in its own colours' },
  { name: 'clearance', args: ['clearance.js'], what: 'a wide unit gets a path its body can walk, not one a point can' },
  { name: 'curve', args: ['curve.js'], what: 'a freehand drag spreads the selection along the stroke, and replays identically' },
  { name: 'creeplife', args: ['creeplife.js'], what: 'creep bubbles as an overlay, without disturbing the chunk cache or the build stamp' },
  { name: 'shots', args: ['shots.js'], what: 'every weapon has its own shot, the races are disjoint, and every kind actually draws' },
  { name: 'wavetarget', args: ['wavetarget.js'], what: 'an attack wave scores a defended main above a bare expansion, and finishes the base it is in' },
  { name: 'fognight', args: ['fognight.js'], what: 'explored ground remembers, and night shortens sight on maps that have one' },
  { name: 'formation', args: ['formation.js'], what: 'a right-drag spreads the selection evenly along the line' },
  { name: 'mapmodes', args: ['mapmodes.js'], what: 'the four map sizes are different rules, and the sandstorm is deterministic' },
  { name: 'flavour', args: ['flavour.js'], what: 'voice lines per race and register, rank and scars in the delivery, and the throttle' },
  { name: 'codex', args: ['codex.js'], what: 'the manual draws for every unit, and its damage numbers match real shots' },
  { name: 'mapfeatures', args: ['mapfeatures.js'], what: 'destructibles move pathing and vision, and the archetypes are seeded and legal' },
  { name: 'verticality', args: ['verticality.js'], what: 'the height query the sim reads, and a ramp as the only way up' },
  { name: 'renderfeel', args: ['renderfeel.js'], what: 'the storm draws, weight settles, and 400 units stay legible' },
  { name: 'diegetic', args: ['diegetic.js'], what: 'the console is per-race, takes damage, and glitches reproducibly' },
  { name: 'neutrals', args: ['neutrals.js'], what: "race 'N': buried life with a tell, and derelicts nobody can build" },
  { name: 'neutralsim', args: ['neutralsim.js'], what: 'the third owner wired in: victory, the AI, buried life, and capture by repair' },
  { name: 'ferry', args: ['ferry.js'], what: 'a transport route that runs itself, and picks up only what is idle' },
  { name: 'branch', args: ['branch.js'], what: 'take control mid-replay; the branch saves as a whole game' },
  { name: 'craters', args: ['craters.js'], what: 'the map remembers: permanent scarring, hulks that clear' },
  { name: 'menucodex', args: ['menucodex.js'], what: 'the CODEX button works with no game running, and puts the menu back' },
  { name: 'highground', args: ['highground.js'], what: 'height applied to range, sight and damage -- and a fractional sight that used to blind a unit' },
  { name: 'daynight', args: ['daynight.js'], what: 'the cycle a player can see: the dial, the countdown, and the air half of idea 19' },
  { name: 'qol', args: ['qol.js'], what: 'M12 wave one: no selection cap, shared production, auto-mine, smart cast, autocast, signals' },
  { name: 'push', args: ['push.js'], what: 'a moving unit flows past a standing ally; enemies still block' },
  { name: 'controls', args: ['controls.js'], what: 'every global action is named, listed, rebindable and actually consulted' },
  { name: 'baked', args: ['baked.js'], what: 'every unit and building has a 3D model and a baked sheet, not the flat fallback' },
  { name: 'fields', args: ['fields.js'], what: 'every persistent field paints something -- an invisible force field is a wall with no wall' },
  { name: 'aiadapt', args: ['aiadapt.js'], what: 'the AI scouts for real: intel is vision-gated, and massing vs teching change what it builds' },
  { name: 'campaign', args: ['campaign.js'], what: 'weighted choices resolve both ways, the record persists, narrowing cannot strand you' },
  { name: 'zoom', args: ['zoom.js'], what: 'strategic zoom clamps, anchors and swaps to icons; night runs without G.daylight' },
  { name: 'skirmish', args: ['skirmish.js'], what: 'the setup screen: every setting reaches G.init, and the default is still today\'s game' },
  { name: 'terran12', args: ['terran12.js'], what: 'M12 Terran: the MULE expires, the Reactor doubles, the Viking has two sets of teeth' },
  { name: 'zerg12', args: ['zerg12.js'], what: 'M12 Zerg: tumours spread and stay additive, larva inject, crawlers that walk' },
  { name: 'protoss12', args: ['protoss12.js'], what: 'M12 Protoss: warp-in respects the psi grid, a force field is terrain, chrono cannot stack' },
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
