// ONE COPY OF EACH RULE -- SCAN-M18 section B, the refactor batch, pinned.
//   node test/onecopy.js
//
// The scan's section B found the same two failure modes over and over: A NUMBER COPIED OUT OF THE PLACE
// THAT OWNS IT, and A RULE WRITTEN TWICE because a second code path grew up beside the first. Neither is
// a bug on the day it is written -- both copies agree, every suite is green -- and that is exactly why
// nothing catches them: the fault arrives later, when one copy is edited and the other is not, and it
// arrives as a mystery. Three of the eleven had ALREADY drifted when the scan found them.
//
// So this file does two things a behaviour test cannot. It reads the SOURCE and asserts the second copy
// is gone, and it drives what is left to prove the single copy still does the job. A source check is
// a weak test on its own -- which is why every one of them here is paired with a live one.
//
//  B1  six refused ability casts refunded a literal energy cost; all sixteen read the def now
//  B2  the "too far from your base to alert" radius was 16 * TILE twice, as two halves of one boundary
//  B3  blocked[] codes -2 and -3 were raw literals while -4, -5 and -6 had names
//  B4  FX.LOD_Z and ZOOM_ICON were two 0.5s bound by a comment
//  B5  the chunk bake and the overview built the same tile grids in byte-identical copies
//  B6  three implementations of "how high does this tile present", which disagreed about the blocked test
//  B7  generateCustom was missing generate's feature registration
//  B8  a selected building's rally was drawn twice, in two visual languages -- CHECKED IN test/seldraw.js
//      section 8, which is where the draw pass and its path recorder are
//  B9  the command-card slot rectangle was computed three times; drift there is a WRONG CLICK
//  B10 EQUIV restated in AI.scriptHave, two identical URL normalisers, the composition score copied,
//      three write-only AI fields, and a 14-key upgrade block rewriting what L3 had just set
//  B11 dead code: an unreachable `&& false`, an `if` with five conditions and an empty body
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const { makeCtx, ok, summary } = require('./_harness');
const root = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
const J = JSON.stringify;

const errors = [];
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build'], errors });
const R = s => vm.runInContext('(() => {' + s + '})();', ctx);

// ============================================================================
// B1. every refused cast refunds the ability's OWN cost
// ============================================================================
{
  const a = src('abilities');
  const literals = [...a.matchAll(/\.energy \+= *(\d+)/g)].map(m => m[0]);
  ok(literals.length === 0, 'B1: no refused cast refunds a literal energy cost (was six: 100, 150, 75, 100, 50, 150)', J(literals));
  const refunds = [...a.matchAll(/\.energy \+= *([A-Za-z_$][\w$.]*)/g)].map(m => m[1]);
  ok(refunds.length >= 16 && refunds.every(r => /\.energy$/.test(r)), 'B1: ...and all ' + refunds.length + ' of them read a def\'s own energy (scene check: a file with no refunds at all would pass the line above)', J([...new Set(refunds)]));

  // ...and the refund really is exact, driven the whole way: Abilities.issue sets the order, the order
  // tick DEBITS the energy and then calls cast(), and cast() is where the refusal and its refund live. A
  // test that called cast() alone would be measuring a refund of a charge that had never been made.
  const live = R(`
    G.init({ players: [{ race: 'T', human: true }, { race: 'P', human: false }], seed: 1, layout: 'temple' });
    G.players[1].ai = null; G.recording = false; G.applying = true;
    for (const p of G.players) { p.minerals = 5000; p.gas = 5000; p.tech = new Set(Object.keys(DATA.techs)); }
    const b = G.map.bases[0], X = (b.x + 10) * TILE, Y = (b.y + 10) * TILE;
    // Each case is [ability, caster, target, owner of the target, is it refused]. The accepted ones are the
    // positive control: without them 'the energy came back' would also be true of an ability that never
    // charged anything in the first place.
    const cases = [
      ['lockdown', 'ghost', 'marine', 1, true],            // refused: a Marine is not mechanical
      ['lockdown', 'ghost', 'vulture', 1, false],          // ACCEPTED: a Vulture is
      ['spawn_broodling', 'queen', 'wraith', 1, true],     // refused: it cannot take an air unit
      ['hallucination', 'high_templar', 'pylon', 0, true], // refused: it cannot copy a building
      ['feedback', 'dark_archon', 'marine', 1, true],      // refused: a Marine has no energy
      ['feedback', 'dark_archon', 'ghost', 1, false],      // ACCEPTED: a Ghost has energy to burn
      ['mind_control', 'dark_archon', 'marine', 0, true],  // refused: it is already ours
    ];
    const out = [];
    for (const [id, casterId, targetId, owner, refused] of cases) {
      const ab = DATA.abilities[id];
      const c = G.spawnUnit(casterId, 0, X, Y); c.energy = c.maxEnergy = 250;
      const t = G.spawnUnit(targetId, owner, X + TILE, Y);
      if (t.isBuilding) { t.done = true; t.hp = t.maxHp; }
      if (t.maxEnergy) t.energy = t.maxEnergy;
      const before = c.energy;
      const issued = Abilities.issue(c, id, t, t.x, t.y);
      let cast = false, frames = 0;
      for (; frames < 90 && !cast; frames++) { G.tick(); if (c.order.type !== 'ability') cast = true; }
      // A caster REGENERATES while its order resolves, so the arithmetic is against what it would have
      // gained having done nothing -- measured on the spot rather than assumed, because the rate is a def's.
      const idle = G.spawnUnit(casterId, 0, X, Y + 6 * TILE); idle.energy = 250;
      const e0 = idle.energy; for (let f = 0; f < frames; f++) G.tick();
      const regen = idle.energy - e0;
      out.push({ id, on: targetId, refused, cost: ab.energy, issued, cast, spent: +(before + regen - c.energy).toFixed(3) });
      G.kill(c, null, true); G.kill(t, null, true); G.kill(idle, null, true);
    }
    return out;`);
  ok(live.length === 7 && live.every(r => r.cost > 0 && r.issued === true && r.cast === true),
    'B1: seven casts were issued, charged and resolved -- five refusals and two that go through (scene check: without this the two lines below would pass on casts that never happened)', J(live));
  const refused = live.filter(r => r.refused), taken = live.filter(r => !r.refused);
  // A CASTER REGENERATES AT 1/32 OF A POINT A FRAME, so the arithmetic above is good to a fraction of a
  // point rather than to the bit -- half a point against costs of 50 to 150 is three orders of magnitude
  // of headroom, and a refund off by one would still be caught.
  ok(refused.length === 5 && refused.every(r => Math.abs(r.spent) < 0.5), 'B1: a REFUSED cast costs nothing: every one of them refunded what it charged (net spend under half a point against costs of 50 to 150)', J(refused));
  ok(taken.length === 2 && taken.every(r => Math.abs(r.spent - r.cost) < 0.5), 'B1: ...and a cast that goes through costs exactly its price (positive control: the charge is real, so the refund is a refund and not a missing debit)', J(taken));
}

// ============================================================================
// B2. the alert radius is one number
// ============================================================================
{
  const g = src('game');
  const sixteens = (g.match(/16 \* TILE/g) || []).length;
  ok(sixteens === 1 && /const HOME_R = 16 \* TILE;/.test(g), 'B2: the number sixteen is written once in js/game.js, on the line that names it', sixteens + ' mentions');
  ok(/const HOME_R = 16 \* TILE;/.test(g) && (g.match(/HOME_R/g) || []).length >= 3, 'B2: ...it is HOME_R, declared once and read by both halves of the boundary', String((g.match(/HOME_R/g) || []).length) + ' mentions');
  const B = vm.runInContext('BUILD', ctx);
  ok([].concat(B.TABLES, B.TUNING, B.HELPERS, B.SINGLETONS, B.CLASSES).includes('HOME_R'), 'B2: ...and the build stamp covers it, so retuning it refuses an older save');
  // the two halves really are complementary: a building just inside is alerted, one just outside is not
  const live = R(`
    const at = tiles => {
      G.init({ players: [{ race: 'T', human: true, name: 'H' }, { race: 'Z', human: false, name: 'C' }], seed: 3, layout: 'temple' });
      G.players[1].ai = null; G.recording = false; G.applying = true; G.human = 0;
      const p = G.players[0];
      const t = G.spawnUnit('supply_depot', 0, p.startX + tiles * TILE, p.startY); t.done = true; t.hp = t.maxHp;
      const foe = G.spawnUnit('zergling', 1, t.x + TILE, t.y);
      p.msgs.length = 0; p.lastAttackAlert = -9999;
      G.onHit(t, foe);
      return p.msgs.some(m => /under attack/.test(m.text));
    };
    return { near: at(15), far: at(17), boundary: HOME_R / TILE };`);
  ok(live.boundary === 16, 'B2: the boundary is sixteen tiles (scene check)', String(live.boundary));
  ok(live.near === true && live.far === false, 'B2: a building fifteen tiles from your start alerts at once and one seventeen tiles out is left to tickAlerts', J(live));
}

// ============================================================================
// B3. the blocked[] codes all have names
// ============================================================================
{
  const m = src('map'), g = src('game');
  // ANY line that touches blocked[] and still writes a bare -2 or -3, however it is spelled. The hardest
  // one to see was inside a ternary -- `r.type === 'geyser' ? -3 : -2` in GameMap.unblock -- which is
  // exactly the shape that produced defect A1.9: a footprint handed back from memory instead of read.
  const bad = [];
  for (const [file, text] of [['map', m], ['game', g]]) {
    text.split(/\r?\n/).forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, '');
      if (!/\bblocked\[/.test(code) && !/unblock\(/.test(code)) return;
      if (/(?:^|[^\w.])-[23]\b/.test(code)) bad.push(file + '.js:' + (i + 1) + ' ' + code.trim().slice(0, 90));
    });
  }
  ok(bad.length === 0, 'B3: no bare -2 or -3 is written into or read out of blocked[]', J(bad));
  ok(/const MIN_BLOCKED = -2;/.test(m) && /const GAS_BLOCKED = -3;/.test(m), 'B3: ...they are MIN_BLOCKED and GAS_BLOCKED, beside the three that already had names');
  const B = vm.runInContext('BUILD', ctx);
  ok(['MIN_BLOCKED', 'GAS_BLOCKED'].every(n => [].concat(B.TABLES, B.TUNING, B.HELPERS, B.SINGLETONS, B.CLASSES).includes(n)), 'B3: ...and the stamp covers both');
  const live = R(`
    const m = new GameMap(1, 'temple');
    const min = m.resources.find(r => r.type === 'mineral'), gas = m.resources.find(r => r.type === 'geyser');
    return { minCode: m.blocked[m.idx(min.x, min.y)], gasCode: m.blocked[m.idx(gas.x, gas.y)],
      minFound: m.resourceAt(min.x, min.y) === min, gasFound: m.resourceAt(gas.x, gas.y) === gas,
      MIN: MIN_BLOCKED, GAS: GAS_BLOCKED };`);
  ok(live.MIN === -2 && live.GAS === -3 && live.minCode === -2 && live.gasCode === -3, 'B3: the grid still holds -2 under a patch and -3 under a geyser, so no save or snapshot moved', J(live));
  ok(live.minFound && live.gasFound, 'B3: ...and resourceAt still finds both through the names', J(live));
}

// ============================================================================
// B4. the decal LOD zoom IS the icon zoom
// ============================================================================
{
  const f = src('fx');
  ok(/get LOD_Z\(\)/.test(f) && /ZOOM_ICON/.test(f), 'B4: FX.LOD_Z reads ZOOM_ICON rather than restating 0.5');
  const uictx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'terrain', 'fx', 'render'] });
  const v = vm.runInContext('({ lod: FX.LOD_Z, icon: ZOOM_ICON })', uictx);
  ok(v.lod === v.icon, 'B4: ...so the two are the same number by construction, not by a comment (' + v.lod + ' / ' + v.icon + ')', J(v));
  // ...and fx.js still loads on its own, which is why it is a getter with a fallback and not a plain read
  const alone = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'terrain', 'fx'] });
  ok(vm.runInContext('FX.LOD_Z', alone) === 0.5, 'B4: ...and fx.js loaded without render.js still answers 0.5 (the headless harnesses do exactly that)');
}

// ============================================================================
// B5. the tile grids are built in one place
// ============================================================================
{
  const t = src('terrain');
  const loops = (t.match(/rpz\[o\] = !cl && h === 1 \? 1 : 0;/g) || []).length;
  ok(loops === 1, 'B5: the tile-grid loop appears exactly once in js/terrain.js (was twice, byte for byte)', loops + ' copies');
  ok(/tileGrids\(gx0, gy0, GW, GH\)/.test(t), 'B5: ...as Terrain.tileGrids');
  const calls = (t.match(/this\.tileGrids\(/g) || []).length;
  ok(calls === 2, 'B5: ...and both the chunk bake and the overview call it (' + calls + ' call sites)', String(calls));
  const blurs = (t.match(/const w = \(a \? 1 : 2\) \* \(b \? 1 : 2\);/g) || []).length;
  ok(blurs === 1, 'B5: ...and so is the 3x3 blur they share', blurs + ' copies');
  // the pixels themselves are pinned byte for byte by test/terraintex.js's golden fingerprints, which is
  // what makes this refactor checkable at all -- named here so nobody deletes that suite thinking this covers it
  ok(fs.existsSync(path.join(root, 'test', 'terrain-golden.json')), 'B5: the golden fingerprints that pin the pixels are still there (test/terrain-golden.json)');
}

// ============================================================================
// B6. one answer to "how high does this tile present", with its one difference named
// ============================================================================
{
  const m = src('map');
  ok(/openHeightAt\(i, mined, baked\)/.test(m), 'B6: GameMap.openHeightAt is the one implementation');
  ok(/const cls = i => this\.openHeightAt\(i, false, openH\);/.test(m) && /const openH = i => this\.openHeightAt\(i, false\);/.test(m) && /_elevOpenH\(i\) \{ return this\.openHeightAt\(i, true\); \}/.test(m),
    'B6: ...and all three callers -- wallRamps, rampProblems and the seal pass -- go through it');
  const live = R(`
    const m = new GameMap(1, 'temple');
    const r = m.resources.find(x => x.type === 'mineral' && m.walk[m.idx(x.x, x.y)] === 1);
    const i = m.idx(r.x, r.y);
    // a plain walkable tile, for the control: both answers must agree there
    let plain = -1; for (let k = 0; k < m.walk.length; k++) if (m.walk[k] === 1 && m.blocked[k] === -1) { plain = k; break; }
    return { patchMined: m.openHeightAt(i, true), patchNotMined: m.openHeightAt(i, false), patchHeight: m.height[i],
      plainMined: m.openHeightAt(plain, true), plainNotMined: m.openHeightAt(plain, false),
      offMap: m.openHeightAt(-1, true), past: m.openHeightAt(m.walk.length, false) };`);
  ok(live.patchMined === live.patchHeight && live.patchNotMined === -1,
    'B6: THE ONE DIFFERENCE IS `mined`: the seal pass sees the ground under a mineral patch (it becomes walkable when the patch runs dry), the ramp passes do not (you cannot walk on it today)', J(live));
  ok(live.plainMined === live.plainNotMined && live.plainMined >= 0, 'B6: ...and on ordinary ground the two agree, so the flag changes nothing else (negative control)', J(live));
  ok(live.offMap === -1 && live.past === -1, 'B6: ...and a tile off the map is never ground, whichever way it is asked', J(live));
}

// ============================================================================
// B7. an editor map is finished the same way a generated one is
// ============================================================================
{
  const m = src('map');
  const reg = (m.match(/for \(const f of this\.features\) this\.resById\.set\(f\.id, f\);/g) || []).length;
  ok(reg === 2, 'B7: both generate and generateCustom register their features in resById (was one of the two)', reg + ' copies');
  const seal = (m.match(/this\.openSealedResources\(\);/g) || []).length;
  ok(seal === 2, 'B7: ...and both promise that every resource can be walked up to', seal + ' copies');
}

// ============================================================================
// B9. one rectangle for one command-card slot
// ============================================================================
{
  const u = src('ui'), h = src('hud');
  ok(!/cr\.gap !== undefined/.test(u) && !/cr\.pad !== undefined/.test(u), 'B9: the click paths no longer hedge with defaults the drawing path does not have', (u.match(/.{0,40}cr\.(gap|pad) !== undefined.{0,20}/) || [''])[0]);
  const laid = ((u + h).match(/\(cr\.bw \+ (cr\.)?gap\)/g) || []).length;
  ok(laid === 1, 'B9: ...and the slot rectangle is laid out in exactly one place (was three)', laid + ' copies');
  ok(/cardSlotRect\(cr, slot\)/.test(h) && /cardSlotHit\(cr, slot, x, y\)/.test(h), 'B9: ...it is UI.cardSlotRect, with a hit test beside it');
}

// ============================================================================
// B10. EQUIV is the one table, and the URL rule is the one rule
// ============================================================================
{
  const live = R(`
    // scriptHave must agree with EQUIV for every key EQUIV has, and for the creep colony it used to own alone
    const ai = Object.create(AI.prototype);
    const cnt = { hatchery: 1, lair: 2, hive: 3, spire: 1, greater_spire: 4, creep_colony: 1, sunken_colony: 5, spore_colony: 6,
      command_center: 1, orbital_command: 7, planetary_fortress: 8, nexus: 9 };
    const got = {}, want = {};
    for (const id of Object.keys(EQUIV)) {
      got[id] = ai.scriptHave(cnt, id);
      want[id] = (cnt[id] || 0) + EQUIV[id].reduce((n, k) => n + (cnt[k] || 0), 0);
    }
    return { got, want, equiv: EQUIV, unknown: ai.scriptHave(cnt, 'barracks') };`);
  ok(J(live.got) === J(live.want), 'B10: AI.scriptHave agrees with EQUIV for every key, because it reads it', J([live.got, live.want]));
  ok(live.equiv.creep_colony && live.equiv.creep_colony.length === 2, 'B10: ...and the creep colony row it used to own alone is in EQUIV now', J(live.equiv.creep_colony));
  ok(live.unknown === 0, 'B10: ...and a building with no morphs counts only itself (scene check)', String(live.unknown));

  const a = src('ai');
  for (const f of ['step', 'lastArmy', 'attackN']) {
    const hits = (a.match(new RegExp('this\\.' + f + '\\b', 'g')) || []).length;
    ok(hits === 0, 'B10: AI.' + f + ' is gone -- it was written and never read', hits + ' mentions left');
  }
  ok((a.match(/compScore\(/g) || []).length === 3 && (a.match(/unitCensus\(/g) || []).length === 3 && (a.match(/compKey\(/g) || []).length === 3,
    'B10: the composition key, the census and the score are one each, declared once and called from production() and warpIn()',
    J([(a.match(/compScore\(/g) || []).length, (a.match(/unitCensus\(/g) || []).length, (a.match(/compKey\(/g) || []).length]));

  // the two URL normalisers
  const d = src('desktop'), n = src('net');
  ok(/url\(s\) \{ return Net\.normUrl\(s\); \}/.test(d), 'B10: Desktop.url is Net.normUrl, not a second copy of it');
  ok((n.match(/ws\$1:\/\//g) || []).length === 1 && !/ws\$1:\/\//.test(d), 'B10: ...and the rule itself is written once, in js/net.js', J([(n.match(/ws\$1:\/\//g) || []).length, /ws\$1:\/\//.test(d)]));
  {
    const uictx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'net'] });
    vm.runInContext(fs.readFileSync(path.join(root, 'js', 'desktop.js'), 'utf8'), uictx, { filename: 'desktop.js' });
    const cases = ['192.168.1.5:51234', 'ws://192.168.1.5:51234/ws', 'https://x.trycloudflare.com', 'http://host:1/', '  host  ', ''];
    const both = vm.runInContext('(cs => cs.map(s => [Net.normUrl(s), Desktop.url(s)]))', uictx)(cases);
    ok(both.every(([a2, b2]) => a2 === b2), 'B10: ...and the page and the app turn every address into the same URL', J(both.filter(([a2, b2]) => a2 !== b2)));
    ok(both[0][0] === 'ws://192.168.1.5:51234/ws' && both[2][0] === 'wss://x.trycloudflare.com/ws' && both[5][0] === '',
      'B10: ...which is the rule people actually type against (scene check)', J(both.map(x => x[0])));
  }

  const dd = src('data');
  ok(!/\.forEach\(k => \{ upgrades\[k\]\.min = /.test(dd), 'B10: the 14-key upgrade block that rewrote L3\'s own defaults is gone', (dd.match(/.{0,40}forEach\(k => \{ upgrades.{0,40}/) || [''])[0]);
  const costs = R(`return Object.keys(DATA.upgrades).filter(k => (DATA.upgrades[k].levels || 1) === 3).map(k => [k, J2(DATA.upgrades[k].min), J2(DATA.upgrades[k].gas)]);
    function J2(v) { return JSON.stringify(v); }`);
  const dearer = costs.filter(c => c[1] !== '[100,175,250]');
  ok(costs.length >= 14 && dearer.length === 4, 'B10: ...and exactly four three-level upgrades still cost more than L3\'s default -- carapace, shields, air armour and flyer armour', J(dearer));
}

// ============================================================================
// B11. the dead code is gone
// ============================================================================
{
  const g = src('game');
  const code = g.split(/\r?\n/).map(l => l.replace(/\/\/.*$/, '')).join('\n');   // the comment that records the removal says `&& false` too
  ok(!/&& false\)/.test(code), 'B11: the unreachable `&& false` in updateVision is gone', (code.match(/.{0,80}&& false\).{0,20}/) || [''])[0]);
  ok(!/\{ \/\* AI workers ignore \*\/ \}/.test(g), 'B11: ...and so is the five-condition `if` with an empty body in onHit');
  // and vision still works, which is what the `&& false` arm pretended to be about
  const live = R(`
    G.init({ players: [{ race: 'T', human: true }, { race: 'Z', human: false }], seed: 3, layout: 'temple' });
    G.players[1].ai = null; G.human = 0;
    const m = G.map, p = G.players[0];
    G.updateVision();
    let seen = 0, high = 0;
    for (let i = 0; i < m.w * m.h; i++) if (p.vis[i] === 2) { seen++; if (m.height[i] === 2) high++; }
    return { seen, high };`);
  ok(live.seen > 100, 'B11: a player still sees the ground around their base (scene check: ' + live.seen + ' tiles)', J(live));
}

ok(errors.length === 0, 'no errors were logged', errors.slice(0, 3).join(' | '));
summary();
