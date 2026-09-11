// Equal-supply duels: the third proxy candidate, and the one that is supposed to show nothing.
//   node test/duel.js [--seeds=1,2,3,4,5,6] [--frames=2400] [--v]
//
// Two armies of exactly the same supply, no AI, no macro, no research -- just the units, the weapon
// tables and the movement code. M3 ran this by hand and found Terran-Zerg 3-3, which is why HANDOFF
// lists it as "probably not where the difference lives". It is here anyway, for two reasons:
//
//   1. As a control. A proxy that lights up on everything is noise. This one only moves when a change
//      actually changes how units fight, so agreement between it and the win rate means something.
//   2. Because it is the right first probe for the *other* kind of change. "What not to repeat" in
//      HANDOFF.md is mostly js/data.js tunes -- unit costs, ratios, stats. Those are exactly what a
//      duel can see and what ten minutes of macro cannot cleanly separate from everything else.
//
// It prints a signature line. Two variants of the sim with the same signature cannot differ in combat,
// and no amount of running test/balance.js on them will show a difference that came from combat.
const fs = require('fs'), vm = require('vm'), path = require('path'), root = path.join(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const SEEDS = arg('seeds', '1,2,3,4,5,6').split(',').map(Number), FRAMES = +arg('frames', 2400), VERBOSE = process.argv.includes('--v');
// --upg=T:2,Z:0 sets every weapon and armour upgrade of that race to that level; --tech=stim,metabolic
// grants those techs to whichever side's race owns them. Both default to nothing, which is the fair
// duel. They exist because the fair duel is not the question TvZ raises: by ten minutes Terran has
// finished five techs and Zerg none (HANDOFF, "Known asymmetry"), so the fight a game actually has is
// between an upgraded army and an unupgraded one. --upg is how to put a number on that.
const UPG = {}; for (const kv of arg('upg', '').split(',')) { const [r, n] = kv.split(':'); if (r && n !== undefined) UPG[r] = +n; }
const TECH = arg('tech', '').split(',').filter(Boolean);

// 24 supply a side. Only units that fight without a research or a transformation -- no lurkers (which
// need burrow), no templar (storm), no reavers (scarabs) -- so the duel measures the weapon tables and
// nothing else. Zerglings and scourge are `pair`, so a count of 16 is 8 supply.
const COMPS = {
  'T-bio': ['T', { marine: 18, medic: 4, firebat: 2 }],
  'T-mech': ['T', { vulture: 6, siege_tank: 4, goliath: 2 }],
  'Z-linghydra': ['Z', { zergling: 16, hydralisk: 16 }],
  'Z-mutaling': ['Z', { mutalisk: 8, zergling: 16 }],
  'Z-ultraling': ['Z', { ultralisk: 4, zergling: 16 }],
  'P-zealgoon': ['P', { zealot: 6, dragoon: 6 }],
  'P-archon': ['P', { zealot: 4, dragoon: 4, archon: 2 }],
};
const names = Object.keys(COMPS);
const PAIRS = []; for (let i = 0; i < names.length; i++) for (let j = 0; j < names.length; j++) if (COMPS[names[i]][0] < COMPS[names[j]][0]) PAIRS.push([names[i], names[j]]);

function fight(compA, compB, seed) {
  const ctx = { console: { log() { }, error() { }, warn() { } }, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  ctx.__d = { a: COMPS[compA], b: COMPS[compB], seed, frames: FRAMES, upg: UPG, tech: TECH };
  return JSON.parse(vm.runInContext(`(function () {
    const D = __d;
    G.init({ players: [{ race: D.a[0], human: false, name: 'A' }, { race: D.b[0], human: false, name: 'B' }], seed: D.seed, layout: 'temple' });
    for (const p of G.players) {
      p.ai = null; p.minerals = 0; p.gas = 0;
      const lvl = D.upg[p.race]; if (lvl) for (const k in DATA.upgrades) if (DATA.upgrades[k].race === p.race) p.upg[k] = lvl;
      for (const t of D.tech) if (DATA.techs[t] && DATA.techs[t].race === p.race) p.tech.add(t);
    }
    // Nothing pre-existing may fight or be fought over: this is an army duel, not a base race.
    for (const u of G.units.slice()) if (u.owner === 0 || u.owner === 1) G.kill(u, null, true);
    const hx = G.players[0].startX, hy = G.players[0].startY;
    const place = (comp, owner, ox) => {
      const out = []; let n = 0;
      for (const id in comp[1]) for (let i = 0; i < comp[1][id]; i++, n++) {
        const u = G.spawnUnit(id, owner, hx + ox + (n % 4) * 26, hy + 120 + Math.floor(n / 4) * 26);
        if (u) out.push(u);
      }
      return out;
    };
    const A = place(D.a, 0, 40), B = place(D.b, 1, 560);
    const sup = us => us.reduce((s, u) => s + (u.alive ? (u.def.sup || 0) : 0), 0);   // a spawned zergling is 0.5 on its own
    const sup0 = { a: sup(A), b: sup(B) };
    const tx = (us) => { let x = 0, y = 0, n = 0; for (const u of us) if (u.alive) { x += u.x; y += u.y; n++; } return n ? { x: x / n, y: y / n } : null; };
    // applyOrder, not setOrder: CMD.install() wraps setOrder, and outside a tick it packs the call as a
    // player command owned by G.human, which is nobody here. applyOrder is the raw sim entry the sim
    // itself uses (applyOrder, the unwrapped path a rally or the AI takes), so a duel drives units the
    // same way an order arriving does.
    const send = (us, x, y) => { for (const u of us) if (u.alive) { u.queue = []; u.applyOrder({ type: 'attackmove', x, y }); } };
    send(A, hx + 600, hy + 160); send(B, hx + 80, hy + 160);
    let f = 0;
    for (; f < D.frames; f++) {
      G.tick();
      if (!sup(A) || !sup(B)) break;
      // Re-issue every 12 s so a side that has drifted apart re-engages rather than standing idle.
      if (G.frame % 288 === 0) { const ca = tx(A), cb = tx(B); if (ca && cb) { send(A, cb.x, cb.y); send(B, ca.x, ca.y); } }
    }
    return JSON.stringify({ frames: f, sup0, left: { a: sup(A), b: sup(B) } });
  })()`, ctx));
}

const rows = [];
for (const [ca, cb] of PAIRS) for (const seed of SEEDS) {
  const r = fight(ca, cb, seed);
  rows.push({ ca, cb, seed, ...r, margin: r.left.a - r.left.b });
  if (VERBOSE) console.log(`  ${ca} vs ${cb} seed ${seed}: ${r.left.a.toFixed(1)} vs ${r.left.b.toFixed(1)} left after ${r.frames}f`);
}
const cond = (Object.keys(UPG).length ? '   upgrades ' + Object.entries(UPG).map(([r, n]) => r + ':' + n).join(' ') : '') + (TECH.length ? '   techs ' + TECH.join(' ') : '');
console.log('Equal-supply duels: ' + PAIRS.length + ' compositions x ' + SEEDS.length + ' seeds = ' + rows.length + ' fights, ' + FRAMES + ' frame cap' + cond + '\n');
console.log('  ' + 'A'.padEnd(14) + 'B'.padEnd(14) + 'A wins'.padEnd(8) + 'mean supply left (A - B)');
const byPair = new Map();
for (const r of rows) { const k = r.ca + '|' + r.cb; if (!byPair.has(k)) byPair.set(k, []); byPair.get(k).push(r); }
for (const [k, rs] of byPair) {
  const [ca, cb] = k.split('|'), wins = rs.filter(r => r.margin > 0).length;
  const mean = rs.reduce((s, r) => s + r.margin, 0) / rs.length;
  console.log('  ' + ca.padEnd(14) + cb.padEnd(14) + (wins + '/' + rs.length).padEnd(8) + (mean >= 0 ? '+' : '') + mean.toFixed(1));
}
// Per race pairing, which is the number a balance change would have to move.
const byMu = new Map();
for (const r of rows) { const mu = COMPS[r.ca][0] + 'v' + COMPS[r.cb][0]; if (!byMu.has(mu)) byMu.set(mu, []); byMu.get(mu).push(r); }
console.log('\n  ' + 'matchup'.padEnd(10) + 'first race wins'.padEnd(18) + 'mean supply margin');
for (const [mu, rs] of byMu) console.log('  ' + mu.padEnd(10) + ((rs.filter(r => r.margin > 0).length) + '/' + rs.length).padEnd(18) + ((rs.reduce((s, r) => s + r.margin, 0) / rs.length) >= 0 ? '+' : '') + (rs.reduce((s, r) => s + r.margin, 0) / rs.length).toFixed(2));
// One number for the whole run. Identical signatures mean the two builds cannot differ in combat.
const sig = rows.map(r => r.margin.toFixed(2)).join(',');
let h = 0; for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) >>> 0;
console.log('\nsignature ' + h.toString(16).padStart(8, '0') + '   (same signature = the change is invisible to combat)');
