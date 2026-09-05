// Finds the first frame where two identical simulations diverge. node test/diverge.js [frames]
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
function makeCtx() {
  const ctx = { console, Math, performance, addEventListener() { }, setTimeout, localStorage: { getItem() { return null; }, setItem() { } }, document: { getElementById: () => ({ style: {}, addEventListener() { }, click() { } }), createElement: () => ({ getContext: () => null, style: {}, click() { }, remove() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } } }, requestAnimationFrame() { }, Image: function () { } }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
  vm.runInContext(`UI.ping = () => {}; UI.onUnitDied = () => {}; UI.mode = 'play';
    G.init({ players: [{ race: 'T', human: true, name: 'H' }, { race: 'Z', human: false, difficulty: 'normal', name: 'C' }], seed: 7 });
    this.snap = () => G.units.filter(u => u.alive).map(u => u.id + ':' + u.def.id + ':' + u.x.toFixed(2) + ',' + u.y.toFixed(2) + ':' + u.hp.toFixed(1) + ':' + u.order.type + ':' + (u.order.target ? (u.order.target.id !== undefined ? 'u' + u.order.target.id : 'r' + u.order.target.id) : '') + ':' + u.cooldown + ':' + u.facing.toFixed(3)).join('|') + '#' + G.players.map(p => Math.floor(p.minerals) + '/' + Math.floor(p.gas)).join(';') + '#rng' + RNG.s;
    this.step = () => G.tick();`, ctx);
  return ctx;
}
const N = parseInt(process.argv[2] || '3000');
const a = makeCtx(), b = makeCtx();
for (let f = 0; f < N; f++) {
  a.step(); b.step();
  const sa = a.snap(), sb = b.snap();
  if (sa !== sb) {
    console.log('DIVERGED at frame', f + 1);
    const pa = sa.split('|'), pb = sb.split('|');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) if (pa[i] !== pb[i]) { console.log(' A:', pa[i]); console.log(' B:', pb[i]); break; }
    process.exit(1);
  }
}
console.log('identical for', N, 'frames');
