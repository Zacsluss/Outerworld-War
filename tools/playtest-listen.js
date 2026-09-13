'use strict';
// THE PLAYTEST LISTENER (ninth session; the user, before their hand playtest: "can you set up a dev listener before I
// test so you can do this?"). A hand playtest used to reach the assistant only as the player's own write-up. This records
// what the player did and what the game did while they played, to disk, so the write-up can be checked against the record.
//
//   node tools/playtest-listen.js [port=8870] [rev=HEAD]        then open http://127.0.0.1:8870 in a browser
//
// What it is: the game and its relay. The relay (the working tree's test/serve.js, read once at start) runs IN THIS
// PROCESS on port+1 and the WebSocket is passed to it untouched, so MULTIPLAYER, the lobby and invite links work as they
// do from PLAY.bat. Two things differ:
//   * the page it hands out loads tools/playtest-client.js first. Nothing in js/, index.html, the desktop app or the
//     relay loads that script; only this listener's page does.
//   * THE GAME IS A COMMIT, NOT THE WORKING TREE. index.html, js/ and assets/ are served out of git at the revision named
//     when the listener started (`git show <rev>:<path>`), so work in progress -- an edit half made, a negative control
//     that breaks a file on purpose for a minute -- never reaches a page someone is playtesting. Restart to serve a newer
//     commit.
//
// Where it writes: .claude/review/playtest/<start time>/ (gitignored, this machine only):
//   events.jsonl  every event the page sent, one JSON object a line (tools/playtest-client.js says what they are)
//   notable.log   the lines worth reading as they happen -- errors, screens, games, notes, stalls -- also printed here and
//                 appended to .claude/review/playtest/notable.log, a fixed path a `tail -f` can follow across sessions
//   replay-<tab>-<game>.json   the game being played, as Replay.data(), refreshed every half minute and at the end
//   shot-<tab>-<n>.jpg         the game canvas at the moment a note was written
//   relay.log     what the relay printed
//
// A DIFFERENT PORT IS A FRESH PLAYER. localStorage belongs to an origin, so http://127.0.0.1:8870 has none of the
// settings, keys or saves of http://localhost:8765 (PLAY.bat): the first-launch name prompt shows, and nothing the
// playtest changes touches the player's normal game.
//
// It binds to 127.0.0.1 only, because it writes what it is sent to disk: nothing on the network can reach it.
const http = require('http'), net = require('net'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const PORT = parseInt(process.argv[2] || '8870', 10), RELAY = PORT + 1;
const REV = (() => { const r = spawnSync('git', ['rev-parse', '--short', process.argv[3] || 'HEAD'], { cwd: root, encoding: 'utf8' }); const s = String(r.stdout || '').trim(); if (r.status !== 0 || !/^[0-9a-f]{4,40}$/.test(s)) { console.error('cannot resolve revision ' + (process.argv[3] || 'HEAD')); process.exit(2); } return s; })();
const CAP = { log: 2 * 1024 * 1024, replay: 48 * 1024 * 1024, shot: 12 * 1024 * 1024 };
const started = new Date(), pad = n => String(n).padStart(2, '0');
const stamp = started.getFullYear() + '-' + pad(started.getMonth() + 1) + '-' + pad(started.getDate()) + '_' + pad(started.getHours()) + '-' + pad(started.getMinutes()) + '-' + pad(started.getSeconds());
const base = path.join(root, '.claude', 'review', 'playtest'), dir = path.join(base, stamp);
fs.mkdirSync(dir, { recursive: true });
const events = fs.createWriteStream(path.join(dir, 'events.jsonl'), { flags: 'a' });
const clock = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
function say(line) {
  const s = clock() + ' ' + line + '\n';
  process.stdout.write(s);
  try { fs.appendFileSync(path.join(dir, 'notable.log'), s); fs.appendFileSync(path.join(base, 'notable.log'), s); } catch (e) { }
}

// ---- the relay, in this process ----
// test/serve.js reads its port from argv[2] and prints with console.log; both are redirected before it loads, so it
// listens where this file wants and its lines go to relay.log instead of into the notable stream.
const relayLog = fs.createWriteStream(path.join(dir, 'relay.log'), { flags: 'a' });
const toRelayLog = (...a) => { try { relayLog.write(clock() + ' ' + a.map(x => typeof x === 'string' ? x : (x && x.stack) || JSON.stringify(x)).join(' ') + '\n'); } catch (e) { } };
console.log = toRelayLog; console.error = toRelayLog; console.warn = toRelayLog;
process.argv[2] = String(RELAY); process.argv.length = 3;
require(path.join(root, 'test', 'serve.js'));

// ---- what the page sends ----
const errorsSeen = new Map();
const brief = (v, n) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > (n || 160) ? s.slice(0, n || 160) + '...' : s; };
function notable(e) {
  const who = 'tab ' + e.tab + (e.load > 1 ? '.' + e.load : '');
  switch (e.t) {
    case 'boot': return say(who + ' BOOT build ' + e.build + ', screen ' + (e.panel || '?') + ', ' + e.w + 'x' + e.h + ' @' + e.dpr + ', ' + brief(e.ua, 80));
    case 'error': case 'console-error': case 'console-warn': case 'resource': case 'alert': {
      const key = e.t + '|' + (e.msg || (e.args && e.args[0]) || e.src || '');
      const n = (errorsSeen.get(key) || 0) + 1; errorsSeen.set(key, n);
      if (n <= 3 || n % 50 === 0) say(who + ' ' + e.t.toUpperCase() + (n > 1 ? ' (x' + n + ')' : '') + ': ' + brief(e.msg || (e.args && e.args.join(' ')) || e.src, 300));
      return;
    }
    case 'panel': return say(who + ' SCREEN ' + e.id);
    case 'game-start': return say(who + ' GAME START ' + brief(e.summary, 300));
    case 'game-over': return say(who + ' GAME OVER at ' + e.clock + ': ' + brief(e.result, 200));
    case 'load': return say(who + ' LOAD ' + e.mode + ' ' + brief(e.info, 200));
    case 'note': return say(who + ' NOTE: "' + brief(e.text, 400) + '" (' + (e.where || '') + ')');
    case 'stall': return say(who + ' STALL: ' + brief(e.what, 300));
    case 'gather': return say(who + ' RIGHT-CLICK ' + e.n + ' ' + e.types + (e.line ? ' (a line)' : '') + ': spread ' + e.spreadBefore + ' px before, ' + e.spreadAfter + ' px after, farthest ' + e.farthestFromPoint + ' px from the point');
    case 'desync': return say(who + ' DESYNC at frame ' + e.f);
    case 'net-error': return say(who + ' NET: ' + brief(e.msg, 200));
    case 'net-status': return say(who + ' NET STATUS: ' + brief(e.text, 200));
    case 'rec': return say(who + ' ' + brief(e.text, 200));
  }
}
const receive = (req, res, kind) => {
  const chunks = []; let size = 0, over = false;
  req.on('data', c => { size += c.length; if (size > CAP[kind]) { over = true; res.writeHead(413); res.end(); req.destroy(); return; } chunks.push(c); });
  req.on('end', () => {
    if (over) return;
    res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end();
    const body = Buffer.concat(chunks).toString('utf8');
    const q = new URL(req.url, 'http://x').searchParams;
    const tab = /^[a-z0-9]{1,12}$/.test(q.get('tab') || '') ? q.get('tab') : 'x', n = parseInt(q.get('n'), 10) | 0;
    try {
      if (kind === 'log') { for (const e of JSON.parse(body)) { if (!e || typeof e !== 'object') continue; events.write(JSON.stringify(e) + '\n'); notable(e); } }
      else if (kind === 'replay') fs.writeFileSync(path.join(dir, 'replay-' + tab + '-' + n + '.json'), body);
      else if (kind === 'shot') { const m = /^data:image\/(jpeg|png);base64,(.*)$/s.exec(body); if (m) fs.writeFileSync(path.join(dir, 'shot-' + tab + '-' + n + '.' + (m[1] === 'png' ? 'png' : 'jpg')), Buffer.from(m[2], 'base64')); }
    } catch (ex) { say('LISTENER could not read a ' + kind + ' post: ' + ex.message); }
  });
};

// ---- the game, out of git ----
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const cache = new Map();
function fromGit(p) {
  if (cache.has(p)) return cache.get(p);
  const r = spawnSync('git', ['show', REV + ':' + p], { cwd: root, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  const out = r.status === 0 ? r.stdout : null;
  cache.set(p, out); return out;
}
const server = http.createServer((req, res) => {
  let u; try { u = decodeURIComponent(String(req.url || '').split('?')[0]); } catch (e) { res.writeHead(400); return res.end('bad request'); }
  if (req.method === 'POST' && u === '/playtest/log') return receive(req, res, 'log');
  if (req.method === 'POST' && u === '/playtest/replay') return receive(req, res, 'replay');
  if (req.method === 'POST' && u === '/playtest/shot') return receive(req, res, 'shot');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (u === '/playtest-client.js') {
    return fs.readFile(path.join(__dirname, 'playtest-client.js'), (err, d) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' }); res.end(d); });
  }
  if (u === '/') u = '/index.html';
  // The same three places test/serve.js serves, and nothing that climbs out of them.
  if (!(u === '/index.html' || u.startsWith('/js/') || u.startsWith('/assets/')) || u.includes('..') || u.includes('\\')) { res.writeHead(404); return res.end('not found'); }
  const data = fromGit(u.slice(1));
  if (!data) { res.writeHead(404); return res.end('not found'); }
  let body = data;
  if (u === '/index.html') {
    // First in <head>, so its error hooks are in place before the first game script runs.
    const html = data.toString('utf8'), tag = '<script src="/playtest-client.js"></script>';
    body = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(u)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});
// The WebSocket: the upgrade request is written to the relay as it arrived, then the two sockets are joined.
server.on('upgrade', (req, socket, head) => {
  const up = net.connect(RELAY, '127.0.0.1', () => {
    let h = req.method + ' ' + req.url + ' HTTP/1.1\r\n';
    for (let i = 0; i < req.rawHeaders.length; i += 2) h += req.rawHeaders[i] + ': ' + req.rawHeaders[i + 1] + '\r\n';
    up.write(h + '\r\n'); if (head && head.length) up.write(head);
    socket.pipe(up); up.pipe(socket);
  });
  up.on('error', () => socket.destroy()); socket.on('error', () => up.destroy());
  up.on('close', () => socket.destroy()); socket.on('close', () => up.destroy());
});
server.on('error', e => { say('LISTENER cannot listen on ' + PORT + ': ' + e.message); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => {
  try { fs.appendFileSync(path.join(base, 'notable.log'), '\n'); } catch (e) { }
  say('LISTENING http://127.0.0.1:' + PORT + '  serving commit ' + REV + '  (relay on ' + RELAY + ')  writing ' + path.relative(root, dir));
});
