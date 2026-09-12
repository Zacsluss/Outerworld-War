// Copies the page the wrapper loads into desktop/dist: exactly what test/serve.js serves (index.html,
// js/, assets/ -- its SERVED list) and nothing else. Tauri embeds frontendDist wholesale into the
// executable, so pointing it at the repository root would ship the handoffs, the tests and .git with
// the game. Run by `npm run build:dist`, and by tauri.conf.json before every dev run and build.
'use strict';
const fs = require('fs'), path = require('path');
const repo = path.join(__dirname, '..'), dist = path.join(__dirname, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const item of ['index.html', 'js', 'assets']) {
  const from = path.join(repo, item);
  if (!fs.existsSync(from)) { console.log('dist: ' + from + ' is missing'); process.exit(2); }
  fs.cpSync(from, path.join(dist, item), { recursive: true });
}
// The HOST button is driven by js/desktop.js (REVIEW-M17 task 28). An app built without it opens and
// plays, and its HOST button does nothing -- which is the one thing this build exists to provide.
if (!fs.existsSync(path.join(dist, 'js', 'desktop.js'))) { console.log('dist: js/desktop.js is missing -- the wrapper\'s HOST button needs it (REVIEW-M17 task 28, spec-task28.js)'); process.exit(2); }
if (!fs.readFileSync(path.join(dist, 'index.html'), 'utf8').includes('js/desktop.js')) { console.log('dist: index.html does not load js/desktop.js -- apply spec-task28.js with tools/patch.js first'); process.exit(2); }
const count = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, d) => n + (d.isDirectory() ? count(path.join(dir, d.name)) : 1), 0);
console.log('dist: ' + count(dist) + ' files in ' + dist);
