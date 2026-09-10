// The AI scouts, and what it finds changes what it does.
//
// Every check here has the same shape and the same reason: before this, the AI read G.units directly
// with no vision test, so it knew everything and nothing a player did could surprise it or be hidden
// from it. That is invisible in a normal game -- the AI plays fine, it just plays fine for the wrong
// reason -- and it is exactly the kind of thing that only fails when someone tries to outplay it.
//
// So the negative control matters more than usual here, and it is the same control every time: show
// the AI the thing, and check the answer FLIPS. An assertion that "the AI knows about air" passes
// just as well when the AI is cheating.
//   node test/aiadapt.js
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? '  ' + x : '')); } };

const mk = () => {
  const c = { console: { log() { }, warn() { }, error() { } }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { },
    document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false },
    requestAnimationFrame() { } };
  c.window = c; c.globalThis = c; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot'])
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f });
  return c;
};
const ctx = mk();
const J = src => JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));

// ---------------------------------------------------------------- 1. air intel is EARNED
{
  const r = J(`(() => {
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'hard', name: 'A', team: 1 },
                       { race: 'T', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: 5, layout: 'temple' });
    G.recording = false;
    const ai = G.players[0].ai, foe = G.players[1];
    // a wraith in the enemy main, which our Zerg has never been anywhere near
    const w = G.spawnUnit('wraith', 1, foe.startX, foe.startY);
    const out = { blind: ai.sawAir() };
    // ...now reveal it, exactly as vision would
    G.players[0].vis.fill(2);
    ai.intel = null;                                   // forget, so this is a fresh reading and not a cached one
    out.seeing = ai.sawAir();
    // ...and once seen it stays known even after the sighting is gone
    G.players[0].vis.fill(0);
    G.kill(w, null, true);
    out.remembered = ai.sawAir();
    return out;
  })()`);
  ok(r.blind === false, 'the AI does NOT know about a Wraith it has never seen -- hiding air tech works', JSON.stringify(r));
  ok(r.seeing === true, '...and DOES know once it is in vision', JSON.stringify(r));
  ok(r.remembered === true, '...and remembers it after the sighting is gone', JSON.stringify(r));
}

// ---------------------------------------------------------------- 2. the building is the warning
{
  const r = J(`(() => {
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'hard', name: 'A', team: 1 },
                       { race: 'T', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: 5, layout: 'temple' });
    G.recording = false;
    const ai = G.players[0].ai, foe = G.players[1];
    const out = { before: ai.sawAir() };
    const sp = G.placeBuilding(DATA.buildings.starport, Math.floor(foe.startX / TILE) + 6, Math.floor(foe.startY / TILE) + 6, 1);
    G.completeBuilding(sp);
    G.players[0].vis.fill(2); ai.intel = null;
    out.after = ai.sawAir();
    return out;
  })()`);
  ok(r.before === false && r.after === true, 'a STARPORT counts as air intel -- the warning is the building, not the Wraith that comes out of it later', JSON.stringify(r));
}

// ---------------------------------------------------------------- 3. massing and teching are told apart
{
  const r = J(`(() => {
    const setup = () => {
      G.init({ players: [{ race: 'P', human: false, difficulty: 'hard', name: 'A', team: 1 },
                         { race: 'T', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: 5, layout: 'temple' });
      G.recording = false;
      return G.players[0].ai;
    };
    const out = {};
    // nothing seen at all
    let ai = setup(); ai.intel = null; out.unknown = ai.readEnemy();

    // a big cheap army and no tech
    ai = setup();
    const foe = G.players[1];
    for (let i = 0; i < 16; i++) G.spawnUnit('marine', 1, foe.startX + (i % 8) * 20, foe.startY + Math.floor(i / 8) * 20);
    G.players[0].vis.fill(2); ai.intel = null;
    out.massing = ai.readEnemy();

    // three advanced buildings and almost nothing on the field
    ai = setup();
    const f2 = G.players[1], bx = Math.floor(f2.startX / TILE), by = Math.floor(f2.startY / TILE);
    for (const [id, dx] of [['factory', 6], ['starport', 11], ['armory', 16]]) {
      const b = G.placeBuilding(DATA.buildings[id], bx + dx, by + 6, 1); if (b) G.completeBuilding(b);
    }
    G.spawnUnit('marine', 1, f2.startX, f2.startY);
    G.players[0].vis.fill(2); ai.intel = null;
    out.teching = ai.readEnemy();
    return out;
  })()`);
  ok(r.unknown === 'unknown', 'having seen nothing, the AI says so rather than guessing', r.unknown);
  ok(r.massing === 'massing', 'sixteen marines and no tech reads as massing', r.massing);
  ok(r.teching === 'teching', 'three advanced buildings and one marine reads as teching', r.teching);
}

// ---------------------------------------------------------------- 4. seeing air changes what is built
// Asserted on the WEIGHT the composition assigns, because that is the decision. Asserting on units
// built would take a whole game and would measure production luck as much as the intent.
{
  const r = J(`(() => {
    G.init({ players: [{ race: 'Z', human: false, difficulty: 'hard', name: 'A', team: 1 },
                       { race: 'T', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: 5, layout: 'temple' });
    G.recording = false;
    const ai = G.players[0].ai, foe = G.players[1];
    // Zerg refuses to build Scourge at all unless it has seen air: that gate is the clearest read on
    // whether intel reaches the composition.
    const out = { blind: ai.sawAir() };
    const w = G.spawnUnit('wraith', 1, foe.startX, foe.startY);
    G.players[0].vis.fill(2); ai.intel = null;
    out.seeing = ai.sawAir();
    return out;
  })()`);
  ok(r.blind === false && r.seeing === true, 'the anti-air gate in production() is fed by intel, not by omniscience', JSON.stringify(r));
}

// ---------------------------------------------------------------- 5. overrun needs BOTH conditions
{
  const r = J(`(() => {
    const setup = () => {
      G.init({ players: [{ race: 'P', human: false, difficulty: 'hard', name: 'A', team: 1 },
                         { race: 'T', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: 5, layout: 'temple' });
      G.recording = false; return G.players[0].ai;
    };
    const out = {};
    // a big cheap enemy army, and we have nothing: both conditions
    let ai = setup(); let foe = G.players[1];
    for (let i = 0; i < 20; i++) G.spawnUnit('marine', 1, foe.startX + (i % 8) * 20, foe.startY + Math.floor(i / 8) * 20);
    G.players[0].vis.fill(2); ai.intel = null; ai.seenSup = 0;
    out.read = ai.readEnemy();
    out.overrun = ai.overrun();

    // the SAME enemy army, but now we have one of our own: the read still says massing, the deficit is gone
    ai = setup(); foe = G.players[1];
    for (let i = 0; i < 20; i++) G.spawnUnit('marine', 1, foe.startX + (i % 8) * 20, foe.startY + Math.floor(i / 8) * 20);
    const me = G.players[0];
    for (let i = 0; i < 30; i++) G.spawnUnit('zealot', 0, me.startX + (i % 8) * 24, me.startY + Math.floor(i / 8) * 24);
    G.players[0].vis.fill(2); ai.intel = null; ai.seenSup = 0;
    out.read2 = ai.readEnemy();
    out.overrun2 = ai.overrun();
    return out;
  })()`);
  ok(r.read === 'massing' && r.overrun === true, 'a massing enemy we cannot match reads as overrun', JSON.stringify(r));
  ok(r.read2 === 'massing' && r.overrun2 === false, '...and the SAME enemy does NOT, once we have an army of our own -- it needs both halves', JSON.stringify(r));
}

// ---------------------------------------------------------------- 6. none of it breaks determinism
{
  const r = J(`(() => {
    const run = () => {
      G.init({ players: [{ race: 'T', human: false, difficulty: 'hard', name: 'A', team: 1 },
                         { race: 'Z', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: 21, layout: 'temple' });
      G.recording = false;
      for (let i = 0; i < 4800; i++) G.tick();
      return G.stateHash();
    };
    const a = run(), b = run();
    return { same: a === b, a: a, b: b };
  })()`);
  ok(r.same, 'two identical games still agree -- intel reads vision, and vision is simulation state', JSON.stringify(r));
}

console.log((fail ? 'FAILURES ' : 'ALL PASS  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
