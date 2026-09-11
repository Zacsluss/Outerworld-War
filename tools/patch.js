// Multi-file, line-ending-safe patch runner (REVIEW-M17; every review patch went through it). All-or-nothing: every edit is checked against the
// current text before any file is written.
//   node tools/patch.js <spec.js>
// spec.js exports an array of edits:
//   { file, search, replace }                 exactly one match of `search` (LF text, converted to the file's EOL)
//   { file, line, startsWith }               delete that 1-based line; it must start with `startsWith`
//   { file, line, startsWith, count }        delete `count` lines from `line`
'use strict';
const fs = require('fs'), path = require('path');
const spec = require(path.resolve(process.argv[2]));
const root = path.join(__dirname, '..');
const eolOf = src => { const crlf = (src.match(/\r\n/g) || []).length, lf = (src.match(/(^|[^\r])\n/g) || []).length; return crlf >= lf ? '\r\n' : '\n'; };
const files = new Map();
const load = f => { if (!files.has(f)) { const src = fs.readFileSync(path.join(root, f), 'utf8'); files.set(f, { src, eol: eolOf(src), out: src }); } return files.get(f); };
const problems = [];
// pass 1: check every edit against the ORIGINAL text (line numbers refer to the original file)
for (const e of spec) {
  const F = load(e.file);
  if (e.search !== undefined) {
    const s = e.search.replace(/\r\n/g, '\n').replace(/\n/g, F.eol);
    const n = F.src.split(s).length - 1;
    if (n !== 1) problems.push(e.file + ': ' + n + ' matches for ' + JSON.stringify(e.search.slice(0, 60)));
  } else {
    const lines = F.src.split(F.eol);
    const first = lines[e.line - 1], last = lines[e.line - 1 + (e.count || 1) - 1];
    if (first === undefined || !first.startsWith(e.startsWith)) problems.push(e.file + ':' + e.line + ' does not start with ' + JSON.stringify(e.startsWith) + ' -- got ' + JSON.stringify(String(first).slice(0, 60)));
    if (e.last !== undefined && (last === undefined || !last.startsWith(e.last))) problems.push(e.file + ':' + (e.line + (e.count || 1) - 1) + ' (last) does not start with ' + JSON.stringify(e.last) + ' -- got ' + JSON.stringify(String(last).slice(0, 60)));
  }
}
if (problems.length) { console.log('REFUSED, nothing written:\n  ' + problems.join('\n  ')); process.exit(2); }
// pass 2: apply. Line deletions first, highest line first, so earlier numbers stay valid; then searches.
const dels = spec.filter(e => e.line !== undefined).sort((a, b) => a.file === b.file ? b.line - a.line : a.file < b.file ? -1 : 1);
for (const e of dels) { const F = load(e.file); const lines = F.out.split(F.eol); lines.splice(e.line - 1, e.count || 1); F.out = lines.join(F.eol); }
for (const e of spec.filter(e => e.search !== undefined)) {
  const F = load(e.file);
  const s = e.search.replace(/\r\n/g, '\n').replace(/\n/g, F.eol), r = e.replace.replace(/\r\n/g, '\n').replace(/\n/g, F.eol);
  if (F.out.split(s).length - 1 !== 1) { console.log('REFUSED at apply time (a deletion changed the text?): ' + e.file); process.exit(2); }
  F.out = F.out.replace(s, () => r);
}
for (const [f, F] of files) { fs.writeFileSync(path.join(root, f), F.out); console.log('patched ' + f + ' (eol ' + JSON.stringify(F.eol) + ', ' + (F.src.split(F.eol).length - F.out.split(F.eol).length) + ' lines removed)'); }
