// FIXLIST-M15 B2 -- a refused ability says WHY, and no ability refuses in silence.
//
// Item 4's second half: "it doesn't tell you what you have to target when you try targeting something
// and it says 'invalid target' only". That was true of Spawn Broodlings and of six others -- the bare
// string 'Invalid target.' appeared seven times in js/abilities.js and never once said what would
// have been valid.
//
// The audit the item asked for found an eighth, and worse than generic: Psionic Storm refunded its 75
// energy and said NOTHING when the target spot was already burning, so the click looked like the game
// had swallowed it.
//
// Same shape as M14's A4, where four refusal states in G.queueAddon said nothing at all and the audit
// behind them turned up a whole class of bug nobody had reported.
//
//   node test/refusals.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

// =============================================================================
// 1. the generic message is gone from the source
// =============================================================================
{
  const src = fs.readFileSync(path.join(root, 'js', 'abilities.js'), 'utf8');
  const code = src.split(/\r?\n/).filter(l => !/^\s*\/\//.test(l)).join('\n');
  const n = (code.match(/'Invalid target\.'/g) || []).length;
  ok(n === 0, "the bare 'Invalid target.' is gone from every one of the seven places it appeared", String(n) + ' left');
  // ...and it was not removed by deleting the refusals. Every one must still say something.
  const says = (code.match(/p\.msg\(/g) || []).length;
  ok(says >= 20, 'ANTI-VACUITY: the refusals still speak, they were not simply silenced', String(says) + ' p.msg calls');
}

// =============================================================================
// 2. each refusal names the reason, in a running game
// =============================================================================
// Built by hand so each failing condition is hit deliberately rather than hoped for.
const SCENE = `
  G.init({ players: [{ race: 'Z', human: true, difficulty: 'easy', name: 'You', team: 1 },
                     { race: 'T', human: false, difficulty: 'easy', name: 'B', team: 2 },
                     { race: 'P', human: false, difficulty: 'easy', name: 'C', team: 3 }], seed: 5, layout: 'temple' });
  G.checkVictory = () => { }; G.human = 0;
  const p = G.players[0];
  const said = [];
  p.msg = (t, k) => { said.push(t); };
  const spawn = (id, owner, tx, ty) => G.spawnUnit(id, owner, tx * TILE, ty * TILE);
  // a caster of our own with the energy to try
  const caster = (id) => { const c = spawn(id, 0, 40, 40); c.maxEnergy = 250; c.energy = 250; return c; };
  const say = (fn) => { said.length = 0; fn(); return said.slice(); };
`;

const msgs = J(`(() => { ${SCENE}
  const out = {};
  // --- Spawn Broodlings: the reported one. Three different reasons, three different sentences.
  {
    const q = caster('queen');
    const air = spawn('wraith', 1, 41, 40);
    const bld = spawn('supply_depot', 1, 44, 40);
    const bot = spawn('dragoon', 2, 42, 40);
    out.broodAir = say(() => Abilities.cast(q, 'spawn_broodling', air, air.x, air.y));
    out.broodBuilding = say(() => Abilities.cast(q, 'spawn_broodling', bld, bld.x, bld.y));
    out.broodRobotic = say(() => Abilities.cast(q, 'spawn_broodling', bot, bot.x, bot.y));
  }
  // --- Consume: not yours, and itself
  {
    const d = caster('defiler');
    const foe = spawn('marine', 1, 41, 40);
    out.consumeEnemy = say(() => Abilities.cast(d, 'consume', foe, foe.x, foe.y));
    out.consumeSelf = say(() => Abilities.cast(d, 'consume', d, d.x, d.y));
  }
  // --- Mind Control: a building, and one of your own
  {
    const da = caster('dark_archon');
    const bld = spawn('supply_depot', 1, 44, 40);
    const mine = spawn('zergling', 0, 41, 41);
    out.mindBuilding = say(() => Abilities.cast(da, 'mind_control', bld, bld.x, bld.y));
    out.mindOwn = say(() => Abilities.cast(da, 'mind_control', mine, mine.x, mine.y));
  }
  // --- Contaminate: an ally's building rather than an enemy's
  {
    const ov = caster('overseer');
    const own = G.units.find(x => x.alive && x.owner === 0 && x.isBuilding && x.done);
    out.contamOwn = own ? say(() => Abilities.cast(ov, 'contaminate', own, own.x, own.y)) : ['NO OWN BUILDING'];
  }
  // --- Hallucination: a building
  {
    const ht = caster('high_templar');
    const bld = spawn('supply_depot', 1, 44, 40);
    out.halluBuilding = say(() => Abilities.cast(ht, 'hallucination', bld, bld.x, bld.y));
  }
  return out;
})()`);

const has = (k, re, what) => ok(msgs[k] && msgs[k].length === 1 && re.test(msgs[k][0]), what, JSON.stringify(msgs[k]));
has('broodAir', /air/i, 'Spawn Broodlings on an AIR unit says it cannot target air');
has('broodBuilding', /building/i, '...on a BUILDING it says it cannot target buildings');
has('broodRobotic', /organic|robotic/i, '...and on a Protoss robotic unit it says it needs an organic ground unit');
ok(new Set([msgs.broodAir[0], msgs.broodBuilding[0], msgs.broodRobotic[0]]).size === 3,
  'AND THOSE ARE THREE DIFFERENT SENTENCES -- the whole point is that the reason is named');
has('consumeEnemy', /your own/i, 'Consume on an enemy unit says it only works on your own');
has('consumeSelf', /itself/i, '...and on the Defiler itself it says so');
has('mindBuilding', /building/i, 'Mind Control on a building says it cannot take buildings');
has('mindOwn', /enemy/i, '...and on your own unit it says it only works on enemy units');
has('contamOwn', /enemy/i, 'Contaminate on your own building says it only works on enemy buildings');
has('halluBuilding', /building/i, 'Hallucination on a building says it cannot copy a building');

// =============================================================================
// 3. the audit finding: nothing refuses in silence
// =============================================================================
const storm = J(`(() => { ${SCENE}
  const ht = caster('high_templar');
  const x = 44 * TILE, y = 44 * TILE;
  // The CALLER deducts the cost before cast() runs (js/abilities.js:240), so a direct call has to
  // model that or the refund inside the refusal looks like free energy.
  const cost = DATA.abilities.psi_storm.energy;
  ht.energy -= cost; const first = say(() => Abilities.cast(ht, 'psi_storm', null, x, y));
  const e1 = ht.energy;
  ht.energy -= cost; const second = say(() => Abilities.cast(ht, 'psi_storm', null, x, y));
  return { first, second, refunded: ht.energy === e1 };
})()`);
ok(storm.first.length === 0, 'the first Psionic Storm goes off without complaint', JSON.stringify(storm.first));
ok(storm.second.length === 1 && /already/i.test(storm.second[0]),
  'A SECOND STORM ON THE SAME SPOT NOW SAYS SO -- it used to refund the energy and say nothing at all', JSON.stringify(storm.second));
ok(storm.refunded, '...and the energy is still refunded, which was the one part that already worked');

// =============================================================================
// 4. a refused cast still costs nothing
// =============================================================================
// Rewording a refusal must not change what it does. This is the check that would catch a rewrite that
// accidentally let the ability fire, or ate the energy on the way past.
const cost = J(`(() => { ${SCENE}
  const q = caster('queen');
  const air = spawn('wraith', 1, 41, 40);
  const e0 = q.energy, alive0 = air.alive;
  q.energy -= DATA.abilities.spawn_broodling.energy;      // what the caller does before cast()
  Abilities.cast(q, 'spawn_broodling', air, air.x, air.y);
  return { energyKept: q.energy === e0, targetSurvived: air.alive && alive0,
    broodlings: G.units.filter(z => z.alive && z.def.id === 'broodling').length };
})()`);
ok(cost.energyKept, 'a refused Spawn Broodlings still refunds its energy', JSON.stringify(cost));
ok(cost.targetSurvived && cost.broodlings === 0, '...and does not kill the thing it refused to target');

// =============================================================================
// 5. negative control
// =============================================================================
// If the messages were reverted to the generic string, section 2 must go red rather than shrug.
{
  const src = fs.readFileSync(path.join(root, 'js', 'abilities.js'), 'utf8');
  const broken = src.replace(/p\.msg\(t\.isBuilding \? 'Spawn Broodlings[\s\S]{0,220}?'error'\)/, "p.msg('Invalid target.', 'error')");
  ok(broken !== src, 'the control could actually patch the source', broken === src ? 'no match' : 'patched');
  const c2 = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { },
    document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] } };
  c2.window = c2; vm.createContext(c2);
  for (const f of ['data', 'map', 'sim', 'game', 'combat'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c2, { filename: f });
  vm.runInContext(broken, c2, { filename: 'abilities-broken' });
  for (const f of ['commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c2, { filename: f });
  const back = JSON.parse(vm.runInContext('JSON.stringify((() => { ' + SCENE.replace(/`/g, '') + `
    const q = caster('queen'); const air = spawn('wraith', 1, 41, 40);
    return say(() => Abilities.cast(q, 'spawn_broodling', air, air.x, air.y));
  })())`, c2));
  ok(back.length === 1 && /Invalid target/.test(back[0]),
    'NEGATIVE CONTROL: put the generic message back and the game really does say it again, so section 2 is testing the fix', JSON.stringify(back));
}

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
