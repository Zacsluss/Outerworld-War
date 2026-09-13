// CHOOSING A START POSITION (ninth session, queue item A; the user: "build this now"). RESEARCH-LOBBY.md section 7 is the
// research: OpenRA's lobby (a click on a spawn on the map preview, a dropdown on the row, the host placing the bots, no two
// players on one spawn, a map change putting everyone back on random), StarCraft II's and Age of Empires II's lobbies (no
// choice of a spot at all) and Beyond All Reason's (a spot clicked inside the team's box before the game).
//   node test/starts.js [port=8820]      (uses port .. port+1)
//
// ENGINE (the simulation in a VM):
//   1. a game where nobody chose is the game it always was: seat i on start i % starts, on every kind of map
//   2. a chosen start is where that player's hall stands; an Auto seat keeps its own start when it is free and takes the
//      first free one when it is not; a second claim, a start out of range or not a whole number is Auto
//   3. the choice is part of the game: a replay of it and a rejoin into it (Replay.data, Net.gameOptions) start the same game
// CLIENT:
//   4. the options: Net.gameOptions and UI.skirmishOptions carry `start` only when one was chosen
//   5. the map preview draws who stands where (the same GameMap.assignStarts), rings a chosen start, numbers every start,
//      offers the click only to a seated player, escapes names; a procedural map offers its starts as numbered corners
//   6. THE SKIRMISH LOBBY, clicked: a start on the map, the Start list, the host's clicks placing the computers, a map change,
//      and START making exactly that game; remembered where it still holds
// RELAY (real sockets against test/serve.js):
//   7. a player sets their own start and the host a computer's; out of range, taken and not-yours are refused; Auto; the
//      ready rules; a map, a smaller map or a new size puts everyone back on Auto; the start rides the lobby state and the
//      start message, and a lobby where nobody chose sends exactly what it always sent
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { spawn } = require('child_process');
const { makeCtx, ok, counts, mkDom, root } = require('./_harness');
const PORT = parseInt(process.argv[2] || '8820', 10);
const J = v => JSON.stringify(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ===========================================================================================
// ENGINE
// ===========================================================================================
const sim = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot'], setInterval: true });
const S = src => vm.runInContext('(() => {' + src + '})()', sim);
// Who stands where after G.init: each real player's start index, and whether its hall stands on that start's tile.
const placed = opts => S('G.init(' + J(opts) + '); const st = G.map.starts; return G.players.filter(p => !p.neutral).map(p => { const h = G.units.find(u => u.owner === p.id && u.isBuilding); const k = st.indexOf(p.startBase); return { k, hall: !!h && h.tx === st[k].x && h.ty === st[k].y, x: p.startX, y: p.startY }; });');
const seat = (n, extra) => Array.from({ length: n }, (_, i) => Object.assign({ race: ['T', 'Z', 'P'][i % 3], human: i === 0, name: 'P' + i, team: i + 1 }, (extra && extra[i]) || {}));

console.log('--- 1. nobody chose: the game it always was ---');
{
  const bad = [];
  for (const layout of ['temple', 'bloodbath', 'valley', 'small', 'medium', 'arch_' + S('return Archetypes.keys[0];')]) {
    for (const n of [2, 3, 4, 5]) {
      const r = placed({ players: seat(n), seed: 3, layout }), count = S('return G.map.starts.length;');
      if (!r.every((p, i) => p.k === i % count && p.hall)) bad.push(layout + '/' + n + ': ' + J(r.map(p => p.k)));
    }
  }
  ok(!bad.length, 'on six maps with two to five players, seat i starts on start i % starts and its hall stands on it, as before start positions existed', bad.join('; '));
  const pure = S('const out = []; for (const n of [1, 2, 4, 8]) for (const c of [2, 4]) out.push(J2(GameMap.assignStarts(Array.from({ length: n }, () => ({})), c)) === J2(Array.from({ length: n }, (_, i) => i % c))); return out; function J2(v) { return JSON.stringify(v); }');
  ok(pure.every(Boolean), 'GameMap.assignStarts gives keyless players i % starts, for one to eight players on two and four starts', J(pure));
  const teams = placed({ players: [{ race: 'T', human: true, team: 1 }, { race: 'Z', team: 1 }, { race: 'P', team: 2 }, { race: 'T', team: 2 }], seed: 9, layout: 'temple' });
  ok(J(teams.map(p => p.k)) === J([0, 1, 2, 3]), 'teams do not move anybody: the seat decides, as it always did', J(teams));
}

console.log('--- 2. a chosen start ---');
{
  const a = placed({ players: seat(2, [{ start: 2 }]), seed: 3, layout: 'temple' });
  ok(a[0].k === 2 && a[0].hall && a[1].k === 1 && a[1].hall, 'player one chose start 3: their hall stands there, and the Auto seat keeps its own start', J(a));
  const b = placed({ players: seat(2, [{}, { start: 0 }]), seed: 3, layout: 'temple' });
  ok(b[1].k === 0 && b[0].k === 1, 'an Auto seat whose own start was chosen by someone else takes the first free start', J(b));
  const c = placed({ players: seat(4, [{ start: 3 }, { start: 2 }, { start: 1 }, { start: 0 }]), seed: 3, layout: 'bloodbath' });
  ok(J(c.map(p => p.k)) === J([3, 2, 1, 0]) && c.every(p => p.hall), 'four players choosing four starts get exactly those four', J(c));
  const d = placed({ players: seat(2, [{ start: 1 }, { start: 1 }]), seed: 3, layout: 'temple' });
  ok(d[0].k === 1 && d[1].k === 0, 'a second claim on one start is Auto (only a hand-made options object can make one: the lobby refuses it)', J(d));
  const e = placed({ players: seat(4, [{ start: 9 }, { start: -1 }, { start: '2' }, { start: 1.5 }]), seed: 3, layout: 'temple' });
  ok(J(e.map(p => p.k)) === J([0, 1, 2, 3]), 'a start out of range, negative, a string or a fraction is Auto', J(e));
  const v = placed({ players: seat(2, [{ start: 3 }]), seed: 3, layout: 'valley' });
  ok(v[0].k === 0 && v[1].k === 1, '...and so is start 4 on a two-start map', J(v));
  const f = placed({ players: seat(5, [{}, {}, {}, {}, { start: 3 }]), seed: 3, layout: 'temple' });
  ok(f[4].k === 3 && J(f.slice(0, 3).map(p => p.k)) === J([0, 1, 2]), 'more players than starts still wraps (test/net_many.js plays five on four starts) and a choice still holds', J(f));
  const ai = S('G.init({ players: [{ race: "T", human: true, name: "H", start: 1 }, { race: "Z", human: false, difficulty: "normal", name: "C", start: 3 }], seed: 4, layout: "temple" }); const p = G.players[1], b = G.map.starts[3]; for (let i = 0; i < 48; i++) G.tick(); return { at: p.startX === b.cx && p.startY === b.cy, units: G.units.filter(u => u.owner === 1 && u.alive).every(u => Math.hypot(u.x - b.cx, u.y - b.cy) < 12 * 32) };');
  ok(ai.at && ai.units, 'a computer placed on start 4 plays from start 4: its start is there, and everything it owns after two seconds is too', J(ai));
}

console.log('--- 3. part of the game: replay and rejoin ---');
{
  const OPTS = { players: [{ race: 'P', human: true, name: 'H', start: 3 }, { race: 'Z', human: false, difficulty: 'easy', name: 'C', start: 2 }], seed: 21, layout: 'temple' };
  const run = src => S(src + ' for (let i = 0; i < 240; i++) G.tick(); return { hash: G.stateHash(), k: G.players.filter(p => !p.neutral).map(p => G.map.starts.indexOf(p.startBase)) };');
  const live = run('G.init(' + J(OPTS) + '); G.recording = true; G.log = []; this.__data = JSON.parse(JSON.stringify(Replay.data()));');
  const again = run('const d = this.__data; G.init({ players: d.players, seed: d.seed, layout: d.layout });');
  ok(J(live.k) === J([3, 2]) && J(again.k) === J([3, 2]) && live.hash === again.hash, 'a replay saved from a game with chosen starts starts on those starts and re-simulates to the same state', J({ live, again }));
  const plain = run('G.init(' + J(Object.assign({}, OPTS, { players: OPTS.players.map(p => Object.assign({}, p, { start: undefined })) })) + ');');
  ok(plain.hash !== live.hash && J(plain.k) === J([0, 1]), '...and the choice is what made it that game (the control: the same game without the choices)', J(plain));
}

// ===========================================================================================
// CLIENT
// ===========================================================================================
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
const SRC = {}; for (const f of FILES) SRC[f] = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
function page(store) {
  store = Object.assign({ bw_net: J({ name: 'Zac', url: '', race: 'R' }), bw_intro: '1' }, store || {});
  const document = mkDom(html), loaded = [];
  const c = {
    console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { },
    requestAnimationFrame() { }, Image: function () { }, WebSocket: function () { this.readyState = 0; }, navigator: {},
    addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { protocol: 'http:', host: 'play.example:8765', origin: 'http://play.example:8765', pathname: '/', search: '' },
    history: { replaceState() { } }, document, __started: [],
  };
  c.window = c; c.globalThis = c; vm.createContext(c);
  for (const f of FILES) vm.runInContext(SRC[f], c, { filename: f + '.js' });
  vm.runInContext('UI.init = () => {}; UI.start = o => { __started.push(JSON.parse(JSON.stringify(o))); UI.running = true; };', c);
  for (const fn of loaded) fn();
  return { c, document, store, $: id => document.getElementById(id), R: src => vm.runInContext('(() => {' + src + '})()', c) };
}

console.log('--- 4. the options ---');
{
  const p = page();
  const msg = players => ({ seed: 5, layout: 'temple', you: 0, players });
  const none = p.R('return Net.gameOptions(' + J(msg([{ name: 'A', race: 'T', team: 1, human: true }, { name: 'B', race: 'Z', team: 2, human: false, difficulty: 'hard' }])) + ');');
  ok(none.players.every(x => !('start' in x)), 'a network game where nobody chose carries no start key at all', J(none.players));
  const some = p.R('return Net.gameOptions(' + J(msg([{ name: 'A', race: 'T', team: 1, human: true, start: 3 }, { name: 'B', race: 'Z', team: 2, human: false, start: 0 }])) + ');');
  ok(some.players[0].start === 3 && some.players[1].start === 0, 'the relay\'s start message\'s starts reach G.init\'s options, so every client and every rejoin builds the same game', J(some.players));
  const DEF = p.R('return UI.setupDefaults();');
  const plainOpts = p.R('return UI.skirmishOptions(' + J(DEF) + ');');
  ok(plainOpts.players.every(x => !('start' in x)), 'an untouched skirmish carries no start key (test/skirmish.js holds its options to the old menu\'s, byte for byte)', J(plainOpts));
  const chosen = p.R('return UI.skirmishOptions(' + J(Object.assign({}, DEF, { start: 2, opponents: [{ race: 'Z', difficulty: 'hard', team: 2, start: 0 }, { race: 'P', team: 3 }] })) + ');');
  ok(chosen.players[0].start === 2 && chosen.players[1].start === 0 && !('start' in chosen.players[2]), 'a skirmish carries each chosen start on its player, and nothing on an Auto one', J(chosen.players));
}

console.log('--- 5. the map preview ---');
{
  const p = page();
  const svg = (players, o) => p.R('return Net.mapPreview("temple", ' + J(players) + ', 236, ' + J(o || {}) + ');');
  const circles = s => (s.match(/<circle[^>]*r="7\.4"[^>]*>/g) || []).map(t => ({ fill: (t.match(/fill="([^"]+)"/) || [])[1], ring: /stroke="#f2e3b3"/.test(t) }));
  const col = i => p.R('return Net.slotColor(' + i + ');'), GREY = '#39424f';
  const two = circles(svg([{ name: 'A' }, { name: 'B' }]));
  ok(two.length === 4 && two[0].fill === col(0) && two[1].fill === col(1) && two[2].fill === GREY && two[3].fill === GREY && !two.some(x => x.ring),
    'nobody chose: start 1 in seat one\'s colour, start 2 in seat two\'s, the other two free, none ringed -- the picture the lobby always drew', J(two));
  const moved = circles(svg([{ name: 'A', start: 2 }, { name: 'B' }]));
  ok(moved[2].fill === col(0) && moved[2].ring && moved[1].fill === col(1) && !moved[1].ring && moved[0].fill === GREY,
    'seat one chose start 3: start 3 is theirs and ringed, seat two stays on its own start 2, and start 1 is free', J(moved));
  const taken = circles(svg([{ name: 'A' }, { name: 'B', start: 0 }]));
  ok(taken[0].fill === col(1) && taken[0].ring && taken[1].fill === col(0) && !taken[1].ring, 'an Auto seat pushed off its start is drawn on the start it will really take', J(taken));
  const labels = (svg([{ name: 'A' }]).match(/<text[^>]*>(\d)<\/text>/g) || []).map(t => t.replace(/<[^>]+>/g, ''));
  ok(J(labels) === J(['1', '2', '3', '4']), 'every start is numbered, free ones too, with the numbers the Start list uses', J(labels));
  const click = svg([{ name: 'A' }], { pick: true }), still = svg([{ name: 'A' }]);
  ok((click.match(/data-start="\d"/g) || []).length === 4 && !/data-start=/.test(still), 'a start is a click only when the viewer may choose', J({ pick: (click.match(/data-start/g) || []).length, not: (still.match(/data-start/g) || []).length }));
  const evil = svg([{ name: '<img src=x onerror=alert(1)>' }], { pick: true });
  ok(!/<img/.test(evil) && /&lt;img src=x/.test(evil), 'a player\'s name in a start\'s tooltip is escaped like every other string off the wire', (evil.match(/<title>[^<]*<\/title>/) || [''])[0]);
  const count = p.R('return Net.mapPreview("temple", 2, 180);');
  ok(circles(count.replace(/r="5\.6"/g, 'r="7.4"')).filter(x => x.fill !== GREY).length === 2 && !/data-start/.test(count), 'the game list\'s detail pane, which knows only a count, still draws the seats on their starts and offers no click', count.slice(0, 120));
  const gen = p.R('return Net.mapPreview("gen:" + Archetypes.keys[0], [{ name: "A", start: 1 }, { name: "B" }], 236, { pick: true });');
  const chips = (gen.match(/<a href="#" class="lbStartChip[^"]*"[^>]*>\d<\/a>/g) || []);
  ok(/grown from the seed at START/.test(gen) && chips.length === 4 && /data-start="1"/.test(chips[1]) && /chosen/.test(chips[1]) && /title="Start 1, top left: B \(Auto\)/.test(chips[0]) && /bottom right/.test(chips[1]),
    'a procedural map has no picture, but its starts are numbered corners to click: start 1 top left, start 2 bottom right, as its start order says', J(chips));
  const corners = p.R('const g = Net.genStarts("gen:" + Archetypes.keys[0]); const out = []; for (const seed of [1, 77, 90210]) { G.init({ players: [{ race: "T", human: true }, { race: "Z" }, { race: "P" }, { race: "T" }], seed, layout: UI.skirmishLayoutId({ map: "gen:" + Archetypes.keys[0], seed }) }); out.push(G.map.starts.map(b => (b.cy < G.map.h * 16 ? "top" : "bottom") + " " + (b.cx < G.map.w * 16 ? "left" : "right"))); } return { g: g.corners, out };');
  ok(corners.out.every(o => J(o) === J(corners.g)), '...and those corners are where the generated map really puts each start, on three seeds', J(corners));
  const custom = p.R('MAP_LAYOUTS["custom:t"] = { name: "T", custom: true, w: 96, h: 96, players: 2, bases: [{ x: 10, y: 10, main: true }, { x: 80, y: 80, main: true }, { x: 40, y: 50 }] }; const s = Net.mapStarts("custom:t"); return { s, svg: Net.mapPreview("custom:t", [{ name: "A" }], 236) };');
  ok(custom.s && J(custom.s.starts) === J([[12, 11.5], [82, 81.5]]) && custom.s.exps.length === 1 && /<svg class="lbPrev"/.test(custom.svg), 'a map made in the editor is drawn from where its bases were painted, its starts in the order they were made', J(custom.s));
}

console.log('--- 5b. the lobby\'s words ---');
{
  // Found walking PLAYTEST 94 in two browser tabs (tenth session, item 7): the host's map offered "click to give it back" on
  // the guest's chosen start, where a click sends nothing; and the note still said colours follow the seats.
  const p = page();
  const room = (id, players) => p.R('Net.id = ' + id + '; return Net.roomHtml({ room: "ROOM1", state: "lobby", cap: 4, layout: "temple", speed: 6, rules: {}, specs: [], players: ' + J(players) + ' });');
  const tips = h => { const out = []; h.replace(/data-start="(\d)"><title>([^<]*)<\/title>/g, (m, j, t) => { out[+j] = t; return m; }); return out; };
  const note = h => ((h.match(/<div class="lbSetNote">([^<]*)<\/div>/) || [])[1] || '');
  const seats = [{ id: 1, name: 'Hal', race: 'T', team: 1, host: true }, { id: 2, name: 'Gus', race: 'Z', team: 2, start: 2 }, { id: -3, name: 'Computer 0', race: 'P', team: 2, ai: true, difficulty: 'normal', style: 'standard', start: 3 }];
  const asGus = room(2, seats), asHal = room(1, seats);
  ok(J(tips(asGus)) === J(['Start 1: Hal (Auto) -- click to take it', 'Start 2: free -- click to take it', 'Start 3: Gus -- click to give it back', 'Start 4: Computer 0']),
    'the guest\'s map: a start nobody chose is theirs to take (an Auto seat\'s too), their own choice to give back, the computer\'s nothing', J(tips(asGus)));
  ok(J(tips(asHal)) === J(['Start 1: Hal (Auto) -- click to take it', 'Start 2: free -- click to take it', 'Start 3: Gus', 'Start 4: Computer 0 -- click to give it back']),
    'the host\'s map: the guest\'s chosen start offers nothing, a computer\'s goes back to Auto', J(tips(asHal)));
  const placed = room(1, [{ id: 1, name: 'Hal', race: 'T', team: 1, host: true, start: 0 }, { id: 2, name: 'Gus', race: 'Z', team: 2, start: 2 }, { id: -3, name: 'Computer 0', race: 'P', team: 2, ai: true, difficulty: 'normal', style: 'standard' }]);
  ok(J(tips(placed)) === J(['Start 1: Hal -- click to give it back', 'Start 2: Computer 0 (Auto) -- click to give it to Computer 0', 'Start 3: Gus', 'Start 4: free -- click to give it to Computer 0']),
    '...and once the host has chosen, a free start says it goes to the computer still on Auto', J(tips(placed)));
  ok(/^Share the code[^]*Click your colour square to choose a colour \(a computer's too\)\./.test(note(asHal)) && /Click your colour square to choose a colour\. Click a start/.test(note(asGus)) && !/Colours follow the seats/.test(note(asHal) + note(asGus)),
    'the note says a colour is chosen by clicking its square -- the host\'s a computer\'s too -- and no longer that colours follow the seats', J([note(asHal), note(asGus)]));
}

console.log('--- 6. the skirmish lobby, clicked ---');
{
  const p = page();
  p.$('singleBtn').click(); p.$('setupBtn').click();
  const lob = p.$('skLobby'), q = sel => lob.querySelector(sel), L = () => p.R('return UI.Skirmish.L;'), h = () => lob.innerHTML;
  const starts = () => L().players.map(x => x.start === undefined ? null : x.start);
  ok(/data-start="0"/.test(h()) && /data-slot="1" data-field="start"/.test(h()) && /data-slot="-1" data-field="start"/.test(h()) && J(starts()) === J([null, null]),
    'the skirmish lobby\'s map preview is clickable, every slot has a Start list, and everyone begins on Auto', J(starts()));
  q('[data-addai="2"]').click();
  q('[data-start="2"]').click();
  ok(J(starts()) === J([2, null, null]) && /Zac takes start 3\./.test(h()), 'the host\'s first click on a free start takes it for the host, and the log says so', J(starts()));
  q('[data-start="3"]').click();
  ok(J(starts()) === J([2, 3, null]) && /Computer 1 takes start 4\./.test(h()), '...the next click places the first computer still on Auto (OpenRA\'s lobby does the same)', J(starts()));
  q('[data-start="3"]').click();
  ok(J(starts()) === J([2, null, null]) && /Computer 1 is on Auto\./.test(h()), 'a click on a computer\'s start gives it back to Auto', J(starts()));
  q('[data-start="2"]').click();
  ok(J(starts()) === J([null, null, null]), '...and a click on your own start gives yours back', J(starts()));
  const sel = q('[data-slot="-2"][data-field="start"]'); sel.value = '1'; sel.onchange();
  ok(J(starts()) === J([null, null, 1]), 'the Start list sets a computer\'s start', J(starts()));
  const mine = q('[data-slot="1"][data-field="start"]'); mine.value = '1'; mine.onchange();
  ok(J(starts()) === J([null, null, 1]), 'a start another seat holds is refused', J(starts()));
  ok(/<option value="1" disabled>Start 2 \(Computer 2\)<\/option>/.test(h()), '...and the list shows it closed, named by who holds it', (h().match(/data-slot="1" data-field="start"[\s\S]{0,400}/) || [''])[0]);
  p.R('UI.Skirmish.apply({ t: "set", id: 1, start: 4 }); UI.Skirmish.apply({ t: "set", id: 1, start: "2" }); UI.Skirmish.apply({ t: "set", id: 1, start: 0.5 });');
  ok(J(starts()) === J([null, null, 1]), 'a start past the map\'s four, a string and a fraction are refused', J(starts()));
  const auto = q('[data-slot="-2"][data-field="start"]'); auto.value = ''; auto.onchange();
  ok(J(starts()) === J([null, null, null]), 'Auto in the list gives the start back', J(starts()));
  // Starts that are NOT the seats' own, so the game can only match the picture by reading the choices (a first version
  // chose starts 1 and 2 for seats one and two, and a negative control placing everyone by seat still passed it).
  q('[data-start="3"]').click(); q('[data-start="2"]').click();
  const expect = p.R('const o = UI.skirmishOptions(UI.Skirmish.setup()); o.players[0].name = "Zac"; return o;');
  q('#lbStart').click();
  const got = p.c.__started[0];
  ok(p.c.__started.length === 1 && J(got) === J(expect) && got.players[0].start === 3 && got.players[1].start === 2 && !('start' in got.players[2]),
    'START makes exactly the game the lobby shows: you on start 4, Computer 1 on start 3, Computer 2 on Auto', J({ got: got.players, expect: expect.players }));
  const placedBy = p.R('G.init(' + J(got) + '); return G.players.filter(x => !x.neutral).map(x => G.map.starts.indexOf(x.startBase));');
  const drawn = p.R('return Net.mapPreview("temple", UI.Skirmish.L.players, 236);');
  const fills = (drawn.match(/<circle[^>]*r="7\.4"[^>]*>/g) || []).map(t => (t.match(/fill="([^"]+)"/) || [])[1]);
  ok(J(placedBy) === J([3, 2, 0]) && fills[0] === p.R('return Net.slotColor(2);') && fills[3] === p.R('return Net.slotColor(0);'), '...and that game puts everyone where the preview drew them: the Auto computer, pushed off its own start 3, on start 1 in both', J({ placedBy, fills }));
  // remembered, where it still holds
  const p2 = page({ bw_skirmish: p.store.bw_skirmish });
  p2.$('singleBtn').click(); p2.$('setupBtn').click();
  ok(J(p2.R('return UI.Skirmish.L.players.map(x => x.start === undefined ? null : x.start);')) === J([3, 2, null]), 'the next time, the lobby comes back with those starts', p2.store.bw_skirmish);
  const p3 = page({ bw_skirmish: J({ layout: 'valley', players: [{ race: 'T', team: 1, start: 1 }, { ai: true, race: 'Z', team: 2, start: 1 }, { ai: true, race: 'P', team: 2, start: 3 }] }) });
  p3.$('singleBtn').click(); p3.$('setupBtn').click();
  ok(J(p3.R('return UI.Skirmish.L.players.map(x => x.start === undefined ? null : x.start);')) === J([1, null, null]), '...and a remembered start that no longer holds -- taken twice, or past a two-start map -- comes back as Auto', J(p3.R('return UI.Skirmish.L.players;')));
  // a map change puts everyone back on Auto
  const p4 = page(); p4.$('singleBtn').click(); p4.$('setupBtn').click();
  const lob4 = p4.$('skLobby');
  lob4.querySelector('[data-start="3"]').click();
  const m = lob4.querySelector('#lbLayout'); m.value = 'bloodbath'; m.onchange();
  ok(p4.R('return UI.Skirmish.L.players.every(x => x.start === undefined);') && /Start positions are back on Auto for the new map\./.test(lob4.innerHTML), 'a new map puts every seat back on Auto, and the log says why', lob4.innerHTML.slice(0, 80));
  const p5 = page({ bw_skirmish: J({ layout: 'gen:' + p.R('return Archetypes.keys[0];'), players: [{ race: 'T', team: 1 }, { ai: true, race: 'Z', team: 2 }] }) }); p5.$('singleBtn').click(); p5.$('setupBtn').click();
  const lob5 = p5.$('skLobby');
  lob5.querySelector('[data-start="1"]').click();
  const hadIt = p5.R('return UI.Skirmish.L.players[0].start;');
  const size = lob5.querySelector('[data-rule="size"]'); size.value = size.value === 'huge' ? 'small' : 'huge'; size.onchange();
  ok(hadIt === 1 && p5.R('return UI.Skirmish.L.players.every(x => x.start === undefined);'), 'on a procedural map a start chip is a click too, and a new size puts everyone back on Auto', J({ hadIt }));
}

// ===========================================================================================
// RELAY
// ===========================================================================================
const servers = [];
function serve(port, env) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port), '3'], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_COUNTDOWN: '0', BW_LOBBY_PING: '60000' }, env || {}) });
  s.stdout.on('data', () => { }); s.stderr.on('data', d => console.log('  [relay err] ' + String(d).trim()));
  servers.push(s); return s;
}
const killAll = () => { for (const s of servers) { try { s.kill(); } catch (e) { } } };
process.on('exit', killAll);
function client(port, tag) {
  const c = { tag, lobby: null, started: null, errors: [], sys: [] };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.t === 'lobby') c.lobby = m; if (m.t === 'start') c.started = m; if (m.t === 'error') c.errors.push(m); if (m.t === 'sys') c.sys.push(m); if (m.t === 'lping') c.send({ t: 'lpong', n: m.n }); };
  c.send = o => { try { c.ws.send(JSON.stringify(o)); } catch (e) { } };
  c.open = new Promise((r, j) => { c.ws.onopen = r; c.ws.onerror = () => j(new Error('socket error on port ' + port + ' -- is another relay holding it?')); setTimeout(() => j(new Error('no open within 10 s')), 10000).unref(); });
  c.open.catch(() => { });
  return c;
}
const who = (c, name) => c.lobby && c.lobby.players.find(p => p.name === name);

(async () => {
  if (typeof WebSocket === 'undefined') { console.log('FAIL needs Node 22+ (global WebSocket)'); process.exit(1); }
  console.log('--- 7. the relay ---');
  serve(PORT); await sleep(500);
  const A = client(PORT, 'Ada'), B = client(PORT, 'Ben'); await Promise.all([A.open, B.open]);
  A.send({ t: 'join', name: 'Ada', race: 'T', create: true, title: 'Starts' }); await sleep(250);
  const code = A.lobby ? A.lobby.room : 'NOROOM';
  B.send({ t: 'join', name: 'Ben', race: 'Z', room: code, existing: true }); await sleep(250);
  A.send({ t: 'set', cap: 4 }); A.send({ t: 'addai', race: 'P', team: 2 }); await sleep(250);
  const aiId = () => (A.lobby.players.find(p => p.ai) || {}).id;
  ok(A.lobby.players.every(p => !('start' in p)), 'a new room: nobody has a start, and the lobby state carries no start key', J(A.lobby.players));

  B.send({ t: 'set', start: 1 }); await sleep(200);
  ok(who(A, 'Ben').start === 1 && A.sys.some(m => m.ev === 'start' && m.name === 'Ben' && m.start === 1), 'a player takes a start, and the room is told', J({ ben: who(A, 'Ben'), sys: A.sys.slice(-1) }));
  A.send({ t: 'set', id: who(A, 'Ben').id, start: 2 }); await sleep(200);
  ok(who(A, 'Ben').start === 1, 'the host cannot move another human', J(who(A, 'Ben')));
  B.send({ t: 'set', id: aiId(), start: 3 }); await sleep(200);
  ok(!('start' in A.lobby.players.find(p => p.ai)), 'a guest cannot place a computer', J(A.lobby.players.find(p => p.ai)));
  A.send({ t: 'set', id: aiId(), start: 1 }); await sleep(200);
  ok(!('start' in A.lobby.players.find(p => p.ai)), 'nobody may take a start another slot holds', J(A.lobby.players));
  for (const bad of [4, -1, 1.5, '2', true]) A.send({ t: 'set', start: bad });
  await sleep(250);
  ok(!('start' in who(A, 'Ada')), 'a start past the map\'s cap, negative, a fraction, a string or a boolean is refused', J(who(A, 'Ada')));
  B.send({ t: 'set', ready: true }); await sleep(200);
  A.send({ t: 'set', id: aiId(), start: 3 }); await sleep(250);
  ok(A.lobby.players.find(p => p.ai).start === 3 && who(A, 'Ben').ready === false && B.sys.some(m => m.ev === 'unready' && m.why === 'ai'), 'the host places a computer, and since an opponent moved, every ready is withdrawn', J(A.lobby.players));
  B.send({ t: 'set', ready: true }); await sleep(200);
  B.send({ t: 'set', start: 0 }); await sleep(200);
  ok(who(A, 'Ben').start === 0 && who(A, 'Ben').ready === false, 'a player moving their own start withdraws only their own ready', J(who(A, 'Ben')));
  B.send({ t: 'set', start: null }); await sleep(200);
  ok(!('start' in who(A, 'Ben')) && A.sys.some(m => m.ev === 'start' && m.name === 'Ben' && !('start' in m)), 'null is Auto again, and the room is told', J(who(A, 'Ben')));

  B.send({ t: 'set', start: 2 }); A.send({ t: 'set', start: 0 }); await sleep(250);
  A.send({ t: 'set', cap: 2 }); await sleep(250);
  ok(A.lobby.players.every(p => !('start' in p)) && A.sys.some(m => m.ev === 'starts'), 'a smaller map that no longer has a chosen start puts everyone back on Auto, and says so', J(A.lobby.players));
  A.send({ t: 'set', cap: 4 }); B.send({ t: 'set', start: 3 }); await sleep(250);
  A.send({ t: 'set', layout: 'bloodbath', cap: 4 }); await sleep(250);
  ok(A.lobby.players.every(p => !('start' in p)), 'a new map puts everyone back on Auto', J(A.lobby.players));
  B.send({ t: 'set', start: 3 }); await sleep(200);
  A.send({ t: 'set', rules: { size: 'huge' } }); await sleep(250);
  ok(A.lobby.players.every(p => !('start' in p)), '...and so does a new size for a procedural map', J(A.lobby.players));
  A.send({ t: 'set', rules: { size: 'auto' }, layout: 'temple', cap: 4 }); await sleep(250);

  B.send({ t: 'set', start: 2 }); A.send({ t: 'set', id: aiId(), start: 0 }); await sleep(250);
  B.send({ t: 'set', ready: true }); await sleep(200);
  A.send({ t: 'start' }); await sleep(400);
  const sp = A.started && A.started.players;
  ok(sp && sp.find(p => p.name === 'Ben').start === 2 && sp.find(p => !p.human).start === 0 && !('start' in sp.find(p => p.name === 'Ada')) && B.started && J(B.started.players) === J(sp),
    'the start message carries every chosen start and nothing for an Auto seat, the same to every client', J(sp));
  const opts = sp ? vm.runInContext('(() => { const o = Net.gameOptions(' + J({ seed: A.started.seed, layout: A.started.layout, you: 1, players: sp }) + '); G.init(o); return G.players.filter(p => !p.neutral).map(p => G.map.starts.indexOf(p.startBase)); })()', page().c) : null;
  ok(J(opts) === J([1, 2, 0]), '...and the game every client builds from it puts Ben on start 3, the computer on start 1, and Ada (Auto) on the first free start', J(opts));

  const P2 = PORT + 1; serve(P2, { BW_READY: '0' }); await sleep(500);
  const C = client(P2, 'Cy'), D = client(P2, 'Di'); await Promise.all([C.open, D.open]);
  C.send({ t: 'join', name: 'Cy', race: 'T', room: 'NOSTARTS' }); await sleep(200);
  D.send({ t: 'join', name: 'Di', race: 'Z', room: 'NOSTARTS' }); await sleep(200);
  C.send({ t: 'start' }); await sleep(300);
  ok(C.started && C.started.players.every(p => J(Object.keys(p)) === J(['name', 'race', 'team', 'human', 'difficulty', 'style']) || J(Object.keys(p).filter(k => p[k] !== undefined)) === J(['name', 'race', 'team', 'human'])),
    'a lobby where nobody chose sends the start message it always sent: no start key on anybody', J(C.started && C.started.players));
  for (const x of [A, B, C, D]) try { x.ws.close(); } catch (e) { }
  killAll();
  const { pass, fail } = counts();
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); killAll(); process.exit(1); });
