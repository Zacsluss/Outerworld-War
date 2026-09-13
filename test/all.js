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
//   test/missions.js        twelve scripted scenarios end to end
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
//   test/ledger.js          a measurement, not a check: prints the AI's per-think spend, never fails
//   test/techtime.js        a measurement: when the AI reaches each tier; 20-minute games per race and seed
//   test/longgame.js        a sixty-minute game and its replay; ~9 minutes, six times the slowest gate member
//   test/eightplayer.js     37 s and deterministic, but its money assertion is a known red (REVIEW-M17 bisected
//                           it to FIXLIST-M15 C3, and the cause is AI spending, which is gated). Gate it the
//                           day it is green; until then a red member would teach everyone to ignore the gate
//   test/net_many.js        four lockstep clients over real sockets, ~65 s, environment-dependent like net.js,
//                           and one of its 44 assertions is wrong by design (HANDOFF-M16, the fourth red)
//   test/patch10/11/15.js   NOT TESTS -- one-off codemods that rewrite js/; they refuse to run without a flag
// Run the slow ones by hand, or in CI on a schedule. They are listed in HANDOFF.md under
// "How to run everything".
'use strict';
const { spawn } = require('child_process'), path = require('path'), os = require('os');

const TESTS = [
  { name: 'features', args: ['features.js'], what: '87 gameplay checks' },
  { name: 'determinism', args: ['determinism.js'], what: 'identical runs match; a replay reproduces the original' },
  { name: 'version', args: ['version.js'], what: 'build stamp: a save from another build is refused' },
  { name: 'dmath', args: ['dmath.js'], what: 'the simulation\'s sin, cos, atan2 and hypot are the same bits on every engine: accuracy, purity, and no native left in a stamped file' },
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
  { name: 'refusals', args: ['refusals.js'], what: 'a refused ability names the reason, and nothing refuses in silence' },
  { name: 'larvacard', args: ['larvacard.js'], what: 'Drone is top-left on the larva card, no two buttons share a slot, and a refused click acts once' },
  { name: 'creeplife', args: ['creeplife.js'], what: 'creep bubbles as an overlay, without disturbing the chunk cache or the build stamp' },
  { name: 'creepspeed', args: ['creepspeed.js'], what: 'the swarm moves faster over its own ground -- SC2 multipliers, and the Drone gets nothing' },
  { name: 'rooms', args: ['rooms.js'], what: 'one relay, many games: room codes keep them apart, and the lockstep delay is the server to set' },
  { name: 'spectate', args: ['spectate.js'], what: 'a spectator watches in lockstep, cannot act, stalls nobody, and can join a running game' },
  { name: 'settings', args: ['settings.js'], what: 'settings tabs: HUD size, scroll speed, edge scroll and volume, applied at once and remembered' },
  { name: 'menus', args: ['menus.js'], what: 'the menus: three doors, a name asked once, MULTIPLAYER connects, the skirmish lobby is the multiplayer lobby, the Codex and Controls tabs' },
  { name: 'hotkeys', args: ['hotkeys.js'], what: 'every command card key belongs to the player: the editor shows the real cards, one key per command, per layout, remembered, clashes named' },
  { name: 'lobby', args: ['lobby.js'], what: 'ready means ready, latency, system lines, teams, seats per map, rules, the browser and the invite link' },
  { name: 'rematch', args: ['rematch.js'], what: 'after a game the room goes back to its lobby: agreed game over, REMATCH and BACK TO LOBBY, away players, the same settings, the skirmish lobby too' },
  { name: 'ratings', args: ['ratings.js'], what: 'ratings: OpenSkill against published vectors, agreed and forfeited results, what is unrated, the file, BALANCE TEAMS' },
  { name: 'safety', args: ['safety.js'], what: 'internet-play safety: a server password, sockets per address, message and frame caps, the address behind a tunnel' },
  { name: 'starts', args: ['starts.js'], what: 'a start chosen in the lobby: on the map, in the list, placed by the host, refused when taken, reset by a new map, and the game it starts' },
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
  { name: 'overlap', args: ['overlap.js'], what: 'units keep their drawn bodies apart; mining, repair, merges, melee reach and jams still work' },
  { name: 'controls', args: ['controls.js'], what: 'every global action is named, listed, rebindable and actually consulted, and no rebind lands on a hard-coded key' },
  { name: 'netaudio', args: ['netaudio.js'], what: "an alert is played and spoken only on the client of the player it is about -- both clients used to hear both players' supply alerts in a network game -- while the message record stays per player" },
  { name: 'ticker', args: ['ticker.js'], what: 'the simulation clock is a Worker timer a hidden or covered tab cannot throttle (a hidden host fed its peer eight frames a second), with a page-interval fallback; a key released while the window had no focus is forgotten, and the arrows are polled only with focus' },
  { name: 'baked', args: ['baked.js'], what: 'every unit and building has a 3D model and a baked sheet, not the flat fallback' },
  { name: 'fields', args: ['fields.js'], what: 'every persistent field paints something -- an invisible force field is a wall with no wall' },
  { name: 'aiadapt', args: ['aiadapt.js'], what: 'the AI scouts for real: intel is vision-gated, and massing vs teching change what it builds' },
  { name: 'campaign', args: ['campaign.js'], what: 'weighted choices resolve both ways, the record persists, narrowing cannot strand you' },
  { name: 'zoom', args: ['zoom.js'], what: 'strategic zoom clamps, anchors and swaps to icons; night runs without G.daylight' },
  { name: 'skirmish', args: ['skirmish.js'], what: 'the setup screen: every setting reaches G.init, and the default is still today\'s game' },
  { name: 'terran12', args: ['terran12.js'], what: 'M12 Terran: the MULE expires, the Reactor doubles, the Viking has two sets of teeth' },
  { name: 'zerg12', args: ['zerg12.js'], what: 'M12 Zerg: tumours spread and stay additive, larva inject, crawlers that walk' },
  { name: 'protoss12', args: ['protoss12.js'], what: 'M12 Protoss: warp-in respects the psi grid, a force field is terrain, chrono cannot stack' },
  // REVIEW-M17. This ran NEVER: not in the gate and not on the list above. 54 checks, ~35 s, no sockets
  // (WebSocket is stubbed), no seeds sampled -- everything the gate asks for, and it covers the one
  // thing a seed-plus-log save cannot fake: a nuke, a morph and a Recall all halfway through.
  { name: 'saveload', args: ['saveload.js'], what: 'a save taken mid-nuke, mid-morph and mid-Recall reloads byte-identically; a rejoin restores the donor\'s state' },
  { name: 'cmdlog', args: ['cmdlog.js'], what: 'every order the interface can issue survives the command log: autocast, the ferry route, a dead target, a malformed log' },
  { name: 'review17', args: ['review17.js'], what: 'the simulation faults REVIEW-M17 measured and fixed: Carrier cooldown, status refresh, sieged tank, decloak, larva, worker poll, tick errors, Charon' },
  { name: 'review17ui', args: ['review17ui.js'], what: 'the interface faults REVIEW-M17 fixed: keys in text fields, zoom keys, F8, Tab, the last alert, net speed, rejoin input, the editor loop, per-sim-frame effects, the manual wheel' },
  { name: 'queens', args: ['queens.js'], what: 'the REVIEW-M17 Zerg notes: Spawn Larva stacks a hall to twelve, a computer Zerg keeps a Queen at every hatchery, larvae come off the fullest hall' },
  // The overlay a selection draws, and the one a death must stop drawing. Both are presentation, so
  // neither can be checked by looking at the simulation: the suite drives Render.frame against a
  // recording canvas and reads the paths back.
  { name: 'seldraw', args: ['seldraw.js'], what: 'a shift-queued route draws for the selection (green go, red fight, yellow patrol; one stroke for the whole screen) and a dead unit draws no health bar while its corpse still does' },
  // REVIEW-M17 task 20. Seventeen of the eighty abilities were never named in a gate suite (fourteen casts and
  // the three menu kinds), and five mechanics were never driven. ~2 s, no sockets, no seeds sampled.
  { name: 'abilities20', args: ['abilities20.js'], what: 'every ability the gate never drove, through the real entry points and asserted by its effect: Restoration, Optical Flare, Lockdown, Defensive Matrix, EMP, Yamato, Parasite, Ensnare, Nydus Exit, Feedback, Maelstrom, Disruption Web, the two ammo builders; Infest, Scarab pathing, Interceptor docking and loss, a transport killed with cargo, a mined-out patch' },
  // test/eightplayer.js was in the gate for one commit (022d0ce): green by 1% after the larva-starvation
  // clause in AI.macro, and red again as soon as the deterministic maths moved every position by a
  // rounding step and dealt a different game. The bank that crosses 2,500 is a Terran on full geysers
  // with eight production buildings, floating minerals under the flat-3 rule AI.macro keeps on purpose
  // ("THE FLAT 3 STAYS", measured twice) -- gated, and not a thing a gate member should flip on.
  // Excluded again; run it by hand as the measurement it is. (REVIEW-M17)
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
  // FAILURES as well as FAIL: thirteen gate suites print 'FAILURES N passed, M failed' on the red path,
  // which is the path that matters, and this fell through to '(exit code only)' for every one of them.
  let m = /(?:ALL PASS|FAILURES|FAIL)\s+(\d+) passed, (\d+) failed/.exec(out);
  if (m) return m[1] + ' passed, ' + m[2] + ' failed';
  m = /^PASS (\d+)\s+FAIL (\d+)\s*$/m.exec(out);
  if (m) return m[1] + ' passed, ' + m[2] + ' failed';
  m = /ALL PASS\s+(\d+) checks/.exec(out);
  if (m) return m[1] + ' checks';
  m = /(\d+) FAILED of (\d+) checks/.exec(out);
  if (m) return m[1] + ' failed of ' + m[2] + ' checks';
  return '(exit code only)';
};

// A hang is a failure, not a wait. test/rooms.js awaited a socket `open` that never fires against a
// port something else already held, and this runner had no way to notice; the slowest honest member
// is under three minutes, so fifteen is a hang.
const KILL_MS = 15 * 60 * 1000;
const runOne = t => new Promise(resolve => {
  const t0 = Date.now();
  const child = spawn(process.execPath, [path.join(__dirname, t.args[0])].concat(t.args.slice(1)), { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const killer = setTimeout(() => { out += '\n[test/all.js killed this check after ' + (KILL_MS / 1000) + ' s: a hang is a failure]\n'; try { child.kill(); } catch (e) { } }, KILL_MS);
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.on('error', e => resolve(Object.assign({}, t, { rc: -1, ms: Date.now() - t0, out: String(e && e.stack || e) })));
  child.on('close', rc => {
    clearTimeout(killer);
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
    // Nine gate suites print a PASS line per check and have more than sixty checks, so a FAIL in the
    // first three hundred lines of test/neutrals.js used to be cut by the tail below. Every FAIL line
    // is printed first, wherever it was.
    const fails = lines.filter(l => /^\s*FAIL\b/.test(l) && !/^FAIL\s+\d+ passed/.test(l));
    if (lines.length > 60 && fails.length) console.log('every FAIL line, wherever it was:\n' + fails.join('\n') + '\n');
    console.log(lines.length > 60 ? '... ' + (lines.length - 60) + ' earlier lines omitted, run `node test/' + r.args[0] + '` for all of it ...\n' + lines.slice(-60).join('\n') : r.out);
  }
  if (VERBOSE) for (const r of results.filter(x => x.rc === 0)) console.log('\n=== ' + r.name + ' ===\n' + r.out);

  console.log('\n' + (bad.length ? 'FAIL  ' + bad.length + ' of ' + results.length + ' failed: ' + bad.map(r => r.name).join(', ') : 'ALL PASS  ' + results.length + ' checks, 0 failed'));
  process.exit(bad.length ? 1 : 0);
})();
