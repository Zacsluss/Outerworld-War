// REVIEW-M17 task 28, the whole path in a real window, on Windows: the built wrapper opens on its page, the page
// shows HOST A GAME, pressing it starts the sidecar on a free port and joins it, a second player joins that port
// from OUTSIDE the app, STOP HOSTING kills the relay, closing the window kills a running relay with it -- and,
// in a second session, so does a hard kill of the app (Task Manager, a crash): the Job Object in main.rs.
//
// It drives the page over WebView2's DevTools protocol -- WebView2 opens one when the environment variable
// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS names a --remote-debugging-port -- so there is no screenshot and no
// clicking by hand; the window does open on screen for the fifteen seconds or so this takes. The close is
// WM_CLOSE posted to the window found by its title, the path a click on the X takes, because that is what the
// Rust side's Destroyed/Exit handlers answer to. (Process.CloseMainWindow() was tried first and posted to the
// wrong window one run in two.) The hard kill is TerminateProcess, which runs no handler at all.
//
//   node window-check.js [path-to-bw-desktop.exe]     default: src-tauri/target/debug/bw-desktop.exe, then release
//
// SKIPS (exit 0) off Windows and when no wrapper executable is built. Node 22+ (global WebSocket).
'use strict';
const fs = require('fs'), path = require('path'), net = require('net'), http = require('http'), { spawn, spawnSync } = require('child_process');
if (process.platform !== 'win32') { console.log('SKIP  window-check drives WebView2 over its DevTools port; this is ' + process.platform); process.exit(0); }
if (typeof WebSocket === 'undefined') { console.error('needs Node 22+ (global WebSocket)'); process.exit(2); }
const candidates = process.argv[2] ? [path.resolve(process.argv[2])] : ['debug', 'release'].map(p => path.join(__dirname, 'src-tauri', 'target', p, 'bw-desktop.exe'));
const exe = candidates.find(p => fs.existsSync(p));
if (!exe) { console.log('SKIP  no wrapper executable at ' + candidates.join(' or ') + '\n      build one: npm run build:relay, npm run build:dist, then `cargo build` in desktop/src-tauri'); process.exit(0); }
const TITLE = 'Brood War Remake';   // tauri.conf.json app.windows[0].title

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const portOpen = port => new Promise(res => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
const getJson = url => new Promise((res, rej) => http.get(url, r => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const until = async (fn, ms) => { const t = Date.now(); let v; while (!(v = await fn()) && Date.now() - t < ms) await sleep(200); return v; };
// WM_CLOSE to the window with our title, through user32 from PowerShell; -EncodedCommand sidesteps every quoting
// rule. The class argument is an IntPtr zero, not $null: PowerShell binds $null to a string parameter as "", and
// FindWindowW("", title) looks for a window of class "" and finds nothing (measured -- one run failed on it).
function postClose() {
  const script = "Add-Type -Namespace W -Name U -MemberDefinition '[DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowW(IntPtr c, string t); [DllImport(\"user32.dll\")] public static extern bool PostMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);'; $h = [W.U]::FindWindowW([IntPtr]::Zero, '" + TITLE + "'); if ($h -eq [IntPtr]::Zero) { 'nowindow' } else { [W.U]::PostMessageW($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) }";
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}
// A DevTools session on the game page: numbered requests, awaited replies, one helper that evaluates an expression.
function devtools(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const waiting = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
  const open = new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('devtools socket error')); });
  const call = (method, params) => new Promise(r => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evaluate = async expression => {
    const m = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (m.result && m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.text + ' ' + JSON.stringify(m.result.exceptionDetails.exception && m.result.exceptionDetails.exception.description));
    return m.result && m.result.result ? m.result.result.value : undefined;
  };
  const quiet = async expression => { try { return await evaluate(expression); } catch (e) { return undefined; } };
  return { open, evaluate, quiet, close: () => { try { ws.close(); } catch (e) { } } };
}
// The recording client test/rooms.js and relay/check.js use.
function client(port) {
  const c = { msgs: [], lobby: null, error: null };
  c.ws = new WebSocket('ws://localhost:' + port + '/ws');
  c.ws.onmessage = ev => { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'lobby') c.lobby = m; if (m.t === 'error') c.error = m.msg; };
  c.send = o => c.ws.send(JSON.stringify(o));
  c.open = new Promise((r, j) => { c.ws.onopen = r; c.ws.onerror = () => j(new Error('socket error before open on port ' + port)); c.ws.onclose = () => j(new Error('socket closed before open on port ' + port)); setTimeout(() => j(new Error('no open within 10 s')), 10000).unref(); });
  c.open.catch(() => { });
  c.close = () => { try { c.ws.close(); } catch (e) { } };
  return c;
}
// Start the wrapper with a DevTools port, find its page, open a session, wait for the menu to be wired.
async function launch(label) {
  const dbg = await freePort();
  const app = spawn(exe, [], { env: Object.assign({}, process.env, { WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + dbg }), stdio: ['ignore', 'pipe', 'pipe'] });
  const s = { app, out: '', err: '', exited: null, dt: null };
  app.stdout.on('data', d => { s.out += d; }); app.stderr.on('data', d => { s.err += d; });
  app.on('exit', code => { s.exited = { code }; }); app.on('error', e => { s.err += String(e); s.exited = { code: -1 }; });
  const page = await until(async () => { if (s.exited) return null; try { const list = await getJson('http://127.0.0.1:' + dbg + '/json'); return list.find(p => p.type === 'page' && /tauri\.localhost/.test(p.url)) || null; } catch (e) { return null; } }, 20000);
  ok(!!page, label + ': the wrapper opens a window on its bundled page (http://tauri.localhost)', page ? page.url : (s.out + s.err).slice(0, 300));
  if (!page) return s;
  s.dt = devtools(page.webSocketDebuggerUrl); await s.dt.open;
  ok(await until(() => s.dt.quiet("typeof Desktop !== 'undefined' && Desktop.active === true && document.getElementById('netHost').style.display === ''"), 10000), label + ': window.__TAURI__ is present and the HOST A GAME button is shown');
  return s;
}
// The name is the one asked for at first launch (Net.loadIdentity, localStorage bw_net) -- the page has had no name or room
// field beside HOST A GAME since the eighth session's menus; the relay makes the room's code.
const hostAndGetPort = async s => { await s.dt.evaluate("localStorage.setItem('bw_net', JSON.stringify({ name: 'Alice', url: '', race: 'T' })); document.getElementById('netHost').click(); true"); return until(() => s.dt.quiet('Desktop.hosting ? Desktop.hosting.port : 0'), 15000); };
const finish = () => { console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
const cleanup = s => { if (s && !s.exited) { try { postClose(); } catch (e) { } setTimeout(() => { if (!s.exited) s.app.kill(); }, 1500); } };

(async () => {
  console.log('wrapper: ' + exe);
  // ======================================================================================================
  // Session 1: the ordinary life of a hosted game, ending with the window closed the way the X closes it
  // ======================================================================================================
  const s = await launch('session 1');
  if (!s.dt) { cleanup(s); return finish(); }
  const dt = s.dt;

  // The CSP is measured, not read: on Windows Tauri v2 delivers it as a response header on http://tauri.localhost
  // (no meta tag to inspect). An inline <script> element must be refused -- the policy is enforced -- while eval
  // must work, because Build.parts() reaches the const globals (Net, DATA, ...) through eval(name) and a policy
  // without 'unsafe-eval' would silently drop them from the build stamp (js/build.js).
  const csp = await dt.quiet("new Promise(r => { let v = null; document.addEventListener('securitypolicyviolation', e => { v = e.violatedDirective + ' ' + e.blockedURI; }, { once: true }); const el = document.createElement('script'); el.textContent = 'window.__cspProbe = 1'; document.head.appendChild(el); setTimeout(() => r({ ran: window.__cspProbe === 1, violation: v }), 400); })");
  ok(csp && csp.ran === false && /script-src/.test(String(csp.violation)), 'the CSP is enforced: an inline script element is refused', JSON.stringify(csp));
  ok(await dt.quiet("(function () { try { return eval('1 + 1') === 2; } catch (e) { return false; } })()") === true, 'and eval is allowed under it, so Build.parts() reaches every const global and the stamp matches a browser\'s');
  ok(await dt.quiet("typeof G !== 'undefined' && typeof UI !== 'undefined' && typeof Net !== 'undefined' && !!document.getElementById('multiBtn')") === true, 'the game scripts loaded: G, UI, Net and the main menu\'s Multiplayer button exist');

  // Detailed terrain is the default in the app too (the terrain queue's item 5), and every tileset's textures load from the app's own
  // bundle under its CSP and read back as pixels -- a missing file, a refused load or a tainted image all leave Terrain.texSet() null.
  const tex = await dt.quiet(`(async () => {
    const out = { textured: Terrain.textured, sets: {} }, keep = Terrain.setId;
    for (const id of Object.keys(TERRAIN_TEX)) {
      Terrain.setId = id; let T = null;
      for (let k = 0; k < 150 && !(T = Terrain.texSet()); k++) await new Promise(r => setTimeout(r, 100));
      out.sets[id] = !!T && ['low', 'high', 'ramp', 'rock'].every(p => T[p] && T[p].length === Terrain.TEX_PX * Terrain.TEX_PX * 4);
    }
    Terrain.setId = keep; return out;
  })()`);
  ok(!!tex && tex.textured === true && Object.keys(tex.sets).length === 5 && Object.values(tex.sets).every(Boolean), 'detailed terrain is on by default, and all five tilesets\' textures load inside the app and read back as pixels', JSON.stringify(tex));

  // HOST A GAME: the sidecar starts, the page learns the port and joins its own relay
  const port = await hostAndGetPort(s);
  ok(port > 0, 'HOST A GAME starts the sidecar and the page learns its port', await dt.quiet("document.getElementById('netStatus').textContent"));
  if (!port) { cleanup(s); return finish(); }
  ok(await until(() => dt.quiet("!!(Net.lobby && Net.lobby.room && Net.lobby.players.length === 1 && Net.lobby.players[0].name === 'Alice' && Net.lobby.players[0].host === true)"), 5000), 'the host is in its own lobby on its own relay, as host', await dt.quiet('JSON.stringify(Net.lobby)'));
  const room = await dt.quiet('Net.lobby && Net.lobby.room') || '';
  ok(new RegExp('\\[bw-relay\\] Brood War Remake: http://localhost:' + port).test(s.out), 'the Rust side logged the relay\'s ready line for that port', s.out.slice(-300));
  ok(!/not in a job object/.test(s.err), 'the relay was put in the job object that ties its life to the app\'s', s.err.slice(-300));
  const share = await dt.quiet("document.getElementById('netShare').textContent");
  ok(new RegExp(':' + port + '\\b').test(share) && !!room && share.includes('Room ' + room) && /STOP HOSTING/.test(await dt.quiet("document.getElementById('netHost').textContent")), 'the share line names the port and the room, and the button reads STOP HOSTING', share);

  // a second player joins the sidecar from outside the app
  const B = client(port);
  try { await B.open; B.send({ t: 'join', name: 'Bob', race: 'Z', room, existing: true }); await sleep(500); } catch (e) { ok(false, 'a second player could connect', String(e.message)); }
  ok(B.lobby && B.lobby.players.length === 2 && B.lobby.players.map(p => p.name).join(',') === 'Alice,Bob', 'a second player joins from outside the app and sees both players', JSON.stringify(B.lobby));
  ok(await until(() => dt.quiet('!!(Net.lobby && Net.lobby.players.length === 2)'), 3000), 'the host sees the second player arrive');
  B.close(); await sleep(200);

  // STOP HOSTING kills the relay
  await dt.evaluate("document.getElementById('netHost').click(); true");
  ok(await until(async () => !(await portOpen(port)), 5000), 'STOP HOSTING: nothing listens on the port any more');
  ok(await dt.quiet("Desktop.hosting === null && document.getElementById('netHost').textContent") === 'HOST A GAME', 'and the button reads HOST A GAME again');

  // hosting again, then closing the window the way the X does: the relay dies with the app
  const port2 = await hostAndGetPort(s);
  ok(port2 > 0 && port2 !== port && await portOpen(port2), 'hosting again gives a live relay on a fresh port', String(port2));
  dt.close();
  const posted = postClose();
  await until(async () => !!s.exited, 10000);
  ok(posted === 'True' && !!s.exited, 'WM_CLOSE to the window by its title: the window closes and the process exits', 'PostMessage said ' + JSON.stringify(posted) + (s.exited ? '' : ', still running'));
  await sleep(500);
  ok(!(await portOpen(port2)), 'closing the app killed the relay with it: nothing listens on its port');
  if (!s.exited) s.app.kill();

  // ======================================================================================================
  // Session 2: the app dies without a word (TerminateProcess -- Task Manager, a crash). No handler runs;
  // only the Job Object can take the relay down, and it must.
  // ======================================================================================================
  const s2 = await launch('session 2');
  if (!s2.dt) { cleanup(s2); return finish(); }
  const port3 = await hostAndGetPort(s2);
  ok(port3 > 0 && await portOpen(port3), 'session 2: hosting gives a live relay', String(port3));
  s2.dt.close();
  s2.app.kill();
  await until(async () => !!s2.exited, 10000);
  ok(!!s2.exited, 'session 2: the app is gone after the hard kill');
  ok(await until(async () => !(await portOpen(port3)), 5000), 'session 2: the relay died with it although no handler ran (the Job Object)');
  const stray = spawnSync('tasklist', [], { encoding: 'utf8' }).stdout || '';
  ok(!/bw-relay\.exe/i.test(stray), 'no bw-relay.exe is left running', (stray.match(/bw-relay\.exe.*/gi) || []).join(' | '));
  finish();
})().catch(e => { console.error(e); process.exit(1); });
