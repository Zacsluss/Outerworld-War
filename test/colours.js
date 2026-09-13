// A COLOUR CHOSEN IN THE LOBBY (tenth session, item 2; the user: "there is no color picker in multiplayer lobby - user should
// be able to click their color swatch and choose from the available colors"). Researched: StarCraft II's melee lobby keeps
// colours unique; OpenRA's picker is free and its server corrects a clash; Age of Empires II DE's shared colour is shared
// control. Measured before: a slot's colour was its seat (Net.slotColor), and Player painted PLAYER_COLORS[id].
//   node test/colours.js [port=8908]
//
// RELAY (real sockets):
//   1. a player chooses a colour, and nobody else may choose it; Auto gives it back; the room is told; nobody's ready moves
//   2. the host chooses a computer's colour; a guest chooses neither a computer's nor another player's
//   3. the game's start carries the colours that were chosen, and only those
// CLIENT:
//   4. the rule (Player.assignColors): a choice is kept, a clash is Auto, an Auto seat keeps its own colour while it is free;
//      nobody choosing paints every seat as before
//   5. the game is painted with it (G.init), and a replay keeps it
//   6. the lobby: your swatch opens a palette of the colours nobody is wearing, and a click sends the choice
//   7. the skirmish lobby chooses the same way, remembers it, and starts the game in it
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { spawn } = require('child_process');
const { ok, counts, mkDom, root } = require('./_harness');
const PORT = parseInt(process.argv[2] || '8908', 10);
const J = v => JSON.stringify(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const servers = [];
function serve(port) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port), '3'], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_COUNTDOWN: '0', BW_LOBBY_PING: '60000' }) });
  s.out = []; s.stdout.on('data', d => s.out.push(String(d))); s.stderr.on('data', d => console.log('  [relay err] ' + String(d).trim()));
  servers.push(s); return s;
}
process.on('exit', () => { for (const s of servers) { try { s.kill(); } catch (e) { } } });
function client(port) {
  const c = { msgs: [], lobby: null, errors: [], sys: [] };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'lobby') c.lobby = m; if (m.t === 'error') c.errors.push(m); if (m.t === 'sys') c.sys.push(m); if (m.t === 'lping') c.send({ t: 'lpong', n: m.n }); };
  c.send = o => { try { c.ws.send(JSON.stringify(o)); } catch (e) { } };
  c.open = new Promise((r, j) => { c.ws.onopen = r; c.ws.onerror = () => j(new Error('socket error on port ' + port)); setTimeout(() => j(new Error('no open within 10 s')), 10000).unref(); });
  c.open.catch(() => { });
  return c;
}
const who = (c, name) => c.lobby && c.lobby.players.find(p => p.name === name);

(async () => {
  if (typeof WebSocket === 'undefined') { console.log('FAIL needs Node 22+ (global WebSocket)'); process.exit(1); }
  serve(PORT); await sleep(500);
  const A = client(PORT), B = client(PORT);
  await Promise.all([A.open, B.open]);

  console.log('--- 1. choosing ---');
  A.send({ t: 'join', name: 'Ada', race: 'T', create: true, title: 'Colours' }); await sleep(250);
  A.send({ t: 'set', cap: 4 }); await sleep(100);
  B.send({ t: 'join', name: 'Ben', race: 'Z', room: A.lobby.room, existing: true }); await sleep(250);
  B.send({ t: 'set', ready: true }); await sleep(150);
  A.send({ t: 'set', id: who(A, 'Ada').id, color: 5 }); await sleep(250);
  ok(who(A, 'Ada').color === 5 && who(B, 'Ada').color === 5 && B.sys.some(m => m.ev === 'color' && m.name === 'Ada' && m.color === 5), 'Ada chooses Brown (5): the room shows it and is told', J({ ada: who(B, 'Ada'), sys: B.sys.slice(-1) }));
  ok(who(A, 'Ben').ready === true, '...and Ben\'s ready is not withdrawn for it: a colour is paint', J(who(A, 'Ben')));
  B.send({ t: 'set', id: who(B, 'Ben').id, color: 5 }); await sleep(250);
  ok(who(A, 'Ben').color === undefined && who(A, 'Ada').color === 5, 'Ben asking for Brown too is refused: nobody shares a colour', J(A.lobby.players));
  B.send({ t: 'set', id: who(B, 'Ben').id, color: 7 }); await sleep(200);
  A.send({ t: 'set', id: who(A, 'Ada').id, color: null }); await sleep(250);
  ok(who(A, 'Ben').color === 7 && who(A, 'Ada').color === undefined && A.sys.some(m => m.ev === 'color' && m.name === 'Ada' && m.color === undefined), 'Ben takes Yellow; Ada\'s Auto gives Brown back, and the room is told', J(A.lobby.players));

  console.log('--- 2. whose colour ---');
  A.send({ t: 'addai', race: 'P', difficulty: 'normal', style: 'standard', team: 2 }); await sleep(250);
  const cpu = A.lobby.players.find(p => p.ai);
  A.send({ t: 'set', id: cpu.id, color: 3 }); await sleep(200);
  B.send({ t: 'set', id: cpu.id, color: 4 }); B.send({ t: 'set', id: who(B, 'Ada').id, color: 4 }); await sleep(250);
  const cpu2 = A.lobby.players.find(p => p.ai);
  ok(cpu2.color === 3 && who(A, 'Ada').color === undefined, 'the host chooses the computer\'s colour; a guest can choose neither the computer\'s nor the host\'s', J(A.lobby.players));

  console.log('--- 3. the game carries it ---');
  B.send({ t: 'set', ready: true }); await sleep(150);
  A.send({ t: 'start' }); await sleep(400);
  const st = A.msgs.find(m => m.t === 'start');
  ok(st && st.players.find(p => p.name === 'Ben').color === 7 && st.players.find(p => !p.human).color === 3 && !('color' in st.players.find(p => p.name === 'Ada')),
    'the start carries the colours chosen (Ben\'s Yellow, the computer\'s Purple) and nothing for Ada, who is on Auto', J(st && st.players));
  for (const c of [A, B]) try { c.ws.close(); } catch (e) { }
  for (const s of servers) try { s.kill(); } catch (e) { }

  // =========================================================================================== CLIENT
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
  const store = { bw_net: J({ name: 'Zac', url: '', race: 'R' }), bw_intro: '1' };
  const document = mkDom(html), loaded = [];
  function WS(url) { this.url = url; this.readyState = 1; this.sent = []; }
  WS.prototype.send = function (s) { this.sent.push(JSON.parse(s)); }; WS.prototype.close = function () { this.readyState = 3; };
  const cx = { console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { }, requestAnimationFrame() { }, Image: function () { }, WebSocket: WS, navigator: {},
    addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { protocol: 'http:', host: 'x', origin: 'http://x', pathname: '/', search: '' }, history: { replaceState() { } }, document, __started: [] };
  cx.window = cx; cx.globalThis = cx; vm.createContext(cx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), cx, { filename: f + '.js' });
  vm.runInContext('UI.init = () => {}; UI.makeTicker = () => 1; Render.reset = () => {}; const realStart = UI.start; UI.start = function (o) { __started.push(JSON.parse(JSON.stringify(o))); return realStart.call(this, o); };', cx);
  for (const fn of loaded) fn();
  const R = src => vm.runInContext('(() => {' + src + '})()', cx);

  console.log('--- 4. the rule ---');
  const rule = R(`const A = (ps) => Player.assignColors(ps, 8);
    return { none: A([{}, {}, {}, {}]), chosen: A([{ color: 5 }, {}, {}]), clash: A([{ color: 2 }, { color: 2 }, {}]), pushed: A([{}, { color: 0 }, {}]), eight: A([{}, {}, {}, {}, {}, {}, {}, { color: 0 }]) };`);
  ok(J(rule.none) === J([0, 1, 2, 3]), 'nobody choosing: every seat wears its own colour, as before', J(rule.none));
  ok(J(rule.chosen) === J([5, 1, 2]) && J(rule.clash) === J([2, 1, 0]), 'a choice is kept; a second claim on a colour is Auto and keeps its own seat\'s Blue, and the third seat, whose Teal was chosen, takes the first free, Red', J(rule));
  ok(J(rule.pushed) === J([1, 0, 2]) && J(rule.eight) === J([1, 2, 3, 4, 5, 6, 7, 0]), 'an Auto seat whose colour someone chose takes the first free one, and only it moves', J({ pushed: rule.pushed, eight: rule.eight }));

  console.log('--- 5. the game is painted with it ---');
  const game = R(`G.init({ players: [{ race: 'T', human: true, name: 'A', color: 5 }, { race: 'Z', human: false, name: 'B', color: 5 }, { race: 'P', human: false, name: 'C' }], seed: 3, layout: 'temple' });
    const cols = G.players.filter(p => !p.neutral).map(p => PLAYER_COLORS.indexOf(p.color));
    const saved = Replay.data().players.map(p => p.color === undefined ? null : p.color);
    G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, name: 'B' }], seed: 3, layout: 'temple' });
    return { cols, saved, plain: G.players.filter(p => !p.neutral).map(p => PLAYER_COLORS.indexOf(p.color)) };`);
  ok(J(game.cols) === J([5, 1, 2]) && J(game.saved) === J([5, 5, null]), 'G.init paints the chosen colour -- Brown for A, B (whose Brown clashed) in its own Blue, C in its own Teal -- and the replay keeps what was asked', J(game));
  ok(J(game.plain) === J([0, 1]), '...and a game with no choice is painted seat by seat, exactly as before', J(game.plain));

  console.log('--- 6. the lobby ---');
  const lobby = R(`Net.ws = new WebSocket('ws://x/ws'); Net.connected = true; Net.id = 1; Net.palette = null;
    Net.lobby = { room: 'ROOM1', state: 'lobby', cap: 4, layout: 'temple', speed: 6, rules: {}, specs: [], players: [
      { id: 1, name: 'Ada', race: 'T', team: 1, host: true }, { id: 2, name: 'Ben', race: 'Z', team: 2, color: 7 }, { id: -3, name: 'Computer 0', race: 'P', team: 2, ai: true, difficulty: 'normal', style: 'standard' }] };
    Net.render(); const el = document.getElementById('lobby'), $$ = s => Array.from(el.querySelectorAll(s));
    const opens = $$('[data-color-open]').map(a => a.dataset.colorOpen);
    const mine = $$('[data-color-open="1"]')[0]; if (!mine) return { opens };
    mine.onclick({ preventDefault() { } });
    const picks = $$('[data-palette="1"] [data-color]').map(a => a.dataset.color), taken = $$('[data-palette="1"] .taken').length;
    const brown = $$('[data-palette="1"] [data-color="5"]')[0]; brown.onclick({ preventDefault() { } });
    const sent = Net.ws.sent.filter(m => m.t === 'set' && 'color' in m).pop();
    Net.id = 2; Net.palette = null; Net.render(); const guestOpens = $$('[data-color-open]').map(a => a.dataset.colorOpen);
    return { opens, picks, taken, sent, open: Net.palette, guestOpens };`);
  ok(J(lobby.opens) === J(['1', '-3']), 'the host can open the palette on their own swatch and on the computer\'s, not on another player\'s', J(lobby));
  ok(lobby.taken === 2 && J(lobby.picks) === J(['0', '1', '3', '4', '5', '6', 'auto']), '...which offers the colours nobody else wears (Teal, the computer\'s seat colour, and Ben\'s Yellow are shown taken) and Auto', J(lobby));
  ok(lobby.sent && lobby.sent.id === 1 && lobby.sent.color === 5 && lobby.open === null, 'clicking Brown sends the choice for that slot and closes the palette', J(lobby.sent));
  ok(J(lobby.guestOpens) === J(['2']), 'a guest may open only their own swatch', J(lobby.guestOpens));
  const opts = R(`return Net.gameOptions({ seed: 9, layout: 'temple', you: 0, players: [{ name: 'Ada', race: 'T', team: 1, human: true, color: 3 }, { name: 'Ben', race: 'Z', team: 2, human: true }] }).players.map(p => 'color' in p ? p.color : null);`);
  ok(J(opts) === J([3, null]), 'a network game\'s options carry the chosen colour into G.init, and nothing for an Auto seat', J(opts));

  console.log('--- 7. the skirmish lobby ---');
  const sk = R(`store = null; UI.Skirmish.open ? UI.Skirmish.open() : null; const S = UI.Skirmish; if (!S.L) S.L = S.load();
    const me = S.L.players.find(p => p.id === S.ME), cpu = S.L.players.find(p => p.ai);
    S.apply({ t: 'set', id: me.id, color: 6 }); S.apply({ t: 'set', id: cpu.id, color: 6 }); S.apply({ t: 'set', id: cpu.id, color: 4 });
    const after = { me: me.color, cpu: cpu.color };
    const back = S.load(); const kept = { me: back.players[0].color, cpu: (back.players.find(p => p.ai) || {}).color };
    const o = S.options(); return { after, kept, opts: o.players.map(p => p.color === undefined ? null : p.color) };`);
  ok(sk.after.me === 6 && sk.after.cpu === 4, 'the skirmish lobby chooses the same way: White for you, and the computer refused White, given Orange', J(sk));
  ok(sk.kept.me === 6 && sk.kept.cpu === 4 && sk.opts[0] === 6 && sk.opts[1] === 4, '...remembers both, and starts the game with them', J(sk));

  const { pass, fail } = counts();
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL the suite threw: ' + (e && e.stack || e)); for (const s of servers) try { s.kill(); } catch (x) { } process.exit(1); });
