// Vertical layers: the height query the simulation reads, and the promise that a ramp is the only
// way up.
//   node test/verticality.js
//
// Two things are under test and, as usual in this repository, they fail in opposite ways.
//
// THE QUERY API fails loudly and immediately, so most of what is worth checking about it is the edges:
// off the map, on a ramp, at a tile boundary, called twice, called in the other order. `heightAdvantage`
// is the one js/sim.js will wire into combat, so the property it has to have is stated rather than
// sampled -- it is ANTISYMMETRIC, `adv(a,b) === -adv(b,a)` for every pair anywhere including off the
// map, and it is zero whenever both ends are on the same tier. A ramp is tier 0, which is the whole
// design: half way up a ramp you have neither gained the high ground nor conceded it.
//
// THE TERRAIN PROMISE fails silently and for ever. "You can only get onto high ground by a ramp" is
// what makes `G.updateVision`'s `height[i] <= uh` mean anything, and a single hole in a cliff turns a
// plateau into a walk-up without changing a pixel of how it draws -- `cliff[]` still says cliff while
// `walk[]` says walk. So it is checked twice over, by two different algorithms: `elevationProblems`
// walks adjacency, and this file floods the map with every ramp tile treated as a wall and requires
// that no high ground is reachable from low ground at all. It then floods again with the ramps back
// and requires that it IS -- because "nothing is reachable" would satisfy the first half on its own.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), { makeCtx, makeOk, summary } = require('./_harness'); const root = path.join(__dirname, '..');
const ok = makeOk({ order: 'mc', extra: 'defined' });

const SIM = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'snapshot'];
const errors = [];
const ctx = (() => {
  const c = makeCtx({ files: SIM, el: 'bare', errors });
  return c;
})();
const R = src => vm.runInContext('(() => {' + src + '})();', ctx);

// The fixed layouts, then the four generators. Everything the engine can be handed.
const FIXED = ['temple', 'bloodbath', 'valley', 'small', 'medium', 'large', 'huge', 'dustbowl',
  'arch_chokepoint', 'arch_basin', 'arch_islands', 'arch_cliffs'];
const KEYS = R('return Archetypes.keys;');
const SEEDS = [1, 2, 3, 11, 47, 1234, 65535, 987654];
const SIZES = ['small', 'medium', 'large', 'huge'];

// ============================================================================
// 1. The query API returns sane values everywhere, including off the map
// ============================================================================
const api = R(`
  const out = { bad: [], off: [], tiles: 0, ramps: 0, high: 0 };
  const T = TILE;
  for (const k of ${JSON.stringify(FIXED)}) {
    const m = new GameMap(3, k);
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) {
      const i = m.idx(tx, ty), h = m.height[i];
      const tier = m.tierAt(tx, ty);
      const px = (tx + 0.5) * T, py = (ty + 0.5) * T;
      out.tiles++;
      if (h === 1) out.ramps++; if (h === 2) out.high++;
      // a tier is 0 or 1, it is 1 exactly for grid height 2, and a ramp is tier 0
      if (tier !== 0 && tier !== 1) out.bad.push(k + ' tier ' + tier + ' at ' + tx + ',' + ty);
      else if (tier !== (h === 2 ? 1 : 0)) out.bad.push(k + ' tier ' + tier + ' for height ' + h + ' at ' + tx + ',' + ty);
      else if (m.heightAt(px, py) !== tier) out.bad.push(k + ' heightAt disagrees with tierAt at ' + tx + ',' + ty);
      else if (m.onRamp(px, py) !== (h === 1)) out.bad.push(k + ' onRamp wrong at ' + tx + ',' + ty);
      // and the tile's own corners land in the same tile
      else if (m.heightAt(tx * T, ty * T) !== tier || m.heightAt((tx + 1) * T - 1, (ty + 1) * T - 1) !== tier)
        out.bad.push(k + ' a tile corner reads a different tier at ' + tx + ',' + ty);
      if (out.bad.length > 4) break;
    }
    // off the map, in every direction and at every scale a bad order could produce
    const m2 = m;
    for (const [px, py] of [[-1, -1], [-1e9, -1e9], [1e9, 1e9], [m.w * T, m.h * T], [-0.5, m.h * T / 2],
                            [m.w * T / 2, -0.5], [NaN, NaN], [Infinity, Infinity], [-Infinity, 0]]) {
      if (m2.heightAt(px, py) !== 0) out.off.push(k + ' heightAt(' + px + ',' + py + ') = ' + m2.heightAt(px, py));
      if (m2.onRamp(px, py) !== false) out.off.push(k + ' onRamp(' + px + ',' + py + ') is true');
    }
  }
  out.tiers = new GameMap(1, 'temple').HEIGHT_TIERS();
  return out;
`);
ok('heightAt and tierAt agree with the height grid on every tile of every layout (' + api.tiles + ' tiles)', api.bad.length === 0, api.bad.slice(0, 4).join(' | '));
ok('off the map -- negative, huge, NaN, Infinity -- is low ground and not a ramp', api.off.length === 0, api.off.slice(0, 4).join(' | '));
ok('the engine reports two tiers, which is what height[] can carry', api.tiers === 2, String(api.tiers));

// ============================================================================
// 2. heightAdvantage: antisymmetric, bounded, pure, and blind to ramps
// ============================================================================
// The pairs are taken from the map rather than made up, so every combination that exists on a real
// layout -- low/low, low/ramp, ramp/high, high/high, on-map/off-map -- is actually exercised.
const adv = R(`
  const T = TILE, out = { pairs: 0, asym: [], range: [], self: [], ramp: [], combos: {} };
  const P = [];
  for (const k of ['temple', 'valley', 'large', 'huge', 'arch_cliffs', 'arch_basin']) {
    const m = new GameMap(5, k), pts = [];
    // eight points of each height, spread across the map by walking a fixed stride
    const want = { 0: 8, 1: 8, 2: 8 };
    for (let i = 0; i < m.w * m.h && (want[0] || want[1] || want[2]); i += 37) {
      const h = m.height[i]; if (!want[h]) continue; want[h]--;
      pts.push([((i % m.w) + 0.5) * T, (((i / m.w) | 0) + 0.5) * T, h]);
    }
    pts.push([-40, -40, -1], [m.w * T + 40, m.h * T + 40, -1], [NaN, NaN, -1]);
    P.push([k, m, pts]);
  }
  for (const [k, m, pts] of P) for (const a of pts) for (const b of pts) {
    out.pairs++;
    const ab = m.heightAdvantage(a[0], a[1], b[0], b[1]), ba = m.heightAdvantage(b[0], b[1], a[0], a[1]);
    if (ab !== -ba) out.asym.push(k + ' ' + a + ' / ' + b + ': ' + ab + ' vs ' + ba);
    if (ab !== -1 && ab !== 0 && ab !== 1) out.range.push(k + ' ' + ab);
    const ta = a[2] === 2 ? 1 : 0, tb = b[2] === 2 ? 1 : 0;
    if (ab !== ta - tb) out.combos['wrong:' + a[2] + '>' + b[2]] = ab;
    out.combos[a[2] + '>' + b[2]] = ab;
    // a ramp is not high ground, in either direction
    if ((a[2] === 1 && b[2] === 0 || a[2] === 0 && b[2] === 1) && ab !== 0) out.ramp.push(k + ' ramp vs low = ' + ab);
    if (a[2] === 1 && b[2] === 2 && ab !== -1) out.ramp.push(k + ' ramp vs high = ' + ab);
  }
  for (const [, m, pts] of P) for (const a of pts) if (m.heightAdvantage(a[0], a[1], a[0], a[1]) !== 0) out.self.push(String(a));
  // pure: the same call twice, and interleaved with other maps, gives the same answer
  const m0 = P[0][1], q = P[0][2];
  const once = q.map(a => q.map(b => m0.heightAdvantage(a[0], a[1], b[0], b[1])).join(','));
  for (const [, mm] of P) for (const a of q) mm.heightAdvantage(a[0], a[1], 0, 0);
  out.pure = q.map(a => q.map(b => m0.heightAdvantage(a[0], a[1], b[0], b[1])).join(',')).join('|') === once.join('|');
  return out;
`);
ok('heightAdvantage is antisymmetric on all ' + adv.pairs + ' point pairs: adv(a,b) === -adv(b,a)', adv.asym.length === 0, adv.asym.slice(0, 3).join(' | '));
ok('and is always -1, 0 or +1', adv.range.length === 0, adv.range.slice(0, 3).join(' '));
ok('a point has no advantage over itself', adv.self.length === 0, adv.self.slice(0, 3).join(' | '));
ok('a ramp is tier 0: no advantage over low ground, and -1 against high ground', adv.ramp.length === 0, adv.ramp.slice(0, 3).join(' | '));
ok('every height combination that exists on a real map was exercised and scored right',
  adv.combos['2>0'] === 1 && adv.combos['0>2'] === -1 && adv.combos['2>2'] === 0 && adv.combos['0>0'] === 0
  && adv.combos['1>1'] === 0 && adv.combos['-1>2'] === -1 && adv.combos['2>-1'] === 1
  && !Object.keys(adv.combos).some(k => k.startsWith('wrong:')),
  JSON.stringify(adv.combos));
ok('it is pure: same map, same arguments, same answer, in any call order', adv.pure);

// ============================================================================
// 3. heightBonus: the numbers sim is offered, and the shape of them
// ============================================================================
const bon = R(`
  const m = new GameMap(1, 'large'), T = TILE, out = {};
  let low = null, high = null;
  for (let i = 0; i < m.w * m.h; i++) { if (!low && m.height[i] === 0 && m.walk[i] === 1) low = i; if (!high && m.height[i] === 2 && m.walk[i] === 1) high = i; }
  const pt = i => [((i % m.w) + 0.5) * T, (((i / m.w) | 0) + 0.5) * T];
  const [lx, ly] = pt(low), [hx, hy] = pt(high);
  out.down = Object.assign({}, m.heightBonus(hx, hy, lx, ly));
  out.up = Object.assign({}, m.heightBonus(lx, ly, hx, hy));
  out.level = Object.assign({}, m.heightBonus(lx, ly, lx, ly));
  out.shared = m.heightBonus(hx, hy, lx, ly) === m.heightBonus(hx, hy, lx, ly);
  out.tableShared = m.heightBonusTable() === m.heightBonusTable();
  out.frozen = Object.isFrozen(m.heightBonusTable()) && m.heightBonusTable().every(Object.isFrozen);
  try { m.heightBonus(hx, hy, lx, ly).range = 9; } catch (e) { out.threw = true; }
  out.afterWrite = m.heightBonus(hx, hy, lx, ly).range;
  // a second map hands out the same table -- the numbers are the engine's, not the map's
  out.sameAcrossMaps = new GameMap(2, 'temple').heightBonusTable() === m.heightBonusTable();
  out.rows = m.heightBonusTable().length;
  return out;
`);
ok('shooting downhill is worth more range and more sight, and no extra damage', bon.down.adv === 1 && bon.down.range > 1 && bon.down.sight > 1 && bon.down.damage === 1, JSON.stringify(bon.down));
ok('shooting uphill costs damage, and buys no range', bon.up.adv === -1 && bon.up.damage < 1 && bon.up.range === 1 && bon.up.sight === 1, JSON.stringify(bon.up));
ok('level ground changes nothing at all', bon.level.adv === 0 && bon.level.range === 1 && bon.level.sight === 1 && bon.level.damage === 1 && bon.level.hit === 1, JSON.stringify(bon.level));
ok('the table has one row per possible advantage and is shared, not rebuilt per call', bon.rows === 3 && bon.shared && bon.tableShared && bon.sameAcrossMaps);
ok('and it is frozen, so a caller cannot retune combat by writing to it', bon.frozen && bon.afterWrite > 1, String(bon.afterWrite));

// ============================================================================
// 4. Ramps are the only way up -- by adjacency, and again by flood fill
// ============================================================================
const cases = FIXED.map(k => ({ k, id: k }))
  .concat(...KEYS.map(k => SEEDS.map(s => ({ k, id: 'arch:' + k + ':' + s }))))
  .concat(...KEYS.map(k => SIZES.map(z => ({ k, id: 'arch:' + k + ':5:' + z }))));
const walk = R(`
  const out = [];
  for (const { id } of ${JSON.stringify(cases)}) {
    const m = new GameMap(9, id);
    // flood the map twice from the same low tile: once with every ramp treated as a wall, once as it is
    let start = -1;
    for (const b of m.bases) { const i = m.baseAnchor(b); if (m.height[i] === 0 && m.walk[i] === 1) { start = i; break; } }
    if (start < 0) for (let i = 0; i < m.w * m.h && start < 0; i++) if (m.height[i] === 0 && m.walk[i] === 1) start = i;
    const sx = start % m.w, sy = (start / m.w) | 0;
    const noRamp = m.walk.slice(); for (let i = 0; i < noRamp.length; i++) if (m.height[i] === 1) noRamp[i] = 0;
    const sealed = m.floodWalk(noRamp, sx, sy), open = m.floodWalk(m.walk, sx, sy);
    let leak = 0, leakAt = '', reached = 0, ramps = 0;
    for (let i = 0; i < m.w * m.h; i++) {
      if (m.height[i] === 1 && m.walk[i] === 1) ramps++;
      if (m.height[i] !== 2) continue;
      if (sealed[i]) { leak++; if (!leakAt) leakAt = (i % m.w) + ',' + ((i / m.w) | 0); }
      if (open[i]) reached++;
    }
    const plats = m.plateaus();
    // full reachability, with every feature in its most blocking state, from every start
    const worst = m.worstWalk(); const un = [];
    for (const s of m.starts) { const seen = m.floodWalk(worst, s.x + 2, s.y + 4); for (const b of m.bases) if (!seen[m.baseAnchor(b)]) un.push(b.x + ',' + b.y); }
    const cc = DATA.buildings.command_center;
    const noHall = m.bases.filter(b => m.canPlace(cc, b.x, b.y, { id: 0, race: 'T' }, [], null)).length;
    out.push({ id, probs: m.elevationProblems(), leak, leakAt, reached, ramps, un: un.length, noHall,
      reseal: m.sealElevations(), reflatten: m.flattenStrandedHeight(), starts: m.starts.length, players: m.players,
      noRampPlat: plats.filter(p => !p.ramps.length).length,
      highBases: m.bases.filter(b => m.tierAt(b.x + 2, b.y + 1) === 1).length, bases: m.bases.length });
  }
  return out;
`);
const bad = f => walk.filter(f).map(r => r.id);
ok('no layout has a hole in a cliff: ' + walk.length + ' maps, every size, every archetype, eight seeds each',
  walk.every(r => r.probs.length === 0), walk.filter(r => r.probs.length).slice(0, 2).map(r => r.id + ' ' + r.probs[0]).join(' | '));
ok('flooding from low ground with every ramp walled off reaches no high ground on any of them',
  walk.every(r => r.leak === 0), walk.filter(r => r.leak).slice(0, 3).map(r => r.id + ' at ' + r.leakAt).join(' | '));
ok('and putting the ramps back does reach it, so the check above is not passing by having nowhere to go',
  walk.every(r => r.ramps === 0 ? r.reached === 0 : r.reached > 0), bad(r => r.ramps && !r.reached).slice(0, 3).join(' '));
ok('every plateau on every one of them has at least one ramp onto it, however small', walk.every(r => r.noRampPlat === 0), bad(r => r.noRampPlat).slice(0, 3).join(' '));
ok('both repairs are idempotent: run again on a finished map, they change nothing',
  walk.every(r => r.reseal === 0 && r.reflatten === 0), bad(r => r.reseal || r.reflatten).slice(0, 3).join(' '));
ok('every base is reachable with every feature shut, on all ' + walk.length + ' maps', walk.every(r => r.un === 0), bad(r => r.un).slice(0, 3).join(' '));
ok('every base can take a town hall, on all ' + walk.length + ' maps', walk.every(r => r.noHall === 0), bad(r => r.noHall).slice(0, 3).join(' '));
ok('every map spawns as many players as it advertises', walk.every(r => r.starts === r.players), bad(r => r.starts !== r.players).slice(0, 3).join(' '));

// High ground that holds nothing is scenery. These four are the ones that were changed to hold a base.
const held = id => walk.find(r => r.id === id);
ok('large, huge and Dust Bowl each put a base per player on the central plateau',
  ['large', 'huge', 'dustbowl'].every(k => held(k).highBases === held(k).players * 2), ['large', 'huge', 'dustbowl'].map(k => k + ':' + held(k).highBases).join(' '));
ok('open basin has no high ground at the mains and a base on the one plateau it does have',
  walk.filter(r => r.id.startsWith('arch:basin')).every(r => r.highBases === r.players),
  walk.filter(r => r.id.startsWith('arch:basin')).map(r => r.highBases + '/' + r.players).join(' '));
ok('vertical cliffs keeps two bases a player up a cliff', walk.filter(r => r.id.startsWith('arch:cliffs')).every(r => r.highBases >= r.players * 2),
  walk.filter(r => r.id.startsWith('arch:cliffs')).map(r => r.highBases + '/' + r.players).join(' '));
ok('close quarters still has no high ground anywhere, so there is still no ramp to hold', held('small').ramps === 0 && held('small').highBases === 0);

// ============================================================================
// 5. The seal repairs a real hole, and repairs it the weak way
// ============================================================================
// The pass has to be able to fix something, and it has to fix it without moving anything a flood fill
// can see -- that is the argument for why adding it cannot strand a player, and it is worth an
// assertion rather than a paragraph.
const repair = R(`
  const out = {};
  const m = new GameMap(1, 'medium');
  // Punch the hole the resource-clearing pass punches: open one tile of the cliff ring, exactly as a
  // mineral patch straddling a plateau edge does, and leave everything else alone.
  let hole = -1, low = -1;
  for (let y = 1; y < m.h - 1 && hole < 0; y++) for (let x = 1; x < m.w - 1; x++) {
    const i = m.idx(x, y); if (m.height[i] !== 2 || m.walk[i] !== 0 || m.cliff[i] !== 1) continue;
    for (const j of [i - 1, i + 1, i - m.w, i + m.w]) if (m.walk[j] === 1 && m.height[j] === 0) { hole = i; low = j; break; }
    if (hole >= 0) break;
  }
  m.walk[hole] = 1; m.cliff[hole] = 0;
  const walkBefore = Array.from(m.walk).join('');
  out.opened = m.elevationProblems().length;
  out.demoted = m.sealElevations();
  out.closed = m.elevationProblems().length;
  out.height = m.height[hole]; out.stillWalkable = m.walk[hole] === 1;
  out.walkUntouched = Array.from(m.walk).join('') === walkBefore;
  out.lowUntouched = m.height[low] === 0;

  // ...and where the high side is a base's own footprint, the LOW side is demoted instead, because
  // canPlace refuses a hall on a ramp and a demoted footprint tile would delete the base.
  const m2 = new GameMap(1, 'medium'), cc = DATA.buildings.command_center;
  const b = m2.bases.find(bb => m2.height[m2.idx(bb.x + 2, bb.y + 1)] === 2);
  const inside = m2.idx(b.x - 1, b.y + 1), outside = inside - 1;
  m2.height[outside] = 0; m2.walk[outside] = 1; m2.cliff[outside] = 0;
  out.baseProblems = m2.elevationProblems().length;
  out.baseDemoted = m2.sealElevations();
  out.hallHeight = m2.height[inside]; out.outsideHeight = m2.height[outside];
  out.hallStillPlaceable = m2.canPlace(cc, b.x, b.y, { id: 0, race: 'T' }, [], null);
  out.baseClosed = m2.elevationProblems().length;
  return out;
`);
ok('a hole punched in a cliff is reported', repair.opened > 0, String(repair.opened));
ok('the seal closes it by demoting the high side to a ramp, and leaves it walkable',
  repair.demoted === 1 && repair.closed === 0 && repair.height === 1 && repair.stillWalkable, JSON.stringify(repair));
ok('and it does not touch walk[], so no flood fill in the repository sees a different map', repair.walkUntouched && repair.lowUntouched);
ok('a hole at a base footprint is closed from the low side instead, and the hall still fits',
  repair.baseProblems > 0 && repair.baseDemoted > 0 && repair.baseClosed === 0
  && repair.hallHeight === 2 && repair.outsideHeight === 1 && repair.hallStillPlaceable === null,
  JSON.stringify(repair));

// A feature standing on a lip is the case that would have gone wrong quietly: its tiles have to keep
// `walk` 0 and `cliff` 2 while it stands, so the demotion has to go through the feature rather than
// straight into the grids, and it has to move the ground the feature REMEMBERS so that clearing it
// later does not reopen the hole.
const featSeal = R(`
  const m = new GameMap(9, 'arch:chokepoint:3');
  const f = m.features.find(q => q.kind === 'rocks');
  const t0 = f.t0, x = t0 % m.w, y = (t0 / m.w) | 0;
  f.baseH[0] = 2; m.syncFeature(f);                       // stand the rocks on a lip of high ground
  let low = -1;
  for (const j of [t0 - 1, t0 + 1, t0 - m.w, t0 + m.w]) if (m.featTile[j] < 0) { m.walk[j] = 1; m.height[j] = 0; m.cliff[j] = 0; low = j; break; }
  const out = { set: m.height[t0], problems: m.elevationProblems().length, demoted: m.sealElevations() };
  out.height = m.height[t0]; out.baseH = f.baseH[0]; out.walk = m.walk[t0]; out.cliff = m.cliff[t0];
  out.clean = m.elevationProblems().length;
  m.breakFeature(f);                                      // and clearing it leaves the lip a ramp, not a hole
  out.brokeHeight = m.height[t0]; out.brokeWalk = m.walk[t0]; out.brokeClean = m.elevationProblems().length;
  return out;
`);
ok('a feature standing on a cliff lip is sealed through the feature, and stays shut, solid and drawn as rock',
  featSeal.set === 2 && featSeal.problems > 0 && featSeal.demoted > 0 && featSeal.height === 1
  && featSeal.baseH === 1 && featSeal.walk === 0 && featSeal.cliff === 2 && featSeal.clean === 0, JSON.stringify(featSeal));
ok('and clearing it afterwards opens a ramp rather than reopening the hole',
  featSeal.brokeHeight === 1 && featSeal.brokeWalk === 1 && featSeal.brokeClean === 0, JSON.stringify(featSeal));

// The second defect this found, kept as a regression with its seed: a rock formation dropped across
// terrace 2 of Vertical Cliffs cut fifteen tiles of it off from the ramp, and stranded high ground is
// a hole in every ground army's vision that neither player can ever stand in.
//
// That rock ellipse is no longer placed (terrain queue item 2, Archetypes.cliffs), so the seed strands nothing now. The pass
// still has to REPAIR, so the case is rebuilt by hand: a 3x3 of open low ground with nothing walkable above height 0 within
// two tiles is raised -- a plateau no ramp touches -- and the pass has to find it and put it down again. Small on purpose:
// elevationProblems lists 24 lines, and the raised block's own cliff-less edges come first.
const strand = R(`
  const m = new GameMap(9, 'arch:cliffs:11');
  const before = Array.from(m.walk).join('');
  const out = { probs: m.elevationProblems().length, stranded: m.flattenStrandedHeight(), walkSame: Array.from(m.walk).join('') === before };
  const m2 = new GameMap(9, 'arch:cliffs:11');
  let raised = 0, spot = null;
  for (let y = 8; y < m2.h - 10 && !spot; y++) for (let x = 8; x < m2.w - 10 && !spot; x++) {
    let ok = true;
    for (let b = -2; b <= 4 && ok; b++) for (let a = -2; a <= 4; a++) { const i = m2.idx(x + a, y + b), inner = a >= 0 && a <= 2 && b >= 0 && b <= 2;
      if (inner ? (m2.walk[i] !== 1 || m2.height[i] !== 0 || m2.cliff[i] !== 0 || m2.blocked[i] !== -1) : (m2.walk[i] === 1 && m2.height[i] > 0)) { ok = false; break; } }
    if (ok) spot = [x, y];
  }
  if (spot) for (let y = spot[1]; y < spot[1] + 3; y++) for (let x = spot[0]; x < spot[0] + 3; x++) { m2.height[m2.idx(x, y)] = 2; raised++; }
  out.raised = raised;
  out.found = m2.elevationProblems().filter(s => s.includes('no ramp')).length;
  out.flattened = m2.flattenStrandedHeight();
  out.clean = m2.elevationProblems().length;
  return out;
`);
ok('a finished map has no stranded high ground left to flatten, and flattening never moved walk[]',
  strand.probs === 0 && strand.stranded === 0 && strand.walkSame, JSON.stringify(strand));
ok('and raising ' + strand.raised + ' tiles of it back up is found and put down again',
  strand.raised > 0 && strand.found > 0 && strand.flattened === strand.raised && strand.clean === 0, JSON.stringify(strand));

// The hole this found in a layout that has shipped since M1, kept as a regression: Twilight Valley's
// rich expansion has its geyser sitting on the southern lip of the map's largest plateau.
const tv = R(`
  const m = new GameMap(1, 'valley'), g = m.resources.find(r => r.type === 'geyser' && r.x === 98 && r.y === 34);
  if (!g) return { missing: true };
  const hs = []; for (let x = g.x; x < g.x + g.w; x++) for (let y = g.y; y < g.y + g.h; y++) hs.push(m.height[m.idx(x, y)] + ':' + m.walk[m.idx(x, y)]);
  return { hs, probs: m.elevationProblems().length, lip: m.tierAt(98, 35), inside: m.tierAt(98, 34), below: m.tierAt(98, 36) };
`);
ok('Twilight Valley\'s rich geyser is no longer a four-tile undrawn ramp onto the plateau',
  !tv.missing && tv.probs === 0 && tv.lip === 0 && tv.below === 0, JSON.stringify(tv));

// ============================================================================
// 6. Generation stays seeded, and a game on the changed ground still replays
// ============================================================================
const det = R(`
  const sig = m => [Array.from(m.height).join(''), Array.from(m.walk).join(''), Array.from(m.cliff).join(''),
    Array.from(m.blocked).join(','), m.bases.map(b => b.x + '.' + b.y).join('|'), m.starts.map(s => s.x + ',' + s.y).join(' ')].join('#');
  const ids = ${JSON.stringify(FIXED.concat(KEYS.map(k => 'arch:' + k + ':777'), SIZES.map(z => 'arch:basin:31:' + z)))};
  const first = {}, out = { same: [], order: [] };
  for (const id of ids) first[id] = sig(new GameMap(4, id));
  for (const id of ids) if (sig(new GameMap(4, id)) !== first[id]) out.same.push(id);
  // ...and in the reverse order, with unrelated maps generated in between
  for (const id of [...ids].reverse()) { new GameMap(99, 'huge'); new GameMap(2, 'arch:islands:12'); if (sig(new GameMap(4, id)) !== first[id]) out.order.push(id); }
  out.n = ids.length;
  return out;
`);
ok('every layout generates identically twice from one seed (' + det.n + ' of them)', det.same.length === 0, det.same.slice(0, 3).join(' '));
ok('and identically again in reverse order with other maps generated in between', det.order.length === 0, det.order.slice(0, 3).join(' '));

const game = R(`
  const play = (layout, n) => {
    G.init({ players: [{ race: 'T', human: false, difficulty: 'normal', name: 'A' }, { race: 'Z', human: false, difficulty: 'normal', name: 'B' }], seed: 21, layout });
    for (let f = 0; f < n; f++) G.tick();
    return G.stateHash();
  };
  return { large: [play('large', 1500), play('large', 1500)], basin: [play('arch:basin:5', 1500), play('arch:basin:5', 1500)] };
`);
ok('a game on the new central-plateau ground re-runs bit-identically', game.large[0] === game.large[1], game.large.join(' vs '));
ok('and so does one on a generated basin', game.basin[0] === game.basin[1], game.basin.join(' vs '));

// ============================================================================
// 7. Vision still works the way the query says it does
// ============================================================================
// This is the foundation the whole feature stands on -- `G.updateVision`'s `height[i] <= uh` -- and it
// belongs to js/game.js, so what is asserted here is that the new query AGREES with it rather than
// replacing it: wherever heightAdvantage says a shooter is below its target, vision says the shooter
// cannot see the ground the target is standing on.
const vis = R(`
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, name: 'B' }], seed: 5, layout: 'medium' });
  for (const p of G.players) p.ai = null;
  for (const u of [...G.units]) G.kill(u, null, true);
  G.units = G.units.filter(u => u.alive); G.cheats = {};
  const m = G.map, T = TILE;
  // a ramp, the low tile below it and the high tile above it, on the main plateau's one ramp
  let ramp = -1;
  for (let i = 0; i < m.w * m.h && ramp < 0; i++) if (m.height[i] === 1 && m.walk[i] === 1) ramp = i;
  const rx = ramp % m.w, ry = (ramp / m.w) | 0;
  let low = null, high = null;
  for (let r = 1; r < 14; r++) for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    const x = rx + dx * r, y = ry + dy * r; if (!m.inb(x, y)) continue; const i = m.idx(x, y);
    if (m.walk[i] !== 1) continue;
    if (!low && m.height[i] === 0) low = [x, y];
    if (!high && m.height[i] === 2) high = [x, y];
  }
  const scout = G.spawnUnit('marine', 0, (low[0] + 0.5) * T, (low[1] + 0.5) * T);
  G.rebuildGrid(); G.updateVision();
  const seesHigh = G.players[0].vis[m.idx(high[0], high[1])] === 2, seesOwn = G.players[0].vis[m.idx(low[0], low[1])] === 2;
  const uphill = m.heightAdvantage(scout.x, scout.y, (high[0] + 0.5) * T, (high[1] + 0.5) * T);
  // ...and now the same marine standing on the plateau, looking down
  scout.x = scout.px = (high[0] + 0.5) * T; scout.y = scout.py = (high[1] + 0.5) * T;
  G.rebuildGrid(); G.updateVision();
  const seesLow = G.players[0].vis[m.idx(low[0], low[1])] === 2;
  const downhill = m.heightAdvantage(scout.x, scout.y, (low[0] + 0.5) * T, (low[1] + 0.5) * T);
  return { seesHigh, seesOwn, seesLow, uphill, downhill, dist: Math.hypot(high[0] - low[0], high[1] - low[1]), sight: scout.sight };
`);
ok('a unit on low ground sees its own ground and not the plateau ' + vis.dist.toFixed(0) + ' tiles away (sight ' + vis.sight + ')',
  vis.seesOwn && !vis.seesHigh, JSON.stringify(vis));
ok('and heightAdvantage agrees it was shooting uphill', vis.uphill === -1, String(vis.uphill));
ok('the same unit standing on the plateau sees the low ground, and is shooting downhill', vis.seesLow && vis.downhill === 1, JSON.stringify(vis));

// A sim file may not reach for the clock or the system RNG; the seal and the queries are sim code.
const src = fs.readFileSync(path.join(root, 'js', 'map.js'), 'utf8');
ok('js/map.js still calls no Math.random, Date or performance', !/Math\.random\s*\(|new Date\b|Date\.now\s*\(|performance\.\w+\s*\(/.test(src));
ok('no simulation errors were logged', errors.length === 0, errors.slice(0, 3).join(' | '));

summary();
