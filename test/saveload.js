// Saving and restoring while something is halfway through happening.
//
// A save here is a seed plus a command log, so the reload does not restore a state -- it re-simulates
// one. That is only equivalent if every transient thing in flight is a consequence of the log: a nuke
// counting down, an egg part-way through a morph, a Recall field about to fire. This walks the four
// states HANDOFF names and asserts the reload is byte-identical, not merely similar, using
// Snapshot.take() as the comparison (G.stateHash hashes ~12 fields per unit and nothing at all inside
// G.fields, so it cannot see a nuke timer or a morph progress).
//
// The other half of the same question is the rejoin path, which restores a snapshot rather than a log,
// and section 4 is where that goes wrong.
//
//   node test/saveload.js
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? '\n      ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(cond, ms, what) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what); await sleep(4); } }
function firstDiff(a, b) {
  if (a === b) return '';
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const w = s => JSON.stringify(s.slice(Math.max(0, i - 70), i + 70));
  return 'lengths ' + a.length + '/' + b.length + ', first difference at char ' + i + '\n      saved:    ' + w(a) + '\n      reloaded: ' + w(b);
}

const SIM = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot'];
function mkCtx(withUI, withNet) {
  const errors = [];
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '', querySelectorAll: () => [] });
  const store = {};
  const ctx = {
    console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ')) },
    Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
    requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, alert(m) { errors.push('alert: ' + m); },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } }, Blob: function () { },
  };
  if (withNet) ctx.WebSocket = function () { };
  ctx.window = ctx; ctx.__errors = errors; ctx.__store = store; vm.createContext(ctx);
  const files = SIM.concat(withUI ? ['render', 'ui'] : []).concat(withNet ? ['net'] : []);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  vm.runInContext(`
    ${withUI ? 'UI.ping = () => {}; UI.onUnitDied = () => {}; Render.reset = () => {}; Render.frame = () => {}; Render.W = 1280; Render.H = 800; Render.viewW = 1280; Render.viewH = 690;' : ''}
    // Snapshot.take is the sim's own reflective capture of everything, which makes it the right
    // comparator here. logLen/pending describe the log rather than the world, so they are dropped.
    this.fingerprint = () => { const s = Snapshot.take(); s.logLen = 0; s.pending = null; return JSON.stringify(s); };
    this.probe = () => ({
      frame: G.frame, hash: G.stateHash(), log: G.log.length, res: G.map.resources.length,
      nuke: G.fields.filter(f => f.kind === 'nuke_target').map(f => f.t + '/' + (f.ghost ? f.ghost.id : 'none')),
      recall: G.fields.filter(f => f.kind === 'recall').map(f => f.t + '/' + (f.src ? f.src.id : 'none')),
      channel: G.units.filter(u => u.alive && u.order.type === 'ability' && u.order.phase === 'channel').map(u => u.def.id + ':' + u.order.abil + ':' + u.order.t),
      eggs: G.units.filter(u => u.alive && u.def.egg && u.prod[0]).map(u => u.def.id + '->' + u.prod[0].id + '@' + u.prod[0].progress),
      bmorph: G.units.filter(u => u.alive && u.isBuilding && u.prod.some(p => p.kind === 'morph')).map(u => { const it = u.prod.find(p => p.kind === 'morph'); return u.def.id + '->' + it.id + '@' + it.progress; }),
    });
    this.tickN = n => { for (let i = 0; i < n; i++) G.tick(); return G.frame; };
    this.hashOver = n => { const h = []; for (let i = 0; i < n; i++) { G.tick(); if (G.frame % 48 === 0) h.push(G.frame + ':' + G.stateHash()); } return h.join(' '); };
  `, ctx);
  return ctx;
}
const R = (ctx, src) => vm.runInContext(src, ctx);

// ============================================================================================
// 1. a save taken mid-nuke, mid-morph and mid-Recall, reloaded through the command log
// ============================================================================================
// Each scenario is a campaign mission, because that is the only way a headless harness gets a Ghost
// with a warhead or an Arbiter with 200 energy without inventing state the log cannot reproduce --
// and a mission's setup() is itself replayed from `data.mission`, so the reload rebuilds it.
const SCENARIOS = [
  {
    name: 'mid-nuke (a warhead 100+ frames from impact)', mission: 't2',
    reach: `
      this.tickN(240);
      const g = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'ghost');
      // 5 tiles out, inside the ability's 8-tile range, so the channel starts on the next tick
      Abilities.issue(g, 'nuke', null, g.x + 5 * TILE, g.y);
      this.tickN(180);`,
    present: p => p.nuke.length === 1 && +p.nuke[0].split('/')[0] > 100 && p.channel.some(c => c.includes('nuke')),
  },
  {
    name: 'mid-Recall (the field placed, not yet fired)', mission: 'p3',
    reach: `
      this.tickN(120);
      const a = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'arbiter');
      Abilities.issue(a, 'recall', null, G.players[1].startX, G.players[1].startY);
      this.tickN(14);`,
    present: p => p.recall.length === 1 && +p.recall[0].split('/')[0] > 5,
  },
  {
    name: 'mid-morph (a Lurker egg and a Zergling egg at once)', mission: 'z3',
    reach: `
      this.tickN(120);
      G.cheat('medieval man');                        // recorded: it is the Lurker Aspect this needs
      const h = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'hydralisk');
      Abilities.issue(h, 'lurker_aspect');
      const lair = G.hallOf(0);
      if (lair && lair.larvae && lair.larvae.length) G.larvaMorph(lair.larvae[0], 'zergling');
      this.tickN(90);`,
    present: p => p.eggs.some(e => e.startsWith('lurker_egg')) && p.eggs.some(e => e.startsWith('egg')),
  },
  {
    name: 'mid-morph (a Lair becoming a Hive)', mission: 'z2',
    reach: `
      this.tickN(120);
      G.queueMorph(G.hallOf(0), 'hive');
      this.tickN(300);`,
    present: p => p.bmorph.length === 1 && p.bmorph[0].includes('->hive@') && +p.bmorph[0].split('@')[1] > 100,
  },
];

// A mission carries its own race, map, seed and opponent; the main menu builds the player list from
// those, so read them off the definition rather than duplicating them here.
const meta = mkCtx(false);
const startMission = id => {
  const o = R(meta, `(() => { const m = Missions.get(${JSON.stringify(id)}); if (!m) throw new Error('no mission ' + ${JSON.stringify(id)});
    return { race: m.race, layout: m.layout, seed: m.seed, eRace: m.enemy.race, eDiff: m.enemy.difficulty, title: m.title }; })()`);
  return `UI.start({ players: [{ race: '${o.race}', human: true, name: 'Zac', team: 1 }, { race: '${o.eRace}', human: false, difficulty: '${o.eDiff}', name: 'Foe', team: 2 }], seed: ${o.seed}, layout: '${o.layout}', mission: '${id}' });`;
};

(async () => {
  console.log('=== 1. a save taken while something is in flight, reloaded from the command log ===');
  for (const sc of SCENARIOS) {
    const A = mkCtx(true);
    R(A, startMission(sc.mission) + '\nUI.running = false;\n' + sc.reach + '\nthis.p = this.probe(); this.fp = this.fingerprint(); this.save = Replay.data();');
    const pA = R(A, 'this.p'), fpA = R(A, 'this.fp');
    ok(sc.name + ': the state really was in flight when the save was taken',
      sc.present(pA), JSON.stringify({ frame: pA.frame, nuke: pA.nuke, recall: pA.recall, channel: pA.channel, eggs: pA.eggs, bmorph: pA.bmorph }));
    const saveJson = R(A, 'JSON.stringify(this.save)');

    const B = mkCtx(true);
    R(B, 'this.save = ' + saveJson + '; UI.running = false; this.refused = UI.startFromLog(this.save, "load");');
    ok(sc.name + ': the save is accepted by this build', R(B, 'this.refused') !== false, String(R(B, 'this.refused')));
    await until(() => !R(B, 'UI.loading') || R(B, 'G.over'), 90000, 'reload of ' + sc.name);
    const pB = R(B, 'this.probe()'), fpB = R(B, 'this.fingerprint()');
    ok(sc.name + ': the reload lands on the same frame with the same command log',
      pB.frame === pA.frame && pB.log === pA.log, 'frame ' + pB.frame + '/' + pA.frame + ', log ' + pB.log + '/' + pA.log);
    ok(sc.name + ': the reloaded simulation is byte-identical to the saved one', fpA === fpB, firstDiff(fpA, fpB));
    // and it must carry on identically, not just look right at the moment of loading
    const hA = R(A, 'this.hashOver(480)'), hB = R(B, 'this.hashOver(480)');
    ok(sc.name + ': ...and the next 480 frames run identically too', hA === hB && hA.length > 0,
      hA.split(' ').findIndex((x, i) => x !== hB.split(' ')[i]) + ' of ' + hA.split(' ').length + ' checkpoints differ, first at ' + (hA.split(' ').find((x, i) => x !== hB.split(' ')[i]) || '-'));
    ok(sc.name + ': no JS errors on either side', A.__errors.length === 0 && B.__errors.length === 0,
      (A.__errors[0] || '') + ' | ' + (B.__errors[0] || ''));
  }

  // ==========================================================================================
  // 2. the same states through a snapshot into a process that has never played -- the rejoin path
  // ==========================================================================================
  console.log('\n=== 2. the same states through a snapshot into a fresh process (what a rejoin does) ===');
  for (const sc of SCENARIOS) {
    const A = mkCtx(true);
    R(A, startMission(sc.mission) + '\nUI.running = false;\n' + sc.reach + '\nthis.fp = this.fingerprint(); this.wire = JSON.stringify(Snapshot.take());');
    const fpA = R(A, 'this.fp'), wire = R(A, 'this.wire');
    const refHashes = R(A, 'this.hashOver(240)');
    const C = mkCtx(true);
    R(C, startMission(sc.mission) + '\nUI.running = false;\nthis.wire = ' + JSON.stringify(wire) + ';\nSnapshot.restore(JSON.parse(this.wire));');
    const fpC = R(C, 'this.fingerprint()');
    ok(sc.name + ': a snapshot restores byte-identically into a fresh process', fpA === fpC, firstDiff(fpA, fpC));
    const gotHashes = R(C, 'this.hashOver(240)');
    ok(sc.name + ': ...and re-simulates the next 240 frames bit-identically', refHashes === gotHashes,
      'ref ' + refHashes.slice(0, 80) + ' | got ' + gotHashes.slice(0, 80));
    ok(sc.name + ': no JS errors restoring into a fresh process', C.__errors.length === 0, C.__errors[0] || '');
  }

  // ==========================================================================================
  // 3. saving during a rejoin
  // ==========================================================================================
  console.log('\n=== 3. saving while the network is active (which is what a rejoin is) ===');
  {
    const N = mkCtx(true, true);
    R(N, `UI.start({ players: [{ race: 'T', human: true, name: 'Zac', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'Foe', team: 2 }], seed: 3, layout: 'temple' });
      UI.running = false; this.tickN(600);
      UI.net = true; Net.active = true; Net.catchingUp = true; Net.me = 0; Net.players = [{ human: true }, { human: false }];
      Replay.save(false); this.duringRejoin = localStorage.getItem('bw_save');
      // and the two-minute autosave must not fire either -- a save taken mid-catch-up would carry a log
      // the client has not finished re-simulating. Walk to an autosave frame and call simStep for real.
      UI.running = true; while (G.frame % (TPS * 120) !== 0) G.tick(); this.autosaveFrame = G.frame;
      Net.ready = () => false; Net.catchingUp = true; UI.simStep();
      this.duringCatchUp = localStorage.getItem('bw_save'); this.tookCatchUpBranch = Net.catchingUp === false;
      Net.catchingUp = false; UI._autosaved = false; UI.simStep(); this.duringNetGame = localStorage.getItem('bw_save');
      UI.net = false; Net.active = false; Replay.save(false); this.offline = localStorage.getItem('bw_save');`);
    ok('a save is refused while a network game is active', R(N, 'this.duringRejoin') === null, String(R(N, 'this.duringRejoin')).slice(0, 60));
    ok('the rejoin catch-up path returns before the autosave line is even reached',
      R(N, 'this.duringCatchUp') === null && R(N, 'this.tookCatchUpBranch') === true && R(N, 'this.autosaveFrame') % (24 * 120) === 0,
      'at frame ' + R(N, 'this.autosaveFrame') + ', catch-up branch taken=' + R(N, 'this.tookCatchUpBranch') + ': ' + String(R(N, 'this.duringCatchUp')).slice(0, 60));
    ok('...and the autosave line itself also refuses while the network is active',
      R(N, 'this.duringNetGame') === null, String(R(N, 'this.duringNetGame')).slice(0, 60));
    ok('...and the same call does save once the network is not active', typeof R(N, 'this.offline') === 'string' && R(N, 'this.offline').length > 100,
      String(R(N, 'this.offline')).slice(0, 60));
    ok('no JS errors', N.__errors.length === 0, N.__errors[0] || '');
  }

  // ==========================================================================================
  // 4. a snapshot taken after a mineral patch has been mined out
  // ==========================================================================================
  // G.removeResource splices the patch out of G.map.resources. Snapshot encodes every resource
  // reference as an index into that array and restores by walking it positionally, so the two sides of
  // a restore have to agree on its length -- and nothing makes them.
  console.log('\n=== 4. snapshots across a mined-out mineral patch ===');
  {
    const START = `G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }, { race: 'P', human: false, difficulty: 'normal', name: 'C' }], seed: 6, layout: 'temple' });`;
    // How long a real game takes to get here, measured rather than assumed.
    // START is test/snapshot.js's own setup, verbatim, so the frame it reaches this state at says
    // exactly how far that test is from catching it.
    const M = mkCtx(false);
    R(M, `${START} this.n0 = G.map.resources.length; this.at = -1;
      for (let f = 1; f <= 30000 && this.at < 0; f++) { G.tick(); if (G.map.resources.length < this.n0) this.at = f; }`);
    const natAt = R(M, 'this.at'), n0 = R(M, 'this.n0');
    console.log('  a normal three-player game starts with ' + n0 + ' resource patches and loses its first at frame ' +
      (natAt < 0 ? '>30000' : natAt + ' (' + Math.floor(natAt / 24 / 60) + ':' + String(Math.floor(natAt / 24) % 60).padStart(2, '0') + ')') +
      '; test/snapshot.js takes its fresh-process rejoin snapshot at 16800' + (natAt > 0 ? ', ' + (natAt - 16800) + ' frames short' : ''));

    // The same check test/snapshot.js ends with, taken just past that frame instead of just before it.
    if (natAt > 0 && natAt < 20000) {
      const LATE = 19200;
      R(M, `while (G.frame < ${LATE}) G.tick(); this.wire = JSON.stringify(Snapshot.take()); this.res = G.map.resources.length; this.ref = this.hashOver(240);`);
      const S = mkCtx(false);
      R(S, `${START} this.wire = ` + JSON.stringify(R(M, 'this.wire')) + `; Snapshot.restore(JSON.parse(this.wire)); this.res = G.map.resources.length; this.got = this.hashOver(240);`);
      const refH = String(R(M, 'this.ref')).split(' '), gotH = String(R(S, 'this.got')).split(' ');
      ok('test/snapshot.js\'s own rejoin check passes at frame ' + LATE + ' too, not just at 16800',
        R(S, 'this.res') === R(M, 'this.res') && refH.join(' ') === gotH.join(' '),
        'donor has ' + R(M, 'this.res') + ' patches, the fresh process ' + R(S, 'this.res') +
        (refH.join(' ') === gotH.join(' ') ? '' : '; hashes diverge at checkpoint ' + (refH.findIndex((x, i) => x !== gotH[i]) + 1) + ' of ' + refH.length) +
        '  -- raising LATE in test/snapshot.js from 16800 to ' + LATE + ' is enough to catch this');
    }

    // The same state reached quickly and through the same code path: leave the patches the AIs are
    // actually mining with one trip left, then let them mine it.
    const D = mkCtx(false);
    R(D, `${START} this.n0 = G.map.resources.length; this.tickN(600);
      this.marked = 0; for (const r of G.map.resources) if (r.miner && r.miner.alive) { r.amount = 8; this.marked++; }
      this.early = Snapshot.take(); this.earlyFp = this.fingerprint(); this.earlyFrame = G.frame;
      this.tickN(600); this.nAfter = G.map.resources.length;`);
    const marked = R(D, 'this.marked'), nAfter = R(D, 'this.nAfter'), earlyFrame = R(D, 'this.earlyFrame');
    ok('the setup actually mined patches out', marked > 0 && nAfter < R(D, 'this.n0'),
      marked + ' patches left with one trip; ' + R(D, 'this.n0') + ' -> ' + nAfter + ' patches after 600 more frames');

    // 4a: seeking a replay backwards over that moment restores a snapshot with more resources than the
    //     live map has. This is exactly UI.seekTo -> Snapshot.restore.
    let threw = null;
    try { R(D, 'Snapshot.restore(this.early);'); } catch (e) { threw = e; }
    ok('restoring a checkpoint taken before a patch was mined out does not throw',
      threw === null, String(threw && threw.message) + '  -- Snapshot.restore indexes G.map.resources[i] for every entry in the snapshot, ' +
      'and G.removeResource has spliced the live array shorter, so _apply gets undefined');
    if (!threw) {
      ok('...and it puts the resource list back to what it was', R(D, 'G.map.resources.length') === R(D, 'this.n0'),
        R(D, 'G.map.resources.length') + ' of ' + R(D, 'this.n0'));
      ok('...and the restored state is byte-identical to the checkpoint', R(D, 'this.fingerprint()') === R(D, 'this.earlyFp'),
        firstDiff(R(D, 'this.earlyFp'), R(D, 'this.fingerprint()')));
      ok('...and the frame went back', R(D, 'G.frame') === earlyFrame, R(D, 'G.frame') + ' vs ' + earlyFrame);
      ok('...and resById resolves every patch again', R(D, 'G.map.resources.every(r => G.map.resById.get(r.id) === r) && G.map.resById.size === G.map.resources.length'),
        'GameMap.resById is built once in generate() and Snapshot never touches it, so a restore that changes the resource list has to rebuild it (CMD.deref reads it for every gather command in a replay)');
    }

    // 4b: the rejoin direction. A live client whose patches are gone sends its snapshot to a client
    //     that has just re-run G.init, so the receiver's array is longer than the snapshot's.
    const E = mkCtx(false);
    R(E, `${START} this.n0 = G.map.resources.length; this.tickN(600);
      for (const r of G.map.resources) if (r.miner && r.miner.alive) r.amount = 8;
      this.tickN(600);
      this.donorRes = G.map.resources.length; this.donorIds = G.map.resources.map(r => r.id).join(',');
      this.wire = JSON.stringify(Snapshot.take()); this.fp = this.fingerprint();
      this.ref = this.hashOver(2400);`);
    const donorRes = R(E, 'this.donorRes'), donorIds = R(E, 'this.donorIds');
    const F = mkCtx(false);
    R(F, `${START} this.wire = ` + JSON.stringify(R(E, 'this.wire')) + `; Snapshot.restore(JSON.parse(this.wire));
      this.res = G.map.resources.length; this.ids = G.map.resources.map(r => r.id).join(',');
      this.byIdOk = G.map.resources.every(r => G.map.resById.get(r.id) === r);
      this.dupIds = (() => { const seen = new Set(), d = []; for (const r of G.map.resources) { if (seen.has(r.id)) d.push(r.id); seen.add(r.id); } return d.join(','); })();
      this.fp = this.fingerprint(); this.got = this.hashOver(2400);`);
    const dup = R(F, 'this.dupIds');
    ok('...and no patch appears twice in it', dup === '',
      'patch ids ' + dup + ' exist twice: the donor\'s shorter list was written over the head of the rejoiner\'s longer one, so the tail entries are duplicates. ' +
      'G.findNearestResource prefers a patch with no miner (js/game.js), and a duplicate has none, so the next worker to need a patch takes the phantom.');
    ok('a rejoining client ends up with the donor\'s resource list, not its own',
      R(F, 'this.res') === donorRes && R(F, 'this.ids') === donorIds,
      'donor has ' + donorRes + ' patches, the rejoiner has ' + R(F, 'this.res') +
      '; ids ' + (R(F, 'this.ids') === donorIds ? 'match' : 'differ') +
      '  -- Snapshot.restore only overwrites G.map.resources[0..n-1] in place, so the patches the donor mined out survive on the rejoiner and every {__r: i} reference resolves to a different patch');
    ok('...and resById still points at the right object for every patch', R(F, 'this.byIdOk') === true,
      'js/snapshot.js never rebuilds GameMap.resById, and _apply copies the donor resource\'s own `id` onto whichever object sits at that index');
    ok('...and the restored state is byte-identical to the donor\'s', R(F, 'this.fp') === R(E, 'this.fp'), firstDiff(R(E, 'this.fp'), R(F, 'this.fp')));
    {
      const refH = String(R(E, 'this.ref')).split(' '), gotH = String(R(F, 'this.got')).split(' ');
      const bad = refH.findIndex((x, i) => x !== gotH[i]);
      ok('...and it re-simulates the next 2400 frames bit-identically', bad < 0,
        'diverged at the ' + (bad + 1) + 'th of ' + refH.length + ' checkpoints -- frame ' + (refH[bad] || '?').split(':')[0] +
        ', ' + ((+(refH[bad] || '0:0').split(':')[0]) - 1200) + ' frames after the rejoin. Silent: nothing reports it, because the two sides agree on every unit for the first few hundred frames.');
    }
    ok('no JS errors in section 4', D.__errors.length === 0 && E.__errors.length === 0 && F.__errors.length === 0,
      [D.__errors[0], E.__errors[0], F.__errors[0]].filter(Boolean).join(' || '));
  }

  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log('\nFAIL  ' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });
