'use strict';
// ============================================================================
// HUD: BW-style console (minimap, unit panel, command card), resource bar,
// messages, menus, custom cursor. Overrides the drawing methods of UI.
// ============================================================================
const HUD = {
  // ---- skin -------------------------------------------------------------
  // The console used to be one gunmetal panel with a coloured line on top whichever race you were.
  // A 90s RTS console is a piece of the faction's own material -- Terran is stamped steel with hazard
  // paint, Zerg is carapace, Protoss is gilded stone -- so each race gets a palette and a texture,
  // and the frame is built from them rather than hard-coded.
  // Each race's console is a different machine, not the same machine in a different colour. `grain`
  // picks the whole treatment -- texture, the top edge, the section ribs, the corner brackets and the
  // bezel round every recessed screen -- so a Zerg console has no rivets anywhere on it and a Protoss
  // one has no straight corners.
  SKINS: {
    T: { hi: '#3a4452', lo: '#161b22', edge: '#7d93ad', accent: '#d7a13c', rivet: '#0a0d11', ink: '#0b0e13', grain: 'brushed', stripe: true, glow: 'rgba(215,161,60,', btn: '#1e2530', btnHov: '#2a3240', btnDim: '#151920', slot: '#141922' },
    Z: { hi: '#452f43', lo: '#221623', edge: '#a86ad0', accent: '#c07ad8', rivet: '#160b18', ink: '#0d070e', grain: 'organic', stripe: false, glow: 'rgba(200,120,240,', btn: '#251a28', btnHov: '#35243c', btnDim: '#170f19', slot: '#1a121c' },
    P: { hi: '#3b3524', lo: '#16130d', edge: '#e0b84a', accent: '#62d4ff', rivet: '#0d0a06', ink: '#0a0805', grain: 'gilded', stripe: false, glow: 'rgba(98,212,255,', btn: '#262114', btnHov: '#37301b', btnDim: '#17130a', slot: '#1a1610' },
  },
  // The codex draws itself in the material of whichever race's tab is up, and both it and the main menu
  // can be on screen with no game running at all -- so this must survive G.players being empty.
  skinOverride: null,
  raceKey() { const p = (typeof G !== 'undefined' && G.players) ? G.players[G.human] : null; return this.skinOverride || (p && p.race) || 'T'; },
  skin() { return this.SKINS[this.raceKey()] || this.SKINS.T; },
  accent() { return this.skin().edge; },

  // ==========================================================================
  // The console is a thing in the world, so the world happens to it
  // ==========================================================================
  // A HUD in this genre normally floats: the same clean overlay at 4:00 with a full army as at 24:00
  // with three buildings burning. This one is the commander's own hardware -- Terran stamped steel and
  // amber phosphor, Zerg chitin and membrane, Protoss psionic glass with nothing holding it up -- and
  // because it is a piece of equipment standing in the same war, it gets damaged and it loses sync.
  //
  // Three rules govern all of it, and each one is here because the alternative is a real bug:
  //
  // 1. CONDITION IS DERIVED, NEVER STORED. Not a counter the renderer ticks: a pure function of what
  //    the simulation currently is. Every ingredient below is a field the reflective snapshot already
  //    captures -- a building's hit points, `Player.stats`, `Unit.lastHit`, `Player.msgs` -- so a
  //    replay seek to frame N produces the same console it produced the first time through.
  //
  //    The obvious shape is a decaying accumulator the draw pass adds to, and it is wrong in a way
  //    nothing on screen would ever show you: it looks perfect until somebody drags the replay
  //    scrubber, at which point the seek restores a pristine simulation under a wrecked console.
  //    test/diegetic.js's negative control is precisely that substitution, and the check that catches
  //    it is a snapshot taken over a burning base and restored after the base has been healed.
  //
  // 2. NOTHING CALLS Math.random(). Glitch timing is `noise(frame, salt)` -- the same discipline as
  //    daylightAt(frame) in js/game.js and GameMap.hazardState(frame), where the whole state of a
  //    sandstorm is recomputed from the frame number and stored nowhere. Same frame, same tear.
  //
  // 3. THE CHROME IS BAKED, THE GLITCH IS NOT. Painting cracks and corrosion is two hundred canvas
  //    ops; doing that per frame is the mistake M8 measured on the muzzle flash (0.8 ms live, 0.3 ms
  //    baked). So damage goes into the texture `panel()` already caches, keyed by a five-step bucket,
  //    and only the tear -- which by definition has to be different every frame -- is drawn live. The
  //    tear is a handful of drawImage calls for the whole console, not one per anything.
  WEAR_BUCKETS: 5,
  SHOCK_WINDOW: 120,        // 5 s. How long a hit still counts as "you are being shot at right now".
  EVENT_WINDOW: 72,         // 3 s. How long an alert still tears the display.
  BUILDING_LOSS: 5,         // one structure is worth five units of attrition; losing a base is not a trade
  EVENT_W: { nuke: 1, attack: 0.6 },   // Player.msgs kinds that count as a shock; error/info do not
  // Forces a condition for the tests and for looking at the thing without losing a game to do it.
  // Same idea as `skinOverride` above, and null in every real code path.
  wearOverride: null,
  _cond: null,
  // Declared rather than created lazily on first use: both are inspected from outside (test/codex.js
  // reads _panels.size, test/diegetic.js caps both), and a cache that does not exist until something
  // has been drawn is a cache that reads as absent rather than as empty.
  _panels: new Map(),
  _fx: new Map(),
  // What each race calls the thing that is failing. Not decoration: "HULL" and "CARAPACE" and "MATRIX"
  // are three different claims about what the console is made of.
  INTEGRITY: { T: 'HULL', Z: 'CARAPACE', P: 'MATRIX', N: 'HULL' },

  // What the hardware has been through, as one number, plus the parts it was made of.
  //   base      how burnt the standing buildings are RIGHT NOW. Repair mends it; that is the point.
  //   attrition what has been lost against what still stands. Cumulative, and it never mends.
  //   shock     the share of your own units hit in the last five seconds. Twitchy on purpose.
  //
  // Global monotonicity in "damage" is deliberately NOT claimed and test/diegetic.js does not assert
  // it: a building that finally falls stops dragging `base` down and starts weighing on `attrition`
  // instead, so the exact frame it dies can move the total either way by a hair. Each term on its own
  // is monotone, which is the claim worth making and the one the test pins.
  condition() {
    if (this.wearOverride != null) { const w = clamp(+this.wearOverride || 0, 0, 1); return this._shape({ base: w, attrition: w, shock: w, lost: 0, lostB: 0, event: 0, forced: true }); }
    const g = (typeof G !== 'undefined') ? G : null;
    const p = (g && g.players && g.players.length) ? g.players[g.human] : null;
    // The codex and the main menu both draw console material with no game under them at all.
    if (!p || !g.units) return this._shape({ base: 0, attrition: 0, shock: 0, lost: 0, lostB: 0, event: 0 });
    const st0 = p.stats || {}, gone0 = (st0.unitsLost || 0) + (st0.buildingsLost || 0) * this.BUILDING_LOSS;
    // Memoised on four things, and each of them earns its place. The FRAME is the obvious one, and the
    // one that carries a normal game. PLAYER IDENTITY, because G.init builds new Player objects and a
    // frame number alone would let a second game seeded the same open on the previous game's console.
    // UNIT COUNT and CUMULATIVE LOSSES, because those are the two ways the answer can change without
    // the frame moving -- a snapshot restored onto the frame it was taken at, a cheat, a test.
    //
    // Four keys and not a plain "recompute every time" because drawConsole, drawTop, panel() and the
    // codex can all ask inside one frame; four keys and not one because a memo that can go stale is a
    // stored condition wearing a pure function's coat, which is the exact bug this whole design is
    // built to avoid. test/diegetic.js never clears this by hand -- an earlier draft did, and it made
    // the negative control (replace the key with `if (this._cond) return it`) pass.
    const c = this._cond; if (c && c.p === p && c.f === g.frame && c.n === g.units.length && c.gone === gone0) return c;
    let bHp = 0, bMax = 0, hit = 0, live = 0, lost = 0, lostB = 0;
    // ONE WALK for all of it. Dead units are read here too, and that is not a bug: G.units is reaped
    // on `frame % 24 === 0` (js/game.js) and nowhere else, so anything killed inside the last second
    // is still sitting in the array with `alive === false`. That is a real, frame-accurate, entirely
    // snapshot-safe "what did I just lose" -- the alternative was G.effects, which js/snapshot.js
    // clears on restore precisely because it is render-only. The window sawtooths between 0 and 24
    // frames depending on where the reap is; a burst that lasts between zero and one second is the
    // right cadence for a HUD lurch anyway, so it is left alone rather than smoothed.
    for (const u of g.units) {
      if (u.owner !== p.id) continue;
      const d = u.def; if (!d || d.larva || d.notUnit) continue;
      if (!u.alive) { lost++; if (u.isBuilding) lostB++; continue; }
      if (u.inside) continue;
      live++;
      if (g.frame - u.lastHit < this.SHOCK_WINDOW) hit++;
      if (u.isBuilding) { bHp += u.hp; bMax += u.maxHp; }
    }
    // The alert log is the simulation's own frame-stamped record of what just happened to this player,
    // and it is a Player field, so it snapshots. A nuke tears harder than a raid, and both fade.
    let event = 0;
    for (const m of (p.msgs || [])) {
      const wgt = this.EVENT_W[m.kind]; if (!wgt) continue;
      const age = g.frame - m.t; if (age < 0 || age >= this.EVENT_WINDOW) continue;
      event = Math.max(event, wgt * (1 - age / this.EVENT_WINDOW));
    }
    if (lost > 0) event = Math.max(event, clamp(0.3 + lost * 0.12 + lostB * 0.4, 0, 1));
    const out = this._shape({
      base: bMax > 0 ? clamp(1 - bHp / bMax, 0, 1) : 0,
      attrition: gone0 > 0 ? gone0 / (gone0 + Math.max(4, live)) : 0,
      shock: live > 0 ? hit / live : 0,
      lost, lostB, event,
    });
    out.p = p; out.f = g.frame; out.n = g.units.length; out.gone = gone0; this._cond = out; return out;
  },
  // `wear` is what the glitch runs on and moves every frame. `slow` is what the TEXTURE is baked from
  // and deliberately drops `shock`, which is the one term that can flicker: a bucket boundary crossed
  // twice a second would rebuild an 1920x220 texture twice a second, and that is a stutter rather than
  // a look. base and attrition both walk in one direction at a few parts in ten thousand per frame, so
  // a boundary is crossed once and left behind.
  _shape(t) {
    t.slow = clamp(0.56 * t.base + 0.44 * t.attrition, 0, 1);
    t.wear = clamp(0.42 * t.base + 0.33 * t.attrition + 0.25 * t.shock, 0, 1);
    t.v = 1 - t.wear;
    t.bucket = Math.min(this.WEAR_BUCKETS - 1, Math.max(0, Math.floor(t.slow * this.WEAR_BUCKETS)));
    return t;
  },
  wear() { return this.condition().wear; },
  wearBucket() { return this.condition().bucket; },
  // What a bucket is worth as a 0..1 severity, which is what the painters take. Bucket 0 paints
  // nothing at all, so a healthy console is byte-for-byte the console that shipped before this.
  bucketWear(k) { return k / (this.WEAR_BUCKETS - 1); },

  // Deterministic value noise. Integer in, 0..1 out, no state, no Math.random -- the constraint every
  // sim file lives under, applied here because a replay that tears in different places is a replay
  // that does not reproduce. `salt` keeps two effects on the same frame from moving together.
  noise(a, salt = 0) {
    let x = Math.imul((a | 0) + 0x9e3779b9, 374761393) + Math.imul((salt | 0) + 0x85ebca6b, 668265263);
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  },
  // The glitch, as numbers. Pure in (frame, wear, event): the draw code below only reads this, so the
  // whole of "what does the HUD do this frame" is one testable function with no canvas in it.
  //
  // Two sources, taken as a maximum rather than a sum. AMBIENT is a burst that opens on some windows
  // and not others -- a display that stutters at random intervals reads as failing hardware, where one
  // that stutters every N frames reads as an animation. EVENT is the discrete half: a nuke, a raid, a
  // structure lost, each punching in at full strength and decaying over three seconds.
  glitch(frame, wear, event) {
    if (frame === undefined) { const c = this.condition(); frame = (typeof G !== 'undefined' && G.frame) || 0; wear = c.wear; event = c.event; }
    wear = clamp(wear || 0, 0, 1); event = clamp(event || 0, 0, 1);
    // No ambient floor. A console in perfect condition never tears on its own -- only an event can do
    // it -- because a HUD that flickers on a good day is a screen effect, and the whole point of this
    // one is that it means something. The threshold is the wear itself, so the glitch rate IS the
    // damage: half the windows at total ruin, none at none.
    const B = 21, win = Math.floor(frame / B), ph = (frame - win * B) / B;
    const fires = this.noise(win, 7) < wear * 0.5;
    const amb = fires ? (1 - ph) * (0.28 + wear * 0.72) : 0;
    const i = clamp(Math.max(amb, event), 0, 1);
    return {
      i, seed: win, frame, wear,
      bands: i > 0.2 ? 1 + Math.floor(this.noise(frame, 3) * 3) : 0,   // 1..3 torn slices, 0 below the floor
      roll: ((frame * (2 + Math.round(wear * 6))) % 240) / 240,        // where the scanline sweep is, 0..1
      hiss: i * (0.25 + wear * 0.75),                                  // static / fleck / fringe strength
    };
  },

  // The console background is the same pixels every frame, so it is built once into a canvas and
  // blitted. Drawing the texture live cost more than the whole rest of the HUD; cached it is one
  // drawImage.
  //
  // A MAP, NOT ONE SLOT. This used to keep a single cached canvas keyed on race|w|h, which is correct
  // exactly while one panel size exists. The pause menu already broke it -- `drawMenu` calls `frame` at
  // the dialog's size every frame while `drawConsole` calls it at the console's, so with a menu open
  // both were rebuilt from scratch sixty times a second, ninety ellipses and all. The codex is a third
  // size and would have made it three. Four entries is enough for every panel on screen at once; the
  // cache is dropped wholesale past its cap so a window being dragged to resize cannot grow it forever.
  //
  // THE CAP WENT FROM EIGHT TO TWENTY when the console started taking damage, because the key gained a
  // condition bucket. The LIVE set is unchanged -- a panel of a given size only ever exists at one
  // bucket, the current one -- but each bucket the game passes through leaves its old textures behind,
  // and at eight the fourth crossing would have evicted the texture the console was drawing from. Five
  // buckets times three or four concurrent sizes is twenty, and the wholesale clear at the cap is kept
  // rather than an LRU: it costs one rebuild of what is actually on screen, once, and it is four lines
  // shorter than a policy that would need its own test.
  panel(w, h, ribs, bucket) {
    const k = bucket === undefined ? this.wearBucket() : bucket;
    const key = this.raceKey() + '|' + w + '|' + h + '|' + (ribs ? 1 : 0) + '|' + k;
    const hitc = this._panels.get(key); if (hitc) return hitc;
    if (this._panels.size > 20) this._panels.clear();
    const s = this.skin(), cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
    // Lit hard along the top and falling away fast, the way a plate tilted toward the room catches
    // light. A flat top-to-bottom ramp reads as a coloured rectangle; the kink at 0.18 is what makes
    // it read as a surface with a thickness.
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, s.hi); g.addColorStop(0.18, s.hi); g.addColorStop(0.55, s.lo); g.addColorStop(1, s.ink);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // Deterministic from a fixed seed so the panel does not shimmer when the window resizes.
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    c.save();
    if (s.grain === 'brushed') this.grainT(c, w, h, s, rnd);
    else if (s.grain === 'organic') this.grainZ(c, w, h, s, rnd);
    else this.grainP(c, w, h, s, rnd);
    c.restore();
    // The chrome pass: the part of each race's console that is equipment rather than material. It sits
    // between the grain and the frame furniture on purpose -- scanlines have to lie over the plate and
    // under the rivets, or the rivets look printed on the glass.
    c.save(); this.chrome(c, w, h, s, rnd); c.restore();
    this.topEdge(c, w, h, s, rnd);
    if (ribs) for (const fx of [0.155, 0.815]) this.rib(c, Math.round(w * fx), h, s);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, h - 1, w, 1);
    // ...and the damage, last, so it lies over everything including the rivets and the seams. Bucket 0
    // paints nothing, so an undamaged console is exactly the console that shipped before this.
    if (k > 0) { c.save(); this.wearLayer(c, w, h, s, this.bucketWear(k), rnd); c.restore(); }
    this._panels.set(key, cv); return cv;
  },

  // ---- the three materials ------------------------------------------------
  // Terran: rolled plate. Tooling marks along the grain, horizontal seams where two plates are lapped
  // and bolted, rivet rows down every seam, and the scuffs and weld spatter of something that is
  // repaired in the field rather than replaced.
  grainT(c, w, h, s, rnd) {
    for (let i = 0; i < h * 1.4; i++) { const y = rnd() * h; c.strokeStyle = 'rgba(255,255,255,' + (0.012 + rnd() * 0.022).toFixed(3) + ')'; c.beginPath(); c.moveTo(rnd() * w * 0.5, y); c.lineTo(w * (0.4 + rnd() * 0.6), y); c.stroke(); }
    // lapped plate seams with a bolt row along each
    for (let y = Math.round(h * 0.42); y < h - 12; y += Math.max(26, Math.round(h * 0.34))) {
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, y, w, 2);
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, y + 2, w, 1);
      for (let x = 14; x < w - 8; x += 38) this.bolt(c, x, y + 6, 2, s);
    }
    // bolt rows along the top and bottom rails, which is what makes it read as bolted to something
    for (let x = 10; x < w - 6; x += 34) { this.bolt(c, x, h - 7, 2.2, s); }
    // scuffs and weld spatter
    for (let i = 0; i < 26; i++) { const x = rnd() * w, y = h * (0.2 + rnd() * 0.75), l = 6 + rnd() * 22; c.strokeStyle = 'rgba(0,0,0,' + (0.10 + rnd() * 0.14).toFixed(3) + ')'; c.lineWidth = 1 + rnd(); c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + rnd() * 2 - 1); c.stroke(); }
    c.lineWidth = 1;
  },
  bolt(c, x, y, r, s) { c.fillStyle = s.rivet; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.42, 0, 7); c.fill(); },

  // Zerg: carapace. Overlapping chitin cells, the veins under them, pores, and a wet specular that
  // sits on top of the plates rather than in them. Nothing here is straight and nothing is bolted.
  grainZ(c, w, h, s, rnd) {
    for (let i = 0; i < 110; i++) {
      const x = rnd() * w, y = rnd() * h, rx = 14 + rnd() * 40, ry = 6 + rnd() * 14;
      c.fillStyle = 'rgba(0,0,0,' + (0.10 + rnd() * 0.16).toFixed(3) + ')';
      c.beginPath(); c.ellipse(x, y, rx, ry, rnd() * 0.6 - 0.3, 0, 7); c.fill();
      c.strokeStyle = 'rgba(210,155,235,0.10)'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(x, y - 1, rx, ry, 0, 3.6, 5.8); c.stroke();
    }
    // veins: branching filaments that run the length of the console under the plates
    c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = rnd() * w, y = 6 + rnd() * (h - 12);
      c.strokeStyle = 'rgba(120,50,140,' + (0.10 + rnd() * 0.14).toFixed(3) + ')'; c.lineWidth = 1 + rnd() * 2;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { const nx = x + (rnd() * 70 - 20), ny = clamp(y + rnd() * 22 - 11, 3, h - 3); c.quadraticCurveTo((x + nx) / 2, ny + rnd() * 10 - 5, nx, ny); x = nx; y = ny; }
      c.stroke();
    }
    // pores, and the wet highlight that makes it look alive rather than painted
    for (let i = 0; i < 40; i++) { const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 2.4; c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.fillStyle = 'rgba(220,170,240,0.10)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.4, r * 0.5, 0, 7); c.fill(); }
    for (let i = 0; i < 14; i++) { const x = rnd() * w, y = h * (0.05 + rnd() * 0.5); c.strokeStyle = 'rgba(240,210,255,' + (0.05 + rnd() * 0.06).toFixed(3) + ')'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, y, 10 + rnd() * 26, 4 + rnd() * 8, rnd() - 0.5, 3.5, 5.4); c.stroke(); }
    c.lineWidth = 1;
  },

  // Protoss: cut stone with gold inlay. Fluting, a woven filigree band, and khaydarin facets set into
  // the surface. The psionic part of it is light coming out of the material, not a lamp bolted onto it.
  grainP(c, w, h, s, rnd) {
    for (let x = 0; x < w; x += 6) { c.fillStyle = 'rgba(255,225,150,' + (0.018 + (x % 12 ? 0 : 0.02)).toFixed(3) + ')'; c.fillRect(x, 0, 2, h); }
    const sh = c.createLinearGradient(0, 0, w, h); sh.addColorStop(0, 'rgba(255,220,140,0.05)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,220,140,0.04)'); c.fillStyle = sh; c.fillRect(0, 0, w, h);
    // the filigree band: one repeating angular motif, drawn in gold, low enough not to fight the type
    const by = Math.round(h * 0.30), bh = Math.max(8, Math.round(h * 0.10));
    c.strokeStyle = 'rgba(230,190,90,0.16)'; c.lineWidth = 1.2;
    for (let x = 4; x < w; x += 26) { c.beginPath(); c.moveTo(x, by + bh); c.lineTo(x + 8, by); c.lineTo(x + 18, by); c.lineTo(x + 26, by + bh); c.stroke(); }
    c.strokeStyle = 'rgba(230,190,90,0.10)'; c.beginPath(); c.moveTo(0, by + bh + 2); c.lineTo(w, by + bh + 2); c.stroke();
    // khaydarin facets set along the lower band, each lit from inside
    for (let x = 20; x < w - 12; x += 74) {
      const y = h - Math.max(12, Math.round(h * 0.16)), r = 5;
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.moveTo(x, y - r - 1); c.lineTo(x + r + 1, y); c.lineTo(x, y + r + 1); c.lineTo(x - r - 1, y); c.closePath(); c.fill();
      const gg = c.createRadialGradient(x, y, 0.5, x, y, r); gg.addColorStop(0, s.glow + '0.65)'); gg.addColorStop(1, s.glow + '0)');
      c.fillStyle = gg; c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill();
    }
    c.lineWidth = 1;
  },

  // ---- the chrome: what each console IS, over and above what it is made of ----
  // grainT/Z/P give the three materials. This gives the three machines. A plate of steel is not a CRT
  // until something on it glows and scans; carapace is not a carapace until it has a bone ridge and a
  // wet membrane over it; cut stone is not psionic glass until the slabs stop touching each other.
  chrome(c, w, h, s, rnd) {
    if (s.grain === 'brushed') this.chromeT(c, w, h, s, rnd);
    else if (s.grain === 'organic') this.chromeZ(c, w, h, s, rnd);
    else this.chromeP(c, w, h, s, rnd);
  },
  // Terran: a cathode ray tube bolted into a plate. Amber phosphor pooling under the top rail where the
  // gun points, scanlines the whole height of the glass, and stencilled service lettering -- the thing
  // a real machine has that a UI never does, because a real machine is maintained by somebody.
  chromeT(c, w, h, s, rnd) {
    const g = c.createLinearGradient(0, 0, 0, h * 0.75);
    g.addColorStop(0, 'rgba(226,164,58,0.13)'); g.addColorStop(0.35, 'rgba(226,164,58,0.05)'); g.addColorStop(1, 'rgba(226,164,58,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h * 0.75);
    // Every third row, one pixel, and a brighter row every twelfth -- the interlace beat. Drawn once
    // into the texture: at 220 px that is 73 fillRects at bake time and none at draw time.
    for (let y = 2; y < h; y += 3) { c.fillStyle = y % 12 < 3 ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.13)'; c.fillRect(0, y, w, 1); }
    // stencilled service lettering along the bottom rail, and a placard at the left
    c.font = this.font(9); c.fillStyle = 'rgba(232,214,180,0.075)';
    const mark = this.caps('terran dominion  ·  fleet console mk iv  ·  do not open while energised   ');
    // Bounded by an iteration count and not only by `sx < w`: `spaced` returns a measured width, and a
    // font stack that measures to zero (which is every headless canvas stub in test/) would otherwise
    // spin here forever inside a bake nobody is watching.
    for (let i = 0, sx = 8; i < 40 && sx < w; i++) sx += this.spaced(c, mark, sx, h - 16, 1.6) + 26;
    c.fillStyle = 'rgba(232,214,180,0.10)'; c.font = this.font(8);
    this.spaced(c, this.caps('cmd-' + (1 + Math.floor(rnd() * 8)) + '/' + (10 + Math.floor(rnd() * 89))), 10, 20, 1.4);
    // the amber ready lamp, which is the one thing on the plate that is lit rather than reflecting
    const lx = w - 26, ly = 18, lg = c.createRadialGradient(lx, ly, 0.5, lx, ly, 9);
    lg.addColorStop(0, 'rgba(255,196,86,0.55)'); lg.addColorStop(1, 'rgba(255,196,86,0)');
    c.fillStyle = lg; c.beginPath(); c.arc(lx, ly, 9, 0, 7); c.fill();
  },
  // Zerg: the console is an organ. A bone ridge growing up out of the bottom edge and arching over the
  // sockets, a membrane stretched across the whole of it catching light like something wet, and
  // bioluminescence in the veins -- light coming from inside a living thing, not from a lamp.
  chromeZ(c, w, h, s, rnd) {
    // Bone ridges: pale ribs rising from the lower edge, each with a dark socket at its root. The
    // spacing and the height are both jittered, which matters more than it sounds -- an even row of
    // equal ribs at 13% white read as a comb of teeth along the bottom of the screen rather than as
    // something grown, and that is what the first version looked like.
    for (let x = 12; x < w; x += 46 + rnd() * 52) {
      const bh = h * (0.16 + rnd() * 0.20), bw = 5 + rnd() * 6;
      c.fillStyle = 'rgba(198,184,166,0.10)';
      c.beginPath(); c.moveTo(x - bw, h); c.quadraticCurveTo(x - bw * 0.5, h - bh, x, h - bh - 4); c.quadraticCurveTo(x + bw * 0.5, h - bh, x + bw, h); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(230,218,200,0.12)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, h - 2); c.lineTo(x, h - bh - 3); c.stroke();
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x, h - 3, bw * 1.2, 4, 0, 0, 7); c.fill();
    }
    // the membrane: one broad sheen laid over everything, brightest where it is stretched tightest
    const mg = c.createLinearGradient(0, 0, w * 0.35, h);
    mg.addColorStop(0, 'rgba(236,206,250,0.075)'); mg.addColorStop(0.45, 'rgba(180,120,210,0.02)'); mg.addColorStop(1, 'rgba(236,206,250,0.06)');
    c.fillStyle = mg; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) { const x = rnd() * w, y = h * (0.1 + rnd() * 0.7); c.strokeStyle = 'rgba(255,240,255,0.055)'; c.lineWidth = 2 + rnd() * 2; c.beginPath(); c.ellipse(x, y, 24 + rnd() * 50, 9 + rnd() * 14, rnd() * 0.5 - 0.25, 3.5, 5.5); c.stroke(); }
    // bioluminescent nodes along the veins: sickly, not pretty
    for (let i = 0; i < 16; i++) {
      const x = rnd() * w, y = 6 + rnd() * (h - 12), r = 4 + rnd() * 7;
      const gg = c.createRadialGradient(x, y, 0.5, x, y, r);
      gg.addColorStop(0, 'rgba(180,255,170,0.20)'); gg.addColorStop(0.5, 'rgba(150,90,200,0.10)'); gg.addColorStop(1, 'rgba(150,90,200,0)');
      c.fillStyle = gg; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
  },
  // Protoss: nothing is bolted to anything. The console is a row of slabs of lit glass held apart by
  // whatever holds a Protoss building three metres off the ground, so what says "no physical frame" is
  // the GAP -- a dark void between slabs, lit along both edges, and a top seam that stops and starts
  // instead of running the width of the machine.
  //
  // The gaps are painted voids and not a real `destination-out` cut. A cut was tried and it is worse
  // in the one place it matters: the console sits over the battlefield, so true holes show moving
  // terrain through the middle of the HUD and the eye chases it. A void reads as a gap and stays put.
  // Two to five gaps, whatever the console is wide. Capped rather than proportional for two reasons:
  // a row of eighteen thin slabs at 4K reads as louvres rather than as architecture, and the desync
  // below moves ONE SLAB PER DRAW CALL, so an uncapped count would put the glitch's cost on the user's
  // monitor width. Five is the most that still reads as separate objects.
  pGaps(w) { const out = [], n = clamp(Math.round(w / 420), 2, 5); for (let i = 1; i <= n; i++) out.push(Math.round(w * i / (n + 1))); return out; },
  chromeP(c, w, h, s, rnd) {
    for (const gx of this.pGaps(w)) {
      const gw = 4;
      c.fillStyle = 'rgba(4,6,10,0.86)'; c.fillRect(gx - gw / 2, 0, gw, h);
      // each slab's cut face: bright at the top where the light lives, falling away down the edge
      for (const e of [gx - gw / 2 - 1, gx + gw / 2]) { const eg = c.createLinearGradient(0, 0, 0, h); eg.addColorStop(0, s.glow + '0.42)'); eg.addColorStop(0.5, 'rgba(230,184,74,0.12)'); eg.addColorStop(1, s.glow + '0)'); c.fillStyle = eg; c.fillRect(e, 0, 1, h); }
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(gx - gw / 2 - 3, 0, 3, h);   // the shadow one slab casts on the next
    }
    // finer filigree than grainP's band: a nested chevron chain, the geometry Protoss architecture is
    // made of, small enough to read as inlay rather than as a second border
    c.strokeStyle = 'rgba(255,232,178,0.13)'; c.lineWidth = 1;
    const fy = Math.round(h * 0.62);
    for (let x = 10; x < w - 10; x += 34) {
      c.beginPath(); c.moveTo(x, fy + 5); c.lineTo(x + 9, fy - 4); c.lineTo(x + 18, fy + 5); c.stroke();
      c.beginPath(); c.moveTo(x + 4, fy + 5); c.lineTo(x + 9, fy - 0.5); c.lineTo(x + 14, fy + 5); c.stroke();
    }
    // and the hover: a lit line along the top of every slab, a dark one along the bottom
    c.fillStyle = 'rgba(255,238,190,0.10)'; c.fillRect(0, 3, w, 1);
    const ug = c.createLinearGradient(0, h - 14, 0, h); ug.addColorStop(0, 'rgba(0,0,0,0)'); ug.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = ug; c.fillRect(0, h - 14, w, 14);
  },

  // ---- what the war does to it -------------------------------------------
  // `k` is 0..1 severity, quantised to a bucket by the caller. Everything here is baked into the
  // panel texture, so a wrecked console costs exactly the same per frame as a pristine one.
  wearLayer(c, w, h, s, k, rnd) {
    if (s.grain === 'brushed') this.wearT(c, w, h, s, k, rnd);
    else if (s.grain === 'organic') this.wearZ(c, w, h, s, k, rnd);
    else this.wearP(c, w, h, s, k, rnd);
    // Soot, shared. It pools where a hand does not reach: the corners and the bottom edge.
    const vg = c.createRadialGradient(w / 2, h * 0.45, h * 0.25, w / 2, h * 0.45, w * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(6,4,3,' + (0.30 * k).toFixed(3) + ')');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  },
  // Terran: steel does not rot gracefully. It cracks along the seams it was welded on, it blooms rust
  // out of every rivet that lost its paint, it chars where something burned against it, and the tube
  // loses bands of phosphor that never come back.
  wearT(c, w, h, s, k, rnd) {
    const n = Math.round(2 + k * 7);
    for (let i = 0; i < n; i++) {
      let x = rnd() * w, y = h * (0.15 + rnd() * 0.7), a = rnd() * Math.PI * 2;
      const path = [[x, y]];
      for (let seg = 0; seg < 3 + Math.floor(k * 4); seg++) { a += rnd() * 1.1 - 0.55; x += Math.cos(a) * (8 + rnd() * 22); y += Math.sin(a) * (5 + rnd() * 12); path.push([x, y]); }
      for (const [off, col, wd] of [[1, 'rgba(226,232,240,0.16)', 1], [0, 'rgba(0,0,0,0.72)', 1.6 + k]]) {
        c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); c.moveTo(path[0][0] + off, path[0][1] + off);
        for (let j = 1; j < path.length; j++) c.lineTo(path[j][0] + off, path[j][1] + off);
        c.stroke();
      }
    }
    // corrosion: oxide blooming out of the fixings, which is where water sits on a real plate
    for (let i = 0; i < Math.round(3 + k * 12); i++) {
      const x = rnd() * w, y = rnd() * h, r = 5 + rnd() * (10 + k * 22);
      const g = c.createRadialGradient(x, y, 0.5, x, y, r);
      g.addColorStop(0, 'rgba(158,74,26,' + (0.30 * k).toFixed(3) + ')'); g.addColorStop(0.6, 'rgba(120,58,22,' + (0.16 * k).toFixed(3) + ')'); g.addColorStop(1, 'rgba(120,58,22,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.fillStyle = 'rgba(40,20,8,' + (0.35 * k).toFixed(3) + ')'; c.beginPath(); c.arc(x, y, 1 + rnd() * 2, 0, 7); c.fill();   // the pit itself
    }
    // char: something burned against the plate and the paint went with it
    for (let i = 0; i < Math.round(k * 5); i++) { const x = rnd() * w, y = h * (0.25 + rnd() * 0.7); c.fillStyle = 'rgba(12,10,9,' + (0.42 * k).toFixed(3) + ')'; c.beginPath(); c.ellipse(x, y, 12 + rnd() * 34, 6 + rnd() * 14, rnd() * 0.7 - 0.35, 0, 7); c.fill(); }
    // dead phosphor: bands of the tube that stopped answering. This is the cue that reads first,
    // because it is the only one that breaks the scanlines the eye has already learned.
    for (let i = 0; i < Math.round(k * 3.4); i++) { const y = rnd() * h, bh = 2 + rnd() * (3 + k * 7); c.fillStyle = 'rgba(0,0,0,' + (0.34 + 0.3 * k).toFixed(3) + ')'; c.fillRect(0, y, w, bh); c.fillStyle = 'rgba(226,164,58,0.06)'; c.fillRect(0, y - 1, w, 1); }
  },
  // Zerg: it does not corrode, it necrotises. Chitin splits and what is under it is wet; the plates
  // around a split go grey and dry; and the light in the veins goes out patch by patch.
  wearZ(c, w, h, s, k, rnd) {
    for (let i = 0; i < Math.round(2 + k * 8); i++) {
      let x = rnd() * w, y = h * (0.1 + rnd() * 0.8), a = rnd() * Math.PI * 2;
      const path = [[x, y]];
      for (let seg = 0; seg < 3 + Math.floor(k * 3); seg++) { a += rnd() * 0.9 - 0.45; x += Math.cos(a) * (10 + rnd() * 24); y += Math.sin(a) * (4 + rnd() * 10); path.push([x, y]); }
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(6,2,6,0.72)'; c.lineWidth = 2.5 + k * 3.5; c.beginPath(); c.moveTo(path[0][0], path[0][1]); for (let j = 1; j < path.length; j++) c.lineTo(path[j][0], path[j][1]); c.stroke();
      c.strokeStyle = 'rgba(150,20,40,' + (0.30 + 0.28 * k).toFixed(3) + ')'; c.lineWidth = 1 + k * 2; c.beginPath(); c.moveTo(path[0][0], path[0][1] + 1); for (let j = 1; j < path.length; j++) c.lineTo(path[j][0], path[j][1] + 1); c.stroke();
      c.strokeStyle = 'rgba(255,190,210,0.10)'; c.lineWidth = 1; c.beginPath(); c.moveTo(path[0][0], path[0][1] - 1); for (let j = 1; j < path.length; j++) c.lineTo(path[j][0], path[j][1] - 1); c.stroke();
      c.lineCap = 'butt';
    }
    // necrosis: the carapace around a split goes grey-green and stops being wet
    for (let i = 0; i < Math.round(2 + k * 10); i++) {
      const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * (10 + k * 26);
      const g = c.createRadialGradient(x, y, 0.5, x, y, r);
      g.addColorStop(0, 'rgba(96,104,72,' + (0.32 * k).toFixed(3) + ')'); g.addColorStop(0.65, 'rgba(58,60,44,' + (0.20 * k).toFixed(3) + ')'); g.addColorStop(1, 'rgba(58,60,44,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 1.2, 0, 7); c.fill();
    }
    // bled, then dried: dark spatter that has run downward under its own weight
    for (let i = 0; i < Math.round(k * 22); i++) { const x = rnd() * w, y = rnd() * h; c.fillStyle = 'rgba(70,8,20,' + (0.28 + 0.34 * k).toFixed(3) + ')'; c.beginPath(); c.ellipse(x, y, 1 + rnd() * 3, 2 + rnd() * 7, 0, 0, 7); c.fill(); }
    // the light going out, patch by patch
    for (let i = 0; i < Math.round(k * 6); i++) { const x = rnd() * w, y = rnd() * h; c.fillStyle = 'rgba(10,4,12,' + (0.30 * k).toFixed(3) + ')'; c.beginPath(); c.ellipse(x, y, 20 + rnd() * 50, 8 + rnd() * 20, rnd(), 0, 7); c.fill(); }
  },
  // Protoss: glass. It does not bend, so it fractures -- one impact point and a web out of it -- and
  // where a slab loses its feed it stops being lit and goes cold and grey while the rest stay gold.
  wearP(c, w, h, s, k, rnd) {
    for (let i = 0; i < Math.round(1 + k * 4); i++) {
      const cx = rnd() * w, cy = h * (0.15 + rnd() * 0.7), R = 14 + rnd() * (16 + k * 46), arms = 5 + Math.floor(rnd() * 5);
      const ends = [];
      for (let a = 0; a < arms; a++) { const ang = a / arms * Math.PI * 2 + rnd() * 0.5, r = R * (0.5 + rnd() * 0.5); ends.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]); }
      c.strokeStyle = 'rgba(4,8,14,0.60)'; c.lineWidth = 1.6;
      for (const [ex, ey] of ends) { c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke(); }
      c.strokeStyle = 'rgba(190,236,255,' + (0.22 + 0.2 * k).toFixed(3) + ')'; c.lineWidth = 0.8;
      for (const [ex, ey] of ends) { c.beginPath(); c.moveTo(cx + 1, cy + 1); c.lineTo(ex + 1, ey + 1); c.stroke(); }
      // the concentric rings of a web, which is what makes it read as glass and not as a starburst
      for (let ring = 1; ring <= 2 + Math.floor(k * 2); ring++) {
        c.strokeStyle = 'rgba(4,8,14,0.34)'; c.lineWidth = 1; c.beginPath();
        for (let a = 0; a <= arms; a++) { const p = ends[a % arms], f = ring / (3 + k * 2); const px = cx + (p[0] - cx) * f, py = cy + (p[1] - cy) * f; a ? c.lineTo(px, py) : c.moveTo(px, py); }
        c.stroke();
      }
      const gg = c.createRadialGradient(cx, cy, 0.5, cx, cy, 6); gg.addColorStop(0, 'rgba(255,255,255,0.30)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gg; c.beginPath(); c.arc(cx, cy, 6, 0, 7); c.fill();
    }
    // Slabs that lost their feed: the light goes and the gold with it. Held to roughly two slabs in
    // five even at total ruin, and to a wash rather than a blackout -- a Protoss console carries the
    // unit panel and the command card, and the first version put half the card behind 62% black,
    // which is a legibility bug dressed as atmosphere.
    const gaps = [0].concat(this.pGaps(w), [w]);
    for (let i = 0; i < gaps.length - 1; i++) {
      if (rnd() > k * 0.45) continue;
      const x0 = gaps[i] + 2, x1 = gaps[i + 1] - 2;
      c.fillStyle = 'rgba(6,7,10,' + (0.22 + 0.20 * k).toFixed(3) + ')'; c.fillRect(x0, 0, x1 - x0, h);
      c.fillStyle = 'rgba(120,140,160,0.05)'; c.fillRect(x0, 0, x1 - x0, 1);
    }
    // and the gold itself dulling: a cold desaturating wash over the whole sheet
    c.fillStyle = 'rgba(30,40,58,' + (0.22 * k).toFixed(3) + ')'; c.fillRect(0, 0, w, h);
  },

  // ---- the top edge, which is the first thing the eye reads ---------------
  topEdge(c, w, h, s, rnd) {
    c.fillStyle = s.edge; c.globalAlpha = 0.75; c.fillRect(0, 0, w, 2); c.globalAlpha = 1;
    if (s.grain === 'brushed') {  // hazard paint on the rail, the way a real machine marks its edges
      c.save(); c.beginPath(); c.rect(0, 2, w, 5); c.clip();
      for (let x = -20; x < w + 20; x += 14) { c.fillStyle = (x / 14 | 0) % 2 ? 'rgba(215,161,60,0.5)' : 'rgba(20,24,30,0.5)'; c.beginPath(); c.moveTo(x, 7); c.lineTo(x + 7, 2); c.lineTo(x + 14, 2); c.lineTo(x + 7, 7); c.closePath(); c.fill(); }
      c.restore();
    } else if (s.grain === 'organic') {  // a scalloped chitin ridge: overlapping plates, not a rail
      c.save();
      for (let x = -6; x < w + 12; x += 17) {
        c.fillStyle = 'rgba(0,0,0,0.40)'; c.beginPath(); c.ellipse(x + 9, 1, 11, 7, 0, 0, Math.PI); c.fill();
        c.strokeStyle = 'rgba(200,140,230,0.22)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(x + 9, 1, 11, 7, 0, 0.15, Math.PI - 0.15); c.stroke();
      }
      c.restore();
    } else {  // a psionic seam: light bleeding up out of the stone
      const gg = c.createLinearGradient(0, 0, 0, 10); gg.addColorStop(0, s.glow + '0.34)'); gg.addColorStop(1, s.glow + '0)');
      c.fillStyle = gg; c.fillRect(0, 2, w, 10);
      // BROKEN INTO SEGMENTS, one per slab, with the gap left dark. A continuous gold line along the
      // top is a frame, and a Protoss console is not framed -- it is a row of things hovering next to
      // each other. This is the cheapest place the difference registers, because the top rail is the
      // first edge the eye finds, and it costs one extra fillRect per gap at bake time.
      const gaps = [0].concat(this.pGaps(w), [w]);
      c.fillStyle = 'rgba(230,184,74,0.5)';
      for (let i = 0; i < gaps.length - 1; i++) { const x0 = gaps[i] + (i ? 4 : 0), x1 = gaps[i + 1] - (i + 2 < gaps.length ? 4 : 0); if (x1 > x0) c.fillRect(x0, 2, x1 - x0, 1); }
      c.fillStyle = 'rgba(0,0,0,0.55)';
      for (const gx of this.pGaps(w)) c.fillRect(gx - 5, 0, 10, 3);
    }
  },

  // ---- the section ribs ---------------------------------------------------
  // Where the console divides into minimap / unit panel / command card. A real one is built out of
  // sections and the seams are where the eye rests; without them the whole bar is one slab however
  // good the texture is. What the seam is MADE of is the per-race part: bolted plate, a chitin spine,
  // or a column of set crystal.
  rib(c, x, h, s) {
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - 3, 4, 3, h - 8);
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(x, 4, 2, h - 8);
    c.fillStyle = s.edge; c.globalAlpha = 0.18; c.fillRect(x - 1, 4, 1, h - 8); c.globalAlpha = 1;
    if (s.grain === 'brushed') { for (let ry = 12; ry < h - 10; ry += 22) this.bolt(c, x - 1, ry, 2, s); }
    else if (s.grain === 'organic') {
      for (let ry = 10; ry < h - 8; ry += 14) {
        c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(x - 1, ry, 5, 8, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(200,140,230,0.20)'; c.lineWidth = 1; c.beginPath(); c.ellipse(x - 1, ry - 1, 5, 8, 0, 3.4, 6.0); c.stroke();
      }
    } else {
      for (let ry = 14; ry < h - 10; ry += 20) {
        const gg = c.createRadialGradient(x - 1, ry, 0.5, x - 1, ry, 5); gg.addColorStop(0, s.glow + '0.5)'); gg.addColorStop(1, s.glow + '0)');
        c.fillStyle = gg; c.beginPath(); c.moveTo(x - 1, ry - 5); c.lineTo(x + 3, ry); c.lineTo(x - 1, ry + 5); c.lineTo(x - 5, ry); c.closePath(); c.fill();
      }
    }
  },
  // Trebuchet is a 1996 *web* face and reads like one. The console fonts of this era were condensed,
  // heavy and squared off, so this asks for those first and keeps Trebuchet only as the last resort.
  font(sz, bold = true) { return (bold ? 'bold ' : '') + sz + 'px "Eurostile", "Bank Gothic", "Agency FB", "Franklin Gothic Medium", "Trebuchet MS", Arial, sans-serif'; },
  // Era HUD labels were set in caps with air between the letters, which is as much of the look as the
  // face is -- and it survives the font not being installed, which the face itself does not.
  caps(s) { return String(s).toUpperCase(); },
  spaced(ctx, s, x, y, tracking) { let cx = x; for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + tracking; } return cx - x - tracking; },
  spacedWidth(ctx, s, tracking) { let w = 0; for (const ch of s) w += ctx.measureText(ch).width + tracking; return w - tracking; },
  // Two-pixel bevel rather than one: the outer line is the hard highlight, the inner a softer one, so
  // a button reads as a thick piece of plate at a glance instead of a rectangle with a light edge.
  bevel(ctx, x, y, w, h, raised = true, fill = '#1c212a') {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    for (const [i, a] of [[0, raised ? 0.22 : 0.62], [1, raised ? 0.10 : 0.28]]) {
      ctx.strokeStyle = raised ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + i + .5, y + h - i - .5); ctx.lineTo(x + i + .5, y + i + .5); ctx.lineTo(x + w - i - .5, y + i + .5); ctx.stroke();
      ctx.strokeStyle = raised ? 'rgba(0,0,0,' + (a * 2.6) + ')' : 'rgba(255,255,255,' + (a * 0.35) + ')';
      ctx.beginPath(); ctx.moveTo(x + w - i - .5, y + i + .5); ctx.lineTo(x + w - i - .5, y + h - i - .5); ctx.lineTo(x + i + .5, y + h - i - .5); ctx.stroke();
    }
  },
  // `opts.ribs === false` drops the two section seams, which only mean anything on the console itself --
  // the codex is one full-screen sheet and a seam at 15% of its width would cut through the unit list.
  frame(ctx, x, y, w, h, opts) {
    const s = this.skin();
    const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
    // Past 2.5 megapixels the texture is built at half size and blitted up. The console never gets
    // there (3840 x 220 is 845,000) and neither does a full-screen panel at 1080p, but one at 4K is
    // 3840 x 2160 -- 33 MB of canvas per race tab, holding grain. Bevels and corners are still drawn
    // at full size, so nothing with an edge is softened.
    const k = W * H > 2500000 ? 2 : 1;
    const p = this.panel(Math.ceil(W / k), Math.ceil(H / k), !opts || opts.ribs !== false);
    ctx.drawImage(p, 0, 0, p.width, p.height, x, y, W, H);
    this.bevel(ctx, x + 2, y + 2, w - 4, h - 4, true, 'rgba(0,0,0,0)');
    for (const [cx, cy, sx, sy] of [[x + 4, y + 4, 1, 1], [x + w - 4, y + 4, -1, 1], [x + 4, y + h - 4, 1, -1], [x + w - 4, y + h - 4, -1, -1]]) this.corner(ctx, cx, cy, sx, sy, s);
  },
  // The corner is where a frame says what it is made of, and four identical brackets said "one machine
  // in three paint jobs". Terran gets an L of plate with a bolt through it; Zerg a talon curling in off
  // the edge; Protoss a mitred chamfer with a lit facet set in it.
  corner(ctx, cx, cy, sx, sy, s) {
    const B = 16;
    if (s.grain === 'organic') {
      ctx.strokeStyle = 'rgba(230,190,250,0.16)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + sx * B, cy + sy * 1); ctx.quadraticCurveTo(cx + sx * 2, cy + sy * 2, cx + sx * 1, cy + sy * B); ctx.stroke();
      ctx.strokeStyle = s.edge; ctx.globalAlpha = 0.30; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + sx * (B - 4), cy + sy * 4); ctx.quadraticCurveTo(cx + sx * 5, cy + sy * 5, cx + sx * 4, cy + sy * (B - 4)); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(20,10,24,0.9)'; ctx.beginPath(); ctx.moveTo(cx + sx * 3, cy + sy * 3); ctx.lineTo(cx + sx * 11, cy + sy * 4); ctx.lineTo(cx + sx * 4, cy + sy * 11); ctx.closePath(); ctx.fill();
      ctx.lineCap = 'butt'; ctx.lineWidth = 1; return;
    }
    if (s.grain === 'gilded') {
      ctx.strokeStyle = 'rgba(255,235,180,0.20)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + sx * B, cy + sy * 1); ctx.lineTo(cx + sx * 6, cy + sy * 6); ctx.lineTo(cx + sx * 1, cy + sy * B); ctx.stroke();
      ctx.strokeStyle = s.edge; ctx.globalAlpha = 0.38; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + sx * (B - 3), cy + sy * 4); ctx.lineTo(cx + sx * 8, cy + sy * 8); ctx.lineTo(cx + sx * 4, cy + sy * (B - 3)); ctx.stroke(); ctx.globalAlpha = 1;
      const fx = cx + sx * 8.5, fy = cy + sy * 8.5;
      ctx.fillStyle = s.accent; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(fx, fy - 3); ctx.lineTo(fx + 3, fy); ctx.lineTo(fx, fy + 3); ctx.lineTo(fx - 3, fy); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 1; return;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(cx + sx * B, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * B); ctx.stroke();
    ctx.strokeStyle = s.edge; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(cx + sx * (B - 3), cy + sy * 3); ctx.lineTo(cx + sx * 3, cy + sy * 3); ctx.lineTo(cx + sx * 3, cy + sy * (B - 3)); ctx.stroke(); ctx.globalAlpha = 1;
    this.bolt(ctx, cx + sx * 7, cy + sy * 7, 2.6, s);
    ctx.lineWidth = 1;
  },
  // Every recessed screen on the console goes through here, so it is the cheapest place to make the
  // three machines feel different: a bolted viewport, a socket in something living, or cut stone.
  inset(ctx, x, y, w, h) {
    const s = this.skin();
    ctx.fillStyle = s.ink; ctx.fillRect(x, y, w, h);
    this.bevel(ctx, x, y, w, h, false, 'rgba(0,0,0,0)');
    ctx.strokeStyle = s.edge; ctx.globalAlpha = 0.22; ctx.lineWidth = 1;
    if (s.grain === 'gilded') {   // no square corners anywhere on a Protoss console
      const m = Math.min(6, w / 4, h / 4);
      ctx.beginPath();
      ctx.moveTo(x + 1.5 + m, y + 1.5); ctx.lineTo(x + w - 1.5 - m, y + 1.5); ctx.lineTo(x + w - 1.5, y + 1.5 + m);
      ctx.lineTo(x + w - 1.5, y + h - 1.5 - m); ctx.lineTo(x + w - 1.5 - m, y + h - 1.5); ctx.lineTo(x + 1.5 + m, y + h - 1.5);
      ctx.lineTo(x + 1.5, y + h - 1.5 - m); ctx.lineTo(x + 1.5, y + 1.5 + m); ctx.closePath(); ctx.stroke();
    } else ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.globalAlpha = 1;
    if (s.grain === 'brushed') { for (const [dx, dy] of [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]]) this.bolt(ctx, x + dx, y + dy, 2, s); }
    else if (s.grain === 'organic') {   // a socket in something living: a chitin lip at each corner
      const r = Math.min(10, w / 3, h / 3);
      ctx.strokeStyle = 'rgba(200,140,230,0.20)'; ctx.lineWidth = 2;
      for (const [dx, dy, a0] of [[r, r, Math.PI], [w - r, r, -Math.PI / 2], [w - r, h - r, 0], [r, h - r, Math.PI / 2]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r - 2, a0, a0 + Math.PI / 2); ctx.stroke(); }
      ctx.lineWidth = 1;
    }
  },
  // ==========================================================================
  // The glitch: the only part of this that cannot be baked
  // ==========================================================================
  // A tear has to be different every frame or it is an animation, so this is the one pass that runs
  // live -- and it is written in DRAW CALLS, because that is the currency M9 measured this renderer
  // in. A full-strength Protoss desync is nine calls for the whole console. Nothing here is per unit,
  // per button or per pixel; a wrecked console and a pristine one differ by under a dozen calls.
  //
  // The tear reads slices out of the canvas it is drawing to and puts them back offset. That is not a
  // trick, it is what a torn frame IS -- the display showing you last scanline's contents at this
  // scanline's position -- and it means the tear carries whatever was actually on the console: the
  // minimap, the portrait, the command card. An overlay of pre-baked noise cannot do that, and it was
  // the first thing tried; it looks like a filter laid over the HUD rather than the HUD failing.
  //
  // Source rectangles are in DEVICE pixels and destinations in CSS pixels, because the canvas is sized
  // in device pixels (Render.resize) while the HUD draws under Render.base's dpr transform. Getting
  // that backwards is invisible at dpr 1 and tears the wrong part of the screen on a scaled display.
  slice(ctx, cv, dpr, sx, sy, sw, sh, dx, dy) {
    const CW = cv.width | 0, CH = cv.height | 0;
    if (CW <= 0 || CH <= 0) return 0;
    let X = Math.round(sx * dpr), Y = Math.round(sy * dpr), W = Math.round(sw * dpr), H = Math.round(sh * dpr);
    if (X < 0) { W += X; X = 0; } if (Y < 0) { H += Y; Y = 0; }
    if (X + W > CW) W = CW - X; if (Y + H > CH) H = CH - Y;
    if (W <= 0 || H <= 0) return 0;
    ctx.drawImage(cv, X, Y, W, H, dx, dy, W / dpr, H / dpr);
    return 1;
  },
  // Small baked tiles for the effects that would otherwise build a gradient per frame -- the exact
  // cost M8 measured on the muzzle flash and moved into a cache. Two entries, both Zerg's, for the
  // life of the process -- and warmed by the test before it counts anything, because baking ninety
  // ellipses into the first frame that asked for them looks exactly like a frame that costs 99 calls.
  fxTile(kind) {
    const got = this._fx.get(kind); if (got) return got;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const c = cv.getContext('2d');
    if (kind === 'pulse') { const g = c.createRadialGradient(32, 32, 1, 32, 32, 32); g.addColorStop(0, 'rgba(214,120,255,0.55)'); g.addColorStop(0.55, 'rgba(150,40,120,0.22)'); g.addColorStop(1, 'rgba(120,20,90,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
    else { // flecks: blood thrown at the inside of the membrane, baked once and blitted at an offset
      let seed = 20250909; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (let i = 0; i < 90; i++) { const x = rnd() * 64, y = rnd() * 64, r = 0.6 + rnd() * 2.2; c.fillStyle = 'rgba(' + (110 + rnd() * 70 | 0) + ',10,30,' + (0.35 + rnd() * 0.5).toFixed(2) + ')'; c.beginPath(); c.ellipse(x, y, r, r * (1 + rnd()), 0, 0, 7); c.fill(); }
    }
    this._fx.set(kind, cv); return cv;
  },
  // The entry point. Returns how many draw calls it made, which is what test/diegetic.js budgets on.
  glitchDraw(ctx, x, y, w, h) {
    if (!ctx || !ctx.canvas || !(w > 0) || !(h > 0)) return 0;
    const g = this.glitch();
    if (g.i <= 0.03) return 0;            // an intact console is byte-identical to the one before this
    const s = this.skin(), cv = ctx.canvas;
    const dpr = (typeof Render !== 'undefined' && Render.dpr > 0) ? Render.dpr : 1;
    let n = 0; ctx.save();
    if (s.grain === 'brushed') n = this.glitchT(ctx, cv, dpr, x, y, w, h, s, g);
    else if (s.grain === 'organic') n = this.glitchZ(ctx, cv, dpr, x, y, w, h, s, g);
    else n = this.glitchP(ctx, cv, dpr, x, y, w, h, s, g);
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    return n;
  },
  // Terran: the tube loses vertical hold. Slices slip sideways, a bright sync bar rolls down the
  // glass, and the gaps between them fill with snow.
  glitchT(ctx, cv, dpr, x, y, w, h, s, g) {
    let n = 0;
    for (let k = 0; k < g.bands; k++) {
      const by = y + this.noise(g.frame, 30 + k) * (h - 6);
      const bh = 3 + this.noise(g.frame, 60 + k) * h * 0.16;
      const dx = (this.noise(g.frame, 90 + k) * 2 - 1) * 14 * g.i;
      n += this.slice(ctx, cv, dpr, x, by, w, Math.min(bh, y + h - by), x + dx, by);
    }
    const ry = y + g.roll * h;                                  // the sync bar
    ctx.globalAlpha = 0.16 * g.i; ctx.fillStyle = s.accent; ctx.fillRect(x, ry, w, 2 + 7 * g.i); n++;
    ctx.globalAlpha = 0.30 * g.i; ctx.fillStyle = '#000'; ctx.fillRect(x, ry + 3 + 7 * g.i, w, 2); n++;
    // Snow, as three wide bars rather than a noise texture: at this alpha the eye reads interference
    // either way, and a per-frame ImageData is the one thing in a draw pass that genuinely is slow.
    ctx.globalAlpha = 0.10 * g.hiss;
    for (let k = 0; k < 3; k++) { ctx.fillStyle = k & 1 ? '#e8eef6' : '#05070a'; ctx.fillRect(x, y + this.noise(g.frame, 120 + k) * h, w, 1 + this.noise(g.frame, 150 + k) * 3); n++; }
    ctx.globalAlpha = 1; return n;
  },
  // Zerg: it does not lose sync, it flinches. The whole thing swells once from underneath and throws
  // flecks against the inside of the membrane.
  glitchZ(ctx, cv, dpr, x, y, w, h, s, g) {
    let n = 0;
    // The swell: a slab of the console lifted a couple of pixels, which reads as flesh moving rather
    // than as a display error. Only ever vertical, and never more than four pixels.
    for (let k = 0; k < g.bands; k++) {
      const by = y + this.noise(g.frame, 41 + k) * (h - 10);
      const bh = 6 + this.noise(g.frame, 71 + k) * h * 0.3;
      const dy = (this.noise(g.frame, 101 + k) * 2 - 1) * 4 * g.i;
      n += this.slice(ctx, cv, dpr, x, by, w, Math.min(bh, y + h - by), x, by + dy);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28 * g.i;
    const px = x + this.noise(g.seed, 5) * w;
    ctx.drawImage(this.fxTile('pulse'), px - h * 1.4, y - h * 0.2, h * 2.8, h * 1.4); n++;
    ctx.globalCompositeOperation = 'source-over';
    // Four clusters, not a tiling. Tiling a 64 px sheet across a 4K console is sixty draw calls to
    // paint something the eye reads as spatter either way, and spatter is not uniform in the first
    // place -- it lands where it was thrown from.
    ctx.globalAlpha = 0.42 * g.hiss;
    const fl = this.fxTile('fleck');
    for (let k = 0; k < 4; k++) { const s2 = 60 + this.noise(g.frame, 160 + k) * 90; ctx.drawImage(fl, x + this.noise(g.frame, 11 + k) * (w - s2), y + this.noise(g.frame, 130 + k) * Math.max(1, h - s2), s2, s2); n++; }
    ctx.globalAlpha = 1; return n;
  },
  // Protoss: nothing is bolted to anything, so when the field stutters the slabs stop agreeing with
  // each other. Each one steps out of line and the light between them splits into its colours.
  glitchP(ctx, cv, dpr, x, y, w, h, s, g) {
    let n = 0, moved = 0;
    const gaps = [0].concat(this.pGaps(w), [w]);
    for (let i = 0; i < gaps.length - 1 && moved < 4; i++) {
      const x0 = x + gaps[i], x1 = x + gaps[i + 1];
      const dy = (this.noise(g.frame, 200 + i) * 2 - 1) * 5 * g.i;
      const dx = (this.noise(g.frame, 230 + i) * 2 - 1) * 4 * g.i;
      if (Math.abs(dy) < 0.4 && Math.abs(dx) < 0.4) continue;
      moved++;
      n += this.slice(ctx, cv, dpr, x0, y, x1 - x0, h, x0 + dx, y + dy);
      // Chromatic fringing on the slab's own edges: cyan on one side, magenta on the other, added
      // rather than blended, which is what a prism does and what a colour-separated frame looks like.
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * g.hiss;
      ctx.fillStyle = '#00b4ff'; ctx.fillRect(x0 + dx, y + dy, 2, h); n++;
      ctx.fillStyle = '#ff3ca8'; ctx.fillRect(x1 + dx - 2, y + dy, 2, h); n++;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1; return n;
  },

  // A hard black shell on all four sides rather than one offset shadow. Era UI text sat on top of
  // whatever the console was made of and had to stay legible over rivets and hazard paint, so it was
  // outlined, not drop-shadowed -- a shadow only works when what is behind it is flat.
  text(ctx, s, x, y, color = '#d8dde4', sz = 12, bold = true, align = 'left') {
    ctx.font = this.font(sz, bold); ctx.textAlign = align;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) ctx.fillText(s, x + dx, y + dy);
    ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.textAlign = 'left';
  },
  // Greedy word wrap that MEASURES and returns lines rather than drawing them, because the two callers
  // both need the width and the line count before they can draw anything: the command-card tooltip
  // sizes its panel around the result, and Codex.wrap needs somewhere to start each line. Sets ctx.font
  // itself so the measurement is taken at the size it will be drawn at -- measuring at whatever font
  // happened to be current was how the first version came out a word short on every line.
  wrapLines(ctx, text, w, sz, bold = false) {
    ctx.font = this.font(sz, bold);
    const out = []; let line = '';
    for (const wd of String(text).split(' ')) {
      const t = line ? line + ' ' + wd : wd;
      if (line && ctx.measureText(t).width > w) { out.push(line); line = wd; } else line = t;
    }
    if (line) out.push(line);
    return out;
  },
  hotLabel(ctx, label, hk, x, y, w, color = '#e6eaf0', fs = 10) { // label with hotkey letter highlighted
    ctx.font = this.font(fs); const words = label.split(' '); const lines = []; let cur = ''; for (const wd of words) { if (ctx.measureText((cur + ' ' + wd).trim()).width > w - 6 && cur) { lines.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); } lines.push(cur);
    let hkDone = false; lines.forEach((ln, i) => { let lx = x + w / 2 - ctx.measureText(ln).width / 2, ly = y + i * (fs + 1); if (!hkDone && hk && hk.length === 1) { const idx = ln.toUpperCase().indexOf(hk.toUpperCase()); if (idx >= 0) { const a = ln.slice(0, idx), b = ln[idx], c = ln.slice(idx + 1); ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillText(ln, lx + 1, ly + 1); ctx.fillStyle = color; ctx.fillText(a, lx, ly); lx += ctx.measureText(a).width; ctx.fillStyle = '#ffe45a'; ctx.fillText(b, lx, ly); lx += ctx.measureText(b).width; ctx.fillStyle = color; ctx.fillText(c, lx, ly); hkDone = true; return; } } ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillText(ln, lx + 1, ly + 1); ctx.fillStyle = color; ctx.fillText(ln, lx, ly); });
  },
  iconFor(b) { if (b.icon) return b.icon; const l = b.label; const map = { 'Move': 'move', 'Stop': 'stop', 'Attack': 'attack', 'Patrol': 'patrol', 'Hold Position': 'hold', 'Gather': 'gather', 'Return Cargo': 'gather', 'Repair': 'repair', 'Build': 'build', 'Build Advanced': 'build2', 'Cancel': 'cancel', 'Set Rally': 'rally', 'Lift Off': 'lift', 'Land': 'land', 'Unload': 'unload', 'Unload All': 'unload' }; return map[l] || null; },
  glyph(ctx, kind, x, y, s, color) { ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (kind) {
      case 'move': ctx.beginPath(); ctx.moveTo(-s * .6, 0); ctx.lineTo(s * .6, 0); ctx.moveTo(s * .2, -s * .4); ctx.lineTo(s * .6, 0); ctx.lineTo(s * .2, s * .4); ctx.stroke(); break;
      case 'stop': ctx.beginPath(); ctx.rect(-s * .45, -s * .45, s * .9, s * .9); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * .3, -s * .3); ctx.lineTo(s * .3, s * .3); ctx.stroke(); break;
      case 'attack': ctx.beginPath(); ctx.arc(0, 0, s * .5, 0, 7); ctx.moveTo(-s * .7, 0); ctx.lineTo(-s * .25, 0); ctx.moveTo(s * .25, 0); ctx.lineTo(s * .7, 0); ctx.moveTo(0, -s * .7); ctx.lineTo(0, -s * .25); ctx.moveTo(0, s * .25); ctx.lineTo(0, s * .7); ctx.stroke(); break;
      case 'patrol': ctx.beginPath(); ctx.moveTo(-s * .5, s * .3); ctx.lineTo(-s * .5, -s * .3); ctx.lineTo(s * .5, -s * .3); ctx.lineTo(s * .5, s * .3); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s * .2, -s * .55); ctx.lineTo(s * .5, -s * .3); ctx.lineTo(s * .2, -s * .05); ctx.stroke(); break;
      case 'hold': ctx.beginPath(); ctx.moveTo(0, -s * .6); ctx.lineTo(s * .55, -s * .3); ctx.lineTo(s * .55, s * .3); ctx.lineTo(0, s * .6); ctx.lineTo(-s * .55, s * .3); ctx.lineTo(-s * .55, -s * .3); ctx.closePath(); ctx.stroke(); break;
      case 'gather': ctx.beginPath(); ctx.moveTo(-s * .5, s * .4); ctx.lineTo(-s * .25, -s * .4); ctx.lineTo(s * .1, -s * .1); ctx.lineTo(s * .5, -s * .5); ctx.lineTo(s * .5, s * .4); ctx.closePath(); ctx.fill(); break;
      case 'repair': ctx.beginPath(); ctx.moveTo(-s * .5, s * .5); ctx.lineTo(s * .2, -s * .2); ctx.stroke(); ctx.beginPath(); ctx.arc(s * .3, -s * .3, s * .3, 0.5, 5.5); ctx.stroke(); break;
      case 'build': case 'build2': ctx.beginPath(); ctx.rect(-s * .5, -s * .1, s * 1, s * .6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * .6, -s * .1); ctx.lineTo(0, -s * .6); ctx.lineTo(s * .6, -s * .1); ctx.stroke(); if (kind === 'build2') { ctx.fillStyle = '#ffe45a'; ctx.fillRect(-s * .15, s * .1, s * .3, s * .3); } break;
      case 'cancel': ctx.strokeStyle = '#ff6060'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-s * .45, -s * .45); ctx.lineTo(s * .45, s * .45); ctx.moveTo(s * .45, -s * .45); ctx.lineTo(-s * .45, s * .45); ctx.stroke(); break;
      case 'rally': ctx.beginPath(); ctx.moveTo(-s * .3, s * .6); ctx.lineTo(-s * .3, -s * .6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * .3, -s * .6); ctx.lineTo(s * .5, -s * .35); ctx.lineTo(-s * .3, -s * .1); ctx.closePath(); ctx.fill(); break;
      case 'lift': ctx.beginPath(); ctx.moveTo(0, s * .5); ctx.lineTo(0, -s * .5); ctx.moveTo(-s * .35, -s * .15); ctx.lineTo(0, -s * .5); ctx.lineTo(s * .35, -s * .15); ctx.stroke(); break;
      case 'land': ctx.beginPath(); ctx.moveTo(0, -s * .5); ctx.lineTo(0, s * .5); ctx.moveTo(-s * .35, s * .15); ctx.lineTo(0, s * .5); ctx.lineTo(s * .35, s * .15); ctx.stroke(); break;
      case 'unload': ctx.beginPath(); ctx.rect(-s * .5, -s * .2, s, s * .6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -s * .1); ctx.lineTo(0, -s * .65); ctx.moveTo(-s * .25, -s * .4); ctx.lineTo(0, -s * .65); ctx.lineTo(s * .25, -s * .4); ctx.stroke(); break;
      default: ctx.beginPath(); ctx.arc(0, 0, s * .4, 0, 7); ctx.stroke();
    } ctx.restore(); },
  resIcon(ctx, kind, x, y) { ctx.save(); ctx.translate(x, y); if (kind === 'min') { const g = ctx.createLinearGradient(-6, -8, 6, 6); g.addColorStop(0, '#e6fbff'); g.addColorStop(0.5, '#5fd0ff'); g.addColorStop(1, '#1a6a9a'); ctx.fillStyle = g; ctx.strokeStyle = '#0b3a55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7, 6); ctx.lineTo(-4, -7); ctx.lineTo(3, -4); ctx.lineTo(7, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); } else if (kind === 'gas') { const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8); g.addColorStop(0, '#c8ffb0'); g.addColorStop(1, '#2a7a3a'); ctx.fillStyle = g; ctx.strokeStyle = '#123a1a'; ctx.beginPath(); ctx.ellipse(0, 1, 8, 6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(200,255,180,0.7)'; ctx.beginPath(); ctx.arc(2, -6, 2.5, 0, 7); ctx.fill(); } else { const r = G.players[G.human].race; ctx.strokeStyle = '#e8ecf0'; ctx.fillStyle = '#e8ecf0'; ctx.lineWidth = 1.5; if (r === 'T') { ctx.beginPath(); ctx.arc(0, -3, 4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-6, 7); ctx.lineTo(-4, 1); ctx.lineTo(4, 1); ctx.lineTo(6, 7); ctx.closePath(); ctx.fill(); } else if (r === 'Z') { ctx.beginPath(); ctx.ellipse(0, 0, 5, 7, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#6a3a7a'; ctx.beginPath(); ctx.ellipse(0, 0, 2.5, 4, 0, 0, 7); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 0); ctx.lineTo(0, 8); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#62d4ff'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(2.5, 0); ctx.lineTo(0, 4); ctx.lineTo(-2.5, 0); ctx.closePath(); ctx.fill(); } } ctx.restore(); },
};

Object.assign(UI, {
  miniRect() { return { x: 12, y: Render.H - this.consoleH + 10, s: this.consoleH - 22 }; },
  // The card shrinks with the console so a short window still shows all nine slots and the click boxes stay on them.
  // 4 wide, 3 tall. The buttons shrink a little so a twelve-slot card is no wider on screen than the
  // nine-slot one was -- the console is the same height and the unit panel beside it keeps its room.
  cardRect() { const ch = this.consoleH, k = Math.min(1, (ch - 16) / 182); const bw = Math.round(54 * k), bh = Math.round(54 * k), gap = Math.max(2, Math.round(4 * k)); const w = UI.CARD_COLS * (bw + gap) + 8, h = UI.CARD_ROWS * (bh + gap) + 8; return { x: Render.W - w - 12, y: Render.H - ch + 8, w, h, bw, bh, gap, k }; },
  drawConsole() {
    const ctx = Render.ctx, W = Render.W, H = Render.H, ch = this.consoleH, y0 = H - ch; const p = G.players[G.human];
    const sk = HUD.skin();
    HUD.frame(ctx, 0, y0, W, ch);
    // ---- minimap ----
    const mr = this.miniRect(); HUD.inset(ctx, mr.x - 3, mr.y - 3, mr.s + 6, mr.s + 6);
    if (Render.mini) { ctx.imageSmoothingEnabled = false; ctx.drawImage(Render.mini, mr.x, mr.y, mr.s, mr.s); ctx.imageSmoothingEnabled = true; }
    const sc = mr.s / (G.map.w * TILE); const vis = UI.viewAll ? G.allVis() : p.vis;
    ctx.fillStyle = 'rgba(96,40,120,0.6)'; const m = G.map; for (let ty = 0; ty < m.h; ty += 2) for (let tx = 0; tx < m.w; tx += 2) if (m.creep[m.idx(tx, ty)] && vis[ty * m.w + tx]) ctx.fillRect(mr.x + tx * mr.s / m.w, mr.y + ty * mr.s / m.h, 2 * mr.s / m.w + .5, 2 * mr.s / m.h + .5);
    if (Render.fogCanvas) { ctx.globalAlpha = 0.85; ctx.imageSmoothingEnabled = false; ctx.drawImage(Render.fogCanvas, mr.x, mr.y, mr.s, mr.s); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1; }
    for (const r of m.resources) { if (vis[r.y * m.w + r.x] === 0) continue; ctx.fillStyle = r.type === 'mineral' ? '#6fe0ff' : '#7ee07a'; ctx.fillRect(mr.x + r.x * sc * TILE, mr.y + r.y * sc * TILE, Math.max(2, r.w * sc * TILE), Math.max(1.5, r.h * sc * TILE)); }
    for (const u of G.units) { if (!u.alive || u.inside || u.def.larva || u.def.notUnit) continue; if (u.owner !== G.human && !G.canSee(G.human, u) && !(u.isBuilding && G.explored(G.human, Math.floor(u.x / TILE), Math.floor(u.y / TILE)))) continue; ctx.fillStyle = u.owner === G.human ? '#3fe83f' : G.players[u.owner].color; const s = u.isBuilding ? Math.max(3, u.def.w * TILE * sc) : 2.5; ctx.fillRect(mr.x + u.x * sc - s / 2, mr.y + u.y * sc - s / 2, s, s); }
    // Sensor Tower contacts (FIXLIST-M14 C2), AFTER the fog and after the units. A blip is something
    // you know about ground you cannot see, so painting it under the fog would hide the one thing it
    // exists to tell you. Drawn as a hollow amber ring and never in a player's colour: a contact has no
    // owner as far as you are concerned, and a coloured dot would be claiming to know whose it is.
    { const cs = G.contacts(G.human);
      if (cs.length) { ctx.strokeStyle = 'rgba(255,190,60,0.9)'; ctx.lineWidth = 1;
        for (const c of cs) { ctx.beginPath(); ctx.arc(mr.x + c.x * sc, mr.y + c.y * sc, 2.2, 0, 7); ctx.stroke(); } } }
    for (const pg of this.pings) { ctx.strokeStyle = `rgba(255,60,60,${pg.t / 90})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mr.x + pg.x * sc, mr.y + pg.y * sc, 4 + (90 - pg.t) % 30 / 3, 0, 7); ctx.stroke(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(mr.x + Render.camX * sc + .5, mr.y + Render.camY * sc + .5, Render.viewWorldW() * sc, Render.viewWorldH() * sc);   // world units, so the box tracks the zoom
    // ---- unit panel ----
    this.hotspots = []; const cr = this.cardRect();
    const ix = mr.x + mr.s + 18, iw = cr.x - ix - 14; HUD.inset(ctx, ix, y0 + 8, iw, ch - 16);
    const sel = this.selection;
    // B1: a selected mineral patch or geyser gets the panel a unit would get. It is checked FIRST but
    // it can only be set when `selection` is empty (UI.select clears it), so the two never contend.
    if (this.selRes) this.drawResourceInfo(ctx, this.selRes, ix, y0 + 8, iw, ch - 16);
    else if (sel.length === 1) this.drawUnitInfo(ctx, sel[0], ix, y0 + 8, iw, ch - 16);
    else if (sel.length > 1) { const cols = Math.min(6, Math.floor((iw - 16) / 46)); sel.forEach((u, i) => { const bx = ix + 10 + (i % cols) * 46, by = y0 + 16 + Math.floor(i / cols) * 58; HUD.bevel(ctx, bx, by, 42, 52, true, sk.slot); const hr = u.hp / u.maxHp; const tint = hr > .66 ? 'rgba(60,230,60,0.8)' : hr > .33 ? 'rgba(240,220,60,0.8)' : 'rgba(255,60,60,0.8)'; ctx.drawImage(Sprites.tinted(u.def.id, G.players[u.owner].color, 36, tint), bx + 3, by + 3); if (u.maxSh) { ctx.fillStyle = '#5aa8ff'; ctx.fillRect(bx + 3, by + 42, 36 * u.sh / u.maxSh, 2); } ctx.fillStyle = hr > .66 ? '#3fe83f' : hr > .33 ? '#f0e040' : '#ff3c3c'; ctx.fillRect(bx + 3, by + 46, 36 * hr, 3); this.hotspots.push({ x: bx, y: by, w: 42, h: 52, fn: () => { if (this.keys.Shift) this.selection = this.selection.filter(v => v !== u); else this.select([u]); } }); }); }
    // The console's own condition, said out loud in the one place there is room for it. A HUD that
    // degrades and never says why is atmosphere; a HUD that names the thing degrading is a readout,
    // and the word it uses is the third thing (after the material and the damage) that says which
    // race's machine you are sitting at.
    else { const cd = HUD.condition(); HUD.text(ctx, RACE_INFO[p.race].name + ' Command', ix + 12, y0 + 30, HUD.accent(), 13); HUD.text(ctx, 'F1 help  ·  F10 menu  ·  F5 save  ·  Enter chat  ·  speed ' + this.speedName() + ' (+/-)  ·  ' + this.fps + ' fps', ix + 12, y0 + 50, '#8a93a0', 11, false); HUD.text(ctx, 'Seed ' + G.map.seed + '   Frame ' + G.frame + '   ' + HUD.INTEGRITY[p.race] + ' ' + Math.round(cd.v * 100) + '%', ix + 12, y0 + 68, cd.v < 0.5 ? '#c98a6a' : '#8a93a0', 11, false); }
    // ---- command card ----
    HUD.inset(ctx, cr.x, cr.y, cr.w, cr.h);
    const btns = this.currentCard(); this.tooltip = null;
    for (const b of btns) {
      const bx = cr.x + 4 + (b.slot % UI.CARD_COLS) * (cr.bw + cr.gap), by = cr.y + 4 + Math.floor(b.slot / UI.CARD_COLS) * (cr.bh + cr.gap);
      const hov = this.mouse.x >= bx && this.mouse.x < bx + cr.bw && this.mouse.y >= by && this.mouse.y < by + cr.bh;
      const active = this.pending && ((this.pending.kind === 'ability' && b.label === (DATA.abilities[this.pending.abil] || {}).name) || (this.pending.kind !== 'ability' && b.label.toLowerCase().startsWith(this.pending.kind)));
      HUD.bevel(ctx, bx, by, cr.bw, cr.bh, !active, active ? '#2f4a2f' : hov ? sk.btnHov : b.dim ? sk.btnDim : sk.btn);
      // icon
      const defId = b.cost && b.cost.id && DATA.all[b.cost.id] ? b.cost.id : null; const gl = HUD.iconFor(b);
      ctx.save(); if (b.dim) ctx.globalAlpha = 0.4;
      const ik = Math.round(32 * cr.k);
      if (defId) ctx.drawImage(Sprites.icon(defId, G.players[G.human].color, ik), bx + cr.bw / 2 - ik / 2, by + Math.round(3 * cr.k));
      else if (gl) HUD.glyph(ctx, gl, bx + cr.bw / 2, by + Math.round(18 * cr.k), Math.round(14 * cr.k), '#cfd6de');
      else { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(bx + cr.bw / 2, by + Math.round(18 * cr.k), 1, bx + cr.bw / 2, by + Math.round(18 * cr.k), 14 * cr.k); g.addColorStop(0, b.energy ? 'rgba(200,120,255,0.9)' : 'rgba(255,200,80,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx + cr.bw / 2, by + Math.round(18 * cr.k), 14 * cr.k, 0, 7); ctx.fill(); ctx.restore(); }
      ctx.restore();
      HUD.hotLabel(ctx, b.label, this.gridKeys ? '' : b.hk, bx, by + cr.bh - Math.round(10 * cr.k), cr.bw, b.dim ? '#7a828c' : '#e6eaf0', Math.max(8, Math.round(10 * cr.k))); if (this.gridKeys && b.hk !== 'Escape') { ctx.font = HUD.font(9); ctx.fillStyle = '#ffe45a'; ctx.fillText(b.hk, bx + 3, by + 10); }
      if (b.hk === 'Escape') { ctx.font = HUD.font(8); ctx.fillStyle = '#ffe45a'; ctx.fillText('ESC', bx + cr.bw - 20, by + 10); }
      if (hov && (b.cost || b.energy)) { const parts = [b.label]; if (b.cost && b.cost.min !== undefined) { parts.push(b.cost.min + ' minerals'); if (b.cost.gas) parts.push(b.cost.gas + ' gas'); if (b.cost.sup) parts.push(b.cost.sup + ' supply'); if (b.cost.time) parts.push(Math.round(b.cost.time / TPS) + 's'); } if (b.energy) parts.push(b.energy + ' energy'); this.tooltip = { lines: parts, desc: (b.cost && b.cost.desc) || null, x: bx, y: by }; }
    }
    // The description hangs below the cost lines and is kept in its own field rather than pushed onto
    // `lines`, because the cost lines are coloured by SEARCHING THEM for the words "minerals", "gas"
    // and "energy" -- and a Refinery whose description says "so SCVs can harvest gas" would be tinted
    // green as though the sentence were a price. It wraps to a fixed column so a two-sentence def
    // cannot stretch the popup across the screen.
    if (this.tooltip) { const t = this.tooltip; ctx.font = HUD.font(11); const dl = t.desc ? HUD.wrapLines(ctx, t.desc, UI.TIP_W, 10) : []; ctx.font = HUD.font(11); const cw = Math.max(...t.lines.map(l => ctx.measureText(l).width)); ctx.font = HUD.font(10, false); const dw = dl.length ? Math.max(...dl.map(l => ctx.measureText(l).width)) : 0; const tw = Math.max(cw, dw) + 16, th = t.lines.length * 15 + dl.length * 13 + (dl.length ? 6 : 0) + 8; const tx = Math.min(t.x, Render.W - tw - 4), ty = t.y - th - 6; HUD.bevel(ctx, tx, ty, tw, th, true, 'rgba(10,12,16,0.95)'); t.lines.forEach((l, i) => HUD.text(ctx, l, tx + 8, ty + 15 + i * 15, i ? (l.includes('minerals') ? '#6fe0ff' : l.includes('gas') ? '#7ee07a' : l.includes('energy') ? '#c86aff' : '#c8d0d8') : '#ffe45a', 11, i === 0)); dl.forEach((l, i) => HUD.text(ctx, l, tx + 8, ty + t.lines.length * 15 + 12 + i * 13, '#9aa4b0', 10, false)); }
    // LAST, and only over the console band. The glitch tears what is already on the glass, so it has
    // to run after everything that draws on it -- and it is confined to the console rather than the
    // whole window because the cursor and the world are not part of the commander's hardware. Tearing
    // the cursor was tried once and it makes the game feel broken rather than the console.
    HUD.glitchDraw(ctx, 0, y0, W, ch);
  },
  // FIXLIST-M14 B1: what is left in a patch or a geyser. Deliberately shaped like drawUnitInfo -- the
  // same inset, the same portrait socket, the same name-then-facts column -- because a player clicking
  // a patch is asking the console the same kind of question they ask of a unit, and an answer that
  // looked different would read as a different screen rather than the same one.
  //
  // Never called for unexplored ground: UI.resourceAt refuses to return a resource the player has not
  // explored, so a patch nobody has walked past cannot be clicked and cannot be reported.
  drawResourceInfo(ctx, r, x, y, w, h) {
    const sk = HUD.skin(); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const gas = r.type === 'geyser';
    HUD.bevel(ctx, x + 8, y + 8, 80, 80, false, sk.ink);
    const g = ctx.createRadialGradient(x + 48, y + 48, 4, x + 48, y + 48, 44);
    g.addColorStop(0, sk.hi); g.addColorStop(1, sk.ink); ctx.fillStyle = g; ctx.fillRect(x + 9, y + 9, 78, 78);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 9, y + 9, 78, 78); ctx.clip(); ctx.translate(x + 48, y + 52);
    try { const s = Render.resourceSprite(gas ? 'gas' : 'mineral', gas ? (r.amount > 0 ? 1 : 0) : Math.max(0, Math.min(5, Math.round(r.amount / 1500 * 5)))); const k = Math.min(66 / s.W, 66 / s.H); ctx.scale(k, k); ctx.drawImage(s.cv, -s.W / 2, -s.H / 2); } catch (e) { }
    ctx.restore(); ctx.fillStyle = 'rgba(255,255,255,0.04)'; for (let i = 0; i < 78; i += 3) ctx.fillRect(x + 9, y + 9 + i, 78, 1);
    let ly = y + 24; const tx = x + 100;
    const line = (s, col = '#c8d0d8', sz = 11, bold = false) => { HUD.text(ctx, s, tx, ly, col, sz, bold); ly += 14; };
    HUD.text(ctx, gas ? 'Vespene Geyser' : 'Mineral Field', tx, ly, gas ? '#7ee07a' : '#6fe0ff', 14); ly += 18;
    const amt = Math.max(0, Math.round(r.amount));
    line((gas ? 'Vespene remaining ' : 'Minerals remaining ') + amt, gas ? '#7ee07a' : '#6fe0ff', 12, true);
    // `start` is on mineral patches and not on geysers, so the share is only offered where it is real.
    if (r.start) line('of ' + r.start + '  (' + Math.round(100 * r.amount / r.start) + '%)', '#9aa4b0');
    if (amt === 0) line(gas ? 'Depleted -- it still yields a trickle.' : 'Mined out.', '#c98a6a');
    if (gas) { const b = r.building; line(b && b.alive ? (b.done ? b.def.name + ' built here' : b.def.name + ' under construction') : 'No refinery on it', '#9aa4b0'); }
    else if (r.miner) line('Being mined', '#9aa4b0');
    ctx.restore();
  },
  drawUnitInfo(ctx, u, x, y, w, h) {
    const p = G.players[u.owner], sk = HUD.skin(); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    // portrait. The backlight behind it is the console's own material, so a Zerg wireframe sits in a
    // fleshy socket and a Protoss one in lit stone rather than all three in the same blue tube.
    HUD.bevel(ctx, x + 8, y + 8, 80, 80, false, sk.ink); const g = ctx.createRadialGradient(x + 48, y + 48, 4, x + 48, y + 48, 44); g.addColorStop(0, sk.hi); g.addColorStop(1, sk.ink); ctx.fillStyle = g; ctx.fillRect(x + 9, y + 9, 78, 78);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 9, y + 9, 78, 78); ctx.clip(); ctx.translate(x + 48, y + 50 + Math.sin(G.frame * 0.05) * 1.5);
    if (u.isBuilding) { const s = Sprites.building(u); const k = Math.min(72 / s.cv.width, 72 / s.cv.height) * 1.05; ctx.scale(k, k); ctx.drawImage(s.cv, -s.cv.width / 2, -s.cv.height / 2 + 4); }
    else { const s = Sprites.unit(u, Sprites.dirOf(-Math.PI / 2 + Math.sin(G.frame * 0.02) * 0.5, u), Render.animOf(u)); const k = Math.min(2.4, 36 / u.r); ctx.scale(k, k); Sprites.draw(ctx, s, 0, 0); }
    ctx.restore(); ctx.fillStyle = 'rgba(255,255,255,0.04)'; for (let i = 0; i < 78; i += 3) ctx.fillRect(x + 9, y + 9 + i, 78, 1);
    // name + stats
    let ly = y + 24; const tx = x + 100; HUD.text(ctx, u.def.name + (u.halluc ? ' (Hallucination)' : ''), tx, ly, u.owner === G.human ? HUD.accent() : p.color, 14); ly += 16;
    const line = (s, col = '#c8d0d8') => { HUD.text(ctx, s, tx, ly, col, 11, false); ly += 14; };
    let stats = `HP ${Math.ceil(u.hp)}/${u.maxHp}`; if (u.maxSh) stats += `   Shields ${Math.ceil(u.sh)}/${u.maxSh}`; if (u.maxEnergy) stats += `   Energy ${Math.floor(u.energy)}/${u.maxEnergy}`; line(stats);
    if (!u.isBuilding || u.def.gw || u.def.aw) { const parts = []; const wpn = u.sieged ? SIEGE_W : u.def.gw; if (wpn) parts.push(`Ground ${u.wDmg(wpn)}${wpn.hits > 1 ? 'x' + wpn.hits : ''} (${wpn.type[0].toUpperCase()}) range ${u.wRange(wpn)}`); if (u.def.aw) parts.push(`Air ${u.wDmg(u.def.aw)}${u.def.aw.hits > 1 ? 'x' + u.def.aw.hits : ''} range ${u.wRange(u.def.aw)}`); parts.push(`Armor ${u.armor}`); if (u.kills) parts.push(`Kills ${u.kills}`); line(parts.join('   ')); }
    if (u.owner === G.human) {
      const st = { idle: 'Idle', move: 'Moving', attack: 'Attacking', attackmove: 'Attack-moving', gather: u.order.phase === 'mine' ? 'Mining' : u.order.phase === 'inside' ? 'Harvesting gas' : 'Moving to resource', return: 'Returning cargo', build: 'Moving to build', construct: 'Constructing', hold: 'Holding position', patrol: 'Patrolling', ability: 'Casting ' + (u.order.abil ? DATA.abilities[u.order.abil].name : ''), repair: 'Repairing', follow: 'Following', load: 'Boarding', unload: 'Unloading', merge: 'Merging', land: 'Landing' }[u.order.type] || u.order.type;
      if (!u.isBuilding) line(st + (u.mines ? `   Mines ${u.mines}` : '') + (u.def.scarabs !== undefined ? `   Scarabs ${u.scarabs}` : '') + (u.def.interceptors !== undefined ? `   Interceptors ${u.interceptors}` : ''), '#9aa4b0');
      // The second half of making the arming delay visible (FIXLIST-M14 A3); the first is the light on
      // the mound in js/render.js. Own units only -- knowing whether an ENEMY mine has finished arming
      // is exactly the information the delay exists to withhold.
      if (u.def.dig && u.burrowed) line(u.digT > 0 ? `Arming   ${(u.digT / TPS).toFixed(1)}s` : 'Armed', u.digT > 0 ? '#ffb020' : '#ff6a5a');
      if (u.isBuilding && u.def.spawnsLarva) line(`Larvae ${u.larvae.length}`, '#9aa4b0');
      // B1, the third reported item: clicking a built Refinery / Extractor / Assimilator answers the
      // same question clicking the geyser under it does, in the same place.
      if (u.isBuilding && u.def.onGeyser && u.geyser) line(`Vespene remaining ${Math.max(0, Math.round(u.geyser.amount))}`, u.geyser.amount > 0 ? '#7ee07a' : '#c98a6a');
      if (u.isBuilding && !u.done) line(`Constructing ${Math.floor(100 * u.progress / u.def.time)}%` + (u.def.race === 'T' && !(u.builder && u.builder.alive && u.builder.order.target === u) ? '  (no SCV)' : ''), '#ffe45a');
      if (u.isBuilding && u.addon) line(`Add-on: ${u.addon.def.name}${u.addon.done ? '' : ' (building)'}`, '#9aa4b0');
      if (u.prod.length) { const qx = tx, qy = ly + 2; u.prod.forEach((it, i) => { const name = it.kind === 'unit' ? DATA.units[it.id].name : it.kind === 'upg' ? DATA.upgrades[it.id].name + ' L' + it.level : it.kind === 'tech' ? DATA.techs[it.id].name : DATA.buildings[it.id].name; const bx = qx + i * 50; HUD.bevel(ctx, bx, qy, 46, 40, true, sk.slot); if (it.kind === 'unit' || it.kind === 'morph') ctx.drawImage(Sprites.icon(it.id, p.color, 28), bx + 9, qy + 2); else { ctx.font = HUD.font(8); ctx.fillStyle = '#cfd6de'; ctx.fillText(name.slice(0, 9), bx + 3, qy + 18); } if (i === 0) { ctx.fillStyle = '#000'; ctx.fillRect(bx + 3, qy + 32, 40, 5); ctx.fillStyle = '#3fe83f'; ctx.fillRect(bx + 3, qy + 32, 40 * it.progress / it.total, 5); } this.hotspots.push({ x: bx, y: qy, w: 46, h: 40, fn: () => G.cancelProd(u, i) }); }); if (u.prod[0]) { const it = u.prod[0]; const name = it.kind === 'unit' ? DATA.units[it.id].name : it.kind === 'upg' ? DATA.upgrades[it.id].name + ' ' + it.level : it.kind === 'tech' ? DATA.techs[it.id].name : DATA.buildings[it.id].name; HUD.text(ctx, name, tx + u.prod.length * 50 + 6, qy + 26, '#ffe45a', 11); } ly += 46; }
      if (u.cargo.length) { u.cargo.forEach((c, i) => { const bx = tx + i * 34, by = ly + 2; HUD.bevel(ctx, bx, by, 30, 30, true, sk.slot); ctx.drawImage(Sprites.icon(c.def.id, p.color, 26), bx + 2, by + 2); this.hotspots.push({ x: bx, y: by, w: 30, h: 30, fn: () => G.unloadCargo(u, c) }); }); ly += 36; }
      if (u.def.upgA && !u.isBuilding) { const parts = []; if (p.upgLevel(u.def.upgA)) parts.push(`Armor +${p.upgLevel(u.def.upgA)}`); const wpn = u.def.gw || u.def.aw; if (wpn && wpn.upgKey && p.upgLevel(wpn.upgKey)) parts.push(`Weapons +${p.upgLevel(wpn.upgKey)}`); if (u.maxSh && p.upgLevel('shields')) parts.push(`Shields +${p.upgLevel('shields')}`); if (parts.length) line(parts.join('  '), '#9fb8d8'); }
    } else line(p.name, p.color);
    ctx.restore();
  },
  drawTop() {
    const ctx = Render.ctx, p = G.players[G.human];
    const items = [['min', Math.floor(p.minerals), '#dff6ff'], ['gas', Math.floor(p.gas), '#d6f5d0'], ['sup', `${Math.ceil(p.supUsed)}/${p.supMax}`, p.supUsed > p.supMax ? '#ff6a6a' : '#f0f2f4']];
    let x = Render.W - 14; ctx.font = HUD.font(14);
    for (let i = items.length - 1; i >= 0; i--) { const [k, v, col] = items[i]; const tw = ctx.measureText(String(v)).width + 40; HUD.bevel(ctx, x - tw, 6, tw, 24, true, 'rgba(12,15,20,0.85)'); HUD.resIcon(ctx, k, x - tw + 14, 18); HUD.text(ctx, String(v), x - 8, 23, col, 14, true, 'right'); x -= tw + 6; }
    // Caps and letterspacing on the clock/faction plate. This is the one piece of running text on
    // screen at all times, so it is where the typography actually registers.
    const t = Math.floor(G.frame / TPS); HUD.bevel(ctx, 8, 6, 178, 24, true, 'rgba(12,15,20,0.85)');
    const label = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}   ${HUD.caps(RACE_INFO[p.race].name)}` + (G.paused ? '   PAUSED' : '');
    ctx.font = HUD.font(12); ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) HUD.spaced(ctx, label, 16 + dx, 23 + dy, 1.1);
    ctx.fillStyle = G.paused ? '#ffe45a' : '#e6eaf0'; HUD.spaced(ctx, label, 16, 23, 1.1);
    if (this.mode === 'replay') HUD.text(ctx, 'REPLAY  ' + this.speedName() + '  (+/- speed, Ctrl+V perspective, F10 menu)', Render.W / 2, 23, '#ffe45a', 13, true, 'center');
    if (G.mission && !G.mission.done) { const d = G.mission.def; const left = d.minutes ? Math.max(0, d.minutes * 60 - Math.floor((G.frame - G.mission.start) / TPS)) : 0; HUD.text(ctx, 'Objective: ' + d.objective + (d.minutes ? `   ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : ''), 16, 66, '#ffe45a', 12); }
    if (this.net && Net.waitingSince && performance.now() - Net.waitingSince > 800) HUD.text(ctx, 'Waiting for other players...', Render.W / 2, 60, '#ffe45a', 14, true, 'center');
    if (this.net && Net.desynced) HUD.text(ctx, 'DESYNC DETECTED at ' + Net.clock(Net.desyncFrame) + ' — command log saved to a download; the game is no longer in sync', Render.W / 2, 84, '#ff5050', 14, true, 'center');
    if (this.net && !Net.connected && Net.active) HUD.text(ctx, 'Connection lost — leave with F10 and reconnect with the same name to rejoin', Render.W / 2, 108, '#ff5050', 14, true, 'center');
    if (this.pending) HUD.text(ctx, 'Select target: ' + (this.pending.kind === 'ability' ? DATA.abilities[this.pending.abil].name : this.pending.kind) + '  (right-click to cancel)', 16, 48, '#ffe45a', 12);
    if (this.showHelp) this.drawHelp(ctx);
  },
  drawMessages() {
    const ctx = Render.ctx, p = G.players[G.human];
    let y = Render.H - this.consoleH - 14; for (let i = p.msgs.length - 1; i >= 0; i--) { const m = p.msgs[i]; const age = G.frame - m.t; if (age > 24 * 8) continue; const col = m.kind === 'error' ? '#ff8a8a' : m.kind === 'attack' || m.kind === 'nuke' ? '#ff5050' : '#ffe45a'; ctx.globalAlpha = age > 24 * 6 ? 1 - (age - 144) / 48 : 1; HUD.text(ctx, m.text, 14, y, col, 13); ctx.globalAlpha = 1; y -= 18; }
    if (this.chat !== null && this.chat !== undefined) { HUD.bevel(ctx, 10, Render.H - this.consoleH - 40, 420, 24, false, 'rgba(8,10,14,0.9)'); HUD.text(ctx, '> ' + this.chat + (G.frame % 24 < 12 ? '_' : ''), 16, Render.H - this.consoleH - 23, '#e6eaf0', 13); }
    if (this.loading) { const k = (G.frame - this.loading.start) / Math.max(1, this.loading.target - this.loading.start); HUD.bevel(ctx, Render.W / 2 - 160, Render.H / 2 - 30, 320, 60, true, 'rgba(10,12,16,0.95)'); HUD.text(ctx, (this.loading.label || 'Loading... re-simulating') + ' ' + Math.round(k * 100) + '%', Render.W / 2, Render.H / 2 - 6, '#ffe45a', 14, true, 'center'); ctx.fillStyle = '#3fe83f'; ctx.fillRect(Render.W / 2 - 140, Render.H / 2 + 6, 280 * k, 8); }
    this.drawCursor(ctx);
  },
  drawCursor(ctx) {
    const m = this.mouse; if (!m.inside && m.x === 0 && m.y === 0) return; const x = m.x, y = m.y; ctx.save();
    const overUnit = this.hover && y < Render.H - this.consoleH;
    if (this.pending && y < Render.H - this.consoleH) { const enemy = this.hover && this.hover.owner !== G.human; const col = this.pending.kind === 'attack' || enemy ? '#ff4040' : '#3fe83f'; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke(); ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 5, y + dy * 5); ctx.lineTo(x + dx * 14, y + dy * 14); } ctx.stroke(); }
    else if (overUnit) { const col = this.hover.owner === G.human ? '#3fe83f' : '#ff4040'; ctx.strokeStyle = col; ctx.lineWidth = 2; const s = 7; ctx.beginPath(); ctx.moveTo(x - s, y - s + 4); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + 4, y - s); ctx.moveTo(x + s - 4, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + 4); ctx.moveTo(x + s, y + s - 4); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - 4, y + s); ctx.moveTo(x - s + 4, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - 4); ctx.stroke(); }
    else { ctx.fillStyle = '#e9f5ea'; ctx.strokeStyle = '#0a2a10'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 11, y + 11); ctx.lineTo(x + 6, y + 11); ctx.lineTo(x + 9, y + 17); ctx.lineTo(x + 6, y + 18); ctx.lineTo(x + 3, y + 12); ctx.lineTo(x, y + 15); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#3fe83f'; ctx.beginPath(); ctx.moveTo(x + 2, y + 3); ctx.lineTo(x + 8, y + 9); ctx.lineTo(x + 5, y + 9); ctx.lineTo(x + 2, y + 11); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  },
  drawHelp(ctx) {
    const lines = ['CONTROLS', 'Left click / drag: select    Right click: smart command    Shift: queue / add to selection', 'Ctrl+click or double-click: select all of a type on screen', 'M move   S stop   A attack-move   P patrol   H hold   B build   V advanced build', 'Ctrl+1..9 assign group   1..9 select group   Shift+# add   F2-F8 (+Shift) camera saves', 'Esc: cancel / cancel construction or last queued item    Space: jump to last alert', 'Arrow keys or screen edge: scroll    Minimap: click to move, right-click to command', '+ / -: game speed    F9: pause    F10: menu    F1: toggle this help', 'Unit-specific hotkeys are the yellow letters on the command card.'];
    HUD.bevel(ctx, Render.W / 2 - 340, 60, 680, 20 * lines.length + 24, true, 'rgba(10,12,16,0.94)'); lines.forEach((l, i) => HUD.text(ctx, l, Render.W / 2 - 326, 86 + i * 20, i ? '#d0d6de' : '#ffe45a', 13, i === 0));
  },
  drawMenu() {
    const ctx = Render.ctx, m = this.menuItems();
    // Size the panel to its widest line instead of a fixed 440: mission briefings are long enough to be
    // clipped at both edges otherwise, and shrink the text if even the full window is not wide enough.
    ctx.font = '14px sans-serif';
    const widest = m.lines.reduce((n, l) => Math.max(n, ctx.measureText(l).width), 0);
    const w = clamp(Math.ceil(widest) + 80, 440, Render.W - 40);
    const fs = widest + 80 > w ? Math.max(10, Math.floor(14 * (w - 80) / widest)) : 14;
    const h = 130 + m.lines.length * 22 + m.items.length * 46, x = Render.W / 2 - w / 2, y = Render.H / 2 - h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, Render.W, Render.H); HUD.frame(ctx, x, y, w, h);
    HUD.text(ctx, m.title, Render.W / 2, y + 48, m.title === 'VICTORY' ? '#ffe45a' : m.title === 'DEFEAT' ? '#ff5050' : '#e6eaf0', 28, true, 'center');
    m.lines.forEach((l, i) => HUD.text(ctx, l, Render.W / 2, y + 80 + i * 22, '#c8d0d8', fs, false, 'center'));
    this.menuRects = []; m.items.forEach((it, i) => { const by = y + 96 + m.lines.length * 22 + i * 46; const hov = this.mouse.x >= x + 60 && this.mouse.x < x + w - 60 && this.mouse.y >= by && this.mouse.y < by + 38; HUD.bevel(ctx, x + 60, by, w - 120, 38, !hov, hov ? '#2f3a4c' : '#1e2530'); HUD.text(ctx, it[0], Render.W / 2, by + 25, '#e6eaf0', 15, true, 'center'); this.menuRects.push({ x: x + 60, y: by, w: w - 120, h: 38, fn: it[1] }); });
    this.drawCursor(ctx);
  },
});
