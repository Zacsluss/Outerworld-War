// Drag-line formation (M11 wave three, idea 9), as Beyond All Reason has it: hold right, drag a line,
// and the selection spreads evenly along it. The command moved from mouse-DOWN to mouse-UP to make that
// possible, so the first thing worth asserting is that a plain right-click -- a drag of zero length --
// still behaves exactly as it did. A plain right-click keeps a group's shape only when the group is together
// and the click is outside it; anything else gathers at the point (StarCraft II's rule, after the user's report).
//   node test/formation.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui'], ext: false });
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

  // --- ...but a selection that is NOT together gathers at the point (eighth session, the user's report) ---
  const clear = () => { for (const u of G.units.slice()) if (u.owner === 0 && !u.isBuilding) G.kill(u, null, true); G.units = G.units.filter(u => u.alive); };
  const send = (id, offs, tgt) => {
    clear();
    const us = offs.map(([dx, dy]) => G.spawnUnit(id, 0, X + dx, Y + dy));
    UI.selection = us.slice(); G.updateVision();
    const [gx, gy] = tgt(X, Y); UI.smartCommand(null, gx, gy, false);
    return { us, gx, gy, atPoint: us.every(u => u.order.type === 'move' && Math.round(u.order.x) === Math.round(gx) && Math.round(u.order.y) === Math.round(gy)) };
  };
  // the screenshot: three SCVs bunched together and one well away from them, sent far to the right
  const shot = send('scv', [[0, 150], [35, 160], [40, 215], [215, 0]], (x, y) => [x + 620, y + 40]);
  out.scatterAtPoint = shot.atPoint;
  for (let f = 0; f < 24 * 20; f++) G.tick();
  out.scatterBody = shot.us[0].def.body || shot.us[0].r;
  out.scatterFarthest = Math.round(Math.max(...shot.us.map(u => Math.hypot(u.x - shot.gx, u.y - shot.gy))));
  // two squads on opposite sides of a base
  const two = []; for (let i = 0; i < 4; i++) two.push([(i % 2) * 20, ((i / 2) | 0) * 20]); for (let i = 0; i < 4; i++) two.push([300 + (i % 2) * 20, 60 + ((i / 2) | 0) * 20]);
  out.squadsAtPoint = send('marine', two, (x, y) => [x + 150, y + 520]).atPoint;
  // a group that IS together, clicked inside the box it stands in: it tightens, as in StarCraft II
  const tight = []; for (let i = 0; i < 9; i++) tight.push([(i % 3) * 40, ((i / 3) | 0) * 40]);
  out.insideAtPoint = send('marine', tight, (x, y) => [x + 40, y + 40]).atPoint;
  out.outsideKeepsShape = !send('marine', tight, (x, y) => [x + 600, y + 300]).atPoint;
  // one clump, but a column longer than SHAPE_CAP either side of its middle: no formation anyone meant
  const column = []; for (let i = 0; i < 14; i++) column.push([i * 40, 0]);
  out.columnAtPoint = send('marine', column, (x, y) => [x + 260, y + 500]).atPoint;
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
ok(r.scatterAtPoint, 'units that are not together are all sent to the point itself (four SCVs, one far from the others)');
ok(r.scatterFarthest <= 4 * r.scatterBody, '...and twenty seconds later they stand gathered round it, not in their old spread (was 194 px out)', r.scatterFarthest + ' px, body ' + r.scatterBody);
ok(r.squadsAtPoint, 'two squads on opposite sides of a base gather at the point');
ok(r.insideAtPoint, 'a click inside the box a group stands in gathers it tighter');
ok(r.outsideKeepsShape, '...while the same group clicked outside that box keeps its shape');
ok(r.columnAtPoint, 'a column longer than SHAPE_CAP either side of its middle gathers rather than keeping a formation nobody meant');
summary();
