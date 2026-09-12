// The skirmish setup screen (M11 wave two, item 22).
//   node test/skirmish.js
//
// A setup screen is a form, and a form is DOM, and DOM in node is either a browser or a lie. So this
// file does not test the form. It tests the two halves the form is built out of, because both of them
// can be wrong on their own and both of them are wrong SILENTLY:
//
//   1. THE PURE HALF. UI.skirmishOptions(settings) -> the object G.init is handed. Everything that can
//      actually cost a player a game lives here: a setting that never reaches the options object does
//      nothing and says nothing, a default that is not today's default retro-changes every balance
//      figure in HANDOFF.md, and a seed that does not round-trip means "that was a good map" is a
//      thing you can say and not a thing you can do. All of it is a plain function of a plain object,
//      so all of it is checked here with no document at all.
//
//   2. THE WIRING. index.html is parsed AS TEXT and every control id js/ui.js reaches for is required
//      to exist in it. That is the one bug splitting a menu into panels reliably introduces -- a
//      renamed input, a control that moved to the other panel, a typo in a getElementById -- and it
//      produces a screen that looks right, throws nothing, and silently uses a default. It cannot be
//      caught by reading either file on its own.
//
// The determinism claim gets its own section, because the whole design rests on it: the composed
// layout id "sk:hz=sandstorm,dn=1:arch:islands:97:large" has to be enough for a second process to
// build the same ground, or a replay of a skirmish is a different game. It is checked by building the
// map twice in two different orders and comparing the terrain byte for byte.

'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '   ' + x : '')); } };

// ---- a context that loads everything index.html loads, and boots nothing -------------------------
// The menu wiring lives in a DOMContentLoaded handler and `addEventListener` here is a no-op, so
// js/ui.js defines UI and then stops. That is exactly the half under test: if any of the functions
// below needed a document, they would throw right here.
function fakeCanvas() { const cv = { width: 1, height: 1, style: {}, getContext: () => null, toDataURL: () => '', addEventListener() { }, appendChild() { }, remove() { }, click() { }, value: '' }; return cv; }
function mkCtx() {
  const errors = [];
  const c = {
    console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, clearTimeout,
    setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
    localStorage: { getItem() { return null; }, setItem() { } },
    location: { protocol: 'http:', host: 'localhost' },
    document: { getElementById: () => fakeCanvas(), createElement: () => fakeCanvas(), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] },
  };
  c.window = c; c.globalThis = c; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain',
    'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  c._errors = errors;
  return c;
}
const ctx = mkCtx();
const run = src => vm.runInContext('(() => {' + src + '})()', ctx);
const J = v => JSON.stringify(v);
// Everything below hands settings across the vm boundary as JSON, so nothing shares a reference with
// the code under test and no assertion can be satisfied by an object the test itself mutated.
const opts = s => run('return UI.skirmishOptions(' + J(s === undefined ? null : s) + ');');
const layoutId = s => run('return UI.skirmishLayoutId(' + J(s) + ');');
const mapInfo = s => run('return UI.setupMapInfo(' + J(s) + ');');
const summary = s => run('return UI.skirmishSummary(' + J(s) + ');');
const compose = id => run('return UI.skirmishLayout(' + J(id) + ');');
const DEF = run('return UI.setupDefaults();');

console.log('--- 1. the API the screen is built on ------------------------------------------');
{
  const need = ['setupDefaults', 'skirmishOptions', 'skirmishLayoutId', 'skirmishLayout', 'skirmishSummary',
    'skirmishBaseId', 'skirmishSeed', 'registerSkirmishLayout', 'applyStartingBank', 'setupMapInfo',
    'setupMaxOpponents', 'setupStyles', 'setupPresets', 'setupBank'];
  const missing = run('return ' + J(need) + '.filter(k => typeof UI[k] !== "function");');
  ok(missing.length === 0, 'UI exposes the whole setup API', missing.join(', '));
  ok(ctx._errors.length === 0, 'loading js/ui.js logs no errors', ctx._errors.join(' | '));
}

console.log('\n--- 2. the default is TODAY\'S game, byte for byte ------------------------------');
{
  // Hard-coded on purpose: this is a transcription of what the old menu's start handler built, not a
  // re-derivation of it. If the screen ever starts writing style:'standard' or minerals:50 into a
  // default game, every replay saved from now on differs from every replay saved before it for no
  // reason at all, and this line is the only thing that would say so.
  const TODAY = {
    players: [
      { race: 'T', human: true, name: 'Player', team: 1 },
      { race: 'R', human: false, difficulty: 'normal', name: 'Computer 1', team: 2 },
    ], seed: 1, layout: 'temple',
  };
  ok(J(opts(DEF)) === J(TODAY), 'the default settings produce exactly the old menu\'s options object', J(opts(DEF)));
  ok(J(opts({})) === J(TODAY), 'an empty settings object falls back to the same thing', J(opts({})));
  ok(J(opts(undefined)) === J(TODAY), 'no settings object at all falls back to the same thing', J(opts()));
  ok(layoutId(DEF) === 'temple', 'nothing overridden means the layout id is the bare map name', layoutId(DEF));
  ok(!('style' in opts(DEF).players[1]), "a 'standard' opponent carries no style key");
  ok(!('minerals' in opts(DEF).players[0]) && !('gas' in opts(DEF).players[0]), 'a standard bank carries no resource keys');
}

console.log('\n--- 3. every setting reaches the options object ---------------------------------');
{
  const S = k => Object.assign({}, DEF, k);
  ok(opts(S({ race: 'P' })).players[0].race === 'P', 'your race reaches players[0]');
  ok(opts(S({ team: 3 })).players[0].team === 3, 'your team reaches players[0]');
  ok(opts(S({ seed: 4242 })).seed === 4242, 'the seed reaches the options object');
  ok(opts(S({ map: 'bloodbath' })).layout === 'bloodbath', 'the map reaches the options object');
  const three = opts(S({ opponents: [{ race: 'Z', difficulty: 'hard', style: 'rusher', team: 2 }, { race: 'P', difficulty: 'easy', style: 'turtle', team: 3 }, { race: 'T', difficulty: 'normal', style: 'harasser', team: 4 }] }));
  ok(three.players.length === 4, 'three opponents make four players', three.players.length);
  ok(three.players[1].race === 'Z' && three.players[1].difficulty === 'hard' && three.players[1].style === 'rusher' && three.players[1].team === 2, 'opponent 1: race, difficulty, style and team all arrive', J(three.players[1]));
  ok(three.players[2].style === 'turtle' && three.players[2].difficulty === 'easy', 'difficulty and style are PER OPPONENT, not global', J(three.players[2]));
  ok(three.players[3].style === 'harasser' && three.players[3].team === 4, 'opponent 3 keeps its own style and team', J(three.players[3]));
  ok(three.players.every((p, i) => p.name === (i ? 'Computer ' + i : 'Player')), 'the names are the ones the rest of the UI expects');
  const rich = opts(S({ bank: 'rich' }));
  ok(rich.players.every(p => p.minerals === 1500 && p.gas === 700), 'the starting bank reaches every player', J(rich.players[0]));
  // The catch-all. Anything the screen can be set to has to change the object it produces; a control
  // that is read, formatted and then dropped is the failure this whole file exists to prevent.
  const base = J(opts(DEF));
  const knobs = [['race', 'Z'], ['team', 2], ['seed', 7], ['map', 'huge'], ['bank', 'fast'],
    ['hazard', 'sandstorm'], ['hazard', 'none'], ['night', 'on'], ['night', 'off'], ['features', 'none'],
    ['derelicts', 'standard'], ['wildlife', 'sparse'], ['map', 'gen:basin'],
    ['opponents', [{ race: 'P', difficulty: 'hard', style: 'expander', team: 2 }]]];
  const inert = knobs.filter(([k, v]) => J(opts(S({ [k]: v }))) === base).map(([k, v]) => k + '=' + J(v));
  ok(inert.length === 0, 'no control is inert: every setting changes the options object', inert.join(', '));
  // ...and the size knob, which only means anything for a procedural map and has to mean something there
  const s1 = opts(S({ map: 'gen:cliffs', size: 'auto' })), s2 = opts(S({ map: 'gen:cliffs', size: 'huge' }));
  ok(s1.layout !== s2.layout, 'the size knob changes a procedural map', s1.layout + ' vs ' + s2.layout);
  ok(mapInfo(S({ map: 'gen:cliffs', size: 'huge' })).w === 256, 'and it changes the map that is actually built', mapInfo(S({ map: 'gen:cliffs', size: 'huge' })).w);
}

console.log('\n--- 4. the map settings survive as a layout, and reach the sim ------------------');
{
  const S = k => Object.assign({}, DEF, k);
  const id = layoutId(S({ hazard: 'sandstorm', night: 'on', derelicts: 'standard', wildlife: 'sparse' }));
  ok(id === 'sk:hz=sandstorm,dn=1,dr=standard,wl=sparse:temple', 'the overrides compose into one self-describing id', id);
  const L = compose(id);
  ok(!!L && !!L.hazard && L.hazard.kind === 'sandstorm', 'the id composes back into a layout with a real hazard OBJECT', L && J(L.hazard));
  ok(L.hazard.band === run('return HAZARDS.sandstorm(MAP_LAYOUTS.temple.w || 128).band;'), 'the storm is sized for that map, not for a default one', L.hazard.band);
  ok(L.dayNight === true, 'day/night arrives on the layout');
  ok(L.derelicts === 'standard' && L.wildlife === 'sparse', 'the per-map neutral toggles arrive by preset NAME, as DATA documents', L.derelicts + '/' + L.wildlife);
  // The base tables are shared objects that GameMap reads on every generation. Writing a hazard onto
  // one of them would put a sandstorm on Lost Ruins for the rest of the session.
  ok(run('return !MAP_LAYOUTS.temple.hazard && !MAP_LAYOUTS.temple.dayNight && !MAP_LAYOUTS.temple.derelicts;'), 'composing does not mutate the base layout');
  // and the whole point: the composed layout is what the SIM sees
  const seen = run(`
    UI.registerSkirmishLayout(${J(id)});
    const m = new GameMap(1, ${J(id)});
    G.init({ players: [{ race: 'T', human: true }, { race: 'Z', human: false }], seed: 1, layout: ${J(id)} });
    return { mapHazard: !!(m.hazard && m.hazard.kind === 'sandstorm'), registered: !!MAP_LAYOUTS[${J(id)}],
             gameHazard: !!(G.map.hazard), dayAt0: G.daylight, dayAtNight: (G.frame = 24 * 60 * 6, G.daylight) };`);
  ok(seen.registered, 'UI.start\'s registration puts the composed layout where GameMap looks for it');
  ok(seen.mapHazard, 'GameMap built from the composed id carries the hazard');
  ok(seen.gameHazard, 'and so does the map a real G.init produced');
  ok(seen.dayAt0 === 1 && seen.dayAtNight < 0.5, 'G.daylight sees the dayNight flag through the composed id', seen.dayAt0 + ' -> ' + seen.dayAtNight);
  // taking things away
  const off = compose(layoutId(S({ map: 'dustbowl', hazard: 'none' })));
  ok(off && !off.hazard, 'a map that ships with a storm can be played without one');
  const nightOff = compose(layoutId(S({ map: 'nightfall', night: 'off' })));
  ok(nightOff && !nightOff.dayNight, 'and a night map can be played in daylight');
  const bare = compose(layoutId(S({ map: 'gen:islands', features: 'none' })));
  const withF = mapInfo(S({ map: 'gen:islands' }));
  ok(withF.features > 0 && bare.features.length === 0, 'destructibles can be stripped from a map that has them', withF.features + ' -> ' + bare.features.length);
  // Stripping them must not strand anybody: js/map.js repairs connectivity with every feature forced
  // shut, and an absent bridge is no worse than a broken one -- but only if the archetype key survives
  // the composition, because that flag is what makes repairConnectivity run at all.
  ok(bare.archetype === 'islands', 'the archetype key survives composition, so repairConnectivity still runs', bare.archetype);
}

console.log('\n--- 5. the seed round-trips ------------------------------------------------------');
{
  const S = k => Object.assign({}, DEF, k);
  for (const n of [1, 2, 97, 65535, 999999]) ok(opts(S({ seed: n })).seed === n, 'seed ' + n + ' comes back out of the options object');
  const a = layoutId(S({ map: 'gen:islands', seed: 97 })), b = layoutId(S({ map: 'gen:islands', seed: 98 }));
  ok(a === 'arch:islands:97', 'a procedural map names its seed in its own id', a);
  ok(a !== b, 'a different seed is a different procedural map');
  ok(layoutId(S({ map: 'gen:islands', seed: 97 })) === a, 'the same settings always produce the same id');
  ok(layoutId(S({ map: 'gen:islands', seed: 97, size: 'huge' })) === 'arch:islands:97:huge', 'the size rides in the id too', layoutId(S({ map: 'gen:islands', seed: 97, size: 'huge' })));
  ok(opts(S({ seed: 0 })).seed === 1 && opts(S({ seed: NaN })).seed === 1 && opts(S({ seed: 'x' })).seed === 1, 'a seed of zero or nonsense becomes 1 rather than breaking the map');
  // The claim the whole design rests on: the id is enough. A SECOND PROCESS, given only the string,
  // builds the same ground -- so a replay of a skirmish is the same match, and so is a network join.
  const id = layoutId(S({ map: 'gen:chokepoint', seed: 4242, size: 'large', hazard: 'sandstorm', features: 'none' }));
  const hashIn = c => vm.runInContext(`(() => {
    UI.registerSkirmishLayout(${J(id)});
    const m = new GameMap(7, ${J(id)});
    let a = 5381; const eat = arr => { for (let i = 0; i < arr.length; i++) a = ((a * 33) ^ arr[i]) >>> 0; };
    eat(m.height); eat(m.walk); eat(m.cliff); eat(m.creep);
    return m.w + 'x' + m.h + ':' + a.toString(16) + ':' + m.resources.length + ':' + m.starts.length;
  })()`, c);
  const other = mkCtx();                       // a fresh vm: nothing shared, nothing cached, other order
  vm.runInContext('new GameMap(3, "bloodbath"); new GameMap(9, "arch:basin:11");', other);   // and a different call history
  ok(hashIn(ctx) === hashIn(other), 'a second process handed only the id builds byte-identical ground', hashIn(ctx) + ' vs ' + hashIn(other));
}

console.log('\n--- 6. nothing absent, unknown or stale can take the screen down -----------------');
{
  const S = k => Object.assign({}, DEF, k);
  ok(opts(S({ map: 'gen:nonsense' })).layout === 'temple', 'an archetype nothing recognises degrades to the default map', opts(S({ map: 'gen:nonsense' })).layout);
  ok(opts(S({ map: 'a_map_that_was_deleted' })).layout === 'a_map_that_was_deleted', 'an unknown map id is passed through -- GameMap.layoutDef is what falls back');
  ok(mapInfo(S({ map: 'a_map_that_was_deleted' })).ok === false, '...and the screen knows it did not resolve');
  ok(typeof summary(S({ map: 'a_map_that_was_deleted' })) === 'string', '...and still writes a summary rather than throwing');
  const weird = compose(layoutId(S({ derelicts: 'a_preset_nobody_shipped', hazard: 'volcano' })));
  ok(!!weird, 'an unknown preset and an unknown hazard still compose');
  ok(!weird.hazard, 'a hazard HAZARDS does not have is dropped rather than invented', J(weird.hazard));
  ok(weird.derelicts === 'a_preset_nobody_shipped', 'an unknown preset name is carried, because DATA resolves names to null on its own', weird.derelicts);
  ok(compose('temple') === null && compose('arch:basin:1') === null && compose('') === null && compose(null) === null, 'skirmishLayout only answers for composed ids');
  ok(compose('sk:') === null && compose('sk:hz=sandstorm') === null, 'a truncated composed id is null, not a half-built map');
  ok(run('return UI.registerSkirmishLayout("temple") === null && MAP_LAYOUTS.temple.name === "Lost Ruins";'), 'registering a plain id is a no-op');
  ok(run('return UI.registerSkirmishLayout("sk:dn=1:temple") === UI.registerSkirmishLayout("sk:dn=1:temple");'), 'registration is idempotent -- the second call returns the first result');
  // The neutral tables are the ones most likely to be missing: their sim half is being wired
  // elsewhere, and a worktree without them must still show a working screen.
  const noData = mkCtx();
  vm.runInContext('delete DATA.derelictPresets; delete DATA.wildlifePresets;', noData);
  const degraded = vm.runInContext(`(() => {
    const p = UI.setupPresets('derelict').length + UI.setupPresets('wildlife').length;
    const o = UI.skirmishOptions(Object.assign(UI.setupDefaults(), { derelicts: 'standard' }));
    return { presets: p, layout: o.layout, summary: typeof UI.skirmishSummary(UI.setupDefaults()) };
  })()`, noData);
  ok(degraded.presets === 0, 'with DATA.derelictPresets absent the screen offers no presets', degraded.presets);
  ok(degraded.summary === 'string' && typeof degraded.layout === 'string', '...and still produces a summary and a layout id');
  ok(run('return UI.setupPresets("nonsense").length >= 0;'), 'setupPresets never throws');
}

console.log('\n--- 7. what the screen offers matches what the sim has ---------------------------');
{
  const styles = run('return UI.setupStyles();');
  const real = run('return Object.keys(AI.prototype.styleDeltas());');
  ok(J(styles.map(s => s[0])) === J(real), 'the play styles offered are exactly the ones AI.styleDeltas() defines', J(styles.map(s => s[0])));
  ok(styles.every(s => s[1] && s[1] !== s[0]), 'every style has a human label', J(styles));
  ok(styles[0][0] === 'standard', "'standard' is first, so it is what an untouched screen selects");
  const diffs = run('return UI.SETUP_DIFFS.map(d => d[0]);');
  ok(J(diffs) === J(['easy', 'normal', 'hard']), 'the difficulties are the three the AI constructor branches on', J(diffs));
  const bank = run('return UI.setupBank("standard");');
  ok(bank[2] === 50 && bank[3] === 0, "the 'standard' bank is exactly what Player's constructor hands out", bank[2] + '/' + bank[3]);
  ok(run('return UI.setupBank("nonsense")[0] === "standard";'), 'an unknown bank falls back to standard');
  // Opponent count against start locations. G.init wraps with starts[i % starts.length], so an
  // uncapped count is two players in one main rather than an error message.
  ok(run('return UI.setupMaxOpponents({ map: "small" });') === 1, 'a two-player size mode allows one opponent');
  ok(run('return UI.setupMaxOpponents({ map: "temple" });') === 3, 'a four-player map allows three');
  ok(run('return UI.setupMaxOpponents({ map: "valley" });') === 1, 'and a two-player hand-written map allows one');
  // The size modes are supposed to be different RULES, and the screen has to be able to say so.
  const sizes = run('return MapModes.keys.map(k => { const m = UI.setupMapInfo({ map: k }); return [k, m.w, m.bases]; });');
  ok(sizes.length === 4, 'all four size modes are reachable as maps', J(sizes));
  ok(sizes.every((s, i) => i === 0 || s[1] > sizes[i - 1][1]), 'the sizes the screen reports really do get bigger', J(sizes));
  ok(sizes.every((s, i) => i === 0 || s[2] >= sizes[i - 1][2]), 'and the bases per player really do go up with them', J(sizes));
  const archs = run('return Archetypes.keys.map(k => UI.setupMapInfo({ map: "gen:" + k, seed: 5 }).archetype);');
  ok(J(archs) === J(run('return Archetypes.keys;')), 'every archetype is reachable and resolves to itself', J(archs));
}

console.log('\n--- 8. the summary says, in English, what will be played -------------------------');
{
  const S = k => Object.assign({}, DEF, k);
  const s = summary(S({ race: 'P', seed: 4242, map: 'gen:islands', size: 'large', hazard: 'sandstorm', night: 'on', bank: 'fast', opponents: [{ race: 'Z', difficulty: 'hard', style: 'harasser', team: 2 }] }));
  const has = t => s.indexOf(t) >= 0;
  ok(s.split('\n').length === 3, 'the summary is three lines', J(s));
  ok(has('Protoss') && has('Zerg') && has('hard') && has('Harasser'), 'it names both races, the difficulty and the play style', J(s));
  ok(has('192x192') && has('Island Chain'), 'it names the map and its real size', J(s));
  ok(has('sandstorm') && has('day/night'), 'it names the weather', J(s));
  ok(has('400 minerals') && has('100 gas'), 'it names the starting bank', J(s));
  ok(has('Seed 4242'), 'it names the seed, which is what makes a good map repeatable', J(s));
  ok(has('Supply cap ' + run('return SUPPLY_CAP;')), 'it names the supply cap, which no control can change', J(s));
  ok(summary(S({})).indexOf('default') < 0, 'it never answers a question with the word "default"', summary(S({})));
  const named = summary(S({ map: 'gen:chokepoint', seed: 12, derelicts: 'standard', wildlife: 'infested' }));
  ok(named.indexOf('derelicts: standard') > 0 && named.indexOf('wildlife: infested') > 0, 'it says when the map has been given derelicts or wildlife', named);
}

console.log('\n--- 9. the starting bank actually lands in the game ------------------------------');
{
  const got = run(`
    const o = UI.skirmishOptions(Object.assign(UI.setupDefaults(), { bank: 'rich' }));
    G.init(o); UI.applyStartingBank(o);
    const rich = [G.players[0].minerals, G.players[0].gas, G.players[1].minerals, G.players[1].gas];
    const p = UI.skirmishOptions(UI.setupDefaults());
    G.init(p); UI.applyStartingBank(p);
    return { rich, plain: [G.players[0].minerals, G.players[0].gas] };`);
  ok(J(got.rich) === J([1500, 700, 1500, 700]), 'a rich bank is on the board before the first tick', J(got.rich));
  ok(J(got.plain) === J([50, 0]), 'and a standard bank leaves Player\'s own 50/0 exactly alone', J(got.plain));
  ok(run(`G.init({ players: [{ race: 'T', human: true }, { race: 'Z', human: false }], seed: 1, layout: 'temple' });
          UI.applyStartingBank({ players: [{}, null] }); UI.applyStartingBank(null); UI.applyStartingBank({});
          return G.players[0].minerals === 50;`), 'applying a bank that is not there changes nothing and throws nothing');
}

console.log('\n--- 10. the wiring and the markup agree -----------------------------------------');
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(root, 'js', 'ui.js'), 'utf8');
  // Comment lines are dropped first. This file is full of prose that names the very identifiers being
  // searched for -- the paragraph explaining why the panel swap no longer uses previousElementSibling
  // contains the word previousElementSibling -- and a check that a comment can satisfy is not a check.
  const code = uiSrc.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  // Every id js/ui.js reaches for, scraped rather than listed, so the check cannot rot: a new control
  // added to the wiring without an element in index.html fails here on the day it is added. All four
  // shapes count, because the wiring reaches a control through a helper as often as directly.
  const ids = new Set();
  for (const re of [/\$\('([A-Za-z][\w-]*)'\)/g, /getElementById\('([A-Za-z][\w-]*)'\)/g,
    /\bval\('([A-Za-z][\w-]*)'/g, /\bfill\('([A-Za-z][\w-]*)'/g]) {
    let m; while ((m = re.exec(code))) ids.add(m[1]);
  }
  ok(ids.size > 20, 'the scrape found the wiring\'s control ids', ids.size + ' ids');
  const missing = [...ids].filter(id => !new RegExp('id="' + id + '"').test(html));
  ok(missing.length === 0, 'every control js/ui.js reaches for exists in index.html', missing.join(', '));
  // The other direction, for the controls this screen is FOR. An id that exists but that nothing reads
  // is a control the player can move that does nothing, which is the same bug wearing the other coat.
  // The eighth session replaced the form with the skirmish lobby (UI.Skirmish), so what this screen owns in
  // index.html is its door and the container the lobby is drawn into; the lobby's own controls are the
  // multiplayer lobby's markup, and test/menus.js drives them.
  const owned = ['setupBtn', 'skLobby', 'skirmishPanel', 'singlePanel', 'mainPanel', 'settingsPanel'];
  const notInHtml = owned.filter(id => !new RegExp('id="' + id + '"').test(html));
  ok(notInHtml.length === 0, 'every skirmish control exists in index.html', notInHtml.join(', '));
  const notRead = owned.filter(id => !ids.has(id) && id !== 'mainPanel' && id !== 'settingsPanel' && id !== 'singlePanel');
  ok(notRead.length === 0, 'and every one of them is read by the wiring', notRead.join(', '));
  // The form's controls are gone for good: a second place a skirmish is configured is the thing the user asked to remove.
  const stale = ['nopp', 'opps', 'mapSize', 'seedRoll', 'optStart', 'setupSummary', 'setupStart', 'setupBack', 'menuSummary'].filter(id => new RegExp('id="' + id + '"').test(html));
  ok(stale.length === 0, 'the old skirmish form is gone from index.html', stale.join(', '));
  // The lobby is the multiplayer lobby's own markup, drawn from the room UI.Skirmish holds and bound to its answers.
  ok(/Net\.roomHtml\(this\.L, \{ local: true/.test(code) && /Net\.bindRoom\(el, this\.L, \{ local: true/.test(code),
    'the skirmish lobby is drawn and bound by the multiplayer lobby\'s own Net.roomHtml and Net.bindRoom');
  // Panels swap by id now. The old code found the main panel with previousElementSibling, which was
  // true with two panels and wrong with three; if that ever comes back, SETTINGS hides the wrong page.
  ok(!/previousElementSibling/.test(code), 'the panel swap does not depend on document order');
  // UI.showPanel shows the one .panel whose id matches and hides the rest, so a panel without an id is
  // a page nothing can ever navigate back to. Any number of panels is fine; anonymous ones are not.
  const panels = html.match(/<div class="panel[^>]*>/g) || [];
  ok(panels.length >= 3, 'index.html has at least the three panels: main, settings and skirmish', panels.length);
  ok(panels.every(p => /id="/.test(p)), 'every panel has an id for the swap to address it', panels.filter(p => !/id="/.test(p)).join(' '));
  // The stamp is not this screen's to move, and index.html and js/ui.js are excluded from it by design.
  const buildSrc = fs.readFileSync(path.join(root, 'js', 'build.js'), 'utf8');
  ok(!/['"]ui['"]/.test(buildSrc), 'js/build.js still does not hash js/ui.js, so this screen cannot move the build stamp');
}

console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
