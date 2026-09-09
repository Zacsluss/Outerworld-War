'use strict';
// ============================================================================
// Voice (Web Speech synthesis, original lines) and generative ambient music.
// ============================================================================
//
// M11 wave-one idea 17: keep the unit flavour and push it, rather than trim it. What came out of that
// brief is three REGISTERS per race instead of more lines in one. A unit draws from `lines[race]`
// normally, from `vet` once it has a record behind it, and from `hurt` once scarring has taken a real
// bite -- so the marine that said "Say the word." in the second minute says "Last magazine." in the
// twentieth, and nothing is stored anywhere to make that happen. `u.vet` and `u.scarred` are both
// derived sim getters (rank off `kills`, scar off the gap between `def.hp` and `maxHp`), so this file
// stays what it has always been: a read-only view of the simulation.
//
// The registers are chosen by the words AND spoken by the delivery, and those are separate knobs on
// purpose. A veteran that is also badly scarred says the tired line in the hard voice, which is a
// different unit from either one alone and costs nothing to express.
//
// **Zerg has no lines because Zerg has no language.** The speech synthesiser is the only instrument in
// this file, so the Zerg "words" are pseudo-syllables and the real work is done by the pitch and rate
// in `adv.Z`, which put a zergling most of an octave under a human and slow it until it sounds like
// something breathing rather than something talking. The one hard-won rule in writing them: every
// fragment needs a vowel. A pure consonant cluster gets spelled out letter by letter by some TTS
// voices, and "kay ess ess kay" reads as a robot, which is the exact opposite of the point.
//
// Nothing here is taken from any other game's dialogue. This project ships no original assets it did
// not make, and that rule covers the writing as much as the art.
const Voice = {
  on: true, lastAt: 0,
  races: ['T', 'P', 'Z'],
  gap: 900, fightGap: 1400,   // ms between unit lines; a fight is louder, so it gets fewer of them
  vetAt: 2,                   // rank 2 is five kills
  scarAt: 0.3,                // scarring floors at 40% of max hp, so 0.3 lost is halfway to the floor
  lines: {
    // Terran: people with jobs. Dry, procedural, and funny in the way people are funny when the
    // alternative is thinking about it. The veteran register is shorter -- less left to say -- and the
    // hurt one is where the joke stops landing.
    T: {
      sel: ['Suited up.', 'Say the word.', 'Boots on the ground.', 'Still breathing.', 'Somebody has to.', 'Give me a heading.'],
      ack: ['Moving.', 'Understood.', 'On my way.', 'Consider it handled.', 'Walking there now.', 'Sure. Why not.'],
      atk: ['Target sighted.', 'Opening up.', 'This is the part I hate.', 'Rounds away.', 'Marking it.', 'Light them up.'],
      vet: {
        sel: ['Still here.', 'Third tour. Ask nicely.', 'I know the drill.', 'Point me at it.'],
        ack: ['Already moving.', 'Done before you asked.', 'Fine.', 'Yeah.'],
        atk: ['Firing.', 'They picked wrong.', 'Watch the flanks.', 'Count them for me.'],
      },
      hurt: {
        sel: ['Armour is holding. Mostly.', 'Still standing. Do not ask how.', 'What is left of me is listening.'],
        ack: ['Moving. Slowly.', 'If I get there, I get there.', 'Yeah. Give me a minute.'],
        atk: ['One more, then.', 'Last magazine.', 'Make it count.'],
      },
    },
    // Protoss: ceremony without pomposity. Formal, ancient, and certain -- the certainty is the whole
    // characterisation, so nothing here asks a question. The hurt register is the only place the
    // certainty turns, and it turns toward being spent rather than toward doubt.
    P: {
      sel: ['I am attentive.', 'The line holds.', 'Name the hour.', 'I was made for this.', 'My purpose stands ready.', 'Speak. I am listening.'],
      ack: ['It is already begun.', 'I move.', 'Your word carries me.', 'The distance is nothing.', 'So it is decided.', 'I will be there.'],
      atk: ['Let them come.', 'This ends quickly.', 'I do not miss.', 'They were warned.', 'The light does not forgive.', 'Their names end here.'],
      vet: {
        sel: ['I have outlived my orders before.', 'I remember every one of them.', 'The old line still holds.', 'Ask, and it is done.'],
        ack: ['It is done. Watch.', 'I need no second word.', 'The path is known to me.', 'I was already going.'],
        atk: ['Again, then.', 'I have buried better.', 'Hold nothing back.', 'Let it be quick.'],
      },
      hurt: {
        sel: ['This shell is failing. I am not.', 'What remains of me answers.', 'I have given more than I kept.'],
        ack: ['I will reach it, or I will not.', 'Slowly. But I go.', 'One more crossing.'],
        atk: ['Let this be the last.', 'I have nothing left to save.', 'Take me with them.'],
      },
    },
    // Zerg: not speech. Read these as breath and throat rather than as words -- and see the note above
    // about why each one carries a vowel.
    Z: {
      sel: ['Sskaa.', 'Hrrun.', 'Khaath.', 'Vrresh.', 'Nghaa.', 'Threk.'],
      ack: ['Kresh.', 'Sshaal.', 'Rraugh.', 'Kthun.', 'Hessk.', 'Ulgh.'],
      atk: ['Skreeaa.', 'Ghaarr.', 'Rrkash.', 'Ssarrk.', 'Kraath.', 'Vekh.'],
      vet: {
        sel: ['Hrraaa. Hrraaa.', 'Kthaa. Rrukh.', 'Ssovh.', 'Draagh.'],
        ack: ['Kresh. Kresh.', 'Ghurrn.', 'Sskaal.', 'Rraakh.'],
        atk: ['Skreeeaa.', 'Ghraaath.', 'Rrukk. Rrukk.', 'Vaaskh.'],
      },
      hurt: {
        sel: ['Hhhaa. Sseh.', 'Nguhrr.', 'Ssuh. Uh.'],
        ack: ['Kurrh. Aah.', 'Sshuu.', 'Uhhn.'],
        atk: ['Grraa. Huhh.', 'Sskuh.', 'Rreeth.'],
      },
    },
    // Per-race voice: `pitch`/`rate` for the adviser (which speaks real sentences and has to stay
    // intelligible), `sPitch`/`sRate` for units (which do not). Zerg lives a long way below the others
    // and that gap IS the Zerg characterisation -- the fragments above would read as gibberish at 1.0.
    adv: {
      T: { pitch: 1.0, rate: 1.0, sPitch: 0.95, sRate: 1.05 },
      P: { pitch: 0.7, rate: 0.9, sPitch: 0.62, sRate: 0.86 },
      Z: { pitch: 0.5, rate: 0.82, sPitch: 0.35, sRate: 0.7 },
    },
  },
  init() { try { this.on = localStorage.getItem('bw_voice') !== '0'; } catch (e) { } },
  set(v) { this.on = v; try { localStorage.setItem('bw_voice', v ? '1' : '0'); } catch (e) { } },
  cl(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
  // Music.fight is the combat-state flag the ambient bed already keeps, and it is exactly the question
  // this file wants to ask, so it is borrowed rather than recomputed.
  //
  // With one hole worth closing: Music.poll() gives up before setting the flag unless the bed is
  // actually running, and "music off, voice on" is two adjacent checkboxes in the settings panel. For
  // that player Music.fight would be false for the whole game and none of this would ever fire. So when
  // the bed is not running, ask Music.inFight() directly -- the same read-only walk over G.units that
  // poll() would have done, minus the six-second hysteresis, and it can only happen on a line that is
  // about to be spoken, which the throttle already caps at about one a second.
  //
  // Never reached on an adviser line: speak() short-circuits on `kind !== 'adv'` before it asks. That
  // matters, because the adviser is the one path called from inside G.tick.
  fighting() {
    if (typeof Music === 'undefined') return false;
    if (Music.fight) return true;
    return (!Music.timer || !Music.ctx) && typeof Music.inFight === 'function' ? !!Music.inFight() : false;
  },
  speak(text, race, kind, mod) {
    if (!text || !this.on || (typeof Sound !== 'undefined' && Sound.muted) || typeof speechSynthesis === 'undefined') return false;
    const now = performance.now();
    // The rate limit, unchanged in kind and stricter in degree. Forty selected units are forty calls to
    // this function inside one frame, and both halves of this test matter: `speaking` stops a line
    // landing on top of one already in the air, and the gap stops a queue forming behind it. The gap
    // WIDENS in a fight rather than narrowing -- a battle is the moment there is least room for chatter,
    // and it is also the moment the most units are being ordered around.
    if (kind !== 'adv' && (speechSynthesis.speaking || now - this.lastAt < (this.fighting() ? this.fightGap : this.gap))) return false;
    if (kind === 'adv') speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); const adv = this.lines.adv[race] || this.lines.adv.T;
    if (kind === 'adv') { u.pitch = adv.pitch; u.rate = adv.rate; u.volume = 0.9; }
    else {
      u.pitch = this.cl(mod && mod.pitch != null ? mod.pitch : adv.sPitch, 0.1, 2);
      u.rate = this.cl(mod && mod.rate != null ? mod.rate : adv.sRate, 0.1, 4);
      u.volume = this.cl(mod && mod.vol != null ? mod.vol : 0.7, 0, 1);
    }
    this.lastAt = now; try { speechSynthesis.speak(u); } catch (e) { }
    return true;
  },
  pick(arr, n) { if (!arr || !arr.length) return null; return arr[Math.abs(Math.floor(n) || 0) % arr.length]; },
  // How chewed up is this unit, 0 to 1 of its original health. Read-only: `scarred` is a getter.
  worn(u) { const h = (u.def && u.def.hp) || 0; return h ? this.cl((u.scarred || 0) / h, 0, 1) : 0; },
  // Which register. Scarring beats rank when both apply, because what a unit has been through says more
  // about how it sounds than what it has done -- the veteran's harder delivery still lands on top.
  poolFor(race, kind, vet, worn) {
    const l = this.lines[race]; if (!l) return null;
    const w = l.hurt && l.hurt[kind], v = l.vet && l.vet[kind];
    if (worn >= this.scarAt && w && w.length) return w;
    if (vet >= this.vetAt && v && v.length) return v;
    return l[kind] && l[kind].length ? l[kind] : null;
  },
  // Rank and scar as delivery rather than as words: a veteran drops in pitch and slows a little, and a
  // scarred unit drops further, slows further and loses volume, because it is genuinely in worse shape
  // than the one that rolled out of the factory beside it.
  delivery(u) {
    const a = this.lines.adv[u.def.race] || this.lines.adv.T;
    const vet = u.vet || 0, worn = this.worn(u);
    // Three timbres per race, keyed on the unit id, so two marines are two people -- and the same
    // marine is the same person every time it is clicked.
    const who = (((u.id || 0) % 3) - 1) * 0.05;
    return {
      pitch: this.cl(a.sPitch + who - vet * 0.05 - worn * 0.45, 0.1, 2),
      rate: this.cl(a.sRate + (this.fighting() ? 0.06 : 0) - vet * 0.03 - worn * 0.28, 0.1, 4),
      vol: this.cl(0.7 - worn * 0.5, 0.15, 1),
    };
  },
  // Sound.ack fires AFTER setOrder, so the unit's own order says whether this was a bark or an answer;
  // a shift-queued order lands on the tail of `queue` instead of on `order`, so look there first. In a
  // fight everything is a bark, which is the cheapest way to make the same click sound different when
  // it matters.
  kindOf(u) {
    const o = (u.queue && u.queue.length ? u.queue[u.queue.length - 1] : u.order) || {};
    if (o.type === 'attack' || o.type === 'attackmove' || o.type === 'patrol') return 'atk';
    return this.fighting() ? 'atk' : 'ack';
  },
  say(u, kind, seed) {
    if (!u || u.isBuilding || !u.def || typeof G === 'undefined' || u.owner !== G.human) return false;
    const pool = this.poolFor(u.def.race, kind, u.vet || 0, this.worn(u));
    if (!pool) return false;
    return this.speak(this.pick(pool, seed), u.def.race, kind, this.delivery(u));
  },
  // The frame term is what stops a unit having one catchphrase for life: `pick` is a modulo, so keying
  // it on the id alone -- which is what this did -- meant the same marine gave the same select line
  // every time it was ever clicked. Shifted down so a double-click does not change the line mid-word.
  select(u) { const f = typeof G !== 'undefined' ? G.frame : 0; return this.say(u, 'sel', ((u && u.id) || 0) * 7 + (f >> 5)); },
  ack(u) { const f = typeof G !== 'undefined' ? G.frame : 0; return u ? this.say(u, this.kindOf(u), ((u.id || 0) + f)) : false; },
  announce(text) { const p = G.players[G.human]; if (!p) return false; return this.speak(text, p.race, 'adv'); },
};

const Music = {
  on: true, ctx: null, master: null, timer: null, step: 0,
  fight: false, fightSeen: -1e9, pollT: -1,
  scales: { T: [0, 3, 5, 7, 10], Z: [0, 1, 5, 6, 8], P: [0, 2, 4, 7, 9, 11] }, roots: { T: 41.2, Z: 36.7, P: 49.0 },
  init() { try { this.on = localStorage.getItem('bw_music') !== '0'; } catch (e) { } },
  set(v) { this.on = v; try { localStorage.setItem('bw_music', v ? '1' : '0'); } catch (e) { } if (!v) this.stop(); else if (typeof G !== 'undefined' && G.players.length) this.start(); },
  start() {
    if (!this.on || (typeof Sound !== 'undefined' && Sound.muted)) return; if (!this.ctx) { try { this.ctx = Sound.ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.master) { this.master = this.ctx.createGain(); this.master.gain.value = 0.0; this.master.connect(this.ctx.destination); }
    this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.linearRampToValueAtTime(0.16, this.ctx.currentTime + 3);
    if (this.timer) clearInterval(this.timer); this.step = 0; this.timer = setInterval(() => this.bar(), 4000); this.bar();
  },
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } if (this.master && this.ctx) { this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5); } },
  // Is a fight actually happening? The bar() below already had a `tension` flag, but it read the
  // player's ATTACK ALERTS -- so it only knew about being attacked at home, and stayed calm through
  // every battle the player themselves started. This asks the units instead: anything of ours that has
  // traded damage in the last two seconds means a fight.
  //
  // Render-side and read-only, like the rest of this file: it looks at G and never writes to it.
  inFight() {
    if (typeof G === 'undefined' || !G.players.length) return false;
    const me = G.human;
    for (const u of G.units) {
      if (!u.alive || u.inside) continue;
      if (u.owner === me) { if (G.frame - u.lastHit < 48) return true; }
      else if (u.lastHitBy && u.lastHitBy.owner === me && G.frame - u.lastHit < 48) return true;
    }
    return false;
  },
  // Called from the render loop twice a second. Half a second is fast enough that the swell lands while
  // the first shots are still going, and slow enough that a full pass over the unit list is nothing.
  // Leaving a fight waits six seconds, so a lull inside one battle does not resolve and re-swell.
  poll() {
    if (!this.ctx || !this.master || !this.on || (typeof Sound !== 'undefined' && Sound.muted)) return;
    if (typeof G === 'undefined' || G.frame === this.pollT || G.frame % 12) return; this.pollT = G.frame;
    const now = this.inFight(); if (now) this.fightSeen = G.frame;
    if (now && !this.fight) { this.fight = true; this.swell(true); }
    else if (!now && this.fight && G.frame - this.fightSeen > 24 * 6) { this.fight = false; this.swell(false); }
  },
  // The transition itself: the bed gets louder and brighter going in, quieter and darker coming out,
  // with a short figure over the top so the change is an event rather than a fade.
  swell(into) {
    const t = this.ctx.currentTime, g = this.master.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(into ? 0.26 : 0.16, t + (into ? 0.7 : 2.5));
    const race = G.players[G.human].race, sc = this.scales[race] || this.scales.T, root = this.roots[race] || 41.2;
    const deg = into ? [0, 2, 4] : [4, 2, 0];
    deg.forEach((d, i) => this.pad(root * Math.pow(2, (sc[d % sc.length] + (into ? 24 : 12)) / 12), t + i * 0.16, into ? 0.9 : 1.6, into ? 0.42 : 0.24, race === 'Z' ? 'sawtooth' : race === 'P' ? 'sine' : 'triangle', into ? 1400 : 300));
  },
  bar() {
    if (!this.ctx || !this.master || typeof G === 'undefined' || !G.players.length) return; const race = G.players[G.human].race; const sc = this.scales[race] || this.scales.T, root = this.roots[race] || 41.2;
    const t = this.ctx.currentTime; const prog = [0, 3, 4, 2, 0, 5, 3, 1]; const deg = prog[this.step % prog.length]; this.step++;
    const tension = this.fight || G.players[G.human].msgs.some(m => m.kind === 'attack' && G.frame - m.t < 24 * 20);
    const notes = [sc[deg % sc.length], sc[(deg + 2) % sc.length] + 12, sc[(deg + 4) % sc.length] + 12, sc[deg % sc.length] + 24];
    notes.forEach((n, i) => { const f = root * Math.pow(2, n / 12) * (i === 0 ? 1 : 1); this.pad(f, t, 4.2, i === 0 ? 0.5 : 0.28, race === 'Z' ? 'sawtooth' : race === 'P' ? 'sine' : 'triangle', tension ? 900 : 420); });
    if (race === 'T' || tension) for (let k = 0; k < 4; k++) this.tick(t + k * 1.0 + (k % 2 ? 0.5 : 0), tension ? 0.5 : 0.25);
    if (race === 'P') this.shimmer(root * Math.pow(2, (sc[(deg + 1) % sc.length] + 36) / 12), t + 1.5);
  },
  pad(freq, t, dur, vol, type, cutoff) {
    const c = this.ctx; const g = c.createGain(); const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = cutoff; flt.Q.value = 0.8;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 1.2); g.gain.setValueAtTime(vol, t + dur - 1.4); g.gain.linearRampToValueAtTime(0, t + dur);
    for (const det of [-6, 5]) { const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det; o.connect(flt); o.start(t); o.stop(t + dur + 0.1); }
    flt.connect(g); g.connect(this.master);
  },
  tick(t, vol) { const c = this.ctx; const buf = c.createBuffer(1, 2205, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4); const s = c.createBufferSource(); s.buffer = buf; const g = c.createGain(); g.gain.value = vol * 0.35; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 180; s.connect(f); f.connect(g); g.connect(this.master); s.start(t); },
  shimmer(freq, t) { const c = this.ctx; const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq; const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.4); g.gain.exponentialRampToValueAtTime(0.001, t + 2.5); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 2.6); },
};
Voice.init(); Music.init();
