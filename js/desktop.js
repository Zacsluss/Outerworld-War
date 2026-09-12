'use strict';
// ============================================================================
// The desktop wrapper's half of hosting a multiplayer game (REVIEW-M17 task 28).
//
// Inside the Tauri app there is no Node, so the page cannot run test/serve.js the way PLAY.bat does.
// The relay ships beside the app as a sidecar executable -- test/serve.js built into one file by
// desktop/relay/build.js, not ported -- and HOST A GAME asks the Rust side (desktop/src-tauri/src/main.rs,
// the `host_relay` command) to start it on a free port, then connects the ordinary client (js/net.js) to
// ws://localhost:<port>/ws. The other players type the address this shows -- a LAN IP and the port --
// into Server and press CONNECT. The Rust side kills the relay when the window closes; STOP HOSTING
// kills it sooner.
//
// Over the internet nothing changes: the host still needs a tunnel or a port forward to the port shown,
// exactly as PLAY-ONLINE.bat describes, and everyone still agrees a room code.
//
// IN A PLAIN BROWSER THIS FILE DOES NOTHING. Without window.__TAURI__ `Desktop.active` is false, init()
// returns at once, the HOST button stays hidden (index.html hides it) and Net is not touched.
// ============================================================================
const Desktop = {
  active: typeof window !== 'undefined' && !!(window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function'),
  hosting: null,      // { port, delay, lan: [ip, ...] } while the sidecar runs, else null
  LAN_DELAY: 3,       // the lockstep delay the relay is started with -- serve.js's own default; PLAY-ONLINE.bat explains the number
  invoke(cmd, args) { return window.__TAURI__.core.invoke(cmd, args || {}); },
  $(id) { return document.getElementById(id); },
  // The address a player types into Server, made into the relay's URL. It accepts what people actually
  // paste: "192.168.1.5:51234", "ws://192.168.1.5:51234/ws", a tunnel's "https://x.trycloudflare.com".
  url(s) {
    s = String(s == null ? '' : s).trim(); if (!s) return '';
    s = s.replace(/^http(s?):\/\//i, 'ws$1://');
    if (!/^wss?:\/\//i.test(s)) s = 'ws://' + s;
    s = s.replace(/\/+$/, ''); if (!/\/ws$/i.test(s)) s += '/ws';
    return s;
  },
  // The line under the button telling the host what to read out.
  share() {
    const el = this.$('netShare'); if (!el) return; const h = this.hosting;
    if (!h) { el.textContent = ''; el.style.display = 'none'; return; }
    const room = (this.$('netRoom') && this.$('netRoom').value || '').trim();
    const where = h.lan && h.lan.length ? h.lan.map(ip => ip + ':' + h.port).join('  or  ') : 'this machine\'s address, port ' + h.port;
    el.textContent = 'Hosting. Others on your network: Server ' + where + (room ? ', Room ' + room : '') + ', then CONNECT. Over the internet: a tunnel or a port forward to port ' + h.port + ' (see PLAY-ONLINE.bat), and everyone types the same room code.';
    el.style.display = '';
  },
  async host() {
    const btn = this.$('netHost'); btn.disabled = true; Net.status('Starting the relay...');
    try {
      const info = await this.invoke('host_relay', { delay: this.LAN_DELAY });
      this.hosting = info; btn.textContent = 'STOP HOSTING';
      this.$('netUrl').value = 'localhost:' + info.port;
      this.share();
      Net.connect('ws://localhost:' + info.port + '/ws', (this.$('netName').value || '').trim() || 'Player', 'R', this.$('netRoom') ? this.$('netRoom').value.trim() : '');
    } catch (e) { Net.status('Could not start the relay: ' + (e && e.message || e)); }
    btn.disabled = false;
  },
  async stop() {
    Net.disconnect();
    try { await this.invoke('stop_relay'); } catch (e) { }
    this.hosting = null; this.share(); const btn = this.$('netHost'); if (btn) btn.textContent = 'HOST A GAME'; Net.status('Relay stopped.');
  },
  init() {
    if (!this.active || typeof Net === 'undefined' || typeof document === 'undefined') return;
    const btn = this.$('netHost'); if (!btn) return;
    btn.style.display = ''; const help = this.$('netDesktopHelp'); if (help) help.style.display = '';
    if (this.$('netUrl')) this.$('netUrl').placeholder = 'the host\'s address, e.g. 192.168.1.5:51234';
    // Inside the app the page's own origin is tauri.localhost, which is nothing to connect to, so an
    // empty Server field is refused below instead of falling back to Net.defaultUrl().
    Net.defaultUrl = () => '';
    // Every connection goes through the normaliser -- including the CONNECT button ui.js already wires,
    // which reads the field and calls Net.connect. A tunnel address (wss://) needs a room code for the
    // reason ui.js gives over https: no code is the shared room anyone with the link walks into.
    const connect = Net.connect;
    Net.connect = function (url, name, race, room) {
      const u = Desktop.url(url);
      if (!u) { Net.status('Type the host\'s address first (they see it under HOST A GAME), or host a game yourself.'); return; }
      if (/^wss:\/\//i.test(u) && !String((room == null ? Net.room : room) || '').trim()) { Net.status('Type a room code first: over the internet, no code means the shared room anyone with the link can walk into.'); return; }
      return connect.call(this, u, name, race, room);
    };
    btn.addEventListener('click', () => { if (Desktop.hosting) Desktop.stop(); else Desktop.host(); });
    // The Rust side kills the relay when the window is destroyed; a reload of the page is the same to it.
    window.addEventListener('beforeunload', () => { if (Desktop.hosting) Desktop.invoke('stop_relay').catch(() => { }); });
  },
};
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('DOMContentLoaded', () => Desktop.init());
