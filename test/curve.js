// FIXLIST-M14 C7 (item 16) -- freehand formation shapes.
//
// "Enhance the right-drag formation line so the exact path of the mouse forms any shape -- parabolas,
// arcs, curves." The straight line works and the player said so, so the first thing checked here is
// that a STRAIGHT drag still takes the original path, untouched.
//
// DETERMINISM WAS THE WHOLE RISK and the architecture had already answered it. A formation does not
// enter the command log as a shape: lineCommand and curveCommand both RESOLVE it into one ordinary
// move order per unit, and it is those that CMD packs. The log therefore carries the OUTCOME rather
// than the input -- there is no path in it to re-derive, and no mouse state at replay time. The last
// section proves that by replaying a curved drag and comparing state hashes, which is the negative
// control the item said would matter most.
//
//   node test/curve.js
const fs = require('fs'), vm = require('vm'), path = require('path'), { makeCtx, makeOk, summary } = require('./_harness'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui'], ext: false, errors, collect: 'join' });
const ok = makeOk({ extra: 'nonempty' });
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

const STAGE = `
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 5 });
  UI.mode = 'play'; UI.menu = null; UI.keys = {};
  Render.W = 1280; Render.H = 800; Render.viewW = 1280; Render.viewH = 690; Render.camX = 0; Render.camY = 0;
  const p = G.players[0];
  const X = p.startX + 200, Y = p.startY + 200;
  const men = []; for (let i = 0; i < 8; i++) men.push(G.spawnUnit('marine', 0, X + (i % 4) * 24, Y + ((i / 4) | 0) * 24));
  const straight = []; for (let i = 0; i <= 20; i++) straight.push(100 + i * 20, 400);
  const wobbly = []; for (let i = 0; i <= 20; i++) wobbly.push(100 + i * 20, 400 + (i % 2 ? 6 : -6));
  const arc = []; for (let i = 0; i <= 20; i++) { const t = i / 20; arc.push(100 + t * 400, 400 - Math.sin(t * Math.PI) * 160); }
  const loop = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; loop.push(300 + Math.cos(a) * 120, 400 + Math.sin(a) * 120); }
`;

// =============================================================================
// 1. the switch: what counts as a curve
// =============================================================================
const sw = J(`(() => { ${STAGE}
  return { straight: UI.curved(straight), wobbly: UI.curved(wobbly), arc: UI.curved(arc), loop: UI.curved(loop),
    twoPoints: UI.curved([0, 0, 100, 100]), empty: UI.curved([]), bend: UI.CURVE_BEND };
})()`);
ok(sw.straight === false, 'A STRAIGHT DRAG IS STILL STRAIGHT -- it takes the original line path, untouched');
ok(sw.wobbly === false, '...and so is one with a hand-shake in it: ' + sw.bend + ' px off the chord before anything counts as a curve');
ok(sw.arc === true, 'an arc is a curve');
ok(sw.loop === true, 'and so is a closed loop, which has no chord to be straight along');
ok(sw.twoPoints === false && sw.empty === false, 'a two-point drag, or none at all, cannot be a curve', JSON.stringify([sw.twoPoints, sw.empty]));

// =============================================================================
// 2. arc length, which is what the units are spread by
// =============================================================================
const arc = J(`(() => { ${STAGE}
  const mid = UI.alongPath(straight, UI.pathLength(straight) / 2);
  return { lenStraight: Math.round(UI.pathLength(straight)), lenArc: Math.round(UI.pathLength(arc)),
    chord: Math.round(Math.hypot(arc[arc.length - 2] - arc[0], arc[arc.length - 1] - arc[1])),
    mid: mid.map(Math.round), start: UI.alongPath(arc, 0).map(Math.round), end: UI.alongPath(arc, UI.pathLength(arc)).map(Math.round) };
})()`);
ok(arc.lenArc > arc.chord, 'arc length follows the PATH, so a curve is longer than the chord across it', arc.lenArc + ' vs ' + arc.chord);
ok(arc.mid[0] === 300 && arc.mid[1] === 400, 'alongPath finds the midpoint of a straight run', JSON.stringify(arc.mid));
ok(arc.start[0] === 100 && arc.end[0] === 500, 'and both ends of a curved one exactly', JSON.stringify([arc.start, arc.end]));

// =============================================================================
// 3. the units land ON the curve, evenly, end to end
// =============================================================================
const spread = J(`(() => { ${STAGE}
  UI.selection = men.slice();
  UI.curveCommand(arc, false);
  const goals = men.map(u => u.order.type === 'move' ? [u.order.x, u.order.y] : null);
  if (!goals.every(g => g)) return { allMoving: false };
  // world-space copy of the drawn path, to measure against
  const wp = []; for (let i = 0; i < arc.length; i += 2) { const w = UI.screenToWorld(arc[i], arc[i + 1]); wp.push(w[0], w[1]); }
  const offPath = (gx, gy) => { let best = 1e9;
    for (let i = 0; i + 3 < wp.length; i += 2) {
      const ax = wp[i], ay = wp[i+1], bx = wp[i+2], by = wp[i+3];
      const dx = bx - ax, dy = by - ay, L2 = dx*dx + dy*dy || 1;
      let t = ((gx - ax) * dx + (gy - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(gx - (ax + dx*t), gy - (ay + dy*t));
      if (d < best) best = d; }
    return best; };
  const x0 = wp[0], y0 = wp[1], x1 = wp[wp.length-2], y1 = wp[wp.length-1];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const offChord = (gx, gy) => Math.abs(-(gx - x0) * (dy / L) + (gy - y0) * (dx / L));
  const gaps = []; for (let i = 1; i < goals.length; i++) gaps.push(Math.hypot(goals[i][0]-goals[i-1][0], goals[i][1]-goals[i-1][1]));
  gaps.sort((a, b) => a - b);
  return { allMoving: true,
    worstOffPath: Math.round(Math.max(...goals.map(g => offPath(g[0], g[1])))),
    mostOffChord: Math.round(Math.max(...goals.map(g => offChord(g[0], g[1])))),
    gapSpread: Math.round(gaps[gaps.length-1] - gaps[0]), gapMid: Math.round(gaps[gaps.length >> 1]),
    atStart: Math.round(Math.min(...goals.map(g => Math.hypot(g[0]-x0, g[1]-y0)))),
    atEnd: Math.round(Math.min(...goals.map(g => Math.hypot(g[0]-x1, g[1]-y1)))) };
})()`);
ok(spread.allMoving, 'a curved drag gives every selected unit a move order');
ok(spread.worstOffPath <= 8, 'EVERY GOAL SITS ON THE DRAWN PATH, within ' + spread.worstOffPath + ' px of it');
ok(spread.mostOffChord > 100, '...and NOT on the chord between its ends -- the shape is the stroke, not the line', String(spread.mostOffChord));
ok(spread.gapSpread < spread.gapMid * 0.5, 'the units are spread EVENLY BY ARC LENGTH', 'gaps vary by ' + spread.gapSpread + ' around ' + spread.gapMid);
ok(spread.atStart < 4 && spread.atEnd < 4, 'and the curve is used end to end, not bunched in the middle', JSON.stringify([spread.atStart, spread.atEnd]));

// =============================================================================
// 4. the bound the item asked for, and the rules the line already had
// =============================================================================
const rules = J(`(() => { ${STAGE}
  const out = { max: UI.CURVE_MAX, step: UI.CURVE_STEP };
  UI.lineDrag = { x0: 0, y0: 0, x1: 0, y1: 0, shift: false, pts: [0, 0] };
  for (let i = 1; i < UI.CURVE_MAX * 3; i++) UI.onMove({ clientX: i * 40, clientY: (i % 7) * 40 });
  out.samples = UI.lineDrag.pts.length / 2;
  out.capped = out.samples <= UI.CURVE_MAX;
  UI.lineDrag = null;
  const cc = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  UI.selection = [cc]; const before = cc.order.type;
  UI.curveCommand(arc, false);
  out.buildingUntouched = cc.order.type === before;
  UI.selection = [men[0]];
  UI.curveCommand(arc, false);
  const e = UI.screenToWorld(arc[arc.length-2], arc[arc.length-1]);
  out.singleToEnd = men[0].order.type === 'move' && Math.hypot(men[0].order.x - e[0], men[0].order.y - e[1]) < 4;
  return out;
})()`);
ok(rules.capped, 'a drag that wanders for ever is CAPPED at ' + rules.max + ' samples ' + rules.step + ' px apart', rules.samples + ' kept from ' + (rules.max * 3));
ok(rules.buildingUntouched, 'buildings are not dragged onto a curve, same as the line');
ok(rules.singleToEnd, 'and a single unit goes where you released, same as the line');

// =============================================================================
// 5. THE NEGATIVE CONTROL THAT MATTERS: a curved drag replays bit-identically
// =============================================================================
const rep = J(`(() => {
  const play = () => {
    G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 21 });
    UI.mode = 'play'; UI.menu = null; UI.keys = {}; G.recording = true; G.log = [];
    Render.W = 1280; Render.H = 800; Render.viewW = 1280; Render.viewH = 690; Render.camX = 0; Render.camY = 0;
    const p = G.players[0];
    const X = p.startX + 200, Y = p.startY + 200;
    const men = []; for (let i = 0; i < 8; i++) men.push(G.spawnUnit('marine', 0, X + (i % 4) * 24, Y + ((i / 4) | 0) * 24));
    for (let f = 0; f < 60; f++) G.tick();
    UI.selection = men.slice();
    const arc = []; for (let i = 0; i <= 20; i++) { const t = i / 20; arc.push(100 + t * 400, 400 - Math.sin(t * Math.PI) * 160); }
    UI.curveCommand(arc, false);
    const log = JSON.stringify(G.log);
    for (let f = 0; f < 300; f++) G.tick();
    return { hash: G.stateHash(), cmds: G.log.length, log };
  };
  const a = play(), b = play();
  return { same: a.hash === b.hash, sameLog: a.log === b.log, cmds: a.cmds, hash: a.hash, shapeInLog: /pts|curve|path/.test(a.log) };
})()`);
ok(rep.cmds >= 8, 'a curved drag puts one command per unit into the log', String(rep.cmds));
ok(!rep.shapeInLog, 'AND NO PATH AT ALL -- the log carries the resolved moves, so there is nothing to re-derive at replay time');
ok(rep.sameLog, 'the same commands, in the same order, both times');
ok(rep.same, 'A CURVED DRAG REPLAYS BIT-IDENTICALLY, 300 frames on', rep.hash);

// And nothing in the new code reaches for a clock or a random number.
{ const src = fs.readFileSync(path.join(root, 'js', 'ui.js'), 'utf8');
  const fn = src.slice(src.indexOf('curved(pts) {'), src.indexOf('lineCommand(x0, y0, x1, y1, shift) {'));
  ok(fn.length > 200, 'the curve code was found in js/ui.js', String(fn.length));
  ok(!/Math\.random|Date\.now|performance\./.test(fn), 'no Math.random, no clock, in curved / alongPath / pathLength / curveCommand'); }

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
summary({ nl: true });
