// The campaign: weighted choices, the record of them, and what the record takes away.
//   node test/campaign.js [--verbose]
//
// Four things are being asserted, and the third and fourth are the ones worth the file:
//
//   1. Both branches of every weighted choice are REACHABLE AND RESOLVE. A mission that can only be
//      finished one way is not a choice, and a mission that wedges on the unpopular branch is worse
//      than not having offered it.
//   2. The record SURVIVES. It is written to localStorage under 'bw_campaign' when a mission finishes
//      and is read back by a later mission in a different session -- modelled here as two separate
//      VM contexts sharing one storage object, which is what two visits to the page really are.
//   3. Narrowing REMOVES OPTIONS AND CANNOT STRAND YOU. A closed branch really is refused, by hasReq
//      and by the build order itself, and it explains itself when refused. And for every combination
//      of closures the campaign can produce, every race can still field an army -- checked by walking
//      the tech tree's closure rather than by hoping.
//   4. A mission with campaign state STILL REPLAYS BIT-EXACTLY. This is the one that constrains the
//      design: the record is part of what the simulation reads at frame 0, so it has to travel with
//      the replay rather than being looked up on the machine playing it back. It travels inside the
//      mission id ('t4#c=terrace:razed'), which Replay.data already stores. The check below proves
//      both halves: the same launch id reproduces the run exactly, and a DIFFERENT launch id does not
//      -- because if it did, the record would not be affecting the simulation at all.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; if (VERBOSE) console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  ' + extra : '')); } };
const section = t => { if (VERBOSE) console.log('\n--- ' + t + ' ---'); };

const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'net', 'render', 'ui'];
// One backing object per "browser". Two contexts sharing one is two page loads on the same machine.
function makeCtx(store, errors) {
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, querySelectorAll: () => [] });
  const ctx = {
    console: { log() { }, warn() { }, error: (...a) => (errors || []).push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ')) },
    Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
    localStorage: { getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
    requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'x' }, alert() { },
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  vm.runInContext('Render.reset = () => {}; Render.frame = () => {}; UI.ping = () => {}; UI.onUnitDied = () => {}; UI.mode = "play"; Render.W = 1280; Render.H = 720; Render.viewW = 1280; Render.viewH = 524;', ctx);
  return ctx;
}
const run = (ctx, src) => vm.runInContext(src, ctx);
const json = (ctx, src) => JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));
// Start a mission the way UI.start does, without needing a canvas.
const START = id => `
  (() => { const m = Missions.get(${JSON.stringify(id)}); if (!m) throw new Error('no mission ' + ${JSON.stringify(id)});
    G.init({ players: [{ race: m.race, human: true, name: 'Zac', team: 1 }, { race: m.enemy.race, human: false, difficulty: m.enemy.difficulty, name: 'Enemy', team: 2 }], seed: m.seed, layout: m.layout, mission: ${JSON.stringify(id)} });
    G.recording = false; G.log = []; G.pendingCmds = null; G.mission = null; Missions.begin(${JSON.stringify(id)}); UI.menu = null; })();`;

// ============================================================ 1. the record's wire format
section('record format');
{
  const errors = []; const c = makeCtx({}, errors);
  const rt = s => run(c, `Missions.encodeBody(Missions.decodeBody(${JSON.stringify(s)}))`);
  const canonical = 'w=t1,t2;l=stargate~p4,academy~t1;c=gates:reliquary,terrace:razed';
  ok('a record round-trips through its own text form', rt(canonical) === canonical, rt(canonical));
  ok('an empty record encodes to nothing', rt('') === '', JSON.stringify(rt('')));
  const dirty = run(c, `Missions.encodeBody(Missions.decodeBody('w=t1,BAD ONE,t2;l=<script>~x;c=k:v,evil:"x"'))`);
  ok('tokens outside [a-z0-9_] are dropped, not escaped', dirty === 'w=t1,t2;c=k:v', dirty);
  const many = json(c, `Missions.decodeBody('l=a~x,academy~t1,factory~t3,stargate~p4,spire~z4')`);
  ok('no more than MAX_LOST branches survive a decode', many.l.length === run(c, 'Missions.maxLost()'), JSON.stringify(many.l));
  ok('the last losses are the ones kept', many.l[many.l.length - 1].id === 'spire', JSON.stringify(many.l.map(e => e.id)));
  ok('a launch id splits into mission and record', run(c, `Missions.baseId('t4#c=x:y')`) === 't4' && run(c, `Missions.get('t4#c=x:y').id`) === 't4');
  ok('a bare mission id is still a valid launch id', run(c, `Missions.baseId('t4')`) === 't4' && json(c, `Missions.decode('t4')`).l.length === 0);
  ok('no JS errors loading the sim', !errors.length, errors[0]);
}

// ============================================================ 2. it survives, and a later mission reads it
section('persistence');
{
  const store = {};
  const a = makeCtx(store);
  run(a, `Missions.remember({ id: 'p4', won: true, choices: { gates: 'reliquary' }, lost: ['stargate'] });`);
  ok('finishing a mission writes to localStorage', typeof store.bw_campaign === 'string' && store.bw_campaign.length > 0, JSON.stringify(store.bw_campaign));
  // A different context is a different page load. Nothing is shared but the storage object.
  const b = makeCtx(store);
  const d = json(b, 'Missions.load()');
  ok('a later session reads the win back', d.w.includes('p4'), JSON.stringify(d.w));
  ok('a later session reads the choice back', d.c.gates === 'reliquary', JSON.stringify(d.c));
  ok('a later session reads the lost facility back', d.l.some(e => e.id === 'stargate' && e.at === 'p4'), JSON.stringify(d.l));
  const lid = run(b, `Missions.startId('t4')`);
  ok('startId composes the mission with the record', lid.startsWith('t4#') && /c=gates:reliquary/.test(lid) && /l=stargate~p4/.test(lid), lid);
  // A failed mission records what was decided but does not amputate the campaign on the way past.
  const store2 = {}; const cx = makeCtx(store2);
  run(cx, `Missions.remember({ id: 'z4', won: false, choices: { rearguard: 'held' }, lost: ['hydralisk_den'] });`);
  const d2 = json(cx, 'Missions.load()');
  ok('a failed mission still records the choice', d2.c.rearguard === 'held', JSON.stringify(d2.c));
  ok('a failed mission does not close a branch', !d2.l.length && !d2.w.length, JSON.stringify(d2));
  // Watching a replay must not re-record what you are watching.
  const store3 = {}; const rp = makeCtx(store3);
  run(rp, `UI.mode = 'replay'; Missions.remember({ id: 't3', won: true, choices: { terrace: 'razed' }, lost: [] });`);
  ok('replaying a mission does not rewrite the campaign', !store3.bw_campaign, JSON.stringify(store3.bw_campaign));
}

// ============================================================ 3. a launch id is frozen once, at frame 0
section('the id is frozen once, and a replay reads the id and not the machine');
{
  const store = { bw_campaign: 'l=stargate~p4;c=gates:reliquary' };
  const c = makeCtx(store);
  // A bare id -- what the main menu passes -- picks the campaign up and is frozen on the way in.
  run(c, START('p1'));
  const bare = json(c, '({ l: G.mission.dossier.l.map(e => e.id), c: G.mission.dossier.c, closed: G.mission.closed, setup: G.setup.mission, replay: Replay.data().mission })');
  ok('a bare id picks the campaign up', bare.l.includes('stargate') && bare.c.gates === 'reliquary', JSON.stringify(bare.c));
  ok('...and is frozen into G.setup, which is what a replay stores', bare.setup === 'p1#l=stargate~p4;c=gates:reliquary' && bare.replay === bare.setup, bare.setup + ' / ' + bare.replay);
  ok('...and the closure follows from it', bare.closed.includes('stargate'), JSON.stringify(bare.closed));
  // A frozen id is never re-read against the machine, which is the whole determinism argument. An
  // untouched campaign still freezes to a separator, so an empty record cannot be mistaken for a bare
  // id and quietly re-composed against a campaign that has moved on since.
  const fresh = makeCtx({});
  ok('an untouched campaign still produces a frozen id', run(fresh, `Missions.startId('p1')`) === 'p1#', run(fresh, `Missions.startId('p1')`));
  run(c, START('p1#'));
  const empty = json(c, '({ l: G.mission.dossier.l, c: G.mission.dossier.c, closed: G.mission.closed, setup: G.setup.mission })');
  ok('a frozen empty id ignores a full localStorage', !empty.l.length && !Object.keys(empty.c).length && !empty.closed.length, JSON.stringify(empty));
  ok('...and is left exactly as it arrived', empty.setup === 'p1#', empty.setup);
  run(c, START('p1#c=gates:assembly'));
  ok('a frozen id with a record uses that record, not the machine\'s', json(c, 'G.mission.dossier.c').gates === 'assembly' && !json(c, 'G.mission.closed').length, JSON.stringify(json(c, 'G.mission.dossier')));
}

// ============================================================ 4. both branches of every weighted choice
section('the weighted choices');

// ---- t3 The Terrace: level six occupied blocks, or leave them and fight the rotation ----
{
  const errors = []; const c = makeCtx({}, errors);
  // Both branches, then the same forced ending, so the only difference between the two runs is what
  // happened to the terrace.
  const drive = raze => run(c, `(() => {
    const en = 1;
    ${raze ? `for (const id of G.mission.state.terrace) { const u = G.byId.get(id); if (u && u.alive) G.kill(u, null, true); }` : ''}
    for (let i = 0; i < 30; i++) G.tick();
    const cc = G.units.find(u => u.alive && u.owner === en && u.def.id === 'command_center'); if (cc) G.kill(cc, null, true);
    for (let i = 0; i < 60 && !G.mission.done; i++) G.tick();
    return JSON.stringify({ done: G.mission.done, won: G.winner === 0, choices: G.mission.choices, record: G.mission.record, standing: G.mission.state.standing, built: G.mission.state.built });
  })()`);
  run(c, START('t3'));
  const built = run(c, 'G.mission.state.built');
  ok('t3 places the terrace it describes', built === 6, String(built));
  const spared = JSON.parse(drive(false));
  ok('t3 resolves with the terrace left standing', spared.done === true && spared.won === true, JSON.stringify(spared));
  ok('...and remembers that it was left standing', spared.record && spared.record.choices.terrace === 'spared', JSON.stringify(spared.choices));
  run(c, START('t3'));
  const razed = JSON.parse(drive(true));
  ok('t3 resolves with the terrace levelled', razed.done === true && razed.won === true, JSON.stringify(razed));
  ok('...and remembers that it was levelled', razed.record && razed.record.choices.terrace === 'razed', JSON.stringify(razed.choices));
  ok('t3 offers two outcomes, not one', spared.record.choices.terrace !== razed.record.choices.terrace);
  ok('no JS errors on either branch of t3', !errors.length, errors[0]);
}

// ---- z4 The Rearguard: hold the ridge and lose what holds it, or keep it and cover the ground ----
{
  const errors = []; const c = makeCtx({}, errors);
  // The clock is the only thing between here and the resolution, so wind it on rather than playing six
  // minutes twice. Everything the resolution reads -- who is on the ridge, who is still alive -- is set
  // up honestly.
  const resolve = hold => run(c, `(() => {
    const s = G.mission.state;
    ${hold ? `const guard = G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'hydralisk').slice(0, 6);
              for (let i = 0; i < guard.length; i++) { guard[i].x = s.ridge.x + i * 10; guard[i].y = s.ridge.y; }
              this.__guard = guard.map(u => u.id);` : 'this.__guard = [];'}
    s.t = 358;
    for (let i = 0; i < 96 && !G.mission.done; i++) G.tick();
    return JSON.stringify({ done: G.mission.done, won: G.winner === 0, record: G.mission.record, spent: s.spent, got: s.got,
      guardAlive: this.__guard.filter(id => { const u = G.byId.get(id); return u && u.alive; }).length });
  })()`);
  run(c, START('z4'));
  const withdrawn = JSON.parse(resolve(false));
  ok('z4 resolves with the ridge given up', withdrawn.done === true, JSON.stringify(withdrawn));
  ok('...and remembers that it was given up', withdrawn.record.choices.rearguard === 'withdrawn', JSON.stringify(withdrawn.record));
  ok('...and nothing was spent for it', withdrawn.spent === 0, String(withdrawn.spent));
  run(c, START('z4'));
  const held = JSON.parse(resolve(true));
  ok('z4 resolves with the ridge held', held.done === true && held.won === true, JSON.stringify(held));
  ok('...and remembers that it was held', held.record.choices.rearguard === 'held', JSON.stringify(held.record));
  ok('...and the rearguard is spent, as the briefing says it will be', held.spent >= 6 && held.guardAlive === 0, 'spent ' + held.spent + ' alive ' + held.guardAlive);
  // The failure branch has to resolve too: a broken column is a loss, not a hang.
  run(c, START('z4'));
  const broken = JSON.parse(run(c, `(() => {
    const s = G.mission.state;
    for (const id of s.column.slice(0, 5)) { const u = G.byId.get(id); if (u) G.kill(u, null, true); }
    s.t = 358;
    for (let i = 0; i < 96 && !G.mission.done; i++) G.tick();
    return JSON.stringify({ done: G.mission.done, won: G.winner === 0, got: s.got, record: G.mission.record });
  })()`));
  ok('z4 resolves as a loss when the column breaks', broken.done === true && broken.won === false && broken.got === 5, JSON.stringify(broken));
  ok('...and still remembers what was decided', broken.record.choices.column === 'broken', JSON.stringify(broken.record));
  ok('no JS errors on any branch of z4', !errors.length, errors[0]);
}

// ---- p4 Two Gates: the shelter or the last stargate line ----
{
  const errors = []; const store = {}; const c = makeCtx(store, errors);
  const land = where => run(c, `(() => {
    const s = G.mission.state;
    ${where === 'asm' ? `for (const u of G.units.filter(u => u.alive && u.owner === 0 && !u.isBuilding && !u.def.worker)) { u.x = s.asmC.x; u.y = s.asmC.y; }` : ''}
    s.t = 298;
    for (let i = 0; i < 96 && !G.mission.done; i++) G.tick();
    const up = ids => (ids || []).filter(id => { const u = G.byId.get(id); return u && u.alive; }).length;
    return JSON.stringify({ done: G.mission.done, won: G.winner === 0, record: G.mission.record, gates: G.mission.choices.gates, rel: up(s.rel), asm: up(s.asm) });
  })()`);
  run(c, START('p4'));
  const rel = JSON.parse(land('rel'));
  ok('p4 resolves with the Reliquary held', rel.done === true && rel.won === true && rel.gates === 'reliquary', JSON.stringify(rel));
  ok('...and the Assembly is gone', rel.asm === 0 && rel.rel > 0, 'rel ' + rel.rel + ' asm ' + rel.asm);
  ok('...and the campaign records the stargate line as lost', rel.record.lost.includes('stargate'), JSON.stringify(rel.record));
  run(c, START('p4'));
  const asm = JSON.parse(land('asm'));
  ok('p4 resolves with the Assembly held', asm.done === true && asm.won === true && asm.gates === 'assembly', JSON.stringify(asm));
  ok('...and the Reliquary is gone', asm.rel === 0 && asm.asm > 0, 'rel ' + asm.rel + ' asm ' + asm.asm);
  ok('...and nothing is closed for it', !asm.record.lost.length, JSON.stringify(asm.record));
  ok('p4 offers two outcomes, not one', rel.gates !== asm.gates);
  ok('no JS errors on either branch of p4', !errors.length, errors[0]);
}

// ============================================================ 5. a later mission reads it back
section('a later mission reads the record');
{
  const count = (ctx, id) => { run(ctx, START(id)); return json(ctx, `({ marines: G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'marine').length, sunkens: G.mission.state.sunkens, brief: G.mission.def.brief })`); };
  const c = makeCtx({});
  const clean = count(c, 't4');
  const razed = count(c, 't4#c=terrace:razed');
  const spared = count(c, 't4#c=terrace:spared');
  const shelter = count(c, 't4#c=gates:reliquary');
  const ridge = count(c, 't4#c=rearguard:held');
  ok('levelling the terrace costs the finale two companies', razed.marines < clean.marines && razed.marines === 6, razed.marines + ' vs ' + clean.marines);
  ok('leaving it standing does not', spared.marines === clean.marines, spared.marines + ' vs ' + clean.marines);
  ok('saving the shelter pays it back, later, in people', shelter.marines === clean.marines + 4, shelter.marines + ' vs ' + clean.marines);
  ok('a spent rearguard leaves the last cluster less dug in', ridge.sunkens < clean.sunkens && ridge.sunkens === 2, ridge.sunkens + ' vs ' + clean.sunkens);
  ok('the briefing says what happened, and does not explain it', razed.brief.some(l => /did not redeploy/.test(l)) && !razed.brief.some(l => /score|morality|points/i.test(l)), JSON.stringify(razed.brief.slice(-3)));
  ok('a clean campaign gets no extra briefing lines', clean.brief.length === 2, JSON.stringify(clean.brief));
  // The whole loop, end to end and through storage: finish p4, then start a Protoss mission.
  const store = {}; const s1 = makeCtx(store);
  run(s1, START('p4'));
  run(s1, `(() => { const s = G.mission.state; s.t = 298; for (let i = 0; i < 96 && !G.mission.done; i++) G.tick(); })()`);
  ok('finishing p4 for real writes the campaign', /stargate~p4/.test(store.bw_campaign || ''), JSON.stringify(store.bw_campaign));
  const s2 = makeCtx(store);
  run(s2, START(run(s2, `Missions.startId('p1')`)));
  const later = json(s2, `({ closed: G.mission.closed, brief: G.mission.def.brief, can: G.players[0].hasReq(DATA.buildings.stargate), why: G.players[0].missingReq(DATA.buildings.stargate) })`);
  ok('a mission played afterwards starts with that branch closed', later.closed.includes('stargate'), JSON.stringify(later.closed));
  ok('...and says so in the briefing, once, flatly', later.brief.some(l => /^REQUISITION CLOSED$/.test(l)) && later.brief.some(l => /^Stargate -- lost at Two Gates\. Not replaced\.$/.test(l)), JSON.stringify(later.brief.slice(-3)));
  ok('...and refuses to build it', later.can === false && /Stargate/.test(later.why || ''), later.can + ' / ' + later.why);
}

// ============================================================ 6. narrowing removes options, and explains itself
section('narrowing');
{
  const errors = []; const c = makeCtx({}, errors);
  run(c, `G.init({ players: [{ race: 'T', human: true, name: 'Zac', team: 1 }, { race: 'Z', human: false, difficulty: 'easy', name: 'E', team: 2 }], seed: 5, layout: 'temple' });
    G.recording = false; const h = G.hallOf(0); G.placeDone(0, 'barracks', h.tx + 6, h.ty); G.givePlayer(0, { minerals: 900, gas: 300 });`);
  ok('a Factory is buildable before anything is lost', run(c, 'G.players[0].hasReq(DATA.buildings.factory)') === true);
  run(c, `Missions.installLocks(G.players[0], ['factory']);`);
  ok('and is not, afterwards', run(c, 'G.players[0].hasReq(DATA.buildings.factory)') === false);
  const why = run(c, 'G.players[0].missingReq(DATA.buildings.factory)');
  ok('a greyed button can still say why', typeof why === 'string' && /Factory/.test(why) && /lost/.test(why), String(why));
  ok('the opponent is untouched', run(c, 'G.players[1].closed === undefined && G.players[1].hasReq === Player.prototype.hasReq') === true);
  ok('Player.prototype is untouched, so the build stamp still covers hasReq', run(c, 'Player.prototype.hasReq === Object.getPrototypeOf(G.players[0]).hasReq && !Object.prototype.hasOwnProperty.call(Player.prototype, "closed")') === true);
  // and the order path, not just the card: a worker sent to build one is refused and told.
  const built = run(c, `(() => {
    const p = G.players[0], h = G.hallOf(0);
    const w = G.units.find(u => u.alive && u.owner === 0 && u.def.worker);
    const t = G.map.findFreeTile(h.tx - 6, h.ty + 4, 10, (x, y) => !G.map.canPlace(DATA.buildings.factory, x, y, p, G.units, null));
    p.msgs.length = 0; p.lastAlert = {};
    w.applyOrder({ type: 'build', def: DATA.buildings.factory, tx: t[0], ty: t[1] });
    for (let i = 0; i < 400 && w.order.type === 'build'; i++) G.tick();
    return JSON.stringify({ order: w.order.type, msgs: p.msgs.map(m => m.text), built: G.units.some(u => u.alive && u.owner === 0 && u.def.id === 'factory'), spent: 900 - Math.round(p.minerals) });
  })()`);
  const b = JSON.parse(built);
  ok('a worker ordered to build a closed branch does not build it', b.order !== 'build' && b.built === false, JSON.stringify(b));
  ok('...and the player is told why, not left with a dead order', b.msgs.some(t => /Factory/.test(t) && /Requires/.test(t)), JSON.stringify(b.msgs));
  ok('...and is not charged for it', b.spent <= 0, String(b.spent));
  // A mission that hands you the last one in the field can still use it: the branch is closed, the
  // building in your hands is not.
  run(c, `Missions.installLocks(G.players[0], ['academy']); G.placeDone(0, 'academy', G.hallOf(0).tx - 6, G.hallOf(0).ty + 4);`);
  ok('a closed branch is still unbuildable with one standing', run(c, 'G.players[0].hasReq(DATA.buildings.academy)') === false);
  ok('...but what it enables still works while it stands', run(c, 'G.players[0].hasReq(DATA.units.medic)') === true);
  run(c, `for (const u of G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'academy')) G.kill(u, null, true);`);
  ok('...and stops the moment it does not', run(c, 'G.players[0].hasReq(DATA.units.medic)') === false);
  ok('...saying which building it was', /Academy/.test(String(run(c, 'G.players[0].missingReq(DATA.units.medic)'))));
  // Lifting the lock puts the prototype back.
  run(c, `Missions.installLocks(G.players[0], []);`);
  ok('an empty lock set removes the override entirely', run(c, 'G.players[0].hasReq === Player.prototype.hasReq && G.players[0].closed.size === 0') === true);
  ok('no JS errors while narrowing', !errors.length, errors[0]);
  // A mission that needs a branch gets it back for the duration -- the floor that keeps a scripted
  // setup from contradicting itself.
  const d = makeCtx({});
  run(d, START('p2#l=stargate~p4,robotics_facility~x'));
  const p2 = json(d, '({ closed: G.mission.closed })');
  ok('a mission that needs a branch is not denied it', !p2.closed.includes('stargate'), JSON.stringify(p2.closed));
  ok('...and everything else stays closed', p2.closed.includes('robotics_facility'), JSON.stringify(p2.closed));
}

// ============================================================ 7. the floor: narrowing cannot strand you
section('the floor');
{
  const c = makeCtx({});
  const D = json(c, `(() => {
    const b = {}; for (const k of Object.keys(DATA.buildings)) { const d = DATA.buildings[k]; b[k] = { id: k, race: d.race, req: d.req || null, tier: d.tier || null, parent: d.parent || null, notUnit: !!d.notUnit, morphTo: d.morphTo || null, morphOptions: d.morphOptions || [] }; }
    const wep = w => w ? { targets: w.targets || 'ground' } : null;
    const u = {}; for (const k of Object.keys(DATA.units)) { const d = DATA.units[k]; u[k] = { id: k, race: d.race, req: d.req || null, from: d.from || null, worker: !!d.worker, notUnit: !!d.notUnit, larva: !!d.larva, egg: !!d.egg, gw: wep(d.gw), aw: wep(d.aw) }; }
    const t = {}; for (const k of Object.keys(DATA.techs)) t[k] = DATA.techs[k].bld || null;
    return { b, u, techs: t, core: Missions.core(), maxLost: Missions.maxLost(), equiv: EQUIV,
      race: { T: RACE_INFO.T, Z: RACE_INFO.Z, P: RACE_INFO.P },
      facilities: Missions.list.map(m => m.facilities || []).reduce((a, x) => a.concat(x), []) };
  })()`);
  // Everything a doctored or future record could name. closedIn() is what has to hold the line, so the
  // sweep below is over every non-core building in the game, not merely the ones a mission declares.
  const lockable = Object.keys(D.b).filter(id => !D.core.includes(id) && !D.b[id].notUnit);
  ok('every facility a mission can lose is lockable at all', D.facilities.every(id => lockable.includes(id)), JSON.stringify(D.facilities));
  ok('no facility a mission declares is part of the spine', D.facilities.every(id => !D.core.includes(id)), JSON.stringify(D.facilities.filter(id => D.core.includes(id))));
  const forced = json(c, `[...Missions.closedIn(null, { l: ${JSON.stringify(D.core.concat(['nonesuch_building']).map(id => ({ id, at: 'x' })))} })]`);
  ok('closedIn refuses every core building and every unknown name', forced.length === 0, JSON.stringify(forced));

  // An independent reading of the same tech tree, written from DATA rather than by calling into the
  // sim, so a bug in Missions.reachable does not get to mark its own homework.
  const satisfied = (req, have) => !req || req.every(r => typeof r !== 'string' ? true
    : Object.prototype.hasOwnProperty.call(D.techs, r) ? (D.techs[r] ? have.has(D.techs[r]) : true)
      : (have.has(r) || (D.equiv[r] || []).some(e => have.has(e))));
  // A morph names its result, not its source, so the source has to be looked up the other way round or
  // a Greater Spire stays "reachable" with the Spire closed.
  const sources = {}; for (const k of Object.keys(D.b)) { const d = D.b[k]; if (d.morphTo) (sources[d.morphTo] = sources[d.morphTo] || []).push(k); for (const o of d.morphOptions) (sources[o] = sources[o] || []).push(k); }
  const viable = (race, closed) => {
    const info = D.race[race], have = new Set([info.hall]);
    const blds = Object.keys(D.b).map(k => D.b[k]).filter(x => x.race === race);
    for (let pass = 0; pass < 12; pass++) {
      let grew = false;
      for (const d of blds) {
        if (have.has(d.id) || closed.has(d.id)) continue;
        if (d.tier === 'addon' && d.parent && !have.has(d.parent)) continue;
        if (d.tier === 'morph' && sources[d.id] && !sources[d.id].some(s => have.has(s))) continue;
        if (!satisfied(d.req, have)) continue;
        have.add(d.id); grew = true;
      }
      if (!grew) break;
    }
    if (!have.has(info.gasB)) return 'no gas building';
    let worker = false, supply = have.has(info.supply), armed = [], air = false;
    for (const k of Object.keys(D.u)) {
      const x = D.u[k];
      if (x.race !== race || x.notUnit || x.larva || x.egg) continue;
      const src = x.from === 'larva' ? info.hall : x.from;
      if (!src || !have.has(src) || !satisfied(x.req, have)) continue;
      if (x.worker) { worker = true; continue; }
      if (k === info.supply) supply = true;
      let w = false;
      for (const q of [x.gw, x.aw]) { if (!q) continue; w = true; if (q.targets === 'air' || q.targets === 'both') air = true; }
      if (w) armed.push(k);
    }
    if (!worker) return 'no worker';
    if (!supply) return 'no supply';
    if (armed.length < 2) return 'only ' + armed.length + ' armed units (' + armed.join(',') + ')';
    if (!air) return 'nothing that can shoot air';
    return null;
  };
  for (const race of ['T', 'Z', 'P']) ok('with nothing lost, ' + race + ' can fight', viable(race, new Set()) === null, String(viable(race, new Set())));
  // A record that WOULD strand a race has to be refused, or the floor is decoration. Zerg losing its
  // hydralisks, its spire and its evolution chamber is the real case: no mutalisk, no scourge, no
  // lurker, no spore colony, and a zergling cannot shoot up.
  const strand = json(c, `[...Missions.closedIn({ race: 'Z' }, { l: [{ id: 'hydralisk_den', at: 'x' }, { id: 'spire', at: 'x' }, { id: 'evolution_chamber', at: 'x' }] })]`);
  ok('a closure that would leave Zerg unable to shoot air is refused', viable('Z', new Set(strand)) === null && strand.length < 3, JSON.stringify(strand));
  const strandT = json(c, `[...Missions.closedIn({ race: 'T' }, { l: [{ id: 'factory', at: 'x' }, { id: 'academy', at: 'x' }, { id: 'engineering_bay', at: 'x' }] })]`);
  ok('...and so is one that would leave Terran with a single armed unit', viable('T', new Set(strandT)) === null && strandT.length < 3, JSON.stringify(strandT));

  // Now the sweep. The loop runs inside the VM so it can ask the real closedIn what it would do with
  // each combination; the verdict on each result comes back out to the independent reading above.
  c.__viable = (race, arr) => viable(race, new Set(arr));
  const sweep = json(c, `(() => {
    const lockable = ${JSON.stringify(lockable)}; const races = ['T', 'Z', 'P']; const bad = []; let n = 0;
    for (let i = 0; i < lockable.length; i++) for (let j = i + 1; j < lockable.length; j++) for (let k = j + 1; k < lockable.length; k++) {
      const l = [lockable[i], lockable[j], lockable[k]].map(id => ({ id, at: 'x' })); n++;
      for (const race of races) {
        const closed = [...Missions.closedIn({ race, needs: [] }, { l })];
        const why = __viable(race, closed);
        if (why && bad.length < 4) bad.push(race + ': ' + why + ' with [' + closed.join(',') + '] from [' + l.map(e => e.id).join(',') + ']');
      }
    }
    return { n, bad };
  })()`);
  ok('every combination of ' + D.maxLost + ' losses leaves every race able to fight (' + sweep.n + ' combinations, ' + (sweep.n * 3) + ' checks)', sweep.bad.length === 0, JSON.stringify(sweep.bad));
}

// ============================================================ 8. it still replays bit-exactly
section('replay');
{
  // Same script, same launch id, twice: identical. Then record it and replay the log: identical again.
  const LAUNCH = 't3#w=t1,t2;l=armory~t2;c=terrace:razed,rearguard:held';
  const script = (id, record, log) => `
    ${START(id)}
    G.recording = ${record}; G.log = []; ${log ? 'G.pendingCmds = { list: ' + JSON.stringify(log) + ', i: 0 };' : 'G.pendingCmds = null;'}
    (() => {
      const hall = G.hallOf(0);
      for (let f = 0; f < 2200; f++) {
        if (${record}) {
          if (f === 40) { const w = G.units.filter(u => u.alive && u.owner === 0 && u.def.worker); if (w[0]) w[0].setOrder({ type: 'move', x: hall.x + 180, y: hall.y + 160 }); }
          if (f === 200) G.queueUnit(hall, 'scv');
          if (f === 600) { const a = G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'marine'); for (const u of a) u.setOrder({ type: 'attackmove', x: G.players[1].startX, y: G.players[1].startY }); }
          if (f === 1400) { const t = G.units.filter(u => u.alive && u.owner === 0 && u.def.id === 'siege_tank')[0]; if (t) Abilities.issue(t, 'siege_mode', null, 0, 0, false); }
        }
        G.tick();
      }
      this.__out = { hash: G.stateHash(), frame: G.frame, log: G.log.slice(), units: G.units.filter(u => u.alive).length,
        choice: G.mission.choices.terrace || null, dossier: JSON.stringify(G.mission.dossier), mission: Replay.data().mission, build: Replay.data().build };
    })();`;
  const a = makeCtx({}); run(a, script(LAUNCH, false, null));
  const b = makeCtx({}); run(b, script(LAUNCH, false, null));
  ok('two runs of the same launch id agree bit for bit', a.__out.hash === b.__out.hash, a.__out.hash + ' vs ' + b.__out.hash);
  const rec = makeCtx({}); run(rec, script(LAUNCH, true, null));
  ok('the run recorded some commands', rec.__out.log.length > 0, String(rec.__out.log.length));
  const rep = makeCtx({}); run(rep, script(LAUNCH, false, rec.__out.log));
  ok('replaying the log reproduces the mission exactly', rec.__out.hash === rep.__out.hash, rec.__out.hash + ' vs ' + rep.__out.hash + ' units ' + rec.__out.units + '/' + rep.__out.units);
  ok('the replay header carries the whole launch id', rec.__out.mission === LAUNCH, String(rec.__out.mission));
  ok('the replay header is still stamped with the build', typeof rec.__out.build === 'string' && /^[0-9a-f]{16}$/.test(rec.__out.build), String(rec.__out.build));
  ok('the mission saw the record it was launched with', /terrace/.test(rec.__out.dossier) && /armory/.test(rec.__out.dossier), rec.__out.dossier);
  // ...and the record is not decorative: a different one is a different game. If this passed, the
  // dossier would not be reaching the simulation at all.
  const alt = makeCtx({}); run(alt, script('t4#c=terrace:razed', false, null).replace('t3#', 't4#'));
  const alt2 = makeCtx({}); run(alt2, script('t4#c=terrace:spared', false, null).replace('t3#', 't4#'));
  ok('a different record is a different simulation', alt.__out.hash !== alt2.__out.hash, alt.__out.hash + ' vs ' + alt2.__out.hash);
  // A snapshot of a mission with campaign state restores to the same simulation.
  const sn = makeCtx({});
  run(sn, `${START(LAUNCH)} for (let i = 0; i < 600; i++) G.tick(); this.__s = Snapshot.take(); this.__h0 = G.stateHash();
    for (let i = 0; i < 400; i++) G.tick(); this.__h1 = G.stateHash();
    Snapshot.restore(this.__s); this.__hr = G.stateHash();
    for (let i = 0; i < 400; i++) G.tick(); this.__h2 = G.stateHash();
    this.__closed = [...(G.players[0].closed || [])]; this.__hasReq = typeof G.players[0].hasReq === 'function';`);
  ok('a snapshot taken mid-mission restores to the same state', sn.__h0 === sn.__hr, sn.__h0 + ' vs ' + sn.__hr);
  ok('...and re-simulates identically from there', sn.__h1 === sn.__h2, sn.__h1 + ' vs ' + sn.__h2);
  ok('...with the closed branches intact', sn.__closed.includes('armory') && sn.__hasReq, JSON.stringify(sn.__closed));
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
