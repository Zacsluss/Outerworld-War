// Every persistent field draws SOMETHING.
//
// G.fields is a list of ongoing effects -- a psi storm, a force field, a chrono boost -- and
// FX.drawField is the only path any of them has to the screen. It is one long if/else chain keyed on
// f.kind, so a kind with no branch is not an error and not a warning: it falls off the end of the
// chain and the effect is simply invisible for its entire duration.
//
// That is how nine of them shipped. force_field was the worst of them, because it is not decoration --
// it writes blocked tiles through GameMap.raiseForceField, so an invisible one is a wall that stops
// your army with nothing on screen to explain why. What kept it hidden through review is that most of
// these abilities also push a one-frame `ring` effect at cast time, so something flashes when you cast
// it and the ability looks wired up.
//
// The check is: scrape every kind the simulation can actually push into G.fields out of the source,
// then render one of each and require it to have issued drawing calls. Negative control: deleting any
// branch from FX.drawField fails the kind it drew.
//   node test/fields.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

// ---- what kinds can the simulation create? ----
const SRC = ['abilities', 'missions', 'game', 'sim', 'combat'];
const kinds = new Set();
for (const f of SRC) {
  const t = fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8');
  for (const m of t.matchAll(/fields\.push\(\{\s*kind:\s*'([a-z_]+)'/g)) kinds.add(m[1]);
  // A computed kind -- G.fields.push({ kind: cond ? 'x' : 'y' }) -- would be invisible to the scrape
  // above and would make this whole file quietly stop covering it, so flag it loudly instead.
  //
  // Done by hand rather than with a regex, because BOTH regex spellings of "the next non-space is not
  // a quote" are wrong here: in /\s*[^']/ and /\s*(?!')/ alike, \s* can match the empty string and
  // then the class or the lookahead is tested against the SPACE, which passes. Every literal push then
  // reports as computed. Trim explicitly and look at one character.
  for (const m of t.matchAll(/fields\.push\(\{\s*kind:/g))
    if (t.slice(m.index + m[0].length).replace(/^\s+/, '')[0] !== "'") kinds.add('__computed__');
}
ok(!kinds.has('__computed__'), 'every G.fields.push names its kind with a literal, so this scrape sees all of them');
kinds.delete('__computed__');
ok(kinds.size >= 12, 'the scrape found the field kinds', kinds.size + ': ' + [...kinds].sort().join(', '));

// ---- a canvas that records whether anything was actually painted ----
const paints = ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'drawImage'];
let painted = 0, ops = 0;
const mkCtx = () => new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 1280, height: 720 };
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() { } });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (typeof k === 'symbol') return undefined;
    return (...a) => { ops++; if (paints.includes(k)) painted++; };
  },
  set() { ops++; return true; },
});
const ctx = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { },
  localStorage: { getItem() { return null; }, setItem() { } },
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: mkCtx, click() { }, value: '' }), createElement: () => ({ width: 0, height: 0, style: {}, addEventListener() { }, getContext: mkCtx }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
  requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' }, __mkCtx: mkCtx };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot', 'sprites_units', 'sprites_buildings', 'sprites', 'atlas', 'fx'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
vm.runInContext(`G.init({ players: [{ race: 'P', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 4, layout: 'temple' });`, ctx);

// A field of each kind, shaped the way the simulation shapes it: the two that mark a building carry
// one, and the ones with a fuse are sampled part-way through so the countdown maths is exercised.
const drawn = [], blank = [], threw = [];
for (const kind of [...kinds].sort()) {
  painted = 0; ops = 0;
  const err = vm.runInContext(`(() => {
    const b = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
    const f = { kind: ${JSON.stringify(kind)}, x: b.x + 200, y: b.y + 200, r: 2.5, t: 40, owner: 0, tiles: [[10, 10], [11, 10]], bld: b, hall: b, src: b, tickT: 0 };
    const c = __mkCtx();
    // three frames apart, because a branch keyed on frame parity could paint on only one of them
    try { for (const fr of [0, 7, 31]) FX.drawField(c, f, fr); return null; } catch (e) { return String(e && e.message || e); }
  })()`, ctx);
  if (err) threw.push(kind + ': ' + err);
  else if (painted > 0) drawn.push(kind);
  else blank.push(kind);
}

ok(threw.length === 0, 'no field kind throws while drawing', threw.join(' | '));
ok(blank.length === 0, 'EVERY field kind the simulation can create actually paints something', 'invisible: ' + blank.join(', '));
ok(drawn.length === kinds.size, 'and all ' + kinds.size + ' of them were exercised', drawn.join(', '));

// The one that is not decoration: a force field is terrain, so it gets its own named check.
ok(drawn.includes('force_field'), 'a FORCE FIELD is visible -- it blocks tiles, so an invisible one is a wall with no wall');
ok(drawn.includes('nova'), '...and so is a Purification Nova, which is a fuse you are meant to walk out of');

// Negative control on the harness itself: a kind with no branch must come back blank, or this whole
// file is asserting nothing.
painted = 0;
vm.runInContext(`(() => { const c = __mkCtx(); FX.drawField(c, { kind: 'no_such_kind_xyz', x: 100, y: 100, r: 2, t: 10, owner: 0 }, 0); })()`, ctx);
ok(painted === 0, 'the harness is not vacuous: an unknown kind paints nothing and is detected as blank', 'painted ' + painted);

console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
