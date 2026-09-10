// M12 wave five: the long run, across every matchup.
//
// Everything else in test/ asks a question about one mechanic. This asks the question no single-
// mechanic test can: does the whole thing hold together for a long time, in every matchup, with the
// thirty-seven new defs of wave four actually being built and used?
//
// The four properties, and why each is here rather than assumed:
//
//   1. NOTHING THROWS. A def with a typo in a field the sim only reads in an unusual branch (a morph
//      source, an addon parent, a warp target) surfaces as one console.error hours in and is then
//      swallowed, because G.tick keeps going. Errors are captured, not printed.
//   2. NOTHING GOES NaN. A single NaN position propagates silently -- the unit is still "alive", still
//      selected, still counted, and every distance involving it is false. This is the failure mode
//      that the wreck footprint, the fractional sight radius and the spider-mine repair bug all had.
//   3. NOTHING GROWS WITHOUT BOUND. Fields, effects, wrecks and tumours are all lists that something
//      must remove from. A leak here is invisible in a fifteen-minute test and fatal in an hour.
//   4. A SNAPSHOT TAKEN MID-GAME RE-SIMULATES IDENTICALLY. This is the strongest cheap check in the
//      repo: it exercises every grid the snapshot has to carry (creep, blocked, walk, psi, height,
//      scar, wrecks) against a live game that has had time to scar the map and raise force fields.
//      map.height was added to the snapshot only because a check like this caught its absence.
//
// It also REPORTS COVERAGE rather than asserting it -- which defs were ever fielded, which abilities
// were ever cast, which upgrades were ever finished -- because "the AI never builds this" is the M11
// failure this milestone was written against, and a number you can read beats a threshold you argue
// about. The coverage assertions are deliberately loose; the report is the point.
//
//   node test/soak.js                    every matchup, three seeds, in parallel
//   node test/soak.js --frames=48000     longer games
//   node test/soak.js --seeds=5          more seeds
//   node test/soak.js --one=TZ:5         one game, in this process, JSON to stdout
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const FRAMES = parseInt(arg('frames', '32000'));
const NSEEDS = parseInt(arg('seeds', '3'));
const MATCHUPS = ['TT', 'TZ', 'TP', 'ZZ', 'ZP', 'PP'];
const SEEDS = Array.from({ length: NSEEDS }, (_, i) => 5 + i * 6);
const MARK = String.fromCharCode(1);

const loadSim = onError => {
  const c = { performance, Math, setTimeout, setInterval() { return 0; }, addEventListener() { },
    console: { log() { }, warn() { }, error: onError || (() => { }) },
    document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false },
    requestAnimationFrame() { } };
  c.window = c; c.globalThis = c; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f });
  return c;
};

// ------------------------------------------------------------------ one game
function play(races, seed, frames) {
  const errors = [];
  const ctx = loadSim((...a) => errors.push(a.map(x => (x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')));

  const src = `(() => {
    G.init({ players: [
      { race: '${races[0]}', human: false, difficulty: 'hard', name: 'A', team: 1 },
      { race: '${races[1]}', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: ${seed}, layout: 'temple' });
    G.recording = false;

    // Coverage hooks. Wrapping rather than polling, because a cast and a finished upgrade are EVENTS --
    // polling at any interval misses the ones that resolve between two samples, which is exactly the
    // mistake the Roach check in test/zerg12.js made before it was rewritten.
    //
    // ALL FIVE ENTRY POINTS, because they are not one set. cast() is only the resolution step for the
    // abilities that have one; issue() is the order-shaped route; morph(), merge() and warpIn() do not
    // pass through either. Hooking cast() alone reported three abilities used in a game that had also
    // morphed a Lair and a Ravager -- a metric measuring one code path while claiming to measure
    // behaviour, which is the same mistake the Roach check made and is worth naming twice.
    //
    // Even so this counts what the ABILITIES MODULE was asked to do, and a few ids in DATA.abilities
    // are executed as plain unit orders instead (burrow, siege_mode, stim) or are menu headings that
    // nothing ever "casts" (build_basic, morph_menu). The report labels itself accordingly rather than
    // pretending 80 is the denominator.
    const cast = {};
    const bump = id => { cast[id] = (cast[id] || 0) + 1; };
    for (const fn of ['cast', 'issue', 'instant', 'morph', 'merge']) {
      if (typeof Abilities[fn] !== 'function') continue;
      const orig = Abilities[fn].bind(Abilities);
      // morph/merge take (thing, id); the rest take (unit, id, ...)
      Abilities[fn] = (...a) => { const id = a[1]; if (typeof id === 'string') bump(id); return orig(...a); };
    }
    const warp = {}, ow = Abilities.warpIn ? Abilities.warpIn.bind(Abilities) : null;
    if (ow) Abilities.warpIn = (u, id, x, y) => { warp[id] = (warp[id] || 0) + 1; return ow(u, id, x, y); };

    const seen = {}, peak = { units: 0, fields: 0, effects: 0, projectiles: 0, wrecks: 0, tumours: 0, byId: 0 };
    let nan = null, threw = null;
    const sample = () => {
      let live = 0, tum = 0;
      for (const u of G.units) {
        if (!u.alive) continue;
        live++;
        if (u.def.id === 'creep_tumour') tum++;
        seen[u.def.id] = 1;
        if (!nan && !(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp)))
          nan = { id: u.def.id, owner: u.owner, x: u.x, y: u.y, hp: u.hp, frame: G.frame };
      }
      peak.units = Math.max(peak.units, live);
      peak.tumours = Math.max(peak.tumours, tum);
      peak.fields = Math.max(peak.fields, G.fields.length);
      peak.effects = Math.max(peak.effects, G.effects.length);
      peak.projectiles = Math.max(peak.projectiles, G.projectiles.length);
      peak.wrecks = Math.max(peak.wrecks, (G.map.wrecks || []).length);
      peak.byId = Math.max(peak.byId, G.byId.size);
    };

    // ---- the snapshot round trip, taken MID-GAME and not at the end ----
    // At the end is where this obviously goes and is where it measures nothing: at 'hard' most of
    // these games are decided well before the frame budget runs out, so G.over is already true and the
    // round trip is skipped in exactly the matchups that produced the most interesting map. It runs at
    // ROUND_AT instead -- far enough in for the ground to be scarred, wrecks standing, creep spread and
    // force fields up, and early enough that the game is still live.
    //
    // Live first: hashes over the next 240 frames. Then restore the snapshot taken BEFORE them and
    // re-derive the same 240. Any grid the snapshot forgets shows up here as a divergence, which is
    // how map.height was found missing.
    const ROUND_AT = Math.floor(${frames} * 0.45);
    let round = null;
    const roundTrip = () => {
      const wire = JSON.stringify(Snapshot.take());
      const live = []; for (let i = 0; i < 240; i++) { G.tick(); if (i % 24 === 0) live.push(G.frame + ':' + G.stateHash()); }
      Snapshot.restore(JSON.parse(wire));
      const back = []; for (let i = 0; i < 240; i++) { G.tick(); if (i % 24 === 0) back.push(G.frame + ':' + G.stateHash()); }
      return { ok: live.join(' ') === back.join(' '), at: G.frame, firstDiff: live.findIndex((h, i) => h !== back[i]) };
    };

    const t0 = Date.now();
    let endedAt = -1;
    try {
      for (let i = 0; i < ${frames}; i++) {
        G.tick();
        if ((i & 15) === 0) sample();
        if (G.over && endedAt < 0) endedAt = G.frame;
        // ...or the moment the game ends, if it ends first: a restore has to work on a finished game too
        if (!round && (i >= ROUND_AT || G.over)) { round = roundTrip(); i += 480; }
      }
    } catch (e) { threw = String(e && e.stack ? e.stack.split(String.fromCharCode(10)).slice(0, 4).join(' | ') : e); }
    sample();
    const ms = Date.now() - t0;

    const P = G.players.filter(p => !p.neutral).map(p => ({
      race: p.race, sup: p.supUsed, kills: p.stats.unitsKilled, lost: p.stats.unitsLost,
      tech: [...p.tech], upg: Object.keys(p.upg).filter(k => p.upg[k] > 0),
      bld: G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding).length,
      army: G.units.filter(u => u.alive && u.owner === p.id && !u.isBuilding && !u.def.worker).length,
    }));
    return { seen: Object.keys(seen), cast, warp, peak, nan, threw, round, ms, endedAt,
             over: G.over, winner: G.winner, frame: G.frame, players: P };
  })()`;

  const r = JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));
  r.errors = errors.slice(0, 4);
  r.races = races; r.seed = seed;
  return r;
}

// ------------------------------------------------------------------ one game, as a child
if (arg('one', null)) {
  const [races, seed] = arg('one').split(':');
  let r;
  try { r = play(races, parseInt(seed), FRAMES); }
  catch (e) { r = { races, seed: parseInt(seed), threw: String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e), seen: [], cast: {}, warp: {}, peak: {}, players: [], errors: [] }; }
  process.stdout.write(MARK + JSON.stringify(r) + MARK);
  process.exit(0);
}

// ------------------------------------------------------------------ the whole matrix
const jobs = [];
for (const m of MATCHUPS) for (const s of SEEDS) jobs.push(m + ':' + s);
const CAP = Math.max(1, Math.min(jobs.length, parseInt(arg('jobs', String(Math.max(2, os.cpus().length - 1))))));
console.log('soak: ' + jobs.length + ' games (' + MATCHUPS.length + ' matchups x ' + NSEEDS + ' seeds), ' + FRAMES + ' frames each, ' + CAP + ' at a time');
console.log('-'.repeat(96));

const results = [];
let next = 0, running = 0;
const t0 = Date.now();

function startOne() {
  if (next >= jobs.length) { if (running === 0) finish(); return; }
  const job = jobs[next++]; running++;
  let out = '';
  const ch = spawn(process.execPath, [__filename, '--one=' + job, '--frames=' + FRAMES], { cwd: root });
  ch.stdout.on('data', d => { out += d; });
  ch.stderr.on('data', d => { out += d; });
  ch.on('close', code => {
    running--;
    const parts = out.split(MARK);
    let r;
    if (parts.length >= 2) { try { r = JSON.parse(parts[1]); } catch (e) { r = null; } }
    if (!r) r = { races: job.split(':')[0], seed: +job.split(':')[1], threw: 'child exited ' + code + ': ' + out.slice(-240), seen: [], cast: {}, warp: {}, peak: {}, players: [], errors: [] };
    results.push(r); report(r);
    startOne();
  });
}
for (let i = 0; i < CAP; i++) startOne();

function report(r) {
  const tag = (r.races[0] + 'v' + r.races[1] + ' s' + r.seed).padEnd(9);
  if (r.threw) { console.log(tag + ' THREW  ' + String(r.threw).slice(0, 110)); return; }
  const p = r.players.map(x => x.race + ' ' + x.army + 'a/' + x.bld + 'b').join(' vs ');
  console.log(tag + ' ' + (Math.round(r.ms / 1000) + 's').padEnd(5) + ' ' +
    (r.over ? ('over f' + r.endedAt + ' w' + r.winner) : 'still live').padEnd(18) + ' ' + p.padEnd(24) +
    ' peak u' + r.peak.units + ' f' + r.peak.fields + ' e' + r.peak.effects +
    (r.round ? (r.round.ok ? '  snap ok' : '  SNAP DIVERGED@' + r.round.firstDiff) : '  snap n/a') +
    (r.nan ? '  NaN ' + r.nan.id : '') + (r.errors && r.errors.length ? '  ERR ' + r.errors.length : ''));
}

function finish() {
  console.log('-'.repeat(96));
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

  const threw = results.filter(r => r.threw);
  const nan = results.filter(r => r.nan);
  const errs = results.filter(r => r.errors && r.errors.length);
  const rounds = results.filter(r => r.round);
  const bad = rounds.filter(r => !r.round.ok);

  ok(results.length === jobs.length, 'every game ran', results.length + '/' + jobs.length);
  ok(threw.length === 0, 'no game threw', threw.map(r => r.races + ':' + r.seed + ' ' + r.threw).join(' | ').slice(0, 500));
  ok(errs.length === 0, 'no game logged a console error', errs.map(r => r.races + ':' + r.seed + ' ' + r.errors[0]).join(' | ').slice(0, 500));
  ok(nan.length === 0, 'no unit ever went NaN', nan.map(r => r.races + ':' + r.seed + ' ' + JSON.stringify(r.nan)).join(' | ').slice(0, 300));
  ok(rounds.length >= Math.floor(jobs.length / 2), 'enough games were still live to round-trip a snapshot', rounds.length + '/' + jobs.length);
  ok(bad.length === 0, 'every mid-game snapshot re-simulated identically', bad.map(r => r.races + ':' + r.seed + ' diff@' + r.round.firstDiff).join(' | '));

  // Boundedness. These are CEILINGS, not targets -- they exist to catch a list nothing removes from,
  // so they sit well above anything a real game reaches and are not balance numbers.
  const peakOf = k => Math.max(0, ...results.map(r => (r.peak && r.peak[k]) || 0));
  ok(peakOf('fields') <= 60, 'G.fields stays bounded', 'peak ' + peakOf('fields'));
  ok(peakOf('effects') <= 900, 'G.effects stays bounded', 'peak ' + peakOf('effects'));
  ok(peakOf('projectiles') <= 900, 'G.projectiles stays bounded', 'peak ' + peakOf('projectiles'));
  ok(peakOf('wrecks') <= 200, 'map wrecks stay bounded', 'peak ' + peakOf('wrecks'));
  ok(peakOf('tumours') <= 40, 'creep tumours stay bounded across a whole game', 'peak ' + peakOf('tumours'));

  // Every matchup must produce a real game, not two AIs sitting on their hands.
  for (const m of MATCHUPS) {
    const g = results.filter(r => r.races === m && !r.threw);
    const armies = g.map(r => Math.max(...r.players.map(p => p.army)));
    ok(g.length > 0 && Math.max(...armies) >= 8, m[0] + 'v' + m[1] + ' produces a real army', 'peak armies ' + JSON.stringify(armies));
  }

  // ---- coverage report ----
  const defs = JSON.parse(vm.runInContext('JSON.stringify({ u: Object.keys(DATA.units), b: Object.keys(DATA.buildings), a: Object.keys(DATA.abilities), t: Object.keys(DATA.techs), g: Object.keys(DATA.upgrades) })', loadSim()));

  const sawDef = new Set(); for (const r of results) for (const s of r.seen) sawDef.add(s);
  const sawCast = new Set(); for (const r of results) { for (const k of Object.keys(r.cast || {})) sawCast.add(k); for (const k of Object.keys(r.warp || {})) sawCast.add(k); }
  const sawTech = new Set(), sawUpg = new Set();
  for (const r of results) for (const p of r.players || []) { for (const t of p.tech) sawTech.add(t); for (const u of p.upg) sawUpg.add(u); }

  const line = (label, all, saw) => {
    const m = all.filter(x => !saw.has(x));
    console.log('\n' + label + ': ' + (all.length - m.length) + '/' + all.length +
      (m.length ? '\n  never seen: ' + m.join(', ') : '  -- all of them'));
    return m;
  };
  console.log('\n' + '='.repeat(96) + '\nCOVERAGE over ' + results.length + ' games (a report, not a verdict)\n' + '='.repeat(96));
  line('units fielded', defs.u, sawDef);
  line('buildings raised', defs.b, sawDef);
  // Labelled precisely: this is what the Abilities module was ASKED to do. A handful of ids in
  // DATA.abilities are never routed through it (burrow, siege_mode and stim are unit orders;
  // build_basic and morph_menu are card headings), so they will always read as unseen here.
  line('abilities invoked via Abilities.*', defs.a, sawCast);
  line('techs researched', defs.t, sawTech);
  line('upgrades finished', defs.g, sawUpg);

  // READ THE COVERAGE AGAINST THIS. Most of these games are decided in ten to twenty minutes, and a
  // def nobody lived long enough to build is not a def nobody can build. Without this line the report
  // reads as an indictment of the tech tree when it is mostly a statement about game length.
  const live = results.filter(r => !r.threw && !r.over).length;
  const ends = results.filter(r => r.over).map(r => r.endedAt).sort((a, b) => a - b);
  console.log('\ngame length: ' + live + '/' + results.length + ' still live at the ' + FRAMES + '-frame budget' +
    (ends.length ? '; the rest ended between f' + ends[0] + ' and f' + ends[ends.length - 1] +
      ' (median f' + ends[Math.floor(ends.length / 2)] + ')' : '; none of them ended'));

  // The one coverage claim worth ASSERTING: wave four is reachable in a real game.
  //
  // Split by tier, because one threshold over the whole roster cannot be honest at any game length.
  // The tier-1/2 half must appear in games of ordinary length -- that is the M11 failure this whole
  // milestone was written against, and it is a fair question at 32k frames. The tier-3 half is only a
  // fair question in a game long enough to reach tier 3, so it is REPORTED at the default length and
  // asserted only when the run is long enough to have earned the right to ask.
  //
  // There is deliberately no `stalker` in either list: it ships as Blink on the Dragoon, and listing a
  // def that is documented not to exist would make this permanently and meaninglessly red.
  const M12_EARLY = ['marauder', 'reaper', 'hellion', 'widow_mine', 'cyclone',
    'roach', 'baneling', 'ravager', 'swarm_host', 'overseer', 'creep_tumour',
    'sentry', 'immortal', 'phoenix', 'oracle', 'warp_prism'];
  const M12_LATE = ['thor', 'liberator', 'raven', 'banshee', 'viking', 'medivac',
    'viper', 'infestor', 'colossus', 'void_ray', 'tempest', 'disruptor', 'mothership'];
  const missOf = list => list.filter(id => !sawDef.has(id));
  const early = missOf(M12_EARLY), late = missOf(M12_LATE);
  console.log('');
  ok(early.length === 0, 'every tier-1/2 M12 def is fielded by an AI in a game of ordinary length',
    (M12_EARLY.length - early.length) + '/' + M12_EARLY.length + ' seen; missing: ' + early.join(', '));
  const LONG = FRAMES >= 80000;
  if (LONG) ok(late.length <= M12_LATE.length / 3, 'and most of the tier-3 M12 defs are reached in a LONG game',
    (M12_LATE.length - late.length) + '/' + M12_LATE.length + ' seen; missing: ' + late.join(', '));
  // ...and BINDING AT ORDINARY LENGTH from M13 onwards. This stayed a report for as long as the answer
  // was 4/13, because asserting a number nobody could reach is just a permanent red that tells you
  // nothing. M13 split the AI's single spending reserve into a committed budget and a free one and the
  // number went to 11/13 in a 32k-frame run, so it becomes a floor: it may go up, it may not quietly
  // go back down.
  //
  // THE TWO EXEMPTIONS ARE NAMED RATHER THAN ALLOWED FOR AS SLACK, so that fixing either one tightens
  // this test by itself instead of leaving a gap a third def could slip into. Both are morphs whose
  // gate in AI.production wants more of the source unit than the composition ever builds -- a Viper
  // needs five Mutalisks and a Mothership needs three Arbiters, and a solo 20-minute Zerg finishes on
  // two Mutalisks. That is the composition ratchet and it is NOT an economy fault: the buildings, the
  // tech and the money are all there by then.
  else {
    const KNOWN = ['viper', 'mothership'];
    const unexpected = late.filter(id => !KNOWN.includes(id));
    ok(unexpected.length === 0, 'every tier-3 M12 def but the two named morph gates is fielded at ordinary length',
      (M12_LATE.length - late.length) + '/' + M12_LATE.length + ' seen; missing ' + (late.join(', ') || 'none') +
      (unexpected.length ? '  --  NOT on the known list: ' + unexpected.join(', ') : '  (both known: they need 5 Mutalisks / 3 Arbiters)'));
    const fixed = KNOWN.filter(id => !late.includes(id));
    if (fixed.length) console.log('  NOTE: ' + fixed.join(', ') + ' is now reached -- delete it from KNOWN in test/soak.js so this stays binding');
  }

  console.log('\nwall clock ' + Math.round((Date.now() - t0) / 1000) + 's');
  console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
