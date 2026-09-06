// AI-vs-AI balance matrix: every matchup on every layout, both sides, N seeds, run in parallel.
//   node test/balance.js [--frames=36000] [--seeds=1,2,3] [--layouts=temple,bloodbath,valley] [--matchups=TZ,TP,ZP] [--diff=normal] [--jobs=N]
// A game that has not ended at the frame cap is scored by supply + kills ("ahead"). Prints win rates per matchup and per layout.
const { spawn } = require('child_process'), path = require('path'), os = require('os'), fs = require('fs'), vm = require('vm');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
if (process.argv[2] === '--run') { // child: one game, prints a JSON line
  const [, , , m, layout, seed, frames, diff] = process.argv; const root = path.join(__dirname, '..');
  const ctx = { console: { log() { }, error() { }, warn() { } }, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  const out = vm.runInContext(`
    G.init({ players: [{ race: '${m[0]}', human: false, difficulty: '${diff}', name: 'A' }, { race: '${m[1]}', human: false, difficulty: '${diff}', name: 'B' }], seed: ${+seed}, layout: '${layout}' });
    const t0 = Date.now(); for (let i = 0; i < ${+frames} && !G.over; i++) G.tick();
    const score = p => p.supUsed + G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding).length * 2 + p.stats.unitsKilled * 0.5;
    const [a, b] = G.players; let winner = G.over ? G.winner : (score(a) > score(b) * 1.15 ? 0 : score(b) > score(a) * 1.15 ? 1 : -1);
    JSON.stringify({ m: '${m}', layout: '${layout}', seed: ${+seed}, over: G.over, winner, frames: G.frame, ms: Date.now() - t0, sup: [a.supUsed, b.supUsed], kills: [a.stats.unitsKilled, b.stats.unitsKilled], score: [Math.round(score(a)), Math.round(score(b))] });
  `, ctx);
  process.stdout.write(out + '\n'); process.exit(0);
}
const FRAMES = +arg('frames', 36000), SEEDS = arg('seeds', '1,2,3').split(',').map(Number), LAYOUTS = arg('layouts', 'temple,bloodbath,valley').split(','), MATCHUPS = arg('matchups', 'TZ,TP,ZP').split(','), DIFF = arg('diff', 'normal'), JOBS = +arg('jobs', Math.max(1, Math.min(8, os.cpus().length - 1)));
const jobs = []; for (const m of MATCHUPS) for (const layout of LAYOUTS) for (const seed of SEEDS) { jobs.push([m, layout, seed]); jobs.push([m[1] + m[0], layout, seed]); }
const results = []; let next = 0, running = 0; const t0 = Date.now();
function launch() {
  while (running < JOBS && next < jobs.length) {
    const [m, layout, seed] = jobs[next++]; running++;
    const ch = spawn(process.execPath, [__filename, '--run', m, layout, String(seed), String(FRAMES), DIFF]); let buf = '';
    ch.stdout.on('data', d => buf += d); ch.on('close', () => { running--; try { const r = JSON.parse(buf.trim()); results.push(r); const w = r.winner < 0 ? 'draw' : r.m[r.winner]; console.log(`${r.m} ${r.layout.padEnd(9)} seed ${r.seed}: ${w.padEnd(4)} ${r.over ? 'at ' + Math.floor(r.frames / 24 / 60) + ':' + String(Math.floor(r.frames / 24) % 60).padStart(2, '0') : 'cap'}  sup ${r.sup.join('/')}  kills ${r.kills.join('/')}  (${(r.ms / 1000).toFixed(1)}s)`); } catch (e) { console.log('run failed', m, layout, seed, buf.slice(0, 200)); } if (next < jobs.length) launch(); else if (!running) report(); });
  }
}
function report() {
  const pct = (a, n) => n ? Math.round(100 * a / n) + '%' : '-';
  const byMatch = {};
  for (const r of results) { const key = [r.m[0], r.m[1]].sort().join('v'); const b = byMatch[key] = byMatch[key] || { n: 0, wins: {}, draws: 0, layouts: {} }; b.n++; const L = b.layouts[r.layout] = b.layouts[r.layout] || { n: 0, wins: {}, draws: 0 }; L.n++; if (r.winner < 0) { b.draws++; L.draws++; } else { const race = r.m[r.winner]; b.wins[race] = (b.wins[race] || 0) + 1; L.wins[race] = (L.wins[race] || 0) + 1; } }
  console.log('\n=== balance matrix (' + results.length + ' games, ' + FRAMES + ' frames cap, ' + DIFF + ', ' + Math.round((Date.now() - t0) / 1000) + 's) ===');
  console.log('matchup   ' + LAYOUTS.map(l => l.padEnd(22)).join('') + 'overall');
  let bad = 0;
  for (const [key, b] of Object.entries(byMatch)) { const [r1, r2] = key.split('v'); const cell = c => `${r1} ${pct(c.wins[r1] || 0, c.n)} ${r2} ${pct(c.wins[r2] || 0, c.n)}${c.draws ? ' d' + c.draws : ''}`; console.log(key.padEnd(10) + LAYOUTS.map(l => (b.layouts[l] ? cell(b.layouts[l]) : '-').padEnd(22)).join('') + cell(b)); const decided = b.n - b.draws; for (const r of [r1, r2]) if (decided && (b.wins[r] || 0) / decided > 0.6) bad++; }
  console.log(bad ? 'OUTSIDE 60/40: ' + bad + ' matchup side(s)' : 'all matchups within 60/40 overall');
}
launch();
