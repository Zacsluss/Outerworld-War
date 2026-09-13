// Screenshots of the terrain in a real game view, for judging a look by eye:  node tools/terrain-shot.js [port=8897]
// Serves the game page from the working tree and accepts POST /save?name=<name> with a canvas data URL, written to
// .claude/review/terrain/shots/<name>.png (local scratch, gitignored). Open http://localhost:<port>/ in the Browser pane (the
// `terrain-shot` entry in .claude/launch.json), start a game, and post `document.getElementById('game').toDataURL()`.
// Unlike tools/tilesets.js it stays up, so a before and an after come from one page load.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), port = parseInt(process.argv[2] || '8897', 10);
const outDir = path.join(root, '.claude', 'review', 'terrain', 'shots');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/save') {
    const name = String(url.searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'shot';
    const chunks = []; req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8'), png = Buffer.from(body.split(',')[1] || '', 'base64');
      fs.mkdirSync(outDir, { recursive: true }); const f = path.join(outDir, name + '.png'); fs.writeFileSync(f, png);
      console.log('wrote ' + f + ' (' + png.length + ' bytes)');
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('wrote ' + name + '.png, ' + png.length + ' bytes');
    });
    return;
  }
  const p = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const f = path.join(root, p);
  if (!f.startsWith(root + path.sep) || /[\\/]\.(git|claude)([\\/]|$)/.test(f)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d);
  });
}).listen(port, () => console.log('terrain shots: http://localhost:' + port + '/'));
