// TODO-M18 item 4: "some tech gets stuck during research". NOT YET REPRODUCED, so this is the probe and
// it comes before any fix. It does not guess a cause -- it watches every production slot in a long game
// and, when one stops advancing, records the state of the building that owns it so the case names itself.
//
//   node tools/stall-probe.js [--minutes=25] [--seeds=1,2,3] [--stall=240] [--verbose]
//
// WHAT COUNTS AS A STALL. A slot advances one point of progress per frame, so any gap is suspicious --
// but several gaps are the rules working:
//   * a UNIT slot waiting on supply (Unit.tickProduction returns while G.supplyBlocked)
//   * a building whose ADD-ON is still being built (tickBuilding returns at `this.addon && !this.addon.done`)
//   * a LIFTED building (tickBuilding returns at `this.lifted`)
//   * one under stasis, lockdown or maelstrom (Unit.tick returns before tickBuilding)
//   * a Protoss building with no power
//   * one that is mid-morph (morphT)
// So the probe reports the stall AND every one of those flags at the moment it noticed, and again when
// it ends. A stall with none of them set is the bug; a stall that never ends is the bug whatever is set.
'use strict';
const path = require('path'), vm = require('vm');
const { makeCtx } = require(path.join(__dirname, '..', 'test', '_harness'));

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const MINUTES = parseFloat(arg('minutes', '25'));
const SEEDS = arg('seeds', '3,7,11').split(',').map(Number);
const STALL = parseInt(arg('stall', '240'), 10);      // 10 s at TPS 24
const VERBOSE = process.argv.includes('--verbose');
const FRAMES = Math.round(MINUTES * 60 * 24);

const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'] });
ctx.__opts = { FRAMES, STALL, VERBOSE };

const RACES = [['T', 'Z', 'P', 'T', 'Z', 'P'], ['Z', 'P', 'T', 'Z', 'P', 'T']];

const all = [];
for (let si = 0; si < SEEDS.length; si++) {
  const seed = SEEDS[si];
  ctx.__seed = seed; ctx.__races = RACES[si % RACES.length];
  const r = vm.runInContext(`(() => {
    const races = __races, seed = __seed, FRAMES = __opts.FRAMES, STALL = __opts.STALL;
    G.init({
      players: races.map((race, i) => ({ race, human: i === 0, difficulty: 'hard', name: race + i, team: i + 1 })),
      seed, layout: 'temple',
    });
    // every player driven by the AI, including slot 0 -- a human slot that does nothing researches nothing
    for (let i = 0; i < G.players.length; i++) { const p = G.players[i]; if (!p.neutral && !p.ai) p.ai = new AI(p, 'hard'); }
    const watching = new Map();   // key -> { last, lastFrame, startedFrame, u, it }
    const stalls = [], ended = [];
    const snap = (u, it, frame) => ({
      frame, owner: u.owner, race: u.def.race, building: u.def.id, bid: u.id,
      kind: it.kind, what: it.id + (it.level ? ' L' + it.level : ''), progress: Math.round(it.progress), total: it.total,
      alive: !!u.alive, done: !!u.done, lifted: !!u.lifted, morphT: u.morphT | 0, unpowered: !!u.unpowered,
      addon: u.addon ? (u.addon.def.id + (u.addon.done ? ' done' : ' BUILDING')) : null,
      slot: u.prod.indexOf(it), queue: u.prod.length,
      stasis: u.fx.stasis | 0, lockdown: u.fx.lockdown | 0, maelstrom: u.fx.maelstrom | 0,
      supplyBlocked: it.kind === 'unit' && !it.started ? !!G.supplyBlocked(u.player, DATA.units[it.id]) : false,
      started: !!it.started, reserved: !!it.reserved,
      // Every early return in Unit.tick between the top and the egg's tickProduction call, because one of
      // them is the only way an egg's slot can sit still: an egg is not gated on supply and its progress
      // is incremented unconditionally.
      inside: !!u.inside, burrowed: !!u.burrowed, disabled: !!u.disabled, transT: u.transT | 0, digT: u.digT | 0,
      egg: !!u.def.egg, isBuilding: !!u.isBuilding, larva: !!u.def.larva, order: u.order ? u.order.type : null,
      hp: Math.round(u.hp), insideOf: u.inside && u.inside.def ? u.inside.def.id : null,
    });
    for (let f = 0; f < FRAMES; f++) {
      G.tick();
      if (G.over) break;
      if (f % 4) continue;                       // sampled: a slot advances one a frame, so a 4-frame grid still sees every stall over STALL
      const seen = new Set();
      for (const u of G.units) {
        if (!u.alive || !u.prod || !u.prod.length) continue;
        // prod[0] only -- plus prod[1] when a finished Reactor is advancing it in parallel. Everything
        // behind those is waiting its turn, which is what a queue is, and watching it buried the real
        // signal 56 to 2 on the first run.
        const slots = (u.addon && u.addon.def.reactor && u.addon.done && u.prod.length > 1 && u.prod[0].kind === 'unit' && u.prod[1].kind === 'unit') ? [0, 1] : [0];
        for (const s of slots) {
          const it = u.prod[s];
          const key = u.id + '|' + s + '|' + it.kind + '|' + it.id + '|' + (it.level || 0);
          seen.add(key);
          let w = watching.get(key);
          if (!w) { watching.set(key, { last: it.progress, lastFrame: f, reported: false, item: it }); continue; }
          if (it !== w.item || it.progress !== w.last) {     // advanced, or the slot was replaced by a different item under the same key
            if (w.reported) { ended.push({ key, resumedAtFrame: f, stalledFrames: f - w.lastFrame, at: snap(u, it, f) }); w.reported = false; }
            w.last = it.progress; w.lastFrame = f; w.item = it; continue;
          }
          if (!w.reported && f - w.lastFrame >= STALL) { w.reported = true; stalls.push(Object.assign({ stalledFrames: f - w.lastFrame }, snap(u, it, f))); }
        }
      }
      for (const key of [...watching.keys()]) if (!seen.has(key)) watching.delete(key);   // finished, cancelled, or the building died
    }
    // anything still stalled when the game ended NEVER resumed, which is the shape the user reported
    const stuckAtEnd = stalls.filter(s => !ended.some(e => e.key === s.bid + '|' + s.slot + '|' + s.kind + '|' + s.what.split(' L')[0] + '|' + (s.what.includes(' L') ? +s.what.split(' L')[1] : 0)));
    return { frames: G.frame, over: !!G.over, stalls, ended, stuckAtEnd: stuckAtEnd.length, players: G.players.filter(p => !p.neutral).map(p => p.race + (p.alive ? '' : ' dead')) };
  })()`, ctx);
  r.seed = seed; all.push(r);
  console.log('seed ' + seed + '  ' + r.frames + ' frames (' + (r.frames / 24 / 60).toFixed(1) + ' min)' + (r.over ? ', game over' : '') + '  players ' + r.players.join(','));
  console.log('  stalls over ' + STALL + ' frames: ' + r.stalls.length + '   of which never resumed: ' + r.stuckAtEnd);
  const byKind = {};
  for (const s of r.stalls) {
    const why = s.lifted ? 'lifted' : s.morphT ? 'morphing' : s.addon && /BUILDING/.test(s.addon) ? 'addon building' : s.unpowered ? 'unpowered'
      : s.stasis ? 'stasis' : s.lockdown ? 'lockdown' : s.maelstrom ? 'maelstrom' : s.supplyBlocked ? 'supply blocked'
      : s.slot > 0 ? 'behind another item in the queue' : 'NOTHING EXPLAINS IT';
    byKind[why] = (byKind[why] || 0) + 1;
  }
  for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log('    ' + String(n).padStart(4) + '  ' + k);
  const bad = r.stalls.filter(s => !s.lifted && !s.morphT && !(s.addon && /BUILDING/.test(s.addon)) && !s.unpowered && !s.stasis && !s.lockdown && !s.maelstrom && !s.supplyBlocked && s.slot === 0);
  for (const s of bad.slice(0, VERBOSE ? 50 : 6)) console.log('    UNEXPLAINED  ' + JSON.stringify(s));
  if (VERBOSE) for (const s of r.stalls.slice(0, 40)) console.log('    stall  ' + JSON.stringify(s));
}
const tot = all.reduce((n, r) => n + r.stalls.length, 0);
console.log('\n' + tot + ' stall(s) over ' + STALL + ' frames across ' + SEEDS.length + ' game(s) of ' + MINUTES + ' minutes.');
console.log(all.reduce((n, r) => n + r.stuckAtEnd, 0) + ' never resumed before the game ended.');
