// FIXLIST-M15 B1 + B3 -- the Zerg larva card, and one refused click saying one thing.
//
// Item 6 reported two errors from one keypress: "when I try to build a drone at population limit as
// Zerg it gives me the error Spire required in addition to the correct error which says spawn more
// overlords". Only half of that was reproducible at first, and the fixlist said so and said to build
// the probe before guessing. Both halves turned out to be real, and they are ONE bug plus one other.
//
// THE PROBE, driving the real UI at a real supply cap:
//
//     normal hotkeys, press D   ->  "Spawn more overlords."      (correct)
//     grid hotkeys,   press D   ->  "Requires Spire"             (the report)
//
// The cause is the card, not the message. buildCard emitted Set Rally FIRST asking for slot 6, and
// UI.paginate ignores the slot a flowed button asks for -- it renumbers by array index. So Set Rally
// took slot 0, every morph shifted one place right, and Drone was not in the top-left of its own card.
// Grid hotkeys are assigned by SLOT from 'QWERASDFZXCV', so the shift moved D off Queen and onto
// Scourge, which needs a Spire.
//
// The other half is a simplification rather than a second bug, and the negative control is what
// settled that: the button walked EVERY selected larva and only stopped on success, so a refused
// click re-ran the refusal path once per larva. It did NOT produce a visible stream of errors --
// ALERTS.supply.cool silences a repeated supply refusal for forty seconds -- so B3 above is the whole
// of what the player actually saw.
//
//   node test/larvacard.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const errors = [];
const fakeCanvas = () => ({ width: 64, height: 64, style: {}, addEventListener() { }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 64, height: 64 }), getContext: () => stub() });
const stub = () => new Proxy({}, { get: (t, k) => { if (k === 'canvas') return { width: 64, height: 64 }; if (k === 'measureText') return () => ({ width: 10 }); if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) }); if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() { } }); return () => { }; }, set: () => true });
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' }, devicePixelRatio: 1,
  document: { getElementById: () => fakeCanvas(), createElement: () => fakeCanvas(), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain',
  'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render', 'ui', 'hud'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

// A Zerg game driven to a genuine supply block, with larvae waiting.
const SCENE = `
  G.init({ players: [{ race: 'Z', human: true, difficulty: 'easy', name: 'You', team: 1 },
                     { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 }], seed: 3, layout: 'temple' });
  G.checkVictory = () => { }; G.human = 0;
  UI.running = true;   // REVIEW-M17: UI.onKey ignores every key while no game is running (they belong to the menu's text fields); this harness starts its game with G.init, not UI.start, so it says so itself
  const p = G.players[0];
  for (let i = 0; i < 24 * 60 * 2; i++) G.tick();
  p.minerals = 5000; p.gas = 5000;
  let guard = 0;
  while (p.supUsed < p.supMax && guard++ < 400) {
    const l = G.units.find(u => u.alive && u.owner === 0 && u.def.larva);
    if (!l) { for (let i = 0; i < 40; i++) G.tick(); continue; }
    G.larvaMorph(l, 'drone'); for (let i = 0; i < 2; i++) G.tick();
  }
  for (let i = 0; i < 24 * 40; i++) G.tick();          // let larvae come back while still blocked
  const larvae = () => G.units.filter(u => u.alive && u.owner === 0 && u.def.larva);
  const press = (k, grid) => {
    const was = UI.gridKeys; UI.gridKeys = grid;
    const m = []; const real = p.msg.bind(p);
    p.msg = (t, kind) => { m.push(kind + ': ' + t); return real(t, kind); };
    p.alertAt = {};                                   // clear the one-voice cooldown, or nothing is said
    UI.selection = larvae();
    UI.onKey({ key: k, preventDefault() { }, ctrlKey: false, shiftKey: false, altKey: false });
    p.msg = real; UI.gridKeys = was; return m;
  };
`;

// =============================================================================
// 1. the scene is real -- the whole file is vacuous without this
// =============================================================================
const base = J(`(() => { ${SCENE}
  UI.selection = larvae();
  return { supUsed: p.supUsed, supMax: p.supMax, larvae: larvae().length,
    card: UI.paginate(UI.buildCard()).map(b => b.slot + ':' + b.label) };
})()`);
ok(base.supUsed >= base.supMax, 'the player really is supply blocked', base.supUsed + '/' + base.supMax);
ok(base.larvae >= 2, '...and really does have several larvae selected, which is what doubled the message', String(base.larvae));

// =============================================================================
// 2. B3: Drone is in the top-left of its own card
// =============================================================================
ok(base.card[0] === '0:Drone', 'THE FIRST BUTTON ON THE LARVA CARD IS DRONE -- Set Rally used to take that slot', base.card[0]);
ok(base.card[base.card.length - 1].endsWith('Set Rally'), '...and Set Rally sits at the end, out of the ladder', base.card[base.card.length - 1]);
// The invariant that catches this whole family rather than this one card: two buttons may not land on
// one slot. M14's B5 was the page turn drawn on top of Apollo Reactor; this is the same shape.
const dupes = J(`(() => { ${SCENE}
  const out = [];
  const check = (what) => {
    const seen = {}, card = UI.paginate(UI.buildCard());
    for (const b of card) { if (seen[b.slot]) out.push(what + ': slot ' + b.slot + ' = ' + seen[b.slot] + ' AND ' + b.label); seen[b.slot] = b.label; }
  };
  UI.selection = larvae(); check('larva');
  for (const id of ['hatchery', 'spawning_pool', 'drone', 'overlord', 'zergling']) {
    const u = G.units.find(x => x.alive && x.owner === 0 && x.def.id === id);
    if (u) { UI.selection = [u]; check(id); }
  }
  return out;
})()`);
ok(dupes.length === 0, 'NO TWO BUTTONS SHARE A SLOT on any card checked -- the invariant behind both this and M14 B5', dupes.join(' | '));

// =============================================================================
// 3. B1, second half: the reported "Requires Spire"
// =============================================================================
const keys = J(`(() => { ${SCENE}
  return { normal: press('d', false), grid: press('d', true),
    gridCard: (() => { const w = UI.gridKeys; UI.gridKeys = true; UI.selection = larvae();
      const c = UI.currentCard().map(b => b.hk + '=' + b.label); UI.gridKeys = w; return c; })() };
})()`);
ok(!keys.grid.some(m => /Spire/.test(m)),
  'PRESSING D WITH GRID KEYS NO LONGER SAYS "Requires Spire" -- the card is no longer shifted', JSON.stringify(keys.grid));
// ...and it reaches what is genuinely in that position, rather than nothing at all.
const gridD = keys.gridCard.find(x => x.startsWith('D='));
ok(gridD === 'D=Queen', 'with grid keys D reaches the button actually in slot 6, which is the Queen', String(gridD));
ok(keys.gridCard.includes('Q=Drone'), 'and under grid keys Drone is Q, the top-left key, because it is the top-left button');

// =============================================================================
// 4. B1, first half: one click is one attempt
// =============================================================================
// THIS IS A SIMPLIFICATION, NOT THE REPORTED BUG, and the negative control is what established that.
// The first version of this section asserted that one keypress now says one thing where it used to
// say three -- and the control showed the OLD loop says one thing too. ALERTS.supply.cool is 24*40
// frames, so once the supply alert has spoken every refusal for the next forty seconds is silent by
// design (M14's 'one condition, one voice'). The three identical errors seen while investigating came
// from a harness that cleared that cooldown, not from the game.
//
// What did change is the number of ATTEMPTS: the button walked every selected larva and stopped only
// on success, so a refused click re-ran the whole refusal path once per larva. Every larva is
// interchangeable -- if one cannot morph for cost, supply or requirements then none can -- so the
// extra passes could only ever repeat the same answer. That is what is measured here.
ok(keys.normal.length === 1, 'a refused click says one thing', keys.normal.length + ': ' + JSON.stringify(keys.normal));
ok(/overlord/i.test(keys.normal[0] || ''), '...and it is the right one', JSON.stringify(keys.normal));

const tries = J(`(() => { ${SCENE}
  let n = 0; const real = G.larvaMorph.bind(G);
  G.larvaMorph = (l, id) => { n++; return real(l, id); };
  UI.selection = larvae();
  UI.onKey({ key: 'd', preventDefault() { }, ctrlKey: false, shiftKey: false, altKey: false });
  const now = n;
  // ...and the OLD loop, run directly against the same blocked state for comparison
  n = 0; for (const l of UI.selection) if (l.def.larva) { if (G.larvaMorph(l, 'drone')) break; }
  const was = n;
  G.larvaMorph = real;
  return { now, was, larvae: UI.selection.length };
})()`);
ok(tries.now === 1, 'ONE REFUSED CLICK MAKES ONE ATTEMPT', 'attempts ' + tries.now);
ok(tries.was === tries.larvae && tries.larvae > 1,
  'NEGATIVE CONTROL: the old loop attempted once per larva, so the check above is not vacuous',
  tries.was + ' attempts for ' + tries.larvae + ' larvae');

// =============================================================================
// 5. the button still works when it is allowed to
// =============================================================================
// A fix that makes the refusal quiet by making the button do nothing would pass everything above.
const works = J(`(() => { ${SCENE}
  p.supMax = 200;                                      // unblock
  const before = G.units.filter(u => u.alive && u.owner === 0 && (u.def.id === 'drone' || u.def.egg)).length;
  UI.selection = larvae();
  UI.onKey({ key: 'd', preventDefault() { }, ctrlKey: false, shiftKey: false, altKey: false });
  for (let i = 0; i < 5; i++) G.tick();
  const after = G.units.filter(u => u.alive && u.owner === 0 && (u.def.id === 'drone' || u.def.egg)).length;
  return { before, after };
})()`);
ok(works.after > works.before, 'ANTI-VACUITY: with supply free, pressing D actually morphs a larva', JSON.stringify(works));

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
