// A recorded game re-simulated from its replay and watched for a production slot that stops advancing for ten seconds --
// tools/stall-probe.js's rules, on a game a player actually played. With no argument it takes the newest replay the
// playtest recorder saved (tools/playtest-listen.js writes them under .claude/review/playtest/<time>/).
//   node tools/stall-replay.js [replay.json]
// A replay from another build is re-simulated anyway and says so: the game may drift from what the player saw.
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const root = path.join(__dirname, '..');
const { makeCtx } = require(path.join(root, 'test', '_harness'));
const base = path.join(root, '.claude', 'review', 'playtest');
const newest = () => {
  if (!fs.existsSync(base)) return null;
  for (const d of fs.readdirSync(base).filter(x => /^\d{4}-/.test(x)).sort().reverse()) {
    const f = fs.readdirSync(path.join(base, d)).find(x => /^replay-.*\.json$/.test(x));
    if (f) return path.join(base, d, f);
  }
  return null;
};
const file = process.argv[2] || newest();
if (!file) { console.log('no replay found: pass one, or record a game with tools/playtest-listen.js'); process.exit(2); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot'], setInterval: true });
ctx.__data = data;
const r = vm.runInContext(`(() => {
  const d = __data;
  const build = BUILD.hash();
  G.init({ players: d.players, seed: d.seed, layout: d.layout });
  G.pendingCmds = { list: d.cmds || [], i: 0 };
  const last = (d.cmds && d.cmds.length) ? d.cmds[d.cmds.length - 1].f : 0, END = Math.max(d.frame || 0, last) + 24 * 30;
  const watching = new Map(), stalls = [];
  // The same reasons UI.stallExcuse gives (js/ui.js), in words.
  const why = (u, it) => u.lifted ? 'lifted' : u.morphT ? 'morphing' : u.inside ? 'inside a transport' : (u.addon && !u.addon.done) ? 'addon building' : u.unpowered ? 'unpowered'
    : (u.fx && (u.fx.stasis || u.fx.lockdown || u.fx.maelstrom)) ? 'disabled' : (it.kind === 'unit' && !it.started && !it.reserved && G.supplyBlocked(u.player, DATA.units[it.id])) ? 'supply blocked' : 'NOTHING EXPLAINS IT';
  for (let f = 0; f < END; f++) {
    G.tick();
    if (f % 4) continue;
    const seen = new Set();
    for (const u of G.units) {
      if (!u.alive || !u.prod || !u.prod.length) continue;
      const it = u.prod[0], key = u.id + '|' + it.kind + '|' + it.id + '|' + (it.level || 0); seen.add(key);
      const w = watching.get(key);
      if (!w || w.item !== it || w.p !== it.progress) { watching.set(key, { item: it, p: it.progress, f, reported: w && w.item === it ? w.reported : false }); continue; }
      if (!w.reported && f - w.f >= 240) { w.reported = true; stalls.push({ frame: f, clock: Math.floor(f / 1440) + ':' + String(Math.floor(f / 24) % 60).padStart(2, '0'), owner: u.owner, human: !!G.players[u.owner].human, building: u.def.id, item: it.kind + ':' + it.id, progress: it.progress, of: it.total, why: why(u, it) }); }
    }
    for (const k of [...watching.keys()]) if (!seen.has(k)) watching.delete(k);
  }
  return { build, replayBuild: d.build, frames: G.frame, cmds: (d.cmds || []).length, applied: G.pendingCmds.i, stalls, players: G.players.filter(p => !p.neutral).map(p => p.name + '/' + p.race + (p.human ? '' : ' AI')) };
})()`, ctx);
console.log('replay ' + path.relative(root, path.resolve(file)) + ': build ' + r.replayBuild + (r.replayBuild === r.build ? ' (this build)' : ' (NOT this build: ' + r.build + ' -- the re-simulation may drift)'));
console.log('  ' + r.players.join(', ') + '; ' + r.frames + ' frames re-simulated; ' + r.applied + ' of ' + r.cmds + ' commands applied');
const by = {}; for (const s of r.stalls) by[s.why] = (by[s.why] || 0) + 1;
console.log('  stalls over 10 s: ' + r.stalls.length + '  ' + JSON.stringify(by));
for (const s of r.stalls.filter(s => s.why === 'NOTHING EXPLAINS IT')) console.log('  UNEXPLAINED ' + JSON.stringify(s));
for (const s of r.stalls.filter(s => s.human)) console.log("  the player's: " + JSON.stringify(s));
