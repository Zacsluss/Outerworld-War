// Mission test: runs every campaign mission headlessly and checks that the setup placed what it promised,
// that the objective can be reached, and that nothing throws.
//   node test/missions.js [frames=20000] [id]
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const FRAMES = parseInt(process.argv[2] || '20000'); const ONLY = process.argv[3];
function makeCtx(errors) {
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, querySelectorAll: () => [] });
  const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ')) }, Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; }, localStorage: { getItem() { return null; }, setItem() { } }, document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] }, requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'x' } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'render', 'ui']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  vm.runInContext('Render.reset = () => {}; Render.frame = () => {}; UI.ping = () => {}; Render.W = 1280; Render.H = 720; Render.viewW = 1280; Render.viewH = 524; this.__G = G; this.__UI = UI; this.__M = Missions;', ctx);
  return ctx;
}
let fails = 0; const check = (ok, msg) => { console.log((ok ? '  PASS ' : '  FAIL ') + msg); if (!ok) fails++; };
const list = JSON.parse(vm.runInContext('JSON.stringify(__M.list.map(m => ({ id: m.id, race: m.race, title: m.title, layout: m.layout, objective: m.objective, minutes: m.minutes })))', makeCtx([])));
for (const def of list) {
  if (ONLY && def.id !== ONLY) continue;
  const errors = []; const ctx = makeCtx(errors);
  console.log('\n=== ' + def.id + ' ' + def.title + ' (' + def.race + ', ' + def.layout + ') — ' + def.objective);
  const t0 = Date.now();
  vm.runInContext(`
    const m = __M.get('${def.id}');
    UI.start({ players: [{ race: m.race, human: true, name: 'Player', team: 1 }, { race: m.enemy.race, human: false, difficulty: m.enemy.difficulty, name: 'Enemy', team: 2 }], seed: m.seed, layout: m.layout, mission: m.id });
    UI.menu = null;
    G.players[0].ai = new AI(G.players[0], 'normal'); G.players[0].showVision = true; // drive the player slot so the objective is actually attempted
    this.setup = { units: G.units.filter(u => u.alive && u.owner === 0).map(u => u.def.id), enemyUnits: G.units.filter(u => u.alive && u.owner === 1).length, fields: G.fields.map(f => f.kind), state: JSON.stringify(G.mission.state), minerals: Math.round(G.players[0].minerals), gas: Math.round(G.players[0].gas), tech: [...G.players[0].tech], nukes: G.players[0].nukes };
    // ground units that cannot reach their own base centre mean a bad placement
    this.unreachable = G.units.filter(u => u.alive && u.owner === 0 && !u.isBuilding && !u.fly && !u.def.larva).filter(u => { const t = u.tile(); return !G.map.walkable(t[0], t[1]); }).map(u => u.def.id + '@' + u.tile());
    this.overlap = G.units.filter(u => u.alive && u.isBuilding).filter((b, i, arr) => arr.some((o, j) => j > i && o.tx < b.tx + b.def.w && o.tx + o.def.w > b.tx && o.ty < b.ty + b.def.h && o.ty + o.def.h > b.ty)).map(b => b.def.id + '@' + b.tx + ',' + b.ty);
    for (let i = 0; i < ${FRAMES} && !G.over; i++) G.tick();
    this.result = { over: G.over, winner: G.winner, done: G.mission.done, frame: G.frame, mine: G.units.filter(u => u.alive && u.owner === 0).length, theirs: G.units.filter(u => u.alive && u.owner === 1).length, msgs: G.players[0].msgs.map(x => x.text) };
  `, ctx, { filename: def.id });
  const s = ctx.setup, r = ctx.result;
  console.log('  setup: ' + s.units.length + ' units (' + [...new Set(s.units)].join(',') + '), ' + s.minerals + 'm/' + s.gas + 'g, tech [' + s.tech.join(',') + ']' + (s.nukes ? ', nukes ' + s.nukes : '') + (s.fields.length ? ', fields [' + s.fields.join(',') + ']' : ''));
  check(!errors.length, 'no JS errors' + (errors.length ? ': ' + errors[0] : ''));
  check(!ctx.unreachable.length, 'all starting units on walkable ground' + (ctx.unreachable.length ? ': ' + ctx.unreachable.join(' ') : ''));
  check(!ctx.overlap.length, 'no overlapping buildings' + (ctx.overlap.length ? ': ' + ctx.overlap.join(' ') : ''));
  check(s.units.length > 1 && s.enemyUnits > 1, 'both sides have units (' + s.units.length + ' vs ' + s.enemyUnits + ')');
  console.log('  ran ' + r.frame + ' frames in ' + (Date.now() - t0) + ' ms: over=' + r.over + ' winner=' + r.winner + ' missionDone=' + r.done + ' mine=' + r.mine + ' theirs=' + r.theirs);
  if (r.msgs.length) console.log('  last messages: ' + r.msgs.slice(-3).join(' | '));
}
console.log(fails ? '\nFAILED ' + fails : '\nALL PASS');
process.exit(fails ? 1 : 0);
