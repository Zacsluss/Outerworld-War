// A COMPUTER SLOT IS ALWAYS READY AND ALWAYS THE HOST'S TO CHANGE (tenth session, item 3; the user: "once ai is added to
// multiplayer lobby, there is no way to remove it - it enters as 'readied up' - so no changes can be made. it should not have
// to ready up - it is always ready, but must ALWAYS be able to be changed/moved/removed."). Researched: OpenRA's and Beyond
// All Reason's ready checks count humans only, and only the host changes or removes a bot. Measured before: the host's row
// had the lists and a 10-px red x, a guest's was plain text, and a computer wore the READY tick a human earns.
//   node test/aislots.js [port=8904]
//
// RELAY (real sockets):
//   1. a room with a computer starts without waiting for it; the host changes its race, difficulty, style, team and start,
//      and removes it
//   2. a guest can do neither
//   3. ALWAYS: the host changing or removing a computer during the countdown calls the count off and does it
// CLIENT (the lobby's own markup):
//   4. a computer shows a gear, not a ready tick; the host's row has every list and a REMOVE in words; a human keeps the tick
//      and the small x
//   5. a guest's computer row says the host sets it; during the countdown the host's computer rows keep their lists
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { spawn } = require('child_process');
const { ok, counts, mkDom, root } = require('./_harness');
const PORT = parseInt(process.argv[2] || '8904', 10);
const J = v => JSON.stringify(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const servers = [];
function serve(port, env) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port), '3'], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_COUNTDOWN: '0', BW_LOBBY_PING: '60000' }, env || {}) });
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
const ai = c => c.lobby && c.lobby.players.find(p => p.ai);

(async () => {
  if (typeof WebSocket === 'undefined') { console.log('FAIL needs Node 22+ (global WebSocket)'); process.exit(1); }
  serve(PORT); await sleep(500);
  const A = client(PORT), B = client(PORT);
  await Promise.all([A.open, B.open]);

  console.log('--- 1. the host\'s computer ---');
  A.send({ t: 'join', name: 'Ada', race: 'T', create: true, title: 'Slots' }); await sleep(250);
  const code = A.lobby.room;
  A.send({ t: 'set', cap: 4 }); A.send({ t: 'addai', race: 'P', difficulty: 'normal', style: 'standard', team: 2 }); await sleep(250);
  const id = ai(A) && ai(A).id;
  A.send({ t: 'set', id, race: 'Z', difficulty: 'hard', style: 'rusher', team: 1, start: 2 }); await sleep(250);
  const changed = ai(A);
  ok(changed && changed.race === 'Z' && changed.difficulty === 'hard' && changed.style === 'rusher' && changed.team === 1 && changed.start === 2,
    'the host changes a computer\'s race, difficulty, style, team and start', J(changed));
  A.send({ t: 'kick', id }); await sleep(250);
  ok(!ai(A), '...and removes it', J(A.lobby.players));
  A.send({ t: 'addai', race: 'T', difficulty: 'easy', style: 'standard', team: 2 }); await sleep(250);
  A.send({ t: 'start' }); await sleep(400);
  ok(A.msgs.some(m => m.t === 'start') && !A.errors.some(e => /ready/i.test(e.msg)), 'a room of the host and a computer starts at once: a computer is never waited for', J(A.errors));
  for (const c of [A, B]) try { c.ws.close(); } catch (e) { }
  for (const s of servers.splice(0)) try { s.kill(); } catch (e) { }
  await sleep(300);

  console.log('--- 2. a guest ---');
  serve(PORT); await sleep(500);
  const H = client(PORT), G2 = client(PORT);
  await Promise.all([H.open, G2.open]);
  H.send({ t: 'join', name: 'Hal', race: 'T', create: true, title: 'Guest test' }); await sleep(250);
  H.send({ t: 'set', cap: 4 }); H.send({ t: 'addai', race: 'P', difficulty: 'normal', style: 'standard', team: 2 }); await sleep(250);
  G2.send({ t: 'join', name: 'Gia', race: 'Z', room: H.lobby.room, existing: true }); await sleep(250);
  const gid = ai(H).id;
  G2.send({ t: 'set', id: gid, race: 'Z', difficulty: 'hard' }); G2.send({ t: 'kick', id: gid }); await sleep(300);
  ok(ai(H) && ai(H).race === 'P' && ai(H).difficulty === 'normal', 'a guest can neither change nor remove the host\'s computer', J(ai(H)));
  for (const c of [H, G2]) try { c.ws.close(); } catch (e) { }
  for (const s of servers.splice(0)) try { s.kill(); } catch (e) { }
  await sleep(300);

  console.log('--- 3. during the countdown ---');
  const S = serve(PORT, { BW_COUNTDOWN: '4' }); await sleep(500);
  const C1 = client(PORT); await C1.open;
  C1.send({ t: 'join', name: 'Cy', race: 'T', create: true, title: 'Count test' }); await sleep(250);
  C1.send({ t: 'set', cap: 4 }); C1.send({ t: 'addai', race: 'P', difficulty: 'normal', style: 'standard', team: 2 }); C1.send({ t: 'addai', race: 'Z', difficulty: 'normal', style: 'standard', team: 2 }); await sleep(300);
  const [c1, c2] = C1.lobby.players.filter(p => p.ai).map(p => p.id);
  C1.send({ t: 'start' }); await sleep(600);
  const counting = C1.lobby.state;
  C1.send({ t: 'set', id: c1, difficulty: 'hard' }); await sleep(400);
  const afterSet = { state: C1.lobby.state, diff: C1.lobby.players.find(p => p.id === c1).difficulty, cancelled: C1.msgs.some(m => m.t === 'countdown' && m.cancelled && /changed/.test(m.msg)) };
  C1.send({ t: 'start' }); await sleep(600);
  const counting2 = C1.lobby.state;
  C1.send({ t: 'kick', id: c2 }); await sleep(400);
  const afterKick = { state: C1.lobby.state, gone: !C1.lobby.players.some(p => p.id === c2), cancelled: C1.msgs.filter(m => m.t === 'countdown' && m.cancelled).length };
  ok(counting === 'starting' && afterSet.state === 'lobby' && afterSet.diff === 'hard' && afterSet.cancelled, 'during the countdown the host changes a computer: the count is called off, and the change is made', J({ counting, afterSet }));
  ok(counting2 === 'starting' && afterKick.state === 'lobby' && afterKick.gone && afterKick.cancelled === 2, '...and removes one: the count is called off, and it is gone', J({ counting2, afterKick }));
  ok(!C1.msgs.some(m => m.t === 'start'), 'no game started from a count that was called off', J(C1.msgs.filter(m => m.t === 'start').length));
  try { C1.ws.close(); } catch (e) { }
  for (const s of servers.splice(0)) try { s.kill(); } catch (e) { }

  console.log('--- 4. what the lobby draws ---');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
  const document = mkDom(html), loaded = [];
  const cx = { console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { }, requestAnimationFrame() { }, Image: function () { }, WebSocket: function () { }, navigator: {},
    addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
    localStorage: { getItem: () => null, setItem() { }, removeItem() { } }, location: { protocol: 'http:', host: 'x', origin: 'http://x', pathname: '/', search: '' }, history: { replaceState() { } }, document };
  cx.window = cx; cx.globalThis = cx; vm.createContext(cx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), cx, { filename: f + '.js' });
  vm.runInContext('UI.init = () => {}; UI.makeTicker = () => 1; Render.reset = () => {};', cx);
  for (const fn of loaded) fn();
  const R = src => vm.runInContext('(() => {' + src + '})()', cx);
  const rows = R(`const room = state => ({ room: 'ROOM1', state, cap: 4, layout: 'temple', speed: 6, rules: {}, players: [
      { id: 1, name: 'Ada', race: 'T', team: 1, host: true },
      { id: 2, name: 'Ben', race: 'Z', team: 2, ready: true },
      { id: -3, name: 'Computer 0', race: 'P', team: 2, ai: true, difficulty: 'normal', style: 'standard' }], specs: [] });
    const rowOf = (h, name) => { const i = h.indexOf('<span class="lbName">' + name); const s = h.lastIndexOf('<div class="lp', i); const e = h.indexOf('</div>', i); return h.slice(s, e); };
    const draw = (me, state) => { Net.id = me; return Net.roomHtml(room(state)); };
    const host = draw(1, 'lobby'), guest = draw(2, 'lobby'), count = draw(1, 'starting');
    return { hostAi: rowOf(host, 'Computer 0'), hostBen: rowOf(host, 'Ben'), guestAi: rowOf(guest, 'Computer 0'), countAi: rowOf(count, 'Computer 0'), countMe: rowOf(count, 'Ada'),
      local: (() => { const h = Net.roomHtml(room('lobby'), { local: true, me: 1 }); return rowOf(h, 'Computer 0'); })() };`);
  const has = (s, re) => re.test(s);
  ok(has(rows.hostAi, /lbAlways/) && !has(rows.hostAi, /&#10003;|✓/) && has(rows.hostAi, /data-field="race"/) && has(rows.hostAi, /data-field="difficulty"/) && has(rows.hostAi, /data-field="style"/) && has(rows.hostAi, /data-field="team"/) && has(rows.hostAi, /data-field="start"/) && has(rows.hostAi, /class="lbRemove" data-kick="-3"[^>]*>REMOVE</),
    'the host\'s computer row: a gear for always ready (no tick), all five lists, and REMOVE in words', rows.hostAi);
  ok(has(rows.hostBen, /&#10003;|✓/) && has(rows.hostBen, /class="lbKick" data-kick="2"/) && !has(rows.hostBen, /lbAlways/), 'a ready human keeps the tick, and the host\'s small x for him', rows.hostBen);
  console.log('--- 5. a guest, and the countdown ---');
  ok(!has(rows.guestAi, /<select/) && !has(rows.guestAi, /data-kick/) && has(rows.guestAi, /lbHostSets[^>]*>host sets</) && has(rows.guestAi, /lbAlways/), 'a guest\'s view of the computer: no lists, no REMOVE, and "host sets" said in words', rows.guestAi);
  ok(has(rows.countAi, /data-field="difficulty"/) && has(rows.countAi, /class="lbRemove"/) && !has(rows.countMe, /<select/), 'during the countdown the host\'s computer rows keep their lists and REMOVE, while the host\'s own row is frozen', J({ countAi: rows.countAi.slice(0, 160), countMe: rows.countMe.slice(0, 160) }));
  ok(has(rows.local, /data-field="difficulty"/) && has(rows.local, /lbRemove/) && !has(rows.local, /host sets/), 'the skirmish lobby (a room of one) draws its computers the same way, with no "host sets"', rows.local.slice(0, 200));

  const { pass, fail } = counts();
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL the suite threw: ' + (e && e.stack || e)); for (const s of servers) try { s.kill(); } catch (x) { } process.exit(1); });
