// Alerts are heard by the player they are ABOUT, and by nobody else (fifth session, the user's item 2:
// "my friend hears all of the vocal announcements like 'spawn more overlords' sounds i hear - they should
// ONLY hear their sounds. I also hear theirs").
//
// `Player.msg` gated its sound on `this.human`, which means "this player is a human player" and NOT "this
// player is the one sitting here". In single player that is the same player and the bug is invisible. In a
// two-human network game BOTH players are human, the simulation is identical on every client, and
// `G.tickAlerts` raises each player's alerts on all of them -- so every client played both players' supply
// alerts and spoke both players' announcements. The console text was never wrong: `HUD.drawMessages` reads
// `G.players[G.human].msgs`, and `G.alert`'s minimap ping was already gated on `p.id === this.human`. Only
// the two sound calls were not.
//
// The record itself (`p.msgs`) stays per player, because it is what the console draws from after a rejoin
// and what thirteen suites read; only the SPEAKER is local.
//   node test/netaudio.js
'use strict';
const { makeCtx, ok, summary } = require('./_harness');
const vm = require('vm');

// A sim-tier context with Sound and Voice recording what they are asked to play.
function game(humanIdx) {
  const ctx = makeCtx({ globals: { __sound: [], __voice: [] } });
  vm.runInContext(`Sound = { alert(kind) { __sound.push(kind); } };
    Voice = { announce(text) { __voice.push(text); } };
    G.init({ players: [{ race: 'Z', human: true, name: 'Zac' }, { race: 'Z', human: true, name: 'Gianna' }], seed: 3, layout: 'temple' });
    G.human = ${humanIdx};`, ctx);
  return ctx;
}
const heard = ctx => ({ sound: vm.runInContext('__sound.slice()', ctx), voice: vm.runInContext('__voice.slice()', ctx) });

console.log('--- 1. a two-human game: each client hears only its own player -------------------');
{
  // The same simulation, on two clients. Player 0's supply message, raised the way tickAlerts raises it.
  const a = game(0), b = game(1);
  for (const c of [a, b]) vm.runInContext("G.players[0].msg(RACE_INFO.Z.supplyMsg, 'error')", c);
  const ha = heard(a), hb = heard(b);
  ok(ha.sound.length === 1 && ha.voice.length === 1 && ha.voice[0] === vm.runInContext('RACE_INFO.Z.supplyMsg', a),
    "player 0's supply alert is played and spoken on player 0's client", JSON.stringify(ha));
  ok(hb.sound.length === 0 && hb.voice.length === 0,
    "...and on player 1's client it is silent (before: both clients played and spoke it)", JSON.stringify(hb));
  // ...and the other way round, so the check cannot pass by nothing ever playing.
  const a2 = game(0), b2 = game(1);
  for (const c of [a2, b2]) vm.runInContext("G.players[1].msg(RACE_INFO.Z.supplyMsg, 'error')", c);
  ok(heard(a2).sound.length === 0 && heard(b2).sound.length === 1,
    "player 1's alert is silent on player 0's client and played on player 1's", JSON.stringify({ a: heard(a2), b: heard(b2) }));
}

console.log('--- 2. the message RECORD is still per player, on every client -------------------');
{
  const b = game(1);
  vm.runInContext("G.players[0].msg('Nuclear launch detected.', 'nuke')", b);
  const r = vm.runInContext('({ p0: G.players[0].msgs.length, p1: G.players[1].msgs.length, text: G.players[0].msgs[0] && G.players[0].msgs[0].text })', b);
  ok(r.p0 === 1 && r.p1 === 0 && r.text === 'Nuclear launch detected.',
    'the text is still recorded on the player it is about (the console, the rejoin and thirteen suites read it)', JSON.stringify(r));
  ok(heard(b).sound.length === 0, '...without making a sound on a client that is not that player', JSON.stringify(heard(b)));
}

console.log('--- 3. an AI player is silent and unrecorded, as before --------------------------');
{
  const ctx = makeCtx({ globals: { __sound: [], __voice: [] } });
  vm.runInContext(`Sound = { alert(k) { __sound.push(k); } }; Voice = { announce(t) { __voice.push(t); } };
    G.init({ players: [{ race: 'Z', human: true }, { race: 'T', human: false, difficulty: 'easy' }], seed: 3, layout: 'temple' });
    G.human = 0; G.players[1].msg('Additional supply depots required.', 'error');`, ctx);
  const r = vm.runInContext('({ msgs: G.players[1].msgs.length, sound: __sound.length })', ctx);
  ok(r.msgs === 0 && r.sound === 0, 'a computer player records nothing and plays nothing (unchanged)', JSON.stringify(r));
}

console.log('--- 4. single player is unchanged: the local player hears everything -------------');
{
  const ctx = game(0);
  vm.runInContext(`G.players[0].msg('Upgrade complete.', 'info'); G.players[0].msg('Your forces are under attack.', 'attack');`, ctx);
  const h = heard(ctx);
  ok(h.sound.length === 2 && h.voice.length === 2 && h.voice.includes('Your forces are under attack.') && h.voice.includes('Upgrade complete.'),
    'the local player still hears the alert tone and the announcement for every kind that had one', JSON.stringify(h));
}

console.log('--- 5. the guard is the local player, not the human flag (static) ----------------');
{
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'sim.js'), 'utf8');
  // The method body, from its signature to the next method at the same indent. Read as a block and not as
  // one line, because the guard sits on a line of its own: a one-line scrape would go red on a reformat
  // rather than on a fault, which is the kind of check this project calls vacuous.
  const lines = src.split(/\r?\n/);
  const i0 = lines.findIndex(l => /^\s*msg\(text, kind = 'info'\)/.test(l));
  const body = i0 < 0 ? '' : lines.slice(i0, i0 + 12).join('\n');
  const guard = body.indexOf('this.id !== G.human'), sound = body.indexOf('Sound.alert'), voice = body.indexOf('Voice.announce');
  ok(i0 >= 0 && guard > 0 && sound > guard, "Player.msg returns on `this.id !== G.human` before it plays -- the `human` flag alone is every human player", JSON.stringify({ found: i0 >= 0, guard, sound }));
  ok(voice > guard, '...and before it speaks the announcement', JSON.stringify({ guard, voice }));
  ok(/this\.msgs\.push/.test(body) && body.indexOf('this.msgs.push') < guard, 'the record is still made before the gate, for every human player', JSON.stringify({ push: body.indexOf('this.msgs.push'), guard }));
}
summary();
