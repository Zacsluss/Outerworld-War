// RATINGS AND SKILL-BALANCED TEAMS (ninth session, queue item C; the user: "build this now"). RESEARCH-LOBBY.md section 10 is
// the research: Beyond All Reason's lobby server Teiserver and the OpenSkill (Weng-Lin) libraries, read from source.
//   node test/ratings.js [port=8890]      (uses port .. port+2)
//
// MATH (test/serve.js's RATING MATH block, cut out and run on its own):
//   1. Plackett-Luce reproduces the published vectors of openskill.js, openskill.py and BAR's openskill.ex to 1e-9
// RELAY (real sockets):
//   2. a lobby says whether it would be rated and why not, and shows each player's match rating
//   3. a duel whose players agree on the end is rated: the numbers are the maths', written to BW_RATINGS, shown next time,
//      and still there after the relay restarts
//   4. what is not rated: a disagreement, a short game, computers, uneven teams, one browser twice, cheats, ratings off
//   5. a game walked out of is a forfeit to the side that stayed; two sides leaving together is nothing; a seat with a key
//      is rejoined only by its browser
//   6. a 2v2 is rated as a team game
//   7. BALANCE TEAMS: the fairest split by Teiserver's score, host only, not with computers, and not the same split every time
// CLIENT (the page in a VM):
//   8. the browser's key, sent with every join; ratings, the Rated row and BALANCE TEAMS in the lobby; the game list's detail;
//      a rated result in the log and on the end screen
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), vm = require('vm'), crypto = require('crypto'), { spawn } = require('child_process');
const { ok, counts, mkDom, root } = require('./_harness');
const PORT = parseInt(process.argv[2] || '8890', 10);
const J = v => JSON.stringify(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------- the maths, on its own
const SRC = fs.readFileSync(path.join(__dirname, 'serve.js'), 'utf8');
const math = (() => { const a = SRC.indexOf('// RATING MATH BEGIN'), b = SRC.indexOf('// RATING MATH END'); const c = { Math }; vm.createContext(c); vm.runInContext(SRC.slice(a, b) + '\nthis.PL = plackettLuce; this.OS = OS; this.MR = matchRating; this.kindOf = kindOf;', c); return c; })();
const PL = math.PL, D = () => ({ mu: 25, sigma: 25 / 3 });

console.log('--- 1. the maths ---');
{
  const near = (g, w) => { const f = g.flat().flatMap(r => [r.mu, r.sigma]); return f.length === w.length && f.every((v, i) => Math.abs(v - w[i]) < 1e-9); };
  ok(near(PL([[D()], [D()]], [1, 2], { tau: 0, limitSigma: false }), [27.63523138347365, 8.065506316323548, 22.36476861652635, 8.065506316323548]), '1v1 at the defaults with no tau is openskill.js\'s published result', '');
  ok(near(PL([[D(), D(), D()], [D()], [D(), D()]], [1, 2, 3], { tau: 0, limitSigma: false }), [25.939870821784513, 8.247641552260456, 25.939870821784513, 8.247641552260456, 25.939870821784513, 8.247641552260456, 27.21366020491262, 8.274321317985242, 21.84646897330287, 8.213058173195341, 21.84646897330287, 8.213058173195341]), 'three teams of three, one and two', '');
  ok(near(PL([[D(), D()], [D(), D()]], [1, 2], { tau: 25 / 300, limitSigma: false }), [26.964294621803063, 8.177962604389991, 26.964294621803063, 8.177962604389991, 23.035705378196937, 8.177962604389991, 23.035705378196937, 8.177962604389991]), 'a 2v2 with openskill.py\'s default tau', '');
  ok(near(PL([[{ mu: 40, sigma: 3 }], [{ mu: -20, sigma: 3 }]], [1, 2], { tau: 0.3, limitSigma: true }), [40.00032667136128, 3, -20.000326671361275, 3]), 'tau with sigma kept from rising (openskill.js limitSigma)', '');
  ok(near(PL([[{ mu: 6.672, sigma: 0.0001 }], [{ mu: 29.182, sigma: 4.782 }]], [1, 2], { tau: 0.01, limitSigma: true }), [6.672012533190158, 0.0001, 26.316243774876106, 4.7540633621019]), 'BAR\'s own openskill.ex test: an upset with prevent_sigma_increase', '');
  const tie = PL([[D()], [D()], [D()]], [1, 2, 2], { tau: 0, limitSigma: false });
  ok(Math.abs(tie[1][0].mu - tie[2][0].mu) < 1e-12 && tie[0][0].mu > 25 && tie[1][0].mu < 25, 'two losers sharing a rank are updated alike', J(tie));
  ok(math.MR({ mu: 25, sigma: 25 / 3 }).toFixed(2) === '16.67' && math.MR({ mu: 3, sigma: 5 }) === 0 && math.kindOf([1, 1]) === 'duel' && math.kindOf([2, 2]) === 'team' && math.kindOf([1, 1, 1]) === 'ffa' && math.kindOf([4]) === null,
    'the shown number is BAR\'s match rating, skill minus uncertainty and never below zero; duel, team and free-for-all', '');
}

// ---------------------------------------------------------------------------------------------- the relay
const servers = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-ratings-'));
function serve(port, env) {
  const s = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(port), '3'], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { BW_COUNTDOWN: '0', BW_READY: '0', BW_LOBBY_PING: '60000', BW_MSG_RATE: '100000', BW_FORFEIT_MS: '400', BW_RATINGS: path.join(tmp, 'ratings.json') }, env || {}) });
  s.out = []; s.stdout.on('data', d => s.out.push(String(d))); s.stderr.on('data', d => s.out.push(String(d)));
  servers.push(s); return s;
}
// Wait for the relay to say it is listening, rather than guessing how long a spawn takes on a busy machine.
const ready = async s => { for (let i = 0; i < 100 && !s.out.join('').includes('http://localhost:'); i++) await sleep(50); };
const killAll = () => { for (const s of servers) { try { s.kill(); } catch (e) { } } };
process.on('exit', () => { killAll(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { } });
const newKey = () => crypto.randomBytes(16).toString('hex');
const hashOf = k => crypto.createHash('sha256').update(k).digest('hex').slice(0, 24);
// The ratings file as the relay left it; a missing or broken one reads as empty, so a check says what is wrong instead of the suite throwing.
const readStore = () => { try { const o = JSON.parse(fs.readFileSync(path.join(tmp, 'ratings.json'), 'utf8')); return o && o.players ? o : { version: 1, players: {}, games: [] }; } catch (e) { return { version: 1, players: {}, games: [] }; } };
function client(port, name, key) {
  const c = { name, key, msgs: [], lobby: null, errors: [], sys: [], rated: [], closed: false };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'lobby') c.lobby = m; if (m.t === 'error') c.errors.push(m); if (m.t === 'sys') c.sys.push(m); if (m.t === 'rated') c.rated.push(m); };
  c.ws.onclose = () => { c.closed = true; };
  c.send = o => { try { c.ws.send(J(o)); } catch (e) { } };
  c.open = new Promise(r => { c.ws.onopen = () => r(true); c.ws.onerror = () => r(false); });
  c.join = (room, extra) => c.send(Object.assign({ t: 'join', name, race: 'T', room }, key ? { key } : {}, extra || {}));
  return c;
}
const who = (c, name) => c.lobby && c.lobby.players.find(p => p.name === name);
// Batches every 20 frames up to `to`, from every player still in the game: inside the relay's window, so the room's clock moves.
const play = async (cs, to) => { for (let f = 0; f <= to; f += 20) for (const c of cs) c.send({ t: 'cmds', f, c: [] }); await sleep(300); };
async function room(port, code, players, opts) {
  opts = opts || {};
  const cs = players.map(([n, k]) => client(port, n, k)); await Promise.all(cs.map(c => c.open));
  for (const c of cs) { c.join(code); await sleep(120); }
  if (opts.teams) { cs.forEach((c, i) => c.send({ t: 'set', team: opts.teams[i] })); await sleep(200); }
  return cs;
}

(async () => {
  if (typeof WebSocket === 'undefined') { console.log('FAIL needs Node 22+ (global WebSocket)'); process.exit(1); }
  const R = serve(PORT); await ready(R);
  const said = re => re.test(R.out.join(''));
  const ka = newKey(), kb = newKey();

  console.log('--- 2. the lobby ---');
  const [A, B] = await room(PORT, 'DUEL', [['Ada', ka], ['Ben', kb]]);
  ok(A.lobby.rated && A.lobby.rated.kind === 'duel' && who(A, 'Ada').rating === 16.7 && who(A, 'Ben').rating === 16.7 && who(A, 'Ada').games === 0,
    'a lobby of two players with keys, one a side, would be a rated duel, and shows each new player\'s match rating of 16.7', J(A.lobby.rated) + J(A.lobby.players));

  console.log('--- 3. a rated duel ---');
  A.send({ t: 'start' }); await sleep(300);
  await play([A, B], 2400);
  const teamA = who(A, 'Ada').team;
  A.send({ t: 'over', f: 2400, team: teamA }); B.send({ t: 'over', f: 2400, team: teamA }); await sleep(400);
  const expect = PL([[D()], [D()]], [1, 2]);
  const rm = A.rated[0], ch = rm && Object.fromEntries(rm.changes.map(x => [x.name, x]));
  ok(rm && rm.kind === 'duel' && rm.how === 'agreed' && ch.Ada.won && !ch.Ben.won && ch.Ada.before === 16.7 && ch.Ada.after === +math.MR(expect[0][0]).toFixed(1) && ch.Ben.after === +math.MR(expect[1][0]).toFixed(1) && B.rated.length === 1,
    'both players agree Ada won: the duel is rated, and each sees the match ratings the maths gives (16.7 to ' + math.MR(expect[0][0]).toFixed(1) + ' and ' + math.MR(expect[1][0]).toFixed(1) + ')', J(rm));
  const file = readStore();
  const ra = file.players[hashOf(ka)] && file.players[hashOf(ka)].duel;
  ok(ra && Math.abs(ra.mu - expect[0][0].mu) < 1e-9 && Math.abs(ra.sigma - expect[0][0].sigma) < 1e-9 && ra.games === 1 && ra.wins === 1 && !JSON.stringify(file).includes(ka) && file.games.length === 1,
    'BW_RATINGS holds the new skill and uncertainty under the key\'s hash -- never the key itself -- and the game', J(ra));
  A.send({ t: 'back' }); B.send({ t: 'back' }); await sleep(400);
  ok(who(A, 'Ada').rating === +math.MR(expect[0][0]).toFixed(1) && who(A, 'Ada').games === 1, 'back in the lobby, the new rating is on the slot', J(who(A, 'Ada')));
  for (const c of [A, B]) c.ws.close();
  await sleep(200); R.kill(); await sleep(400);
  const R2 = serve(PORT); await ready(R2);
  const [A2] = await room(PORT, 'AGAIN', [['Ada', ka]]);
  ok(who(A2, 'Ada').rating === +math.MR(expect[0][0]).toFixed(1), 'and after the relay restarts, the rating is read back from the file', J(who(A2, 'Ada')));
  A2.ws.close(); await sleep(150);

  console.log('--- 4. not rated ---');
  const unrated = async (code, players, setup, note) => {
    const cs = await room(PORT, code, players, setup);
    const why = cs[0].lobby.rated && cs[0].lobby.rated.why;
    return { cs, why };
  };
  {
    const [C1, C2] = await room(PORT, 'DISAGREE', [['Cy', newKey()], ['Di', newKey()]]);
    C1.send({ t: 'start' }); await sleep(300); await play([C1, C2], 2400);
    C1.send({ t: 'over', f: 2400, team: who(C1, 'Cy').team }); C2.send({ t: 'over', f: 2400, team: who(C1, 'Di').team }); await sleep(400);
    ok(!C1.rated.length && !C2.rated.length, 'two players who disagree on who won are not rated', J(C1.rated));
    for (const c of [C1, C2]) c.ws.close();
  }
  {
    const [S1, S2] = await room(PORT, 'SHORT', [['Sal', newKey()], ['Sam', newKey()]]);
    S1.send({ t: 'start' }); await sleep(300); await play([S1, S2], 600);
    const t = who(S1, 'Sal').team; S1.send({ t: 'over', f: 600, team: t }); S2.send({ t: 'over', f: 600, team: t }); await sleep(400);
    ok(!S1.rated.length && S1.sys.some(m => m.ev === 'unrated' && /90 seconds/.test(m.why)), 'a game shorter than ninety seconds is not rated, and the room is told why', J(S1.sys.slice(-2)));
    for (const c of [S1, S2]) c.ws.close();
  }
  {
    const { cs, why } = await unrated('WITHAI', [['Al', newKey()]]);
    cs[0].send({ t: 'addai', team: 2 }); await sleep(250);
    ok(cs[0].lobby.rated.why === 'computers are playing', 'with a computer in the game, the lobby says it will not be rated, and why', J(cs[0].lobby.rated));
    cs[0].ws.close();
  }
  {
    const { cs } = await unrated('UNEVEN', [['U1', newKey()], ['U2', newKey()], ['U3', newKey()]], { teams: [1, 1, 2] });
    ok(cs[0].lobby.rated.why === 'the teams are uneven', 'two against one is not rated', J(cs[0].lobby.rated));
    for (const c of cs) c.ws.close();
  }
  {
    const k = newKey(); const { cs } = await unrated('TWICE', [['T1', k], ['T2', k]]);
    ok(cs[0].lobby.rated.why === 'two players share one browser', 'one browser in two seats is not rated', J(cs[0].lobby.rated));
    for (const c of cs) c.ws.close();
  }
  await sleep(200);
  {
    const RC = serve(PORT + 1, { BW_CHEATS: '1' }); await ready(RC);
    const [X1] = await room(PORT + 1, 'CHEAT', [['X1', newKey()], ['X2', newKey()]]);
    ok(X1.lobby.rated.why === 'cheats are on', 'a relay with cheats on rates nothing', J(X1.lobby.rated));
    X1.ws.close(); RC.kill();
    const RO = serve(PORT + 2, { BW_RATINGS: 'off' }); await ready(RO);
    const [O1] = await room(PORT + 2, 'RATEOFF', [['O1', newKey()], ['O2', newKey()]]);
    ok(O1.lobby.rated.why === 'ratings are off on this server' && !('rating' in who(O1, 'O1')), 'BW_RATINGS=off rates nothing and shows no ratings', J(O1.lobby));
    O1.ws.close(); RO.kill();
  }

  console.log('--- 5. walking out ---');
  {
    const kf = newKey(), kg = newKey();
    const [F1, F2] = await room(PORT, 'FORFEIT', [['Fay', kf], ['Gus', kg]]);
    F1.send({ t: 'start' }); await sleep(300); await play([F1, F2], 2400);
    F2.ws.close(); await sleep(700);
    F1.send({ t: 'back' }); await sleep(400);
    const fr = F1.rated[0], fc = fr && Object.fromEntries(fr.changes.map(x => [x.name, x]));
    ok(fr && fr.how === 'forfeit' && fc.Fay.won && !fc.Gus.won, 'a player who walks out of a rated duel loses it: the one who stayed longer wins by forfeit when the game ends', J(fr));
    F1.ws.close();
  }
  {
    const [H1, H2] = await room(PORT, 'TOGETHER', [['Hal', newKey()], ['Ivy', newKey()]]);
    H1.send({ t: 'start' }); await sleep(300); await play([H1, H2], 2400);
    H1.send({ t: 'back' }); H2.send({ t: 'back' }); await sleep(400);
    ok(!H1.rated.length, '...but two sides leaving together is no result at all', J(H1.rated));
    for (const c of [H1, H2]) c.ws.close();
  }
  {
    const kr = newKey();
    const [J1, J2] = await room(PORT, 'REJOIN', [['Jo', kr], ['Kai', newKey()]]);
    J1.send({ t: 'start' }); await sleep(300); await play([J1, J2], 100);
    J1.ws.close(); await sleep(400);
    const imp = client(PORT, 'Jo', newKey()); await imp.open; imp.join('REJOIN'); await sleep(400);
    const real = client(PORT, 'Jo', kr); await real.open; real.join('REJOIN'); await sleep(600);
    ok(imp.errors.some(e => /no dropped player is called Jo/.test(e.msg)) && /Jo rejoined as player 0/.test(R2.out.join('')) && !real.errors.length, 'a dropped seat with a key is rejoined only from its own browser, not by anyone typing the name', J({ imp: imp.errors, real: real.msgs.map(m => m.t) }));
    for (const c of [J2, imp, real]) c.ws.close();
  }

  console.log('--- 6. a team game ---');
  {
    const keys = [newKey(), newKey(), newKey(), newKey()];
    const cs = await room(PORT, 'TEAMS', [['P1', keys[0]], ['P2', keys[1]], ['P3', keys[2]], ['P4', keys[3]]], { teams: [1, 1, 2, 2] });
    ok(cs[0].lobby.rated.kind === 'team', 'two against two is a rated team game', J(cs[0].lobby.rated));
    cs[0].send({ t: 'start' }); await sleep(300); await play(cs, 2400);
    for (const c of cs) c.send({ t: 'over', f: 2400, team: 2 }); await sleep(400);
    const tr = cs[0].rated[0], want = PL([[D(), D()], [D(), D()]], [2, 1]);
    const byName = tr && Object.fromEntries(tr.changes.map(x => [x.name, x]));
    ok(tr && tr.kind === 'team' && byName.P3.won && byName.P4.won && !byName.P1.won && byName.P3.after === +math.MR(want[1][0]).toFixed(1) && byName.P1.after === +math.MR(want[0][0]).toFixed(1),
      'team 2 wins: both its players rise and both of team 1\'s fall, by the 2v2 maths', J(tr));
    for (const c of cs) c.ws.close();
  }

  console.log('--- 7. balance teams ---');
  {
    // four players with known ratings, written into the file before a relay reads it
    R2.kill(); await sleep(400);
    const store = readStore();
    const bk = [newKey(), newKey(), newKey(), newKey()], mrs = [30, 20, 18, 10];
    bk.forEach((k, i) => { store.players[hashOf(k)] = { name: 'B' + i, team: { mu: mrs[i] + 2, sigma: 2, games: 20, wins: 10 } }; });
    fs.writeFileSync(path.join(tmp, 'ratings.json'), JSON.stringify(store));
    const R3 = serve(PORT); await ready(R3);
    const cs = await room(PORT, 'BALANCE', [['B0', bk[0]], ['B1', bk[1]], ['B2', bk[2]], ['B3', bk[3]]], { teams: [1, 1, 2, 2] });
    cs[1].send({ t: 'balance' }); await sleep(250);
    const teamsOf = c => ['B0', 'B1', 'B2', 'B3'].map(n => who(c, n).team);
    ok(J(teamsOf(cs[0])) === J([1, 1, 2, 2]), 'only the host balances', J(teamsOf(cs[0])));
    cs[0].send({ t: 'balance' }); await sleep(300);
    const t = teamsOf(cs[0]), bal = cs[0].sys.filter(m => m.ev === 'balance').pop();
    ok(t[0] === t[3] && t[1] === t[2] && t[0] !== t[1] && bal && bal.diff === 2 && bal.teams === 2,
      'the host\'s BALANCE TEAMS puts the 30 with the 10 against the 20 and the 18 -- a difference of 2, the fairest there is -- and says so', J({ t, bal }));
    cs[0].send({ t: 'addai', team: 1 }); await sleep(250); cs[0].send({ t: 'balance' }); await sleep(250);
    ok(cs[0].errors.some(e => /computers have no rating/.test(e.msg)), 'with a computer in the lobby it refuses, and says why', J(cs[0].errors));
    for (const c of cs) c.ws.close(); await sleep(200);
    // four equal players: every split is as fair, so Teiserver's fuzz should deal more than one of them
    const ek = [newKey(), newKey(), newKey(), newKey()];
    const es = await room(PORT, 'EQUAL', [['E0', ek[0]], ['E1', ek[1]], ['E2', ek[2]], ['E3', ek[3]]], { teams: [1, 1, 2, 2] });
    const seen = new Set();
    for (let i = 0; i < 12; i++) { es[0].send({ t: 'balance' }); await sleep(120); const tt = ['E0', 'E1', 'E2', 'E3'].map(n => who(es[0], n).team); seen.add(tt.map(x => x === tt[0] ? 'a' : 'b').join('')); }
    ok(seen.size >= 2, 'four equal players pressed twelve times get more than one split: the fuzz keeps the same split from coming back every time', J([...seen]));
    for (const c of es) c.ws.close();
    R3.kill();
  }
  killAll();

  // ---------------------------------------------------------------------------------------------- the client
  console.log('--- 8. the page ---');
  {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const FILES = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build', 'snapshot', 'audio', 'net', 'terrain', 'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'editor', 'ui'];
    const store = { bw_net: J({ name: 'Zac', url: '', race: 'R' }), bw_intro: '1' };
    const document = mkDom(html), loaded = [], sockets = [];
    function WebSocket(url) { this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); }
    WebSocket.prototype.send = function (s) { this.sent.push(JSON.parse(s)); };
    WebSocket.prototype.close = function () { this.readyState = 3; };
    const c = { console: { log() { }, warn() { }, error() { } }, Math, JSON, performance, setTimeout, clearTimeout, setInterval() { return 1; }, clearInterval() { }, requestAnimationFrame() { }, Image: function () { }, WebSocket, navigator: {}, crypto: { getRandomValues: a => crypto.randomFillSync(a) },
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') loaded.push(fn); }, removeEventListener() { },
      localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
      location: { protocol: 'http:', host: 'play.example:8765', origin: 'http://play.example:8765', pathname: '/', search: '' }, history: { replaceState() { } }, document };
    c.window = c; c.globalThis = c; vm.createContext(c);
    for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
    vm.runInContext('UI.init = () => {}; UI.makeTicker = () => 1; Render.reset = () => {};', c);
    for (const fn of loaded) fn();
    const $ = id => document.getElementById(id), Rn = src => vm.runInContext('(() => {' + src + '})()', c);
    const k1 = Rn('return Net.identityKey();'), k2 = Rn('return Net.identityKey();');
    ok(/^[0-9a-f]{32}$/.test(k1) && k1 === k2 && store.bw_id === k1, 'the browser makes its key once, keeps it in bw_id, and gives the same one after', J({ k1, k2 }));
    $('multiBtn').click();
    const s = sockets[sockets.length - 1]; s.onopen();
    s.onmessage({ data: J({ t: 'hello', id: 7, state: 'lobby', rooms: true, browser: true }) });
    Rn('Net.host("Test"); Net.join("ABCD12", true); Net.join("WXYZ99", true, true);');
    const joins = s.sent.filter(m => m.t === 'join');
    ok(joins.length === 3 && joins.every(m => m.key === k1), 'hosting, joining and spectating all send it', J(joins));
    const lobby = { t: 'lobby', room: 'ROOM42', title: 'T', listed: true, state: 'lobby', speed: 6, layout: 'temple', cap: 4, rules: {}, specs: [], readyCheck: true, rated: { shown: 'duel', kind: 'duel' },
      players: [{ id: 7, name: 'Zac', race: 'T', team: 1, host: true, rating: 19.6, games: 3 }, { id: 8, name: 'Bo', race: 'Z', team: 2, rating: 14.3, games: 1 }] };
    s.onmessage({ data: J(lobby) });
    const h = $('lobby').innerHTML;
    ok(/<span class="lbRating" title="Match rating for Duel games: skill minus uncertainty, after 3 rated games">19\.6<\/span>/.test(h) && /14\.3<\/span>/.test(h), 'each player\'s match rating is on their slot, with what it means', (h.match(/lbRating[^<]*<\/span>/g) || []).join(' | '));
    ok(/<label>Rated<\/label><span>Yes &mdash; Duel<\/span>/.test(h) && /id="lbBalance"/.test(h), 'the settings column says the game will be a rated duel, and the host has BALANCE TEAMS', (h.match(/<label>Rated[\s\S]{0,60}/) || [''])[0]);
    s.onmessage({ data: J(Object.assign({}, lobby, { rated: { shown: 'duel', why: 'computers are playing' } })) });
    ok(/<label>Rated<\/label><span>No &mdash; computers are playing<\/span>/.test($('lobby').innerHTML), '...or that it will not be, and why', '');
    const sent0 = s.sent.length; $('lobby').querySelector('#lbBalance').click();
    ok(s.sent.slice(sent0).some(m => m.t === 'balance'), 'BALANCE TEAMS asks the relay to balance', J(s.sent.slice(sent0)));
    s.onmessage({ data: J({ t: 'rated', kind: 'duel', how: 'agreed', changes: [{ name: 'Zac', won: true, before: 16.7, after: 19.6 }, { name: 'Bo', won: false, before: 16.7, after: 14.3 }] }) });
    ok(/Duel rating: Zac 16\.7 → 19\.6, Bo 16\.7 → 14\.3\./.test($('lobby').innerHTML), 'a rated result is written in the lobby\'s log', ($('lobby').innerHTML.match(/Duel rating[^<]*/) || [''])[0]);
    const over = Rn('Net.startGame({ seed: 5, layout: "temple", you: 0, delay: 3, players: [{ name: "Zac", race: "T", team: 1, human: true }, { name: "Bo", race: "Z", team: 2, human: true }] }); Net.handle({ t: "rated", kind: "duel", how: "forfeit", changes: [{ name: "Zac", won: true, before: 19.6, after: 21 }] }); UI.menu = "over"; return UI.menuItems().lines;');
    ok(over.some(l => /Duel rating \(a forfeit\): Zac 19\.6 → 21\.0\./.test(l)), '...and on the end screen of the game it rated', J(over));
    const detail = Rn('Net.lobby = null; Net.browsing = true; Net.connected = true; Net.pick = "RUN1"; Net.handle({ t: "lobbies", online: 2, rooms: [{ code: "RUN1", title: "R", host: "H", players: 2, humans: 2, cap: 4, state: "lobby", layout: "temple", rated: "team", avg: 18.25 }] }); return document.getElementById("lobby").innerHTML;');
    ok(/<label>Rated<\/label><span>Team, players average 18\.3<\/span>/.test(detail) || /<label>Rated<\/label><span>Team, players average 18\.2<\/span>/.test(detail), 'the game list\'s detail says a game is rated and how strong its players are', (detail.match(/<label>Rated[\s\S]{0,60}/) || [''])[0]);
  }

  const { pass, fail } = counts();
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); killAll(); process.exit(1); });
