// Paired A/B of two balance logs:  node test/balance_ab.js before.log after.log [--race=T] [--matchup=TZ]
// A change is checked by running the same seeds before and after, not by running a fresh matrix and
// comparing two independent rates. Same seeds means the same maps and the same openings, so the pair
// (before, after) of one seed differs only by the change -- and the games that did not flip carry no
// information about it. Counting only the flips (McNemar) is why this can call a shift that comparing
// two Wilson intervals cannot: the intervals on two 60% rates over 380 games each overlap almost
// entirely, while twenty flips one way and four the other is decisive.
//
// It reads the per-game lines test/balance.js prints, so any run's stdout works as an input:
//   TZ temple    seed 6: T    at 8:58  sup 98/0  kills 92/11  (12.2s)
const fs = require('fs'), { wilson } = require('./balance');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const [beforeF, afterF] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!beforeF || !afterF) { console.error('usage: node test/balance_ab.js before.log after.log [--race=T] [--matchup=TZ]'); process.exit(2); }
const RACE = arg('race', 'T'), MU = arg('matchup', 'TZ'), pair = new Set([MU, MU[1] + MU[0]]);

// one line -> a game, keyed by the things that make it the same game on both sides
const read = f => { const m = new Map();
  for (const ln of fs.readFileSync(f, 'utf8').split('\n')) {
    const g = ln.match(/^(\w\w) (\w+)\s+seed (\d+): (\w+)/); if (!g || !pair.has(g[1])) continue;
    m.set(g[1] + '|' + g[2] + '|' + g[3], g[4]);   // matchup|layout|seed -> winner ('T', 'Z', 'draw')
  }
  return m; };
const A = read(beforeF), B = read(afterF);

const pct = (w, n) => n ? (w / n * 100).toFixed(0).padStart(3) + '%' : '  -  ';
const band = (w, n) => { const [lo, hi] = wilson(w, n); return '[' + (lo * 100).toFixed(0) + '-' + (hi * 100).toFixed(0) + ']'; };
const rate = (m, layout) => { let w = 0, n = 0;
  for (const [k, v] of m) { if (layout && k.split('|')[1] !== layout) continue; if (v === 'draw') continue; n++; if (v === RACE) w++; }
  return { w, n }; };
const layouts = [...new Set([...A.keys()].map(k => k.split('|')[1]))].sort();

console.log(beforeF + '  ->  ' + afterF + '   (' + MU + ', ' + RACE + '\'s win rate)\n');
console.log('  ' + 'layout'.padEnd(12) + 'before'.padEnd(22) + 'after'.padEnd(22) + 'delta');
for (const l of [...layouts, null]) {
  const a = rate(A, l), b = rate(B, l);
  const d = (a.n && b.n) ? ((b.w / b.n - a.w / a.n) * 100) : 0;
  console.log('  ' + (l || 'POOLED').padEnd(12)
    + (pct(a.w, a.n) + ' ' + band(a.w, a.n) + ' n=' + a.n).padEnd(22)
    + (pct(b.w, b.n) + ' ' + band(b.w, b.n) + ' n=' + b.n).padEnd(22)
    + (d >= 0 ? '+' : '') + d.toFixed(0) + ' pts');
}

// ---- the paired part: only the seeds present and decided in both logs, and only the ones that flipped
let both = 0, toRace = 0, fromRace = 0, same = 0, missing = 0;
for (const [k, a] of A) {
  const b = B.get(k); if (b === undefined) { missing++; continue; }
  if (a === 'draw' || b === 'draw') continue;
  both++;
  if (a === b) same++; else if (b === RACE) toRace++; else fromRace++;
}
const disc = toRace + fromRace;
// McNemar, exact two-sided binomial on the discordant pairs: under "the change did nothing" a flip is a
// coin toss, so the question is only whether the split of `disc` flips is one a coin would produce.
const lc = n => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
const binom = (k, n) => Math.exp(lc(n) - lc(k) - lc(n - k) - n * Math.LN2);
let p = 0; const lo = Math.min(toRace, fromRace);
for (let i = 0; i <= lo; i++) p += binom(i, disc);
p = Math.min(1, 2 * p);
console.log('\npaired on ' + both + ' seeds decided in both runs' + (missing ? ' (' + missing + ' had no counterpart)' : '') + ':');
console.log('  unchanged ' + same + '   flipped to ' + RACE + ' ' + toRace + '   flipped away from ' + RACE + ' ' + fromRace);
if (!disc) console.log('  no game changed result at all -- the change is invisible to this matchup');
else console.log('  ' + disc + ' discordant, exact two-sided p = ' + p.toFixed(3) + '   '
  + (p < 0.05 ? 'the balance MOVED' : 'no detectable shift (a coin would split ' + disc + ' flips this unevenly ' + (p * 100).toFixed(0) + '% of the time)'));
