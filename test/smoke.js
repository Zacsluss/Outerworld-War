// Headless smoke test: loads the game scripts in a VM, runs an AI-vs-AI game for N frames.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = { console, performance, Math, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const frames = parseInt(process.argv[2] || '6000');
const races = (process.argv[3] || 'TZ').split('');
vm.runInContext(`
  UI.ping = () => {}; UI.onUnitDied = () => {}; UI.selection = []; UI.markers = [];
  G.init({ players: [{ race: '${races[0]}', human: true, name: 'H' }, { race: '${races[1] || 'P'}', human: false, difficulty: 'normal', name: 'C' }], seed: 1, layout: '${process.argv[4] || 'temple'}' });
  G.players[0].human = false; G.players[0].ai = new AI(G.players[0], 'normal'); G.players[0].showVision = true;
  const t0 = Date.now();
  for (let i = 0; i < ${frames}; i++) {
    G.tick();
    if (i % 1200 === 0) { const s = G.players.map(p => p.race + ' m' + Math.floor(p.minerals) + ' g' + Math.floor(p.gas) + ' sup' + p.supUsed + '/' + p.supMax + ' units' + G.units.filter(u => u.alive && u.owner === p.id && !u.isBuilding).length + ' bld' + G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding).length + ' ai:' + (p.ai ? p.ai.state + '/' + p.ai.scriptIdx : '-')).join(' | '); console.log('f' + i, s); }
  }
  console.log('done', ${frames}, 'frames in', Date.now() - t0, 'ms; over=', G.over, 'winner=', G.winner);
  const types = {}; for (const u of G.units) if (u.alive) types[u.owner + ':' + u.def.id] = (types[u.owner + ':' + u.def.id] || 0) + 1; console.log(JSON.stringify(types));
  for (const p of G.players) console.log(p.name, 'upg', JSON.stringify(p.upg), 'tech', [...p.tech].join(','), 'kills', p.stats.unitsKilled, 'lost', p.stats.unitsLost);
`, ctx);
