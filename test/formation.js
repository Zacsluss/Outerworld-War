// Drag-line formation (M11 wave three, idea 9), as Beyond All Reason has it: hold right, drag a line,
// and the selection spreads evenly along it. The command moved from mouse-DOWN to mouse-UP to make that
// possible, so the first thing worth asserting is that a plain right-click -- a drag of zero length --
// still behaves exactly as it did.
//   node test/formation.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, addEventListener() { }, setTimeout, setInterval() { return 0; },
  localStorage: { getItem() { return null; }, setItem() { } },
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };
const r = vm.runInContext(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 5 });
  UI.mode = 'play'; UI.menu = null; UI.keys = {};
  Render.W = 1280; Render.H = 800; Render.viewW = 1280; Render.viewH = 690; Render.camX = 0; Render.camY = 0;
  const p = G.players[0], out = {};
  const X = p.startX + 200, Y = p.startY + 200;
  const men = []; for (let i = 0; i < 8; i++) men.push(G.spawnUnit('marine', 0, X + (i % 4) * 24, Y + ((i / 4) | 0) * 24));
  UI.selection = men.slice();
  // a line 600 px long, drawn left to right
  const ax = X - 300, ay = Y + 400, bx = X + 300, by = Y + 400;
  UI.lineCommand(ax, ay, bx, by, false);
  const goals = men.map(u => u.order.type === 'move' ? { x: Math.round(u.order.x), y: Math.round(u.order.y) } : null);
  out.allMoving = goals.every(g => g);
  out.onTheLine = goals.every(g => g && Math.abs(g.y - ay) < 2 && g.x >= ax - 2 && g.x <= bx + 2);
  const xs = goals.map(g => g.x).sort((a, b) => a - b);
  const gaps = xs.slice(1).map((v, i) => v - xs[i]);
  out.evenSpacing = Math.max(...gaps) - Math.min(...gaps) < 2;
  out.spansWholeLine = Math.abs(xs[0] - ax) < 2 && Math.abs(xs[xs.length - 1] - bx) < 2;
  // ordering: the leftmost unit takes the leftmost slot, so nobody crosses the group to reach a slot
  const byX = men.slice().sort((a, b) => a.x - b.x);
  out.noCrossing = byX.every((u, i) => Math.abs(Math.round(u.order.x) - xs[i]) < 2);
  // buildings and larvae are never dragged into a line
  const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  UI.selection = [cc]; const ccOrder = cc.order.type;
  UI.lineCommand(ax, ay, bx, by, false);
  out.buildingUntouched = cc.order.type === ccOrder;
  // a single unit just goes to the end of the line rather than to its midpoint
  UI.selection = [men[0]];
  UI.lineCommand(ax, ay, bx, by, false);
  out.singleGoesToEnd = Math.abs(Math.round(men[0].order.x) - bx) < 40;
  out.lineMin = UI.LINE_MIN;

  // --- shape holding: a plain move keeps the group's shape rather than collapsing it to a point ---
  const sq = []; for (let i = 0; i < 9; i++) sq.push(G.spawnUnit('marine', 0, X + (i % 3) * 60, Y + ((i / 3) | 0) * 60));
  UI.selection = sq.slice(); G.updateVision();
  const tx = X + 500, ty = Y + 500;
  UI.smartCommand(null, tx, ty, false);
  const gs = sq.map(u => u.order.type === 'move' ? [u.order.x, u.order.y] : null);
  out.shapeAllMoving = gs.every(g => g);
  const distinct = new Set(gs.map(g => Math.round(g[0]) + ',' + Math.round(g[1])));
  out.shapeDistinctGoals = distinct.size;
  // the spread of goals should resemble the spread they started with, not collapse to one point
  const spread = a => { const xs = a.map(v => v[0]), ys = a.map(v => v[1]); return Math.round(Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)); };
  out.startSpread = spread(sq.map(u => [u.x, u.y]));
  out.goalSpread = spread(gs);
  // a lone unit still goes exactly where told
  UI.selection = [sq[0]]; UI.smartCommand(null, tx, ty, false);
  out.singleExact = Math.round(sq[0].order.x) === Math.round(tx) && Math.round(sq[0].order.y) === Math.round(ty);
  out.cap = UI.SHAPE_CAP;
  return out;
})()`, ctx);
ok(r.allMoving, 'every selected unit gets a move order');
ok(r.onTheLine, 'every goal lies on the drawn line');
ok(r.evenSpacing, 'the goals are evenly spaced along it');
ok(r.spansWholeLine, 'and the line is used end to end, not bunched in the middle');
ok(r.noCrossing, 'units keep their left-to-right order, so nobody walks through the group to reach a slot');
ok(r.buildingUntouched, 'buildings are not dragged into formation');
ok(r.singleGoesToEnd, 'a single unit is sent to where you released, not to the midpoint');
ok(r.lineMin >= 8 && r.lineMin <= 64, 'the click/drag threshold is a sane number of pixels', String(r.lineMin));
ok(r.shapeAllMoving, 'a plain group move gives every unit a move order');
ok(r.shapeDistinctGoals > 1, 'the goals are not all the same point -- the group keeps its shape', String(r.shapeDistinctGoals));
ok(Math.abs(r.goalSpread - r.startSpread) < 40, 'the arriving shape resembles the departing one', 'start ' + r.startSpread + ' goal ' + r.goalSpread);
ok(r.singleExact, 'a single unit still goes exactly where it was told');
ok(r.cap > 0 && r.cap <= 16 * 32, 'the offset cap is bounded, so a map-wide selection converges', String(r.cap));
console.log(fail ? `FAIL  ${pass} passed, ${fail} failed` : `ALL PASS  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
