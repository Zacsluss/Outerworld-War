// A map of the repo, generated rather than maintained by hand so it cannot go stale.
//   node tools/inventory.js            human-readable
//   node tools/inventory.js --md       markdown tables, for pasting into a review doc
//
// Prints every simulation file and every test with its size, its own one-line description (taken
// from the file's first comment, which every file in this repo has), and for a test whether the
// pre-commit gate actually runs it. That last column is the one worth having: fourteen suites exist
// and are NOT in the gate, for reasons test/all.js states at the top, and it is easy to assume a
// green gate means every test passed.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const MD = process.argv.includes('--md');

function firstComment(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (t.startsWith("'use strict'")) continue;
    if (t.startsWith('//')) {
      const s = t.replace(/^\/\/\s?/, '').trim();
      if (!s || /^=+$/.test(s)) continue;
      return s;
    }
    return '';
  }
  return '';
}
const lineCount = f => fs.readFileSync(f, 'utf8').split(/\r?\n/).length;
const endings = f => { const s = fs.readFileSync(f, 'latin1'); const c = (s.match(/\r\n/g) || []).length, l = (s.match(/(^|[^\r])\n/g) || []).length; return c && l ? 'MIXED' : c ? 'CRLF' : 'LF'; };

// which suites the gate runs
const allSrc = fs.readFileSync(path.join(root, 'test', 'all.js'), 'utf8');
const gated = new Set();
for (const m of allSrc.matchAll(/args:\s*\[\s*'([a-z0-9_]+)\.js'/gi)) gated.add(m[1]);

function table(title, dir, filter) {
  const files = fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js')).filter(filter || (() => true)).sort();
  const rows = files.map(f => {
    const p = path.join(root, dir, f);
    return { name: f, lines: lineCount(p), eol: endings(p), desc: firstComment(p), inGate: gated.has(f.replace(/\.js$/, '')) };
  });
  const total = rows.reduce((a, r) => a + r.lines, 0);
  if (MD) {
    console.log('\n### ' + title + '  — ' + rows.length + ' files, ' + total.toLocaleString() + ' lines\n');
    const gateCol = dir === 'test';
    console.log('| file | lines | eol |' + (gateCol ? ' gate |' : '') + ' what it is |');
    console.log('|---|---:|---|' + (gateCol ? '---|' : '') + '---|');
    for (const r of rows) console.log('| `' + r.name + '` | ' + r.lines + ' | ' + r.eol + ' |' + (gateCol ? (r.inGate ? ' ✅ |' : ' — |') : '') + ' ' + r.desc.replace(/\|/g, '\\|').slice(0, 150) + ' |');
  } else {
    console.log('\n=== ' + title + ' (' + rows.length + ' files, ' + total.toLocaleString() + ' lines) ===');
    for (const r of rows) console.log('  ' + r.name.padEnd(24) + String(r.lines).padStart(6) + '  ' + r.eol.padEnd(5) + (dir === 'test' ? (r.inGate ? ' GATE ' : '  --  ') : '') + ' ' + r.desc.slice(0, 96));
  }
  return { count: rows.length, total, rows };
}

const js = table('js/ — the game', 'js');
const tests = table('test/ — the suites', 'test');
const tools = table('tools/ — build and diagnostics', 'tools', f => !f.startsWith('_'));

const notGated = tests.rows.filter(r => !r.inGate).map(r => r.name.replace(/\.js$/, ''));
if (MD) {
  console.log('\n### Totals\n');
  console.log('| | files | lines |');
  console.log('|---|---:|---:|');
  console.log('| `js/` (the game) | ' + js.count + ' | ' + js.total.toLocaleString() + ' |');
  console.log('| `test/` | ' + tests.count + ' | ' + tests.total.toLocaleString() + ' |');
  console.log('| `tools/` | ' + tools.count + ' | ' + tools.total.toLocaleString() + ' |');
  console.log('| **all** | **' + (js.count + tests.count + tools.count) + '** | **' + (js.total + tests.total + tools.total).toLocaleString() + '** |');
  console.log('\n**In the gate:** ' + tests.rows.filter(r => r.inGate).length + ' of ' + tests.count + ' suites.');
  console.log('\n**NOT in the gate** (' + notGated.length + ', deliberately — `test/all.js` says why at the top of the file): ' + notGated.map(n => '`' + n + '`').join(', ') + '.');
} else {
  console.log('\nTOTAL  js ' + js.total + '  test ' + tests.total + '  tools ' + tools.total + '  = ' + (js.total + tests.total + tools.total) + ' lines');
  console.log('in the gate: ' + tests.rows.filter(r => r.inGate).length + ' of ' + tests.count);
  console.log('NOT gated  : ' + notGated.join(', '));
}
