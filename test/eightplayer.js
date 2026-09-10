// Eight players on a 192x192 map, which nothing has ever run.
//
// MAP_LAYOUTS ships 4p and 2p layouts and the relay caps a lobby at 8 slots, so eight players is
// reachable but untried: PLAYER_COLORS has exactly eight entries, G.init hands out start locations with
// `starts[i % starts.length]`, and the AI's expansion floor is `min(G.map.bases.length, 2 + minutes/3)`
// -- a number about the whole map, not about one player's fair share of it. This builds an eight-start
// map through the editor (the only supported way to make one), plays it out, and asks whether the AI
// behaves sanely when there are two bases each rather than four.
//
//   node test/eightplayer.js [frames=14400]
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const FRAMES = parseInt(process.argv[2] || '14400');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? '\n      ' + extra : '')); } };

function mkCtx(withEditor) {
  const errors = [];
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { }, textContent: '', querySelectorAll: () => [], options: [] });
  const store = {};
  const ctx = {
    console: { log() { }, warn() { }, error: (...a) => errors.push(a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ')) },
    Math, performance, addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
    requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, prompt: () => 'x',
  };
  ctx.window = ctx; ctx.__errors = errors; vm.createContext(ctx);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'].concat(withEditor ? ['editor'] : []))
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  return ctx;
}
const R = (ctx, src) => vm.runInContext(src, ctx);

// ---------------------------------------------------------------- build the map
// Eight mains on a ring, each with a natural, a high plateau in the middle with four ramps up it, and
// eight rock clusters as chokes on the ring road. Laid out by hand rather than by Editor.mirror, because
// mirroring only does 2- and 4-fold.
const MAINS = [[96, 26], [145, 47], [162, 96], [145, 145], [96, 162], [47, 145], [30, 96], [47, 47]];
const NATS = [[96, 48], [128, 64], [144, 96], [128, 128], [96, 144], [64, 128], [48, 96], [64, 64]];
const ROCKS = [[123, 31], [161, 69], [161, 123], [123, 161], [69, 161], [31, 123], [31, 69], [69, 31]];

const ed = mkCtx(true);
R(ed, `
  Editor.canvas = { width: 1280, height: 720 };
  Editor.W = 192; Editor.H = 192; Editor.blank(); Editor.name = 'Eight Corners'; Editor.tileset = 'desert'; Editor.mirror = 'off';
  const H = (x, y, v) => { if (Editor.inb(x, y)) Editor.height[Editor.idx(x, y)] = v; };
  const ell = (cx, cy, r, fn) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) fn(x, y); };
  Editor.mark();
  ell(96, 96, 34, (x, y) => H(x, y, 2));                                   // the centre plateau
  for (const [x0, y0, w, h] of [[93, 58, 7, 14], [93, 120, 7, 14], [58, 93, 14, 7], [120, 93, 14, 7]])   // four ramps up it
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) H(x, y, 1);
  Editor.mark();
  for (const [cx, cy] of ${JSON.stringify(ROCKS)}) ell(cx, cy, 4, (x, y) => { if (Editor.inb(x, y)) Editor.rocks[Editor.idx(x, y)] = 1; });
  Editor.mark();
  for (const [x, y] of ${JSON.stringify(MAINS)}) Editor.addBase(x, y, true);
  for (const [x, y] of ${JSON.stringify(NATS)}) Editor.addBase(x, y, false);
  this.problems = Editor.problems();
  this.layout = Editor.toLayout();
  this.mains = Editor.bases.filter(b => b.main).length;
`);
const layout = R(ed, 'this.layout'), problems = R(ed, 'this.problems');
console.log('built "' + layout.name + '": ' + layout.w + 'x' + layout.h + ', ' + layout.players + ' players, ' + layout.bases.length +
  ' bases, ' + (JSON.stringify(layout).length / 1024).toFixed(1) + ' KB of JSON');
ok('an eight-start map validates', problems.length === 0, problems.slice(0, 6).join('; '));
ok('it declares eight players', layout.players === 8 && R(ed, 'this.mains') === 8, 'players=' + layout.players);
ok('the engine accepts a map larger than the built-in 128', layout.w === 192 && layout.h === 192);
ok('no errors building it', ed.__errors.length === 0, ed.__errors[0] || '');

const LAYOUT_JSON = JSON.stringify(layout);
const PLAYERS = ['T', 'Z', 'P', 'T', 'Z', 'P', 'T', 'Z'].map((r, i) => `{ race: '${r}', human: false, difficulty: 'normal', name: 'P${i}', team: ${i + 1} }`).join(', ');

// ---------------------------------------------------------------- play it
const g = mkCtx(false);
R(g, `MAP_LAYOUTS['custom:Eight'] = ${LAYOUT_JSON};
  G.init({ players: [${PLAYERS}], seed: 4, layout: 'custom:Eight' });
  this.starts = G.players.map(p => p.startX + ',' + p.startY);
  this.colors = G.players.map(p => p.color);
  this.mapInfo = { w: G.map.w, h: G.map.h, bases: G.map.bases.length, starts: G.map.starts.length, res: G.map.resources.length };
  this.segs = []; this.maxStuck = 0; this.snap = [];
  // WHERE A HALL WAS PUT, judged when it was put there. Judging it at the end instead reads a
  // legitimate Zerg macro hatchery -- deliberately placed beside a base its owner held -- as an
  // orphan the moment the sibling halls that justified it are destroyed. The building never moved;
  // the verdict changed underneath it, so a player being wiped out presented as a placement defect.
  this.placements = [];
  (() => {
    const orig = G.placeBuilding.bind(G);
    G.placeBuilding = (def, tx, ty, owner, builder) => {
      const u = orig(def, tx, ty, owner, builder);
      if (u && def.depot) {
        const nearBase = G.map.bases.some(b => Math.hypot(u.x - b.cx, u.y - b.cy) < 6 * TILE);
        const nearOwn = G.units.some(o => o !== u && o.alive && o.owner === owner && o.isBuilding && o.def.depot && Math.hypot(o.x - u.x, o.y - u.y) < 20 * TILE);
        this.placements.push({ f: G.frame, owner, id: def.id, tx, ty, ok: nearBase || nearOwn });
      }
      return u;
    };
  })();
  this.step = n => { const t0 = Date.now(); for (let i = 0; i < n && !G.over; i++) { G.tick();
      if (G.frame % 240 === 0) for (const u of G.units) if (u.alive && u.stuck > this.maxStuck) this.maxStuck = u.stuck; }
    return { ms: Date.now() - t0, frame: G.frame, over: G.over,
      halls: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding && u.def.depot && u.done).length),
      sup: G.players.map(p => p.supUsed), supMax: G.players.map(p => p.supMax),
      workers: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && u.def.worker).length),
      army: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && !u.isBuilding && u.hasWeapon()).length),
      live: G.units.filter(u => u.alive).length, alive: G.players.filter(p => !p.defeated).length }; };
`);
ok('eight players get eight distinct start locations', new Set(R(g, 'this.starts')).size === 8, R(g, 'this.starts').join(' | '));
ok('eight players get eight distinct colours', new Set(R(g, 'this.colors')).size === 8 && R(g, 'this.colors').every(c => typeof c === 'string'), JSON.stringify(R(g, 'this.colors')));
const mi = R(g, 'this.mapInfo');
console.log('  map in play: ' + mi.w + 'x' + mi.h + ', ' + mi.starts + ' starts, ' + mi.bases + ' bases, ' + mi.res + ' resource patches');

console.log('--- eight-player free-for-all, ' + FRAMES + ' frames ----------------------------------');
const SEG = 2400; let last = null; const segs = [];
for (let done = 0; done < FRAMES; done += SEG) {
  const s = R(g, `this.step(${Math.min(SEG, FRAMES - done)})`);
  segs.push(s); last = s;
  console.log('  ' + String(Math.floor(s.frame / 24 / 60)) + ':' + String(Math.floor(s.frame / 24) % 60).padStart(2, '0') +
    '  ' + (s.ms / Math.min(SEG, FRAMES - done)).toFixed(2) + ' ms/frame  live ' + String(s.live).padStart(4) +
    '  halls ' + s.halls.join('') + '  sup ' + s.sup.join('/') + '  army ' + s.army.join('/'));
  if (s.over) break;
}
ok('an eight-player game runs to the end without dying', last.frame >= FRAMES || last.over, 'frame ' + last.frame + ' over=' + last.over);
ok('no JS errors in an eight-player game', g.__errors.length === 0, g.__errors.slice(0, 3).join(' || '));
const supFloor = FRAMES >= 9600 ? 20 : 10;   // ten minutes is the default; a shorter run is a smoke test
// PEAK, NOT THE LAST FRAME. This used to read the final segment and require all eight to have an
// economy there, which is really the assertion "nobody is ever eliminated in an eight-player
// free-for-all" -- and that stopped being true when the AI got better at fighting, not when it got
// worse at building. Three players here reached 40-50 supply and were then razed; sampling the end
// calls that "failed to build an economy", which is the opposite of what happened.
//
// The failure this check was written for is an AI that never builds at all, and that shows up in the
// PEAK: a player that never got going has a low peak no matter when you look. Same trap, same shape,
// as the Roach check in test/zerg12.js -- an assertion sampling one frame to answer a question about
// the whole game.
const peak = k => last[k].map((_, i) => Math.max(...segs.map(s => s[k][i])));
const peakW = peak('workers'), peakS = peak('sup');
const deadP = last.halls.map((h, i) => h > 0 ? -1 : i).filter(i => i >= 0);
ok('every one of the eight players built an economy at some point',
  peakW.every(w => w >= 8) && peakS.every(x => x >= supFloor),
  'peak workers ' + peakW.join('/') + ', peak supply ' + peakS.join('/') + ' (floor ' + supFloor + ')');
ok('...and the free-for-all did not wipe out most of the field', deadP.length <= 3,
  deadP.length + ' players with no hall left at frame ' + last.frame + ': ' + JSON.stringify(deadP) +
  '  (final supply ' + last.sup.join('/') + ')');
// READ FROM THE SIM, not written here as a literal. This said `<= 200` and had been failing
// silently against a cap that M11 raised to 500 a whole milestone earlier -- the assertion was
// testing a number the game had stopped using, which is worse than not testing it at all.
const CAP = R(g, 'SUPPLY_CAP');
ok('nobody exceeded the supply cap', last.supMax.every(s => s <= CAP), 'cap ' + CAP + ': ' + last.supMax.join('/'));
ok('nothing wedged itself for good', R(g, 'this.maxStuck') < 400, 'worst stuck counter seen was ' + R(g, 'this.maxStuck'));

// tick cost, which is the thing that could make eight players unplayable rather than merely unfair.
// HANDOFF's 8 ms target is for a four-player 200-supply battle at ~513 units; eight players reach far
// more than that, so the assertion here is the one that actually matters -- can it still outrun the clock.
const perFrame = segs.map(s => s.ms / SEG), worst = Math.max(...perFrame), mean = perFrame.reduce((a, b) => a + b, 0) / perFrame.length;
console.log('  tick cost: ' + mean.toFixed(2) + ' ms/frame mean, ' + worst.toFixed(2) + ' ms/frame worst segment, at up to ' + Math.max(...segs.map(s => s.live)) + ' units' +
  (worst > 8 ? '  (the worst segment is over the 8 ms target the four-player harness uses)' : ''));
ok('eight players still tick faster than real time (41.7 ms/frame at 24 tps), with margin', worst < 25,
  worst.toFixed(2) + ' ms/frame in the worst segment');
const bank = R(g, 'G.players.map(p => Math.round(p.minerals) + "/" + Math.round(p.gas)).join(" ")');
console.log('  minerals/gas banked at the end: ' + bank);
ok('no AI is left sitting on money it cannot spend', R(g, 'G.players.every(p => p.minerals < 2500)'),
  bank + '  -- with eight players sharing sixteen bases, AI.macro\'s wantHalls floor (min(G.map.bases.length, 2 + minutes/3), js/ai.js:141) ' +
  'asks for up to seven halls when only two bases per player exist, so the expansion branch never completes');

// ---------------------------------------------------------------- did the AI expand sanely?
const exp = R(g, `(() => {
  const depots = G.units.filter(u => u.alive && u.isBuilding && u.def.depot);
  const claimed = G.map.bases.map((b, i) => ({ i, owners: [...new Set(depots.filter(u => Math.hypot(u.x - b.cx, u.y - b.cy) < 6 * TILE).map(u => u.owner))] }));
  // A hall on open ground is only legitimate as a Zerg macro hatchery, which is deliberately placed
  // beside a base the player already holds. One that is near no base and near none of its owner's other
  // halls is an expansion that picked a spot with no minerals -- the failure this map size invites.
  const orphan = depots.filter(u => !G.map.bases.some(b => Math.hypot(u.x - b.cx, u.y - b.cy) < 6 * TILE)
    && !depots.some(o => o !== u && o.owner === u.owner && Math.hypot(o.x - u.x, o.y - u.y) < 20 * TILE));
  return { basesClaimed: claimed.filter(c => c.owners.length > 0).length, totalBases: G.map.bases.length,
    contested: claimed.filter(c => c.owners.length > 1).map(c => c.i + ':' + c.owners.join('+')),
    perPlayer: G.players.map(p => claimed.filter(c => c.owners.includes(p.id)).length),
    orphanHalls: orphan.map(u => u.owner + '@' + Math.round(u.x / TILE) + ',' + Math.round(u.y / TILE)),
    halls: G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding && u.def.depot).length),
    minedOut: G.map.bases.filter(b => b.minerals.every(m => m.amount <= 0)).length };
})()`);
console.log('  bases claimed ' + exp.basesClaimed + '/' + exp.totalBases + ', per player ' + exp.perPlayer.join('/') +
  ', halls ' + exp.halls.join('/') + (exp.contested.length ? ', contested ' + exp.contested.join(' ') : ''));
ok('the AI expanded with eight players on the map', exp.perPlayer.filter(n => n >= 2).length >= 6,
  'only ' + exp.perPlayer.filter(n => n >= 2).length + ' of 8 players took a second base: ' + exp.perPlayer.join('/'));
const badPlace = JSON.parse(R(g, 'JSON.stringify(this.placements.filter(p => !p.ok))'));
ok('every town hall was PUT on a base, or beside one its owner held at the time', badPlace.length === 0,
  badPlace.length + ' placed on open ground: ' + badPlace.map(p => 'p' + p.owner + ' ' + p.id + ' f' + p.f + '@' + p.tx + ',' + p.ty).join(' '));
if (exp.orphanHalls.length) console.log('  (' + exp.orphanHalls.length + ' hall(s) read as orphaned at the END -- ' +
  exp.orphanHalls.join(' ') + ' -- a survivor of a destroyed base, not a bad placement)');
ok('two players never end up sharing one base', exp.contested.length === 0, 'shared bases: ' + exp.contested.join(' '));

// ---------------------------------------------------------------- victory with eight teams
const vic = R(g, `(() => {
  for (let i = 1; i < G.players.length; i++) G.players[i].defeated = true;
  G.checkVictory();
  return { over: G.over, winner: G.winner, winTeam: G.winTeam };
})()`);
ok('victory resolves with eight teams on the board', vic.over === true && vic.winner === 0 && vic.winTeam === 1, JSON.stringify(vic));

// ---------------------------------------------------------------- a base with no geyser
// generateCustom accepts `geyser: null` and the editor's JSON import round-trips it, but AI.macro reads
// base.geyser.amount without checking. AI.tick catches the throw and logs it, so this shows up as an
// error rather than a crash -- and as an AI that silently stops doing its whole macro pass that think.
{
  const dry = JSON.parse(LAYOUT_JSON);
  for (const b of dry.bases) if (!b.main) b.geyser = null;
  dry.name = 'Eight Dry';
  const d = mkCtx(false);
  R(d, `MAP_LAYOUTS['custom:Dry'] = ${JSON.stringify(dry)};
    G.init({ players: [${PLAYERS}], seed: 4, layout: 'custom:Dry' });
    this.geyserless = G.map.bases.filter(b => !b.geyser).length;
    for (let i = 0; i < 7200 && !G.over; i++) G.tick();
    this.halls = G.players.map(p => G.units.filter(u => u.alive && u.owner === p.id && u.isBuilding && u.def.depot).length);`);
  ok('a custom map whose expansions have no geyser does not break the AI',
    d.__errors.length === 0, R(d, 'this.geyserless') + ' geyserless bases; ' + d.__errors.length + ' errors, first: ' + (d.__errors[0] || '') +
    '  -- js/ai.js reads base.geyser.amount in macro() and buildAt() without checking that the base has one');
}

console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
