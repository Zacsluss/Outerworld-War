// Can everything actually be built?  node test/techtree.js
//
// A closure over the tech tree: start from what a player is given at frame 0, then repeatedly add
// anything whose requirements are already satisfied, until nothing new appears. Whatever is left over
// cannot be reached in a real game no matter how long it runs -- a unit whose producer is unbuildable,
// an add-on whose parent does not list it, a tech on a building nobody can put down, a requirement
// naming something that does not exist.
//
// This exists because "why can't I build a Battlecruiser?" is not answerable by reading one line: it
// needs a Control Tower on a Starport and a Physics Lab on a Science Facility, and each of those is an
// add-on on a building with its own chain. Checking the whole tree at once is cheaper than checking any
// one path by hand, and it catches the cases nobody thought to ask about.
const fs = require('fs'), vm = require('vm'), path = require('path'), root = path.join(__dirname, '..');
const ctx = { console: { log() { }, error() { }, warn() { } }, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
// `const` inside a vm context is not an own property of the context object, so these come back
// through the evaluator rather than off ctx.
const g = n => vm.runInContext(n, ctx);
const DATA = g('DATA'), RACE_INFO = g('RACE_INFO'), EQUIV = g('EQUIV') || {};

let fails = 0, checks = 0;
const bad = (msg) => { console.log('  FAIL ' + msg); fails++; };
const ok = (msg) => { console.log('  PASS ' + msg); };

// A building id counts as present if it, or anything that morphs into it, is present. Lair satisfies a
// hatchery requirement, and greater spire a spire, which is what EQUIV is for.
const satisfiedBy = (id, have) => have.has(id) || (EQUIV[id] || []).some(x => have.has(x));

for (const race of ['T', 'Z', 'P']) {
  console.log('\n=== ' + race + ' ===');
  const have = new Set([RACE_INFO[race].hall]);
  const techs = new Set(), units = new Set();
  const reqMet = def => !def.req || def.req.every(r => DATA.techs[r] ? techs.has(r) : satisfiedBy(r, have));
  // A producer is a building for Terran and Protoss and a *unit* for Zerg: everything hatches from a
  // larva, a lurker from a hydralisk, a guardian from a mutalisk. Larva is not built by anyone -- a
  // hall spawns it -- so it seeds the closure alongside the hall.
  if (Object.values(DATA.buildings).some(b => b.race === race && b.spawnsLarva)) units.add('larva');
  const producerOk = u => !u.from || satisfiedBy(u.from, have) || units.has(u.from);

  // the closure
  for (let pass = 0; pass < 40; pass++) {
    let grew = false;
    for (const [id, u] of Object.entries(DATA.units)) {
      if (u.race !== race || units.has(id)) continue;
      if (!producerOk(u) || !reqMet(u)) continue;
      units.add(id); grew = true;
    }
    for (const [id, d] of Object.entries(DATA.buildings)) {
      if (d.race !== race || have.has(id)) continue;
      if (!reqMet(d)) continue;
      // an add-on also needs a parent that offers it, and a morph needs its source building
      if (d.tier === 'addon') { const p = DATA.buildings[d.parent]; if (!p || !have.has(d.parent) || !(p.addons || []).includes(id)) continue; }
      if (d.tier === 'morph') { const from = Object.values(DATA.buildings).find(b => b.morphTo === id || (b.morphOptions || []).includes(id)); if (!from || !have.has(from.id)) continue; }
      have.add(id); grew = true;
    }
    for (const [id, t] of Object.entries(DATA.techs)) {
      if (t.race !== race || techs.has(id)) continue;
      if (!have.has(t.bld)) continue;
      if (!reqMet(t)) continue;
      techs.add(id); grew = true;
    }
    if (!grew) break;
  }

  // ---- units ----
  for (const [id, u] of Object.entries(DATA.units)) {
    if (u.race !== race || u.notUnit || u.larva || u.egg) continue;
    checks++;
    if (units.has(id)) continue;
    const missing = (u.req || []).filter(r => DATA.techs[r] ? !techs.has(r) : !satisfiedBy(r, have));
    if (!producerOk(u)) bad(u.name + ': its producer (' + u.from + ') is never reachable');
    else bad(u.name + ': unreachable requirement ' + (missing.join(', ') || '(none listed -- check `from`)'));
  }
  // ---- buildings ----
  for (const [id, d] of Object.entries(DATA.buildings)) {
    if (d.race !== race || d.tier === 'none') continue;
    checks++;
    if (!have.has(id)) bad(d.name + ' (' + id + '): never buildable' + (d.req ? '  req ' + d.req.join(',') : '') + (d.tier === 'addon' ? '  addon of ' + d.parent : ''));
  }
  // ---- techs and upgrades ----
  for (const [id, t] of Object.entries(DATA.techs)) {
    if (t.race !== race) continue; checks++;
    if (!techs.has(id)) bad('tech ' + t.name + ': never researchable (needs ' + t.bld + ')');
  }
  for (const [id, u] of Object.entries(DATA.upgrades)) {
    if (u.race !== race) continue; checks++;
    if (!have.has(u.bld)) { bad('upgrade ' + u.name + ': its building (' + u.bld + ') is never buildable'); continue; }
    const unreachable = (u.req || []).filter(r => r && !satisfiedBy(r, have));
    if (unreachable.length) bad('upgrade ' + u.name + ': level requirement ' + unreachable.join(',') + ' never buildable');
  }
  // ---- every requirement names something real ----
  for (const table of [DATA.units, DATA.buildings, DATA.techs]) for (const [id, d] of Object.entries(table)) {
    if (d.race !== race || !d.req) continue;
    for (const r of d.req) { checks++; if (!DATA.buildings[r] && !DATA.techs[r]) bad((d.name || id) + ': requirement "' + r + '" is not a building or a tech'); }
  }
  console.log('  reached ' + have.size + ' buildings, ' + units.size + ' units, ' + techs.size + ' techs');
}

// The long Terran chains the player actually asks about, spelled out, so a regression names itself.
console.log('\n=== the chains people ask about ===');
const chain = (unitId) => {
  const u = DATA.units[unitId]; const parts = [];
  const walk = (id, depth) => { if (depth > 6) return; const d = DATA.buildings[id]; if (!d) return; const bits = [d.name]; if (d.tier === 'addon') bits.push('(add-on on ' + DATA.buildings[d.parent].name + ')'); parts.push('  '.repeat(depth) + bits.join(' ')); for (const r of (d.req || [])) walk(r, depth + 1); if (d.tier === 'addon') walk(d.parent, depth + 1); };
  for (const r of [u.from, ...(u.req || [])]) walk(r, 1);
  const seen = new Set(), lines = parts.filter(l => { const k = l.trim(); if (seen.has(k)) return false; seen.add(k); return true; });
  console.log('\n' + u.name + '  needs:\n' + lines.join('\n'));
};
for (const id of ['battlecruiser', 'ghost', 'medic', 'science_vessel']) chain(id);

console.log('\n' + (fails ? fails + ' FAILED of ' + checks + ' checks' : 'ALL PASS  ' + checks + ' checks, everything in the tech tree is reachable'));
process.exit(fails ? 1 : 0);
