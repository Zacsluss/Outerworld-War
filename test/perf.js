// Performance test: 4 players at ~200 supply fighting in the middle of the map.
// Reports per-tick cost overall and for the expensive phases, plus a render-side pass count.
//   node test/perf.js [frames=600] [players=4] [layout=temple] [--sustain]
// --sustain disables damage so the armies stay at full size for the whole run (worst case).
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const FRAMES = parseInt(process.argv[2] || '600'), NP = parseInt(process.argv[3] || '4'), LAYOUT = (process.argv[4] || 'temple').replace(/^--.*/, 'temple'); const SUSTAIN = process.argv.includes('--sustain');
const ctx = { console, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const races = ['T', 'Z', 'P', 'T'].slice(0, NP);
vm.runInContext(`
  G.init({ players: [${races.map((r, i) => `{ race: '${r}', human: false, difficulty: 'normal', name: 'P${i}' }`).join(', ')}], seed: 5, layout: '${LAYOUT}' });
  // Fill each player to about 200 supply with a realistic army, all converging on the map centre.
  const ARMY = { T: ['marine', 'marine', 'marine', 'medic', 'siege_tank', 'vulture', 'goliath', 'wraith'], Z: ['zergling', 'zergling', 'hydralisk', 'hydralisk', 'mutalisk', 'lurker', 'ultralisk', 'scourge'], P: ['zealot', 'zealot', 'dragoon', 'dragoon', 'high_templar', 'reaver', 'corsair', 'archon'] };
  const cx = G.map.w * TILE / 2, cy = G.map.h * TILE / 2;
  for (const p of G.players) {
    p.minerals = 50000; p.gas = 50000;
    for (const t of Object.keys(DATA.techs)) p.tech.add(t);
    for (const u of Object.keys(DATA.upgrades)) p.upg[u] = 3;
    const list = ARMY[p.race]; let sup = 0, i = 0;
    const ang = (p.id / G.players.length) * Math.PI * 2;
    const bx = cx + Math.cos(ang) * 14 * TILE, by = cy + Math.sin(ang) * 14 * TILE;
    while (sup < 200 && i < 400) {
      const id = list[i % list.length]; const d = DATA.units[id];
      const t = G.map.findFreeTile(Math.floor(bx / TILE) + ((i * 7) % 13) - 6, Math.floor(by / TILE) + ((i * 5) % 13) - 6, 12);
      if (t) { const u = G.spawnUnit(id, p.id, (t[0] + .5) * TILE, (t[1] + .5) * TILE); if (u.def.interceptors !== undefined) u.interceptors = 8; if (u.def.scarabs !== undefined) u.scarabs = 10; u.applyOrder({ type: 'attackmove', x: cx, y: cy }); sup += d.sup || 1; }
      i++;
    }
  }
  G.recomputeSupply(); G.rebuildGrid(); G.updateVision();
  const counts = {}; for (const u of G.units) if (u.alive && !u.isBuilding) counts[u.owner] = (counts[u.owner] || 0) + 1;
  console.log('setup: ' + G.units.filter(u => u.alive).length + ' units, supply ' + G.players.map(p => p.supUsed).join('/') + ', per-player mobile ' + JSON.stringify(counts));

  if (${SUSTAIN ? 'true' : 'false'}) { G.damage = () => 0; G.damageRaw = () => {}; } // keep every unit alive so the load does not decay
  // ---- timed run, phase by phase ----
  const phase = {}; const mark = (k, t0) => { phase[k] = (phase[k] || 0) + (performance.now() - t0); };
  const origNear = G.near.bind(G); let nearCalls = 0; G.near = (x, y, r) => { nearCalls++; return origNear(x, y, r); };
  const origVision = G.updateVision.bind(G); G.updateVision = () => { const t0 = performance.now(); origVision(); mark('vision', t0); };
  const origGrid = G.rebuildGrid.bind(G); G.rebuildGrid = () => { const t0 = performance.now(); origGrid(); mark('grid', t0); };
  const origSep = G.separate.bind(G); G.separate = () => { const t0 = performance.now(); origSep(); mark('separate', t0); };
  const origPf = G.pf.find.bind(G.pf); let pathCalls = 0; G.pf.find = (...a) => { pathCalls++; const t0 = performance.now(); const r = origPf(...a); mark('pathfind', t0); return r; };
  for (const p of G.players) if (p.ai) { const o = p.ai.tick.bind(p.ai); p.ai.tick = () => { const t0 = performance.now(); o(); mark('ai', t0); }; }
  const t0 = performance.now(); const ticks = []; const idx = [];
  for (let i = 0; i < ${FRAMES}; i++) { const a = performance.now(); G.tick(); const d = performance.now() - a; ticks.push(d); idx.push([i, d]); }
  idx.sort((a, b) => b[1] - a[1]); console.log('slowest ticks: ' + idx.slice(0, 6).map(([i, d]) => 'f' + i + ' ' + d.toFixed(1) + 'ms').join('  '));
  const total = performance.now() - t0; ticks.sort((a, b) => a - b);
  const alive = G.units.filter(u => u.alive).length;
  console.log('ran ${FRAMES} ticks in ' + total.toFixed(0) + ' ms   mean ' + (total / ${FRAMES}).toFixed(2) + ' ms   median ' + ticks[ticks.length >> 1].toFixed(2) + ' ms   p95 ' + ticks[Math.floor(ticks.length * 0.95)].toFixed(2) + ' ms   max ' + ticks[ticks.length - 1].toFixed(2) + ' ms');
  console.log('units left ' + alive + ', G.near calls/tick ' + (nearCalls / ${FRAMES}).toFixed(0) + ', pathfind calls/tick ' + (pathCalls / ${FRAMES}).toFixed(1));
  const rows = Object.entries(phase).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + (v / ${FRAMES}).toFixed(2) + ' ms');
  console.log('phases per tick: ' + rows.join('   '));
  console.log((total / ${FRAMES}) <= 8 ? 'PASS sim tick under 8 ms' : 'FAIL sim tick over 8 ms');
`, ctx);
