// THE PER-THINK SPEND LEDGER. A measurement, not a check -- it prints, it never fails.
//
//   node test/ledger.js [minutes=20] [seed=1] [solo|vs] [T|Z|P|all]
//
// WHY THIS EXISTS. The AI has one shared spending brake -- reserveMin/reserveGas -- with four
// overrides bolted onto it: the 40% floor inside afford(), techStarved() hard mode, the 35%-of-gas
// composition hold in production(), and the research surplus rule. Each was added to fix one symptom
// and they now fight each other, and the visible damage (heavy units "buildable, never chosen", the
// Oracle missing from the soak, tier-3 coverage at 4/13, the Zerg roach ratchet) is downstream of all
// four at once. You cannot tune your way out of that without knowing which gate actually refuses what.
//
// So this answers three questions with numbers rather than a hypothesis:
//
//   1. WHERE DOES THE MONEY GO? Every mineral and every gas, split by what it bought and by which
//      phase of the think bought it. Hooked on the Player's own minerals/gas properties, so it counts
//      the deduction the simulation actually makes -- not a model of it.
//   2. WHAT DOES THE RESERVE REFUSE? Every gate in the AI records what it turned down and what that
//      cost. The hooks live AT each guard (AI.note in js/ai.js), not in a regex probe out here, which
//      is the only version that does not go stale the moment a guard is edited.
//   3. WHICH UNITS ARE NEVER CHOSEN, AND BY WHICH GATE? For every unit in the composition table:
//      when its requirements were first met, how many were built, and the tally of refusals by reason.
//      "Top-ranked and refused" is counted separately, because that is the ratchet: the composition
//      asks for the expensive unit, something says no, and the fall-through buys the cheap one.
//
// SELF-CHECK. The ledger must not perturb the thing it measures, so the run is done twice on the same
// seed -- once instrumented, once clean -- and a state hash is compared. If that line says DIVERGED,
// every number below it is describing a different game and none of them mean anything.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const MIN = parseFloat(process.argv[2] || '20');
const FRAMES = Math.round(MIN * 60 * 24);
const SEED = parseInt(process.argv[3] || '1');
const SOLO = (process.argv[4] || 'solo') === 'solo';
const RACES = (process.argv[5] || 'all') === 'all' ? ['T', 'Z', 'P'] : [process.argv[5]];

const mk = () => {
  const c = { console: { log() { }, warn() { }, error(...a) { c.__err.push(String(a[1] && a[1].stack || a[1] || a[0])); } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { },
    document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false },
    requestAnimationFrame() { } };
  c.window = c; c.globalThis = c; c.__err = []; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f });
  return c;
};

const mmss = f => f < 0 ? ' -- ' : Math.floor(f / 24 / 60) + ':' + String(Math.floor(f / 24) % 60).padStart(2, '0');
const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

// ---------------------------------------------------------------------------
// The in-context probe. Everything here runs inside the vm alongside the sim.
// NO BACKTICKS ANYWHERE IN THIS STRING -- it is itself a template literal, and one backtick inside
// it terminates it. That has broken test/zerg12.js and test/soak.js before now.
// ---------------------------------------------------------------------------
const PROBE = (race, ledgered) => `(() => {
  G.init({ players: [{ race: '${race}', human: false, difficulty: 'hard', name: 'A', team: 1 },
                     { race: '${race}', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: ${SEED}, layout: 'temple' });
  G.recording = false;
  G.checkVictory = () => { };            // the game may not end: the spending is what is being measured
  if (${SOLO}) G.players[1].ai = null;   // an opponent that does nothing: this measures the ceiling

  const p = G.players[0], ai = p.ai;
  const L = ${ledgered};

  // ---- what is being bought right now -------------------------------------
  // Every purchase in the simulation is a "p.minerals -= x" somewhere. Rather than model where those
  // are, the six queueing entry points and the worker's arrival at a build site are wrapped to leave a
  // tag, and the property setter below reads it. Anything that spends without a tag lands in 'other',
  // which is the number to watch if this ever stops adding up.
  let buying = null;
  const wrapG = (name, kind, idOf) => { const f = G[name].bind(G); G[name] = function (...a) { const was = buying; buying = { kind, id: idOf(a) }; try { return f(...a); } finally { buying = was; } }; };
  if (L) {
    wrapG('queueUnit', 'unit', a => a[1]);
    wrapG('larvaMorph', 'unit', a => a[1]);
    wrapG('queueUpgrade', 'upgrade', a => a[1]);
    wrapG('queueTech', 'upgrade', a => a[1]);
    wrapG('queueAddon', 'building', a => a[1]);
    wrapG('queueMorph', 'morph', a => a[1]);
    const tb = Unit.prototype.tickBuild;
    Unit.prototype.tickBuild = function () { const was = buying; buying = { kind: 'building', id: this.order.def && this.order.def.id }; try { return tb.call(this); } finally { buying = was; } };
    const ab = Abilities.morph;
    if (ab) Abilities.morph = function (u, id) { const was = buying; buying = { kind: 'morph', id }; try { return ab.call(Abilities, u, id); } finally { buying = was; } };
  }

  // ---- spend and income, straight off the Player ---------------------------
  const spend = {}, bought = {}, income = { min: 0, gas: 0 };
  if (L) for (const res of ['minerals', 'gas']) {
    let v = p[res];
    Object.defineProperty(p, res, {
      configurable: true,
      get() { return v; },
      set(nv) {
        const d = nv - v; v = nv;
        if (d > 0) { income[res === 'minerals' ? 'min' : 'gas'] += d; return; }
        if (d === 0) return;
        const b = buying || { kind: 'other', id: null };
        const key = b.kind + '/' + (ai.phase || 'outside');
        const e = spend[key] || (spend[key] = { min: 0, gas: 0, n: 0 });
        e[res === 'minerals' ? 'min' : 'gas'] -= d;
        if (res === 'minerals') { e.n++; if (b.id) bought[b.id] = (bought[b.id] || 0) + 1; }
      },
    });
  }

  // ---- the refusal ledger --------------------------------------------------
  // ai.ledger is the hook in js/ai.js. Draining it once per tick keeps the array small; the
  // aggregation happens here so nothing the size of a game has to cross the vm boundary.
  const gates = {}, unit = {}, timeline = [];
  let thinks = 0, thinksReserved = 0, thinksBound = 0, rmSum = 0, rmN = 0, rgSum = 0, rgN = 0;
  const headHeld = {};
  let lastHead = null, lastHeadF = 0, lastThinkF = -1;

  const drain = () => {
    const L2 = ai.ledger; if (!L2 || !L2.length) return;
    // A think is one frame: every record sharing a frame belongs to the same think.
    let f = -1, reserved = false, bound = false, rank = 0;
    for (const r of L2) {
      if (r.f !== f) {
        if (f >= 0) { thinks++; if (reserved) thinksReserved++; if (bound) thinksBound++; }
        f = r.f; reserved = false; bound = false; rank = 0;
        if (r.rm > 0) { rmSum += r.rm; rmN++; }
        if (r.rg > 0) { rgSum += r.rg; rgN++; }
      }
      if (r.rm > 0 || r.rg > 0) reserved = true;
      if (r.gate === 'reserveMin' || r.gate === 'reserveGas') bound = true;
      if (r.gate !== 'ok') {
        // afford() does not know what it is refusing FOR -- only train() and build() do -- so its own
        // gates are keyed by the phase that called them. Without that, "reserveMin x581" is the single
        // largest number in the report and says nothing whatsoever about what was lost.
        const key = (r.gate === 'reserveMin' || r.gate === 'reserveGas' || r.gate === 'broke') ? r.gate + ':' + r.ph : r.gate;
        const g = gates[key] || (gates[key] = { n: 0, min: 0, gas: 0, ids: {} });
        g.n++; g.min += r.min; g.gas += r.gas;
        if (r.id) g.ids[r.id] = (g.ids[r.id] || 0) + 1;
        else g.ids[r.min + 'm/' + r.gas + 'g'] = (g.ids[r.min + 'm/' + r.gas + 'g'] || 0) + 1;
      }
      // Head-step occupancy: which build step held the front of the order, and for how long.
      if (r.hd !== lastHead) { if (lastHead) headHeld[lastHead] = (headHeld[lastHead] || 0) + (r.f - lastHeadF); lastHead = r.hd; lastHeadF = r.f; }
      // Per-unit refusals, and the RANK the refusal happened at. production() walks the composition
      // in score order and calls train() on each until one succeeds, so the first train-gate refusal
      // in a production phase is the top-ranked unit being turned down -- which is the ratchet.
      if (r.gate.slice(0, 5) === 'train' && r.id) {
        const u = unit[r.id] || (unit[r.id] = { by: {}, top: 0, n: 0 });
        u.by[r.gate] = (u.by[r.gate] || 0) + 1; u.n++;
        if (r.ph === 'production') { rank++; if (rank === 1) u.top++; }
      }
    }
    if (f >= 0) { thinks++; if (reserved) thinksReserved++; if (bound) thinksBound++; }
    L2.length = 0;
  };

  if (L) ai.ledger = [];
  const reqAt = {}, srcB = {};
  const compIds = new Set();
  for (const k of Object.keys(AI_COMP)) if (k[0] === '${race}') for (const e of AI_COMP[k]) compIds.add(e[0]);

  for (let i = 0; i < ${FRAMES}; i++) {
    G.tick();
    if (L) drain();
    if (i % 240 === 0) {
      // UNLOCKED MEANS A PRODUCER STANDS FINISHED, not merely that hasReq passes. A Corsair's req list
      // is empty -- the Stargate it comes out of is expressed as its "from", which hasReq never looks
      // at -- so the raw test reported every Protoss air unit as unlocked at 0:00 in a game that never
      // built a Stargate, which inverts the whole question. This is production()'s own filter, so it
      // asks exactly the question production() asks.
      for (const id of compIds) {
        const ud = DATA.units[id]; if (!ud || reqAt[id] !== undefined || !p.hasReq(ud)) continue;
        const src = ud.from === 'larva' ? G.units.some(u => u.alive && u.owner === 0 && u.def.larva)
          : G.units.some(u => u.alive && u.owner === 0 && u.isBuilding && u.done && u.def.produces.includes(id));
        if (src) reqAt[id] = G.frame;
      }
      // ...and which building that would have to be, for the ones that never got there. "Never chosen"
      // and "never unlockable" are different faults with opposite fixes and must not share a row.
      for (const id of compIds) { if (srcB[id] !== undefined) continue; srcB[id] = null;
        for (const k of Object.keys(DATA.buildings)) if ((DATA.buildings[k].produces || []).includes(id)) { srcB[id] = k; break; } }
      if (L && i % 1440 === 0) timeline.push({ f: G.frame, m: Math.round(p.minerals), g: Math.round(p.gas),
        rm: ai.reserveMin, rg: ai.reserveGas, hd: (ai.headDef && ai.headDef.id) || null, idx: ai.scriptIdx,
        sup: p.supUsed, wk: G.units.filter(u => u.alive && u.owner === 0 && u.def.worker).length });
    }
  }
  if (L && lastHead) headHeld[lastHead] = (headHeld[lastHead] || 0) + (G.frame - lastHeadF);

  // A cheap state hash: enough shape that a different game gives a different number.
  let hash = 0;
  for (const u of G.units) if (u.alive) hash = (hash * 31 + u.owner * 7919 + Math.round(u.x) + Math.round(u.y) * 3 + u.def.id.length * 13) | 0;
  hash = (hash * 31 + Math.round(p.minerals) * 17 + Math.round(p.gas) * 19 + p.supUsed * 23 + p.ai.scriptIdx * 29) | 0;

  const built = {};
  for (const u of G.units) if (u.alive && u.owner === 0) built[u.def.id] = (built[u.def.id] || 0) + 1;

  return { hash, spend, bought, income, gates, unit, timeline, thinks, thinksReserved, thinksBound,
           headHeld, reqAt, srcB, compIds: [...compIds], built, errs: __err.slice(0, 3),
           idx: ai.scriptIdx, sup: p.supUsed, supMax: p.supMax, bank: [Math.round(p.minerals), Math.round(p.gas)],
           rmMean: rmN ? Math.round(rmSum / rmN) : 0, rgMean: rgN ? Math.round(rgSum / rgN) : 0,
           buildings: G.units.filter(u => u.alive && u.owner === 0 && u.isBuilding && u.done).length };
})()`;

const run = (race, ledgered) => { const c = mk(); return JSON.parse(vm.runInContext('JSON.stringify(' + PROBE(race, ledgered) + ')', c)); };

console.log('SPEND LEDGER -- ' + MIN + ' min, hard, victory suppressed, ' + (SOLO ? 'UNMOLESTED (opponent does nothing)' : 'contested') + ', seed ' + SEED);

for (const race of RACES) {
  const r = run(race, true);
  const clean = run(race, false);
  const nm = { T: 'TERRAN', Z: 'ZERG', P: 'PROTOSS' }[race];
  console.log('\n' + '='.repeat(96) + '\n' + nm + '   script step ' + r.idx + ',  supply ' + r.sup + '/' + r.supMax +
    ',  bank ' + r.bank[0] + 'm ' + r.bank[1] + 'g,  ' + r.buildings + ' buildings\n' + '='.repeat(96));
  console.log('self-check: instrumented hash ' + r.hash + ' vs clean ' + clean.hash + '  -> ' +
    (r.hash === clean.hash ? 'IDENTICAL (the ledger does not perturb the game)' : '*** DIVERGED -- every number below describes a different game ***'));
  if (r.errs.length) console.log('AI errors: ' + r.errs.join(' | '));

  // ---- 1. where the money went -------------------------------------------
  const keys = Object.keys(r.spend).sort((a, b) => (r.spend[b].min + r.spend[b].gas) - (r.spend[a].min + r.spend[a].gas));
  const tm = keys.reduce((s, k) => s + r.spend[k].min, 0), tg = keys.reduce((s, k) => s + r.spend[k].gas, 0);
  console.log('\n1. WHERE THE MONEY WENT     mined ' + Math.round(r.income.min) + 'm ' + Math.round(r.income.gas) + 'g' +
    ',  spent ' + Math.round(tm) + 'm ' + Math.round(tg) + 'g,  banked ' + r.bank[0] + 'm ' + r.bank[1] + 'g');
  console.log('   ' + pad('what / which phase bought it', 34) + num('minerals', 9) + num('%', 6) + num('gas', 8) + num('%', 6) + num('buys', 7));
  for (const k of keys) { const e = r.spend[k];
    console.log('   ' + pad(k, 34) + num(Math.round(e.min), 9) + num(tm ? (100 * e.min / tm).toFixed(1) : '0', 6) +
      num(Math.round(e.gas), 8) + num(tg ? (100 * e.gas / tg).toFixed(1) : '0', 6) + num(e.n, 7)); }
  console.log('   (a building is paid for when the worker REACHES the site, so it lands in "building/outside",');
  console.log('    not in the phase that ordered it. script/macro spend is therefore expansions-in-progress only.)');

  // ---- 2. the reserve ------------------------------------------------------
  console.log('\n2. THE RESERVE              ' + r.thinks + ' thinks recorded');
  console.log('   engaged (something reserved): ' + r.thinksReserved + '  (' + (100 * r.thinksReserved / (r.thinks || 1)).toFixed(0) + '%)' +
    '     BINDING (refused a purchase): ' + r.thinksBound + '  (' + (100 * r.thinksBound / (r.thinks || 1)).toFixed(0) + '%)');
  console.log('   mean reserve while engaged:   ' + r.rmMean + 'm  ' + r.rgMean + 'g');
  const hh = Object.entries(r.headHeld).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log('   the build order head, longest-held first:');
  for (const [id, f] of hh) console.log('      ' + pad(id, 26) + num(mmss(f), 7) + '  of the game at the front of the order');

  // ---- 3. what each gate refused ------------------------------------------
  const gs = Object.entries(r.gates).sort((a, b) => b[1].n - a[1].n);
  console.log('\n3. WHAT EACH GATE REFUSED');
  console.log('   ' + pad('gate', 16) + num('times', 8) + num('min held', 10) + num('gas held', 10) + '  most-refused');
  for (const [g, e] of gs) {
    const top = Object.entries(e.ids).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0] + ' x' + x[1]).join(', ');
    console.log('   ' + pad(g, 16) + num(e.n, 8) + num(Math.round(e.min), 10) + num(Math.round(e.gas), 10) + '  ' + (top || '-'));
  }

  // ---- 4. buildable, never chosen ------------------------------------------
  console.log('\n4. BUILDABLE, NEVER CHOSEN   (a producing building stood finished; nothing came out of it)');
  console.log('   ' + pad('unit', 20) + num('unlocked', 10) + num('built', 7) + num('top pick', 10) + '  refused by');
  const never = [], made = [];
  for (const id of Object.keys(r.reqAt).sort()) {
    const u = r.unit[id] || { by: {}, top: 0, n: 0 }, n = r.bought[id] || 0;
    const by = Object.entries(u.by).sort((a, b) => b[1] - a[1]).map(x => x[0] + ' x' + x[1]).join(', ');
    const line = '   ' + pad(id, 20) + num(mmss(r.reqAt[id]), 10) + num(n, 7) + num(u.top, 10) + '  ' + (by || '-');
    (n ? made : never).push(line);
  }
  never.forEach(l => console.log(l));
  if (!never.length) console.log('   (none -- every unlocked unit was built at least once)');
  console.log('   --- built at least once, for contrast ---');
  made.forEach(l => console.log(l));
  // The other half of the same question, and it needs the opposite fix: a unit whose producing
  // building never finished is not being refused by a spending gate at all.
  const noSrc = r.compIds.filter(id => r.reqAt[id] === undefined).sort();
  if (noSrc.length) {
    console.log('   --- never unlockable: the producing building never finished ---');
    console.log('   ' + noSrc.map(id => id + ' (' + (r.srcB[id] || 'morph/larva') + ')').join(', '));
  }

  // ---- 5. the timeline -----------------------------------------------------
  console.log('\n5. TIMELINE   (once a minute)');
  console.log('   ' + pad('time', 7) + num('min', 6) + num('gas', 6) + num('resMin', 8) + num('resGas', 8) + num('step', 6) + num('sup', 5) + num('wk', 4) + '  head of order');
  for (const t of r.timeline) console.log('   ' + pad(mmss(t.f), 7) + num(t.m, 6) + num(t.g, 6) + num(t.rm, 8) + num(t.rg, 8) + num(t.idx, 6) + num(t.sup, 5) + num(t.wk, 4) + '  ' + (t.hd || '-'));
}
