// Side-by-side screenshot of every tileset:  node tools/tilesets.js [port]
// Writes assets/tilesets.png. A tileset is a palette table in js/terrain.js, and the only honest way to
// look at one is to let the browser draw it with the game's own code -- so this serves a page that
// renders each entry in TILESET_IDS through Terrain.draw and posts the composed image back.
// Open the URL it prints (the desktop app's browser pane will do); the script writes the file and exits.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), port = parseInt(process.argv[2] || '8799');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const PANEL = 560, LABEL = 30, LAYOUT = 'temple', SEED = 7;

const page = `<!doctype html><meta charset="utf-8"><title>tilesets</title>
<style>body{background:#111;color:#ddd;font:13px monospace;margin:0;padding:12px}canvas{display:block;max-width:100%}</style>
<body><div id="s">rendering...</div><canvas id="out"></canvas>
${['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'terrain'].map(f => '<script src="/js/' + f + '.js"></script>').join('\n')}
<script>
const PANEL = ${PANEL}, LABEL = ${LABEL};
const out = document.getElementById('out'), status = document.getElementById('s');
G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: ${SEED}, layout: '${LAYOUT}' });
// a corner of the map with high ground, a ramp and a cliff edge in it, so the palette has something to
// show beyond flat floor: centre on the first start base and pull back up and left towards its ramp
const b = G.map.starts[0];
const camX = Math.max(0, b.cx - PANEL * 0.5), camY = Math.max(0, b.cy - PANEL * 0.72);
out.width = TILESET_IDS.length * PANEL; out.height = PANEL + LABEL;
const o = out.getContext('2d');
o.fillStyle = '#111'; o.fillRect(0, 0, out.width, out.height);
TILESET_IDS.forEach((id, i) => {
  G.map.tileset = id; Terrain.reset(G.map.seed);
  const cv = document.createElement('canvas'); cv.width = PANEL; cv.height = PANEL;
  Terrain.draw(cv.getContext('2d'), camX, camY, PANEL, PANEL);
  o.drawImage(cv, i * PANEL, LABEL);
  o.fillStyle = '#fff'; o.font = '16px monospace';
  o.fillText(TILESET_NAMES[id] + '  (' + id + ')', i * PANEL + 10, 20);
  o.strokeStyle = '#333'; o.strokeRect(i * PANEL + 0.5, LABEL + 0.5, PANEL - 1, PANEL - 1);
});
status.textContent = 'posting ' + out.width + 'x' + out.height + '...';
fetch('/save', { method: 'POST', body: out.toDataURL('image/png') })
  .then(r => r.text()).then(t => status.textContent = t)
  .catch(e => status.textContent = 'failed: ' + e);
</script>`;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    let body = ''; req.on('data', d => body += d);
    req.on('end', () => {
      const png = Buffer.from(body.split(',')[1] || '', 'base64');
      const f = path.join(root, 'assets', 'tilesets.png'); fs.writeFileSync(f, png);
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('wrote assets/tilesets.png, ' + png.length + ' bytes');
      console.log('wrote ' + f + ' (' + png.length + ' bytes)');
      setTimeout(() => process.exit(0), 250);
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '/shot') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); return res.end(page); }
  const f = path.join(root, p); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
});
server.listen(port, () => console.log('open http://localhost:' + port + '/  to render ' + '(' + LAYOUT + ', seed ' + SEED + ')'));
