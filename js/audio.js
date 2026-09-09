'use strict';
// ============================================================================
// Voice (Web Speech synthesis, original lines) and generative ambient music.
// ============================================================================
const Voice = {
  on: true, busy: false, lastAt: 0, queue: [],
  lines: {
    T: { sel: ['Standing by.', 'Awaiting orders.', 'Ready when you are.', 'Go ahead, commander.', 'What do you need?'], ack: ['On it.', 'Moving out.', 'Copy that.', 'Roger.', 'Affirmative.'], atk: ['Engaging.', 'Weapons hot.', 'Taking the shot.'] },
    P: { sel: ['I stand ready.', 'Your will guides me.', 'Speak, and I obey.', 'The path is clear.'], ack: ['It shall be done.', 'En route.', 'As you command.', 'I go.'], atk: ['For the Conclave.', 'They shall fall.', 'Strike true.'] },
    Z: { sel: [], ack: [], atk: [] },
    adv: { T: { pitch: 1.0, rate: 1.0 }, Z: { pitch: 0.55, rate: 0.85 }, P: { pitch: 0.7, rate: 0.9 } },
  },
  init() { try { this.on = localStorage.getItem('bw_voice') !== '0'; } catch (e) { } },
  set(v) { this.on = v; try { localStorage.setItem('bw_voice', v ? '1' : '0'); } catch (e) { } },
  speak(text, race, kind) {
    if (!this.on || (typeof Sound !== 'undefined' && Sound.muted) || typeof speechSynthesis === 'undefined') return; const now = performance.now();
    if (kind !== 'adv' && (speechSynthesis.speaking || now - this.lastAt < 900)) return;
    if (kind === 'adv') speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); const adv = this.lines.adv[race] || this.lines.adv.T;
    if (kind === 'adv') { u.pitch = adv.pitch; u.rate = adv.rate; u.volume = 0.9; }
    else { u.pitch = race === 'P' ? 0.6 : 0.85 + ((text.length % 3) * 0.08); u.rate = race === 'P' ? 0.9 : 1.05; u.volume = 0.7; }
    this.lastAt = now; try { speechSynthesis.speak(u); } catch (e) { }
  },
  pick(arr, seedObj) { if (!arr.length) return null; return arr[(seedObj.id || 0) % arr.length]; },
  select(u) { if (!u || u.isBuilding || u.owner !== G.human) return; const l = this.lines[u.def.race]; const t = this.pick(l.sel, u); if (t) this.speak(t, u.def.race, 'sel'); },
  ack(u) { if (!u || u.isBuilding || u.owner !== G.human) return; const l = this.lines[u.def.race]; const t = this.pick(l.ack, { id: u.id + G.frame }); if (t) this.speak(t, u.def.race, 'ack'); },
  announce(text) { const p = G.players[G.human]; if (!p) return; this.speak(text, p.race, 'adv'); },
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
