// Diagnostic for the net.js rejoin desync: isolate which of the two things a rejoin does to a snapshot
// (JSON round-trip, restore into a different process) is the one that breaks it.
//   node test/rejoindiag.js [frames=16800]
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const FRAMES = +(process.argv[2] || 16800), AFTER = 240;
const mk = () => { const ctx = { console: { log() { }, warn() { }, error(...a) { ctx.__err = ctx.__err || []; ctx.__err.push(String(a[0]) + ' ' + (a[1] && a[1].stack || a[1] || '')); } }, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { } }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  return ctx; };
const run = (ctx, src) => vm.runInContext('(() => {' + src + '})();', ctx);
const START = `G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'T', human: false, difficulty: 'normal', name: 'B' }, { race: 'Z', human: false, difficulty: 'easy', name: 'C' }], seed: 902237144, layout: 'temple' });`;

// ---- donor: play FRAMES, take a snapshot, then keep playing and record the hash every 48 frames ----
const donor = mk();
run(donor, `${START} for (let i = 0; i < ${FRAMES}; i++) G.tick(); this.snap = Snapshot.take(); this.at = G.frame;`);
run(donor, `this.ref = {}; for (let i = 0; i < ${AFTER}; i++) { G.tick(); if (G.frame % 48 === 0) this.ref[G.frame] = G.stateHash(); }`);
console.log('donor snapshot at frame ' + donor.at + ', ' + Object.keys(donor.ref).length + ' reference hashes after it');

const compare = (label, ctx) => {
  run(ctx, `this.got = {}; for (let i = 0; i < ${AFTER}; i++) { G.tick(); if (G.frame % 48 === 0) this.got[G.frame] = G.stateHash(); }`);
  const frames = Object.keys(donor.ref).map(Number).sort((a, b) => a - b);
  const bad = frames.filter(f => ctx.got[f] !== donor.ref[f]);
  console.log('  ' + label.padEnd(34) + (bad.length ? 'DIVERGED, first at frame ' + bad[0] + ' (' + (frames.length - bad.length) + '/' + frames.length + ' matched)' : 'identical (' + frames.length + '/' + frames.length + ')'));
  if (ctx.__err && ctx.__err.length) console.log('    errors: ' + ctx.__err.slice(0, 3).join(' | '));
  return bad.length === 0;
};

// A: restore in the donor's own context, no serialisation. This is what test/snapshot.js covers.
const a = mk(); run(a, `${START} for (let i = 0; i < ${FRAMES}; i++) G.tick();`);
run(a, 'this.__s = Snapshot.take(); Snapshot.restore(this.__s);');
compare('same context, no round-trip', a);

// B: JSON round-trip, restored into the same context.
const b = mk(); run(b, `${START} for (let i = 0; i < ${FRAMES}; i++) G.tick();`);
b.__json = JSON.stringify(donor.snap);
run(b, 'Snapshot.restore(JSON.parse(this.__json));');
compare('JSON round-trip, same context', b);

// C: what a rejoin actually does -- a fresh G.init, then restore a round-tripped snapshot from elsewhere.
const c = mk(); run(c, START);
c.__json = JSON.stringify(donor.snap);
run(c, 'Snapshot.restore(JSON.parse(this.__json));');
compare('JSON round-trip, fresh context', c);

// If C fails where A and B pass, the snapshot is fine and what a fresh G.init leaves behind is not.
// Report the fields that differ between a fresh-init sim and the donor at the same frame.
const dump = ctx => run(ctx, `
  const o = { frame: G.frame, rng: RNG.s, units: G.units.filter(u => u.alive).length, fields: G.fields.length, projectiles: G.projectiles.length,
    effects: G.effects.length, hash: G.stateHash(), nextId: (typeof UNIT_ID !== 'undefined' ? UNIT_ID : -1),
    players: G.players.map(p => ({ min: Math.round(p.minerals), gas: Math.round(p.gas), sup: p.supUsed + '/' + p.supMax, tech: p.tech.size, upg: Object.keys(p.upg || {}).length, def: !!p.defeated,
      vis: p.vis ? p.vis.reduce((s, v) => s + v, 0) : null, seen: p.seen ? p.seen.reduce((s, v) => s + v, 0) : null,
      ai: p.ai ? Object.keys(p.ai).filter(k => typeof p.ai[k] !== 'function' && typeof p.ai[k] !== 'object').map(k => k + '=' + p.ai[k]).join(' ') : null })),
    creep: G.map.creep.reduce((s, v) => s + v, 0), blocked: G.map.blocked.reduce((s, v) => s + v, 0), walk: G.map.walk.reduce((s, v) => s + v, 0),
    psi: Object.keys(G.map.psi).map(k => k + ':' + G.map.psi[k].reduce((s, v) => s + v, 0)).join(' '),
    res: G.map.resources.reduce((s, r) => s + r.amount, 0) };
  JSON.stringify(o);
`);
const donor2 = mk(); run(donor2, `${START} for (let i = 0; i < ${FRAMES}; i++) G.tick();`);
const c2 = mk(); run(c2, START); c2.__json = JSON.stringify(donor.snap); run(c2, 'Snapshot.restore(JSON.parse(this.__json));');
const D = JSON.parse(dump(donor2)), C = JSON.parse(dump(c2));
console.log('\nstate right after the restore, donor vs fresh-context rejoiner:');
const walk = (a, b, p) => {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? p + '.' + k : k); return; }
  console.log('  ' + p.padEnd(28) + 'donor ' + JSON.stringify(a) + '   rejoiner ' + JSON.stringify(b));
};
walk(D, C, '');
if (JSON.stringify(D) === JSON.stringify(C)) console.log('  (nothing in this dump differs)');
