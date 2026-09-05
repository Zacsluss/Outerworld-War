// Determinism + replay test: node test/determinism.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
function makeCtx() {
  const ctx = { console, Math, performance, addEventListener() { }, setTimeout, localStorage: { getItem() { return null; }, setItem() { } }, document: { getElementById: () => ({ style: {}, addEventListener() { }, click() { } }), createElement: () => ({ getContext: () => null, style: {}, click() { }, remove() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } } }, requestAnimationFrame() { }, Image: function () { } }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
  vm.runInContext('UI.ping = () => {}; UI.onUnitDied = () => {}; UI.mode = "play";', ctx);
  return ctx;
}
const script = (withCmds, replayLog) => `
  G.init({ players: [{ race: 'T', human: true, name: 'H' }, { race: 'Z', human: false, difficulty: 'normal', name: 'C' }], seed: 7 });
  G.recording = ${withCmds}; G.log = []; ${replayLog ? 'G.pendingCmds = { list: ' + JSON.stringify(replayLog) + ', i: 0 };' : ''}
  const hall = G.units.find(u => u.isBuilding && u.owner === 0);
  for (let f = 0; f < 3000; f++) {
    if (${withCmds}) {
      if (f === 50) { const w = G.units.filter(u => u.owner === 0 && u.def.worker); w[0].setOrder({ type: 'move', x: hall.x + 200, y: hall.y + 150 }); }
      if (f === 120) G.queueUnit(hall, 'scv');
      if (f === 400) { const w = G.units.filter(u => u.owner === 0 && u.def.worker && u.alive)[1]; const t = G.map.findFreeTile(Math.floor(hall.x / TILE) + 6, Math.floor(hall.y / TILE) + 2, 10); w.setOrder({ type: 'build', def: DATA.buildings.supply_depot, tx: t[0], ty: t[1] }); }
      if (f === 1500) { const w = G.units.filter(u => u.owner === 0 && u.def.worker && u.alive)[2]; const t = G.map.findFreeTile(Math.floor(hall.x / TILE) + 8, Math.floor(hall.y / TILE) + 5, 10); w.setOrder({ type: 'build', def: DATA.buildings.barracks, tx: t[0], ty: t[1] }); }
      if (f === 2000) G.cheat('show me the money');
    }
    G.tick();
  }
  let h = 0; for (const u of G.units) { if (!u.alive) continue; h = (h * 31 + u.id) | 0; h = (h + Math.round(u.x * 10) * 7 + Math.round(u.y * 10) * 13 + Math.round(u.hp * 10) * 3 + (u.def.id.length)) | 0; }
  for (const p of G.players) h = (h + Math.round(p.minerals) * 17 + Math.round(p.gas) * 19 + p.supUsed) | 0;
  this.__out = { hash: h, log: G.log, units: G.units.filter(u => u.alive).length, blds: G.units.filter(u => u.alive && u.owner === 0 && u.isBuilding).map(u => u.def.id) };
`;
const a = makeCtx(); vm.runInContext(script(false, null), a); const b = makeCtx(); vm.runInContext(script(false, null), b);
console.log('AI-only runs equal:', a.__out.hash === b.__out.hash, a.__out.hash, b.__out.hash);
const c = makeCtx(); vm.runInContext(script(true, null), c);
console.log('recorded', c.__out.log.length, 'commands; buildings:', c.__out.blds.join(','));
const d = makeCtx(); vm.runInContext(script(false, c.__out.log), d);
console.log('replay equals original:', c.__out.hash === d.__out.hash, c.__out.hash, d.__out.hash, 'units', c.__out.units, d.__out.units);
if (a.__out.hash !== b.__out.hash || c.__out.hash !== d.__out.hash) process.exit(1);
