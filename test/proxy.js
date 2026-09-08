// A cheap directional proxy for the balance number.
//   node test/proxy.js [--frames=14400] [--seeds=1,2,3] [--layouts=temple,bloodbath,valley] [--matchups=TZ] [--jobs=N]
//   node test/proxy.js --ab before.log after.log [--matchup=TZ] [--race=T]
//
// Why this exists: a balance claim costs a 40-to-90-minute run and M7 spent about 3,100 games on them,
// which is why so few ideas were ever tried. A win rate is one coin flip per game, so it needs hundreds
// of games to say anything. A *measurement taken at a fixed frame* on the *same seed* before and after
// is not a coin flip -- the two games are identical up to the change -- so the same confidence comes
// from far fewer and far shorter games. This runs to ten minutes instead of playing the game out, and
// asks how the two sides' positions differ there.
//
// It does not replace test/balance.js. It says which direction to expect and roughly how big, so a full
// run is spent confirming something rather than discovering it. test/proxy_validate.js is what says
// which of its indicators are worth believing, measured against runs already on disk.
const { spawn } = require('child_process'), path = require('path'), os = require('os'), fs = require('fs'), vm = require('vm');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };

// ---------------------------------------------------------------------------
// child: one game, sampled every 30 s, printed as one JSON line
// ---------------------------------------------------------------------------
if (process.argv[2] === '--run') {
  const [, , , m, layout, seed, frames, diff] = process.argv, root = path.join(__dirname, '..');
  const ctx = { console: { log() { }, error() { }, warn() { } }, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  ctx.__cfg = { m, layout, seed: +seed, frames: +frames, diff };
  const out = vm.runInContext(`(function () {
    const C = __cfg;
    G.init({ players: [{ race: C.m[0], human: false, difficulty: C.diff, name: 'A' }, { race: C.m[1], human: false, difficulty: C.diff, name: 'B' }], seed: C.seed, layout: C.layout });
    const isArmy = u => u.alive && !u.isBuilding && !u.def.worker && !u.def.larva && !u.def.egg;
    // A player's whole position, entirely from sim state. Everything the proxy can ever score is in
    // here, so one run can be re-scored under a different indicator without playing the games again.
    const snap = p => {
      let army = 0, wk = 0, bld = 0, prod = 0;
      for (const u of G.units) {
        if (!u.alive || u.owner !== p.id) continue;
        if (u.isBuilding) { if (u.done) { bld++; if (u.def.produces && u.def.produces.length) prod++; } continue; }
        if (u.def.worker) wk++; else if (isArmy(u)) army += u.def.sup || 0;
      }
      let upg = 0; for (const k in p.upg) upg += p.upg[k];
      return { sup: p.supUsed, max: p.supMax, army, wk, bld, prod, upg, tech: p.tech.size,
               kil: p.stats.unitsKilled, lost: p.stats.unitsLost, min: Math.round(p.stats.mined), gas: Math.round(p.stats.gassed) };
    };
    // First contact: the first second at which an army unit of one side is within 10 tiles of an army
    // unit or finished building of the other. M5 established that army supply here is what decides
    // these games, so it is worth a per-second check until it happens -- and nothing after.
    const contactNow = () => {
      for (const u of G.units) {
        if (!isArmy(u) || u.owner !== 0) continue;
        for (const o of G.near(u.x, u.y, 10 * TILE)) { if (o.owner === 0 || !o.alive) continue; if (isArmy(o) || (o.isBuilding && o.done)) return true; }
      }
      return false;
    };
    const [a, b] = G.players;
    const t0 = Date.now(); let contact = -1, atContact = null; const series = [];
    for (let i = 0; i < C.frames && !G.over; i++) {
      G.tick();
      if (contact < 0 && G.frame % 24 === 0 && contactNow()) { contact = G.frame; atContact = [snap(a), snap(b)]; }
      if (G.frame % 720 === 0) series.push([G.frame, snap(a), snap(b)]);
    }
    return JSON.stringify({ m: C.m, layout: C.layout, seed: C.seed, frames: G.frame, over: G.over, winner: G.over ? G.winner : -1,
      ms: Date.now() - t0, contact, atContact, end: [snap(a), snap(b)], series });
  })()`, ctx);
  process.stdout.write('PROXY ' + out + '\n'); process.exit(0);
}

// ---------------------------------------------------------------------------
// scoring: pair two proxy logs on identical seeds
// ---------------------------------------------------------------------------
// The unit of evidence is one seed's *margin*: an indicator for the race in question minus the same
// indicator for its opponent, on one map and one seed. Paired before/after, the difference of those two
// margins is what the change did on that seed, with the map and the openings differencing out. That is
// why this needs tens of games where a win rate needs hundreds.
const readProxy = f => {
  const rows = [];
  for (const ln of fs.readFileSync(f, 'utf8').split('\n')) { const i = ln.indexOf('PROXY {'); if (i < 0) continue; try { rows.push(JSON.parse(ln.slice(i + 6))); } catch (e) { } }
  return rows;
};
// `sampleAt` picks the last 30-second sample at or before a frame, so "upgrades at ten minutes" is one
// of these. A game that ended before the mark has no sample there and drops out of the pairing.
const sampleAt = (r, fr) => { let best = null; for (const s of r.series) { if (s[0] > fr) break; best = s; } return best && best[0] >= fr - 720 ? [best[1], best[2]] : null; };
const INDICATORS = {
  'upg@10': r => { const s = sampleAt(r, 14400); return s && s.map(x => x.upg); },
  'upgtech@10': r => { const s = sampleAt(r, 14400); return s && s.map(x => x.upg + x.tech); },
  'army@contact': r => r.atContact && r.atContact.map(x => x.army),
  'army@10': r => { const s = sampleAt(r, 14400); return s && s.map(x => x.army); },
  'sup@10': r => { const s = sampleAt(r, 14400); return s && s.map(x => x.sup); },
  'wk@10': r => { const s = sampleAt(r, 14400); return s && s.map(x => x.wk); },
  'bld@10': r => { const s = sampleAt(r, 14400); return s && s.map(x => x.bld); },
  'mined@10': r => { const s = sampleAt(r, 14400); return s && s.map(x => x.min + x.gas); },
  'kills@cap': r => r.end && r.end.map(x => x.kil),
  // test/balance.js's own tiebreak score, at whatever frame this run stopped at. The closest thing the
  // proxy has to "who is winning", and the only indicator that uses games that ended before the cap.
  'score@cap': r => r.end && r.end.map(x => x.sup + x.bld * 2 + x.kil * 0.5),
};
// The three that reproduced all five paid-for balance calls in test/proxy_validate.js, with no false
// alarms on the four that did nothing. Everything else in INDICATORS is kept because it is free to
// compute and useful for reading the mechanism -- but do not take a balance call from it. In
// particular upg@10 and army@contact, the two candidates HANDOFF expected to win, both fire at
// p < 0.05 in the wrong direction on calls the full runs settled.
const VALIDATED = ['sup@10', 'bld@10', 'score@cap'];
// Sign test on the paired deltas: under "the change did nothing" each seed's delta is as likely to be
// positive as negative. The same logic as balance_ab.js's McNemar, applied to a number instead of a flip.
const lc = n => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
const binom = (k, n) => Math.exp(lc(n) - lc(k) - lc(n - k) - n * Math.LN2);
function signTest(pos, neg) { const n = pos + neg; if (!n) return 1; let p = 0; for (let i = 0; i <= Math.min(pos, neg); i++) p += binom(i, n); return Math.min(1, 2 * p); }

// The paired deltas for one indicator. Returns null when neither log recorded it (e.g. no contact).
function score(A, B, ind, RACE, MU) {
  const pair = new Set([MU, MU[1] + MU[0]]), key = r => r.m + '|' + r.layout + '|' + r.seed;
  const margin = r => { const v = INDICATORS[ind](r); if (!v) return null; const i = r.m[0] === RACE ? 0 : 1; return v[i] - v[1 - i]; };
  const mA = new Map(); for (const r of A) if (pair.has(r.m)) { const g = margin(r); if (g !== null) mA.set(key(r), g); }
  const ds = [];
  for (const r of B) { if (!pair.has(r.m)) continue; const before = mA.get(key(r)); if (before === undefined) continue; const g = margin(r); if (g === null) continue; ds.push(g - before); }
  if (!ds.length) return null;
  const pos = ds.filter(d => d > 0).length, neg = ds.filter(d => d < 0).length;
  return { n: ds.length, mean: ds.reduce((a, b) => a + b, 0) / ds.length, pos, neg, tie: ds.length - pos - neg, p: signTest(pos, neg) };
}

if (process.argv[2] === '--ab') {
  const files = process.argv.slice(3).filter(a => !a.startsWith('--'));
  const RACE = arg('race', 'T'), MU = arg('matchup', 'TZ');
  const A = readProxy(files[0]), B = readProxy(files[1]);
  console.log(files[0] + '  ->  ' + files[1] + '   (' + MU + ', margin for ' + RACE + ')\n');
  console.log('  ' + 'indicator'.padEnd(15) + 'paired delta'.padEnd(14) + 'n'.padEnd(6) + '+/-/='.padEnd(12) + 'sign-test p');
  const fired = [];
  for (const ind of Object.keys(INDICATORS)) {
    const s = score(A, B, ind, RACE, MU);
    if (!s) { console.log('  ' + ind.padEnd(15) + '(not recorded)'); continue; }
    const v = VALIDATED.includes(ind);
    if (v && s.p < 0.05) fired.push({ ind, dir: s.mean > 0 ? 1 : -1 });
    console.log('  ' + (v ? '* ' : '  ') + ind.padEnd(13) + ((s.mean >= 0 ? '+' : '') + s.mean.toFixed(2)).padEnd(14) + String(s.n).padEnd(6)
      + (s.pos + '/' + s.neg + '/' + s.tie).padEnd(12) + s.p.toFixed(3) + (s.p < 0.05 ? '  <' : ''));
  }
  // The call. Only the starred rows get a vote; see test/proxy_validate.js for why the others do not.
  const toRace = fired.filter(f => f.dir > 0).length, away = fired.filter(f => f.dir < 0).length;
  console.log('\n  * = validated against five full balance runs (test/proxy_validate.js). Only these three vote.\n');
  if (!fired.length) console.log('  CALL: nothing. None of the three moved. Not worth a full run unless you have another reason;');
  else if (toRace && away) console.log('  CALL: split -- ' + toRace + ' toward ' + RACE + ', ' + away + ' away. Read the mechanism rows above before spending a run.');
  else console.log('  CALL: ' + fired.length + ' of 3 moved toward ' + (toRace ? RACE : MU.replace(RACE, '')) + '. Worth confirming with test/balance.js.');
  if (!fired.length) console.log('        a quiet proxy is not proof of neutrality, only of "no large move". See proxy_validate.js.');
  process.exit(0);
}

module.exports = { readProxy, INDICATORS, score, signTest, sampleAt };

// ---------------------------------------------------------------------------
// parent: spawn the games
// ---------------------------------------------------------------------------
if (require.main === module) {
  const FRAMES = +arg('frames', 14400), SEEDS = arg('seeds', '1,2,3').split(',').map(Number),
    LAYOUTS = arg('layouts', 'temple,bloodbath,valley').split(','), MATCHUPS = arg('matchups', 'TZ').split(','),
    DIFF = arg('diff', 'normal'), JOBS = +arg('jobs', Math.max(1, Math.min(8, os.cpus().length - 1)));
  const jobs = []; for (const m of MATCHUPS) for (const layout of LAYOUTS) for (const seed of SEEDS) { jobs.push([m, layout, seed]); jobs.push([m[1] + m[0], layout, seed]); }
  let next = 0, running = 0, done = 0; const t0 = Date.now();
  (function launch() {
    while (running < JOBS && next < jobs.length) {
      const [m, layout, seed] = jobs[next++]; running++;
      const ch = spawn(process.execPath, [__filename, '--run', m, layout, String(seed), String(FRAMES), DIFF]); let buf = '';
      ch.stdout.on('data', d => buf += d);
      ch.on('close', () => {
        running--; done++; process.stdout.write(buf.trim() + '\n');
        if (next < jobs.length) launch();
        else if (!running) console.log('\n' + done + ' games to frame ' + FRAMES + ' in ' + Math.round((Date.now() - t0) / 1000) + 's');
      });
    }
  })();
}
