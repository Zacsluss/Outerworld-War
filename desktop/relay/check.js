// REVIEW-M17 task 28, the one check on the BUILT relay: the single executable answers a room join.
//
// The protocol suites (test/rooms.js, test/net.js, test/net_many.js) keep running against `node test/serve.js`
// and are where the relay's behaviour is pinned. This asks only whether the executable that ships as the
// Tauri sidecar is that relay, alive, listening on the port it was handed, and gone when killed.
//
//   node relay/check.js [path-to-executable]     default: src-tauri/binaries/bw-relay-<host triple>[.exe]
//
// SKIPS -- exit 0 and one clear line -- when the executable is not on disk, so a gate that lists it stays
// green on a machine without a build. Exit 1 on any failure. Node 22+ for the global WebSocket, like rooms.js.
// Negative control (measured, in NOTES.md): pointed at an executable that is not the relay it fails 3 of 5 and exits 1;
// pointed at a path that does not exist it prints SKIP and exits 0.
'use strict';
const fs = require('fs'), path = require('path'), net = require('net'), { spawn, spawnSync } = require('child_process');
if (typeof WebSocket === 'undefined') { console.error('needs Node 22+ (global WebSocket)'); process.exit(2); }
const desktop = path.join(__dirname, '..');
const TRIPLES = { 'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc', 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin', 'linux-x64': 'x86_64-unknown-linux-gnu', 'linux-arm64': 'aarch64-unknown-linux-gnu' };
function hostTriple() { const r = spawnSync('rustc', ['-vV'], { encoding: 'utf8' }); const m = r.status === 0 && /^host: (\S+)/m.exec(r.stdout || ''); return m ? m[1] : TRIPLES[process.platform + '-' + process.arch] || 'unknown'; }
const bin = process.argv[2] ? path.resolve(process.argv[2]) : path.join(desktop, 'src-tauri', 'binaries', 'bw-relay-' + hostTriple() + (process.platform === 'win32' ? '.exe' : ''));
if (!fs.existsSync(bin)) { console.log('SKIP  relay executable not built: ' + bin + '\n      build it with `npm run build:relay` in desktop/ (Node 20+, after `npm install` there); nothing else is affected'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const portOpen = port => new Promise(res => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
// The same recording client test/rooms.js uses: every message kept, the interesting ones picked out.
function client(port) {
  const c = { msgs: [], lobby: null, error: null, hello: null };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'lobby') c.lobby = m; if (m.t === 'error') c.error = m.msg; if (m.t === 'hello') c.hello = m; };
  c.send = o => c.ws.send(JSON.stringify(o));
  c.open = new Promise((r, j) => { c.ws.onopen = r; c.ws.onerror = () => j(new Error('socket error before open on port ' + port)); c.ws.onclose = () => j(new Error('socket closed before open on port ' + port)); setTimeout(() => j(new Error('no open within 10 s on port ' + port)), 10000).unref(); });
  c.open.catch(() => { });
  c.close = () => { try { c.ws.close(); } catch (e) { } };
  return c;
}

(async () => {
  const port = await freePort(), delay = 5;
  console.log('relay executable: ' + bin + '\nport ' + port + ', delay ' + delay);
  const child = spawn(bin, [String(port), String(delay)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '', exited = null;
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
  child.on('exit', (code, signal) => { exited = { code, signal }; }); child.on('error', e => { err += String(e); exited = { code: -1 }; });

  // 1. the ready line serve.js prints from server.listen, and both arguments reached it unchanged
  const t0 = Date.now(); while (!out.includes('http://localhost:') && !exited && Date.now() - t0 < 10000) await sleep(50);
  ok(out.includes('http://localhost:' + port), 'listens on the port it was given (argv[2] means the port inside the executable)', JSON.stringify((out + err).slice(0, 240)));
  ok(out.includes('delay ' + delay + ' frames'), 'the second argument reached the relay as the lockstep delay', JSON.stringify(out.slice(0, 240)));
  ok(!/ExperimentalWarning/.test(err), 'no single-executable warning on stderr (disableExperimentalSEAWarning in the build)', JSON.stringify(err.slice(0, 240)));

  // 2. a room join is answered with the lobby
  let A = null, B = null;
  try {
    A = client(port); await A.open; A.send({ t: 'join', name: 'Alice', race: 'T', room: 'ABCD' }); await sleep(300);
    ok(A.hello && A.hello.rooms === true, 'hello announces that it speaks rooms', JSON.stringify(A.hello));
    ok(A.lobby && A.lobby.room === 'ABCD' && A.lobby.players.length === 1 && A.lobby.players[0].name === 'Alice' && A.lobby.players[0].host === true, 'the join is answered with the lobby: room ABCD, Alice as its host', JSON.stringify(A.lobby));
    // 3. and it is THIS relay (REVIEW-M17 decision 4), not any WebSocket server: a three-letter code is refused with its own words
    B = client(port); await B.open; B.send({ t: 'join', name: 'Bob', race: 'Z', room: 'ABC' }); await sleep(300);
    ok(/at least 4/.test(String(B.error)) && !B.lobby, 'a code shorter than four characters is refused with the relay\'s own message', JSON.stringify(B.error));
  } catch (e) { ok(false, 'a client could connect and join', String(e && e.message || e)); }
  if (A) A.close(); if (B) B.close(); await sleep(100);

  // 4. killed -- what the wrapper does when the window closes -- it is gone and the port is free
  child.kill(); const t1 = Date.now(); while (!exited && Date.now() - t1 < 5000) await sleep(50);
  ok(!!exited && !(await portOpen(port)), 'killed, the process exits and nothing listens on the port', JSON.stringify(exited));

  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
