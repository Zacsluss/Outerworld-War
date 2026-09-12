// REVIEW-M17 task 28, the page half: js/desktop.js is inert in a browser and drives HOST inside the wrapper.
//
// Loads js/net.js and js/desktop.js into a vm context with a stub document, a stub WebSocket that records
// the URL it was given, and -- in the second half -- a stub window.__TAURI__ whose invoke() records calls and
// answers host_relay with a port. No sockets, no Tauri, under a second; the built relay is relay/check.js's job.
//   node page-check.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };

// A page with the Multiplayer panel's elements after spec-task28.js: the ids js/ui.js and js/desktop.js read.
function page(tauri) {
  const els = {}; const el = id => els[id] || (els[id] = { id, value: '', textContent: '', placeholder: '', disabled: false, style: {}, listeners: {}, innerHTML: '', addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, click() { for (const f of this.listeners.click || []) f(); }, querySelectorAll() { return []; } });
  el('netHost').style.display = 'none'; el('netShare').style.display = 'none'; el('netDesktopHelp').style.display = 'none'; el('netName').value = 'Alice';
  const sockets = [];
  function WebSocket(url) { this.url = url; this.readyState = 0; sockets.push(this); }
  WebSocket.prototype.close = function () { this.readyState = 3; }; WebSocket.prototype.send = function () { };
  const win = { listeners: {}, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, fire(t) { for (const f of this.listeners[t] || []) f(); } };
  const calls = []; let nextPort = 51234;
  if (tauri) win.__TAURI__ = { core: { invoke: (cmd, args) => { calls.push({ cmd, args }); if (cmd === 'host_relay') return Promise.resolve({ port: nextPort++, delay: args && args.delay, lan: ['192.168.1.5'] }); return Promise.resolve(true); } } };
  const ctx = vm.createContext({ window: win, document: { getElementById: el }, location: { protocol: 'http:', host: 'tauri.localhost' }, WebSocket, console, setTimeout, clearTimeout, TPS: 24 });
  for (const f of ['js/net.js', 'js/desktop.js']) vm.runInContext(fs.readFileSync(path.join(repo, f), 'utf8'), ctx, { filename: f });
  return { ctx, el, sockets, calls, win, Net: vm.runInContext('Net', ctx), Desktop: vm.runInContext('Desktop', ctx) };
}
const tick = () => new Promise(r => setTimeout(r, 0));

(async () => {
  // ---- a plain browser: nothing changes ------------------------------------------------------------
  {
    const p = page(false); const before = p.Net.connect; p.win.fire('DOMContentLoaded');
    ok(p.Desktop.active === false, 'browser: Desktop is inactive without window.__TAURI__');
    ok(p.Net.connect === before, 'browser: Net.connect is the original function, untouched');
    ok(p.el('netHost').style.display === 'none' && p.el('netDesktopHelp').style.display === 'none', 'browser: the HOST button and its help line stay hidden');
    ok(p.Net.defaultUrl() === 'ws://tauri.localhost/ws', 'browser: Net.defaultUrl is untouched (derived from location, as before)', p.Net.defaultUrl());
    p.Net.connect('ws://example:1/ws', 'Alice', 'R', '');
    ok(p.sockets.length === 1 && p.sockets[0].url === 'ws://example:1/ws', 'browser: a connection opens exactly the URL it was given');
  }
  // ---- inside the wrapper ----------------------------------------------------------------------------
  {
    const p = page(true); p.win.fire('DOMContentLoaded');
    ok(p.Desktop.active === true && p.el('netHost').style.display === '' && p.el('netDesktopHelp').style.display === '', 'wrapper: the HOST button and its help line are shown');
    // the normaliser
    const u = s => p.Desktop.url(s);
    ok(u('192.168.1.5:51234') === 'ws://192.168.1.5:51234/ws', 'wrapper: "ip:port" becomes ws://ip:port/ws', u('192.168.1.5:51234'));
    ok(u('ws://192.168.1.5:51234/ws') === 'ws://192.168.1.5:51234/ws', 'wrapper: a full ws:// URL is kept');
    ok(u('https://x.trycloudflare.com') === 'wss://x.trycloudflare.com/ws' && u('https://x.trycloudflare.com/') === 'wss://x.trycloudflare.com/ws', 'wrapper: a tunnel\'s https link becomes wss://.../ws', u('https://x.trycloudflare.com'));
    ok(u('  ') === '' && u(null) === '', 'wrapper: blank stays blank');
    // CONNECT with an empty Server field, the way ui.js calls it: refused with a message, no socket
    p.Net.connect(p.el('netUrl').value.trim() || p.Net.defaultUrl(), 'Alice', 'R', '');
    ok(p.sockets.length === 0 && /address/.test(p.el('netStatus').textContent), 'wrapper: CONNECT with an empty Server field is refused with a message, no socket opened', p.el('netStatus').textContent);
    // a tunnel address without a room code: the same rule ui.js applies over https
    p.Net.connect('https://x.trycloudflare.com', 'Alice', 'R', '');
    ok(p.sockets.length === 0 && /room code/.test(p.el('netStatus').textContent), 'wrapper: a wss:// address with no room code is refused', p.el('netStatus').textContent);
    p.Net.connect('https://x.trycloudflare.com', 'Alice', 'R', 'ABCD');
    ok(p.sockets.length === 1 && p.sockets[0].url === 'wss://x.trycloudflare.com/ws' && p.Net.room === 'ABCD', 'wrapper: with a code it connects to wss://.../ws in that room');
    p.Net.connect('192.168.1.5:51234', 'Alice', 'R', '');
    ok(p.sockets.length === 2 && p.sockets[1].url === 'ws://192.168.1.5:51234/ws', 'wrapper: a LAN "ip:port" typed into Server connects without a code, as a LAN game always has');
    // HOST: the Rust command, then the client on localhost, then the address to read out
    p.el('netRoom').value = 'ZZ99'; p.el('netHost').click(); await tick(); await tick();
    ok(p.calls.length === 1 && p.calls[0].cmd === 'host_relay' && p.calls[0].args.delay === 3, 'wrapper: HOST invokes host_relay with the LAN delay', JSON.stringify(p.calls));
    ok(p.sockets.length === 3 && p.sockets[2].url === 'ws://localhost:51234/ws', 'wrapper: then connects the client to ws://localhost:<port>/ws', p.sockets[2] && p.sockets[2].url);
    ok(p.el('netUrl').value === 'localhost:51234' && p.el('netHost').textContent === 'STOP HOSTING', 'wrapper: Server shows localhost:<port>, the button turns into STOP HOSTING');
    ok(/192\.168\.1\.5:51234/.test(p.el('netShare').textContent) && /ZZ99/.test(p.el('netShare').textContent) && p.el('netShare').style.display === '', 'wrapper: the share line names the LAN address, the port and the room', p.el('netShare').textContent);
    // STOP: the relay is killed and the client disconnected
    p.el('netHost').click(); await tick(); await tick();
    ok(p.calls.length === 2 && p.calls[1].cmd === 'stop_relay' && p.sockets[2].readyState === 3 && p.Desktop.hosting === null && p.el('netHost').textContent === 'HOST A GAME', 'wrapper: STOP HOSTING invokes stop_relay, closes the socket and restores the button', JSON.stringify(p.calls));
    ok(p.el('netShare').style.display === 'none', 'wrapper: the share line is gone after STOP');
    // the window closing while hosting tells the Rust side, which kills the relay either way
    p.el('netHost').click(); await tick(); await tick(); p.win.fire('beforeunload');
    ok(p.calls.length === 4 && p.calls[3].cmd === 'stop_relay', 'wrapper: unloading the page while hosting invokes stop_relay', JSON.stringify(p.calls.map(c => c.cmd)));
    // a failed start is reported, not thrown (hosting cleared first: the unload above does not clear it, the window is going away)
    p.Desktop.hosting = null; p.el('netHost').textContent = 'HOST A GAME';
    p.win.__TAURI__.core.invoke = () => Promise.reject(new Error('no sidecar'));
    p.el('netHost').click(); await tick(); await tick();
    ok(/Could not start the relay: no sidecar/.test(p.el('netStatus').textContent) && p.el('netHost').disabled === false, 'wrapper: a relay that fails to start is reported in the status line', p.el('netStatus').textContent);
  }
  console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
