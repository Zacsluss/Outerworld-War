// Scripted human play-test. Drives a full game per matchup through the UI layer
// (selection, right-click smart commands, command-card buttons, hotkeys) while
// recording JS errors, stuck units and sim-invariant violations.
//   node test/playtest.js [TZ|PT|ZP|all|missions|<missionId>] [frames=28800] [seed=3] [--quiet] [--diff=easy|normal|hard] [--cheat=<minutes until money/cwal/tech cheats, default 6>]
//   "missions" drives all eight campaign missions through the same UI layer: briefing, race script, objective.
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const args = process.argv.slice(2).filter(a => !a.startsWith('--')); const quiet = process.argv.includes('--quiet');
const which = args[0] || 'all', FRAMES = parseInt(args[1] || '28800'), SEED = parseInt(args[2] || '3'); const DIFF = (process.argv.find(a => a.startsWith('--diff=')) || '--diff=easy').slice(7); const CHEAT_MIN = parseFloat((process.argv.find(a => a.startsWith('--cheat=')) || '--cheat=6').slice(8));
const MISSION_IDS = ['t1', 't2', 'z1', 'z2', 'p1', 'p2', 'z3', 'p3', 't3', 'z4', 'p4', 't4'];
const missionMode = which === 'missions' || MISSION_IDS.includes(which);
const matchups = missionMode ? (which === 'missions' ? MISSION_IDS : [which]) : which === 'all' ? ['TZ', 'PT', 'ZP'] : [which];
function makeCtx(errors) {
  const con = { log: quiet ? () => { } : console.log, warn: console.warn, error: (...a) => { errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ')); } };
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { } });
  const ctx = { console: con, Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; }, localStorage: { getItem() { return null; }, setItem() { } }, document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] }, requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'render', 'ui']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  return ctx;
}
const BOT = fs.readFileSync(path.join(__dirname, 'playtest_bot.js'), 'utf8');
const SCRIPTS = fs.readFileSync(path.join(__dirname, 'playtest_scripts.js'), 'utf8');
let anyFail = false;
for (const mu of matchups) {
  const errors = []; const ctx = makeCtx(errors);
  let me, en, layout, startOpts, label;
  if (missionMode) { // a mission fixes the races, map and seed; the harness only supplies the human
    const md = vm.runInContext('Missions.get("' + mu + '")', ctx);
    if (!md) { console.log('unknown mission ' + mu); anyFail = true; continue; }
    me = md.race; en = md.enemy.race; layout = md.layout; label = mu + ' "' + md.title + '" (' + me + ' vs ' + en + ' on ' + layout + ')';
    startOpts = "{ players: [{ race: '" + me + "', human: true, name: 'Zac', team: 1 }, { race: '" + en + "', human: false, difficulty: '" + md.enemy.difficulty + "', name: 'Enemy', team: 2 }], seed: " + md.seed + ", layout: '" + layout + "', mission: '" + mu + "' }";
  } else {
    me = mu[0]; en = mu[1]; layout = mu === 'TZ' ? 'temple' : mu === 'PT' ? 'valley' : 'bloodbath'; label = mu + ' on ' + layout;
    startOpts = "{ players: [{ race: '" + me + "', human: true, name: 'Zac', team: 1 }, { race: '" + en + "', human: false, difficulty: '" + DIFF + "', name: 'Computer', team: 2 }], seed: " + SEED + ", layout: '" + layout + "' }";
  }
  vm.runInContext(BOT, ctx, { filename: 'playtest_bot.js' }); vm.runInContext(SCRIPTS, ctx, { filename: 'playtest_scripts.js' });
  const t0 = Date.now();
  vm.runInContext(`
    Bot.quietLog = ${quiet};
    UI.start(${startOpts});
    if (UI.menu === 'brief') { const it = UI.menuItems().items.find(i => /begin/i.test(i[0])); if (!it) throw new Error('mission briefing has no Begin item'); it[1](); } // dismiss the briefing exactly as its button does
    if (UI.menu) throw new Error('a menu is still up after starting: ' + UI.menu);
    this.issues = [];
    const script = SCRIPTS['${me}'];
    for (let i = 0; i < ${FRAMES}; i++) {
      if (G.over) break;
      if (G.frame % 24 === 0) { try { script.think(); } catch (e) { Bot.errors.push('THINK ' + (e.stack || e).toString().split('\\n').slice(0, 3).join(' | ')); } }
      if (G.frame === Math.round(24 * 60 * ${CHEAT_MIN})) { Bot.chat('show me the money'); Bot.chat('operation cwal'); Bot.chat('medieval man'); Bot.log('cheats on'); }
      G.tick();
      UI.selection = UI.selection.filter(u => u.alive && !u.inside);
      if (G.frame % 24 === 0) Check.run(this.issues);
      if (G.frame % 2400 === 0) { const p = G.players[G.human], q = G.players[1 - G.human]; console.log('f' + G.frame + ' me: m' + Math.floor(p.minerals) + ' g' + Math.floor(p.gas) + ' ' + p.supUsed + '/' + p.supMax + ' bld' + G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding).length + ' army' + Bot.army().length + ' | ai: ' + q.supUsed + '/' + q.supMax + ' ' + q.ai.state + ' | actions ' + Bot.actions + ' cmds ' + G.log.length); }
    }
    this.result = { frames: G.frame, over: G.over, winner: G.winner, actions: Bot.actions, cmds: G.log.length, botErrors: Bot.errors, botIssues: Bot.issues,
      mission: G.mission ? { done: !!G.mission.done, won: G.over ? G.winner === G.human : null, objective: G.mission.def.objective } : null };
  `, ctx, { filename: 'playtest_main' });
  const r = ctx.result; const issues = ctx.issues;
  const uniq = arr => [...new Set(arr)];
  console.log(`\n=== ${label}: ${r.frames} frames in ${Date.now() - t0} ms, over=${r.over} winner=${r.winner}, ${r.actions} UI actions, ${r.cmds} commands ===`);
  const errs = uniq(errors.concat(r.botErrors)); const stuck = uniq(issues.filter(i => i.startsWith('STUCK'))); const other = uniq(issues.filter(i => !i.startsWith('STUCK')).concat(r.botIssues));
  if (r.mission) console.log(`objective: ${r.mission.objective} - ${r.mission.done ? (r.mission.won ? 'complete' : 'failed') : 'unresolved at the frame cap'}`);
  console.log('JS errors:', errs.length); errs.slice(0, 20).forEach(e => console.log('  ' + e));
  console.log('stuck units:', stuck.length); stuck.slice(0, 30).forEach(e => console.log('  ' + e));
  console.log('other issues:', other.length); other.slice(0, 30).forEach(e => console.log('  ' + e));
  if (errs.length || stuck.length) anyFail = true;
}
process.exit(anyFail ? 1 : 0);
