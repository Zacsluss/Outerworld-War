// THE MENUS (eighth session, the user's list). "I feel like you did absolutely no research into what this menu system and
// lobby system should look like" -- and five things to change, which RESEARCH-LOBBY.md section 6 measures against
// OpenRA and StarCraft II:
//
//  1. THE MARKUP. The front is the title and three doors, with no tagline and no control hints. SINGLE PLAYER is doors
//     only -- Skirmish Setup, Campaign, Load Saved Game, Watch Replay, Continue Autosave, Map Editor -- and START GAME is
//     nowhere in the page: it exists only in the lobby. MULTIPLAYER has no Name box. SETTINGS has a Codex tab, every key
//     is in its Controls tab, and the Brood War / Grid dropdown is gone from the Game tab.
//  2. YOUR NAME, ASKED ONCE, before the main menu, and kept with the rest of who you are. An invite link waits for it.
//  3. MULTIPLAYER IS CONNECT: pressing it opens the socket and shows the list. The Try Again form appears only when the
//     server could not be reached, and says so.
//  4. THE SKIRMISH LOBBY IS THE MULTIPLAYER LOBBY'S OWN MARKUP, less what exists only because other humans can join.
//  5. IT BEHAVES LIKE ONE: slots, computers, teams, map, speed, seed and rules, START only with an opponent and a start for
//     everyone, and START makes exactly the game UI.skirmishOptions makes of the same settings. Remembered, except the seed.
//  6. SETTINGS: the Codex tab opens the codex; the Controls tab lists every key and switches the command card's layout.
//  7. EVERY COMMAND CARD KEY, IN THE CONTROLS TAB: a race's cards, a card as its grid, a key captured once and only as a
//     letter, Delete for none, a clash shown on the card and in the list, a shared command's reach, the resets, Grid.
//     (test/hotkeys.js holds the cards against buildCard and the keyboard against the choices.)
//
// Sections 2 to 6 run js/ui.js's real boot against a page built from index.html itself: every element with an id, the
// tabs and their bodies, and for the lobby's containers whatever markup was last drawn into them.
//   node test/menus.js
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = v => JSON.stringify(v);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const block = id => (html.match(new RegExp('<div class="panel[^"]*" id="' + id + '"[^>]*>([\\s\\S]*?)\\n  </div>')) || ['', ''])[1];
const buttons = text => { const out = []; const re = /<button id="(\w+)"[^>]*>([^<]*)<\/button>/g; let m; while ((m = re.exec(text))) out.push([m[1], m[2]]); return out; };

// ---- 1. THE MARKUP ----
{
  const main = block('mainPanel');
  ok(J(buttons(main).map(b => b[0])) === J(['singleBtn', 'multiBtn', 'settingsBtn']) && !/class="(sub|foot)"/.test(main),
    'the front is the title and three doors, with nothing written under them', J(buttons(main)));
  ok(!/Fan remake|Three races, full tech trees|Left click selects|right click commands/i.test(html), 'the tagline and the control hints are gone from the page');
  const single = block('singlePanel');
  ok(J(buttons(single)) === J([['setupBtn', 'Skirmish Setup'], ['campaignBtn', 'Campaign'], ['loadBtn', 'Load Saved Game'], ['replayBtn', 'Watch Replay'], ['autosaveBtn', 'Continue Autosave'], ['editorBtn', 'Map Editor'], ['singleBack', 'Back']]),
    'SINGLE PLAYER offers exactly Skirmish Setup, Campaign, Load Saved Game, Watch Replay, Continue Autosave and Map Editor', J(buttons(single)));
  ok(!/start game/i.test(html) && !/id="start"|id="setupStart"|id="menuSummary"/.test(html), 'START GAME is nowhere in the page: it is drawn only in the lobby', (html.match(/.{0,60}start game.{0,20}/i) || [''])[0]);
  const net = fs.readFileSync(path.join(root, 'js', 'net.js'), 'utf8');
  ok(/'>START GAME<\/button>'/.test(net), '...where the lobby draws it');
  const multi = block('multiPanel');
  ok(!/id="netName"/.test(html) && !/<label>Name<\/label>/.test(multi) && /<div id="netForm" style="display:none">/.test(multi),
    'MULTIPLAYER has no Name box, and its server form starts hidden', multi.slice(0, 200));
  const set = block('settingsPanel');
  const tabs = (set.match(/data-tab="(\w+)"/g) || []).map(s => s.slice(10, -1));
  const body = name => (set.match(new RegExp('<div class="tabBody" data-body="' + name + '"[^>]*>([\\s\\S]*?)\\n    </div>')) || ['', ''])[1];
  ok(J(tabs) === J(['game', 'display', 'audio', 'online', 'keys', 'codex']), 'Settings has a Codex tab of its own, after Controls', J(tabs));
  ok(/id="codexBtn"/.test(body('codex')) && !/codexBtn/.test(body('keys')), 'the Codex is opened from its own tab, not from Controls');
  ok(/id="bindList"/.test(body('keys')) && /id="keyStd"/.test(body('keys')) && /id="keyGrid"/.test(body('keys')) && !/id="controlsBtn"|id="controlsPanel"/.test(html),
    'the keys are the Controls tab itself, with the command card\'s layout in it -- no button to another screen');
  ok(!/id="hotkeys"/.test(html) && !/Brood War<\/option>/.test(html) && !/Hotkeys/.test(body('game')), 'the Brood War / Grid hotkeys dropdown is gone');
  const name = block('namePanel');
  ok(/id="nameInput"[^>]*maxlength="16"/.test(name) && /id="nameOk"/.test(name), 'a name prompt exists, sixteen letters like the relay keeps', name.slice(0, 160));
}

// ---- a page built from index.html ----
const { mkDom } = require('./_harness');   // the page's DOM, shared with test/starts.js

const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
const SRC = {}; for (const f of FILES) SRC[f] = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
function page(o) {
  o = o || {};
  const store = Object.assign({}, o.store || {});
  const document = mkDom(html);
  const sockets = [], loaded = [], winListeners = {};
  function WebSocket(url) { if (!/^wss?:\/\/[^\s]+$/.test(url)) throw new SyntaxError('not a socket URL: ' + url); this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
  WebSocket.prototype.send = function (s) { this.sent.push(JSON.parse(s)); };
  WebSocket.prototype.close = function () { this.readyState = 3; };
  const c = {
    console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { },
    requestAnimationFrame() { }, Image: function () { }, WebSocket, navigator: {},
    addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); else (winListeners[t] = winListeners[t] || []).push(fn); },
    removeEventListener(t, fn) { const l = winListeners[t] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { protocol: 'http:', host: 'play.example:8765', origin: 'http://play.example:8765', pathname: '/', search: o.search || '' },
    history: { replaceState(a, b, u) { c.__replaced = u; } },
    document, __started: [], __codex: [],
  };
  c.window = c; c.globalThis = c; vm.createContext(c);
  for (const f of FILES) vm.runInContext(SRC[f], c, { filename: f + '.js' });
  // The canvas, the render loop and the game itself are not the menus' business: UI.init wires a canvas, and UI.start is
  // recorded rather than run, so what a button would start is exactly what is asserted.
  vm.runInContext('UI.init = () => {}; UI.start = o => { __started.push(JSON.parse(JSON.stringify(o))); UI.running = true; }; UI.openCodexFromMenu = () => { __codex.push(1); };', c);
  for (const fn of loaded) fn();
  const $ = id => document.getElementById(id);
  const shown = () => document.querySelectorAll('.panel').filter(p => p.style.display !== 'none').map(p => p.id);
  const R = src => vm.runInContext('(() => {' + src + '})()', c);
  // A key pressed at the window: what the Controls tab's one-shot capture listens for.
  const key = (k, mods) => { const l = (winListeners.keydown || []).slice(); for (const fn of l) fn(Object.assign({ key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, preventDefault() { }, stopPropagation() { } }, mods || {})); return l.length; };
  return { c, document, $, store, sockets, shown, R, key, listening: () => (winListeners.keydown || []).length, open(i) { const s = sockets[i == null ? sockets.length - 1 : i]; s.readyState = 1; s.onopen(); return s; }, drop(i) { const s = sockets[i == null ? sockets.length - 1 : i]; if (s.onerror) s.onerror(); s.onclose(); } };
}
const named = { bw_net: J({ name: 'Zac', url: '', race: 'R' }), bw_intro: '1' };

// ---- 2. YOUR NAME, ASKED ONCE ----
{
  const p = page();
  ok(J(p.shown()) === J(['namePanel']), 'the first time the game opens, it asks for a name before anything else', J(p.shown()));
  p.$('nameInput').value = '   '; p.$('nameOk').click();
  ok(J(p.shown()) === J(['namePanel']) && /Type a name first/.test(p.$('nameNote').textContent) && !p.store.bw_intro, 'an empty name is refused, and says so', J({ shown: p.shown(), note: p.$('nameNote').textContent }));
  p.$('nameInput').value = ' Zac '; p.$('nameInput').fire('keydown', { key: 'Enter' });
  ok(J(p.shown()) === J(['mainPanel']) && JSON.parse(p.store.bw_net || '{}').name === 'Zac' && p.store.bw_intro === '1', 'Enter keeps the name, trimmed, and opens the main menu', J({ shown: p.shown(), store: p.store }));
  const again = page({ store: p.store });
  ok(J(again.shown()) === J(['mainPanel']), 'the next time the game opens it goes straight to the main menu', J(again.shown()));
  const old = page({ store: { bw_net: J({ name: 'Player', url: 'ws://lan:8765/ws', race: 'Z' }) } });
  ok(J(old.shown()) === J(['namePanel']) && old.$('nameInput').value === '', 'a player from before the prompt existed is asked once too, and "Player" is not offered as their name', J({ shown: old.shown(), v: old.$('nameInput').value }));
  old.$('nameInput').value = 'Ann'; old.$('nameOk').click();
  ok(J(JSON.parse(old.store.bw_net)) === J({ name: 'Ann', url: 'ws://lan:8765/ws', race: 'Z' }), '...and the server and race they had are kept', old.store.bw_net);
  const inv = page({ search: '?join=AB12CD' });
  ok(J(inv.shown()) === J(['namePanel']) && inv.sockets.length === 0 && inv.c.__replaced === '/', 'an invite link waits for the name (and comes off the address at once)', J({ shown: inv.shown(), sockets: inv.sockets.length, replaced: inv.c.__replaced }));
  inv.$('nameInput').value = 'Bea'; inv.$('nameOk').click();
  const s = inv.sockets[0]; if (s) inv.open(0);
  ok(J(inv.shown()) === J(['multiPanel']) && s && s.url === 'ws://play.example:8765/ws' && s.sent.some(m => m.t === 'join' && m.room === 'AB12CD' && m.existing === true && m.name === 'Bea'),
    '...then connects and joins that game under it', J({ shown: inv.shown(), url: s && s.url, sent: s && s.sent }));
}

// ---- 3. MULTIPLAYER IS CONNECT ----
{
  const p = page({ store: named });
  p.$('multiBtn').click();
  const s0 = p.sockets[0];
  ok(J(p.shown()) === J(['multiPanel']) && p.sockets.length === 1 && s0.url === 'ws://play.example:8765/ws', 'pressing MULTIPLAYER connects to the page\'s own server at once', J({ shown: p.shown(), urls: p.sockets.map(s => s.url) }));
  ok(p.$('netForm').style.display === 'none' && /Connecting to play\.example:8765/.test(p.$('netStatus').textContent), 'while it connects there is no form, only a line saying where to', J({ form: p.$('netForm').style.display, status: p.$('netStatus').textContent }));
  p.open(0);
  ok(s0.sent.some(m => m.t === 'list') && p.$('netBar').style.display === '' && /as <b>Zac<\/b>/.test(p.$('netBar').innerHTML) && p.$('netForm').style.display === 'none', 'once open it asks for the game list, as the name chosen at first launch', J({ sent: s0.sent, bar: p.$('netBar').innerHTML.slice(0, 120) }));
  p.R('Net.handle({ t: "lobbies", rooms: [], online: 1 });');
  ok(/id="lbHost"/.test(p.$('lobby').innerHTML) && /id="lbQuick"/.test(p.$('lobby').innerHTML), 'and the list of games is what the player sees');
  p.$('multiBack').click(); p.$('multiBtn').click();
  ok(p.sockets.length === 1 && J(p.shown()) === J(['multiPanel']), 'leaving and coming back to the same server as the same player keeps the connection', p.sockets.length);
  p.$('optNetUrl').value = 'localhost:1'; p.$('optNetUrl').fire('change');
  p.$('multiBack').click(); p.$('multiBtn').click();
  ok(p.sockets.length === 2 && p.sockets[1].url === 'ws://localhost:1/ws', 'a server named in Settings is typed the way people type it, and used next time', J(p.sockets.map(s => s.url)));
  p.drop(1);
  ok(p.$('netForm').style.display === '' && p.$('netFail').textContent === 'Could not reach the game server at localhost:1.' && p.$('netUrl').value === 'localhost:1' && p.$('netBar').style.display === 'none',
    'a server that cannot be reached shows the form, saying which server', J({ form: p.$('netForm').style.display, fail: p.$('netFail').textContent, url: p.$('netUrl').value }));
  p.$('netUrl').value = ''; p.$('netConnect').click();
  ok(p.sockets.length === 3 && p.sockets[2].url === 'ws://play.example:8765/ws' && p.$('netForm').style.display === 'none', 'TRY AGAIN with the box emptied goes back to the page\'s own server', J(p.sockets.map(s => s.url)));
  p.open(2);
  ok(JSON.parse(p.store.bw_net).url === '', '...and remembers that choice once it connects', p.store.bw_net);
  p.drop(2);
  ok(p.$('netForm').style.display === '' && /was lost/.test(p.$('netFail').textContent), 'a connection that drops says it was lost, not that it never worked', p.$('netFail').textContent);
  p.$('optNetName').value = 'Zed'; p.$('optNetName').fire('change');
  p.$('multiBack').click(); p.$('multiBtn').click();
  const s3 = p.sockets[3]; if (s3) p.open(3);
  ok(s3 && s3.sent.some(m => m.t === 'list') && /as <b>Zed<\/b>/.test(p.$('netBar').innerHTML), 'a name changed in Settings is the name the next connection uses', J({ n: p.sockets.length, bar: p.$('netBar').innerHTML.slice(0, 100) }));
  p.$('optNetName').value = ''; p.$('optNetName').fire('change');
  ok(JSON.parse(p.store.bw_net).name === 'Zed' && p.$('optNetName').value === 'Zed', 'an emptied name box puts the name back rather than playing as nobody', p.store.bw_net);
  p.$('netUrl').value = 'not a server at all'; p.$('netConnect').click();
  ok(p.$('netForm').style.display === '' && /Could not reach/.test(p.$('netFail').textContent), 'an address that is not one at all is a server that could not be reached, not an exception', p.$('netFail').textContent);
}

// ---- 4 and 5. THE SKIRMISH LOBBY ----
{
  const p = page({ store: named });
  p.$('singleBtn').click();
  ok(J(p.shown()) === J(['singlePanel']), 'SINGLE PLAYER opens its doors', J(p.shown()));
  p.$('setupBtn').click();
  const lob = p.$('skLobby'), h = () => lob.innerHTML;
  ok(J(p.shown()) === J(['skirmishPanel']) && /<button id="lbStart"[^>]*>START GAME<\/button>/.test(h()), 'SKIRMISH SETUP opens the lobby, and START GAME is in it', J(p.shown()));
  const has = ['class="lbHead"', 'class="lbBody"', 'class="lbTeams"', 'class="lbTeam"', 'class="lbSettings"', 'GAME SETTINGS', 'class="lbPrev', 'id="lbLayout"', 'id="lbSpeed"', 'data-rule="bank"', 'data-addai="2"', 'data-kick="-1"', 'data-slot="1" data-field="race"', 'data-slot="-1" data-field="style"', 'id="lbChatLog"', 'class="lbButtons"', 'id="lbSeed"'];
  const hasNot = ['id="lbReady"', 'id="lbPrivacy"', 'id="lbCopy"', 'id="lbInvite"', 'id="lbLock"', 'id="lbRename"', 'class="lbSpecs"', 'data-ping=', 'data-ring=', 'id="lbToSpec"', '>QUIT<'];
  ok(has.every(x => h().includes(x)) && hasNot.every(x => !h().includes(x)) && /<button id="lbLeave" class="small">BACK<\/button>/.test(h()),
    'it is the multiplayer lobby\'s markup -- teams, slots, the settings column with the map, the chat -- less READY, latency, spectators, the lock, privacy, the code and the invite, with BACK for QUIT',
    J({ missing: has.filter(x => !h().includes(x)), extra: hasNot.filter(x => h().includes(x)) }));
  // The control for the check above: the same room drawn as a multiplayer room has every one of the human-only pieces.
  const asNet = p.R('Net.id = 1; Net.lobby = Object.assign({}, UI.Skirmish.L, { room: "ROOM42", listed: true, readyCheck: true, players: UI.Skirmish.L.players.concat([{ id: 5, name: "Guest", race: "Z", team: 2 }]) }); const s = Net.roomHtml(); Net.lobby = null; return s;');
  ok(hasNot.filter(x => x !== 'id="lbToSpec"' && x !== 'data-ring=').every(x => asNet.includes(x)) && !asNet.includes('id="lbSeed"'), '...and the same room drawn for the relay has all of them, and no seed', J(hasNot.filter(x => !asNet.includes(x))));
  const L = () => p.R('return UI.Skirmish.L;');
  ok(J(L().players.map(x => [x.id, x.name, x.race, x.team, !!x.ai])) === J([[1, 'Zac', 'T', 1, false], [-1, 'Computer 1', 'R', 2, true]]) && L().layout === 'temple' && L().speed === 6,
    'a new lobby is the game the old START made: you as Terran on Team 1, one random computer on Team 2, Lost Ruins, Fastest', J(L()));
  const q = sel => lob.querySelector(sel);
  q('[data-addai="2"]').click();
  ok(J(L().players.map(x => x.name)) === J(['Zac', 'Computer 1', 'Computer 2']) && /Added Computer 2\./.test(h()), '+ ADD A.I. adds a computer to that team, named in seat order, and the log says so', J(L().players.map(x => x.name)));
  const race = q('[data-slot="-2"][data-field="race"]'); race.value = 'Z'; race.onchange();
  const diff = q('[data-slot="-2"][data-field="difficulty"]'); diff.value = 'hard'; diff.onchange();
  const style = q('[data-slot="-2"][data-field="style"]'); style.value = 'rusher'; style.onchange();
  const team = q('[data-slot="-2"][data-field="team"]'); team.value = '3'; team.onchange();
  const mine = q('[data-slot="1"][data-field="race"]'); mine.value = 'P'; mine.onchange();
  ok(J(L().players.map(x => [x.race, x.team, x.difficulty || '', x.style || ''])) === J([['P', 1, '', ''], ['R', 2, 'normal', 'standard'], ['Z', 3, 'hard', 'rusher']]), 'each slot\'s race, difficulty, play style and team are set from its own dropdowns', J(L().players));
  q('[data-kick="-1"]').click();
  ok(J(L().players.map(x => [x.name, x.race])) === J([['Zac', 'P'], ['Computer 1', 'Z']]) && /Removed Computer 1\./.test(h()), 'a computer is removed with its cross, and the rest are renumbered', J(L().players));
  const map = q('#lbLayout'); map.value = 'valley'; map.onchange();
  const refused = p.R('UI.Skirmish.apply({ t: "addai", team: 2 }); return UI.Skirmish.L.players.length;');
  ok(L().players.length === 2 && L().cap === 2 && !q('[data-addai]') && refused === 2 && /2\/2 players/.test(h()), 'a two-start map offers no third slot, and refuses one asked for anyway', J({ n: L().players.length, cap: L().cap, link: !!q('[data-addai]') }));
  const t1 = q('#lbLayout'); t1.value = 'temple'; t1.onchange(); q('[data-addai="2"]').click(); q('[data-addai="2"]').click();
  const map2 = q('#lbLayout'); map2.value = 'valley'; map2.onchange();
  q('#lbStart').click();
  ok(p.c.__started.length === 0 && /class="lbOver">4\/2 players/.test(h()) && /Remove a slot or pick a bigger map/.test(h()), 'START refuses a map with fewer starts than players, and says why', J({ started: p.c.__started.length }));
  const back = q('#lbLayout'); back.value = 'temple'; back.onchange();
  for (const k of lob.querySelectorAll('[data-kick]')) k.click();
  q('#lbStart').click();
  ok(p.c.__started.length === 0 && /Add a computer opponent/.test(h()) && /id="lbStart" class="lbWaiting"/.test(h()), 'START refuses a game with nobody to play, and says so', J({ started: p.c.__started.length, players: L().players.length }));
  q('[data-addai="2"]').click();
  const bank = q('[data-rule="bank"]'); bank.value = 'rich'; bank.onchange();
  const haz = q('[data-rule="hazard"]'); haz.value = 'none'; haz.onchange();
  const speed = q('#lbSpeed'); speed.value = '3'; speed.onchange();
  const seed = q('#lbSeed'); seed.value = '4242'; seed.onchange();
  ok(L().rules.bank === 'rich' && L().rules.hazard === 'none' && L().speed === 3 && L().seed === 4242 && /Starting bank: Rich/.test(h()) && /Speed: Normal\./.test(h()), 'the rules, the speed and the seed are set in the settings column', J({ rules: L().rules, speed: L().speed, seed: L().seed }));
  q('#lbChat').value = 'gl hf'; q('#lbChat').fire('keydown', { key: 'Enter' });
  ok(/Zac:<\/b> gl hf/.test(h()) && q('#lbChat').value === '', 'the chat box takes a line and is emptied', (h().match(/lbChatLog">[\s\S]{0,200}/) || [''])[0]);
  const expect = p.R('const s = UI.Skirmish.setup(); const o = UI.skirmishOptions(s); o.players[0].name = "Zac"; return o;');
  q('#lbStart').click();
  const got = p.c.__started[0];
  ok(p.c.__started.length === 1 && J(got) === J(expect) && got.seed === 4242 && got.players.length === 2 && got.players[0].race === 'P' && got.players[0].minerals === 1500 && /hz=0/.test(got.layout) && p.R('return UI.speedIdx;') === 3,
    'START makes exactly the game UI.skirmishOptions makes of the same settings, at the speed chosen, under your name', J({ got, expect }));
  ok(lob.innerHTML === '', 'and the lobby is taken out of the page, since its ids are the multiplayer lobby\'s', lob.innerHTML.length);
  // Remembered: the map, speed, rules and slots come back in the next page; the seed does not.
  const stored = p.store.bw_skirmish;
  const p2 = page({ store: Object.assign({}, named, { bw_skirmish: stored }) });
  p2.$('singleBtn').click(); p2.$('setupBtn').click();
  const L2 = p2.R('return UI.Skirmish.L;');
  ok(L2.layout === 'temple' && L2.speed === 3 && L2.rules.bank === 'rich' && L2.rules.hazard === 'none' && J(L2.players.map(x => [x.race, x.team, !!x.ai])) === J([['P', 1, false], ['R', 2, true]]) && L2.seed !== 4242,
    'the next time, the lobby is set up as it was left -- except the seed, which is new every time, as the relay\'s is', J(L2));
  const junk = page({ store: Object.assign({}, named, { bw_skirmish: J({ layout: 'no-such-map', speed: 'x', rules: { bank: 'gold', hazard: 7 }, players: [{ race: 'Q', team: 99 }, { ai: true, race: 'Z', difficulty: 'godlike', style: 'cheater', team: 0 }, null] }) }) });
  junk.$('singleBtn').click(); junk.$('setupBtn').click();
  const LJ = junk.R('return UI.Skirmish.L;');
  ok(LJ.layout === 'temple' && LJ.speed === 6 && LJ.rules.bank === 'standard' && LJ.rules.hazard === 'map' && J(LJ.players.map(x => [x.race, x.team, x.difficulty || '', x.style || ''])) === J([['T', 1, '', ''], ['Z', 2, 'normal', 'standard']]),
    'a remembered setup that no longer makes sense is read back as the defaults, value by value', J(LJ));
  const bad = page({ store: Object.assign({}, named, { bw_skirmish: '{not json' }) }); bad.$('singleBtn').click(); bad.$('setupBtn').click();
  ok(bad.R('return UI.Skirmish.L.players.length;') === 2, 'and one that is not JSON at all is a fresh lobby');
  // Your own maps: offered in the skirmish lobby, never to the relay.
  const cm = page({ store: named });
  cm.R('MAP_LAYOUTS["custom:mine"] = Object.assign(JSON.parse(JSON.stringify(MAP_LAYOUTS.valley)), { custom: true, name: "Mine" });');
  cm.$('singleBtn').click(); cm.$('setupBtn').click();
  const netMaps = cm.R('return Net.maps().map(m => m[0]);'), localMaps = cm.R('return Net.maps(true).map(m => m[0]);');
  ok(/value="custom:mine"/.test(cm.$('skLobby').innerHTML) && localMaps.includes('custom:mine') && !netMaps.includes('custom:mine'), 'a map made in the editor is offered in the skirmish lobby, and never to a multiplayer room', J({ local: localMaps.includes('custom:mine'), net: netMaps.includes('custom:mine') }));
  const mm = cm.$('skLobby').querySelector('#lbLayout'); mm.value = 'custom:mine'; mm.onchange();
  ok(cm.R('return UI.Skirmish.L.layout;') === 'custom:mine' && cm.R('return UI.Skirmish.L.cap;') === 2, '...and can be picked, with its own number of starts', cm.R('return JSON.stringify([UI.Skirmish.L.layout, UI.Skirmish.L.cap]);'));
  // BACK
  const b = page({ store: named }); b.$('singleBtn').click(); b.$('setupBtn').click(); b.$('skLobby').querySelector('#lbLeave').click();
  ok(J(b.shown()) === J(['singlePanel']) && b.$('skLobby').innerHTML === '', 'BACK returns to Single Player and takes the lobby out of the page', J(b.shown()));
  // The untouched lobby starts the old START button's game, seed apart.
  const d = page({ store: named }); d.$('singleBtn').click(); d.$('setupBtn').click();
  const dseed = d.R('return UI.Skirmish.L.seed;'); d.$('skLobby').querySelector('#lbStart').click();
  const old = d.R('const o = UI.skirmishOptions(Object.assign(UI.setupDefaults(), { seed: ' + dseed + ' })); o.players[0].name = "Zac"; return o;');
  ok(J(d.c.__started[0]) === J(old), 'START on an untouched lobby is the game the old one-click START made', J({ got: d.c.__started[0], old }));
}

// ---- 6. SETTINGS ----
{
  const p = page({ store: named });
  p.$('settingsBtn').click();
  const bodies = () => p.document.querySelectorAll('[data-body]').filter(x => x.style.display !== 'none').map(x => x.dataset.body);
  ok(J(p.shown()) === J(['settingsPanel']) && J(bodies()) === J(['game']), 'SETTINGS opens on its Game tab', J({ shown: p.shown(), bodies: bodies() }));
  p.document.querySelectorAll('[data-tab]').find(a => a.dataset.tab === 'codex').click();
  ok(J(bodies()) === J(['codex']), 'the Codex tab shows the Codex tab\'s body alone', J(bodies()));
  p.$('codexBtn').click();
  ok(p.c.__codex.length === 1, 'and its button opens the codex', p.c.__codex.length);
  p.document.querySelectorAll('[data-tab]').find(a => a.dataset.tab === 'keys').click();
  const rows = p.$('bindList').kids.filter(k => k.className === 'row'), heads = p.$('bindList').kids.filter(k => k.className === 'bindHead').map(k => k.textContent);
  const actions = p.R('return Object.keys(UI.BIND_DEFAULTS).length;');
  ok(J(bodies()) === J(['keys']) && rows.length === actions && J(heads) === J(['Selection', 'Camera', 'Interface']), 'the Controls tab lists every rebindable key under its group', J({ rows: rows.length, actions, heads }));
  p.$('keyGrid').click();
  ok(p.R('return UI.gridKeys;') === true && p.store.bw_hotkeys === 'grid' && p.$('keyGrid').classList.contains('on') && !p.$('keyStd').classList.contains('on'), 'GRID puts the command card on QWER / ASDF / ZXCV, remembered, and shows which is chosen', J({ grid: p.R('return UI.gridKeys;'), stored: p.store.bw_hotkeys }));
  const g2 = page({ store: Object.assign({}, named, { bw_hotkeys: 'grid' }) });
  ok(g2.R('UI.loadPrefs(); return UI.gridKeys;') === true, '...and comes back with the page, without the dropdown that used to load it');
  p.$('keyStd').click();
  ok(p.R('return UI.gridKeys;') === false && p.store.bw_hotkeys === 'bw', 'STANDARD puts each command back on its own letter', p.store.bw_hotkeys);
  const item = p.R('UI.menu = "settings"; const t = UI.menuItems().items.map(i => i[0]).find(s => /card keys/.test(s)); UI.menu = null; return t;');
  ok(item === 'Command card keys: Standard', 'the in-game settings screen calls it what the Controls tab calls it', item);
}

// ---- 7. EVERY COMMAND CARD KEY, IN THE CONTROLS TAB ----
{
  const p = page({ store: named });
  p.$('settingsBtn').click();
  p.document.querySelectorAll('[data-tab]').find(a => a.dataset.tab === 'keys').click();
  const view = v => p.document.querySelectorAll('[data-keys]').find(a => a.dataset.keys === v).click();
  view('T');
  const list = p.$('cardList'), edit = p.$('cardEdit');
  const cards = list.querySelectorAll('[data-card]').map(a => a.dataset.card);
  ok(p.$('cardKeys').style.display === '' && p.$('bindList').style.display === 'none' && cards[0] === 'unit:scv' && cards.includes('bld:barracks') && cards.includes('menu:T:adv') && /Units[\s\S]*Buildings[\s\S]*Build menus/.test(list.innerHTML),
    'TERRAN lists every Terran card -- units, buildings, build menus -- in place of the Interface keys', J({ n: cards.length, first: cards[0] }));
  ok(cards.length === p.R('return UI.cardCatalog().T.length;'), 'one entry per card in the catalogue test/hotkeys.js holds against the real cards', cards.length);
  list.querySelectorAll('[data-card]').find(a => a.dataset.card === 'bld:barracks').click();
  const cell = cmd => edit.querySelectorAll('[data-cmd]').find(b => b.dataset.cmd === cmd);
  ok(/class="ckTitle">Barracks</.test(edit.innerHTML) && cell('unit:marine') && cell('unit:marine').textContent === 'M' && (edit.innerHTML.match(/class="ckCell/g) || []).length === 12, 'a card is drawn as its 4 x 3 grid with the key on every button: Marine on M', edit.innerHTML.slice(0, 160));
  cell('unit:marine').click();
  ok(p.listening() === 1 && cell('unit:marine').textContent === 'press', 'clicking a key waits for the next one, with one listener', p.listening());
  p.key('5');
  ok(p.R('return UI.cardKeyFor("unit:marine", 0, "M");') === 'M' && p.listening() === 0 && cell('unit:marine').textContent === 'A to Z', 'a key that is not a letter is refused, says so, and the listener is gone', J({ k: p.R('return UI.cardKeyFor("unit:marine", 0, "M");'), listening: p.listening() }));
  cell('unit:marine').click(); p.key('q');
  ok(p.R('return UI.cardKeyFor("unit:marine", 0, "M");') === 'Q' && JSON.parse(p.store.bw_cardkeys).standard['unit:marine'] === 'Q' && cell('unit:marine').textContent === 'Q' && /ckCell mine/.test(edit.innerHTML) && /data-reset="unit:marine"/.test(edit.innerHTML) && p.listening() === 0,
    'pressing Q puts the Marine on Q, remembered, marked as changed with a way back', J({ stored: p.store.bw_cardkeys }));
  cell('unit:firebat').click(); p.key('d');
  const marauder = cell('unit:marauder');
  ok(/ckCell mine clash/.test(edit.innerHTML) && /D is on Firebat and Marauder: D presses the first of them\./.test(edit.innerHTML) && /data-card="bld:barracks" class="on clash"/.test(list.innerHTML) && marauder,
    'a letter now on two buttons turns both red, says which, and marks the card in the list', (edit.innerHTML.match(/class="ckMsg[^<]*/) || [''])[0]);
  const move = p.R('UI.resetCardKeys(); return UI.cardUses()["cmd:move"];');
  list.querySelectorAll('[data-card]').find(a => a.dataset.card === 'unit:marine').click();
  ok(new RegExp('Move is on ' + move + ' cards; a key set here is its key on all of them').test(edit.innerHTML), 'a shared command says on how many cards its key changes', move);
  cell('cmd:move').click(); p.key('Delete');
  ok(p.R('return UI.cardKeyFor("cmd:move", 0, "M");') === '' && cell('cmd:move').textContent === '—', 'Delete leaves the command with no key, drawn as a dash', cell('cmd:move').textContent);
  edit.querySelectorAll('[data-reset]').find(a => a.dataset.reset === 'cmd:move').click();
  ok(p.R('return UI.cardKeyFor("cmd:move", 0, "M");') === 'M' && !/data-reset=/.test(edit.innerHTML), 'the arrow puts that one key back', edit.innerHTML.slice(0, 80));
  cell('cmd:stop').click(); p.key('x'); cell('cmd:hold').click(); p.key('y');
  edit.querySelector('#cardReset').click();
  ok(p.R('return [UI.cardKeyFor("cmd:stop", 1, "S"), UI.cardKeyFor("cmd:hold", 4, "H")].join();') === 'S,H', 'RESET THIS CARD puts every key on the card back', p.R('return JSON.stringify(UI.cardKeys());'));
  cell('cmd:move').click(); p.key('Escape');
  ok(p.listening() === 0 && cell('cmd:move').textContent === 'M', 'Escape cancels without changing anything');
  p.$('keyGrid').click();
  ok(cell('cmd:move').textContent === 'Q' && cell('cmd:stop').textContent === 'W', 'switching to Grid redraws the card with the slots\' letters', cell('cmd:move').textContent);
  p.$('keyStd').click();
  p.R('UI.setBinding("idleWorker", "s");');
  view('T'); list.querySelectorAll('[data-card]').find(a => a.dataset.card === 'unit:marine').click();
  ok(/class="ckCell clash"/.test(edit.innerHTML) && /S is Select idle worker \(Interface\), which is read first: Stop will not answer it\./.test(edit.innerHTML), 'a letter an Interface key holds is red on the card, and says the card\'s button will not answer it', (edit.innerHTML.match(/class="ckMsg[^<]*/) || [''])[0]);
  view('ui');
  const idle = p.$('bindList').kids.find(k => k.kids && k.kids[0] && k.kids[0].textContent === 'Select idle worker');
  ok(p.$('bindList').style.display === '' && p.$('cardKeys').style.display === 'none' && idle && /clash/.test(idle.className) && /does not answer it/.test(idle.title), '...and INTERFACE marks the binding that takes a letter from the cards', J(idle && { c: idle.className, t: idle.title }));
  p.R('UI.setCardKey("unit:marine", "Q"); UI.setGridKeys(true);');
  p.$('bindReset').click();
  ok(p.R('return UI.gridKeys === false && UI.key("idleWorker") === "," && UI.cardKeyFor("unit:marine", 0, "M") === "M";') === true && p.store.bw_cardkeys === undefined, 'RESET ALL puts back the Interface keys, every card key and the Standard layout');
  view('T'); cell('cmd:move') || list.querySelectorAll('[data-card]')[0].click();
  const anyCell = edit.querySelectorAll('[data-cmd]')[0]; anyCell.click();
  p.$('settingsBack').click();
  ok(p.listening() === 0, 'leaving Settings while a key is being waited for stops waiting', p.listening());
}

console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
