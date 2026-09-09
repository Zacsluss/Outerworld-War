// Unit flavour (M11 wave-one idea 17): the voice lines, and the state-aware delivery on top of them.
//   node test/flavour.js
//
// Four things are worth asserting here and one of them is not obvious.
//
//   * the DATA -- every race has all nine pools filled and no line is written twice, because a
//     duplicate is invisible in a diff and audible in about four minutes of play;
//   * the DEGRADATION -- `Voice.speak` is called from the sim's alert path (`Player.msg`), which every
//     headless harness in this repo runs, and there is no speechSynthesis in node. It has to return
//     rather than throw, and nothing else here would notice if it stopped doing so;
//   * the REGISTERS -- a rank-3 unit and a badly scarred one must actually reach different pools and a
//     different pitch, which is the whole of the feature and is otherwise only checkable by ear;
//   * the THROTTLE -- forty selected units are forty calls in one frame, and without the gap they
//     queue into a wall that outlives the fight that caused it.
//
// On the build stamp: the literal question ("is the hash the same as before?") cannot be pinned to a
// constant in this file, because sim files are being edited alongside it and a pinned hash would fail
// for reasons that have nothing to do with audio. So this asserts the invariant that pinning was
// standing in for, and asserts it harder than a constant could: the stamp is computed with audio.js
// absent, then again with it loaded, then again with `Voice` deliberately vandalised, and all three
// must be the same sixteen characters. That is HANDOFF.md invariant 6 stated as a test.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };

const SIM = ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'build'];

// A context with the simulation in it, a clock we drive by hand, and optionally a speech synthesiser
// that writes down what it was asked to say instead of saying it.
function makeCtx(withTTS) {
  const spoken = [];
  const el = () => ({ style: {}, addEventListener() { }, click() { }, remove() { }, getContext: () => null, value: '', appendChild() { } });
  const ctx = {
    console: { log() { }, warn() { }, error() { } }, Math,
    addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; }, clearInterval() { },
    localStorage: { _v: {}, getItem(k) { return this._v[k] || null; }, setItem(k, v) { this._v[k] = v; } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
    requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' },
  };
  ctx.__clock = { t: 0 };
  ctx.performance = { now: () => ctx.__clock.t };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of SIM) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  if (withTTS) {
    ctx.speechSynthesis = { speaking: false, cancelled: 0, speak(u) { spoken.push({ text: String(u.text), pitch: +u.pitch, rate: +u.rate, volume: +u.volume }); }, cancel() { this.cancelled++; } };
    ctx.SpeechSynthesisUtterance = function (t) { this.text = t; this.pitch = 1; this.rate = 1; this.volume = 1; };
  }
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'audio.js'), 'utf8'), ctx, { filename: 'audio.js' });
  return { ctx, spoken };
}
const run = (h, code) => vm.runInContext(code, h.ctx);
// One line, spoken with the clock moved well past the gap so the throttle is not what is under test.
function say(h, expr) {
  h.ctx.__clock.t += 10000;
  const n = h.spoken.length; const ret = run(h, expr);
  return { ret, said: h.spoken.length > n ? h.spoken[h.spoken.length - 1] : null };
}

// ---------------------------------------------------------------- 1. the lines themselves
const data = makeCtx(false);
const races = run(data, 'JSON.parse(JSON.stringify(Voice.races))');
const lines = run(data, 'JSON.parse(JSON.stringify(Voice.lines))');
const KINDS = ['sel', 'ack', 'atk'];

ok(Array.isArray(races) && races.length === 3 && races.join(',') === 'T,P,Z', 'three races are declared', JSON.stringify(races));

// every pool of every register of every race, filled
for (const r of races) {
  const l = lines[r] || {};
  const empty = [];
  const pools = [];
  for (const k of KINDS) { const a = l[k]; pools.push([k, a]); if (!Array.isArray(a) || !a.length) empty.push(k); }
  for (const reg of ['vet', 'hurt']) for (const k of KINDS) { const a = (l[reg] || {})[k]; pools.push([reg + '.' + k, a]); if (!Array.isArray(a) || !a.length) empty.push(reg + '.' + k); }
  ok(empty.length === 0, r + ': all nine pools have lines (select, acknowledge, attack x base/veteran/scarred)', empty.join(' '));

  const all = pools.filter(p => Array.isArray(p[1])).reduce((a, p) => a.concat(p[1]), []);
  const bad = all.filter(s => typeof s !== 'string' || s.trim() !== s || s.length < 2);
  ok(bad.length === 0, r + ': every line is a trimmed, non-trivial string (' + all.length + ' of them)', JSON.stringify(bad.slice(0, 3)));

  const seen = new Set(), dup = [];
  for (const s of all) { if (seen.has(s)) dup.push(s); seen.add(s); }
  ok(dup.length === 0, r + ': no line is written twice', dup.slice(0, 4).join(' | '));

  ok(all.length >= 24, r + ': enough lines that repetition does not set in (' + all.length + ')', String(all.length));
}

// Zerg is not speech, but it still has to survive a text-to-speech engine: a fragment with no vowel
// gets spelled out letter by letter on some voices, which reads as a robot rather than an animal.
{
  const z = lines.Z;
  const all = KINDS.reduce((a, k) => a.concat(z[k], z.vet[k], z.hurt[k]), []);
  // Per token, not per line: "Kthaa. Rrk." passes a whole-string test and still gets "arr arr kay"
  // read out of the second half of it. This check found exactly that when it was first written.
  const noVowel = all.reduce((a, s) => a.concat(s.split(/\s+/).map(w => w.replace(/[^A-Za-z]/g, '')).filter(w => w && !/[aeiouy]/i.test(w))), []);
  ok(noVowel.length === 0, 'Z: every fragment carries a vowel, so no voice spells it out letter by letter', noVowel.join(' '));
  const words = new Set(KINDS.reduce((a, k) => a.concat(lines.T[k], lines.P[k]), []).map(s => s.toLowerCase()));
  ok(!all.some(s => words.has(s.toLowerCase())), 'Z: shares no line with a race that has a language');
}

// the per-race voice profiles the delivery is built on
{
  const a = lines.adv;
  ok(races.every(r => a[r] && typeof a[r].pitch === 'number' && typeof a[r].sPitch === 'number' && typeof a[r].sRate === 'number'), 'every race has an adviser voice and a unit voice', JSON.stringify(a));
  ok(a.Z.sPitch < a.P.sPitch && a.P.sPitch < a.T.sPitch, 'Zerg speaks below Protoss, Protoss below Terran', [a.Z.sPitch, a.P.sPitch, a.T.sPitch].join(' < '));
}

// ---------------------------------------------------------------- 2. no speechSynthesis, no noise
// Every headless harness in this repo loads sim files that call Voice.announce through Player.msg.
{
  const r = run(data, `(() => {
    const out = { calls: 0, threw: null, spoke: false, hasTTS: typeof speechSynthesis !== 'undefined' };
    for (const race of Voice.races) for (const kind of ['sel', 'ack', 'atk', 'adv']) {
      try { out.calls++; if (Voice.speak('a line', race, kind, { pitch: 1, rate: 1, vol: 1 })) out.spoke = true; }
      catch (e) { out.threw = race + '/' + kind + ': ' + e.message; }
    }
    // ...and the three entry points, on real units, including the alert path the sim itself uses
    try {
      G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 11 });
      const p = G.players[0];
      const u = G.spawnUnit('marine', 0, p.startX + 60, p.startY + 60);
      Voice.select(u); Voice.ack(u); Voice.announce('Your base is under attack.');
      p.msg('Your base is under attack.', 'attack');
      out.entryThrew = null;
    } catch (e) { out.entryThrew = e.message; }
    return out;
  })()`);
  ok(r.hasTTS === false, 'the headless context genuinely has no speechSynthesis');
  ok(r.threw === null && r.calls === 12, 'speak() does not throw for any race or kind without a synthesiser', String(r.threw));
  ok(r.spoke === false, 'and it says nothing rather than half-speaking');
  ok(r.entryThrew === null, 'select / ack / announce and the sim alert path all degrade silently', String(r.entryThrew));
}

// ---------------------------------------------------------------- 3. rank and scars change the voice
const v = makeCtx(true);
run(v, `
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 5 });
  const p = G.players[0];
  // three marines with the same id modulo 3, so the per-unit timbre offset is identical and the only
  // thing separating their pitch is rank and scarring
  const three = [];
  while (three.length < 3) { const m = G.spawnUnit('marine', 0, p.startX + 60 + three.length * 30, p.startY + 60); if (m.id % 3 === (three.length ? three[0].id % 3 : m.id % 3)) three.push(m); }
  this.fresh = three[0]; this.vet3 = three[1]; this.hurt = three[2];
  this.vet3.kills = 12;                                        // rank 3 is ten kills
  for (let i = 0; i < 80 && this.hurt.scarred / this.hurt.def.hp < 0.35; i++) { this.hurt.hp = this.hurt.maxHp; G.damageRaw(this.hurt, 8, null); }
  this.state = { freshVet: this.fresh.vet, vet3Vet: this.vet3.vet, hurtWorn: +(this.hurt.scarred / this.hurt.def.hp).toFixed(3), sameTimbre: (this.fresh.id % 3) === (this.vet3.id % 3) && (this.fresh.id % 3) === (this.hurt.id % 3) };
`);
const st = run(v, 'JSON.parse(JSON.stringify(this.state))');
ok(st.freshVet === 0 && st.vet3Vet === 3, 'the fixture really is a rank-0 and a rank-3 unit', JSON.stringify(st));
ok(st.hurtWorn >= 0.3, 'the fixture really is heavily scarred, through the sim damage path', String(st.hurtWorn));
ok(st.sameTimbre, 'the three share a timbre offset, so only rank and scarring can separate them');

const a0 = say(v, 'Voice.select(this.fresh)');
const a3 = say(v, 'Voice.select(this.vet3)');
const aH = say(v, 'Voice.select(this.hurt)');
ok(a0.said && lines.T.sel.includes(a0.said.text), 'rank 0 draws from the base select pool', a0.said && a0.said.text);
ok(a3.said && lines.T.vet.sel.includes(a3.said.text), 'rank 3 draws from the veteran select pool', a3.said && a3.said.text);
ok(aH.said && lines.T.hurt.sel.includes(aH.said.text), 'a badly scarred unit draws from the scarred pool', aH.said && aH.said.text);
ok(a3.said.pitch < a0.said.pitch, 'a veteran speaks lower than a fresh unit', a0.said.pitch + ' -> ' + a3.said.pitch);
ok(aH.said.pitch < a3.said.pitch && aH.said.rate < a0.said.rate, 'a scarred unit is lower and slower still', JSON.stringify([a0.said.pitch, a3.said.pitch, aH.said.pitch]));
ok(aH.said.volume < a0.said.volume, 'and quieter -- it is in worse shape, not more dramatic', a0.said.volume + ' -> ' + aH.said.volume);

// scarring beats rank on the words, and rank still lands on the delivery
const both = say(v, '(() => { this.hurt.kills = 12; return Voice.select(this.hurt); })()');
ok(both.said && lines.T.hurt.sel.includes(both.said.text), 'a scarred veteran says the worn line, not the hard one', both.said && both.said.text);
ok(both.said.pitch < aH.said.pitch, 'but says it in the harder voice', aH.said.pitch + ' -> ' + both.said.pitch);
run(v, 'this.hurt.kills = 0;');

// an attack order gets the attack register, from the order itself rather than from a new call site
const mv = say(v, '(() => { this.fresh.setOrder({ type: "move", x: 900, y: 900 }); return Voice.ack(this.fresh); })()');
const at = say(v, '(() => { this.fresh.setOrder({ type: "attackmove", x: 900, y: 900 }); return Voice.ack(this.fresh); })()');
ok(mv.said && lines.T.ack.includes(mv.said.text), 'a move order is acknowledged', mv.said && mv.said.text);
ok(at.said && lines.T.atk.includes(at.said.text), 'an attack-move is barked', at.said && at.said.text);
const qd = say(v, '(() => { this.fresh.setOrder({ type: "move", x: 800, y: 800 }); this.fresh.setOrder({ type: "attack", target: this.vet3 }, true); return Voice.ack(this.fresh); })()');
ok(qd.said && lines.T.atk.includes(qd.said.text), 'a shift-queued attack is read off the queue, not off the live order', qd.said && qd.said.text);

// Music.fight, borrowed rather than recomputed
const calm = say(v, '(() => { Music.fight = false; this.fresh.setOrder({ type: "move", x: 700, y: 700 }); return Voice.ack(this.fresh); })()');
const loud = say(v, '(() => { Music.fight = true; this.fresh.setOrder({ type: "move", x: 700, y: 700 }); return Voice.ack(this.fresh); })()');
ok(calm.said && lines.T.ack.includes(calm.said.text), 'out of combat, a move order is answered', calm.said && calm.said.text);
ok(loud.said && lines.T.atk.includes(loud.said.text), 'in a fight, the same order is barked (Music.fight)', loud.said && loud.said.text);
ok(loud.said.rate > calm.said.rate, 'and delivered faster', calm.said.rate + ' -> ' + loud.said.rate);
run(v, 'Music.fight = false;');

// ...and with the music bed switched off entirely, which is a checkbox away from voice in the settings
// panel and would otherwise leave Music.fight false for the whole game.
{
  const bedOff = run(v, '(() => { Music.on = false; Music.timer = null; Music.ctx = null; Music.fight = false; return { flag: Music.fight, asked: Voice.fighting() }; })()');
  ok(bedOff.flag === false && bedOff.asked === false, 'with no music bed and no fight, the fallback says no', JSON.stringify(bedOff));
  const shot = say(v, '(() => { this.fresh.lastHit = G.frame; this.fresh.setOrder({ type: "move", x: 640, y: 640 }); return Voice.ack(this.fresh); })()');
  ok(run(v, 'Voice.fighting()') === true, 'and yes once our units are trading damage, without the bed running');
  ok(shot.said && lines.T.atk.includes(shot.said.text), 'so a music-off player still gets the fight register', shot.said && shot.said.text);
  run(v, 'this.fresh.lastHit = -9999;');
}

// the same unit does not have one catchphrase for life
{
  const texts = new Set();
  for (let i = 0; i < 12; i++) { const r = say(v, '(() => { G.frame += 64; return Voice.select(this.fresh); })()'); if (r.said) texts.add(r.said.text); }
  ok(texts.size > 1, 'selecting the same unit repeatedly does not give the same line every time', texts.size + ' distinct of ' + lines.T.sel.length);
}

// ---------------------------------------------------------------- 4. the other two races speak
for (const [race, unit, other] of [['P', 'zealot', 'T'], ['Z', 'zergling', 'T']]) {
  const h = makeCtx(true);
  run(h, `
    G.init({ players: [{ race: '${race}', human: true, name: 'A' }, { race: '${other}', human: false, difficulty: 'easy', name: 'B' }], seed: 7 });
    const p = G.players[0];
    this.u = G.spawnUnit('${unit}', 0, p.startX + 60, p.startY + 60);
    this.vet = G.spawnUnit('${unit}', 0, p.startX + 96, p.startY + 60); this.vet.kills = 12;
  `);
  const s = say(h, 'Voice.select(this.u)');
  const sv = say(h, 'Voice.select(this.vet)');
  ok(s.said && lines[race].sel.includes(s.said.text), race + ': a fresh unit speaks its own race', s.said && s.said.text);
  ok(sv.said && lines[race].vet.sel.includes(sv.said.text), race + ': a rank-3 unit reaches the veteran register', sv.said && sv.said.text);
  ok(s.said.pitch > 0 && s.said.pitch <= 2 && s.said.rate >= 0.1, race + ': pitch and rate stay inside what the Web Speech API accepts', JSON.stringify([s.said.pitch, s.said.rate]));
  if (race === 'Z') ok(s.said.pitch < 0.5, 'Z: a zergling is well under a human voice', String(s.said.pitch));
}

// ---------------------------------------------------------------- 5. the throttle still holds
{
  const h = makeCtx(true);
  run(h, `
    G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 9 });
    const p = G.players[0]; this.mob = [];
    for (let i = 0; i < 40; i++) this.mob.push(G.spawnUnit('marine', 0, p.startX + 40 + (i % 8) * 20, p.startY + 40 + Math.floor(i / 8) * 20));
  `);
  const gap = run(h, 'Voice.gap'), fightGap = run(h, 'Voice.fightGap');
  ok(gap >= 900 && fightGap >= gap, 'the gap is at least the 900 ms it always was, and a fight is not looser', gap + ' / ' + fightGap);

  h.ctx.__clock.t = 100000;
  run(h, 'for (const u of this.mob) Voice.select(u);');
  ok(h.spoken.length === 1, 'forty units selected in one frame produce one line, not forty', String(h.spoken.length));

  h.ctx.__clock.t += gap - 1;
  run(h, 'for (const u of this.mob) Voice.select(u);');
  ok(h.spoken.length === 1, 'and nothing more until the gap has actually elapsed', String(h.spoken.length));

  h.ctx.__clock.t += 2;
  run(h, 'for (const u of this.mob) Voice.select(u);');
  ok(h.spoken.length === 2, 'one more once it has', String(h.spoken.length));

  // the second half of the throttle: never on top of a line already in the air
  h.ctx.__clock.t += 60000;
  h.ctx.speechSynthesis.speaking = true;
  run(h, 'for (const u of this.mob) Voice.select(u);');
  ok(h.spoken.length === 2, 'nothing lands on top of a line that is still being spoken', String(h.spoken.length));
  h.ctx.speechSynthesis.speaking = false;

  // a fight is the moment there is least room for chatter
  h.ctx.__clock.t += 60000;
  run(h, 'Music.fight = true; Voice.select(this.mob[0]);');
  ok(h.spoken.length === 3, 'a line fires at the start of a fight', String(h.spoken.length));
  h.ctx.__clock.t += gap + 50;
  run(h, 'Voice.select(this.mob[1]);');
  ok(h.spoken.length === 3, 'but the peacetime gap is not enough during one', String(h.spoken.length));
  h.ctx.__clock.t += fightGap;
  run(h, 'Voice.select(this.mob[2]);');
  ok(h.spoken.length === 4, 'the wider fight gap is', String(h.spoken.length));
  run(h, 'Music.fight = false;');

  // an adviser line is not rate limited -- it is the game telling the player something -- but it does
  // cancel rather than queue, which is the same protection by another route
  const before = h.ctx.speechSynthesis.cancelled;
  run(h, 'Voice.announce("Nuclear launch detected."); Voice.announce("Your base is under attack.");');
  ok(h.spoken.length === 6, 'adviser lines are not dropped by the unit throttle', String(h.spoken.length));
  ok(h.ctx.speechSynthesis.cancelled === before + 2, 'they cancel what is speaking instead of queueing behind it', String(h.ctx.speechSynthesis.cancelled - before));
}

// ---------------------------------------------------------------- 6. the build stamp cannot move
// HANDOFF.md invariant 6: the stamp covers the simulation only, and audio.js is render-side.
{
  const bare = makeCtxNoAudio();
  const h0 = vm.runInContext('BUILD.hash()', bare);
  ok(/^[0-9a-f]{16}$/.test(h0), 'the stamp is sixteen hex characters', h0);

  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'audio.js'), 'utf8'), bare, { filename: 'audio.js' });
  const h1 = vm.runInContext('BUILD._hash = null; BUILD.hash()', bare);
  ok(h1 === h0, 'loading audio.js does not move the stamp', h0 + ' -> ' + h1);

  const h2 = vm.runInContext(`
    Voice.lines.T.sel.push('An entirely new line.');
    Voice.lines.Z.hurt.atk.length = 0;
    Voice.speak = function () { return true; };
    Voice.gap = 1; Music.fight = true; Music.bar = function () { };
    BUILD._hash = null; BUILD.hash()`, bare);
  ok(h2 === h0, 'and neither does rewriting every line and every function in it', h0 + ' -> ' + h2);
  console.log('       stamp ' + h0);
}
function makeCtxNoAudio() {
  const el = () => ({ style: {}, addEventListener() { }, getContext: () => null, value: '', appendChild() { }, click() { } });
  const ctx = {
    console: { log() { }, warn() { }, error() { } }, Math, performance: { now: () => 0 },
    addEventListener() { }, setTimeout, clearTimeout, setInterval() { return 0; }, clearInterval() { },
    localStorage: { getItem() { return null; }, setItem() { } },
    document: { getElementById: el, createElement: el, addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] },
    requestAnimationFrame() { }, Image: function () { }, location: { protocol: 'http:', host: 'localhost' },
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of SIM) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  return ctx;
}

console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
