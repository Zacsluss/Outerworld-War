// Render-side performance:  node test/perf_render.js [port]
// test/perf.js measures the simulation. This measures the other half of the target -- the draw pass at
// 1080p with ~500 units -- which needs a real canvas, so it serves a page, lets the browser draw the
// same 200-supply battle test/perf.js builds, and posts the timings back. Open the URL it prints (the
// desktop app's browser pane will do); the script prints the numbers and exits.
//
// Four things this gets right that a naive version gets wrong, each of which cost a measurement:
//  1. Pace the draws. Drawing in a tight loop outruns the compositor and every third frame blocks on the
//     GPU queue -- that reports ~6 ms mean and a 16 ms p95 for a pass that actually costs 2.3 ms. A gap
//     between draws is what the game does at 60 Hz and is the only honest way to time it.
//  2. Render interpolates from u.px/u.py, so a unit teleported by setting u.x/u.y alone still draws at
//     its old position. The packed case sets both, and checks the drawn count to prove it.
//  3. The baked sheets load async. Measuring before they are in draws the vector fallback instead of the
//     art, which is the thing the size of the sprites was in question about.
//  4. Render.resize() reads window.innerWidth, so the pane's size would decide the result. The canvas is
//     pinned to 1920x1080 afterwards so the number means the same on any screen.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), port = parseInt(process.argv[2] || '8798');
// Device pixel ratio to emulate. The pane and most desktops report 1, but a scaled Windows display
// or any HiDPI panel reports more, and Render sizes its backing store by it -- so the honest cost of
// "render at the screen's real resolution" is measured here, not extrapolated from the pixel count.
const DPR = parseFloat(process.argv[3] || '1');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const W = 1920, H = 1080, LAYOUT = 'temple', SEED = 5, TICKS = 600, WARM = 20, SAMPLES = 100, GAP = 16, TARGET = 6;
const SCRIPTS = ['js/data.js', 'js/map.js', 'js/sim.js', 'js/game.js', 'js/combat.js', 'js/abilities.js', 'js/commands.js', 'js/ai.js', 'js/missions.js', 'js/build.js', 'js/snapshot.js', 'js/audio.js', 'js/net.js', 'js/terrain.js', 'js/sprites_units.js', 'js/sprites_buildings.js', 'assets/atlas.js', 'js/sprites.js', 'js/atlas.js', 'js/fx.js', 'js/render.js', 'js/editor.js', 'js/ui.js', 'js/hud.js'];

const page = `<!doctype html><meta charset="utf-8"><title>render perf</title>
<style>html,body{margin:0;background:#000;color:#ddd;font:13px monospace;overflow:hidden}#game{display:none}
#s{position:absolute;left:8px;top:8px;z-index:9;white-space:pre;text-shadow:0 0 4px #000}</style>
<body><div id="menu" style="display:none"></div><canvas id="game"></canvas><div id="s">loading...</div>
${SCRIPTS.map(f => '<script src="/' + f + '"></script>').join('\n')}
<script>
const W = ${W}, H = ${H}, DPR = ${DPR}, TICKS = ${TICKS}, WARM = ${WARM}, SAMPLES = ${SAMPLES}, GAP = ${GAP};
const status = document.getElementById('s'), say = t => status.textContent = t;
const gap = ms => new Promise(r => setTimeout(r, ms));
const stat = a => { const s = a.slice().sort((x, y) => x - y); const f = v => +v.toFixed(2);
  return { median: f(s[s.length >> 1]), mean: f(a.reduce((p, c) => p + c, 0) / a.length), p95: f(s[Math.floor(s.length * 0.95)]), max: f(s[s.length - 1]), min: f(s[0]), over: a.filter(v => v > ${TARGET}).length }; };

// (3) the baked sheets load async; the vector fallback is a different renderer with a different cost
async function waitForArt() {
  if (typeof Atlas === 'undefined' || !Atlas.data) return 'no atlas (vector fallback)';
  Atlas.init();
  for (let i = 0; i < 200; i++) { const im = Object.values(Atlas.imgs); if (im.length && im.every(x => x.ok !== undefined)) break; await gap(50); }
  const im = Object.values(Atlas.imgs);
  return im.filter(x => x.ok).length + '/' + im.length + ' sheets loaded';
}

// the same 200-supply battle test/perf.js sets up, so the two halves describe one scenario
function setup() {
  UI.start({ players: [{ race: 'T', human: true, difficulty: 'normal', name: 'P0' }, { race: 'Z', human: false, difficulty: 'normal', name: 'P1' },
                       { race: 'P', human: false, difficulty: 'normal', name: 'P2' }, { race: 'T', human: false, difficulty: 'normal', name: 'P3' }],
             seed: ${SEED}, layout: '${LAYOUT}', mode: 'play' });
  const ARMY = { T: ['marine', 'marine', 'marine', 'medic', 'siege_tank', 'vulture', 'goliath', 'wraith'],
                 Z: ['zergling', 'zergling', 'hydralisk', 'hydralisk', 'mutalisk', 'lurker', 'ultralisk', 'scourge'],
                 P: ['zealot', 'zealot', 'dragoon', 'dragoon', 'high_templar', 'reaver', 'corsair', 'archon'] };
  const cx = G.map.w * TILE / 2, cy = G.map.h * TILE / 2;
  for (const p of G.players) {
    p.minerals = 50000; p.gas = 50000;
    for (const t of Object.keys(DATA.techs)) p.tech.add(t);
    for (const u of Object.keys(DATA.upgrades)) p.upg[u] = 3;
    const list = ARMY[p.race]; let sup = 0, i = 0;
    const ang = (p.id / G.players.length) * Math.PI * 2;
    const bx = cx + Math.cos(ang) * 14 * TILE, by = cy + Math.sin(ang) * 14 * TILE;
    while (sup < 200 && i < 400) {
      const id = list[i % list.length], d = DATA.units[id];
      const t = G.map.findFreeTile(Math.floor(bx / TILE) + ((i * 7) % 13) - 6, Math.floor(by / TILE) + ((i * 5) % 13) - 6, 12);
      if (t) { const u = G.spawnUnit(id, p.id, (t[0] + .5) * TILE, (t[1] + .5) * TILE);
        if (u.def.interceptors !== undefined) u.interceptors = 8; if (u.def.scarabs !== undefined) u.scarabs = 10;
        u.applyOrder({ type: 'attackmove', x: cx, y: cy }); sup += d.sup || 1; }
      i++;
    }
  }
  G.recomputeSupply(); G.rebuildGrid(); G.updateVision();
  G.damage = () => 0; G.damageRaw = () => {};   // --sustain: nothing dies, so the load does not decay
  UI.viewAll = true;                            // draw every player's units, not just what P0 can see
  clearInterval(UI.simTimer); UI.simTimer = null; UI.running = false;  // we drive the sim and the draw by hand
  // (4) pin the canvas so the window size does not decide the answer
  Render.resize(); const c = Render.canvas;
  Render.dpr = DPR; Render.W = W; Render.H = H; Render.viewW = W; Render.viewH = H - UI.consoleH;
  c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
  c.style.width = W + 'px'; c.style.height = H + 'px';
  Render.creepLayer = null; Render.built = false;
  for (let i = 0; i < TICKS; i++) G.tick();
  Render.camX = cx - Render.viewW / 2; Render.camY = cy - Render.viewH / 2; UI.clampCam();
}

// (1) a gap between draws: a tight loop measures the GPU queue, not the renderer
let drawn = 0;
{ const o = Sprites.unit.bind(Sprites); Sprites.unit = (...a) => { drawn++; return o(...a); }; }  // (2)'s proof
async function measure(label) {
  for (let i = 0; i < WARM; i++) { await gap(GAP); Render.frame(0); }
  drawn = 0; const t = [];
  for (let i = 0; i < SAMPLES; i++) { await gap(GAP); const a = performance.now(); Render.frame(0); t.push(performance.now() - a); }
  return Object.assign({ label, drawn: Math.round(drawn / SAMPLES) }, stat(t));
}

(async () => {
  const art = await waitForArt();
  say('art: ' + art + '\\nsetting up ' + TICKS + ' ticks...');
  setup();
  const alive = G.units.filter(u => u.alive).length;
  say('art: ' + art + '\\n' + alive + ' units, ' + W + 'x' + H + '. measuring...');
  const natural = await measure('camera on the battle');
  // worst case: every mobile unit inside the viewport at once
  const mob = G.units.filter(u => u.alive && !u.isBuilding && !u.def.larva);
  const cols = Math.ceil(Math.sqrt(mob.length * (Render.viewW / Render.viewH))), rows = Math.ceil(mob.length / cols);
  mob.forEach((u, i) => {
    u.x = Render.camX + 40 + (i % cols) * ((Render.viewW - 80) / (cols - 1 || 1));
    u.y = Render.camY + 40 + Math.floor(i / cols) * ((Render.viewH - 80) / (rows - 1 || 1));
    u.px = u.x; u.py = u.y;   // (2) or Render interpolates them back to where they were
  });
  G.rebuildGrid(); G.updateVision();
  const packed = await measure('every unit on screen');
  const out = { art, alive, mobile: mob.length, canvas: W + 'x' + H, viewport: Render.viewW + 'x' + Render.viewH, natural, packed };
  say(JSON.stringify(out, null, 1));
  fetch('/result', { method: 'POST', body: JSON.stringify(out) }).catch(e => say('post failed: ' + e));
})();
</script>`;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/result') {
    let body = ''; req.on('data', d => body += d);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok');
      let r; try { r = JSON.parse(body); } catch (e) { console.log('bad result: ' + body.slice(0, 200)); return process.exit(1); }
      const row = m => m.label.padEnd(22) + String(m.drawn).padStart(4) + ' drawn   median ' + m.median.toFixed(2) + ' ms   mean ' + m.mean.toFixed(2) + '   p95 ' + m.p95.toFixed(2) + '   max ' + m.max.toFixed(2) + '   over ' + TARGET + 'ms ' + m.over + '/' + SAMPLES;
      console.log('art: ' + r.art);
      console.log(r.alive + ' units alive (' + r.mobile + ' mobile), canvas ' + r.canvas + ' at dpr ' + DPR + ', viewport ' + r.viewport + ', ' + SAMPLES + ' frames paced ' + GAP + ' ms apart');
      console.log('  ' + row(r.natural));
      console.log('  ' + row(r.packed));
      const worst = Math.max(r.natural.median, r.packed.median);
      console.log(worst <= TARGET ? 'PASS render median under ' + TARGET + ' ms (worst ' + worst.toFixed(2) + ' ms)' : 'FAIL render median over ' + TARGET + ' ms (worst ' + worst.toFixed(2) + ' ms)');
      setTimeout(() => process.exit(worst <= TARGET ? 0 : 1), 250);
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); return res.end(page); }
  const f = path.join(root, p); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
});
server.listen(port, () => console.log('open http://localhost:' + port + '/  to measure the draw pass at ' + W + 'x' + H));
